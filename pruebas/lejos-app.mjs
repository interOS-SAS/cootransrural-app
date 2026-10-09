// «Lejos de toda cooperativa» (9-oct-2026) en la app TaxiCun, diseño A, modo real (?real=1), con el servidor de TaxiCun
// simulado aquí mismo (page.route y routeWebSocket, como f4a-app.mjs) según el contrato REAL del servidor 0.11.0
// (docs/CONTRATO.md §13): POST /api/cercania decide (exento para la cuenta de revisión y las de prueba), POST
// /api/interesados con esquema cerrado (autorizo, version 1.0, tiempoMs, plataforma…) y PUT /api/conductor con ubicacion.
//
//  Conductor (registro del taxi, la primera vez):
//   1) lejos (Medellín) → al «Enviar registro», POST /api/cercania y «Todavía no hay una cooperativa de TaxiCun cerca de
//      ti» (con los km y El Rosal) con «Quiero TaxiCun en mi cooperativa», «Ver cómo funciona» (la demo, en otra
//      pestaña) y «Sí soy de Cootransrural, continuar»; el formulario (nombre y celular de la cuenta), sus errores (también
//      sin la casilla de la autorización, con su texto TAL CUAL), el envío (POST /api/interesados: solo los campos del
//      esquema cerrado, distanciaKm, tiempoMs, sin posición) y lo escrito pintado como texto; «continuar» → PUT
//      /api/conductor con ubicacion { lat, lng, precisionM } y sin campos de más → «Tu registro está en revisión».
//   1b) «continuar» sin el formulario. 2) cerca (El Rosal) → sin aviso; el registro lleva la ubicación.
//   3) sin GPS (permiso negado) → sin /api/cercania, sin aviso ni ubicación.
//   4) cuenta de revisión en Cupertino → /api/cercania responde exento → sin aviso ni ubicación.
//   5) servidor anterior (/api/cercania 404) en Medellín → sin aviso ni ubicación.
//   6) la ruta de interesados no existe (servidor anterior) → «No pudimos enviar…» con info@taxicun.com.
//  Pasajero (con la sesión y la bienvenida de la central):
//   7) lejos → «Todavía no llegamos a tu zona» con «Avísame cuando llegue», «Ver cómo funciona» y «Ahora no»; el
//      formulario (cooperativa opcional: no va) → POST rol pasajero → «¡Gracias…!» → «Listo»; al volver a abrir, no sale.
//   8) «Ahora no» → no sale otra vez (un día).
//   9) cerca → nada. 10) sin GPS → nada (ni /api/cercania). 11) cuenta de revisión en Cupertino (bienvenida revision:
//      true) → nada, sin preguntar, y sigue el aviso del modo revisor de siempre («Estás lejos de El Rosal»).
//  11b) cuenta de prueba (exento sin revision en la bienvenida) → nada. 11c) servidor anterior (404) → nada.
//  12) «Ver cómo funciona» abre la demo de verdad (sin el modo real).
//
// Uso: node pruebas/lejos-app.mjs [url_base]   (estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5221 --api=http://127.0.0.1:5229). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5221/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/arreglos/pruebas/app/capturas-lejos').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const MEDELLIN = { latitude: 6.2442, longitude: -75.5812, accuracy: 30 };
const CUPERTINO = { latitude: 37.3349, longitude: -122.009, accuracy: 20 };
const EL_ROSAL = { latitude: CENTRO.lat + 0.004, longitude: CENTRO.lng, accuracy: 12 };
const CODIGO = '123456';
const HTML = '<img src=x onerror="window.__xss=1">Coop <b>Norte</b> & "Cía"';
// Lo que guarda el servidor (y la app manda): sin < > ` (se quitan), espacios simples.
const HTML_LIMPIO = 'img src=x onerror="window.__xss=1"Coop bNorte/b & "Cía"';
const AUTORIZACION = 'Autorizo a interOS S.A.S. (NIT 901.213.197-5) a usar estos datos para contactarme sobre la llegada de TaxiCun a mi municipio o cooperativa. Los guardan hasta 12 meses. Puedo pedir que los borren en info@taxicun.com.';
const CLAVES_INTERESADO = new Set(['rol', 'nombre', 'celular', 'municipio', 'cooperativa', 'distanciaKm', 'plataforma', 'autorizo', 'version', 'tiempoMs', 'sitioWeb']);
const CLAVES_CONDUCTOR = new Set(['empresa', 'movil', 'placa', 'vehiculo', 'color', 'ubicacion']);
const kmEntre = (a, b) => {
  const r = (g) => (g * Math.PI) / 180;
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
};

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

