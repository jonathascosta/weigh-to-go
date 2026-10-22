/**
 * Body composition (estimates), the analysis card of docs/ux/body-composition.md: what the formulas
 * of analysis/body.ts say at each weigh-in, from the height, the year of birth and the sex. Closed,
 * one line with body fat and BMR; open, a chart of one estimate over time with the formula's error
 * as a band, the honesty line, the four estimates with their start and their error, About the
 * formulas, and Change details (the three inputs in one sheet). Also the year of birth's editor,
 * behind Your data's Year of birth row. The texts come from pure functions (tested).
 */
import { extent } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, line } from 'd3-shape';
import type { Analysis, Day } from '../analysis/analyze';
import {
  ageOn,
  availableMetrics,
  birthYearRange,
  ERRORS,
  errorRange,
  estimatesAt,
  METRICS,
  readBirthYear,
  type BodyInputs,
  type Metric,
} from '../analysis/body';
import { DAY, localToday, parseDay } from '../analysis/dates';
import type { App, State } from '../app/app';
import { bodyMetric } from '../app/view';
import { SEXES, type Profile, type Sex } from '../data/records';
import { settings, type Settings } from '../i18n';
import { fromKg } from '../units';
import type { Disclosure } from './card';
import { chips, h, rich, s as svg, say } from './dom';
import {
  capHeight,
  createPlot,
  leftFor,
  nearDay,
  plotGroups,
  readoutDay,
  timeAxis,
  yGrid,
  type TipRow,
} from './plot';
import { readHeight, saveProfile, unitField, type ProfileEditor } from './profile';
import { optionsPanel, type Layout } from './sheet';
import { sentenceDay, staleTo } from './summary';

const NBSP = ' ';

/** The year of `today` (YYYY-MM-DD), for the year of birth's bounds and the age shown. */
const yearOf = (today: string): number => Number(today.slice(0, 4));

// ---------- Numbers ----------

/**
 * An estimate in words, rounded to what the formulas can say (§2): whole %, whole kg or lb, whole
 * litres, the nearest 10 kcal. `bare` is the number alone (a range's low end), `short` with its unit
 * (the strip, the summary, the axis), `row` as the figures say it ("1,830 kcal a day").
 */
export function estimateText(
  metric: Metric,
  value: number,
  s: Settings,
  form: 'bare' | 'short' | 'row',
): string {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  switch (metric) {
    case 'fat':
      return form === 'bare' ? f.number(value, 0) : f.percent(value / 100, 0);
    case 'lean':
      return form === 'bare'
        ? f.weightValue(value, unit, 0)
        : `${f.weightValue(value, unit, 0)}${NBSP}${unit}`;
    case 'water':
      return form === 'bare' ? f.number(value, 0) : m['body.litres'](f.number(value, 0));
    case 'bmr': {
      const n = f.number(Math.round(value / 10) * 10, 0);
      return form === 'bare' ? n : form === 'short' ? m['body.kcal'](n) : m['body.kcalDay'](n);
    }
  }
}

/** The estimate's usual range in words: "range 28–37%". */
export function rangeText(metric: Metric, value: number, s: Settings): string {
  const { lo, hi } = errorRange(metric, value);
  return s.messages['body.range'](estimateText(metric, lo, s, 'bare'), estimateText(metric, hi, s, 'short'));
}

/** Lean mass's error, in the reader's weight unit: "5 kg", "11 lb". */
const leanError = (s: Settings): string =>
  `${s.format.weightValue(ERRORS.lean, s.weightUnit, 0)}${NBSP}${s.weightUnit}`;

/** Each estimate's formula and error: "Deurenberg formula, about ±4–5 points". */
export function errorText(metric: Metric, s: Settings): string {
  const m = s.messages;
  return metric === 'lean' ? m['body.err.lean'](leanError(s)) : m[`body.err.${metric}`];
}

// ---------- The texts ----------

/**
 * The card's line (§2): what it needs, or the last weigh-in's lean mass (and water) when only the
 * year of birth is missing, or its body fat and BMR; on its day when the diary is weeks old.
 */
