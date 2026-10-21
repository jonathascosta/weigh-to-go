/**
 * The iPhone app's side of saveFile (save.ts): the file is written to the app's own cache and offered
 * through the share sheet. Loaded only in the app's build.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Resolves true once the reader picked where the file goes, false when they closed the sheet. */
export async function shareFile(name: string, text: string): Promise<boolean> {
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri] });
    return true;
  } catch (error) {
    // Closing the sheet rejects with "Share canceled"; anything else is a real failure. The file
    // stays in the cache, which iOS clears on its own, so a slow destination can still read it.
    if (error instanceof Error && /cancel/i.test(error.message)) return false;
    throw error;
  }
}
