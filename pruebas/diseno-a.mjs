// Prueba del diseño A «Ámbar Urbano» en Chromium sin pantalla, para CUALQUIER cooperativa.
//  1) Pasajero (390×844, táctil): registro por la interfaz, un destino de la ficha,
//     viaje completo con el conductor simulado, pago «Simular pago con QR»,
//     calificación y el viaje en «Mis viajes». Además, un segundo pedido cancelado.
//  2) Conductor: ingreso, conexión, «Simular solicitud», aceptar deslizando,
//     «Llegué», código de abordaje, fin del viaje, QR de cobro, pago y calificación.
//  3) Capturas en /tmp/cootrans/capturas/a/<id>/ (también a 360×740 y escritorio 1280×800).
//  4) Falla si hay errores de JavaScript (salvo recursos externos caídos).
//  5) En cada captura revisa el texto visible: nunca «null», «undefined» ni «NaN»; en las
//     otras cooperativas, nada de Cootransrural ni de El Rosal; enlaces tel: y mailto: completos.
//  Además: sin cámara, sin GPS, solicitud que vence, rendimiento durante el viaje, una ruta
//  con tarifa fija de la ficha y la separación entre cooperativas (el pasajero registrado
//  aquí no aparece, ni con su historial, en otras dos cooperativas del mismo navegador).
//  Con --taxicun todo corre dentro de la app única TaxiCun (taxicun/?e=<id>&d=a y
//  taxicun/conductor/?e=<id>&d=a): además revisa la marca «TaxiCun · <cooperativa>», el sello
//  de la barra, «Cambiar de municipio» (lleva a taxicun/?elegir=1) y que los enlaces entre las
//  apps se queden en TaxiCun. Sin --taxicun revisa que no salga «Cambiar de municipio» y que los
//  enlaces vayan a las páginas propias de la cooperativa.
// Uso: node pruebas/diseno-a.mjs [url_base] [--empresa=<id>] [--taxicun]   (por defecto http://localhost:8771/ y cootransrural)
//      CAPTURAS=/otra/carpeta/ node pruebas/diseno-a.mjs …   (para guardar las capturas en otro lado)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const argumentos = process.argv.slice(2);
const EMPRESA = (argumentos.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'cootransrural').toLowerCase();
const BASE = (argumentos.find((a) => !a.startsWith('--')) || 'http://localhost:8771/').replace(/\/?$/, '/');
const TAXICUN = argumentos.includes('--taxicun');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';

/* ---------------- datos de la cooperativa (de su ficha) ---------------- */
const TEXTO_FICHA = readFileSync(new URL(`../empresas/${EMPRESA}/ficha.json`, import.meta.url), 'utf8');
const FICHA = JSON.parse(TEXTO_FICHA);
const PRINCIPAL = EMPRESA === 'cootransrural';
const PROPUESTA = FICHA.estado === 'propuesta';
const E = FICHA.EMPRESA;
const NOMBRE = E.nombreCorto || E.nombre;
const PUEBLO = E.pueblo || String(E.municipio || '').split(',')[0];
const TIENE_TELEFONO = String(E.telefono || '').replace(/\D/g, '').length >= 7;
const WHATSAPP = String(E.whatsapp || '').replace(/\D/g, '');
const TIENE_WHATSAPP = WHATSAPP.length >= 10;
// Llave Bre-B de ejemplo: @<nombre corto sin tildes ni espacios><móvil>.
const LLAVE = `@${String(E.nombreCorto || E.nombre).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '')}`;
const RAIZ_COOP = PRINCIPAL ? BASE : `${BASE}${EMPRESA}/`;
const PREFIJO = PRINCIPAL ? 'ct.' : `ct.${EMPRESA}.`;
const CENTRO = { latitude: FICHA.CENTRO.lat, longitude: FICHA.CENTRO.lng };
const fichaDe = (id) => JSON.parse(readFileSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url), 'utf8'));
const existeFicha = (id) => existsSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url));
// Separación: el pasajero registrado aquí no debe aparecer en otras dos cooperativas.
const OTRAS = ['cootransrural', 'tabio', 'subachoque'].filter((id) => id !== EMPRESA && existeFicha(id)).slice(0, 2);
const CAPTURAS = (process.env.CAPTURAS || `/tmp/cootrans/capturas/${TAXICUN ? 'tc-a' : 'a'}/${EMPRESA}/`).replace(/\/?$/, '/');
// Páginas de la app: dentro de TaxiCun (taxicun/?e=<id>) o las propias de la cooperativa.
const raizDe = (id) => (id === 'cootransrural' ? BASE : `${BASE}${id}/`);
const urlPasajero = (id = EMPRESA, extra = '') => (TAXICUN ? `${BASE}taxicun/?e=${id}&d=a${extra}` : `${raizDe(id)}app/?d=a${extra}`);
const urlConductor = (id = EMPRESA) => (TAXICUN ? `${BASE}taxicun/conductor/?e=${id}&d=a` : `${raizDe(id)}conductor/?d=a`);
// La app es TaxiCun y la desarrolla interOS (ver disenos/a/empresa.js).
const TEXTO_DESARROLLO = TAXICUN ? 'TaxiCun · desarrollada por interOS' : 'Esta app es TaxiCun, desarrollada por interOS';
const ICONO_TAXICUN = 'img/taxicun/icono-192.png';
// ¿Un enlace lleva a la otra app de esta cooperativa (dentro de TaxiCun: taxicun/… con ?e=<id>)?
function enlaceApp(href, rol) {
  if (!href) return false;
  const u = new URL(href, BASE);
  if (TAXICUN) return u.href.startsWith(`${BASE}${rol === 'conductor' ? 'taxicun/conductor/' : 'taxicun/'}`) && u.pathname.endsWith(rol === 'conductor' ? '/taxicun/conductor/' : '/taxicun/') && u.searchParams.get('e') === EMPRESA;
  return u.href === `${RAIZ_COOP}${rol === 'conductor' ? 'conductor' : 'app'}/?d=a`;
}
mkdirSync(CAPTURAS, { recursive: true });

