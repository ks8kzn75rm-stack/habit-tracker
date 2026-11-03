/** DOM helpers and locale-aware formatting. */
import { addDays, parseKey } from '../core/dates.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'defs', 'linearGradient', 'stop']);
const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'indeterminate']);

/**
 * h('button', { class: 'btn', onclick }, 'Label', childNode, [more], null)
 * Text children always become text nodes (never parsed as HTML).
 */
export function h(tag, props, ...children) {
  const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.setAttribute('class', value);
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, v] of Object.entries(value)) if (v !== null && v !== undefined) el.style.setProperty(prop, String(v));
      } else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'ref') value(el);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (PROPS.has(key)) el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false || child === true) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

/** A circular progress ring. Update with setRing(el, ratio). */
export function ring(size, stroke, ratio = 0, className = 'ring') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = svgEl('svg', { class: className, viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' });
  svg.append(
    svgEl('circle', { class: `${className}-track`, cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke }),
    svgEl('circle', {
      class: `${className}-bar`,
      cx: size / 2,
      cy: size / 2,
      r,
      fill: 'none',
      'stroke-width': stroke,
      'stroke-linecap': 'round',
      'stroke-dasharray': c.toFixed(2),
      'stroke-dashoffset': (c * (1 - clamp01(ratio))).toFixed(2),
      transform: `rotate(-90 ${size / 2} ${size / 2})`,
    }),
  );
  svg.dataset.circumference = String(c);
  return svg;
}

export function setRing(svg, ratio) {
  const c = Number(svg.dataset.circumference);
  const bar = svg.lastElementChild;
  const offset = (c * (1 - clamp01(ratio))).toFixed(2);
  if (bar.getAttribute('stroke-dashoffset') !== offset) bar.setAttribute('stroke-dashoffset', offset);
  svg.classList.toggle('is-full', ratio >= 1);
}

export const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));

export const prefersReducedMotion = () =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ------------------------------------------------------------- formatting

const formatters = new Map();
function fmt(options) {
  const id = JSON.stringify(options);
  if (!formatters.has(id)) formatters.set(id, new Intl.DateTimeFormat(undefined, options));
  return formatters.get(id);
}

/** Midday on the key's date, so formatting is never affected by DST. */
export function dateOfKey(key) {
  const { y, m, d } = parseKey(key);
  return new Date(y, m - 1, d, 12);
}

export const formatTime = (minutes) =>
  fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
export const formatDayLong = (key) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(dateOfKey(key));
export const formatDayShort = (key) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(dateOfKey(key));
export const formatDayMonth = (key) => fmt({ day: 'numeric', month: 'short' }).format(dateOfKey(key));
export const formatWeekday = (key, style = 'long') => fmt({ weekday: style }).format(dateOfKey(key));
export const formatDayNumber = (key) => String(parseKey(key).d);

/** Weekday name for 0 = Sunday … 6 = Saturday. */
export const weekdayName = (index, style = 'short') => formatWeekday(addDays('2026-11-01', index), style);

export function formatRange(fromKey, toKey) {
  return `${formatDayMonth(fromKey)} – ${formatDayMonth(toKey)}`;
}

export function relativeDay(key, today) {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return formatDayShort(key);
}

export function daysAgoText(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const formatNumber = (n) => new Intl.NumberFormat().format(n);
