import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type StoredWeighIn } from './records';
import { DB_NAME, memoryStore, openStore, type Store } from './store';

const at = '2026-10-19T08:00:00.000Z';
const w = (date: string, kg: number, savedAt = at): StoredWeighIn => ({ date, kg, savedAt });

const opened: Store[] = [];
const track = (store: Store): Store => {
  opened.push(store);
  return store;
};
afterEach(() => {
  for (const store of opened.splice(0)) store.close();
});

/** Opens the raw database at `version`, runs `work` in a readwrite transaction on both stores. */
function raw(factory: IDBFactory, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, version);
    req.onupgradeneeded = () => {
      for (const name of ['weighIns', 'profile'])
        if (!req.result.objectStoreNames.contains(name))
          req.result.createObjectStore(name, name === 'weighIns' ? { keyPath: 'date' } : undefined);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(new Error('open failed'));
    };
  });
}

const kinds: [string, () => Promise<Store>][] = [
  ['indexeddb', async () => track(await openStore(new IDBFactory()))],
  ['memory', () => Promise.resolve(memoryStore())],
];

describe.each(kinds)('%s store', (kind, open) => {
  it('opens as the expected kind, empty', async () => {
    const store = await open();
    expect(store.kind).toBe(kind);
    expect(store.reason).toBe(kind === 'memory' ? 'unsupported' : null);
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

  it('replaces everything at once, keeping the profile unless one is given', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    await store.replace([w('2026-01-02', 120)]);
    expect(await store.weighIns()).toEqual([w('2026-01-02', 120)]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 180 });
    await store.replace([], { goalKg: null, heightCm: 175 });
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 175 });
  });

  it('merges: the later save wins a shared day, given profile fields replace', async () => {
    const store = await open();
    await store.put(
      [w('2026-10-10', 111), w('2026-10-17', 109, '2026-10-17T08:00:00Z'), w('2026-10-18', 108.4, at)],
      { goalKg: 90, heightCm: 178 },
    );
    const result = await store.merge(
      [
        w('2026-10-17', 108.9, '2026-10-17T09:00:00+00:00'),
        w('2026-10-18', 108.6, '2026-10-18T09:00:00Z'),
        w('2026-10-19', 108),
      ],
      { goalKg: 85, heightCm: null },
    );
    expect(result).toEqual({ added: 1, updated: 1, kept: 1 });
    expect((await store.weighIns()).map((x) => [x.date, x.kg])).toEqual([
      ['2026-10-10', 111],
      ['2026-10-17', 108.9],
      ['2026-10-18', 108.4],
      ['2026-10-19', 108],
    ]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 178 });
  });

  it('merges without a profile, leaving the one here', async () => {
    const store = await open();
    await store.setProfile({ goalKg: 90, heightCm: 178 });
    await store.merge([w('2026-10-19', 108)], null);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('refuses a write the checks reject, changing nothing', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    await expect(store.replace([w('2026-10-18', 108), w('2026-10-19', Number.NaN)])).rejects.toThrow(
      TypeError,
    );
    await expect(store.put([w('2026-10-18', 5000)])).rejects.toThrow(TypeError);
    await expect(store.put([w('2026-02-30', 100)])).rejects.toThrow(TypeError);
    await expect(store.put([w('2026-10-18', 100, 'yesterday')])).rejects.toThrow(TypeError);
    await expect(store.setProfile({ goalKg: 5, heightCm: null })).rejects.toThrow(TypeError);
    await expect(store.merge([w('2026-10-18', 1)], null)).rejects.toThrow(TypeError);
    expect(await store.weighIns()).toEqual([w('2026-10-17', 109)]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 180 });
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
    const first = track(await openStore(factory));
    await first.put([w('2026-10-17', 109.3)], { goalKg: 90, heightCm: 178 });
    const second = track(await openStore(factory));
    expect(await second.weighIns()).toEqual([w('2026-10-17', 109.3)]);
    expect(await second.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('keeps a pound reading unrounded', async () => {
    const store = track(await openStore(new IDBFactory()));
    await store.put([w('2026-10-17', 176.2 * 0.45359237)]);
    expect((await store.weighIns())[0]!.kg / 0.45359237).toBeCloseTo(176.2, 10);
  });

  it('lands nothing when a write fails partway', async () => {
    const store = track(await openStore(new IDBFactory()));
    await store.put([w('2026-10-17', 109)], { goalKg: 85, heightCm: 180 });
    // Passes the checks but can't be stored: a getter that throws while the row is cloned.
    const poisoned = w('2026-10-19', 108);
    Object.defineProperty(poisoned, 'savedAt', {
      get: (() => {
        let reads = 0;
        return () => (++reads > 1 ? Symbol('no') : at);
      })(),
    });
    await expect(
      store.replace([w('2026-10-18', 108.5), poisoned], { goalKg: 80, heightCm: 180 }),
    ).rejects.toThrow();
    expect(await store.weighIns()).toEqual([w('2026-10-17', 109)]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 180 });
  });

  it('skips damaged rows instead of failing', async () => {
    const factory = new IDBFactory();
    const store = track(await openStore(factory));
    await store.put([w('2026-10-17', 109)]);
    const db = await raw(factory);
    await new Promise<void>((resolve) => {
      const tx = db.transaction(['weighIns', 'profile'], 'readwrite');
      tx.objectStore('weighIns').put({ date: '2026-02-30', kg: 100 });
      tx.objectStore('weighIns').put({ date: '2026-10-18', kg: 'heavy' });
      tx.objectStore('profile').put({ goalKg: -3, heightCm: 180 }, 'profile');
      tx.oncomplete = () => {
        resolve();
      };
    });
    db.close();
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-17']);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 180 });
  });

  it('opens again after the connection is closed', async () => {
    const factory = new IDBFactory();
    const store = track(await openStore(factory));
    await store.put([w('2026-10-17', 109)]);
    // Another tab deletes the database: this connection is asked to close, and lets go.
    await new Promise<void>((resolve) => {
      factory.deleteDatabase(DB_NAME).onsuccess = () => {
        resolve();
      };
    });
    await store.put([w('2026-10-18', 108)]);
    expect(await store.weighIns()).toEqual([w('2026-10-18', 108)]);
  });

  it('tells other stores, not itself, of a change', async () => {
    const factory = new IDBFactory();
    const a = track(await openStore(factory));
    const b = track(await openStore(factory));
    let heardA = 0;
    let heardB = 0;
    a.onChange(() => heardA++);
    const stop = b.onChange(() => heardB++);
    await a.put([w('2026-10-17', 109)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect([heardA, heardB]).toEqual([0, 1]);
    stop();
    await a.put([w('2026-10-18', 109)]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heardB).toBe(1);
  });

  it('refuses work once closed', async () => {
    const store = await openStore(new IDBFactory());
    store.close();
    await expect(store.weighIns()).rejects.toThrow('closed');
  });
});

describe('opening the store', () => {
  it('falls back to memory without IndexedDB, or when the browser refuses it', async () => {
    expect((await openStore(undefined)).reason).toBe('unsupported');
    expect((await openStore(null)).reason).toBe('unsupported');
    const refusing = {
      open: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as IDBFactory;
    expect(await openStore(refusing)).toMatchObject({ kind: 'memory', reason: 'unsupported' });
  });

  it('says when the database is newer than the page', async () => {
    const factory = new IDBFactory();
    (await raw(factory, 2)).close();
    expect(await openStore(factory)).toMatchObject({ kind: 'memory', reason: 'version' });
  });

  it('says when opening fails later, or never answers', async () => {
    const failing = {
      open: () => {
        const req = {} as IDBOpenDBRequest & { onerror: () => void };
        setTimeout(() => {
          Object.defineProperty(req, 'error', { value: new DOMException('broken', 'UnknownError') });
          req.onerror();
        }, 0);
        return req;
      },
    } as unknown as IDBFactory;
    expect(await openStore(failing)).toMatchObject({ kind: 'memory', reason: 'error' });
    const silent = { open: () => ({}) } as unknown as IDBFactory;
    expect(await openStore(silent, 10)).toMatchObject({ kind: 'memory', reason: 'error' });
  });
});
