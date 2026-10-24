/**
 * Day projection builder (CT-29): given the viewer's entitled task rows and
 * the local today string, produce exactly the records the day says —
 * tasks due today, plus open tasks due before today (the Overdue group).
 *
 * Rules (SPEC-today-page-improvements, Slice 1):
 * - Done tasks appear in NEITHER group (judgment call J1, logged at the
 *   Batch 1 gate: CalendarView and the work queue both exclude Done).
 * - Tasks with no due date are not day records and never appear.
 * - Rows pass through untouched: a date-only record gains NO time field,
 *   ever (no invented times).
 * - Order is deterministic: due_date ascending, then created_at ascending,
 *   then id. The projection is a view of the records — it carries no manual
 *   curation (no mute, no drag-reorder) of its own (CT-29).
 */

export interface ProjectionTaskLike {
  id: string;
  due_date: string | null;
  stage: string;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface DayProjection<T extends ProjectionTaskLike = ProjectionTaskLike> {
  dueToday: T[];
  overdue: T[];
  totalCount: number;
}

function compareProjectionRows<T extends ProjectionTaskLike>(a: T, b: T): number {
  const da = a.due_date ?? '9999-12-31';
  const db = b.due_date ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  const ca = a.created_at ?? '';
  const cb = b.created_at ?? '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function buildDayProjection<T extends ProjectionTaskLike>(
  tasks: readonly T[],
  todayStr: string,
): DayProjection<T> {
  const dueToday: T[] = [];
  const overdue: T[] = [];

  for (const task of tasks) {
    if (!task.due_date) continue;
    if (task.stage === 'Done') continue;
    if (task.due_date === todayStr) dueToday.push(task);
    else if (task.due_date < todayStr) overdue.push(task);
  }

  dueToday.sort(compareProjectionRows);
  overdue.sort(compareProjectionRows);

  return { dueToday, overdue, totalCount: dueToday.length + overdue.length };
}
