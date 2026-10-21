/**
 * The diary's shell (docs/ux/design.md §1, §11, §12): four views, Today, Progress, Analysis and Your
 * data. Below 960 px wide they are pages of their own, one at a time, switched by a bar of links at
 * the bottom; at 960 px and wider they are the parts of one page, with the same links in the header.
 *
 * The routes are the four hashes (`#today`…), whose views have other ids (`view-today`…), so a
 * route never scrolls to an element by itself; any other hash (the skip link's `#main`) is left to
 * the browser. Each view keeps its scroll position for the visit, a chosen view's heading takes
 * focus, and the title names it. The bar's height is measured into `--tab-h`, which the page's
 * padding and `scroll-padding` follow, so a focused control never ends up under it.
 */
import { onSettingsChange, settings, type Settings } from '../i18n';
import { h, s } from './dom';

export const VIEWS = ['today', 'progress', 'analysis', 'data'] as const;
export type View = (typeof VIEWS)[number];

/** The one breakpoint between the tabs and the one page. */
export const WIDE_QUERY = '(min-width: 960px)';

const BRAND = 'Weigh to Go';

/**
 * The fields that bring up a keypad: while one has focus, the bar (and, in the app, the banner)
 * steps aside. Not range, date, time or checkbox, which bring none.
 */
const TYPING = 'input[type="text"], input[type="number"], input[type="search"], input:not([type]), textarea';

/** The tab icons, drawn as strokes (design: prototypes/app.html). */
const ICONS: Record<View, () => SVGElement[]> = {
  today: () => [s('path', { d: 'M4 20h16M6 20V9.5a6 6 0 0 1 12 0V20' }), s('path', { d: 'M12 12l2.5-3' })],
  progress: () => [s('path', { d: 'M3 5l6 6 4-3 8 9' }), s('path', { d: 'M3 20h18' })],
  analysis: () =>
    [
      [3.5, 3.5],
      [13.5, 3.5],
      [3.5, 13.5],
      [13.5, 13.5],
    ].map(([x, y]) => s('rect', { x, y, width: 7, height: 7, rx: 1.5 })),
  data: () => [
    s('ellipse', { cx: 12, cy: 6, rx: 7.5, ry: 3 }),
    s('path', {
      d: 'M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6',
    }),
  ],
};

/** Where a node goes in one of the layouts: at the end of `parent`, or before `before` in it. */
export interface Spot {
  readonly parent: HTMLElement;
  readonly before?: Node | null;
}

export interface Shell {
  /** The four view sections, each starting with its `h1`. */
  readonly views: Readonly<Record<View, HTMLElement>>;
  /** The view shown on a phone; on the one page, the one last chosen (or scrolled to). */
  currentView(): View;
  /** Calls `listener` when another view is chosen; returns the unsubscribe. */
  onView(listener: (view: View) => void): () => void;
  /** Whether the layout is the one page (960 px and wider), not the tabs. */
  isWide(): boolean;
  /** Calls `listener` after the layout changes between the tabs and the one page. */
  onWide(listener: (wide: boolean) => void): () => void;
  /**
   * Keeps `node` where each layout wants it: moved there now and on every change of layout, with
   * focus kept on it (or on what inside it had focus).
   */
  place(node: HTMLElement, wide: Spot, narrow: Spot): void;
  /** Shows or hides the dot on Your data that says a backup is due. */
  setBackupDue(due: boolean): void;
}

