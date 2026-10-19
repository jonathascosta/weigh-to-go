/**
 * Weekly averages: a row a week (Monday to Sunday), newest first, with the week's low–high range
 * drawn on one scale for every week. The rows come from a pure function (tested).
 */
import { FLAT_KG, type Analysis } from '../analysis/analyze';
import { isoDay } from '../analysis/dates';
import type { State } from '../app/app';
import { settings, type Settings } from '../i18n';
import { h, tone } from './dom';
import { dayShort } from './summary';

/** Weeks shown at first, and added by each "Show more". */
export const WEEKS_PAGE = 52;

export interface WeekRow {
  readonly key: string;
  readonly label: { readonly long: string; readonly short: string };
  readonly mean: string;
  readonly min: string;
  readonly max: string;
  readonly n: string;
  readonly delta: { readonly text: string; readonly change: number } | null;
  /** The range and the mean on the scale shared by every week, as shares 0–1. */
  readonly bar: { readonly from: number; readonly width: number; readonly mean: number };
}

export function weekRows(analysis: Analysis, s: Settings): WeekRow[] {
  const m = s.messages;
  const { format: f, weightUnit: unit } = s;
  const { weeks } = analysis;
  const lo = Math.min(...weeks.map((w) => w.min));
  const hi = Math.max(...weeks.map((w) => w.max));
  const span = Math.max(0.1, hi - lo);
  return [...weeks].reverse().map((w) => ({
    key: w.week,
    label: {
      long: m['weeks.range'](f.day(w.week, 'medium'), f.day(isoDay(w.end), 'medium')),
      // On a phone, the Monday alone: a range of two dates with years takes three lines.
      short: dayShort(w.week, analysis, s),
    },
    mean: f.weightValue(w.mean, unit, 2),
    min: f.weightValue(w.min, unit),
    max: f.weightValue(w.max, unit),
    n: f.number(w.n, 0),
    delta: w.delta === null ? null : { text: f.weightChange(w.delta, unit, 2), change: w.delta },
    bar: { from: (w.min - lo) / span, width: (w.max - w.min) / span, mean: (w.mean - lo) / span },
  }));
}

export function mountWeeks(
  container: HTMLElement,
  app: { state(): State },
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'weeks-title' } });
  const note = h('p', { class: 'note' });
  const head = h('thead');
  const body = h('tbody');
  const more = h('div', { class: 'log-more' });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    h(
      'div',
      { class: 'table-box', attrs: { tabindex: 0, role: 'region', 'aria-labelledby': 'weeks-title' } },
      h('table', { class: 'table table-fit', attrs: { 'aria-labelledby': 'weeks-title' } }, head, body),
    ),
    more,
  );
  let shown = WEEKS_PAGE;

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    title.textContent = m['weeks.title'];
    note.textContent = m['weeks.note'];
    head.replaceChildren(
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: m['weeks.week'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['weeks.mean'](m[`unit.${unit}`]) }),
        h('th', { attrs: { scope: 'col' }, text: m['weeks.bar'] }),
        h('th', { class: 'num col-wide', attrs: { scope: 'col' }, text: m['weeks.min'] }),
        h('th', { class: 'num col-wide', attrs: { scope: 'col' }, text: m['weeks.max'] }),
        h('th', { class: 'num col-wide', attrs: { scope: 'col' }, text: m['weeks.n'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['weeks.delta'] }),
      ),
    );
    const { analysis } = state;
    if (!analysis) {
      body.replaceChildren(
        h('tr', {}, h('td', { attrs: { colspan: 7 }, class: 'empty', text: m['weeks.empty'] })),
      );
      more.replaceChildren();
      return;
    }
    const rows = weekRows(analysis, s);
    body.replaceChildren(
      ...rows.slice(0, shown).map((r) => {
        const range = h('span', { class: 'week-bar-range' });
        range.style.left = `${String(r.bar.from * 100)}%`;
        range.style.width = `${String(Math.max(1.5, r.bar.width * 100))}%`;
        const mean = h('span', { class: 'week-bar-mean' });
        mean.style.left = `${String(r.bar.mean * 100)}%`;
        return h(
          'tr',
          { attrs: { 'data-key': r.key } },
          h(
            'th',
            { attrs: { scope: 'row' } },
            h('span', { class: 'day-long', text: r.label.long }),
            h('span', { class: 'day-short', text: r.label.short }),
          ),
          h('td', { class: 'num', text: r.mean }),
          // The bar is a picture; its words say the low and the high (on a phone, the only place).
          h(
            'td',
            { class: 'week-bar-cell' },
            h('span', { class: 'week-bar', attrs: { 'aria-hidden': 'true' } }, range, mean),
            h('span', { class: 'visually-hidden', text: m['weeks.lowHigh'](r.min, r.max) }),
          ),
          h('td', { class: 'num col-wide', text: r.min }),
          h('td', { class: 'num col-wide', text: r.max }),
          h('td', { class: 'num col-wide', text: r.n }),
          h('td', { class: 'num' }, r.delta ? tone(r.delta.text, r.delta.change, FLAT_KG) : '—'),
        );
      }),
    );
    if (rows.length > shown) {
      const button = h('button', { class: 'link', attrs: { type: 'button' }, text: m['log.showMore'] });
      button.addEventListener('click', () => {
        const firstNew = rows[shown]?.key;
        shown += WEEKS_PAGE;
        render(app.state(), settings());
        // Keyboard readers go on from the first week that just appeared (the button is gone).
        const heading = firstNew ? body.querySelector<HTMLElement>(`tr[data-key="${firstNew}"] th`) : null;
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus();
        }
      });
      more.replaceChildren(
        h('span', { class: 'note', text: m['weeks.more'](f.number(shown, 0), f.number(rows.length, 0)) }),
        ' ',
        button,
      );
    } else more.replaceChildren();
  };
  return render;
}
