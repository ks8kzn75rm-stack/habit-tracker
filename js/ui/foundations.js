/**
 * Foundations: what matters to you (your why, a letter from your future self,
 * your joys, this season's opportunity), the few projects you're working on,
 * the parking lot, and proof that you show up.
 */
import { LIMITS } from '../core/model.js';
import { seasonPhrase, seasonWeeks } from '../core/perspective.js';
import { ACTIVE_LIMIT } from '../core/wip.js';
import { store } from '../data/store.js';
import { emptyState, pageHeader, textInput } from './components.js';
import { formatDayShort, h, plural } from './dom.js';
import { evidenceSummaryText } from './evidence.js';
import { haptic } from './fx.js';
import { garden } from './garden.js';
import { icon } from './icons.js';
import { toast } from './overlay.js';
import { activateProject, projectCard } from './projects.js';

export const FOUNDATION_FIELDS = {
  why: {
    title: 'Your why',
    icon: 'compass',
    prompt: 'Why does this work matter to you? Write it the way you’d say it to a good friend.',
    placeholder: 'I do this because…',
    empty: 'What makes this work matter to you?',
    max: LIMITS.why,
    rows: 6,
  },
  letter: {
    title: 'Letter from your future self',
    icon: 'mail',
    prompt: 'Imagine yourself a few years from now, glad you kept going. What would that future you want to say to you today?',
    placeholder: 'Dear me,',
    empty: 'A few kind words from the person you’re becoming.',
    max: LIMITS.letter,
    rows: 14,
  },
  joys: {
    title: 'Joys & energisers',
    icon: 'sun',
    prompt: 'Small things that light you up and give you energy. They’ll turn up in your morning ritual as reminders.',
    empty: 'Small things that light you up.',
  },
  season: {
    title: 'This season',
    icon: 'mountain',
    prompt: 'What is this season of your life an opportunity for?',
    placeholder: 'This season is a chance to…',
    empty: 'What this season is an opportunity for.',
    max: LIMITS.opportunity,
    rows: 5,
  },
};

const preview = (text, max = 110) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

