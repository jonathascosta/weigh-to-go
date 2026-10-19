/**
 * Screen preferences (language, units, which sections and layers show) in localStorage. They are
 * conveniences: if the browser keeps nothing, or a saved value no longer makes sense, the default
 * is used and the page works the same.
 */

export const PREFS_PREFIX = 'weigh-to-go:';

function storage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    // Reading localStorage itself throws where site data is blocked.
    return null;
  }
}

/** The saved preference `key` if `valid` accepts it, `fallback` otherwise. */
export function readPref<T>(key: string, valid: (value: unknown) => value is T, fallback: T): T {
  try {
    const text = storage()?.getItem(PREFS_PREFIX + key);
    if (text === null || text === undefined) return fallback;
    const value: unknown = JSON.parse(text);
    return valid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Saves the preference `key`; returns whether it was kept. */
export function writePref(key: string, value: unknown): boolean {
  try {
    const store = storage();
    if (!store) return false;
    store.setItem(PREFS_PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Removes every preference of this app, leaving other keys on the origin alone. */
export function clearPrefs(): void {
  try {
    const store = storage();
    if (!store) return;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key?.startsWith(PREFS_PREFIX)) keys.push(key);
    }
    for (const key of keys) store.removeItem(key);
  } catch {
    // Nothing kept, nothing to clear.
  }
}

/** A guard for one of a fixed set of values, for `readPref`. */
export const oneOf =
  <T>(values: readonly T[]) =>
  (value: unknown): value is T =>
    values.includes(value as T);
