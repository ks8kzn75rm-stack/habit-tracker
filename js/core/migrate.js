/**
 * Data migrations. Pure and idempotent, and they never delete anything.
 *
 * Version 2 (the Begin ritual):
 *  - adds the "Began my day with intention" morning habit. If today already
 *    has ticks, it starts tomorrow, so today's score and Morning Win can't drop
 *    the moment the app updates;
 *  - lets the starter deep-work habit tick itself after a long focus session;
 *  - keeps at most three projects active; any extras move to the parking lot.
 */
import { addDays } from './dates.js';
import { createRitualHabit } from './defaults.js';
import { sectionOf } from './schedule.js';
import { ACTIVE_LIMIT } from './wip.js';

export const DATA_VERSION = 2;

const dayRecord = (days, key) => (days instanceof Map ? days.get(key) : (days || []).find((d) => d.date === key));
const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0);

/**
 * @param {{ habits: object[], days: Map|object[], projects: object[], meta: object }} data
 * @param {{ todayKey: string }} options
 * @returns {{ data, changed: boolean, notices: string[], touched: { habits: string[], projects: string[] } }}
 */
export function migrateData(data, { todayKey }) {
  const meta = data.meta || {};
  const from = Number(meta.dataVersion) || 1;
  const touched = { habits: [], projects: [] };
  if (from >= DATA_VERSION) return { data, changed: false, notices: [], touched };

  let habits = [...(data.habits || [])];
  let projects = [...(data.projects || [])];
  const notices = [];

  if (!habits.some((h) => h.ritual)) {
    const today = dayRecord(data.days, todayKey);
    const dayUnderway = Boolean(today && Object.keys(today.done || {}).length);
    const morning = habits.filter((h) => !h.archivedDay && sectionOf(h) === 'morning').map((h) => h.order ?? 0);
    const order = morning.length ? Math.min(...morning) - 1 : 0;
    const habit = createRitualHabit(dayUnderway ? addDays(todayKey, 1) : todayKey, order);
    if (habits.some((h) => h.id === habit.id)) habit.id = `${habit.id}-2`;
    habits.push(habit);
    touched.habits.push(habit.id);
    notices.push(dayUnderway ? 'ritual-tomorrow' : 'ritual');
  }

  if (!habits.some((h) => h.focusAuto)) {
    const deep = habits.find((h) => h.id === 'd-deep-work' && !h.archivedDay);
    if (deep) {
      habits = habits.map((h) => (h === deep ? { ...h, focusAuto: true } : h));
      touched.habits.push(deep.id);
    }
  }

  const active = projects.filter((p) => !p.completedDay && p.status !== 'parked').sort(byOrder);
  const overflow = active.slice(ACTIVE_LIMIT);
  if (overflow.length) {
    const ids = new Set(overflow.map((p) => p.id));
    projects = projects.map((p) => (ids.has(p.id) ? { ...p, status: 'parked' } : p));
    touched.projects.push(...ids);
    notices.push(`parked:${overflow.map((p) => p.name).join(', ')}`);
  }

  return {
    data: { ...data, habits, projects, meta: { ...meta, dataVersion: DATA_VERSION } },
    changed: true,
    notices,
    touched,
  };
}