export function bodySummary(state: State, s: Settings, today: string = localToday()): string {
  const m = s.messages;
  const { analysis, profile } = state;
  if (!analysis) return m['card.needsFirst'];
  const shown = availableMetrics(profile);
  const { last } = analysis;
  const e = estimatesAt(last.kg, last.date, profile);
  if (shown.length === 0 || e.lean === null) return m['body.sumNeeds'];
  const stale = staleTo(analysis, today);
  const on = stale === null ? null : sentenceDay(stale, s, parseDay(today));
  if (e.fat !== null && e.bmr !== null)
    return m['body.sum'](estimateText('fat', e.fat, s, 'short'), estimateText('bmr', e.bmr, s, 'short'), on);
  return m['body.sumLean'](
    estimateText('lean', e.lean, s, 'short'),
    e.water === null ? null : estimateText('water', e.water, s, 'short'),
    on,
  );
}

export interface BodyRow {
  readonly metric: Metric;
  readonly name: string;
  /** The value now, or null when it can't be worked out. */
  readonly value: string | null;
  /** The lines under it: the share of the weight (water), the start, the formula and its error. */
  readonly subs: readonly string[];
}

/** The four estimates' rows (§2): the last weigh-in's, against the first's. */
export function bodyRows(analysis: Analysis, profile: BodyInputs, s: Settings): BodyRow[] {
  const m = s.messages;
  const { first, last } = analysis;
  const now = estimatesAt(last.kg, last.date, profile);
  const then = estimatesAt(first.kg, first.date, profile);
  return METRICS.map((metric): BodyRow => {
    const name = m[`body.${metric}`];
    const value = now[metric];
    if (value === null) return { metric, name, value: null, subs: [m['body.needsYear']] };
    const subs: string[] = [];
    if (metric === 'water') subs.push(m['body.waterShare'](s.format.percent(value / last.kg, 0)));
    const start = then[metric];
    if (start !== null) {
      const text = estimateText(metric, start, s, 'short');
      subs.push(
        first === last || text === estimateText(metric, value, s, 'short')
          ? m['body.sameAsStart']
          : m['body.atStart'](text),
      );
    }
    subs.push(errorText(metric, s));
    return { metric, name, value: estimateText(metric, value, s, 'row'), subs };
  });
}

/** The estimates that can show in the chart, and the one chosen (body fat unless another was). */
export function chartMetric(profile: BodyInputs, chosen: Metric): { shown: Metric[]; metric: Metric | null } {
  const shown = availableMetrics(profile);
  return { shown, metric: shown.includes(chosen) ? chosen : (shown[0] ?? null) };
}

// ---------- The editors ----------

/** The year of birth's field with its help, and its status line, by id. */
function yearField(prefix: string) {
  const id = `${prefix}birth-year`;
  const input = h('input', {
    attrs: {
      id,
      class: 'year-input',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'bday-year',
      maxlength: 4,
      spellcheck: 'false',
      'aria-describedby': `${id}-help`,
    },
  });
  const label = h('label', { attrs: { for: id } });
  const help = h('p', { class: 'field-help', attrs: { id: `${id}-help` } });
  return {
    input,
    label,
    help,
    element: h('div', { class: 'field' }, label, input, help),
    /** Marks the field refused, its message in `status` read with it; or clears that. */
    invalid: (status: HTMLElement | null) => {
      if (status) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', `${id}-help ${status.id}`);
      } else {
        input.removeAttribute('aria-invalid');
        input.setAttribute('aria-describedby', `${id}-help`);
      }
    },
  };
}

/** The year as the field shows it: plain digits, never grouped ("1983"). */
const yearText = (year: number | null): string => (year === null ? '' : String(year));

/**
 * The year of birth's field and Save, behind Your data's Year of birth row: empty removes the year,
 * otherwise a year that makes an adult up to 100 this year (§1).
 */
