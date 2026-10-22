import { describe, expect, it, vi } from 'vitest';
import type { Pref } from '../data/prefs';
import type { AdProvider } from './ads';
import { lazyAds, lazyPurchase } from './lazy';
import type { Purchase, PurchaseView } from './purchase';

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

const hint = (value: boolean): Pref<boolean> => ({ read: () => value, write: () => true });

describe('Remove ads, loaded apart', () => {
  it('paints last time’s answer until loaded, then follows the loaded purchase', async () => {
    let resolve: (purchase: Purchase) => void = () => undefined;
    const purchase = lazyPurchase(() => new Promise((r) => (resolve = r)), hint(true));
    expect(purchase.view().offer.kind).toBe('held');
    const seen: string[] = [];
    purchase.subscribe((view) => seen.push(view.offer.kind));
    let heard = 0;
    purchase.onHeld(() => heard++);
    purchase.show();
    const listeners: ((view: PurchaseView) => void)[] = [];
    const held: (() => void)[] = [];
    let view: PurchaseView = { offer: { kind: 'checking' }, restore: 'idle' };
    const show = vi.fn();
    const buy = vi.fn(() => Promise.resolve());
    resolve({
      held: () => Promise.resolve(false),
      onHeld: (listener) => {
        held.push(listener);
        return () => undefined;
      },
      view: () => view,
      subscribe: (listener) => {
        listeners.push(listener);
        return () => undefined;
      },
      buy,
      restore: () => Promise.resolve(),
      retry: () => Promise.resolve(),
      show,
    });
    expect(await purchase.held()).toBe(false);
    expect(show).toHaveBeenCalledOnce();
    expect(purchase.view().offer.kind).toBe('checking');
    await purchase.buy();
    expect(buy).toHaveBeenCalledOnce();
    view = { offer: { kind: 'held' }, restore: 'idle' };
    for (const listener of listeners) listener(view);
    for (const listener of held) listener();
    expect(seen).toEqual(['checking', 'held']);
    expect(heard).toBe(1);
  });

  it('has no rows in a browser, and no answer there or when it fails to load', async () => {
    const none = lazyPurchase(() => Promise.resolve(null), hint(false));
    await expect(none.held()).rejects.toThrow();
    expect(none.view().offer.kind).toBe('none');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failed = lazyPurchase(() => Promise.reject(new Error('no plugin')), hint(true));
    await expect(failed.held()).rejects.toThrow();
    expect(failed.view().offer.kind).toBe('none');
    await failed.buy();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
