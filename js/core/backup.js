/** Backup file format, validation and the gentle backup reminder. */
import { diffDays } from './dates.js';
import {
  normalizeDay,
  normalizeHabit,
  normalizeMeta,
  normalizeProject,
  normalizeSettings,
} from './model.js';

export const BACKUP_APP = 'daybreak-habit-tracker';
export const BACKUP_SCHEMA = 1;
export const REMINDER_DAYS = 7;

export function backupFilename(dayKey) {
  return `daybreak-backup-${dayKey}.json`;
}

export function buildBackup({ habits, days, projects, settings, meta }, { appVersion = '', now = new Date() } = {}) {
  const dayList = [...(days instanceof Map ? days.values() : days)].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  );
  return {
    app: BACKUP_APP,
    schema: BACKUP_SCHEMA,
    appVersion,
    exportedAt: now.toISOString(),
    data: {
      habits: habits.map((h) => ({ ...h })),
      days: dayList.map((d) => ({ ...d, done: { ...d.done } })),
      projects: projects.map((p) => ({ ...p, steps: p.steps.map((s) => ({ ...s })) })),
      settings: { ...settings },
      meta: {
        installedAt: meta.installedAt,
        firstDay: meta.firstDay,
        badges: { ...meta.badges },
        exportCount: meta.exportCount,
        welcomed: meta.welcomed,
        installHintDismissed: meta.installHintDismissed,
      },
    },
  };
}

function uniqueBy(list, keyOf) {
  const seen = new Map();
  for (const item of list) seen.set(keyOf(item), item);
  return [...seen.values()];
}

/**
 * Parse and validate a backup (JSON text or an already-parsed object).
 * Returns { ok: true, data, exportedAt, summary } or { ok: false, error }.
 */
export function parseBackup(input) {
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch {
      return { ok: false, error: 'That file isn’t a valid backup (it couldn’t be read as JSON).' };
    }
  }
  if (!obj || typeof obj !== 'object' || obj.app !== BACKUP_APP || !obj.data || typeof obj.data !== 'object') {
    return { ok: false, error: 'That file doesn’t look like a Daybreak backup.' };
  }
  if (Number(obj.schema) > BACKUP_SCHEMA) {
    return {
      ok: false,
      error: 'This backup was made by a newer version of the app. Update the app, then try again.',
    };
  }

  const list = (value) => (Array.isArray(value) ? value : []);
  const d = obj.data;
  const habits = uniqueBy(list(d.habits).map(normalizeHabit).filter(Boolean), (h) => h.id);
  const days = uniqueBy(list(d.days).map(normalizeDay).filter(Boolean), (x) => x.date);
  const projects = uniqueBy(list(d.projects).map(normalizeProject).filter(Boolean), (p) => p.id);
  const settings = normalizeSettings(d.settings);
  const meta = normalizeMeta({ ...(d.meta || {}), initialized: true });
  const exportedAt = Date.parse(obj.exportedAt) || null;

  return {
    ok: true,
    data: { habits, days, projects, settings, meta },
    exportedAt,
    summary: {
      habits: habits.filter((h) => !h.archivedDay).length,
      days: days.filter((x) => Object.keys(x.done).length || x.note).length,
      projects: projects.length,
    },
  };
}

/**
 * Whether to show the "time for a backup?" card.
 * Shown once there's data worth keeping and 7+ calendar days have passed since
 * the last export (or since the first day of use). "Not now" hides it for the day.
 */
export function backupReminder({ todayKey, lastExportDay, firstDay, snoozedDay, hasData }) {
  if (!hasData || snoozedDay === todayKey) return null;
  const since = lastExportDay || firstDay;
  if (!since) return null;
  const days = diffDays(since, todayKey);
  if (days < REMINDER_DAYS) return null;
  return { days, neverBackedUp: !lastExportDay };
}
