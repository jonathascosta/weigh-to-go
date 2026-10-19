import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import {
  choose,
  onSettingsChange,
  plural,
  resetSettings,
  resolveSettings,
  settings,
  t,
  translatePage,
  type TranslatableElement,
} from '.';

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('navigator', { languages: ['pt-BR', 'en-US'], language: 'pt-BR' });
  vi.stubGlobal('localStorage', fakeStorage());
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

describe('resolveSettings', () => {
  it('takes the language and units from the browser unless chosen', () => {
    const none = { lang: null, weightUnit: null, heightUnit: null };
    expect(resolveSettings(['en-US'], none)).toMatchObject({ weightUnit: 'lb', heightUnit: 'ftin' });
    const chosen = resolveSettings(['en-US'], { lang: 'pt', weightUnit: 'kg', heightUnit: null });
    expect(chosen).toMatchObject({
      locale: { lang: 'pt', tag: 'pt-BR' },
      weightUnit: 'kg',
      heightUnit: 'ftin',
    });
    expect(chosen.format.weight(80, 'kg')).toBe('80,0 kg');
  });

  it('takes units from where the reader is, not the language they read in', () => {
    const none = { lang: null, weightUnit: null, heightUnit: null };
    expect(resolveSettings(['fr-FR'], none)).toMatchObject({ locale: { lang: 'en' }, weightUnit: 'kg' });
    expect(resolveSettings(['pt-BR', 'en-US'], { ...none, lang: 'en' })).toMatchObject({
      locale: { lang: 'en', tag: 'en-US' },
      weightUnit: 'kg',
      heightUnit: 'cm',
    });
  });
});

describe('settings', () => {
  it("start from the browser's language", () => {
    expect(settings().locale).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(t('settings.language')).toBe('Idioma');
  });

  it('save a choice, tell listeners, and keep it for the next visit', () => {
    const heard: string[] = [];
    onSettingsChange((s) => heard.push(`${s.locale.lang}/${s.weightUnit}`));
    choose({ lang: 'en' });
    choose({ weightUnit: 'lb' });
    expect(heard).toEqual(['en/kg', 'en/lb']);
    resetSettings();
    expect(settings()).toMatchObject({ locale: { lang: 'en' }, weightUnit: 'lb', heightUnit: 'cm' });
  });

  it('hold a choice for the visit when storage is blocked', () => {
    vi.stubGlobal('localStorage', undefined);
    choose({ lang: 'en' });
    choose({ heightUnit: 'ftin' });
    expect(settings()).toMatchObject({ locale: { lang: 'en' }, heightUnit: 'ftin' });
  });
});

describe('translatePage', () => {
  const element = (attrs: Record<string, string>, text = ''): TranslatableElement => ({
    textContent: text,
    getAttribute: (name) => attrs[name] ?? null,
    setAttribute: (name, value) => {
      attrs[name] = value;
    },
  });

  it('puts the text, the description and the page language in the reader’s language', () => {
    const heading = element({ 'data-i18n': 'home.heading' }, 'Your weight diary, on your device');
    const unknown = element({ 'data-i18n': 'no.such.key' }, 'kept');
    const description = element({ 'data-i18n-content': 'page.home.description', content: 'English' });
    const doc = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) =>
        selector === '[data-i18n]'
          ? [heading, unknown]
          : selector === '[data-i18n-content]'
            ? [description]
            : [],
    };
    translatePage(doc);
    expect(doc.documentElement.lang).toBe('pt-BR');
    expect(heading.textContent).toBe('Seu diário de peso, no seu aparelho');
    expect(unknown.textContent).toBe('kept');
    expect(description.getAttribute('content')).toMatch(/^Registre suas pesagens/);
  });
});

describe('plural', () => {
  it("picks the form by the language's rules", () => {
    const forms = { one: 'pesagem', other: 'pesagens' };
    expect(plural(1, forms, 'pt-BR')).toBe('pesagem');
    expect(plural(0, forms, 'pt-BR')).toBe('pesagem');
    expect(plural(0, { one: 'weigh-in', other: 'weigh-ins' }, 'en-US')).toBe('weigh-ins');
    expect(plural(2, forms)).toBe('pesagens');
  });
});
