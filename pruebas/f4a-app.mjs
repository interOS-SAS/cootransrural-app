// Ronda 4A «Operación de la central» en las apps (modo real), con el servidor de TaxiCun simulado aquí mismo
// (page.route y routeWebSocket, como fase3-app.mjs) y, para la app de las tiendas, Capacitor simulado. Contrato: cabecera
// de nucleo/central.js (servidor 0.9.0).
//
//  a) Pasajero (?real=1), «Avisar a la central» en el SOS: sin bienvenida.avisarCentral no aparece; con ella aparece entre
//     «Llamar a la Línea 123» y «Llamar a la central», un toque lo manda (rol, empresa, viaje, posición y clave) y dice
//     «Le avisamos a la central de Cootransrural. Si estás en peligro, llama al 123.»; sin señal reintenta con la MISMA
//     clave y lo dice; 429 → «Ya le avisaste a la central hace un momento.»; 403 sos_no_disponible y una central anterior
//     (404) → «no recibe» y el botón desaparece; sin señal en el plazo → «No pudimos…» (plazo corto, en la página).
//  b) Conductor (?real=1), «Pedido de la central»: la hoja amarilla con el chip y el nombre (sin estrellas ni «pasajero
//     verificado»), «Llamar a {nombre}» con el celular de la asignación (sin WhatsApp), «Confirma que es {nombre}» e
//     «Iniciar viaje» sin código, cobrar y cerrar SIN calificar; retomado de viaje_actual (sin lo guardado) sigue siendo
//     de la central. El botón de ayuda (barra y hoja del servicio): 123, «Avisar a la central» (solo con la bandera) y
//     «Llamar a Cootransrural»; el aviso sale con rol conductor y sin empresa.
//  c) Avisos de la cooperativa: tarjeta por el bus (texto con HTML pintado como texto), «Entendido» → POST
//     /api/avisos/leidos; no tapa una oferta; uno «para pasajeros» no le llega al conductor; los sin leer de GET
//     /api/avisos al abrir; «De tu cooperativa» en «Avisos» (y quedan leídos); la insignia de la campana; el pasajero:
//     tarjeta y el interruptor «Avisos de Cootransrural» en Ajustes (PUT /api/yo/avisos, y si falla vuelve atrás).
//  d) App del conductor 1.2 (Capacitor simulado): tocar el push { tipo: 'aviso', id } abre su tarjeta.
//  e) Modo revisor: el botón aparece (la central lo marca de prueba y no le llega a nadie) y la posición es la del
//     paradero, no la del GPS de Cupertino. Central anterior (404 en /api/avisos): nada se rompe. La demo: ni el botón
//     de ayuda ni GET /api/avisos.
//
// Uso: node pruebas/f4a-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=4922 --api=http://127.0.0.1:4929). Capturas en $CAPTURAS. Unos 3 minutos.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:4922/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/f4a/pruebas/app/capturas-f4a').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const PARADERO = FICHA.PARADERO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const TEL_CENTRAL = String(FICHA.EMPRESA.telefono).replace(/\D/g, '');
const CUPERTINO = { latitude: 37.3349, longitude: -122.009, accuracy: 20 };
const CODIGO = '123456';
const TOKEN_PUSH = 'f4a0'.repeat(16);
const LUIS = 'luis@prueba.taxicun.com';
const ANA = 'ana@prueba.taxicun.com';
// Lo que manda la central con HTML a propósito: las apps lo pintan como texto (el servidor ni siquiera lo deja guardar).
const LLAMANTE = 'Juan <i>Pérez</i>';
const CEL_LLAMANTE = '3157778899';
const NOTA_CENTRAL = 'Casa <b>azul</b>, portón negro';
const TITULO_HTML = 'Cambio <b>de</b> turno';
const TEXTO_HTML = 'Desde el lunes <img src=x onerror="window.__xss=7"> la central atiende de 5 a 23.\nGracias.';

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
/* Servidor de TaxiCun simulado                                        */
/* ------------------------------------------------------------------ */
const CONDUCTOR = { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' };
const USUARIOS = {
  [LUIS]: { nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: CONDUCTOR },
  [ANA]: { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
};
const srv = {
  n: 0,
  sesiones: new Map(),
  peticiones: [],
  hola: [],
  mensajes: [],
  ofertas: new Map(),
  viajes: new Map(), // correo del conductor → servicio asignado (viaje_actual)
  sockets: new Set(),
  // Ronda 4A
  avisarCentral: { pasajero: false, conductor: false },
  revision: false,
  sos: { modo: 'ok', abortar: 0, alertas: new Map() }, // modo: ok | 429 | 403 | 404 | 500
  avisos: { pasajero: [], conductor: [] },
  avisos404: false,
  leidos: [],
  bajas: [],
  bajasFalla: false,
};
const yoDe = (correo) => {
  const u = USUARIOS[correo];
  return { usuario: { id: `u-${correo}`, correo, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor };
};
const pide = (metodo, ruta) => srv.peticiones.filter((x) => x.metodo === metodo && x.ruta === ruta);

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
  srv.peticiones.push({ metodo, ruta, cuerpo, correo, consulta: url.search, t: Date.now() });
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
  if (!correo && ruta !== 'empresas/indice') return responder(401, { error: 'sin_sesion' });
  if (metodo === 'GET' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PATCH' && ruta === 'yo') return responder(200, yoDe(correo));
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  // Ronda 4A: SOS (POST /api/sos), avisos y bajas.
  if (metodo === 'POST' && ruta === 'sos') {
    if (srv.sos.abortar > 0) {
      srv.sos.abortar -= 1;
      return route.abort('internetdisconnected');
    }
    if (srv.sos.modo === '404') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Route POST:/api/sos not found', error: 'Not Found', statusCode: 404 }) });
    if (srv.sos.modo === '429') return responder(429, { error: 'demasiados_sos', retryS: 18 });
    if (srv.sos.modo === '403') return responder(403, { error: 'sos_no_disponible' });
    if (srv.sos.modo === '500') return responder(500, { error: 'error_interno' });
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(cuerpo?.clave || '')) || !['pasajero', 'conductor'].includes(cuerpo?.rol)) return responder(400, { error: 'datos_invalidos' });
    const llave = `${correo}:${cuerpo.clave}`;
    let a = srv.sos.alertas.get(llave);
    if (!a) {
      a = { id: srv.sos.alertas.size + 1, veces: 1 };
      srv.sos.alertas.set(llave, a);
    }
    return responder(200, { ok: true, id: a.id, veces: a.veces, ...(srv.revision ? { prueba: true } : {}) });
  }
  if (metodo === 'GET' && ruta === 'avisos') {
    if (srv.avisos404) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Route GET:/api/avisos not found', error: 'Not Found', statusCode: 404 }) });
    const rol = url.searchParams.get('rol') === 'conductor' ? 'conductor' : 'pasajero';
    return responder(200, { avisos: srv.avisos[rol] });
  }
  if (metodo === 'POST' && ruta === 'avisos/leidos') {
    if (srv.avisos404) return responder(404, { error: 'no_existe' });
    const ids = Array.isArray(cuerpo?.ids) ? cuerpo.ids : [];
    srv.leidos.push(...ids);
    for (const rol of ['pasajero', 'conductor']) for (const a of srv.avisos[rol]) if (ids.includes(a.id)) a.leido = true;
    return responder(200, { ok: true });
  }
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: srv.bajas });
  if (metodo === 'PUT' && ruta === 'yo/avisos') {
    if (srv.bajasFalla) return responder(500, { error: 'error_interno' });
    const e = String(cuerpo?.empresa || '');
    srv.bajas = cuerpo?.recibir ? srv.bajas.filter((x) => x !== e) : [...new Set([...srv.bajas, e])];
    return responder(200, { ok: true });
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
      srv.hola.push({ rol: cx.rol, correo, t: Date.now() });
      const extra = { ...(srv.avisarCentral[cx.rol] ? { avisarCentral: true } : {}), ...(srv.revision ? { revision: true } : {}) };
      if (cx.rol === 'conductor') {
        enviar(cx, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 4.9, viajes: 120 }, ...extra });
        enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
        return;
      }
      enviar(cx, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana', ...extra });
      enviar(cx, 'viaje_actual', srv.viajePasajero || null);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol !== 'conductor') return;
    if (m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
    if (m.tipo === 'aceptacion') {
      const s = srv.ofertas.get(m.datos?.viajeId);
      if (!s) return enviar(cx, 'error', { codigo: 'servicio_no_disponible' });
      srv.ofertas.delete(s.viajeId);
      const pc = s.pedidoCentral === true;
      const celular = pc ? CEL_LLAMANTE : '3001234567';
      srv.viajes.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: s.nota, codigoHash: '', ...(pc ? { pedidoCentral: true } : {}) });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular }, codigoHash: '', ...(pc ? { pedidoCentral: true } : {}) });
    }
    if (m.tipo === 'estado') {
      const v = srv.viajes.get(cx.correo);
      if (v && v.viajeId === m.datos?.viajeId) {
        if (m.datos.fase === 'en_viaje') v.estado = 'en_viaje';
        if (m.datos.fase === 'llego') v.estado = 'llego';
        if (m.datos.fase === 'finalizado') srv.viajes.delete(cx.correo);
      }
    }
    if (m.tipo === 'cancelacion') srv.viajes.delete(cx.correo);
  });
}

