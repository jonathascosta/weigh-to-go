/**
 * The goal and BMI cards: the profile's two inputs (a goal weight, a height), each read in the
 * reader's unit and saved with `app.setProfile`, and what they give: the plan to the goal at each
 * pace, and the BMI with its band and the weights of the round BMIs above it. The texts come from
 * pure functions (tested); the numbers from the analysis engine.
 */
import type { Analysis, Method } from '../analysis/analyze';
import { isoDay, localToday, parseDay } from '../analysis/dates';
import {
  BMI_BANDS,
  bmiSummary as bmiFigures,
  dateAfterLast,
  goalPlan,
  METHODS,
  type BmiBand,
} from '../analysis/goals';
import type { App, State } from '../app/app';
import { parseNumber, toKg } from '../data/paste';
import { isHeight } from '../data/records';
import { count, settings, type Settings } from '../i18n';
import { fromFeetInches, toFeetInches, type HeightUnit } from '../units';
import type { Disclosure } from './card';
import { h, say } from './dom';
import { failure } from './entry';
import { optionsPanel, type Layout } from './sheet';
import { sentenceDay, staleTo } from './summary';

// ---------- The goal ----------

export interface GoalPace {
  readonly name: string;
  /** When it gets there, how long and how fast; 'never' at a pace going the wrong way; else what it needs. */
  readonly value:
    { readonly day: string; readonly sub: string } | { readonly never: string } | { readonly needs: string };
}

export type GoalView =
  | { readonly kind: 'none'; readonly text: string }
  | { readonly kind: 'reached'; readonly big: string; readonly text: string }
  | {
      readonly kind: 'plan';
      readonly big: string;
      readonly text: string;
      /** The way covered from the first weight, when the goal is below it. */
      readonly progress: {
        readonly share: number;
        readonly from: string;
        readonly covered: string;
        readonly to: string;
      } | null;
      readonly paces: readonly GoalPace[];
    };

/** What the goal card says: nothing to plan yet, the goal reached, or the plan at each pace. */
export function goalView(analysis: Analysis | null, goalKg: number | null, s: Settings): GoalView {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  if (goalKg === null) return { kind: 'none', text: m['goal.none'] };
  if (!analysis) return { kind: 'none', text: m['goal.noWeighIns'](f.weight(goalKg, unit)) };
  const plan = goalPlan(analysis, goalKg);
  if (!plan) return { kind: 'none', text: m['goal.none'] };
  // A goal not below the starting weight, and already met, isn't a goal reached: nothing was lost
  // to get there.
  if (plan.reached && goalKg >= analysis.first.kg)
    return {
      kind: 'none',
      text: m['goal.aboveStart'](f.weight(goalKg, unit), f.weight(analysis.first.kg, unit)),
    };
  if (plan.reached)
    return {
      kind: 'reached',
      big: f.weightValue(plan.below, unit),
      text: m['goal.reached'](m[`unit.${unit}`], f.weight(goalKg, unit)),
    };
  const fewRecent = analysis.recentIsFallback && analysis.models.recent !== null;
  const paces = METHODS.map((method: Method): GoalPace => {
    const name = m[`goal.pace.${method}`];
    const p = method === 'recent' && analysis.recentIsFallback ? null : plan.byMethod[method];
    if (!p)
      return {
        name,
        value: { needs: method === 'recent' && fewRecent ? m['pct.needsRecent'] : m['kpi.needsThree'] },
      };
    if (p.days === null) return { name, value: { never: m['goal.never'] } };
    return {
      name,
      value: {
        day: f.day(isoDay(dateAfterLast(analysis, p.days)), 'medium'),
        sub: m['goal.paceSub'](count(p.days, m['word.day'], s), f.weight(p.kgPerWeek, unit, 2)),
      },
    };
  });
  return {
    kind: 'plan',
    big: f.weightValue(plan.remaining, unit),
    text: m['goal.toGo'](m[`unit.${unit}`], f.weight(goalKg, unit)),
    progress:
      plan.progress === null
        ? null
        : {
            share: plan.progress,
            from: f.weight(analysis.first.kg, unit),
            covered: m['goal.covered'](f.percent(plan.progress, 0)),
            to: f.weight(goalKg, unit),
          },
    paces,
  };
}