/** The route a hash names, or null for any other hash. */
export const routeOf = (hash: string): View | null => {
  const name = hash.replace(/^#/, '');
  return VIEWS.find((v) => v === name) ?? null;
};

/** The view's heading that shows: the empty diary's intro heading on Today, else the view's own. */
export function headingOf(view: HTMLElement): HTMLElement | null {
  for (const heading of view.querySelectorAll<HTMLElement>('h1'))
    if (heading.closest('[hidden]') === null) return heading;
  return null;
}

/**
 * Builds the bar of links in `nav` and the four views in `root`, and starts following the routes
 * and the width. `win` is for tests.
 */
export function mountShell(root: HTMLElement, nav: HTMLElement, win: Window = window): Shell {
  const doc = win.document;
  const html = doc.documentElement;

  const titles = {} as Record<View, HTMLElement>;
  const views = {} as Record<View, HTMLElement>;
  for (const v of VIEWS) {
    const id = `view-${v}-title`;
    // Today's heading is for screen readers: the weigh-in card says what the view is for.
    titles[v] = h('h1', {
      class: v === 'today' ? 'view-title visually-hidden' : 'view-title',
      attrs: { id, tabindex: -1 },
    });
    views[v] = h('section', { class: 'view', attrs: { id: `view-${v}`, 'aria-labelledby': id } }, titles[v]);
  }
  root.replaceChildren(...VIEWS.map((v) => views[v]));

  const labels = {} as Record<View, HTMLElement>;
  const links = {} as Record<View, HTMLAnchorElement>;
  const dot = h('span', { class: 'dot', attrs: { 'aria-hidden': 'true', hidden: true } });
  const dueText = h('span', { class: 'visually-hidden' });
  let due = false;
  for (const v of VIEWS) {
    labels[v] = h('span', { class: 'tab-label' });
    const icon = s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    icon.append(...ICONS[v]());
    links[v] = h(
      'a',
      { attrs: { href: `#${v}`, 'data-view': v } },
      icon,
      labels[v],
      ...(v === 'data' ? [dot, dueText] : []),
    );
  }
  nav.replaceChildren(...VIEWS.map((v) => links[v]));
  // The iPhone app's band under the status bar, where the banner will be (Sprint 4): it holds no
  // controls, ever, so a tap near the banner can't land on anything of ours.
  if (import.meta.env.MODE === 'ios' && !doc.querySelector('.ad-space'))
    doc.body.prepend(h('div', { class: 'ad-space', attrs: { 'aria-hidden': 'true' } }));
  // The bar is styled only once it has links, and the page makes room for it only then: without
  // scripts there is neither.
  html.classList.add('has-tabs');

  const wideQuery = typeof win.matchMedia === 'function' ? win.matchMedia(WIDE_QUERY) : null;
  // Without media queries, the one page: nothing is hidden behind a tab.
  const isWide = () => wideQuery?.matches ?? true;
  let wide = isWide();

  let current: View = routeOf(win.location.hash) ?? 'today';
  /** On the one page, the view in sight, as the header's links say. */
  let inSight: View = current;
  const scrolls = new Map<View, number>();
  const viewListeners = new Set<(view: View) => void>();
  const wideListeners = new Set<(wide: boolean) => void>();
  const places: { node: HTMLElement; wide: Spot; narrow: Spot }[] = [];

  try {
    win.history.scrollRestoration = 'manual';
  } catch {
    // Not every browser lets a page set it; the views then scroll as the browser decides.
  }

  const notify = <T>(listeners: Set<(value: T) => void>, value: T) => {
    for (const listener of listeners) {
      try {
        listener(value);
      } catch (error) {
        console.error(error);
      }
    }
  };

  const setTitle = (m: Settings['messages']) => {
    doc.title = wide || current === 'today' ? m['page.home.title'] : `${m[`nav.${current}`]} · ${BRAND}`;
  };

  /** Which view each link marks: the page shown on a phone, the part in sight on the one page. */
  const mark = () => {
    for (const v of VIEWS) {
      if (wide ? v === inSight : v === current)
        links[v].setAttribute('aria-current', wide ? 'location' : 'page');
      else links[v].removeAttribute('aria-current');
    }
  };

  /** On a phone only the current view is shown, and only it is in the accessibility tree. */
  const show = () => {
    for (const v of VIEWS) views[v].hidden = !wide && v !== current;
    mark();
    setTitle(settings().messages);
  };

  const words = (st: Settings) => {
    const m = st.messages;
    nav.setAttribute('aria-label', m['nav.label']);
    for (const v of VIEWS) {
      labels[v].textContent = m[`nav.${v}`];
      titles[v].textContent = m[`nav.${v}`];
    }
    dueText.textContent = due ? ` ${m['nav.backupDue']}` : '';
    setTitle(m);
  };
  words(settings());
  onSettingsChange(words);

  /** Moves `node` to `spot`, keeping focus on what had it. */
  const move = (node: HTMLElement, spot: Spot) => {
    const before = spot.before ?? null;
    if (node.parentElement === spot.parent && node.nextSibling === before) return;
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && node.contains(active) ? active : null;
    spot.parent.insertBefore(node, before);
    if (focused && doc.activeElement !== focused) focused.focus({ preventScroll: true });
  };
  const placeAll = () => {
    for (const p of places) move(p.node, wide ? p.wide : p.narrow);
  };

  const viewOf = (node: Node | null): View | null =>
    VIEWS.find((v) => node !== null && views[v].contains(node)) ?? null;

  /** Shows `next`, as a page on a phone or by scrolling to it on the one page. */
  const route = (next: View, focus: boolean) => {
    if (!wide) scrolls.set(current, win.scrollY);
    const changed = next !== current;
    current = next;
    inSight = next;
    show();
    // The parts of the view that appears are drawn before its place is restored.
    if (changed) notify(viewListeners, next);
    if (wide) views[next].scrollIntoView({ block: 'start' });
    else win.scrollTo(0, scrolls.get(next) ?? 0);
    if (focus) headingOf(views[next])?.focus({ preventScroll: true });
  };

  win.addEventListener('hashchange', () => {
    const next = routeOf(win.location.hash);
    if (next) route(next, true);
  });

  /**
   * Between the tabs and the one page, nothing chosen is reset: the view the reader is on (on the
   * one page, the part with focus or in sight) stays, and so does focus, moved with its node if
   * the layout moves it, or on the view's heading if it went.
   */
  const changeWidth = () => {
    const now = isWide();
    if (now === wide) return;
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== doc.body ? active : null;
    if (!now) {
      current = viewOf(focused) ?? inSight;
      scrolls.clear();
    } else {
      inSight = current;
    }
    wide = now;
    show();
    placeAll();
    notify(wideListeners, wide);
    if (focused && (!focused.isConnected || focused.closest('[hidden]') !== null)) {
      headingOf(views[current])?.focus({ preventScroll: true });
    } else if (focused && doc.activeElement !== focused) {
      focused.focus({ preventScroll: true });
    }
    const target = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    if (target && target !== doc.body) target.scrollIntoView({ block: 'nearest' });
    else if (wide) views[current].scrollIntoView({ block: 'start' });
    else win.scrollTo(0, 0);
  };
  // Old Safari's lists have no addEventListener: there the layout stays as it opened.
  if (typeof wideQuery?.addEventListener === 'function') wideQuery.addEventListener('change', changeWidth);

  // The bar grows with the text size and with labels that wrap; the page's room for it follows
  // what it measures. Hidden while typing it measures 0, and the last real height is kept.
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (wide) return;
      const height = Math.ceil(nav.getBoundingClientRect().height);
      if (height > 0) html.style.setProperty('--tab-h', `${String(height)}px`);
    }).observe(nav);
  }

  // While a text field has focus the keypad is up: the bar steps aside.
  doc.addEventListener('focusin', (event) => {
    if (event.target instanceof Element && event.target.matches(TYPING)) html.classList.add('typing');
  });
  doc.addEventListener('focusout', () => {
    html.classList.remove('typing');
  });

  // On the one page, the header's link of the part in sight says so.
  if (typeof IntersectionObserver === 'function') {
    const seen = new Set<View>();
    const sight = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const v = VIEWS.find((x) => views[x] === entry.target);
          if (!v) continue;
          if (entry.isIntersecting) seen.add(v);
          else seen.delete(v);
        }
        const first = VIEWS.find((v) => seen.has(v));
        if (!wide || !first || first === inSight) return;
        inSight = first;
        current = first;
        mark();
      },
      // A band across the upper part of the screen: the part that crosses it is the one read.
      { rootMargin: '-30% 0px -60% 0px' },
    );
    for (const v of VIEWS) sight.observe(views[v]);
  }

  show();
  if (wide && current !== 'today') {
    // Opened at a route on the one page: that part, once there is something to scroll to.
    const opened = current;
    win.requestAnimationFrame(() => {
      views[opened].scrollIntoView({ block: 'start' });
    });
  }

  return {
    views,
    currentView: () => current,
    onView: (listener) => {
      viewListeners.add(listener);
      return () => {
        viewListeners.delete(listener);
      };
    },
    isWide: () => wide,
    onWide: (listener) => {
      wideListeners.add(listener);
      return () => {
        wideListeners.delete(listener);
      };
    },
    place: (node, wideSpot, narrowSpot) => {
      places.push({ node, wide: wideSpot, narrow: narrowSpot });
      move(node, wide ? wideSpot : narrowSpot);
    },
    setBackupDue: (now) => {
      due = now;
      dot.hidden = !due;
      dueText.textContent = due ? ` ${settings().messages['nav.backupDue']}` : '';
    },
  };
}
