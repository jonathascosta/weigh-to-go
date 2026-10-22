// Screenshots and measurements of the built site for user-experience work (DaVinci's audits,
// designs and reviews): the whole diary page at the review sizes of docs/ux/principles.md, light
// and dark, English and Portuguese, text at 100% and 150%, with a made-up year of weigh-ins loaded
// through the page's own backup import.
//
//   npm run build && node scripts/ux-shots.mjs [out-dir] [--quick] [--measure] [--sizes=390x844,1280x900]
//
// Shots: PNGs named <width>x<height>-<theme>-<lang>-<text>-<view>.png in out-dir, by default
// ux-shots/ at the repository's root, which Git ignores: they go to the pull requests, not the
// repository. On a phone
// each of the four views is a page of its own, shot whole, with Today also after a save
// (today-saved) and with an empty diary (today-empty); the desktop is one page (all).
// --quick takes only 390 × 844, light, English, 100%. --sizes takes only the sizes listed.
// --measure takes no shots: it writes measure.json in out-dir and prints a summary of what the audit
// (docs/ux/audit.md) quotes: page and section heights, sideways overflow, where the weigh-in sits,
// tap target sizes, how far each chart starts below its card's top, the smallest chart text and,
// at 390 × 844, the main chart's tooltip under a simulated finger and the confirmation after Save.
//
// Uses PW_CHROMIUM_PATH when set. Serves dist/ with Vite's preview on a free port of its own.
// Nothing here is shipped; the data is made up.
/// <reference lib="dom" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

/** @typedef {import('@playwright/test').Browser} Browser */
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ width: number; height: number }} Size */

/** The review sizes (docs/ux/principles.md): four phones and the desktop. */
/** @type {Size[]} */
const PHONES = [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];
/** @type {Size} */
const DESKTOP = { width: 1280, height: 900 };

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const measuring = args.includes('--measure');
const named = args.find((a) => !a.startsWith('--'));
const only = args
  .find((a) => a.startsWith('--sizes='))
  ?.slice('--sizes='.length)
  .split(',');
/** @param {Size} size */
const wanted = (size) => !only || only.includes(`${String(size.width)}x${String(size.height)}`);
const out = named ? resolve(named) : join(root, 'ux-shots');
mkdirSync(out, { recursive: true });

/**
 * A made-up year: a slow loss with daily noise and a few days skipped, ending yesterday. The same
 * series as yearBackup in e2e/helpers.ts, kept in step by hand (this script runs as plain Node).
 */
function yearBackup(days = 365) {
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const now = new Date();
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 86_400_000;
  const weighIns = [];
  for (let i = 0; i < days; i++) {
    const kg = Math.round((104 - (8 * i) / days + (random() - 0.5) * 1.2) * 10) / 10;
    if (random() < 0.08) continue;
    const date = new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    weighIns.push({ date, kg, savedAt: `${date}T07:00:00.000Z` });
  }
  const backup = {
    app: 'weigh-to-go',
    format: 1,
    exportedAt: now.toISOString(),
    weighIns,
    profile: { goalKg: 92, heightCm: 176 },
  };
  return Buffer.from(JSON.stringify(backup));
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
}

/** Waits for the diary with a weigh-in in its log, as e2e/helpers.ts loadBackup does. */
async function diaryReady(/** @type {Page} */ page) {
  await page
    .locator('section[aria-labelledby="log-title"] tbody button[data-role="day"]')
    .first()
    .waitFor({ state: 'attached' });
  await settle(page);
}

/** Shows a view, as its tab does. */
async function show(/** @type {Page} */ page, /** @type {string} */ view) {
  await page.evaluate((v) => {
    window.location.hash = `#${v}`;
  }, view);
  await settle(page);
}

/**
 * Opens the diary at a size and loads the made-up year; with `fresh`, opens it again, the way a
 * person opens it on a later day (the import leaves the page scrolled to its message).
 * @param {Browser} browser
 * @param {string} base
 * @param {{ size: Size, theme?: 'light' | 'dark', lang: string, text: number, fresh?: boolean, empty?: boolean }} options
 */