// ---------- BMI ----------

/** The scale the BMI bar spans: from the top of "underweight" to 45. */
export const BMI_SCALE = [18.5, 45] as const;

export interface BmiView {
  readonly big: string;
  readonly band: BmiBand;
  readonly bandName: string;
  /** Where the current BMI sits on the scale, 0 to 1. */
  readonly at: number;
  readonly rows: readonly { readonly name: string; readonly value: string; readonly sub: string }[];
}

/** What the BMI card shows for a height, or null without a BMI to work out. */
export function bmiView(analysis: Analysis, heightCm: number, s: Settings): BmiView | null {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const b = bmiFigures(analysis, heightCm);
  if (!b) return null;
  const [lo, hi] = BMI_SCALE;
  return {
    big: f.number(b.now, 1),
    band: b.band,
    bandName: m[`bmi.band.${b.band}`],
    at: Math.max(0, Math.min(1, (b.now - lo) / (hi - lo))),
    rows: [
      {
        name: m['bmi.start'],
        value: f.number(b.start, 1),
        sub: b.reduced > 0 ? m['bmi.reduced'](count(b.reduced, m['word.point'], s, 1)) : m['bmi.notReduced'],
      },
      ...b.targets.map((t) => ({
        name: m['bmi.target'](f.number(t.bmi, 0)),
        value: f.weight(t.kg, unit),
        sub: m['bmi.toGo'](f.weight(t.remaining, unit)),
      })),
    ],
  };
}

/**
 * The BMI card's line (design §5): the BMI now and how far it moved since the start; or that it
 * needs a height, or a weigh-in.
 */
export function bmiSummary(state: State, s: Settings, today: string = localToday()): string {
  const m = s.messages;
  const { format: f } = s;
  const height = state.profile.heightCm;
  if (height === null) return m['bmi.sumNone'];
  const b = state.analysis ? bmiFigures(state.analysis, height) : null;
  if (!b) return m['card.needsFirst'];
  const now = f.number(b.now, 1);
  const diff = b.start - b.now;
  const shown = f.number(Math.abs(diff), 1);
  // A change too small to show is no change.
  const way = shown === f.number(0, 1) ? 'same' : diff > 0 ? 'lower' : 'higher';
  // "now" only while the last weigh-in is recent; else its day.
  const stale = state.analysis ? staleTo(state.analysis, today) : null;
  return m['bmi.sum'](now, shown, way, stale === null ? null : sentenceDay(stale, s, parseDay(today)));
}

/** The bands the BMI bar draws, as shares of the scale, from the top of "underweight". */
export function bmiSegments(): { band: BmiBand; width: number }[] {
  const [lo, hi] = BMI_SCALE;
  const out: { band: BmiBand; width: number }[] = [];
  let from: number = lo;
  for (const b of BMI_BANDS) {
    const to = Math.min(b.below, hi);
    if (to <= from) continue;
    out.push({ band: b.band, width: (to - from) / (hi - lo) });
    from = to;
  }
  return out;
}

/**
 * A height as typed: in cm, or feet and inches (a comma or a point for decimals). Returns the height
 * in cm, null when every field is empty (no height), or undefined when it isn't a height.
 */
