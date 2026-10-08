// Fase 3 del panel («En vivo y viajes») en las apps, con el servidor de TaxiCun simulado aquí mismo (page.route y
// routeWebSocket, como segundo-plano.mjs) y, para la app de las tiendas, Capacitor simulado (PushNotifications y el
// plugin UbicacionTurno). Contrato: nucleo/central.js.
//
//  a) Conductor en la web (?real=1): sacado_de_turno con la app abierta → «Desconectado» con el diálogo «La central te
//     sacó de turno» y el motivo como TEXTO (con HTML a propósito), presencia disponible: false, sin ofertas; vuelve con
//     «Conectarme». La oferta de la central (central: true) dice «La central te ofrece este servicio»; la central la
//     cancela (por: 'central') → se quita. Sacado con un servicio: lo termina y queda «Desconectado» al terminarlo
//     (también si la página se recarga en medio). La central cancela un servicio asignado → libre y sigue en turno.
//     La bienvenida con sacadoDeTurno (lo sacó sin el bus abierto) → fuera de turno sin anunciarse disponible.
//  b) App del conductor 1.2 (iPhone, con avisos y el plugin), minimizada: la central lo saca → el plugin se detiene con
//     'servidor' → queda «Desconectado» ya; al volver, la bienvenida trae el motivo y el plugin no se reinicia. Tocar el
//     push { tipo: 'sacado_de_turno', motivo, en } (Android: en como texto) lo deja «Desconectado» con el motivo.
//  c) Pasajero (?real=1): la central cancela la solicitud (buscando) → «Cootransrural canceló tu solicitud» con el
//     motivo como texto y «Llamar a la central», en «Mis viajes» y SIN volver a pedir; reenviada al reconectarse (entre
//     la bienvenida y viaje_actual) igual; si llega después de que la app la volvió a pedir (id anterior), cancela
//     también la nueva; con un conductor asignado → «… canceló tu servicio».
//  d) Tarjeta «Actualizamos la política de privacidad» (S36): con la 1.3 apagada (nucleo/politica.js de la rama) no
//     sale; encendida (simulada), sale una vez al pasajero («Entendido») y al conductor («Acepto»), fuera de turno, y no
//     en las demos.
//
// Uso: node pruebas/fase3-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=4421). Capturas en $CAPTURAS. Unos 4 minutos.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:4421/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/panel/f3/pruebas/app/capturas-fase3').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const TEL_CENTRAL = String(FICHA.EMPRESA.telefono).replace(/\D/g, '');
const CODIGO = '123456';
const TOKEN_PUSH = 'c3d4'.repeat(16);
const LUIS = 'luis@prueba.taxicun.com';
const ANA = 'ana@prueba.taxicun.com';
// Motivos con HTML a propósito: las apps los pintan como texto (S30; el panel ni siquiera deja guardar < y >).
const MOTIVO_HTML = 'Vehículo con la revisión vencida <img src=x onerror="window.__xss=3"> & pendiente';
const MOTIVO_PASAJERO = 'No hay taxis para la vereda <b>Hato</b> a esta hora';

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
  sesiones: new Map(), // token → correo
  peticiones: [],
  hola: [],
  mensajes: [],
  ofertas: new Map(),
  viajes: new Map(), // correo del conductor → servicio asignado (viaje_actual)
  sockets: new Set(),
  cierres: [],
  sacadoAlSaludar: new Map(), // correo → { motivo, en }: va en la próxima bienvenida (una vez)
  alSaludarPasajero: [], // sobres para el pasajero entre la bienvenida y viaje_actual (como el final del viaje)
  despuesDeViajeActual: [], // sobres para el pasajero DESPUÉS de viaje_actual (fuera del contrato: la app se defiende)
};
const yoDe = (correo) => {
  const u = USUARIOS[correo];
  return { usuario: { id: `u-${correo}`, correo, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor };
};

async function atenderApi(route) {
  const req = route.request();
  const ruta = new URL(req.url()).pathname.replace(/^\/api\//, '');
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
  if (metodo === 'GET' && ruta === 'yo') return correo ? responder(200, yoDe(correo)) : responder(401, { error: 'sin_sesion' });
  if (metodo === 'PATCH' && ruta === 'yo') return correo ? responder(200, yoDe(correo)) : responder(401, { error: 'sin_sesion' });
  if (ruta === 'yo/dispositivo') return correo ? responder(200, { ok: true }) : responder(401, { error: 'sin_sesion' });
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
// Corta el WebSocket desde la central (la app reintenta sola, como con una caída de la red).
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
  ws.onClose((codigo, motivo) => {
    srv.sockets.delete(cx);
    srv.cierres.push({ rol: cx.rol, correo: cx.correo, codigo, motivo, t: Date.now() });
  });
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
      if (cx.rol === 'conductor') {
        const b = { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 4.9, viajes: 120 } };
        const sacado = srv.sacadoAlSaludar.get(correo);
        if (sacado) {
          b.sacadoDeTurno = sacado;
          srv.sacadoAlSaludar.delete(correo);
        }
        enviar(cx, 'bienvenida', b);
        enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
        return;
      }
      enviar(cx, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana' });
      for (const [tipo, datos] of srv.alSaludarPasajero.splice(0)) enviar(cx, tipo, datos);
      enviar(cx, 'viaje_actual', null);
      const despues = srv.despuesDeViajeActual.splice(0);
      if (despues.length) setTimeout(() => despues.forEach(([tipo, datos]) => enviar(cx, tipo, datos)), 1200);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol !== 'conductor') return;
    if (m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
    if (m.tipo === 'aceptacion') {
      const s = srv.ofertas.get(m.datos?.viajeId);
      if (!s) return enviar(cx, 'error', { codigo: 'servicio_no_disponible' });
      srv.ofertas.delete(s.viajeId);
      srv.viajes.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular: '3001234567' }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: '' });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular: '3001234567' } });
    }
    if (m.tipo === 'cancelacion') srv.viajes.delete(cx.correo);
  });
}