const oferta = (viajeId, extra = {}) => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre: 'Marta', calificacion: 4.9 },
  // A ~33 m del GPS de la prueba: «Llegué» vale ahí (150 m).
  origen: { lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
  ...extra,
});
function ofrecer(viajeId, extra = {}) {
  const s = oferta(viajeId, extra);
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
}
const pedidoCentral = (viajeId, extra = {}) => ofrecer(viajeId, {
  pedidoCentral: true,
  pasajero: { id: `p_central_${viajeId}`, nombre: LLAMANTE, calificacion: null },
  nota: NOTA_CENTRAL,
  ...extra,
});
const aviso = (id, extra = {}) => ({ id, titulo: TITULO_HTML, texto: TEXTO_HTML, de: 'Cootransrural', en: Date.now(), para: 'conductores', ...extra });

/* ------------------------------------------------------------------ */
/* Capacitor simulado (push; como fase3-app.mjs)                       */
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
      const r = (L('__permisoPush') || 'prompt') === 'prompt' ? 'granted' : L('__permisoPush');
      L('__permisoPush', r);
      return { receive: r };
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
    tocar: (data) => (oyentes.pushNotificationActionPerformed || []).forEach((f) => f({ actionId: 'tap', notification: { id: 'n1', title: 'Aviso de Cootransrural', body: '…', data } })),
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => cfg.plataforma || 'ios',
    isPluginAvailable: (n) => n in plugins,
    Plugins: plugins,
  };
}

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { cfg = null, geo = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 } } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: geo, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  if (cfg) await ctx.addInitScript(capacitorFalso, cfg);
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
const msjDesde = (i, rol, tipo) => srv.mensajes.slice(i).filter((m) => m.rol === rol && m.tipo === tipo);
const holas = (rol) => srv.hola.filter((h) => h.rol === rol).length;
const historial = (p, rol) => p.evaluate((r) => JSON.parse(localStorage.getItem(`tc.real.cootransrural.historial.${r}`) || '[]'), rol);
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].some((t) => new RegExp(f).test(t.textContent.replace(/\s+/g, ' '))), re.source, { timeout }));
const accionesModal = (p, clase) => p.$$eval(`.${clase} .a-modal-acciones > *`, (ns) => ns.map((n) => `${n.tagName}:${n.innerText.trim()}:${n.getAttribute('href') || ''}`));
const sinXss = (p) => p.evaluate(() => window.__xss === undefined);

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
async function entrarConductor(p, url) {
  await p.goto(url);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(700);
}
async function conectar(p) {
  await p.click('[data-conectar]');
  return intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }));
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
// El pasajero en un viaje con conductor (la vista «asignado» tiene el botón SOS).
async function conConductor(p) {
  const t0 = Date.now();
  const v = await pedir(p);
  const s = solicitudes(t0)[0]?.datos || {};
  const conductor = { id: 'c_luis', movil: '023', placa: 'WFK123', nombre: 'Luis Alberto Rodríguez', vehiculo: 'Renault Logan', color: 'Amarillo', calificacion: 4.9, viajes: 120, tel: '3109876543' };
  const pos = { lat: CENTRO.lat + 0.004, lng: CENTRO.lng };
  // Para viaje_actual si se reconecta (la central lo sigue teniendo asignado).
  srv.viajePasajero = { viajeId: v, estado: 'asignado', origen: s.origen, destino: s.destino, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: s.metodoPago, nota: s.nota || '', codigoHash: s.codigoHash || '', conductorId: 'c_luis', conductor, pos };
  enviarA('pasajero', 'aceptacion', { viajeId: v, conductor, pos, etaMin: 4 });
  await vista(p, 'asignado', 10000);
  return v;
}
async function abrirSos(p) {
  await p.waitForSelector('[data-sos]', { timeout: 10000 });
  await p.click('[data-sos] >> nth=0');
  await p.waitForSelector('.a-modal-sos.a-abierto .a-modal h2', { timeout: 8000 });
  await p.waitForTimeout(400);
}
const modalSosCentral = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => new RegExp(f).test((document.querySelector('.a-modal-sos-central .a-modal')?.textContent || '').replace(/\s+/g, ' ')), re.source, { timeout }));
async function cerrarSosCentral(p) {
  await tocarModal(p, 'Cerrar', 'a-modal-sos-central');
  await hasta(async () => !(await p.$('.a-modal-sos-central')), 3000);
}
const posts = (rol, desde = 0) => pide('POST', 'sos').filter((x) => x.t >= desde && x.cuerpo?.rol === rol);

