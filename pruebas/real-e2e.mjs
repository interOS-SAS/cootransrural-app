// Prueba de punta a punta del MODO REAL (?real=1): la app de TaxiCun conectada al
// servidor de TaxiCun (cuentas, tiempo real y viajes), con un pasajero y un
// conductor en dos celulares (dos contextos de Playwright, 390×844) en El Rosal.
//  a) conductor: correo + código → «Tus datos» → «Tu taxi» → «en revisión» →
//     se aprueba con bin/admin.js → «Revisar de nuevo» → entra, la píldora se
//     habilita tras la bienvenida y se conecta (turno);
//  b) pasajero: correo + código → completa nombre y celular → listo → pide un
//     taxi a Tierra Grata → «buscando»;
//  c) el conductor recibe la oferta y acepta → el pasajero ve nombre, móvil y
//     placa → el conductor tiene «Llamar» al celular del pasajero → «Llegué» con
//     el GPS en el punto → el pasajero ve «llegó» y el código → el conductor lo
//     escribe → en viaje → termina → el pasajero paga en efectivo → el conductor
//     ve el aviso y confirma «Recibí efectivo» → ambos califican y vuelven al inicio;
//  d) recargas a mitad de viaje (pasajero en «asignado», conductor en «en_origen»):
//     los dos retoman el viaje sin cancelarlo; el conductor corrige el valor al terminar;
//  c2) el conductor termina, cobra y califica SIN señal (lo que manda se pierde) y
//     recarga: la central aún tiene el viaje en curso y la app le repite el cierre (sin
//     «Retomamos tu servicio»); al pasajero le llegan el fin y el pago;
//  e) el pasajero pide, recarga mientras busca (sigue el mismo viaje) y cancela:
//     al conductor se le quita la oferta; e2) el conductor cancela un servicio
//     asignado: el pasajero vuelve a buscar con un id de viaje nuevo (con el servidor
//     0.2.2 esa búsqueda ya no le llega al mismo conductor: 15 min de exclusión);
//  f) «Eliminar mi cuenta» del pasajero (Mi cuenta): vuelve al ingreso y
//     GET /api/yo con el token viejo da 401; g) lo mismo para el conductor (menú).
// Con el servidor 0.2.2, además:
//  v) valor_invalido: el conductor termina con un valor absurdo → aviso, vuelve a «en
//     viaje» (el pasajero no ve el fin) y termina otra vez con el valor bueno;
//  t) tarifa_invalida: la solicitud sale con una tarifa imposible (se cambia en el
//     WebSocket, como desde la consola) → aviso y el viaje se cierra sin oferta;
//  x) cuenta_borrada: con un servicio asignado, el pasajero borra su cuenta (DELETE
//     /api/yo desde Node, como en otro teléfono) → el conductor queda libre con el aviso
//     y el pasajero vuelve al ingreso; entra de nuevo (cuenta nueva) para lo que sigue.
// Además: sin «MODO PRUEBA», sala, «Simular solicitud», QR de prueba ni taxis de
// ambiente; sin relés MQTT; sin errores de JavaScript.
//
// Necesita el servidor de TaxiCun en local y el proxy de mismo origen:
//   1) Base aparte (una vez):  su postgres -c "createdb -O taxicun_prueba taxicun_e2e"
//   2) Servidor (en su árbol, p. ej. /root/proyectos/taxicun-servidor; SERVIDOR_TAXICUN apunta al mismo):
//        DATABASE_URL=postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_e2e \
//        CLAVE_SERVIDOR=clave-local-de-pruebas-e2e-0123456789abcdef MODO_CORREO=prueba \
//        INDICE_EMPRESAS=/root/proyectos/cootransrural-app/empresas/indice.json CODIGOS_POR_IP_HORA=100000 \
//        CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790" \
//        HOST=127.0.0.1 PUERTO=3199 node src/index.js
//   3) Proxy:  node pruebas/servidor-local.mjs --puerto=8799 --api=http://127.0.0.1:3199
//   4) Prueba: node pruebas/real-e2e.mjs [http://localhost:8799/]
// Variables: DATABASE_URL y SERVIDOR_TAXICUN (para aprobar al conductor con bin/admin.js),
// CORREO_PASAJERO/CODIGO_PASAJERO, CORREO_CONDUCTOR/CODIGO_CONDUCTOR, CAPTURAS, CHROMIUM.
// Cada corrida borra antes las dos cuentas de prueba (y cancela el viaje que haya
// quedado de una corrida anterior), así que se puede repetir sin reiniciar nada.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8799/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/real-e2e').replace(/\/?$/, '/');
const SERVIDOR = process.env.SERVIDOR_TAXICUN || '/root/proyectos/taxicun-servidor';
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_e2e';
const PASAJERO = { correo: process.env.CORREO_PASAJERO || 'pasajero@prueba.taxicun.com', codigo: process.env.CODIGO_PASAJERO || '246810', nombre: 'Ana María Gómez', celular: '3001234567' };
const CONDUCTOR = { correo: process.env.CORREO_CONDUCTOR || 'conductor@prueba.taxicun.com', codigo: process.env.CODIGO_CONDUCTOR || '135790', nombre: 'Luis Alberto Rodríguez', celular: '3115550101', movil: '77', placa: 'tst 777' };
const EMPRESA = 'cootransrural';
mkdirSync(DIR, { recursive: true });

const FICHA = JSON.parse(readFileSync(new URL(`../empresas/${EMPRESA}/ficha.json`, import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const lugar = (nombre) => FICHA.LUGARES.find((l) => l.nombre === nombre);
const DESTINO = lugar('Tierra Grata');
const SEGUNDO = lugar('Puesto de Salud');
// El pasajero en el parque; el conductor a ~300 m (hacia el norte).
const GPS_PASAJERO = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 };
const GPS_CONDUCTOR = { latitude: CENTRO.lat + 0.0027, longitude: CENTRO.lng, accuracy: 10 };

// Versión del servidor (de /api/salud): lo del 0.2.2 solo se prueba desde esa versión.
let VERSION = '';
const desde = (v) => {
  const a = VERSION.split('.').map(Number);
  const b2 = v.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b2[i] || 0)) return (a[i] || 0) > (b2[i] || 0);
  return true;
};
// Un valor que la central no acepta (más de 3 veces el máximo de la tarifa) y que el
// diálogo del conductor sí deja escribir (hasta 2.000.000).
const VALOR_ABSURDO = 1999000;

const resultados = [];
const errores = [];
// Errores que la prueba provoca a propósito (por ejemplo, un código errado): se cuentan
// antes de provocarlos y no se reportan como fallas de la página.
const esperados = { 'auth/entrar 400': 0 };
function ok(c, m) {
  resultados.push({ ok: Boolean(c), m });
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (!c) process.exitCode = 1;
}
// Paso del que depende lo que sigue: si falla, la corrida se detiene (sin cadena de esperas).
class Detener extends Error {}
async function debe(promesa, m) {
  let motivo = '';
  const r = await Promise.resolve(promesa).then((x) => x !== false, (e) => { motivo = e?.message?.split('\n')[0] || String(e); return false; });
  ok(r, `${m}${r || !motivo ? '' : ` (${motivo})`}`);
  if (!r) throw new Detener(m);
}
const intento = (promesa) => Promise.resolve(promesa).then(() => true, () => false);

const b = await chromium.launch({ executablePath: EXE });
const sockets = []; // WebSocket que abre la app (solo /api/bus en modo real)
const peticiones = []; // a dónde fue cada petición (para ver que no hay relés MQTT)