const oferta = (viajeId, extra = {}) => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre: 'Marta', calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.002, lng: CENTRO.lng + 0.001, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
  ...extra,
});
// La central le ofrece un servicio a los conductores disponibles (o a todos los conectados con forzar).
function ofrecer(viajeId, extra = {}, { forzar = false } = {}) {
  const s = oferta(viajeId, extra);
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && (cx.disponible || forzar)) enviar(cx, 'solicitud', s, s.pasajero.id);
}
function cancelaPasajero(viajeId) {
  for (const [correo, v] of srv.viajes) if (v.viajeId === viajeId) srv.viajes.delete(correo);
  enviarA('conductor', 'cancelacion', { viajeId, por: 'pasajero', motivo: 'Ya no lo necesito' });
}
function cancelaCentral(rol, viajeId, motivo) {
  for (const [correo, v] of srv.viajes) if (v.viajeId === viajeId) srv.viajes.delete(correo);
  srv.ofertas.delete(viajeId);
  enviarA(rol, 'cancelacion', { viajeId, por: 'central', motivo, ...(rol === 'pasajero' ? {} : { conductorId: 'c_luis' }) });
}
// Como la manda el servidor 0.7.0: { por: 'sistema', motivo: 'central' }, sin el texto que escribió la central.
function cancelaCentralReal(rol, viajeId) {
  for (const [correo, v] of srv.viajes) if (v.viajeId === viajeId) srv.viajes.delete(correo);
  srv.ofertas.delete(viajeId);
  enviarA(rol, 'cancelacion', { viajeId, por: 'sistema', motivo: 'central', ...(rol === 'pasajero' ? {} : { conductorId: 'c_luis' }) });
}

