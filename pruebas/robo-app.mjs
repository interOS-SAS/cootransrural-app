// «GPS del taxi» y «Reportar robo» (servidor 0.17.0) en «Mi taxi» de la app del conductor, diseño A, modo real (?real=1),
// con el servidor de TaxiCun simulado aquí mismo (HTTP con page.route y el WebSocket /api/bus con routeWebSocket).
// Recorre: un servidor sin la ruta (404) y uno que dice { disponible: false } → «Mi taxi» como siempre; con GPS → «En
// línea» y «Reportar robo»; «Cancelar» no manda nada; «Sí, reportar robo» manda { clave, pos } y muestra «Robo reportado»
// con «Llamar a la Línea 123»; 429 demasiados_reportes → «Ya lo reportaste»; 500 → «No se pudo enviar».
//
// Uso: node --import <pw-registrar.mjs> pruebas/robo-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5961). ~1 min.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5961/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-gps-jm-vl03/capturas-robo').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const CODIGO = '123456';
const LUIS = 'luis@prueba.taxicun.com';

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

/* Servidor de TaxiCun simulado */
const CONDUCTOR = { estado: 'aprobado', empresa: 'cootransrural', movil: '001', placa: 'JMZ922', vehiculo: 'KIA', color: 'Amarillo' };
const srv = {
  n: 0, sesiones: new Map(), peticiones: [],
  gps: 'sin_ruta', // 'sin_ruta' | 'no' | 'si'
  robo: 200, // lo que responde POST conductor/gps/robo
  abierto: false,
};
const yo = () => ({ usuario: { id: 'u-luis', correo: LUIS, nombre: 'Luis Alberto Rodríguez', celular: '3109876543', rol: 'conductor' }, conductor: CONDUCTOR });
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
  srv.peticiones.push({ metodo, ruta, cuerpo, t: Date.now() });
  const responder = (estado, datos) => route.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(datos) });
  if (metodo === 'GET' && ruta === 'empresas/indice') return responder(404, { error: 'no_existe' });
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    if (cuerpo?.codigo !== CODIGO) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}`;
    srv.sesiones.set(t, LUIS);
    return responder(200, { token: t, ...yo() });
  }
  if (metodo === 'POST' && ruta === 'cercania') return responder(200, { lejos: false, km: 0, umbralKm: 30, exento: true, cooperativa: null });
  if (!correo) return responder(401, { error: 'sin_sesion' });
  if (ruta === 'yo') return responder(200, yo());
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: [] });
  if (metodo === 'GET' && ruta === 'conductor/gps') {
    if (srv.gps === 'sin_ruta') return responder(404, { message: 'Route GET:/api/conductor/gps not found', error: 'Not Found', statusCode: 404 });
    if (srv.gps === 'no') return responder(200, { disponible: false });
    return responder(200, { disponible: true, enLinea: true, roboAbierto: srv.abierto });
  }
  if (metodo === 'POST' && ruta === 'conductor/gps/robo') {
    if (srv.robo === 200) {
      srv.abierto = true;
      return responder(200, { ok: true, enLinea: true });
    }
    if (srv.robo === 429) return responder(429, { error: 'demasiados_reportes' });
    return responder(500, { error: 'error' });
  }
  return responder(404, { error: 'no_existe' });
}
const enviar = (ws, tipo, datos) => ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de: 'servidor', ts: Date.now(), datos }));
function atenderBus(ws) {
  ws.onMessage((texto) => {
    let m;
    try {
      m = JSON.parse(String(texto));
    } catch {
      return;
    }
    if (m.tipo !== 'hola') return;
    if (!srv.sesiones.get(m.datos?.token)) return ws.close({ code: 4401, reason: 'sin_sesion' });
    enviar(ws, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: 'Luis Alberto Rodríguez', conductor: { id: 'c_luis', ...CONDUCTOR, nombre: 'Luis Alberto Rodríguez', tel: '3109876543', calificacion: 4.9, viajes: 120 }, avisarCentral: true });
    enviar(ws, 'viaje_actual', null);
  });
}

const b = await chromium.launch({ executablePath: EXE });
const errores = [];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
await ctx.route(`${BASE}api/**`, atenderApi);
await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
const p = await ctx.newPage();
p.on('pageerror', (e) => errores.push(e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`consola: ${m.text()}`);
});
const foto = (n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
async function tocarModal(textoBoton) {
  const sel = `.a-modal-capa.a-abierto .a-modal :is(button, a):has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(350);
  await p.click(sel);
  await p.waitForTimeout(400);
}
const tituloModal = () => p.evaluate(() => [...document.querySelectorAll('.a-modal-capa.a-abierto h2')].at(-1)?.textContent.trim() || null);
async function abrirMiTaxi() {
  for (let i = 0; i < 3 && (await p.$('.a-panel-capa.a-abierto, .a-panel.a-abierto')); i++) await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(300);
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-capa.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(300);
  await p.click('.a-menu-item:has-text("Mi taxi")');
  await p.waitForSelector('.a-mi-taxi', { timeout: 8000 });
}

try {
  await p.goto(`${BASE}taxicun/conductor/?real=1`);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await p.waitForSelector('.a-ingreso-real .a-casillas-6 input', { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click('.a-ingreso-real .a-casillas-6 input >> nth=0');
  await p.keyboard.type(CODIGO, { delay: 30 });
  await p.waitForSelector('[data-menu]', { timeout: 20000 });
  await p.waitForTimeout(800);
  for (let i = 0; i < 2; i++) if (await p.$('.a-modal-capa.a-abierto')) await intento(tocarModal('Ahora no'));

  // a) Servidor sin la ruta y servidor que dice «no disponible»: «Mi taxi» como siempre.
  for (const caso of ['sin_ruta', 'no']) {
    srv.gps = caso;
    const antes = pide('GET', 'conductor/gps').length;
    await abrirMiTaxi();
    await hasta(() => pide('GET', 'conductor/gps').length > antes, 5000);
    await p.waitForTimeout(500);
    ok(!(await p.$('[data-gps-taxi]')), `a) ${caso === 'sin_ruta' ? 'servidor sin la ruta (404)' : '{ disponible: false }'}: sin «GPS del taxi»`);
  }

  // b) Con GPS: «En línea» y «Reportar robo».
  srv.gps = 'si';
  await abrirMiTaxi();
  await p.waitForSelector('[data-gps-taxi]', { timeout: 8000 });
  const t = await p.textContent('[data-gps-taxi]');
  ok(/GPS del taxi/.test(t) && /En línea/.test(t) && /Reportar robo/.test(t), 'b) «GPS del taxi» · En línea · «Reportar robo»');
  await foto('b-mi-taxi-gps');

  // c) «Cancelar» no manda nada.
  await p.click('[data-robo]');
  ok((await hasta(tituloModal, 5000)) === '¿Te robaron el taxi?', 'c) pide confirmación: «¿Te robaron el taxi?»');
  await foto('c-confirmar');
  await tocarModal('Cancelar');
  await p.waitForTimeout(500);
  ok(pide('POST', 'conductor/gps/robo').length === 0, 'c) «Cancelar»: no se manda nada');

  // d) «Sí, reportar robo»: { clave, pos } y «Robo reportado» con la Línea 123.
  await p.click('[data-robo]');
  await tocarModal('Sí, reportar robo');
  const envio = await hasta(() => pide('POST', 'conductor/gps/robo')[0], 8000);
  ok(envio && /^[A-Za-z0-9_-]{8,40}$/.test(envio.cuerpo?.clave || ''), 'd) POST /api/conductor/gps/robo con una clave válida');
  ok(Math.abs((envio?.cuerpo?.pos?.lat ?? 0) - CENTRO.lat) < 1e-6 && Math.abs((envio?.cuerpo?.pos?.lng ?? 0) - CENTRO.lng) < 1e-6, 'd) con la posición del celular');
  ok((await hasta(async () => ((await tituloModal()) === 'Robo reportado' ? true : null), 8000)) === true, 'd) «Robo reportado»');
  ok(Boolean(await p.$('.a-modal-capa.a-abierto a[href="tel:123"]')), 'd) con «Llamar a la Línea 123» (tel:123)');
  await foto('d-reportado');
  await tocarModal('Entendido');
  ok(/robo reportado/.test(await p.textContent('[data-gps-estado]')), 'd) el estado dice «robo reportado»');

  // e) 429 y 500.
  srv.robo = 429;
  await p.click('[data-robo]');
  await tocarModal('Sí, reportar robo');
  ok((await hasta(async () => ((await tituloModal()) === 'Ya lo reportaste' ? true : null), 8000)) === true, 'e) 429 demasiados_reportes → «Ya lo reportaste»');
  await tocarModal('Cerrar');
  srv.robo = 500;
  await p.click('[data-robo]');
  await tocarModal('Sí, reportar robo');
  ok((await hasta(async () => ((await tituloModal()) === 'No se pudo enviar' ? true : null), 20000)) === true, 'e) error del servidor → «No se pudo enviar»');
  ok(Boolean(await p.$('.a-modal-capa.a-abierto a[href="tel:123"]')), 'e) también con la Línea 123');
  await foto('e-no-se-pudo');
  await tocarModal('Cerrar');
  ok(!(await p.$eval('[data-robo]', (n) => n.disabled)), 'e) el botón vuelve a quedar activo');
} catch (e) {
  ok(false, `la prueba se detuvo: ${e.message.split('\n')[0]}`);
  await foto('falla');
}
await b.close();
ok(errores.length === 0, `sin errores de página (${errores.slice(0, 5).join(' | ')})`);
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
