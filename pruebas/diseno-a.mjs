// Prueba del diseño A «Ámbar Urbano» en Chromium sin pantalla.
//  1) Pasajero (390×844, táctil): registro por la interfaz, destino «Tierra Grata»,
//     viaje completo con el conductor simulado, pago «Simular pago con QR»,
//     calificación y el viaje en «Mis viajes». Además, un segundo pedido cancelado.
//  2) Conductor: ingreso, conexión, «Simular solicitud», aceptar deslizando,
//     «Llegué», código de abordaje, fin del viaje, QR de cobro, pago y calificación.
//  3) Capturas en /tmp/cootrans/capturas/a/ (también a 360×740 y escritorio 1280×800).
//  4) Falla si hay errores de JavaScript (salvo recursos externos caídos).
//  Además: sin cámara, sin GPS, solicitud que vence y rendimiento durante el viaje.
// Uso: node pruebas/diseno-a.mjs [url_base]   (por defecto http://localhost:8771/)
//      CAPTURAS=/otra/carpeta/ node pruebas/diseno-a.mjs …   (para guardar las capturas en otro lado)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:8771/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
const CAPTURAS = (process.env.CAPTURAS || '/tmp/cootrans/capturas/a/').replace(/\/?$/, '/');
mkdirSync(CAPTURAS, { recursive: true });

const t0 = Date.now();
const seg = () => `${Math.round((Date.now() - t0) / 1000)} s`;
const errores = [];
let fallas = 0;
const ok = (cond, msj) => {
  console.log(`${cond ? '✔' : '✘'} ${msj}`);
  if (!cond) fallas++;
};

