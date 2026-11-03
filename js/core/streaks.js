/**
 * Forgiving streaks.
 *
 * Day streaks (daily / weekday habits, "showing up", Morning Wins):
 *  - Count the due days that were completed, walking back from today.
 *  - Days that aren't due are skipped: they neither count nor break anything.
 *  - Today is "in progress": it counts once done, but never breaks a streak.
 *  - Each calendar week allows `graceDaysPerWeek` missed due days (default 1).
 *    A grace day keeps the streak alive without adding to it. Only a second miss
 *    in the same week ends the streak.
 *
 * Week streaks (weekly-target habits):
 *  - Count weeks in a row where the target was met. The current week counts
 *    once met and never breaks the streak while it's in progress.
 *  - A single missed week is forgiven; two missed weeks in a row end it.
 */
import { addDays, dayNumToKey, keyToDayNum, weekStartNum } from './dates.js';

/**
 * @param {object} o
 * @param {string} o.today       logical today
 * @param {string} o.startKey    first day that can count (e.g. when the habit was added)
 * @param {(key: string) => boolean} o.isDue
 * @param {(key: string) => boolean} o.isDone
 * @param {number} [o.weekStartsOn=1]
 * @param {number} [o.graceDaysPerWeek=1]
 */
export function currentStreak({ today, startKey, isDue, isDone, weekStartsOn = 1, graceDaysPerWeek = 1 }) {
  const result = { count: 0, graceDays: [], graceUsedThisWeek: false, todayDone: false };
  if (!startKey || today < startKey) return result;

  if (isDue(today) && isDone(today)) {
    result.count = 1;
    result.todayDone = true;
  }

  const start = keyToDayNum(startKey);
  const todayNum = keyToDayNum(today);
  const graceByWeek = new Map();
  // A forgiven miss only matters if the streak carries on past it. Misses older
  // than the start of the streak are held here and dropped at the end.
  const pending = [];
  for (let n = todayNum - 1; n >= start; n--) {
    const key = dayNumToKey(n);
    if (!isDue(key)) continue;
    if (isDone(key)) {
      result.count++;
      if (pending.length) {
        result.graceDays.push(...pending);
        pending.length = 0;
      }
      continue;
    }
    const week = weekStartNum(n, weekStartsOn);
    const used = graceByWeek.get(week) || 0;
    if (used >= graceDaysPerWeek) break;
    graceByWeek.set(week, used + 1);
    pending.push(key);
  }
  const thisWeek = weekStartNum(todayNum, weekStartsOn);
  result.graceUsedThisWeek = result.graceDays.some((key) => weekStartNum(keyToDayNum(key), weekStartsOn) === thisWeek);
  return result;
}

/**
 * The longest streak (same rules as `currentStreak`) ending on any day in
 * [startKey, endKey]. Runs in a single forward pass.
 *
 * Walking back from a day, the latest `grace` misses of each week are forgiven
 * and the next one ends the walk. So the streak ending on day e covers the done
 * days after the most recent "breaking" miss. Moving forward we only need to
 * track misses in the current week to know where that break is.
 */
export function bestStreak({ startKey, endKey, isDue, isDone, weekStartsOn = 1, graceDaysPerWeek = 1 }) {
  if (!startKey || !endKey || endKey < startKey) return 0;
  const start = keyToDayNum(startKey);
  const end = keyToDayNum(endKey);
  // doneUpTo[n - start + 1] = completed due days from start to day n
  const doneUpTo = new Int32Array(end - start + 2);
  let done = 0;
  let best = 0;
  let breakAt = start - 1;
  let week = null;
  let misses = [];

  for (let n = start; n <= end; n++) {
    const wk = weekStartNum(n, weekStartsOn);
    if (wk !== week) {
      week = wk;
      misses = [];
    }
    const key = dayNumToKey(n);
    if (isDue(key)) {
      if (isDone(key)) {
        done++;
        best = Math.max(best, done - doneUpTo[breakAt - start + 1]);
      } else {
        misses.push(n);
        if (misses.length > graceDaysPerWeek) breakAt = misses[misses.length - 1 - graceDaysPerWeek];
      }
    }
    doneUpTo[n - start + 1] = done;
  }
  return best;
}

/**
 * @param {object} o
 * @param {string} o.currentWeek  week-start key of this week
 * @param {string} o.firstWeek    week-start key of the first week that can count
 * @param {(weekStart: string) => boolean} o.isMet
 */
export function weeklyStreak({ currentWeek, firstWeek, isMet }) {
  const result = { count: 0, graceWeeks: 0, currentMet: false };
  if (!firstWeek || currentWeek < firstWeek) return result;
  result.currentMet = isMet(currentWeek);
  if (result.currentMet) result.count = 1;

  let previousMissed = false;
  for (let wk = addDays(currentWeek, -7); wk >= firstWeek; wk = addDays(wk, -7)) {
    if (isMet(wk)) {
      result.count++;
      previousMissed = false;
    } else {
      if (previousMissed) break;
      previousMissed = true;
      result.graceWeeks++;
    }
  }
  return result;
}

export function bestWeeklyStreak({ firstWeek, lastWeek, isMet }) {
  if (!firstWeek || !lastWeek || lastWeek < firstWeek) return 0;
  let run = 0;
  let best = 0;
  let previousMissed = false;
  for (let wk = firstWeek; wk <= lastWeek; wk = addDays(wk, 7)) {
    if (isMet(wk)) {
      run++;
      best = Math.max(best, run);
      previousMissed = false;
    } else {
      if (previousMissed) run = 0;
      previousMissed = true;
    }
  }
  return best;
}
