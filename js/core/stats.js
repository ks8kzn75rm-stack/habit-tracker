/**
 * Streak calculations applied to real data.
 *
 * `ctx` is { habits, days: Map<key, record>, projects, settings, meta, today }.
 */
import { addDays, minKey, startOfWeek } from './dates.js';
import { isActiveOn, isDueOn, isWeekly, sectionOf, weekCompletions, weeklyTarget } from './schedule.js';
import { dayStats } from './scoring.js';
import { bestStreak, bestWeeklyStreak, currentStreak, weeklyStreak } from './streaks.js';

function firstDayOf(ctx) {
  return ctx.meta?.firstDay || [...ctx.days.keys()].sort()[0] || ctx.today;
}

export function isHabitDone(days, key, habitId) {
  return Boolean(days.get(key)?.done?.[habitId]);
}

/** Number of completions on `key` that belong to habits active that day. */
export function completionsOn(habits, record, key) {
  if (!record) return 0;
  let count = 0;
  for (const habit of habits) if (record.done[habit.id] && isActiveOn(habit, key)) count++;
  return count;
}

/**
 * Streak info for one habit. `best` (all-time) is skipped unless asked for,
 * since it means scanning the whole history.
 * Day habits: { unit: 'day', current, best, graceUsedThisWeek, todayDone }
 * Weekly-target habits: { unit: 'week', current, best, graceUsed, currentMet }
 */
export function habitStreak(habit, ctx, { withBest = true } = {}) {
  const { days, today, settings } = ctx;
  const weekStartsOn = settings.weekStartsOn ?? 1;
  const startKey = habit.createdDay || firstDayOf(ctx);
  const isDone = (key) => isHabitDone(days, key, habit.id);
  const endKey = habit.archivedDay ? minKey(today, addDays(habit.archivedDay, -1)) : today;

  if (isWeekly(habit)) {
    const target = weeklyTarget(habit);
    const isMet = (weekStart) => weekCompletions(habit, weekStart, (key) => isDone(key)) >= target;
    const currentWeek = startOfWeek(endKey, weekStartsOn);
    const firstWeek = startOfWeek(startKey, weekStartsOn);
    const current = weeklyStreak({ currentWeek, firstWeek, isMet });
    const best = withBest ? bestWeeklyStreak({ firstWeek, lastWeek: currentWeek, isMet }) : 0;
    return {
      unit: 'week',
      current: current.count,
      best: withBest ? Math.max(best, current.count) : null,
      graceUsed: current.graceWeeks > 0,
      currentMet: current.currentMet,
    };
  }

  const isDue = (key) => isDueOn(habit, key);
  const current = currentStreak({ today: endKey, startKey, isDue, isDone, weekStartsOn });
  const best = withBest ? bestStreak({ startKey, endKey, isDue, isDone, weekStartsOn }) : 0;
  return {
    unit: 'day',
    current: current.count,
    best: withBest ? Math.max(best, current.count) : null,
    graceUsedThisWeek: current.graceUsedThisWeek,
    todayDone: current.todayDone,
  };
}

/** Days in a row with at least one habit done (1 grace day per week). */
export function showingUpStreak(ctx, { withBest = true } = {}) {
  const { habits, days, today, settings } = ctx;
  const startKey = firstDayOf(ctx);
  const isDone = (key) => completionsOn(habits, days.get(key), key) > 0;
  const opts = { startKey, isDue: () => true, isDone, weekStartsOn: settings.weekStartsOn ?? 1 };
  const current = currentStreak({ ...opts, today });
  const best = withBest ? bestStreak({ ...opts, endKey: today }) : 0;
  return {
    current: current.count,
    best: withBest ? Math.max(best, current.count) : null,
    graceUsedThisWeek: current.graceUsedThisWeek,
    todayDone: current.todayDone,
  };
}

/** Days in a row with a Morning Win (only days with morning habits due count). */
export function morningWinStreak(ctx) {
  const { habits, days, projects, settings, today } = ctx;
  const cache = new Map();
  const statsFor = (key) => {
    if (!cache.has(key)) cache.set(key, dayStats(habits, days.get(key), key, settings, projects));
    return cache.get(key);
  };
  const hasMorning = habits.some((h) => !isWeekly(h) && sectionOf(h) === 'morning');
  if (!hasMorning) return { current: 0, best: 0, graceUsedThisWeek: false };
  const opts = {
    startKey: firstDayOf(ctx),
    isDue: (key) => statsFor(key).morningDue > 0,
    isDone: (key) => statsFor(key).morningWin,
    weekStartsOn: settings.weekStartsOn ?? 1,
  };
  const current = currentStreak({ ...opts, today });
  const best = bestStreak({ ...opts, endKey: today });
  return { current: current.count, best: Math.max(best, current.count), graceUsedThisWeek: current.graceUsedThisWeek };
}
