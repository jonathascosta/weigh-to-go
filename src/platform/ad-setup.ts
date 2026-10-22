/**
 * The app's own plugin (ios/App/App/AdSetupPlugin.swift), registered once for the ads and the
 * purchase, which both load it: Capacitor warns when a plugin is registered twice. Loaded only in
 * the app's build.
 */
import { registerPlugin } from '@capacitor/core';
import type { BuildAds } from '../ads/ads';

/** The consent choices Google's message saved on the phone, as the plugin reads them. */
export interface SavedChoices {
  readonly gdprApplies: number;
  readonly purposeConsents: string;
  readonly vendorConsents: string;
  /** Whether `IABTCF_TCString` or `IABTCF_PurposeConsents` is saved. */
  readonly tcf: boolean;
}

export interface AdSetupPlugin {
  build(): Promise<BuildAds>;
  consentChoices(): Promise<SavedChoices>;
  /** Whether this iPhone allows purchases (Screen Time can forbid them). */
  canMakePayments(): Promise<{ allowed: boolean }>;
}

export const AdSetup = registerPlugin<AdSetupPlugin>('AdSetup');
