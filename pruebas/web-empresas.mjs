// Prueba de las páginas de TODAS las cooperativas (las que tengan ficha en
// empresas/<id>/ficha.json) en Chromium sin pantalla:
//  - portada (index), descargar/, privacidad/ y disenos/ (vitrina) de cada una,
//  - el índice de cooperativas (cooperativas/) y la 404 dentro de la carpeta de una cooperativa,
//  - sin errores de JS ni recursos rotos; enlaces internos responden 200,
//  - nada de «Cootransrural» ni «El Rosal» fuera de Cootransrural (salvo en el índice),
//  - nunca «null», «undefined», «NaN», «$0» ni enlaces tel: vacíos,
//  - franja «Propuesta de demostración…» y noindex solo en las propuestas,
//  - pie «desarrollada por interOS» en todas (la app es TaxiCun),
//  - «Pedir taxi», «Descargar TaxiCun», «Abrir TaxiCun» y los botones de conductores
//    llevan a taxicun/?e=<id> (taxicun/conductor/?e=<id>); descargar/ abre TaxiCun
//    con el móvil del sticker; cooperativas/ es la portada de TaxiCun,
//  - colores, íconos, JSON-LD, Open Graph y QR propios de cada cooperativa,
//  - capturas de la portada a 390 y 1440 px de cada una.
// Uso: node pruebas/web-empresas.mjs [url_base] [carpeta_capturas] [id …]
//      (por defecto http://localhost:8774/ y /tmp/cootrans/capturas/coop-web)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARGUMENTOS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const BASE = (ARGUMENTOS[0] || 'http://localhost:8774/').replace(/\/?$/, '/');
const CAPTURAS = ARGUMENTOS[1] || '/tmp/cootrans/capturas/coop-web';
const SOLO = ARGUMENTOS.slice(2);
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PRINCIPAL = 'cootransrural';
const URL_PUBLICA = 'https://interos-sas.github.io/cootransrural-app/';
mkdirSync(CAPTURAS, { recursive: true });

const fichas = readdirSync(join(RAIZ_REPO, 'empresas'))
  .filter((id) => existsSync(join(RAIZ_REPO, 'empresas', id, 'ficha.json')))
  .map((id) => JSON.parse(readFileSync(join(RAIZ_REPO, 'empresas', id, 'ficha.json'), 'utf8')))
  .filter((f) => !SOLO.length || SOLO.includes(f.id))
  .sort((a, b) => (a.id === PRINCIPAL ? -1 : b.id === PRINCIPAL ? 1 : a.id.localeCompare(b.id)));

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

const EXTERNOS = /cartocdn|openstreetmap|nominatim|project-osrm|mosquitto|emqx|hivemq|wa\.me|google|mapbox/i;
// Archivos de los diseños de la app (los construyen otros equipos): sus errores se informan aparte.
const DE_LOS_DISENOS = /\/disenos\/[abc]\/|\/app\/|\/conductor\//;
const FUGAS = /Cootransrural|El Rosal/;
const VACIOS = /\b(null|undefined|NaN)\b|\$0(?![\d.,])|\$NaN/;

// Contraste WCAG entre dos colores #RRGGBB.
function contraste(a, b) {
  const lum = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return 0;
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const navegador = await chromium.launch({ executablePath: EXE });

async function nuevoContexto(ficha, opciones = {}) {
  const ctx = await navegador.newContext({
    geolocation: { latitude: ficha.CENTRO.lat, longitude: ficha.CENTRO.lng }, permissions: ['geolocation'],
    locale: 'es-CO', timezoneId: 'America/Bogota', ...opciones,
  });
  // Sin relés MQTT públicos durante la prueba: solo BroadcastChannel.
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  return ctx;
}

function vigilar(pagina, nombre, errores, erroresDisenos) {
  pagina.on('pageerror', (e) => {
    const texto = `${nombre}: ${e.message}`;
    if (DE_LOS_DISENOS.test(e.stack || '')) erroresDisenos.push(texto);
    else errores.push(texto);
  });
  pagina.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (url && !url.startsWith(origen)) return;
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
  await pagina.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 400) {
      window.scrollTo({ top: y, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 80));
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
  await pagina.waitForTimeout(900);
}

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
    return window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height)?.data || null;
  })), selector);
}

