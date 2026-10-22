/**
 * The diary on a phone (390 × 844, touch): the tabs, Back, the current tab chosen again, the
 * weigh-in's Undo, the bar stepping aside while typing, Today's three figures and sparkline, the
 * chart's Layers sheet, a finger dragged along the chart, the analysis cards (opened, their
 * options, their chart under a finger), Your data (the log, a day changed and deleted with Undo,
 * erasing, the settings and their fit at 320 px), and the app's band under the status bar, which
 * only the iPhone app's build shows.
 */
import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { loadBackup, previewServer, watch } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'en-GB' });

const tab = (page: Page, view: string) => page.locator(`nav.tabs a[href="#${view}"]`);

/**
 * Taps an element where it is: a card's line, which the head's button covers (its whole head is the
 * target), so Playwright's own tap would refuse it.
 */
const tapOn = async (page: Page, selector: string) => {
  const target = page.locator(selector);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`No ${selector}`);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
};

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
  // Closed, the cards make a short page: scrolled as far as it goes.
  await page.evaluate(() => {
    window.scrollTo(0, 2000);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
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

test('opens an analysis card from its line, and its options in a sheet', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'analysis').tap();
  const toggle = page.locator('#pct-toggle');
  // Closed to its line: the button named by the title, described by the line.
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('button', { name: 'Percentage loss', exact: true })).toBeVisible();
  await expect(page.locator('#pct-sum')).toContainText('lost');
  await expect(page.locator('#pct-body')).toBeHidden();
  // The whole head is the target: a tap on the line opens it.
  await tapOn(page, '#pct-sum');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('svg[aria-labelledby="pct-title"]')).toBeVisible();
  const button = page.locator('#pct-options-button');
  await expect(button).toHaveText('Options: Essential');
  await button.tap();
  const sheet = page.getByRole('dialog', { name: 'Options: Percentage loss' });
  await expect(sheet).toBeVisible();
  await expect(page.locator('#sheet-title')).toBeFocused();
  await sheet.getByRole('button', { name: 'Milestones table' }).tap();
  await expect(button).toHaveText('Options: Custom');
  await page.getByRole('button', { name: 'Done' }).first().tap();
  await expect(sheet).toBeHidden();
  await expect(button).toBeFocused();
  await expect(page.locator('#pct-ms-title')).toBeVisible();
  // The hiccups' rules are a sheet of their own.
  await tapOn(page, '#hiccups-sum');
  await page.locator('#hiccups-options-button').tap();
  await expect(page.getByRole('dialog', { name: 'Hiccup rules' })).toBeVisible();
  await page.keyboard.press('Escape');
  // The head closes it again.
  await tapOn(page, '#pct-sum');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // Every control in a sheet is a finger's target, 44 px tall at least (the height's fields; its
  // unit is in Your data's settings now).
  await tapOn(page, '#bmi-sum');
  await page.locator('#bmi-change-button').tap();
  await expect(page.getByRole('dialog', { name: 'Change height' })).toBeVisible();
  const sizes = await page.locator('.sheet input, .sheet button').evaluateAll((els) =>
    els
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0)
      .map((r) => [r.width, r.height]),
  );
  expect(sizes.length).toBeGreaterThan(2);
  for (const [w, h] of sizes) expect(Math.min(w ?? 0, h ?? 0)).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await check();
});

test('scrubs a card’s chart under a dragged finger, its readout still', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'analysis').tap();
  await tapOn(page, '#pct-sum');
  const chart = page.locator('svg[aria-labelledby="pct-title"]');
  const readout = page.locator('section[aria-labelledby="pct-title"] .readout').first();
  await chart.scrollIntoViewIfNeeded();
  await expect(readout).toContainText('last weigh-in');
  const box = await chart.boundingBox();
  if (!box) throw new Error('No chart');
  const stripBefore = await readout.boundingBox();
  const touch = await page.context().newCDPSession(page);
  const y = box.y + box.height * 0.5;
  const at = (x: number) => [{ x: box.x + x, y }];
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(box.width * 0.2) });
  const seen = new Set<string>();
  for (let i = 0; i <= 12; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: at(box.width * (0.2 + i * 0.06)),
    });
    seen.add((await readout.textContent()) ?? '');
    expect(await readout.boundingBox()).toEqual(stripBefore);
  }
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(seen.size).toBeGreaterThan(5);
  await expect(page.locator('section[aria-labelledby="pct-title"] .tip').first()).toBeHidden();
  expect(await chart.boundingBox()).toEqual(box);
  await check();
});

