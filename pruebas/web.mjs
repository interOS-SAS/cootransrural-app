// Prueba de la web de Cootransrural en Chromium sin pantalla (incluye el cobro real del conductor y la lectura de los QR):
//  - capturas de la página de inicio a 360, 390, 768, 1024 y 1440 px (página completa),
//  - la app es TaxiCun: «Pedir taxi», «Descargar», «Abrir TaxiCun» y los botones de
//    conductores llevan a taxicun/?e=cootransrural (o taxicun/conductor/?e=…),
//  - descargar/?movil=023 (página de TaxiCun: «Abrir TaxiCun» con el móvil),
//  - pago de prueba en pagar/: el mensaje 'pago' llega por BroadcastChannel a
//    otra página que escucha con new N.Bus({ sala }) y el comprobante muestra la
//    confirmación del conductor,
//  - de punta a punta: un conductor del núcleo cobra, pagar/ paga y el conductor pasa a «calificar»,
//  - los QR de la portada y de la vitrina se leen con jsQR y abren la URL correcta,
//  - la vitrina disenos/ carga sin errores de JS,
//  - JSON-LD y Open Graph,
//  - enlaces internos y anclas de todas las páginas responden 200 / existen,
//  - sin errores de JS en ninguna página.
// Uso: node pruebas/web.mjs [url_base] [carpeta_capturas]
//      (por defecto http://localhost:8774/ y /tmp/cootrans/capturas/web)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Opción --disenos: antes de probar, toma capturas de la primera pantalla de cada
// diseño y las guarda en web/disenos/<x>.jpg (se ven en las tarjetas de la página de inicio).
const ARGUMENTOS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CAPTURAR_DISENOS = process.argv.includes('--disenos');
const BASE = (ARGUMENTOS[0] || 'http://localhost:8774/').replace(/\/?$/, '/');
const CAPTURAS = ARGUMENTOS[1] || '/tmp/cootrans/capturas/web';
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(CAPTURAS, { recursive: true });

// La web de Cootransrural vive en el-rosal/; en la raíz está la página de TaxiCun.
const COOP = `${BASE}el-rosal/`;
const origen = new URL(BASE).origin;
let fallas = 0;
const ok = (condicion, mensaje) => {
  console.log(`${condicion ? '✔' : '✘'} ${mensaje}`);
  if (!condicion) {
    fallas++;
    process.exitCode = 1;
  }
};
const aviso = (mensaje) => console.log(`! ${mensaje}`);

// Servicios externos (teselas, direcciones, rutas, relés): si fallan por red no es error de la web.
const EXTERNOS = /cartocdn|openstreetmap|nominatim|project-osrm|mosquitto|emqx|hivemq|wa\.me|google/i;
// Archivos de los diseños (los construyen otros equipos): sus errores se informan aparte.
const DE_LOS_DISENOS = /\/disenos\/[abc]\/|\/app\/|\/conductor\//;

const navegador = await chromium.launch({ executablePath: EXE });

async function nuevoContexto(opciones = {}) {
  const ctx = await navegador.newContext({ geolocation: ROSAL, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota', ...opciones });
  // Sin relés MQTT públicos durante la prueba: solo BroadcastChannel.
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  return ctx;
}

function vigilar(pagina, nombre, errores, erroresDisenos = []) {
  pagina.on('pageerror', (e) => {
    const texto = `${nombre}: ${e.message}`;
    if (DE_LOS_DISENOS.test(e.stack || '')) erroresDisenos.push(texto);
    else errores.push(texto);
  });
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (url && !url.startsWith(origen)) return; // recurso externo
    // Servicio externo caído o limitado (p. ej. Nominatim sin cabeceras CORS): no es error de la web.
    if (EXTERNOS.test(m.text()) && !m.text().replace(/from origin '[^']*'/g, '').includes(origen)) return;
    const texto = `${nombre}: ${m.text()} ${url ? `(${url.replace(origen, '')})` : ''}`;
    if (DE_LOS_DISENOS.test(url)) erroresDisenos.push(texto);
    else errores.push(texto);
  });
  pagina.on('requestfailed', (r) => {
    if (!r.url().startsWith(origen)) return;
    if (r.failure()?.errorText?.includes('ERR_ABORTED')) return;
    const texto = `${nombre}: no cargó ${r.url().replace(origen, '')} (${r.failure()?.errorText})`;
    if (DE_LOS_DISENOS.test(r.url()) || DE_LOS_DISENOS.test(r.frame()?.url() || '')) erroresDisenos.push(texto);
    else errores.push(texto);
  });
  pagina.on('response', (r) => {
    if (!r.url().startsWith(origen) || r.status() < 400) return;
    const texto = `${nombre}: ${r.status()} en ${r.url().replace(origen, '')}`;
    if (DE_LOS_DISENOS.test(r.url()) || DE_LOS_DISENOS.test(r.frame()?.url() || '')) erroresDisenos.push(texto);
    else errores.push(texto);
  });
}

async function recorrer(pagina) {
  // Baja por toda la página para disparar las animaciones y la carga perezosa.
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 350) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await pagina.waitForTimeout(1200);
}