export function FoundationsView() {
  const root = h('div', { class: 'view view-foundations' });

  function tile(field) {
    const def = FOUNDATION_FIELDS[field];
    const f = store.foundations;
    const value = field === 'joys' ? f.joys.join(' · ') : field === 'season' ? f.opportunity : f[field];
    return h(
      'a',
      { class: `foundation-tile${value ? '' : ' is-empty'}`, href: `#/foundations/${field}` },
      h('span', { class: 'foundation-icon' }, icon(def.icon, { size: 20 })),
      h('span', { class: 'foundation-title' }, def.title),
      h('span', { class: 'foundation-preview' }, value ? preview(value) : def.empty),
    );
  }

  function render() {
    const active = store.activeProjects();
    const parked = store.parkedProjects();
    const finished = store.finishedProjects();
    const s = store.settings;
    const recent = store.sessions.slice(-36);
    const season = s.seasonEnabled && s.seasonEnd ? seasonPhrase(seasonWeeks(store.todayKey(), s.seasonEnd)) : '';

    root.replaceChildren(
      pageHeader({ title: 'Foundations', subtitle: 'What matters to you, and proof that you show up.' }),
      h(
        'div',
        { class: 'page-body' },
        h('div', { class: 'foundation-grid' }, ['why', 'letter', 'joys', 'season'].map(tile)),
        season || s.lifeWeeksEnabled
          ? h('a', { class: 'card perspective-link', href: '#/perspective' }, icon(season ? 'mountain' : 'grid', { size: 20 }), h('span', {}, season ? `${s.seasonLabel || 'This season'} · ${season}` : 'Your life in weeks'), icon('chevronRight', { size: 18 }))
          : null,

        h(
          'section',
          { class: 'card', id: 'active-projects' },
          h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Active projects'), h('span', { class: 'card-aside' }, `${active.length} of ${ACTIVE_LIMIT}`)),
          active.length
            ? h('div', { class: 'project-list' }, active.map(projectCard))
            : emptyState({
                emoji: '🎯',
                title: 'Choose up to three',
                text: 'The few things you’re actively working on. Each morning you’ll pick one of them as your main thing.',
                actions: [
                  h('a', { class: 'btn btn-primary', href: '#/projects/new' }, 'New project'),
                  h('a', { class: 'btn', href: '#/projects/new?example' }, 'Try an example'),
                ],
              }),
          active.length >= ACTIVE_LIMIT
            ? h('p', { class: 'card-note' }, icon('info', { size: 15 }), 'Three is plenty. Fewer things in progress means each one gets your real attention. New ideas go to the parking lot.')
            : null,
          active.length ? h('a', { class: 'btn btn-block', href: '#/projects/new' }, icon('plus', { size: 18 }), active.length >= ACTIVE_LIMIT ? 'New idea for the parking lot' : 'New project') : null,
        ),

        parkingLot(parked),

        h(
          'section',
          { class: 'card garden-card' },
          h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Proof you show up'), h('a', { class: 'text-btn', href: '#/evidence' }, 'See all')),
          garden(recent, { compact: recent.length <= 12, label: 'Your recent sessions as a garden' }),
          h('p', { class: 'garden-summary' }, store.sessions.length ? evidenceSummaryText(store.evidence()) : 'Your garden starts with one session.'),
        ),

        finished.length
          ? h(
              'section',
              { class: 'card' },
              h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Finished'), h('span', { class: 'card-aside' }, plural(finished.length, 'project'))),
              h(
                'ul',
                { class: 'finished-list' },
                finished.map((p) => {
                  const habit = store.habit(p.habitId);
                  return h(
                    'li',
                    {},
                    h(
                      'a',
                      { class: 'finished-row', href: `#/projects/${p.id}` },
                      h('span', { class: 'finished-flag', 'aria-hidden': 'true' }, '🏁'),
                      h(
                        'span',
                        { class: 'finished-text' },
                        h('span', { class: 'finished-name' }, p.name),
                        h('span', { class: 'finished-meta' }, `Finished ${formatDayShort(p.completedDay)}${habit && !habit.archivedDay ? ` · keeping it up with “${habit.name}”` : ''}`),
                      ),
                      icon('chevronRight', { size: 18 }),
                    ),
                  );
                }),
              ),
            )
          : null,
      ),
    );
  }

  function parkingLot(parked) {
    let idea = '';
    const input = textInput({ id: 'parking-idea', placeholder: 'Park an idea for later', maxlength: LIMITS.project, onInput: (v) => { idea = v; } });
    const add = () => {
      if (!idea.trim()) {
        input.focus();
        return;
      }
      store.addProject({ name: idea, status: 'parked' });
      haptic();
      toast('Parked safely. It’ll be here when there’s room.', { emoji: '🅿️' });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    return h(
      'section',
      { class: 'card', id: 'parking-lot' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Parking lot'), h('span', { class: 'card-aside' }, parked.length ? plural(parked.length, 'idea') : '')),
      h('p', { class: 'card-text' }, 'Ideas wait here, guilt-free, until there’s room for them.'),
      parked.length
        ? h(
            'ul',
            { class: 'manage-list' },
            parked.map((p) =>
              h(
                'li',
                { class: 'manage-row' },
                h('a', { class: 'manage-main', href: `#/projects/${p.id}` }, h('span', { class: 'manage-name' }, p.name), p.steps.length ? h('span', { class: 'manage-meta' }, plural(p.steps.length, 'step')) : null),
                h('button', { class: 'btn btn-small', type: 'button', onclick: () => activateProject(p.id) }, 'Make active'),
              ),
            ),
          )
        : null,
      h('div', { class: 'add-row' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, icon('plus', { size: 18 }), 'Park')),
    );
  }

  const onChange = () => {
    const focused = document.activeElement?.id;
    render();
    if (focused === 'parking-idea') root.querySelector('#parking-idea')?.focus();
  };
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}

// ---------------------------------------------------------------- editors

export function FoundationEditView({ field }) {
  const def = FOUNDATION_FIELDS[field];
  const root = h('div', { class: 'view view-foundation-edit' });
  const back = { href: '#/foundations', label: 'Foundations' };
  if (!def) {
    root.append(pageHeader({ title: 'Foundations', back }));
    return { el: root };
  }
  if (field === 'joys') return joysEditor(root, def, back);

  const key = field === 'season' ? 'opportunity' : field;
  const saved = h('span', { class: 'note-saved', 'aria-live': 'polite' });
  const area = h('textarea', {
    class: 'input textarea foundation-text',
    id: `foundation-${field}`,
    rows: String(def.rows),
    maxlength: String(def.max),
    placeholder: def.placeholder,
  });
  area.value = store.foundations[key];
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = null;
    if (store.foundations[key] === area.value.trim()) return;
    store.updateFoundations({ [key]: area.value });
    saved.textContent = 'Saved';
    saved.classList.remove('show');
    void saved.offsetWidth;
    saved.classList.add('show');
  };
  area.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(save, 700);
  });
  area.addEventListener('change', save);

  root.append(
    pageHeader({ title: def.title, back }),
    h(
      'div',
      { class: 'page-body' },
      h(
        'section',
        { class: 'card form-card' },
        h('label', { class: 'field-label', for: `foundation-${field}` }, def.prompt),
        h('div', { class: 'note-field' }, area, saved),
        h('p', { class: 'field-hint' }, 'Saved as you type. Only on this device.'),
      ),
      field === 'season'
        ? h('p', { class: 'center-note' }, 'To see how many weeks this season has to make count, turn on “This season” in Settings → Perspective.')
        : null,
    ),
  );
  return { el: root, destroy: save };
}

function joysEditor(root, def, back) {
  let draft = '';
  function render() {
    const joys = store.foundations.joys;
    const input = textInput({ id: 'joy-new', placeholder: 'e.g. A walk in the morning light', maxlength: LIMITS.joy, onInput: (v) => { draft = v; } });
    const add = () => {
      if (!draft.trim()) return;
      store.updateFoundations({ joys: [...store.foundations.joys, draft] });
      draft = '';
      requestAnimationFrame(() => root.querySelector('#joy-new')?.focus());
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        add();
      }
    });
    root.replaceChildren(
      pageHeader({ title: def.title, back }),
      h(
        'div',
        { class: 'page-body' },
        h(
          'section',
          { class: 'card form-card' },
          h('p', { class: 'field-label' }, def.prompt),
          joys.length
            ? h(
                'ul',
                { class: 'joy-list' },
                joys.map((joy, i) =>
                  h(
                    'li',
                    { class: 'joy-item' },
                    h('span', {}, joy),
                    h('button', {
                      class: 'icon-btn',
                      type: 'button',
                      'aria-label': `Remove “${joy}”`,
                      onclick: () => store.updateFoundations({ joys: store.foundations.joys.filter((_, j) => j !== i) }),
                    }, icon('x', { size: 18 })),
                  ),
                ),
              )
            : null,
          joys.length < LIMITS.joys
            ? h('div', { class: 'add-row' }, input, h('button', { class: 'btn', type: 'button', onclick: add }, icon('plus', { size: 18 }), 'Add'))
            : h('p', { class: 'field-hint' }, 'That’s a lovely long list.'),
        ),
      ),
    );
  }
  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}
