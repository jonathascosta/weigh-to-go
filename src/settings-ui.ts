/**
 * The language and weight-unit switchers in the header. Built by script, since they do nothing
 * without one, once; a change updates their text in place, so the control in use stays put for
 * keyboards and screen readers. Each has an "Automatic" choice, back to following the browser.
 * The height unit is chosen with the height itself, in the profile.
 */
import { automatic, choose, onSettingsChange, settings, type Settings } from './i18n';
import { isLang, LANGS } from './i18n/locale';
import { en, LANG_NAMES, pt } from './i18n/messages';
import { WEIGHT_UNITS, type WeightUnit } from './units';

const AUTO = 'auto';

const isWeightUnit = (v: string): v is WeightUnit => (WEIGHT_UNITS as readonly string[]).includes(v);

function option(value: string, lang?: string): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  if (lang) element.lang = lang;
  return element;
}

function field(id: string): { wrapper: HTMLDivElement; label: HTMLLabelElement; select: HTMLSelectElement } {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting';
  const label = document.createElement('label');
  label.htmlFor = id;
  const select = document.createElement('select');
  select.id = id;
  wrapper.append(label, select);
  return { wrapper, label, select };
}

/** Puts the switchers in `container` and keeps them current; returns the unmount. */
export function mountSettings(container: HTMLElement): () => void {
  const lang = field('setting-lang');
  const langAuto = option(AUTO);
  // Language names in their own languages, so a reader finds theirs whatever the page is in.
  lang.select.append(langAuto, ...LANGS.map((l) => option(l, l)));
  lang.select.addEventListener('change', () => {
    const value = lang.select.value;
    if (value === AUTO) choose({ lang: null });
    else if (isLang(value)) choose({ lang: value });
  });

  const weight = field('setting-weight');
  const weightAuto = option(AUTO);
  weight.select.append(weightAuto, ...WEIGHT_UNITS.map((u) => option(u)));
  weight.select.addEventListener('change', () => {
    const value = weight.select.value;
    if (value === AUTO) choose({ weightUnit: null });
    else if (isWeightUnit(value)) choose({ weightUnit: value });
  });

  const update = (s: Settings) => {
    const auto = automatic();
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', s.messages['settings.label']);

    // The language label in both languages, the page's first: a reader lost in the other finds it.
    const [first, second] = s.locale.lang === 'pt' ? (['pt', 'en'] as const) : (['en', 'pt'] as const);
    const part = (l: 'en' | 'pt') => {
      const span = document.createElement('span');
      span.lang = l;
      span.textContent = (l === 'pt' ? pt : en)['settings.language'];
      return span;
    };
    lang.label.replaceChildren(part(first), ' · ', part(second));
    langAuto.textContent = `${s.messages['settings.auto']} (${LANG_NAMES[auto.locale.lang]})`;
    for (const o of lang.select.options) if (isLang(o.value)) o.textContent = LANG_NAMES[o.value];
    lang.select.value = s.chosen.lang ?? AUTO;

    weight.label.textContent = s.messages['settings.weightUnit'];
    weightAuto.textContent = `${s.messages['settings.auto']} (${s.messages[`unit.${auto.weightUnit}`]})`;
    for (const o of weight.select.options)
      if (isWeightUnit(o.value)) o.textContent = s.messages[`unit.${o.value}`];
    weight.select.value = s.chosen.weightUnit ?? AUTO;
  };

  update(settings());
  container.replaceChildren(lang.wrapper, weight.wrapper);
  const stop = onSettingsChange(update);
  return () => {
    stop();
    container.replaceChildren();
  };
}
