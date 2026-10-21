/**
 * Apple Health beside the diary (docs/sprint-3.md, story 5; decisions H1 to H12). The diary's own
 * store keeps the weigh-ins typed in the app; this layer adds, while Health is on, a weigh-in for each
 * other day Health has a reading for, and writes what is typed here to Health. Everything read from
 * Health is kept in memory only and read again on every opening and return to the app: data from
 * HealthKit never reaches the diary's file, the backup file or iCloud through us (guideline 5.1.3).
 * The setting and the days deleted here (tombstones) are kept in a small file beside the diary. One
 * queue runs every operation in turn, so turning Health off can't be undone by a read still running.
 */
import type { FileBackend } from '../data/device-store';
import { isIsoTime, isWeighInDay, type StoredWeighIn } from '../data/records';
import type { Store } from '../data/store';
import {
  dayOfSyncId,
  fromHealth,
  localDayOf,
  sampleFor,
  syncIdFor,
  toWrite,
  type DayRule,
  type HealthSample,
  type SampleToWrite,
  type Tombstone,
} from './reconcile';

export type WriteStatus = 'allowed' | 'denied' | 'undetermined';

/** The few things the layer asks of HealthKit. */
export interface HealthBackend {
  /** Whether this device has Apple Health. */
  available(): Promise<boolean>;
  /** Shows iOS's permission sheet if it still may; resolves whether writing is allowed. */
  authorize(): Promise<boolean>;
  /** Whether writing is allowed, without asking (reading is never reported). */
  writeStatus(): Promise<WriteStatus>;
  /** Every body mass sample Health lets this app read. */
  read(): Promise<HealthSample[]>;
  write(samples: readonly SampleToWrite[]): Promise<void>;
  /** Deletes this app's samples for these sync identifiers; resolves how many went. */
  remove(syncIds: readonly string[]): Promise<number>;
  /** Deletes every sample this app wrote, whatever the day; resolves how many went. */
  removeAll(): Promise<number>;
}

export interface HealthSetting {
  readonly on: boolean;
  readonly rule: DayRule;
}

export const HEALTH_OFF: HealthSetting = { on: false, rule: 'first' };
export const HEALTH_FILE = 'health.json';

/**
 * What the Health card shows: off; unavailable here; or on, with the days read, whether iOS lets the
 * app write, and whether the last read failed (Health locked, say).
 */
export type HealthStatus =
  | { readonly kind: 'off' }
  | { readonly kind: 'unavailable' }
  | {
      readonly kind: 'on';
      readonly days: number;
      readonly writing: boolean;
      readonly readFailed: boolean;
    };

export interface HealthControls {
  /** Whether this device has Apple Health. */
  available(): Promise<boolean>;
  setting(): HealthSetting;
  status(): HealthStatus;
  /** Whether this app ever wrote to Health on this phone: erasing then offers to delete its samples. */
  everOn(): boolean;
  /** Turns Health on: iOS asks for permission now. Rejects, leaving it off, if iOS can't ask. */
  turnOn(): Promise<HealthStatus>;
  turnOff(): Promise<void>;
  setRule(rule: DayRule): Promise<void>;
  /** Reads Health again, checks whether it may write, and writes what Health still needs. */
  refresh(): Promise<void>;
  /** Deletes every sample this app wrote to Health; resolves how many went. */
  deleteOwnSamples(): Promise<number>;
  /** The weigh-ins typed in the app, without the days from Health: what a backup holds. */
  typed(): Promise<StoredWeighIn[]>;
  /** Whether the diary's weigh-in for `date` came from Health. */
  fromHealth(date: string): boolean;
}

export interface HealthStore extends Store {
  readonly health: HealthControls;
}

export const isHealthStore = (store: Store | null): store is HealthStore =>
  store !== null && 'health' in store;

interface HealthFile {
  readonly setting: HealthSetting;
  readonly tombstones: readonly Tombstone[];
  readonly everOn: boolean;
}

const isTombstone = (v: unknown): v is Tombstone =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Record<string, unknown>).date === 'string' &&
  isIsoTime((v as Record<string, unknown>).at);

