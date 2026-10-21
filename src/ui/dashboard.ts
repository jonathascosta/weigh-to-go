/**
 * The diary: its parts placed in the shell's four views (docs/ux/design.md §1), each drawn again
 * when the data, the settings or the preferences change, but only while it shows. Every part has a
 * dirty flag: a change marks them all, and only the parts shown are drawn (which clears theirs); a
 * tab switch draws only the dirty parts of the view that appears. The chips of the Sections row
 * show and hide each section; a hidden one isn't drawn until it shows again.
 */
import type { App, State } from '../app/app';
import type { Notifier } from '../reminders/keeper';
import {
  calendarSpan,
  chartPeriod,
  SECTIONS,
  sections,
  viewGeneration,
  watchView,
  type Section,
} from '../app/view';
import { onSettingsChange, settings, type Settings } from '../i18n';
import { disclosure, type Disclosure } from './card';
import { mountChart, periodStart } from './chart';
import { manyChips } from './controls';
import { mountData, mountNotices } from './data';
import {
  calendarSummary,
  mountCalendar,
  mountVariation,
  mountWeekdays,
  variationSummary,
  weekdaysSummary,
} from './days';
import { h } from './dom';
import { mountEntry, mountPaste } from './entry';
import { factsSummary, mountFacts } from './facts';
import { hiccupsSummary, mountHiccups } from './hiccups';
import { mountLog } from './log';
import { mountPercent, percentSummary } from './percent';
import { bmiSummary, mountBmi, mountGoal } from './profile';
import { mountHealth } from './health';
import { mountRates, rateSummary } from './rates';
import { mountReminder } from './reminder';
import { mountShell, type Shell, type View } from './shell';
import { isStandalone } from './standalone';
import { mountSpark } from './spark';
import { renderProgress, renderToday, stackBelow } from './summary';
import { mountWeeks } from './weeks';

type Draw = (state: State, s: Settings) => void;

/** A part of the diary: where it lives, the section that can hide it, and how it is drawn. */
interface Part {
  /** Its view; null for a part that must follow every change wherever it is (the notices). */
  readonly view: View | null;
  readonly section: Section | null;
  readonly draw: Draw;
  /** For an analysis card's body: whether its card is open (a closed body isn't drawn). */
  readonly open?: () => boolean;
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
  /** Lets go of the listeners on the page (for tests). */
  readonly dispose: () => void;
}

