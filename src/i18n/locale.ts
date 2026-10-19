/**
 * The language and the locale. The language picks the dictionary (English or Portuguese); the
 * locale, a tag such as en-GB or pt-PT, shapes numbers and dates. Where the reader is (the
 * browser's first language, whatever it is) decides the region: a reader in Brazil who reads in
 * English gets day/month dates, as at home.
 */
import { regionOf } from '../units';

export const LANGS = ['en', 'pt'] as const;
export type Lang = (typeof LANGS)[number];

/** The order a locale writes a full date in. */
export type DateOrder = 'dmy' | 'mdy' | 'ymd';
/** The order of a day and month written alone (19/10 or 10/19). */
export type DayMonthOrder = 'dmy' | 'mdy';

export interface Locale {
  readonly lang: Lang;
  /** A BCP 47 tag for `Intl`: a language and, when known, a region; nothing else. */
  readonly tag: string;
}

/** The tag for a language when nothing tells the region. */
const DEFAULT_TAG: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR' };

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/**
 * A browser tag cut down to its language and region ("en-u-ca-islamic" is "en", "pt_PT" is
 * "pt-PT"), so no calendar, numbering system or script the reader didn't pick here slips into
 * the formats; null if `Intl` doesn't take it.
 */
function plain(tag: string): { language: string; region: string | null } | null {
  try {
    const locale = new Intl.Locale(tag.replace(/_/g, '-'));
    return { language: locale.language, region: locale.region ?? null };
  } catch {
    return null;
  }
}

const join = (language: string, region: string | null): string =>
  region === null ? language : `${language}-${region}`;

/** Where the reader is: the browser's first tag, plain, whatever its language. */
export function homeTag(preferred: readonly string[]): string {
  for (const tag of preferred) {
    const p = plain(tag);
    if (p) return join(p.language, p.region);
  }
  return DEFAULT_TAG.en;
}

/** Whether `Intl` really has data for `tag` (it reports en-BR as supported, yet formats it as en). */
function known(tag: string): boolean {
  return new Intl.DateTimeFormat(tag).resolvedOptions().locale === tag;
}

/** Whether a locale writes the day first (19/10/2026), the month first, or the year first. */
export function dateOrder(tag: string): DateOrder {
  const types = new Intl.DateTimeFormat(tag, { timeZone: 'UTC' })
    .formatToParts(new Date(Date.UTC(2026, 9, 19)))
    .map((p) => p.type);
  const at = (type: Intl.DateTimeFormatPartTypes) => types.indexOf(type);
  if (at('year') < at('month')) return 'ymd';
  return at('day') < at('month') ? 'dmy' : 'mdy';
}

/**
 * The order a locale writes a day and month alone in (19/10 or 10/19), for reading pasted dates:
 * year-first locales still put one of the two first there (en-CA 10/19, sv 19/10).
 */
export function dayMonthOrder(tag: string): DayMonthOrder {
  const types = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', day: 'numeric', month: 'numeric' })
    .formatToParts(new Date(Date.UTC(2026, 9, 19)))
    .map((p) => p.type);
  return types.indexOf('day') < types.indexOf('month') ? 'dmy' : 'mdy';
}

/**
 * The locale for a reader. The language: the one they chose (`saved`); else the page's own
 * (`pageLang`, for a page written in one, which they came to); else the first of the browser's
 * languages (`preferred`, as `navigator.languages`) that we have; else English. The region: the
 * browser's own for that language if it names one; else where the reader is, when `Intl` knows
 * the language there; else a variant of the language that writes dates in the order of home.
 */
export function pickLocale(
  preferred: readonly string[],
  saved: Lang | null,
  pageLang: Lang | null = null,
): Locale {
  const tags = preferred.flatMap((tag) => plain(tag) ?? []);
  const lang = saved ?? pageLang ?? tags.map((t) => t.language).find(isLang) ?? 'en';

  const own = tags.find((t) => t.language === lang && t.region !== null);
  if (own) return { lang, tag: join(own.language, own.region) };

  const home = homeTag(preferred);
  const region = regionOf(home);
  if (tags.length > 0 && region !== null && known(join(lang, region)))
    return { lang, tag: join(lang, region) };
  if (lang === 'en' && tags.length > 0) {
    const order = dateOrder(home);
    return { lang, tag: order === 'dmy' ? 'en-GB' : order === 'ymd' ? 'en-CA' : 'en-US' };
  }
  return { lang, tag: DEFAULT_TAG[lang] };
}
