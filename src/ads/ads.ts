/**
 * Ads in the iPhone app (docs/sprint-4.md, story 1): the seam the diary sees, and the order things
 * happen in. None of it runs on the website or in the web build: `main.ts` loads the native part
 * (platform/ads-native.ts) only in the app's build, and this module only from there.
 *
 * At launch, in this order, each step only if the one before allows it:
 * 1. The Remove ads purchase (story 2) is asked about. Held: nothing more, ever, this session;
 *    neither Google's consent tool nor its ad SDK is started, so the app sends Google nothing.
 * 2. The banner's ad unit: Google's test unit on TestFlight (a sandbox receipt) and in a debug
 *    build; the owner's on the App Store. An App Store build without the owner's unit shows none.
 * 3. The first days (design §8, O14): no ads while the diary is empty or in the first 7 days after
 *    the app's first launch. Until then Google isn't contacted at all.
 * 4. Google's consent message where the law asks for it (consent.ts); a refusal means no ads and no
 *    SDK (decision 64).
 * 5. The SDK starts, and the banner is requested, non-personalised (banner.ts).
 *
 * Nothing from the diary reaches the plugin: what it is given is the ad unit, the banner's size and
 * place, and `npa`. The diary's state is read here only for whether it is empty.
 */
import type { App } from '../app/app';
import { pref, type Pref } from '../data/prefs';
import { mountBanner, type Banner, type BannerApi } from './banner';
import { AdConsent, type ConsentApi, type ConsentChoices } from './consent';

/** What the diary sees of the ads: Privacy choices in Your data, and a way to stop them. */
export interface AdProvider {
  /** Whether Privacy choices must show (Google's consent tool says where). */
  privacyChoices(): boolean;
  /** Calls `listener` whenever that changes; returns the unsubscribe. */
  onPrivacyChoices(listener: (required: boolean) => void): () => void;
  /** Google's form to change the choices; resolves once it has closed. */
  showPrivacyChoices(): Promise<void>;
  /** No more ads, for this session (Remove ads, bought now: story 2). */
  stop(): Promise<void>;
}

/** The website and the web build, or a purchase held: no ads, no choices to offer. */
export const NO_ADS: AdProvider = {
  privacyChoices: () => false,
  onPrivacyChoices: () => () => undefined,
  showPrivacyChoices: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

/**
 * The Remove ads purchase (story 2): whether it is held, from StoreKit's current entitlements.
 * Until that story, nothing can be bought.
 */
export interface Entitlement {
  held(): Promise<boolean>;
}

export const NOTHING_HELD: Entitlement = { held: () => Promise.resolve(false) };

/** Days after the app's first launch with no ads (design §8, O14). */
export const FIRST_DAYS = 7;
const DAY_MS = 86_400_000;

/** When the app was first launched (ms since the epoch), kept with the screen preferences. */
export const firstLaunchPref = pref(
  'firstLaunch',
  (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v)),
  null,
);

/** Whether the banner may show: something in the diary, and the first days over. */
export const adsDue = (firstLaunch: number, now: number, weighIns: number): boolean =>
  weighIns > 0 && now - firstLaunch >= FIRST_DAYS * DAY_MS;

/** Google's sample banner unit for iOS, which always serves test ads and never pays. */
export const TEST_BANNER_UNIT = 'ca-app-pub-3940256099942544/2934735716';
/** Google's sample units are all under this publisher. */
const GOOGLE_SAMPLE_PUBLISHER = 'ca-app-pub-3940256099942544/';

/** What the app's own plugin says about this build (ios/App/App/AdSetupPlugin.swift). */
export interface BuildAds {
  /** The owner's banner unit, from Info.plist (empty when the build wasn't given one). */
  readonly bannerId: string;
  /** Installed from TestFlight (or Xcode): the App Store receipt is a sandbox one. */
  readonly sandbox: boolean;
  /** A debug build. */
  readonly debug: boolean;
}

/**
 * The banner's ad unit: Google's test unit on TestFlight and in debug builds, so the owner's own
 * use never counts as invalid traffic; the owner's on the App Store; none (no ads at all) on the
 * App Store without it, so test ads can't ship.
 */
export function bannerUnit(build: BuildAds): string | null {
  if (build.sandbox || build.debug) return TEST_BANNER_UNIT;
  const id = build.bannerId.trim();
  return /^ca-app-pub-\d+\/\d+$/.test(id) && !id.startsWith(GOOGLE_SAMPLE_PUBLISHER) ? id : null;
}

/** The plugin as the ads need it: the consent tool, the SDK's start and the banner. */
export interface AdsApi extends ConsentApi, BannerApi {
  initialize(): Promise<void>;
}

