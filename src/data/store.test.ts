import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type StoredWeighIn } from './records';
import { DB_NAME, memoryStore, openStore, type Store } from './store';

const at = '2026-10-19T08:00:00.000Z';
const w = (date: string, kg: number): StoredWeighIn => ({ date, kg, savedAt: at });

const kinds: [string, () => Promise<Store>][] = [
  ['indexeddb', () => openStore(new IDBFactory())],
  ['memory', () => Promise.resolve(memoryStore())],
];

describe.each(kinds)('%s store', (kind, open) => {
  it('opens as the expected kind, empty', async () => {
    const store = await open();
    expect(store.kind).toBe(kind);
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual(EMPTY_PROFILE);
  });

  it('keeps weigh-ins by date, sorted, the later save winning', async () => {
    const store = await open();
    await store.put([w('2026-10-19', 108.2), w('2026-10-17', 109)]);
    await store.put([w('2026-10-19', 107.9)]);
    expect(await store.weighIns()).toEqual([w('2026-10-17', 109), w('2026-10-19', 107.9)]);
  });

  it('removes one weigh-in', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109), w('2026-10-18', 108.6)]);
    await store.remove('2026-10-17');
    expect(await store.weighIns()).toEqual([w('2026-10-18', 108.6)]);
  });

  it('keeps the profile, alone or with weigh-ins', async () => {
    const store = await open();
    await store.setProfile({ goalKg: 90, heightCm: null });
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: null });
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 180 });
    await store.put([w('2026-10-18', 108)]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 180 });
  });

  it('replaces everything at once', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    await store.replace([w('2026-01-02', 120)], { goalKg: null, heightCm: 175 });
    expect(await store.weighIns()).toEqual([w('2026-01-02', 120)]);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 175 });
  });

  it('erases everything', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    await store.clear();
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual(EMPTY_PROFILE);
  });
});

describe('the IndexedDB store', () => {
  it('keeps the data for the next visit', async () => {
    const factory = new IDBFactory();
    const first = await openStore(factory);
    await first.put([w('2026-10-17', 109.3)], { goalKg: 90, heightCm: 178 });
    const second = await openStore(factory);
    expect(await second.weighIns()).toEqual([w('2026-10-17', 109.3)]);
    expect(await second.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('keeps a pound reading unrounded', async () => {
    const store = await openStore(new IDBFactory());
    const kg = 176.2 * 0.45359237;
    await store.put([w('2026-10-17', kg)]);
    expect((await store.weighIns())[0]!.kg / 0.45359237).toBeCloseTo(176.2, 10);
  });

  it('skips damaged rows instead of failing', async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    await store.put([w('2026-10-17', 109)]);
    // Write rows the app would never save, straight into the database.
    await new Promise<void>((resolve, reject) => {
      const req = factory.open(DB_NAME);
      req.onsuccess = () => {
        const tx = req.result.transaction(['weighIns', 'profile'], 'readwrite');
        tx.objectStore('weighIns').put({ date: '2026-02-30', kg: 100 });
        tx.objectStore('weighIns').put({ date: '2026-10-18', kg: 'heavy' });
        tx.objectStore('profile').put({ goalKg: -3, heightCm: 180 }, 'profile');
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => {
          reject(new Error('write failed'));
        };
      };
    });
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-17']);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 180 });
  });

  it('falls back to memory without IndexedDB, or when the browser refuses it', async () => {
    expect((await openStore(undefined)).kind).toBe('memory');
    const refusing = {
      open: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    expect((await openStore(refusing)).kind).toBe('memory');
  });
});
