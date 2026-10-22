/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { addAppStore, APP_STORE_ID, appStoreUrl } from './scripts/app-store.mjs';
import { devPolicy, injectPolicy } from './scripts/csp.mjs';
import { markInApp } from './scripts/in-app.mjs';
import { serviceWorker } from './scripts/service-worker.mjs';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// The policy goes into every page, built or served: the dev server gets devPolicy (live reload and
// Vite's own <style> elements), so Trusted Types mistakes show up while developing. In dev, Vite puts
// its client script before the charset and the policy; that's expected, the build has no such tag.
function securityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    transformIndexHtml: (html, context) => injectPolicy(html, context.server ? devPolicy : undefined),
  };
}

// The app's pages carry class="in-app" on <html> before the first paint (scripts/in-app.mjs).
function inAppClass(): Plugin {
  return { name: 'in-app-class', transformIndexHtml: (html) => markInApp(html) };
}

// The App Store's Smart App Banner and link (scripts/app-store.mjs): on the website's pages once
// APP_STORE_ID is filled in, never in the app's (it is the app).
function appStore(id: string): Plugin {
  return { name: 'app-store', transformIndexHtml: (html) => addAppStore(html, id) };
}

// `vite build --mode ios` is the iPhone app's build (docs/sprint-3.md): the same pages into dist-ios/,
// which Capacitor copies into the Xcode project, without the service worker (it doesn't run in
// Capacitor's web view, and the app's files are on the phone already).
export default defineConfig(({ mode }) => {
  const appStoreId = mode === 'ios' ? '' : APP_STORE_ID;
  return {
    // Like GitHub Pages: each page is its own file, and an unknown path is no page (not the home one).
    appType: 'mpa',
    plugins:
      mode === 'ios'
        ? [securityPolicy(), inAppClass(), appStore(appStoreId)]
        : [securityPolicy(), serviceWorker(), appStore(appStoreId)],
    build: {
      outDir: mode === 'ios' ? 'dist-ios' : 'dist',
      // Safari 15, the app's deployment target (iOS 15.0), and the website's oldest Safari: Vite's
      // default (about Safari 16.4) leaves syntax 15 can't read, such as media range queries, which
      // its CSS minifier would even write from min-width and max-width. It moves when O22 is decided.
      target: ['es2021', 'safari15'],
      cssTarget: ['safari15'],
      // Keep every asset a file of its own: the policy above has no data: sources.
      assetsInlineLimit: 0,
      // The polyfill loads modules with fetch(), which connect-src 'none' blocks; every browser the
      // site supports has native modulepreload.
      modulePreload: { polyfill: false },
      rolldownOptions: {
        input: {
          home: 'index.html',
          homePt: 'pt/index.html',
          notFound: '404.html',
          privacy: 'privacy.html',
          privacyPt: 'pt/privacidade.html',
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      // The app's App Store page for About on the website; empty in the app's build and until then.
      __APP_STORE_URL__: JSON.stringify(appStoreUrl(appStoreId) ?? ''),
    },
    test: {
      include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'scripts/**/*.test.ts'],
      // Each test file in a process of its own: a time zone set in a test (the reminders' change of
      // clocks) takes effect there, and not in worker threads.
      pool: 'forks',
    },
  };
});
