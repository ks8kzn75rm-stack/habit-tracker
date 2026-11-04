/**
 * Shapes of stored records, and normalisers that turn untrusted input (old data,
 * imported backups) into clean, valid records.
 *
 * Habit:    { id, name, group, schedule, points, order, createdDay, archivedDay,
 *             windowCountdown, lightsOut, ritual, focusAuto, tip, projectId }
 * Day:      { date, done: { [habitId]: timestampMs }, note }
 * Project:  { id, name, status, steps: [{ id, text, done }], maintenance,
 *             createdAt, completedDay, habitId, order }
 * Journal:  { date, ritual, reflection }                 (one per day)
 * Session:  { id, kind, day, startedAt, endedAt, minutes, plannedMinutes,
 *             projectId, intent, rescue, shipped, shippedNote }
 * Card:     { id, custom, theme, text, credit, favourite, hidden }
 */
import { THEME_IDS } from './cards.js';
import { isValidKey } from './dates.js';
import { DEFAULT_SETTINGS } from './defaults.js';
import { MAX_SESSION_MINUTES } from './focus.js';
import { ARRIVAL_IDS, RESISTANCE_FORMS, cleanWord } from './ritual.js';
import { GROUPS } from './schedule.js';

export const LIMITS = Object.freeze({
  name: 80,
  note: 280,
  step: 120,
  project: 80,
  steps: 60,
  why: 600,
  letter: 4000,
  joy: 80,
  joys: 20,
  opportunity: 400,
  card: 320,
  credit: 120,
  inbox: 500,
  inboxItems: 300,
  reflection: 200,
  intent: 120,
  lettingGo: 120,
  shippedNote: 160,
  seasonLabel: 40,
});

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

/** Multi-line text: keeps paragraphs, tidies spaces, at most one blank line in a row. */
export function cleanMultiline(value, max) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
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
    ritual: raw.ritual === true,
    focusAuto: raw.focusAuto === true,
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
    status: raw.status === 'parked' ? 'parked' : 'active',
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
  settings.ritualEnabled = raw.ritualEnabled !== false;
  settings.breathSeconds = [30, 45, 60].includes(Number(raw.breathSeconds)) ? Number(raw.breathSeconds) : DEFAULT_SETTINGS.breathSeconds;
  settings.focusMinutes = int(raw.focusMinutes, 1, MAX_SESSION_MINUTES, DEFAULT_SETTINGS.focusMinutes);
  settings.deepWorkMinutes = int(raw.deepWorkMinutes, 5, MAX_SESSION_MINUTES, DEFAULT_SETTINGS.deepWorkMinutes);
  settings.lifeWeeksEnabled = raw.lifeWeeksEnabled === true;
  settings.birthDate = keyOrNull(raw.birthDate);
  settings.seasonEnabled = raw.seasonEnabled === true;
  settings.seasonEnd = keyOrNull(raw.seasonEnd);
  settings.seasonLabel = cleanText(raw.seasonLabel, LIMITS.seasonLabel);
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
    dataVersion: int(meta.dataVersion, 1, 1000, 1),
    ritualOfferedDay: keyOrNull(meta.ritualOfferedDay),
    ritualIntroSeen: meta.ritualIntroSeen === true,
    tuneUps: cleanDayMap(meta.tuneUps),
    notices: Array.isArray(meta.notices) ? meta.notices.filter((n) => typeof n === 'string').map((n) => n.slice(0, 300)).slice(0, 5) : [],
  };
}

function cleanDayMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) {
      const t = timestamp(value);
      if (isValidKey(key) && t) out[key] = t;
    }
  }
  return out;
}

// ------------------------------------------------------------ Begin & co.

const minutesOfDay = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 && n < 1440 ? n : null;
};

export function normalizeRitual(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const main = raw.mainThing;
  const mainText = cleanText(main?.text, LIMITS.intent);
  const plan = raw.plan;
  const ritual = {
    arrival: ARRIVAL_IDS.includes(raw.arrival) ? raw.arrival : null,
    breathed: raw.breathed === true,
    cardId: idOrNull(raw.cardId),
    line: cleanText(raw.line, LIMITS.why) || null,
    mainThing: main && (mainText || idOrNull(main.projectId)) ? { projectId: idOrNull(main.projectId), text: mainText } : null,
    lettingGo: cleanText(raw.lettingGo, LIMITS.lettingGo),
    plan: plan && typeof plan === 'object' ? { startAt: minutesOfDay(plan.startAt), minutes: int(plan.minutes, 1, MAX_SESSION_MINUTES, 25) } : null,
    completedAt: timestamp(raw.completedAt),
    skippedAt: timestamp(raw.skippedAt),
  };
  return ritual;
}

