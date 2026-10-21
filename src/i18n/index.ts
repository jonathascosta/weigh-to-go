/**
 * The page's language and units: chosen by the reader (saved as preferences) or taken from the
 * page and the browser, applied to the page's own text, and announced when they change so what is
 * drawn can be drawn again.
 */
import { oneOf, pref, PREFS_PREFIX } from '../data/prefs';
import { defaultUnits, HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from '../units';
import { formatter, type Formatter } from './format';
import { homeTag, isLang, pickLocale, type Lang, type Locale } from './locale';
import { en, enApp, pt, ptApp, type MessageKey, type Messages } from './messages';

/** The dictionaries; the iPhone app's build lays its own wording over the website's. */
export const dictionaries = (inApp: boolean): Record<Lang, Messages> =>
  inApp ? { en: { ...en, ...enApp }, pt: { ...pt, ...ptApp } } : { en, pt };
const DICTIONARIES = dictionaries(import.meta.env.MODE === 'ios');

/** The reader's choices; null means "automatic": follow the page and the browser. */
export const langPref = pref('lang', (v: unknown): v is Lang | null => v === null || isLang(v), null);
export const weightUnitPref = pref('weightUnit', oneOf<WeightUnit | null>([...WEIGHT_UNITS, null]), null);
export const heightUnitPref = pref('heightUnit', oneOf<HeightUnit | null>([...HEIGHT_UNITS, null]), null);

export interface Choices {
  readonly lang: Lang | null;
  readonly weightUnit: WeightUnit | null;
  readonly heightUnit: HeightUnit | null;
}

export interface Settings {
  readonly locale: Locale;
  readonly weightUnit: WeightUnit;
  readonly heightUnit: HeightUnit;
  /** What the reader chose; null fields follow the page and the browser. */
  readonly chosen: Choices;
  readonly messages: Messages;
  readonly format: Formatter;
}

/** The settings from the reader's choices, the browser's languages and the page's own language. */
export function resolveSettings(
  preferred: readonly string[],
  chosen: Choices,
  pageLang: Lang | null = null,
): Settings {
  const locale = pickLocale(preferred, chosen.lang, pageLang);
  // Units follow where the reader is (the browser's first language), not the language they read
  // in: a reader in Brazil who switches to English still weighs in kg.
  const units = defaultUnits(homeTag(preferred));
  return {
    locale,
    weightUnit: chosen.weightUnit ?? units.weight,
    heightUnit: chosen.heightUnit ?? units.height,
    chosen,
    messages: DICTIONARIES[locale.lang],
    format: formatter(locale.tag),
  };
}

/** The browser's languages; some browsers leave `navigator.languages` empty or out. */
function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  const { languages, language } = navigator as { languages?: unknown; language?: unknown };
  if (Array.isArray(languages) && languages.length > 0)
    return languages.filter((l): l is string => typeof l === 'string');
  return typeof language === 'string' ? [language] : [];
}

const savedChoices = (): Choices => ({
  lang: langPref.read(),
  weightUnit: weightUnitPref.read(),
  heightUnit: heightUnitPref.read(),
});

interface State {
  /** The reader's choices, kept here too so they hold for the visit when storage is blocked. */
  readonly chosen: Choices;
  readonly pageLang: Lang | null;
  readonly settings: Settings;
}

let state: State | null = null;
const listeners = new Set<(settings: Settings) => void>();

function current(): State {
  if (state === null) {
    const chosen = savedChoices();
    state = { chosen, pageLang: null, settings: resolveSettings(browserLanguages(), chosen) };
  }
  return state;
}

function update(next: { chosen?: Choices }): Settings {
  const { chosen: before, pageLang } = current();
  const chosen = next.chosen ?? before;
  const settings = resolveSettings(browserLanguages(), chosen, pageLang);
  state = { chosen, pageLang, settings };
  for (const listener of listeners) {
    // One listener failing must not keep the others from hearing.
    try {
      listener(settings);
    } catch (error) {
      console.error(error);
    }
  }
  return settings;
}

/** The current settings, read from the preferences and the browser the first time. */
export const settings = (): Settings => current().settings;

/** What "automatic" gives now (the language and units the page and the browser pick). */
export function automatic(): Settings {
  const { pageLang } = current();
  return resolveSettings(browserLanguages(), { lang: null, weightUnit: null, heightUnit: null }, pageLang);
}

/** The message `key` in the current language. */
export const t = <K extends MessageKey>(key: K): Messages[K] => settings().messages[key];

/**
 * Sets the language the page itself is written in (a page made for one language), used when the
 * reader hasn't chosen one. Called before anything is shown, so it tells no one.
 */
export function setPageLang(pageLang: Lang | null): void {
  const { chosen } = current();
  state = { chosen, pageLang, settings: resolveSettings(browserLanguages(), chosen, pageLang) };
}

