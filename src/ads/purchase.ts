/**
 * Remove ads (docs/sprint-4.md, story 2): one non-consumable in-app purchase, checked on the phone
 * with StoreKit 2. No server of ours and no receipt sent anywhere: what counts is whether StoreKit's
 * current entitlements hold a verified transaction for it. A screen preference remembers the last
 * answer, only so the first paint of Your data can say "thank you" before StoreKit has answered; it
 * never unlocks anything, and StoreKit's answer replaces it at every launch.
 *
 * None of this is in the website's build: `main.ts` loads it (with platform/purchase-native.ts)
 * only in the app's, and the diary sees only `Purchase`.
 */
import type { Pref } from '../data/prefs';
import type { Entitlement } from './ads';
import { firstView, heldHintPref } from './hint';

/** The product in App Store Connect (docs/STORE.md, step 5): non-consumable. */
export const REMOVE_ADS = 'net.jonathas.weightogo.removeads';

/** Why a call to the App Store didn't go through, as far as the plugin tells. */
export type StoreFailure = 'cancelled' | 'pending' | 'not-found' | 'other';

export class StoreError extends Error {
  constructor(
    readonly kind: StoreFailure,
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

/** Remove ads as the App Store sells it. */
export interface Product {
  /** Its price, as StoreKit formats it for this Apple Account's storefront. */
  readonly price: string;
  /** Whether the owner turned on Family Sharing for it in App Store Connect. */
  readonly family: boolean;
}

/** The App Store, as Remove ads needs it (platform/purchase-native.ts). */
export interface StoreApi {
  /** Whether StoreKit's current entitlements hold Remove ads (verified transactions only). */
  held(): Promise<boolean>;
  /** Remove ads, or null when the App Store doesn't know it. */
  product(): Promise<Product | null>;
  /** Buys it: resolves once a verified transaction for it has come back; rejects with a StoreError. */
  buy(): Promise<void>;
  /** Asks the App Store for this Apple Account's purchases again (`AppStore.sync`). */
  restore(): Promise<void>;
  /** Whether this iPhone allows purchases (Screen Time's restrictions can forbid them). */
  canPay(): Promise<boolean>;
  /** Calls `listener` when a transaction comes in (approved, bought elsewhere, refunded). */
  onChange(listener: () => void): () => void;
}

/** What the Remove ads row says, and offers (design §7, "Remove ads, every state"). */
export type Offer =
  /** No App Store here (a browser): no rows. */
  | { readonly kind: 'none' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly product: Product }
  | { readonly kind: 'buying'; readonly product: Product }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'not-allowed' }
  | { readonly kind: 'held' };

/** What the Restore purchases row says. */
export type Restoring = 'idle' | 'restoring' | 'restored' | 'none' | 'offline' | 'failed';

export interface PurchaseView {
  readonly offer: Offer;
  readonly restore: Restoring;
}

/** Remove ads as the diary and the ads see it. */
export interface Purchase extends Entitlement {
  view(): PurchaseView;
  /** Calls `listener` on every change of the view; returns the unsubscribe. */
  subscribe(listener: (view: PurchaseView) => void): () => void;
  /** Opens the App Store's purchase sheet (from Ready only). */
  buy(): Promise<void>;
  /** Restore purchases. */
  restore(): Promise<void>;
  /** Asks the App Store for the price again (Try again). */
  retry(): Promise<void>;
  /** The row is in sight: the price is asked for, the first time (not at launch). */
  show(): void;
  /** Calls `listener` once Remove ads becomes held during the session. */
  onHeld(listener: () => void): () => void;
}

/** The `<html>` class while the App Store's sheet is up: the banner hides (decision 125). */
export const BUYING_CLASS = 'buying';

export interface PurchaseOptions {
  readonly api: StoreApi;
  readonly doc: Document;
  /** Whether the phone is online (`navigator.onLine`), to tell an offline failure from another. */
  readonly online?: () => boolean;
  readonly hint?: Pref<boolean>;
  readonly onError?: (error: unknown) => void;
}

const kindOf = (error: unknown): StoreFailure => (error instanceof StoreError ? error.kind : 'other');

export interface LivePurchase extends Purchase {
  /** Resolves once launch's answer and the offer it led to are in (for tests). */
  settled(): Promise<void>;
  /** Lets go of the listeners (for tests). */
  dispose(): void;
}

/**
 * Asks StoreKit at once; the answer settles `held()`, which the ads wait for at launch. Every
 * answer about the entitlement (launch's, a transaction update's, a return to the app's, a
 * restore's, a purchase's) takes a number when it is asked for, and only an answer newer than the
 * last one applied counts: a slow launch answer never undoes a purchase held since.
 */
export function startPurchase(options: PurchaseOptions): LivePurchase {
  const { api, doc } = options;
  const online = options.online ?? (() => navigator.onLine);
  const hint = options.hint ?? heldHintPref;
  const onError = options.onError ?? (() => undefined);
  const html = doc.documentElement;

  let view = firstView(hint);
  let isHeld = false;
  /** Read after an await: a transaction may have come in meanwhile. */
  const heldNow = () => isHeld;
  /** Whether the row has been in sight, so the price is wanted. */
  let shown = false;
  /** StoreKit has answered at launch "not held", or not at all: the price may be asked for. */
  let answered = false;
  /** The last question about the price (for `settled`). */
  let work: Promise<void> = Promise.resolve();
  /** Bumped by every new question to the App Store about the offer: a late answer is dropped. */
  let asked = 0;
  /** The number of the last question about the entitlement, and of the last answer applied. */
  let question = 0;
  let applied = 0;
  let disposed = false;
  const listeners = new Set<(view: PurchaseView) => void>();
  const heldListeners = new Set<() => void>();

  const set = (next: Partial<PurchaseView>) => {
    if (disposed) return;
    view = { ...view, ...next };
    for (const listener of [...listeners]) listener(view);
  };
  /** Whether the answer to question `n` is still the newest; if so, it is the one applied now. */
  const fresh = (n: number): boolean => {
    if (disposed || n < applied) return false;
    applied = n;
    return true;
  };
  const markHeld = () => {
    asked++;
    hint.write(true);
    const was = isHeld;
    isHeld = true;
    set({ offer: { kind: 'held' } });
    if (!was) for (const listener of [...heldListeners]) listener();
  };
  /** Not held: StoreKit says so (a refund too), and the hint follows. */
  const markNotHeld = () => {
    hint.write(false);
    isHeld = false;
  };
  /** Asks StoreKit's current entitlements, numbered. */
  const ask = async (): Promise<{ n: number; held: boolean }> => {
    const n = ++question;
    return { n, held: await api.held() };
  };

  /**
   * Why it can't be bought, after a failure that wasn't the person's own: purchases not allowed on
   * this iPhone, no network, the product unknown to the App Store, or `otherwise`.
   */
  const blocked = async (kind: StoreFailure, otherwise: Offer): Promise<Offer> => {
    if (!(await api.canPay().catch(() => true))) return { kind: 'not-allowed' };
    if (!online()) return { kind: 'offline' };
    return kind === 'not-found' ? { kind: 'unavailable' } : otherwise;
  };

  const loadOffer = (): Promise<void> => (work = askOffer());
  const askOffer = async (): Promise<void> => {
    const n = ++asked;
    set({ offer: { kind: 'checking' } });
    let offer: Offer;
    try {
      if (!(await api.canPay())) offer = { kind: 'not-allowed' };
      else {
        const product = await api.product();
        offer = product ? { kind: 'ready', product } : await blocked('not-found', { kind: 'unavailable' });
      }
    } catch (error) {
      onError(error);
      // The price couldn't be had: most often the App Store can't be reached.
      offer = await blocked(kindOf(error), { kind: 'offline' });
    }
    if (n === asked && !heldNow()) set({ offer });
  };

  /** The price, once the row has been in sight and StoreKit has answered "not held". */
  const offerWhenDue = async () => {
    if (shown && answered && !isHeld && view.offer.kind === 'checking') await loadOffer();
  };

  /** StoreKit has said "not held" (newest answer): a held purchase goes (refunded), the offer comes. */
  const notHeld = async () => {
    const was = isHeld || view.offer.kind === 'held';
    markNotHeld();
    answered = true;
    if (was) set({ offer: { kind: 'checking' } });
    await offerWhenDue();
  };

  /** StoreKit's current entitlements, asked again: held, or (when it was) not any more. */
  const refresh = async (): Promise<void> => {
    if (disposed) return;
    let answer: { n: number; held: boolean };
    try {
      answer = await ask();
    } catch (error) {
      onError(error);
      return;
    }
    if (!fresh(answer.n)) return;
    if (answer.held) {
      markHeld();
      return;
    }
    if (isHeld || view.offer.kind === 'held') {
      await notHeld();
      return;
    }
    // Back in the app: what stopped the offer may have gone (online again, purchases allowed).
    const { kind } = view.offer;
    if (kind === 'offline' || kind === 'unavailable' || kind === 'not-allowed') await loadOffer();
  };

  const first = ask();
  const launch = first.then(
    async ({ n, held }) => {
      // A newer answer (an update, a restore, a purchase) came first: this one is stale.
      if (!fresh(n)) {
        answered = true;
        await offerWhenDue();
        return;
      }
      if (held) markHeld();
      else await notHeld();
    },
    async (error: unknown) => {
      // No answer: the ads start nothing (they count it as held), and the row offers the purchase
      // unless last time's answer was that it is held.
      onError(error);
      answered = true;
      if (view.offer.kind === 'held' && !heldNow()) return;
      await offerWhenDue();
    },
  );

  const stopChange = api.onChange(() => {
    void refresh();
  });
  const onVisibility = () => {
    if (doc.visibilityState === 'visible') void refresh();
  };
  doc.addEventListener('visibilitychange', onVisibility);

  /** How many of the App Store's sheets are up: `buying` stays until the last has gone. */
  let sheets = 0;
  /** While the App Store's own sheet is up: the banner hides under `buying`. */
  const withSheet = async <T>(run: () => Promise<T>): Promise<T> => {
    sheets++;
    html.classList.add(BUYING_CLASS);
    try {
      return await run();
    } finally {
      sheets--;
      if (sheets === 0) html.classList.remove(BUYING_CLASS);
    }
  };

  return {
    held: async () => {
      // Launch's answer, unless a newer one has come since; no answer at all rejects (the ads
      // then start nothing) unless a newer one said held.
      try {
        const { n, held } = await first;
        return applied > n ? heldNow() : held;
      } catch (error) {
        if (heldNow()) return true;
        throw error;
      }
    },
    onHeld: (listener) => {
      heldListeners.add(listener);
      return () => {
        heldListeners.delete(listener);
      };
    },
    view: () => view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    buy: async () => {
      const { offer } = view;
      if (offer.kind !== 'ready') return;
      const { product } = offer;
      asked++;
      set({ offer: { kind: 'buying', product }, restore: 'idle' });
      try {
        await withSheet(() => api.buy());
        // A verified transaction for it has come back: the newest answer there is.
        if (fresh(++question)) markHeld();
      } catch (error) {
        const kind = kindOf(error);
        if (heldNow()) return;
        if (kind === 'cancelled') set({ offer: { kind: 'ready', product } });
        else if (kind === 'pending') set({ offer: { kind: 'pending' } });
        else {
          onError(error);
          const offer = await blocked(kind, { kind: 'failed' });
          if (!heldNow()) set({ offer });
        }
      }
    },
    restore: async () => {
      if (view.restore === 'restoring') return;
      set({ restore: 'restoring' });
      try {
        await withSheet(() => api.restore());
        const answer = await ask();
        const isFresh = fresh(answer.n);
        if (isFresh && answer.held) markHeld();
        // Held before, but the App Store now says not (refunded): no longer held.
        else if (isFresh && heldNow()) await notHeld();
        if (heldNow()) {
          set({ restore: 'restored' });
          return;
        }
        set({ restore: 'none' });
        if (isFresh) {
          answered = true;
          // What stopped the offer may have gone: the App Store answered.
          const { kind } = view.offer;
          if (kind === 'offline' || kind === 'failed' || kind === 'unavailable') await loadOffer();
        }
      } catch (error) {
        onError(error);
        set({ restore: online() ? 'failed' : 'offline' });
      }
    },
    show: () => {
      if (shown) return;
      shown = true;
      void offerWhenDue();
    },
    retry: async () => {
      const { kind } = view.offer;
      if (kind === 'failed' || kind === 'offline' || kind === 'unavailable' || kind === 'not-allowed')
        await loadOffer();
    },
    settled: async () => {
      await launch;
      await work;
    },
    dispose: () => {
      disposed = true;
      stopChange();
      doc.removeEventListener('visibilitychange', onVisibility);
      html.classList.remove(BUYING_CLASS);
    },
  };
}