/* ------------------------------------------------------------------ */
/* a) Pasajero: «Avisar a la central»                                  */
/* ------------------------------------------------------------------ */
async function pasajeroSos() {
  const { ctx, p } = await contexto('pasajero-sos');
  await entrarPasajero(p);
  await p.waitForTimeout(1200);
  const v1 = await conConductor(p);
  ok(Boolean(v1), 'a) el pasajero está en un viaje con conductor (asignado)');

  // a1) Sin la bandera de la central: el SOS de siempre.
  await abrirSos(p);
  let acc = await accionesModal(p, 'a-modal-sos');
  ok(!acc.some((x) => /Avisar a la central/.test(x)), `a1) sin bienvenida.avisarCentral no aparece «Avisar a la central» (${acc.join(' | ')})`);
  await tocarModal(p, 'Cancelar', 'a-modal-sos');

  // a2) Con la bandera (llega con la bienvenida al reconectarse).
  srv.avisarCentral.pasajero = true;
  const h0 = holas('pasajero');
  cortar('pasajero');
  ok(Boolean(await hasta(() => holas('pasajero') > h0, 10000)), 'a2) se reconecta y la bienvenida trae avisarCentral: true');
  await p.waitForTimeout(1500);
  await abrirSos(p);
  acc = await accionesModal(p, 'a-modal-sos');
  ok(acc[0] === 'A:Llamar a la Línea 123:tel:123' && acc[1] === 'BUTTON:Avisar a la central de Cootransrural:' && acc.some((x) => x === `A:Llamar a la central Cootransrural:tel:${TEL_CENTRAL}`) && acc.indexOf(`A:Llamar a la central Cootransrural:tel:${TEL_CENTRAL}`) > 1, `a2) «Avisar a la central de Cootransrural» entre la 123 y la central (${acc.join(' | ')})`);
  await foto(p, 'a2-sos-con-avisar-a-la-central');
  let t0 = Date.now();
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(p, /Le avisamos a la central de Cootransrural.*Si estás en peligro, llama al 123\./), `a2) un toque lo manda: «Le avisamos a la central de Cootransrural. Si estás en peligro, llama al 123.» (${await texto(p, '.a-modal-sos-central .a-modal')})`);
  const env = posts('pasajero', t0);
  const c2 = env[0]?.cuerpo || {};
  ok(env.length === 1, `a2) un solo POST /api/sos (${env.length})`);
  ok(c2.empresa === 'cootransrural' && c2.viajeId === v1 && /^[A-Za-z0-9_-]{8,40}$/.test(c2.clave || ''), `a2) con la cooperativa, el viaje en curso y la clave (${JSON.stringify({ empresa: c2.empresa, viajeId: c2.viajeId, clave: c2.clave })})`);
  ok(Math.abs((c2.pos?.lat ?? 0) - CENTRO.lat) < 0.001 && Math.abs((c2.pos?.lng ?? 0) - CENTRO.lng) < 0.001 && Number.isInteger(c2.pos?.precision), `a2) y la posición del momento (${JSON.stringify(c2.pos)})`);
  const acc2 = await accionesModal(p, 'a-modal-sos-central');
  ok(acc2[0] === 'A:Llamar a la Línea 123:tel:123', `a2) con el botón de la 123 (${acc2.join(' | ')})`);
  ok(Boolean(await p.$('.a-modal-sos-central .a-modal.a-sos-listo .a-sos-ico svg path[d^="m5 12.5"]')), 'a2) el ícono pasa a un visto bueno («listo»)');
  await foto(p, 'a2-sos-enviado');
  await cerrarSosCentral(p);

  // a3) Sin señal: reintenta con la MISMA clave y lo dice.
  srv.sos.abortar = 2;
  t0 = Date.now();
  await abrirSos(p);
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(p, /Sin señal: seguimos intentando.*2 minutos/, 8000), 'a3) sin señal: «Sin señal: seguimos intentando … 2 minutos»');
  await foto(p, 'a3-sos-sin-senal');
  ok(await modalSosCentral(p, /Le avisamos a la central de Cootransrural/, 20000), 'a3) vuelve la señal → «Le avisamos…»');
  const intentos = pide('POST', 'sos').filter((x) => x.t >= t0);
  const claves = new Set(intentos.map((x) => x.cuerpo?.clave));
  ok(intentos.length === 3 && claves.size === 1, `a3) 3 intentos con la misma clave (${intentos.length}, ${claves.size} clave)`);
  ok(srv.sos.alertas.size === 2, `a3) la central tiene una sola alerta por toque (${srv.sos.alertas.size} en total)`);
  await cerrarSosCentral(p);

  // a4) 429: «Ya le avisaste a la central hace un momento.»
  srv.sos.modo = '429';
  await abrirSos(p);
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(p, /Ya le avisaste a la central hace un momento\./), 'a4) 429 demasiados_sos → «Ya le avisaste a la central hace un momento.»');
  await foto(p, 'a4-sos-429');
  await cerrarSosCentral(p);

  // a5) Cerrar el diálogo mientras reintenta: el resultado sale como aviso en pantalla.
  srv.sos.modo = 'ok';
  srv.sos.abortar = 1;
  await abrirSos(p);
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  await modalSosCentral(p, /Sin señal/, 8000);
  await cerrarSosCentral(p);
  ok(await conAviso(p, /Le avisamos a la central de Cootransrural/, 15000), 'a5) cerrado mientras reintenta: al llegar, «Le avisamos…» como aviso en pantalla');

  // a6) La cooperativa ya no lo recibe (403): lo dice y el botón desaparece.
  srv.sos.modo = '403';
  await abrirSos(p);
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(p, /no recibe avisos por la app\. Si estás en peligro, llama al 123\./), 'a6) 403 sos_no_disponible → «… no recibe avisos por la app. Si estás en peligro, llama al 123.»');
  await cerrarSosCentral(p);
  await abrirSos(p);
  acc = await accionesModal(p, 'a-modal-sos');
  ok(!acc.some((x) => /Avisar a la central/.test(x)), 'a6) y ya no se ofrece (hasta la próxima bienvenida)');
  await tocarModal(p, 'Cancelar', 'a-modal-sos');

  // a7) Sin señal en todo el plazo: «No pudimos…» (el núcleo con un plazo corto, en la página).
  srv.sos.modo = 'ok';
  srv.sos.abortar = 100;
  const r7 = await p.evaluate(async () => {
    const S = await import('/nucleo/sos.js');
    const estados = [];
    const e = S.enviarSos({ rol: 'pasajero', empresa: 'cootransrural', pos: { lat: 4.85, lng: -74.26, precision: 8.6 }, plazoMs: 2500, esperas: [400] });
    e.on('estado', (x) => estados.push(x.estado));
    const r = await e.listo;
    return { r, estados };
  }).catch((e) => ({ error: e.message }));
  ok(r7?.r?.estado === 'fallo' && r7.estados.includes('reintentando') && r7.r.intentos >= 3, `a7) sin señal en el plazo → 'fallo' tras ${r7?.r?.intentos} intentos (${JSON.stringify(r7?.estados || r7)})`);
  srv.sos.abortar = 0;
  await ctx.close();

  // a8) Una central anterior (sin /api/sos): «no recibe» y sin errores; el botón desaparece.
  srv.viajePasajero = null;
  const c8 = await contexto('pasajero-sos-404');
  srv.sos.modo = '404';
  await entrarPasajero(c8.p);
  await c8.p.waitForTimeout(1200);
  await conConductor(c8.p);
  await abrirSos(c8.p);
  await tocarModal(c8.p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(c8.p, /no recibe avisos por la app/), 'a8) central anterior (404) → «no recibe avisos por la app»');
  srv.sos.modo = 'ok';
  srv.avisarCentral.pasajero = false;
  await c8.ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) Conductor: «Pedido de la central» y «¿Necesitas ayuda?»          */
