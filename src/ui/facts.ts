/**
 * Facts: the period's records, runs and equivalences, as a list (the original's "curiosidades").
 * The list is worked out by a pure function (tested) from the engine's summary and `facts()`.
 */
import { FLAT_KG, type Analysis } from '../analysis/analyze';
import { BOTTLE_KG, DIET_KCAL, facts, KCAL_PER_KG } from '../analysis/facts';
import type { State } from '../app/app';
import { count, type Settings } from '../i18n';
import { h, tone } from './dom';
import { flatSeries } from './rates';
import { dayShort } from './summary';

/** The energy usually equated with a pound of body fat (7,700 kcal a kg, rounded as it is quoted). */
export const KCAL_PER_LB = 3500;

export interface Fact {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  /** A change to tone the value by (down is good), or null. */
  readonly change: number | null;
}

export function factList(analysis: Analysis, s: Settings): Fact[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const r = analysis.summary;
  const x = facts(analysis);
  const day = (date: string) => dayShort(date, analysis, s);
  const days = (n: number) => count(n, m['word.day'], s);
  const list: Fact[] = [];
  const add = (label: string, value: string, detail: string, change: number | null = null) => {
    list.push({ label, value, detail, change });
  };
  const at = (d: { date: string; gap: number | null }) =>
    d.gap !== null && d.gap > 1 ? m['facts.onOver'](day(d.date), days(d.gap)) : m['facts.on'](day(d.date));
  if (r.biggestDrop?.change != null)
    add(m['facts.drop'], f.weightChange(r.biggestDrop.change, unit), at(r.biggestDrop), r.biggestDrop.change);
  if (r.biggestRise?.change != null)
    add(m['facts.rise'], f.weightChange(r.biggestRise.change, unit), at(r.biggestRise), r.biggestRise.change);
  if (r.longestDrops > 0 && r.longestDropsEnd)
    add(
      m['facts.dropRun'],
      count(r.longestDrops, m['word.weighIn'], s),
      m['facts.runEnd'](day(r.longestDropsEnd.date)),
    );
  if (r.longestRises > 0 && r.longestRisesEnd)
    add(
      m['facts.riseRun'],
      count(r.longestRises, m['word.weighIn'], s),
      m['facts.runEnd'](day(r.longestRisesEnd.date)),
    );
  if (x.dropShare !== null)
    add(
      m['facts.counts'],
      m['facts.countsValue'](f.number(r.drops, 0), f.number(r.rises, 0), f.number(r.flats, 0)),
      m['facts.dropShare'](f.percent(x.dropShare, 0)),
    );
  if (r.changeSd !== null && r.n > 2)
    add(m['facts.swing'], m['facts.plusMinus'](f.weight(r.changeSd, unit, 2)), m['facts.swingDetail']);
  add(m['facts.range'], f.weight(x.range, unit), m['facts.rangeDetail']);
  add(m['facts.mean'], f.weight(r.mean, unit), m['facts.meanDetail']);
  if (r.n > 1)
    add(
      m['facts.aboveMin'],
      f.weightChange(x.aboveMin, unit),
      x.daysSinceMin === 0 ? m['facts.atMin'] : m['facts.minAgo'](days(x.daysSinceMin)),
      x.aboveMin,
    );
  if (x.kcal !== null && x.dietDays !== null)
    add(
      m['facts.energy'],
      m['facts.about'](`${f.number(x.kcal, 0)} kcal`),
      m['facts.energyDetail'](
        // The rule of thumb in the reader's unit: 7,700 kcal a kg is about 3,500 a pound.
        f.number(unit === 'lb' ? KCAL_PER_LB : KCAL_PER_KG, 0),
        m[`unit.${unit}`],
        f.number(x.dietDays, 0),
        f.number(DIET_KCAL, 0),
      ),
    );
  if (x.bottles !== null)
    add(
      m['facts.bottles'](f.number(BOTTLE_KG, 0)),
      m['facts.about'](f.number(x.bottles, 1)),
      m['facts.bottlesDetail'],
    );
  if (r.bestWeek?.delta != null)
    add(
      m['facts.bestWeek'],
      f.weightChange(r.bestWeek.delta, unit, 2),
      m['facts.bestWeekDetail'](day(r.bestWeek.week)),
      r.bestWeek.delta,
    );
  const linear = analysis.models.linear;
  if (linear?.r2 != null && !flatSeries(analysis))
    add(m['facts.straight'], `R² ${f.number(linear.r2, 2)}`, m['facts.straightDetail']);
  if (r.n > 2)
    add(
      m['facts.aboveTrend'],
      m['facts.of'](f.number(r.aboveTrend, 0), f.number(r.n, 0)),
      m['facts.aboveTrendDetail'],
    );
  if (r.missing > 0) add(m['facts.missing'], f.number(r.missing, 0), m['facts.missingDetail'](days(r.days)));
  else if (r.n > 1) add(m['facts.steady'], days(r.days), m['facts.steadyDetail']);
  return list;
}

export function mountFacts(container: HTMLElement): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'facts-title' } });
  const note = h('p', { class: 'note' });
  const list = h('ul', { class: 'facts' });
  container.replaceChildren(h('div', { class: 'card-head' }, h('div', {}, title, note)), list);
  return (state, s) => {
    const m = s.messages;
    title.textContent = m['facts.title'];
    note.textContent = m['facts.note'];
    const { analysis } = state;
    if (!analysis) {
      list.replaceChildren(
        h('li', {
          class: 'empty',
          text: state.status === 'loading' ? m['home.placeholder'] : m['facts.empty'],
        }),
      );
      return;
    }
    list.replaceChildren(
      ...factList(analysis, s).map((x) =>
        h(
          'li',
          {},
          h('span', { class: 'fact-label', text: x.label }),
          h('span', { class: 'fact-value' }, x.change === null ? x.value : tone(x.value, x.change, FLAT_KG)),
          h('span', { class: 'fact-detail', text: x.detail }),
        ),
      ),
    );
  };
}
