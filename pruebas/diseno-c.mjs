// Prueba del diseño C «Noche Neón» en Chromium sin pantalla.
//  1) Pasajero: registro por la interfaz, destino «Tierra Grata», confirmar,
//     viaje completo con el conductor simulado (verifica los avisos), pago con
//     «Simular pago con QR», calificación y viaje en «Mis viajes».
//  2) Conductor: ingreso, conectarse, «Simular solicitud», aceptar, «Llegué»,
//     código de abordaje (incorrecto y correcto), terminar, QR de cobro, pago y
//     calificación.
//  3) Capturas de cada pantalla en /tmp/cootrans/capturas/c/ (además 3 a 360×740
//     y el inicio a 1280×800).
//  4) Falla si hay errores de JavaScript (salvo recursos externos caídos).
//  5) Casos borde: GPS negado, celular escrito con espacios, cancelar en
//     «buscando», programar a +2 días (−10 %), recargar a mitad del viaje, pago
//     en efectivo, modo vitrina en un iframe, solicitud que vence y cancelar el
//     servicio desde el conductor. Mide además cuántos nodos se repintan por
//     segundo durante el viaje (no debe repintarse la pantalla completa).
// Uso: node pruebas/diseno-c.mjs [url_base]   (por defecto http://localhost:8773/)
//      CAPTURAS=/otra/carpeta/ node pruebas/diseno-c.mjs …   (cambia la carpeta)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:8773/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const CAPTURAS = (process.env.CAPTURAS || '/tmp/cootrans/capturas/c/').replace(/\/?$/, '/');
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
const MOVIL = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' };
mkdirSync(CAPTURAS, { recursive: true });