// Revisión común de una página: textos visibles, fugas, vacíos, franja, noindex y pie.
async function revisarPagina(p, ficha, nombre, { franjaSel, pie = true } = {}) {
  const principal = ficha.id === PRINCIPAL;
  const propuesta = ficha.estado === 'propuesta';
  const r = await p.evaluate((sel) => {
    const visible = document.body.innerText;
    const metas = [document.title, ...[...document.querySelectorAll('meta[name="description"], meta[property^="og:"]')].map((m) => m.content)].join(' \n');
    const alts = [...document.querySelectorAll('img[alt], [aria-label]')].map((e) => e.getAttribute('alt') || e.getAttribute('aria-label')).join(' \n');
    const franja = sel ? document.querySelector(sel) : null;
    return {
      visible, metas, alts, html: document.documentElement.outerHTML,
      robots: document.querySelector('meta[name="robots"]')?.content || '',
      franja: franja ? franja.textContent.replace(/\s+/g, ' ').trim() : '',
      telVacios: [...document.querySelectorAll('a[href^="tel:"]')].filter((a) => !/^tel:\+?\d{7,}$/.test(a.getAttribute('href'))).map((a) => a.getAttribute('href')),
      waVacios: [...document.querySelectorAll('a[href*="wa.me/"]')].filter((a) => !/wa\.me\/\d{10,}/.test(a.getAttribute('href'))).map((a) => a.getAttribute('href')),
      mailVacios: [...document.querySelectorAll('a[href^="mailto:"]')].filter((a) => !/^mailto:[^@\s]+@[^@\s]+$/.test(a.getAttribute('href'))).map((a) => a.getAttribute('href')),
      desarrollado: /Desarrollado por interOS/.test(visible) || /desarrollada por interOS/.test(visible),
    };
  }, franjaSel);
  if (!principal) {
    // «El Rosal» puede ser un destino o un lugar de la propia ficha (municipio vecino): eso no es una fuga.
    const propios = [...(ficha.RUTAS || []).map((x) => x.destino), ...(ficha.LUGARES || []).flatMap((x) => [x.nombre, x.detalle])]
      .filter((t) => t && FUGAS.test(t)).sort((a, b) => b.length - a.length);
    const limpiar = (t) => propios.reduce((acc, x) => acc.split(x).join(''), t);
    const donde = [['texto', r.visible], ['título y metadatos', r.metas], ['alt y etiquetas', r.alts], ['código HTML', r.html]]
      .map(([d, t]) => [d, limpiar(t)])
      .filter(([, t]) => FUGAS.test(t)).map(([d, t]) => `${d}: «${t.match(new RegExp(`.{0,40}(${FUGAS.source}).{0,40}`))?.[0].replace(/\s+/g, ' ')}»`);
    ok(donde.length === 0, `${nombre}: sin «Cootransrural» ni «El Rosal»${donde.length ? ' — ' + donde.join(' | ') : ''}`);
  }
  const vacio = r.visible.match(new RegExp(`.{0,30}(${VACIOS.source}).{0,30}`));
  ok(!vacio, `${nombre}: sin «null», «undefined», «NaN» ni «$0» a la vista${vacio ? ` — «${vacio[0].replace(/\s+/g, ' ')}»` : ''}`);
  ok(!r.telVacios.length && !r.waVacios.length && !r.mailVacios.length, `${nombre}: enlaces tel:, WhatsApp y correo completos${[...r.telVacios, ...r.waVacios, ...r.mailVacios].join(' ')}`);
  if (franjaSel) {
    if (propuesta) {
      const esperado = `Propuesta de demostración de TaxiCun, preparada por interOS para ${ficha.EMPRESA.razonSocial || ficha.EMPRESA.nombre}`;
      ok(r.franja.includes(esperado) && r.franja.includes(`No es la página oficial de la ${ficha.EMPRESA.tipo === 'empresa' ? 'empresa' : 'cooperativa'}`), `${nombre}: franja de propuesta («${r.franja.slice(0, 90)}…»)`);
    } else {
      ok(!r.franja, `${nombre}: sin franja de propuesta (es cliente)`);
    }
    ok(propuesta ? /noindex/.test(r.robots) : (!/noindex/.test(r.robots) || nombre.includes('privacidad')), `${nombre}: ${propuesta ? 'con' : 'sin'} noindex (${r.robots || 'sin meta robots'})`);
  }
  if (pie) ok(r.desarrollado, `${nombre}: pie «desarrollada por interOS»`);
  return r;
}

const errores = [];
const erroresDisenos = [];
const enlaces = new Map(); // url → página donde aparece

async function juntarEnlaces(p, nombre) {
  const r = await p.evaluate((o) => {
    const urls = [];
    const rotas = [];
    const agregar = (u) => {
      try {
        const x = new URL(u, location.href);
        if (x.origin !== o) return;
        if (x.hash && x.pathname === location.pathname && x.hash.length > 1 && !document.getElementById(decodeURIComponent(x.hash.slice(1)))) rotas.push(x.hash);
        x.hash = '';
        urls.push(x.href);
      } catch { /* nada */ }
    };
    document.querySelectorAll('a[href]').forEach((a) => agregar(a.getAttribute('href')));
    document.querySelectorAll('img[src], link[href], script[src], iframe[src]').forEach((e) => agregar(e.getAttribute('src') || e.getAttribute('href')));
    return { urls, rotas };
  }, origen);
  r.urls.forEach((u) => { if (!enlaces.has(u)) enlaces.set(u, nombre); });
  ok(r.rotas.length === 0, `${nombre}: anclas internas existen${r.rotas.length ? ': ' + r.rotas.join(', ') : ''}`);
}

