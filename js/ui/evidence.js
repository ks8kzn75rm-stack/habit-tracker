/** Proof you show up: every focus session, and everything you've shipped. */
import { addDays, startOfWeek } from '../core/dates.js';
import { formatMinutes } from '../core/focus.js';
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { emptyState, pageHeader, textInput } from './components.js';
import { formatDayMonth, formatDayShort, h, plural } from './dom.js';
import { haptic } from './fx.js';
import { garden } from './garden.js';
import { icon } from './icons.js';
import { confirm, toast } from './overlay.js';

export function evidenceSummaryText(summary) {
  const parts = [plural(summary.sessions, 'session'), `${formatMinutes(summary.minutes)} of focus`];
  if (summary.shipped) parts.push(`${summary.shipped} shipped`);
  return parts.join(' · ');
}

export function sessionTitle(session) {
  if (session.kind === 'shipped') return session.shippedNote || 'Shipped';
  return session.intent || store.project(session.projectId)?.name || 'Focus session';
}

export function EvidenceView() {
  const root = h('div', { class: 'view view-evidence' });

  function render() {
    const sessions = store.sessions;
    const summary = store.evidence();
    const weeks = new Map();
    for (const s of [...sessions].reverse()) {
      const week = startOfWeek(s.day, store.settings.weekStartsOn);
      if (!weeks.has(week)) weeks.set(week, []);
      weeks.get(week).push(s);
    }
    root.replaceChildren(
      pageHeader({
        title: 'Proof you show up',
        subtitle: 'Every session plants something. Shipped work blooms.',
        back: { href: '#/foundations', label: 'Foundations' },
      }),
      h(
        'div',
        { class: 'page-body' },
        h(
          'section',
          { class: 'card garden-card' },
          garden(sessions, { label: `Your garden: ${evidenceSummaryText(summary)}` }),
          sessions.length
            ? h('p', { class: 'garden-summary' }, evidenceSummaryText(summary))
            : h('p', { class: 'garden-summary' }, 'Your garden starts with one session. Tap Begin on Today.'),
          h('p', { class: 'garden-legend' }, icon('sprout', { size: 15 }), 'a session', h('span', { class: 'legend-sep' }, '·'), '🌸 something shipped'),
        ),
        shippedCard(),
        sessions.length
          ? [...weeks].map(([week, list]) => weekCard(week, list))
          : emptyState({ emoji: '🌱', title: 'Nothing planted yet', text: 'Each focus session you finish shows up here, so you can see yourself showing up.' }),
      ),
    );
  }

  function shippedCard() {
    let note = '';
    const input = textInput({ id: 'shipped-new', placeholder: 'What did you ship or release?', maxlength: LIMITS.shippedNote, onInput: (v) => { note = v; } });
    const add = () => {
      if (!note.trim()) {
        input.focus();
        return;
      }
      store.addShipped({ note });
      haptic();
      toast('Shipped. A new flower in the garden.', { emoji: '🌸' });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    return h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, 'I shipped something'),
      h('p', { class: 'card-text' }, 'Published, sent, released or finished? Mark it here, even if it was small.'),
      h('div', { class: 'add-row' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, icon('flag', { size: 18 }), 'Add')),
    );
  }

  function weekCard(week, list) {
    const focus = list.filter((s) => s.kind === 'focus');
    const minutes = focus.reduce((sum, s) => sum + s.minutes, 0);
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, `Week of ${formatDayMonth(week)}`), h('span', { class: 'card-aside' }, `${plural(focus.length, 'session')} · ${formatMinutes(minutes)}`)),
      h('ul', { class: 'evidence-list' }, list.map(sessionRow)),
    );
  }

  function sessionRow(s) {
    const shipped = h('button', {
      class: `chip-toggle${s.shipped ? ' is-on' : ''}`,
      type: 'button',
      'aria-pressed': String(s.shipped),
      disabled: s.kind === 'shipped',
      onclick: () => {
        store.updateSession(s.id, { shipped: !s.shipped });
        if (!s.shipped) haptic();
      },
    }, icon('flag', { size: 14 }), s.shipped ? 'Shipped' : 'Mark shipped');
    const remove = h('button', {
      class: 'icon-btn',
      type: 'button',
      'aria-label': `Remove “${sessionTitle(s)}”`,
      onclick: async () => {
        const ok = await confirm({ title: 'Remove this entry?', message: 'It will disappear from your evidence and garden.', confirmLabel: 'Remove', danger: true });
        if (ok) store.deleteSession(s.id);
      },
    }, icon('x', { size: 18 }));
    const meta = [formatDayShort(s.day)];
    if (s.kind === 'focus') meta.push(formatMinutes(s.minutes));
    if (s.rescue) meta.push('a five-minute start');
    return h(
      'li',
      { class: 'evidence-row' },
      h('span', { class: 'evidence-icon', 'aria-hidden': 'true' }, s.shipped ? '🌸' : icon('sprout', { size: 18 })),
      h('span', { class: 'evidence-text' }, h('span', { class: 'evidence-title' }, sessionTitle(s)), h('span', { class: 'evidence-meta' }, meta.join(' · '))),
      shipped,
      remove,
    );
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}

/** The current week's patch of garden, for the weekly review. */
export function weekEvidence(weekStart) {
  const sessions = store.sessionsForWeek(weekStart);
  return { sessions, summary: store.evidence(sessions), end: addDays(weekStart, 6) };
}
