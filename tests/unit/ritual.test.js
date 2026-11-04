import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { libraryCards } from '../../js/core/cards.js';
import {
  ARRIVALS,
  RESISTANCE_FORMS,
  cleanWord,
  foundationLines,
  pickCard,
  pickFoundationLine,
  recentCardIds,
  ritualSteps,
  shouldOfferRitual,
  suggestedStart,
  wordForToday,
} from '../../js/core/ritual.js';

process.env.TZ = 'Europe/London';

const at = (iso) => new Date(iso);
const base = { enabled: true, dayStart: 240, offeredDay: null, entry: null };

describe('once-per-day ritual', () => {
  test('offered on the first open after the day starts', () => {
    assert.equal(shouldOfferRitual({ ...base, now: at('2026-11-04T07:30:00') }), true);
  });

  test('not before the day starts: late nights still belong to yesterday', () => {
    assert.equal(shouldOfferRitual({ ...base, now: at('2026-11-04T03:59:00') }), false);
    assert.equal(shouldOfferRitual({ ...base, now: at('2026-11-04T04:00:00') }), true);
    // A later day start moves the door too.
    assert.equal(shouldOfferRitual({ ...base, dayStart: 360, now: at('2026-11-04T05:30:00') }), false);
    assert.equal(shouldOfferRitual({ ...base, dayStart: 360, now: at('2026-11-04T06:00:00') }), true);
  });

  test('only once per logical day', () => {
    assert.equal(shouldOfferRitual({ ...base, offeredDay: '2026-11-04', now: at('2026-11-04T09:00:00') }), false);
    // Offered yesterday: today is a new day.
    assert.equal(shouldOfferRitual({ ...base, offeredDay: '2026-11-03', now: at('2026-11-04T09:00:00') }), true);
    // 2am still counts as yesterday, which was already offered.
    assert.equal(shouldOfferRitual({ ...base, offeredDay: '2026-11-03', now: at('2026-11-04T02:00:00') }), false);
  });

  test('not once done or skipped today', () => {
    const now = at('2026-11-04T09:00:00');
    assert.equal(shouldOfferRitual({ ...base, now, entry: { ritual: { completedAt: 1 } } }), false);
    assert.equal(shouldOfferRitual({ ...base, now, entry: { ritual: { skippedAt: 1 } } }), false);
  });

  test('never in the evening, and never when switched off', () => {
    assert.equal(shouldOfferRitual({ ...base, now: at('2026-11-04T17:59:00') }), true);
    assert.equal(shouldOfferRitual({ ...base, now: at('2026-11-04T18:00:00') }), false);
    assert.equal(shouldOfferRitual({ ...base, dayStart: 0, now: at('2026-11-04T00:30:00') }), false);
    assert.equal(shouldOfferRitual({ ...base, enabled: false, now: at('2026-11-04T08:00:00') }), false);
  });

  test('works across a DST change', () => {
    // Clocks went back on 25 Oct 2026: 01:30 happens twice, both before the day start.
    assert.equal(shouldOfferRitual({ ...base, now: new Date('2026-10-25T00:30:00Z') }), false);
    assert.equal(shouldOfferRitual({ ...base, now: new Date('2026-10-25T01:30:00Z') }), false);
    assert.equal(shouldOfferRitual({ ...base, now: new Date('2026-10-25T08:00:00Z') }), true);
  });
});

describe('ritual steps', () => {
  test('every arrival has its own wording', () => {
    assert.deepEqual(ARRIVALS.map((a) => a.label), ['Anxious', 'Stuck', 'Flat', 'Scattered', 'Fired up']);
    for (const a of ARRIVALS) {
      assert.ok(a.intro && a.choose && a.begin, a.id);
      assert.doesNotMatch(`${a.intro} ${a.choose} ${a.begin}`, /\b(fail|lazy|should have|behind|hurry)\b/i);
    }
  });

  test('“Fired up” jumps straight to choosing', () => {
    assert.deepEqual(ritualSteps('fired'), ['arrive', 'choose', 'letgo', 'begin']);
    assert.deepEqual(ritualSteps('anxious'), ['arrive', 'breathe', 'card', 'choose', 'letgo', 'begin']);
  });
});

