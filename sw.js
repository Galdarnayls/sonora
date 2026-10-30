/* Sonora service worker: кэширует оболочку приложения, чтобы оно открывалось без интернета. */
const CACHE = 'sonora-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Сначала сеть (чтобы сразу получать обновления), без сети или при медленной сети — кэш.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key, { ignoreSearch: true });
    const network = fetch(req, { cache: 'no-cache' }).then(res => {
      if (res.ok && res.type === 'basic') cache.put(key, res.clone());
      return res;
    });
    if (!cached) return network;
    const timeout = new Promise(res => setTimeout(() => res(cached), 2500));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
