// FRATE PASE — service worker mínimo (habilita la instalación como app).
// No cachea el HTML/JS (para que siempre traiga la última versión desde Vercel);
// solo responde el fetch en modo network-first, con fallback al caché si no hay red.
const CACHE = 'frate-pase-v1';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    fetch(req)
      .then(res => {
        // guarda una copia de recursos estáticos por si se abre sin red
        if (res && res.ok && req.url.startsWith(self.location.origin)) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
