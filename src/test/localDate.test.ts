import { describe, expect, it } from 'vitest';
import { addDays, isDueToday, isOverdueDate, localTodayString } from '@/lib/localDate';

describe('localTodayString — the local day, never the UTC day (A2: evening test)', () => {
  it('at 8 PM Central the day is still today, where the UTC slice says tomorrow', () => {
    // 2026-10-24T01:00:00Z is 8:00 PM CDT on 2026-10-23 in America/Chicago.
    const evening = new Date('2026-10-24T01:00:00Z');
    expect(evening.toISOString().slice(0, 10)).toBe('2026-10-24'); // the old buggy value
    expect(localTodayString(evening, 'America/Chicago')).toBe('2026-10-23');
  });

  it('at 11:30 PM Central on New Year\'s Eve the local day is still Dec 31', () => {
    const instant = new Date('2026-01-01T05:30:00Z'); // 11:30 PM CST, 2025-12-31
    expect(localTodayString(instant, 'America/Chicago')).toBe('2025-12-31');
  });

  it('handles the spring-forward day (2026-03-08) in America/Chicago', () => {
    // 06:30Z is 12:30 AM CST, just before the 2 AM jump.
    expect(localTodayString(new Date('2026-03-08T06:30:00Z'), 'America/Chicago')).toBe('2026-03-08');
    // 08:30Z is 3:30 AM CDT, just after the jump — same local day.
    expect(localTodayString(new Date('2026-03-08T08:30:00Z'), 'America/Chicago')).toBe('2026-03-08');
  });

  it('handles the fall-back day (2026-11-01) in America/Chicago', () => {
    // 06:30Z is 1:30 AM CDT (first pass); 07:30Z is 1:30 AM CST (second pass).
    expect(localTodayString(new Date('2026-11-01T06:30:00Z'), 'America/Chicago')).toBe('2026-11-01');
    expect(localTodayString(new Date('2026-11-01T07:30:00Z'), 'America/Chicago')).toBe('2026-11-01');
  });

  it('respects the timezone it is given (same instant, different local days)', () => {
    const instant = new Date('2026-10-24T01:00:00Z');
    expect(localTodayString(instant, 'America/New_York')).toBe('2026-10-23'); // 9 PM EDT Oct 23
    expect(localTodayString(instant, 'Pacific/Kiritimati')).toBe('2026-10-24'); // 3 PM Oct 24, UTC+14
  });

  it('returns a YYYY-MM-DD string for an ordinary midday instant', () => {
    expect(localTodayString(new Date('2026-10-23T17:00:00Z'), 'America/Chicago')).toBe('2026-10-23');
  });
});

describe('addDays — date-only arithmetic', () => {
  it('adds and subtracts whole days', () => {
    expect(addDays('2026-10-23', 1)).toBe('2026-10-24');
    expect(addDays('2026-10-23', 7)).toBe('2026-10-30');
    expect(addDays('2026-10-23', -1)).toBe('2026-10-22');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('due-date comparisons against the local today string', () => {
  const today = '2026-10-23';

  it('isOverdueDate is strict and null-safe', () => {
    expect(isOverdueDate('2026-10-22', today)).toBe(true);
    expect(isOverdueDate('2026-10-23', today)).toBe(false);
    expect(isOverdueDate('2026-10-24', today)).toBe(false);
    expect(isOverdueDate(null, today)).toBe(false);
    expect(isOverdueDate(undefined, today)).toBe(false);
  });

  it('isDueToday is exact and null-safe', () => {
    expect(isDueToday('2026-10-23', today)).toBe(true);
    expect(isDueToday('2026-10-22', today)).toBe(false);
    expect(isDueToday(null, today)).toBe(false);
  });
});
