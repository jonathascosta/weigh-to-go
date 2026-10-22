/**
 * The reader's data: export a backup, import one (added to what is here, or replacing it), erase
 * everything; and the notices on Today when the data is at risk: kept only in memory, unreachable
 * until a reload, or never (or long not) backed up. Replacing and erasing ask first,
 * and offer a backup before they go ahead.
 */
import { daysBetween, localToday, parseDay } from '../analysis/dates';
import type { App, State } from '../app/app';
import {
  backupFileName,
  createBackup,
  isBackupFileTooLarge,
  lastBackupAt,
  parseBackup,
  type ParsedBackup,
} from '../data/backup';
import { CSV_FORMATS, createCsv, csvFileName, csvFormatPref, csvSeparators } from '../data/csv';
import { choose, count, settings, type Settings } from '../i18n';
import { saveFile } from '../platform/save';
import { isHealthStore } from '../health/layer';
import { h } from './dom';
import { openSheet } from './sheet';

/** Days after the last backup before the reminder shows again. */
export const BACKUP_REMINDER_DAYS = 30;
/** Weigh-ins logged before the first reminder: one or two are no loss yet. */
export const BACKUP_REMINDER_MIN = 7;

/** Which notice the diary needs above it, if any. */
export function noticeFor(
  state: State,
  lastBackup: string | null,
  today: string,
):
  | { kind: 'memory' }
  | { kind: 'reload' }
  | { kind: 'setAside' }
  | { kind: 'backup'; days: number | null }
  | null {
  const { store } = state;
  if (store?.needsReload) return { kind: 'reload' };
  if (store?.kind === 'memory') return { kind: 'memory' };
  if (store?.setAside) return { kind: 'setAside' };
  if (state.weighIns.length < BACKUP_REMINDER_MIN) return null;
  if (lastBackup === null) return { kind: 'backup', days: null };
  const days = daysBetween(parseDay(lastBackup.slice(0, 10)), parseDay(today));
  return days >= BACKUP_REMINDER_DAYS ? { kind: 'backup', days } : null;
}

/**
 * Saves the backup file (a download on the website, the share sheet in the app; never a request
 * anywhere). Resolves the file's name, or null when the reader closed the share sheet; only a file
 * handed over counts as a backup for the reminder.
 */
async function exportBackup(app: App): Promise<string | null> {
  const { store, profile } = app.state();
  // Only what was typed here: the days from Apple Health come back from Health, never from a file
  // of ours (decision H7).
  const weighIns = isHealthStore(store) ? await store.health.typed() : app.state().weighIns;
  const now = new Date();
  const file = backupFileName(localToday(now));
  if (!(await saveFile(file, createBackup(weighIns, profile, now), 'application/json'))) return null;
  lastBackupAt.write(now.toISOString());
  return file;
}

/** Saves the weigh-ins as a CSV for a spreadsheet, in the reader's unit and locale. */
async function exportCsv(app: App, s: Settings): Promise<string | null> {
  const { weighIns, analysis } = app.state();
  const file = csvFileName(localToday(new Date()));
  const savedAt = new Map(weighIns.map((w) => [w.date, w.savedAt]));
  const text = createCsv(
    analysis?.series ?? [],
    savedAt,
    s.weightUnit,
    s.locale.tag,
    s.messages['csv.headers'],
    csvFormatPref.read(),
  );
  return (await saveFile(file, text, 'text/csv')) ? file : null;
}

/** Where Your data's parts of the backup and the erase go. */
export interface DataBoxes {
  /** The Backup group: its status, note, Export, Import, and the CSV with its format. */
  readonly backup: HTMLElement;
  /** Erase everything, alone at the bottom of Your data. */
  readonly erase: HTMLElement;
  /** A line at the top of Your data that says what erasing did. */
  readonly status: HTMLElement;
}

