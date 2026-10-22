// The App Store's screenshots from the iPhone app's build (docs/STORE.md), on a 6.9-inch iPhone
// (1290 × 2796):
// - the listing's (step 8): six screens in English and Brazilian Portuguese, each under a caption
//   (scripts/store-captions.json), into ios/App/fastlane/screenshots/en-US and pt-BR, which
//   `fastlane listing` uploads;
// - the one the in-app purchase's review asks for (step 5): Your data › iPhone app with Remove ads
//   ready to buy, "Buy · $2.99", into ios/App/fastlane/screenshots/review/remove-ads.png, which
//   the listing lane leaves out.
//
//   npm run build:ios && npm run store:screenshots
//
// The app's build runs in Chromium with a stand-in for Capacitor's native bridge. The app's AdSetup
// plugin answers no ad unit, so nothing of Google's starts and no banner shows anywhere, and Remove
// ads isn't bought: what the screens show is the free app. For the listing, Apple Health is on with
// a few readings from a smart scale and the daily reminder is set; the diary is made up, six months
// from 106 kg with a goal, loaded through the app's own backup import, with the page's clock fixed on
// 20 November 2026 so that every run on the same machine and Chromium takes the same pictures.
// Chromium gives the page an iPhone's safe areas and the script draws a status bar in the top one,
// as a screenshot taken on the phone has. Each screen is framed so that no line of text is cut by
// the status bar or the tab bar and no heading is left alone at the bottom (the script stops
// otherwise), then set under its caption, on the app's background, in its heading font (decision
// 166). For the review, StoreKit sells the product at a made-up price, as App Store Connect would.
// Every file is committed with the change that moves it.
// Uses PW_CHROMIUM_PATH when set. Serves dist-ios/ with Vite's preview on port 47327 (outside the
// end-to-end tests' 47319 to 47326), and stops if it is taken.
// Nothing here is shipped; the data is made up.
/// <reference lib="dom" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/** @typedef {import('@playwright/test').Browser} Browser */
/** @typedef {import('@playwright/test').BrowserContext} BrowserContext */
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ top?: string; pinned?: boolean; end?: string; hide?: string }} Frame */

const root = fileURLToPath(new URL('..', import.meta.url));
const screenshots = join(root, 'ios/App/fastlane/screenshots');
if (!existsSync(join(root, 'dist-ios/index.html'))) {
  console.error('dist-ios/ is missing: run npm run build:ios first.');
  process.exit(1);
}

const PORT = 47327;
const PRODUCT = 'net.jonathas.weightogo.removeads';
/** The screen preferences' prefix in localStorage (src/data/prefs.ts). */
const PREFS_PREFIX = 'weigh-to-go:';

/** The page's "now" for the listing: a Friday morning, the diary's last weigh-in the day before. */
const NOW = new Date('2026-11-20T08:12:00Z');

/**
 * The listing's languages: the App Store's folder, the phone's language and region, and the goal,
 * a round number in the unit the region gives (pounds in the US, kilograms in Brazil).
 */
const LANGUAGES = [
  { folder: 'en-US', locale: 'en-US', goalKg: 195 / 2.204_622_621_8 },
  { folder: 'pt-BR', locale: 'pt-BR', goalKg: 88 },
];
/** The captions, by language and screen: the listing's words, not the app's. */
const captionsJson = /** @type {unknown} */ (
  JSON.parse(readFileSync(join(root, 'scripts/store-captions.json'), 'utf8'))
);
const CAPTIONS = /** @type {Record<string, Record<string, string | undefined> | undefined>} */ (captionsJson);
/** The review screenshot's made-up price (docs/STORE.md, step 5). */
const PRICE = '$2.99';

/** A 6.9-inch iPhone (16 Pro Max, 17 Pro Max): 430 × 932 points at 3×, its safe areas in points. */
const IPHONE = { width: 430, height: 932, top: 62, bottom: 34 };
/** The caption's band, in points: the top 18% of the picture. */
const CAPTION_H = 168;

/**
 * Runs in the page before the app: Capacitor's native bridge as the iPhone would give it, with
 * stand-ins for the plugins the screens use. StoreKit holds nothing and sells Remove ads at
 * `price`, or holds it already with `held`; the app's AdSetup answers no ad unit, so the ads never
 * start. With `health`, Apple Health is on the phone and lets the app read and write, and holds `samples` from another app (a
 * smart scale); the daily reminder may notify. The diary's own file stays the web's stand-in.
 * @param {{ id: string; price: string; held: boolean; health: boolean; samples: unknown[] }} options
 */
