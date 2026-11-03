/**
 * Habit scheduling.
 *
 * A habit's `schedule` is one of:
 *   { type: 'daily' }
 *   { type: 'days', days: [1, 3, 5] }     // weekdays, 0 = Sunday … 6 = Saturday
 *   { type: 'weekly', target: 2 }         // N times per week, any days
 *
 * Daily and weekday habits are "due" on their days. Weekly-target habits are never
 * due on a particular day; they live in their own "This week" section.
 */
import { addDays, startOfWeek, weekdayOf } from './dates.js';

export const GROUPS = ['morning', 'daytime', 'evening'];
export const SECTIONS = ['morning', 'daytime', 'evening', 'weekly'];

export function isWeekly(habit) {
  return habit?.schedule?.type === 'weekly';
}

/** Which Today section a habit appears in. */
export function sectionOf(habit) {
  if (isWeekly(habit)) return 'weekly';
  return GROUPS.includes(habit.group) ? habit.group : 'daytime';
}

/** Whether the habit existed (and wasn't removed) on `key`. */
export function isActiveOn(habit, key) {
  if (habit.createdDay && key < habit.createdDay) return false;
  if (habit.archivedDay && key >= habit.archivedDay) return false;
  return true;
}

/** Whether the schedule includes `key` (ignores created/archived dates). */
export function isScheduledOn(habit, key) {
  const schedule = habit.schedule;
  if (!schedule || schedule.type === 'daily') return true;
  if (schedule.type === 'days') return Array.isArray(schedule.days) && schedule.days.includes(weekdayOf(key));
  return false;
}

export function isDueOn(habit, key) {
  return !isWeekly(habit) && isActiveOn(habit, key) && isScheduledOn(habit, key);
}

export function weeklyTarget(habit) {
  if (!isWeekly(habit)) return 0;
  const target = Math.round(Number(habit.schedule.target) || 1);
  return Math.min(7, Math.max(1, target));
}

/**
 * Completions of a habit during the week starting `weekStart`.
 * `isDone(key, habitId)` answers whether the habit was done on a day.
 */
export function weekCompletions(habit, weekStart, isDone) {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const key = addDays(weekStart, i);
    if (isActiveOn(habit, key) && isDone(key, habit.id)) count++;
  }
  return count;
}

export function weeklyProgress(habit, key, isDone, weekStartsOn = 1) {
  const weekStart = startOfWeek(key, weekStartsOn);
  const count = weekCompletions(habit, weekStart, isDone);
  const target = weeklyTarget(habit);
  return { count, target, met: count >= target, weekStart };
}

export function sortHabits(habits) {
  return [...habits].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name)),
  );
}

/** Habits to show on `key`, grouped into Today sections. */
export function sectionsForDay(habits, key) {
  const sections = { morning: [], daytime: [], evening: [], weekly: [] };
  for (const habit of sortHabits(habits)) {
    if (!isActiveOn(habit, key)) continue;
    if (isWeekly(habit)) sections.weekly.push(habit);
    else if (isScheduledOn(habit, key)) sections[sectionOf(habit)].push(habit);
  }
  return sections;
}
