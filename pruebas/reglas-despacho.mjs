// Prueba de las «Reglas del despacho» en la app (modo real, diseño A, la web con ?real=1) con el servidor de
// TaxiCun simulado aquí mismo (HTTP con page.route y el WebSocket /api/bus con routeWebSocket), como
// segundo-plano.mjs y nativo-v12.mjs, con el contrato de la rama reglas-despacho del servidor (nucleo/reglas.js):
// bienvenida.reglas y el mensaje «reglas», oferta_vista, rechazo, sin_conductores { viajeId, motivo } (repetido
// después de viaje_actual al reconectar si sigue así) y con_conductores.
// Recorre:
//  a) conductor con reglas { segundosOferta: 16, metrosLlegue: 60 }: quedan guardadas por cooperativa; la oferta
//     cuenta desde 16 s y se va a los 16 s (no a los 25); oferta_vista sale al verla (una vez cada vez que llega); la que espera detrás
//     («+1 en espera») no sale hasta que se ve; «Rechazar» manda rechazo y la vencida no; la oferta que llega con
//     la app oculta sale como vista al volver (y no antes); un «rechazo» que mande la central no lo saca del turno;
//     el mensaje «reglas» (el gerente las cambió) vale para la oferta siguiente; «Llegué» a ~100 m del punto: con
//     60 m no deja; la central se reinicia sin reglas (una anterior): vuelve a 150 m («Llegué» a ~100 m sí) y a 25 s.
//  b) pasajero con reglas { minutosBusqueda: 5 }: pide → sin_conductores de otro viaje no cuenta; el suyo
//     (sin_taxis) → «No hay taxis en turno cerca», «Llamar a la central» (tel: de la ficha), sin «taxis libres
//     cerca», el mensaje queda fijo y el aviso sale una vez; otro motivo cambia el texto sin otro aviso;
//     con_conductores lo quita y avisa; al recargar, la central lo repite si sigue así (y si no, se olvida); la
//     central suelta la búsqueda → «No hubo taxis disponibles»; una búsqueda guardada de hace 6 min que la central
//     ya no tiene: con 5 min no se vuelve a pedir y con la central sin reglas (10 min) sí; en modo revisor no se
//     ofrece la central.
//  c) los textos de cada motivo; la demo (sin ?real) no manda ni muestra nada de esto (25 s).
//
// Uso: node pruebas/reglas-despacho.mjs [url_base]   (servidor estático del repositorio; p. ej.
//      python3 -m http.server 4721 → http://localhost:4721/). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:4721/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/reglas-despacho').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const TEL_CENTRAL = String(FICHA.EMPRESA.telefono).replace(/\D/g, '');
const CODIGO = '123456';
const CLAVE_REGLAS = 'tc.real.reglas.cootransrural';
const REGLAS = { segundosOferta: 16, metrosLlegue: 60, minutosBusqueda: 5 };

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
const CUENTAS = {
  'ana@prueba.taxicun.com': { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
  'rita@prueba.taxicun.com': { nombre: 'Rita Revisora', celular: '3001234568', conductor: null },
  'luis@prueba.taxicun.com': {
    nombre: 'Luis Alberto Rodríguez', celular: '3109876543',
    conductor: { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' },
  },
};
const srv = {
  n: 0,
  reglas: null, // lo que va en bienvenida.reglas (null = central anterior, sin reglas)
  revisores: new Set(), // correos con bienvenida.revision
  usuarios: new Map(),
  sesiones: new Map(),
  hola: [],
  mensajes: [],
  ofertas: new Map(), // viajeId → solicitud pendiente (para consulta_solicitudes)
  viajesC: new Map(), // correo del conductor → servicio asignado (viaje_actual)
  viajesP: new Map(), // correo del pasajero → búsqueda (viaje_actual)
  sinP: new Map(), // correo del pasajero → motivo con el que su búsqueda sigue sin nadie (se repite al reconectar)
  sockets: new Set(),
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
  if (metodo === 'PATCH' && ruta === 'yo') return conSesion(() => {
    Object.assign(srv.usuarios.get(correo), cuerpo || {});
    return responder(200, yoDe(correo));
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
const conexiones = (rol) => [...srv.sockets].filter((cx) => cx.rol === rol);
const aTodos = (rol, tipo, datos, de) => conexiones(rol).forEach((cx) => enviar(cx, tipo, datos, de));

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
      if (!correo || !srv.usuarios.has(correo)) {
        enviar(cx, 'error', { codigo: 'sin_sesion' });
        ws.close({ code: 4401, reason: 'sin_sesion' });
        return;
      }
      cx.rol = m.datos.rol === 'conductor' ? 'conductor' : 'pasajero';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, t: Date.now() });
      const u = srv.usuarios.get(correo);
      const extra = { ...(srv.reglas ? { reglas: srv.reglas } : {}), ...(srv.revisores.has(correo) ? { revision: true } : {}) };
      enviar(cx, 'bienvenida', cx.rol === 'conductor'
        ? { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 5, viajes: 0 }, ...extra }
        : { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: `p_${u.id}`, ...extra });
      if (cx.rol === 'conductor') enviar(cx, 'viaje_actual', srv.viajesC.get(correo) || null);
      else {
        const v = srv.viajesP.get(correo);
        enviar(cx, 'viaje_actual', v ? { ...v, estado: 'buscando' } : null);
        // Como la central: si su búsqueda sigue sin nadie que la pueda tomar, se lo dice otra vez.
        if (v && srv.sinP.has(correo)) enviar(cx, 'sin_conductores', { viajeId: v.viajeId, motivo: srv.sinP.get(correo) });
      }
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol === 'pasajero') {
      if (m.tipo === 'solicitud' && m.datos?.viajeId) srv.viajesP.set(cx.correo, m.datos);
      if (m.tipo === 'cancelacion') srv.viajesP.delete(cx.correo);
      return;
    }
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
      srv.viajesC.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular: '3001234567' }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: '' });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular: '3001234567' } });
    }
    if (m.tipo === 'estado' && m.datos?.fase) {
      const v = srv.viajesC.get(cx.correo);
      if (v && v.viajeId === m.datos.viajeId) v.estado = m.datos.fase;
    }
    if (m.tipo === 'cancelacion') srv.viajesC.delete(cx.correo);
  });
}

