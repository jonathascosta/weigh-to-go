import { describe, expect, it } from 'vitest';
import { AdConsent, refused, type ConsentChoices } from './consent';
import { CONSENTED, FakeAdMob, NO_GDPR, REFUSED } from './fake-admob.test-helper';

const consentWith = (api: FakeAdMob, choices: ConsentChoices, errors: unknown[] = []) =>
  new AdConsent(
    api,
    () => Promise.resolve(choices),
    (error) => errors.push(error),
  );

describe('Google’s consent message', () => {
  it('shows where the law asks for it, and allows ads once consent is given', async () => {
    const api = new FakeAdMob();
    api.info = { ...api.info, status: 'REQUIRED', isConsentFormAvailable: true };
    api.afterForm = { status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' };
    const consent = consentWith(api, CONSENTED);
    expect(await consent.decide()).toBe('ads');
    expect(api.calls).toEqual(['info', 'form']);
    // Privacy choices shows where Google says the person must be able to change them.
    expect(consent.privacyOptionsRequired).toBe(true);
  });

  it('allows ads where none is needed, with no message and no Privacy choices', async () => {
    const api = new FakeAdMob();
    const consent = consentWith(api, NO_GDPR);
    expect(await consent.decide()).toBe('ads');
    expect(api.calls).toEqual(['info']);
    expect(consent.privacyOptionsRequired).toBe(false);
  });

  it('allows no ads on a refusal, though Google would serve limited ones (decision 64)', async () => {
    const api = new FakeAdMob();
    api.info = { ...api.info, status: 'REQUIRED', isConsentFormAvailable: true };
    // UMP's answer after a refusal: a choice was obtained, and ads could be requested.
    api.afterForm = { status: 'OBTAINED', canRequestAds: true, privacyOptionsRequirementStatus: 'REQUIRED' };
    const consent = consentWith(api, REFUSED);
    expect(await consent.decide()).toBe('none');
    // The person can still change their mind in Privacy choices.
    expect(consent.privacyOptionsRequired).toBe(true);
  });

  it('allows no ads while Google says none may be requested', async () => {
    const api = new FakeAdMob();
    api.info = { ...api.info, status: 'REQUIRED', isConsentFormAvailable: true };
    api.afterForm = { canRequestAds: false };
    expect(await consentWith(api, CONSENTED).decide()).toBe('none');
  });

  it('rejects when Google can’t be asked, so no ads are requested', async () => {
    const api = new FakeAdMob();
    api.failInfo = true;
    await expect(consentWith(api, CONSENTED).decide()).rejects.toThrow('offline');
  });

  it('changes its decision with Privacy choices, either way', async () => {
    const api = new FakeAdMob();
    api.info = {
      ...api.info,
      status: 'OBTAINED',
      privacyOptionsRequirementStatus: 'REQUIRED',
    };
    let choices = REFUSED;
    const consent = new AdConsent(api, () => Promise.resolve(choices));
    expect(await consent.decide()).toBe('none');
    choices = CONSENTED;
    expect(await consent.changeChoices()).toBe('ads');
    expect(api.calls).toEqual(['info', 'options', 'info']);
    choices = REFUSED;
    expect(await consent.changeChoices()).toBe('none');
  });

  it('keeps its decision after Privacy choices offline, unless the saved choices refuse', async () => {
    const api = new FakeAdMob();
    let choices = CONSENTED;
    const errors: unknown[] = [];
    const consent = new AdConsent(
      api,
      () => Promise.resolve(choices),
      (error) => errors.push(error),
    );
    expect(await consent.decide()).toBe('ads');
    api.failInfo = true;
    expect(await consent.changeChoices()).toBe('ads');
    choices = REFUSED;
    expect(await consent.changeChoices()).toBe('none');
    expect(errors).toHaveLength(2);
  });
});

describe('a refusal, in the choices saved on the phone', () => {
  it('needs consent to purpose 1 and to Google where the GDPR applies', () => {
    expect(refused(CONSENTED)).toBe(false);
    expect(refused(REFUSED)).toBe(true);
    expect(refused({ ...CONSENTED, purposeConsents: '0111111111' })).toBe(true);
    expect(refused({ ...CONSENTED, vendorConsents: '1'.repeat(754) })).toBe(true);
    expect(refused({ ...CONSENTED, vendorConsents: '' })).toBe(true);
    expect(refused({ ...REFUSED, gdprApplies: false })).toBe(false);
    expect(refused({ ...REFUSED, gdprApplies: null })).toBe(false);
  });
});