// Lee con jsQR (vendor/) los códigos QR en SVG que hay en la página: devuelve el texto de cada uno.
async function leerQRs(pagina, selector) {
  await pagina.addScriptTag({ url: new URL('vendor/jsQR.min.js', BASE).href });
  return pagina.evaluate(async (sel) => Promise.all([...document.querySelectorAll(sel)].map(async (svg) => {
    const lado = 480;
    const copia = svg.cloneNode(true);
    copia.setAttribute('width', lado);
    copia.setAttribute('height', lado);
    if (!copia.getAttribute('xmlns')) copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(copia));
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = lado + 40;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 20, 20, lado, lado);
    const datos = g.getImageData(0, 0, c.width, c.height);
    return window.jsQR(datos.data, c.width, c.height)?.data || null;
  })), selector);
}

const errores = [];
const erroresDisenos = [];

/* ============ 0) (opcional) Capturas de los diseños para la página de inicio ============ */
if (CAPTURAR_DISENOS) {
  mkdirSync(join(RAIZ_REPO, 'web', 'disenos'), { recursive: true });
  for (const d of ['a', 'b', 'c']) {
    const ctx = await nuevoContexto({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(`${COOP}app/?d=${d}&vitrina=1&sala=captura-${d}`, { waitUntil: 'load' });
    await p.waitForSelector('#carga', { state: 'detached', timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(3500);
    const destino = join(RAIZ_REPO, 'web', 'disenos', `${d}.jpg`);
    await p.screenshot({ path: destino, type: 'jpeg', quality: 80 });
    console.log(`  diseño ${d}: ${destino}`);
    await ctx.close();
  }
}

/* ============ 1) Página de inicio a tres anchos ============ */
for (const ancho of [360, 390, 768, 1024, 1440]) {
  const ctx = await nuevoContexto({ viewport: { width: ancho, height: ancho < 800 ? 844 : 900 } });
  const p = await ctx.newPage();
  vigilar(p, `inicio ${ancho}`, errores);
  await p.goto(COOP, { waitUntil: 'load' });
  await recorrer(p);
  const datos = await p.evaluate(() => ({
    qr: Boolean(document.querySelector('#qr-descarga svg')),
    qrUrl: document.querySelector('#qr-descarga-url')?.href || '',
    filas: document.querySelectorAll('#tabla-rutas tr').length,
    total: document.querySelector('#cotizacion b')?.textContent || '',
    desborde: document.documentElement.scrollWidth - window.innerWidth,
    ocultos: [...document.querySelectorAll('.revelar')].filter((e) => !e.classList.contains('visible')).length,
    fotos: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && !i.hidden).map((i) => i.getAttribute('src')),
    fotosOcultas: [...document.querySelectorAll('img[hidden]')].map((i) => i.getAttribute('src')),
    mapa: Boolean(document.querySelector('#mapa-oficina.leaflet-container .leaflet-tile-pane')),
    taxicun: {
      barra: document.querySelector('.boton-barra')?.href,
      pedir: document.querySelector('#pedir-taxi')?.href,
      descargar: document.querySelector('#descargar-taxicun')?.href,
      franja: document.querySelector('#taxicun .boton')?.href,
      franjaTexto: document.querySelector('#taxicun')?.innerText.replace(/\s+/g, ' ') || '',
      logo: document.querySelector('#taxicun .tc-logo img')?.complete && document.querySelector('#taxicun .tc-logo img')?.naturalWidth > 0,
      conductor: [...document.querySelectorAll('a')].filter((a) => /TaxiCun para conductores/.test(a.textContent)).map((a) => a.href),
      viejos: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^(\.\/)?(app|conductor)\/(\?|$)/.test(h)),
      pie: document.querySelector('.pie-interos')?.textContent.replace(/\s+/g, ' ').trim() || '',
    },
  }));
  const rutas = await p.evaluate(async () => (await import('../nucleo/index.js')).RUTAS.length);
  ok(datos.qr && datos.qrUrl.includes('/descargar/'), `inicio ${ancho}: QR grande hacia descargar/`);
  ok(datos.filas === rutas, `inicio ${ancho}: tabla de tarifas con las ${rutas} rutas del núcleo`);
  ok(/^\$\d/.test(datos.total), `inicio ${ancho}: el cotizador calcula (${datos.total})`);
  ok(datos.desborde <= 1, `inicio ${ancho}: sin desborde horizontal (${datos.desborde}px)`);
  ok(datos.ocultos === 0, `inicio ${ancho}: todas las secciones animadas quedaron visibles`);
  ok(datos.fotos.length === 0, `inicio ${ancho}: no hay imágenes rotas visibles${datos.fotos.length ? ': ' + datos.fotos.join(', ') : ''}`);
  if (datos.fotosOcultas.length) aviso(`inicio ${ancho}: fotos que aún no existen (se ocultaron): ${datos.fotosOcultas.join(', ')}`);
  ok(datos.mapa, `inicio ${ancho}: mapa de la oficina (Leaflet) creado`);
  if (ancho === 1440 || ancho === 390) {
    const tc = datos.taxicun;
    const app = new URL('taxicun/?e=cootransrural', BASE).href;
    ok([tc.barra, tc.pedir, tc.descargar, tc.franja].every((u) => u === app), `inicio ${ancho}: «Pedir taxi», «Descargar TaxiCun» y «Abrir TaxiCun» llevan a taxicun/?e=cootransrural`);
    ok(tc.conductor.length >= 1 && tc.conductor.every((u) => u === new URL('taxicun/conductor/?e=cootransrural', BASE).href), `inicio ${ancho}: «TaxiCun para conductores» → taxicun/conductor/?e=cootransrural (${tc.conductor.length})`);
    ok(!tc.viejos.length, `inicio ${ancho}: ningún enlace a la app vieja (app/ o conductor/)${tc.viejos.length ? ': ' + tc.viejos.join(', ') : ''}`);
    ok(/Pide tu taxi con TaxiCun/.test(tc.franjaTexto) && /La app TaxiCun de Cootransrural/i.test(tc.franjaTexto) && /varios municipios de Cundinamarca/.test(tc.franjaTexto) && tc.logo, `inicio ${ancho}: franja de TaxiCun con su logo («${tc.franjaTexto.slice(0, 90)}…»)`);
    ok(/^App TaxiCun · desarrollada por interOS/.test(tc.pie), `inicio ${ancho}: pie «${tc.pie}»`);
  }
  if (ancho === 1440) {
    // Los tres QR de la página se leen con jsQR y llevan a donde dicen.
    const [descarga, cobro, sticker] = await leerQRs(p, '#qr-descarga svg, #qr-cobro svg, #qr-sticker svg');
    ok(descarga === new URL('descargar/?o=web', COOP).href, `inicio: el QR de la portada se lee y abre descargar/ (${(descarga || 'ilegible').replace(origen, '')})`);
    const uCobro = cobro ? new URL(cobro) : null;
    ok(uCobro && uCobro.pathname.endsWith('/pagar/') && uCobro.searchParams.get('v') === '12000' && uCobro.searchParams.get('m') === '023', `inicio: el QR de cobro de muestra abre pagar/ con $12.000 (${(cobro || 'ilegible').replace(origen, '')})`);
    ok(sticker === new URL('descargar/?movil=023&o=sticker', COOP).href, `inicio: el QR del sticker de muestra abre descargar/?movil=023 (${(sticker || 'ilegible').replace(origen, '')})`);
    // Datos estructurados (JSON-LD) y Open Graph.
    const seo = await p.evaluate(() => {
      let jsonld = null;
      try { jsonld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch { /* inválido */ }
      const meta = (n) => document.querySelector(`meta[property="${n}"], meta[name="${n}"]`)?.content || '';
      return { tipos: jsonld?.['@graph']?.map((n) => n['@type']) || [], og: ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'description'].map(meta), canonica: document.querySelector('link[rel="canonical"]')?.href || '' };
    });
    ok(seo.tipos.includes('LocalBusiness') && seo.tipos.includes('TaxiService'), `inicio: JSON-LD válido (${seo.tipos.join(', ')})`);
    ok(seo.og.every(Boolean) && /^https:\/\//.test(seo.og[2]) && /^https:\/\//.test(seo.og[3]), 'inicio: Open Graph completo, con imagen y URL absolutas');
    ok(/^https:\/\//.test(seo.canonica), `inicio: enlace canónico (${seo.canonica})`);
  }
  if (ancho === 390) {
    await p.click('#hamburguesa');
    await p.waitForTimeout(400);
    const abierto = await p.evaluate(() => document.querySelector('#barra').classList.contains('abierta'));
    await p.screenshot({ path: `${CAPTURAS}/inicio-390-menu.png` });
    ok(abierto, 'inicio 390: el menú hamburguesa abre');
    await p.click('#menu a[href="#tarifas"]');
    await p.waitForTimeout(600);
    ok(!(await p.evaluate(() => document.querySelector('#barra').classList.contains('abierta'))), 'inicio 390: el menú se cierra al elegir una sección');
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await p.waitForTimeout(300);
  }
  await p.screenshot({ path: `${CAPTURAS}/inicio-${ancho}.png`, fullPage: true });
  console.log(`  captura: ${CAPTURAS}/inicio-${ancho}.png`);
  await ctx.close();
}

/* ============ 2) Formulario «Programa tu servicio» → WhatsApp ============ */
{
  const ctx = await nuevoContexto({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  vigilar(p, 'formulario', errores);
  await p.addInitScript(() => {
    window.__abiertas = [];
    window.open = (url) => { window.__abiertas.push(String(url)); return null; };
  });
  await p.goto(COOP + '#contacto', { waitUntil: 'load' });
  await p.click('#formulario button[type="submit"]');
  const invalidos = await p.evaluate(() => document.querySelectorAll('#formulario [aria-invalid="true"]').length);
  ok(invalidos >= 4, `formulario: valida los campos vacíos (${invalidos} marcados)`);
  await p.fill('#f-nombre', 'María Prueba');
  await p.fill('#f-telefono', '300 123 4567');
  await p.selectOption('#f-servicio', { label: 'Taxi al aeropuerto' });
  await p.fill('#f-origen', 'Parque Principal');
  await p.fill('#f-destino', 'Aeropuerto El Dorado');
  await p.click('#formulario button[type="submit"]');
  await p.waitForTimeout(300);
  const url = await p.evaluate(() => window.__abiertas[0] || '');
  const texto = decodeURIComponent(url.split('?text=')[1] || '');
  ok(url.startsWith('https://wa.me/573209042977?text='), 'formulario: abre WhatsApp de la central');
  ok(texto.includes('María Prueba') && texto.includes('Aeropuerto El Dorado') && texto.includes('Taxi al aeropuerto'), 'formulario: el mensaje lleva los datos del servicio');
  ok(texto.includes('10 %'), 'formulario: avisa el descuento del 10 % (programado con 24 h)');
  await ctx.close();
}

/* ============ 3) Página de descarga ============ */
{
  const ctx = await nuevoContexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  vigilar(p, 'descargar', errores);
  await p.goto(COOP + 'descargar/?movil=023&o=sticker', { waitUntil: 'load' });
  await p.waitForTimeout(500);
  const d = await p.evaluate(() => ({
    titulo: document.querySelector('h1')?.textContent,
    chip: document.querySelector('#chip-movil')?.hidden === false ? document.querySelector('#chip-movil').textContent : '',
    coop: document.querySelector('.chip-coop')?.textContent.replace(/\s+/g, ' ').trim() || '',
    pedir: document.querySelector('#pedir')?.href,
    textoPedir: document.querySelector('#pedir')?.textContent.trim(),
    conductor: document.querySelector('#enlace-conductor')?.href,
    logo: document.querySelector('.tc-logo')?.getAttribute('aria-label'),
  }));
  ok(d.titulo === 'Descarga TaxiCun' && d.logo === 'TaxiCun', 'descargar: «Descarga TaxiCun» con el logo de TaxiCun');
  ok(d.coop.includes('Cootransrural') && d.coop.includes('El Rosal'), `descargar: nombra a la cooperativa («${d.coop}»)`);
  ok(/Escaneaste el sticker del móvil\s*023/.test(d.chip.replace(/\s+/g, ' ')), 'descargar: «Escaneaste el sticker del móvil 023»');
  ok(d.textoPedir === 'Abrir TaxiCun' && d.pedir === new URL('taxicun/?e=cootransrural&movil=023', BASE).href, `descargar: «Abrir TaxiCun» lleva a taxicun/?e=cootransrural&movil=023 (${(d.pedir || '').replace(origen, '')})`);
  ok(d.conductor === new URL('taxicun/conductor/?e=cootransrural', BASE).href, 'descargar: «¿Eres conductor?» abre TaxiCun para conductores');
  await p.screenshot({ path: `${CAPTURAS}/descargar-023.png`, fullPage: true });
  await p.click('#instalar');
  await p.waitForTimeout(400);
  const pasos = await p.evaluate(() => (document.querySelector('#instrucciones')?.hidden ? 0 : document.querySelectorAll('#pasos-instalar li').length));
  const abrirParaInstalar = await p.evaluate(() => document.querySelector('#abrir-app')?.href);
  ok(pasos >= 2, `descargar: «Instalar TaxiCun» muestra las instrucciones del equipo (${pasos} pasos)`);
  ok(abrirParaInstalar === new URL('taxicun/?e=cootransrural&movil=023', BASE).href, 'descargar: la instalación se hace desde taxicun/ (allí está el manifiesto de TaxiCun)');
  await p.screenshot({ path: `${CAPTURAS}/descargar-instalar.png`, fullPage: true });
  console.log(`  captura: ${CAPTURAS}/descargar-023.png`);
  await ctx.close();
}

/* ============ 4) Pago de prueba → mensaje 'pago' por BroadcastChannel ============ */
{
  const ctx = await nuevoContexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const sala = 'prueba-web';
  // Página que hace de conductor: escucha la sala con el bus del núcleo.
  const oyente = await ctx.newPage();
  vigilar(oyente, 'oyente', errores);
  await oyente.goto(BASE + 'pruebas/nucleo.html');
  await oyente.waitForFunction(() => window.listo);
  await oyente.evaluate((s) => {
    window.recibidos = [];
    window.busOyente = new window.N.Bus({ sala: s });
    window.busOyente.on('pago', (d) => {
      window.recibidos.push(d);
      if (window.recibidos.length === 1) {
        setTimeout(() => window.busOyente.publicar('pago_confirmado', { viajeId: d.viajeId, conductorId: d.conductorId, metodo: d.metodo, valor: d.valor, billetera: d.billetera, ref: d.ref }), 300);
      }
    });
  }, sala);

  const p = await ctx.newPage();
  vigilar(p, 'pagar', errores);
  await p.goto(`${BASE}pagar/?v=12000&id=viaje-prueba-web&m=23&c=demo-23&s=${sala}`, { waitUntil: 'load' });
  await p.waitForSelector('#form-pago');
  const encabezado = await p.textContent('.pago-cabeza b');
  const valorVisto = await p.textContent('.pago-valor b');
  const franja = await p.textContent('.franja-prueba');
  ok(encabezado.includes('Cootransrural') && encabezado.includes('Móvil 023'), 'pagar: «Cootransrural · Móvil 023»');
  ok(valorVisto.replace(/\s/g, '') === '$12.000', `pagar: valor grande ${valorVisto}`);
  ok(/MODO PRUEBA/.test(franja) && /no se mueve dinero/.test(franja), 'pagar: franja «MODO PRUEBA — no se mueve dinero»');
  const nombres = await p.$$eval('.billetera label', (ls) => ls.map((l) => l.textContent.trim().slice(1)));
  ok(['Bre-B', 'Nequi', 'DaviPlata', 'Bancolombia'].every((n) => nombres.includes(n)), `pagar: billeteras ${nombres.join(', ')}`);
  const textoBoton = (await p.textContent('#boton-pagar')).replace(/\s+/g, ' ').trim();
  ok(textoBoton === 'Pagar $12.000 (prueba)', `pagar: botón «${textoBoton}»`);
  await p.screenshot({ path: `${CAPTURAS}/pagar-1-formulario.png`, fullPage: true });
  await p.click('label[for="b-nequi"]');
  await p.click('#boton-pagar');
  await p.waitForSelector('.procesando');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${CAPTURAS}/pagar-2-procesando.png`, fullPage: true });
  await p.waitForSelector('.comprobante', { timeout: 8000 });
  const ref = (await p.textContent('#referencia')).trim();
  await oyente.waitForFunction(() => window.recibidos.length >= 2, null, { timeout: 6000 }).catch(() => {});
  const recibidos = await oyente.evaluate(() => window.recibidos);
  const primero = recibidos[0] || {};
  ok(recibidos.length >= 1, `pagar: el 'pago' llegó por BroadcastChannel a la otra página (${recibidos.length} envíos)`);
  ok(recibidos.length >= 2, 'pagar: se publica una segunda vez para asegurar');
  ok(primero.viajeId === 'viaje-prueba-web' && primero.conductorId === 'demo-23' && primero.metodo === 'qr' && primero.valor === 12000 && primero.billetera === 'Nequi' && primero.ref === ref,
    `pagar: datos del pago ${JSON.stringify(primero)}`);
  await p.waitForFunction(() => document.querySelector('#estado-envio')?.classList.contains('ok'), null, { timeout: 5000 }).catch(() => {});
  const confirmacion = await p.textContent('#estado-envio');
  ok(/El conductor recibió tu pago/.test(confirmacion), 'pagar: muestra la confirmación del conductor (pago_confirmado)');
  await p.screenshot({ path: `${CAPTURAS}/pagar-3-comprobante.png`, fullPage: true });

  // Al volver a abrir el mismo cobro no se paga dos veces.
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('.comprobante');
  ok((await p.textContent('.comprobante h2')).includes('ya está pagado'), 'pagar: el mismo viaje no se cobra dos veces');

  // Enlace incompleto.
  await p.goto(BASE + 'pagar/?m=023', { waitUntil: 'load' });
  await p.waitForSelector('.error-pago');
  ok((await p.textContent('.error-pago h1')).includes('incompleto'), 'pagar: mensaje claro si faltan parámetros');
  await p.screenshot({ path: `${CAPTURAS}/pagar-4-incompleto.png`, fullPage: true });
  console.log(`  capturas: ${CAPTURAS}/pagar-*.png`);
  await ctx.close();
}

/* ============ 4b) De punta a punta: conductor → QR de cobro → pagar/ → «calificar» ============ */
{
  const ctx = await nuevoContexto({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('ct.ajustes', JSON.stringify({ simulacion: 'auto', sonido: false, gpsSimulado: true })));
  // Pestaña del conductor: usa el núcleo tal cual lo usa la app del conductor.
  const cond = await ctx.newPage();
  vigilar(cond, 'conductor (núcleo)', errores);
  await cond.goto(BASE + 'pruebas/nucleo.html');
  await cond.waitForFunction(() => window.listo);
  const viaje = await cond.evaluate(async () => {
    const { N } = window;
    N.perfil.ingresarConductor({ movil: '23', pin: '1234' });
    const c = await N.crearConductor();
    window.c = c;
    c.conectar();
    // Falla del núcleo: crearSolicitudSimulada() a veces arma un destino indefinido
    // (llama a elegir() dentro del callback de LUGARES.find); se reintenta.
    let fallosSimulacion = 0;
    for (let i = 0; i < 8 && !c.estado.solicitudes.length; i++) {
      try { await c.simularSolicitud(); } catch { fallosSimulacion++; }
    }
    const s = c.estado.solicitudes[0];
    await c.aceptar(s.viajeId);
    await new Promise((r) => c.on('llegada', r));
    c.llegue();
    const inicio = await c.iniciar(c.estado.viaje.codigoSimulado);
    await new Promise((r) => c.on('llegada', r));
    // El pasajero simulado pagaría solo a los 4 s: se detiene para que el pago llegue únicamente desde pagar/.
    c.pasajeroSim?.detener();
    const cobro = c.finalizar();
    return { inicio, cobro, fallosSimulacion, fase: c.estado.viaje?.fase, url: c.estado.viaje?.urlCobro, valorTexto: N.pesos(cobro?.valor || 0) };
  });
  if (viaje.fallosSimulacion) aviso(`núcleo: simularSolicitud() falló ${viaje.fallosSimulacion} vez/veces (destino indefinido) y se reintentó`);
  ok(viaje.inicio === true && viaje.fase === 'cobrando', `conductor: inicia con el código simulado y queda cobrando (${viaje.fase})`);
  ok(Boolean(viaje.url) && viaje.url === viaje.cobro?.url && new URL(viaje.url).pathname.endsWith('/pagar/'), `conductor: estado.viaje.urlCobro abre pagar/ (${(viaje.url || '').replace(origen, '')})`);

  // Otra pestaña: el pasajero «escanea» el QR con la cámara y paga.
  const pas = await ctx.newPage();
  vigilar(pas, 'pagar (cobro del conductor)', errores);
  await pas.goto(viaje.url, { waitUntil: 'load' });
  await pas.waitForSelector('#form-pago');
  const visto = (await pas.textContent('.pago-valor b')).replace(/\s/g, '');
  ok(visto === viaje.valorTexto.replace(/\s/g, ''), `pagar: muestra el valor del cobro del conductor (${visto})`);
  ok((await pas.textContent('.pago-cabeza b')).includes('Móvil 023'), 'pagar: muestra el móvil del conductor (023)');
  await pas.click('label[for="b-daviplata"]');
  await pas.click('#boton-pagar');
  await pas.waitForSelector('.comprobante', { timeout: 10000 });
  const ref = (await pas.textContent('#referencia')).trim();
  const llego = await cond.waitForFunction(() => window.c.estado.viaje?.fase === 'calificar', null, { timeout: 10000 }).then(() => true).catch(() => false);
  const pagoConductor = await cond.evaluate(() => window.c.estado.viaje?.pago || null);
  ok(llego, 'conductor: pasa a «calificar» cuando el pasajero paga en pagar/');
  ok(pagoConductor?.metodo === 'qr' && pagoConductor?.ref === ref && pagoConductor?.billetera === 'DaviPlata' && pagoConductor?.valor === viaje.cobro?.valor,
    `conductor: registra el pago de pagar/ (${JSON.stringify(pagoConductor)})`);
  await pas.screenshot({ path: `${CAPTURAS}/pagar-5-cobro-conductor.png`, fullPage: true });
  await ctx.close();
}

/* ============ 5) Vitrina de diseños ============ */
for (const [ancho, alto] of [[1440, 900], [390, 844]]) {
  const ctx = await nuevoContexto({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript(() => { if (window.top === window && !sessionStorage.getItem('vit')) { sessionStorage.setItem('vit', '1'); localStorage.setItem('ct.sala', 'demo'); } });
  const p = await ctx.newPage();
  const erroresVitrina = [];
  vigilar(p, `vitrina ${ancho}`, erroresVitrina, erroresDisenos);
  await p.goto(COOP + 'disenos/', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const cargados = await p.evaluate(() => document.querySelectorAll('.v-pantalla iframe').length);
  await p.waitForTimeout(5000);
  const info = await p.evaluate(() => ({
    columnas: [...document.querySelectorAll('.v-columna')].filter((c) => getComputedStyle(c).display !== 'none').length,
    marcos: [...document.querySelectorAll('.v-pantalla iframe')].map((f) => f.getAttribute('src')),
    qr: document.querySelectorAll('.v-qr svg').length,
    escala: getComputedStyle(document.querySelector('.v-columna.activa .v-marco') || document.querySelector('.v-marco')).getPropertyValue('--escala'),
    sala: localStorage.getItem('ct.sala'),
    desborde: document.documentElement.scrollWidth - window.innerWidth,
  }));
  ok(info.columnas === (ancho > 900 ? 3 : 1), `vitrina ${ancho}: ${info.columnas} columna(s) visibles`);
  ok(info.qr === 3, `vitrina ${ancho}: un QR por diseño`);
  ok(info.marcos.every((s) => /^\.\.\/app\/\?d=[abc]&vitrina=1&sala=vitrina-[abc]$/.test(s)), `vitrina ${ancho}: iframes con su sala (${info.marcos.join(' | ') || 'ninguno: diseños aún sin publicar'})`);
  ok(ancho > 900 || cargados <= 1, `vitrina ${ancho}: carga perezosa (${cargados} iframe(s) al abrir)`);
  ok(info.desborde <= 1, `vitrina ${ancho}: sin desborde horizontal`);
  ok(info.sala === 'demo', `vitrina ${ancho}: la sala del usuario no cambia (${info.sala})`);
  if (ancho <= 900) {
    await p.click('#pestana-c');
    await p.waitForTimeout(2500);
    const visible = await p.evaluate(() => document.querySelector('.v-columna.activa')?.dataset.d);
    ok(visible === 'c', 'vitrina 390: las pestañas cambian de diseño');
    await p.click('.v-columna.activa .v-interruptor [data-rol="conductor"]');
    await p.waitForTimeout(2500);
    const conductor = await p.evaluate(() => document.querySelector('.v-columna.activa .completa')?.getAttribute('href'));
    ok(conductor === '../conductor/?d=c', 'vitrina 390: el interruptor pasa a la app del conductor');
  }
  await p.screenshot({ path: `${CAPTURAS}/vitrina-${ancho}.png`, fullPage: true });
  console.log(`  captura: ${CAPTURAS}/vitrina-${ancho}.png`);
  if (ancho > 900) {
    // Los QR de cada columna abren el diseño correcto (se leen con jsQR, como lo haría la cámara).
    const leidos = await leerQRs(p, '.v-qr .codigo svg');
    ok(leidos.length === 3 && ['a', 'b', 'c'].every((d, i) => leidos[i] === new URL(`app/?d=${d}`, COOP).href), `vitrina: los QR abren app/?d=a|b|c (${leidos.map((u) => (u || 'ilegible').replace(origen, '')).join(' | ')})`);
    await p.click('#c .v-interruptor [data-rol="conductor"]');
    const [qrConductor] = await leerQRs(p, '#c .v-qr .codigo svg');
    ok(qrConductor === new URL('conductor/?d=c', COOP).href, `vitrina: con «Conductor» el QR abre conductor/?d=c (${(qrConductor || 'ilegible').replace(origen, '')})`);
    await p.click('#c .v-interruptor [data-rol="pasajero"]');
    await Promise.all([p.waitForURL(/\/app\/$/, { timeout: 8000 }).catch(() => {}), p.click('#b .usar')]);
    const elegido = await p.evaluate(() => ({ d: localStorage.getItem('ct.diseno'), sala: localStorage.getItem('ct.sala'), url: location.pathname }));
    ok(elegido.d === 'b' && elegido.url.endsWith('/app/'), `vitrina: «Usar este diseño» guarda el diseño B y abre la app (${JSON.stringify(elegido)})`);
    ok(elegido.sala === 'demo', 'vitrina: al salir, la sala del usuario sigue siendo la suya');
  }
  errores.push(...erroresVitrina);
  ok(erroresVitrina.length === 0, `vitrina ${ancho}: sin errores de JS propios`);
  await ctx.close();
}

/* ============ 6) Privacidad y 404 ============ */
{
  const ctx = await nuevoContexto({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  vigilar(p, 'privacidad', errores);
  await p.goto(COOP + 'privacidad/', { waitUntil: 'load' });
  const texto = await p.textContent('main');
  ok(/BORRADOR/i.test(texto) && texto.includes('Ley Estatutaria 1581 de 2012') && texto.includes('recepcion@cootransrural.com') && /relés MQTT públicos/.test(texto), 'privacidad: borrador con Ley 1581, relés públicos y contacto');
  ok(/términos de uso de TaxiCun/.test(texto) && /encargado del tratamiento/.test(texto) && /responsable del tratamiento de los datos es la Cooperativa de Transportadores Rurales/.test(texto.replace(/\s+/g, ' ')), 'privacidad: la app es TaxiCun, la cooperativa es la responsable e interOS el encargado');
  await p.screenshot({ path: `${CAPTURAS}/privacidad-390.png`, fullPage: true });
  await p.goto(BASE + '404.html', { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const inicio = await p.evaluate(() => document.querySelector('[data-ruta=""]')?.href);
  ok(inicio === BASE, `404: el enlace al inicio apunta a la raíz (${inicio})`);
  await p.screenshot({ path: `${CAPTURAS}/404-390.png` });
  await ctx.close();
}

/* ============ 7) Enlaces internos y anclas de todas las páginas de la web ============ */
{
  const ctx = await nuevoContexto();
  const p = await ctx.newPage();
  const paginas = ['', 'el-rosal/', 'el-rosal/descargar/?movil=023', 'pagar/?v=12000&id=enlaces&m=23', 'el-rosal/privacidad/', 'el-rosal/disenos/', '404.html', 'cooperativas/'];
  const enlaces = new Map(); // url → página donde aparece
  const anclasRotas = [];
  for (const ruta of paginas) {
    await p.goto(BASE + ruta, { waitUntil: 'load' });
    await p.waitForTimeout(400);
    const r = await p.evaluate((o) => {
      const urls = [];
      const rotas = [];
      const agregar = (u) => {
        try {
          const x = new URL(u, location.href);
          if (x.origin !== o) return;
          // Ancla a otra sección: el id tiene que existir en la página de destino (si es esta misma).
          if (x.hash && x.pathname === location.pathname && x.hash.length > 1 && !document.getElementById(decodeURIComponent(x.hash.slice(1)))) rotas.push(x.hash);
          x.hash = '';
          urls.push(x.href);
        } catch { /* nada */ }
      };
      document.querySelectorAll('a[href]').forEach((a) => agregar(a.getAttribute('href')));
      document.querySelectorAll('img[src], link[href], script[src], iframe[src]').forEach((e) => agregar(e.getAttribute('src') || e.getAttribute('href')));
      document.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby], label[for]').forEach((e) => {
        for (const id of (e.getAttribute('aria-controls') || e.getAttribute('aria-labelledby') || e.getAttribute('aria-describedby') || e.getAttribute('for') || '').split(/\s+/)) {
          if (id && !document.getElementById(id)) rotas.push(`#${id} (referido por ${e.tagName.toLowerCase()})`);
        }
      });
      return { urls, rotas };
    }, origen);
    r.urls.forEach((u) => { if (!enlaces.has(u)) enlaces.set(u, ruta || 'inicio'); });
    r.rotas.forEach((a) => anclasRotas.push(`${ruta || 'inicio'}: ${a}`));
  }
  const malos = [];
  for (const [u, donde] of enlaces) {
    const r = await ctx.request.get(u);
    if (r.status() !== 200) malos.push(`${r.status()} ${u.replace(origen, '')} (en ${donde})`);
  }
  ok(malos.length === 0, `enlaces internos de ${paginas.length} páginas: ${enlaces.size - malos.length}/${enlaces.size} responden 200${malos.length ? ' — fallan: ' + malos.join(', ') : ''}`);
  ok(anclasRotas.length === 0, `anclas y referencias de accesibilidad apuntan a ids que existen${anclasRotas.length ? ': ' + anclasRotas.join(', ') : ''}`);
  await ctx.close();
}