export function mountDashboard(root: HTMLElement, app: App, options: DashboardOptions = {}): Dashboard {
  const { notifier } = options;
  const nav = options.nav ?? h('nav', { class: 'tabs' });
  if (!nav.isConnected && root.parentElement) root.before(nav);
  const shell = mountShell(root, nav);
  const { views } = shell;

  const notices = h('div', { class: 'notices' });
  const notice = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } });
  // The reload notice again at the top of Your data, on a phone: its actions are what bring it up,
  // and the app's wording sends the person to "Try again at the top".
  const dataNotice = h('div', { class: 'notice data-notice', attrs: { role: 'status', hidden: true } });
  // An installed app with nothing in it: its data may be in the browser, which it doesn't share.
  const installText = h('p');
  const installHint = h('div', { class: 'notice', attrs: { role: 'status', hidden: true } }, installText);
  notices.append(notice, installHint);
  // The iPhone app, like an installed website, starts with a diary of its own.
  const inApp = import.meta.env.MODE === 'ios';
  const standalone = inApp || isStandalone();
  // Today: the date and where the reader stands (a short line on a phone, the full sentence on the
  // one page), the key figures and, on a phone, the last 30 days.
  const dateLine = h('p', { class: 'eyebrow' });
  const take = h('p', { class: 'take' });
  const summary = h('div', { class: 'summary' }, dateLine, take);
  const spark = mountSpark();
  // Progress, on a phone: the period, the full sentence, and all six figures after the chart.
  const progressPeriod = h('p', { class: 'eyebrow' });
  const progressTake = h('p', { class: 'take' });
  const progressSummary = h('div', { class: 'summary phone-only' }, progressPeriod, progressTake);
  const progressKpis = h('section', { class: 'kpis kpis-six phone-only' });
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
  const top = h('div', { class: 'top' }, summary);
  views.today.append(...(intro ? [intro] : []), notices, top, el.kpis, spark.element, emptyLinks, backupLine);
  // The weigh-in beside the summary on the one page; on a phone low on the screen, under the
  // figures and the last 30 days, where the thumb is (design §2). The backup line follows it.
  shell.place(entry, { parent: top }, { parent: views.today, before: emptyLinks });
  // The sparkline only where the weigh-in still fits above the tab bar with it, at its smallest
  // (its real minimum at this text size):
  // media queries don't see the root's text size, so this is measured (large text, a short phone).
  const fitSpark = () => {
    if (shell.isWide() || shell.currentView() !== 'today') return;
    if (document.documentElement.classList.contains('typing')) return;
    const field = entry.querySelector<HTMLElement>('#entry-weight') ?? entry;
    const bottom = field.getBoundingClientRect().bottom + window.scrollY;
    if (bottom <= window.scrollY) return;
    const off = views.today.classList.contains('spark-off');
    const gap = 16;
    const now = off || spark.element.hidden ? 0 : spark.element.getBoundingClientRect().height + gap;
    const tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 56;
    // With the sparkline at its smallest, against the layout viewport's height, which Safari's
    // toolbars don't change while scrolling (innerHeight does).
    const at = bottom - now + spark.minHeight() + gap;
    views.today.classList.toggle('spark-off', at > document.documentElement.clientHeight - tab);
  };
  if (typeof ResizeObserver === 'function') {
    const watch = new ResizeObserver(() => {
      fitSpark();
    });
    watch.observe(entry);
    watch.observe(summary);
    // Shown, the sparkline measures its own rows: checked again with its real minimum.
    watch.observe(spark.element);
  }
  // Three figures stack as a list when their row is narrower than 20 rem; Progress's six, in two
  // columns, below 15 rem.
  stackBelow(el.kpis, 20);
  stackBelow(progressKpis, 15);
  // The empty diary: one card says what appears when, with a way to the weigh-in (design §9).
  const emptyCard = (id: string) => {
    const text = h('p', { class: 'empty-text' });
    const link = h('a', { class: 'button', attrs: { href: '#today' } });
    const card = h('div', { class: 'card empty-card', attrs: { id, hidden: true } }, text, h('p', {}, link));
    return { card, text, link };
  };
  const progressEmpty = emptyCard('progress-empty');
  const analysisEmpty = emptyCard('analysis-empty');
  views.progress.append(
    progressEmpty.card,
    progressSummary,
    el.chart,
    progressKpis,
    h('div', { class: 'grid' }, el.goal, el.weeks),
  );
  // The analysis cards, each closed to its line on a phone and open on the one page (design §5).
  const ANALYSIS = [
    'percent',
    'rate',
    'hiccups',
    'bmi',
    'facts',
    'variation',
    'weekdays',
    'calendar',
  ] as const;
  const CARD_ID: Record<(typeof ANALYSIS)[number], string> = {
    percent: 'pct',
    rate: 'rate',
    hiccups: 'hiccups',
    bmi: 'bmi',
    facts: 'facts',
    variation: 'variation',
    weekdays: 'weekdays',
    calendar: 'calendar',
  };
  const cards = Object.fromEntries(
    ANALYSIS.map((k) => [k, disclosure(el[k], { id: CARD_ID[k], open: shell.isWide() })]),
  ) as Record<(typeof ANALYSIS)[number], Disclosure>;
  const analysisLede = h('p', { class: 'lede phone-only' });
  // Every card hidden in Sections: the tab says where to show them, and keeps its place in the bar.
  const allHiddenText = h('span');
  const showThem = h('a', { attrs: { href: '#data' } });
  const allHidden = h(
    'p',
    { class: 'card all-hidden', attrs: { hidden: true } },
    allHiddenText,
    ' ',
    showThem,
  );
  const analysisGrid = h(
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
  );
  views.analysis.append(analysisLede, analysisEmpty.card, allHidden, analysisGrid);
  views.data.append(
    dataNotice,
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
  const add = (view: View | null, section: Section | null, draw: Draw, open?: () => boolean): Part => {
    const part: Part = { view, section, draw, dirty: true, ...(open ? { open } : {}) };
    parts.push(part);
    return part;
  };
  /**
   * Whether a part shows: its view is on screen (or the page is one), its section is on, and for a
   * card's body, the card is open.
   */
  const isShown = (part: Part): boolean =>
    (part.view === null || shell.isWide() || shell.currentView() === part.view) &&
    (part.section === null || sections.has(part.section)) &&
    (part.open === undefined || part.open());
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
  const follow =
    (...get: (() => Part | undefined)[]) =>
    () => {
      for (const one of get) {
        const part = one();
        if (part) part.dirty = true;
      }
      drawShown();
    };

  add(
    null,
    null,
    mountNotices(
      { today: notice, data: dataNotice, line: backupLine },
      (due) => {
        shell.setBackupDue(due);
      },
      // The backup line's link lands on Export backup itself, not a screen away from it.
      () => {
        shell.goTo('data', () => data.querySelector<HTMLElement>('#data-export'));
      },
    ),
  );
  const todaySummary = add(
    'today',
    null,
    renderToday({ date: dateLine, take, kpis: el.kpis }, () => shell.isWide()),
  );
  add('today', null, spark.draw);
  const progressPart = add('progress', null, (state, s) => {
    // On the one page Today holds the sentence and the six figures.
    if (!shell.isWide())
      renderProgress({ period: progressPeriod, take: progressTake, kpis: progressKpis })(state, s);
  });
  const weighIn = mountEntry(entry, app);
  add('today', null, weighIn.draw);
  // The daily variation (its line and its chart) follows the main chart's period.
  const chart = add(
    'progress',
    'chart',
    mountChart(el.chart, app, {
      layout: shell,
      onPeriod: follow(
        () => variation,
        () => variationLine,
      ),
    }),
  );
  add('progress', 'goal', mountGoal(el.goal, app, shell));
  const weeksPart = add('progress', 'weeks', mountWeeks(el.weeks, shell));
  /** A card's title and line: drawn whenever its view shows, open or not. */
  const line = (k: (typeof ANALYSIS)[number], title: (m: Settings['messages']) => string, text: Draw) =>
    add('analysis', k, (state, s) => {
      cards[k].title(title(s.messages));
      text(state, s);
    });
  /** A card's body: drawn only while open. */
  const detail = (k: (typeof ANALYSIS)[number], draw: Draw) =>
    add('analysis', k, draw, () => cards[k].isOpen());
  const say =
    (k: (typeof ANALYSIS)[number], summary: (state: State, s: Settings) => string): Draw =>
    (state, s) => {
      cards[k].summary(summary(state, s));
    };
  line('percent', (m) => m['pct.title'], say('percent', percentSummary));
  detail('percent', mountPercent(cards.percent, app, shell));
  line('rate', (m) => m['rate.title'], say('rate', rateSummary));
  detail('rate', mountRates(cards.rate, app, shell));
  const hiccupsLine = line(
    'hiccups',
    (m) => m['hiccups.title'],
    say('hiccups', (state, s) => hiccupsSummary(state, s)),
  );
  // The main chart's hiccups, and the card's line, follow the rules chosen here.
  detail(
    'hiccups',
    mountHiccups(
      cards.hiccups,
      app,
      shell,
      follow(
        () => chart,
        () => hiccupsLine,
      ),
    ),
  );
  line('bmi', (m) => m['bmi.title'], say('bmi', bmiSummary));
  detail('bmi', mountBmi(cards.bmi, app, shell));
  line('facts', (m) => m['facts.title'], say('facts', factsSummary));
  detail('facts', mountFacts(cards.facts, shell));
  const variationLine = line(
    'variation',
    (m) => m['variation.title'],
    say('variation', (state, s) =>
      variationSummary(
        state,
        s,
        state.analysis ? periodStart(state.analysis, chartPeriod.get()) : new Date(0),
      ),
    ),
  );
  const variation = detail('variation', mountVariation(cards.variation, app));
  line('weekdays', (m) => m['weekdays.title'], say('weekdays', weekdaysSummary));
  detail('weekdays', mountWeekdays(cards.weekdays, app));
  const calendarLine = line(
    'calendar',
    (m) => m['calendar.title'],
    say('calendar', (state, s) => calendarSummary(state, s, calendarSpan.get())),
  );
  detail(
    'calendar',
    mountCalendar(
      cards.calendar,
      app,
      shell,
      follow(() => calendarLine),
    ),
  );
  // A card opened draws its body if it has changed since (or was never drawn).
  for (const k of ANALYSIS)
    cards[k].onToggle((open) => {
      if (open) drawShown();
    });
  add('data', 'log', mountLog(el.log, app));
  add('data', null, mountData(data, app));
  const paste = mountPaste(pasteCard, app);
  add('data', null, paste.draw);
  // The empty diary's links land on what they name in Your data: the paste box, opened, and
  // Import backup.
  pasteLink.addEventListener('click', (event) => {
    event.preventDefault();
    shell.goTo('data', paste.open);
  });
  importLink.addEventListener('click', (event) => {
    event.preventDefault();
    shell.goTo('data', () => data.querySelector<HTMLElement>('#data-import'));
  });
  // The reminder plans the phone's notifications from the days logged, and Health's card follows
  // the store: both follow every change, wherever the person is.
  if (reminder && notifier) add(null, null, mountReminder(reminder, app, notifier));
  if (health) add(null, null, mountHealth(health));

  /** The sections on when last shown: one that just appeared is drawn, and nothing else. */
  const on = new Set<Section>(SECTIONS.filter((k) => sections.has(k)));
  const showSections = () => {
    progressKpis.hidden = !sections.has('kpis');
    const none = ANALYSIS.every((k) => !sections.has(k));
    allHidden.hidden = !none;
    analysisLede.hidden = none;
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
    // Progress and Analysis too: one card says what appears when, with a way to the weigh-in.
    views.progress.classList.toggle('is-empty', empty);
    // Analysis until the second weigh-in, as its card says.
    const fewForAnalysis = state.status === 'ready' && state.weighIns.length < 2;
    views.analysis.classList.toggle('is-empty', fewForAnalysis);
    progressEmpty.card.hidden = !empty;
    analysisEmpty.card.hidden = !fewForAnalysis;
    progressEmpty.text.textContent = m['empty.progress'];
    analysisEmpty.text.textContent = m['empty.analysis'];
    progressEmpty.link.textContent = m['empty.log'];
    analysisEmpty.link.textContent = m['empty.log'];
    analysisLede.textContent = m['analysis.lede'];
    allHiddenText.textContent = m['analysis.allHidden'];
    showThem.textContent = m['analysis.showThem'];
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
  let loaded = false;
  const stops = [
    app.subscribe((state) => {
      render(state, settings());
      // Drawn with what the diary holds: an address naming a part below can be scrolled to now.
      if (!loaded && state.status === 'ready') {
        loaded = true;
        shell.ready();
      }
    }),
    onSettingsChange((s) => {
      render(app.state(), s);
    }),
    // Choices made in another tab show up here too.
    watchView(window, () => {
      render(app.state(), settings());
    }),
    shell.onView((view) => {
      // Leaving Today ends the saved notice: back there, the card offers the field again.
      if (view !== 'today') weighIn.leave();
      drawShown();
      if (view === 'today') fitSpark();
    }),
    (() => {
      // A rotated phone, or Safari's bars: the room left for the weigh-in changes.
      window.addEventListener('resize', fitSpark);
      return () => {
        window.removeEventListener('resize', fitSpark);
      };
    })(),
    shell.onWide(() => {
      // What these draw follows the layout: three figures or six, the chart's height and labels.
      todaySummary.dirty = true;
      progressPart.dirty = true;
      chart.dirty = true;
      // And the analysis cards' (the calendar's months until picked, the rows shown before Show
      // more) and the weekly averages' rows.
      weeksPart.dirty = true;
      for (const part of parts) if (part.view === 'analysis') part.dirty = true;
      drawShown();
    }),
  ];

  return {
    shell,
    settingsBox,
    notices,
    dispose: () => {
      for (const stop of stops) stop();
      weighIn.dispose();
      shell.dispose();
    },
  };
}
