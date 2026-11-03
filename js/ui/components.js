/** Reusable UI pieces: page headers, form controls, habit schedule fields. */
import { navigate } from '../nav.js';
import { h, weekdayName } from './dom.js';
import { icon } from './icons.js';

export function pageHeader({ title, subtitle = '', back = null, actions = null }) {
  return h(
    'header',
    { class: 'page-head' },
    h(
      'div',
      { class: 'page-head-inner' },
      back
        ? h('a', {
            class: 'back-link',
            href: back.href,
            onclick: (e) => {
              e.preventDefault();
              navigate(back.href, { replace: true });
            },
          }, icon('chevronLeft', { size: 20 }), back.label)
        : null,
      h('div', { class: 'page-head-row' }, h('h1', { class: 'page-title' }, title), actions),
      subtitle ? h('p', { class: 'page-subtitle' }, subtitle) : null,
    ),
  );
}

export function field(label, control, { hint = '', id = '' } = {}) {
  return h(
    'div',
    { class: 'field' },
    id ? h('label', { class: 'field-label', for: id }, label) : h('div', { class: 'field-label' }, label),
    control,
    hint ? h('p', { class: 'field-hint' }, hint) : null,
  );
}

export function textInput({ id, value = '', placeholder = '', maxlength = 80, onInput = null, enterkeyhint = 'done' }) {
  return h('input', {
    class: 'input',
    id,
    type: 'text',
    value,
    placeholder,
    maxlength: String(maxlength),
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint,
    oninput: onInput ? (e) => onInput(e.target.value) : null,
  });
}

/** A segmented control. options: [{ value, label }] */
export function segmented({ options, value, onChange, label }) {
  const root = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const buttons = options.map((option) =>
    h('button', {
      class: 'seg',
      type: 'button',
      role: 'radio',
      'aria-checked': String(option.value === value),
      onclick: () => select(option.value),
    }, option.label),
  );
  function select(next) {
    if (next === value) return;
    value = next;
    buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === next)));
    onChange(next);
  }
  root.append(...buttons);
  return root;
}

export function stepper({ value, min, max, step = 1, format = String, onChange, label }) {
  const output = h('output', { class: 'stepper-value', 'aria-live': 'polite' }, format(value));
  const set = (next) => {
    next = Math.min(max, Math.max(min, next));
    if (next === value) return;
    value = next;
    output.textContent = format(value);
    dec.disabled = value <= min;
    inc.disabled = value >= max;
    onChange(value);
  };
  const dec = h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `Less ${label}`, onclick: () => set(value - step) }, icon('minus', { size: 20 }));
  const inc = h('button', { class: 'stepper-btn', type: 'button', 'aria-label': `More ${label}`, onclick: () => set(value + step) }, icon('plus', { size: 20 }));
  dec.disabled = value <= min;
  inc.disabled = value >= max;
  return h('div', { class: 'stepper' }, dec, output, inc);
}

export function switchRow({ label, description = '', checked, onChange }) {
  const input = h('input', {
    class: 'switch-input',
    type: 'checkbox',
    checked,
    onchange: (e) => onChange(e.target.checked),
  });
  return h(
    'label',
    { class: 'switch-row' },
    h('span', { class: 'switch-text' }, h('span', { class: 'switch-label' }, label), description ? h('span', { class: 'switch-desc' }, description) : null),
    input,
    h('span', { class: 'switch', 'aria-hidden': 'true' }),
  );
}

export function weekdayPicker({ days, weekStartsOn, onChange }) {
  const selected = new Set(days);
  const root = h('div', { class: 'weekdays', role: 'group', 'aria-label': 'Days of the week' });
  for (let i = 0; i < 7; i++) {
    const day = (weekStartsOn + i) % 7;
    const button = h('button', {
      class: 'weekday',
      type: 'button',
      'aria-pressed': String(selected.has(day)),
      'aria-label': weekdayName(day, 'long'),
      onclick: () => {
        if (selected.has(day)) selected.delete(day);
        else selected.add(day);
        button.setAttribute('aria-pressed', String(selected.has(day)));
        onChange([...selected].sort((a, b) => a - b));
      },
    }, weekdayName(day, 'narrow'));
    root.append(button);
  }
  return root;
}

