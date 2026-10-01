// Prueba del diseño B «Verde Rosal»: recorre por la interfaz la app del pasajero
// (registro, pedido, viaje con conductor simulado, pago QR de prueba, calificación
// y Mis viajes) y la del conductor (ingreso, solicitud simulada, código, cobro con
// QR y calificación). Guarda capturas de cada pantalla.
//
// Sirve para cualquier cooperativa: con --empresa=<id> abre <id>/app/ y
// <id>/conductor/ (Cootransrural: app/ y conductor/), pone el GPS en el centro de
// su ficha y revisa que no se cuele nada de otra cooperativa (nombres, placas,
// teléfonos, «1999»…) ni «null», que nada se salga por los lados (también a
// 360 px), la llave Bre-B, la tarifa fija «<pueblo> → <destino>», las rutas de
// su ficha, los contactos de Ayuda y que otra cooperativa abierta en el mismo
// navegador no herede el registro, el historial, el viaje por pagar ni la sesión
// del conductor.
//
// Con --taxicun abre la app única TaxiCun (taxicun/?e=<id>&d=b y
// taxicun/conductor/?e=<id>&d=b) y revisa además la marca «TaxiCun · <cooperativa>»,
// «Cambiar de municipio» (lleva a taxicun/?elegir=1), que «Soy conductor» y
// «¿Eres pasajero?» se quedan en TaxiCun con ?e=<id> y «TaxiCun · desarrollada por
// interOS». Sin --taxicun revisa que nada de eso se cuele en las páginas propias.
//
// Uso: node pruebas/diseno-b.mjs [url_base] [--empresa=<id>] [--solo=pasajero|conductor] [--taxicun]
//      (por defecto http://localhost:8772/ y cootransrural; capturas en
//      /tmp/cootrans/capturas/b/, /tmp/cootrans/capturas/b-<id>/ o, con --taxicun,
//      /tmp/cootrans/capturas/tc-b/<id>/; o en $CAPTURAS)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, readdirSync, existsSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8772/').replace(/\/?$/, '/');
const SOLO = process.argv.find((a) => a.startsWith('--solo='))?.slice(7) || '';
const ID = (process.argv.find((a) => a.startsWith('--empresa='))?.slice(10) || 'cootransrural').toLowerCase().replace(/[^a-z0-9-]/g, '');
const PRINCIPAL = ID === 'cootransrural';
const FICHA = JSON.parse(readFileSync(new URL(`../empresas/${ID}/ficha.json`, import.meta.url), 'utf8'));
const E = FICHA.EMPRESA || {};
const NOMBRE = E.nombreCorto || E.nombre;
// «cooperativa» o «empresa» (EMPRESA.tipo; las S.A.S. dicen «la empresa»).
const TIPO = E.tipo === 'empresa' ? 'empresa' : 'cooperativa';
const PROPUESTA = FICHA.estado === 'propuesta';
const TEL = String(E.telefono || '').replace(/\D/g, '');
const PRE = PRINCIPAL ? '' : `${ID}/`;
// App única TaxiCun (la cooperativa va en ?e=) o las páginas propias de la cooperativa.
const TAXICUN = process.argv.includes('--taxicun');
const URL_APP = TAXICUN ? `${BASE}taxicun/?e=${ID}&d=b` : `${BASE}${PRE}app/?d=b`;
const URL_CONDUCTOR = TAXICUN ? `${BASE}taxicun/conductor/?e=${ID}&d=b` : `${BASE}${PRE}conductor/?d=b`;
// Textos de marca: la app es TaxiCun y la desarrolla interOS.
const DESARROLLADA = TAXICUN ? 'TaxiCun · desarrollada por interOS' : 'Esta app es TaxiCun, desarrollada por interOS';
const DEMO_PARA = `Demostración de TaxiCun para ${E.nombre}`;
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || (TAXICUN ? `/tmp/cootrans/capturas/tc-b/${ID}` : PRINCIPAL ? '/tmp/cootrans/capturas/b' : `/tmp/cootrans/capturas/b-${ID}`)).replace(/\/?$/, '/');
// GPS en el centro del pueblo de la cooperativa (de su ficha).
const GEO = { latitude: FICHA.CENTRO.lat, longitude: FICHA.CENTRO.lng };
const DEMO = FICHA.CONDUCTORES_DEMO || [];
const MOVIL_DEMO = DEMO.some((c) => c.movil === '023') ? '023' : DEMO[0]?.movil || '023';
// Llave Bre-B de ejemplo: «@» + nombre corto sin tildes ni espacios + móvil.
const LLAVE = String(NOMBRE).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
let VIAJE_POR_PAGAR = null;
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
    // La página auxiliar de la prueba (la ficha en JSON) no tiene ícono.
    if (esRecurso && /\/favicon\.ico$/.test(url)) return;
    // Un servicio externo que responde sin CORS (p. ej. Nominatim cuando limita las consultas).
    const bloqueado = texto.match(/Access to fetch at '([^']+)'.*CORS policy/);
    if (bloqueado && !bloqueado[1].startsWith(BASE)) return;
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
  await revisarDesborde(pagina, `${nombre} (360 px)`);
  await pagina.setViewportSize(CELULAR);
  await pagina.waitForTimeout(400);
}