/* ============ 8) Rutas relativas en los archivos de la web ============ */
{
  const archivos = ['index.html', '404.html', 'descargar/index.html', 'pagar/index.html', 'privacidad/index.html', 'disenos/index.html', 'disenos/vitrina.css', 'disenos/vitrina.js', 'web/estilos.css', 'web/paginas.css', 'web/sitio.js', 'web/pagar.js', 'cooperativas/index.html', 'web/cooperativas.css', 'propuesta/index.html', 'web/propuesta.css'];
  const absolutas = [];
  for (const a of archivos) {
    const ruta = join(RAIZ_REPO, a);
    if (!existsSync(ruta)) { absolutas.push(`${a}: no existe`); continue; }
    const texto = readFileSync(ruta, 'utf8');
    const m = texto.match(/(?:href|src|action)\s*=\s*["']\/(?!\/)[^"']*|url\(\s*["']?\/(?!\/)[^)]*\)|import\s[^'"]*from\s*["']\/[^"']*/g);
    if (m) absolutas.push(`${a}: ${m.slice(0, 3).join(' | ')}`);
  }
  ok(absolutas.length === 0, `todas las rutas son relativas${absolutas.length ? ': ' + absolutas.join('; ') : ''}`);
}

/* ============ Resumen ============ */
if (erroresDisenos.length) {
  aviso(`errores dentro de los iframes de los diseños (los construyen otros equipos, no cuentan aquí): ${erroresDisenos.length}`);
  [...new Set(erroresDisenos)].slice(0, 8).forEach((e) => console.log(`    ${e}`));
}
ok(errores.length === 0, `sin errores de JS ni recursos rotos${errores.length ? ':\n    ' + [...new Set(errores)].slice(0, 12).join('\n    ') : ''}`);
console.log(fallas ? `\n${fallas} comprobación(es) fallaron.` : '\nTodo en orden.');
await navegador.close();
