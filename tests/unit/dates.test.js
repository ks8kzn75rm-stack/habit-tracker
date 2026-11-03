import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  addDays,
  diffDays,
  isValidKey,
  keyToDayNum,
  keysBetween,
  localKey,
  logicalDayKey,
  logicalMoment,
  parseHHMM,
  startOfWeek,
  toHHMM,
  weekKeys,
  weekdayOf,
} from '../../js/core/dates.js';

/** Run `fn` with the process time zone set to `tz`. */
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

describe('day keys', () => {
  test('validates real calendar dates only', () => {
    assert.equal(isValidKey('2026-11-03'), true);
    assert.equal(isValidKey('2028-02-29'), true);
    assert.equal(isValidKey('2026-02-29'), false);
    assert.equal(isValidKey('2026-13-01'), false);
    assert.equal(isValidKey('2026-1-1'), false);
    assert.equal(isValidKey('not a date'), false);
    assert.equal(isValidKey(20261103), false);
  });

  test('adds days across months, years and leap days', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
    assert.equal(addDays('2026-02-28', 1), '2026-03-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-11-03', -365), '2025-11-03');
  });

  test('diffDays and keysBetween are exact across DST changes', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Australia/Sydney']) {
      inZone(tz, () => {
        assert.equal(diffDays('2026-03-01', '2026-04-30'), 60);
        assert.equal(diffDays('2026-10-01', '2026-11-30'), 60);
        const keys = keysBetween('2026-03-25', '2026-04-08');
        assert.equal(keys.length, 15);
        assert.equal(new Set(keys).size, 15);
      });
    }
  });

  test('weekday of known dates', () => {
    assert.equal(weekdayOf('1970-01-01'), 4); // Thursday
    assert.equal(weekdayOf('2026-11-03'), 2); // Tuesday
    assert.equal(weekdayOf('2024-02-29'), 4); // Thursday
    assert.equal(weekdayOf('2026-11-08'), 0); // Sunday
  });

  test('start of week for Monday- and Sunday-start weeks', () => {
    assert.equal(startOfWeek('2026-11-03', 1), '2026-11-02');
    assert.equal(startOfWeek('2026-11-02', 1), '2026-11-02');
    assert.equal(startOfWeek('2026-11-08', 1), '2026-11-02'); // Sunday belongs to the Monday week
    assert.equal(startOfWeek('2026-11-03', 0), '2026-11-01');
    assert.equal(startOfWeek('2026-11-08', 0), '2026-11-08');
    assert.deepEqual(weekKeys('2026-11-02'), [
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ]);
  });
});

