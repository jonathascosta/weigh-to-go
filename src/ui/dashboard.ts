/**
 * The diary: its parts placed in the shell's four views (docs/ux/design.md §1), each drawn again
 * when the data, the settings or the preferences change, but only while it shows. Every part has a
 * dirty flag: a change marks them all, and only the parts shown are drawn (which clears theirs); a
 * tab switch draws only the dirty parts of the view that appears. The chips of the Sections row
 * show and hide each section; a hidden one isn't drawn until it shows again.
 */
import type { App, State } from '../app/app';
import type { Notifier } from '../reminders/keeper';
import { SECTIONS, sections, viewGeneration, watchView, type Section } from '../app/view';
import { onSettingsChange, settings, type Settings } from '../i18n';
import { mountChart } from './chart';
import { manyChips } from './controls';
import { mountData, mountNotices } from './data';
import { mountCalendar, mountVariation, mountWeekdays } from './days';
import { h } from './dom';
import { mountEntry, mountPaste } from './entry';
import { mountFacts } from './facts';
import { mountHiccups } from './hiccups';
import { mountLog } from './log';
import { mountPercent } from './percent';
import { mountBmi, mountGoal } from './profile';
import { mountHealth } from './health';
import { mountRates } from './rates';
import { mountReminder } from './reminder';
import { mountShell, type Shell, type View } from './shell';
import { isStandalone } from './standalone';
import { renderSummary } from './summary';
import { mountWeeks } from './weeks';

type Draw = (state: State, s: Settings) => void;

/** A part of the diary: where it lives, the section that can hide it, and how it is drawn. */
interface Part {
  /** Its view; null for a part that must follow every change wherever it is (the notices). */
  readonly view: View | null;
  readonly section: Section | null;
  readonly draw: Draw;
  dirty: boolean;
}

export interface DashboardOptions {
  /** The phone's notifications, in the iPhone app only. */
  readonly notifier?: Notifier;
  /** The header's empty `nav` that the shell fills; made here when there is none. */
  readonly nav?: HTMLElement | null;
  /** The static page's intro, shown at the top of Today while the diary is empty. */
  readonly intro?: HTMLElement | null;
}

export interface Dashboard {
  readonly shell: Shell;
  /** The box in Your data for the language and unit settings. */
  readonly settingsBox: HTMLElement;
  /** The top of Today, for notices (the update notice). */
  readonly notices: HTMLElement;
}

