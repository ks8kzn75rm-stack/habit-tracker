import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { LIFE_WEEKS, lifeInWeeks, seasonPhrase, seasonWeeks, weeksBetween } from '../../js/core/perspective.js';

function inZone(tz, fn) {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('week calculations', () => {
  test('whole weeks between two days', () => {
    assert.equal(weeksBetween('2026-11-02', '2026-11-08'), 0);
    assert.equal(weeksBetween('2026-11-02', '2026-11-09'), 1);
    assert.equal(weeksBetween('2026-01-01', '2026-12-31'), 52);
    assert.equal(weeksBetween('2026-01-01', '2026-12-30'), 51);
  });

  test('unaffected by DST changes', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Australia/Sydney']) {
      inZone(tz, () => {
        assert.equal(weeksBetween('2026-03-01', '2026-04-26'), 8);
        assert.equal(weeksBetween('2026-10-01', '2026-11-26'), 8);
      });
    }
  });
});

describe('life in weeks', () => {
  test('counts the weeks lived and marks this one', () => {
    const life = lifeInWeeks('1990-06-15', '2026-11-04');
    assert.equal(life.lived, weeksBetween('1990-06-15', '2026-11-04'));
    assert.equal(life.currentIndex, life.lived);
    assert.equal(life.total, LIFE_WEEKS);
    assert.equal(life.years, 36);
    assert.equal(life.rows, Math.ceil(LIFE_WEEKS / 52));
  });

  test('a first week, and lives beyond four thousand weeks', () => {
    assert.equal(lifeInWeeks('2026-11-01', '2026-11-04').currentIndex, 0);
    const long = lifeInWeeks('1940-01-01', '2026-11-04');
    assert.ok(long.lived > LIFE_WEEKS);
    assert.ok(long.total > long.lived);
  });

  test('missing or future birth dates are ignored', () => {
    assert.equal(lifeInWeeks(null, '2026-11-04'), null);
    assert.equal(lifeInWeeks('2027-01-01', '2026-11-04'), null);
  });
});

describe('this season', () => {
  test('weeks to make count, counting partial weeks', () => {
    assert.deepEqual(seasonWeeks('2026-11-04', '2026-11-04'), { days: 1, weeks: 1, ended: false });
    assert.equal(seasonWeeks('2026-11-04', '2026-11-10').weeks, 1);
    assert.equal(seasonWeeks('2026-11-04', '2026-11-11').weeks, 2);
    assert.equal(seasonWeeks('2026-11-04', '2027-02-02').weeks, 13);
    assert.equal(seasonPhrase(seasonWeeks('2026-11-04', '2026-11-04')), '1 week to make count');
    assert.equal(seasonPhrase(seasonWeeks('2026-11-04', '2027-02-02')), '13 weeks to make count');
  });

  test('after the end date it invites the next season, never an alarm', () => {
    const ended = seasonWeeks('2026-11-04', '2026-11-03');
    assert.equal(ended.ended, true);
    assert.match(seasonPhrase(ended), /next one/);
    assert.doesNotMatch(seasonPhrase(ended), /late|over due|overdue|hurry|left!/i);
  });
});
