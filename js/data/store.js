/**
 * App state.
 *
 * Everything lives in memory and changes synchronously, so taps feel instant.
 * Each change is then written to IndexedDB through a serial queue. Views listen
 * for the 'change' event and read derived values (memoised per change).
 */
import { BADGES, badgeStats, earnedBadgeIds } from '../core/badges.js';
import { backupReminder, buildBackup, parseBackup } from '../core/backup.js';
import { BUILT_IN_CARDS, libraryCards } from '../core/cards.js';
import { addDays, diffDays, logicalDayKey, startOfWeek, weekKeys } from '../core/dates.js';
import { createDefaultHabits } from '../core/defaults.js';
import { autoTickHabitIds, evidenceSummary, minutesToLog, sessionsBetween } from '../core/focus.js';
import { DATA_VERSION, migrateData } from '../core/migrate.js';
import {
  LIMITS,
  cleanMultiline,
  cleanText,
  isCardRecordEmpty,
  isJournalEmpty,
  normalizeActiveSession,
  normalizeCardRecord,
  normalizeDay,
  normalizeFoundations,
  normalizeHabit,
  normalizeInbox,
  normalizeJournal,
  normalizeMeta,
  normalizeProject,
  normalizeReflection,
  normalizeRitual,
  normalizeSession,
  normalizeSettings,
  uid,
} from '../core/model.js';
import { weekReview } from '../core/review.js';
import { recentCardIds, shouldOfferRitual, wordForToday } from '../core/ritual.js';
import { isDueOn, isWeekly, sectionOf, sectionsForDay, sortHabits, weeklyProgress } from '../core/schedule.js';
import { dayStats, levelInfo, totalPoints } from '../core/scoring.js';
import { habitStreak, morningWinStreak, showingUpStreak } from '../core/stats.js';
import { activeProjects, canActivate, parkedProjects, statusForNewProject } from '../core/wip.js';
import { APP_VERSION } from '../version.js';
import * as db from './db.js';

const cloneDay = (record, date) =>
  record ? { ...record, done: { ...record.done } } : { date, done: {}, note: '' };
const cloneJournal = (entry, date) =>
  entry ? structuredClone(entry) : { date, ritual: null, reflection: null };

class Store extends EventTarget {
  habits = [];
  days = new Map();
  projects = [];
  settings = normalizeSettings();
  meta = normalizeMeta();
  journal = new Map();
  sessions = [];
  cardRecords = new Map();
  foundations = normalizeFoundations();
  inbox = [];
  activeSession = null;
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
      await this.#migrate();
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

