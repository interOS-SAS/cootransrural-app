// Enlaces seguros (requisito S30 del diseño del panel, fase 1 en la web).
//
// Con el panel, la ficha de cada cooperativa (teléfonos, página oficial, fuente de
// las tarifas…) la escribe gente que entra con un código por correo, ya no un cambio
// revisado en git. Por eso todo href o src que se arme con datos de la ficha o del
// servidor pasa por aquí antes de llegar al HTML: un «javascript:…» en la fuente del
// decreto le robaría la sesión a todo pasajero que tocara «Ver el decreto».
//
// - urlSegura(u, dominios): solo https:, sin usuario, clave ni puerto, y de un dominio
//   de la lista (él mismo o un subdominio suyo; si la entrada trae «/», el dominio exacto
//   y la ruta que empiece así). Devuelve la dirección normalizada, o '' si no cumple:
//   entonces el enlace no se pinta.
// - urlDecreto(u): la fuente oficial de las tarifas. Solo páginas *.gov.co (decisión de
//   Oscar, 3-oct-2026).
// - urlInterna(u): rutas del mismo sitio (íconos, privacidad, la otra app).
// - enlaceTel(n) y enlaceCorreo(c): tel: y mailto: con solo lo que deben llevar.
// - hrefSeguro(u): cualquiera de los anteriores, para piezas que reciben un enlace ya
//   armado (las acciones de un diálogo, los ítems de un menú).
//
// No depende de la ficha: web/taxicun.js lo usa antes de saber la cooperativa.

// Fuente oficial de las tarifas (decreto o resolución de la alcaldía).
export const DOMINIOS_DECRETO = Object.freeze(['gov.co']);

// Servicios a los que llevan los botones de la app (los arma el código).
const SERVICIOS = [
  'wa.me', 'api.whatsapp.com', // WhatsApp
  'www.google.com/maps/', 'maps.google.com', // Google Maps
  'waze.com',
  'interos.com.co', 'taxicun.com',
];

// Páginas oficiales de las cooperativas (EMPRESA.sitioOficial o EMPRESA.web). Revisadas
// en git: una cooperativa nueva con página propia se agrega aquí (la prueba
// pruebas/enlaces-seguros.mjs revisa que todas las fichas pasen). En los sitios
// compartidos (Wix, Google Sites, GitHub Pages) va solo el subdominio o la ruta de la
// cooperativa, nunca el dominio entero.
export const SITIOS_COOPERATIVAS = Object.freeze([
  'autoserviciochia.com', 'autofaca.com', 'centraldetaxis.com.co', 'chocontax.com', 'coatan.com.co',
  'comultrasim.github.io', 'coomofu.com', 'cooptranserga.com.co', 'cootransfusa.com', 'cootransgualiva.com.co',
  'cootransmadrid.com.co', 'cootransmosquera.com', 'cootransoccidente.com.co', 'cootransrural.com',
  'cootranstenjo.com.co', 'cootransvillaleal.com.co', 'cootransvu.com', 'cootranszipa-ac.com', 'coovetrans.com',
  'coptaxi.com.co', 'expresotocancipa.com', 'hseoccitrans.wixsite.com', 'megataxigirardot.com',
  'sites.google.com/cootransye.com/', 'taxisfortalezadepiedra.com', 'taxisxua.com', 'transcalera.com',
  'transduartesa.com', 'transguasca.com', 'transportesvilletaxsa.com', 'unitaxiubatesas.wixsite.com',
  'villetanadetaxis02.wixsite.com',
]);

export const DOMINIOS_PERMITIDOS = Object.freeze([...SERVICIOS, ...SITIOS_COOPERATIVAS, ...DOMINIOS_DECRETO]);

// Caracteres de control, espacios raros y marcas de dirección (U+202E y compañía): una
// dirección de verdad no los trae.
const RAROS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

