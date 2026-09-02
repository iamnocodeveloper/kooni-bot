/**
 * PWA del panel — Fase 0: instalable + offline básico.
 *
 * Rutas (registradas ANTES del guard de auth en routes.ts, para que el
 * navegador pueda pedir el manifest y el service worker sin cookie):
 *   GET /admin/manifest.webmanifest
 *   GET /admin/sw.js
 *   GET /admin/icon.svg
 *
 * El <head> del panel (views/layout.ts) enlaza el manifest y registra el SW.
 *
 * Fase 1 (push) se apoya en los handlers `push` / `notificationclick` que ya
 * van dentro del SW — solo falta el emisor con VAPID y la tabla de
 * suscripciones. Ver PLAN.md § PWA.
 */
import type { Env } from "../env";

interface PwaBrand {
  name: string;
  themeColor: string;
  accent: string;
  accent2: string;
}

function brand(env: Env): PwaBrand {
  return {
    name: env.BRAND_NAME || "Kooni",
    themeColor: env.BRAND_BG || "#0d1218",
    accent: env.BRAND_PRIMARY || "#2dd4bf",
    accent2: env.BRAND_ACCENT2 || "#6ee7b7",
  };
}

/** Ícono de la app: fondo a sangre (sirve como `maskable`) + la K de nodo. */
export function iconSvg(env: Env): string {
  const b = brand(env);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${b.themeColor}"/>
  <g transform="translate(128,128) scale(8)">
    <path d="M11 23V9h2.5l5 7.5 5-7.5H26v14h-3V15l-4.5 6.8L13 15v8h-2z" fill="${b.accent}"/>
    <circle cx="23" cy="9" r="2" fill="${b.accent2}"/>
  </g>
</svg>`;
}

export function manifest(env: Env): string {
  const b = brand(env);
  return JSON.stringify({
    name: `${b.name} · Panel`,
    short_name: b.name,
    description: `Panel de ${b.name}: conversaciones, prospectos y avisos.`,
    start_url: "/admin/overview",
    scope: "/admin/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: b.themeColor,
    theme_color: b.themeColor,
    lang: env.BOT_LANGUAGE || "es",
    icons: [
      { src: "/admin/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
    ],
    shortcuts: [
      { name: "Conversaciones", url: "/admin/conversations" },
      { name: "Prospectos", url: "/admin/leads" },
      { name: "Tickets", url: "/admin/tickets" },
    ],
  });
}

/**
 * Service worker. Estrategia: network-first para navegaciones dentro de
 * /admin/, con la última copia cacheada como respaldo offline. Los assets de
 * CDN (Tailwind, htmx, fuentes) son cross-origin y se dejan pasar sin cachear.
 * Incluye los handlers de push para la Fase 1.
 */
export function serviceWorker(): string {
  return `/* Kooni PWA service worker — Fase 0 */
const CACHE = 'kooni-admin-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
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
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/admin')) return;

  // Navegaciones (cargar una página): red primero, cache de respaldo.
  const isNav = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isNav) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        if (cached) return cached;
        const home = await caches.match('/admin/overview');
        if (home) return home;
        return new Response(
          '<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
          '<body style="font-family:system-ui;background:#0d1218;color:#e7edf3;padding:40px;text-align:center">' +
          '<h1 style="font-size:18px">Sin conexión</h1>' +
          '<p style="opacity:.7;font-size:14px">Abre el panel de nuevo cuando tengas señal.</p></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
        );
      }
    })());
    return;
  }

  // El resto (fragmentos htmx, JSON): red primero, sin respaldo — para no
  // servir datos viejos como si fueran actuales.
});

// ── Fase 1: notificaciones push ────────────────────────────────────────────
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Kooni';
  const options = {
    body: data.body || 'Tienes una novedad en el panel.',
    icon: '/admin/icon.svg',
    badge: '/admin/icon.svg',
    tag: data.tag || 'kooni',
    data: { url: data.url || '/admin/overview' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/admin/overview';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.includes('/admin') && 'focus' in c) { c.navigate(target); return c.focus(); }
    }
    return self.clients.openWindow(target);
  })());
});
`;
}

/** `<head>` del panel: enlaza el manifest, colores e íconos y registra el SW. */
export function pwaHeadTags(env: Env): string {
  const b = brand(env);
  return `
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <meta name="theme-color" content="${b.themeColor}">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="${b.name}">
  <link rel="icon" type="image/svg+xml" href="/admin/icon.svg">
  <link rel="apple-touch-icon" href="/admin/icon.svg">
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(function (e) {
          console.warn('SW no registrado:', e);
        });
      });
    }
  </script>`;
}