export function mountDashboard(root: HTMLElement, app: App, options: DashboardOptions = {}): Dashboard {
  const { notifier } = options;
  const nav = options.nav ?? h('nav', { class: 'tabs' });
  if (!nav.isConnected && root.parentElement) root.before(nav);
  const shell = mountShell(root, nav);
  const { views } = shell;

  const notices = h('div', { class: 'notices' });
  const notice = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } });
  // An installed app with nothing in it: its data may be in the browser, which it doesn't share.
  const installText = h('p');
  const installHint = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } }, installText);
  notices.append(notice, installHint);
  // The iPhone app, like an installed website, starts with a diary of its own.
  const inApp = import.meta.env.MODE === 'ios';
  const standalone = inApp || isStandalone();
  const period = h('p', { class: 'eyebrow' });
  const take = h('p', { class: 'take' });
  const summary = h('div', { class: 'summary' }, period, take);
  const entry = h('section', { class: 'card entry', attrs: { 'aria-labelledby': 'entry-title' } });
  const backupLine = h('p', { class: 'reminder' });
  // The empty diary's ways in: a backup, or many days at once, both in Your data.
  const importLink = h('a', { attrs: { href: '#data' } });
  const pasteLink = h('a', { attrs: { href: '#data' } });
  const emptyLinks = h('div', { class: 'empty-links', attrs: { hidden: true } }, importLink, pasteLink);
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
    facts: card('facts', false),
    variation: card('variation', false),
    weeks: card('weeks', false),
    weekdays: card('weekdays', false),
    calendar: card('calendar'),
    log: card('log'),
  };
  const data = h('section', { class: 'card', attrs: { 'aria-labelledby': 'data-title' } });
  const pasteCard = h('div', { class: 'card paste-card' });
  const settingsTitle = h('h2', { attrs: { id: 'settings-title' } });
  const settingsBox = h('div', { class: 'settings' });
  const settingsCard = h(
    'section',
    { class: 'card settings-card', attrs: { 'aria-labelledby': 'settings-title' } },
    settingsTitle,
    settingsBox,
    bar,
  );
  // The daily reminder is the app's: a website can't plan notifications on the phone.
  const reminder = notifier
    ? h('section', { class: 'card', attrs: { 'aria-labelledby': 'reminder-title' } })
    : null;
  // So is Apple Health: the card shows once the app's store says the phone has it.
  const health = inApp ? h('section', { class: 'card', attrs: { 'aria-labelledby': 'health-title' } }) : null;

  const intro = options.intro ?? null;
  if (intro) {
    const heading = intro.querySelector('h1');
    heading?.setAttribute('id', 'intro-title');
    heading?.setAttribute('tabindex', '-1');
    intro.hidden = true;
  }
  const todayTitle = views.today.querySelector('h1');
  views.today.append(
    ...(intro ? [intro] : []),
    notices,
    h('div', { class: 'top' }, summary, entry),
    emptyLinks,
    el.kpis,
  );
  // The backup line sits under the weigh-in on a phone, after the six key figures on the one page.
  shell.place(backupLine, { parent: views.today }, { parent: views.today, before: el.kpis });
  views.progress.append(el.chart, h('div', { class: 'grid' }, el.goal, el.weeks));
  views.analysis.append(
    h(
      'div',
      { class: 'grid' },
      el.percent,
      el.rate,
      el.hiccups,
      el.bmi,
      el.facts,
      el.variation,
      el.weekdays,
      el.calendar,
    ),
  );
  views.data.append(
    h(
      'div',
      { class: 'data-layout' },
      h('div', { class: 'data-main' }, el.log, pasteCard),
      h(
        'div',
        { class: 'data-side' },
        data,
        settingsCard,
        ...(reminder ? [reminder] : []),
        ...(health ? [health] : []),
      ),
    ),
  );

  const safely = (draw: Draw, state: State, s: Settings) => {
    // One part failing must not leave the others stale.
    try {
      draw(state, s);
    } catch (error) {
      console.error(error);
    }
  };

  const parts: Part[] = [];
  const add = (view: View | null, section: Section | null, draw: Draw): Part => {
    const part = { view, section, draw, dirty: true };
    parts.push(part);
    return part;
  };
  /** Whether a part shows: its view is on screen (or the page is one), and its section is on. */
  const isShown = (part: Part): boolean =>
    (part.view === null || shell.isWide() || shell.currentView() === part.view) &&
    (part.section === null || sections.has(part.section));
  /** Draws the dirty parts that show. */
  const drawShown = () => {
    const state = app.state();
    const s = settings();
    for (const part of parts) {
      if (!part.dirty || !isShown(part)) continue;
      part.dirty = false;
      safely(part.draw, state, s);
    }
  };
  /** For a part that follows another: marks it, and draws it now if it shows, else when it does. */
  const follow = (get: () => Part | undefined) => () => {
    const part = get();
    if (!part) return;
    part.dirty = true;
    drawShown();
  };

  add(
    null,
    null,
    mountNotices(notice, backupLine, (due) => {
      shell.setBackupDue(due);
    }),
  );
  add('today', null, renderSummary({ period, take, kpis: el.kpis }));
  const weighIn = mountEntry(entry, app);
  add('today', null, weighIn.draw);
  // The daily variation follows the main chart's period.
  const chart = add(
    'progress',
    'chart',
    mountChart(
      el.chart,
      app,
      follow(() => variation),
    ),
  );
  add('progress', 'goal', mountGoal(el.goal, app));
  add('progress', 'weeks', mountWeeks(el.weeks, app));
  add('analysis', 'percent', mountPercent(el.percent, app));
  add('analysis', 'rate', mountRates(el.rate, app));
  // The main chart's hiccups follow the rules chosen here.
  add(
    'analysis',
    'hiccups',
    mountHiccups(
      el.hiccups,
      app,
      follow(() => chart),
    ),
  );
  add('analysis', 'bmi', mountBmi(el.bmi, app));
  add('analysis', 'facts', mountFacts(el.facts));
  const variation = add('analysis', 'variation', mountVariation(el.variation, app));
  add('analysis', 'weekdays', mountWeekdays(el.weekdays, app));
  add('analysis', 'calendar', mountCalendar(el.calendar, app));
  add('data', 'log', mountLog(el.log, app));
  add('data', null, mountData(data, app));
  const paste = mountPaste(pasteCard, app);
  add('data', null, paste.draw);
  // The empty diary's link opens the paste box itself, once Your data shows.
  pasteLink.addEventListener('click', () => {
    requestAnimationFrame(() => {
      paste.open();
    });
  });
  // The reminder plans the phone's notifications from the days logged, and Health's card follows
  // the store: both follow every change, wherever the person is.
  if (reminder && notifier) add(null, null, mountReminder(reminder, app, notifier));
  if (health) add(null, null, mountHealth(health));

  /** The sections on when last shown: one that just appeared is drawn, and nothing else. */
  const on = new Set<Section>(SECTIONS.filter((k) => sections.has(k)));
  const showSections = () => {
    for (const k of SECTIONS) {
      el[k].hidden = !sections.has(k);
      if (sections.has(k) === on.has(k)) continue;
      if (sections.has(k)) on.add(k);
      else on.delete(k);
      // Not every visible section: redrawing them all on each toggle took 300 ms with years of data.
      for (const part of parts) if (part.section === k) part.dirty = true;
    }
  };
  const toggled = () => {
    showSections();
    drawShown();
  };

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
          toggled,
        ),
      );
    }
    // Not while the store runs in memory: an import there would last only until the app closes.
    installHint.hidden = !(
      standalone &&
      state.status === 'ready' &&
      state.weighIns.length === 0 &&
      state.store?.kind !== 'memory'
    );
    installText.textContent = m['install.empty'];
    settingsTitle.textContent = m['settings.label'];
    importLink.textContent = m['empty.haveBackup'];
    pasteLink.textContent = m['paste.open'];
    // The empty diary opens on the intro and the weigh-in, with nothing to sum up yet.
    const empty = state.status === 'ready' && state.weighIns.length === 0;
    views.today.classList.toggle('is-empty', empty);
    emptyLinks.hidden = !empty;
    if (intro) {
      intro.hidden = !empty;
      if (todayTitle) todayTitle.hidden = empty;
      views.today.setAttribute('aria-labelledby', empty ? 'intro-title' : 'view-today-title');
    }
    showSections();
    for (const part of parts) part.dirty = true;
    drawShown();
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
  shell.onView((view) => {
    // Leaving Today ends the saved notice: back there, the card offers the field again.
    if (view !== 'today') weighIn.leave();
    drawShown();
  });
  shell.onWide(drawShown);

  return { shell, settingsBox, notices };
}
