/**
 * The log (design §7, Weigh-ins): the latest weigh-ins, newest first, with their change (and the
 * 7-day average where there is room). On a phone the latest 5, then "Show all" lists the rest 50
 * at a time; on the one page 100 at a time, as in Sprint 1. A day opens the day sheet, always
 * modal: its weight to change, and Delete. Both answer with a notice and Undo, which puts the day
 * back exactly (`app.restore`).
 */
import { FLAT_KG } from '../analysis/analyze';
import type { App, State } from '../app/app';
import { toKg } from '../data/paste';
import type { StoredWeighIn } from '../data/records';
import { settings, type Settings } from '../i18n';
import { chevron, h, tone } from './dom';
import { example, failure } from './entry';
import { openSheet, type Layout, type OpenSheet } from './sheet';
import type { UndoNotice } from './undo-notice';

/** Rows shown at first, and added by each "Show more", on the one page. */
export const PAGE = 100;
/** On a phone: the latest few, then the rest a page at a time. */
export const PHONE_FIRST = 5;
export const PHONE_STEP = 50;

export interface LogOptions {
  readonly layout: Layout;
  /** Where a change made in the day sheet is answered, with Undo. */
  readonly notice: UndoNotice;
}

export function mountLog(
  container: HTMLElement,
  app: App,
  { layout, notice }: LogOptions,
): (state: State, s: Settings) => void {
  const note = h('p', { class: 'note' });
  const head = h('thead');
  const body = h('tbody');
  const table = h(
    'table',
    { class: 'table log-table', attrs: { 'aria-labelledby': 'log-title' } },
    head,
    body,
  );
  const box = h('div', { class: 'table-box log-box', attrs: { id: 'log-table-box' } }, table);
  const more = h('div', { class: 'log-more' });
  container.replaceChildren(note, box, more);

  /** How many times "Show more" (or "Show all") was pressed. */
  let pages = 0;
  const shownCount = () =>
    layout.isWide() ? PAGE + pages * PAGE : pages === 0 ? PHONE_FIRST : PHONE_FIRST + pages * PHONE_STEP;

  /** The day sheet open now, if any. */
  let sheet: OpenSheet | null = null;

  const openDay = (date: string, opener: HTMLElement) => {
    const s = settings();
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    const record = app.state().weighIns.find((w) => w.date === date);
    if (!record) return;
    const dayText = f.day(date, 'medium');
    const input = h('input', {
      attrs: {
        id: 'day-weight',
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        'aria-describedby': 'day-unit day-hint',
      },
    });
    input.value = f.weightValue(record.kg, unit);
    const save = h('button', {
      class: 'button button-big',
      attrs: { type: 'submit' },
      text: m['entry.save'],
    });
    const hint = h('p', { class: 'hint', attrs: { id: 'day-hint', role: 'status' } });
    const form = h(
      'form',
      { class: 'entry-form', attrs: { novalidate: true, 'aria-labelledby': 'sheet-title' } },
      h('label', { attrs: { for: 'day-weight' }, text: m['entry.weight'] }),
      h(
        'div',
        { class: 'with-unit' },
        input,
        h('span', { class: 'unit-tag', attrs: { id: 'day-unit' }, text: m[`unit.${unit}`] }),
      ),
      save,
      hint,
    );
    const del = h('button', {
      class: 'button button-ghost button-danger-text',
      attrs: { type: 'button', 'aria-label': m['log.deleteDay'](dayText), id: 'day-delete' },
      text: m['log.delete'],
    });
    const content = h('div', { class: 'day-sheet' }, form, h('div', { class: 'danger-zone' }, del));
    const failed = (error: unknown, fallback: string) => {
      console.error(error);
      const now = settings();
      hint.textContent = app.state().store?.needsReload ? now.messages['data.reload'] : fallback;
      hint.classList.add('hint-bad');
    };
    let busy = false;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy) return;
      const now = settings();
      const kg = toKg(input.value, now.weightUnit);
      if (kg === null) {
        hint.textContent = now.messages['entry.badWeight'](
          now.messages[`unit.${now.weightUnit}`],
          example(now),
        );
        hint.classList.add('hint-bad');
        input.focus();
        return;
      }
      busy = true;
      app
        .save([{ date, kg }])
        .then((result) => {
          const saved = result.find((r) => r.date === date);
          sheet?.close(false);
          notice.show(
            (later) =>
              later.messages['entry.updated'](
                later.format.weight(kg, later.weightUnit),
                later.format.day(date, 'medium'),
              ),
            async () =>
              saved && (await app.restore(date, saved.previous, saved.written)) ? 'undone' : 'changed',
          );
        })
        .catch((error: unknown) => {
          failed(error, failure(error, app, settings()));
        })
        .finally(() => {
          busy = false;
        });
    });
    del.addEventListener('click', () => {
      if (busy) return;
      busy = true;
      const removed: StoredWeighIn = record;
      app
        .remove(date)
        .then(() => {
          sheet?.close(false);
          notice.show(
            (later) => later.messages['log.deleted'](later.format.day(date, 'medium')),
            async () => ((await app.restore(date, removed, null)) ? 'undone' : 'changed'),
          );
        })
        .catch((error: unknown) => {
          failed(error, settings().messages['log.failed']);
        })
        .finally(() => {
          busy = false;
        });
    });
    sheet = openSheet({
      title: f.day(date, 'weekdayDayMonthYear'),
      done: m['data.cancel'],
      content,
      opener,
    });
  };

  const render = (state: State, s: Settings) => {
    // A redraw (another tab saved, the language changed) keeps focus on the day it was on.
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusedDay = focused instanceof HTMLElement ? focused.dataset.day : undefined;
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    note.textContent = m['log.note'];
    head.replaceChildren(
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: m['log.date'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['log.weight'](m[`unit.${unit}`]) }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['log.change'] }),
        h('th', { class: 'num col-avg7', attrs: { scope: 'col' }, text: m['log.avg7'] }),
        h('td', { class: 'col-go', attrs: { 'aria-hidden': 'true' } }),
      ),
    );
    const days = state.analysis?.series ?? [];
    table.hidden = days.length === 0;
    if (days.length === 0) {
      body.replaceChildren();
      more.replaceChildren(h('p', { class: 'empty', text: m['log.empty'] }));
      return;
    }
    const number = (kg: number) => f.weightValue(kg, unit);
    const shown = shownCount();
    const newest = [...days].reverse().slice(0, shown);
    body.replaceChildren(
      ...newest.map((d) => {
        const dayText = f.day(d.date, 'medium');
        const open = h(
          'button',
          {
            class: 'log-day',
            attrs: {
              type: 'button',
              'aria-label': m['log.editDay'](dayText),
              'aria-haspopup': 'dialog',
              'data-day': d.date,
              'data-role': 'day',
            },
          },
          h('span', { class: 'day-long', text: dayText }),
          h('span', { class: 'day-short', text: f.day(d.date, 'weekdayDayMonth') }),
        );
        open.addEventListener('click', () => {
          openDay(d.date, open);
        });
        const row = h(
          'tr',
          { class: 'log-row' },
          h('th', { attrs: { scope: 'row' } }, open),
          h('td', { class: 'num log-weight', text: number(d.kg) }),
          h(
            'td',
            { class: 'num' },
            d.change === null ? '—' : tone(f.weightChange(d.change, unit), d.change, FLAT_KG),
          ),
          h('td', { class: 'num col-avg7', text: d.avg7 === null ? '—' : number(d.avg7) }),
          h('td', { class: 'col-go', attrs: { 'aria-hidden': 'true' } }, chevron()),
        );
        // The whole row is the finger's target; the button in it is the keyboard's and the name.
        row.addEventListener('click', (event) => {
          if (event.target instanceof Node && open.contains(event.target)) return;
          open.click();
        });
        return row;
      }),
    );
    if (days.length > shown) {
      const first = !layout.isWide() && pages === 0;
      const count = m['log.more'](f.number(shown, 0), f.number(days.length, 0));
      // On a phone, "Show all" is a row with the count under its words; then a plain "Show more".
      const button = first
        ? h(
            'button',
            { class: 'row log-show', attrs: { type: 'button', 'data-role': 'more' } },
            h('span', { class: 'grow' }, m['log.showAll'], h('span', { class: 'row-sub', text: count })),
            chevron(),
          )
        : h('button', {
            class: 'link log-show',
            attrs: { type: 'button', 'data-role': 'more' },
            text: m['log.showMore'],
          });
      button.addEventListener('click', () => {
        const firstNew = [...days].reverse()[shown]?.date;
        pages++;
        render(app.state(), settings());
        // Keyboard readers go on from the first row that just appeared.
        if (firstNew) body.querySelector<HTMLButtonElement>(`button[data-day="${firstNew}"]`)?.focus();
      });
      if (first) more.replaceChildren(button);
      else more.replaceChildren(h('span', { class: 'note', text: count }), ' ', button);
    } else more.replaceChildren();
    if (focusedDay) body.querySelector<HTMLButtonElement>(`button[data-day="${focusedDay}"]`)?.focus();
  };
  // A change of layout starts the count again: a phone's 5, or the one page's 100.
  layout.onWide(() => {
    pages = 0;
  });
  return render;
}
