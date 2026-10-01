// Prueba de punta a punta de la app única TaxiCun, como la usaría una persona
// (celular de 390×844):
//  a) escanea el sticker de un taxi de Coptaxi (QR leído de la vista previa de
//     facatativa/stickers/) → facatativa/descargar/?movil=… → «Abrir TaxiCun» →
//     TaxiCun con Coptaxi y su diseño (aunque el GPS diga otro municipio);
//  b) abre TaxiCun sin nada, con el GPS en El Rosal → Cootransrural con el diseño
//     que eligió; se registra, pide un taxi simulado completo (hasta calificar) y
//     «Soy conductor» lleva a taxicun/conductor/?e=cootransrural;
//  c) «Cambiar de municipio» → lista → Tenjo → abre Tenjo; al volver a abrir
//     TaxiCun (también como app instalada) sigue en Tenjo;
//  d) GPS en Bogotá → «TaxiCun aún no llega a tu municipio»;
//  e) sin permiso de GPS → lista de municipios;
//  f) web de Madrid → «Pedir taxi» → TaxiCun con Madrid;
//  g) cooperativas/ → «Abrir TaxiCun» → la cooperativa del GPS.
// Además: el diseño sale de la ficha (si la ficha dice «c», TaxiCun abre el C),
// el diseño escogido en Ajustes es por cooperativa, ?e= inválido cae al GPS, el
// conductor también elige por GPS, y no hay «null», «undefined» ni enlaces que
// caigan fuera de TaxiCun o en la raíz de Cootransrural.
//
// Uso: node pruebas/taxicun.mjs [url_base]   (capturas en /tmp/cootrans/capturas/tc-rev/ o $CAPTURAS)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8785/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/tc-rev').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const ficha = (id) => JSON.parse(readFileSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url), 'utf8'));
// «auto» (o sin diseño en la ficha): la A de 6 a. m. a 6 p. m. y la C de noche (hora de Colombia).
const disenoPorHora = () => {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h >= 18 || h < 6 ? 'c' : 'a';
};
const disenoDe = (id) => (/^[abc]$/.test(ficha(id).diseno || '') ? ficha(id).diseno : disenoPorHora());
const nombreDe = (id) => ficha(id).EMPRESA.nombreCorto || ficha(id).EMPRESA.nombre;

const LUGAR = {
  elRosal: { latitude: 4.8531, longitude: -74.2611 },
  faca: { latitude: 4.8143, longitude: -74.3546 },
  bogota: { latitude: 4.6097, longitude: -74.0817 },
  subachoque: { latitude: 4.928, longitude: -74.174 },
};

const resultados = [];
const errores = [];
function ok(c, m) {
  resultados.push({ ok: Boolean(c), m });
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (!c) process.exitCode = 1;
}

const b = await chromium.launch({ executablePath: EXE });