function fakeBridge({ id, price, held, health, samples }) {
  /** @param {string} name */
  const promise = (name) => ({ name, rtype: 'promise' });
  const callback = (/** @type {string} */ name) => ({ name, rtype: 'callback' });
  const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
  w.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
  const headers = [
    {
      name: 'NativePurchases',
      methods: [
        ...['getPurchases', 'getProducts', 'purchaseProduct', 'restorePurchases'].map(promise),
        callback('addListener'),
        promise('removeListener'),
      ],
    },
    { name: 'AdSetup', methods: ['build', 'consentChoices', 'canMakePayments'].map(promise) },
  ];
  if (health)
    headers.push(
      {
        name: 'WeightHealth',
        methods: [
          'isAvailable',
          'requestAuthorization',
          'writeStatus',
          'read',
          'write',
          'remove',
          'removeAll',
        ].map(promise),
      },
      {
        name: 'LocalNotifications',
        methods: [
          ...['checkPermissions', 'requestPermissions', 'schedule', 'getPending', 'cancel'].map(promise),
          ...['getDeliveredNotifications', 'removeDeliveredNotificationsById', 'removeListener'].map(promise),
          callback('addListener'),
        ],
      },
    );
  /** @type {Record<string, Record<string, unknown> | undefined>} */
  const answers = {
    AdSetup: {
      canMakePayments: { allowed: true },
      build: { bannerId: '', sandbox: false, debug: false, appStore: false },
      consentChoices: { bannerId: '', sandbox: false, debug: false, appStore: false },
    },
    NativePurchases: {
      getPurchases: { purchases: held ? [{ productIdentifier: id, transactionId: '2000000000000001' }] : [] },
      getProducts: { products: [{ identifier: id, priceString: price, isFamilyShareable: true }] },
    },
    WeightHealth: {
      isAvailable: { available: true },
      requestAuthorization: { write: true },
      writeStatus: { status: 'allowed' },
      read: { samples },
      remove: { deleted: 0 },
      removeAll: { deleted: 0 },
    },
    LocalNotifications: {
      checkPermissions: { display: 'granted' },
      requestPermissions: { display: 'granted' },
      schedule: { notifications: [] },
      getPending: { notifications: [] },
      getDeliveredNotifications: { notifications: [] },
    },
  };
  w.Capacitor = {
    PluginHeaders: headers,
    nativeCallback: () => '1',
    /**
     * @param {string} plugin
     * @param {string} method
     */
    nativePromise: (plugin, method) => Promise.resolve(answers[plugin]?.[method] ?? {}),
  };
}

/**
 * Runs in the page: an iPhone's status bar in the top safe area (9:41, signal, Wi-Fi and a full
 * battery), in the page's text colour (`--fg`, so it follows a dark theme too), over the app's band,
 * as a screenshot on the phone shows it. Built from nodes, outside the app's own elements.
 * @param {number} height
 */