async function contexto(geo) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-CO', timezoneId: 'America/Bogota',
    geolocation: geo, permissions: ['geolocation'],
  });
  // Cada aviso que se ve en pantalla (para comprobar los textos).
  await ctx.addInitScript(() => {
    window.__avisos = [];
    new MutationObserver(() => {
      document.querySelectorAll('.a-toast:not([data-visto])').forEach((n) => {
        n.dataset.visto = '1';
        window.__avisos.push(n.innerText.replace(/\s+/g, ' ').trim());
      });
    }).observe(document, { childList: true, subtree: true });
  });
  return ctx;
}
function vigilar(p, nombre) {
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (esperados['auth/entrar 400'] > 0 && /status of 400/.test(m.text()) && url.endsWith('/api/auth/entrar')) {
      esperados['auth/entrar 400'] -= 1;
      return;
    }
    // Fallas de recursos de afuera (teselas del mapa, rutas, direcciones) no son de la app.
    if (/Failed to load resource|net::ERR_|status of \d{3}|CORS policy/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errores.push(`[${nombre}] ${m.text()}${url ? ` (${url})` : ''}`);
  });
  p.on('response', (r) => {
    if (!r.url().startsWith(BASE)) return;
    if (r.status() === 404) errores.push(`[${nombre}] 404 ${r.url()}`);
    if (r.status() >= 500) errores.push(`[${nombre}] ${r.status()} ${r.url()}`);
  });
  p.on('request', (r) => peticiones.push(r.url()));
  p.on('websocket', (ws) => sockets.push(`[${nombre}] ${ws.url()}`));
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') || '', sel);
const avisosVistos = (p) => p.evaluate(() => window.__avisos || []);
const soloLetras = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Escribe un código en casillas (el primer input recibe el foco; ui.js pasa al siguiente).
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 40 });
}

// Pega un texto (como el correo con el código) en la primera casilla, con un evento
// «paste» de verdad (con clipboardData), sin escribir dígito por dígito.
async function pegarCodigo(p, selector, textoPegado) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.evaluate(({ sel, t }) => {
    const dt = new DataTransfer();
    dt.setData('text/plain', t);
    document.querySelector(`${sel} input`).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { sel: selector, t: textoPegado });
}

// Botón de un diálogo (modal) por su texto.
async function tocarModal(p, textoBoton) {
  const sel = `.a-modal button:has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(250);
  await p.click(sel);
}

// Nada de la demo en modo real.
async function sinDemo(p, donde) {
  const t = await texto(p);
  ok(!/MODO PRUEBA/i.test(t), `${donde}: no dice «MODO PRUEBA»`);
  ok(!/\bsala\b/i.test(t), `${donde}: no muestra la sala`);
  ok(!/Simular solicitud|QR \(prueba\)|PAGO DE PRUEBA|Pista de la demo/i.test(t), `${donde}: sin «Simular solicitud», QR de prueba ni pistas de la demo`);
}

/* ------------------------------------------------------------------ */
/* 0) Preparación: el servidor responde y las cuentas de prueba están  */
/*    limpias (se borran y se cancela un viaje que haya quedado).      */
/* ------------------------------------------------------------------ */
async function preparar() {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}empresas/indice.json`);
  const r = await p.evaluate(async ({ cuentas, empresa }) => {
    const api = async (metodo, ruta, cuerpo, token) => {
      const x = await fetch(`/api/${ruta}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      return { estado: x.status, cuerpo: await x.json().catch(() => null) };
    };
    const salud = await api('GET', 'salud');
    const salida = { salud, cuentas: [] };
    for (const { correo, codigo } of cuentas) {
      await api('POST', 'auth/codigo', { correo });
      const e = await api('POST', 'auth/entrar', { correo, codigo });
      if (e.estado !== 200) {
        salida.cuentas.push({ correo, error: e.cuerpo?.error || e.estado });
        continue;
      }
      const token = e.cuerpo.token;
      const roles = e.cuerpo.conductor?.estado === 'aprobado' ? ['pasajero', 'conductor'] : ['pasajero'];
      let cancelados = 0;
      for (const rol of roles) {
        cancelados += await new Promise((listo) => {
          const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/bus`);
          let n = 0;
          let hecho = false;
          const fin = () => {
            if (hecho) return;
            hecho = true;
            try { ws.close(); } catch { /* ya cerrado */ }
            listo(n);
          };
          const reloj = setTimeout(fin, 5000);
          ws.onopen = () => ws.send(JSON.stringify({ tipo: 'hola', datos: { token, rol, empresa } }));
          ws.onmessage = (m) => {
            const d = JSON.parse(m.data);
            if (d.tipo !== 'viaje_actual') return;
            if (d.datos?.viajeId) {
              ws.send(JSON.stringify({ uid: `mlimpia${Date.now()}`, tipo: 'cancelacion', datos: { viajeId: d.datos.viajeId, motivo: 'limpieza de la prueba' } }));
              n += 1;
            }
            clearTimeout(reloj);
            setTimeout(fin, 500);
          };
          ws.onclose = () => { clearTimeout(reloj); fin(); };
        });
      }
      const borrar = await api('DELETE', 'yo', null, token);
      salida.cuentas.push({ correo, borrada: borrar.estado === 200, cancelados });
    }
    return salida;
  }, { cuentas: [PASAJERO, CONDUCTOR].map(({ correo, codigo }) => ({ correo, codigo })), empresa: EMPRESA });
  await ctx.close();
  VERSION = String(r.salud.cuerpo?.version || '');
  // 0.3.x (app 1.2: push y Face ID) es retrocompatible: sin teléfonos registrados se comporta como la 0.2.
  await debe(r.salud.estado === 200 && /^0\.[2345]\./.test(r.salud.cuerpo?.version || ''), `el servidor local responde por el proxy (${BASE}api/salud → ${r.salud.cuerpo?.version || r.salud.estado})`);
  for (const c of r.cuentas) {
    await debe(c.borrada, `cuenta de prueba ${c.correo} limpia${c.cancelados ? ` (se canceló ${c.cancelados} viaje que quedó de antes)` : ''}${c.error ? ` (error ${c.error}: ¿está en CUENTAS_PRUEBA?)` : ''}`);
  }
}

function aprobarConductor() {
  return execFileSync('node', ['bin/admin.js', 'aprobar', CONDUCTOR.correo, '--motivo', 'Documentos revisados (prueba de punta a punta)'], {
    cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000,
  }).trim();
}

let ctxP;
let ctxC;
let pp; // página del pasajero
let pc; // página del conductor

