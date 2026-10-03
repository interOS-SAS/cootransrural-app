// Prueba de la ubicación en turno con la app minimizada (plugin local «UbicacionTurno», diseño
// /tmp/cootrans/v12/DISENO-segundo-plano.md §3.2) con Capacitor simulado: window.Capacitor falso
// (addInitScript) con PushNotifications y UbicacionTurno, y el servidor de TaxiCun simulado aquí
// mismo (HTTP con page.route y el WebSocket /api/bus con routeWebSocket). El estado del plugin
// falso vive en localStorage (__ut): sobrevive a la recarga de la página, como el plugin nativo
// cuando se recarga el WebView sin que muera la app.
// Recorre:
//  a) iPhone 1.2 con el plugin y avisos: al ponerse en turno la primera vez, «Te avisamos…» y
//     después «Tu ubicación mientras estás conectado» ANTES de iniciar el seguimiento; «Entendido»
//     → iniciar({ url: …/api/conductor/ubicacion, token de la sesión, modo libre, libre }), marca
//     tc.turno.conductor, presencia con segundoPlano: true; minimizar libre (se cierra el bus, el
//     JS suelta su GPS y no manda nada); aceptar un viaje (modo viaje), minimizar en viaje (el bus
//     se cierra también y el JS no manda ubicación) y terminarlo (cancela el pasajero: modo libre);
//     el plugin se detiene por permiso (aviso, sin insistir) y vuelve al volver a la app; recarga
//     con el plugin activo (retoma el turno) y con el plugin muerto (no retoma); «Salir de turno»
//     en la notificación (desconecta y avisa); tope de 14 h; ubicación aproximada; Ajustes («Con la
//     app minimizada»: apagar y encender con el aviso otra vez); desconectarse y cerrar sesión
//     detienen el plugin.
//  b) Android sin avisos (sin Firebase o notificaciones negadas): el plugin no corre libre, solo
//     en los viajes (modo viaje, libre: false); el bus sigue abierto al minimizar en viaje, pero el
//     JS no duplica la ubicación; al terminar el viaje se detiene sin avisar a la central; Ajustes
//     dice «Solo durante los viajes» y trae la ayuda por marca.
//  c) «Ahora no»: el plugin no se inicia; Ajustes «Apagada»; no vuelve a preguntar.
//  d) App 1.2 (261) sin el plugin y la web (?real=1): nada de esto aparece ni cambia.
//
// Uso: node pruebas/segundo-plano.mjs [url_base]   (servidor estático del repositorio; p. ej.
//      python3 -m http.server 8961 → http://localhost:8961/). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8961/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/segundo-plano').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const CODIGO = '123456';
const TOKEN_C = 'c3d4'.repeat(16);
const URL_UBICACION = `${BASE}api/conductor/ubicacion`;

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
const srv = {
  n: 0,
  usuarios: new Map(),
  sesiones: new Map(), // token → correo
  dispositivos: new Map(),
  peticiones: [],
  hola: [],
  mensajes: [],
  ofertas: new Map(), // viajeId → solicitud pendiente
  viajes: new Map(), // correo del conductor → su servicio asignado (para viaje_actual)
  sockets: new Set(),
  cierres: [],
};
const crearUsuario = (correo) => {
  const u = { id: `u${++srv.n}`, correo, rol: 'conductor', nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: { ...CONDUCTOR } };
  srv.usuarios.set(correo, u);
  return u;
};
const yoDe = (correo) => {
  const u = srv.usuarios.get(correo);
  return { usuario: { id: u.id, correo: u.correo, nombre: u.nombre, celular: u.celular, rol: u.rol }, conductor: u.conductor };
};
const pide = (metodo, ruta) => srv.peticiones.filter((x) => x.metodo === metodo && x.ruta === ruta);

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
  const conSesion = (fn) => (correo && srv.usuarios.has(correo) ? fn() : responder(401, { error: 'sin_sesion' }));
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    if (cuerpo?.codigo !== CODIGO) return responder(400, { error: 'codigo_invalido' });
    const c = String(cuerpo.correo || '').toLowerCase();
    if (!srv.usuarios.has(c)) crearUsuario(c);
    const t = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
    srv.sesiones.set(t, c);
    return responder(200, { token: t, ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') {
    srv.sesiones.delete(token);
    return responder(200, { ok: true });
  }
  if (metodo === 'GET' && ruta === 'yo') return conSesion(() => responder(200, yoDe(correo)));
  if (ruta === 'yo/dispositivo' && metodo === 'PUT') return conSesion(() => {
    srv.dispositivos.set(cuerpo.token, { correo, app: cuerpo.app, plataforma: cuerpo.plataforma });
    return responder(200, { ok: true });
  });
  if (ruta === 'yo/dispositivo' && metodo === 'DELETE') return conSesion(() => {
    srv.dispositivos.delete(cuerpo?.token);
    return responder(200, { ok: true });
  });
  return responder(404, { error: 'no_existe' });
}

const enviar = (cx, tipo, datos, de = 'servidor') => {
  try {
    cx.ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de, ts: Date.now(), datos }));
  } catch {
    /* ya cerrado */
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
      if (!correo || !srv.usuarios.has(correo)) {
        enviar(cx, 'error', { codigo: 'sin_sesion' });
        ws.close({ code: 4401, reason: 'sin_sesion' });
        return;
      }
      cx.rol = 'conductor';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, t: Date.now() });
      const u = srv.usuarios.get(correo);
      enviar(cx, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 5, viajes: 0 } });
      enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (m.tipo === 'presencia') {
      const antes = cx.disponible;
      cx.disponible = Boolean(m.datos?.disponible);
      if (cx.disponible && !antes) for (const s of srv.ofertas.values()) enviar(cx, 'solicitud', s, s.pasajero.id);
    }
    if (m.tipo === 'consulta_solicitudes' && cx.disponible) for (const s of srv.ofertas.values()) enviar(cx, 'solicitud', s, s.pasajero.id);
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

