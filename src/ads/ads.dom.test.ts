// @vitest-environment happy-dom
/**
 * The order of the ads at launch (docs/sprint-4.md, story 1): the purchase, the build's ad unit,
 * the first days, the consent, then the SDK and the banner, non-personalised.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { State } from '../app/app';
import type { Pref } from '../data/prefs';
import {
  adsDue,
  bannerUnit,
  FIRST_DAYS,
  NOTHING_HELD,
  startAds,
  TEST_BANNER_UNIT,
  type Ads,
  type BuildAds,
  type Entitlement,
} from './ads';
import { AD_HEIGHT } from './banner';
import type { ConsentChoices } from './consent';
import { CONSENTED, FakeAdMob, NO_GDPR, REFUSED } from './fake-admob.test-helper';

const DAY = 86_400_000;
const LAUNCHED = Date.UTC(2026, 9, 1);
const html = document.documentElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The diary, as the ads read it: whether it is ready, and how many weigh-ins. */
class FakeDiary {
  private listeners = new Set<(state: State) => void>();
  state = { status: 'ready', weighIns: [{}] } as unknown as State;
  subscribe(listener: (state: State) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  set(weighIns: number): void {
    this.state = {
      status: 'ready',
      weighIns: Array.from({ length: weighIns }, () => ({})),
    } as unknown as State;
    for (const listener of this.listeners) listener(this.state);
  }
}

const memory = <T>(value: T): Pref<T> & { value: T } => {
  const box = {
    value,
    read: () => box.value,
    write: (next: T) => {
      box.value = next;
      return true;
    },
  };
  return box;
};
const memoryPref = (value: number | null) => memory<number | null>(value);

const TESTFLIGHT: BuildAds = {
  bannerId: 'ca-app-pub-1234567890123456/1111111111',
  sandbox: true,
  debug: false,
  appStore: false,
};

let api: FakeAdMob;
let diary: FakeDiary;
let ads: Ads | null;
let band: Pref<boolean> & { value: boolean };
beforeEach(() => {
  band = memory(false);
  api = new FakeAdMob();
  diary = new FakeDiary();
  ads = null;
  html.className = 'in-app';
  html.style.removeProperty(AD_HEIGHT);
});
afterEach(async () => {
  await ads?.stop();
});

const start = (
  options: {
    entitlement?: Entitlement;
    build?: BuildAds;
    choices?: ConsentChoices;
    now?: number;
    first?: Pref<number | null>;
  } = {},
) => {
  const first = options.first ?? memoryPref(LAUNCHED);
  let now = options.now ?? LAUNCHED + FIRST_DAYS * DAY;
  ads = startAds({
    api,
    build: () => Promise.resolve(options.build ?? TESTFLIGHT),
    choices: () => Promise.resolve(options.choices ?? NO_GDPR),
    entitlement: options.entitlement ?? NOTHING_HELD,
    app: diary,
    doc: document,
    now: () => now,
    firstLaunch: first,
    band,
  });
  return {
    ads,
    first,
    later: (ms: number) => {
      now += ms;
    },
  };
};

describe('the ads at launch', () => {
  it('start the SDK and ask for a banner once the first days are over, every request non-personalised', async () => {
    const { ads } = start();
    await ads.settled();
    expect(api.calls).toEqual(['info', 'start', 'show']);
    expect(api.banners).toEqual([
      { adId: TEST_BANNER_UNIT, adSize: 'BANNER', position: 'TOP_CENTER', margin: 0, npa: true },
    ]);
  });

  it('ask for non-personalised ads even after a consent to personalised ones', async () => {
    api.info = { ...api.info, status: 'REQUIRED', isConsentFormAvailable: true };
    api.afterForm = { status: 'OBTAINED' };
    const { ads } = start({ choices: CONSENTED });
    await ads.settled();
    expect(api.calls).toEqual(['info', 'form', 'start', 'show']);
    expect(api.banners.map((request) => request.npa as unknown)).toEqual(api.banners.map(() => true));
    // And again after a banner that failed, asked for anew.
    api.fail();
    document.dispatchEvent(new Event('visibilitychange'));
    await ads.settled();
    expect(api.banners).toHaveLength(2);
    expect(api.banners.map((request) => request.npa as unknown)).toEqual(api.banners.map(() => true));
  });

  it('start neither Google’s consent tool nor the SDK while the Remove ads purchase is held', async () => {
    const { ads } = start({ entitlement: { held: () => Promise.resolve(true) } });
    await ads.settled();
    document.dispatchEvent(new Event('visibilitychange'));
    diary.set(3);
    await ads.settled();
    expect(api.calls).toEqual([]);
    expect(ads.privacyChoices()).toBe(false);
  });

  it('wait for the purchase’s answer before anything, and start nothing without one', async () => {
    let answer: (held: boolean) => void = () => undefined;
    const { ads } = start({ entitlement: { held: () => new Promise((resolve) => (answer = resolve)) } });
    await settle();
    expect(api.calls).toEqual([]);
    answer(false);
    await ads.settled();
    expect(api.calls).toEqual(['info', 'start', 'show']);

    await ads.stop();
    api = new FakeAdMob();
    const failing = start({ entitlement: { held: () => Promise.reject(new Error('StoreKit')) } });
    await failing.ads.settled();
    expect(api.calls).toEqual([]);
  });

  it('on a refusal show no ads and never start the SDK (decision 64)', async () => {
    api.info = { ...api.info, status: 'REQUIRED', isConsentFormAvailable: true };
    api.afterForm = { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
    const { ads } = start({ choices: REFUSED });
    await ads.settled();
    expect(api.calls).toEqual(['info', 'form']);
    expect(api.calls).not.toContain('start');
    expect(api.banners).toHaveLength(0);
    // Privacy choices is offered there.
    expect(ads.privacyChoices()).toBe(true);
  });

  it('start the SDK after a change of mind in Privacy choices, and stop the banner on a withdrawal', async () => {
    api.info = { ...api.info, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
    let choices = REFUSED;
    ads = startAds({
      api,
      build: () => Promise.resolve(TESTFLIGHT),
      choices: () => Promise.resolve(choices),
      entitlement: NOTHING_HELD,
      app: diary,
      doc: document,
      now: () => LAUNCHED + FIRST_DAYS * DAY,
      firstLaunch: memoryPref(LAUNCHED),
      band,
    });
    await ads.settled();
    expect(api.calls).toEqual(['info']);
    choices = CONSENTED;
    await ads.showPrivacyChoices();
    expect(api.calls).toEqual(['info', 'options', 'info', 'start', 'show']);
    api.load();
    choices = REFUSED;
    await ads.showPrivacyChoices();
    expect(api.calls.at(-1)).toBe('remove');
    expect(html.style.getPropertyValue(AD_HEIGHT)).toBe('0px');
  });

  it('request nothing when Google can’t be asked, and ask again on coming back to the app', async () => {
    api.failInfo = true;
    const { ads } = start();
    await ads.settled();
    expect(api.calls).toEqual(['info']);
    api.failInfo = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await ads.settled();
    expect(api.calls).toEqual(['info', 'info', 'start', 'show']);
  });
});

describe('the first days', () => {
  it('show nothing and ask Google nothing in the first 7 days after the first launch', async () => {
    const first = memoryPref(null);
    const { ads, later } = start({ first, now: LAUNCHED });
    await ads.settled();
    // The first launch is kept.
    expect(first.value).toBe(LAUNCHED);
    expect(api.calls).toEqual([]);
    later(FIRST_DAYS * DAY - 1);
    document.dispatchEvent(new Event('visibilitychange'));
    await ads.settled();
    expect(api.calls).toEqual([]);
    later(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await ads.settled();
    expect(api.calls).toEqual(['info', 'start', 'show']);
  });

  it('show nothing while the diary is empty, and take the banner away when it empties', async () => {
    diary.set(0);
    const { ads } = start();
    await ads.settled();
    expect(api.calls).toEqual([]);
    // The first weigh-in: consent is asked at the next launch or return, never in the middle of
    // logging.
    diary.set(1);
    await ads.settled();
    expect(api.calls).toEqual([]);
    document.dispatchEvent(new Event('visibilitychange'));
    await ads.settled();
    expect(api.calls).toEqual(['info', 'start', 'show']);
    api.load();
    diary.set(0);
    expect(api.calls.at(-1)).toBe('remove');
    expect(html.style.getPropertyValue(AD_HEIGHT)).toBe('0px');
  });

  it('wait for a sheet or the keypad to go before Google’s message', async () => {
    html.classList.add('typing');
    const { ads } = start();
    await ads.settled();
    expect(api.calls).toEqual([]);
    html.classList.remove('typing');
    await settle();
    await ads.settled();
    expect(api.calls).toEqual(['info', 'start', 'show']);
  });

  it('count from the first launch, and need a weigh-in', () => {
    expect(adsDue(LAUNCHED, LAUNCHED + 7 * DAY, 1)).toBe(true);
    expect(adsDue(LAUNCHED, LAUNCHED + 7 * DAY - 1, 1)).toBe(false);
    expect(adsDue(LAUNCHED, LAUNCHED + 30 * DAY, 0)).toBe(false);
  });
});

describe('the ad unit', () => {
  const owner = 'ca-app-pub-1234567890123456/1111111111';
  it('is Google’s test unit on TestFlight and in debug builds, the owner’s on the App Store', () => {
    expect(bannerUnit({ bannerId: owner, sandbox: true, debug: false, appStore: false })).toBe(
      TEST_BANNER_UNIT,
    );
    expect(bannerUnit({ bannerId: owner, sandbox: false, debug: true, appStore: false })).toBe(
      TEST_BANNER_UNIT,
    );
    expect(bannerUnit({ bannerId: owner, sandbox: false, debug: false, appStore: true })).toBe(owner);
    // Not from a run for the App Store: it carries no ids of the owner's, and shows nothing there.
    expect(bannerUnit({ bannerId: owner, sandbox: false, debug: false, appStore: false })).toBeNull();
  });

  it('is none on the App Store without the owner’s, so test ads can’t ship', async () => {
    expect(bannerUnit({ bannerId: '', sandbox: false, debug: false, appStore: true })).toBeNull();
    expect(
      bannerUnit({ bannerId: '$(ADMOB_BANNER_ID)', sandbox: false, debug: false, appStore: true }),
    ).toBeNull();
    expect(
      bannerUnit({ bannerId: TEST_BANNER_UNIT, sandbox: false, debug: false, appStore: true }),
    ).toBeNull();
    const { ads } = start({ build: { bannerId: '', sandbox: false, debug: false, appStore: true } });
    await ads.settled();
    // Not even Google's consent tool is started.
    expect(api.calls).toEqual([]);
  });
});

describe('Remove ads bought during a session (story 2)', () => {
  it('takes the banner away and starts nothing more', async () => {
    const { ads } = start();
    await ads.settled();
    api.load();
    await ads.stop();
    expect(api.calls.at(-1)).toBe('remove');
    const count = api.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    diary.set(4);
    await ads.showPrivacyChoices();
    await ads.settled();
    expect(api.calls).toHaveLength(count);
    expect(ads.privacyChoices()).toBe(false);
  });
});

describe('what reaches the ad SDK', () => {
  it('is the ad unit, the banner’s size and place and npa: never a weigh-in', async () => {
    diary.set(3);
    const { ads } = start();
    await ads.settled();
    for (const request of api.banners)
      expect(Object.keys(request).sort()).toEqual(['adId', 'adSize', 'margin', 'npa', 'position']);
  });
});

describe('the band at launch', () => {
  const height = () => html.style.getPropertyValue(AD_HEIGHT);

  it('stays up from last time while the banner is asked for', async () => {
    band.value = true;
    html.style.setProperty(AD_HEIGHT, '50px');
    const { ads } = start();
    await ads.settled();
    expect(height()).toBe('50px');
    expect(band.value).toBe(true);
  });

  it('goes when this launch shows no banner: the purchase held, the first days, a refusal', async () => {
    for (const setup of ['held', 'early', 'refused'] as const) {
      api = new FakeAdMob();
      band.value = true;
      html.style.setProperty(AD_HEIGHT, '50px');
      if (setup === 'refused') {
        api.info = { ...api.info, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
      }
      const { ads } = start({
        ...(setup === 'held' ? { entitlement: { held: () => Promise.resolve(true) } } : {}),
        ...(setup === 'early' ? { now: LAUNCHED + DAY } : {}),
        ...(setup === 'refused' ? { choices: REFUSED } : {}),
      });
      await ads.settled();
      expect(height(), setup).toBe('0px');
      expect(band.value, setup).toBe(false);
      await ads.stop();
    }
  });
});

describe('Erase everything during a session', () => {
  it('starts the 7 days again at once', async () => {
    const first = memoryPref(LAUNCHED);
    const { ads } = start({ first });
    await ads.settled();
    api.load();
    expect(api.calls).toEqual(['info', 'start', 'show']);
    // The erase clears the preferences, and the diary empties, then fills again.
    first.value = null;
    diary.set(0);
    diary.set(1);
    expect(api.calls.at(-1)).toBe('remove');
    expect(api.banners).toHaveLength(1);
    expect(first.value).toBe(LAUNCHED + FIRST_DAYS * DAY);
  });
});

describe('Privacy choices that can’t open', () => {
  it('says so, and changes nothing', async () => {
    api.info = { ...api.info, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
    api.failOptions = true;
    const { ads } = start({ choices: CONSENTED });
    await ads.settled();
    expect(await ads.showPrivacyChoices()).toBe(false);
    expect(api.calls.filter((c) => c === 'start')).toHaveLength(1);
  });
});

describe('the SDK’s start', () => {
  it('is asked for once, though consent and Privacy choices both allow ads', async () => {
    api.info = { ...api.info, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
    const { ads } = start({ choices: CONSENTED });
    await Promise.all([ads.settled(), ads.showPrivacyChoices()]);
    await ads.settled();
    expect(api.calls.filter((c) => c === 'start')).toHaveLength(1);
  });
});
