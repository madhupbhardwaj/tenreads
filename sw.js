/* Tenpages service worker: makes the site installable, opens instantly, and keeps working on a bad connection.
   Bump VERSION whenever this file changes. index.html itself is always fetched fresh when online,
   so new versions of the site show up straight away. */
const VERSION = 'v1';
const SHELL = 'tenpages-shell-' + VERSION;
const RUNTIME = 'tenpages-runtime-' + VERSION;
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];
const MAX_RUNTIME = 150;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('tenpages-') && k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: try the network first so you always get the latest site, fall back to the saved copy offline.
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }

  // The app's own icons and manifest.
  if (url.origin === self.location.origin && SHELL_FILES.includes(url.pathname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // Firebase code and font files never change at a given address, so keep them.
  if ((url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(req));
    return;
  }

  // Book and author details from Open Library: answer instantly from the saved copy, refresh it in the background.
  // Search results and trending lists always come fresh from the network.
  if (url.hostname === 'openlibrary.org' && (url.pathname.startsWith('/works/') || url.pathname.startsWith('/authors/'))) {
    e.respondWith(staleWhileRevalidate(e, req));
  }
  // Everything else (sign-in, your ratings, cover pictures) goes straight to the network as usual.
});

async function page(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    // Every address on the site serves the same app, so one saved copy covers them all.
    if (res.ok && res.type === 'basic') cache.put('/', res.clone());
    return res;
  } catch (err) {
    return (await cache.match('/')) || (await cache.match(req)) || Response.error();
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { const c = await caches.open(RUNTIME); c.put(req, res.clone()); trim(c); }
  return res;
}

async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(res => {
    if (res.ok) { cache.put(req, res.clone()); trim(cache); }
    return res;
  });
  if (hit) { e.waitUntil(fresh.catch(() => {})); return hit; }
  return fresh;
}

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await cache.delete(keys[i]);
}
