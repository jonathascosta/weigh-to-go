import { describe, expect, it, vi } from 'vitest';
import type { AdProvider } from './ads';
import { lazyAds } from './lazy';

describe('the ads, loaded apart', () => {
  it('offer nothing until loaded, then pass on what the loaded ads say and do', async () => {
    let tell: (required: boolean) => void = () => undefined;
    const shown = vi.fn(() => Promise.resolve(true));
    const stop = vi.fn(() => Promise.resolve());
    let resolve: (ads: AdProvider) => void = () => undefined;
    const ads = lazyAds(() => new Promise((r) => (resolve = r)));
    const heard: boolean[] = [];
    ads.onPrivacyChoices((required) => heard.push(required));
    expect(ads.privacyChoices()).toBe(false);
    resolve({
      privacyChoices: () => true,
      onPrivacyChoices: (listener) => {
        tell = listener;
        return () => undefined;
      },
      showPrivacyChoices: shown,
      stop,
    });
    expect(await ads.showPrivacyChoices()).toBe(true);
    expect(shown).toHaveBeenCalledOnce();
    expect(ads.privacyChoices()).toBe(true);
    expect(heard).toEqual([true]);
    tell(false);
    expect(heard).toEqual([true, false]);
    await ads.stop();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('are none when they fail to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ads = lazyAds(() => Promise.reject(new Error('no plugin')));
    expect(await ads.showPrivacyChoices()).toBe(false);
    await ads.stop();
    expect(ads.privacyChoices()).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
