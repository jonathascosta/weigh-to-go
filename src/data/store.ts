/**
 * Where the weigh-ins and the profile live: IndexedDB when the browser lets the page use it, memory
 * otherwise, so the page still works for the visit and can say why nothing will be kept. Every
 * write is checked first and then runs as one transaction: it all lands or none of it does.
 *
 * Private windows usually do have IndexedDB (emptied when the window closes), so a store of kind
 * 'indexeddb' is not a promise the data lasts: the persistence request and backups cover that.
 */
import {
  byDate,
  EMPTY_PROFILE,
  isProfile,
  isStoredWeighIn,
  toProfile,
  toWeighIn,
  type Profile,
  type StoredWeighIn,
} from './records';

/**
 * Why a store is in memory: 'unsupported' when the browser has no IndexedDB or refuses it (storage
 * blocked); 'version' when the database on disk is newer than this page (an old copy of the page,
 * still open); 'error' when it failed to open or didn't answer. With 'version' and 'error' the
 * data may well be on disk, so the page should ask for a reload rather than say nothing is kept.
 */
export type MemoryReason = 'unsupported' | 'version' | 'error';

/** What a merge did, by day. */
export interface MergeResult {
  /** Days that were not here. */
  readonly added: number;
  /** Days here that took the incoming weigh-in (newer, or saved at the same moment). */
  readonly updated: number;
  /** Days here that kept their own weigh-in, saved later than the incoming one. */
  readonly kept: number;
}

export interface Store {
  /** 'indexeddb' keeps the data on the device; 'memory' loses it when the page closes. */
  readonly kind: 'indexeddb' | 'memory';
  /** For a memory store, why; null for IndexedDB. */
  readonly reason: MemoryReason | null;
  /** Every weigh-in, by date. */
  weighIns(): Promise<StoredWeighIn[]>;
  /** Saves weigh-ins, replacing any on the same dates, and the profile if given, all at once. */
  put(weighIns: readonly StoredWeighIn[], profile?: Profile): Promise<void>;
  /**
   * Merges weigh-ins from elsewhere (a backup): for a day both have, the one saved later wins, the
   * incoming one on a tie. Profile fields given (not null) replace the ones here. All at once.
   */
  merge(weighIns: readonly StoredWeighIn[], profile: Profile | null): Promise<MergeResult>;
  remove(date: string): Promise<void>;
  profile(): Promise<Profile>;
  setProfile(profile: Profile): Promise<void>;
  /** Replaces every weigh-in, and the profile if given (else it stays), all at once. */
  replace(weighIns: readonly StoredWeighIn[], profile?: Profile): Promise<void>;
  /** Erases everything. */
  clear(): Promise<void>;
  /** Calls `listener` when another tab, or another store in this one, changes the data. */
  onChange(listener: () => void): () => void;
  /** Lets go of the database and the channel to other tabs. */
  close(): void;
}

export const DB_NAME = 'weigh-to-go';
const DB_VERSION = 1;
const WEIGH_INS = 'weighIns';
const PROFILE = 'profile';
const PROFILE_KEY = 'profile';
const CHANNEL = 'weigh-to-go:data';
/** How long to wait for the database to open before giving up (Safari 14 could wait forever). */
export const OPEN_TIMEOUT_MS = 5000;

/** Rejects a write the checks refuse, before anything is touched. */
function check(weighIns: readonly StoredWeighIn[], profile?: Profile | null): void {
  const bad = weighIns.find((w) => !isStoredWeighIn(w));
  if (bad) throw new TypeError(`Not a weigh-in that can be saved: ${JSON.stringify(bad)}`);
  if (profile && !isProfile(profile))
    throw new TypeError(`Not a profile that can be saved: ${JSON.stringify(profile)}`);
}

/** Whether `a` was saved after `b` (times compared as moments, whatever their offsets). */
const savedLater = (a: StoredWeighIn, b: StoredWeighIn): boolean =>
  Date.parse(a.savedAt) > Date.parse(b.savedAt);

/** The merged profile: fields given replace the current ones. */
const mergeProfile = (current: Profile, incoming: Profile | null): Profile => ({
  goalKg: incoming?.goalKg ?? current.goalKg,
  heightCm: incoming?.heightCm ?? current.heightCm,
});

/** Tells the other tabs (and other stores in this one) that the data changed, and listens. */
function tabs(): {
  notify: () => void;
  onChange: (listener: () => void) => () => void;
  close: () => void;
} {
  if (typeof BroadcastChannel === 'undefined')
    return { notify: () => undefined, onChange: () => () => undefined, close: () => undefined };
  // One channel for both: a channel doesn't hear its own messages, so a store isn't told of its writes.
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
    close: () => {
      listeners.clear();
      channel.close();
    },
  };
}

