// Prueba de la tienda TaxiCun GPS (gps/) en Chromium sin pantalla, contra el servidor falso
// (pruebas/gps-servidor-falso.mjs, que sirve el sitio con una CSP estricta y OBLIGATORIA, con Trusted Types):
//  - escritorio (1280×800) y celular (390×844): sin errores de JS, 0 violaciones de CSP, nada pedido a terceros,
//    sin desbordes a lo ancho, imágenes cargadas, enlaces internos y anclas que existen;
//  - oculta mientras sea borrador: noindex, «(borrador)» en el título, la franja y la etiqueta en cada precio;
//    ninguna otra página del sitio (ni el service worker) la enlaza, y el service worker no toca /api/;
//  - los precios del respaldo son los de herramientas/gps-planes.json (calculados aquí por separado);
//  - LOS PLANES DESDE LA API (§14.4 y §14.6 del diseño del GPS):
//    · con la versión 1 de la API, la página queda IGUAL al respaldo (lo que pinta tienda.js = lo que arma el generador);
//    · con una versión 2 distinta, pinta la API completa: tarjetas, combo, otros valores, comparación, opciones del
//      formulario, la nota de arriba, las flotas y la permanencia; con una versión 3 sin combos ni «compra», oculta la
//      nota, el combo y los otros valores; el ETag ahorra el cuerpo (304) al volver a abrir;
//    · con 404, 500, HTML, JSON con otro tipo, JSON malo, más de 32 KB, fuera de topes, valores que no cuadran, id
//      reservado, HTML en un texto, redirección, 4 s sin respuesta o sin red, la página queda igual al respaldo, sin
//      mezclar, con su motivo;
//    · cada caso de los topes y las reglas (pruebas/gps-planes-casos.mjs, los mismos que rechaza el generador): queda el
//      respaldo entero, con el motivo exacto; los válidos se pintan;
//    · señuelos de HTML en los textos de la API: se ven literales (nada de innerHTML) y nada se ejecuta;
//    · el pedido va sin cookies;
//  - el formulario: errores en español sin enviar nada, envío correcto con el contrato exacto (JSON cerrado, mismo
//    origen, sin cookies, menos de 4 KB, nada en la dirección), con «plan» dinámico, «planesVersion» (la de la API o la
//    del respaldo) y «placa» solo si se escribe; éxito, y el respaldo a info@ cuando el servidor responde 404, 500,
//    HTML, no responde o no hay red; un solo envío con doble clic; sin JavaScript, el aviso para escribir al correo;
//  - la página no guarda nada en el navegador (ni localStorage, ni sessionStorage, ni cookies);
//  - capturas para la revisión de Oscar en la carpeta de capturas.
// Uso: node pruebas/gps-tienda.mjs [carpeta_capturas]   (levanta el servidor falso en 127.0.0.1:4721; PUERTO_TIENDA cambia el puerto)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { casosPlanes } from './gps-planes-casos.mjs';
import { crearServidor, OBLIGATORIAS, OPCIONALES, PLANES_V2, PLANES_V3, PLANES_XSS, RESPALDO, SENUELOS } from './gps-servidor-falso.mjs';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const CAPTURAS = process.argv[2] || '/tmp/cootrans/gps/r2/pruebas/tienda/capturas';
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PUERTO = Number(process.env.PUERTO_TIENDA || 4721);
mkdirSync(CAPTURAS, { recursive: true });

let fallas = 0;
let bien = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (c) bien++; else fallas++; };

// ---------------------------------------------------------------- lo esperado, calculado aquí
const PLANES = JSON.parse(readFileSync(join(RAIZ, 'herramientas/gps-planes.json'), 'utf8'));
const pesos = (n) => '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const SHA = createHash('sha256').update(PLANES.autorizacion.texto, 'utf8').digest('hex');
// La copia del texto de la autorización en el servidor, si está a mano: tienen que ser idénticos, porque el servidor
// guarda la huella de SU copia con la versión que manda la página.
const INTERES_SERVIDOR = process.env.INTERES_SERVIDOR
  || ['/tmp/cootrans/gps/r2/servidor/src/gps/interes.js', '/tmp/cootrans/gps/servidor/src/gps/interes.js'].find((r) => existsSync(r)) || '';
const esperados = [];
for (const p of RESPALDO.planes) {
  const al = p.precioEquipo + p.instalacion;
  if (p.combo === null) esperados.push(pesos(al), pesos(p.mes), pesos(al + 12 * p.mes));
  else esperados.push(pesos(p.mes));
}
const N_COOPS = JSON.parse(readFileSync(join(RAIZ, 'empresas/indice.json'), 'utf8')).cooperativas.length;

