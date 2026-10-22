/**
 * The diary's state: the store, the weigh-ins and profile it holds, and their analysis. Every part
 * of the page reads from here and is told when it changes; every change to the data goes through
 * here, so the analysis is always of what is saved.
 */
import { analyze, type Analysis } from '../analysis/analyze';
import { importBackup, type ImportMode, type ParsedBackup } from '../data/backup';
import { eraseEverything } from '../data/erase';
import { requestPersistence } from '../data/persist';
import { pref } from '../data/prefs';
import { EMPTY_PROFILE, type Profile, type StoredWeighIn } from '../data/records';
import { memoryStore, openStore, type MergeResult, type Store } from '../data/store';
import { resetView } from './view';

export interface State {
  /** 'loading' until the store has been opened and read. */
  readonly status: 'loading' | 'ready';
  readonly store: Store | null;
  readonly weighIns: readonly StoredWeighIn[];
  readonly profile: Profile;
  /** Null without weigh-ins. */
  readonly analysis: Analysis | null;
}

/** Whether the persistent-storage request has been made (it may prompt, so it's made once). */
const persistenceAsked = pref(
  'persistenceAsked',
  (v: unknown): v is boolean => typeof v === 'boolean',
  false,
);

/**
 * What a save did to one day: the weigh-in typed here that it replaced (null for none: a new day,
 * or one shown from Apple Health), and the one it wrote.
 */
export interface Saved {
  readonly date: string;
  readonly previous: StoredWeighIn | null;
  readonly written: StoredWeighIn;
}

export interface App {
  state(): State;
  /** Calls `listener` now and on every change; returns the unsubscribe. */
  subscribe(listener: (state: State) => void): () => void;
  /**
   * Saves weigh-ins (replacing any on the same days); rejects if the store refuses. Resolves what it
   * did to each day, read by the store in the same step as the write, so that it can be undone
   * exactly (`restore`).
   */
  save(rows: readonly { date: string; kg: number }[]): Promise<Saved[]>;
  /**
   * Puts a day back as it was before a save: `previous` written back as it was, `savedAt` included
   * (null: the day is removed), so backup reminders and Apple Health see the old record, not a new
   * save. Only if the day still holds `expected`, the record that save wrote: resolves false, and
   * changes nothing, when something else (another tab, Apple Health) wrote the day since. After a
   * delete, `expected` is null: the day comes back only if nothing was written to it since.
   */
  restore(date: string, previous: StoredWeighIn | null, expected: StoredWeighIn | null): Promise<boolean>;
  remove(date: string): Promise<void>;
  setProfile(profile: Profile): Promise<void>;
  /** Changes only the profile fields given (null removes one): saves made close together all land. */
  updateProfile(change: Partial<Profile>): Promise<void>;
  importBackup(parsed: Extract<ParsedBackup, { ok: true }>, mode: ImportMode): Promise<MergeResult | null>;
  /** Erases everything; resolves with whether the data is known to be gone. */
  erase(): Promise<boolean>;
  /** Calls `listener` whenever everything is erased, for what is kept outside the store. */
  onErase(listener: () => Promise<void>): void;
}

/** A write refused because the store can't keep it until a reload (`State.store.needsReload`). */
export class ReloadNeeded extends Error {
  constructor() {
    super('The store needs a reload; nothing was written.');
    this.name = 'ReloadNeeded';
  }
}

export function createApp(open: () => Promise<Store> = () => openStore()): App {
  let state: State = { status: 'loading', store: null, weighIns: [], profile: EMPTY_PROFILE, analysis: null };
  const listeners = new Set<(state: State) => void>();
  const eraseListeners: (() => Promise<void>)[] = [];

  const set = (next: Partial<State>) => {
    state = { ...state, ...next };
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        console.error(error);
      }
    }
  };

  /** Tells every listener again, without a change: after a failed write, so notices can show. */
  const notify = () => {
    set({});
  };

  /**
   * Reads everything again from the store, after a change here or in another tab. Reads can
   * finish out of order (a save while another tab's change is being read), so only the latest one
   * started is applied. A failed read is logged, and the listeners are told anyway: the write
   * before it did happen, and the store may now say it needs a reload.
   */
  let generation = 0;
  const reload = async () => {
    const { store } = state;
    if (!store) return;
    const mine = ++generation;
    try {
      const [weighIns, profile] = await Promise.all([store.weighIns(), store.profile()]);
      if (mine === generation) set({ status: 'ready', weighIns, profile, analysis: analyze(weighIns) });
    } catch (error) {
      console.error(error);
      if (mine === generation) set({ status: 'ready' });
    }
  };

  const ready = (async () => {
    let store: Store;
    try {
      store = await open();
    } catch (error) {
      // openStore falls back on its own; anything else that fails to open gets the same fallback.
      console.error(error);
      store = memoryStore('error');
    }
    set({ store });
    store.onChange(() => {
      void reload();
    });
    await reload();
  })();

  const store = async (): Promise<Store> => {
    await ready;
    if (!state.store) throw new Error('The store did not open');
    return state.store;
  };

  /**
   * After the first save, ask the browser to keep the data: never on load, since it may prompt. Not
   * in the iPhone app, whose own file needs no such request.
   */
  const askPersistence = () => {
    if (import.meta.env.MODE === 'ios' || state.store?.kind === 'device' || persistenceAsked.read()) return;
    persistenceAsked.write(true);
    void requestPersistence();
  };

  /**
   * Runs a write, then reads again; a failed write tells the listeners and rejects. While the store
   * needs a reload (another tab has a newer version; issue #47), a write would last only until
   * then: it is refused, and the notice and the message say to reload.
   */
  const write = async <T>(work: (store: Store) => Promise<T>, always = false): Promise<T> => {
    let result: T;
    try {
      const s = await store();
      if (!always && s.needsReload) throw new ReloadNeeded();
      result = await work(s);
    } catch (error) {
      notify();
      throw error;
    }
    await reload();
    return result;
  };

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    save: (rows) =>
      write(async (s) => {
        const savedAt = new Date().toISOString();
        const written = rows.map((r) => ({ date: r.date, kg: r.kg, savedAt }));
        // What each day held of the diary's own, read by the store as it writes: what an undo puts
        // back (never a reading from Apple Health, which isn't the diary's to keep).
        const replaced = await s.put(written);
        askPersistence();
        return written.map((w, i) => ({ date: w.date, previous: replaced[i] ?? null, written: w }));
      }),
    restore: (date, previous, expected) => write((s) => s.restore(date, previous, expected)),
    remove: (date) => write((s) => s.remove(date)),
    setProfile: (profile) => write((s) => s.setProfile(profile)),
    updateProfile: (change) => write((s) => s.updateProfile(change)),
    importBackup: (parsed, mode) =>
      write(async (s) => {
        const result = await importBackup(s, parsed, mode);
        askPersistence();
        return result;
      }),
    erase: () =>
      write(async (s) => {
        try {
          // The app's diary is a file: a database deleted in its web view erases nothing of it.
          return await eraseEverything(s, import.meta.env.MODE === 'ios' ? null : undefined);
        } finally {
          // The preferences are gone: what the page held of them goes back to the defaults too.
          resetView();
          for (const listener of eraseListeners)
            await listener().catch((error: unknown) => {
              console.error(error);
            });
        }
      }, true),
    onErase: (listener) => {
      eraseListeners.push(listener);
    },
  };
}
