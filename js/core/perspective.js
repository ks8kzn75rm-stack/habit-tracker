/**
 * Perspective views (both optional, off by default):
 *  - Life in weeks: a grid of roughly four thousand weeks, from a birth date.
 *  - This season: the weeks left until an end date you choose, framed as an
 *    invitation ("N weeks to make count"), never as an alarm.
 * All arithmetic uses day keys, so time zones and DST can't shift it.
 */
import { diffDays, isValidKey } from './dates.js';

export const LIFE_WEEKS = 4000;
export const WEEKS_PER_ROW = 52;

/** Whole weeks from `fromKey` to `toKey` (0 within the first week). */
export function weeksBetween(fromKey, toKey) {
  return Math.floor(diffDays(fromKey, toKey) / 7);
}

/**
 * { lived, currentIndex, total, rows, years } or null if the birth date is
 * missing or in the future. `currentIndex` is this week's cell (0-based).
 */
export function lifeInWeeks(birthKey, todayKey, total = LIFE_WEEKS) {
  if (!isValidKey(birthKey) || !isValidKey(todayKey) || birthKey > todayKey) return null;
  const lived = weeksBetween(birthKey, todayKey);
  return {
    lived,
    currentIndex: Math.min(lived, total - 1),
    total: Math.max(total, lived + 1),
    rows: Math.ceil(Math.max(total, lived + 1) / WEEKS_PER_ROW),
    years: Math.floor(diffDays(birthKey, todayKey) / 365.25),
  };
}

/**
 * Weeks left in a season ending on `endKey` (inclusive). Partial weeks count as
 * a week, so the final days still read "1 week to make count".
 * { days, weeks, ended }
 */
export function seasonWeeks(todayKey, endKey) {
  if (!isValidKey(todayKey) || !isValidKey(endKey)) return null;
  const days = diffDays(todayKey, endKey) + 1;
  if (days <= 0) return { days: 0, weeks: 0, ended: true };
  return { days, weeks: Math.ceil(days / 7), ended: false };
}

export function seasonPhrase(season) {
  if (!season) return '';
  if (season.ended) return 'This season has come to a close. What will the next one be for?';
  return `${season.weeks} ${season.weeks === 1 ? 'week' : 'weeks'} to make count`;
}
