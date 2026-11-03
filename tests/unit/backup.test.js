import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BACKUP_APP, backupFilename, backupReminder, buildBackup, parseBackup } from '../../js/core/backup.js';
import { DEFAULT_SETTINGS, createDefaultHabits } from '../../js/core/defaults.js';
import { normalizeHabit, normalizeSchedule, normalizeSettings } from '../../js/core/model.js';

const state = () => ({
  habits: createDefaultHabits('2026-10-01'),
  days: new Map([
    ['2026-11-02', { date: '2026-11-02', done: { 'd-water': 1762070000000 }, note: 'Good start' }],
    ['2026-11-03', { date: '2026-11-03', done: { 'd-gym': 1762160000000, 'd-sleep': 1762160000001 }, note: '' }],
  ]),
  projects: [
    {
      id: 'p1',
      name: 'Office reset',
      steps: [{ id: 's1', text: 'Clear the desk', done: true }],
      maintenance: { name: '10-min desk tidy', group: 'evening', schedule: { type: 'daily' }, points: 10 },
      createdAt: 1762000000000,
      completedDay: null,
      habitId: null,
      order: 0,
    },
  ],
  settings: { ...DEFAULT_SETTINGS, dayStart: 300 },
  meta: {
    initialized: true,
    installedAt: 1761900000000,
    firstDay: '2026-10-01',
    lastExportAt: null,
    exportCount: 2,
    badges: { 'first-step': '2026-10-01' },
    backupSnoozedDay: null,
    installHintDismissed: true,
    welcomed: true,
  },
});

describe('backup files', () => {
  test('round-trips all data', () => {
    const s = state();
    const backup = buildBackup(s, { appVersion: '1.0.0', now: new Date('2026-11-03T12:00:00Z') });
    assert.equal(backup.app, BACKUP_APP);
    const parsed = parseBackup(JSON.stringify(backup));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.data.habits, s.habits);
    assert.deepEqual(parsed.data.days, [...s.days.values()]);
    assert.deepEqual(parsed.data.projects, s.projects);
    assert.deepEqual(parsed.data.settings, s.settings);
    assert.equal(parsed.data.meta.firstDay, '2026-10-01');
    assert.deepEqual(parsed.data.meta.badges, { 'first-step': '2026-10-01' });
    assert.equal(parsed.exportedAt, Date.parse('2026-11-03T12:00:00Z'));
    assert.deepEqual(parsed.summary, { habits: 15, days: 2, projects: 1 });
  });

  test('rejects files that are not backups', () => {
    assert.equal(parseBackup('{ nope').ok, false);
    assert.equal(parseBackup('[]').ok, false);
    assert.equal(parseBackup(JSON.stringify({ app: 'something-else', data: {} })).ok, false);
    const newer = parseBackup(JSON.stringify({ app: BACKUP_APP, schema: 99, data: {} }));
    assert.equal(newer.ok, false);
    assert.match(newer.error, /newer version/);
  });

  test('cleans up damaged records instead of failing', () => {
    const parsed = parseBackup({
      app: BACKUP_APP,
      schema: 1,
      data: {
        habits: [
          { id: 'ok', name: '  Read   10 pages ', group: 'nope', points: '15', schedule: { type: 'days', days: [9, 1, 1, 3] } },
          { id: '', name: 'No id' },
          { id: 'x', name: '' },
          { id: 'ok', name: 'Duplicate id wins' },
        ],
        days: [
          { date: '2026-02-30', done: { a: 1 } },
          { date: '2026-11-03', done: { a: true, b: 'later', c: -1 }, note: 'line one\nline two' },
        ],
        projects: [{ id: 'p', name: 'Garden', steps: [{ id: 's', text: '' }, { id: 't', text: 'Weed' }] }],
        settings: { dayStart: 9999, weekStartsOn: 0, morningWinBonus: -3 },
      },
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.data.habits.length, 1);
    assert.equal(parsed.data.habits[0].name, 'Duplicate id wins');
    assert.equal(parsed.data.days.length, 1);
    assert.deepEqual(parsed.data.days[0].done, { a: 1 });
    assert.equal(parsed.data.days[0].note, 'line one line two');
    assert.deepEqual(parsed.data.projects[0].steps, [{ id: 't', text: 'Weed', done: false }]);
    assert.equal(parsed.data.settings.dayStart, 360);
    assert.equal(parsed.data.settings.weekStartsOn, 0);
    assert.equal(parsed.data.settings.morningWinBonus, 0);
  });

  test('normalises habits and schedules', () => {
    const h = normalizeHabit({ id: 'a', name: '  Walk ', group: 'evening', points: 12.6, schedule: { type: 'weekly', target: '3' } });
    assert.equal(h.name, 'Walk');
    assert.equal(h.points, 13);
    assert.deepEqual(h.schedule, { type: 'weekly', target: 3 });
    assert.deepEqual(normalizeSchedule({ type: 'days', days: [0, 1, 2, 3, 4, 5, 6] }), { type: 'daily' });
    assert.deepEqual(normalizeSchedule({ type: 'days', days: [] }), { type: 'daily' });
    assert.deepEqual(normalizeSchedule({ type: 'days', days: [5, 1, 3] }), { type: 'days', days: [1, 3, 5] });
    assert.deepEqual(normalizeSchedule(undefined), { type: 'daily' });
    assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
    assert.equal(normalizeSettings({ dayStart: null }).dayStart, DEFAULT_SETTINGS.dayStart);
  });

  test('file names include the date', () => {
    assert.equal(backupFilename('2026-11-03'), 'daybreak-backup-2026-11-03.json');
  });
});

describe('backup reminder', () => {
  const base = { todayKey: '2026-11-20', hasData: true, snoozedDay: null, firstDay: '2026-11-01' };

  test('appears after 7 calendar days without a backup', () => {
    assert.equal(backupReminder({ ...base, lastExportDay: '2026-11-14' }), null);
    assert.deepEqual(backupReminder({ ...base, lastExportDay: '2026-11-13' }), { days: 7, neverBackedUp: false });
  });

  test('counts from the first day when you have never backed up', () => {
    assert.equal(backupReminder({ ...base, lastExportDay: null, firstDay: '2026-11-17' }), null);
    assert.deepEqual(backupReminder({ ...base, lastExportDay: null, firstDay: '2026-11-11' }), { days: 9, neverBackedUp: true });
  });

  test('stays quiet when there is nothing to lose or it was snoozed today', () => {
    assert.equal(backupReminder({ ...base, hasData: false, lastExportDay: '2026-10-01' }), null);
    assert.equal(backupReminder({ ...base, snoozedDay: '2026-11-20', lastExportDay: '2026-10-01' }), null);
    assert.ok(backupReminder({ ...base, snoozedDay: '2026-11-19', lastExportDay: '2026-10-01' }));
  });
});