export interface AdsOptions {
  readonly api: AdsApi;
  readonly build: () => Promise<BuildAds>;
  readonly choices: () => Promise<ConsentChoices>;
  readonly entitlement: Entitlement;
  readonly app: Pick<App, 'subscribe'>;
  readonly doc: Document;
  readonly now?: () => number;
  readonly firstLaunch?: Pref<number | null>;
  readonly onError?: (error: unknown) => void;
}

export interface Ads extends AdProvider {
  /** Resolves once launch has gone as far as it can for now (for tests). */
  readonly settled: () => Promise<void>;
}

/** The `<html>` classes during which nothing is asked of the person (a sheet, the keypad). */
const BUSY_CLASSES = ['sheet-open', 'typing', 'buying'];

/** Starts the ads, as far as the purchase, the first days and the consent allow. */
export function startAds(options: AdsOptions): Ads {
  const { api, doc, app } = options;
  const now = options.now ?? (() => Date.now());
  const firstLaunchStore = options.firstLaunch ?? firstLaunchPref;
  const onError = options.onError ?? (() => undefined);
  const html = doc.documentElement;

  let first = firstLaunchStore.read();
  if (first === null || first > now()) {
    first = now();
    firstLaunchStore.write(first);
  }

  let stopped = false;
  /** Read after an await: `stop` may have come meanwhile. */
  const isStopped = () => stopped;
  let weighIns = 0;
  let ready = false;
  /** Consent may be asked for now: at launch, and on coming back to the app. */
  let mayAsk = true;
  let asking: Promise<void> | null = null;
  let started = false;
  let allowed = false;
  let banner: Banner | null = null;
  let unit: string | null = null;
  const choiceListeners = new Set<(required: boolean) => void>();
  const consent = new AdConsent(api, options.choices, onError);
  const cleanups: (() => void)[] = [];

  const due = () => ready && adsDue(first, now(), weighIns);
  const busy = () => BUSY_CLASSES.some((name) => html.classList.contains(name));
  const tellChoices = () => {
    for (const listener of choiceListeners) listener(!stopped && consent.privacyOptionsRequired);
  };

  const apply = () => {
    if (stopped || unit === null) return;
    if (started && allowed) {
      banner ??= mountBanner(api, unit, doc, onError);
      banner.want(due());
      return;
    }
    banner?.want(false);
    // Launch, or the return to the app, has passed with nothing due: the next chance is the next
    // return, so Google's message never comes in the middle of logging.
    if (ready && !due()) mayAsk = false;
    if (asking || !mayAsk || !due() || busy()) return;
    // Google is asked once per launch or return to the app; a refusal stands until then, or until
    // Privacy choices.
    mayAsk = false;
    asking = (async () => {
      try {
        const decision = await consent.decide();
        tellChoices();
        if (isStopped()) return;
        allowed = decision === 'ads';
        if (allowed && !started) {
          await api.initialize();
          started = true;
        }
      } catch (error) {
        // Google couldn't be asked (offline): no ads until the next try.
        onError(error);
      } finally {
        asking = null;
      }
      apply();
    })();
  };

  const launch = (async () => {
    let held: boolean;
    try {
      held = await options.entitlement.held();
    } catch (error) {
      // Without StoreKit's answer, the purchase may be held: nothing is started.
      onError(error);
      held = true;
    }
    if (held || isStopped()) {
      stopped = true;
      return;
    }
    try {
      unit = bannerUnit(await options.build());
    } catch (error) {
      onError(error);
      unit = null;
    }
    if (unit === null) return;
    cleanups.push(
      app.subscribe((state) => {
        ready = state.status === 'ready';
        weighIns = state.weighIns.length;
        apply();
      }),
    );
    const observer =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => {
            // A sheet closed or the keypad went down: consent waited for it.
            if (!started) apply();
          })
        : null;
    observer?.observe(html, { attributes: true, attributeFilter: ['class'] });
    const onVisible = () => {
      if (doc.visibilityState !== 'visible') return;
      mayAsk = true;
      apply();
    };
    doc.addEventListener('visibilitychange', onVisible);
    cleanups.push(() => {
      observer?.disconnect();
      doc.removeEventListener('visibilitychange', onVisible);
    });
  })();

  return {
    privacyChoices: () => !stopped && consent.privacyOptionsRequired,
    onPrivacyChoices: (listener) => {
      choiceListeners.add(listener);
      return () => {
        choiceListeners.delete(listener);
      };
    },
    showPrivacyChoices: async () => {
      if (stopped) return;
      const decision = await consent.changeChoices();
      tellChoices();
      if (isStopped()) return;
      allowed = decision === 'ads';
      if (allowed && !started) {
        try {
          await api.initialize();
          started = true;
        } catch (error) {
          onError(error);
        }
      }
      apply();
    },
    stop: async () => {
      stopped = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      const was = banner;
      banner = null;
      tellChoices();
      await was?.dispose();
    },
    settled: async () => {
      await launch;
      // Until nothing more is being asked.
      while (asking) await asking;
    },
  };
}
