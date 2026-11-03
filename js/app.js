/** App entry point: boot, routing, tab bar and time-of-day theming. */
import { phaseFor } from './core/copy.js';
import { minutesIntoDay } from './core/dates.js';
import { store } from './data/store.js';
import { navigate } from './nav.js';
import { isIOS, isStandalone } from './platform.js';
import { initPWA } from './pwa.js';
import { h } from './ui/dom.js';
import { HabitEditorView } from './ui/habit-editor.js';
import { dialog, toast } from './ui/overlay.js';
import { ProjectDetailView, ProjectNewView, ProjectsView } from './ui/projects.js';
import { ReviewView } from './ui/review.js';
import { SettingsView } from './ui/settings.js';
import { TodayView } from './ui/today.js';

const ROUTES = [
  { pattern: /^#\/today$/, tab: 'today', view: () => TodayView() },
  { pattern: /^#\/day\/(\d{4}-\d{2}-\d{2})$/, tab: 'today', view: (m) => TodayView({ dayKey: m[1] }) },
  { pattern: /^#\/review(?:\/(\d{4}-\d{2}-\d{2}))?$/, tab: 'review', view: (m) => ReviewView({ weekStart: m[1] || null }) },
  { pattern: /^#\/projects$/, tab: 'projects', view: () => ProjectsView() },
  { pattern: /^#\/projects\/new(\?example)?$/, tab: 'projects', sub: true, view: (m) => ProjectNewView({ example: Boolean(m[1]) }) },
  { pattern: /^#\/projects\/([\w-]+)$/, tab: 'projects', view: (m) => ProjectDetailView({ id: m[1] }) },
  { pattern: /^#\/settings$/, tab: 'settings', view: () => SettingsView() },
  { pattern: /^#\/settings\/habit\/new$/, tab: 'settings', sub: true, view: () => HabitEditorView() },
  { pattern: /^#\/settings\/habit\/([\w-]+)$/, tab: 'settings', sub: true, view: (m) => HabitEditorView({ id: m[1] }) },
];

const main = document.getElementById('view');
let current = null;

function route() {
  const hash = location.hash || '#/today';
  let match = null;
  const found = ROUTES.find((r) => (match = r.pattern.exec(hash)));
  if (!found) {
    navigate('#/today', { replace: true });
    return;
  }
  current?.destroy?.();
  current = found.view(match);
  main.replaceChildren(current.el);
  document.body.dataset.tab = found.tab;
  document.body.classList.toggle('is-subpage', Boolean(found.sub));
  for (const tab of document.querySelectorAll('.tab')) {
    if (tab.dataset.tab === found.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  window.scrollTo(0, 0);
  main.classList.remove('view-enter');
  void main.offsetWidth;
  main.classList.add('view-enter');
}

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

async function welcome() {
  if (store.meta.welcomed) return;
  const tips = [
    ['✅', 'Tap a habit to tick it off. Tap again to undo.'],
    ['📅', 'Forgot to log? Use the day strip to edit the past week.'],
    ['🛟', 'Streaks are forgiving: one grace day a week keeps them alive.'],
    ['🔒', 'Everything stays on this device. Back up from Settings.'],
  ];
  if (isIOS() && !isStandalone()) tips.unshift(['📲', 'Add Daybreak to your Home Screen first (Share → Add to Home Screen). It keeps its own data, separate from Safari.']);
  await dialog({
    emoji: '☀️',
    title: 'Welcome to Daybreak',
    message: h('ul', { class: 'welcome-list' }, tips.map(([emoji, text]) => h('li', {}, h('span', { 'aria-hidden': 'true' }, emoji), h('span', {}, text)))),
    buttons: [{ label: 'Let’s go', value: true, kind: 'primary' }],
  });
  store.updateMeta({ welcomed: true });
}

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
  if (!location.hash) history.replaceState(null, '', '#/today');
  route();
  document.body.classList.add('is-ready');
  // Lets the end-to-end tests wait until every change is saved.
  window.daybreakDebug = { flush: () => store.flush() };
  window.__daybreakBooted?.();
  welcome();
}

boot();
