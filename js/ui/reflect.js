/**
 * The evening reflection (about a minute): did I show up, what brought me
 * joy, what am I letting go of, and one word for tomorrow. Tomorrow's word
 * greets you in the next morning's ritual. Answers save as you go.
 */
import { formatMinutes } from '../core/focus.js';
import { LIMITS } from '../core/model.js';
import { TOMORROW_WORDS, cleanWord } from '../core/ritual.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { h } from './dom.js';
import { choiceList, chips, createFlow, flowInput, primaryButton, secondaryButton, stepHead } from './flow.js';
import { haptic } from './fx.js';

const SHOWED_UP = [
  { value: 'yes', label: 'Yes', reply: 'That’s the whole game. Well done.' },
  { value: 'partly', label: 'In part', reply: 'Partly counts. Showing up comes in all sizes.' },
  { value: 'rest', label: 'Not today', reply: 'Rest is part of the rhythm. Tomorrow’s a fresh page.' },
];

export function ReflectView() {
  const key = store.todayKey();
  const close = () => navigate('#/today', { replace: true });
  const flow = createFlow({ name: 'reflect', mood: 'evening', closeLabel: 'Close', onClose: close });
  const saved = store.reflection(key) || {};
  const answers = {
    showedUp: saved.showedUp || null,
    joy: saved.joy || '',
    lettingGo: saved.lettingGo || store.ritual(key)?.lettingGo || '',
    tomorrowWord: saved.tomorrowWord || '',
  };
  const save = (patch) => {
    Object.assign(answers, patch);
    store.saveReflection(key, answers);
  };
  const steps = ['showed', 'joy', 'letgo', 'word', 'done'];
  const show = (step, content) => flow.show(content, { index: steps.indexOf(step), total: steps.length });

  function showed() {
    const sessions = store.sessionsBetween(key, key).filter((s) => s.kind === 'focus');
    const minutes = sessions.reduce((sum, s) => sum + s.minutes, 0);
    const stats = store.dayStats(key);
    const main = store.ritual(key)?.mainThing;
    const facts = [
      stats.dueCount ? `${stats.doneCount} of ${stats.dueCount} habits` : null,
      sessions.length ? `${formatMinutes(minutes)} of focus` : null,
      main?.text ? `Main thing: ${main.text}` : null,
    ].filter(Boolean);
    const reply = h('p', { class: 'flow-sub reflect-reply', 'aria-live': 'polite' });
    const actions = h('div', { class: 'flow-actions' });
    show('showed', [
      ...stepHead('Did you show up today?', { kicker: 'A minute to close the day' }),
      facts.length ? h('ul', { class: 'flow-facts' }, facts.map((f) => h('li', {}, f))) : null,
      choiceList(
        SHOWED_UP.map((o) => ({ value: o.value, label: o.label })),
        (value) => {
          save({ showedUp: value });
          haptic();
          reply.textContent = SHOWED_UP.find((o) => o.value === value).reply;
          actions.replaceChildren(primaryButton('Continue', joy));
          reply.parentElement.querySelectorAll('.flow-choice').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
        },
        { selected: answers.showedUp || '', label: 'Did you show up?' },
      ),
      reply,
      actions,
    ]);
    if (answers.showedUp) {
      reply.textContent = SHOWED_UP.find((o) => o.value === answers.showedUp).reply;
      actions.replaceChildren(primaryButton('Continue', joy));
    }
  }

  function textStep(step, title, sub, field, placeholder, nextStep) {
    let value = answers[field];
    const input = flowInput({ id: `reflect-${field}`, value, placeholder, maxlength: LIMITS.reflection, onInput: (v) => { value = v; } });
    const go = () => {
      save({ [field]: value.trim() });
      nextStep();
    };
    show(step, [...stepHead(title, { sub }), input, h('div', { class: 'flow-actions' }, primaryButton('Continue', go), secondaryButton('Skip', nextStep))]);
  }

  const joy = () => textStep('joy', 'What brought you joy?', 'Big or tiny. Joy is fuel.', 'joy', 'A moment, a person, a small thing', letgo);
  const letgo = () => textStep('letgo', 'What are you letting go of?', 'Set it down for tonight. It can wait, or it can go.', 'lettingGo', 'A worry, a task, a should', word);

  function word() {
    let value = answers.tomorrowWord;
    const input = flowInput({ id: 'reflect-word', value, placeholder: 'One word', maxlength: 24, onInput: (v) => { value = v; } });
    const go = () => {
      save({ tomorrowWord: cleanWord(value) });
      finish();
    };
    show('word', [
      ...stepHead('One word for tomorrow', { sub: 'It’ll be waiting for you in the morning.' }),
      input,
      chips(TOMORROW_WORDS, (w) => {
        input.value = w;
        value = w;
      }),
      h('div', { class: 'flow-actions' }, primaryButton('Done', go), secondaryButton('No word tonight', finish)),
    ]);
  }

  function finish() {
    const tomorrow = answers.tomorrowWord;
    show('done', [
      h('div', { class: 'focus-glow', 'aria-hidden': 'true' }, '🌙'),
      ...stepHead('Rest well.', { sub: tomorrow ? `Your word for tomorrow: ${tomorrow}` : 'Tomorrow is a fresh page.' }),
      h('div', { class: 'flow-actions' }, primaryButton('Done for today', close)),
    ]);
  }

  showed();
  return { el: flow.el };
}
