import { describe, expect, it } from 'vitest';
import { buildDayProjection, type ProjectionTaskLike } from '@/lib/dayProjection';

const TODAY = '2026-10-23';

const row = (id: string, extra: Partial<ProjectionTaskLike> = {}): ProjectionTaskLike => ({
  id,
  due_date: TODAY,
  stage: 'Ready',
  created_at: '2026-10-20T00:00:00Z',
  task: `Task ${id}`,
  ...extra,
});

describe('buildDayProjection (A1: exactly the records the day says)', () => {
  it('returns exactly the due-today open tasks plus all open overdue tasks', () => {
    const tasks = [
      row('due-today-1'),
      row('due-today-2', { stage: 'In Progress' }),
      row('overdue-1', { due_date: '2026-10-22' }),
      row('overdue-2', { due_date: '2026-09-01', stage: 'In Progress' }),
      row('future', { due_date: '2026-10-24' }),
      row('no-date', { due_date: null }),
    ];

    const projection = buildDayProjection(tasks, TODAY);

    expect(projection.dueToday.map((t) => t.id)).toEqual(['due-today-1', 'due-today-2']);
    expect(projection.overdue.map((t) => t.id)).toEqual(['overdue-2', 'overdue-1']); // oldest due first
    expect(projection.totalCount).toBe(4);
  });

  it('excludes Done tasks from BOTH groups (J1)', () => {
    const tasks = [
      row('done-today', { stage: 'Done' }),
      row('done-overdue', { due_date: '2026-10-01', stage: 'Done' }),
      row('open-overdue', { due_date: '2026-10-01' }),
    ];

    const projection = buildDayProjection(tasks, TODAY);

    expect(projection.dueToday).toEqual([]);
    expect(projection.overdue.map((t) => t.id)).toEqual(['open-overdue']);
  });

  it('orders deterministically: due_date, then created_at, then id', () => {
    const tasks = [
      row('b', { due_date: '2026-10-22', created_at: '2026-10-21T00:00:00Z' }),
      row('a', { due_date: '2026-10-22', created_at: '2026-10-21T00:00:00Z' }),
      row('c', { due_date: '2026-10-21', created_at: '2026-10-22T00:00:00Z' }),
    ];

    const projection = buildDayProjection(tasks, TODAY);

    expect(projection.overdue.map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });

  it('passes rows through untouched — no time is ever invented (A4)', () => {
    const original = row('plain', { due_date: '2026-10-22' });
    const projection = buildDayProjection([original], TODAY);

    expect(projection.overdue[0]).toBe(original);
    expect(Object.keys(projection.overdue[0])).not.toContain('due_time');
    expect(Object.keys(projection.overdue[0])).not.toContain('time');
    expect(Object.keys(projection.overdue[0])).not.toContain('displayTime');
  });

  it('an empty input is an honestly empty projection', () => {
    expect(buildDayProjection([], TODAY)).toEqual({ dueToday: [], overdue: [], totalCount: 0 });
  });
});
