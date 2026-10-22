// The App Store's screenshots from the iPhone app's build (docs/STORE.md), on a 6.9-inch iPhone
// (1290 × 2796):
// - the listing's (step 8): six screens in English and Brazilian Portuguese, into
//   ios/App/fastlane/screenshots/en-US and pt-BR, which `fastlane listing` uploads;
// - the one the in-app purchase's review asks for (step 5): Your data › iPhone app with Remove ads
//   ready to buy, "Buy · $2.99", into ios/App/fastlane/screenshots/review/remove-ads.png, which
//   the listing lane leaves out.
//
//   npm run build:ios && npm run store:screenshots
//
// The app's build runs in Chromium with a stand-in for Capacitor's native bridge. The app's AdSetup
// plugin answers no ad unit, so nothing of Google's starts and no banner shows anywhere. For the
// listing, StoreKit holds Remove ads (Your data says "Ads removed. Thank you." rather than a price
// that may not be the owner's), Apple Health is on with a few readings from a smart scale, and the
// daily reminder is set; the diary is made up, six months from 106 kg with a goal, loaded through
// the app's own backup import, with the page's clock fixed on 20 November 2026 so every run takes
// the same pictures. Chromium gives the page an iPhone's safe areas, and the script draws a status
// bar in the top one, as a screenshot taken on the phone has (decision 166). For the review,
// StoreKit holds nothing and sells the product at a made-up price, as App Store Connect would.
// Every file is committed with the change that moves it.
// Uses PW_CHROMIUM_PATH when set. Serves dist-ios/ with Vite's preview on a free port of its own.
// Nothing here is shipped; the data is made up.
/// <reference lib="dom" />
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/** @typedef {import('@playwright/test').Browser} Browser */
/** @typedef {import('@playwright/test').Page} Page */

const root = fileURLToPath(new URL('..', import.meta.url));
const screenshots = join(root, 'ios/App/fastlane/screenshots');
if (!existsSync(join(root, 'dist-ios/index.html'))) {
  console.error('dist-ios/ is missing: run npm run build:ios first.');
  process.exit(1);
}

const PRODUCT = 'net.jonathas.weightogo.removeads';
/** The screen preferences' prefix in localStorage (src/data/prefs.ts). */
const PREFS_PREFIX = 'weigh-to-go:';

/** The page's "now" for the listing: a Friday morning, the diary's last weigh-in the day before. */
const NOW = new Date('2026-11-20T08:12:00Z');

/** The listing's languages: the App Store's folder and the phone's language and region. */
const LANGUAGES = [
  { folder: 'en-US', locale: 'en-US' },
  { folder: 'pt-BR', locale: 'pt-BR' },
];
/** The review screenshot's made-up price (docs/STORE.md, step 5). */
const PRICE = '$2.99';

/** A 6.9-inch iPhone (16 Pro Max, 17 Pro Max): 430 × 932 points at 3×, its safe areas in points. */
const IPHONE = { width: 430, height: 932, top: 62, bottom: 34 };

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
 * battery), in the page's text colour, over the app's band, as a screenshot on the phone shows it.
 * Built from nodes, outside the app's own elements.
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
    padding: '4px 34px 0 52px',
    boxSizing: 'border-box',
    pointerEvents: 'none',
    color: getComputedStyle(document.body).color,
    font: '600 17px/1 -apple-system, "SF Pro Text", system-ui, sans-serif',
  });
  const time = document.createElement('span');
  time.textContent = '9:41';
  time.style.letterSpacing = '-0.2px';
  const icons = document.createElementNS(ns, 'svg');
  icons.setAttribute('viewBox', '0 0 78 13');
  icons.setAttribute('width', '78');
  icons.setAttribute('height', '13');
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
 * the day-to-day noise and a few days not typed, ending the day before `now`, as a backup file. A
 * goal of 88 kg, and what the body composition estimates need: 1.80 m, born 1984, a man. Some of
 * the days not typed were weighed by a smart scale that writes to Apple Health: those are
 * `samples`, as Health gives them to the app.
 * @param {Date} now
 */
