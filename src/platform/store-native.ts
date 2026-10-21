/**
 * The iPhone app's store: the diary file (device-store.ts) in the app's Library folder, which iOS
 * keeps, backs up with the phone and doesn't show in the Files app. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { deviceStore, type Diary, type FileBackend } from '../data/device-store';
import { deleteDatabase, openStore, type Store } from '../data/store';

const FOLDER = 'diary';
/** The plugin's error code for a file that isn't there. */
export const NO_FILE = 'OS-PLUG-FILE-0008';
const at = (name: string) => ({ path: `${FOLDER}/${name}`, directory: Directory.Library });
const missing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === NO_FILE;

export const libraryFiles: FileBackend = {
  // A missing file is no data; any other failure to read must not be taken for one.
  read: async (name) => {
    try {
      const { data } = await Filesystem.readFile({ ...at(name), encoding: Encoding.UTF8 });
      return typeof data === 'string' ? data : await data.text();
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  },
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
  list: async () => {
    try {
      return (await Filesystem.readdir({ path: FOLDER, directory: Directory.Library })).files.map(
        (f) => f.name,
      );
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  },
  remove: async (name) => {
    try {
      await Filesystem.deleteFile(at(name));
    } catch (error) {
      if (!missing(error)) throw error;
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

const profileFields = async (store: Store): Promise<number> => {
  const { goalKg, heightCm } = await store.profile();
  return Number(goalKg !== null) + Number(heightCm !== null);
};

export async function openNativeStore(): Promise<Store> {
  const seed = { taken: false };
  const store = await deviceStore(libraryFiles, {
    seed: async () => {
      const diary = await fromIndexedDb().catch(() => null);
      seed.taken = diary !== null;
      return diary;
    },
  });
  // Only once the diary holds it: a seed that couldn't be written is tried again next time.
  if (seed.taken && (await store.weighIns()).length + (await profileFields(store)) > 0) {
    await deleteDatabase();
  }
  return {
    ...store,
    // Erasing reaches an earlier build's database too, if it is still there.
    clear: async () => {
      await store.clear();
      await deleteDatabase();
    },
  };
}