export function readHeight(
  unit: HeightUnit,
  fields: { readonly cm: string; readonly feet: string; readonly inches: string },
): number | null | undefined {
  if (unit === 'cm') {
    if (fields.cm.trim() === '') return null;
    const cm = parseNumber(fields.cm);
    return isHeight(cm) ? cm : undefined;
  }
  if (fields.feet.trim() === '' && fields.inches.trim() === '') return null;
  const feet = fields.feet.trim() === '' ? 0 : parseNumber(fields.feet);
  const inches = fields.inches.trim() === '' ? 0 : parseNumber(fields.inches);
  if (!Number.isInteger(feet) || !(inches < 12)) return undefined;
  const cm = fromFeetInches(feet, inches);
  return isHeight(cm) ? cm : undefined;
}

// ---------- Mounting ----------

/** A labelled text field with its unit next to it. */
export function unitField(id: string): {
  input: HTMLInputElement;
  label: HTMLLabelElement;
  tag: HTMLSpanElement;
  element: HTMLDivElement;
} {
  const input = h('input', {
    attrs: { id, type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false' },
  });
  const label = h('label', { attrs: { for: id } });
  const tag = h('span', { class: 'unit-tag', attrs: { id: `${id}-unit` } });
  input.setAttribute('aria-describedby', `${id}-unit`);
  return {
    input,
    label,
    tag,
    element: h('div', { class: 'field' }, label, h('span', { class: 'with-unit' }, input, tag)),
  };
}

/** Saves the profile with the fields given changed, saying how it went in `status`. */
export async function saveProfile(
  app: App,
  status: HTMLElement,
  change: Partial<State['profile']>,
  done: string,
): Promise<boolean> {
  try {
    // Only this field: a save of the other one moments before must not be undone.
    await app.updateProfile(change);
    say(status, done, 'ok');
    return true;
  } catch (error) {
    console.error(error);
    say(status, failure(error, app, settings()), 'bad');
    return false;
  }
}

/** A profile field's editor: its form and status, drawn with the diary. */
export interface ProfileEditor {
  readonly element: HTMLElement;
  readonly draw: (state: State, s: Settings) => void;
}

/**
 * The goal's field and Save, behind Change goal on the Goal card and the Goal row of Your data's
 * settings: `prefix` keeps each one's ids apart, `labelledBy` names its form.
 */
export function goalEditor(app: App, prefix: string, labelledBy: string): ProfileEditor {
  const field = unitField(`${prefix}goal-weight`);
  const save = h('button', { class: 'button', attrs: { type: 'submit' } });
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  const form = h(
    'form',
    { class: 'entry-row', attrs: { novalidate: true, 'aria-labelledby': labelledBy } },
    field.element,
    save,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const s = settings();
    const text = field.input.value.trim();
    // An empty field removes the goal.
    if (text === '') {
      void saveProfile(app, status, { goalKg: null }, s.messages['goal.removed']);
      return;
    }
    const kg = toKg(text, s.weightUnit);
    if (kg === null) {
      say(status, s.messages['goal.bad'](s.messages[`unit.${s.weightUnit}`]), 'bad');
      return;
    }
    void saveProfile(
      app,
      status,
      { goalKg: kg },
      s.messages['goal.saved'](s.format.weight(kg, s.weightUnit)),
    );
  });
  let shown: { goal: number | null; unit: string } | null = null;
  return {
    element: h('div', { class: 'profile-editor' }, form, status),
    draw: (state, s) => {
      const m = s.messages;
      const { format: f, weightUnit: unit } = s;
      field.label.textContent = m['goal.label'];
      field.tag.textContent = m[`unit.${unit}`];
      field.input.placeholder = m['entry.example'](f.weightValue(90, unit));
      save.textContent = m['goal.save'];
      const goal = state.profile.goalKg;
      // The field shows the saved goal, unless the reader is typing in it.
      if (document.activeElement !== field.input && (shown?.goal !== goal || shown.unit !== unit)) {
        field.input.value = goal === null ? '' : f.weightValue(goal, unit);
        shown = { goal, unit };
      }
    },
  };
}