// ---------------------------------------------------------------- 0) el respaldo es el cuerpo de la versión 1 del diseño
{
  const diseno = '/tmp/cootrans/gps/DISENO-GPS.md';
  if (existsSync(diseno)) {
    const t = readFileSync(diseno, 'utf8');
    const sec = t.slice(t.indexOf('#### 14.2.1'), t.indexOf('#### 14.2.2'));
    const v1 = JSON.parse(/```json\n([\s\S]*?)```/.exec(sec)[1]);
    ok(JSON.stringify(v1) === JSON.stringify(RESPALDO), 'gps-planes.json: el respaldo es el cuerpo de la versión 1 de §14.2.1, campo por campo');
  } else console.log(`(sin ${diseno}: no se compara el respaldo con el diseño)`);
  ok(!('planes' in PLANES) && !('combo' in PLANES) && !('extras' in PLANES) && !('flotas_desde' in PLANES) && !('politica_privacidad' in PLANES),
    'gps-planes.json: planes, combo, extras, flotas_desde y politica_privacidad salieron (quedan respaldo y lo demás)');
  ok(PLANES.precios_aprobados === false && PLANES.pagina_publica === false, 'gps-planes.json: precios sin aprobar y página no pública');
}
if (INTERES_SERVIDOR) {
  const fuente = readFileSync(INTERES_SERVIDOR, 'utf8');
  const m = /'1\.0':\s*((?:'[^']*'\s*\+?\s*)+)/.exec(fuente);
  const texto = m ? [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).join('') : '';
  ok(texto === PLANES.autorizacion.texto, `el texto de la casilla (versión ${PLANES.autorizacion.version}) es igual al del servidor (${INTERES_SERVIDOR}; sha256 ${SHA.slice(0, 12)}…)`);
} else console.log('(sin src/gps/interes.js del servidor a mano: no se compara el texto de la autorización)');

// ---------------------------------------------------------------- 1) nadie enlaza la tienda; el service worker no toca /api/
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
      // Enlaces de verdad (href, src, action o una ruta en un script); nombrar «taxicun.com/gps» en un texto no cuenta.
      if (/(href|src|action)\s*=\s*["'][^"']*\bgps\/|['"`](https?:\/\/taxicun\.com)?(\.{1,2})?\/gps\/?['"`]|['"`]gps\/['"`]/i.test(texto)) enlaces.push(rel);
    }
  };
  recorrer(RAIZ.replace(/\/$/, ''));
  ok(enlaces.length === 0, `ninguna otra página, script ni el service worker enlaza gps/${enlaces.length ? ': ' + enlaces.join(', ') : ''}`);
  const sw = readFileSync(join(RAIZ, 'sw.js'), 'utf8');
  ok(!/gps/i.test(sw), 'gps/ no está en el precacheo del service worker');
  ok(/url\.pathname\.startsWith\('\/api\/'\)\)\s*return;/.test(sw), 'el service worker no toca /api/ (la API de planes va directo al servidor)');
}

// ---------------------------------------------------------------- servidor y navegador
const { servidor, estado, url: BASE } = await crearServidor({ puerto: PUERTO });
const PAGINA = `${BASE}gps/`;
const origen = new URL(BASE).origin;
const navegador = await chromium.launch({ executablePath: EXE });
const ESCRITORIO = { viewport: { width: 1280, height: 800 } };
const CELULAR = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const contextos = [];

async function nuevaPagina(vista, { esperar = 'networkidle', cookie = false } = {}) {
  const contexto = await navegador.newContext(vista);
  contextos.push(contexto);
  if (cookie) await contexto.addCookies([{ name: 'galleta', value: 'secreta', url: BASE }]);
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
  if (esperar) await p.goto(PAGINA, { waitUntil: esperar });
  return r;
}

// Espera a que la tienda decida: pintó la API (data-gps-fuente="api") o se quedó con el respaldo (data-gps-motivo).
const decidida = (p) => p.waitForFunction(() => {
  const s = document.querySelector('[data-gps-fuente]');
  return s && (s.getAttribute('data-gps-fuente') === 'api' || s.hasAttribute('data-gps-motivo'));
}, null, { timeout: 9000 });
const fuente = (p) => p.evaluate(() => {
  const s = document.querySelector('[data-gps-fuente]');
  return { fuente: s.getAttribute('data-gps-fuente'), version: s.getAttribute('data-gps-version'), motivo: s.getAttribute('data-gps-motivo') };
});

// Firma de todo lo que rehace la API (etiquetas, atributos ordenados y textos sin espacios de sobra): dos páginas con la
// misma firma muestran exactamente lo mismo.
const firma = (p) => p.evaluate(() => {
  const f = (n) => {
    if (n.nodeType === 3) { const t = n.nodeValue.replace(/\s+/g, ' ').trim(); return t ? JSON.stringify(t) : ''; }
    if (n.nodeType !== 1) return '';
    const atributos = [...n.attributes].map((a) => `${a.name}=${JSON.stringify(a.value)}`).sort().join(' ');
    return `<${n.localName} ${atributos}>[${[...n.childNodes].map(f).filter(Boolean).join(',')}]`;
  };
  const partes = ['[data-gps-planes]', '[data-gps-extras]', '.gps-tabla tbody', '[data-gps-opciones-plan]', '[data-gps-nota]', '[data-gps-flotas]', '[data-gps-faq-permanencia]']
    .map((s) => { const e = document.querySelector(s); return e ? f(s === '[data-gps-extras]' ? e.parentNode : e) : `(sin ${s})`; });
  // La propiedad «checked» (lo marcado de verdad), además del atributo.
  partes.push(JSON.stringify([...document.querySelectorAll('input[name="plan"]')].map((i) => [i.value, i.checked])));
  return partes.join('\n');
});

