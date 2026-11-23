// =============================================================
// sw.js — service worker: makes the app work offline
// -------------------------------------------------------------
// On first visit the browser installs this worker, which downloads
// every file below into a cache. After that, every request is
// answered from the cache first, so the app opens with no internet.
//
// IMPORTANT when updating the app: bump VERSION. That makes the
// browser fetch fresh copies of everything and delete the old cache.
// (Your saved data is in IndexedDB, not this cache, so it's safe.)
// =============================================================

const VERSION = 'tk-v0.8.0';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/state.js',
  './js/store.js',
  './js/rng.js',
  './js/dice.js',
  './js/decks.js',
  './js/tables.js',
  './js/log.js',
  './js/obsidian.js',
  './js/views/send.js',
  './js/mythic.js',
  './js/npcs.js',
  './js/apothecaria.js',
  './js/apoplay.js',
  './js/games.js',
  './js/names.js',
  './js/letstalk.js',
  './js/une.js',
  './js/data/letstalk.js',
  './js/keepingcontact.js',
  './js/data/keepingcontact.js',
  './js/views/npcs.js',
  './js/views/apothecaria.js',
  './js/views/apoplay.js',
  './js/ui.js',
  './js/data/tarot.js',
  './js/data/examples.js',
  './js/views/dice.js',
  './js/views/cards.js',
  './js/views/tables.js',
  './js/views/mythic.js',
  './js/views/track.js',
  './js/views/log.js',
  './js/views/settings.js',
  './js/views/campaigns.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Install: download everything into a new cache.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)));
  self.skipWaiting(); // start using the new version right away
});

// Activate: delete caches from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

// Fetch: NETWORK FIRST, cache as the fallback.
// When the server (or GitHub Pages) is reachable you always get the
// newest files, even if VERSION wasn't bumped. When it isn't (offline,
// server stopped) the cached copy is used. Each successful download
// also refreshes the cache. A 3-second limit stops a bad connection
// from hanging the app.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-cache' }), // ask the server, don't trust the browser's HTTP cache
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
      ]);
      if (res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      const hit = await caches.match(req, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
