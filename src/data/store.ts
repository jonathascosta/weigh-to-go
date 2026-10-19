/**
 * Where the weigh-ins and the profile live: IndexedDB when the browser keeps it, memory otherwise
 * (some private windows, or storage blocked), so the page still works for the visit and can say
 * that nothing will be kept. Every write is one transaction: it all lands or none of it does.
 */
import { EMPTY_PROFILE, toProfile, toWeighIn, type Profile, type StoredWeighIn } from './records';

export interface Store {
  /** 'indexeddb' keeps the data on the device; 'memory' loses it when the page closes. */
  readonly kind: 'indexeddb' | 'memory';
  /** Every weigh-in, by date. */
  weighIns(): Promise<StoredWeighIn[]>;
  /** Saves weigh-ins, replacing any on the same dates, and the profile if given, all at once. */
  put(weighIns: readonly StoredWeighIn[], profile?: Profile): Promise<void>;
  remove(date: string): Promise<void>;
  profile(): Promise<Profile>;
  setProfile(profile: Profile): Promise<void>;
  /** Replaces everything at once: the weigh-ins and the profile. */
  replace(weighIns: readonly StoredWeighIn[], profile: Profile): Promise<void>;
  /** Erases everything. */
  clear(): Promise<void>;
  /** Calls `listener` when another tab changes the data; returns the unsubscribe. */
  onChange(listener: () => void): () => void;
}

export const DB_NAME = 'weigh-to-go';
const DB_VERSION = 1;
const WEIGH_INS = 'weighIns';
const PROFILE = 'profile';
const PROFILE_KEY = 'profile';
const CHANNEL = 'weigh-to-go:data';

const byDate = (a: StoredWeighIn, b: StoredWeighIn): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Tells the other tabs that the data changed, and listens for them. */
function tabs(): { notify: () => void; onChange: (listener: () => void) => () => void } {
  if (typeof BroadcastChannel === 'undefined')
    return { notify: () => undefined, onChange: () => () => undefined };
  // One channel for both: a channel doesn't hear its own messages, so a tab isn't told of its writes.
  const channel = new BroadcastChannel(CHANNEL);
  const listeners = new Set<() => void>();
  channel.onmessage = () => {
    for (const listener of listeners) listener();
  };
  return {
    notify: () => {
      channel.postMessage('changed');
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A store in memory: for when the browser keeps nothing, and for tests. */
export function memoryStore(): Store {
  const data = new Map<string, StoredWeighIn>();
  let profile = EMPTY_PROFILE;
  return {
    kind: 'memory',
    weighIns: () => Promise.resolve([...data.values()].sort(byDate)),
    put: (weighIns, next) => {
      for (const w of weighIns) data.set(w.date, w);
      if (next) profile = next;
      return Promise.resolve();
    },
    remove: (date) => {
      data.delete(date);
      return Promise.resolve();
    },
    profile: () => Promise.resolve(profile),
    setProfile: (next) => {
      profile = next;
      return Promise.resolve();
    },
    replace: (weighIns, next) => {
      data.clear();
      for (const w of weighIns) data.set(w.date, w);
      profile = next;
      return Promise.resolve();
    },
    clear: () => {
      data.clear();
      profile = EMPTY_PROFILE;
      return Promise.resolve();
    },
    onChange: () => () => undefined,
  };
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB request failed'));
    };
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    };
  });

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WEIGH_INS)) db.createObjectStore(WEIGH_INS, { keyPath: 'date' });
      if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE);
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version of the page, open in another tab, needs the database: let it have it.
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onblocked = () => {
      reject(new Error('IndexedDB open blocked by another tab'));
    };
  });
}

function indexedDbStore(db: IDBDatabase): Store {
  const { notify, onChange } = tabs();
  const write = async (stores: string[], work: (tx: IDBTransaction) => void): Promise<void> => {
    const tx = db.transaction(stores, 'readwrite');
    work(tx);
    await done(tx);
    notify();
  };
  return {
    kind: 'indexeddb',
    weighIns: async () => {
      const rows = await request(db.transaction(WEIGH_INS).objectStore(WEIGH_INS).getAll());
      const now = new Date().toISOString();
      // Rows were valid when saved; checking again keeps a damaged database from breaking the page.
      return rows.flatMap((row: unknown) => toWeighIn(row, now) ?? []).sort(byDate);
    },
    put: (weighIns, profile) =>
      write(profile ? [WEIGH_INS, PROFILE] : [WEIGH_INS], (tx) => {
        const store = tx.objectStore(WEIGH_INS);
        for (const w of weighIns) store.put({ ...w });
        if (profile) tx.objectStore(PROFILE).put({ ...profile }, PROFILE_KEY);
      }),
    remove: (date) =>
      write([WEIGH_INS], (tx) => {
        tx.objectStore(WEIGH_INS).delete(date);
      }),
    profile: async () =>
      toProfile(await request(db.transaction(PROFILE).objectStore(PROFILE).get(PROFILE_KEY))),
    setProfile: (profile) =>
      write([PROFILE], (tx) => {
        tx.objectStore(PROFILE).put({ ...profile }, PROFILE_KEY);
      }),
    replace: (weighIns, profile) =>
      write([WEIGH_INS, PROFILE], (tx) => {
        const store = tx.objectStore(WEIGH_INS);
        store.clear();
        for (const w of weighIns) store.put({ ...w });
        tx.objectStore(PROFILE).put({ ...profile }, PROFILE_KEY);
      }),
    clear: () =>
      write([WEIGH_INS, PROFILE], (tx) => {
        tx.objectStore(WEIGH_INS).clear();
        tx.objectStore(PROFILE).clear();
      }),
    onChange,
  };
}

/**
 * Opens the store: IndexedDB if the browser has it and lets the page use it, memory otherwise.
 * `factory` is for tests.
 */
export async function openStore(
  // Missing in some browsers' private windows, whatever the DOM types say.
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): Promise<Store> {
  if (factory === undefined) return memoryStore();
  try {
    return indexedDbStore(await openDb(factory));
  } catch {
    return memoryStore();
  }
}