describe('logical day boundary', () => {
  test('before the day start counts towards the previous day', () => {
    inZone('Europe/London', () => {
      assert.equal(logicalDayKey(new Date(2026, 10, 3, 0, 30), 240), '2026-11-02');
      assert.equal(logicalDayKey(new Date(2026, 10, 3, 3, 59), 240), '2026-11-02');
      assert.equal(logicalDayKey(new Date(2026, 10, 3, 4, 0), 240), '2026-11-03');
      assert.equal(logicalDayKey(new Date(2026, 10, 3, 23, 59), 240), '2026-11-03');
    });
  });

  test('a midnight day start is the plain calendar date', () => {
    assert.equal(logicalDayKey(new Date(2026, 10, 3, 0, 0), 0), '2026-11-03');
    assert.equal(logicalDayKey(new Date(2026, 10, 2, 23, 59), 0), '2026-11-02');
  });

  test('crossing month and year boundaries', () => {
    assert.equal(logicalDayKey(new Date(2027, 0, 1, 2, 0), 240), '2026-12-31');
    assert.equal(logicalDayKey(new Date(2026, 2, 1, 1, 0), 240), '2026-02-28');
  });

  test('DST spring-forward and fall-back nights (London)', () => {
    inZone('Europe/London', () => {
      // 29 Mar 2026: clocks jump from 01:00 to 02:00.
      assert.equal(logicalDayKey(new Date(2026, 2, 29, 0, 30), 240), '2026-03-28');
      assert.equal(logicalDayKey(new Date(2026, 2, 29, 3, 30), 240), '2026-03-28');
      assert.equal(logicalDayKey(new Date(2026, 2, 29, 4, 0), 240), '2026-03-29');
      // 25 Oct 2026: 01:00-02:00 happens twice.
      const firstOneThirty = new Date('2026-10-25T00:30:00Z'); // 01:30 BST
      const secondOneThirty = new Date('2026-10-25T01:30:00Z'); // 01:30 GMT
      assert.equal(logicalDayKey(firstOneThirty, 240), '2026-10-24');
      assert.equal(logicalDayKey(secondOneThirty, 240), '2026-10-24');
      assert.equal(logicalDayKey(new Date('2026-10-25T04:00:00Z'), 240), '2026-10-25');
    });
  });

  test('DST nights in New York and Sydney', () => {
    inZone('America/New_York', () => {
      assert.equal(logicalDayKey(new Date('2026-03-08T07:30:00Z'), 240), '2026-03-07'); // 03:30 EDT
      assert.equal(logicalDayKey(new Date('2026-03-08T08:00:00Z'), 240), '2026-03-08'); // 04:00 EDT
      assert.equal(logicalDayKey(new Date('2026-11-01T06:30:00Z'), 240), '2026-10-31'); // 01:30 EDT
      assert.equal(logicalDayKey(new Date('2026-11-01T09:00:00Z'), 240), '2026-11-01'); // 04:00 EST
    });
    inZone('Australia/Sydney', () => {
      // 4 Oct 2026: clocks jump from 02:00 to 03:00.
      assert.equal(logicalDayKey(new Date('2026-10-03T16:30:00Z'), 240), '2026-10-03'); // 03:30 AEDT
      assert.equal(logicalDayKey(new Date('2026-10-03T17:00:00Z'), 240), '2026-10-04'); // 04:00 AEDT
    });
  });

  test('every hour of a year maps to the right logical day, in several zones', () => {
    for (const tz of ['Europe/London', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Lord_Howe']) {
      inZone(tz, () => {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        });
        const start = Date.UTC(2026, 0, 1);
        for (let t = start; t < start + 366 * 24 * 3600e3; t += 3600e3 + 17 * 60e3) {
          const date = new Date(t);
          const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
          const calendar = `${p.year}-${p.month}-${p.day}`;
          assert.equal(localKey(date), calendar);
          const minutes = Number(p.hour) * 60 + Number(p.minute);
          const expected = minutes < 240 ? addDays(calendar, -1) : calendar;
          assert.equal(logicalDayKey(date, 240), expected, `${tz} ${date.toISOString()}`);
        }
      });
    }
  });

  test('logicalMoment places early-morning times after midnight', () => {
    inZone('Europe/London', () => {
      const tenAm = logicalMoment('2026-11-03', 600, 240);
      assert.equal(tenAm.getFullYear(), 2026);
      assert.equal(tenAm.getMonth(), 10);
      assert.equal(tenAm.getDate(), 3);
      assert.equal(tenAm.getHours(), 10);
      const twoAm = logicalMoment('2026-11-03', 120, 240);
      assert.equal(twoAm.getDate(), 4);
      assert.equal(twoAm.getHours(), 2);
    });
  });
});

describe('time strings', () => {
  test('parse and format HH:MM', () => {
    assert.equal(parseHHMM('04:00'), 240);
    assert.equal(parseHHMM('4:30'), 270);
    assert.equal(parseHHMM('23:59'), 1439);
    assert.equal(parseHHMM('24:00'), null);
    assert.equal(parseHHMM('10:60'), null);
    assert.equal(parseHHMM(''), null);
    assert.equal(toHHMM(600), '10:00');
    assert.equal(toHHMM(1350), '22:30');
    assert.equal(toHHMM(-30), '23:30');
  });

  test('day numbers are consecutive integers', () => {
    assert.equal(keyToDayNum('1970-01-01'), 0);
    assert.equal(keyToDayNum('1970-01-02'), 1);
    assert.equal(keyToDayNum('2026-11-04') - keyToDayNum('2026-11-03'), 1);
  });
});
