import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createDefaultHabits } from '../../js/core/defaults.js';
import {
  autoTickHabitIds,
  evidenceSummary,
  formatMinutes,
  minutesToLog,
  sessionProgress,
  sessionsBetween,
} from '../../js/core/focus.js';
import { ACTIVE_LIMIT, activeProjects, canActivate, parkedProjects, statusForNewProject } from '../../js/core/wip.js';

const MIN = 60000;
const t0 = Date.parse('2026-11-04T09:00:00Z');
const active = (over = {}) => ({ id: 'f1', startedAt: t0, plannedMinutes: 90, projectId: null, intent: '', rescue: null, extended: false, ...over });

describe('focus sessions', () => {
  test('progress through a session', () => {
    const p = sessionProgress(active({ plannedMinutes: 50 }), t0 + 25 * MIN);
    assert.equal(p.elapsedMinutes, 25);
    assert.equal(p.ratio, 0.5);
    assert.equal(p.reachedPlan, false);
    assert.equal(sessionProgress(active({ plannedMinutes: 50 }), t0 + 50 * MIN).reachedPlan, true);
  });

  test('ending early logs what you did', () => {
    assert.equal(minutesToLog(active({ plannedMinutes: 50 }), t0 + 12 * MIN + 30000), 12);
  });

  test('a forgotten timer logs the plan, unless you chose to keep going', () => {
    assert.equal(minutesToLog(active({ plannedMinutes: 50 }), t0 + 300 * MIN), 50);
    assert.equal(minutesToLog(active({ plannedMinutes: 50, extended: true }), t0 + 70 * MIN), 70);
    assert.equal(minutesToLog(active({ plannedMinutes: 50, extended: true }), t0 + 900 * MIN), 240);
  });

  test('formats minutes kindly', () => {
    assert.equal(formatMinutes(25), '25 min');
    assert.equal(formatMinutes(90), '1h 30m');
    assert.equal(formatMinutes(120), '2h');
  });
});

describe('deep-work auto-tick', () => {
  const habits = createDefaultHabits('2026-11-01');
  const none = () => false;
  const session = (minutes, over = {}) => ({ id: 's', kind: 'focus', day: '2026-11-04', minutes, ...over });

  test('a session of at least the set length ticks the deep-work habit', () => {
    assert.deepEqual(autoTickHabitIds({ habits, session: session(90), deepWorkMinutes: 90, isDone: none }), ['d-deep-work']);
    assert.deepEqual(autoTickHabitIds({ habits, session: session(120), deepWorkMinutes: 90, isDone: none }), ['d-deep-work']);
  });

  test('a shorter session does not', () => {
    assert.deepEqual(autoTickHabitIds({ habits, session: session(89), deepWorkMinutes: 90, isDone: none }), []);
  });

  test('the length is configurable', () => {
    assert.deepEqual(autoTickHabitIds({ habits, session: session(50), deepWorkMinutes: 45, isDone: none }), ['d-deep-work']);
  });

  test('nothing to do if it is already ticked, not due, or not a focus session', () => {
    const done = (key, id) => key === '2026-11-04' && id === 'd-deep-work';
    assert.deepEqual(autoTickHabitIds({ habits, session: session(95), deepWorkMinutes: 90, isDone: done }), []);
    const weekdaysOnly = habits.map((h) => (h.id === 'd-deep-work' ? { ...h, schedule: { type: 'days', days: [1, 2, 3, 4, 5] } } : h));
    assert.deepEqual(autoTickHabitIds({ habits: weekdaysOnly, session: session(95, { day: '2026-11-08' }), deepWorkMinutes: 90, isDone: none }), []);
    assert.deepEqual(autoTickHabitIds({ habits, session: session(95, { kind: 'shipped' }), deepWorkMinutes: 90, isDone: none }), []);
  });

  test('any habit can opt in; the starter deep-work habit does by default', () => {
    assert.deepEqual(habits.filter((h) => h.focusAuto).map((h) => h.id), ['d-deep-work']);
    const writing = [...habits.map((h) => ({ ...h, focusAuto: false })), { ...habits[6], id: 'h-writing', focusAuto: true }];
    assert.deepEqual(autoTickHabitIds({ habits: writing, session: session(90), deepWorkMinutes: 90, isDone: none }), ['h-writing']);
  });
});

describe('evidence', () => {
  const sessions = [
    { id: 'a', kind: 'focus', day: '2026-11-02', minutes: 25, shipped: false },
    { id: 'b', kind: 'focus', day: '2026-11-03', minutes: 90, shipped: true },
    { id: 'c', kind: 'shipped', day: '2026-11-03', minutes: 0, shipped: true },
    { id: 'd', kind: 'focus', day: '2026-11-09', minutes: 50, shipped: false },
  ];

  test('totals for a week', () => {
    const week = sessionsBetween(sessions, '2026-11-02', '2026-11-08');
    assert.deepEqual(evidenceSummary(week), { sessions: 2, minutes: 115, shipped: 2, days: 2 });
  });
});

describe('three active projects at most', () => {
  const p = (id, over = {}) => ({ id, name: id, status: 'active', completedDay: null, order: 0, createdAt: 0, ...over });

  test('room for up to three', () => {
    assert.equal(ACTIVE_LIMIT, 3);
    assert.equal(canActivate([p('a'), p('b')]), true);
    assert.equal(canActivate([p('a'), p('b'), p('c')]), false);
    assert.equal(statusForNewProject([p('a'), p('b'), p('c')]), 'parked');
    assert.equal(statusForNewProject([p('a'), p('b')]), 'active');
  });

  test('parked and finished projects don’t count', () => {
    const list = [p('a'), p('b'), p('c', { status: 'parked' }), p('d', { completedDay: '2026-11-01' })];
    assert.equal(canActivate(list), true);
    assert.deepEqual(activeProjects(list).map((x) => x.id), ['a', 'b']);
    assert.deepEqual(parkedProjects(list).map((x) => x.id), ['c']);
  });

  test('an active project can stay active when full', () => {
    const full = [p('a'), p('b'), p('c'), p('d', { status: 'parked' })];
    assert.equal(canActivate(full, 'a'), true);
    assert.equal(canActivate(full, 'd'), false);
  });
});