/* ------------------------------------------------------------------ */
/* a) Conductor: registro, revisión, aprobación y turno                 */
/* ------------------------------------------------------------------ */
async function registrarConductor() {
  ctxC = await contexto(GPS_CONDUCTOR);
  pc = await ctxC.newPage();
  vigilar(pc, 'conductor');
  await pc.goto(`${BASE}taxicun/conductor/?real=1`);
  await debe(pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 }), 'conductor: abre el ingreso real con correo');
  ok(await pc.evaluate(() => document.documentElement.dataset.modo === 'real'), 'conductor: html[data-modo="real"]');
  ok(await pc.evaluate(() => window.CT_EMPRESA === 'cootransrural' || /cootransrural/.test(location.search) || document.body.innerText.includes('Cootransrural')), 'conductor: abre Cootransrural (la única cooperativa real)');
  const ingreso = await texto(pc, '.a-ingreso-real');
  ok(!/Móvil 023|PIN 1234|PIN/i.test(ingreso), 'conductor: el ingreso no trae la pista de la demo (móvil y PIN)');
  await sinDemo(pc, 'conductor (ingreso)');
  await foto(pc, 'c01-ingreso');
  await pc.fill('.a-ingreso-real input[name=correo]', CONDUCTOR.correo);
  await pc.click('.a-ingreso-real button[type=submit]');
  await debe(pc.waitForSelector('.a-ingreso-real .a-casillas-6 input', { timeout: 15000 }), 'conductor: pide el código de 6 dígitos (seis casillas)');
  ok((await pc.$$('.a-ingreso-real .a-casillas-6 input')).length === 6, 'conductor: son 6 casillas');
  await foto(pc, 'c02-codigo');
  // El código se pega desde el correo (con texto alrededor): llena las 6 casillas y entra.
  await pegarCodigo(pc, '.a-ingreso-real .a-casillas-6', `Tu código de TaxiCun es ${CONDUCTOR.codigo}`);

  await debe(pc.waitForSelector('.a-ingreso-real input[name=nombre]', { timeout: 15000 }), 'conductor: pega el código del correo (con texto alrededor) → entra → «Tus datos»');
  ok(await pc.isVisible('.a-ingreso-real [data-eliminar]'), 'conductor: «Eliminar mi cuenta» también en «Tus datos»');
  await foto(pc, 'c03-tus-datos');
  await pc.fill('.a-ingreso-real input[name=nombre]', CONDUCTOR.nombre);
  await pc.fill('.a-ingreso-real input[name=celular]', CONDUCTOR.celular);
  await pc.click('.a-ingreso-real button[type=submit]');

  await debe(pc.waitForSelector('.a-ingreso-real input[name=placa]', { timeout: 15000 }), 'conductor: → «Tu taxi»');
  ok(await pc.isVisible('.a-ingreso-real [data-eliminar]'), 'conductor: «Eliminar mi cuenta» también en «Tu taxi»');
  await pc.fill('.a-ingreso-real input[name=movil]', CONDUCTOR.movil);
  await pc.fill('.a-ingreso-real input[name=placa]', CONDUCTOR.placa);
  ok((await pc.inputValue('.a-ingreso-real input[name=placa]')) === 'TST777', 'conductor: la placa queda en mayúsculas y sin espacios (TST777)');
  await foto(pc, 'c04-tu-taxi');
  await pc.click('.a-ingreso-real button[type=submit]');

  await debe(pc.waitForSelector('.a-ingreso-real .a-revision-pendiente', { timeout: 15000 }), 'conductor: «Tu registro está en revisión»');
  const rev = await texto(pc, '.a-ingreso-real');
  ok(rev.includes('Tu registro está en revisión') && rev.includes('Móvil 077') && soloLetras(rev).includes('TST777'), 'conductor: la revisión muestra el móvil 077 (con ceros) y la placa TST777');
  ok(await pc.isVisible('.a-ingreso-real [data-eliminar]'), 'conductor: «Eliminar mi cuenta» también en la pantalla de revisión');
  await foto(pc, 'c05-revision');
  // Revisar antes de aprobar: sigue en revisión.
  await pc.click('.a-ingreso-real [data-revisar]');
  ok(await pc.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('sigue en revisión')), null, { timeout: 8000 }).then(() => true, () => false), 'conductor: «Revisar de nuevo» sin aprobar → «Tu registro sigue en revisión»');

  let salida = '';
  try { salida = aprobarConductor(); } catch (e) { salida = e.message; }
  await debe(/aprobado/.test(salida), `se aprueba con bin/admin.js (${salida.split('\n')[0]})`);
  await pc.waitForTimeout(1200);
  await pc.click('.a-ingreso-real [data-revisar]');
  await debe(vista(pc, 'libre', 20000).then(() => pc.waitForSelector('.a-ingreso-real', { state: 'detached', timeout: 10000 })), 'conductor: «Revisar de nuevo» ya aprobado → entra a la app');
  await debe(pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 15000 }), 'conductor: la píldora de turno se habilita tras la bienvenida de la central');
  ok(await pc.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('¡Buen turno, Luis!')), null, { timeout: 8000 }).then(() => true, () => false), 'conductor: saluda «¡Buen turno, Luis!»');
  ok((await texto(pc, '[data-movil]')).includes('077') || (await texto(pc, '.a-tarjeta-taxi')).includes('077'), 'conductor: la barra o la tarjeta muestran el móvil 077');
  ok(soloLetras(await texto(pc, '.a-tarjeta-taxi')).includes('TST777'), 'conductor: la tarjeta del taxi muestra la placa de la cuenta');
  ok(!(await pc.isVisible('[data-simular]')), 'conductor: sin botón «Simular solicitud» a la vista');
  ok(!(await pc.$('[data-documentos]')), 'conductor: sin «Documentos» de ejemplo');
  await sinDemo(pc, 'conductor (inicio)');
  await foto(pc, 'c06-libre');
  await pc.click('[data-conectar]');
  await debe(pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'conductor: se conecta (turno abierto)');
  ok((await texto(pc, '[data-conexion]')).includes('En línea'), 'conductor: el chip dice «En línea»');
  await foto(pc, 'c07-conectado');

  // Menú y Ajustes del conductor sin piezas de la demo.
  await pc.click('[data-menu]');
  await pc.waitForSelector('.a-menu-item', { timeout: 5000 });
  await pc.waitForTimeout(500);
  const menu = await texto(pc, '.a-menu-capa') || await texto(pc);
  ok(!/Simular|Documentos|MODO PRUEBA|\bsala\b/i.test(menu), 'conductor: el menú no trae «Simular», «Documentos», «MODO PRUEBA» ni sala');
  ok(/Eliminar mi cuenta/.test(menu), 'conductor: el menú trae «Eliminar mi cuenta»');
  await foto(pc, 'c08-menu');
  await pc.click('.a-menu-item:has-text("Ajustes")');
  await pc.waitForSelector('.a-panel.a-abierto', { timeout: 5000 });
  await pc.waitForTimeout(600);
  const ajustes = await texto(pc, '.a-panel.a-abierto');
  ok(!/GPS simulado|MODO PRUEBA|\bsala\b/i.test(ajustes), 'conductor: Ajustes sin GPS simulado, «MODO PRUEBA» ni sala');
  ok(ajustes.includes(CONDUCTOR.correo), 'conductor: Ajustes muestra la cuenta (correo)');
  ok(Boolean(await pc.$('.a-panel.a-abierto [data-privacidad]')) && !/Instalar|Cambiar de municipio/.test(ajustes), 'conductor: Ajustes trae «Política de privacidad», sin «Instalar» ni «Cambiar de municipio»');
  await foto(pc, 'c09-ajustes');
  await pc.click('.a-panel.a-abierto [data-cerrar]');
  await pc.waitForTimeout(400);
}

