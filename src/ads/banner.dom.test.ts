// @vitest-environment happy-dom
/**
 * The banner (design §8): its band from the moment it is asked for, kept while hidden and after a
 * failure, hidden under a sheet, the keypad and the purchase, and whenever the web view leaves the
 * diary; every request non-personalised; a banner taken away while loading never shows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import type { Pref } from '../data/prefs';
import { bandPref, estimateBannerHeight, restoreBand } from './band';
import { AD_HEIGHT, mountBanner, type Banner } from './banner';
import { FakeAdMob } from './fake-admob.test-helper';

const UNIT = 'ca-app-pub-1234567890123456/1234567890';
const html = document.documentElement;
const band = () => html.style.getPropertyValue(AD_HEIGHT);
/** MutationObserver's callbacks run as microtasks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};
const memoryBand = (value = 0): Pref<number> & { value: number } => {
  const box = {
    value,
    read: () => box.value,
    write: (next: number) => {
      box.value = next;
      return true;
    },
  };
  return box;
};

let banner: Banner | null = null;
let api: FakeAdMob;
let kept: ReturnType<typeof memoryBand>;
beforeEach(() => {
  api = new FakeAdMob();
  kept = memoryBand();
  html.className = 'in-app';
  html.style.removeProperty(AD_HEIGHT);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  // A 6.9-inch iPhone, 430 × 932 points: the estimate is 67.
  Object.defineProperty(window, 'innerWidth', { value: 430, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 932, configurable: true });
});
afterEach(async () => {
  await banner?.dispose();
  banner = null;
});

const mount = () => {
  banner = mountBanner(api, UNIT, document, { band: kept });
  return banner;
};

describe('the estimate of the banner’s height', () => {
  it('is about 50 pt per 320 pt of width, between 50 and 90 pt and at most 15% of the screen', () => {
    expect(estimateBannerHeight(320, 568)).toBe(50);
    expect(estimateBannerHeight(430, 932)).toBe(67);
    expect(estimateBannerHeight(200, 932)).toBe(50);
    expect(estimateBannerHeight(1024, 1366)).toBe(90);
    // A short window: 15% of 400 is 60.
    expect(estimateBannerHeight(430, 400)).toBe(60);
  });
});

describe('the banner', () => {
  it('asks for nothing until wanted, then one non-personalised banner at the top', () => {
    const b = mount();
    expect(api.calls).toEqual([]);
    b.want(true);
    expect(api.banners).toEqual([
      { adId: UNIT, adSize: 'ADAPTIVE_BANNER', position: 'TOP_CENTER', margin: 0, npa: true },
    ]);
  });

  it('reserves the estimate for the screen as it is asked for, and takes the banner’s own height', () => {
    const b = mount();
    b.want(true);
    expect(band()).toBe('67px');
    expect(kept.value).toBe(67);
    api.load(66);
    expect(band()).toBe('66px');
    expect(kept.value).toBe(66);
  });

  it('reserves the height the banner had last time, so the page doesn’t move when it arrives', () => {
    kept.value = 66;
    const b = mount();
    b.want(true);
    expect(band()).toBe('66px');
    api.load(66);
    expect(band()).toBe('66px');
  });

  it('keeps the band while hidden, and gives it back when no banner is wanted', async () => {
    const b = mount();
    b.want(true);
    api.load(67);
    html.classList.add('sheet-open');
    await settle();
    // A hide reports 0: the band stays, so nothing jumps.
    api.reportSize(0);
    expect(band()).toBe('67px');
    expect(kept.value).toBe(67);
    b.want(false);
    expect(band()).toBe('0px');
    expect(kept.value).toBe(0);
    expect(api.calls.at(-1)).toBe('remove');
  });

  it('keeps the empty band when a banner fails while shown, and lets it go only out of sight', () => {
    const b = mount();
    b.want(true);
    api.load(67);
    api.fail();
    expect(band()).toBe('67px');
    setVisibility('hidden');
    expect(band()).toBe('0px');
    // Back in the app: asked for again, the band first.
    setVisibility('visible');
    expect(band()).toBe('67px');
    expect(api.banners).toHaveLength(2);
  });

  it('starts with the band at its height last time, and none otherwise', () => {
    const storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
    try {
      restoreBand(document);
      expect(band()).toBe('');
      bandPref.write(66);
      restoreBand(document);
      expect(band()).toBe('66px');
      bandPref.write(0);
      html.style.removeProperty(AD_HEIGHT);
      restoreBand(document);
      expect(band()).toBe('');
      // Kept before the adaptive banner: only whether the band was up; up reads as the estimate.
      storage.setItem('weigh-to-go:adBand', 'true');
      expect(bandPref.read()).toBe(67);
      storage.setItem('weigh-to-go:adBand', 'false');
      expect(bandPref.read()).toBe(0);
      // A height no banner of this kind has is not kept.
      bandPref.write(250);
      expect(bandPref.read()).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('hides while a sheet is open, the keypad is up or the purchase runs, and shows after', async () => {
    const b = mount();
    b.want(true);
    api.load();
    for (const name of ['sheet-open', 'typing', 'buying']) {
      api.calls.length = 0;
      html.classList.add(name);
      await settle();
      expect(api.calls, name).toEqual(['hide']);
      expect(api.view).toBe('hidden');
      html.classList.remove(name);
      await settle();
      expect(api.calls, name).toEqual(['hide', 'resume']);
      expect(api.view).toBe('shown');
    }
  });

  it('hides a banner that loads while it must be hidden, and isn’t requested under a sheet', async () => {
    const b = mount();
    html.classList.add('typing');
    b.want(true);
    expect(api.banners).toHaveLength(0);
    html.classList.remove('typing');
    await settle();
    expect(api.banners).toHaveLength(1);
    html.classList.add('sheet-open');
    await settle();
    // Loaded under the sheet: the plugin adds its view shown, so it is hidden again.
    api.load();
    expect(api.view).toBe('hidden');
  });

  it('takes away a banner removed while it was still loading, once it arrives', () => {
    const b = mount();
    b.want(true);
    b.want(false);
    // The plugin had no view to remove yet.
    expect(api.view).toBe('loading');
    api.load();
    expect(api.view).toBe('none');
    expect(band()).toBe('0px');
  });

  it('takes away a banner still loading when disposed, listening until it arrives', async () => {
    const b = mount();
    b.want(true);
    await b.dispose();
    banner = null;
    expect(api.listeners()).toBeGreaterThan(0);
    api.load();
    expect(api.view).toBe('none');
    await settle();
    expect(api.listeners()).toBe(0);
  });

  it('hides when the web view leaves the diary, and comes back with it', () => {
    const b = mount();
    b.want(true);
    api.load();
    api.calls.length = 0;
    window.dispatchEvent(new Event('pagehide'));
    expect(api.calls).toEqual(['hide']);
    window.dispatchEvent(new Event('pageshow'));
    expect(api.calls).toEqual(['hide', 'resume']);
  });

  it('mounts the banner again back from the back-forward cache', async () => {
    const b = mount();
    b.want(true);
    api.load();
    window.dispatchEvent(new Event('pagehide'));
    const event = new Event('pageshow');
    Object.defineProperty(event, 'persisted', { value: true });
    window.dispatchEvent(event);
    expect(api.banners).toHaveLength(2);
    // Its listeners are back, once each.
    await settle();
    expect(api.listeners()).toBe(3);
    api.load();
    expect(api.view).toBe('shown');
  });

  it('never resumes a banner that isn’t there', async () => {
    const b = mount();
    b.want(true);
    api.load();
    html.classList.add('sheet-open');
    await settle();
    api.fail();
    html.classList.remove('sheet-open');
    await settle();
    expect(api.calls).not.toContain('resume');
  });

  it('lets go of its listeners and removes the banner when disposed', async () => {
    const b = mount();
    b.want(true);
    api.load();
    await b.dispose();
    banner = null;
    expect(api.calls.at(-1)).toBe('remove');
    expect(api.listeners()).toBe(0);
    window.dispatchEvent(new Event('pagehide'));
    expect(api.calls.at(-1)).toBe('remove');
  });
});
