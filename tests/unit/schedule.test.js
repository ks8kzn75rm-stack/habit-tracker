import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  isActiveOn,
  isDueOn,
  isScheduledOn,
  isWeekly,
  sectionOf,
  sectionsForDay,
  weekCompletions,
  weeklyProgress,
  weeklyTarget,
} from '../../js/core/schedule.js';

const habit = (over = {}) => ({
  id: over.id ?? 'h',
  name: over.name ?? 'Habit',
  group: 'morning',
  schedule: { type: 'daily' },
  points: 10,
  order: 0,
  createdDay: '2026-10-01',
  archivedDay: null,
  ...over,
});

describe('scheduling', () => {
  test('daily habits are due every day', () => {
    const h = habit();
    for (const key of ['2026-11-02', '2026-11-03', '2026-11-08']) assert.equal(isDueOn(h, key), true);
  });

  test('weekday habits are due only on their days', () => {
    const h = habit({ schedule: { type: 'days', days: [1, 3, 5] } }); // Mon, Wed, Fri
    assert.equal(isScheduledOn(h, '2026-11-02'), true); // Mon
    assert.equal(isScheduledOn(h, '2026-11-03'), false); // Tue
    assert.equal(isScheduledOn(h, '2026-11-04'), true); // Wed
    assert.equal(isScheduledOn(h, '2026-11-06'), true); // Fri
    assert.equal(isScheduledOn(h, '2026-11-08'), false); // Sun
  });

  test('weekly-target habits are never due on a specific day', () => {
    const h = habit({ schedule: { type: 'weekly', target: 2 } });
    assert.equal(isWeekly(h), true);
    assert.equal(isDueOn(h, '2026-11-03'), false);
    assert.equal(sectionOf(h), 'weekly');
    assert.equal(weeklyTarget(h), 2);
    assert.equal(weeklyTarget(habit({ schedule: { type: 'weekly', target: 12 } })), 7);
    assert.equal(weeklyTarget(habit({ schedule: { type: 'weekly', target: 0 } })), 1);
  });

  test('habits only exist between creation and removal', () => {
    const h = habit({ createdDay: '2026-11-03', archivedDay: '2026-11-06' });
    assert.equal(isActiveOn(h, '2026-11-02'), false);
    assert.equal(isActiveOn(h, '2026-11-03'), true);
    assert.equal(isActiveOn(h, '2026-11-05'), true);
    assert.equal(isActiveOn(h, '2026-11-06'), false);
    assert.equal(isDueOn(h, '2026-11-02'), false);
  });
});

describe('weekly progress', () => {
  const done = new Set(['2026-11-02', '2026-11-05', '2026-11-09']);
  const isDone = (key) => done.has(key);
  const h = habit({ schedule: { type: 'weekly', target: 2 } });

  test('counts completions inside the week only', () => {
    assert.equal(weekCompletions(h, '2026-11-02', isDone), 2);
    assert.deepEqual(weeklyProgress(h, '2026-11-04', isDone, 1), {
      count: 2,
      target: 2,
      met: true,
      weekStart: '2026-11-02',
    });
    assert.equal(weeklyProgress(h, '2026-11-10', isDone, 1).count, 1);
  });

  test('respects a Sunday week start', () => {
    // Week of Sun 1 Nov - Sat 7 Nov still contains the 2nd and 5th.
    assert.equal(weeklyProgress(h, '2026-11-03', isDone, 0).count, 2);
    // Week of Sun 8 Nov contains the 9th.
    assert.equal(weeklyProgress(h, '2026-11-08', isDone, 0).count, 1);
  });

  test('ignores completions from before the habit existed', () => {
    const late = habit({ schedule: { type: 'weekly', target: 2 }, createdDay: '2026-11-04' });
    assert.equal(weekCompletions(late, '2026-11-02', isDone), 1);
  });
});

describe('sections for a day', () => {
  const habits = [
    habit({ id: 'b', name: 'B', group: 'morning', order: 2 }),
    habit({ id: 'a', name: 'A', group: 'morning', order: 1 }),
    habit({ id: 'gym', group: 'morning', order: 3, schedule: { type: 'days', days: [1, 3, 5] } }),
    habit({ id: 'd', group: 'daytime', order: 4 }),
    habit({ id: 'e', group: 'evening', order: 5 }),
    habit({ id: 'w', group: 'daytime', order: 6, schedule: { type: 'weekly', target: 2 } }),
    habit({ id: 'gone', group: 'evening', order: 7, archivedDay: '2026-11-01' }),
  ];

  test('groups due habits in order, weekly habits separately', () => {
    const tuesday = sectionsForDay(habits, '2026-11-03');
    assert.deepEqual(tuesday.morning.map((h) => h.id), ['a', 'b']);
    assert.deepEqual(tuesday.daytime.map((h) => h.id), ['d']);
    assert.deepEqual(tuesday.evening.map((h) => h.id), ['e']);
    assert.deepEqual(tuesday.weekly.map((h) => h.id), ['w']);
    const wednesday = sectionsForDay(habits, '2026-11-04');
    assert.deepEqual(wednesday.morning.map((h) => h.id), ['a', 'b', 'gym']);
  });

  test('removed habits still appear on days before removal', () => {
    assert.deepEqual(sectionsForDay(habits, '2026-10-31').evening.map((h) => h.id), ['e', 'gone']);
  });
});
