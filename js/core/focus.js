/**
 * Focus sessions and the evidence they leave behind.
 *
 * A running session is { id, startedAt, plannedMinutes, projectId, intent,
 * rescue, extended }. When it ends it becomes a session record in the
 * Evidence log. A long enough session ticks your deep-work habit for you.
 */
import { isDueOn } from './schedule.js';

export const FOCUS_PRESETS = Object.freeze([5, 25, 50, 90]);
export const MAX_SESSION_MINUTES = 240;
export const DEFAULT_DEEP_WORK_MINUTES = 90;

export function elapsedMs(active, now) {
  return Math.max(0, now - active.startedAt);
}

/** Where a running session is: { elapsedMinutes, plannedMinutes, ratio, reachedPlan }. */
export function sessionProgress(active, now) {
  const ms = elapsedMs(active, now);
  const plannedMs = active.plannedMinutes * 60000;
  return {
    elapsedMs: ms,
    elapsedMinutes: Math.floor(ms / 60000),
    plannedMinutes: active.plannedMinutes,
    ratio: plannedMs ? Math.min(1, ms / plannedMs) : 0,
    reachedPlan: ms >= plannedMs,
  };
}

/**
 * Minutes to log when a session ends. Ending early logs what you did; coming
 * back long after the planned end logs the plan (unless you chose to keep
 * going), so a forgotten timer doesn't inflate your evidence.
 */
export function minutesToLog(active, now) {
  const elapsed = Math.floor(elapsedMs(active, now) / 60000);
  const cap = active.extended ? MAX_SESSION_MINUTES : Math.min(active.plannedMinutes, MAX_SESSION_MINUTES);
  return Math.min(elapsed, cap);
}

/**
 * Habits to tick automatically after a session: those marked to tick after a
 * focus session, due that day, not done yet, when the session lasted at least
 * `deepWorkMinutes`.
 */
export function autoTickHabitIds({ habits, session, deepWorkMinutes, isDone }) {
  if (!session || session.kind !== 'focus' || session.minutes < deepWorkMinutes) return [];
  return habits
    .filter((h) => h.focusAuto && isDueOn(h, session.day) && !isDone(session.day, h.id))
    .map((h) => h.id);
}

export function sessionsBetween(sessions, fromKey, toKey) {
  return sessions.filter((s) => s.day >= fromKey && s.day <= toKey);
}

/** Gentle totals for the evidence log: { sessions, minutes, shipped, days }. */
export function evidenceSummary(sessions) {
  const focus = sessions.filter((s) => s.kind === 'focus');
  return {
    sessions: focus.length,
    minutes: focus.reduce((sum, s) => sum + s.minutes, 0),
    shipped: sessions.filter((s) => s.shipped).length,
    days: new Set(sessions.map((s) => s.day)).size,
  };
}

/** 95 -> "1h 35m", 25 -> "25 min", 0 -> "0 min" */
export function formatMinutes(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
