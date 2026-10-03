// Enlaces seguros y CSP de taxicun.com (requisito S30 del diseño del panel, fase 1 en la web).
//
// 1) Fichas: todas las de empresas/ pasan los filtros de nucleo/enlaces.js (página oficial
//    en la lista, correo, teléfonos, fuente *.gov.co y carpeta), así nada visible cambia.
// 2) Ficha envenenada (lo que llegaría si un gerente publicara basura y la validación del
//    servidor fallara): javascript:, data:, otro dominio, HTML y comillas en campos de enlace
//    y de texto. En los diseños A, B y C (pasajero y conductor), la raíz TaxiCun (también la
//    lista de municipios con un índice envenenado), la web de la cooperativa y el pago:
//    ningún diálogo ni script inyectado corre, ningún enlace pintado sale de lo permitido
//    (https: de la lista, el mismo sitio, tel: y mailto: limpios), no se pinta «Ver el
//    decreto» y ninguna petición sale a un dominio fuera de la lista.
// 3) Ficha real: el enlace al decreto (*.gov.co) y la página oficial siguen ahí.
// 4) CSP: todas las páginas se sirven con la política propuesta para nginx (modo informe,
//    con el nonce que pondría sub_filter) y no hay ni una violación; una carga de cada tipo
//    fuera de la lista sí la produce. La barrera de clics frena un enlace javascript:.
//
// Uso: node pruebas/enlaces-seguros.mjs [url_base]   (servidor estático del repo; por
//      defecto http://localhost:8765/). La política sale de $CSP_CONF (por defecto
//      /tmp/cootrans/panel/wt/web-csp/taxicun-csp.conf); sin ese archivo se salta la parte 4.
//      Capturas en $CAPTURAS (por defecto /tmp/cootrans/capturas/enlaces-seguros/).
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlSegura, urlDecreto, enlaceTel, enlaceCorreo } from '../nucleo/enlaces.js';

const RAIZ_REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8765/').replace(/\/?$/, '/');
const ORIGEN = new URL(BASE).origin;
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/enlaces-seguros').replace(/\/?$/, '/');
const CSP_CONF = process.env.CSP_CONF || '/tmp/cootrans/panel/wt/web-csp/taxicun-csp.conf';
mkdirSync(DIR, { recursive: true });
const inicio = Date.now();

let bien = 0;
let fallas = 0;
function ok(condicion, mensaje) {
  if (condicion) bien++;
  else {
    fallas++;
    process.exitCode = 1;
  }
  console.log(`${condicion ? '✔' : '✘'} ${mensaje}`);
}

/* ============ 1) Todas las fichas pasan los filtros ============ */
{
  const ids = readdirSync(join(RAIZ_REPO, 'empresas'), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(RAIZ_REPO, 'empresas', d.name, 'ficha.json'))).map((d) => d.name);
  const malos = { sitio: [], correo: [], telefono: [], fuente: [], carpeta: [] };
  let sitios = 0;
  let fuentes = 0;
  for (const id of ids) {
    const f = JSON.parse(readFileSync(join(RAIZ_REPO, 'empresas', id, 'ficha.json'), 'utf8'));
    const E = f.EMPRESA || {};
    const sitio = E.sitioOficial || E.web;
    if (sitio) {
      sitios++;
      if (!urlSegura(sitio)) malos.sitio.push(`${id}: ${sitio}`);
    }
    if (E.correo && !enlaceCorreo(E.correo)) malos.correo.push(`${id}: ${E.correo}`);
    for (const k of ['telefono', 'whatsapp']) {
      const d = String(E[k] || '').replace(/\D/g, '');
      if (d && !enlaceTel(d)) malos.telefono.push(`${id}.${k}: ${E[k]}`);
    }
    for (const k of ['url', 'pdf']) {
      const u = f.TARIFAS?.fuente?.[k];
      if (u) {
        fuentes++;
        if (!urlDecreto(u)) malos.fuente.push(`${id}.${k}: ${u}`);
      }
    }
    if (f.carpeta && !/^[a-z0-9][a-z0-9-]{0,59}$/.test(f.carpeta)) malos.carpeta.push(`${id}: ${f.carpeta}`);
    if (!/^[a-z0-9-]{1,40}$/.test(f.id || '')) malos.carpeta.push(`${id}: id «${f.id}»`);
  }
  ok(!malos.sitio.length, `las ${sitios} páginas oficiales de las fichas son https: de la lista revisada (nucleo/enlaces.js)${malos.sitio.length ? ': ' + malos.sitio.join(' · ') : ''}`);
  ok(!malos.correo.length && !malos.telefono.length, `correos y teléfonos de las ${ids.length} fichas pasan enlaceCorreo/enlaceTel${[...malos.correo, ...malos.telefono].length ? ': ' + [...malos.correo, ...malos.telefono].join(' · ') : ''}`);
  ok(fuentes > 0 && !malos.fuente.length, `las ${fuentes} fuentes oficiales de tarifas son https: de *.gov.co${malos.fuente.length ? ': ' + malos.fuente.join(' · ') : ''}`);
  ok(!malos.carpeta.length, `ids y carpetas de las fichas son nombres simples${malos.carpeta.length ? ': ' + malos.carpeta.join(' · ') : ''}`);
}

