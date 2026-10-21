/**
 * The diary end to end, in the built site: logging, pasting, backing up and restoring, the
 * language and units, the main chart's keys, and no errors or policy violations on any page.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loadBackup, watch } from './helpers';

/** A day `n` days before today, as the date field takes it. */
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test.use({ locale: 'en-GB' });

test('logs a weigh-in, and shows it in the summary and the log', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await page.locator('#entry-date').fill(daysAgo(1));
  await page.locator('#entry-weight').fill('82,4');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.locator('#entry-status')).toContainText('Saved: 82.4 kg');
  await expect(page.locator('section[aria-labelledby="log-title"] tbody')).toContainText('82.4');
  await expect(page.locator('.take')).toContainText('First weigh-in logged: 82.4 kg.');
  await check();
});

test('saves an ambiguous paste only after the reader says yes', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await page.getByText('Paste several days at once').click();
  await page.locator('#paste-text').fill('03/04/2025 90\n03/05/2025 89.6');
  await page.getByRole('button', { name: 'Import lines' }).click();
  // Read as day/month (a British reader), and saved only on a yes.
  await expect(page.locator('.paste-result')).toContainText('was read as');
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText('No weigh-ins yet.');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Yes, import' }).click();
  await expect(page.locator('.paste-result')).toContainText('Imported 2 weigh-ins.');
  await expect(page.locator('section[aria-labelledby="log-title"] tbody tr')).toHaveCount(2);
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText('3 Apr 2025');
  await check();
});

test('exports a backup, erases everything, and brings it back by importing', async ({ page }, info) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  const download = page.waitForEvent('download');
  // The data card's button (the backup reminder above has one too).
  const data = page.locator('section[aria-labelledby="data-title"]');
  await data.getByRole('button', { name: 'Export backup' }).click();
  const file = info.outputPath('backup.json');
  await (await download).saveAs(file);
  const saved = JSON.parse(readFileSync(file, 'utf8')) as { app: string; weighIns: unknown[] };
  expect(saved.app).toBe('weigh-to-go');

  await data.getByRole('button', { name: 'Erase everything' }).click();
  // The confirmation starts on Cancel, never on the destructive button.
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.getByRole('button', { name: 'Erase', exact: true }).click();
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText('No weigh-ins yet.');

  await page.locator('#data-file').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace everything' }).click();
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  // Every weigh-in is back: the log shows the newest 100, and says how many there are.
  expect(saved.weighIns.length).toBeGreaterThan(300);
  await expect(page.locator('section[aria-labelledby="log-title"] tbody tr')).toHaveCount(100);
  await expect(page.locator('section[aria-labelledby="log-title"]')).toContainText(
    `Showing the latest 100 of ${String(saved.weighIns.length)}.`,
  );
  await check();
});

test('exports the weigh-ins as a CSV for a spreadsheet', async ({ page }, info) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  const download = page.waitForEvent('download');
  await page
    .locator('section[aria-labelledby="data-title"]')
    .getByRole('button', { name: 'Export CSV' })
    .click();
  const file = info.outputPath('weigh-ins.csv');
  await (await download).saveAs(file);
  // A British reader: a decimal point, so commas between fields; weights in kg.
  const rows = readFileSync(file, 'utf8')
    .replace(/^\uFEFF/, '')
    .trimEnd()
    .split('\r\n');
  expect(rows[0]).toBe('date,weight_kg,change_kg,average_7_days_kg,trend_kg,lost_pct,saved_at');
  expect(rows.length).toBeGreaterThan(300);
  expect(rows[1]).toMatch(/^\d{4}-\d{2}-\d{2},\d+\.\d,,,\d+\.\d{2},0\.00,\d{4}-/);
  await check();
});

test('switches the language and the weight unit', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await page.locator('#entry-weight').fill('');
  await page.locator('#setting-lang').selectOption('pt');
  await expect(page.locator('html')).toHaveAttribute('lang', /^pt/);
  await expect(page.locator('h1')).toHaveText('Seu diário de peso, no seu aparelho');
  await page.locator('#setting-weight').selectOption('lb');
  await expect(page.locator('#entry-unit')).toHaveText('lb');
  // Kept for the next visit.
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Seu diário de peso, no seu aparelho');
  await expect(page.locator('#entry-unit')).toHaveText('lb');
  await check();
});

test('reads the main chart day by day with the keyboard', async ({ page }) => {
  const { check } = await watch(page);
  await page.goto('/');
  await loadBackup(page);
  const chart = page.locator('svg[aria-labelledby="chart-title"]');
  const live = page.locator('section[aria-labelledby="chart-title"] [aria-live]');
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  const lastButOne = await live.textContent();
  expect(lastButOne).toMatch(/: Weight \d+\.\d kg/);
  await page.keyboard.press('Home');
  await expect(live).not.toHaveText(lastButOne ?? '');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('section[aria-labelledby="chart-title"] .tip')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('section[aria-labelledby="chart-title"] .tip')).toBeHidden();
  // Tab moves on from the chart: it is one stop, not a trap.
  await page.keyboard.press('Tab');
  await expect(chart).not.toBeFocused();
  await check();
});

for (const path of ['/', '/pt/', '/404.html']) {
  test(`${path} loads without console errors or policy violations`, async ({ page }) => {
    const { check } = await watch(page);
    await page.goto(path);
    await expect(page.locator('body')).toHaveClass(/frame-checked/);
    await expect(page.locator('h1')).toBeVisible();
    if (path !== '/404.html') await loadBackup(page);
    await check();
  });
}
