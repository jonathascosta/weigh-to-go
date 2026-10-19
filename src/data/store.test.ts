import { forceCloseDatabase, IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type StoredWeighIn } from './records';
import { eraseEverything } from './erase';
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

/** A factory that remembers every connection it opens, so a test can have the browser close one. */
function spied(): { factory: IDBFactory; connections: IDBDatabase[] } {
  const factory = new IDBFactory();
  const connections: IDBDatabase[] = [];
  const open = factory.open.bind(factory);
  factory.open = (name, version) => {
    const req = open(name, version);
    req.addEventListener('success', () => {
      connections.push(req.result);
    });
    return req;
  };
  return { factory, connections };
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

  it('changes only the profile fields given, so two saves close together both land', async () => {
    const store = await open();
    await store.setProfile({ goalKg: 90, heightCm: null });
    // Sent together, as a goal saved and a height saved a moment later.
    await Promise.all([store.updateProfile({ goalKg: 85 }), store.updateProfile({ heightCm: 178 })]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 178 });
    await store.updateProfile({ goalKg: null });
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 178 });
    await expect(store.updateProfile({ heightCm: 20 })).rejects.toThrow(TypeError);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 178 });
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
    expect(result).toEqual({ added: 1, updated: 1, kept: 1, unchanged: 0 });
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

  it('merges repeated incoming days by their save time, as one', async () => {
    const store = await open();
    const result = await store.merge(
      [w('2026-10-19', 100, '2026-10-19T10:00:00Z'), w('2026-10-19', 90, '2026-10-19T08:00:00Z')],
      null,
    );
    expect(result).toEqual({ added: 1, updated: 0, kept: 0, unchanged: 0 });
    expect((await store.weighIns()).map((x) => x.kg)).toEqual([100]);
  });

  it('counts a day with the same weight as unchanged, whatever its save time', async () => {
    const store = await open();
    await store.put([w('2026-10-17', 109, '2026-10-17T08:00:00Z')]);
    expect(await store.merge([w('2026-10-17', 109, '2026-10-18T08:00:00Z')], null)).toEqual({
      added: 0,
      updated: 0,
      kept: 0,
      unchanged: 1,
    });
    expect((await store.weighIns())[0]!.savedAt).toBe('2026-10-17T08:00:00Z');
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

  it('opens again after the browser closes the connection', async () => {
    const { factory, connections } = spied();
    const store = track(await openStore(factory));
    await store.put([w('2026-10-17', 109)]);
    forceCloseDatabase(connections[0]! as never);
    await store.put([w('2026-10-18', 108)]);
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-17', '2026-10-18']);
    expect(store.needsReload).toBe(false);
  });

  it('opens again, once, when a lost connection makes transaction() throw', async () => {
    const { factory, connections } = spied();
    const store = track(await openStore(factory));
    await store.put([w('2026-10-17', 109)]);
    const lost = connections[0]!;
    lost.transaction = () => {
      throw new DOMException('Connection to Indexed Database server lost', 'UnknownError');
    };
    expect(await store.weighIns()).toEqual([w('2026-10-17', 109)]);
    expect(connections).toHaveLength(2);
  });

  it('does not open again for other errors', async () => {
    const { factory, connections } = spied();
    const store = track(await openStore(factory));
    connections[0]!.transaction = () => {
      throw new DOMException('no such store', 'NotFoundError');
    };
    await expect(store.weighIns()).rejects.toThrow('no such store');
    expect(connections).toHaveLength(1);
  });

  it('asks for a reload once another tab moves to a newer version, and still erases', async () => {
    const factory = new IDBFactory();
    const store = track(await openStore(factory));
    await store.put([w('2026-10-17', 109)]);
    (await raw(factory, 2)).close();
    await expect(store.weighIns()).rejects.toThrow('version');
    expect(store.needsReload).toBe(true);
    expect(await eraseEverything(store, factory)).toBe(true);
    const fresh = track(await openStore(factory));
    expect(await fresh.weighIns()).toEqual([]);
  });

  it('reports a write that commits after close() as saved', async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    const saving = store.put([w('2026-10-17', 109)]);
    store.close();
    await expect(saving).resolves.toBeUndefined();
    const again = track(await openStore(factory));
    expect(await again.weighIns()).toEqual([w('2026-10-17', 109)]);
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
    expect(await openStore(factory)).toMatchObject({ kind: 'memory', reason: 'version', needsReload: true });
  });

  it('counts a refusal that arrives later (older Firefox private windows) as unsupported', async () => {
    const refusing = {
      open: () => {
        const req = {} as IDBOpenDBRequest & { onerror: () => void };
        setTimeout(() => {
          Object.defineProperty(req, 'error', { value: new DOMException('private', 'InvalidStateError') });
          req.onerror();
        }, 0);
        return req;
      },
    } as unknown as IDBFactory;
    expect(await openStore(refusing)).toMatchObject({
      kind: 'memory',
      reason: 'unsupported',
      needsReload: false,
    });
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
