/**
 * The App Store as src/ads/purchase.ts sees it, recording each call in order: what StoreKit's
 * current entitlements hold, the product, and how a purchase or a restore ends, set by hand.
 */
import { StoreError, type Product, type StoreApi, type StoreFailure } from './purchase';

export const PRODUCT: Product = { price: '€2.99', family: false };

export class FakeStore implements StoreApi {
  readonly calls: string[] = [];
  /** What `Transaction.currentEntitlements` holds. */
  entitled = false;
  /** StoreKit can't answer about the entitlements. */
  failHeld = false;
  product_: Product | null = PRODUCT;
  /** The price can't be had: how it fails. */
  failProduct: StoreFailure | null = null;
  allowed = true;
  /** How the purchase ends: bought (null), or a failure. */
  buyEnds: StoreFailure | null = null;
  /** How a restore ends: the App Store answered (null), or it failed. */
  restoreFails = false;
  /** What a restore finds: the purchase made on another iPhone. */
  restoreFinds = false;
  /** Set to hold the purchase's answer until `finishBuy`. */
  holdBuy = false;
  private finish: (() => void) | null = null;
  private readonly changes = new Set<() => void>();

  held(): Promise<boolean> {
    this.calls.push('held');
    return this.failHeld ? Promise.reject(new Error('StoreKit')) : Promise.resolve(this.entitled);
  }

  product(): Promise<Product | null> {
    this.calls.push('product');
    if (this.failProduct) return Promise.reject(new StoreError(this.failProduct, 'no product'));
    return Promise.resolve(this.product_);
  }

  buy(): Promise<void> {
    this.calls.push('buy');
    const end = () => {
      if (this.buyEnds) throw new StoreError(this.buyEnds, this.buyEnds);
      this.entitled = true;
    };
    if (!this.holdBuy) return Promise.resolve().then(end);
    return new Promise((resolve, reject) => {
      this.finish = () => {
        try {
          end();
          resolve();
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
    });
  }

  finishBuy(): void {
    this.finish?.();
    this.finish = null;
  }

  restore(): Promise<void> {
    this.calls.push('restore');
    if (this.restoreFails) return Promise.reject(new StoreError('other', 'sync failed'));
    if (this.restoreFinds) this.entitled = true;
    return Promise.resolve();
  }

  canPay(): Promise<boolean> {
    this.calls.push('canPay');
    return Promise.resolve(this.allowed);
  }

  onChange(listener: () => void): () => void {
    this.changes.add(listener);
    return () => {
      this.changes.delete(listener);
    };
  }

  /** The native side: a transaction came in (approved, bought elsewhere, refunded). */
  change(): void {
    for (const listener of this.changes) listener();
  }

  listeners(): number {
    return this.changes.size;
  }
}
