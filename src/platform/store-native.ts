/**
 * The iPhone app's store: the diary file (device-store.ts) in the app's Library folder, which iOS
 * keeps, backs up with the phone and doesn't show in the Files app. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { deviceStore, type FileBackend } from '../data/device-store';
import type { Store } from '../data/store';

const FOLDER = 'diary';
const at = (name: string) => ({ path: `${FOLDER}/${name}`, directory: Directory.Library });

/** Whether the file is there: a missing file is no data, any other failure to read must not be. */
async function exists(name: string): Promise<boolean> {
  try {
    await Filesystem.stat(at(name));
    return true;
  } catch {
    return false;
  }
}

export const libraryFiles: FileBackend = {
  read: async (name) => {
    if (!(await exists(name))) return null;
    const { data } = await Filesystem.readFile({ ...at(name), encoding: Encoding.UTF8 });
    return typeof data === 'string' ? data : data.text();
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
  remove: async (name) => {
    if (await exists(name)) await Filesystem.deleteFile(at(name));
  },
};

export const openNativeStore = (): Promise<Store> => deviceStore(libraryFiles);