const t0 = Date.now();
const errores = [];
let fallos = 0;
const reloj = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(5)} s`;
const ok = (cond, msj) => {
  console.log(`${cond ? '✔' : '✘'} ${reloj()}  ${msj}`);
  if (!cond) fallos += 1;
};

// Errores de recursos externos (teselas, Nominatim, OSRM, relés): no son del diseño.
const EXTERNOS = /openstreetmap|cartocdn|nominatim|project-osrm|mosquitto|emqx|hivemq|arcgisonline|wa\.me/i;
function vigilar(pagina, quien) {
  pagina.on('pageerror', (e) => errores.push(`[${quien}] pageerror: ${e.message}`));
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    const texto = m.text();
    const local = url.startsWith(BASE) || /\/\/(localhost|127\.0\.0\.1)[:/]/.test(url);
    if (EXTERNOS.test(url) || EXTERNOS.test(texto)) return; // servicio externo caído
    if (/Failed to load resource|net::ERR_/i.test(texto) && url && !local) return;
    errores.push(`[${quien}] console.error: ${texto} ${url}`);
  });
}

async function captura(pagina, nombre, espera = 450) {
  await pagina.waitForTimeout(espera);
  await pagina.screenshot({ path: `${CAPTURAS}${nombre}.png` });
}

// Guarda los títulos de todos los avisos en pantalla (aunque desaparezcan).
async function escucharAvisos(pagina) {
  await pagina.waitForSelector('.c-avisos', { state: 'attached' });
  await pagina.evaluate(() => {
    window.__avisos = [];
    const caja = document.querySelector('.c-avisos');
    new MutationObserver((cambios) => {
      for (const c of cambios) for (const n of c.addedNodes) if (n.dataset?.titulo) window.__avisos.push(n.dataset.titulo);
    }).observe(caja, { childList: true });
  });
}
const avisos = (pagina) => pagina.evaluate(() => window.__avisos || []);

// Toca «Simular solicitud» y espera la tarjeta; si no llega, deja pistas del estado.
async function simularYEsperar(c, timeout = 25000) {
  await c.click('[data-accion="simular"]');
  await c.waitForSelector('.c-solicitud', { timeout }).catch(async (e) => {
    const estado = await c.evaluate(() => ({ avisos: (window.__avisos || []).join(' | '), boton: document.querySelector('[data-accion="simular"]')?.outerHTML.slice(0, 140), vista: document.querySelector('.c-app')?.dataset.vista }));
    console.log('   estado al fallar:', JSON.stringify(estado));
    throw e;
  });
}


// Cuenta durante 2,5 s los cambios del DOM dentro de las capas de interfaz
// (sin contar el mapa): si se repintara todo cada 0,5 s saldrían cientos de nodos.
async function medirRepintado(pagina, selectores) {
  return pagina.evaluate(async (sels) => {
    const capas = sels.map((s) => document.querySelector(s)).filter(Boolean);
    let cambios = 0;
    let nodosNuevos = 0;
    const obs = new MutationObserver((lista) => {
      for (const r of lista) {
        if (!capas.some((c) => c.contains(r.target))) continue;
        cambios += 1;
        for (const n of r.addedNodes) nodosNuevos += n.nodeType === 1 ? 1 + n.querySelectorAll('*').length : 0;
      }
    });
    obs.observe(document.querySelector('.c-app'), { subtree: true, childList: true, attributes: true, characterData: true });
    await new Promise((r) => setTimeout(r, 2500));
    obs.disconnect();
    return { cambios: cambios / 2.5, nodosNuevos: nodosNuevos / 2.5 };
  }, selectores);
}

// Pide un taxi desde el inicio tocando un atajo (sin destino si no hay atajo).
async function pedirDesdeAtajo(p, lugar, { efectivo = false } = {}) {
  await p.click(`.c-atajo:has-text("${lugar}")`);
  await p.waitForSelector('[data-vista="inicio-confirmar"]');
  await p.waitForFunction(() => /\$/.test(document.querySelector('[data-total]')?.textContent || ''), null, { timeout: 15000 });
  if (efectivo) await p.click('[data-pago="efectivo"]');
  await p.evaluate(() => document.querySelector('.c-tarjeta-confirmar').scrollTo(0, 9999));
  await p.click('.c-desliza-perilla');
  await p.waitForSelector('[data-vista="viaje-buscando"]', { timeout: 10000 });
}

const navegador = await chromium.launch({ executablePath: EXE });

/* ------------------------------------------------------------------ */
/* 1) Pasajero                                                        */
/* ------------------------------------------------------------------ */
async function probarPasajero() {
  const ctx = await navegador.newContext(MOVIL);
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const p = await ctx.newPage();
  vigilar(p, 'pasajero');
  await p.goto(`${BASE}app/?d=c`);
  await p.waitForSelector('.c-bienvenida', { timeout: 20000 });
  await escucharAvisos(p);
  ok((await p.locator('.c-pildora-busqueda').count()) === 0, 'P1 sin registro no se puede pedir (solo se ve la bienvenida)');
  await captura(p, 'p01-bienvenida', 2400);

  // Registro
  await p.click('[data-reg="a-datos"]');
  await p.fill('#c-reg-nombre', 'Laura Gómez');
  await p.fill('#c-reg-celular', '300 123 45');
  await p.click('form[data-form="datos"] button[type="submit"]');
  ok(await p.isVisible('[data-error]:not([hidden])'), 'P1 valida el celular de 10 dígitos');
  await p.fill('#c-reg-celular', '300 123 45 67');
  ok((await p.inputValue('#c-reg-celular')) === '300 123 4567', 'P1 el celular escrito con espacios no se corta (300 123 4567)');
  await captura(p, 'p02-registro-datos');
  await p.click('form[data-form="datos"] button[type="submit"]');
  await p.waitForSelector('[data-codigo-prueba]');
  const codigoSms = (await p.textContent('[data-codigo-prueba]')).trim();
  ok(/^\d{4}$/.test(codigoSms) && (await p.textContent('.c-sms-prueba')).includes('Código de prueba'), `P1 SMS simulado con código de prueba en pantalla (${codigoSms})`);
  await captura(p, 'p03-registro-codigo');
  await p.click('#c-reg-casillas .c-casilla >> nth=0');
  await p.keyboard.type(codigoSms);
  await p.waitForSelector('#c-reg-acepto', { state: 'attached' });
  await p.fill('#c-reg-cnombre', 'Mamá');
  await p.fill('#c-reg-ccelular', '3007654321');
  ok((await p.getAttribute('.c-check a', 'href')) === '../privacidad/', 'P1 enlace a ../privacidad/');
  ok(await p.isDisabled('[data-terminar]'), 'P1 hay que aceptar los términos');
  await p.click('.c-check-caja');
  await captura(p, 'p04-registro-seguridad');
  await p.click('[data-terminar]');

  // Inicio
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 15000 });
  await p.waitForFunction(() => !/Ubicando|Tu ubicación/.test(document.querySelector('[data-dir-titulo]')?.textContent || 'Ubicando'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelectorAll('.ct-taxi-marcador').length >= 3, null, { timeout: 15000 });
  ok(true, `P2 inicio con mapa, dirección «${(await p.textContent('[data-dir-titulo]')).trim()}» y ${await p.locator('.ct-taxi-marcador').count()} taxis cerca`);
  await captura(p, 'p05-inicio', 2500);

  // Destino
  await p.click('.c-pildora-busqueda');
  await p.waitForSelector('#c-q');
  ok((await p.locator('.c-categorias [data-cat]').count()) >= 5, 'P3 lugares frecuentes por categoría');
  await captura(p, 'p06-destino');
  await p.fill('#c-q', 'Tierra Grata');
  await p.waitForSelector('.c-fila-lugar:has-text("Tierra Grata")');
  await p.waitForTimeout(1800);
  await captura(p, 'p07-destino-resultados', 0);
  await p.click('.c-fila-lugar:has-text("Tierra Grata") >> nth=0');

  // Confirmar
  await p.waitForSelector('[data-vista="inicio-confirmar"]');
  await p.waitForFunction(() => /\$/.test(document.querySelector('[data-total]')?.textContent || ''), null, { timeout: 15000 });
  const tarifa = (await p.textContent('[data-total]')).trim();
  ok(true, `P4 tarifa estimada ${tarifa}, ${(await p.textContent('[data-km]')).trim()} y ${(await p.textContent('[data-min]')).trim()}`);
  await p.waitForFunction(() => document.querySelectorAll('.leaflet-overlay-pane path').length >= 2, null, { timeout: 10000 });
  ok(true, 'P4 ruta dibujada en el mapa');
  await captura(p, 'p08-confirmar', 1200);
  await p.click('.c-detalle-tarifa summary');
  await p.click('[data-accion="alternar-programar"]');
  await p.waitForFunction(() => document.querySelector('[data-detalle]')?.textContent.includes('10 %'), null, { timeout: 10000 });
  ok((await p.textContent('[data-programar-msg]')).includes('−10 %'), 'P4 programar con 24 h muestra −10 %');
  await p.evaluate(() => document.querySelector('.c-tarjeta-confirmar').scrollTo(0, 400));
  await captura(p, 'p09-confirmar-programar');
  await p.click('[data-accion="alternar-programar"]');
  await p.click('[data-pago="qr"]');
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('.c-tarjeta-confirmar').scrollTo(0, 9999));
  await p.click('.c-desliza-perilla');

  // Buscando → asignado → llegó → en viaje → pagar
  await p.waitForSelector('[data-vista="viaje-buscando"]', { timeout: 10000 });
  ok(await p.isVisible('.c-radar'), 'P5 buscando con radar animado');
  await captura(p, 'p10-buscando', 1200);
  await p.waitForSelector('[data-vista="viaje-asignado"]', { timeout: 40000 });
  await p.waitForTimeout(1500);
  const codigo = (await p.textContent('[data-codigo]')).replace(/\D/g, '');
  ok(/^\d{4}$/.test(codigo) && /^\d{3}$/.test((await p.textContent('.c-movil strong')).trim()), `P6 conductor asignado: móvil ${(await p.textContent('.c-movil strong')).trim()}, placa ${(await p.textContent('.c-placa-num')).trim()}, código ${codigo}`);
  ok((await p.getAttribute('.c-acciones-viaje a[href^="tel:"]', 'href')).startsWith('tel:') && (await p.getAttribute('.c-acciones-viaje a[href*="wa.me"]', 'href')).includes('wa.me'), 'P6 botones llamar y WhatsApp');
  await captura(p, 'p11-asignado', 600);
  await p.click('[data-accion="sos"]');
  await p.waitForSelector('.c-hoja-sos a[href="tel:123"]');
  await captura(p, 'p12-sos');
  await p.click('.c-hoja-sos [data-cerrar-hoja]');
  await p.waitForTimeout(350);
  await p.click('.c-tarjeta-conductor [data-accion="compartir"]');
  await p.waitForSelector('.c-texto-compartir');
  ok((await p.textContent('.c-texto-compartir')).includes('Placa'), 'P6 compartir viaje con móvil y placa');
  await captura(p, 'p13-compartir');
  await p.click('.c-hoja [data-cerrar-hoja]');
  await p.waitForSelector('[data-vista="viaje-llego"]', { timeout: 70000 });
  ok(await p.isVisible('.c-alerta-puerta'), 'P7 alerta «Tu taxi está en la puerta»');
  await captura(p, 'p14-llego', 900);
  await p.waitForSelector('[data-vista="viaje-en_viaje"]', { timeout: 30000 });
  await p.waitForTimeout(800);
  const repintado = await medirRepintado(p, ['.c-contenido', '.c-cabecera']);
  ok(repintado.nodosNuevos < 4, `Rendimiento en viaje: ${repintado.cambios.toFixed(1)} cambios/s en la interfaz y ${repintado.nodosNuevos.toFixed(1)} nodos nuevos/s (sin repintar la pantalla)`);
  ok(await p.isVisible('.c-progreso-viaje'), 'P8 en viaje con progreso y ETA');
  await captura(p, 'p15-en-viaje', 0);
  await p.waitForSelector('[data-vista="viaje-pagar"]', { timeout: 80000 });
  await captura(p, 'p16-pagar', 900);
  await p.click('[data-otro-celular] summary');
  await p.waitForSelector('[data-qr-otro] svg');
  ok(true, 'P9 QR para probar con otro celular');
  await p.evaluate(() => document.querySelector('.c-tarjeta-pagar .c-desplazable').scrollTo(0, 9999));
  await captura(p, 'p17-pagar-otro-celular');
  await p.click('[data-otro-celular] summary');
  await p.click('.c-tarjeta-pagar [data-accion="escanear"]');
  const camara = await p.waitForSelector('.c-escaner-estado.c-error, .c-escaner-estado.c-ok', { timeout: 10000 }).then(() => true).catch(() => false);
  ok(camara, 'P9 escáner: si la cámara falla, mensaje claro y se puede seguir');
  await captura(p, 'p18-escaner');
  await p.click('.c-hoja-escaner [data-cerrar-hoja]');
  await p.waitForTimeout(350);
  await p.click('.c-tarjeta-pagar [data-accion="simular-pago"]');
  await p.waitForSelector('.c-billetera');
  await captura(p, 'p19-billeteras');
  await p.click('.c-billetera:has-text("Nequi")');
  await captura(p, 'p20-procesando', 300);

  // Calificar
  await p.waitForSelector('[data-vista="viaje-calificar"]', { timeout: 10000 });
  await p.waitForSelector('[data-calif-recibida]:not([hidden])', { timeout: 10000 });
  ok(true, 'P10 se ve la calificación que dio el conductor');
  await p.click('.c-estrella[data-estrella="5"]');
  await p.click('[data-etiqueta="Amable"]');
  await p.click('[data-etiqueta="Conduce seguro"]');
  await p.fill('#c-comentario', 'Muy buen servicio, gracias.');
  await captura(p, 'p21-calificar');
  await p.click('[data-accion="enviar-calificacion"]');
  await p.waitForSelector('[data-vista="inicio-recogida"]', { timeout: 10000 });

  const vistos = await avisos(p);
  for (const t of ['¡Tu taxi va en camino!', '¡Tu taxi está en la puerta!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)', '¡Gracias por viajar con Cootransrural!']) ok(vistos.includes(t), `P11 aviso en pantalla: «${t}»`);
  console.log('   avisos vistos:', vistos.join(' | '));

  // Secciones
  await p.click('.c-nav [data-tab="viajes"]');
  await p.waitForSelector('[data-vista="tab-viajes"]');
  const fila = p.locator('.c-viaje-item[data-estado="finalizado"]').first();
  ok((await fila.textContent()).includes('Tierra Grata') && (await fila.textContent()).includes('Finalizado'), 'P12 el viaje aparece en Mis viajes');
  await captura(p, 'p22-mis-viajes', 2500);
  await p.click('.c-nav [data-tab="billetera"]');
  await p.waitForSelector('.c-fidelidad');
  ok((await p.textContent('.c-pagos')).includes('Tierra Grata'), 'Billetera muestra el pago de prueba');
  await captura(p, 'p23-billetera');
  await p.click('.c-nav [data-tab="perfil"]');
  await p.waitForSelector('.c-pantalla-perfil');
  await captura(p, 'p24-perfil');
  await p.click('[data-sub="tarifas"]');
  await p.waitForSelector('.c-tabla tbody tr');
  ok((await p.locator('.c-tabla tbody tr').count()) >= 10, 'P12 tabla de rutas y reglas de tarifas (ejemplo)');
  await captura(p, 'p25-tarifas');
  await p.click('[data-accion="volver-perfil"]');
  await p.click('[data-sub="ajustes"]');
  await p.waitForSelector('.c-disenos');
  await captura(p, 'p26-ajustes');
  await p.click('[data-accion="volver-perfil"]');
  await p.click('[data-sub="ayuda"]');
  await p.waitForSelector('.c-central');
  await captura(p, 'p27-ayuda');
  ok((await p.textContent('[data-conexion]')).includes('Solo este equipo'), 'P13 indicador de conexión «Solo este equipo»');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 2) Conductor                                                       */
/* ------------------------------------------------------------------ */
async function probarConductor() {
  const ctx = await navegador.newContext(MOVIL);
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const c = await ctx.newPage();
  vigilar(c, 'conductor');
  await c.goto(`${BASE}conductor/?d=c`);
  await c.waitForSelector('.c-ingreso', { timeout: 20000 });
  ok((await c.textContent('.c-pista')).includes('móvil 023, PIN 1234'), 'C1 pista de ingreso para la demo');
  await captura(c, 'c01-ingreso', 2200);
  await c.fill('#c-movil', '099');
  await c.fill('#c-pin', '1234');
  await c.click('.c-ingreso-form button[type="submit"]');
  ok(await c.isVisible('.c-ingreso-form [data-error]:not([hidden])'), 'C1 valida el número de móvil (001–052)');
  await c.fill('#c-movil', '023');
  await c.click('.c-ingreso-form button[type="submit"]');
  await c.waitForSelector('.c-tablero');
  await escucharAvisos(c);
  ok((await c.textContent('[data-gps]')).includes('GPS'), `C2 indicador ${(await c.textContent('[data-gps]')).trim()}`);
  await captura(c, 'c02-tablero', 2600);
  await c.click('[data-accion="encender"]');
  await c.waitForSelector('[data-accion="encender"][aria-pressed="true"]');
  ok(true, 'C2 conectado (botón de encendido)');
  await captura(c, 'c03-en-linea', 900);
  await simularYEsperar(c, 25000);
  const seg1 = Number(await c.textContent('[data-seg]'));
  await c.waitForTimeout(1300);
  const seg2 = Number(await c.textContent('[data-seg]'));
  ok(seg2 < seg1, `C3 solicitud con cuenta regresiva (${seg1} → ${seg2} s)`);
  await captura(c, 'c04-solicitud', 200);
  await c.click('.c-solicitud [data-accion="aceptar"]');
  await c.waitForSelector('[data-vista="viaje-hacia_origen"]', { timeout: 15000 });
  ok((await c.getAttribute('.c-acciones-viaje a[href*="google.com/maps"]', 'href')) && (await c.getAttribute('.c-acciones-viaje a[href*="waze"]', 'href')), 'C4 navegar con Google Maps y Waze');
  await captura(c, 'c05-hacia-pasajero', 2500);
  await c.waitForSelector('.c-btn-llegue.c-resaltado', { timeout: 60000 });
  ok(true, 'C4 al llegar se resalta «Llegué»');
  await captura(c, 'c06-llegada', 300);
  await c.click('[data-accion="llegue"]');
  await c.waitForSelector('#c-codigo .c-casilla');
  await c.waitForSelector('[data-mensaje]:not([hidden])', { timeout: 10000 }).catch(() => {});
  await captura(c, 'c07-codigo', 600);
  const codigo = (await c.textContent('[data-codigo-simulado]')).trim();
  const malo = String((Number(codigo) + 1) % 10000).padStart(4, '0');
  await c.click('#c-codigo .c-casilla >> nth=0');
  await c.keyboard.type(malo);
  await c.waitForSelector('[data-error]:not([hidden])');
  ok(true, 'C5 código incorrecto → error');
  await captura(c, 'c08-codigo-incorrecto', 150);
  await c.waitForTimeout(700);
  await c.click('#c-codigo .c-casilla >> nth=0');
  await c.keyboard.type(codigo);
  await c.waitForSelector('[data-vista="viaje-en_viaje"]', { timeout: 10000 });
  ok(true, `C5 código correcto (${codigo}) → viaje iniciado`);
  await captura(c, 'c09-en-viaje', 3000);
  await c.waitForSelector('.c-btn-terminar.c-resaltado', { timeout: 70000 });
  await c.click('[data-accion="terminar"]');
  await c.waitForSelector('.c-qr-breb .ct-breb-qr svg');
  ok((await c.locator('.c-qr-breb .ct-breb-qr svg rect').count()) > 50, 'C7 QR Bre-B de cobro (svg)');
  await captura(c, 'c10-cobro-qr', 700);
  await c.waitForSelector('[data-vista="viaje-calificar"]', { timeout: 20000 });
  ok((await c.textContent('.c-pago-ok')).includes('$'), `C7 pago recibido: ${(await c.textContent('.c-pago-ok')).replace(/\s+/g, ' ').trim()}`);
  await captura(c, 'c11-pago-recibido', 600);
  await c.click('.c-estrella[data-estrella="5"]');
  await c.click('[data-etiqueta="Puntual"]');
  await c.click('[data-accion="calificar"]');
  await c.waitForSelector('[data-vista="tab-tablero"]', { timeout: 10000 });
  await c.waitForFunction(() => document.querySelector('[data-viajes]')?.textContent === '1', null, { timeout: 8000 });
  ok(true, 'C8 calificó al pasajero y el resumen del día suma 1 viaje');
  await captura(c, 'c12-tablero-final', 2500);
  await c.click('.c-dock [data-tab="ganancias"]');
  await c.waitForSelector('.c-reparto');
  await captura(c, 'c13-ganancias', 1200);
  await c.click('.c-dock [data-tab="historial"]');
  await c.waitForSelector('.c-pantalla-historial .c-viaje-item');
  ok(true, 'C9 historial con el servicio');
  await captura(c, 'c14-historial');
  await c.click('.c-dock [data-tab="perfil"]');
  await c.waitForSelector('.c-mi-taxi');
  await captura(c, 'c15-mi-taxi');
  await c.click('[data-sub="documentos"]');
  await c.waitForSelector('.c-documento');
  ok((await c.locator('.c-documento .c-semaforo').count()) === 4, 'C9 documentos con semáforo');
  await captura(c, 'c16-documentos');
  await c.click('[data-accion="volver-taxi"]');
  await c.click('[data-sub="ajustes"]');
  await c.waitForSelector('[data-accion="gps"]');
  await captura(c, 'c17-ajustes');
  const vistos = await avisos(c);
  ok(vistos.includes('Nueva solicitud de servicio') && vistos.includes('Viaje iniciado'), 'Avisos del conductor en pantalla');
  console.log('   avisos del conductor:', vistos.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3) Pantallas pequeñas (360×740) y escritorio (1280×800)            */
/* ------------------------------------------------------------------ */
const PASAJERO_LISTO = () => {
  localStorage.setItem('ct.envivo', 'no');
  if (!localStorage.getItem('ct.pasajero')) localStorage.setItem('ct.pasajero', JSON.stringify({ id: 'p-prueba', nombre: 'Andrea Suárez', celular: '3105550000', calificacion: 5 }));
};

async function probarPequena() {
  const ctx = await navegador.newContext({ ...MOVIL, viewport: { width: 360, height: 740 } });
  await ctx.addInitScript(PASAJERO_LISTO);
  const p = await ctx.newPage();
  vigilar(p, 'pequeña');
  await p.goto(`${BASE}app/?d=c`);
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 20000 });
  await captura(p, 's01-inicio-360', 3000);
  await p.click('.c-atajo:has-text("Tierra Grata")');
  await p.waitForSelector('[data-vista="inicio-confirmar"]');
  await p.waitForFunction(() => /\$/.test(document.querySelector('[data-total]')?.textContent || ''), null, { timeout: 15000 });
  await captura(p, 's02-confirmar-360', 1200);
  // Deslizar de verdad la perilla para pedir.
  await p.evaluate(() => document.querySelector('.c-tarjeta-confirmar').scrollTo(0, 9999));
  const caja = await p.locator('.c-desliza-perilla').boundingBox();
  const pista = await p.locator('.c-desliza').boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  for (let x = 0; x <= pista.width; x += 30) await p.mouse.move(caja.x + caja.width / 2 + x, caja.y + caja.height / 2);
  await p.mouse.up();
  await p.waitForSelector('[data-vista="viaje-buscando"]', { timeout: 10000 });
  ok(true, 'Deslizar para pedir funciona arrastrando');
  await p.waitForSelector('[data-vista="viaje-asignado"]', { timeout: 40000 });
  await captura(p, 's03-asignado-360', 2000);
  await p.click('[data-accion="cancelar-viaje"]');
  await p.click('[data-accion="motivo"] >> nth=0');
  await p.waitForSelector('[data-vista="inicio-recogida"]', { timeout: 10000 });
  ok(true, 'Cancelar con motivo vuelve al inicio');
  await ctx.close();
}

async function probarEscritorio() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.addInitScript(PASAJERO_LISTO);
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(`${BASE}app/?d=c`);
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 20000 });
  await captura(p, 'd01-inicio-1280', 3500);
  const ancho = await p.evaluate(() => document.querySelector('.c-app').getBoundingClientRect().width);
  ok(ancho <= 430, `En pantalla ancha la app va en una columna tipo celular (${Math.round(ancho)} px)`);
  const c = await ctx.newPage();
  vigilar(c, 'escritorio-conductor');
  await c.goto(`${BASE}conductor/?d=c`);
  await c.waitForSelector('.c-ingreso', { timeout: 20000 });
  await captura(c, 'd02-conductor-1280', 2200);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 5) Casos borde                                                     */
/* ------------------------------------------------------------------ */
async function probarGpsNegado() {
  const ctx = await navegador.newContext({ ...MOVIL, permissions: [] });
  await ctx.addInitScript(PASAJERO_LISTO);
  const p = await ctx.newPage();
  vigilar(p, 'gps-negado');
  await p.goto(`${BASE}app/?d=c`);
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 20000 });
  await p.waitForSelector('[data-sin-gps]:not([hidden])', { timeout: 10000 });
  ok((await p.textContent('[data-sin-gps]')).includes('Usamos el centro de El Rosal'), 'P2 sin GPS: «Usamos el centro de El Rosal; mueve el mapa…»');
  await captura(p, 'e01-sin-gps', 1500);
  await ctx.close();
}

async function probarBordesPasajero() {
  const ctx = await navegador.newContext(MOVIL);
  await ctx.addInitScript(PASAJERO_LISTO);
  const p = await ctx.newPage();
  vigilar(p, 'bordes-pasajero');
  await p.goto(`${BASE}app/?d=c`);
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 20000 });
  await escucharAvisos(p);
  // Cancelar mientras busca: no debe entrar luego un conductor simulado.
  await pedirDesdeAtajo(p, 'Parque Principal');
  await p.click('[data-accion="cancelar-viaje"]');
  await p.click('[data-accion="motivo"] >> nth=2');
  await p.waitForSelector('[data-vista="inicio-recogida"]', { timeout: 8000 });
  await p.waitForTimeout(6500);
  ok((await p.getAttribute('.c-app', 'data-vista')) === 'inicio-recogida', 'Cancelar en «buscando» vuelve al inicio y no llega ningún taxi');
  // Programar a +2 días.
  await p.click('.c-atajo:has-text("Tierra Grata")');
  await p.waitForSelector('[data-vista="inicio-confirmar"]');
  await p.click('[data-accion="alternar-programar"]');
  const fecha = await p.evaluate(() => {
    const d = new Date(Date.now() + 2 * 86400000);
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T09:30`;
  });
  await p.fill('#c-fecha', fecha);
  await p.dispatchEvent('#c-fecha', 'change');
  await p.waitForFunction(() => document.querySelector('[data-detalle]')?.textContent.includes('10 %'), null, { timeout: 10000 });
  ok((await p.textContent('[data-programar-msg]')).includes('−10 %'), 'Programar a +2 días aplica el −10 %');
  await p.evaluate(() => document.querySelector('.c-tarjeta-confirmar').scrollTo(0, 9999));
  await p.click('.c-desliza-perilla');
  await p.waitForSelector('[data-vista="tab-viajes"] .c-programado', { timeout: 8000 });
  ok((await p.textContent('.c-programado')).includes('Ahorras'), 'El viaje programado aparece en «Programados» con su ahorro');
  await captura(p, 'e02-programados', 600);
  await p.click('.c-nav [data-tab="viajes"]');
  await p.waitForSelector('[data-accion="viajes-vista"][data-vista="historial"][aria-selected="true"]');
  ok((await p.locator('.c-viaje-item[data-estado="cancelado"]').count()) >= 1, 'El viaje cancelado aparece en «Mis viajes»');
  // Recargar a mitad del viaje (simulado): el núcleo lo reinicia y se avisa.
  await p.click('.c-nav [data-tab="inicio"]');
  await pedirDesdeAtajo(p, 'Parque Principal', { efectivo: true });
  await p.waitForSelector('[data-vista="viaje-asignado"]', { timeout: 40000 });
  await p.reload();
  await p.waitForSelector('[data-vista="inicio-recogida"] .c-tarjeta-inicio', { timeout: 20000 });
  await p.waitForSelector('.c-aviso[data-titulo="Tu viaje de prueba se reinició"]', { timeout: 5000 });
  ok(true, 'Recargar en «asignado» vuelve al inicio con un aviso claro');
  // Otro viaje hasta pagar, recargar en «pagar» y pagar en efectivo.
  await pedirDesdeAtajo(p, 'Parque Principal', { efectivo: true });
  await p.waitForSelector('[data-vista="viaje-pagar"]', { timeout: 90000 });
  await p.reload();
  await p.waitForSelector('[data-vista="viaje-pagar"] .c-tarjeta-pagar', { timeout: 20000 });
  ok(true, 'Recargar en «pagar» conserva el cobro');
  await p.click('.c-tarjeta-pagar [data-accion="efectivo"]');
  await p.waitForSelector('[data-vista="viaje-calificar"]', { timeout: 10000 });
  ok((await p.textContent('.c-pago-ok')).includes('efectivo'), 'P9 pagar en efectivo');
  await captura(p, 'e03-efectivo', 600);
  await p.click('[data-accion="enviar-calificacion"]');
  ok((await p.getAttribute('.c-app', 'data-vista')) === 'viaje-calificar', 'Enviar sin estrellas pide elegirlas');
  await p.click('[data-accion="omitir-calificacion"]');
  await p.waitForSelector('[data-vista="inicio-recogida"]', { timeout: 8000 });
  await ctx.close();
}

