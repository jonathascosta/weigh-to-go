import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { PREFS_PREFIX } from '../data/prefs';
import {
  automatic,
  choose,
  count,
  isSafeHref,
  onSettingsChange,
  plural,
  resetSettings,
  resolveSettings,
  setPageLang,
  settings,
  t,
  translatePage,
  watchSettings,
  type TranslatableElement,
} from '.';

const none = { lang: null, weightUnit: null, heightUnit: null };

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

  it("follow the page's own language when the reader hasn't chosen", () => {
    vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' });
    setPageLang('pt');
    expect(settings().locale).toEqual({ lang: 'pt', tag: 'pt-BR' });
    choose({ lang: 'en' });
    expect(settings().locale.lang).toBe('en');
  });

  it('cope with a browser that gives no languages list', () => {
    vi.stubGlobal('navigator', { language: 'pt-PT' });
    expect(settings().locale).toEqual({ lang: 'pt', tag: 'pt-PT' });
    resetSettings();
    vi.stubGlobal('navigator', {});
    expect(settings().locale).toEqual({ lang: 'en', tag: 'en-US' });
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

  it('go back to automatic', () => {
    choose({ lang: 'en', weightUnit: 'lb' });
    choose({ lang: null, weightUnit: null });
    expect(settings()).toMatchObject({ locale: { lang: 'pt' }, weightUnit: 'kg', chosen: none });
    resetSettings();
    expect(settings().chosen).toEqual(none);
    expect(automatic()).toMatchObject({ locale: { lang: 'pt' }, weightUnit: 'kg' });
  });

  it('keep telling the other listeners when one fails', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let heard = 0;
    onSettingsChange(() => {
      throw new Error('broken');
    });
    onSettingsChange(() => heard++);
    choose({ lang: 'en' });
    expect(heard).toBe(1);
    expect(error).toHaveBeenCalledOnce();
  });

  it('hold a choice for the visit when storage is missing or throws', () => {
    vi.stubGlobal('localStorage', undefined);
    choose({ lang: 'en' });
    expect(settings().locale.lang).toBe('en');
    resetSettings();
    const throwing = fakeStorage();
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    throwing.getItem = blocked;
    throwing.setItem = blocked;
    vi.stubGlobal('localStorage', throwing);
    choose({ heightUnit: 'ftin' });
    expect(settings()).toMatchObject({ locale: { lang: 'pt' }, heightUnit: 'ftin' });
  });

  it('follow a choice made in another tab, and the browser changing its languages', () => {
    const target = new EventTarget();
    const stop = watchSettings(target);
    const heard: string[] = [];
    onSettingsChange((s) => heard.push(s.locale.tag));
    settings();
    localStorage.setItem(`${PREFS_PREFIX}lang`, '"en"');
    target.dispatchEvent(Object.assign(new Event('storage'), { key: `${PREFS_PREFIX}lang` }));
    vi.stubGlobal('navigator', { languages: ['en-GB'], language: 'en-GB' });
    target.dispatchEvent(new Event('languagechange'));
    target.dispatchEvent(Object.assign(new Event('storage'), { key: 'other-app' }));
    // A chart preference is the dashboard's to follow, not a change of settings.
    target.dispatchEvent(Object.assign(new Event('storage'), { key: `${PREFS_PREFIX}pct.blocks` }));
    expect(heard).toEqual(['en-US', 'en-GB']);
    stop();
    target.dispatchEvent(new Event('languagechange'));
    expect(heard).toHaveLength(2);
  });
});

