/**
 * The Remove ads purchase's answer last time, kept with the screen preferences: a hint for the first
 * paint of Your data only, before StoreKit has answered (purchase.ts). It never unlocks anything:
 * the ads wait for StoreKit, and StoreKit's answer replaces it at every launch. No StoreKit code
 * here, so the diary's own code can read it.
 */
import { pref, type Pref } from '../data/prefs';
import type { PurchaseView } from './purchase';

export const heldHintPref = /* @__PURE__ */ pref(
  'removeAdsHeld',
  (v: unknown): v is boolean => typeof v === 'boolean',
  false,
);

/** What Your data shows before StoreKit has answered: "thank you" if it was held, or a wait. */
export const firstView = (hint: Pref<boolean>): PurchaseView => ({
  offer: hint.read() ? { kind: 'held' } : { kind: 'checking' },
  restore: 'idle',
});
