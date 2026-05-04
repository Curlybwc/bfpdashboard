import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";

interface RequestBody {
  reimbursement_id?: string;
  payment_date?: string;
  settlement_method?: string;
  external_reference?: string | null;
  confirmed?: boolean;
}

const ALLOWED_METHODS = ["QuickBooks", "Bank ACH", "Check", "Zelle", "Cash", "Other"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userId, adminClient } = await requireAdminAuth(req);
    const body = (await req.json()) as RequestBody;

    if (!body.reimbursement_id || !body.payment_date || !body.settlement_method) {
      return new Response(JSON.stringify({
        error: "invalid_request",
        message: "reimbursement_id, payment_date, and settlement_method are required",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!body.confirmed) {
      return new Response(JSON.stringify({
        error: "confirmation_required",
        message: "You must confirm payment was sent.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!ALLOWED_METHODS.includes(body.settlement_method)) {
      return new Response(JSON.stringify({
        error: "invalid_settlement_method",
        message: `settlement_method must be one of: ${ALLOWED_METHODS.join(", ")}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: reimb, error: lookupErr } = await adminClient
      .from("reimbursement_requests")
      .select("id, status, project_id")
      .eq("id", body.reimbursement_id)
      .maybeSingle();

    if (lookupErr || !reimb) {
      return new Response(JSON.stringify({ error: "not_found", message: "Reimbursement not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reimb.status === "paid") {
      return new Response(JSON.stringify({ error: "already_paid", message: "Already marked paid" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (reimb.status !== "exported") {
      return new Response(JSON.stringify({
        error: "invalid_status",
        message: `Reimbursement is '${reimb.status}', must be 'exported' to mark paid`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const nowIso = new Date().toISOString();
    const { data: updated, error: updateErr } = await adminClient
      .from("reimbursement_requests")
      .update({
        status: "paid",
        paid_at: nowIso,
        marked_paid_by: userId,
        settlement_method: body.settlement_method,
        external_reference: body.external_reference || null,
      })
      .eq("id", body.reimbursement_id)
      .neq("status", "paid")
      .select("*")
      .maybeSingle();

    if (updateErr) {
      return new Response(JSON.stringify({ error: "update_failed", message: updateErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!updated) {
      return new Response(JSON.stringify({ error: "already_paid", message: "Already marked paid" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient.from("activity_log").insert({
      actor_id: userId,
      action: "reimbursement_marked_paid",
      entity_type: "reimbursement_request",
      entity_id: body.reimbursement_id,
      project_id: reimb.project_id,
      description: `Marked paid via ${body.settlement_method}${body.external_reference ? ` (ref ${body.external_reference})` : ""}`,
      metadata: { settlement_method: body.settlement_method, payment_date: body.payment_date, external_reference: body.external_reference },
    });

    return new Response(JSON.stringify({ reimbursement: updated }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(JSON.stringify({
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown server error",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});