const GROUP_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'daytime', label: 'Daytime' },
  { value: 'evening', label: 'Evening' },
];

/**
 * Schedule, time of day and points for a habit draft (mutated in place).
 * draft: { group, schedule, points }
 */
export function habitScheduleFields(draft, { weekStartsOn = 1, onChange = () => {} } = {}) {
  let lastDays = draft.schedule.type === 'days' ? draft.schedule.days : [1, 3, 5];
  let lastTarget = draft.schedule.type === 'weekly' ? draft.schedule.target : 2;
  const detail = h('div', { class: 'schedule-detail' });
  const groupField = field(
    'Time of day',
    segmented({ options: GROUP_OPTIONS, value: draft.group, label: 'Time of day', onChange: (v) => { draft.group = v; onChange(); } }),
  );

  function renderDetail() {
    detail.replaceChildren();
    if (draft.schedule.type === 'days') {
      detail.append(
        weekdayPicker({
          days: draft.schedule.days,
          weekStartsOn,
          onChange: (days) => {
            lastDays = days;
            draft.schedule = { type: 'days', days };
            onChange();
          },
        }),
      );
    } else if (draft.schedule.type === 'weekly') {
      detail.append(
        h('div', { class: 'inline-field' },
          h('span', { class: 'inline-label' }, 'Target'),
          stepper({
            value: draft.schedule.target,
            min: 1,
            max: 7,
            label: 'times per week',
            format: (n) => `${n}× a week`,
            onChange: (n) => {
              lastTarget = n;
              draft.schedule = { type: 'weekly', target: n };
              onChange();
            },
          })),
        h('p', { class: 'field-hint' }, 'Weekly goals live in their own “This week” section. Tick them on any day.'),
      );
    }
    groupField.hidden = draft.schedule.type === 'weekly';
  }

  const schedule = segmented({
    options: [
      { value: 'daily', label: 'Every day' },
      { value: 'days', label: 'Some days' },
      { value: 'weekly', label: 'Weekly goal' },
    ],
    value: draft.schedule.type,
    label: 'How often',
    onChange: (type) => {
      if (type === 'daily') draft.schedule = { type: 'daily' };
      if (type === 'days') draft.schedule = { type: 'days', days: lastDays.length ? lastDays : [1, 3, 5] };
      if (type === 'weekly') draft.schedule = { type: 'weekly', target: lastTarget };
      renderDetail();
      onChange();
    },
  });

  renderDetail();
  return h(
    'div',
    { class: 'field-stack' },
    field('How often', schedule),
    detail,
    groupField,
    field(
      'Points',
      stepper({
        value: draft.points,
        min: 0,
        max: 100,
        step: 5,
        label: 'points',
        format: (n) => `${n} pts`,
        onChange: (n) => {
          draft.points = n;
          onChange();
        },
      }),
    ),
  );
}

export function describeSchedule(schedule, weekStartsOn = 1) {
  if (schedule.type === 'weekly') return `${schedule.target}× a week`;
  if (schedule.type === 'days') {
    const order = (d) => (d - weekStartsOn + 7) % 7;
    const days = [...schedule.days].sort((a, b) => order(a) - order(b));
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends';
    return days.map((d) => weekdayName(d, 'short')).join(', ');
  }
  return 'Every day';
}

export function emptyState({ emoji, title, text, actions = [] }) {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty-emoji', 'aria-hidden': 'true' }, emoji),
    h('h2', { class: 'empty-title' }, title),
    h('p', { class: 'empty-text' }, text),
    actions.length ? h('div', { class: 'empty-actions' }, actions) : null,
  );
}
