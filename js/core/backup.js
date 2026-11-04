/** Backup file format, validation and the gentle backup reminder. */
import { diffDays } from './dates.js';
import {
  isCardRecordEmpty,
  isJournalEmpty,
  normalizeCardRecord,
  normalizeDay,
  normalizeFoundations,
  normalizeHabit,
  normalizeInbox,
  normalizeJournal,
  normalizeMeta,
  normalizeProject,
  normalizeSession,
  normalizeSettings,
} from './model.js';

export const BACKUP_APP = 'daybreak-habit-tracker';
/** 1: habits, days, projects. 2: adds the journal, sessions, cards, foundations, inbox. */
export const BACKUP_SCHEMA = 2;
export const REMINDER_DAYS = 7;

export function backupFilename(dayKey) {
  return `daybreak-backup-${dayKey}.json`;
}

const values = (collection) => [...(collection instanceof Map ? collection.values() : collection || [])];

export function buildBackup(
  { habits, days, projects, settings, meta, journal = [], sessions = [], cardRecords = [], foundations = {}, inbox = [] },
  { appVersion = '', now = new Date() } = {},
) {
  const dayList = values(days).sort((a, b) => (a.date < b.date ? -1 : 1));
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
      journal: values(journal).map((j) => structuredClone(j)).sort((a, b) => (a.date < b.date ? -1 : 1)),
      sessions: values(sessions).map((s) => ({ ...s })).sort((a, b) => a.startedAt - b.startedAt),
      cards: values(cardRecords).map((c) => ({ ...c })),
      foundations: structuredClone(foundations),
      inbox: values(inbox).map((i) => ({ ...i })),
      meta: {
        installedAt: meta.installedAt,
        firstDay: meta.firstDay,
        badges: { ...meta.badges },
        exportCount: meta.exportCount,
        welcomed: meta.welcomed,
        installHintDismissed: meta.installHintDismissed,
        dataVersion: meta.dataVersion,
        ritualIntroSeen: meta.ritualIntroSeen,
        tuneUps: { ...meta.tuneUps },
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
  // A version 1 file has no dataVersion: the store migrates it after import.
  const meta = normalizeMeta({ ...(d.meta || {}), initialized: true, dataVersion: Number(obj.schema) >= 2 ? d.meta?.dataVersion : 1 });
  const journal = uniqueBy(list(d.journal).map(normalizeJournal).filter((j) => j && !isJournalEmpty(j)), (j) => j.date);
  const sessions = uniqueBy(list(d.sessions).map(normalizeSession).filter(Boolean), (s) => s.id);
  const cardRecords = uniqueBy(list(d.cards).map(normalizeCardRecord).filter((c) => c && !isCardRecordEmpty(c)), (c) => c.id);
  const foundations = normalizeFoundations(d.foundations);
  const inbox = normalizeInbox(d.inbox);
  const exportedAt = Date.parse(obj.exportedAt) || null;

  return {
    ok: true,
    data: { habits, days, projects, settings, meta, journal, sessions, cardRecords, foundations, inbox },
    exportedAt,
    summary: {
      habits: habits.filter((h) => !h.archivedDay).length,
      days: days.filter((x) => Object.keys(x.done).length || x.note).length,
      projects: projects.length,
      sessions: sessions.filter((s) => s.kind === 'focus').length,
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