// La oferta de un pasajero; el punto de recogida a ~100 m al norte del parque (donde está el conductor).
const oferta = (viajeId, nombre = 'Marta') => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre, calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.0009, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
});
function ofrecer(viajeId, nombre) {
  const s = oferta(viajeId, nombre);
  srv.ofertas.set(viajeId, s);
  for (const cx of conexiones('conductor')) if (cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
  return s;
}
const delConductor = (tipo, viajeId) => srv.mensajes.filter((m) => m.rol === 'conductor' && m.tipo === tipo && (viajeId === undefined || m.datos?.viajeId === viajeId));
const delPasajero = (tipo) => srv.mensajes.filter((m) => m.rol === 'pasajero' && m.tipo === tipo);

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];

async function contexto(nombre, { simular = true } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  if (simular) {
    await ctx.route(`${BASE}api/**`, atenderApi);
    await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  }
  // Cada aviso que se ve en pantalla (para contar los de un mismo título aunque ya se hayan ido).
  await ctx.addInitScript(() => {
    window.__avisos = [];
    new MutationObserver(() => {
      document.querySelectorAll('.a-toast:not([data-visto])').forEach((n) => {
        n.dataset.visto = '1';
        window.__avisos.push({ titulo: n.querySelector('strong')?.textContent || '', cuerpo: n.querySelector('p')?.textContent || '' });
      });
    }).observe(document, { childList: true, subtree: true });
  });
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
const avisos = (p, re) => p.evaluate((f) => (window.__avisos || []).filter((a) => new RegExp(f).test(a.titulo)), re.source);
const conAviso = async (p, re, timeout = 8000) => Boolean(await hasta(async () => (await avisos(p, re)).length > 0, timeout));
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
// La app pasa a segundo plano (true) o vuelve (false), como en segundo-plano.mjs.
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
const enTurno = async (p) => (await p.getAttribute('[data-conectar]', 'aria-checked').catch(() => null)) === 'true';
const segundosEnPantalla = async (p) => Number(await p.textContent('.a-solicitud [data-seg]').catch(() => 'NaN'));
const solicitudAbierta = (p) => p.$('.a-solicitud.a-abierta');
const tituloSolicitud = (p) => texto(p, '.a-solicitud.a-abierta #a-sol-titulo');

/* ------------------------------------------------------------------ */
/* a) Conductor                                                        */
/* ------------------------------------------------------------------ */
const LUIS = 'luis@prueba.taxicun.com';
async function conductor() {
  srv.reglas = { ...REGLAS };
  const { ctx, p } = await contexto('conductor');
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
  const guardadas = JSON.parse((await ls(p, CLAVE_REGLAS)) || 'null');
  ok(guardadas?.segundosOferta === 16 && guardadas.metrosLlegue === 60 && guardadas.minutosBusqueda === 5, `conductor: las reglas de la bienvenida quedan guardadas por cooperativa (${JSON.stringify(guardadas)})`);
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'conductor: queda en turno');
  ok(Boolean(await hasta(() => delConductor('presencia').some((m) => m.datos?.disponible === true), 8000)), 'conductor: presencia disponible');
  await p.waitForTimeout(800);

  // Oferta 1: dura 16 s (segundosOferta) y sale como vista una vez.
  const t1 = Date.now();
  ofrecer('v-r1', 'Marta');
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 }))), 'conductor: le llega la oferta 1');
  const seg = await segundosEnPantalla(p);
  ok(seg <= 16 && seg >= 13, `conductor: la cuenta regresiva arranca en 16 s, no en 25 (${seg})`);
  ok(Boolean(await hasta(() => delConductor('oferta_vista', 'v-r1').length === 1, 4000)), 'conductor: oferta_vista { viajeId } al verla');
  await foto(p, 'c01-oferta-16s');

  // Oferta 2 detrás: no se ha visto.
  ofrecer('v-r2', 'Pedro');
  ok(Boolean(await hasta(async () => /\+1 en espera/.test(await texto(p, '.a-solicitud.a-abierta')), 6000)), 'conductor: la oferta 2 queda «+1 en espera»');
  await p.waitForTimeout(700);
  ok(delConductor('oferta_vista', 'v-r2').length === 0, 'conductor: la que espera detrás no sale como vista');

  // «Rechazar» la 1: rechazo; la 2 pasa a la pantalla y sale como vista.
  await p.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await hasta(() => delConductor('rechazo', 'v-r1').length === 1, 4000)), 'conductor: «Rechazar» manda rechazo { viajeId }');
  ok(Boolean(await hasta(async () => /Pedro/.test(await tituloSolicitud(p)), 4000)), 'conductor: queda en pantalla la oferta 2');
  ok(Boolean(await hasta(() => delConductor('oferta_vista', 'v-r2').length === 1, 4000)), 'conductor: y ahora sí sale como vista');
  ok(delConductor('oferta_vista', 'v-r1').length === 1, 'conductor: oferta_vista de la 1 salió una sola vez');

  // La 2 se vence a los 16 s de llegar (no a los 25) y no manda rechazo.
  const t2 = Date.now();
  const fuera = await hasta(async () => !(await solicitudAbierta(p)), 21000, 200);
  const duro = (Date.now() - t2) / 1000;
  ok(Boolean(fuera) && duro < 18, `conductor: la oferta 2 se va a los 16 s de llegar (${duro.toFixed(1)} s después de rechazar la 1, que llegó ${((t2 - t1) / 1000).toFixed(1)} s antes)`);
  await p.waitForTimeout(500);
  ok(delConductor('rechazo', 'v-r2').length === 0, 'conductor: la oferta vencida no manda rechazo');
  // La central la vuelve a mandar (p. ej. al volver a entrar en turno): está en pantalla otra vez → oferta_vista otra vez.
  ofrecer('v-r2', 'Pedro');
  ok(Boolean(await hasta(() => delConductor('oferta_vista', 'v-r2').length === 2, 5000)), 'conductor: si la central la vuelve a mandar, oferta_vista otra vez (cuenta desde ahí)');
  await p.click('.a-solicitud [data-rechazar]');
  srv.ofertas.delete('v-r2');
  await p.waitForTimeout(400);

  // Oferta 3 con la app oculta: no se ha visto hasta volver.
  await visibilidad(p, true);
  await p.waitForTimeout(300);
  ofrecer('v-r3', 'Sofía');
  await p.waitForTimeout(1500);
  ok(delConductor('oferta_vista', 'v-r3').length === 0, 'conductor: la oferta que llega con la app oculta no sale como vista');
  await visibilidad(p, false);
  ok(Boolean(await hasta(() => delConductor('oferta_vista', 'v-r3').length === 1, 4000)), 'conductor: al volver con la oferta en pantalla, oferta_vista');
  await p.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await hasta(() => delConductor('rechazo', 'v-r3').length === 1, 4000)), 'conductor: rechaza la 3 (rechazo)');
  srv.ofertas.clear();

  // Un «rechazo» que mande la central no es «no te dejamos entrar».
  aTodos('conductor', 'rechazo', { codigo: 'conductor_no_aprobado', viajeId: 'v-r3' });
  await p.waitForTimeout(1500);
  ok(await enTurno(p), 'conductor: un mensaje «rechazo» de la central no lo saca del turno');
  ok((await p.evaluate(() => document.querySelector('[data-conexion]')?.dataset.estado || '')) !== 'rechazado', 'conductor: ni deja la conexión como rechazada');

  // El gerente cambia las reglas con la app abierta (mensaje «reglas»): la oferta siguiente cuenta 40 s.
  aTodos('conductor', 'reglas', { segundosOferta: 40, metrosLlegue: 60, minutosBusqueda: 5 });
  await p.waitForTimeout(600);
  ofrecer('v-r35', 'Camila');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  const seg40 = await segundosEnPantalla(p);
  ok(seg40 >= 37 && seg40 <= 40, `conductor: con el mensaje «reglas» (segundosOferta 40) la oferta siguiente cuenta 40 s (${seg40})`);
  ok(JSON.parse((await ls(p, CLAVE_REGLAS)) || 'null')?.segundosOferta === 40, 'conductor: y quedan guardadas');
  await p.click('.a-solicitud [data-rechazar]');
  srv.ofertas.clear();
  await p.waitForTimeout(500);

  // «Llegué» a ~100 m del punto: con metrosLlegue 60, no.
  ofrecer('v-r4', 'Lucía');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  await p.waitForTimeout(500);
  await p.click('.a-solicitud [data-aceptar]');
  ok(Boolean(await intento(vista(p, 'hacia_origen', 15000))), 'conductor: acepta la oferta 4 (hacia el punto, a ~100 m)');
  await p.waitForTimeout(800);
  await p.click('[data-llegue]');
  ok(await conAviso(p, /Aún no estás en el punto/, 5000), 'conductor: con metrosLlegue 60, «Llegué» a ~100 m dice «Aún no estás en el punto»');
  ok(delConductor('estado').filter((m) => m.datos?.fase === 'llego').length === 0, 'conductor: y no avisa «llegó»');
  await foto(p, 'c02-llegue-60m');

  // La central se reinicia sin reglas (una anterior): vuelve a 150 m y a 25 s.
  srv.reglas = null;
  const holas = srv.hola.filter((h) => h.rol === 'conductor').length;
  for (const cx of conexiones('conductor')) cx.ws.close({ code: 1012, reason: 'reinicio' });
  ok(Boolean(await hasta(() => srv.hola.filter((h) => h.rol === 'conductor').length > holas, 15000)), 'conductor: se reconecta a la central sin reglas');
  await p.waitForTimeout(1200);
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'hacia_origen'), 'conductor: sigue con su servicio (viaje_actual)');
  const sinReglas = JSON.parse((await ls(p, CLAVE_REGLAS)) || 'null');
  ok(sinReglas?.segundosOferta === 25 && sinReglas.metrosLlegue === 150 && sinReglas.minutosBusqueda === 10, `conductor: sin reglas en la bienvenida quedan las de siempre (${JSON.stringify(sinReglas)})`);
  await p.click('[data-llegue]');
  ok(Boolean(await hasta(() => delConductor('estado').some((m) => m.datos?.fase === 'llego' && m.datos?.viajeId === 'v-r4'), 6000)), 'conductor: con 150 m, «Llegué» a ~100 m avisa «llegó»');
  // El pasajero cancela: queda libre y la siguiente oferta dura 25 s.
  srv.viajesC.delete(LUIS);
  aTodos('conductor', 'cancelacion', { viajeId: 'v-r4', por: 'pasajero', motivo: 'Ya no lo necesito' });
  ok(Boolean(await intento(vista(p, 'libre', 10000))), 'conductor: el pasajero cancela y queda libre');
  await p.waitForTimeout(800);
  ofrecer('v-r5', 'Andrés');
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 10000 });
  const seg25 = await segundosEnPantalla(p);
  ok(seg25 >= 22 && seg25 <= 25, `conductor: sin reglas la oferta vuelve a contar 25 s (${seg25})`);
  ok(Boolean(await hasta(() => delConductor('oferta_vista', 'v-r5').length === 1, 4000)), 'conductor: oferta_vista también con la central sin reglas (la anterior lo ignora)');
  await p.click('.a-solicitud [data-rechazar]');
  srv.ofertas.clear();
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) Pasajero                                                         */
/* ------------------------------------------------------------------ */
const ANA = 'ana@prueba.taxicun.com';
async function entrarPasajero(p, correo) {
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', correo);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000);
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(600);
}
async function pedirTaxi(p) {
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
  const antes = delPasajero('solicitud').length;
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 15000);
  await hasta(() => delPasajero('solicitud').length > antes, 8000);
  return delPasajero('solicitud').at(-1)?.datos?.viajeId;
}
const cajaVisible = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-sin-taxis]');
  return Boolean(c && !c.hidden && c.offsetHeight > 0);
});