/* ------------------------------------------------------------------ */
/* b) Pasajero: ingreso, perfil y pedido                                */
/* ------------------------------------------------------------------ */
async function registrarPasajero() {
  ctxP = await contexto(GPS_PASAJERO);
  pp = await ctxP.newPage();
  vigilar(pp, 'pasajero');
  await pp.goto(`${BASE}taxicun/?real=1`);
  await debe(pp.waitForSelector('.a-bienvenida', { timeout: 30000 }), 'pasajero: abre la bienvenida (sin sesión)');
  ok(await pp.evaluate(() => document.documentElement.dataset.modo === 'real'), 'pasajero: html[data-modo="real"]');
  await pp.waitForTimeout(800);
  const diapos = await texto(pp, '.a-bienvenida');
  ok(!/QR de prueba|programando/i.test(diapos), 'pasajero: la bienvenida no ofrece QR de prueba ni programar');
  const diaposTodo = await pp.evaluate(() => document.querySelector('.a-bienvenida')?.textContent || '');
  ok(!/PAGO DE PRUEBA|VIAJE 11|50\s?%|10\s?%/.test(diaposTodo), 'pasajero: la bienvenida (también sus dibujos) no trae «PAGO DE PRUEBA» ni descuentos del 50 % o 10 %');
  await foto(pp, 'p01-bienvenida');
  await pp.click('.a-bienvenida [data-saltar]');
  await debe(pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 }), 'pasajero: ingreso con correo');
  await pp.fill('.a-bienvenida input[name=correo]', PASAJERO.correo);
  await pp.click('.a-bienvenida .a-check');
  await foto(pp, 'p02-correo');
  await pp.click('.a-bienvenida [data-enviar]');
  await debe(pp.waitForSelector('.a-bienvenida .a-casillas-6 input', { timeout: 15000 }), 'pasajero: pide el código de 6 dígitos');
  ok(!(await texto(pp, '.a-bienvenida')).includes('SMS'), 'pasajero: no habla de SMS simulado');
  await foto(pp, 'p03-codigo');
  // El teclado autocompleta un código entero en la primera casilla (one-time-code): se
  // reparte en las 6 y se verifica solo. Uno errado a propósito, y después el bueno.
  await pp.waitForTimeout(400);
  await pp.click('.a-bienvenida .a-casillas-6 input >> nth=0');
  esperados['auth/entrar 400'] += 1;
  await pp.keyboard.insertText('000000');
  const repartido = await pp.$$eval('.a-bienvenida .a-casillas-6 input', (ns) => ns.map((n) => n.value).join(''));
  ok(repartido === '000000', `pasajero: un código autocompletado entero llena las 6 casillas («${repartido}»)`);
  ok(await intento(pp.waitForFunction(() => (document.querySelector('.a-bienvenida [data-error]')?.textContent || '').trim().length > 0, null, { timeout: 10000 })), 'pasajero: ese código se verifica solo (errado → aviso)');
  await pp.waitForTimeout(1200);
  await escribirCodigo(pp, '.a-bienvenida .a-casillas-6', PASAJERO.codigo);
  await debe(pp.waitForSelector('.a-bienvenida input[name=nombre]', { timeout: 15000 }), 'pasajero: cuenta nueva → «Completa tus datos»');
  await pp.fill('.a-bienvenida input[name=nombre]', PASAJERO.nombre);
  await pp.fill('.a-bienvenida input[name=celular]', PASAJERO.celular);
  await foto(pp, 'p04-perfil');
  await pp.click('.a-bienvenida [data-guardar]');
  await debe(pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 }), 'pasajero: «¡Listo!»');
  ok((await texto(pp, '.a-bienvenida')).includes('¡Listo, Ana!'), 'pasajero: «¡Listo, Ana!»');
  await foto(pp, 'p05-listo');
  await pp.click('.a-bienvenida [data-empezar]');
  await debe(vista(pp, 'inicio', 20000), 'pasajero: llega al inicio');
  await debe(pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }), 'pasajero: el chip de conexión dice «En línea» (bienvenida del servidor)');
  ok(await pp.evaluate(() => Boolean(localStorage.getItem('taxicun.token'))), 'pasajero: el token queda en localStorage «taxicun.token»');
  ok((await texto(pp, '[data-nombre]')).trim() === 'Ana', 'pasajero: la barra saluda a Ana');
  // Solo el taxi real (el conductor conectado): sin taxis de ambiente.
  await pp.waitForTimeout(3000);
  const taxis = await pp.$$eval('.ct-taxi-marcador', (ns) => ns.length);
  ok(taxis <= 1, `pasajero: en el mapa solo el taxi real conectado, sin taxis de ambiente (${taxis})`);
  ok(!(await pp.$('[data-programar]')), 'pasajero: el inicio no ofrece programar');
  await sinDemo(pp, 'pasajero (inicio)');
  await foto(pp, 'p06-inicio');

  // Menú y Ajustes del pasajero sin piezas de la demo.
  await pp.click('[data-menu]');
  await pp.waitForSelector('.a-menu-item', { timeout: 5000 });
  await pp.waitForTimeout(500);
  const menu = await texto(pp, '.a-menu-capa') || await texto(pp);
  ok(/Mi cuenta/.test(menu) && !/Programados|MODO PRUEBA|\bsala\b/i.test(menu), 'pasajero: el menú trae «Mi cuenta» y no «Programados», «MODO PRUEBA» ni sala');
  ok(menu.includes(PASAJERO.correo), 'pasajero: el menú muestra el correo de la cuenta');
  ok(!/Promociones|50 %|Cambiar de municipio|instalar/i.test(menu), 'pasajero: el menú no trae Promociones (tarjeta del 50 %), «Cambiar de municipio» (una sola cooperativa) ni «instalar»');
  await foto(pp, 'p07-menu');
  await pp.click('.a-menu-item:has-text("Ajustes")');
  await pp.waitForSelector('.a-panel.a-abierto', { timeout: 5000 });
  await pp.waitForTimeout(600);
  const ajustes = await texto(pp, '.a-panel.a-abierto');
  ok(!/MODO PRUEBA|\bsala\b/i.test(ajustes) && Boolean(await pp.$('.a-panel.a-abierto [data-cuenta]')), 'pasajero: Ajustes con «Tu cuenta», sin «MODO PRUEBA» ni sala');
  ok(Boolean(await pp.$('.a-panel.a-abierto [data-privacidad]')) && !/Instalar|Tu municipio/.test(ajustes), 'pasajero: Ajustes trae «Política de privacidad», sin «Instalar» (abriría la demo) ni «Tu municipio»');
  await pp.click('.a-panel.a-abierto [data-cerrar]');
  await pp.waitForTimeout(400);
}

// Pide un taxi al lugar indicado (buscador → confirmar → Pedir taxi).
async function pedirTaxi(destino, foto0 = '') {
  await pp.click('[data-buscar]');
  await pp.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await pp.fill('[data-q]', destino.nombre);
  const fila = `.a-buscador .a-fila:has-text("${destino.nombre}")`;
  await pp.waitForSelector(fila, { timeout: 10000 });
  await pp.waitForTimeout(600);
  await pp.click(fila);
  await vista(pp, 'confirmar', 10000);
  await pp.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await pp.waitForTimeout(800);
  if (foto0) await foto(pp, foto0);
  return true;
}

