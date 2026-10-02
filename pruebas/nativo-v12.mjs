// Prueba de la app nativa 1.2 (notificaciones push y Face ID) con Capacitor simulado:
// window.Capacitor falso (addInitScript) con PushNotifications y NativeBiometric, y el
// servidor de TaxiCun simulado aquí mismo con las interfaces del diseño 1.2:
//   HTTP (page.route): auth/codigo, auth/entrar, auth/llave, auth/salir, yo (GET/PATCH/DELETE),
//                      yo/dispositivo (PUT/DELETE), yo/llave (POST) y yo/llave/:id (DELETE)
//   WebSocket (routeWebSocket /api/bus): hola → bienvenida + viaje_actual; presencia y
//                      consulta_solicitudes del conductor → las solicitudes pendientes
// Recorre:
//  a) pasajero: nada se pide al abrir; entra con código → «¿Entrar con Face ID…?» → llave
//     (POST yo/llave + setCredentials); pide su primer taxi → «¿Te avisamos…?» → permiso,
//     register y PUT yo/dispositivo; tocar un aviso trae el viaje a la vista; Ajustes →
//     Seguridad («Entrar con Face ID», «Pedir Face ID al abrir la app»); bloqueo al volver
//     tras más de 60 s y al abrir; cerrar sesión (DELETE yo/dispositivo, la llave queda);
//     «Entrar con Face ID» (POST auth/llave); llave revocada → llave_invalida → al código;
//     eliminar la cuenta borra credenciales y bloqueo.
//  b) conductor: «Entrar con Face ID» no aparece sin llave; al ponerse en turno la primera
//     vez → «Te avisamos de servicios nuevos…» → PUT yo/dispositivo (app conductor); la app
//     abierta desde «Nuevo servicio» (toque retenido) vuelve a ponerse en turno y muestra la
//     oferta; un aviso de una oferta que ya no está → «Ese servicio ya no está disponible»;
//     un aviso con la app abierta reconecta; «¿No puedes? Cierra sesión» desde el bloqueo.
//  c) sin los plugins (app 1.0, build 221) y en la web (?real=1): nada de esto aparece.
//
// Uso: node pruebas/nativo-v12.mjs [url_base]   (servidor estático del repositorio; p. ej.
//      python3 -m http.server 8823 → http://localhost:8823/). Capturas en $CAPTURAS.
//
// --real: contra el servidor de verdad (rama v1.2, 0.3.0) por el proxy de mismo origen, sin
// simular /api. Revisa en la base (psql) los dispositivos, las llaves y el conductor «dormido».
//   servidor:  DATABASE_URL=… CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790" … node src/index.js
//   proxy:     node pruebas/servidor-local.mjs --puerto=8824 --api=http://127.0.0.1:3398
//   prueba:    DATABASE_URL=… SERVIDOR_TAXICUN=<árbol del servidor> node pruebas/nativo-v12.mjs http://localhost:8824/ --real
// El servidor deja «dormido» al conductor solo con push configurado (APNS_* o FCM): sin eso (lo
// normal en local) se revisa que se comporte como la 0.2; con PUSH_CONFIGURADO=1, que lo duerma.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8823/').replace(/\/?$/, '/');
const CONTRA_SERVIDOR = process.argv.includes('--real');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/nativo-v12').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const CODIGO = '123456';
// Tokens de APNs: hexadecimales, como los pide el servidor 0.3.0 (token_invalido si no).
const TOKEN_P = 'a1b2'.repeat(16);
const TOKEN_C = 'c3d4'.repeat(16);

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
/* Servidor de TaxiCun simulado (interfaces del diseño 1.2)            */
/* ------------------------------------------------------------------ */
const CUENTAS = {
  'ana@prueba.taxicun.com': { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
  'luis@prueba.taxicun.com': {
    nombre: 'Luis Alberto Rodríguez', celular: '3109876543',
    conductor: { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' },
  },
};
const srv = {
  n: 0,
  usuarios: new Map(),
  sesiones: new Map(), // token → correo
  dispositivos: new Map(), // token push → { correo, app, plataforma, entorno }
  llaves: new Map(), // id → { correo, secreto, revocada }
  peticiones: [],
  hola: [],
  mensajes: [],
  ofertas: new Map(), // viajeId → solicitud
  viajes: new Map(), // correo del pasajero → su búsqueda (para viaje_actual, como el servidor)
  sockets: new Set(),
  cierres: [], // WebSockets que cerró la app: { rol, correo, codigo, motivo, t }
};
const crearUsuario = (correo) => {
  const base = CUENTAS[correo] || { nombre: '', celular: '', conductor: null };
  const u = { id: `u${++srv.n}`, correo, rol: base.conductor ? 'conductor' : 'pasajero', nombre: base.nombre, celular: base.celular, conductor: base.conductor ? { ...base.conductor } : null };
  srv.usuarios.set(correo, u);
  return u;
};
const yoDe = (correo) => {
  const u = srv.usuarios.get(correo);
  return { usuario: { id: u.id, correo: u.correo, nombre: u.nombre, celular: u.celular, rol: u.rol }, conductor: u.conductor };
};
const nuevaSesion = (correo) => {
  const token = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
  srv.sesiones.set(token, correo);
  return token;
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
    return responder(200, { token: nuevaSesion(c), ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/llave') {
    const l = srv.llaves.get(String(cuerpo?.id || ''));
    if (!l || l.revocada || l.secreto !== cuerpo?.secreto || !srv.usuarios.has(l.correo)) return responder(401, { error: 'llave_invalida' });
    l.ultimoUso = Date.now();
    return responder(200, { token: nuevaSesion(l.correo), ...yoDe(l.correo) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') {
    srv.sesiones.delete(token);
    return responder(200, { ok: true });
  }
  if (metodo === 'GET' && ruta === 'yo') return conSesion(() => responder(200, yoDe(correo)));
  if (metodo === 'PATCH' && ruta === 'yo') return conSesion(() => {
    Object.assign(srv.usuarios.get(correo), cuerpo || {});
    return responder(200, yoDe(correo));
  });
  if (metodo === 'DELETE' && ruta === 'yo') return conSesion(() => {
    srv.usuarios.delete(correo);
    for (const [t, c] of srv.sesiones) if (c === correo) srv.sesiones.delete(t);
    for (const [t, d] of srv.dispositivos) if (d.correo === correo) srv.dispositivos.delete(t);
    for (const [id, l] of srv.llaves) if (l.correo === correo) srv.llaves.delete(id);
    return responder(200, { ok: true });
  });
  if (ruta === 'yo/dispositivo' && metodo === 'PUT') return conSesion(() => {
    srv.dispositivos.set(cuerpo.token, { correo, app: cuerpo.app, plataforma: cuerpo.plataforma, entorno: cuerpo.entorno || 'production' });
    return responder(200, { ok: true });
  });
  if (ruta === 'yo/dispositivo' && metodo === 'DELETE') return conSesion(() => {
    srv.dispositivos.delete(cuerpo?.token);
    return responder(200, { ok: true });
  });
  if (ruta === 'yo/llave' && metodo === 'POST') return conSesion(() => {
    const id = `l${++srv.n}`;
    const secreto = Buffer.from(Array.from({ length: 32 }, () => Math.floor(Math.random() * 256))).toString('base64url');
    srv.llaves.set(id, { correo, secreto, nombre: cuerpo?.nombre || '', revocada: false });
    return responder(200, { id, secreto });
  });
  if (ruta.startsWith('yo/llave/') && metodo === 'DELETE') return conSesion(() => {
    const l = srv.llaves.get(decodeURIComponent(ruta.slice('yo/llave/'.length)));
    if (!l || l.correo !== correo) return responder(404, { error: 'llave_desconocida' });
    l.revocada = true;
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
      cx.rol = m.datos.rol === 'conductor' ? 'conductor' : 'pasajero';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, t: Date.now() });
      const u = srv.usuarios.get(correo);
      enviar(cx, 'bienvenida', cx.rol === 'conductor'
        ? { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 5, viajes: 0 } }
        : { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana' });
      const v = cx.rol === 'pasajero' ? srv.viajes.get(correo) : null;
      enviar(cx, 'viaje_actual', v ? { ...v, estado: 'buscando' } : null);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol === 'pasajero') {
      if (m.tipo === 'solicitud' && m.datos?.viajeId) srv.viajes.set(cx.correo, m.datos);
      if (m.tipo === 'cancelacion') srv.viajes.delete(cx.correo);
      return;
    }
    if (m.tipo === 'presencia') {
      const antes = cx.disponible;
      cx.disponible = Boolean(m.datos?.disponible);
      if (cx.disponible && !antes) for (const s of srv.ofertas.values()) enviar(cx, 'solicitud', s, s.pasajero.id);
    }
    if (m.tipo === 'consulta_solicitudes' && cx.disponible) for (const s of srv.ofertas.values()) enviar(cx, 'solicitud', s, s.pasajero.id);
  });
}

/* ------------------------------------------------------------------ */
/* Capacitor simulado                                                  */
/* ------------------------------------------------------------------ */
// cfg: { push, bio, plataforma, tokenPush, tipoBio }. Lo que debe durar entre recargas (el
// permiso, el llavero, la falla de la biometría) va en localStorage con prefijo «__».
function capacitorFalso(cfg) {
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const llamadas = (window.__llamadas = []);
  const anotar = (n, a) => {
    llamadas.push([n, a ?? null]);
    const todas = L('__todas') || [];
    todas.push(n);
    L('__todas', todas);
  };
  const oyentes = {};
  const plugins = {};
  if (cfg.push) {
    plugins.PushNotifications = {
      async checkPermissions() {
        anotar('push.checkPermissions');
        return { receive: L('__permisoPush') || 'prompt' };
      },
      async requestPermissions() {
        anotar('push.requestPermissions');
        const r = (L('__permisoPush') || 'prompt') === 'prompt' ? (L('__negarPush') ? 'denied' : 'granted') : L('__permisoPush');
        L('__permisoPush', r);
        return { receive: r };
      },
      async register() {
        anotar('push.register');
        setTimeout(() => (oyentes.registration || []).forEach((f) => f({ value: cfg.tokenPush })), 40);
      },
      async addListener(ev, fn) {
        anotar(`push.oyente.${ev}`);
        (oyentes[ev] ||= []).push(fn);
        // El sistema guarda el toque de la notificación con la que se abrió la app hasta que haya oyente.
        if (ev === 'pushNotificationActionPerformed' && L('__toqueAlAbrir')) {
          const datos = L('__toqueAlAbrir');
          localStorage.removeItem('__toqueAlAbrir');
          setTimeout(() => fn({ actionId: 'tap', notification: { id: 'retenida', title: 'Nuevo servicio', body: '…', data: datos } }), 30);
        }
        return { remove: async () => { oyentes[ev] = (oyentes[ev] || []).filter((x) => x !== fn); } };
      },
      async removeAllListeners() {},
      async createChannel(c) { anotar('push.createChannel', c); },
      async removeAllDeliveredNotifications() { anotar('push.limpiarEntregadas'); },
    };
    window.__push = {
      tocar: (data) => (oyentes.pushNotificationActionPerformed || []).forEach((f) => f({ actionId: 'tap', notification: { id: 'n1', title: 'Aviso', body: '…', data } })),
      recibir: (data) => (oyentes.pushNotificationReceived || []).forEach((f) => f({ id: 'n2', title: 'Aviso', body: '…', data })),
    };
  }
  if (cfg.bio) {
    plugins.NativeBiometric = {
      async isAvailable() {
        anotar('bio.isAvailable');
        return { isAvailable: true, biometryType: cfg.tipoBio ?? 2, authenticationStrength: 1, deviceIsSecure: true, strongBiometryIsAvailable: true };
      },
      async verifyIdentity(op) {
        anotar('bio.verifyIdentity', op);
        const f = L('__bioFalla');
        if (f) {
          const e = new Error(f === 16 ? 'User canceled' : 'Biometric authentication failed');
          e.code = String(f);
          throw e;
        }
      },
      async setCredentials(op) {
        anotar('bio.setCredentials', op);
        L('__llavero', { ...(L('__llavero') || {}), [op.server]: { username: op.username, password: op.password } });
      },
      async getCredentials(op) {
        anotar('bio.getCredentials', op);
        const c = (L('__llavero') || {})[op.server];
        if (!c) throw new Error('No credentials found');
        return c;
      },
      async deleteCredentials(op) {
        anotar('bio.deleteCredentials', op);
        const ll = L('__llavero') || {};
        delete ll[op.server];
        L('__llavero', ll);
      },
      async isCredentialsSaved(op) {
        anotar('bio.isCredentialsSaved', op);
        return { isSaved: Boolean((L('__llavero') || {})[op.server]) };
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

async function contexto(nombre, cfg, gps = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: gps, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  if (!CONTRA_SERVIDOR) {
    await ctx.route(`${BASE}api/**`, atenderApi);
    await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  }
  if (cfg) await ctx.addInitScript(capacitorFalso, cfg);
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
const llamadas = (p, prefijo) => p.evaluate((x) => (window.__llamadas || []).filter(([n]) => n.startsWith(x)), prefijo);
const todas = (p, nombre) => p.evaluate((x) => (JSON.parse(localStorage.getItem('__todas') || '[]')).filter((n) => n === x).length, nombre);
const llavero = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__llavero') || '{}')['taxicun.com'] || null);
const ls = (p, k) => p.evaluate((x) => localStorage.getItem(x), k);
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
async function segundoPlano(p, ms) {
  await visibilidad(p, true);
  await visibilidad(p, false, ms);
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

/* ------------------------------------------------------------------ */
/* a) Pasajero                                                         */
/* ------------------------------------------------------------------ */
const ANA = 'ana@prueba.taxicun.com';
async function pasajero() {
  const { ctx, p } = await contexto('pasajero', { push: true, bio: true, plataforma: 'ios', tokenPush: TOKEN_P, tipoBio: 2 });
  await p.goto(`${BASE}taxicun/`);
  ok(Boolean(await intento(p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 }))), 'pasajero: sin sesión ni llave abre la bienvenida de siempre');
  ok(await p.evaluate(() => document.documentElement.dataset.nativa === '1' && document.documentElement.dataset.modo === 'real'), 'pasajero: app nativa en modo real');
  await p.waitForTimeout(800);
  ok((await todas(p, 'push.requestPermissions')) === 0 && (await todas(p, 'bio.verifyIdentity')) === 0, 'pasajero: al abrir no pide permiso de avisos ni Face ID');
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.waitForTimeout(600);
  ok(!(await p.$('[data-entrar-bio]')), 'pasajero: sin llave guardada no hay «Entrar con Face ID»');
  await p.fill('.a-bienvenida input[name=correo]', ANA);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  ok(Boolean(await intento(p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 }))), 'pasajero: entra con el código → «¡Hola de nuevo!»');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Entrar con Face ID la próxima vez?")', { timeout: 8000 }))), 'pasajero: tras el código ofrece «¿Entrar con Face ID la próxima vez?»');
  await p.waitForTimeout(450);
  await foto(p, 'p01-ofrecer-face-id');
  await tocarModal(p, 'Usar Face ID');
  const llave = await hasta(() => llavero(p), 6000);
  const verif = await llamadas(p, 'bio.verifyIdentity');
  ok(verif.length === 1, `pasajero: crear la llave pasa por verifyIdentity (${verif.length})`);
  ok(pide('POST', 'yo/llave').length === 1 && llave && srv.llaves.get(llave.username)?.secreto === llave.password, 'pasajero: POST yo/llave y setCredentials (username = id, password = secreto, server taxicun.com)');
  ok(JSON.parse(await ls(p, 'taxicun.llave') || 'null')?.correo === ANA && !(await ls(p, 'taxicun.llave')).includes(llave?.password || '§'), 'pasajero: en localStorage queda el id y el correo de la llave, nunca el secreto');
  await p.click('.a-bienvenida [data-empezar]');
  ok(Boolean(await intento(vista(p, 'inicio', 20000))), 'pasajero: llega al inicio');
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);
  ok((await todas(p, 'push.requestPermissions')) === 0 && srv.dispositivos.size === 0, 'pasajero: con la sesión aún no pide el permiso de avisos (solo al pedir el taxi)');

  // Primer taxi → «¿Te avisamos cuando llegue tu taxi?»
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await p.fill('[data-q]', DESTINO.nombre);
  const fila = `.a-buscador .a-fila:has-text("${DESTINO.nombre}")`;
  await p.waitForSelector(fila, { timeout: 10000 });
  await p.waitForTimeout(500);
  await p.click(fila);
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await p.waitForTimeout(600);
  await p.click('[data-pedir]');
  ok(Boolean(await intento(vista(p, 'buscando', 15000))), 'pasajero: pide el taxi sin esperar el permiso (queda buscando)');
  ok(Boolean(await hasta(() => srv.mensajes.some((m) => m.rol === 'pasajero' && m.tipo === 'solicitud'), 8000)), 'pasajero: la solicitud sale por el tiempo real');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Te avisamos cuando llegue tu taxi?")', { timeout: 8000 }))), 'pasajero: con el primer taxi, «¿Te avisamos cuando llegue tu taxi?»');
  await p.waitForTimeout(450);
  await foto(p, 'p02-ofrecer-avisos');
  await tocarModal(p, 'Sí, avisarme');
  const disp = await hasta(() => srv.dispositivos.get(TOKEN_P), 6000);
  ok((await todas(p, 'push.requestPermissions')) === 1 && (await todas(p, 'push.register')) >= 1, 'pasajero: requestPermissions y register');
  ok(disp?.correo === ANA && disp.app === 'pasajero' && disp.plataforma === 'ios' && disp.entorno === 'production', `pasajero: PUT yo/dispositivo { app: pasajero, plataforma: ios, token, entorno: production } (${JSON.stringify(disp)})`);
  // Con los avisos listos, minimizar cierra el WebSocket (la central avisa por push) y volver lo reabre.
  await p.waitForTimeout(500);
  const cierresP = srv.cierres.filter((c) => c.rol === 'pasajero').length;
  const holasP = srv.hola.filter((h) => h.rol === 'pasajero').length;
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => srv.cierres.filter((c) => c.rol === 'pasajero').length > cierresP, 4000)), 'pasajero: con los avisos listos, al minimizar se cierra el WebSocket');
  await p.waitForTimeout(400);
  ok(srv.hola.filter((h) => h.rol === 'pasajero').length === holasP, 'pasajero: y no se vuelve a abrir mientras está minimizada');
  await visibilidad(p, false, 5000);
  ok(Boolean(await hasta(() => srv.hola.filter((h) => h.rol === 'pasajero').length > holasP, 6000)), 'pasajero: al volver se reconecta (hola)');
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: y sigue buscando su taxi (viaje_actual)');

  // Tocar un aviso con el menú abierto: el viaje queda a la vista.
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-capa', { timeout: 5000 });
  await p.evaluate(() => window.__push.tocar({ tipo: 'aceptacion', viajeId: 'v-ana' }));
  ok(Boolean(await intento(p.waitForSelector('.a-menu-capa', { state: 'detached', timeout: 5000 }))), 'pasajero: tocar el aviso cierra el menú y deja el viaje a la vista');
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: sigue en su viaje (buscando)');
  // Aviso con la app abierta: no se repite en pantalla; la central no veía la conexión → reconecta.
  const holasAntes = srv.hola.filter((h) => h.rol === 'pasajero').length;
  const toastsAntes = await p.$$eval('.a-toast', (ns) => ns.length);
  await p.evaluate(() => window.__push.recibir({ tipo: 'llego', viajeId: 'v-ana' }));
  ok(Boolean(await hasta(() => srv.hola.filter((h) => h.rol === 'pasajero').length > holasAntes, 6000)), 'pasajero: un aviso con la app abierta reconecta el tiempo real');
  await p.waitForTimeout(600);
  ok((await p.$$eval('.a-toast', (ns) => ns.length)) === toastsAntes, 'pasajero: y no se duplica en pantalla');
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: sigue buscando tras reconectar');

  // Cancelar para poder cerrar sesión después.
  await p.click('[data-cancelar]');
  await p.waitForSelector('.a-opciones', { timeout: 5000 });
  await p.click('.a-opcion >> nth=0');
  await p.waitForTimeout(300);
  await p.click('.a-modal .a-btn-peligro');
  await vista(p, 'inicio', 10000).catch(() => {});

  // Ajustes → Seguridad
  await abrirAjustes(p);
  ok(Boolean(await intento(p.waitForSelector('.a-panel.a-abierto [data-seguridad]:not([hidden])', { timeout: 5000 }))), 'pasajero: Ajustes trae «Seguridad»');
  const seg = await texto(p, '.a-panel.a-abierto [data-seguridad]');
  ok(/Entrar con Face ID/.test(seg) && /Pedir Face ID al abrir la app/.test(seg), 'pasajero: «Entrar con Face ID» y «Pedir Face ID al abrir la app»');
  ok((await p.getAttribute('[aria-labelledby="a-aj-bio"]', 'aria-checked')) === 'true', 'pasajero: «Entrar con Face ID» está activo (hay llave)');
  ok(/Activadas/.test(await texto(p, '.a-panel.a-abierto [data-avisos-nativos]')), 'pasajero: Notificaciones «Activadas»');
  await p.click('[aria-labelledby="a-aj-bloqueo"]');
  ok(Boolean(await hasta(async () => (await ls(p, 'taxicun.bloqueo')) === '1', 5000)), 'pasajero: «Pedir Face ID al abrir la app» queda puesto');
  const vBloqueo = (await llamadas(p, 'bio.verifyIdentity')).pop();
  ok(vBloqueo?.[1]?.useFallback === true, 'pasajero: activarlo pide Face ID con el código del celular de respaldo');
  await foto(p, 'p03-ajustes-seguridad');
  await cerrarPanel(p);

  // Bloqueo: menos de 60 s fuera no bloquea; más de 60 s sí, y Face ID lo quita.
  await segundoPlano(p, 20000);
  await p.waitForTimeout(500);
  ok(!(await p.$('.a-bloqueo')), 'pasajero: tras 20 s fuera no se bloquea');
  await p.evaluate(() => localStorage.setItem('__bioFalla', '10'));
  await segundoPlano(p, 61000);
  ok(Boolean(await intento(p.waitForSelector('.a-bloqueo', { timeout: 3000 }))), 'pasajero: tras más de 60 s fuera aparece «TaxiCun está bloqueada»');
  ok(Boolean(await intento(p.waitForFunction(() => /No pudimos reconocerte/.test(document.querySelector('.a-bloqueo-error')?.textContent || ''), null, { timeout: 4000 }))), 'pasajero: Face ID falla → la capa sigue con el aviso');
  await foto(p, 'p04-bloqueo');
  await p.evaluate(() => localStorage.removeItem('__bioFalla'));
  await p.click('.a-bloqueo [data-desbloquear]');
  ok(Boolean(await intento(p.waitForSelector('.a-bloqueo', { state: 'detached', timeout: 4000 }))), 'pasajero: «Desbloquear» con Face ID quita la capa');
  // Al abrir (con sesión y el ajuste puesto) también.
  await p.evaluate(() => localStorage.setItem('__bioFalla', '16'));
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('.a-bloqueo', { timeout: 20000 }))), 'pasajero: al abrir la app con el ajuste puesto, bloqueada');
  await p.waitForTimeout(800);
  ok(Boolean(await p.$('.a-bloqueo')) && !(await p.$eval('.a-bloqueo-error', (n) => n.textContent.trim()).catch(() => '')), 'pasajero: cancelar Face ID deja la capa, sin mensaje de error');
  await p.evaluate(() => localStorage.removeItem('__bioFalla'));
  await p.click('.a-bloqueo [data-desbloquear]');
  await p.waitForSelector('.a-bloqueo', { state: 'detached', timeout: 4000 }).catch(() => {});
  await vista(p, 'inicio', 20000).catch(() => {});
  ok((await todas(p, 'push.requestPermissions')) === 1, 'pasajero: al volver a abrir no se pide otra vez el permiso');
  ok(Boolean(await hasta(() => pide('PUT', 'yo/dispositivo').length >= 2, 8000)), 'pasajero: al abrir con sesión y permiso, el teléfono se vuelve a registrar (PUT yo/dispositivo)');

  // Cerrar sesión: DELETE yo/dispositivo antes de auth/salir; la llave queda.
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(p, 'Cerrar sesión');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 10000 });
  const borrado = pide('DELETE', 'yo/dispositivo').pop();
  const salir = pide('POST', 'auth/salir').pop();
  ok(borrado?.cuerpo?.token === TOKEN_P && borrado.correo === ANA && salir && borrado.t <= salir.t, 'pasajero: cerrar sesión borra el dispositivo (DELETE yo/dispositivo con la sesión) antes de auth/salir');
  ok(!srv.dispositivos.has(TOKEN_P), 'pasajero: el servidor ya no tiene el token');
  ok(Boolean(await llavero(p)), 'pasajero: cerrar sesión conserva la llave de Face ID');
  ok(Boolean(await intento(p.waitForSelector('.a-bienvenida [data-entrar-bio]', { timeout: 5000 }))), 'pasajero: el ingreso muestra «Entrar con Face ID»');
  ok((await texto(p, '.a-bio-cuenta')).includes(ANA), 'pasajero: con el correo de la llave');
  await foto(p, 'p05-ingreso-face-id');

  // Entrar con Face ID.
  await p.click('[data-entrar-bio]');
  ok(Boolean(await intento(p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 10000 }))), 'pasajero: «Entrar con Face ID» → POST auth/llave → «¡Hola de nuevo!»');
  const conLlave = pide('POST', 'auth/llave').pop();
  ok(conLlave?.cuerpo?.id === llave.username && conLlave.cuerpo.secreto === llave.password && conLlave.cuerpo.dispositivo === 'app', 'pasajero: POST auth/llave con { id, secreto, dispositivo: app }');
  ok(Boolean(await ls(p, 'taxicun.token')), 'pasajero: queda la sesión guardada');
  await p.waitForTimeout(1200);
  ok(!(await p.$('.a-modal-nativa')), 'pasajero: tras entrar con Face ID no vuelve a ofrecerlo');
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000).catch(() => {});
  ok(Boolean(await hasta(() => srv.dispositivos.get(TOKEN_P)?.correo === ANA, 8000)), 'pasajero: con la sesión nueva el teléfono vuelve a quedar registrado');

  // Llave revocada en el servidor → llave_invalida → borra credenciales y vuelve al código.
  for (const l of srv.llaves.values()) if (l.correo === ANA) l.revocada = true;
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(p, 'Cerrar sesión');
  await p.waitForSelector('.a-bienvenida [data-entrar-bio]', { timeout: 10000 });
  await p.click('[data-entrar-bio]');
  ok(Boolean(await intento(p.waitForFunction(() => /ya no sirve/.test(document.querySelector('.a-bienvenida [data-error]')?.textContent || ''), null, { timeout: 8000 }))), 'pasajero: llave revocada → «Tu ingreso rápido ya no sirve…»');
  ok(!(await p.$('[data-entrar-bio]')) && !(await llavero(p)) && !(await ls(p, 'taxicun.llave')), 'pasajero: se borran las credenciales y queda el ingreso con código');
  ok(!(await ls(p, 'taxicun.token')), 'pasajero: sin sesión');

  // Entrar con código otra vez (vuelve a ofrecer Face ID) y eliminar la cuenta.
  await p.fill('.a-bienvenida input[name=correo]', ANA);
  const marcado = await p.$eval('.a-bienvenida input[name=terminos]', (n) => n.checked).catch(() => true);
  if (!marcado) await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Face ID")', { timeout: 10000 }))), 'pasajero: tras el código, sin llave, vuelve a ofrecer Face ID');
  await tocarModal(p, 'Usar Face ID');
  ok(Boolean(await hasta(() => llavero(p), 5000)), 'pasajero: llave nueva');
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000).catch(() => {});
  await p.evaluate(() => localStorage.setItem('taxicun.bloqueo', '1'));
  await abrirAjustes(p);
  await p.click('.a-panel.a-abierto [data-eliminar]');
  await tocarModal(p, 'Eliminar mi cuenta');
  ok(Boolean(await intento(p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 10000 }))), 'pasajero: eliminar la cuenta → al ingreso');
  const delDisp = pide('DELETE', 'yo/dispositivo').pop();
  const delYo = pide('DELETE', 'yo').pop();
  ok(delYo && delDisp && delDisp.t <= delYo.t, 'pasajero: DELETE yo/dispositivo y después DELETE /api/yo');
  ok(!(await llavero(p)) && !(await ls(p, 'taxicun.llave')) && !(await ls(p, 'taxicun.bloqueo')), 'pasajero: eliminar la cuenta borra las credenciales de Face ID y el bloqueo');
  ok(!(await p.$('[data-entrar-bio]')), 'pasajero: el ingreso ya no ofrece Face ID');
  await foto(p, 'p06-cuenta-eliminada');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) Conductor                                                        */
