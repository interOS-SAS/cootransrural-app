// Ronda A de «algoritmos» (servidor 0.14.0: despacho por cercanía y por turnos de paradero, llegada y precio por calles)
// en las apps del diseño A, modo real (?real=1), con el servidor de TaxiCun simulado aquí mismo (HTTP con page.route y el
// WebSocket /api/bus con routeWebSocket), siguiendo el contrato de DISENO-RONDA-A.md §8 y §11 (nucleo/reparto.js).
// Recorre:
//  a) pasajero con rutas (bienvenida.rutas): con el pin quieto, «El taxi más cercano llega en ~X min» y «Taxi a ~X min»
//     (una consulta por celda, después de 800 ms quieto, nunca con la app oculta, más de 30 → «más de 30 min»);
//     «Confirma tu viaje» con el valor del servidor y el chip «Valor por la ruta en calles · {km}»; la solicitud con la
//     ficha (cotizacion), conCotizacion, la tarifa y el km del servidor sin otra consulta; la ficha por vencer se
//     renueva antes de pedir; cotizacion_vencida con el mismo valor → se reenvía sola; con otro → «El precio de tu viaje
//     cambió» (pedir por el nuevo, o volver a «Confirma tu viaje»); sin cotización en el error → se vuelve a cotizar; el
//     recorte de los topes (detalle «Valor calculado por TaxiCun»); destino de la tabla oficial → el chip de hoy;
//     cotización caída (503) → como hoy, con conCotizacion.
//  b) pasajero contra un servidor 0.13.0 (sin rutas ni modo): ninguna llamada a /api/viajes/*, la etiqueta del pin con
//     el cálculo de hoy, el chip de hoy y la solicitud con los mismos campos de hoy.
//  c) conductor (modo «turno»): fila (entrar, subir, al final, salir, sin señal, modo) con su chip y sus avisos; la
//     tarjeta con «Turno de paradero», «Eres el más cercano», «Estás entre los más cercanos», «Llevas más tiempo sin
//     servicio» y la nota de la fila; «hasta el pasajero» con llegadaMin; la central tiene prioridad; campos raros se
//     descartan; bienvenida.fila al reconectarse; salir de turno quita la fila; presencia con pos.precision; nombres de
//     paradero con <img onerror>/<b> se ven como texto.
//  d) conductor contra un servidor 0.13.0: la tarjeta y la pantalla de hoy.
//  e) capturas a 1366 px; la demo (sin ?real) no llama a /api/viajes/* y reglas.modo por defecto.
//
// Uso: node pruebas/algoritmos-a-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5721 --api=http://127.0.0.1:5729). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { crearTarifador } from '../nucleo/tarifador.js';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5721/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/algoritmos/ronda-a/capturas/app').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA_COOP = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const T = crearTarifador(FICHA_COOP);
const CENTRO = FICHA_COOP.CENTRO;
const LUGAR = (n) => FICHA_COOP.LUGARES.find((l) => l.nombre === n);
const ESTIMADA = LUGAR('Tierra Grata'); // fuera de la tabla oficial: valor por distancia
const OFICIAL = LUGAR('Barrio San Carlos'); // de la tabla oficial
const CODIGO = '123456';
const KM_CALLES = 4.8; // la ruta por calles (en línea recta es menos)
const PARADERO_XSS = '<img src=x onerror="window.__xss=1"><b>Paradero</b> «Cra. 9»';

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
/* Servidor de TaxiCun simulado (contrato §8)                           */
/* ------------------------------------------------------------------ */
const CUENTAS = {
  'ana@prueba.taxicun.com': { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
  'beto@prueba.taxicun.com': { nombre: 'Beto Pérez', celular: '3001234569', conductor: null },
  'luis@prueba.taxicun.com': {
    nombre: 'Luis Alberto Rodríguez', celular: '3109876543',
    conductor: { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' },
  },
  'nora@prueba.taxicun.com': {
    nombre: 'Nora Díaz', celular: '3109876544',
    conductor: { estado: 'aprobado', empresa: 'cootransrural', movil: '031', placa: 'WFK124', vehiculo: 'Kia Picanto', color: 'Amarillo' },
  },
};
const srv = {
  n: 0,
  nuevo: true, // false = servidor 0.13.0 (sin rutas, sin modo, sin campos nuevos)
  modo: 'turno',
  llegadaMin: 4,
  filaBienvenida: null,
  cotizar: null, // (cuerpo) → { estado, datos } para la próxima cotización (null: la de siempre)
  vencer: null, // datos del próximo error cotizacion_vencida (se gasta con la siguiente solicitud)
  usuarios: new Map(),
  sesiones: new Map(),
  mensajes: [],
  cotizaciones: [],
  llegadas: [],
  sockets: new Set(),
};
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ficha = () => `c1.${b64({ n: ++srv.n, e: 'cootransrural', relleno: 'xxxxxxxxxxxx' })}.${'F'.repeat(42)}${srv.n % 10}`;
// La de siempre: valor del tarifador con el km de la ruta por calles (tabla oficial intacta), 15 min.
function cotizacionPorDefecto(c) {
  const d = c?.destino && Number.isFinite(c.destino.lat) ? c.destino : null;
  const t = T.calcularTarifa({ origen: c.origen, destino: d, km: d ? KM_CALLES : undefined, fecha: new Date() });
  const tabla = t.tipo !== 'estimada';
  return { cotizacion: ficha(), valor: t.total, tipo: t.tipo, km: d && !tabla ? KM_CALLES : d ? 1.2 : null, min: d ? 12 : null, fuente: tabla ? 'tabla' : 'ruta', vence: Date.now() + 15 * 60000, version: 7 };
}
const crearUsuario = (correo) => {
  const base = CUENTAS[correo] || { nombre: '', celular: '', conductor: null };
  const u = { id: `u${++srv.n}`, correo, nombre: base.nombre, celular: base.celular, conductor: base.conductor ? { ...base.conductor } : null };
  srv.usuarios.set(correo, u);
  return u;
};
const yoDe = (correo) => {
  const u = srv.usuarios.get(correo);
  return { usuario: { id: u.id, correo: u.correo, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor };
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
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'yo') return conSesion(() => responder(200, yoDe(correo)));
  if (metodo === 'PATCH' && ruta === 'yo') return conSesion(() => responder(200, yoDe(correo)));
  // Ronda A (0.14.0). El servidor 0.13.0 responde el 404 de Fastify.
  if (ruta === 'viajes/cotizacion' || ruta === 'viajes/llegada') {
    const lista = ruta === 'viajes/llegada' ? srv.llegadas : srv.cotizaciones;
    lista.push({ cuerpo, t: Date.now(), sesion: Boolean(correo) });
    if (!srv.nuevo) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Route POST:/api/${ruta} not found`, error: 'Not Found', statusCode: 404 }) });
    return conSesion(() => {
      if (ruta === 'viajes/llegada') return responder(200, { min: srv.llegadaMin, fuente: 'ruta' });
      const r = srv.cotizar ? srv.cotizar(cuerpo) : null;
      srv.cotizar = null;
      if (r) {
        if (r.estado === 200) srv.ultimaCotizacion = r.datos;
        return responder(r.estado, r.datos);
      }
      srv.ultimaCotizacion = cotizacionPorDefecto(cuerpo);
      return responder(200, srv.ultimaCotizacion);
    });
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
const conexiones = (rol) => [...srv.sockets].filter((cx) => cx.rol === rol);
const aTodos = (rol, tipo, datos, de) => conexiones(rol).forEach((cx) => enviar(cx, tipo, datos, de));
const reglas = () => ({ segundosOferta: 25, metrosLlegue: 150, minutosBusqueda: 10, ...(srv.nuevo ? { modo: srv.modo } : {}) });

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
      const u = srv.usuarios.get(correo);
      if (cx.rol === 'conductor') {
        enviar(cx, 'bienvenida', {
          rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, reglas: reglas(),
          conductor: { id: `c_${u.id}`, ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 5, viajes: 0 },
          ...(srv.nuevo && srv.filaBienvenida ? { fila: srv.filaBienvenida } : {}),
        });
        enviar(cx, 'viaje_actual', null);
      } else {
        enviar(cx, 'bienvenida', {
          rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: `p_${u.id}`, reglas: reglas(),
          ...(srv.nuevo ? { rutas: { cotizar: true, llegada: true } } : {}),
        });
        enviar(cx, 'viaje_actual', null);
      }
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol === 'pasajero' && m.tipo === 'solicitud' && srv.vencer) {
      const d = srv.vencer;
      srv.vencer = null;
      enviar(cx, 'error', { codigo: 'cotizacion_vencida', viajeId: m.datos?.viajeId, ...d });
    }
    if (cx.rol === 'conductor' && m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
  });
}

const delRol = (rol, tipo, correo) => srv.mensajes.filter((m) => m.rol === rol && m.tipo === tipo && (!correo || m.correo === correo));
const oferta = (viajeId, extra = {}) => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre: 'Marta', calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.0009, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
  destino: { lat: ESTIMADA.lat, lng: ESTIMADA.lng, titulo: ESTIMADA.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
  ...extra,
});
const ofrecer = (viajeId, extra) => {
  const s = oferta(viajeId, extra);
  for (const cx of conexiones('conductor')) enviar(cx, 'solicitud', s, s.pasajero.id);
  return s;
};

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const navegador = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { simular = true, ancho = 390, alto = 844 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  if (simular) {
    await ctx.route(`${BASE}api/**`, atenderApi);
    await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  }
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
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const visible = (p, sel) => p.evaluate((s) => {
  const n = document.querySelector(s);
  return Boolean(n && !n.hidden && n.offsetHeight > 0);
}, sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const avisos = (p, re) => p.evaluate((f) => (window.__avisos || []).filter((a) => new RegExp(f).test(a.titulo)), re.source);
const conAviso = async (p, re, timeout = 8000) => Boolean(await hasta(async () => (await avisos(p, re)).length > 0, timeout));
const sinXss = (p) => p.evaluate(() => window.__xss === undefined && !document.querySelector('.a-toast img, .a-toast b, .a-fila-chip img, .a-fila-chip b, .a-solicitud img, .a-sol-motivo b, .a-sol-fila b, .a-sol-nota-fila b'));
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
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
async function arrastrarMapa(p, dx, dy) {
  const x = 195;
  const y = 170;
  await p.mouse.move(x, y);
  await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await p.mouse.up();
}

// Mueve el pin a otra celda y espera la consulta de llegada (un arrastre que Leaflet no tomó se repite una vez).
async function moverPin(p, dx, dy) {
  for (let i = 0; i < 2; i++) {
    const n = srv.llegadas.length;
    await p.waitForTimeout(300);
    await arrastrarMapa(p, dx, dy);
    if (await hasta(() => srv.llegadas.length > n, 4000)) return true;
  }
  return false;
}
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
async function aConfirmar(p, lugar) {
  // «Volver» desde «Confirma tu viaje» deja abierto el buscador.
  await p.waitForTimeout(400);
  if (!(await p.$('.a-buscador.a-abierto'))) await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await p.fill('[data-q]', lugar.nombre);
  const fila = `.a-buscador .a-fila:has-text("${lugar.nombre}")`;
  await p.waitForSelector(fila, { timeout: 10000 });
  await p.waitForTimeout(400);
  // Con recientes hay varias filas con el mismo nombre (una puede quedar tapada): el clic va directo a la primera.
  await p.evaluate((n) => [...document.querySelectorAll('.a-buscador .a-fila')].find((b) => b.textContent.includes(n))?.click(), lugar.nombre);
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await p.waitForTimeout(500);
}
async function pedir(p) {
  const antes = delRol('pasajero', 'solicitud').length;
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 15000);
  await hasta(() => delRol('pasajero', 'solicitud').length > antes, 8000);
  return delRol('pasajero', 'solicitud').at(-1)?.datos;
}
// La central suelta la búsqueda: la app vuelve al inicio.
async function soltar(p, viajeId) {
  aTodos('pasajero', 'cancelacion', { viajeId, por: 'sistema', motivo: 'sin_conductor' });
  await vista(p, 'inicio', 10000).catch(() => {});
  await p.waitForTimeout(500);
}
const pesos = (v) => `$${Number(v).toLocaleString('es-CO').replace(/,/g, '.')}`;

/* ------------------------------------------------------------------ */
/* a) Pasajero con rutas                                                */
/* ------------------------------------------------------------------ */
async function pasajeroConRutas() {
  srv.nuevo = true;
  const { ctx, p } = await contexto('pasajero');
  await entrarPasajero(p, 'ana@prueba.taxicun.com');
  ok(Boolean(await hasta(() => srv.llegadas.length >= 1, 8000)), `llegada: con el pin quieto, una consulta a /api/viajes/llegada (${srv.llegadas.length})`);
  const c0 = srv.llegadas[0]?.cuerpo || {};
  ok(JSON.stringify(Object.keys(c0).sort()) === '["empresa","origen"]' && c0.empresa === 'cootransrural' && JSON.stringify(Object.keys(c0.origen || {}).sort()) === '["lat","lng"]' && srv.llegadas[0].sesion, `llegada: solo empresa y el punto (lat, lng), con sesión (${JSON.stringify(c0)})`);
  ok(Boolean(await hasta(async () => (await texto(p, '[data-pin-etiqueta]')) === 'Taxi a ~4 min', 6000)), `llegada: el pin dice «Taxi a ~4 min» (${await texto(p, '[data-pin-etiqueta]')})`);
  ok(Boolean(await hasta(async () => (await visible(p, '[data-llegada-cerca]')) && (await texto(p, '[data-llegada-cerca]')) === 'El taxi más cercano llega en ~4 min', 6000)), `llegada: el inicio dice «El taxi más cercano llega en ~4 min» (${await texto(p, '[data-llegada-cerca]')})`);
  await foto(p, 'p01-llegada-inicio');
  const n0 = srv.llegadas.length;
  await p.waitForTimeout(3000);
  ok(srv.llegadas.length === n0, `llegada: con el pin quieto no se repite enseguida (${srv.llegadas.length - n0} más en 3 s)`);
  // Mover el pin a otra celda: una consulta, después de 800 ms quieto.
  srv.llegadaMin = 7;
  await arrastrarMapa(p, 0, -220);
  await p.waitForTimeout(400);
  ok(srv.llegadas.length === n0, 'llegada: antes de 800 ms quieto, ninguna consulta');
  ok(Boolean(await hasta(() => srv.llegadas.length === n0 + 1, 4000)), `llegada: el pin quieto en otra celda → una consulta (${srv.llegadas.length - n0})`);
  ok(Boolean(await hasta(async () => (await texto(p, '[data-pin-etiqueta]')) === 'Taxi a ~7 min', 4000)), 'llegada: «Taxi a ~7 min» con el dato nuevo');
  // Más de 30.
  srv.llegadaMin = 45;
  await moverPin(p, 0, -220);
  ok(Boolean(await hasta(async () => /más de 30 min/.test(await texto(p, '[data-llegada-cerca]')), 5000)), `llegada: más de 30 → «El taxi más cercano está a más de 30 min» (${await texto(p, '[data-llegada-cerca]')})`);
  ok((await texto(p, '[data-pin-etiqueta]')) === 'Taxi a más de 30 min', 'llegada: el pin, «Taxi a más de 30 min»');
  // Con la app oculta, nada.
  srv.llegadaMin = 4;
  await visibilidad(p, true);
  const n1 = srv.llegadas.length;
  await arrastrarMapa(p, 0, 440);
  await p.waitForTimeout(1600);
  ok(srv.llegadas.length === n1, 'llegada: con la app oculta no consulta');
  await visibilidad(p, false);
  await arrastrarMapa(p, 0, 5);
  ok(Boolean(await hasta(() => srv.llegadas.length === n1 + 1, 4000)), 'llegada: al volver y mover el pin, consulta otra vez');
  // Sin taxis libres: min null → no se dice nada nuevo.
  srv.llegadaMin = null;
  await moverPin(p, 220, 0);
  ok(Boolean(await hasta(async () => !(await visible(p, '[data-llegada-cerca]')), 5000)), 'llegada: sin taxis libres (min null), sin la línea');
  srv.llegadaMin = 4;
  await moverPin(p, -220, 0);
  await hasta(async () => (await texto(p, '[data-pin-etiqueta]')) === 'Taxi a ~4 min', 5000);

  // Confirma tu viaje con el valor por la ruta en calles.
  const nc = srv.cotizaciones.length;
  await aConfirmar(p, ESTIMADA);
  ok(srv.cotizaciones.length === nc + 1, `cotización: una consulta al abrir «Confirma tu viaje» (${srv.cotizaciones.length - nc})`);
  const cq = srv.cotizaciones.at(-1)?.cuerpo || {};
  ok(cq.empresa === 'cootransrural' && JSON.stringify(Object.keys(cq.origen || {}).sort()) === '["lat","lng"]' && Math.abs(cq.destino?.lat - ESTIMADA.lat) < 1e-6 && !('titulo' in (cq.destino || {})), `cotización: empresa, origen y destino (solo puntos) (${JSON.stringify(cq)})`);
  const esperado = T.calcularTarifa({ origen: cq.origen, destino: cq.destino, km: KM_CALLES, fecha: new Date() }).total;
  ok(Boolean(await hasta(async () => /Valor por la ruta en calles · 4,8 km/.test(await texto(p, '[data-chip-tarifa]')), 6000)), `cotización: chip «Valor por la ruta en calles · 4,8 km» (${await texto(p, '[data-chip-tarifa]')})`);
  ok((await texto(p, '[data-total]')) === pesos(esperado) && (await texto(p, '[data-total-boton]')) === pesos(esperado), `cotización: el valor del servidor en la tarjeta y el botón (${await texto(p, '[data-total]')} = ${pesos(esperado)})`);
  ok(/4,8 km/.test(await texto(p, '[data-ruta-sub]')) && /12 min/.test(await texto(p, '[data-ruta-sub]')), `cotización: km y min de la ruta por calles (${await texto(p, '[data-ruta-sub]')})`);
  await foto(p, 'p02-confirmar-ruta');
  const s1 = await pedir(p);
  ok(srv.cotizaciones.length === nc + 1, 'pedir: con la ficha vigente no se vuelve a cotizar');
  ok(typeof s1?.cotizacion === 'string' && /^c1\./.test(s1.cotizacion) && s1.conCotizacion === true && s1.tarifa === esperado && s1.km === KM_CALLES && s1.min === 12, `pedir: la solicitud lleva la ficha, conCotizacion, la tarifa y el km del servidor (${JSON.stringify({ c: s1?.cotizacion?.slice(0, 12), con: s1?.conCotizacion, t: s1?.tarifa, km: s1?.km, min: s1?.min })})`);
  // cotizacion_vencida con el mismo valor: se reenvía sola con la ficha nueva.
  const ns = delRol('pasajero', 'solicitud').length;
  const nueva = cotizacionPorDefecto(srv.cotizaciones.at(-1).cuerpo);
  srv.vencer = null;
  aTodos('pasajero', 'error', { codigo: 'cotizacion_vencida', viajeId: s1.viajeId, cotizacion: nueva });
  ok(Boolean(await hasta(() => delRol('pasajero', 'solicitud').length === ns + 1, 5000)), 'cotizacion_vencida (mismo valor): se reenvía sola');
  const s2 = delRol('pasajero', 'solicitud').at(-1).datos;
  ok(s2.cotizacion === nueva.cotizacion && s2.tarifa === esperado && s2.viajeId === s1.viajeId, 'cotizacion_vencida (mismo valor): con la ficha nueva y el mismo viaje');
  ok(!(await p.$('.a-modal-precio')), 'cotizacion_vencida (mismo valor): sin preguntar nada');
  // Con otro valor: se pregunta. «Pedir por …».
  const otra = { ...cotizacionPorDefecto(srv.cotizaciones.at(-1).cuerpo), cotizacion: ficha(), valor: esperado + 1500 };
  aTodos('pasajero', 'error', { codigo: 'cotizacion_vencida', viajeId: s1.viajeId, cotizacion: otra });
  ok(Boolean(await intento(p.waitForSelector('.a-modal-precio', { timeout: 6000 }))), 'cotizacion_vencida (otro valor): se abre «El precio de tu viaje cambió»');
  const modal = await texto(p, '.a-modal-precio');
  ok(/El precio de tu viaje cambió/.test(modal) && modal.includes(`Ahora es ${pesos(esperado + 1500)} (antes ${pesos(esperado)}). ¿Pides el taxi por ${pesos(esperado + 1500)}?`) && modal.includes(`Pedir por ${pesos(esperado + 1500)}`) && /Cambiar el viaje/.test(modal), `diálogo: título, texto y botones (${modal})`);
  await p.waitForTimeout(600);
  await foto(p, 'p03-precio-cambio');
  ok(delRol('pasajero', 'solicitud').length === ns + 1, 'diálogo: mientras pregunta no sale nada');
  await p.click(`.a-modal-precio button:has-text("Pedir por")`);
  ok(Boolean(await hasta(() => delRol('pasajero', 'solicitud').length === ns + 2, 5000)), '«Pedir por …»: sale la solicitud');
  const s3 = delRol('pasajero', 'solicitud').at(-1).datos;
  ok(s3.cotizacion === otra.cotizacion && s3.tarifa === esperado + 1500, `«Pedir por …»: con la ficha y el valor nuevos (${s3.tarifa})`);
  ok(await p.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), '«Pedir por …»: sigue buscando');
  await soltar(p, s1.viajeId);

  // Otro viaje: cotizacion_vencida sin la cotización → se vuelve a cotizar y se pregunta; «Cambiar el viaje».
  await aConfirmar(p, ESTIMADA);
  const s4 = await pedir(p);
  const nc2 = srv.cotizaciones.length;
  srv.cotizar = (c) => ({ estado: 200, datos: { ...cotizacionPorDefecto(c), valor: esperado + 2500 } });
  aTodos('pasajero', 'error', { codigo: 'cotizacion_vencida', viajeId: s4.viajeId });
  ok(Boolean(await hasta(() => srv.cotizaciones.length === nc2 + 1, 6000)), 'cotizacion_vencida sin cotización: la app vuelve a cotizar');
  ok(Boolean(await intento(p.waitForSelector('.a-modal-precio', { timeout: 6000 }))), 'cotizacion_vencida sin cotización: y pregunta');
  const nsx = delRol('pasajero', 'solicitud').length;
  await p.click('.a-modal-precio button:has-text("Cambiar el viaje")');
  ok(Boolean(await intento(vista(p, 'confirmar', 8000))), '«Cambiar el viaje»: vuelve a «Confirma tu viaje»');
  ok(/Tierra Grata/.test(await texto(p, '.a-hoja')), '«Cambiar el viaje»: con el mismo destino');
  await p.waitForTimeout(800);
  ok(delRol('pasajero', 'solicitud').length === nsx && delRol('pasajero', 'cancelacion').length === 0, '«Cambiar el viaje»: no sale ninguna solicitud ni cancelación');

  // La ficha por vencer al pedir: se pide otra (mismo valor: sin preguntar).
  srv.cotizar = (c) => ({ estado: 200, datos: { ...cotizacionPorDefecto(c), vence: Date.now() + 30000 } });
  await p.click('[data-volver]').catch(() => {});
  await vista(p, 'inicio', 8000).catch(() => {});
  await aConfirmar(p, ESTIMADA);
  const nc3 = srv.cotizaciones.length;
  const s5 = await pedir(p);
  ok(srv.cotizaciones.length === nc3 + 1, 'pedir con la ficha por vencer (< 60 s): se cotiza otra vez antes de pedir');
  ok(s5.cotizacion === srv.ultimaCotizacion?.cotizacion && !(await p.$('.a-modal-precio')), 'pedir con la ficha por vencer: sale con la ficha nueva (mismo valor: sin preguntar)');
  await soltar(p, s5.viajeId);

  // El recorte de los topes: el valor del servidor es otro que el del tarifador → «Valor calculado por TaxiCun».
  srv.cotizar = (c) => ({ estado: 200, datos: { ...cotizacionPorDefecto(c), valor: 9000 } });
  await aConfirmar(p, ESTIMADA);
  ok((await texto(p, '[data-total]')) === pesos(9000), `topes: el valor del servidor manda (${await texto(p, '[data-total]')})`);
  await p.click('[data-ver-detalle], [data-detalle]').catch(() => {});
  ok(/Valor calculado por TaxiCun/.test(await p.evaluate(() => document.querySelector('[data-detalle-lista]')?.textContent || '')), 'topes: el detalle dice «Valor calculado por TaxiCun»');
  await p.click('[data-volver]').catch(() => {});
  await vista(p, 'inicio', 8000).catch(() => {});

  // Destino de la tabla oficial: el chip de hoy.
  await aConfirmar(p, OFICIAL);
  ok(/Tarifa oficial/.test(await texto(p, '[data-chip-tarifa]')) && !(await p.$('[data-chip-tarifa][data-cotizacion]')), `tabla oficial: el chip de hoy (${await texto(p, '[data-chip-tarifa]')})`);
  await p.click('[data-volver]').catch(() => {});
  await vista(p, 'inicio', 8000).catch(() => {});

  // La cotización falla (503): como hoy, pero la solicitud dice que entiende cotizacion_vencida.
  srv.cotizar = () => ({ estado: 503, datos: { error: 'sin_tarifas' } });
  await aConfirmar(p, ESTIMADA);
  ok(/Tarifa estimada/.test(await texto(p, '[data-chip-tarifa]')), `cotización caída: el chip de hoy (${await texto(p, '[data-chip-tarifa]')})`);
  srv.cotizar = () => ({ estado: 503, datos: { error: 'sin_tarifas' } });
  const s6 = await pedir(p);
  ok(s6 && !('cotizacion' in s6) && s6.conCotizacion === true && Number.isFinite(s6.tarifa), `cotización caída: la solicitud sin ficha y con conCotizacion (${JSON.stringify({ c: s6?.cotizacion, con: s6?.conCotizacion })})`);
  await soltar(p, s6.viajeId);
  ok(await sinXss(p), 'pasajero: sin HTML inyectado');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) Pasajero con el servidor 0.13.0                                   */
/* ------------------------------------------------------------------ */
async function pasajeroServidorAnterior() {
  srv.nuevo = false;
  const nl = srv.llegadas.length;
  const nc = srv.cotizaciones.length;
  const { ctx, p } = await contexto('pasajero-0.13');
  await entrarPasajero(p, 'beto@prueba.taxicun.com');
  aTodos('pasajero', 'presencia', { conductorId: 'c_otro', movil: '05', disponible: true, pos: { lat: CENTRO.lat + 0.004, lng: CENTRO.lng } }, 'c_otro');
  await arrastrarMapa(p, 0, 30);
  ok(Boolean(await hasta(async () => /^Taxi a \d+ min$/.test(await texto(p, '[data-pin-etiqueta]')), 6000)), `0.13.0: el pin con el cálculo de hoy (${await texto(p, '[data-pin-etiqueta]')})`);
  ok(!(await visible(p, '[data-llegada-cerca]')), '0.13.0: sin la línea «El taxi más cercano…»');
  await aConfirmar(p, ESTIMADA);
  ok(/Tarifa estimada/.test(await texto(p, '[data-chip-tarifa]')), '0.13.0: el chip de hoy');
  const s = await pedir(p);
  const hoy = ['viajeId', 'origen', 'destino', 'metodoPago', 'nota', 'tarifa', 'km', 'min', 'codigoHash'];
  ok(JSON.stringify(Object.keys(s || {}).sort()) === JSON.stringify([...hoy].sort()), `0.13.0: la solicitud con los campos de hoy (${Object.keys(s || {}).join(', ')})`);
  ok(srv.llegadas.length === nl && srv.cotizaciones.length === nc, '0.13.0: ninguna llamada a /api/viajes/*');
  await foto(p, 'p04-servidor-0.13');
  await soltar(p, s.viajeId);
  await ctx.close();
  srv.nuevo = true;
}

/* ------------------------------------------------------------------ */
/* c) Conductor (modo «turno»)                                          */
/* ------------------------------------------------------------------ */
async function entrarConductor(p, correo) {
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
}
async function enTurno(p, correo) {
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  await hasta(() => delRol('conductor', 'presencia', correo).some((m) => m.datos?.disponible === true), 8000);
  await p.waitForTimeout(500);
}
const chip = (p) => texto(p, '[data-fila]');
// textContent: el CSS pone en mayúsculas la etiqueta de arriba.
const tarjeta = (p) => p.evaluate(() => document.querySelector('.a-solicitud.a-abierta')?.textContent.replace(/\s+/g, ' ').trim() || '');
async function cerrarOferta(p, viajeId) {
  aTodos('conductor', 'cancelacion', { viajeId, por: 'pasajero', motivo: 'Ya no lo necesito' });
  await hasta(async () => !(await p.$('.a-solicitud')), 6000);
  await p.waitForTimeout(400);
}

async function conductorTurno({ ancho = 390 } = {}) {
  srv.nuevo = true;
  srv.modo = 'turno';
  srv.filaBienvenida = null;
  const correo = 'luis@prueba.taxicun.com';
  const { ctx, p } = await contexto(`conductor-${ancho}`, { ancho, alto: ancho > 900 ? 900 : 844 });
  await entrarConductor(p, correo);
  const modo = await p.evaluate(() => JSON.parse(localStorage.getItem('tc.real.reglas.cootransrural') || 'null'));
  ok(modo && !('modo' in modo) && modo.segundosOferta === 25, `reglas: el modo no se guarda en el teléfono (solo las tres de siempre) (${JSON.stringify(modo)})`);
  await enTurno(p, correo);
  const pres = delRol('conductor', 'presencia', correo).filter((m) => m.datos?.pos).at(-1)?.datos?.pos;
  ok(pres && pres.precision === 10 && Number.isFinite(pres.lat), `presencia: pos.precision en metros (${JSON.stringify(pres)})`);
  ok(!(await visible(p, '[data-fila]')), 'fila: sin mensaje, sin chip');

  // Entra a la fila (nombre del paradero con HTML: como texto).
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: PARADERO_XSS, puesto: 2, motivo: 'entro' });
  ok(Boolean(await hasta(() => visible(p, '[data-fila]'), 5000)), 'fila: al entrar se ve el chip');
  ok((await chip(p)) === `Vas 2.º en la fila de ${PARADERO_XSS}`, `fila: «Vas 2.º en la fila de …» con el nombre como texto (${await chip(p)})`);
  ok(await conAviso(p, /^Entraste a la fila$/), 'fila: aviso «Entraste a la fila»');
  ok((await avisos(p, /^Entraste a la fila$/))[0]?.cuerpo === `${PARADERO_XSS}: vas 2.º.`, 'fila: «{paradero}: vas 2.º.»');
  ok(await sinXss(p), 'fila: el <img onerror> y el <b> del nombre no se interpretan');
  await foto(p, `c01-fila-2-${ancho}`);
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 1 });
  ok(Boolean(await hasta(async () => (await chip(p)) === 'Eres el primero en la fila de Paradero de taxis', 4000)), 'fila: subió → «Eres el primero en la fila de …»');
  await p.waitForTimeout(500);
  ok((await avisos(p, /fila/i)).length === 1, 'fila: subir de puesto no avisa');
  await foto(p, `c02-fila-primero-${ancho}`);

  // La oferta de la fila.
  ofrecer('v-f1', { motivo: 'fila', llegadaMin: 2, fila: { paraderoId: 'paradero', paradero: PARADERO_XSS, alRechazar: 'al_final' } });
  ok(Boolean(await intento(p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 }))), 'oferta de la fila: llega');
  const t1 = await tarjeta(p);
  ok(/Turno de paradero/.test(t1) && t1.includes(`Eres el primero de la fila en ${PARADERO_XSS}`), `oferta de la fila: «Turno de paradero» y «Eres el primero de la fila en …» (${t1.slice(0, 160)})`);
  ok(/Si lo rechazas o no respondes, pasas al final de la fila\./.test(t1), 'oferta de la fila: la nota «al final»');
  ok(/hasta el pasajero · 2 min/.test(t1), 'oferta de la fila: «hasta el pasajero · 2 min» (llegadaMin)');
  ok(!/Nueva solicitud/.test(t1), 'oferta de la fila: en lugar de «Nueva solicitud»');
  ok(!(await visible(p, '[data-fila]')), 'oferta de la fila: el chip se esconde con la solicitud en pantalla');
  ok(await sinXss(p), 'oferta de la fila: el nombre como texto');
  await p.waitForTimeout(900);
  await foto(p, `c03-oferta-fila-${ancho}`);
  await p.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await hasta(() => delRol('conductor', 'rechazo', correo).some((m) => m.datos?.viajeId === 'v-f1'), 4000)), 'oferta de la fila: «Rechazar» manda rechazo');
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 4, motivo: 'rechazo' });
  ok(await conAviso(p, /^Pasaste al final de la fila$/), 'fila: aviso «Pasaste al final de la fila»');
  ok((await avisos(p, /^Pasaste al final de la fila$/))[0]?.cuerpo === 'Paradero de taxis: ahora vas 4.º.', 'fila: «… ahora vas 4.º.»');
  ok(Boolean(await hasta(async () => (await chip(p)) === 'Vas 4.º en la fila de Paradero de taxis', 4000)), 'fila: el chip con el puesto nuevo');

  // Fila con «conserva».
  ofrecer('v-f2', { motivo: 'fila', fila: { paraderoId: 'paradero', paradero: 'Paradero de taxis', alRechazar: 'conserva' } });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  ok(/Si no respondes, pasas al final de la fila\./.test(await tarjeta(p)) && !/Si lo rechazas/.test(await tarjeta(p)), 'oferta de la fila: la nota «conserva»');
  await cerrarOferta(p, 'v-f2');

  // Eres el más cercano.
  ofrecer('v-c1', { motivo: 'cercano', llegadaMin: 3 });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  const t2 = await tarjeta(p);
  ok(/Eres el más cercano · llegas en ~3 min/.test(t2) && /hasta el pasajero · 3 min/.test(t2) && !/Turno de paradero|Llevas más tiempo/.test(t2), `«Eres el más cercano · llegas en ~3 min» (${t2.slice(0, 120)})`);
  await p.waitForTimeout(900);
  await foto(p, `c04-oferta-cercano-${ancho}`);
  await cerrarOferta(p, 'v-c1');

  // Entre los más cercanos, con equidad.
  ofrecer('v-o1', { motivo: 'ola', llegadaMin: 6, equidad: true });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  const t3 = await tarjeta(p);
  ok(/Estás entre los más cercanos · llegas en ~6 min/.test(t3) && /Llevas más tiempo sin servicio/.test(t3), `ola con equidad (${t3.slice(0, 140)})`);
  await p.waitForTimeout(900);
  await foto(p, `c05-oferta-ola-equidad-${ancho}`);
  await cerrarOferta(p, 'v-o1');

  // La central tiene prioridad.
  ofrecer('v-central', { motivo: 'cercano', llegadaMin: 3, central: true });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  const t4 = await tarjeta(p);
  ok(/La central te ofrece este servicio/.test(t4) && !/Eres el más cercano/.test(t4), 'la central: su texto manda (sin «Eres el más cercano»)');
  await cerrarOferta(p, 'v-central');

  // Campos raros: la tarjeta de hoy.
  ofrecer('v-raro', { motivo: 'primero', llegadaMin: 9999, equidad: 'si', fila: '<b>x</b>' });
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  const t5 = await tarjeta(p);
  ok(/Nueva solicitud/.test(t5) && !/Llevas más tiempo|llegas en/.test(t5) && !/hasta el pasajero · 9999/.test(t5), 'campos raros: se descartan (la tarjeta de hoy)');
  await cerrarOferta(p, 'v-raro');

  // Bienvenida con fila (reconexión).
  srv.filaBienvenida = { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 3 };
  for (const cx of conexiones('conductor')) cx.ws.close({ code: 1012, reason: 'reinicio' });
  ok(Boolean(await hasta(async () => (await chip(p)) === 'Vas 3.º en la fila de Paradero de taxis', 15000)), `bienvenida.fila: al reconectarse, su puesto (${await chip(p)})`);
  srv.filaBienvenida = null;

  // Salir: alejarse, sin señal, la cooperativa cambió el modo.
  aTodos('conductor', 'fila', { enFila: false, paraderoId: 'paradero', paradero: 'Paradero de taxis', motivo: 'salio' });
  ok(await conAviso(p, /^Saliste de la fila$/), 'fila: aviso «Saliste de la fila»');
  ok((await avisos(p, /^Saliste de la fila$/))[0]?.cuerpo === 'Te alejaste del paradero Paradero de taxis.', 'fila: «Te alejaste del paradero …»');
  ok(Boolean(await hasta(async () => !(await visible(p, '[data-fila]')), 4000)), 'fila: sin chip al salir');
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 1, motivo: 'entro' });
  await hasta(() => visible(p, '[data-fila]'), 4000);
  aTodos('conductor', 'fila', { enFila: false, paraderoId: 'paradero', paradero: 'Paradero de taxis', motivo: 'sin_senal' });
  ok(Boolean(await hasta(async () => (await avisos(p, /^Saliste de la fila$/)).some((a) => a.cuerpo === 'No recibimos tu ubicación por unos minutos.'), 6000)), 'fila: sin señal → «No recibimos tu ubicación por unos minutos.»');
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 1, motivo: 'entro' });
  await hasta(() => visible(p, '[data-fila]'), 4000);
  aTodos('conductor', 'fila', { enFila: false, paraderoId: 'paradero', paradero: 'Paradero de taxis', motivo: 'modo' });
  ok(await conAviso(p, /^La fila del paradero se apagó$/), 'fila: «La fila del paradero se apagó»');
  ok((await avisos(p, /^La fila del paradero se apagó$/))[0]?.cuerpo === 'Cootransrural cambió cómo reparte los pedidos.', 'fila: «Cootransrural cambió cómo reparte los pedidos.»');
  const antesServicio = (await avisos(p, /fila/i)).length;
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 1, motivo: 'entro' });
  await hasta(() => visible(p, '[data-fila]'), 4000);
  aTodos('conductor', 'fila', { enFila: false, paraderoId: 'paradero', paradero: 'Paradero de taxis', motivo: 'servicio' });
  await hasta(async () => !(await visible(p, '[data-fila]')), 4000);
  await p.waitForTimeout(500);
  ok((await avisos(p, /fila/i)).length === antesServicio + 1, 'fila: salir por un servicio no avisa (solo el «Entraste» de antes)');

  // Salir de turno quita la fila.
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 2, motivo: 'entro' });
  await hasta(() => visible(p, '[data-fila]'), 4000);
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });
  await p.waitForTimeout(400);
  ok(!(await visible(p, '[data-fila]')), 'fuera de turno: sin chip de la fila');
  aTodos('conductor', 'fila', { enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 1 });
  await p.waitForTimeout(600);
  ok(!(await visible(p, '[data-fila]')), 'fuera de turno: un «fila» atrasado no lo pone en la fila');
  ok(await sinXss(p), 'conductor: sin HTML inyectado');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* d) Conductor con el servidor 0.13.0                                  */
