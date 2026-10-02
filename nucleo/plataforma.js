// Dónde corre la app y cómo se habla con el GPS. Sin dependencias: web/taxicun.js
// lo carga antes de saber la cooperativa (config.js espera la ficha al cargar y no
// se puede importar tan temprano).
//
//   ES_NATIVA  la app de las tiendas (Capacitor) y no el navegador. Solo esta
//              bandera apaga el service worker y «Instalar», y usa el GPS del plugin.
//   MODO_REAL  TaxiCun contra el servidor de verdad (taxicun.com/api): siempre en la
//              app nativa; en la web solo con ?real=1 (se guarda en la pestaña;
//              ?real=0 lo quita). Las páginas de cada cooperativa nunca entran.

const cap = globalThis.Capacitor;
const NATIVA_DE_VERDAD = Boolean(cap?.isNativePlatform?.());

export const ES_NATIVA = NATIVA_DE_VERDAD || /\bTaxiCun-App\//.test(globalThis.navigator?.userAgent || '');

function leerParametroReal() {
  // Solo TaxiCun (taxicun/) lee y guarda la bandera: en las páginas de cada cooperativa
  // ?real=1 no hace nada, ni se arrastra a TaxiCun si después se navega en la pestaña.
  if (!globalThis.CT_TAXICUN) return false;
  try {
    const p = new URLSearchParams(globalThis.location?.search || '').get('real');
    if (p === '1') sessionStorage.setItem('taxicun.real', '1');
    else if (p === '0') sessionStorage.removeItem('taxicun.real');
    return sessionStorage.getItem('taxicun.real') === '1';
  } catch {
    return false; // sin sessionStorage (marco aislado, modo privado estricto): la demo de siempre
  }
}
const REAL_PEDIDO = leerParametroReal();

export const MODO_REAL = Boolean(globalThis.CT_TAXICUN) && (ES_NATIVA || REAL_PEDIDO);

// El servidor está en el mismo origen que la web (en la app nativa también: carga taxicun.com).
export const URL_API = `${globalThis.location?.origin || ''}/api/`;
export const URL_BUS = `${globalThis.location?.protocol === 'https:' ? 'wss://' : 'ws://'}${globalThis.location?.host || ''}/api/bus`;

// Para que los diseños puedan ocultar cosas con CSS (html[data-modo="real"], html[data-nativa]).
const raiz = globalThis.document?.documentElement;
if (raiz) {
  if (MODO_REAL) raiz.dataset.modo = 'real';
  if (ES_NATIVA) raiz.dataset.nativa = '1';
}

/* ---------------- App oculta (batería) ----------------
 * Con la app en segundo plano o la pestaña oculta no hace falta pintar nada: html.app-oculta
 * pausa las animaciones (disenos/a/base.css) y relojVisible() detiene los relojes de pantalla
 * hasta que la app vuelve a verse (entonces corren una vez de inmediato). En el iPhone el
 * sistema ya suspende la app; en Android (Capacitor la deja corriendo) y en la web, no.
 * Lo que la central necesita aunque la app esté oculta (presencia del conductor, GPS en turno,
 * el bus) NO usa esto. */
const oyentesVisibilidad = new Set();
let oculta = Boolean(globalThis.document?.hidden);
function fijarOculta(valor) {
  if (valor === oculta) return;
  oculta = valor;
  raiz?.classList.toggle('app-oculta', valor);
  for (const fn of [...oyentesVisibilidad]) {
    // Si otro oyente lo soltó en esta misma vuelta (por ejemplo, al detener un reloj), ya no corre.
    if (!oyentesVisibilidad.has(fn)) continue;
    try {
      fn(valor);
    } catch (e) {
      console.error(e);
    }
  }
}
if (globalThis.document) {
  if (oculta) raiz?.classList.add('app-oculta');
  document.addEventListener('visibilitychange', () => fijarOculta(document.hidden));
  try {
    const appNativa = cap?.Plugins?.App;
    // «pause» llega también con la app a la vista (Android 7 a 9 en pantalla dividida, un diálogo
    // del sistema encima): solo cuenta si la página ya está oculta; si no, la marca visibilitychange.
    appNativa?.addListener?.('pause', () => document.hidden && fijarOculta(true))?.catch?.(() => {});
    appNativa?.addListener?.('resume', () => fijarOculta(false))?.catch?.(() => {});
  } catch {
    /* sin el plugin App */
  }
}

