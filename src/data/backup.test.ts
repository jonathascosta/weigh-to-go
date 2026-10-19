import { describe, expect, it } from 'vitest';
import { backupFileName, createBackup, importBackup, MAX_BACKUP_BYTES, parseBackup } from './backup';
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
    expect(error(' '.repeat(MAX_BACKUP_BYTES + 1))).toBe('too-large');
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

  it('replaces: only what the file holds is left', async () => {
    const store = await setup();
    await importBackup(store, ok(JSON.stringify([{ data: '2026-10-18', peso: 108 }])), 'replace');
    expect((await store.weighIns()).map((x) => x.date)).toEqual(['2026-10-18']);
    expect(await store.profile()).toEqual({ goalKg: null, heightCm: null });
  });
});
