// Prueba de punta a punta del MODO REVISOR (servidor 0.2.4+): lo que hará el equipo de revisión de
// Apple o Google con UN solo teléfono y desde otro país. GPS en Cupertino (37.33, -122.03), cuenta
// revisora (REVISORES + CUENTAS_PRUEBA en el servidor) y la app TaxiCun en modo real (?real=1):
//  a) pasajero: correo + código → datos → la central dice revision: true → con el GPS lejos de El
//     Rosal, el aviso «Estás lejos de El Rosal… paradero de taxis» y la recogida en el paradero
//     Principal → destino Tierra Grata con tarifa → pide → ningún conductor de prueba en línea: a
//     los ~8 s acepta el «Conductor de prueba» (móvil 000, placa ABC123) → se acerca → «en la
//     puerta» → en viaje → llega → paga en efectivo → califica. En la base: prueba, finalizado.
//  b) conductor (la misma cuenta, en la app del conductor, también desde Cupertino): registra su
//     taxi y entra sin esperar aprobación → se conecta → a los ~5 s le llega el «Pasajero de
//     prueba» a ~120 m con el código 1234 en la nota → acepta → «Llegué» → la app le muestra el
//     código 1234 → lo escribe → en viaje → termina con la tarifa → el pasajero automático dice
//     que pagó → «Recibí efectivo» → le llega su calificación → califica y queda libre (y llega otra
//     solicitud automática, que rechaza).
// Además: sin errores de JavaScript ni 404/5xx del sitio, y solo WebSocket a /api/bus.
//
// Servidor local de la rama modo-revisor (ver /tmp/cootrans/real/COMO-PROBAR.md) con, además:
//   CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790,revision@prueba.taxicun.com:478133"
//   REVISORES="revision@prueba.taxicun.com"
// y el proxy de mismo origen en :8799. Uso: node pruebas/revisor-e2e.mjs [http://localhost:8799/]
// Variables: DATABASE_URL (para revisar los viajes con psql), CORREO_REVISOR/CODIGO_REVISOR, CAPTURAS, CHROMIUM.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8799/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/revisor-e2e').replace(/\/?$/, '/');
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_e2e';
const REVISOR = {
  correo: process.env.CORREO_REVISOR || 'revision@prueba.taxicun.com', codigo: process.env.CODIGO_REVISOR || '478133',
  nombre: 'App Review', celular: '3001112233', movil: '45', placa: 'REV045',
};
const EMPRESA = 'cootransrural';
const CUPERTINO = { latitude: 37.33, longitude: -122.03, accuracy: 15 };
mkdirSync(DIR, { recursive: true });

const FICHA = JSON.parse(readFileSync(new URL(`../empresas/${EMPRESA}/ficha.json`, import.meta.url), 'utf8'));
// Recogida de la prueba: el paradero de taxis (el Decreto 89 de 2026 prohíbe recoger en el parque principal).
const PARQUE = FICHA.LUGARES.find((l) => l.id === 'paradero');
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata');

const resultados = [];
const errores = [];
function ok(c, m) {
  resultados.push({ ok: Boolean(c), m });
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (!c) process.exitCode = 1;
}
class Detener extends Error {}
async function debe(promesa, m) {
  let motivo = '';
  const r = await Promise.resolve(promesa).then((x) => x !== false, (e) => { motivo = e?.message?.split('\n')[0] || String(e); return false; });
  ok(r, `${m}${r || !motivo ? '' : ` (${motivo})`}`);
  if (!r) throw new Detener(m);
}
const intento = (promesa) => Promise.resolve(promesa).then(() => true, () => false);
const sql = (q) => execFileSync('psql', [BASE_DATOS, '-AtXc', q], { encoding: 'utf8', timeout: 15000 }).trim();

const b = await chromium.launch({ executablePath: EXE });
const sockets = [];

