import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eraseEverything } from './erase';
import { fakeStorage } from './fake-storage.test-helper';
import { pref, writePref } from './prefs';
import { memoryStore, openStore } from './store';

const at = '2026-10-17T08:00:00.000Z';
const unit = pref('unit', (v: unknown): v is string => typeof v === 'string', 'kg');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('eraseEverything', () => {
  it('erases the data and the preferences', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const store = await openStore(new IDBFactory());
    await store.put([{ date: '2026-10-17', kg: 100, savedAt: at }], {
      goalKg: 90,
      heightCm: 180,
      birthYear: 1983,
      sex: 'female',
    });
    expect(await store.profile()).toMatchObject({ birthYear: 1983, sex: 'female' });
    writePref('unit', 'lb');
    await eraseEverything(store);
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: null, birthYear: null, sex: null });
    expect(unit.read()).toBe('kg');
    store.close();
  });

  it('reports success without storage, where nothing ever reached the disk', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(await eraseEverything(memoryStore('unsupported'), null)).toBe(true);
  });

  it("doesn't report success when the app's diary couldn't be reached", async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    // The app passes no database to fall back on: its diary is a file.
    expect(await eraseEverything(memoryStore('error'), null)).toBe(false);
  });

  it('deletes the database on disk when the page runs in memory', async () => {
    vi.stubGlobal('localStorage', fakeStorage());
    const factory = new IDBFactory();
    const disk = await openStore(factory);
    await disk.put([{ date: '2026-10-17', kg: 100, savedAt: at }]);
    disk.close();
    expect(await eraseEverything(memoryStore('error'), factory)).toBe(true);
    const again = await openStore(factory);
    expect(await again.weighIns()).toEqual([]);
    again.close();
  });
});