export const appOculta = () => oculta;

// fn(oculta) cada vez que la app se oculta o vuelve. Devuelve la función para dejar de escuchar.
export function alCambiarVisibilidad(fn) {
  oyentesVisibilidad.add(fn);
  return () => oyentesVisibilidad.delete(fn);
}

// setInterval que solo corre con la app a la vista; al volver corre una vez de inmediato
// (alVolver: false para no hacerlo). Devuelve la función para detenerlo del todo.
export function relojVisible(fn, ms, { alVolver = true } = {}) {
  let id = null;
  const arrancar = () => {
    if (id == null) id = setInterval(fn, ms);
  };
  const parar = () => {
    if (id != null) clearInterval(id);
    id = null;
  };
  const dejar = alCambiarVisibilidad((o) => {
    if (o) return parar();
    // Primero el reloj: si fn falla, el reloj sigue andando igual.
    arrancar();
    if (alVolver) fn();
  });
  if (!oculta) arrancar();
  return () => {
    parar();
    dejar();
  };
}

/* ---------------- Teclado en la app nativa ----------------
 * En iOS el teclado tapa la parte de abajo del WebView y la página (de alto fijo) no se mueve,
 * así que el campo que se está llenando puede quedar debajo del teclado. Se publica la altura
 * del teclado en --a-teclado (con html.con-teclado) para que los diseños dejen espacio abajo,
 * y se lleva el campo enfocado al centro de lo visible. */
