import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formatRemaining, morningWindowStatus } from '../../js/core/morning-window.js';

process.env.TZ = 'Europe/London';

const base = { dayKey: '2026-11-04', dayStart: 240, windowEnd: 600 };

describe('morning window', () => {
  test('counts down until the window closes', () => {
    const s = morningWindowStatus({ ...base, now: new Date(2026, 10, 4, 7, 45) });
    assert.equal(s.state, 'open');
    assert.equal(s.remainingMs, (2 * 60 + 15) * 60000);
    assert.equal(formatRemaining(s.remainingMs), '2h 15m');
  });

  test('closes at the set time', () => {
    assert.equal(morningWindowStatus({ ...base, now: new Date(2026, 10, 4, 10, 0) }).state, 'closed');
    assert.equal(morningWindowStatus({ ...base, now: new Date(2026, 10, 4, 15, 0) }).state, 'closed');
  });

  test('done before the deadline beats the window', () => {
    const done = morningWindowStatus({ ...base, now: new Date(2026, 10, 4, 11, 0), doneAt: new Date(2026, 10, 4, 9, 20).getTime() });
    assert.equal(done.state, 'done');
    assert.equal(done.beatWindow, true);
    const late = morningWindowStatus({ ...base, now: new Date(2026, 10, 4, 12, 0), doneAt: new Date(2026, 10, 4, 11, 30).getTime() });
    assert.equal(late.beatWindow, false);
  });

  test('uses the configured end time', () => {
    const s = morningWindowStatus({ ...base, windowEnd: 570, now: new Date(2026, 10, 4, 9, 0) });
    assert.equal(formatRemaining(s.remainingMs), '30m');
  });

  test('formats remaining time', () => {
    assert.equal(formatRemaining(30000), 'under a minute');
    assert.equal(formatRemaining(60000), '1m');
    assert.equal(formatRemaining(3600000), '1h');
    assert.equal(formatRemaining(5400000), '1h 30m');
  });
});
