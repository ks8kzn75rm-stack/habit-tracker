import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { BUILT_IN_CARDS, CREDITS, THEMES, creditText, libraryCards } from '../../js/core/cards.js';
import { isCardRecordEmpty, normalizeCardRecord } from '../../js/core/model.js';

describe('card library', () => {
  test('at least 60 original cards across all eight themes', () => {
    assert.ok(BUILT_IN_CARDS.length >= 60, String(BUILT_IN_CARDS.length));
    assert.deepEqual(THEMES.map((t) => t.label), ['Resistance', 'Turning pro', 'Finitude', 'Choosing', 'Joy of the craft', 'Patience', 'Present moment', 'Perspective']);
    for (const theme of THEMES) {
      assert.ok(BUILT_IN_CARDS.filter((c) => c.theme === theme.id).length >= 7, theme.id);
    }
  });

  test('every card has a unique id, a credit line and a short text', () => {
    assert.equal(new Set(BUILT_IN_CARDS.map((c) => c.id)).size, BUILT_IN_CARDS.length);
    for (const c of BUILT_IN_CARDS) {
      assert.ok(CREDITS[c.credit], c.id);
      assert.ok(c.text.length >= 30 && c.text.length <= 160, `${c.id}: ${c.text.length}`);
      assert.match(creditText(c.credit), /^(Idea from|Inspired by) /);
    }
  });

  test('cards stay warm: no guilt or alarm words', () => {
    for (const c of BUILT_IN_CARDS) {
      assert.doesNotMatch(c.text, /\b(lazy|failure|failed|shame|ashamed|hurry|deadline|wasting|guilty)\b/i, c.id);
    }
  });

  test('your favourites, hidden cards, edits and own cards merge over the library', () => {
    const records = new Map([
      ['res-01', normalizeCardRecord({ id: 'res-01', favourite: true })],
      ['res-02', normalizeCardRecord({ id: 'res-02', hidden: true })],
      ['res-03', normalizeCardRecord({ id: 'res-03', text: 'My own take on this one.' })],
      ['c-1', normalizeCardRecord({ id: 'c-1', custom: true, theme: 'joy', text: 'Make something small and lovely today.' })],
    ]);
    const cards = libraryCards(records);
    const byId = new Map(cards.map((c) => [c.id, c]));
    assert.equal(byId.get('res-01').favourite, true);
    assert.equal(byId.get('res-02').hidden, true);
    assert.equal(byId.get('res-03').text, 'My own take on this one.');
    assert.equal(byId.get('res-03').edited, true);
    assert.equal(byId.get('c-1').builtIn, false);
    assert.equal(byId.get('c-1').credit, 'Your own card');
    assert.equal(cards.length, BUILT_IN_CARDS.length + 1);
  });

  test('records with nothing to remember are dropped', () => {
    assert.equal(isCardRecordEmpty(normalizeCardRecord({ id: 'res-01' })), true);
    assert.equal(normalizeCardRecord({ id: 'c-2', custom: true, text: '' }), null);
  });
});
