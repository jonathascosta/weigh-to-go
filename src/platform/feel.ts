/**
 * The iPhone app's small touches after a weigh-in is saved (docs/sprint-3.md, story 6): a light tap
 * of the phone, and, now and then, Apple's own rating prompt. Nothing on the website; the native
 * part loads only in the app's build. Neither ever stops a save.
 */
import { pref } from '../data/prefs';

/** Weigh-ins in the diary before the rating prompt may show: a few days of use, not the first. */
export const REVIEW_AFTER = 7;

/** The minor version ("0.1") the prompt was last asked for, kept with the screen preferences. */
export const reviewAskedPref = pref(
  'reviewAsked',
  (v: unknown): v is string | null => v === null || typeof v === 'string',
  null,
);

/** "1.4" from "1.4.2": the prompt is asked at most once per minor version (Arrows' rule). */
export const minorOf = (version: string): string => version.split('.').slice(0, 2).join('.');

/** Whether to ask for a rating now: enough weigh-ins, and not yet in this minor version. */
export const shouldAskForReview = (asked: string | null, version: string, weighIns: number): boolean =>
  weighIns >= REVIEW_AFTER && asked !== minorOf(version);

/** After a weigh-in is saved: the tap, and the rating prompt when its time has come. */
export async function afterSave(weighIns: number): Promise<void> {
  if (import.meta.env.MODE !== 'ios') return;
  try {
    const native = await import('./feel-native');
    await native.tap();
    if (shouldAskForReview(reviewAskedPref.read(), __APP_VERSION__, weighIns)) {
      reviewAskedPref.write(minorOf(__APP_VERSION__));
      await native.askForReview();
    }
  } catch (error) {
    console.warn(error);
  }
}
