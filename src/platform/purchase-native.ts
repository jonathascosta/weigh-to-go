/**
 * The native side of Remove ads (src/ads/purchase.ts): StoreKit 2 through `@capgo/native-purchases`,
 * which checks every transaction on the phone (verified ones only) and talks to no server but
 * Apple's; and the app's own plugin (ios/App/App/AdSetupPlugin.swift) for whether this iPhone allows
 * purchases. Nothing here sends a receipt or a transaction anywhere: the plugin's answers carry them,
 * and they are read for the product id and dropped. Loaded only in the app's build.
 *
 * The plugin turns StoreKit's outcomes into rejections with fixed English messages for the person
 * cancelling, a pending purchase (Ask to Buy) and an unknown product; anything else is StoreKit's
 * own localized description, so the purchase tells those apart by asking whether purchases are
 * allowed and whether the phone is online.
 *
 * At launch only calls that resolve on an unknown product are made (`getPurchases`, `getProducts`):
 * a rejected call is logged as an error by Capacitor in a debug build, which the iOS workflow's
 * simulator run counts as a failure.
 */
import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  REMOVE_ADS,
  StoreError,
  startPurchase,
  type Purchase,
  type StoreApi,
  type StoreFailure,
} from '../ads/purchase';

interface PaymentsPlugin {
  canMakePayments(): Promise<{ allowed: boolean }>;
}

const AdSetup = registerPlugin<PaymentsPlugin>('AdSetup');

const report = (error: unknown): void => {
  console.warn('weigh-to-go: purchase:', error);
};

/** The plugin's fixed messages (NativePurchasesPlugin+PurchaseHandling.swift, 8.9.5). */
export function failureOf(error: unknown): StoreFailure {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (message === 'User cancelled') return 'cancelled';
  if (message === 'Transaction pending') return 'pending';
  if (/^Cannot find product\b|^Product not found$/.test(message)) return 'not-found';
  return 'other';
}

const storeError = (error: unknown): StoreError =>
  new StoreError(failureOf(error), error instanceof Error ? error.message : String(error));

/** Rejects with a StoreError. */
const call = async <T>(run: () => Promise<T>): Promise<T> => {
  try {
    return await run();
  } catch (error) {
    throw storeError(error);
  }
};

/** A transaction that gives Remove ads now: ours, and not refunded. */
export const grants = (transaction: Pick<Transaction, 'productIdentifier' | 'revocationDate'>): boolean =>
  transaction.productIdentifier === REMOVE_ADS && !transaction.revocationDate;

/** The plugin, as src/ads/purchase.ts asks for it. */
export const appStore: StoreApi = {
  held: () =>
    call(async () => {
      // `Transaction.currentEntitlements`: verified transactions only, refunds left out; StoreKit
      // keeps them on the phone, so this answers offline too.
      const { purchases } = await NativePurchases.getPurchases({
        productType: PURCHASE_TYPE.INAPP,
        onlyCurrentEntitlements: true,
      });
      return purchases.some(grants);
    }),
  product: () =>
    call(async () => {
      const { products } = await NativePurchases.getProducts({
        productIdentifiers: [REMOVE_ADS],
        productType: PURCHASE_TYPE.INAPP,
      });
      const product = products.find((p) => p.identifier === REMOVE_ADS);
      return product ? { price: product.priceString, family: product.isFamilyShareable } : null;
    }),
  buy: () =>
    call(async () => {
      const transaction = await NativePurchases.purchaseProduct({
        productIdentifier: REMOVE_ADS,
        productType: PURCHASE_TYPE.INAPP,
        quantity: 1,
      });
      if (!grants(transaction)) throw new Error('The App Store answered with another transaction');
    }),
  restore: () => call(() => NativePurchases.restorePurchases()),
  canPay: async () => (await AdSetup.canMakePayments()).allowed,
  onChange: (listener) => {
    const handles = [
      NativePurchases.addListener('transactionUpdated', (transaction) => {
        if (transaction.productIdentifier === REMOVE_ADS) listener();
      }),
    ];
    return () => {
      for (const handle of handles) handle.then((h) => h.remove()).catch(report);
    };
  },
};

/** Whether the plugins are there: logged as an error if not, so the simulator check fails. */
function registered(): boolean {
  if (Capacitor.isPluginAvailable('NativePurchases')) return true;
  console.error('weigh-to-go: the NativePurchases plugin is not registered');
  return false;
}

/**
 * Remove ads in the iPhone app. Null in a browser (the app's pages opened by the end-to-end tests),
 * where there is no StoreKit: no rows, and nothing held.
 */
export function nativePurchase(): Purchase | null {
  if (!Capacitor.isNativePlatform() || !registered()) return null;
  return startPurchase({ api: appStore, doc: document, onError: report });
}
