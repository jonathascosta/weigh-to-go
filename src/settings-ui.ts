/**
 * The language and unit switchers in the header. Built by script, since they do nothing without
 * one, and rebuilt in the new language when the settings change.
 */
import { choose, onSettingsChange, settings, type Settings } from './i18n';
import { isLang, LANGS } from './i18n/locale';
import { LANG_NAMES, type MessageKey } from './i18n/messages';
import { HEIGHT_UNITS, WEIGHT_UNITS, type HeightUnit, type WeightUnit } from './units';

interface Choice<T extends string> {
  readonly id: string;
  readonly label: MessageKey;
  readonly values: readonly T[];
  readonly text: (value: T, s: Settings) => string;
  readonly current: (s: Settings) => T;
  readonly pick: (value: T) => void;
}

const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (v: string): v is T =>
    (values as readonly string[]).includes(v);

const CHOICES = [
  {
    id: 'setting-lang',
    label: 'settings.language',
    values: LANGS,
    text: (lang) => LANG_NAMES[lang],
    current: (s) => s.locale.lang,
    pick: (lang) => {
      if (isLang(lang)) choose({ lang });
    },
  } satisfies Choice<(typeof LANGS)[number]>,
  {
    id: 'setting-weight',
    label: 'settings.weightUnit',
    values: WEIGHT_UNITS,
    text: (unit, s) => s.messages[`unit.${unit}`],
    current: (s) => s.weightUnit,
    pick: (weightUnit: WeightUnit) => choose({ weightUnit }),
  } satisfies Choice<WeightUnit>,
  {
    id: 'setting-height',
    label: 'settings.heightUnit',
    values: HEIGHT_UNITS,
    text: (unit, s) => s.messages[`unit.${unit}`],
    current: (s) => s.heightUnit,
    pick: (heightUnit: HeightUnit) => choose({ heightUnit }),
  } satisfies Choice<HeightUnit>,
];

function select<T extends string>(choice: Choice<T>, s: Settings): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'setting';
  const label = document.createElement('label');
  label.htmlFor = choice.id;
  label.textContent = s.messages[choice.label];
  const input = document.createElement('select');
  input.id = choice.id;
  for (const value of choice.values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = choice.text(value, s);
    // The language names are in their own languages: say so to screen readers.
    if (choice.id === 'setting-lang') option.lang = value;
    option.selected = value === choice.current(s);
    input.append(option);
  }
  const valid = isOneOf(choice.values);
  input.addEventListener('change', () => {
    if (valid(input.value)) choice.pick(input.value);
  });
  wrapper.append(label, input);
  return wrapper;
}

/** Puts the switchers in `container`, and keeps them in the current language. */
export function mountSettings(container: HTMLElement): void {
  const render = (s: Settings) => {
    // Keep focus on the switcher just used, which is rebuilt.
    const focused = document.activeElement?.id;
    container.setAttribute('aria-label', s.messages['settings.label']);
    container.replaceChildren(...CHOICES.map((choice) => select(choice as Choice<string>, s)));
    if (focused) document.getElementById(focused)?.focus();
  };
  render(settings());
  onSettingsChange(render);
}
