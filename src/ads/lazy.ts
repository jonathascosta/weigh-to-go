import type { AdProvider } from './ads';

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
    showPrivacyChoices: async () => {
      await (await loading)?.showPrivacyChoices();
    },
    stop: async () => {
      await (await loading)?.stop();
    },
  };
}