/* ---------------- Servidor de TaxiCun simulado ---------------- */
const srv = {
  n: 0,
  sesiones: new Map(),
  usuarios: new Map(), // correo → { nombre, celular, conductor }
  peticiones: [],
  exentos: new Set(), // correos de la cuenta de revisión y de las de prueba: /api/cercania responde exento
  cercania: 'ok', // ok | 404 (servidor anterior)
  revisionBus: false,
  interesados: 'ok', // ok | 404
};
const usuario = (correo, extra = {}) => {
  srv.usuarios.set(correo, { nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: null, ...extra });
  return correo;
};
const yoDe = (correo) => {
  const u = srv.usuarios.get(correo);
  return { usuario: { id: `u-${correo}`, correo, nombre: u.nombre, celular: u.celular }, conductor: u.conductor };
};
const pide = (metodo, ruta, correo = null) => srv.peticiones.filter((x) => x.metodo === metodo && x.ruta === ruta && (!correo || x.correo === correo));

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
    if (cuerpo?.codigo !== CODIGO || !srv.usuarios.has(c)) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
    srv.sesiones.set(t, c);
    return responder(200, { token: t, ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  // Las dos rutas públicas del §13 (con o sin token).
  if (metodo === 'POST' && ruta === 'cercania') {
    if (srv.cercania === '404') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Route POST:/api/cercania not found', error: 'Not Found', statusCode: 404 }) });
    const claves = Object.keys(cuerpo || {});
    if (typeof cuerpo?.lat !== 'number' || typeof cuerpo?.lng !== 'number' || claves.some((k) => !['lat', 'lng', 'precisionM'].includes(k))) return responder(400, { error: 'datos_invalidos' });
    if (correo && srv.exentos.has(correo)) return responder(200, { lejos: false, km: null, umbralKm: 30, exento: true, cooperativa: null });
    const km = Math.round(kmEntre(cuerpo, CENTRO) * 10) / 10;
    return responder(200, { lejos: km > 30, km, umbralKm: 30, exento: false, cooperativa: { id: 'cootransrural', nombre: 'Cootransrural' } });
  }
  if (metodo === 'POST' && ruta === 'interesados') {
    if (srv.interesados === '404') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Route POST:/api/interesados not found', error: 'Not Found', statusCode: 404 }) });
    const c = cuerpo || {};
    const bien = Object.keys(c).every((k) => CLAVES_INTERESADO.has(k)) && ['conductor', 'pasajero'].includes(c.rol) && c.autorizo === true && c.version === '1.0'
      && typeof c.nombre === 'string' && typeof c.municipio === 'string' && /^3\d{9}$/.test(c.celular || '');
    return bien ? responder(200, { ok: true }) : responder(400, { error: 'datos_invalidos' });
  }
  if (!correo) return responder(401, { error: 'sin_sesion' });
  if (metodo === 'GET' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PATCH' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PUT' && ruta === 'conductor') {
    const u = srv.usuarios.get(correo);
    u.conductor = { estado: srv.exentos.has(correo) ? 'aprobado' : 'pendiente', empresa: cuerpo.empresa, movil: cuerpo.movil, placa: cuerpo.placa, vehiculo: cuerpo.vehiculo, color: cuerpo.color };
    return responder(200, yoDe(correo));
  }
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: [] });
  return responder(404, { error: 'no_existe' });
}