async function contexto(geo) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'en-US', timezoneId: 'America/Los_Angeles', // como un revisor en Cupertino
    geolocation: geo, permissions: ['geolocation'],
  });
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
    // Fallas de servicios de afuera (teselas, rutas, direcciones de Nominatim) no son de la app.
    const externa = (m.text().match(/https?:\/\/[^\s'"]+/) || [])[0] || url;
    if (/Failed to load resource|net::ERR_|status of \d{3}|CORS policy/.test(m.text()) && externa && !externa.startsWith(BASE)) return;
    errores.push(`[${nombre}] ${m.text()}${url ? ` (${url})` : ''}`);
  });
  p.on('response', (r) => {
    if (!r.url().startsWith(BASE)) return;
    if (r.status() === 404 || r.status() >= 500) errores.push(`[${nombre}] ${r.status()} ${r.url()}`);
  });
  p.on('websocket', (ws) => sockets.push(`[${nombre}] ${ws.url()}`));
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') || '', sel);
const avisosVistos = (p) => p.evaluate(() => window.__avisos || []);
const conAviso = (p, t, timeout = 10000) => intento(p.waitForFunction((x) => (window.__avisos || []).some((a) => a.includes(x)), t, { timeout }));
const soloLetras = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 40 });
}
async function tocarModal(p, textoBoton) {
  const sel = `.a-modal button:has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(250);
  await p.click(sel);
}

// 0.10.0 (pago con QR o llave): el conductor automático cobra con la llave de MUESTRA «@taxicunprueba».
let servidorConCobro = false;

/* 0) El servidor responde (0.2.4+) y la cuenta revisora queda limpia (se borra). */
async function preparar() {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(`${BASE}empresas/indice.json`);
  const r = await p.evaluate(async ({ correo, codigo, empresa }) => {
    const api = async (metodo, ruta, cuerpo, token) => {
      const x = await fetch(`/api/${ruta}`, {
        method: metodo,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      return { estado: x.status, cuerpo: await x.json().catch(() => null) };
    };
    const salud = await api('GET', 'salud');
    await api('POST', 'auth/codigo', { correo });
    const e = await api('POST', 'auth/entrar', { correo, codigo });
    if (e.estado !== 200) return { salud, error: e.cuerpo?.error || e.estado };
    const token = e.cuerpo.token;
    // ¿Es revisora? La bienvenida lo dice; y si quedó un viaje de antes, se cancela.
    const revision = await new Promise((listo) => {
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/bus`);
      let rev = null;
      const fin = () => { try { ws.close(); } catch { /* ya */ } listo(rev); };
      const reloj = setTimeout(fin, 5000);
      ws.onopen = () => ws.send(JSON.stringify({ tipo: 'hola', datos: { token, rol: 'pasajero', empresa } }));
      ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (d.tipo === 'bienvenida') rev = d.datos?.revision === true;
        if (d.tipo !== 'viaje_actual') return;
        if (d.datos?.viajeId) ws.send(JSON.stringify({ uid: `mlimpia${Date.now()}`, tipo: 'cancelacion', datos: { viajeId: d.datos.viajeId, motivo: 'limpieza de la prueba' } }));
        clearTimeout(reloj);
        setTimeout(fin, 400);
      };
    });
    const borrar = await api('DELETE', 'yo', null, token);
    return { salud, revision, borrada: borrar.estado === 200 };
  }, { correo: REVISOR.correo, codigo: REVISOR.codigo, empresa: EMPRESA });
  await ctx.close();
  const v = String(r.salud.cuerpo?.version || '');
  const [, menor = 0, parche = 0] = v.split('.').map(Number);
  servidorConCobro = menor >= 10;
  // 0.2.4 o más nueva (la 0.3.x de la app 1.2 también trae el modo revisor).
  await debe(r.salud.estado === 200 && v.startsWith('0.') && (menor > 2 || (menor === 2 && parche >= 4)), `el servidor local responde por el proxy (${BASE}api/salud → ${v || r.salud.estado}; hace falta 0.2.4+)`);
  await debe(r.revision === true, `la cuenta ${REVISOR.correo} es revisora (bienvenida.revision)${r.error ? ` (error ${r.error}: ¿está en CUENTAS_PRUEBA?)` : r.revision === false ? ' (¿está en REVISORES?)' : ''}`);
  await debe(r.borrada, `cuenta revisora ${REVISOR.correo} limpia`);
}