describe('card choice', () => {
  const cards = libraryCards();

  test('matches the arrival and is stable for the day', () => {
    const card = pickCard({ cards, arrivalId: 'stuck', dayKey: '2026-11-04' });
    assert.ok(['resistance', 'pro'].includes(card.theme));
    assert.equal(pickCard({ cards, arrivalId: 'stuck', dayKey: '2026-11-04' }).id, card.id);
    const anxious = pickCard({ cards, arrivalId: 'anxious', dayKey: '2026-11-04' });
    assert.ok(['perspective', 'present', 'patience'].includes(anxious.theme));
  });

  test('never shows a hidden card and avoids recent ones', () => {
    const scattered = cards.filter((c) => ['choosing', 'present'].includes(c.theme));
    const hidden = cards.map((c) => (scattered.slice(1).some((s) => s.id === c.id) ? { ...c, hidden: true } : c));
    for (let d = 1; d <= 20; d++) {
      const day = `2026-11-${String(d).padStart(2, '0')}`;
      assert.equal(pickCard({ cards: hidden, arrivalId: 'scattered', dayKey: day }).id, scattered[0].id);
    }
    const recent = scattered.slice(0, scattered.length - 1).map((c) => c.id);
    assert.equal(pickCard({ cards, arrivalId: 'scattered', dayKey: '2026-11-04', recentIds: recent }).id, scattered.at(-1).id);
  });

  test('falls back gracefully when a whole theme is hidden', () => {
    const allHidden = cards.map((c) => (['resistance', 'pro'].includes(c.theme) ? { ...c, hidden: true } : c));
    const card = pickCard({ cards: allHidden, arrivalId: 'stuck', dayKey: '2026-11-04' });
    assert.ok(card && !card.hidden);
    assert.equal(pickCard({ cards: cards.map((c) => ({ ...c, hidden: true })), arrivalId: 'stuck', dayKey: 'x' }), null);
  });

  test('recent cards come from the journal', () => {
    const journal = new Map([
      ['2026-11-03', { ritual: { cardId: 'res-01' } }],
      ['2026-11-01', { ritual: { cardId: 'pro-02' } }],
    ]);
    assert.deepEqual(recentCardIds(journal, '2026-11-04'), ['res-01', 'pro-02']);
  });
});

describe('foundations and words', () => {
  test('one line from your foundations', () => {
    assert.equal(pickFoundationLine({}, '2026-11-04'), null);
    const f = { why: 'To make things that help people. And to enjoy it.', joys: ['Morning walks'], letter: 'You kept going. It was worth it!', opportunity: '' };
    const kinds = foundationLines(f).map((l) => l.kind);
    assert.deepEqual(kinds, ['why', 'joy', 'vision', 'vision']);
    assert.ok(pickFoundationLine(f, '2026-11-04').text.length > 0);
  });

  test('tomorrow’s word appears the next morning', () => {
    const journal = new Map([['2026-11-03', { reflection: { tomorrowWord: 'Steady' } }]]);
    assert.equal(wordForToday(journal, '2026-11-04'), 'Steady');
    assert.equal(wordForToday(journal, '2026-11-05'), '');
    assert.equal(cleanWord('  calm and focused '), 'Calm');
    assert.equal(cleanWord('bold!'), 'Bold');
    assert.equal(cleanWord(''), '');
  });

  test('every form of Resistance has a reframe and a first step', () => {
    assert.deepEqual(RESISTANCE_FORMS.map((f) => f.id), ['perfectionism', 'distraction', 'not-ready', 'self-doubt', 'excuse']);
    for (const f of RESISTANCE_FORMS) assert.ok(f.reframe.length > 40 && f.step.length > 10, f.id);
  });

  test('suggested start rounds up to five minutes', () => {
    assert.equal(suggestedStart(new Date(2026, 10, 4, 9, 2)), 9 * 60 + 5);
    assert.equal(suggestedStart(new Date(2026, 10, 4, 9, 5)), 9 * 60 + 5);
  });
});