async function pasajero() {
  srv.reglas = { ...REGLAS };
  const { ctx, p } = await contexto('pasajero');
  await entrarPasajero(p, ANA);
  ok(JSON.parse((await ls(p, CLAVE_REGLAS)) || 'null')?.minutosBusqueda === 5, 'pasajero: las reglas de la bienvenida quedan guardadas');
  // Un taxi en el mapa (para ver que «taxis libres cerca» se esconde con el aviso).
  aTodos('pasajero', 'presencia', { conductorId: 'c_otro', movil: '05', disponible: true, pos: { lat: CENTRO.lat + 0.004, lng: CENTRO.lng } }, 'c_otro');
  const viajeId = await pedirTaxi(p);
  ok(Boolean(viajeId), `pasajero: pide el taxi y queda buscando (${viajeId})`);
  const guardado = await ls(p, 'tc.real.viaje.pasajero');
  ok(Boolean(await hasta(async () => /taxi libre/.test(await texto(p, '[data-taxis-cerca]')), 6000)), 'pasajero: «1 taxi libre cerca de ti» con el taxi en el mapa');
  ok(!(await cajaVisible(p)), 'pasajero: sin el aviso mientras la central no diga nada');

  // De otro viaje: no cuenta.
  aTodos('pasajero', 'sin_conductores', { viajeId: 'v-de-otro' });
  await p.waitForTimeout(800);
  ok(!(await cajaVisible(p)), 'pasajero: sin_conductores de otro viaje no cuenta');

  aTodos('pasajero', 'sin_conductores', { viajeId, motivo: 'sin_taxis' });
  ok(Boolean(await hasta(() => cajaVisible(p), 5000)), 'pasajero: sin_conductores → se ve el aviso en la hoja de «buscando»');
  const caja = await texto(p, '[data-sin-taxis]');
  ok(/No hay taxis en turno cerca/.test(caja) && /Ningún taxi de Cootransrural está en turno cerca de tu punto/.test(caja) && /Seguimos buscando/.test(caja), `pasajero: (sin_taxis) «No hay taxis en turno cerca… Seguimos buscando» (${caja.slice(0, 140)}…)`);
  const enlace = await p.getAttribute('[data-sin-taxis] [data-llamar-central]', 'href').catch(() => null);
  ok(enlace === `tel:${TEL_CENTRAL}` && /Llamar a la central/.test(caja), `pasajero: «Llamar a la central» con el teléfono de la ficha (${enlace})`);
  ok(await conAviso(p, /No hay taxis en turno cerca/), 'pasajero: aviso «No hay taxis en turno cerca»');
  ok(/llama a la central/.test((await avisos(p, /No hay taxis en turno cerca/))[0]?.cuerpo || ''), 'pasajero: el aviso sugiere llamar a la central');
  ok((await texto(p, '[data-taxis-cerca]')) === '', 'pasajero: ya no dice «taxis libres cerca» (no pueden recibirla)');
  ok(/Seguimos buscando un taxi libre/.test(await texto(p, '[data-mensaje]')), 'pasajero: el mensaje queda en «Seguimos buscando un taxi libre…»');
  await p.waitForTimeout(3000);
  ok(/Seguimos buscando un taxi libre/.test(await texto(p, '[data-mensaje]')), 'pasajero: y no rota mientras no haya taxis');
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: sigue buscando (no se cancela nada)');
  ok(delPasajero('cancelacion').length === 0, 'pasajero: la app no cancela la búsqueda');
  const cajaEnPantalla = await p.evaluate(() => {
    const r = document.querySelector('[data-llamar-central]')?.getBoundingClientRect();
    return Boolean(r) && r.bottom <= window.innerHeight && r.top >= 0;
  });
  ok(cajaEnPantalla, 'pasajero: «Llamar a la central» queda a la vista sin mover la hoja');
  await foto(p, 'p01-sin-taxis');
  aTodos('pasajero', 'sin_conductores', { viajeId, motivo: 'ocupados' });
  ok(Boolean(await hasta(async () => /Los taxis cercanos están ocupados/.test(await texto(p, '[data-sin-taxis]')), 4000)), 'pasajero: con otro motivo (ocupados) cambia el texto: «Los taxis cercanos están ocupados»');
  await p.waitForTimeout(600);
  ok((await avisos(p, /No hay taxis|ocupados|Ningún taxi tomó/)).length === 1, 'pasajero: repetido, el aviso emergente no se repite');

  // Ya le llegó a alguien.
  aTodos('pasajero', 'con_conductores', { viajeId });
  ok(Boolean(await hasta(async () => !(await cajaVisible(p)), 5000)), 'pasajero: con_conductores → se quita el aviso');
  ok(await conAviso(p, /Tu solicitud ya le llegó a un taxi/), 'pasajero: aviso «Tu solicitud ya le llegó a un taxi»');
  ok(Boolean(await hasta(async () => /taxi libre/.test(await texto(p, '[data-taxis-cerca]')), 6000)), 'pasajero: vuelve «taxis libres cerca»');
  aTodos('pasajero', 'sin_conductores', { viajeId, motivo: 'rechazado' });
  ok(Boolean(await hasta(() => cajaVisible(p), 5000)), 'pasajero: sin_conductores otra vez → aviso');
  ok(/Ningún taxi tomó tu solicitud/.test(await texto(p, '[data-sin-taxis]')), 'pasajero: (rechazado) «Ningún taxi tomó tu solicitud»');
  ok((await avisos(p, /No hay taxis|ocupados|Ningún taxi tomó/)).length === 1, 'pasajero: (el aviso emergente sale una vez por búsqueda)');

  // Recargar: la central repite sin_conductores después de viaje_actual si sigue así; si no, se olvida.
  srv.sinP.set(ANA, 'excluidos');
  const holasP = srv.hola.filter((h) => h.rol === 'pasajero').length;
  await p.reload();
  await vista(p, 'buscando', 20000);
  ok(Boolean(await hasta(() => cajaVisible(p), 8000)), 'pasajero: al recargar, la central lo repite y se ve otra vez');
  const excluidos = await texto(p, '[data-sin-taxis]');
  ok(/No hay taxis disponibles ahora/.test(excluidos) && !/pausa|cancel/i.test(excluidos), `pasajero: (excluidos) «No hay taxis disponibles ahora», sin decir que hay un conductor en pausa con él (${excluidos.slice(0, 60)}…)`);
  srv.sinP.delete(ANA);
  await p.reload();
  await vista(p, 'buscando', 20000);
  await hasta(() => srv.hola.filter((h) => h.rol === 'pasajero').length >= holasP + 2, 8000);
  await p.waitForTimeout(1500);
  ok(!(await cajaVisible(p)), 'pasajero: al recargar sin que la central lo repita (apareció alguien), el aviso se olvida');
  ok(JSON.parse((await ls(p, 'tc.real.viaje.pasajero')) || 'null')?.estado?.sinConductores === null, 'pasajero: (y no queda guardado)');
  aTodos('pasajero', 'sin_conductores', { viajeId: srv.viajesP.get(ANA)?.viajeId || viajeId, motivo: 'sin_taxis' });
  await hasta(() => cajaVisible(p), 5000);

  // La central suelta la búsqueda sin que nadie la recibiera.
  const vivo = srv.viajesP.get(ANA)?.viajeId || viajeId;
  srv.viajesP.delete(ANA);
  aTodos('pasajero', 'cancelacion', { viajeId: vivo, por: 'sistema', motivo: 'sin_conductor' });
  ok(await conAviso(p, /No hubo taxis disponibles/), 'pasajero: la central suelta la búsqueda → «No hubo taxis disponibles»');
  const ultimo = (await avisos(p, /No hubo taxis disponibles/)).at(-1);
  ok(/llama a la central/.test(ultimo?.cuerpo || ''), `pasajero: «Intenta de nuevo en unos minutos o llama a la central.» (${ultimo?.cuerpo})`);
  ok(Boolean(await intento(vista(p, 'inicio', 8000))), 'pasajero: vuelve al inicio');
  ok(!(await cajaVisible(p)), 'pasajero: sin el aviso fuera de «buscando»');

  // minutosBusqueda: una búsqueda guardada de hace 6 min que la central ya no tiene.
  const conHace = (min) => {
    const g = JSON.parse(guardado);
    const t = Date.now() - min * 60000;
    g.guardado = Date.now();
    g.fase = 'buscando';
    Object.assign(g.estado.viaje, { creado: t, solicitadoEn: t, enCola: false, porReenviar: false });
    g.estado.sinConductores = null;
    return JSON.stringify(g);
  };
  await p.evaluate((g) => localStorage.setItem('tc.real.viaje.pasajero', g), conHace(6));
  const pedidas = delPasajero('solicitud').length;
  await p.reload();
  ok(await conAviso(p, /Tu servicio anterior terminó/, 10000), 'pasajero: con minutosBusqueda 5, la búsqueda de hace 6 min no se vuelve a pedir («Tu servicio anterior terminó»)');
  await p.waitForTimeout(800);
  ok(delPasajero('solicitud').length === pedidas, 'pasajero: (no sale otra solicitud)');
  srv.reglas = null;
  await p.evaluate((g) => localStorage.setItem('tc.real.viaje.pasajero', g), conHace(6));
  await p.reload();
  ok(Boolean(await hasta(() => delPasajero('solicitud').length > pedidas, 10000)), 'pasajero: con la central sin reglas (10 min), la de hace 6 min se vuelve a pedir');
  await p.waitForTimeout(800);
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: y sigue buscando');
  ok(JSON.parse((await ls(p, CLAVE_REGLAS)) || 'null')?.minutosBusqueda === 10, 'pasajero: sin reglas en la bienvenida quedan las de siempre');
  await ctx.close();
  srv.viajesP.delete(ANA);
}

