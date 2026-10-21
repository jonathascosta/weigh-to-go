/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { devPolicy, injectPolicy } from './scripts/csp.mjs';
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

// `vite build --mode ios` is the iPhone app's build (docs/sprint-3.md): the same pages into dist-ios/,
// which Capacitor copies into the Xcode project, without the service worker (it doesn't run in
// Capacitor's web view, and the app's files are on the phone already).
export default defineConfig(({ mode }) => ({
  // Like GitHub Pages: each page is its own file, and an unknown path is no page (not the home one).
  appType: 'mpa',
  plugins: mode === 'ios' ? [securityPolicy()] : [securityPolicy(), serviceWorker()],
  build: {
    outDir: mode === 'ios' ? 'dist-ios' : 'dist',
    // Keep every asset a file of its own: the policy above has no data: sources.
    assetsInlineLimit: 0,
    // The polyfill loads modules with fetch(), which connect-src 'none' blocks; every browser the
    // site supports has native modulepreload.
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: { home: 'index.html', homePt: 'pt/index.html', notFound: '404.html' },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs', 'scripts/**/*.test.ts'],
  },
}));
