/** Little moments of delight: bursts, floating points, confetti, haptics. */
import { store } from '../data/store.js';
import { h, prefersReducedMotion } from './dom.js';

let layer = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
    document.body.append(layer);
  }
  return layer;
}

const colourOf = (el) => getComputedStyle(el).getPropertyValue('--c').trim() || '#e8590c';

/** A ring of dots bursting out of an element. */
export function burst(el, colour = colourOf(el)) {
  if (prefersReducedMotion() || !el?.isConnected) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const distance = 24 + Math.random() * 16;
    const dot = h('span', {
      class: 'fx-dot',
      style: {
        left: `${cx}px`,
        top: `${cy}px`,
        background: colour,
        '--dx': `${(Math.cos(angle) * distance).toFixed(1)}px`,
        '--dy': `${(Math.sin(angle) * distance).toFixed(1)}px`,
        '--s': (0.6 + Math.random() * 0.6).toFixed(2),
      },
    });
    dot.addEventListener('animationend', () => dot.remove(), { once: true });
    fxLayer().append(dot);
  }
}

/** "+10" floating up from an element. */
export function floatText(el, text, colour = colourOf(el)) {
  if (prefersReducedMotion() || !el?.isConnected) return;
  const rect = el.getBoundingClientRect();
  const label = h('span', {
    class: 'fx-float',
    style: { left: `${rect.left + rect.width / 2}px`, top: `${rect.top}px`, color: colour },
  }, text);
  label.addEventListener('animationend', () => label.remove(), { once: true });
  fxLayer().append(label);
}

/** Animate a number from its current value to `to`. */
export function countUp(el, to, duration = 550) {
  const from = Number(el.dataset.value ?? el.textContent) || 0;
  el.dataset.value = String(to);
  if (from === to || prefersReducedMotion()) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1 && el.dataset.value === String(to)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const CONFETTI_COLOURS = ['#ff8a3d', '#ffc53d', '#ff5c7a', '#3cc3dd', '#9d7bff', '#34d399'];

/** Full-screen confetti from a canvas; removes itself when done. */
export function confetti({ count = 110, duration = 2200, colours = CONFETTI_COLOURS } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = h('canvas', { class: 'fx-confetti', 'aria-hidden': 'true' });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);
  const pieces = Array.from({ length: count }, () => ({
    x: width / 2 + (Math.random() - 0.5) * width * 0.3,
    y: height * 0.35 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 11,
    vy: -6 - Math.random() * 9,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    colour: colours[Math.floor(Math.random() * colours.length)],
    round: Math.random() < 0.3,
  }));
  const start = performance.now();
  let last = start;
  const frame = (now) => {
    const dt = Math.min(2.5, (now - last) / 16.7);
    last = now;
    const t = (now - start) / duration;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = t > 0.7 ? Math.max(0, 1 - (t - 0.7) / 0.3) : 1;
    for (const p of pieces) {
      p.vy += 0.32 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.colour;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < 1) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

let hapticLabel = null;
/**
 * A light tap of haptic feedback. Uses navigator.vibrate where available; on
 * iPhone (iOS 18+) toggling a native switch control gives a system haptic.
 */
export function haptic() {
  if (!store.settings.haptics) return;
  if (navigator.vibrate) {
    navigator.vibrate(12);
    return;
  }
  try {
    if (!hapticLabel || !hapticLabel.isConnected) {
      const input = h('input', { type: 'checkbox', switch: true, tabindex: '-1', 'aria-hidden': 'true' });
      hapticLabel = h('label', { class: 'haptic-proxy', 'aria-hidden': 'true' }, input);
      document.body.append(hapticLabel);
    }
    hapticLabel.click();
  } catch {
    // no haptics available
  }
}
