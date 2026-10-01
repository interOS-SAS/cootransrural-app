// Prueba de las propuestas comerciales (plantillas/propuesta/ → <id>/propuesta/) y
// de sus PDF (herramientas/propuestas-pdf.mjs), en Chromium sin pantalla:
//  - la página carga sin errores de JS ni recursos rotos, con noindex y 6 hojas carta,
//  - ninguna hoja se desborda (todo cabe en su página) y las imágenes cargan,
//  - nada de «Cootransrural»/«El Rosal» ni de otra cooperativa fuera de la suya,
//    y nunca «null», «undefined», «NaN», «$0» ni teléfonos de contacto inventados,
//  - título, fecha, etiqueta (propuesta o cliente), aviso de datos públicos y contacto,
//  - la propuesta es de TaxiCun (desarrollada por interOS): título, logo en la portada y en
//    las cabeceras, panel «Una sola app para Cundinamarca» y pies «desarrollada por interOS»,
//  - los QR de la página decodifican (jsQR) a SU dirección: demo, TaxiCun (pasajero y
//    conductor con ?e=<id>), stickers y descargar,
//  - las cifras de los planes cuadran (1,9 %, $900 al día = $27.000 al mes y la flota de su ficha),
//  - lugares, rutas y móvil de la demo salen de su ficha,
//  - el PDF existe, tiene entre 4 y 6 páginas tamaño carta, pesa menos de 4 MB, su texto
//    trae las cifras y los QR del PDF (portada y hoja 3, rasterizadas con pdftoppm) decodifican bien.
// Uso: node pruebas/propuestas.mjs [url_base] [carpeta_pdf] [id …]
//      (por defecto http://localhost:8775/ y /tmp/cootrans/propuestas; Cootransrural se revisa
//       en la web, y su PDF solo si existe: herramientas/propuestas-pdf.mjs no lo crea por defecto)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGUMENTOS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const BASE = (ARGUMENTOS[0] || 'http://localhost:8775/').replace(/\/?$/, '/');
const CARPETA_PDF = ARGUMENTOS[1] || '/tmp/cootrans/propuestas';
const SOLO = ARGUMENTOS.slice(2);
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PRINCIPAL = 'cootransrural';
const URL_PUBLICA = 'https://taxicun.com/';
const CORREO = 'oscaradrianbernal@gmail.com';
const FECHA = '1 de octubre de 2026';

const todas = readdirSync(join(RAIZ_REPO, 'empresas'))
  .filter((id) => existsSync(join(RAIZ_REPO, 'empresas', id, 'ficha.json')))
  .map((id) => JSON.parse(readFileSync(join(RAIZ_REPO, 'empresas', id, 'ficha.json'), 'utf8')));
const fichas = todas
  .filter((f) => !SOLO.length || SOLO.includes(f.id))
  .sort((a, b) => (a.id === PRINCIPAL ? -1 : b.id === PRINCIPAL ? 1 : a.id.localeCompare(b.id)));

let fallas = 0;
const ok = (condicion, mensaje) => {
  console.log(`${condicion ? '✔' : '✘'} ${mensaje}`);
  if (!condicion) {
    fallas++;
    process.exitCode = 1;
  }
};
const aviso = (mensaje) => console.log(`! ${mensaje}`);

const pesos = (n) => '$' + Math.round(n).toLocaleString('es-CO').replace(/,/g, '.');
const FUGAS = /Cootransrural|El Rosal/;
const VACIOS = /\b(null|undefined|NaN)\b|\$0(?![\d.,])|\$NaN|\[object /;
const cantidad = (v) => {
  if (typeof v === 'number') return v > 0 ? { n: v, mas: false } : null;
  const m = /^\s*[~≈]?\s*(\d+)\s*(\+?)\s*$/.exec(String(v ?? ''));
  return m && Number(m[1]) > 0 ? { n: Number(m[1]), mas: m[2] === '+' } : null;
};

const navegador = await chromium.launch({ executablePath: EXE });
const contexto = await navegador.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 1280, height: 900 } });
await contexto.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
const jsQR = readFileSync(join(RAIZ_REPO, 'vendor', 'jsQR.min.js'), 'utf8');