function drawStatusBar(height) {
  const ns = 'http://www.w3.org/2000/svg';
  const bar = document.createElement('div');
  bar.setAttribute('aria-hidden', 'true');
  bar.dataset.storeStatusBar = '';
  Object.assign(bar.style, {
    position: 'fixed',
    inset: '0 0 auto 0',
    height: `${String(height)}px`,
    zIndex: '2147483647',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 32px 0 50px',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    color: 'var(--fg)',
    font: '600 18.5px/1 -apple-system, "SF Pro Text", system-ui, sans-serif',
  });
  const time = document.createElement('span');
  time.textContent = '9:41';
  time.style.letterSpacing = '-0.2px';
  const icons = document.createElementNS(ns, 'svg');
  icons.setAttribute('viewBox', '0 0 78 13');
  icons.setAttribute('width', '86');
  icons.setAttribute('height', '14.3');
  /**
   * @param {string} name
   * @param {Record<string, string>} attrs
   */
  const shape = (name, attrs) => {
    const el = document.createElementNS(ns, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    icons.append(el);
  };
  // Signal: four bars.
  for (let i = 0; i < 4; i++)
    shape('rect', {
      x: String(i * 4.6),
      y: String(9 - i * 3),
      width: '3',
      height: String(4 + i * 3),
      rx: '0.8',
      fill: 'currentColor',
    });
  // Wi-Fi: three arcs.
  const wifi = 'M24.5 3.9a10.6 10.6 0 0 1 14.2 0l1.2-1.3a12.4 12.4 0 0 0-16.6 0z';
  shape('path', { d: wifi, fill: 'currentColor' });
  shape('path', { d: 'M27 6.6a7 7 0 0 1 9.2 0l1.2-1.3a8.8 8.8 0 0 0-11.6 0z', fill: 'currentColor' });
  shape('path', { d: 'M29.4 9.2a3.4 3.4 0 0 1 4.4 0l-2.2 2.4z', fill: 'currentColor' });
  // Battery: the outline, the charge and the cap.
  shape('rect', {
    x: '50.5',
    y: '0.5',
    width: '24',
    height: '12',
    rx: '3.6',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-opacity': '0.4',
  });
  shape('rect', { x: '52.5', y: '2.5', width: '20', height: '8', rx: '2', fill: 'currentColor' });
  shape('path', { d: 'M76 4.4v4.2a2.2 2.2 0 0 0 0-4.2z', fill: 'currentColor', 'fill-opacity': '0.4' });
  bar.append(time, icons);
  document.body.append(bar);
}

/**
 * A made-up diary of six months: from 106 kg, a loss that slows as it goes, with a weekend's rise,
 * the day-to-day noise and a few days not typed, ending the day before `now` with a slightly better
 * week, as a backup file. A goal of `goalKg`, and what the body composition estimates need: 1.80 m,
 * born 1984, a man. Some of the days not typed were weighed by a smart scale that writes to Apple
 * Health: those are `samples`, as Health gives them to the app.
 * @param {Date} now
 * @param {number} goalKg
 */
function madeUpDiary(now, goalKg) {
  let seed = 20_261_120;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const days = 183;
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000;
  const weighIns = [];
  const samples = [];
  for (let i = 0; i < days; i++) {
    const t = end - (days - 1 - i) * 86_400_000;
    const weekday = new Date(t).getUTCDay();
    const weekend = weekday === 0 || weekday === 1 ? 0.35 : 0;
    const trend = 106 - 15 * (1 - Math.exp(-i / 140)) - (i >= days - 7 ? 0.25 : 0);
    const kg = Math.round((trend + weekend + (random() - 0.5) * 0.9) * 10) / 10;
    const date = new Date(t).toISOString().slice(0, 10);
    // The first and the last days are always typed; about one day in fifteen isn't.
    if (i > 0 && i < days - 1 && random() < 0.07) {
      if (random() < 0.5)
        samples.push({ uuid: `made-up-scale-${String(i)}`, kg: kg + 0.05, start: `${date}T06:48:00.000Z` });
      continue;
    }
    weighIns.push({ date, kg, savedAt: `${date}T07:${String(10 + (i % 40)).padStart(2, '0')}:00.000Z` });
  }
  const backup = {
    app: 'weigh-to-go',
    format: 1,
    exportedAt: now.toISOString(),
    weighIns,
    profile: { goalKg, heightCm: 180, birthYear: 1984, sex: 'male' },
  };
  return { backup: Buffer.from(JSON.stringify(backup)), samples, last: weighIns[weighIns.length - 1] };
}

/** Waits for the fonts and two frames. */
async function settle(/** @type {Page} */ page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) =>
      requestAnimationFrame(() => {
        requestAnimationFrame(done);
      }),
    );
  });
  await page.waitForTimeout(300);
}

/** Shows a view, as its tab does, at its top. */
async function show(/** @type {Page} */ page, /** @type {string} */ view) {
  await page.locator(`nav.tabs a[href="#${view}"]`).click();
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await settle(page);
}

/** Opens an Analysis card, closed by default on a phone. */
async function openCard(/** @type {Page} */ page, /** @type {string} */ id) {
  const toggle = page.locator(`#${id}-toggle`);
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await settle(page);
}

/** Closes an Analysis card. */
async function closeCard(/** @type {Page} */ page, /** @type {string} */ id) {
  const toggle = page.locator(`#${id}-toggle`);
  if ((await toggle.getAttribute('aria-expanded')) === 'true') await toggle.click();
  await settle(page);
}

/**
 * Runs in the page: scrolls to the frame closest to `top` sitting 12 points under the status bar
 * where `end` is wholly above the tab bar, `hide` wholly under it, and nothing is cut: no line of
 * text, control or chart halfway under the status bar or the tab bar, and no heading as the last
 * thing on screen. Without `top`, the view's top. Returns what is wrong with the best frame there
 * is, or nothing.
 * @param {Frame & { band: number }} frame
 * @returns {string[]}
 */
