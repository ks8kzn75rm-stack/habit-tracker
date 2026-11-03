/**
 * Shapes of stored records, and normalisers that turn untrusted input (old data,
 * imported backups) into clean, valid records.
 *
 * Habit:   { id, name, group, schedule, points, order, createdDay, archivedDay,
 *            windowCountdown, lightsOut, tip, projectId }
 * Day:     { date, done: { [habitId]: timestampMs }, note }
 * Project: { id, name, steps: [{ id, text, done }], maintenance, createdAt,
 *            completedDay, habitId, order }
 */
import { isValidKey } from './dates.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { GROUPS } from './schedule.js';

export const LIMITS = Object.freeze({ name: 80, note: 280, step: 120, project: 80, steps: 60 });

export function uid(prefix = '') {
  const c = globalThis.crypto;
  const id = c?.randomUUID
    ? c.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix + id;
}

/** Single-line, trimmed, length-limited text. */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function int(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function timestamp(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const keyOrNull = (value) => (isValidKey(value) ? value : null);
const idOrNull = (value) => (typeof value === 'string' && value ? value.slice(0, 64) : null);

export function normalizeSchedule(raw) {
  if (raw?.type === 'days') {
    const days = [
      ...new Set(
        (Array.isArray(raw.days) ? raw.days : [])
          .map(Number)
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ].sort((a, b) => a - b);
    if (days.length === 7 || days.length === 0) return { type: 'daily' };
    return { type: 'days', days };
  }
  if (raw?.type === 'weekly') return { type: 'weekly', target: int(raw.target, 1, 7, 2) };
  return { type: 'daily' };
}

export function normalizeHabit(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const name = cleanText(raw.name, LIMITS.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    group: GROUPS.includes(raw.group) ? raw.group : 'daytime',
    schedule: normalizeSchedule(raw.schedule),
    points: int(raw.points, 0, 500, 10),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
    createdDay: keyOrNull(raw.createdDay),
    archivedDay: keyOrNull(raw.archivedDay),
    windowCountdown: raw.windowCountdown === true,
    lightsOut: raw.lightsOut === true,
    tip: typeof raw.tip === 'string' ? raw.tip.slice(0, 32) : null,
    projectId: idOrNull(raw.projectId),
  };
}

export function normalizeDay(raw) {
  if (!raw || typeof raw !== 'object' || !isValidKey(raw.date)) return null;
  const done = {};
  if (raw.done && typeof raw.done === 'object') {
    for (const [id, value] of Object.entries(raw.done)) {
      if (!id || id.length > 64) continue;
      if (value === true) done[id] = 1;
      else {
        const t = timestamp(value);
        if (t) done[id] = t;
      }
    }
  }
  return { date: raw.date, done, note: cleanText(raw.note, LIMITS.note) };
}

export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const name = cleanText(raw.name, LIMITS.project);
  if (!id || !name) return null;

  const steps = (Array.isArray(raw.steps) ? raw.steps : [])
    .map((step) => {
      const stepId = idOrNull(step?.id);
      const text = cleanText(step?.text, LIMITS.step);
      return stepId && text ? { id: stepId, text, done: step.done === true } : null;
    })
    .filter(Boolean)
    .slice(0, LIMITS.steps);

  const m = raw.maintenance;
  const maintenanceName = cleanText(m?.name, LIMITS.name);
  const maintenance = maintenanceName
    ? {
        name: maintenanceName,
        group: GROUPS.includes(m.group) ? m.group : 'daytime',
        schedule: normalizeSchedule(m.schedule),
        points: int(m.points, 0, 500, 10),
      }
    : null;

  return {
    id,
    name,
    steps,
    maintenance,
    createdAt: timestamp(raw.createdAt) ?? Date.now(),
    completedDay: keyOrNull(raw.completedDay),
    habitId: idOrNull(raw.habitId),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
  };
}

export function normalizeSettings(raw) {
  const settings = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return settings;
  settings.dayStart = int(raw.dayStart, 0, 360, DEFAULT_SETTINGS.dayStart);
  settings.windowEnd = int(raw.windowEnd, 0, 1439, DEFAULT_SETTINGS.windowEnd);
  settings.lightsOut = int(raw.lightsOut, 0, 1439, DEFAULT_SETTINGS.lightsOut);
  settings.weekStartsOn = Number(raw.weekStartsOn) === 0 ? 0 : 1;
  settings.morningWinBonus = int(raw.morningWinBonus, 0, 500, DEFAULT_SETTINGS.morningWinBonus);
  settings.haptics = raw.haptics !== false;
  return settings;
}

export function normalizeMeta(raw) {
  const meta = raw && typeof raw === 'object' ? raw : {};
  const badges = {};
  if (meta.badges && typeof meta.badges === 'object') {
    for (const [id, when] of Object.entries(meta.badges)) {
      if (typeof id === 'string' && id.length <= 40 && isValidKey(when)) badges[id] = when;
    }
  }
  return {
    initialized: meta.initialized === true,
    installedAt: timestamp(meta.installedAt),
    firstDay: keyOrNull(meta.firstDay),
    lastExportAt: timestamp(meta.lastExportAt),
    exportCount: int(meta.exportCount, 0, 1e6, 0),
    badges,
    backupSnoozedDay: keyOrNull(meta.backupSnoozedDay),
    installHintDismissed: meta.installHintDismissed === true,
    welcomed: meta.welcomed === true,
  };
}