/* ------------------------------------------------------------------ */
async function conductorWeb() {
  const { ctx, p } = await contexto('conductor-web');
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  ok(!(await p.$('[data-ayuda-barra][hidden]')) && Boolean(await p.$('[data-ayuda-barra]')), 'b) el botón de ayuda está en la barra');
  ok(await conectar(p), 'b) «Conectarme» → en turno');
  await hasta(() => [...srv.sockets].some((cx) => cx.rol === 'conductor' && cx.disponible), 6000);

  // b1) La hoja amarilla del pedido de la central.
  pedidoCentral('pc-1');
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta [data-pedido-central]', { timeout: 10000 }))), 'b1) llega el pedido de la central (pedidoCentral: true)');
  ok((await textoCrudo(p, '.a-solicitud [data-pedido-central]')).trim() === 'Pedido de la central', 'b1) con el chip «Pedido de la central»');
  ok((await textoCrudo(p, '#a-sol-titulo')) === LLAMANTE && !(await p.$('#a-sol-titulo i')), `b1) el nombre de quien llamó como TEXTO («${await textoCrudo(p, '#a-sol-titulo')}»)`);
  const quien = await texto(p, '.a-solicitud .a-sol-quien');
  ok(!/pasajero verificado/.test(quien) && !/★|5,0/.test(quien) && /Lo pidió por teléfono a la central/.test(quien), `b1) sin estrellas ni «pasajero verificado» («${quien}»)`);
  ok((await textoCrudo(p, '.a-solicitud [data-sol-nota]')) === `«${NOTA_CENTRAL}»` && !(await p.$('.a-solicitud .a-sol-nota b')), 'b1) la nota de la central como texto');
  await p.waitForTimeout(500);
  await foto(p, 'b1-pedido-de-la-central');

  // b2) Acepta: «Llamar a {nombre}» con el celular de la asignación, sin WhatsApp ni estrellas.
  await p.click('.a-solicitud [data-aceptar]');
  ok(Boolean(await intento(vista(p, 'hacia_origen', 15000))), 'b2) acepta → la central lo asigna');
  const llamar = await p.$('[data-llamar-llamante]');
  ok(Boolean(llamar) && (await llamar.getAttribute('href')) === `tel:${CEL_LLAMANTE}`, `b2) «Llamar» va al celular de quien llamó (${await llamar?.getAttribute('href')})`);
  ok((await textoCrudo(p, '[data-llamante-llamar]')) === `Llamar a ${LLAMANTE}`, `b2) dice «Llamar a ${LLAMANTE}» (como texto)`);
  ok(!(await p.$('.a-hoja a[href*="wa.me"], .a-hoja a[href*="whatsapp"]')), 'b2) sin WhatsApp');
  ok((await textoCrudo(p, '.a-hoja [data-llamante-nombre]')) === LLAMANTE && /Pedido de la central/.test(await texto(p, '.a-hoja .a-pasajero-central')), 'b2) la tarjeta: el nombre (como texto) y «Pedido de la central»');
  ok(!/★/.test(await texto(p, '.a-hoja .a-pasajero-central')) && !(await p.$('.a-hoja .a-pasajero-central [class*="estrella"]')), 'b2) sin estrellas');
  ok(Boolean(await p.$('.a-hoja [data-ayuda-hoja]')), 'b2) y el botón «¿Necesitas ayuda?» en la hoja del servicio');
  await hasta(async () => !(await p.$('.a-solicitud')), 3000);
  await p.waitForTimeout(400);
  await foto(p, 'b2-pedido-de-la-central-asignado');

  // b2b) Un aviso de la cooperativa con el servicio en curso: la tarjeta espera a que termine (no se lee manejando).
  enviarA('conductor', 'aviso', aviso('av-en-servicio', { titulo: 'Aviso durante el servicio', texto: 'Se lee al terminar.' }));
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-aviso-central')) && !(await p.$('[data-insignia][hidden]')), 'b2b) con un servicio en curso la tarjeta espera (la campana sí lo cuenta)');

  // b3) «Llegué» → «Confirma que es {nombre}» e «Iniciar viaje» sin código.
  await p.click('[data-llegue]');
  ok(Boolean(await intento(vista(p, 'en_origen', 10000))), 'b3) «Llegué» → en el punto');
  ok(await conAviso(p, /Llegaste al punto.*Si no ves a Juan <i>Pérez<\/i>, llámalo\./, 5000) && !(await conAviso(p, /Le avisamos al pasajero/, 500)), 'b3) dice «Llegaste al punto · Si no ves a …, llámalo.» (no «Le avisamos al pasajero»: no tiene la app)');
  ok((await textoCrudo(p, '[data-llamante-confirmar]')) === `Confirma que es ${LLAMANTE}`, `b3) «Confirma que es ${LLAMANTE}»`);
  ok(/no tiene código de abordaje/.test(await texto(p, '[data-confirmar-llamante]')) && !(await p.$('.a-hoja .a-casillas')) && !(await p.$('[data-sin-codigo]')), 'b3) sin casillas de código ni «Iniciar sin código»');
  ok(Boolean(await p.$('[data-iniciar-central]:not([disabled])')), 'b3) «Iniciar viaje» habilitado');
  ok(Boolean(await hasta(async () => !(await p.$('.a-solicitud')), 3000)), 'b3) la hoja amarilla ya se fue');
  await p.waitForTimeout(600);
  await foto(p, 'b3-confirma-que-es');
  let m0 = srv.mensajes.length;
  await p.click('[data-iniciar-central]');
  ok(Boolean(await intento(vista(p, 'en_viaje', 10000))), 'b3) «Iniciar viaje» → en viaje');
  ok(msjDesde(m0, 'conductor', 'estado').some((m) => m.datos?.fase === 'en_viaje'), 'b3) y se lo dice a la central (estado en_viaje)');

  // b4) Sin lo guardado en el celular: viaje_actual con pedidoCentral lo retoma igual.
  await p.evaluate(() => localStorage.removeItem('tc.real.viaje.conductor'));
  await p.reload();
  ok(Boolean(await intento(vista(p, 'en_viaje', 20000))), 'b4) recargada sin lo guardado: viaje_actual lo retoma en viaje');
  ok(/Pedido de la central/.test(await texto(p, '.a-hoja .a-pasajero-central')) && (await textoCrudo(p, '.a-hoja [data-llamante-nombre]')) === LLAMANTE, 'b4) y sigue siendo «Pedido de la central»');

  // b5) Terminar y cobrar: se cierra sin calificar.
  m0 = srv.mensajes.length;
  await p.click('[data-terminar]');
  await tocarModal(p, 'Terminar y cobrar');
  ok(Boolean(await intento(vista(p, 'cobrando', 10000))), 'b5) termina → cobrando');
  await p.click('[data-efectivo]');
  await tocarModal(p, 'Sí, recibí el pago');
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'b5) «Recibí efectivo» → libre, sin la pantalla de calificar');
  await p.waitForTimeout(800);
  ok(!(await p.$('.a-app[data-vista="calificar"]')) && msjDesde(m0, 'conductor', 'calificacion').length === 0, 'b5) y no califica a quien llamó');
  ok(msjDesde(m0, 'conductor', 'pago_confirmado').length === 1 && msjDesde(m0, 'conductor', 'estado').some((m) => m.datos?.fase === 'finalizado'), 'b5) el final y el pago sí salen');
  const h5 = (await historial(p, 'conductor')).find((v) => v.id === 'pc-1');
  ok(h5?.estado === 'finalizado' && h5.pedidoCentral === true, `b5) en su historial como finalizado y de la central (${JSON.stringify({ estado: h5?.estado, pedidoCentral: h5?.pedidoCentral })})`);
  ok(await sinXss(p), 'b) nada del HTML de la central corrió');
  ok(Boolean(await intento(p.waitForFunction(() => document.querySelector('.a-modal-aviso-central.a-abierto .a-aviso-central-titulo')?.textContent === 'Aviso durante el servicio', null, { timeout: 8000 }))), 'b2b) terminado el servicio, sale la tarjeta que esperaba');
  await tocarModal(p, 'Entendido', 'a-modal-aviso-central');

  // b6) «¿Necesitas ayuda?» sin la bandera: 123 y la central por teléfono.
  await p.click('[data-ayuda-barra]');
  await p.waitForSelector('.a-modal-ayuda-c.a-abierto .a-modal h2', { timeout: 8000 });
  let acc = await accionesModal(p, 'a-modal-ayuda-c');
  ok(acc.join(' | ') === `A:Llamar a la Línea 123:tel:123 | A:Llamar a Cootransrural:tel:${TEL_CENTRAL} | BUTTON:Cancelar:`, `b6) sin la bandera: ${acc.join(' | ')}`);
  await tocarModal(p, 'Cancelar', 'a-modal-ayuda-c');

  // b7) Con la bandera: «Avisar a la central» manda rol conductor, sin empresa, con su posición.
  srv.avisarCentral.conductor = true;
  const h0 = holas('conductor');
  cortar('conductor');
  await hasta(() => holas('conductor') > h0, 10000);
  await p.waitForTimeout(1500);
  await p.click('[data-ayuda-barra]');
  await p.waitForSelector('.a-modal-ayuda-c.a-abierto .a-modal h2', { timeout: 8000 });
  acc = await accionesModal(p, 'a-modal-ayuda-c');
  ok(acc.join(' | ') === `A:Llamar a la Línea 123:tel:123 | BUTTON:Avisar a la central: | A:Llamar a Cootransrural:tel:${TEL_CENTRAL} | BUTTON:Cancelar:`, `b7) con la bandera: ${acc.join(' | ')}`);
  await p.waitForTimeout(450);
  await foto(p, 'b7-ayuda-conductor');
  const t0 = Date.now();
  await tocarModal(p, 'Avisar a la central', 'a-modal-ayuda-c');
  ok(await modalSosCentral(p, /Le avisamos a la central de Cootransrural/), 'b7) «Le avisamos a la central de Cootransrural»');
  const c7 = posts('conductor', t0)[0]?.cuerpo || {};
  ok(c7.rol === 'conductor' && !('empresa' in c7) && !('viajeId' in c7) && Math.abs((c7.pos?.lat ?? 0) - CENTRO.lat) < 0.001, `b7) rol conductor, sin empresa ni viaje (está libre) y con su posición (${JSON.stringify(c7)})`);
  await cerrarSosCentral(p);

  // b8) En un servicio: el botón de la hoja manda el viaje. (Retomado sin lo guardado, quedó fuera de turno.)
  if ((await p.getAttribute('[data-conectar]', 'aria-checked')) !== 'true') await conectar(p);
  await hasta(() => [...srv.sockets].some((cx) => cx.rol === 'conductor' && cx.disponible), 6000);
  ofrecer('v-8');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  await p.waitForTimeout(400);
  ok(!(await p.$('.a-solicitud [data-pedido-central]')) && /pasajero verificado/.test(await texto(p, '.a-solicitud .a-sol-quien')), 'b8) un pedido normal sigue como siempre (estrellas y «pasajero verificado»)');
  await p.click('.a-solicitud [data-aceptar]');
  await vista(p, 'hacia_origen', 15000);
  ok(Boolean(await p.$('.a-hoja a[href*="wa.me"]')) && !(await p.$('[data-llamar-llamante]')), 'b8) y con WhatsApp y «Llamar» de siempre');
  const t8 = Date.now();
  await p.click('.a-hoja [data-ayuda-hoja]');
  await tocarModal(p, 'Avisar a la central', 'a-modal-ayuda-c');
  ok(await modalSosCentral(p, /Le avisamos/), 'b8) desde la hoja del servicio también');
  ok(posts('conductor', t8)[0]?.cuerpo?.viajeId === 'v-8', `b8) con el servicio en curso (${posts('conductor', t8)[0]?.cuerpo?.viajeId})`);
  await cerrarSosCentral(p);
  m0 = srv.mensajes.length;
  enviarA('conductor', 'cancelacion', { viajeId: 'v-8', por: 'pasajero', motivo: 'Ya no lo necesito' });
  srv.viajes.clear();
  await vista(p, 'libre', 10000);
  srv.avisarCentral.conductor = false;
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) Avisos de la cooperativa                                          */
/* ------------------------------------------------------------------ */
async function avisosConductor() {
  srv.avisos.conductor = [
    aviso('av-viejo', { titulo: 'Reunión de asociados', texto: 'El sábado a las 8.', en: Date.now() - 86400000, leido: true }),
    aviso('av-sin-leer', { titulo: 'Vía cerrada <script>window.__xss=9</script>', texto: 'La vía a Tierra Grata está cerrada hasta las 6 p. m.', en: Date.now() - 3600000 }),
  ];
  const { ctx, p } = await contexto('avisos-conductor');
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  // c1) Al abrir: el que no se había leído sale como tarjeta (el leído no).
  ok(Boolean(await intento(p.waitForSelector('.a-modal-aviso-central.a-abierto .a-modal h2', { timeout: 10000 }))), 'c1) al abrir la app, el aviso sin leer (GET /api/avisos) sale como tarjeta');
  await p.waitForTimeout(400);
  ok((await textoCrudo(p, '.a-modal-aviso-central .a-modal h2')) === 'Aviso de Cootransrural', 'c1) «Aviso de Cootransrural»');
  ok((await textoCrudo(p, '.a-modal-aviso-central .a-aviso-central-titulo')) === 'Vía cerrada <script>window.__xss=9</script>' && !(await p.$('.a-modal-aviso-central script')), 'c1) el título como TEXTO (el <script> no es un nodo)');
  ok(pide('GET', 'avisos').some((x) => x.consulta === '?rol=conductor'), 'c1) pidió GET /api/avisos?rol=conductor');
  ok((await texto(p, '[data-insignia]')) !== '' && !(await p.$('[data-insignia][hidden]')), `c1) la campana cuenta el aviso sin leer (${await texto(p, '[data-insignia]')})`);
  await foto(p, 'c1-tarjeta-al-abrir');
  await tocarModal(p, 'Entendido', 'a-modal-aviso-central');
  ok(Boolean(await hasta(() => srv.leidos.includes('av-sin-leer'), 5000)), 'c1) «Entendido» → POST /api/avisos/leidos con su id');
  ok(!srv.leidos.includes('av-viejo') && !(await p.$('.a-modal-aviso-central')), 'c1) el ya leído no salió');

  // c2) Por el bus, con la app abierta: tarjeta con el texto como texto (con su salto de línea).
  ok(await conectar(p), 'c2) en turno');
  enviarA('conductor', 'aviso', aviso('av-bus'));
  ok(Boolean(await intento(p.waitForSelector('.a-modal-aviso-central.a-abierto', { timeout: 8000 }))), 'c2) el mensaje «aviso» del bus → la tarjeta');
  await p.waitForTimeout(400);
  ok((await textoCrudo(p, '.a-modal-aviso-central .a-aviso-central-titulo')) === TITULO_HTML && (await textoCrudo(p, '.a-modal-aviso-central .a-aviso-central-texto')) === TEXTO_HTML, 'c2) título y texto exactos, como TEXTO');
  ok(!(await p.$('.a-modal-aviso-central img, .a-modal-aviso-central b')) && (await sinXss(p)), 'c2) ni el <img> ni el <b> se pintan ni corren');
  ok((await p.$eval('.a-aviso-central-texto', (n) => getComputedStyle(n).whiteSpace)) === 'pre-line', 'c2) los saltos de línea se respetan (pre-line)');
  await foto(p, 'c2-tarjeta-aviso');
  await tocarModal(p, 'Entendido', 'a-modal-aviso-central');
  await hasta(() => srv.leidos.includes('av-bus'), 5000);

  // c3) Uno para los pasajeros no le llega al conductor; y no tapa una oferta.
  enviarA('conductor', 'aviso', aviso('av-pasajeros', { para: 'pasajeros' }));
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-aviso-central')), 'c3) un aviso «para: pasajeros» no le sale al conductor');
  ofrecer('v-c3');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  enviarA('conductor', 'aviso', aviso('av-con-oferta', { titulo: 'Turnos de diciembre', texto: 'Ya está la lista.' }));
  await p.waitForTimeout(2000);
  ok(!(await p.$('.a-modal-aviso-central')) && Boolean(await p.$('.a-solicitud.a-abierta')), 'c3) con una oferta en pantalla la tarjeta espera (no la tapa)');
  await p.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-aviso-central.a-abierto', { timeout: 8000 }))), 'c3) al quitarse la oferta, la tarjeta sale');
  await p.waitForTimeout(300);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  ok(!srv.leidos.includes('av-con-oferta'), 'c3) cerrarla sin «Entendido» no la marca leída');

  // c4) La bandeja: «De tu cooperativa» en «Avisos» (lo que estaba sin leer queda leído).
  await p.click('[data-campana]');
  ok(Boolean(await intento(p.waitForSelector('.a-panel [data-bandeja-central]', { timeout: 6000 }))), 'c4) «Avisos» → la sección «De tu cooperativa»');
  const lista = await p.$$eval('.a-panel [data-aviso-central] .a-aviso-central-titulo', (ns) => ns.map((n) => n.textContent));
  ok(lista[0] === 'Turnos de diciembre' && lista.includes(TITULO_HTML) && lista.includes('Reunión de asociados') && !lista.some((t) => /pasajeros/.test(t)), `c4) el más nuevo primero y todos los suyos (${lista.join(' | ')})`);
  ok((await textoCrudo(p, '.a-panel [data-bandeja-central] h3')) === 'De tu cooperativa' && (await textoCrudo(p, '.a-panel .a-aviso-nuevo .a-aviso-nuevo-chip')) === 'Nuevo', 'c4) con «Nuevo» en el que no había leído');
  ok(!(await p.$('.a-panel [data-bandeja-central] img, .a-panel [data-bandeja-central] script')), 'c4) como texto');
  ok(Boolean(await hasta(() => srv.leidos.includes('av-con-oferta'), 5000)), 'c4) verlo en la bandeja lo marca leído');
  await p.waitForTimeout(450);
  await foto(p, 'c4-bandeja');
  await p.click('.a-panel [data-cerrar]');
  await p.waitForTimeout(500);
  ok(Boolean(await p.$('[data-insignia][hidden]')), 'c4) la campana queda sin pendientes');
  await ctx.close();
  srv.avisos.conductor = [];
}

