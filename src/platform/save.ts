/**
 * Hands a file the page made to the reader. On the website, a download made from the text, never a
 * request anywhere. In the iPhone app, where a web view can't download, the share sheet (Files,
 * AirDrop, Mail…): the native part loads only in the app's build, so the website carries none of it.
 */

/** Resolves true once the file was handed over, false when the reader cancelled the share sheet. */
export async function saveFile(name: string, text: string, type: string): Promise<boolean> {
  if (import.meta.env.MODE === 'ios') {
    const { shareFile } = await import('./share-native');
    return shareFile(name, text);
  }
  download(name, text, type);
  return true;
}

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the download to start; the URL is only this page's.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}
