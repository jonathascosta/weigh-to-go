/**
 * The iPhone app's side of saveFile (save.ts): the file is written to an exports folder in the app's
 * cache, offered through the share sheet, and deleted once the sheet closes, so no copy of the diary
 * stays behind. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** @capacitor/share's rejection when the reader closes the sheet without sharing. */
export const SHARE_CANCELED = 'Share canceled';

/** Resolves true once the reader picked where the file goes, false when they closed the sheet. */
export async function shareFile(name: string, text: string): Promise<boolean> {
  const file = { path: `exports/${name}`, directory: Directory.Cache };
  const { uri } = await Filesystem.writeFile({
    ...file,
    data: text,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  try {
    await Share.share({ title: name, files: [uri] });
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === SHARE_CANCELED) return false;
    throw error;
  } finally {
    // Gone once the sheet has closed: a copy of the diary never stays in the cache.
    await Filesystem.deleteFile(file).catch((error: unknown) => {
      console.warn(error);
    });
  }
}
