/**
 * Offline: once the service worker has the site, it works with the server gone, its weigh-ins
 * still there (they live in the browser), an unknown page falls back to the diary, and only the
 * Latin fonts were stored.
 */
import { expect, test } from '@playwright/test';
import { loadBackup, previewServer, watch } from './helpers';

// Weights in kg, as in Britain.
test.use({ locale: 'en-GB' });

test('works offline once the service worker has the site', async ({ page }) => {
  // A server of this test's own, so it can be stopped: being offline for real, the worker's own
  // requests included.
  const server = await previewServer(4180);
  try {
    const { check } = await watch(page);
    await page.goto(`${server.url}/pt/`);
    await loadBackup(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    const rows = await page.locator('section[aria-labelledby="log-title"] tbody tr').count();
    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names)
        for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      return { names, urls };
    });
    expect(cached.names).toHaveLength(1);
    expect(cached.names[0]).toMatch(/^weigh-to-go-/);
    const fonts = cached.urls.filter((url) => url.endsWith('.woff2'));
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((url) => /-(latin|latin-ext)-\d{3}-normal-/.test(url))).toBe(true);

    server.stop();
    await page.reload();
    await expect(page.locator('#intro-title')).toHaveText('Seu diário de peso, no seu aparelho');
    await expect(page.locator('section[aria-labelledby="log-title"] tbody tr')).toHaveCount(rows);
    // A page never visited falls back to the diary in its language.
    await page.goto(`${server.url}/pt/qualquer-coisa`);
    await expect(page.locator('#intro-title')).toHaveText('Seu diário de peso, no seu aparelho');
    await page.goto(`${server.url}/`);
    await expect(page.locator('#intro-title')).toHaveText('Your weight diary, on your device');

    // A weigh-in logged offline is kept (it never needed the network), and is there after a reload.
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await page.locator('#entry-date').fill(yesterday);
    await page.locator('#entry-weight').fill('77.7');
    await page.locator('#entry-weight').press('Enter');
    await expect(page.locator('#entry-status')).toContainText('77.7 kg');
    await page.reload();
    await expect(page.locator('section[aria-labelledby="log-title"] tbody tr').first()).toContainText('77.7');
    await check();
  } finally {
    server.stop();
  }
});
