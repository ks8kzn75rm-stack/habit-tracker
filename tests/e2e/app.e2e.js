/**
 * End-to-end tests in headless Chromium with an iPhone-sized viewport.
 *
 *   npm run test:e2e        (needs Playwright: npm i -D playwright)
 *
 * The site is copied to a temp folder and served under /habit-tracker/ with
 * ETags and a 10-minute max-age, like GitHub Pages, so the update tests can
 * change files and prove the change reaches the "installed" app.
 * Screenshots are written to tests/e2e/output/ (git-ignored).
 */
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  throw new Error('These tests need Playwright. Install it with: npm i -D playwright && npx playwright install chromium');
}
const { chromium, devices } = playwright;

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUTPUT = join(ROOT, 'tests/e2e/output');
const BASE = '/habit-tracker/';
const SITE_FILES = ['index.html', 'manifest.json', 'sw.js', '.nojekyll', 'css', 'js', 'icons'];

let browser;

async function makeSite() {
  const dir = await mkdtemp(join(tmpdir(), 'daybreak-site-'));
  for (const f of SITE_FILES) await cp(join(ROOT, f), join(dir, f), { recursive: true });
  const server = createStaticServer({ root: dir, base: BASE });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    dir,
    server,
    origin,
    url: origin + BASE,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Open the app in a fresh iPhone-like context. */
async function openApp(t, site, { time = null, colorScheme = 'light', welcome = true, init = null, context = null } = {}) {
  const ctx =
    context ||
    (await browser.newContext({
      ...devices['iPhone 13'],
      locale: 'en-GB',
      timezoneId: 'Europe/London',
      colorScheme,
      acceptDownloads: true,
    }));
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(site.origin + BASE) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`);
  });
  if (time) await page.clock.install({ time: new Date(time) });
  await page.goto(site.url);
  await page.locator('.view-today').waitFor();
  if (welcome) await dismissWelcome(page);
  t.after(async () => {
    if (!context) await ctx.close();
    assert.deepEqual(problems, [], 'no console errors or external requests');
  });
  return { page, context: ctx, problems };
}

async function dismissWelcome(page) {
  await page.getByRole('button', { name: 'Let’s go' }).click();
  await page.locator('.dialog-backdrop').waitFor({ state: 'detached' });
}

const row = (page, name) => page.locator('.habit').filter({ has: page.getByText(name, { exact: true }) });

async function tick(page, name) {
  await row(page, name).click();
}

async function closeCelebration(page) {
  const overlay = page.locator('.celebrate');
  await overlay.waitFor();
  const title = await overlay.locator('.celebrate-title').textContent();
  await overlay.click();
  await overlay.waitFor({ state: 'detached' });
  return title;
}

const points = (page) => page.locator('.hero-points');
async function expectPoints(page, value) {
  await points(page).filter({ hasText: new RegExp(`^${value}$`) }).waitFor({ timeout: 5000 });
}

/** Reload once every change has been written (a person can't reload within milliseconds). */
async function reload(page) {
  await page.evaluate(() => window.daybreakDebug?.flush());
  await page.reload();
}

async function goTab(page, name) {
  await page.locator('.tabbar').getByRole('link', { name }).click();
}

async function waitForServiceWorker(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
  });
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`) });
}

const MORNING_TUE = ['Glass of water on waking', 'Slept 7–8 hours', 'Morning sunlight', 'Phone-free until first real task is done'];
const MORNING_WED = [...MORNING_TUE, 'Gym by 10am'];

before(async () => {
  await mkdir(OUTPUT, { recursive: true });
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
});

