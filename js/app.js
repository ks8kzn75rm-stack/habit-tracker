/** App entry point: boot, routing, the daily front door, tab bar and time-of-day theming. */
import { phaseFor } from './core/copy.js';
import { minutesIntoDay } from './core/dates.js';
import { store } from './data/store.js';
import { navigate } from './nav.js';
import { isIOS, isStandalone } from './platform.js';
import { initPWA } from './pwa.js';
import { BeginView } from './ui/begin.js';
import { CardEditView, CardLibraryView } from './ui/card-library.js';
import { h } from './ui/dom.js';
import { EvidenceView } from './ui/evidence.js';
import { FocusView } from './ui/focus-timer.js';
import { FoundationEditView, FoundationsView } from './ui/foundations.js';
import { HabitEditorView } from './ui/habit-editor.js';
import { dialog, toast } from './ui/overlay.js';
import { PerspectiveView } from './ui/perspective.js';
import { ProjectDetailView, ProjectNewView } from './ui/projects.js';
import { ReflectView } from './ui/reflect.js';
import { ReviewView } from './ui/review.js';
import { SettingsView } from './ui/settings.js';
import { StuckView } from './ui/stuck.js';
import { TodayView } from './ui/today.js';
import { TuneUpView } from './ui/tune-up.js';

/**
 * tab: which tab is highlighted. sub: a form or detail page.
 * flow: a calm full-screen sequence (no tab bar).
 */