test('shows the latest weigh-ins in Your data, and Show all lists more, with no box of its own', async ({
  page,
}) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'data').tap();
  const log = page.locator('section[aria-labelledby="log-title"]');
  await expect(log.locator('tbody tr')).toHaveCount(5);
  await log.getByRole('button', { name: /^Show all/ }).tap();
  await expect(log.locator('tbody tr')).toHaveCount(55);
  // The rows are the page's: nothing scrolls inside it.
  const box = await page.locator('#log-table-box').evaluate((el) => ({
    overflow: getComputedStyle(el).overflowY,
    fits: el.scrollHeight <= el.clientHeight + 1,
  }));
  expect(box).toEqual({ overflow: 'visible', fits: true });
  // Rows, the settings and Erase are a finger's targets.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('#view-data button, #view-data a[href], #view-data select')]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1 && el.closest('.about') === null && !el.matches('.link');
      })
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 44 || r.width < 44;
      })
      .map((el) => `${el.tagName} ${el.textContent}`),
  );
  expect(small).toEqual([]);
  await check();
});

test('changes and deletes a day in its sheet, each with Undo that puts it back', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'data').tap();
  const first = page.locator('tbody button[data-role="day"]').first();
  const day = await first.getAttribute('data-day');
  const weight = page.locator('tbody tr').first().locator('td').first();
  const was = await weight.textContent();
  // The whole row opens the sheet, at the weight cell too.
  await weight.tap();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#sheet-title')).toBeFocused();
  await expect(page.locator('#day-weight')).toHaveValue(was ?? '');
  // Delete stands 28 px below Save.
  const gap = await page.evaluate(() => {
    const rectOf = (q: string) => (document.querySelector(q) ?? document.body).getBoundingClientRect();
    const save = rectOf('.day-sheet button[type=submit]');
    const del = rectOf('#day-delete');
    return del.top - save.bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(28);
  await page.locator('#day-weight').fill('99.9');
  await sheet.getByRole('button', { name: 'Save' }).tap();
  await expect(sheet).toBeHidden();
  const toast = page.locator('.toast');
  await expect(toast).toContainText('Updated: 99.9 kg');
  await expect(weight).toHaveText('99.9');
  // Above the tab bar, on screen.
  const above = await page.evaluate(() => {
    const rectOf = (q: string) => (document.querySelector(q) ?? document.body).getBoundingClientRect();
    const t = rectOf('.toast');
    const bar = rectOf('nav.tabs');
    return t.bottom <= bar.top && t.top >= 0;
  });
  expect(above).toBe(true);
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(toast).toContainText('Undone.');
  await expect(weight).toHaveText(was ?? '');

  await page.locator(`tbody button[data-day="${day ?? ''}"]`).tap();
  await page.locator('#day-delete').tap();
  await expect(toast).toContainText('Deleted the weigh-in of');
  await expect(page.locator(`tbody button[data-day="${day ?? ''}"]`)).toHaveCount(0);
  await expect(page.locator('.toast-text')).toBeFocused();
  await toast.getByRole('button', { name: 'Undo' }).tap();
  await expect(page.locator(`tbody button[data-day="${day ?? ''}"]`)).toHaveCount(1);
  await check();
});