/* ------------------------------------------------------------------ */
const LUIS = 'luis@prueba.taxicun.com';
const oferta = (viajeId, nombre = 'Marta') => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre, calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.002, lng: CENTRO.lng + 0.001, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
});
async function conductor() {
  const { ctx, p } = await contexto('conductor', { push: true, bio: true, plataforma: 'ios', tokenPush: TOKEN_C, tipoBio: 2 });
  await p.goto(`${BASE}taxicun/conductor/`);
  ok(Boolean(await intento(p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 }))), 'conductor: ingreso con correo');
  await p.waitForTimeout(800);
  ok(!(await p.$('[data-entrar-bio]')), 'conductor: sin llave no hay «Entrar con Face ID»');
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Entrar con Face ID la próxima vez?")', { timeout: 15000 }))), 'conductor: tras el código ofrece Face ID');
  await tocarModal(p, 'Ahora no');
  ok(pide('POST', 'yo/llave').filter((x) => x.correo === LUIS).length === 0 && !(await llavero(p)), 'conductor: «Ahora no» no crea llave');
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  ok((await todas(p, 'push.requestPermissions')) === 0, 'conductor: aún no pide el permiso de avisos');

  // Primera vez en turno → «Te avisamos de servicios nuevos…»
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Que no se te pase ningún servicio")', { timeout: 8000 }))), 'conductor: al ponerse en turno la primera vez, el modal de los avisos');
  ok(/Te avisamos de servicios nuevos aunque tengas la app cerrada/.test(await texto(p, '.a-modal-nativa')), 'conductor: «Te avisamos de servicios nuevos aunque tengas la app cerrada…»');
  await p.waitForTimeout(450);
  await foto(p, 'c01-ofrecer-avisos');
  await tocarModal(p, 'Activar avisos');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'conductor: queda en turno');
  const disp = await hasta(() => srv.dispositivos.get(TOKEN_C), 6000);
  ok(disp?.app === 'conductor' && disp.correo === LUIS && disp.plataforma === 'ios', `conductor: PUT yo/dispositivo con app conductor (${JSON.stringify(disp)})`);
  ok(srv.mensajes.some((m) => m.rol === 'conductor' && m.tipo === 'presencia' && m.datos?.disponible === true), 'conductor: presencia disponible');
  // En turno, libre y con los avisos listos: minimizar cierra el WebSocket sin «disponible: false»
  // (la central lo deja en turno en segundo plano); al volver, presencia y consulta_solicitudes.
  await p.waitForTimeout(500);
  const cierresC = srv.cierres.filter((c) => c.rol === 'conductor').length;
  const msjC = srv.mensajes.length;
  await visibilidad(p, true);
  ok(Boolean(await hasta(() => srv.cierres.filter((c) => c.rol === 'conductor').length > cierresC, 4000)), 'conductor: en turno con avisos, al minimizar se cierra el WebSocket');
  ok(!srv.mensajes.slice(msjC).some((m) => m.rol === 'conductor' && m.tipo === 'presencia' && m.datos?.disponible === false), 'conductor: sin mandar «disponible: false» (sigue en turno)');
  const holasC = srv.hola.filter((h) => h.rol === 'conductor').length;
  const msjC2 = srv.mensajes.length;
  await visibilidad(p, false, 40000);
  ok(Boolean(await hasta(() => srv.hola.filter((h) => h.rol === 'conductor').length > holasC, 6000)), 'conductor: al volver se reconecta');
  ok(Boolean(await hasta(() => srv.mensajes.slice(msjC2).some((m) => m.tipo === 'presencia' && m.datos?.disponible === true) && srv.mensajes.slice(msjC2).some((m) => m.tipo === 'consulta_solicitudes'), 6000)), 'conductor: y manda presencia disponible + consulta_solicitudes');
  ok((await p.getAttribute('[data-conectar]', 'aria-checked')) === 'true', 'conductor: sigue en turno');
  // Desconectarse y volver: no pregunta otra vez.
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });
  await p.waitForTimeout(500);
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }).catch(() => {});
  ok(!(await p.$('.a-modal-nativa')) && (await todas(p, 'push.requestPermissions')) === 1, 'conductor: la segunda vez en turno no vuelve a preguntar');

  // App cerrada y abierta desde una «Nuevo servicio» VIEJA (datos.hasta ya pasó: el servicio dejó
  // de buscar hace rato; la notificación se quedó en el centro de notificaciones): no pone en turno.
  srv.ofertas.set('v-viejo', oferta('v-viejo', 'Rosa'));
  const msjViejo = srv.mensajes.length;
  await p.evaluate(() => localStorage.setItem('__toqueAlAbrir', JSON.stringify({ tipo: 'solicitud', viajeId: 'v-viejo', hasta: Date.now() - 60 * 60 * 1000 })));
  await p.reload();
  ok(Boolean(await intento(p.waitForFunction(() => /ya no está disponible/.test(document.querySelector('.a-avisos')?.innerText || ''), null, { timeout: 30000 }))), 'conductor: notificación vieja (datos.hasta vencido) → «Ese servicio ya no está disponible»');
  await p.waitForTimeout(1500);
  ok((await p.getAttribute('[data-conectar]', 'aria-checked').catch(() => null)) === 'false', 'conductor: y no queda en turno por tocarla');
  ok(!srv.mensajes.slice(msjViejo).some((m) => m.rol === 'conductor' && m.tipo === 'presencia' && m.datos?.disponible === true), 'conductor: sin presencia disponible');
  ok(!(await p.$('.a-solicitud.a-abierta')), 'conductor: sin la oferta vieja');
  srv.ofertas.delete('v-viejo');

  // App cerrada y abierta desde «Nuevo servicio»: vuelve a quedar en turno y ve la oferta.
  srv.ofertas.set('v-100', oferta('v-100', 'Marta'));
  await p.evaluate(() => localStorage.setItem('__toqueAlAbrir', JSON.stringify({ tipo: 'solicitud', viajeId: 'v-100', hasta: Date.now() + 5 * 60 * 1000 })));
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta', { timeout: 30000 }))), 'conductor: abierta desde la notificación, aparece la oferta');
  ok((await texto(p, '.a-solicitud')).includes('Marta'), 'conductor: es la oferta de la notificación (Marta)');
  ok((await p.getAttribute('[data-conectar]', 'aria-checked').catch(() => null)) !== 'false', 'conductor: quedó en turno sin tocar la píldora');
  ok(srv.mensajes.some((m) => m.rol === 'conductor' && m.tipo === 'consulta_solicitudes'), 'conductor: pidió consulta_solicitudes');
  ok((await todas(p, 'push.limpiarEntregadas')) >= 1, 'conductor: al abrir se quitan las notificaciones viejas');
  await foto(p, 'c02-oferta-desde-aviso');

  // Aviso de un servicio que ya no está.
  await p.evaluate(() => window.__push.tocar({ tipo: 'solicitud', viajeId: 'v-999' }));
  ok(Boolean(await intento(p.waitForFunction(() => /ya no está disponible/.test(document.querySelector('.a-avisos')?.innerText || ''), null, { timeout: 14000 }))), 'conductor: si la oferta del aviso no llega, «Ese servicio ya no está disponible»');

  // Aviso con la app abierta: la central cree que no hay conexión → reconecta.
  const holas = srv.hola.filter((h) => h.rol === 'conductor').length;
  await p.evaluate(() => window.__push.recibir({ tipo: 'solicitud', viajeId: 'v-100' }));
  ok(Boolean(await hasta(() => srv.hola.filter((h) => h.rol === 'conductor').length > holas, 6000)), 'conductor: un aviso con la app abierta reconecta el tiempo real');

  // Ajustes → «Entrar con Face ID» (dijo «Ahora no»: está apagado; al encenderlo crea la llave).
  srv.ofertas.clear();
  await abrirAjustes(p);
  ok(Boolean(await intento(p.waitForSelector('.a-panel.a-abierto [data-seguridad]:not([hidden])', { timeout: 5000 }))), 'conductor: Ajustes trae «Seguridad»');
  ok((await p.getAttribute('[aria-labelledby="a-aj-bio"]', 'aria-checked')) === 'false', 'conductor: «Entrar con Face ID» apagado');
  ok(/Servicios nuevos aunque tengas la app cerrada/.test(await texto(p, '.a-panel.a-abierto [data-avisos-nativos]')), 'conductor: Notificaciones dice para qué sirven');
  await p.click('[aria-labelledby="a-aj-bio"]');
  const llaveC = await hasta(() => llavero(p), 6000);
  ok(Boolean(llaveC) && srv.llaves.get(llaveC.username)?.correo === LUIS, 'conductor: encenderlo crea la llave (POST yo/llave + setCredentials)');
  await foto(p, 'c03-ajustes');
  await cerrarPanel(p);

  // Bloqueo con «¿No puedes? Cierra sesión».
  await p.evaluate(() => {
    localStorage.setItem('taxicun.bloqueo', '1');
    localStorage.setItem('__bioFalla', '16');
  });
  await p.reload();
  ok(Boolean(await intento(p.waitForSelector('.a-bloqueo', { timeout: 20000 }))), 'conductor: al abrir con el ajuste puesto, bloqueada');
  await p.waitForTimeout(600);
  await p.click('.a-bloqueo [data-salir]');
  await p.waitForSelector('.a-bloqueo [data-salir-si]', { timeout: 3000 });
  await foto(p, 'c04-bloqueo-salir');
  const borrados = pide('DELETE', 'yo/dispositivo').length;
  await p.click('.a-bloqueo [data-salir-si]');
  ok(Boolean(await intento(p.waitForSelector('.a-bloqueo', { state: 'detached', timeout: 10000 }))), 'conductor: «Cerrar sesión» desde el bloqueo quita la capa');
  ok(Boolean(await intento(p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 10000 }))), 'conductor: y vuelve al ingreso');
  ok(pide('DELETE', 'yo/dispositivo').length > borrados && !srv.dispositivos.has(TOKEN_C), 'conductor: cerrar sesión borra el dispositivo');

  // Entrar con Face ID (la llave quedó) y apagarlo en Ajustes (revoca la llave).
  await p.evaluate(() => localStorage.removeItem('__bioFalla'));
  ok(Boolean(await intento(p.waitForSelector('.a-ingreso-real [data-entrar-bio]', { timeout: 6000 }))), 'conductor: el ingreso muestra «Entrar con Face ID»');
  await foto(p, 'c05-ingreso-face-id');
  await p.click('[data-entrar-bio]');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 }))), 'conductor: entra con Face ID (POST auth/llave) a la app');
  ok(pide('POST', 'auth/llave').some((x) => x.cuerpo?.id === llaveC?.username), 'conductor: con su llave');
  ok(!(await p.$('.a-bloqueo')), 'conductor: entrar no muestra el bloqueo');
  await abrirAjustes(p);
  await p.waitForSelector('.a-panel.a-abierto [data-seguridad]:not([hidden])', { timeout: 5000 });
  ok((await p.getAttribute('[aria-labelledby="a-aj-bio"]', 'aria-checked')) === 'true', 'conductor: «Entrar con Face ID» encendido');
  await p.click('[aria-labelledby="a-aj-bio"]');
  ok(Boolean(await hasta(async () => !(await llavero(p)), 6000)), 'conductor: apagarlo borra las credenciales');
  ok(pide('DELETE', `yo/llave/${llaveC?.username}`).length === 1 && srv.llaves.get(llaveC?.username)?.revocada, 'conductor: y revoca la llave en el servidor (DELETE yo/llave/:id)');
  await cerrarPanel(p);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b2) Android sin Firebase: solo NativeBiometric (sin PushNotifications)   */