async function probarVitrina() {
  const ctx = await navegador.newContext({ viewport: { width: 900, height: 900 }, geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.addInitScript(PASAJERO_LISTO);
  const p = await ctx.newPage();
  vigilar(p, 'vitrina');
  const pagina = `${BASE}__vitrina-prueba.html`;
  await p.route(pagina, (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="margin:0;padding:20px;display:flex;gap:24px;background:#222"><iframe src="${BASE}app/?d=c&vitrina=1" style="width:390px;height:844px;border:0"></iframe><iframe src="${BASE}conductor/?d=c&vitrina=1" style="width:390px;height:844px;border:0"></iframe></body>` }));
  await p.goto(pagina);
  const app = p.frameLocator('iframe >> nth=0');
  await app.locator('[data-vista="inicio-recogida"] .c-tarjeta-inicio').waitFor({ timeout: 20000 });
  await p.frameLocator('iframe >> nth=1').locator('.c-ingreso').waitFor({ timeout: 20000 });
  const caja = await app.locator('.c-app').boundingBox();
  ok(Math.round(caja.width) === 390 && Math.round(caja.height) === 844, `Vitrina: la app llena el iframe de 390×844 (${Math.round(caja.width)}×${Math.round(caja.height)})`);
  await captura(p, 'e04-vitrina', 2000);
  await ctx.close();
}

async function probarBordesConductor() {
  const ctx = await navegador.newContext({ ...MOVIL, viewport: { width: 360, height: 740 } });
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.envivo', 'no');
    if (!localStorage.getItem('ct.conductor')) localStorage.setItem('ct.conductor', JSON.stringify({ id: 'c-prueba', movil: '012', nombre: 'Luz Marina Rojas', placa: 'VAK 612', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.8, viajes: 1311, desde: 2015, documentos: {} }));
  });
  const c = await ctx.newPage();
  vigilar(c, 'bordes-conductor');
  await c.goto(`${BASE}conductor/?d=c`);
  await c.waitForSelector('.c-tablero', { timeout: 20000 });
  await escucharAvisos(c);
  // Solicitud que vence sin respuesta.
  await simularYEsperar(c, 20000);
  await captura(c, 'e05-solicitud-360', 300);
  await c.waitForSelector('.c-anillo.c-urgente', { timeout: 25000 });
  await c.waitForSelector('.c-solicitud', { state: 'detached', timeout: 15000 });
  ok((await avisos(c)).includes('La solicitud venció'), 'C3 la solicitud vence sin respuesta y se avisa');
  // Aceptar, llegar y cancelar el servicio con motivo.
  await simularYEsperar(c, 20000);
  await c.click('.c-solicitud [data-accion="aceptar"]');
  await c.waitForSelector('[data-vista="viaje-hacia_origen"]');
  await c.click('[data-accion="llegue"]');
  await c.waitForSelector('#c-codigo .c-casilla');
  await captura(c, 'e06-codigo-360', 600);
  await c.click('.c-fila-discreta [data-accion="cancelar"]');
  await c.waitForSelector('.c-hoja [data-accion="motivo"]');
  ok((await c.locator('.c-hoja [data-accion="motivo"]').count()) === 4, 'C10 cancelar con los motivos del conductor');
  await c.click('.c-hoja [data-accion="motivo"] >> nth=0');
  await c.waitForSelector('[data-vista="tab-tablero"]', { timeout: 8000 });
  ok(true, 'C10 el servicio cancelado vuelve al tablero');
  await ctx.close();
}

try {
  await Promise.all([probarPasajero(), probarConductor()]);
  await Promise.all([probarPequena(), probarEscritorio(), probarGpsNegado(), probarBordesPasajero(), probarVitrina(), probarBordesConductor()]);
} catch (e) {
  fallos += 1;
  console.error('✘ La prueba se detuvo:', e.message.split('\n').filter((l) => l.trim() && !/^\s*-\s+(locator resolved|attempting|waiting for element|element is)/.test(l)).slice(0, 3).join(' | '));
} finally {
  await navegador.close();
}

ok(errores.length === 0, `sin errores de JavaScript${errores.length ? ':\n   ' + errores.slice(0, 8).join('\n   ') : ''}`);
console.log(`\n${fallos ? '✘' : '✔'} Diseño C: ${fallos ? `${fallos} fallo(s)` : 'todo bien'} en ${reloj()}. Capturas en ${CAPTURAS}`);
process.exitCode = fallos ? 1 : 0;