/* ------------------------------------------------------------------ */
/* c + d) Viaje completo, con recargas a mitad de camino                */
/* ------------------------------------------------------------------ */
async function viajeCompleto() {
  await debe(pedirTaxi(DESTINO, 'p08-confirmar'), `pasajero: elige el destino «${DESTINO.nombre}» y ve el resumen`);
  ok(!(await pp.$('[data-programar]')) && !(await pp.$('[data-metodo="qr"]')), 'pasajero: confirmar sin programar ni pago con QR');
  ok((await texto(pp, '.a-hoja')).includes('efectivo'), 'pasajero: dice que se paga en efectivo');
  ok(!/50 %|tarjeta/i.test(await texto(pp, '.a-hoja')), 'pasajero: confirmar sin la tarjeta de viajes del 50 %');
  await pp.fill('[data-nota]', 'Estoy en la portería').catch(() => {});
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: «Buscando tu taxi»');
  await foto(pp, 'p09-buscando');

  // El conductor recibe la oferta.
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega la solicitud');
  const oferta = await texto(pc, '.a-solicitud');
  ok(oferta.includes('Ana'), 'conductor: la oferta trae el primer nombre del pasajero (Ana)');
  ok(!oferta.includes('Gómez') && !oferta.includes(PASAJERO.celular), 'conductor: la oferta no trae el apellido ni el celular');
  ok(oferta.includes(DESTINO.nombre), `conductor: la oferta trae el destino (${DESTINO.nombre})`);
  ok(oferta.includes('Estoy en la portería'), 'conductor: la oferta trae la nota del pasajero');
  await foto(pc, 'c10-solicitud');
  await pc.click('.a-solicitud [data-aceptar]');
  await debe(vista(pc, 'hacia_origen', 20000), 'conductor: acepta → «Recoge a Ana»');
  await foto(pc, 'c11-hacia-origen');

  // El pasajero ve al conductor asignado.
  await debe(vista(pp, 'asignado', 15000), 'pasajero: conductor asignado');
  await pp.waitForTimeout(800);
  const tarjeta = await texto(pp, '.a-tarjeta-conductor');
  ok(tarjeta.includes('Luis Alberto Rodríguez'), 'pasajero: ve el nombre del conductor');
  ok((await texto(pp, '.a-tarjeta-conductor .a-movil')).includes('077'), 'pasajero: ve el móvil 077');
  ok(soloLetras(tarjeta).includes('TST777'), 'pasajero: ve la placa TST777');
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  ok(/^\d{4}$/.test(codigo || ''), `pasajero: ve el código de abordaje (${codigo})`);
  const telConductor = await pp.getAttribute('.a-acciones a[href^="tel:"]', 'href').catch(() => null);
  ok(telConductor === `tel:${CONDUCTOR.celular}`, `pasajero: «Llamar» marca al celular del conductor (${telConductor})`);
  await foto(pp, 'p10-asignado');

  // El conductor puede llamar al pasajero (celular que llega con la asignación).
  const telPasajero = await pc.getAttribute('.a-nav-contacto a[href^="tel:"]', 'href').catch(() => null);
  ok(telPasajero === `tel:${PASAJERO.celular}`, `conductor: «Llamar» marca al celular del pasajero (${telPasajero})`);

  // d) El pasajero recarga en «asignado»: retoma el viaje sin cancelarlo.
  await pp.reload();
  await debe(vista(pp, 'asignado', 30000), 'pasajero: tras recargar en «asignado» retoma el viaje');
  await pp.waitForTimeout(1200);
  const codigo2 = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  ok(codigo2 === codigo, `pasajero: tras recargar conserva el código de abordaje (${codigo2})`);
  ok((await texto(pp, '.a-tarjeta-conductor')).includes('Luis Alberto Rodríguez'), 'pasajero: tras recargar sigue viendo al conductor');
  ok(await pc.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'hacia_origen'), 'conductor: el viaje sigue (la recarga del pasajero no lo canceló)');
  await foto(pp, 'p11-asignado-recarga');

  // El conductor llega al punto de recogida (GPS en el origen del viaje).
  const origen = await pc.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje?.origen || null);
  ok(origen && Number.isFinite(origen.lat), 'conductor: el viaje queda guardado con el punto de recogida');
  await ctxC.setGeolocation({ latitude: origen?.lat ?? CENTRO.lat, longitude: origen?.lng ?? CENTRO.lng, accuracy: 8 });
  ok(await intento(pc.waitForSelector('[data-llegue].a-resaltar', { timeout: 20000 })), 'conductor: con el GPS en el punto se resalta «Llegué»');
  await foto(pc, 'c12-en-el-punto');
  await pc.click('[data-llegue]');
  await debe(vista(pc, 'en_origen', 10000), 'conductor: «Llegué» → pide el código de abordaje');

  await debe(vista(pp, 'llego', 15000), 'pasajero: «Tu taxi está en la puerta»');
  await pp.waitForTimeout(800);
  ok(await pp.isVisible('[data-banner-puerta]') && (await texto(pp, '[data-banner-puerta]')).includes('¡Tu taxi está en la puerta!'), 'pasajero: aviso grande «¡Tu taxi está en la puerta!»');
  const codigo3 = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  ok(/^\d{4}$/.test(codigo3 || '') && codigo3 === codigo, `pasajero: muestra el código de 4 dígitos (${codigo3})`);
  await foto(pp, 'p12-llego');

  // d) El conductor recarga en «en_origen»: retoma el viaje sin cancelarlo.
  await pc.reload();
  await debe(vista(pc, 'en_origen', 30000), 'conductor: tras recargar en «en_origen» retoma el viaje');
  await pc.waitForTimeout(1500);
  ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'llego'), 'pasajero: el viaje sigue (la recarga del conductor no lo canceló)');
  const telPasajero2 = await pc.getAttribute('.a-nav-contacto a[href^="tel:"]', 'href').catch(() => null);
  ok(telPasajero2 === `tel:${PASAJERO.celular}`, `conductor: tras recargar conserva el celular del pasajero (${telPasajero2})`);
  await foto(pc, 'c13-codigo-tras-recarga');

  // Código errado y luego el correcto.
  await escribirCodigo(pc, '.a-codigo-c .a-casillas', codigo === '0000' ? '1111' : '0000');
  ok(await intento(pc.waitForFunction(() => document.querySelector('.a-codigo-c [data-error]')?.textContent.includes('no coincide'), null, { timeout: 5000 })), 'conductor: un código errado muestra «no coincide»');
  await pc.waitForTimeout(1000);
  await escribirCodigo(pc, '.a-codigo-c .a-casillas', codigo || '');
  await debe(vista(pc, 'en_viaje', 10000), `conductor: con el código del pasajero (${codigo}) arranca el viaje`);
  await debe(vista(pp, 'en_viaje', 15000), 'pasajero: «Viaje en curso»');
  await pp.waitForTimeout(2000); // el mapa se mueve al destino
  await foto(pp, 'p13-en-viaje');

  // Llega al destino y termina.
  const destino = await pc.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje?.destino || null);
  await ctxC.setGeolocation({ latitude: destino?.lat ?? DESTINO.lat, longitude: destino?.lng ?? DESTINO.lng, accuracy: 8 });
  ok(await intento(pc.waitForSelector('[data-terminar].a-resaltar', { timeout: 20000 })), 'conductor: con el GPS en el destino se resalta «Terminar viaje»');
  await foto(pc, 'c14-en-destino');
  await pc.click('[data-terminar]');
  // Antes de cobrar confirma o corrige el valor (la tarifa la estimó el teléfono del pasajero).
  await debe(pc.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 }), 'conductor: «Terminar viaje» pide confirmar el valor del viaje');
  const estimado = Number((await pc.inputValue('.a-modal input[name=valor]')).replace(/\D/g, ''));
  ok(estimado > 0, `conductor: el valor viene con la tarifa estimada (${estimado})`);
  if (desde('0.2.2')) {
    // v) Un valor absurdo: la central no cierra el viaje (valor_invalido) y el conductor lo corrige.
    await pc.fill('.a-modal input[name=valor]', String(VALOR_ABSURDO));
    await foto(pc, 'c14a-valor-absurdo');
    await tocarModal(pc, 'Terminar y cobrar');
    await debe(pc.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('Revisa el valor del viaje')), null, { timeout: 10000 }), `conductor: con un valor absurdo (${VALOR_ABSURDO}) la central responde valor_invalido → «Revisa el valor del viaje»`);
    const aviso = (await avisosVistos(pc)).find((a) => a.includes('Revisa el valor del viaje')) || '';
    ok(aviso.includes('Ese valor no es válido para este viaje'), `conductor: el aviso explica qué pasó («${aviso}»)`);
    await debe(vista(pc, 'en_viaje', 10000), 'conductor: vuelve a «en viaje» (la central no cerró el viaje)');
    await pc.waitForTimeout(400);
    ok(await pc.evaluate(() => [...document.querySelectorAll('.a-toast:not(.a-sale)')].some((t) => t.innerText.includes('Revisa el valor del viaje'))), 'conductor: el aviso sigue a la vista en «en viaje» (no se borra al cambiar de pantalla)');
    ok(!(await pc.$('[data-efectivo]')) && !(await pc.$('.a-estrellas')), 'conductor: mientras tanto, sin «Recibí efectivo» ni calificar');
    ok(await intento(pc.waitForSelector('[data-terminar].a-resaltar', { timeout: 5000 })), 'conductor: sigue en el destino: «Terminar viaje» resaltado otra vez');
    await pp.waitForTimeout(1000);
    ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'en_viaje'), 'pasajero: sigue «en viaje» (no le llegó el fin con el valor absurdo)');
    await foto(pc, 'c14c-valor-rechazado');
    await pc.click('[data-terminar]');
    await debe(pc.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 }), 'conductor: puede volver a «Terminar viaje» con el diálogo del valor');
  }
  const corregido = estimado + 2000;
  await pc.fill('.a-modal input[name=valor]', String(corregido));
  await foto(pc, 'c14b-valor');
  await tocarModal(pc, 'Terminar y cobrar');
  await debe(vista(pc, 'cobrando', 10000), 'conductor: termina → cobro');
  await pc.waitForTimeout(600);
  ok(!(await pc.$('[data-qr-cobro]')) && (await texto(pc, '.a-hoja')).includes('Pago en efectivo'), 'conductor: cobro solo en efectivo, sin QR de prueba');
  const valor = await texto(pc, '.a-cobro-valor');
  ok(Number(valor.replace(/\D/g, '')) === corregido, `conductor: cobra el valor corregido (${valor.trim()} = ${corregido})`);
  await foto(pc, 'c15-cobro');

  await debe(vista(pp, 'pagar', 15000), 'pasajero: llegó al destino → pagar');
  await pp.waitForTimeout(600);
  ok(!(await pp.$('[data-escanear]')) && !(await pp.$('[data-simular]')) && !(await pp.$('details[data-otro]')), 'pasajero: pagar sin QR, billeteras ni «otro celular»');
  ok((await texto(pp, '[data-total-pagar]')).replace(/\s/g, '') === valor.replace(/\s/g, ''), `pasajero: el total coincide con el del conductor (${await texto(pp, '[data-total-pagar]')})`);
  await sinDemo(pp, 'pasajero (pagar)');
  await foto(pp, 'p14-pagar');
  await pp.click('[data-efectivo]');
  await tocarModal(pp, 'Sí, ya pagué');
  await debe(vista(pp, 'calificar', 10000), 'pasajero: dice que pagó en efectivo → calificar');

  await debe(pc.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 10000 }), 'conductor: ve «El pasajero dice que ya te pagó»');
  await foto(pc, 'c16-pago-anunciado');
  await pc.click('[data-efectivo]');
  await tocarModal(pc, 'Sí, recibí el pago');
  await debe(vista(pc, 'calificar', 10000), 'conductor: confirma «Recibí efectivo» → calificar');
  ok((await texto(pc, '.a-pago-recibido')).includes('efectivo'), 'conductor: «Pago en efectivo registrado»');

  // Ambos califican.
  await pp.click('.a-estrellas [data-n="5"]');
  await pp.click('[data-etiqueta="Amable"]').catch(() => {});
  await foto(pp, 'p15-calificar');
  await pp.click('[data-enviar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: califica y vuelve al inicio');
  await pc.click('.a-estrellas [data-n="5"]');
  await foto(pc, 'c17-calificar');
  await pc.click('[data-enviar]');
  await debe(vista(pc, 'libre', 10000), 'conductor: califica y vuelve al inicio');
  await pc.waitForTimeout(1500);
  ok((await texto(pc, '[data-viajes]')).trim() === '1', 'conductor: el resumen del día suma el viaje');
  // La calificación llega a la otra parte: al conductor solo el promedio (no las estrellas del pasajero).
  const avisosC = await avisosVistos(pc);
  const promedio = avisosC.find((a) => a.includes('Tu calificación se actualizó'));
  ok(Boolean(promedio) && /Promedio: \d,\d/.test(promedio), `conductor: la calificación del pasajero llega como promedio nuevo («${promedio || 'no llegó'}»)`);
  ok(!avisosC.some((a) => /calific\w* con|★★/.test(a)), 'conductor: no ve las estrellas que le dio el pasajero (solo el promedio)');
  ok(!(await pp.evaluate(() => localStorage.getItem('tc.real.viaje.pasajero'))), 'pasajero: el viaje terminado ya no queda guardado');
  await foto(pc, 'c18-fin');
  await foto(pp, 'p16-fin');
}