describe('Daybreak', () => {
  let site;
  before(async () => {
    site = await makeSite();
  });
  after(async () => {
    await site.close();
  });

  test('loads under a sub-path with a valid manifest and icons', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T07:40:00' });
    await shot(page, 'today-light');
    const manifestHref = await page.locator('link[rel="manifest"]').evaluate((el) => el.href);
    assert.equal(manifestHref, `${site.url}manifest.json`);
    const manifest = await (await page.request.get(manifestHref)).json();
    assert.equal(new URL(manifest.start_url, manifestHref).href, site.url);
    assert.equal(new URL(manifest.scope, manifestHref).href, site.url);
    for (const icon of manifest.icons) {
      const res = await page.request.get(new URL(icon.src, manifestHref).href);
      assert.equal(res.status(), 200);
      assert.equal(res.headers()['content-type'], 'image/png');
      const buf = await res.body();
      assert.equal(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, icon.sizes);
    }
    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').evaluate((el) => el.href);
    assert.equal(touchIcon, `${site.url}icons/apple-touch-icon.png`);
    assert.equal(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'), 'yes');
    // Default habits are grouped: 5 morning on a Wednesday (gym day), 6 daytime, 3 evening, 1 weekly.
    assert.equal(await page.locator('[data-section="morning"] .habit').count(), 5);
    assert.equal(await page.locator('[data-section="daytime"] .habit').count(), 6);
    assert.equal(await page.locator('[data-section="evening"] .habit').count(), 3);
    assert.equal(await page.locator('section[data-section="weekly"] .habit').count(), 1);
  });

  test('ticking habits earns points and a Morning Win, undo works, and it persists', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T07:40:00' });
    await tick(page, 'Glass of water on waking');
    await expectPoints(page, 10);
    assert.equal(await row(page, 'Glass of water on waking').getAttribute('aria-pressed'), 'true');
    for (const name of MORNING_WED.slice(1)) await tick(page, name);
    assert.equal(await closeCelebration(page), 'Morning Win!');
    await expectPoints(page, 10 + 10 + 10 + 15 + 20 + 25);
    assert.ok(await page.locator('.mw-badge.is-won').isVisible());
    await shot(page, 'morning-win');

    await reload(page);
    await page.locator('.view-today').waitFor();
    await expectPoints(page, 90);
    assert.equal(await row(page, 'Gym by 10am').getAttribute('aria-pressed'), 'true');

    await tick(page, 'Morning sunlight'); // undo
    await expectPoints(page, 90 - 10 - 25);
    assert.equal(await page.locator('.mw-badge.is-won').count(), 0);
    assert.equal(await row(page, 'Morning sunlight').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('.hero-stat').first().textContent(), /4 of 14 done/);
  });

  test('morning window counts down on gym days only', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T07:40:00' });
    const card = page.locator('.window-card');
    assert.match(await card.locator('.window-title').textContent(), /Morning window · 2h 20m left/);
    await page.clock.fastForward('02:30:00');
    await card.locator('.window-title').filter({ hasText: 'closed' }).waitFor();
    assert.equal(await card.getAttribute('data-state'), 'closed');
    // Thursday isn't a gym day.
    await page.clock.setSystemTime(new Date('2026-11-05T08:00:00'));
    await reload(page);
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.window-card').count(), 0);
    assert.equal(await row(page, 'Gym by 10am').count(), 0);
  });

  test('late-night check-ins count towards the previous day', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-05T02:30:00' });
    assert.equal(await page.locator('.hero-title').textContent(), 'Wednesday 4 November');
    await tick(page, 'Lights out by target time');
    await expectPoints(page, 15);
    await goTab(page, 'Settings');
    await page.locator('#day-start').selectOption('0');
    await goTab(page, 'Today');
    assert.equal(await page.locator('.hero-title').textContent(), 'Thursday 5 November');
    await expectPoints(page, 0);
  });

  test('past days can be edited and keep streaks going', async (t) => {
    // Start on Monday, come back on Thursday having forgotten to log.
    const { page } = await openApp(t, site, { time: '2026-11-02T08:00:00' });
    await tick(page, 'Glass of water on waking');
    await page.clock.setSystemTime(new Date('2026-11-05T09:00:00'));
    await reload(page);
    await page.locator('.view-today').waitFor();
    const chips = page.locator('.strip a.strip-day');
    assert.equal(await chips.count(), 4); // Mon-Thu (days before the first day are disabled)

    await page.locator('.strip').getByRole('link', { name: 'Yesterday' }).click();
    await page.locator('.past-banner').waitFor();
    assert.equal(await page.locator('.hero-title').textContent(), 'Wednesday 4 November');
    await tick(page, 'Glass of water on waking');
    await page.locator('.strip-day[aria-label="Tue 3 Nov"]').click();
    await page.locator('.hero-title', { hasText: 'Tuesday 3 November' }).waitFor();
    // Leave Tuesday empty: one grace day this week keeps the streak alive.
    await page.locator('.past-link').click();
    await page.locator('.hero-title', { hasText: 'Thursday 5 November' }).waitFor();
    await tick(page, 'Glass of water on waking');
    const water = row(page, 'Glass of water on waking');
    await water.locator('.meta-streak', { hasText: '3 days' }).waitFor();
    assert.ok(await water.locator('.meta-grace').isVisible());
    assert.match(await page.locator('.hero-stat').nth(1).textContent(), /3-day streak/);
    await shot(page, 'past-days-streak');
  });

  test('weekly goals count sessions across the week', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-03T12:00:00' });
    await tick(page, 'Strength training');
    await row(page, 'Strength training').getByText('1/2 this week').waitFor();
    await expectPoints(page, 20);
    await page.clock.setSystemTime(new Date('2026-11-05T12:00:00'));
    await reload(page);
    await page.locator('.view-today').waitFor();
    await row(page, 'Strength training').getByText('1/2 this week').waitFor();
    await tick(page, 'Strength training');
    await row(page, 'Strength training').getByText('2/2 · goal met').waitFor();
    await page.locator('.toast', { hasText: 'Weekly goal met: Strength training' }).waitFor();
  });

  test('the daily note is saved', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T20:00:00' });
    await page.locator('#day-note').fill('Calm evening, good walk.');
    await page.locator('#day-note').press('Enter');
    await page.locator('.note-saved.show').waitFor();
    await reload(page);
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('#day-note').inputValue(), 'Calm evening, good walk.');
    await goTab(page, 'Review');
    await page.locator('.notes-list', { hasText: 'Calm evening, good walk.' }).waitFor();
  });

  test('habits can be added, edited, reordered, regrouped and removed', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T09:00:00' });
    await goTab(page, 'Settings');
    await page.getByRole('link', { name: 'Add a habit' }).click();
    await page.locator('#habit-name').fill('Read 10 pages');
    await page.getByRole('radio', { name: 'Some days' }).click();
    await page.getByRole('button', { name: 'Monday' }).click(); // turn off the default Mon
    await page.getByRole('button', { name: 'Friday' }).click(); // and Fri; Wednesday stays
    await page.getByRole('radio', { name: 'Evening' }).click();
    await page.getByRole('button', { name: 'More points' }).click();
    await shot(page, 'habit-editor');
    await page.getByRole('button', { name: 'Add habit' }).click();
    const added = page.locator('.manage-row', { hasText: 'Read 10 pages' });
    await added.waitFor();
    assert.match(await added.textContent(), /Wed · 15 pts/);

    // Reorder: it starts last in Evening; move it up once.
    await added.getByRole('button', { name: /up$/ }).click();
    const evening = await page.locator('.manage-group[data-section="evening"] .manage-name').allTextContents();
    assert.deepEqual(evening.slice(-2), ['Read 10 pages', 'Socialised today (call, message or meet)']);

    // Rename and regroup.
    await page.locator('.manage-row', { hasText: 'Read 10 pages' }).locator('.manage-main').click();
    await page.locator('#habit-name').fill('Read 20 pages');
    await page.getByRole('radio', { name: 'Morning' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.locator('.manage-group[data-section="morning"] .manage-row', { hasText: 'Read 20 pages' }).waitFor();

    // Weekly target change.
    await page.locator('.manage-row', { hasText: 'Strength training' }).locator('.manage-main').click();
    await page.getByRole('button', { name: 'More times per week' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await goTab(page, 'Today');
    await row(page, 'Read 20 pages').waitFor();
    assert.equal(await page.locator('[data-section="morning"] .habit', { hasText: 'Read 20 pages' }).count(), 1);
    await row(page, 'Strength training').getByText('0/3 this week').waitFor();

    // Remove a habit that has history: it's archived, restorable, and past days keep it.
    await tick(page, 'Vitamin D');
    await page.clock.setSystemTime(new Date('2026-11-05T09:00:00'));
    await goTab(page, 'Settings');
    await page.locator('.manage-row', { hasText: 'Vitamin D' }).locator('.manage-main').click();
    await page.getByRole('button', { name: 'Remove habit' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'Remove' }).click();
    await page.locator('details.archived').waitFor();
    await goTab(page, 'Today');
    assert.equal(await row(page, 'Vitamin D').count(), 0);
    await page.locator('.strip').getByRole('link', { name: 'Yesterday' }).click();
    await row(page, 'Vitamin D').waitFor();
    assert.equal(await row(page, 'Vitamin D').getAttribute('aria-pressed'), 'true');
    await goTab(page, 'Settings');
    await page.locator('details.archived summary').click();
    await page.locator('details.archived').getByRole('button', { name: 'Restore' }).click();
    await goTab(page, 'Today');
    await row(page, 'Vitamin D').waitFor();
  });

  test('weekly review shows the chart, Morning Wins and where to focus', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-02T08:00:00' });
    for (const name of MORNING_WED) await tick(page, name); // Monday is a gym day too
    await closeCelebration(page);
    await tick(page, 'Daily squats');
    await page.clock.setSystemTime(new Date('2026-11-03T08:00:00'));
    await reload(page);
    await page.locator('.view-today').waitFor();
    for (const name of MORNING_TUE) await tick(page, name);
    await closeCelebration(page);
    await goTab(page, 'Review');
    await page.locator('.chart').waitFor();
    assert.equal(await page.locator('.bar-col').count(), 7);
    const values = await page.locator('.bar-value').allTextContents();
    assert.deepEqual(values.slice(0, 2), ['100', '70']);
    assert.match(await page.locator('.tiles').textContent(), /170\s*points/);
    assert.match(await page.locator('.tiles').textContent(), /2\s*Morning Wins/);
    assert.equal(await page.locator('.bar-sun').count(), 2);
    await page.locator('.focus-card .focus-tip').first().waitFor();
    assert.ok((await page.locator('.rate-list .rate-name').allTextContents()).includes('Glass of water on waking'));
    await shot(page, 'review');
    // Previous week is the first week, so its arrow is disabled.
    assert.ok(await page.getByRole('button', { name: 'Previous week' }).isDisabled());
  });

  test('projects can be finished and create a maintenance habit', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T11:00:00' });
    await goTab(page, 'Projects');
    await page.getByRole('link', { name: 'Try an example' }).click();
    assert.equal(await page.locator('#project-name').inputValue(), 'Office reset');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.locator('.step').first().waitFor();
    assert.equal(await page.locator('.step').count(), 5);
    for (let i = 0; i < 5; i++) await page.locator('.step-toggle').nth(i).click();
    await page.locator('#new-step').fill('Celebrate');
    await page.locator('#new-step').press('Enter');
    await page.locator('.step', { hasText: 'Celebrate' }).locator('.step-toggle').click();
    await shot(page, 'project');
    await page.getByRole('button', { name: /Finish project/ }).click();
    assert.equal(await closeCelebration(page), 'Project finished!');
    await page.getByText('Project finished').first().waitFor();
    await goTab(page, 'Today');
    await row(page, '10-min desk tidy').waitFor();
    assert.equal(await page.locator('[data-section="evening"] .habit', { hasText: '10-min desk tidy' }).count(), 1);
    await expectPoints(page, 50);
    await goTab(page, 'Projects');
    await page.locator('.finished-row', { hasText: 'Office reset' }).waitFor();
  });

  test('backups export via the share sheet or a download, and restore', async (t) => {
    const share = `
      window.__shared = null;
      navigator.canShare = (data) => Boolean(data && data.files && data.files.length);
      navigator.share = async (data) => {
        const f = data.files[0];
        window.__shared = { name: f.name, type: f.type, text: await f.text(), keys: Object.keys(data) };
      };
    `;
    const { page } = await openApp(t, site, { time: '2026-11-04T08:00:00', init: share });
    await tick(page, 'Glass of water on waking');
    await goTab(page, 'Settings');
    await page.getByRole('button', { name: 'Back up now' }).click();
    await page.locator('.toast', { hasText: 'Backup saved' }).waitFor();
    const shared = await page.evaluate(() => window.__shared);
    assert.equal(shared.name, 'daybreak-backup-2026-11-04.json');
    assert.equal(shared.type, 'application/json');
    assert.deepEqual(shared.keys, ['files']);
    const backup = JSON.parse(shared.text);
    assert.equal(backup.app, 'daybreak-habit-tracker');
    assert.equal(backup.data.habits.length, 15);
    assert.ok(backup.data.days[0].done['d-water']);
    await page.getByText('Last backup today').waitFor();

    // Download fallback when the share sheet can't take files.
    const { page: plain } = await openApp(t, site, { time: '2026-11-04T08:00:00' });
    await tick(plain, 'Morning sunlight');
    await goTab(plain, 'Settings');
    const [download] = await Promise.all([plain.waitForEvent('download'), plain.getByRole('button', { name: 'Back up now' }).click()]);
    assert.equal(download.suggestedFilename(), 'daybreak-backup-2026-11-04.json');
    const file = await download.path();
    const downloaded = JSON.parse(await readFile(file, 'utf8'));
    assert.ok(downloaded.data.days[0].done['d-sunlight']);

    // Restore the shared backup into the second app (fresh data).
    const backupPath = join(OUTPUT, 'backup-under-test.json');
    await writeFile(backupPath, shared.text);
    const [chooser] = await Promise.all([plain.waitForEvent('filechooser'), plain.getByRole('button', { name: 'Restore' }).click()]);
    await chooser.setFiles(backupPath);
    await plain.locator('.dialog', { hasText: 'Restore this backup?' }).waitFor();
    await plain.locator('.dialog').getByRole('button', { name: 'Restore' }).click();
    await plain.locator('.toast', { hasText: 'Backup restored' }).waitFor();
    await goTab(plain, 'Today');
    assert.equal(await row(plain, 'Glass of water on waking').getAttribute('aria-pressed'), 'true');
    assert.equal(await row(plain, 'Morning sunlight').getAttribute('aria-pressed'), 'false');

    // ...and undo the restore.
    await goTab(plain, 'Settings');
    await plain.getByRole('button', { name: 'Undo last restore' }).click();
    await plain.locator('.dialog').getByRole('button', { name: 'Go back' }).click();
    await plain.locator('.toast', { hasText: 'Earlier data restored' }).waitFor();
    await goTab(plain, 'Today');
    assert.equal(await row(plain, 'Morning sunlight').getAttribute('aria-pressed'), 'true');

    // A file that isn't a backup is rejected kindly.
    const junk = join(OUTPUT, 'not-a-backup.json');
    await writeFile(junk, '{"hello": "world"}');
    await goTab(plain, 'Settings');
    const [chooser2] = await Promise.all([plain.waitForEvent('filechooser'), plain.getByRole('button', { name: 'Restore' }).click()]);
    await chooser2.setFiles(junk);
    await plain.locator('.dialog', { hasText: 'doesn’t look like a Daybreak backup' }).waitFor();
  });

  test('a gentle reminder appears after 7 days without a backup', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T08:00:00' });
    await page.getByRole('button', { name: 'Got it' }).click(); // install hint
    await tick(page, 'Vitamin D');
    assert.equal(await page.locator('.notice-backup').count(), 0);
    await page.clock.setSystemTime(new Date('2026-11-12T08:00:00'));
    await reload(page);
    await page.locator('.notice-backup').waitFor();
    assert.match(await page.locator('.notice-backup').textContent(), /8 days since you started/);
    await shot(page, 'backup-reminder');
    await page.getByRole('button', { name: 'Not now' }).click();
    await page.locator('.notice-backup').waitFor({ state: 'detached' });
    await reload(page);
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.notice-backup').count(), 0);
  });

  test('dark mode follows the system', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T19:30:00', colorScheme: 'dark' });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    assert.equal(bg, 'rgb(15, 14, 19)');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.phase), 'evening');
    await tick(page, 'Socialised today (call, message or meet)');
    await shot(page, 'today-dark-evening');
    await goTab(page, 'Review');
    await shot(page, 'review-dark');
  });
});

