// =============================================================
// store.js — saving data on the device (IndexedDB)
// -------------------------------------------------------------
// IndexedDB is the browser's built-in database. It survives app
// restarts and works fully offline. iOS treats it as more
// "permanent" than localStorage, which is why we use it.
//
// We keep it dead simple: one "object store" used as a key → value
// map. Keys are things like "settings", "log", "tables".
//
// IndexedDB's own API is callback-based and awkward, so we wrap
// each operation in a Promise. That lets the rest of the app
// write   const x = await get('settings');
// =============================================================

const DB_NAME = 'tabletop-kit';
const STORE = 'kv';
let dbPromise = null; // opened once, then reused

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    // Runs the first time (or when the version number goes up):
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Read one value (undefined if not saved yet). */
export async function get(key) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Save one value (any plain object/array/string/number). */
export async function set(key, value) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Ask the browser not to auto-delete our data when space runs low.
 * Safari may say no; the app still works, it just means backups
 * (Settings → Export backup) matter more.
 */
export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try { return await navigator.storage.persist(); } catch { return false; }
  }
  return false;
}
