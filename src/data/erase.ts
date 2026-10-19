import { clearPrefs } from './prefs';
import type { Store } from './store';

/** Erases everything the app keeps on this device: weigh-ins, profile and screen preferences. */
export async function eraseEverything(store: Store): Promise<void> {
  await store.clear();
  clearPrefs();
}