const vv = globalThis.visualViewport;
if (ES_NATIVA && raiz && vv) {
  const medirTeclado = () => {
    const tapa = Math.max(0, Math.round(globalThis.innerHeight - vv.height - vv.offsetTop));
    raiz.style.setProperty('--a-teclado', `${tapa}px`);
    raiz.classList.toggle('con-teclado', tapa > 80);
  };
  vv.addEventListener('resize', medirTeclado);
  vv.addEventListener('scroll', medirTeclado);
  globalThis.document.addEventListener('focusin', (e) => {
    const campo = e.target;
    if (!campo?.matches?.('input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable]')) return;
    // Después de que el teclado termina de subir.
    setTimeout(() => {
      medirTeclado();
      if (globalThis.document.activeElement === campo) campo.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 350);
  });
}

/* ---------------- Enlaces en la app nativa ----------------
 * La app carga taxicun.com dentro del WebView: un enlace del mismo dominio (la política
 * de privacidad, que se abre «en otra pestaña») reemplazaría la app y en Android no hay
 * cómo volver. Con el plugin Browser (@capacitor/browser, apps desde 10a0573) esos
 * enlaces se abren en el navegador dentro de la app (Safari / Chrome Custom Tabs).
 * Sin el plugin (p. ej. el build 171 de TestFlight) y en la web, todo sigue como hoy.
 * WhatsApp, Waze, Google Maps y las tiendas siguen yendo a su propia app (el navegador
 * de adentro no la abriría), y tel:, mailto:, sms: y geo: los atiende el sistema. */

function navegadorDeLaApp() {
  if (!ES_NATIVA) return null;
  const c = globalThis.Capacitor;
  try {
    return c?.isPluginAvailable?.('Browser') && typeof c?.Plugins?.Browser?.open === 'function' ? c.Plugins.Browser : null;
  } catch {
    return null;
  }
}

const ABREN_SU_APP = [
  /(^|\.)wa\.me$/, /(^|\.)whatsapp\.com$/, /(^|\.)waze\.com$/, /^maps\.apple\.com$/, /^maps\.app\.goo\.gl$/,
  /^apps\.apple\.com$/, /^itunes\.apple\.com$/, /^play\.google\.com$/,
];
const esDeMapasDeGoogle = (u) => /^maps\.google\./.test(u.hostname) || (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith('/maps'));

// La dirección a abrir en el navegador de la app, o null si el enlace sigue como hoy.
function enlaceParaElNavegador(a) {
  const href = a.getAttribute('href');
  if (!href || href.startsWith('#') || a.hasAttribute('download')) return null;
  let u;
  try {
    u = new URL(href, globalThis.location.href);
  } catch {
    return null;
  }
  // Solo páginas web: tel:, mailto:, sms:, geo:, whatsapp:… se quedan con el sistema.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const mismoSitio = u.origin === globalThis.location.origin;
  const privacidad = mismoSitio && /\/privacidad(\/(index\.html)?)?$/.test(u.pathname);
  const otraPestana = (a.getAttribute('target') || '').toLowerCase() === '_blank';
  if (!privacidad && !otraPestana && mismoSitio) return null; // la navegación de siempre dentro de la app
  if (!mismoSitio && (ABREN_SU_APP.some((r) => r.test(u.hostname)) || esDeMapasDeGoogle(u))) return null;
  return u.href;
}

// Una sola vez aunque el módulo se cargue con dos ?v= distintos (abriría dos veces).
const MARCA_ENLACES = Symbol.for('taxicun.enlacesNativos');
if (ES_NATIVA && globalThis.document && !globalThis[MARCA_ENLACES]) {
  globalThis[MARCA_ENLACES] = true;
  document.addEventListener('click', (ev) => {
    if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
    const a = ev.target?.closest?.('a[href]');
    if (!a) return;
    const navegador = navegadorDeLaApp();
    const url = navegador && enlaceParaElNavegador(a);
    if (!url) return;
    ev.preventDefault();
    Promise.resolve()
      .then(() => navegador.open({ url }))
      .catch(() => {
        // Si el plugin falla, lo de siempre: otra ventana (el sistema) o aquí mismo.
        if ((a.getAttribute('target') || '').toLowerCase() === '_blank') globalThis.open?.(url, '_blank', 'noopener');
        else globalThis.location.assign(url);
      });
  });
}

/* ---------------- GPS ----------------
 * posicion(): una lectura. Devuelve { lat, lng, precision, rumbo, velocidad } o lanza
 * { code } como el navegador: 1 permiso negado, 2 no disponible, 3 se acabó el tiempo.
 * seguir(fn): lecturas seguidas; devuelve la función para detenerse.
 * En la web usa navigator.geolocation con las mismas opciones de siempre; en la app
 * nativa, el plugin Geolocation (evita el doble permiso app + WebView en iPhone). */

const GEO = NATIVA_DE_VERDAD ? cap?.Plugins?.Geolocation || null : null;

// Solo el plugin en Android respeta el intervalo del seguimiento (interval y
// minimumUpdateInterval); en iPhone y en el navegador las lecturas llegan cuando el sistema quiere.
export const GPS_CON_INTERVALO = Boolean(GEO) && cap?.getPlatform?.() === 'android';

// Rumbo de la marcha: «course» (solo llega siguiendo la posición) y, si no hay, «heading».
// El plugin 8.x prioriza la brújula en heading: el taxi giraría con el teléfono.
const aPunto = ({ coords: c }) => ({
  lat: c.latitude,
  lng: c.longitude,
  precision: c.accuracy,
  rumbo: [c.course, c.heading].find((v) => Number.isFinite(v) && v >= 0) ?? null,
  velocidad: c.speed ?? null,
});

// Errores del plugin («OS-PLUG-GLOC-00xx») a los códigos del navegador.
const codigoPlugin = (e) => (/GLOC-000[38]/.test(e?.code || '') ? 1 : /GLOC-0010/.test(e?.code || '') ? 3 : 2);

// Permiso en la app nativa. Sin reloj: la persona puede tardar en el diálogo.
// Devuelve 0 si hay permiso o el código del error.
async function permisoNativo() {
  try {
    let s = await GEO.checkPermissions();
    if (String(s?.location || '').startsWith('prompt')) s = await GEO.requestPermissions({ permissions: ['location'] });
    return s?.location === 'granted' || s?.coarseLocation === 'granted' ? 0 : 1;
  } catch (e) {
    // También falla si la ubicación del sistema está apagada.
    return codigoPlugin(e) === 1 ? 1 : 2;
  }
}

export async function posicion({ precisa = true, espera = 8000, edad = 15000 } = {}) {
  if (!GEO) {
    return new Promise((ok, no) => {
      if (!('geolocation' in (globalThis.navigator || {}))) return no({ code: 2, sinGps: true });
      navigator.geolocation.getCurrentPosition(
        (p) => ok(aPunto(p)),
        (e) => no({ code: e?.code || 2 }),
        { enableHighAccuracy: precisa, timeout: espera, maximumAge: edad },
      );
    });
  }
  const negado = await permisoNativo();
  if (negado) throw { code: negado };
  let reloj;
  try {
    // iOS ignora «timeout» en el plugin: el reloj va aquí.
    const lectura = await Promise.race([
      GEO.getCurrentPosition({ enableHighAccuracy: precisa, timeout: espera, maximumAge: edad }),
      new Promise((_, no) => {
        reloj = setTimeout(() => no({ code: 'OS-PLUG-GLOC-0010' }), espera + 1500);
      }),
    ]);
    return aPunto(lectura);
  } catch (e) {
    throw { code: codigoPlugin(e) };
  } finally {
    clearTimeout(reloj);
  }
}

// El plugin (Android e iOS) borra el seguimiento si la primera lectura no llega dentro de su
// «timeout» y no lo vuelve a arrancar: arrancado con la app en segundo plano o bajo techo, el GPS
// quedaría muerto. Se le da un plazo que no se cumple (un día), como el navegador, que sigue.
const PLAZO_SEGUIMIENTO_MS = 24 * 3600 * 1000;

// intervalo: cada cuánto se quiere una lectura (ms). Solo lo respeta Android (GPS_CON_INTERVALO).
// alFallar({ code, muerto }): muerto = el seguimiento ya no existe (no pudo arrancar, por ejemplo
// con la ubicación del sistema apagada, o el plugin lo borró): hay que pedir otro.
export function seguir(fn, { precisa = true, alFallar = () => {}, intervalo = 2000 } = {}) {
  if (!GEO) {
    if (!('geolocation' in (globalThis.navigator || {}))) return () => {};
    const id = navigator.geolocation.watchPosition(
      (p) => fn(aPunto(p)),
      (e) => alFallar({ code: e?.code || 2 }),
      { enableHighAccuracy: precisa, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }
  let id = null;
  let parado = false;
  let huboLectura = false;
  (async () => {
    const negado = await permisoNativo();
    if (negado) return alFallar({ code: negado, muerto: true });
    if (parado) return;
    try {
      // watchPosition devuelve el id del seguimiento (el mismo que pide clearWatch).
      id = await GEO.watchPosition(
        { enableHighAccuracy: precisa, timeout: PLAZO_SEGUIMIENTO_MS, maximumAge: 5000, interval: intervalo, minimumUpdateInterval: Math.max(1000, Math.round(intervalo / 2)) },
        (p, err) => {
          if (p) {
            huboLectura = true;
            fn(aPunto(p));
          } else if (err) {
            // 3: el plugin ya lo borró. Un error antes de la primera lectura: no llegó a arrancar.
            const code = codigoPlugin(err);
            alFallar({ code, muerto: code === 3 || !huboLectura });
          }
        },
      );
    } catch (e) {
      return alFallar({ code: codigoPlugin(e), muerto: true });
    }
    if (parado && id != null) GEO.clearWatch({ id }).catch(() => {});
  })();
  return () => {
    parado = true;
    if (id != null) GEO.clearWatch({ id }).catch(() => {});
  };
}