test('erases everything from a sheet whose Cancel comes first, Erase apart from it', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'data').tap();
  const erase = page.locator('#data-erase');
  // Alone at the bottom: 20 px or more from anything else.
  const room = await erase.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const before = (el.parentElement?.previousElementSibling ?? el).getBoundingClientRect();
    return r.top - before.bottom;
  });
  expect(room).toBeGreaterThanOrEqual(20);
  await erase.tap();
  const sheet = page.getByRole('dialog', { name: 'Erase everything' });
  await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeFocused();
  const apart = await page.evaluate(() => {
    const rectOf = (q: string) => (document.querySelector(q) ?? document.body).getBoundingClientRect();
    const cancel = rectOf('#erase-cancel');
    const confirm = rectOf('#erase-confirm');
    return { gap: confirm.top - cancel.bottom, height: confirm.height };
  });
  expect(apart.gap).toBeGreaterThanOrEqual(16);
  expect(apart.height).toBeGreaterThanOrEqual(44);
  await sheet.getByRole('button', { name: 'Cancel' }).tap();
  await expect(sheet).toBeHidden();
  await expect(erase).toBeFocused();
  await erase.tap();
  await page.locator('#erase-confirm').tap();
  await expect(page.locator('.erase-status')).toHaveText('Everything was erased.');
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText('No weigh-ins yet.');
  await check();
});

test('sets the language, the units and the sections from Your data', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  await tab(page, 'data').tap();
  // The select lies over its row: the row is the target.
  const row = await page.locator('#setting-height').evaluate((el) => {
    const s = el.getBoundingClientRect();
    const r = (el.closest('.row') ?? el).getBoundingClientRect();
    return {
      covers: s.top <= r.top + 1 && s.bottom >= r.bottom - 1 && s.width >= r.width - 1,
      height: r.height,
    };
  });
  expect(row.covers).toBe(true);
  expect(row.height).toBeGreaterThanOrEqual(52);
  await page.locator('#setting-height').selectOption('cm');
  await expect(page.locator('#settings-height')).toContainText('176 cm');
  await page.locator('#setting-weight').selectOption('lb');
  await expect(page.locator('#settings-goal')).toContainText('lb');
  await page.locator('#sections-panel-button').tap();
  const sheet = page.getByRole('dialog', { name: 'Sections' });
  await sheet.getByRole('button', { name: 'Calendar' }).tap();
  await sheet.getByRole('button', { name: 'Done' }).first().tap();
  await expect(page.locator('#sections-panel-button')).toContainText('12 of 13 shown');
  await page.locator('#setting-lang').selectOption('pt');
  await expect(page.locator('#view-data-title')).toHaveText('Seus dados');
  // The footer's words are in About on a phone.
  await expect(page.locator('.site-footer')).toBeHidden();
  await expect(page.locator('#about-policy')).toHaveAttribute('href', '/pt/privacidade.html');
  await check();
});

test('keeps the Goal on an empty Progress, under the card that says what comes', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/#progress');
  await expect(page.locator('#progress-empty')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="goal-title"]')).toBeVisible();
  await expect(page.locator('#goal-change-button')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="chart-title"]')).toBeHidden();
  await check();
});

