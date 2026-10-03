// Prueba de la tienda TaxiCun GPS (gps/) en Chromium sin pantalla, contra el receptor falso
// (pruebas/gps-servidor-falso.mjs, que sirve el sitio con una CSP estricta y OBLIGATORIA):
//  - escritorio (1280×800) y celular (390×844): sin errores de JS, 0 violaciones de CSP, nada pedido a terceros,
//    sin desbordes a lo ancho, imágenes cargadas, enlaces internos y anclas que existen;
//  - oculta mientras sea borrador: noindex, «(borrador)» en el título, la franja y la etiqueta en cada precio;
//    ninguna otra página del sitio (ni el service worker) la enlaza;
//  - los precios son los de herramientas/gps-planes.json (calculados aquí por separado);
//  - el formulario: errores en español sin enviar nada, envío correcto con el contrato exacto (JSON cerrado,
//    mismo origen, sin cookies, menos de 4 KB, nada en la dirección), éxito, y el respaldo a info@ cuando el
//    servidor responde 404, 500, HTML, no responde o no hay red; un solo envío con doble clic; sin JavaScript,
//    el aviso para escribir al correo;
//  - la página no guarda nada en el navegador (ni localStorage, ni sessionStorage, ni cookies);
//  - capturas para la revisión de Oscar en la carpeta de capturas.
// Uso: node pruebas/gps-tienda.mjs [carpeta_capturas]   (levanta el receptor falso en 127.0.0.1:4641)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearServidor } from './gps-servidor-falso.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CAPTURAS = process.argv[2] || '/tmp/cootrans/gps/tienda/capturas';
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PUERTO = Number(process.env.PUERTO_TIENDA || 4641);
mkdirSync(CAPTURAS, { recursive: true });

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fallas++; };

// ---------------------------------------------------------------- lo esperado, calculado aquí
const PLANES = JSON.parse(readFileSync(join(RAIZ, 'herramientas/gps-planes.json'), 'utf8'));
const pesos = (n) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
const SHA = createHash('sha256').update(PLANES.autorizacion.texto, 'utf8').digest('hex');
const esperados = [];
for (const p of PLANES.planes) esperados.push(pesos(p.al_instalar), pesos(p.mes), pesos(p.al_instalar + 12 * p.mes));
for (const v of PLANES.combo.variantes) esperados.push(pesos(v.mes));
const N_COOPS = JSON.parse(readFileSync(join(RAIZ, 'empresas/indice.json'), 'utf8')).cooperativas.length;