// Lo que se ve de los planes, para comparar con lo esperado.
const vista = (p) => p.evaluate(() => {
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
  const valor = (dd) => (dd ? dd.childNodes[0].textContent.trim() : null);
  const tarjetas = [...document.querySelectorAll('[data-gps-planes] > .gps-plan:not(.gps-plan-combo)')].map((a) => ({
    id: a.querySelector('h3').id, nombre: txt(a.querySelector('h3')), lema: txt(a.querySelector('.gps-plan-lema')), destacado: a.classList.contains('gps-plan-destacado'),
    alInstalar: valor(a.querySelector('.gps-precios > div:nth-child(1) > dd')), desglose: txt(a.querySelector('.gps-desglose')),
    mes: valor(a.querySelector('.gps-precio-mes > dd')), primerAnio: valor(a.querySelector('.gps-precios > div:nth-child(3) > dd')),
    condiciones: [...a.querySelectorAll('.gps-condiciones li')].map(txt),
  }));
  const combo = document.querySelector('[data-gps-planes] > .gps-plan-combo');
  return {
    tarjetas,
    combo: combo ? {
      nombre: txt(combo.querySelector('h3')), lema: txt(combo.querySelector('.gps-plan-lema')), pie: txt(combo.querySelector('.gps-plan-pie')),
      variantes: [...combo.querySelectorAll('.gps-variante')].map((v) => ({
        nombre: txt(v.querySelector('h4')), alInstalar: valor(v.querySelector('.gps-precios > div:nth-child(1) > dd')),
        mes: valor(v.querySelector('.gps-precio-mes > dd')), ahorro: txt(v.querySelector('.gps-ahorro')),
      })),
    } : null,
    borrador: [...document.querySelectorAll('[data-gps-planes] .gps-precios > div')].filter((d) => d.querySelector('dt').textContent !== 'Primer año')
      .map((d) => !!d.querySelector('dd > .etiqueta-borrador')),
    extras: [...document.querySelectorAll('[data-gps-extras] li')].map((li) => [txt(li.querySelector('span')), txt(li.querySelector('b'))]),
    extrasVisibles: !document.querySelector('[data-gps-extras]').parentNode.hidden,
    compara: [...document.querySelectorAll('.gps-tabla tbody tr')].map((tr) => ({
      taxicun: tr.hasAttribute('data-gps-compara'),
      celdas: [...tr.children].flatMap((c) => [c.childNodes[0]?.textContent.trim() ?? '', ...[...c.querySelectorAll('small')].map(txt)]),
    })),
    radios: [...document.querySelectorAll('[data-gps-opciones-plan] input[name="plan"]')].map((i) => [i.value, txt(i.parentNode), i.checked]),
    nota: document.querySelector('[data-gps-nota]') ? { visible: !document.querySelector('[data-gps-nota]').hidden, valores: [...document.querySelectorAll('[data-gps-nota] [data-gps]')].map(txt) } : null,
    flotas: txt(document.querySelector('[data-gps-flotas]')),
    faq: txt(document.querySelector('[data-gps-faq-permanencia]')),
    etiquetas: [...new Set([...document.querySelectorAll('[data-gps-planes] *, [data-gps-extras] *, .gps-tabla tbody *, [data-gps-opciones-plan] *')].map((e) => e.localName))].sort(),
  };
});

// Lo esperado de un cuerpo de la API, calculado aquí (no con el código de la página ni el del generador).
function esperado(d) {
  const bases = d.planes.filter((p) => p.combo === null);
  const combos = d.planes.filter((p) => p.combo !== null);
  const meses = (n) => `${n} ${n === 1 ? 'mes' : 'meses'}`;
  return {
    tarjetas: bases.map((p) => ({
      id: `plan-${p.id}`, nombre: p.nombre, lema: p.lema || null, destacado: p.destacado,
      alInstalar: pesos(p.precioEquipo + p.instalacion),
      desglose: p.precioEquipo > 0 && p.instalacion > 0 ? `equipo ${pesos(p.precioEquipo)} + instalación ${pesos(p.instalacion)}` : p.precioEquipo + p.instalacion === 0 ? 'instalación incluida' : null,
      mes: pesos(p.mes), primerAnio: pesos(p.precioEquipo + p.instalacion + 12 * p.mes),
      condiciones: [p.permanenciaMeses ? `Permanencia de ${meses(p.permanenciaMeses)}.` : 'Sin permanencia.', ...p.condiciones],
    })),
    combo: combos.length ? {
      nombre: d.combo.nombre, lema: d.combo.lema || null,
      pie: `Incluye la licencia de TaxiCun para ese taxi (Plan B, ${pesos(d.licenciaMes)} al mes) y las mismas condiciones del plan del equipo.`,
      variantes: combos.map((c) => ({
        nombre: c.nombre, alInstalar: pesos(c.precioEquipo + c.instalacion), mes: pesos(c.mes),
        ahorro: `Te ahorras ${pesos(d.planes.find((b) => b.id === c.combo.base).mes + d.licenciaMes - c.mes)} al mes frente a pagarlos por separado.`,
      })),
    } : null,
    nBorrador: bases.length * 2 + combos.length * 2,
    extras: d.extras.map((e) => [e.texto, pesos(e.valor)]),
    radios: [...bases.map((p) => [p.id, p.nombre, false]), ...(combos.length ? [['combo', 'Combo con TaxiCun', false]] : []), ['no_se', 'No sé todavía', true]],
    comparaTaxicun: bases.map((p) => {
      const al = p.precioEquipo + p.instalacion;
      const nota = al === 0 ? 'instalación incluida' : p.precioEquipo > 0 && p.instalacion > 0 ? 'equipo e instalación' : p.precioEquipo > 0 ? 'equipo, con la instalación incluida' : 'instalación';
      return [`TaxiCun GPS · ${p.nombre}`, pesos(al), nota, pesos(p.mes), pesos(al + 12 * p.mes)];
    }),
  };
}