/** A store in memory: for when the browser keeps nothing, and for tests. */
export function memoryStore(reason: MemoryReason = 'unsupported'): Store {
  const data = new Map<string, StoredWeighIn>();
  let profile = EMPTY_PROFILE;
  const run = <T>(work: () => T): Promise<T> => {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };
  return {
    kind: 'memory',
    reason,
    weighIns: () => Promise.resolve([...data.values()].sort(byDate)),
    put: (weighIns, next) =>
      run(() => {
        check(weighIns, next);
        for (const w of weighIns) data.set(w.date, w);
        if (next) profile = next;
      }),
    merge: (weighIns, next) =>
      run(() => {
        check(weighIns, next);
        const result = { added: 0, updated: 0, kept: 0 };
        for (const w of weighIns) {
          const here = data.get(w.date);
          if (here === undefined) result.added++;
          else if (savedLater(here, w)) {
            result.kept++;
            continue;
          } else result.updated++;
          data.set(w.date, w);
        }
        profile = mergeProfile(profile, next);
        return result;
      }),
    remove: (date) =>
      run(() => {
        data.delete(date);
      }),
    profile: () => Promise.resolve(profile),
    setProfile: (next) =>
      run(() => {
        check([], next);
        profile = next;
      }),
    replace: (weighIns, next) =>
      run(() => {
        check(weighIns, next);
        data.clear();
        for (const w of weighIns) data.set(w.date, w);
        if (next) profile = next;
      }),
    clear: () =>
      run(() => {
        data.clear();
        profile = EMPTY_PROFILE;
      }),
    onChange: () => () => undefined,
    close: () => undefined,
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

/**
 * Settles with the transaction. A failed request aborts it, and only then is `tx.error` set (it
 * is still null in `onerror`), so the real cause (a quota, a constraint) comes from `onabort`.
 */
const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    };
  });

class OpenError extends Error {
  constructor(readonly reason: MemoryReason) {
    super(`IndexedDB could not be opened (${reason})`);
  }
}

/**
 * Opens the database. A blocked open (another tab holds an older version open) is not an error:
 * it goes on once that tab lets go, so it only counts against the timeout.
 */
function openDb(factory: IDBFactory, timeoutMs: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new OpenError('error'));
    }, timeoutMs);
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WEIGH_INS)) db.createObjectStore(WEIGH_INS, { keyPath: 'date' });
      if (!db.objectStoreNames.contains(PROFILE)) db.createObjectStore(PROFILE);
    };
    req.onsuccess = () => {
      clearTimeout(timer);
      // Too late: the page already went on without it.
      if (settled) req.result.close();
      else resolve(req.result);
      settled = true;
    };
    req.onerror = () => {
      clearTimeout(timer);
      settled = true;
      reject(new OpenError(req.error?.name === 'VersionError' ? 'version' : 'error'));
    };
  });
}

