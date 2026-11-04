/*
 * Daybreak service worker.
 *
 * - Precaches every app file into a versioned cache, so the app opens
 *   instantly and works fully offline.
 * - After each launch (and on request from the page), re-checks every file
 *   with the server. If anything changed, the offline copy is refreshed and the
 *   page is told an update is ready (it shows a "tap to refresh" banner).
 *   That means deployed fixes arrive even if this file wasn't edited.
 * - When this file changes, the browser installs the new worker alongside the
 *   old one; the page offers the same banner, which activates it.
 */
const VERSION = '1.1.0';
const CACHE_PREFIX = 'daybreak-';
const CACHE = `${CACHE_PREFIX}${VERSION}`;
const SCOPE = new URL('./', self.location).href;
const INDEX = new URL('./index.html', self.location).href;
const META = new URL('./__sw-meta', self.location).href;
const RECHECK_AFTER_LAUNCH_MS = 3000;
const MIN_RECHECK_GAP_MS = 60000;

// Every file the app needs offline. tests/unit/repo.test.js keeps this in sync.
const PRECACHE = [
  './index.html',
  './manifest.json',
  './css/app.css',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/boot.js',
  './js/nav.js',
  './js/platform.js',
  './js/pwa.js',
  './js/version.js',
  './js/core/backup.js',
  './js/core/badges.js',
  './js/core/cards.js',
  './js/core/copy.js',
  './js/core/dates.js',
  './js/core/defaults.js',
  './js/core/focus.js',
  './js/core/migrate.js',
  './js/core/model.js',
  './js/core/morning-window.js',
  './js/core/perspective.js',
  './js/core/review.js',
  './js/core/ritual.js',
  './js/core/schedule.js',
  './js/core/scoring.js',
  './js/core/stats.js',
  './js/core/streaks.js',
  './js/core/wip.js',
  './js/data/db.js',
  './js/data/store.js',
  './js/ui/backup.js',
  './js/ui/begin.js',
  './js/ui/card-library.js',
  './js/ui/celebrations.js',
  './js/ui/components.js',
  './js/ui/dom.js',
  './js/ui/evidence.js',
  './js/ui/flow.js',
  './js/ui/focus-timer.js',
  './js/ui/foundations.js',
  './js/ui/fx.js',
  './js/ui/garden.js',
  './js/ui/habit-editor.js',
  './js/ui/icons.js',
  './js/ui/overlay.js',
  './js/ui/perspective.js',
  './js/ui/progress.js',
  './js/ui/projects.js',
  './js/ui/reflect.js',
  './js/ui/review.js',
  './js/ui/settings.js',
  './js/ui/stuck.js',
  './js/ui/today.js',
  './js/ui/tune-up.js',
].map((path) => new URL(path, self.location).href);

const PRECACHED = new Set(PRECACHE);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  const reply = (data) => event.ports?.[0]?.postMessage(data);
  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (message.type === 'GET_STATUS') {
    event.waitUntil(readMeta().then((meta) => reply({ version: VERSION, cache: CACHE, lastUpdatedAt: meta.lastUpdatedAt || null })));
  } else if (message.type === 'CHECK_UPDATES') {
    event.waitUntil(
      revalidate({ force: Boolean(message.force) }).then(reply, (err) =>
        reply({ changed: false, error: String(err?.message || err) }),
      ),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  const url = new URL(request.url);
  const clean = url.origin + url.pathname;

  if (request.mode === 'navigate') {
    if (clean === SCOPE || clean === INDEX) {
      event.respondWith(serveShell(request));
      event.waitUntil(
        sleep(RECHECK_AFTER_LAUNCH_MS)
          .then(() => revalidate())
          .catch(() => {}),
      );
    }
    return;
  }
  if (PRECACHED.has(clean)) event.respondWith(serveAsset(request, clean));
});

/**
 * Serve with "Cache-Control: no-cache". Without this, the browser's in-memory
 * cache may reuse a file from the previous page load (GitHub Pages sends a
 * 10-minute max-age) and skip this worker, so a refresh after an update could
 * keep running old code. no-cache makes every load come back here.
 */
function fromWorker(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function serveShell(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(INDEX, { ignoreVary: true });
  if (cached) return fromWorker(cached);
  try {
    const response = await fetch(request);
    if (response.ok && !response.redirected) await cache.put(INDEX, response.clone());
    return response.redirected ? fromWorker(response) : response;
  } catch {
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Daybreak</title><p style="font:16px system-ui;padding:24px">Daybreak needs a connection the first time it opens. Please try again when you’re online.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function serveAsset(request, url) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(url, { ignoreVary: true });
  if (cached) return fromWorker(cached);
  const response = await fetch(request);
  if (response.ok) cache.put(url, response.clone()).catch(() => {});
  return fromWorker(response);
}

async function readMeta() {
  try {
    const cache = await caches.open(CACHE);
    const response = await cache.match(META);
    return response ? await response.json() : {};
  } catch {
    return {};
  }
}

function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

let inflight = null;
let lastCheck = 0;

/**
 * Compare every precached file with the server ('no-cache' revalidates via
 * ETag, so unchanged files cost a 304). All files must download before any is
 * replaced, so the offline copy is never left half-updated.
 */
function revalidate({ force = false } = {}) {
  if (inflight) return inflight;
  if (!force && Date.now() - lastCheck < MIN_RECHECK_GAP_MS) {
    return readMeta().then((meta) => ({ changed: false, skipped: true, lastUpdatedAt: meta.lastUpdatedAt || null }));
  }
  inflight = (async () => {
    try {
      const cache = await caches.open(CACHE);
      const results = await Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(new Request(url, { cache: 'no-cache' }));
          if (!response.ok) throw new Error(`${response.status} for ${url}`);
          const fresh = await response.clone().arrayBuffer();
          const cached = await cache.match(url, { ignoreVary: true });
          const changed = !cached || !sameBytes(fresh, await cached.arrayBuffer());
          return { url, response, changed };
        }),
      );
      const changed = results.filter((r) => r.changed);
      if (!changed.length) return { changed: false, lastUpdatedAt: (await readMeta()).lastUpdatedAt || null };

      await Promise.all(changed.map((r) => cache.put(r.url, r.response)));
      const lastUpdatedAt = Date.now();
      await cache.put(META, new Response(JSON.stringify({ lastUpdatedAt }), { headers: { 'Content-Type': 'application/json' } }));
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.postMessage({ type: 'UPDATE_READY', lastUpdatedAt });
      return { changed: true, files: changed.length, lastUpdatedAt };
    } finally {
      lastCheck = Date.now();
      inflight = null;
    }
  })();
  return inflight;
}
