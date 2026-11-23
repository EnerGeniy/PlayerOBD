const CACHE_NAME = 'tma-player-obd-v15';
const CORE_ASSETS = ['./', './index.html', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Не перехватываем сторонние домены (радиопотоки, погода, Яндекс.Диск)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const done = (resp) => {
        if (!settled) {
          settled = true;
          resolve(resp);
        }
      };

      // Если сеть тупит дольше 3.5 сек при пробуждении магнитолы — сразу отдаём живой кэш
      const fallbackTimer = setTimeout(() => {
        caches.match(req).then((cached) => {
          if (cached) done(cached);
          else if (req.mode === 'navigate') {
            caches.match('./index.html').then((idx) => { if (idx) done(idx); });
          }
        });
      }, 3500);

      fetch(req).then((netResp) => {
        clearTimeout(fallbackTimer);
        if (netResp && netResp.ok) {
          const clone = netResp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        done(netResp);
      }).catch(() => {
        clearTimeout(fallbackTimer);
        caches.match(req).then((cached) => {
          if (cached) return done(cached);
          if (req.mode === 'navigate') {
            return caches.match('./index.html').then((idx) => done(idx || new Response('Offline', { status: 503 })));
          }
          done(new Response('Offline', { status: 503 }));
        });
      });
    })
  );
});
