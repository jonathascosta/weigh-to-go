/**
 * The daily reminder's plan (docs/sprint-3.md, story 4): one local notification a day at the time the
 * person chose, for the next `REMINDER_DAYS` days, without one on a day already logged. iOS keeps at
 * most 64 pending notifications an app, so the app plans a window and renews it whenever it opens or
 * comes back; after `REMINDER_DAYS` days without opening it, the reminders stop.
 */

/** Days of reminders planned ahead (under iOS's 64 pending notifications). */
export const REMINDER_DAYS = 30;

/** A reminder time, as the person set it, in their own clock. */
export interface ReminderTime {
  readonly hour: number;
  readonly minute: number;
}

export const isReminderTime = (v: unknown): v is ReminderTime => {
  if (typeof v !== 'object' || v === null) return false;
  const { hour, minute } = v as Record<string, unknown>;
  return (
    Number.isInteger(hour) &&
    Number.isInteger(minute) &&
    (hour as number) >= 0 &&
    (hour as number) < 24 &&
    (minute as number) >= 0 &&
    (minute as number) < 60
  );
};

/** A planned notification: its id (stable per local day, so a re-plan replaces it) and when. */
export interface PlannedReminder {
  readonly id: number;
  readonly day: string;
  readonly at: Date;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** The local day of `t`, YYYY-MM-DD. */
const localDay = (t: Date) => `${String(t.getFullYear())}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
/** An id from the local day: 20261021 for 21 October 2026. */
const idFor = (day: string) => Number(day.replaceAll('-', ''));

/**
 * The notifications to have pending from `now`: at `time` on each of the next `REMINDER_DAYS` local
 * days, today included while its time is still ahead, leaving out the days in `logged` (YYYY-MM-DD).
 * Built in local time, so a change of clocks (summer time) keeps the hour the person chose.
 */
export function planReminders(
  time: ReminderTime,
  logged: ReadonlySet<string>,
  now: Date,
  days = REMINDER_DAYS,
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (let i = 0; i < days; i++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, time.hour, time.minute);
    const day = localDay(at);
    if (at <= now || logged.has(day)) continue;
    planned.push({ id: idFor(day), day, at });
  }
  return planned;
}
