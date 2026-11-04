import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { badgeStats, earnedBadgeIds } from '../../js/core/badges.js';
import { addDays, keysBetween } from '../../js/core/dates.js';
import { DEFAULT_SETTINGS, createDefaultHabits } from '../../js/core/defaults.js';
import { weekReview } from '../../js/core/review.js';
import { habitStreak, morningWinStreak, showingUpStreak } from '../../js/core/stats.js';

const settings = { ...DEFAULT_SETTINGS };
const MORNING_TUE = ['d-ritual', 'd-water', 'd-sleep', 'd-sunlight', 'd-phone-free'];

function makeDays(entries) {
  return new Map(entries.map(([date, ids, note = '']) => [date, { date, done: Object.fromEntries(ids.map((id) => [id, 1])), note }]));
}

const ctx = (days, today, extra = {}) => ({
  habits: createDefaultHabits('2026-10-26'),
  days,
  projects: [],
  settings,
  meta: { firstDay: '2026-10-26', exportCount: 0 },
  today,
  ...extra,
});

describe('weekly review', () => {
  // Week Mon 2 Nov - Sun 8 Nov 2026; today is Thu 5 Nov.
  const days = makeDays([
    ['2026-11-02', ['d-ritual', 'd-water', 'd-sleep', 'd-sunlight', 'd-phone-free', 'd-gym', 'd-squats'], 'Great day'],
    ['2026-11-03', [...MORNING_TUE, 'd-squats', 'd-strength']],
    ['2026-11-04', ['d-water', 'd-squats']],
    ['2026-11-05', ['d-water']],
  ]);
  const review = weekReview({ ...ctx(days, '2026-11-05'), weekStart: '2026-11-02' });

  test('daily scores, totals and Morning Wins', () => {
    assert.equal(review.days.length, 7);
    assert.deepEqual(review.days.map((d) => d.future), [false, false, false, false, true, true, true]);
    assert.equal(review.days[0].points, 15 + 10 + 10 + 10 + 15 + 20 + 10 + 25);
    assert.equal(review.days[1].points, 15 + 10 + 10 + 10 + 15 + 10 + 20 + 25);
    assert.equal(review.morningWins, 2);
    assert.equal(review.total, review.days.reduce((s, d) => s + d.points, 0));
    assert.equal(review.bestDay.key, '2026-11-02');
    assert.deepEqual(review.notes, [{ key: '2026-11-02', note: 'Great day' }]);
  });

  test('strongest habits and where to focus next', () => {
    assert.deepEqual(review.strongest.map((r) => r.habit.id).slice(0, 2), ['d-water', 'd-squats']);
    const water = review.rates.find((r) => r.habit.id === 'd-water');
    assert.deepEqual([water.done, water.due], [4, 4]);
    assert.ok(review.focus.length > 0);
    for (const item of review.focus) {
      assert.ok(item.rate < 0.8);
      assert.equal(typeof item.tip, 'string');
    }
  });

  test('today in progress is not held against you', () => {
    const sleep = review.rates.find((r) => r.habit.id === 'd-sleep');
    assert.equal(sleep.due, 3); // Mon-Wed; Thursday not done yet so not counted
    assert.equal(sleep.done, 2);
  });

  test('weekly goals', () => {
    assert.deepEqual(review.weekly.map((w) => [w.habit.id, w.count, w.target, w.met]), [['d-strength', 1, 2, false]]);
  });
});

describe('streak stats from data', () => {
  test('habit, showing-up and Morning Win streaks', () => {
    const entries = keysBetween('2026-10-26', '2026-11-04').map((k) => [k, ['d-water']]);
    const days = makeDays(entries);
    const c = ctx(days, '2026-11-05');
    const water = c.habits.find((h) => h.id === 'd-water');
    const s = habitStreak(water, c);
    assert.equal(s.unit, 'day');
    assert.equal(s.current, 10);
    assert.equal(s.best, 10);
    assert.equal(showingUpStreak(c).current, 10);
    assert.equal(morningWinStreak(c).current, 0);
  });

  test('weekly-target streaks count weeks', () => {
    const days = makeDays([
      ['2026-10-27', ['d-strength']],
      ['2026-10-29', ['d-strength']],
      ['2026-11-03', ['d-strength']],
    ]);
    const c = ctx(days, '2026-11-05');
    const strength = c.habits.find((h) => h.id === 'd-strength');
    const s = habitStreak(strength, c);
    assert.equal(s.unit, 'week');
    assert.equal(s.current, 1); // last week met; this week in progress (1/2)
    assert.equal(s.currentMet, false);
  });
});

describe('badges', () => {
  test('earned from data', () => {
    const days = makeDays([
      ['2026-10-26', MORNING_TUE.concat('d-gym')],
      ['2026-10-27', MORNING_TUE.concat('d-strength')],
      ['2026-10-28', ['d-strength']],
      ['2026-11-03', ['d-water']], // back after 5 quiet days
    ]);
    const stats = badgeStats(ctx(days, '2026-11-03'));
    const earned = earnedBadgeIds(stats);
    assert.ok(earned.includes('first-step'));
    assert.ok(earned.includes('morning-win'));
    assert.ok(earned.includes('goal-getter'));
    assert.ok(earned.includes('comeback'));
    assert.ok(!earned.includes('hat-trick'));
    assert.ok(!earned.includes('safe-keeper'));
    assert.equal(stats.morningWins, 2);
  });

  test('backups and levels', () => {
    const many = keysBetween('2026-10-26', addDays('2026-10-26', 40)).map((k) => [k, MORNING_TUE.concat('d-deep-work', 'd-squats')]);
    const stats = badgeStats(ctx(makeDays(many), '2026-12-05', { meta: { firstDay: '2026-10-26', exportCount: 1 } }));
    const earned = earnedBadgeIds(stats);
    assert.ok(earned.includes('safe-keeper'));
    assert.ok(earned.includes('on-a-roll'));
    assert.ok(earned.includes('month'));
    assert.ok(earned.includes('centurion'));
    assert.ok(stats.level >= 5);
  });
});
