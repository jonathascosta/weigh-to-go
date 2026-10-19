/**
 * The reader's data: export a backup, import one (added to what is here, or replacing it), erase
 * everything; and the notices above the diary when the data is at risk: kept only in memory,
 * unreachable until a reload, or never (or long not) backed up. Replacing and erasing ask first,
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
import { choose, count, settings, type Settings } from '../i18n';
import { h } from './dom';

/** Days after the last backup before the reminder shows again. */
export const BACKUP_REMINDER_DAYS = 30;
/** Weigh-ins logged before the first reminder: one or two are no loss yet. */
export const BACKUP_REMINDER_MIN = 7;

/** Which notice the diary needs above it, if any. */
export function noticeFor(
  state: State,
  lastBackup: string | null,
  today: string,
): { kind: 'memory' } | { kind: 'reload' } | { kind: 'backup'; days: number | null } | null {
  const { store } = state;
  if (store?.needsReload) return { kind: 'reload' };
  if (store?.kind === 'memory') return { kind: 'memory' };
  if (state.weighIns.length < BACKUP_REMINDER_MIN) return null;
  if (lastBackup === null) return { kind: 'backup', days: null };
  const days = daysBetween(parseDay(lastBackup.slice(0, 10)), parseDay(today));
  return days >= BACKUP_REMINDER_DAYS ? { kind: 'backup', days } : null;
}

/** Saves the backup file: a download made from the text, never a request anywhere. */
function exportBackup(app: App): string {
  const { weighIns, profile } = app.state();
  const now = new Date();
  const file = backupFileName(localToday(now));
  const url = URL.createObjectURL(
    new Blob([createBackup(weighIns, profile, now)], { type: 'application/json' }),
  );
  const link = h('a', { attrs: { href: url, download: file } });
  document.body.append(link);
  link.click();
  link.remove();
  // Long enough for the download to start; the URL is only this page's.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
  lastBackupAt.write(now.toISOString());
  return file;
}

