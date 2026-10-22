// @vitest-environment happy-dom
/**
 * The Remove ads and Restore purchases rows (design §7, "Remove ads, every state"): each state's
 * line and button in both languages, the price as StoreKit gives it, the focus handed on when the
 * button goes, and no rows where there is no App Store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import type { Purchase, PurchaseView } from '../ads/purchase';
import { choose, resetSettings, settings } from '../i18n';
import { mountRemoveAds, type RemoveAdsRows } from './remove-ads';

const PRODUCT = { price: 'R$ 14,90', family: false };

/** A purchase whose view is set by hand. */
class FakePurchase implements Purchase {
  current: PurchaseView = { offer: { kind: 'checking' }, restore: 'idle' };
  readonly calls: string[] = [];
  private readonly listeners = new Set<(view: PurchaseView) => void>();
  held = () => Promise.resolve(this.current.offer.kind === 'held');
  onHeld = () => () => undefined;
  view = () => this.current;
  subscribe = (listener: (view: PurchaseView) => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  buy = () => {
    this.calls.push('buy');
    return Promise.resolve();
  };
  restore = () => {
    this.calls.push('restore');
    return Promise.resolve();
  };
  retry = () => {
    this.calls.push('retry');
    return Promise.resolve();
  };
  show = () => {
    this.calls.push('show');
  };
  set(view: Partial<PurchaseView>): void {
    this.current = { ...this.current, ...view };
    for (const listener of this.listeners) listener(this.current);
  }
}

let purchase: FakePurchase;
let rows: RemoveAdsRows;
const $ = (id: string): HTMLElement => document.getElementById(id) ?? document.body;
const line = () => $('remove-ads-status').textContent;
const button = () => $('remove-ads-buy') as HTMLButtonElement;

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  choose({ lang: 'en' });
  purchase = new FakePurchase();
  rows = mountRemoveAds(purchase);
  document.body.replaceChildren(rows.offer, rows.restore, rows.restoreStatus);
  rows.draw(settings());
});
afterEach(() => {
  rows.dispose();
  resetSettings();
  vi.unstubAllGlobals();
});

