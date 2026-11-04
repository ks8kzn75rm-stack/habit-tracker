/**
 * The Begin ritual (about a minute): arrive, centre, a card, choose, let go,
 * begin. It always ends in action: a focus session now, or a set start time.
 */
import { greeting, phaseFor } from '../core/copy.js';
import { minutesIntoDay, parseHHMM, toHHMM } from '../core/dates.js';
import { seasonPhrase, seasonWeeks } from '../core/perspective.js';
import {
  ARRIVALS,
  LETTING_GO_SUGGESTIONS,
  arrivalById,
  pickCard,
  pickFoundationLine,
  ritualSteps,
  suggestedStart,
} from '../core/ritual.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { celebrateTick } from './celebrations.js';
import { fill, formatTime, h, prefersReducedMotion, ring, setRing } from './dom.js';
import { choiceList, chips, createFlow, durationPicker, flowInput, primaryButton, secondaryButton, stepHead } from './flow.js';
import { haptic } from './fx.js';
import { icon } from './icons.js';
import { toast } from './overlay.js';

const nextStepOf = (project) => project?.steps.find((s) => !s.done)?.text || '';

export function seasonLine(today) {
  const s = store.settings;
  if (!s.seasonEnabled || !s.seasonEnd) return null;
  const phrase = seasonPhrase(seasonWeeks(today, s.seasonEnd));
  return h('p', { class: 'flow-season' }, icon('mountain', { size: 16 }), `${s.seasonLabel || 'This season'} · ${phrase}`);
}