/* ------------------------------------------------------------------ */
/* Capacitor simulado (como segundo-plano.mjs)                         */
/* ------------------------------------------------------------------ */
function capacitorFalso(cfg) {
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const anotar = (n, a) => {
    const todas = L('__todas') || [];
    todas.push([n, a ?? null]);
    L('__todas', todas);
  };
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
    tocar: (data) => (oyentes.pushNotificationActionPerformed || []).forEach((f) => f({ actionId: 'tap', notification: { id: 'n1', title: 'La central te sacó de turno', body: '…', data } })),
  };
  const vacio = { activo: false, modo: null, libre: null, desde: null, motivo: '', precisa: true, url: null, token: null };
  const ut = () => ({ ...vacio, ...(L('__ut') || {}) });
  const publico = (e) => ({ activo: e.activo, modo: e.modo, motivo: e.motivo, precisa: e.precisa, desde: e.desde });
  const oyentesUt = [];
  const avisar = (motivo) => {
    const d = { motivo, origen: 'servidor' };
    if (oyentesUt.length) oyentesUt.forEach((f) => f(d));
    else L('__utRetenido', d);
  };
  plugins.UbicacionTurno = {
    async iniciar(op) {
      anotar('ut.iniciar', op);
      const e = ut();
      if (!e.activo && document.hidden) throw Object.assign(new Error('App en segundo plano'), { code: 'SEGUNDO_PLANO' });
      if (!e.activo) e.desde = Date.now();
      Object.assign(e, { activo: true, modo: op.modo === 'viaje' ? 'viaje' : 'libre', libre: op.libre, url: op.url, token: op.token, motivo: '', precisa: true });
      L('__ut', e);
      return publico(e);
    },
    async cambiarModo(op) {
      anotar('ut.cambiarModo', op);
      const e = ut();
      if (op.modo) e.modo = op.modo === 'viaje' ? 'viaje' : 'libre';
      if (typeof op.libre === 'boolean') e.libre = op.libre;
      L('__ut', e);
      return publico(e);
    },
    async detener(op) {
      anotar('ut.detener', op);
      const e = ut();
      if (e.activo) {
        Object.assign(e, { activo: false, modo: null, desde: null, motivo: op?.motivo || 'turno_apagado' });
        L('__ut', e);
      }
      return publico(e);
    },
    async estado() {
      return publico(ut());
    },
    async addListener(ev, fn) {
      if (ev === 'detenido') {
        oyentesUt.push(fn);
        const r = L('__utRetenido');
        if (r) {
          localStorage.removeItem('__utRetenido');
          setTimeout(() => fn(r), 20);
        }
      }
      return { remove: async () => { const i = oyentesUt.indexOf(fn); if (i >= 0) oyentesUt.splice(i, 1); } };
    },
  };
  // El plugin se detiene solo (aquí: la central respondió seguir: false → 'servidor').
  window.__ut = {
    parar: (motivo) => {
      const e = ut();
      Object.assign(e, { activo: false, modo: null, desde: null, motivo });
      L('__ut', e);
      avisar(motivo);
    },
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
// politica: el cuerpo de nucleo/politica.js que sirve la prueba (null = el de la rama).
async function contexto(nombre, { cfg = null, politica = null } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  // Fuera de la red: direcciones, rutas y teselas (el núcleo usa sus respaldos locales).
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  if (politica) await ctx.route(/\/nucleo\/politica\.js(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: politica }));
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
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const enTurno = async (p) => (await p.getAttribute('[data-conectar]', 'aria-checked').catch(() => null)) === 'true';
// Un aviso vivo con ese texto (textContent: los que quedan detrás del más nuevo no muestran el cuerpo).
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].some((t) => new RegExp(f).test(t.textContent.replace(/\s+/g, ' '))), re.source, { timeout }));
const msjDesde = (i, rol, tipo) => srv.mensajes.slice(i).filter((m) => m.rol === rol && m.tipo === tipo);
const holas = (rol) => srv.hola.filter((h) => h.rol === rol).length;
const llamadasUt = (p, nombre) => p.evaluate((x) => (JSON.parse(localStorage.getItem('__todas') || '[]')).filter(([n]) => n === x).map(([, a]) => a), nombre);
const cuantas = async (p, nombre) => (await llamadasUt(p, nombre)).length;
const estadoUt = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__ut') || 'null'));
const historial = (p, rol) => p.evaluate((r) => JSON.parse(localStorage.getItem(`tc.real.cootransrural.historial.${r}`) || '[]'), rol);
// El diálogo «La central te sacó de turno» abierto (y ya quieto: sube en 0,32 s).
const modalSacado = async (p, timeout = 8000) => {
  const r = await intento(p.waitForSelector('.a-modal-sacado.a-abierto .a-modal h2', { timeout }));
  if (r) await p.waitForTimeout(450);
  return r;
};
const textoModalSacado = (p) => p.evaluate(() => document.querySelector('.a-modal-sacado .a-modal-texto')?.textContent || '');

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
async function visibilidad(p, oculta) {
  await p.evaluate((o) => {
    if (!window.__visibilidadFalsa) {
      window.__visibilidadFalsa = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
    }
    window.__oculta = o;
    document.dispatchEvent(new Event('visibilitychange'));
  }, oculta);
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
async function aceptarViaje(p, viajeId) {
  ofrecer(viajeId);
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.click('.a-solicitud [data-aceptar]');
  return intento(vista(p, 'hacia_origen', 15000));
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
// Pide un taxi al primer destino frecuente y devuelve el id de la solicitud.
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
const politica13 = (avisar = true) => `export const POLITICA = Object.freeze(${JSON.stringify({ version: '1.3', vigenteDesde: '20 de octubre de 2026', avisar })});\n`;

/* ------------------------------------------------------------------ */
/* a) Conductor en la web (?real=1)                                    */
/* ------------------------------------------------------------------ */
async function conductorWeb() {
  const { ctx, p } = await contexto('conductor-web');
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  ok(!(await p.$('.a-modal-politica')), 'a) con la política 1.3 apagada no sale «Actualizamos la política de privacidad»');
  ok(await conectar(p), 'a) «Conectarme» → en turno');
  await hasta(() => [...srv.sockets].some((cx) => cx.rol === 'conductor' && cx.disponible), 6000);

  // a1) La central lo saca de turno con la app abierta.
  let m0 = srv.mensajes.length;
  enviarA('conductor', 'sacado_de_turno', { motivo: MOTIVO_HTML, en: Date.now() });
  ok(await modalSacado(p), 'a1) sacado_de_turno → el diálogo «La central te sacó de turno»');
  ok((await texto(p, '.a-modal-sacado .a-modal h2')) === 'La central te sacó de turno', 'a1) con ese título');
  const t1 = await textoModalSacado(p);
  ok(t1 === `Motivo: ${MOTIVO_HTML}. Ya no te llegan servicios. Puedes volver a conectarte cuando quieras.`, `a1) el motivo como TEXTO y qué hacer («${t1}»)`);
  ok(!(await p.$('.a-modal-sacado img')) && (await p.evaluate(() => window.__xss)) === undefined, 'a1) el <img> del motivo no se pinta ni corre (S30)');
  ok(!(await enTurno(p)), 'a1) queda «Desconectado»');
  ok(/La central te sacó de turno/.test(await texto(p, '[data-pildora-sub]')), `a1) la píldora lo dice («${await texto(p, '[data-pildora-sub]')}»)`);
  ok(Boolean(await hasta(() => msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === false), 4000)), 'a1) manda presencia disponible: false');
  ok(msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === false && m.datos?.sacado === true), 'a1) con el acuse sacado: true (la central 0.7.0 levanta su marca y «Conectarme» vale)');
  await foto(p, 'a1-sacado-de-turno');
  ofrecer('v-fuera', {}, { forzar: true });
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-solicitud')), 'a1) fuera de turno no le aparece una oferta (aunque la central se la mandara)');
  await tocarModal(p, 'Entendido', 'a-modal-sacado');
  ok(!(await p.$('.a-modal-sacado')), 'a1) «Entendido» cierra el diálogo');
  ok(/La central te sacó de turno/.test(await p.evaluate(() => [...document.querySelectorAll('.a-avisos .a-toast')].map((t) => t.innerText).join(' '))) === false, 'a1) sin un aviso pequeño repetido encima del diálogo');
  m0 = srv.mensajes.length;
  ok(await conectar(p), 'a1) puede volver a ponerse en turno («Conectarme»)');
  ok(Boolean(await hasta(() => msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === true), 6000)), 'a1) y vuelve a anunciarse disponible');
  ok(!msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === true && m.datos?.sacado), 'a1) ya sin el acuse');
  ok(/Recibiendo solicitudes cercanas/.test(await texto(p, '[data-pildora-sub]')), 'a1) la píldora ya no dice que lo sacaron');
  srv.ofertas.delete('v-fuera');

  // a2) La central le ofrece un servicio («Ofrecer a un móvil») y luego lo cancela.
  ofrecer('v-central', { central: true });
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta [data-de-central]', { timeout: 10000 }))), 'a2) la oferta de la central (central: true) llega a la hoja amarilla');
  ok((await p.textContent('.a-solicitud [data-de-central]')).trim() === 'La central te ofrece este servicio', 'a2) dice «La central te ofrece este servicio»');
  await p.waitForTimeout(500);
  await foto(p, 'a2-oferta-de-la-central');
  cancelaCentral('conductor', 'v-central', 'El pasajero llamó a cancelar');
  ok(Boolean(await hasta(async () => !(await p.$('.a-solicitud.a-abierta')), 6000)), 'a2) la central la cancela (por: central) → la hoja se quita');
  ok(await conAviso(p, /La central canceló ese servicio/), 'a2) con «La central canceló ese servicio»');
  ofrecer('v-normal');
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 }))) && !(await p.$('.a-solicitud [data-de-central]')) && /Nueva solicitud/.test(await p.textContent('.a-sol-quien small')), 'a2) una oferta normal sigue diciendo «Nueva solicitud»');
  await p.click('.a-solicitud [data-rechazar]');
  await p.waitForTimeout(800);
  srv.ofertas.delete('v-normal');

  // a3) Sacado con un servicio en curso: lo termina y queda «Desconectado» al terminarlo.
  ok(await aceptarViaje(p, 'v-3'), 'a3) acepta un servicio');
  enviarA('conductor', 'sacado_de_turno', { motivo: 'Fin del turno de la tarde' });
  ok(await conAviso(p, /Termina este servicio; después quedarás desconectado/), 'a3) con un servicio: «La central te sacó de turno … Termina este servicio; después quedarás desconectado.»');
  ok(!(await p.$('.a-modal-sacado')) && (await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'hacia_origen', 'a3) sin diálogo y sigue con su servicio');
  await foto(p, 'a3-sacado-con-servicio');
  // La página se recarga en medio del servicio: lo pendiente sigue.
  await p.reload();
  ok(Boolean(await intento(vista(p, 'hacia_origen', 20000))), 'a3) recargada en medio del servicio, lo retoma');
  m0 = srv.mensajes.length;
  cancelaPasajero('v-3');
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'a3) el pasajero cancela → libre');
  ok(await conAviso(p, /Quedaste desconectado/), 'a3) «Quedaste desconectado · La central te sacó de turno…»');
  ok(Boolean(await hasta(async () => !(await enTurno(p)), 4000)), 'a3) y queda «Desconectado» (también tras la recarga)');
  await p.waitForTimeout(1200);
  ok(!msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === true), 'a3) sin anunciarse disponible al terminar');

  // a4) La central cancela un servicio asignado: libre y sigue en turno.
  ok(await conectar(p), 'a4) vuelve a conectarse');
  ok(await aceptarViaje(p, 'v-4'), 'a4) acepta otro servicio');
  m0 = srv.mensajes.length;
  cancelaCentral('conductor', 'v-4', 'El pasajero ya consiguió transporte');
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'a4) la central lo cancela → libre');
  ok(await conAviso(p, /La central canceló el servicio/), 'a4) «La central canceló el servicio»');
  ok(/Motivo: El pasajero ya consiguió transporte\. Sigues en turno\./.test(await texto(p, '.a-avisos')), 'a4) con el motivo y «Sigues en turno.»');
  ok(await enTurno(p), 'a4) sigue en turno');
  ok(Boolean(await hasta(() => msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === true), 6000)), 'a4) y vuelve a estar disponible');
  const h4 = (await historial(p, 'conductor')).find((v) => v.id === 'v-4');
  ok(h4?.estado === 'cancelado' && h4.motivo === 'Cancelado por la central: El pasajero ya consiguió transporte', `a4) en su historial: «${h4?.motivo}»`);
  await foto(p, 'a4-cancelado-por-la-central');

  // a4b) Sacado durante un servicio y después la central cancela ese servicio: queda fuera (no «Sigues en turno»).
  ok(await aceptarViaje(p, 'v-4b'), 'a4b) acepta otro servicio');
  enviarA('conductor', 'sacado_de_turno', { motivo: 'Fin del turno' });
  await conAviso(p, /Termina este servicio/);
  cancelaCentral('conductor', 'v-4b', 'Se reasigna a otro móvil');
  const libre4b = Boolean(await intento(vista(p, 'libre', 10000)));
  const aviso4b = await conAviso(p, /Ya no estás en turno/);
  ok(libre4b && aviso4b, 'a4b) «La central canceló el servicio · … Ya no estás en turno.»');
  ok(Boolean(await hasta(async () => !(await enTurno(p)), 4000)) && !/Sigues en turno/.test(await texto(p, '.a-avisos')), 'a4b) y queda «Desconectado» (sin «Sigues en turno»)');
  ok(await conectar(p), 'a4b) vuelve a conectarse');

  // a4c) Como lo manda el servidor 0.7.0 ({ por: 'sistema', motivo: 'central' }, sin el texto de la central).
  ok(await aceptarViaje(p, 'v-4c'), 'a4c) acepta otro servicio');
  m0 = srv.mensajes.length;
  cancelaCentralReal('conductor', 'v-4c');
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'a4c) la central 0.7.0 lo cancela → libre');
  ok(await conAviso(p, /La central canceló el servicio/), 'a4c) «La central canceló el servicio»');
  const t4c = await p.evaluate(() => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()).filter((t) => /La central canceló el servicio/.test(t)).pop() || '');
  ok(/Sigues en turno\./.test(t4c) && !/Motivo/.test(t4c), `a4c) sin motivo (el código «central» no se muestra) y «Sigues en turno.» («${t4c.slice(0, 120)}»)`);
  ok(await enTurno(p), 'a4c) sigue en turno');
  const h4c = (await historial(p, 'conductor')).find((v) => v.id === 'v-4c');
  ok(h4c?.estado === 'cancelado' && h4c.motivo === 'Cancelado por la central', `a4c) en su historial: «${h4c?.motivo}»`);

  // a5) La central lo sacó sin el bus abierto: la bienvenida lo dice (sin anunciarse disponible ni un instante).
  ok(await enTurno(p), 'a5) en turno');
  srv.sacadoAlSaludar.set(LUIS, { motivo: 'Revisión de documentos', en: Date.now() });
  const h0 = holas('conductor');
  m0 = srv.mensajes.length;
  cortar('conductor');
  ok(Boolean(await hasta(() => holas('conductor') > h0, 10000)), 'a5) se reconecta');
  ok(await modalSacado(p), 'a5) bienvenida con sacadoDeTurno → «La central te sacó de turno»');
  ok(/^Motivo: Revisión de documentos\./.test(await textoModalSacado(p)), 'a5) con el motivo de la bienvenida');
  await p.waitForTimeout(1500);
  const pres5 = msjDesde(m0, 'conductor', 'presencia');
  ok(!pres5.some((m) => m.datos?.disponible === true) && pres5.some((m) => m.datos?.disponible === false), `a5) ninguna presencia disponible: true después de la bienvenida (${pres5.map((m) => m.datos?.disponible).join(',')})`);
  ok(pres5.some((m) => m.datos?.disponible === false && m.datos?.sacado === true), 'a5) y el acuse sacado: true');
  ok(!(await enTurno(p)), 'a5) «Desconectado»');
  await foto(p, 'a5-sacado-en-la-bienvenida');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) App del conductor 1.2 (iPhone), minimizada                       */
