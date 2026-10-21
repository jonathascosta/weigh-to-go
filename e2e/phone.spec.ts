/**
 * The diary on a phone (390 × 844, touch): the tabs, Back, the current tab chosen again, the
 * weigh-in's Undo, the bar stepping aside while typing, Today's three figures and sparkline, the
 * chart's Layers sheet, a finger dragged along the chart, and the app's band under the status
 * bar, which only the iPhone app's build shows.
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadBackup, previewServer, watch } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB' });

const tab = (page: Page, view: string) => page.locator(`nav.tabs a[href="#${view}"]`);

test('switches views with the tabs, focusing each view’s heading, and Back to / is Today', async ({
  page,
}) => {
  const { check } = await watch(page);
  await page.goto('/');
  await expect(page.locator('#view-today')).toBeVisible();
  await expect(page.locator('#view-progress')).toBeHidden();
  await tab(page, 'progress').tap();
  await expect(page.locator('#view-progress')).toBeVisible();
  await expect(page.locator('#view-today')).toBeHidden();
  await expect(page.locator('#view-progress-title')).toBeFocused();
  await expect(tab(page, 'progress')).toHaveAttribute('aria-current', 'page');
  await expect(page).toHaveTitle('Progress · Weigh to Go');
  await tab(page, 'analysis').tap();
  await expect(page.locator('#view-analysis-title')).toBeFocused();
  await page.goBack();
  await expect(page.locator('#view-progress')).toBeVisible();
  await page.goBack();
  // The address without a hash: Today.
  expect(new URL(page.url()).hash).toBe('');
  await expect(page.locator('#view-today')).toBeVisible();
  await expect(page.locator('#view-progress')).toBeHidden();
  await check();
});

test('takes the current view back to its top when its tab is tapped again', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'analysis').tap();
  await page.evaluate(() => {
    window.scrollTo(0, 2000);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await tab(page, 'analysis').tap();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('#view-analysis')).toBeVisible();
  await check();
});

test('saves in two taps, and Undo gives the weight back in the field', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  const field = page.locator('#entry-weight');
  await field.tap();
  // The keypad is up: the bar steps aside, and comes back after.
  await expect(page.locator('nav.tabs')).toBeHidden();
  await field.fill('82.4');
  await page.locator('.entry button[type=submit]').tap();
  await expect(page.locator('#entry-saved')).toBeVisible();
  await expect(page.locator('#entry-saved')).toContainText('Saved: 82.4 kg');
  await expect(page.locator('nav.tabs')).toBeVisible();
  await expect(page.locator('#entry-status')).toHaveText('Undo is available for 10 seconds.');
  await page.getByRole('button', { name: 'Undo' }).tap();
  await expect(field).toBeVisible();
  await expect(field).toHaveValue('82.4');
  await expect(field).toBeFocused();
  await expect(page.locator('#entry-status')).toHaveText('Undone.');
  // The keypad is up again for the correction: the bar is back once the field lets go.
  await expect(page.locator('nav.tabs')).toBeHidden();
  await field.blur();
  await tab(page, 'data').tap();
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText('No weigh-ins yet.');
  await check();
});

test('shows three key figures and the last 30 days on Today, which link to Progress', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  const today = page.locator('#view-today');
  await expect(today.locator('.kpi-label')).toHaveText(['7-day average', 'Total loss', 'Average pace']);
  await expect(today.locator('.take')).toContainText(/^−\d+\.\d kg since /);
  const spark = page.getByRole('link', { name: 'Last 30 days, see Progress' });
  await expect(spark).toBeVisible();
  await expect(spark.locator('svg path.point')).toHaveCount(1);
  // The weigh-in sits under them, in the lower part of the screen.
  const field = await page.locator('#entry-weight').boundingBox();
  expect(field?.y ?? 0).toBeGreaterThan(844 * 0.4);
  expect((field?.y ?? 0) + (field?.height ?? 0)).toBeLessThan(844 - 56);
  await spark.tap();
  await expect(page.locator('#view-progress')).toBeVisible();
  // Progress has the period, the full sentence and all six.
  await expect(page.locator('#view-progress .kpi')).toHaveCount(6);
  await check();
});

test('opens the chart’s options in a sheet, picks a view, and gives focus back on closing', async ({
  page,
}) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'progress').tap();
  const button = page.locator('#chart-options-button');
  // With nothing saved, a phone starts on Essential.
  await expect(button).toHaveText('Layers: Essential');
  await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
  await button.tap();
  const sheet = page.getByRole('dialog', { name: 'Chart options' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#sheet-title')).toBeFocused();
  // The page behind it is hidden from screen readers while it is open.
  await expect(page.locator('main')).toHaveAttribute('aria-hidden', 'true');
  await sheet.getByRole('button', { name: 'Detailed', exact: true }).tap();
  await expect(sheet.getByRole('button', { name: 'Detailed', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(sheet.getByRole('button', { name: 'Hiccups' })).toHaveAttribute('aria-pressed', 'true');
  await expect(button).toHaveText('Layers: Detailed');
  // A layer of its own makes the view Custom.
  await sheet.getByRole('button', { name: 'Smoothed trend' }).first().tap();
  await expect(button).toHaveText('Layers: Custom');
  // Focus stays inside: Tab from Done's place wraps round.
  await page.locator('.sheet-head button').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.sheet-body button').last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.sheet-head button')).toBeFocused();
  // Done closes it, and focus is back on the button that opened it.
  await page.getByRole('button', { name: 'Done' }).tap();
  await expect(sheet).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.locator('main')).not.toHaveAttribute('aria-hidden', 'true');
  // Escape closes it too, and the browser's Back, which leaves the view where it was.
  await button.tap();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(button).toBeFocused();
  await button.tap();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page.locator('#view-progress')).toBeVisible();
  // The choice is kept for the next visit.
  await page.reload();
  await tab(page, 'progress').tap();
  await expect(button).toHaveText('Layers: Custom');
  await check();
});

test('turns an open sheet into the panel in place when the screen widens, focus on its button', async ({
  page,
}) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'progress').tap();
  const button = page.locator('#chart-options-button');
  await button.tap();
  await expect(page.locator('#sheet-title')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('#chart-options')).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await expect(button).toBeFocused();
  await check();
});

test('scrubs the chart under a dragged finger, with the readout above it, still', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'progress').tap();
  const chart = page.locator('svg[aria-labelledby="chart-title"]');
  const readout = page.locator('section[aria-labelledby="chart-title"] .readout');
  await chart.scrollIntoViewIfNeeded();
  await expect(readout).toContainText('last weigh-in');
  const box = await chart.boundingBox();
  if (!box) throw new Error('No chart');
  const stripBefore = await readout.boundingBox();
  const touch = await page.context().newCDPSession(page);
  const y = box.y + box.height * 0.5;
  const at = (x: number) => [{ x: box.x + x, y }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(box.width * 0.3) });
  const first = await readout.textContent();
  const seen = new Set<string>([first ?? '']);
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(box.width * (0.3 + i * 0.05)),
    });
    seen.add((await readout.textContent()) ?? '');
    // The strip neither grows nor moves, and stays clear of a 44 px box round the finger.
    const strip = await readout.boundingBox();
    expect(strip).toEqual(stripBefore);
    expect((strip?.y ?? 0) + (strip?.height ?? 0)).toBeLessThan(y - 22);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(seen.size).toBeGreaterThan(4);
  expect(first).not.toContain('last weigh-in');
  // No tooltip under a finger: the strip says it. The day stays after the finger lifts.
  await expect(page.locator('section[aria-labelledby="chart-title"] .tip')).toBeHidden();
  await expect(readout).not.toContainText('last weigh-in');
  expect(await chart.boundingBox()).toEqual(box);
  // A tap right of the last weigh-in picks the projection's end.
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: box.x + box.width - 2, y }],
  });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(readout).toContainText('estimate');
  await check();
});

test('shows no band for the app’s banner on the website', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav.tabs a')).toHaveCount(4);
  await expect(page.locator('html')).not.toHaveClass(/in-app/);
  await expect(page.locator('.ad-space')).toHaveCount(0);
});

test('has the band under the status bar in the iPhone app’s build', async ({ page }) => {
  // CI builds it (ci.yml); on a machine that hasn't, the test says why it didn't run.
  test.skip(
    !existsSync('dist-ios/index.html') && !process.env.CI,
    'The iPhone app is built with npm run build:ios.',
  );
  const server = await previewServer(47325, 'dist-ios');
  try {
    await page.goto(server.url);
    await expect(page.locator('html')).toHaveClass(/\bin-app\b/);
    await expect(page.locator('nav.tabs a')).toHaveCount(4);
    // Its height is the status bar's and the banner's: none in a browser, but it is there and shown.
    await expect
      .poll(() => page.locator('.ad-space').evaluate((el) => getComputedStyle(el).display))
      .toBe('block');
  } finally {
    server.stop();
  }
});

test.describe('at 320 × 568 in Portuguese', () => {
  test.use({ viewport: { width: 320, height: 568 }, locale: 'pt-BR' });

  for (const text of [100, 150]) {
    test(`keeps the readout one height over every day of the chart, text ${String(text)}%`, async ({
      page,
    }) => {
      const { check } = await watch(page);
      await page.goto('/');
      await loadBackup(page);
      if (text !== 100)
        await page.evaluate((t) => {
          document.documentElement.style.fontSize = `${String(t)}%`;
        }, text);
      await tab(page, 'progress').tap();
      const chart = page.locator('svg[aria-labelledby="chart-title"]');
      await expect(chart).toBeVisible();
      // Every stop, from the first day to the projection's end, as the keys reach them.
      const seen = await chart.evaluate((svg) => {
        const strip = document.querySelector('section[aria-labelledby="chart-title"] .readout');
        if (!strip) throw new Error('No strip');
        (svg as SVGSVGElement).focus();
        const press = (key: string) =>
          svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        const heights = new Set<number>();
        const tops = new Set<number>();
        press('Home');
        let last = '';
        for (let i = 0; i < 2000 && strip.textContent !== last; i++) {
          last = strip.textContent;
          heights.add(Math.round(strip.getBoundingClientRect().height * 10) / 10);
          tops.add(Math.round(svg.getBoundingClientRect().top * 10) / 10);
          press('ArrowRight');
        }
        return { heights: [...heights], tops: [...tops], end: last };
      });
      expect(seen.end).toContain('estimativa');
      expect(seen.heights).toHaveLength(1);
      expect(seen.tops).toHaveLength(1);
      await check();
    });

    test(`breaks no word in the segmented controls, text ${String(text)}%`, async ({ page }) => {
      await page.goto('/');
      await loadBackup(page);
      if (text !== 100)
        await page.evaluate((t) => {
          document.documentElement.style.fontSize = `${String(t)}%`;
        }, text);
      await tab(page, 'progress').tap();
      await page.locator('#chart-options-button').tap();
      await expect(page.getByRole('dialog')).toBeVisible();
      const segments = page.locator('.segment');
      expect(await segments.count()).toBeGreaterThan(10);
      const problems = await segments.evaluateAll((buttons) =>
        buttons.flatMap((b) => {
          const style = getComputedStyle(b);
          // Each word on one line: a word wider than its button would overflow it instead.
          const words = b.textContent.split(/\s+/).filter(Boolean);
          const range = document.createRange();
          range.selectNodeContents(b);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
          const fits = b.scrollWidth <= b.clientWidth + 1;
          return style.overflowWrap === 'normal' && fits && lines.size <= words.length
            ? []
            : [`${b.textContent}: ${String(lines.size)} lines, fits ${String(fits)}`];
        }),
      );
      expect(problems).toEqual([]);
    });
  }
});