const enviar = (ws, tipo, datos) => {
  try {
    ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de: 'servidor', ts: Date.now(), datos }));
  } catch {
    /* cerrado */
  }
};
function atenderBus(ws) {
  ws.onMessage((texto) => {
    let m;
    try {
      m = JSON.parse(String(texto));
    } catch {
      return;
    }
    if (m.tipo !== 'hola') return;
    const correo = srv.sesiones.get(m.datos?.token);
    if (!correo) {
      enviar(ws, 'error', { codigo: 'sin_sesion' });
      ws.close({ code: 4401, reason: 'sin_sesion' });
      return;
    }
    const u = srv.usuarios.get(correo);
    const extra = srv.revisionBus ? { revision: true } : {};
    if (m.datos.rol === 'conductor') {
      enviar(ws, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c1', ...u.conductor, nombre: u.nombre, tel: u.celular }, ...extra });
    } else {
      enviar(ws, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: `p_${correo}`, ...extra });
    }
    enviar(ws, 'viaje_actual', null);
  });
}

/* ---------------- Ayudas ---------------- */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { geo = EL_ROSAL, permiso = true } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: 'America/Bogota',
    ...(permiso ? { geolocation: geo, permissions: ['geolocation'] } : { permissions: [] }),
  });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  const p = await ctx.newPage();
  // Sin permiso: el diálogo del navegador no sale en Chromium sin cabeza; la lectura falla con «denegado».
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const sinXss = (p) => p.evaluate(() => window.__xss === undefined);

async function escribirCodigo(p, selector) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(CODIGO, { delay: 30 });
}

// Conductor nuevo (con nombre y celular, sin taxi): entra y llena «Tu taxi». Devuelve true si quedó en «Tu taxi».
async function conductorHastaTuTaxi(p, correo) {
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6');
  if (!(await intento(p.waitForSelector('.a-ingreso-real input[name=placa]', { timeout: 15000 })))) return false;
  await p.fill('.a-ingreso-real input[name=movil]', '45');
  await p.fill('.a-ingreso-real input[name=placa]', 'WFK123');
  return true;
}
const enviarRegistro = (p) => p.click('.a-ingreso-real [type=submit]');
const enRevision = (p) => intento(p.waitForFunction(() => /Tu registro está en revisión/.test(document.querySelector('.a-ingreso-real')?.innerText || ''), null, { timeout: 15000 }));
const avisoConductor = (p, timeout = 20000) => intento(p.waitForSelector('[data-lejos="conductor"]', { timeout }));

async function entrarPasajero(p, correo) {
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', correo);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6');
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.click('.a-bienvenida [data-empezar]');
  await p.waitForSelector('.a-app[data-vista="inicio"]', { timeout: 20000 });
}
const avisoPasajero = (p, timeout = 12000) => intento(p.waitForSelector('.a-modal-lejos.a-abierto [data-lejos="pasajero"]', { timeout }));

/* ---------------- Conductor ---------------- */
const soloClaves = (o, permitidas) => Object.keys(o || {}).every((k) => permitidas.has(k));

async function llenarFormulario(p, { municipio, cooperativa = null, celular = null, autorizo = true }) {
  await p.fill('[data-lejos-form] input[name=municipio]', municipio);
  if (cooperativa !== null) await p.fill('[data-lejos-form] input[name=cooperativa]', cooperativa);
  if (celular !== null) await p.fill('[data-lejos-form] input[name=celular]', celular);
  if (autorizo && !(await p.isChecked('[data-lejos-form] input[name=autorizo]'))) await p.click('[data-lejos-form] .a-lejos-autorizo');
}

