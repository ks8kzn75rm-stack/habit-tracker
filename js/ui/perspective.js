/**
 * Perspective (opt-in): your life in weeks, and the weeks left in this season.
 * Framed as appreciation, never as an alarm.
 */
import { formatDayLong, formatNumber, h, svgEl } from './dom.js';
import { WEEKS_PER_ROW, lifeInWeeks, seasonPhrase, seasonWeeks } from '../core/perspective.js';
import { store } from '../data/store.js';
import { pageHeader } from './components.js';
import { icon } from './icons.js';

const CELL = 5;
const GAP = 1.5;
const LEFT = 18;

export function lifeGrid(life) {
  const step = CELL + GAP;
  const width = LEFT + WEEKS_PER_ROW * step;
  const height = life.rows * step + 4;
  const svg = svgEl('svg', {
    class: 'life-grid',
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': `Week ${formatNumber(life.currentIndex + 1)} of about ${formatNumber(life.total)}`,
  });
  for (let row = 0; row < life.rows; row += 10) {
    if (row === 0) continue;
    const label = svgEl('text', { class: 'life-label', x: 0, y: row * step + CELL });
    label.textContent = String(row);
    svg.append(label);
  }
  for (let i = 0; i < life.total; i++) {
    const row = Math.floor(i / WEEKS_PER_ROW);
    const col = i % WEEKS_PER_ROW;
    const cls = i < life.currentIndex ? 'lived' : i === life.currentIndex ? 'now' : 'ahead';
    svg.append(svgEl('rect', { class: `life-week ${cls}`, x: LEFT + col * step, y: row * step, width: CELL, height: CELL, rx: 1.2 }));
  }
  // A soft halo so this week is easy to find among thousands.
  const nowRow = Math.floor(life.currentIndex / WEEKS_PER_ROW);
  const nowCol = life.currentIndex % WEEKS_PER_ROW;
  svg.append(svgEl('circle', { class: 'life-now-halo', cx: LEFT + nowCol * step + CELL / 2, cy: nowRow * step + CELL / 2, r: CELL }));
  return svg;
}

export function PerspectiveView() {
  const root = h('div', { class: 'view view-perspective' });

  function render() {
    const s = store.settings;
    const today = store.todayKey();
    const life = s.lifeWeeksEnabled ? lifeInWeeks(s.birthDate, today) : null;
    const season = s.seasonEnabled && s.seasonEnd ? seasonWeeks(today, s.seasonEnd) : null;
    root.replaceChildren(
      pageHeader({ title: 'Perspective', subtitle: 'Not a countdown. A reminder that this week is a gift.', back: { href: '#/foundations', label: 'Foundations' } }),
      h(
        'div',
        { class: 'page-body' },
        season
          ? h(
              'section',
              { class: 'card season-card' },
              h('p', { class: 'season-kicker' }, icon('mountain', { size: 16 }), s.seasonLabel || 'This season'),
              h('h2', { class: 'season-weeks' }, seasonPhrase(season)),
              season.ended ? null : h('p', { class: 'card-text' }, `Until ${formatDayLong(s.seasonEnd)}. Plenty of room for meaningful work, one week at a time.`),
              store.foundations.opportunity ? h('p', { class: 'season-statement' }, store.foundations.opportunity) : h('a', { class: 'text-link', href: '#/foundations/season' }, 'Write what this season is an opportunity for'),
            )
          : invite('This season', 'Choose an end date for this chapter, and see how many weeks it has to make count.'),
        life
          ? h(
              'section',
              { class: 'card life-card' },
              h('h2', { class: 'card-title' }, 'Your life in weeks'),
              h('p', { class: 'card-text' }, `This is week ${formatNumber(life.currentIndex + 1)} of about ${formatNumber(life.total)}. Each one is a fresh chance to spend on what matters to you.`),
              lifeGrid(life),
              h('p', { class: 'card-note' }, icon('heart', { size: 15 }), 'A life is a few thousand weeks. That’s not a reason to rush; it’s what makes this one worth savouring.'),
            )
          : invite('Life in weeks', 'See a life of roughly four thousand weeks, with this one glowing. Add your birth date to turn it on.'),
      ),
    );
  }

  function invite(title, text) {
    return h(
      'section',
      { class: 'card' },
      h('h2', { class: 'card-title' }, title),
      h('p', { class: 'card-text' }, text),
      h('a', { class: 'btn btn-block', href: '#/settings' }, 'Turn it on in Settings'),
    );
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  return { el: root, destroy: () => store.removeEventListener('change', onChange) };
}
