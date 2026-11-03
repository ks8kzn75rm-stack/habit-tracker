/**
 * Service worker registration and updates.
 *
 * Updates reach the installed app two ways:
 *  1. Changed app files: after every launch (and whenever the app comes back to
 *     the foreground) the service worker re-checks each file with the server and
 *     refreshes its offline copy, then tells the page -> "update ready" banner.
 *     This works even if sw.js itself didn't change.
 *  2. A changed sw.js: the new worker installs in the background and waits ->
 *     the same banner; tapping it activates the new worker and reloads.
 */
let registration = null;
let applying = false;

function banner() {
  return document.getElementById('update-banner');
}

export function showUpdateBanner() {
  const el = banner();
  if (!el || !el.hidden) return;
  el.hidden = false;
  void el.offsetWidth; // start from the off-screen position so it slides in
  el.classList.add('show');
}

function askWorker(message, timeout = 8000) {
  const worker = navigator.serviceWorker?.controller;
  if (!worker) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeout);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(event.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

export function workerStatus() {
  return askWorker({ type: 'GET_STATUS' });
}

function waitForInstall(worker, timeout = 15000) {
  return new Promise((resolve) => {
    if (!worker || worker.state !== 'installing') {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, timeout);
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installing') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/** Returns 'update' | 'latest' | 'offline' | 'unsupported'. */
export async function checkForUpdates({ force = false } = {}) {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = registration || (await navigator.serviceWorker.getRegistration());
  if (!reg) return 'unsupported';
  let offline = false;
  try {
    await reg.update();
  } catch {
    offline = true;
  }
  await waitForInstall(reg.installing);
  if (reg.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner();
    return 'update';
  }
  const result = await askWorker({ type: 'CHECK_UPDATES', force }, 20000);
  if (result?.changed || (result?.lastUpdatedAt && result.lastUpdatedAt > performance.timeOrigin)) {
    showUpdateBanner();
    return 'update';
  }
  if (offline || result?.error || !result) return 'offline';
  return 'latest';
}

export function applyUpdate() {
  const waiting = registration?.waiting;
  if (waiting) {
    applying = true;
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Fallback in case the controller change event never arrives.
    setTimeout(() => location.reload(), 4000);
  } else {
    location.reload();
  }
}

export function initPWA() {
  banner()?.querySelector('button')?.addEventListener('click', applyUpdate);
  if (!('serviceWorker' in navigator)) return;

  // Listen before anything async so no message from the worker is missed.
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'UPDATE_READY') showUpdateBanner();
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applying) location.reload();
  });

  navigator.serviceWorker
    .register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then((reg) => {
      registration = reg;
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBanner();
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner();
        });
      });
      // If the worker refreshed files after this page loaded, this page is stale.
      return workerStatus().then((status) => {
        if (status?.lastUpdatedAt && status.lastUpdatedAt > performance.timeOrigin) showUpdateBanner();
      });
    })
    .catch((err) => console.warn('Service worker registration failed', err));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates().catch(() => {});
  });
}
