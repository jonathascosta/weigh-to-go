// @vitest-environment happy-dom
/**
 * Remove ads (docs/sprint-4.md, story 2): StoreKit's current entitlements decide, the hint only
 * paints; every state of the row (design §7); Restore purchases; and the ads, which wait for the
 * answer at launch and stop when it is bought during a session.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { State } from '../app/app';
import type { Pref } from '../data/prefs';
import { FIRST_DAYS, startAds, type Ads } from './ads';
import { FakeAdMob, NO_GDPR } from './fake-admob.test-helper';
import { FakeStore, PRODUCT } from './fake-store.test-helper';
import { BUYING_CLASS, startPurchase, type LivePurchase, type Offer } from './purchase';

const html = document.documentElement;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

let store: FakeStore;
let hint: Pref<boolean> & { value: boolean };
let online: boolean;
let purchase: LivePurchase | null;
let ads: Ads | null;
beforeEach(() => {
  store = new FakeStore();
  hint = memory(false);
  online = true;
  purchase = null;
  ads = null;
  html.className = 'in-app';
});
afterEach(async () => {
  await ads?.stop();
  purchase?.dispose();
});

const start = () => {
  purchase = startPurchase({ api: store, doc: document, online: () => online, hint });
  return purchase;
};
const offer = (): Offer['kind'] => purchase?.view().offer.kind ?? 'none';

describe('Remove ads at launch', () => {
  it('is held when StoreKit’s current entitlements hold it, without asking for the price', async () => {
    store.entitled = true;
    const p = start();
    expect(await p.held()).toBe(true);
    p.show();
    await p.settled();
    expect(offer()).toBe('held');
    expect(hint.value).toBe(true);
    expect(store.calls).toEqual(['held']);
  });

  it('asks for the price only once Your data shows, then offers it', async () => {
    const p = start();
    expect(await p.held()).toBe(false);
    await p.settled();
    expect(offer()).toBe('checking');
    expect(store.calls).toEqual(['held']);
    p.show();
    await p.settled();
    expect(p.view().offer).toEqual({ kind: 'ready', product: PRODUCT });
  });

  it('paints last time’s answer first, but StoreKit’s answer replaces it: the hint unlocks nothing', async () => {
    hint.value = true;
    const p = start();
    expect(offer()).toBe('held');
    expect(await p.held()).toBe(false);
    p.show();
    await p.settled();
    expect(offer()).toBe('ready');
    expect(hint.value).toBe(false);
  });

  it('without StoreKit’s answer, rejects (the ads start nothing) and still offers the purchase', async () => {
    store.failHeld = true;
    const p = start();
    await expect(p.held()).rejects.toThrow('StoreKit');
    p.show();
    await p.settled();
    expect(offer()).toBe('ready');
  });

  it('says so when purchases aren’t allowed, the App Store can’t be reached or doesn’t know it', async () => {
    store.allowed = false;
    let p = start();
    p.show();
    await p.settled();
    expect(offer()).toBe('not-allowed');
    p.dispose();

    store = new FakeStore();
    store.failProduct = 'other';
    online = false;
    p = start();
    p.show();
    await p.settled();
    expect(offer()).toBe('offline');
    // Back online and back in the app: asked again.
    online = true;
    store.failProduct = null;
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    await p.settled();
    expect(offer()).toBe('ready');
    p.dispose();

    store = new FakeStore();
    store.product_ = null;
    p = start();
    p.show();
    await p.settled();
    expect(offer()).toBe('unavailable');
    store.product_ = PRODUCT;
    await p.retry();
    expect(offer()).toBe('ready');
  });
});

describe('buying Remove ads', () => {
  const ready = async () => {
    const p = start();
    p.show();
    await p.settled();
    expect(offer()).toBe('ready');
    return p;
  };

  it('puts `buying` on <html> while the App Store’s sheet is up, then is held, and says so once', async () => {
    const p = await ready();
    let heard = 0;
    p.onHeld(() => heard++);
    store.holdBuy = true;
    const buying = p.buy();
    expect(offer()).toBe('buying');
    expect(html.classList.contains(BUYING_CLASS)).toBe(true);
    store.finishBuy();
    await buying;
    expect(html.classList.contains(BUYING_CLASS)).toBe(false);
    expect(offer()).toBe('held');
    expect(hint.value).toBe(true);
    expect(await p.held()).toBe(true);
    store.change();
    await settle();
    expect(heard).toBe(1);
  });

  it('goes back to Ready with no message when the person cancels', async () => {
    const p = await ready();
    store.buyEnds = 'cancelled';
    await p.buy();
    expect(p.view().offer).toEqual({ kind: 'ready', product: PRODUCT });
    expect(html.classList.contains(BUYING_CLASS)).toBe(false);
  });

  it('waits for approval (Ask to Buy), and is held once the approval comes in', async () => {
    const p = await ready();
    let heard = 0;
    p.onHeld(() => heard++);
    store.buyEnds = 'pending';
    await p.buy();
    expect(offer()).toBe('pending');
    // Approved on the parent's phone: StoreKit's updates bring the transaction.
    store.entitled = true;
    store.change();
    await settle();
    expect(offer()).toBe('held');
    expect(heard).toBe(1);
  });

  it('tells a failure from purchases not allowed, offline and an unknown product', async () => {
    const cases: [string, () => void, Offer['kind']][] = [
      ['failed', () => (store.buyEnds = 'other'), 'failed'],
      ['not allowed', () => ((store.buyEnds = 'other'), (store.allowed = false)), 'not-allowed'],
      ['offline', () => ((store.buyEnds = 'other'), (online = false)), 'offline'],
      ['not found', () => (store.buyEnds = 'not-found'), 'unavailable'],
    ];
    for (const [, arrange, expected] of cases) {
      purchase?.dispose();
      store = new FakeStore();
      online = true;
      const p = await ready();
      arrange();
      await p.buy();
      expect(offer()).toBe(expected);
    }
    // Try again asks for the price again.
    store.allowed = true;
    online = true;
    store.buyEnds = null;
    await purchase?.retry();
    expect(offer()).toBe('ready');
  });

  it('buys only from Ready', async () => {
    const p = start();
    await p.buy();
    expect(store.calls).not.toContain('buy');
  });

  it('follows a refund: no longer held, offered again', async () => {
    store.entitled = true;
    const p = start();
    p.show();
    await p.settled();
    store.entitled = false;
    store.change();
    await settle();
    await p.settled();
    expect(offer()).toBe('ready');
    expect(hint.value).toBe(false);
  });
});

describe('Restore purchases', () => {
  it('finds a purchase made on another iPhone, under `buying`', async () => {
    const p = start();
    p.show();
    await p.settled();
    let heard = 0;
    p.onHeld(() => heard++);
    store.restoreFinds = true;
    const restoring = p.restore();
    expect(p.view().restore).toBe('restoring');
    expect(html.classList.contains(BUYING_CLASS)).toBe(true);
    await restoring;
    expect(html.classList.contains(BUYING_CLASS)).toBe(false);
    expect(p.view()).toEqual({ offer: { kind: 'held' }, restore: 'restored' });
    expect(heard).toBe(1);
  });

  it('says when there is nothing to restore, offline, or a failure', async () => {
    const p = start();
    await p.restore();
    expect(p.view().restore).toBe('none');
    store.restoreFails = true;
    online = false;
    await p.restore();
    expect(p.view().restore).toBe('offline');
    online = true;
    await p.restore();
    expect(p.view().restore).toBe('failed');
    expect(offer()).not.toBe('held');
  });
});

/** The diary, as the ads read it: ready, with a weigh-in. */
const diary = {
  subscribe: (listener: (state: State) => void) => {
    listener({ status: 'ready', weighIns: [{}] } as unknown as State);
    return () => undefined;
  },
};
const LAUNCHED = Date.UTC(2026, 9, 1);

