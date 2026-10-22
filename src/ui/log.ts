/**
 * The log (design §7, Weigh-ins): the latest weigh-ins, newest first, with their change (and the
 * 7-day average where there is room). On a phone the latest 5, then "Show all" lists the rest 50
 * at a time; on the one page 100 at a time, as in Sprint 1. A day opens the day sheet, always
 * modal: its weight to change, and Delete. Both answer with a notice and Undo, which puts the day
 * back exactly (`app.restore`).
 */
import { FLAT_KG } from '../analysis/analyze';
import { localToday } from '../analysis/dates';
import { ReloadNeeded, type App, type State } from '../app/app';
import { toKg } from '../data/paste';
import { settings, type Settings } from '../i18n';
import { chevron, h, slashBreaks, tone } from './dom';
import { example, failure } from './entry';
import { openSheet, type Layout, type OpenSheet } from './sheet';
import type { UndoNotice, Words } from './undo-notice';

/** Rows shown at first, and added by each "Show more", on the one page. */
export const PAGE = 100;
/** On a phone: the latest few, then the rest a page at a time. */
export const PHONE_FIRST = 5;
export const PHONE_STEP = 50;

/**
 * A day as text that breaks only between its parts, never inside "21 de out." or "Oct 21": after a
 * comma, after a weekday written without one ("Wed / 21 Oct": en-GB in newer ICU data, where older
 * data wrote "Wed, 21 Oct") and before the year ("21 de out. / de 2026", "Oct 21, / 2026"), each
 * part kept whole.
 */
export function dayParts(text: string): (string | HTMLElement)[] {
  const parts: (string | HTMLElement)[] = [];
  let start = 0;
  // A leading weekday with no comma, then the day's figure.
  const weekday = /^([^\s\d,]+) (?=\d)/.exec(text);
  if (weekday?.[1]) {
    parts.push(h('span', { class: 'nowrap', text: weekday[1] }), ' ');
    start = weekday[0].length;
  }
  // No lookbehind (Safari 15): a comma's space, or a space before the year (" de 2026", " 2026").
  for (const match of text.matchAll(/, | (?=(?:de )?\d{4}\b)/g)) {
    const end = match.index + (match[0].startsWith(',') ? 1 : 0);
    if (end > start) parts.push(h('span', { class: 'nowrap', text: text.slice(start, end) }), ' ');
    start = match.index + match[0].length;
  }
  parts.push(h('span', { class: 'nowrap', text: text.slice(start) }));
  return parts;
}

export interface LogOptions {
  readonly layout: Layout;
  /** Where a change made in the day sheet is answered, with Undo. */
  readonly notice: UndoNotice;
}

export interface Log {
  readonly draw: (state: State, s: Settings) => void;
  /** Lets go of the listeners (for tests). */
  readonly dispose: () => void;
}

export function mountLog(container: HTMLElement, app: App, { layout, notice }: LogOptions): Log {
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
  const editHint = h('span', { class: 'visually-hidden', attrs: { id: 'log-edit-hint' } });
  container.replaceChildren(note, box, more, editHint);

  /** How many times "Show more" (or "Show all") was pressed. */
  let pages = 0;
  const shownCount = () =>
    layout.isWide() ? PAGE + pages * PAGE : pages === 0 ? PHONE_FIRST : PHONE_FIRST + pages * PHONE_STEP;

  /** Why an undo failed: the diary needs a reload, or the built words for what stays. */
  const undoFailed =
    (key: 'log.undoFailed' | 'log.undoChangeFailed') =>
    (error: unknown): Words =>
    (s) =>
      error instanceof ReloadNeeded || app.state().store?.needsReload
        ? s.messages['data.reload']
        : s.messages[key];

  /**
   * Where focus goes once the notice about `date` goes: the day's row, or the nearest row (a day
   * deleted), or the log's heading when no row shows.
   */
  const focusFor = (date: string): HTMLElement | null => {
    const buttons = [...body.querySelectorAll<HTMLButtonElement>('button[data-day]')];
    const same = buttons.find((b) => b.dataset.day === date);
    if (same) return same;
    // Newest first: the first row older than the day, else the last one newer.
    const older = buttons.find((b) => (b.dataset.day ?? '') < date);
    const near = older ?? buttons[buttons.length - 1];
    if (near) return near;
    const heading = document.getElementById('log-title');
    heading?.setAttribute('tabindex', '-1');
    return heading;
  };

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
          notice.show({
            text: (later) =>
              later.messages['entry.updated'](
                later.format.weight(kg, later.weightUnit),
                later.format.day(date, 'medium'),
              ),
            undo: async () =>
              saved && (await app.restore(date, saved.previous, saved.written)) ? 'undone' : 'changed',
            failed: undoFailed('log.undoChangeFailed'),
            focusAfter: () => focusFor(date),
          });
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
      app
        .remove(date)
        .then((removed) => {
          sheet?.close(false);
          notice.show({
            text: (later) => later.messages['log.deleted'](later.format.day(date, 'medium')),
            // What the store took away in the same step, not what was shown when the sheet opened.
            undo: async () => (removed && (await app.restore(date, removed, null)) ? 'undone' : 'changed'),
            failed: undoFailed('log.undoFailed'),
            focusAfter: () => focusFor(date),
          });
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
    editHint.textContent = m['log.editHint'];
    const year = localToday().slice(0, 4);
    const thisYear = (date: string) => date.slice(0, 4) === year;
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
        // Named by the day it shows; what it does is its description.
        const open = h(
          'button',
          {
            class: 'log-day',
            attrs: {
              type: 'button',
              'aria-describedby': 'log-edit-hint',
              'aria-haspopup': 'dialog',
              'data-day': d.date,
              'data-role': 'day',
            },
          },
          h('span', { class: 'day-long' }, ...dayParts(dayText)),
          // On a phone, the year only for a day of another year (after Show all).
          h(
            'span',
            { class: 'day-short' },
            ...dayParts(f.day(d.date, thisYear(d.date) ? 'weekdayDayMonth' : 'weekdayDayMonthYear')),
          ),
          // The narrowest phones with large text: the day in figures, as the date chip (decision 83),
          // breaking after a slash if a year makes it too long.
          h(
            'span',
            { class: 'day-tiny' },
            h('span', { class: 'nowrap', text: `${f.day(d.date, 'weekday')},` }),
            ' ',
            ...(thisYear(d.date) ? [f.day(d.date, 'dayMonth')] : slashBreaks(f.day(d.date, 'short'))),
          ),
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
            class: 'link more-button log-show',
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
  const stop = layout.onWide(() => {
    pages = 0;
  });
  return {
    draw: render,
    dispose: () => {
      stop();
      sheet?.close(false);
    },
  };
}