const oferta = (viajeId, nombre = 'Marta') => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre, calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.002, lng: CENTRO.lng + 0.001, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
});
// Un pasajero pide: la oferta les llega a los conductores disponibles en línea.
function ofrecer(viajeId, nombre) {
  const s = oferta(viajeId, nombre);
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
}
// El pasajero cancela el servicio asignado.
function cancelaPasajero(viajeId) {
  for (const [correo, v] of srv.viajes) if (v.viajeId === viajeId) srv.viajes.delete(correo);
  for (const cx of srv.sockets) if (cx.rol === 'conductor') enviar(cx, 'cancelacion', { viajeId, por: 'pasajero', motivo: 'Ya no lo necesito' });
}

/* ------------------------------------------------------------------ */
/* Capacitor simulado                                                  */
/* ------------------------------------------------------------------ */
// cfg: { push, turno, plataforma, tokenPush }. Lo que debe durar entre recargas (el permiso de
// avisos, el estado del plugin UbicacionTurno) va en localStorage con prefijo «__».
function capacitorFalso(cfg) {
  // Seguimientos del GPS del JS (navigator.geolocation) vivos: para ver que se sueltan al minimizar.
  try {
    const g = navigator.geolocation;
    const ver = g.watchPosition.bind(g);
    const quitar = g.clearWatch.bind(g);
    window.__seguimientos = new Set();
    g.watchPosition = (...a) => {
      const id = ver(...a);
      window.__seguimientos.add(id);
      return id;
    };
    g.clearWatch = (id) => {
      window.__seguimientos.delete(id);
      return quitar(id);
    };
  } catch {
    /* sin geolocalización */
  }
  // La página carga con la app oculta (se recargó el WebView en segundo plano).
  if (localStorage.getItem('__ocultaAlCargar')) {
    window.__visibilidadFalsa = true;
    window.__oculta = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
  }
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const llamadas = (window.__llamadas = []);
  const anotar = (n, a) => {
    llamadas.push([n, a ?? null]);
    const todas = L('__todas') || [];
    todas.push([n, a ?? null]);
    L('__todas', todas);
  };
  const plugins = {};
  if (cfg.push) {
    const oyentes = {};
    plugins.PushNotifications = {
      async checkPermissions() {
        return { receive: L('__permisoPush') || 'prompt' };
      },
      async requestPermissions() {
        anotar('push.requestPermissions');
        const r = (L('__permisoPush') || 'prompt') === 'prompt' ? 'granted' : L('__permisoPush');
        L('__permisoPush', r);
        return { receive: r };
      },
      async register() {
        anotar('push.register');
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
  }
  if (cfg.turno) {
    const vacio = { activo: false, modo: null, libre: null, desde: null, motivo: '', precisa: true, url: null, token: null };
    const ut = () => ({ ...vacio, ...(L('__ut') || {}) });
    const publico = (e) => ({ activo: e.activo, modo: e.modo, motivo: e.motivo, precisa: e.precisa, desde: e.desde });
    const oyentesUt = [];
    // Como el nativo (taxicun-app, herramientas/nativo): notifyListeners('detenido', { motivo,
    // origen }, retainUntilConsumed: true), solo cuando el plugin se detiene solo.
    const origenDe = (m) => (m === 'turno_apagado' ? 'notificacion' : ['sin_sesion', 'conductor_no_aprobado', 'empresa_no_disponible', 'servidor'].includes(m) ? 'servidor' : 'sistema');
    const avisar = (motivo) => {
      const d = { motivo, origen: origenDe(motivo) };
      if (oyentesUt.length) oyentesUt.forEach((f) => f(d));
      else L('__utRetenido', d);
    };
    const error = (code, msj) => Object.assign(new Error(msj), { code });
    plugins.UbicacionTurno = {
      async iniciar(op) {
        anotar('ut.iniciar', op);
        if (L('__utSinPermiso')) throw error('SIN_PERMISO', 'Sin permiso');
        const e = ut();
        if (!e.activo && document.hidden) throw error('SEGUNDO_PLANO', 'App en segundo plano');
        if (!e.activo) e.desde = Date.now();
        Object.assign(e, { activo: true, modo: op.modo === 'viaje' ? 'viaje' : 'libre', libre: op.libre, url: op.url, token: op.token, motivo: '', precisa: !L('__utAproximada') });
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
          // Como el nativo: detener() pedido por la web NO dispara «detenido».
        }
        return publico(e);
      },
      async estado() {
        anotar('ut.estado');
        return publico(ut());
      },
      async addListener(ev, fn) {
        anotar(`ut.oyente.${ev}`);
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
    // El plugin se detiene solo: permiso, tope, botón «Salir de turno» de la notificación…
    window.__ut = {
      parar: (motivo) => {
        const e = ut();
        Object.assign(e, { activo: false, modo: null, desde: null, motivo });
        L('__ut', e);
        avisar(motivo);
      },
    };
  }
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

async function contexto(nombre, cfg) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.addInitScript(capacitorFalso, cfg);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') || '', sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const ls = (p, k) => p.evaluate((x) => localStorage.getItem(x), k);
// Llamadas al plugin en toda la prueba (sobreviven a las recargas): [[nombre, argumentos], …].
const llamadasUt = (p, nombre) => p.evaluate((x) => (JSON.parse(localStorage.getItem('__todas') || '[]')).filter(([n]) => n === x).map(([, a]) => a), nombre);
const ultima = async (p, nombre) => (await llamadasUt(p, nombre)).pop() || null;
const cuantas = async (p, nombre) => (await llamadasUt(p, nombre)).length;
const estadoUt = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__ut') || 'null'));
const seguimientosJs = (p) => p.evaluate(() => window.__seguimientos?.size ?? -1);
const enTurno = async (p) => (await p.getAttribute('[data-conectar]', 'aria-checked').catch(() => null)) === 'true';
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].some((t) => new RegExp(f).test(t.innerText)), re.source, { timeout }));
const msjDesde = (i, tipo) => srv.mensajes.slice(i).filter((m) => m.rol === 'conductor' && m.tipo === tipo);
const cierres = () => srv.cierres.filter((c) => c.rol === 'conductor').length;
const holas = () => srv.hola.filter((h) => h.rol === 'conductor').length;

async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function tocarModal(p, textoBoton) {
  const sel = `.a-modal button:has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(300);
  await p.click(sel);
  await p.waitForTimeout(350);
}
// La app pasa a segundo plano (oculta = true) o vuelve (false); al volver, el reloj se adelanta
// «adelanto» ms solo durante el evento (como si hubiera estado fuera ese tiempo).
async function visibilidad(p, oculta, adelanto = 0) {
  await p.evaluate(({ oculta: o, adelanto: ms }) => {
    if (!window.__visibilidadFalsa) {
      window.__visibilidadFalsa = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
    }
    const real = Date.now;
    if (ms) Date.now = () => real() + ms;
    window.__oculta = o;
    document.dispatchEvent(new Event('visibilitychange'));
    Date.now = real;
  }, { oculta, adelanto });
}
async function abrirAjustes(p) {
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Ajustes")');
  await p.waitForSelector('.a-panel.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(700);
}
async function cerrarPanel(p) {
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(450);
}
async function entrar(p, correo) {
  await p.goto(`${BASE}taxicun/conductor/`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(600);
}
// Le llega una oferta y la acepta: «Recoge a …».
async function aceptarViaje(p, viajeId, nombre = 'Marta') {
  ofrecer(viajeId, nombre);
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.click('.a-solicitud [data-aceptar]');
  return intento(vista(p, 'hacia_origen', 15000));
}
// Mueve el GPS del navegador un poco (unos 100 m) para que el JS lea una posición nueva.
let paso = 0;
async function moverGps(ctx) {
  paso += 1;
  await ctx.setGeolocation({ latitude: CENTRO.lat + 0.0009 * paso, longitude: CENTRO.lng + 0.0004 * paso, accuracy: 10 });
}

/* ------------------------------------------------------------------ */
/* a) iPhone 1.2 con el plugin y avisos                                */
/* ------------------------------------------------------------------ */
const LUIS = 'luis@prueba.taxicun.com';
async function iphone() {
  const { ctx, p } = await contexto('iphone', { push: true, turno: true, plataforma: 'ios', tokenPush: TOKEN_C });
  await entrar(p, LUIS);
  ok((await cuantas(p, 'ut.oyente.detenido')) >= 1, 'iphone: el núcleo escucha «detenido» del plugin desde que carga');
  ok((await cuantas(p, 'ut.iniciar')) === 0, 'iphone: con la sesión, fuera de turno, el plugin no se inicia');

  // Primera vez en turno: avisos y después el aviso de la ubicación, ANTES de iniciar.
  await p.click('[data-conectar]');
  await tocarModal(p, 'Activar avisos');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-segundo-plano .a-modal h2:has-text("Tu ubicación mientras estás conectado")', { timeout: 8000 }))), 'iphone: después de los avisos, «Tu ubicación mientras estás conectado»');
  const textoModal = await texto(p, '.a-modal-segundo-plano .a-modal');
  ok(/sigue enviando tu ubicación aunque uses WhatsApp, Waze u otra app, o bloquees el teléfono/.test(textoModal), 'iphone: el aviso dice que sigue enviando la ubicación aunque use WhatsApp o Waze o bloquee el teléfono');
  ok(/La ven la central y el pasajero de tu servicio; los demás pasajeros de tu cooperativa solo ven una posición aproximada de tu taxi\. No guardamos tu recorrido/.test(textoModal) && /indicador azul/.test(textoModal) && !/notificación fija/.test(textoModal) && /desconéctate o cierra la app/.test(textoModal), 'iphone: quién la ve, el indicador azul (sin la notificación de Android) y cómo se detiene');
  ok((await cuantas(p, 'ut.iniciar')) === 0 && !(await enTurno(p)), 'iphone: con el aviso en pantalla el seguimiento aún no arranca ni queda en turno');
  await p.waitForTimeout(300);
  await foto(p, 'a01-aviso-segundo-plano');
  await tocarModal(p, 'Entendido');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'iphone: «Entendido» → queda en turno');
  const ini = await hasta(() => ultima(p, 'ut.iniciar'), 8000);
  const token = await ls(p, 'taxicun.token');
  ok(ini?.url === URL_UBICACION && ini.token === token && ini.modo === 'libre' && ini.libre === true, `iphone: iniciar({ url: …/api/conductor/ubicacion, token de la sesión, modo libre, libre: true }) (${JSON.stringify(ini && { ...ini, token: ini.token === token ? 'el de la sesión' : ini.token })})`);
  ok((await ls(p, 'taxicun.turno.aviso')) === '1' && Boolean(JSON.parse((await ls(p, 'tc.turno.conductor')) || 'null')?.desde), 'iphone: guarda que aceptó (taxicun.turno.aviso) y la marca del turno (tc.turno.conductor)');
  ok(Boolean(await hasta(() => srv.mensajes.some((m) => m.tipo === 'presencia' && m.datos?.disponible === true && m.datos?.segundoPlano === true), 6000)), 'iphone: la presencia sale con segundoPlano: true');
  ok(/Puedes usar otras apps o bloquear el celular/.test(await texto(p, '[data-ayuda-turno]')), 'iphone: la ayuda ya no pide dejar la app abierta');
  await foto(p, 'a02-en-turno');

  // Minimizar libre: se cierra el bus, el JS suelta su GPS y no manda nada.
  await p.waitForTimeout(600);
  ok((await seguimientosJs(p)) === 1, 'iphone: en turno, el JS sigue el GPS (un seguimiento)');
  let c0 = cierres();
  let m0 = srv.mensajes.length;
  const dOculta = await cuantas(p, 'ut.detener');
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => cierres() > c0, 4000)), 'iphone: libre y minimizada, se cierra el WebSocket');
  ok(Boolean(await hasta(async () => (await seguimientosJs(p)) === 0, 3000)), 'iphone: minimizada, el JS suelta su seguimiento del GPS (lee el plugin)');
  await moverGps(ctx);
  await p.waitForTimeout(2500);
  ok(!msjDesde(m0, 'presencia').length && !msjDesde(m0, 'ubicacion').length, 'iphone: minimizada no manda presencia ni ubicación por el bus (ni «disponible: false»)');
  ok((await cuantas(p, 'ut.detener')) === dOculta && (await estadoUt(p))?.activo === true, 'iphone: el plugin sigue activo (minimizar no lo detiene)');
  let h0 = holas();
  m0 = srv.mensajes.length;
  await visibilidad(p, false, 40000);
  ok(Boolean(await hasta(() => holas() > h0, 6000)), 'iphone: al volver se reconecta');
  ok(Boolean(await hasta(() => msjDesde(m0, 'presencia').some((m) => m.datos?.disponible === true && m.datos?.segundoPlano === true), 6000)), 'iphone: y manda la presencia (disponible, segundoPlano)');
  ok(Boolean(await hasta(async () => (await seguimientosJs(p)) === 1, 6000)), 'iphone: al volver, el JS vuelve a seguir el GPS');

  // Viaje: modo viaje; minimizar también cierra el bus y el JS no manda la ubicación.
  ok(await aceptarViaje(p, 'v-1', 'Marta'), 'iphone: acepta un viaje → «Recoge a Marta»');
  const modoViaje = await hasta(async () => (await llamadasUt(p, 'ut.cambiarModo')).find((a) => a?.modo === 'viaje'), 6000);
  ok(Boolean(modoViaje) && modoViaje.libre === true, `iphone: el plugin pasa a modo viaje (${JSON.stringify(modoViaje)})`);
  await p.waitForTimeout(800);
  c0 = cierres();
  m0 = srv.mensajes.length;
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => cierres() > c0, 4000)), 'iphone: con el viaje en curso y el plugin activo, minimizar también cierra el WebSocket');
  await moverGps(ctx);
  await p.waitForTimeout(1500);
  await moverGps(ctx);
  await p.waitForTimeout(2000);
  ok(!msjDesde(m0, 'ubicacion').length && !msjDesde(m0, 'presencia').length, 'iphone: en viaje y minimizada, el JS no manda la ubicación (la manda el plugin)');
  ok((await seguimientosJs(p)) === 0, 'iphone: en viaje y minimizada, el JS no sigue el GPS');
  await foto(p, 'a03-viaje');
  h0 = holas();
  m0 = srv.mensajes.length;
  await visibilidad(p, false, 30000);
  ok(Boolean(await hasta(() => holas() > h0, 6000)), 'iphone: al volver en viaje se reconecta');
  await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'hacia_origen'), 'iphone: y sigue en el viaje (viaje_actual)');
  await moverGps(ctx);
  await p.waitForTimeout(2200);
  await moverGps(ctx);
  ok(Boolean(await hasta(() => msjDesde(m0, 'ubicacion').length > 0, 8000)), 'iphone: a la vista, la ubicación del viaje vuelve a salir por el bus');
  // El pasajero cancela: modo libre.
  const cm0 = await cuantas(p, 'ut.cambiarModo');
  cancelaPasajero('v-1');
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'iphone: el pasajero cancela → libre');
  const modoLibre = await hasta(async () => (await llamadasUt(p, 'ut.cambiarModo')).slice(cm0).find((a) => a?.modo === 'libre'), 6000);
  ok(Boolean(modoLibre), 'iphone: el plugin vuelve a modo libre');
  ok((await estadoUt(p))?.activo === true && (await enTurno(p)), 'iphone: sigue en turno con el plugin activo');

  // El plugin se detiene por permiso: aviso, y no se insiste mientras el permiso siga negado.
  await p.evaluate(() => localStorage.setItem('__utSinPermiso', 'true'));
  const i0 = await cuantas(p, 'ut.iniciar');
  await p.evaluate(() => window.__ut.parar('permiso'));
  ok(await conAviso(p, /Sin permiso de ubicación/), 'iphone: «detenido» por permiso → «Sin permiso de ubicación · Actívalo en Ajustes para seguir conectado.»');
  ok(/Actívalo en Ajustes para seguir conectado/.test(await texto(p, '.a-avisos')), 'iphone: con el texto del diseño');
  await p.waitForTimeout(2500);
  const reintentos = (await cuantas(p, 'ut.iniciar')) - i0;
  ok(reintentos <= 1, `iphone: no insiste con el permiso negado (${reintentos} intento)`);
  await foto(p, 'a04-sin-permiso');
  await p.evaluate(() => localStorage.removeItem('__utSinPermiso'));
  await visibilidad(p, true);
  await p.waitForTimeout(300);
  await visibilidad(p, false, 5000);
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === true, 6000)), 'iphone: con el permiso de vuelta, al volver a la app el plugin arranca otra vez');

  // Recarga con el plugin activo (la app no murió): retoma el turno sin tocar nada.
  await p.evaluate(() => localStorage.setItem('__utAproximada', 'true'));
  const desde = (await estadoUt(p))?.desde;
  const dRecarga = await cuantas(p, 'ut.detener');
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 30000 }))), 'iphone: recarga con el plugin activo → retoma el turno solo');
  ok(Boolean(await hasta(() => srv.mensajes.slice(-30).some((m) => m.tipo === 'presencia' && m.datos?.disponible === true && m.datos?.segundoPlano === true), 8000)), 'iphone: y vuelve a anunciarse disponible (segundoPlano)');
  const tras = await estadoUt(p);
  ok(tras?.activo === true && tras?.desde === desde, `iphone: el mismo seguimiento sigue (no se reinició: misma hora de inicio)${tras?.desde === desde ? '' : ` ${desde} → ${tras?.desde}; llamadas: ${JSON.stringify((await p.evaluate(() => JSON.parse(localStorage.getItem('__todas') || '[]'))).slice(-12))}`}`);
  ok((await ultima(p, 'ut.iniciar'))?.token === (await ls(p, 'taxicun.token')), 'iphone: al plugin se le pasa otra vez el token de la sesión');
  ok((await cuantas(p, 'ut.detener')) === dRecarga, 'iphone: mientras el token de los avisos vuelve a llegar al servidor, no lo detiene');
  ok(await conAviso(p, /Ubicación exacta/), 'iphone: con la ubicación aproximada → «Activa «Ubicación exacta»»');
  await foto(p, 'a05-recarga-retoma');
  await p.evaluate(() => localStorage.removeItem('__utAproximada'));

  // «Salir de turno» en la notificación (con la app minimizada): al volver, fuera de turno y el aviso.
  await p.waitForTimeout(800);
  await visibilidad(p, true);
  const iSalir = await cuantas(p, 'ut.iniciar');
  await p.evaluate(() => window.__ut.parar('turno_apagado'));
  await p.waitForTimeout(800);
  await visibilidad(p, false, 8000);
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 }))), 'iphone: «Salir de turno» de la notificación → fuera de turno');
  ok(await conAviso(p, /Te desconectaste desde la notificación/), 'iphone: «Te desconectaste desde la notificación.»');
  await p.waitForTimeout(1200);
  ok((await cuantas(p, 'ut.iniciar')) === iSalir && !(await ls(p, 'tc.turno.conductor')), 'iphone: no lo vuelve a iniciar y borra la marca');
  ok(srv.mensajes.slice(-10).some((m) => m.tipo === 'presencia' && m.datos?.disponible === false), 'iphone: la central sabe que salió de turno (presencia no disponible)');
  await foto(p, 'a06-salir-desde-notificacion');

  // Recarga con la app oculta y el seguimiento vivo: no lo toca hasta volver; al volver, retoma.
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(async () => (await estadoUt(p))?.activo === true, 6000);
  const desdeOculta = (await estadoUt(p))?.desde;
  const dOcultaRecarga = await cuantas(p, 'ut.detener');
  await p.evaluate(() => localStorage.setItem('__ocultaAlCargar', '1'));
  await p.reload();
  await p.waitForSelector('[data-conectar]', { timeout: 30000 });
  await p.evaluate(() => localStorage.removeItem('__ocultaAlCargar'));
  await p.waitForTimeout(3000);
  ok(!(await enTurno(p)) && (await estadoUt(p))?.activo === true && (await cuantas(p, 'ut.detener')) === dOcultaRecarga, 'iphone: recarga con la app oculta → no retoma todavía ni detiene el plugin');
  await visibilidad(p, false, 2000);
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'iphone: al volver a la app, retoma el turno');
  await p.waitForTimeout(800);
  ok((await estadoUt(p))?.desde === desdeOculta && (await cuantas(p, 'ut.detener')) === dOcultaRecarga, 'iphone: con el mismo seguimiento (sin detenerlo)');
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });

  // La notificación «Salir de turno» con el WebView muerto (la app sigue viva): el plugin retiene
  // «detenido» y la marca sigue; al cargar se avisa una sola vez y arranca fuera de turno.
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(async () => (await estadoUt(p))?.activo === true, 6000);
  await p.evaluate(() => {
    localStorage.setItem('__ut', JSON.stringify({ activo: false, motivo: 'turno_apagado' }));
    localStorage.setItem('__utRetenido', JSON.stringify({ motivo: 'turno_apagado' }));
  });
  const iRet = await cuantas(p, 'ut.iniciar');
  await p.reload();
  ok(await conAviso(p, /Te desconectaste desde la notificación/, 30000), 'iphone: «Salir de turno» con la página caída → al cargar, «Te desconectaste desde la notificación.»');
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(1500);
  const veces = await p.evaluate(() => [...document.querySelectorAll('.a-avisos .a-toast')].filter((t) => /desconectaste desde la notificación/.test(t.innerText)).length);
  ok(veces === 1, `iphone: el aviso sale una sola vez (evento retenido + revisión al cargar) (${veces})`);
  ok(!(await enTurno(p)) && !(await ls(p, 'tc.turno.conductor')) && (await cuantas(p, 'ut.iniciar')) === iRet, 'iphone: arranca fuera de turno, sin marca y sin reiniciar el plugin');

  // Otra vez en turno (sin preguntar) y la app muere: al abrir arranca fuera de turno.
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))) && !(await p.$('.a-modal')), 'iphone: la segunda vez se pone en turno sin avisos');
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === true, 6000)), 'iphone: y el plugin arranca');
  await p.evaluate(() => localStorage.setItem('__ut', JSON.stringify({ activo: false, motivo: '' }))); // el sistema mató la app
  await p.reload();
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 });
  await p.waitForTimeout(2000);
  ok(!(await enTurno(p)) && !(await ls(p, 'tc.turno.conductor')), 'iphone: con la app cerrada (plugin muerto), al abrir arranca fuera de turno y borra la marca');
  ok(!(await p.evaluate(() => /desconectaste/.test(document.querySelector('.a-avisos')?.innerText || ''))), 'iphone: sin avisos de desconexión');

  // Tope de 14 h: lo saca de turno.
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(async () => (await estadoUt(p))?.activo === true, 6000);
  await p.evaluate(() => window.__ut.parar('tope'));
  ok(await conAviso(p, /Tu turno se cerró después de 14 horas/), 'iphone: tope → «Tu turno se cerró después de 14 horas»');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 6000 }))), 'iphone: y queda fuera de turno');

  // Ajustes: «Con la app minimizada».
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(async () => (await estadoUt(p))?.activo === true, 6000);
  await abrirAjustes(p);
  const sec = await texto(p, '.a-panel.a-abierto [data-segundo-plano]');
  ok(/Ubicación con la app minimizada/.test(sec) && /Activa ·/.test(sec), `iphone: Ajustes «Ubicación con la app minimizada: Activa» (${sec.slice(0, 120)})`);
  ok(/Ahora la estás compartiendo/.test(sec) && !(await p.$('.a-panel.a-abierto [data-sp-marcas]')), 'iphone: dice que ahora la está compartiendo; sin la ayuda por marca de Android');
  await foto(p, 'a07-ajustes');
  const d0 = await cuantas(p, 'ut.detener');
  await p.click('[aria-labelledby="a-aj-segundo-plano"]');
  const det = await hasta(async () => (await llamadasUt(p, 'ut.detener')).slice(d0).pop(), 6000);
  ok(det?.motivo === 'ajustes' && det.avisar === false, `iphone: apagarlo detiene el plugin sin avisar a la central (${JSON.stringify(det)})`);
  ok((await ls(p, 'taxicun.turno.aviso')) === '0' && (await enTurno(p)), 'iphone: queda apagado y sigue en turno (con la app abierta)');
  const secApagada = await hasta(async () => {
    const t = await texto(p, '.a-panel.a-abierto [data-segundo-plano]');
    return /Apagada/.test(t) ? t : null;
  }, 3000);
  ok(Boolean(secApagada), `iphone: Ajustes dice «Apagada» (${secApagada || await texto(p, '.a-panel.a-abierto [data-segundo-plano]')})`);
  await p.click('[aria-labelledby="a-aj-segundo-plano"]');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-segundo-plano .a-modal h2', { timeout: 6000 }))), 'iphone: encenderlo muestra otra vez el aviso');
  await tocarModal(p, 'Entendido');
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === true, 6000)) && (await ls(p, 'taxicun.turno.aviso')) === '1', 'iphone: «Entendido» lo enciende y el plugin arranca');
  ok((await p.getAttribute('[aria-labelledby="a-aj-segundo-plano"]', 'aria-checked')) === 'true', 'iphone: el interruptor queda encendido');
  await cerrarPanel(p);

  // Desconectarse: detener con aviso a la central y sin marca.
  const d1 = await cuantas(p, 'ut.detener');
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });
  const det2 = await hasta(async () => (await llamadasUt(p, 'ut.detener')).slice(d1).pop(), 6000);
  ok(det2?.motivo === 'turno_apagado' && det2.avisar === true && !(await ls(p, 'tc.turno.conductor')), `iphone: desconectarse → detener({ motivo: turno_apagado, avisar: true }) y sin marca (${JSON.stringify(det2)})`);
  ok(!(await p.evaluate(() => /desconectaste desde la notificación/.test(document.querySelector('.a-avisos')?.innerText || ''))), 'iphone: sin el aviso de la notificación (lo pidió la app)');
  ok((await texto(p, '[data-ayuda-turno]')).length > 0, 'iphone: la vista libre sigue con su ayuda');

  // En turno y cierra sesión: el plugin se detiene.
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(async () => (await estadoUt(p))?.activo === true, 6000);
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(p, 'Cerrar sesión');
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 10000 });
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === false, 6000)) && !(await ls(p, 'tc.turno.conductor')), 'iphone: cerrar sesión detiene el plugin y borra la marca');
  const det3 = (await llamadasUt(p, 'ut.detener')).filter((a) => a?.motivo === 'turno_apagado').pop();
  ok(det3?.avisar === true, 'iphone: con el último aviso a la central (la sesión seguía viva)');

  // La sesión vence a mitad del turno: el plugin recibe 401 y se detiene (sin_sesion) → al ingreso.
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(600);
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  ok(Boolean(await hasta(async () => (await estadoUt(p))?.activo === true, 8000)), 'iphone: entra otra vez y en turno el plugin arranca sin preguntar');
  srv.sesiones.delete(await ls(p, 'taxicun.token'));
  await p.evaluate(() => window.__ut.parar('sin_sesion'));
  ok(Boolean(await intento(p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 10000 }))), 'iphone: «detenido» por sin_sesion → vuelve al ingreso');
  ok(await conAviso(p, /Tu sesión se cerró/), 'iphone: «Tu sesión se cerró»');
  ok(!(await ls(p, 'tc.turno.conductor')) && (await estadoUt(p))?.activo === false, 'iphone: sin marca y con el plugin detenido');
  await foto(p, 'a08-sin-sesion');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) Android sin avisos                                               */
/* ------------------------------------------------------------------ */
const PEDRO = 'pedro@prueba.taxicun.com';
async function androidSinAvisos() {
  const { ctx, p } = await contexto('android sin avisos', { push: false, turno: true, plataforma: 'android' });
  await entrar(p, PEDRO);
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-segundo-plano .a-modal h2:has-text("Tu ubicación mientras estás conectado")', { timeout: 8000 }))), 'android: sin avisos, sale directo el aviso de la ubicación');
  const t = await texto(p, '.a-modal-segundo-plano .a-modal');
  ok(/notificación fija «Estás en turno»/.test(t) && /salir de turno cuando no tengas un servicio en curso/.test(t) && !/indicador azul/.test(t), 'android: menciona la notificación fija «Estás en turno» (y salir desde ahí sin un servicio en curso), no el indicador azul');
  await foto(p, 'b01-aviso-android');
  await tocarModal(p, 'Entendido');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok((await cuantas(p, 'ut.iniciar')) === 0, 'android: libre y sin avisos, el plugin NO corre (no se vería en el mapa un taxi que no se entera)');
  ok(/deja la app abierta/.test(await texto(p, '[data-ayuda-turno]')), 'android: la ayuda sigue pidiendo la app abierta');
  await abrirAjustes(p);
  const sec = await texto(p, '.a-panel.a-abierto [data-segundo-plano]');
  ok(/Solo durante los viajes/.test(sec), 'android: Ajustes «Solo durante los viajes»');
  ok(/Samsung/.test(sec) && /Aplicaciones en suspensión/.test(sec) && /Xiaomi/.test(sec) && /Sin restricciones/.test(sec), 'android: Ajustes trae la ayuda por marca (Samsung, Xiaomi…)');
  await p.evaluate(() => document.querySelector('.a-panel.a-abierto [data-segundo-plano]')?.scrollIntoView());
  await foto(p, 'b02-ajustes-android');
  await cerrarPanel(p);

  ok(await aceptarViaje(p, 'v-2', 'Rosa'), 'android: acepta un viaje');
  const ini = await hasta(() => ultima(p, 'ut.iniciar'), 6000);
  ok(ini?.modo === 'viaje' && ini.libre === false, `android: en el viaje el plugin arranca en modo viaje, libre: false (${JSON.stringify(ini && { modo: ini.modo, libre: ini.libre })})`);
  await p.waitForTimeout(800);
  const c0 = cierres();
  const m0 = srv.mensajes.length;
  await visibilidad(p, true);
  await moverGps(ctx);
  await p.waitForTimeout(1500);
  await moverGps(ctx);
  await p.waitForTimeout(2000);
  ok(cierres() === c0, 'android: sin avisos el WebSocket sigue abierto al minimizar (único camino para enterarse de una cancelación)');
  ok(!msjDesde(m0, 'ubicacion').length && !msjDesde(m0, 'presencia').length, 'android: pero el JS no duplica la ubicación ni la presencia (la manda el plugin)');
  ok((await seguimientosJs(p)) === 0, 'android: y suelta su GPS (con el servicio en primer plano seguiría leyendo)');
  const m1 = srv.mensajes.length;
  await visibilidad(p, false, 5000);
  await moverGps(ctx);
  await p.waitForTimeout(2200);
  await moverGps(ctx);
  ok(Boolean(await hasta(() => msjDesde(m1, 'ubicacion').length > 0, 8000)), 'android: al volver, la ubicación sale otra vez por el bus');
  const d0 = await cuantas(p, 'ut.detener');
  cancelaPasajero('v-2');
  await vista(p, 'libre', 10000).catch(() => {});
  const det = await hasta(async () => (await llamadasUt(p, 'ut.detener')).slice(d0).pop(), 6000);
  ok(det?.motivo === 'sin_viaje' && det.avisar === false, `android: termina el viaje → se detiene sin avisar a la central (${JSON.stringify(det)})`);
  ok(await enTurno(p), 'android: y sigue en turno con la app abierta');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) «Ahora no»                                                       */
/* ------------------------------------------------------------------ */
const ANDRES = 'andres@prueba.taxicun.com';
async function ahoraNo() {
  const { ctx, p } = await contexto('ahora no', { push: true, turno: true, plataforma: 'ios', tokenPush: 'e5f6'.repeat(16) });
  await entrar(p, ANDRES);
  await p.click('[data-conectar]');
  await tocarModal(p, 'Activar avisos');
  await tocarModal(p, 'Ahora no');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), '«Ahora no»: queda en turno igual');
  await p.waitForTimeout(1500);
  ok((await cuantas(p, 'ut.iniciar')) === 0 && (await ls(p, 'taxicun.turno.aviso')) === '0', '«Ahora no»: el plugin no se inicia y queda guardado');
  ok(!srv.mensajes.some((m) => m.correo === ANDRES && m.datos?.segundoPlano), '«Ahora no»: la presencia no lleva segundoPlano');
  // Como la 1.2: libre con avisos, minimizar cierra el bus; en viaje no.
  const c0 = cierres();
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => cierres() > c0, 4000)), '«Ahora no»: libre con avisos, minimizar cierra el WebSocket (como la 1.2)');
  await visibilidad(p, false, 5000);
  await hasta(() => srv.sockets.size > 0, 6000);
  await p.waitForTimeout(800);
  ok(await aceptarViaje(p, 'v-3', 'Elena'), '«Ahora no»: acepta un viaje');
  await p.waitForTimeout(800);
  const c1 = cierres();
  await visibilidad(p, true);
  await p.waitForTimeout(1500);
  ok(cierres() === c1 && (await cuantas(p, 'ut.iniciar')) === 0, '«Ahora no»: en viaje el WebSocket sigue abierto y el plugin no corre (como la 1.2)');
  await visibilidad(p, false, 3000);
  cancelaPasajero('v-3');
  await vista(p, 'libre', 10000).catch(() => {});
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });
  await p.waitForTimeout(500);
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  ok(!(await p.$('.a-modal')), '«Ahora no»: no vuelve a preguntar al ponerse en turno');
  await abrirAjustes(p);
  ok(/Apagada/.test(await texto(p, '.a-panel.a-abierto [data-segundo-plano]')) && (await p.getAttribute('[aria-labelledby="a-aj-segundo-plano"]', 'aria-checked')) === 'false', '«Ahora no»: Ajustes «Apagada», con el interruptor apagado');
  await cerrarPanel(p);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* d) Sin el plugin: la 1.2 (261) y la web                             */
/* ------------------------------------------------------------------ */
const JUAN = 'juan@prueba.taxicun.com';
async function sinPlugin() {
  const { ctx, p } = await contexto('1.2 (261) sin el plugin', { push: true, turno: false, plataforma: 'ios', tokenPush: '7a8b'.repeat(16) });
  await entrar(p, JUAN);
  await p.click('[data-conectar]');
  await tocarModal(p, 'Activar avisos');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))) && !(await p.$('.a-modal-segundo-plano')), '1.2 (261): en turno sin el aviso de la ubicación');
  ok(/deja la app abierta/.test(await texto(p, '[data-ayuda-turno]')), '1.2 (261): la ayuda de siempre');
  await abrirAjustes(p);
  ok(!(await p.$('.a-panel.a-abierto [data-segundo-plano]')), '1.2 (261): Ajustes sin «Con la app minimizada»');
  await cerrarPanel(p);
  ok(await aceptarViaje(p, 'v-4', 'Lucía'), '1.2 (261): acepta un viaje');
  await p.waitForTimeout(800);
  const c0 = cierres();
  const m0 = srv.mensajes.length;
  await visibilidad(p, true);
  await moverGps(ctx);
  await p.waitForTimeout(2500);
  ok(cierres() === c0, '1.2 (261): en viaje el WebSocket sigue abierto al minimizar (como hoy)');
  ok(msjDesde(m0, 'ubicacion').length > 0, '1.2 (261): y el JS sigue mandando la ubicación del viaje (como hoy)');
  await visibilidad(p, false, 3000);
  cancelaPasajero('v-4');
  ok(!srv.mensajes.some((m) => m.correo === JUAN && m.datos?.segundoPlano), '1.2 (261): la presencia nunca lleva segundoPlano');
  ok(await p.evaluate(() => !(window.__llamadas || []).some(([n]) => n.startsWith('ut.'))), '1.2 (261): ninguna llamada a UbicacionTurno');
  await ctx.close();

  // La web (?real=1, sin Capacitor).
  const w = await contexto('web ?real=1', null);
  await w.p.goto(`${BASE}taxicun/conductor/?real=1`);
  await w.p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await w.p.fill('.a-ingreso-real input[name=correo]', JUAN);
  await w.p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(w.p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await w.p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await w.p.waitForTimeout(600);
  await w.p.click('[data-conectar]');
  ok(Boolean(await intento(w.p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))) && !(await w.p.$('.a-modal')), 'web: en turno sin avisos ni aviso de la ubicación');
  await abrirAjustes(w.p);
  ok(!(await w.p.$('.a-panel.a-abierto [data-segundo-plano]')), 'web: Ajustes sin «Con la app minimizada»');
  await cerrarPanel(w.p);
  ok(!(await ls(w.p, 'tc.turno.conductor')) && !(await ls(w.p, 'taxicun.turno.aviso')), 'web: no guarda nada del turno nativo');
  await w.ctx.close();
}

const inicio = Date.now();
// SOLO=iphone|android|ahora|sin: una sola parte (para depurar).
const SOLO = process.env.SOLO || '';
try {
  if (!SOLO || SOLO === 'iphone') await iphone();
  if (!SOLO || SOLO === 'android') await androidSinAvisos();
  if (!SOLO || SOLO === 'ahora') await ahoraNo();
  if (!SOLO || SOLO === 'sin') await sinPlugin();
} catch (e) {
  console.error(e);
  ok(false, `la prueba se cortó: ${e.message}`);
}
ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 5).join(' | ')}` : ''}`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · ubicación en turno (segundo plano) · ${bien} ✔ · ${fallas} fallas · ${Math.round((Date.now() - inicio) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