/* ------------------------------------------------------------------ */
async function conductorServidorAnterior() {
  srv.nuevo = false;
  const correo = 'nora@prueba.taxicun.com';
  const { ctx, p } = await contexto('conductor-0.13');
  await entrarConductor(p, correo);
  await enTurno(p, correo);
  ofrecer('v-hoy', {});
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 8000 });
  const t = await tarjeta(p);
  ok(/Nueva solicitud/.test(t) && /hasta el pasajero · \d+ min/.test(t) && !/más cercano|Turno de paradero|Llevas más/.test(t), `0.13.0: la tarjeta de hoy (${t.slice(0, 100)})`);
  ok(!(await visible(p, '[data-fila]')), '0.13.0: sin chip de la fila');
  await foto(p, 'c06-servidor-0.13');
  await cerrarOferta(p, 'v-hoy');
  await ctx.close();
  srv.nuevo = true;
}

/* ------------------------------------------------------------------ */
/* e) 1366 px y la demo                                                 */
/* ------------------------------------------------------------------ */
async function pasajero1366() {
  srv.nuevo = true;
  const { ctx, p } = await contexto('pasajero-1366', { ancho: 1366, alto: 900 });
  await entrarPasajero(p, 'ana@prueba.taxicun.com');
  await hasta(async () => /llega en/.test(await texto(p, '[data-llegada-cerca]')), 8000);
  ok(/El taxi más cercano llega en ~4 min/.test(await texto(p, '[data-llegada-cerca]')), '1366 px: la línea de llegada en el inicio');
  await foto(p, 'p05-inicio-1366');
  await aConfirmar(p, ESTIMADA);
  ok(/Valor por la ruta en calles/.test(await texto(p, '[data-chip-tarifa]')), '1366 px: el chip del valor por la ruta');
  await foto(p, 'p06-confirmar-1366');
  await ctx.close();
}

