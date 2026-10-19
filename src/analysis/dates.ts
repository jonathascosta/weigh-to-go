/** Calendar days as UTC midnights, so a day is always 24 hours and no time zone shifts it. */

export const DAY = 86_400_000;

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `s` is a real calendar day written as YYYY-MM-DD (2026-02-30 is not). */
export function isIsoDay(s: string): boolean {
  if (!ISO_DAY.test(s)) return false;
  const t = parseDay(s);
  return !Number.isNaN(t.getTime()) && isoDay(t) === s;
}

/** The UTC midnight of a YYYY-MM-DD day. */
export function parseDay(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/** A UTC midnight as YYYY-MM-DD. */
export function isoDay(t: Date): string {
  return t.toISOString().slice(0, 10);
}

/** The day `days` after `t`. */
export function addDays(t: Date, days: number): Date {
  return new Date(t.getTime() + days * DAY);
}

/** Whole days from `a` to `b`. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/** Today in the device's own time zone, as YYYY-MM-DD: the day the person is living in. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}
