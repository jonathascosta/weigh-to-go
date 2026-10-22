import type { Pref } from '../data/prefs';
import type { AdProvider } from './ads';
import { firstView, heldHintPref } from './hint';
import type { Purchase, PurchaseView } from './purchase';

/**
 * The ads, loaded at once but apart from the diary's own code, so the website's build carries none
 * of the native part and the diary never waits for it. Until loaded (or if loading fails) there
 * are no ads and no Privacy choices.
 */
export function lazyAds(load: () => Promise<AdProvider>): AdProvider {
  let provider: AdProvider | null = null;
  const listeners = new Set<(required: boolean) => void>();
  const loading = load().then(
    (loaded) => {
      provider = loaded;
      loaded.onPrivacyChoices((required) => {
        for (const listener of listeners) listener(required);
      });
      if (loaded.privacyChoices()) for (const listener of listeners) listener(true);
      return loaded;
    },
    (error: unknown) => {
      console.warn('weigh-to-go: ads:', error);
      return null;
    },
  );
  return {
    privacyChoices: () => provider?.privacyChoices() ?? false,
    onPrivacyChoices: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    showPrivacyChoices: async () => (await (await loading)?.showPrivacyChoices()) ?? false,
    stop: async () => {
      await (await loading)?.stop();
    },
  };
}

/**
 * Remove ads, loaded apart from the diary's code like the ads (no StoreKit code in the website's
 * build). Until loaded, Your data shows last time's answer (the hint) or waits; loaded as null (a
 * browser, with no App Store), its rows aren't shown. `held()` waits for the real answer; without
 * one it rejects, which the ads count as held.
 */
export function lazyPurchase(
  load: () => Promise<Purchase | null>,
  hint: Pref<boolean> = heldHintPref,
): Purchase {
  let purchase: Purchase | null = null;
  let view: PurchaseView = firstView(hint);
  let shown = false;
  const listeners = new Set<(view: PurchaseView) => void>();
  const heldListeners = new Set<() => void>();
  const tell = (next: PurchaseView) => {
    view = next;
    for (const listener of [...listeners]) listener(next);
  };
  const loading = load().then(
    (loaded) => {
      purchase = loaded;
      if (!loaded) {
        tell({ offer: { kind: 'none' }, restore: 'idle' });
        return null;
      }
      loaded.subscribe(tell);
      loaded.onHeld(() => {
        for (const listener of [...heldListeners]) listener();
      });
      if (shown) loaded.show();
      tell(loaded.view());
      return loaded;
    },
    (error: unknown) => {
      console.warn('weigh-to-go: purchase:', error);
      tell({ offer: { kind: 'none' }, restore: 'idle' });
      return null;
    },
  );
  return {
    held: async () => {
      const loaded = await loading;
      if (!loaded) throw new Error('No App Store here');
      return loaded.held();
    },
    onHeld: (listener) => {
      heldListeners.add(listener);
      return () => {
        heldListeners.delete(listener);
      };
    },
    view: () => purchase?.view() ?? view,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    buy: async () => {
      await (await loading)?.buy();
    },
    restore: async () => {
      await (await loading)?.restore();
    },
    retry: async () => {
      await (await loading)?.retry();
    },
    show: () => {
      shown = true;
      purchase?.show();
    },
  };
}