async function conductorLejos() {
  console.log('\n— 1) Conductor lejos (Medellín)');
  srv.cercania = 'ok';
  srv.interesados = 'ok';
  const correo = usuario('lejos1@correo.test');
  const { ctx, p } = await contexto('conductor-lejos', { geo: MEDELLIN });
  ok(await conductorHastaTuTaxi(p, correo), 'entra y llega a «Tu taxi»');
  await enviarRegistro(p);
  ok(await avisoConductor(p), 'al «Enviar registro» sale el aviso');
  await foto(p, 'C1-aviso-conductor');
  const cer = pide('POST', 'cercania', correo)[0]?.cuerpo || {};
  ok(cer.lat === 6.2442 && cer.lng === -75.5812 && cer.precisionM === 30 && soloClaves(cer, new Set(['lat', 'lng', 'precisionM'])), `POST /api/cercania con la posición y su precisión (${JSON.stringify(cer)})`);
  const t = await texto(p, '[data-lejos="conductor"]');
  ok(/Todavía no hay una cooperativa de TaxiCun cerca de ti/.test(t), 'título «Todavía no hay una cooperativa de TaxiCun cerca de ti»');
  ok(/Estás a unos \d{3} km de El Rosal/.test(t), `dice a cuántos km está y dónde («${(t.match(/Estás a unos [^,]*/) || [''])[0]}»)`);
  ok(/Quiero TaxiCun en mi cooperativa/.test(t) && /Ver cómo funciona/.test(t) && /Sí soy de Cootransrural, continuar/.test(t), 'las tres opciones');
  ok(pide('PUT', 'conductor', correo).length === 0, 'el registro todavía no se mandó');
  const demo = await p.$eval('[data-lejos="conductor"] [data-lejos-demo]', (a) => ({ href: a.href, target: a.target }));
  ok(/\/taxicun\/conductor\/\?e=cootransrural&real=0$/.test(demo.href) && demo.target === '_blank', `«Ver cómo funciona» abre la demo del conductor en otra pestaña (${demo.href.replace(BASE, '/')})`);
  // Formulario
  await p.click('[data-lejos-quiero]');
  await p.waitForSelector('[data-lejos-form="conductor"]', { timeout: 5000 });
  ok(await p.inputValue('[data-lejos-form] input[name=nombre]') === 'Luis Alberto Rodríguez', 'el nombre viene de la cuenta');
  ok((await p.inputValue('[data-lejos-form] input[name=celular]')).replace(/\D/g, '') === '3109876543', 'el celular viene de la cuenta');
  ok(await texto(p, '[data-lejos-form] [data-autorizacion]') === AUTORIZACION, 'la casilla trae el texto de la autorización TAL CUAL (versión 1.0)');
  ok(!(await p.isChecked('[data-lejos-form] input[name=autorizo]')), 'la casilla empieza sin marcar');
  ok(await p.$eval('[data-lejos-form] input[name=sitioWeb]', (i) => i.closest('.a-solo-lector') !== null && i.tabIndex === -1 && i.value === ''), 'el campo trampa «sitioWeb» está escondido, fuera del tabulador y vacío');
  await p.click('[data-lejos-form] [type=submit]');
  ok(/Escribe tu municipio/.test(await texto(p, '[data-lejos-form] [data-error]')), 'sin municipio: «Escribe tu municipio.»');
  await p.fill('[data-lejos-form] input[name=municipio]', 'Medellín');
  await p.click('[data-lejos-form] [type=submit]');
  ok(/cooperativa/.test(await texto(p, '[data-lejos-form] [data-error]')), 'sin cooperativa: la pide (conductor)');
  await p.fill('[data-lejos-form] input[name=cooperativa]', 'www.coopnorte.com');
  await p.click('[data-lejos-form] [type=submit]');
  ok(/sin enlaces/.test(await texto(p, '[data-lejos-form] [data-error]')), 'una cooperativa con enlace: «sin enlaces» (el servidor la rechazaría)');
  await p.fill('[data-lejos-form] input[name=cooperativa]', HTML);
  await p.fill('[data-lejos-form] input[name=celular]', '2101234567');
  await p.click('[data-lejos-form] [type=submit]');
  ok(/10 dígitos/.test(await texto(p, '[data-lejos-form] [data-error]')), 'celular que no empieza por 3: error');
  await p.fill('[data-lejos-form] input[name=celular]', '3201234567');
  await p.click('[data-lejos-form] [type=submit]');
  ok(/marca la casilla/.test(await texto(p, '[data-lejos-form] [data-error]')), 'sin la casilla: «marca la casilla de la autorización»');
  ok(pide('POST', 'interesados', correo).length === 0, 'con errores no se manda nada');
  await p.click('[data-lejos-form] .a-lejos-autorizo');
  await foto(p, 'C1-formulario-conductor');
  await p.click('[data-lejos-form] [type=submit]');
  ok(await intento(p.waitForSelector('[data-lejos-gracias]', { timeout: 8000 })), '«¡Gracias…!» después de enviar');
  const envio = pide('POST', 'interesados', correo)[0];
  const env = envio?.cuerpo || {};
  ok(envio && soloClaves(env, CLAVES_INTERESADO), `solo los campos del esquema cerrado (${Object.keys(env).join(', ')})`);
  ok(env.rol === 'conductor' && env.municipio === 'Medellín' && env.cooperativa === HTML_LIMPIO && env.nombre === 'Luis Alberto Rodríguez' && env.celular === '3201234567', `rol, municipio, cooperativa (sin < > ni comillas invertidas), nombre y celular (${env.cooperativa})`);
  ok(env.autorizo === true && env.version === '1.0' && env.plataforma === 'web', 'autorizo: true, version 1.0 y plataforma web');
  ok(typeof env.distanciaKm === 'number' && env.distanciaKm > 200 && env.distanciaKm < 260, `distanciaKm: la de /api/cercania (${env.distanciaKm})`);
  ok(Number.isInteger(env.tiempoMs) && env.tiempoMs >= 3200, `tiempoMs desde que se abrió el formulario, nunca menos de 3,2 s (${env.tiempoMs})`);
  ok(env.sitioWeb === undefined && env.pos === undefined && env.empresa === undefined, 'sin el campo trampa, sin posición y sin empresa');
  const g = await texto(p, '[data-lejos-gracias]');
  ok(g.includes('& "Cía"') && (await sinXss(p)), 'lo escrito se pinta como texto (sin HTML)');
  await foto(p, 'C1-gracias-conductor');
  await p.click('[data-lejos-continuar]');
  ok(await enRevision(p), '«Sí soy de Cootransrural, continuar» → «Tu registro está en revisión»');
  const put = pide('PUT', 'conductor', correo).at(-1)?.cuerpo || {};
  ok(put.movil === '045' && put.placa === 'WFK123' && put.empresa === 'cootransrural', 'el registro lleva los datos del taxi que ya había escrito');
  ok(put.ubicacion && put.ubicacion.lat === 6.2442 && put.ubicacion.lng === -75.5812 && put.ubicacion.precisionM === 30, `y la ubicación del registro (${JSON.stringify(put.ubicacion)})`);
  ok(soloClaves(put, CLAVES_CONDUCTOR) && put.pos === undefined && put.confirmoLejos === undefined, 'sin campos fuera del contrato (ni pos ni confirmoLejos)');
  ok(pide('POST', 'cercania', correo).length === 1, '/api/cercania una sola vez');
  await ctx.close();
}

