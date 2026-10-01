// Prueba del diseño B «Verde Rosal»: recorre por la interfaz la app del pasajero
// (registro, pedido, viaje con conductor simulado, pago QR de prueba, calificación
// y Mis viajes) y la del conductor (ingreso, solicitud simulada, código, cobro con
// QR y calificación). Guarda capturas de cada pantalla.
//
// Uso: node pruebas/diseno-b.mjs [url_base] [--solo=pasajero|conductor]
//      (por defecto http://localhost:8772/; capturas en /tmp/cootrans/capturas/b/)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8772/').replace(/\/?$/, '/');
const SOLO = process.argv.find((a) => a.startsWith('--solo='))?.slice(7) || '';
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/b').replace(/\/?$/, '/');
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
const CELULAR = { width: 390, height: 844 };
const CHICO = { width: 360, height: 740 };

mkdirSync(DIR, { recursive: true });
const inicio = Date.now();
const errores = [];
const resultados = [];

function ok(condicion, mensaje) {
  resultados.push({ ok: Boolean(condicion), mensaje });
  console.log(`${condicion ? '✔' : '✘'} ${mensaje}`);
  if (!condicion) process.exitCode = 1;
}

function segundos() {
  return `${Math.round((Date.now() - inicio) / 1000)} s`;
}

// Los recursos externos (teselas, Nominatim, OSRM) pueden fallar por la red:
// eso no es un error de la app. Los errores de JavaScript sí cuentan.
function vigilar(pagina, nombre) {
  pagina.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    const url = m.location()?.url || '';
    const esRecurso = /Failed to load resource|net::ERR_|status of \d{3}/.test(texto);
    if (esRecurso && url && !url.startsWith(BASE)) return;
    errores.push(`[${nombre}] ${texto}${url ? ` (${url})` : ''}`);
  });
}

async function foto(pagina, nombre) {
  await pagina.screenshot({ path: `${DIR}${nombre}.png` });
}

// Captura a 360×740 y vuelve al tamaño normal.
async function fotoChica(pagina, nombre) {
  await pagina.setViewportSize(CHICO);
  await pagina.waitForTimeout(700);
  await foto(pagina, nombre);
  await pagina.setViewportSize(CELULAR);
  await pagina.waitForTimeout(400);
}

