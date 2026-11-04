/**
 * The Begin ritual: a short daily practice that turns intentions into action.
 *
 *   arrive -> breathe (optional) -> card -> choose -> let go -> begin
 *
 * How you arrive tailors the wording and which card you see. "Fired up" skips
 * straight to choosing. The ritual is offered once a day, the first time the
 * app is opened after the day starts, and never in the evening.
 */
import { creditText } from './cards.js';
import { addDays, logicalDayKey, minutesIntoDay } from './dates.js';
import { hashString } from './copy.js';

/** No automatic ritual from 6pm: evenings belong to the reflection. */
export const RITUAL_LATEST_MINUTES = 18 * 60;
const MORNING_START_MINUTES = 4 * 60;

export const ARRIVALS = Object.freeze([
  {
    id: 'anxious',
    label: 'Anxious',
    emoji: '🌊',
    themes: ['perspective', 'present', 'patience'],
    intro: 'Let’s slow everything down for a moment.',
    breathe: 'A few slow breaths tell your body it’s safe to begin.',
    choose: 'What’s one thing that would feel good to move forward today?',
    begin: 'Start small. A short session is a real session.',
    minutes: 25,
  },
  {
    id: 'stuck',
    label: 'Stuck',
    emoji: '🪨',
    themes: ['resistance', 'pro'],
    intro: 'Stuck is just Resistance doing its job. You can still begin.',
    breathe: 'Breathe first. Then we’ll make the first step tiny.',
    choose: 'Which one thing is Resistance guarding most closely?',
    begin: 'Five minutes is enough to get unstuck.',
    minutes: 5,
  },
  {
    id: 'flat',
    label: 'Flat',
    emoji: '🌫️',
    themes: ['joy', 'finitude'],
    intro: 'Low energy is allowed. Let’s look for a spark.',
    breathe: 'A slow breath can stir a little energy.',
    choose: 'Which project could you approach with a bit of play today?',
    begin: 'Begin gently. Momentum often brings the energy with it.',
    minutes: 25,
  },
  {
    id: 'scattered',
    label: 'Scattered',
    emoji: '🍃',
    themes: ['choosing', 'present'],
    intro: 'Let’s gather everything into one clear choice.',
    breathe: 'Breathe and let the noise settle.',
    choose: 'If only one thing moved forward today, which would it be?',
    begin: 'One thing, one block of time. The rest can wait.',
    minutes: 25,
  },
  {
    id: 'fired',
    label: 'Fired up',
    emoji: '🔥',
    themes: ['pro', 'joy'],
    intro: 'Love that energy. Let’s point it at what matters.',
    breathe: '',
    choose: 'Where does this energy belong today?',
    begin: 'Ride the wave. Begin while it’s strong.',
    minutes: null,
    skipToChoose: true,
  },
]);

export const ARRIVAL_IDS = ARRIVALS.map((a) => a.id);

export function arrivalById(id) {
  return ARRIVALS.find((a) => a.id === id) || null;
}

/** The steps for a given arrival state. */
export function ritualSteps(arrivalId) {
  if (arrivalById(arrivalId)?.skipToChoose) return ['arrive', 'choose', 'letgo', 'begin'];
  return ['arrive', 'breathe', 'card', 'choose', 'letgo', 'begin'];
}

/**
 * Whether to open the ritual automatically now.
 * Once per logical day, only after the day starts (and after 4am), never from
 * 6pm, and never once it's been done or skipped today.
 */
export function shouldOfferRitual({ enabled, now, dayStart, offeredDay, entry }) {
  if (!enabled) return false;
  const minutes = minutesIntoDay(now);
  if (minutes < Math.max(dayStart, MORNING_START_MINUTES) || minutes >= RITUAL_LATEST_MINUTES) return false;
  const today = logicalDayKey(now, dayStart);
  if (offeredDay === today) return false;
  if (entry?.ritual?.completedAt || entry?.ritual?.skippedAt) return false;
  return true;
}

export function isRitualDone(entry) {
  return Boolean(entry?.ritual?.completedAt);
}

/**
 * Choose today's card for how you arrived: matching themes first, never a
 * hidden card, avoiding recent ones, with favourites coming round more often.
 * Deterministic for a given day so it doesn't change on re-render.
 */
export function pickCard({ cards, arrivalId, dayKey, recentIds = [] }) {
  const arrival = arrivalById(arrivalId);
  const visible = cards.filter((c) => !c.hidden);
  if (!visible.length) return null;
  let pool = arrival ? visible.filter((c) => arrival.themes.includes(c.theme)) : visible;
  if (!pool.length) pool = visible;
  const fresh = pool.filter((c) => !recentIds.includes(c.id));
  if (fresh.length) pool = fresh;
  const weighted = pool.flatMap((c) => (c.favourite ? [c, c, c] : [c]));
  return weighted[hashString(`${dayKey}:${arrivalId}`) % weighted.length];
}