function madeUpDiary(now) {
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
    const trend = 106 - 15 * (1 - Math.exp(-i / 140));
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
    profile: { goalKg: 88, heightCm: 180, birthYear: 1984, sex: 'male' },
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

/** Scrolls so that `selector`'s top sits 12 points under the status bar, less `offset` points. */
async function scrollTo(/** @type {Page} */ page, /** @type {string} */ selector, offset = 0) {
  await page.locator(selector).evaluate(
    (el, { top, offset: more }) => {
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - top - 12 - more);
    },
    { top: IPHONE.top, offset },
  );
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
 * A new page on a 6.9-inch iPhone in `locale`, with the fake bridge and, when `clock` is given,
 * the page's time fixed there.
 * @param {Browser} browser
 * @param {{ locale: string; clock?: Date; held?: boolean; health?: boolean; samples?: unknown[] }} options
 */
async function iphone(browser, { locale, clock, held = false, health = false, samples = [] }) {
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
  await page.addInitScript(fakeBridge, { id: PRODUCT, price: PRICE, held, health, samples });
  return { context, page };
}

/**
 * The listing's six screens in one language.
 * @param {Browser} browser
 * @param {string} base
 * @param {{ folder: string; locale: string }} language
 */
async function listing(browser, base, { folder, locale }) {
  const out = join(screenshots, folder);
  mkdirSync(out, { recursive: true });
  const diary = madeUpDiary(NOW);
  const { context, page } = await iphone(browser, {
    locale,
    clock: NOW,
    held: true,
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
  await page
    .locator('section[aria-labelledby="data-title"] button')
    .filter({ hasText: /^(Add to what is here|Juntar ao que está aqui)$/ })
    .click();
  await page
    .locator('section[aria-labelledby="log-title"] tbody button[data-role="day"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15_000 });
  // Apple Health and the daily reminder turned on, as the person did on the first day.
  await page.locator('#health-on').check();
  await page.locator('#reminder-on').check();
  await page.locator('#reminder-time').fill('07:30');
  await page.locator('#reminder-time').blur();
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

  /** @param {string} name */
  const shoot = async (name) => {
    await settle(page);
    const path = join(out, `${name}.png`);
    await page.screenshot({ path });
    console.log(`Wrote ${path}`);
  };

  // 1. Today: this morning's weight typed, before Save, in the unit the phone's region gives.
  await show(page, 'today');
  const unit = (await page.locator('#entry-unit').textContent())?.trim();
  const today = diary.last.kg - 0.3;
  const typed = unit === 'lb' ? (today * 2.204_622_621_8).toFixed(1) : today.toFixed(1);
  await page.locator('#entry-weight').fill(locale === 'pt-BR' ? typed.replace('.', ',') : typed);
  await page.locator('#entry-weight').blur();
  await shoot('1-today');

  // 2. Progress: the trend under the daily noise, the projection and the goal.
  await show(page, 'progress');
  await shoot('2-progress');

  // 3. Analysis: the compound daily rate, its simulator stopping at the goal.
  await show(page, 'analysis');
  await openCard(page, 'rate');
  await scrollTo(page, 'section[aria-labelledby="rate-title"]');
  await shoot('3-rate');

  // 4. Analysis: body composition, estimates with their formulas' error.
  await closeCard(page, 'rate');
  await openCard(page, 'body');
  await scrollTo(page, 'section[aria-labelledby="body-title"]');
  await shoot('4-body');

  // 5. Your data › iPhone app: Apple Health and the daily reminder.
  await show(page, 'data');
  await scrollTo(page, '#app-title');
  await shoot('5-health');

  // 6. Your data › About: what stays on the iPhone, no account, the privacy policy.
  await scrollTo(page, '#about-title');
  await shoot('6-privacy');

  await context.close();
}

/**
 * The in-app purchase's review screenshot: Your data › iPhone app with Remove ads ready to buy, on
 * an empty diary, without the listing's status bar.
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
  await page.screenshot({ path });
  console.log(`Wrote ${path}`);
  await context.close();
}

const server = await preview({
  root,
  mode: 'ios',
  logLevel: 'silent',
  preview: { port: 0, strictPort: true, open: false },
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
