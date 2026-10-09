// Ronda 4A en las apps de verdad contra la instalación local completa (servidor 0.9.0, con el acuerdo de datos y la
// política 1.3 de prueba: levantar-local.sh --con-v1 --con-acuerdo). La app es la web de esta rama servida por la
// instalación (taxicun.com local, modo real) en Chromium; el panel se usa por su puerta pública, con los clientes de la
// instalación (pruebas/local/clientes.mjs del árbol del servidor).
//  1. Un conductor nuevo de Cootransrural (aprobado por la gerente) en turno cerca del parque.
//  2. La gerente crea un «Pedido por teléfono» (POST /api/panel/c/cootransrural/pedidos): le llega como «Pedido de la
//     central» con el primer nombre de quien llamó; acepta, «Llamar a …» va al celular que anotó la central, «Confirma que
//     es …», «Iniciar viaje» sin código, cobra y queda libre sin calificar. El panel lo ve finalizado y de la central.
//  3. «¿Necesitas ayuda?» → «Avisar a la central» (si la cooperativa lo recibe): el panel lo ve en GET sos y lo atiende.
//  4. La gerente le manda un aviso (conductores elegidos): la tarjeta; «Entendido» lo deja leído.
//  5. Un pasajero nuevo pide un taxi, el conductor lo toma y el pasajero toca «Avisar a la central de Cootransrural»: el
//     panel ve la alerta del pasajero. Ajustes → «Avisos de Cootransrural» (la baja, PUT /api/yo/avisos).
// Uso: node pruebas/f4a-app-real.mjs --dir=<carpeta de la instalación> [--servidor=<árbol del servidor 0.9.0>]
//      [--salida=<capturas>]. Las cuentas de prueba se borran al final («Eliminar mi cuenta» por la API).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || d;
const SERVIDOR = arg('servidor', '/tmp/cootrans/f4a/servidor');
const SALIDA = arg('salida', '/tmp/cootrans/f4a/pruebas/app/real');
mkdirSync(SALIDA, { recursive: true });
const { clientes } = await import(pathToFileURL(join(SERVIDOR, 'pruebas/local/clientes.mjs')).href);
const { leerInstalacion } = await import(pathToFileURL(join(SERVIDOR, 'pruebas/local/comun.mjs')).href);
const inst = leerInstalacion(arg('dir', '/tmp/cootrans/panel/local/taxicun_f4a_e2e'));
const PW = process.env.PLAYWRIGHT_CORE || '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
const CHROMIUM = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const { chromium } = await import(PW);
const C = clientes(inst);
const COOP = 'cootransrural';
const PARQUE = { lat: 4.85257, lng: -74.26059 };
const LLAMANTE = { nombre: 'Rosa Elena Díaz', celular: '3157778899' };

let pasan = 0;
const fallas = [];
function prueba(cond, texto) {
  if (cond) { pasan += 1; console.log(`✔ ${texto}`); } else { fallas.push(texto); console.log(`✘ ${texto}`); }
}
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function hasta(fn, ms = 8000, cada = 200) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* otra vez */ }
    await esperar(cada);
  }
  return null;
}
const ok = (r, que) => { if (r.status < 200 || r.status > 299) throw new Error(`${que}: ${r.status} ${r.texto}`); return r.cuerpo; };

const nav = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
const errores = [];
async function contexto(nombre, token, pos = PARQUE) {
  const ctx = await nav.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-CO', timezoneId: 'America/Bogota',
    geolocation: { latitude: pos.lat, longitude: pos.lng, accuracy: 10 }, permissions: ['geolocation'],
  });
  await ctx.addInitScript((t) => {
    if (!sessionStorage.getItem('__sesionPuesta')) { localStorage.setItem('taxicun.token', t); sessionStorage.setItem('__sesionPuesta', '1'); }
  }, token);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${String(e.message).slice(0, 200)}`));
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: join(SALIDA, `${n}.png`) }).catch(() => {});
const vista = (p, v, timeout = 20000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
async function tocarModal(p, textoBoton, clase = '') {
  const sel = `${clase ? `.${clase} ` : ''}.a-modal :is(button, a):has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 10000 });
  await p.waitForTimeout(400);
  await p.click(sel);
  await p.waitForTimeout(400);
}
const cuentas = [];

