// «Reglas del despacho» de punta a punta: la web en modo real (?real=1, diseño A) contra el servidor de TaxiCun de la
// rama reglas-despacho por el proxy de mismo origen, con las reglas por defecto de la cooperativa (oferta 25 s,
// «Llegué» a 150 m, búsqueda 10 min, pausa tras cancelar 15 min solo si hay otro taxi). Nada de /api se simula.
// Un pasajero (en el parque) y dos conductores (A al norte y B al sur, a ~300 m), cada uno en su navegador; se miran
// los mensajes del bus que manda y recibe cada uno.
//  1) La bienvenida trae las reglas y la app las guarda.
//  2) Nadie en turno: el pasajero pide → sin_conductores (sin_taxis) → «No hay taxis en turno cerca» con «Llamar a la
//     central»; sigue buscando. A se pone en turno → con_conductores: el aviso se va y a A le llega la oferta (25 s).
//  3) A la ve (oferta_vista) y la rechaza (rechazo) → era el único: sin_conductores (rechazado) → «Ningún taxi tomó tu
//     solicitud». A sale y vuelve a entrar en turno: lo rechazado no le vuelve a llegar.
//  4) B se pone en turno → con_conductores y a B le llega; la acepta. B la cancela → la app del pasajero busca sola
//     (id nuevo): le llega a A y no a B (pausa tras cancelar: hay otro taxi). A la rechaza → ya no hay otro: le llega a
//     B (nunca un pasajero sin nadie que reciba su pedido), sin que el pasajero quede «sin conductores».
//  5) El pasajero cancela y pide a mano otra vez (como quien no tenía la app abierta cuando le cancelaron): con A en
//     turno le llega a A y no a B; A cierra la app sin responder (se va) → le llega a B.
//
// Servidor (rama reglas-despacho), base aparte:
//   CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790,conductor2@prueba.taxicun.com:975310" \
//   DATABASE_URL=… CLAVE_SERVIDOR=… MODO_CORREO=prueba INDICE_EMPRESAS=… CODIGOS_POR_IP_HORA=100000 PUERTO=… node src/index.js
// Proxy:   node pruebas/servidor-local.mjs --puerto=… --api=http://127.0.0.1:…
// Prueba:  DATABASE_URL=… SERVIDOR_TAXICUN=<árbol del servidor> node pruebas/reglas-despacho-e2e.mjs http://localhost:…/
// Se puede repetir sin reiniciar nada: borra y vuelve a crear las tres cuentas de prueba (las reglas de la cooperativa
// tienen que estar en sus valores por defecto).
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:4732/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/reglas-despacho-e2e').replace(/\/?$/, '/');
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_e2e';
const SERVIDOR = process.env.SERVIDOR_TAXICUN || '/root/proyectos/taxicun-servidor';
mkdirSync(DIR, { recursive: true });

const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const TEL_CENTRAL = String(FICHA.EMPRESA.telefono).replace(/\D/g, '');
const GPS_P = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 };
const GPS_A = { latitude: CENTRO.lat + 0.0027, longitude: CENTRO.lng, accuracy: 10 };
const GPS_B = { latitude: CENTRO.lat - 0.0027, longitude: CENTRO.lng, accuracy: 10 };
const PAS = { correo: 'pasajero@prueba.taxicun.com', codigo: '246810', nombre: 'Ana María Gómez', celular: '3001234567' };
const CA = { correo: 'conductor@prueba.taxicun.com', codigo: '135790', nombre: 'Luis Alberto Rodríguez', celular: '3115550101', movil: '77', placa: 'TST777' };
const CB = { correo: 'conductor2@prueba.taxicun.com', codigo: '975310', nombre: 'Jorge Iván Peña', celular: '3125550202', movil: '78', placa: 'TST778' };