async function avisosPasajero() {
  srv.avisos.pasajero = [];
  srv.bajas = [];
  const { ctx, p } = await contexto('avisos-pasajero');
  await entrarPasajero(p);
  await p.waitForTimeout(1200);
  ok(pide('GET', 'avisos').some((x) => x.consulta === '?rol=pasajero'), 'c5) el pasajero pide GET /api/avisos?rol=pasajero');
  enviarA('pasajero', 'aviso', aviso('av-p1', { para: 'pasajeros', titulo: 'Nuevo número de la central', texto: 'Ahora también por WhatsApp <a href="https://malo.example">aquí</a>.' }));
  ok(Boolean(await intento(p.waitForSelector('.a-modal-aviso-central.a-abierto', { timeout: 8000 }))), 'c5) el pasajero recibe la tarjeta');
  await p.waitForTimeout(400);
  ok(!(await p.$('.a-modal-aviso-central a[href*="malo"]')) && /<a href=/.test(await textoCrudo(p, '.a-modal-aviso-central .a-aviso-central-texto')), 'c5) un enlace en el texto no es un enlace (texto plano)');
  await foto(p, 'c5-tarjeta-pasajero');
  await tocarModal(p, 'Entendido', 'a-modal-aviso-central');
  ok(Boolean(await hasta(() => srv.leidos.includes('av-p1'), 5000)), 'c5) «Entendido» → leído');
  enviarA('pasajero', 'aviso', aviso('av-p-cond', { para: 'conductores' }));
  await p.waitForTimeout(1200);
  ok(!(await p.$('.a-modal-aviso-central')), 'c5) uno para los conductores no le sale al pasajero');

  // c6) Ajustes: «Avisos de Cootransrural» (la baja voluntaria).
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item:has-text("Ajustes")', { timeout: 6000 });
  await p.waitForTimeout(300);
  await p.click('.a-menu-item:has-text("Ajustes")');
  ok(Boolean(await intento(p.waitForSelector('[data-avisos-cooperativa]:not([hidden]) [role=switch]', { timeout: 8000 }))), 'c6) en Ajustes: «Avisos de Cootransrural»');
  ok((await texto(p, '.a-fila-interruptor[data-avisos-cooperativa] strong')) === 'Avisos de Cootransrural' && /nunca publicidad/.test(await texto(p, '.a-fila-interruptor[data-avisos-cooperativa] small')), `c6) con su explicación («${await texto(p, '.a-fila-interruptor[data-avisos-cooperativa]')}»)`);
  const sw = '[data-avisos-cooperativa] [role=switch]';
  ok((await p.getAttribute(sw, 'aria-checked')) === 'true', 'c6) encendido (sin baja)');
  await p.waitForTimeout(500);
  await foto(p, 'c6-ajustes-avisos');
  await p.click(sw);
  ok(Boolean(await hasta(() => pide('PUT', 'yo/avisos').some((x) => x.cuerpo?.empresa === 'cootransrural' && x.cuerpo?.recibir === false), 5000)), 'c6) apagarlo → PUT /api/yo/avisos { empresa: cootransrural, recibir: false }');
  await p.waitForTimeout(500);
  ok((await p.getAttribute(sw, 'aria-checked')) === 'false' && srv.bajas.includes('cootransrural'), 'c6) queda apagado');
  srv.bajasFalla = true;
  await p.click(sw);
  await p.waitForTimeout(1200);
  ok((await p.getAttribute(sw, 'aria-checked')) === 'false' && /No pudimos guardar el cambio/.test(await texto(p, '[data-avisos-cooperativa] [data-error]')), 'c6) si el servidor falla, vuelve a como estaba y lo dice');
  srv.bajasFalla = false;
  await p.click('.a-panel [data-cerrar]');
  await p.waitForTimeout(500);
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item:has-text("Ajustes")', { timeout: 6000 });
  await p.waitForTimeout(300);
  await p.click('.a-menu-item:has-text("Ajustes")');
  await p.waitForSelector('[data-avisos-cooperativa]:not([hidden]) [role=switch]', { timeout: 8000 });
  ok((await p.getAttribute(sw, 'aria-checked')) === 'false', 'c6) al volver a abrir Ajustes sigue apagado (GET /api/yo/avisos)');
  await p.click(sw);
  await hasta(() => !srv.bajas.includes('cootransrural'), 5000);
  ok(!srv.bajas.includes('cootransrural'), 'c6) y se vuelve a encender');
  await ctx.close();
  srv.avisos.pasajero = [];
}

