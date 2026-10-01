// Prueba del núcleo en Chromium sin pantalla: viaje simulado del pasajero,
// viaje simulado del conductor y pasajero ↔ conductor entre dos pestañas.
// Uso: node pruebas/probar-nucleo.mjs [url_base]   (por defecto http://localhost:8765/)
import { chromium } from 'playwright-core';
const BASE = process.argv[2] || 'http://localhost:8765/';
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
const navegador = await chromium.launch({ executablePath: EXE });
const ctx = await navegador.newContext({ geolocation: ROSAL, permissions: ['geolocation'] });
const errores = [];
async function pagina() {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  await p.goto(BASE + 'pruebas/nucleo.html');
  await p.waitForFunction(() => window.listo);
  return p;
}
const ok = (c, m) => { console.log((c ? '✔' : '✘') + ' ' + m); if (!c) process.exitCode = 1; };

// 1) Pasajero con conductor simulado
const a = await pagina();
const r1 = await a.evaluate(async () => {
  const { N } = window;
  localStorage.setItem('ct.envivo', 'no');
  N.perfil.registrarPasajero({ nombre: 'Prueba Pasajero', celular: '3001234567' });
  const p = await N.crearPasajero();
  window.p = p;
  const fases = [];
  const avisos = [];
  p.on('cambio', (e) => { if (fases.at(-1) !== e.fase) fases.push(e.fase); });
  p.on('aviso', (x) => avisos.push(x.titulo));
  const origen = { lat: 4.8526, lng: -74.2606, titulo: 'Parque Principal' };
  const destino = { lat: 4.8512, lng: -74.2739, titulo: 'Tierra Grata' };
  const cot = await p.cotizar({ origen, destino });
  await p.solicitar({ origen, destino, metodoPago: 'qr' });
  const t0 = Date.now();
  while (p.estado.fase !== 'pagar' && Date.now() - t0 < 150000) await new Promise((r) => setTimeout(r, 500));
  const url = p.urlCobroActual();
  const pago = p.pagarConQR(url);
  await new Promise((r) => setTimeout(r, 3500));
  const calif = p.estado.calificacionRecibida;
  p.calificar(5, { etiquetas: ['Amable'] });
  return { fases, avisos, cot: { total: cot.tarifa.total, km: cot.ruta?.km, aprox: cot.ruta?.aproximada }, url, pago, calif, hist: N.perfil.historialPasajero().length, taxis: p.estado.taxisCercanos.length, segs: Math.round((Date.now() - t0) / 1000) };
});
console.log(JSON.stringify(r1, null, 1));
ok(r1.fases.join(',') === 'buscando,asignado,llego,en_viaje,pagar,calificar,inicio', 'fases del pasajero completas');
ok(r1.pago.ok, 'pago por QR leído desde la URL de cobro');
ok(r1.calif === 5, 'el conductor simulado calificó al pasajero');
ok(r1.taxis >= 3, 'hay taxis circulando en el mapa');

// 2) Conductor con pasajero simulado
const b = await pagina();
const r2 = await b.evaluate(async () => {
  const { N } = window;
  localStorage.setItem('ct.envivo', 'no');
  N.perfil.ingresarConductor({ movil: '23', pin: '1234' });
  const c = await N.crearConductor();
  const fases = [];
  c.on('cambio', (e) => { const f = e.viaje?.fase || 'libre'; if (fases.at(-1) !== f) fases.push(f); });
  c.conectar();
  await c.simularSolicitud();
  const s = c.estado.solicitudes[0];
  await c.aceptar(s.viajeId);
  await new Promise((r) => c.on('llegada', r));
  c.llegue();
  const malo = await c.iniciar('0000');
  const bueno = await c.iniciar(c.estado.viaje.codigoSimulado);
  await new Promise((r) => c.on('llegada', r));
  const cobro = c.finalizar();
  const t0 = Date.now();
  while (c.estado.viaje?.fase !== 'calificar' && Date.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 300));
  const fasePago = c.estado.viaje?.fase;
  c.calificar(5);
  await new Promise((r) => setTimeout(r, 3000));
  return { fases, malo, bueno, cobro, fasePago, resumen: N.perfil.resumenDelDia(), hist: N.perfil.historialConductor()[0] };
});
console.log(JSON.stringify(r2, null, 1));
ok(r2.malo === false && r2.bueno === true, 'verificación del código de abordaje');
ok(r2.fasePago === 'calificar', 'el pasajero simulado pagó');
ok(r2.resumen.viajes >= 1 && r2.resumen.ganado > 0, 'resumen del día del conductor');

// 3) Pasajero ↔ conductor reales en dos pestañas (BroadcastChannel)
const c1 = await pagina();
const p1 = await pagina();
await c1.evaluate(async () => {
  const { N } = window;
  localStorage.setItem('ct.envivo', 'no');
  localStorage.setItem('ct.ajustes', JSON.stringify({ simulacion: 'real', gpsSimulado: true }));
  N.perfil.ingresarConductor({ movil: '7', pin: '1234' });
  const c = await N.crearConductor();
  window.c = c;
  c.conectar();
  c.on('cambio', (e) => {
    if (e.solicitudes.length && !e.viaje) c.aceptar(e.solicitudes[0].viajeId);
  });
  c.on('llegada', (f) => { if (c.estado.viaje?.fase === 'hacia_origen') c.llegue(); else if (c.estado.viaje?.fase === 'en_viaje') c.finalizar(); });
});
const r3 = await p1.evaluate(async () => {
  const { N } = window;
  const p = await N.crearPasajero();
  const fases = [];
  p.on('cambio', (e) => { if (fases.at(-1) !== e.fase) fases.push(e.fase); });
  await new Promise((r) => setTimeout(r, 1500));
  const reales = p.estado.conductoresReales;
  const origen = { lat: 4.8526, lng: -74.2606, titulo: 'Parque' };
  const destino = { lat: 4.8537, lng: -74.2679, titulo: 'Villa Mónica' };
  await p.solicitar({ origen, destino, metodoPago: 'efectivo' });
  window.codigo = p.estado.viaje.codigo;
  const t0 = Date.now();
  while (p.estado.fase !== 'llego' && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 300));
  window.p = p;
  return { fases, reales, conductor: p.estado.conductor?.movil, simulado: p.estado.viaje?.simulado, codigo: window.codigo };
});
ok(r3.conductor === '007' && r3.simulado === false, 'el conductor real de la otra pestaña tomó el servicio');
await c1.evaluate((codigo) => window.c.iniciar(codigo), r3.codigo);
const r4 = await p1.evaluate(async () => {
  const p = window.p;
  const t0 = Date.now();
  while (p.estado.fase !== 'pagar' && Date.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 300));
  const f = p.estado.fase;
  p.pagarEnEfectivo();
  return { fase: f, cobro: p.estado.cobro };
});
ok(r4.fase === 'pagar', 'el pasajero recibió el fin del viaje y el cobro');
await new Promise((r) => setTimeout(r, 800));
const r5 = await c1.evaluate(() => window.c.estado.viaje?.fase);
ok(r5 === 'calificar', 'el conductor recibió el pago en efectivo');
console.log('reales vistos por el pasajero:', r3.reales);
ok(errores.length === 0, 'sin errores en consola' + (errores.length ? ': ' + errores.slice(0, 5).join(' | ') : ''));
await navegador.close();