describe('count with decimals', () => {
  it('agrees with the number as shown', () => {
    const en = resolveSettings(['en-US'], none);
    const pt = resolveSettings(['pt-BR'], none);
    const point = { one: 'point', other: 'points' };
    const ponto = { one: 'ponto', other: 'pontos' };
    expect(count(1, point, en, 1)).toBe('1.0 points');
    expect(count(1, point, en)).toBe('1 point');
    expect(count(1, ponto, pt, 1)).toBe('1,0 ponto');
    expect(count(5.06, ponto, pt, 1)).toBe('5,1 pontos');
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

  it("puts the text, the description and the page language in the reader's language", () => {
    const heading = element({ 'data-i18n': 'home.heading' }, 'Your weight diary, on your device');
    const unknown = element({ 'data-i18n': 'no.such.key' }, 'kept');
    const inherited = element({ 'data-i18n': 'toString' }, 'kept too');
    const description = element({ 'data-i18n-content': 'page.home.description', content: 'English' });
    const doc = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) =>
        selector === '[data-i18n]'
          ? [heading, unknown, inherited]
          : selector === '[data-i18n-content]'
            ? [description]
            : [],
    };
    translatePage(doc);
    expect(doc.documentElement.lang).toBe('pt-BR');
    expect(heading.textContent).toBe('Seu diário de peso, no seu aparelho');
    expect(unknown.textContent).toBe('kept');
    expect(inherited.textContent).toBe('kept too');
    expect(description.getAttribute('content')).toMatch(/^Registre suas pesagens/);
  });

  it("points a link with a page in each language to the reader's", () => {
    const link = element({
      href: 'privacy.html',
      'data-href-en': 'privacy.html',
      'data-href-pt': 'pt/privacidade.html',
    });
    const asked: string[] = [];
    const doc = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) => {
        asked.push(selector);
        return selector.startsWith('a[data-href-') ? [link] : [];
      },
    };
    translatePage(doc);
    expect(link.getAttribute('href')).toBe('pt/privacidade.html');
    translatePage(doc, resolveSettings(['en-US'], none));
    expect(link.getAttribute('href')).toBe('privacy.html');
    expect(asked.filter((s) => s.includes('data-href-'))).toEqual(['a[data-href-pt]', 'a[data-href-en]']);
  });

  it('keeps the href when the language has no address, or an empty or unsafe one', () => {
    const links = [
      element({ href: 'privacy.html', 'data-href-en': 'privacy.html' }),
      element({ href: 'privacy.html', 'data-href-pt': '' }),
      element({ href: 'privacy.html', 'data-href-pt': 'javascript:alert(1)' }),
      element({ href: 'privacy.html', 'data-href-pt': ' javascript:alert(1)' }),
      element({ href: 'privacy.html', 'data-href-pt': '//example.com/' }),
    ];
    const doc = {
      documentElement: { lang: 'en' },
      querySelectorAll: (selector: string) =>
        selector === 'a[data-href-pt]' ? links.filter((l) => l.getAttribute('data-href-pt') !== null) : [],
    };
    translatePage(doc);
    for (const link of links) expect(link.getAttribute('href')).toBe('privacy.html');
  });
});

describe('isSafeHref', () => {
  it('takes https: addresses and paths on this site, nothing else', () => {
    for (const href of [
      'https://www.jonathas.net/x',
      'privacy.html',
      '../privacy.html',
      '/pt/privacidade.html',
      './',
      'pt/privacidade.html',
      '#contact',
    ])
      expect(isSafeHref(href), href).toBe(true);
    for (const href of [
      '',
      'http://example.com/',
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'java\tscript:alert(1)',
      'data:text/html,x',
      '//example.com/',
      '/\\example.com/',
      'https:///example.com',
    ])
      expect(isSafeHref(href), href).toBe(false);
  });
});

describe('plural', () => {
  it("picks the form by the language's rules", () => {
    const forms = { one: 'pesagem', other: 'pesagens' };
    expect(plural(1, forms, 'pt-BR')).toBe('pesagem');
    expect(plural(0, forms, 'pt-BR')).toBe('pesagem');
    expect(plural(0, forms, 'pt-PT')).toBe('pesagens');
    expect(plural(0, { one: 'weigh-in', other: 'weigh-ins' }, 'en-US')).toBe('weigh-ins');
    expect(plural(2, forms)).toBe('pesagens');
  });
});
