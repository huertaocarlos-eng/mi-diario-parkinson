/* Service worker — Mi Diario Parkinson
   Estrategia: "red primero" para la app (HTML/JS/CSS) para que las mejoras lleguen
   siempre; "caché primero" para iconos. Funciona offline con la última versión vista. */
const CACHE = 'diario-pk-v5';
const ASSETS = [
  './', './index.html', './css/styles.css', './js/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // tolerante: si un asset falla, no rompe toda la instalación
    await Promise.allSettled(ASSETS.map((u) => c.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const esShell = req.mode === 'navigate' || /\.(html|js|css|webmanifest)$/.test(url.pathname);

  if (esShell) {
    // red primero, con respaldo a caché (offline)
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, res.clone()).catch(() => {});
        return res;
      } catch (_) {
        const hit = await caches.match(req);
        return hit || caches.match('./index.html');
      }
    })());
  } else {
    // iconos / otros: caché primero
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => hit)));
  }
});

/* ---- Notificaciones push (llegan aunque la app esté cerrada) ---- */
self.addEventListener('push', (e) => {
  let d = { title: 'Mi Diario Parkinson', body: '' };
  try { if (e.data) d = Object.assign(d, e.data.json()); }
  catch (_) { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: d.tag || 'diario-pk',
    renotify: true,
    requireInteraction: true
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) { if ('focus' in w) return w.focus(); }
    if (clients.openWindow) return clients.openWindow('./');
  }));
});
