/**
 * Focus sessions. The ring fills as time passes: it shows what you've done,
 * not what's left, so it reads as growth rather than a countdown. Sessions
 * survive the app being closed (the start time is stored, not a ticking
 * counter), and every one becomes evidence.
 */
import { phaseFor } from '../core/copy.js';
import { minutesIntoDay } from '../core/dates.js';
import { formatMinutes, sessionProgress } from '../core/focus.js';
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { celebrateTick } from './celebrations.js';
import { h, ring, setRing } from './dom.js';
import { choiceList, createFlow, durationPicker, flowInput, primaryButton, secondaryButton, stepHead } from './flow.js';
import { haptic } from './fx.js';
import { icon } from './icons.js';
import { toast } from './overlay.js';

const nextStepOf = (project) => project?.steps.find((s) => !s.done)?.text || '';

export function FocusView() {
  const flow = createFlow({
    name: 'focus',
    mood: phaseFor(minutesIntoDay(new Date())),
    closeLabel: 'Close',
    onClose: () => navigate('#/today', { replace: true }),
  });
  let ticker = null;
  let wakeLock = null;
  let finished = null;
  let finishing = false;
  let shownState = '';

  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {
      // Screen Wake Lock isn't available everywhere; the session works without it.
    }
  }

  function stateNow() {
    if (finished) return 'finished';
    const active = store.activeSession;
    if (!active) return 'setup';
    return sessionProgress(active, Date.now()).reachedPlan && !active.extended ? 'complete' : 'running';
  }

  function render() {
    const state = stateNow();
    if (state === shownState) return;
    shownState = state;
    clearInterval(ticker);
    ticker = null;
    ({ setup, running, complete, finished: done })[state]();
  }

  // ------------------------------------------------------------- setup

  function setup() {
    keepAwake(false);
    const today = store.todayKey();
    const ritual = store.ritual(today);
    const projects = store.activeProjects();
    let minutes = ritual?.plan?.minutes || store.settings.focusMinutes;
    let selected = ritual?.mainThing?.projectId || (ritual?.mainThing?.text ? 'other' : projects[0]?.id || 'other');
    let intent = ritual?.mainThing?.text || nextStepOf(projects.find((p) => p.id === selected));
    const detail = h('div', { class: 'flow-detail' });

    function renderDetail() {
      const project = projects.find((p) => p.id === selected);
      detail.replaceChildren(
        h('label', { class: 'flow-label', for: 'focus-intent' }, project ? 'What exactly? (optional)' : 'What are you working on?'),
        flowInput({ id: 'focus-intent', value: intent, placeholder: project ? 'The next small step' : 'One clear thing', maxlength: LIMITS.intent, onInput: (v) => { intent = v; } }),
      );
    }

    const list = projects.length
      ? choiceList(
          [...projects.map((p) => ({ value: p.id, label: p.name })), { value: 'other', label: 'Something else' }],
          (value) => {
            selected = value;
            intent = value === 'other' ? '' : nextStepOf(projects.find((p) => p.id === value));
            list.querySelectorAll('.flow-choice').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
            renderDetail();
          },
          { selected, label: 'What you’re working on' },
        )
      : null;

    flow.show([
      ...stepHead('Begin', { sub: 'Choose what to work on and for how long. Starting is the win.' }),
      list,
      detail,
      durationPicker({ value: minutes, onChange: (m) => { minutes = m; } }),
      h('div', { class: 'flow-actions' }, primaryButton('Begin', () => {
        const project = projects.find((p) => p.id === selected) || null;
        store.startSession({ minutes, projectId: project?.id || null, intent: intent.trim() || project?.name || '' });
        haptic();
        render();
      }, { big: true, iconName: 'play' })),
    ]);
    renderDetail();
  }

  // ----------------------------------------------------------- running

  function running() {
    keepAwake(true);
    const active = store.activeSession;
    const progressRing = ring(240, 10, 0, 'focus-ring');
    const elapsed = h('span', { class: 'focus-elapsed' }, '0');
    const of = h('span', { class: 'focus-of' }, `of ${active.plannedMinutes} min`);
    const update = () => {
      const now = store.activeSession;
      if (!now) return;
      const p = sessionProgress(now, Date.now());
      setRing(progressRing, now.extended ? 1 : p.ratio);
      elapsed.textContent = String(p.elapsedMinutes);
      of.textContent = now.extended ? 'minutes, and counting' : `of ${now.plannedMinutes} min`;
      if (stateNow() !== 'running') render();
    };
    flow.show([
      h('p', { class: 'flow-kicker' }, active.rescue ? 'Five minutes, starting now' : 'In focus'),
      h('h1', { class: 'flow-title focus-intent', tabindex: '-1' }, active.intent || 'Your work'),
      h('div', { class: 'focus-dial' }, progressRing, h('div', { class: 'focus-center' }, elapsed, of)),
      h('p', { class: 'flow-sub' }, 'Stay with it. If your mind wanders, come back gently.'),
      h(
        'div',
        { class: 'flow-actions' },
        primaryButton('Finish', finish, { iconName: 'stop' }),
        secondaryButton('I’m stuck', () => navigate('#/stuck')),
      ),
    ]);
    update();
    ticker = setInterval(update, 1000);
  }

  // ---------------------------------------------------------- complete

  function complete() {
    keepAwake(false);
    const active = store.activeSession;
    haptic();
    flow.show([
      h('div', { class: 'focus-glow', 'aria-hidden': 'true' }, icon('sun', { size: 40 })),
      ...stepHead(`${formatMinutes(active.plannedMinutes)}. That’s showing up.`, { sub: 'Log it now, or keep going if you’re in the flow.' }),
      h(
        'div',
        { class: 'flow-actions' },
        primaryButton('Log it', finish, { iconName: 'check' }),
        secondaryButton('Keep going', () => {
          store.extendSession();
          render();
        }),
      ),
    ]);
  }

  // ---------------------------------------------------------- finished

  function finish() {
    // finishSession() fires 'change' before we know the result: don't flash the setup screen.
    finishing = true;
    const result = store.finishSession(Date.now());
    finishing = false;
    keepAwake(false);
    if (!result?.session) {
      toast('Under a minute, so nothing to log. Begin again whenever you like.', { emoji: '🌱' });
      navigate('#/today', { replace: true });
      return;
    }
    finished = result;
    for (const r of result.results) celebrateTick(r, { quiet: true });
    render();
  }

  function done() {
    const { session, ticked } = finished;
    let shippedNote = '';
    const shipBox = h('div', { class: 'flow-detail', hidden: true });
    const shipButton = secondaryButton('Yes, I shipped something', () => {
      shipButton.hidden = true;
      shipBox.hidden = false;
      shipBox.querySelector('input')?.focus();
    });
    shipBox.append(
      h('label', { class: 'flow-label', for: 'shipped-note' }, 'What did you ship or release?'),
      flowInput({ id: 'shipped-note', placeholder: 'e.g. Published the first draft', maxlength: LIMITS.shippedNote, onInput: (v) => { shippedNote = v; } }),
    );
    const close = () => {
      if (!shipBox.hidden) {
        store.updateSession(session.id, { shipped: true, shippedNote });
        toast('Shipped. That’s going in the garden.', { emoji: '🌸' });
      }
      navigate('#/today', { replace: true });
    };
    flow.show([
      h('div', { class: 'focus-glow', 'aria-hidden': 'true' }, icon('sprout', { size: 40 })),
      ...stepHead(`${formatMinutes(session.minutes)} of focus`, { kicker: 'Logged', sub: 'Proof you show up. It’s in your evidence now.' }),
      ticked.length ? h('p', { class: 'flow-note' }, icon('check', { size: 16 }), `Ticked for you: ${ticked.map((x) => x.name).join(', ')}`) : null,
      h('div', { class: 'flow-ship' }, h('p', { class: 'flow-sub' }, 'Did you ship or release something?'), shipButton, shipBox),
      h('div', { class: 'flow-actions' }, primaryButton('Done', close), h('a', { class: 'flow-link', href: '#/evidence' }, 'See your evidence')),
    ]);
  }

  const onChange = () => {
    // Another screen (e.g. "I'm stuck") may have started or ended a session.
    if (!finished && !finishing) render();
  };
  const onVisible = () => {
    // Back from the background: the session may have reached its planned end.
    if (document.visibilityState !== 'visible' || shownState !== 'running') return;
    keepAwake(true); // the wake lock is released whenever the app is hidden
    render();
  };
  store.addEventListener('change', onChange);
  document.addEventListener('visibilitychange', onVisible);
  render();

  return {
    el: flow.el,
    destroy() {
      clearInterval(ticker);
      keepAwake(false);
      store.removeEventListener('change', onChange);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
