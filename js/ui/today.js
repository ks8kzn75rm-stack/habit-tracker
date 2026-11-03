/**
 * The Today screen (also used to edit the last few days).
 *
 * Built once, then patched in place on every change so that animations
 * (ring, check marks, counters) run smoothly instead of being re-rendered.
 */
import { greeting, heroMessage, phaseFor } from '../core/copy.js';
import { addDays, minutesIntoDay } from '../core/dates.js';
import { formatRemaining, morningWindowStatus } from '../core/morning-window.js';
import { SECTIONS, isWeekly, sectionOf } from '../core/schedule.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { isIOS, isStandalone } from '../platform.js';
import { exportBackup } from './backup.js';
import { emptyState } from './components.js';
import {
  formatDayLong,
  formatDayNumber,
  formatTime,
  formatWeekday,
  h,
  relativeDay,
  ring,
  setRing,
} from './dom.js';
import { burst, countUp, floatText, haptic } from './fx.js';
import { SECTION_ICONS, SECTION_TITLES, icon } from './icons.js';
import { celebrate, toast } from './overlay.js';
import { openProgress } from './progress.js';

/** Today plus this many previous days can be edited. */
export const EDIT_WINDOW_DAYS = 6;

export function shouldShowInstallHint() {
  return isIOS() && !isStandalone() && !store.meta.installHintDismissed;
}

