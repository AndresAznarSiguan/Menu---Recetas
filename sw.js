const CACHE = 'menu-recetas-v2';
const ASSETS = ['./', './index.html', './app.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const isDoc = req.mode === 'navigate' ||
    (req.method === 'GET' && (req.headers.get('accept') || '').includes('text/html'));
  const isAppCode = req.url.endsWith('/app.js') || req.url.endsWith('/sw.js');
  if (isDoc || isAppCode) {
    // network-first for the app page and its logic, so updates show up automatically
    e.respondWith(
      fetch(req, { cache: 'no-store' }).then(res => {
        const copy = res.clone();
        const cacheKey = isDoc ? './index.html' : req;
        caches.open(CACHE).then(c => c.put(cacheKey, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || (isDoc ? caches.match('./index.html') : undefined)))
    );
  } else {
    // cache-first for static assets that rarely change (icons, manifest)
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
  }
});
