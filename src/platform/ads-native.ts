/**
 * The native side of the ads (src/ads): Google AdMob through `@capacitor-community/admob`, and the
 * app's own small plugin (ios/App/App/AdSetupPlugin.swift) for what the AdMob plugin doesn't say:
 * the build's ad unit, whether it came from TestFlight, and the consent choices saved on the
 * phone. Loaded only in the app's build, so the website carries none of it.
 */
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { App } from '../app/app';
import { NO_ADS, NOTHING_HELD, startAds, type AdProvider, type AdsApi, type BuildAds } from '../ads/ads';
import type { ConsentChoices, ConsentInfo } from '../ads/consent';

interface SavedChoices {
  readonly gdprApplies: number;
  readonly purposeConsents: string;
  readonly vendorConsents: string;
  /** Whether `IABTCF_TCString` or `IABTCF_PurposeConsents` is saved. */
  readonly tcf: boolean;
}

interface AdSetupPlugin {
  build(): Promise<BuildAds>;
  consentChoices(): Promise<SavedChoices>;
}

const AdSetup = registerPlugin<AdSetupPlugin>('AdSetup');

const report = (error: unknown): void => {
  console.warn('weigh-to-go: ads:', error);
};

const info = (value: AdmobConsentInfo): ConsentInfo => ({
  status: value.status,
  canRequestAds: value.canRequestAds,
  privacyOptionsRequirementStatus: value.privacyOptionsRequirementStatus,
  ...(value.isConsentFormAvailable === undefined
    ? {}
    : { isConsentFormAvailable: value.isConsentFormAvailable }),
});

/** The plugin, as src/ads asks for it: the same calls, typed for the seam. */
export const admob: AdsApi = {
  requestConsentInfo: async () => info(await AdMob.requestConsentInfo()),
  showConsentForm: async () => info(await AdMob.showConsentForm()),
  showPrivacyOptionsForm: () => AdMob.showPrivacyOptionsForm(),
  // No test devices, no tracking: the plugin asks for App Tracking Transparency only when told to,
  // and this app never does.
  initialize: () => AdMob.initialize({}),
  showBanner: (request) =>
    AdMob.showBanner({
      adId: request.adId,
      adSize: BannerAdSize[request.adSize],
      position: BannerAdPosition[request.position],
      margin: request.margin,
      npa: request.npa,
    }),
  hideBanner: () => AdMob.hideBanner(),
  resumeBanner: () => AdMob.resumeBanner(),
  removeBanner: () => AdMob.removeBanner(),
  onSize: (listener) =>
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) => {
      listener(size.height);
    }),
  onLoaded: (listener) => AdMob.addListener(BannerAdPluginEvents.Loaded, listener),
  onFailed: (listener) =>
    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => {
      listener();
    }),
};

/** The plugin's answer as the consent reads it: `gdprApplies` 1, 0, or -1 when not saved. */
export const toChoices = (saved: SavedChoices): ConsentChoices => ({
  gdprApplies: saved.gdprApplies === 1 ? true : saved.gdprApplies === 0 ? false : null,
  purposeConsents: typeof saved.purposeConsents === 'string' ? saved.purposeConsents : '',
  vendorConsents: typeof saved.vendorConsents === 'string' ? saved.vendorConsents : '',
  tcf: saved.tcf === true,
});

const choices = async (): Promise<ConsentChoices> => toChoices(await AdSetup.consentChoices());

/** Whether the app's own plugin is registered: logged as an error if not, so the simulator check fails. */
function registered(): boolean {
  if (Capacitor.isPluginAvailable('AdSetup')) return true;
  console.error('weigh-to-go: the AdSetup plugin is not registered');
  return false;
}

/**
 * The ads of the iPhone app, for the diary `app`. None in a browser (the app's pages opened by the
 * end-to-end tests), where there is no native AdMob.
 */
export function nativeAds(app: Pick<App, 'subscribe'>): AdProvider {
  if (!Capacitor.isNativePlatform() || !registered()) return NO_ADS;
  return startAds({
    api: admob,
    build: () => AdSetup.build(),
    choices,
    // Story 2 answers from StoreKit; until then nothing can be bought.
    entitlement: NOTHING_HELD,
    app,
    doc: document,
    onError: report,
  });
}

/**
 * On a static page (the privacy policy, the 404 page): the banner, if the diary left one, hides,
 * and so does one still loading when the diary left. Nothing is started for it.
 */
export async function hideBannerHere(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const hide = () => {
    AdMob.hideBanner().catch(report);
  };
  try {
    await AdMob.addListener(BannerAdPluginEvents.Loaded, hide);
  } catch (error) {
    report(error);
  }
  hide();
}
