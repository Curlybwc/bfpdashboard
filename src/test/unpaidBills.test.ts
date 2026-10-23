import { describe, it, expect } from 'vitest';
import { buildUnpaidRows, groupForRun } from '@/lib/unpaidBills';

const base = {
  profiles: [{ id: 'j', full_name: 'Justin Grimes' }],
  projects: [{ id: 'p', name: '137 Forestwood', company_id: 'c' }],
  payRates: [],
  paymentLinks: [],
  unpaidBatches: [],
};
const flat = (id: string, date: string, amt: number) => ({ id, user_id: 'j', project_id: 'p', shift_date: date, is_flat_rate: true, flat_rate_amount: amt, total_hours: null });

describe('all unpaid bills', () => {
  it('lists unpaid entries from every period, oldest first', () => {
    const rows = buildUnpaidRows({ ...base, batchLinks: [], shifts: [flat('d', '2026-10-14', 1500), flat('a', '2026-09-22', 1000), flat('b', '2026-10-06', 1000), flat('c', '2026-10-09', 1000)] });
    expect(rows.map((r) => r.date)).toEqual(['2026-09-22', '2026-10-06', '2026-10-09', '2026-10-14']);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(4500);
  });
  it('excludes paid entries and keeps unpaid bills', () => {
    const rows = buildUnpaidRows({
      ...base, shifts: [flat('a', '2026-09-22', 1000), flat('b', '2026-10-06', 200)],
      batchLinks: [{ shift_id: 'a', payable_batch_id: 'x', voided_at: null, worker_payable_batches: { status: 'paid' } }, { shift_id: 'b', payable_batch_id: 'y', voided_at: null, worker_payable_batches: { status: 'draft' } }],
      unpaidBatches: [{ id: 'y', status: 'draft', worker_user_id: 'j', project_id: 'p', period_start: '2026-09-28', period_end: '2026-10-11', total_amount: 200 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('bill');
  });
  it('groups pulled entries per worker and project', () => {
    const rows = buildUnpaidRows({ ...base, batchLinks: [], shifts: [flat('a', '2026-09-22', 1000), flat('b', '2026-10-06', 1000)] });
    const g = groupForRun(rows);
    expect(g).toHaveLength(1);
    expect(g[0].total).toBe(2000);
  });

  const reimb = (id: string, status: string, amt: number, approved: number | null = null, date = '2026-04-28') => ({
    id, status, submitter_user_id: 'j', on_behalf_of_user_id: null, project_id: 'p', company_id: 'c',
    vendor_paid: 'Home Depot', description: 'Materials', expense_date: date, requested_amount: amt, approved_amount: approved,
  });

  it('lists reimbursements from any period unless paid, voided, or not approved', () => {
    const rows = buildUnpaidRows({
      ...base, batchLinks: [], shifts: [],
      reimbursements: [
        reimb('r1', 'submitted', 289.70, null, '2026-04-28'),
        reimb('r2', 'submitted', 82.03, null, '2026-05-01'),
        reimb('r3', 'submitted', 56.05, null, '2026-05-05'),
        reimb('r4', 'submitted', 6.14, null, '2026-05-09'),
        reimb('r5', 'paid', 50),
        reimb('r6', 'voided', 50),
        reimb('r7', 'not_approved', 50),
      ],
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.kind === 'reimbursement')).toBe(true);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(433.92, 2);
    expect(rows.every((r) => r.status === 'Needs approval' && r.rawStatus === 'submitted')).toBe(true);
  });
  it('uses the approved amount for approved reimbursements', () => {
    const rows = buildUnpaidRows({ ...base, batchLinks: [], shifts: [], reimbursements: [reimb('r1', 'approved', 100, 80)] });
    expect(rows[0].amount).toBe(80);
    expect(rows[0].status).toBe('Approved – not yet billed');
    expect(rows[0].rawStatus).toBe('approved');
  });
});