function placeFrame({ top, pinned = false, end, hide, band }) {
  const bar = document.querySelector('nav.tabs')?.getBoundingClientRect().top ?? window.innerHeight;
  /** @param {string | undefined} selector */
  const find = (selector) => {
    if (selector === undefined) return null;
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Nothing on the page is ${selector}`);
    return el;
  };
  const [t, e, h] = [find(top), find(end), find(hide)];
  const docTop = (/** @type {Element} */ el) => el.getBoundingClientRect().top + window.scrollY;
  const docBottom = (/** @type {Element} */ el) => el.getBoundingClientRect().bottom + window.scrollY;
  const most = document.documentElement.scrollHeight - window.innerHeight;
  const want = t ? docTop(t) - band - 12 : 0;
  // What is kept clear above the tab bar.
  const margin = 8;
  // A pinned `top` stays about 12 points under the status bar (from 6 to 36, as near 12 as fits).
  const low = Math.max(0, e ? docBottom(e) - (bar - margin) : 0, pinned ? want - 24 : 0);
  const high = Math.min(
    most,
    t ? docTop(t) - band - 4 : 0,
    h ? docTop(h) - bar : Infinity,
    pinned ? want + 6 : Infinity,
  );

  const outside = (/** @type {Element} */ el) =>
    el.closest('nav.tabs, .ad-space, [data-store-status-bar]') !== null;
  const shown = (/** @type {Element} */ el) =>
    el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  /** What is cut in the frame on screen now. */
  const problems = () => {
    /** @type {string[]} */
    const found = [];
    /** @type {{ bottom: number; el: Element } | null} */
    let lowest = null;
    /**
     * @param {DOMRect} r
     * @param {Element} el
     * @param {string} what
     */
    const look = (r, el, what) => {
      if (r.width === 0 || r.height === 0 || r.bottom <= band + 2 || r.top >= bar) return;
      if (r.top < band - 1) found.push(`${what} cut by the status bar`);
      else if (r.bottom > bar - margin)
        found.push(`${what} less than ${String(margin)} points above the tab bar`);
      else if (!lowest || r.bottom > lowest.bottom) lowest = { bottom: r.bottom, el };
    };
    // A block of text in frame must start under the status bar and end above the tab bar: none
    // opens or stops mid-sentence, even where its hidden lines are wholly out of sight.
    for (const el of document.body.querySelectorAll('p, h1, h2, h3, h4, li, dt, dd, label, th, td, legend')) {
      if (outside(el) || !shown(el) || !el.textContent.trim()) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 || r.bottom <= band + 2 || r.top >= bar) continue;
      const text = `“${el.textContent.trim().slice(0, 40)}”`;
      if (r.top < band - 1) found.push(`${text} starts above the status bar`);
      else if (r.bottom > bar - margin + 1 && r.top < bar - margin)
        found.push(`${text} goes on under the tab bar`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !node.textContent?.trim() || outside(el) || !shown(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) look(r, el, `“${node.textContent.trim().slice(0, 40)}”`);
    }
    for (const el of document.body.querySelectorAll('input, select, button, textarea, svg')) {
      if (outside(el) || !shown(el) || (el.closest('svg') !== el && el.tagName === 'svg')) continue;
      // A list row (Your data's settings) is a strip of the card: what counts is its words, which
      // must all show or none, not its padding.
      let r = el.getBoundingClientRect();
      if (el.matches('.row')) {
        const range = document.createRange();
        range.selectNodeContents(el);
        r = range.getBoundingClientRect();
      }
      look(r, el, `a ${el.tagName.toLowerCase()}`);
    }
    const last = /** @type {{ bottom: number; el: Element } | null} */ (lowest);
    if (last?.el.closest('h1, h2, h3, h4'))
      found.push(`the heading “${last.el.textContent}” ends the screen`);
    return found;
  };

  if (low > high)
    return [
      `no frame fits ${[top, end, hide].filter(Boolean).join(', ')} (scroll from ${String(Math.round(low))} to ${String(Math.round(high))})`,
    ];
  const start = Math.min(high, Math.max(low, want));
  /** @type {string[]} */
  let first = [];
  // Outward from the place asked for, at most 300 points either way, so a frame that can't fit
  // fails rather than hangs.
  for (let step = 0; step <= Math.min(high - low, 300); step++) {
    for (const y of step === 0 ? [start] : [start + step, start - step]) {
      if (y < low || y > high) continue;
      window.scrollTo(0, y);
      const found = problems();
      if (found.length === 0) return [];
      if (first.length === 0) first = found;
    }
  }
  window.scrollTo(0, start);
  return first;
}

/**
 * Frames the screen (placeFrame) with the first of the `wanted` frames that fits, or stops the
 * script with what is cut in each.
 */
async function frame(
  /** @type {Page} */ page,
  /** @type {string} */ name,
  /** @type {Frame | Frame[]} */ wanted,
) {
  /** @type {string[]} */
  const failed = [];
  for (const one of Array.isArray(wanted) ? wanted : [wanted]) {
    const found = await page.evaluate(placeFrame, { ...one, band: IPHONE.top });
    if (found.length === 0) {
      await settle(page);
      return;
    }
    failed.push(found.join('; '));
  }
  throw new Error(`${name}: ${failed.join(' / ')}`);
}

/**
 * A new page on a 6.9-inch iPhone in `locale`, with the fake bridge and, when `clock` is given,
 * the page's time fixed there.
 * @param {Browser} browser
 * @param {{ locale: string; clock?: Date; health?: boolean; samples?: unknown[] }} options
 */
async function iphone(browser, { locale, clock, health = false, samples = [] }) {
  const context = await browser.newContext({
    viewport: { width: IPHONE.width, height: IPHONE.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale,
    timezoneId: 'UTC',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  if (clock) await page.clock.setFixedTime(clock);
  await page.addInitScript(fakeBridge, { id: PRODUCT, price: PRICE, held: false, health, samples });
  return { context, page };
}

/**
 * Runs in the page: replaces it with one listing picture, the caption on the app's background in
 * its heading font over the screen `src`, scaled down whole, its corners rounded, no device frame.
 * The caption takes at most two lines, its size coming down until it does. Returns the caption's
 * lines and the contrast of its ink on the background.
 * @param {{ caption: string; src: string; band: number; width: number; height: number }} options
 */
async function compose({ caption, src, band, width, height }) {
  // The views' titles' font (`.view-title`), read from a stand-in so it comes from the app's styles.
  const probe = document.createElement('h1');
  probe.className = 'view-title';
  document.body.append(probe);
  const { fontFamily, fontWeight } = getComputedStyle(probe);
  probe.remove();
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    inset: '0',
    background: 'var(--bg)',
    color: 'var(--fg)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    zIndex: '2147483647',
  });
  const text = document.createElement('p');
  text.textContent = caption;
  Object.assign(text.style, {
    margin: '0',
    height: `${String(band)}px`,
    boxSizing: 'border-box',
    padding: '20px 30px 8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    textWrap: 'balance',
    fontFamily,
    fontWeight,
    lineHeight: '1.12',
    letterSpacing: '0',
  });
  const image = document.createElement('img');
  image.alt = '';
  image.src = src;
  const h = height - band - 22;
  Object.assign(image.style, {
    display: 'block',
    height: `${String(h)}px`,
    width: `${String((h * width) / height)}px`,
    borderRadius: '42px',
    border: '1px solid var(--line)',
    boxShadow: 'var(--shadow)',
  });
  box.append(text, image);
  document.body.replaceChildren(box);
  await image.decode();
  await document.fonts.ready;
  // The largest size up to 34 points that keeps the caption on two lines.
  const inner = document.createElement('span');
  inner.textContent = caption;
  text.replaceChildren(inner);
  let size = 34;
  const lines = () => Math.round(inner.getBoundingClientRect().height / (size * 1.12));
  for (; size > 24; size -= 0.5) {
    text.style.fontSize = `${String(size)}px`;
    if (lines() <= 2) break;
  }
  // The size the loop stopped at, applied before it is measured (at 24 the loop ends unapplied).
  text.style.fontSize = `${String(size)}px`;
  /** @param {string} colour */
  const luminance = (colour) => {
    const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => {
      const c = Number(v) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [ink, paper] = [
    luminance(getComputedStyle(box).color),
    luminance(getComputedStyle(box).backgroundColor),
  ];
  return {
    lines: lines(),
    size,
    contrast: (Math.max(ink, paper) + 0.05) / (Math.min(ink, paper) + 0.05),
  };
}

/**
 * The listing's six screens in one language, framed and set under their captions.
 * @param {Browser} browser
 * @param {string} base
 * @param {{ folder: string; locale: string; goalKg: number }} language
 */
async function listing(browser, base, { folder, locale, goalKg }) {
  const out = join(screenshots, folder);
  mkdirSync(out, { recursive: true });
  const diary = madeUpDiary(NOW, goalKg);
  const { context, page } = await iphone(browser, {
    locale,
    clock: NOW,
    health: true,
    samples: diary.samples,
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', {
    insets: { top: IPHONE.top, bottom: IPHONE.bottom, left: 0, right: 0 },
  });
  // The import, in Your data, as someone moving from the website would.
  await page.goto(`${base}#data`);
  await page
    .locator('#data-file')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: diary.backup });
  await page.locator('button[data-import="merge"]').click();
  await page
    .locator('section[aria-labelledby="log-title"] tbody button[data-role="day"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 });
  // Apple Health and the daily reminder turned on, as the person did on the first day.
  await page.locator('#health-on').check();
  await page.locator('#reminder-on').check();
  await settle(page);
  // The screen choices of someone a few months in: a backup kept, made three days ago, and the
  // Compound daily rate card showing its curve and simulator (Options › Custom).
  await page.evaluate(
    ({ prefix, backupAt }) => {
      localStorage.setItem(`${prefix}lastBackupAt`, JSON.stringify(backupAt));
      localStorage.setItem(`${prefix}rate.blocks`, JSON.stringify(['curve', 'simulator']));
      localStorage.setItem(
        `${prefix}rate.curveLayers`,
        JSON.stringify(['points', 'constantPct', 'simulation', 'goal']),
      );
    },
    { prefix: PREFS_PREFIX, backupAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString() },
  );
  // Opened again, as on a later morning: no import message, the views drawn from the diary.
  await page.goto(base);
  await page.locator('#entry-weight').waitFor();
  await page.waitForFunction(() => (document.querySelector('.summary .take')?.textContent ?? '') !== '');
  await page.evaluate(drawStatusBar, IPHONE.top);
  await settle(page);

  /** @type {Map<string, { shot: Buffer; dark: boolean }>} */
  const shots = new Map();
  /**
   * @param {string} name
   * @param {Frame | Frame[]} wanted
   * @param {boolean} [dark]
   */
  const take = async (name, wanted, dark = false) => {
    await frame(page, name, wanted);
    shots.set(name, { shot: await page.screenshot({ animations: 'disabled' }), dark });
  };

  // 1. Progress: the trend under the daily noise, the projection and the goal, with the
  // projection's whole sentence.
  await show(page, 'progress');
  await take('1-progress', {
    top: '#view-progress-title',
    end: 'section[aria-labelledby="chart-title"] p.foot',
    hide: 'section[aria-labelledby="chart-title"] + *',
  });

  // 2. Today, in the dark theme: this morning's weight typed, before Save, in the region's unit.
  await show(page, 'today');
  await page.emulateMedia({ colorScheme: 'dark' });
  const unit = (await page.locator('#entry-unit').textContent())?.trim();
  const today = diary.last.kg - 0.3;
  const typed = unit === 'lb' ? (today * 2.204_622_621_8).toFixed(1) : today.toFixed(1);
  await page.locator('#entry-weight').fill(locale === 'pt-BR' ? typed.replace('.', ',') : typed);
  await page.locator('#entry-weight').blur();
  await settle(page);
  await take('2-today', {}, true);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('#entry-weight').fill('');
  await page.locator('#entry-weight').blur();
  await settle(page);

  // 3. The compound daily rate's simulator at the rate of the last weeks: when it reaches the goal.
  await show(page, 'analysis');
  await openCard(page, 'rate');
  await page.locator('#sim-title ~ .entry-row button').click();
  await settle(page);
  await take('3-rate', { top: '#sim-title', end: '#sim-title ~ p.foot' });

  // 4. Body composition, estimates with their formulas' error.
  await closeCard(page, 'rate');
  await openCard(page, 'body');
  await take('4-body', { top: 'section[aria-labelledby="body-title"]' });

  // 5. Your data › iPhone app, from its label: the daily reminder and Apple Health.
  await show(page, 'data');
  // The reminder's time, set once its setting has loaded (set earlier, the loading could undo it).
  await page.locator('#reminder-time').fill('07:30');
  await page.locator('#reminder-time').blur();
  await settle(page);
  if ((await page.locator('#reminder-time').inputValue()) !== '07:30')
    throw new Error('The reminder’s time did not take 07:30');
  // Where the group is too tall for its label to fit with a clean end (the Portuguese), the frame
  // starts at the reminder's card instead, the label under the status bar, and ends on Remove
  // ads' title with its first line.
  await take('5-health', [
    { top: '#app-title', pinned: true },
    { top: 'section[aria-labelledby="reminder-title"]', pinned: true },
  ]);

  // 6. Your data › Backup, from its label: what stays on the iPhone, and the copies the person
  // keeps (the group is shorter than the screen, so the start of Settings shows under it).
  await take('6-backups', { top: '#data-title', pinned: true, end: '#data-csv-format' });
  await context.close();

  // Each screen under its caption, on a page of its own (the app's styles and fonts, its screen
  // served from its own origin).
  const composer = await iphone(browser, { locale });
  await composer.context.route(`${base}__store/*`, (route) => {
    const name =
      new URL(route.request().url()).pathname
        .split('/')
        .pop()
        ?.replace(/\.png$/, '') ?? '';
    const shot = shots.get(name);
    return shot
      ? route.fulfill({ contentType: 'image/png', body: shot.shot })
      : route.fulfill({ status: 404, body: '' });
  });
  for (const [name, { dark }] of shots) {
    const caption = CAPTIONS[folder]?.[name];
    if (!caption) throw new Error(`No caption for ${folder}/${name} in scripts/store-captions.json`);
    const { page: sheet } = composer;
    await sheet.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
    await sheet.goto(`${base}#today`);
    await sheet.waitForLoadState('load');
    await settle(sheet);
    const result = await sheet.evaluate(compose, {
      caption,
      src: `${base}__store/${name}.png`,
      band: CAPTION_H,
      width: IPHONE.width,
      height: IPHONE.height,
    });
    if (result.lines > 2)
      throw new Error(`${folder}/${name}: the caption takes ${String(result.lines)} lines`);
    if (result.contrast < 4.5)
      throw new Error(`${folder}/${name}: the caption's contrast is ${result.contrast.toFixed(2)}:1`);
    await settle(sheet);
    const path = join(out, `${name}.png`);
    writeFileSync(path, await sheet.screenshot({ animations: 'disabled' }));
    console.log(
      `Wrote ${path} (caption ${String(result.size)} pt, contrast ${result.contrast.toFixed(1)}:1)`,
    );
  }
  await composer.context.close();
}

