import type { HealthBackend, WriteStatus } from './layer';
import type { HealthSample, SampleToWrite } from './reconcile';

/** A local moment as an ISO string: tests build readings in local time, so they hold in any zone. */
export const local = (day: string, hour: number): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour).toISOString();
};

export const reading = (day: string, hour: number, kg: number): HealthSample => ({
  uuid: `${day}-${String(hour)}`,
  kg,
  start: local(day, hour),
});

/**
 * Apple Health in memory: its samples (this app's replace one another by sync identifier and
 * version, as HealthKit does), whether the app may write, and switches for what fails.
 */
export function fakeHealth(samples: HealthSample[] = [], allowed = true) {
  const state = {
    samples,
    allowed,
    available: true,
    asked: 0,
    failRead: false,
    failRemoveAll: false,
    failWrite: false,
    calls: [] as string[],
  };
  const backend: HealthBackend = {
    available: () => Promise.resolve(state.available),
    authorize: () => {
      state.asked++;
      return Promise.resolve(state.allowed);
    },
    writeStatus: () => Promise.resolve<WriteStatus>(state.allowed ? 'allowed' : 'denied'),
    read: () => {
      state.calls.push('read');
      return state.failRead ? Promise.reject(new Error('locked')) : Promise.resolve([...state.samples]);
    },
    write: (written: readonly SampleToWrite[]) => {
      state.calls.push(`write ${written.map((s) => s.syncId).join(',')}`);
      if (state.failWrite) return Promise.reject(new Error('Health is locked'));
      for (const s of written) {
        const old = state.samples.find((x) => x.syncId === s.syncId);
        if (old && (old.syncVersion ?? 0) >= s.syncVersion) continue;
        state.samples = [
          ...state.samples.filter((x) => x.syncId !== s.syncId),
          { uuid: s.syncId, kg: s.kg, start: s.start, syncId: s.syncId, syncVersion: s.syncVersion },
        ];
      }
      return Promise.resolve();
    },
    remove: (ids) => {
      const before = state.samples.length;
      state.samples = state.samples.filter((s) => !s.syncId || !ids.includes(s.syncId));
      return Promise.resolve(before - state.samples.length);
    },
    removeAll: () => {
      if (state.failRemoveAll) return Promise.reject(new Error('Health is locked'));
      const before = state.samples.length;
      state.samples = state.samples.filter((s) => !s.syncId);
      return Promise.resolve(before - state.samples.length);
    },
  };
  return { state, backend };
}
