import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectedAccount, toWorkerPayoutUpdate } from "../_shared/stripe.ts";

interface RequestBody {
  worker_user_id?: string;
  stripe_connected_account_id?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { adminClient } = await requireAdminAuth(req);

    const body = (await req.json()) as RequestBody;
    const workerUserId = body.worker_user_id;
    const accountIdInput = body.stripe_connected_account_id;

    if (!workerUserId && !accountIdInput) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "Provide worker_user_id or stripe_connected_account_id",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let workerId = workerUserId || null;
    let stripeAccountId = accountIdInput || null;

    if (workerId) {
      const { data: payoutProfile, error: payoutProfileError } = await adminClient
        .from("worker_payout_profiles")
        .select("user_id, stripe_connected_account_id")
        .eq("user_id", workerId)
        .maybeSingle();

      if (payoutProfileError) {
        return new Response(JSON.stringify({
          error: "payout_profile_lookup_failed",
          message: payoutProfileError.message,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!payoutProfile?.stripe_connected_account_id) {
        return new Response(JSON.stringify({
          error: "missing_connected_account",
          message: "Worker has no Stripe connected account id",
        }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      stripeAccountId = payoutProfile.stripe_connected_account_id;
    }

    if (!workerId && stripeAccountId) {
      const { data: payoutProfile, error: payoutProfileError } = await adminClient
        .from("worker_payout_profiles")
        .select("user_id, stripe_connected_account_id")
        .eq("stripe_connected_account_id", stripeAccountId)
        .maybeSingle();

      if (payoutProfileError) {
        return new Response(JSON.stringify({
          error: "payout_profile_lookup_failed",
          message: payoutProfileError.message,
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!payoutProfile) {
        return new Response(JSON.stringify({
          error: "payout_profile_not_found",
          message: "No payout profile found for the given Stripe account id",
        }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      workerId = payoutProfile.user_id;
      stripeAccountId = payoutProfile.stripe_connected_account_id;
    }

    if (!workerId || !stripeAccountId) {
      return new Response(JSON.stringify({
        error: "invalid_state",
        message: "Unable to resolve worker and Stripe account",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const stripeAccount = await getConnectedAccount(stripeAccountId);
      const mapped = toWorkerPayoutUpdate(stripeAccount);

      const { error: upsertError } = await adminClient
        .from("worker_payout_profiles")
        .upsert({
          user_id: workerId,
          ...mapped,
          default_payment_source: "stripe_connect",
        }, { onConflict: "user_id" });

      if (upsertError) {
        return new Response(JSON.stringify({ error: "payout_profile_sync_failed", message: upsertError.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        worker_user_id: workerId,
        stripe_connected_account_id: stripeAccountId,
        payout_profile: mapped,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (stripeError) {
      return new Response(JSON.stringify({
        error: "stripe_sync_failed",
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
