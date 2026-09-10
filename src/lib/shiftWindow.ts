/**
 * Contractor shift editing window.
 *
 * Non-admin contractors may create, edit, and delete their own shifts only
 * for today through 7 calendar days ago. Admins are unrestricted.
 * Mirrors the server-side rules in `upsert_shift_with_allocations` and the
 * shifts / shift_task_allocations RLS policies.
 */
export const CONTRACTOR_SHIFT_WINDOW_DAYS = 7;

/** Local calendar date (not UTC) as YYYY-MM-DD. */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today, in YYYY-MM-DD. */
export function shiftWindowEnd(): string {
  return toISO(new Date());
}

/** 7 calendar days ago, in YYYY-MM-DD. */
export function shiftWindowStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - CONTRACTOR_SHIFT_WINDOW_DAYS);
  return toISO(d);
}

/** Whether a non-admin may create/edit/delete a shift on this date. */
export function isShiftDateEditable(isAdmin: boolean, shiftDate: string | null | undefined): boolean {
  if (isAdmin) return true;
  if (!shiftDate) return false;
  return shiftDate >= shiftWindowStart() && shiftDate <= shiftWindowEnd();
}