async function openDiary(browser, base, { size, theme = 'light', lang, text, fresh = false, empty = false }) {
  const phone = size.width < 800;
  const context = await browser.newContext({
    viewport: size,
    colorScheme: theme,
    locale: lang === 'pt' ? 'pt-BR' : 'en-US',
    hasTouch: phone,
    isMobile: phone,
    deviceScaleFactor: phone ? 2 : 1,
  });
  const page = await context.newPage();
  // The import is in Your data, a view of its own on a phone.
  await page.goto(new URL(`${lang === 'pt' ? 'pt/' : ''}${empty ? '' : '#data'}`, base).href);
  if (!empty) {
    await page
      .locator('#data-file')
      .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: yearBackup() });
    await page
      .locator('section[aria-labelledby="data-title"] button')
      .filter({ hasText: /^(Add to what is here|Juntar ao que está aqui)$/ })
      .click();
    await diaryReady(page);
    await show(page, 'today');
    if (fresh) {
      await page.reload();
      // Today, drawn with the year: the log is drawn only once Your data shows.
      await page.locator('#entry-weight').waitFor();
      await page.waitForFunction(() => (document.querySelector('.summary .take')?.textContent ?? '') !== '');
      await settle(page);
    }
  } else {
    await page.locator('#entry-weight').waitFor();
  }
  if (text !== 100)
    await page.evaluate((t) => {
      document.documentElement.style.fontSize = `${String(t)}%`;
    }, text);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await settle(page);
  return { context, page };
}

/**
 * Runs in the page: what the audit quotes for one size, language and text size, in CSS px from the
 * top of the page.
 * @param {number} width
 */
function measurePage(width) {
  /** @param {Element | null} el */
  const rect = (el) => el?.getBoundingClientRect() ?? null;
  /** @param {Element | null} el */
  const top = (el) => {
    const r = rect(el);
    return r ? Math.round(r.top + window.scrollY) : null;
  };
  /** @param {Element | null} el */
  const bottom = (el) => {
    const r = rect(el);
    return r ? Math.round(r.bottom + window.scrollY) : null;
  };
  const doc = document.documentElement;
  const cards = ['chart', 'pct', 'rate', 'hiccups', 'goal', 'bmi', 'facts', 'variation', 'weeks']
    .concat(['weekdays', 'calendar', 'log', 'data'])
    .map(
      (id) =>
        /** @type {[string, Element | null]} */ ([
          id,
          document.querySelector(`section[aria-labelledby="${id}-title"]`),
        ]),
    );
  /** @type {[string, Element | null][]} */
  const parts = [
    ['header', document.querySelector('.site-header')],
    ['intro', document.querySelector('.intro')],
    [
      'notice',
      [...document.querySelectorAll('.notice')].find((n) => n.getBoundingClientRect().height > 0) ?? null,
    ],
    ['summary', document.querySelector('.summary')],
    ['entry', document.querySelector('.entry')],
    ['sectionChips', document.querySelector('nav.sections')],
    ['kpis', document.querySelector('section.kpis')],
    ...cards,
    ['footer', document.querySelector('.site-footer')],
  ];
  /** @type {Record<string, { top: number | null, height: number }>} */
  const sections = {};
  for (const [name, el] of parts) {
    const r = rect(el);
    if (r && r.height > 0) sections[name] = { top: top(el), height: Math.round(r.height) };
  }

  // Every control a finger can reach, and those under 44 px either way, by kind and size.
  const controls = [...document.querySelectorAll('button, a[href], input, select, textarea, summary')].filter(
    (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 1 && r.height > 1;
    },
  );
  const small = controls.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width < 44 || r.height < 44;
  });
  /** @type {Record<string, string[]>} */
  const smallSizes = {};
  for (const el of small) {
    const r = el.getBoundingClientRect();
    const kind = [el.tagName.toLowerCase(), ...el.classList].join('.');
    const size = `${String(Math.round(r.width))}x${String(Math.round(r.height))}`;
    const list = (smallSizes[kind] ??= []);
    if (!list.includes(size)) list.push(size);
  }

  // How far each chart starts below its card's top, and the smallest text in the charts.
  /** @type {Record<string, number[]>} */
  const chartStarts = {};
  let smallestChartText = Infinity;
  for (const svg of document.querySelectorAll('svg.chart-svg')) {
    const card = svg.closest('section[aria-labelledby]');
    if (!card) continue;
    const id = (card.getAttribute('aria-labelledby') ?? '').replace(/-title$/, '');
    (chartStarts[id] ??= []).push(
      Math.round(svg.getBoundingClientRect().top - card.getBoundingClientRect().top),
    );
    for (const t of svg.querySelectorAll('text'))
      smallestChartText = Math.min(smallestChartText, parseFloat(getComputedStyle(t).fontSize));
  }

  const overflowing = [...document.querySelectorAll('body *')]
    .filter((el) => el.getBoundingClientRect().right > width + 0.5 && !el.closest('.table-box'))
    .map(
      (el) =>
        `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} to ${String(Math.round(el.getBoundingClientRect().right))}`,
    );

  return {
    pageHeight: doc.scrollHeight,
    pageWidth: doc.scrollWidth,
    overflowing: overflowing.slice(0, 6),
    sections,
    dateTop: top(document.querySelector('#entry-date')),
    weightTop: top(document.querySelector('#entry-weight')),
    saveTop: top(document.querySelector('.entry button[type=submit]')),
    saveBottom: bottom(document.querySelector('.entry button[type=submit]')),
    controls: controls.length,
    chips: controls.filter((el) => el.classList.contains('chip')).length,
    under44: small.length,
    smallSizes,
    chartStarts,
    smallestChartText,
  };
}