const ROUTES = [
  { pattern: /^#\/today$/, tab: 'today', view: () => TodayView() },
  { pattern: /^#\/day\/(\d{4}-\d{2}-\d{2})$/, tab: 'today', view: (m) => TodayView({ dayKey: m[1] }) },
  { pattern: /^#\/begin$/, tab: 'today', flow: true, view: () => BeginView() },
  { pattern: /^#\/focus$/, tab: 'today', flow: true, view: () => FocusView() },
  { pattern: /^#\/stuck$/, tab: 'today', flow: true, view: () => StuckView() },
  { pattern: /^#\/reflect$/, tab: 'today', flow: true, view: () => ReflectView() },
  { pattern: /^#\/review(?:\/(\d{4}-\d{2}-\d{2}))?$/, tab: 'review', view: (m) => ReviewView({ weekStart: m[1] || null }) },
  { pattern: /^#\/tune-up$/, tab: 'review', flow: true, view: () => TuneUpView() },
  { pattern: /^#\/foundations$/, tab: 'foundations', view: () => FoundationsView() },
  { pattern: /^#\/foundations\/(why|letter|joys|season)$/, tab: 'foundations', sub: true, view: (m) => FoundationEditView({ field: m[1] }) },
  { pattern: /^#\/projects$/, redirect: '#/foundations' },
  { pattern: /^#\/projects\/new(\?example)?$/, tab: 'foundations', sub: true, view: (m) => ProjectNewView({ example: Boolean(m[1]) }) },
  { pattern: /^#\/projects\/([\w-]+)$/, tab: 'foundations', view: (m) => ProjectDetailView({ id: m[1] }) },
  { pattern: /^#\/evidence$/, tab: 'foundations', view: () => EvidenceView() },
  { pattern: /^#\/perspective$/, tab: 'foundations', view: () => PerspectiveView() },
  { pattern: /^#\/settings$/, tab: 'settings', view: () => SettingsView() },
  { pattern: /^#\/settings\/habit\/new$/, tab: 'settings', sub: true, view: () => HabitEditorView() },
  { pattern: /^#\/settings\/habit\/([\w-]+)$/, tab: 'settings', sub: true, view: (m) => HabitEditorView({ id: m[1] }) },
  { pattern: /^#\/cards$/, tab: 'settings', view: () => CardLibraryView() },
  { pattern: /^#\/cards\/new$/, tab: 'settings', sub: true, view: () => CardEditView() },
  { pattern: /^#\/cards\/edit\/([\w-]+)$/, tab: 'settings', sub: true, view: (m) => CardEditView({ id: m[1] }) },
];

const main = document.getElementById('view');
let current = null;
let currentRoute = null;

function route() {
  const hash = location.hash || '#/today';
  let match = null;
  const found = ROUTES.find((r) => (match = r.pattern.exec(hash)));
  if (!found || found.redirect) {
    navigate(found?.redirect || '#/today', { replace: true });
    return;
  }
  current?.destroy?.();
  currentRoute = found;
  current = found.view(match);
  main.replaceChildren(current.el);
  document.body.dataset.tab = found.tab;
  document.body.classList.toggle('is-subpage', Boolean(found.sub));
  document.body.classList.toggle('is-flow', Boolean(found.flow));
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.tab === found.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  main.classList.remove('view-enter');
  void main.offsetWidth;
  main.classList.add('view-enter');
}

// --------------------------------------------------------------- front door

/**
 * The first open of each day (after the day starts, before 6pm) shows the
 * Begin ritual before Today. Never over a running focus session, a form, an
 * open dialog or another flow, and never twice in a day.
 */
function ritualDue() {
  if (store.activeSession || !store.shouldOfferRitual(new Date())) return false;
  if (document.querySelector('.dialog-backdrop, .sheet')) return false;
  return !currentRoute || (!currentRoute.flow && !currentRoute.sub);
}

function offerRitualOnReturn() {
  if (document.visibilityState === 'visible' && ritualDue()) navigate('#/begin', { replace: true });
}

// -------------------------------------------------------------------- theme

const THEME = {
  light: { morning: '#8f2e10', daytime: '#0b4f6c', evening: '#2a1b5e' },
  dark: { morning: '#5e1f0b', daytime: '#08374a', evening: '#1a1240' },
};

function applyPhase() {
  const phase = phaseFor(minutesIntoDay(new Date()));
  document.documentElement.dataset.phase = phase;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME[dark ? 'dark' : 'light'][phase]);
}

function setUpTabs() {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const href = tab.getAttribute('href');
      if (location.hash === href) window.scrollTo({ top: 0, behavior: 'smooth' });
      else navigate(href);
    });
  }
}

/** Hide the tab bar while typing so it doesn't float above the keyboard. */
function setUpKeyboardDetection() {
  const isField = (el) => el?.matches?.('input:not([type=checkbox]):not([type=file]), textarea, select');
  document.addEventListener('focusin', (e) => {
    if (isField(e.target)) document.documentElement.classList.add('is-typing');
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isField(document.activeElement)) document.documentElement.classList.remove('is-typing');
    }, 50);
  });
}

// ---------------------------------------------------------- first-run notes

const tipList = (tips) =>
  h('ul', { class: 'welcome-list' }, tips.map(([emoji, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, emoji), h('span', {}, text))));

async function welcome() {
  if (store.meta.welcomed) return;
  const tips = [
    ['✅', 'Tap a habit to tick it off. Tap again to undo.'],
    ['▶️', 'Tap Begin to start a focus session. Stuck? There’s a button for that too.'],
    ['🌅', 'From tomorrow, each day opens with a one-minute Begin ritual. Skip it whenever you like.'],
    ['🛟', 'Streaks are forgiving: one grace day a week keeps them alive.'],
    ['🔒', 'Everything stays on this device. Back up from Settings.'],
  ];
  if (isIOS() && !isStandalone()) tips.unshift(['📲', 'Add Daybreak to your Home Screen first (Share → Add to Home Screen). It keeps its own data, separate from Safari.']);
  await dialog({
    emoji: '☀️',
    title: 'Welcome to Daybreak',
    message: tipList(tips),
    buttons: [{ label: 'Let’s go', value: true, kind: 'primary' }],
  });
  store.updateMeta({ welcomed: true });
}

/** After the update that added Begin: say what's new, once. */
async function whatsNew(notices) {
  const startsTomorrow = notices.includes('ritual-tomorrow');
  const parked = notices.filter((n) => n.startsWith('parked:')).map((n) => n.slice(7));
  const tips = [
    ['🌅', startsTomorrow
      ? 'A one-minute Begin ritual will open your days, starting tomorrow morning. Skip it whenever you like.'
      : 'A one-minute Begin ritual now opens your day. Skip it whenever you like.'],
    ['▶️', 'Begin and “I’m stuck” live on Today, with a focus timer that never counts down at you.'],
    ['🌱', 'Every focus session grows your garden: proof you show up.'],
    ['🧭', 'Foundations holds your why, a letter from your future self, your joys, this season and up to three active projects.'],
    ['🌙', 'An evening reflection sits under your daily note, with a word for tomorrow.'],
  ];
  if (parked.length) tips.push(['🅿️', `To keep three active projects, “${parked.join('”, “')}” moved to the parking lot. Swap any time in Foundations.`]);
  const choice = await dialog({
    emoji: '🌅',
    title: 'New in Daybreak: Begin',
    message: tipList(tips),
    stacked: true,
    buttons: startsTomorrow
      ? [{ label: 'Lovely', value: 'ok', kind: 'primary' }]
      : [
          { label: 'Try the ritual now', value: 'try', kind: 'primary' },
          { label: 'Later', value: 'later', kind: 'plain' },
        ],
  });
  // Seen today either way: the ritual won't pop up later on its own.
  store.markRitualOffered();
  if (choice === 'try') navigate('#/begin', { replace: true });
}

function showNotices(notices) {
  if (notices.some((n) => n === 'ritual' || n === 'ritual-tomorrow')) return whatsNew(notices);
  for (const n of notices) {
    if (n.startsWith('parked:')) toast(`Moved to the parking lot: ${n.slice(7)}`, { emoji: '🅿️' });
  }
  return null;
}

// --------------------------------------------------------------------- boot

async function boot() {
  initPWA();
  await store.init();
  applyPhase();
  setInterval(applyPhase, 60000);
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyPhase);
  setUpTabs();
  setUpKeyboardDetection();
  store.addEventListener('badges', (e) => {
    for (const badge of e.detail) toast(`Badge unlocked: ${badge.title}`, { emoji: badge.emoji });
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', offerRitualOnReturn);

  const notices = store.takeNotices();
  const hash = location.hash || '#/today';
  const atFrontDoor = !notices.length && /^#\/today$/.test(hash) && ritualDue();
  if (atFrontDoor) history.replaceState(null, '', '#/begin');
  else if (!location.hash) history.replaceState(null, '', '#/today');
  route();
  document.body.classList.add('is-ready');
  // Lets the end-to-end tests wait until every change is saved.
  window.daybreakDebug = { flush: () => store.flush() };
  window.__daybreakBooted?.();
  if (notices.length) showNotices(notices);
  else welcome();
}

boot();
