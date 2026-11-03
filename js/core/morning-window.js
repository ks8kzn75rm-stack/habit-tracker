/**
 * The "Morning window": a countdown to a set time (default 10:00) for habits
 * that are best done early, shown on the days they're scheduled.
 */
import { logicalMoment } from './dates.js';

/**
 * @param {object} o
 * @param {Date} o.now
 * @param {string} o.dayKey       logical day being shown
 * @param {number} o.dayStart     minutes past midnight when a new day starts
 * @param {number} o.windowEnd    minutes past midnight when the window closes
 * @param {number} [o.doneAt]     completion timestamp, if done
 */
export function morningWindowStatus({ now, dayKey, dayStart, windowEnd, doneAt }) {
  const deadline = logicalMoment(dayKey, windowEnd, dayStart);
  const deadlineMs = deadline.getTime();
  if (doneAt) return { state: 'done', deadline, beatWindow: doneAt <= deadlineMs, remainingMs: 0 };
  const remainingMs = deadlineMs - now.getTime();
  if (remainingMs > 0) return { state: 'open', deadline, remainingMs };
  return { state: 'closed', deadline, remainingMs: 0 };
}

/** 5_400_000 -> "1h 30m", 600_000 -> "10m", 30_000 -> "under a minute" */
export function formatRemaining(ms) {
  if (!(ms >= 60000)) return 'under a minute';
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}
