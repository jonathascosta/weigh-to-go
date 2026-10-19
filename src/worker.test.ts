import { describe, expect, it, vi } from 'vitest';
import {
  onlyWorkerUrl,
  POLICY_NAME,
  registerWorker,
  SWITCH_TIMEOUT_MS,
  WORKER_URL,
  workerScriptUrl,
  type WorkerHost,
} from './worker';

describe('the Trusted Types policy', () => {
  it('accepts the worker’s URL and nothing else', () => {
    expect(onlyWorkerUrl('/sw.js')).toBe('/sw.js');
    for (const url of ['/sw.js?x', 'https://example.com/sw.js', '/evil.js', '//sw.js', ' /sw.js'])
      expect(() => onlyWorkerUrl(url)).toThrow(TypeError);
  });

  it('is made once, under the name the CSP allows', () => {
    const createPolicy = vi.fn((_name: string, rules: { createScriptURL(url: string): string }) => ({
      createScriptURL: (url: string) => `trusted:${rules.createScriptURL(url)}`,
    }));
    expect(workerScriptUrl({ createPolicy })).toBe('trusted:/sw.js');
    expect(workerScriptUrl({ createPolicy })).toBe('trusted:/sw.js');
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0]?.[0]).toBe(POLICY_NAME);
  });
});

/** A stand-in for the browser's service worker objects. */
function fakeHost(controlled: boolean, waiting: boolean) {
  const listeners: Record<string, (() => void)[]> = {};
  const on = (type: string, listener: () => void) => {
    (listeners[type] ??= []).push(listener);
  };
  const fire = (type: string) => {
    for (const listener of listeners[type] ?? []) listener();
  };
  const worker = (state: string) => ({
    state,
    posted: [] as unknown[],
    postMessage(message: unknown) {
      this.posted.push(message);
    },
    addEventListener: on,
  });
  const waitingWorker = waiting ? worker('installed') : null;
  const registration = {
    waiting: waitingWorker,
    installing: null as ReturnType<typeof worker> | null,
    addEventListener: on,
  };
  const registered: unknown[][] = [];
  const host = {
    controller: controlled ? ({} as ServiceWorker) : null,
    registered,
    register: (url: string, options: RegistrationOptions) => {
      registered.push([url, options]);
      return Promise.resolve(registration as unknown as ServiceWorkerRegistration);
    },
    addEventListener: on,
  };
  return { host: host as WorkerHost & typeof host, registration, fire, worker, waitingWorker };
}

describe('registerWorker', () => {
  it('registers the worker at the root, and says nothing on a first install', async () => {
    const { host, registration, fire, worker } = fakeHost(false, false);
    const onUpdate = vi.fn();
    await registerWorker(host, onUpdate);
    expect(host.registered).toEqual([[WORKER_URL, { scope: '/' }]]);
    registration.installing = worker('installing');
    fire('updatefound');
    registration.installing.state = 'installed';
    fire('statechange');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('offers a waiting version, and reloads once it has taken over', async () => {
    const { host, fire, waitingWorker } = fakeHost(true, true);
    const reload = vi.fn();
    let switchNow: (() => void) | null = null;
    await registerWorker(host, (s) => (switchNow = s), reload);
    expect(switchNow).not.toBeNull();
    switchNow!();
    expect(waitingWorker?.posted).toEqual(['skip-waiting']);
    fire('controllerchange');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads anyway if the new version doesn’t take over in time', async () => {
    vi.useFakeTimers();
    try {
      const { host } = fakeHost(true, true);
      const reload = vi.fn();
      let switchNow: (() => void) | null = null;
      await registerWorker(host, (s) => (switchNow = s), reload);
      switchNow!();
      expect(reload).not.toHaveBeenCalled();
      vi.advanceTimersByTime(SWITCH_TIMEOUT_MS);
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reloads at once when nothing waits any more (another tab switched first)', async () => {
    const { host, registration, waitingWorker } = fakeHost(true, true);
    const reload = vi.fn();
    let switchNow: (() => void) | null = null;
    await registerWorker(host, (s) => (switchNow = s), reload);
    registration.waiting = null;
    switchNow!();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(waitingWorker?.posted).toEqual([]);
  });

  it('says nothing when the first worker claims a page that had none', async () => {
    const { host, fire } = fakeHost(false, false);
    const onUpdate = vi.fn();
    const reload = vi.fn();
    await registerWorker(host, onUpdate, reload);
    fire('controllerchange');
    expect(onUpdate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('in a tab that didn’t switch, keeps the notice with a button that reloads', async () => {
    // Tab B: the new version took over from tab A.
    const { host, fire, waitingWorker } = fakeHost(true, true);
    const reload = vi.fn();
    const offers: (() => void)[] = [];
    await registerWorker(host, (s) => offers.push(s), reload);
    fire('controllerchange');
    // Offered again, now as a plain reload; the page doesn't reload by itself.
    expect(offers).toHaveLength(2);
    expect(reload).not.toHaveBeenCalled();
    offers[1]!();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(waitingWorker?.posted).toEqual([]);
  });

  it('offers a version installed while the page is open', async () => {
    const { host, registration, fire, worker } = fakeHost(true, false);
    const onUpdate = vi.fn();
    await registerWorker(host, onUpdate);
    registration.installing = worker('installing');
    fire('updatefound');
    expect(onUpdate).not.toHaveBeenCalled();
    registration.installing.state = 'installed';
    fire('statechange');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });
});
