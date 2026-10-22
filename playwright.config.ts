/// <reference types="node" />
// End-to-end tests (e2e/), run against `vite preview` of the build, in Chromium. `npm run e2e`
// builds first. Set PW_CHROMIUM_PATH to use a Chromium already on the machine instead of the one
// `npx playwright install chromium` downloads (CI installs its own).
//
// Three projects (docs/ux/design.md, story 7):
// - `desktop`, 1280 × 900 with a mouse: the one page, the website's own flows (backup, paste,
//   language, offline, deploys, updates) and axe;
// - `phone`, 390 × 844 with touch: the tabs and sheets (phone.spec.ts), the fit test (fit.spec.ts)
//   and axe;
// - `ios`, the same phone on the iPhone app's build (dist-ios/, from `npm run build:ios`): the fit
//   test's screens only, as the app's texts, its groups and its band under the status bar are what
//   differ. It runs when dist-ios/ is built, and always in CI, which builds it.
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Unusual ports, never reused: the tests must run against this build, not a server left running.
export const PORT = 47319;
const IOS_PORT = 47326;

const launchOptions = { executablePath: process.env.PW_CHROMIUM_PATH || undefined };

/** An iPhone 12 to 16's screen, touch and a phone's viewport rules. */
const phone = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

/** The specs of one profile only: phone layouts and touch, or the one page's flows. */
const PHONE_ONLY = ['phone.spec.ts', 'fit.spec.ts'];
const DESKTOP_ONLY = ['app.spec.ts', 'deploy.spec.ts', 'offline.spec.ts', 'update.spec.ts'];

const ios = existsSync('dist-ios/index.html') || Boolean(process.env.CI);
// Said once, by the runner (its workers load this file too).
if (!ios && process.env.TEST_WORKER_INDEX === undefined)
  console.log("The ios project is left out: build the iPhone app's pages with npm run build:ios.");

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: PHONE_ONLY,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions },
    },
    {
      name: 'phone',
      testIgnore: DESKTOP_ONLY,
      use: { ...phone, launchOptions },
    },
    ...(ios
      ? [
          {
            name: 'ios',
            testMatch: 'fit.spec.ts',
            // The screens' fit; the first screen and focus order are the website's, tested in `phone`.
            grepInvert: /first screen|focused control/,
            use: { ...phone, launchOptions, baseURL: `http://localhost:${String(IOS_PORT)}` },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `npx vite preview --port ${String(PORT)} --strictPort`,
      url: `http://localhost:${String(PORT)}`,
      reuseExistingServer: false,
    },
    ...(ios
      ? [
          {
            command: `npx vite preview --outDir dist-ios --port ${String(IOS_PORT)} --strictPort`,
            url: `http://localhost:${String(IOS_PORT)}`,
            reuseExistingServer: false,
          },
        ]
      : []),
  ],
});