/**
 * The in-app purchase's review screenshot: Your data › iPhone app with Remove ads ready to buy, on
 * an empty diary, without the listing's status bar or caption.
 * @param {Browser} browser
 * @param {string} base
 */
async function review(browser, base) {
  const out = join(screenshots, 'review');
  mkdirSync(out, { recursive: true });
  const { context, page } = await iphone(browser, { locale: 'en-US' });
  await page.goto(`${base}#data`);
  const buy = page.locator('#remove-ads-buy');
  await buy.waitFor({ state: 'visible', timeout: 15_000 });
  const label = await buy.textContent();
  if (label !== `Buy · ${PRICE}`) throw new Error(`Remove ads shows “${String(label)}”, not ready to buy.`);
  // Remove ads and Restore purchases in the middle of the screen.
  await page.locator('#remove-ads').evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 280);
  });
  await page.waitForTimeout(300);
  const path = join(out, 'remove-ads.png');
  await page.screenshot({ path, animations: 'disabled' });
  console.log(`Wrote ${path}`);
  await context.close();
}

const server = await preview({
  root,
  mode: 'ios',
  logLevel: 'silent',
  preview: { port: PORT, strictPort: true, open: false },
});
try {
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite preview started but gave no local URL.');
  const options = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
  const browser = await chromium.launch(options);
  try {
    await review(browser, base);
  } finally {
    await browser.close();
  }
  // One browser per language, so that its own controls (the reminder's time) speak it too.
  for (const language of LANGUAGES) {
    const local = await chromium.launch({
      ...options,
      args: [`--lang=${language.locale}`],
      env: {
        ...process.env,
        LANG: `${language.locale.replace('-', '_')}.UTF-8`,
        LANGUAGE: language.locale.replace('-', '_'),
      },
    });
    try {
      await listing(local, base, language);
    } finally {
      await local.close();
    }
  }
} finally {
  await server.close();
}
