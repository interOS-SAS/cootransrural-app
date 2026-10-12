// Ronda B de «algoritmos» (servidor 0.15.0: «¿Todo bien en tu viaje?» y GPS falso) en las apps del diseño A, modo real
// (?real=1), con el servidor de TaxiCun simulado aquí mismo (HTTP con page.route y el WebSocket /api/bus con
// routeWebSocket), siguiendo el contrato de DISENO-RONDA-B.md §7 y §11 (nucleo/seguridad.js). Recorre:
//  a) pasajero contra un servidor 0.14.0 (sin seguridadViaje ni preguntas): el hola dice capacidades, la línea del viaje
//     es la de hoy, ninguna llamada a /api/viajes/seguridad y nada nuevo en pantalla.
//  b) pasajero con la revisión encendida: la línea «Cuidamos tu viaje…»; la tarjeta con cada motivo (alertdialog, foco en
//     «Sí, todo bien», cuenta regresiva, no se cierra tocando afuera ni con Escape), «vista» una sola vez; «Sí, todo bien»
//     → «Gracias»; «Necesito ayuda» → el SOS con «Ya le avisamos…» y «Mandar mi ubicación a la central» (POST /api/sos
//     con el viaje); sin responder → «Le avisamos a la central…» (y responder después); retirada sin aviso; respuesta
//     que no sale → «No pudimos enviar tu respuesta…» con «Intentar de nuevo»; el viaje termina con la pregunta abierta →
//     «¿Llegaste bien?»; recarga con la pregunta guardada (la central la repite / ya no la repite); textos con < > y
//     basura de la central → no se muestra nada (ni HTML); el modo revisor nunca la ve; capturas a 390 y 1366 px.
//  c) app 1.2 (Capacitor simulado): con el bus caído, tocar el push { tipo: 'seguridad' } reconecta ya y la bienvenida
//     trae la pregunta.
//  d) conductor: presencia y ubicación con precision, ts, velocidad, rumbo y altitud de la lectura; un
//     seguridad_pregunta / seguridad_cierre que le llegara por error no muestra nada; nunca un texto de la revisión.
//
// Uso: node pruebas/algoritmos-b-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5821 --api=http://127.0.0.1:5829). Capturas en $CAPTURAS. ~4 min.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5821/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/algoritmos/ronda-b/capturas/app').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const CODIGO = '123456';
const LUIS = 'luis@prueba.taxicun.com';
const ANA = 'ana@prueba.taxicun.com';
const TOKEN_PUSH = 'b0b0'.repeat(16);
const XSS = '<img src=x onerror="window.__xss=1">';
const LINEA_HOY = 'Tu viaje queda registrado. Compártelo con alguien de confianza.';
const LINEA_SEG = 'Cuidamos tu viaje: si notamos algo raro, te preguntamos si todo está bien. Compártelo con alguien de confianza.';
const MOTIVOS = [
  ['parada', null, 'El taxi lleva un rato detenido.'],
  ['desvio', 'alejamiento', 'El taxi se está alejando de tu destino.'],
  ['desvio', 'sin_avance', 'Tu viaje está tardando más de lo normal.'],
  ['desvio', 'muy_largo', 'Tu viaje está tardando más de lo normal.'],
  ['velocidad', null, 'El taxi va muy rápido.'],
  ['sin_senal', 'sin_ubicacion', 'Perdimos la ubicación del taxi.'],
  ['sin_senal', 'ubicacion_dudosa', 'No podemos ver bien la ubicación del taxi.'],
];

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
const srv = {
  n: 0,
  nuevo: true, // false = servidor 0.14.0 (sin seguridadViaje ni preguntas)
  seguridadViaje: true,
  revision: false,
  sesiones: new Map(),
  peticiones: [],
  hola: [],
  mensajes: [],
  sockets: new Set(),
  ofertas: new Map(),
  viajes: new Map(),
  viajePasajero: null,
  // La pregunta vigente que la central repite con cada bienvenida (null: ninguna).
  pendiente: null,
  reenviar: true,
  seguridad: { modo: 'ok', abortar: 0 }, // modo: ok | 403 | 404
  bloquearBus: false, // el bus del pasajero no conecta (sin señal)
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
  if (!correo) return responder(401, { error: 'sin_sesion' });
  if (metodo === 'GET' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PATCH' && ruta === 'yo') return responder(200, yoDe(correo));
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: [] });
  if (metodo === 'POST' && ruta === 'sos') return responder(200, { ok: true, id: 7, veces: 2 });
  if (metodo === 'POST' && ruta === 'viajes/seguridad') {
    if (!srv.nuevo) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Route POST:/api/viajes/seguridad not found', error: 'Not Found', statusCode: 404 }) });
    if (srv.seguridad.abortar > 0) {
      srv.seguridad.abortar -= 1;
      return route.abort('internetdisconnected');
    }
    if (srv.seguridad.modo === '403') return responder(403, { error: 'prohibido' });
    if (srv.seguridad.modo === '404') return responder(404, { error: 'no_existe' });
    const r = cuerpo?.respuesta;
    if (!['vista', 'bien', 'ayuda'].includes(r) || !/^sg_/.test(cuerpo?.preguntaId || '')) return responder(400, { error: 'datos_invalidos' });
    if (srv.pendiente?.preguntaId === cuerpo.preguntaId && r !== 'vista') srv.pendiente = null;
    return responder(200, { ok: true, estado: r === 'vista' ? 'preguntando' : r });
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
// La pregunta como la manda la central (plazoS: lo que falta del plazo).
const preguntaDe = (q) => ({ viajeId: q.viajeId, preguntaId: q.preguntaId, motivo: q.motivo, subtipo: q.subtipo ?? null, plazoS: Math.max(0, Math.min(1800, Math.round((q.vence - Date.now()) / 1000))), estado: q.estado || 'abierta', despues: Boolean(q.despues) });
let nPregunta = 0;
function preguntar(viajeId, motivo, subtipo = null, { plazoS = 120, reenviar = true } = {}) {
  const q = { viajeId, preguntaId: `sg_prueba${String(++nPregunta).padStart(8, '0')}`, motivo, subtipo, vence: Date.now() + plazoS * 1000, estado: 'abierta' };
  srv.pendiente = reenviar ? q : null;
  enviarA('pasajero', 'seguridad_pregunta', preguntaDe(q));
  return q;
}

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
      if (cx.rol === 'pasajero' && srv.bloquearBus) {
        ws.close({ code: 4000, reason: 'sin_senal' });
        return;
      }
      const extra = { avisarCentral: true, ...(srv.revision ? { revision: true } : {}) };
      if (cx.rol === 'conductor') {
        enviar(cx, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 4.9, viajes: 120 }, ...extra });
        enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
        return;
      }
      const seg = srv.nuevo && srv.seguridadViaje && !srv.revision ? { seguridadViaje: true } : {};
      enviar(cx, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana', ...extra, ...seg });
      enviar(cx, 'viaje_actual', srv.viajePasajero || null);
      // §5.3: la pregunta vigente sale otra vez después de viaje_actual.
      if (srv.nuevo && srv.pendiente && srv.reenviar) enviar(cx, 'seguridad_pregunta', preguntaDe(srv.pendiente));
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol !== 'conductor') return;
    if (m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
    if (m.tipo === 'aceptacion') {
      const s = srv.ofertas.get(m.datos?.viajeId);
      if (!s) return enviar(cx, 'error', { codigo: 'servicio_no_disponible' });
      srv.ofertas.delete(s.viajeId);
      srv.viajes.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular: '3157778899' }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: s.nota, codigoHash: '', pedidoCentral: true });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular: '3157778899' }, codigoHash: '', pedidoCentral: true });
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
function pedidoCentral(viajeId) {
  const s = {
    viajeId,
    pasajero: { id: `p_central_${viajeId}`, nombre: 'Juan Pérez', calificacion: null },
    origen: { lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
    destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
    tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '', pedidoCentral: true,
  };
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
}

/* ------------------------------------------------------------------ */
/* Capacitor simulado (push) y GPS con velocidad y altitud             */
/* ------------------------------------------------------------------ */
function capacitorFalso(cfg) {
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const plugins = {};
  const oyentes = {};
  plugins.PushNotifications = {
    async checkPermissions() {
      return { receive: L('__permisoPush') || 'prompt' };
    },
    async requestPermissions() {
      L('__permisoPush', 'granted');
      return { receive: 'granted' };
    },
    async register() {
      setTimeout(() => (oyentes.registration || []).forEach((f) => f({ value: cfg.tokenPush })), 40);
    },
    async addListener(ev, fn) {
      (oyentes[ev] ||= []).push(fn);
      return { remove: async () => { oyentes[ev] = (oyentes[ev] || []).filter((x) => x !== fn); } };
    },
    async removeAllListeners() {},
    async createChannel() {},
    async removeAllDeliveredNotifications() {},
  };
  window.__push = {
    tocar: (data) => (oyentes.pushNotificationActionPerformed || []).forEach((f) => f({ actionId: 'tap', notification: { id: 'n1', title: '¿Todo bien en tu viaje?', body: 'Toca para responder.', data } })),
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: (n) => n in plugins, Plugins: plugins };
}
// El GPS emulado de Chromium no trae velocidad ni altitud: se agregan a cada lectura (como un teléfono andando).
function gpsConVelocidad() {
  const g = navigator.geolocation;
  const envolver = (fn) => (p) => fn({ timestamp: p.timestamp, coords: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, altitude: 2563.4, altitudeAccuracy: 8, heading: 91.7, speed: 8.46 } });
  const watch = g.watchPosition.bind(g);
  const una = g.getCurrentPosition.bind(g);
  g.watchPosition = (ok, no, op) => watch(envolver(ok), no, op);
  g.getCurrentPosition = (ok, no, op) => una(envolver(ok), no, op);
}

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { cfg = null, ancho = 390, alto = 844, gpsVel = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  if (cfg) await ctx.addInitScript(capacitorFalso, cfg);
  if (gpsVel) await ctx.addInitScript(gpsConVelocidad);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const textoCrudo = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const holas = (rol) => srv.hola.filter((h) => h.rol === rol).length;
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].some((t) => new RegExp(f).test(t.textContent.replace(/\s+/g, ' '))), re.source, { timeout }));
const sinXss = (p) => p.evaluate(() => window.__xss === undefined);
const TARJETA = '.a-modal-seguridad.a-abierto';
const hayTarjeta = (p) => p.$(TARJETA).then(Boolean);
const tarjeta = async (p) => p.evaluate(() => {
  const c = document.querySelector('.a-modal-seguridad.a-abierto');
  if (!c) return null;
  const v = (s) => {
    const n = c.querySelector(s);
    return n && !n.hidden ? n.textContent : null;
  };
  const d = c.querySelector('.a-modal');
  return {
    titulo: v('[data-seg-titulo]'), motivo: v('[data-seg-motivo]'), cuenta: v('[data-seg-cuenta]'), estado: v('[data-seg-estado]'),
    rol: d.getAttribute('role'), vivo: d.getAttribute('aria-live'), modal: d.getAttribute('aria-modal'),
    botones: [...c.querySelectorAll('.a-modal-acciones button')].filter((x) => !x.hidden).map((x) => `${x.textContent.trim()}${x.disabled ? ' (inactivo)' : ''}`),
    foco: document.activeElement?.hasAttribute('data-seg-bien') ? 'bien' : document.activeElement?.tagName || '',
    html: c.innerHTML,
  };
});
const esperarTarjeta = (p, ms = 8000) => hasta(() => tarjeta(p), ms);
const sinTarjeta = (p, ms = 5000) => hasta(async () => !(await p.$('.a-modal-seguridad')), ms);

