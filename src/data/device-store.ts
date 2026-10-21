/**
 * The iPhone app's store (docs/sprint-3.md, story 2): the weigh-ins and the profile in one JSON file
 * in the app's own container, which iOS keeps (and backs up with the phone) where a web view's
 * IndexedDB may be cleared. The work happens in memory, as in `memoryStore`, and every change is then
 * written whole: first to a temporary file, then renamed over the old one, so a write cut short
 * leaves the last good file. One queue runs every operation in turn, so two changes made close
 * together both land. A change whose write fails is undone in memory and rejects.
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
}

export const DIARY_FILE = 'weigh-ins.json';
export const DIARY_TEMP = 'weigh-ins.json.tmp';
const APP = 'weigh-to-go';
const FORMAT = 1;

interface Diary {
  readonly weighIns: StoredWeighIn[];
  readonly profile: Profile;
}

/** The diary in a file's text, or null when it isn't one this store wrote. */
export function parseDiary(text: string): Diary | null {
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
  if (!rows.every(isRow)) return null;
  return { weighIns: [...rows].sort(byDate), profile: toProfile(profile) };
}

const diaryText = (weighIns: readonly StoredWeighIn[], profile: Profile): string =>
  JSON.stringify({ app: APP, format: FORMAT, weighIns, profile });

/**
 * Reads the diary: the file if it is a good one; else a temporary file left by a write cut short
 * between its two steps, once the old file was gone (the newer data, which is then put in place);
 * else nothing, a new diary. Rejects when a file is there but isn't a diary, rather than start an
 * empty one that would write over it.
 */
async function load(fs: FileBackend): Promise<Diary> {
  const text = await fs.read(DIARY_FILE);
  if (text !== null) {
    const diary = parseDiary(text);
    if (!diary) throw new Error(`${DIARY_FILE} is not a diary this app can read`);
    // A temporary file beside a good diary is a write that never finished: the diary stands.
    await fs.remove(DIARY_TEMP);
    return diary;
  }
  const temp = await fs.read(DIARY_TEMP);
  if (temp === null) return { weighIns: [], profile: EMPTY_PROFILE };
  const diary = parseDiary(temp);
  if (!diary) throw new Error(`${DIARY_TEMP} is not a diary this app can read`);
  await fs.rename(DIARY_TEMP, DIARY_FILE);
  return diary;
}

/** Opens the diary in `fs`; rejects when there is one that can't be read (see `load`). */
export async function deviceStore(fs: FileBackend): Promise<Store> {
  const { weighIns: saved, profile: savedProfile } = await load(fs);
  const inner = memoryStore('unsupported');
  await inner.replace(saved, savedProfile);

  let queue: Promise<unknown> = Promise.resolve();
  /** Runs `work` after everything queued before it, whatever became of that. */
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };
  /** Applies a change in memory, then writes the whole diary; undoes it in memory if the write fails. */
  const change = <T>(work: () => Promise<T>): Promise<T> =>
    serial(async () => {
      const before = { weighIns: await inner.weighIns(), profile: await inner.profile() };
      try {
        const result = await work();
        await fs.write(DIARY_TEMP, diaryText(await inner.weighIns(), await inner.profile()));
        await fs.rename(DIARY_TEMP, DIARY_FILE);
        return result;
      } catch (error) {
        await inner.replace(before.weighIns, before.profile);
        throw error;
      }
    });

  return {
    kind: 'device',
    reason: null,
    needsReload: false,
    weighIns: () => serial(() => inner.weighIns()),
    put: (weighIns, profile) => change(() => inner.put(weighIns, profile)),
    merge: (weighIns, profile) => change(() => inner.merge(weighIns, profile)),
    remove: (date) => change(() => inner.remove(date)),
    profile: () => serial(() => inner.profile()),
    setProfile: (profile) => change(() => inner.setProfile(profile)),
    updateProfile: (fields) => change(() => inner.updateProfile(fields)),
    replace: (weighIns, profile) => change(() => inner.replace(weighIns, profile)),
    clear: () => change(() => inner.clear()),
    // One app, one store: there are no other tabs to hear from.
    onChange: () => () => undefined,
    close: () => undefined,
  };
}
