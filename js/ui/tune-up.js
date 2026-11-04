/**
 * The weekly tune-up (about two minutes): look at your evidence, sort this
 * week's cards, adjust a habit or project, refresh one Foundation.
 */
import { phaseFor } from '../core/copy.js';
import { addDays, minutesIntoDay, startOfWeek } from '../core/dates.js';
import { formatMinutes } from '../core/focus.js';
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { cardActions } from './card-library.js';
import { segmented } from './components.js';
import { h, plural } from './dom.js';
import { createFlow, primaryButton, secondaryButton, stepHead } from './flow.js';
import { garden } from './garden.js';
import { icon } from './icons.js';
import { toast } from './overlay.js';
import { activateProject } from './projects.js';

export function TuneUpView() {
  const today = store.todayKey();
  const weekStart = startOfWeek(today, store.settings.weekStartsOn);
  const back = () => navigate('#/review', { replace: true });
  const flow = createFlow({ name: 'tuneup', mood: phaseFor(minutesIntoDay(new Date())), closeLabel: 'Close', onClose: back });
  const steps = ['evidence', 'cards', 'adjust', 'foundation', 'done'];
  const show = (step, content) => flow.show(content, { index: steps.indexOf(step), total: steps.length });
  // Steps that live-update while you favourite cards or park projects.
  let unlisten = null;
  const listen = (fn) => {
    unlisten?.();
    store.addEventListener('change', fn);
    unlisten = () => {
      store.removeEventListener('change', fn);
      unlisten = null;
    };
  };
  const next = (from) => {
    unlisten?.();
    RENDER[steps[steps.indexOf(from) + 1]]();
  };

  function evidence() {
    const sessions = store.sessionsForWeek(weekStart);
    const summary = store.evidence(sessions);
    const review = store.review(weekStart, today);
    const facts = [
      summary.sessions ? `${plural(summary.sessions, 'focus session')}, ${formatMinutes(summary.minutes)}` : 'No focus sessions yet, and that’s fine',
      summary.shipped ? `${summary.shipped} shipped` : null,
      `${plural(review.morningWins, 'Morning Win')}`,
      `${review.total} points`,
    ].filter(Boolean);
    show('evidence', [
      ...stepHead('Your proof this week', { kicker: 'Weekly tune-up · 2 minutes' }),
      h('div', { class: 'flow-garden' }, garden(sessions, { compact: true, label: 'This week’s garden' })),
      h('ul', { class: 'flow-facts' }, facts.map((f) => h('li', {}, f))),
      h('div', { class: 'flow-actions' }, primaryButton('Continue', () => next('evidence'))),
    ]);
  }

  function cards() {
    const ids = new Set();
    for (let i = 0; i < 7; i++) {
      const id = store.ritual(addDays(weekStart, i))?.cardId;
      if (id) ids.add(id);
    }
    const list = h('div', { class: 'flow-cards' });
    const renderList = () => {
      const seen = [...ids].map((id) => store.card(id)).filter(Boolean);
      list.replaceChildren(
        ...(seen.length
          ? seen.map((c) => h('article', { class: `lib-card is-light${c.hidden ? ' is-hidden' : ''}` }, h('p', { class: 'lib-card-text' }, c.text), h('p', { class: 'lib-card-credit' }, c.credit), cardActions(c, { compact: true })))
          : [h('p', { class: 'flow-sub' }, 'No cards this week. Your whole library is in Settings.')]),
      );
    };
    listen(renderList);
    renderList();
    show('cards', [
      ...stepHead('Cards you met this week', { sub: 'Favourite the ones that helped. Hide any that didn’t land.' }),
      list,
      h('div', { class: 'flow-actions' }, primaryButton('Continue', () => next('cards'))),
    ]);
  }

  function adjust() {
    const review = store.review(weekStart, today);
    const focus = review.focus[0];
    const box = h('div', { class: 'flow-adjust' });
    const renderBox = () => {
      const active = store.activeProjects();
      const parked = store.parkedProjects();
      box.replaceChildren(
        focus
          ? h(
              'div',
              { class: 'flow-panel' },
              h('p', { class: 'flow-panel-title' }, `Where to focus next: ${focus.habit.name}`),
              h('p', { class: 'flow-panel-text' }, focus.tip),
              h('a', { class: 'flow-link', href: `#/settings/habit/${focus.habit.id}` }, 'Make it smaller or move it'),
            )
          : h('div', { class: 'flow-panel' }, h('p', { class: 'flow-panel-text' }, 'Your habits look well balanced this week.')),
        h(
          'div',
          { class: 'flow-panel' },
          h('p', { class: 'flow-panel-title' }, `Active projects (${active.length} of 3)`),
          active.length
            ? h('ul', { class: 'flow-rows' }, active.map((p) => h('li', {}, h('span', {}, p.name), h('button', { class: 'flow-mini', type: 'button', onclick: () => { store.setProjectStatus(p.id, 'parked'); toast(`“${p.name}” parked`, { emoji: '🅿️' }); } }, 'Park'))))
            : h('p', { class: 'flow-panel-text' }, 'No active projects. Add one in Foundations.'),
          parked.length
            ? h('ul', { class: 'flow-rows' }, parked.slice(0, 4).map((p) => h('li', {}, h('span', {}, p.name), h('button', { class: 'flow-mini', type: 'button', onclick: () => activateProject(p.id) }, 'Make active'))))
            : null,
        ),
      );
    };
    listen(renderBox);
    renderBox();
    show('adjust', [
      ...stepHead('Anything to adjust?', { sub: 'Small changes keep your system working for you, not the other way round.' }),
      box,
      h('div', { class: 'flow-actions' }, primaryButton('Continue', () => next('adjust'))),
    ]);
  }

  function foundation() {
    let which = 'why';
    const editor = h('div', { class: 'flow-detail' });
    let value = '';
    const renderEditor = () => {
      const f = store.foundations;
      value = which === 'why' ? f.why : which === 'season' ? f.opportunity : '';
      const area = h('textarea', {
        class: 'flow-textarea',
        id: 'tune-foundation',
        rows: which === 'joy' ? '2' : '4',
        maxlength: String(which === 'joy' ? LIMITS.joy : LIMITS.why),
        placeholder: which === 'why' ? 'Why this work matters to you' : which === 'season' ? 'What this season is an opportunity for' : 'A new joy or energiser',
        'aria-label': 'Foundation',
      });
      area.value = value;
      area.addEventListener('input', () => {
        value = area.value;
      });
      editor.replaceChildren(area);
    };
    const save = () => {
      if (which === 'joy') {
        if (value.trim()) store.updateFoundations({ joys: [...store.foundations.joys, value] });
      } else if (value.trim()) {
        store.updateFoundations({ [which === 'season' ? 'opportunity' : 'why']: value });
      }
      next('foundation');
    };
    show('foundation', [
      ...stepHead('Update one foundation', { sub: 'Just one. Keep it fresh and true to you.' }),
      segmented({
        options: [
          { value: 'why', label: 'Your why' },
          { value: 'joy', label: 'A joy' },
          { value: 'season', label: 'This season' },
        ],
        value: which,
        label: 'Which foundation',
        onChange: (v) => {
          which = v;
          renderEditor();
        },
      }),
      editor,
      h('div', { class: 'flow-actions' }, primaryButton('Save & finish', save), secondaryButton('Skip', () => next('foundation'))),
    ]);
    renderEditor();
  }

  function done() {
    store.markTuneUp(weekStart);
    show('done', [
      h('div', { class: 'focus-glow', 'aria-hidden': 'true' }, icon('sparkle', { size: 40 })),
      ...stepHead('Tuned up.', { sub: 'Your system is a little more yours. See you next week.' }),
      h('div', { class: 'flow-actions' }, primaryButton('Back to your review', back)),
    ]);
  }

  const RENDER = { evidence, cards, adjust, foundation, done };
  evidence();
  return { el: flow.el, destroy: () => unlisten?.() };
}