export function mountGoal(
  container: HTMLElement,
  app: App,
  layout: Layout,
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'goal-title' } });
  const editor = goalEditor(app, '', 'goal-title');
  const body = h('div', { class: 'profile-body' });
  // The goal's field is a change made now and then: behind Change, in a sheet on a phone, in
  // place on the one page (design §13, story 5).
  const change = optionsPanel('goal-change', layout);
  change.panel.classList.add('options-card');
  change.content.replaceChildren(editor.element);
  container.replaceChildren(
    h('div', { class: 'card-head card-head-row' }, title, change.button),
    change.panel,
    body,
  );

  return (state, s) => {
    const m = s.messages;
    title.textContent = m['goal.title'];
    change.words(m['goal.change'], m['chart.done']);
    change.label.textContent = m['goal.change'];
    editor.draw(state, s);
    const goal = state.profile.goalKg;
    const view = goalView(state.analysis, goal, s);
    if (view.kind === 'none') {
      body.replaceChildren(h('p', { class: 'note', text: view.text }));
      return;
    }
    const big = h('p', { class: 'big' }, view.big, ' ', h('span', { class: 'big-unit', text: view.text }));
    if (view.kind === 'reached') {
      body.replaceChildren(big);
      return;
    }
    const parts: Node[] = [big];
    if (view.progress) {
      const done = h('span', { class: 'scale-done' });
      done.style.width = `${String(view.progress.share * 100)}%`;
      parts.push(
        h(
          'div',
          {
            class: 'scale',
            attrs: {
              role: 'progressbar',
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.round(view.progress.share * 100),
              'aria-label': view.progress.covered,
            },
          },
          done,
        ),
        h(
          'div',
          { class: 'scale-labels' },
          h('span', { text: view.progress.from }),
          h('span', { text: view.progress.covered }),
          h('span', { text: view.progress.to }),
        ),
      );
    }
    parts.push(
      h(
        'dl',
        { class: 'rows' },
        ...view.paces.flatMap((p) => [
          h('dt', { text: p.name }),
          'day' in p.value
            ? h('dd', {}, h('b', { text: p.value.day }), h('span', { class: 'rows-sub', text: p.value.sub }))
            : 'never' in p.value
              ? h('dd', { class: 'tone-up', text: p.value.never })
              : h('dd', {}, '—', h('span', { class: 'rows-sub', text: p.value.needs })),
        ]),
      ),
    );
    body.replaceChildren(...parts);
  };
}

/**
 * The height's fields (cm, or feet and inches, as the height unit in Your data's settings says) and
 * Save, behind Change height on the BMI card and the Height row of Your data's settings.
 */
export function heightEditor(app: App, prefix: string, labelledBy: string): ProfileEditor {
  const cm = unitField(`${prefix}height-cm`);
  const feet = unitField(`${prefix}height-ft`);
  const inches = unitField(`${prefix}height-in`);
  const save = h('button', { class: 'button', attrs: { type: 'submit' } });
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  const fields = h('div', { class: 'entry-row height-fields' });
  const form = h(
    'form',
    { class: 'entry-row', attrs: { novalidate: true, 'aria-labelledby': labelledBy } },
    fields,
    save,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const s = settings();
    const height = readHeight(s.heightUnit, {
      cm: cm.input.value,
      feet: feet.input.value,
      inches: inches.input.value,
    });
    if (height === undefined) {
      say(status, s.heightUnit === 'cm' ? s.messages['bmi.badCm'] : s.messages['bmi.badFtIn'], 'bad');
      return;
    }
    void saveProfile(
      app,
      status,
      { heightCm: height },
      height === null
        ? s.messages['bmi.removed']
        : s.messages['bmi.saved'](s.format.height(height, s.heightUnit)),
    );
  });
  let shown: { height: number | null; unit: HeightUnit } | null = null;
  let builtFor = '';
  return {
    element: h('div', { class: 'profile-editor' }, form, status),
    draw: (state, s) => {
      const m = s.messages;
      const { format: f, heightUnit } = s;
      save.textContent = m['goal.save'];
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
        fields.replaceChildren(...(heightUnit === 'cm' ? [cm.element] : [feet.element, inches.element]));
        shown = null;
      }
      const height = state.profile.heightCm;
      const typing = [cm.input, feet.input, inches.input].includes(
        document.activeElement as HTMLInputElement,
      );
      if (!typing && (shown?.height !== height || shown.unit !== heightUnit)) {
        const ftIn = height === null ? null : toFeetInches(height);
        // Up to a tenth, as it may have been typed (or come from feet and inches).
        const tenths = height === null ? 0 : Math.round(height * 10);
        cm.input.value = height === null ? '' : f.number(tenths / 10, tenths % 10 === 0 ? 0 : 1);
        feet.input.value = ftIn ? String(ftIn.feet) : '';
        inches.input.value = ftIn ? f.number(ftIn.inches, ftIn.inches % 1 === 0 ? 0 : 1) : '';
        shown = { height, unit: heightUnit };
      }
    },
  };
}