/* ------------------------------------------------------------------ */
/* c2) El conductor cierra el viaje sin señal y recarga                 */
/* ------------------------------------------------------------------ */
// Lo que manda el conductor desde «en viaje» se pierde (conexión medio muerta: el
// WebSocket parece abierto pero nada llega) y después recarga (la cola en memoria se
// pierde). La central sigue con el viaje en curso y su viaje_actual lo trae: la app NO lo
// retoma ni lo cancela, le repite el fin, el pago y la calificación.
async function finSinSenal() {
  await ctxC.setGeolocation(GPS_CONDUCTOR);
  await pp.waitForTimeout(1200);
  await debe(pedirTaxi(SEGUNDO), `pasajero: pide otro taxi (${SEGUNDO.nombre}) [cierre sin señal]`);
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: buscando [cierre sin señal]');
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega la solicitud [cierre sin señal]');
  await pc.click('.a-solicitud [data-aceptar]');
  await debe(vista(pc, 'hacia_origen', 20000), 'conductor: la acepta [cierre sin señal]');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: conductor asignado [cierre sin señal]');
  await pp.waitForTimeout(800);
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  const v = await pc.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje || null);
  await ctxC.setGeolocation({ latitude: v?.origen?.lat ?? CENTRO.lat, longitude: v?.origen?.lng ?? CENTRO.lng, accuracy: 8 });
  await intento(pc.waitForSelector('[data-llegue].a-resaltar', { timeout: 20000 }));
  await pc.click('[data-llegue]');
  await debe(vista(pc, 'en_origen', 10000), 'conductor: llegó [cierre sin señal]');
  await escribirCodigo(pc, '.a-codigo-c .a-casillas', codigo || '');
  await debe(vista(pc, 'en_viaje', 10000), 'conductor: en viaje [cierre sin señal]');
  await debe(vista(pp, 'en_viaje', 15000), 'pasajero: en viaje [cierre sin señal]');

  // Desde aquí, lo que manda el conductor se pierde.
  await pc.evaluate(() => {
    const enviar = WebSocket.prototype.send;
    WebSocket.prototype.send = function (d) {
      if (!window.__sinSenal) return enviar.call(this, d);
    };
    window.__sinSenal = true;
  });
  await ctxC.setGeolocation({ latitude: v?.destino?.lat ?? SEGUNDO.lat, longitude: v?.destino?.lng ?? SEGUNDO.lng, accuracy: 8 });
  await pc.waitForTimeout(1500);
  await pc.click('[data-terminar]');
  await pc.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 });
  await tocarModal(pc, 'Terminar y cobrar');
  await debe(vista(pc, 'cobrando', 10000), 'conductor (sin señal): termina → cobro');
  await pc.click('[data-efectivo]');
  await tocarModal(pc, 'Sí, recibí el pago');
  await debe(vista(pc, 'calificar', 10000), 'conductor (sin señal): «Recibí efectivo» → calificar');
  await pc.click('.a-estrellas [data-n="4"]');
  await pc.click('[data-enviar]');
  await debe(vista(pc, 'libre', 10000), 'conductor (sin señal): califica y queda libre');
  await pp.waitForTimeout(2500);
  ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'en_viaje'), 'pasajero: no le llegó el fin (sigue «en viaje»)');
  ok(await pc.evaluate(() => JSON.parse(localStorage.getItem('tc.real.cerrados.conductor') || '[]').length > 0), 'conductor: el servicio cerrado queda anotado en el celular');
  await foto(pc, 'c18b-cerrado-sin-senal');

  // Recarga: la central todavía tiene el viaje «en curso».
  await pc.reload();
  await debe(vista(pc, 'libre', 30000), 'conductor: tras recargar abre libre');
  await debe(vista(pp, 'calificar', 20000), 'pasajero: le llegan el fin y el pago que el conductor repitió al reconectar → calificar');
  await pc.waitForTimeout(3000);
  const vistaC = await pc.evaluate(() => document.querySelector('.a-app')?.dataset.vista);
  ok(vistaC === 'libre', `conductor: no retoma el servicio que ya cerró (vista «${vistaC}»)`);
  const avisosC = await avisosVistos(pc);
  ok(!avisosC.some((a) => /Retomamos tu servicio|Cancelamos un servicio anterior|Tu servicio anterior terminó/.test(a)), `conductor: sin «Retomamos tu servicio» ni «Cancelamos un servicio anterior» (${avisosC.join(' | ') || 'sin avisos'})`);
  ok((await avisosVistos(pp)).some((a) => a.includes('Pago recibido')), 'pasajero: «Pago recibido» (el conductor confirmó el efectivo)');
  ok(!(await pp.isVisible('[data-recibida]')), 'pasajero: no ve las estrellas que le puso el conductor');
  await foto(pp, 'p15b-calificar-tras-cierre');
  await pp.click('.a-estrellas [data-n="5"]');
  await pp.click('[data-enviar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: califica y vuelve al inicio [cierre sin señal]');
  await pc.waitForTimeout(1000);
  ok((await texto(pc, '[data-viajes]')).trim() === '2', `conductor: el resumen del día suma los dos viajes, sin perder ni duplicar el cerrado sin señal (${(await texto(pc, '[data-viajes]')).trim()})`);
  // Para lo que sigue, vuelve a su turno (sin servicio guardado, la recarga lo deja desconectado).
  await pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 15000 });
  if ((await pc.getAttribute('[data-conectar]', 'aria-checked')) !== 'true') {
    await pc.click('[data-conectar]');
    await pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  }
}