try {
  const martha = await C.entrarPanel('martha@cootransrural.test');
  const panel = (metodo, ruta, cuerpo) => C.panel(metodo, `/api/panel/c/${COOP}/${ruta}`, { cookie: martha, cuerpo });
  const salud = await C.app('GET', '/api/salud');
  // La 0.9 o posterior (la 0.10.0 del pago con QR o llave trae todo lo de la ronda 4A).
  prueba(/^0\.(9|[1-9]\d)\./.test(salud.cuerpo?.version || ''), `el servidor es la 0.9 o posterior (${salud.cuerpo?.version})`);
  // ¿La cooperativa puede recibir el SOS y los datos nuevos (política 1.3 y acuerdo)?
  const sos0 = await panel('GET', 'sos?estado=abiertas');
  const conCompuerta = sos0.status === 200;
  console.log(`  (GET sos: ${sos0.status} ${sos0.cuerpo?.error || ''}: ${conCompuerta ? 'con' : 'sin'} la política 1.3 y el acuerdo)`);

  // ------------------------------------------------------------------ 1. conductor aprobado y en turno
  const correoC = `f4a.conductor.${Date.now().toString(36)}@correo.test`;
  const cond = await C.entrarApp(correoC);
  cuentas.push(cond.token);
  ok(await C.app('PATCH', '/api/yo', { nombre: 'Germán Arturo Ruiz', celular: '3125550477' }, cond.token), 'perfil del conductor');
  ok(await C.app('PUT', '/api/conductor', { empresa: COOP, movil: '77', placa: 'FCA477', vehiculo: 'Chevrolet Spark', color: 'Amarillo' }, cond.token), 'registro del conductor');
  const ap = await panel('POST', `conductores/${cond.id}/estado`, { estado: 'aprobado', esperado: 'pendiente', motivo: 'Documentos al día (prueba 4A)' });
  prueba(ap.status === 200, `1 la gerente aprueba al conductor (${ap.status})`);
  const cc = await contexto('conductor', cond.token, { lat: PARQUE.lat + 0.0003, lng: PARQUE.lng });
  const pc = cc.p;
  await pc.goto(`${inst.urls.web}/taxicun/conductor/?real=1`);
  await pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 });
  await pc.click('[data-conectar]');
  await pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 });
  prueba(true, '1 el conductor queda en turno');
  await pc.waitForTimeout(2500);

  // ------------------------------------------------------------------ 2. pedido por teléfono
  if (conCompuerta) {
    const cuerpo = { nombre: LLAMANTE.nombre, celular: LLAMANTE.celular, origen: { lat: PARQUE.lat + 0.0003, lng: PARQUE.lng, titulo: 'Parque principal' }, tarifa: null, nota: 'Frente a la iglesia (prueba 4A)' };
    let r = await panel('POST', 'pedidos', cuerpo);
    if (r.status === 409 && r.cuerpo?.error === 'tarifa_cambiada') r = await panel('POST', 'pedidos', { ...cuerpo, tarifa: r.cuerpo.tarifa });
    prueba(r.status === 200 && r.cuerpo?.viajeId, `2 la gerente crea el pedido por teléfono (${r.status} ${r.cuerpo?.error || r.cuerpo?.viajeId || ''})`);
    const viajeId = r.cuerpo?.viajeId;
    prueba(Boolean(await pc.waitForSelector('.a-solicitud.a-abierta [data-pedido-central]', { timeout: 20000 }).catch(() => null)), '2 al conductor le llega «Pedido de la central»');
    const titulo = await pc.textContent('#a-sol-titulo').catch(() => '');
    prueba(titulo === 'Rosa' && !/verificado/.test(await pc.innerText('.a-sol-quien').catch(() => '')), `2 con el primer nombre de quien llamó y sin estrellas («${titulo}»)`);
    await foto(pc, '2-pedido-de-la-central');
    await pc.click('.a-solicitud [data-aceptar]');
    await vista(pc, 'hacia_origen');
    const href = await pc.getAttribute('[data-llamar-llamante]', 'href').catch(() => null);
    prueba(href === `tel:${LLAMANTE.celular}`, `2 «Llamar a Rosa» va al celular que anotó la central (${href})`);
    await pc.click('[data-llegue]');
    await vista(pc, 'en_origen');
    prueba((await pc.textContent('[data-llamante-confirmar]').catch(() => '')) === 'Confirma que es Rosa', '2 «Confirma que es Rosa»');
    await pc.click('[data-iniciar-central]');
    await vista(pc, 'en_viaje');
    prueba(true, '2 «Iniciar viaje» sin código');
    await pc.click('[data-terminar]');
    await pc.waitForSelector('.a-modal [name=valor]', { timeout: 8000 });
    await pc.fill('.a-modal [name=valor]', '8000');
    await tocarModal(pc, 'Terminar y cobrar');
    await vista(pc, 'cobrando');
    await pc.click('[data-efectivo]');
    await tocarModal(pc, 'Sí, recibí el pago');
    prueba(Boolean(await vista(pc, 'libre').catch(() => null)), '2 cobra y queda libre, sin calificar');
    const v = await hasta(async () => {
      const x = await panel('GET', `viajes/${viajeId}`);
      return x.status === 200 && /finalizado/.test(x.texto) ? x : null;
    }, 10000);
    prueba(Boolean(v) && /"pedidoCentral"\s*:\s*\{/.test(v?.texto || ''), `2 el panel lo ve finalizado y de la central (${v?.status ?? 'sin respuesta'})`);
  } else {
    prueba(true, '2 (sin la política 1.3 y el acuerdo no hay pedido por teléfono: se salta)');
  }

  // ------------------------------------------------------------------ 3. «Avisar a la central» del conductor
  await pc.click('[data-ayuda-barra]');
  await pc.waitForSelector('.a-modal-ayuda-c.a-abierto', { timeout: 8000 });
  const hayBoton = Boolean(await pc.$('.a-modal-ayuda-c button:has-text("Avisar a la central")'));
  prueba(hayBoton === conCompuerta, `3 «Avisar a la central» ${conCompuerta ? 'aparece' : 'no aparece (la cooperativa no lo recibe)'}`);
  if (hayBoton) {
    await tocarModal(pc, 'Avisar a la central', 'a-modal-ayuda-c');
    prueba(Boolean(await pc.waitForFunction(() => /Le avisamos a la central/.test(document.querySelector('.a-modal-sos-central')?.textContent || ''), null, { timeout: 15000 }).catch(() => null)), '3 «Le avisamos a la central de Cootransrural»');
    await foto(pc, '3-sos-conductor');
    const alerta = await hasta(async () => (await panel('GET', 'sos?estado=abiertas')).cuerpo?.alertas?.find((a) => a.quien === 'conductor' && String(a.movil) === '77'), 10000);
    prueba(Boolean(alerta), `3 el panel ve la alerta del conductor del móvil 77 (${alerta?.id ?? 'no'})`);
    if (alerta) {
      const at = await panel('POST', `sos/${alerta.id}/atender`, { nota: 'Se llamó al conductor: todo bien (prueba 4A)' });
      prueba(at.status === 200, `3 la gerente la atiende (${at.status})`);
    }
    await tocarModal(pc, 'Cerrar', 'a-modal-sos-central');
  } else {
    await tocarModal(pc, 'Cancelar', 'a-modal-ayuda-c');
  }

  // ------------------------------------------------------------------ 4. aviso a los conductores elegidos
  const av = await panel('POST', 'avisos', { para: 'conductores_elegidos', conductores: [cond.id], titulo: 'Reunión de la cooperativa', texto: 'Mañana a las 8 en la sede. Gracias.' });
  prueba(av.status === 200 && av.cuerpo?.estado === 'enviando', `4 la gerente manda un aviso (${av.status} ${av.cuerpo?.error || av.cuerpo?.estado || ''})`);
  const tarjeta = await pc.waitForFunction(() => document.querySelector('.a-modal-aviso-central .a-aviso-central-titulo')?.textContent === 'Reunión de la cooperativa', null, { timeout: 20000 }).catch(() => null);
  prueba(Boolean(tarjeta), '4 al conductor le sale la tarjeta «Aviso de Cootransrural»');
  await foto(pc, '4-aviso');
  if (tarjeta) await tocarModal(pc, 'Entendido', 'a-modal-aviso-central');
  const leidos = await hasta(async () => (await panel('GET', 'avisos')).cuerpo?.avisos?.find((a) => a.id === av.cuerpo?.id && a.leidos >= 1), 10000);
  prueba(Boolean(leidos), '4 «Entendido» lo deja leído (el panel lo cuenta)');

  // ------------------------------------------------------------------ 5. pasajero: SOS y la baja de los avisos
  const correoP = `f4a.pasajero.${Date.now().toString(36)}@correo.test`;
  const pas = await C.entrarApp(correoP);
  cuentas.push(pas.token);
  ok(await C.app('PATCH', '/api/yo', { nombre: 'Luz Marina Peña', celular: '3205550199' }, pas.token), 'perfil del pasajero');
  const cp = await contexto('pasajero', pas.token);
  const pp = cp.p;
  await pp.goto(`${inst.urls.web}/taxicun/?real=1`);
  await vista(pp, 'inicio', 30000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  await pp.waitForTimeout(1500);
  await pp.click('[data-frecuente] >> nth=0');
  await vista(pp, 'confirmar', 10000);
  await pp.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await pp.waitForTimeout(500);
  await pp.click('[data-pedir]');
  await vista(pp, 'buscando', 10000);
  await pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 });
  await pc.waitForTimeout(500);
  await pc.click('.a-solicitud [data-aceptar]');
  await vista(pp, 'asignado', 20000);
  prueba(true, '5 el pasajero tiene su taxi (asignado)');
  await pp.click('[data-sos] >> nth=0');
  await pp.waitForSelector('.a-modal-sos.a-abierto', { timeout: 8000 });
  const botonP = Boolean(await pp.$('.a-modal-sos button:has-text("Avisar a la central de Cootransrural")'));
  prueba(botonP === conCompuerta, `5 el SOS del pasajero ${conCompuerta ? 'ofrece' : 'no ofrece'} «Avisar a la central de Cootransrural»`);
  if (botonP) {
    await tocarModal(pp, 'Avisar a la central de Cootransrural', 'a-modal-sos');
    prueba(Boolean(await pp.waitForFunction(() => /Le avisamos a la central/.test(document.querySelector('.a-modal-sos-central')?.textContent || ''), null, { timeout: 15000 }).catch(() => null)), '5 «Le avisamos a la central de Cootransrural»');
    await foto(pp, '5-sos-pasajero');
    const alertaP = await hasta(async () => (await panel('GET', 'sos?estado=abiertas')).cuerpo?.alertas?.find((a) => a.quien === 'pasajero'), 10000);
    prueba(Boolean(alertaP) && alertaP.celular == null, `5 el panel ve la alerta del pasajero, sin su celular (${alertaP?.id ?? 'no'})`);
    if (alertaP) await panel('POST', `sos/${alertaP.id}/atender`, { nota: 'Se llamó a la pasajera: todo bien (prueba 4A)' });
    await tocarModal(pp, 'Cerrar', 'a-modal-sos-central');
  } else {
    await tocarModal(pp, 'Cancelar', 'a-modal-sos');
  }
  // La pasajera cancela (el conductor queda libre).
  await pp.click('[data-cancelar-viaje], [data-cancelar]').catch(() => {});
  await pp.waitForTimeout(800);
  if (await pp.$('.a-modal .a-opcion')) await tocarModal(pp, 'Cancelar servicio');
  // Ajustes → «Avisos de Cootransrural».
  await vista(pp, 'inicio', 15000).catch(() => {});
  await pp.click('[data-menu]');
  await pp.waitForSelector('.a-menu-item:has-text("Ajustes")', { timeout: 8000 });
  await pp.waitForTimeout(300);
  await pp.click('.a-menu-item:has-text("Ajustes")');
  const sw = '[data-avisos-cooperativa] [role=switch]';
  prueba(Boolean(await pp.waitForSelector(`[data-avisos-cooperativa]:not([hidden]) ${'[role=switch]'}`, { timeout: 10000 }).catch(() => null)), '5 en Ajustes: «Avisos de Cootransrural»');
  await pp.click(sw);
  const bajas = await hasta(async () => (await C.app('GET', '/api/yo/avisos', undefined, pas.token)).cuerpo?.bajas?.includes(COOP), 8000);
  prueba(Boolean(bajas), '5 apagarlo queda en el servidor (GET /api/yo/avisos)');
  await foto(pp, '5-ajustes-avisos');
  await pp.click(sw);
  prueba(Boolean(await hasta(async () => !(await C.app('GET', '/api/yo/avisos', undefined, pas.token)).cuerpo?.bajas?.includes(COOP), 8000)), '5 y se vuelve a encender');
  prueba(errores.length === 0, `sin errores de JavaScript en las apps${errores.length ? `: ${errores.join(' | ')}` : ''}`);
  await cp.ctx.close();
  await cc.ctx.close();
} catch (e) {
  prueba(false, `se detuvo: ${String(e.message).split('\n')[0]}`);
} finally {
  for (const t of cuentas) await C.app('DELETE', '/api/yo', undefined, t).catch(() => {});
  await nav.close();
}
console.log(fallas.length ? `\nFALLÓ: ${pasan} ✔, ${fallas.length} ✘` : `\nPASÓ: ${pasan} ✔ · capturas en ${SALIDA}`);
process.exit(fallas.length ? 1 : 0);
