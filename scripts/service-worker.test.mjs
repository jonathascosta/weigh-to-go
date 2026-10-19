import { describe, expect, it } from 'vitest';
import { CACHE_PREFIX, precacheList, workerSource } from './service-worker.mjs';

describe('precacheList', () => {
  it('keeps the pages as served, the code, the manifests, icons and Latin woff2 fonts', () => {
    const files = [
      '404.html',
      'CNAME',
      'assets/barlow-latin-400-normal-a1.woff2',
      'assets/barlow-latin-400-normal-a2.woff',
      'assets/barlow-latin-ext-500-normal-b1.woff2',
      'assets/barlow-cyrillic-400-normal-c1.woff2',
      'assets/barlow-vietnamese-400-normal-d1.woff2',
      'assets/barlow-greek-ext-400-normal-e1.woff2',
      'assets/main-x1.js',
      'assets/i18n-y1.css',
      'favicon.svg',
      'icons/icon-192.png',
      'index.html',
      'manifest.webmanifest',
      'noscript.css',
      'pt/index.html',
      'robots.txt',
      'sitemap.xml',
    ];
    expect(precacheList(files)).toEqual([
      '/',
      '/404.html',
      '/assets/barlow-latin-400-normal-a1.woff2',
      '/assets/barlow-latin-ext-500-normal-b1.woff2',
      '/assets/i18n-y1.css',
      '/assets/main-x1.js',
      '/favicon.svg',
      '/icons/icon-192.png',
      '/manifest.webmanifest',
      '/pt/',
    ]);
  });
});

describe('workerSource', () => {
  const source = workerSource('abc123', ['/', '/pt/']);

  it('names its cache by version and lists what it precaches', () => {
    expect(source).toContain(`const CACHE = "${CACHE_PREFIX}abc123";`);
    expect(source).toContain('const PRECACHE = ["/","/pt/"];');
  });

  it('answers only its own GETs, and waits to be asked before taking over', () => {
    expect(source).toContain("request.method !== 'GET' || url.origin !== self.location.origin");
    expect(source).toContain("if (event.data === 'skip-waiting') self.skipWaiting();");
    expect(source).not.toMatch(/https?:\/\//);
  });
});
