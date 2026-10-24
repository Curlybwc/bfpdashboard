import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fetch-layer tests for the Today projection (A5 cap honesty, A6 failure
 * honesty). The supabase client is mocked with a chainable stub: filter
 * methods return the chain, `.range(from, to)` is the terminal call for
 * task queries, and membership / project queries resolve by awaiting the
 * chain. Filter semantics are NOT re-tested here — the query construction
 * is pinned by these tests only for paging, counting, and error behavior.
 */

const h = vi.hoisted(() => ({
  tasksRange: (
    _from: number,
    _to: number,
  ): Promise<{ data: any[] | null; count: number | null; error: any }> =>
    Promise.resolve({ data: [], count: 0, error: null }),
  membership: (): { data: any[] | null; error: any } => ({
    data: [{ project_id: 'p1' }],
    error: null,
  }),
  projects: (): { data: any[] | null; error: any } => ({
    data: [{ id: 'p1', name: 'Proj One' }],
    error: null,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.or = self;
      chain.neq = self;
      chain.lt = self;
      chain.order = self;
      chain.in = self;
      chain.range = (from: number, to: number) => h.tasksRange(from, to);
      chain.then = (resolve: (v: any) => void) =>
        resolve(table === 'project_members' ? h.membership() : h.projects());
      return chain;
    },
  },
}));

import { fetchDayProjection, fetchProjectionGroup } from '@/hooks/useTodayProjection';

const SCOPE = { userId: 'u1', projectIds: ['p1'] };
const TODAY = '2026-10-23';

const fixtureRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    task: `Task ${i + 1}`,
    due_date: TODAY,
    stage: 'Ready',
    project_id: 'p1',
    created_at: '2026-10-20T00:00:00Z',
  }));

beforeEach(() => {
  h.membership = () => ({ data: [{ project_id: 'p1' }], error: null });
  h.projects = () => ({ data: [{ id: 'p1', name: 'Proj One' }], error: null });
  h.tasksRange = () => Promise.resolve({ data: [], count: 0, error: null });
});

describe('fetchProjectionGroup — cap honesty (A5)', () => {
  it('paginates until every row is collected — nothing silently truncated', async () => {
    const all = fixtureRows(5);
    h.tasksRange = (from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, to + 1), count: all.length, error: null });

    const group = await fetchProjectionGroup('dueToday', SCOPE, TODAY, 2);

    expect(group.error).toBeNull();
    expect(group.truncated).toBe(false);
    expect(group.total).toBe(5);
    expect(group.rows.map((r) => r.id)).toEqual(['t1', 't2', 't3', 't4', 't5']);
  });

  it('a later page failing yields the collected rows marked truncated, never "complete"', async () => {
    const all = fixtureRows(5);
    let calls = 0;
    h.tasksRange = (from: number, to: number) => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ data: all.slice(from, to + 1), count: 5, error: null });
      return Promise.resolve({ data: null, count: null, error: { message: 'boom' } });
    };

    const group = await fetchProjectionGroup('dueToday', SCOPE, TODAY, 2);

    expect(group.rows).toHaveLength(2);
    expect(group.total).toBe(5);
    expect(group.truncated).toBe(true);
  });
});

describe('fetchProjectionGroup — failure honesty (A6)', () => {
  it('a first-page failure is an error for that group, not a fake empty day', async () => {
    h.tasksRange = () => Promise.resolve({ data: null, count: null, error: { message: 'db down' } });

    const group = await fetchProjectionGroup('overdue', SCOPE, TODAY, 2);

    expect(group.error).toBe('db down');
    expect(group.rows).toEqual([]);
  });
});

describe('fetchDayProjection', () => {
  it('a membership failure marks BOTH groups in error (the strip shows a notice, not a fake day)', async () => {
    h.membership = () => ({ data: null, error: { message: 'no memberships' } });

    const data = await fetchDayProjection('u1');

    expect(data.dueToday.error).toContain('no memberships');
    expect(data.overdue.error).toContain('no memberships');
    expect(data.dueToday.rows).toEqual([]);
    expect(data.overdue.rows).toEqual([]);
  });

  it('one group failing leaves the other group intact (A6)', async () => {
    // fetchDayProjection invokes the due-today group first; its first
    // .range() call is therefore the first tasks call overall.
    const overdueRows = fixtureRows(2).map((r) => ({ ...r, due_date: '2026-10-22' }));
    let calls = 0;
    h.tasksRange = () => {
      calls += 1;
      if (calls === 1) return Promise.resolve({ data: null, count: null, error: { message: 'today query failed' } });
      return Promise.resolve({ data: overdueRows, count: overdueRows.length, error: null });
    };

    const data = await fetchDayProjection('u1');

    expect(data.dueToday.error).toBe('today query failed');
    expect(data.overdue.error).toBeNull();
    expect(data.overdue.rows.map((r) => r.id)).toEqual(['t1', 't2']);
    expect(data.projectMap).toEqual({ p1: 'Proj One' });
  });
});
