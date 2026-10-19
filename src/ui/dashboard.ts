/**
 * The diary: its parts laid out in the page, each drawn again when the data or the settings change.
 */
import type { App, State } from '../app/app';
import { onSettingsChange, settings, type Settings } from '../i18n';
import { mountChart } from './chart';
import { mountData } from './data';
import { h } from './dom';
import { mountEntry } from './entry';
import { mountHiccups } from './hiccups';
import { mountLog } from './log';
import { mountPercent } from './percent';
import { mountRates } from './rates';
import { renderSummary } from './summary';

export function mountDashboard(root: HTMLElement, app: App): void {
  const notice = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } });
  const period = h('p', { class: 'eyebrow' });
  const take = h('p', { class: 'take' });
  const entry = h('section', { class: 'card entry', attrs: { 'aria-labelledby': 'entry-title' } });
  const kpis = h('section', { class: 'kpis' });
  const chart = h('section', { class: 'card', attrs: { 'aria-labelledby': 'chart-title' } });
  const percent = h('section', { class: 'card', attrs: { 'aria-labelledby': 'pct-title' } });
  const rate = h('section', { class: 'card', attrs: { 'aria-labelledby': 'rate-title' } });
  const hiccups = h('section', { class: 'card', attrs: { 'aria-labelledby': 'hiccups-title' } });
  const log = h('section', { class: 'card', attrs: { 'aria-labelledby': 'log-title' } });
  const data = h('section', { class: 'card', attrs: { 'aria-labelledby': 'data-title' } });
  root.replaceChildren(
    notice,
    h('div', { class: 'top' }, h('div', { class: 'summary' }, period, take), entry),
    kpis,
    chart,
    percent,
    rate,
    hiccups,
    log,
    data,
  );

  const drawChart = mountChart(chart, app);
  const safely = (part: (state: State, s: Settings) => void, state: State, s: Settings) => {
    // One part failing must not leave the others stale.
    try {
      part(state, s);
    } catch (error) {
      console.error(error);
    }
  };
  const parts: ((state: State, s: Settings) => void)[] = [
    renderSummary({ period, take, kpis }),
    mountEntry(entry, app),
    drawChart,
    mountPercent(percent, app),
    mountRates(rate, app),
    // The main chart's hiccups follow the rules chosen here.
    mountHiccups(hiccups, app, () => {
      safely(drawChart, app.state(), settings());
    }),
    mountLog(log, app),
    mountData(data, notice, app),
  ];
  const render = (state: State, s: Settings) => {
    for (const part of parts) safely(part, state, s);
  };
  app.subscribe((state) => {
    render(state, settings());
  });
  onSettingsChange((s) => {
    render(app.state(), s);
  });
}
