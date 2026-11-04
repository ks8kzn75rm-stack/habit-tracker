/**
 * The card library: short, original reflections drawing on ideas from two
 * books. Nothing here quotes either book; every card is written in its own
 * words and carries a credit line for the idea behind it.
 *
 * You can favourite, hide or edit any card, and add your own. Those choices
 * are stored as "card records" and merged over the built-in cards.
 */

export const THEMES = [
  { id: 'resistance', label: 'Resistance' },
  { id: 'pro', label: 'Turning pro' },
  { id: 'finitude', label: 'Finitude' },
  { id: 'choosing', label: 'Choosing' },
  { id: 'joy', label: 'Joy of the craft' },
  { id: 'patience', label: 'Patience' },
  { id: 'present', label: 'Present moment' },
  { id: 'perspective', label: 'Perspective' },
];

export const THEME_IDS = THEMES.map((t) => t.id);

export const CREDITS = {
  pressfield: 'Idea from The War of Art by Steven Pressfield',
  burkeman: 'Idea from Four Thousand Weeks by Oliver Burkeman',
  both: 'Inspired by The War of Art (Steven Pressfield) and Four Thousand Weeks (Oliver Burkeman)',
};

const card = (id, theme, credit, text) => Object.freeze({ id, theme, credit, text });