async function conductorLejosDirecto() {
  console.log('\n— 1b) Conductor lejos: «continuar» sin el formulario');
  const correo = usuario('lejos1b@correo.test');
  const { ctx, p } = await contexto('conductor-lejos-b', { geo: MEDELLIN });
  await conductorHastaTuTaxi(p, correo);
  await enviarRegistro(p);
  await avisoConductor(p);
  await p.click('[data-lejos="conductor"] [data-lejos-continuar]');
  ok(await enRevision(p), '«continuar» manda el registro');
  const puts = pide('PUT', 'conductor', correo);
  ok(puts.length === 1 && puts[0].cuerpo.ubicacion?.lat === 6.2442, 'una sola vez, con la ubicación');
  ok(pide('POST', 'interesados', correo).length === 0, 'sin formulario no se manda ningún interesado');
  await ctx.close();
}

async function conductorSinAviso(nombre, { geo, permiso = true, exento = false, cercania = 'ok', preguntaCercania, conUbicacion, etiqueta }) {
  console.log(`\n— ${etiqueta}`);
  srv.cercania = cercania;
  const correo = usuario(`${nombre}@correo.test`);
  if (exento) srv.exentos.add(correo);
  const { ctx, p } = await contexto(nombre, { geo, permiso });
  ok(await conductorHastaTuTaxi(p, correo), 'llega a «Tu taxi»');
  await enviarRegistro(p);
  const ruta = exento ? intento(p.waitForSelector('.a-ingreso-real', { state: 'detached', timeout: 20000 })) : enRevision(p);
  ok(await ruta, exento ? 'el registro pasa sin aviso (la cuenta de revisión queda aprobada)' : 'el registro pasa sin aviso («Tu registro está en revisión»)');
  ok(!(await p.$('[data-lejos]')), 'nunca se vio el aviso');
  ok((pide('POST', 'cercania', correo).length > 0) === preguntaCercania, preguntaCercania ? 'le preguntó al servidor (/api/cercania)' : 'no le preguntó nada al servidor (sin posición no hay a qué preguntar)');
  const put = pide('PUT', 'conductor', correo).at(-1)?.cuerpo || {};
  ok(conUbicacion ? Boolean(put.ubicacion?.lat) : put.ubicacion === undefined, conUbicacion ? `el registro lleva la ubicación (${JSON.stringify(put.ubicacion)})` : 'el registro no lleva ubicación');
  ok(soloClaves(put, CLAVES_CONDUCTOR), 'ni campos de más');
  await foto(p, `C-${nombre}`);
  await ctx.close();
  srv.cercania = 'ok';
}