async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function tocarModal(p, textoBoton, clase = '') {
  const sel = `${clase ? `.${clase} ` : ''}.a-modal :is(button, a):has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(350);
  await p.click(sel);
  await p.waitForTimeout(400);
}
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
}
const solicitudes = (desde) => srv.mensajes.filter((m) => m.rol === 'pasajero' && m.tipo === 'solicitud' && m.t >= desde);
async function pedir(p) {
  const t0 = Date.now();
  await p.waitForFunction(() => !/Buscando dirección/.test(document.querySelector('[data-origen-titulo]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await p.click('[data-frecuente] >> nth=0');
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 10000);
  const s = await hasta(() => solicitudes(t0)[0], 8000);
  return s?.datos?.viajeId || null;
}
const CONDUCTOR_VIAJE = { id: 'c_luis', movil: '023', placa: 'WFK123', nombre: 'Luis Alberto Rodríguez', vehiculo: 'Renault Logan', color: 'Amarillo', calificacion: 4.9, viajes: 120, tel: '3109876543' };
// El pasajero ya en el taxi (después del código de abordaje).
async function enViaje(p, { antes = null } = {}) {
  const t0 = Date.now();
  const v = await pedir(p);
  const s = solicitudes(t0)[0]?.datos || {};
  const pos = { lat: CENTRO.lat + 0.004, lng: CENTRO.lng };
  srv.viajePasajero = { viajeId: v, estado: 'asignado', origen: s.origen, destino: s.destino, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: s.metodoPago, nota: s.nota || '', codigoHash: s.codigoHash || '', conductorId: 'c_luis', conductor: CONDUCTOR_VIAJE, pos };
  enviarA('pasajero', 'aceptacion', { viajeId: v, conductor: CONDUCTOR_VIAJE, pos, etaMin: 4 });
  await vista(p, 'asignado', 10000);
  if (antes) await antes();
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'en_viaje' });
  srv.viajePasajero.estado = 'en_viaje';
  await vista(p, 'en_viaje', 10000);
  await p.waitForTimeout(600);
  return v;
}
const lineaViaje = (p) => textoCrudo(p, '.a-hoja [data-seguro]');
async function reconectarPasajero(p) {
  const h0 = holas('pasajero');
  cortar('pasajero');
  await hasta(() => holas('pasajero') > h0, 12000);
  await p.waitForTimeout(1200);
}

/* ------------------------------------------------------------------ */
/* a) Contra un servidor 0.14.0                                        */
/* ------------------------------------------------------------------ */
async function servidorAnterior() {
  srv.nuevo = false;
  const { ctx, p } = await contexto('pasajero-0.14');
  await entrarPasajero(p);
  const h = srv.hola.filter((x) => x.rol === 'pasajero').at(-1);
  ok(JSON.stringify(h?.datos?.capacidades) === '["seguridad"]', `a) el hola del pasajero dice capacidades: ['seguridad'] (${JSON.stringify(h?.datos?.capacidades)})`);
  const t0 = Date.now();
  const v = await enViaje(p);
  ok(Boolean(v), 'a) el pasajero va en el taxi (en_viaje)');
  ok((await lineaViaje(p)) === LINEA_HOY, `a) la línea del viaje es la de hoy («${await lineaViaje(p)}»)`);
  await p.waitForTimeout(1500);
  ok(pide('POST', 'viajes/seguridad').length === 0 && !(await p.$('.a-modal-seguridad')), 'a) ninguna llamada a /api/viajes/seguridad y ninguna tarjeta');
  ok(srv.mensajes.filter((m) => m.rol === 'pasajero' && m.t >= t0 && !['solicitud'].includes(m.tipo)).length === 0, 'a) el pasajero no manda nada nuevo por el bus');
  await foto(p, 'a-servidor-0.14-en-viaje');
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'finalizado', valor: 8400, km: 2.1 });
  await vista(p, 'pagar', 10000);
  srv.viajePasajero = null;
  await ctx.close();
  srv.nuevo = true;
}

/* ------------------------------------------------------------------ */
/* b) Con la revisión encendida                                        */
/* ------------------------------------------------------------------ */
async function pasajeroSeguridad() {
  const { ctx, p } = await contexto('pasajero');
  await entrarPasajero(p);
  const v = await enViaje(p);
  ok((await lineaViaje(p)) === LINEA_SEG, `b) con seguridadViaje la línea dice «${LINEA_SEG}»`);
  ok(!(await p.$('.a-modal-seguridad')), 'b) sin pregunta, sin tarjeta');

  // b1) La pregunta: parada larga.
  let t0 = Date.now();
  let q = preguntar(v, 'parada');
  let c = await esperarTarjeta(p);
  ok(c?.titulo === '¿Todo bien en tu viaje?' && c.motivo === 'El taxi lleva un rato detenido.', `b1) «¿Todo bien en tu viaje?» con el motivo (${c?.titulo} · ${c?.motivo})`);
  ok(/^Si no respondes, en (2:00|1:59|1:58) le avisamos a la central de Cootransrural\.$/.test(c?.cuenta || ''), `b1) la cuenta regresiva («${c?.cuenta}»)`);
  ok(JSON.stringify(c?.botones) === JSON.stringify(['Sí, todo bien', 'Necesito ayuda']), `b1) los dos botones (${c?.botones?.join(' | ')})`);
  ok(c?.rol === 'alertdialog' && c.vivo === 'assertive' && c.modal === 'true', 'b1) role="alertdialog", aria-live="assertive"');
  await p.waitForTimeout(500);
  c = await tarjeta(p);
  ok(c?.foco === 'bien', `b1) el foco en «Sí, todo bien» (${c?.foco})`);
  await p.waitForTimeout(1600);
  const c2 = await tarjeta(p);
  ok(c2 && c2.cuenta !== c.cuenta, `b1) la cuenta baja («${c.cuenta}» → «${c2?.cuenta}»)`);
  await foto(p, 'b1-todo-bien-parada-390');
  const vistas = () => pide('POST', 'viajes/seguridad', t0).filter((x) => x.cuerpo?.respuesta === 'vista');
  await hasta(() => vistas().length > 0, 4000);
  ok(vistas().length === 1 && vistas()[0].cuerpo.preguntaId === q.preguntaId && vistas()[0].cuerpo.viajeId === v, `b1) «vista» a la central, una vez (${vistas().length})`);
  // No se cierra tocando afuera ni con Escape.
  await p.mouse.click(195, 40);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  ok(await hayTarjeta(p), 'b1) tocar afuera o Escape no la cierran');
  // La central la repite (reconexión): sigue una sola tarjeta y «vista» no se repite.
  await reconectarPasajero(p);
  ok((await p.$$('.a-modal-seguridad')).length === 1 && vistas().length === 1, `b1) repetida con la bienvenida: una sola tarjeta y «vista» una vez (${vistas().length})`);
  ok(srv.mensajes.filter((m) => m.rol === 'pasajero' && m.t >= t0).length === 0, 'b1) nada por el bus (el conductor no se entera de nada)');

  // b2) «Sí, todo bien» → «Gracias».
  t0 = Date.now();
  await p.click('[data-seg-bien]');
  ok(Boolean(await sinTarjeta(p)), 'b2) «Sí, todo bien» quita la tarjeta');
  const bienes = pide('POST', 'viajes/seguridad', t0);
  ok(bienes.length === 1 && JSON.stringify(bienes[0].cuerpo) === JSON.stringify({ viajeId: v, preguntaId: q.preguntaId, respuesta: 'bien' }), `b2) POST /api/viajes/seguridad { respuesta: 'bien' } (${JSON.stringify(bienes.map((x) => x.cuerpo))})`);
  ok(await conAviso(p, /Gracias.*Seguimos pendientes de tu viaje\./, 5000), 'b2) aviso «Gracias. Seguimos pendientes de tu viaje.»');
  await foto(p, 'b2-gracias');
  // La central no la repite ya; si llegara otra vez la misma, no vuelve.
  enviarA('pasajero', 'seguridad_pregunta', preguntaDe({ ...q, vence: Date.now() + 60000 }));
  await p.waitForTimeout(800);
  ok(!(await p.$('.a-modal-seguridad')), 'b2) la misma pregunta ya respondida no vuelve a salir');

  // b3) Cada motivo con su texto; «retirada» la quita sin aviso.
  for (const [motivo, subtipo, esperado] of MOTIVOS) {
    q = preguntar(v, motivo, subtipo);
    c = await hasta(async () => {
      const x = await tarjeta(p);
      return x?.motivo === esperado ? x : null;
    }, 5000);
    ok(Boolean(c), `b3) ${motivo}${subtipo ? `/${subtipo}` : ''} → «${esperado}»`);
    if (motivo === 'velocidad') await foto(p, 'b3-velocidad');
  }
  const avisosAntes = await p.$$eval('.a-avisos .a-toast', (n) => n.length);
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: q.preguntaId, estado: 'retirada' });
  srv.pendiente = null;
  ok(Boolean(await sinTarjeta(p)), 'b3) seguridad_cierre «retirada» → la tarjeta se va');
  ok((await p.$$eval('.a-avisos .a-toast', (n) => n.length)) === avisosAntes, 'b3) sin aviso');
  // Un cierre de otra pregunta no toca la de ahora.
  q = preguntar(v, 'parada');
  await esperarTarjeta(p);
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: 'sg_otrapregunta0001', estado: 'retirada' });
  await p.waitForTimeout(600);
  ok(await hayTarjeta(p), 'b3) el cierre de otra pregunta no la quita');
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: q.preguntaId, estado: 'bien' });
  ok(Boolean(await sinTarjeta(p)), 'b3) seguridad_cierre «bien» (respondida en otro aparato) → se va');
  srv.pendiente = null;

  // b4) «Necesito ayuda» → el SOS con el texto cambiado y «Mandar mi ubicación a la central».
  q = preguntar(v, 'desvio', 'alejamiento');
  await esperarTarjeta(p);
  t0 = Date.now();
  await p.click('[data-seg-ayuda]');
  ok(Boolean(await sinTarjeta(p)), 'b4) «Necesito ayuda» quita la tarjeta');
  const sosAbierto = await intento(p.waitForSelector('.a-modal-sos-seguridad.a-abierto .a-modal h2', { timeout: 6000 }));
  ok(sosAbierto, 'b4) y abre el SOS de siempre');
  const ayudas = await hasta(() => pide('POST', 'viajes/seguridad', t0).filter((x) => x.cuerpo?.respuesta === 'ayuda'), 5000);
  ok(ayudas?.length === 1 && ayudas[0].cuerpo.preguntaId === q.preguntaId, 'b4) POST /api/viajes/seguridad { respuesta: \'ayuda\' }');
  const tSos = await texto(p, '.a-modal-sos-seguridad .a-modal-texto');
  ok(tSos === 'Ya le avisamos a la central de Cootransrural. Si estás en peligro, llama a la Línea 123 de la Policía.', `b4) «${tSos}»`);
  const acc = await p.$$eval('.a-modal-sos-seguridad .a-modal-acciones > *', (ns) => ns.map((n) => n.innerText.trim()));
  ok(acc[0] === 'Llamar a la Línea 123' && acc[1] === 'Mandar mi ubicación a la central' && !acc.includes('Avisar a la central de Cootransrural'), `b4) «Llamar a la Línea 123» y «Mandar mi ubicación a la central» (${acc.join(' | ')})`);
  await foto(p, 'b4-necesito-ayuda-sos');
  await tocarModal(p, 'Mandar mi ubicación a la central', 'a-modal-sos-seguridad');
  const sos = await hasta(() => pide('POST', 'sos', t0)[0], 6000);
  ok(sos?.cuerpo?.viajeId === v && sos.cuerpo.rol === 'pasajero' && Number.isFinite(sos.cuerpo.pos?.lat), `b4) POST /api/sos con el viaje y la ubicación del celular (${JSON.stringify({ viajeId: sos?.cuerpo?.viajeId, pos: Boolean(sos?.cuerpo?.pos) })})`);
  await p.waitForSelector('.a-modal-sos-central', { timeout: 8000 }).catch(() => {});
  await tocarModal(p, 'Cerrar', 'a-modal-sos-central').catch(() => {});
  await p.waitForTimeout(500);
  ok(!(await p.$('.a-modal-seguridad')), 'b4) la tarjeta no vuelve');

  // b5) Sin responder: «Le avisamos a la central…» y responder después.
  q = preguntar(v, 'parada', null, { plazoS: 3 });
  await esperarTarjeta(p);
  c = await hasta(async () => {
    const x = await tarjeta(p);
    return x?.titulo === 'Le avisamos a la central de Cootransrural' ? x : null;
  }, 8000);
  ok(Boolean(c), 'b5) vencido el plazo: «Le avisamos a la central de Cootransrural»');
  ok(c?.motivo === 'No alcanzaste a responder. Si todo está bien, dilo aquí.' && c.cuenta === null && JSON.stringify(c.botones) === JSON.stringify(['Sí, todo bien', 'Necesito ayuda']), `b5) «No alcanzaste a responder…», sin cuenta y con los dos botones (${c?.motivo})`);
  await foto(p, 'b5-avisada');
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: q.preguntaId, estado: 'avisada' });
  await p.waitForTimeout(500);
  ok((await tarjeta(p))?.titulo === 'Le avisamos a la central de Cootransrural', 'b5) el cierre «avisada» de la central la deja igual');
  t0 = Date.now();
  await p.click('[data-seg-bien]');
  ok(Boolean(await sinTarjeta(p)) && pide('POST', 'viajes/seguridad', t0).some((x) => x.cuerpo?.respuesta === 'bien'), 'b5) «Sí, todo bien» después de avisada: sale y se va');
  // «avisada» que llega de una vez (la app se abrió después de escalar).
  q = { viajeId: v, preguntaId: 'sg_avisadadeunavez1', motivo: 'velocidad', subtipo: null, vence: Date.now() + 600000, estado: 'avisada' };
  enviarA('pasajero', 'seguridad_pregunta', preguntaDe(q));
  c = await esperarTarjeta(p);
  ok(c?.titulo === 'Le avisamos a la central de Cootransrural', 'b5) estado «avisada» desde la central → la tarjeta lo dice');
  t0 = Date.now();
  await p.waitForTimeout(800);
  ok(pide('POST', 'viajes/seguridad', t0 - 900).filter((x) => x.cuerpo?.respuesta === 'vista').length === 0, 'b5) una «avisada» no manda «vista»');
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: q.preguntaId, estado: 'retirada' });
  await sinTarjeta(p);

  // b6) La respuesta no sale: «No pudimos enviar tu respuesta…» y «Intentar de nuevo».
  q = preguntar(v, 'parada');
  await esperarTarjeta(p);
  srv.seguridad.modo = '403';
  await p.click('[data-seg-bien]');
  c = await hasta(async () => {
    const x = await tarjeta(p);
    return x?.estado === 'No pudimos enviar tu respuesta. Revisa tu conexión.' ? x : null;
  }, 6000);
  ok(Boolean(c) && JSON.stringify(c.botones) === JSON.stringify(['Sí, todo bien', 'Necesito ayuda', 'Intentar de nuevo']), `b6) error → «No pudimos enviar tu respuesta. Revisa tu conexión.» con «Intentar de nuevo» (${c?.botones?.join(' | ')})`);
  await foto(p, 'b6-error');
  srv.seguridad.modo = 'ok';
  srv.seguridad.abortar = 1;
  t0 = Date.now();
  await p.click('[data-seg-reintentar]');
  c = await hasta(async () => {
    const x = await tarjeta(p);
    return x?.estado === 'Enviando tu respuesta…' ? x : null;
  }, 3000);
  ok(Boolean(c) && c.botones.includes('Sí, todo bien (inactivo)') && c.botones.includes('Necesito ayuda'), `b6) sin señal: «Enviando tu respuesta…» y «Necesito ayuda» sigue a mano (${c?.botones?.join(' | ')})`);
  ok(Boolean(await sinTarjeta(p, 10000)), 'b6) vuelve la señal: sale (reintento) y la tarjeta se va');
  ok(pide('POST', 'viajes/seguridad', t0).filter((x) => x.cuerpo?.respuesta === 'bien').length === 2, 'b6) dos intentos con la misma respuesta');

  // b7) El viaje termina con la pregunta abierta: sigue como «¿Llegaste bien?».
  q = preguntar(v, 'desvio', 'muy_largo');
  await esperarTarjeta(p);
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'finalizado', valor: 8400, km: 2.1 });
  srv.viajePasajero = null;
  await vista(p, 'pagar', 10000);
  c = await hasta(async () => {
    const x = await tarjeta(p);
    return x?.titulo === '¿Llegaste bien?' ? x : null;
  }, 5000);
  ok(Boolean(c) && c.motivo === 'Tu viaje está tardando más de lo normal.', `b7) el conductor termina el viaje: la pregunta sigue como «¿Llegaste bien?» (${c?.titulo})`);
  await foto(p, 'b7-llegaste-bien');

  // b8) Recarga con la pregunta guardada: la central la repite (después: true) y sigue.
  await p.reload();
  c = await esperarTarjeta(p, 20000);
  ok(Boolean(c), 'b8) tras recargar, la tarjeta sigue (guardada en el teléfono)');
  srv.pendiente = { ...q, despues: true };
  await p.waitForTimeout(6000);
  c = await tarjeta(p);
  ok(c?.titulo === '¿Llegaste bien?', `b8) la central la repitió tras la bienvenida: sigue («${c?.titulo}»)`);
  // Recarga sin que la central la repita (ya no vale): se va sola.
  srv.reenviar = false;
  await p.reload();
  ok(Boolean(await esperarTarjeta(p, 20000)), 'b8) recargada otra vez: se muestra mientras llega la bienvenida');
  ok(Boolean(await sinTarjeta(p, 12000)), 'b8) la central ya no la repite: se va sola');
  srv.reenviar = true;
  srv.pendiente = null;

  // b9) Basura y HTML de la central: no se muestra nada.
  await p.waitForTimeout(500);
  const malas = [
    { viajeId: v, preguntaId: 'sg_basura000000001', motivo: XSS, subtipo: null, plazoS: 120, estado: 'abierta', despues: false },
    { viajeId: v, preguntaId: 'sg_basura000000002', motivo: 'parada', subtipo: '<b>x</b>', plazoS: 120, estado: 'abierta', despues: false },
    { viajeId: `v_${XSS}`, preguntaId: 'sg_basura000000003', motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false },
    { viajeId: v, preguntaId: `sg_${XSS}`, motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false },
    { viajeId: v, preguntaId: 'sg_basura000000005', motivo: 'parada', subtipo: null, plazoS: '120', estado: 'abierta', despues: false },
    { viajeId: v, preguntaId: 'sg_basura000000006', motivo: 'parada', subtipo: null, plazoS: 120, estado: '<i>abierta</i>', despues: false },
    { viajeId: v, preguntaId: 'sg_basura000000007', motivo: 'parada', subtipo: null, plazoS: 99999, estado: 'abierta', despues: false },
  ];
  for (const m of malas) enviarA('pasajero', 'seguridad_pregunta', m);
  enviarA('pasajero', 'seguridad_pregunta', null);
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: XSS, estado: XSS });
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-seguridad')) && (await sinXss(p)), 'b9) preguntas con < > o fuera del contrato: ninguna tarjeta, nada ejecutado');
  // Una buena con campos de más con HTML: solo los textos fijos.
  enviarA('pasajero', 'seguridad_pregunta', { viajeId: v, preguntaId: 'sg_conextras0000001', motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false, titulo: XSS, texto: `<b>${XSS}</b>` });
  c = await esperarTarjeta(p);
  ok(c && !/img|<b>|onerror/i.test(c.html) && c.motivo === 'El taxi lleva un rato detenido.' && (await sinXss(p)), 'b9) campos de más con HTML se ignoran: solo los textos de la app');
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: 'sg_conextras0000001', estado: 'retirada' });
  await sinTarjeta(p);
  ok(errores.filter((x) => x.startsWith('[pasajero]')).length === 0, `b) sin errores en la página (${errores.filter((x) => x.startsWith('[pasajero]')).join(' | ')})`);
  await ctx.close();
}

// b10) A 1366 px (escritorio) y el modo revisor.
async function escritorioYRevisor() {
  const { ctx, p } = await contexto('pasajero-1366', { ancho: 1366, alto: 900 });
  await entrarPasajero(p);
  const v = await enViaje(p);
  preguntar(v, 'sin_senal', 'sin_ubicacion');
  const c = await esperarTarjeta(p);
  ok(c?.motivo === 'Perdimos la ubicación del taxi.', 'b10) a 1366 px la tarjeta se ve');
  const caja = await p.$eval('.a-modal-seguridad .a-modal', (n) => {
    const r = n.getBoundingClientRect();
    return { x: r.x, w: r.width, alto: r.height, vw: innerWidth, vh: innerHeight };
  });
  ok(caja.x >= 0 && caja.x + caja.w <= caja.vw && caja.alto < caja.vh, `b10) dentro de la pantalla (${JSON.stringify(caja)})`);
  await p.waitForTimeout(400);
  await foto(p, 'b10-todo-bien-1366');
  srv.pendiente = null;
  enviarA('pasajero', 'seguridad_cierre', { viajeId: v, preguntaId: srv.pendiente?.preguntaId || 'sg_prueba00000000', estado: 'retirada' });
  // Modo revisor: la bienvenida sin seguridadViaje y una pregunta que llegara igual no se muestra.
  srv.revision = true;
  await p.reload();
  await vista(p, 'en_viaje', 20000);
  await p.waitForTimeout(3000);
  ok((await lineaViaje(p)) === LINEA_HOY, 'b11) modo revisor: la línea de hoy');
  enviarA('pasajero', 'seguridad_pregunta', { viajeId: v, preguntaId: 'sg_revisor00000001', motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false });
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-seguridad')), 'b11) modo revisor: nunca la tarjeta (aunque llegara)');
  srv.revision = false;
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'finalizado', valor: 8400, km: 2.1 });
  srv.viajePasajero = null;
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) App 1.2: el push { tipo: 'seguridad' } con el bus caído           */
/* ------------------------------------------------------------------ */
async function pushSeguridad() {
  const { ctx, p } = await contexto('pasajero-push', { cfg: { tokenPush: TOKEN_PUSH } });
  await entrarPasajero(p);
  const v = await enViaje(p, {
    antes: async () => {
      if (await intento(p.waitForSelector('.a-modal-nativa .a-modal', { timeout: 2500 }))) await tocarModal(p, 'Sí, avisarme').catch(() => {});
    },
  });
  await p.$$eval('.a-modal-nativa', (ns) => ns.forEach((n) => n.remove()));
  // Sin señal: el bus no conecta. Mientras, la central pregunta (le llegaría por push).
  srv.bloquearBus = true;
  cortar('pasajero');
  await p.waitForTimeout(1500);
  const q = { viajeId: v, preguntaId: 'sg_porpush00000001', motivo: 'parada', subtipo: null, vence: Date.now() + 120000, estado: 'abierta' };
  srv.pendiente = q;
  await p.waitForTimeout(500);
  ok(!(await p.$('.a-modal-seguridad')), 'c) sin conexión, la tarjeta aún no está');
  srv.bloquearBus = false;
  const h0 = holas('pasajero');
  const t0 = Date.now();
  await p.evaluate((d) => window.__push.tocar(d), { tipo: 'seguridad', viajeId: v, preguntaId: q.preguntaId });
  const reconecto = await hasta(() => holas('pasajero') > h0, 4000);
  ok(Boolean(reconecto) && Date.now() - t0 < 4000, `c) tocar el push reconecta ya (${Date.now() - t0} ms)`);
  const c = await esperarTarjeta(p, 8000);
  ok(c?.titulo === '¿Todo bien en tu viaje?' && c.motivo === 'El taxi lleva un rato detenido.', 'c) con la bienvenida llega la pregunta y se muestra');
  ok(Boolean(await hasta(() => pide('POST', 'viajes/seguridad', t0).some((x) => x.cuerpo?.respuesta === 'vista'), 4000)), 'c) y le dice a la central que se vio');
  await foto(p, 'c-desde-el-push');
  await p.click('[data-seg-bien]');
  await sinTarjeta(p);
  srv.pendiente = null;
  srv.viajePasajero = null;
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* d) Conductor                                                        */
/* ------------------------------------------------------------------ */
async function conductor() {
  const { ctx, p } = await contexto('conductor', { gpsVel: true });
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(700);
  const hc = srv.hola.filter((x) => x.rol === 'conductor').at(-1);
  ok(hc && !('capacidades' in hc.datos), 'd) el hola del conductor no trae capacidades');
  await p.click('[data-conectar]');
  await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }));
  const pres = await hasta(() => srv.mensajes.filter((m) => m.rol === 'conductor' && m.tipo === 'presencia' && m.datos?.pos).at(-1), 8000);
  const pp = pres?.datos?.pos || {};
  ok(Number.isInteger(pp.precision) && Number.isFinite(pp.ts) && Math.abs(pp.ts - Date.now()) < 60000 && pp.velocidad === 8.5 && pp.altitud === 2563 && Number.isFinite(pp.lat), `d) presencia: pos con precision, ts, velocidad y altitud (${JSON.stringify(pp)})`);
  await hasta(() => [...srv.sockets].some((cx) => cx.rol === 'conductor' && cx.disponible), 6000);
  pedidoCentral('pc-b1');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  await p.press('.a-solicitud .a-deslizador-mango', 'Enter');
  await vista(p, 'hacia_origen', 15000);
  await p.waitForTimeout(800);
  await p.click('[data-llegue]');
  await vista(p, 'en_origen', 10000);
  await p.waitForSelector('[data-iniciar-central]:not([disabled])', { timeout: 8000 });
  await p.click('[data-iniciar-central]');
  await vista(p, 'en_viaje', 10000);
  const m0 = Date.now();
  await ctx.setGeolocation({ latitude: CENTRO.lat + 0.002, longitude: CENTRO.lng + 0.001, accuracy: 9 });
  await p.waitForTimeout(2500);
  await ctx.setGeolocation({ latitude: CENTRO.lat + 0.003, longitude: CENTRO.lng + 0.0015, accuracy: 9 });
  const ub = await hasta(() => srv.mensajes.filter((m) => m.rol === 'conductor' && m.tipo === 'ubicacion' && m.t >= m0).at(-1), 8000);
  const up = ub?.datos?.pos || {};
  ok(up.precision === 9 && Number.isFinite(up.ts) && up.velocidad === 8.5 && Math.round(up.rumbo) === 92 && up.altitud === 2563, `d) ubicación del viaje: pos con precision, ts, velocidad, rumbo y altitud (${JSON.stringify(up)})`);
  ok(Math.abs(up.lat - (CENTRO.lat + 0.003)) < 1e-6 || Math.abs(up.lat - (CENTRO.lat + 0.002)) < 1e-6, 'd) con la posición de esa misma lectura');
  // Lo que nunca debería llegarle: no muestra nada.
  const antes = await texto(p, 'body');
  const modales = (await p.$$('.a-modal-capa')).length;
  enviarA('conductor', 'seguridad_pregunta', { viajeId: 'pc-b1', preguntaId: 'sg_alconductor0001', motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false });
  enviarA('conductor', 'seguridad_cierre', { viajeId: 'pc-b1', preguntaId: 'sg_alconductor0001', estado: 'avisada' });
  await p.waitForTimeout(1500);
  const despues = await texto(p, 'body');
  ok(!(await p.$('.a-modal-seguridad')) && (await p.$$('.a-modal-capa')).length === modales, 'd) un seguridad_pregunta / seguridad_cierre que le llegara al conductor no muestra nada');
  ok(!/todo bien|Le avisamos a la central|Cuidamos tu viaje|revis/i.test(despues) && !/todo bien/i.test(antes), 'd) ningún texto de la revisión en la app del conductor');
  ok(pide('POST', 'viajes/seguridad').filter((x) => x.correo === LUIS).length === 0, 'd) el conductor nunca llama a /api/viajes/seguridad');
  await foto(p, 'd-conductor-en-viaje');
  ok(errores.filter((x) => x.startsWith('[conductor]')).length === 0, `d) sin errores en la página (${errores.filter((x) => x.startsWith('[conductor]')).join(' | ')})`);
  await ctx.close();
}

// e) La demo (sin ?real): sin hola, sin /api/viajes/seguridad, la línea de hoy.
async function demo() {
  const { ctx, p } = await contexto('demo');
  const t0 = Date.now();
  await p.goto(`${BASE}taxicun/`);
  await p.waitForTimeout(3000);
  ok(pide('POST', 'viajes/seguridad', t0).length === 0 && !(await p.$('.a-modal-seguridad')), 'e) la demo: ni la ruta nueva ni la tarjeta');
  await ctx.close();
}

const pasos = [servidorAnterior, pasajeroSeguridad, escritorioYRevisor, pushSeguridad, conductor, demo];
for (const paso of pasos) {
  try {
    await paso();
  } catch (e) {
    ok(false, `${paso.name}: ${e.message.split('\n')[0]}`);
  }
}
await b.close();
const errs = errores.filter((x) => !/demo/.test(x));
ok(errs.length === 0, `sin errores de página (${errs.slice(0, 5).join(' | ')})`);
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
