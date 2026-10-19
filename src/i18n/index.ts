/**
 * The page's language and units: chosen by the reader (saved as preferences) or taken from the
 * browser, applied to the page's own text, and announced when they change so what is drawn can be
 * drawn again.
 */
import { oneOf, pref } from '../data/prefs';
import { defaultUnits, HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from '../units';
import { formatter, type Formatter } from './format';
import { homeTag, isLang, pickLocale, type Lang, type Locale } from './locale';
import { en, pt, type MessageKey, type Messages } from './messages';

const DICTIONARIES: Record<Lang, Messages> = { en, pt };

/** The reader's choices; null means "not chosen": follow the browser. */
export const langPref = pref('lang', (v: unknown): v is Lang | null => v === null || isLang(v), null);
export const weightUnitPref = pref('weightUnit', oneOf<WeightUnit | null>([...WEIGHT_UNITS, null]), null);
export const heightUnitPref = pref('heightUnit', oneOf<HeightUnit | null>([...HEIGHT_UNITS, null]), null);

export interface Settings {
  readonly locale: Locale;
  readonly weightUnit: WeightUnit;
  readonly heightUnit: HeightUnit;
  readonly messages: Messages;
  readonly format: Formatter;
}

/** The settings from the saved choices and the browser's languages. */
export function resolveSettings(
  preferred: readonly string[],
  saved: { lang: Lang | null; weightUnit: WeightUnit | null; heightUnit: HeightUnit | null },
): Settings {
  const locale = pickLocale(preferred, saved.lang);
  // Units follow where the reader is (the browser's own locale), not the language they read in: a
  // reader in Brazil who switches to English still weighs in kg.
  const units = defaultUnits(homeTag(preferred));
  return {
    locale,
    weightUnit: saved.weightUnit ?? units.weight,
    heightUnit: saved.heightUnit ?? units.height,
    messages: DICTIONARIES[locale.lang],
    format: formatter(locale.tag),
  };
}

const browserLanguages = (): readonly string[] =>
  typeof navigator === 'undefined'
    ? []
    : navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

type Choices = Parameters<typeof resolveSettings>[1];

/** The reader's choices, kept here too so they hold for the visit when storage is blocked. */
let chosen: Choices | null = null;
let current: Settings | null = null;
const listeners = new Set<(settings: Settings) => void>();

/** The current settings, read from the preferences and the browser the first time. */
export function settings(): Settings {
  chosen ??= { lang: langPref.read(), weightUnit: weightUnitPref.read(), heightUnit: heightUnitPref.read() };
  current ??= resolveSettings(browserLanguages(), chosen);
  return current;
}

/** The message `key` in the current language. */
export const t = <K extends MessageKey>(key: K): Messages[K] => settings().messages[key];

/** Saves the reader's choice and tells everyone who listens. */
export function choose(
  choice: Partial<{ lang: Lang; weightUnit: WeightUnit; heightUnit: HeightUnit }>,
): Settings {
  settings();
  chosen = { ...(chosen as Choices), ...choice };
  if (choice.lang !== undefined) langPref.write(choice.lang);
  if (choice.weightUnit !== undefined) weightUnitPref.write(choice.weightUnit);
  if (choice.heightUnit !== undefined) heightUnitPref.write(choice.heightUnit);
  current = resolveSettings(browserLanguages(), chosen);
  for (const listener of listeners) listener(current);
  return current;
}

/** Calls `listener` whenever the settings change; returns the unsubscribe. */
export function onSettingsChange(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** For tests: forget the settings, so the next read starts again. */
export function resetSettings(): void {
  chosen = null;
  current = null;
  listeners.clear();
}

/** The parts of a page `translatePage` touches, so tests can pass a stand-in for `document`. */
export interface TranslatableElement {
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}
export interface TranslatableDocument {
  readonly documentElement: { lang: string };
  querySelectorAll(selector: string): Iterable<TranslatableElement>;
}

const isKey = (key: string | null, messages: Messages): key is MessageKey => key !== null && key in messages;

/**
 * Puts the page's own text in the reader's language: each element's `data-i18n` key becomes its
 * text, `data-i18n-content` its `content` attribute (the description), and `<html lang>` follows.
 * The page is written in English, so without scripts it reads in English.
 */
export function translatePage(doc: TranslatableDocument, { locale, messages }: Settings = settings()): void {
  doc.documentElement.lang = locale.tag;
  for (const element of doc.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (isKey(key, messages)) element.textContent = messages[key];
  }
  for (const element of doc.querySelectorAll('[data-i18n-content]')) {
    const key = element.getAttribute('data-i18n-content');
    if (isKey(key, messages)) element.setAttribute('content', messages[key]);
  }
}

/** Picks a form by `n`'s plural category in the current language ("1 weigh-in", "2 weigh-ins"). */
export function plural(
  n: number,
  forms: { one: string; other: string },
  tag = settings().locale.tag,
): string {
  return new Intl.PluralRules(tag).select(n) === 'one' ? forms.one : forms.other;
}
