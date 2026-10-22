/**
 * Remove ads and Restore purchases, in Your data › iPhone app (design §7, "Remove ads, every
 * state"; docs/sprint-4.md, story 2). The button shows the price StoreKit gives; the App Store's own
 * sheet, at the bottom of the screen, is the confirmation, so there is no sheet of ours before it.
 * Each row's line is a live region, never hidden, so a screen reader hears each change. A button
 * that goes (bought, waiting for approval) hands the focus to the row's title. Nothing here knows
 * StoreKit: it draws the purchase's view (src/ads/purchase.ts).
 */
import type { Purchase, PurchaseView } from '../ads/purchase';
import type { Settings } from '../i18n';
import { chevron, h } from './dom';

export interface RemoveAdsRows {
  /** The Remove ads card. */
  readonly offer: HTMLElement;
  /** The Restore purchases row and its line. */
  readonly restore: HTMLButtonElement;
  readonly restoreStatus: HTMLElement;
  /** Draws both in the reader's language, and asks for the price the first time. */
  readonly draw: (s: Settings) => void;
  /** Stops following the purchase (for tests). */
  readonly dispose: () => void;
}

export function mountRemoveAds(purchase: Purchase): RemoveAdsRows {
  const title = h('h3', { attrs: { id: 'remove-ads-title', tabindex: -1 } });
  const status = h('p', { class: 'status', attrs: { role: 'status', id: 'remove-ads-status' } });
  const note = h('p', { class: 'note', attrs: { id: 'remove-ads-note' } });
  // aria-disabled rather than disabled while buying: a disabled button drops the focus.
  const button = h('button', {
    class: 'button iap-buy',
    attrs: { type: 'button', id: 'remove-ads-buy', 'aria-describedby': 'remove-ads-note' },
  });
  const offer = h(
    'section',
    { class: 'group-pad iap', attrs: { id: 'remove-ads', 'aria-labelledby': 'remove-ads-title' } },
    title,
    status,
    note,
    button,
  );
  const restoreName = h('span');
  const restoreSub = h('span', { class: 'row-sub' });
  const restore = h(
    'button',
    { class: 'row', attrs: { type: 'button', id: 'restore-purchases' } },
    h('span', { class: 'grow' }, restoreName, restoreSub),
    chevron(),
  );
  const restoreStatus = h('p', {
    class: 'status group-pad choices-status',
    attrs: { role: 'status', id: 'restore-status' },
  });

  let current: Settings | null = null;
  let drawn: PurchaseView | null = null;

  const paint = (s: Settings, view: PurchaseView) => {
    const m = s.messages;
    const { offer: o } = view;
    const none = o.kind === 'none';
    offer.hidden = none;
    restore.hidden = none;
    title.textContent = m['iap.title'];
    restoreName.textContent = m['iap.restore'];
    restoreSub.textContent = m['iap.restoreNote'];

    const line =
      o.kind === 'held'
        ? m['iap.held']
        : o.kind === 'buying'
          ? m['iap.buying']
          : o.kind === 'pending'
            ? m['iap.pending']
            : o.kind === 'failed'
              ? m['iap.failed']
              : o.kind === 'offline'
                ? m['iap.offline']
                : o.kind === 'unavailable'
                  ? m['iap.unavailable']
                  : o.kind === 'not-allowed'
                    ? m['iap.notAllowed']
                    : o.kind === 'none'
                      ? ''
                      : m['iap.ready'];
    if (status.textContent !== line) status.textContent = line;
    status.classList.toggle('status-bad', o.kind === 'failed');
    const product = o.kind === 'ready' || o.kind === 'buying' ? o.product : null;
    note.hidden = product === null;
    note.textContent = product ? m['iap.note'](product.family) : '';
    const label =
      o.kind === 'ready'
        ? m['iap.buy'](o.product.price)
        : o.kind === 'buying'
          ? m['iap.buyingButton']
          : o.kind === 'failed' || o.kind === 'offline' || o.kind === 'unavailable'
            ? m['iap.tryAgain']
            : null;
    const hadFocus = document.activeElement === button;
    button.hidden = label === null;
    button.textContent = label ?? '';
    button.classList.toggle('button-ghost', label === m['iap.tryAgain']);
    if (o.kind === 'buying') button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    if (hadFocus && button.hidden) title.focus({ preventScroll: true });

    const restoring = view.restore === 'restoring';
    if (restoring) restore.setAttribute('aria-disabled', 'true');
    else restore.removeAttribute('aria-disabled');
    const restoreLine =
      view.restore === 'restoring'
        ? m['iap.restoring']
        : view.restore === 'restored'
          ? m['iap.restored']
          : view.restore === 'none'
            ? m['iap.restoreNone']
            : view.restore === 'offline'
              ? m['iap.restoreOffline']
              : view.restore === 'failed'
                ? m['iap.restoreFailed']
                : '';
    if (restoreStatus.textContent !== restoreLine) restoreStatus.textContent = restoreLine;
    drawn = view;
  };

  button.addEventListener('click', () => {
    const { kind } = purchase.view().offer;
    if (kind === 'ready') void purchase.buy();
    else if (kind === 'failed' || kind === 'offline' || kind === 'unavailable') void purchase.retry();
  });
  restore.addEventListener('click', () => {
    if (purchase.view().restore === 'restoring') return;
    void purchase.restore();
  });
  const dispose = purchase.subscribe((view) => {
    if (current && view !== drawn) paint(current, view);
  });

  return {
    offer,
    restore,
    restoreStatus,
    draw: (s) => {
      current = s;
      purchase.show();
      paint(s, purchase.view());
    },
    dispose,
  };
}
