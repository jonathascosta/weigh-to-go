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
  /**
   * Whether the TCF is in use on the phone (`IABTCF_TCString` or `IABTCF_PurposeConsents` saved):
   * Google's GDPR message saves them; its US state messages save GPP keys instead.
   */
  readonly tcf: boolean;
}

/** Google's id in the IAB's vendor list. */
export const GOOGLE_VENDOR_ID = 755;

/**
 * Whether the person refused where the law asks for consent: UMP lets ads be requested after a
 * refusal too ("limited ads"), so the saved choices say it. Consent means purpose 1 (storing and
 * reading on the device, which any ad request needs) and Google as a vendor. With the TCF in use
 * but no word on the GDPR, and a consent Google says was needed (`status` REQUIRED or OBTAINED),
 * the choices can't be read, and count as a refusal. Without the TCF (a US state message, whose
 * choices are GPP keys, or no message), nothing here is a refusal: Google's `canRequestAds` decides.
 */
export function refused(choices: ConsentChoices, status = 'NOT_REQUIRED'): boolean {
  if (choices.gdprApplies === null) return choices.tcf && (status === 'REQUIRED' || status === 'OBTAINED');
  if (!choices.gdprApplies) return false;
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
  /** Google's last consent status. */
  private status = 'UNKNOWN';

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
   * again, which may now allow ads or take them back. `opened` is false when the form couldn't
   * show (offline, most often).
   */
  async changeChoices(): Promise<{ decision: Decision; opened: boolean }> {
    let opened = true;
    try {
      await this.api.showPrivacyOptionsForm();
    } catch (error) {
      opened = false;
      this.onError(error);
    }
    return { decision: await this.decideQuietly(), opened };
  }

  /** The decision from what Google and the saved choices say now, with no message shown. */
  private async decideQuietly(): Promise<Decision> {
    try {
      return await this.conclude(await this.api.requestConsentInfo());
    } catch (error) {
      // Offline after the form: what it saved on the phone still says whether the person refused.
      this.onError(error);
      this.last = this.last === 'ads' && !refused(await this.choices(), this.status) ? 'ads' : 'none';
      return this.last;
    }
  }

  private async conclude(info: ConsentInfo): Promise<Decision> {
    this.privacyOptions = info.privacyOptionsRequirementStatus === 'REQUIRED';
    this.status = info.status;
    this.last = info.canRequestAds && !refused(await this.choices(), info.status) ? 'ads' : 'none';
    return this.last;
  }
}
