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
const APP_VERSION = /APP_VERSION = '([^']+)'/.exec(await readFile(join(ROOT, 'js/version.js'), 'utf8'))[1];
/** '1.1.0' -> next patch '1.1.1' (part 2) or next minor '1.2.0' (part 1). */
const bump = (version, part) => version.split('.').map((n, i) => (i === part ? Number(n) + 1 : i > part ? 0 : Number(n))).join('.');
const V1_DATABASE = JSON.parse(await readFile(join(ROOT, 'tests/e2e/fixtures/daybreak-1.0.0-db.json'), 'utf8'));
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
async function openApp(t, site, { time = null, colorScheme = 'light', welcome = true, init = null, context = null, beforeLoad = null } = {}) {
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
  if (beforeLoad) await beforeLoad(page);
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

/**
 * Reload once every change has been written (a person can't reload within
 * milliseconds). The first open of a new day shows the Begin ritual: it's
 * skipped unless the test asks to keep it.
 */
async function reload(page, { ritual = 'skip' } = {}) {
  await page.evaluate(() => window.daybreakDebug?.flush());
  await page.reload();
  await page.locator('#view > .view').first().waitFor();
  if (ritual === 'skip' && (await page.locator('.flow-begin').count())) {
    await page.getByRole('button', { name: 'Skip for today' }).click();
    await page.locator('.view-today').waitFor();
  }
}

/** Put an IndexedDB in place at the app's origin before the app first loads. */
function seedDatabase(site, dump) {
  return async (page) => {
    await page.goto(`${site.url}manifest.json`);
    await page.evaluate(
      ({ name, version, keyPaths, stores }) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(name, version);
          request.onupgradeneeded = () => {
            for (const store of Object.keys(stores)) request.result.createObjectStore(store, { keyPath: keyPaths[store] });
          };
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(Object.keys(stores), 'readwrite');
            for (const [store, rows] of Object.entries(stores)) for (const r of rows) tx.objectStore(store).put(r);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
          request.onerror = () => reject(request.error);
        }),
      dump,
    );
  };
}

/** A fake share sheet that keeps the shared file, so a backup can be read back. */
const SHARE_STUB = `
  window.__shared = null;
  navigator.canShare = (data) => Boolean(data && data.files && data.files.length);
  navigator.share = async (data) => {
    const f = data.files[0];
    window.__shared = { name: f.name, type: f.type, text: await f.text(), keys: Object.keys(data) };
  };
`;

async function exportViaShare(page) {
  await goTab(page, 'Settings');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await page.locator('.toast', { hasText: 'Backup saved' }).waitFor();
  return page.evaluate(() => window.__shared);
}