/**
 * Taps along the main chart at two heights, and says whether the tooltip covers the finger: a 44 px
 * disc at the touch, or the column under it, where the finger runs.
 */
async function tooltipUnderFinger(/** @type {Page} */ page) {
  // The main chart is on Progress, a view of its own on a phone.
  await show(page, 'progress');
  const svg = page.locator('section[aria-labelledby="chart-title"] svg.chart-svg').first();
  await svg.scrollIntoViewIfNeeded();
  await settle(page);
  const box = await svg.boundingBox();
  if (!box) throw new Error('The main chart is not on the page.');
  const taps = [];
  for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9])
    for (const fy of [0.3, 0.6]) {
      const x = box.x + box.width * fx;
      const y = box.y + box.height * fy;
      await page.touchscreen.tap(x, y);
      await settle(page);
      const tip = await page.evaluate(() => {
        const el = document.querySelector('section[aria-labelledby="chart-title"] .tip');
        if (!(el instanceof HTMLElement) || el.hidden) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, bottom: r.bottom, width: r.width };
      });
      const covers = tip !== null && tip.left < x + 22 && tip.right > x - 22 && tip.bottom > y - 22;
      taps.push({ at: [fx, fy], shown: tip !== null, covers, tipWidth: tip ? Math.round(tip.width) : null });
    }
  return { chartWidth: Math.round(box.width), taps };
}

/** Types a weigh-in, taps Save, and says where the confirmation appears on the screen. */
async function saveFlow(/** @type {Page} */ page) {
  await show(page, 'today');
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  await settle(page);
  const weight = await page.locator('#entry-weight').boundingBox();
  if (!weight) throw new Error('No weight field.');
  await page.touchscreen.tap(weight.x + weight.width / 2, weight.y + weight.height / 2);
  await page.keyboard.type('95.2');
  const save = await page.locator('.entry button[type=submit]').boundingBox();
  if (!save) throw new Error('No Save button.');
  await page.touchscreen.tap(save.x + save.width / 2, save.y + save.height / 2);
  await page.locator('#entry-saved').waitFor();
  return page.evaluate(() => ({
    scrollY: window.scrollY,
    viewport: window.innerHeight,
    statusTop: Math.round(document.querySelector('#entry-saved')?.getBoundingClientRect().top ?? -1),
  }));
}

/**
 * Screens of scrolling from the top before Save is wholly on screen: how far its bottom edge is
 * below the screen's, in screen heights, rounded up (0: on the first screen).
 * @param {number | null} saveBottom
 * @param {number} height
 */
const screensToSave = (saveBottom, height) =>
  saveBottom === null ? null : Math.ceil(Math.max(0, saveBottom - height) / height);

