/*
 * Start-up safety net (a classic script, so it runs even if a module fails).
 * If the app hasn't started after a while, or a script fails to load, show a
 * screen offering to reload, or to clear the offline copy of the app and
 * reload. Repairing never touches your habits or history.
 */
(function () {
  var booted = false;
  var timer = setTimeout(show, 10000);

  window.__daybreakBooted = function () {
    booted = true;
    clearTimeout(timer);
    var el = document.getElementById('boot-fallback');
    if (el) el.hidden = true;
  };

  function onEarlyError() {
    if (!booted) setTimeout(show, 1500);
  }
  window.addEventListener('error', onEarlyError, true);
  window.addEventListener('unhandledrejection', onEarlyError);

  function show() {
    if (booted) return;
    var el = document.getElementById('boot-fallback');
    if (!el || !el.hidden) return;
    el.hidden = false;
    el.querySelector('[data-action="reload"]').onclick = function () {
      location.reload();
    };
    el.querySelector('[data-action="repair"]').onclick = repair;
  }

  function repair() {
    var tasks = [];
    if ('serviceWorker' in navigator) {
      tasks.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    if (window.caches) {
      tasks.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        })
      );
    }
    Promise.all(tasks)
      .catch(function () {})
      .then(function () {
        location.reload();
      });
  }
})();