const distanciaKm = (a, b) => {
  const r = (g) => (g * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const LUGARES = FICHA.LUGARES.filter((l) => l.nombre && Number.isFinite(l.lat));
// Un nombre sirve para buscarlo con :has-text si no aparece dentro de otro lugar.
const nombreUnico = (l, lista = LUGARES) => l.nombre.length >= 5 && !lista.some((o) => o !== l && `${o.nombre} ${o.detalle || ''}`.toLowerCase().includes(l.nombre.toLowerCase()));
// Destino del viaje: Tierra Grata en El Rosal; en las demás, un lugar a 1-2,6 km del centro.
const DESTINO = PRINCIPAL
  ? 'Tierra Grata'
  : LUGARES.filter((l) => nombreUnico(l) && distanciaKm(FICHA.CENTRO, l) >= 1 && distanciaKm(FICHA.CENTRO, l) <= 2.6)
    .sort((a, b) => Math.abs(distanciaKm(FICHA.CENTRO, a) - 1.6) - Math.abs(distanciaKm(FICHA.CENTRO, b) - 1.6))[0]?.nombre;
// Segundo pedido (el que se cancela): un lugar de salud o, si no hay, de otra categoría.
const SEGUNDO = (() => {
  if (PRINCIPAL) return { cat: 'salud', nombre: 'Puesto de Salud' };
  for (const cat of ['salud', 'comercio', 'educacion', 'centro', 'barrio', 'vereda']) {
    const delCat = LUGARES.filter((l) => l.cat === cat);
    const l = delCat.find((x) => x.nombre !== DESTINO && nombreUnico(x, delCat));
    if (l) return { cat, nombre: l.nombre };
  }
  return null;
})();
// Ruta fija: un municipio de la tabla que está en los lugares (para tocarlo en el buscador).
const RUTA_FIJA = (() => {
  for (const r of FICHA.RUTAS || []) {
    const lugar = LUGARES.find((l) => l.id === r.id);
    if (!lugar || !Number.isFinite(Number(r.valor))) continue;
    const delCat = LUGARES.filter((l) => l.cat === lugar.cat);
    if (nombreUnico(lugar, delCat)) return { ...r, lugar };
  }
  return null;
})();
// Móviles de la demo: los de la ficha (Cootransrural conserva el 023 y el 044).
const MOVILES = FICHA.CONDUCTORES_DEMO.map((c) => String(c.movil).padStart(3, '0'));
const MOVIL_DEMO = MOVILES.includes('023') ? '023' : MOVILES[0];
const MOVIL_2 = PRINCIPAL ? '044' : MOVILES.filter((m) => m !== MOVIL_DEMO).slice(-1)[0] || MOVIL_DEMO;
if (!DESTINO || !SEGUNDO) {
  console.log(`✘ la ficha de «${EMPRESA}» no tiene lugares para probar (destino: ${DESTINO}, segundo: ${SEGUNDO?.nombre})`);
  process.exit(1);
}
console.log(`Cooperativa: ${EMPRESA} (${FICHA.estado}) · ${TAXICUN ? 'dentro de TaxiCun' : RAIZ_COOP} · destino «${DESTINO}» · segundo «${SEGUNDO.nombre}» (${SEGUNDO.cat}) · móviles ${MOVIL_DEMO} y ${MOVIL_2}`);

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
const movil = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, geolocation: CENTRO, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' };

// Texto que no debe aparecer: datos escritos a mano de Cootransrural en otra cooperativa,
// y valores vacíos mal pintados en cualquiera.
const PROHIBIDOS = [/\b(null|undefined|NaN)\b/, /\$\s?0 taxis/i];
if (!PRINCIPAL) {
  PROHIBIDOS.push(/Cootransrural/i, /\bVAK\b/, /320 ?904 ?2977/, /recepcion@cootransrural/i, /Verde Rosal/i);
  // Si la ficha nombra El Rosal (por ejemplo, como ruta), solo se prohíben las frases fijas del diseño.
  PROHIBIDOS.push(TEXTO_FICHA.includes('El Rosal') ? /\b(?:de|en|desde) El Rosal\b|EL ROSAL/ : /El Rosal/i);
}
const problemasTexto = [];
async function revisarTexto(p, donde) {
  const r = await p.evaluate(() => {
    const textos = [document.body.innerText];
    for (const t of document.querySelectorAll('svg text')) textos.push(t.textContent);
    for (const n of document.querySelectorAll('[aria-label], [title], [alt], [placeholder]')) {
      for (const a of ['aria-label', 'title', 'alt', 'placeholder']) if (n.getAttribute(a)) textos.push(n.getAttribute(a));
    }
    const malos = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^tel:(?!\+?\d{3,})/.test(h) || /^mailto:(?![^@\s]+@)/.test(h) || /^https:\/\/wa\.me\/\d{1,11}(?:\?|$)/.test(h) || /undefined|null|NaN/.test(h));
    return { texto: textos.join('\n'), malos };
  });
  for (const re of PROHIBIDOS) {
    const m = r.texto.match(re);
    if (m) problemasTexto.push(`${donde}: «${r.texto.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, ' ')}»`);
  }
  for (const h of r.malos) problemasTexto.push(`${donde}: enlace incompleto «${h}»`);
}
async function foto(p, nombre) {
  await p.screenshot({ path: `${CAPTURAS}${nombre}.png` });
  await revisarTexto(p, nombre);
}
// Lee un QR (svg) de la página con jsQR.
async function leerQR(p, selector) {
  if (!(await p.evaluate(() => Boolean(window.jsQR)))) await p.addScriptTag({ url: `${BASE}vendor/jsQR.min.js` });
  return p.evaluate(async (sel) => {
    const svg = document.querySelector(sel);
    if (!svg) return null;
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`;
    await img.decode();
    const lado = 360;
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, 20, 20, lado - 40, lado - 40);
    return window.jsQR(ctx.getImageData(0, 0, lado, lado).data, lado, lado)?.data || null;
  }, selector);
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
  await p.goto(urlPasajero());

  // Bienvenida y registro
  await p.waitForSelector('.a-bienvenida .a-bien-diapo', { timeout: 30000 });
  await p.waitForTimeout(1200);
  await foto(p, 'p01-bienvenida-1');
  const cabezaBienvenida = await p.textContent('.a-bien-cabeza .a-marca');
  const iconoBienvenida = await p.$$eval('.a-bien-cabeza .a-marca img', (ns) => ns.map((n) => n.getAttribute('src')));
  if (TAXICUN) ok(/TaxiCun\s*·\s*/.test(cabezaBienvenida) && cabezaBienvenida.includes(NOMBRE) && iconoBienvenida.some((s) => s.endsWith(ICONO_TAXICUN)), `TaxiCun: la bienvenida dice «TaxiCun · ${NOMBRE}» con el ícono de TaxiCun`);
  else ok(!cabezaBienvenida.includes('TaxiCun') && cabezaBienvenida.includes(NOMBRE), 'fuera de TaxiCun: la bienvenida lleva solo la cooperativa');
  await p.click('[data-siguiente]');
  await p.waitForTimeout(800);
  await foto(p, 'p02-bienvenida-2');
  await p.click('[data-siguiente]');
  await p.waitForTimeout(800);
  await foto(p, 'p03-bienvenida-3');
  await p.click('[data-siguiente]');
  await p.waitForSelector('form.a-registro');
  if (TAXICUN) ok(((await p.textContent('.a-registro .a-tc-linea').catch(() => '')) || '').replace(/\s+/g, ' ').includes(`TaxiCun · ${NOMBRE}`), `TaxiCun: el registro lleva «TaxiCun · ${NOMBRE}»`);
  else ok(!(await p.$('.a-registro .a-tc-linea')), 'fuera de TaxiCun: el registro no lleva la línea de TaxiCun');
  const enlacePrivacidad = await p.getAttribute('.a-check a', 'href');
  const respPrivacidad = await fetch(enlacePrivacidad).catch(() => null);
  ok(enlacePrivacidad === `${RAIZ_COOP}privacidad/` && respPrivacidad?.ok, `los términos enlazan la privacidad de esta cooperativa (${enlacePrivacidad})`);
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
  ok(await p.evaluate((k) => JSON.parse(localStorage.getItem(k))?.nombre === 'Ana María Gómez', `${PREFIJO}pasajero`), `el pasajero quedó registrado (${PREFIJO}pasajero)`);

  // Inicio
  await vista(p, 'inicio', 20000);
  await p.waitForFunction(() => !document.querySelector('[data-origen-titulo]')?.textContent.includes('Buscando'), null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2500);
  await foto(p, 'p07-inicio');
  ok((await p.$$('.ct-taxi-marcador')).length >= 3, 'hay taxis cercanos en el mapa');
  ok((await p.textContent('[data-nombre]')).trim() === 'Ana', 'la barra saluda al pasajero por su nombre');
  ok((await p.$$('.a-rejilla-lugares .a-lugar')).length === 6, 'seis lugares frecuentes en el inicio');
  const frecuentes = await p.$$eval('.a-rejilla-lugares .a-lugar strong', (ns) => ns.map((n) => n.textContent.trim()));
  const nombresFicha = new Set(LUGARES.map((l) => l.nombre));
  ok(frecuentes.length > 0 && frecuentes.every((n) => nombresFicha.has(n)), `los lugares frecuentes son de la ficha de ${PUEBLO} (${frecuentes.join(', ')})`);
  if (TIENE_TELEFONO) ok(Boolean(await p.$('a.a-central[href^="tel:"]')), 'la central tiene botón para llamar');
  else ok(Boolean(await p.$('.a-central-sin')) && !(await p.$('a.a-central')) && (await p.textContent('.a-central-sin')).includes('Teléfono de la central: pronto'), 'sin teléfono: «Teléfono de la central: pronto» y sin enlace para llamar');
  if (PROPUESTA) {
    ok((await p.textContent('.a-chip-red')).includes(`Demostración de TaxiCun para ${E.nombre}`), 'propuesta: «Demostración de TaxiCun para …» junto a MODO PRUEBA');
    ok(await p.evaluate(() => /noindex/.test(document.querySelector('meta[name="robots"]')?.content || '')), 'propuesta: la página no se indexa (noindex)');
  } else ok(!(await p.$('.a-chip-demo')), 'cliente: sin aviso de demostración');
  ok(await p.isVisible('.a-pin'), 'pin central fijo para ajustar la recogida');
  if (TAXICUN) ok(await p.isVisible('.a-barra .a-tc-sello') && (await p.textContent('.a-barra .a-tc-sello')).includes('TaxiCun'), 'TaxiCun: sello discreto de TaxiCun en la barra');
  else ok(!(await p.$('.a-barra .a-tc-sello')), 'fuera de TaxiCun: la barra no lleva el sello de TaxiCun');
  await foto360(p, 'p07b-inicio-360');
  await p.click('.a-hoja-asa');
  await p.waitForTimeout(700);
  await foto(p, 'p08-inicio-completa');
  await p.$eval('.a-hoja-contenido', (n) => n.scrollTo({ top: n.scrollHeight }));
  await p.waitForTimeout(500);
  await foto(p, 'p08b-inicio-central');
  await p.$eval('.a-hoja-contenido', (n) => n.scrollTo({ top: 0 }));
  await p.click('.a-hoja-asa');
  await p.waitForTimeout(500);

  // Destino
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto');
  await p.waitForTimeout(500);
  await foto(p, 'p09-buscar');
  await p.fill('[data-q]', DESTINO);
  await p.waitForSelector(`.a-buscador .a-fila:has-text("${DESTINO}")`);
  await p.waitForTimeout(2200);
  await foto(p, 'p10-resultados');
  await p.click(`.a-buscador .a-fila:has-text("${DESTINO}")`);

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
  const claveMetodo = PRINCIPAL ? 'ct.a.metodo' : `ct.a.${EMPRESA}.metodo`;
  ok(await p.evaluate(([k, principal]) => localStorage.getItem(k) === 'qr' && (principal || localStorage.getItem('ct.a.metodo') === null), [claveMetodo, PRINCIPAL]), `el método de pago se guarda en «${claveMetodo}»`);
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
  ok(TIENE_TELEFONO === (await p.$$('.a-modal-sos a:has-text("Llamar a la central")')).length > 0, TIENE_TELEFONO ? 'SOS ofrece llamar a la central' : 'sin teléfono: SOS no ofrece llamar a la central');
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
  ok((await p.textContent('.a-pago-cabeza')).includes(`Gracias por viajar con ${NOMBRE}`), 'al llegar agradece en nombre de la cooperativa');
  await foto360(p, 'p20b-pagar-360');
  await p.click('details[data-otro] summary');
  await p.waitForSelector('[data-qr-otro] svg');
  await p.waitForTimeout(500);
  await foto(p, 'p21-otro-celular');
  const cobroLeido = await leerQR(p, '[data-qr-otro] .ct-breb-qr svg');
  const tarjetaOtro = await p.textContent('[data-qr-otro] .ct-breb');
  ok(new RegExp(`${LLAVE}\\d{3}`).test(tarjetaOtro) && tarjetaOtro.includes(NOMBRE), `la tarjeta Bre-B del pasajero lleva la llave ${LLAVE}<móvil> y el nombre de la cooperativa`);
  ok(Boolean(cobroLeido) && cobroLeido.includes('/pagar/') && (PRINCIPAL ? !/[?&]e=/.test(cobroLeido) : cobroLeido.includes(`e=${EMPRESA}`)), `el QR Bre-B de prueba lleva el cobro de esta cooperativa (${cobroLeido})`);
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
  await p.click(`.a-cat[data-cat="${SEGUNDO.cat}"]`);
  await p.click(`.a-buscador .a-fila:has-text("${SEGUNDO.nombre}")`);
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
  const hrefConductor = await p.getAttribute('.a-menu-item:has-text("Soy conductor")', 'href');
  ok(enlaceApp(hrefConductor, 'conductor'), `«Soy conductor» lleva a la app de conductores ${TAXICUN ? 'de TaxiCun' : 'de la cooperativa'} (${hrefConductor})`);
  const itemMunicipio = await p.$('.a-menu-item:has-text("Cambiar de municipio")');
  ok(TAXICUN ? Boolean(itemMunicipio) : !itemMunicipio, TAXICUN ? 'TaxiCun: «Cambiar de municipio» en el menú' : 'fuera de TaxiCun: sin «Cambiar de municipio» en el menú');
  if (TAXICUN) ok((await p.textContent('.a-menu-pie')).includes(TEXTO_DESARROLLO), `TaxiCun: el pie del menú dice «${TEXTO_DESARROLLO}»`);
  await p.click('.a-menu-item:has-text("Mis viajes")');
  await p.waitForSelector('[data-lista-viajes]');
  await p.waitForTimeout(500);
  const lista = await p.textContent('[data-lista-viajes]');
  ok(lista.includes(DESTINO) && lista.includes('Finalizado'), 'el viaje aparece en Mis viajes como finalizado');
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
    if (item === 'Tarifas y rutas') {
      ok((await p.textContent('.a-panel.a-abierto')).includes(`Dentro de ${PUEBLO}`), `las tarifas hablan de ${PUEBLO}`);
      const filas = await p.$$eval('.a-panel.a-abierto .a-tabla tbody th', (ns) => ns.map((n) => n.textContent.trim()));
      const esperadas = (FICHA.RUTAS || []).filter((r) => r.destino && Number.isFinite(Number(r.valor))).map((r) => r.destino);
      ok(JSON.stringify(filas) === JSON.stringify(esperadas), `Tarifas y rutas: las ${esperadas.length} rutas de la ficha (${filas.slice(0, 3).join(', ')}…)`);
    }
    if (item === 'Ajustes') {
      await p.$eval('.a-panel.a-abierto [data-acerca]', (n) => n.scrollIntoView({ block: 'end' }));
      await p.waitForTimeout(400);
      await foto(p, 'p31b-ajustes-acerca');
      const acerca = await p.textContent('.a-panel.a-abierto [data-acerca]');
      ok(acerca.includes(TEXTO_DESARROLLO) && acerca.includes(E.nombre), `Ajustes: «Acerca de» con la cooperativa y «${TEXTO_DESARROLLO}»`);
      if (PROPUESTA) ok(acerca.includes(`Demostración de TaxiCun para ${E.nombre}`), 'Ajustes: aviso «Demostración de TaxiCun para …» en la propuesta');
      const municipio = await p.$('.a-panel.a-abierto [data-municipio] [data-cambiar-municipio]');
      ok(TAXICUN ? Boolean(municipio) && (await municipio.textContent()).includes('Cambiar de municipio') : !municipio, TAXICUN ? 'TaxiCun: «Cambiar de municipio» en Ajustes' : 'fuera de TaxiCun: sin «Cambiar de municipio» en Ajustes');
      if (TAXICUN) {
        await p.$eval('.a-panel.a-abierto [data-municipio]', (n) => n.scrollIntoView({ block: 'start' }));
        await p.waitForTimeout(300);
        await foto(p, 'p31c-ajustes-municipio');
      }
    }
    if (item === 'Ayuda') {
      const tel = await p.$$('.a-panel.a-abierto .a-contacto a[href^="tel:"]');
      if (TIENE_TELEFONO) ok(tel.length === 1 && (await tel[0].getAttribute('href')) === `tel:${String(E.telefono).replace(/\D/g, '')}` && (await tel[0].textContent()).includes(E.telefonoVisible || E.telefono), `Ayuda: botón para llamar a la central (${E.telefonoVisible})`);
      else ok(tel.length === 0 && (await p.isVisible('[data-sin-telefono]')), 'Ayuda sin teléfono: texto honesto y sin botón de llamar');
      const wa = await p.$$eval('.a-panel.a-abierto .a-contacto a[href*="wa.me/"]', (ns) => ns.map((n) => n.getAttribute('href')));
      ok(TIENE_WHATSAPP ? wa.length === 1 && wa[0].startsWith(`https://wa.me/${WHATSAPP.startsWith('57') ? WHATSAPP : `57${WHATSAPP}`}?`) : wa.length === 0, TIENE_WHATSAPP ? 'Ayuda: WhatsApp de la cooperativa' : 'Ayuda sin WhatsApp: no se ofrece');
    }
  }
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click('[data-campana]');
  await p.waitForSelector('[data-lista-avisos]');
  await p.waitForTimeout(600);
  const historialAvisos = await p.textContent('[data-lista-avisos]');
  ok(['¡Tu taxi va en camino!', '¡Tu taxi está en la puerta!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)'].every((t) => historialAvisos.includes(t)), 'todos los avisos del viaje quedan en la campana');
  await foto(p, 'p34-avisos');
  await probarSeparacion(ctx, p);
  if (TAXICUN) await probarCambiarMunicipio(p, 'pasajero');
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
  await p.goto(urlConductor());
  await p.waitForSelector('.a-ingreso', { timeout: 30000 });
  await p.waitForTimeout(1300);
  const marcaIngreso = await p.textContent('.a-ingreso .a-marca');
  const iconosIngreso = await p.$$eval('.a-ingreso .a-marca img', (ns) => ns.map((n) => n.getAttribute('src')));
  if (TAXICUN) ok(/TaxiCun\s*·\s*/.test(marcaIngreso) && marcaIngreso.includes(NOMBRE) && iconosIngreso.some((s) => s.endsWith(ICONO_TAXICUN)), `TaxiCun: el ingreso del conductor dice «TaxiCun · ${NOMBRE}» con el ícono de TaxiCun`);
  else ok(!marcaIngreso.includes('TaxiCun') && marcaIngreso.includes(NOMBRE), 'fuera de TaxiCun: el ingreso lleva solo la cooperativa');
  const hrefPasajero = await p.getAttribute('[data-ir-pasajero]', 'href');
  ok(enlaceApp(hrefPasajero, 'pasajero'), `«¿Eres pasajero?» lleva a la app del pasajero ${TAXICUN ? 'de TaxiCun' : 'de la cooperativa'} (${hrefPasajero})`);
  ok(TAXICUN ? Boolean(await p.$('.a-ingreso [data-cambiar-municipio]')) : !(await p.$('.a-ingreso [data-cambiar-municipio]')), TAXICUN ? 'TaxiCun: el ingreso ofrece «Cambiar de municipio»' : 'fuera de TaxiCun: el ingreso no ofrece cambiar de municipio');
  ok((await p.textContent('.a-ingreso')).includes(`móvil ${MOVIL_DEMO}, PIN 1234`), `pista de ingreso de la demo (móvil ${MOVIL_DEMO})`);
  await p.fill('input[name=movil]', MOVIL_DEMO);
  await p.waitForTimeout(200);
  await p.keyboard.type('1234');
  await foto(p, 'c01-ingreso');
  await p.click('.a-ingreso button[type=submit]');
  await vista(p, 'libre', 15000);
  await p.waitForTimeout(2500);
  await foto(p, 'c02-inicio');
  ok((await p.textContent('[data-movil]')).includes(MOVIL_DEMO), 'la barra muestra el móvil del conductor');
  ok((await p.textContent('.a-tarjeta-taxi .a-placa small')).trim() === PUEBLO.toLocaleUpperCase('es-CO'), `la placa dice ${PUEBLO.toLocaleUpperCase('es-CO')}`);
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
  const cobroConductor = await leerQR(p, '[data-qr-cobro] .ct-breb-qr svg');
  ok(Boolean(cobroConductor) && (PRINCIPAL ? !/[?&]e=/.test(cobroConductor) : cobroConductor.includes(`e=${EMPRESA}`)), 'el QR de cobro del conductor es de esta cooperativa');
  ok((await p.textContent('[data-qr-cobro]')).includes(NOMBRE), 'la tarjeta Bre-B muestra el nombre de la cooperativa');
  ok((await p.textContent('[data-qr-cobro]')).includes(`${LLAVE}${MOVIL_DEMO}`), `la llave Bre-B de prueba es ${LLAVE}${MOVIL_DEMO}`);
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
  const hrefMenuPasajero = await p.getAttribute('.a-menu-item:has-text("App del pasajero")', 'href');
  ok(enlaceApp(hrefMenuPasajero, 'pasajero'), `menú del conductor: «App del pasajero» ${TAXICUN ? 'se queda en TaxiCun' : 'va a la app de la cooperativa'} (${hrefMenuPasajero})`);
  ok(TAXICUN ? Boolean(await p.$('.a-menu-item:has-text("Cambiar de municipio")')) : !(await p.$('.a-menu-item:has-text("Cambiar de municipio")')), TAXICUN ? 'TaxiCun: «Cambiar de municipio» en el menú del conductor' : 'fuera de TaxiCun: sin «Cambiar de municipio» en el menú del conductor');
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
    if (item === 'Mi taxi') {
      const sticker = await leerQR(p, '.a-panel.a-abierto .a-sticker-qr svg');
      ok(Boolean(sticker) && sticker.startsWith(`${RAIZ_COOP}descargar/?`) && sticker.includes(`movil=${MOVIL_DEMO}`), `el sticker de «Mi taxi» lleva a la descarga de esta cooperativa (${sticker})`);
    }
  }
  ok((await p.textContent('.a-panel.a-abierto')).includes('GPS simulado'), 'ajuste de GPS simulado');
  ok((await p.textContent('.a-panel.a-abierto')).includes(`calles de ${PUEBLO}`), `el GPS simulado recorre ${PUEBLO}`);
  await p.$eval('.a-panel.a-abierto [data-acerca]', (n) => n.scrollIntoView({ block: 'end' }));
  await p.waitForTimeout(400);
  await foto(p, 'c19b-ajustes-acerca');
  ok((await p.textContent('.a-panel.a-abierto [data-acerca]')).includes(TEXTO_DESARROLLO), `Ajustes del conductor: «${TEXTO_DESARROLLO}»`);
  ok(TAXICUN ? Boolean(await p.$('.a-panel.a-abierto [data-cambiar-municipio]')) : !(await p.$('.a-panel.a-abierto [data-cambiar-municipio]')), TAXICUN ? 'TaxiCun: «Cambiar de municipio» en los Ajustes del conductor' : 'fuera de TaxiCun: sin «Cambiar de municipio» en los Ajustes del conductor');
  await p.click('.a-panel.a-abierto [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click('[data-campana]');
  await p.waitForTimeout(600);
  ok((await p.textContent('.a-panel.a-abierto')).includes('Nueva solicitud de servicio'), 'la nueva solicitud queda en los avisos de la campana');
  await foto(p, 'c20-avisos');
  if (TAXICUN) {
    await p.click('.a-panel.a-abierto [data-cerrar]');
    await p.waitForTimeout(400);
    await probarCambiarMunicipio(p, 'conductor');
  }
  console.log(`   conductor listo (${seg()})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3) Escritorio y vitrina                                              */
/* ------------------------------------------------------------------ */
async function probarEscritorio() {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: CENTRO, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.addInitScript((k) => {
    localStorage.setItem('ct.envivo', 'no');
    localStorage.setItem(k, JSON.stringify({ id: 'p-escritorio', nombre: 'Laura Méndez', celular: '3115550000', calificacion: 5, verificado: true }));
  }, `${PREFIJO}pasajero`);
  const p = await ctx.newPage();
  vigilar(p, 'escritorio');
  await p.goto(urlPasajero());
  await vista(p, 'inicio', 30000);
  await p.waitForTimeout(3500);
  await foto(p, 'e01-escritorio-1280');
  ok(await p.isVisible('.a-escritorio'), 'en pantallas anchas se ve el panel con el QR');
  const qrEscritorio = await leerQR(p, '.a-escritorio-qr-img svg');
  ok(qrEscritorio === urlPasajero(), `el QR del panel abre la app de esta cooperativa${TAXICUN ? ' dentro de TaxiCun' : ''} (${qrEscritorio})`);
  const panel = await p.textContent('.a-escritorio');
  ok(panel.includes(NOMBRE) && panel.includes(TEXTO_DESARROLLO), `el panel lleva el nombre de la cooperativa y «${TEXTO_DESARROLLO}»`);
  if (PROPUESTA) ok(panel.includes(`Demostración de TaxiCun para ${E.razonSocial}`) && panel.includes('No es la página oficial') && !panel.includes('preparada por interOS'), 'propuesta: el panel lo dice claro («Demostración de TaxiCun para …»)');
  // La vitrina (iframe sin marco) es de las páginas propias; TaxiCun no la usa.
  if (TAXICUN) {
    await ctx.close();
    return;
  }
  await p.setViewportSize({ width: 412, height: 860 });
  await p.goto(`${RAIZ_COOP}app/?d=a&vitrina=1`);
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
  // Sin permiso de ubicación: aviso de que se usa el centro del municipio.
  const { geolocation, permissions, ...sinGps } = movil;
  const ctx = await navegador.newContext(sinGps);
  await ctx.addInitScript((k) => {
    localStorage.setItem('ct.envivo', 'no');
    localStorage.setItem(k, JSON.stringify({ id: 'p-sin-gps', nombre: 'Doña Rosa Pérez', celular: '3115550000', calificacion: 5, verificado: true }));
  }, `${PREFIJO}pasajero`);
  const p = await ctx.newPage();
  vigilar(p, 'sin-gps');
  await p.goto(urlPasajero());
  await vista(p, 'inicio', 30000);
  await p.waitForSelector('[data-aviso-gps]:not([hidden])', { timeout: 15000 });
  ok((await p.textContent('[data-aviso-gps]')).includes(`centro de ${PUEBLO}`), `sin GPS avisa que usa el centro de ${PUEBLO}`);
  ok((await p.textContent('[data-nombre]')).trim() === 'Doña Rosa', 'el saludo conserva el «Doña»');
  await p.waitForTimeout(1500);
  await foto(p, 'b01-sin-gps');
  await ctx.close();

  // Conductor: una solicitud que nadie responde vence sola.
  const ctx2 = await navegador.newContext(movil);
  await ctx2.addInitScript(registrarAvisos);
  const c = await ctx2.newPage();
  vigilar(c, 'vence');
  await c.goto(urlConductor());
  await c.waitForSelector('.a-ingreso', { timeout: 30000 });
  await c.waitForTimeout(500);
  await c.fill('input[name=movil]', MOVIL_2);
  await c.keyboard.type('4321');
  await c.click('.a-ingreso button[type=submit]');
  // La vista «libre» ya está detrás del ingreso: se espera a que la barra muestre el móvil.
  await c.waitForFunction((m) => document.querySelector('[data-movil]')?.textContent.includes(m) && !document.querySelector('.a-ingreso'), MOVIL_2, { timeout: 15000 });
  await c.click('[data-simular]');
  await c.waitForSelector('.a-solicitud.a-abierta', { timeout: 45000 });
  await c.waitForSelector('.a-solicitud.a-urgente', { timeout: 30000 });
  await foto(c, 'b02-solicitud-por-vencer');
  await c.waitForSelector('.a-solicitud', { state: 'detached', timeout: 20000 });
  await c.waitForTimeout(500);
  ok((await c.evaluate(() => window.__avisos)).includes('La solicitud venció'), 'la solicitud sin respuesta vence y se avisa');
  await ctx2.close();

  // La ficha no carga (red caída): el núcleo NO cae a otra cooperativa; a los 15 s la
  // pantalla de carga avisa con «Reintentar». No se vigila: el 503 es a propósito.
  if (!PRINCIPAL) {
    const ctx3 = await navegador.newContext({ ...movil, serviceWorkers: 'block' });
    await ctx3.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
    await ctx3.route(`**/empresas/${EMPRESA}/ficha.json*`, (r) => r.fulfill({ status: 503, body: '' }));
    const f = await ctx3.newPage();
    await f.goto(urlPasajero());
    await f.waitForFunction(() => /No pudimos cargar/.test(document.getElementById('carga')?.innerText || ''), null, { timeout: 25000 });
    await f.waitForTimeout(500);
    const texto = await f.evaluate(() => document.body.innerText);
    const guardado = await f.evaluate(() => Object.keys(localStorage).filter((k) => /^ct\.(?:pasajero|historial|a\.metodo)/.test(k)));
    ok(texto.includes('Reintentar') && !/Cootransrural|El Rosal/i.test(texto) && !guardado.length, 'si la ficha no carga: aviso con «Reintentar», sin datos de Cootransrural');
    await f.screenshot({ path: `${CAPTURAS}b03-sin-ficha.png` });
    await ctx3.close();
  }
}

/* ------------------------------------------------------------------ */
/* 5) Separación entre cooperativas (mismo navegador)                   */
/* ------------------------------------------------------------------ */
async function probarSeparacion(ctx, p) {
  for (const otra of OTRAS) {
    const fo = fichaDe(otra);
    const raiz = otra === 'cootransrural' ? BASE : `${BASE}${otra}/`;
    const pref = otra === 'cootransrural' ? 'ct.' : `ct.${otra}.`;
    const q = await ctx.newPage();
    vigilar(q, `separación ${otra}`);
    await q.goto(TAXICUN ? urlPasajero(otra) : `${raiz}app/?d=a`);
    await q.waitForSelector('.a-bienvenida .a-bien-diapo', { timeout: 20000 });
    await q.waitForTimeout(600);
    const bienvenida = await q.textContent('.a-bienvenida');
    const guardado = await q.evaluate((k) => ({ pasajero: localStorage.getItem(`${k}pasajero`), historial: JSON.parse(localStorage.getItem(`${k}historial.pasajero`) || '[]').length }), pref);
    ok(!guardado.pasajero && guardado.historial === 0 && bienvenida.includes(fo.EMPRESA.nombreCorto || fo.EMPRESA.nombre) && !bienvenida.includes(NOMBRE), `${otra}: el pasajero de ${EMPRESA} no aparece registrado (sale la bienvenida de ${fo.EMPRESA.nombreCorto || fo.EMPRESA.nombre})`);
    await q.screenshot({ path: `${CAPTURAS}s-${otra}-1-bienvenida.png` });
    // Con otra persona registrada allí, «Mis viajes» está vacío: no hereda el historial de aquí.
    await q.evaluate((k) => localStorage.setItem(`${k}pasajero`, JSON.stringify({ id: 'p-otra', nombre: 'Pedro Pérez', celular: '3001112233', calificacion: 5, verificado: true })), pref);
    await q.reload();
    await vista(q, 'inicio', 20000);
    await q.waitForTimeout(800);
    ok((await q.textContent('[data-nombre]')).trim() === 'Pedro', `${otra}: saluda a su propio pasajero (Pedro), no a Ana`);
    await q.click('[data-menu]');
    await q.waitForTimeout(500);
    await q.click('.a-menu-item:has-text("Mis viajes")');
    await q.waitForTimeout(700);
    const panel = await q.textContent('.a-panel.a-abierto');
    ok(panel.includes('Aún no tienes viajes') && !panel.includes(DESTINO), `${otra}: «Mis viajes» vacío, sin el historial de ${EMPRESA}`);
    await q.screenshot({ path: `${CAPTURAS}s-${otra}-2-mis-viajes.png` });
    await q.close();
  }
  const intacto = await p.evaluate(([k, h]) => JSON.parse(localStorage.getItem(k) || 'null')?.nombre === 'Ana María Gómez' && JSON.parse(localStorage.getItem(h) || '[]').length >= 2, [`${PREFIJO}pasajero`, `${PREFIJO}historial.pasajero`]);
  ok(intacto, `después de abrir ${OTRAS.join(' y ')}, el registro y el historial de ${EMPRESA} siguen intactos`);
}

/* ------------------------------------------------------------------ */
/* 5b) TaxiCun: «Cambiar de municipio» vuelve a la lista de municipios   */
/* ------------------------------------------------------------------ */
async function probarCambiarMunicipio(p, rol) {
  if (await p.$('.a-panel.a-abierto [data-cerrar]')) {
    await p.click('.a-panel.a-abierto [data-cerrar]');
    await p.waitForTimeout(400);
  }
  await p.click('[data-menu]');
  await p.waitForTimeout(500);
  await p.click('.a-menu-item:has-text("Ajustes")');
  await p.waitForSelector('.a-panel.a-abierto [data-cambiar-municipio]');
  await p.waitForTimeout(500);
  await p.click('.a-panel.a-abierto [data-cambiar-municipio]');
  const destino = `${BASE}${rol === 'conductor' ? 'taxicun/conductor/' : 'taxicun/'}?elegir=1`;
  await p.waitForURL((u) => u.href === destino, { timeout: 15000 }).catch(() => {});
  ok(p.url() === destino, `TaxiCun (${rol}): «Cambiar de municipio» lleva a ${destino.replace(BASE, '')} (${p.url()})`);
  await p.waitForSelector('#elegir:not([hidden]) [data-id]', { timeout: 15000 }).catch(() => {});
  ok(Boolean(await p.$(`#elegir:not([hidden]) [data-id="${EMPRESA}"]`)), `TaxiCun (${rol}): se ve la lista de municipios con ${PUEBLO}`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${CAPTURAS}${rol === 'conductor' ? 'c21' : 'p35'}-elegir-municipio.png` });
}

/* ------------------------------------------------------------------ */
/* 6) Ruta con tarifa fija                                              */
/* ------------------------------------------------------------------ */
async function probarRutaFija() {
  if (!RUTA_FIJA) {
    ok(!(FICHA.RUTAS || []).length, 'la ficha no tiene rutas fijas para probar');
    return;
  }
  const ctx = await navegador.newContext(movil);
  await ctx.addInitScript((k) => {
    localStorage.setItem('ct.envivo', 'no');
    localStorage.setItem(k, JSON.stringify({ id: 'p-ruta', nombre: 'Marta Ruiz', celular: '3115550001', calificacion: 5, verificado: true }));
  }, `${PREFIJO}pasajero`);
  const p = await ctx.newPage();
  vigilar(p, 'ruta-fija');
  await p.goto(urlPasajero());
  await vista(p, 'inicio', 30000);
  await p.waitForTimeout(1500);
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto');
  await p.click(`.a-cat[data-cat="${RUTA_FIJA.lugar.cat}"]`);
  await p.click(`.a-buscador .a-fila:has-text("${RUTA_FIJA.lugar.nombre}")`);
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 30000 });
  await p.click('[data-detalle]');
  await p.waitForTimeout(800);
  const detalle = await p.textContent('[data-detalle-lista]');
  const concepto = `Tarifa fija ${PUEBLO} → ${RUTA_FIJA.destino}`;
  ok(detalle.includes(concepto) && detalle.replace(/\D/g, '').includes(String(RUTA_FIJA.valor)), `ruta fija: «${concepto}» por $${RUTA_FIJA.valor.toLocaleString('es-CO')}`);
  ok((await p.textContent('[data-ruta-sub]')).includes('tarifa fija'), 'ruta fija: el resumen dice «ruta con tarifa fija»');
  await foto(p, 'f01-ruta-fija');
  await ctx.close();
}

await Promise.all([
  probarPasajero().catch((e) => { fallas++; console.log(`✘ pasajero: ${e.message}`); }),
  probarConductor().catch((e) => { fallas++; console.log(`✘ conductor: ${e.message}`); }),
  probarEscritorio().catch((e) => { fallas++; console.log(`✘ escritorio: ${e.message}`); }),
  probarBordes().catch((e) => { fallas++; console.log(`✘ bordes: ${e.message}`); }),
  probarRutaFija().catch((e) => { fallas++; console.log(`✘ ruta fija: ${e.message}`); }),
]);

ok(errores.length === 0, `sin errores de JavaScript${errores.length ? `:\n   ${errores.slice(0, 8).join('\n   ')}` : ''}`);
ok(problemasTexto.length === 0, `texto visible limpio en todas las capturas (sin null/undefined${PRINCIPAL ? '' : ' ni datos de Cootransrural'})${problemasTexto.length ? `:\n   ${[...new Set(problemasTexto)].slice(0, 12).join('\n   ')}` : ''}`);
await navegador.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · ${EMPRESA}${TAXICUN ? ' (TaxiCun)' : ''} · ${fallas} fallas · ${seg()} · capturas en ${CAPTURAS}`);
process.exit(fallas ? 1 : 0);
