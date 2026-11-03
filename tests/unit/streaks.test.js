import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { addDays, keysBetween, startOfWeek } from '../../js/core/dates.js';
import { bestStreak, bestWeeklyStreak, currentStreak, weeklyStreak } from '../../js/core/streaks.js';

// Week of Mon 26 Oct - Sun 1 Nov 2026, then Mon 2 Nov - Sun 8 Nov.
const daily = (doneKeys, { today = '2026-11-05', startKey = '2026-10-01', weekStartsOn = 1, grace = 1, due } = {}) => {
  const set = new Set(doneKeys);
  return currentStreak({
    today,
    startKey,
    isDue: due ?? (() => true),
    isDone: (key) => set.has(key),
    weekStartsOn,
    graceDaysPerWeek: grace,
  });
};

describe('current streak', () => {
  test('counts consecutive completed days', () => {
    const s = daily(keysBetween('2026-11-01', '2026-11-05'));
    assert.equal(s.count, 5);
    assert.equal(s.todayDone, true);
    assert.deepEqual(s.graceDays, []);
  });

  test('today not done yet never breaks the streak', () => {
    const s = daily(keysBetween('2026-11-01', '2026-11-04'));
    assert.equal(s.count, 4);
    assert.equal(s.todayDone, false);
    assert.deepEqual(s.graceDays, []);
  });

  test('one missed day per week is forgiven', () => {
    // Missed Tue 3 Nov; everything else done since 28 Oct.
    const done = keysBetween('2026-10-28', '2026-11-05').filter((k) => k !== '2026-11-03');
    const s = daily(done);
    assert.equal(s.count, done.length);
    assert.deepEqual(s.graceDays, ['2026-11-03']);
    assert.equal(s.graceUsedThisWeek, true);
  });

  test('a grace day does not add to the count', () => {
    const s = daily(['2026-11-05', '2026-11-03']);
    // 5th done, 4th missed (grace), 3rd done, 2nd missed: second miss this week ends it.
    assert.equal(s.count, 2);
  });

  test('a second miss in the same week ends the streak', () => {
    // Missed Mon 2 and Wed 4 (same week): Thu + Tue count, Wed is forgiven,
    // and Monday's miss ends the streak there.
    const done = keysBetween('2026-10-26', '2026-11-05').filter((k) => k !== '2026-11-02' && k !== '2026-11-04');
    const s = daily(done);
    assert.equal(s.count, 2);
    assert.deepEqual(s.graceDays, ['2026-11-04']);
  });

  test('a miss before the streak began does not use up the grace day', () => {
    // Streak started Tue 3 Nov after a miss on Mon 2 Nov.
    const s = daily(keysBetween('2026-11-03', '2026-11-05'), { startKey: '2026-10-26' });
    assert.equal(s.count, 3);
    assert.deepEqual(s.graceDays, []);
    assert.equal(s.graceUsedThisWeek, false);
  });

  test('yesterday missed: today still open, grace shows as used', () => {
    const s = daily(keysBetween('2026-11-02', '2026-11-03'), { today: '2026-11-05' });
    // Wed 4 missed (forgiven), Thu 5 is today and not done yet.
    assert.equal(s.count, 2);
    assert.deepEqual(s.graceDays, ['2026-11-04']);
    assert.equal(s.graceUsedThisWeek, true);
  });

  test('misses in different weeks are each forgiven', () => {
    // Missed Fri 30 Oct (previous week) and Tue 3 Nov (this week).
    const done = keysBetween('2026-10-26', '2026-11-05').filter((k) => k !== '2026-10-30' && k !== '2026-11-03');
    const s = daily(done, { startKey: '2026-10-26' });
    assert.equal(s.count, done.length);
    assert.deepEqual(s.graceDays, ['2026-11-03', '2026-10-30']);
  });

  test('the week boundary decides which grace is used', () => {
    // Missed Sun 1 Nov and Mon 2 Nov: different Monday-start weeks, same Sunday-start week.
    const done = keysBetween('2026-10-26', '2026-11-05').filter((k) => k !== '2026-11-01' && k !== '2026-11-02');
    assert.equal(daily(done, { startKey: '2026-10-26', weekStartsOn: 1 }).count, done.length);
    assert.equal(daily(done, { startKey: '2026-10-26', weekStartsOn: 0 }).count, 3);
  });

  test('non-due days are skipped, not missed', () => {
    const monWedFri = (key) => [1, 3, 5].includes(new Date(`${key}T12:00:00Z`).getUTCDay());
    const done = keysBetween('2026-10-19', '2026-11-06').filter(monWedFri);
    const s = daily(done, { today: '2026-11-06', due: monWedFri, startKey: '2026-10-19' });
    assert.equal(s.count, 9);
    assert.deepEqual(s.graceDays, []);
  });

  test('stops at the start date', () => {
    const s = daily(keysBetween('2026-10-01', '2026-11-05'), { startKey: '2026-11-03' });
    assert.equal(s.count, 3);
  });

  test('zero grace days behaves like a classic streak', () => {
    const done = keysBetween('2026-10-28', '2026-11-05').filter((k) => k !== '2026-11-03');
    assert.equal(daily(done, { grace: 0 }).count, 2);
  });

  test('nothing done means no streak', () => {
    assert.equal(daily([]).count, 0);
  });
});