function indexedDbStore(first: IDBDatabase, factory: IDBFactory, timeoutMs: number): Store {
  const { notify, onChange, close: closeTabs } = tabs();
  let current: Promise<IDBDatabase> | null = null;
  let closed = false;

  /** Keeps track of the connection: the browser may close it, or a newer page may need it. */
  const adopt = (db: IDBDatabase): IDBDatabase => {
    const drop = () => {
      current = null;
    };
    // A newer version of the page, open in another tab, needs the database: let it have it.
    db.onversionchange = () => {
      db.close();
      drop();
    };
    // The browser closed it (cleared site data, iOS Safari after a while in the background).
    db.onclose = drop;
    return db;
  };
  current = Promise.resolve(adopt(first));

  /** The open connection, opened again if it was closed in the meantime. */
  const connection = (): Promise<IDBDatabase> => {
    if (closed) return Promise.reject(new Error('The store is closed'));
    current ??= openDb(factory, timeoutMs).then(adopt, (error: unknown) => {
      current = null;
      throw error;
    });
    return current;
  };

  const read = async <T>(store: string, get: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
    request(get((await connection()).transaction(store).objectStore(store)));

  /** Runs `work` in one transaction; if it throws, the transaction is aborted and nothing lands. */
  const write = async <T>(stores: string[], work: (tx: IDBTransaction) => T): Promise<Awaited<T>> => {
    const tx = (await connection()).transaction(stores, 'readwrite', { durability: 'strict' });
    const finished = done(tx);
    let result: T;
    try {
      result = work(tx);
    } catch (error) {
      tx.abort();
      await finished.catch(() => undefined);
      throw error;
    }
    const [value] = await Promise.all([result, finished]);
    notify();
    return value;
  };

  const putAll = (tx: IDBTransaction, weighIns: readonly StoredWeighIn[]) => {
    const store = tx.objectStore(WEIGH_INS);
    for (const w of weighIns) store.put({ date: w.date, kg: w.kg, savedAt: w.savedAt });
  };
  const putProfile = (tx: IDBTransaction, profile: Profile) => {
    tx.objectStore(PROFILE).put({ goalKg: profile.goalKg, heightCm: profile.heightCm }, PROFILE_KEY);
  };

  return {
    kind: 'indexeddb',
    reason: null,
    weighIns: async () => {
      const rows = await read(WEIGH_INS, (s) => s.getAll());
      const now = new Date().toISOString();
      // Rows were valid when saved; checking again keeps a damaged database from breaking the page.
      return rows.flatMap((row: unknown) => toWeighIn(row, now) ?? []).sort(byDate);
    },
    put: async (weighIns, profile) => {
      check(weighIns, profile);
      await write(profile ? [WEIGH_INS, PROFILE] : [WEIGH_INS], (tx) => {
        putAll(tx, weighIns);
        if (profile) putProfile(tx, profile);
      });
    },
    merge: async (weighIns, profile) => {
      check(weighIns, profile);
      return write([WEIGH_INS, PROFILE], (tx) => {
        const store = tx.objectStore(WEIGH_INS);
        const result = { added: 0, updated: 0, kept: 0 };
        // Reads and writes are queued in the same transaction, so nothing can change in between.
        for (const w of weighIns) {
          const get = store.get(w.date);
          get.onsuccess = () => {
            const here = toWeighIn(get.result, '');
            if (here === null) result.added++;
            else if (savedLater(here, w)) {
              result.kept++;
              return;
            } else result.updated++;
            store.put({ date: w.date, kg: w.kg, savedAt: w.savedAt });
          };
        }
        const profiles = tx.objectStore(PROFILE);
        const get = profiles.get(PROFILE_KEY);
        get.onsuccess = () => {
          putProfile(tx, mergeProfile(toProfile(get.result), profile));
        };
        return result;
      });
    },
    remove: async (date) => {
      await write([WEIGH_INS], (tx) => {
        tx.objectStore(WEIGH_INS).delete(date);
      });
    },
    profile: async () => toProfile(await read(PROFILE, (s) => s.get(PROFILE_KEY))),
    setProfile: async (profile) => {
      check([], profile);
      await write([PROFILE], (tx) => {
        putProfile(tx, profile);
      });
    },
    replace: async (weighIns, profile) => {
      check(weighIns, profile);
      await write(profile ? [WEIGH_INS, PROFILE] : [WEIGH_INS], (tx) => {
        tx.objectStore(WEIGH_INS).clear();
        putAll(tx, weighIns);
        if (profile) putProfile(tx, profile);
      });
    },
    clear: async () => {
      await write([WEIGH_INS, PROFILE], (tx) => {
        tx.objectStore(WEIGH_INS).clear();
        tx.objectStore(PROFILE).clear();
      });
    },
    onChange,
    close: () => {
      closed = true;
      closeTabs();
      void current?.then((db) => {
        db.close();
      });
      current = null;
    },
  };
}

/** The browser's IndexedDB, or undefined; reading it can throw where storage is blocked. */
function browserIndexedDb(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}

/**
 * Opens the store: IndexedDB if the browser has it and lets the page use it, memory otherwise
 * (with the reason). `factory` and `timeoutMs` are for tests.
 */
export async function openStore(
  factory: IDBFactory | null | undefined = browserIndexedDb(),
  timeoutMs = OPEN_TIMEOUT_MS,
): Promise<Store> {
  if (!factory) return memoryStore('unsupported');
  try {
    return indexedDbStore(await openDb(factory, timeoutMs), factory, timeoutMs);
  } catch (error) {
    // Opening throws at once (SecurityError, InvalidStateError) where storage is blocked.
    return memoryStore(error instanceof OpenError ? error.reason : 'unsupported');
  }
}

/**
 * Deletes the database on disk, for "erase everything" when the page is running in memory (the
 * data may still be there). Resolves whether or not it could; returns whether it did.
 */
export function deleteDatabase(
  factory: IDBFactory | null | undefined = browserIndexedDb(),
  timeoutMs = OPEN_TIMEOUT_MS,
): Promise<boolean> {
  if (!factory) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(false);
    }, timeoutMs);
    const finish = (ok: boolean) => () => {
      clearTimeout(timer);
      resolve(ok);
    };
    try {
      const req = factory.deleteDatabase(DB_NAME);
      req.onsuccess = finish(true);
      req.onerror = finish(false);
    } catch {
      finish(false)();
    }
  });
}