async function contexto(geo) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'es-CO', timezoneId: 'America/Bogota',
    ...(geo ? { geolocation: geo, permissions: ['geolocation'] } : { permissions: [] }),
  });
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  return ctx;
}
function vigilar(p, nombre) {
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource|net::ERR_|status of \d{3}|CORS policy/.test(m.text()) && url && !url.startsWith(BASE)) return;
    errores.push(`[${nombre}] ${m.text()}${url ? ` (${url})` : ''}`);
  });
  // Nada del sitio puede responder 404 (rutas relativas rotas).
  p.on('response', (r) => { if (r.url().startsWith(BASE) && r.status() === 404) errores.push(`[${nombre}] 404 ${r.url()}`); });
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` });

// Espera a que TaxiCun termine: la app montada (sin pantalla de carga) o la lista de municipios.
async function esperarTaxiCun(p) {
  await p.waitForFunction(() => (!document.getElementById('carga') && document.getElementById('app')?.children.length) || (document.getElementById('elegir') && !document.getElementById('elegir').hidden), null, { timeout: 30000 });
  await p.waitForTimeout(600);
  return p.evaluate(() => ({
    empresa: window.CT_EMPRESA || null,
    diseno: document.documentElement.dataset.diseno || null,
    lista: !document.getElementById('elegir').hidden,
    titulo: document.querySelector('.tc-elegir-cabeza h1')?.textContent || '',
    detalle: document.querySelector('.tc-elegir-cabeza p')?.textContent || '',
    ruta: location.pathname.replace(/^.*?\/taxicun\//, 'taxicun/'),
    e: new URLSearchParams(location.search).get('e'),
    texto: document.body.innerText,
  }));
}

// Texto de la pantalla sin «null»/«undefined» y con la marca «TaxiCun · <cooperativa>».
function revisarPantalla(r, donde, id) {
  const vacio = r.texto.match(/\b(null|undefined|NaN)\b/);
  ok(!vacio, `${donde}: sin «null», «undefined» ni «NaN»${vacio ? ` (aparece «${vacio[0]}»)` : ''}`);
  if (id) ok(r.texto.replace(/\s+/g, ' ').includes(`TaxiCun · ${nombreDe(id)}`), `${donde}: se ve «TaxiCun · ${nombreDe(id)}»`);
  ok(!/\bde interOS\b|app de interOS|propuesta de interOS/i.test(r.texto), `${donde}: no dice que la app es «de interOS»`);
}

// Todos los enlaces visibles de la app deben quedarse en TaxiCun o en la cooperativa correcta.
async function revisarEnlaces(p, id, donde) {
  const malos = await p.evaluate(({ id, base }) => {
    const pre = id === 'cootransrural' ? '' : `${id}/`;
    return [...document.querySelectorAll('#app a[href]')].map((a) => a.href).filter((h) => h.startsWith(base)).filter((h) => {
      const u = new URL(h);
      const ruta = u.pathname.slice(new URL(base).pathname.length);
      if (ruta.startsWith('taxicun/')) return !(u.searchParams.get('e') === id || u.searchParams.get('elegir'));
      if (/^(img|vendor|fuentes|pagar|empresas)\//.test(ruta)) return false;
      // Páginas de la cooperativa (privacidad, descargar…): las suyas, nunca las de
      // Cootransrural por accidente; y nunca sus apps propias (dentro de TaxiCun se queda en taxicun/).
      const otra = /^(subachoque|tabio|tenjo|madrid|villeta|la-vega|facatativa)\//;
      const suya = pre ? ruta.startsWith(pre) : !otra.test(ruta);
      return !suya || /^(app|conductor)\//.test(ruta.slice(pre.length));
    });
  }, { id, base: BASE });
  ok(!malos.length, `${donde}: los enlaces se quedan en TaxiCun o en las páginas de ${nombreDe(id)}${malos.length ? ` (${malos.slice(0, 4).join(', ')})` : ''}`);
}

/* ------------------------------------------------------------------ */
/* a) Sticker de un taxi de Coptaxi                                    */
/* ------------------------------------------------------------------ */
console.log('— a) Sticker de Coptaxi —');
{
  const ctx = await contexto(LUGAR.elRosal); // el GPS dice El Rosal: manda el sticker
  const p = await ctx.newPage();
  vigilar(p, 'a-sticker');
  await p.goto(`${BASE}facatativa/stickers/`);
  await p.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 25000 });
  await p.addScriptTag({ url: `${BASE}vendor/jsQR.min.js` });
  await p.waitForTimeout(500);
  const png = await (await p.$('#vista')).screenshot();
  const leido = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = Object.assign(document.createElement('canvas'), { width: img.naturalWidth, height: img.naturalHeight });
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    return window.jsQR(d.data, d.width, d.height)?.data ?? null;
  }, png.toString('base64'));
  ok(leido === `${BASE}facatativa/descargar/?movil=001&o=sticker`, `el QR del sticker se lee: ${leido}`);
  await p.goto(leido || `${BASE}facatativa/descargar/?movil=001&o=sticker`);
  await p.waitForSelector('#chip-movil:not([hidden])', { timeout: 15000 });
  const d = await p.evaluate(() => ({ movil: document.getElementById('numero-movil').textContent, titulo: document.title, pedir: document.getElementById('pedir').href, conductor: document.getElementById('enlace-conductor').href, texto: document.body.innerText }));
  ok(d.movil === '001' && /Móvil 001 · TaxiCun · Coptaxi/.test(d.titulo), `descargar: «Escaneaste el sticker del móvil 001» (${d.titulo})`);
  ok(d.pedir === `${BASE}taxicun/?e=facatativa&movil=001`, `descargar: «Abrir TaxiCun» → ${d.pedir.replace(BASE, '')}`);
  ok(d.conductor === `${BASE}taxicun/conductor/?e=facatativa`, `descargar: conductores → ${d.conductor.replace(BASE, '')}`);
  // «Si viajas a El Rosal o a Madrid…» (municipios vecinos) sí puede salir; Cootransrural no.
  ok(/Descarga TaxiCun/.test(d.texto) && /Coptaxi/.test(d.texto) && !/Cootransrural/.test(d.texto), 'descargar: dice TaxiCun y Coptaxi, nada de Cootransrural');
  ok(!/\b(null|undefined)\b/.test(d.texto) && !/\bde interOS\b/.test(d.texto), 'descargar: sin «null»/«undefined» y sin «de interOS»');
  await foto(p, 'a1-descargar-sticker');
  await Promise.all([p.waitForURL(/\/taxicun\/\?/, { timeout: 15000 }), p.click('#pedir')]);
  const r = await esperarTaxiCun(p);
  ok(r.empresa === 'facatativa' && r.e === 'facatativa' && !r.lista, `«Abrir TaxiCun» abre Coptaxi aunque el GPS esté en El Rosal (${r.ruta}?e=${r.e})`);
  ok(r.diseno === disenoDe('facatativa'), `Coptaxi abre con el diseño que eligió (${r.diseno}; ficha: ${disenoDe('facatativa')})`);
  ok(await p.evaluate(() => localStorage.getItem('ct.facatativa.referido')) === '001', 'TaxiCun guarda que el pasajero llegó por el móvil 001 (en Coptaxi)');
  ok(await p.evaluate(() => localStorage.getItem('taxicun.empresa')) === null, 'el sticker no fija la cooperativa para siempre (la próxima vez manda el GPS)');
  ok(await p.evaluate(() => new URL(document.querySelector('link[rel="manifest"]').href).pathname.endsWith('/taxicun/manifest.webmanifest')), 'la página tiene el manifiesto de TaxiCun (se puede instalar)');
  revisarPantalla(r, 'bienvenida de Coptaxi', 'facatativa');
  ok(/Demostración de TaxiCun para/.test(r.texto), 'Coptaxi (propuesta): franja «Demostración de TaxiCun para …»');
  await revisarEnlaces(p, 'facatativa', 'bienvenida de Coptaxi');
  await foto(p, 'a2-taxicun-coptaxi');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* b) TaxiCun sin nada, GPS en El Rosal; viaje simulado completo       */
/* ------------------------------------------------------------------ */
console.log('— b) GPS en El Rosal y viaje completo —');
const ctxB = await contexto(LUGAR.elRosal);
{
  const p = await ctxB.newPage();
  vigilar(p, 'b-el-rosal');
  await p.goto(`${BASE}taxicun/`);
  const r = await esperarTaxiCun(p);
  ok(r.empresa === 'cootransrural' && r.e === 'cootransrural' && !r.lista, `GPS en El Rosal → Cootransrural (${r.ruta}?e=${r.e})`);
  ok(r.diseno === disenoDe('cootransrural'), `Cootransrural abre con su diseño (${r.diseno})`);
  revisarPantalla(r, 'bienvenida de Cootransrural', 'cootransrural');
  ok(!/Demostración de TaxiCun/.test(r.texto), 'Cootransrural (cliente): sin franja de demostración');
  await foto(p, 'b1-gps-el-rosal');
  // El viaje por la interfaz está escrito para el diseño B: se abre con ?d=b.
  if (r.diseno !== 'b') {
    await p.goto(`${BASE}taxicun/?e=cootransrural&d=b`);
    await esperarTaxiCun(p);
  }
  {
    await p.click('[data-accion="reg-empezar"]');
    await p.fill('input[name="nombre"]', 'Lucía Prueba');
    await p.fill('input[name="celular"]', '311 222 3344');
    await p.check('input[name="terminos"]');
    await p.click('form[data-form="registro"] button[type="submit"]');
    await p.waitForSelector('[data-codigo-prueba]');
    await p.fill('#vb-codigo-sms', (await p.textContent('[data-codigo-prueba]')).trim());
    await p.waitForSelector('.vb-inicio', { timeout: 15000 });
    await p.waitForTimeout(1200);
    await foto(p, 'b2-inicio');
    const ini = await p.evaluate(() => document.body.innerText);
    revisarPantalla({ texto: ini }, 'inicio de Cootransrural', null);
    await revisarEnlaces(p, 'cootransrural', 'inicio de Cootransrural');
    await p.click('.vb-pedir .vb-btn-oro');
    await p.waitForSelector('.vb-paso1 .vb-pin-fijo');
    await p.click('[data-accion="confirmar-recogida"]');
    await p.waitForSelector('.vb-paso2');
    await p.fill('[data-campo="busqueda"]', 'Tierra Grata');
    await p.waitForSelector('[data-resultados] .vb-lugar');
    await p.waitForTimeout(1500);
    await p.locator('[data-resultados] .vb-lugar', { hasText: 'Vía a Facatativá' }).first().click();
    await p.waitForSelector('.vb-paso3');
    await p.waitForFunction(() => !document.querySelector('[data-tarifa-total] .vb-esqueleto'), null, { timeout: 15000 });
    const tarifa = (await p.textContent('[data-tarifa-total]')).trim();
    ok(/\$\s?\d/.test(tarifa), `tarifa estimada a Tierra Grata (${tarifa})`);
    await p.click('[data-accion="pago"][data-metodo="qr"]');
    await p.waitForFunction(() => !/Calculando/.test(document.querySelector('[data-boton-pedir]')?.textContent || ''), null, { timeout: 15000 });
    await foto(p, 'b3-confirmar');
    await p.click('[data-accion="pedir-taxi"]');
    await p.waitForSelector('.vb-seg.fase-buscando', { timeout: 20000 });
    await p.waitForSelector('.vb-seg.fase-asignado', { timeout: 45000 });
    const carne = await p.textContent('.vb-carne');
    ok(/Verificado por Cootransrural/.test(carne), 'conductor asignado, «Verificado por Cootransrural»');
    await foto(p, 'b4-asignado');
    await p.waitForSelector('.vb-seg.fase-llego', { timeout: 90000 });
    await p.waitForSelector('.vb-seg.fase-en_viaje', { timeout: 30000 });
    await foto(p, 'b5-en-viaje');
    await p.waitForSelector('.vb-pagar', { timeout: 120000 });
    await foto(p, 'b6-pagar');
    await p.click('[data-accion="billetera"][data-id="nequi"]');
    await p.click('.vb-pago-qr [data-accion="simular-pago"]');
    await p.waitForSelector('.vb-calificar', { timeout: 15000 });
    await p.click('[data-accion="estrella"][data-n="5"]');
    await p.click('[data-accion="enviar-calificacion"]');
    await p.waitForSelector('.vb-inicio', { timeout: 15000 });
    ok(true, 'viaje simulado completo: pedir → asignado → en la puerta → viaje → pago QR de prueba → calificar');
    await p.click('.vb-pestana[data-pantalla="viajes"]');
    await p.waitForSelector('.vb-viajes .vb-viaje');
    ok(/Tierra Grata/.test(await p.locator('.vb-viajes .vb-viaje').first().textContent()), 'el viaje aparece en Mis viajes');
    await p.click('.vb-pestana[data-pantalla="perfil"]');
    await p.waitForSelector('.vb-perfil');
    await foto(p, 'b7-perfil');
    await revisarEnlaces(p, 'cootransrural', 'perfil de Cootransrural');
    await Promise.all([p.waitForURL(/\/taxicun\/conductor\/\?/, { timeout: 15000 }), p.click('.vb-perfil a[data-enlace-conductor]')]);
    const c = await esperarTaxiCun(p);
    ok(c.ruta === 'taxicun/conductor/' && c.e === 'cootransrural' && c.empresa === 'cootransrural', `«Soy conductor» → ${c.ruta}?e=${c.e}`);
    revisarPantalla(c, 'ingreso del conductor de Cootransrural', 'cootransrural');
    await revisarEnlaces(p, 'cootransrural', 'ingreso del conductor de Cootransrural');
    await foto(p, 'b8-conductor');
  }
  await p.close();
}

/* ------------------------------------------------------------------ */
/* c) Cambiar de municipio → Tenjo; al volver a abrir sigue en Tenjo   */
/* ------------------------------------------------------------------ */
console.log('— c) Cambiar de municipio —');
{
  const p = await ctxB.newPage();
  vigilar(p, 'c-municipio');
  await p.goto(`${BASE}taxicun/?d=b`);
  let r = await esperarTaxiCun(p);
  ok(r.empresa === 'cootransrural', 'volviendo a abrir sin nada (GPS El Rosal) sigue en Cootransrural');
  const enlace = p.locator('[data-cambiar-municipio]').first();
  if (r.diseno === 'b') {
    await p.click('.vb-pestana[data-pantalla="perfil"]');
    await p.waitForSelector('.vb-perfil');
  }
  await Promise.all([p.waitForURL(/\/taxicun\/\?elegir=1$/, { timeout: 15000 }), enlace.click()]);
  r = await esperarTaxiCun(p);
  ok(r.lista && /¿En qué municipio estás\?/.test(r.titulo), `«Cambiar de municipio» → lista («${r.titulo}»)`);
  const pueblos = await p.$$eval('#elegir [data-id] b', (bs) => bs.map((x) => x.textContent));
  const totalEmpresas = JSON.parse(readFileSync(new URL('../empresas/indice.json', import.meta.url), 'utf8')).cooperativas.length;
  ok(pueblos.length === totalEmpresas && pueblos.includes('Tenjo') && pueblos.includes('El Rosal'), `la lista tiene las ${totalEmpresas} empresas (${pueblos.join(', ')})`);
  ok(!/\b(null|undefined)\b/.test(r.texto) && /TaxiCun · desarrollada por interOS/.test(r.texto), 'lista: «TaxiCun · desarrollada por interOS» y sin «null»');
  await foto(p, 'c1-lista');
  await p.click('#elegir [data-id="tenjo"]');
  r = await esperarTaxiCun(p);
  ok(r.empresa === 'tenjo' && r.e === 'tenjo' && r.diseno === disenoDe('tenjo'), `escogió Tenjo → TaxiCun Tenjo (diseño ${r.diseno})`);
  revisarPantalla(r, 'bienvenida de Tenjo', 'tenjo');
  ok(!/Cootransrural/.test(r.texto), 'Tenjo no muestra nada de Cootransrural');
  await foto(p, 'c2-tenjo');
  const p2 = await ctxB.newPage();
  vigilar(p2, 'c-reabrir');
  await p2.goto(`${BASE}taxicun/`);
  r = await esperarTaxiCun(p2);
  ok(r.empresa === 'tenjo', `al volver a abrir TaxiCun (GPS en El Rosal) sigue en Tenjo (${r.empresa})`);
  await p2.goto(`${BASE}taxicun/?o=app`);
  r = await esperarTaxiCun(p2);
  ok(r.empresa === 'tenjo', `como app instalada (start_url ?o=app) abre Tenjo (${r.empresa})`);
  await p2.goto(`${BASE}taxicun/conductor/`);
  r = await esperarTaxiCun(p2);
  ok(r.empresa === 'tenjo' && r.ruta === 'taxicun/conductor/', `el conductor también abre Tenjo (${r.empresa})`);
  revisarPantalla(r, 'ingreso del conductor de Tenjo', 'tenjo');
  await foto(p2, 'c3-conductor-tenjo');
  // «Usar mi ubicación» en la lista olvida la elección y vuelve a la cooperativa del GPS.
  await p2.goto(`${BASE}taxicun/?elegir=1`);
  await esperarTaxiCun(p2);
  await p2.click('#elegir [data-ubicacion]');
  r = await esperarTaxiCun(p2);
  ok(r.empresa === 'cootransrural' && await p2.evaluate(() => localStorage.getItem('taxicun.empresa')) === null, `«Usar mi ubicación» vuelve a la cooperativa del GPS (${r.empresa})`);
  await p.close();
  await p2.close();
}
await ctxB.close();

/* ------------------------------------------------------------------ */
/* d) GPS en Bogotá; e) sin permiso                                    */
/* ------------------------------------------------------------------ */
console.log('— d) Bogotá y e) sin GPS —');
{
  const ctx = await contexto(LUGAR.bogota);
  const p = await ctx.newPage();
  vigilar(p, 'd-bogota');
  await p.goto(`${BASE}taxicun/`);
  const r = await esperarTaxiCun(p);
  ok(r.lista && r.titulo === 'TaxiCun aún no llega a tu municipio', `GPS en Bogotá → «${r.titulo}»`);
  const km = await p.$$eval('#elegir [data-id] small', (s) => s.map((x) => x.textContent));
  ok(km.every((t) => / · a \d+ km$/.test(t)), `la lista dice a cuántos km está cada una (${km[0]})`);
  await foto(p, 'd1-bogota');
  await ctx.close();
}
{
  const ctx = await contexto(null);
  const p = await ctx.newPage();
  vigilar(p, 'e-sin-gps');
  await p.goto(`${BASE}taxicun/`);
  const r = await esperarTaxiCun(p);
  ok(r.lista && r.titulo === '¿En qué municipio estás?' && /No pudimos ver tu ubicación/.test(r.detalle), `sin permiso de GPS → lista («${r.detalle}»)`);
  await foto(p, 'e1-sin-gps');
  await p.click('#elegir [data-id="subachoque"]');
  const r2 = await esperarTaxiCun(p);
  ok(r2.empresa === 'subachoque', 'sin GPS, escoger Subachoque abre Subachoque');
  revisarPantalla(r2, 'bienvenida de Subachoque', 'subachoque');
  // ?e= que no existe: no se rompe, cae a la elección guardada.
  await p.goto(`${BASE}taxicun/?e=bogota`);
  const r3 = await esperarTaxiCun(p);
  ok(r3.empresa === 'subachoque', `?e= de una cooperativa que no existe → la elección guardada (${r3.empresa})`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* f) Web de Madrid → «Pedir taxi»; g) cooperativas/ → «Abrir TaxiCun» */
/* ------------------------------------------------------------------ */
console.log('— f) Web de Madrid y g) portada de cooperativas —');
{
  const ctx = await contexto(LUGAR.faca); // el GPS dice Facatativá: manda el botón de la web
  const p = await ctx.newPage();
  vigilar(p, 'f-madrid');
  await p.goto(`${BASE}madrid/`);
  await p.waitForSelector('#pedir-taxi');
  await Promise.all([p.waitForURL(/\/taxicun\/\?/, { timeout: 15000 }), p.click('#pedir-taxi')]);
  const r = await esperarTaxiCun(p);
  ok(r.empresa === 'madrid' && r.e === 'madrid' && r.diseno === disenoDe('madrid'), `web de Madrid → «Pedir taxi» → TaxiCun Madrid (diseño ${r.diseno})`);
  revisarPantalla(r, 'bienvenida de Madrid', 'madrid');
  await revisarEnlaces(p, 'madrid', 'bienvenida de Madrid');
  await foto(p, 'f1-madrid');

  const g = await ctx.newPage();
  vigilar(g, 'g-cooperativas');
  await g.goto(`${BASE}cooperativas/`);
  const portada = await g.evaluate(() => document.body.innerText);
  ok(!/\b(null|undefined)\b/.test(portada) && !/app de interOS|\bde interOS\b/.test(portada), 'cooperativas/: sin «null» y sin «de interOS»');
  await foto(g, 'g1-cooperativas');
  await Promise.all([g.waitForURL(/\/taxicun\/$/, { timeout: 15000 }), g.click('a.boton-amarillo[href$="taxicun/"]')]);
  const rg = await esperarTaxiCun(g);
  ok(rg.empresa === 'facatativa' && !rg.lista, `cooperativas/ → «Abrir TaxiCun» → la del GPS (Facatativá: ${rg.empresa})`);
  await foto(g, 'g2-abrir-taxicun');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* Conductor por GPS y diseño de la ficha                               */
/* ------------------------------------------------------------------ */
console.log('— Conductor por GPS y diseño que eligió la cooperativa —');
{
  const ctx = await contexto(LUGAR.subachoque);
  const p = await ctx.newPage();
  vigilar(p, 'conductor-gps');
  await p.goto(`${BASE}taxicun/conductor/`);
  const r = await esperarTaxiCun(p);
  ok(r.empresa === 'subachoque' && r.ruta === 'taxicun/conductor/', `conductor con GPS en Subachoque → Subachoque (${r.empresa})`);
  revisarPantalla(r, 'ingreso del conductor de Subachoque', 'subachoque');
  await revisarEnlaces(p, 'subachoque', 'ingreso del conductor de Subachoque');
  await foto(p, 'h1-conductor-subachoque');
  await ctx.close();
}
for (const d of ['a', 'c']) {
  // Si la cooperativa elige otro diseño (ficha.diseno), TaxiCun lo monta.
  const ctx = await contexto(LUGAR.elRosal);
  await ctx.route('**/empresas/tenjo/ficha.json*', async (ruta) => {
    const resp = await ruta.fetch();
    const j = await resp.json();
    j.diseno = d;
    await ruta.fulfill({ response: resp, json: j });
  });
  const p = await ctx.newPage();
  vigilar(p, `ficha-${d}`);
  await p.goto(`${BASE}taxicun/?e=tenjo`);
  const r = await esperarTaxiCun(p);
  ok(r.empresa === 'tenjo' && r.diseno === d, `si Tenjo elige el diseño ${d.toUpperCase()}, TaxiCun lo abre con ese (${r.diseno})`);
  revisarPantalla(r, `Tenjo con el diseño ${d.toUpperCase()}`, 'tenjo');
  await revisarEnlaces(p, 'tenjo', `Tenjo con el diseño ${d.toUpperCase()}`);
  await foto(p, `i-tenjo-diseno-${d}`);
  // Conductor con ese diseño.
  await p.goto(`${BASE}taxicun/conductor/?e=tenjo`);
  const rc = await esperarTaxiCun(p);
  ok(rc.diseno === d, `conductor de Tenjo con el diseño ${d.toUpperCase()} (${rc.diseno})`);
  revisarPantalla(rc, `conductor de Tenjo, diseño ${d.toUpperCase()}`, 'tenjo');
  await revisarEnlaces(p, 'tenjo', `conductor de Tenjo, diseño ${d.toUpperCase()}`);
  await foto(p, `i-tenjo-conductor-diseno-${d}`);
  // El diseño que la persona escoge en Ajustes es solo para esa cooperativa.
  await p.evaluate(() => localStorage.setItem('ct.tenjo.diseno', 'b'));
  await p.goto(`${BASE}taxicun/?e=tenjo`);
  const ra = await esperarTaxiCun(p);
  ok(ra.diseno === 'b', `si la persona escogió B en Ajustes, Tenjo abre con B (${ra.diseno})`);
  await p.goto(`${BASE}taxicun/?e=madrid`);
  const rm = await esperarTaxiCun(p);
  ok(rm.diseno === disenoDe('madrid'), `…y Madrid sigue con el suyo (${rm.diseno})`);
  await ctx.close();
}

console.log(`\nErrores de la página: ${errores.length ? `\n  ${[...new Set(errores)].join('\n  ')}` : 'ninguno'}`);
ok(!errores.length, 'sin errores de JavaScript ni 404 del sitio');
const fallas = resultados.filter((x) => !x.ok);
console.log(`\n${fallas.length ? 'FALLÓ' : 'PASÓ'}: ${resultados.length - fallas.length} ✔, ${fallas.length} ✘ · capturas en ${DIR}`);
await b.close();