export function mountData(
  container: HTMLElement,
  noticeBox: HTMLElement,
  app: App,
): (state: State, s: Settings) => void {
  const title = h('h2', { attrs: { id: 'data-title' } });
  const note = h('p', { class: 'note' });
  const last = h('p', { class: 'note' });
  const exportButton = h('button', { class: 'button', attrs: { type: 'button' } });
  const fileInput = h('input', {
    class: 'visually-hidden',
    attrs: { type: 'file', accept: 'application/json,.json', id: 'data-file' },
  });
  const importLabel = h('label', { class: 'button button-ghost', attrs: { for: 'data-file' } });
  const eraseButton = h('button', {
    class: 'button button-ghost button-danger-text',
    attrs: { type: 'button' },
  });
  const panel = h('div', { class: 'data-panel', attrs: { role: 'status' } });
  container.replaceChildren(
    h('div', { class: 'card-head' }, h('div', {}, title, note, last)),
    h('div', { class: 'actions' }, exportButton, fileInput, importLabel, eraseButton),
    panel,
  );

  const doExport = () => {
    const file = exportBackup(app);
    panel.replaceChildren(
      h('p', { class: 'status status-ok', text: settings().messages['data.exported'](file) }),
    );
    render(app.state(), settings());
  };
  exportButton.addEventListener('click', doExport);

  /** A "back up first" button, for the warnings before replacing or erasing. */
  const backupFirst = () => {
    const button = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: settings().messages['data.export'],
    });
    button.addEventListener('click', () => {
      exportBackup(app);
      button.disabled = true;
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
      importLabel.focus();
    });
    return button;
  };

  const runImport = (parsed: Extract<ParsedBackup, { ok: true }>, mode: 'merge' | 'replace') => {
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
        panel.replaceChildren(h('p', { class: 'status status-ok', text }));
      })
      .catch((error: unknown) => {
        console.error(error);
        panel.replaceChildren(
          h('p', { class: 'status status-bad', text: settings().messages['data.importFailed'] }),
        );
      });
  };

  const offerImport = (parsed: Extract<ParsedBackup, { ok: true }>) => {
    const s = settings();
    const m = s.messages;
    const merge = h('button', { class: 'button', attrs: { type: 'button' }, text: m['data.merge'] });
    const replace = h('button', {
      class: 'button button-ghost',
      attrs: { type: 'button' },
      text: m['data.replace'],
    });
    merge.addEventListener('click', () => {
      runImport(parsed, 'merge');
    });
    replace.addEventListener('click', () => {
      const now = settings();
      const confirm = h('button', {
        class: 'button button-danger',
        attrs: { type: 'button' },
        text: now.messages['data.replaceConfirm'],
      });
      confirm.addEventListener('click', () => {
        runImport(parsed, 'replace');
      });
      panel.replaceChildren(
        h('p', {
          class: 'status status-bad',
          text: now.messages['data.replaceWarning'](
            count(app.state().weighIns.length, now.messages['word.weighIn'], now),
            count(parsed.weighIns.length, now.messages['word.weighIn'], now),
          ),
        }),
        h('div', { class: 'actions' }, backupFirst(), confirm, cancelButton()),
      );
      confirm.focus();
    });
    const skipped = parsed.skipped > 0 ? count(parsed.skipped, m['paste.word.line'], s) : null;
    panel.replaceChildren(
      h('p', { text: m['data.read'](count(parsed.weighIns.length, m['word.weighIn'], s), skipped) }),
      h('div', { class: 'actions' }, merge, replace, cancelButton()),
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

  eraseButton.addEventListener('click', () => {
    const m = settings().messages;
    const confirm = h('button', {
      class: 'button button-danger',
      attrs: { type: 'button' },
      text: m['data.eraseConfirm'],
    });
    confirm.addEventListener('click', () => {
      confirm.disabled = true;
      app
        .erase()
        .then((gone) => {
          // The saved choices went with everything else: back to automatic here too.
          choose({ lang: null, weightUnit: null, heightUnit: null });
          const after = settings().messages;
          panel.replaceChildren(
            h('p', {
              class: gone ? 'status status-ok' : 'status status-bad',
              text: gone ? after['data.erased'] : after['data.eraseFailed'],
            }),
          );
        })
        .catch((error: unknown) => {
          console.error(error);
          panel.replaceChildren(
            h('p', { class: 'status status-bad', text: settings().messages['data.eraseFailed'] }),
          );
        });
    });
    panel.replaceChildren(
      h('p', { class: 'status status-bad', text: m['data.eraseWarning'] }),
      h('div', { class: 'actions' }, backupFirst(), confirm, cancelButton()),
    );
    confirm.focus();
  });

  const renderNotice = (state: State, s: Settings) => {
    const m = s.messages;
    const notice = noticeFor(state, lastBackupAt.read(), localToday());
    if (notice === null) {
      noticeBox.replaceChildren();
      noticeBox.hidden = true;
      return;
    }
    noticeBox.hidden = false;
    if (notice.kind === 'reload') {
      const reload = h('button', {
        class: 'button',
        attrs: { type: 'button' },
        text: m['notice.reloadButton'],
      });
      reload.addEventListener('click', () => {
        window.location.reload();
      });
      noticeBox.replaceChildren(h('p', { text: m['notice.reload'] }), reload);
    } else if (notice.kind === 'memory') {
      noticeBox.replaceChildren(h('p', { text: m['notice.memory'] }));
    } else {
      const button = h('button', { class: 'button', attrs: { type: 'button' }, text: m['data.export'] });
      button.addEventListener('click', doExport);
      noticeBox.replaceChildren(
        h('p', {
          text:
            notice.days === null
              ? m['notice.noBackup']
              : m['notice.oldBackup'](count(notice.days, m['word.day'], s)),
        }),
        button,
      );
    }
  };

  const render = (state: State, s: Settings) => {
    const m = s.messages;
    title.textContent = m['data.title'];
    note.textContent = m['data.note'];
    const when = lastBackupAt.read();
    last.textContent =
      when === null
        ? m['data.neverBackedUp']
        : m['data.lastBackup'](s.format.day(localToday(new Date(when)), 'medium'));
    exportButton.textContent = m['data.export'];
    exportButton.disabled = state.status === 'loading';
    importLabel.textContent = m['data.import'];
    eraseButton.textContent = m['data.erase'];
    renderNotice(state, s);
  };
  return render;
}