function revisarVista(v, d, quien) {
  const e = esperado(d);
  ok(JSON.stringify(v.tarjetas) === JSON.stringify(e.tarjetas), `${quien}: las tarjetas (${e.tarjetas.length}): nombres, lemas, destacado, al instalar con su desglose, cada mes, primer año, permanencia y condiciones${JSON.stringify(v.tarjetas) === JSON.stringify(e.tarjetas) ? '' : `\n   visto:    ${JSON.stringify(v.tarjetas)}\n   esperado: ${JSON.stringify(e.tarjetas)}`}`);
  ok(JSON.stringify(v.combo) === JSON.stringify(e.combo), `${quien}: el combo${e.combo ? ` (${e.combo.variantes.length} variante(s), ahorro y licencia)` : ': no sale'}${JSON.stringify(v.combo) === JSON.stringify(e.combo) ? '' : `\n   visto:    ${JSON.stringify(v.combo)}\n   esperado: ${JSON.stringify(e.combo)}`}`);
  ok(v.borrador.length === e.nBorrador && v.borrador.every(Boolean), `${quien}: los ${e.nBorrador} precios (al instalar y cada mes) llevan la etiqueta «borrador» (${v.borrador.length})`);
  ok(JSON.stringify(v.extras) === JSON.stringify(e.extras) && v.extrasVisibles === e.extras.length > 0, `${quien}: otros valores ${e.extras.length ? JSON.stringify(v.extras) : 'ocultos (no hay)'}`);
  const filas = v.compara.filter((f) => f.taxicun).map((f) => f.celdas);
  const otros = v.compara.filter((f) => !f.taxicun).map((f) => f.celdas[0]);
  ok(JSON.stringify(filas) === JSON.stringify(e.comparaTaxicun) && v.compara.slice(0, filas.length).every((f) => f.taxicun)
    && JSON.stringify(otros) === JSON.stringify(PLANES.competencia.otros.map((o) => o.etiqueta)),
  `${quien}: comparación con ${filas.length} fila(s) de TaxiCun arriba (al instalar con su nota, cada mes, primer año) y las ${otros.length} de los otros igual${JSON.stringify(filas) === JSON.stringify(e.comparaTaxicun) ? '' : `\n   visto:    ${JSON.stringify(filas)}\n   esperado: ${JSON.stringify(e.comparaTaxicun)}`}`);
  ok(JSON.stringify(v.radios) === JSON.stringify(e.radios), `${quien}: opciones del formulario ${v.radios.map((r) => r[0]).join(', ')} («No sé todavía» marcada)`);
  ok(v.etiquetas.every((t) => ['article', 'b', 'dd', 'div', 'dl', 'dt', 'h3', 'h4', 'input', 'label', 'li', 'p', 'small', 'span', 'svg', 'td', 'th', 'tr', 'ul', 'use'].includes(t)), `${quien}: solo las etiquetas de siempre (${v.etiquetas.join(' ')})`);
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
  if (d.municipio !== undefined) await p.fill('#g-municipio', d.municipio);
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

// Llena y envía (después de 3 s en la página, como una persona) y devuelve lo que recibió el servidor falso.
async function enviarFormulario(p, d) {
  estado.modo = 'ok'; estado.recibidos = [];
  await p.waitForFunction(() => performance.now() > 3100);
  await llenar(p, d);
  await enviarYEsperar(p, '#gps-listo');
  return estado.recibidos[0] || {};
}

const nadaGuardado = async (r) => {
  const g = await r.p.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie }));
  return g.ls === 0 && g.ss === 0 && g.cookie === '' && (await r.contexto.cookies()).length === 0;
};
const cspRota = (p) => p.evaluate(() => window.__csp);
const erroresDeJs = (r, tambien = null) => r.errores.filter((e) => !/Failed to load resource.*(404|500)|net::ERR_INTERNET_DISCONNECTED/.test(e) && !(tambien && tambien.test(e)));