export function BeginView() {
  const today = store.todayKey();
  store.markRitualOffered(today);
  const saved = store.ritual(today) || {};
  const draft = {
    arrival: null,
    breathed: false,
    cardId: null,
    line: null,
    mainThing: saved.mainThing || null,
    lettingGo: saved.lettingGo || '',
  };
  const minutesNow = minutesIntoDay(new Date());
  const flow = createFlow({ name: 'begin', mood: phaseFor(minutesNow), closeLabel: 'Skip', onClose: skip });
  let steps = ritualSteps(null);
  let breathTimer = null;

  const show = (step, content) => flow.show(content, { index: steps.indexOf(step), total: steps.length });
  const next = (from) => RENDER[steps[steps.indexOf(from) + 1]]();

  function stopBreathing() {
    clearInterval(breathTimer);
    breathTimer = null;
  }

  function skip() {
    stopBreathing();
    store.skipRitual(today);
    navigate('#/today', { replace: true });
  }

  // ------------------------------------------------------------ arrive

  function arrive() {
    const word = store.wordForToday(today);
    show('arrive', [
      store.meta.ritualIntroSeen
        ? null
        : h('p', { class: 'flow-note' }, icon('sparkle', { size: 16 }), 'New: a minute to begin your day with intention. Skip it whenever you like.'),
      word ? h('div', { class: 'flow-word' }, h('span', {}, 'Your word for today'), h('b', {}, word)) : null,
      ...stepHead('How are you arriving?', { kicker: greeting(minutesNow) }),
      choiceList(
        ARRIVALS.map((a) => ({ value: a.id, label: a.label, emoji: a.emoji })),
        (id) => {
          draft.arrival = id;
          steps = ritualSteps(id);
          store.updateRitual(today, { arrival: id });
          haptic();
          next('arrive');
        },
        { label: 'How you’re arriving' },
      ),
      h('button', { class: 'flow-link', type: 'button', onclick: skip }, 'Skip for today'),
    ]);
  }

  // ----------------------------------------------------------- breathe

  function breathe() {
    const arrival = arrivalById(draft.arrival);
    const seconds = store.settings.breathSeconds;
    const label = h('span', { class: 'breath-label', 'aria-live': 'polite' }, 'When you’re ready');
    const progress = ring(240, 4, 0, 'breath-ring');
    const orb = h('div', { class: 'breath' }, progress, h('span', { class: 'breath-orb' }), label);
    const actions = h('div', { class: 'flow-actions' });
    const done = () => {
      stopBreathing();
      draft.breathed = true;
      store.updateRitual(today, { breathed: true });
      next('breathe');
    };
    const start = () => {
      orb.classList.add('is-breathing');
      const t0 = performance.now();
      label.textContent = 'Breathe in…';
      actions.replaceChildren(secondaryButton('I feel centred', done));
      breathTimer = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        setRing(progress, t / seconds);
        if (t >= seconds) {
          done();
          return;
        }
        label.textContent = t % 10 < 4 ? 'Breathe in…' : 'Breathe out…';
      }, 250);
    };
    actions.append(
      primaryButton(`Breathe with me · ${seconds}s`, start, { iconName: 'wind' }),
      secondaryButton('Skip this', () => {
        stopBreathing();
        next('breathe');
      }),
    );
    show('breathe', [...stepHead(arrival.intro, { sub: arrival.breathe }), orb, actions]);
    if (prefersReducedMotion()) orb.classList.add('is-still');
  }

  // -------------------------------------------------------------- card

  function card() {
    const chosen = pickCard({ cards: store.cards(), arrivalId: draft.arrival, dayKey: today, recentIds: store.recentCardIds(today) });
    const line = pickFoundationLine(store.foundations, today);
    draft.cardId = chosen?.id || null;
    draft.line = line ? `${line.label}: ${line.text}` : null;
    store.updateRitual(today, { cardId: draft.cardId, line: draft.line });

    let cardEl = h('p', { class: 'flow-sub' }, 'Every card is hidden at the moment. You can bring them back in the card library.');
    if (chosen) {
      const fav = h('button', {
        class: 'card-action is-fav',
        type: 'button',
        'aria-pressed': String(chosen.favourite),
        'aria-label': 'Favourite this card',
        onclick: () => {
          const now = !store.card(chosen.id).favourite;
          store.setCardFlags(chosen.id, { favourite: now });
          fav.setAttribute('aria-pressed', String(now));
          if (now) haptic();
        },
      }, icon('heart', { size: 20 }));
      const hide = h('button', {
        class: 'card-action',
        type: 'button',
        'aria-label': 'Don’t show this card again',
        onclick: () => {
          store.setCardFlags(chosen.id, { hidden: true });
          toast('Card hidden. You can bring it back from the card library.', { emoji: '🙈' });
          next('card');
        },
      }, icon('eyeOff', { size: 20 }));
      cardEl = h(
        'figure',
        { class: 'ritual-card' },
        h('p', { class: 'ritual-card-text' }, chosen.text),
        h('figcaption', { class: 'ritual-card-credit' }, chosen.credit),
        h('div', { class: 'ritual-card-actions' }, fav, hide),
      );
    }
    show('card', [
      ...stepHead('Something to carry with you'),
      cardEl,
      line
        ? h('div', { class: 'ritual-line' }, h('span', { class: 'ritual-line-label' }, line.label), h('p', { class: 'ritual-line-text' }, line.text))
        : h('p', { class: 'flow-note' }, 'Add your why and your joys in Foundations, and one will appear here each morning.'),
      h('div', { class: 'flow-actions' }, primaryButton('Continue', () => next('card'))),
    ]);
  }

  // ------------------------------------------------------------ choose

  function choose() {
    const arrival = arrivalById(draft.arrival);
    const projects = store.activeProjects();
    let selected = draft.mainThing ? draft.mainThing.projectId || 'other' : projects.length ? null : 'other';
    let text = draft.mainThing?.text || '';
    const detail = h('div', { class: 'flow-detail' });
    const valid = () => Boolean(selected) && (selected !== 'other' || text.trim().length > 0);
    const cont = primaryButton('Continue', () => {
      const project = projects.find((p) => p.id === selected) || null;
      draft.mainThing = { projectId: project?.id || null, text: text.trim() || project?.name || '' };
      store.updateRitual(today, { mainThing: draft.mainThing });
      next('choose');
    });

    function renderDetail() {
      detail.replaceChildren();
      cont.disabled = !valid();
      if (!selected) return;
      const project = projects.find((p) => p.id === selected);
      if (project && !text) text = nextStepOf(project);
      const input = flowInput({
        id: 'main-thing',
        value: text,
        placeholder: project ? 'The next small step (optional)' : 'Your one main thing',
        maxlength: 120,
        onInput: (v) => {
          text = v;
          cont.disabled = !valid();
        },
      });
      detail.append(h('label', { class: 'flow-label', for: 'main-thing' }, project ? 'What exactly, today?' : 'Name it'), input);
    }

    const options = [
      ...projects.map((p) => ({ value: p.id, label: p.name, hint: nextStepOf(p) ? `Next: ${nextStepOf(p)}` : '' })),
      { value: 'other', label: projects.length ? 'Something else' : 'Today’s main thing' },
    ];
    const list = choiceList(
      options,
      (value) => {
        if (value === selected) return;
        selected = value;
        text = '';
        list.querySelectorAll('.flow-choice').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
        renderDetail();
      },
      { selected: selected ?? '', label: 'Your main thing' },
    );
    show('choose', [
      ...stepHead('What’s your one main thing today?', { sub: arrival?.choose }),
      list,
      detail,
      projects.length ? null : h('p', { class: 'flow-note' }, 'Tip: add up to three active projects in Foundations and they’ll be here, one tap away.'),
      h('div', { class: 'flow-actions' }, cont),
    ]);
    renderDetail();
  }

  // ------------------------------------------------------------ let go

  function letgo() {
    let value = draft.lettingGo;
    const input = flowInput({
      id: 'letting-go',
      value,
      placeholder: 'Something you’re choosing not to do today',
      maxlength: 120,
      onInput: (v) => {
        value = v;
      },
    });
    const done = () => {
      draft.lettingGo = value.trim();
      store.updateRitual(today, { lettingGo: draft.lettingGo });
      next('letgo');
    };
    const parked = store.parkedProjects().slice(0, 2).map((p) => p.name);
    show('letgo', [
      ...stepHead('Anything you’re letting go of today?', { sub: 'Choosing one thing means not doing others. That’s allowed, and it’s freeing.' }),
      input,
      chips([...parked, ...LETTING_GO_SUGGESTIONS], (v) => {
        input.value = v;
        value = v;
      }),
      h('div', { class: 'flow-actions' }, primaryButton('Continue', done), secondaryButton('Nothing today', () => {
        value = '';
        done();
      })),
    ]);
  }

  // ------------------------------------------------------------- begin

  function begin() {
    const arrival = arrivalById(draft.arrival);
    let minutes = arrival?.minutes || store.settings.focusMinutes;
    let startAt = suggestedStart(new Date());
    const main = draft.mainThing?.text || store.project(draft.mainThing?.projectId)?.name || '';
    const minutesLabel = h('b', {}, String(minutes));
    const time = h('input', {
      class: 'flow-time',
      type: 'time',
      value: toHHMM(startAt),
      'aria-label': 'Start time',
      onchange: (e) => {
        const v = parseHHMM(e.target.value);
        if (v !== null) startAt = v;
        renderActions();
      },
    });
    const actions = h('div', { class: 'flow-actions' });
    const isLater = () => startAt - minutesIntoDay(new Date()) > 5;

    function finish(now) {
      const plan = { startAt: now ? minutesIntoDay(new Date()) : startAt, minutes };
      const { result, habit } = store.completeRitual(today, { ...draft, plan });
      haptic();
      if (now) {
        store.startSession({ minutes, projectId: draft.mainThing?.projectId || null, intent: main });
        navigate('#/focus', { replace: true });
      } else {
        navigate('#/today', { replace: true });
        toast(`See you at ${formatTime(startAt)}. Your Begin button is waiting.`, { emoji: '🌅' });
      }
      // Morning Win, full house, a level up, or simply "+15" for the ritual habit.
      if (habit && result) celebrateTick(result);
    }

    function renderActions() {
      fill(
        actions,
        isLater()
          ? primaryButton(`I’ll begin at ${formatTime(startAt)}`, () => finish(false), { big: true, iconName: 'clock' })
          : primaryButton('Begin', () => finish(true), { big: true, iconName: 'play' }),
        isLater() ? secondaryButton('Begin now instead', () => finish(true)) : null,
      );
    }

    show('begin', [
      ...stepHead('Begin', { kicker: main ? `Today: ${main}` : '', sub: arrival?.begin }),
      h('p', { class: 'begin-sentence' }, 'I’ll start at ', time, ' for ', minutesLabel, ' minutes.'),
      durationPicker({
        value: minutes,
        onChange: (m) => {
          minutes = m;
          minutesLabel.textContent = String(m);
        },
      }),
      seasonLine(today),
      actions,
    ]);
    renderActions();
  }

  const RENDER = { arrive, breathe, card, choose, letgo, begin };
  arrive();

  return {
    el: flow.el,
    destroy() {
      stopBreathing();
    },
  };
}