async function nuevoContexto(navegador, opciones = {}) {
  const ctx = await navegador.newContext({
    viewport: CELULAR,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    geolocation: ROSAL,
    permissions: ['geolocation'],
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    ...opciones,
  });
  await ctx.addInitScript(() => {
    // Sin relés MQTT públicos durante la prueba.
    localStorage.setItem('ct.envivo', 'no');
    // Registra cada aviso que aparece en pantalla.
    window.__avisos = [];
    new MutationObserver((cambios) => {
      for (const c of cambios) {
        for (const n of c.addedNodes) {
          if (n.nodeType === 1 && n.classList?.contains('vb-aviso')) window.__avisos.push(n.querySelector('b')?.textContent || '');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  return ctx;
}

// Cierra los avisos visibles (tocando su botón ×) para que la captura quede limpia.
async function cerrarAvisos(pagina) {
  for (const boton of await pagina.$$('.vb-aviso-x')) await boton.click({ timeout: 2000 }).catch(() => {});
  await pagina.waitForTimeout(350);
}

async function esperarMapa(pagina, selector, ms = 2500) {
  await pagina.waitForSelector(`${selector} .leaflet-tile-loaded`, { timeout: 12000 }).catch(() => {});
  await pagina.waitForTimeout(ms);
}

/* ================================================================== */
/* PASAJERO                                                            */
/* ================================================================== */
async function probarPasajero(navegador) {
  const ctx = await nuevoContexto(navegador);
  const pg = await ctx.newPage();
  vigilar(pg, 'pasajero');
  await pg.goto(`${BASE}app/?d=b`);

  // P1: bienvenida y registro obligatorio con SMS simulado
  await pg.waitForSelector('.vb-bienvenida', { timeout: 20000 });
  await pg.waitForSelector('.vb-bienv-escena .vb-foto.lista', { timeout: 10000 }).catch(() => {});
  ok(await pg.locator('.vb-bienv-escena .vb-foto.lista').count() === 1, 'foto de bienvenida cargada (ruta relativa)');
  await pg.waitForTimeout(600);
  await foto(pg, 'p01-bienvenida');
  ok(!(await pg.isVisible('.vb-pedir')), 'sin registro no se ve el botón de pedir');
  await pg.click('[data-accion="reg-empezar"]');
  await pg.click('form[data-form="registro"] button[type="submit"]');
  ok(await pg.isVisible('[data-error]:not(:empty)'), 'el registro valida los datos');
  ok(await pg.locator('input[name="nombre"][aria-invalid="true"]').count() === 1, 'el campo con problema queda marcado');
  await pg.fill('input[name="nombre"]', 'Oscar Bernal');
  await pg.fill('input[name="celular"]', '12345');
  await pg.click('form[data-form="registro"] button[type="submit"]');
  ok(/10 dígitos/.test(await pg.textContent('[data-error]')), 'rechaza un celular que no tiene 10 dígitos');
  await pg.fill('input[name="nombre"]', 'Oscar Bernal');
  await pg.fill('input[name="celular"]', '300 123 4567');
  await pg.fill('input[name="emerNombre"]', 'Mamá');
  await pg.fill('input[name="emerCelular"]', '3109876543');
  ok(await pg.locator('a[href="../privacidad/"]').count() > 0, 'enlace a la política de privacidad');
  await pg.click('form[data-form="registro"] button[type="submit"]');
  ok(await pg.isVisible('[data-error]:not(:empty)'), 'exige aceptar los términos');
  await pg.check('input[name="terminos"]');
  await foto(pg, 'p02-registro');
  await pg.click('form[data-form="registro"] button[type="submit"]');
  await pg.waitForSelector('[data-codigo-prueba]');
  const codigoSMS = (await pg.textContent('[data-codigo-prueba]')).trim();
  ok(/^\d{4}$/.test(codigoSMS), `código de prueba visible en pantalla (${codigoSMS})`);
  await pg.waitForTimeout(400);
  await foto(pg, 'p03-codigo-sms');
  await pg.fill('#vb-codigo-sms', codigoSMS);

  // P2: inicio con mapa, taxis moviéndose y dirección
  await pg.waitForSelector('.vb-inicio', { timeout: 10000 });
  await pg.waitForFunction(() => document.querySelectorAll('.vb-pedir-mapa .ct-taxi-marcador').length >= 2, null, { timeout: 20000 });
  ok(true, 'taxis cercanos en el mapa del inicio');
  await pg.waitForFunction(() => !/Buscando la dirección/.test(document.querySelector('[data-dir-titulo]')?.textContent || ''), null, { timeout: 15000 });
  ok(true, `dirección de recogida: ${(await pg.textContent('[data-dir-titulo]')).trim()}`);
  await esperarMapa(pg, '.vb-pedir-mapa', 3200);
  await cerrarAvisos(pg);
  await foto(pg, 'p04-inicio');
  await fotoChica(pg, 'p04-inicio-360x740');
  await pg.evaluate(() => document.querySelector('.vb-inicio').scrollTo(0, 620));
  await pg.waitForTimeout(400);
  await foto(pg, 'p05-inicio-mosaicos');
  await pg.evaluate(() => document.querySelector('.vb-inicio').scrollTo(0, 0));

  // Paso 1: recogida con pin fijo
  await pg.click('.vb-pedir .vb-btn-oro');
  await pg.waitForSelector('.vb-paso1 .vb-pin-fijo');
  await esperarMapa(pg, '.vb-mapa-grande', 1500);
  await foto(pg, 'p06-paso1-recogida');
  await pg.click('[data-accion="confirmar-recogida"]');

  // Paso 2: destino con búsqueda
  await pg.waitForSelector('.vb-paso2');
  await pg.waitForTimeout(400);
  await foto(pg, 'p07-paso2-destino');
  await pg.fill('[data-campo="busqueda"]', 'Tierra Grata');
  await pg.waitForSelector('[data-resultados] .vb-lugar');
  await pg.waitForTimeout(1800);
  await foto(pg, 'p08-paso2-busqueda');
  await pg.locator('[data-resultados] .vb-lugar', { hasText: 'Vía a Facatativá' }).first().click();

  // Paso 3: confirmar con tarifa, ruta y pago
  await pg.waitForSelector('.vb-paso3');
  await pg.waitForFunction(() => !document.querySelector('[data-tarifa-total] .vb-esqueleto'), null, { timeout: 15000 });
  const tarifa = (await pg.textContent('[data-tarifa-total]')).trim();
  ok(/\$\s?\d/.test(tarifa), `tarifa estimada visible (${tarifa})`);
  ok(await pg.isVisible('.vb-chip-ejemplo'), 'aviso de tarifa de ejemplo');
  await esperarMapa(pg, '.vb-mapa-medio', 1800);
  await foto(pg, 'p09-paso3-confirmar');
  await pg.click('[data-accion="cuando"][data-v="programar"]');
  ok(await pg.isVisible('.vb-desc-ok'), 'programar con 24 h muestra el −10 %');
  await pg.evaluate(() => document.querySelector('.vb-paso3 .vb-desliza').scrollTo(0, 99999));
  await pg.waitForTimeout(500);
  await foto(pg, 'p10-paso3-pago-programar');
  await pg.click('[data-accion="cuando"][data-v="ahora"]');
  await pg.click('[data-accion="pago"][data-metodo="qr"]');
  await pg.click('[data-accion="nota-rapida"] >> nth=0');
  await pg.waitForFunction(() => !/Calculando/.test(document.querySelector('[data-boton-pedir]')?.textContent || ''), null, { timeout: 15000 });
  await pg.click('[data-accion="pedir-taxi"]');

  // P5: buscando
  await pg.waitForSelector('.vb-seg.fase-buscando', { timeout: 20000 });
  ok(await pg.evaluate(() => {
    const r = document.querySelector('.vb-cancelar-busqueda')?.getBoundingClientRect();
    return Boolean(r && r.top >= 0 && r.bottom <= innerHeight);
  }), 'mientras busca, «Cancelar solicitud» se ve sin desplazar');
  await pg.waitForTimeout(1500);
  await foto(pg, 'p11-buscando');
  ok(true, `pedido enviado (${segundos()})`);

  // P6: asignado / en camino
  await pg.waitForSelector('.vb-seg.fase-asignado', { timeout: 45000 });
  await esperarMapa(pg, '.vb-seg-mapa', 2500);
  await foto(pg, 'p12-asignado');
  const codigoAbordaje = (await pg.locator('.vb-codigo-digitos').textContent()).trim();
  ok(/^\d{4}$/.test(codigoAbordaje), `código de abordaje visible (${codigoAbordaje})`);
  ok(await pg.isVisible('.vb-carne .vb-placa'), 'carné del conductor con placa');
  ok(await pg.locator('.vb-acciones a[href^="tel:"]').count() > 0, 'botón para llamar al conductor');
  ok(await pg.locator('.vb-acciones a[href*="wa.me"]').count() > 0, 'botón de WhatsApp');
  await fotoChica(pg, 'p12-asignado-360x740');
  await pg.evaluate(() => document.querySelector('.vb-seg-panel').scrollTo(0, 330));
  await pg.waitForTimeout(400);
  await foto(pg, 'p13-asignado-carne');
  await pg.click('.vb-sos-flotante');
  await pg.waitForSelector('.vb-hoja-sos');
  await pg.waitForTimeout(450);
  ok(await pg.locator('.vb-hoja-sos a[href="tel:123"]').count() === 1, 'SOS llama al 123');
  await foto(pg, 'p13b-sos');
  await pg.click('.vb-hoja [data-cerrar-hoja]');

  // P7: en la puerta
  await pg.waitForSelector('.vb-seg.fase-llego', { timeout: 90000 });
  await pg.waitForTimeout(1200);
  await foto(pg, 'p14-en-la-puerta');

  // P8: en viaje
  await pg.waitForSelector('.vb-seg.fase-en_viaje', { timeout: 30000 });
  await pg.waitForTimeout(4000);
  await foto(pg, 'p15-en-viaje');

  // P9: pagar (QR de prueba)
  await pg.waitForSelector('.vb-pagar', { timeout: 90000 });
  await pg.waitForTimeout(600);
  await foto(pg, 'p16-pagar');
  await fotoChica(pg, 'p16-pagar-360x740');
  await pg.click('.vb-otro-cel summary');
  await pg.locator('.vb-otro-cel').scrollIntoViewIfNeeded();
  ok(await pg.locator('.vb-otro-cel svg[aria-label="Código QR"]').count() === 1, 'QR para pagar desde otro celular');
  await pg.waitForTimeout(300);
  await foto(pg, 'p17-pagar-otro-celular');
  await pg.click('[data-accion="escanear"]');
  await pg.waitForSelector('[data-estado-camara].error', { timeout: 10000 }).catch(() => {});
  const camara = (await pg.textContent('[data-estado-camara]')) || '';
  ok(/cámara|https|permiso/.test(camara) && !/[A-Z][a-z]+ [a-z]+ not /.test(camara), `sin cámara, mensaje claro en español («${camara.trim().slice(0, 60)}…»)`);
  await foto(pg, 'p17b-sin-camara');
  await pg.click('.vb-hoja [data-cerrar-hoja]');
  await pg.click('[data-accion="billetera"][data-id="nequi"]');
  await pg.click('.vb-pago-qr [data-accion="simular-pago"]');

  // P10: calificar
  await pg.waitForSelector('.vb-calificar', { timeout: 10000 });
  await pg.waitForSelector('[data-calif-recibida]:not([hidden])', { timeout: 15000 });
  ok(true, 'se ve la calificación que dio el conductor');
  await foto(pg, 'p18-calificar');
  await pg.click('[data-accion="estrella"][data-n="5"]');
  await pg.click('[data-accion="etiqueta"][data-t="Amable"]');
  await pg.click('[data-accion="etiqueta"][data-t="Conduce seguro"]');
  await pg.fill('[data-campo="comentario"]', 'Muy buen servicio, gracias.');
  await foto(pg, 'p19-calificar-lleno');
  await pg.click('[data-accion="enviar-calificacion"]');
  await pg.waitForSelector('.vb-inicio', { timeout: 10000 });
  await esperarMapa(pg, '.vb-pedir-mapa', 2500);
  await foto(pg, 'p19b-inicio-despues-del-viaje');

  // P11: los avisos se vieron en pantalla
  const avisos = await pg.evaluate(() => window.__avisos);
  for (const t of ['¡Tu taxi va en camino!', 'Tu taxi está llegando', '¡Tu taxi está en la puerta!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)', '¡Gracias por viajar con Cootransrural!']) {
    ok(avisos.includes(t), `aviso en pantalla: «${t}»`);
  }

  // P12: Mis viajes y demás secciones
  await pg.click('.vb-pestana[data-pantalla="viajes"]');
  await pg.waitForSelector('.vb-viajes .vb-viaje');
  const viaje = await pg.locator('.vb-viajes .vb-viaje').first().textContent();
  ok(/Tierra Grata/.test(viaje) && /Finalizado/.test(viaje), 'el viaje aparece en Mis viajes');
  await cerrarAvisos(pg);
  await foto(pg, 'p20-mis-viajes');
  await pg.click('.vb-pestana[data-pantalla="tarifas"]');
  await pg.waitForSelector('.vb-tarifas');
  ok(await pg.locator('.vb-rutas li').count() >= 10, 'tabla de rutas visible');
  await cerrarAvisos(pg);
  await foto(pg, 'p21-tarifas');
  await pg.click('.vb-pestana[data-pantalla="perfil"]');
  await pg.waitForSelector('.vb-perfil');
  await cerrarAvisos(pg);
  await foto(pg, 'p22-perfil');
  await pg.click('[data-accion="ir"][data-pantalla="ajustes"]');
  await pg.waitForSelector('.vb-ajustes');
  await cerrarAvisos(pg);
  await foto(pg, 'p23-ajustes');
  await pg.click('[data-accion="volver"]');
  await pg.waitForSelector('.vb-perfil');
  await pg.click('[data-accion="ir"][data-pantalla="fidelidad"]');
  await pg.waitForSelector('.vb-tarjeta-fisica');
  ok((await pg.locator('.vb-tarjeta-fisica .vb-sello-viaje.lleno').count()) === 1, 'tarjeta de fidelidad con 1 sello');
  await foto(pg, 'p24-fidelidad');
  await pg.click('[data-accion="volver"]');
  await pg.click('[data-accion="ir"][data-pantalla="ayuda"]');
  await pg.waitForSelector('.vb-ayuda');
  await foto(pg, 'p25-ayuda');

  // Sin GPS: aviso del centro de El Rosal (con la sesión ya registrada)
  const estado = await ctx.storageState();
  const ctxSinGps = await navegador.newContext({ viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: [], storageState: estado, locale: 'es-CO' });
  await ctxSinGps.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const sinGps = await ctxSinGps.newPage();
  vigilar(sinGps, 'pasajero-sin-gps');
  await sinGps.goto(`${BASE}app/?d=b`);
  await sinGps.waitForSelector('.vb-inicio', { timeout: 25000 });
  ok(/Usamos el centro de El Rosal/.test(await sinGps.textContent('.vb-nota-gps')), 'aviso cuando no hay GPS');
  await esperarMapa(sinGps, '.vb-pedir-mapa', 1500);
  await foto(sinGps, 'p27-inicio-sin-gps');
  await ctxSinGps.close();

  // Vitrina (la app dentro de un iframe): llena todo, sin marco
  const ctxVitrina = await navegador.newContext({ viewport: { width: 430, height: 880 }, geolocation: ROSAL, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
  await ctxVitrina.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const vitrina = await ctxVitrina.newPage();
  vigilar(vitrina, 'pasajero-vitrina');
  await vitrina.goto(`${BASE}app/?d=b&vitrina=1`);
  await vitrina.waitForSelector('.vb-inicio', { timeout: 20000 });
  const radio = await vitrina.evaluate(() => getComputedStyle(document.querySelector('.vb-app')).borderTopLeftRadius);
  ok(radio === '0px', 'modo vitrina sin marco de celular');
  await ctxVitrina.close();

  // Inicio en computador (1280×800)
  const ctxPC = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: ROSAL, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
  await ctxPC.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const pc = await ctxPC.newPage();
  vigilar(pc, 'pasajero-pc');
  await pc.goto(`${BASE}app/?d=b`);
  await pc.waitForSelector('.vb-inicio', { timeout: 20000 });
  await esperarMapa(pc, '.vb-pedir-mapa', 3000);
  await foto(pc, 'p26-inicio-1280x800');
  await ctxPC.close();
  await ctx.close();
}

/* ================================================================== */
/* CONDUCTOR                                                           */
/* ================================================================== */
async function probarConductor(navegador) {
  const ctx = await nuevoContexto(navegador);
  const pg = await ctx.newPage();
  vigilar(pg, 'conductor');
  await pg.goto(`${BASE}conductor/?d=b`);

  // C1: ingreso
  await pg.waitForSelector('.vb-ingreso', { timeout: 20000 });
  ok(/023/.test(await pg.textContent('.vb-pista')), 'pista de la demo visible');
  await pg.waitForSelector('.vb-ingreso-cab .vb-foto.lista', { timeout: 10000 }).catch(() => {});
  ok(await pg.locator('.vb-ingreso-cab .vb-foto.lista').count() === 1, 'foto del conductor cargada (ruta relativa)');
  await pg.waitForTimeout(400);
  await foto(pg, 'c01-ingreso');
  await pg.fill('input[name="movil"]', '23');
  await pg.fill('#vb-pin', '1234');
  await pg.click('form[data-form="ingreso"] button[type="submit"]');

  // C2: inicio
  await pg.waitForSelector('.vb-c-servicios', { timeout: 10000 });
  await esperarMapa(pg, '.vb-c-mapa', 2000);
  await cerrarAvisos(pg);
  await foto(pg, 'c02-inicio-desconectado');
  await pg.click('[data-accion="conectar"]');
  await pg.waitForSelector('[data-accion="desconectar"]');
  await pg.waitForTimeout(500);
  await foto(pg, 'c03-en-linea');
  await pg.click('[data-accion="simular-solicitud"]');

  // C3: solicitud entrante
  await pg.waitForSelector('.vb-solicitud', { timeout: 45000 });
  await pg.waitForTimeout(1200);
  await foto(pg, 'c04-solicitud');
  await fotoChica(pg, 'c04-solicitud-360x740');
  await pg.click('.vb-solicitud [data-accion="aceptar"]');

  // C4: hacia el pasajero
  await pg.waitForSelector('.vb-c-viaje.fase-hacia_origen', { timeout: 15000 });
  await esperarMapa(pg, '.vb-c-mapa', 2000);
  await foto(pg, 'c05-hacia-pasajero');
  ok(await pg.locator('a[href*="google.com/maps/dir"]').count() > 0, 'navegar con Google Maps');
  ok(await pg.locator('a[href*="waze.com"]').count() > 0, 'navegar con Waze');
  await pg.waitForSelector('.vb-c-principal.resaltado', { timeout: 60000 });
  ok(true, `la conducción simulada llegó al punto (${segundos()})`);
  await foto(pg, 'c06-llegue-resaltado');
  await pg.click('.vb-c-principal');

  // C5: código de abordaje
  await pg.waitForSelector('.vb-c-viaje.fase-en_origen');
  const pista = (await pg.textContent('[data-pista-codigo]')).replace(/\D/g, '');
  ok(/^\d{4}$/.test(pista), `pista del código simulado (${pista})`);
  // Al completar los 4 dígitos se verifica solo (sin tocar el botón).
  await pg.fill('#vb-codigo-abordaje', pista === '0000' ? '1111' : '0000');
  await pg.waitForSelector('[data-error-codigo]:not(:empty)', { timeout: 5000 });
  await pg.waitForTimeout(400);
  ok(true, 'un código incorrecto muestra error');
  await foto(pg, 'c07-codigo-error');
  await pg.fill('#vb-codigo-abordaje', pista);
  await pg.waitForSelector('.vb-c-viaje.fase-en_viaje', { timeout: 15000 });

  // C6: en viaje
  await esperarMapa(pg, '.vb-c-mapa', 2500);
  await foto(pg, 'c08-en-viaje');
  await pg.waitForSelector('.vb-c-principal.resaltado', { timeout: 60000 });
  await pg.click('.vb-c-principal');

  // C7: cobro con QR
  await pg.waitForSelector('.vb-c-cobro', { timeout: 10000 });
  ok(await pg.locator('.vb-c-cobro .vb-c-qr .ct-breb-qr svg').count() === 1, 'QR Bre-B de cobro en pantalla');
  await pg.waitForTimeout(500);
  await foto(pg, 'c09-cobro-qr');
  await fotoChica(pg, 'c09-cobro-qr-360x740');

  // C8: pago recibido y calificación del pasajero
  await pg.waitForSelector('.vb-c-calificar', { timeout: 20000 });
  ok(/Pago/.test(await pg.textContent('.vb-c-pago-ok')), 'confirmación del pago');
  await foto(pg, 'c10-pago-recibido');
  await pg.click('[data-accion="estrella"][data-n="5"]');
  await pg.click('[data-accion="etiqueta"][data-t="Puntual"]');
  await foto(pg, 'c11-calificar-pasajero');
  await pg.click('[data-accion="enviar-calificacion"]');
  await pg.waitForSelector('.vb-c-servicios', { timeout: 10000 });
  await esperarMapa(pg, '.vb-c-mapa', 2500);
  const resumen = await pg.textContent('.vb-c-resumen');
  ok(/1/.test(resumen), 'resumen del día actualizado');
  await cerrarAvisos(pg);
  await foto(pg, 'c12-de-vuelta');

  const avisos = await pg.evaluate(() => window.__avisos);
  for (const t of ['Estás en línea', 'Nueva solicitud de servicio', 'Servicio asignado', 'Código incorrecto', 'Viaje iniciado']) ok(avisos.includes(t), `aviso en pantalla: «${t}»`);

  // C9: secciones
  await pg.click('.vb-pestana[data-pantalla="ganancias"]');
  await pg.waitForSelector('.vb-c-ganancias');
  await cerrarAvisos(pg);
  await foto(pg, 'c13-ganancias');
  await pg.click('.vb-pestana[data-pantalla="documentos"]');
  await pg.waitForSelector('.vb-c-documentos');
  ok(await pg.locator('.vb-documento').count() === 4, 'documentos del vehículo con semáforo');
  await cerrarAvisos(pg);
  await foto(pg, 'c14-documentos');
  await pg.click('.vb-pestana[data-pantalla="perfil"]');
  await pg.waitForSelector('.vb-c-perfil');
  await cerrarAvisos(pg);
  await foto(pg, 'c15-perfil');

  // C10: cancelar con motivos (nueva solicitud)
  await pg.click('.vb-pestana[data-pantalla="servicios"]');
  await pg.click('[data-accion="simular-solicitud"]');
  await pg.waitForSelector('.vb-solicitud', { timeout: 45000 });
  await pg.click('.vb-solicitud [data-accion="aceptar"]');
  await pg.waitForSelector('.vb-c-viaje.fase-hacia_origen', { timeout: 15000 });
  await pg.click('[data-accion="cancelar"]');
  await pg.waitForSelector('.vb-hoja .vb-motivos');
  await pg.waitForTimeout(500);
  await foto(pg, 'c16-cancelar-motivos');
  await pg.click('.vb-hoja [data-accion="confirmar-cancelar"]');
  await pg.waitForSelector('.vb-c-servicios', { timeout: 10000 });
  ok(true, 'servicio cancelado con motivo');

  // Solicitud que vence sin respuesta: la tarjeta se pone roja al final y desaparece con aviso.
  await pg.click('[data-accion="simular-solicitud"]');
  await pg.waitForSelector('.vb-solicitud', { timeout: 45000 });
  await pg.waitForSelector('.vb-solicitud.urgente', { timeout: 30000 });
  ok(true, 'la cuenta regresiva avisa cuando quedan pocos segundos');
  await pg.waitForSelector('.vb-solicitud', { state: 'detached', timeout: 15000 });
  await pg.waitForTimeout(300);
  ok((await pg.evaluate(() => window.__avisos)).includes('La solicitud venció'), 'aviso de solicitud vencida');

  // Inicio del conductor en computador (1280×800)
  const estado = await ctx.storageState();
  const ctxPC = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: ROSAL, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
  await ctxPC.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const pc = await ctxPC.newPage();
  vigilar(pc, 'conductor-pc');
  await pc.goto(`${BASE}conductor/?d=b`);
  await pc.waitForSelector('.vb-c-servicios', { timeout: 20000 });
  await esperarMapa(pc, '.vb-c-mapa', 2500);
  await foto(pc, 'c17-inicio-1280x800');
  await ctxPC.close();
  await ctx.close();
}

/* ================================================================== */
const navegador = await chromium.launch({ executablePath: EXE });
try {
  const tareas = [];
  if (SOLO !== 'conductor') tareas.push(probarPasajero(navegador).catch((e) => ok(false, `flujo del pasajero: ${e.message.split('\n').slice(0, 3).join(' ')}`)));
  if (SOLO !== 'pasajero') tareas.push(probarConductor(navegador).catch((e) => ok(false, `flujo del conductor: ${e.message.split('\n')[0]}`)));
  await Promise.all(tareas);
} finally {
  await navegador.close();
}
ok(errores.length === 0, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 6).join(' | ')}` : ''}`);
const fallos = resultados.filter((r) => !r.ok).length;
console.log(`\n${resultados.length - fallos}/${resultados.length} verificaciones bien · ${segundos()} · capturas en ${DIR}`);
