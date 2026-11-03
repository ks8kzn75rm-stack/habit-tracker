/** Level and badges. */
import { store } from '../data/store.js';
import { formatDayMonth, formatNumber, h, ring } from './dom.js';
import { sheet } from './overlay.js';

export function levelCard(level = store.level()) {
  return h(
    'div',
    { class: 'level-card' },
    h('div', { class: 'level-ring-wrap' }, ring(84, 8, level.progress, 'level-ring'), h('span', { class: 'level-ring-num' }, level.level)),
    h(
      'div',
      { class: 'level-card-text' },
      h('p', { class: 'level-card-kicker' }, `Level ${level.level}`),
      h('h3', { class: 'level-card-title' }, level.title),
      h('p', { class: 'level-card-sub' }, `${formatNumber(level.xp)} points so far · ${formatNumber(level.toNext)} to level ${level.level + 1}`),
    ),
  );
}

export function badgeGrid(badges = store.badges()) {
  return h(
    'div',
    { class: 'badge-grid' },
    badges.map((badge) =>
      h(
        'div',
        { class: `badge ${badge.earnedOn ? 'is-earned' : 'is-locked'}` },
        h('span', { class: 'badge-emoji', 'aria-hidden': 'true' }, badge.emoji),
        h('span', { class: 'badge-title' }, badge.title),
        h('span', { class: 'badge-desc' }, badge.earnedOn ? `Earned ${formatDayMonth(badge.earnedOn)}` : badge.desc),
      ),
    ),
  );
}

export function openProgress() {
  const badges = store.badges();
  const earned = badges.filter((b) => b.earnedOn).length;
  sheet({
    title: 'Your progress',
    content: h(
      'div',
      { class: 'progress-sheet' },
      levelCard(),
      h('p', { class: 'progress-note' }, 'Every habit you tick earns points, and Morning Wins and finished projects add bonuses. Points never go down for a missed day.'),
      h('h3', { class: 'sheet-subtitle' }, `Badges · ${earned} of ${badges.length}`),
      badgeGrid(badges),
    ),
  });
}
