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
