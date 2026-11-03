/** Settings: habits, your day, rewards, backup, about. */
import { parseHHMM, toHHMM } from '../core/dates.js';
import { SECTIONS, sectionOf } from '../core/schedule.js';
import { store } from '../data/store.js';
import { navigate } from '../nav.js';
import { isStandalone } from '../platform.js';
import { checkForUpdates, workerStatus } from '../pwa.js';
import { APP_VERSION } from '../version.js';
import { exportBackup, importBackup, undoImport } from './backup.js';
import { describeSchedule, pageHeader, stepper, switchRow } from './components.js';
import { daysAgoText, formatDayShort, formatTime, h } from './dom.js';
import { SECTION_ICONS, SECTION_TITLES, icon } from './icons.js';
import { confirm, toast } from './overlay.js';

export function SettingsView() {
  const root = h('div', { class: 'view view-settings' });
  let archivedOpen = false;
  let focusAfterRender = null;
  let usage = '';
  let workerVersion = '';

  function render() {
    root.replaceChildren(
      pageHeader({ title: 'Settings', subtitle: 'Make Daybreak fit your days.' }),
      h('div', { class: 'page-body' }, habitsCard(), dayCard(), rewardsCard(), backupCard(), aboutCard(), startOverCard()),
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
            message: 'All habits, history, notes and projects on this device will be deleted. If you might want them later, back up first.',
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

  const onChange = () => render();
  store.addEventListener('change', onChange);
  store.addEventListener('storage', onChange);
  render();

  navigator.storage?.estimate?.().then((e) => {
    if (e?.usage) {
      usage = `Using ${(e.usage / 1024).toFixed(0)} KB.`;
      render();
    }
  }).catch(() => {});
  workerStatus().then((s) => {
    if (s?.version) {
      workerVersion = s.version;
      render();
    }
  });

  return {
    el: root,
    destroy() {
      store.removeEventListener('change', onChange);
      store.removeEventListener('storage', onChange);
    },
  };
}
