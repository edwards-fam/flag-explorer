// Flag Explorer service worker: keeps the game on the device so it opens instantly and works offline.
// VERSION changes whenever the game or anything stored with it changes; a new version replaces the old copy.
const VERSION = 'a6baddbb12e5';
const CACHE = 'flag-explorer-' + VERSION;
const PRECACHE = ["./","manifest.webmanifest","icons/apple-touch-icon.png","icons/favicon.svg","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","fonts/barlow-condensed-latin-500-normal.woff2","fonts/barlow-condensed-latin-600-normal.woff2","fonts/barlow-condensed-latin-700-normal.woff2","fonts/figtree-latin-400-normal.woff2","fonts/figtree-latin-500-normal.woff2","fonts/figtree-latin-600-normal.woff2","fonts/figtree-latin-700-normal.woff2","fonts/ibm-plex-mono-latin-500-normal.woff2","fonts/ibm-plex-mono-latin-600-normal.woff2"];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE)
    .then(cache => cache.addAll(PRECACHE.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('flag-explorer-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url), scope = self.registration.scope;
  if (req.method !== 'GET' || !url.href.startsWith(scope)) return;                      // only this game's own files
  if (/\/(sw\.js|version\.txt)$/.test(url.pathname)) return;                              // these always come from the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req.mode === 'navigate' ? scope : req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());                    // e.g. the extended-Latin font files
      return res;
    } catch (err) {
      const shell = req.mode === 'navigate' && await cache.match(scope);
      if (shell) return shell;
      throw err;
    }
  })());
});