// ---------------------------------------------------------------- 1) nadie enlaza la tienda
{
  const enlaces = [];
  const omitir = new Set(['.git', 'node_modules', 'pruebas', 'herramientas', 'gps']);
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      const rel = relative(RAIZ, ruta);
      if (omitir.has(nombre) && dir === RAIZ.replace(/\/$/, '')) continue;
      if (rel === 'plantillas/_raiz/gps') continue;
      const st = statSync(ruta);
      if (st.isDirectory()) { recorrer(ruta); continue; }
      if (!/\.(html|js|mjs|json|webmanifest|xml|txt|css)$/.test(nombre)) continue;
      const texto = readFileSync(ruta, 'utf8');
      if (/(href|src|action)\s*=\s*["'][^"']*\bgps\/|taxicun\.com\/gps\b|['"`]\.?\/?gps\/['"`]/i.test(texto)) enlaces.push(rel);
    }
  };
  recorrer(RAIZ.replace(/\/$/, ''));
  ok(enlaces.length === 0, `ninguna otra página, script ni el service worker enlaza gps/${enlaces.length ? ': ' + enlaces.join(', ') : ''}`);
  ok(!/gps/i.test(readFileSync(join(RAIZ, 'sw.js'), 'utf8')), 'gps/ no está en el precacheo del service worker');
}

// ---------------------------------------------------------------- servidor y navegador
const { servidor, estado, url: BASE } = await crearServidor({ puerto: PUERTO });
const PAGINA = `${BASE}gps/`;
const origen = new URL(BASE).origin;
const navegador = await chromium.launch({ executablePath: EXE });

async function nuevaPagina(nombre, vista) {
  const contexto = await navegador.newContext(vista);
  const p = await contexto.newPage();
  const r = { contexto, p, errores: [], externos: [], fallidos: [] };
  await p.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.effectiveDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  p.on('console', (m) => { if (m.type() === 'error') r.errores.push(m.text()); });
  p.on('pageerror', (e) => r.errores.push(String(e)));
  p.on('request', (q) => { const u = q.url(); if (!u.startsWith(origen) && !u.startsWith('data:')) r.externos.push(u); });
  p.on('response', (s) => { if (s.status() >= 400 && !s.url().includes('/api/')) r.fallidos.push(`${s.status()} ${s.url()}`); });
  await p.goto(PAGINA, { waitUntil: 'networkidle' });
  return r;
}

// Captura de una parte de la página tal como se ve al bajar (desde la captura completa: sin la barra fija encima).
async function capturar(p, selector, archivo) {
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  const caja = await p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: 0, y: r.top + scrollY, width: innerWidth, height: r.height }; }, selector);
  await p.screenshot({ path: join(CAPTURAS, archivo), fullPage: true, clip: caja });
}

async function llenar(p, d) {
  await p.fill('#g-nombre', d.nombre ?? '');
  await p.fill('#g-celular', d.celular ?? '');
  await p.fill('#g-correo', d.correo ?? '');
  if (d.cooperativa) await p.selectOption('#g-cooperativa', d.cooperativa);
  await p.fill('#g-placa', d.placa ?? '');
  await p.fill('#g-taxis', String(d.taxis ?? 1));
  if (d.plan) await p.check(`input[name="plan"][value="${d.plan}"]`);
  await p.fill('#g-mensaje', d.mensaje ?? '');
  if (d.autorizo) await p.check('#g-autorizo'); else await p.uncheck('#g-autorizo');
}

const BUENOS = { nombre: '  María   Gómez ', celular: '+57 300 123 4567', correo: 'maria@ejemplo.co', cooperativa: 'cootransrural', placa: 'tax-123', taxis: 2, plan: 'sin_cuota', mensaje: 'Tengo dos taxis en El Rosal.', autorizo: true };

async function enviarYEsperar(p, que) {
  await p.click('.gps-enviar');
  await p.waitForSelector(`${que}:not([hidden])`, { timeout: 8000 });
}

async function volverAlFormulario(p) {
  if (await p.isVisible('#gps-respaldo')) await p.click('.gps-reintentar');
  if (await p.isVisible('#gps-listo')) { await p.reload({ waitUntil: 'networkidle' }); }
}

for (const [nombre, vista] of [
  ['escritorio', { viewport: { width: 1280, height: 800 } }],
  ['celular', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  console.log(`\n== ${nombre}`);
  const r = await nuevaPagina(nombre, vista);
  const { p } = r;

  // ---- oculta y en borrador
  const meta = await p.evaluate(() => ({
    robots: document.querySelector('meta[name="robots"]')?.content, titulo: document.title, lang: document.documentElement.lang,
    canonical: !!document.querySelector('link[rel="canonical"]'), franja: document.querySelector('.franja-borrador')?.textContent || '',
    h1: document.querySelectorAll('h1').length,
  }));
  ok(meta.robots === 'noindex, nofollow', `noindex, nofollow (${meta.robots})`);
  ok(/\(borrador\)/.test(meta.titulo), `título con «(borrador)»: ${meta.titulo}`);
  ok(/BORRADOR/.test(meta.franja) && /Precios por aprobar/i.test(meta.franja) && /no es una oferta/i.test(meta.franja), 'franja «BORRADOR · Precios por aprobar · Esta página aún no es una oferta»');
  ok(await p.isVisible('.franja-borrador'), 'la franja se ve arriba');
  ok(meta.lang === 'es-CO' && meta.h1 === 1 && !meta.canonical, 'es-CO, un solo h1, sin canonical');

  // ---- precios: los del JSON, cada uno con «borrador»
  const precios = await p.evaluate(() => [...document.querySelectorAll('.gps-precios > div')].map((d) => ({
    que: d.querySelector('dt').textContent.trim(), valor: d.querySelector('dd').childNodes[0].textContent.trim(), borrador: !!d.querySelector('.etiqueta-borrador'),
  })));
  const conValor = precios.filter((x) => x.que !== 'Primer año');
  ok(conValor.length === 8 && conValor.every((x) => x.borrador), `los ${conValor.length} precios (al instalar y cada mes) llevan la etiqueta «borrador»`);
  const visibles = precios.map((x) => x.valor);
  ok(esperados.every((e) => visibles.includes(e)), `precios iguales a gps-planes.json: ${esperados.join(' ')}`);
  const tabla = await p.evaluate(() => [...document.querySelectorAll('.gps-tabla tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()));
  ok(tabla.length === 2 + PLANES.competencia.otros.length && tabla[0].includes('$697.800') && tabla[1].includes('$598.800') && tabla[2].includes('$902.000'), 'comparación: TaxiCun y los otros (A $902.000 el primer año)');
  ok(!/SPIA|OnTrack|Atlas/i.test(await p.content()), 'la comparación no nombra marcas (D-G2)');

  // ---- carga sana
  const imgs = await p.evaluate(async () => {
    const lista = [...document.images];
    for (const i of lista) { i.loading = 'eager'; if (!i.complete) await new Promise((ok) => { i.onload = i.onerror = ok; }); }
    return lista.map((i) => ({ src: i.getAttribute('src'), ancho: i.naturalWidth, alt: i.getAttribute('alt') }));
  });
  ok(imgs.every((i) => i.ancho > 0), `imágenes cargadas (${imgs.length})`);
  ok(imgs.every((i) => i.alt !== null && (i.alt.length > 0 || /logo/.test(i.src))), 'todas las imágenes tienen texto alternativo');
  ok(imgs.filter((i) => i.src.includes('img/gps/')).length === 4, 'las 4 ilustraciones propias (img/gps/*.svg)');
  const anchos = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(anchos[0] <= anchos[1], `sin desborde a lo ancho (${anchos[0]} ≤ ${anchos[1]})`);
  ok(await p.isVisible('#formulario-gps'), 'el formulario se ve (el script le quita «hidden»)');
  ok(await p.evaluate(() => document.querySelectorAll('#g-cooperativa option[value]:not([value=""])').length) === N_COOPS + 1, `municipio y cooperativa: las ${N_COOPS} más «Otra»`);
  const sinEtiqueta = await p.evaluate(() => [...document.querySelectorAll('#formulario-gps input, #formulario-gps select, #formulario-gps textarea')]
    .filter((e) => e.name !== 'sitio_web' && e.type !== 'radio' && !document.querySelector(`label[for="${e.id}"]`)).map((e) => e.name));
  ok(sinEtiqueta.length === 0, `cada campo tiene su etiqueta${sinEtiqueta.length ? ': faltan ' + sinEtiqueta : ''}`);

  // ---- enlaces internos y anclas
  const enlaces = await p.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
  const anclas = enlaces.filter((h) => h.startsWith(`${PAGINA}#`)).map((h) => h.split('#')[1]);
  const faltan = await p.evaluate((ids) => ids.filter((id) => !document.getElementById(id)), anclas);
  ok(faltan.length === 0, `anclas que existen (${anclas.length})${faltan.length ? ': ' + faltan : ''}`);
  const correos = enlaces.filter((h) => h.startsWith('mailto:'));
  ok(correos.every((h) => h.startsWith('mailto:info@taxicun.com')), `correos solo a info@taxicun.com (${correos.length})`);
  const afuera = enlaces.filter((h) => !h.startsWith('mailto:') && !h.startsWith(origen));
  ok(afuera.length === 0, `sin enlaces a otros sitios${afuera.length ? ': ' + afuera : ''}`);
  for (const h of [...new Set(enlaces.filter((x) => x.startsWith(origen)).map((x) => x.split('#')[0]))]) {
    const s = await p.request.get(h);
    ok(s.status() === 200, `enlace ${h.replace(origen, '')} → ${s.status()}`);
  }

  // ---- capturas de la página
  await p.screenshot({ path: join(CAPTURAS, `${nombre}-00-arriba.png`) });
  await p.screenshot({ path: join(CAPTURAS, `${nombre}-pagina-completa.png`), fullPage: true });
  for (const [sel, arch] of [['.gps-portada', '01-portada'], ['#como', '02-como-funciona'], ['#ves', '03-mi-taxi'], ['#central', '04-central'], ['#equipo', '05-equipo'],
    ['#bloqueo', '06-bloqueo'], ['#instalacion', '07-instalacion'], ['#planes', '08-planes'], ['#compara', '09-compara'], ['#preguntas', '10-preguntas'], ['#quiero', '11-formulario']]) {
    // Las preguntas, abiertas: así se leen las respuestas en la captura.
    if (sel === '#preguntas') await p.evaluate(() => document.querySelectorAll('#preguntas details').forEach((d) => { d.open = true; }));
    await capturar(p, sel, `${nombre}-${arch}.png`);
  }

  // ---- formulario: vacío → errores, sin enviar nada
  estado.modo = 'ok'; estado.recibidos = [];
  await p.click('.gps-enviar');
  const errores = await p.evaluate(() => [...document.querySelectorAll('.campo-error:not([hidden])')].map((e) => e.id.replace('-error', '')));
  ok(['g-nombre', 'g-celular', 'g-cooperativa', 'g-autorizo'].every((id) => errores.includes(id)) && errores.length === 4, `vacío: errores en nombre, celular, cooperativa y autorización (${errores})`);
  ok(await p.evaluate(() => document.activeElement?.id) === 'g-nombre', 'vacío: el foco va al primer campo con error');
  ok(await p.evaluate(() => document.querySelector('#g-celular').getAttribute('aria-invalid')) === 'true', 'vacío: aria-invalid en los campos con error');
  await capturar(p, '.gps-formulario-caja', `${nombre}-12-formulario-errores.png`);
  // Datos malos: cada regla con su mensaje.
  await llenar(p, { nombre: 'www.spam.com', celular: '12345', correo: 'x@', cooperativa: 'otra', placa: 'AB12', taxis: 0, mensaje: 'mira https://x.co', autorizo: false });
  await p.click('.gps-enviar');
  const mensajes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.campo-error:not([hidden])')].map((e) => [e.id.replace('-error', ''), e.textContent])));
  ok(/sin enlaces/.test(mensajes['g-nombre'] || '') && /10 dígitos/.test(mensajes['g-celular'] || '') && /correo/.test(mensajes['g-correo'] || '')
    && /3 letras y 3 números/.test(mensajes['g-placa'] || '') && /de 1 a 500/.test(mensajes['g-taxis'] || '') && /enlaces/.test(mensajes['g-mensaje'] || '')
    && /autorización/.test(mensajes['g-autorizo'] || ''), `datos malos: un mensaje claro por campo (${Object.keys(mensajes).length})`);
  ok(estado.recibidos.length === 0, 'con errores no se envía nada');

  // ---- envío correcto (después de 3 s en la página, como una persona)
  await p.waitForFunction(() => performance.now() > 3300);
  await llenar(p, BUENOS);
  await enviarYEsperar(p, '#gps-listo');
  ok(await p.isVisible('#gps-listo') && !(await p.isVisible('#formulario-gps')), 'éxito: «¡Listo! Te llamamos en el próximo día hábil»');
  ok(await p.evaluate(() => document.activeElement?.id) === 'gps-listo', 'éxito: el foco va al mensaje');
  ok(estado.recibidos.length === 1, `un solo envío (${estado.recibidos.length})`);
  const rec = estado.recibidos[0] || {};
  const c = rec.cuerpo || {};
  ok(rec.problemas?.length === 0, `contrato cumplido (esquema cerrado, origen, JSON, < 4 KB)${rec.problemas?.length ? ': ' + rec.problemas : ''}`);
  ok(c.nombre === 'María Gómez' && c.celular === '3001234567' && c.placa === 'TAX123' && c.taxis === 2 && c.plan === 'sin_cuota' && c.cooperativa === 'cootransrural' && c.correo === 'maria@ejemplo.co',
    `normalizado: «${c.nombre}», ${c.celular}, ${c.placa}, ${c.taxis} taxis, ${c.plan}`);
  ok(c.autorizacion?.version === PLANES.autorizacion.version && c.autorizacion?.texto_sha === SHA, 'autorización: versión y huella del texto de la casilla');
  ok(c.sitio_web === '' && c.ms_en_pagina >= 3000, `trampa vacía y tiempo en la página (${c.ms_en_pagina} ms)`);
  ok(rec.origen === origen && /^application\/json/.test(rec.tipo) && rec.cookie === '' && rec.consulta === '' && rec.tam < 4096, `mismo origen, JSON, sin cookies, nada en la dirección, ${rec.tam} bytes`);
  ok(await p.evaluate(() => location.search === '' && !/maria|3001234567/i.test(location.href)), 'la dirección de la página no lleva datos');
  await capturar(p, '.gps-formulario-caja', `${nombre}-13-formulario-listo.png`);

  // ---- respaldo cuando el servidor no tiene GPS (404), falla (500), responde HTML, no responde o no hay red
  for (const modo of ['404', '500', 'html', 'mudo', 'sin red']) {
    await p.reload({ waitUntil: 'networkidle' });
    estado.modo = modo === 'sin red' ? 'ok' : modo; estado.recibidos = [];
    if (modo === 'sin red') await p.route('**/api/gps/interes', (ruta) => ruta.abort('internetdisconnected'));
    if (modo === 'mudo') await p.evaluate(() => document.getElementById('formulario-gps').setAttribute('data-espera-ms', '1500'));
    await p.waitForFunction(() => performance.now() > 3100);
    await llenar(p, BUENOS);
    await enviarYEsperar(p, '#gps-respaldo');
    const href = await p.getAttribute('.gps-respaldo-correo', 'href');
    const cuerpo = decodeURIComponent((href.split('&body=')[1] || ''));
    ok(href.startsWith('mailto:info@taxicun.com?subject=Quiero%20GPS%20para%20mi%20taxi') && cuerpo.includes('María Gómez') && cuerpo.includes('3001234567') && cuerpo.includes('El Rosal · Cootransrural'),
      `${modo}: respaldo con el correo a info@ listo (asunto y lo llenado)`);
    if (modo === '404') await capturar(p, '.gps-formulario-caja', `${nombre}-14-formulario-respaldo.png`);
    if (modo === 'sin red') await p.unroute('**/api/gps/interes');
  }
  await p.click('.gps-reintentar');
  ok(await p.isVisible('#formulario-gps') && (await p.inputValue('#g-nombre')) === BUENOS.nombre, '«Intentar de nuevo» vuelve al formulario con los datos');

  // ---- doble envío: uno solo
  await p.reload({ waitUntil: 'networkidle' });
  estado.modo = 'ok'; estado.recibidos = [];
  await llenar(p, BUENOS);
  await p.evaluate(() => { const f = document.getElementById('formulario-gps'); f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
  await p.waitForSelector('#gps-listo:not([hidden])');
  ok(estado.recibidos.length === 1, `doble clic: un solo envío (${estado.recibidos.length})`);

  // ---- nada guardado en el navegador, sin errores, sin CSP rota, nada de terceros
  const guardado = await p.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie }));
  ok(guardado.ls === 0 && guardado.ss === 0 && guardado.cookie === '' && (await r.contexto.cookies()).length === 0, 'no guarda nada en el navegador');
  const csp = await p.evaluate(() => window.__csp);
  ok(csp.length === 0, `0 violaciones de la CSP estricta (obligatoria)${csp.length ? ': ' + csp.slice(0, 4) : ''}`);
  ok(r.externos.length === 0, `nada pedido a terceros${r.externos.length ? ': ' + r.externos.slice(0, 4) : ''}`);
  const erroresJs = r.errores.filter((e) => !/Failed to load resource.*(404|500)|net::ERR_INTERNET_DISCONNECTED/.test(e));
  ok(erroresJs.length === 0, `sin errores de JS${erroresJs.length ? ': ' + erroresJs.slice(0, 3) : ''}`);
  ok(r.fallidos.length === 0, `sin archivos que falten${r.fallidos.length ? ': ' + r.fallidos : ''}`);
  await r.contexto.close();
}

// ---------------------------------------------------------------- páginas para imprimir (aviso y formato)
{
  const contexto = await navegador.newContext({ viewport: { width: 1000, height: 900 } });
  const p = await contexto.newPage();
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.effectiveDirective)); });
  for (const [pagina, hojas] of [['aviso', 2], ['formato-conductor', 1]]) {
    const r = await p.goto(`${PAGINA}${pagina}/`, { waitUntil: 'networkidle' });
    const d = await p.evaluate(() => ({ robots: document.querySelector('meta[name="robots"]')?.content, marca: document.querySelector('.marca-borrador')?.textContent || '', csp: window.__csp }));
    ok(r.status() === 200 && d.robots === 'noindex, nofollow' && /abogado/.test(d.marca) && d.csp.length === 0, `gps/${pagina}/: noindex, marcada «por revisar con el abogado», 0 violaciones de CSP`);
    const pdf = await p.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
    const paginas = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(paginas === hojas, `gps/${pagina}/ se imprime en ${hojas} hoja(s) carta (${paginas})`);
    if (pagina === 'aviso') ok(await p.evaluate(() => document.querySelectorAll('.aviso').length) === 16, 'aviso: 8 por hoja, con y sin la central');
  }
  await contexto.close();
}

// ---------------------------------------------------------------- sin JavaScript
{
  const contexto = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const p = await contexto.newPage();
  await p.goto(PAGINA);
  ok(!(await p.isVisible('#formulario-gps')), 'sin JavaScript: el formulario no se muestra (no se envía nada por la dirección)');
  ok(await p.isVisible('.gps-formulario-caja noscript >> nth=0').catch(() => false) || /activa JavaScript/.test(await p.textContent('.gps-formulario-caja')), 'sin JavaScript: el aviso con el correo info@taxicun.com');
  await capturar(p, '.gps-formulario-caja', 'celular-15-sin-javascript.png').catch(() => {});
  await contexto.close();
}

await navegador.close();
servidor.closeAllConnections();
servidor.close();
console.log(`\n${fallas ? `✘ ${fallas} falla(s)` : '✔ Todo bien'} · capturas en ${CAPTURAS}`);
process.exit(fallas ? 1 : 0);
