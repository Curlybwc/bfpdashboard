import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch } from "../_shared/quickbooks.ts";

/**
 * Create a single QuickBooks Bill for an approved reimbursement request.
 * Mirrors the structure of quickbooks_export_payables but for reimbursements:
 * one bill per request, vendor = contractor, account = company-specific
 * reimbursement expense account, class = project class.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, adminClient } = await requireAdminAuth(req);
    const { reimbursement_id } = await req.json() as { reimbursement_id?: string };

    if (!reimbursement_id) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "reimbursement_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch reimbursement
    const { data: reimb, error: reimbErr } = await adminClient
      .from("reimbursement_requests")
      .select("*")
      .eq("id", reimbursement_id)
      .maybeSingle();

    if (reimbErr || !reimb) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Reimbursement not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Status gate
    if (reimb.status !== "approved") {
      return new Response(
        JSON.stringify({ error: "invalid_status", message: `Reimbursement is '${reimb.status}', must be 'approved' to export` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (reimb.qb_bill_id) {
      return new Response(
        JSON.stringify({ error: "already_exported", message: `Already has QB bill ${reimb.qb_bill_id}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validation gates
    if (!reimb.approved_amount || Number(reimb.approved_amount) <= 0) {
      return new Response(
        JSON.stringify({ error: "missing_approved_amount", message: "Approved amount is required before creating a QuickBooks bill." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!reimb.receipt_paths || reimb.receipt_paths.length === 0) {
      return new Response(
        JSON.stringify({ error: "missing_receipt", message: "A receipt is required before creating a QuickBooks bill." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve company_id (from reimbursement or project)
    let companyId: string | null = reimb.company_id;
    let projectName: string | null = null;
    let projectAddress: string | null = null;

    if (reimb.project_id) {
      const { data: project } = await adminClient
        .from("projects")
        .select("id, name, address, company_id")
        .eq("id", reimb.project_id)
        .maybeSingle();
      if (project) {
        projectName = project.name;
        projectAddress = project.address;
        if (!companyId) companyId = project.company_id;
      }
    }

    if (!companyId) {
      const errorMsg = "No company assigned. Set a company on the reimbursement or its project before exporting.";
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      return new Response(
        JSON.stringify({ error: "no_company", message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve reimbursed user (on_behalf_of_user_id falls back to submitter)
    const reimbursedUserId = reimb.on_behalf_of_user_id || reimb.submitter_user_id;

    const { data: profile } = await adminClient
      .from("profiles")
      .select("id, full_name, skip_qb_export")
      .eq("id", reimbursedUserId)
      .maybeSingle();

    if (profile?.skip_qb_export) {
      const errorMsg = `"${profile.full_name || "Contractor"}" is marked as Skip QB Export. Uncheck this flag in Admin → Users to enable export.`;
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      return new Response(
        JSON.stringify({ error: "skip_qb_export", message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Vendor mapping
    const { data: vendorMapping } = await adminClient
      .from("quickbooks_vendor_mappings")
      .select("qb_vendor_id, qb_vendor_name")
      .eq("user_id", reimbursedUserId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (!vendorMapping) {
      const errorMsg = `This contractor must be linked to a QuickBooks vendor for this company before a reimbursement bill can be created.`;
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      return new Response(
        JSON.stringify({ error: "no_vendor_mapping", message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Reimbursement expense account
    const { data: qbSettings } = await adminClient
      .from("quickbooks_settings")
      .select("qb_reimbursement_expense_account_id, qb_reimbursement_expense_account_name")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!qbSettings?.qb_reimbursement_expense_account_id) {
      const errorMsg = `Choose a reimbursement expense account for this QuickBooks company before creating reimbursement bills.`;
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      return new Response(
        JSON.stringify({ error: "no_reimbursement_account", message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Class mapping (required if project_id is present; otherwise warn but allow)
    let classId: string | null = null;
    let className: string | null = null;
    if (reimb.project_id) {
      const { data: classMapping } = await adminClient
        .from("quickbooks_class_mappings")
        .select("qb_class_id, qb_class_name")
        .eq("project_id", reimb.project_id)
        .maybeSingle();
      if (!classMapping) {
        const errorMsg = `This property must be mapped to a QuickBooks class before a reimbursement bill can be created.`;
        await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
        return new Response(
          JSON.stringify({ error: "no_class_mapping", message: errorMsg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      classId = classMapping.qb_class_id;
      className = classMapping.qb_class_name;
    }

    // Get QB connection
    const { conn, error: connErr } = await getConnectionForCompany(adminClient, companyId);
    if (!conn) {
      const errorMsg = connErr || "Cannot connect to QuickBooks for this company.";
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      return new Response(
        JSON.stringify({ error: "no_connection", message: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the bill
    const lineDescription = `Reimbursement: ${reimb.vendor_paid} on ${reimb.expense_date}` +
      (projectAddress ? ` · ${projectAddress}` : projectName ? ` · ${projectName}` : "");

    const lineDetail: any = {
      AccountRef: {
        value: qbSettings.qb_reimbursement_expense_account_id,
        name: qbSettings.qb_reimbursement_expense_account_name || undefined,
      },
    };
    if (classId) {
      lineDetail.ClassRef = { value: classId, name: className || undefined };
    }

    const billPayload: any = {
      VendorRef: { value: vendorMapping.qb_vendor_id, name: vendorMapping.qb_vendor_name || undefined },
      TxnDate: reimb.expense_date,
      Line: [{
        DetailType: "AccountBasedExpenseLineDetail",
        Amount: Number(reimb.approved_amount),
        Description: `${lineDescription} — ${reimb.description}`.slice(0, 999),
        AccountBasedExpenseLineDetail: lineDetail,
      }],
      PrivateNote: `Lovable Reimbursement #${reimbursement_id.slice(0, 8)} · ${reimb.vendor_paid} · ${reimb.expense_date}${projectName ? ` · ${projectName}` : ""}`,
    };

    const result = await qbApiFetch(conn, "POST", "/bill", billPayload);

    if (!result.ok) {
      const errorMsg = `QuickBooks API error (${result.status}): ${result.error || "Unknown error"}`;
      await adminClient.from("reimbursement_requests").update({ qb_export_error: errorMsg }).eq("id", reimbursement_id);
      await adminClient.from("activity_log").insert({
        actor_id: userId,
        action: "reimbursement_qb_export_failed",
        entity_type: "reimbursement_request",
        entity_id: reimbursement_id,
        project_id: reimb.project_id,
        description: errorMsg,
      });
      return new Response(
        JSON.stringify({ error: "qb_api_error", message: errorMsg }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const billData = result.data as any;
    const qbBillId = billData?.Bill?.Id || null;
    const qbDocNumber = billData?.Bill?.DocNumber || null;
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await adminClient
      .from("reimbursement_requests")
      .update({
        status: "exported",
        qb_bill_id: qbBillId,
        qb_bill_doc_number: qbDocNumber,
        qb_exported_at: nowIso,
        qb_export_error: null,
        company_id: companyId,
      })
      .eq("id", reimbursement_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({
          error: "local_update_failed",
          message: `Bill created in QuickBooks (ID: ${qbBillId}) but failed to update local record: ${updateErr.message}`,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await adminClient.from("activity_log").insert({
      actor_id: userId,
      action: "reimbursement_qb_export_succeeded",
      entity_type: "reimbursement_request",
      entity_id: reimbursement_id,
      project_id: reimb.project_id,
      description: `Created QB bill ${qbDocNumber || qbBillId}`,
      metadata: { qb_bill_id: qbBillId, qb_bill_doc_number: qbDocNumber, amount: reimb.approved_amount },
    });

    return new Response(
      JSON.stringify({ success: true, qb_bill_id: qbBillId, qb_bill_doc_number: qbDocNumber }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(
      JSON.stringify({ error: "internal", message: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});