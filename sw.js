// Service worker del sitio (TaxiCun y las páginas de cada cooperativa): permite
// instalar la app, abrirla sin señal (lo ya visitado) y mostrar notificaciones.
const VERSION = 'ct-2026-10-02-2';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(VERSION).then((c) =>
      c.addAll([
        './', './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css',
        // TaxiCun (la app instalada abre taxicun/?o=app): sin señal debe abrir TaxiCun.
        './taxicun/', './taxicun/conductor/', './web/taxicun.js', './web/taxicun.css', './empresas/indice.json',
      ]).catch(() => {}),
    ),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // El servidor de TaxiCun (/api/: cuenta, perfil, tiempo real) nunca pasa por aquí ni se
  // guarda: son datos personales y deben ser los de ahora, no una copia vieja.
  if (url.pathname.startsWith('/api/')) return;
  // Primero la red (así siempre se ve lo último publicado); sin señal, la copia.
  // cache: 'no-cache' obliga a preguntarle al servidor si cambió (si no, 304).
  const red = e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(e.request, { cache: 'no-cache' });
  e.respondWith(
    red
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? respaldo(e.request, url) : undefined))),
  );
});

// Sin señal y sin la copia exacta: la misma página con otros parámetros (?e=, ?d=,
// ?o=app… el HTML es el mismo); si no, dentro de TaxiCun, TaxiCun, y en la carpeta
// de una cooperativa, su web. La web de Cootransrural (raíz) solo para sus propias
// páginas: a la persona de otra cooperativa nunca se le muestra la de Cootransrural.
// Carpetas de la raíz que, sin señal, abren la página de TaxiCun (las de cada
// cooperativa abren su propia página; las viejas de Cootransrural redirigen a el-rosal/).
const RAIZ_TAXICUN = ['', 'pagar', 'cooperativas'];
function respaldo(pedido, url) {
  return caches.match(pedido, { ignoreSearch: true }).then(async (r) => {
    if (r) return r;
    const resto = url.href.slice(self.registration.scope.length).split(/[?#]/)[0];
    const tc = resto.match(/^taxicun\/(conductor\/)?/);
    if (tc) return caches.match(`./taxicun/${tc[1] || ''}`);
    const carpeta = resto.split('/')[0];
    if (RAIZ_TAXICUN.includes(carpeta)) return caches.match('./');
    return (await caches.match(`./${carpeta}/`)) || sinSenal();
  });
}

function sinSenal() {
  const html = '<!doctype html><html lang="es-CO"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sin conexión</title>'
    + '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;text-align:center;padding:24px">'
    + '<div><h1 style="font-size:1.4rem">Sin conexión a internet</h1><p>Revisa tus datos o el wifi e inténtalo de nuevo.</p>'
    + '<button onclick="location.reload()" style="font:inherit;padding:12px 20px;border-radius:12px;border:0;background:#FFC21A;font-weight:700">Reintentar</button></div></body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.registration.scope));
      if (abierta) return abierta.focus();
      // Sin ventana abierta: TaxiCun con la cooperativa del aviso (etiqueta «apptaxi-<id>»),
      // nunca la app de Cootransrural para el pasajero de otra cooperativa.
      const id = (e.notification.tag || '').match(/^apptaxi-([a-z0-9-]+)$/)?.[1];
      return self.clients.openWindow(id ? `./taxicun/?e=${id}` : './taxicun/');
    }),
  );
});
