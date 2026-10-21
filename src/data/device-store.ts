/**
 * The iPhone app's store (docs/sprint-3.md, story 2): the weigh-ins and the profile in one JSON file
 * in the app's own container, which iOS keeps (and backs up with the phone) where a web view's
 * IndexedDB may be cleared. The work happens in memory, as in `memoryStore`, and every change is then
 * written whole: first to a temporary file, then renamed over the old one. A write cut short leaves
 * the last good diary or, when the rename had already deleted it, the new one, which the next opening
 * puts in place. One queue runs every operation in turn, so two changes made close together both
 * land. A change whose write fails is undone in memory and rejects.
 */
import {
  byDate,
  EMPTY_PROFILE,
  toProfile,
  isStoredWeighIn,
  type Profile,
  type StoredWeighIn,
} from './records';
import { memoryStore, type Store } from './store';

/** The few file operations the store needs, in the app's own folder. */
export interface FileBackend {
  /** The file's text, or null when there is no such file. Rejects when it exists but can't be read. */
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  /** Moves `from` to `to`, replacing `to`. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes the file; resolves if there was none. */
  remove(name: string): Promise<void>;
  /** The names of the files in the folder. */
  list(): Promise<string[]>;
}

export const DIARY_FILE = 'weigh-ins.json';
export const DIARY_TEMP = 'weigh-ins.json.tmp';
const APP = 'weigh-to-go';
const FORMAT = 1;

export interface Diary {
  readonly weighIns: StoredWeighIn[];
  readonly profile: Profile;
}

/**
 * The diary in a file's text, with how many rows were left out because they can't be read (a later
 * version of the app may check weigh-ins more strictly), or null when it isn't a diary at all.
 */
export function parseDiary(text: string): { diary: Diary; skipped: number } | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { app, format, weighIns, profile } = value as Record<string, unknown>;
  if (app !== APP || format !== FORMAT || !Array.isArray(weighIns)) return null;
  if (typeof profile !== 'object' || profile === null) return null;
  const rows: unknown[] = weighIns;
  const isRow = (r: unknown): r is StoredWeighIn =>
    typeof r === 'object' && r !== null && isStoredWeighIn(r as StoredWeighIn);
  const good = rows.filter(isRow);
  return {
    diary: { weighIns: good.sort(byDate), profile: toProfile(profile) },
    skipped: rows.length - good.length,
  };
}

const diaryText = (weighIns: readonly StoredWeighIn[], profile: Profile): string =>
  JSON.stringify({ app: APP, format: FORMAT, weighIns, profile });

const ASIDE_PREFIX = 'weigh-ins.unreadable-';
/** The name a diary file that couldn't be read is kept under, beside the new one. */
export const asideName = (now: Date): string =>
  `${ASIDE_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}.json`;

interface Loaded {
  readonly diary: Diary;
  /** The name a file that couldn't be read (wholly or in part) was kept under, or null. */
  readonly setAside: string | null;
}

const EMPTY_DIARY: Diary = { weighIns: [], profile: EMPTY_PROFILE };

/**
 * Reads the diary. A good diary file is the diary (a temporary file beside it is a write that never
 * finished, and is dropped). With no diary file, a temporary file is a write cut short after the old
 * file was gone: if it is whole it is the newer diary and is put in place; if not, it was never the
 * diary and is dropped. A diary file that can't be read is never written over: it is kept aside, and
 * the person told; one with some rows that can't be read keeps a copy aside and loads the others.
 * Rejects when the files can't be read, or a file that can't be read can't be kept aside.
 */
