// The App Store's screenshots from the iPhone app's build (docs/STORE.md). For now the one the
// in-app purchase's review asks for (step 5): Your data › iPhone app with Remove ads ready to buy,
// "Buy · {price}", on a 6.9-inch iPhone (1290 × 2796). Sprint 4, story 4 adds the listing's.
//
//   npm run build:ios && npm run store:screenshots
//
// The app's build runs in Chromium with a stand-in for Capacitor's native bridge: StoreKit answers
// "not held" and gives the product at a made-up price, as App Store Connect would. Nothing of
// Google's is started (the build answers no ad unit). Writes
// ios/App/fastlane/screenshots/review/remove-ads.png, committed with the change that moves it.
// Uses PW_CHROMIUM_PATH when set. Serves dist-ios/ with Vite's preview on a free port of its own.
/// <reference lib="dom" />
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'ios/App/fastlane/screenshots/review');
if (!existsSync(join(root, 'dist-ios/index.html'))) {
  console.error('dist-ios/ is missing: run npm run build:ios first.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

/**
 * Runs in the page before the app: Capacitor's native bridge as the iPhone would give it, with the
 * purchase's plugins only. StoreKit holds nothing and sells Remove ads at `price`.
 * @param {{ id: string; price: string }} options
 */
function fakeBridge({ id, price }) {
  /** @param {string} name */
  const promise = (name) => ({ name, rtype: 'promise' });
  const w = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (window));
  w.CapacitorCustomPlatform = { name: 'ios', plugins: {} };
  w.Capacitor = {
    PluginHeaders: [
      {
        name: 'NativePurchases',
        methods: [
          ...['getPurchases', 'getProducts', 'purchaseProduct', 'restorePurchases'].map(promise),
          { name: 'addListener', rtype: 'callback' },
          promise('removeListener'),
        ],
      },
      { name: 'AdSetup', methods: ['build', 'consentChoices', 'canMakePayments'].map(promise) },
    ],
    nativeCallback: () => '1',
    /**
     * @param {string} plugin
     * @param {string} method
     */
    nativePromise: (plugin, method) => {
      if (plugin === 'AdSetup')
        return method === 'canMakePayments'
          ? Promise.resolve({ allowed: true })
          : Promise.resolve({ bannerId: '', sandbox: false, debug: false, appStore: false });
      if (method === 'getPurchases') return Promise.resolve({ purchases: [] });
      if (method === 'getProducts')
        return Promise.resolve({
          products: [{ identifier: id, priceString: price, isFamilyShareable: false }],
        });
      return Promise.resolve({});
    },
  };
}

const server = await preview({
  root,
  mode: 'ios',
  logLevel: 'silent',
  preview: { port: 0, strictPort: true, open: false },
});
try {
  const base = server.resolvedUrls?.local[0];
  if (!base) throw new Error('Vite preview started but gave no local URL.');
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  );
  try {
    // A 6.9-inch iPhone: 430 × 932 points at 3×.
    const context = await browser.newContext({
      viewport: { width: 430, height: 932 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'en-US',
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await page.addInitScript(fakeBridge, { id: 'net.jonathas.weightogo.removeads', price: '$2.99' });
    await page.goto(`${base}#data`);
    const buy = page.locator('#remove-ads-buy');
    await buy.waitFor({ state: 'visible', timeout: 15_000 });
    const label = await buy.textContent();
    if (label !== 'Buy · $2.99') throw new Error(`Remove ads shows “${String(label)}”, not ready to buy.`);
    // Remove ads and Restore purchases in the middle of the screen.
    await page.locator('#remove-ads').evaluate((el) => {
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 280);
    });
    await page.waitForTimeout(300);
    const path = join(out, 'remove-ads.png');
    await page.screenshot({ path });
    console.log(`Wrote ${path}`);
    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  await server.close();
}