describe('the ads with Remove ads (story 2)', () => {
  let admob: FakeAdMob;
  const startTheAds = (p: LivePurchase) => {
    admob = new FakeAdMob();
    ads = startAds({
      api: admob,
      build: () => Promise.resolve({ bannerId: '', sandbox: true, debug: false, appStore: false }),
      choices: () => Promise.resolve(NO_GDPR),
      entitlement: p,
      app: diary,
      doc: document,
      now: () => LAUNCHED + FIRST_DAYS * 86_400_000,
      firstLaunch: memory<number | null>(LAUNCHED),
      band: memory(false),
    });
    return ads;
  };

  it('wait for StoreKit’s answer before Google’s consent tool or the SDK', async () => {
    let answer: (held: boolean) => void = () => undefined;
    store.held = () => new Promise((resolve) => (answer = resolve));
    const a = startTheAds(start());
    await settle();
    expect(admob.calls).toEqual([]);
    answer(false);
    await a.settled();
    expect(admob.calls).toEqual(['info', 'start', 'show']);
  });

  it('start neither Google’s consent tool nor the SDK while it is held', async () => {
    store.entitled = true;
    const a = startTheAds(start());
    await a.settled();
    document.dispatchEvent(new Event('visibilitychange'));
    await a.settled();
    expect(admob.calls).toEqual([]);
  });

  it('take the banner away once it is bought during the session, and send Google nothing more', async () => {
    const p = start();
    const a = startTheAds(p);
    await a.settled();
    admob.load();
    p.show();
    await p.settled();
    await p.buy();
    await settle();
    expect(admob.calls.at(-1)).toBe('remove');
    const count = admob.calls.length;
    document.dispatchEvent(new Event('visibilitychange'));
    await a.showPrivacyChoices();
    await a.settled();
    expect(admob.calls).toHaveLength(count);
    expect(a.privacyChoices()).toBe(false);
  });

  it('stop too when an approval (Ask to Buy) comes in later', async () => {
    const p = start();
    const a = startTheAds(p);
    await a.settled();
    admob.load();
    store.entitled = true;
    store.change();
    await settle();
    expect(admob.calls.at(-1)).toBe('remove');
  });
});