/* ------------------------------------------------------------------ */
/* e) Cancelación mientras busca                                        */
/* ------------------------------------------------------------------ */
async function cancelarBuscando() {
  // Tras la recarga el conductor debe seguir en turno; si no, se conecta (y se anota).
  const enTurno = await pc.evaluate(() => document.querySelector('[data-conectar]')?.getAttribute('aria-checked') === 'true');
  ok(enTurno, 'conductor: después del viaje (y de recargar) sigue en turno');
  if (!enTurno) {
    await pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 15000 });
    await pc.click('[data-conectar]');
    await pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  }
  await ctxC.setGeolocation(GPS_CONDUCTOR);
  await pp.waitForTimeout(1500);
  await debe(pedirTaxi(SEGUNDO), `pasajero: pide otro taxi (${SEGUNDO.nombre})`);
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: buscando el segundo taxi');
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega la segunda solicitud');
  await foto(pc, 'c19-segunda-solicitud');
  // El pasajero recarga mientras busca: sigue buscando el MISMO viaje (no pide otro).
  const idAntes = await pp.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.estado?.viaje?.id
    || JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.viaje?.id || null);
  await pp.reload();
  await debe(vista(pp, 'buscando', 30000), 'pasajero: tras recargar mientras busca, sigue buscando');
  await pp.waitForTimeout(3500);
  const idDespues = await pp.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.estado?.viaje?.id
    || JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.viaje?.id || null);
  ok(idAntes && idAntes === idDespues, `pasajero: es el mismo viaje, no pidió otro (${idDespues})`);
  ok((await pc.$$('.a-solicitud')).length === 1 && await pc.isVisible('.a-solicitud.a-abierta'), 'conductor: sigue viendo una sola oferta');
  ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: no se cerró la búsqueda tras la reconciliación');
  await pp.click('[data-cancelar]');
  await pp.waitForSelector('.a-opciones', { timeout: 5000 });
  await pp.click('.a-opcion >> nth=0');
  await pp.waitForTimeout(300);
  await pp.click('.a-modal .a-btn-peligro');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: cancela mientras busca y vuelve al inicio');
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { state: 'detached', timeout: 10000 }), 'conductor: se le quita la oferta cancelada');
  await pc.waitForTimeout(1500);
  ok(!(await pc.$('.a-solicitud.a-abierta')) && (await pc.evaluate(() => document.querySelector('.a-app')?.dataset.vista)) === 'libre', 'conductor: queda libre, sin la oferta');
  await foto(pc, 'c20-oferta-cancelada');
}

/* ------------------------------------------------------------------ */
/* t) Tarifa imposible (servidor 0.2.2)                                 */
/* ------------------------------------------------------------------ */
// La tarifa la calcula el teléfono; la central la acota con las TARIFAS y RUTAS de la
// ficha. Aquí la solicitud sale con 100 pesos (cambiada en el WebSocket, como se haría
// desde la consola): la central responde tarifa_invalida y no guarda nada.
async function tarifaInvalida() {
  await pp.evaluate(() => {
    window.__envio ||= WebSocket.prototype.send;
    const enviar = window.__envio;
    WebSocket.prototype.send = function (d) {
      if (window.__tarifaFalsa && typeof d === 'string' && d.includes('"tipo":"solicitud"')) {
        const m = JSON.parse(d);
        m.datos.tarifa = 100;
        d = JSON.stringify(m);
      }
      return enviar.call(this, d);
    };
    window.__tarifaFalsa = true;
  });
  await debe(pedirTaxi(SEGUNDO), `pasajero: pide un taxi (${SEGUNDO.nombre}) con la tarifa cambiada a $100 [tarifa_invalida]`);
  await pp.click('[data-pedir]');
  await debe(pp.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('No pudimos calcular la tarifa')), null, { timeout: 10000 }), 'pasajero: la central responde tarifa_invalida → «No pudimos calcular la tarifa de ese viaje…»');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: el viaje se cierra sin quedar buscando');
  await pp.evaluate(() => { window.__tarifaFalsa = false; });
  ok(!(await pp.evaluate(() => localStorage.getItem('tc.real.viaje.pasajero'))), 'pasajero: no queda un viaje guardado');
  await pc.waitForTimeout(1500);
  ok(!(await pc.$('.a-solicitud.a-abierta')), 'conductor: no le llega ninguna oferta (la central no guardó la solicitud)');
  await foto(pp, 'p19b-tarifa-invalida');
}

/* ------------------------------------------------------------------ */
/* x) El pasajero borra su cuenta con un servicio asignado (0.2.2)      */
/* ------------------------------------------------------------------ */
// La app no deja eliminar la cuenta con un viaje en curso: se borra desde Node con su
// token (como si fuera desde otro teléfono). La central cancela el viaje por «sistema»
// (motivo cuenta_borrada) y se lo avisa al conductor, que queda libre sin cancelar nada.
async function cuentaBorrada() {
  await debe(pedirTaxi(SEGUNDO), `pasajero: pide un taxi (${SEGUNDO.nombre}) [cuenta borrada]`);
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: buscando [cuenta borrada]');
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega la solicitud [cuenta borrada]');
  await pc.click('.a-solicitud [data-aceptar]');
  await debe(vista(pc, 'hacia_origen', 20000), 'conductor: la acepta [cuenta borrada]');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: conductor asignado [cuenta borrada]');
  const token = await pp.evaluate(() => localStorage.getItem('taxicun.token'));
  const borrar = await fetch(`${BASE}api/yo`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).then((r) => r.status, () => 0);
  await debe(borrar === 200, `el pasajero borra su cuenta con el servicio asignado (DELETE /api/yo → ${borrar})`);
  await debe(vista(pc, 'libre', 10000), 'conductor: la central canceló el servicio (cuenta_borrada) → queda libre');
  ok(await pc.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('El pasajero canceló el servicio')), null, { timeout: 5000 }).then(() => true, () => false), 'conductor: aviso «El pasajero canceló el servicio»');
  ok(!(await pc.evaluate(() => localStorage.getItem('tc.real.viaje.conductor'))), 'conductor: el servicio ya no queda guardado');
  ok((await pc.getAttribute('[data-conectar]', 'aria-checked')) === 'true', 'conductor: sigue en turno');
  await foto(pc, 'c20b-cuenta-borrada');
  await debe(pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 15000 }), 'pasajero: su sesión se cerró (cuenta borrada) → vuelve al ingreso');
  ok(await pp.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('Tu sesión se cerró')), null, { timeout: 5000 }).then(() => true, () => false), 'pasajero: aviso «Tu sesión se cerró»');
  await foto(pp, 'p19c-sesion-cerrada');
}

// El pasajero entra otra vez con el mismo correo: es una cuenta nueva (completa sus datos).
async function reingresarPasajero() {
  await pp.fill('.a-bienvenida input[name=correo]', PASAJERO.correo);
  if (await pp.$('.a-bienvenida .a-check')) {
    const marcada = await pp.evaluate(() => Boolean(document.querySelector('.a-bienvenida .a-check input')?.checked));
    if (!marcada) await pp.click('.a-bienvenida .a-check');
  }
  await pp.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(pp, '.a-bienvenida .a-casillas-6', PASAJERO.codigo);
  await debe(pp.waitForSelector('.a-bienvenida input[name=nombre]', { timeout: 15000 }), 'pasajero: entra otra vez → cuenta nueva → «Completa tus datos»');
  await pp.fill('.a-bienvenida input[name=nombre]', PASAJERO.nombre);
  await pp.fill('.a-bienvenida input[name=celular]', PASAJERO.celular);
  await pp.click('.a-bienvenida [data-guardar]');
  await debe(pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 }), 'pasajero: «¡Listo!» con la cuenta nueva');
  await pp.click('.a-bienvenida [data-empezar]');
  await debe(vista(pp, 'inicio', 20000), 'pasajero: vuelve al inicio con la cuenta nueva');
  await debe(pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }), 'pasajero: en línea con la cuenta nueva');
  await pp.waitForTimeout(3000); // el viaje que había se da por terminado (la central ya no lo tiene)
  ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'inicio'), 'pasajero: sin el servicio de la cuenta borrada');
}

