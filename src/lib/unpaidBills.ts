export interface UnpaidRow {
  id: string; // `entry:<shiftId>` | `bill:<batchId>` | `reimb:<reimbursementId>`
  kind: 'entry' | 'bill' | 'reimbursement';
  workerId: string;
  workerName: string;
  projectId: string | null;
  companyId: string | null;
  projectName: string;
  date: string;
  periodStart: string | null;
  periodEnd: string | null;
  invoiceNo: string | null;
  purpose: string | null;
  amount: number;
  status: string;
  shiftIds: string[];
}

interface Input {
  shifts: any[];
  profiles: { id: string; full_name: string | null }[];
  projects: { id: string; name: string; company_id: string | null }[];
  payRates: { id: string; hourly_rate: number | null }[];
  batchLinks: { shift_id: string; payable_batch_id: string; voided_at: string | null; worker_payable_batches?: { status: string } | null }[];
  paymentLinks: { shift_id: string; worker_payments?: { status: string } | null }[];
  unpaidBatches: any[];
  reimbursements?: any[];
}

export function shiftAmount(s: any, rate: number): number {
  if (s.is_flat_rate) return Number(s.flat_rate_amount || 0);
  return Number((Number(s.total_hours || 0) * Number(s.hourly_rate_snapshot ?? rate ?? 0)).toFixed(2));
}

/** Every unpaid item across all periods: unbilled entries + draft/exported bills. Sorted by worker, then oldest date. */
export function buildUnpaidRows(i: Input): UnpaidRow[] {
  const names = new Map(i.profiles.map((p) => [p.id, p.full_name || 'Unknown worker']));
  const projects = new Map(i.projects.map((p) => [p.id, p]));
  const rates = new Map(i.payRates.map((r) => [r.id, Number(r.hourly_rate ?? 0)]));
  const shiftById = new Map(i.shifts.map((s) => [s.id, s]));

  const billed = new Set<string>();
  const shiftsByBatch = new Map<string, string[]>();
  for (const l of i.batchLinks) {
    if (l.voided_at || l.worker_payable_batches?.status === 'voided') continue;
    billed.add(l.shift_id);
    shiftsByBatch.set(l.payable_batch_id, [...(shiftsByBatch.get(l.payable_batch_id) ?? []), l.shift_id]);
  }
  for (const l of i.paymentLinks) {
    if (l.worker_payments?.status !== 'voided') billed.add(l.shift_id);
  }

  const rows: UnpaidRow[] = [];
  for (const s of i.shifts) {
    if (billed.has(s.id)) continue;
    const p = projects.get(s.project_id);
    rows.push({
      id: `entry:${s.id}`, kind: 'entry', workerId: s.user_id, workerName: names.get(s.user_id) ?? 'Unknown worker',
      projectId: s.project_id, companyId: p?.company_id ?? null, projectName: p?.name ?? 'Unknown project',
      date: s.shift_date, periodStart: null, periodEnd: null, invoiceNo: s.invoice_no ?? null, purpose: s.purpose ?? null,
      amount: shiftAmount(s, rates.get(s.user_id) ?? 0), status: 'Ready to Bill', shiftIds: [s.id],
    });
  }
  for (const b of i.unpaidBatches) {
    if (b.status !== 'draft' && b.status !== 'exported') continue;
    const ids = shiftsByBatch.get(b.id) ?? [];
    const linked = ids.map((id) => shiftById.get(id)).filter(Boolean);
    const dates = linked.map((s: any) => s.shift_date).sort();
    const p = b.project_id ? projects.get(b.project_id) : undefined;
    const purposes = [...new Set(linked.map((s: any) => s.purpose).filter(Boolean))];
    rows.push({
      id: `bill:${b.id}`, kind: 'bill', workerId: b.worker_user_id, workerName: names.get(b.worker_user_id) ?? 'Unknown worker',
      projectId: b.project_id, companyId: b.company_id, projectName: p?.name ?? 'Mixed / Unset project',
      date: dates[0] ?? b.period_start, periodStart: b.period_start, periodEnd: b.period_end,
      invoiceNo: b.qb_bill_doc_number ?? b.invoice_no ?? null, purpose: b.purpose ?? (purposes.join('; ') || null),
      amount: Number(b.total_amount || 0), status: b.status === 'exported' ? 'Bill in QuickBooks – unpaid' : 'Bill prepared – unpaid',
      shiftIds: ids,
    });
  }
  for (const r of i.reimbursements ?? []) {
    if (r.status === 'paid' || r.status === 'voided' || r.status === 'not_approved') continue;
    const workerId = r.on_behalf_of_user_id || r.submitter_user_id;
    const p = r.project_id ? projects.get(r.project_id) : undefined;
    const settled = r.status === 'approved' || r.status === 'exported';
    rows.push({
      id: `reimb:${r.id}`, kind: 'reimbursement', workerId, workerName: names.get(workerId) ?? 'Unknown worker',
      projectId: r.project_id ?? null, companyId: r.company_id ?? p?.company_id ?? null, projectName: p?.name ?? 'No project',
      date: r.expense_date, periodStart: null, periodEnd: null,
      invoiceNo: r.qb_bill_doc_number ?? null, purpose: `${r.vendor_paid} — ${r.description}`,
      amount: Number(settled ? (r.approved_amount ?? r.requested_amount) : r.requested_amount),
      status: r.status === 'exported' ? 'Bill in QuickBooks – unpaid'
        : r.status === 'approved' ? 'Approved – not yet billed'
        : 'Needs approval',
      shiftIds: [],
    });
  }
  return rows.sort((a, b) => a.workerName.localeCompare(b.workerName) || a.workerId.localeCompare(b.workerId) || a.date.localeCompare(b.date));
}

/** Group selected unbilled entries into one new bill per worker + project for the current run. */
export function groupForRun(entries: UnpaidRow[]) {
  const m = new Map<string, { workerId: string; projectId: string | null; companyId: string | null; shiftIds: string[]; total: number }>();
  for (const e of entries) {
    const k = `${e.workerId}::${e.projectId}`;
    const g = m.get(k) ?? { workerId: e.workerId, projectId: e.projectId, companyId: e.companyId, shiftIds: [], total: 0 };
    g.shiftIds.push(...e.shiftIds); g.total += e.amount; m.set(k, g);
  }
  return [...m.values()];
}