export function birthYearEditor(app: App, prefix: string, labelledBy: string): ProfileEditor {
  const field = yearField(prefix);
  const save = h('button', { class: 'button', attrs: { type: 'submit' } });
  const status = h('p', { class: 'status', attrs: { role: 'status', id: `${prefix}birth-year-status` } });
  const form = h(
    'form',
    { class: 'entry-row', attrs: { novalidate: true, 'aria-labelledby': labelledBy } },
    field.element,
    save,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const s = settings();
    const m = s.messages;
    const thisYear = yearOf(localToday());
    const year = readBirthYear(field.input.value, thisYear);
    if (year === undefined) {
      const [lo, hi] = birthYearRange(thisYear);
      say(status, m['profile.birthYear.bad'](String(lo), String(hi)), 'bad');
      field.invalid(status);
      return;
    }
    field.invalid(null);
    void saveProfile(
      app,
      status,
      { birthYear: year },
      year === null ? m['profile.birthYear.removed'] : m['profile.birthYear.saved'](String(year)),
    );
  });
  let shown: number | null | undefined;
  return {
    element: h('div', { class: 'profile-editor' }, form, status),
    draw: (state, s) => {
      const m = s.messages;
      field.label.textContent = m['settings.birthYear'];
      field.help.textContent = m['profile.birthYear.help'];
      field.input.placeholder = m['entry.example']('1985');
      save.textContent = m['goal.save'];
      const year = state.profile.birthYear;
      // The field shows the saved year, unless the reader is typing in it.
      if (document.activeElement !== field.input && shown !== year) {
        field.input.value = yearText(year);
        shown = year;
      }
    },
  };
}

/** The sex's radio buttons, in the order the select has them: Female, Male, Leave out. */
const SEX_CHOICES: readonly (Sex | '')[] = [...SEXES, ''];

/**
 * Change details (§1): the height, the year of birth and the sex together, with one Save. Every
 * field is checked first; a refusal saves nothing and takes focus to the first field refused.
 */