async function conductorSinRuta() {
  console.log('\n— 6) La ruta de interesados no existe (servidor anterior)');
  srv.interesados = '404';
  const correo = usuario('sinruta@correo.test');
  const { ctx, p } = await contexto('conductor-sin-ruta', { geo: MEDELLIN });
  await conductorHastaTuTaxi(p, correo);
  await enviarRegistro(p);
  await avisoConductor(p);
  await p.click('[data-lejos-quiero]');
  await llenarFormulario(p, { municipio: 'Medellín', cooperativa: 'Coop Norte' });
  await p.click('[data-lejos-form] [type=submit]');
  ok(await intento(p.waitForSelector('[data-lejos-form] [data-correo]:not([hidden])', { timeout: 8000 })), 'dice cómo escribirnos');
  const t = await texto(p, '[data-lejos-form]');
  ok(/No pudimos enviar tus datos ahora/.test(t) && /info@taxicun\.com/.test(t), '«No pudimos enviar tus datos ahora.» con info@taxicun.com');
  ok(await p.$eval('[data-lejos-form] [data-correo] a', (a) => a.getAttribute('href')) === 'mailto:info@taxicun.com', 'con el enlace mailto:info@taxicun.com');
  await foto(p, 'C6-sin-ruta');
  await p.click('[data-lejos-form] [data-volver]');
  ok(await avisoConductor(p, 4000), '«Volver» regresa al aviso');
  srv.interesados = 'ok';
  await ctx.close();
}