/* ------------------------------------------------------------------ */
async function conductorApp() {
  const { p } = await contexto('conductor-app', { cfg: { plataforma: 'ios', tokenPush: TOKEN_PUSH } });
  await entrarConductor(p, `${BASE}taxicun/conductor/`);
  await p.click('[data-conectar]');
  await tocarModal(p, 'Activar avisos');
  await tocarModal(p, 'Entendido', 'a-modal-segundo-plano');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'b) en turno');
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === true, 8000)), 'b) con el plugin UbicacionTurno andando');
  await p.waitForTimeout(800);

  // b1) Minimizada: la central lo saca → el siguiente POST del plugin recibe seguir: false (motivo 'servidor').
  let c0 = srv.cierres.length;
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => srv.cierres.length > c0, 4000)), 'b1) minimizada, el bus se cierra (como siempre)');
  srv.sacadoAlSaludar.set(LUIS, { motivo: 'Lo pidió el gerente', en: Date.now() });
  const i0 = await cuantas(p, 'ut.iniciar');
  const h0 = holas('conductor');
  const m0 = srv.mensajes.length;
  await p.evaluate(() => window.__ut.parar('servidor'));
  ok(Boolean(await hasta(async () => !(await enTurno(p)), 5000)), 'b1) el plugin se detiene con «servidor» → queda «Desconectado» aunque siga minimizada');
  ok(Boolean(await p.$('.a-modal-sacado')), 'b1) y deja el diálogo puesto (lo verá al volver)');
  await visibilidad(p, false);
  ok(Boolean(await hasta(() => holas('conductor') > h0, 8000)), 'b1) saluda a la central (fuera de turno el bus se puede abrir aunque siga minimizada)');
  ok(Boolean(await hasta(async () => /^Motivo: Lo pidió el gerente\./.test(await textoModalSacado(p)), 6000)), 'b1) la bienvenida trae el motivo y el diálogo lo muestra');
  await p.waitForTimeout(2500);
  ok(!msjDesde(m0, 'conductor', 'presencia').some((m) => m.datos?.disponible === true), 'b1) al volver no se anuncia disponible');
  ok((await cuantas(p, 'ut.iniciar')) === i0 && (await estadoUt(p))?.activo === false, 'b1) y el plugin no se vuelve a iniciar solo');
  await foto(p, 'b1-sacado-minimizada');
  await tocarModal(p, 'Entendido', 'a-modal-sacado');
  ok(await conectar(p), 'b1) «Conectarme» → en turno otra vez');
  ok(Boolean(await hasta(async () => (await cuantas(p, 'ut.iniciar')) > i0 && (await estadoUt(p))?.activo === true, 8000)), 'b1) y el plugin vuelve a andar');

  // b2) Tocar el push «La central te sacó de turno» (Android: los datos llegan como texto). Sin la bienvenida.
  await p.waitForTimeout(600);
  c0 = srv.cierres.length;
  await visibilidad(p, true);
  await hasta(() => srv.cierres.length > c0, 4000);
  const m1 = srv.mensajes.length;
  await p.evaluate((en) => window.__push.tocar({ tipo: 'sacado_de_turno', motivo: 'Ya cerró la central', en: String(en) }), Date.now());
  await visibilidad(p, false);
  ok(Boolean(await hasta(async () => !(await enTurno(p)), 6000)), 'b2) tocar el push → «Desconectado»');
  ok(Boolean(await hasta(async () => /^Motivo: Ya cerró la central\./.test(await textoModalSacado(p)), 6000)), 'b2) con el motivo del push');
  await p.waitForTimeout(2500);
  const pres = msjDesde(m1, 'conductor', 'presencia');
  ok(!pres.some((m) => m.datos?.disponible === true), `b2) no se anuncia disponible (${pres.map((m) => m.datos?.disponible).join(',') || 'sin presencias: la central lo arranca no disponible'})`);
  ok(Boolean(await hasta(async () => (await llamadasUt(p, 'ut.detener')).some((a) => a?.motivo === 'turno_apagado' && a?.avisar === true) && (await estadoUt(p))?.activo === false, 5000)), 'b2) y el plugin se detiene con el fin «turno_apagado» (la central lo saca del mapa)');
  await foto(p, 'b2-push-tocado');
  ok(!(await p.$('.a-modal-politica')), 'b) sin la tarjeta de la política (1.3 apagada)');
}

