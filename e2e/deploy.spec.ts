/**
 * After a deploy, the old worker (still in charge until the reader switches) must keep a page and
 * code that match: offline it serves its own precached page, never the newer page it saw online,
 * whose hashed scripts it doesn't have.
 */
import { copyFileSync, cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { previewServer, watch } from './helpers';

test.use({ locale: 'en-GB' });

/**
 * "Deploys" a new version into `dir`: the main script under a new hashed name, and a new worker
 * whose install can't finish (as when the reader goes offline before it has the new files), so no
 * cache has the new script.
 */
function deploy(dir: string): void {
  const old = readdirSync(join(dir, 'assets')).find((f) => /^main-.+\.js$/.test(f));
  if (!old) throw new Error('No main script in the build');
  const next = 'main-deploy2.js';
  copyFileSync(join(dir, 'assets', old), join(dir, 'assets', next));
  rmSync(join(dir, 'assets', old));
  for (const page of ['index.html', 'pt/index.html']) {
    const file = join(dir, page);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll(old, next));
  }
  const sw = join(dir, 'sw.js');
  const source = readFileSync(sw, 'utf8')
    .replaceAll(old, next)
    .replace(/weigh-to-go-[0-9a-f]+/, 'weigh-to-go-deploy2')
    .replace('const PRECACHE = [', 'const PRECACHE = ["/assets/not-there-yet.js",');
  writeFileSync(sw, source);
}

test('after a deploy seen online, the old version still works offline', async ({ page, context }) => {
  const dir = mkdtempSync(join(tmpdir(), 'weigh-to-go-'));
  cpSync(fileURLToPath(new URL('../dist', import.meta.url)), dir, { recursive: true });
  const server = await previewServer(47322, dir);
  try {
    const { check } = await watch(page);
    await page.goto(`${server.url}/`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    // A second tab keeps the old worker in charge, as a reader with the site open twice would.
    const other = await context.newPage();
    await other.goto(`${server.url}/pt/`);

    deploy(dir);
    // Online: the new page, its new script from the network, under the old worker.
    await page.reload();
    await expect(page.locator('#entry-title')).toBeVisible();
    // The new worker tried to install, failed, and left no cache: only the old one remains.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration?.installing ?? registration?.waiting) return 'installing';
          return (await caches.keys()).join();
        }),
      )
      .toMatch(/^weigh-to-go-[0-9a-f]+$/);

    server.stop();
    await page.reload();
    // Offline, the old worker's own page and code: the diary renders.
    await expect(page.locator('#entry-title')).toBeVisible();
    await expect(page.locator('#entry-title')).toHaveText('Log a weigh-in');
    await other.close();
    await check();
  } finally {
    server.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
