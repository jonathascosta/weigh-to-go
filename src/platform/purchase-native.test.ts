// @vitest-environment happy-dom
/**
 * The native side of Remove ads: the plugin's calls as the purchase makes them (current
 * entitlements, verified only; no call at launch that rejects on an unknown product), its fixed
 * messages read as kinds of failure, and nothing in a browser.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REMOVE_ADS } from '../ads/purchase';

const calls: [string, unknown][] = [];
let native = true;
let purchases: { productIdentifier: string; revocationDate?: string }[] = [];
let products: { identifier: string; priceString: string; isFamilyShareable: boolean }[] = [];
let buyFails: string | null = null;
const updates: ((transaction: { productIdentifier: string }) => void)[] = [];

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => true },
  registerPlugin: () => ({
    canMakePayments: () => {
      calls.push(['canMakePayments', null]);
      return Promise.resolve({ allowed: false });
    },
  }),
}));
vi.mock('@capgo/native-purchases', () => ({
  PURCHASE_TYPE: { INAPP: 'inapp', SUBS: 'subs' },
  NativePurchases: {
    getPurchases: (options: unknown) => {
      calls.push(['getPurchases', options]);
      return Promise.resolve({ purchases });
    },
    getProducts: (options: unknown) => {
      calls.push(['getProducts', options]);
      return Promise.resolve({ products });
    },
    getProduct: () => Promise.reject(new Error('Product not found')),
    purchaseProduct: (options: unknown) => {
      calls.push(['purchaseProduct', options]);
      return buyFails
        ? Promise.reject(new Error(buyFails))
        : Promise.resolve({ transactionId: '1', productIdentifier: REMOVE_ADS });
    },
    restorePurchases: () => {
      calls.push(['restorePurchases', null]);
      return Promise.resolve();
    },
    addListener: (event: string, listener: (transaction: { productIdentifier: string }) => void) => {
      calls.push(['addListener', event]);
      updates.push(listener);
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
  },
}));

const { appStore, failureOf, grants, nativePurchase } = await import('./purchase-native');

beforeEach(() => {
  calls.length = 0;
  native = true;
  purchases = [];
  products = [];
  buyFails = null;
});

describe('the App Store, through the plugin', () => {
  it('reads StoreKit’s current entitlements only, and holds Remove ads unless refunded', async () => {
    expect(await appStore.held()).toBe(false);
    expect(calls).toEqual([['getPurchases', { productType: 'inapp', onlyCurrentEntitlements: true }]]);
    purchases = [{ productIdentifier: 'something.else' }];
    expect(await appStore.held()).toBe(false);
    purchases = [{ productIdentifier: REMOVE_ADS, revocationDate: '2026-10-20T10:00:00Z' }];
    expect(await appStore.held()).toBe(false);
    purchases = [{ productIdentifier: REMOVE_ADS }];
    expect(await appStore.held()).toBe(true);
    expect(grants({ productIdentifier: REMOVE_ADS })).toBe(true);
  });

  it('asks for the product with a call that answers an unknown product with nothing, not an error', async () => {
    expect(await appStore.product()).toBeNull();
    expect(calls).toEqual([['getProducts', { productIdentifiers: [REMOVE_ADS], productType: 'inapp' }]]);
    products = [{ identifier: REMOVE_ADS, priceString: 'R$ 14,90', isFamilyShareable: true }];
    expect(await appStore.product()).toEqual({ price: 'R$ 14,90', family: true });
  });

  it('buys one Remove ads, and reads the plugin’s fixed messages as kinds of failure', async () => {
    await appStore.buy();
    expect(calls).toEqual([
      ['purchaseProduct', { productIdentifier: REMOVE_ADS, productType: 'inapp', quantity: 1 }],
    ]);
    buyFails = 'User cancelled';
    await expect(appStore.buy()).rejects.toMatchObject({ kind: 'cancelled' });
    buyFails = 'Transaction pending';
    await expect(appStore.buy()).rejects.toMatchObject({ kind: 'pending' });
    buyFails = `Cannot find product for id ${REMOVE_ADS}`;
    await expect(appStore.buy()).rejects.toMatchObject({ kind: 'not-found' });
    buyFails = 'Não foi possível conectar à App Store.';
    await expect(appStore.buy()).rejects.toMatchObject({ kind: 'other' });
    expect(failureOf('Product not found')).toBe('not-found');
    expect(failureOf(null)).toBe('other');
  });

  it('restores with the App Store, asks the app’s plugin whether purchases are allowed, and hears ours only', async () => {
    await appStore.restore();
    expect(await appStore.canPay()).toBe(false);
    let heard = 0;
    const stop = appStore.onChange(() => heard++);
    for (const update of updates) update({ productIdentifier: 'something.else' });
    for (const update of updates) update({ productIdentifier: REMOVE_ADS });
    expect(heard).toBe(1);
    stop();
    expect(calls.map(([name]) => name)).toEqual(['restorePurchases', 'canMakePayments', 'addListener']);
  });
});

describe('Remove ads in a browser', () => {
  it('is none, and calls nothing', () => {
    native = false;
    expect(nativePurchase()).toBeNull();
    expect(calls).toEqual([]);
  });
});