/* ============ Fichas de la prueba ============ */
const FICHA = JSON.parse(readFileSync(join(RAIZ_REPO, 'empresas/cootransrural/ficha.json'), 'utf8'));
const INDICE = JSON.parse(readFileSync(join(RAIZ_REPO, 'empresas/indice.json'), 'utf8'));
const xss = (n) => `<img src=x onerror="window.__xss=${n}">`;
const comillas = (n) => `" onmouseover="window.__xss=${n}" x="`;

function fichaEnvenenada({ conKm = false } = {}) {
  const f = structuredClone(FICHA);
  f.carpeta = 'javascript:window.__xss=1//';
  Object.assign(f.EMPRESA, {
    nombre: `Cootransrural ${xss(2)}`,
    nombreCorto: `Cootransrural ${comillas(3)}`,
    lema: xss(4),
    direccion: `Calle 1 ${xss(5)}`,
    telefonoVisible: comillas(6),
    sitioOficial: 'javascript:window.__xss=7',
    web: 'https://evil.example/web',
    correo: 'gerencia@cootransrural.com?body=hola', // con «?»: no es un correo sencillo
  });
  f.TARIFAS = {
    ...f.TARIFAS,
    notaRecargos: xss(8),
    nota: xss(9),
    fuente: { ...f.TARIFAS.fuente, url: ' JaVaScRiPt:window.__xss=10', pdf: 'data:text/html,<script>window.__xss=11</script>', acto: `Decreto ${xss(12)}`, entidad: `Alcaldía ${comillas(13)}` },
  };
  f.imagenes = { ...(f.imagenes || {}), hero: 'javascript:window.__xss=14' };
  f.RUTAS = f.RUTAS.map((r, i) => (i ? r : { ...r, destino: xss(15), id: `"><img src=x onerror="window.__xss=16">`, ...(conKm ? { km: xss(17) } : {}) }));
  f.LUGARES = f.LUGARES.map((l, i) => (i ? l : { ...l, nombre: xss(18) }));
  f.DESTINOS_TARIFA = f.DESTINOS_TARIFA.map((d, i) => (i ? d : { ...d, destino: xss(19) }));
  if (f.PARADERO) f.PARADERO = { ...f.PARADERO, nombre: `Paradero ${xss(20)}` };
  return f;
}

function indiceEnvenenado() {
  const i = structuredClone(INDICE);
  i.cooperativas = i.cooperativas.map((c) => (c.id !== 'cootransrural' ? c : {
    ...c, icono: 'javascript:window.__xss=30', color: 'red;background-image:url(https://evil.example/c.png)', nombre: xss(31), pueblo: `El Rosal ${comillas(32)}`,
  }));
  return i;
}

