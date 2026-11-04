import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildBackup, parseBackup } from '../../js/core/backup.js';
import { createDefaultHabits } from '../../js/core/defaults.js';
import { DATA_VERSION, migrateData } from '../../js/core/migrate.js';
import { normalizeHabit, normalizeMeta, normalizeProject } from '../../js/core/model.js';
import { dayStats } from '../../js/core/scoring.js';

const TODAY = '2026-11-04';

/** Data exactly as version 1 of the app stored it (no ritual habit, no statuses). */
function v1Data({ todayTicks = [], projects = 1 } = {}) {
  const habits = createDefaultHabits('2026-10-20')
    .filter((h) => !h.ritual)
    .map(({ ritual, focusAuto, ...h }) => normalizeHabit(h));
  const days = new Map([
    ['2026-11-02', { date: '2026-11-02', done: { 'd-water': 1, 'd-sleep': 1 }, note: 'Good day' }],
  ]);
  if (todayTicks.length) days.set(TODAY, { date: TODAY, done: Object.fromEntries(todayTicks.map((id) => [id, 1])), note: '' });
  const projectList = Array.from({ length: projects }, (_, i) =>
    normalizeProject({ id: `p${i}`, name: `Project ${i}`, steps: [], createdAt: i + 1, order: i }),
  );
  return { habits, days, projects: projectList, settings: {}, meta: normalizeMeta({ initialized: true, firstDay: '2026-10-20' }) };
}

describe('migration to version 2', () => {
  test('adds the Begin ritual habit to the morning, once', () => {
    const { data, changed, notices } = migrateData(v1Data(), { todayKey: TODAY });
    assert.equal(changed, true);
    const ritual = data.habits.filter((h) => h.ritual);
    assert.equal(ritual.length, 1);
    assert.equal(ritual[0].name, 'Began my day with intention');
    assert.equal(ritual[0].group, 'morning');
    assert.equal(ritual[0].createdDay, TODAY);
    // First in the morning section.
    const morning = data.habits.filter((h) => h.group === 'morning' && h.schedule.type !== 'weekly');
    assert.equal(Math.min(...morning.map((h) => h.order)), ritual[0].order);
    assert.deepEqual(notices, ['ritual']);
    assert.equal(data.meta.dataVersion, DATA_VERSION);

    const again = migrateData(data, { todayKey: TODAY });
    assert.equal(again.changed, false);
    assert.equal(again.data.habits.filter((h) => h.ritual).length, 1);
  });

  test('if today is already under way, the new habit starts tomorrow so nothing drops', () => {
    const morning = ['d-water', 'd-sleep', 'd-sunlight', 'd-phone-free', 'd-gym']; // a Wednesday: gym day
    const before = v1Data({ todayTicks: morning });
    const statsBefore = dayStats(before.habits, before.days.get(TODAY), TODAY, {});
    assert.equal(statsBefore.morningWin, true);

    const { data, notices } = migrateData(before, { todayKey: TODAY });
    const ritual = data.habits.find((h) => h.ritual);
    assert.equal(ritual.createdDay, '2026-11-05');
    assert.deepEqual(notices, ['ritual-tomorrow']);
    const statsAfter = dayStats(data.habits, data.days.get(TODAY), TODAY, {});
    assert.equal(statsAfter.morningWin, true);
    assert.equal(statsAfter.points, statsBefore.points);
  });

  test('past scores are untouched', () => {
    const before = v1Data();
    const { data } = migrateData(before, { todayKey: TODAY });
    const key = '2026-11-02';
    assert.deepEqual(dayStats(data.habits, data.days.get(key), key, {}), dayStats(before.habits, before.days.get(key), key, {}));
  });

  test('the starter deep-work habit ticks itself after a long session', () => {
    const { data, touched } = migrateData(v1Data(), { todayKey: TODAY });
    assert.equal(data.habits.find((h) => h.id === 'd-deep-work').focusAuto, true);
    assert.ok(touched.habits.includes('d-deep-work'));
  });

  test('keeps at most three projects active; the rest wait in the parking lot', () => {
    const { data, notices, touched } = migrateData(v1Data({ projects: 5 }), { todayKey: TODAY });
    assert.deepEqual(data.projects.map((p) => p.status), ['active', 'active', 'active', 'parked', 'parked']);
    assert.ok(notices.includes('parked:Project 3, Project 4'));
    assert.deepEqual(touched.projects.sort(), ['p3', 'p4']);
    const few = migrateData(v1Data({ projects: 2 }), { todayKey: TODAY });
    assert.deepEqual(few.data.projects.map((p) => p.status), ['active', 'active']);
  });

  test('never loses anything', () => {
    const before = v1Data({ projects: 4 });
    const { data } = migrateData(before, { todayKey: TODAY });
    for (const habit of before.habits) assert.ok(data.habits.some((h) => h.id === habit.id && h.name === habit.name));
    assert.equal(data.projects.length, before.projects.length);
    assert.equal(data.days, before.days);
    assert.equal(data.meta.firstDay, '2026-10-20');
  });

  test('a version 1 backup file imports and migrates', () => {
    const v1 = v1Data();
    const file = buildBackup(v1, { appVersion: '1.0.0' });
    file.schema = 1;
    delete file.data.journal;
    delete file.data.sessions;
    delete file.data.cards;
    delete file.data.foundations;
    delete file.data.inbox;
    delete file.data.meta.dataVersion;
    const parsed = parseBackup(JSON.stringify(file));
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.meta.dataVersion, 1);
    assert.deepEqual(parsed.data.journal, []);
    const { data } = migrateData(parsed.data, { todayKey: TODAY });
    assert.equal(data.habits.filter((h) => h.ritual).length, 1);
    assert.equal(data.habits.length, v1.habits.length + 1);
  });
});
