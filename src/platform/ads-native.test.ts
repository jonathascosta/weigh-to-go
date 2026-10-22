// @vitest-environment happy-dom
/**
 * The native side of the ads: the plugin's calls as the seam makes them, nothing in a browser, and
 * the banner hidden on the static pages (the privacy policy, the 404 page).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const listeners = new Map<string, () => void>();
let native = true;
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => true },
  registerPlugin: () => ({
    build: () => Promise.resolve({ bannerId: '', sandbox: true, debug: false }),
    consentChoices: () => Promise.resolve({ gdprApplies: -1, purposeConsents: '', vendorConsents: '' }),
  }),
}));
vi.mock('@capacitor-community/admob', () => ({
  BannerAdPluginEvents: { SizeChanged: 'bannerAdSizeChanged', Loaded: 'bannerAdLoaded', FailedToLoad: 'x' },
  BannerAdPosition: { TOP_CENTER: 'TOP_CENTER' },
  BannerAdSize: { BANNER: 'BANNER' },
  AdMob: {
    hideBanner: () => {
      calls.push('hide');
      return Promise.resolve();
    },
    showBanner: (options: unknown) => {
      calls.push(`show ${JSON.stringify(options)}`);
      return Promise.resolve();
    },
    initialize: (options: unknown) => {
      calls.push(`start ${JSON.stringify(options)}`);
      return Promise.resolve();
    },
    addListener: (event: string, listener: () => void) => {
      listeners.set(event, listener);
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
  },
}));

const { admob, hideBannerHere, nativeAds, toChoices } = await import('./ads-native');
const { NO_ADS } = await import('../ads/ads');

beforeEach(() => {
  calls.length = 0;
  listeners.clear();
  native = true;
});

describe('the banner on a static page', () => {
  it('hides as the page opens, and again if a banner still loading arrives', async () => {
    await hideBannerHere();
    expect(calls).toEqual(['hide']);
    listeners.get('bannerAdLoaded')?.();
    expect(calls).toEqual(['hide', 'hide']);
  });

  it('is left alone in a browser, which has no native banner', async () => {
    native = false;
    await hideBannerHere();
    expect(calls).toEqual([]);
  });
});

describe('the plugin, as the ads call it', () => {
  it('asks for a non-personalised 320 × 50 banner at the top, and starts the SDK with no tracking', async () => {
    await admob.showBanner({ adId: 'u', adSize: 'BANNER', position: 'TOP_CENTER', margin: 0, npa: true });
    await admob.initialize();
    expect(calls).toEqual([
      'show {"adId":"u","adSize":"BANNER","position":"TOP_CENTER","margin":0,"npa":true}',
      'start {}',
    ]);
  });

  it('gives no ads in a browser (the app’s pages in the end-to-end tests)', () => {
    native = false;
    expect(nativeAds({ subscribe: () => () => undefined })).toBe(NO_ADS);
  });
});

describe('the choices saved on the phone, as the plugin gives them', () => {
  it('read 1 as the GDPR applying, 0 as not, and -1 (not saved) as unknown', () => {
    const saved = { purposeConsents: '11', vendorConsents: '01' };
    expect(toChoices({ ...saved, gdprApplies: 1 })).toEqual({ ...saved, gdprApplies: true });
    expect(toChoices({ ...saved, gdprApplies: 0 })).toEqual({ ...saved, gdprApplies: false });
    expect(toChoices({ ...saved, gdprApplies: -1 })).toEqual({ ...saved, gdprApplies: null });
    expect(
      toChoices({ gdprApplies: 1, purposeConsents: null, vendorConsents: undefined } as unknown as Parameters<
        typeof toChoices
      >[0]),
    ).toEqual({ gdprApplies: true, purposeConsents: '', vendorConsents: '' });
  });
});
