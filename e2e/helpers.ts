/**
 * What the end-to-end tests share: a made-up year of weigh-ins as a backup file, loading it through
 * the page, a watch on console errors and policy violations, and a preview server of their own for
 * the test that stops it.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

/** A made-up year: a slow loss with daily noise and a few days skipped, ending yesterday. */
export function yearBackup(days = 365): Buffer {
  let seed = 11;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const end =
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) - 86_400_000;
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
    exportedAt: new Date().toISOString(),
    weighIns,
    profile: { goalKg: 92, heightCm: 176 },
  };
  return Buffer.from(JSON.stringify(backup));
}

/** Loads a backup through the page's own import, added to what is there. */
export async function loadBackup(page: Page, buffer = yearBackup()): Promise<void> {
  await page
    .locator('#data-file')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer });
  await page
    .locator('section[aria-labelledby="data-title"] button')
    .filter({ hasText: /^(Add to what is here|Juntar ao que está aqui)$/ })
    .click();
  await expect(page.locator('#pct-title')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="log-title"] tbody tr').first()).toBeVisible();
}

/**
 * Watches a page for console errors, uncaught errors and Content Security Policy (and Trusted
 * Types) violations; `check` fails the test if there were any. Call before the first navigation.
 */
export async function watch(page: Page): Promise<{ check: () => Promise<void> }> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`page: ${error.message}`));
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { violations: string[] }).violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
  return {
    check: async () => {
      const violations = await page.evaluate(
        () => (window as unknown as { violations?: string[] }).violations ?? [],
      );
      expect([...problems, ...violations.map((v) => `CSP: ${v}`)]).toEqual([]);
    },
  };
}

/** A preview server of the build on `port`, that a test can stop (to be offline for real). */
export async function previewServer(port: number): Promise<{ url: string; stop: () => void }> {
  const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const child = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort'], {
    stdio: 'ignore',
  });
  const url = `http://localhost:${String(port)}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill() };
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`The preview server didn't start on ${url}`);
}
