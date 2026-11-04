/**
 * Calendar helpers built on "day keys": 'YYYY-MM-DD' strings for a local date.
 *
 * Calendar arithmetic is done on integer day numbers computed in UTC, so a
 * daylight-saving change can never shift a key by a day. Turning a moment into a
 * key always uses the device's local wall-clock time.
 */

export const DAY_MS = 86400000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toKey(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

export function parseKey(key) {
  const match = KEY_RE.exec(key);
  if (!match) throw new TypeError(`Invalid day key: ${key}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function isValidKey(key) {
  if (typeof key !== 'string') return false;
  const match = KEY_RE.exec(key);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  return dayNumToKey(Math.round(Date.UTC(y, m - 1, d) / DAY_MS)) === key;
}

// Streak and score calculations convert the same few thousand days over and
// over, so both directions are cached.
const CACHE_LIMIT = 20000;
const dayNumCache = new Map();
const keyCache = new Map();

/** Days since 1970-01-01 for a key. */
export function keyToDayNum(key) {
  let n = dayNumCache.get(key);
  if (n === undefined) {
    const { y, m, d } = parseKey(key);
    n = Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
    if (dayNumCache.size >= CACHE_LIMIT) dayNumCache.clear();
    dayNumCache.set(key, n);
  }
  return n;
}

export function dayNumToKey(n) {
  let key = keyCache.get(n);
  if (key === undefined) {
    const dt = new Date(n * DAY_MS);
    key = toKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    if (keyCache.size >= CACHE_LIMIT) keyCache.clear();
    keyCache.set(n, key);
  }
  return key;
}

/** Day number of the first day of the week containing day number `n`. */
export function weekStartNum(n, weekStartsOn = 1) {
  const weekday = (((n + 4) % 7) + 7) % 7;
  return n - ((weekday - weekStartsOn + 7) % 7);
}

export function addDays(key, n) {
  return dayNumToKey(keyToDayNum(key) + n);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from, to) {
  return keyToDayNum(to) - keyToDayNum(from);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key) {
  // 1970-01-01 was a Thursday (4).
  return (((keyToDayNum(key) + 4) % 7) + 7) % 7;
}

/** The first day of the week containing `key`. weekStartsOn: 1 = Monday, 0 = Sunday. */
export function startOfWeek(key, weekStartsOn = 1) {
  const offset = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

export function weekKeys(weekStart) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Inclusive list of keys from `from` to `to`. */
export function keysBetween(from, to) {
  const out = [];
  const end = keyToDayNum(to);
  for (let n = keyToDayNum(from); n <= end; n++) out.push(dayNumToKey(n));
  return out;
}

/** The calendar date of a moment, in local time. */
export function localKey(date) {
  return toKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

export function minutesIntoDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * The day a moment "belongs to". Before `dayStartMinutes` (e.g. 240 = 4:00am) a
 * check-in still counts towards the previous date, so late nights land on the
 * right day. Uses wall-clock time, so DST transitions are handled naturally.
 */
export function logicalDayKey(date, dayStartMinutes = 240) {
  const key = localKey(date);
  return minutesIntoDay(date) < dayStartMinutes ? addDays(key, -1) : key;
}

/** A local Date on calendar date `key` at `minutes` past midnight. */
export function localDateTime(key, minutes) {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}

/**
 * The moment during logical day `key` when the clock shows `minutes`.
 * Times earlier than the day start fall after midnight, on the next date.
 */
export function logicalMoment(key, minutes, dayStartMinutes = 240) {
  return localDateTime(minutes < dayStartMinutes ? addDays(key, 1) : key, minutes);
}

/** 'HH:MM' -> minutes past midnight, or null if invalid. */
export function parseHHMM(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** minutes past midnight -> 'HH:MM' */
export function toHHMM(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function minKey(a, b) {
  return a <= b ? a : b;
}

export function maxKey(a, b) {
  return a >= b ? a : b;
}