  #hydrate({ habits = [], days = [], projects = [], kv = [], journal = [], sessions = [], cards = [] }) {
    this.habits = habits.map(normalizeHabit).filter(Boolean);
    this.days = new Map(
      days
        .map(normalizeDay)
        .filter(Boolean)
        .map((d) => [d.date, d]),
    );
    this.projects = projects.map(normalizeProject).filter(Boolean);
    this.journal = new Map(journal.map(normalizeJournal).filter(Boolean).map((j) => [j.date, j]));
    this.sessions = sessions.map(normalizeSession).filter(Boolean).sort((a, b) => a.startedAt - b.startedAt);
    this.cardRecords = new Map(cards.map(normalizeCardRecord).filter(Boolean).map((c) => [c.id, c]));
    const values = new Map(kv.map((row) => [row.key, row.value]));
    this.settings = normalizeSettings(values.get('settings'));
    this.meta = normalizeMeta(values.get('meta'));
    this.foundations = normalizeFoundations(values.get('foundations'));
    this.inbox = normalizeInbox(values.get('inbox'));
    this.activeSession = normalizeActiveSession(values.get('activeSession'));
    const pre = values.get('preImport');
    this.preImport = pre?.savedAt ? { savedAt: pre.savedAt } : null;
  }

  #seedMemory() {
    const today = this.todayKey();
    this.habits = createDefaultHabits(today);
    this.days = new Map();
    this.projects = [];
    // A new install meets the ritual tomorrow morning; today starts with the welcome.
    this.meta = normalizeMeta({
      initialized: true,
      installedAt: Date.now(),
      firstDay: today,
      dataVersion: DATA_VERSION,
      ritualOfferedDay: today,
    });
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

  /** Upgrade older data once, writing every change in a single transaction. */
  async #migrate() {
    const { data, changed, notices, touched } = migrateData(
      { habits: this.habits, days: this.days, projects: this.projects, meta: this.meta },
      { todayKey: this.todayKey() },
    );
    if (!changed) return;
    const habits = data.habits.map(normalizeHabit).filter(Boolean);
    const projects = data.projects.map(normalizeProject).filter(Boolean);
    const meta = normalizeMeta({ ...data.meta, notices: [...this.meta.notices, ...notices] });
    const ops = [
      ...habits.filter((h) => touched.habits.includes(h.id)).map((h) => ({ store: 'habits', put: h })),
      ...projects.filter((p) => touched.projects.includes(p.id)).map((p) => ({ store: 'projects', put: p })),
      { store: 'kv', put: { key: 'meta', value: meta } },
    ];
    await db.batch(ops);
    this.habits = habits;
    this.projects = projects;
    this.meta = meta;
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

  #saveKv(key, value) {
    if (value === null || value === undefined) {
      this.#write(() => db.remove('kv', key));
    } else {
      const copy = structuredClone(value);
      this.#write(() => db.put('kv', { key, value: copy }));
    }
  }

  #saveJournal(entry) {
    if (isJournalEmpty(entry)) {
      this.journal.delete(entry.date);
      this.#write(() => db.remove('journal', entry.date));
    } else {
      this.journal.set(entry.date, entry);
      const copy = structuredClone(entry);
      this.#write(() => db.put('journal', copy));
    }
  }

  #saveSession(session) {
    const copy = { ...session };
    this.#write(() => db.put('sessions', copy));
  }

  #saveCardRecord(record) {
    if (isCardRecordEmpty(record)) {
      this.cardRecords.delete(record.id);
      this.#write(() => db.remove('cards', record.id));
    } else {
      this.cardRecords.set(record.id, record);
      const copy = { ...record };
      this.#write(() => db.put('cards', copy));
    }
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
      journal: this.journal,
      sessions: this.sessions,
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
    return this.days.size > 0 || this.journal.size > 0 || this.sessions.length > 0 || this.projects.some((p) => p.completedDay);
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

  /** Open projects you're working on now (three at most). */
  activeProjects() {
    return activeProjects(this.projects);
  }

  /** Ideas and projects waiting until there's room. */
  parkedProjects() {
    return parkedProjects(this.projects);
  }

  canActivateProject(id = null) {
    return canActivate(this.projects, id);
  }

  finishedProjects() {
    return this.projects.filter((p) => p.completedDay).sort((a, b) => (a.completedDay < b.completedDay ? 1 : -1));
  }

  /** New projects start active while there's room, otherwise in the parking lot. */
  addProject({ name, steps = [], maintenance = null, status = null }) {
    const orders = this.projects.map((p) => p.order);
    const wanted = status === 'parked' ? 'parked' : statusForNewProject(this.projects);
    const project = normalizeProject({
      id: uid('p-'),
      name,
      status: wanted,
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

  /** Park or activate a project. Activating is refused gently when three are active. */
  setProjectStatus(id, status) {
    const project = this.project(id);
    if (!project) return { ok: false, reason: 'missing' };
    if (status === 'active' && !canActivate(this.projects, id)) return { ok: false, reason: 'limit' };
    this.updateProject(id, { status: status === 'parked' ? 'parked' : 'active' });
    return { ok: true };
  }

  /** Park one project and activate another in a single step. */
  swapProjects(activateId, parkId) {
    const toActivate = this.project(activateId);
    const toPark = this.project(parkId);
    if (!toActivate || !toPark) return false;
    const a = normalizeProject({ ...toActivate, status: 'active' });
    const p = normalizeProject({ ...toPark, status: 'parked' });
    this.projects = this.projects.map((x) => (x.id === a.id ? a : x.id === p.id ? p : x));
    this.#saveProject(a);
    this.#saveProject(p);
    this.#changed();
    return true;
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

  /** Reopen a finished project: active if there's room, otherwise parked. */
  reopenProject(id) {
    return this.updateProject(id, { completedDay: null, status: canActivate(this.projects, id) ? 'active' : 'parked' });
  }

  deleteProject(id) {
    if (!this.project(id)) return;
    this.projects = this.projects.filter((p) => p.id !== id);
    this.#write(() => db.remove('projects', id));
    this.#changed();
  }

  // ------------------------------------------------------- Begin and journal

  journalEntry(key) {
    return this.journal.get(key) || null;
  }

  ritual(key = this.todayKey()) {
    return this.journal.get(key)?.ritual || null;
  }

  reflection(key = this.todayKey()) {
    return this.journal.get(key)?.reflection || null;
  }

  /** Whether the ritual should open now, as the day's front door. */
  shouldOfferRitual(now = new Date()) {
    return shouldOfferRitual({
      enabled: this.settings.ritualEnabled,
      now,
      dayStart: this.settings.dayStart,
      offeredDay: this.meta.ritualOfferedDay,
      entry: this.journal.get(this.todayKey(now)),
    });
  }

  markRitualOffered(key = this.todayKey()) {
    if (this.meta.ritualOfferedDay === key) return;
    this.updateMeta({ ritualOfferedDay: key });
  }

  /** The word chosen in last night's reflection. */
  wordForToday(key = this.todayKey()) {
    return wordForToday(this.journal, key);
  }

  recentCardIds(key = this.todayKey()) {
    return recentCardIds(this.journal, key);
  }

  /** Save progress through the ritual without finishing it. */
  updateRitual(key, patch) {
    const entry = cloneJournal(this.journal.get(key), key);
    entry.ritual = normalizeRitual({ ...(entry.ritual || {}), ...patch });
    this.#saveJournal(entry);
    this.#changed();
    return entry.ritual;
  }

  /**
   * Finish the ritual. Ticks the "Began my day with intention" habit, which
   * counts towards the Morning Win. Returns { habit, result } where result is
   * the tick's celebration info (or null if it was already ticked).
   */
  completeRitual(key, patch = {}) {
    const entry = cloneJournal(this.journal.get(key), key);
    entry.ritual = normalizeRitual({ ...(entry.ritual || {}), ...patch, completedAt: Date.now(), skippedAt: null });
    this.#saveJournal(entry);
    if (this.meta.ritualOfferedDay !== key || !this.meta.ritualIntroSeen) {
      this.meta = normalizeMeta({ ...this.meta, ritualOfferedDay: key, ritualIntroSeen: true });
      this.#saveMeta();
    }
    const habit = this.habits.find((h) => h.ritual && isDueOn(h, key)) || null;
    const result = habit && !this.isDone(key, habit.id) ? this.toggleHabit(key, habit.id) : null;
    if (!result) this.#changed();
    this.#scheduleBadgeCheck();
    return { habit, result };
  }

  skipRitual(key = this.todayKey()) {
    const entry = cloneJournal(this.journal.get(key), key);
    if (entry.ritual?.completedAt) return;
    entry.ritual = normalizeRitual({ ...(entry.ritual || {}), skippedAt: Date.now() });
    this.#saveJournal(entry);
    this.meta = normalizeMeta({ ...this.meta, ritualOfferedDay: key, ritualIntroSeen: true });
    this.#saveMeta();
    this.#changed();
  }

  saveReflection(key, patch) {
    const entry = cloneJournal(this.journal.get(key), key);
    entry.reflection = normalizeReflection({ ...(entry.reflection || {}), ...patch, savedAt: Date.now() });
    this.#saveJournal(entry);
    this.#changed();
    return entry.reflection;
  }

  // ---------------------------------------------------- focus and evidence

  startSession({ minutes, projectId = null, intent = '', rescue = null }) {
    if (this.activeSession) return this.activeSession;
    this.activeSession = normalizeActiveSession({
      id: uid('f-'),
      startedAt: Date.now(),
      plannedMinutes: minutes,
      projectId,
      intent,
      rescue,
      extended: false,
    });
    this.#saveKv('activeSession', this.activeSession);
    this.#changed();
    return this.activeSession;
  }

  /** Keep going past the planned time. */
  extendSession() {
    if (!this.activeSession) return;
    this.activeSession = { ...this.activeSession, extended: true };
    this.#saveKv('activeSession', this.activeSession);
    this.#changed();
  }

  /**
   * End the running session and log it as evidence. A long enough session
   * ticks your deep-work habit. Returns { session, ticked, results }.
   */
  finishSession(now = Date.now()) {
    const active = this.activeSession;
    if (!active) return null;
    const minutes = minutesToLog(active, now);
    this.activeSession = null;
    this.#saveKv('activeSession', null);
    if (minutes < 1) {
      this.#changed();
      return { session: null, ticked: [], results: [] };
    }
    const day = this.todayKey(new Date(active.startedAt));
    const session = normalizeSession({
      id: active.id,
      kind: 'focus',
      day,
      startedAt: active.startedAt,
      endedAt: active.startedAt + minutes * 60000,
      minutes,
      plannedMinutes: active.plannedMinutes,
      projectId: active.projectId,
      intent: active.intent,
      rescue: active.rescue,
    });
    this.sessions.push(session);
    this.#saveSession(session);
    const ids = autoTickHabitIds({
      habits: this.habits,
      session,
      deepWorkMinutes: this.settings.deepWorkMinutes,
      isDone: (k, id) => this.isDone(k, id),
    });
    const results = ids.map((id) => this.toggleHabit(day, id));
    if (!ids.length) this.#changed();
    this.#scheduleBadgeCheck();
    return { session, ticked: ids.map((id) => this.habit(id)), results };
  }

  /** Stop without logging. */
  cancelSession() {
    if (!this.activeSession) return;
    this.activeSession = null;
    this.#saveKv('activeSession', null);
    this.#changed();
  }

  session(id) {
    return this.sessions.find((s) => s.id === id) || null;
  }

  updateSession(id, patch) {
    const index = this.sessions.findIndex((s) => s.id === id);
    if (index < 0) return null;
    const next = normalizeSession({ ...this.sessions[index], ...patch, id });
    if (!next) return null;
    this.sessions[index] = next;
    this.#saveSession(next);
    this.#changed();
    if (next.shipped) this.#scheduleBadgeCheck();
    return next;
  }

  /** Record something shipped or released that wasn't tied to a session. */
  addShipped({ note, projectId = null }) {
    const now = Date.now();
    const session = normalizeSession({
      id: uid('e-'),
      kind: 'shipped',
      day: this.todayKey(),
      startedAt: now,
      endedAt: now,
      projectId,
      intent: '',
      shipped: true,
      shippedNote: note,
    });
    if (!session) return null;
    this.sessions.push(session);
    this.#saveSession(session);
    this.#changed();
    this.#scheduleBadgeCheck();
    return session;
  }

  deleteSession(id) {
    if (!this.session(id)) return;
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.#write(() => db.remove('sessions', id));
    this.#changed();
  }

  sessionsBetween(fromKey, toKey) {
    return sessionsBetween(this.sessions, fromKey, toKey);
  }

  sessionsForWeek(weekStart) {
    return this.sessionsBetween(weekStart, addDays(weekStart, 6));
  }

  evidence(sessions = this.sessions) {
    return evidenceSummary(sessions);
  }

  // -------------------------------------------------------------------- cards

  cards() {
    return this.#memoize('cards', () => libraryCards(this.cardRecords));
  }

  card(id) {
    return this.cards().find((c) => c.id === id) || null;
  }

  setCardFlags(id, flags) {
    if (!this.card(id)) return;
    const existing = this.cardRecords.get(id) || { id, custom: false };
    const record = normalizeCardRecord({ ...existing, ...flags });
    if (!record) return;
    this.#saveCardRecord(record);
    this.#changed();
  }

  /** Add your own card, or edit any card's words. */
  saveCard({ id = null, text, theme, credit = '' }) {
    const builtIn = id ? BUILT_IN_CARDS.find((c) => c.id === id) : null;
    const clean = cleanText(text, LIMITS.card);
    if (!clean) throw new Error('A card needs some words.');
    let record;
    if (builtIn) {
      const existing = this.cardRecords.get(id) || { id, custom: false };
      record = normalizeCardRecord({ ...existing, text: clean === builtIn.text ? '' : clean });
    } else {
      const existing = id ? this.cardRecords.get(id) : null;
      record = normalizeCardRecord({ ...(existing || {}), id: existing?.id || uid('c-'), custom: true, text: clean, theme, credit });
    }
    this.#saveCardRecord(record);
    this.#changed();
    return record;
  }

  /** Delete one of your cards, or reset a built-in card to its original words. */
  deleteCard(id) {
    const record = this.cardRecords.get(id);
    if (!record) return;
    if (record.custom) {
      this.cardRecords.delete(id);
      this.#write(() => db.remove('cards', id));
    } else {
      this.#saveCardRecord({ ...record, text: '' });
    }
    this.#changed();
  }

  // -------------------------------------------------------------- foundations

  updateFoundations(patch) {
    this.foundations = normalizeFoundations({ ...this.foundations, ...patch, updatedAt: Date.now() });
    this.#saveKv('foundations', this.foundations);
    this.#changed();
    return this.foundations;
  }

  // -------------------------------------------------------------------- inbox

  addIdea(text) {
    const clean = cleanMultiline(text, LIMITS.inbox);
    if (!clean) return null;
    const item = { id: uid('i-'), text: clean, createdAt: Date.now() };
    this.inbox = normalizeInbox([...this.inbox, item]);
    this.#saveKv('inbox', this.inbox);
    this.#changed();
    return item;
  }

  removeIdea(id) {
    this.inbox = this.inbox.filter((i) => i.id !== id);
    this.#saveKv('inbox', this.inbox);
    this.#changed();
  }

  /** Put back an idea that was just deleted (undo). */
  restoreIdea(item) {
    if (!item || this.inbox.some((i) => i.id === item.id)) return;
    this.inbox = normalizeInbox([...this.inbox, item].sort((a, b) => a.createdAt - b.createdAt));
    this.#saveKv('inbox', this.inbox);
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

  /** One-off messages (e.g. after an update) for the UI to show once. */
  takeNotices() {
    const notices = this.meta.notices;
    if (notices.length) {
      this.meta = normalizeMeta({ ...this.meta, notices: [] });
      this.#saveMeta();
    }
    return notices;
  }

  markTuneUp(weekStart) {
    this.updateMeta({ tuneUps: { ...this.meta.tuneUps, [weekStart]: Date.now() } });
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
      {
        habits: this.habits,
        days: this.days,
        projects: this.projects,
        settings: this.settings,
        meta: this.meta,
        journal: this.journal,
        sessions: this.sessions,
        cardRecords: this.cardRecords,
        foundations: this.foundations,
        inbox: this.inbox,
      },
      { appVersion: APP_VERSION, now },
    );
  }

  async #replaceEverything(data, preImport) {
    const {
      habits,
      days,
      projects,
      settings,
      meta,
      journal = [],
      sessions = [],
      cardRecords = [],
      foundations = normalizeFoundations(),
      inbox = [],
    } = data;
    await this.flush();
    const kv = [
      { key: 'settings', value: settings },
      { key: 'meta', value: meta },
      { key: 'foundations', value: foundations },
      { key: 'inbox', value: inbox },
    ];
    if (preImport) kv.push({ key: 'preImport', value: preImport });
    if (!this.memoryOnly) {
      await db.replaceAll({ habits, days, projects, kv, journal, sessions, cards: cardRecords });
    }
    this.habits = habits;
    this.days = new Map(days.map((d) => [d.date, d]));
    this.projects = projects;
    this.settings = settings;
    this.meta = meta;
    this.journal = new Map(journal.map((j) => [j.date, j]));
    this.sessions = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
    this.cardRecords = new Map(cardRecords.map((c) => [c.id, c]));
    this.foundations = foundations;
    this.inbox = inbox;
    this.activeSession = null;
    this.preImport = preImport ? { savedAt: preImport.savedAt } : null;
    this.#checkBadges({ silent: true });
    this.#changed();
  }

  /** Bring a parsed backup up to the current data version. */
  #upgrade(parsedData) {
    const { data } = migrateData(parsedData, { todayKey: this.todayKey() });
    return {
      ...data,
      habits: data.habits.map(normalizeHabit).filter(Boolean),
      projects: data.projects.map(normalizeProject).filter(Boolean),
    };
  }

  /** Replace all data with a validated backup (from parseBackup). */
  async importBackup(parsed) {
    if (!parsed?.ok) throw new Error(parsed?.error || 'Invalid backup.');
    const upgraded = this.#upgrade(parsed.data);
    const { habits, days } = upgraded;
    const keys = [...days.map((d) => d.date), ...habits.map((h) => h.createdDay).filter(Boolean)].sort();
    const meta = normalizeMeta({
      ...upgraded.meta,
      initialized: true,
      installedAt: upgraded.meta.installedAt || Date.now(),
      firstDay: upgraded.meta.firstDay || keys[0] || this.todayKey(),
      lastExportAt: Math.max(this.meta.lastExportAt || 0, parsed.exportedAt || 0) || null,
      welcomed: true,
      installHintDismissed: this.meta.installHintDismissed || upgraded.meta.installHintDismissed,
      ritualOfferedDay: this.meta.ritualOfferedDay,
      notices: [],
    });
    const preImport = { savedAt: Date.now(), backup: this.exportData() };
    await this.#replaceEverything({ ...upgraded, meta }, preImport);
  }

  /** Undo the last import using the safety copy taken just before it. */
  async restorePreImport() {
    const row = this.memoryOnly ? null : await db.get('kv', 'preImport');
    const parsed = parseBackup(row?.value?.backup);
    if (!parsed.ok) throw new Error('No earlier copy was found.');
    const upgraded = this.#upgrade(parsed.data);
    const meta = normalizeMeta({
      ...upgraded.meta,
      initialized: true,
      lastExportAt: this.meta.lastExportAt,
      ritualOfferedDay: this.meta.ritualOfferedDay,
      notices: [],
    });
    await this.#replaceEverything({ ...upgraded, meta }, null);
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
          dataVersion: DATA_VERSION,
          ritualOfferedDay: today,
          ritualIntroSeen: true,
        }),
      },
      null,
    );
  }
}

export const store = new Store();