export function mountData(boxes: DataBoxes, app: App): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'data-title' } });
  const note = h('p', { class: 'note' });
  const due = h('span', { class: 'badge' });
  const lastText = h('span');
  const last = h('p', { class: 'backup-status' }, due, lastText);
  const exportButton = h('button', {
    class: 'button button-wide',
    attrs: { type: 'button', id: 'data-export' },
  });
  const csvButton = h('button', { class: 'button button-ghost', attrs: { type: 'button', id: 'data-csv' } });
  const csvLabel = h('label', { attrs: { for: 'data-csv-format' } });
  const csvFormat = h('select', { attrs: { id: 'data-csv-format' } });
  csvFormat.addEventListener('change', () => {
    const value = CSV_FORMATS.find((f) => f === csvFormat.value);
    if (value) csvFormatPref.write(value);
  });
  // The file input stays out of the tab order and out of sight: a real button opens it, so the
  // control the keyboard lands on is the one the reader sees.
  const fileInput = h('input', {
    class: 'visually-hidden',
    attrs: {
      type: 'file',
      accept: 'application/json,.json',
      id: 'data-file',
      tabindex: -1,
      'aria-hidden': 'true',
    },
  });
  const importButton = h('button', {
    class: 'button button-ghost button-wide',
    attrs: { type: 'button', id: 'data-import' },
  });
  importButton.addEventListener('click', () => {
    fileInput.click();
  });
  const eraseButton = h('button', {
    class: 'button button-ghost button-danger-text button-wide',
    attrs: { type: 'button', id: 'data-erase', 'aria-haspopup': 'dialog' },
  });
  const panel = h('div', { class: 'data-panel', attrs: { role: 'status' } });
  const statusLine = boxes.status;
  statusLine.hidden = true;
  boxes.backup.replaceChildren(
    title,
    h(
      'div',
      { class: 'group' },
      h('div', { class: 'group-pad' }, last, note, exportButton, fileInput, importButton, panel),
      h('div', { class: 'group-pad' }, csvButton, h('div', { class: 'field' }, csvLabel, csvFormat)),
    ),
  );
  boxes.erase.replaceChildren(eraseButton);

  /** Whether an export is under way: one at a time (the share sheet takes only one). */
  let exporting = false;
  /** Runs an export and says how it went: saved, cancelled (nothing said) or failed. */
  const runExport = async (save: () => Promise<string | null>) => {
    if (exporting) return;
    exporting = true;
    render(app.state(), settings());
    try {
      const file = await save();
      if (file !== null) {
        panel.replaceChildren(
          h('p', { class: 'status status-ok', text: settings().messages['data.exported'](file) }),
        );
      }
    } catch (error) {
      console.error(error);
      panel.replaceChildren(
        h('p', { class: 'status status-bad', text: settings().messages['data.exportFailed'] }),
      );
    } finally {
      exporting = false;
    }
    render(app.state(), settings());
  };
  exportButton.addEventListener('click', () => {
    void runExport(() => exportBackup(app));
  });
  csvButton.addEventListener('click', () => {
    void runExport(() => exportCsv(app, settings()));
  });

  /** A "back up first" button, for the warnings before replacing or erasing. */
  const backupFirst = () => {
    const button = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: settings().messages['data.export'],
    });
    button.addEventListener('click', () => {
      button.disabled = true;
      void exportBackup(app).then(
        (file) => {
          button.disabled = file !== null;
          render(app.state(), settings());
        },
        (error: unknown) => {
          console.error(error);
          button.disabled = false;
          button.after(
            h('p', { class: 'status status-bad', text: settings().messages['data.exportFailed'] }),
          );
        },
      );
    });
    return button;
  };

  const cancelButton = () => {
    const button = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: settings().messages['data.cancel'],
    });
    button.addEventListener('click', () => {
      panel.replaceChildren();
      importButton.focus();
    });
    return button;
  };

  /** Says how it went, in `where`, and moves focus there: done (green), failed (red), or in part. */
  const report = (where: HTMLElement, text: string, ok: boolean | 'partly') => {
    const line = h('p', {
      class: ok === 'partly' ? 'status' : ok ? 'status status-ok' : 'status status-bad',
      attrs: { tabindex: -1 },
      text,
    });
    where.replaceChildren(line);
    where.hidden = false;
    line.focus();
  };

  /** Why an operation failed: a reload when the store can't reach its data, else `fallback`. */
  const failed = (fallback: string) =>
    app.state().store?.needsReload ? settings().messages['data.reload'] : fallback;

  const runImport = (
    parsed: Extract<ParsedBackup, { ok: true }>,
    mode: 'merge' | 'replace',
    buttons: HTMLButtonElement[],
  ) => {
    // Once is enough: a double click must not run it twice.
    for (const b of buttons) b.disabled = true;
    statusLine.hidden = true;
    app
      .importBackup(parsed, mode)
      .then((result) => {
        const s = settings();
        const n = (v: number) => s.format.number(v, 0);
        const text = result
          ? s.messages['data.merged']({
              added: n(result.added),
              updated: n(result.updated),
              kept: n(result.kept),
              unchanged: n(result.unchanged),
            })
          : s.messages['data.replaced'](count(parsed.weighIns.length, s.messages['word.weighIn'], s));
        report(panel, text, true);
      })
      .catch((error: unknown) => {
        console.error(error);
        report(panel, failed(settings().messages['data.importFailed']), false);
      });
  };

  const offerImport = (parsed: Extract<ParsedBackup, { ok: true }>) => {
    const s = settings();
    const m = s.messages;
    const merge = h('button', { class: 'button', attrs: { type: 'button' }, text: m['data.merge'] });
    const cancel = cancelButton();
    const replace = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: m['data.replace'],
    });
    merge.addEventListener('click', () => {
      runImport(parsed, 'merge', [merge, replace, cancel]);
    });
    replace.addEventListener('click', () => {
      const now = settings();
      const confirm = h('button', {
        class: 'button button-danger',
        attrs: { type: 'button' },
        text: now.messages['data.replaceConfirm'],
      });
      const cancel = cancelButton();
      confirm.addEventListener('click', () => {
        runImport(parsed, 'replace', [confirm, cancel]);
      });
      panel.replaceChildren(
        h('p', {
          class: 'status status-bad',
          text: now.messages['data.replaceWarning'](
            count(app.state().weighIns.length, now.messages['word.weighIn'], now),
            count(parsed.weighIns.length, now.messages['word.weighIn'], now),
          ),
        }),
        h('div', { class: 'stack' }, backupFirst(), cancel),
        // The destructive button apart from the others, under a thumb (principles §3).
        h('div', { class: 'danger-zone' }, confirm),
      );
      // Not the destructive button: a second Enter must not replace everything.
      cancel.focus();
    });
    const skipped = parsed.skipped > 0 ? count(parsed.skipped, m['word.record'], s) : null;
    panel.replaceChildren(
      h('p', { text: m['data.read'](count(parsed.weighIns.length, m['word.weighIn'], s), skipped) }),
      h('div', { class: 'stack' }, merge, replace, cancel),
    );
    merge.focus();
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const m = settings().messages;
    if (isBackupFileTooLarge(file.size)) {
      panel.replaceChildren(h('p', { class: 'status status-bad', text: m['backup.too-large'] }));
      return;
    }
    file
      .text()
      .then((text) => {
        const parsed = parseBackup(text, localToday());
        if (parsed.ok) offerImport(parsed);
        else
          panel.replaceChildren(
            h('p', { class: 'status status-bad', text: settings().messages[`backup.${parsed.error}`] }),
          );
      })
      .catch((error: unknown) => {
        console.error(error);
        panel.replaceChildren(
          h('p', { class: 'status status-bad', text: settings().messages['backup.not-json'] }),
        );
      });
  });

  /**
   * Erase everything (design §7): a sheet with the warning, with Apple Health's choice when it was
   * ever used, Export backup, Cancel (focused first) and, apart from them, Erase.
   */
  eraseButton.addEventListener('click', () => {
    const m = settings().messages;
    const confirm = h('button', {
      class: 'button button-danger button-wide',
      attrs: { type: 'button', id: 'erase-confirm' },
      text: m['data.eraseConfirm'],
    });
    const cancel = h('button', {
      class: 'button button-wide',
      attrs: { type: 'button', id: 'erase-cancel' },
      text: m['data.cancel'],
    });
    // Once the app has written to Apple Health, the person chooses whether its samples go too.
    const { store } = app.state();
    const withHealth = isHealthStore(store) && store.health.everOn() ? store : null;
    const fromHealth = h('input', {
      attrs: { id: 'data-erase-health', type: 'checkbox', 'aria-describedby': 'data-erase-health-note' },
    });
    const backup = backupFirst();
    backup.classList.add('button-wide');
    const content = h(
      'div',
      { class: 'erase-sheet' },
      h('p', { text: m['data.eraseWarning'] }),
      ...(withHealth
        ? [
            h('label', { class: 'check' }, fromHealth, h('span', { text: m['data.eraseHealth'] })),
            h('p', {
              class: 'note',
              attrs: { id: 'data-erase-health-note' },
              text: m['data.eraseHealthNote'],
            }),
          ]
        : []),
      h('div', { class: 'stack' }, backup, cancel),
      h('div', { class: 'danger-zone' }, confirm),
    );
    const sheet = openSheet({
      title: m['data.erase'],
      done: null,
      content,
      opener: eraseButton,
      focus: cancel,
    });
    cancel.addEventListener('click', () => {
      sheet.close();
    });
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      cancel.disabled = true;
      fromHealth.disabled = true;
      // Health refusing never stops the erase here: it is said apart.
      const healthGone =
        withHealth && fromHealth.checked
          ? withHealth.health.deleteOwnSamples().then(
              () => true,
              (error: unknown) => {
                console.warn(error);
                return false;
              },
            )
          : Promise.resolve(true);
      healthGone
        .then(async (fromHealthToo) => ({ gone: await app.erase(), fromHealthToo }))
        .then(({ gone, fromHealthToo }) => {
          // The saved choices went with everything else: back to automatic here too.
          choose({ lang: null, weightUnit: null, heightUnit: null });
          const after = settings().messages;
          sheet.close(false);
          panel.replaceChildren();
          if (!gone) report(statusLine, after['data.eraseFailed'], false);
          else if (fromHealthToo) report(statusLine, after['data.erased'], true);
          else report(statusLine, after['data.erasedNotHealth'], 'partly');
        })
        .catch((error: unknown) => {
          console.error(error);
          sheet.close(false);
          report(statusLine, failed(settings().messages['data.eraseFailed']), false);
        });
    });
  });

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    title.textContent = m['data.group.backup'];
    note.textContent = m['data.note'];
    const when = lastBackupAt.read();
    lastText.textContent =
      when === null
        ? m['data.neverBackedUp']
        : m['data.lastBackup'](s.format.day(localToday(new Date(when)), 'medium'));
    due.textContent = m['data.due'];
    due.hidden = noticeFor(state, when, localToday())?.kind !== 'backup';
    exportButton.textContent = m['data.export'];
    exportButton.disabled = state.status === 'loading' || exporting;
    csvButton.textContent = m['data.exportCsv'];
    csvLabel.textContent = m['data.csvFormat'];
    const auto = csvSeparators(s.locale.tag);
    csvFormat.replaceChildren(
      ...CSV_FORMATS.map((f) =>
        h('option', {
          attrs: { value: f },
          text:
            f === 'auto'
              ? m['data.csvFormat.auto'](`${auto.field} ${auto.decimal}`)
              : m[f === 'semicolon' ? 'data.csvFormat.semicolon' : 'data.csvFormat.comma'],
        }),
      ),
    );
    csvFormat.value = csvFormatPref.read();
    csvButton.disabled = state.status === 'loading' || state.weighIns.length === 0 || exporting;
    importButton.textContent = m['data.import'];
    importButton.disabled = state.status === 'loading';
    eraseButton.textContent = m['data.erase'];
  };
  return render;
}

