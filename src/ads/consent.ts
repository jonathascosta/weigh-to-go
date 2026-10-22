/**
 * Google's consent message (UMP) before the Mobile Ads SDK starts (docs/sprint-4.md, story 1;
 * decision 64): the message shows where the law asks for consent, and the SDK may start only once
 * consent is given there, or where none is needed. A refusal means no ads at all, not Google's
 * "limited ads": the SDK is never started. Carried over from Arrows' `ads/consent.ts`, without its
 * App Tracking Transparency step: this app never asks to track (decision 5).
 */

/** What the consent flow needs of the AdMob plugin (`@capacitor-community/admob`). */
export interface ConsentApi {
  requestConsentInfo(): Promise<ConsentInfo>;
  showConsentForm(): Promise<ConsentInfo>;
  showPrivacyOptionsForm(): Promise<void>;
}

/** The plugin's `AdmobConsentInfo`. */
export interface ConsentInfo {
  /** `REQUIRED`, `NOT_REQUIRED`, `OBTAINED` or `UNKNOWN`. */
  readonly status: string;
  readonly isConsentFormAvailable?: boolean;
  readonly canRequestAds: boolean;
  /** `REQUIRED` where the person must be able to change their choices later (Privacy choices). */
  readonly privacyOptionsRequirementStatus: string;
}

/**
 * The choices Google's message saved on the phone, in the IAB's Transparency and Consent Framework
 * keys (`IABTCF_gdprApplies`, `IABTCF_PurposeConsents`, `IABTCF_VendorConsents`), read by the app's
 * own plugin (ios/App/App/AdSetupPlugin.swift).
 */
export interface ConsentChoices {
  /** Whether the GDPR applies where the person is; null when the message hasn't said. */
  readonly gdprApplies: boolean | null;
  /** One digit per purpose, "1" for consent; purpose 1 (storing on the device) first. */
  readonly purposeConsents: string;
  /** One digit per vendor id, "1" for consent; vendor 1 first. */
  readonly vendorConsents: string;
}

/** Google's id in the IAB's vendor list. */
export const GOOGLE_VENDOR_ID = 755;

/**
 * Whether the person refused where the law asks for consent: UMP lets ads be requested after a
 * refusal too ("limited ads"), so the saved choices say it. Consent means purpose 1 (storing and
 * reading on the device, which any ad request needs) and Google as a vendor.
 */
export function refused(choices: ConsentChoices): boolean {
  if (choices.gdprApplies !== true) return false;
  return (
    choices.purposeConsents.charAt(0) !== '1' || choices.vendorConsents.charAt(GOOGLE_VENDOR_ID - 1) !== '1'
  );
}

export type Decision = 'ads' | 'none';

/**
 * Asks Google whether a message is needed, shows it where it is, and decides whether ads may be
 * requested. It never starts the SDK: the caller does, only on `ads`.
 */
export class AdConsent {
  private readonly api: ConsentApi;
  private readonly choices: () => Promise<ConsentChoices>;
  private readonly onError: (error: unknown) => void;
  private privacyOptions = false;
  /** The last decision, kept for a check of the choices made offline. */
  private last: Decision = 'none';

  constructor(
    api: ConsentApi,
    choices: () => Promise<ConsentChoices>,
    onError: (error: unknown) => void = () => undefined,
  ) {
    this.api = api;
    this.choices = choices;
    this.onError = onError;
  }

  /**
   * Google's message where the law asks for it, then the decision. Rejects when Google can't be
   * asked (offline): no ads then, and the caller asks again later.
   */
  async decide(): Promise<Decision> {
    let info = await this.api.requestConsentInfo();
    if (info.status === 'REQUIRED' && info.isConsentFormAvailable === true) {
      try {
        info = await this.api.showConsentForm();
      } catch (error) {
        // What the check said stands: no ads if they needed this answer.
        this.onError(error);
      }
    }
    return this.conclude(info);
  }

  /** Whether Your data must offer Privacy choices (Google's `privacyOptionsRequirementStatus`). */
  get privacyOptionsRequired(): boolean {
    return this.privacyOptions;
  }

  /**
   * Google's form to change the choices, from Privacy choices in Your data; then the decision
   * again, which may now allow ads or take them back.
   */
  async changeChoices(): Promise<Decision> {
    try {
      await this.api.showPrivacyOptionsForm();
    } catch (error) {
      this.onError(error);
    }
    return this.decideQuietly();
  }

  /** The decision from what Google and the saved choices say now, with no message shown. */
  private async decideQuietly(): Promise<Decision> {
    try {
      return await this.conclude(await this.api.requestConsentInfo());
    } catch (error) {
      // Offline after the form: what it saved on the phone still says whether the person refused.
      this.onError(error);
      this.last = this.last === 'ads' && !refused(await this.choices()) ? 'ads' : 'none';
      return this.last;
    }
  }

  private async conclude(info: ConsentInfo): Promise<Decision> {
    this.privacyOptions = info.privacyOptionsRequirementStatus === 'REQUIRED';
    this.last = info.canRequestAds && !refused(await this.choices()) ? 'ads' : 'none';
    return this.last;
  }
}