/* ---------------- Pasajero ---------------- */
async function pasajeroLejos() {
  console.log('\n— 7) Pasajero lejos (Medellín)');
  srv.revisionBus = false;
  const correo = usuario('ana.lejos@correo.test', { nombre: 'Ana María Gómez', celular: '3001234567' });
  const { ctx, p } = await contexto('pasajero-lejos', { geo: MEDELLIN });
  await entrarPasajero(p, correo);
  ok(await avisoPasajero(p), 'sale «Todavía no llegamos a tu zona»');
  ok(pide('POST', 'cercania', correo).length === 1, 'después de preguntarle al servidor una vez (/api/cercania con la sesión)');
  await p.waitForTimeout(400);
  await foto(p, 'P7-aviso-pasajero');
  const t = await texto(p, '.a-modal-lejos .a-modal');
  ok(/Todavía no llegamos a tu zona/.test(t) && /Avísame cuando llegue/.test(t) && /Ver cómo funciona/.test(t) && /Ahora no/.test(t), 'con «Avísame cuando llegue», «Ver cómo funciona» y «Ahora no»');
  const demo = await p.$eval('.a-modal-lejos [data-lejos-demo]', (a) => ({ href: a.href, target: a.target }));
  ok(/\/taxicun\/\?e=cootransrural&real=0$/.test(demo.href) && demo.target === '_blank', `«Ver cómo funciona» abre la demo del pasajero (${demo.href.replace(BASE, '/')})`);
  await p.click('.a-modal-lejos [data-lejos-avisame]');
  await p.waitForSelector('.a-modal-lejos [data-lejos-form="pasajero"]', { timeout: 5000 });
  ok(await p.$eval('.a-modal-lejos .a-modal > h2', (h) => h.hidden), 'el formulario reemplaza el título del aviso');
  ok(await p.inputValue('[data-lejos-form] input[name=nombre]') === 'Ana María Gómez', 'el nombre viene de la cuenta');
  await llenarFormulario(p, { municipio: 'Medellín' });
  await foto(p, 'P7-formulario-pasajero');
  await p.click('[data-lejos-form] [type=submit]');
  ok(await intento(p.waitForSelector('.a-modal-lejos [data-lejos-gracias]', { timeout: 8000 })), 'sin cooperativa también se envía (opcional para el pasajero)');
  const env = pide('POST', 'interesados', correo)[0]?.cuerpo || {};
  ok(env.rol === 'pasajero' && env.municipio === 'Medellín' && env.cooperativa === undefined && env.celular === '3001234567' && env.autorizo === true && env.version === '1.0', `POST /api/interesados con rol pasajero, sin cooperativa (${JSON.stringify(env)})`);
  ok(soloClaves(env, CLAVES_INTERESADO) && typeof env.distanciaKm === 'number' && env.pos === undefined, 'solo los campos del esquema, con distanciaKm y sin posición');
  ok(env.tiempoMs >= 3200, `aunque se envió enseguida, la app esperó a los 3,2 s (tiempoMs ${env.tiempoMs}): el servidor no lo toma por trampa`);
  ok(/Te avisamos al 300 123 4567 cuando TaxiCun llegue a Medellín/.test(await texto(p, '.a-modal-lejos [data-lejos-gracias]')), '«Te avisamos al 300 123 4567 cuando TaxiCun llegue a Medellín.»');
  await foto(p, 'P7-gracias-pasajero');
  await p.click('.a-modal-lejos [data-lejos-listo]');
  ok(await intento(p.waitForSelector('.a-modal-lejos', { state: 'detached', timeout: 5000 })), '«Listo» cierra');
  const hasta30 = await p.evaluate(() => JSON.parse(localStorage.getItem('taxicun.lejos.pasajero') || 'null')?.hasta - Date.now());
  ok(hasta30 > 29 * 864e5 && hasta30 <= 30 * 864e5, 'no vuelve a salir en 30 días');
  const antes = pide('POST', 'cercania', correo).length;
  await p.reload();
  await p.waitForSelector('.a-app[data-vista="inicio"]', { timeout: 20000 });
  ok(!(await avisoPasajero(p, 6000)), 'al volver a abrir la app no sale');
  ok(pide('POST', 'cercania', correo).length === antes, 'y ni siquiera le pregunta al servidor');
  await ctx.close();
}

async function pasajeroAhoraNo() {
  console.log('\n— 8) Pasajero lejos: «Ahora no»');
  srv.revisionBus = false;
  const correo = usuario('ana.ahorano@correo.test', { nombre: 'Ana María Gómez', celular: '3001234567' });
  const { ctx, p } = await contexto('pasajero-ahora-no', { geo: MEDELLIN });
  await entrarPasajero(p, correo);
  ok(await avisoPasajero(p), 'sale el aviso');
  await p.click('.a-modal-lejos [data-lejos-cerrar]');
  ok(await intento(p.waitForSelector('.a-modal-lejos', { state: 'detached', timeout: 5000 })), '«Ahora no» lo cierra');
  const h = await p.evaluate(() => JSON.parse(localStorage.getItem('taxicun.lejos.pasajero') || 'null')?.hasta - Date.now());
  ok(h > 23 * 36e5 && h <= 24 * 36e5, 'no vuelve a salir en un día');
  ok(pide('POST', 'interesados', correo).length === 0, 'no se mandó nada');
  await p.reload();
  await p.waitForSelector('.a-app[data-vista="inicio"]', { timeout: 20000 });
  ok(!(await avisoPasajero(p, 6000)), 'al recargar no sale');
  await ctx.close();
}

