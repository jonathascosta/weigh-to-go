/**
 * Files in the app's Library folder, read without asking for one that isn't there: Capacitor logs
 * every failed plugin call as an error, so a first launch, with no files yet, would look broken in
 * the logs (and fail the simulator check, which treats any logged error as a failure). The folder
 * is listed first, and only a file it holds is read. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { isMissingFile } from './file-errors';

const names = async (path: string): Promise<string[]> =>
  (await Filesystem.readdir({ path, directory: Directory.Library })).files.map((f) => f.name);

/** The names in `folder` (a folder directly in Library), or none when there is no such folder. */
export async function namesIn(folder: string): Promise<string[]> {
  if (!(await names('')).includes(folder)) return [];
  try {
    return await names(folder);
  } catch (error) {
    // Gone between the two listings.
    if (isMissingFile(error)) return [];
    throw error;
  }
}

/** The text of `folder/name`, or null when there is no such file; any other failure rejects. */
export async function readText(folder: string, name: string): Promise<string | null> {
  if (!(await namesIn(folder)).includes(name)) return null;
  try {
    const { data } = await Filesystem.readFile({
      path: `${folder}/${name}`,
      directory: Directory.Library,
      encoding: Encoding.UTF8,
    });
    return typeof data === 'string' ? data : await data.text();
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}
