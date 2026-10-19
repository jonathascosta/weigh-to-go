import { clearPrefs } from './prefs';
import { deleteDatabase, type Store } from './store';

/**
 * Erases everything the app keeps on this device: weigh-ins, profile and screen preferences. When
 * the page runs in memory the database may still be on disk (an old copy of the page, an error on
 * opening), so it is deleted too. `factory` is for tests.
 */
export async function eraseEverything(store: Store, factory?: IDBFactory | null): Promise<void> {
  await store.clear();
  if (store.kind === 'memory') await deleteDatabase(factory);
  clearPrefs();
}
