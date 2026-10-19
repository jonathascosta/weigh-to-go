import { describe, expect, it } from 'vitest';
import { dateOrder, dayMonthOrder, homeTag, pickLocale } from './locale';

describe('pickLocale', () => {
  it("takes the browser's first language we have, with its region", () => {
    expect(pickLocale(['pt-BR', 'en-US'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['fr-FR', 'en-GB', 'pt-PT'], null)).toEqual({ lang: 'en', tag: 'en-GB' });
    expect(pickLocale(['pt_PT'], null)).toEqual({ lang: 'pt', tag: 'pt-PT' });
  });

  it('prefers a tag with a region, and keeps only language and region', () => {
    expect(pickLocale(['pt', 'pt-PT'], null)).toEqual({ lang: 'pt', tag: 'pt-PT' });
    expect(pickLocale(['en-u-ca-islamic'], null)).toEqual({ lang: 'en', tag: 'en-US' });
    expect(pickLocale(['en-GB-u-nu-arab'], null)).toEqual({ lang: 'en', tag: 'en-GB' });
    expect(pickLocale(['en-Latn'], null)).toEqual({ lang: 'en', tag: 'en-US' });
  });

  it('falls back to English, and to the default region for a bare language', () => {
    expect(pickLocale([], null)).toEqual({ lang: 'en', tag: 'en-US' });
    expect(pickLocale(['pt'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['not a tag', 'pt-BR'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
  });

  it('writes dates as at home when reading in another language', () => {
    // Intl has no en-BR: an English that writes day first stands in.
    expect(pickLocale(['pt-BR'], 'en')).toEqual({ lang: 'en', tag: 'en-GB' });
    expect(pickLocale(['de-DE'], null)).toEqual({ lang: 'en', tag: 'en-DE' });
    expect(pickLocale(['fr-FR'], null)).toEqual({ lang: 'en', tag: 'en-FR' });
    expect(pickLocale(['ja-JP'], null)).toEqual({ lang: 'en', tag: 'en-JP' });
    expect(pickLocale(['ko-KR'], 'en')).toEqual({ lang: 'en', tag: 'en-CA' });
    expect(pickLocale(['en-US'], 'pt')).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['en-GB', 'pt-PT'], 'pt')).toEqual({ lang: 'pt', tag: 'pt-PT' });
  });

  it("puts the page's own language before the browser's, and the reader's choice before both", () => {
    expect(pickLocale(['en-US'], null, 'pt')).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['en-US'], 'en', 'pt')).toEqual({ lang: 'en', tag: 'en-US' });
  });
});

describe('date orders and home', () => {
  it('reads the order a locale writes dates in', () => {
    expect(dateOrder('en-US')).toBe('mdy');
    expect(dateOrder('en-GB')).toBe('dmy');
    expect(dateOrder('pt-BR')).toBe('dmy');
    expect(dateOrder('en-CA')).toBe('ymd');
    expect(dateOrder('ja')).toBe('ymd');
  });

  it('reads the order of a day and month alone, for pasted dates', () => {
    expect(dayMonthOrder('en-US')).toBe('mdy');
    expect(dayMonthOrder('pt-BR')).toBe('dmy');
    expect(dayMonthOrder('en-CA')).toBe('mdy');
    expect(dayMonthOrder('sv')).toBe('dmy');
  });

  it("finds home in the browser's first usable tag", () => {
    expect(homeTag(['bad tag', 'fr-FR', 'en-US'])).toBe('fr-FR');
    expect(homeTag(['en-GB-u-ca-buddhist'])).toBe('en-GB');
    expect(homeTag([])).toBe('en-US');
  });
});
