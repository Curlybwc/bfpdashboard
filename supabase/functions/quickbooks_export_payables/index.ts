import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getActiveConnection, qbApiFetch } from "../_shared/quickbooks.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adminClient } = await requireAdminAuth(req);

    const { batch_ids } = await req.json() as { batch_ids: string[] };
    if (!Array.isArray(batch_ids) || batch_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "bad_request", message: "batch_ids is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get active QB connection
    const conn = await getActiveConnection(adminClient);
    if (!conn) {
      return new Response(
        JSON.stringify({
          error: "no_connection",
          message: "No active QuickBooks connection. Please connect QuickBooks first.",
          results: batch_ids.map((id) => ({ batch_id: id, success: false, error: "No active QuickBooks connection" })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch QB settings (singleton row)
    const { data: qbSettings, error: settingsErr } = await adminClient
      .from("quickbooks_settings")
      .select("labor_expense_account_id, labor_expense_account_name")
      .limit(1)
      .maybeSingle();

    if (settingsErr) {
      return new Response(
        JSON.stringify({ error: "query_failed", message: settingsErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!qbSettings?.labor_expense_account_id) {
      return new Response(
        JSON.stringify({
          error: "missing_settings",
          message: "Configure a QuickBooks expense account in Payroll → QB Settings before exporting.",
          results: batch_ids.map((id) => ({
            batch_id: id,
            success: false,
            error: "Configure a QuickBooks expense account in Payroll → QB Settings before exporting.",
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch all requested batches
    const { data: batches, error: batchErr } = await adminClient
      .from("worker_payable_batches")
      .select("id, worker_user_id, project_id, period_start, period_end, total_amount, status")
      .in("id", batch_ids);

    if (batchErr) {
      return new Response(
        JSON.stringify({ error: "query_failed", message: batchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchMap = new Map((batches || []).map((b: any) => [b.id, b]));

    // Fetch vendor mappings for all workers in these batches
    const workerIds = [...new Set((batches || []).map((b: any) => b.worker_user_id))];
    const { data: vendorMappings } = await adminClient
      .from("quickbooks_vendor_mappings")
      .select("user_id, qb_vendor_id, qb_vendor_name")
      .in("user_id", workerIds);

    const vendorMap = new Map((vendorMappings || []).map((v: any) => [v.user_id, v]));

    // Fetch worker names for error messages
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", workerIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "Unknown"]));

    // Fetch project names and addresses for bill memo
    const projectIds = [...new Set((batches || []).filter((b: any) => b.project_id).map((b: any) => b.project_id))];
    const { data: projects } = projectIds.length > 0
      ? await adminClient.from("projects").select("id, name, address").in("id", projectIds)
      : { data: [] };
    const projectMap = new Map((projects || []).map((p: any) => [p.id, p]));

    // Fetch QB class mappings for all project IDs
    const { data: classMappings } = projectIds.length > 0
      ? await adminClient.from("quickbooks_class_mappings").select("project_id, qb_class_id, qb_class_name").in("project_id", projectIds)
      : { data: [] };
    const classMap = new Map((classMappings || []).map((c: any) => [c.project_id, c]));

    // Process each batch independently
    const results: { batch_id: string; success: boolean; qb_bill_id?: string; error?: string }[] = [];

    for (const batchId of batch_ids) {
      const batch = batchMap.get(batchId);

      if (!batch) {
        results.push({ batch_id: batchId, success: false, error: "Batch not found" });
        continue;
      }

      if (batch.status !== "draft") {
        results.push({ batch_id: batchId, success: false, error: `Batch is '${batch.status}', expected 'draft'` });
        continue;
      }

      // Check vendor mapping
      const vendor = vendorMap.get(batch.worker_user_id);
      if (!vendor) {
        const workerName = profileMap.get(batch.worker_user_id) || batch.worker_user_id;
        const errorMsg = `No QuickBooks vendor mapped for "${workerName}". Add a vendor mapping in QuickBooks Vendor Mappings before exporting.`;
        await adminClient
          .from("worker_payable_batches")
          .update({ qb_export_error: errorMsg })
          .eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        continue;
      }

      // Check class mapping (hard blocker)
      const classMapping = batch.project_id ? classMap.get(batch.project_id) : null;
      if (!classMapping) {
        const proj = batch.project_id ? projectMap.get(batch.project_id) : null;
        const projectLabel = proj?.name || batch.project_id || "Unknown project";
        const errorMsg = `No QuickBooks class mapped for project "${projectLabel}". Add a class mapping in QB Settings before exporting.`;
        await adminClient
          .from("worker_payable_batches")
          .update({ qb_export_error: errorMsg })
          .eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        continue;
      }

      // Build QB Bill payload
      const proj = batch.project_id ? projectMap.get(batch.project_id) : null;
      const projectName = proj?.name || "Project";
      const projectAddress = proj?.address || null;
      const description = `Payroll: ${batch.period_start} to ${batch.period_end} · ${projectAddress || projectName}`;

      const billPayload = {
        VendorRef: { value: vendor.qb_vendor_id, name: vendor.qb_vendor_name || undefined },
        Line: [
          {
            DetailType: "AccountBasedExpenseLineDetail",
            Amount: Number(batch.total_amount),
            Description: description,
            AccountBasedExpenseLineDetail: {
              AccountRef: {
                value: qbSettings.labor_expense_account_id,
                name: qbSettings.labor_expense_account_name || undefined,
              },
              ClassRef: {
                value: classMapping.qb_class_id,
                name: classMapping.qb_class_name || undefined,
              },
            },
          },
        ],
        PrivateNote: `Lovable Payroll Batch #${batchId.slice(0, 8)} · ${projectName}`,
      };

      const result = await qbApiFetch(conn, "POST", "/bill", billPayload);

      if (!result.ok) {
        const errorMsg = `QuickBooks API error (${result.status}): ${result.error || "Unknown error"}`;
        await adminClient
          .from("worker_payable_batches")
          .update({ qb_export_error: errorMsg })
          .eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        continue;
      }

      // Extract Bill ID and doc number from response
      const billData = result.data as any;
      const qbBillId = billData?.Bill?.Id || null;
      const qbDocNumber = billData?.Bill?.DocNumber || null;

      // Update batch with QB references and mark exported
      const { error: updateErr } = await adminClient
        .from("worker_payable_batches")
        .update({
          status: "exported",
          accounting_source: "quickbooks",
          qb_bill_id: qbBillId,
          qb_bill_doc_number: qbDocNumber,
          qb_exported_at: new Date().toISOString(),
          qb_export_error: null,
        })
        .eq("id", batchId);

      if (updateErr) {
        results.push({
          batch_id: batchId,
          success: false,
          error: `Bill created in QuickBooks (ID: ${qbBillId}) but failed to update local batch: ${updateErr.message}`,
        });
        continue;
      }

      results.push({ batch_id: batchId, success: true, qb_bill_id: qbBillId });
    }

    return new Response(
      JSON.stringify({ results }),
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
