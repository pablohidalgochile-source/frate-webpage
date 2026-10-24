/* FRATE — Service Worker del validador de puerta (PWA)
 * Cachea el "app shell" (carga instantánea + offline).
 * Las llamadas a Supabase (login/validación/RPC) van SIEMPRE por red. */
const CACHE = 'frate-puerta-v9';
const SHELL = [
  '/validacion.html',
  '/validacion.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/icon-frate.svg',
  '/frate-plano.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
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

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // no tocar POST (auth/rpc)
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // Supabase → siempre red

  // Navegación → red primero, y si no hay internet, sirve el shell cacheado
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/validacion.html'))
    );
    return;
  }

  // Assets locales + CDN (supabase-js, html5-qrcode) → cache-first, actualiza en segundo plano
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const okHost = url.origin === self.location.origin ||
          /cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com/.test(url.hostname);
        if (okHost) { const clone = res.clone(); caches.open(CACHE).then((c) => c.put(req, clone)); }
      }
      return res;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
