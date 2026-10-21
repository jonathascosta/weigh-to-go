import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { memoryStore } from '../data/store';
import { createApp, type State } from './app';

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('navigator', {
    storage: { persisted: () => Promise.resolve(false), persist: vi.fn(() => Promise.resolve(true)) },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createApp', () => {
  it('loads, then keeps the analysis in step with every change', async () => {
    const seen: State['status'][] = [];
    const app = createApp(() => Promise.resolve(memoryStore()));
    app.subscribe((s) => seen.push(s.status));
    await settle();
    expect(seen[0]).toBe('loading');
    expect(app.state()).toMatchObject({ status: 'ready', weighIns: [], analysis: null });
    await app.save([
      { date: '2026-10-17', kg: 100 },
      { date: '2026-10-18', kg: 99.5 },
    ]);
    expect(app.state().analysis?.summary.n).toBe(2);
    await app.remove('2026-10-17');
    expect(app.state().weighIns.map((w) => w.date)).toEqual(['2026-10-18']);
  });

  it('asks the browser to keep the data after the first save only', async () => {
    const app = createApp(() => Promise.resolve(memoryStore()));
    await settle();
    const persist = (navigator as unknown as { storage: { persist: ReturnType<typeof vi.fn> } }).storage
      .persist;
    expect(persist).not.toHaveBeenCalled();
    await app.save([{ date: '2026-10-17', kg: 100 }]);
    await app.save([{ date: '2026-10-18', kg: 100 }]);
    await settle();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('asks nothing of the browser in the iPhone app, whose file needs no such request', async () => {
    const app = createApp(() => Promise.resolve({ ...memoryStore(), kind: 'device', reason: null }));
    await settle();
    await app.save([{ date: '2026-10-17', kg: 100 }]);
    await settle();
    const persist = (navigator as unknown as { storage: { persist: ReturnType<typeof vi.fn> } }).storage
      .persist;
    expect(persist).not.toHaveBeenCalled();
  });

  it('passes on a refused save, changing nothing', async () => {
    const app = createApp(() => Promise.resolve(memoryStore()));
    await settle();
    await expect(app.save([{ date: '2026-10-17', kg: 5 }])).rejects.toThrow(TypeError);
    expect(app.state().weighIns).toEqual([]);
  });

  it('erases everything', async () => {
    const app = createApp(() => Promise.resolve(memoryStore()));
    await settle();
    await app.save([{ date: '2026-10-17', kg: 100 }]);
    expect(await app.erase()).toBe(true);
    expect(app.state().weighIns).toEqual([]);
  });
});

describe('createApp, when things go wrong', () => {
  it('applies only the latest read when reads finish out of order', async () => {
    const store = memoryStore();
    let slow = false;
    const weighIns = store.weighIns.bind(store);
    // The first read after the save is held back until a later one has finished.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = createApp(() =>
      Promise.resolve({
        ...store,
        weighIns: async () => {
          const rows = await weighIns();
          if (slow) {
            slow = false;
            await held;
          }
          return rows;
        },
      }),
    );
    await settle();
    await store.put([{ date: '2026-10-17', kg: 100, savedAt: '2026-10-17T08:00:00Z' }]);
    slow = true;
    const first = app.save([]);
    await settle();
    await app.save([{ date: '2026-10-18', kg: 99 }]);
    release();
    await first;
    expect(app.state().weighIns.map((w) => w.date)).toEqual(['2026-10-17', '2026-10-18']);
  });

  it('tells the listeners after a failed write, and passes the error on', async () => {
    const app = createApp(() => Promise.resolve(memoryStore()));
    await settle();
    let calls = 0;
    app.subscribe(() => calls++);
    await expect(app.save([{ date: '2026-10-17', kg: 5 }])).rejects.toThrow(TypeError);
    expect(calls).toBe(2);
  });

  it('reports a write as done when only the read after it fails', async () => {
    const store = memoryStore();
    let failReads = false;
    const app = createApp(() =>
      Promise.resolve({
        ...store,
        weighIns: () => (failReads ? Promise.reject(new Error('read failed')) : store.weighIns()),
      }),
    );
    await settle();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failReads = true;
    await expect(app.save([{ date: '2026-10-17', kg: 100 }])).resolves.toBeUndefined();
    expect(await store.weighIns()).toHaveLength(1);
  });

  it('falls back to memory when the store fails to open', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp(() => Promise.reject(new Error('no store')));
    await settle();
    expect(app.state()).toMatchObject({ status: 'ready', store: { kind: 'memory', reason: 'error' } });
  });
});
