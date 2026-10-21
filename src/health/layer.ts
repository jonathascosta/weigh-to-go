/**
 * Apple Health beside the diary (docs/sprint-3.md, story 5). The diary's own store keeps the weigh-ins
 * typed in the app; this layer adds, while Health is on, a weigh-in for each other day Health has a
 * reading for, and writes what is typed here to Health. The days read from Health are kept in memory
 * only and read from Health again on every opening and return to the app: data from HealthKit never
 * reaches the diary's file, and so never the iPhone's backup or iCloud through us (guideline 5.1.3).
 * The setting and the days deleted here (tombstones) are kept in a small file beside the diary.
 */
import type { FileBackend } from '../data/device-store';
import type { StoredWeighIn } from '../data/records';
import type { Store } from '../data/store';
import {
  dayOfSyncId,
  fromHealth,
  sampleFor,
  syncIdFor,
  toWrite,
  type DayRule,
  type HealthSample,
  type SampleToWrite,
  type Tombstone,
} from './reconcile';

/** The few things the layer asks of HealthKit. */
export interface HealthBackend {
  /** Whether this device has Apple Health. */
  available(): Promise<boolean>;
  /** Shows iOS's permission sheet if it still may; resolves whether writing is allowed. */
  authorize(): Promise<boolean>;
  /** Every body mass sample Health lets this app read. */
  read(): Promise<HealthSample[]>;
  write(samples: readonly SampleToWrite[]): Promise<void>;
  /** Deletes this app's samples for these sync identifiers; resolves how many went. */
  remove(syncIds: readonly string[]): Promise<number>;
}

export interface HealthSetting {
  readonly on: boolean;
  readonly rule: DayRule;
}

export const HEALTH_OFF: HealthSetting = { on: false, rule: 'first' };
export const HEALTH_FILE = 'health.json';

/** What the Health card shows: off, unavailable here, not allowed to write, or on with days read. */
export type HealthStatus =
  | { readonly kind: 'off' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'on'; readonly days: number };

export interface HealthControls {
  /** Whether this device has Apple Health. */
  available(): Promise<boolean>;
  setting(): HealthSetting;
  status(): HealthStatus;
  /** Turns Health on: iOS asks for permission now. */
  turnOn(): Promise<HealthStatus>;
  turnOff(): Promise<void>;
  setRule(rule: DayRule): Promise<void>;
  /** Reads Health again and writes what it still needs. */
  refresh(): Promise<void>;
  /** Deletes every sample this app wrote to Health; resolves how many went. */
  deleteOwnSamples(): Promise<number>;
}

export interface HealthStore extends Store {
  readonly health: HealthControls;
}

export const isHealthStore = (store: Store | null): store is HealthStore =>
  store !== null && 'health' in store;

interface HealthFile {
  readonly setting: HealthSetting;
  readonly tombstones: readonly Tombstone[];
}

const isTombstone = (v: unknown): v is Tombstone =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Record<string, unknown>).date === 'string' &&
  typeof (v as Record<string, unknown>).at === 'string';

function parseHealthFile(text: string | null): HealthFile {
  if (text === null) return { setting: HEALTH_OFF, tombstones: [] };
  try {
    const value = JSON.parse(text) as { setting?: unknown; tombstones?: unknown };
    const s = value.setting as Partial<HealthSetting> | undefined;
    const setting: HealthSetting = {
      on: s?.on === true,
      rule: s?.rule === 'last' ? 'last' : 'first',
    };
    const tombstones = Array.isArray(value.tombstones) ? value.tombstones.filter(isTombstone) : [];
    return { setting, tombstones };
  } catch {
    return { setting: HEALTH_OFF, tombstones: [] };
  }
}

