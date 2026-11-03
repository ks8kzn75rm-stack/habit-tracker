/** Default settings, starter habits and the example project. */

export const DEFAULT_SETTINGS = Object.freeze({
  dayStart: 240, // 4:00am: check-ins before this count towards the previous day
  windowEnd: 600, // 10:00am: end of the morning window
  lightsOut: 1350, // 10:30pm: lights-out target
  weekStartsOn: 1, // Monday
  morningWinBonus: 25,
  haptics: true,
});

const MON = 1;
const WED = 3;
const FRI = 5;

const STARTER_HABITS = [
  { key: 'water', name: 'Glass of water on waking', group: 'morning', points: 10 },
  { key: 'sleep', name: 'Slept 7–8 hours', group: 'morning', points: 10 },
  { key: 'sunlight', name: 'Morning sunlight', group: 'morning', points: 10 },
  { key: 'phone-free', name: 'Phone-free until first real task is done', group: 'morning', points: 15 },
  {
    key: 'gym',
    name: 'Gym by 10am',
    group: 'morning',
    points: 20,
    schedule: { type: 'days', days: [MON, WED, FRI] },
    windowCountdown: true,
  },
  { key: 'deep-work', name: 'Deep-work block on content (90 min)', group: 'daytime', points: 20 },
  { key: 'squats', name: 'Daily squats', group: 'daytime', points: 10 },
  { key: 'vitamin-d', name: 'Vitamin D', group: 'daytime', points: 5 },
  { key: 'learn', name: 'Learn a new skill (15+ min)', group: 'daytime', points: 10 },
  { key: 'savour', name: 'Savour something for 20 min', group: 'daytime', points: 10 },
  { key: 'stillness', name: '10 min stillness', group: 'daytime', points: 10 },
  { key: 'fun-phone', name: 'Fun-phone window ended before bed', group: 'evening', points: 15 },
  { key: 'lights-out', name: 'Lights out by target time', group: 'evening', points: 15, lightsOut: true },
  { key: 'social', name: 'Socialised today (call, message or meet)', group: 'evening', points: 10 },
  {
    key: 'strength',
    name: 'Strength training',
    group: 'daytime',
    points: 20,
    schedule: { type: 'weekly', target: 2 },
  },
];

export function createDefaultHabits(dayKey) {
  return STARTER_HABITS.map((seed, index) => ({
    id: `d-${seed.key}`,
    name: seed.name,
    group: seed.group,
    schedule: seed.schedule ? structuredClone(seed.schedule) : { type: 'daily' },
    points: seed.points,
    order: index,
    createdDay: dayKey,
    archivedDay: null,
    windowCountdown: Boolean(seed.windowCountdown),
    lightsOut: Boolean(seed.lightsOut),
    tip: seed.key,
    projectId: null,
  }));
}

export const EXAMPLE_PROJECT = Object.freeze({
  name: 'Office reset',
  steps: [
    'Clear everything off the desk',
    'Bin, file or scan loose papers',
    'Sort cables and chargers',
    'Wipe down every surface',
    'Give daily items a home',
  ],
  maintenance: {
    name: '10-min desk tidy',
    group: 'evening',
    schedule: { type: 'daily' },
    points: 10,
  },
});
