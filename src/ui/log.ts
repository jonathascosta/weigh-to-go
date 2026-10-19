/**
 * The log: every weigh-in, newest first, with its change and 7-day average, and a delete button
 * that asks first, in its own row. Focus goes where the reader expects after each step.
 */
import { FLAT_KG } from '../analysis/analyze';
import type { App, State } from '../app/app';
import { settings, type Settings } from '../i18n';
import { h, say, tone } from './dom';

/** Rows shown at first, and added by each "Show more". */
export const PAGE = 100;

export function mountLog(container: HTMLElement, app: App): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'log-title' } });
  const note = h('p', { class: 'note' });
  const status = h('p', { class: 'status', attrs: { role: 'status' } });
  const head = h('thead');
  const body = h('tbody');
  const table = h('table', { class: 'table', attrs: { 'aria-labelledby': 'log-title' } }, head, body);
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note)),
    status,
    h(
      'div',
      { class: 'table-box', attrs: { tabindex: 0, role: 'region', 'aria-labelledby': 'log-title' } },
      table,
    ),
  );

  const more = h('div', { class: 'log-more' });
  container.append(more);

  /** How many rows show: the newest first, more on request (years of rows make a slow page). */
  let shown = PAGE;

  /** The day whose delete is waiting for a yes, if any; and whether to move focus to it. */
  let confirming: string | null = null;
  let focusConfirm = false;

  const render = (state: State, s: Settings) => {
    // A redraw (another tab saved, the language changed) keeps focus on the button it was on.
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusedDay = focused instanceof HTMLElement ? focused.dataset.day : undefined;
    const focusedRole = focused instanceof HTMLElement ? focused.dataset.role : undefined;
    const m = s.messages;
    const { format: f, weightUnit: unit } = s;
    title.textContent = m['log.title'];
    note.textContent = m['log.note'];
    head.replaceChildren(
      h(
        'tr',
        {},
        h('th', { attrs: { scope: 'col' }, text: m['log.date'] }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['log.weight'](m[`unit.${unit}`]) }),
        h('th', { class: 'num', attrs: { scope: 'col' }, text: m['log.change'] }),
        h('th', { class: 'num col-avg7', attrs: { scope: 'col' }, text: m['log.avg7'] }),
        h('th', { attrs: { scope: 'col' } }, h('span', { class: 'visually-hidden', text: m['log.actions'] })),
      ),
    );
    const days = state.analysis?.series ?? [];
    if (days.length === 0) {
      body.replaceChildren(
        h('tr', {}, h('td', { attrs: { colspan: 5 }, class: 'empty', text: m['log.empty'] })),
      );
      more.replaceChildren();
      return;
    }
    const number = (kg: number) => f.weightValue(kg, unit);
    const newest = [...days].reverse().slice(0, shown);
    body.replaceChildren(
      ...newest.map((d) => {
        const dayText = f.day(d.date, 'medium');
        const actions = h('td', { class: 'actions-cell' });
        if (confirming === d.date) {
          const yes = h('button', {
            class: 'button button-small button-danger',
            attrs: { type: 'button', 'data-day': d.date, 'data-role': 'yes' },
            text: m['log.delete'],
          });
          const no = h('button', {
            class: 'button button-small button-ghost',
            attrs: { type: 'button', 'data-day': d.date, 'data-role': 'no' },
            text: m['log.keep'],
          });
          yes.addEventListener('click', () => {
            yes.disabled = true;
            app
              .remove(d.date)
              .then(() => {
                confirming = null;
                say(
                  status,
                  settings().messages['log.deleted'](settings().format.day(d.date, 'medium')),
                  'ok',
                );
                // The row is gone: focus the log's status, which says so.
                status.setAttribute('tabindex', '-1');
                status.focus();
              })
              .catch((error: unknown) => {
                console.error(error);
                const now = settings();
                say(
                  status,
                  app.state().store?.needsReload ? now.messages['data.reload'] : now.messages['log.failed'],
                  'bad',
                );
                yes.disabled = false;
              });
          });
          no.addEventListener('click', () => {
            confirming = null;
            render(app.state(), settings());
            body
              .querySelector<HTMLButtonElement>(`button[data-day="${d.date}"][data-role="delete"]`)
              ?.focus();
          });
          actions.append(
            h(
              'span',
              { class: 'confirm' },
              h('span', { class: 'day-long', text: m['log.confirm'](dayText) }),
              h('span', { class: 'day-short', text: m['log.confirm'](f.day(d.date, 'short')) }),
            ),
            ' ',
            h('span', { class: 'confirm-buttons' }, yes, ' ', no),
          );
          if (focusConfirm) {
            focusConfirm = false;
            queueMicrotask(() => {
              no.focus();
            });
          }
        } else {
          const del = h('button', {
            class: 'button button-small button-ghost',
            attrs: {
              type: 'button',
              'aria-label': m['log.deleteDay'](dayText),
              'data-day': d.date,
              'data-role': 'delete',
            },
            text: m['log.delete'],
          });
          del.addEventListener('click', () => {
            confirming = d.date;
            focusConfirm = true;
            render(app.state(), settings());
          });
          actions.append(del);
        }
        return h(
          'tr',
          {},
          h(
            'th',
            { attrs: { scope: 'row' } },
            h('span', { class: 'day-long', text: dayText }),
            h('span', { class: 'day-short', text: f.day(d.date, 'short') }),
          ),
          h('td', { class: 'num', text: number(d.kg) }),
          h(
            'td',
            { class: 'num' },
            d.change === null ? '—' : tone(f.weightChange(d.change, unit), d.change, FLAT_KG),
          ),
          h('td', { class: 'num col-avg7', text: d.avg7 === null ? '—' : number(d.avg7) }),
          actions,
        );
      }),
    );
    if (days.length > shown) {
      const button = h('button', {
        class: 'link',
        attrs: { type: 'button', 'data-role': 'more' },
        text: m['log.showMore'],
      });
      button.addEventListener('click', () => {
        const firstNew = [...days].reverse()[shown]?.date;
        shown += PAGE;
        render(app.state(), settings());
        // Keyboard readers go on from the first row that just appeared.
        if (firstNew)
          body
            .querySelector<HTMLButtonElement>(`button[data-day="${firstNew}"][data-role="delete"]`)
            ?.focus();
      });
      more.replaceChildren(
        h('span', { class: 'note', text: m['log.more'](f.number(shown, 0), f.number(days.length, 0)) }),
        ' ',
        button,
      );
    } else more.replaceChildren();
    if (focusedDay && focusedRole && !focusConfirm)
      body
        .querySelector<HTMLButtonElement>(`button[data-day="${focusedDay}"][data-role="${focusedRole}"]`)
        ?.focus();
  };
  return render;
}
