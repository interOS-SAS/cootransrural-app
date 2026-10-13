// Promoción «Viaje gratis» (servidor 0.16.0) en las apps del diseño A, modo real (?real=1), con el servidor de TaxiCun
// simulado aquí mismo (HTTP con page.route y el WebSocket /api/bus con routeWebSocket), siguiendo el contrato de
// DISENO-PROMOCIONES.md §7 (nucleo/promo.js). Recorre:
//  a) pasajero contra un servidor 0.15.0 (sin promo en la bienvenida): el hola dice capacidades, nada nuevo en el inicio,
//     ni en «Confirma tu viaje», ni en el menú; la solicitud sin premioId; ninguna llamada a /api/promociones; el pago de
//     siempre.
//  b) pasajero con la promoción: la tarjeta del inicio en cada estado («Llevas 7 de 10», sumó, no sumó, el premio con su
//     modal, llena, canje en pausa), «Usar mi viaje gratis» apagado por defecto, la vista previa aproximada y la exacta
//     (cotizacion.promo), el pedido con premioId, promo_viaje y el chip, promo_app y «Pedir sin el viaje gratis»,
//     premio_no_disponible con cada motivo («Pedir sin el viaje gratis» / «Volver»), el viaje gratis con diferencia
//     (paga $300) y sin diferencia («Calificar el viaje» y la confirmación del conductor con metodo 'promocion'), la
//     cancelación del conductor (vuelve a pedir con el mismo premioId) y la del pasajero (el premio vuelve), la hoja
//     «Promociones», textos con < > como texto, el modo revisor y la demo sin nada nuevo.
//  c) conductor: el hola con capacidades ['promo']; la oferta con «TaxiCun te paga $X + bono $Y» y lo que paga el pasajero,
//     sin «Cómo me pagan» («Registra…»); «¿Cuánto cobras?»; el cobro con diferencia (efectivo por $300) y sin diferencia
//     («Terminar» → pago_confirmado 'promocion'); lo que falta (Cómo me pagan / condiciones con «Acepto»); «Pagos de
//     TaxiCun»; basura en la promo de la oferta; y contra un servidor 0.15.0 (sin promo), todo como hoy.
// Capturas a 390 px en $CAPTURAS.
//
// Uso: node --import <pw-registrar.mjs> pruebas/promo-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5961 --api=http://127.0.0.1:5969). ~4 min.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5961/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/promociones/app/capturas').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const CODIGO = '123456';
const LUIS = 'luis@prueba.taxicun.com';
const ANA = 'ana@prueba.taxicun.com';
const XSS = '<img src=x onerror="window.__xss=1">';
const PREMIO_ID = 'pr_ABCDEFGHIJKLMNOPQRSTUV';
const VENCE = '2026-12-13T04:59:59.999Z';
const FICHA_COT = `c1.${'a'.repeat(40)}.${'b'.repeat(43)}`;

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 8000, paso = 100) {
  const fin = Date.now() + ms;
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (Date.now() > fin) return null;
    await espera(paso);
  }
}
const intento = async (pr) => {
  try {
    await pr;
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* Servidor de TaxiCun simulado (contrato §7)                           */
/* ------------------------------------------------------------------ */
const CONDUCTOR = { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' };
const USUARIOS = {
  [LUIS]: { nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: CONDUCTOR },
  [ANA]: { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
};
const promoBase = (extra = {}) => ({
  id: 'viaje-gratis', version: 3, vigente: true, meta: 10, llevas: 7, llena: false, premio: null,
  condiciones: { tope: 10000, venceDias: 60, maxMismoConductor: 3, minimo: 6100, cada: 10 }, canjePausado: false,
  terminos: 'https://taxicun.com/promociones/viaje-gratis/', ...extra,
});
const premio = (extra = {}) => ({ id: PREMIO_ID, estado: 'emitido', vence: VENCE, tope: 10000, viajeId: null, aqui: true, ...extra });
const srv = {
  n: 0,
  nuevo: true, // false = servidor 0.15.0 (sin promo)
  promo: promoBase(),
  revision: false,
  rutas: false, // bienvenida.rutas { cotizar: true }
  cotValor: 10300,
  cotPromo: null,
  promoViaje: { cubre: 10000, pasajeroPaga: 300, tope: 10000 },
  noDisponible: null, // motivo de premio_no_disponible para la próxima solicitud con premio
  mia: null,
  cobroConductor: null, // «Cómo me pagan» del conductor (null: no lo tiene)
  pagos: null,
  sesiones: new Map(),
  peticiones: [],
  hola: [],
  mensajes: [],
  sockets: new Set(),
  ofertas: new Map(),
  viajes: new Map(),
  viajePasajero: null,
};
const yoDe = (correo) => {
  const u = USUARIOS[correo];
  return { usuario: { id: `u-${correo}`, correo, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor };
};
const pide = (metodo, ruta, desde = 0) => srv.peticiones.filter((x) => x.metodo === metodo && x.ruta === ruta && x.t >= desde);

async function atenderApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const ruta = url.pathname.replace(/^\/api\//, '');
  const metodo = req.method();
  let cuerpo = null;
  try {
    cuerpo = req.postDataJSON();
  } catch {
    cuerpo = null;
  }
  const token = (req.headers().authorization || '').replace(/^Bearer\s+/, '');
  const correo = srv.sesiones.get(token) || null;
  srv.peticiones.push({ metodo, ruta, cuerpo, correo, t: Date.now() });
  const responder = (estado, datos) => route.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(datos) });
  const noExiste = () => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Route ${metodo}:/api/${ruta} not found`, error: 'Not Found', statusCode: 404 }) });
  if (metodo === 'GET' && ruta === 'empresas/indice') return responder(404, { error: 'no_existe' });
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    const c = String(cuerpo?.correo || '').toLowerCase();
    if (cuerpo?.codigo !== CODIGO || !USUARIOS[c]) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
    srv.sesiones.set(t, c);
    return responder(200, { token: t, ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'cercania') return responder(200, { lejos: false, km: 0, umbralKm: 30, exento: true, cooperativa: null });
  if (!correo) return responder(401, { error: 'sin_sesion' });
  if (metodo === 'GET' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PATCH' && ruta === 'yo') return responder(200, yoDe(correo));
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: [] });
  if (metodo === 'POST' && ruta === 'viajes/cotizacion') {
    if (!srv.rutas) return noExiste();
    return responder(200, { cotizacion: FICHA_COT, valor: srv.cotValor, tipo: 'oficial', km: 2.1, min: 6, fuente: 'ruta', vence: Date.now() + 15 * 60000, version: 1, ...(srv.cotPromo ? { promo: srv.cotPromo } : {}) });
  }
  if (metodo === 'POST' && ruta === 'viajes/llegada') return responder(200, { min: null, fuente: 'ruta' });
  if (!srv.nuevo && (ruta.startsWith('promociones') || ruta.startsWith('conductor/promociones'))) return noExiste();
  if (metodo === 'GET' && ruta === 'promociones/mia') return responder(200, srv.mia || { promo: srv.promo, viajes: [], premios: [] });
  if (metodo === 'GET' && ruta === 'conductor/cobro') return responder(200, { cobro: srv.cobroConductor, version: srv.cobroConductor ? 1 : 0, actualizado: null });
  if (metodo === 'GET' && ruta === 'conductor/promociones') return responder(200, srv.pagos);
  if (metodo === 'POST' && ruta === 'conductor/promociones/aceptar') {
    if (cuerpo?.version !== 'c1') return responder(409, { error: 'version_condiciones' });
    if (srv.pagos) srv.pagos.condiciones = { version: 'c1', aceptadas: true, aceptadasEn: new Date().toISOString() };
    return responder(200, { ok: true, aceptadasEn: new Date().toISOString() });
  }
  return responder(404, { error: 'no_existe' });
}

const enviar = (cx, tipo, datos, de = 'servidor') => {
  try {
    cx.ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de, ts: Date.now(), datos }));
  } catch {
    /* ya cerrado */
  }
};
const enviarA = (rol, tipo, datos) => {
  for (const cx of srv.sockets) if (cx.rol === rol) enviar(cx, tipo, datos);
};
const cortar = (rol) => {
  for (const cx of [...srv.sockets]) {
    if (cx.rol !== rol) continue;
    try {
      cx.ws.close({ code: 4000, reason: 'prueba' });
    } catch {
      /* ya cerrado */
    }
  }
};

function atenderBus(ws) {
  const cx = { ws, rol: null, correo: null, disponible: false };
  srv.sockets.add(cx);
  ws.onClose(() => srv.sockets.delete(cx));
  ws.onMessage((texto) => {
    let m;
    try {
      m = JSON.parse(String(texto));
    } catch {
      return;
    }
    if (m.tipo === 'hola') {
      const correo = srv.sesiones.get(m.datos?.token);
      if (!correo) {
        enviar(cx, 'error', { codigo: 'sin_sesion' });
        ws.close({ code: 4401, reason: 'sin_sesion' });
        return;
      }
      const u = USUARIOS[correo];
      cx.rol = m.datos.rol === 'conductor' ? 'conductor' : 'pasajero';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, datos: m.datos, t: Date.now() });
      const extra = { avisarCentral: true, ...(srv.revision ? { revision: true } : {}) };
      if (cx.rol === 'conductor') {
        enviar(cx, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 4.9, viajes: 120 }, ...extra });
        enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
        return;
      }
      // El 0.16.0 manda la promo (también al revisor en esta prueba: la app debe ignorarla).
      const promo = srv.nuevo && srv.promo ? { promo: srv.promo } : {};
      const rutas = srv.rutas ? { rutas: { cotizar: true, llegada: false } } : {};
      enviar(cx, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana', ...extra, ...promo, ...rutas });
      enviar(cx, 'viaje_actual', srv.viajePasajero || null);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol === 'pasajero' && m.tipo === 'solicitud' && srv.nuevo && m.datos?.premioId) {
      // §6.1: la reserva del premio (o el error, sin guardar nada).
      if (srv.noDisponible) {
        const motivo = srv.noDisponible;
        srv.noDisponible = null;
        enviar(cx, 'error', { codigo: 'premio_no_disponible', viajeId: m.datos.viajeId, motivo });
        return;
      }
      enviar(cx, 'promo_viaje', { viajeId: m.datos.viajeId, ...srv.promoViaje });
      return;
    }
    if (cx.rol !== 'conductor') return;
    if (m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
    if (m.tipo === 'aceptacion') {
      const s = srv.ofertas.get(m.datos?.viajeId);
      if (!s) return enviar(cx, 'error', { codigo: 'servicio_no_disponible' });
      srv.ofertas.delete(s.viajeId);
      srv.viajes.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular: '3157778899' }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: s.nota, codigoHash: '', ...(s.promo ? { promo: s.promo } : {}) });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular: '3157778899' }, codigoHash: '', ...(s.promo ? { promo: s.promo } : {}) });
    }
    if (m.tipo === 'estado') {
      const v = srv.viajes.get(cx.correo);
      if (v && v.viajeId === m.datos?.viajeId) {
        if (m.datos.fase === 'en_viaje') v.estado = 'en_viaje';
        if (m.datos.fase === 'llego') v.estado = 'llego';
        if (m.datos.fase === 'finalizado') srv.viajes.delete(cx.correo);
      }
    }
  });
}
function ofrecer(viajeId, { promo = null, tarifa = 10300 } = {}) {
  const s = {
    viajeId,
    pasajero: { id: `p_${viajeId}`, nombre: 'Ana María', calificacion: 4.8 },
    origen: { lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
    destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
    tarifa, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '', codigoHash: '',
    ...(promo ? { promo } : {}),
  };
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
}

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
let ultima = null; // la última página abierta (para la captura de una falla)
async function contexto(nombre, { ancho = 390, alto = 844 } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  const p = await ctx.newPage();
  ultima = { p, nombre };
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const textoCrudo = (p, sel) => p.evaluate((s) => {
  const n = document.querySelector(s);
  return n && !n.hidden && !n.closest('[hidden]') ? n.textContent.replace(/\s+/g, ' ').trim() : null;
}, sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const holas = (rol) => srv.hola.filter((h) => h.rol === rol).length;
// Un aviso que coincide con re. Los que ya estaban en pantalla antes de marcar (marcarAvisos) no cuentan.
const marcarAvisos = (p) => p.evaluate(() => document.querySelectorAll('.a-avisos .a-toast').forEach((t) => (t.dataset.visto = '1'))).catch(() => {});
const conAviso = (p, re, timeout = 10000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not([data-visto])')].some((t) => new RegExp(f).test(t.textContent.replace(/\s+/g, ' '))), re.source, { timeout }));
const sinXss = (p) => p.evaluate(() => window.__xss === undefined && !document.querySelector('img[src="x"]'));
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function tocarModal(p, textoBoton) {
  const sel = `.a-modal-capa.a-abierto .a-modal :is(button, a):has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(350);
  await p.click(sel);
  await p.waitForTimeout(400);
}
const modalAbierto = (p) => p.evaluate(() => {
  const c = [...document.querySelectorAll('.a-modal-capa.a-abierto')].at(-1);
  if (!c) return null;
  return { titulo: c.querySelector('h2')?.textContent.trim() || '', texto: c.querySelector('.a-modal-texto')?.textContent.trim() || '', botones: [...c.querySelectorAll('.a-modal-acciones :is(button, a)')].map((x) => x.textContent.trim()), clase: c.className };
});
async function entrarPasajero(p, url = `${BASE}taxicun/?real=1`) {
  await p.goto(url);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', ANA);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000);
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
}
const solicitudes = (desde) => srv.mensajes.filter((m) => m.rol === 'pasajero' && m.tipo === 'solicitud' && m.t >= desde);
async function aConfirmar(p) {
  await p.waitForFunction(() => !/Buscando dirección/.test(document.querySelector('[data-origen-titulo]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await p.click('[data-frecuente] >> nth=0');
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
}
async function pedirDesdeConfirmar(p) {
  const t0 = Date.now();
  await p.click('[data-pedir]');
  const s = await hasta(() => solicitudes(t0)[0], 8000);
  return s?.datos || null;
}
const CONDUCTOR_VIAJE = { id: 'c_luis', movil: '023', placa: 'WFK123', nombre: 'Luis Alberto Rodríguez', vehiculo: 'Renault Logan', color: 'Amarillo', calificacion: 4.9, viajes: 120, tel: '3109876543' };
async function asignarYViajar(p, s, { promo = null } = {}) {
  const v = s.viajeId;
  const pos = { lat: CENTRO.lat + 0.004, lng: CENTRO.lng };
  srv.viajePasajero = { viajeId: v, estado: 'asignado', origen: s.origen, destino: s.destino, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: s.metodoPago, nota: s.nota || '', codigoHash: s.codigoHash || '', conductorId: 'c_luis', conductor: CONDUCTOR_VIAJE, pos, ...(promo ? { promo } : {}) };
  enviarA('pasajero', 'aceptacion', { viajeId: v, conductor: CONDUCTOR_VIAJE, pos, etaMin: 4 });
  await vista(p, 'asignado', 10000);
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'en_viaje' });
  srv.viajePasajero.estado = 'en_viaje';
  await vista(p, 'en_viaje', 10000);
  await p.waitForTimeout(500);
}
const tarjetaInicio = (p) => p.evaluate(() => {
  const n = document.querySelector('[data-promo-inicio]');
  if (!n || n.hidden) return null;
  const q = (s) => n.querySelector(s)?.textContent.trim() || '';
  return { anillo: q('[data-promo-anillo]'), titulo: q('[data-promo-titulo]'), sub: q('[data-promo-sub]'), tipo: n.querySelector('[data-promo-tipo]')?.dataset.promoTipo || '' };
});
const filaPromo = (p) => p.evaluate(() => {
  const n = document.querySelector('[data-promo-confirmar]');
  if (!n || n.hidden) return null;
  const q = (s) => {
    const x = n.querySelector(s);
    return x && !x.hidden ? x.textContent.trim() : '';
  };
  return {
    interruptor: q('[data-promo-interruptor]'), sub: q('[data-promo-sub-interruptor]'), linea: q('[data-promo-linea]'), nota: q('[data-promo-nota]'),
    activo: n.querySelector('[data-usar-premio]')?.getAttribute('aria-checked'),
    boton: document.querySelector('[data-pedir-txt]')?.textContent.trim() || '', total: document.querySelector('[data-total-boton]')?.textContent.trim() || '',
    tarjeta: (() => {
      const t = document.querySelector('[data-promo-tarjeta]');
      return t && !t.hidden ? t.querySelector('small')?.textContent.trim() : '';
    })(),
  };
});
async function abrirMenuPasajero(p) {
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-capa.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(300);
  return p.$$eval('.a-menu-item', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
}
async function cerrarMenu(p) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}
let paginaAvisos = null; // la página cuyos avisos se marcan antes de mandar algo (ver conAviso)
const enviarPromo = async (promo, evento = null) => {
  if (paginaAvisos) await marcarAvisos(paginaAvisos);
  enviarA('pasajero', 'promo', { ...promo, ...(evento ? { evento } : {}) });
};

/* ------------------------------------------------------------------ */
/* a) Pasajero contra un servidor 0.15.0                               */
/* ------------------------------------------------------------------ */
async function pasajeroServidorAnterior() {
  srv.nuevo = false;
  const { ctx, p } = await contexto('pasajero-0.15');
  const t0 = Date.now();
  await entrarPasajero(p);
  const h = srv.hola.filter((x) => x.rol === 'pasajero').at(-1);
  ok(JSON.stringify(h?.datos?.capacidades) === '["seguridad","promo"]', `a) el hola del pasajero dice capacidades [seguridad, promo] (${JSON.stringify(h?.datos?.capacidades)})`);
  ok((await tarjetaInicio(p)) === null, 'a) servidor 0.15.0: ninguna tarjeta de la promoción en el inicio');
  const menu = await abrirMenuPasajero(p);
  ok(!menu.some((x) => /Promociones/.test(x)), `a) el menú no tiene «Promociones» (${menu.map((x) => x.split(' ')[0]).join(', ')})`);
  await cerrarMenu(p);
  await aConfirmar(p);
  ok((await filaPromo(p)) === null && !(await textoCrudo(p, '[data-promo-tarjeta]')), 'a) «Confirma tu viaje» sin «Usar mi viaje gratis» ni línea de la tarjeta');
  const boton = await texto(p, '[data-pedir-txt]');
  ok(boton === 'Pedir taxi', `a) el botón de siempre («${boton}»)`);
  const s = await pedirDesdeConfirmar(p);
  ok(s && !('premioId' in s), 'a) la solicitud no lleva premioId');
  await vista(p, 'buscando', 10000);
  ok(!(await textoCrudo(p, '[data-chip-promo]')), 'a) sin chip de viaje gratis');
  await asignarYViajar(p, s);
  enviarA('pasajero', 'estado', { viajeId: s.viajeId, conductorId: 'c_luis', fase: 'finalizado', valor: s.tarifa, km: 2.1 });
  await vista(p, 'pagar', 10000);
  const total = await texto(p, '[data-total-pagar]');
  ok(total.replace(/\D/g, '') === String(s.tarifa) && !(await p.$('[data-promo-pagar]')), `a) pagar: el total de siempre (${total})`);
  srv.viajePasajero = null;
  ok(srv.peticiones.filter((x) => x.t >= t0 && /promociones/.test(x.ruta)).length === 0, 'a) ninguna llamada a /api/promociones');
  await foto(p, 'a-pasajero-servidor-0.15-pagar');
  await ctx.close();
  srv.nuevo = true;
}

/* ------------------------------------------------------------------ */
/* b) Pasajero con la promoción                                        */
/* ------------------------------------------------------------------ */
async function pasajeroPromo() {
  srv.promo = promoBase();
  const { ctx, p } = await contexto('pasajero');
  paginaAvisos = p;
  await entrarPasajero(p);
  // b1) El inicio con 7 de 10.
  let t = await hasta(() => tarjetaInicio(p), 6000);
  ok(t?.titulo === 'Llevas 7 de 10' && t.sub === 'Tu viaje gratis está cerca' && t.anillo === '7/10', `b1) inicio: «${t?.titulo} · ${t?.sub}» (${t?.anillo})`);
  await foto(p, 'b1-inicio-7-de-10');
  // Sumó un viaje.
  srv.promo = promoBase({ llevas: 8 });
  await enviarPromo(srv.promo, { tipo: 'sumo', viajeId: 'v_x1' });
  ok(await conAviso(p, /Sumaste 1 viaje.*Llevas 8 de 10/), 'b1) evento sumo: aviso «Sumaste 1 viaje · Llevas 8 de 10…»');
  t = await hasta(async () => ((await tarjetaInicio(p))?.titulo === 'Llevas 8 de 10' ? tarjetaInicio(p) : null), 4000);
  ok(t?.anillo === '8/10', 'b1) la tarjeta pasa a 8/10');
  // No sumó por el GPS: texto genérico, nunca el detector.
  await enviarPromo(srv.promo, { tipo: 'no_sumo', viajeId: 'v_x2', motivo: 'gps_dudoso' });
  ok(await conAviso(p, /no pudimos verificar el recorrido/), 'b1) no_sumo gps_dudoso: «no pudimos verificar el recorrido»');
  await enviarPromo(srv.promo, { tipo: 'no_sumo', viajeId: 'v_x3', motivo: 'mismo_conductor' });
  ok(await conAviso(p, /ya llevas 3 viajes de esta tarjeta con el mismo conductor/), 'b1) no_sumo mismo_conductor: con el máximo vigente (3)');
  // Con 9: «¡Te falta 1 viaje…!».
  srv.promo = promoBase({ llevas: 9 });
  await enviarPromo(srv.promo, { tipo: 'sumo' });
  t = await hasta(async () => ((await tarjetaInicio(p))?.anillo === '9/10' ? tarjetaInicio(p) : null), 4000);
  ok(t?.sub === '¡Te falta 1 viaje para tu viaje gratis!', `b1) con 9: «${t?.sub}»`);
  // Ganó el premio: modal grande y la tarjeta cambia.
  srv.promo = promoBase({ llevas: 0, premio: premio() });
  await enviarPromo(srv.promo, { tipo: 'premio' });
  await p.waitForSelector('.a-modal-promo.a-abierto', { timeout: 6000 });
  const mp = await modalAbierto(p);
  ok(mp?.titulo === '¡Ganaste un viaje gratis!' && mp.texto === 'TaxiCun te regala tu próximo viaje (hasta $10.000). Úsalo antes del 12 de diciembre.' && mp.botones.join('|') === 'Ver condiciones|Listo', `b1) premio: modal «${mp?.titulo}» · «${mp?.texto}» (${mp?.botones?.join(' | ')})`);
  const hrefCond = await p.$eval('.a-modal-promo a', (a) => a.getAttribute('href')).catch(() => '');
  ok(/\/promociones\/viaje-gratis\/$/.test(hrefCond), `b1) «Ver condiciones» lleva a los términos (${hrefCond})`);
  await foto(p, 'b1-modal-premio');
  await tocarModal(p, 'Listo');
  t = await tarjetaInicio(p);
  ok(t?.titulo === '¡Tienes un viaje gratis!' && t.sub === 'Úsalo antes del 12 de diciembre' && t.anillo === 'Gratis', `b1) inicio con premio: «${t?.titulo} · ${t?.sub}»`);
  await foto(p, 'b1-inicio-con-premio');
  // Canje en pausa y tarjeta llena (sin premio en esta cuenta).
  await enviarPromo(promoBase({ llevas: 0, premio: premio(), canjePausado: true }), { tipo: 'config' });
  t = await hasta(async () => (/pausa/.test((await tarjetaInicio(p))?.sub || '') ? tarjetaInicio(p) : null), 4000);
  ok(t?.sub === 'Tu viaje gratis está en pausa por unas horas. No pierdes días.', 'b1) canje en pausa: «… No pierdes días.»');
  await enviarPromo(promoBase({ llevas: 2, llena: true }), { tipo: 'config' });
  t = await hasta(async () => ((await tarjetaInicio(p))?.tipo === 'llena' ? tarjetaInicio(p) : null), 4000);
  ok(t?.titulo === 'Completaste otra tarjeta', 'b1) tarjeta llena esperando su premio');
  // Integración con el servidor 0.16.0: el premio de otra cooperativa dice dónde se usa (premio.cooperativa) y el mensaje
  // «promo» sin nada que mostrar ({ id, vigente: false, premio: null, evento }) quita la tarjeta y da el aviso.
  await enviarPromo(promoBase({ llevas: 0, vigente: false, premio: premio({ aqui: false, cooperativa: { id: 'cootransrural', nombre: 'Cootransrural', municipio: 'El Rosal' } }) }), { tipo: 'config' });
  t = await hasta(async () => ((await tarjetaInicio(p))?.titulo === 'Tienes un viaje gratis' ? tarjetaInicio(p) : null), 4000);
  ok(t?.sub === 'Se puede usar en Cootransrural (El Rosal).', `b1) premio de otra cooperativa: «${t?.sub}»`);
  await enviarPromo({ id: 'viaje-gratis', vigente: false, premio: null }, { tipo: 'premio_anulado' });
  ok(await conAviso(p, /Tu viaje gratis fue anulado/), 'b1) «promo» sin nada que mostrar con premio_anulado: el aviso');
  ok(await hasta(async () => (await tarjetaInicio(p)) === null, 4000), 'b1) «promo» sin nada que mostrar: la tarjeta del inicio se quita');
  await enviarPromo(srv.promo, { tipo: 'config' });
  await hasta(async () => (await tarjetaInicio(p))?.tipo === 'premio', 4000);

  // b2) «Confirma tu viaje» sin cotización del servidor: aproximada.
  await aConfirmar(p);
  let f = await hasta(() => filaPromo(p), 6000);
  const tarifa = Number((await texto(p, '[data-total]')).replace(/\D/g, ''));
  ok(f?.interruptor === 'Usar mi viaje gratis' && f.sub === 'TaxiCun paga hasta $10.000' && f.activo === 'false', `b2) «Usar mi viaje gratis» apagado por defecto (${f?.activo})`);
  ok(f?.linea === '' && f.boton === 'Pedir taxi' && f.total.replace(/\D/g, '') === String(tarifa), `b2) apagado: el botón de siempre («${f?.boton} ${f?.total}»)`);
  ok(f?.tarjeta === 'Viaje 1 de 10 de tu tarjeta', `b2) la línea de la tarjeta («${f?.tarjeta}»)`);
  await foto(p, 'b2-confirmar-apagado');
  await p.click('[data-usar-premio]');
  f = await filaPromo(p);
  const paga = Math.max(0, tarifa - 10000);
  const esperada = paga === 0 ? 'Este viaje te sale gratis (aprox.)' : `TaxiCun paga $10.000 · Tú pagas $${paga.toLocaleString('es-CO')} (aprox.)`;
  ok(f?.activo === 'true' && f.linea === esperada, `b2) encendido: «${f?.linea}» (tarifa ${tarifa})`);
  ok(f?.boton === (paga === 0 ? 'Pedir taxi gratis' : `Pedir taxi · pagas $${paga.toLocaleString('es-CO')}`) && f.total === '', `b2) el botón: «${f?.boton}»`);
  ok(f?.tarjeta === 'Este viaje no suma mientras uses tu viaje gratis', `b2) «${f?.tarjeta}»`);
  ok((await texto(p, '[data-total]')).replace(/\D/g, '') === String(tarifa), 'b2) la tarifa del viaje no cambia (S31)');
  await foto(p, 'b2-confirmar-encendido');
  // Apagarlo otra vez: pide sin premio.
  await p.click('[data-usar-premio]');
  f = await filaPromo(p);
  ok(f?.activo === 'false' && f.boton === 'Pedir taxi', 'b2) se puede volver a apagar');
  await p.click('[data-volver]');
  await vista(p, 'inicio', 8000);
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(300);

  // b3) Con la cotización del servidor (rutas): exacta. Pedir con el premio.
  srv.rutas = true;
  srv.cotValor = 10300;
  srv.cotPromo = { premioId: PREMIO_ID, cubre: 10000, pasajeroPaga: 300, tope: 10000 };
  cortar('pasajero');
  await hasta(() => holas('pasajero') > 0 && [...srv.sockets].some((x) => x.rol === 'pasajero'), 8000);
  await p.waitForTimeout(1200);
  await aConfirmar(p);
  await p.click('[data-usar-premio]');
  f = await hasta(async () => ((await filaPromo(p))?.linea?.startsWith('TaxiCun paga') ? filaPromo(p) : null), 5000);
  ok(f?.linea === 'TaxiCun paga $10.000 · Tú pagas $300' && f.boton === 'Pedir taxi · pagas $300', `b3) con cotizacion.promo, exacta: «${f?.linea}» · «${f?.boton}»`);
  await foto(p, 'b3-confirmar-cotizacion');
  let s = await pedirDesdeConfirmar(p);
  ok(s?.premioId === PREMIO_ID && s.tarifa === 10300 && s.cotizacion === FICHA_COT, `b3) la solicitud lleva premioId y la tarifa de siempre (${s?.premioId}, ${s?.tarifa})`);
  await vista(p, 'buscando', 10000);
  const chip = await hasta(() => textoCrudo(p, '[data-chip-promo]'), 5000);
  ok(chip === 'Viaje gratisTú pagas $300' || chip === 'Viaje gratis Tú pagas $300', `b3) promo_viaje: chip «${chip}»`);
  await foto(p, 'b3-buscando-chip');
  // promo_app: ningún taxi con la app al día.
  enviarA('pasajero', 'sin_conductores', { viajeId: s.viajeId, motivo: 'promo_app' });
  await p.waitForSelector('[data-promo-app]:not([hidden])', { timeout: 6000 });
  const sinTaxis = await textoCrudo(p, '[data-sin-taxis-titulo]');
  ok(sinTaxis === 'Los taxis cerca todavía no tienen la app al día', `b3) promo_app: «${sinTaxis}» con «Pedir sin el viaje gratis»`);
  await foto(p, 'b3-promo-app');
  const t1 = Date.now();
  await p.click('[data-sin-premio]');
  const cancel = await hasta(() => srv.mensajes.find((m) => m.rol === 'pasajero' && m.tipo === 'cancelacion' && m.t >= t1), 5000);
  const otra = await hasta(() => solicitudes(t1)[0], 5000);
  ok(cancel?.datos?.viajeId === s.viajeId && otra && otra.datos.viajeId !== s.viajeId && !('premioId' in otra.datos), 'b3) «Pedir sin el viaje gratis»: cancela el pedido gratis y pide el mismo viaje sin premioId');
  await p.waitForTimeout(500);
  ok(!(await textoCrudo(p, '[data-chip-promo]')) && (await p.$('[data-promo-app][hidden]')), 'b3) ya sin chip ni aviso de promo_app');
  await enviarPromo(srv.promo, { tipo: 'premio_devuelto', viajeId: s.viajeId });
  ok(await conAviso(p, /Tu viaje gratis sigue guardado/), 'b3) premio_devuelto: «Tu viaje gratis sigue guardado»');
  // Se cancela esta búsqueda para seguir.
  await p.click('[data-cancelar]');
  await intento(tocarModal(p, 'Ya no lo necesito'));
  await intento(tocarModal(p, 'Cancelar'));
  await vista(p, 'inicio', 10000).catch(() => {});
  await p.waitForTimeout(500);

  // b4) premio_no_disponible con cada motivo: el pedido no salió; «Volver» o «Pedir sin el viaje gratis».
  const MOTIVOS = { en_uso: 'Tu viaje gratis está en otro pedido.', pausado: 'El canje está en pausa por unas horas. No pierdes días.', sin_tarifa: 'No pudimos calcular el valor de este viaje para la promoción. Intenta de nuevo en un momento o pide sin el viaje gratis.', vencido: 'Tu viaje gratis venció.', cooperativa: 'Tu viaje gratis no se puede usar en esta cooperativa.', usado: 'Ya usaste ese viaje gratis.', no_existe: 'Ese viaje gratis ya no está disponible.', anulado: 'Ese viaje gratis ya no está disponible.' };
  let primero = true;
  for (const [motivo, txt] of Object.entries(MOTIVOS)) {
    if (p.isClosed()) break;
    if ((await p.getAttribute('.a-app', 'data-vista')) !== 'confirmar') await aConfirmar(p);
    if ((await filaPromo(p))?.activo !== 'true') await p.click('[data-usar-premio]');
    srv.noDisponible = motivo;
    const t2 = Date.now();
    await p.click('[data-pedir]');
    await p.waitForSelector('.a-modal-promo-no.a-abierto', { timeout: 6000 }).catch(() => {});
    const m = await modalAbierto(p);
    ok(m?.titulo === 'No pudimos usar tu viaje gratis' && m.texto === txt && m.botones.join('|') === 'Volver|Pedir sin el viaje gratis', `b4) premio_no_disponible ${motivo}: «${m?.texto}»`);
    if (primero) await foto(p, 'b4-premio-no-disponible');
    if (motivo === 'en_uso') {
      await tocarModal(p, 'Volver');
      await vista(p, 'confirmar', 8000);
      ok(solicitudes(t2).length === 1, 'b4) «Volver»: vuelve a «Confirma tu viaje» sin pedir nada más');
    } else if (motivo === 'sin_tarifa') {
      await tocarModal(p, 'Pedir sin el viaje gratis');
      const nueva = await hasta(() => solicitudes(t2)[1], 5000);
      ok(nueva && !('premioId' in nueva.datos), 'b4) «Pedir sin el viaje gratis»: sale el mismo viaje sin premioId');
      await vista(p, 'buscando', 8000);
      await p.click('[data-cancelar]');
      await intento(tocarModal(p, 'Ya no lo necesito'));
      await intento(tocarModal(p, 'Cancelar'));
      await vista(p, 'inicio', 10000).catch(() => {});
      await p.waitForTimeout(400);
    } else {
      await tocarModal(p, 'Volver');
      await vista(p, 'confirmar', 8000).catch(() => {});
    }
    primero = false;
  }

  // b5) El viaje gratis con diferencia: paga $300.
  if ((await p.getAttribute('.a-app', 'data-vista')) !== 'confirmar') await aConfirmar(p);
  if ((await filaPromo(p))?.activo !== 'true') await p.click('[data-usar-premio]');
  s = await pedirDesdeConfirmar(p);
  await vista(p, 'buscando', 10000);
  await asignarYViajar(p, s, { promo: { cubre: 10000, pasajeroPaga: 300, tope: 10000 } });
  const chipViaje = await hasta(() => textoCrudo(p, '[data-chip-promo]'), 4000);
  ok(/Viaje gratis/.test(chipViaje || '') && /\$300/.test(chipViaje || ''), `b5) en viaje: chip «${chipViaje}»`);
  await foto(p, 'b5-en-viaje-chip');
  await marcarAvisos(p);
  enviarA('pasajero', 'estado', { viajeId: s.viajeId, conductorId: 'c_luis', fase: 'finalizado', valor: 10300, km: 2.1, promo: { cubierto: 10000, pasajeroPaga: 300 } });
  enviarA('pasajero', 'cobro', { viajeId: s.viajeId, conductorId: 'c_luis', valor: 300, metodos: [], promo: { cubierto: 10000 } });
  await vista(p, 'pagar', 10000);
  await p.waitForTimeout(600);
  const pg = { titulo: await textoCrudo(p, '[data-promo-pagar-titulo]'), cuerpo: await textoCrudo(p, '[data-promo-pagar-cuerpo]'), total: await textoCrudo(p, '[data-total-pagar]') };
  ok(pg.titulo === 'TaxiCun pagó $10.000 de tu viaje' && pg.cuerpo === 'Paga $300 al conductor' && pg.total === '$300', `b5) pagar: «${pg.titulo}» · «${pg.cuerpo}» · total ${pg.total}`);
  ok(await conAviso(p, /TaxiCun pagó \$10\.000\. Paga \$300 al conductor/), 'b5) aviso al llegar: «TaxiCun pagó $10.000. Paga $300 al conductor.»');
  await foto(p, 'b5-pagar-diferencia');
  // El premio se gana justo al terminar un viaje (llega en «pagar»): el modal espera a que pague y califique.
  await enviarPromo(srv.promo, { tipo: 'premio' });
  await p.waitForTimeout(900);
  ok(!(await p.$('.a-modal-promo.a-abierto')), 'b5) un premio que llega en «pagar»: el modal no tapa el pago');
  const t3 = Date.now();
  await p.click('[data-efectivo]');
  await p.waitForSelector('.a-modal-capa.a-abierto', { timeout: 5000 });
  const me = await modalAbierto(p);
  ok(/\$300/.test(me?.texto || ''), `b5) «¿Pagaste en efectivo?» por $300 («${me?.texto}»)`);
  await tocarModal(p, 'Sí, ya pagué');
  const pago = await hasta(() => srv.mensajes.find((m) => m.rol === 'pasajero' && m.tipo === 'pago' && m.t >= t3), 4000);
  ok(pago?.datos?.valor === 300 && pago.datos.metodo === 'efectivo', `b5) el pago es por la diferencia (${JSON.stringify(pago?.datos)})`);
  await vista(p, 'calificar', 8000);
  ok(!(await p.$('.a-modal-promo.a-abierto')), 'b5) … ni la calificación');
  await p.click('[data-omitir]');
  await vista(p, 'inicio', 10000).catch(() => {});
  ok(Boolean(await p.waitForSelector('.a-modal-promo.a-abierto', { timeout: 6000 }).catch(() => null)), 'b5) … y sale al volver al inicio');
  await tocarModal(p, 'Listo');
  srv.viajePasajero = null;
  await p.waitForTimeout(500);

  // b6) Sin diferencia: «No tienes que pagar nada» y «Calificar el viaje»; o el conductor lo confirma ('promocion').
  srv.rutas = false;
  srv.cotPromo = null;
  for (const via of ['boton', 'conductor']) {
    if ((await p.getAttribute('.a-app', 'data-vista')) !== 'confirmar') await aConfirmar(p);
    if ((await filaPromo(p))?.activo !== 'true') await p.click('[data-usar-premio]');
    srv.promoViaje = { cubre: 8700, pasajeroPaga: 0, tope: 10000 };
    s = await pedirDesdeConfirmar(p);
    await vista(p, 'buscando', 10000);
    const chip0 = await hasta(() => textoCrudo(p, '[data-chip-promo]'), 4000);
    ok(chip0 === 'Viaje gratis', `b6-${via}) sin diferencia: chip «${chip0}» (sin «Tú pagas»)`);
    await asignarYViajar(p, s, { promo: { cubre: 8700, pasajeroPaga: 0, tope: 10000 } });
    enviarA('pasajero', 'estado', { viajeId: s.viajeId, conductorId: 'c_luis', fase: 'finalizado', valor: 8700, km: 2.1, promo: { cubierto: 8700, pasajeroPaga: 0 } });
    enviarA('pasajero', 'cobro', { viajeId: s.viajeId, conductorId: 'c_luis', valor: 0, metodos: [], promo: { cubierto: 8700 } });
    await vista(p, 'pagar', 10000);
    await p.waitForTimeout(500);
    const g = { titulo: await textoCrudo(p, '[data-promo-pagar-titulo]'), cuerpo: await textoCrudo(p, '[data-promo-pagar-cuerpo]'), total: await textoCrudo(p, '[data-total-pagar]'), efectivo: Boolean(await p.$('[data-efectivo]')), calificar: Boolean(await p.$('[data-promo-calificar]')) };
    ok(g.titulo === 'TaxiCun pagó $8.700 de tu viaje' && g.cuerpo === 'No tienes que pagar nada. ¡Disfruta tu viaje gratis!' && g.total === '$0' && !g.efectivo && g.calificar, `b6-${via}) pagar: «${g.cuerpo}», total ${g.total}, sin «Ya pagué en efectivo»`);
    if (via === 'boton') {
      await foto(p, 'b6-pagar-gratis');
      const t4 = Date.now();
      await p.click('[data-promo-calificar]');
      await vista(p, 'calificar', 8000);
      ok(!srv.mensajes.some((m) => m.rol === 'pasajero' && m.tipo === 'pago' && m.t >= t4), 'b6-boton) «Calificar el viaje»: no manda ningún pago');
    } else {
      enviarA('pasajero', 'pago_confirmado', { viajeId: s.viajeId, conductorId: 'c_luis', metodo: 'promocion', valor: 0 });
      await vista(p, 'calificar', 8000);
    }
    const ok1 = await textoCrudo(p, '.a-pago-ok');
    ok(/Viaje gratis/.test(ok1 || '') && /TaxiCun pagó \$8\.700 de tu viaje/.test(ok1 || ''), `b6-${via}) calificar: «${ok1}»`);
    if (via === 'conductor') await foto(p, 'b6-calificar-viaje-gratis');
    await p.click('[data-omitir]');
    await vista(p, 'inicio', 10000).catch(() => {});
    srv.viajePasajero = null;
    await p.waitForTimeout(500);
  }

  // b7) Cancelaciones: el conductor cancela → se vuelve a pedir con el mismo premio; el pasajero cancela → vuelve.
  srv.promoViaje = { cubre: 10000, pasajeroPaga: 300, tope: 10000 };
  if ((await p.getAttribute('.a-app', 'data-vista')) !== 'confirmar') await aConfirmar(p);
  if ((await filaPromo(p))?.activo !== 'true') await p.click('[data-usar-premio]');
  s = await pedirDesdeConfirmar(p);
  await vista(p, 'buscando', 10000);
  enviarA('pasajero', 'aceptacion', { viajeId: s.viajeId, conductor: CONDUCTOR_VIAJE, pos: { lat: CENTRO.lat + 0.004, lng: CENTRO.lng }, etaMin: 4 });
  await vista(p, 'asignado', 8000);
  const t5 = Date.now();
  await marcarAvisos(p);
  enviarA('pasajero', 'cancelacion', { viajeId: s.viajeId, por: 'conductor', conductorId: 'c_luis', motivo: 'Se me pinchó una llanta' });
  await enviarPromo(srv.promo, { tipo: 'premio_devuelto', viajeId: s.viajeId });
  const repedido = await hasta(() => solicitudes(t5)[0], 6000);
  ok(repedido && repedido.datos.viajeId !== s.viajeId && repedido.datos.premioId === PREMIO_ID, 'b7) el conductor canceló: se vuelve a pedir solo, con el mismo premioId');
  await p.waitForTimeout(1200);
  ok(!(await conAviso(p, /Tu viaje gratis sigue guardado/, 500)), 'b7) mientras lo vuelve a pedir, no dice «sigue guardado»');
  await vista(p, 'buscando', 6000);
  await p.click('[data-cancelar]');
  await intento(tocarModal(p, 'Ya no lo necesito'));
  await intento(tocarModal(p, 'Cancelar'));
  await vista(p, 'inicio', 10000).catch(() => {});
  await enviarPromo(srv.promo, { tipo: 'premio_devuelto', viajeId: repedido?.datos?.viajeId });
  ok(await conAviso(p, /Tu viaje gratis sigue guardado/), 'b7) el pasajero canceló: «Tu viaje gratis sigue guardado»');
  t = await tarjetaInicio(p);
  ok(t?.titulo === '¡Tienes un viaje gratis!', 'b7) y la tarjeta del inicio lo sigue mostrando');
  await foto(p, 'b7-premio-devuelto');

  // b8) La hoja «Promociones».
  srv.mia = {
    promo: srv.promo,
    viajes: [
      { viajeId: 'v_a', fin: '2026-10-13T20:00:00Z', cuenta: true, motivo: null },
      { viajeId: 'v_b', fin: '2026-10-12T20:00:00Z', cuenta: false, motivo: 'gps_dudoso' },
      { viajeId: 'v_c', fin: '2026-10-11T20:00:00Z', cuenta: false, motivo: 'valor_minimo' },
    ],
    premios: [{ id: PREMIO_ID, estado: 'emitido', emitido: '2026-10-13T20:00:00Z', vence: VENCE, usadoEn: null, viajeId: null }],
  };
  const menu = await abrirMenuPasajero(p);
  const item = menu.find((x) => x.startsWith('Promociones'));
  ok(item === 'Promociones ¡Tienes un viaje gratis!', `b8) menú: «${item}»`);
  await p.click('.a-menu-item:has-text("Promociones")');
  await p.waitForSelector('.a-panel-promo.a-abierto [data-hoja-viajes] li:not(.a-promo-vacio)', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  const hoja = await p.evaluate(() => {
    const h = document.querySelector('.a-panel-promo');
    const q = (s) => [...h.querySelectorAll(s)].map((n) => n.innerText.replace(/\s+/g, ' ').trim());
    return { viajes: q('[data-hoja-viajes] li'), asi: q('[data-hoja-asi] li'), premio: q('[data-hoja-premio]')[0] || '', terminos: h.querySelector('[data-promo-terminos]')?.getAttribute('href') || '', sellos: h.querySelector('.a-sellos')?.getAttribute('aria-label') || '' };
  });
  ok(hoja.viajes.join(' | ') === '13 oct Sumó | 12 oct No sumó: no pudimos verificar el recorrido. | 11 oct No sumó: su valor fue menor que la carrera mínima ($6.100).', `b8) los viajes de la tarjeta (${hoja.viajes.join(' | ')})`);
  ok(hoja.asi.length === 4 && hoja.asi[0] === 'Cada 10 viajes completados, el siguiente es gratis hasta $10.000.' && hoja.asi[3] === 'Máximo 3 viajes de cada tarjeta con el mismo conductor.', '«b8) Así funciona» con los valores vigentes');
  ok(/hasta \$10\.000/.test(hoja.premio) && /12 de diciembre/.test(hoja.premio), `b8) el premio con su vencimiento («${hoja.premio}»)`);
  ok(/\/promociones\/viaje-gratis\/$/.test(hoja.terminos), 'b8) «Términos y condiciones» enlazado');
  ok(pide('GET', 'promociones/mia').length >= 1, 'b8) la hoja pidió GET /api/promociones/mia');
  await foto(p, 'b8-hoja-promociones');
  await p.click('.a-panel-promo [data-cerrar]');
  await p.waitForTimeout(400);

  // b9) Textos con < > y basura del servidor: nada se ejecuta ni se pinta como HTML.
  const sucio = { ...promoBase({ llevas: 3, premio: premio() }), titulo: XSS, nombre: `<b>${XSS}</b>`, terminos: `javascript:alert(1)` };
  await enviarPromo(sucio, { tipo: 'no_sumo', motivo: XSS, viajeId: XSS });
  enviarA('pasajero', 'promo', { ...promoBase(), meta: XSS });
  enviarA('pasajero', 'promo_viaje', { viajeId: XSS, cubre: XSS, pasajeroPaga: 0 });
  await p.waitForTimeout(1500);
  const cuerpo = await p.evaluate(() => document.body.innerHTML);
  ok((await sinXss(p)) && !cuerpo.includes('onerror="window.__xss') && !/<b><img/.test(cuerpo), 'b9) textos con < > del servidor: nada ejecutado ni pintado como HTML');
  ok(await conAviso(p, /no pudimos verificar el recorrido/), 'b9) un motivo desconocido sale con el texto genérico');
  ok(errores.filter((x) => x.startsWith('[pasajero]')).length === 0, `b) sin errores en la página (${errores.filter((x) => x.startsWith('[pasajero]')).join(' | ')})`);
  srv.mia = null;
  await ctx.close();
}

// b10) Modo revisor: aunque la bienvenida trajera la promo, nada. b11) La demo: nada.
async function revisorYDemo() {
  srv.revision = true;
  srv.promo = promoBase({ premio: premio() });
  const { ctx, p } = await contexto('revisor');
  paginaAvisos = p;
  await entrarPasajero(p);
  await p.waitForTimeout(1200);
  ok((await tarjetaInicio(p)) === null, 'b10) modo revisor: sin tarjeta en el inicio');
  await enviarPromo(srv.promo, { tipo: 'premio' });
  await p.waitForTimeout(1200);
  ok(!(await p.$('.a-modal-promo')), 'b10) modo revisor: un «promo» que llegara no muestra nada');
  await aConfirmar(p);
  ok((await filaPromo(p)) === null, 'b10) modo revisor: sin «Usar mi viaje gratis»');
  await ctx.close();
  srv.revision = false;
  const d = await contexto('demo');
  const t0 = Date.now();
  await d.p.goto(`${BASE}taxicun/`);
  await d.p.waitForTimeout(3500);
  ok(!(await d.p.$('[data-promo-inicio]')) && srv.peticiones.filter((x) => x.t >= t0 && /promociones/.test(x.ruta)).length === 0, 'b11) la demo: nada de la promoción real');
  await d.ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) Conductor                                                        */
/* ------------------------------------------------------------------ */
async function entrarConductor(p) {
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(700);
  await p.click('[data-conectar]');
  await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }));
  await hasta(() => [...srv.sockets].some((cx) => cx.rol === 'conductor' && cx.disponible), 8000);
  // Avisos del celular y similares que se ofrecen al ponerse en turno la primera vez.
  await p.waitForTimeout(600);
  for (let i = 0; i < 2; i++) if (await p.$('.a-modal-capa.a-abierto')) await intento(tocarModal(p, 'Ahora no'));
}
const oferta = (p) => p.evaluate(() => {
  const n = document.querySelector('.a-solicitud [data-sol-promo]');
  if (!n) return null;
  const q = (s) => {
    const x = n.querySelector(s);
    return x && !x.hidden ? x.textContent.trim() : '';
  };
  return { chip: n.querySelector('.a-chip-promo')?.textContent.trim() || '', paga: q('[data-sol-promo-paga]'), pasajero: q('[data-sol-promo-pasajero]'), registrar: q('[data-sol-promo-registrar]') };
});
async function hastaEnViaje(p) {
  await p.press('.a-solicitud .a-deslizador-mango', 'Enter');
  await vista(p, 'hacia_origen', 15000);
  await p.waitForTimeout(800);
  await p.click('[data-llegue]');
  await vista(p, 'en_origen', 10000);
  await p.click('[data-casillas] input >> nth=0');
  await p.keyboard.type('1234', { delay: 40 });
  await p.waitForTimeout(300);
  if ((await p.getAttribute('.a-app', 'data-vista')) === 'en_origen') await p.click('[data-iniciar]:not([disabled])').catch(() => {});
  await vista(p, 'en_viaje', 10000);
}
async function terminarCon(p, valor) {
  await p.click('[data-terminar]');
  await p.waitForSelector('.a-modal-capa.a-abierto input[name=valor]', { timeout: 6000 });
  const nota = await textoCrudo(p, '.a-modal-capa.a-abierto [data-promo-cobro-nota]');
  await p.fill('.a-modal-capa.a-abierto input[name=valor]', String(valor));
  await p.dispatchEvent('.a-modal-capa.a-abierto input[name=valor]', 'input');
  await p.waitForTimeout(200);
  await tocarModal(p, 'Terminar y cobrar');
  await vista(p, 'cobrando', 8000);
  await p.waitForTimeout(500);
  return nota;
}
const cobro = (p) => p.evaluate(() => {
  const q = (s) => {
    const x = document.querySelector(s);
    return x && !x.hidden && !x.closest('[hidden]') ? x.textContent.replace(/\s+/g, ' ').trim() : null;
  };
  return {
    paga: q('[data-promo-paga]'), titulo: q('[data-promo-cobro-titulo]'), taxicun: q('[data-promo-cobro-taxicun]'), falta: q('[data-promo-falta]'), accion: q('[data-promo-falta-accion]'),
    terminar: Boolean(q('[data-promo-terminar]')), efectivo: Boolean(q('[data-efectivo]')), transferencia: Boolean(q('[data-transferencia]')),
  };
});

async function conductorPromo() {
  srv.cobroConductor = null;
  srv.pagos = {
    condiciones: { version: 'c1', aceptadas: false, aceptadasEn: null }, comoMePagan: false,
    semanas: [{ semana: '2026-10-19', desde: '2026-10-12', hasta: '2026-10-18', viajes: 2, cubierto: 18700, bono: 5700, total: 24400, estado: 'por_pagar', pagadaEn: null }, { semana: '2026-10-12', desde: '2026-10-05', hasta: '2026-10-11', viajes: 1, cubierto: 10000, bono: 3000, total: 13000, estado: 'pagada', pagadaEn: '2026-10-14T15:00:00Z' }],
    viajes: [{ viajeId: 'v_1', fin: '2026-10-13T20:00:00Z', valor: 10300, cubierto: 10000, bono: 3090, total: 13090, estado: 'retenido' }],
  };
  const { ctx, p } = await contexto('conductor');
  await entrarConductor(p);
  const hc = srv.hola.filter((x) => x.rol === 'conductor').at(-1);
  ok(JSON.stringify(hc?.datos?.capacidades) === '["promo"]', `c1) el hola del conductor: capacidades [promo] (${JSON.stringify(hc?.datos?.capacidades)})`);
  let menu = await (async () => {
    await p.click('[data-menu]');
    await p.waitForSelector('.a-menu-capa.a-abierto', { timeout: 5000 });
    await p.waitForTimeout(300);
    const l = await p.$$eval('.a-menu-item', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    return l;
  })();
  ok(!menu.some((x) => /Pagos de TaxiCun/.test(x)), 'c1) sin viajes con promoción todavía: el menú no tiene «Pagos de TaxiCun»');

  // c2) La oferta del viaje gratis con diferencia, sin «Cómo me pagan».
  const t0 = Date.now();
  ofrecer('vg-1', { promo: { cubre: 10000, bono: 3090, total: 13090, pasajeroPaga: 300 }, tarifa: 10300 });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  let o = await oferta(p);
  ok(o?.chip === 'Viaje con promoción' && o.paga === 'TaxiCun te paga $10.000 + bono $3.090' && o.pasajero === 'El pasajero te paga $300', `c2) la oferta: «${o?.chip}» · «${o?.paga}» · «${o?.pasajero}»`);
  o = await hasta(async () => ((await oferta(p))?.registrar ? oferta(p) : null), 5000);
  ok(o?.registrar === 'Registra “Cómo me pagan” para recibir este pago', `c2) sin «Cómo me pagan»: «${o?.registrar}»`);
  ok(pide('GET', 'conductor/cobro', t0).length === 1, 'c2) preguntó una vez por «Cómo me pagan»');
  await p.waitForTimeout(700);
  const visible = await p.$eval('.a-solicitud [data-sol-promo]', (n) => {
    const r = n.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight + 1 ? true : `${Math.round(r.top)}–${Math.round(r.bottom)} de ${innerHeight}`;
  });
  ok(visible === true, `c2) lo de la promoción se ve en la oferta a 390 px (${visible})`);
  await foto(p, 'c2-oferta-promocion');
  await hastaEnViaje(p);
  const chipC = await textoCrudo(p, '[data-chip-promo]');
  ok(chipC === 'Viaje con promoción', `c2) en el viaje: chip «${chipC}»`);
  const nota = await terminarCon(p, 10300);
  ok(nota === 'Viaje con promoción: TaxiCun te paga hasta $10.000 de este valor y un bono del 30 %. Escribe el valor real del viaje.', `c2) «¿Cuánto cobras?»: «${nota}»`);
  let k = await cobro(p);
  ok(k.paga === '$300' && k.titulo === 'Cobra $300 al pasajero' && k.efectivo && k.transferencia && !k.terminar, `c2) cobrando antes de promo_final: «${k.titulo}» con efectivo y transferencia`);
  enviarA('conductor', 'promo_final', { viajeId: 'vg-1', valor: 10300, cubierto: 10000, bono: 3090, total: 13090, pasajeroPaga: 300, corte: '2026-10-19', falta: 'como_me_pagan' });
  k = await hasta(async () => ((await cobro(p)).falta ? cobro(p) : null), 5000);
  ok(k?.taxicun === 'TaxiCun te paga $13.090 ($10.000 del viaje + $3.090 de bono) en la liquidación del lunes 19 de octubre.', `c2) promo_final: «${k?.taxicun}»`);
  ok(k?.falta === 'Para recibir este pago registra “Cómo me pagan”.' && k.accion === 'Registrar «Cómo me pagan»', `c2) lo que falta: «${k?.falta}» (${k?.accion})`);
  await foto(p, 'c2-cobrando-diferencia');
  const t1 = Date.now();
  await p.click('[data-efectivo]');
  await p.waitForSelector('.a-modal-capa.a-abierto', { timeout: 5000 });
  const me = await modalAbierto(p);
  ok(/\$300/.test(me?.texto || ''), `c2) «¿Recibiste el efectivo?» por $300 («${me?.texto}»)`);
  await tocarModal(p, 'Sí, recibí el pago');
  const pc = await hasta(() => srv.mensajes.find((m) => m.rol === 'conductor' && m.tipo === 'pago_confirmado' && m.t >= t1), 4000);
  ok(pc?.datos?.metodo === 'efectivo' && pc.datos.valor === 300, `c2) pago_confirmado efectivo por $300 (${JSON.stringify(pc?.datos)})`);
  await vista(p, 'calificar', 8000);
  await p.click('[data-enviar]');
  await vista(p, 'libre', 10000).catch(() => {});
  await p.waitForTimeout(800);

  // c3) Sin diferencia: «El pasajero no te paga» y «Terminar»; falta aceptar las condiciones.
  ofrecer('vg-2', { promo: { cubre: 8700, bono: 2610, total: 11310, pasajeroPaga: 0 }, tarifa: 8700 });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  o = await oferta(p);
  ok(o?.paga === 'TaxiCun te paga $8.700 + bono $2.610' && o.pasajero === 'El pasajero no te paga' && o.registrar === 'Registra “Cómo me pagan” para recibir este pago', `c3) la oferta: «${o?.paga}» · «${o?.pasajero}»`);
  await hastaEnViaje(p);
  await terminarCon(p, 8700);
  k = await cobro(p);
  ok(k.paga === '$0' && k.titulo === 'El pasajero no te paga' && k.terminar && !k.efectivo && !k.transferencia, `c3) cobrando: «${k.titulo}», solo «Terminar»`);
  enviarA('conductor', 'promo_final', { viajeId: 'vg-2', valor: 8700, cubierto: 8700, bono: 2610, total: 11310, pasajeroPaga: 0, corte: '2026-10-19', falta: 'condiciones' });
  k = await hasta(async () => ((await cobro(p)).falta ? cobro(p) : null), 5000);
  ok(k?.taxicun === 'TaxiCun te paga $11.310 ($8.700 del viaje + $2.610 de bono) en la liquidación del lunes 19 de octubre.' && k.falta === 'Acepta las condiciones de pagos de la promoción para recibir este pago.', `c3) promo_final: «${k?.taxicun}» · «${k?.falta}»`);
  await foto(p, 'c3-cobrando-gratis');
  await p.click('[data-promo-falta-accion]');
  await p.waitForSelector('.a-modal-promo-condiciones.a-abierto', { timeout: 6000 });
  const lineas = await p.$$eval('.a-modal-promo-condiciones li', (ns) => ns.map((n) => n.textContent.trim()));
  ok(lineas.length === 4 && lineas[3] === 'Autorizo a interOS S.A.S. a usar mi llave de cobro para pagarme estos viajes.', 'c3) las condiciones de pagos (4 líneas)');
  await foto(p, 'c3-condiciones');
  await tocarModal(p, 'Acepto');
  const acepto = await hasta(() => pide('POST', 'conductor/promociones/aceptar').at(-1), 4000);
  ok(acepto?.cuerpo?.version === 'c1', 'c3) «Acepto» → POST /api/conductor/promociones/aceptar { version: c1 }');
  const t2 = Date.now();
  await p.click('[data-promo-terminar]');
  const pz = await hasta(() => srv.mensajes.find((m) => m.rol === 'conductor' && m.tipo === 'pago_confirmado' && m.t >= t2), 4000);
  ok(pz?.datos?.metodo === 'promocion' && pz.datos.valor === 0 && pz.datos.viajeId === 'vg-2', `c3) «Terminar» → pago_confirmado 'promocion' (${JSON.stringify(pz?.datos)})`);
  await vista(p, 'calificar', 8000);
  const reg = await textoCrudo(p, '.a-pago-recibido');
  ok(/Viaje gratis registrado/.test(reg || '') && /\$11\.310/.test(reg || ''), `c3) calificar: «${reg}»`);
  await p.click('[data-enviar]');
  await vista(p, 'libre', 10000).catch(() => {});
  await p.waitForTimeout(600);

  // c4) «Pagos de TaxiCun».
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-capa.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(300);
  menu = await p.$$eval('.a-menu-item', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ').trim()));
  ok(menu.some((x) => x === 'Pagos de TaxiCun Los viajes gratis de la promoción'), 'c4) después de un viaje con promoción: «Pagos de TaxiCun» en el menú');
  srv.pagos.condiciones = { version: 'c1', aceptadas: false, aceptadasEn: null };
  await p.click('.a-menu-item:has-text("Pagos de TaxiCun")');
  await p.waitForSelector('.a-panel-pagos-promo [data-pagos-semanas]', { timeout: 8000 });
  await p.waitForTimeout(400);
  const pg = await p.evaluate(() => {
    const h = document.querySelector('.a-panel-pagos-promo');
    const q = (s) => [...h.querySelectorAll(s)].map((n) => n.innerText.replace(/\s+/g, ' ').trim());
    return { semanas: q('[data-pagos-semanas] li'), viajes: q('[data-pagos-viajes] li'), cobro: q('[data-pagos-como-me-pagan]')[0] || '', condiciones: Boolean(h.querySelector('[data-pagos-condiciones]')), terminos: Boolean(h.querySelector('[data-promo-terminos]')) };
  });
  ok(pg.semanas[0] === 'Semana del 12 al 18 de oct · 2 viajes · $24.400 · Por pagar' && pg.semanas[1] === 'Semana del 5 al 11 de oct · 1 viaje · $13.000 · Pagado el 14 de oct', `c4) semanas (${pg.semanas.join(' | ')})`);
  ok(pg.viajes[0] === '13 oct · $13.090 · Pendiente', `c4) viajes (${pg.viajes.join(' | ')}): un estado desconocido sale como «Pendiente»`);
  ok(/Sin «Cómo me pagan»/.test(pg.cobro) && pg.condiciones && pg.terminos, 'c4) sin «Cómo me pagan», las condiciones por aceptar y los términos');
  await foto(p, 'c4-pagos-de-taxicun');
  await p.click('.a-panel-pagos-promo [data-cerrar]');
  await p.waitForTimeout(400);

  // c5) Basura en la promo de la oferta: como un viaje de siempre (sin chip ni montos raros).
  ofrecer('vg-3', { promo: { cubre: XSS, bono: '<b>3000</b>', pasajeroPaga: 0 } });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  ok((await oferta(p)) === null && (await sinXss(p)), 'c5) promo con < > o montos que no son pesos: la oferta de siempre, nada ejecutado');
  await p.click('.a-solicitud [data-rechazar]');
  await p.waitForTimeout(600);
  ok(errores.filter((x) => x.startsWith('[conductor]')).length === 0, `c) sin errores en la página (${errores.filter((x) => x.startsWith('[conductor]')).join(' | ')})`);
  await ctx.close();
}

// c6) Contra un servidor 0.15.0: ofertas sin promo, ni chip, ni consulta de «Cómo me pagan», ni «Pagos de TaxiCun».
async function conductorServidorAnterior() {
  srv.nuevo = false;
  const { ctx, p } = await contexto('conductor-0.15');
  const t0 = Date.now();
  await entrarConductor(p);
  ofrecer('v15-1', { tarifa: 8400 });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  ok((await oferta(p)) === null, 'c6) servidor 0.15.0: la oferta de siempre (sin «Viaje con promoción»)');
  await hastaEnViaje(p);
  ok(!(await textoCrudo(p, '[data-chip-promo]')), 'c6) sin chip en el viaje');
  const nota = await terminarCon(p, 8400);
  ok(nota === null, 'c6) «¿Cuánto cobras?» sin la línea de la promoción');
  const k = await cobro(p);
  ok(k.paga === null && k.efectivo && k.transferencia && !k.terminar, 'c6) el cobro de siempre (efectivo y transferencia)');
  ok(pide('GET', 'conductor/cobro', t0).length === 0 && srv.peticiones.filter((x) => x.t >= t0 && /promociones/.test(x.ruta)).length === 0, 'c6) ninguna llamada nueva al servidor');
  await foto(p, 'c6-conductor-servidor-0.15');
  await ctx.close();
  srv.nuevo = true;
}

const pasos = [pasajeroServidorAnterior, pasajeroPromo, revisorYDemo, conductorPromo, conductorServidorAnterior];
const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice(7);
for (const paso of pasos) {
  if (solo && !solo.split(',').includes(paso.name)) continue;
  try {
    await paso();
  } catch (e) {
    ok(false, `${paso.name}: ${e.message.split('\n')[0]} (${(e.stack || '').split('\n').find((l) => l.includes('promo-app.mjs'))?.trim() || ''})`);
    if (ultima && !ultima.p.isClosed()) await foto(ultima.p, `falla-${paso.name}`);
  }
}
await b.close();
const errs = errores.filter((x) => !/\[demo\]/.test(x));
ok(errs.length === 0, `sin errores de página (${errs.slice(0, 5).join(' | ')})`);
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