async function load(fs: FileBackend, now: Date): Promise<Loaded> {
  let setAside: string | null = null;
  const text = await fs.read(DIARY_FILE);
  if (text !== null) {
    const parsed = parseDiary(text);
    if (parsed) {
      if (parsed.skipped > 0) {
        setAside = asideName(now);
        await fs.write(setAside, text);
        // The diary without the rows that can't be read, so the copy is made once, not every launch.
        await fs.write(DIARY_TEMP, diaryText(parsed.diary.weighIns, parsed.diary.profile));
        await fs.rename(DIARY_TEMP, DIARY_FILE).catch((error: unknown) => {
          console.warn(error);
        });
        return { diary: parsed.diary, setAside };
      }
      await fs.remove(DIARY_TEMP).catch((error: unknown) => {
        console.warn(error);
      });
      return { diary: parsed.diary, setAside };
    }
    setAside = asideName(now);
    await fs.rename(DIARY_FILE, setAside);
  }
  const temp = await fs.read(DIARY_TEMP);
  if (temp === null) return { diary: EMPTY_DIARY, setAside };
  const parsed = parseDiary(temp);
  if (!parsed) {
    await fs.remove(DIARY_TEMP).catch((error: unknown) => {
      console.warn(error);
    });
    return { diary: EMPTY_DIARY, setAside };
  }
  // If this fails, the next change writes the diary in place anyway.
  await fs.rename(DIARY_TEMP, DIARY_FILE).catch((error: unknown) => {
    console.warn(error);
  });
  return { diary: parsed.diary, setAside };
}

export interface DeviceStoreOptions {
  /** For tests. */
  readonly now?: Date;
  /**
   * Weigh-ins kept elsewhere before, to start from while the diary holds none: written as the
   * diary, or null for none.
   */
  readonly seed?: () => Promise<Diary | null>;
}

/** Opens the diary in `fs`; rejects as `load` does. */
export async function deviceStore(fs: FileBackend, options: DeviceStoreOptions = {}): Promise<Store> {
  const { diary, setAside } = await load(fs, options.now ?? new Date());
  const inner = memoryStore('unsupported');
  await inner.replace(diary.weighIns, diary.profile);

  let queue: Promise<unknown> = Promise.resolve();
  /** Runs `work` after everything queued before it, whatever became of that. */
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  /**
   * Puts the written temporary file in place. On iOS a rename deletes the old file first, then
   * moves: if the move fails after the delete, only the new file is left, so it is tried once more
   * rather than reported as a failure that the next launch would contradict.
   */
  const commit = async () => {
    try {
      await fs.rename(DIARY_TEMP, DIARY_FILE);
    } catch (error) {
      const old = await fs.read(DIARY_FILE).catch(() => 'unknown');
      if (old !== null) throw error;
      await fs.rename(DIARY_TEMP, DIARY_FILE);
    }
  };
  /** Applies a change in memory, then writes the whole diary; undoes it in memory if the write fails. */
  const change = <T>(work: () => Promise<T>): Promise<T> =>
    serial(async () => {
      const before = { weighIns: await inner.weighIns(), profile: await inner.profile() };
      try {
        const result = await work();
        await fs.write(DIARY_TEMP, diaryText(await inner.weighIns(), await inner.profile()));
        await commit();
        return result;
      } catch (error) {
        await inner.replace(before.weighIns, before.profile);
        throw error;
      }
    });

  if (diary.weighIns.length === 0 && options.seed) {
    const seed = await options.seed();
    // A seed that can't be written stays where it was, for the next opening to try again.
    if (seed) {
      await change(() => inner.replace(seed.weighIns, seed.profile)).catch((error: unknown) => {
        console.warn(error);
      });
    }
  }

  return {
    kind: 'device',
    reason: null,
    needsReload: false,
    setAside,
    weighIns: () => serial(() => inner.weighIns()),
    put: (weighIns, profile) => change(() => inner.put(weighIns, profile)),
    merge: (weighIns, profile) => change(() => inner.merge(weighIns, profile)),
    remove: (date) => change(() => inner.remove(date)),
    profile: () => serial(() => inner.profile()),
    setProfile: (profile) => change(() => inner.setProfile(profile)),
    updateProfile: (fields) => change(() => inner.updateProfile(fields)),
    replace: (weighIns, profile) => change(() => inner.replace(weighIns, profile)),
    // An empty diary, written like any change (the file stays, holding nothing), and no copy set
    // aside left behind.
    clear: async () => {
      await change(() => inner.clear());
      for (const name of await fs.list()) if (name.startsWith(ASIDE_PREFIX)) await fs.remove(name);
    },
    // One app, one store: there are no other tabs to hear from.
    onChange: () => () => undefined,
    close: () => undefined,
  };
}
