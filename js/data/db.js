/**
 * Minimal promise-based IndexedDB wrapper.
 *
 * Object stores: habits (key: id), days (key: date), projects (key: id),
 * kv (key: key) for settings, meta and the pre-import safety copy.
 *
 * Safari occasionally drops IndexedDB connections (for example after the app
 * has been suspended for a while); a failed transaction on a dead connection is
 * retried once on a fresh connection.
 */
const DB_NAME = 'daybreak';
const DB_VERSION = 1;
export const STORES = ['habits', 'days', 'projects', 'kv'];
const KEY_PATHS = { habits: 'id', days: 'date', projects: 'id', kv: 'key' };

let dbPromise = null;

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    let request;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: KEY_PATHS[name] });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

export function openDB() {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

const RETRYABLE = new Set(['InvalidStateError', 'UnknownError', 'TransactionInactiveError']);

async function run(storeNames, mode, body, attempt = 0) {
  const db = await openDB();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('The database transaction was aborted.'));
      result = body(tx);
      // Commit straight away rather than waiting for the next turn, which
      // shortens the window in which closing the app could lose a write.
      if (mode === 'readwrite' && typeof tx.commit === 'function') tx.commit();
    });
  } catch (err) {
    if (attempt === 0 && RETRYABLE.has(err?.name)) {
      try {
        db.close();
      } catch {
        // already closed
      }
      dbPromise = null;
      return run(storeNames, mode, body, 1);
    }
    throw err;
  }
}

/** Every record in every store: { habits: [], days: [], projects: [], kv: [] } */
export function loadAll() {
  return run(STORES, 'readonly', (tx) => {
    const out = {};
    for (const name of STORES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        out[name] = request.result;
      };
    }
    return out;
  });
}

export function get(store, key) {
  return run([store], 'readonly', (tx) => {
    const out = {};
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => {
      out.value = request.result;
    };
    return out;
  }).then((out) => out.value);
}

export function put(store, value) {
  return run([store], 'readwrite', (tx) => {
    tx.objectStore(store).put(value);
  });
}

export function putMany(store, values) {
  return run([store], 'readwrite', (tx) => {
    const os = tx.objectStore(store);
    for (const value of values) os.put(value);
  });
}

export function remove(store, key) {
  return run([store], 'readwrite', (tx) => {
    tx.objectStore(store).delete(key);
  });
}

/** Atomically replace the contents of every store. */
export function replaceAll(data) {
  return run(STORES, 'readwrite', (tx) => {
    for (const name of STORES) {
      const os = tx.objectStore(name);
      os.clear();
      for (const value of data[name] || []) os.put(value);
    }
  });
}