/* ============ Política de CSP (la del archivo para nginx) ============ */
let POLITICA = '';
if (existsSync(CSP_CONF)) {
  const m = /add_header\s+Content-Security-Policy-Report-Only\s+"([^"]+)"/.exec(readFileSync(CSP_CONF, 'utf8'));
  POLITICA = m ? m[1] : '';
  // En la prueba no se mandan informes a ningún lado: basta el evento securitypolicyviolation.
  POLITICA = POLITICA.replace(/;\s*report-uri [^;]+/, '').replace(/;\s*report-to [^;]+/, '');
}
const CON_CSP = Boolean(POLITICA);
if (!CON_CSP) console.log(`⚠ No se encontró la política en ${CSP_CONF}: se salta la parte de la CSP.`);
else console.log(`CSP (modo informe) de ${CSP_CONF}`);

// Orígenes a los que la web puede pedir algo (los de la CSP y el sitio mismo).
const HOSTS_PERMITIDOS = [
  new URL(BASE).host, 'api.mapbox.com', 'tile.openstreetmap.org', 'a.tile.openstreetmap.fr', 'b.tile.openstreetmap.fr', 'c.tile.openstreetmap.fr',
  'nominatim.openstreetmap.org', 'router.project-osrm.org', 'test.mosquitto.org:8081', 'broker.emqx.io:8084', 'broker.hivemq.com:8884',
];

// Atribuciones fijas de los mapas (nucleo/mapa.js y disenos/b/comun.js), no datos de la ficha.
const ATRIBUCIONES = ['leafletjs.com', 'www.openstreetmap.org', 'www.mapbox.com', 'www.hotosm.org'];

/* ============ Navegador ============ */
const navegador = await chromium.launch({ executablePath: EXE });

async function nuevoContexto({ ficha = null, indice = null, mapbox = false } = {}) {
  const ctx = await navegador.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
    geolocation: { latitude: 4.8531, longitude: -74.2611 }, permissions: ['geolocation'],
    serviceWorkers: 'block', // las rutas de abajo no ven lo que pasa por un service worker
  });
  ctx.peticiones = [];
  ctx.on('request', (r) => ctx.peticiones.push(r.url()));
  await ctx.addInitScript(({ mapbox: conMapbox }) => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push({ directiva: e.effectiveDirective || e.violatedDirective, bloqueado: String(e.blockedURI || '').slice(0, 80), archivo: String(e.sourceFile || '').split('?')[0].split('/').slice(-2).join('/'), linea: e.lineNumber, muestra: String(e.sample || '').slice(0, 60) });
    });
    try {
      localStorage.setItem('ct.pasajero', JSON.stringify({ id: 'p-prueba-enlaces', nombre: 'Ana Prueba', celular: '3001234567', creado: Date.now(), calificacion: 5 }));
      localStorage.setItem('ct.sala', JSON.stringify('prueba-enlaces'));
      if (conMapbox) localStorage.setItem('taxicun.mapbox', '1');
    } catch {}
  }, { mapbox });
  // Como nginx: cada página sale con la CSP y un nonce nuevo en cada <script.
  if (CON_CSP) {
    await ctx.route((u) => u.origin === ORIGEN, async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback();
      const resp = await route.fetch();
      if (!(resp.headers()['content-type'] || '').includes('text/html')) return route.fulfill({ response: resp });
      const nonce = randomBytes(16).toString('hex');
      const cuerpo = (await resp.text()).replaceAll('<script', `<script nonce="${nonce}"`);
      return route.fulfill({ response: resp, body: cuerpo, headers: { ...resp.headers(), 'content-security-policy-report-only': POLITICA.replaceAll('$request_id', nonce) } });
    });
  }
  // Las teselas y los servicios de afuera no hacen falta (y en la máquina de pruebas puede no
  // haber internet): se contestan vacíos DESPUÉS de que la CSP ya los revisó.
  await ctx.route((u) => u.origin !== ORIGEN && /^https?:$/.test(u.protocol), (route) => route.fulfill({ status: 204, body: '' }));
  if (ficha) await ctx.route(/\/empresas\/cootransrural\/ficha\.json(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ficha) }));
  if (indice) await ctx.route(/\/empresas\/indice\.json(\?.*)?$/, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(indice) }));
  return ctx;
}

