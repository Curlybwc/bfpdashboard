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
});