/** Wraps the diary's store with Apple Health. `now` is for tests. */
export async function withHealth(
  inner: Store,
  backend: HealthBackend,
  files: FileBackend,
  now: () => Date = () => new Date(),
): Promise<HealthStore> {
  let { setting, tombstones } = parseHealthFile(await files.read(HEALTH_FILE).catch(() => null));
  let samples: HealthSample[] = [];
  let derived: StoredWeighIn[] = [];
  let status: HealthStatus = setting.on ? { kind: 'on', days: 0 } : { kind: 'off' };
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const save = () => files.write(HEALTH_FILE, JSON.stringify({ setting, tombstones }));
  const typedDays = async () => new Set((await inner.weighIns()).map((w) => w.date));
  const derive = async () => {
    derived = setting.on ? fromHealth(samples, await typedDays(), tombstones, setting.rule) : [];
    if (setting.on && status.kind === 'on') status = { kind: 'on', days: derived.length };
  };
  /** Best effort: Health may be locked or refuse; the next refresh tries again. */
  const quietly = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      console.warn(error);
    }
  };

  const refresh = async () => {
    if (!setting.on) return;
    try {
      samples = await backend.read();
    } catch (error) {
      console.warn(error);
      return;
    }
    const missing = toWrite(await inner.weighIns(), samples);
    if (missing.length > 0) await quietly(() => backend.write(missing));
    await derive();
    notify();
  };

  /** Writes typed weigh-ins to Health, and forgets the tombstones of their days. */
  const written = async (weighIns: readonly StoredWeighIn[]) => {
    if (!setting.on || weighIns.length === 0) return;
    const dates = new Set(weighIns.map((w) => w.date));
    if (tombstones.some((t) => dates.has(t.date))) {
      tombstones = tombstones.filter((t) => !dates.has(t.date));
      await quietly(save);
    }
    await quietly(() => backend.write(weighIns.map(sampleFor)));
    await derive();
  };

  if (setting.on) {
    if (await backend.available().catch(() => false)) {
      await refresh();
    } else {
      status = { kind: 'unavailable' };
    }
  }

  const health: HealthControls = {
    available: () => backend.available().catch(() => false),
    setting: () => setting,
    status: () => status,
    turnOn: async () => {
      if (!(await backend.available().catch(() => false))) {
        status = { kind: 'unavailable' };
        return status;
      }
      const allowed = await backend.authorize().catch(() => false);
      setting = { ...setting, on: true };
      await save();
      // Without writing, Health may still let this app read; reading is never reported.
      status = allowed ? { kind: 'on', days: 0 } : { kind: 'denied' };
      await refresh();
      if (status.kind !== 'on') await derive();
      notify();
      return status;
    },
    turnOff: async () => {
      setting = { ...setting, on: false };
      status = { kind: 'off' };
      await save();
      samples = [];
      await derive();
      notify();
    },
    setRule: async (rule) => {
      setting = { ...setting, rule };
      await save();
      await derive();
      notify();
    },
    refresh,
    deleteOwnSamples: async () => {
      const days = new Set((await inner.weighIns()).map((w) => w.date));
      for (const s of samples) {
        const day = dayOfSyncId(s.syncId);
        if (day !== null) days.add(day);
      }
      return backend.remove([...days].map(syncIdFor));
    },
  };

  const weighIns = async () => {
    const typed = await inner.weighIns();
    if (derived.length === 0) return typed;
    const days = new Set(typed.map((w) => w.date));
    return [...typed, ...derived.filter((w) => !days.has(w.date))].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  };

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
    weighIns,
    put: async (rows, profile) => {
      await inner.put(rows, profile);
      await written(rows);
    },
    merge: async (rows, profile) => {
      const result = await inner.merge(rows, profile);
      await refresh();
      return result;
    },
    remove: async (date) => {
      const typed = (await inner.weighIns()).some((w) => w.date === date);
      if (typed) await inner.remove(date);
      if (!setting.on) return;
      // The day stays deleted: a scale's reading for it, which this app can't delete, stays out.
      tombstones = [...tombstones.filter((t) => t.date !== date), { date, at: now().toISOString() }];
      await save();
      await quietly(() => backend.remove([syncIdFor(date)]));
      samples = samples.filter((s) => dayOfSyncId(s.syncId) !== date);
      await derive();
    },
    profile: () => inner.profile(),
    setProfile: (profile) => inner.setProfile(profile),
    updateProfile: (change) => inner.updateProfile(change),
    replace: async (rows, profile) => {
      await inner.replace(rows, profile);
      await refresh();
    },
    // Erasing everything turns Health off and forgets the tombstones; deleting this app's samples
    // from Health is the person's choice, asked before (`deleteOwnSamples`).
    clear: async () => {
      await inner.clear();
      setting = HEALTH_OFF;
      tombstones = [];
      samples = [];
      derived = [];
      status = { kind: 'off' };
      await save();
    },
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
