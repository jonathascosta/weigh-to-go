/**
 * The JSON backup: the only way data moves between devices. Export writes every weigh-in and the
 * profile; import reads that file back, or the weigh-ins of the original dashboard
 * (`{ "data": "YYYY-MM-DD", "peso": 108.2 }` rows), and checks every row before anything is saved.
 */
import { addDays, isoDay, parseDay } from '../analysis/dates';
import { EMPTY_PROFILE, toProfile, toWeighIn, type Profile, type StoredWeighIn } from './records';
import type { Store } from './store';

export const BACKUP_APP = 'weigh-to-go';
export const BACKUP_FORMAT = 1;
/** Text longer than this (in characters) is not a backup: decades of daily weigh-ins fit in 2 MB. */
export const MAX_BACKUP_BYTES = 5_000_000;
/** Days before this one are not weigh-ins (a typo in the year). */
export const FIRST_DAY = '1900-01-01';

export interface Backup {
  readonly app: typeof BACKUP_APP;
  readonly format: typeof BACKUP_FORMAT;
  readonly exportedAt: string;
  readonly weighIns: readonly StoredWeighIn[];
  readonly profile: Profile;
}

export type BackupError = 'too-large' | 'not-json' | 'not-a-backup' | 'newer-format' | 'no-weigh-ins';

export type ParsedBackup =
  | {
      readonly ok: true;
      /** 'backup' for this app's file, 'original' for the original dashboard's rows. */
      readonly source: 'backup' | 'original';
      readonly weighIns: readonly StoredWeighIn[];
      /** The profile in the file, or null if it has none (the original's rows). */
      readonly profile: Profile | null;
      /** Rows left out: not a weigh-in, a weight out of range, a date in the future, or a repeated day. */
      readonly skipped: number;
    }
  | { readonly ok: false; readonly error: BackupError };

/** The backup of `weighIns` and `profile`, as the text of the file. */
export function createBackup(weighIns: readonly StoredWeighIn[], profile: Profile, now: Date): string {
  const backup: Backup = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    weighIns: weighIns.map(({ date, kg, savedAt }) => ({ date, kg, savedAt })),
    profile: { goalKg: profile.goalKg, heightCm: profile.heightCm },
  };
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** The backup's file name, dated with the device's `today` (YYYY-MM-DD). */
export const backupFileName = (today: string): string => `weigh-to-go-${today}.json`;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The original dashboard's rows: an array of them, or an object holding them under `pesagens`. */
function originalRows(value: unknown): unknown[] | null {
  const rows = Array.isArray(value) ? value : isObject(value) ? value.pesagens : null;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const looksOriginal = rows.some((row) => isObject(row) && 'data' in row && 'peso' in row);
  return looksOriginal ? rows : null;
}

/**
 * Reads a backup file's text. `today` is the device's day (YYYY-MM-DD): a weigh-in more than a day
 * after it is a typo (a day of slack for a backup made in a time zone ahead). Several rows for one
 * day keep the last, as when saving.
 */
export function parseBackup(text: string, today: string, now: Date = new Date()): ParsedBackup {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: 'too-large' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }

  let rows: unknown[];
  let profile: Profile | null;
  let source: 'backup' | 'original';
  if (isObject(value) && value.app === BACKUP_APP) {
    if (typeof value.format !== 'number' || !Array.isArray(value.weighIns))
      return { ok: false, error: 'not-a-backup' };
    if (value.format > BACKUP_FORMAT) return { ok: false, error: 'newer-format' };
    rows = value.weighIns;
    profile = toProfile(value.profile);
    source = 'backup';
  } else {
    const original = originalRows(value);
    if (original === null) return { ok: false, error: 'not-a-backup' };
    rows = original.map((row) =>
      isObject(row) ? { date: row.data, kg: row.peso, savedAt: row.registrado_em } : row,
    );
    profile = null;
    source = 'original';
  }

  const latest = isoDay(addDays(parseDay(today), 1));
  const saved = now.toISOString();
  const byDate = new Map<string, StoredWeighIn>();
  let skipped = 0;
  for (const row of rows) {
    const w = toWeighIn(row, saved);
    if (w === null || w.date < FIRST_DAY || w.date > latest) {
      skipped++;
      continue;
    }
    if (byDate.has(w.date)) skipped++;
    byDate.set(w.date, w);
  }
  if (byDate.size === 0) return { ok: false, error: 'no-weigh-ins' };
  const weighIns = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ok: true, source, weighIns, profile, skipped };
}

export type ImportMode = 'merge' | 'replace';

/**
 * Saves an imported backup. 'merge' keeps what is here and adds the file's weigh-ins (the file wins
 * on a day both have) and the profile fields the file has; 'replace' leaves only what the file
 * holds. Either way it is one transaction.
 */
export async function importBackup(
  store: Store,
  parsed: Extract<ParsedBackup, { ok: true }>,
  mode: ImportMode,
): Promise<void> {
  if (mode === 'replace') {
    await store.replace(parsed.weighIns, parsed.profile ?? EMPTY_PROFILE);
    return;
  }
  const current = await store.profile();
  const profile = parsed.profile && {
    goalKg: parsed.profile.goalKg ?? current.goalKg,
    heightCm: parsed.profile.heightCm ?? current.heightCm,
  };
  await store.put(parsed.weighIns, profile ?? undefined);
}