/* ------------------------------------------------------------------ */
/* e2) El conductor cancela un servicio ya asignado                      */
/* ------------------------------------------------------------------ */
// El servidor deja ese viaje cancelado: el pasajero tiene que buscar otro taxi con
// un id de viaje NUEVO (con el mismo id el servidor lo ignoraría en silencio).
async function cancelaConductor() {
  await debe(pedirTaxi(DESTINO), `pasajero: pide un tercer taxi (${DESTINO.nombre})`);
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: buscando el tercer taxi');
  const idAntes = await pp.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.estado?.viaje?.id || null);
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega la tercera solicitud');
  await pc.click('.a-solicitud [data-aceptar]');
  await debe(vista(pc, 'hacia_origen', 20000), 'conductor: la acepta');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: conductor asignado');
  await pc.click('.a-hoja [data-cancelar]');
  await pc.waitForSelector('.a-opciones', { timeout: 5000 });
  await pc.click('.a-opcion >> nth=0');
  await pc.waitForTimeout(300);
  await foto(pc, 'c21-cancelar-servicio');
  await pc.click('.a-modal .a-btn-peligro');
  await debe(vista(pc, 'libre', 10000), 'conductor: cancela el servicio y queda libre');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: el conductor canceló → vuelve a buscar');
  ok(await pp.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('El conductor canceló')), null, { timeout: 5000 }).then(() => true, () => false), 'pasajero: aviso «El conductor canceló… Te buscamos otro taxi»');
  await pp.waitForTimeout(800);
  const idDespues = await pp.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.estado?.viaje?.id || null);
  ok(idAntes && idDespues && idDespues !== idAntes, `pasajero: busca con un id de viaje nuevo (${idAntes} → ${idDespues})`);
  let deNuevo;
  if (desde('0.2.2')) {
    // Servidor 0.2.2: al conductor que canceló no le llegan las solicitudes de ese pasajero por 15 min.
    deNuevo = await intento(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 6000 }));
    ok(!deNuevo, 'conductor: la nueva búsqueda de ese pasajero no le llega (15 min de exclusión tras cancelar)');
    ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: sigue buscando otro taxi');
  } else {
    // La nueva búsqueda sí llega a los conductores libres (aquí, el mismo conductor).
    deNuevo = await intento(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }));
    ok(deNuevo, 'conductor: la nueva búsqueda le llega como otra oferta (el servidor la atiende)');
  }
  await foto(pp, 'p20-busca-otro');
  await pp.click('[data-cancelar]');
  await pp.waitForSelector('.a-opciones', { timeout: 5000 });
  await pp.click('.a-opcion >> nth=0');
  await pp.waitForTimeout(300);
  await pp.click('.a-modal .a-btn-peligro');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: cancela la nueva búsqueda');
  if (deNuevo) ok(await intento(pc.waitForSelector('.a-solicitud.a-abierta', { state: 'detached', timeout: 10000 })), 'conductor: se le quita esa oferta');
}

/* ------------------------------------------------------------------ */
/* f) Eliminar la cuenta del pasajero                                    */
/* ------------------------------------------------------------------ */
async function eliminarPasajero() {
  const token = await pp.evaluate(() => localStorage.getItem('taxicun.token'));
  ok(Boolean(token), 'pasajero: tiene token antes de eliminar la cuenta');
  await pp.click('[data-menu]');
  await pp.waitForSelector('.a-menu-item:has-text("Mi cuenta")', { timeout: 5000 });
  await pp.waitForTimeout(400);
  await pp.click('.a-menu-item:has-text("Mi cuenta")');
  await debe(pp.waitForSelector('.a-panel.a-abierto [data-eliminar]', { timeout: 5000 }), 'pasajero: «Mi cuenta» con «Eliminar mi cuenta»');
  const cuenta = await texto(pp, '.a-panel.a-abierto');
  ok(cuenta.includes(PASAJERO.correo), 'pasajero: «Mi cuenta» muestra el correo (solo lectura)');
  await pp.waitForTimeout(400);
  await foto(pp, 'p17-mi-cuenta');
  await pp.click('.a-panel.a-abierto [data-eliminar]');
  await pp.waitForSelector('.a-modal', { timeout: 5000 });
  await foto(pp, 'p18-eliminar');
  await pp.click('.a-modal button.a-btn-peligro');
  await debe(pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 15000 }), 'pasajero: tras eliminar la cuenta vuelve al ingreso con correo');
  ok(await pp.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('Tu cuenta se eliminó')), null, { timeout: 5000 }).then(() => true, () => false), 'pasajero: aviso «Tu cuenta se eliminó»');
  // El aviso se ve encima de la capa de ingreso (no queda tapado por ella).
  await pp.waitForTimeout(700);
  const avisoArriba = await pp.evaluate(() => {
    const t = [...document.querySelectorAll('.a-toast')].find((n) => n.innerText.includes('Tu cuenta se eliminó'));
    if (!t) return false;
    const r = t.getBoundingClientRect();
    return t.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  });
  ok(avisoArriba, 'pasajero: el aviso «Tu cuenta se eliminó» se ve encima del ingreso');
  const local = await pp.evaluate(() => ({ token: localStorage.getItem('taxicun.token'), claves: Object.keys(localStorage).filter((k) => k.startsWith('tc.real.')) }));
  ok(!local.token && !local.claves.length, `pasajero: se borran el token y los datos locales (${local.claves.join(', ') || 'ninguno'})`);
  // Desde Node (no desde la página: el 401 saldría como error en la consola del navegador).
  const yo = await fetch(`${BASE}api/yo`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status, () => 0);
  ok(yo === 401, `GET /api/yo con el token viejo da 401 (${yo})`);
  await foto(pp, 'p19-cuenta-eliminada');
}

/* ------------------------------------------------------------------ */
/* g) Eliminar la cuenta del conductor (menú)                           */
/* ------------------------------------------------------------------ */
async function eliminarConductor() {
  const token = await pc.evaluate(() => localStorage.getItem('taxicun.token'));
  await pc.click('[data-menu]');
  await pc.waitForSelector('.a-menu-item:has-text("Eliminar mi cuenta")', { timeout: 5000 });
  await pc.waitForTimeout(400);
  await pc.click('.a-menu-item:has-text("Eliminar mi cuenta")');
  await pc.waitForSelector('.a-modal button.a-btn-peligro', { timeout: 5000 });
  await pc.waitForTimeout(300);
  await foto(pc, 'c22-eliminar');
  await pc.click('.a-modal button.a-btn-peligro');
  await debe(pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 15000 }), 'conductor: «Eliminar mi cuenta» desde el menú → vuelve al ingreso');
  ok(await pc.waitForFunction(() => (window.__avisos || []).some((a) => a.includes('Eliminamos tu cuenta')), null, { timeout: 5000 }).then(() => true, () => false), 'conductor: aviso «Eliminamos tu cuenta»');
  const local = await pc.evaluate(() => ({ token: localStorage.getItem('taxicun.token'), claves: Object.keys(localStorage).filter((k) => k.startsWith('tc.real.')) }));
  ok(!local.token && !local.claves.length, `conductor: se borran el token y los datos locales (${local.claves.join(', ') || 'ninguno'})`);
  const yo = await fetch(`${BASE}api/yo`, { headers: { authorization: `Bearer ${token}` } }).then((r) => r.status, () => 0);
  ok(yo === 401, `conductor: GET /api/yo con el token viejo da 401 (${yo})`);
  await foto(pc, 'c23-cuenta-eliminada');
}

/* ------------------------------------------------------------------ */
let detenida = '';
try {
  await preparar();
  await registrarConductor();
  await registrarPasajero();
  await viajeCompleto();
  await finSinSenal();
  await cancelarBuscando();
  if (desde('0.2.2')) {
    await tarifaInvalida();
    await cuentaBorrada();
    await reingresarPasajero();
  }
  await cancelaConductor();
  await eliminarPasajero();
  await eliminarConductor();
} catch (e) {
  detenida = e instanceof Detener ? e.message : e?.message || String(e);
  if (!(e instanceof Detener)) ok(false, `error de la prueba: ${detenida}`);
  if (pp) await foto(pp, 'zz-pasajero-al-detener');
  if (pc) await foto(pc, 'zz-conductor-al-detener');
}

// Sin relés MQTT ni otros WebSocket: solo /api/bus del mismo origen.
const otrosWs = sockets.filter((s) => !s.includes(`${BASE.replace(/^http/, 'ws')}api/bus`));
ok(sockets.length > 0 && !otrosWs.length, `solo WebSocket a /api/bus (${sockets.length}${otrosWs.length ? `; otros: ${otrosWs.join(', ')}` : ''})`);
const mqtt = peticiones.filter((u) => /mosquitto|emqx|hivemq|mqtt/i.test(u));
ok(!mqtt.length, `sin conexiones a relés MQTT${mqtt.length ? ` (${mqtt.slice(0, 3).join(', ')})` : ''}`);
console.log(`\nErrores de la página: ${errores.length ? `\n  ${[...new Set(errores)].join('\n  ')}` : 'ninguno'}`);
ok(!errores.length, 'sin errores de JavaScript ni 404/5xx del sitio');
const fallas = resultados.filter((x) => !x.ok);
console.log(`\n${fallas.length ? 'FALLÓ' : 'PASÓ'}: ${resultados.length - fallas.length} ✔, ${fallas.length} ✘${detenida ? ` · se detuvo en «${detenida}»` : ''} · capturas en ${DIR}`);
await b.close();
