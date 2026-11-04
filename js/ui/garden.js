/**
 * The evidence garden: every focus session plants something, anything you
 * shipped blooms, and a five-minute rescue start grows a seedling. It shows
 * momentum, not a score. Layout is deterministic, so plants never reshuffle.
 */
import { hashString } from '../core/copy.js';
import { svgEl } from './dom.js';

const PETALS = ['#ff8a3d', '#ffc53d', '#ff5c7a', '#9d7bff', '#3cc3dd', '#f472b6'];

const rand = (seed, n) => ((hashString(`${seed}:${n}`) % 1000) / 1000);

function plant(session, x, baseY, scale, index) {
  const seed = session.id;
  const lean = (rand(seed, 1) - 0.5) * 14 * scale;
  const minutes = session.kind === 'focus' ? session.minutes : 20;
  const height = Math.min(78, (session.rescue ? 16 : 22) + Math.sqrt(minutes) * 5.2) * scale;
  const topX = x + lean;
  const topY = baseY - height;
  const g = svgEl('g', {
    class: `plant${session.shipped ? ' is-bloom' : ''}${session.rescue ? ' is-seedling' : ''}`,
    style: `--d:${(rand(seed, 2) * -6).toFixed(2)}s;--sway:${(1.5 + rand(seed, 3) * 2.5).toFixed(2)}deg;--i:${index}`,
  });
  g.append(
    svgEl('path', {
      class: 'plant-stem',
      d: `M${x.toFixed(1)} ${baseY} Q${(x + lean * 0.2).toFixed(1)} ${(baseY - height * 0.55).toFixed(1)} ${topX.toFixed(1)} ${topY.toFixed(1)}`,
      'stroke-width': (1.6 * scale + 0.4).toFixed(2),
    }),
  );
  const leaves = session.rescue ? 2 : height > 34 * scale ? 2 : 1;
  for (let i = 0; i < leaves; i++) {
    const t = 0.35 + i * 0.25;
    const lx = x + lean * t * 0.6;
    const ly = baseY - height * t;
    const side = (i + Math.round(rand(seed, 4) * 2)) % 2 ? 1 : -1;
    g.append(
      svgEl('ellipse', {
        class: 'plant-leaf',
        cx: (lx + side * 4.5 * scale).toFixed(1),
        cy: ly.toFixed(1),
        rx: (5 * scale).toFixed(1),
        ry: (2.2 * scale).toFixed(1),
        transform: `rotate(${side * -32} ${(lx + side * 4.5 * scale).toFixed(1)} ${ly.toFixed(1)})`,
      }),
    );
  }
  if (session.shipped) {
    const colour = PETALS[hashString(seed) % PETALS.length];
    const r = 4.2 * scale + 1.5;
    for (let p = 0; p < 6; p++) {
      const a = (p / 6) * Math.PI * 2 + rand(seed, 5);
      g.append(
        svgEl('ellipse', {
          class: 'petal',
          cx: (topX + Math.cos(a) * r).toFixed(1),
          cy: (topY + Math.sin(a) * r).toFixed(1),
          rx: (r * 0.75).toFixed(1),
          ry: (r * 0.45).toFixed(1),
          fill: colour,
          transform: `rotate(${((a * 180) / Math.PI).toFixed(0)} ${(topX + Math.cos(a) * r).toFixed(1)} ${(topY + Math.sin(a) * r).toFixed(1)})`,
        }),
      );
    }
    g.append(svgEl('circle', { class: 'flower-heart', cx: topX.toFixed(1), cy: topY.toFixed(1), r: (r * 0.55).toFixed(1) }));
  } else if (!session.rescue) {
    g.append(svgEl('circle', { class: 'bud', cx: topX.toFixed(1), cy: topY.toFixed(1), r: (2.6 * scale + 0.6).toFixed(1) }));
  }
  return g;
}

/**
 * @param {object[]} sessions  focus sessions and shipped entries
 * @param {{ compact?: boolean, label?: string }} options
 */
export function garden(sessions, { compact = false, label = '' } = {}) {
  const list = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const width = 360;
  const perRow = compact ? Math.max(9, list.length) : 12;
  const rows = Math.max(1, Math.ceil(list.length / perRow));
  // An empty patch is just soil and a seed, so it needs little height.
  const rowHeight = !list.length ? 40 : compact ? 104 : 64;
  const top = !list.length ? 8 : compact ? 18 : 30;
  const height = top + rows * rowHeight + 14;
  const svg = svgEl('svg', {
    class: `garden${compact ? ' is-compact' : ''}`,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': label || `A garden of ${list.length} ${list.length === 1 ? 'plant' : 'plants'}`,
  });
  for (let row = 0; row < rows; row++) {
    const y = top + (row + 1) * rowHeight;
    svg.append(svgEl('path', { class: 'garden-ground', d: `M8 ${y + 1} Q${width / 2} ${y - 5} ${width - 8} ${y + 1}` }));
  }
  if (!list.length) {
    const y = top + rowHeight;
    svg.append(
      svgEl('ellipse', { class: 'garden-soil', cx: width / 2, cy: y, rx: 18, ry: 4 }),
      svgEl('circle', { class: 'garden-seed', cx: width / 2, cy: y - 4, r: 3 }),
    );
    return svg;
  }
  const margin = 14;
  const span = (width - margin * 2) / perRow;
  // A short single row sits in the middle rather than hugging the left edge.
  const shift = rows === 1 ? ((perRow - list.length) * span) / 2 : 0;
  list.forEach((session, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    // Older rows sit further back: smaller and softer.
    const depth = rows === 1 ? 1 : 0.68 + 0.32 * (row / (rows - 1));
    const x = margin + shift + (col + 0.5) * span + (rand(session.id, 6) - 0.5) * span * 0.35;
    const baseY = top + (row + 1) * rowHeight;
    const g = plant(session, x, baseY, (compact ? 1.25 : 1) * depth, i);
    if (rows > 1) g.style.opacity = String(0.55 + 0.45 * depth);
    svg.append(g);
  });
  return svg;
}