/* ------------------------------------------------------------------ */
/* c) Pasajero (?real=1): la central cancela                           */
/* ------------------------------------------------------------------ */
async function pasajero() {
  const { p } = await contexto('pasajero');
  await entrarPasajero(p);
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-politica')), 'c) con la política 1.3 apagada no sale la tarjeta');

  // c1) Buscando: la central la cancela.
  const v1 = await pedir(p);
  ok(Boolean(v1), 'c1) pide un taxi (buscando)');
  let t0 = Date.now();
  cancelaCentral('pasajero', v1, MOTIVO_PASAJERO);
  ok(Boolean(await intento(p.waitForSelector('.a-modal-central.a-abierto .a-modal h2', { timeout: 8000 }))), 'c1) cancelacion por: central → el diálogo');
  ok((await texto(p, '.a-modal-central .a-modal h2')) === 'Cootransrural canceló tu solicitud', 'c1) «Cootransrural canceló tu solicitud»');
  const tc1 = await p.evaluate(() => document.querySelector('.a-modal-central .a-modal-texto')?.textContent || '');
  ok(tc1 === `Motivo: ${MOTIVO_PASAJERO}. Si aún necesitas un taxi, llama a la central o pide otro.`, `c1) el motivo como TEXTO («${tc1}»)`);
  ok(!(await p.$('.a-modal-central .a-modal-texto b')), 'c1) el <b> del motivo no se pinta');
  const acciones = await p.$$eval('.a-modal-central .a-modal-acciones > *', (ns) => ns.map((n) => `${n.tagName}:${n.innerText.trim()}:${n.getAttribute('href') || ''}`));
  ok(acciones.join(' | ') === `A:Llamar a la central:tel:${TEL_CENTRAL} | BUTTON:Entendido:`, `c1) acciones: ${acciones.join(' | ')}`);
  ok(Boolean(await intento(vista(p, 'inicio', 8000))), 'c1) vuelve al inicio');
  await p.waitForTimeout(450);
  await foto(p, 'c1-solicitud-cancelada-por-la-central');
  await p.waitForTimeout(3500);
  ok(solicitudes(t0).length === 0, 'c1) y NO vuelve a pedir solo');
  const h1 = (await historial(p, 'pasajero')).find((v) => v.id === v1);
  ok(h1?.estado === 'cancelado' && h1.motivo === `Cancelado por la central: ${MOTIVO_PASAJERO}`, `c1) en «Mis viajes»: «${h1?.motivo}»`);
  await tocarModal(p, 'Entendido', 'a-modal-central');

  // c2) La canceló sin el bus abierto: se la reenvía al reconectarse, entre la bienvenida y viaje_actual.
  const v2 = await pedir(p);
  srv.alSaludarPasajero.push(['cancelacion', { viajeId: v2, por: 'central', motivo: 'Vía cerrada por derrumbe' }]);
  let h0 = holas('pasajero');
  t0 = Date.now();
  cortar('pasajero');
  ok(Boolean(await hasta(() => holas('pasajero') > h0, 10000)), 'c2) se reconecta');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-central.a-abierto', { timeout: 8000 }))) && /Vía cerrada por derrumbe/.test(await texto(p, '.a-modal-central .a-modal-texto')), 'c2) la cancelación reenviada → el diálogo con el motivo');
  await p.waitForTimeout(3000);
  ok(solicitudes(t0).length === 0 && (await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'inicio', 'c2) sin volver a pedir (viaje_actual null ya no la revive)');
  await tocarModal(p, 'Entendido', 'a-modal-central');

  // c3) Fuera del contrato: llega DESPUÉS de viaje_actual (la app ya la volvió a pedir con otro id).
  const v3 = await pedir(p);
  srv.despuesDeViajeActual.push(['cancelacion', { viajeId: v3, por: 'central', motivo: 'Sin taxis disponibles' }]);
  h0 = holas('pasajero');
  t0 = Date.now();
  cortar('pasajero');
  await hasta(() => holas('pasajero') > h0, 10000);
  const nueva = await hasta(() => solicitudes(t0).find((m) => m.datos?.viajeId !== v3), 8000);
  ok(Boolean(nueva), 'c3) con viaje_actual null la app la vuelve a pedir sola (id nuevo), como siempre');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-central.a-abierto', { timeout: 8000 }))), 'c3) llega la cancelación del id anterior → el diálogo');
  const cancNueva = await hasta(() => srv.mensajes.find((m) => m.rol === 'pasajero' && m.tipo === 'cancelacion' && m.t >= t0 && m.datos?.viajeId === nueva?.datos?.viajeId), 5000);
  ok(Boolean(cancNueva), `c3) y cancela también la búsqueda nueva (${cancNueva?.datos?.viajeId})`);
  ok((await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'inicio', 'c3) queda en el inicio');
  await tocarModal(p, 'Entendido', 'a-modal-central');

  // c4) Con un conductor asignado.
  const v4 = await pedir(p);
  enviarA('pasajero', 'aceptacion', { viajeId: v4, conductor: { id: 'c_luis', movil: '023', placa: 'WFK123', nombre: 'Luis Alberto Rodríguez', vehiculo: 'Renault Logan', color: 'Amarillo', calificacion: 4.9, viajes: 120, tel: '3109876543' }, pos: { lat: CENTRO.lat + 0.004, lng: CENTRO.lng }, etaMin: 4 });
  ok(Boolean(await intento(vista(p, 'asignado', 10000))), 'c4) un conductor acepta (asignado)');
  t0 = Date.now();
  cancelaCentral('pasajero', v4, 'El conductor tuvo un problema con el vehículo');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-central.a-abierto', { timeout: 8000 }))) && (await texto(p, '.a-modal-central .a-modal h2')) === 'Cootransrural canceló tu servicio', 'c4) «Cootransrural canceló tu servicio»');
  await p.waitForTimeout(2500);
  ok(solicitudes(t0).length === 0 && (await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'inicio', 'c4) al inicio, sin buscar otro taxi solo');
  await foto(p, 'c4-servicio-cancelado-por-la-central');
  await tocarModal(p, 'Entendido', 'a-modal-central');

  // c5) Como lo manda el servidor 0.7.0 ({ por: 'sistema', motivo: 'central' }): sin el texto de la central.
  const v5 = await pedir(p);
  t0 = Date.now();
  cancelaCentralReal('pasajero', v5);
  ok(Boolean(await intento(p.waitForSelector('.a-modal-central.a-abierto .a-modal h2', { timeout: 8000 }))) && (await texto(p, '.a-modal-central .a-modal h2')) === 'Cootransrural canceló tu solicitud', 'c5) la forma de la 0.7.0 → «Cootransrural canceló tu solicitud»');
  const tc5 = await p.evaluate(() => document.querySelector('.a-modal-central .a-modal-texto')?.textContent || '');
  ok(tc5 === 'Si aún necesitas un taxi, llama a la central o pide otro.', `c5) sin motivo («${tc5}»)`);
  await p.waitForTimeout(3000);
  ok(solicitudes(t0).length === 0 && (await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'inicio', 'c5) al inicio, sin volver a pedir solo (no es «Ningún conductor aceptó»)');
  const h5 = (await historial(p, 'pasajero')).find((v) => v.id === v5);
  ok(h5?.estado === 'cancelado' && h5.motivo === 'Cancelado por la central', `c5) en «Mis viajes»: «${h5?.motivo}»`);
  await foto(p, 'c5-cancelado-por-la-central-0.7.0');
}

/* ------------------------------------------------------------------ */
/* d) Tarjeta «Actualizamos la política de privacidad» (S36)           */
/* ------------------------------------------------------------------ */
async function politica() {
  // Pasajero: entra con la casilla (acepta la vigente) → sin tarjeta. Con una sesión de antes (vio la 1.2) → la tarjeta.
  let { ctx, p } = await contexto('politica-pasajero', { politica: politica13() });
  await entrarPasajero(p);
  await p.waitForTimeout(2500);
  ok(!(await p.$('.a-modal-politica')), 'd1) quien entra aceptando la política vigente (1.3) no ve la tarjeta');
  ok((await p.evaluate(() => localStorage.getItem('taxicun.politica.vista'))) === '1.3', 'd1) queda anotada la 1.3');
  await p.evaluate(() => localStorage.setItem('taxicun.politica.vista', '1.2'));
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('.a-modal-politica.a-abierto .a-modal h2', { timeout: 15000 }))), 'd1) con una sesión de antes, al abrir: «Actualizamos la política de privacidad»');
  await p.waitForTimeout(450);
  ok(/^Desde el 20 de octubre de 2026, tu cooperativa usará un panel para despachar y supervisar el servicio\. Ahí ve la posición de los taxis en turno y los viajes con tu nombre abreviado; tu celular solo lo ve con un motivo, que queda registrado\. No se guarda un historial de recorridos\.$/.test(await texto(p, '.a-modal-politica .a-modal-texto')), 'd1) con la fecha y lo que cambia');
  const acc = await p.$$eval('.a-modal-politica .a-modal-acciones > *', (ns) => ns.map((n) => `${n.tagName}:${n.innerText.trim()}:${n.getAttribute('href') || ''}`));
  ok(acc.length === 2 && acc[0] === 'BUTTON:Entendido:' && /^A:Leer la política:.*privacidad\/$/.test(acc[1]), `d1) «Entendido» y «Leer la política» (${acc.join(' | ')})`);
  await foto(p, 'd1-politica-pasajero');
  await tocarModal(p, 'Entendido', 'a-modal-politica');
  ok((await p.evaluate(() => localStorage.getItem('taxicun.politica.vista'))) === '1.3', 'd1) «Entendido» la deja vista');
  await p.reload();
  await vista(p, 'inicio', 20000);
  await p.waitForTimeout(2500);
  ok(!(await p.$('.a-modal-politica')), 'd1) y no vuelve a salir');
  await ctx.close();

  // Conductor: «Acepto», solo fuera de turno.
  ({ ctx, p } = await contexto('politica-conductor', { politica: politica13() }));
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-politica')), 'd2) el conductor que entra («Al continuar aceptas…») no la ve');
  await p.evaluate(() => localStorage.setItem('taxicun.politica.vista', '1.2'));
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('.a-modal-politica.a-abierto .a-modal h2', { timeout: 15000 }))), 'd2) con una sesión de antes, fuera de turno: la tarjeta');
  ok((await texto(p, '.a-modal-politica .a-modal-acciones button')) === 'Acepto', 'd2) en la del conductor el botón dice «Acepto»');
  await foto(p, 'd2-politica-conductor');
  await tocarModal(p, 'Acepto', 'a-modal-politica');
  ok((await p.evaluate(() => localStorage.getItem('taxicun.politica.vista'))) === '1.3', 'd2) «Acepto» la deja vista');
  ok(await conectar(p), 'd2) en turno');
  await p.evaluate(() => localStorage.setItem('taxicun.politica.vista', '1.2'));
  const h0 = holas('conductor');
  cortar('conductor');
  await hasta(() => holas('conductor') > h0, 10000);
  await p.waitForTimeout(2500);
  ok(!(await p.$('.a-modal-politica')), 'd2) en turno no sale (no taparía una oferta)');
  await ctx.close();

  // Las demos (sin ?real=1) nunca.
  ({ ctx, p } = await contexto('politica-demo', { politica: politica13() }));
  await p.goto(`${BASE}taxicun/?e=cootransrural`);
  await p.waitForFunction(() => document.getElementById('carga')?.classList.contains('oculta') || !document.getElementById('carga'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(4000);
  await p.waitForTimeout(3000);
  ok(!(await p.$('.a-modal-politica')), 'd3) la demo no muestra la tarjeta');
  await ctx.close();
}

const ini = Date.now();
for (const [nombre, fn] of [['a', conductorWeb], ['b', conductorApp], ['c', pasajero], ['d', politica]]) {
  try {
    await fn();
  } catch (e) {
    ok(false, `${nombre}) se cortó: ${e.message.split('\n')[0]}`);
  }
}
ok(errores.length === 0, `sin errores de JavaScript (${errores.slice(0, 5).join(' | ')})`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · fase 3 (app) · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - ini) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