async function restoreFile(page, path) {
  await goTab(page, 'Settings');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Restore' }).click()]);
  await chooser.setFiles(path);
  await page.locator('.dialog', { hasText: 'Restore this backup?' }).waitFor();
  await page.locator('.dialog').getByRole('button', { name: 'Restore' }).click();
  await page.locator('.toast', { hasText: 'Backup restored' }).waitFor();
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

const RITUAL_HABIT = 'Began my day with intention';
const MORNING_TUE = ['Glass of water on waking', 'Slept 7–8 hours', 'Morning sunlight', 'Phone-free until first real task is done', RITUAL_HABIT];
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
    // Default habits are grouped: 6 morning on a Wednesday (gym day), 6 daytime, 3 evening, 1 weekly.
    assert.equal(await page.locator('[data-section="morning"] .habit').count(), 6);
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
    await expectPoints(page, 10 + 10 + 10 + 15 + 15 + 20 + 25);
    assert.ok(await page.locator('.mw-badge.is-won').isVisible());
    await shot(page, 'morning-win');

    await reload(page);
    await page.locator('.view-today').waitFor();
    await expectPoints(page, 105);
    assert.equal(await row(page, 'Gym by 10am').getAttribute('aria-pressed'), 'true');

    await tick(page, 'Morning sunlight'); // undo
    await expectPoints(page, 105 - 10 - 25);
    assert.equal(await page.locator('.mw-badge.is-won').count(), 0);
    assert.equal(await row(page, 'Morning sunlight').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('.hero-stat').first().textContent(), /5 of 15 done/);
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
    assert.deepEqual(values.slice(0, 2), ['115', '85']);
    assert.match(await page.locator('.tiles').textContent(), /200\s*points/);
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
    await goTab(page, 'Foundations');
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
    await goTab(page, 'Foundations');
    await page.locator('.finished-row', { hasText: 'Office reset' }).waitFor();
  });

  test('backups export via the share sheet or a download, and restore', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T08:00:00', init: SHARE_STUB });
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
    assert.equal(backup.schema, 2);
    assert.equal(backup.data.habits.length, 16);
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

describe('Begin, focus and foundations', () => {
  let site;
  before(async () => {
    site = await makeSite();
  });
  after(async () => {
    await site.close();
  });

  test('the ritual opens once a day, after the day starts, and “Fired up” goes straight to choosing', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-03T20:00:00' });
    // The day it's installed there's no ritual: the welcome is enough.
    assert.equal(await page.locator('.flow-begin').count(), 0);
    // 3:30am still belongs to yesterday (the day starts at 4am).
    await page.clock.setSystemTime(new Date('2026-11-04T03:30:00'));
    await reload(page, { ritual: 'keep' });
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.flow-begin').count(), 0);

    // The first open after the day starts: the ritual is the front door.
    await page.clock.setSystemTime(new Date('2026-11-04T07:10:00'));
    await reload(page, { ritual: 'keep' });
    await page.getByRole('heading', { name: 'How are you arriving?' }).waitFor();
    await shot(page, 'ritual-arrive');
    await page.getByRole('button', { name: 'Fired up' }).click();
    // Fired up skips the breathing and the card.
    await page.getByRole('heading', { name: 'What’s your one main thing today?' }).waitFor();
    const cont = page.getByRole('button', { name: 'Continue' });
    assert.ok(await cont.isDisabled(), 'needs a main thing first');
    await page.locator('#main-thing').fill('Write the opening scene');
    await cont.click();
    await page.getByRole('heading', { name: 'Anything you’re letting go of today?' }).waitFor();
    await page.getByRole('button', { name: 'Checking messages first thing' }).click();
    assert.equal(await page.locator('#letting-go').inputValue(), 'Checking messages first thing');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('.begin-sentence').waitFor();
    assert.match(await page.locator('.flow-kicker').textContent(), /Today: Write the opening scene/);
    await page.getByRole('radio', { name: '50 min' }).click();
    assert.match(await page.locator('.begin-sentence').textContent(), /for 50 minutes/);
    await shot(page, 'ritual-begin');
    await page.getByRole('button', { name: 'Begin', exact: true }).click();

    // It ends in action: a focus session on the main thing.
    await page.locator('.flow-focus .focus-dial').waitFor();
    assert.equal(await page.locator('.focus-intent').textContent(), 'Write the opening scene');
    assert.match(await page.locator('.focus-of').textContent(), /of 50 min/);
    await page.locator('.toast', { hasText: RITUAL_HABIT }).waitFor();
    await page.getByRole('button', { name: 'Finish' }).click(); // under a minute: nothing to log
    await page.locator('.view-today').waitFor();
    assert.equal(await row(page, RITUAL_HABIT).getAttribute('aria-pressed'), 'true');
    await expectPoints(page, 15);
    assert.match(await page.locator('.begin-card').textContent(), /Write the opening scene/);
    assert.equal(await page.locator('.begin-card').getByRole('link', { name: 'Morning ritual · 1 min' }).count(), 0);

    // Opening the app again the same day goes straight to Today.
    await reload(page, { ritual: 'keep' });
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.flow-begin').count(), 0);
  });

  test('skipping takes one tap, never nags, and the ritual stays one tap away', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-03T09:00:00' });
    await page.clock.setSystemTime(new Date('2026-11-04T08:00:00'));
    await reload(page, { ritual: 'keep' });
    await page.locator('.flow-begin').waitFor();
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.locator('.view-today').waitFor();
    await reload(page, { ritual: 'keep' });
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.flow-begin').count(), 0, 'no second offer after skipping');

    // Begin and I'm stuck are always on Today; the ritual is one tap away.
    const card = page.locator('.begin-card');
    assert.ok(await card.getByRole('link', { name: 'Begin' }).isVisible());
    assert.ok(await card.getByRole('link', { name: 'I’m stuck' }).isVisible());
    await card.getByRole('link', { name: 'Morning ritual · 1 min' }).click();
    await page.getByRole('button', { name: 'Anxious' }).click();
    await page.getByRole('button', { name: /Breathe with me/ }).waitFor();
    await page.getByRole('button', { name: 'Skip this' }).click();
    await page.locator('.ritual-card .ritual-card-credit', { hasText: /^(Idea from|Inspired by) / }).waitFor();
    await shot(page, 'ritual-card');
    await page.getByRole('button', { name: 'Skip', exact: true }).click();
    await page.locator('.view-today').waitFor();

    // Evenings belong to the reflection: no ritual from 6pm.
    await page.clock.setSystemTime(new Date('2026-11-05T18:30:00'));
    await reload(page, { ritual: 'keep' });
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.flow-begin').count(), 0);

    // Coming back to the open app on a new morning counts as the first open.
    await page.clock.setSystemTime(new Date('2026-11-06T07:00:00'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.flow-begin').waitFor();
  });

  test('a long focus session ticks deep work, survives a reload, and shipped work blooms', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T09:00:00' });
    await page.locator('.begin-card').getByRole('link', { name: 'Begin' }).click();
    await page.locator('#focus-intent').fill('Draft chapter two');
    await page.getByRole('radio', { name: '90 min' }).click();
    await page.getByRole('button', { name: 'Begin' }).click();
    await page.locator('.focus-dial').waitFor();
    await page.clock.fastForward('40:00');
    await page.locator('.focus-elapsed', { hasText: /^40$/ }).waitFor();

    // Locking the phone or closing the app doesn't lose the session.
    await reload(page);
    await page.locator('.focus-elapsed', { hasText: /^40$/ }).waitFor();
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.begin-card.is-running').waitFor();
    assert.match(await page.locator('.begin-card').textContent(), /40 of 90 min/);
    await shot(page, 'today-in-focus');
    await page.locator('.begin-card').getByRole('link', { name: 'Return to focus' }).click();

    await page.clock.fastForward('50:00');
    await page.getByRole('heading', { name: '1h 30m. That’s showing up.' }).waitFor();
    await page.getByRole('button', { name: 'Log it' }).click();
    await page.getByText('Ticked for you: Deep-work block on content (90 min)').waitFor();
    await page.getByRole('button', { name: 'Yes, I shipped something' }).click();
    await page.locator('#shipped-note').fill('Sent chapter two to a reader');
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('.view-today').waitFor();
    assert.equal(await row(page, 'Deep-work block on content (90 min)').getAttribute('aria-pressed'), 'true');
    await expectPoints(page, 20);

    await goTab(page, 'Foundations');
    await page.locator('.garden-card').getByRole('link', { name: 'See all' }).click();
    await page.locator('.view-evidence').waitFor();
    assert.equal(await page.locator('.garden-card .garden-summary').textContent(), '1 session · 1h 30m of focus · 1 shipped');
    assert.equal(await page.locator('.garden .plant.is-bloom').count(), 1);
    const entry = page.locator('.evidence-row', { hasText: 'Draft chapter two' });
    assert.equal(await entry.getByRole('button', { name: 'Shipped' }).getAttribute('aria-pressed'), 'true');
    await shot(page, 'evidence');

    // Something shipped outside a session blooms too.
    await page.locator('#shipped-new').fill('Posted the update');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.locator('.evidence-row', { hasText: 'Posted the update' }).waitFor();
    assert.equal(await page.locator('.garden .plant.is-bloom').count(), 2);
  });

  test('“I’m stuck” names the Resistance, reframes it and starts five minutes', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T10:00:00' });
    await page.locator('.begin-card').getByRole('link', { name: 'I’m stuck' }).click();
    await page.getByRole('heading', { name: 'What shape is it taking?' }).waitFor();
    for (const label of ['Perfectionism', 'Distraction', '“Not ready yet”', 'Self-doubt', 'A reasonable-sounding excuse']) {
      assert.ok(await page.getByRole('button', { name: label, exact: true }).isVisible(), label);
    }
    await page.getByRole('button', { name: 'Self-doubt' }).click();
    await page.locator('.ritual-card-credit', { hasText: 'Idea from The War of Art by Steven Pressfield' }).waitFor();
    await shot(page, 'stuck-reframe');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Start 5 minutes' }).click();
    await page.locator('.flow-focus .focus-dial').waitFor();
    assert.equal(await page.locator('.flow-kicker').first().textContent(), 'Five minutes, starting now');
    await page.clock.fastForward('05:00');
    await page.getByRole('button', { name: 'Log it' }).click();
    await page.getByRole('heading', { name: '5 min of focus' }).waitFor();
    await page.locator('.toast', { hasText: 'Badge unlocked: Unstuck' }).waitFor();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.locator('.view-today').waitFor();
    // Five minutes isn't a deep-work block.
    assert.equal(await row(page, 'Deep-work block on content (90 min)').getAttribute('aria-pressed'), 'false');
  });

  test('the evening reflection saves a word that greets you the next morning', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T21:00:00' });
    const link = page.locator('.reflect-link');
    assert.match(await link.getAttribute('class'), /is-evening/);
    await link.click();
    await page.getByRole('heading', { name: 'Did you show up today?' }).waitFor();
    await page.getByRole('button', { name: 'In part' }).click();
    await page.getByText('Partly counts.').waitFor();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.locator('#reflect-joy').fill('A long walk at lunchtime');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'What are you letting go of?' }).waitFor();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('button', { name: 'Brave' }).click();
    await shot(page, 'reflect-word');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByText('Your word for tomorrow: Brave').waitFor();
    await page.getByRole('button', { name: 'Done for today' }).click();
    await page.locator('.reflect-link.is-done', { hasText: 'Tomorrow’s word: Brave' }).waitFor();

    await page.clock.setSystemTime(new Date('2026-11-05T07:30:00'));
    await reload(page, { ritual: 'keep' });
    await page.locator('.flow-word', { hasText: 'Brave' }).waitFor();
    await page.getByRole('button', { name: 'Skip for today' }).click();
    await page.locator('.begin-word', { hasText: 'Brave' }).waitFor();
  });

  test('foundations: your why, at most three active projects, and a parking lot', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T11:00:00' });
    await goTab(page, 'Foundations');
    await page.locator('.foundation-tile', { hasText: 'Your why' }).click();
    await page.locator('#foundation-why').fill('Because the work makes me feel most like myself.');
    await page.locator('.note-saved.show').waitFor();
    await page.locator('.back-link').click();
    await page.locator('.foundation-tile', { hasText: 'feel most like myself' }).waitFor();

    for (const name of ['Album demo', 'Shed rebuild', 'Spanish course', 'Website refresh']) {
      await page.evaluate(() => {
        location.hash = '#/projects/new';
      });
      await page.locator('#project-name').fill(name);
      await page.getByRole('button', { name: 'Create project' }).click();
      await page.locator('.view-project').waitFor();
    }
    await page.locator('.toast', { hasText: 'waits in the parking lot' }).waitFor();
    await goTab(page, 'Foundations');
    await page.locator('.view-foundations').waitFor();
    const active = page.locator('#active-projects');
    assert.equal(await active.locator('.project-card').count(), 3);
    assert.equal(await active.locator('.card-aside').textContent(), '3 of 3');
    await active.getByText('Three is plenty.', { exact: false }).waitFor();

    // A fourth can only come in if one rests.
    await page.locator('#parking-lot .manage-row', { hasText: 'Website refresh' }).getByRole('button', { name: 'Make active' }).click();
    const dialog = page.locator('.dialog', { hasText: 'Three projects are already active' });
    await dialog.waitFor();
    await shot(page, 'project-limit');
    await dialog.getByRole('button', { name: 'Park “Shed rebuild”' }).click();
    await active.locator('.project-card', { hasText: 'Website refresh' }).waitFor();
    await page.locator('#parking-lot .manage-row', { hasText: 'Shed rebuild' }).waitFor();
    assert.equal(await active.locator('.project-card').count(), 3);

    await page.locator('#parking-idea').fill('Learn to make bread');
    await page.locator('#parking-idea').press('Enter');
    await page.locator('#parking-lot .manage-row', { hasText: 'Learn to make bread' }).waitFor();
    await shot(page, 'foundations');

    // The active projects are the choices for the morning's main thing.
    await page.evaluate(() => {
      location.hash = '#/begin';
    });
    await page.getByRole('button', { name: 'Fired up' }).click();
    await page.getByRole('heading', { name: 'What’s your one main thing today?' }).waitFor();
    // The previous step lingers briefly while it fades out, so read only the current one.
    const choices = await page.locator('.flow-step:not(.leaving) .flow-choice-label').allTextContents();
    assert.deepEqual(choices, ['Album demo', 'Spanish course', 'Website refresh', 'Something else']);
  });

  test('the card library: favourite, hide, write your own and restore', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T11:00:00' });
    await goTab(page, 'Settings');
    await page.getByRole('link', { name: /Card library/ }).click();
    await page.locator('.view-cards').waitFor();
    assert.match(await page.locator('.page-subtitle').textContent(), /^66 cards/);
    assert.equal(await page.locator('.lib-card').count(), 66);
    const credits = await page.locator('.lib-card-credit').allTextContents();
    assert.ok(credits.every((c) => /^(Idea from|Inspired by) /.test(c)), 'every card has a credit line');

    await page.locator('.lib-card').first().getByRole('button', { name: 'Favourite this card' }).click();
    await page.locator('.lib-card').first().getByRole('button', { name: 'Remove from favourites' }).waitFor();
    await page.locator('.lib-card').nth(1).getByRole('button', { name: 'Hide this card' }).click();
    await page.locator('.lib-card.is-hidden').waitFor();
    await page.getByRole('radio', { name: 'Favourites' }).click();
    assert.equal(await page.locator('.lib-card').count(), 1);
    await page.getByRole('radio', { name: 'Hidden' }).click();
    assert.equal(await page.locator('.lib-card').count(), 1);

    await page.getByRole('link', { name: 'Write' }).click();
    await page.locator('#card-text').fill('Small and steady beats big and someday.');
    await page.locator('#card-theme').selectOption('patience');
    await page.getByRole('button', { name: 'Add card' }).click();
    await page.locator('.toast', { hasText: 'Card added to your library' }).waitFor();
    await page.getByRole('radio', { name: 'Yours' }).click();
    await page.locator('.lib-card', { hasText: 'Small and steady beats big and someday.' }).getByText('Your own card').waitFor();
    assert.match(await page.locator('.page-subtitle').textContent(), /^67 cards/);

    // Edit a built-in card's words, then restore the original.
    await page.getByRole('radio', { name: 'All' }).click();
    const original = await page.locator('.lib-card-text').first().textContent();
    await page.locator('.lib-card').first().getByRole('link', { name: 'Edit this card' }).click();
    await page.locator('#card-text').fill('My own words for this one.');
    await page.getByRole('button', { name: 'Save card' }).click();
    const edited = page.locator('.lib-card', { hasText: 'My own words for this one.' });
    await edited.getByText('edited by you').waitFor();
    await edited.getByRole('link', { name: 'Edit this card' }).click();
    await page.getByRole('button', { name: 'Restore original' }).click();
    await page.locator('.dialog').getByRole('button', { name: 'Restore' }).click();
    await page.locator('.view-cards').waitFor();
    assert.equal(await page.locator('.lib-card-text').first().textContent(), original);
  });

  test('the weekly tune-up runs inside the review', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T18:30:00' });
    await goTab(page, 'Review');
    await page.getByRole('link', { name: /Weekly tune-up · 2 min/ }).click();
    await page.getByRole('heading', { name: 'Your proof this week' }).waitFor();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Cards you met this week' }).waitFor();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Anything to adjust?' }).waitFor();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Update one foundation' }).waitFor();
    await page.getByRole('radio', { name: 'A joy' }).click();
    await page.locator('#tune-foundation').fill('Morning coffee outside');
    await page.getByRole('button', { name: 'Save & finish' }).click();
    await page.getByRole('heading', { name: 'Tuned up.' }).waitFor();
    await page.getByRole('button', { name: 'Back to your review' }).click();
    await page.locator('.tuneup-card.is-done', { hasText: 'Tuned up this week' }).waitFor();
    await goTab(page, 'Foundations');
    await page.locator('.foundation-tile', { hasText: 'Morning coffee outside' }).waitFor();
  });

  test('perspective views are off by default, opt-in, and invite rather than alarm', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T12:00:00' });
    await goTab(page, 'Foundations');
    await page.locator('.view-foundations').waitFor();
    assert.equal(await page.locator('.perspective-link').count(), 0);
    await goTab(page, 'Settings');
    const card = page.locator('#perspective');
    await card.getByText('Life in weeks', { exact: true }).click();
    await page.locator('#birth-date').fill('1990-06-15');
    await card.getByText('This season', { exact: true }).click();
    await page.locator('#season-end').fill('2027-03-31');
    await page.locator('#season-label').fill('Writing season');
    await page.locator('#season-label').press('Enter');
    await card.getByRole('link', { name: 'Open Perspective' }).click();
    await page.locator('.season-weeks', { hasText: '22 weeks to make count' }).waitFor();
    assert.match(await page.locator('.season-kicker').textContent(), /Writing season/);
    assert.match(await page.locator('.life-card').textContent(), /This is week 1,899 of about 4,000/);
    assert.equal(await page.locator('.life-week').count(), 4000);
    assert.equal(await page.locator('.life-week.now').count(), 1);
    await shot(page, 'perspective');
    await goTab(page, 'Today');
    await page.locator('.begin-card', { hasText: 'Writing season · 22 weeks to make count' }).waitFor();
  });

  test('the improvement inbox copies every idea in one tap', async (t) => {
    const { page, context } = await openApp(t, site, { time: '2026-11-04T12:00:00' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.origin });
    await goTab(page, 'Settings');
    await page.locator('#inbox-new').fill('Let me reorder joys');
    await page.getByRole('button', { name: 'Add idea' }).click();
    await page.locator('.inbox-item', { hasText: 'Let me reorder joys' }).waitFor();
    await page.locator('#inbox-new').fill('A softer chime\nwhen a session ends');
    await page.getByRole('button', { name: 'Add idea' }).click();
    await page.locator('.inbox-item').nth(1).waitFor();
    await page.getByRole('button', { name: 'Copy all' }).click();
    await page.locator('.toast', { hasText: 'Copied 2 ideas' }).waitFor();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(text, /^Daybreak ideas \(/);
    assert.match(text, /- Let me reorder joys\n- A softer chime\n {2}when a session ends\n$/);
  });

  test('version 1.0.0 data is migrated safely, and today’s score never drops', async (t) => {
    // A morning with nothing ticked yet: the ritual habit joins today.
    const { page } = await openApp(t, site, {
      time: '2026-11-04T07:30:00',
      init: SHARE_STUB,
      welcome: false,
      beforeLoad: seedDatabase(site, V1_DATABASE),
    });
    const news = page.locator('.dialog', { hasText: 'New in Daybreak: Begin' });
    await news.waitFor();
    assert.match(await news.textContent(), /“Tax return” moved to the parking lot/);
    await shot(page, 'whats-new');
    await news.getByRole('button', { name: 'Later' }).click();
    await row(page, RITUAL_HABIT).waitFor();
    // Old days are untouched.
    await page.locator('.strip').getByRole('link', { name: 'Mon 2 Nov' }).click();
    await page.locator('.hero-title', { hasText: 'Monday 2 November' }).waitFor();
    assert.equal(await page.locator('#day-note').inputValue(), 'First day with the app.');
    assert.equal(await row(page, 'Morning sunlight').getAttribute('aria-pressed'), 'true');
    // A habit added on Wednesday isn't due on Monday.
    assert.equal(await row(page, RITUAL_HABIT).count(), 0);

    await goTab(page, 'Foundations');
    await page.locator('.view-foundations').waitFor();
    assert.deepEqual(await page.locator('#active-projects .project-name').allTextContents(), ['Write the newsletter', 'Garden shed', 'Learn the guitar riff']);
    await page.locator('#parking-lot .manage-row', { hasText: 'Tax return' }).waitFor();
    await page.locator('.finished-row', { hasText: 'Office reset' }).waitFor();

    const shared = await exportViaShare(page);
    const { schema, data } = JSON.parse(shared.text);
    assert.equal(schema, 2);
    const plainDays = (days) => days.map((d) => ({ date: d.date, done: d.done, note: d.note }));
    assert.deepEqual(plainDays(data.days), plainDays(V1_DATABASE.stores.days));
    assert.equal(data.habits.length, V1_DATABASE.stores.habits.length + 1);
    for (const old of V1_DATABASE.stores.habits) assert.ok(data.habits.some((x) => x.id === old.id && x.name === old.name), old.name);
    assert.equal(data.habits.find((x) => x.ritual).createdDay, '2026-11-04');
    assert.equal(data.habits.find((x) => x.id === 'd-deep-work').focusAuto, true);
    assert.equal(data.projects.find((p) => p.name === 'Tax return').status, 'parked');
    assert.equal(data.meta.dataVersion, 2);
    for (const key of ['journal', 'sessions', 'cards', 'inbox']) assert.deepEqual(data[key], [], key);

    // The news shows once, and the ritual doesn't pop up later the same day.
    await goTab(page, 'Today');
    await page.locator('.view-today').waitFor();
    await reload(page, { ritual: 'keep' });
    await page.locator('.view-today').waitFor();
    assert.equal(await page.locator('.dialog').count(), 0);
    assert.equal(await page.locator('.flow-begin').count(), 0);

    // An update that lands mid-day, after ticking: the new habit starts tomorrow.
    const { page: evening } = await openApp(t, site, {
      time: '2026-11-03T20:00:00',
      welcome: false,
      beforeLoad: seedDatabase(site, V1_DATABASE),
    });
    const later = evening.locator('.dialog', { hasText: 'starting tomorrow morning' });
    await later.waitFor();
    await later.getByRole('button', { name: 'Lovely' }).click();
    await expectPoints(evening, 25);
    assert.equal(await row(evening, RITUAL_HABIT).count(), 0);
    assert.equal(await row(evening, 'Glass of water on waking').getAttribute('aria-pressed'), 'true');
    await evening.clock.setSystemTime(new Date('2026-11-04T07:00:00'));
    await reload(evening, { ritual: 'keep' });
    await evening.locator('.flow-begin').waitFor();
    await evening.getByRole('button', { name: 'Skip for today' }).click();
    await row(evening, RITUAL_HABIT).waitFor();
  });

  test('backups carry the new data: ritual, foundations, sessions, cards and ideas', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T09:00:00', init: SHARE_STUB });
    // A ritual that ends with a start time later this morning.
    await page.locator('.begin-card').getByRole('link', { name: 'Morning ritual · 1 min' }).click();
    await page.getByRole('button', { name: 'Fired up' }).click();
    await page.locator('#main-thing').fill('Plan the week');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Nothing today' }).click();
    await page.getByLabel('Start time').fill('10:30');
    await page.getByRole('button', { name: 'I’ll begin at 10:30' }).click();
    await page.locator('.view-today').waitFor();
    await page.locator('.begin-card', { hasText: 'Starting at 10:30 for 25 min' }).waitFor();

    await page.evaluate(() => {
      location.hash = '#/foundations/why';
    });
    await page.locator('#foundation-why').fill('To make things that help.');
    await page.locator('.note-saved.show').waitFor();
    await page.evaluate(() => {
      location.hash = '#/cards';
    });
    await page.locator('.lib-card').first().getByRole('button', { name: 'Favourite this card' }).click();
    await page.evaluate(() => {
      location.hash = '#/evidence';
    });
    await page.locator('#shipped-new').fill('Sent the proposal');
    await page.getByRole('button', { name: 'Add' }).click();
    await page.locator('.evidence-row', { hasText: 'Sent the proposal' }).waitFor();
    await goTab(page, 'Settings');
    await page.locator('#inbox-new').fill('Weekly summary email to myself');
    await page.getByRole('button', { name: 'Add idea' }).click();
    await page.locator('.inbox-item').waitFor();

    const shared = await exportViaShare(page);
    const { data } = JSON.parse(shared.text);
    assert.equal(data.journal.length, 1);
    assert.equal(data.journal[0].ritual.mainThing.text, 'Plan the week');
    assert.equal(data.journal[0].ritual.plan.startAt, 630);
    assert.ok(data.journal[0].ritual.completedAt);
    assert.equal(data.foundations.why, 'To make things that help.');
    assert.deepEqual(data.cards.map((c) => [c.favourite, c.hidden]), [[true, false]]);
    assert.deepEqual(data.sessions.map((s) => [s.kind, s.shippedNote]), [['shipped', 'Sent the proposal']]);
    assert.deepEqual(data.inbox.map((i) => i.text), ['Weekly summary email to myself']);

    // Restore it into a fresh install.
    const backupPath = join(OUTPUT, 'backup-v2-under-test.json');
    await writeFile(backupPath, shared.text);
    const { page: fresh } = await openApp(t, site, { time: '2026-11-04T09:30:00' });
    await restoreFile(fresh, backupPath);
    await fresh.locator('.inbox-item', { hasText: 'Weekly summary email to myself' }).waitFor();
    await goTab(fresh, 'Today');
    assert.equal(await row(fresh, RITUAL_HABIT).getAttribute('aria-pressed'), 'true');
    await fresh.locator('.begin-card', { hasText: 'Plan the week' }).waitFor();
    await goTab(fresh, 'Foundations');
    await fresh.locator('.foundation-tile', { hasText: 'To make things that help.' }).waitFor();
    assert.match(await fresh.locator('.garden-summary').textContent(), /1 shipped/);
    await fresh.evaluate(() => {
      location.hash = '#/cards';
    });
    await fresh.getByRole('radio', { name: 'Favourites' }).click();
    assert.equal(await fresh.locator('.lib-card').count(), 1);
  });

  test('the ritual and focus screens in the evening and dark mode', async (t) => {
    const { page } = await openApp(t, site, { time: '2026-11-04T21:30:00', colorScheme: 'dark' });
    await page.locator('.reflect-link').click();
    await page.getByRole('heading', { name: 'Did you show up today?' }).waitFor();
    assert.equal(await page.locator('.view-flow').getAttribute('data-mood'), 'evening');
    await shot(page, 'reflect-dark');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.begin-card').getByRole('link', { name: 'Begin' }).click();
    await page.locator('.flow-focus').waitFor();
    await shot(page, 'focus-setup-dark');
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
    await page.getByText(`Daybreak ${APP_VERSION}`).waitFor();
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
    await page.getByText(`Daybreak ${APP_VERSION}`).waitFor();

    // Deploy a fix without touching sw.js.
    const fixed = bump(APP_VERSION, 2);
    const versionFile = join(site.dir, 'js/version.js');
    await writeFile(versionFile, (await readFile(versionFile, 'utf8')).replace(`'${APP_VERSION}'`, `'${fixed}'`));
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.locator('#update-banner.show').waitFor({ timeout: 20000 });
    await shot(page, 'update-banner');
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Tap to refresh' }).click()]);
    // The refreshed app reopens where you were.
    await page.locator('.view-settings').waitFor();
    await page.getByText(`Daybreak ${fixed}`).waitFor();
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
    assert.equal(before, APP_VERSION);

    const next = bump(APP_VERSION, 1);
    for (const [file, from, to] of [
      ['sw.js', `const VERSION = '${APP_VERSION}'`, `const VERSION = '${next}'`],
      ['js/version.js', `'${APP_VERSION}'`, `'${next}'`],
    ]) {
      const path = join(site.dir, file);
      await writeFile(path, (await readFile(path, 'utf8')).replace(from, to));
    }
    await goTab(page, 'Settings');
    await page.getByRole('button', { name: 'Check for updates' }).click();
    await page.locator('#update-banner.show').waitFor({ timeout: 20000 });
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Tap to refresh' }).click()]);
    await page.locator('.view-settings').waitFor();
    await page.getByText(`Daybreak ${next} · offline copy ${next}`).waitFor();
    const caches = await page.evaluate(() => caches.keys());
    assert.deepEqual(caches, [`daybreak-${next}`]);
  });
});