for (const ficha of fichas) {
  const E = ficha.EMPRESA;
  const principal = ficha.id === PRINCIPAL;
  const ruta = principal ? '' : `${ficha.id}/`;
  const base = BASE + ruta;
  const publica = URL_PUBLICA + ruta;
  const iconosPropios = !principal && existsSync(join(RAIZ_REPO, 'empresas', ficha.id, 'icono-192.png'));
  console.log(`\n=== ${E.nombre} (${ficha.id}, ${ficha.estado}) · ${base.replace(origen, '')}`);
  const faltan = ['index.html', 'descargar/index.html', 'privacidad/index.html', 'disenos/index.html'].filter((a) => !existsSync(join(RAIZ_REPO, ruta, a)));
  if (faltan.length) {
    ok(false, `${ficha.id}: faltan páginas generadas (${faltan.join(', ')}): corre python3 herramientas/generar-empresas.py`);
    continue;
  }

  /* ---------- Portada ---------- */
  for (const ancho of [390, 1440]) {
    const ctx = await nuevoContexto(ficha, { viewport: { width: ancho, height: ancho < 800 ? 844 : 900 }, ...(ancho < 800 ? { isMobile: true, hasTouch: true } : {}) });
    const p = await ctx.newPage();
    const nombre = `${ficha.id} inicio ${ancho}`;
    vigilar(p, nombre, errores, erroresDisenos);
    await p.addInitScript(() => {
      window.__abiertas = [];
      window.open = (url) => { window.__abiertas.push(String(url)); return null; };
    });
    await p.goto(base, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${CAPTURAS}/${ficha.id}-${ancho}-arriba.png` });
    await recorrer(p);
    const d = await p.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() || '',
      marca: document.querySelector('.barra .marca b')?.textContent || '',
      verde: getComputedStyle(document.documentElement).getPropertyValue('--verde').trim(),
      qr: Boolean(document.querySelector('#qr-descarga svg')),
      filas: document.querySelectorAll('#tabla-rutas tr').length,
      total: document.querySelector('#cotizacion b')?.textContent || '',
      cifras: [...document.querySelectorAll('.cifra')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
      taxisCalc: document.querySelector('#calc-taxis')?.value,
      planA: document.querySelector('#calc-a b')?.textContent || '',
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      ocultos: [...document.querySelectorAll('.revelar')].filter((e) => !e.classList.contains('visible')).length,
      rotas: [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0 && !i.hidden).map((i) => i.getAttribute('src')),
      imgs: [...document.querySelectorAll('img')].map((i) => i.getAttribute('src')),
      iconos: [...document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')].map((l) => l.getAttribute('href')),
      mapa: Boolean(document.querySelector('#mapa-oficina.leaflet-container')),
      form: document.querySelector('#formulario')?.dataset.whatsapp || '',
      programar: Boolean(document.querySelector('#programar')),
      jsonld: (() => { try { return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch { return null; } })(),
      ogUrl: document.querySelector('meta[property="og:url"]')?.content || '',
      ogImg: document.querySelector('meta[property="og:image"]')?.content || '',
      canonica: document.querySelector('link[rel="canonical"]')?.href || '',
      barraTop: document.querySelector('#barra')?.getBoundingClientRect().top || 0,
      franjaAlto: document.querySelector('#franja')?.getBoundingClientRect().height || 0,
      tc: {
        barra: document.querySelector('.boton-barra')?.href,
        pedir: document.querySelector('#pedir-taxi')?.href,
        descargar: document.querySelector('#descargar-taxicun')?.href,
        abrir: document.querySelector('#taxicun .boton')?.href,
        probar: [...document.querySelectorAll('.diseno .boton-verde')].map((a) => a.href),
        conductor: [...document.querySelectorAll('a')].filter((a) => /TaxiCun para conductores/.test(a.textContent)).map((a) => a.href),
        viejos: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^(\.\/)?(app|conductor)\/(\?|$)/.test(h)),
        franja: document.querySelector('#taxicun')?.innerText.replace(/\s+/g, ' ') || '',
        logo: (() => { const i = document.querySelector('#taxicun .tc-logo img'); return Boolean(i && i.complete && i.naturalWidth > 0 && /img\/taxicun\//.test(i.src)); })(),
        pie: document.querySelector('.pie-interos')?.textContent.replace(/\s+/g, ' ').trim() || '',
        pieApp: [...document.querySelectorAll('.pie h4')].map((h) => h.textContent),
      },
    }));
    const rutasNucleo = await p.evaluate(async (u) => (await import(u)).RUTAS.length, new URL('nucleo/index.js', BASE).href);
    ok(d.h1.includes(E.pueblo) && d.marca === E.nombre, `${nombre}: «${d.h1}» con la marca ${d.marca}`);
    // El primario de la ficha va tal cual en --verde; si es tan claro que el texto blanco
    // no se lee, el generador usa una versión más oscura (contraste AA con blanco).
    const primario = (ficha.colores?.primario || '#0A5C33').toUpperCase();
    ok(contraste(primario, '#FFFFFF') >= 4.5 ? d.verde.toUpperCase() === primario : contraste(d.verde, '#FFFFFF') >= 4.5,
      `${nombre}: color de la cooperativa en --verde (${d.verde}${d.verde.toUpperCase() !== primario ? `, ficha ${primario}` : ''})`);
    ok(d.qr && d.filas === rutasNucleo && rutasNucleo === ficha.RUTAS.length, `${nombre}: QR y tabla de tarifas con las ${d.filas} rutas de la ficha`);
    ok(/^\$\d/.test(d.total), `${nombre}: el cotizador calcula (${d.total})`);
    ok(d.cifras.length >= 3 && d.cifras.every((c) => /\d/.test(c)), `${nombre}: cifras disponibles (${d.cifras.join(' · ')})`);
    ok(Number(d.taxisCalc) === (parseInt(E.taxis, 10) || 30) && /^\$\d/.test(d.planA), `${nombre}: la calculadora parte de ${d.taxisCalc} taxis (${d.planA})`);
    ok(d.desborde <= 1, `${nombre}: sin desborde horizontal (${d.desborde}px)`);
    ok(d.ocultos === 0, `${nombre}: todas las secciones animadas quedaron visibles`);
    ok(d.rotas.length === 0, `${nombre}: sin imágenes rotas${d.rotas.length ? ': ' + d.rotas.join(', ') : ''}`);
    ok(d.mapa, `${nombre}: mapa de la oficina creado`);
    // La app es TaxiCun: los botones llevan a taxicun/?e=<id>.
    const tcApp = `${BASE}taxicun/?e=${ficha.id}`;
    ok([d.tc.barra, d.tc.pedir, d.tc.descargar, d.tc.abrir].every((u) => u === tcApp), `${nombre}: «Pedir taxi», «Descargar TaxiCun» y «Abrir TaxiCun» → taxicun/?e=${ficha.id}`);
    ok(d.tc.probar.length === 3 && d.tc.probar.every((u, i) => u === `${tcApp}&d=${'abc'[i]}`), `${nombre}: «Probar» cada diseño abre TaxiCun con ?d=a|b|c`);
    ok(d.tc.conductor.length >= 1 && d.tc.conductor.every((u) => u === `${BASE}taxicun/conductor/?e=${ficha.id}`), `${nombre}: «TaxiCun para conductores» → taxicun/conductor/?e=${ficha.id}`);
    ok(!d.tc.viejos.length, `${nombre}: ningún enlace a la app vieja (app/, conductor/)${d.tc.viejos.length ? ': ' + d.tc.viejos.join(', ') : ''}`);
    // (el antetítulo va en mayúsculas por CSS: se compara sin distinguir mayúsculas)
    ok(d.tc.logo && /Pide tu taxi con TaxiCun/.test(d.tc.franja) && d.tc.franja.toLowerCase().includes(`la app taxicun de ${E.nombre}`.toLowerCase())
      && d.tc.franja.includes(E.pueblo) && /varios municipios de Cundinamarca/.test(d.tc.franja),
      `${nombre}: franja de TaxiCun con su logo («${d.tc.franja.slice(0, 110)}…»)`);
    ok(/^App TaxiCun · desarrollada por interOS/.test(d.tc.pie) && d.tc.pieApp.includes('TaxiCun'), `${nombre}: pie «${d.tc.pie}»`);
    if (!principal) {
      const ajenas = d.imgs.filter((s) => /img\/web\/(flota-1|sticker-taxi|nevera)\.jpg|web\/disenos\/[abc]\.jpg|img\/fotos\//.test(s || ''));
      ok(ajenas.length === 0, `${nombre}: sin fotos ni capturas de Cootransrural${ajenas.length ? ': ' + ajenas.join(', ') : ''}`);
      if (iconosPropios) {
        const genericos = [...d.imgs, ...d.iconos].filter((s) => /img\/(icono-192|favicon-32|apple-touch-icon)\.png|img\/icono\.svg/.test(s || ''));
        ok(genericos.length === 0, `${nombre}: usa sus íconos de empresas/${ficha.id}/${genericos.length ? ' — genéricos: ' + genericos.join(', ') : ''}`);
      }
    }
    const tieneWa = Boolean(E.whatsapp || (/^3\d{9}$/.test(String(E.telefono || '').replace(/\D/g, ''))));
    ok(tieneWa ? Boolean(d.form) : d.programar && !d.form, `${nombre}: «Programa tu servicio» ${tieneWa ? `por WhatsApp (${d.form})` : 'sin WhatsApp: se programa desde la app'}`);
    if (ficha.estado === 'propuesta') ok(d.barraTop >= d.franjaAlto - 1 && d.franjaAlto > 0, `${nombre}: la barra queda debajo de la franja (${Math.round(d.barraTop)} px ≥ ${Math.round(d.franjaAlto)} px)`);
    if (ancho < 800) {
      // El menú del celular cuelga justo debajo de la barra (sin hueco por la franja).
      await p.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
      await p.click('#hamburguesa');
      await p.waitForTimeout(400);
      const m = await p.evaluate(() => ({ barra: document.querySelector('#barra').getBoundingClientRect().bottom, menu: document.querySelector('#menu').getBoundingClientRect().top }));
      ok(Math.abs(m.menu - m.barra) <= 2, `${nombre}: el menú abre pegado a la barra (${Math.round(m.menu)} px vs ${Math.round(m.barra)} px)`);
      await p.click('#hamburguesa');
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    }
    if (ancho === 1440) {
      const negocio = d.jsonld?.['@graph']?.find((n) => n['@type'] === 'LocalBusiness');
      const taxi = d.jsonld?.['@graph']?.find((n) => n['@type'] === 'TaxiService');
      ok(negocio?.name === E.nombre && negocio?.url === publica && Boolean(taxi), `${nombre}: JSON-LD de ${negocio?.name} (${negocio?.url})`);
      ok(!E.telefono ? !negocio?.telephone : Boolean(negocio?.telephone), `${nombre}: JSON-LD ${E.telefono ? 'con' : 'sin'} teléfono`);
      ok(ficha.estado === 'propuesta' ? !negocio?.logo : true, `${nombre}: ${ficha.estado === 'propuesta' ? 'la propuesta no declara logo' : 'logo declarado'}`);
      ok(d.ogUrl === publica && d.canonica === publica && /^https:\/\//.test(d.ogImg), `${nombre}: Open Graph y canónica con URL absoluta (${d.ogUrl})`);
      // Los stickers de la portada son los de esta cooperativa (no los de la raíz con ?e=).
      const stickers = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href*="stickers"]')].map((a) => a.href))]);
      ok(stickers.length > 0 && stickers.every((u) => u === `${base}stickers/`), `${nombre}: los stickers enlazan a su página (${stickers.map((u) => u.replace(origen, '')).join(', ')})`);
      const [descarga, , sticker] = await leerQRs(p, '#qr-descarga svg, #qr-cobro svg, #qr-sticker svg');
      ok(descarga === `${base}descargar/?o=web`, `${nombre}: el QR de la portada abre su descargar/ (${(descarga || 'ilegible').replace(origen, '')})`);
      ok(sticker === `${base}descargar/?movil=023&o=sticker`, `${nombre}: el QR del sticker de muestra abre su descargar/?movil=023`);
      // Formulario → WhatsApp de la central (si tiene).
      if (d.form) {
        await p.fill('#f-nombre', 'María Prueba');
        await p.fill('#f-telefono', '300 123 4567');
        await p.fill('#f-origen', 'Parque Principal');
        await p.fill('#f-destino', 'Aeropuerto El Dorado');
        await p.click('#formulario button[type="submit"]');
        await p.waitForTimeout(300);
        const url = await p.evaluate(() => window.__abiertas[0] || '');
        const texto = decodeURIComponent(url.split('?text=')[1] || '');
        ok(url.startsWith(`https://wa.me/${d.form}?text=`) && texto.startsWith(`Hola, ${E.nombre}.`), `${nombre}: el formulario abre WhatsApp de la central con «Hola, ${E.nombre}.»`);
      }
    }
    await revisarPagina(p, ficha, nombre, { franjaSel: '#franja' });
    if (ancho === 390) await juntarEnlaces(p, `${ficha.id} inicio`);
    await p.screenshot({ path: `${CAPTURAS}/${ficha.id}-${ancho}.png`, fullPage: true });
    console.log(`  capturas: ${CAPTURAS}/${ficha.id}-${ancho}.png (y -arriba)`);
    await ctx.close();
  }

  /* ---------- Descargar ---------- */
  {
    const ctx = await nuevoContexto(ficha, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    const nombre = `${ficha.id} descargar`;
    vigilar(p, nombre, errores, erroresDisenos);
    await p.goto(`${base}descargar/?movil=023&o=sticker`, { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const d = await p.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent,
      pedir: document.querySelector('#pedir')?.href,
      textoPedir: document.querySelector('#pedir')?.textContent.trim(),
      instalar: document.querySelector('#abrir-app')?.href,
      conductor: document.querySelector('#enlace-conductor')?.href,
      titulo: document.title,
      logo: document.querySelector('.descarga-cabeza .tc-logo img')?.getAttribute('src'),
      coop: document.querySelector('.chip-coop')?.textContent.replace(/\s+/g, ' ').trim() || '',
      icono: document.querySelector('.chip-coop img')?.getAttribute('src'),
      chip: document.querySelector('#chip-movil')?.hidden === false ? document.querySelector('#chip-movil').textContent.replace(/\s+/g, ' ') : '',
    }));
    const conMovil = `${BASE}taxicun/?e=${ficha.id}&movil=023`;
    ok(d.h1 === 'Descarga TaxiCun' && /img\/taxicun\//.test(d.logo || '') && d.titulo === `Móvil 023 · TaxiCun · ${E.nombre}`, `${nombre}: «${d.h1}» con el logo de TaxiCun, título «${d.titulo}»`);
    ok(d.textoPedir === 'Abrir TaxiCun' && d.pedir === conMovil && d.instalar === conMovil, `${nombre}: «Abrir TaxiCun» e «Instalar» → taxicun/?e=${ficha.id}&movil=023`);
    ok(/móvil\s*023/.test(d.chip) && d.coop.includes(E.nombre) && d.coop.includes(E.pueblo), `${nombre}: conserva el móvil escaneado y nombra a ${E.nombre} («${d.coop}»)`);
    ok(d.conductor === `${BASE}taxicun/conductor/?e=${ficha.id}`, `${nombre}: el enlace de conductores abre TaxiCun para conductores`);
    if (iconosPropios) ok(d.icono.includes(`empresas/${ficha.id}/`), `${nombre}: ícono propio en el chip de la cooperativa (${d.icono})`);
    await revisarPagina(p, ficha, nombre, { franjaSel: '.franja-pagina' });
    await juntarEnlaces(p, nombre);
    await p.screenshot({ path: `${CAPTURAS}/${ficha.id}-descargar.png`, fullPage: true });
    await ctx.close();
  }

  /* ---------- Privacidad ---------- */
  {
    const ctx = await nuevoContexto(ficha, { viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const nombre = `${ficha.id} privacidad`;
    vigilar(p, nombre, errores, erroresDisenos);
    await p.goto(`${base}privacidad/`, { waitUntil: 'load' });
    const responsable = (await p.textContent('#responsable')).replace(/\s+/g, ' ');
    ok(responsable.includes(E.razonSocial || E.nombre) && (!E.correo || responsable.includes(E.correo)), `${nombre}: el responsable es ${E.razonSocial || E.nombre}`);
    ok(/TaxiCun/.test(responsable) && /interOS/.test(responsable) && /encargado del tratamiento/.test(responsable), `${nombre}: la app es TaxiCun e interOS es el encargado del tratamiento`);
    ok(/términos de uso de TaxiCun/.test(await p.textContent('h1')), `${nombre}: título de la política con TaxiCun`);
    const r = await revisarPagina(p, ficha, nombre, { franjaSel: '.franja-pagina' });
    ok(/noindex/.test(r.robots), `${nombre}: noindex (borrador)`);
    // «Borrar mis datos» solo borra las claves de esta cooperativa.
    const borradas = await p.evaluate((id) => {
      localStorage.setItem('ct.otra-coop.pasajero', '1');
      localStorage.setItem(id === 'cootransrural' ? 'ct.pasajero' : `ct.${id}.pasajero`, '1');
      window.confirm = () => true;
      document.getElementById('borrar').click();
      return { propia: localStorage.getItem(id === 'cootransrural' ? 'ct.pasajero' : `ct.${id}.pasajero`), ajena: localStorage.getItem('ct.otra-coop.pasajero') };
    }, ficha.id);
    ok(borradas.propia === null && (principal || borradas.ajena === '1'), `${nombre}: «Borrar mis datos» borra solo los de ${E.nombre}`);
    await juntarEnlaces(p, nombre);
    await p.screenshot({ path: `${CAPTURAS}/${ficha.id}-privacidad.png`, fullPage: true });
    await ctx.close();
  }

  /* ---------- Vitrina de diseños ---------- */
  {
    const ctx = await nuevoContexto(ficha, { viewport: { width: 1440, height: 900 } });
    const p = await ctx.newPage();
    const nombre = `${ficha.id} vitrina`;
    const propios = [];
    vigilar(p, nombre, propios, erroresDisenos);
    await p.goto(`${base}disenos/`, { waitUntil: 'load' });
    await p.waitForTimeout(4500);
    const d = await p.evaluate(() => ({
      columnas: [...document.querySelectorAll('.v-columna')].filter((c) => getComputedStyle(c).display !== 'none').length,
      nombres: [...document.querySelectorAll('.v-columna h2')].map((h) => h.textContent),
      marcos: [...document.querySelectorAll('.v-pantalla iframe')].map((f) => f.getAttribute('src')),
      esperas: [...document.querySelectorAll('.v-espera .texto')].filter((t) => !t.closest('.v-espera').hidden).map((t) => t.textContent),
      volver: document.querySelector('.v-volver span')?.textContent,
      pedir: document.querySelector('.v-pedir')?.href,
      titulo: document.querySelector('.v-intro h1')?.textContent,
    }));
    ok(d.pedir === `${BASE}taxicun/?e=${ficha.id}` && d.titulo === 'Elige el diseño de TaxiCun', `${nombre}: nombra TaxiCun y «Pedir taxi» abre taxicun/?e=${ficha.id}`);
    ok(d.columnas === 3 && d.volver === E.nombre, `${nombre}: 3 diseños (${d.nombres.join(', ')}) y «volver» a ${d.volver}`);
    ok(d.marcos.length === 3 && d.marcos.every((s) => /^\.\.\/app\/\?d=[abc]&vitrina=1&sala=vitrina-[abc]$/.test(s)), `${nombre}: cada columna carga la app de ${E.nombre} (${d.marcos.join(' | ')})`);
    ok(!d.esperas.some((t) => /se está terminando/.test(t)), `${nombre}: los tres diseños están disponibles`);
    const leidos = await leerQRs(p, '.v-qr .codigo svg');
    ok(leidos.length === 3 && ['a', 'b', 'c'].every((x, i) => leidos[i] === `${base}app/?d=${x}`), `${nombre}: los QR abren su app/?d=a|b|c`);
    await revisarPagina(p, ficha, nombre, { franjaSel: '.v-franja' });
    await juntarEnlaces(p, nombre);
    await p.screenshot({ path: `${CAPTURAS}/${ficha.id}-vitrina.png` });
    errores.push(...propios);
    ok(propios.length === 0, `${nombre}: sin errores de JS propios de la vitrina`);
    await ctx.close();
  }
}

/* ---------- Índice de cooperativas ---------- */
if (!SOLO.length) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CO' });
  const p = await ctx.newPage();
  vigilar(p, 'cooperativas', errores, erroresDisenos);
  await p.goto(`${BASE}cooperativas/`, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const d = await p.evaluate(() => ({
    tarjetas: [...document.querySelectorAll('.coop')].map((c) => ({
      id: c.id.replace('coop-', ''), estado: c.querySelector('.estado')?.textContent, enlaces: c.querySelectorAll('.enlaces a').length,
      hrefs: [...c.querySelectorAll('.enlaces a')].map((a) => a.href),
    })),
    robots: document.querySelector('meta[name="robots"]')?.content || '',
    pie: document.querySelector('.pie')?.textContent || '',
    titulo: document.title,
    abrir: [...document.querySelectorAll('.cabeza a.boton')].map((a) => a.href),
    logo: document.querySelector('.cabeza .tc-logo')?.getAttribute('aria-label'),
  }));
  ok(d.titulo === 'TaxiCun · App de taxis para Cundinamarca · desarrollada por interOS' && d.logo === 'TaxiCun', `cooperativas: portada de TaxiCun («${d.titulo}»)`);
  ok(d.abrir[0] === `${BASE}taxicun/` && d.abrir[1] === `${BASE}taxicun/conductor/`, 'cooperativas: «Abrir TaxiCun» → taxicun/ y conductores → taxicun/conductor/');
  ok(d.tarjetas.every((t) => {
    const raiz = BASE + (t.id === PRINCIPAL ? '' : `${t.id}/`);
    return [raiz, `${BASE}taxicun/?e=${t.id}`, `${BASE}taxicun/conductor/?e=${t.id}`, `${raiz}propuesta/`, `${raiz}stickers/`].every((u) => t.hrefs.includes(u));
  }), 'cooperativas: cada tarjeta enlaza su web, TaxiCun, conductor, propuesta y stickers');
  ok(d.tarjetas.length === fichas.length && fichas.every((f) => d.tarjetas.some((t) => t.id === f.id && t.estado === (f.estado === 'propuesta' ? 'Propuesta' : 'Cliente') && t.enlaces >= 6)),
    `cooperativas: una tarjeta por ficha con su estado (${d.tarjetas.map((t) => `${t.id}: ${t.estado}`).join(', ')})`);
  ok(/noindex/.test(d.robots) && /TaxiCun · desarrollada por interOS/.test(d.pie), 'cooperativas: noindex y «TaxiCun · desarrollada por interOS»');
  const qrs = await leerQRs(p, '.coop .qr svg');
  ok(qrs.length === d.tarjetas.length && d.tarjetas.every((t, i) => qrs[i] === `${BASE}taxicun/?e=${t.id}`), `cooperativas: cada QR abre TaxiCun con su cooperativa (${qrs.map((q) => (q || 'ilegible').replace(origen, '')).join(' | ')})`);
  const [qrTaxiCun] = await leerQRs(p, '#qr-taxicun svg');
  ok(qrTaxiCun === `${BASE}taxicun/`, `cooperativas: el QR grande abre TaxiCun (${(qrTaxiCun || 'ilegible').replace(origen, '')})`);
  await juntarEnlaces(p, 'cooperativas');
  await p.screenshot({ path: `${CAPTURAS}/cooperativas-1440.png`, fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth <= 1), 'cooperativas 390: sin desborde horizontal');
  await p.screenshot({ path: `${CAPTURAS}/cooperativas-390.png`, fullPage: true });
  console.log(`  capturas: ${CAPTURAS}/cooperativas-*.png`);

  // Enlace discreto desde el pie de la raíz.
  await p.goto(BASE, { waitUntil: 'load' });
  ok(await p.evaluate(() => Boolean(document.querySelector('.pie a[href="cooperativas/"]'))), 'raíz: el pie enlaza (discreto) al índice de cooperativas');

  // 404 dentro de la carpeta de otra cooperativa (como la sirve GitHub Pages).
  const otra = fichas.find((f) => f.id !== PRINCIPAL);
  if (otra) {
    // La 404 busca la raíz del sitio probando nucleo/config.js carpeta por carpeta:
    // esos 404 son esperados; los demás errores sí cuentan.
    const errores404 = [];
    const p404 = await ctx.newPage();
    vigilar(p404, '404', errores404, erroresDisenos);
    const pagina404 = readFileSync(join(RAIZ_REPO, '404.html'), 'utf8');
    await p404.route(`${BASE}${otra.id}/no-existe/`, (r) => r.fulfill({ status: 404, contentType: 'text/html; charset=utf-8', body: pagina404 }));
    await p404.goto(`${BASE}${otra.id}/no-existe/`, { waitUntil: 'load' });
    await p404.waitForTimeout(800);
    const r = await p404.evaluate(() => ({ inicio: document.querySelector('[data-ruta=""]')?.href, app: document.querySelector('[data-taxicun]')?.href, titulo: document.title, verde: document.documentElement.style.getPropertyValue('--verde') }));
    ok(r.inicio === `${BASE}${otra.id}/` && r.app === `${BASE}taxicun/?e=${otra.id}` && r.titulo.includes(otra.EMPRESA.nombre) && r.verde.toUpperCase() === otra.colores.primario.toUpperCase(),
      `404 en /${otra.id}/…: lleva al inicio de ${otra.EMPRESA.nombre} con sus colores (${r.inicio.replace(origen, '')})`);
    await p404.screenshot({ path: `${CAPTURAS}/404-${otra.id}.png` });
    errores.push(...errores404.filter((e) => !/nucleo\/config\.js|\/no-existe\/(\s|\)|$)/.test(e)));
  }
  await ctx.close();
}

/* ---------- Enlaces internos ---------- */
{
  const ctx = await navegador.newContext();
  const malos = [];
  for (const [u, donde] of enlaces) {
    const r = await ctx.request.get(u);
    if (r.status() !== 200) malos.push(`${r.status()} ${u.replace(origen, '')} (en ${donde})`);
  }
  ok(malos.length === 0, `enlaces internos: ${enlaces.size - malos.length}/${enlaces.size} responden 200${malos.length ? ' — fallan: ' + malos.join(', ') : ''}`);
  await ctx.close();
}

if (erroresDisenos.length) {
  aviso(`errores dentro de los iframes de los diseños (los construyen otros equipos, no cuentan aquí): ${erroresDisenos.length}`);
  [...new Set(erroresDisenos)].slice(0, 10).forEach((e) => console.log(`    ${e}`));
}
ok(errores.length === 0, `sin errores de JS ni recursos rotos${errores.length ? ':\n    ' + [...new Set(errores)].slice(0, 15).join('\n    ') : ''}`);
console.log(fallas ? `\n${fallas} comprobación(es) fallaron.` : `\nTodo en orden (${fichas.length} cooperativas).`);
await navegador.close();
