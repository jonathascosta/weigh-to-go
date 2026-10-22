/**
 * The language and the units, as rows of Your data's settings (design §7): each row says its value
 * as text under its label, and the native select lies over the whole row, transparent, so a tap
 * opens the phone's own picker and a long value wraps instead of being cut. Built by script, since
 * they do nothing without one, once; a change updates their text in place, so the control in use
 * stays put for keyboards and screen readers. Each has an "Automatic" choice, back to following the
 * browser.
 */
import { automatic, choose, onSettingsChange, settings, type Settings } from './i18n';
import { isLang, LANGS } from './i18n/locale';
import { en, LANG_NAMES, pt } from './i18n/messages';
import { chevron, h } from './ui/dom';
import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from './units';

const AUTO = 'auto';

const isWeightUnit = (v: string): v is WeightUnit => (WEIGHT_UNITS as readonly string[]).includes(v);
const isHeightUnit = (v: string): v is HeightUnit => (HEIGHT_UNITS as readonly string[]).includes(v);

function option(value: string, lang?: string): HTMLOptionElement {
  const element = h('option', { attrs: { value } });
  if (lang) element.lang = lang;
  return element;
}

/** A row with a select laid over it: the label, the value as text, and the chevron. */
export function selectRow(id: string): {
  row: HTMLDivElement;
  label: HTMLLabelElement;
  value: HTMLElement;
  select: HTMLSelectElement;
} {
  const label = h('label', { attrs: { for: id, id: `${id}-label` } });
  // The select says its value itself; the text is for the eye.
  const value = h('span', { class: 'row-sub', attrs: { 'aria-hidden': 'true' } });
  const select = h('select', { attrs: { id, 'aria-labelledby': `${id}-label` } });
  // The select comes first, so its focus ring can be drawn on the row's face after it (no :has()
  // on Safari 15.0 to 15.3).
  // The select is named by the label and says its value: the face is for the eye only, so the
  // label isn't read twice.
  const face = h(
    'span',
    { class: 'row-face', attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'grow' }, label, value),
    chevron(),
  );
  const row = h('div', { class: 'row row-select' }, select, face);
  return { row, label, value, select };
}

/** Puts the rows in `container` and keeps them current; returns the unmount. */
export function mountSettings(container: HTMLElement): () => void {
  const lang = selectRow('setting-lang');
  const langAuto = option(AUTO);
  // Language names in their own languages, so a reader finds theirs whatever the page is in.
  lang.select.append(langAuto, ...LANGS.map((l) => option(l, l)));
  lang.select.addEventListener('change', () => {
    const value = lang.select.value;
    if (value === AUTO) choose({ lang: null });
    else if (isLang(value)) choose({ lang: value });
  });

  const weight = selectRow('setting-weight');
  const weightAuto = option(AUTO);
  weight.select.append(weightAuto, ...WEIGHT_UNITS.map((u) => option(u)));
  weight.select.addEventListener('change', () => {
    const value = weight.select.value;
    if (value === AUTO) choose({ weightUnit: null });
    else if (isWeightUnit(value)) choose({ weightUnit: value });
  });

  // The height unit, moved here from the BMI card (design §7).
  const height = selectRow('setting-height');
  const heightAuto = option(AUTO);
  height.select.append(heightAuto, ...HEIGHT_UNITS.map((u) => option(u)));
  height.select.addEventListener('change', () => {
    const value = height.select.value;
    if (value === AUTO) choose({ heightUnit: null });
    else if (isHeightUnit(value)) choose({ heightUnit: value });
  });

  const chosenText = (select: HTMLSelectElement) => select.options[select.selectedIndex]?.textContent ?? '';

  const update = (s: Settings) => {
    const auto = automatic();
    const m = s.messages;
    // The language label in both languages, the page's first: a reader lost in the other finds it.
    const [first, second] = s.locale.lang === 'pt' ? (['pt', 'en'] as const) : (['en', 'pt'] as const);
    const part = (l: 'en' | 'pt') =>
      h('span', { attrs: { lang: l }, text: (l === 'pt' ? pt : en)['settings.language'] });
    lang.label.replaceChildren(part(first), ' · ', part(second));
    langAuto.textContent = `${m['settings.auto']} (${LANG_NAMES[auto.locale.lang]})`;
    for (const o of lang.select.options) if (isLang(o.value)) o.textContent = LANG_NAMES[o.value];
    lang.select.value = s.chosen.lang ?? AUTO;
    lang.value.textContent = chosenText(lang.select);

    weight.label.textContent = m['settings.weightUnit'];
    weightAuto.textContent = `${m['settings.auto']} (${m[`unit.${auto.weightUnit}`]})`;
    for (const o of weight.select.options) if (isWeightUnit(o.value)) o.textContent = m[`unit.${o.value}`];
    weight.select.value = s.chosen.weightUnit ?? AUTO;
    weight.value.textContent = chosenText(weight.select);

    height.label.textContent = m['settings.heightUnit'];
    heightAuto.textContent = `${m['settings.auto']} (${m[`unit.${auto.heightUnit}`]})`;
    for (const o of height.select.options) if (isHeightUnit(o.value)) o.textContent = m[`unit.${o.value}`];
    height.select.value = s.chosen.heightUnit ?? AUTO;
    height.value.textContent = chosenText(height.select);
  };

  update(settings());
  container.replaceChildren(lang.row, weight.row, height.row);
  const stop = onSettingsChange(update);
  return () => {
    stop();
    container.replaceChildren();
  };
}