export const BUILT_IN_CARDS = Object.freeze([
  // Resistance
  card('res-01', 'resistance', 'pressfield', 'That tug towards anything except the work has a name: Resistance. Naming it is half the battle.'),
  card('res-02', 'resistance', 'pressfield', 'Resistance grows with the importance of the work. Feeling it is a sign you’re facing the right way.'),
  card('res-03', 'resistance', 'pressfield', 'Resistance rarely says no. It says “later”, “tomorrow” or “just one more thing first”.'),
  card('res-04', 'resistance', 'pressfield', 'A sudden urge to tidy, check or research is often Resistance in a helpful-looking disguise.'),
  card('res-05', 'resistance', 'pressfield', 'Perfectionism is Resistance with good taste. Let today’s version be rough; you can only improve what exists.'),
  card('res-06', 'resistance', 'pressfield', 'Resistance isn’t a judgement on your ability. It turns up for everyone who reaches for something that matters.'),
  card('res-07', 'resistance', 'pressfield', 'You don’t need to beat Resistance for ever. Just outlast it for the next ten minutes.'),
  card('res-08', 'resistance', 'pressfield', 'The most sensible-sounding reason to wait deserves the most curiosity.'),
  card('res-09', 'resistance', 'pressfield', 'Self-doubt tends to visit the work we care about. Treat it as a hint that this one counts.'),

  // Turning pro
  card('pro-01', 'pro', 'pressfield', 'Professionals don’t wait to feel ready. They turn up at the agreed time and let the feeling catch up.'),
  card('pro-02', 'pro', 'pressfield', 'Inspiration usually arrives after you’ve started. Sit down and give it somewhere to land.'),
  card('pro-03', 'pro', 'pressfield', 'Treat today’s session as an appointment with someone you respect: you.'),
  card('pro-04', 'pro', 'pressfield', 'Mood is weather. Showing up is the climate you build, one session at a time.'),
  card('pro-05', 'pro', 'pressfield', 'Sitting down to begin is the real victory. Everything after that is a bonus.'),
  card('pro-06', 'pro', 'pressfield', 'A pro expects some sessions to feel clumsy, and counts them anyway.'),
  card('pro-07', 'pro', 'pressfield', 'Do the work for love of the work. Praise, if it comes, is a side effect.'),
  card('pro-08', 'pro', 'pressfield', 'Your craft is home ground. It feeds you whether or not anyone is watching.'),
  card('pro-09', 'pro', 'both', 'Because your time is finite, choose a few things. Because they matter, show up for them daily.'),

  // Finitude
  card('fin-01', 'finitude', 'burkeman', 'You get a few thousand weeks. Not a reason to panic, but the reason this one is precious.'),
  card('fin-02', 'finitude', 'burkeman', 'You’ll never get on top of everything, and nobody ever has. What a relief: you can stop trying and start choosing.'),
  card('fin-03', 'finitude', 'burkeman', 'This week won’t come round again. What a privilege to get to spend it.'),
  card('fin-04', 'finitude', 'burkeman', 'Time isn’t a problem to solve; it’s what your life is made of. Spend some of today on what you love.'),
  card('fin-05', 'finitude', 'burkeman', 'The shortness of a life is what lends an ordinary morning its quiet worth.'),
  card('fin-06', 'finitude', 'burkeman', 'Instead of making time for everything, ask what deserves the time you have.'),
  card('fin-07', 'finitude', 'burkeman', 'Every yes quietly says no to something else. That isn’t loss; it’s what choosing means.'),
  card('fin-08', 'finitude', 'both', 'Let urgency come from gratitude, not fear: you get to do this today.'),

  // Choosing
  card('cho-01', 'choosing', 'burkeman', 'Pick one main thing for today. A clear choice beats a crowded list.'),
  card('cho-02', 'choosing', 'burkeman', 'Keep no more than three things on the go. Everything else can wait, guilt-free, in the parking lot.'),
  card('cho-03', 'choosing', 'burkeman', 'Letting something go on purpose feels very different from letting it slip by accident.'),
  card('cho-04', 'choosing', 'burkeman', 'Decide this morning what you’ll happily neglect today, so it’s a choice rather than a nagging worry.'),
  card('cho-05', 'choosing', 'burkeman', 'Finishing one thing does more for you than half-starting five.'),
  card('cho-06', 'choosing', 'burkeman', 'You don’t need the perfect choice, just a good one, and then your full attention.'),
  card('cho-07', 'choosing', 'burkeman', 'The parking lot isn’t a graveyard. Ideas wait there safely until there’s room for them.'),
  card('cho-08', 'choosing', 'burkeman', 'Doing a few things properly beats doing everything a little.'),

  // Joy of the craft
  card('joy-01', 'joy', 'burkeman', 'Some things are worth doing purely because doing them feels alive. Let today’s work be one of them.'),
  card('joy-02', 'joy', 'both', 'Remember what drew you to this work in the first place. That spark is still in there.'),
  card('joy-03', 'joy', 'burkeman', 'Approach today with a sense of play. Curiosity is a better engine than pressure.'),
  card('joy-04', 'joy', 'pressfield', 'The joy lives in the making, not only in the finished thing.'),
  card('joy-05', 'joy', 'burkeman', 'Hours spent absorbed in something you love are never wasted hours.'),
  card('joy-06', 'joy', 'pressfield', 'Work for the pleasure of doing it well. Let the outcome be a bonus.'),
  card('joy-07', 'joy', 'burkeman', 'Be an amateur in the old sense of the word: someone who does it for love.'),
  card('joy-08', 'joy', 'both', 'Joy is a fuel that doesn’t run out the way fear does. Choose the better fuel.'),

  // Patience
  card('pat-01', 'patience', 'burkeman', 'Modest daily effort quietly beats heroic bursts. Today you just need to show up for a while.'),
  card('pat-02', 'patience', 'burkeman', 'Stop while there’s still something left in the tank. It makes tomorrow far easier to start.'),
  card('pat-03', 'patience', 'burkeman', 'Good work is often slow at first. That isn’t a warning sign; it’s simply how it goes.'),
  card('pat-04', 'patience', 'burkeman', 'The early stretch of any path looks like everyone else’s. Keep going and it becomes yours.'),
  card('pat-05', 'patience', 'burkeman', 'A little, consistently, adds up to far more than you’d guess.'),
  card('pat-06', 'patience', 'burkeman', 'Let things take the time they take. Rushing rarely speeds them up; it just makes the ride rougher.'),
  card('pat-07', 'patience', 'burkeman', 'Today’s session is a brick, not the whole building. Lay it well and trust the wall.'),
  card('pat-08', 'patience', 'burkeman', 'You’re allowed to go slowly. Steady is still moving.'),

  // Present moment
  card('pre-01', 'present', 'burkeman', 'This moment doesn’t need to lead anywhere to count. It’s already the real thing.'),
  card('pre-02', 'present', 'burkeman', 'Life isn’t waiting at the end of the to-do list. It’s happening in the middle of it.'),
  card('pre-03', 'present', 'burkeman', 'Act imperfectly now rather than perfectly someday. Someday rarely turns up.'),
  card('pre-04', 'present', 'burkeman', 'Conditions will never be ideal. Begin in the ones you’ve got.'),
  card('pre-05', 'present', 'burkeman', 'You don’t have to clear the decks first. Start in the middle of the mess.'),
  card('pre-06', 'present', 'burkeman', 'Give this hour your full attention. It’s the only place you ever actually live.'),
  card('pre-07', 'present', 'burkeman', 'Breathe out. You’re here, it’s now, and that’s enough to begin.'),
  card('pre-08', 'present', 'burkeman', 'Rather than planning the perfect day, take the next small step in this one.'),

  // Perspective
  card('per-01', 'perspective', 'burkeman', 'In the grand scheme your life is small, and that’s freeing. The stakes are lower than they feel, so be bold.'),
  card('per-02', 'perspective', 'burkeman', 'Nobody is keeping score as closely as you are. Take the risk.'),
  card('per-03', 'perspective', 'burkeman', 'Set today’s worry against the age of the stars and it shrinks. Let that make you braver, not smaller.'),
  card('per-04', 'perspective', 'burkeman', 'You don’t need to change the world. Doing something you care about, well, is plenty.'),
  card('per-05', 'perspective', 'burkeman', 'Most mistakes are survivable and quickly forgotten by everyone except you. Try the thing.'),
  card('per-06', 'perspective', 'burkeman', 'A year from now, what will you be glad you started today?'),
  card('per-07', 'perspective', 'burkeman', 'Your life doesn’t have to earn its worth through achievements. It’s already worth living.'),
  card('per-08', 'perspective', 'both', 'Hold the outcome lightly and the work wholeheartedly.'),
]);

export function creditText(credit) {
  return CREDITS[credit] || (typeof credit === 'string' && credit.trim() ? credit.trim() : 'Your own card');
}

/**
 * The effective library: built-in cards with your edits, favourites and hidden
 * flags applied, followed by your own cards.
 * @param {Map<string, object>} records  card records keyed by id
 */
export function libraryCards(records = new Map()) {
  const out = [];
  for (const builtIn of BUILT_IN_CARDS) {
    const r = records.get(builtIn.id);
    out.push({
      id: builtIn.id,
      theme: builtIn.theme,
      text: r?.text || builtIn.text,
      originalText: builtIn.text,
      credit: creditText(builtIn.credit),
      builtIn: true,
      edited: Boolean(r?.text),
      favourite: Boolean(r?.favourite),
      hidden: Boolean(r?.hidden),
    });
  }
  for (const r of records.values()) {
    if (!r.custom) continue;
    out.push({
      id: r.id,
      theme: THEME_IDS.includes(r.theme) ? r.theme : 'joy',
      text: r.text,
      originalText: r.text,
      credit: creditText(r.credit),
      builtIn: false,
      edited: false,
      favourite: Boolean(r.favourite),
      hidden: Boolean(r.hidden),
    });
  }
  return out;
}