/** Brute force: the best streak is the best current streak ending on any day. */
function bruteBest({ startKey, endKey, isDue, isDone, weekStartsOn, graceDaysPerWeek }) {
  let best = 0;
  for (const key of keysBetween(startKey, endKey)) {
    const s = currentStreak({ today: key, startKey, isDue, isDone, weekStartsOn, graceDaysPerWeek });
    best = Math.max(best, s.count);
  }
  return best;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('best streak', () => {
  test('simple cases', () => {
    const set = new Set([...keysBetween('2026-10-01', '2026-10-10'), ...keysBetween('2026-10-20', '2026-10-22')]);
    const best = bestStreak({
      startKey: '2026-10-01',
      endKey: '2026-10-31',
      isDue: () => true,
      isDone: (k) => set.has(k),
    });
    assert.equal(best, 10);
    assert.equal(bestStreak({ startKey: '2026-10-01', endKey: '2026-10-31', isDue: () => true, isDone: () => false }), 0);
  });

  test('matches brute force on random histories', () => {
    const random = rng(42);
    for (let run = 0; run < 400; run++) {
      const length = 5 + Math.floor(random() * 70);
      const startKey = addDays('2026-01-01', Math.floor(random() * 14));
      const endKey = addDays(startKey, length);
      const pDone = 0.5 + random() * 0.5;
      const pDue = random() < 0.3 ? 0.6 : 1;
      const done = new Set();
      const due = new Set();
      for (const key of keysBetween(startKey, endKey)) {
        if (random() < pDue) due.add(key);
        if (random() < pDone) done.add(key);
      }
      const opts = {
        startKey,
        endKey,
        isDue: (k) => due.has(k),
        isDone: (k) => done.has(k),
        weekStartsOn: random() < 0.5 ? 1 : 0,
        graceDaysPerWeek: Math.floor(random() * 3),
      };
      assert.equal(bestStreak(opts), bruteBest(opts), JSON.stringify({ run, ...opts, done: [...done] }));
    }
  });

  test('best is never below the current streak', () => {
    const random = rng(7);
    for (let run = 0; run < 200; run++) {
      const startKey = '2026-03-01';
      const today = addDays(startKey, 10 + Math.floor(random() * 60));
      const done = new Set(keysBetween(startKey, today).filter(() => random() < 0.8));
      const opts = { startKey, isDue: () => true, isDone: (k) => done.has(k) };
      const current = currentStreak({ ...opts, today }).count;
      assert.ok(bestStreak({ ...opts, endKey: today }) >= current);
    }
  });
});

describe('weekly-target streaks', () => {
  const weeks = (pattern, firstWeek = '2026-09-07') => {
    // pattern like 'MMXM' (oldest first): M = met, X = missed
    const met = new Set();
    pattern.split('').forEach((c, i) => {
      if (c === 'M') met.add(addDays(firstWeek, i * 7));
    });
    const currentWeek = addDays(firstWeek, (pattern.length - 1) * 7);
    return { firstWeek, currentWeek, isMet: (w) => met.has(w) };
  };

  test('counts weeks in a row', () => {
    assert.equal(weeklyStreak(weeks('MMMM')).count, 4);
  });

  test('the current week counts once met but never breaks while in progress', () => {
    assert.equal(weeklyStreak(weeks('MMMX')).count, 3);
    assert.equal(weeklyStreak(weeks('MMMX')).currentMet, false);
  });

  test('a single missed week is forgiven', () => {
    const s = weeklyStreak(weeks('MMXMM'));
    assert.equal(s.count, 4);
    assert.equal(s.graceWeeks, 1);
  });

  test('two missed weeks in a row end the streak', () => {
    assert.equal(weeklyStreak(weeks('MMXXMM')).count, 2);
    assert.equal(weeklyStreak(weeks('MMXXX')).count, 0);
  });

  test('best weekly streak matches brute force', () => {
    const random = rng(99);
    for (let run = 0; run < 300; run++) {
      const n = 1 + Math.floor(random() * 30);
      let pattern = '';
      for (let i = 0; i < n; i++) pattern += random() < 0.65 ? 'M' : 'X';
      const w = weeks(pattern);
      let brute = 0;
      for (let i = 0; i < n; i++) {
        brute = Math.max(
          brute,
          weeklyStreak({ firstWeek: w.firstWeek, currentWeek: addDays(w.firstWeek, i * 7), isMet: w.isMet }).count,
        );
      }
      assert.equal(bestWeeklyStreak({ firstWeek: w.firstWeek, lastWeek: w.currentWeek, isMet: w.isMet }), brute, pattern);
    }
  });

  test('works with real week starts', () => {
    assert.equal(startOfWeek('2026-11-05', 1), '2026-11-02');
  });
});