/* ------------------------------------------------------------------ */
/* d) App del conductor 1.2: tocar el push de un aviso                 */
/* ------------------------------------------------------------------ */
async function pushAviso() {
  srv.avisos.conductor = [aviso('av-push', { titulo: 'Simulacro el jueves', texto: 'Habrá simulacro de evacuación a las 10.', leido: true })];
  const { ctx, p } = await contexto('push-aviso', { cfg: { plataforma: 'android', tokenPush: TOKEN_PUSH } });
  await entrarConductor(p, `${BASE}taxicun/conductor/`);
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-aviso-central')), 'd) leído: no sale solo al abrir');
  await p.evaluate(() => window.__push.tocar({ tipo: 'aviso', id: 'av-push' }));
  ok(Boolean(await intento(p.waitForSelector('.a-modal-aviso-central.a-abierto', { timeout: 8000 }))), 'd) tocar el push { tipo: aviso, id } → su tarjeta');
  await p.waitForTimeout(400);
  ok((await textoCrudo(p, '.a-modal-aviso-central .a-aviso-central-titulo')) === 'Simulacro el jueves', 'd) la de ese aviso');
  await foto(p, 'd-push-aviso');
  await tocarModal(p, 'Entendido', 'a-modal-aviso-central');
  // Uno que aún no estaba en el celular: lo pide al servidor.
  srv.avisos.conductor.unshift(aviso('av-push-2', { titulo: 'Nuevo horario', texto: 'La central abre a las 4.' }));
  await p.evaluate(() => window.__push.tocar({ tipo: 'aviso', id: 'av-push-2' }));
  ok(Boolean(await intento(p.waitForFunction(() => document.querySelector('.a-modal-aviso-central.a-abierto .a-aviso-central-titulo')?.textContent === 'Nuevo horario', null, { timeout: 8000 }))), 'd) uno que aún no tenía: lo trae del servidor y lo muestra');
  await ctx.close();
  srv.avisos.conductor = [];
}

