import { clearPrefs } from './prefs';
import { deleteDatabase, type Store } from './store';

/**
 * Erases everything the app keeps on this device: weigh-ins, profile and screen preferences. When
 * the store can't reach the database (it runs in memory, or lost the database to a newer page in
 * another tab), the database is deleted on disk instead, since the data may still be there.
 * Preferences are cleared whatever happens. Returns whether the data is known to be gone.
 * `factory` is for tests.
 */
export async function eraseEverything(store: Store, factory?: IDBFactory | null): Promise<boolean> {
  try {
    let cleared = false;
    try {
      await store.clear();
      // Without storage nothing ever reached the disk: clearing memory is all there is to erase.
      cleared = store.kind === 'indexeddb' || store.reason === 'unsupported';
    } catch {
      // Reached below, through the database itself.
    }
    return cleared || (await deleteDatabase(factory));
  } finally {
    clearPrefs();
  }
}
