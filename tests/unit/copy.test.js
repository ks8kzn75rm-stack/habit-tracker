import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { greeting, heroMessage, phaseFor, pick, tipFor } from '../../js/core/copy.js';

const stats = (over = {}) => ({ dueCount: 10, doneCount: 0, ratio: 0, perfect: false, morningWin: false, ...over });
const message = (over, phase = 'morning', isToday = true) => heroMessage({ stats: stats(over), isToday, phase, seed: 'x' });

describe('encouraging copy', () => {
  test('phases and greetings follow the clock', () => {
    assert.equal(phaseFor(4 * 60), 'morning');
    assert.equal(phaseFor(11 * 60 + 59), 'morning');
    assert.equal(phaseFor(12 * 60), 'daytime');
    assert.equal(phaseFor(18 * 60), 'evening');
    assert.equal(phaseFor(2 * 60), 'evening');
    assert.equal(greeting(9 * 60), 'Good morning');
    assert.equal(greeting(15 * 60), 'Good afternoon');
    assert.equal(greeting(21 * 60), 'Good evening');
  });

  test('messages suit the moment', () => {
    assert.match(message({}, 'morning'), /start|win|first/i);
    assert.match(message({ doneCount: 5, ratio: 0.5, morningWin: true }, 'morning'), /Morning|morning/);
    // A Morning Win is old news by the evening.
    assert.doesNotMatch(message({ doneCount: 6, ratio: 0.6, morningWin: true }, 'evening'), /morning|start/i);
    assert.match(message({ doneCount: 10, ratio: 1, perfect: true }, 'evening'), /full house|sweep/i);
    assert.match(message({ dueCount: 0 }), /Nothing scheduled/);
    assert.match(message({}, 'evening', false), /log|gaps/i);
  });

  test('never uses negative words', () => {
    const cases = [{}, { doneCount: 1, ratio: 0.1 }, { doneCount: 6, ratio: 0.6 }, { doneCount: 5, morningWin: true, ratio: 0.5 }];
    for (const phase of ['morning', 'daytime', 'evening']) {
      for (const c of cases) {
        for (let seed = 0; seed < 20; seed++) {
          const text = heroMessage({ stats: stats(c), isToday: true, phase, seed: String(seed) });
          assert.doesNotMatch(text, /\b(fail|failed|missed|behind|lazy|should have|only)\b/i, text);
        }
      }
    }
  });

  test('picks are stable for a seed', () => {
    assert.equal(pick(['a', 'b', 'c'], 'seed'), pick(['a', 'b', 'c'], 'seed'));
  });

  test('every starter habit has a tip, custom habits get a generic one', () => {
    for (const key of ['water', 'sleep', 'sunlight', 'phone-free', 'gym', 'deep-work', 'squats', 'vitamin-d', 'learn', 'savour', 'stillness', 'fun-phone', 'lights-out', 'social', 'strength']) {
      assert.ok(tipFor({ id: `d-${key}`, tip: key }).length > 20, key);
    }
    assert.ok(tipFor({ id: 'h-custom', tip: null }).length > 20);
  });
});