async function nuevoContexto(navegador, opciones = {}) {
  const ctx = await navegador.newContext({
    viewport: CELULAR,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    geolocation: GEO,
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

/* ------------------------------------------------------------------ */
/* Revisiones para varias cooperativas                                 */
/* ------------------------------------------------------------------ */
// Palabras que no pueden verse fuera de Cootransrural. Se descuentan los datos
// reales de la ficha (p. ej. Subachoque tiene una ruta hacia «El Rosal») y los
// textos que vienen de mapas y búsquedas (direcciones, resultados, recorridos).
// Las demás cooperativas con ficha: su nombre y su placa (p. ej. «SUB 602») tampoco
// pueden aparecer aquí. En Cootransrural, además, nada de las otras.
const OTRAS = readdirSync(new URL('../empresas/', import.meta.url))
  .filter((id) => id !== ID && existsSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url)))
  .map((id) => JSON.parse(readFileSync(new URL(`../empresas/${id}/ficha.json`, import.meta.url), 'utf8')));
const escRe = (s) => String(s).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
const PROHIBIDAS = [
  ...(PRINCIPAL ? [] : [/el rosal/i, /verde rosal/i, /\b1999\b/, /320 ?904 ?2977/]),
  // Palabra completa: «Cootransvi» (Villeta) no debe coincidir dentro de «Cootransvillaleal» (La Vega).
  ...OTRAS.flatMap((f) => [f.EMPRESA?.nombreCorto, f.EMPRESA?.nombre].filter(Boolean).map((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escRe(n)}(?![\\p{L}\\p{N}])`, 'iu'))),
  ...OTRAS.map((f) => f.EMPRESA?.placaPrefijo).filter((p) => p && p !== E.placaPrefijo).map((p) => new RegExp(`\\b${escRe(p)} ?\\d{3}\\b`)),
].filter((re, i, todas) => todas.findIndex((x) => x.source === re.source) === i);
const DATOS_FICHA = [
  ...(FICHA.RUTAS || []).map((r) => r.destino),
  ...(FICHA.LUGARES || []).flatMap((l) => [l.nombre, l.detalle]),
].filter((s) => s && PROHIBIDAS.some((re) => re.test(s)));

// Contenido más ancho que la pantalla (p. ej. una dirección larga que empuja la
// tarjeta hacia la derecha). En las pantallas que se desplazan hacia abajo nunca
// debe haber desplazamiento lateral.
async function revisarDesborde(pagina, donde) {
  const anchos = await pagina.evaluate(() => {
    const out = [];
    const raiz = document.scrollingElement;
    if (raiz.scrollWidth > raiz.clientWidth + 1) out.push(`página ${raiz.scrollWidth}>${raiz.clientWidth}`);
    for (const el of document.querySelectorAll('.vb-app *')) {
      if (!el.offsetParent || el.closest('.leaflet-container')) continue;
      const s = getComputedStyle(el);
      if (!/auto|scroll/.test(s.overflowY) || s.overflowX === 'hidden') continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.className.split(' ').find((c) => c.startsWith('vb-')) || el.tagName} ${el.scrollWidth}>${el.clientWidth}`);
    }
    // Piezas que se salen por la derecha de la app (sin contar el mapa ni las listas que se deslizan de lado).
    const app = document.querySelector('.vb-app')?.getBoundingClientRect();
    if (app) {
      for (const el of document.querySelectorAll('.vb-app *')) {
        if (!el.offsetParent || el.closest('.leaflet-container, .vb-aviso')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
        // No cuentan: lo que está dentro de una lista que se desliza de lado, ni lo que
        // recorta a propósito una caja propia (p. ej. la foto de la bienvenida).
        let aparte = false;
        for (let x = el.parentElement; x && !x.matches('.vb-app, .vb-vista, .vb-desliza, body'); x = x.parentElement) {
          const s = getComputedStyle(x);
          const lateral = /auto|scroll/.test(s.overflowX) && !/auto|scroll/.test(s.overflowY);
          const recorta = s.overflowX !== 'visible' && x.getBoundingClientRect().right <= app.right + 1.5;
          if (lateral || recorta) { aparte = true; break; }
        }
        if (!aparte && r.right > app.right + 1.5) out.push(`${el.className?.split?.(' ').find((c) => c.startsWith('vb-')) || el.tagName} sale ${Math.round(r.right - app.right)} px`);
      }
    }
    return [...new Set(out)].slice(0, 5);
  });
  ok(!anchos.length, `${donde}: nada se sale por los lados${anchos.length ? ` (${anchos.join(', ')})` : ''}`);
}

// ¿El enlace lleva a la app (rol 'pasajero' o 'conductor') de esta cooperativa? Dentro
// de TaxiCun: taxicun/… con ?e=<id>; fuera: <id>/app/ o <id>/conductor/.
function llevaA(href, rol) {
  if (!href) return false;
  const u = new URL(href, BASE);
  if (TAXICUN) return u.pathname.endsWith(rol === 'conductor' ? '/taxicun/conductor/' : '/taxicun/') && u.searchParams.get('e') === ID;
  return u.pathname.endsWith(`/${PRE}${rol === 'conductor' ? 'conductor' : 'app'}/`) && !u.searchParams.has('e');
}

// Marca TaxiCun: dentro de TaxiCun se ve «TaxiCun · <cooperativa>» con el ícono; fuera, no.
async function revisarMarcaTaxiCun(pagina, selector, donde) {
  const r = await pagina.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const img = el.querySelector('img');
    const caja = el.getBoundingClientRect();
    return { texto: el.textContent.replace(/\s+/g, ' ').trim(), src: img?.getAttribute('src') || '', cargada: Boolean(img?.complete && img.naturalWidth), visible: caja.width > 0 && caja.top >= 0 && caja.bottom <= innerHeight };
  }, selector);
  if (!TAXICUN) {
    ok(r === null && await pagina.locator('[data-taxicun], [data-cambiar-municipio]').count() === 0, `${donde}: sin marca TaxiCun ni «Cambiar de municipio» fuera de TaxiCun`);
    return;
  }
  ok(r && r.texto === `TaxiCun · ${NOMBRE}` && r.visible, `${donde}: «TaxiCun · ${NOMBRE}» visible sin desplazar${r ? ` («${r.texto}»)` : ''}`);
  ok(r && /img\/taxicun\/icono-192\.png$/.test(r.src) && r.cargada, `${donde}: ícono de TaxiCun cargado${r ? ` (${r.src})` : ''}`);
}

async function revisarTexto(pagina, donde) {
  const r = await pagina.evaluate((datos) => {
    let texto = document.body.innerText;
    const deDatos = '[data-dir-titulo], [data-dir-detalle], [data-resultados], .vb-punto-ruta, .vb-rutas li, .vb-lista, .vb-desde, .vb-detalle, .vb-estado-viaje h1, .vb-pagar-cab p, .vb-c-titulo h1';
    for (const el of document.querySelectorAll(deDatos)) if (el.innerText) texto = texto.split(el.innerText).join(' ');
    for (const s of datos) texto = texto.split(s).join(' ');
    // Enlaces vacíos: tel:/mailto: sin número, o WhatsApp sin número fuera de «Compartir».
    const malos = [...document.querySelectorAll('a[href]')]
      .filter((a) => {
        const h = a.getAttribute('href');
        if (/^tel:(\+57)?$/.test(h) || /^mailto:$/.test(h) || /undefined|null|NaN/.test(h)) return true;
        return /^https:\/\/wa\.me\/(\?|$)/.test(h) && !/compartir/i.test(a.textContent);
      })
      .map((a) => a.getAttribute('href').slice(0, 40));
    return { texto, malos, todo: document.body.innerText };
  }, DATOS_FICHA);
  const vacio = r.todo.match(/\b(null|undefined|NaN)\b/);
  ok(!vacio, `${donde}: sin «null», «undefined» ni «NaN» en pantalla${vacio ? ` (aparece «${vacio[0]}»)` : ''}`);
  ok(!r.malos.length, `${donde}: sin enlaces tel:, mailto: ni wa.me vacíos${r.malos.length ? ` (${r.malos.join(', ')})` : ''}`);
  const ajeno = PROHIBIDAS.map((re) => r.texto.match(re)).find(Boolean);
  ok(!ajeno, `${donde}: sin datos de otra cooperativa${ajeno ? ` (aparece «${ajeno[0]}»)` : ''}`);
  await revisarDesborde(pagina, donde);
}

