/**
 * App state.
 *
 * Everything lives in memory and changes synchronously, so taps feel instant.
 * Each change is then written to IndexedDB through a serial queue. Views listen
 * for the 'change' event and read derived values (memoised per change).
 */
import { BADGES, badgeStats, earnedBadgeIds } from '../core/badges.js';
import { backupReminder, buildBackup, parseBackup } from '../core/backup.js';
import { diffDays, logicalDayKey, startOfWeek, weekKeys } from '../core/dates.js';
import { createDefaultHabits } from '../core/defaults.js';
import {
  LIMITS,
  cleanText,
  normalizeDay,
  normalizeHabit,
  normalizeMeta,
  normalizeProject,
  normalizeSettings,
  uid,
} from '../core/model.js';
import { weekReview } from '../core/review.js';
import { isWeekly, sectionOf, sectionsForDay, sortHabits, weeklyProgress } from '../core/schedule.js';
import { dayStats, levelInfo, totalPoints } from '../core/scoring.js';
import { habitStreak, morningWinStreak, showingUpStreak } from '../core/stats.js';
import { APP_VERSION } from '../version.js';
import * as db from './db.js';

const cloneDay = (record, date) =>
  record ? { ...record, done: { ...record.done } } : { date, done: {}, note: '' };

class Store extends EventTarget {
  habits = [];
  days = new Map();
  projects = [];
  settings = normalizeSettings();
  meta = normalizeMeta();
  /** { savedAt } when a pre-import safety copy exists */
  preImport = null;
  version = 0;
  ready = false;
  memoryOnly = false;
  storageError = null;
  persistence = 'unknown';

  #memo = new Map();
  #queue = Promise.resolve();
  #badgeTimer = null;

  // ------------------------------------------------------------------ setup

  async init() {
    try {
      const data = await db.loadAll();
      this.#hydrate(data);
      if (!this.meta.initialized) await this.#initialise();
    } catch (err) {
      console.error('Storage unavailable', err);
      this.storageError = err;
      this.memoryOnly = true;
      if (!this.meta.initialized) this.#seedMemory();
    }
    this.ready = true;
    this.#checkBadges({ silent: true });
    this.#changed();
    this.#requestPersistence();
  }

