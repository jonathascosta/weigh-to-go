/**
 * The language and the locale. The language picks the dictionary (English or Portuguese); the
 * locale, a full tag such as en-GB or pt-PT, shapes numbers and dates, so a British reader gets
 * day/month dates in English and a Portuguese reader their own number style.
 */

import type { DateOrder } from '../data/paste';

export const LANGS = ['en', 'pt'] as const;
export type Lang = (typeof LANGS)[number];

export interface Locale {
  readonly lang: Lang;
  /** A BCP 47 tag for `Intl`. */
  readonly tag: string;
}

/** The tag for a language when the browser names no region for it. */
const DEFAULT_TAG: Record<Lang, string> = { en: 'en-US', pt: 'pt-BR' };

export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);

/** The language of a tag, if it's one of ours ("pt-BR" is pt, "EN" is en, "es" is none). */
function langOf(tag: string): Lang | null {
  const primary = tag.split(/[-_]/)[0]?.toLowerCase();
  return isLang(primary) ? primary : null;
}

/** The tag in canonical form, or null if `Intl` doesn't accept it. */
function canonical(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag.replace('_', '-'))[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * The locale for a reader: the language they chose (`saved`), or else the first of the browser's
 * languages (`preferred`, as `navigator.languages`) that we have, or else English. The region comes
 * from the browser's first tag in that language.
 */
export function pickLocale(preferred: readonly string[], saved: Lang | null): Locale {
  const tags = preferred.flatMap((tag) => canonical(tag) ?? []);
  const lang = saved ?? tags.map(langOf).find((l) => l !== null) ?? 'en';
  const tag = tags.find((t) => langOf(t) === lang);
  // A bare "pt" or "en" says nothing of the region: use the default one.
  return { lang, tag: tag === undefined || !tag.includes('-') ? DEFAULT_TAG[lang] : tag };
}

/**
 * Where the reader is, as the browser's first language tag, whatever the language (fr-FR for a
 * French browser, though the page falls back to English): units follow this, not the page language.
 */
export function homeTag(preferred: readonly string[]): string {
  return preferred.map(canonical).find((tag) => tag !== null) ?? DEFAULT_TAG.en;
}

/** Whether the locale writes the day before the month (19/10) or after (10/19). */
export function dateOrder(tag: string): DateOrder {
  const parts = new Intl.DateTimeFormat(tag, { timeZone: 'UTC' }).formatToParts(
    new Date(Date.UTC(2026, 9, 19)),
  );
  const day = parts.findIndex((p) => p.type === 'day');
  const month = parts.findIndex((p) => p.type === 'month');
  return day < month ? 'dmy' : 'mdy';
}

/** The region of a tag, upper case ("US" for en-US), or null. */
export function regionOf(tag: string): string | null {
  try {
    return new Intl.Locale(tag).maximize().region ?? null;
  } catch {
    return null;
  }
}
