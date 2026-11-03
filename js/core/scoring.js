/**
 * Points, Morning Wins and levels.
 *
 * - Every completed habit earns its points (weekly-target sessions included).
 * - Morning Win: every morning habit due that day is done -> bonus points.
 * - Finishing a project earns PROJECT_BONUS on the day it was finished.
 * - Lifetime points are XP; levels get gradually further apart.
 */
import { isActiveOn, isScheduledOn, isWeekly, sectionOf } from './schedule.js';

export const PROJECT_BONUS = 50;
export const DEFAULT_MORNING_WIN_BONUS = 25;

export function projectPointsOn(projects, key) {
  let points = 0;
  for (const project of projects) if (project.completedDay === key) points += PROJECT_BONUS;
  return points;
}

/**
 * Everything about one day's score.
 * @param {Array} habits     all habits (archived ones included; activity is checked per day)
 * @param {object} [record]  the day's record: { date, done: { [habitId]: timestamp }, note }
 * @param {string} key       the day
 */
export function dayStats(habits, record, key, settings = {}, projects = []) {
  const done = record?.done || {};
  const bonusValue = Number.isFinite(settings.morningWinBonus)
    ? settings.morningWinBonus
    : DEFAULT_MORNING_WIN_BONUS;

  let base = 0;
  let dueCount = 0;
  let doneCount = 0;
  let morningDue = 0;
  let morningDone = 0;
  let weeklyDone = 0;
  let extraDone = 0;

  for (const habit of habits) {
    if (!isActiveOn(habit, key)) continue;
    const isDone = Boolean(done[habit.id]);
    const points = Number(habit.points) || 0;

    if (isWeekly(habit)) {
      if (isDone) {
        base += points;
        weeklyDone++;
      }
      continue;
    }
    if (!isScheduledOn(habit, key)) {
      // Done on a day it's no longer scheduled (e.g. the schedule changed later).
      if (isDone) {
        base += points;
        extraDone++;
      }
      continue;
    }

    dueCount++;
    if (isDone) {
      doneCount++;
      base += points;
    }
    if (sectionOf(habit) === 'morning') {
      morningDue++;
      if (isDone) morningDone++;
    }
  }

  const morningWin = morningDue > 0 && morningDone === morningDue;
  const bonus = morningWin ? bonusValue : 0;
  const projectPoints = projectPointsOn(projects, key);

  return {
    key,
    points: base + bonus + projectPoints,
    base,
    bonus,
    projectPoints,
    dueCount,
    doneCount,
    morningDue,
    morningDone,
    morningWin,
    weeklyDone,
    completions: doneCount + weeklyDone + extraDone,
    perfect: dueCount > 0 && doneCount === dueCount,
    ratio: dueCount ? doneCount / dueCount : 0,
  };
}

/** Lifetime points across every logged day and finished project. */
export function totalPoints(habits, days, settings = {}, projects = []) {
  const keys = new Set(days.keys());
  for (const project of projects) if (project.completedDay) keys.add(project.completedDay);
  let total = 0;
  for (const key of keys) total += dayStats(habits, days.get(key), key, settings, projects).points;
  return total;
}

export const LEVEL_TITLES = [
  'First Light',
  'Spark',
  'Kindling',
  'Glow',
  'Warmth',
  'Momentum',
  'Daybreak',
  'Bright Spell',
  'Clear Skies',
  'Sunrise',
  'Steady Flame',
  'Lighthouse',
  'Golden Hour',
  'High Noon',
  'Radiant',
  'Solstice',
  'Supernova',
];

/** XP needed to reach `level` (level 1 starts at 0; 2 at 100; 3 at 250; 4 at 450 …). */
export function xpForLevel(level) {
  return 25 * (level - 1) * (level + 2);
}

function roman(n) {
  const table = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, numeral] of table) {
    while (n >= value) {
      out += numeral;
      n -= value;
    }
  }
  return out;
}

export function levelTitle(level) {
  if (level <= LEVEL_TITLES.length) return LEVEL_TITLES[level - 1];
  const last = LEVEL_TITLES[LEVEL_TITLES.length - 1];
  return `${last} ${roman(level - LEVEL_TITLES.length + 1)}`;
}

export function levelInfo(xp) {
  const points = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  while (xpForLevel(level + 1) <= points) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    xp: points,
    floor,
    next,
    toNext: next - points,
    progress: (points - floor) / (next - floor),
  };
}
