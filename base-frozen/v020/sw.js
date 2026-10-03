/* Caches only the app shell. Brigade data never goes in the cache: requests to other origins go straight to the network. */
const CACHE = 'v020-shell-6';
const SHELL = ['./', './index.html', './styles.css', './app.js', './data.js', './manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;   // data: network only
  if (u.pathname.endsWith('/config.js')) return;                            // settings: always fresh
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request)));                                  // network first; shell from cache when offline
});