const server = await preview({
  root,
  logLevel: 'silent',
  preview: { port: 0, strictPort: true, open: false },
});
try {
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite preview started but gave no local URL.');
  /** @type {Response} */
  let answer;
  try {
    answer = await fetch(base, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(`Vite preview at ${base} did not answer in 10 s`, { cause: error });
  }
  if (!answer.ok)
    throw new Error(`Vite preview at ${base} answered ${String(answer.status)}: is dist/ built?`);
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  try {
    if (measuring) {
      /** @type {Record<string, unknown>} */
      const results = {};
      for (const size of [...PHONES, DESKTOP].filter(wanted))
        for (const lang of ['en', 'pt'])
          for (const text of size === DESKTOP ? [100] : [100, 150]) {
            const { context, page } = await openDiary(browser, base, { size, lang, text, fresh: true });
            const m = await page.evaluate(measurePage, size.width);
            const key = `${String(size.width)}x${String(size.height)}-${lang}-${String(text)}`;
            const screens = screensToSave(m.saveBottom, size.height);
            /** @type {Record<string, unknown>} */
            const entry = { ...m, screensToSave: screens };
            if (size.width === 390 && lang === 'en' && text === 100) {
              entry.tooltip = await tooltipUnderFinger(page);
              entry.afterSave = await saveFlow(page);
            }
            results[key] = entry;
            const fit =
              m.pageWidth > size.width ? `scrolls sideways (${String(m.pageWidth)} px wide)` : 'fits';
            console.log(
              `${key}: page ${String(m.pageHeight)} px (${(m.pageHeight / size.height).toFixed(1)} screens), ${fit}; ` +
                `weight field at ${String(m.weightTop)}, Save bottom ${String(m.saveBottom)}, screens to Save ${String(screens)}; ` +
                `controls ${String(m.controls)}, chips ${String(m.chips)}, under 44 px ${String(m.under44)}`,
            );
            await context.close();
          }
      const file = join(out, 'measure.json');
      writeFileSync(file, `${JSON.stringify(results, null, 2)}\n`);
      console.log(`Written: ${file}`);
    } else {
      const sizes = (quick ? [{ width: 390, height: 844 }] : [...PHONES, DESKTOP]).filter(wanted);
      /** @type {('light' | 'dark')[]} */
      const themes = quick ? ['light'] : ['light', 'dark'];
      const langs = quick ? ['en'] : ['en', 'pt'];
      const texts = quick ? [100] : [100, 150];
      for (const size of sizes)
        for (const theme of themes)
          for (const lang of langs)
            for (const text of texts) {
              if (size === DESKTOP && text !== 100) continue;
              const phone = size !== DESKTOP;
              const stem = `${String(size.width)}x${String(size.height)}-${theme}-${lang}-${String(text)}`;
              /** @param {Page} page @param {string} view */
              const shoot = async (page, view) => {
                const file = join(out, `${stem}-${view}.png`);
                if (phone) {
                  // Chromium's full-page capture drops the touch emulation (pointer: coarse turns
                  // fine, and stays so): the viewport grows to the page instead, and back.
                  const height = await page.evaluate(() => document.documentElement.scrollHeight);
                  await page.setViewportSize({ width: size.width, height: Math.max(height, size.height) });
                  await settle(page);
                  await page.screenshot({ path: file });
                  await page.setViewportSize(size);
                  await settle(page);
                } else {
                  await page.screenshot({ path: file, fullPage: true });
                }
                // Against the width asked for: on a phone the browser widens the layout to fit what
                // overflows, so innerWidth grows with the page and can't show it.
                const wide = await page.evaluate((w) => document.documentElement.scrollWidth > w, size.width);
                console.log(file, wide ? '(scrolls sideways)' : '');
              };
              const { context, page } = await openDiary(browser, base, { size, theme, lang, text });
              if (phone) {
                for (const view of ['today', 'progress', 'analysis', 'data']) {
                  await show(page, view);
                  await page.evaluate(() => {
                    window.scrollTo(0, 0);
                  });
                  await shoot(page, view);
                }
                await show(page, 'today');
                await page.locator('#entry-weight').fill(lang === 'pt' ? '95,2' : '95.2');
                await page.locator('.entry button[type=submit]').click();
                await page.locator('#entry-saved').waitFor();
                await page.evaluate(() => {
                  window.scrollTo(0, 0);
                });
                await settle(page);
                await shoot(page, 'today-saved');
              } else {
                await shoot(page, 'all');
              }
              await context.close();
              if (phone) {
                const fresh = await openDiary(browser, base, { size, theme, lang, text, empty: true });
                await shoot(fresh.page, 'today-empty');
                await fresh.context.close();
              }
            }
    }
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