async function abrir(ctx, ruta, { esperar = '#carga', estado = 'detached' } = {}) {
  const p = await ctx.newPage();
  p.dialogos = [];
  p.errores = [];
  p.on('dialog', (d) => {
    p.dialogos.push(d.message());
    d.dismiss().catch(() => {});
  });
  p.on('pageerror', (e) => p.errores.push(e.message));
  await p.goto(BASE + ruta, { waitUntil: 'load' });
  if (esperar) await p.waitForSelector(esperar, { state: estado, timeout: 25000 }).catch(() => {});
  await p.waitForTimeout(1200);
  return p;
}

// Revisa la página tal como está: enlaces, imágenes, scripts inyectados y violaciones de CSP.
async function revisar(p, etiqueta, { decreto = 'ninguno', esperaCsp = true } = {}) {
  await p.waitForTimeout(400);
  const r = await p.evaluate(async () => {
    const marcos = [...document.querySelectorAll('iframe')].map((f) => { try { return f.contentWindow?.document ? f.contentWindow : null; } catch { return null; } }).filter(Boolean);
    const docs = [document, ...marcos.map((w) => w.document)];
    const enlaces = [];
    const imagenes = [];
    let inyectadas = 0;
    for (const d of docs) {
      for (const a of d.querySelectorAll('a[href], area[href]')) enlaces.push({ crudo: a.getAttribute('href'), url: new URL(a.getAttribute('href'), d.baseURI).href });
      for (const i of d.querySelectorAll('img[src]')) imagenes.push(new URL(i.getAttribute('src'), d.baseURI).href);
      inyectadas += d.querySelectorAll('img[src="x"], [onmouseover], [onerror]').length;
    }
    const decretos = [...document.querySelectorAll('[data-enlace-decreto]')].map((a) => a.href);
    // El HTML tal como lo manda el servidor (de git): sus enlaces fijos no son datos de la ficha.
    const crudos = await Promise.all(docs.map((d) => fetch(d.location.href).then((x) => x.text()).catch(() => '')));
    const xssMarcos = marcos.map((w) => w.__xss).find((v) => v != null);
    return {
      enlaces, imagenes, inyectadas, decretos, estatico: crudos.join('\n').replaceAll('&amp;', '&'),
      xss: window.__xss ?? xssMarcos ?? null, csp: [...(window.__csp || []), ...marcos.flatMap((w) => w.__csp || [])],
    };
  });
  // Nunca, ni en el HTML fijo: esquemas que ejecutan código ni lo que trae la ficha envenenada.
  // (El nombre envenenado puede ir codificado en el ?text= de WhatsApp: eso es texto, no código.)
  const peligroso = ({ url }) => !/^(https?|tel|mailto):/i.test(url) || /^https?:$/.test(new URL(url).protocol) && /evil\.example/.test(new URL(url).host);
  // Lo que se arma en la página debe pasar los filtros de nucleo/enlaces.js (o ser una de las
  // atribuciones fijas de los mapas); lo que ya viene en el HTML del servidor salió de git.
  const permitido = ({ crudo, url }) => {
    const u = new URL(url);
    if (u.origin === ORIGEN) return true;
    if (u.protocol === 'tel:') return /^tel:\+?\d{3,15}$/.test(url);
    if (u.protocol === 'mailto:' && enlaceCorreo(url.slice(7))) return true;
    if (u.protocol === 'https:' && (urlSegura(url) || ATRIBUCIONES.includes(u.host))) return true;
    return r.estatico.includes(`href="${crudo}"`);
  };
  const enlacesMalos = r.enlaces.filter((e) => peligroso(e) || !permitido(e)).map((e) => e.url);
  const imagenesMalas = r.imagenes.filter((u) => !(u.startsWith('data:image/') || u.startsWith(`blob:${ORIGEN}/`) || new URL(u).origin === ORIGEN || HOSTS_PERMITIDOS.includes(new URL(u).host)));
  ok(r.xss === null && !p.dialogos.length && !r.inyectadas, `${etiqueta}: ningún script ni HTML inyectado corre (xss=${r.xss}, diálogos=${p.dialogos.length}, nodos inyectados=${r.inyectadas})`);
  ok(!enlacesMalos.length && !imagenesMalas.length, `${etiqueta}: ${r.enlaces.length} enlaces y ${r.imagenes.length} imágenes, todos permitidos${enlacesMalos.length || imagenesMalas.length ? ': ' + [...enlacesMalos, ...imagenesMalas].slice(0, 6).join(' · ') : ''}`);
  if (decreto === 'ninguno') ok(!r.decretos.length, `${etiqueta}: sin «Ver el decreto» (la fuente no es *.gov.co)`);
  else if (decreto) ok(r.decretos.length > 0 && r.decretos.every((u) => u === decreto), `${etiqueta}: «Ver el decreto» lleva a la fuente oficial (${r.decretos[0] || 'no está'})`);
  if (CON_CSP && esperaCsp) ok(!r.csp.length, `${etiqueta}: 0 violaciones de la CSP${r.csp.length ? ': ' + JSON.stringify(r.csp.slice(0, 4)) : ''}`);
  return r;
}

