/**
 * The weekly review: daily scores, Morning Wins, and per-habit completion rates
 * turned into "strongest" and "where to focus next".
 *
 * Today is treated as in progress: a habit done today counts, one not done yet
 * isn't held against you.
 */
import { weekKeys } from './dates.js';
import { tipFor } from './copy.js';
import { isActiveOn, isDueOn, isWeekly, sortHabits, weekCompletions, weeklyTarget } from './schedule.js';
import { dayStats } from './scoring.js';
import { isHabitDone } from './stats.js';

export const FOCUS_THRESHOLD = 0.8;

export function weekReview({ habits, days, projects, settings, weekStart, today }) {
  const keys = weekKeys(weekStart);
  const isDone = (key, id) => isHabitDone(days, key, id);

  const dayList = keys.map((key) => {
    const future = key > today;
    const stats = dayStats(habits, days.get(key), key, settings, projects);
    return {
      key,
      future,
      isToday: key === today,
      points: future ? 0 : stats.points,
      morningWin: !future && stats.morningWin,
      ratio: stats.ratio,
      doneCount: stats.doneCount,
      dueCount: stats.dueCount,
      completions: future ? 0 : stats.completions,
      note: days.get(key)?.note || '',
    };
  });

  const counted = dayList.filter((d) => !d.future);
  const total = counted.reduce((sum, d) => sum + d.points, 0);
  const morningWins = counted.filter((d) => d.morningWin).length;
  const completions = counted.reduce((sum, d) => sum + d.completions, 0);
  const bestDay = counted.reduce((best, d) => (d.points > (best?.points ?? 0) ? d : best), null);

  const rates = [];
  for (const habit of sortHabits(habits)) {
    if (isWeekly(habit)) continue;
    let due = 0;
    let done = 0;
    for (const key of keys) {
      if (key > today || !isDueOn(habit, key)) continue;
      const wasDone = isDone(key, habit.id);
      if (key === today && !wasDone) continue;
      due++;
      if (wasDone) done++;
    }
    if (due > 0) rates.push({ habit, due, done, rate: done / due });
  }

  const strongest = rates
    .filter((r) => r.done > 0)
    .sort((a, b) => b.rate - a.rate || b.done - a.done || b.habit.points - a.habit.points)
    .slice(0, 3);
  const focus = rates
    .filter((r) => r.rate < FOCUS_THRESHOLD && !strongest.includes(r))
    .sort((a, b) => a.rate - b.rate || b.due - a.due)
    .slice(0, 2)
    .map((r) => ({ ...r, tip: tipFor(r.habit) }));

  const weekly = sortHabits(habits)
    .filter((h) => isWeekly(h) && keys.some((key) => isActiveOn(h, key)))
    .map((habit) => {
      const count = weekCompletions(habit, weekStart, isDone);
      const target = weeklyTarget(habit);
      return { habit, count, target, met: count >= target };
    });

  return {
    weekStart,
    days: dayList,
    total,
    morningWins,
    completions,
    bestDay,
    strongest,
    focus,
    rates,
    weekly,
    notes: dayList.filter((d) => d.note).map((d) => ({ key: d.key, note: d.note })),
    hasData: completions > 0,
  };
}
