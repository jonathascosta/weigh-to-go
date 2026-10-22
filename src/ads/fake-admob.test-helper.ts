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
};

export const REFUSED: ConsentChoices = {
  gdprApplies: true,
  purposeConsents: '0000000000',
  vendorConsents: '0'.repeat(755),
};

export const NO_GDPR: ConsentChoices = { gdprApplies: false, purposeConsents: '', vendorConsents: '' };

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
    return Promise.resolve();
  }

  hideBanner(): Promise<void> {
    this.calls.push('hide');
    return Promise.resolve();
  }

  resumeBanner(): Promise<void> {
    this.calls.push('resume');
    return Promise.resolve();
  }

  removeBanner(): Promise<void> {
    this.calls.push('remove');
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

  /** The native side: a banner loaded, at this height. */
  load(height = 50): void {
    for (const listener of this.loaded) listener();
    for (const listener of this.size) listener(height);
  }

  /** The native side: hiding reports a size of 0. */
  reportSize(height: number): void {
    for (const listener of this.size) listener(height);
  }

  /** The native side: no ad (no network, no fill); the plugin takes its view away. */
  fail(): void {
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