/* a) Revisor pasajero desde Cupertino */
let ctxP;
let pp;
let tarifaPasajero = 0;
async function pasajero() {
  ctxP = await contexto(CUPERTINO);
  pp = await ctxP.newPage();
  vigilar(pp, 'pasajero');
  await pp.goto(`${BASE}taxicun/?real=1`);
  await debe(pp.waitForSelector('.a-bienvenida', { timeout: 30000 }), 'pasajero (Cupertino): abre la bienvenida');
  await pp.waitForTimeout(800);
  await pp.click('.a-bienvenida [data-saltar]');
  await debe(pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 }), 'pasajero: ingreso con correo');
  await pp.fill('.a-bienvenida input[name=correo]', REVISOR.correo);
  await pp.click('.a-bienvenida .a-check');
  await pp.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(pp, '.a-bienvenida .a-casillas-6', REVISOR.codigo);
  await debe(pp.waitForSelector('.a-bienvenida input[name=nombre]', { timeout: 15000 }), `pasajero: entra con el código fijo (${REVISOR.codigo}) → «Completa tus datos»`);
  await pp.fill('.a-bienvenida input[name=nombre]', REVISOR.nombre);
  await pp.fill('.a-bienvenida input[name=celular]', REVISOR.celular);
  await pp.click('.a-bienvenida [data-guardar]');
  await debe(pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 }), 'pasajero: «¡Listo!»');
  await pp.click('.a-bienvenida [data-empezar]');
  await debe(vista(pp, 'inicio', 20000), 'pasajero: llega al inicio');
  await debe(pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }), 'pasajero: en línea con la central');

  await debe(conAviso(pp, 'Estás lejos de El Rosal', 15000), 'pasajero: con el GPS en Cupertino, aviso «Estás lejos de El Rosal»');
  const aviso = (await avisosVistos(pp)).find((a) => a.includes('Estás lejos de El Rosal')) || '';
  ok(/paradero de taxis/i.test(aviso), `pasajero: el aviso dice que la prueba usa el paradero de taxis («${aviso}»)`);
  await debe(pp.waitForFunction((t) => (document.querySelector('[data-origen-titulo]')?.textContent || '').includes(t), PARQUE.nombre, { timeout: 15000 }), `pasajero: la recogida queda en «${PARQUE.nombre}» (El Rosal)`);
  ok(!(await pp.isVisible('[data-aviso-gps]')), 'pasajero: sin «No tenemos tu GPS»');
  await foto(pp, 'p01-lejos-parque');

  // Destino y tarifa.
  await pp.click('[data-buscar]');
  await pp.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await pp.fill('[data-q]', DESTINO.nombre);
  const fila = `.a-buscador .a-fila:has-text("${DESTINO.nombre}")`;
  await debe(pp.waitForSelector(fila, { timeout: 10000 }), `pasajero: el buscador encuentra «${DESTINO.nombre}» (cerca de El Rosal)`);
  await pp.waitForTimeout(600);
  await pp.click(fila);
  await vista(pp, 'confirmar', 10000);
  await debe(pp.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 }), 'pasajero: confirma el viaje con la tarifa calculada');
  tarifaPasajero = Number((await texto(pp, '[data-total]')).replace(/\D/g, ''));
  ok(tarifaPasajero >= 6100, `pasajero: tarifa de la cooperativa, mínimo la oficial de $6.100 (${tarifaPasajero})`);
  ok((await texto(pp, '.a-hoja')).includes(PARQUE.nombre), 'pasajero: el resumen dice que lo recogen en el paradero de taxis');
  await foto(pp, 'p02-confirmar');
  await pp.click('[data-pedir]');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: «Buscando tu taxi»');
  const pedido = Date.now();

  // Nadie más en línea: acepta el conductor automático a los ~8 s.
  await debe(vista(pp, 'asignado', 25000), 'pasajero: conductor asignado');
  const espera = (Date.now() - pedido) / 1000;
  ok(espera >= 6 && espera <= 20, `pasajero: el conductor automático acepta a los ~8 s (${espera.toFixed(1)} s)`);
  await pp.waitForTimeout(800);
  const tarjeta = await texto(pp, '.a-tarjeta-conductor');
  ok(tarjeta.includes('Conductor de prueba'), 'pasajero: «Conductor de prueba»');
  ok((await texto(pp, '.a-tarjeta-conductor .a-movil')).includes('000'), 'pasajero: móvil 000');
  ok(soloLetras(tarjeta).includes('ABC123'), 'pasajero: placa ABC123');
  // El conductor automático no tiene celular, y con la cuenta revisora no se ofrece la central real
  // de la cooperativa: no hay botón «Llamar». (Sin esperar: el selector no debe existir.)
  const tel = await pp.evaluate(() => document.querySelector('.a-acciones a[href^="tel:"]')?.getAttribute('href') || null);
  ok(!tel, `pasajero: «Llamar» no marca a nadie con el conductor automático (${tel || 'sin botón'})`);
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  ok(/^\d{4}$/.test(codigo || ''), `pasajero: ve su código de abordaje (${codigo})`);
  await foto(pp, 'p03-asignado');

  ok(await conAviso(pp, 'Tu taxi está llegando', 30000), 'pasajero: el taxi se acerca («Tu taxi está llegando»)');
  await debe(vista(pp, 'llego', 30000), 'pasajero: «Tu taxi está en la puerta»');
  await foto(pp, 'p04-llego');
  await debe(vista(pp, 'en_viaje', 20000), 'pasajero: «Viaje en curso»');
  await pp.waitForTimeout(3000);
  await foto(pp, 'p05-en-viaje');
  await debe(vista(pp, 'pagar', 45000), 'pasajero: llega al destino → pagar');
  await pp.waitForTimeout(600);
  const total = Number((await texto(pp, '[data-total-pagar]')).replace(/\D/g, ''));
  ok(total === tarifaPasajero, `pasajero: el total es la tarifa del viaje (${total})`);
  await foto(pp, 'p06-pagar');
  if (servidorConCobro) {
    // Con la 0.10.0: «Pagar con QR o llave» con la llave de MUESTRA, marcada de prueba (nunca datos reales). Se vuelve
    // y se paga en efectivo, como siempre.
    const hay = await pp.waitForSelector('[data-pagar-qr-llave]:not([hidden])', { timeout: 10000 }).then(() => true).catch(() => false);
    if (hay) {
      await pp.click('[data-pagar-qr-llave]');
      await pp.waitForSelector('.a-modal [data-hoja-pago-qr]', { timeout: 8000 });
      const hoja = await texto(pp, '.a-modal [data-hoja-pago-qr]');
      ok(/@taxicunprueba/.test(hoja) && /DE PRUEBA/.test(hoja) && /No transfieras dinero/.test(hoja), `pasajero: «Pagar con QR o llave» con la llave de MUESTRA «@taxicunprueba» DE PRUEBA (${hoja.slice(0, 140)})`);
      await foto(pp, 'p06b-pagar-qr-llave-muestra');
      await tocarModal(pp, 'Volver');
      await pp.waitForTimeout(400);
    } else ok(false, 'pasajero: con el servidor 0.10.0 aparece «Pagar con QR o llave» (llave de muestra)');
  }
  await pp.click('[data-efectivo]');
  await tocarModal(pp, 'Sí, ya pagué');
  await debe(vista(pp, 'calificar', 10000), 'pasajero: paga en efectivo → calificar');
  await pp.waitForTimeout(3500); // el conductor automático confirma el pago y lo califica
  await pp.click('.a-estrellas [data-n="5"]');
  await foto(pp, 'p07-calificar');
  await pp.click('[data-enviar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: califica y vuelve al inicio');
  await pp.waitForTimeout(800);

  const fila2 = sql(`select v.estado, v.prueba, v.valor_final, round((v.origen->>'lat')::numeric, 5), round((v.origen->>'lng')::numeric, 5),
      (select count(*) from calificaciones c where c.viaje_id = v.id)
    from viajes v join usuarios c on c.id = v.conductor_id join usuarios p on p.id = v.pasajero_id
    where p.correo = '${REVISOR.correo}' and c.correo = 'conductor-de-prueba@revision.taxicun.invalid'
    order by v.creado desc limit 1`).split('|');
  ok(fila2[0] === 'finalizado' && fila2[1] === 't', `base: el viaje queda finalizado y marcado de prueba (${fila2.slice(0, 2).join(', ')})`);
  ok(Number(fila2[2]) === tarifaPasajero, `base: valor final = tarifa (${fila2[2]})`);
  ok(Math.abs(Number(fila2[3]) - PARQUE.lat) < 1e-4 && Math.abs(Number(fila2[4]) - PARQUE.lng) < 1e-4, `base: la recogida es el paradero de taxis (${fila2[3]}, ${fila2[4]})`);
  ok(fila2[5] === '2', `base: las dos calificaciones (${fila2[5]})`);
}

