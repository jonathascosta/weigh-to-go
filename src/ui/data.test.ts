import { describe, expect, it } from 'vitest';
import type { State } from '../app/app';
import { EMPTY_PROFILE, type StoredWeighIn } from '../data/records';
import { memoryStore } from '../data/store';
import { BACKUP_REMINDER_MIN, noticeFor } from './data';

const weighIns = (n: number): StoredWeighIn[] =>
  Array.from({ length: n }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    kg: 100,
    savedAt: '2026-09-01T08:00:00Z',
  }));
const state = (n: number, store = memoryStore()): State => ({
  status: 'ready',
  store: { ...store, kind: 'indexeddb', reason: null, needsReload: false },
  weighIns: weighIns(n),
  profile: EMPTY_PROFILE,
  analysis: null,
});

describe('noticeFor', () => {
  it('asks for a reload, or warns of a memory store, before anything else', () => {
    const s = state(20);
    expect(noticeFor({ ...s, store: { ...s.store!, needsReload: true } }, null, '2026-10-19')).toEqual({
      kind: 'reload',
    });
    expect(noticeFor({ ...s, store: memoryStore('unsupported') }, null, '2026-10-19')).toEqual({
      kind: 'memory',
    });
  });

  it('reminds to back up once there is something to lose, and again after a month', () => {
    expect(noticeFor(state(BACKUP_REMINDER_MIN - 1), null, '2026-10-19')).toBeNull();
    expect(noticeFor(state(BACKUP_REMINDER_MIN), null, '2026-10-19')).toEqual({ kind: 'backup', days: null });
    expect(noticeFor(state(20), '2026-10-01T10:00:00.000Z', '2026-10-19')).toBeNull();
    expect(noticeFor(state(20), '2026-09-01T10:00:00.000Z', '2026-10-19')).toEqual({
      kind: 'backup',
      days: 48,
    });
  });
});
