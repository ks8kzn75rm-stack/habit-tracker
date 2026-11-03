/** Weekly review: the week's scores, streaks, and where to focus next. */
import { addDays, startOfWeek } from '../core/dates.js';
import { isWeekly, sectionOf } from '../core/schedule.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { emptyState, pageHeader } from './components.js';
import { formatDayShort, formatNumber, formatRange, formatWeekday, h, plural } from './dom.js';
import { icon } from './icons.js';
import { badgeGrid, levelCard, openProgress } from './progress.js';
import { EDIT_WINDOW_DAYS } from './today.js';

export function ReviewView({ weekStart: requested = null } = {}) {
  const root = h('div', { class: 'view view-review' });

  function render() {
    const today = store.todayKey();
    const ws = store.settings.weekStartsOn;
    const currentWeek = startOfWeek(today, ws);
    const firstWeek = startOfWeek(store.meta.firstDay || today, ws);
    let weekStart = requested ? startOfWeek(requested, ws) : currentWeek;
    if (weekStart > currentWeek) weekStart = currentWeek;
    if (weekStart < firstWeek) weekStart = firstWeek;
    const review = store.review(weekStart, today);
    const label = weekStart === currentWeek ? 'This week' : weekStart === addDays(currentWeek, -7) ? 'Last week' : 'Week of';

    const go = (delta) => navigate(`#/review/${addDays(weekStart, delta * 7)}`, { replace: true });
    const nav = h(
      'div',
      { class: 'week-nav' },
      h('button', { class: 'icon-btn on-hero', type: 'button', 'aria-label': 'Previous week', disabled: weekStart <= firstWeek, onclick: () => go(-1) }, icon('chevronLeft')),
      h('button', { class: 'icon-btn on-hero', type: 'button', 'aria-label': 'Next week', disabled: weekStart >= currentWeek, onclick: () => go(1) }, icon('chevronRight')),
    );

    root.replaceChildren(
      pageHeader({ title: 'Weekly review', subtitle: `${label} · ${formatRange(weekStart, addDays(weekStart, 6))}`, actions: nav }),
      h(
        'div',
        { class: 'page-body' },
        summary(review),
        chart(review, today),
        review.hasData ? null : emptyState({ emoji: '🌱', title: 'A fresh week', text: 'Tick a few habits and this page fills up with your progress.' }),
        focusCard(review, weekStart === currentWeek, today),
        strongestCard(review),
        weeklyGoals(review),
        streaksCard(today),
        notesCard(review),
        progressCard(),
      ),
    );
  }

  function summary(review) {
    return h(
      'div',
      { class: 'tiles' },
      tile('star', formatNumber(review.total), 'points'),
      tile('sun', review.morningWins, plural(review.morningWins, 'Morning Win').replace(/^\d+ /, '')),
      tile('check', review.completions, 'habits done'),
    );
  }

  function tile(iconName, value, label) {
    return h('div', { class: 'tile' }, h('span', { class: 'tile-icon' }, icon(iconName, { size: 18 })), h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));
  }

  function chart(review, today) {
    const max = Math.max(60, ...review.days.map((d) => d.points));
    const editableFrom = addDays(today, -EDIT_WINDOW_DAYS);
    const best = review.bestDay;
    const cols = review.days.map((day, i) => {
      const pct = day.future ? 0 : Math.max(day.points ? 4 : 0, Math.round((day.points / max) * 100));
      const editable = !day.future && day.key >= editableFrom;
      const href = day.isToday ? '#/today' : `#/day/${day.key}`;
      const content = [
        h('span', { class: 'bar-value' }, day.future ? '' : String(day.points)),
        h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: { '--h': `${pct}%`, '--i': i } }, day.morningWin ? h('span', { class: 'bar-sun', title: 'Morning Win' }) : null)),
        h('span', { class: 'bar-label' }, formatWeekday(day.key, 'narrow')),
      ];
      const cls = `bar-col${day.isToday ? ' is-today' : ''}${day.future ? ' is-future' : ''}`;
      return editable
        ? h('a', {
            class: cls,
            href,
            'aria-label': `${formatDayShort(day.key)}: ${day.points} points${day.morningWin ? ', Morning Win' : ''}. Open this day`,
            onclick: (e) => {
              e.preventDefault();
              navigate(href);
            },
          }, content)
        : h('div', { class: cls, 'aria-label': `${formatDayShort(day.key)}: ${day.points} points` }, content);
    });
    return h(
      'section',
      { class: 'card chart-card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Daily points'), best ? h('span', { class: 'card-aside' }, `Best: ${formatWeekday(best.key)}`) : null),
      h('div', { class: 'chart' }, cols),
      h('p', { class: 'chart-legend' }, h('span', { class: 'legend-sun', 'aria-hidden': 'true' }), 'Morning Win', h('span', { class: 'legend-sep' }, '·'), 'Tap a recent day to edit it'),
    );
  }

  function rateRow(item) {
    return h(
      'li',
      { class: 'rate-row', 'data-section': sectionOf(item.habit) },
      h('div', { class: 'rate-top' }, h('span', { class: 'rate-name' }, item.habit.name), h('span', { class: 'rate-count' }, `${item.done}/${item.due}`)),
      h('span', { class: 'rate-track' }, h('span', { class: 'rate-bar', style: { width: `${Math.round(item.rate * 100)}%` } })),
    );
  }

  function strongestCard(review) {
    if (!review.strongest.length) return null;
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Going strong'), h('span', { class: 'card-aside' }, 'Keep these rolling')),
      h('ul', { class: 'rate-list' }, review.strongest.map(rateRow)),
    );
  }

  function focusCard(review, isCurrent, today) {
    const firstDay = store.meta.firstDay || today;
    const elapsed = review.days.filter((d) => !d.future && !d.isToday && d.key >= firstDay).length;
    let content;
    if (!review.rates.length || (isCurrent && elapsed === 0 && !review.focus.length)) {
      content = h('p', { class: 'card-text' }, 'Log a couple of days and you’ll see gentle suggestions here.');
    } else if (!review.focus.length) {
      content = h('p', { class: 'card-text' }, 'Everything is ticking along nicely. Keep doing what you’re doing, or try a new small challenge.');
    } else {
      content = h(
        'ul',
        { class: 'focus-list' },
        review.focus.map((item) =>
          h(
            'li',
            { class: 'focus-item', 'data-section': sectionOf(item.habit) },
            h('div', { class: 'rate-top' }, h('span', { class: 'rate-name' }, item.habit.name), h('span', { class: 'rate-count' }, `${item.done} of ${item.due} days`)),
            h('p', { class: 'focus-tip' }, icon('bulb', { size: 16 }), item.tip),
          ),
        ),
      );
    }
    return h(
      'section',
      { class: 'card focus-card' },
      h('div', { class: 'card-head card-head-stack' }, h('h2', { class: 'card-title' }, 'Where to focus next'), h('p', { class: 'card-sub' }, isCurrent ? 'Small tweaks make a big difference.' : 'Ideas to carry into the next week.')),
      content,
    );
  }

  function weeklyGoals(review) {
    if (!review.weekly.length) return null;
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Weekly goals')),
      h(
        'ul',
        { class: 'goal-list' },
        review.weekly.map((g) =>
          h(
            'li',
            { class: `goal-row${g.met ? ' is-met' : ''}` },
            h('span', { class: 'goal-name' }, g.habit.name),
            h('span', { class: 'dots' }, Array.from({ length: g.target }, (_, i) => h('span', { class: i < g.count ? 'dot on' : 'dot' }))),
            h('span', { class: 'goal-count' }, g.met ? `${g.count}/${g.target} ✓` : `${g.count}/${g.target}`),
          ),
        ),
      ),
    );
  }

  function streaksCard(today) {
    const showing = store.showingUp(today, { withBest: true });
    const wins = store.morningWins(today);
    const habitStreaks = store
      .currentHabits()
      .map((habit) => ({ habit, s: store.habitStreak(habit, today, { withBest: true }) }))
      .filter((x) => x.s.current >= 2 || x.s.best >= 3)
      .sort((a, b) => b.s.current - a.s.current || b.s.best - a.s.best)
      .slice(0, 4);
    const line = (label, current, best, unit = 'day') =>
      h(
        'li',
        { class: 'streak-row' },
        h('span', { class: 'streak-icon' }, icon('flame', { size: 18 })),
        h('span', { class: 'streak-name' }, label),
        h('span', { class: 'streak-values' }, h('b', {}, plural(current, unit)), h('span', { class: 'streak-best' }, `best ${best}`)),
      );
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Streaks')),
      h(
        'ul',
        { class: 'streak-list' },
        line('Showing up', showing.current, showing.best),
        line('Morning Wins', wins.current, wins.best),
        habitStreaks.map(({ habit, s }) => line(habit.name, s.current, s.best, isWeekly(habit) ? 'week' : 'day')),
      ),
      h('p', { class: 'card-note' }, icon('shield', { size: 15 }), 'Streaks are forgiving: one missed day each week is covered by a grace day. Weekly goals forgive a single missed week.'),
    );
  }

  function notesCard(review) {
    if (!review.notes.length) return null;
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Your notes')),
      h('ul', { class: 'notes-list' }, review.notes.map((n) => h('li', {}, h('span', { class: 'note-day' }, formatWeekday(n.key, 'short')), h('span', { class: 'note-text' }, n.note)))),
    );
  }

  function progressCard() {
    const badges = store.badges();
    const earned = badges.filter((b) => b.earnedOn);
    return h(
      'section',
      { class: 'card' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Level & badges'), h('button', { class: 'text-btn', type: 'button', onclick: openProgress }, 'See all')),
      levelCard(),
      earned.length
        ? badgeGrid(earned.slice(-6).reverse())
        : h('p', { class: 'card-text' }, 'Your first badge is one tick away.'),
    );
  }

  const onChange = () => render();
  store.addEventListener('change', onChange);
  render();
  return {
    el: root,
    destroy() {
      store.removeEventListener('change', onChange);
    },
  };
}
