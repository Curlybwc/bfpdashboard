import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { createAccountLink, createConnectedAccount, getConnectedAccount, toWorkerPayoutUpdate } from "../_shared/stripe.ts";

interface RequestBody {
  worker_user_id?: string;
  link_type?: "account_onboarding" | "account_update";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdminAuth(req);

    const body = (await req.json()) as RequestBody;
    const workerUserId = body.worker_user_id;
    const linkType = body.link_type || "account_onboarding";

    if (!workerUserId) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "worker_user_id is required",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (linkType !== "account_onboarding" && linkType !== "account_update") {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "link_type must be account_onboarding or account_update",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: worker, error: workerError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", workerUserId)
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

    const { data: payoutProfile, error: payoutProfileError } = await adminClient
      .from("worker_payout_profiles")
      .select("user_id, stripe_connected_account_id")
      .eq("user_id", workerUserId)
      .maybeSingle();

    if (payoutProfileError) {
      return new Response(JSON.stringify({ error: "payout_profile_lookup_failed", message: payoutProfileError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let stripeAccountId = payoutProfile?.stripe_connected_account_id || null;

    try {
      if (!stripeAccountId) {
        const account = await createConnectedAccount(workerUserId, null);
        stripeAccountId = account.id;

        const { error: upsertError } = await adminClient
          .from("worker_payout_profiles")
          .upsert({
            user_id: workerUserId,
            stripe_connected_account_id: stripeAccountId,
            default_payment_source: "stripe_connect",
          }, { onConflict: "user_id" });

        if (upsertError) {
          return new Response(JSON.stringify({ error: "payout_profile_upsert_failed", message: upsertError.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      const stripeAccount = await getConnectedAccount(stripeAccountId);
      const mapped = toWorkerPayoutUpdate(stripeAccount);

      const { error: syncError } = await adminClient
        .from("worker_payout_profiles")
        .upsert({
          user_id: workerUserId,
          ...mapped,
          default_payment_source: "stripe_connect",
        }, { onConflict: "user_id" });

      if (syncError) {
        return new Response(JSON.stringify({ error: "payout_profile_sync_failed", message: syncError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = await createAccountLink(stripeAccountId, linkType);

      return new Response(JSON.stringify({
        worker_user_id: workerUserId,
        stripe_connected_account_id: stripeAccountId,
        link_type: linkType,
        onboarding_url: url,
        payout_profile: mapped,
        requested_by: userId,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (stripeError) {
      return new Response(JSON.stringify({
        error: "stripe_operation_failed",
        message: stripeError instanceof Error ? stripeError.message : "Unexpected Stripe error",
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
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
