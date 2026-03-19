import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch, QBConnection } from "../_shared/quickbooks.ts";

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

    // Fetch all requested batches
    const { data: batches, error: batchErr } = await adminClient
      .from("worker_payable_batches")
      .select("id, worker_user_id, project_id, period_start, period_end, total_amount, status, company_id")
      .in("id", batch_ids);

    if (batchErr) {
      return new Response(
        JSON.stringify({ error: "query_failed", message: batchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const batchMap = new Map((batches || []).map((b: any) => [b.id, b]));

    // Resolve company_id for each batch (from batch or project)
    const projectIds = [...new Set((batches || []).filter((b: any) => b.project_id).map((b: any) => b.project_id))];
    const { data: projects } = projectIds.length > 0
      ? await adminClient.from("projects").select("id, name, address, company_id").in("id", projectIds)
      : { data: [] };
    const projectMap = new Map((projects || []).map((p: any) => [p.id, p]));

    // Resolve company for each batch
    const resolveCompanyId = (batch: any): string | null => {
      if (batch.company_id) return batch.company_id;
      if (batch.project_id) {
        const proj = projectMap.get(batch.project_id);
        return proj?.company_id || null;
      }
      return null;
    };

    // Collect all unique company IDs
    const companyIds = [...new Set((batches || []).map((b: any) => resolveCompanyId(b)).filter(Boolean))] as string[];

    // Fetch companies
    const { data: companies } = companyIds.length > 0
      ? await adminClient.from("companies").select("id, name, short_name, qb_connection_id").in("id", companyIds)
      : { data: [] };
    const companyMap = new Map((companies || []).map((c: any) => [c.id, c]));

    // Fetch QB connections for companies
    const connectionCache = new Map<string, QBConnection>();

    // Fetch worker profiles
    const workerIds = [...new Set((batches || []).map((b: any) => b.worker_user_id))];
    const { data: profiles } = await adminClient
      .from("profiles")
      .select("id, full_name")
      .in("id", workerIds);
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.full_name || "Unknown"]));

    // Pre-validate all batches and build grouped bill keys
    // Grouping key: company_id + qb_vendor_id + project_id + period_start + period_end
    type BillGroup = {
      companyId: string;
      qbVendorId: string;
      qbVendorName: string;
      projectId: string;
      periodStart: string;
      periodEnd: string;
      lines: { batch: any; projectName: string; projectAddress: string | null; classId: string | null; className: string | null; amount: number; description: string; workerName: string }[];
      batchIds: string[];
    };

    const billGroups = new Map<string, BillGroup>();
    const results: { batch_id: string; success: boolean; qb_bill_id?: string; error?: string; grouped_with?: string[] }[] = [];
    const failedBatchIds = new Set<string>();

    for (const batchId of batch_ids) {
      const batch = batchMap.get(batchId);

      if (!batch) {
        results.push({ batch_id: batchId, success: false, error: "Batch not found" });
        failedBatchIds.add(batchId);
        continue;
      }

      if (batch.status !== "draft") {
        results.push({ batch_id: batchId, success: false, error: `Batch is '${batch.status}', expected 'draft'` });
        failedBatchIds.add(batchId);
        continue;
      }

      // Hard-stop: project_id required for payroll bill creation
      if (!batch.project_id) {
        const errorMsg = "Batch has no project assigned. A project is required for payroll bill creation.";
        await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        failedBatchIds.add(batchId);
        continue;
      }

      // Hard-stop: company_id required
      const companyId = resolveCompanyId(batch);
      if (!companyId) {
        const errorMsg = batch.project_id
          ? `Project "${projectMap.get(batch.project_id)?.name || batch.project_id}" has no company assigned. Assign a company to the project before exporting.`
          : "Batch has no company_id and no project. Assign a company before exporting.";
        await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        failedBatchIds.add(batchId);
        continue;
      }

      const company = companyMap.get(companyId);
      if (!company?.qb_connection_id) {
        const errorMsg = `Company "${company?.name || companyId}" has no QuickBooks connection linked. Link a QuickBooks connection in settings.`;
        await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        failedBatchIds.add(batchId);
        continue;
      }

      // Resolve QB connection (cached)
      if (!connectionCache.has(companyId)) {
        const { conn, error: connErr } = await getConnectionForCompany(adminClient, companyId);
        if (!conn) {
          const errorMsg = connErr || `Cannot connect to QuickBooks for company "${company.name}".`;
          await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
          results.push({ batch_id: batchId, success: false, error: errorMsg });
          failedBatchIds.add(batchId);
          continue;
        }
        connectionCache.set(companyId, conn);
      }

      // Hard-stop: vendor mapping for this company
      const { data: vendorMapping } = await adminClient
        .from("quickbooks_vendor_mappings")
        .select("qb_vendor_id, qb_vendor_name")
        .eq("user_id", batch.worker_user_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!vendorMapping) {
        const workerName = profileMap.get(batch.worker_user_id) || batch.worker_user_id;
        const errorMsg = `No QuickBooks vendor mapped for "${workerName}" in company "${company.name}". Add a vendor mapping in QuickBooks Settings for this company.`;
        await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        failedBatchIds.add(batchId);
        continue;
      }

      // Hard-stop: QB settings (expense account) for this company
      const { data: qbSettings } = await adminClient
        .from("quickbooks_settings")
        .select("labor_expense_account_id, labor_expense_account_name")
        .eq("company_id", companyId)
        .maybeSingle();

      if (!qbSettings?.labor_expense_account_id) {
        const errorMsg = `No QuickBooks expense account configured for company "${company.name}". Set up the labor expense account in QuickBooks Settings.`;
        await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
        results.push({ batch_id: batchId, success: false, error: errorMsg });
        failedBatchIds.add(batchId);
        continue;
      }

      // Look up class mapping for this project (optional — no hard stop, but preserve if present)
      let classId: string | null = null;
      let className: string | null = null;
      if (batch.project_id) {
        const { data: classMapping } = await adminClient
          .from("quickbooks_class_mappings")
          .select("qb_class_id, qb_class_name")
          .eq("project_id", batch.project_id)
          .maybeSingle();
        if (classMapping) {
          classId = classMapping.qb_class_id;
          className = classMapping.qb_class_name;
        }
      }

      // Build grouping key — includes project for one-bill-per-project
      const groupKey = `${companyId}::${vendorMapping.qb_vendor_id}::${batch.project_id}::${batch.period_start}::${batch.period_end}`;

      const proj = batch.project_id ? projectMap.get(batch.project_id) : null;
      const projectName = proj?.name || "Project";
      const projectAddress = proj?.address || null;
      const workerName = profileMap.get(batch.worker_user_id) || "Unknown";
      const description = `${workerName}: ${batch.period_start} to ${batch.period_end} · ${projectAddress || projectName}`;

      if (!billGroups.has(groupKey)) {
        billGroups.set(groupKey, {
          companyId,
          qbVendorId: vendorMapping.qb_vendor_id,
          qbVendorName: vendorMapping.qb_vendor_name || "",
          projectId: batch.project_id,
          periodStart: batch.period_start,
          periodEnd: batch.period_end,
          lines: [],
          batchIds: [],
        });
      }

      const group = billGroups.get(groupKey)!;
      group.lines.push({
        batch,
        projectName,
        projectAddress,
        classId,
        className,
        amount: Number(batch.total_amount),
        description,
        workerName,
      });
      group.batchIds.push(batchId);
    }

    // Now create one combined bill per group
    for (const [_groupKey, group] of billGroups) {
      // Skip groups where all batches already failed validation
      const validBatchIds = group.batchIds.filter((id) => !failedBatchIds.has(id));
      if (validBatchIds.length === 0) continue;

      const conn = connectionCache.get(group.companyId)!;

      // Fetch QB settings for this company (already validated above)
      const { data: qbSettings } = await adminClient
        .from("quickbooks_settings")
        .select("labor_expense_account_id, labor_expense_account_name")
        .eq("company_id", group.companyId)
        .maybeSingle();

      // Build bill lines — one line per batch to preserve project/class detail
      const billLines = group.lines.map((line) => {
        const lineDetail: any = {
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: line.amount,
          Description: line.description,
          AccountBasedExpenseLineDetail: {
            AccountRef: {
              value: qbSettings!.labor_expense_account_id,
              name: qbSettings!.labor_expense_account_name || undefined,
            },
          },
        };

        // Preserve class at line level (different projects may have different classes)
        if (line.classId) {
          lineDetail.AccountBasedExpenseLineDetail.ClassRef = {
            value: line.classId,
            name: line.className || undefined,
          };
        }

        return lineDetail;
      });

      const billPayload = {
        VendorRef: { value: group.qbVendorId, name: group.qbVendorName || undefined },
        Line: billLines,
        PrivateNote: `Lovable Payroll: ${group.periodStart} to ${group.periodEnd} · ${group.batchIds.length} batch${group.batchIds.length > 1 ? "es" : ""} · Batches: ${group.batchIds.map((id) => id.slice(0, 8)).join(", ")}`,
      };

      const result = await qbApiFetch(conn, "POST", "/bill", billPayload);

      if (!result.ok) {
        const errorMsg = `QuickBooks API error (${result.status}): ${result.error || "Unknown error"}`;
        for (const batchId of validBatchIds) {
          await adminClient.from("worker_payable_batches").update({ qb_export_error: errorMsg }).eq("id", batchId);
          results.push({ batch_id: batchId, success: false, error: errorMsg });
        }
        continue;
      }

      const billData = result.data as any;
      const qbBillId = billData?.Bill?.Id || null;
      const qbDocNumber = billData?.Bill?.DocNumber || null;

      // Update all batches in this group
      for (const batchId of validBatchIds) {
        const { error: updateErr } = await adminClient
          .from("worker_payable_batches")
          .update({
            status: "exported",
            accounting_source: "quickbooks",
            qb_bill_id: qbBillId,
            qb_bill_doc_number: qbDocNumber,
            qb_exported_at: new Date().toISOString(),
            qb_export_error: null,
            company_id: group.companyId,
          })
          .eq("id", batchId);

        if (updateErr) {
          results.push({
            batch_id: batchId,
            success: false,
            error: `Bill created in QuickBooks (ID: ${qbBillId}) but failed to update local batch: ${updateErr.message}`,
          });
        } else {
          results.push({
            batch_id: batchId,
            success: true,
            qb_bill_id: qbBillId,
            grouped_with: validBatchIds.length > 1 ? validBatchIds.filter((id) => id !== batchId) : undefined,
          });
        }
      }
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
