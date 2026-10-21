/**
 * The rules between the diary and Apple Health (docs/sprint-3.md, story 5), as pure functions:
 * which day a sample belongs to, which reading stands for a day, what the diary takes from Health,
 * and what it writes there. A weigh-in typed in the app always wins over a reading from Health.
 */
import { isWeight, type StoredWeighIn } from '../data/records';

/** A body mass sample as Health gives it. */
export interface HealthSample {
  readonly uuid: string;
  readonly kg: number;
  /** When it was measured, ISO 8601. */
  readonly start: string;
  /** This app's day identifier, `weightogo:<yyyy-mm-dd>`, on samples it wrote (on any device). */
  readonly syncId?: string;
  /** When this app saved it, in ms since 1970, on samples it wrote. */
  readonly syncVersion?: number;
}

/** A sample for Health to save. */
export interface SampleToWrite {
  readonly kg: number;
  readonly start: string;
  readonly syncId: string;
  readonly syncVersion: number;
}

/** A day deleted in the diary, and when: Health's readings for it from before then stay out. */
export interface Tombstone {
  readonly date: string;
  readonly at: string;
}

/** Which reading counts on a day with several and none written by this app. */
export type DayRule = 'first' | 'last';

const SYNC_PREFIX = 'weightogo:';
export const syncIdFor = (date: string): string => `${SYNC_PREFIX}${date}`;
/** The day in this app's sync identifier, or null for any other. */
export const dayOfSyncId = (id: string | undefined): string | null =>
  id?.startsWith(SYNC_PREFIX) && /^\d{4}-\d{2}-\d{2}$/.test(id.slice(SYNC_PREFIX.length))
    ? id.slice(SYNC_PREFIX.length)
    : null;

const pad = (n: number) => String(n).padStart(2, '0');
/** The local day of a moment, YYYY-MM-DD, in the phone's time zone. */
export const localDayOf = (iso: string): string => {
  const t = new Date(iso);
  return `${String(t.getFullYear())}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/** The day a sample stands for: the one in this app's identifier, else the local day it was taken. */
export const dayOfSample = (s: HealthSample): string => dayOfSyncId(s.syncId) ?? localDayOf(s.start);

/** When a sample came to be, for comparing with a tombstone: when this app saved it, or when taken. */
const madeAt = (s: HealthSample): number =>
  dayOfSyncId(s.syncId) !== null && s.syncVersion !== undefined ? s.syncVersion : Date.parse(s.start);

/**
 * The weigh-ins the diary takes from Health: one a day, for the days not typed here and not deleted
 * since. This app's own sample for a day (from this phone or another) wins, the latest saved; else the
 * first reading of the day, or the last with `rule` 'last'. Readings out of range are left out.
 */
export function fromHealth(
  samples: readonly HealthSample[],
  typed: ReadonlySet<string>,
  tombstones: readonly Tombstone[],
  rule: DayRule,
): StoredWeighIn[] {
  const deletedAt = new Map(tombstones.map((t) => [t.date, Date.parse(t.at)]));
  const byDay = new Map<string, HealthSample[]>();
  for (const s of samples) {
    if (!isWeight(s.kg) || Number.isNaN(Date.parse(s.start))) continue;
    const day = dayOfSample(s);
    if (typed.has(day)) continue;
    const deleted = deletedAt.get(day);
    if (deleted !== undefined && madeAt(s) <= deleted) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), s]);
  }
  const days = [...byDay.entries()].map(([date, list]): StoredWeighIn => {
    const ours = list.filter((s) => dayOfSyncId(s.syncId) !== null);
    if (ours.length > 0) {
      const latest = ours.reduce((a, b) => ((b.syncVersion ?? 0) > (a.syncVersion ?? 0) ? b : a));
      const saved = latest.syncVersion ?? Date.parse(latest.start);
      return { date, kg: latest.kg, savedAt: new Date(saved).toISOString() };
    }
    const sorted = [...list].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const pick = (rule === 'first' ? sorted[0] : sorted[sorted.length - 1]) as HealthSample;
    return { date, kg: pick.kg, savedAt: new Date(pick.start).toISOString() };
  });
  return days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The sample for a typed weigh-in: at the moment it was saved when that was on its own day, else at
 * noon of the day (a weigh-in logged later for an earlier day).
 */
export function sampleFor(w: StoredWeighIn): SampleToWrite {
  const saved = Date.parse(w.savedAt);
  const [y, m, d] = w.date.split('-').map(Number) as [number, number, number];
  const start = localDayOf(w.savedAt) === w.date ? new Date(saved) : new Date(y, m - 1, d, 12);
  return { kg: w.kg, start: start.toISOString(), syncId: syncIdFor(w.date), syncVersion: saved };
}

/**
 * The typed weigh-ins Health still needs: the days with no reading there at all (so a scale's
 * reading is never doubled), and the days whose sample from this app is older than the weigh-in.
 */
export function toWrite(typed: readonly StoredWeighIn[], samples: readonly HealthSample[]): SampleToWrite[] {
  const ours = new Map<string, number>();
  const anyReading = new Set<string>();
  for (const s of samples) {
    const day = dayOfSample(s);
    anyReading.add(day);
    if (dayOfSyncId(s.syncId) !== null) ours.set(day, Math.max(ours.get(day) ?? 0, s.syncVersion ?? 0));
  }
  return typed
    .filter((w) => {
      const version = ours.get(w.date);
      if (version !== undefined) return version < Date.parse(w.savedAt);
      return !anyReading.has(w.date);
    })
    .map(sampleFor);
}