function revisarPeticiones(ctx, etiqueta) {
  const fuera = [...new Set(ctx.peticiones.map((u) => new URL(u)).filter((u) => /^(https?|wss?):$/.test(u.protocol) && !HOSTS_PERMITIDOS.includes(u.host)).map((u) => u.host))];
  ok(!fuera.length, `${etiqueta}: ninguna petición sale a un dominio fuera de la lista${fuera.length ? ': ' + fuera.join(', ') : ''} (${ctx.peticiones.length} peticiones)`);
}

const foto = (p, nombre) => p.screenshot({ path: `${DIR}${nombre}.png` }).catch(() => {});
async function paso(etiqueta, fn) {
  try {
    await fn();
  } catch (e) {
    ok(false, `${etiqueta}: la prueba se cortó: ${String(e.message).split('\n')[0]}`);
  }
}

// Recorre las pantallas con enlaces de cada diseño: tarifas (decreto), ayuda (contacto,
// página oficial), ajustes y perfil (privacidad, la otra app).
async function recorrerDiseno(ctx, d, { decreto, real }) {
  const quien = `${real ? 'ficha real' : 'ficha envenenada'} · diseño ${d.toUpperCase()}`;
  const p = await abrir(ctx, `el-rosal/app/?d=${d}`);
  await revisar(p, `${quien} · inicio`, { decreto: null });
  if (d === 'a') {
    const menu = async (texto) => {
      await p.click('[data-menu]');
      await p.waitForTimeout(500);
      await p.locator('.a-menu-item', { hasText: texto }).first().click();
      await p.waitForSelector('.a-panel.a-abierto', { timeout: 8000 });
      await p.waitForTimeout(500);
    };
    const cerrar = async () => {
      await p.keyboard.press('Escape');
      await p.waitForTimeout(500);
    };
    await paso(`${quien} · tarifas`, async () => {
      await menu('Tarifas y rutas');
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-tarifas`);
      await revisar(p, `${quien} · tarifas`, { decreto });
      await cerrar();
    });
    await paso(`${quien} · ayuda`, async () => {
      await menu('Ayuda');
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-ayuda`);
      await revisar(p, `${quien} · ayuda`, { decreto: null });
      await cerrar();
    });
    await paso(`${quien} · ajustes`, async () => {
      await menu('Ajustes');
      await revisar(p, `${quien} · ajustes`, { decreto: null });
      await cerrar();
    });
    await paso(`${quien} · menú`, async () => {
      await p.click('[data-menu]');
      await p.waitForTimeout(600);
      await revisar(p, `${quien} · menú`, { decreto: null });
    });
  }
  if (d === 'b') {
    await paso(`${quien} · tarifas`, async () => {
      await p.click('.vb-pestana[data-pantalla="tarifas"]');
      await p.waitForSelector('.vb-tarifas', { timeout: 8000 });
      await p.waitForTimeout(500);
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-tarifas`);
      await revisar(p, `${quien} · tarifas`, { decreto });
    });
    await paso(`${quien} · perfil y ayuda`, async () => {
      await p.click('.vb-pestana[data-pantalla="perfil"]');
      await p.waitForTimeout(700);
      await revisar(p, `${quien} · perfil`, { decreto: null });
      await p.locator('[data-accion="ir"][data-pantalla="ayuda"]').first().click();
      await p.waitForTimeout(800);
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-ayuda`);
      await revisar(p, `${quien} · ayuda`, { decreto: null });
    });
  }
  if (d === 'c') {
    const sub = async (cual, selector) => {
      await p.click('.c-nav [data-tab="perfil"]');
      await p.waitForSelector('.c-pantalla-perfil', { timeout: 8000 });
      await p.waitForTimeout(400);
      await p.click(`[data-sub="${cual}"]`);
      await p.waitForSelector(selector, { timeout: 8000 });
      await p.waitForTimeout(500);
    };
    await paso(`${quien} · perfil`, async () => {
      await p.click('.c-nav [data-tab="perfil"]');
      await p.waitForSelector('.c-pantalla-perfil', { timeout: 8000 });
      await p.waitForTimeout(400);
      await revisar(p, `${quien} · perfil`, { decreto: null });
    });
    await paso(`${quien} · tarifas`, async () => {
      await sub('tarifas', '.c-pantalla-tarifas');
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-tarifas`);
      await revisar(p, `${quien} · tarifas`, { decreto });
    });
    await paso(`${quien} · ayuda`, async () => {
      await sub('ayuda', '.c-pantalla-ayuda');
      await foto(p, `${real ? 'real' : 'veneno'}-${d}-ayuda`);
      const r = await revisar(p, `${quien} · ayuda`, { decreto: null });
      const oficial = FICHA.EMPRESA.sitioOficial;
      if (real) ok(r.enlaces.some(({ url }) => url.replace(/\/$/, '') === oficial.replace(/\/$/, '')), `${quien} · ayuda: sigue el enlace a la página oficial (${oficial})`);
      else ok(!r.enlaces.some(({ url }) => /evil\.example|javascript:/i.test(url)), `${quien} · ayuda: sin enlace a una «página oficial» envenenada`);
    });
  }
  ok(!p.errores.length, `${quien}: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.slice(0, 3).join(' | ') : ''}`);
  await p.close();
  // La app del conductor (ingreso): privacidad, la otra app y la central.
  const c = await abrir(ctx, `el-rosal/conductor/?d=${d}`);
  await revisar(c, `${quien} · conductor (ingreso)`, { decreto: null });
  ok(!c.errores.length, `${quien} · conductor: sin errores de JavaScript${c.errores.length ? ': ' + c.errores.slice(0, 3).join(' | ') : ''}`);
  await c.close();
}

/* ============ 2) Ficha envenenada ============ */
for (const d of ['a', 'b', 'c']) {
  const ctx = await nuevoContexto({ ficha: fichaEnvenenada() });
  await recorrerDiseno(ctx, d, { decreto: 'ninguno', real: false });
  revisarPeticiones(ctx, `ficha envenenada · diseño ${d.toUpperCase()}`);
  await ctx.close();
}

// Raíz TaxiCun con la cooperativa (diseño A) y la lista de municipios con un índice envenenado.
{
  const ctx = await nuevoContexto({ ficha: fichaEnvenenada(), indice: indiceEnvenenado() });
  await paso('ficha envenenada · TaxiCun', async () => {
    const p = await abrir(ctx, 'taxicun/?e=cootransrural&d=a');
    await revisar(p, 'ficha envenenada · TaxiCun (pasajero, diseño A)', { decreto: null });
    await p.click('[data-menu]');
    await p.waitForTimeout(500);
    await p.locator('.a-menu-item', { hasText: 'Tarifas y rutas' }).first().click();
    await p.waitForSelector('.a-panel.a-abierto', { timeout: 8000 });
    await revisar(p, 'ficha envenenada · TaxiCun · tarifas', { decreto: 'ninguno' });
    ok(!p.errores.length, `ficha envenenada · TaxiCun: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.slice(0, 3).join(' | ') : ''}`);
    await p.close();
    const l = await abrir(ctx, 'taxicun/?elegir=1', { esperar: '#elegir:not([hidden]) [data-id]', estado: 'visible' });
    await foto(l, 'veneno-taxicun-lista');
    const r = await revisar(l, 'índice envenenado · TaxiCun · lista de municipios', { decreto: null });
    const estilo = await l.getAttribute('#elegir [data-id="cootransrural"]', 'style');
    ok(/^--c:#0A5C33$/i.test(estilo || ''), `índice envenenado: el color de la cooperativa no mete CSS («${estilo}»)`);
    ok(r.imagenes.every((u) => new URL(u).origin === ORIGEN), 'índice envenenado: los íconos de la lista son del mismo sitio');
    await l.close();
  });
  revisarPeticiones(ctx, 'ficha e índice envenenados · TaxiCun');
  await ctx.close();
}

// Web de la cooperativa (tabla de rutas, cotizador, QR) y página de pago.
{
  const ctx = await nuevoContexto({ ficha: fichaEnvenenada({ conKm: true }) });
  await paso('ficha envenenada · web', async () => {
    const p = await abrir(ctx, 'el-rosal/', { esperar: null });
    await p.waitForFunction(() => window.ctSitioListo, null, { timeout: 15000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('#tarifas, #tabla-rutas')?.scrollIntoView());
    await p.waitForTimeout(1500);
    await foto(p, 'veneno-web-tarifas');
    await revisar(p, 'ficha envenenada · web de la cooperativa', { decreto: null });
    const opciones = await p.$$eval('#cotizar-destino option', (os) => os.map((o) => o.value));
    ok(opciones.includes('"><img src=x onerror="window.__xss=16">'), 'ficha envenenada · web: el id raro de la ruta queda como texto en el cotizador');
    ok(!p.errores.length, `ficha envenenada · web: sin errores de JavaScript${p.errores.length ? ': ' + p.errores.slice(0, 3).join(' | ') : ''}`);
    await p.close();
    const q = await abrir(ctx, 'pagar/?v=12000&id=prueba-enlaces&m=023', { esperar: null });
    await q.waitForTimeout(1500);
    await revisar(q, 'ficha envenenada · pago', { decreto: null });
    await q.close();
  });
  revisarPeticiones(ctx, 'ficha envenenada · web y pago');
  await ctx.close();
}

/* ============ 3) Ficha real (con Mapbox, para revisar sus teselas en la CSP) ============ */
const FUENTE = FICHA.TARIFAS.fuente.url;
for (const d of ['a', 'b', 'c']) {
  const ctx = await nuevoContexto({ mapbox: true });
  await recorrerDiseno(ctx, d, { decreto: FUENTE, real: true });
  revisarPeticiones(ctx, `ficha real · diseño ${d.toUpperCase()}`);
  await ctx.close();
}
{
  // Las demás páginas del sitio, con la ficha real: también sin violaciones de la CSP.
  const ctx = await nuevoContexto({ mapbox: true });
  const paginas = [
    ['raíz TaxiCun', '', null], ['TaxiCun (pasajero)', 'taxicun/?e=cootransrural', '#carga'], ['TaxiCun (conductor)', 'taxicun/conductor/?e=cootransrural', '#carga'],
    ['lista de municipios', 'taxicun/?elegir=1', null], ['cooperativas', 'cooperativas/', null], ['web de la cooperativa', 'el-rosal/', null],
    ['web de otra cooperativa', 'tabio/', null], ['descargar', 'el-rosal/descargar/?movil=023', null], ['stickers', 'el-rosal/stickers/', null],
    ['propuesta', 'tabio/propuesta/', null], ['vitrina de diseños', 'el-rosal/disenos/', null], ['privacidad de TaxiCun', 'privacidad/', null],
    ['privacidad de la cooperativa', 'el-rosal/privacidad/', null], ['pago', 'pagar/?v=12000&id=prueba-enlaces&m=023', null], ['página 404', '404.html', null],
  ];
  for (const [nombre, ruta, esperar] of paginas) {
    await paso(`ficha real · ${nombre}`, async () => {
      const p = await abrir(ctx, ruta, { esperar });
      await p.waitForTimeout(ruta.includes('disenos') ? 3500 : 1200);
      await revisar(p, `ficha real · ${nombre}`, { decreto: null });
      await p.close();
    });
  }
  revisarPeticiones(ctx, 'ficha real · demás páginas');
  await ctx.close();
}

/* ============ 4) La política frena lo que no está en la lista; la barrera de clics ============ */
{
  const ctx = await nuevoContexto();
  const p = await abrir(ctx, 'el-rosal/app/?d=a');
  const r = await p.evaluate(async () => {
    window.__xss = undefined;
    // Barrera de clics: un enlace javascript: pintado por error no navega.
    const a = document.createElement('a');
    a.href = 'javascript:window.__xss=99';
    a.textContent = 'trampa';
    document.body.append(a);
    a.click();
    a.remove();
    await new Promise((ok) => setTimeout(ok, 300));
    const tras = window.__xss ?? null;
    window.__csp = [];
    // Lo permitido: no debe producir violaciones.
    const img = (u) => new Promise((ok) => { const i = new Image(); i.onload = i.onerror = () => ok(); i.src = u; });
    const ws = (u) => { try { const s = new WebSocket(u); setTimeout(() => s.close(), 50); } catch {} };
    await Promise.all([
      fetch('https://nominatim.openstreetmap.org/search?q=El+Rosal&format=json').catch(() => {}),
      fetch('https://router.project-osrm.org/route/v1/driving/-74.26,4.85;-74.27,4.86').catch(() => {}),
      img('https://tile.openstreetmap.org/0/0/0.png'), img('https://a.tile.openstreetmap.fr/hot/0/0/0.png'),
      img('https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/0/0/0'),
    ]);
    ws('wss://test.mosquitto.org:8081'); ws('wss://broker.emqx.io:8084/mqtt'); ws('wss://broker.hivemq.com:8884/mqtt');
    await new Promise((ok) => setTimeout(ok, 600));
    const permitidas = window.__csp.splice(0);
    // Lo que no está en la lista: cada uno debe producir su violación.
    await fetch('https://evil.example/x').catch(() => {});
    await img('https://evil.example/x.png');
    ws('wss://evil.example/');
    const s = document.createElement('script');
    s.textContent = 'window.__sonda = 1;';
    document.head.append(s);
    const b = document.createElement('button');
    b.setAttribute('onclick', 'window.__sonda = 2');
    document.body.append(b);
    b.click();
    b.remove();
    try { eval('1'); } catch {}
    await new Promise((ok) => setTimeout(ok, 800));
    return { tras, permitidas, bloqueadas: window.__csp.map((v) => `${v.directiva} ${v.bloqueado}`) };
  });
  ok(r.tras === null, 'barrera de clics: un enlace javascript: no corre al tocarlo');
  if (CON_CSP) {
    ok(!r.permitidas.length, `CSP: Nominatim, OSRM, teselas de OSM/HOT/Mapbox y los 3 relés MQTT no producen violaciones${r.permitidas.length ? ': ' + JSON.stringify(r.permitidas) : ''}`);
    const hay = (re) => r.bloqueadas.some((v) => re.test(v));
    ok(hay(/^connect-src https:\/\/evil\.example/) && hay(/^connect-src wss:\/\/evil\.example/), 'CSP: fetch y WebSocket a otro dominio quedan en el informe (connect-src)');
    ok(hay(/^img-src https:\/\/evil\.example/), 'CSP: una imagen de otro dominio queda en el informe (img-src)');
    ok(hay(/^script-src-elem inline/), 'CSP: un <script> en línea sin nonce queda en el informe (script-src-elem)');
    ok(hay(/^script-src-attr inline/), 'CSP: un onclick en línea queda en el informe (script-src-attr)');
    ok(hay(/^script-src eval/), 'CSP: eval queda en el informe (script-src)');
  }
  await p.close();
  await ctx.close();
}

await navegador.close();
const segundos = Math.round((Date.now() - inicio) / 1000);
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'} · enlaces seguros y CSP · ${bien} ✔ · ${fallas} fallas · ${segundos} s · capturas en ${DIR}`);
