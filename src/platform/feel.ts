/**
 * The iPhone app's small touches after a weigh-in is saved (docs/sprint-3.md, story 6): a light tap
 * of the phone, and, now and then, Apple's own rating prompt. Nothing on the website; the native
 * part loads only in the app's build. Neither ever stops a save.
 */
import { pref } from '../data/prefs';

/** Days on which the person saved a weigh-in here before the rating prompt may show. */
export const REVIEW_AFTER = 7;
/** A moment after the save, so the "Saved" line and the tap land first. */
const REVIEW_DELAY_MS = 1500;

/** The minor version ("0.1") the prompt was last asked for, kept with the screen preferences. */
export const reviewAskedPref = pref(
  'reviewAsked',
  (v: unknown): v is string | null => v === null || typeof v === 'string',
  null,
);

/**
 * The local days on which a weigh-in was typed and saved here (at most `REVIEW_AFTER` of them): use
 * of the app, not data brought in by Apple Health, a backup or a paste.
 */
export const savedDaysPref = pref(
  'savedDays',
  (v: unknown): v is string[] => Array.isArray(v) && v.every((d) => typeof d === 'string'),
  [],
);

/** "1.4" from "1.4.2": the prompt is asked at most once per minor version (Arrows' rule). */
export const minorOf = (version: string): string => version.split('.').slice(0, 2).join('.');

/** The days of use with `today` added, newest last, no more than needed. */
export const withDay = (days: readonly string[], today: string): string[] =>
  [...days.filter((d) => d !== today), today].slice(-REVIEW_AFTER);

/** Whether to ask for a rating now: enough days of use, and not yet in this minor version. */
export const shouldAskForReview = (asked: string | null, version: string, daysOfUse: number): boolean =>
  daysOfUse >= REVIEW_AFTER && asked !== minorOf(version);

const native = () => import('./feel-native');

/** After an import (a paste): the tap only. */
export async function afterImport(): Promise<void> {
  if (import.meta.env.MODE !== 'ios') return;
  try {
    await (await native()).tap();
  } catch (error) {
    console.warn(error);
  }
}

/** After a weigh-in typed and saved on `today`: the tap, and the rating prompt when its time has come. */
export async function afterSave(today: string): Promise<void> {
  if (import.meta.env.MODE !== 'ios') return;
  await afterImport();
  const days = withDay(savedDaysPref.read(), today);
  savedDaysPref.write(days);
  if (!shouldAskForReview(reviewAskedPref.read(), __APP_VERSION__, days.length)) return;
  await new Promise((resolve) => setTimeout(resolve, REVIEW_DELAY_MS));
  try {
    await (await native()).askForReview();
    // Only once iOS was asked: a prompt that couldn't be asked is asked next time.
    reviewAskedPref.write(minorOf(__APP_VERSION__));
  } catch (error) {
    console.warn(error);
  }
}
