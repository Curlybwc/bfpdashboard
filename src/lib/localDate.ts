/**
 * Local-date helpers for the Today page (CT-15 / CT-29: "today" is the
 * viewer's LOCAL date, never the UTC date).
 *
 * The previous implementation used `new Date().toISOString().slice(0, 10)`,
 * which is the UTC date — in Central time it rolls to tomorrow at 7 PM CDT
 * (6 PM CST), so every evening the page's "today" was wrong.
 *
 * These helpers derive the date from the client's IANA timezone via
 * Intl.DateTimeFormat (the pattern already proven in Ezzie's
 * useDailyOperationsPlan.dateInTimeZone). No UTC slice, no fixed offset —
 * DST transitions are handled by the platform's timezone database.
 */

export const FALLBACK_TIME_ZONE = 'America/Chicago';

/** The client's IANA timezone, falling back to America/Chicago. */
export function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/**
 * The calendar date (YYYY-MM-DD) that `now` falls on in `timeZone`
 * (default: the client's timezone).
 */
export function localTodayString(now: Date = new Date(), timeZone: string = clientTimeZone()): string {
  let tz = timeZone;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  } catch {
    tz = FALLBACK_TIME_ZONE;
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
  }
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Add `days` to a YYYY-MM-DD date string, returning a YYYY-MM-DD string.
 * Date-only arithmetic: the string is parsed as a UTC calendar date, which
 * is exact for whole-day math (no timezone is involved in the value itself).
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** True when a due date (YYYY-MM-DD) is strictly before the local today string. */
export function isOverdueDate(dueDate: string | null | undefined, todayStr: string): boolean {
  return !!dueDate && dueDate < todayStr;
}

/** True when a due date (YYYY-MM-DD) is exactly the local today string. */
export function isDueToday(dueDate: string | null | undefined, todayStr: string): boolean {
  return !!dueDate && dueDate === todayStr;
}
