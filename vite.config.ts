/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { devPolicy, injectPolicy } from './scripts/csp.mjs';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// The policy goes into every page, built or served: the dev server gets the same one except that its
// live reload may open a WebSocket, so Trusted Types and style mistakes show up while developing.
function securityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    transformIndexHtml: (html, context) => injectPolicy(html, context.server ? devPolicy : undefined),
  };
}

export default defineConfig({
  // Like GitHub Pages: each page is its own file, and an unknown path is no page (not the home one).
  appType: 'mpa',
  plugins: [securityPolicy()],
  build: {
    // Keep every asset a file of its own: the policy above has no data: sources.
    assetsInlineLimit: 0,
    // The polyfill loads modules with fetch(), which connect-src 'none' blocks; every browser the
    // site supports has native modulepreload.
    modulePreload: { polyfill: false },
    rolldownOptions: {
      input: { home: 'index.html', notFound: '404.html' },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
  },
});