describe('offline and updates', () => {
  test('works offline once installed', async (t) => {
    const site = await makeSite();
    t.after(() => site.close().catch(() => {}));
    const { page, context } = await openApp(t, site, { time: '2026-11-04T08:00:00' });
    await waitForServiceWorker(page);
    await tick(page, 'Glass of water on waking');
    await expectPoints(page, 10);
    // Take the server away entirely, then relaunch.
    site.server.closeAllConnections?.();
    await new Promise((resolve) => site.server.close(resolve));
    await reload(page);
    await page.locator('.view-today').waitFor();
    await expectPoints(page, 10);
    await goTab(page, 'Review');
    await page.locator('.chart').waitFor();
    await goTab(page, 'Settings');
    await page.getByText('Daybreak 1.0.0').waitFor();
    assert.ok(context);
  });

  test('changed files reach the installed app via the update banner', async (t) => {
    const site = await makeSite();
    t.after(() => site.close());
    const { page } = await openApp(t, site);
    await waitForServiceWorker(page);
    await reload(page); // now fully served by the service worker
    await page.locator('.view-today').waitFor();
    await goTab(page, 'Settings');
    await page.getByText('Daybreak 1.0.0').waitFor();

    // Deploy a fix without touching sw.js.
    const versionFile = join(site.dir, 'js/version.js');
    await writeFile(versionFile, (await readFile(versionFile, 'utf8')).replace("'1.0.0'", "'1.0.1'"));
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.locator('#update-banner.show').waitFor({ timeout: 20000 });
    await shot(page, 'update-banner');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Tap to refresh' }).click()]);
    // The refreshed app reopens where you were.
    await page.locator('.view-settings').waitFor();
    await page.getByText('Daybreak 1.0.1').waitFor();
    assert.ok(await page.locator('#update-banner').isHidden());
  });

  test('a new service worker version installs and takes over', async (t) => {
    const site = await makeSite();
    t.after(() => site.close());
    const { page } = await openApp(t, site);
    await waitForServiceWorker(page);
    const before = await page.evaluate(() => new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => resolve(e.data.version);
      navigator.serviceWorker.controller.postMessage({ type: 'GET_STATUS' }, [channel.port2]);
    }));
    assert.equal(before, '1.0.0');

    for (const [file, from, to] of [
      ['sw.js', "const VERSION = '1.0.0'", "const VERSION = '1.1.0'"],
      ['js/version.js', "'1.0.0'", "'1.1.0'"],
    ]) {
      const path = join(site.dir, file);
      await writeFile(path, (await readFile(path, 'utf8')).replace(from, to));
    }
    await goTab(page, 'Settings');
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.locator('#update-banner.show').waitFor({ timeout: 20000 });
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Tap to refresh' }).click()]);
    await page.locator('.view-settings').waitFor();
    await page.getByText('Daybreak 1.1.0 · offline copy 1.1.0').waitFor();
    const caches = await page.evaluate(() => caches.keys());
    assert.deepEqual(caches, ['daybreak-1.1.0']);
  });
});
