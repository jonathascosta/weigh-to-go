/**
 * The JSON backup: the only way data moves between devices, and the only copy outside the
 * browser. Export writes every weigh-in and the profile; import reads that file back, or the data
 * of the original dashboard, and checks every row before anything is saved.
 *
 * The original kept each weigh-in as `{ "data": "YYYY-MM-DD", "peso": 108.2, "registrado_em": … }`
 * and the profile as `{ "meta": 90, "altura": 178 }`; import takes those rows as an array, or under
 * `pesagens` (an array, or an object keyed by date or id), each row bare or wrapped as
 * `{ "id": …, "data": { … } }`, and the profile under `perfil` or `config`.
 */
import { addDays, isIsoDay, isoDay, parseDay } from '../analysis/dates';
import { parseNumber } from './paste';
import { pref } from './prefs';
import {
  byDate,
  isIsoTime,
  isWeighInDay,
  toProfile,
  toWeighIn,
  type Profile,
  type StoredWeighIn,
} from './records';
import type { MergeResult, Store } from './store';

export const BACKUP_APP = 'weigh-to-go';
export const BACKUP_FORMAT = 1;
/** Text longer than this is not a backup: decades of daily weigh-ins fit in 2 million characters. */
export const MAX_BACKUP_CHARS = 5_000_000;

/**
 * Whether a file of `bytes` is too large to be a backup, checked before reading it (a UTF-8 file
 * holds at least a third as many characters as bytes).
 */
export const isBackupFileTooLarge = (bytes: number): boolean => bytes > 3 * MAX_BACKUP_CHARS;

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
      /** 'backup' for this app's file, 'original' for the original dashboard's data. */
      readonly source: 'backup' | 'original';
      readonly weighIns: readonly StoredWeighIn[];
      /** The profile in the file, or null if it has none. */
      readonly profile: Profile | null;
      /**
       * Rows left out: not a weigh-in, a weight out of range, a day before 1900 or more than a day
       * ahead, or a day an earlier row already gave (the later row is kept).
       */
      readonly skipped: number;
    }
  | { readonly ok: false; readonly error: BackupError };

/** When the last backup was exported, so the page can remind the person to make another. */
export const lastBackupAt = pref(
  'lastBackupAt',
  (v: unknown): v is string | null => v === null || isIsoTime(v),
  null,
);

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

/** A number, or a number written as text with a comma or a point ("108,2"). */
const numeric = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseNumber(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** A row of the original, unwrapped from `{ id, data: { … } }` if needed. */
const unwrap = (row: unknown): unknown => (isObject(row) && isObject(row.data) ? row.data : row);
const isOriginalRow = (row: unknown): row is Record<string, unknown> =>
  isObject(row) && typeof row.data === 'string' && 'peso' in row;

/** Whether the profile holds anything. */
const hasValue = (p: Profile | null): boolean => p !== null && (p.goalKg !== null || p.heightCm !== null);

/** The original dashboard's weigh-ins and profile in `value`, or null if it doesn't hold them. */
function original(value: unknown): { rows: unknown[]; profile: Profile | null } | null {
  const holder = isObject(value) && !Array.isArray(value) ? value : null;
  const list = holder ? holder.pesagens : value;
  const rows = (Array.isArray(list) ? list : isObject(list) ? Object.values(list) : []).map(unwrap);
  if (!rows.some(isOriginalRow)) return null;

  // The profile doc: under `perfil`, or `config.perfil`, or `config` itself, or among `config`'s docs.
  const config = holder?.config;
  const configDocs: unknown[] = Array.isArray(config)
    ? (config as unknown[])
    : isObject(config)
      ? [config.perfil, config]
      : [];
  const candidates = [holder?.perfil, ...configDocs].map(unwrap);
  const perfil = candidates.find((doc) => isObject(doc) && ('meta' in doc || 'altura' in doc));
  let profile: Profile | null = null;
  if (isObject(perfil)) {
    const altura = numeric(perfil.altura);
    // The original asked for centimetres; a height in metres is an easy slip.
    const heightCm = altura !== null && altura < 3 ? Math.round(altura * 1000) / 10 : altura;
    const found = toProfile({ goalKg: numeric(perfil.meta), heightCm });
    // A profile with nothing valid in it is no profile: it must not wipe the one here.
    if (hasValue(found)) profile = found;
  }
  return {
    rows: rows.map((row) =>
      isOriginalRow(row) ? { date: row.data, kg: numeric(row.peso), savedAt: row.registrado_em } : row,
    ),
    profile,
  };
}

/**
 * Reads a backup file's text. `today` is the device's day (YYYY-MM-DD): a weigh-in more than a day
 * after it is a typo (a day of slack for a backup made in a time zone ahead). Several rows for one
 * day keep the last, as when saving.
 */
export function parseBackup(text: string, today: string, now: Date = new Date()): ParsedBackup {
  if (!isIsoDay(today)) throw new TypeError(`today must be YYYY-MM-DD, not ${today}`);
  if (text.length > MAX_BACKUP_CHARS) return { ok: false, error: 'too-large' };
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
    const { format } = value;
    if (
      typeof format !== 'number' ||
      !Number.isInteger(format) ||
      format < 1 ||
      !Array.isArray(value.weighIns)
    )
      return { ok: false, error: 'not-a-backup' };
    if (format > BACKUP_FORMAT) return { ok: false, error: 'newer-format' };
    rows = value.weighIns;
    // A file without a profile leaves the one here alone, as the original's rows do.
    profile = 'profile' in value ? toProfile(value.profile) : null;
    source = 'backup';
  } else {
    const found = original(value);
    if (found === null) return { ok: false, error: 'not-a-backup' };
    ({ rows, profile } = found);
    source = 'original';
  }

  const latest = isoDay(addDays(parseDay(today), 1));
  const saved = now.toISOString();
  const byDay = new Map<string, StoredWeighIn>();
  let skipped = 0;
  for (const row of rows) {
    const w = toWeighIn(row, saved);
    if (w === null || !isWeighInDay(w.date, latest)) {
      skipped++;
      continue;
    }
    if (byDay.has(w.date)) skipped++;
    byDay.set(w.date, w);
  }
  // A backup made before the first weigh-in still carries the goal and height.
  if (byDay.size === 0 && !(source === 'backup' && hasValue(profile)))
    return { ok: false, error: 'no-weigh-ins' };
  return { ok: true, source, weighIns: [...byDay.values()].sort(byDate), profile, skipped };
}

export type ImportMode = 'merge' | 'replace';

/**
 * Saves an imported backup, in one transaction. 'merge' keeps what is here and adds the file's
 * weigh-ins: on a day both have, the one saved later wins (so an old backup doesn't undo a later
 * correction); the profile fields the file has replace the ones here. 'replace' leaves only the
 * file's weigh-ins, and its profile if it has one. Returns what a merge did, or null for 'replace'.
 */
export async function importBackup(
  store: Store,
  parsed: Extract<ParsedBackup, { ok: true }>,
  mode: ImportMode,
): Promise<MergeResult | null> {
  if (mode === 'merge') return store.merge(parsed.weighIns, parsed.profile);
  await store.replace(parsed.weighIns, parsed.profile ?? undefined);
  return null;
}