test.describe('held sideways', () => {
  for (const size of [
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ])
    test(`keeps a card chart and its strip on one screen at ${String(size.width)} × ${String(size.height)}`, async ({
      page,
    }) => {
      const { check } = await watch(page);
      await page.setViewportSize(size);
      await page.goto('/');
      await loadBackup(page);
      await tab(page, 'analysis').tap();
      for (const id of ['pct', 'hiccups', 'variation']) {
        await tapOn(page, `#${id}-sum`);
        const svg = page.locator(`svg[aria-labelledby="${id}-title"]`);
        await svg.scrollIntoViewIfNeeded();
        const fits = await svg.evaluate((el) => {
          const strip = el.closest('.plot')?.querySelector('.readout');
          if (!strip) throw new Error('No strip');
          const tab = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tab-h')) || 0;
          return (
            el.getBoundingClientRect().bottom - strip.getBoundingClientRect().top <= window.innerHeight - tab
          );
        });
        expect(fits, id).toBe(true);
      }
      await check();
    });
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

  test('keeps Your data, its sheets and its notice inside the screen, text 150%', async ({ page }) => {
    const { check } = await watch(page);
    await page.goto('/pt/');
    await loadBackup(page);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '150%';
    });
    await tab(page, 'data').tap();
    /** Nothing sideways, and no element's content wider than its box (SVG and hidden text aside). */
    const fits = () =>
      page.evaluate(() => {
        const wide = [...document.querySelectorAll('body *')]
          .filter((el) => {
            // The tab bar's icons are the shell's, checked by story 7's fit test.
            if (el instanceof SVGElement || el.closest('.visually-hidden, [hidden], select, nav.tabs'))
              return false;
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            return r.right > 320.5 || el.scrollWidth > el.clientWidth + 1;
          })
          .map((el) => `${el.tagName}.${el.className}`);
        return { width: document.documentElement.scrollWidth, wide: wide.slice(0, 5) };
      });
    expect(await fits()).toEqual({ width: 320, wide: [] });
    await page.locator('tbody button[data-role="day"]').first().tap();
    expect(await fits()).toEqual({ width: 320, wide: [] });
    await page.locator('#day-delete').tap();
    await expect(page.locator('.toast')).toBeVisible();
    expect(await fits()).toEqual({ width: 320, wide: [] });
    await page.locator('#sections-panel-button').tap();
    expect(await fits()).toEqual({ width: 320, wide: [] });
    await page.keyboard.press('Escape');
    await page.locator('#data-erase').tap();
    expect(await fits()).toEqual({ width: 320, wide: [] });
    await check();
  });

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

    test(`opens every analysis card with nothing sideways and every strip one height, text ${String(text)}%`, async ({
      page,
    }) => {
      const { check } = await watch(page);
      await page.goto('/');
      await loadBackup(page);
      if (text !== 100)
        await page.evaluate((t) => {
          document.documentElement.style.fontSize = `${String(t)}%`;
        }, text);
      await tab(page, 'analysis').tap();
      for (const id of ['pct', 'rate', 'hiccups', 'bmi', 'facts', 'variation', 'weekdays', 'calendar'])
        await page.locator(`#${id}-toggle`).click();
      await expect(page.locator('svg[aria-labelledby="calendar-title"]')).toBeVisible();
      // The compound rate at Detailed too: its curve and the simulator's table.
      await page.locator('#rate-options-button').click();
      await page.getByRole('dialog').getByRole('button', { name: 'Detalhado', exact: true }).click();
      await page.locator('.sheet-head button').click();
      await expect(page.locator('#sim-title')).toBeVisible();
      const result = await page.evaluate(() => {
        const charts = [...document.querySelectorAll<SVGSVGElement>('#view-analysis svg.chart-svg')];
        const heights = charts.map((svg) => {
          const strip = svg.closest('.plot')?.querySelector('.readout');
          if (!strip) throw new Error('No strip');
          svg.focus();
          const press = (key: string) =>
            svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
          const seen = new Set<number>();
          press('Home');
          let last = '';
          for (let i = 0; i < 2000 && strip.textContent !== last; i++) {
            last = strip.textContent;
            seen.add(Math.round(strip.getBoundingClientRect().height));
            press(svg.getAttribute('aria-labelledby') === 'weekdays-title' ? 'ArrowDown' : 'ArrowRight');
          }
          return [...seen].map((h) => ({ id: svg.getAttribute('aria-labelledby') ?? '', h }));
        });
        return { width: document.documentElement.scrollWidth, heights };
      });
      expect(result.width).toBe(320);
      expect(result.heights.length).toBeGreaterThan(4);
      for (const h of result.heights) expect(h, h[0]?.id).toHaveLength(1);
      // Within the design's height at this size (§6: 98 px at 150% in Portuguese), the % and rate
      // strips a line more.
      for (const { id, h } of result.heights.flat())
        expect(h, id).toBeLessThanOrEqual(text === 100 ? 70 : 130);
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
