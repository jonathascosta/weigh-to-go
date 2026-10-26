/**
 * The band the page keeps under the status bar for the iPhone app's banner (design §8): `--ad-h`
 * on `<html>`, which `.ad-space`, the sheets, the skip link and `scroll-padding-top` add. The
 * banner is Google's anchored adaptive banner (decision 179): the screen's full width, and a height
 * Google picks for that width, between 50 and 90 pt and at most 15% of the screen. The band takes a
 * height from the moment a banner is asked for, never from its arrival a second or two later: the
 * height the plugin last reported, kept with the screen preferences, or before any was reported an
 * estimate for this width, corrected when the banner arrives. The app also remembers the band at
 * launch, so the next launch starts with it before the diary shows (decision 125). No AdMob code
 * here: `main.ts` reads it at once in the app's build.
 */
import { pref, type Pref } from '../data/prefs';

/** The custom property on `<html>` that holds the band's height, 0 without a banner. */
export const AD_HEIGHT = '--ad-h';

/** The anchored adaptive banner's least and greatest heights, in points (CSS px in the web view). */
export const MIN_BANNER_HEIGHT = 50;
export const MAX_BANNER_HEIGHT = 90;
/** Its greatest share of the screen's height. */
const MAX_SHARE = 0.15;

/**
 * The banner's height for a screen `width` × `height` points before Google has said: about 50 pt
 * per 320 pt of width, as Google's anchored adaptive sizes run (50 at 320, about 67 at 430),
 * within their bounds (developers.google.com/admob/ios/banner/anchored-adaptive). An estimate
 * only: the plugin reports the real height once the banner arrives, and the band takes it.
 */
export function estimateBannerHeight(width: number, height: number): number {
  const cap = Math.min(MAX_BANNER_HEIGHT, Math.floor(height * MAX_SHARE));
  return Math.max(MIN_BANNER_HEIGHT, Math.min(cap, Math.round((width * 50) / 320)));
}

/** The estimate for the window `doc` shows, 50 pt where it has none. */
export function estimateFor(doc: Document): number {
  const win = doc.defaultView;
  return win ? estimateBannerHeight(win.innerWidth, win.innerHeight) : MIN_BANNER_HEIGHT;
}

const validHeight = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  (value === 0 || (value >= MIN_BANNER_HEIGHT && value <= MAX_BANNER_HEIGHT));

/**
 * The band's height when the app was last used, kept with the screen preferences: 0 for no band.
 * Before decision 179 it was only whether the band was up (a boolean): up then reads as the
 * estimate for this screen.
 */
const kept = /* @__PURE__ */ pref(
  'adBand',
  (v: unknown): v is boolean | number => typeof v === 'boolean' || validHeight(v),
  0,
);

export const bandPref: Pref<number> = {
  read: () => {
    const value = kept.read();
    if (value === true) return typeof document === 'undefined' ? MIN_BANNER_HEIGHT : estimateFor(document);
    return value === false ? 0 : value;
  },
  write: (height) => kept.write(validHeight(height) ? height : 0),
};

/** Sets the band's height now. */
export function setBand(doc: Document, px: number): void {
  doc.documentElement.style.setProperty(AD_HEIGHT, `${String(Math.max(0, Math.ceil(px)))}px`);
}

/** At launch, before the diary shows: the band as the app last left it. */
export function restoreBand(doc: Document): void {
  const height = bandPref.read();
  if (height > 0) setBand(doc, height);
}
