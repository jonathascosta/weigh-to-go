/// <reference types="node" />
// End-to-end tests (e2e/), run against `vite preview` of the build, in Chromium. `npm run e2e`
// builds first. Set PW_CHROMIUM_PATH to use a Chromium already on the machine instead of the one
// `npx playwright install chromium` downloads (CI installs its own).
import { defineConfig, devices } from '@playwright/test';

// An unusual port, never reused: the tests must run against this build, not a server left running.
export const PORT = 47319;

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
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
      },
    },
  ],
  webServer: {
    command: `npx vite preview --port ${String(PORT)} --strictPort`,
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: false,
  },
});
