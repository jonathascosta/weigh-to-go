/**
 * axe on every page, with a year of weigh-ins loaded, in light and dark, on a desktop and a phone.
 * Any violation fails the test, with what and where.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadBackup } from './helpers';

const sizes = [
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
  { name: 'phone', viewport: { width: 360, height: 780 } },
] as const;

const STATIC_PAGES = new Set(['/404.html', '/privacy.html', '/pt/privacidade.html']);

for (const path of ['/', '/pt/', ...STATIC_PAGES]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    for (const size of sizes) {
      test(`${path} has no axe violations (${colorScheme}, ${size.name})`, async ({ browser }) => {
        const context = await browser.newContext({ colorScheme, viewport: size.viewport, locale: 'en-US' });
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.locator('body')).toHaveClass(/frame-checked/);
        if (!STATIC_PAGES.has(path)) await loadBackup(page);
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
          .analyze();
        const found = results.violations.map((v) => ({
          rule: v.id,
          impact: v.impact,
          where: v.nodes
            .slice(0, 5)
            .map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
        }));
        expect(found).toEqual([]);
        await context.close();
      });
    }
  }
}

// On a phone, Progress (the summary, the chart and its strip) and the chart's options sheet.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`Progress and the chart's options sheet have no axe violations (${colorScheme}, phone)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme,
      viewport: { width: 360, height: 780 },
      hasTouch: true,
      isMobile: true,
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/frame-checked/);
    await loadBackup(page);
    await page.locator('nav.tabs a[href="#progress"]').click();
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      return results.violations.map((v) => ({
        rule: v.id,
        where: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
    };
    expect(await scan()).toEqual([]);
    await page.locator('#chart-options-button').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await scan()).toEqual([]);
    await context.close();
  });
}

// On a phone, Your data with its rows, then the day sheet and the erase sheet.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`Your data, the day sheet and the erase sheet have no axe violations (${colorScheme}, phone)`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      colorScheme,
      viewport: { width: 360, height: 780 },
      hasTouch: true,
      isMobile: true,
      locale: 'en-US',
    });
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.locator('body')).toHaveClass(/frame-checked/);
    await loadBackup(page);
    await page.locator('nav.tabs a[href="#data"]').click();
    const scan = async () => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();
      return results.violations.map((v) => ({
        rule: v.id,
        where: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
      }));
    };
    expect(await scan()).toEqual([]);
    await page.locator('tbody button[data-role="day"]').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await scan()).toEqual([]);
    await page.keyboard.press('Escape');
    await page.locator('#data-erase').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await scan()).toEqual([]);
    await context.close();
  });
}
