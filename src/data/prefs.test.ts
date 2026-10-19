import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from './store';
import { eraseEverything } from './erase';
import { clearPrefs, oneOf, PREFS_PREFIX, readPref, writePref } from './prefs';
import { requestPersistence } from './persist';

/** A localStorage in memory, as the browser's. */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
  };
}

const isUnit = oneOf(['kg', 'lb'] as const);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferences', () => {
  it('saves and reads back a valid value', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(true);
    expect(readPref('unit', isUnit, 'kg')).toBe('lb');
    expect(localStorage.getItem(`${PREFS_PREFIX}unit`)).toBe('"lb"');
  });

  it('falls back on a value that no longer makes sense, or broken JSON', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    localStorage.setItem(`${PREFS_PREFIX}unit`, '"stone"');
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    localStorage.setItem(`${PREFS_PREFIX}unit`, '{');
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
  });

  it('works without storage, or when it throws', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(false);
    const throwing = fakeStorage();
    throwing.setItem = () => {
      throw new DOMException('full', 'QuotaExceededError');
    };
    throwing.getItem = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.stubGlobal('localStorage', throwing);
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
    expect(writePref('unit', 'lb')).toBe(false);
    expect(() => {
      clearPrefs();
    }).not.toThrow();
  });

  it("clears only this app's keys", () => {
    vi.stubGlobal('localStorage', fakeStorage());
    writePref('unit', 'lb');
    writePref('lang', 'pt');
    localStorage.setItem('other-app', 'keep');
    clearPrefs();
    expect(localStorage.length).toBe(1);
    expect(localStorage.getItem('other-app')).toBe('keep');
  });
});

describe('eraseEverything', () => {
  it('erases the data and the preferences', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = memoryStore();
    await store.put([{ date: '2026-10-17', kg: 100, savedAt: '2026-10-17T08:00:00Z' }], {
      goalKg: 90,
      heightCm: 180,
    });
    writePref('unit', 'lb');
    await eraseEverything(store);
    expect(await store.weighIns()).toEqual([]);
    expect(readPref('unit', isUnit, 'kg')).toBe('kg');
  });
});

describe('requestPersistence', () => {
  const manager = (persisted: boolean, grant: boolean) =>
    ({
      persisted: () => Promise.resolve(persisted),
      persist: () => Promise.resolve(grant),
    }) as unknown as StorageManager;

  it('reports what the browser decides', async () => {
    expect(await requestPersistence(manager(true, false))).toBe('persisted');
    expect(await requestPersistence(manager(false, true))).toBe('persisted');
    expect(await requestPersistence(manager(false, false))).toBe('not-persisted');
  });

  it('copes with browsers without it, or that throw', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported');
    expect(await requestPersistence({} as StorageManager)).toBe('unsupported');
    const throwing = {
      persisted: () => Promise.reject(new Error('no')),
      persist: () => Promise.resolve(true),
    };
    expect(await requestPersistence(throwing as unknown as StorageManager)).toBe('unsupported');
  });
});
