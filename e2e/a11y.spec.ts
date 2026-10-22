/**
 * axe on every page in light and dark, in both projects (playwright.config.ts): the desktop's one
 * page and the phone's views, with a year of weigh-ins loaded and every analysis card open; the
 * sheets (Layers, a card's options, a day, Erase, Sections, Goal, Height, Paste) open over them; the
 * empty diary; and the static pages. Any violation fails the test, with what and where.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { loadBackup } from './helpers';

const STATIC_PAGES = ['/404.html', '/privacy.html', '/pt/privacidade.html'];

/** What axe finds on the page as it is now: each rule broken, and where (the first five places). */
async function scan(page: Page): Promise<{ rule: string; impact: string; where: string[] }[]> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
    .analyze();
  return results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact ?? '',
    where: v.nodes
      .slice(0, 5)
      .map((n) => `${n.target.join(' ')}: ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`),
  }));
}

/** On a phone, a view from its tab; on the one page every view is there already. */
async function show(page: Page, view: string, phone: boolean): Promise<void> {
  if (!phone) return;
  await page.locator(`nav.tabs a[href="#${view}"]`).click();
  await expect(page.locator(`#view-${view}`)).toBeVisible();
}

/** Opens every analysis card. */
async function openCards(page: Page): Promise<void> {
  const toggles = page.locator('#view-analysis .acard-toggle');
  for (let i = 0; i < (await toggles.count()); i++)
    if ((await toggles.nth(i).getAttribute('aria-expanded')) !== 'true') await toggles.nth(i).click();
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme, locale: 'en-US' });

    // English in both themes, Portuguese (its longer words) in dark only: its colours are English's.
    for (const path of colorScheme === 'dark' ? ['/', '/pt/'] : ['/'])
      test(`${path} has no axe violations, with a year of weigh-ins and every card open`, async ({
        page,
        isMobile,
      }) => {
        await page.goto(path);
        await expect(page.locator('body')).toHaveClass(/frame-checked/);
        await loadBackup(page);
        const found: Record<string, unknown> = {};
        for (const view of isMobile ? ['today', 'progress', 'analysis', 'data'] : ['all']) {
          await show(page, view, isMobile);
          if (view === 'analysis' || view === 'all') await openCards(page);
          const problems = await scan(page);
          if (problems.length > 0) found[view] = problems;
        }
        expect(found).toEqual({});
      });

    test('the sheets have no axe violations', async ({ page, isMobile }) => {
      await page.goto('/');
      await expect(page.locator('body')).toHaveClass(/frame-checked/);
      await loadBackup(page);
      const found: Record<string, unknown> = {};
      // Where each opens a sheet: on a phone all of them; on the one page the day, Erase, Goal and
      // Height (the others show in place, which the page's own scan covers).
      const sheets: [string, string, boolean][] = [
        ['progress', '#chart-options-button', false],
        ['analysis', '#rate-options-button', false],
        ['data', 'tbody button[data-role="day"]', true],
        ['data', '#data-erase', true],
        ['data', '#sections-panel-button', false],
        ['data', '#settings-goal', true],
        ['data', '#settings-height', true],
        ['data', '#paste-panel-button', false],
      ];
      for (const [view, opener, everywhere] of sheets) {
        if (!isMobile && !everywhere) continue;
        await show(page, view, isMobile);
        if (view === 'analysis') await openCards(page);
        await page.locator(opener).first().click();
        const sheet = page.locator('.sheet-layer .sheet');
        await expect(sheet).toBeVisible();
        const problems = await scan(page);
        if (problems.length > 0) found[opener] = problems;
        await page.keyboard.press('Escape');
        await expect(sheet).toBeHidden();
      }
      expect(found).toEqual({});
    });

    test('the empty diary has no axe violations', async ({ page, isMobile }) => {
      await page.goto('/');
      await expect(page.locator('#entry-weight')).toBeVisible();
      const found: Record<string, unknown> = {};
      for (const view of isMobile ? ['today', 'progress', 'analysis', 'data'] : ['all']) {
        await show(page, view, isMobile);
        const problems = await scan(page);
        if (problems.length > 0) found[view] = problems;
      }
      expect(found).toEqual({});
    });

    for (const path of STATIC_PAGES)
      test(`${path} has no axe violations`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator('body')).toHaveClass(/frame-checked/);
        expect(await scan(page)).toEqual([]);
      });
  });
}