/* ------------------------------------------------------------------ */
// Así sale hoy la app 1.2 de Android (sin google-services.json el plugin de push no entra).
// La huella sí; los avisos no: ni modal, ni llamadas al plugin, y el WebSocket sigue abierto
// al minimizar (como en la 1.0).
async function androidSinFirebase() {
  const { ctx, p } = await contexto('android sin Firebase', { push: false, bio: true, plataforma: 'android', tipoBio: 3 });
  await p.goto(`${BASE}taxicun/conductor/`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  ok(Boolean(await intento(p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Entrar con tu huella la próxima vez?")', { timeout: 15000 }))), 'android sin Firebase: tras el código ofrece «tu huella»');
  await tocarModal(p, 'Ahora no');
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'android sin Firebase: queda en turno');
  ok(!(await p.$('.a-modal-nativa')), 'android sin Firebase: sin el modal de los avisos');
  await p.waitForTimeout(500);
  const cierres = srv.cierres.filter((x) => x.rol === 'conductor').length;
  await visibilidad(p, true);
  await p.waitForTimeout(1500);
  ok(srv.cierres.filter((x) => x.rol === 'conductor').length === cierres, 'android sin Firebase: al minimizar el WebSocket sigue abierto (como en la 1.0)');
  await visibilidad(p, false);
  await abrirAjustes(p);
  ok(Boolean(await intento(p.waitForSelector('.a-panel.a-abierto [data-seguridad]:not([hidden])', { timeout: 5000 }))), 'android sin Firebase: Ajustes con «Seguridad» (huella)');
  ok(!(await p.$('.a-panel.a-abierto [data-avisos-nativos]')), 'android sin Firebase: sin la fila de notificaciones del celular');
  await cerrarPanel(p);
  ok(!(await llamadas(p, 'push.')).length, 'android sin Firebase: ninguna llamada a PushNotifications');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) Sin los plugins (app 1.0) y en la web: nada cambia               */
/* ------------------------------------------------------------------ */
async function sinPlugins(nombre, cfg, url) {
  const { ctx, p } = await contexto(nombre, cfg);
  await p.goto(`${BASE}${url}`);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', ANA);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.waitForTimeout(1500);
  ok(!(await p.$('.a-modal-nativa')), `${nombre}: tras el código no ofrece Face ID`);
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000);
  await abrirAjustes(p);
  ok(!(await p.$('[data-seguridad]')) && !(await p.$('[data-avisos-nativos]')), `${nombre}: Ajustes sin «Seguridad» ni notificaciones del celular`);
  await cerrarPanel(p);
  await p.evaluate(() => localStorage.setItem('taxicun.bloqueo', '1'));
  await p.reload();
  await vista(p, 'inicio', 20000).catch(() => {});
  await p.waitForTimeout(800);
  ok(!(await p.$('.a-bloqueo')), `${nombre}: sin capa de bloqueo`);
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(p, 'Cerrar sesión');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 10000 });
  await p.waitForTimeout(600);
  ok(!(await p.$('[data-entrar-bio]')), `${nombre}: el ingreso no ofrece Face ID`);
  ok(await p.evaluate(() => !(window.__llamadas || []).length), `${nombre}: ninguna llamada a PushNotifications ni a NativeBiometric`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* --real: el servidor de la rama v1.2 (0.3.0)                         */
/* ------------------------------------------------------------------ */
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_web12';
const SERVIDOR = process.env.SERVIDOR_TAXICUN || '/root/proyectos/taxicun-servidor';
const PUSH_CONFIGURADO = process.env.PUSH_CONFIGURADO === '1';
const PRUEBA_P = { correo: process.env.CORREO_PASAJERO || 'pasajero@prueba.taxicun.com', codigo: process.env.CODIGO_PASAJERO || '246810', nombre: 'Ana María Gómez', celular: '3001234567' };
const PRUEBA_C = { correo: process.env.CORREO_CONDUCTOR || 'conductor@prueba.taxicun.com', codigo: process.env.CODIGO_CONDUCTOR || '135790', nombre: 'Luis Alberto Rodríguez', celular: '3115550101', movil: '77', placa: 'TST777' };
const sql = (q) => execFileSync('psql', [BASE_DATOS, '-tAc', q], { encoding: 'utf8', timeout: 15000 }).trim();
const cita = (t) => `'${String(t).replace(/'/g, "''")}'`;

async function apiNode(metodo, ruta, cuerpo, token) {
  const cabeceras = { accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
  if (token) cabeceras.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}api/${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    datos = null;
  }
  return { estado: r.status, datos };
}

// Las cuentas de prueba tienen código fijo, pero igual hay que pedirlo antes de entrar.
async function entrarNode(c) {
  await apiNode('POST', 'auth/codigo', { correo: c.correo });
  return apiNode('POST', 'auth/entrar', { correo: c.correo, codigo: c.codigo });
}

// Cuentas de prueba limpias: el pasajero con su perfil y el conductor registrado y aprobado.
async function prepararReal() {
  const salud = await apiNode('GET', 'salud');
  ok(salud.estado === 200 && /^0\.3\./.test(salud.datos?.version || ''), `real: servidor ${salud.datos?.version || '?'} (rama v1.2)`);
  for (const c of [PRUEBA_P, PRUEBA_C]) {
    const r = await entrarNode(c);
    if (r.datos?.token) await apiNode('DELETE', 'yo', undefined, r.datos.token);
  }
  const p = await entrarNode(PRUEBA_P);
  await apiNode('PATCH', 'yo', { nombre: PRUEBA_P.nombre, celular: PRUEBA_P.celular }, p.datos?.token);
  await apiNode('POST', 'auth/salir', undefined, p.datos?.token);
  const c = await entrarNode(PRUEBA_C);
  await apiNode('PATCH', 'yo', { nombre: PRUEBA_C.nombre, celular: PRUEBA_C.celular }, c.datos?.token);
  const reg = await apiNode('PUT', 'conductor', { empresa: 'cootransrural', movil: PRUEBA_C.movil, placa: PRUEBA_C.placa }, c.datos?.token);
  const aprobado = execFileSync('node', ['bin/admin.js', 'aprobar', PRUEBA_C.correo], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000 }).trim();
  await apiNode('POST', 'auth/salir', undefined, c.datos?.token);
  ok(p.estado === 200 && reg.estado === 200 && /aprobado/.test(aprobado), 'real: cuentas de prueba listas (pasajero con perfil, conductor aprobado)');
}

async function entrarConCodigoPasajero(p, cuenta) {
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 15000 });
  await p.fill('.a-bienvenida input[name=correo]', cuenta.correo);
  const marcado = await p.$eval('.a-bienvenida input[name=terminos]', (n) => n.checked).catch(() => true);
  if (!marcado) await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', cuenta.codigo);
}