/* ---------------- resultados ---------------- */
let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
class Detener extends Error {}
async function debe(promesa, m) {
  let motivo = '';
  const r = await Promise.resolve(promesa).then((x) => x !== false && x !== null && x !== undefined, (e) => {
    motivo = e?.message?.split('\n')[0] || String(e);
    return false;
  });
  ok(r, `${m}${r || !motivo ? '' : ` (${motivo})`}`);
  if (!r) throw new Detener(m);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 8000, paso = 150) {
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
const intento = (pr) => Promise.resolve(pr).then(() => true, () => false);

/* ---------------- API ---------------- */
async function api(metodo, ruta, cuerpo, token) {
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
async function entrarApi(c) {
  await api('POST', 'auth/codigo', { correo: c.correo });
  return api('POST', 'auth/entrar', { correo: c.correo, codigo: c.codigo });
}

/* ---------------- navegadores y mensajes del bus ---------------- */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
const bus = []; // { quien, dir: 'sale' | 'llega', tipo, datos, t }
const msj = (quien, dir, tipo, filtro = () => true) => bus.filter((m) => m.quien === quien && m.dir === dir && m.tipo === tipo && filtro(m.datos || {}));

async function abrir(quien, gps, url) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, geolocation: gps, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
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
  p.on('pageerror', (e) => errores.push(`[${quien}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|status of 4\d\d/.test(m.text())) errores.push(`[${quien}] consola: ${m.text()}`);
  });
  p.on('websocket', (ws) => {
    const anotar = (dir) => (f) => {
      try {
        const m = JSON.parse(String(f.payload));
        if (m?.tipo && m.tipo !== 'hola') bus.push({ quien, dir, tipo: m.tipo, datos: m.datos, t: Date.now() });
      } catch {
        /* no es JSON */
      }
    };
    ws.on('framesent', anotar('sale'));
    ws.on('framereceived', anotar('llega'));
  });
  await p.goto(`${BASE}${url}`);
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') || '', sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const avisos = (p, re) => p.evaluate((f) => (window.__avisos || []).filter((a) => new RegExp(f).test(a.titulo)), re.source);
const conAviso = async (p, re, timeout = 10000) => Boolean(await hasta(async () => (await avisos(p, re)).length > 0, timeout));
const cajaVisible = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-sin-taxis]');
  return Boolean(c && !c.hidden && c.offsetHeight > 0);
});
const viajeDelPasajero = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.pasajero') || 'null')?.estado?.viaje?.id || null);
const ofertaAbierta = (p, timeout) => intento(p.waitForSelector('.a-solicitud.a-abierta', { timeout }));
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function cancelar(p, sel) {
  await p.click(sel);
  await p.waitForSelector('.a-opciones', { timeout: 5000 });
  await p.click('.a-opcion >> nth=0');
  await p.waitForTimeout(300);
  await p.click('.a-modal .a-btn-peligro');
}
async function turno(p, quiero) {
  if (((await p.getAttribute('[data-conectar]', 'aria-checked')) === 'true') !== quiero) await p.click('[data-conectar]');
  return intento(p.waitForSelector(`[data-conectar][aria-checked="${quiero}"]`, { timeout: 15000 }));
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
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 15000);
  return hasta(() => viajeDelPasajero(p), 5000);
}
async function entrarConductor(c, gps) {
  const { ctx, p } = await abrir(c.movil, gps, 'taxicun/conductor/?real=1');
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', c.correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', c.codigo);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
  return { ctx, p };
}

/* ---------------- 0) cuentas limpias ---------------- */
async function preparar() {
  const salud = await api('GET', 'salud');
  await debe(salud.estado === 200, `servidor por el proxy (${salud.datos?.version || salud.estado})`);
  for (const c of [PAS, CA, CB]) {
    const r = await entrarApi(c);
    await debe(r.estado === 200, `cuenta de prueba ${c.correo} (¿está en CUENTAS_PRUEBA?)`);
    await api('DELETE', 'yo', undefined, r.datos.token);
  }
  const p = await entrarApi(PAS);
  await api('PATCH', 'yo', { nombre: PAS.nombre, celular: PAS.celular }, p.datos?.token);
  await api('POST', 'auth/salir', undefined, p.datos?.token);
  for (const c of [CA, CB]) {
    const r = await entrarApi(c);
    await api('PATCH', 'yo', { nombre: c.nombre, celular: c.celular }, r.datos?.token);
    const reg = await api('PUT', 'conductor', { empresa: 'cootransrural', movil: c.movil, placa: c.placa }, r.datos?.token);
    const apr = execFileSync('node', ['bin/admin.js', 'aprobar', c.correo, '--motivo', 'Documentos revisados (prueba de punta a punta)'], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000 }).trim();
    await api('POST', 'auth/salir', undefined, r.datos?.token);
    await debe(reg.estado === 200 && /aprobado/.test(apr), `conductor ${c.nombre} registrado y aprobado (móvil ${c.movil})`);
  }
}

let P;
let A;
let B;
async function recorrido() {
  /* 1) bienvenida con las reglas */
  P = await abrir('pasajero', GPS_P, 'taxicun/?real=1');
  const pp = P.p;
  await pp.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await pp.click('.a-bienvenida [data-saltar]');
  await pp.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await pp.fill('.a-bienvenida input[name=correo]', PAS.correo);
  await pp.click('.a-bienvenida .a-check');
  await pp.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(pp, '.a-bienvenida .a-casillas-6', PAS.codigo);
  await pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await pp.waitForTimeout(400);
  await pp.click('.a-bienvenida [data-empezar]');
  await debe(vista(pp, 'inicio', 20000), 'pasajero: entra y queda en el inicio');
  const bienv = await hasta(() => msj('pasajero', 'llega', 'bienvenida')[0], 10000);
  await debe(bienv?.datos?.reglas, `la bienvenida trae las reglas del despacho (${JSON.stringify(bienv?.datos?.reglas)}); esta prueba es para la central con «Reglas del despacho»`);
  const r = bienv.datos.reglas;
  ok(r.segundosOferta === 25 && r.metrosLlegue === 150 && r.minutosBusqueda === 10 && Object.keys(r).length === 3, `las reglas por defecto (25 s, 150 m, 10 min) y solo las que usa la app (${JSON.stringify(r)})`);
  const guardadas = await pp.evaluate(() => JSON.parse(localStorage.getItem('tc.real.reglas.cootransrural') || 'null'));
  ok(JSON.stringify(guardadas) === JSON.stringify({ segundosOferta: 25, metrosLlegue: 150, minutosBusqueda: 10 }), `pasajero: la app guarda las reglas (${JSON.stringify(guardadas)})`);

  /* 2) nadie en turno → sin_conductores; A entra en turno → con_conductores y la oferta */
  A = await entrarConductor(CA, GPS_A);
  const pa = A.p;
  const v1 = await pedirTaxi(pp);
  await debe(v1, `pasajero: pide con nadie en turno (${v1})`);
  const sin1 = await hasta(() => msj('pasajero', 'llega', 'sin_conductores', (d) => d.viajeId === v1)[0], 10000);
  ok(sin1?.datos?.motivo === 'sin_taxis', `pasajero: la central manda sin_conductores (${JSON.stringify(sin1?.datos)})`);
  ok(Boolean(await hasta(() => cajaVisible(pp), 5000)), 'pasajero: «No hay taxis en turno cerca» en la hoja');
  ok(/No hay taxis en turno cerca/.test(await texto(pp, '[data-sin-taxis]')), 'pasajero: con el texto de sin_taxis');
  ok((await pp.getAttribute('[data-sin-taxis] [data-llamar-central]', 'href').catch(() => null)) === `tel:${TEL_CENTRAL}`, 'pasajero: con «Llamar a la central»');
  await foto(pp, 'p01-sin-taxis');
  ok(await pp.evaluate(() => document.querySelector('.a-app')?.dataset.vista === 'buscando'), 'pasajero: sigue buscando');
  await debe(turno(pa, true), 'A: se pone en turno');
  ok(Boolean(await hasta(() => msj('pasajero', 'llega', 'con_conductores', (d) => d.viajeId === v1).length, 10000)), 'pasajero: con_conductores al entrar A en turno');
  ok(Boolean(await hasta(async () => !(await cajaVisible(pp)), 5000)), 'pasajero: el aviso se va');
  ok(await conAviso(pp, /Tu solicitud ya le llegó a un taxi/), 'pasajero: «Tu solicitud ya le llegó a un taxi»');
  await debe(ofertaAbierta(pa, 15000), 'A: le llega la oferta');
  const seg = Number(await pa.textContent('.a-solicitud [data-seg]').catch(() => 'NaN'));
  ok(seg >= 22 && seg <= 25, `A: la oferta cuenta 25 s (${seg})`);
  ok(Boolean(await hasta(() => msj(CA.movil, 'sale', 'oferta_vista', (d) => d.viajeId === v1).length === 1, 5000)), 'A: manda oferta_vista { viajeId } al verla');

  /* 3) A la rechaza → era el único → sin_conductores (rechazado) */
  await pa.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await hasta(() => msj(CA.movil, 'sale', 'rechazo', (d) => d.viajeId === v1).length === 1, 5000)), 'A: «Rechazar» manda rechazo { viajeId }');
  const sin2 = await hasta(() => msj('pasajero', 'llega', 'sin_conductores', (d) => d.viajeId === v1 && d.motivo === 'rechazado')[0], 10000);
  ok(Boolean(sin2), 'pasajero: era el único → sin_conductores (rechazado)');
  ok(Boolean(await hasta(async () => /Ningún taxi tomó tu solicitud/.test(await texto(pp, '[data-sin-taxis]')) && (await cajaVisible(pp)), 5000)), 'pasajero: «Ningún taxi tomó tu solicitud»');
  await foto(pp, 'p02-rechazado');
  await debe(turno(pa, false), 'A: sale de turno');
  await pa.waitForTimeout(800);
  await debe(turno(pa, true), 'A: vuelve a entrar en turno');
  ok(!(await ofertaAbierta(pa, 6000)), 'A: lo que rechazó no le vuelve a llegar');
  ok(await cajaVisible(pp), 'pasajero: sigue «sin conductores» (A ya la rechazó)');

  /* 4) B entra → le llega; la acepta y la cancela → la búsqueda sola le llega a A y no a B; A la rechaza → a B */
  B = await entrarConductor(CB, GPS_B);
  const pb = B.p;
  await debe(turno(pb, true), 'B: se pone en turno');
  await debe(ofertaAbierta(pb, 15000), 'B: le llega la oferta');
  ok(Boolean(await hasta(() => msj('pasajero', 'llega', 'con_conductores', (d) => d.viajeId === v1).length >= 2, 10000)), 'pasajero: con_conductores al llegarle a B');
  ok(Boolean(await hasta(async () => !(await cajaVisible(pp)), 5000)), 'pasajero: el aviso se va');
  await pb.click('.a-solicitud [data-aceptar]');
  await debe(vista(pb, 'hacia_origen', 20000), 'B: la acepta');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: asignado a B');
  const sinesAntes = msj('pasajero', 'llega', 'sin_conductores').length;
  await cancelar(pb, '.a-hoja [data-cancelar]');
  await debe(vista(pb, 'libre', 10000), 'B: cancela el servicio y queda libre (en turno)');
  await debe(vista(pp, 'buscando', 15000), 'pasajero: el conductor canceló → la app busca otro taxi sola');
  const v2 = await hasta(async () => {
    const id = await viajeDelPasajero(pp);
    return id && id !== v1 ? id : null;
  }, 8000);
  ok(Boolean(v2), `pasajero: con un id nuevo (${v1} → ${v2})`);
  ok(await ofertaAbierta(pa, 15000), 'A: le llega la búsqueda nueva');
  ok(!(await ofertaAbierta(pb, 4000)), 'B: a él no (pausa tras cancelar: hay otro taxi)');
  ok(Boolean(await hasta(() => msj(CA.movil, 'sale', 'oferta_vista', (d) => d.viajeId === v2).length === 1, 5000)), 'A: oferta_vista de la búsqueda nueva');
  await pa.click('.a-solicitud [data-rechazar]');
  ok(await ofertaAbierta(pb, 15000), 'A la rechaza → ya no hay otro: le llega a B (nunca un pasajero sin nadie)');
  ok(msj('pasajero', 'llega', 'sin_conductores').length === sinesAntes && !(await cajaVisible(pp)), 'pasajero: en todo esto no quedó «sin conductores»');
  await pb.click('.a-solicitud [data-rechazar]');
  ok(Boolean(await hasta(() => msj(CB.movil, 'sale', 'rechazo', (d) => d.viajeId === v2).length === 1, 5000)), 'B: la rechaza');
  ok(Boolean(await hasta(() => msj('pasajero', 'llega', 'sin_conductores', (d) => d.viajeId === v2).length, 10000)), 'pasajero: los dos la rechazaron → sin_conductores');

  /* 5) el pasajero cancela y pide a mano: con A en turno le llega a A y no a B; sin A, a B */
  await cancelar(pp, '[data-cancelar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: cancela');
  await pp.waitForTimeout(800);
  const v3 = await pedirTaxi(pp);
  ok(Boolean(v3) && v3 !== v2, `pasajero: pide otra vez a mano (${v3})`);
  ok(await ofertaAbierta(pa, 15000), 'A: le llega el pedido a mano');
  ok(!(await ofertaAbierta(pb, 4000)), 'B: a él no (sigue la pausa: hay otro taxi)');
  await A.ctx.close(); // A cierra la app sin responder (en la web, sin avisos: no queda en turno)
  A = null;
  ok(await ofertaAbierta(pb, 15000), 'A se fue: el pedido le llega a B (no hay otro)');
  ok(!(await cajaVisible(pp)), 'pasajero: sin «sin conductores»');
  await foto(pb, 'b01-sin-otro');
  await pb.click('.a-solicitud [data-aceptar]');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: asignado a B');
  await cancelar(pp, '[data-cancelar]');
  await vista(pp, 'inicio', 10000).catch(() => {});
}

let detenida = '';
try {
  await preparar();
  await recorrido();
} catch (e) {
  detenida = e instanceof Detener ? e.message : e?.stack || String(e);
}
for (const x of [P, A, B]) await x?.ctx.close().catch(() => {});
await b.close();
if (detenida) {
  fallas += 1;
  console.log(`✘ la prueba se detuvo: ${detenida}`);
}
console.log(errores.length ? `\nErrores de la página:\n${errores.join('\n')}` : '\nErrores de la página: ninguno');
ok(!errores.length, 'sin errores de JavaScript');
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘ · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