/* ------------------------------------------------------------------ */
/* e) Modo revisor, central anterior y la demo                          */
/* ------------------------------------------------------------------ */
async function revisorYAnteriores() {
  // e1) Revisor de la tienda desde Cupertino: ve el botón y la posición que sale es la del paradero.
  srv.revision = true;
  srv.avisarCentral.pasajero = true;
  let { ctx, p } = await contexto('revisor', { geo: CUPERTINO });
  await entrarPasajero(p);
  await p.waitForTimeout(1500);
  await conConductor(p);
  await abrirSos(p);
  const acc = await accionesModal(p, 'a-modal-sos');
  ok(acc.some((x) => x === 'BUTTON:Avisar a la central de Cootransrural:'), 'e1) modo revisor: aparece «Avisar a la central»');
  const t0 = Date.now();
  await tocarModal(p, 'Avisar a la central de Cootransrural', 'a-modal-sos');
  ok(await modalSosCentral(p, /Le avisamos a la central de Cootransrural/), 'e1) y responde igual (la central lo marca de prueba: no le llega a nadie)');
  const pos = posts('pasajero', t0)[0]?.cuerpo?.pos;
  ok(Math.abs((pos?.lat ?? 0) - PARADERO.lat) < 0.0005 && Math.abs((pos?.lng ?? 0) - PARADERO.lng) < 0.0005, `e1) con la posición del paradero, no la de Cupertino (${JSON.stringify(pos)})`);
  await foto(p, 'e1-revisor');
  await ctx.close();
  srv.revision = false;
  srv.avisarCentral.pasajero = false;

  // e2) Una central anterior (0.8: GET /api/avisos 404): nada se rompe y no se insiste.
  srv.avisos404 = true;
  ({ ctx, p } = await contexto('central-anterior'));
  const g0 = pide('GET', 'avisos').length;
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  ok(await conectar(p), 'e2) central anterior: entra y se pone en turno');
  await p.waitForTimeout(1000);
  const g1 = pide('GET', 'avisos').length;
  const h0 = holas('conductor');
  cortar('conductor');
  await hasta(() => holas('conductor') > h0, 10000);
  await p.waitForTimeout(1500);
  ok(g1 - g0 >= 1 && pide('GET', 'avisos').length === g1, `e2) preguntó al entrar (${g1 - g0}) y, con 404, no vuelve a preguntar al reconectarse (${pide('GET', 'avisos').length - g1})`);
  await p.click('[data-campana]');
  await p.waitForTimeout(600);
  ok(!(await p.$('.a-panel [data-bandeja-central]')), 'e2) «Avisos» sin la sección de la cooperativa');
  await ctx.close();
  srv.avisos404 = false;

  // e3) La demo (sin ?real=1): ni botón de ayuda en la barra ni GET /api/avisos.
  ({ ctx, p } = await contexto('demo'));
  const g3 = pide('GET', 'avisos').length;
  await p.goto(`${BASE}taxicun/conductor/?e=cootransrural`);
  await p.waitForSelector('.a-app', { timeout: 30000 });
  await p.waitForTimeout(3000);
  ok(!(await p.$('[data-ayuda-barra]')), 'e3) la demo del conductor no tiene el botón de ayuda nuevo');
  await p.goto(`${BASE}taxicun/?e=cootransrural`);
  await p.waitForSelector('.a-app', { timeout: 30000 });
  await p.waitForTimeout(3000);
  ok(pide('GET', 'avisos').length === g3 && pide('POST', 'sos').every((x) => x.t < Date.now() - 6000), 'e3) ni GET /api/avisos ni POST /api/sos en la demo');
  await ctx.close();
}

const ini = Date.now();
// --solo=a,b…: solo esas partes.
const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
for (const [nombre, fn] of [['a', pasajeroSos], ['b', conductorWeb], ['c', avisosConductor], ['c5', avisosPasajero], ['d', pushAviso], ['e', revisorYAnteriores]]) {
  if (SOLO.length && !SOLO.includes(nombre)) continue;
  srv.viajePasajero = null;
  try {
    await fn();
  } catch (e) {
    ok(false, `${nombre}) se cortó: ${e.message.split('\n')[0]}`);
    console.log(e.stack?.split('\n').slice(1, 4).join('\n'));
  }
}
ok(errores.length === 0, `sin errores de JavaScript (${errores.slice(0, 5).join(' | ')})`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · ronda 4A (app) · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - ini) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