export function mountBmi(
  card: Pick<Disclosure, 'body' | 'tools'>,
  app: App,
  layout: Layout,
): (state: State, s: Settings) => void {
  const editor = heightEditor(app, '', 'bmi-title');
  const body = h('div', { class: 'profile-body' });
  const caveat = h('p', { class: 'note card-note' });
  // The height behind Change height: a sheet on a phone, in place on the one page. Its unit is
  // chosen in Your data's settings (story 6).
  const change = optionsPanel('bmi-change', layout);
  change.panel.classList.add('options-card');
  change.content.replaceChildren(editor.element);
  card.tools.replaceChildren(change.button);
  card.body.replaceChildren(body, caveat, change.panel, card.tools);

  return (state, s) => {
    const m = s.messages;
    const { format: f, heightUnit } = s;
    change.words(m['bmi.change'], m['chart.done']);
    change.label.textContent = m['bmi.change'];
    editor.draw(state, s);
    const height = state.profile.heightCm;
    caveat.textContent = m['bmi.caveat'];
    const { analysis } = state;
    if (height === null) {
      body.replaceChildren(h('p', { class: 'note', text: m['bmi.none'] }));
      return;
    }
    const view = analysis ? bmiView(analysis, height, s) : null;
    if (!view) {
      body.replaceChildren(
        h('p', { class: 'note', text: m['bmi.noWeighIns'](f.height(height, heightUnit)) }),
      );
      return;
    }
    const mark = h('span', { class: 'scale-mark', attrs: { 'aria-hidden': 'true' } });
    mark.style.left = `${String(view.at * 100)}%`;
    body.replaceChildren(
      h(
        'p',
        { class: 'big' },
        view.big,
        ' ',
        h('span', { class: `big-unit bmi-${view.band}`, text: view.bandName }),
      ),
      h(
        'div',
        {
          class: 'scale scale-bands',
          attrs: { role: 'img', 'aria-label': m['bmi.scaleAria'](view.big, view.bandName) },
        },
        ...bmiSegments().map((seg) => {
          const part = h('span', { class: `bmi-${seg.band}` });
          part.style.width = `${String(seg.width * 100)}%`;
          return part;
        }),
        mark,
      ),
      h(
        'div',
        { class: 'scale-ticks', attrs: { 'aria-hidden': 'true' } },
        ...[18.5, 25, 30, 35, 40, 45].map((v) => {
          const tick = h('span', { text: f.number(v, v % 1 === 0 ? 0 : 1) });
          tick.style.left = `${String(((v - BMI_SCALE[0]) / (BMI_SCALE[1] - BMI_SCALE[0])) * 100)}%`;
          return tick;
        }),
      ),
      h(
        'dl',
        { class: 'rows' },
        ...view.rows.flatMap((r) => [
          h('dt', { text: r.name }),
          h('dd', {}, h('b', { text: r.value }), h('span', { class: 'rows-sub', text: r.sub })),
        ]),
      ),
    );
  };
}
