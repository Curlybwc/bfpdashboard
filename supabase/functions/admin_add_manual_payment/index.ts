import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

interface RequestBody {
  worker_user_id?: string;
  paid_date?: string;
  amount?: number;
  payment_source?: "manual_quickbooks" | "stripe_connect" | "venmo_manual";
  pay_period_start?: string | null;
  pay_period_end?: string | null;
  external_reference?: string | null;
  memo?: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdminAuth(req);
    const body = (await req.json()) as RequestBody;

    if (!body.worker_user_id || !body.paid_date || typeof body.amount !== "number") {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "worker_user_id, paid_date, and amount are required",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.amount <= 0) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "amount must be greater than 0",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentSource = body.payment_source || "manual_quickbooks";

    const { data: worker, error: workerError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", body.worker_user_id)
      .maybeSingle();

    if (workerError) {
      return new Response(JSON.stringify({ error: "worker_lookup_failed", message: workerError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!worker) {
      return new Response(JSON.stringify({ error: "worker_not_found", message: "Worker profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment, error: insertError } = await adminClient
      .from("worker_payments")
      .insert({
        worker_user_id: body.worker_user_id,
        payout_run_id: null,
        pay_period_start: body.pay_period_start || null,
        pay_period_end: body.pay_period_end || null,
        paid_date: body.paid_date,
        amount: Number(body.amount.toFixed(2)),
        payment_source: paymentSource,
        status: "paid",
        paid_at: new Date().toISOString(),
        marked_paid_by: userId,
        stripe_transfer_id: null,
        stripe_payout_id: null,
        stripe_balance_transaction_id: null,
        external_reference: body.external_reference || null,
        memo: body.memo || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: "manual_payment_insert_failed", message: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ worker_payment: payment }), {
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
