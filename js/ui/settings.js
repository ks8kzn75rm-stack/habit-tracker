/** Settings: habits, Begin & focus, your day, rewards, perspective, inbox, backup, about. */
import { parseHHMM, toHHMM } from '../core/dates.js';
import { formatMinutes } from '../core/focus.js';
import { LIMITS } from '../core/model.js';
import { SECTIONS, sectionOf } from '../core/schedule.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { isStandalone } from '../platform.js';
import { checkForUpdates, workerStatus } from '../pwa.js';
import { APP_VERSION } from '../version.js';
import { exportBackup, importBackup, undoImport } from './backup.js';
import { describeSchedule, pageHeader, stepper, switchRow } from './components.js';
import { daysAgoText, formatDayShort, formatTime, h, plural } from './dom.js';
import { SECTION_ICONS, SECTION_TITLES, icon } from './icons.js';
import { confirm, sheet, toast } from './overlay.js';

/** Copy text to the clipboard, with an older fallback. Resolves true on success. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the older way.
  }
  try {
    const area = h('textarea', { class: 'copy-buffer', readonly: true, 'aria-hidden': 'true' });
    area.value = text;
    document.body.append(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function inboxText(items, now = new Date()) {
  const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(now);
  const lines = items.map((item) => `- ${item.text.replace(/\n/g, '\n  ')}`);
  return `Daybreak ideas (${date})\n\n${lines.join('\n')}\n`;
}

export function SettingsView() {
  const root = h('div', { class: 'view view-settings' });
  let archivedOpen = false;
  let focusAfterRender = null;
  let usage = '';
  let workerVersion = '';
  let ideaDraft = '';
  let deferred = false;

  function render() {
    deferred = false;
    root.replaceChildren(
      pageHeader({ title: 'Settings', subtitle: 'Make Daybreak fit your days.' }),
      h(
        'div',
        { class: 'page-body' },
        habitsCard(),
        beginCard(),
        dayCard(),
        rewardsCard(),
        perspectiveCard(),
        inboxCard(),
        backupCard(),
        aboutCard(),
        startOverCard(),
      ),
    );
    if (focusAfterRender) {
      // Keep focus on the arrow that was used, or its partner once it hits the end.
      const { id, dir } = focusAfterRender;
      const target = root.querySelector(`[data-move="${id}:${dir}"]`);
      const other = root.querySelector(`[data-move="${id}:${dir === 'up' ? 'down' : 'up'}"]`);
      (target && !target.disabled ? target : other)?.focus({ preventScroll: true });
      focusAfterRender = null;
    }
  }

  // ------------------------------------------------------------------ habits

  function habitsCard() {
    const ws = store.settings.weekStartsOn;
    const current = store.currentHabits();
    const archived = store.archivedHabits();
    const groups = SECTIONS.map((section) => [section, current.filter((x) => sectionOf(x) === section)]).filter(([, list]) => list.length);

    const move = (habit, dir) => {
      focusAfterRender = { id: habit.id, dir: dir < 0 ? 'up' : 'down' };
      store.moveHabit(habit.id, dir);
    };

    return h(
      'section',
      { class: 'card settings-card', id: 'habits' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Habits'), h('a', { class: 'text-btn', href: '#/settings/habit/new' }, icon('plus', { size: 16 }), 'Add')),
      groups.length ? null : h('p', { class: 'card-text' }, 'No habits yet. Add your first one below.'),
      groups.map(([section, list]) =>
        h(
          'div',
          { class: 'manage-group', 'data-section': section },
          h('h3', { class: 'group-title' }, icon(SECTION_ICONS[section], { size: 16 }), SECTION_TITLES[section]),
          h(
            'ul',
            { class: 'manage-list' },
            list.map((habit, i) =>
              h(
                'li',
                { class: 'manage-row' },
                h(
                  'a',
                  { class: 'manage-main', href: `#/settings/habit/${habit.id}` },
                  h('span', { class: 'manage-name' }, habit.name),
                  h('span', { class: 'manage-meta' }, `${describeSchedule(habit.schedule, ws)} · ${habit.points} pts`),
                ),
                h(
                  'div',
                  { class: 'manage-order' },
                  h('button', { class: 'icon-btn', type: 'button', 'data-move': `${habit.id}:up`, 'aria-label': `Move “${habit.name}” up`, disabled: i === 0, onclick: () => move(habit, -1) }, icon('chevronUp', { size: 20 })),
                  h('button', { class: 'icon-btn', type: 'button', 'data-move': `${habit.id}:down`, 'aria-label': `Move “${habit.name}” down`, disabled: i === list.length - 1, onclick: () => move(habit, 1) }, icon('chevronDown', { size: 20 })),
                ),
              ),
            ),
          ),
        ),
      ),
      h('a', { class: 'btn btn-block', href: '#/settings/habit/new' }, icon('plus', { size: 18 }), 'Add a habit'),
      archived.length
        ? h(
            'details',
            { class: 'archived', open: archivedOpen, ontoggle: (e) => { archivedOpen = e.target.open; } },
            h('summary', {}, `Removed habits (${archived.length})`),
            h(
              'ul',
              { class: 'manage-list' },
              archived.map((habit) =>
                h(
                  'li',
                  { class: 'manage-row' },
                  h('span', { class: 'manage-main' }, h('span', { class: 'manage-name' }, habit.name), h('span', { class: 'manage-meta' }, `Removed ${formatDayShort(habit.archivedDay)}`)),
                  h('button', {
                    class: 'btn btn-small',
                    type: 'button',
                    onclick: () => {
                      store.restoreHabit(habit.id);
                      toast(`“${habit.name}” is back`, { emoji: '🌱' });
                    },
                  }, 'Restore'),
                ),
              ),
            ),
          )
        : null,
    );
  }

  // ---------------------------------------------------------------- your day

  function settingRow(label, control, hint = '', id = '') {
    return h(
      'div',
      { class: 'setting-row' },
      h('div', { class: 'setting-text' }, id ? h('label', { class: 'setting-label', for: id }, label) : h('span', { class: 'setting-label' }, label), hint ? h('span', { class: 'setting-hint' }, hint) : null),
      control,
    );
  }

  function timeInput(id, minutes, onChange) {
    return h('input', {
      class: 'input input-time',
      id,
      type: 'time',
      value: toHHMM(minutes),
      onchange: (e) => {
        const value = parseHHMM(e.target.value);
        if (value === null) e.target.value = toHHMM(minutes);
        else onChange(value);
      },
    });
  }

  function select(id, options, value, onChange) {
    return h(
      'select',
      { class: 'input select', id, onchange: (e) => onChange(e.target.value) },
      options.map((o) => h('option', { value: String(o.value), selected: String(o.value) === String(value) }, o.label)),
    );
  }

  function dayCard() {
    const s = store.settings;
    const dayStarts = Array.from({ length: 13 }, (_, i) => ({ value: i * 30, label: formatTime(i * 30) }));
    return h(
      'section',
      { class: 'card settings-card' },
      h('h2', { class: 'card-title' }, 'Your day'),
      settingRow('Day starts at', select('day-start', dayStarts, s.dayStart, (v) => store.updateSettings({ dayStart: Number(v) })), 'Check-ins before this time count towards the previous day.', 'day-start'),
      settingRow('Morning window ends', timeInput('window-end', s.windowEnd, (v) => store.updateSettings({ windowEnd: v })), 'The countdown shown for habits like “Gym by 10am”.', 'window-end'),
      settingRow('Lights-out target', timeInput('lights-out', s.lightsOut, (v) => store.updateSettings({ lightsOut: v })), 'Shown on your lights-out habit.', 'lights-out'),
      settingRow('Week starts on', select('week-start', [{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }], s.weekStartsOn, (v) => store.updateSettings({ weekStartsOn: Number(v) })), '', 'week-start'),
    );
  }

  function rewardsCard() {
    return h(
      'section',
      { class: 'card settings-card' },
      h('h2', { class: 'card-title' }, 'Rewards'),
      settingRow(
        'Morning Win bonus',
        stepper({ value: store.settings.morningWinBonus, min: 0, max: 100, step: 5, label: 'bonus points', format: (n) => `${n} pts`, onChange: (n) => store.updateSettings({ morningWinBonus: n }) }),
        'Extra points when every morning habit is done.',
      ),
      switchRow({ label: 'Haptic feedback', description: 'A gentle tap when you tick something off (where supported).', checked: store.settings.haptics, onChange: (on) => store.updateSettings({ haptics: on }) }),
    );
  }

  // ----------------------------------------------------------- Begin & focus

  function linkRow(href, iconName, label, hint = '') {
    return h(
      'a',
      { class: 'link-row', href },
      h('span', { class: 'link-row-icon' }, icon(iconName, { size: 18 })),
      h('span', { class: 'link-row-text' }, h('span', { class: 'link-row-label' }, label), hint ? h('span', { class: 'link-row-hint' }, hint) : null),
      icon('chevronRight', { size: 18 }),
    );
  }

  function beginCard() {
    const s = store.settings;
    return h(
      'section',
      { class: 'card settings-card', id: 'begin' },
      h('h2', { class: 'card-title' }, 'Begin & focus'),
      switchRow({
        label: 'Morning Begin ritual',
        description: 'About a minute, the first time you open Daybreak each day (not after 6pm). Skip it any time.',
        checked: s.ritualEnabled,
        onChange: (on) => store.updateSettings({ ritualEnabled: on }),
      }),
      settingRow(
        'Breathing',
        select('breath-seconds', [30, 45, 60].map((n) => ({ value: n, label: `${n} sec` })), s.breathSeconds, (v) => store.updateSettings({ breathSeconds: Number(v) })),
        'The optional centring step in the ritual.',
        'breath-seconds',
      ),
      settingRow(
        'Usual focus session',
        stepper({ value: s.focusMinutes, min: 5, max: 180, step: 5, label: 'focus minutes', format: (n) => `${n} min`, onChange: (n) => store.updateSettings({ focusMinutes: n }) }),
        'Where the timer starts.',
      ),
      settingRow(
        'Deep-work session',
        stepper({ value: s.deepWorkMinutes, min: 15, max: 240, step: 15, label: 'deep-work minutes', format: formatMinutes, onChange: (n) => store.updateSettings({ deepWorkMinutes: n }) }),
        'A session this long ticks your deep-work habit.',
      ),
      h(
        'div',
        { class: 'link-rows' },
        linkRow('#/foundations', 'compass', 'Foundations', 'Your why, letter, joys, this season and your projects'),
        linkRow('#/cards', 'cards', 'Card library', `${plural(store.cards().length, 'card')} · favourite, hide, edit or write your own`),
        linkRow('#/evidence', 'sprout', 'Proof you show up', 'Every focus session, and everything you’ve shipped'),
      ),
    );
  }

  // ------------------------------------------------------------- perspective

  function dateInput(id, value, { min = null, max = null, onChange }) {
    return h('input', {
      class: 'input input-date',
      id,
      type: 'date',
      value: value || '',
      min,
      max,
      onchange: (e) => onChange(e.target.value || null),
    });
  }

  function perspectiveCard() {
    const s = store.settings;
    const today = store.todayKey();
    let label = s.seasonLabel;
    const labelInput = h('input', {
      class: 'input input-short',
      id: 'season-label',
      type: 'text',
      value: label,
      placeholder: 'This season',
      maxlength: String(LIMITS.seasonLabel),
      autocomplete: 'off',
      enterkeyhint: 'done',
      oninput: (e) => {
        label = e.target.value;
      },
      onchange: () => store.updateSettings({ seasonLabel: label }),
    });
    labelInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        labelInput.blur();
      }
    });
    return h(
      'section',
      { class: 'card settings-card', id: 'perspective' },
      h('h2', { class: 'card-title' }, 'Perspective'),
      h('p', { class: 'card-text' }, 'Two optional views of time, framed as appreciation rather than pressure. Both stay off until you turn them on.'),
      switchRow({
        label: 'Life in weeks',
        description: 'A grid of a long life in weeks, with this one glowing.',
        checked: s.lifeWeeksEnabled,
        onChange: (on) => store.updateSettings({ lifeWeeksEnabled: on }),
      }),
      s.lifeWeeksEnabled
        ? settingRow('Birth date', dateInput('birth-date', s.birthDate, { min: '1900-01-01', max: today, onChange: (v) => store.updateSettings({ birthDate: v }) }), 'Stays on this device.', 'birth-date')
        : null,
      switchRow({
        label: 'This season',
        description: 'Choose when this chapter ends and see how many weeks it has to make count.',
        checked: s.seasonEnabled,
        onChange: (on) => store.updateSettings({ seasonEnabled: on }),
      }),
      s.seasonEnabled
        ? [
            settingRow('Season ends', dateInput('season-end', s.seasonEnd, { min: today, onChange: (v) => store.updateSettings({ seasonEnd: v }) }), '', 'season-end'),
            settingRow('Name it', labelInput, 'Optional, e.g. “Writing season”.', 'season-label'),
          ]
        : null,
      s.lifeWeeksEnabled || s.seasonEnabled ? h('div', { class: 'link-rows' }, linkRow('#/perspective', 'grid', 'Open Perspective')) : null,
    );
  }

  // ------------------------------------------------------------------ inbox

  function inboxCard() {
    const items = store.inbox;
    const area = h('textarea', {
      class: 'input textarea',
      id: 'inbox-new',
      rows: '3',
      maxlength: String(LIMITS.inbox),
      placeholder: 'An idea, a wish, something that bugged you…',
      'aria-label': 'New idea',
      oninput: (e) => {
        ideaDraft = e.target.value;
      },
    });
    area.value = ideaDraft;
    const add = () => {
      if (!ideaDraft.trim()) {
        area.focus();
        return;
      }
      const text = ideaDraft;
      ideaDraft = '';
      area.value = '';
      store.addIdea(text);
      toast('Saved to your inbox', { emoji: '💡' });
    };
    const copyAll = async () => {
      const text = inboxText(items);
      if (await copyText(text)) {
        toast(`Copied ${plural(items.length, 'idea')}`, { emoji: '📋' });
        return;
      }
      // Couldn't reach the clipboard: show the text so it can be copied by hand.
      const box = h('textarea', { class: 'input textarea copy-box', rows: '10', readonly: true, 'aria-label': 'Your ideas' });
      box.value = text;
      sheet({ title: 'Your ideas', content: [h('p', { class: 'card-text' }, 'Select all, then copy.'), box] });
      requestAnimationFrame(() => box.select());
    };
    const clearAll = async () => {
      const ok = await confirm({ title: 'Clear the inbox?', message: `${plural(items.length, 'idea')} will be deleted. Copy them first if you want to keep them.`, confirmLabel: 'Clear', danger: true });
      if (ok) for (const item of items) store.removeIdea(item.id);
    };
    return h(
      'section',
      { class: 'card settings-card', id: 'inbox' },
      h('div', { class: 'card-head' }, h('h2', { class: 'card-title' }, 'Improvement inbox'), items.length ? h('span', { class: 'card-aside' }, plural(items.length, 'idea')) : null),
      h('p', { class: 'card-text' }, 'Notice something that could make Daybreak better for you? Drop it here, then copy them all out whenever you like.'),
      area,
      h('div', { class: 'button-row' }, h('button', { class: 'btn', type: 'button', onclick: add }, icon('plus', { size: 18 }), 'Add idea')),
      items.length
        ? h(
            'ul',
            { class: 'inbox-list' },
            [...items].reverse().map((item) =>
              h(
                'li',
                { class: 'inbox-item' },
                h('span', { class: 'inbox-text' }, item.text),
                h('button', {
                  class: 'icon-btn',
                  type: 'button',
                  'aria-label': 'Delete this idea',
                  onclick: () => {
                    store.removeIdea(item.id);
                    toast('Idea deleted', { action: { label: 'Undo', run: () => store.restoreIdea(item) } });
                  },
                }, icon('x', { size: 18 })),
              ),
            ),
          )
        : null,
      items.length
        ? h(
            'div',
            { class: 'button-row' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: copyAll }, icon('copy', { size: 18 }), 'Copy all'),
            h('button', { class: 'btn btn-danger-text', type: 'button', onclick: clearAll }, 'Clear all'),
          )
        : null,
    );
  }

  // ------------------------------------------------------------------ backup

  function backupCard() {
    const last = store.meta.lastExportAt;
    const days = store.daysSinceBackup();
    const persistence = {
      granted: 'Storage is persistent: your browser won’t clear it to free up space.',
      denied: 'Your browser may clear data when space runs low, so keep regular backups.',
      unsupported: 'Keep regular backups: they’re your safety net.',
      unknown: 'Checking storage…',
    }[store.persistence];
    return h(
      'section',
      { class: 'card settings-card', id: 'backup' },
      h('h2', { class: 'card-title' }, 'Backup & data'),
      h('p', { class: 'backup-status' }, icon(last ? 'check' : 'info', { size: 18 }), last ? `Last backup ${daysAgoText(days)}` : 'No backup yet'),
      h(
        'div',
        { class: 'button-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => exportBackup() }, icon('share', { size: 18 }), 'Back up now'),
        h('button', { class: 'btn', type: 'button', onclick: () => importBackup() }, icon('upload', { size: 18 }), 'Restore'),
      ),
      h('p', { class: 'card-note' }, 'On iPhone, “Back up now” opens the share sheet: choose “Save to Files”. To restore, pick that file with “Restore”.'),
      store.preImport
        ? h('button', { class: 'text-btn', type: 'button', onclick: () => undoImport() }, icon('undo', { size: 16 }), 'Undo last restore')
        : null,
      h('p', { class: 'card-note' }, icon('shield', { size: 15 }), `Everything stays on this device. Nothing is sent anywhere. ${persistence}${usage ? ` ${usage}` : ''}`),
    );
  }

  // ------------------------------------------------------------------- about

  function aboutCard() {
    const status = h('span', { class: 'about-status' });
    const check = async (button) => {
      button.disabled = true;
      status.textContent = 'Checking…';
      const result = await checkForUpdates({ force: true });
      button.disabled = false;
      status.textContent = {
        update: 'A new version is ready: tap the banner to refresh.',
        latest: 'You’re on the latest version.',
        offline: 'Couldn’t check right now. Are you offline?',
        unsupported: 'Updates load automatically in this browser.',
      }[result] || '';
    };
    return h(
      'section',
      { class: 'card settings-card' },
      h('h2', { class: 'card-title' }, 'About'),
      h('p', { class: 'about-version' }, h('b', {}, `Daybreak ${APP_VERSION}`), workerVersion ? ` · offline copy ${workerVersion}` : ''),
      h(
        'div',
        { class: 'button-row' },
        h('button', { class: 'btn', type: 'button', onclick: (e) => check(e.currentTarget) }, icon('refresh', { size: 18 }), 'Check for updates'),
        h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, 'Reload app'),
      ),
      status,
      isStandalone()
        ? null
        : h('p', { class: 'card-note' }, icon('share', { size: 15 }), 'Install on iPhone: open this page in Safari, tap Share, then “Add to Home Screen”. Install before logging: the Home Screen app keeps its own data.'),
    );
  }

  function startOverCard() {
    return h(
      'section',
      { class: 'card settings-card' },
      h('h2', { class: 'card-title' }, 'Start over'),
      h('p', { class: 'card-text' }, 'Erase everything on this device and begin again with the starter habits.'),
      h('button', {
        class: 'btn btn-danger-text',
        type: 'button',
        onclick: async () => {
          const ok = await confirm({
            title: 'Erase all data?',
            message: 'All habits, history, notes, projects, foundations, focus sessions and cards on this device will be deleted. If you might want them later, back up first.',
            confirmLabel: 'Erase everything',
            danger: true,
          });
          if (!ok) return;
          await store.eraseEverything();
          toast('Fresh start. Welcome back!', { emoji: '🌅' });
          navigate('#/today', { replace: true });
        },
      }, icon('trash', { size: 18 }), 'Erase all data'),
    );
  }

  // --------------------------------------------------------------- lifecycle

  // Don't rebuild the page under a field that's being edited (it would close
  // an open date picker or drop a half-typed idea); catch up once it's left.
  const isEditing = () => {
    const el = document.activeElement;
    return Boolean(el && root.contains(el) && el.matches('input:not([type=checkbox]), textarea, select'));
  };
  const refresh = () => {
    if (isEditing()) deferred = true;
    else render();
  };
  // The short wait lets a tap that caused the blur (say, on a switch) land first.
  const onFocusOut = () => {
    if (!deferred) return;
    setTimeout(() => {
      if (deferred && !isEditing()) render();
    }, 250);
  };
  root.addEventListener('focusout', onFocusOut);
  store.addEventListener('change', refresh);
  store.addEventListener('storage', refresh);
  render();

  navigator.storage?.estimate?.().then((e) => {
    if (e?.usage) {
      usage = `Using ${(e.usage / 1024).toFixed(0)} KB.`;
      refresh();
    }
  }).catch(() => {});
  workerStatus().then((s) => {
    if (s?.version) {
      workerVersion = s.version;
      refresh();
    }
  });

  return {
    el: root,
    destroy() {
      store.removeEventListener('change', refresh);
      store.removeEventListener('storage', refresh);
    },
  };
}
