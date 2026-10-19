/**
 * The diary: its parts laid out in the page, each drawn again when the data or the settings change.
 * A bar of chips shows and hides each section; a hidden one isn't drawn until it shows again.
 */
import type { App, State } from '../app/app';
import { SECTIONS, sections, viewGeneration, watchView, type Section } from '../app/view';
import { onSettingsChange, settings, type Settings } from '../i18n';
import { mountChart } from './chart';
import { manyChips } from './controls';
import { mountData } from './data';
import { mountCalendar, mountVariation, mountWeekdays } from './days';
import { h } from './dom';
import { mountEntry } from './entry';
import { mountFacts } from './facts';
import { mountHiccups } from './hiccups';
import { mountLog } from './log';
import { mountPercent } from './percent';
import { mountBmi, mountGoal } from './profile';
import { mountRates } from './rates';
import { renderSummary } from './summary';
import { mountWeeks } from './weeks';

type Part = (state: State, s: Settings) => void;

export function mountDashboard(root: HTMLElement, app: App): void {
  const notice = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } });
  const period = h('p', { class: 'eyebrow' });
  const take = h('p', { class: 'take' });
  const entry = h('section', { class: 'card entry', attrs: { 'aria-labelledby': 'entry-title' } });
  const bar = h('nav', { class: 'sections' });
  const card = (id: string, wide = true) =>
    h('section', { class: wide ? 'card wide' : 'card', attrs: { 'aria-labelledby': `${id}-title` } });
  const el: Record<Section, HTMLElement> = {
    kpis: h('section', { class: 'kpis' }),
    chart: card('chart'),
    percent: card('pct'),
    rate: card('rate'),
    hiccups: card('hiccups'),
    goal: card('goal', false),
    bmi: card('bmi', false),
    facts: card('facts'),
    variation: card('variation'),
    weeks: card('weeks'),
    weekdays: card('weekdays', false),
    calendar: card('calendar', false),
    log: card('log'),
  };
  const data = h('section', { class: 'card', attrs: { 'aria-labelledby': 'data-title' } });
  root.replaceChildren(
    notice,
    h('div', { class: 'top' }, h('div', { class: 'summary' }, period, take), entry),
    bar,
    el.kpis,
    el.chart,
    el.percent,
    el.rate,
    el.hiccups,
    h('div', { class: 'grid' }, el.goal, el.bmi, el.facts, el.variation, el.weeks, el.weekdays, el.calendar),
    el.log,
    data,
  );

  const safely = (part: Part, state: State, s: Settings) => {
    // One part failing must not leave the others stale.
    try {
      part(state, s);
    } catch (error) {
      console.error(error);
    }
  };
  /** The parts whose section is hidden: not drawn until it shows again. */
  const hidden = new Set<Part>();
  const now = (part: Part) => () => {
    if (!hidden.has(part)) safely(part, app.state(), settings());
  };
  const drawVariation = mountVariation(el.variation, app);
  // The daily variation follows the main chart's period.
  const drawChart = mountChart(el.chart, app, now(drawVariation));
  /** Each part with its section, if the bar can hide it. */
  const parts: [Section | null, Part][] = [
    // The summary line above the figures always shows; the figures follow their chip.
    [null, renderSummary({ period, take, kpis: el.kpis })],
    [null, mountEntry(entry, app)],
    ['chart', drawChart],
    ['percent', mountPercent(el.percent, app)],
    ['rate', mountRates(el.rate, app)],
    // The main chart's hiccups follow the rules chosen here.
    ['hiccups', mountHiccups(el.hiccups, app, now(drawChart))],
    ['goal', mountGoal(el.goal, app)],
    ['bmi', mountBmi(el.bmi, app)],
    ['facts', mountFacts(el.facts)],
    ['variation', drawVariation],
    ['weeks', mountWeeks(el.weeks, app)],
    ['weekdays', mountWeekdays(el.weekdays, app)],
    ['calendar', mountCalendar(el.calendar, app)],
    ['log', mountLog(el.log, app)],
    [null, mountData(data, notice, app)],
  ];

  let built = '';
  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const key = `${s.locale.tag}|${String(viewGeneration())}`;
    if (built !== key) {
      built = key;
      bar.setAttribute('aria-label', m['sections.label']);
      bar.replaceChildren(
        h('span', { class: 'control-label', text: m['sections.label'] }),
        manyChips(
          m['sections.label'],
          SECTIONS.map((k) => ({ value: k, label: m[`sections.${k}`] })),
          sections,
          () => {
            render(app.state(), settings());
          },
        ),
      );
    }
    for (const k of SECTIONS) el[k].hidden = !sections.has(k);
    for (const [section, part] of parts) {
      if (section !== null && !sections.has(section)) {
        hidden.add(part);
        continue;
      }
      hidden.delete(part);
      safely(part, state, s);
    }
  };
  app.subscribe((state) => {
    render(state, settings());
  });
  onSettingsChange((s) => {
    render(app.state(), s);
  });
  // Choices made in another tab show up here too.
  watchView(window, () => {
    render(app.state(), settings());
  });
}