/** Lines from your Foundations that can accompany the card. */
export function foundationLines(foundations) {
  const f = foundations || {};
  const lines = [];
  if (f.why) lines.push({ kind: 'why', label: 'Your why', text: firstSentences(f.why, 160) });
  for (const joy of f.joys || []) lines.push({ kind: 'joy', label: 'A joy of yours', text: joy });
  if (f.letter) {
    for (const sentence of splitSentences(f.letter)) {
      if (sentence.length >= 12) lines.push({ kind: 'vision', label: 'From your future self', text: sentence });
    }
  }
  if (f.opportunity) lines.push({ kind: 'season', label: 'This season', text: firstSentences(f.opportunity, 160) });
  return lines;
}

export function pickFoundationLine(foundations, dayKey) {
  const lines = foundationLines(foundations);
  if (!lines.length) return null;
  return lines[hashString(`line:${dayKey}`) % lines.length];
}

function splitSentences(text) {
  // (No regex lookbehind: older iOS versions can't parse it.)
  return String(text)
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]*/g) || [])
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstSentences(text, max) {
  const sentences = splitSentences(text);
  let out = '';
  for (const s of sentences) {
    if (out && out.length + s.length + 1 > max) break;
    out = out ? `${out} ${s}` : s;
  }
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out;
}

/** Cards shown in the last `days` days, so tomorrow's card is a different one. */
export function recentCardIds(journal, todayKey, days = 7) {
  const ids = [];
  for (let i = 1; i <= days; i++) {
    const id = journal.get(addDays(todayKey, -i))?.ritual?.cardId;
    if (id) ids.push(id);
  }
  return ids;
}

// ------------------------------------------------------------ I'm stuck

export const RESISTANCE_FORMS = Object.freeze([
  {
    id: 'perfectionism',
    label: 'Perfectionism',
    reframe: 'Perfectionism is Resistance wearing its best clothes. Today you’re aiming for a rough version, not a finished one. Rough is how every good thing starts.',
    step: 'Make a deliberately imperfect first pass.',
  },
  {
    id: 'distraction',
    label: 'Distraction',
    reframe: 'The pull to check something else is Resistance looking for an exit. You don’t have to resist it for an hour, only for the next five minutes.',
    step: 'Put the phone out of reach and open the work.',
  },
  {
    id: 'not-ready',
    label: '“Not ready yet”',
    reframe: '“Not ready yet” is one of Resistance’s favourite lines. Readiness is something you build by starting, not a gate you wait at.',
    step: 'Begin with the part you already know.',
  },
  {
    id: 'self-doubt',
    label: 'Self-doubt',
    reframe: 'Doubting yourself is a sign you care about doing this well. People rarely doubt themselves over work that doesn’t matter to them.',
    step: 'Make one small mark: a sentence, a sketch, a note.',
  },
  {
    id: 'excuse',
    label: 'A reasonable-sounding excuse',
    reframe: 'The most reasonable-sounding reason to wait deserves the most curiosity. Is it true, or just comfortable?',
    step: 'Do five minutes first. You can still decide afterwards.',
  },
]);

export const RESCUE_CREDIT = creditText('pressfield');
export const RESCUE_MINUTES = 5;

export function resistanceForm(id) {
  return RESISTANCE_FORMS.find((f) => f.id === id) || null;
}

// ------------------------------------------------------- letting go, words

export const LETTING_GO_SUGGESTIONS = Object.freeze([
  'Checking messages first thing',
  'Making it perfect',
  'Doing everything today',
]);

export const TOMORROW_WORDS = Object.freeze(['Steady', 'Bold', 'Gentle', 'Focus', 'Play', 'Brave', 'Simple', 'Begin']);

/** A single word, tidied: "  calm, focused " -> "Calm". */
export function cleanWord(value) {
  const word = String(value ?? '').trim().split(/\s+/)[0] || '';
  const tidy = word.replace(/[^\p{L}\p{N}'’-]/gu, '').slice(0, 24);
  return tidy ? tidy[0].toLocaleUpperCase() + tidy.slice(1) : '';
}

/** The word chosen last night, shown in this morning's ritual. */
export function wordForToday(journal, todayKey) {
  return journal.get(addDays(todayKey, -1))?.reflection?.tomorrowWord || '';
}

/** "Now" rounded up to the next five minutes, as minutes past midnight. */
export function suggestedStart(now) {
  const minutes = minutesIntoDay(now);
  return Math.min(1435, Math.ceil(minutes / 5) * 5);
}