async function pasajeroSinAviso(nombre, { geo, permiso = true, revisionBus = false, exento = false, cercania = 'ok', preguntaCercania, etiqueta }) {
  console.log(`\n— ${etiqueta}`);
  srv.revisionBus = revisionBus;
  srv.cercania = cercania;
  const correo = usuario(`${nombre}@correo.test`, { nombre: 'Ana María Gómez', celular: '3001234567' });
  if (exento) srv.exentos.add(correo);
  const { ctx, p } = await contexto(nombre, { geo, permiso });
  await p.addInitScript(() => {
    window.__avisos = [];
    new MutationObserver(() => document.querySelectorAll('.a-toast:not([data-visto])').forEach((n) => { n.dataset.visto = '1'; window.__avisos.push(n.innerText.replace(/\s+/g, ' ')); })).observe(document, { childList: true, subtree: true });
  });
  await entrarPasajero(p, correo);
  ok(!(await avisoPasajero(p, 9000)), 'no sale «Todavía no llegamos a tu zona»');
  ok((pide('POST', 'cercania', correo).length > 0) === preguntaCercania, preguntaCercania ? 'le preguntó al servidor (/api/cercania)' : 'no le preguntó nada al servidor');
  if (revisionBus) ok(await hasta(() => p.evaluate(() => window.__avisos.some((a) => /Estás lejos de El Rosal/.test(a))), 8000), 'sigue el aviso del modo revisor («Estás lejos de El Rosal»)');
  await foto(p, `P-${nombre}`);
  await ctx.close();
  srv.revisionBus = false;
  srv.cercania = 'ok';
}

async function demoDeVerdad() {
  console.log('\n— 12) «Ver cómo funciona» abre la demo de verdad');
  const { ctx, p } = await contexto('demo', { geo: MEDELLIN });
  await p.goto(`${BASE}taxicun/?real=1`); // la pestaña queda en modo real
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  const [nueva] = await Promise.all([
    ctx.waitForEvent('page'),
    p.evaluate((u) => { const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); }, `${BASE}taxicun/?e=cootransrural&real=0`),
  ]);
  await nueva.waitForLoadState('domcontentloaded');
  ok(await intento(nueva.waitForSelector('.a-raiz, .a-app, .a-bienvenida', { timeout: 30000 })), 'la demo carga');
  ok(await nueva.evaluate(() => document.documentElement.dataset.modo !== 'real'), 'sin el modo real');
  ok(!pide('GET', 'yo').some((x) => x.t > Date.now() - 20000 && !x.correo), 'la demo no le pregunta nada al servidor');
  await foto(nueva, 'P12-demo');
  await ctx.close();
}

try {
  await conductorLejos();
  await conductorLejosDirecto();
  await conductorSinAviso('cerca', { geo: EL_ROSAL, preguntaCercania: true, conUbicacion: true, etiqueta: '2) Conductor cerca (El Rosal)' });
  await conductorSinAviso('singps', { geo: MEDELLIN, permiso: false, preguntaCercania: false, conUbicacion: false, etiqueta: '3) Conductor sin GPS (permiso negado)' });
  await conductorSinAviso('revisor', { geo: CUPERTINO, exento: true, preguntaCercania: true, conUbicacion: false, etiqueta: '4) Cuenta de revisión en Cupertino (el servidor responde exento)' });
  await conductorSinAviso('anterior', { geo: MEDELLIN, cercania: '404', preguntaCercania: true, conUbicacion: false, etiqueta: '5) Servidor anterior (/api/cercania 404) en Medellín' });
  await conductorSinRuta();
  await pasajeroLejos();
  await pasajeroAhoraNo();
  await pasajeroSinAviso('ana-cerca', { geo: EL_ROSAL, preguntaCercania: true, etiqueta: '9) Pasajero cerca (El Rosal)' });
  await pasajeroSinAviso('ana-singps', { geo: MEDELLIN, permiso: false, preguntaCercania: false, etiqueta: '10) Pasajero sin GPS' });
  await pasajeroSinAviso('ana-revisor', { geo: CUPERTINO, revisionBus: true, exento: true, preguntaCercania: false, etiqueta: '11) Pasajero de la cuenta de revisión en Cupertino (bienvenida revision)' });
  await pasajeroSinAviso('ana-prueba', { geo: MEDELLIN, exento: true, preguntaCercania: true, etiqueta: '11b) Pasajero de una cuenta de prueba en Medellín (exento)' });
  await pasajeroSinAviso('ana-anterior', { geo: MEDELLIN, cercania: '404', preguntaCercania: true, etiqueta: '11c) Pasajero con un servidor anterior (/api/cercania 404)' });
  await demoDeVerdad();
} catch (e) {
  ok(false, `la prueba se detuvo: ${e.message.split('\n')[0]}`);
} finally {
  ok(errores.length === 0, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 4).join(' | ')}` : ''}`);
  await b.close();
}
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exitCode = fallas ? 1 : 0;