/**
 * The notices about the data. Kept only in memory, unreachable until a reload, or set aside are full
 * notices at the top of Today (`boxes.today`); the reload one, with its button, also at the top of
 * Your data (`boxes.data`), whose actions are what bring it up. A backup due is one line on Today,
 * `boxes.line`, with a link that `onExportLink` follows to Export backup, and `onBackupDue` puts the
 * dot on Your data's tab. Each is redrawn, and announced again, only when it changes.
 */
export function mountNotices(
  boxes: { readonly today: HTMLElement; readonly data: HTMLElement; readonly line: HTMLElement },
  onBackupDue: (due: boolean) => void,
  onExportLink: () => void,
): (state: State, s: Settings) => void {
  const { today: box, data: dataBox, line } = boxes;
  const lineText = h('span');
  const lineLink = h('a', { attrs: { href: '#data' } });
  lineLink.addEventListener('click', (event) => {
    event.preventDefault();
    onExportLink();
  });
  line.replaceChildren(
    h('span', { class: 'dot-inline', attrs: { 'aria-hidden': 'true' } }),
    h('span', {}, lineText, ' ', lineLink),
  );
  line.hidden = true;
  box.hidden = true;
  dataBox.hidden = true;
  const reloadNotice = (m: Settings['messages']): Node[] => {
    const reload = h('button', {
      class: 'button',
      attrs: { type: 'button' },
      text: m['notice.reloadButton'],
    });
    reload.addEventListener('click', () => {
      window.location.reload();
    });
    return [h('p', { text: m['notice.reload'] }), reload];
  };
  let shown = '';
  return (state, s) => {
    const m = s.messages;
    const notice = noticeFor(state, lastBackupAt.read(), localToday());
    const key = `${s.locale.tag}:${JSON.stringify(notice)}`;
    if (key === shown) return;
    shown = key;
    const due = notice?.kind === 'backup';
    onBackupDue(due);
    line.hidden = !due;
    if (notice?.kind === 'backup') {
      lineText.textContent =
        notice.days === null
          ? m['notice.noBackup']
          : m['notice.oldBackup'](count(notice.days, m['word.day'], s));
      lineLink.textContent = m['data.export'];
    }
    dataBox.hidden = notice?.kind !== 'reload';
    dataBox.replaceChildren(...(notice?.kind === 'reload' ? reloadNotice(m) : []));
    if (notice === null || notice.kind === 'backup') {
      box.replaceChildren();
      box.hidden = true;
      return;
    }
    box.hidden = false;
    if (notice.kind === 'reload') box.replaceChildren(...reloadNotice(m));
    else box.replaceChildren(h('p', { text: m[`notice.${notice.kind}`] }));
  };
}
