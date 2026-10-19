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
import { openStore, type MergeResult, type Store } from '../data/store';

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

export interface App {
  state(): State;
  /** Calls `listener` now and on every change; returns the unsubscribe. */
  subscribe(listener: (state: State) => void): () => void;
  /** Saves weigh-ins (replacing any on the same days); rejects if the store refuses. */
  save(rows: readonly { date: string; kg: number }[]): Promise<void>;
  remove(date: string): Promise<void>;
  setProfile(profile: Profile): Promise<void>;
  importBackup(parsed: Extract<ParsedBackup, { ok: true }>, mode: ImportMode): Promise<MergeResult | null>;
  /** Erases everything; resolves with whether the data is known to be gone. */
  erase(): Promise<boolean>;
}

export function createApp(open: () => Promise<Store> = () => openStore()): App {
  let state: State = { status: 'loading', store: null, weighIns: [], profile: EMPTY_PROFILE, analysis: null };
  const listeners = new Set<(state: State) => void>();

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

  /** Reads everything again from the store, after a change here or in another tab. */
  const reload = async () => {
    const { store } = state;
    if (!store) return;
    const [weighIns, profile] = await Promise.all([store.weighIns(), store.profile()]);
    set({ status: 'ready', weighIns, profile, analysis: analyze(weighIns) });
  };

  const ready = (async () => {
    const store = await open();
    set({ store });
    store.onChange(() => {
      void reload().catch((error: unknown) => {
        console.error(error);
      });
    });
    await reload();
  })();

  const store = async (): Promise<Store> => {
    await ready;
    if (!state.store) throw new Error('The store did not open');
    return state.store;
  };

  /** After the first save, ask the browser to keep the data: never on load, since it may prompt. */
  const askPersistence = () => {
    if (persistenceAsked.read()) return;
    persistenceAsked.write(true);
    void requestPersistence();
  };

  ready.catch((error: unknown) => {
    console.error(error);
  });

  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(state);
      return () => {
        listeners.delete(listener);
      };
    },
    save: async (rows) => {
      const s = await store();
      const savedAt = new Date().toISOString();
      await s.put(rows.map((r) => ({ date: r.date, kg: r.kg, savedAt })));
      askPersistence();
      await reload();
    },
    remove: async (date) => {
      await (await store()).remove(date);
      await reload();
    },
    setProfile: async (profile) => {
      await (await store()).setProfile(profile);
      await reload();
    },
    importBackup: async (parsed, mode) => {
      const result = await importBackup(await store(), parsed, mode);
      askPersistence();
      await reload();
      return result;
    },
    erase: async () => {
      const gone = await eraseEverything(await store());
      await reload();
      return gone;
    },
  };
}
