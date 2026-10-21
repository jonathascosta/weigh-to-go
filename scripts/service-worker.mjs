// The service worker, written at build time so it knows the hashed file names. It keeps the site
// working offline and does nothing else: same-origin requests only, answered from its cache or the
// network, never anything sent elsewhere (the page's policy has connect-src 'none'; the worker
// isn't under the page's policy, so this file is where that promise is kept).
//
// - Pages: the network first, so a deploy shows at once; offline, or after 3 seconds without an
//   answer, this version's precached page (the Portuguese one for /pt paths, else the English
//   one). Nothing is cached at run time: each deploy brings a new worker with its own precache.
// - Everything else it precached (hashed names never change): the cache first, the network if the
//   cache has nothing or fails.
// - A failed install deletes the cache it was filling.
// - On activate, caches of older versions are deleted. A new version waits until the page asks it
//   to take over (the "A new version is ready" notice), so a page never runs half old, half new.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** How long a page may take from the network before the worker shows its cached copy. */
export const NETWORK_TIMEOUT_MS = 3000;

/** The worker's file and URL; the only URL the page's Trusted Types policy lets it register. */
export const WORKER_FILE = 'sw.js';
/** Caches this worker made are named with this prefix and a version. */
export const CACHE_PREFIX = 'weigh-to-go-';

/** Font subsets kept offline: the Latin ones the two languages use. */
const FONT_SUBSETS = /-(latin|latin-ext)-\d{3}-normal-[\w-]+\.woff2$/;

/**
 * The URLs to precache, from the built files' paths (relative to dist/, with forward slashes): the
 * pages as they are served (so the privacy policy opens offline too), the scripts, styles, manifests and icons, and the Latin fonts as woff2
 * (every browser that runs a service worker reads woff2).
 * @param {readonly string[]} files
 * @returns {string[]}
 */
export function precacheList(files) {
  const urls = [];
  for (const file of files) {
    if (file === 'index.html') urls.push('/');
    else if (file.endsWith('/index.html')) urls.push(`/${file.slice(0, -'index.html'.length)}`);
    // The other pages (the 404 page, the privacy policy) by their own names.
    else if (/^[\w-]+(?:\/[\w-]+)*\.html$/.test(file)) urls.push(`/${file}`);
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
  // Fresh copies, not the browser's HTTP cache: a page and its assets must match. A failed install
  // leaves no half-filled cache behind.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .catch((error) => caches.delete(CACHE).then(() => Promise.reject(error))),
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

/** How long a page may take from the network before the cached one is shown instead. */
const NETWORK_TIMEOUT_MS = ${String(NETWORK_TIMEOUT_MS)};

/**
 * The cached page for a navigation: its own, else the diary in its language. From this version's
 * cache only, never another version's: a page must match this version's code.
 */
function cachedPage(request, url) {
  const page = url.pathname === '/pt' || url.pathname.startsWith('/pt/') ? '/pt/' : '/';
  return caches
    .open(CACHE)
    .then((cache) =>
      cache
        .match(request, { ignoreSearch: true, ignoreVary: true })
        .then((hit) => hit || cache.match(page, { ignoreVary: true })),
    );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Only this site's own GETs; anything else goes on untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Nothing is written at run time: the cached pages are this version's own precache, which
    // matches its cached code. A page from the network may belong to a newer deploy (or be a
    // captive portal's); storing it here would pair new HTML with this version's old assets.
    const network = fetch(request);
    event.respondWith(
      new Promise((resolve, reject) => {
        let done = false;
        const answer = (response) => {
          if (done) return;
          done = true;
          resolve(response);
        };
        // A slow network: the cached page after a few seconds, if there is one.
        const timer = setTimeout(() => {
          cachedPage(request, url).then((hit) => hit && answer(hit), () => undefined);
        }, NETWORK_TIMEOUT_MS);
        network.then(
          (response) => {
            clearTimeout(timer);
            answer(response);
          },
          (error) => {
            clearTimeout(timer);
            cachedPage(request, url).then(
              (hit) => (hit ? answer(hit) : done || reject(error)),
              () => done || reject(error),
            );
          },
        );
      }),
    );
    return;
  }
  // ignoreVary: a server may answer with "Vary: Origin", and a module script is asked for with an
  // Origin; the cache holds only this site's own files, so the header changes nothing here. If the
  // cache itself fails, the network answers.
  event.respondWith(
    caches
      .match(request, { ignoreVary: true })
      .then((hit) => hit || fetch(request))
      .catch(() => fetch(request)),
  );
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
