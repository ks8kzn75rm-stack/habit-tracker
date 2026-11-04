/** The card library: favourite, hide, edit or write your own cards. */
import { THEMES, THEME_IDS } from '../core/cards.js';
import { LIMITS } from '../core/model.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { emptyState, field, pageHeader, segmented, textInput } from './components.js';
import { h, plural } from './dom.js';
import { haptic } from './fx.js';
import { icon } from './icons.js';
import { confirm, toast } from './overlay.js';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'yours', label: 'Yours' },
  { value: 'hidden', label: 'Hidden' },
];

export function cardActions(card, { compact = false } = {}) {
  const fav = h('button', {
    class: 'card-action is-fav',
    type: 'button',
    'aria-pressed': String(card.favourite),
    'aria-label': card.favourite ? 'Remove from favourites' : 'Favourite this card',
    onclick: () => {
      store.setCardFlags(card.id, { favourite: !card.favourite });
      if (!card.favourite) haptic();
    },
  }, icon('heart', { size: 18 }));
  const hide = h('button', {
    class: 'card-action',
    type: 'button',
    'aria-pressed': String(card.hidden),
    'aria-label': card.hidden ? 'Show this card again' : 'Hide this card',
    onclick: () => store.setCardFlags(card.id, { hidden: !card.hidden }),
  }, icon(card.hidden ? 'eye' : 'eyeOff', { size: 18 }));
  return h('div', { class: 'lib-actions' }, fav, hide, compact ? null : h('a', { class: 'card-action', href: `#/cards/edit/${card.id}`, 'aria-label': 'Edit this card' }, icon('edit', { size: 18 })));
}

export function CardLibraryView() {
  const root = h('div', { class: 'view view-cards' });
  let filter = 'all';

  function render() {
    const cards = store.cards();
    const shown = cards.filter((c) =>
      filter === 'favourites' ? c.favourite : filter === 'hidden' ? c.hidden : filter === 'yours' ? !c.builtIn : true,
    );
    const counts = { favourites: cards.filter((c) => c.favourite).length, hidden: cards.filter((c) => c.hidden).length };
    root.replaceChildren(
      pageHeader({
        title: 'Card library',
        subtitle: `${plural(cards.length, 'card')}, written for Daybreak around ideas from two books.`,
        back: { href: '#/settings', label: 'Settings' },
        actions: h('a', { class: 'head-btn', href: '#/cards/new' }, icon('plus', { size: 18 }), 'Write'),
      }),
      h(
        'div',
        { class: 'page-body' },
        segmented({ options: FILTERS, value: filter, label: 'Show', onChange: (v) => { filter = v; render(); } }),
        h('p', { class: 'center-note' }, `${counts.favourites} favourites · ${counts.hidden} hidden · Each morning you see one card that fits how you arrived.`),
        shown.length
          ? THEMES.map((theme) => {
              const list = shown.filter((c) => c.theme === theme.id);
              if (!list.length) return null;
              return h(
                'section',
                { class: 'card lib-theme' },
                h('h2', { class: 'card-title' }, theme.label),
                list.map((c) =>
                  h(
                    'article',
                    { class: `lib-card${c.hidden ? ' is-hidden' : ''}` },
                    h('p', { class: 'lib-card-text' }, c.text),
                    h('p', { class: 'lib-card-credit' }, c.credit, c.edited ? ' · edited by you' : ''),
                    cardActions(c),
                  ),
                ),
              );
            })
          : emptyState({ emoji: '🃏', title: 'Nothing here yet', text: filter === 'yours' ? 'Write a card in your own words. It joins the morning draw.' : 'Tap the heart or eye on any card to sort your library.' }),
      ),
    );
  }

  const onChange = () => {
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  };
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}

export function CardEditView({ id = null } = {}) {
  const root = h('div', { class: 'view view-card-edit' });
  const existing = id ? store.card(id) : null;
  const back = { href: '#/cards', label: 'Card library' };
  if (id && !existing) {
    root.append(pageHeader({ title: 'Card', back }), h('div', { class: 'page-body' }, emptyState({ emoji: '🔍', title: 'Card not found', text: 'It may have been deleted.' })));
    return { el: root };
  }
  const draft = { text: existing?.text || '', theme: existing?.theme || 'joy', credit: existing && !existing.builtIn ? (existing.credit === 'Your own card' ? '' : existing.credit) : '' };
  const error = h('p', { class: 'form-error', role: 'alert' });
  const area = h('textarea', { class: 'input textarea', id: 'card-text', rows: '5', maxlength: String(LIMITS.card), placeholder: 'A thought that helps you begin' });
  area.value = draft.text;
  area.addEventListener('input', () => {
    draft.text = area.value;
    error.textContent = '';
  });

  const save = () => {
    if (!draft.text.trim()) {
      error.textContent = 'Write a few words first.';
      return;
    }
    store.saveCard({ id: existing?.id || null, text: draft.text, theme: draft.theme, credit: draft.credit });
    toast(existing ? 'Card saved' : 'Card added to your library', { emoji: '🃏' });
    navigate('#/cards', { replace: true });
  };

  const remove = async () => {
    const builtIn = existing.builtIn;
    const ok = await confirm({
      title: builtIn ? 'Restore the original words?' : 'Delete this card?',
      message: builtIn ? 'Your edit is removed and the card goes back to how it was.' : 'It won’t appear in your mornings any more.',
      confirmLabel: builtIn ? 'Restore' : 'Delete',
      danger: !builtIn,
    });
    if (!ok) return;
    store.deleteCard(existing.id);
    navigate('#/cards', { replace: true });
  };

  root.append(
    pageHeader({ title: existing ? 'Edit card' : 'Write a card', back }),
    h(
      'div',
      { class: 'page-body' },
      h(
        'section',
        { class: 'card form-card' },
        field('Words', area, { id: 'card-text', hint: existing?.builtIn ? 'Make it yours. You can always restore the original.' : 'Short and true works best: one or two sentences.' }),
        existing?.builtIn
          ? h('p', { class: 'field-hint' }, existing.credit)
          : [
              field(
                'Theme',
                h(
                  'select',
                  { class: 'input select select-wide', id: 'card-theme', onchange: (e) => { draft.theme = e.target.value; } },
                  THEMES.map((t) => h('option', { value: t.id, selected: t.id === draft.theme }, t.label)),
                ),
                { id: 'card-theme' },
              ),
              field('Credit (optional)', textInput({ id: 'card-credit', value: draft.credit, placeholder: 'Where the idea came from', maxlength: LIMITS.credit, onInput: (v) => { draft.credit = v; } }), { id: 'card-credit' }),
            ],
      ),
      error,
      h(
        'div',
        { class: 'form-actions' },
        h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: save }, existing ? 'Save card' : 'Add card'),
        existing && (!existing.builtIn || existing.edited)
          ? h('button', { class: 'btn btn-danger-text btn-block', type: 'button', onclick: remove }, existing.builtIn ? 'Restore original' : 'Delete card')
          : null,
      ),
    ),
  );
  return { el: root };
}

export { THEME_IDS };
