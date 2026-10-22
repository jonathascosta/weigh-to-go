/**
 * The band the page keeps under the status bar for the iPhone app's banner (design §8): `--ad-h`
 * on `<html>`, which `.ad-space`, the sheets, the skip link and `scroll-padding-top` add. The
 * banner is a fixed 320 × 50, so the band is 50 px from the moment a banner is asked for, never
 * from its arrival a second or two later; and the app remembers whether the band was up, so the
 * next launch starts with it before the diary shows (decision 125). No AdMob code here: `main.ts`
 * reads it at once in the app's build.
 */
import { pref } from '../data/prefs';

/** The custom property on `<html>` that holds the band's height, 0 without a banner. */
export const AD_HEIGHT = '--ad-h';

/** The height of the `BANNER` size, in points (CSS px in the web view). */
export const BANNER_HEIGHT = 50;

/** Whether the band was up when the app was last used, kept with the screen preferences. */
export const bandPref = /* @__PURE__ */ pref(
  'adBand',
  (v: unknown): v is boolean => typeof v === 'boolean',
  false,
);

/** Sets the band's height now. */
export function setBand(doc: Document, px: number): void {
  doc.documentElement.style.setProperty(AD_HEIGHT, `${String(Math.max(0, Math.ceil(px)))}px`);
}

/** At launch, before the diary shows: the band as the app last left it. */
export function restoreBand(doc: Document): void {
  if (bandPref.read()) setBand(doc, BANNER_HEIGHT);
}
