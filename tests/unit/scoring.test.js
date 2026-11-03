import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDefaultHabits } from '../../js/core/defaults.js';
import {
  PROJECT_BONUS,
  dayStats,
  levelInfo,
  levelTitle,
  totalPoints,
  xpForLevel,
} from '../../js/core/scoring.js';

const TUESDAY = '2026-11-03';
const WEDNESDAY = '2026-11-04'; // a gym day with the default schedule
const settings = { morningWinBonus: 25 };
const habits = createDefaultHabits('2026-11-01');
const ids = (group, key) =>
  habits.filter((h) => h.group === group && h.schedule.type !== 'weekly' && (h.schedule.type === 'daily' || h.schedule.days.includes(new Date(`${key}T12:00:00Z`).getUTCDay()))).map((h) => h.id);
const record = (key, doneIds, note = '') => ({ date: key, done: Object.fromEntries(doneIds.map((id) => [id, 1700000000000])), note });

describe('day score', () => {
  test('an empty day scores zero', () => {
    const s = dayStats(habits, undefined, TUESDAY, settings);
    assert.equal(s.points, 0);
    assert.equal(s.doneCount, 0);
    assert.equal(s.dueCount, 13); // 14 day habits, the gym isn't due on Tuesdays
    assert.equal(s.morningWin, false);
  });

  test('completed habits earn their points', () => {
    const s = dayStats(habits, record(TUESDAY, ['d-water', 'd-deep-work']), TUESDAY, settings);
    assert.equal(s.points, 10 + 20);
    assert.equal(s.doneCount, 2);
    assert.equal(s.ratio, 2 / 13);
  });

  test('Morning Win bonus when every due morning habit is done', () => {
    const morning = ids('morning', TUESDAY);
    assert.equal(morning.length, 4); // no gym on Tuesday
    const s = dayStats(habits, record(TUESDAY, morning), TUESDAY, settings);
    assert.equal(s.morningWin, true);
    assert.equal(s.bonus, 25);
    assert.equal(s.points, 10 + 10 + 10 + 15 + 25);
  });

  test('on gym days the gym is part of the Morning Win', () => {
    const withoutGym = ids('morning', WEDNESDAY).filter((id) => id !== 'd-gym');
    assert.equal(dayStats(habits, record(WEDNESDAY, withoutGym), WEDNESDAY, settings).morningWin, false);
    const all = ids('morning', WEDNESDAY);
    const s = dayStats(habits, record(WEDNESDAY, all), WEDNESDAY, settings);
    assert.equal(s.morningWin, true);
    assert.equal(s.points, 10 + 10 + 10 + 15 + 20 + 25);
  });

  test('the bonus size comes from settings', () => {
    const s = dayStats(habits, record(TUESDAY, ids('morning', TUESDAY)), TUESDAY, { morningWinBonus: 40 });
    assert.equal(s.bonus, 40);
  });

  test('weekly-target sessions earn points but are not part of the due count', () => {
    const s = dayStats(habits, record(TUESDAY, ['d-strength']), TUESDAY, settings);
    assert.equal(s.points, 20);
    assert.equal(s.weeklyDone, 1);
    assert.equal(s.doneCount, 0);
    assert.equal(s.completions, 1);
  });

  test('a perfect day', () => {
    const all = [...ids('morning', TUESDAY), ...ids('daytime', TUESDAY), ...ids('evening', TUESDAY)];
    const s = dayStats(habits, record(TUESDAY, all), TUESDAY, settings);
    assert.equal(s.perfect, true);
    assert.equal(s.ratio, 1);
  });

  test('habits are ignored outside the days they existed', () => {
    const later = habits.map((h) => (h.id === 'd-water' ? { ...h, createdDay: '2026-11-04' } : h));
    const s = dayStats(later, record(TUESDAY, ['d-water']), TUESDAY, settings);
    assert.equal(s.points, 0);
    assert.equal(s.dueCount, 12);
  });

  test('finishing a project adds a bonus on that day', () => {
    const projects = [{ id: 'p', completedDay: TUESDAY }];
    assert.equal(dayStats(habits, undefined, TUESDAY, settings, projects).points, PROJECT_BONUS);
    assert.equal(dayStats(habits, undefined, WEDNESDAY, settings, projects).points, 0);
  });

  test('lifetime points add up every day and project', () => {
    const days = new Map([
      [TUESDAY, record(TUESDAY, ['d-water'])],
      [WEDNESDAY, record(WEDNESDAY, ['d-gym'])],
    ]);
    const projects = [{ id: 'p', completedDay: '2026-11-05' }];
    assert.equal(totalPoints(habits, days, settings, projects), 10 + 20 + PROJECT_BONUS);
  });
});

describe('levels', () => {
  test('the XP curve', () => {
    assert.deepEqual([1, 2, 3, 4, 5, 10].map(xpForLevel), [0, 100, 250, 450, 700, 2700]);
  });

  test('level boundaries', () => {
    assert.equal(levelInfo(0).level, 1);
    assert.equal(levelInfo(99).level, 1);
    assert.equal(levelInfo(100).level, 2);
    assert.equal(levelInfo(249).level, 2);
    assert.equal(levelInfo(250).level, 3);
    assert.equal(levelInfo(-5).level, 1);
  });

  test('progress towards the next level', () => {
    const info = levelInfo(175);
    assert.equal(info.level, 2);
    assert.equal(info.floor, 100);
    assert.equal(info.next, 250);
    assert.equal(info.toNext, 75);
    assert.equal(info.progress, 0.5);
    assert.equal(info.title, 'Spark');
  });

  test('titles keep going past the named levels', () => {
    assert.equal(levelTitle(1), 'First Light');
    assert.equal(levelTitle(17), 'Supernova');
    assert.equal(levelTitle(18), 'Supernova II');
    assert.equal(levelTitle(21), 'Supernova V');
  });
});
