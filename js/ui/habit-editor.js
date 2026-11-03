/** Add or edit a habit. */
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { emptyState, field, habitScheduleFields, pageHeader, switchRow, textInput } from './components.js';
import { formatDayShort, formatTime, h } from './dom.js';
import { icon } from './icons.js';
import { confirm, toast } from './overlay.js';

export function HabitEditorView({ id = null } = {}) {
  const root = h('div', { class: 'view view-habit-editor' });
  const existing = id ? store.habit(id) : null;
  const back = { href: '#/settings', label: 'Settings' };

  if (id && !existing) {
    root.append(
      pageHeader({ title: 'Habit', back }),
      h('div', { class: 'page-body' }, emptyState({ emoji: '🔍', title: 'Habit not found', text: 'It may have been removed.', actions: [h('a', { class: 'btn', href: '#/settings' }, 'Back to Settings')] })),
    );
    return { el: root };
  }

  const draft = existing
    ? structuredClone(existing)
    : { name: '', group: 'morning', schedule: { type: 'daily' }, points: 10, windowCountdown: false, lightsOut: false };
  const error = h('p', { class: 'form-error', role: 'alert' });
  const nameInput = textInput({
    id: 'habit-name',
    value: draft.name,
    placeholder: 'e.g. Read 10 pages',
    maxlength: LIMITS.name,
    onInput: (v) => {
      draft.name = v;
      error.textContent = '';
    },
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.blur();
    }
  });

  const save = () => {
    if (!draft.name.trim()) {
      error.textContent = 'Give your habit a name.';
      nameInput.focus();
      return;
    }
    if (draft.schedule.type === 'days' && !draft.schedule.days.length) {
      error.textContent = 'Pick at least one day.';
      return;
    }
    const fields = {
      name: draft.name,
      group: draft.group,
      schedule: draft.schedule,
      points: draft.points,
      windowCountdown: draft.windowCountdown,
      lightsOut: draft.lightsOut,
    };
    if (existing) store.updateHabit(existing.id, fields);
    else store.addHabit(fields);
    toast(existing ? 'Habit updated' : 'Habit added', { emoji: '✅' });
    navigate('#/settings', { replace: true });
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove “${existing.name}”?`,
      message: 'Past days keep their history, so your earlier scores stay as they are. You can restore it from Settings.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const result = store.removeHabit(existing.id);
    if (result === 'archived') {
      toast('Habit removed', { action: { label: 'Undo', run: () => store.restoreHabit(existing.id) } });
    } else toast('Habit removed');
    navigate('#/settings', { replace: true });
  };

  const linkedProject = existing?.projectId ? store.project(existing.projectId) : null;

  root.append(
    pageHeader({ title: existing ? 'Edit habit' : 'New habit', back }),
    h(
      'div',
      { class: 'page-body' },
      h(
        'section',
        { class: 'card form-card' },
        field('Name', nameInput, { id: 'habit-name' }),
        habitScheduleFields(draft, { weekStartsOn: store.settings.weekStartsOn }),
      ),
      h(
        'section',
        { class: 'card form-card' },
        h('h2', { class: 'card-title' }, 'Extras'),
        switchRow({
          label: 'Morning window countdown',
          description: `On days it’s due, show the time left until ${formatTime(store.settings.windowEnd)}.`,
          checked: draft.windowCountdown,
          onChange: (on) => {
            draft.windowCountdown = on;
          },
        }),
        switchRow({
          label: 'Show lights-out target',
          description: `Shows your target time (${formatTime(store.settings.lightsOut)}) on this habit.`,
          checked: draft.lightsOut,
          onChange: (on) => {
            draft.lightsOut = on;
          },
        }),
      ),
      error,
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: save }, existing ? 'Save changes' : 'Add habit'),
        existing ? h('button', { class: 'btn btn-danger-text btn-block', type: 'button', onclick: remove }, icon('trash', { size: 18 }), 'Remove habit') : null,
      ),
      existing
        ? h('p', { class: 'center-note' }, `Added ${formatDayShort(existing.createdDay || store.todayKey())}`, linkedProject ? ` · from the project “${linkedProject.name}”` : '')
        : null,
    ),
  );
  return { el: root };
}
