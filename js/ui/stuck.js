/**
 * "I'm stuck": a one-minute Resistance rescue. Name the shape it's taking, get
 * a reframe, then commit to just five minutes.
 */
import { phaseFor } from '../core/copy.js';
import { minutesIntoDay } from '../core/dates.js';
import { RESCUE_CREDIT, RESCUE_MINUTES, RESISTANCE_FORMS, resistanceForm } from '../core/ritual.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { h } from './dom.js';
import { choiceList, createFlow, primaryButton, secondaryButton, stepHead } from './flow.js';
import { haptic } from './fx.js';

export function StuckView() {
  const back = () => navigate(store.activeSession ? '#/focus' : '#/today', { replace: true });
  const flow = createFlow({ name: 'stuck', mood: phaseFor(minutesIntoDay(new Date())), closeLabel: 'Close', onClose: back });
  let form = null;

  function name() {
    flow.show(
      [
        ...stepHead('What shape is it taking?', { kicker: 'Resistance is here. That usually means this matters.' }),
        choiceList(
          RESISTANCE_FORMS.map((f) => ({ value: f.id, label: f.label })),
          (id) => {
            form = resistanceForm(id);
            haptic();
            reframe();
          },
          { label: 'The shape of Resistance' },
        ),
      ],
      { index: 0, total: 3 },
    );
  }

  function reframe() {
    flow.show(
      [
        ...stepHead(form.label),
        h('figure', { class: 'ritual-card' }, h('p', { class: 'ritual-card-text' }, form.reframe), h('figcaption', { class: 'ritual-card-credit' }, RESCUE_CREDIT)),
        h('div', { class: 'ritual-line' }, h('span', { class: 'ritual-line-label' }, 'One small step'), h('p', { class: 'ritual-line-text' }, form.step)),
        h('div', { class: 'flow-actions' }, primaryButton('Continue', commit)),
      ],
      { index: 1, total: 3 },
    );
  }

  function commit() {
    const running = store.activeSession;
    const main = store.ritual()?.mainThing;
    const intent = main?.text || store.project(main?.projectId)?.name || form.step;
    flow.show(
      [
        ...stepHead(running ? 'Back to it, gently.' : 'Five minutes. That’s all.', {
          sub: running ? 'Your session is still running. Pick up wherever you left off.' : 'You can stop after five. Most days, you won’t want to.',
        }),
        h(
          'div',
          { class: 'flow-actions' },
          running
            ? primaryButton('Back to my session', () => navigate('#/focus', { replace: true }), { big: true, iconName: 'play' })
            : primaryButton(`Start ${RESCUE_MINUTES} minutes`, () => {
                store.startSession({ minutes: RESCUE_MINUTES, projectId: main?.projectId || null, intent, rescue: form.id });
                haptic();
                navigate('#/focus', { replace: true });
              }, { big: true, iconName: 'play' }),
          secondaryButton('Not right now', back),
        ),
      ],
      { index: 2, total: 3 },
    );
  }

  name();
  return { el: flow.el };
}
