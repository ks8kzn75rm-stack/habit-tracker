/** Projects: one-off checklists that can leave a maintenance habit behind. */
import { EXAMPLE_PROJECT } from '../core/defaults.js';
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { describeSchedule, emptyState, field, habitScheduleFields, pageHeader, switchRow, textInput } from './components.js';
import { formatDayShort, h, plural } from './dom.js';
import { haptic } from './fx.js';
import { SECTION_TITLES, icon } from './icons.js';
import { celebrate, confirm, toast } from './overlay.js';

const progressOf = (project) => {
  const done = project.steps.filter((s) => s.done).length;
  return { done, total: project.steps.length, ratio: project.steps.length ? done / project.steps.length : 0 };
};

const maintenanceText = (m) =>
  `${m.name} · ${describeSchedule(m.schedule, store.settings.weekStartsOn)}${m.schedule.type === 'weekly' ? '' : ` · ${SECTION_TITLES[m.group]}`}`;

// --------------------------------------------------------------------- list

export function ProjectsView() {
  const root = h('div', { class: 'view view-projects' });

  function render() {
    const active = store.activeProjects();
    const finished = store.finishedProjects();
    const newButton = h('a', { class: 'head-btn', href: '#/projects/new' }, icon('plus', { size: 18 }), 'New');
    root.replaceChildren(
      pageHeader({ title: 'Projects', subtitle: 'One-off resets, with a small habit to keep them that way.', actions: newButton }),
      h(
        'div',
        { class: 'page-body' },
        active.length
          ? h('div', { class: 'project-list' }, active.map(projectCard))
          : emptyState({
              emoji: '🧹',
              title: 'Start a project',
              text: 'Break a one-off task into small steps. When it’s done, Daybreak can add a quick maintenance habit so it stays done.',
              actions: [
                h('a', { class: 'btn btn-primary', href: '#/projects/new' }, 'New project'),
                h('a', { class: 'btn', href: '#/projects/new?example' }, 'Try an example'),
              ],
            }),
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

  function projectCard(project) {
    const p = progressOf(project);
    return h(
      'a',
      { class: 'card project-card', href: `#/projects/${project.id}` },
      h('div', { class: 'project-top' }, h('h2', { class: 'project-name' }, project.name), icon('chevronRight', { size: 18 })),
      h('span', { class: 'progress-track' }, h('span', { class: 'progress-bar', style: { width: `${Math.round(p.ratio * 100)}%` } })),
      h(
        'p',
        { class: 'project-meta' },
        p.total ? `${p.done} of ${plural(p.total, 'step')} done` : 'No steps yet',
        project.maintenance ? h('span', { class: 'project-then' }, ` · then “${project.maintenance.name}”`) : null,
      ),
    );
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}

// ------------------------------------------------------------- new project

export function ProjectNewView({ example = false } = {}) {
  const draft = {
    name: example ? EXAMPLE_PROJECT.name : '',
    stepsText: example ? EXAMPLE_PROJECT.steps.join('\n') : '',
    withHabit: example,
    habit: structuredClone(example ? EXAMPLE_PROJECT.maintenance : { name: '', group: 'evening', schedule: { type: 'daily' }, points: 10 }),
  };
  const root = h('div', { class: 'view view-project-new' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const nameInput = textInput({ id: 'project-name', value: draft.name, placeholder: 'e.g. Office reset', maxlength: LIMITS.project, onInput: (v) => { draft.name = v; } });
  const steps = h('textarea', {
    class: 'input textarea',
    id: 'project-steps',
    rows: '6',
    placeholder: 'One step per line',
    oninput: (e) => {
      draft.stepsText = e.target.value;
    },
  });
  steps.value = draft.stepsText;

  const habitFields = h('div', { class: 'field-stack', hidden: !draft.withHabit });
  habitFields.append(
    field('Habit name', textInput({ id: 'maintenance-name', value: draft.habit.name, placeholder: 'e.g. 10-min desk tidy', maxlength: LIMITS.name, onInput: (v) => { draft.habit.name = v; } }), { id: 'maintenance-name' }),
    habitScheduleFields(draft.habit, { weekStartsOn: store.settings.weekStartsOn }),
  );

  const create = () => {
    const stepList = draft.stepsText.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, LIMITS.steps);
    if (!draft.name.trim()) {
      error.textContent = 'Give your project a name.';
      nameInput.focus();
      return;
    }
    if (draft.withHabit && !draft.habit.name.trim()) {
      error.textContent = 'Name the maintenance habit, or switch it off.';
      return;
    }
    const project = store.addProject({ name: draft.name, steps: stepList, maintenance: draft.withHabit ? draft.habit : null });
    toast('Project created', { emoji: '🚀' });
    navigate(`#/projects/${project.id}`, { replace: true });
  };

  root.append(
    pageHeader({ title: 'New project', back: { href: '#/projects', label: 'Projects' } }),
    h(
      'div',
      { class: 'page-body' },
      h(
        'section',
        { class: 'card form-card' },
        field('Project name', nameInput, { id: 'project-name' }),
        field('Steps', steps, { id: 'project-steps', hint: 'Small, concrete steps are easiest to start. You can add more later.' }),
      ),
      h(
        'section',
        { class: 'card form-card' },
        switchRow({
          label: 'Keep it up with a habit',
          description: 'When you finish, add a small recurring habit to maintain it.',
          checked: draft.withHabit,
          onChange: (on) => {
            draft.withHabit = on;
            habitFields.hidden = !on;
          },
        }),
        habitFields,
      ),
      error,
      h('div', { class: 'form-actions' }, h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: create }, 'Create project')),
      example ? null : h('p', { class: 'center-note' }, h('a', { class: 'text-link', href: '#/projects/new?example', onclick: (e) => { e.preventDefault(); navigate('#/projects/new?example', { replace: true }); } }, 'Fill in an example instead')),
    ),
  );
  return { el: root };
}

// ------------------------------------------------------------ project page

export function ProjectDetailView({ id }) {
  const root = h('div', { class: 'view view-project' });
  let editingHabit = false;

  function render() {
    const project = store.project(id);
    if (!project) {
      root.replaceChildren(
        pageHeader({ title: 'Project', back: { href: '#/projects', label: 'Projects' } }),
        h('div', { class: 'page-body' }, emptyState({ emoji: '🔍', title: 'Project not found', text: 'It may have been deleted.', actions: [h('a', { class: 'btn', href: '#/projects' }, 'All projects')] })),
      );
      return;
    }
    const p = progressOf(project);
    const finished = Boolean(project.completedDay);
    const linked = store.habit(project.habitId);

    const stepList = h(
      'ul',
      { class: 'step-list' },
      project.steps.map((step) =>
        h(
          'li',
          { class: `step${step.done ? ' is-done' : ''}` },
          h(
            'button',
            {
              class: 'step-toggle',
              type: 'button',
              'aria-pressed': String(step.done),
              disabled: finished,
              onclick: () => {
                const result = store.toggleStep(id, step.id);
                if (result?.done) haptic();
                if (result?.allDone) toast('All steps done! Tap “Finish project” to celebrate.', { emoji: '🎯' });
              },
            },
            h('span', { class: 'check', 'aria-hidden': 'true' }, icon('check', { size: 16 })),
            h('span', { class: 'step-text' }, step.text),
          ),
          finished
            ? null
            : h('button', { class: 'icon-btn step-remove', type: 'button', 'aria-label': `Remove step: ${step.text}`, onclick: () => store.removeStep(id, step.id) }, icon('x', { size: 18 })),
        ),
      ),
    );

    const addInput = textInput({ id: 'new-step', placeholder: 'Add a step', maxlength: LIMITS.step, enterkeyhint: 'enter' });
    const addStep = () => {
      if (!addInput.value.trim()) return;
      store.addStep(id, addInput.value);
      requestAnimationFrame(() => root.querySelector('#new-step')?.focus());
    };
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addStep();
      }
    });

    const nameInput = textInput({ id: 'project-title', value: project.name, maxlength: LIMITS.project });
    nameInput.addEventListener('change', () => {
      if (nameInput.value.trim()) store.updateProject(id, { name: nameInput.value });
      else nameInput.value = project.name;
    });

    root.replaceChildren(
      pageHeader({
        title: project.name,
        subtitle: finished ? `Finished ${formatDayShort(project.completedDay)}` : p.total ? `${p.done} of ${plural(p.total, 'step')} done` : 'Add the first step',
        back: { href: '#/projects', label: 'Projects' },
      }),
      h(
        'div',
        { class: 'page-body' },
        finished
          ? h('section', { class: 'notice notice-success' }, h('span', { class: 'notice-icon', 'aria-hidden': 'true' }, '🏁'), h('div', { class: 'notice-body' }, h('h3', {}, 'Project finished'), h('p', {}, linked ? `Keep it up with “${linked.name}”${linked.archivedDay ? ' (removed)' : ''}.` : 'Nicely done.')))
          : null,
        h(
          'section',
          { class: 'card' },
          h('span', { class: 'progress-track' }, h('span', { class: 'progress-bar', style: { width: `${Math.round(p.ratio * 100)}%` } })),
          project.steps.length ? stepList : h('p', { class: 'card-text' }, 'No steps yet. What’s the smallest first move?'),
          finished ? null : h('div', { class: 'add-row' }, addInput, h('button', { class: 'btn', type: 'button', onclick: addStep }, icon('plus', { size: 18 }), 'Add')),
        ),
        finished ? null : maintenanceCard(project),
        finished ? null : h('section', { class: 'card form-card' }, field('Project name', nameInput, { id: 'project-title' })),
        h(
          'div',
          { class: 'form-actions' },
          finished
            ? h('button', { class: 'btn btn-block', type: 'button', onclick: () => store.reopenProject(id) }, icon('undo', { size: 18 }), 'Reopen project')
            : h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => finish(project) }, '🏁 Finish project'),
          h('button', { class: 'btn btn-danger-text btn-block', type: 'button', onclick: () => remove(project) }, icon('trash', { size: 18 }), 'Delete project'),
        ),
      ),
    );
  }

  function maintenanceCard(project) {
    const m = project.maintenance;
    if (editingHabit) {
      const draft = structuredClone(m || { name: '', group: 'evening', schedule: { type: 'daily' }, points: 10 });
      const error = h('p', { class: 'form-error', role: 'alert' });
      return h(
        'section',
        { class: 'card form-card' },
        h('h2', { class: 'card-title' }, 'Maintenance habit'),
        field('Habit name', textInput({ id: 'maintenance-name', value: draft.name, placeholder: 'e.g. 10-min desk tidy', maxlength: LIMITS.name, onInput: (v) => { draft.name = v; } }), { id: 'maintenance-name' }),
        habitScheduleFields(draft, { weekStartsOn: store.settings.weekStartsOn }),
        error,
        h(
          'div',
          { class: 'button-row' },
          h('button', { class: 'btn', type: 'button', onclick: () => { editingHabit = false; render(); } }, 'Cancel'),
          m ? h('button', { class: 'btn btn-danger-text', type: 'button', onclick: () => { editingHabit = false; store.updateProject(project.id, { maintenance: null }); } }, 'Remove') : null,
          h('button', {
            class: 'btn btn-primary',
            type: 'button',
            onclick: () => {
              if (!draft.name.trim()) {
                error.textContent = 'Give the habit a name.';
                return;
              }
              editingHabit = false;
              store.updateProject(project.id, { maintenance: draft });
            },
          }, 'Save'),
        ),
      );
    }
    return h(
      'section',
      { class: 'card maintenance-card' },
      h('span', { class: 'maintenance-icon' }, icon('refresh', { size: 20 })),
      h(
        'div',
        { class: 'maintenance-text' },
        h('h2', { class: 'card-title' }, m ? 'Then keep it up' : 'Keep it up afterwards?'),
        h('p', { class: 'card-text' }, m ? `When you finish, “${maintenanceText(m)}” is added to your habits.` : 'Add a small recurring habit that starts when this project is finished.'),
      ),
      h('button', { class: 'btn btn-small', type: 'button', onclick: () => { editingHabit = true; render(); } }, m ? 'Edit' : 'Add'),
    );
  }

  async function finish(project) {
    const p = progressOf(project);
    if (p.done < p.total) {
      const ok = await confirm({
        title: 'Finish now?',
        message: `${plural(p.total - p.done, 'step')} still open. Finishing is fine; done is better than perfect.`,
        confirmLabel: 'Finish',
      });
      if (!ok) return;
    }
    const result = store.completeProject(project.id);
    if (!result) return;
    haptic();
    celebrate({
      emoji: '🏁',
      title: 'Project finished!',
      message: result.habit ? `“${result.habit.name}” is now on your Today screen to keep it that way.` : 'One less thing on your mind.',
      detail: '+50 bonus points',
    });
    if (result.levelUp) toast(`Level ${result.levelUp.level} reached: ${result.levelUp.title}`, { emoji: '✨' });
  }

  async function remove(project) {
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      message: project.completedDay ? 'The project and its bonus points are removed. Its maintenance habit stays.' : 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    store.deleteProject(project.id);
    toast('Project deleted');
    navigate('#/projects', { replace: true });
  }

  const onChange = () => {
    const focused = document.activeElement?.id;
    render();
    if (focused === 'new-step') root.querySelector('#new-step')?.focus();
  };
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}
