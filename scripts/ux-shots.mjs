// Screenshots of the built site for user-experience work (DaVinci's audits, designs and reviews):
// every page section at phone and desktop sizes, light and dark, English and Portuguese, text at
// 100% and 150%, with a made-up year of weigh-ins loaded through the page's own backup import.
//
//   npm run build && node scripts/ux-shots.mjs [out-dir] [--quick]
//
// Writes PNGs named <width>-<theme>-<lang>-<text>.png (the whole page) into out-dir (default
// docs/ux/shots). --quick takes only 390 px, light, English, 100%. Uses PW_CHROMIUM_PATH when set.
// Nothing here is shipped; the data is made up (the same series the end-to-end tests use).
/// <reference lib="dom" />
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const PORT = 47331;
const args = process.argv.slice(2);
const quick = args.includes('--quick');
const out = resolve(args.find((a) => !a.startsWith('--')) ?? 'docs/ux/shots');
mkdirSync(out, { recursive: true });

/** A made-up year: a slow loss with daily noise and a few days skipped, ending yesterday. */
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

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const base = `http://localhost:${String(PORT)}`;
try {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
  const widths = quick ? [390] : [320, 390, 1280];
  /** @type {('light' | 'dark')[]} */
  const themes = quick ? ['light'] : ['light', 'dark'];
  const langs = quick ? ['en'] : ['en', 'pt'];
  const texts = quick ? [100] : [100, 150];
  for (const width of widths)
    for (const theme of themes)
      for (const lang of langs)
        for (const text of texts) {
          if (width === 1280 && text !== 100) continue;
          const phone = width < 800;
          const context = await browser.newContext({
            viewport: { width, height: phone ? 844 : 900 },
            colorScheme: theme,
            locale: lang === 'pt' ? 'pt-BR' : 'en-US',
            hasTouch: phone,
            isMobile: phone,
            deviceScaleFactor: phone ? 2 : 1,
          });
          const page = await context.newPage();
          await page.goto(lang === 'pt' ? `${base}/pt/` : base);
          await page
            .locator('#data-file')
            .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: yearBackup() });
          await page
            .locator('section[aria-labelledby="data-title"] button')
            .filter({ hasText: /^(Add to what is here|Juntar ao que está aqui)$/ })
            .click();
          await page.locator('#pct-title').waitFor();
          if (text !== 100)
            await page.evaluate((t) => (document.documentElement.style.fontSize = `${String(t)}%`), text);
          await page.evaluate(() => {
            window.scrollTo(0, 0);
          });
          await page.waitForTimeout(300);
          const file = `${out}/${String(width)}-${theme}-${lang}-${String(text)}.png`;
          await page.screenshot({ path: file, fullPage: true });
          // Against the width asked for: on a phone the browser widens the layout to fit what overflows,
          // so innerWidth grows with the page and can't show it.
          const wide = await page.evaluate((w) => document.documentElement.scrollWidth > w, width);
          console.log(file, wide ? '(scrolls sideways)' : '');
          await context.close();
        }
  await browser.close();
} finally {
  server.kill();
}