// ================================================================ 2) la página completa (con la versión 1 de la API)
for (const [nombre, vistaNav] of [['escritorio', ESCRITORIO], ['celular', CELULAR]]) {
  console.log(`\n== ${nombre}`);
  estado.planes = 'v1';
  const r = await nuevaPagina(vistaNav);
  const { p } = r;
  await decidida(p);
  const f = await fuente(p);
  ok(f.fuente === 'api' && f.version === '1' && !f.motivo, `los planes vienen de la API (versión ${f.version}, ${f.fuente})`);

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

  // ---- precios: los del respaldo, cada uno con «borrador»
  const precios = await p.evaluate(() => [...document.querySelectorAll('.gps-precios > div')].map((d) => ({
    que: d.querySelector('dt').textContent.trim(), valor: d.querySelector('dd').childNodes[0].textContent.trim(), borrador: !!d.querySelector('.etiqueta-borrador'),
  })));
  const conValor = precios.filter((x) => x.que !== 'Primer año');
  ok(conValor.length === 8 && conValor.every((x) => x.borrador), `los ${conValor.length} precios (al instalar y cada mes) llevan la etiqueta «borrador»`);
  const visibles = precios.map((x) => x.valor);
  ok(esperados.every((e) => visibles.includes(e)), `precios iguales al respaldo de gps-planes.json: ${esperados.join(' ')}`);
  revisarVista(await vista(p), RESPALDO, 'versión 1');
  const tabla = await p.evaluate(() => [...document.querySelectorAll('.gps-tabla tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()));
  ok(tabla.length === 2 + PLANES.competencia.otros.length && tabla[0].includes('$697.800') && tabla[1].includes('$598.800') && tabla[2].includes('$902.000'), 'comparación: TaxiCun y los otros (A $902.000 el primer año)');
  ok(!/SPIA|OnTrack|Atlas/i.test(await p.content()), 'la comparación no nombra marcas (D-G2)');
  const nota = await p.evaluate(() => document.querySelector('[data-gps-nota]')?.textContent.replace(/\s+/g, ' ').trim());
  ok(nota?.startsWith('$29.900 al mes con el equipo comprado, o $49.900 al mes sin cuota inicial (precios en borrador).'), `la nota de arriba: «${nota?.slice(0, 70)}…»`);

  // ---- carga sana
  const imgs = await p.evaluate(async () => {
    const lista = [...document.images];
    for (const i of lista) { i.loading = 'eager'; if (!i.complete) await new Promise((listo) => { i.onload = i.onerror = listo; }); }
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
    .filter((e) => e.name !== 'sitioWeb' && e.type !== 'radio' && !document.querySelector(`label[for="${e.id}"]`)).map((e) => e.name));
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
  await llenar(p, { nombre: 'www.spam.com', celular: '12345', correo: 'x@', cooperativa: 'otra', municipio: '', placa: 'AB12', taxis: 0, mensaje: 'mira https://x.co', autorizo: false });
  await p.click('.gps-enviar');
  const mensajes = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.campo-error:not([hidden])')].map((e) => [e.id.replace('-error', ''), e.textContent])));
  ok(/sin enlaces/.test(mensajes['g-nombre'] || '') && /10 dígitos/.test(mensajes['g-celular'] || '') && /correo/.test(mensajes['g-correo'] || '')
    && /3 letras y 3 números/.test(mensajes['g-placa'] || '') && /de 1 a 500/.test(mensajes['g-taxis'] || '') && /enlaces/.test(mensajes['g-mensaje'] || '')
    && /autorización/.test(mensajes['g-autorizo'] || '') && /municipio/.test(mensajes['g-municipio'] || ''), `datos malos: un mensaje claro por campo, también «Tu municipio» con «Otra» (${Object.keys(mensajes).length}: ${JSON.stringify(mensajes)})`);
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
  ok(c.nombre === 'María Gómez' && c.celular === '3001234567' && c.placa === 'TAX123' && c.taxis === 2 && c.plan === 'sin_cuota' && c.cooperativa === 'cootransrural' && c.municipio === 'El Rosal' && c.correo === 'maria@ejemplo.co',
    `normalizado: «${c.nombre}», ${c.celular}, placa ${c.placa}, ${c.taxis} taxis, ${c.plan}`);
  ok(c.planesVersion === 1, `planesVersion: la versión de los precios que vio (${c.planesVersion})`);
  ok(c.autorizo === true && c.version === PLANES.autorizacion.version, `autorización: autorizo y la versión ${c.version} del texto de la casilla`);
  ok(c.sitioWeb === '' && c.tiempoMs >= 3000, `trampa vacía y tiempo en la página (${c.tiempoMs} ms)`);
  ok(rec.origen === origen && /^application\/json/.test(rec.tipo) && rec.cookie === '' && rec.consulta === '' && rec.tam < 4096, `mismo origen, JSON, sin cookies, nada en la dirección, ${rec.tam} bytes`);
  ok(await p.evaluate(() => location.search === '' && !/maria|3001234567/i.test(location.href)), 'la dirección de la página no lleva datos');
  await capturar(p, '.gps-formulario-caja', `${nombre}-13-formulario-listo.png`);

  // ---- «Otra / no estoy en una»: escribe el municipio; sin placa, la placa no va en el cuerpo
  await p.reload({ waitUntil: 'networkidle' });
  estado.recibidos = [];
  ok(!(await p.isVisible('#g-municipio')), '«Tu municipio» solo aparece con «Otra»');
  await p.waitForFunction(() => performance.now() > 3100);
  await llenar(p, { ...BUENOS, cooperativa: 'otra', municipio: ' Villapinzón ', placa: '' });
  ok(await p.isVisible('#g-municipio'), 'con «Otra» aparece «Tu municipio»');
  await enviarYEsperar(p, '#gps-listo');
  const otra = estado.recibidos[0] || {};
  ok(otra.problemas?.length === 0 && otra.cuerpo?.cooperativa === 'otra' && otra.cuerpo?.municipio === 'Villapinzón' && !('placa' in (otra.cuerpo || {})),
    `«Otra»: municipio escrito y sin placa en el cuerpo${otra.problemas?.length ? ': ' + otra.problemas : ''}`);

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
    ok(href.startsWith('mailto:info@taxicun.com?subject=Quiero%20GPS%20para%20mi%20taxi') && cuerpo.includes('María Gómez') && cuerpo.includes('3001234567') && cuerpo.includes('El Rosal · Cootransrural') && cuerpo.includes('Placa: TAX123'),
      `${modo}: respaldo con el correo a info@ listo (asunto y lo llenado, con la placa)`);
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
  ok(await nadaGuardado(r), 'no guarda nada en el navegador');
  const csp = await cspRota(p);
  ok(csp.length === 0, `0 violaciones de la CSP estricta (obligatoria)${csp.length ? ': ' + csp.slice(0, 4) : ''}`);
  ok(r.externos.length === 0, `nada pedido a terceros${r.externos.length ? ': ' + r.externos.slice(0, 4) : ''}`);
  const erroresJs = erroresDeJs(r);
  ok(erroresJs.length === 0, `sin errores de JS${erroresJs.length ? ': ' + erroresJs.slice(0, 3) : ''}`);
  ok(r.fallidos.length === 0, `sin archivos que falten${r.fallidos.length ? ': ' + r.fallidos : ''}`);
  await r.contexto.close();
}

// ================================================================ 3) los planes desde la API (§14.4)
console.log('\n== planes desde la API');
// Abre la página en un contexto nuevo (sin caché) con la API en «modo» y espera a que la tienda decida.
async function abrir(modo, { vistaNav = ESCRITORIO, ruta = null, cookie = false } = {}) {
  estado.planes = modo;
  estado.pedidosPlanes = [];
  const r = await nuevaPagina(vistaNav, { esperar: null, cookie });
  if (ruta) await r.p.route('**/api/gps/planes', ruta);
  const t0 = Date.now();
  await r.p.goto(PAGINA, { waitUntil: 'load' });
  await decidida(r.p);
  r.ms = Date.now() - t0;
  r.f = await fuente(r.p);
  return r;
}

// El respaldo: lo que muestra la página si la API no está (404, como el servidor sin GPS).
const conRespaldo = await abrir('404');
ok(conRespaldo.f.fuente === 'respaldo' && conRespaldo.f.version === '1' && conRespaldo.f.motivo === 'http_404', `404: queda el respaldo (versión 1; motivo ${conRespaldo.f.motivo})`);
const FIRMA_RESPALDO = await firma(conRespaldo.p);
revisarVista(await vista(conRespaldo.p), RESPALDO, 'respaldo');
await conRespaldo.contexto.close();

// La versión 1 de la API pinta EXACTAMENTE lo mismo que el respaldo que armó el generador.
{
  const r = await abrir('v1');
  ok(r.f.fuente === 'api' && r.f.version === '1', `v1: la pinta la API (${r.f.fuente}, versión ${r.f.version})`);
  ok(await firma(r.p) === FIRMA_RESPALDO, 'v1: lo que pinta tienda.js es idéntico a lo que arma el generador con el respaldo (tarjetas, combo, otros valores, comparación, opciones, nota, flotas y permanencia)');
  await r.contexto.close();
}

// Versión 2: cambia casi todo.
{
  const r = await abrir('v2');
  const { p } = r;
  ok(r.f.fuente === 'api' && r.f.version === '2' && !r.f.motivo, `v2: la pinta la API (versión ${r.f.version})`);
  const v = await vista(p);
  revisarVista(v, PLANES_V2, 'v2');
  ok(v.nota?.visible && JSON.stringify(v.nota.valores) === JSON.stringify(['$31.900', '$54.900']), `v2: la nota de arriba con los precios nuevos (${v.nota?.valores})`);
  ok(v.flotas === '15', `v2: «¿Tienes 15 taxis o más…?» (${v.flotas})`);
  ok(v.faq === 'En «Compra», no. En «Sin cuota inicial», 18 meses, porque el equipo es nuestro. En «Flotas de 10 o más», 6 meses. En el combo, la misma del plan del equipo.', `v2: «¿Hay permanencia?» sale de los planes: ${v.faq}`);
  ok(await firma(p) !== FIRMA_RESPALDO, 'v2: la página cambió frente al respaldo');
  ok(estado.pedidosPlanes.length === 1 && estado.pedidosPlanes[0].cookie === '' && estado.pedidosPlanes[0].respuesta === 200, `v2: un solo pedido a /api/gps/planes, sin cookies (${estado.pedidosPlanes.length})`);
  await capturar(p, '#planes', 'escritorio-20-planes-api-v2.png');
  await capturar(p, '#compara', 'escritorio-21-compara-api-v2.png');
  await capturar(p, '#quiero', 'escritorio-22-formulario-api-v2.png');
  // El formulario manda el plan nuevo, la versión 2 y la placa.
  const rec = await enviarFormulario(p, { ...BUENOS, plan: 'flota_10' });
  ok(rec.problemas?.length === 0 && rec.cuerpo?.plan === 'flota_10' && rec.cuerpo?.planesVersion === 2 && rec.cuerpo?.placa === 'TAX123',
    `v2: el formulario manda plan «${rec.cuerpo?.plan}», planesVersion ${rec.cuerpo?.planesVersion} y placa ${rec.cuerpo?.placa}${rec.problemas?.length ? ': ' + rec.problemas : ''}`);
  // Al volver a abrir, el ETag ahorra el cuerpo (304) y la página sigue con la versión 2.
  estado.pedidosPlanes = [];
  await p.reload({ waitUntil: 'load' });
  await decidida(p);
  const f2 = await fuente(p);
  const pedido = estado.pedidosPlanes[0] || {};
  ok(/^"gps-planes-2-[0-9a-f]{12}"$/.test(pedido.inm) && pedido.respuesta === 304 && f2.fuente === 'api' && f2.version === '2', `v2: al volver a abrir, If-None-Match ${pedido.inm} → ${pedido.respuesta}, y sigue la versión ${f2.version}`);
  ok(await nadaGuardado(r) && (await cspRota(p)).length === 0 && erroresDeJs(r).length === 0, 'v2: nada guardado en el navegador, 0 violaciones de CSP y sin errores de JS');
  await r.contexto.close();
  // En el celular: sin desborde y la captura de los planes.
  const c = await abrir('v2', { vistaNav: CELULAR });
  const anchos = await c.p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  ok(c.f.version === '2' && anchos[0] <= anchos[1], `v2 en el celular: sin desborde (${anchos[0]} ≤ ${anchos[1]})`);
  await capturar(c.p, '#planes', 'celular-20-planes-api-v2.png');
  await c.contexto.close();
}

// Versión 3: un solo plan, sin combos ni otros valores, sin «compra» ni «sin_cuota».
{
  const r = await abrir('v3');
  const { p } = r;
  ok(r.f.fuente === 'api' && r.f.version === '3', `v3: la pinta la API (versión ${r.f.version})`);
  const v = await vista(p);
  revisarVista(v, PLANES_V3, 'v3');
  ok(v.nota && !v.nota.visible && !(await p.isVisible('[data-gps-nota]')), 'v3: la nota de arriba nombra planes que ya no existen: se oculta');
  ok(v.faq === 'En «Básico», 1 mes.' && v.flotas === '2', `v3: permanencia «${v.faq}» y flotas ${v.flotas}`);
  await capturar(p, '#planes', 'escritorio-23-planes-api-v3.png');
  const rec = await enviarFormulario(p, { ...BUENOS, plan: 'basico', placa: '' });
  ok(rec.problemas?.length === 0 && rec.cuerpo?.plan === 'basico' && rec.cuerpo?.planesVersion === 3 && !('placa' in (rec.cuerpo || {})),
    `v3: el formulario manda plan «${rec.cuerpo?.plan}», planesVersion ${rec.cuerpo?.planesVersion} y sin placa`);
  await r.contexto.close();
}

// Señuelos de HTML que pasan los topes: se ven literales y nada se ejecuta.
{
  const r = await abrir('xss');
  const { p } = r;
  ok(r.f.fuente === 'api' && r.f.version === '7', `señuelos: la API los manda en una versión válida (versión ${r.f.version})`);
  const lit = await p.evaluate(() => ({
    nombre: document.getElementById('plan-compra')?.textContent, lema: document.querySelector('#plan-compra + .gps-plan-lema')?.textContent,
    condicion: document.querySelector('[aria-labelledby="plan-compra"] .gps-condiciones li:nth-child(2)')?.textContent,
    combo: document.getElementById('plan-combo')?.textContent, extra: document.querySelector('[data-gps-extras] li span')?.textContent,
    radio: document.querySelector('input[name="plan"][value="compra"]')?.parentNode.textContent,
    compara: document.querySelector('tr[data-gps-compara] th')?.textContent, faq: document.querySelector('[data-gps-faq-permanencia]')?.textContent,
    visto: document.getElementById('plan-compra')?.innerText,
    elementos: document.querySelectorAll('#planes b:not(.gps-extras b), #planes i, #planes script, #planes img, #planes strong, #planes em').length,
    xss: typeof window.__xss,
  }));
  ok(lit.nombre === SENUELOS.nombre && lit.visto === SENUELOS.nombre, `señuelos: el nombre se ve tal cual: ${lit.visto}`);
  ok(lit.lema === SENUELOS.lema && lit.condicion === SENUELOS.condicion && lit.combo === SENUELOS.combo && lit.extra === SENUELOS.extra,
    'señuelos: lema, condición, combo y otro valor, tal cual');
  ok(lit.radio === SENUELOS.nombre && lit.compara === `TaxiCun GPS · ${SENUELOS.nombre}` && lit.faq.includes(`«${SENUELOS.nombre}»`), 'señuelos: también en el formulario, la comparación y la permanencia');
  ok(lit.elementos === 0 && lit.xss === 'undefined', `señuelos: ningún elemento nacido de un texto (${lit.elementos}) y nada se ejecutó`);
  ok((await cspRota(p)).length === 0 && erroresDeJs(r).length === 0, 'señuelos: 0 violaciones de CSP (Trusted Types) y sin errores de JS');
  await capturar(p, '#planes', 'escritorio-24-planes-senuelos.png');
  await r.contexto.close();
}

// Todo lo que falla deja la página IGUAL al respaldo, sin mezclar, con su motivo.
for (const [modo, esperadoMotivo, nota] of [
  ['500', /^http_500$/, 'error del servidor'],
  ['html', /^no_json$/, 'HTML en vez de JSON'],
  ['texto', /^no_json$/, 'JSON con otro tipo de contenido'],
  ['json-malo', /^json_malo$/, 'JSON cortado'],
  ['grande', /^grande$/, 'más de 32 KB'],
  ['topes', /^invalido planes\[compra\]\.mes fuera_de_tope$/, 'un precio fuera de los topes'],
  ['no-cuadra', /^invalido planes\[sin_cuota\]\.primerAnio no_cuadra$/, 'el primer año no cuadra'],
  ['id-reservado', /^invalido planes\[no_se\]\.id id_reservado$/, 'un id reservado'],
  ['xss-html', /^invalido planes\[compra\]\.nombre texto_no_permitido$/, 'HTML de verdad en un nombre'],
  ['redirige', /^sin_red$/, 'una redirección'],
  ['mudo', /^sin_respuesta$/, '4 s sin respuesta'],
  ['sin red', /^sin_red$/, 'sin red'],
]) {
  const r = await abrir(modo === 'sin red' ? 'v2' : modo, modo === 'sin red' ? { ruta: (ruta) => ruta.abort('internetdisconnected') } : {});
  const igual = await firma(r.p) === FIRMA_RESPALDO;
  ok(r.f.fuente === 'respaldo' && r.f.version === '1' && esperadoMotivo.test(r.f.motivo || '') && igual,
    `${modo} (${nota}): la página queda igual al respaldo, sin mezclar (motivo «${r.f.motivo}»${modo === 'mudo' ? `, a los ${(r.ms / 1000).toFixed(1)} s` : ''})`);
  if (modo === 'mudo') ok(r.ms >= 3800 && r.ms < 7000, `mudo: la tienda deja de esperar a los 4 s (${r.ms} ms)`);
  if (modo === 'xss-html') ok(await r.p.evaluate(() => typeof window.__xss === 'undefined' && !document.querySelector('#planes img')), 'xss-html: nada se ejecutó ni se insertó');
  if (modo === '500') {
    const rec = await enviarFormulario(r.p, BUENOS);
    ok(rec.problemas?.length === 0 && rec.cuerpo?.planesVersion === 1 && rec.cuerpo?.plan === 'sin_cuota', `500: el formulario manda planesVersion ${rec.cuerpo?.planesVersion} (la del respaldo)`);
  }
  const csp = await cspRota(r.p);
  // La redirección bloqueada (redirect: 'error') la anota Chromium como un recurso que no cargó.
  const errores = erroresDeJs(r, modo === 'redirige' ? /Failed to load resource: net::ERR_FAILED/ : null);
  if (csp.length || errores.length) ok(false, `${modo}: CSP ${csp} · errores de JS ${errores}`);
  await r.contexto.close();
}

// Los topes y las reglas, caso por caso: los mismos cuerpos que el generador rechaza (pruebas/gps-planes-casos.mjs).
{
  const casos = casosPlanes(RESPALDO);
  const r = await abrir('v1');
  let malos = 0;
  for (const c of casos) {
    estado.planes = { cuerpo: c.cuerpo };
    await r.p.reload({ waitUntil: 'load' });
    await decidida(r.p);
    const f = await fuente(r.p);
    if (c.valido) {
      const bienCaso = f.fuente === 'api' && f.version === String(c.cuerpo.version);
      if (!bienCaso) malos += 1;
      ok(bienCaso, `topes · ${c.nombre}: la pinta la API (versión ${f.version}${f.motivo ? ', motivo ' + f.motivo : ''})`);
    } else {
      const igual = await firma(r.p) === FIRMA_RESPALDO;
      const bienCaso = f.fuente === 'respaldo' && f.motivo === `invalido ${c.ruta} ${c.codigo}` && igual;
      if (!bienCaso) malos += 1;
      ok(bienCaso, `topes · ${c.nombre}: queda el respaldo entero («${f.motivo}»)`);
    }
  }
  ok(malos === 0 && (await cspRota(r.p)).length === 0 && erroresDeJs(r).length === 0, `topes: los ${casos.length} casos como el generador, sin violaciones de CSP ni errores de JS`);
  await r.contexto.close();
}

// El pedido va sin cookies aunque el navegador tenga una del sitio.
{
  const r = await abrir('v2', { cookie: true });
  const pedido = estado.pedidosPlanes[0] || {};
  ok(r.f.version === '2' && pedido.cookie === '', `con una cookie del sitio en el navegador, /api/gps/planes llega sin cookies («${pedido.cookie}»)`);
  await r.contexto.close();
}

// ================================================================ 4) páginas para imprimir (aviso y formato)
{
  estado.planes = 'v1';
  const contexto = await navegador.newContext({ viewport: { width: 1000, height: 900 } });
  contextos.push(contexto);
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

// ================================================================ 5) sin JavaScript
{
  const contexto = await navegador.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  contextos.push(contexto);
  const p = await contexto.newPage();
  await p.goto(PAGINA);
  ok(!(await p.isVisible('#formulario-gps')), 'sin JavaScript: el formulario no se muestra (no se envía nada por la dirección)');
  ok(await p.isVisible('.gps-formulario-caja noscript >> nth=0').catch(() => false) || /activa JavaScript/.test(await p.textContent('.gps-formulario-caja')), 'sin JavaScript: el aviso con el correo info@taxicun.com');
  ok(await p.evaluate(() => document.querySelector('[data-gps-fuente]').getAttribute('data-gps-fuente') === 'respaldo' && document.querySelectorAll('[data-gps-planes] .gps-plan').length === 3), 'sin JavaScript: los planes del respaldo se ven igual');
  await capturar(p, '.gps-formulario-caja', 'celular-15-sin-javascript.png').catch(() => {});
  await contexto.close();
}

// ================================================================ 6) lo que mandó el formulario, con el esquema del servidor
// Si está a mano el servidor de esta ronda, cada cuerpo que mandó la página en la prueba pasa su ESQUEMA_INTERES (ajv,
// cerrado), y el servidor falso pide lo mismo que él.
if (INTERES_SERVIDOR.includes('/r2/')) {
  try {
    const { ESQUEMA_INTERES } = await import(INTERES_SERVIDOR);
    const { default: AjvModule } = await import(join(INTERES_SERVIDOR, '../../../node_modules/ajv/dist/ajv.js'));
    const Ajv = AjvModule.default || AjvModule;
    const validar = new Ajv({ allErrors: true, strict: false }).compile(ESQUEMA_INTERES);
    const malos = estado.historial.filter((c) => !validar(c));
    ok(estado.historial.length >= 10 && malos.length === 0, `los ${estado.historial.length} cuerpos que mandó la página pasan el esquema del servidor (ESQUEMA_INTERES, cerrado)${malos.length ? ': ' + JSON.stringify(malos[0]) : ''}`);
    ok(JSON.stringify([...ESQUEMA_INTERES.required].sort()) === JSON.stringify([...OBLIGATORIAS].sort())
      && JSON.stringify(Object.keys(ESQUEMA_INTERES.properties).sort()) === JSON.stringify([...OBLIGATORIAS, ...OPCIONALES].sort()),
    'el servidor falso pide los mismos campos que el servidor (obligatorios y opcionales)');
    ok(estado.historial.some((c) => c.placa) && estado.historial.some((c) => !('placa' in c)) && estado.historial.some((c) => c.planesVersion === 2) && estado.historial.some((c) => c.plan === 'flota_10'),
      'entre ellos: con placa y sin placa, con la versión 2 y con un plan nuevo («flota_10»)');
  } catch (e) {
    console.log(`(no se pudo cargar el esquema del servidor: ${e.message.split('\n')[0]})`);
  }
} else console.log('(sin el servidor de esta ronda: los cuerpos no se revisan con su esquema)');

await navegador.close();
servidor.closeAllConnections();
servidor.close();
console.log(`\n${fallas ? `✘ ${fallas} falla(s)` : '✔ Todo bien'} · ${bien} ✔ · ${fallas} ✘ · capturas en ${CAPTURAS}`);
process.exit(fallas ? 1 : 0);