async function real() {
  await prepararReal();
  const TP = 'e5f6'.repeat(16);
  const TC = '7a8b'.repeat(16);
  const uP = () => sql(`select id from usuarios where correo = ${cita(PRUEBA_P.correo)}`);
  const uC = () => sql(`select id from usuarios where correo = ${cita(PRUEBA_C.correo)}`);

  // Conductor: código → «Ahora no» → en turno → avisos → PUT yo/dispositivo; minimizar → dormido.
  const C = await contexto('conductor real', { push: true, bio: true, plataforma: 'ios', tokenPush: TC, tipoBio: 2 }, { latitude: CENTRO.lat + 0.003, longitude: CENTRO.lng + 0.001, accuracy: 10 });
  let pc = C.p;
  await pc.goto(`${BASE}taxicun/conductor/`);
  await pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await pc.fill('.a-ingreso-real input[name=correo]', PRUEBA_C.correo);
  await pc.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(pc, '.a-ingreso-real .a-casillas-6', PRUEBA_C.codigo);
  ok(Boolean(await intento(pc.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Face ID")', { timeout: 15000 }))), 'real · conductor: tras el código ofrece Face ID');
  await tocarModal(pc, 'Ahora no');
  await pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await pc.click('[data-conectar]');
  await tocarModal(pc, 'Activar avisos');
  ok(Boolean(await intento(pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'real · conductor: en turno');
  ok(Boolean(await hasta(() => sql(`select app || '|' || plataforma || '|' || entorno from dispositivos where token = ${cita(TC)} and usuario_id = ${cita(uC())}`) === 'conductor|ios|production', 8000)), 'real · conductor: el servidor guardó el dispositivo (conductor, ios, production)');
  await pc.waitForTimeout(800);
  await visibilidad(pc, true);
  if (PUSH_CONFIGURADO) ok(Boolean(await hasta(() => sql(`select count(*) from turnos_dormidos where usuario_id = ${cita(uC())}`) === '1', 8000)), 'real · conductor: al minimizar queda «en turno en segundo plano» (turnos_dormidos)');
  else {
    await pc.waitForTimeout(2500);
    ok(sql(`select count(*) from turnos_dormidos where usuario_id = ${cita(uC())}`) === '0', 'real · conductor: sin push configurado en el servidor, minimizar no lo deja dormido (como la 0.2)');
  }
  // La app se cierra (el sistema la mata en segundo plano).
  await pc.close();

  // Pasajero: código → Face ID (llave) → primer taxi → avisos → PUT yo/dispositivo.
  const P = await contexto('pasajero real', { push: true, bio: true, plataforma: 'ios', tokenPush: TP, tipoBio: 2 });
  const pp = P.p;
  await pp.goto(`${BASE}taxicun/`);
  await pp.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await pp.click('.a-bienvenida [data-saltar]');
  await entrarConCodigoPasajero(pp, PRUEBA_P);
  ok(Boolean(await intento(pp.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Entrar con Face ID la próxima vez?")', { timeout: 15000 }))), 'real · pasajero: tras el código ofrece Face ID');
  await tocarModal(pp, 'Usar Face ID');
  const cred = await hasta(() => llavero(pp), 8000);
  ok(Boolean(cred) && sql(`select count(*) from llaves_dispositivo where id = ${cita(cred.username)} and usuario_id = ${cita(uP())} and not revocada`) === '1', 'real · pasajero: POST yo/llave → la llave existe en el servidor con el id guardado en el llavero');
  ok(Boolean(cred) && !sql(`select secreto_hash from llaves_dispositivo where id = ${cita(cred.username)}`).includes(cred.password), 'real · pasajero: el servidor no guarda el secreto en claro');
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 });
  await pp.click('[data-buscar]');
  await pp.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await pp.fill('[data-q]', DESTINO.nombre);
  await pp.waitForSelector(`.a-buscador .a-fila:has-text("${DESTINO.nombre}")`, { timeout: 10000 });
  await pp.waitForTimeout(500);
  await pp.click(`.a-buscador .a-fila:has-text("${DESTINO.nombre}")`);
  await vista(pp, 'confirmar', 10000);
  await pp.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await pp.waitForTimeout(600);
  await pp.click('[data-pedir]');
  ok(Boolean(await intento(vista(pp, 'buscando', 15000))), 'real · pasajero: pide su taxi');
  await tocarModal(pp, 'Sí, avisarme');
  ok(Boolean(await hasta(() => sql(`select app || '|' || plataforma || '|' || entorno from dispositivos where token = ${cita(TP)} and usuario_id = ${cita(uP())}`) === 'pasajero|ios|production', 8000)), 'real · pasajero: el servidor guardó el dispositivo (pasajero, ios, production)');
  const viajeId = await hasta(() => pp.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null');
    return g?.estado?.viaje?.id || g?.viaje?.id || null;
  }), 8000);
  ok(Boolean(viajeId), `real · pasajero: viaje buscando (${viajeId})`);

  // El conductor abre la app desde «Nuevo servicio»: vuelve a quedar en turno y ve la oferta.
  pc = await C.ctx.newPage();
  pc.on('pageerror', (e) => errores.push(`[conductor real] ${e.message}`));
  await pc.goto(`${BASE}empresas/indice.json`);
  await pc.evaluate((id) => localStorage.setItem('__toqueAlAbrir', JSON.stringify({ tipo: 'solicitud', viajeId: id })), viajeId);
  await pc.goto(`${BASE}taxicun/conductor/`);
  ok(Boolean(await intento(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 30000 }))), 'real · conductor: abierta desde la notificación, le llega la oferta del pasajero');
  ok((await texto(pc, '.a-solicitud')).includes('Ana'), 'real · conductor: es el servicio de Ana');
  ok(Boolean(await hasta(() => sql(`select count(*) from turnos_dormidos where usuario_id = ${cita(uC())}`) === '0', 6000)), 'real · conductor: conectado, no queda en turnos_dormidos');
  await foto(pc, 'r01-oferta-desde-aviso');
  // El pasajero cancela; el conductor cierra sesión (borra su dispositivo).
  await pp.click('[data-cancelar]');
  await pp.waitForSelector('.a-opciones', { timeout: 5000 });
  await pp.click('.a-opcion >> nth=0');
  await pp.waitForTimeout(300);
  await pp.click('.a-modal .a-btn-peligro');
  await vista(pp, 'inicio', 10000).catch(() => {});
  ok(Boolean(await intento(pc.waitForSelector('.a-solicitud.a-abierta', { state: 'detached', timeout: 10000 }))), 'real · conductor: se le quita la oferta cancelada');
  await pc.waitForTimeout(800);
  await pc.click('[data-conectar]');
  await pc.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 }).catch(() => {});
  await pc.click('[data-menu]');
  await pc.waitForSelector('.a-menu-item', { timeout: 5000 });
  await pc.waitForTimeout(450);
  await pc.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(pc, 'Cerrar sesión');
  await pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 10000 });
  ok(sql(`select count(*) from dispositivos where token = ${cita(TC)}`) === '0', 'real · conductor: cerrar sesión borra su dispositivo en el servidor');
  await C.ctx.close();

  // Pasajero: cerrar sesión (borra el dispositivo, la llave queda) → entrar con Face ID.
  await pp.click('[data-menu]');
  await pp.waitForSelector('.a-menu-item', { timeout: 5000 });
  await pp.waitForTimeout(450);
  await pp.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(pp, 'Cerrar sesión');
  await pp.waitForSelector('.a-bienvenida [data-entrar-bio]', { timeout: 10000 });
  ok(sql(`select count(*) from dispositivos where token = ${cita(TP)}`) === '0', 'real · pasajero: cerrar sesión borra su dispositivo en el servidor');
  await pp.click('[data-entrar-bio]');
  ok(Boolean(await intento(pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 10000 }))), 'real · pasajero: entra con Face ID (POST auth/llave)');
  ok(sql(`select ultimo_uso is not null from llaves_dispositivo where id = ${cita(cred.username)}`) === 't', 'real · pasajero: la llave queda con su último uso');
  await pp.click('.a-bienvenida [data-empezar]');
  ok(Boolean(await intento(pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }))), 'real · pasajero: con esa sesión el tiempo real queda en línea');
  ok(Boolean(await hasta(() => sql(`select count(*) from dispositivos where token = ${cita(TP)} and usuario_id = ${cita(uP())}`) === '1', 8000)), 'real · pasajero: y el teléfono vuelve a quedar registrado');

  // Llave revocada (DELETE yo/llave/:id desde otro lado) → llave_invalida → al código.
  const token = await pp.evaluate(() => localStorage.getItem('taxicun.token'));
  const rev = await apiNode('DELETE', `yo/llave/${cred.username}`, undefined, token);
  ok(rev.estado === 200 && sql(`select revocada from llaves_dispositivo where id = ${cita(cred.username)}`) === 't', 'real: DELETE yo/llave/:id revoca la llave');
  await pp.click('[data-menu]');
  await pp.waitForSelector('.a-menu-item', { timeout: 5000 });
  await pp.waitForTimeout(450);
  await pp.click('.a-menu-item:has-text("Cerrar sesión")');
  await tocarModal(pp, 'Cerrar sesión');
  await pp.waitForSelector('.a-bienvenida [data-entrar-bio]', { timeout: 10000 });
  await pp.click('[data-entrar-bio]');
  ok(Boolean(await intento(pp.waitForFunction(() => /ya no sirve/.test(document.querySelector('.a-bienvenida [data-error]')?.textContent || ''), null, { timeout: 8000 }))), 'real · pasajero: llave revocada → 401 llave_invalida → «Tu ingreso rápido ya no sirve…»');
  ok(!(await pp.$('[data-entrar-bio]')) && !(await llavero(pp)), 'real · pasajero: se borran las credenciales');

  // Código otra vez, Face ID otra vez y eliminar la cuenta: el servidor borra dispositivos y llaves.
  await entrarConCodigoPasajero(pp, PRUEBA_P);
  await pp.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Face ID")', { timeout: 15000 });
  await tocarModal(pp, 'Usar Face ID');
  await hasta(() => llavero(pp), 8000);
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  const id = uP();
  ok(Boolean(await hasta(() => Number(sql(`select count(*) from dispositivos where usuario_id = ${cita(id)}`)) === 1 && Number(sql(`select count(*) from llaves_dispositivo where usuario_id = ${cita(id)} and not revocada`)) === 1, 8000)), 'real · pasajero: antes de eliminar: un dispositivo y una llave vigente');
  await abrirAjustes(pp);
  await pp.click('.a-panel.a-abierto [data-eliminar]');
  await tocarModal(pp, 'Eliminar mi cuenta');
  await pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 10000 });
  ok(sql(`select count(*) from usuarios where correo = ${cita(PRUEBA_P.correo)}`) === '0' && sql(`select borrado is not null from usuarios where id = ${cita(id)}`) === 't', 'real · pasajero: la cuenta se eliminó (el servidor la deja sin datos personales)');
  ok(sql(`select count(*) from dispositivos where usuario_id = ${cita(id)}`) === '0' && sql(`select count(*) from llaves_dispositivo where usuario_id = ${cita(id)}`) === '0', 'real · pasajero: y con ella sus dispositivos y llaves');
  ok(!(await llavero(pp)) && !(await pp.$('[data-entrar-bio]')), 'real · pasajero: el teléfono olvida la llave');
  await P.ctx.close();
}

const inicio = Date.now();
try {
  if (CONTRA_SERVIDOR) await real();
  else {
    await pasajero();
    await conductor();
    await androidSinFirebase();
    const antes = { disp: pide('PUT', 'yo/dispositivo').length, llave: pide('POST', 'yo/llave').length + pide('POST', 'auth/llave').length };
    await sinPlugins('app 1.0 (sin plugins)', { push: false, bio: false, plataforma: 'ios' }, 'taxicun/');
    await sinPlugins('web ?real=1', null, 'taxicun/?real=1');
    ok(pide('PUT', 'yo/dispositivo').length === antes.disp && pide('POST', 'yo/llave').length + pide('POST', 'auth/llave').length === antes.llave, 'sin plugins: ni yo/dispositivo ni llaves');
  }
} catch (e) {
  console.error(e);
  ok(false, `la prueba se cortó: ${e.message}`);
}
ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 5).join(' | ')}` : ''}`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · nativo 1.2${CONTRA_SERVIDOR ? ' contra el servidor' : ''} · ${bien} ✔ · ${fallas} fallas · ${Math.round((Date.now() - inicio) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