// Modo revisor: no se ofrece la central de verdad.
async function revisor() {
  srv.reglas = { ...REGLAS };
  srv.revisores.add('rita@prueba.taxicun.com');
  const { ctx, p } = await contexto('revisor');
  await entrarPasajero(p, 'rita@prueba.taxicun.com');
  const viajeId = await pedirTaxi(p);
  aTodos('pasajero', 'sin_conductores', { viajeId });
  ok(Boolean(await hasta(() => cajaVisible(p), 5000)), 'revisor: sin_conductores → aviso');
  ok(!(await p.$('[data-sin-taxis] [data-llamar-central]')), 'revisor: sin «Llamar a la central» (no se le ofrece la central de verdad)');
  const a = (await avisos(p, /No hay taxis disponibles ahora/)).at(-1);
  ok(a && !/central/.test(a.cuerpo), `revisor: el aviso no menciona la central (${a?.cuerpo})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* c) Textos de cada motivo y la demo                                  */
/* ------------------------------------------------------------------ */
async function demo() {
  const { ctx, p } = await contexto('demo', { simular: false });
  let sockets = 0;
  p.on('websocket', (w) => {
    if (/\/api\/bus/.test(w.url())) sockets += 1;
  });
  await p.goto(`${BASE}conductor/`);
  await p.waitForSelector('[data-conectar], .a-ingreso', { timeout: 30000 }).catch(() => {});
  const desbloqueado = await p.evaluate(async (base) => {
    const N = await import(`${base}nucleo/index.js`);
    return { real: N.MODO_REAL, reglas: Boolean(N.reglas?.MENSAJES), porDefecto: N.reglas?.REGLAS_POR_DEFECTO, aceptar: N.TIEMPOS.aceptar };
  }, BASE);
  ok(desbloqueado.real === false && desbloqueado.aceptar === 25000, `demo: sin modo real y la oferta de la demo sigue en 25 s (${JSON.stringify(desbloqueado)})`);
  ok(desbloqueado.porDefecto?.segundosOferta === 25 && desbloqueado.porDefecto.metrosLlegue === 150 && desbloqueado.porDefecto.minutosBusqueda === 10, 'demo: los valores por defecto de las reglas son los de hoy (25 s, 150 m, 10 min)');
  ok(sockets === 0 && !(await ls(p, CLAVE_REGLAS)), 'demo: no abre /api/bus ni guarda reglas');
  const textos = await p.evaluate(async (base) => {
    const R = await import(`${base}nucleo/reglas.js`);
    const t = (m) => R.textoSinConductores(m, 'Cootransrural');
    return {
      motivos: ['sin_taxis', 'ocupados', 'rechazado', 'excluidos', 'otro', undefined].map((m) => t(m)),
      topes: [R.leerReglas({ reglas: { segundosOferta: 5, metrosLlegue: 900, minutosBusqueda: '7' } }), R.leerReglas({ segundosOferta: 30 }), R.leerReglas(null), R.traeReglas({ rol: 'pasajero' })],
    };
  }, BASE);
  const [sinTaxis, ocupados, rechazado, excl, otro, nada] = textos.motivos;
  ok(new Set([sinTaxis.titulo, ocupados.titulo, rechazado.titulo, excl.titulo]).size === 4, `textos: un título por motivo (${[sinTaxis, ocupados, rechazado, excl].map((x) => x.titulo).join(' · ')})`);
  ok(excl.titulo === otro.titulo && otro.titulo === nada.titulo && !/pausa|cancel/i.test(excl.detalle), 'textos: «excluidos» y un motivo desconocido dicen lo mismo, sin hablar de la pausa');
  ok([sinTaxis, ocupados, rechazado, excl].every((x) => /Seguimos buscando/.test(x.detalle)), 'textos: todos dicen que se sigue buscando');
  const [topes, sueltas, vacias, sinNada] = textos.topes;
  ok(topes.segundosOferta === 15 && topes.metrosLlegue === 300 && topes.minutosBusqueda === 7, `reglas: fuera de los topes se llevan al tope y «7» vale 7 (${JSON.stringify(topes)})`);
  ok(sueltas.segundosOferta === 30 && sueltas.metrosLlegue === 150 && vacias.segundosOferta === 25 && sinNada === false, 'reglas: sueltas (mensaje «reglas») valen; lo que falta queda con los valores de hoy');
  await ctx.close();
}

let detenida = '';
try {
  await conductor();
  await pasajero();
  await revisor();
  await demo();
} catch (e) {
  detenida = e?.stack || String(e);
}
await b.close();
if (detenida) {
  fallas += 1;
  console.log(`✘ la prueba se detuvo: ${detenida}`);
}
console.log(errores.length ? `\nErrores de la página:\n${errores.join('\n')}` : '\nErrores de la página: ninguno');
ok(!errores.length, 'sin errores de JavaScript');
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘ · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
