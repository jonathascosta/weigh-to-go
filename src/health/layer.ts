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

  const save = () => files.write(HEALTH_FILE, JSON.stringify({ setting, tombstones, everOn }));
  const today = () => localDayOf(now().toISOString());

  const derive = async () => {
    if (!setting.on) {
      derived = [];
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
    if (!setting.on) return;
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
  };
  const refresh = () =>
    serial(async () => {
      if (!setting.on) return;
      await readHealth();
      await derive();
      notify();
    });

  /** Writes typed weigh-ins to Health, and forgets the tombstones of their days. */
  const written = async (weighIns: readonly StoredWeighIn[]) => {
    if (weighIns.length === 0) return;
    const dates = new Set(weighIns.map((w) => w.date));
    if (tombstones.some((t) => dates.has(t.date))) {
      tombstones = tombstones.filter((t) => !dates.has(t.date));
      await quietly(save);
    }
    if (setting.on && writing) await quietly(() => backend.write(weighIns.map(sampleFor)));
    await derive();
  };

  /** Days deleted here: tombstones kept (even while off, so they stay deleted when it's on again). */
  const deleted = async (dates: readonly string[]) => {
    if (dates.length === 0) return;
    const at = now().toISOString();
    const gone = new Set(dates);
    tombstones = [...tombstones.filter((t) => !gone.has(t.date)), ...dates.map((date) => ({ date, at }))];
    await save();
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
          : { kind: 'on', days: derived.length, writing, readFailed },
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

  // The diary draws first; Health is read right after, and the diary told when it has.
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
    weighIns: () => serial(weighIns),
    put: (rows, profile) =>
      serial(async () => {
        await inner.put(rows, profile);
        await written(rows);
      }),
    merge: (rows, profile) =>
      serial(async () => {
        const result = await inner.merge(rows, profile);
        await written(rows);
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
        await written(rows);
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