const SHOWED_UP = ['yes', 'partly', 'rest'];

export function normalizeReflection(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    showedUp: SHOWED_UP.includes(raw.showedUp) ? raw.showedUp : null,
    joy: cleanText(raw.joy, LIMITS.reflection),
    lettingGo: cleanText(raw.lettingGo, LIMITS.reflection),
    tomorrowWord: cleanWord(raw.tomorrowWord),
    savedAt: timestamp(raw.savedAt),
  };
}

export function normalizeJournal(raw) {
  if (!raw || typeof raw !== 'object' || !isValidKey(raw.date)) return null;
  return { date: raw.date, ritual: normalizeRitual(raw.ritual), reflection: normalizeReflection(raw.reflection) };
}

export function isJournalEmpty(entry) {
  return !entry || (!entry.ritual && !entry.reflection);
}

const RESCUE_IDS = RESISTANCE_FORMS.map((f) => f.id);

export function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  if (!id || !isValidKey(raw.day)) return null;
  const kind = raw.kind === 'shipped' ? 'shipped' : 'focus';
  const startedAt = timestamp(raw.startedAt);
  if (!startedAt) return null;
  const minutes = kind === 'focus' ? int(raw.minutes, 0, MAX_SESSION_MINUTES, 0) : 0;
  return {
    id,
    kind,
    day: raw.day,
    startedAt,
    endedAt: timestamp(raw.endedAt) ?? startedAt + minutes * 60000,
    minutes,
    plannedMinutes: kind === 'focus' ? int(raw.plannedMinutes, 1, MAX_SESSION_MINUTES, Math.max(1, minutes)) : 0,
    projectId: idOrNull(raw.projectId),
    intent: cleanText(raw.intent, LIMITS.intent),
    rescue: RESCUE_IDS.includes(raw.rescue) ? raw.rescue : null,
    shipped: kind === 'shipped' ? true : raw.shipped === true,
    shippedNote: cleanText(raw.shippedNote, LIMITS.shippedNote),
  };
}

export function normalizeActiveSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  const startedAt = timestamp(raw.startedAt);
  if (!id || !startedAt) return null;
  return {
    id,
    startedAt,
    plannedMinutes: int(raw.plannedMinutes, 1, MAX_SESSION_MINUTES, 25),
    projectId: idOrNull(raw.projectId),
    intent: cleanText(raw.intent, LIMITS.intent),
    rescue: RESCUE_IDS.includes(raw.rescue) ? raw.rescue : null,
    extended: raw.extended === true,
  };
}

export function normalizeCardRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = idOrNull(raw.id);
  if (!id) return null;
  const custom = raw.custom === true;
  const text = cleanText(raw.text, LIMITS.card);
  if (custom && !text) return null;
  return {
    id,
    custom,
    theme: THEME_IDS.includes(raw.theme) ? raw.theme : custom ? 'joy' : null,
    text,
    credit: cleanText(raw.credit, LIMITS.credit),
    favourite: raw.favourite === true,
    hidden: raw.hidden === true,
  };
}

/** A card record with nothing to remember can be deleted. */
export function isCardRecordEmpty(record) {
  return !record.custom && !record.text && !record.favourite && !record.hidden;
}

export function normalizeFoundations(raw) {
  const f = raw && typeof raw === 'object' ? raw : {};
  const joys = (Array.isArray(f.joys) ? f.joys : [])
    .map((j) => cleanText(j, LIMITS.joy))
    .filter(Boolean)
    .slice(0, LIMITS.joys);
  return {
    why: cleanMultiline(f.why, LIMITS.why),
    letter: cleanMultiline(f.letter, LIMITS.letter),
    joys: [...new Set(joys)],
    opportunity: cleanMultiline(f.opportunity, LIMITS.opportunity),
    updatedAt: timestamp(f.updatedAt),
  };
}

export function normalizeInbox(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => {
      const id = idOrNull(item?.id);
      const text = cleanMultiline(item?.text, LIMITS.inbox);
      return id && text ? { id, text, createdAt: timestamp(item.createdAt) ?? Date.now() } : null;
    })
    .filter(Boolean)
    .slice(-LIMITS.inboxItems);
}
