/**
 * Badges. They're computed from your data, and once earned they're kept for
 * good (the store records the day each was first earned).
 */
import { diffDays, startOfWeek } from './dates.js';
import { isWeekly, weekCompletions, weeklyTarget } from './schedule.js';
import { dayStats, levelInfo, totalPoints } from './scoring.js';
import { isHabitDone, showingUpStreak } from './stats.js';

export const BADGES = [
  { id: 'first-step', emoji: '👣', title: 'First step', desc: 'Complete your first habit', test: (s) => s.completions >= 1 },
  { id: 'morning-win', emoji: '☀️', title: 'Morning Win', desc: 'Finish every morning habit in a day', test: (s) => s.morningWins >= 1 },
  { id: 'hat-trick', emoji: '🎩', title: 'Hat-trick', desc: '3 Morning Wins in one week', test: (s) => s.maxWinsInWeek >= 3 },
  { id: 'golden-week', emoji: '🌅', title: 'Golden week', desc: '5 Morning Wins in one week', test: (s) => s.maxWinsInWeek >= 5 },
  { id: 'full-house', emoji: '🎉', title: 'Full house', desc: 'Every habit done in a day', test: (s) => s.perfectDays >= 1 },
  { id: 'on-a-roll', emoji: '🔥', title: 'On a roll', desc: '7-day showing-up streak', test: (s) => s.bestShowingUp >= 7 },
  { id: 'fortnight', emoji: '⚡', title: 'Fortnight strong', desc: '14-day showing-up streak', test: (s) => s.bestShowingUp >= 14 },
  { id: 'month', emoji: '🌟', title: 'Month of momentum', desc: '30-day showing-up streak', test: (s) => s.bestShowingUp >= 30 },
  { id: 'goal-getter', emoji: '💪', title: 'Goal getter', desc: 'Hit a weekly target', test: (s) => s.weeklyGoalMet },
  { id: 'early-bird', emoji: '🐦', title: 'Early bird', desc: 'Complete a morning-window habit 5 times', test: (s) => s.windowDone >= 5 },
  { id: 'finisher', emoji: '🏁', title: 'Finisher', desc: 'Complete a project', test: (s) => s.projectsDone >= 1 },
  { id: 'reflective', emoji: '📝', title: 'Reflective', desc: 'Write a daily note on 7 days', test: (s) => s.notes >= 7 },
  { id: 'comeback', emoji: '🌱', title: 'Comeback', desc: 'Pick things back up after a few days away', test: (s) => s.comeback },
  { id: 'safe-keeper', emoji: '🛟', title: 'Safe keeper', desc: 'Back up your data', test: (s) => s.backedUp },
  { id: 'centurion', emoji: '💯', title: 'Centurion', desc: '100 habits completed', test: (s) => s.completions >= 100 },
  { id: 'level-5', emoji: '⭐', title: 'Rising', desc: 'Reach level 5', test: (s) => s.level >= 5 },
  { id: 'level-10', emoji: '🏆', title: 'Shining', desc: 'Reach level 10', test: (s) => s.level >= 10 },
];

export function badgeStats(ctx) {
  const { habits, days, projects, settings, meta } = ctx;
  const stats = {
    completions: 0,
    morningWins: 0,
    maxWinsInWeek: 0,
    perfectDays: 0,
    notes: 0,
    windowDone: 0,
    weeklyGoalMet: false,
    comeback: false,
    projectsDone: projects.filter((p) => p.completedDay).length,
    backedUp: (meta.exportCount || 0) > 0,
    bestShowingUp: showingUpStreak(ctx).best,
    xp: totalPoints(habits, days, settings, projects),
    level: 1,
  };
  stats.level = levelInfo(stats.xp).level;

  const windowIds = new Set(habits.filter((h) => h.windowCountdown).map((h) => h.id));
  const winsByWeek = new Map();
  const activeKeys = [];
  for (const key of [...days.keys()].sort()) {
    const record = days.get(key);
    const s = dayStats(habits, record, key, settings, projects);
    stats.completions += s.completions;
    if (s.completions > 0) activeKeys.push(key);
    if (s.perfect) stats.perfectDays++;
    if (s.morningWin) {
      stats.morningWins++;
      const week = startOfWeek(key, settings.weekStartsOn ?? 1);
      winsByWeek.set(week, (winsByWeek.get(week) || 0) + 1);
    }
    if (record.note) stats.notes++;
    for (const id of Object.keys(record.done)) if (windowIds.has(id)) stats.windowDone++;
  }
  stats.maxWinsInWeek = Math.max(0, ...winsByWeek.values());

  for (let i = 1; i < activeKeys.length; i++) {
    if (diffDays(activeKeys[i - 1], activeKeys[i]) >= 4) {
      stats.comeback = true;
      break;
    }
  }

  const isDone = (key, id) => isHabitDone(days, key, id);
  outer: for (const habit of habits.filter(isWeekly)) {
    const weeks = new Set();
    for (const key of days.keys()) if (days.get(key).done[habit.id]) weeks.add(startOfWeek(key, settings.weekStartsOn ?? 1));
    for (const week of weeks) {
      if (weekCompletions(habit, week, isDone) >= weeklyTarget(habit)) {
        stats.weeklyGoalMet = true;
        break outer;
      }
    }
  }
  return stats;
}

export function earnedBadgeIds(stats) {
  return BADGES.filter((badge) => badge.test(stats)).map((badge) => badge.id);
}