describe('Remove ads', () => {
  it('asks for the price once drawn, and offers it on a button: one payment, no subscription', () => {
    expect(purchase.calls).toEqual(['show']);
    expect(line()).toBe('Asking the App Store…');
    expect(button().hidden).toBe(true);
    purchase.set({ offer: { kind: 'ready', product: PRODUCT } });
    expect(line()).toBe('One payment, for good; no subscription.');
    expect(button().hidden).toBe(false);
    expect(button().textContent).toBe('Buy · R$ 14,90');
    expect($('remove-ads-note').textContent).toBe(
      'Pay once and the ads are gone straight away, on every iPhone with this Apple Account, offline too.',
    );
    button().click();
    expect(purchase.calls).toContain('buy');
    purchase.set({ offer: { kind: 'ready', product: { ...PRODUCT, family: true } } });
    expect($('remove-ads-note').textContent).toContain('and for your Family Sharing group');
    rows.draw(choose({ lang: 'pt' }));
    expect(line()).toBe('Um pagamento, para sempre; sem assinatura.');
    expect(button().textContent).toBe('Comprar · R$ 14,90');
    expect($('remove-ads-note').textContent).toContain('Compartilhamento Familiar');
  });

  it('says each state calmly, with at most one button', () => {
    const states: [PurchaseView['offer'], unknown, string | null][] = [
      [{ kind: 'buying', product: PRODUCT }, 'Opening the App Store…', 'Buying…'],
      [
        { kind: 'pending' },
        'Waiting for approval. The ads go away as soon as the purchase is approved.',
        null,
      ],
      [{ kind: 'failed' }, 'The purchase didn’t go through. Try again later.', 'Try again'],
      [{ kind: 'offline' }, 'The App Store can’t be reached. Try again when you’re online.', 'Try again'],
      [
        { kind: 'unavailable' },
        '“Remove ads” isn’t available from the App Store just now. Try again later.',
        'Try again',
      ],
      [{ kind: 'not-allowed' }, expect.stringContaining('Screen Time'), null],
      [{ kind: 'held' }, 'Ads removed. Thank you.', null],
    ];
    for (const [offer, text, label] of states) {
      purchase.set({ offer });
      expect(line(), offer.kind).toEqual(text);
      expect(button().hidden, offer.kind).toBe(label === null);
      if (label) expect(button().textContent, offer.kind).toBe(label);
    }
  });

  it('keeps the button focusable while buying, and does nothing on a second tap', () => {
    purchase.set({ offer: { kind: 'buying', product: PRODUCT } });
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(button().disabled).toBe(false);
    button().click();
    expect(purchase.calls).not.toContain('buy');
  });

  it('asks again on Try again, keeping the button and the focus on it while it asks', () => {
    purchase.set({ offer: { kind: 'offline' } });
    expect($('remove-ads-status').classList.contains('status-bad')).toBe(false);
    button().focus();
    button().click();
    expect(purchase.calls).toContain('retry');
    purchase.set({ offer: { kind: 'checking' } });
    expect(line()).toBe('Asking the App Store…');
    expect(button().hidden).toBe(false);
    expect(button().textContent).toBe('Try again');
    expect(button().getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button());
    purchase.calls.length = 0;
    button().click();
    expect(purchase.calls).toEqual([]);
    purchase.set({ offer: { kind: 'ready', product: PRODUCT } });
    expect(button().getAttribute('aria-disabled')).toBeNull();
    expect(button().textContent).toBe('Buy · R$ 14,90');
    expect(document.activeElement).toBe(button());
    // A state with no button: the focus goes to the title.
    purchase.set({ offer: { kind: 'not-allowed' } });
    expect(document.activeElement).toBe($('remove-ads-title'));
  });

  it('draws every line plain, a failure too (design §7)', () => {
    purchase.set({ offer: { kind: 'failed' } });
    expect($('remove-ads-status').className).toBe('status');
  });

  it('hands the focus to its title when the button goes, bought', () => {
    purchase.set({ offer: { kind: 'ready', product: PRODUCT } });
    button().focus();
    purchase.set({ offer: { kind: 'buying', product: PRODUCT } });
    expect(document.activeElement).toBe(button());
    purchase.set({ offer: { kind: 'held' } });
    expect(document.activeElement).toBe($('remove-ads-title'));
  });

  it('keeps its lines in the accessibility tree as live regions', () => {
    for (const id of ['remove-ads-status', 'restore-status']) {
      expect($(id).getAttribute('role')).toBe('status');
      expect($(id).hidden).toBe(false);
    }
  });

  it('shows no rows where there is no App Store', () => {
    purchase.set({ offer: { kind: 'none' } });
    expect(rows.offer.hidden).toBe(true);
    expect(rows.restore.hidden).toBe(true);
  });
});

describe('Restore purchases', () => {
  it('asks the App Store, and says what it found', () => {
    expect($('restore-purchases').textContent).toContain('Restore purchases');
    expect($('restore-purchases').textContent).toContain('Bought on another iPhone? Get it back here.');
    expect($('restore-status').textContent).toBe('');
    $('restore-purchases').click();
    expect(purchase.calls).toContain('restore');
    const lines: [PurchaseView['restore'], string][] = [
      ['restoring', 'Asking the App Store…'],
      ['restored', 'Purchase restored.'],
      ['none', 'No purchase to restore for this Apple Account.'],
      ['offline', 'Couldn’t reach the App Store. Try again.'],
      ['failed', 'Nothing was restored. Try again.'],
    ];
    for (const [restore, text] of lines) {
      purchase.set({ restore });
      expect($('restore-status').textContent, restore).toBe(text);
    }
    purchase.set({ restore: 'restoring' });
    purchase.calls.length = 0;
    $('restore-purchases').click();
    expect(purchase.calls).toEqual([]);
    rows.draw(choose({ lang: 'pt' }));
    expect($('restore-purchases').textContent).toContain('Restaurar compras');
    expect($('restore-status').textContent).toBe('Consultando a App Store…');
  });
});