/** Saves the reader's choice (null: back to automatic) and tells everyone who listens. */
export function choose(choice: Partial<Choices>): Settings {
  if (choice.lang !== undefined) langPref.write(choice.lang);
  if (choice.weightUnit !== undefined) weightUnitPref.write(choice.weightUnit);
  if (choice.heightUnit !== undefined) heightUnitPref.write(choice.heightUnit);
  return update({ chosen: { ...current().chosen, ...choice } });
}

/** Calls `listener` whenever the settings change; returns the unsubscribe. */
export function onSettingsChange(listener: (settings: Settings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Follows changes made elsewhere: a choice saved in another tab, or the browser's languages
 * changed in its settings. Returns the unsubscribe.
 */
export function watchSettings(target: Pick<Window, 'addEventListener' | 'removeEventListener'>): () => void {
  // Only the language and units: the charts' own preferences are followed by app/view.ts.
  const keys = new Set(['lang', 'weightUnit', 'heightUnit'].map((key) => PREFS_PREFIX + key));
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || keys.has(event.key)) update({ chosen: savedChoices() });
  };
  const onLanguages = () => {
    update({});
  };
  target.addEventListener('storage', onStorage);
  target.addEventListener('languagechange', onLanguages);
  return () => {
    target.removeEventListener('storage', onStorage);
    target.removeEventListener('languagechange', onLanguages);
  };
}

/** For tests: forget the settings, so the next read starts again. */
export function resetSettings(): void {
  state = null;
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

const isKey = (key: string | null, messages: Messages): key is MessageKey =>
  key !== null && Object.hasOwn(messages, key);

/**
 * Puts the page's own text in the reader's language: each element's `data-i18n` key becomes its
 * text, `data-i18n-content` its `content` attribute (the description and its og: copy), and
 * `<html lang>` follows, and so does the `href` of a link with `data-href-en` and `data-href-pt`.
 * Each page is written in one language, so without scripts it reads (and links) in that.
 */
export function translatePage(doc: TranslatableDocument, { locale, messages }: Settings = settings()): void {
  doc.documentElement.lang = locale.tag;
  // Only plain-text messages: a page's own text has no values to fill in.
  const text = (key: string | null): string | null => {
    const message = isKey(key, messages) ? messages[key] : null;
    return typeof message === 'string' ? message : null;
  };
  for (const element of doc.querySelectorAll('[data-i18n]')) {
    const value = text(element.getAttribute('data-i18n'));
    if (value !== null) element.textContent = value;
  }
  for (const element of doc.querySelectorAll('[data-i18n-content]')) {
    const value = text(element.getAttribute('data-i18n-content'));
    if (value !== null) element.setAttribute('content', value);
  }
  // A link with a page in each language (the privacy policy) goes to the one the reader reads.
  const hrefAttribute = `data-href-${locale.lang}`;
  for (const element of doc.querySelectorAll(`a[${hrefAttribute}]`)) {
    const href = element.getAttribute(hrefAttribute);
    if (href !== null && isSafeHref(href)) element.setAttribute('href', href);
  }
}

/**
 * An https: address, or a path on this site: no other scheme, no `//` (or `/\`, which browsers read
 * the same) that would lead to another host, and no spaces or control characters, which browsers
 * strip from an address (so " javascript:" would be a scheme after all).
 */
export const isSafeHref = (href: string): boolean =>
  href !== '' &&
  // eslint-disable-next-line no-control-regex -- control characters are what this looks for.
  !/[\u0000-\u0020\u007f]/.test(href) &&
  (/^https:\/\/[^/\\]/i.test(href) || (!/^[/\\]{2}/.test(href) && !/^[a-z][a-z\d+.-]*:/i.test(href)));

const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * Picks a form by `n`'s plural category ("1 weigh-in", "2 weigh-ins"). Pass the number as shown
 * (rounded), and the decimals it is shown with: "1.0 point" is plural in English, singular in
 * Portuguese ("1,0 ponto").
 */
export function plural(
  n: number,
  forms: { one: string; other: string },
  tag = settings().locale.tag,
  digits = 0,
): string {
  const key = `${tag}/${String(digits)}`;
  let rules = pluralRules.get(key);
  if (rules === undefined) {
    rules = new Intl.PluralRules(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    pluralRules.set(key, rules);
  }
  return rules.select(n) === 'one' ? forms.one : forms.other;
}

/**
 * A count with its word, in the current language and locale: "1 weigh-in", "1.204 pesagens"; with
 * `digits` decimals, "5.1 points".
 */
export function count(
  n: number,
  word: { one: string; other: string },
  s: Settings = settings(),
  digits = 0,
): string {
  return `${s.format.number(n, digits)} ${plural(n, word, s.locale.tag, digits)}`;
}
