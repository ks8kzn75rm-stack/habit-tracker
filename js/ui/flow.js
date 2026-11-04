/**
 * A calm, full-screen sequence of steps: one idea per screen, with slow
 * crossfades. Used by the Begin ritual, "I'm stuck", the evening reflection
 * and the weekly tune-up.
 */
import { FOCUS_PRESETS, MAX_SESSION_MINUTES } from '../core/focus.js';
import { fill, h, prefersReducedMotion } from './dom.js';
import { icon } from './icons.js';

/**
 * @param {object} o
 * @param {string} o.name        flow name (adds a class for styling)
 * @param {string} [o.mood]      'morning' | 'daytime' | 'evening' colour mood
 * @param {string} [o.closeLabel]
 * @param {() => void} o.onClose
 */
export function createFlow({ name, mood = 'morning', closeLabel = 'Skip', onClose }) {
  const dots = h('div', { class: 'flow-dots', 'aria-hidden': 'true' });
  const close = h('button', { class: 'flow-close', type: 'button', onclick: () => onClose() }, closeLabel);
  const stage = h('div', { class: 'flow-stage' });
  const root = h(
    'div',
    { class: `view view-flow flow-${name}`, 'data-mood': mood },
    h('div', { class: 'flow-sky', 'aria-hidden': 'true' }, h('span', { class: 'flow-sun' })),
    h('div', { class: 'flow-inner' }, h('header', { class: 'flow-top' }, dots, close), stage),
  );
  let current = null;

  function show(content, { index = 0, total = 0 } = {}) {
    dots.replaceChildren(...Array.from({ length: total }, (_, i) => h('span', { class: i < index ? 'done' : i === index ? 'on' : '' })));
    const step = h('section', { class: 'flow-step' }, content);
    const previous = current;
    current = step;
    if (previous) {
      previous.classList.add('leaving');
      previous.setAttribute('aria-hidden', 'true');
      previous.inert = true;
      setTimeout(() => previous.remove(), prefersReducedMotion() ? 0 : 320);
    }
    stage.append(step);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => step.querySelector('.flow-title')?.focus({ preventScroll: true }));
    return step;
  }

  return {
    el: root,
    show,
    setCloseLabel(text) {
      close.textContent = text;
    },
    setMood(next) {
      root.dataset.mood = next;
    },
  };
}

export function stepHead(title, { kicker = '', sub = '' } = {}) {
  return [
    kicker ? h('p', { class: 'flow-kicker' }, kicker) : null,
    h('h1', { class: 'flow-title', tabindex: '-1' }, title),
    sub ? h('p', { class: 'flow-sub' }, sub) : null,
  ];
}

/** Large, tappable options. options: [{ value, label, emoji?, hint? }] */
export function choiceList(options, onPick, { selected = null, label = '' } = {}) {
  return h(
    'div',
    { class: 'flow-choices', role: 'group', 'aria-label': label || null },
    options.map((o) =>
      h(
        'button',
        {
          class: 'flow-choice',
          type: 'button',
          'aria-pressed': selected === null ? null : String(o.value === selected),
          'data-value': o.value,
          onclick: () => onPick(o.value),
        },
        o.emoji ? h('span', { class: 'flow-choice-emoji', 'aria-hidden': 'true' }, o.emoji) : null,
        h('span', { class: 'flow-choice-text' }, h('span', { class: 'flow-choice-label' }, o.label), o.hint ? h('span', { class: 'flow-choice-hint' }, o.hint) : null),
      ),
    ),
  );
}

export function primaryButton(label, onclick, { iconName = '', big = false } = {}) {
  return h('button', { class: `flow-primary${big ? ' is-big' : ''}`, type: 'button', onclick }, iconName ? icon(iconName, { size: big ? 26 : 20 }) : null, label);
}

export function secondaryButton(label, onclick) {
  return h('button', { class: 'flow-secondary', type: 'button', onclick }, label);
}

export function flowInput({ id, value = '', placeholder = '', maxlength = 120, onInput = null, label = '' }) {
  const input = h('input', {
    class: 'flow-input',
    id,
    type: 'text',
    value,
    placeholder,
    maxlength: String(maxlength),
    autocomplete: 'off',
    autocapitalize: 'sentences',
    enterkeyhint: 'done',
    'aria-label': label || placeholder,
    oninput: onInput ? (e) => onInput(e.target.value) : null,
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
  });
  return input;
}

/** Small suggestion chips that fill an input when tapped. */
export function chips(values, onPick) {
  return h(
    'div',
    { class: 'flow-chips' },
    values.map((v) => h('button', { class: 'flow-chip', type: 'button', onclick: () => onPick(v) }, v)),
  );
}

/** Minutes for a focus session: 5 / 25 / 50 / 90 or a custom length. */
export function durationPicker({ value, onChange, presets = FOCUS_PRESETS }) {
  let minutes = value;
  let custom = !presets.includes(value);
  const root = h('div', { class: 'duration' });
  const set = (m) => {
    minutes = Math.min(MAX_SESSION_MINUTES, Math.max(1, m));
    onChange(minutes);
    render();
  };
  function render() {
    fill(
      root,
      h(
        'div',
        { class: 'flow-chips duration-chips', role: 'radiogroup', 'aria-label': 'Session length in minutes' },
        presets.map((m) =>
          h('button', {
            class: 'flow-chip',
            type: 'button',
            role: 'radio',
            'aria-checked': String(!custom && m === minutes),
            onclick: () => {
              custom = false;
              set(m);
            },
          }, `${m} min`),
        ),
        h('button', {
          class: 'flow-chip',
          type: 'button',
          role: 'radio',
          'aria-checked': String(custom),
          onclick: () => {
            custom = true;
            render();
          },
        }, 'Custom'),
      ),
      custom
        ? h(
            'div',
            { class: 'duration-custom' },
            h('button', { class: 'duration-step', type: 'button', 'aria-label': 'Five minutes less', onclick: () => set(minutes - 5) }, icon('minus', { size: 20 })),
            h('output', { class: 'duration-value', 'aria-live': 'polite' }, `${minutes} min`),
            h('button', { class: 'duration-step', type: 'button', 'aria-label': 'Five minutes more', onclick: () => set(minutes + 5) }, icon('plus', { size: 20 })),
          )
        : null,
    );
  }
  render();
  return root;
}
