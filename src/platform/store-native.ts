/**
 * The iPhone app's store: the diary file (device-store.ts) in the app's Library folder, which iOS
 * keeps, backs up with the phone and doesn't show in the Files app. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isMissingFile } from './file-errors';
import { namesIn, readText } from './library';
import { deviceStore, type Diary, type FileBackend } from '../data/device-store';
import { deleteDatabase, openStore, type Store } from '../data/store';

const FOLDER = 'diary';
const at = (name: string) => ({ path: `${FOLDER}/${name}`, directory: Directory.Library });

export const libraryFiles: FileBackend = {
  // A missing file is no data; any other failure to read must not be taken for one.
  read: (name) => readText(FOLDER, name),
  write: async (name, text) => {
    await Filesystem.writeFile({ ...at(name), data: text, encoding: Encoding.UTF8, recursive: true });
  },
  rename: async (from, to) => {
    await Filesystem.rename({
      from: `${FOLDER}/${from}`,
      to: `${FOLDER}/${to}`,
      directory: Directory.Library,
      toDirectory: Directory.Library,
    });
  },
  list: () => namesIn(FOLDER),
  remove: async (name) => {
    if (!(await namesIn(FOLDER)).includes(name)) return;
    try {
      await Filesystem.deleteFile(at(name));
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
  },
};

/**
 * Builds before this store kept the diary in the web view's IndexedDB: while the diary is empty, what
 * is there (weigh-ins, or only a goal and height) becomes the diary, and the database goes once the
 * diary is written.
 */
async function fromIndexedDb(): Promise<Diary | null> {
  const old = await openStore();
  try {
    if (old.kind !== 'indexeddb') return null;
    const weighIns = await old.weighIns();
    const profile = await old.profile();
    const empty = weighIns.length === 0 && profile.goalKg === null && profile.heightCm === null;
    return empty ? null : { weighIns, profile };
  } finally {
    old.close();
  }
}

/** Deletes an earlier build's database; rejects if it is still there, so erasing says so. */
async function dropIndexedDb(): Promise<void> {
  if (!(await deleteDatabase())) throw new Error("Couldn't delete the earlier build's database");
}

export const openNativeStore = (): Promise<Store> =>
  deviceStore(libraryFiles, {
    seed: () => fromIndexedDb().catch(() => null),
    // Only once the diary holds it: a seed that couldn't be written is tried again next time.
    seeded: () =>
      dropIndexedDb().catch((error: unknown) => {
        console.warn(error);
      }),
    cleared: dropIndexedDb,
  });
