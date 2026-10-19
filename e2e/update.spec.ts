/**
 * A new version: the site is served from a copy of the build, the copy's worker is changed (as a
 * deploy would), and the open page offers the new version; Reload switches to it, the data intact.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { previewServer, watch } from './helpers';

// Weights in kg, as in Britain.
test.use({ locale: 'en-GB' });

test('offers a new version, and Reload switches to it', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'weigh-to-go-'));
  cpSync(fileURLToPath(new URL('../dist', import.meta.url)), dir, { recursive: true });
  const server = await previewServer(47321, dir);
  try {
    const { check } = await watch(page);
    await page.goto(`${server.url}/`);
    await page.locator('#entry-date').fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    await page.locator('#entry-weight').fill('81.2');
    await page.locator('#entry-weight').press('Enter');
    await expect(page.locator('#entry-status')).toContainText('81.2 kg');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const before = await page.evaluate(async () => (await caches.keys()).join());

    // "Deploy" a new version: a worker with another cache name.
    const sw = join(dir, 'sw.js');
    writeFileSync(sw, readFileSync(sw, 'utf8').replace(/weigh-to-go-[0-9a-f]+/, 'weigh-to-go-next0000000'));
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())?.update();
    });
    const notice = page.locator('.update-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Your weigh-ins stay where they are.');
    const reloaded = page.waitForEvent('load');
    await notice.getByRole('button', { name: 'Reload' }).click();
    await reloaded;

    // The page reloads under the new worker, whose cache replaced the old one.
    await expect
      .poll(() => page.evaluate(async () => (await caches.keys()).join()))
      .toBe('weigh-to-go-next0000000');
    expect(before).not.toBe('weigh-to-go-next0000000');
    await expect(notice).toBeHidden();
    await expect(page.locator('section[aria-labelledby="log-title"] tbody')).toContainText('81.2');
    server.alive();
    await check();
  } finally {
    server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