export function detailsEditor(app: App, prefix: string, labelledBy: string): ProfileEditor {
  const cm = unitField(`${prefix}details-cm`);
  const feet = unitField(`${prefix}details-ft`);
  const inches = unitField(`${prefix}details-in`);
  const heightBox = h('div', { class: 'entry-row height-fields' });
  const year = yearField(`${prefix}details-`);
  const legend = h('legend');
  const sexHelpId = `${prefix}details-sex-help`;
  const sexHelp = h('p', { class: 'field-help', attrs: { id: sexHelpId } });
  const radios = SEX_CHOICES.map((value) => {
    const input = h('input', {
      attrs: {
        type: 'radio',
        name: `${prefix}details-sex`,
        value,
        id: `${prefix}details-sex-${value || 'none'}`,
      },
    });
    const text = h('span');
    return { value, input, text, element: h('label', { class: 'radio' }, input, text) };
  });
  const fieldset = h(
    'fieldset',
    { class: 'radios', attrs: { 'aria-describedby': sexHelpId } },
    legend,
    h('div', { class: 'radio-row' }, ...radios.map((r) => r.element)),
    sexHelp,
  );
  const save = h('button', { class: 'button', attrs: { type: 'submit' } });
  const status = h('p', { class: 'status', attrs: { role: 'status', id: `${prefix}details-status` } });
  const form = h(
    'form',
    { class: 'details-form', attrs: { novalidate: true, 'aria-labelledby': labelledBy } },
    heightBox,
    year.element,
    fieldset,
    h('div', {}, save),
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const s = settings();
    const m = s.messages;
    const height = readHeight(s.heightUnit, {
      cm: cm.input.value,
      feet: feet.input.value,
      inches: inches.input.value,
    });
    const thisYear = yearOf(localToday());
    const birthYear = readBirthYear(year.input.value, thisYear);
    for (const input of [cm.input, feet.input, inches.input]) input.removeAttribute('aria-invalid');
    year.invalid(null);
    if (height === undefined) {
      say(status, s.heightUnit === 'cm' ? m['bmi.badCm'] : m['bmi.badFtIn'], 'bad');
      const first = s.heightUnit === 'cm' ? cm.input : feet.input;
      first.setAttribute('aria-invalid', 'true');
      first.focus();
      return;
    }
    if (birthYear === undefined) {
      const [lo, hi] = birthYearRange(thisYear);
      say(status, m['profile.birthYear.bad'](String(lo), String(hi)), 'bad');
      year.invalid(status);
      year.input.focus();
      return;
    }
    const picked = radios.find((r) => r.input.checked)?.value ?? '';
    void saveProfile(
      app,
      status,
      { heightCm: height, birthYear, sex: picked === '' ? null : picked },
      m['profile.saved'],
    );
  });
  let shown: { profile: Profile; unit: string } | null = null;
  let builtFor = '';
  return {
    element: h('div', { class: 'profile-editor' }, form, status),
    draw: (state, s) => {
      const m = s.messages;
      const { format: f, heightUnit } = s;
      save.textContent = m['goal.save'];
      year.label.textContent = m['settings.birthYear'];
      year.help.textContent = m['profile.birthYear.help'];
      year.input.placeholder = m['entry.example']('1985');
      legend.textContent = m['settings.sex'];
      sexHelp.textContent = m['profile.sex.help'];
      for (const r of radios)
        r.text.textContent = r.value === '' ? m['profile.sex.leaveOut'] : m[`profile.sex.${r.value}`];
      if (builtFor !== `${s.locale.tag}|${heightUnit}`) {
        builtFor = `${s.locale.tag}|${heightUnit}`;
        cm.label.textContent = m['bmi.height'];
        cm.tag.textContent = m['unit.cm'];
        cm.input.placeholder = m['entry.example'](f.number(178, 0));
        feet.label.textContent = m['bmi.feet'];
        feet.tag.textContent = m['bmi.ftTag'];
        feet.input.placeholder = m['entry.example']('5');
        inches.label.textContent = m['bmi.inches'];
        inches.tag.textContent = m['bmi.inTag'];
        inches.input.placeholder = m['entry.example']('10');
        heightBox.replaceChildren(...(heightUnit === 'cm' ? [cm.element] : [feet.element, inches.element]));
        shown = null;
      }
      const { profile } = state;
      // The fields show what is saved, unless the reader is changing them.
      if (form.contains(document.activeElement)) return;
      if (shown?.profile === profile && shown.unit === heightUnit) return;
      shown = { profile, unit: heightUnit };
      const height = profile.heightCm;
      const tenths = height === null ? 0 : Math.round(height * 10);
      cm.input.value = height === null ? '' : f.number(tenths / 10, tenths % 10 === 0 ? 0 : 1);
      const inchesTotal = height === null ? null : Math.round((height / 2.54) * 2) / 2;
      const ft = inchesTotal === null ? null : Math.floor(inchesTotal / 12 + 1e-9);
      feet.input.value = ft === null ? '' : String(ft);
      inches.input.value =
        inchesTotal === null || ft === null
          ? ''
          : f.number(inchesTotal - ft * 12, (inchesTotal - ft * 12) % 1 === 0 ? 0 : 1);
      year.input.value = yearText(profile.birthYear);
      for (const r of radios) r.input.checked = r.value === (profile.sex ?? '');
    },
  };
}

// ---------- The card ----------

/** The y axis's step for an estimate, in the unit shown (§3): 5 points, kg, lb or litres; 100 kcal. */
const STEP: Record<Metric, number> = { fat: 5, lean: 5, water: 5, bmr: 100 };

interface Point {
  readonly day: Day;
  /** The estimate and its range, in the unit shown (lean mass in the reader's weight unit). */
  readonly v: number;
  readonly lo: number;
  readonly hi: number;
  /** The estimate as worked out (lean mass in kg), for its words. */
  readonly raw: number;
}

