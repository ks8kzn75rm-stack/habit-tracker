/**
 * Encouraging copy. Messages are picked deterministically from a seed so they
 * don't flicker on every re-render, but vary from day to day.
 */

export function hashString(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(list, seed) {
  return list[hashString(seed) % list.length];
}

/** Time-of-day phase used for greetings and the header colour. */
export function phaseFor(minutes) {
  if (minutes >= 240 && minutes < 720) return 'morning';
  if (minutes >= 720 && minutes < 1080) return 'daytime';
  return 'evening';
}

export function greeting(minutes) {
  return { morning: 'Good morning', daytime: 'Good afternoon', evening: 'Good evening' }[phaseFor(minutes)];
}

const MESSAGES = {
  freshMorning: [
    'A fresh start. One small tick gets the ball rolling.',
    'Start small: a glass of water is a real win.',
    'Ease in. The first habit is the hardest, and it’s a small one.',
  ],
  freshDay: [
    'Plenty of day left. Pick one easy win to start.',
    'Any moment is a good moment to begin.',
  ],
  freshEvening: [
    'The evening counts too. One calm habit is a lovely finish.',
    'Wind down your way. Every tick tonight still counts.',
  ],
  started: [
    'Nice start. Momentum builds from here.',
    'You’re in motion. Keep it light.',
    'Good going. Small steps, real progress.',
  ],
  overHalf: [
    'Over halfway. Lovely work.',
    'More done than not. This is a good day.',
    'You’re on a roll today.',
  ],
  morningWin: [
    'Morning Win secured. The day is yours.',
    'Strong start. Your morning set the tone.',
    'Morning done. Everything from here is a bonus.',
  ],
  allDone: [
    'Every habit done. That’s a full house!',
    'Clean sweep today. Take a moment to enjoy it.',
  ],
  eveningGood: [
    'A good day’s work. Time to wind down.',
    'Most of the day ticked off. Rest well tonight.',
  ],
  eveningSome: [
    'Every habit you did today counts. Rest well.',
    'Some good things happened today. Tomorrow’s a fresh page.',
  ],
  past: [
    'Catching up counts. Log what happened, whatever it was.',
    'Filling in the gaps keeps your streaks honest and alive.',
  ],
  restDay: ['Nothing scheduled today. Enjoy the breathing room.'],
};

/** The line under today's score. Always encouraging, and right for the time of day. */
export function heroMessage({ stats, isToday, phase, seed }) {
  if (!isToday) return pick(MESSAGES.past, seed);
  if (stats.dueCount === 0) return pick(MESSAGES.restDay, seed);
  if (stats.perfect) return pick(MESSAGES.allDone, seed);
  if (stats.doneCount === 0) {
    const list = { morning: MESSAGES.freshMorning, daytime: MESSAGES.freshDay, evening: MESSAGES.freshEvening }[phase];
    return pick(list, seed);
  }
  if (phase === 'evening') return pick(stats.ratio >= 0.5 ? MESSAGES.eveningGood : MESSAGES.eveningSome, seed);
  if (stats.morningWin) return pick(MESSAGES.morningWin, seed);
  if (stats.ratio >= 0.5) return pick(MESSAGES.overHalf, seed);
  return pick(MESSAGES.started, seed);
}

const TIPS = {
  water: 'Leave a full glass by your bed tonight so it’s the first thing you see.',
  sleep: 'Protect the hour before lights out: dim the screens and keep it calm.',
  sunlight: 'Pair it with something you already do, like coffee by a window or a short walk.',
  'phone-free': 'Charge your phone outside the bedroom and choose your first task the night before.',
  gym: 'Lay out your kit the night before and pick a leave-by time.',
  'deep-work': 'Book the 90 minutes like a meeting and start with the easiest piece.',
  squats: 'Do a quick set while the kettle boils. Small and often counts.',
  'vitamin-d': 'Keep it next to something you use every morning.',
  learn: 'Shrink it: set a 15-minute timer and stop when it rings.',
  savour: 'Choose one thing, like a meal, a song or a walk, and give it your full attention.',
  stillness: 'Try it straight after a habit you already do, with a gentle timer.',
  'fun-phone': 'Set a “closing time” alarm for your phone and charge it out of reach.',
  'lights-out': 'Start winding down 30 minutes before your target time.',
  social: 'A two-line message counts. Who would love to hear from you?',
  strength: 'Pick your two days now and treat them like appointments.',
};

const GENERIC_TIPS = [
  'Make it smaller. What’s the two-minute version for a busy day?',
  'Attach it to something you already do every day.',
  'Make it obvious: leave a cue where you’ll see it at the right moment.',
];

export function tipFor(habit) {
  return TIPS[habit.tip] || pick(GENERIC_TIPS, habit.id);
}
