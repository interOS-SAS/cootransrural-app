// Fase 2 del panel en la web (parte «web»), con el servidor de TaxiCun simulado aquí mismo (page.route y
// routeWebSocket, como nativo-v12.mjs) y la ficha armada por la API simulada: empresas/cootransrural/
// ficha.json = el archivo + lo que agregue cada caso (ZONA_SERVICIO, VERSION_CONFIG, rutas «fijada»…).
//
//  a) Índice desde el servidor (pedido de Oscar, 3-oct): en modo real (?real=1) la app pregunta
//     GET /api/empresas/indice (sin sesión). Con solo Cootransrural «real» (Subachoque «pronto») abre El Rosal
//     directo, como hoy; con Subachoque «real» y el GPS allá, abre Subachoque; lejos de todo, la lista
//     con las reales y la «pronto» sin poderla abrir; si el servidor no tiene la ruta (0.5.0: 404), falla
//     o responde basura, queda el archivo; ninguna real → «TaxiCun aún no está disponible». La demo
//     (sin ?real=1) no pregunta nada.
//  b) Fuera de zona (pasajero, §5.7): dentro, normal; cerca del borde, aviso en el inicio y en «Confirma
//     tu viaje» y la hoja con «Pedir de todas formas» / «Llamar a la central» / «Mover el punto»; muy
//     lejos, «Pedir taxi» desactivado y la hoja con «Mover el punto», «Llamar 320 904 2977» y «Aquí te
//     atiende Subachoque»; la central rechaza con fuera_de_zona → el texto; el modo revisor no se revisa.
//  c) Precio fijado por la cooperativa: Tarifas y rutas y «Confirma tu viaje» a Madrid.
//  d) Conductor: chip «Fuera de zona · 1,4 km del límite» en la oferta; estados rechazado y retirado con
//     el motivo como TEXTO (un motivo con HTML no se interpreta).
//  e) Recarga con el mensaje «config»: con la app oculta y sin viaje, recarga y lee la ficha nueva; con un
//     viaje, espera a que termine; no entra en ciclo si la ficha sigue vieja; a la vista y sin tocarla,
//     recarga sola al minuto.
//  f) La web de la cooperativa (web/sitio.js, data-precio): pinta los precios vigentes de la ficha; el
//     enlace al acto solo .gov.co; con todas las rutas fijadas, el título lo dice.
//
// Uso: node pruebas/fase2-web.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=4331). Capturas en $CAPTURAS. Unos 4 minutos.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:4331/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/panel/f2/pruebas/web/capturas-fase2').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const leer = (id) => JSON.parse(readFileSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url), 'utf8'));
const ARCHIVO = leer('cootransrural');
const SUBACHOQUE = leer('subachoque');
const CODIGO = '123456';
// Zona de prueba: un rectángulo de ~11 × 11 km alrededor de El Rosal.
const CUADRO = [[4.80, -74.31], [4.90, -74.31], [4.90, -74.21], [4.80, -74.21]];
const GPS = {
  dentro: { latitude: ARCHIVO.PARADERO.lat, longitude: ARCHIVO.PARADERO.lng, accuracy: 10 },
  cerca: { latitude: 4.85, longitude: -74.20, accuracy: 10 }, // 1,1 km al oriente del borde
  subachoque: { latitude: SUBACHOQUE.CENTRO.lat, longitude: SUBACHOQUE.CENTRO.lng, accuracy: 10 }, // ~5 km
  bogota: { latitude: 4.711, longitude: -74.072, accuracy: 10 },
};
// El texto trae HTML a propósito: la app lo muestra como texto (S30; el panel no deja guardar < ni >).
// (Hasta 160 caracteres, §4.6: la app corta lo que pase de ahí.)
const ZONA = { poligonos: [CUADRO], avisarHastaKm: 2, texto: 'Fuera de la zona de Cootransrural (El Rosal y sus veredas). Puedes pedir, pero puede que ningún taxi acepte. <img src=x onerror="window.__xss=2">' };

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
const USUARIOS = {
  'ana@prueba.taxicun.com': { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
  'luis@prueba.taxicun.com': { nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Kia Picanto', color: 'Amarillo' } },
  // Rocío: el motivo en conductor.motivo (como lo manda el servidor 0.6.0); Mario: en motivo_conductor (§6.5).
  'rocio@prueba.taxicun.com': { nombre: 'Rocío Pardo', celular: '3112223344', conductor: { estado: 'rechazado', empresa: 'cootransrural', movil: '041', placa: 'WFK777', vehiculo: 'Kia Picanto', color: 'Amarillo', motivo: '<img src=x onerror="window.__xss=1">La licencia está vencida & falta el SOAT' } },
  'mario@prueba.taxicun.com': { nombre: 'Mario Suárez', celular: '3123334455', conductor: { estado: 'retirado', empresa: 'cootransrural', movil: '050', placa: 'WFK888', vehiculo: 'Kia Picanto', color: 'Amarillo' }, motivo: 'Vendió el taxi.' },
};
const srv = {
  n: 0,
  indice: { estado: 200, cuerpo: null }, // GET /api/empresas
  capa: null, // lo que la API agrega a la ficha de cootransrural (null = el archivo tal cual)
  fichas: [], // { id, version, t } servidas
  peticiones: [],
  sesiones: new Map(),
  hola: [],
  mensajes: [],
  sockets: new Set(),
  ofertas: new Map(),
  revision: false,
  rechazarZona: false,
  configAlSaludar: null, // { empresa, version }: se manda después de la bienvenida (como lo haría la central)
};
const indiceDe = (reales = ['cootransrural'], pronto = []) => ({
  cooperativas: JSON.parse(readFileSync(new URL('../empresas/indice.json', import.meta.url), 'utf8')).cooperativas
    .map((c) => ({ id: c.id, real: reales.includes(c.id), ...(pronto.includes(c.id) ? { pronto: true } : {}) })),
});

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
  const cabeceras = req.headers();
  const token = (cabeceras.authorization || '').replace(/^Bearer\s+/, '');
  const correo = srv.sesiones.get(token) || null;
  srv.peticiones.push({ metodo, ruta, cuerpo, correo, autorizacion: Boolean(cabeceras.authorization), cookie: Boolean(cabeceras.cookie), t: Date.now() });
  const responder = (estado, datos) => route.fulfill({ status: estado, contentType: 'application/json', body: typeof datos === 'string' ? datos : JSON.stringify(datos) });
  const yoDe = (c) => {
    const u = USUARIOS[c];
    return { usuario: { id: `u-${c}`, correo: c, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor, ...(u.motivo ? { motivo_conductor: u.motivo } : {}) };
  };
  if (metodo === 'GET' && ruta === 'empresas/indice') {
    const { estado, cuerpo: c } = srv.indice;
    return responder(estado, c ?? { error: 'no_existe' });
  }
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    if (cuerpo?.codigo !== CODIGO || !USUARIOS[cuerpo?.correo]) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}`;
    srv.sesiones.set(t, cuerpo.correo);
    return responder(200, { token: t, ...yoDe(cuerpo.correo) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'yo') return correo ? responder(200, yoDe(correo)) : responder(401, { error: 'sin_sesion' });
  return responder(404, { error: 'no_existe' });
}

const enviar = (cx, tipo, datos) => {
  try {
    cx.ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de: 'servidor', ts: Date.now(), datos }));
  } catch {
    /* cerrado */
  }
};
const enviarA = (rol, tipo, datos) => {
  for (const cx of srv.sockets) if (cx.rol === rol) enviar(cx, tipo, datos);
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
      if (m.datos.rol === 'conductor' && u.conductor?.estado !== 'aprobado') {
        enviar(cx, 'error', { codigo: 'conductor_no_aprobado' });
        ws.close({ code: 4403, reason: 'conductor_no_aprobado' });
        return;
      }
      cx.rol = m.datos.rol === 'conductor' ? 'conductor' : 'pasajero';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, empresa: m.datos.empresa, t: Date.now() });
      enviar(cx, 'bienvenida', cx.rol === 'conductor'
        ? { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 5, viajes: 0 } }
        : { rol: 'pasajero', empresa: m.datos.empresa || 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana', ...(srv.revision ? { revision: true } : {}) });
      enviar(cx, 'viaje_actual', null);
      if (srv.configAlSaludar && cx.rol === 'pasajero') setTimeout(() => enviar(cx, 'config', srv.configAlSaludar), 300);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol === 'pasajero' && m.tipo === 'solicitud' && srv.rechazarZona) setTimeout(() => enviar(cx, 'error', { codigo: 'fuera_de_zona' }), 200);
    if (cx.rol === 'conductor' && m.tipo === 'presencia') {
      const antes = cx.disponible;
      cx.disponible = Boolean(m.datos?.disponible);
      if (cx.disponible && !antes) for (const s of srv.ofertas.values()) enviar(cx, 'solicitud', s);
    }
  });
}

// La ficha de Cootransrural «armada por la API»: el archivo + la capa del caso.
async function atenderFicha(route) {
  const f = JSON.parse(JSON.stringify(ARCHIVO));
  const capa = srv.capa ? JSON.parse(JSON.stringify(srv.capa)) : null;
  if (capa?.RUTAS_FIJADAS) {
    f.RUTAS = f.RUTAS.map((r) => (capa.RUTAS_FIJADAS.includes(r.id) ? { ...r, fijada: true, valor: r.id === 'madrid' ? 32000 : r.valor } : r));
    delete capa.RUTAS_FIJADAS;
  }
  if (capa?.TARIFAS) {
    f.TARIFAS = { ...f.TARIFAS, ...capa.TARIFAS };
    delete capa.TARIFAS;
  }
  if (capa?.DESTINOS) {
    f.DESTINOS_TARIFA = f.DESTINOS_TARIFA.map((d) => (d.id in capa.DESTINOS ? { ...d, valor: capa.DESTINOS[d.id] } : d));
    delete capa.DESTINOS;
  }
  Object.assign(f, capa || {});
  srv.fichas.push({ id: 'cootransrural', version: f.VERSION_CONFIG?.version || 0, t: Date.now() });
  return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify(f) });
}

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, gps = GPS.dentro) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: gps, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/\/empresas\/cootransrural\/ficha\.json(\?.*)?$/, atenderFicha);
  // Fuera de la red: direcciones, rutas y teselas (el núcleo usa sus respaldos locales).
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
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
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast')].some((t) => new RegExp(f).test(t.innerText)), re.source, { timeout }));
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
const pidio = (ruta, desde = 0) => srv.peticiones.filter((x) => x.ruta === ruta && x.t >= desde);
const solicitudes = (desde) => srv.mensajes.filter((m) => m.rol === 'pasajero' && m.tipo === 'solicitud' && m.t >= desde);

async function entrarPasajero(p, url = `${BASE}taxicun/?real=1`) {
  await p.goto(url);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', 'ana@prueba.taxicun.com');
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000);
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
}
// Vuelve a abrir la app (con la sesión) con otro GPS y espera el inicio con el punto de recogida ya leído.
async function abrirCon(ctx, p, gps, url = `${BASE}taxicun/?real=1&e=cootransrural`) {
  await ctx.setGeolocation(gps);
  await p.goto(url);
  await vista(p, 'inicio', 30000);
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => !/Buscando dirección/.test(document.querySelector('[data-origen-titulo]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(900);
}
async function irAConfirmar(p) {
  await p.click('[data-frecuente] >> nth=0');
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
}
async function volverAlInicio(p) {
  if (await p.$('.a-app[data-vista="confirmar"]')) {
    await p.click('.a-vista-cabeza [data-volver]');
    await p.waitForTimeout(500);
    await p.keyboard.press('Escape').catch(() => {});
  }
}
// La hoja de fuera de zona abierta (y ya quieta: sube en 0,32 s).
const modalZona = async (p) => {
  await p.waitForSelector('.a-modal-zona.a-abierto .a-modal h2', { timeout: 8000 });
  await p.waitForTimeout(450);
};
async function cerrarModal(p) {
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}

/* ------------------------------------------------------------------ */
/* a) Índice desde el servidor                                         */
/* ------------------------------------------------------------------ */
async function indice() {
  // a1) Solo Cootransrural real; Subachoque activa pero sin zona, tarifas o conductores: «pronto».
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural'], ['subachoque']) };
  let { ctx, p } = await contexto('indice-1', GPS.subachoque);
  let t0 = Date.now();
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('.a-bienvenida', { timeout: 30000 });
  let u = new URL(p.url());
  ok(u.searchParams.get('e') === 'cootransrural', `a1) Subachoque «pronto» y solo Cootransrural real: abre El Rosal directo, como hoy (e=${u.searchParams.get('e')})`);
  const pedida = pidio('empresas/indice', t0)[0];
  ok(pedida && !pedida.autorizacion && !pedida.cookie, 'a1) GET /api/empresas/indice sin sesión ni cookies');
  ok(await p.evaluate(() => document.getElementById('elegir')?.hidden !== false), 'a1) sin la lista de municipios (una sola cooperativa)');
  await ctx.close();

  // a2) Subachoque pasa las compuertas (real) y el GPS está en Subachoque: abre Subachoque.
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural', 'subachoque']) };
  ({ ctx, p } = await contexto('indice-2', GPS.subachoque));
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('.a-bienvenida', { timeout: 30000 });
  u = new URL(p.url());
  ok(u.searchParams.get('e') === 'subachoque', `a2) Subachoque real y el GPS allá: abre Subachoque (e=${u.searchParams.get('e')})`);
  ok(/Subachoque/.test(await texto(p, '.a-bienvenida')), 'a2) la bienvenida es la de Subachoque');
  await foto(p, 'a2-subachoque-real');
  await ctx.close();

  // a3) Lejos de todo (Bogotá): la lista con las dos reales y Tabio «pronto», sin «Demo».
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural', 'subachoque'], ['tabio']) };
  ({ ctx, p } = await contexto('indice-3', GPS.bogota));
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('#elegir:not([hidden]) .tc-lista', { timeout: 30000 });
  const ids = await p.$$eval('.tc-lista [data-id]', (ns) => ns.map((n) => n.dataset.id).sort());
  ok(ids.join() === 'cootransrural,subachoque', `a3) la lista trae solo las reales (${ids.join(', ')})`);
  const pronto = await p.$$eval('.tc-lista .tc-pronto', (ns) => ns.map((n) => n.innerText.replace(/\s+/g, ' ')));
  ok(pronto.length === 1 && /Tabio/.test(pronto[0]) && /Pronto/i.test(pronto[0]), `a3) Tabio sale como «Pronto» (${pronto.join(' | ')})`);
  ok(!(await p.$('.tc-lista [data-id] .tc-demo')), 'a3) en modo real ninguna dice «Demo»');
  await p.waitForTimeout(700);
  await foto(p, 'a3-lista-pronto');
  await p.click('.tc-lista .tc-pronto').catch(() => {});
  await p.waitForTimeout(600);
  ok(!new URL(p.url()).searchParams.get('e') && (await p.$('#elegir:not([hidden])')), 'a3) tocar «Pronto» no abre nada');
  await p.click('.tc-lista [data-id="subachoque"]');
  await p.waitForSelector('.a-bienvenida', { timeout: 30000 });
  ok(new URL(p.url()).searchParams.get('e') === 'subachoque', 'a3) escoger Subachoque la abre');
  await ctx.close();

  // a4) Servidor 0.5.0 (sin la ruta: 404), a5) error 500, a6) basura: queda el archivo (solo El Rosal).
  for (const [n, respuesta, nombre] of [['a4', { estado: 404, cuerpo: null }, '404 (servidor 0.5.0)'], ['a5', { estado: 500, cuerpo: { error: 'error_interno' } }, '500'], ['a6', { estado: 200, cuerpo: '<html>proxy</html>' }, 'una página de error en vez de JSON'], ['a7', { estado: 200, cuerpo: { cooperativas: [] } }, 'una lista vacía']]) {
    srv.indice = respuesta;
    ({ ctx, p } = await contexto(`indice-${n}`, GPS.subachoque));
    await p.goto(`${BASE}taxicun/?real=1`);
    await p.waitForSelector('.a-bienvenida', { timeout: 30000 });
    ok(new URL(p.url()).searchParams.get('e') === 'cootransrural', `${n}) con ${nombre}: queda el archivo y abre El Rosal`);
    await ctx.close();
  }

  // a8) Ninguna real (p. ej. Cootransrural pausada): «TaxiCun aún no está disponible».
  srv.indice = { estado: 200, cuerpo: indiceDe([]) };
  ({ ctx, p } = await contexto('indice-8'));
  await p.goto(`${BASE}taxicun/?real=1`);
  ok(Boolean(await intento(p.waitForFunction(() => /aún no está disponible/.test(document.getElementById('carga-texto')?.textContent || ''), null, { timeout: 20000 }))), 'a8) ninguna real: «TaxiCun aún no está disponible»');
  await ctx.close();

  // a9) La demo (sin ?real=1) no pregunta nada al servidor.
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural', 'subachoque']) };
  ({ ctx, p } = await contexto('indice-9', GPS.subachoque));
  t0 = Date.now();
  await p.goto(`${BASE}taxicun/`);
  await p.waitForSelector('.a-bienvenida, .tc-lista', { timeout: 30000 });
  await p.waitForTimeout(800);
  ok(pidio('empresas/indice', t0).length === 0, 'a9) la demo no pide /api/empresas/indice');
  await ctx.close();
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural'], ['subachoque']) };
}

/* ------------------------------------------------------------------ */
/* b) y c) Pasajero: fuera de zona y precio fijado                      */
/* ------------------------------------------------------------------ */
async function pasajero() {
  srv.capa = { ZONA_SERVICIO: ZONA, VERSION_CONFIG: { version: 2, publicada: '2026-10-06T05:00:00Z', fuente: { acto: 'Decreto 05 de 2026', entidad: 'Alcaldía de El Rosal' } }, RUTAS_FIJADAS: ['madrid'] };
  const { ctx, p } = await contexto('pasajero', GPS.dentro);
  await entrarPasajero(p);
  ok(srv.fichas.some((f) => f.version === 2), 'la app leyó la ficha armada (versión 2, con zona)');

  // b1) Dentro de la zona: sin avisos; «Pedir taxi» sale derecho.
  await p.waitForTimeout(1200);
  ok(await p.$eval('[data-aviso-zona]', (n) => n.hidden).catch(() => false), 'b1) dentro de la zona: sin aviso en el inicio');
  await irAConfirmar(p);
  ok(await p.$eval('[data-zona-confirmar]', (n) => n.hidden) && !(await p.getAttribute('[data-pedir]', 'aria-disabled')), 'b1) «Confirma tu viaje» sin aviso y con «Pedir taxi»');
  let t0 = Date.now();
  await p.click('[data-pedir]');
  ok(Boolean(await intento(vista(p, 'buscando', 10000))) && Boolean(await hasta(() => solicitudes(t0).length, 6000)), 'b1) pide sin preguntar nada');
  ok(!(await p.$('.a-modal-zona')), 'b1) sin la hoja de fuera de zona');
  enviarA('pasajero', 'cancelacion', { viajeId: solicitudes(t0)[0]?.datos?.viajeId, por: 'sistema' });
  await vista(p, 'inicio', 10000).catch(() => {});

  // b2) Cerca del borde (1,1 km afuera).
  await abrirCon(ctx, p, GPS.cerca);
  const avisoCerca = await p.$eval('[data-aviso-zona]', (n) => ({ hidden: n.hidden, estado: n.dataset.estado, texto: n.innerText.replace(/\s+/g, ' ') })).catch(() => null);
  ok(avisoCerca && !avisoCerca.hidden && avisoCerca.estado === 'cerca' && /Fuera de la zona de servicio de Cootransrural, a 1,1 km del límite/.test(avisoCerca.texto), `b2) aviso en el inicio: «${avisoCerca?.texto}»`);
  await foto(p, 'b2-inicio-cerca');
  await irAConfirmar(p);
  ok(/a 1,1 km del límite/.test(await texto(p, '[data-zona-confirmar]')) && !(await p.getAttribute('[data-pedir]', 'aria-disabled')), 'b2) «Confirma tu viaje»: el aviso y «Pedir taxi» activo');
  t0 = Date.now();
  await p.click('[data-pedir]');
  const h2 = await intento(modalZona(p));
  ok(h2 && (await texto(p, '.a-modal-zona .a-modal h2')) === 'Estás fuera de la zona de servicio de Cootransrural', 'b2) «Pedir taxi» → «Estás fuera de la zona de servicio de Cootransrural»');
  ok((await texto(p, '.a-modal-zona .a-modal-texto')) === ZONA.texto && /A 1,1 km del límite de la zona/.test(await texto(p, '.a-modal-zona [data-zona-km]')), 'b2) con el texto de la ficha y la distancia al límite');
  ok(!(await p.$('.a-modal-zona img')) && (await p.evaluate(() => window.__xss)) !== 2, 'b2) el texto de la zona es TEXTO: el <img> no se pinta ni corre');
  const botones = await p.$$eval('.a-modal-zona .a-modal-acciones > *', (ns) => ns.map((n) => `${n.tagName}:${n.innerText.trim()}:${n.getAttribute('href') || ''}`));
  ok(botones.join(' | ') === 'BUTTON:Pedir de todas formas: | A:Llamar a la central:tel:3209042977 | BUTTON:Mover el punto:', `b2) acciones: ${botones.join(' | ')}`);
  ok(solicitudes(t0).length === 0, 'b2) mientras la hoja está abierta no sale nada');
  await foto(p, 'b2-hoja-cerca');
  await p.click('.a-modal-zona button:has-text("Pedir de todas formas")');
  ok(Boolean(await intento(vista(p, 'buscando', 10000))) && Boolean(await hasta(() => solicitudes(t0).length, 6000)), 'b2) «Pedir de todas formas» pide el taxi (la central lo marca fuera_zona)');
  enviarA('pasajero', 'cancelacion', { viajeId: solicitudes(t0)[0]?.datos?.viajeId, por: 'sistema' });
  await vista(p, 'inicio', 10000).catch(() => {});
  await p.waitForTimeout(600);
  // «Mover el punto» vuelve al inicio sin pedir.
  await irAConfirmar(p);
  t0 = Date.now();
  await p.click('[data-pedir]');
  await modalZona(p);
  await p.click('.a-modal-zona button:has-text("Mover el punto")');
  ok(Boolean(await intento(vista(p, 'inicio', 8000))) && solicitudes(t0).length === 0, 'b2) «Mover el punto» vuelve al mapa sin pedir');
  // «Ver opciones» del aviso del inicio: la misma hoja, sin «Pedir de todas formas».
  await p.click('[data-zona-opciones]');
  await modalZona(p);
  ok(!(await p.$('.a-modal-zona button:has-text("Pedir de todas formas")')), 'b2) «Ver opciones» abre la hoja sin «Pedir de todas formas»');
  await cerrarModal(p);

  // b3) Muy lejos (Subachoque, ~5 km) con Subachoque real en TaxiCun: no deja pedir y ofrece cambiar.
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural', 'subachoque']) };
  await abrirCon(ctx, p, GPS.subachoque);
  const avisoLejos = await p.$eval('[data-aviso-zona]', (n) => ({ hidden: n.hidden, estado: n.dataset.estado, texto: n.innerText.replace(/\s+/g, ' ') })).catch(() => null);
  ok(avisoLejos && !avisoLejos.hidden && avisoLejos.estado === 'lejos' && /muy lejos de la zona de servicio de Cootransrural/.test(avisoLejos.texto), `b3) aviso en rojo en el inicio: «${avisoLejos?.texto}»`);
  await irAConfirmar(p);
  const pedirLejos = await p.$eval('[data-pedir]', (n) => ({ aria: n.getAttribute('aria-disabled'), txt: n.querySelector('[data-pedir-txt]')?.textContent, bloq: n.classList.contains('a-btn-bloqueado') }));
  ok(pedirLejos.aria === 'true' && pedirLejos.txt === 'Fuera de la zona' && pedirLejos.bloq, `b3) «Pedir taxi» desactivado: «${pedirLejos.txt}»`);
  await foto(p, 'b3-confirmar-lejos');
  t0 = Date.now();
  // aria-disabled: para Playwright está «desactivado», pero un toque abre la hoja (force).
  await p.click('[data-pedir]', { force: true });
  ok(await intento(modalZona(p)) && (await texto(p, '.a-modal-zona .a-modal h2')) === 'Este punto está muy lejos de la zona de Cootransrural', 'b3) tocarlo abre la hoja «Este punto está muy lejos de la zona de Cootransrural»');
  const accLejos = await p.$$eval('.a-modal-zona .a-modal-acciones > *', (ns) => ns.map((n) => `${n.tagName}:${n.innerText.trim()}:${n.getAttribute('href') || ''}`));
  ok(accLejos[0] === 'BUTTON:Mover el punto:' && accLejos[1] === 'A:Llamar 320 904 2977:tel:3209042977', `b3) «Mover el punto» y «Llamar 320 904 2977» (${accLejos.slice(0, 2).join(' | ')})`);
  const otraNombre = JSON.parse(readFileSync(new URL('../empresas/indice.json', import.meta.url), 'utf8')).cooperativas.find((c) => c.id === 'subachoque').nombre;
  ok((await texto(p, '.a-modal-zona [data-zona-otra]')) === `Aquí te atiende ${otraNombre} (Subachoque).` && new RegExp(`^A:Cambiar a ${otraNombre}:.*/taxicun/\\?e=subachoque$`).test(accLejos[2] || ''), `b3) «Aquí te atiende ${otraNombre} (Subachoque).» con «Cambiar» (${accLejos[2]})`);
  ok(!(await p.$('.a-modal-zona button:has-text("Pedir de todas formas")')), 'b3) muy lejos no hay «Pedir de todas formas»');
  await foto(p, 'b3-hoja-lejos');
  await cerrarModal(p);
  ok(solicitudes(t0).length === 0, 'b3) no salió ninguna solicitud');
  await p.click('.a-vista-cabeza [data-volver]').catch(() => {});
  await p.waitForTimeout(400);
  await p.keyboard.press('Escape').catch(() => {});
  srv.indice = { estado: 200, cuerpo: indiceDe(['cootransrural'], ['subachoque']) };

  // b4) La central rechaza con fuera_de_zona (la zona cambió mientras se pedía).
  await abrirCon(ctx, p, GPS.dentro);
  srv.rechazarZona = true;
  await irAConfirmar(p);
  await p.click('[data-pedir]');
  ok(await conAviso(p, /fuera de la zona de servicio de la cooperativa\. Mueve el punto de recogida o llama a la central/), 'b4) fuera_de_zona de la central: «Ese punto está fuera de la zona de servicio de la cooperativa…»');
  ok(Boolean(await intento(vista(p, 'inicio', 10000))), 'b4) y vuelve al inicio');
  srv.rechazarZona = false;
  await p.waitForTimeout(800);

  // c) Precio fijado por la cooperativa (Madrid, ruta «fijada» de la capa).
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click('.a-menu-item:has-text("Tarifas y rutas")');
  await p.waitForSelector('.a-panel.a-abierto [data-tabla-rutas]', { timeout: 8000 });
  await p.waitForTimeout(500);
  const filaMadrid = await texto(p, '.a-panel.a-abierto [data-tabla-rutas] tr[data-fijada]');
  ok(/Madrid/.test(filaMadrid) && /Precio fijado por Cootransrural/.test(filaMadrid) && /\$32\.000/.test(filaMadrid), `c) Tarifas y rutas: «${filaMadrid}»`);
  const tituloRutas = await p.$eval('.a-panel.a-abierto .a-grupo:has([data-tabla-rutas]) h3', (n) => n.textContent.trim()).catch(() => '');
  ok((await p.$$('.a-panel.a-abierto [data-tabla-rutas] tr[data-fijada]')).length === 1 && tituloRutas === 'Otros municipios: precio de referencia', `c) las demás rutas siguen de referencia (título: «${tituloRutas}»)`);
  ok(/Vigentes desde el 6 de octubre de 2026/.test(await texto(p, '.a-panel.a-abierto [data-vigencia]')), 'c) «Vigentes desde el 6 de octubre de 2026» (VERSION_CONFIG)');
  await foto(p, 'c-tarifas-fijada');
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(500);
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await p.fill('[data-q]', 'Madrid');
  await p.waitForSelector('.a-buscador .a-fila:has-text("Madrid")', { timeout: 10000 });
  await p.waitForTimeout(400);
  await p.click('.a-buscador .a-fila:has-text("Madrid") >> nth=0');
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-chip-tarifa]:not([hidden])', { timeout: 20000 });
  const chip = await texto(p, '[data-chip-tarifa]');
  ok(chip === 'Precio fijado por Cootransrural' && /\$32\.000/.test(await texto(p, '[data-total]')), `c) «Confirma tu viaje» a Madrid: «${chip}» · ${await texto(p, '[data-total]')}`);
  ok(/precio fijado por Cootransrural/.test(await texto(p, '[data-ruta-sub]')), 'c) bajo el título: «… · precio fijado por Cootransrural»');
  await foto(p, 'c-confirmar-madrid');
  await volverAlInicio(p);

  // b5) Modo revisor (Apple y Google prueban desde otro país): no se revisa la zona.
  srv.revision = true;
  await abrirCon(ctx, p, GPS.subachoque);
  ok(await p.$eval('[data-aviso-zona]', (n) => n.hidden).catch(() => false), 'b5) modo revisor: sin aviso de zona');
  await irAConfirmar(p);
  t0 = Date.now();
  await p.click('[data-pedir]');
  ok(Boolean(await hasta(() => solicitudes(t0).length, 8000)) && !(await p.$('.a-modal-zona')), 'b5) modo revisor: pide sin la hoja de fuera de zona');
  enviarA('pasajero', 'cancelacion', { viajeId: solicitudes(t0)[0]?.datos?.viajeId, por: 'sistema' });
  srv.revision = false;
  await p.waitForTimeout(800);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* d) Conductor                                                        */
/* ------------------------------------------------------------------ */
async function entrarConductor(p, correo) {
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
}
const oferta = (viajeId, extra = {}) => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre: 'Marta', calificacion: 4.9 },
  origen: { lat: 4.85, lng: -74.20, titulo: 'Vereda Puerta de Cuero', detalle: '' },
  destino: { lat: ARCHIVO.PARADERO.lat, lng: ARCHIVO.PARADERO.lng, titulo: 'Paradero', detalle: '' },
  tarifa: 13200, km: 3.1, min: 8, metodoPago: 'efectivo', nota: '',
  ...extra,
});
async function conductor() {
  srv.capa = { ZONA_SERVICIO: ZONA, VERSION_CONFIG: { version: 2 } };
  let { ctx, p } = await contexto('conductor', GPS.dentro);
  await entrarConductor(p, 'luis@prueba.taxicun.com');
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 });
  await p.waitForTimeout(600);
  await p.click('[data-conectar]');
  ok(Boolean(await intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }))), 'd) conductor en turno');
  await p.waitForTimeout(800);
  enviarA('conductor', 'solicitud', oferta('v-fz-1', { fueraZona: { km: 1.4 } }));
  await p.waitForSelector('.a-solicitud', { timeout: 10000 });
  await p.waitForTimeout(500);
  ok((await texto(p, '.a-solicitud [data-fuera-zona]')) === 'Fuera de zona · 1,4 km del límite', `d) chip en la oferta: «${await texto(p, '.a-solicitud [data-fuera-zona]')}»`);
  await foto(p, 'd-oferta-fuera-de-zona');
  await p.click('.a-solicitud [data-rechazar]');
  await p.waitForSelector('.a-solicitud', { state: 'detached', timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  enviarA('conductor', 'solicitud', oferta('v-fz-2'));
  await p.waitForSelector('.a-solicitud', { timeout: 10000 });
  ok(!(await p.$('.a-solicitud [data-fuera-zona]')), 'd) una oferta dentro de la zona: sin chip');
  await p.click('.a-solicitud [data-rechazar]');
  await p.waitForTimeout(800);
  enviarA('conductor', 'solicitud', oferta('v-fz-3', { fueraZona: { km: '<b>9</b>' } }));
  await p.waitForSelector('.a-solicitud', { timeout: 10000 });
  ok((await texto(p, '.a-solicitud [data-fuera-zona]')) === 'Fuera de zona' && !(await p.$('.a-solicitud [data-fuera-zona] b')), 'd) km que no es número: solo «Fuera de zona» (nada de HTML)');
  await p.click('.a-solicitud [data-rechazar]');
  await ctx.close();

  // Rechazado, con un motivo que trae HTML: se ve como texto.
  ({ ctx, p } = await contexto('rechazado', GPS.dentro));
  await entrarConductor(p, 'rocio@prueba.taxicun.com');
  ok(Boolean(await intento(p.waitForSelector('.a-revision-rechazado h1', { timeout: 20000 }))), 'd) rechazado: su pantalla');
  ok((await texto(p, '.a-revision h1')) === 'Tu registro no fue aprobado' && /No aprobado/i.test(await texto(p, '.a-revision-chip')), 'd) «Tu registro no fue aprobado» · «No aprobado»');
  const motivo = await p.$eval('[data-motivo-texto]', (n) => n.textContent).catch(() => null);
  ok(motivo === USUARIOS['rocio@prueba.taxicun.com'].conductor.motivo, `d) el motivo de la cooperativa, tal cual y como texto («${motivo}»)`);
  ok(!(await p.$('.a-revision img')) && (await p.evaluate(() => window.__xss)) !== 1, 'd) el HTML del motivo no se interpreta (sin <img>, sin onerror)');
  ok(!(await p.$('.a-revision [data-corregir]')) && Boolean(await p.$('.a-revision a[href="tel:3209042977"]')), 'd) sin «Corregir mis datos» y con «Llamar a Cootransrural»');
  await p.waitForTimeout(700);
  await foto(p, 'd-rechazado');
  await p.click('[data-revisar]');
  ok(await conAviso(p, /Tu registro sigue sin aprobar/), 'd) «Revisar de nuevo» → «Tu registro sigue sin aprobar»');
  await ctx.close();

  ({ ctx, p } = await contexto('retirado', GPS.dentro));
  await entrarConductor(p, 'mario@prueba.taxicun.com');
  ok(Boolean(await intento(p.waitForSelector('.a-revision-retirado h1', { timeout: 20000 }))) && (await texto(p, '.a-revision h1')) === 'Ya no estás en Cootransrural', 'd) retirado: «Ya no estás en Cootransrural»');
  ok((await p.$eval('[data-motivo-texto]', (n) => n.textContent).catch(() => '')) === 'Vendió el taxi.', 'd) retirado: con su motivo');
  await p.waitForTimeout(700);
  await foto(p, 'd-retirado');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* e) Recarga con «config»                                              */
/* ------------------------------------------------------------------ */
async function recarga() {
  srv.capa = { ZONA_SERVICIO: ZONA, VERSION_CONFIG: { version: 3 } };
  const { ctx, p } = await contexto('config', GPS.dentro);
  let cargas = 0;
  p.on('load', () => (cargas += 1));
  await entrarPasajero(p);
  await p.waitForTimeout(800);
  const fichasAntes = srv.fichas.length;
  let c0 = cargas;

  // e1) Sin viaje y con la app oculta: recarga de una vez y lee la ficha nueva.
  srv.capa.VERSION_CONFIG = { version: 4 };
  await visibilidad(p, true);
  enviarA('pasajero', 'config', { empresa: 'cootransrural', version: 4 });
  ok(Boolean(await hasta(() => cargas > c0, 8000)), 'e1) «config» v4 con la app oculta y sin viaje: recarga');
  await vista(p, 'inicio', 20000).catch(() => {});
  ok(srv.fichas.slice(fichasAntes).some((f) => f.version === 4), 'e1) y lee la ficha v4');
  ok(JSON.parse(await p.evaluate(() => localStorage.getItem('tc.config.recargas')) || '{}').cootransrural?.version === 4, 'e1) anota la versión por la que recargó');
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(1000);

  // e2) Con un viaje (buscando): espera; al terminar el viaje, recarga.
  await irAConfirmar(p);
  const t0 = Date.now();
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 10000);
  await hasta(() => solicitudes(t0).length, 6000);
  srv.capa.VERSION_CONFIG = { version: 5 };
  c0 = cargas;
  await visibilidad(p, true);
  enviarA('pasajero', 'config', { empresa: 'cootransrural', version: 5 });
  await p.waitForTimeout(3000);
  ok(cargas === c0, 'e2) con un viaje buscando taxi no recarga');
  enviarA('pasajero', 'cancelacion', { viajeId: solicitudes(t0)[0]?.datos?.viajeId, por: 'sistema' });
  ok(Boolean(await hasta(() => cargas > c0, 8000)), 'e2) al terminar el viaje, recarga');
  await vista(p, 'inicio', 20000).catch(() => {});
  ok(srv.fichas.at(-1)?.version === 5, 'e2) con la ficha v5');
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(800);

  // e3) La central anuncia la v6 pero la ficha sigue en v5 (p. ej. nginx aún sirve el archivo): una sola recarga.
  srv.configAlSaludar = { empresa: 'cootransrural', version: 6 };
  c0 = cargas;
  await visibilidad(p, true);
  enviarA('pasajero', 'config', { empresa: 'cootransrural', version: 6 });
  await hasta(() => cargas > c0, 8000);
  await vista(p, 'inicio', 20000).catch(() => {});
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await visibilidad(p, true);
  await p.waitForTimeout(4000);
  ok(cargas === c0 + 1, `e3) la ficha no cambió y la central repite la v6 al saludar: no entra en ciclo (${cargas - c0} recarga)`);
  srv.configAlSaludar = null;
  await visibilidad(p, false);

  // e4) A la vista y sin tocar la pantalla: recarga sola al minuto (en silencio).
  srv.capa.VERSION_CONFIG = { version: 7 };
  c0 = cargas;
  enviarA('pasajero', 'config', { empresa: 'cootransrural', version: 7 });
  await p.waitForTimeout(20000);
  ok(cargas === c0, 'e4) a la vista: no recarga enseguida');
  ok(Boolean(await hasta(() => cargas > c0, 60000, 500)), 'e4) sin tocarla, recarga sola al minuto');
  await vista(p, 'inicio', 20000).catch(() => {});
  ok(srv.fichas.at(-1)?.version === 7, 'e4) con la ficha v7');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* f) La web de la cooperativa                                         */
/* ------------------------------------------------------------------ */
async function web() {
  // f1) Con el archivo: lo mismo que puso la plantilla.
  srv.capa = null;
  let { ctx, p } = await contexto('web-1');
  await p.goto(`${BASE}el-rosal/`);
  await p.waitForFunction(() => window.ctSitioListo && document.querySelector('#tabla-rutas tr:not(.tabla-vacia)'), null, { timeout: 30000 });
  await p.waitForTimeout(800);
  const precios = await p.$$eval('[data-precio="minimaUrbana"]', (ns) => ns.map((n) => n.textContent));
  ok(precios.length === 2 && precios.every((x) => x === '$6.100'), `f1) con el archivo, la mínima sigue en $6.100 (${precios.join(', ')})`);
  const marcados = await p.$$eval('[data-precio^="destino:"]', (ns) => ns.map((n) => [n.dataset.precio.slice(8), n.textContent]));
  const iguales = marcados.every(([id, v]) => v === `$${ARCHIVO.DESTINOS_TARIFA.find((d) => d.id === id)?.valor.toLocaleString('es-CO')}`);
  ok(marcados.length === ARCHIVO.DESTINOS_TARIFA.length && iguales, `f1) la tabla oficial marca sus ${marcados.length} destinos, con el precio del archivo`);
  ok(/^https:\/\/www\.elrosal-cundinamarca\.gov\.co\//.test(await p.getAttribute('[data-enlace-fuente]', 'href')), 'f1) el enlace al Decreto 05, el del archivo');
  await ctx.close();

  // f2) Con la capa: la mínima, el valor por km, un destino, la nota y el enlace cambian a los vigentes.
  const z2 = ARCHIVO.DESTINOS_TARIFA.find((d) => d.zona === 2);
  srv.capa = {
    TARIFAS: {
      minimaUrbana: 6500, porKm: 2000, nota: 'Nota nueva de la cooperativa <b>sin HTML</b>.',
      fuente: { ...ARCHIVO.TARIFAS.fuente, url: 'https://www.funza-cundinamarca.gov.co/decreto-de-prueba' },
    },
    DESTINOS: { [z2.id]: 19900 },
    RUTAS_FIJADAS: ARCHIVO.RUTAS.map((r) => r.id),
  };
  ({ ctx, p } = await contexto('web-2'));
  await p.goto(`${BASE}el-rosal/`);
  await p.waitForFunction(() => window.ctSitioListo && document.querySelector('#tabla-rutas tr:not(.tabla-vacia)'), null, { timeout: 30000 });
  await p.waitForTimeout(800);
  const minimas = await p.$$eval('[data-precio="minimaUrbana"]', (ns) => ns.map((n) => n.textContent));
  ok(minimas.length === 2 && minimas.every((x) => x === '$6.500'), `f2) la mínima vigente en el lead y en la tarjeta (${minimas.join(', ')})`);
  ok((await texto(p, '[data-precio="porKm"]')) === '$2.000', 'f2) el valor por km vigente');
  ok((await p.$eval(`[data-precio="destino:${z2.id}"]`, (n) => n.textContent)) === '$19.900', `f2) el destino «${z2.destino}» con su precio vigente (en su zona, aún cerrada)`);
  ok(/a \$19\.900$/.test(await texto(p, '[data-precio-zona="2"]')), `f2) el rango de la zona 2 se recalcula (${await texto(p, '[data-precio-zona="2"]')})`);
  ok((await texto(p, '[data-texto-tarifas="nota"]')) === 'Nota nueva de la cooperativa <b>sin HTML</b>.' && !(await p.$('[data-texto-tarifas="nota"] b')), 'f2) la nota nueva, como texto');
  ok((await p.getAttribute('[data-enlace-fuente]', 'href')) === 'https://www.funza-cundinamarca.gov.co/decreto-de-prueba', 'f2) el enlace al acto vigente (.gov.co)');
  ok((await texto(p, '#rutas-titulo')) === 'Otros municipios: precios de Cootransrural' && /Estos precios los fija Cootransrural/.test(await texto(p, '#rutas-texto')), 'f2) todas las rutas fijadas: el título y el texto lo dicen');
  await p.selectOption('#cotizar-destino', 'madrid');
  await p.waitForTimeout(300);
  ok(/Precio fijado por Cootransrural/.test(await texto(p, '#cotizacion')) && /\$32\.000/.test(await texto(p, '#cotizacion')), `f2) el cotizador a Madrid: ${await texto(p, '#cotizacion')}`);
  await p.locator('#tarifas .urbanas').scrollIntoViewIfNeeded();
  await p.waitForTimeout(1500);
  await foto(p, 'f2-web-precios-vigentes');
  await ctx.close();

  // f3) Un enlace que no es .gov.co: se quita.
  srv.capa = { TARIFAS: { fuente: { ...ARCHIVO.TARIFAS.fuente, url: 'https://decreto-falso.example.com/d.pdf' } } };
  ({ ctx, p } = await contexto('web-3'));
  await p.goto(`${BASE}el-rosal/`);
  await p.waitForFunction(() => window.ctSitioListo, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  ok(!(await p.$('[data-enlace-fuente]')), 'f3) un enlace al acto fuera de .gov.co: no se pinta');
  await ctx.close();
  srv.capa = null;
}

const inicio = Date.now();
for (const [nombre, fn] of [['índice', indice], ['pasajero', pasajero], ['conductor', conductor], ['web', web], ['recarga', recarga]]) {
  try {
    await fn();
  } catch (e) {
    ok(false, `${nombre}: ${e.message.split('\n')[0]}`);
  }
}
ok(errores.length === 0, `sin errores de JavaScript en las páginas${errores.length ? `: ${errores.slice(0, 5).join(' | ')}` : ''}`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · fase 2 (web) · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - inicio) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
