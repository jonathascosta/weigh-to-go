import { describe, expect, it } from 'vitest';
import { dateOrder, homeTag, pickLocale, regionOf } from './locale';

describe('pickLocale', () => {
  it("takes the browser's first language we have, with its region", () => {
    expect(pickLocale(['pt-BR', 'en-US'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['fr-FR', 'en-GB', 'pt-PT'], null)).toEqual({ lang: 'en', tag: 'en-GB' });
    expect(pickLocale(['pt_PT'], null)).toEqual({ lang: 'pt', tag: 'pt-PT' });
  });

  it('falls back to English, and to a default region for a bare language', () => {
    expect(pickLocale(['fr-FR', 'de'], null)).toEqual({ lang: 'en', tag: 'en-US' });
    expect(pickLocale([], null)).toEqual({ lang: 'en', tag: 'en-US' });
    expect(pickLocale(['pt'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
    expect(pickLocale(['not a tag', 'pt-BR'], null)).toEqual({ lang: 'pt', tag: 'pt-BR' });
  });

  it("follows the reader's choice, keeping the browser's region when it has one", () => {
    expect(pickLocale(['en-GB', 'pt-PT'], 'pt')).toEqual({ lang: 'pt', tag: 'pt-PT' });
    expect(pickLocale(['pt-BR'], 'en')).toEqual({ lang: 'en', tag: 'en-US' });
  });
});

describe('dateOrder and regionOf', () => {
  it('reads the order and region from the locale', () => {
    expect(dateOrder('en-US')).toBe('mdy');
    expect(dateOrder('en-GB')).toBe('dmy');
    expect(dateOrder('pt-BR')).toBe('dmy');
    expect(regionOf('en-US')).toBe('US');
    expect(regionOf('pt')).toBe('BR');
    expect(homeTag(['bad tag', 'fr-FR', 'en-US'])).toBe('fr-FR');
    expect(homeTag([])).toBe('en-US');
  });
});