export function TodayView({ dayKey = null } = {}) {
  const root = h('div', { class: 'view view-today' });
  let signature = '';
  let refs = null;

  const viewKey = () => {
    const today = store.todayKey();
    if (!dayKey || dayKey >= today || dayKey < addDays(today, -EDIT_WINDOW_DAYS)) return today;
    return dayKey;
  };

  function noticeFlags(key, today) {
    const flags = [];
    if (store.memoryOnly || store.storageError) flags.push('storage');
    if (shouldShowInstallHint()) flags.push('install');
    const reminder = key === today ? store.backupReminder() : null;
    if (reminder) flags.push(`backup:${reminder.days}`);
    return flags;
  }

  function computeSignature() {
    const key = viewKey();
    const today = store.todayKey();
    const sections = store.sections(key);
    const habits = SECTIONS.map((s) =>
      sections[s].map((x) => `${x.id}:${x.name}:${x.points}:${x.lightsOut}:${x.windowCountdown}`).join(','),
    ).join('|');
    const s = store.settings;
    const phase = phaseFor(minutesIntoDay(new Date()));
    return [key, today, phase, habits, s.lightsOut, s.windowEnd, s.morningWinBonus, store.meta.firstDay, noticeFlags(key, today)].join('#');
  }

  // ------------------------------------------------------------------ build

  function build() {
    const key = viewKey();
    const today = store.todayKey();
    const isToday = key === today;
    refs = { key, today, isToday, rows: new Map(), sections: new Map() };

    const body = h('div', { class: 'today-body' });
    body.append(...buildNotices(key, today));
    if (!isToday) body.append(buildPastBanner(key, today));
    if (isToday) {
      const windowCard = buildWindowCard(key);
      if (windowCard) body.append(windowCard);
    }
    body.append(...buildSections(key), buildNote(key, isToday), buildFooter());

    root.replaceChildren(buildHero(key, isToday), buildStrip(key, today), body);
    signature = computeSignature();
    patch(false);
  }

  function buildHero(key, isToday) {
    refs.ring = ring(132, 12, 0, 'hero-ring');
    refs.points = h('span', { class: 'hero-points' }, '0');
    refs.doneStat = h('span');
    refs.streakStat = h('span');
    refs.weekStat = h('span');
    refs.message = h('p', { class: 'hero-message' });
    refs.levelChip = h('button', { class: 'level-chip', type: 'button', onclick: openProgress });
    const minutes = minutesIntoDay(new Date());
    return h(
      'header',
      { class: 'hero' },
      h(
        'div',
        { class: 'hero-inner' },
        h(
          'div',
          { class: 'hero-top' },
          h(
            'div',
            { class: 'hero-heading' },
            h('p', { class: 'hero-kicker' }, isToday ? greeting(minutes) : 'Catching up'),
            h('h1', { class: 'hero-title' }, formatDayLong(key)),
          ),
          refs.levelChip,
        ),
        h(
          'div',
          { class: 'hero-main' },
          h(
            'div',
            { class: 'hero-ring-wrap' },
            refs.ring,
            h('div', { class: 'hero-ring-center' }, refs.points, h('span', { class: 'hero-points-label' }, 'points')),
          ),
          h(
            'div',
            { class: 'hero-stats' },
            h('div', { class: 'hero-stat' }, icon('check', { size: 18 }), refs.doneStat),
            h('div', { class: 'hero-stat' }, icon('flame', { size: 18 }), refs.streakStat),
            h('div', { class: 'hero-stat' }, icon('chart', { size: 18 }), refs.weekStat),
          ),
        ),
        refs.message,
      ),
    );
  }

  function buildStrip(key, today) {
    const firstDay = store.meta.firstDay || today;
    refs.strip = [];
    const nav = h('nav', { class: 'strip', 'aria-label': 'Recent days' });
    for (let i = EDIT_WINDOW_DAYS; i >= 0; i--) {
      const k = addDays(today, -i);
      const href = i === 0 ? '#/today' : `#/day/${k}`;
      const disabled = k < firstDay;
      const dayRing = ring(36, 3.5, 0, 'strip-ring');
      const content = [
        h('span', { class: 'strip-wd' }, i === 0 ? 'Today' : formatWeekday(k, 'short')),
        h('span', { class: 'strip-ring-wrap' }, dayRing, h('span', { class: 'strip-num' }, formatDayNumber(k))),
        h('span', { class: 'strip-sun', 'aria-hidden': 'true' }),
      ];
      const el = disabled
        ? h('span', { class: 'strip-day is-disabled', 'aria-hidden': 'true' }, content)
        : h('a', {
            class: 'strip-day',
            href,
            'aria-current': k === key ? 'date' : null,
            'aria-label': relativeDay(k, today),
            onclick: (e) => {
              e.preventDefault();
              navigate(href, { replace: true });
            },
          }, content);
      refs.strip.push({ key: k, el, ring: dayRing, disabled });
      nav.append(el);
    }
    return nav;
  }

  function buildNotices(key, today) {
    return noticeFlags(key, today).map((flag) => {
      if (flag === 'storage') {
        return h(
          'section',
          { class: 'notice notice-warn', role: 'alert' },
          h('span', { class: 'notice-icon' }, icon('info')),
          h(
            'div',
            { class: 'notice-body' },
            h('h3', {}, 'Changes may not be saved'),
            h('p', {}, 'This browser isn’t letting Daybreak store data right now. Try closing and reopening the app. Your backup in Settings is a good safety net.'),
          ),
        );
      }
      if (flag === 'install') {
        return h(
          'section',
          { class: 'notice notice-install' },
          h('span', { class: 'notice-icon' }, icon('share')),
          h(
            'div',
            { class: 'notice-body' },
            h('h3', {}, 'Add Daybreak to your Home Screen'),
            h('p', {}, 'In Safari, tap Share, then “Add to Home Screen”. Do it before you start logging: the Home Screen app keeps its own data, separate from Safari.'),
            h('div', { class: 'notice-actions' }, h('button', { class: 'btn btn-small', type: 'button', onclick: () => store.updateMeta({ installHintDismissed: true }) }, 'Got it')),
          ),
        );
      }
      const reminder = store.backupReminder();
      return h(
        'section',
        { class: 'notice notice-backup' },
        h('span', { class: 'notice-icon' }, icon('save')),
        h(
          'div',
          { class: 'notice-body' },
          h('h3', {}, 'Time for a quick backup?'),
          h('p', {}, `It’s been ${reminder.days} days since ${reminder.neverBackedUp ? 'you started' : 'your last backup'}. Save a copy to Files in a couple of taps, just in case.`),
          h(
            'div',
            { class: 'notice-actions' },
            h('button', { class: 'btn btn-small btn-primary', type: 'button', onclick: () => exportBackup() }, 'Back up now'),
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => store.snoozeBackupReminder() }, 'Not now'),
          ),
        ),
      );
    });
  }

  function buildPastBanner(key, today) {
    return h(
      'div',
      { class: 'past-banner' },
      icon('edit', { size: 18 }),
      h('span', { class: 'past-text' }, 'Editing ', h('b', {}, relativeDay(key, today)), '. Changes update your streaks.'),
      h('a', {
        class: 'past-link',
        href: '#/today',
        onclick: (e) => {
          e.preventDefault();
          navigate('#/today', { replace: true });
        },
      }, 'Today'),
    );
  }

  function windowHabitFor(key) {
    const sections = store.sections(key);
    return [...sections.morning, ...sections.daytime, ...sections.evening].find((x) => x.windowCountdown) || null;
  }

  function buildWindowCard(key) {
    const habit = windowHabitFor(key);
    if (!habit) return null;
    refs.windowHabit = habit;
    refs.windowTitle = h('span', { class: 'window-title' });
    refs.windowSub = h('span', { class: 'window-sub' });
    refs.windowCard = h(
      'section',
      { class: 'window-card', 'data-section': sectionOf(habit) },
      h('span', { class: 'window-icon' }, icon('clock', { size: 20 }), h('span', { class: 'window-pulse' })),
      h('div', { class: 'window-text' }, refs.windowTitle, refs.windowSub),
    );
    return refs.windowCard;
  }

  function buildSections(key) {
    const sections = store.sections(key);
    const out = [];
    for (const section of SECTIONS) {
      const list = sections[section];
      if (!list.length) continue;
      const count = h('span', { class: 'section-count' });
      const badge =
        section === 'morning'
          ? h('span', { class: 'mw-badge', title: 'Finish every morning habit for a bonus' },
              icon('sun', { size: 14 }), 'Morning Win', h('b', {}, `+${store.settings.morningWinBonus}`))
          : null;
      const listEl = h('div', { class: 'habit-list' });
      for (const habit of list) {
        const row = habitRow(habit);
        refs.rows.set(habit.id, row);
        listEl.append(row.el);
      }
      refs.sections.set(section, { count, badge, habits: list });
      out.push(
        h(
          'section',
          { class: 'section', 'data-section': section, 'aria-labelledby': `section-${section}` },
          h(
            'div',
            { class: 'section-head' },
            h('span', { class: 'section-icon' }, icon(SECTION_ICONS[section], { size: 18 })),
            h('h2', { class: 'section-title', id: `section-${section}` }, SECTION_TITLES[section]),
            badge,
            count,
          ),
          listEl,
        ),
      );
    }
    if (!out.length) {
      out.push(
        emptyState({
          emoji: '🌤️',
          title: refs.isToday ? 'Nothing scheduled today' : 'Nothing to log for this day',
          text: refs.isToday ? 'Enjoy the breathing room, or add a habit in Settings.' : 'Habits added later don’t appear on earlier days.',
          actions: [h('a', { class: 'btn', href: '#/settings' }, 'Edit habits')],
        }),
      );
    }
    return out;
  }

  function habitRow(habit) {
    const check = h('span', { class: 'check', 'aria-hidden': 'true' }, icon('check', { size: 18 }));
    const meta = h('span', { class: 'habit-meta' });
    const pts = h('span', { class: 'habit-pts' }, `+${habit.points}`);
    const el = h(
      'button',
      {
        class: 'habit',
        type: 'button',
        'data-section': sectionOf(habit),
        'data-id': habit.id,
        'aria-pressed': 'false',
        onclick: () => onToggle(habit.id),
      },
      check,
      h('span', { class: 'habit-body' }, h('span', { class: 'habit-name' }, habit.name), meta),
      pts,
    );
    return { el, check, meta, pts, habit };
  }

  function buildNote(key, isToday) {
    const input = h('input', {
      class: 'input note-input',
      id: 'day-note',
      type: 'text',
      maxlength: '280',
      placeholder: 'One line is plenty…',
      autocomplete: 'off',
      autocapitalize: 'sentences',
      enterkeyhint: 'done',
      value: store.note(key),
    });
    const saved = h('span', { class: 'note-saved', 'aria-live': 'polite' });
    let timer = null;
    const save = () => {
      clearTimeout(timer);
      timer = null;
      const before = store.note(key);
      store.setNote(key, input.value);
      if (store.note(key) !== before) {
        saved.textContent = 'Saved';
        saved.classList.remove('show');
        void saved.offsetWidth;
        saved.classList.add('show');
      }
    };
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(save, 700);
    });
    input.addEventListener('change', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    });
    refs.flushNote = () => {
      if (timer) save();
    };
    return h(
      'section',
      { class: 'card note-card' },
      h('label', { class: 'note-label', for: 'day-note' }, icon('edit', { size: 16 }), isToday ? 'How was today?' : `How was ${formatWeekday(key)}?`),
      h('div', { class: 'note-field' }, input, saved),
    );
  }

  function buildFooter() {
    return h('div', { class: 'today-footer' }, h('a', { class: 'link-btn', href: '#/settings' }, icon('sliders', { size: 18 }), 'Edit habits'));
  }

  // ------------------------------------------------------------------ patch

  function patch(animate = true) {
    patchHero(animate);
    patchStrip();
    patchRows();
    patchWindow();
  }

  function patchHero(animate) {
    const { key, isToday } = refs;
    const stats = store.dayStats(key);
    setRing(refs.ring, stats.ratio);
    if (animate) countUp(refs.points, stats.points);
    else {
      refs.points.textContent = String(stats.points);
      refs.points.dataset.value = String(stats.points);
    }
    refs.doneStat.replaceChildren(
      ...(stats.dueCount ? [h('b', {}, stats.doneCount), ` of ${stats.dueCount} done`] : ['Nothing due']),
    );
    const streak = store.showingUp();
    refs.streakStat.replaceChildren(
      ...(streak.current ? [h('b', {}, streak.current), `-day streak`] : ['Start a streak today']),
    );
    refs.weekStat.replaceChildren(h('b', {}, store.weekPoints(key)), ' pts this week');
    const level = store.level();
    refs.levelChip.setAttribute('aria-label', `Level ${level.level}, ${level.title}. See your badges`);
    refs.levelChip.replaceChildren(
      h('span', { class: 'level-num' }, `Lv ${level.level}`),
      h('span', { class: 'level-title' }, level.title),
      h('span', { class: 'level-bar' }, h('span', { style: { width: `${Math.round(level.progress * 100)}%` } })),
    );
    refs.message.textContent = heroMessage({
      stats,
      isToday,
      phase: phaseFor(minutesIntoDay(new Date())),
      seed: `${key}:${stats.doneCount}`,
    });
  }

  function patchStrip() {
    for (const day of refs.strip) {
      if (day.disabled) continue;
      const s = store.dayStats(day.key);
      setRing(day.ring, s.ratio);
      day.el.classList.toggle('has-win', s.morningWin);
      day.el.classList.toggle('has-any', s.completions > 0);
    }
  }

  function patchRows() {
    const { key } = refs;
    const today = store.todayKey();
    for (const row of refs.rows.values()) {
      const done = store.isDone(key, row.habit.id);
      row.el.classList.toggle('is-done', done);
      row.el.setAttribute('aria-pressed', String(done));
      if (isWeekly(row.habit)) row.el.classList.toggle('is-met', store.weeklyProgress(row.habit, key).met);
      row.meta.replaceChildren(...metaFor(row.habit, key, today));
    }
    const stats = store.dayStats(key);
    for (const [section, s] of refs.sections) {
      const done =
        section === 'weekly'
          ? s.habits.filter((x) => store.weeklyProgress(x, key).met).length
          : s.habits.filter((x) => store.isDone(key, x.id)).length;
      s.count.textContent = `${done}/${s.habits.length}`;
      if (s.badge) s.badge.classList.toggle('is-won', stats.morningWin);
    }
  }

  function metaFor(habit, key, today) {
    const parts = [];
    const streak = store.habitStreak(habit, today);
    if (isWeekly(habit)) {
      const p = store.weeklyProgress(habit, key);
      parts.push(
        h(
          'span',
          { class: 'meta-item meta-progress' },
          h('span', { class: 'dots', 'aria-hidden': 'true' }, Array.from({ length: p.target }, (_, i) => h('span', { class: i < p.count ? 'dot on' : 'dot' }))),
          p.met ? `${p.count}/${p.target} · goal met` : `${p.count}/${p.target} this week`,
        ),
      );
      if (streak.current >= 2) parts.push(metaItem('flame', `${streak.current} weeks`, 'meta-streak'));
      return parts;
    }
    if (streak.current >= 2) {
      const label = habit.schedule.type === 'days' ? `${streak.current} in a row` : `${streak.current} days`;
      parts.push(metaItem('flame', label, 'meta-streak'));
    }
    if (streak.graceUsedThisWeek && streak.current >= 1) parts.push(metaItem('shield', 'grace day used', 'meta-grace'));
    if (habit.windowCountdown) parts.push(metaItem('clock', `By ${formatTime(store.settings.windowEnd)}`));
    if (habit.lightsOut) parts.push(metaItem('moon', `Target ${formatTime(store.settings.lightsOut)}`));
    return parts;
  }

  function metaItem(iconName, text, className = '') {
    return h('span', { class: `meta-item ${className}`.trim() }, icon(iconName, { size: 13 }), text);
  }

  function patchWindow() {
    if (!refs.windowCard) return;
    const { key } = refs;
    const habit = refs.windowHabit;
    const status = morningWindowStatus({
      now: new Date(),
      dayKey: key,
      dayStart: store.settings.dayStart,
      windowEnd: store.settings.windowEnd,
      doneAt: store.doneAt(key, habit.id),
    });
    const end = formatTime(store.settings.windowEnd);
    refs.windowCard.dataset.state = status.state;
    if (status.state === 'open') {
      refs.windowTitle.textContent = `Morning window · ${formatRemaining(status.remainingMs)} left`;
      refs.windowSub.textContent = `${habit.name} · window ends at ${end}`;
    } else if (status.state === 'done') {
      refs.windowTitle.textContent = status.beatWindow ? 'Done inside the morning window!' : `${habit.name}: done`;
      refs.windowSub.textContent = status.beatWindow ? 'Brilliant start. The rest of the day is a bonus.' : 'Great work getting it in.';
    } else {
      refs.windowTitle.textContent = 'The morning window has closed';
      refs.windowSub.textContent = 'Moving later still counts. Any movement today is a win.';
    }
  }

  // ---------------------------------------------------------------- actions

  function onToggle(habitId) {
    const result = store.toggleHabit(refs.key, habitId);
    if (!result) return;
    const row = refs.rows.get(habitId);
    if (result.done && row) {
      row.el.classList.remove('pop');
      void row.el.offsetWidth;
      row.el.classList.add('pop');
      burst(row.check);
      floatText(row.pts, `+${result.habit.points}`);
      haptic();
    }
    if (result.perfect) {
      celebrate({
        emoji: '🎉',
        title: 'Full house!',
        message: 'Every habit done today. Take a moment to enjoy that.',
        detail: result.morningWin ? `Including a Morning Win: +${store.settings.morningWinBonus} bonus` : '',
      });
    } else if (result.morningWin) {
      celebrate({
        emoji: '☀️',
        title: 'Morning Win!',
        message: 'Every morning habit done. You’ve set the tone for the whole day.',
        detail: `+${store.settings.morningWinBonus} bonus points`,
      });
    }
    if (result.weeklyGoalMet) toast(`Weekly goal met: ${result.habit.name}`, { emoji: '💪' });
    if (result.levelUp) toast(`Level ${result.levelUp.level} reached: ${result.levelUp.title}`, { emoji: '✨' });
  }

  // -------------------------------------------------------------- lifecycle

  function update() {
    if (computeSignature() !== signature) build();
    else patch(true);
  }

  const onChange = () => update();
  store.addEventListener('change', onChange);
  store.addEventListener('storage', onChange);
  const timer = setInterval(() => {
    if (document.visibilityState === 'visible') update();
  }, 20000);
  const onVisible = () => {
    if (document.visibilityState === 'visible') update();
    // Leaving the app (or locking the phone): save a half-typed note now.
    else refs?.flushNote?.();
  };
  const onPageHide = () => refs?.flushNote?.();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', onPageHide);

  build();

  return {
    el: root,
    update,
    destroy() {
      refs?.flushNote?.();
      clearInterval(timer);
      store.removeEventListener('change', onChange);
      store.removeEventListener('storage', onChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onPageHide);
    },
  };
}
