import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { createTransfer } from "../_shared/stripe.ts";

interface RequestBody {
  payout_run_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adminClient } = await requireAdminAuth(req);
    const body = (await req.json()) as RequestBody;

    if (!body.payout_run_id) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "payout_run_id is required",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: run, error: runError } = await adminClient
      .from("payout_runs")
      .select("*")
      .eq("id", body.payout_run_id)
      .maybeSingle();

    if (runError) {
      return new Response(JSON.stringify({ error: "run_lookup_failed", message: runError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!run) {
      return new Response(JSON.stringify({ error: "run_not_found", message: "Payout run not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (run.status !== "draft") {
      return new Response(JSON.stringify({
        error: "invalid_run_state",
        message: "Only draft payout runs can be submitted",
        status: run.status,
      }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payments, error: paymentsError } = await adminClient
      .from("worker_payments")
      .select("*")
      .eq("payout_run_id", run.id)
      .eq("status", "pending");

    if (paymentsError) {
      return new Response(JSON.stringify({ error: "payment_lookup_failed", message: paymentsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payments || payments.length === 0) {
      return new Response(JSON.stringify({
        error: "no_pending_payments",
        message: "No pending worker payments found for this run",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const workerIds = [...new Set(payments.map((p) => p.worker_user_id))];
    const { data: payoutProfiles, error: profilesError } = await adminClient
      .from("worker_payout_profiles")
      .select("*")
      .in("user_id", workerIds);

    if (profilesError) {
      return new Response(JSON.stringify({ error: "payout_profile_lookup_failed", message: profilesError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profileMap = new Map((payoutProfiles || []).map((profile) => [profile.user_id, profile]));

    const transferGroup = `payout_run_${run.id}`;
    let successCount = 0;
    let failedCount = 0;
    const results: Array<Record<string, string | number | null>> = [];

    for (const payment of payments) {
      const profile = profileMap.get(payment.worker_user_id);

      if (!profile?.stripe_connected_account_id || !profile.payouts_enabled) {
        failedCount += 1;
        const failureMemo = !profile?.stripe_connected_account_id
          ? "Worker is not connected to Stripe"
          : "Worker is not payout-ready in Stripe";

        await adminClient
          .from("worker_payments")
          .update({
            status: "failed",
            memo: payment.memo ? `${payment.memo} | ${failureMemo}` : failureMemo,
          })
          .eq("id", payment.id);

        results.push({
          payment_id: payment.id,
          worker_user_id: payment.worker_user_id,
          status: "failed",
          reason: failureMemo,
          stripe_transfer_id: null,
        });
        continue;
      }

      const amountCents = Math.round(Number(payment.amount) * 100);
      if (amountCents <= 0) {
        failedCount += 1;
        await adminClient
          .from("worker_payments")
          .update({ status: "failed", memo: "Invalid payment amount" })
          .eq("id", payment.id);

        results.push({
          payment_id: payment.id,
          worker_user_id: payment.worker_user_id,
          status: "failed",
          reason: "Invalid payment amount",
          stripe_transfer_id: null,
        });
        continue;
      }

      try {
        const transfer = await createTransfer({
          amountCents,
          destinationAccountId: profile.stripe_connected_account_id,
          transferGroup,
          description: `Payout run ${run.period_start} to ${run.period_end}`,
          metadata: {
            payout_run_id: run.id,
            worker_user_id: payment.worker_user_id,
            worker_payment_id: payment.id,
          },
        });

        const paidDate = new Date().toISOString().slice(0, 10);
        await adminClient
          .from("worker_payments")
          .update({
            status: "paid",
            paid_date: paidDate,
            stripe_transfer_id: transfer.id,
            stripe_balance_transaction_id: transfer.balance_transaction || null,
          })
          .eq("id", payment.id);

        successCount += 1;
        results.push({
          payment_id: payment.id,
          worker_user_id: payment.worker_user_id,
          status: "paid",
          stripe_transfer_id: transfer.id,
          amount: payment.amount,
        });
      } catch (transferError) {
        failedCount += 1;
        const transferMessage = transferError instanceof Error ? transferError.message : "Stripe transfer failed";

        await adminClient
          .from("worker_payments")
          .update({
            status: "failed",
            memo: payment.memo ? `${payment.memo} | ${transferMessage}` : transferMessage,
          })
          .eq("id", payment.id);

        results.push({
          payment_id: payment.id,
          worker_user_id: payment.worker_user_id,
          status: "failed",
          reason: transferMessage,
          stripe_transfer_id: null,
        });
      }
    }

    const runStatus = successCount === 0
      ? "failed"
      : failedCount === 0
        ? "submitted"
        : "partially_failed";

    const payoutDate = successCount > 0 ? new Date().toISOString().slice(0, 10) : null;

    const { data: updatedRun, error: runUpdateError } = await adminClient
      .from("payout_runs")
      .update({
        status: runStatus,
        submitted_at: new Date().toISOString(),
        payout_date: payoutDate,
      })
      .eq("id", run.id)
      .select("*")
      .single();

    if (runUpdateError) {
      return new Response(JSON.stringify({ error: "run_update_failed", message: runUpdateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      payout_run: updatedRun,
      summary: {
        total: payments.length,
        succeeded: successCount,
        failed: failedCount,
      },
      results,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;

    return new Response(JSON.stringify({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown server error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
