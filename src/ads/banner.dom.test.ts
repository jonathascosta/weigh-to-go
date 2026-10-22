// @vitest-environment happy-dom
/**
 * The banner (design §8): its band from the plugin's size event, hidden under a sheet, the keypad
 * and the purchase, and whenever the web view leaves the diary; every request non-personalised.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AD_HEIGHT, mountBanner, type Banner } from './banner';
import { FakeAdMob } from './fake-admob.test-helper';

const UNIT = 'ca-app-pub-1234567890123456/1234567890';
const html = document.documentElement;
const band = () => html.style.getPropertyValue(AD_HEIGHT);
/** MutationObserver's callbacks run as microtasks. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

let banner: Banner | null = null;
let api: FakeAdMob;
beforeEach(() => {
  api = new FakeAdMob();
  html.className = 'in-app';
  html.style.removeProperty(AD_HEIGHT);
});
afterEach(async () => {
  await banner?.dispose();
  banner = null;
});

const mount = () => {
  banner = mountBanner(api, UNIT, document);
  return banner;
};

describe('the banner', () => {
  it('asks for nothing until wanted, then one non-personalised banner at the top', () => {
    const b = mount();
    expect(api.calls).toEqual([]);
    b.want(true);
    expect(api.banners).toEqual([
      { adId: UNIT, adSize: 'BANNER', position: 'TOP_CENTER', margin: 0, npa: true },
    ]);
  });

  it('reserves its height from the size event, keeps the band while hidden, and gives it back when gone', async () => {
    const b = mount();
    b.want(true);
    api.load(50);
    expect(band()).toBe('50px');
    // A hide reports 0: the band stays, so nothing jumps.
    html.classList.add('sheet-open');
    await settle();
    api.reportSize(0);
    expect(band()).toBe('50px');
    b.want(false);
    expect(band()).toBe('0px');
    expect(api.calls.at(-1)).toBe('remove');
  });

  it('gives the band back when no ad comes, and asks again on coming back to the app', () => {
    const b = mount();
    b.want(true);
    api.load(50);
    api.fail();
    expect(band()).toBe('0px');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(api.banners).toHaveLength(2);
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
      html.classList.remove(name);
      await settle();
      expect(api.calls, name).toEqual(['hide', 'resume']);
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
    // Loaded under the sheet (or refreshed): the plugin adds its view shown, so it is hidden again.
    api.calls.length = 0;
    api.load();
    expect(api.calls).toEqual(['hide']);
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