/* b) Revisor conductor desde Cupertino (la misma cuenta, en la app del conductor) */
let ctxC;
let pc;
async function conductor() {
  ctxC = await contexto(CUPERTINO);
  pc = await ctxC.newPage();
  vigilar(pc, 'conductor');
  await pc.goto(`${BASE}taxicun/conductor/?real=1`);
  await debe(pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 }), 'conductor (Cupertino): ingreso con correo');
  await pc.fill('.a-ingreso-real input[name=correo]', REVISOR.correo);
  await pc.click('.a-ingreso-real button[type=submit]');
  await escribirCodigo(pc, '.a-ingreso-real .a-casillas-6', REVISOR.codigo);
  await debe(pc.waitForSelector('.a-ingreso-real input[name=placa]', { timeout: 15000 }), 'conductor: con el nombre y el celular ya puestos, pasa a «Tu taxi»');
  await pc.fill('.a-ingreso-real input[name=movil]', REVISOR.movil);
  await pc.fill('.a-ingreso-real input[name=placa]', REVISOR.placa);
  await foto(pc, 'c01-tu-taxi');
  await pc.click('.a-ingreso-real button[type=submit]');
  await debe(vista(pc, 'libre', 20000).then(() => pc.waitForSelector('.a-ingreso-real', { state: 'detached', timeout: 10000 })), 'conductor: la cuenta revisora entra de una vez (sin «en revisión»)');
  await debe(pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 15000 }), 'conductor: la píldora de turno se habilita tras la bienvenida');
  await pc.click('[data-conectar]');
  await debe(pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'conductor: en línea (GPS en Cupertino)');
  const conectado = Date.now();

  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: le llega una solicitud');
  const espera = (Date.now() - conectado) / 1000;
  ok(espera >= 3 && espera <= 15, `conductor: llega a los ~5 s de conectarse (${espera.toFixed(1)} s)`);
  const oferta = await texto(pc, '.a-solicitud');
  ok(oferta.includes('Pasajero de prueba'), 'conductor: es del «Pasajero de prueba»');
  ok(/Código de abordaje: 1234/.test(oferta), 'conductor: la nota trae el código de abordaje 1234');
  const metros = Number((oferta.match(/(\d+) m\b/) || [])[1]);
  ok(metros >= 80 && metros <= 220, `conductor: el pasajero está a su lado (${metros} m)`);
  await foto(pc, 'c02-solicitud');
  await pc.press('.a-solicitud .a-deslizador-mango', 'Enter');
  await debe(vista(pc, 'hacia_origen', 20000), 'conductor: acepta → «Recoge a Pasajero»');
  ok(await intento(pc.waitForSelector('[data-llegue].a-resaltar', { timeout: 15000 })), 'conductor: está en el punto: «Llegué» resaltado');
  await foto(pc, 'c03-hacia-origen');
  await pc.click('[data-llegue]');
  await debe(vista(pc, 'en_origen', 10000), 'conductor: «Llegué» funciona con el GPS real → pide el código');
  ok((await texto(pc, '[data-pista-revision]')).includes('1234'), 'conductor: la app le muestra el código 1234 del pasajero automático');
  ok(!/Pista de la demo/.test(await texto(pc, '.a-hoja')), 'conductor: sin «Pista de la demo»');
  await foto(pc, 'c04-codigo');
  await escribirCodigo(pc, '.a-codigo-c .a-casillas', '1234');
  await debe(vista(pc, 'en_viaje', 10000), 'conductor: con el código 1234 arranca el viaje');
  await pc.waitForTimeout(1500);
  await pc.click('[data-terminar]');
  await debe(pc.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 }), 'conductor: «Terminar viaje» pide confirmar el valor');
  const valor = Number((await pc.inputValue('.a-modal input[name=valor]')).replace(/\D/g, ''));
  ok(valor >= 8000, `conductor: el valor viene con la tarifa (${valor})`);
  await tocarModal(pc, 'Terminar y cobrar');
  await debe(vista(pc, 'cobrando', 10000), 'conductor: termina → cobro en efectivo');
  await debe(pc.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 15000 }), 'conductor: el pasajero automático dice que ya pagó');
  await foto(pc, 'c05-pago-anunciado');
  await pc.click('[data-efectivo]');
  await tocarModal(pc, 'Sí, recibí el pago');
  await debe(vista(pc, 'calificar', 10000), 'conductor: «Recibí efectivo» → calificar');
  ok(await conAviso(pc, 'Tu calificación se actualizó', 10000), 'conductor: el pasajero automático lo califica (llega su promedio)');
  await pc.click('.a-estrellas [data-n="5"]');
  await pc.click('[data-enviar]');
  await debe(vista(pc, 'libre', 10000), 'conductor: califica y queda libre');
  await foto(pc, 'c06-libre');

  const fila = sql(`select v.estado, v.prueba, v.valor_final, (select count(*) from calificaciones c where c.viaje_id = v.id)
    from viajes v join usuarios c on c.id = v.conductor_id join usuarios p on p.id = v.pasajero_id
    where c.correo = '${REVISOR.correo}' and p.correo = 'pasajero-de-prueba@revision.taxicun.invalid' and v.estado = 'finalizado'
    order by v.creado desc limit 1`).split('|');
  ok(fila[0] === 'finalizado' && fila[1] === 't' && Number(fila[2]) === valor && fila[3] === '2', `base: viaje finalizado, de prueba, con el valor y las dos calificaciones (${fila.join(', ')})`);

  // Sigue en línea: llega otra solicitud automática; la rechaza.
  await debe(pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor: libre otra vez, le llega otra solicitud automática');
  await pc.click('.a-solicitud [data-rechazar]');
  await pc.waitForTimeout(800);
  ok(!(await pc.$('.a-solicitud.a-abierta')), 'conductor: la rechaza y queda libre');
  await pc.click('[data-conectar]');
  await pc.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 10000 }).catch(() => {});
}