  #hydrate({ habits = [], days = [], projects = [], kv = [] }) {
    this.habits = habits.map(normalizeHabit).filter(Boolean);
    this.days = new Map(
      days
        .map(normalizeDay)
        .filter(Boolean)
        .map((d) => [d.date, d]),
    );
    this.projects = projects.map(normalizeProject).filter(Boolean);
    const values = new Map(kv.map((row) => [row.key, row.value]));
    this.settings = normalizeSettings(values.get('settings'));
    this.meta = normalizeMeta(values.get('meta'));
    const pre = values.get('preImport');
    this.preImport = pre?.savedAt ? { savedAt: pre.savedAt } : null;
  }

  #seedMemory() {
    const today = this.todayKey();
    this.habits = createDefaultHabits(today);
    this.days = new Map();
    this.projects = [];
    this.meta = normalizeMeta({ initialized: true, installedAt: Date.now(), firstDay: today });
  }

  async #initialise() {
    if (this.habits.length || this.days.size) {
      // Data without meta (shouldn't happen): repair meta, never wipe data.
      const keys = [...this.days.keys(), ...this.habits.map((h) => h.createdDay).filter(Boolean)].sort();
      this.meta = normalizeMeta({ ...this.meta, initialized: true, installedAt: Date.now(), firstDay: keys[0] || this.todayKey() });
      await db.put('kv', { key: 'meta', value: this.meta });
      return;
    }
    this.#seedMemory();
    await db.replaceAll({
      habits: this.habits,
      days: [],
      projects: [],
      kv: [
        { key: 'settings', value: this.settings },
        { key: 'meta', value: this.meta },
      ],
    });
  }

  async #requestPersistence() {
    const storage = globalThis.navigator?.storage;
    try {
      if (storage?.persisted && (await storage.persisted())) this.persistence = 'granted';
      else if (storage?.persist) this.persistence = (await storage.persist()) ? 'granted' : 'denied';
      else this.persistence = 'unsupported';
    } catch {
      this.persistence = 'unsupported';
    }
    this.dispatchEvent(new Event('storage'));
  }

  // ---------------------------------------------------------------- plumbing

  /** `seed` can pre-fill derived values that are cheaper to update than recount. */
  #changed(seed = null) {
    this.version++;
    this.#memo.clear();
    seed?.();
    this.dispatchEvent(new Event('change'));
  }

  #memoize(key, compute) {
    if (!this.#memo.has(key)) this.#memo.set(key, compute());
    return this.#memo.get(key);
  }

  #write(task) {
    if (this.memoryOnly) return Promise.resolve();
    const run = this.#queue.then(task).then(
      () => {
        if (this.storageError) {
          this.storageError = null;
          this.dispatchEvent(new Event('storage'));
        }
      },
      (err) => {
        console.error('Could not save', err);
        this.storageError = err;
        this.dispatchEvent(new Event('storage'));
      },
    );
    this.#queue = run;
    return run;
  }

  /** Resolves once every pending write has finished. */
  flush() {
    return this.#queue;
  }

  #saveDay(record) {
    if (!Object.keys(record.done).length && !record.note) {
      this.days.delete(record.date);
      this.#write(() => db.remove('days', record.date));
    } else {
      this.days.set(record.date, record);
      const copy = cloneDay(record);
      this.#write(() => db.put('days', copy));
    }
  }

  #saveHabits(habits) {
    const copies = habits.map((h) => ({ ...h, schedule: structuredClone(h.schedule) }));
    this.#write(() => db.putMany('habits', copies));
  }

  #saveProject(project) {
    const copy = structuredClone(project);
    this.#write(() => db.put('projects', copy));
  }

  #saveMeta() {
    const copy = structuredClone(this.meta);
    this.#write(() => db.put('kv', { key: 'meta', value: copy }));
  }

  // ----------------------------------------------------------------- reading

  todayKey(date = new Date()) {
    return logicalDayKey(date, this.settings.dayStart);
  }

  isDone(key, habitId) {
    return Boolean(this.days.get(key)?.done?.[habitId]);
  }

  doneAt(key, habitId) {
    return this.days.get(key)?.done?.[habitId] || null;
  }

  note(key) {
    return this.days.get(key)?.note || '';
  }

  habit(id) {
    return this.habits.find((h) => h.id === id) || null;
  }

  /** Habits that haven't been removed, in display order. */
  currentHabits() {
    return sortHabits(this.habits.filter((h) => !h.archivedDay));
  }

  archivedHabits() {
    return sortHabits(this.habits.filter((h) => h.archivedDay));
  }

  ctx(today = this.todayKey()) {
    return {
      habits: this.habits,
      days: this.days,
      projects: this.projects,
      settings: this.settings,
      meta: this.meta,
      today,
    };
  }

  sections(key) {
    return this.#memoize(`sections:${key}`, () => sectionsForDay(this.habits, key));
  }

  dayStats(key) {
    return this.#memoize(`day:${key}`, () =>
      dayStats(this.habits, this.days.get(key), key, this.settings, this.projects),
    );
  }

  weekPoints(key) {
    const weekStart = startOfWeek(key, this.settings.weekStartsOn);
    return this.#memoize(`week:${weekStart}`, () =>
      weekKeys(weekStart).reduce((sum, k) => sum + this.dayStats(k).points, 0),
    );
  }

  weeklyProgress(habit, key) {
    return weeklyProgress(habit, key, (k, id) => this.isDone(k, id), this.settings.weekStartsOn);
  }

  /** Current streak; pass { withBest: true } for the all-time best too (slower). */
  habitStreak(habit, today = this.todayKey(), { withBest = false } = {}) {
    return this.#memoize(`streak:${habit.id}:${today}:${withBest}`, () =>
      habitStreak(habit, this.ctx(today), { withBest }),
    );
  }

  showingUp(today = this.todayKey(), { withBest = false } = {}) {
    return this.#memoize(`showing-up:${today}:${withBest}`, () => showingUpStreak(this.ctx(today), { withBest }));
  }

  morningWins(today = this.todayKey()) {
    return this.#memoize(`morning-wins:${today}`, () => morningWinStreak(this.ctx(today)));
  }

  xp() {
    return this.#memoize('xp', () => totalPoints(this.habits, this.days, this.settings, this.projects));
  }

  level() {
    return levelInfo(this.xp());
  }

  review(weekStart, today = this.todayKey()) {
    return this.#memoize(`review:${weekStart}:${today}`, () => weekReview({ ...this.ctx(today), weekStart }));
  }

  badges() {
    return BADGES.map((badge) => ({ ...badge, earnedOn: this.meta.badges[badge.id] || null }));
  }

  hasData() {
    return this.days.size > 0 || this.projects.some((p) => p.completedDay);
  }

  /** Days since the last backup (calendar days), or null if never. */
  daysSinceBackup(now = new Date()) {
    const last = this.meta.lastExportAt;
    return last ? diffDays(this.todayKey(new Date(last)), this.todayKey(now)) : null;
  }

  backupReminder(now = new Date()) {
    const last = this.meta.lastExportAt;
    return backupReminder({
      todayKey: this.todayKey(now),
      lastExportDay: last ? this.todayKey(new Date(last)) : null,
      firstDay: this.meta.firstDay,
      snoozedDay: this.meta.backupSnoozedDay,
      hasData: this.hasData(),
    });
  }

  // ----------------------------------------------------------------- logging

  #snapshot(key) {
    return { day: this.dayStats(key), level: this.level() };
  }

  /**
   * Badges scan the whole history, so they're checked just after a change has
   * rendered (and only once for a quick run of taps). New ones are announced
   * with a 'badges' event.
   */
  #scheduleBadgeCheck() {
    clearTimeout(this.#badgeTimer);
    this.#badgeTimer = setTimeout(() => {
      this.#badgeTimer = null;
      const fresh = this.#checkBadges();
      if (fresh.length) this.dispatchEvent(new CustomEvent('badges', { detail: fresh }));
    }, 300);
  }

  #checkBadges({ silent = false } = {}) {
    const earned = earnedBadgeIds(badgeStats(this.ctx()));
    const fresh = earned.filter((id) => !this.meta.badges[id]);
    if (!fresh.length) return [];
    const today = this.todayKey();
    this.meta = { ...this.meta, badges: { ...this.meta.badges } };
    for (const id of fresh) this.meta.badges[id] = today;
    this.#saveMeta();
    if (!silent) this.#changed();
    return silent ? [] : fresh.map((id) => BADGES.find((b) => b.id === id));
  }

  /**
   * Tick or untick a habit on a day. Returns what changed so the UI can
   * celebrate: { done, delta, morningWin, perfect, weeklyGoalMet, levelUp }.
   */
  toggleHabit(key, habitId) {
    const habit = this.habit(habitId);
    if (!habit) return null;
    const before = this.dayStats(key);
    const xpBefore = this.xp();
    const weeklyBefore = isWeekly(habit) ? this.weeklyProgress(habit, key) : null;

    const record = cloneDay(this.days.get(key), key);
    const done = !record.done[habitId];
    if (done) record.done[habitId] = Date.now();
    else delete record.done[habitId];
    this.#saveDay(record);
    const after = dayStats(this.habits, this.days.get(key), key, this.settings, this.projects);
    const xpAfter = xpBefore + after.points - before.points;
    // Only this day changed, so update the totals instead of recounting history.
    this.#changed(() => {
      this.#memo.set(`day:${key}`, after);
      this.#memo.set('xp', xpAfter);
    });
    this.#scheduleBadgeCheck();

    const weeklyAfter = isWeekly(habit) ? this.weeklyProgress(habit, key) : null;
    const levelAfter = levelInfo(xpAfter);
    return {
      done,
      habit,
      delta: after.points - before.points,
      morningWin: !before.morningWin && after.morningWin,
      perfect: !before.perfect && after.perfect,
      weeklyGoalMet: Boolean(weeklyAfter && weeklyAfter.met && !weeklyBefore.met),
      levelUp: levelAfter.level > levelInfo(xpBefore).level ? levelAfter : null,
    };
  }

  setNote(key, text) {
    const note = cleanText(text, LIMITS.note);
    const existing = this.days.get(key);
    if ((existing?.note || '') === note) return;
    const record = cloneDay(existing, key);
    record.note = note;
    this.#saveDay(record);
    this.#changed();
    this.#scheduleBadgeCheck();
  }

  // ------------------------------------------------------------------ habits

  #nextOrder(habit) {
    const section = sectionOf(habit);
    const orders = this.habits.filter((h) => h.id !== habit.id && sectionOf(h) === section).map((h) => h.order);
    return orders.length ? Math.max(...orders) + 1 : 0;
  }

  addHabit(fields) {
    const draft = { ...fields, id: uid('h-'), createdDay: this.todayKey(), archivedDay: null };
    const habit = normalizeHabit({ ...draft, order: this.#nextOrder(normalizeHabit(draft) || draft) });
    if (!habit) throw new Error('A habit needs a name.');
    this.habits.push(habit);
    this.#saveHabits([habit]);
    this.#changed();
    return habit;
  }

  updateHabit(id, patch) {
    const index = this.habits.findIndex((h) => h.id === id);
    if (index < 0) return null;
    const previous = this.habits[index];
    const next = normalizeHabit({
      ...previous,
      ...patch,
      id: previous.id,
      createdDay: previous.createdDay,
      archivedDay: previous.archivedDay,
    });
    if (!next) throw new Error('A habit needs a name.');
    if (sectionOf(next) !== sectionOf(previous)) next.order = this.#nextOrder(next);
    this.habits[index] = next;
    this.#saveHabits([next]);
    this.#changed();
    return next;
  }

  /** Remove a habit. Habits with history are archived so past days stay intact. */
  removeHabit(id) {
    const habit = this.habit(id);
    if (!habit) return null;
    const today = this.todayKey();
    const hasHistory = [...this.days.values()].some((d) => d.date < today && d.done[id]);
    if (!hasHistory) {
      this.habits = this.habits.filter((h) => h.id !== id);
      const todayRecord = this.days.get(today);
      if (todayRecord?.done[id]) {
        const record = cloneDay(todayRecord);
        delete record.done[id];
        this.#saveDay(record);
      }
      this.#write(() => db.remove('habits', id));
      this.#changed();
      return 'deleted';
    }
    const archived = { ...habit, archivedDay: today };
    this.habits = this.habits.map((h) => (h.id === id ? archived : h));
    this.#saveHabits([archived]);
    this.#changed();
    return 'archived';
  }

  restoreHabit(id) {
    const habit = this.habit(id);
    if (!habit) return null;
    const restored = { ...habit, archivedDay: null };
    restored.order = this.#nextOrder(restored);
    this.habits = this.habits.map((h) => (h.id === id ? restored : h));
    this.#saveHabits([restored]);
    this.#changed();
    return restored;
  }

  /** Move a habit up (-1) or down (+1) within its section. */
  moveHabit(id, direction) {
    const habit = this.habit(id);
    if (!habit) return false;
    const section = sectionOf(habit);
    const list = this.currentHabits().filter((h) => sectionOf(h) === section);
    const from = list.findIndex((h) => h.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= list.length) return false;
    [list[from], list[to]] = [list[to], list[from]];
    const changed = [];
    list.forEach((h, i) => {
      if (h.order !== i) {
        h.order = i;
        changed.push(h);
      }
    });
    this.#saveHabits(changed);
    this.#changed();
    return true;
  }

  // ---------------------------------------------------------------- projects

  project(id) {
    return this.projects.find((p) => p.id === id) || null;
  }

  activeProjects() {
    return this.projects.filter((p) => !p.completedDay).sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  finishedProjects() {
    return this.projects.filter((p) => p.completedDay).sort((a, b) => (a.completedDay < b.completedDay ? 1 : -1));
  }

  addProject({ name, steps = [], maintenance = null }) {
    const orders = this.projects.map((p) => p.order);
    const project = normalizeProject({
      id: uid('p-'),
      name,
      steps: steps.map((text) => ({ id: uid('s-'), text, done: false })),
      maintenance,
      createdAt: Date.now(),
      order: orders.length ? Math.max(...orders) + 1 : 0,
    });
    if (!project) throw new Error('A project needs a name.');
    this.projects.push(project);
    this.#saveProject(project);
    this.#changed();
    return project;
  }

  updateProject(id, patch) {
    const index = this.projects.findIndex((p) => p.id === id);
    if (index < 0) return null;
    const next = normalizeProject({ ...this.projects[index], ...patch, id });
    if (!next) throw new Error('A project needs a name.');
    this.projects[index] = next;
    this.#saveProject(next);
    this.#changed();
    return next;
  }

  addStep(projectId, text) {
    const project = this.project(projectId);
    const clean = cleanText(text, LIMITS.step);
    if (!project || !clean) return null;
    return this.updateProject(projectId, { steps: [...project.steps, { id: uid('s-'), text: clean, done: false }] });
  }

  removeStep(projectId, stepId) {
    const project = this.project(projectId);
    if (!project) return null;
    return this.updateProject(projectId, { steps: project.steps.filter((s) => s.id !== stepId) });
  }

  toggleStep(projectId, stepId) {
    const project = this.project(projectId);
    if (!project) return null;
    const steps = project.steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s));
    const next = this.updateProject(projectId, { steps });
    const step = next.steps.find((s) => s.id === stepId);
    return { done: step?.done ?? false, allDone: next.steps.length > 0 && next.steps.every((s) => s.done) };
  }

  /** Finish a project; creates its maintenance habit if it has one. */
  completeProject(id) {
    const project = this.project(id);
    if (!project || project.completedDay) return null;
    const today = this.todayKey();
    const before = this.#snapshot(today);
    let habit = null;
    if (project.maintenance && !this.habit(project.habitId)) {
      habit = this.addHabit({ ...project.maintenance, projectId: project.id, tip: null });
    }
    this.updateProject(id, { completedDay: today, habitId: habit?.id ?? project.habitId });
    const after = this.#snapshot(today);
    this.#scheduleBadgeCheck();
    return { habit, levelUp: after.level.level > before.level.level ? after.level : null };
  }

  reopenProject(id) {
    return this.updateProject(id, { completedDay: null });
  }

  deleteProject(id) {
    if (!this.project(id)) return;
    this.projects = this.projects.filter((p) => p.id !== id);
    this.#write(() => db.remove('projects', id));
    this.#changed();
  }

  // ---------------------------------------------------------- settings, meta

  updateSettings(patch) {
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    const copy = { ...this.settings };
    this.#write(() => db.put('kv', { key: 'settings', value: copy }));
    this.#changed();
  }

  updateMeta(patch) {
    this.meta = normalizeMeta({ ...this.meta, ...patch });
    this.#saveMeta();
    this.#changed();
  }

  markExported() {
    this.updateMeta({
      lastExportAt: Date.now(),
      exportCount: this.meta.exportCount + 1,
      backupSnoozedDay: null,
    });
    this.#scheduleBadgeCheck();
  }

  snoozeBackupReminder() {
    this.updateMeta({ backupSnoozedDay: this.todayKey() });
  }

  // ----------------------------------------------------------- import/export

  exportData(now = new Date()) {
    return buildBackup(
      { habits: this.habits, days: this.days, projects: this.projects, settings: this.settings, meta: this.meta },
      { appVersion: APP_VERSION, now },
    );
  }

  async #replaceEverything({ habits, days, projects, settings, meta }, preImport) {
    await this.flush();
    const kv = [
      { key: 'settings', value: settings },
      { key: 'meta', value: meta },
    ];
    if (preImport) kv.push({ key: 'preImport', value: preImport });
    if (!this.memoryOnly) await db.replaceAll({ habits, days, projects, kv });
    this.habits = habits;
    this.days = new Map(days.map((d) => [d.date, d]));
    this.projects = projects;
    this.settings = settings;
    this.meta = meta;
    this.preImport = preImport ? { savedAt: preImport.savedAt } : null;
    this.#checkBadges({ silent: true });
    this.#changed();
  }

  /** Replace all data with a validated backup (from parseBackup). */
  async importBackup(parsed) {
    if (!parsed?.ok) throw new Error(parsed?.error || 'Invalid backup.');
    const { habits, days, projects, settings } = parsed.data;
    const keys = [...days.map((d) => d.date), ...habits.map((h) => h.createdDay).filter(Boolean)].sort();
    const meta = normalizeMeta({
      ...parsed.data.meta,
      initialized: true,
      installedAt: parsed.data.meta.installedAt || Date.now(),
      firstDay: parsed.data.meta.firstDay || keys[0] || this.todayKey(),
      lastExportAt: Math.max(this.meta.lastExportAt || 0, parsed.exportedAt || 0) || null,
      welcomed: true,
      installHintDismissed: this.meta.installHintDismissed || parsed.data.meta.installHintDismissed,
    });
    const preImport = { savedAt: Date.now(), backup: this.exportData() };
    await this.#replaceEverything({ habits, days, projects, settings, meta }, preImport);
  }

  /** Undo the last import using the safety copy taken just before it. */
  async restorePreImport() {
    const row = this.memoryOnly ? null : await db.get('kv', 'preImport');
    const parsed = parseBackup(row?.value?.backup);
    if (!parsed.ok) throw new Error('No earlier copy was found.');
    const meta = normalizeMeta({ ...parsed.data.meta, initialized: true, lastExportAt: this.meta.lastExportAt });
    await this.#replaceEverything({ ...parsed.data, meta }, null);
  }

  /** Start completely fresh with the starter habits. */
  async eraseEverything() {
    const today = logicalDayKey(new Date(), normalizeSettings().dayStart);
    await this.#replaceEverything(
      {
        habits: createDefaultHabits(today),
        days: [],
        projects: [],
        settings: normalizeSettings(),
        meta: normalizeMeta({
          initialized: true,
          installedAt: Date.now(),
          firstDay: today,
          welcomed: true,
          installHintDismissed: this.meta.installHintDismissed,
        }),
      },
      null,
    );
  }
}

export const store = new Store();