async function demo() {
  const { ctx, p } = await contexto('demo', { simular: false });
  let llamadas = 0;
  await ctx.route(`${BASE}api/**`, (r) => {
    if (/viajes\/(cotizacion|llegada)/.test(r.request().url())) llamadas += 1;
    return r.fulfill({ status: 404, body: '{}' });
  });
  await p.goto(`${BASE}`);
  await p.waitForSelector('.a-app[data-vista="inicio"]', { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(2500);
  ok(llamadas === 0, 'demo: no llama a /api/viajes/*');
  ok(!(await p.$('[data-llegada-cerca]')), 'demo: sin la línea de llegada del servidor');
  const r = await p.evaluate(async (base) => {
    const R = await import(`${base}nucleo/reglas.js`);
    return [R.leerReglas(null).modo, R.leerReglas({ reglas: { modo: 'cercania', segundosOferta: 20 } }).modo, R.leerReglas({ modo: 'raro' }).modo, R.reglasDeBienvenida({ rol: 'conductor' }).modo];
  }, BASE);
  ok(JSON.stringify(r) === '["todos","cercania","todos","todos"]', `reglas.modo: por defecto «todos» y el de la central si es válido (${JSON.stringify(r)})`);
  await ctx.close();
}

let detenida = '';
try {
  await pasajeroConRutas();
  await pasajeroServidorAnterior();
  await conductorTurno();
  await conductorTurno({ ancho: 1366 });
  await conductorServidorAnterior();
  await pasajero1366();
  await demo();
} catch (e) {
  detenida = e?.stack || String(e);
}
await navegador.close();
if (detenida) {
  fallas += 1;
  console.log(`✘ la prueba se detuvo: ${detenida}`);
}
console.log(errores.length ? `\nErrores de la página:\n${errores.join('\n')}` : '\nErrores de la página: ninguno');
ok(!errores.length, 'sin errores de JavaScript');
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘ · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
