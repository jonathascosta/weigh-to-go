import { describe, expect, it, vi } from 'vitest';
import { CACHE_PREFIX, NETWORK_TIMEOUT_MS, precacheList, workerSource } from './service-worker.mjs';

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

interface Body {
  readonly ok: boolean;
  readonly body: string;
  clone?: () => Body;
}
type Network = (path: string) => Promise<Body>;
type Handler = (event: Record<string, unknown>) => void;
interface Requestish {
  readonly url: string;
}

/**
 * The worker run in a stand-in for its scope: `caches` over a Map, a `fetch` the test answers, and
 * events whose respondWith and waitUntil promises the test can await.
 */
function runWorker(network: Network, urls = ['/', '/pt/', '/404.html', '/assets/main.js']) {
  const store = new Map<string, Body>();
  let broken = false;
  const names = new Set<string>();
  const key = (request: string | Requestish) =>
    typeof request === 'string' ? request : new URL(request.url).pathname;
  const cache = {
    addAll: async (requests: Requestish[]) => {
      for (const r of requests) {
        const response = await network(key(r));
        if (!response.ok) throw new TypeError('bad response');
        store.set(key(r), response);
      }
    },
    put: (request: string | Requestish, response: Body) => {
      store.set(key(request), response);
      return Promise.resolve();
    },
  };
  const caches = {
    open: (name: string) => {
      names.add(name);
      return Promise.resolve(cache);
    },
    delete: (name: string) => Promise.resolve(names.delete(name)),
    keys: () => Promise.resolve([...names]),
    match: (request: string | Requestish) =>
      broken ? Promise.reject(new Error('cache broken')) : Promise.resolve(store.get(key(request))),
  };
  const handlers: Partial<Record<string, Handler>> = {};
  const self = {
    location: { origin: 'https://site.test' },
    addEventListener: (type: string, handler: Handler) => {
      handlers[type] = handler;
    },
  };
  const fetch = (request: string | Requestish) => network(key(request));
  class Req {
    readonly url: string;
    constructor(url: string) {
      this.url = new URL(url, 'https://site.test').href;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the worker's own source, run in a stand-in scope
  const run = new Function('self', 'caches', 'fetch', 'Request', workerSource('v1', urls)) as (
    ...args: unknown[]
  ) => void;
  run(self, caches, fetch, Req);
  const dispatch = (type: string, fields: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Body> | null = null;
    handlers[type]?.({
      ...fields,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
      respondWith: (p: Promise<Body>) => {
        answer = p;
      },
    });
    return {
      answer: async () => {
        if (!answer) throw new Error('no answer');
        return answer;
      },
      settled: () => Promise.allSettled(waits),
    };
  };
  const request = (mode: string) => (path: string) =>
    dispatch('fetch', { request: { method: 'GET', mode, url: `https://site.test${path}` } });
  return {
    store,
    names,
    install: () => dispatch('install', {}).settled(),
    navigate: request('navigate'),
    get: request('no-cors'),
    breakCache: () => {
      broken = true;
    },
  };
}

const response = (body: string): Body => ({ ok: true, body, clone: () => ({ ok: true, body }) });
const ok = (body: string) => Promise.resolve(response(body));

describe('the worker', () => {
  it('serves pages from the network and keeps the cached copy fresh', async () => {
    let version = 'old';
    const w = runWorker((url) => ok(`${url} ${version}`));
    await w.install();
    version = 'new';
    const { answer, settled } = w.navigate('/');
    expect((await answer()).body).toBe('/ new');
    await settled();
    expect(w.store.get('/')?.body).toBe('/ new');
  });

  it('serves the cached page offline, the Portuguese one for /pt with or without a slash', async () => {
    let online = true;
    const w = runWorker((url) => (online ? ok(`${url} cached`) : Promise.reject(new TypeError('offline'))));
    await w.install();
    online = false;
    expect((await w.navigate('/pt').answer()).body).toBe('/pt/ cached');
    expect((await w.navigate('/pt/qualquer').answer()).body).toBe('/pt/ cached');
    expect((await w.navigate('/somewhere').answer()).body).toBe('/ cached');
  });

  it('shows the cached page when the network is slow, and still refreshes it', async () => {
    vi.useFakeTimers();
    try {
      let arrive: () => void = () => undefined;
      let slow = false;
      const w = runWorker((url) =>
        slow
          ? new Promise<Body>((resolve) => {
              arrive = () => {
                resolve(response(`${url} late`));
              };
            })
          : ok(`${url} cached`),
      );
      await w.install();
      slow = true;
      const { answer, settled } = w.navigate('/');
      await vi.advanceTimersByTimeAsync(NETWORK_TIMEOUT_MS);
      expect((await answer()).body).toBe('/ cached');
      arrive();
      await settled();
      expect(w.store.get('/')?.body).toBe('/ late');
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers assets from the cache, and from the network if the cache fails', async () => {
    const w = runWorker((url) => ok(`${url} network`));
    await w.install();
    w.store.delete('/assets/main.js');
    expect((await w.get('/assets/main.js').answer()).body).toBe('/assets/main.js network');
    w.store.set('/assets/main.js', response('from cache'));
    expect((await w.get('/assets/main.js').answer()).body).toBe('from cache');
    w.breakCache();
    expect((await w.get('/assets/main.js').answer()).body).toBe('/assets/main.js network');
  });

  it('leaves no cache behind when the install fails', async () => {
    const w = runWorker((url) => (url === '/404.html' ? Promise.resolve({ ok: false, body: '' }) : ok(url)));
    const [result] = await w.install();
    expect(result.status).toBe('rejected');
    expect(w.names.size).toBe(0);
  });
});