function parseHealthFile(text: string | null): HealthFile {
  const none: HealthFile = { setting: HEALTH_OFF, tombstones: [], everOn: false };
  if (text === null) return none;
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    const s = value.setting as Partial<HealthSetting> | undefined;
    const setting: HealthSetting = { on: s?.on === true, rule: s?.rule === 'last' ? 'last' : 'first' };
    const tombstones = Array.isArray(value.tombstones) ? value.tombstones.filter(isTombstone) : [];
    return { setting, tombstones, everOn: value.everOn === true || setting.on };
  } catch {
    return none;
  }
}

const byDate = (a: StoredWeighIn, b: StoredWeighIn) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Wraps the diary's store with Apple Health. `now` is for tests. */
export async function withHealth(
  inner: Store,
  backend: HealthBackend,
  files: FileBackend,
  now: () => Date = () => new Date(),
): Promise<HealthStore> {
  let { setting, tombstones, everOn } = parseHealthFile(await files.read(HEALTH_FILE).catch(() => null));
  let samples: HealthSample[] = [];
  /** The days shown from Health: other days, and this app's own newer sample for a typed day. */
  let derived: StoredWeighIn[] = [];
  /** The days shown from Health that aren't typed here: what the card counts. */
  let fromOthers = 0;
  let available: boolean | null = null;
  let writing = true;
  let readFailed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  let queue: Promise<unknown> = Promise.resolve();
  /** Runs `work` after everything queued before it, whatever became of that. */
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  /**
   * What the last typed save found on each of its days, so `restore` can put the day back exactly:
   * the diary's own record, this app's samples in Health, and the day's tombstone.
   */
  let beforeSave = new Map<
    string,
    { typed: StoredWeighIn | null; own: HealthSample[]; tombstone: Tombstone | undefined }
  >();

  const save = () => files.write(HEALTH_FILE, JSON.stringify({ setting, tombstones, everOn }));
  /** Keeps what was written in step with Health, which keeps the highest version for an identifier. */
  const remember = (wrote: readonly SampleToWrite[]) => {
    for (const w of wrote) {
      const old = samples.find((x) => x.syncId === w.syncId);
      if (old && (old.syncVersion ?? 0) >= w.syncVersion) continue;
      samples = [
        ...samples.filter((x) => x.syncId !== w.syncId),
        { uuid: w.syncId, kg: w.kg, start: w.start, syncId: w.syncId, syncVersion: w.syncVersion },
      ];
    }
  };
  const today = () => localDayOf(now().toISOString());

  const derive = async () => {
    if (!setting.on) {
      derived = [];
      fromOthers = 0;
      return;
    }
    const typed = await inner.weighIns();
    const typedDays = new Set(typed.map((w) => w.date));
    const others = fromHealth(samples, typedDays, tombstones, setting.rule);
    // A typed day another of the person's devices saved later, in this app, shows that newer weight.
    const ownNewer = fromHealth(
      samples.filter((s) => dayOfSyncId(s.syncId) !== null),
      new Set(),
      tombstones,
      setting.rule,
    ).filter((h) => {
      const mine = typed.find((w) => w.date === h.date);
      return mine !== undefined && Date.parse(h.savedAt) > Date.parse(mine.savedAt) && h.kg !== mine.kg;
    });
    const latest = today();
    derived = [...others, ...ownNewer].filter((w) => isWeighInDay(w.date, latest)).sort(byDate);
    fromOthers = others.filter((w) => isWeighInDay(w.date, latest)).length;
  };

  /** Best effort: Health may be locked or refuse; the next refresh tries again. */
  const quietly = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      console.warn(error);
    }
  };

  const readHealth = async () => {
    // A setting restored onto a device without Health: nothing to read, nothing to log.
    if (!setting.on || !(await isAvailable())) return;
    writing = (await backend.writeStatus().catch(() => 'undetermined' as const)) !== 'denied';
    try {
      samples = await backend.read();
      readFailed = false;
    } catch (error) {
      console.warn(error);
      readFailed = true;
      return;
    }
    const missing = toWrite(await inner.weighIns(), samples);
    if (writing && missing.length > 0) await quietly(() => backend.write(missing));
    // Days deleted while Health was off: this app's older samples for them go now (H5).
    const stale = samples.filter((s) => {
      const day = dayOfSyncId(s.syncId);
      const t = day === null ? undefined : tombstones.find((x) => x.date === day);
      return t !== undefined && (s.syncVersion ?? 0) <= Date.parse(t.at);
    });
    if (writing && stale.length > 0) {
      await quietly(() => backend.remove(stale.map((s) => s.syncId ?? '')));
      samples = samples.filter((s) => !stale.includes(s));
    }
  };
  const refresh = () =>
    serial(async () => {
      if (!setting.on) return;
      await readHealth();
      await derive();
      notify();
    });

  /**
   * Writes typed weigh-ins to Health, and forgets the tombstones of their days. A weight typed is
   * written as it is (H6); `imported` rows only where Health has no reading for the day or an older
   * one of this app's, so importing a backup never doubles a scale's readings.
   */
  const written = async (weighIns: readonly StoredWeighIn[], imported = false) => {
    if (weighIns.length === 0) return;
    const dates = new Set(weighIns.map((w) => w.date));
    if (tombstones.some((t) => dates.has(t.date))) {
      tombstones = tombstones.filter((t) => !dates.has(t.date));
      await quietly(save);
    }
    const samplesToWrite = imported ? toWrite(weighIns, samples) : weighIns.map(sampleFor);
    if (setting.on && writing && samplesToWrite.length > 0) {
      await quietly(async () => {
        await backend.write(samplesToWrite);
        remember(samplesToWrite);
      });
    }
    await derive();
  };

  /**
   * Days deleted here: tombstones kept (even while off, so they stay deleted when it's on again),
   * once Health was ever used on this phone; before that there is nothing in Health to keep out.
   */
  const deleted = async (dates: readonly string[]) => {
    if (dates.length === 0 || !everOn) return;
    const at = now().toISOString();
    const gone = new Set(dates);
    tombstones = [...tombstones.filter((t) => !gone.has(t.date)), ...dates.map((date) => ({ date, at }))];
    await quietly(save);
    if (setting.on) {
      await quietly(() => backend.remove(dates.map(syncIdFor)));
      samples = samples.filter((s) => {
        const day = dayOfSyncId(s.syncId);
        return day === null || !gone.has(day);
      });
    }
    await derive();
  };

  const isAvailable = async () => {
    available ??= await backend.available().catch(() => false);
    return available;
  };

  const health: HealthControls = {
    available: isAvailable,
    setting: () => setting,
    status: () =>
      !setting.on
        ? { kind: 'off' }
        : available === false
          ? { kind: 'unavailable' }
          : { kind: 'on', days: fromOthers, writing, readFailed },
    everOn: () => everOn,
    turnOn: () =>
      serial(async () => {
        if (!(await isAvailable())) return { kind: 'unavailable' } as const;
        // An error here (no entitlement, say) leaves Health off: it is not a "no".
        writing = await backend.authorize();
        setting = { ...setting, on: true };
        everOn = true;
        await save();
        await readHealth();
        await derive();
        notify();
        return health.status();
      }),
    turnOff: () =>
      serial(async () => {
        setting = { ...setting, on: false };
        await save();
        samples = [];
        await derive();
        notify();
      }),
    setRule: (rule) =>
      serial(async () => {
        setting = { ...setting, rule };
        await save();
        await derive();
        notify();
      }),
    refresh,
    deleteOwnSamples: () => serial(() => backend.removeAll()),
    typed: () => inner.weighIns(),
    fromHealth: (date) => derived.some((w) => w.date === date),
  };

  const weighIns = async () => {
    const typed = await inner.weighIns();
    if (derived.length === 0) return typed;
    const shown = new Map(typed.map((w) => [w.date, w]));
    for (const w of derived) shown.set(w.date, w);
    return [...shown.values()].sort(byDate);
  };

  // Health is read in the background; the diary, drawn from what it has, is told when it's done.
  if (setting.on) {
    void refresh().catch((error: unknown) => {
      console.warn(error);
    });
  }

  return {
    kind: inner.kind,
    get reason() {
      return inner.reason;
    },
    get needsReload() {
      return inner.needsReload;
    },
    get setAside() {
      return inner.setAside;
    },
    health,
    // Not queued: the diary draws from what is known now, without waiting for a read of Health.
    weighIns,
    put: (rows, profile) =>
      serial(async () => {
        const typed = new Map((await inner.weighIns()).map((w) => [w.date, w]));
        beforeSave = new Map(
          rows.map((r) => [
            r.date,
            {
              typed: typed.get(r.date) ?? null,
              own: samples.filter((x) => dayOfSyncId(x.syncId) === r.date),
              tombstone: tombstones.find((t) => t.date === r.date),
            },
          ]),
        );
        await inner.put(rows, profile);
        await written(rows);
      }),
    /**
     * Undoes the last save of a day. A day that was new is deleted, as any day deleted here (a
     * tombstone once Health was used, H5). Otherwise everything goes back as it was: the diary's
     * own record, savedAt included, and this app's sample in Health with its old sync version.
     * Health keeps the highest version for an identifier and ignores a lower one, so the sample
     * the save wrote is deleted before the old one is written back.
     */
    restore: (date, previous) =>
      serial(async () => {
        const before = beforeSave.get(date);
        beforeSave.delete(date);
        const typedNow = (await inner.weighIns()).some((w) => w.date === date);
        if (previous === null) {
          if (typedNow) await inner.remove(date);
          await deleted([date]);
          return;
        }
        // Without what the save found (another save came since), `previous` was the diary's own.
        const typed = before ? before.typed : previous;
        if (typed) await inner.put([typed]);
        else if (typedNow) await inner.remove(date);
        if (before?.tombstone) {
          tombstones = [...tombstones.filter((t) => t.date !== date), before.tombstone];
          await quietly(save);
        }
        if (setting.on && writing) {
          const id = syncIdFor(date);
          await quietly(() => backend.remove([id]));
          samples = samples.filter((x) => x.syncId !== id);
          const back: SampleToWrite[] = before
            ? before.own.map((x) => ({
                kg: x.kg,
                start: x.start,
                syncId: id,
                syncVersion: x.syncVersion ?? Date.parse(x.start),
              }))
            : typed
              ? [sampleFor(typed)]
              : [];
          if (back.length > 0)
            await quietly(async () => {
              await backend.write(back);
              remember(back);
            });
        }
        await derive();
      }),
    merge: (rows, profile) =>
      serial(async () => {
        const result = await inner.merge(rows, profile);
        // Only the days' winners: an incoming row that lost to a newer one here isn't written.
        const dates = new Set(rows.map((r) => r.date));
        await written(
          (await inner.weighIns()).filter((w) => dates.has(w.date)),
          true,
        );
        return result;
      }),
    remove: (date) =>
      serial(async () => {
        if ((await inner.weighIns()).some((w) => w.date === date)) await inner.remove(date);
        // A day from Health, or one written here: either way it stays deleted.
        await deleted([date]);
      }),
    profile: () => inner.profile(),
    setProfile: (profile) => inner.setProfile(profile),
    updateProfile: (change) => inner.updateProfile(change),
    replace: (rows, profile) =>
      serial(async () => {
        const before = (await inner.weighIns()).map((w) => w.date);
        await inner.replace(rows, profile);
        const kept = new Set(rows.map((w) => w.date));
        // Replaced means gone: this app's samples for the days dropped go from Health too.
        await deleted(before.filter((d) => !kept.has(d)));
        await written(rows, true);
      }),
    // Erasing everything turns Health off and forgets the tombstones; deleting this app's samples
    // from Health is the person's choice, asked before (`deleteOwnSamples`).
    clear: () =>
      serial(async () => {
        await inner.clear();
        setting = HEALTH_OFF;
        tombstones = [];
        everOn = false;
        samples = [];
        derived = [];
        fromOthers = 0;
        beforeSave = new Map();
        await save();
      }),
    onChange: (listener) => {
      listeners.add(listener);
      const off = inner.onChange(listener);
      return () => {
        listeners.delete(listener);
        off();
      };
    },
    close: () => {
      listeners.clear();
      inner.close();
    },
  };
}