// Decodifica con jsQR un PNG (o un recorte en fracciones de la imagen) dentro del navegador.
async function leerPNG(pagina, png, recorte = null) {
  const datos = `data:image/png;base64,${readFileSync(png).toString('base64')}`;
  return pagina.evaluate(async ({ datos, recorte }) => {
    const img = new Image();
    img.src = datos;
    await img.decode();
    const [x, y, w, h] = recorte
      ? [recorte.x * img.width, recorte.y * img.height, recorte.w * img.width, recorte.h * img.height].map(Math.round)
      : [0, 0, img.width, img.height];
    const c = document.createElement('canvas');
    c.width = w + 40;
    c.height = h + 40;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, x, y, w, h, 20, 20, w, h);
    return window.jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data || null;
  }, { datos, recorte });
}

for (const ficha of fichas) {
  const E = ficha.EMPRESA;
  const id = ficha.id;
  const esPrincipal = id === PRINCIPAL;
  const esPropuesta = ficha.estado === 'propuesta';
  const tipo = String(E.tipo || '').trim().toLowerCase() === 'empresa' ? 'empresa' : 'cooperativa';
  const ruta = esPrincipal ? 'el-rosal/propuesta/' : `${id}/propuesta/`;
  const urlPublica = URL_PUBLICA + (esPrincipal ? 'el-rosal/' : `${id}/`);
  const razon = E.razonSocial || E.nombre;
  const nombre = `${id}/propuesta`;
  console.log(`\n== ${E.nombre} (${id}, ${esPropuesta ? 'propuesta' : 'cliente'})`);

  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  pagina.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
  pagina.on('requestfailed', (r) => errores.push(`no cargó ${r.url()}`));
  pagina.on('response', (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  const respuesta = await pagina.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 60000 });
  ok(respuesta && respuesta.status() === 200, `${nombre}: responde 200`);
  const listo = await pagina.waitForSelector('html[data-listo="si"]', { timeout: 30000 }).then(() => true, () => false);
  ok(listo, `${nombre}: termina de cargar (QR, fuentes e imágenes)`);
  await pagina.addScriptTag({ content: jsQR });

  const r = await pagina.evaluate(() => {
    const hojas = [...document.querySelectorAll('.hoja')];
    const mm = (px) => (px * 25.4) / 96;
    const desbordes = [];
    hojas.forEach((h, i) => {
      const caja = h.getBoundingClientRect();
      if (Math.abs(mm(caja.width) - 215.9) > 0.6 || Math.abs(mm(caja.height) - 279.4) > 0.6) desbordes.push(`hoja ${i + 1}: mide ${mm(caja.width).toFixed(1)}×${mm(caja.height).toFixed(1)} mm`);
      const contenido = h.querySelector('.contenido');
      if (contenido && contenido.scrollHeight > contenido.clientHeight + 1) desbordes.push(`hoja ${i + 1}: el contenido se pasa ${mm(contenido.scrollHeight - contenido.clientHeight).toFixed(1)} mm`);
      // Ningún bloque visible se sale de la hoja ni se mete en el pie.
      const pie = h.querySelector('.pie, .portada-pie')?.getBoundingClientRect();
      for (const el of h.querySelectorAll('.contenido > *, .portada-abajo, .portada-texto, .portada-arriba')) {
        const b = el.getBoundingClientRect();
        if (b.right > caja.right + 0.5 || b.left < caja.left - 0.5 || b.bottom > caja.bottom + 0.5) desbordes.push(`hoja ${i + 1}: «${el.className}» se sale de la hoja`);
        if (pie && b.bottom > pie.top + 0.5 && !el.closest('.portada-arriba')) desbordes.push(`hoja ${i + 1}: «${el.className}» se mete en el pie`);
      }
    });
    // Portada: el texto no toca los teléfonos ni sale del fondo oscuro.
    const portada = hojas[0];
    const fondo = portada?.querySelector('.portada-fondo')?.getBoundingClientRect();
    const texto = portada?.querySelector('.portada-texto')?.getBoundingClientRect();
    const frente = portada?.querySelector('.telefono-frente')?.getBoundingClientRect();
    if (fondo && texto && texto.bottom > fondo.bottom - 4) desbordes.push('portada: el título se sale del fondo oscuro');
    // El texto (no la caja) del título y del párrafo no toca ninguno de los dos teléfonos.
    const extension = (el) => { if (!el) return null; const rango = document.createRange(); rango.selectNodeContents(el); return rango.getBoundingClientRect(); };
    const telefonos = [...(portada?.querySelectorAll('.portada-telefonos .telefono') || [])].map((t) => t.getBoundingClientRect());
    for (const el of portada?.querySelectorAll('.portada-texto h1, .portada-lead') || []) {
      const e = extension(el);
      if (telefonos.some((t) => e.right > t.left && e.left < t.right && e.bottom > t.top && e.top < t.bottom)) desbordes.push(`portada: «${el.className || el.tagName}» se monta sobre un teléfono`);
    }
    if (frente && texto && texto.right > frente.left) desbordes.push('portada: el título se monta sobre el teléfono');
    const imagenesRotas = [...document.images].filter((img) => !img.complete || !img.naturalWidth).map((img) => img.getAttribute('src'));
    const metas = [...document.querySelectorAll('meta')].map((m) => m.content || '').join(' ');
    const alts = [...document.querySelectorAll('[alt], [aria-label], [title]')].map((e) => [e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('title')].filter(Boolean).join(' ')).join(' ');
    return {
      hojas: hojas.length,
      desbordes,
      imagenesRotas,
      visible: document.body.innerText,
      titulo: document.title,
      h1: document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() || '',
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      metas: document.title + ' ' + metas,
      alts,
      html: document.documentElement.outerHTML,
      etiqueta: document.querySelector('.pildora')?.textContent.trim() || '',
      avisos: [...document.querySelectorAll('.aviso-datos')].map((a) => a.textContent.trim()),
      telefonos: [...document.querySelectorAll('a[href^="tel:"], a[href*="wa.me"]')].map((a) => a.href),
      correo: document.querySelector('.contacto-correo')?.getAttribute('href') || '',
      precioA: document.querySelector('#precio-a')?.innerText.replace(/\s+/g, ' ') || '',
      ejemploA: document.querySelector('#ejemplo-a')?.innerText.replace(/\s+/g, ' ') || '',
      precioB: document.querySelector('#precio-b')?.innerText.replace(/\s+/g, ' ') || '',
      flota: [...document.querySelectorAll('#flota-b p[data-taxis]')].map((p) => ({ taxis: Number(p.dataset.taxis), texto: p.innerText.replace(/\s+/g, ' ') })),
      conductor: document.querySelector('.enlace-conductor > span')?.textContent || '',
      lugares: [...document.querySelectorAll('.lugares b')].map((b) => b.textContent.trim()),
      lugaresTexto: [...document.querySelectorAll('.lugares small')].map((s) => s.textContent.trim()),
      frente: [...document.querySelectorAll('.frente tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()),
      rutas: [...document.querySelectorAll('.rutas .ruta-tramo b')].map((b) => b.textContent.trim()),
      rutasValores: [...document.querySelectorAll('.rutas li')].map((li) => li.querySelector('.ruta-datos b')?.textContent.trim()),
      qrs: [...document.querySelectorAll('[data-qr]')].map((caja) => ({ nombre: caja.dataset.nombre, url: caja.dataset.qr, svg: caja.querySelector('svg')?.outerHTML || '' })),
      enlaces: [...document.querySelectorAll('.enlace a')].map((a) => a.href),
      cabezas: [...document.querySelectorAll('.hoja .cabeza')].map((c) => ({ logo: c.querySelector('.tc-logo')?.getAttribute('aria-label') || '', texto: c.textContent.replace(/\s+/g, ' ').trim() })),
      pies: [...document.querySelectorAll('.pie-proveedor')].map((s) => s.textContent.replace(/\s+/g, ' ').trim()),
      portadaLogo: document.querySelector('.portada .tc-logo-portada')?.getAttribute('aria-label') || '',
      portadaDesarrolla: document.querySelector('.portada-desarrolla')?.textContent.replace(/\s+/g, ' ').trim() || '',
      panel: document.querySelector('.tc-panel')?.textContent.replace(/\s+/g, ' ').trim() || '',
      logosRotos: [...document.querySelectorAll('.tc-logo img')].filter((i) => !/img\/taxicun\//.test(i.src) || !i.naturalWidth).length,
    };
  });

  const propios = errores.filter((e) => !/favicon/.test(e));
  ok(!propios.length, `${nombre}: sin errores de JS ni recursos rotos${propios.length ? ' — ' + propios.slice(0, 4).join(' | ') : ''}`);
  const hojasEsperadas = ficha.competencia?.quejas?.length ? 7 : 6;
  ok(r.hojas === hojasEsperadas, `${nombre}: ${hojasEsperadas} hojas (hay ${r.hojas})`);
  ok(!r.desbordes.length, `${nombre}: todo cabe en sus hojas carta${r.desbordes.length ? ' — ' + r.desbordes.join(' | ') : ''}`);
  ok(!r.imagenesRotas.length, `${nombre}: todas las imágenes cargan${r.imagenesRotas.length ? ' — ' + r.imagenesRotas.join(', ') : ''}`);
  ok(/noindex/.test(r.robots), `${nombre}: noindex`);
  ok(r.h1 === `Propuesta: TaxiCun para ${razon}`, `${nombre}: título «${r.h1}»`);
  ok(r.titulo.startsWith(`Propuesta: TaxiCun para ${razon}`), `${nombre}: <title> de la propuesta`);
  // Marca TaxiCun (la app) y interOS como desarrollador.
  ok(r.portadaLogo === 'TaxiCun' && /Desarrollada por\s*interOS/i.test(r.portadaDesarrolla), `${nombre}: portada con el logo de TaxiCun y «Desarrollada por interOS»`);
  ok(r.cabezas.length === r.hojas - 1 && r.cabezas.every((c) => c.logo === 'TaxiCun' && c.texto.includes(`Propuesta para ${E.nombre}`)), `${nombre}: logo de TaxiCun en las ${r.cabezas.length} cabeceras`);
  ok(r.pies.length === r.hojas - 1 && r.pies.every((x) => x === 'TaxiCun · desarrollada por interOS'), `${nombre}: pies «TaxiCun · desarrollada por interOS»`);
  ok(!r.logosRotos, `${nombre}: los logos de TaxiCun cargan (img/taxicun/)`);
  ok(/Una sola app para Cundinamarca/.test(r.panel) && r.panel.includes(`Al abrir TaxiCun en ${E.pueblo}`) && r.panel.includes(E.nombre) && /la misma app le sirve allá/.test(r.panel) && r.panel.includes('con su nombre y sus colores'),
    `${nombre}: explica la app única por GPS («${r.panel.slice(0, 120)}…»)`);
  ok(r.visible.includes(FECHA), `${nombre}: fecha «${FECHA}»`);
  ok(r.visible.includes(`Preparada por interOS para ${E.nombre}`), `${nombre}: «Preparada por interOS para ${E.nombre}»`);
  if (esPropuesta) {
    ok(r.etiqueta.toLowerCase() === 'propuesta de demostración', `${nombre}: etiqueta «${r.etiqueta}»`);
    ok(r.avisos.length >= 6 && r.avisos.every((a) => a === `Demostración preparada con datos públicos; no es una página oficial de la ${tipo}.`), `${nombre}: aviso de datos públicos en cada hoja (${r.avisos.length})`);
  } else {
    ok(r.etiqueta.toLowerCase() === 'propuesta comercial', `${nombre}: cliente → «${r.etiqueta}»`);
    ok(!r.avisos.length && !/no es una página oficial/i.test(r.visible), `${nombre}: cliente sin aviso de demostración`);
  }

  // Contacto: Oscar Bernal por correo, sin teléfonos de interOS.
  ok(r.visible.includes('Oscar Bernal') && r.correo === `mailto:${CORREO}`, `${nombre}: contacto Oscar Bernal · ${CORREO}`);
  ok(!r.telefonos.length, `${nombre}: sin enlaces de teléfono ni WhatsApp`);

  // Fugas y vacíos («El Rosal» como destino de una ruta de su ficha sí vale).
  const deLaFicha = [...(ficha.RUTAS || []).map((x) => x.destino), ...(ficha.LUGARES || []).flatMap((x) => [x.nombre, x.detalle])]
    .filter((t) => t && FUGAS.test(t)).sort((a, b) => b.length - a.length);
  const limpiar = (t) => deLaFicha.reduce((acc, x) => acc.split(x).join(''), t);
  if (!esPrincipal) {
    const donde = [['texto', r.visible], ['metadatos', r.metas], ['alt y etiquetas', r.alts], ['código', r.html.replace(/cootransrural-app/g, '')]]
      .map(([d, t]) => [d, limpiar(t)]).filter(([, t]) => FUGAS.test(t))
      .map(([d, t]) => `${d}: «${t.match(new RegExp(`.{0,40}(${FUGAS.source}).{0,40}`))?.[0].replace(/\s+/g, ' ')}»`);
    ok(!donde.length, `${nombre}: sin «Cootransrural» ni «El Rosal»${donde.length ? ' — ' + donde.join(' | ') : ''}`);
  }
  const otras = todas.filter((f) => f.id !== id).flatMap((f) => [f.EMPRESA.nombre, f.EMPRESA.razonSocial]).filter(Boolean);
  // Palabra completa: «Cootransvi» (Villeta) no es fuga dentro de «Cootransvillaleal» (La Vega).
  const palabra = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u');
  const ajenas = otras.filter((n) => palabra(n).test(r.visible) || palabra(n).test(r.metas));
  ok(!ajenas.length, `${nombre}: sin nombres de otras cooperativas${ajenas.length ? ' — ' + ajenas.join(', ') : ''}`);
  const vacio = (r.visible + ' ' + r.metas + ' ' + r.alts).match(new RegExp(`.{0,30}(${VACIOS.source}).{0,30}`));
  ok(!vacio, `${nombre}: sin «null», «undefined», «NaN» ni «$0»${vacio ? ` — «${vacio[0].replace(/\s+/g, ' ')}»` : ''}`);
  // Una S.A.S. (EMPRESA.tipo = "empresa") no es «cooperativa» ni tiene «asociados».
  if (tipo === 'empresa') {
    const mal = (r.visible + ' ' + r.metas + ' ' + r.alts).match(/.{0,30}(cooperativa|asociad[oa]s?).{0,30}/i);
    ok(!mal, `${nombre}: es una empresa: no dice «cooperativa» ni «asociados»${mal ? ` — «${mal[0].replace(/\s+/g, ' ')}»` : ''}`);
  }
  // Honestidad: el Plan A es un porcentaje, así que no se puede prometer «sin comisión».
  const costo = r.frente.find((f) => /cuesta/i.test(f)) || '';
  ok(costo.includes('1,9') && costo.includes('$900') && !/ninguna|sin comisi|no paga comisi/i.test(r.frente.join(' ')), `${nombre}: la comparación dice lo que cuesta («${costo}»)`);
  const repetidos = r.lugaresTexto.filter((t) => /^(\p{L}+)\s·\s\1\b/iu.test(t));
  ok(!repetidos.length, `${nombre}: los lugares no repiten la categoría${repetidos.length ? ' — ' + repetidos.join(' | ') : ''}`);

  // QR de la página
  const esperadas = {
    portada: urlPublica, contacto: urlPublica, web: urlPublica, app: `${URL_PUBLICA}taxicun/?e=${id}`,
    conductor: `${URL_PUBLICA}taxicun/conductor/?e=${id}`, stickers: urlPublica + 'stickers/', descargar: urlPublica + 'descargar/',
  };
  for (const qr of r.qrs) {
    const leido = await pagina.evaluate(async (svg) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      const lado = 420;
      const c = document.createElement('canvas');
      c.width = c.height = lado;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, lado, lado);
      ctx.drawImage(img, 20, 20, lado - 40, lado - 40);
      return window.jsQR(ctx.getImageData(0, 0, lado, lado).data, lado, lado)?.data || null;
    }, qr.svg);
    ok(leido === esperadas[qr.nombre] && qr.url === esperadas[qr.nombre], `${nombre}: QR «${qr.nombre}» → ${leido}`);
  }
  ok(r.qrs.length === 7, `${nombre}: 7 códigos QR (portada, 5 enlaces y contacto)`);
  ok(r.enlaces.length === 5 && r.enlaces.every((h) => h.startsWith(urlPublica) || h.startsWith(`${URL_PUBLICA}taxicun/`)), `${nombre}: los enlaces de la demo van a ${urlPublica} y a TaxiCun`);
  ok(r.enlaces.includes(`${URL_PUBLICA}taxicun/?e=${id}`) && r.enlaces.includes(`${URL_PUBLICA}taxicun/conductor/?e=${id}`), `${nombre}: enlaces a TaxiCun pasajero y conductor con ?e=${id}`);

  // Precios
  ok(/^1,9 %/.test(r.precioA.replace(/ /g, ' ')), `${nombre}: Plan A 1,9 % («${r.precioA}»)`);
  ok(r.ejemploA.includes('$10.000.000') && r.ejemploA.includes(pesos(10000000 * 0.019)), `${nombre}: ejemplo del Plan A cuadra («${r.ejemploA}»)`);
  ok(r.precioB.includes('$900') && r.precioB.includes('$27.000 al mes'), `${nombre}: Plan B $900 al día = $27.000 al mes («${r.precioB}»)`);
  const taxis = cantidad(E.taxis);
  const esperadosFlota = taxis ? [taxis.n] : cantidad(E.vehiculos) ? [10] : [20, 50];
  ok(JSON.stringify(r.flota.map((f) => f.taxis)) === JSON.stringify(esperadosFlota), `${nombre}: ejemplo de flota con ${esperadosFlota.join(' y ')} taxis`);
  for (const f of r.flota) {
    ok(f.texto.includes(pesos(f.taxis * 27000)) && f.texto.includes(pesos(f.taxis * 900)), `${nombre}: ${f.texto}`);
  }
  if (taxis && !/exacto de taxis/i.test((E.datosPendientes || []).join(' ')) && !taxis.mas) ok(r.flota[0]?.texto.startsWith(`Con sus ${taxis.n} taxis`), `${nombre}: usa su flota real («${r.flota[0]?.texto}»)`);
  ok(/antes de IVA/.test(r.visible), `${nombre}: aclara «antes de IVA»`);
  ok(/1 semana/.test(r.visible) && /Días 1 y 2/.test(r.visible) && /Días 5 a 7/.test(r.visible), `${nombre}: tiempo de entrega con los pasos`);

  // Datos de su ficha
  const moviles = (ficha.CONDUCTORES_DEMO || []).map((c) => String(c.movil).padStart(3, '0'));
  const movil = /móvil (\d{3}), PIN 1234/.exec(r.conductor)?.[1];
  ok(movil && moviles.includes(movil), `${nombre}: demo del conductor con móvil ${movil} de su ficha y PIN 1234`);
  const nombresLugares = new Set((ficha.LUGARES || []).map((l) => l.nombre));
  ok(r.lugares.length >= 2 && r.lugares.every((l) => nombresLugares.has(l)), `${nombre}: lugares de su ficha (${r.lugares.join(', ')})`);
  const rutasFicha = new Map((ficha.RUTAS || []).map((x) => [x.destino, x]));
  ok(r.rutas.length >= 2 && r.rutas.every((x, i) => rutasFicha.has(x) && r.rutasValores[i] === pesos(rutasFicha.get(x).valor)), `${nombre}: rutas y valores de su ficha (${r.rutas.join(', ')})`);
  for (const p of E.datosPendientes || []) {
    const clave = p.toLowerCase().replace(/^número exacto/, 'número exacto').split(' ').slice(-1)[0];
    if (!r.visible.toLowerCase().includes(clave)) aviso(`${nombre}: no se ve el dato pendiente «${p}»`);
  }

  // PDF
  const carpeta = join(CARPETA_PDF, id);
  const archivo = existsSync(carpeta) ? readdirSync(carpeta).find((f) => f.endsWith('.pdf')) : null;
  if (!archivo) {
    if (esPrincipal) aviso(`${nombre}: sin PDF (Cootransrural no se genera por defecto)`);
    else ok(false, `${nombre}: falta el PDF en ${carpeta} (node herramientas/propuestas-pdf.mjs)`);
    await pagina.close();
    continue;
  }
  const pdf = join(carpeta, archivo);
  const nombreCorto = (E.nombreCorto || E.nombre).normalize('NFC').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  ok(archivo === `Propuesta-app-taxis-${nombreCorto}.pdf`, `${nombre}: nombre del PDF ${archivo}`);
  const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
  const paginas = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
  ok(paginas >= 4 && paginas <= 7, `${nombre}: el PDF tiene ${paginas} páginas`);
  ok(/Page size:\s+612 x 792 pts/.test(info), `${nombre}: tamaño carta (${/Page size:\s+([^\n]+)/.exec(info)?.[1]})`);
  const tamanosPaginas = execFileSync('pdfinfo', ['-f', '1', '-l', String(paginas), pdf], { encoding: 'utf8' }).match(/Page\s+\d+ size:\s+([^\n]+)/g) || [];
  ok(tamanosPaginas.every((t) => /612 x 792 pts/.test(t)), `${nombre}: todas las páginas son carta`);
  const kb = Math.round(statSync(pdf).size / 1024);
  ok(kb < 4096, `${nombre}: el PDF pesa ${kb} KB`);
  const texto = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).replace(/ /g, ' ');
  ok(texto.includes('$27.000') && texto.includes('$900') && texto.includes('1,9 %'), `${nombre}: el texto del PDF trae los precios`);
  ok(r.flota.every((f) => texto.includes(pesos(f.taxis * 27000))), `${nombre}: el texto del PDF trae el ejemplo de la flota`);
  const vacioPdf = texto.match(new RegExp(`.{0,30}(${VACIOS.source}).{0,30}`));
  ok(!vacioPdf, `${nombre}: el texto del PDF no trae «null» ni «undefined»${vacioPdf ? ` — «${vacioPdf[0]}»` : ''}`);
  ok(texto.includes(CORREO), `${nombre}: el PDF trae el correo de contacto`);
  const textoPlano = texto.replace(/\s+/g, ' ');
  ok(/Propuesta: TaxiCun para/.test(textoPlano) && /desarrollada por interOS/.test(textoPlano) && /Una sola app para Cundinamarca/.test(textoPlano), `${nombre}: el PDF es la propuesta de TaxiCun, desarrollada por interOS`);
  ok(textoPlano.includes(razon) && textoPlano.includes(E.pueblo), `${nombre}: el PDF nombra a ${razon} y a ${E.pueblo}`);
  const total = ficha.competencia?.quejas?.length ? 7 : 6;
  ok(Array.from({ length: total - 1 }, (_, i) => i + 2).every((n) => new RegExp(`\\b${n}\\s*/\\s*${total}\\b`).test(texto)), `${nombre}: el PDF numera las hojas (2 / ${total} … ${total} / ${total})`);
  if (!esPrincipal) {
    const fugaPdf = limpiar(textoPlano).match(new RegExp(`.{0,40}(${FUGAS.source}).{0,40}`));
    ok(!fugaPdf, `${nombre}: el texto del PDF no trae «Cootransrural» ni «El Rosal»${fugaPdf ? ` — «${fugaPdf[0]}»` : ''}`);
  }
  const ajenasPdf = otras.filter((n) => palabra(n).test(textoPlano));
  ok(!ajenasPdf.length, `${nombre}: el texto del PDF no nombra otras cooperativas${ajenasPdf.length ? ' — ' + ajenasPdf.join(', ') : ''}`);
  if (tipo === 'empresa') ok(!/cooperativa|asociad[oa]s?/i.test(textoPlano), `${nombre}: el PDF de una empresa no dice «cooperativa» ni «asociados»`);

  // QR dentro del PDF (recortados según la página impresa): portada completa, los 5 de la
  // hoja 3, el del contacto (hoja 6) y los de las fotos de stickers (hoja 4), que llevan a
  // la página de descarga de ESTA cooperativa.
  const tmp = mkdtempSync(join(tmpdir(), 'propuesta-'));
  try {
    execFileSync('pdftoppm', ['-r', '150', '-f', '1', '-l', '1', '-png', pdf, join(tmp, 'p')]);
    execFileSync('pdftoppm', ['-r', '200', '-f', '3', '-l', '6', '-png', pdf, join(tmp, 'p')]);
    const png = (n) => join(tmp, readdirSync(tmp).find((f) => new RegExp(`^p-0*${n}\\.png$`).test(f)));
    const portada = await leerPNG(pagina, png(1));
    ok(portada === urlPublica, `${nombre}: el QR de la portada del PDF lleva a ${portada}`);
    await pagina.emulateMedia({ media: 'print' });
    const recortes = await pagina.evaluate(() => {
      const hojas = document.querySelectorAll('.hoja');
      const caja = (i, el, nombre, m = 6) => {
        const hoja = hojas[i].getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return { hoja: i + 1, nombre, x: (b.left - hoja.left - m) / hoja.width, y: (b.top - hoja.top - m) / hoja.height, w: (b.width + 2 * m) / hoja.width, h: (b.height + 2 * m) / hoja.height };
      };
      return [
        ...[...hojas[2].querySelectorAll('[data-qr]')].map((q) => caja(2, q, q.dataset.nombre)),
        ...[...hojas[5].querySelectorAll('[data-qr]')].map((q) => caja(5, q, q.dataset.nombre)),
        ...[...hojas[3].querySelectorAll('.stickers img')].map((img, k) => caja(3, img, `foto-${k + 1}`, 0)),
      ];
    });
    for (const rc of recortes) {
      const leido = await leerPNG(pagina, png(rc.hoja), rc);
      if (rc.nombre.startsWith('foto')) ok(String(leido).startsWith(`${urlPublica}descargar/`), `${nombre}: QR de la ${rc.nombre} (hoja 4) del PDF → ${leido}`);
      else ok(leido === esperadas[rc.nombre], `${nombre}: QR «${rc.nombre}» del PDF (hoja ${rc.hoja}) → ${leido}`);
    }
    ok(recortes.filter((rc) => rc.hoja === 3).length === 5 && recortes.some((rc) => rc.hoja === 6), `${nombre}: el PDF trae los 5 QR de la hoja 3 y el del contacto`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  await pagina.close();
}

await navegador.close();
console.log(`\n${fallas ? `✘ ${fallas} falla(s)` : '✔ Todo bien'}`);
