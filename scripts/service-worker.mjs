// The service worker, written at build time so it knows the hashed file names. It keeps the site
// working offline and does nothing else: same-origin requests only, answered from its cache or the
// network, never anything sent elsewhere (the page's policy has connect-src 'none'; the worker
// isn't under the page's policy, so this file is where that promise is kept).
//
// - Pages: the network first, so a deploy shows at once; offline, the cached page (the Portuguese
//   one for /pt/ paths, else the English one).
// - Everything else it precached (hashed names never change): the cache first.
// - On activate, caches of older versions are deleted. A new version waits until the page asks it
//   to take over (the "A new version is ready" notice), so a page never runs half old, half new.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** The worker's file and URL; the only URL the page's Trusted Types policy lets it register. */
export const WORKER_FILE = 'sw.js';
/** Caches this worker made are named with this prefix and a version. */
export const CACHE_PREFIX = 'weigh-to-go-';

/** Font subsets kept offline: the Latin ones the two languages use. */
const FONT_SUBSETS = /-(latin|latin-ext)-\d{3}-normal-[\w-]+\.woff2$/;

/**
 * The URLs to precache, from the built files' paths (relative to dist/, with forward slashes): the
 * pages as they are served, the scripts, styles, manifests and icons, and the Latin fonts as woff2
 * (every browser that runs a service worker reads woff2).
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function precacheList(files) {
  const urls = [];
  for (const file of files) {
    if (file === 'index.html') urls.push('/');
    else if (file.endsWith('/index.html')) urls.push(`/${file.slice(0, -'index.html'.length)}`);
    else if (file === '404.html') urls.push('/404.html');
    else if (/^assets\/.+\.(js|css)$/.test(file)) urls.push(`/${file}`);
    else if (/^assets\/.+\.woff2$/.test(file) && FONT_SUBSETS.test(file)) urls.push(`/${file}`);
    else if (/\.webmanifest$/.test(file) || /^icons\/.+\.png$/.test(file) || file === 'favicon.svg')
      urls.push(`/${file}`);
  }
  return urls.sort();
}

/**
 * The worker's source for a version and its precache list.
 * @param {string} version
 * @param {readonly string[]} urls
 * @returns {string}
 */
export function workerSource(version, urls) {
  return `// Weigh to Go's service worker, written by the build (scripts/service-worker.mjs): it keeps the
// site working offline, from its own origin only.
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)};
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  // Fresh copies, not the browser's HTTP cache: a page and its assets must match.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

// A new version waits until the page asks it to take over.
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(${JSON.stringify(CACHE_PREFIX)}) && key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only this site's own GETs; anything else goes on untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    const page = url.pathname.startsWith('/pt/') ? '/pt/' : '/';
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(request, { ignoreSearch: true, ignoreVary: true }).then((hit) => hit || caches.match(page, { ignoreVary: true })),
      ),
    );
    return;
  }
  // ignoreVary: a server may answer with "Vary: Origin", and a module script is asked for with an
  // Origin; the cache holds only this site's own files, so the header changes nothing here.
  event.respondWith(caches.match(request, { ignoreVary: true }).then((hit) => hit || fetch(request)));
});
`;
}

/**
 * Every file under `dir`, relative to it, with forward slashes.
 * @param {string} dir
 * @returns {string[]}
 */
function filesIn(dir) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} at */
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

/**
 * The Vite plugin: once the build is written (public files included), writes dist/sw.js with the
 * precache list and a version from the contents of every file in it, so any change makes a new
 * worker and a fresh cache.
 * @returns {import('vite').Plugin}
 */
export function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'weigh-to-go-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = filesIn(outDir);
      const urls = precacheList(files);
      const hash = createHash('sha256');
      for (const file of files) {
        if (file === WORKER_FILE) continue;
        hash.update(file);
        hash.update(readFileSync(join(outDir, file)));
      }
      writeFileSync(join(outDir, WORKER_FILE), workerSource(hash.digest('hex').slice(0, 12), urls));
    },
  };
}