// Errores de recursos externos (teselas, Nominatim, OSRM, relés) no cuentan.
const EXTERNOS = /tile\.openstreetmap|cartocdn|nominatim|project-osrm|mosquitto|emqx|hivemq|wss?:\/\//i;
function vigilar(pagina, nombre) {
  pagina.on('pageerror', (e) => errores.push(`[${nombre}] pageerror: ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    const url = m.location()?.url || '';
    const externo = (texto.startsWith('Failed to load resource') && url && !url.startsWith(BASE)) || EXTERNOS.test(texto) || EXTERNOS.test(url);
    if (!externo) errores.push(`[${nombre}] console.error: ${texto} ${url}`);
  });
}

// Guarda cada aviso en pantalla para poder verificarlo después.
const registrarAvisos = () => {
  localStorage.setItem('ct.envivo', 'no');
  window.__avisos = [];
  new MutationObserver((cambios) => {
    for (const c of cambios) {
      for (const n of c.addedNodes) {
        if (n.nodeType === 1 && n.classList?.contains('a-toast')) window.__avisos.push(n.querySelector('strong')?.textContent || '');
      }
    }
  }).observe(document, { childList: true, subtree: true });
};

const navegador = await chromium.launch({ executablePath: EXE });
const movil = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' };

async function foto(p, nombre) {
  await p.screenshot({ path: `${CAPTURAS}${nombre}.png` });
}
async function foto360(p, nombre) {
  await p.setViewportSize({ width: 360, height: 740 });
  await p.waitForTimeout(700);
  await foto(p, nombre);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(500);
}
const vista = (p, v, timeout = 60000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });

/* ------------------------------------------------------------------ */
/* 1) Pasajero                                                          */
/* ------------------------------------------------------------------ */
async function probarPasajero() {
  const ctx = await navegador.newContext(movil);
  await ctx.addInitScript(registrarAvisos);
  const p = await ctx.newPage();
  vigilar(p, 'pasajero');
  await p.goto(`${BASE}app/?d=a`);

  // Bienvenida y registro
  await p.waitForSelector('.a-bienvenida .a-bien-diapo');
  await p.waitForTimeout(1200);
  await foto(p, 'p01-bienvenida-1');
  await p.click('[data-siguiente]');
  await p.waitForTimeout(800);
  await foto(p, 'p02-bienvenida-2');
  await p.click('[data-siguiente]');
  await p.waitForTimeout(800);
  await foto(p, 'p03-bienvenida-3');
  await p.click('[data-siguiente]');
  await p.waitForSelector('form.a-registro');
  await p.click('button[type=submit]');
  ok((await p.textContent('[data-error]')).includes('nombre'), 'el registro exige el nombre');
  await p.fill('input[name=nombre]', 'Ana María Gómez');
  await p.fill('input[name=celular]', '300123456');
  await p.click('.a-check');
  await p.click('button[type=submit]');
  ok((await p.textContent('[data-error]')).includes('10 dígitos'), 'el registro valida el celular de 10 dígitos');
  await p.fill('input[name=celular]', '3001234567');
  await p.fill('input[name=contactoNombre]', 'Mamá');
  await p.fill('input[name=contactoCelular]', '3109876543');
  await foto(p, 'p04-registro');
  await p.click('button[type=submit]');
  await p.waitForSelector('[data-codigo-prueba]');
  await p.waitForTimeout(1100);
  await foto(p, 'p05-verificacion');
  const codigoSms = (await p.textContent('[data-codigo-prueba]')).trim();
  ok(/^\d{4}$/.test(codigoSms), `se muestra el código SMS de prueba (${codigoSms})`);
  await p.focus('.a-casillas input');
  await p.keyboard.type(codigoSms);
  await p.waitForSelector('[data-empezar]');
  await p.waitForTimeout(600);
  await foto(p, 'p06-registro-listo');
  await p.click('[data-empezar]');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('ct.pasajero'))?.nombre === 'Ana María Gómez'), 'el pasajero quedó registrado');

  // Inicio
  await vista(p, 'inicio', 20000);
  await p.waitForFunction(() => !document.querySelector('[data-origen-titulo]')?.textContent.includes('Buscando'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await foto(p, 'p07-inicio');
  ok((await p.$$('.ct-taxi-marcador')).length >= 3, 'hay taxis cercanos en el mapa');
  ok(await p.isVisible('.a-pin'), 'pin central fijo para ajustar la recogida');
  await foto360(p, 'p07b-inicio-360');
  await p.click('.a-hoja-asa');
  await p.waitForTimeout(700);
  await foto(p, 'p08-inicio-completa');
  await p.click('.a-hoja-asa');
  await p.waitForTimeout(500);

  // Destino
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto');
  await p.waitForTimeout(500);
  await foto(p, 'p09-buscar');
  await p.fill('[data-q]', 'Tierra Grata');
  await p.waitForSelector('.a-buscador .a-fila:has-text("Tierra Grata")');
  await p.waitForTimeout(2200);
  await foto(p, 'p10-resultados');
  await p.click('.a-buscador .a-fila:has-text("Tierra Grata")');

  // Confirmar
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(1500);
  await foto(p, 'p11-confirmar');
  ok(/\$\s?\d/.test(await p.textContent('[data-total]')), 'se ve la tarifa estimada');
  ok(await p.isVisible('.a-chip-ejemplo'), 'la tarifa dice que es de ejemplo');
  await foto360(p, 'p11b-confirmar-360');
  await p.click('[data-detalle]');
  await p.waitForTimeout(600);
  await foto(p, 'p12-confirmar-detalle');
  await p.click('[data-programar]');
  await p.waitForSelector('.a-descuento-chip', { timeout: 10000 });
  ok(true, 'programar con 24 h muestra el −10 %');
  await p.waitForTimeout(900);
  ok((await p.textContent('[data-programar-info]')).includes('Te recogemos el'), 'la fecha programada se lee en español');
  await foto(p, 'p13-programar');
  await p.click('[data-programar]');
  await p.waitForSelector('[data-pedir]:not([disabled])');
  await p.click('[data-metodo="qr"]');
  await p.fill('[data-nota]', 'Estoy en la portería');
  await p.click('[data-pedir]');

  // Viaje con el conductor simulado
  await vista(p, 'buscando', 15000);
  await p.waitForTimeout(1600);
  await foto(p, 'p14-buscando');
  await vista(p, 'asignado', 40000);
  await p.waitForTimeout(1500);
  await foto(p, 'p15-asignado');
  const codigo = await p.getAttribute('[data-codigo]', 'data-codigo');
  ok(/^\d{4}$/.test(codigo || ''), `código de abordaje visible (${codigo})`);
  ok(await p.isVisible('.a-placa'), 'placa del taxi visible');
  ok(await p.isVisible('.a-movil'), 'número de móvil visible');
  ok((await p.getAttribute('.a-acciones a[href^="tel:"]', 'href'))?.startsWith('tel:'), 'botón para llamar al conductor');
  await foto360(p, 'p15b-asignado-360');
  await p.click('.a-hoja-asa');
  await p.waitForTimeout(700);
  await foto(p, 'p16-asignado-completa');
  await p.click('[data-sos]');
  await p.waitForSelector('.a-modal-sos');
  ok(Boolean(await p.$('.a-modal-sos a[href="tel:123"]')), 'SOS llama a la Línea 123');
  await p.waitForTimeout(400);
  await foto(p, 'p17-sos');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  await p.click('.a-hoja-asa');
  await vista(p, 'llego', 60000);
  await p.waitForTimeout(1200);
  ok(await p.isVisible('[data-banner-puerta]') && (await p.textContent('[data-banner-puerta]')).includes('¡Tu taxi está en la puerta!'), 'alerta destacada «¡Tu taxi está en la puerta!» con móvil y placa');
  await foto(p, 'p18-llego');
  await vista(p, 'en_viaje', 30000);
  await p.waitForTimeout(1500);
  // Rendimiento: durante el viaje solo cambian textos y la barra, no se repinta la hoja.
  const rend = await p.evaluate(() => new Promise((listo) => {
    let nodos = 0;
    let cambios = 0;
    const o = new MutationObserver((cs) => { for (const c of cs) { cambios++; nodos += c.addedNodes.length + c.removedNodes.length; } });
    o.observe(document.querySelector('.a-hoja'), { childList: true, subtree: true, characterData: true, attributes: true });
    setTimeout(() => { o.disconnect(); listo({ nodos: nodos / 3, cambios: cambios / 3 }); }, 3000);
  }));
  ok(rend.nodos < 15, `en viaje la hoja no se repinta entera (${rend.nodos.toFixed(1)} nodos y ${rend.cambios.toFixed(1)} cambios por segundo)`);
  await foto(p, 'p19-en-viaje');
  await vista(p, 'pagar', 80000);
  await p.waitForTimeout(1200);
  await foto(p, 'p20-pagar');
  await foto360(p, 'p20b-pagar-360');
  await p.click('details[data-otro] summary');
  await p.waitForSelector('[data-qr-otro] svg');
  await p.waitForTimeout(500);
  await foto(p, 'p21-otro-celular');
  ok(true, 'QR para probar con otro celular');
  // Sin cámara (Chromium sin pantalla): mensaje claro y se sigue con el pago simulado.
  await p.click('[data-escanear]');
  await p.waitForSelector('.a-camara-error:not([hidden])', { timeout: 10000 });
  ok((await p.textContent('.a-camara-error')).includes('cámara'), 'si la cámara no abre, se explica y se ofrece seguir');
  await p.waitForTimeout(300);
  await foto(p, 'p21b-sin-camara');
  await p.click('.a-modal-camara .a-btn-primario');
  await p.waitForSelector('[data-billeteras]:not([hidden])');
  await p.click('.a-billetera:has-text("Nequi")');
  await p.waitForTimeout(400);
  await foto(p, 'p22-billeteras');
  await p.click('[data-pagar-qr]');
  await p.waitForSelector('.a-procesando');
  await p.waitForTimeout(350);
  await foto(p, 'p23-procesando');
  await vista(p, 'calificar', 10000);
  ok((await p.textContent('.a-pago-ok')).includes('Nequi'), 'pago de prueba con la billetera elegida');
  await p.waitForSelector('[data-recibida]:not([hidden])', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(700);
  ok(await p.isVisible('[data-recibida]'), 'se ve la calificación que dio el conductor');
  await foto(p, 'p24-calificar');
  await p.click('.a-estrellas [data-n="5"]');
  await p.click('[data-etiqueta="Amable"]');
  await p.click('[data-etiqueta="Conduce seguro"]');
  await p.fill('[data-comentario]', 'Muy buen servicio');
  await p.click('[data-enviar]');
  await vista(p, 'inicio', 10000);
  await p.waitForTimeout(1200);
  await foto(p, 'p25-fin');

  // Cada aviso se vio en pantalla (aviso flotante o, el de la puerta, el banner grande).
  const vistos = await p.evaluate(() => window.__avisos);
  for (const titulo of ['¡Tu taxi va en camino!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)']) {
    ok(vistos.includes(titulo), `aviso en pantalla: «${titulo}»`);
  }
  console.log(`   avisos vistos: ${vistos.join(' | ')}`);

  // Segundo pedido, cancelado con motivo.
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto');
  await p.click('.a-cat[data-cat="salud"]');
  await p.click('.a-buscador .a-fila:has-text("Puesto de Salud")');
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 15000);
  await p.click('[data-cancelar]');
  await p.waitForSelector('.a-opciones');
  await p.click('.a-opcion:has-text("Pedí por error")');
  await p.waitForTimeout(400);
  await foto(p, 'p26-cancelar');
  await p.click('.a-modal .a-btn-peligro');
  await vista(p, 'inicio', 10000);

  // Menú y secciones
  await p.click('[data-menu]');
  await p.waitForTimeout(600);
  await foto(p, 'p27-menu');
  await p.click('.a-menu-item:has-text("Mis viajes")');
  await p.waitForSelector('[data-lista-viajes]');
  await p.waitForTimeout(500);
  const lista = await p.textContent('[data-lista-viajes]');
  ok(lista.includes('Tierra Grata') && lista.includes('Finalizado'), 'el viaje aparece en Mis viajes como finalizado');
  ok(lista.includes('Cancelado'), 'el pedido cancelado aparece en Mis viajes');
  await foto(p, 'p28-mis-viajes');
  for (const [item, nombre] of [['Tarifas y rutas', 'p29-tarifas'], ['Promociones', 'p30-promociones'], ['Ajustes', 'p31-ajustes'], ['Ayuda', 'p32-ayuda'], ['Programados', 'p33-programados']]) {
    await p.click('.a-panel.a-abierto [data-cerrar]');
    await p.waitForTimeout(400);
    await p.click('[data-menu]');
    await p.waitForTimeout(500);
    await p.click(`.a-menu-item:has-text("${item}")`);
    await p.waitForTimeout(700);
    await foto(p, nombre);
  }
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click('[data-campana]');
  await p.waitForSelector('[data-lista-avisos]');
  await p.waitForTimeout(600);
  const historialAvisos = await p.textContent('[data-lista-avisos]');
  ok(['¡Tu taxi va en camino!', '¡Tu taxi está en la puerta!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)'].every((t) => historialAvisos.includes(t)), 'todos los avisos del viaje quedan en la campana');
  await foto(p, 'p34-avisos');
  console.log(`   pasajero listo (${seg()})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 2) Conductor                                                         */
/* ------------------------------------------------------------------ */
async function probarConductor() {
  const ctx = await navegador.newContext(movil);
  await ctx.addInitScript(registrarAvisos);
  const p = await ctx.newPage();
  vigilar(p, 'conductor');
  await p.goto(`${BASE}conductor/?d=a`);
  await p.waitForSelector('.a-ingreso');
  await p.waitForTimeout(1300);
  ok((await p.textContent('.a-ingreso')).includes('móvil 023, PIN 1234'), 'pista de ingreso de la demo');
  await p.fill('input[name=movil]', '023');
  await p.waitForTimeout(200);
  await p.keyboard.type('1234');
  await foto(p, 'c01-ingreso');
  await p.click('.a-ingreso button[type=submit]');
  await vista(p, 'libre', 15000);
  await p.waitForTimeout(2500);
  await foto(p, 'c02-inicio');
  await p.click('[data-conectar]');
  await p.waitForSelector('[data-conectar][aria-checked="true"]');
  await p.waitForTimeout(1200);
  ok(true, 'el conductor se conectó');
  await foto(p, 'c03-conectado');
  await foto360(p, 'c03b-conectado-360');

  await p.click('[data-simular]');
  // La solicitud de prueba consulta OSRM y Nominatim (servicios externos): puede tardar.
  await p.waitForSelector('.a-solicitud.a-abierta', { timeout: 45000 });
  await p.waitForTimeout(900);
  await foto(p, 'c04-solicitud');
  ok(await p.isVisible('.a-cuenta'), 'la solicitud tiene cuenta regresiva');
  await foto360(p, 'c04b-solicitud-360');
  // Aceptar deslizando el botón.
  const mango = await (await p.$('.a-deslizador-mango')).boundingBox();
  const pista = await (await p.$('.a-deslizador')).boundingBox();
  await p.mouse.move(mango.x + mango.width / 2, mango.y + mango.height / 2);
  await p.mouse.down();
  for (let i = 1; i <= 12; i++) await p.mouse.move(mango.x + mango.width / 2 + ((pista.width - mango.width) * i) / 12, mango.y + mango.height / 2);
  await p.mouse.up();
  await vista(p, 'hacia_origen', 15000);
  ok(true, 'aceptó la solicitud deslizando');
  await p.waitForTimeout(1500);
  await foto(p, 'c05-hacia-pasajero');
  ok(Boolean(await p.$('.a-nav a[href*="waze.com"]')), 'botón para navegar con Waze');
  await p.waitForSelector('[data-llegue].a-resaltar', { timeout: 60000 });
  ok(true, 'al llegar se resalta el botón «Llegué»');
  await foto(p, 'c06-llegaste');
  await p.click('[data-llegue]');
  await vista(p, 'en_origen', 10000);
  await p.waitForSelector('[data-msj]:not([hidden])', { timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(600);
  await foto(p, 'c07-codigo');
  await p.focus('.a-casillas input');
  await p.keyboard.type('0000');
  await p.waitForFunction(() => document.querySelector('[data-error]')?.textContent.includes('no coincide'), null, { timeout: 5000 });
  ok(true, 'un código errado muestra el error');
  await foto(p, 'c08-codigo-errado');
  await p.waitForTimeout(900);
  const codigo = (await p.textContent('[data-pista]')).trim();
  await p.focus('.a-casillas input');
  await p.keyboard.type(codigo);
  await vista(p, 'en_viaje', 10000);
  ok(true, `con el código correcto (${codigo}) arranca el viaje`);
  await p.waitForTimeout(2500);
  await foto(p, 'c09-en-viaje');
  await p.waitForSelector('[data-terminar].a-resaltar', { timeout: 60000 });
  await foto(p, 'c10-en-destino');
  await p.click('[data-terminar]');
  await vista(p, 'cobrando', 10000);
  await p.waitForTimeout(700);
  ok(Boolean(await p.$('[data-qr-cobro] svg')), 'se muestra el QR de cobro (svg)');
  await foto(p, 'c11-cobro');
  await foto360(p, 'c11b-cobro-360');
  await vista(p, 'calificar', 20000);
  await p.waitForTimeout(1000);
  ok((await p.textContent('.a-pago-recibido')).includes('$'), 'llega la confirmación del pago');
  await foto(p, 'c12-pago-recibido');
  await p.click('.a-estrellas [data-n="5"]');
  await p.click('[data-etiqueta="Puntual"]');
  await p.click('[data-enviar]');
  await vista(p, 'libre', 10000);
  await p.waitForTimeout(3000);
  await foto(p, 'c13-fin');
  ok((await p.textContent('[data-viajes]')).trim() === '1', 'el resumen del día suma el viaje');

  await p.click('[data-menu]');
  await p.waitForTimeout(600);
  await foto(p, 'c14-menu');
  const secciones = [['Ganancias', 'c15-ganancias'], ['Historial', 'c16-historial'], ['Documentos', 'c17-documentos'], ['Mi taxi', 'c18-mi-taxi'], ['Ajustes', 'c19-ajustes']];
  for (const [i, [item, nombre]] of secciones.entries()) {
    if (i > 0) {
      await p.click('.a-panel.a-abierto [data-cerrar]');
      await p.waitForTimeout(400);
      await p.click('[data-menu]');
      await p.waitForTimeout(500);
    }
    await p.click(`.a-menu-item:has-text("${item}")`);
    await p.waitForTimeout(700);
    await foto(p, nombre);
  }
  ok((await p.textContent('.a-panel.a-abierto')).includes('GPS simulado'), 'ajuste de GPS simulado');
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click('[data-campana]');
  await p.waitForTimeout(600);
  ok((await p.textContent('.a-panel.a-abierto')).includes('Nueva solicitud de servicio'), 'la nueva solicitud queda en los avisos de la campana');
  await foto(p, 'c20-avisos');
  console.log(`   conductor listo (${seg()})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3) Escritorio y vitrina                                              */
/* ------------------------------------------------------------------ */
async function probarEscritorio() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.envivo', 'no');
    localStorage.setItem('ct.pasajero', JSON.stringify({ id: 'p-escritorio', nombre: 'Laura Méndez', celular: '3115550000', calificacion: 5, verificado: true }));
  });
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(`${BASE}app/?d=a`);
  await vista(p, 'inicio', 20000);
  await p.waitForTimeout(3500);
  await foto(p, 'e01-escritorio-1280');
  ok(await p.isVisible('.a-escritorio'), 'en pantallas anchas se ve el panel con el QR');
  await p.setViewportSize({ width: 412, height: 860 });
  await p.goto(`${BASE}app/?d=a&vitrina=1`);
  await vista(p, 'inicio', 20000);
  await p.waitForTimeout(2500);
  const radio = await p.$eval('.a-app', (n) => getComputedStyle(n).borderRadius);
  ok(radio === '0px' && !(await p.isVisible('.a-escritorio')), 'en la vitrina llena el iframe sin marco');
  await foto(p, 'e02-vitrina');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 4) Casos borde: sin GPS y solicitud que vence                        */
/* ------------------------------------------------------------------ */
async function probarBordes() {
  // Sin permiso de ubicación: aviso de que se usa el centro de El Rosal.
  const { geolocation, permissions, ...sinGps } = movil;
  const ctx = await navegador.newContext(sinGps);
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.envivo', 'no');
    localStorage.setItem('ct.pasajero', JSON.stringify({ id: 'p-sin-gps', nombre: 'Doña Rosa Pérez', celular: '3115550000', calificacion: 5, verificado: true }));
  });
  const p = await ctx.newPage();
  vigilar(p, 'sin-gps');
  await p.goto(`${BASE}app/?d=a`);
  await vista(p, 'inicio', 30000);
  await p.waitForSelector('[data-aviso-gps]:not([hidden])', { timeout: 15000 });
  ok((await p.textContent('[data-aviso-gps]')).includes('centro de El Rosal'), 'sin GPS avisa que usa el centro de El Rosal');
  ok((await p.textContent('[data-nombre]')).trim() === 'Doña Rosa', 'el saludo conserva el «Doña»');
  await p.waitForTimeout(1500);
  await foto(p, 'b01-sin-gps');
  await ctx.close();

  // Conductor: una solicitud que nadie responde vence sola.
  const ctx2 = await navegador.newContext(movil);
  await ctx2.addInitScript(registrarAvisos);
  const c = await ctx2.newPage();
  vigilar(c, 'vence');
  await c.goto(`${BASE}conductor/?d=a`);
  await c.waitForSelector('.a-ingreso');
  await c.fill('input[name=movil]', '044');
  await c.keyboard.type('4321');
  await c.click('.a-ingreso button[type=submit]');
  await vista(c, 'libre', 15000);
  await c.click('[data-simular]');
  await c.waitForSelector('.a-solicitud.a-abierta', { timeout: 45000 });
  await c.waitForSelector('.a-solicitud.a-urgente', { timeout: 30000 });
  await foto(c, 'b02-solicitud-por-vencer');
  await c.waitForSelector('.a-solicitud', { state: 'detached', timeout: 20000 });
  await c.waitForTimeout(500);
  ok((await c.evaluate(() => window.__avisos)).includes('La solicitud venció'), 'la solicitud sin respuesta vence y se avisa');
  await ctx2.close();
}

await Promise.all([
  probarPasajero().catch((e) => { fallas++; console.log(`✘ pasajero: ${e.message}`); }),
  probarConductor().catch((e) => { fallas++; console.log(`✘ conductor: ${e.message}`); }),
  probarEscritorio().catch((e) => { fallas++; console.log(`✘ escritorio: ${e.message}`); }),
  probarBordes().catch((e) => { fallas++; console.log(`✘ bordes: ${e.message}`); }),
]);

ok(errores.length === 0, `sin errores de JavaScript${errores.length ? `:\n   ${errores.slice(0, 8).join('\n   ')}` : ''}`);
await navegador.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · ${fallas} fallas · ${seg()} · capturas en ${CAPTURAS}`);
process.exit(fallas ? 1 : 0);