function texto(u) {
  if (u instanceof URL) return u.href;
  if (typeof u !== 'string') return '';
  const t = u.trim();
  return t && t.length <= 8192 && !RAROS.test(t) ? t : '';
}

function enLista(url, dominios) {
  const host = url.hostname;
  return dominios.some((d) => {
    const barra = d.indexOf('/');
    if (barra < 0) return host === d || host.endsWith(`.${d}`);
    return host === d.slice(0, barra) && url.pathname.startsWith(d.slice(barra));
  });
}

// Dirección https: de un dominio permitido, o ''.
export function urlSegura(u, dominios = DOMINIOS_PERMITIDOS) {
  const t = texto(u);
  if (!t) return '';
  let url;
  try {
    url = new URL(t); // sin base: una ruta relativa no es una dirección externa
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
  return enLista(url, dominios) ? url.href : '';
}

// Fuente oficial de las tarifas: solo *.gov.co.
export function urlDecreto(u) {
  return urlSegura(u, DOMINIOS_DECRETO);
}

// El sitio donde corre la app (la carpeta de nucleo/): taxicun.com, localhost en las
// pruebas o el origen de la app nativa.
const SITIO = new URL('../', import.meta.url);

// Ruta del mismo sitio (relativa a la página, o a «base»), o ''.
export function urlInterna(u, base = globalThis.location?.href || SITIO) {
  // '' es la base misma (como href="" en una página).
  const t = u === '' ? '' : texto(u);
  if (!t && u !== '') return '';
  let url;
  try {
    url = t ? new URL(t, base) : new URL(base);
  } catch {
    return '';
  }
  // Mismo esquema y mismo host del sitio: deja fuera javascript:, data:, blob: y otros dominios.
  if (url.protocol !== SITIO.protocol || url.host !== SITIO.host || url.username || url.password) return '';
  return url.href;
}

// tel: solo con dígitos (y un «+» al comienzo), o ''.
export function enlaceTel(numero) {
  const t = String(numero ?? '').trim().replace(/[\s().-]/g, '');
  return /^\+?\d{3,15}$/.test(t) ? `tel:${t}` : '';
}

// mailto: con un correo sencillo (sin «?», espacios ni comillas), o ''.
export function enlaceCorreo(correo) {
  const c = String(correo ?? '').trim();
  return c.length <= 254 && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/.test(c) ? `mailto:${c}` : '';
}

// Cualquier enlace que la app pinta: https: permitido, del mismo sitio, tel: o mailto:.
export function hrefSeguro(u) {
  const t = texto(u);
  if (/^tel:/i.test(t)) return enlaceTel(t.slice(4));
  if (/^mailto:/i.test(t)) return enlaceCorreo(t.slice(7));
  return urlSegura(t) || urlInterna(t);
}

// Última barrera: un clic en un enlace cuyo esquema ejecuta código (javascript:, data:,
// vbscript:…) no navega, aunque alguna pantalla se hubiera saltado lo de arriba. Los
// blob: solo si los creó esta misma página (la descarga de los stickers). No se escribe
// la dirección en la consola.
const ESQUEMAS = new Set(['https:', 'http:', 'tel:', 'mailto:', 'sms:', 'geo:', 'whatsapp:', SITIO.protocol]);
function enlacePermitido(href) {
  let url;
  try {
    url = new URL(href, document.baseURI);
  } catch {
    return false;
  }
  if (ESQUEMAS.has(url.protocol)) return true;
  return url.protocol === 'blob:' && url.origin === globalThis.location?.origin;
}
const MARCA_CLICS = Symbol.for('taxicun.enlacesSeguros');
if (globalThis.document && !globalThis[MARCA_CLICS]) {
  globalThis[MARCA_CLICS] = true;
  document.addEventListener('click', (ev) => {
    const a = ev.target?.closest?.('a[href], area[href]');
    if (!a || enlacePermitido(a.getAttribute('href'))) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    console.warn('[enlaces] Se bloqueó un enlace no permitido.');
  }, true);
}