// Contraste AA de todo texto visible contra su fondo real: color sólido, capas
// translúcidas encima y, si hay degradado, el color más desfavorable del degradado
// (4,5:1; 3:1 para letra grande). No cuenta lo que va sobre fotos ni el mapa.
async function revisarContraste(pagina, donde) {
  const fallas = await pagina.evaluate(() => {
    const nums = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (c) => c.slice(0, 3).map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    const k = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const mezcla = (arriba, abajo) => { const a = arriba[3] ?? 1; return [0, 1, 2].map((i) => arriba[i] * a + abajo[i] * (1 - a)); };
    // Colores posibles detrás del elemento (varios si hay un degradado).
    function fondos(el) {
      const capas = [];
      for (let x = el; x; x = x.parentElement) {
        const s = getComputedStyle(x);
        const bi = s.backgroundImage;
        if (bi && bi !== 'none' && /gradient/.test(bi)) {
          const cols = [...bi.matchAll(/rgba?\([^)]+\)/g)].map((m) => nums(m[0])).filter((c) => (c[3] ?? 1) > 0.5);
          if (cols.length) {
            capas.push(cols);
            if (cols.every((c) => (c[3] ?? 1) === 1)) break;
          }
        }
        const bc = nums(s.backgroundColor);
        if (bc.length && (bc[3] ?? 1) > 0) {
          capas.push([bc]);
          if ((bc[3] ?? 1) === 1) break;
        }
      }
      let res = [[255, 255, 255]];
      for (const capa of capas.reverse()) res = capa.flatMap((c) => res.map((r) => mezcla(c, r)));
      return res;
    }
    const out = [];
    for (const el of document.querySelectorAll('.vb-app *')) {
      if (!el.offsetParent || el.closest('.leaflet-container, svg, .ct-breb, .vb-ingreso-cab, .vb-bienv-escena, [disabled], [aria-disabled="true"]')) continue;
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const s = getComputedStyle(el);
      if (s.visibility === 'hidden' || Number(s.opacity) < 0.5) continue;
      const color = nums(s.color);
      const peor = Math.min(...fondos(el).map((b) => k(mezcla(color, b), b)));
      const tam = parseFloat(s.fontSize);
      const grande = tam >= 24 || (tam >= 18.6 && Number(s.fontWeight) >= 700);
      if (peor < (grande ? 3 : 4.5)) out.push(`${(typeof el.className === 'string' && el.className.split(' ')[0]) || el.tagName.toLowerCase()} «${el.textContent.trim().slice(0, 24)}» ${peor.toFixed(2)}`);
    }
    return [...new Set(out)].slice(0, 6);
  });
  ok(!fallas.length, `${donde}: contraste AA de todos los textos${fallas.length ? ` (${fallas.join(', ')})` : ''}`);
}

