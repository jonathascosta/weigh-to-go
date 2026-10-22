/**
 * The AdMob plugin as src/ads sees it, recording each call in order, with its events sent by hand
 * (as the native side would send them).
 */
import type { AdsApi } from './ads';
import type { BannerRequest, Handle } from './banner';
import type { ConsentChoices, ConsentInfo } from './consent';

export const CONSENTED: ConsentChoices = {
  gdprApplies: true,
  purposeConsents: '1111111111',
  vendorConsents: `${'0'.repeat(754)}1`,
  tcf: true,
};

export const REFUSED: ConsentChoices = {
  gdprApplies: true,
  purposeConsents: '0000000000',
  vendorConsents: '0'.repeat(755),
  tcf: true,
};

export const NO_GDPR: ConsentChoices = {
  gdprApplies: false,
  purposeConsents: '',
  vendorConsents: '',
  tcf: false,
};

/** A US state message answered: GPP keys saved, no TCF ones. */
export const US_STATE: ConsentChoices = {
  gdprApplies: null,
  purposeConsents: '',
  vendorConsents: '',
  tcf: false,
};

export class FakeAdMob implements AdsApi {
  readonly calls: string[] = [];
  readonly banners: BannerRequest[] = [];
  info: ConsentInfo = {
    status: 'NOT_REQUIRED',
    isConsentFormAvailable: false,
    canRequestAds: true,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  };
  /** What the consent form leaves behind once the person has answered. */
  afterForm: Partial<ConsentInfo> = {};
  /** What the privacy options form leaves behind. */
  afterOptions: Partial<ConsentInfo> = {};
  failInfo = false;
  /** Privacy choices' form can't open (offline). */
  failOptions = false;
  /**
   * The native banner view, as the plugin keeps it: none; asked for and not yet arrived (no view,
   * so a remove or a hide finds nothing); or there, shown or hidden.
   */
  view: 'none' | 'loading' | 'shown' | 'hidden' = 'none';
  private readonly size = new Set<(height: number) => void>();
  private readonly loaded = new Set<() => void>();
  private readonly failed = new Set<() => void>();

  requestConsentInfo(): Promise<ConsentInfo> {
    this.calls.push('info');
    return this.failInfo ? Promise.reject(new Error('offline')) : Promise.resolve(this.info);
  }

  showConsentForm(): Promise<ConsentInfo> {
    this.calls.push('form');
    this.info = { ...this.info, ...this.afterForm };
    return Promise.resolve(this.info);
  }

  showPrivacyOptionsForm(): Promise<void> {
    this.calls.push('options');
    if (this.failOptions) return Promise.reject(new Error('Failed to show privacy options form'));
    this.info = { ...this.info, ...this.afterOptions };
    return Promise.resolve();
  }

  initialize(): Promise<void> {
    this.calls.push('start');
    return Promise.resolve();
  }

  showBanner(request: BannerRequest): Promise<void> {
    this.calls.push('show');
    this.banners.push(request);
    this.view = 'loading';
    return Promise.resolve();
  }

  hideBanner(): Promise<void> {
    this.calls.push('hide');
    if (this.view === 'shown') this.view = 'hidden';
    return Promise.resolve();
  }

  resumeBanner(): Promise<void> {
    this.calls.push('resume');
    if (this.view === 'none' || this.view === 'loading')
      return Promise.reject(new Error('AdMob: not find subView for resumeBanner'));
    this.view = 'shown';
    return Promise.resolve();
  }

  removeBanner(): Promise<void> {
    this.calls.push('remove');
    // A banner still loading has no view yet: the remove finds nothing, and it arrives anyway.
    if (this.view !== 'loading') this.view = 'none';
    return Promise.resolve();
  }

  onSize(listener: (height: number) => void): Promise<Handle> {
    return this.listen(this.size, listener);
  }

  onLoaded(listener: () => void): Promise<Handle> {
    return this.listen(this.loaded, listener);
  }

  onFailed(listener: () => void): Promise<Handle> {
    return this.listen(this.failed, listener);
  }

  /**
   * The native side: a banner loaded, at this height. A new one's view is added shown; a refresh
   * keeps the view as it was.
   */
  load(height = 50): void {
    if (this.view === 'loading') this.view = 'shown';
    for (const listener of this.loaded) listener();
    for (const listener of this.size) listener(height);
  }

  /** The native side: hiding reports a size of 0. */
  reportSize(height: number): void {
    for (const listener of this.size) listener(height);
  }

  /** The native side: no ad (no network, no fill); the plugin takes its view away. */
  fail(): void {
    this.view = 'none';
    for (const listener of this.size) listener(0);
    for (const listener of this.failed) listener();
  }

  /** How many listeners are still attached. */
  listeners(): number {
    return this.size.size + this.loaded.size + this.failed.size;
  }

  private listen<T>(set: Set<T>, listener: T): Promise<Handle> {
    set.add(listener);
    return Promise.resolve({
      remove: () => {
        set.delete(listener);
        return Promise.resolve();
      },
    });
  }
}