export function mountBody(
  card: Pick<Disclosure, 'body' | 'tools'>,
  app: App,
  layout: Layout,
): (state: State, s: Settings) => void {
  const redraw = () => {
    render(app.state(), settings());
  };
  const plot = createPlot(redraw);
  // The chart's name: a group named by the estimate and its formula (§3).
  const chartName = h('span', { class: 'visually-hidden', attrs: { id: 'body-chart-name' } });
  const legendLine = h('span');
  const legendBand = h('span');
  const legend = h(
    'p',
    { class: 'legend' },
    h(
      'span',
      { class: 'legend-item' },
      h('span', { class: 'swatch sw-est', attrs: { 'aria-hidden': 'true' } }),
      legendLine,
    ),
    h(
      'span',
      { class: 'legend-item' },
      h('span', { class: 'swatch sw-est-band', attrs: { 'aria-hidden': 'true' } }),
      legendBand,
    ),
  );
  const chipsBox = h('div', { class: 'body-chips' });
  const chartBlock = h('div', { class: 'body-chart' }, chartName, plot.element, plot.live, legend, chipsBox);
  const caveat = h('p', { class: 'body-caveat' });
  const rows = h('dl', { class: 'body-rows' });
  const cols = h('div', { class: 'body-cols' }, chartBlock, h('div', { class: 'body-side' }, caveat, rows));
  // About the formulas: closed on a phone, open on the one page (§2).
  const aboutText = h('span');
  const aboutButton = h(
    'button',
    {
      class: 'body-about-toggle',
      attrs: { type: 'button', id: 'body-about-toggle', 'aria-controls': 'body-about-panel' },
    },
    aboutText,
    (() => {
      const icon = svg('svg', {
        class: 'about-chev',
        viewBox: '0 0 24 24',
        'aria-hidden': 'true',
        focusable: 'false',
      });
      icon.append(svg('path', { d: 'M6 9l6 6 6-6' }));
      return icon;
    })(),
  );
  const aboutPanel = h('div', { class: 'body-about-panel', attrs: { id: 'body-about-panel' } });
  const about = h('div', { class: 'body-about' }, aboutButton, aboutPanel);
  const setAbout = (open: boolean) => {
    aboutButton.setAttribute('aria-expanded', String(open));
    aboutPanel.hidden = !open;
  };
  setAbout(layout.isWide());
  aboutButton.addEventListener('click', () => {
    setAbout(aboutButton.getAttribute('aria-expanded') !== 'true');
  });
  // The needs state: what the estimates use, and each input's state.
  const needsText = h('p', { class: 'note' });
  const needsList = h('ul', { class: 'body-needs' });
  const needs = h('div', { class: 'body-needs-box' }, needsText, needsList);
  const empty = h('p', { class: 'note' });
  // Change details: the three inputs in a sheet on a phone, in place on the one page (§1).
  const editor = detailsEditor(app, '', 'body-title');
  const change = optionsPanel('body-change', layout, false);
  change.panel.classList.add('options-card');
  change.content.replaceChildren(editor.element);
  const changeText = h('span');
  change.button.replaceChildren(changeText);
  card.tools.classList.add('body-tools');
  card.tools.replaceChildren(change.button);

  let builtChips = '';
  let syncChips: () => void = () => undefined;

  const drawChart = (analysis: Analysis, profile: BodyInputs, metric: Metric, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const shownValue = (v: number) => (metric === 'lean' ? fromKg(v, unit) : v);
    const points: Point[] = [];
    for (const day of analysis.series) {
      const raw = estimatesAt(day.kg, day.date, profile)[metric];
      if (raw === null) continue;
      const r = errorRange(metric, raw);
      points.push({ day, raw, v: shownValue(raw), lo: shownValue(r.lo), hi: shownValue(r.hi) });
    }
    const width = plot.width();
    const height = capHeight(width < 560 ? 240 : 300, plot.strip());
    const last = points[points.length - 1];
    const first = points[0];
    if (!last || !first) {
      plot.empty(m['body.needsYear'], height);
      return;
    }
    const [lo0 = 0, hi0 = 1] = extent(points.flatMap((p) => [p.lo, p.hi]));
    let step = STEP[metric];
    const domain = () =>
      [
        Math.floor(lo0 / step) * step,
        Math.max(Math.ceil(hi0 / step) * step, Math.floor(lo0 / step) * step + step),
      ] as const;
    let [yLo, yHi] = domain();
    while ((yHi - yLo) / step > 6) {
      step *= 2;
      [yLo, yHi] = domain();
    }
    const ticks: number[] = [];
    for (let v = yLo; v <= yHi + 1e-9; v += step) ticks.push(v);
    const tick = (v: number) =>
      metric === 'fat'
        ? f.percent(v / 100, 0)
        : metric === 'lean'
          ? `${f.number(v, 0)}${NBSP}${unit}`
          : metric === 'water'
            ? m['body.litres'](f.number(v, 0))
            : m['body.kcal'](f.number(v, 0));
    const top = 10;
    const bottom = height - 30;
    const y = scaleLinear([yLo, yHi], [bottom, top]);
    const left = leftFor(ticks.map(tick));
    const right = 14;
    const x = scaleUtc(
      [new Date(first.day.t.getTime() - DAY / 2), new Date(last.day.t.getTime() + DAY / 2)],
      [left, width - right],
    );
    const root = plot.root({
      width,
      height,
      labelledBy: 'body-chart-name',
      descId: 'body-desc',
      roleDescription: m['chart.roleDescription'],
      desc: `${m['body.aria'](
        f.day(first.day.date, 'medium'),
        f.day(last.day.date, 'medium'),
        estimateText(metric, last.raw, s, 'short'),
        rangeText(metric, last.raw, s),
      )} ${m['chart.keys']}`,
    });
    const grid = svg('g');
    yGrid(grid, y, ticks, tick, { left, right: width - right });
    timeAxis(grid, x, f, { left, right: width - right, bottom, height });
    root.append(grid);
    const { g } = plotGroups(root, 'body-clip', { left, right: width - right, bottom });
    g.append(
      svg('path', {
        class: 'est-band',
        d:
          area<Point>()
            .x((p) => x(p.day.t))
            .y0((p) => y(p.lo))
            .y1((p) => y(p.hi))(points) ?? '',
      }),
      svg('path', {
        class: 'est-line',
        d:
          line<Point>()
            .x((p) => x(p.day.t))
            .y((p) => y(p.v))(points) ?? '',
      }),
      svg('circle', { class: 'est-dot', cx: x(last.day.t), cy: y(last.v), r: points.length === 1 ? 5 : 4.5 }),
    );
    // A single weigh-in: its error as a bar, as the built charts draw one point.
    if (points.length === 1)
      g.append(
        svg('line', {
          class: 'est-bar',
          x1: x(last.day.t),
          x2: x(last.day.t),
          y1: y(last.lo),
          y2: y(last.hi),
        }),
      );
    const at = (i: number) => points[i] ?? last;
    const chip = m[`body.chip.${metric}`];
    const content = (i: number, heading: string) => {
      const p = at(i);
      const rows: TipRow[] = [
        { name: chip, value: estimateText(metric, p.raw, s, 'short'), swatch: 'sw-est' },
        { name: '', value: rangeText(metric, p.raw, s) },
        { name: m['tip.weight'], value: f.weight(p.day.kg, unit) },
      ];
      return { heading, rows };
    };
    plot.show(
      root,
      {
        top,
        bottom,
        area: { left, right: width - right },
        count: points.length,
        stop: (i) => {
          const p = at(i);
          return { x: x(p.day.t), y: y(p.v), key: p.day.t.getTime(), dot: 'hoverdot est-hoverdot' };
        },
        tip: (i) => content(i, f.day(at(i).day.date, 'long')),
        readout: (i) => {
          const p = at(i);
          const day = readoutDay(p.day.date, f);
          return content(i, p === last ? `${day} · ${m['chart.lastWeighIn']}` : day);
        },
        near: nearDay(
          x,
          points.map((p) => p.day.t),
        ),
        from: points.length - 1,
      },
      height,
    );
  };

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const { analysis, profile } = state;
    changeText.textContent = m['body.change'];
    change.words(m['body.change'], m['chart.done']);
    editor.draw(state, s);
    aboutText.textContent = m['body.about'];
    aboutPanel.replaceChildren(
      ...(['bmr', 'fat'] as const).map((k) => h('p', {}, ...rich(m[`body.about.${k}`]))),
      h('p', {}, ...rich(m['body.about.lean'](leanError(s)))),
      h('p', {}, ...rich(m['body.about.water'])),
      h('p', { text: m['body.about.left'] }),
      h('p', { text: m['body.about.adults'] }),
    );
    if (!analysis) {
      change.button.className = 'button button-ghost';
      empty.textContent = m['card.needsFirst'];
      card.body.replaceChildren(empty, change.panel, card.tools);
      return;
    }
    const { shown, metric } = chartMetric(profile, bodyMetric.get());
    if (metric === null || estimatesAt(analysis.last.kg, analysis.last.date, profile).lean === null) {
      // What the estimates need, each input with its state, and Change details as the way to them.
      change.button.className = 'button';
      needsText.textContent = m['body.needs'];
      const item = (name: string, value: string | null, unset: string) =>
        h(
          'li',
          {},
          h('span', { text: name }),
          h('span', value === null ? { class: 'unset', text: unset } : { text: value }),
        );
      const year = profile.birthYear;
      needsList.replaceChildren(
        item(
          m['settings.height'],
          profile.heightCm === null ? null : s.format.height(profile.heightCm, s.heightUnit),
          m['settings.notSet'],
        ),
        item(m['settings.birthYear'], year === null ? null : String(year), m['settings.birthYearNone']),
        item(
          m['settings.sex'],
          profile.sex === null ? null : m[`profile.sex.${profile.sex}`],
          m['profile.sex.leftOut'],
        ),
      );
      card.body.replaceChildren(needs, change.panel, card.tools);
      return;
    }
    change.button.className = 'button button-ghost';
    caveat.textContent = m['body.caveat'];
    chartName.textContent = m[`body.chart.${metric}`];
    legendLine.textContent = m['body.legend.line'];
    legendBand.textContent = m['body.legend.band'];
    // One chip per estimate the profile allows; none when there is only one (§2).
    const key = `${s.locale.tag}|${shown.join()}`;
    if (builtChips !== key) {
      builtChips = key;
      if (shown.length < 2) {
        chipsBox.replaceChildren();
        syncChips = () => undefined;
      } else {
        const group = chips(
          m['body.chips'],
          shown.map((k) => ({ value: k, label: m[`body.chip.${k}`] })),
          (k) => k === chartMetric(app.state().profile, bodyMetric.get()).metric,
          (k) => {
            bodyMetric.set(k);
            syncChips();
            redraw();
          },
        );
        for (const b of group.element.querySelectorAll('button')) b.classList.add('body-chip');
        chipsBox.replaceChildren(group.element);
        syncChips = group.sync;
      }
    }
    syncChips();
    rows.replaceChildren(
      ...bodyRows(analysis, profile, s).map((r) =>
        h(
          'div',
          { class: 'body-row' },
          h('dt', { text: r.name }),
          h('dd', { class: 'body-value' }, h('b', { text: r.value ?? '—' })),
          h(
            'dd',
            { class: 'body-subs' },
            ...r.subs.map((sub) => h('span', { class: 'rows-sub', text: sub })),
          ),
        ),
      ),
    );
    if (card.body.firstChild !== cols) card.body.replaceChildren(cols, about, change.panel, card.tools);
    drawChart(analysis, profile, metric, s);
  };

  return render;
}

/** The age shown beside the year of birth in Your data: "43 this year". */
export const ageThisYear = (birthYear: number, today: string = localToday()): number =>
  ageOn(today, birthYear);
