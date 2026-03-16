import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

interface RequestBody {
  payment_id?: string;
  confirmation_note?: string | null;
  payment_source?: "manual_quickbooks" | "stripe_connect" | "venmo_manual";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdminAuth(req);
    const body = (await req.json()) as RequestBody;

    if (!body.payment_id) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "payment_id is required",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment, error: lookupError } = await adminClient
      .from("worker_payments")
      .select("id, status")
      .eq("id", body.payment_id)
      .maybeSingle();

    if (lookupError) {
      return new Response(JSON.stringify({ error: "payment_lookup_failed", message: lookupError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payment) {
      return new Response(JSON.stringify({ error: "payment_not_found", message: "Payment record not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.status === "paid") {
      return new Response(JSON.stringify({ error: "already_paid", message: "Payment is already marked as paid" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();
    const paidDate = nowIso.slice(0, 10);

    const { data: updatedRows, error: updateError } = await adminClient
      .from("worker_payments")
      .update({
        status: "paid",
        paid_at: nowIso,
        paid_date: paidDate,
        marked_paid_by: userId,
        payment_source: body.payment_source || "venmo_manual",
        confirmation_note: body.confirmation_note || null,
      })
      .eq("id", body.payment_id)
      .neq("status", "paid")
      .select("*");

    const updated = Array.isArray(updatedRows) ? updatedRows[0] : null;


    if (updateError) {
      return new Response(JSON.stringify({ error: "payment_update_failed", message: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: "already_paid", message: "Payment is already marked as paid" }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ worker_payment: updated }), {
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