/* c) La cuenta queda limpia (se borra, como haría el revisor desde «Eliminar mi cuenta»). */
async function limpiar() {
  const token = await pc.evaluate(() => localStorage.getItem('taxicun.token'));
  const r = await fetch(`${BASE}api/yo`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).then((x) => x.status, () => 0);
  ok(r === 200, `la cuenta revisora se borra al final (DELETE /api/yo → ${r})`);
}

let detenida = '';
try {
  await preparar();
  await pasajero();
  await conductor();
  await limpiar();
} catch (e) {
  detenida = e instanceof Detener ? e.message : e?.message || String(e);
  if (!(e instanceof Detener)) ok(false, `error de la prueba: ${detenida}`);
  if (pp) await foto(pp, 'zz-pasajero-al-detener');
  if (pc) await foto(pc, 'zz-conductor-al-detener');
}

const otrosWs = sockets.filter((s) => !s.includes(`${BASE.replace(/^http/, 'ws')}api/bus`));
ok(sockets.length > 0 && !otrosWs.length, `solo WebSocket a /api/bus (${sockets.length}${otrosWs.length ? `; otros: ${otrosWs.join(', ')}` : ''})`);
console.log(`\nErrores de la página: ${errores.length ? `\n  ${[...new Set(errores)].join('\n  ')}` : 'ninguno'}`);
ok(!errores.length, 'sin errores de JavaScript ni 404/5xx del sitio');
const fallas = resultados.filter((x) => !x.ok);
console.log(`\n${fallas.length ? 'FALLÓ' : 'PASÓ'}: ${resultados.length - fallas.length} ✔, ${fallas.length} ✘${detenida ? ` · se detuvo en «${detenida}»` : ''} · capturas en ${DIR}`);
await b.close();
