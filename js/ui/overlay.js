/** Toasts, dialogs, sheets and celebrations. */
import { h } from './dom.js';
import { confetti } from './fx.js';
import { icon } from './icons.js';

// ------------------------------------------------------------------ toasts

const toastQueue = [];
let toastShowing = false;
let toastWrap = null;

/**
 * toast('Saved') or toast('Habit removed', { action: { label: 'Undo', run } })
 */
export function toast(message, { action = null, duration = 2800, emoji = '' } = {}) {
  toastQueue.push({ message, action, duration, emoji });
  if (!toastShowing) showNextToast();
}

function showNextToast() {
  const next = toastQueue.shift();
  if (!next) {
    toastShowing = false;
    return;
  }
  toastShowing = true;
  if (!toastWrap || !toastWrap.isConnected) {
    toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastWrap);
  }
  let timer;
  const close = () => {
    clearTimeout(timer);
    el.classList.add('leaving');
    setTimeout(() => {
      el.remove();
      showNextToast();
    }, 220);
  };
  const el = h(
    'div',
    { class: 'toast' },
    next.emoji ? h('span', { class: 'toast-emoji', 'aria-hidden': 'true' }, next.emoji) : null,
    h('span', { class: 'toast-text' }, next.message),
    next.action
      ? h('button', {
          class: 'toast-action',
          type: 'button',
          onclick: () => {
            next.action.run();
            close();
          },
        }, next.action.label)
      : null,
  );
  toastWrap.append(el);
  timer = setTimeout(close, next.duration);
}

// ----------------------------------------------------------------- dialogs

let openCount = 0;
function lockScroll(on) {
  openCount += on ? 1 : -1;
  document.documentElement.classList.toggle('overlay-open', openCount > 0);
}

/**
 * A centred dialog with buttons. Resolves with the chosen button's value.
 * buttons: [{ label, value, kind: 'primary' | 'danger' | 'plain' }]
 */
export function dialog({ title, message, buttons, emoji = '' }) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const backdrop = h('div', { class: 'dialog-backdrop' });
    const done = (value) => {
      backdrop.classList.remove('open');
      backdrop.classList.add('leaving');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        backdrop.remove();
        lockScroll(false);
        previousFocus?.focus?.({ preventScroll: true });
      }, 200);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') done(null);
    };
    const box = h(
      'div',
      { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' },
      emoji ? h('div', { class: 'dialog-emoji', 'aria-hidden': 'true' }, emoji) : null,
      h('h2', { class: 'dialog-title', id: 'dialog-title' }, title),
      message ? h('div', { class: 'dialog-message' }, message) : null,
      h(
        'div',
        { class: 'dialog-buttons' },
        buttons.map((b) =>
          h('button', { class: `btn btn-${b.kind || 'plain'}`, type: 'button', onclick: () => done(b.value) }, b.label),
        ),
      ),
    );
    backdrop.append(box);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) done(null);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    lockScroll(true);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    box.querySelector('.btn-primary, .btn-danger, .btn')?.focus({ preventScroll: true });
  });
}

export async function confirm({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, emoji = '' }) {
  const value = await dialog({
    title,
    message,
    emoji,
    buttons: [
      { label: cancelLabel, value: false, kind: 'plain' },
      { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' },
    ],
  });
  return value === true;
}

// ------------------------------------------------------------------ sheets

/** A bottom sheet for read-only content. Returns { close }. */
export function sheet({ title, content }) {
  const previousFocus = document.activeElement;
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const close = () => {
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      panel.remove();
      backdrop.remove();
      lockScroll(false);
      previousFocus?.focus?.({ preventScroll: true });
    }, 280);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'sheet-head' },
      h('h2', { class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon('x')),
    ),
    h('div', { class: 'sheet-body' }, content),
  );
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop, panel);
  lockScroll(true);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.classList.add('open');
  });
  panel.querySelector('.icon-btn')?.focus({ preventScroll: true });
  return { close };
}

// ------------------------------------------------------------ celebrations

let celebrating = false;

/** A short, joyful overlay. Tap anywhere (or wait) to dismiss. */
export function celebrate({ emoji, title, message, detail = '', duration = 3200 }) {
  if (celebrating) {
    toast(title, { emoji });
    return;
  }
  celebrating = true;
  confetti();
  const overlay = h(
    'div',
    { class: 'celebrate', role: 'status', 'aria-live': 'assertive' },
    h(
      'div',
      { class: 'celebrate-card' },
      h('div', { class: 'celebrate-emoji', 'aria-hidden': 'true' }, emoji),
      h('h2', { class: 'celebrate-title' }, title),
      h('p', { class: 'celebrate-message' }, message),
      detail ? h('p', { class: 'celebrate-detail' }, detail) : null,
    ),
  );
  let timer;
  const close = () => {
    clearTimeout(timer);
    overlay.classList.add('leaving');
    setTimeout(() => {
      overlay.remove();
      celebrating = false;
    }, 260);
  };
  overlay.addEventListener('click', close);
  document.body.append(overlay);
  timer = setTimeout(close, duration);
}
