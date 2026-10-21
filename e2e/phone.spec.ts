/**
 * The diary on a phone (390 × 844, touch): the tabs, Back, the current tab chosen again, the
 * weigh-in's Undo, the bar stepping aside while typing, and the app's band under the status bar,
 * which only the iPhone app's build shows.
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

test('shows no band for the app’s banner on the website', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav.tabs a')).toHaveCount(4);
  await expect(page.locator('html')).not.toHaveClass(/in-app/);
  await expect(page.locator('.ad-space')).toHaveCount(0);
});

test('has the band under the status bar in the iPhone app’s build', async ({ page }) => {
  test.skip(!existsSync('dist-ios/index.html'), 'The iPhone app is built with npm run build:ios.');
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
