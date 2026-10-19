import { corsHeaders, requireAdminAuth } from "../_shared/auth.ts";
import { getConnectionForCompany, qbApiFetch, QBConnection } from "../_shared/quickbooks.ts";

/**
 * READ-ONLY audit of previously pushed payroll bills.
 * Reads each bill from QuickBooks and compares the class on its lines with the
 * project's saved QuickBooks Class ID. Never creates, edits or re-pushes bills,
 * and never writes to local payroll records.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { adminClient } = await requireAdminAuth(req);

    const { data: batches, error } = await adminClient
      .from("worker_payable_batches")
      .select("id, project_id, company_id, worker_user_id, period_start, period_end, total_amount, qb_bill_id, qb_exported_at")
      .not("qb_bill_id", "is", null)
      .order("qb_exported_at");
    if (error) return json({ error: "query_failed", message: error.message }, 500);

    const projectIds = [...new Set((batches || []).map((b: any) => b.project_id).filter(Boolean))];
    const [{ data: projects }, { data: mappings }, { data: companies }] = await Promise.all([
      adminClient.from("projects").select("id, name, company_id").in("id", projectIds),
      adminClient.from("quickbooks_class_mappings").select("project_id, qb_class_id, qb_class_name, created_at").in("project_id", projectIds),
      adminClient.from("companies").select("id, name"),
    ]);
    const projMap = new Map((projects || []).map((p: any) => [p.id, p]));
    const mapMap = new Map((mappings || []).map((m: any) => [m.project_id, m]));
    const compMap = new Map((companies || []).map((c: any) => [c.id, c.name]));

    const conns = new Map<string, QBConnection | null>();
    const billCache = new Map<string, any>();
    const rows: any[] = [];

    for (const b of batches || []) {
      const companyId = b.company_id || projMap.get(b.project_id)?.company_id;
      const mapping = mapMap.get(b.project_id);
      const mappedAtPush = !!mapping && new Date(mapping.created_at) <= new Date(b.qb_exported_at);
      const row: any = {
        batch_id: b.id,
        qb_bill_id: b.qb_bill_id,
        exported_at: b.qb_exported_at,
        period_start: b.period_start,
        period_end: b.period_end,
        amount: Number(b.total_amount),
        project_name: projMap.get(b.project_id)?.name || "(no project)",
        company_name: compMap.get(companyId) || "(no company)",
        expected_class_id: mapping?.qb_class_id || null,
        expected_class_name: mapping?.qb_class_name || null,
        class_mapped_at_push: mappedAtPush,
        qb_class_ids: [] as string[],
        status: "unknown",
      };

      if (!companyId) { row.status = "cannot_check"; row.note = "No company"; rows.push(row); continue; }
      if (!conns.has(companyId)) conns.set(companyId, (await getConnectionForCompany(adminClient, companyId)).conn || null);
      const conn = conns.get(companyId);
      if (!conn) { row.status = "cannot_check"; row.note = "No QuickBooks connection"; rows.push(row); continue; }

      const cacheKey = `${companyId}:${b.qb_bill_id}`;
      if (!billCache.has(cacheKey)) {
        const res = await qbApiFetch(conn, "GET", `/bill/${encodeURIComponent(b.qb_bill_id)}`);
        billCache.set(cacheKey, res.ok ? (res.data as any)?.Bill : { __error: res.error || `HTTP ${res.status}` });
      }
      const bill = billCache.get(cacheKey);
      if (!bill || bill.__error) { row.status = "cannot_check"; row.note = bill?.__error || "Bill not found"; rows.push(row); continue; }

      const lines = (bill.Line || []).filter((l: any) => l.DetailType === "AccountBasedExpenseLineDetail");
      row.qb_class_ids = [...new Set(lines.map((l: any) => l.AccountBasedExpenseLineDetail?.ClassRef?.value).filter(Boolean))];
      row.qb_class_names = [...new Set(lines.map((l: any) => l.AccountBasedExpenseLineDetail?.ClassRef?.name).filter(Boolean))];
      const anyUnclassed = lines.some((l: any) => !l.AccountBasedExpenseLineDetail?.ClassRef?.value);

      if (!mapping) row.status = anyUnclassed ? "missing_class_unmapped" : "classed_in_qb_but_unmapped";
      else if (anyUnclassed) row.status = "missing_class";
      else if (!row.qb_class_ids.every((id: string) => id === mapping.qb_class_id)) row.status = "wrong_class";
      else row.status = mappedAtPush ? "ok" : "corrected_in_qb";
      rows.push(row);
    }

    const summary: Record<string, { count: number; amount: number }> = {};
    for (const r of rows) {
      summary[r.status] ??= { count: 0, amount: 0 };
      summary[r.status].count++;
      summary[r.status].amount = Math.round((summary[r.status].amount + r.amount) * 100) / 100;
    }
    return json({ rows, summary });
  } catch (e) {
    if (e instanceof Response) return e;
    return json({ error: "internal", message: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