// Destino de prueba: en Cootransrural, Tierra Grata (Vía a Facatativá); en las
// demás, un lugar de la ficha con nombre único a 0,8–3,5 km del centro.
function destinoDePrueba() {
  if (PRINCIPAL) return { buscar: 'Tierra Grata', elegir: 'Vía a Facatativá', enViajes: 'Tierra Grata' };
  const km = (l) => {
    const r = Math.PI / 180;
    const dLat = (l.lat - FICHA.CENTRO.lat) * r;
    const dLng = (l.lng - FICHA.CENTRO.lng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(FICHA.CENTRO.lat * r) * Math.cos(l.lat * r) * Math.sin(dLng / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };
  // Nombre único y que no esté contenido en otro (p. ej. «Centro» está en «Parque Principal · Centro»).
  const textos = (FICHA.LUGARES || []).flatMap((l) => [l.nombre, l.detalle]).filter(Boolean);
  const unico = (l) => textos.filter((s) => s.includes(l.nombre)).length === 1;
  const candidatos = (FICHA.LUGARES || []).filter((l) => l.nombre.length >= 8 && unico(l) && !/rosal|cootransrural/i.test(l.nombre));
  const l = candidatos.find((x) => km(x) >= 0.8 && km(x) <= 3.5) || candidatos.find((x) => km(x) >= 0.3) || candidatos[0];
  return { buscar: l.nombre, elegir: l.nombre, enViajes: l.nombre, exacto: true };
}

/* ================================================================== */
/* SEPARACIÓN ENTRE COOPERATIVAS                                       */
/* ================================================================== */
// Otras cooperativas que se abren en el mismo navegador para ver que no heredan
// nada de esta (registro, historial, viaje por pagar, sesión del conductor).
const VECINAS = ['cootransrural', 'tabio', 'subachoque']
  .filter((v) => v !== ID && existsSync(new URL(`../empresas/${v}/ficha.json`, import.meta.url)))
  .slice(0, 2);
const urlDe = (id, seccion) => (TAXICUN
  ? `${BASE}taxicun/${seccion === 'conductor' ? 'conductor/' : ''}?e=${id}&d=b`
  : `${BASE}${id === 'cootransrural' ? '' : `${id}/`}${seccion}/?d=b`);
const nombreDe = (id) => OTRAS.find((f) => f.id === id)?.EMPRESA?.nombreCorto || id;

async function registrarRapido(pg) {
  await pg.click('[data-accion="reg-empezar"]');
  await pg.fill('input[name="nombre"]', 'Lucía Prueba');
  await pg.fill('input[name="celular"]', '311 222 3344');
  await pg.check('input[name="terminos"]');
  await pg.click('form[data-form="registro"] button[type="submit"]');
  await pg.waitForSelector('[data-codigo-prueba]');
  await pg.fill('#vb-codigo-sms', (await pg.textContent('[data-codigo-prueba]')).trim());
  await pg.waitForSelector('.vb-inicio', { timeout: 15000 });
}

async function probarSeparacionPasajero(ctx) {
  const pg = await ctx.newPage();
  vigilar(pg, 'separación');
  for (const [i, otra] of VECINAS.entries()) {
    await pg.goto(urlDe(otra, 'app'));
    await pg.waitForSelector('.vb-bienvenida, .vb-inicio', { timeout: 20000 });
    ok(await pg.isVisible('.vb-bienvenida'), `separación: en ${nombreDe(otra)} el pasajero de ${NOMBRE} no aparece registrado`);
    ok((await pg.textContent('.vb-bienv-marca b')).trim() === nombreDe(otra), `separación: ${nombreDe(otra)} muestra su propio nombre`);
    if (i === 0) {
      await registrarRapido(pg);
      ok(/Aún no hay viajes/.test(await pg.textContent('.vb-mosaico[data-pantalla="viajes"]')), `separación: ${nombreDe(otra)} no hereda el historial de ${NOMBRE}`);
      ok(/0 de 10 viajes/.test(await pg.textContent('.vb-mosaico.m-tarjeta')), `separación: ${nombreDe(otra)} no hereda los sellos de fidelidad`);
      await foto(pg, `s01-separacion-${otra}`);
      // Sonido apagado en otra cooperativa: aquí (con su interruptor encendido) sigue sonando.
      await pg.evaluate(() => localStorage.setItem('ct.sonido', 'no'));
      await pg.reload();
      await pg.waitForSelector('.vb-inicio', { timeout: 20000 });
      ok(await pg.evaluate(() => localStorage.getItem('ct.sonido')) === 'si', `separación: el sonido apagado en otra cooperativa no silencia ${nombreDe(otra)}`);
    }
  }
  // Viaje por pagar de esta cooperativa en la misma pestaña: la otra no lo retoma
  // (ni con el conductor de esta), y al volver aquí sigue esperando el pago.
  if (VIAJE_POR_PAGAR && VECINAS[0]) {
    const otra = VECINAS[0];
    const placa = JSON.parse(VIAJE_POR_PAGAR)?.estado?.conductor?.placa || '';
    await pg.goto(URL_APP);
    await pg.waitForSelector('.vb-inicio', { timeout: 20000 });
    // Una página del mismo sitio sin la app, para dejar el viaje guardado tal cual.
    await pg.goto(`${BASE}empresas/${ID}/ficha.json`);
    await pg.evaluate((v) => {
      const d = JSON.parse(v);
      d.guardado = Date.now();
      sessionStorage.setItem('ct.viaje.pasajero', JSON.stringify(d));
    }, VIAJE_POR_PAGAR);
    await pg.goto(urlDe(otra, 'app'));
    await pg.waitForSelector('.vb-inicio, .vb-pagar, .vb-calificar', { timeout: 20000 });
    await pg.waitForTimeout(800);
    const ajeno = await pg.isVisible('.vb-pagar') || (placa && (await pg.textContent('body')).includes(placa));
    ok(!ajeno, `separación: ${nombreDe(otra)} no retoma el viaje por pagar de ${NOMBRE}${placa ? ` (placa ${placa})` : ''}`);
    await foto(pg, `s02-separacion-viaje-${otra}`);
    await pg.goto(URL_APP);
    await pg.waitForSelector('.vb-inicio, .vb-pagar', { timeout: 20000 });
    ok(await pg.isVisible('.vb-pagar'), `separación: al volver a ${NOMBRE}, su viaje sigue esperando el pago`);
    await pg.click('[data-accion="pagar-efectivo"]', { timeout: 3000 }).catch(() => {});
  }
  await pg.close();
}

async function probarSeparacionConductor(ctx) {
  const pg = await ctx.newPage();
  vigilar(pg, 'separación-conductor');
  for (const otra of VECINAS) {
    await pg.goto(urlDe(otra, 'conductor'));
    await pg.waitForSelector('.vb-ingreso, .vb-c-servicios', { timeout: 20000 });
    ok(await pg.isVisible('.vb-ingreso'), `separación: en ${nombreDe(otra)} el conductor de ${NOMBRE} no queda con sesión abierta`);
  }
  await pg.goto(URL_CONDUCTOR);
  await pg.waitForSelector('.vb-ingreso, .vb-c-servicios', { timeout: 20000 });
  ok(await pg.isVisible('.vb-c-servicios'), `separación: al volver a ${NOMBRE}, el conductor sigue con su sesión`);
  await pg.close();
}

/* ================================================================== */
/* PASAJERO                                                            */
/* ================================================================== */
async function probarPasajero(navegador) {
  const ctx = await nuevoContexto(navegador);
  const pg = await ctx.newPage();
  vigilar(pg, 'pasajero');
  await pg.goto(URL_APP);

  // P1: bienvenida y registro obligatorio con SMS simulado
  await pg.waitForSelector('.vb-bienvenida', { timeout: 20000 });
  await pg.waitForSelector('.vb-bienv-escena .vb-foto.lista', { timeout: 10000 }).catch(() => {});
  ok(await pg.locator('.vb-bienv-escena .vb-foto.lista').count() === 1, 'foto de bienvenida cargada (ruta relativa)');
  await pg.waitForTimeout(600);
  await foto(pg, 'p01-bienvenida');
  ok((await pg.textContent('.vb-bienv-marca b')).trim() === NOMBRE, `bienvenida con el nombre de la cooperativa (${NOMBRE})`);
  ok(await pg.evaluate(() => document.documentElement.dataset.empresa) === FICHA.id, 'la página sabe qué cooperativa es');
  if (PROPUESTA) {
    const franja = await pg.evaluate(() => {
      const el = document.querySelector('.vb-bienvenida .vb-nota-propuesta');
      const r = el?.getBoundingClientRect();
      return el && r.top >= 0 && r.bottom <= innerHeight ? el.textContent.trim() : '';
    });
    ok(franja.includes(DEMO_PARA) && /No es la app oficial/.test(franja) && !/interOS/.test(franja), `bienvenida: franja «${DEMO_PARA} · No es la app oficial…» visible sin desplazar`);
  } else ok(await pg.locator('.vb-nota-propuesta').count() === 0, 'sin aviso de propuesta (es cliente)');
  await revisarMarcaTaxiCun(pg, '.vb-bienvenida [data-taxicun]', 'bienvenida');
  {
    const href = await pg.getAttribute('.vb-bienvenida [data-enlace-conductor]', 'href');
    ok(llevaA(href, 'conductor'), `bienvenida: «Soy conductor» lleva a ${TAXICUN ? `taxicun/conductor/?e=${ID}` : `${PRE}conductor/`} (${href})`);
    if (TAXICUN) {
      // Se abre de verdad: la app del conductor de TaxiCun con esta cooperativa.
      const otra = await ctx.newPage();
      vigilar(otra, 'soy-conductor');
      await otra.goto(new URL(href, BASE).href);
      await otra.waitForSelector('.vb-ingreso', { timeout: 30000 });
      const r = await otra.evaluate(() => ({ empresa: window.CT_EMPRESA, ruta: location.pathname, e: new URLSearchParams(location.search).get('e'), nombre: document.querySelector('.vb-ingreso-marca b')?.textContent.trim() }));
      ok(r.empresa === ID && r.ruta.endsWith('/taxicun/conductor/') && r.e === ID && r.nombre === NOMBRE, `«Soy conductor» abre el conductor de TaxiCun con ${NOMBRE} (${r.ruta}?e=${r.e})`);
      await otra.close();
    }
  }
  await revisarTexto(pg, 'bienvenida');
  await revisarContraste(pg, 'bienvenida');
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
  {
    const privacidad = await pg.$$eval('form[data-form="registro"] a[href]', (as) => as.map((a) => a.href));
    ok(privacidad.includes(`${BASE}${PRE}privacidad/`), `enlace a la política de privacidad de la cooperativa (${PRE}privacidad/)`);
  }
  if (TAXICUN) ok(await pg.isVisible('.vb-registro [data-taxicun]'), 'registro: «TaxiCun · …» encima del título');
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
  // El detalle también se resuelve (Nominatim o los lugares de la ficha).
  await pg.waitForFunction(() => !/Buscando la dirección/.test(document.querySelector('[data-dir-detalle]')?.textContent || ''), null, { timeout: 20000 }).catch(() => {});
  const recogida = `${(await pg.textContent('[data-dir-titulo]')).trim()} · ${(await pg.textContent('[data-dir-detalle]')).trim()}`;
  const deSuPueblo = recogida.includes(E.pueblo) || (FICHA.LUGARES || []).some((l) => recogida.includes(l.nombre)) || /^-?\d+\.\d+, -?\d+\.\d+$/.test(recogida.split(' · ')[1]);
  ok(deSuPueblo, `dirección de recogida en ${E.pueblo}: ${recogida}`);
  // Los taxis de ambiente se ven dentro del mapa (el mapa quedó en su pueblo, no en otro).
  const taxisEnMapa = await pg.evaluate(() => {
    const caja = document.querySelector('.vb-pedir-mapa').getBoundingClientRect();
    return [...document.querySelectorAll('.vb-pedir-mapa .ct-taxi-marcador')].filter((t) => {
      const r = t.getBoundingClientRect();
      return r.left >= caja.left - 20 && r.right <= caja.right + 20 && r.top >= caja.top - 20 && r.bottom <= caja.bottom + 20;
    }).length;
  });
  ok(taxisEnMapa >= 1, `taxis cerca dentro del mapa del inicio (${taxisEnMapa})`);
  await esperarMapa(pg, '.vb-pedir-mapa', 3200);
  await cerrarAvisos(pg);
  await foto(pg, 'p04-inicio');
  await fotoChica(pg, 'p04-inicio-360x740');
  await pg.evaluate(() => document.querySelector('.vb-inicio').scrollTo(0, 620));
  await pg.waitForTimeout(400);
  await foto(pg, 'p05-inicio-mosaicos');
  await pg.evaluate(() => document.querySelector('.vb-inicio').scrollTo(0, 99999));
  await pg.waitForTimeout(400);
  await foto(pg, 'p05b-inicio-pie');
  await pg.evaluate(() => document.querySelector('.vb-inicio').scrollTo(0, 0));
  await revisarTexto(pg, 'inicio');
  await revisarContraste(pg, 'inicio');
  ok((await pg.textContent('.vb-pie')).includes(DESARROLLADA), `pie del inicio: «${DESARROLLADA}»`);
  if (TAXICUN) {
    ok(await pg.isVisible('.vb-cab-inicio .vb-cab-tc img'), 'inicio: ícono de TaxiCun en la cabecera');
    // A 360 px pasa a ser un sello sobre la insignia de la cooperativa.
    await pg.setViewportSize(CHICO);
    await pg.waitForTimeout(300);
    ok(await pg.isVisible('.vb-cab-marca .vb-cab-tc-sello img') && !(await pg.isVisible('.vb-cab-inicio .vb-cab-tc')), 'inicio a 360 px: sello de TaxiCun sobre la insignia');
    await pg.setViewportSize(CELULAR);
    await pg.waitForTimeout(300);
  } else ok(await pg.locator('.vb-cab-tc, .vb-cab-tc-sello').count() === 0, 'inicio: sin ícono de TaxiCun fuera de TaxiCun');
  if (TEL) ok(await pg.locator(`.vb-mosaicos a[href="tel:+57${TEL}"]`).count() === 1, `inicio: llamar a la central (${E.telefonoVisible})`);
  else ok(await pg.locator('.vb-mosaicos a[href^="tel:"]').count() === 0 && /pronto|WhatsApp/.test(await pg.textContent('.vb-mosaicos')), 'inicio: sin teléfono, no hay «Llamar a la central» y se dice con honestidad');

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
  const DESTINO = destinoDePrueba();
  await pg.fill('[data-campo="busqueda"]', DESTINO.buscar);
  await pg.waitForSelector('[data-resultados] .vb-lugar');
  await pg.waitForTimeout(1800);
  await foto(pg, 'p08-paso2-busqueda');
  const nombreExacto = new RegExp(`^${DESTINO.elegir.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')}$`);
  const resultado = DESTINO.exacto
    ? pg.locator('[data-resultados] .vb-lugar').filter({ has: pg.locator('.vb-lugar-txt > b', { hasText: nombreExacto }) })
    : pg.locator('[data-resultados] .vb-lugar', { hasText: DESTINO.elegir });
  await resultado.first().click();
  ok(true, `destino elegido: ${DESTINO.elegir}`);

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
  await revisarTexto(pg, 'asignado');
  await revisarContraste(pg, 'asignado');
  ok(/Verificado por /.test(await pg.textContent('.vb-carne')) && (await pg.textContent('.vb-carne')).includes(NOMBRE), 'carné «Verificado por» la cooperativa');
  ok((await pg.getAttribute('.vb-carne .vb-sello', 'aria-label')) === `Verificado por ${NOMBRE}`, 'sello con el nombre de la cooperativa');
  if (PROPUESTA) ok((await pg.textContent('.vb-seg-cab-der')).includes(DEMO_PARA), `seguimiento: «${DEMO_PARA}» junto a «Modo prueba»`);
  else ok(await pg.locator('.vb-demo-para').count() === 0, 'seguimiento: sin aviso de demostración (es cliente)');
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
  ok(await pg.locator('.vb-hoja-sos a[href^="tel:+57"]').count() === (TEL ? 1 : 0), TEL ? 'SOS: llamar a la central' : 'SOS: sin teléfono, no se ofrece llamar a la central');
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
  await revisarTexto(pg, 'cobro QR Bre-B (pasajero)');
  await revisarContraste(pg, 'cobro QR Bre-B (pasajero)');
  if (PROPUESTA) ok((await pg.textContent('.vb-recibo-cab')).includes(DEMO_PARA), `pago: «${DEMO_PARA}» junto a «Modo prueba»`);
  await fotoChica(pg, 'p16-pagar-360x740');
  await pg.click('.vb-otro-cel summary');
  await pg.locator('.vb-otro-cel').scrollIntoViewIfNeeded();
  ok(await pg.locator('.vb-otro-cel svg[aria-label="Código QR"]').count() === 1, 'QR para pagar desde otro celular');
  {
    const movilViaje = (await pg.evaluate(() => JSON.parse(sessionStorage.getItem('ct.viaje.pasajero') || 'null')?.estado?.conductor?.movil)) || '';
    const breb = (await pg.textContent('.vb-otro-cel .ct-breb')) || '';
    const llave = `@${LLAVE}${String(movilViaje).padStart(3, '0')}`;
    ok(movilViaje && breb.includes(llave), `tarjeta Bre-B del pasajero con la llave ${llave}`);
    ok(breb.includes(`${NOMBRE} · Móvil`), 'tarjeta Bre-B del pasajero con el comercio de la cooperativa');
  }
  // Viaje por pagar tal como lo guarda el núcleo (sirve para probar la separación entre cooperativas).
  VIAJE_POR_PAGAR = await pg.evaluate(() => sessionStorage.getItem('ct.viaje.pasajero'));
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
  for (const t of ['¡Tu taxi va en camino!', 'Tu taxi está llegando', '¡Tu taxi está en la puerta!', 'Viaje iniciado', 'Llegaste a tu destino', 'Pago exitoso (prueba)', `¡Gracias por viajar con ${E.nombre}!`]) {
    ok(avisos.includes(t), `aviso en pantalla: «${t}»`);
  }

  // P12: Mis viajes y demás secciones
  await pg.click('.vb-pestana[data-pantalla="viajes"]');
  await pg.waitForSelector('.vb-viajes .vb-viaje');
  const viaje = await pg.locator('.vb-viajes .vb-viaje').first().textContent();
  ok(viaje.includes(DESTINO.enViajes) && /Finalizado/.test(viaje), 'el viaje aparece en Mis viajes');
  await cerrarAvisos(pg);
  await foto(pg, 'p20-mis-viajes');
  await revisarTexto(pg, 'mis viajes');
  await pg.click('.vb-pestana[data-pantalla="tarifas"]');
  await pg.waitForSelector('.vb-tarifas');
  ok(await pg.locator('.vb-rutas li').count() >= Math.min(10, (FICHA.RUTAS || []).length), 'tabla de rutas visible');
  {
    const filas = await pg.$$eval('.vb-rutas li', (lis) => lis.map((li) => `${li.querySelector('.vb-ruta-nombre b')?.textContent.trim()}=${li.querySelector('.vb-ruta-valor')?.textContent.replace(/\D/g, '')}`));
    const esperadas = (FICHA.RUTAS || []).map((r) => `${r.destino}=${r.valor}`);
    ok(JSON.stringify(filas) === JSON.stringify(esperadas), `tarifas: las rutas y valores son los de la ficha (${filas.length})`);
    const titulos = await pg.$$eval('.vb-tarifas h2', (hs) => hs.map((h) => h.textContent.trim()));
    ok(titulos.includes(`Dentro de ${E.pueblo}`) && titulos.includes(`Rutas desde ${E.pueblo}`), `tarifas: «Dentro de ${E.pueblo}» y «Rutas desde ${E.pueblo}»`);
  }
  await cerrarAvisos(pg);
  await foto(pg, 'p21-tarifas');
  await revisarTexto(pg, 'tarifas');
  await pg.click('.vb-pestana[data-pantalla="perfil"]');
  await pg.waitForSelector('.vb-perfil');
  await cerrarAvisos(pg);
  await foto(pg, 'p22-perfil');
  await revisarTexto(pg, 'perfil');
  {
    const enlace = await pg.$eval('.vb-perfil a.vb-menu-item[data-enlace-conductor]', (a) => a.href);
    ok(llevaA(enlace, 'conductor'), `perfil: «Soy conductor» lleva al conductor de ${NOMBRE} (${new URL(enlace).pathname}${new URL(enlace).search})`);
    const municipio = await pg.$$eval('.vb-perfil [data-cambiar-municipio]', (as) => as.map((a) => a.href));
    if (TAXICUN) ok(municipio.length === 1 && municipio[0] === `${BASE}taxicun/?elegir=1`, `perfil: «Cambiar de municipio» lleva a taxicun/?elegir=1 (${municipio[0] || 'no está'})`);
    else ok(municipio.length === 0, 'perfil: sin «Cambiar de municipio» fuera de TaxiCun');
    ok((await pg.textContent('.vb-perfil .vb-version')).includes(DESARROLLADA), `perfil: «${DESARROLLADA}»`);
  }
  await pg.click('[data-accion="ir"][data-pantalla="ajustes"]');
  await pg.waitForSelector('.vb-ajustes');
  await cerrarAvisos(pg);
  await foto(pg, 'p23-ajustes');
  await pg.evaluate(() => document.querySelector('.vb-ajustes').scrollTo(0, 99999));
  await pg.waitForTimeout(400);
  await foto(pg, 'p23b-ajustes-acerca');
  await revisarTexto(pg, 'ajustes');
  await revisarContraste(pg, 'ajustes');
  const disenoB = (await pg.textContent('.vb-disenos .d-b b')).trim();
  ok(disenoB === (PRINCIPAL ? 'Verde Rosal' : `Color de la ${TIPO}`), `ajustes: el diseño B se llama «${disenoB}»`);
  ok((await pg.textContent('[data-acerca]')).replace(/\s+/g, ' ').includes(DESARROLLADA), `ajustes: «${DESARROLLADA}»`);
  if (PROPUESTA) ok((await pg.textContent('.vb-ajustes .vb-nota-propuesta')).includes(DEMO_PARA), `ajustes: aviso «${DEMO_PARA}»`);
  {
    const municipio = await pg.$$eval('.vb-ajustes [data-cambiar-municipio]', (as) => as.map((a) => [a.href, a.textContent.replace(/\s+/g, ' ').trim()]));
    if (TAXICUN) {
      ok(municipio.length === 1 && municipio[0][0] === `${BASE}taxicun/?elegir=1` && /Cambiar de municipio/.test(municipio[0][1]), `ajustes: «Cambiar de municipio» lleva a taxicun/?elegir=1 (${municipio[0]?.[0] || 'no está'})`);
      ok(await pg.isVisible('.vb-ajustes [data-diseno-cooperativa]'), 'ajustes: dice qué diseño eligió la cooperativa');
      await pg.evaluate(() => document.querySelector('.vb-ajustes').scrollTo(0, 0));
      await pg.waitForTimeout(300);
      await foto(pg, 'p23c-ajustes-municipio');
    } else ok(municipio.length === 0 && await pg.locator('.vb-ajustes [data-diseno-cooperativa]').count() === 0, 'ajustes: sin «Cambiar de municipio» fuera de TaxiCun');
  }
  await pg.click('[data-accion="volver"]');
  await pg.waitForSelector('.vb-perfil');
  await pg.click('[data-accion="ir"][data-pantalla="fidelidad"]');
  await pg.waitForSelector('.vb-tarjeta-fisica');
  ok((await pg.locator('.vb-tarjeta-fisica .vb-sello-viaje.lleno').count()) === 1, 'tarjeta de fidelidad con 1 sello');
  await foto(pg, 'p24-fidelidad');
  await revisarTexto(pg, 'fidelidad');
  await pg.click('[data-accion="volver"]');
  await pg.click('[data-accion="ir"][data-pantalla="ayuda"]');
  await pg.waitForSelector('.vb-ayuda');
  await foto(pg, 'p25-ayuda');
  await revisarTexto(pg, 'ayuda');
  await revisarContraste(pg, 'ayuda');
  if (TEL) ok(await pg.locator(`.vb-ayuda a[href="tel:+57${TEL}"]`).count() === 1, 'ayuda: llamar a la central');
  else ok(await pg.isVisible('.vb-ayuda [data-sin-telefono]') && await pg.locator('.vb-ayuda a[href^="tel:"]').count() === 0, 'ayuda: sin teléfono, «Teléfono de la central: pronto»');
  {
    const WA = String(E.whatsapp || '').replace(/\D/g, '');
    const enlacesWA = await pg.$$eval('.vb-ayuda a[href*="wa.me/"]', (as) => as.map((a) => a.getAttribute('href')));
    ok(WA ? enlacesWA.length === 1 && enlacesWA[0].startsWith(`https://wa.me/${WA}?`) : enlacesWA.length === 0, WA ? `ayuda: WhatsApp de la central (${WA})` : 'ayuda: sin WhatsApp, no hay botón de WhatsApp');
    const correos = await pg.$$eval('.vb-ayuda a[href^="mailto:"]', (as) => as.map((a) => a.getAttribute('href')));
    ok(E.correo ? correos.length === 1 && correos[0] === `mailto:${E.correo}` : correos.length === 0, E.correo ? `ayuda: correo ${E.correo}` : 'ayuda: sin correo, no hay botón de correo');
    const oficina = await pg.textContent('.vb-oficina');
    ok(oficina.includes(E.razonSocial || E.nombre) && (!E.direccion || oficina.includes(E.direccion)), 'ayuda: razón social y dirección de la cooperativa');
  }

  // Tarifa fija de una ruta de la ficha: «Tarifa fija <pueblo> → <destino>».
  {
    const ruta = (FICHA.RUTAS || [])[0];
    await pg.click('[data-accion="volver"]');
    await pg.waitForSelector('.vb-perfil');
    await pg.click('.vb-pestana[data-pantalla="tarifas"]');
    await pg.waitForSelector('.vb-tarifas');
    await pg.click(`.vb-rutas [data-accion="ruta-pedir"][data-id="${ruta.id}"]`);
    await pg.waitForSelector('.vb-paso3');
    await pg.waitForFunction(() => !document.querySelector('[data-tarifa-total] .vb-esqueleto'), null, { timeout: 15000 });
    await pg.click('.vb-paso3 .vb-detalle summary');
    const detalle = await pg.textContent('[data-tarifa-detalle]');
    const concepto = `Tarifa fija ${E.pueblo} → ${ruta.destino}`;
    const valorTexto = `$${Number(ruta.valor).toLocaleString('es-CO')}`;
    ok(detalle.includes(concepto) && detalle.replace(/\s/g, '').includes(valorTexto.replace(/\s/g, '')), `confirmar: «${concepto}» por ${valorTexto}`);
    await pg.evaluate(() => document.querySelector('.vb-detalle')?.scrollIntoView({ block: 'center' }));
    await pg.waitForTimeout(500);
    await foto(pg, 'p25b-tarifa-fija');
    await revisarTexto(pg, 'confirmar con tarifa fija');
  }

  // Separación entre cooperativas en el mismo navegador.
  await probarSeparacionPasajero(ctx);

  // Sin GPS: aviso del centro del pueblo (con la sesión ya registrada)
  const estado = await ctx.storageState();
  const ctxSinGps = await navegador.newContext({ viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2, permissions: [], storageState: estado, locale: 'es-CO' });
  await ctxSinGps.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const sinGps = await ctxSinGps.newPage();
  vigilar(sinGps, 'pasajero-sin-gps');
  await sinGps.goto(URL_APP);
  await sinGps.waitForSelector('.vb-inicio', { timeout: 25000 });
  ok((await sinGps.textContent('.vb-nota-gps')).includes(`Usamos el centro de ${E.pueblo}`), 'aviso cuando no hay GPS');
  await esperarMapa(sinGps, '.vb-pedir-mapa', 1500);
  await foto(sinGps, 'p27-inicio-sin-gps');
  await ctxSinGps.close();

  // Vitrina (la app dentro de un iframe): llena todo, sin marco. Solo en las páginas
  // propias: la vitrina de diseños no usa TaxiCun.
  if (!TAXICUN) {
    const ctxVitrina = await navegador.newContext({ viewport: { width: 430, height: 880 }, geolocation: GEO, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
    await ctxVitrina.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
    const vitrina = await ctxVitrina.newPage();
    vigilar(vitrina, 'pasajero-vitrina');
    await vitrina.goto(`${URL_APP}&vitrina=1`);
    await vitrina.waitForSelector('.vb-inicio', { timeout: 20000 });
    const radio = await vitrina.evaluate(() => getComputedStyle(document.querySelector('.vb-app')).borderTopLeftRadius);
    ok(radio === '0px', 'modo vitrina sin marco de celular');
    await ctxVitrina.close();
  }

  // Inicio en computador (1280×800)
  const ctxPC = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: GEO, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
  await ctxPC.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const pc = await ctxPC.newPage();
  vigilar(pc, 'pasajero-pc');
  await pc.goto(URL_APP);
  await pc.waitForSelector('.vb-inicio', { timeout: 20000 });
  await esperarMapa(pc, '.vb-pedir-mapa', 3000);
  await foto(pc, 'p26-inicio-1280x800');
  await revisarTexto(pc, 'inicio en computador');
  const qrPasajero = await pc.getAttribute('.vb-lado-qr', 'data-enlace-qr');
  ok(llevaA(qrPasajero, 'pasajero') && !/vitrina/.test(qrPasajero), `QR del panel lateral con la URL de la cooperativa (${qrPasajero})`);
  ok((await pc.textContent('.vb-lado-pie')).includes(DESARROLLADA), `panel lateral: «${DESARROLLADA}»`);
  if (TAXICUN) ok(await pc.isVisible('.vb-lado [data-taxicun]'), 'panel lateral: «TaxiCun · …» arriba');
  await ctxPC.close();

  // «Cambiar de municipio» (solo TaxiCun): lleva a la lista de municipios y, al
  // escoger de nuevo la cooperativa, vuelve a su app con la sesión.
  if (TAXICUN) {
    const pm = await ctx.newPage();
    vigilar(pm, 'cambiar-municipio');
    await pm.goto(URL_APP);
    await pm.waitForSelector('.vb-inicio', { timeout: 30000 });
    await pm.click('.vb-pestana[data-pantalla="perfil"]');
    await pm.waitForSelector('.vb-perfil');
    await Promise.all([pm.waitForURL(/\/taxicun\/\?elegir=1$/, { timeout: 15000 }), pm.click('.vb-perfil [data-cambiar-municipio]')]);
    await pm.waitForSelector('#elegir:not([hidden]) .tc-lista [data-id]', { timeout: 20000 });
    // La pantalla de carga de TaxiCun se desvanece (0,4 s) antes de la captura.
    await pm.waitForTimeout(700);
    ok(await pm.locator(`#elegir [data-id="${ID}"]`).count() === 1, `«Cambiar de municipio» abre la lista de municipios de TaxiCun (${new URL(pm.url()).pathname}${new URL(pm.url()).search})`);
    await foto(pm, 'p28-cambiar-municipio');
    await pm.click(`#elegir [data-id="${ID}"]`);
    await pm.waitForSelector('.vb-inicio', { timeout: 30000 });
    ok(await pm.evaluate(() => window.CT_EMPRESA) === ID && new URL(pm.url()).searchParams.get('e') === ID, `al escoger ${E.pueblo} vuelve a la app de ${NOMBRE} con la sesión`);
    await pm.close();
  }
  await ctx.close();
}

/* ================================================================== */
/* CONDUCTOR                                                           */
/* ================================================================== */
async function probarConductor(navegador) {
  const ctx = await nuevoContexto(navegador);
  const pg = await ctx.newPage();
  vigilar(pg, 'conductor');
  await pg.goto(URL_CONDUCTOR);

  // C1: ingreso
  await pg.waitForSelector('.vb-ingreso', { timeout: 20000 });
  ok((await pg.textContent('.vb-pista')).includes(MOVIL_DEMO), `pista de la demo visible (móvil ${MOVIL_DEMO})`);
  await pg.waitForSelector('.vb-ingreso-cab .vb-foto.lista', { timeout: 10000 }).catch(() => {});
  ok(await pg.locator('.vb-ingreso-cab .vb-foto.lista').count() === 1, 'foto del conductor cargada (ruta relativa)');
  await pg.waitForTimeout(400);
  await foto(pg, 'c01-ingreso');
  ok((await pg.textContent('.vb-ingreso-marca b')).trim() === NOMBRE, `ingreso con el nombre de la cooperativa (${NOMBRE})`);
  {
    const franja = await pg.evaluate(() => {
      const el = document.querySelector('.vb-ingreso .vb-nota-propuesta');
      const r = el?.getBoundingClientRect();
      return el && r.top >= 0 && r.bottom <= innerHeight ? el.textContent.trim() : '';
    });
    ok(PROPUESTA ? franja.includes(DEMO_PARA) && !/interOS/.test(franja) : franja === '', PROPUESTA ? `ingreso del conductor: franja «${DEMO_PARA}» visible sin desplazar` : 'ingreso del conductor: sin franja de propuesta (es cliente)');
  }
  await revisarMarcaTaxiCun(pg, '.vb-ingreso [data-taxicun]', 'ingreso del conductor');
  {
    const href = await pg.getAttribute('.vb-ingreso [data-enlace-pasajero]', 'href');
    ok(llevaA(href, 'pasajero'), `ingreso: «¿Eres pasajero?» lleva a ${TAXICUN ? `taxicun/?e=${ID}` : `${PRE}app/`} (${href})`);
  }
  await revisarTexto(pg, 'ingreso del conductor');
  await revisarContraste(pg, 'ingreso del conductor');
  await pg.fill('input[name="movil"]', String(Number(MOVIL_DEMO)));
  await pg.fill('#vb-pin', '1234');
  await pg.click('form[data-form="ingreso"] button[type="submit"]');

  // C2: inicio
  await pg.waitForSelector('.vb-c-servicios', { timeout: 10000 });
  await esperarMapa(pg, '.vb-c-mapa', 2000);
  await cerrarAvisos(pg);
  await foto(pg, 'c02-inicio-desconectado');
  await revisarTexto(pg, 'inicio del conductor');
  await revisarContraste(pg, 'inicio del conductor');
  await pg.click('[data-accion="conectar"]');
  await pg.waitForSelector('[data-accion="desconectar"]');
  await pg.waitForTimeout(500);
  await foto(pg, 'c03-en-linea');
  await pg.click('[data-accion="simular-solicitud"]');

  // C3: solicitud entrante
  await pg.waitForSelector('.vb-solicitud', { timeout: 45000 });
  await pg.waitForTimeout(1200);
  await foto(pg, 'c04-solicitud');
  await revisarTexto(pg, 'solicitud');
  await fotoChica(pg, 'c04-solicitud-360x740');
  await pg.click('.vb-solicitud [data-accion="aceptar"]');

  // C4: hacia el pasajero
  await pg.waitForSelector('.vb-c-viaje.fase-hacia_origen', { timeout: 15000 });
  await esperarMapa(pg, '.vb-c-mapa', 2000);
  await foto(pg, 'c05-hacia-pasajero');
  await revisarTexto(pg, 'hacia el pasajero');
  await revisarContraste(pg, 'hacia el pasajero');
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
  await revisarTexto(pg, 'cobro QR Bre-B (conductor)');
  await revisarContraste(pg, 'cobro QR Bre-B (conductor)');
  ok((await pg.textContent('.vb-c-qr-pie')).includes(NOMBRE), 'pie del QR de cobro con el nombre de la cooperativa');
  {
    const breb = (await pg.textContent('.vb-c-cobro .ct-breb')) || '';
    const llave = `@${LLAVE}${MOVIL_DEMO}`;
    ok(breb.includes(llave) && breb.includes(`${NOMBRE} · Móvil ${MOVIL_DEMO}`), `cobro Bre-B del conductor con la llave ${llave} y el comercio`);
  }
  if (PROPUESTA) ok((await pg.textContent('.vb-c-cobro-cab')).includes(DEMO_PARA), `cobro: «${DEMO_PARA}» junto a «Modo prueba»`);
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
  await revisarTexto(pg, 'ganancias');
  await pg.click('.vb-pestana[data-pantalla="documentos"]');
  await pg.waitForSelector('.vb-c-documentos');
  ok(await pg.locator('.vb-documento').count() === 4, 'documentos del vehículo con semáforo');
  await cerrarAvisos(pg);
  await foto(pg, 'c14-documentos');
  await revisarTexto(pg, 'documentos');
  await pg.click('.vb-pestana[data-pantalla="perfil"]');
  await pg.waitForSelector('.vb-c-perfil');
  await cerrarAvisos(pg);
  await foto(pg, 'c15-perfil');
  await pg.evaluate(() => document.querySelector('.vb-c-perfil').scrollTo(0, 99999));
  await pg.waitForTimeout(400);
  await foto(pg, 'c15b-perfil-acerca');
  await revisarTexto(pg, 'perfil del conductor (ajustes)');
  await revisarContraste(pg, 'perfil del conductor (ajustes)');
  ok((await pg.textContent('.vb-c-perfil .vb-disenos .d-b b')).trim() === (PRINCIPAL ? 'Verde Rosal' : `Color de la ${TIPO}`), 'conductor: nombre del diseño B según la cooperativa');
  ok((await pg.textContent('.vb-c-perfil [data-acerca]')).replace(/\s+/g, ' ').includes(DESARROLLADA), `conductor: «${DESARROLLADA}»`);
  {
    const pasajero = await pg.getAttribute('.vb-c-perfil [data-enlace-pasajero]', 'href');
    ok(llevaA(pasajero, 'pasajero'), `conductor: «App del pasajero» lleva a la de ${NOMBRE} (${pasajero})`);
    const municipio = await pg.$$eval('.vb-c-perfil [data-cambiar-municipio]', (as) => as.map((a) => a.href));
    if (TAXICUN) {
      ok(municipio.length === 1 && municipio[0] === `${BASE}taxicun/conductor/?elegir=1`, `conductor: «Cambiar de municipio» lleva a taxicun/conductor/?elegir=1 (${municipio[0] || 'no está'})`);
      await pg.locator('.vb-c-perfil [data-cambiar-municipio]').scrollIntoViewIfNeeded();
      await pg.waitForTimeout(300);
      await foto(pg, 'c15c-perfil-municipio');
    } else ok(municipio.length === 0, 'conductor: sin «Cambiar de municipio» fuera de TaxiCun');
  }
  if (TEL) ok(await pg.locator(`.vb-c-perfil a[href="tel:+57${TEL}"]`).count() === 1, 'conductor: llamar a la central');
  else ok(await pg.isVisible('.vb-c-perfil [data-sin-telefono]'), 'conductor: sin teléfono, «Teléfono de la central: pronto»');

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

  // Separación entre cooperativas: la sesión del conductor no pasa a otra.
  await probarSeparacionConductor(ctx);

  // Inicio del conductor en computador (1280×800)
  const estado = await ctx.storageState();
  const ctxPC = await navegador.newContext({ viewport: { width: 1280, height: 800 }, geolocation: GEO, permissions: ['geolocation'], storageState: estado, locale: 'es-CO' });
  await ctxPC.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const pc = await ctxPC.newPage();
  vigilar(pc, 'conductor-pc');
  await pc.goto(URL_CONDUCTOR);
  await pc.waitForSelector('.vb-c-servicios', { timeout: 20000 });
  await esperarMapa(pc, '.vb-c-mapa', 2500);
  await foto(pc, 'c17-inicio-1280x800');
  await revisarTexto(pc, 'conductor en computador');
  const qrConductor = await pc.getAttribute('.vb-lado-qr', 'data-enlace-qr');
  ok(llevaA(qrConductor, 'conductor'), `QR del panel lateral del conductor con la URL de la cooperativa (${qrConductor})`);
  await ctxPC.close();

  // «Cambiar de municipio» del conductor (solo TaxiCun): lista de municipios para conductores.
  if (TAXICUN) {
    const pm = await ctx.newPage();
    vigilar(pm, 'conductor-cambiar-municipio');
    await pm.goto(URL_CONDUCTOR);
    await pm.waitForSelector('.vb-c-servicios', { timeout: 30000 });
    await pm.click('.vb-pestana[data-pantalla="perfil"]');
    await pm.waitForSelector('.vb-c-perfil');
    await Promise.all([pm.waitForURL(/\/taxicun\/conductor\/\?elegir=1$/, { timeout: 15000 }), pm.click('.vb-c-perfil [data-cambiar-municipio]')]);
    await pm.waitForSelector('#elegir:not([hidden]) .tc-lista [data-id]', { timeout: 20000 });
    await pm.waitForTimeout(700);
    ok(/conductor/i.test(await pm.textContent('#elegir .tc-rol')), 'conductor: «Cambiar de municipio» abre la lista de municipios de TaxiCun para conductores');
    await foto(pm, 'c18-cambiar-municipio');
    await pm.close();
  }
  await ctx.close();
}

/* ================================================================== */
console.log(`Diseño B${TAXICUN ? ' dentro de TaxiCun' : ''} · ${NOMBRE} (${ID}, ${FICHA.estado}) · ${URL_APP}`);
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
