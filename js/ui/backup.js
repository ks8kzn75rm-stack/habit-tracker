/** Export (share sheet or download) and import of backup files. */
import { backupFilename, parseBackup } from '../core/backup.js';
import { store } from '../data/store.js';
import { h } from './dom.js';
import { confirm, dialog, toast } from './overlay.js';

const dateTime = (ms) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

/**
 * Save a backup. On iPhone this opens the share sheet (choose "Save to Files");
 * elsewhere it falls back to a normal download.
 *
 * Everything before navigator.share() is synchronous on purpose: Safari only
 * allows sharing as a direct response to a tap.
 */
export async function exportBackup() {
  const json = JSON.stringify(store.exportData(), null, 2);
  const name = backupFilename(store.todayKey());
  const file = new File([json], name, { type: 'application/json' });

  let method = null;
  let canShareFile = false;
  try {
    canShareFile = Boolean(navigator.share && navigator.canShare?.({ files: [file] }));
  } catch {
    canShareFile = false;
  }
  if (canShareFile) {
    try {
      await navigator.share({ files: [file] });
      method = 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled';
      console.warn('Sharing failed; downloading instead.', err);
    }
  }
  if (!method) {
    download(json, name);
    method = 'downloaded';
  }

  store.markExported();
  toast(method === 'shared' ? 'Backup saved. Nice one.' : 'Backup downloaded', { emoji: '🛟' });
  return method;
}

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = h('a', { href: url, download: name, class: 'visually-hidden' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function chooseFile() {
  return new Promise((resolve) => {
    document.querySelectorAll('input[data-backup-picker]').forEach((old) => old.remove());
    const input = h('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'visually-hidden',
      'data-backup-picker': '',
      tabindex: '-1',
      'aria-hidden': 'true',
    });
    const finish = (file) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function importBackup() {
  const file = await chooseFile();
  if (!file) return false;
  let text;
  try {
    text = await file.text();
  } catch {
    toast('That file couldn’t be read.');
    return false;
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    await dialog({ title: 'That file can’t be used', message: parsed.error, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    return false;
  }
  const when = parsed.exportedAt ? `from ${dateTime(parsed.exportedAt)}` : '';
  const { habits, days, projects } = parsed.summary;
  const ok = await confirm({
    title: 'Restore this backup?',
    message: `This replaces everything in the app with the backup ${when} (${habits} habits, ${days} logged days, ${projects} projects). A safety copy of what’s here now is kept, so you can undo it from Settings.`,
    confirmLabel: 'Restore',
    danger: true,
  });
  if (!ok) return false;
  try {
    await store.importBackup(parsed);
    toast('Backup restored', { emoji: '✅' });
    return true;
  } catch (err) {
    toast(`Couldn’t restore the backup: ${err.message}`);
    return false;
  }
}

export async function undoImport() {
  const ok = await confirm({
    title: 'Go back to your earlier data?',
    message: 'This replaces the current data with the copy saved just before your last import.',
    confirmLabel: 'Go back',
    danger: true,
  });
  if (!ok) return;
  try {
    await store.restorePreImport();
    toast('Earlier data restored', { emoji: '↩️' });
  } catch (err) {
    toast(err.message);
  }
}
