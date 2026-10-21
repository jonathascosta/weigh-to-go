/** The native side of feel.ts: the haptic and Apple's rating prompt. Loaded only in the app's build. */
import { InAppReview } from '@capacitor-community/in-app-review';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const tap = (): Promise<void> => Haptics.impact({ style: ImpactStyle.Light });

/** iOS decides whether the prompt actually shows (at most three times a year). */
export const askForReview = (): Promise<void> => InAppReview.requestReview();
