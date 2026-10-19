/**
 * Asks the browser to keep this site's data under storage pressure. Without it, a browser may
 * evict IndexedDB from a site not visited in a while (Safari after seven days without a visit,
 * unless installed). Browsers decide on their own: Chrome grants it to sites that are bookmarked or
 * installed, Firefox may ask the person.
 */
export type Persistence = 'persisted' | 'not-persisted' | 'unsupported';

/** The browser's storage manager; missing outside a secure context, whatever the DOM types say. */
const browserStorage = (): StorageManager | undefined =>
  typeof navigator === 'undefined' ? undefined : navigator.storage;

/** `storage` is for tests. */
export async function requestPersistence(
  storage: StorageManager | undefined = browserStorage(),
): Promise<Persistence> {
  if (storage === undefined || typeof storage.persist !== 'function') return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'unsupported';
  }
}
