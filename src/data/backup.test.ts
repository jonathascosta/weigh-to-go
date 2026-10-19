import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupFileName,
  createBackup,
  importBackup,
  isBackupFileTooLarge,
  lastBackupAt,
  MAX_BACKUP_CHARS,
  parseBackup,
} from './backup';
import { fakeStorage } from './fake-storage.test-helper';
import type { StoredWeighIn } from './records';
import { memoryStore } from './store';

const today = '2026-10-19';
const now = new Date('2026-10-19T12:00:00Z');
const at = '2026-10-18T08:00:00.000Z';
const w = (date: string, kg: number, savedAt = at): StoredWeighIn => ({ date, kg, savedAt });

const ok = (text: string) => {
  const parsed = parseBackup(text, today, now);
  if (!parsed.ok) throw new Error(`expected a backup, got ${parsed.error}`);
  return parsed;
};

describe('createBackup and parseBackup', () => {
  it('round-trip every weigh-in and the profile, unrounded', () => {
    const weighIns = [w('2026-10-17', 109.1), w('2026-10-18', 176.2 * 0.45359237)];
    const text = createBackup(weighIns, { goalKg: 90, heightCm: 178 }, now);
    expect(JSON.parse(text)).toMatchObject({ app: 'weigh-to-go', format: 1, exportedAt: now.toISOString() });
    const parsed = ok(text);
    expect(parsed).toEqual({
      ok: true,
      source: 'backup',
      weighIns,
      profile: { goalKg: 90, heightCm: 178 },
      skipped: 0,
    });
  });

  it('names the file after the day', () => {
    expect(backupFileName(today)).toBe('weigh-to-go-2026-10-19.json');
  });

  it('skips rows that are not weigh-ins, counting them', () => {
    const text = JSON.stringify({
      app: 'weigh-to-go',
      format: 1,
      weighIns: [
        w('2026-10-17', 109),
        { date: '2026-02-30', kg: 100 },
        { date: '2026-10-16', kg: 5000 },
        { date: '2026-10-15', kg: '100' },
        { date: '1899-12-31', kg: 100 },
        { date: '2026-10-21', kg: 100 },
        null,
        w('2026-10-17', 108.8),
      ],
      profile: { goalKg: 10, heightCm: 178 },
    });
    const parsed = ok(text);
    expect(parsed.weighIns).toEqual([w('2026-10-17', 108.8)]);
    expect(parsed.skipped).toBe(7);
    expect(parsed.profile).toEqual({ goalKg: null, heightCm: 178 });
  });

  it('allows a day of slack for a time zone ahead', () => {
    const text = JSON.stringify({ app: 'weigh-to-go', format: 1, weighIns: [w('2026-10-20', 100)] });
    expect(ok(text).weighIns).toEqual([w('2026-10-20', 100)]);
  });

  it('fills in a missing or broken save time with now', () => {
    const text = JSON.stringify({
      app: 'weigh-to-go',
      format: 1,
      weighIns: [
        { date: '2026-10-17', kg: 100 },
        { date: '2026-10-18', kg: 100, savedAt: 'yesterday' },
      ],
    });
    expect(ok(text).weighIns.map((x) => x.savedAt)).toEqual([now.toISOString(), now.toISOString()]);
  });

  it("reads the original dashboard's rows, as an array or under pesagens", () => {
    const rows = [
      { data: '2026-10-17', peso: 109.1, registrado_em: at },
      { data: '2026-10-18', peso: 108.7 },
    ];
    for (const text of [JSON.stringify(rows), JSON.stringify({ pesagens: rows })]) {
      const parsed = ok(text);
      expect(parsed.source).toBe('original');
      expect(parsed.profile).toBeNull();
      expect(parsed.weighIns).toEqual([w('2026-10-17', 109.1), w('2026-10-18', 108.7, now.toISOString())]);
    }
  });

  it('says why a file is not a backup', () => {
    const error = (text: string) => {
      const parsed = parseBackup(text, today, now);
      return parsed.ok ? null : parsed.error;
    };
    expect(error('{"app":')).toBe('not-json');
    expect(error('{"hello":"world"}')).toBe('not-a-backup');
    expect(error('[1, 2, 3]')).toBe('not-a-backup');
    expect(error('[]')).toBe('not-a-backup');
    expect(error('{"app":"weigh-to-go","format":1}')).toBe('not-a-backup');
    expect(error('{"app":"weigh-to-go","format":2,"weighIns":[]}')).toBe('newer-format');
    expect(error('{"app":"weigh-to-go","format":1,"weighIns":[{"date":"x","kg":1}]}')).toBe('no-weigh-ins');
    expect(error(' '.repeat(MAX_BACKUP_CHARS + 1))).toBe('too-large');
    for (const format of ['-5', '0', '1.5', '"1"'])
      expect(error(`{"app":"weigh-to-go","format":${format},"weighIns":[]}`)).toBe('not-a-backup');
    expect(error('{"app":"weigh-to-go","format":1,"weighIns":[],"profile":{}}')).toBe('no-weigh-ins');
  });

  it('takes a backup with no weigh-ins when it holds a goal or height', () => {
    const parsed = ok(createBackup([], { goalKg: 90, heightCm: null }, now));
    expect(parsed.weighIns).toEqual([]);
    expect(parsed.profile).toEqual({ goalKg: 90, heightCm: null });
  });

  it('leaves the profile alone when the file has none, or nothing valid in it', () => {
    for (const profile of [undefined, null, {}, { goalKg: 5 }]) {
      const text = JSON.stringify({
        app: 'weigh-to-go',
        format: 1,
        weighIns: [w('2026-10-17', 100)],
        profile,
      });
      expect(ok(text).profile).toBeNull();
    }
  });

  it('counts no profile when the original has nothing valid in it', () => {
    for (const perfil of [{ meta: 'abc' }, { altura: 0 }]) {
      const text = JSON.stringify({ pesagens: [{ data: '2026-10-18', peso: 108 }], perfil });
      expect(ok(text).profile).toBeNull();
    }
  });

  it("finds the original's profile among config docs", () => {
    const text = JSON.stringify({
      pesagens: [{ data: '2026-10-18', peso: 108 }],
      config: [{ id: 'config/perfil', data: { meta: 88, altura: 175 } }],
    });
    expect(ok(text).profile).toEqual({ goalKg: 88, heightCm: 175 });
  });

  it('takes a height in metres without float noise', () => {
    const text = JSON.stringify({ pesagens: [{ data: '2026-10-18', peso: 108 }], perfil: { altura: 1.1 } });
    expect(ok(text).profile).toEqual({ goalKg: null, heightCm: 110 });
  });

  it('refuses a today that is not a day', () => {
    expect(() => parseBackup('[]', 'garbage', now)).toThrow(TypeError);
  });

  it("reads the original's rows keyed by id, wrapped, or with the weight as text", () => {
    const text = JSON.stringify({
      pesagens: {
        'pesagens/2026-10-17': { id: 'pesagens/2026-10-17', data: { data: '2026-10-17', peso: '109,1' } },
        '2026-10-18': { data: '2026-10-18', peso: 108.7, registrado_em: at },
        x: { data: '2026-10-19', peso: 'heavy' },
      },
      config: { perfil: { meta: '90', altura: 1.78 } },
    });
    const parsed = ok(text);
    expect(parsed.weighIns.map((x) => [x.date, x.kg])).toEqual([
      ['2026-10-17', 109.1],
      ['2026-10-18', 108.7],
    ]);
    expect(parsed.skipped).toBe(1);
    expect(parsed.profile).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it("reads the original's profile under perfil", () => {
    const text = JSON.stringify({
      pesagens: [{ data: '2026-10-18', peso: 108 }],
      perfil: { meta: 85, altura: 180 },
    });
    expect(ok(text).profile).toEqual({ goalKg: 85, heightCm: 180 });
  });
});

describe('importBackup', () => {
  const setup = async () => {
    const store = memoryStore();
    await store.put([w('2026-10-10', 111), w('2026-10-17', 109)], { goalKg: 90, heightCm: 178 });
    return store;
  };

  it('merges: the file wins on shared days and fills in the profile fields it has', async () => {
    const store = await setup();
    const text = createBackup(
      [w('2026-10-17', 108.5), w('2026-10-18', 108)],
      { goalKg: 85, heightCm: null },
      now,
    );
    await importBackup(store, ok(text), 'merge');
    expect((await store.weighIns()).map((x) => [x.date, x.kg])).toEqual([
      ['2026-10-10', 111],
      ['2026-10-17', 108.5],
      ['2026-10-18', 108],
    ]);
    expect(await store.profile()).toEqual({ goalKg: 85, heightCm: 178 });
  });

  it("merges the original's rows without touching the profile", async () => {
    const store = await setup();
    await importBackup(store, ok(JSON.stringify([{ data: '2026-10-18', peso: 108 }])), 'merge');
    expect(await store.weighIns()).toHaveLength(3);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('merges: a day saved here after the file was made keeps its weigh-in', async () => {
    const store = await setup();
    const old = createBackup(
      [w('2026-10-17', 110, '2026-10-01T08:00:00.000Z')],
      { goalKg: null, heightCm: null },
      now,
    );
    expect(await importBackup(store, ok(old), 'merge')).toEqual({
      added: 0,
      updated: 0,
      kept: 1,
      unchanged: 0,
    });
    expect((await store.weighIns()).find((x) => x.date === '2026-10-17')!.kg).toBe(109);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('reports a backup imported twice as unchanged', async () => {
    const store = await setup();
    const text = createBackup(await store.weighIns(), await store.profile(), now);
    expect(await importBackup(store, ok(text), 'merge')).toEqual({
      added: 0,
      updated: 0,
      kept: 0,
      unchanged: 2,
    });
  });

  it("replaces the weigh-ins with the original's, keeping the profile here", async () => {
    const store = await setup();
    expect(
      await importBackup(store, ok(JSON.stringify([{ data: '2026-10-18', peso: 108 }])), 'replace'),
    ).toBeNull();
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-18']);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: 178 });
  });

  it('replaces everything with a backup, profile included', async () => {
    const store = await setup();
    await importBackup(
      store,
      ok(createBackup([w('2026-10-18', 108)], { goalKg: null, heightCm: 170 }, now)),
      'replace',
    );
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-18']);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: 170 });
  });
});

describe('the last backup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is remembered, and a broken value reads as never', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    expect(lastBackupAt.read()).toBeNull();
    lastBackupAt.write(now.toISOString());
    expect(lastBackupAt.read()).toBe(now.toISOString());
    localStorage.setItem('weigh-to-go:lastBackupAt', '"soon"');
    expect(lastBackupAt.read()).toBeNull();
  });

  it('refuses files too large to be one before reading them', () => {
    expect(isBackupFileTooLarge(2_000_000)).toBe(false);
    expect(isBackupFileTooLarge(3 * MAX_BACKUP_CHARS + 1)).toBe(true);
  });
});
