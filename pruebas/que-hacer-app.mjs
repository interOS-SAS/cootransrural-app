// «¿Qué hacer?» en la app TaxiCun del pasajero (diseño A, modo real ?real=1) con el servidor de TaxiCun simulado aquí
// mismo (page.route y routeWebSocket, como lejos-app.mjs) según el contrato del servidor 0.13.0 (docs/CONTRATO.md §16.2):
// GET /api/que-hacer/sitios y /planes (cerca de lat/lng con 2 decimales y radioKm, o ?municipio=<id>), /municipios y
// las fotos servidas por TaxiCun (con credito { texto, autor, licencia, licenciaUrl, pagina, origen }).
//
//  1) Con sitios publicados cerca (El Rosal): el botón «¿Qué hacer?» sale en el inicio; la lista pide /sitios con la
//     posición (sin token), los ordena por distancia y cada tarjeta trae foto (del mismo origen) con su crédito a la
//     vista, resumen, distancia y el valor aproximado del taxi (el tarifador de Cootransrural: tarifa oficial).
//  2) Ficha: descripción, horario, entrada, el crédito con «Ver la foto» (Commons) y «Licencia»; la foto de interOS dice
//     «Foto: interOS»; «Llévame» cierra todo y abre «Confirma tu viaje» con ese destino.
//  3) Planes de un día: el plan con sus paradas en orden; el plan con una parada sin publicar no sale; «Empezar:
//     llévame a …» abre «Confirma tu viaje» con la primera parada.
//  4) XSS: nombre, resumen, descripción, horario, crédito y título del plan con HTML se pintan como texto; la foto
//     enlazada a Commons (otro dominio) y la foto sin autor no se muestran.
//  5) «Ver los de El Rosal» pide por municipio; sin nada cerca, la lista cae sola al municipio y lo dice.
//  6) Servidor anterior (404): no hay botón. 7) Modo revisor (bienvenida revision): ni botón ni consulta.
//  8) Sin GPS: pregunta por el municipio. 9) La demo (sin ?real=1): ni botón ni consulta.
//
// Uso: node pruebas/que-hacer-app.mjs [url_base]   (estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5621 --api=http://127.0.0.1:5629). Capturas en $CAPTURAS.
//      PLAYWRIGHT_CORE: la ruta de playwright-core/index.mjs si no está en /tmp/cootrans/npm.
import { mkdirSync, readFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5621/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/que-hacer/capturas-app').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const EL_ROSAL = { latitude: CENTRO.lat + 0.002, longitude: CENTRO.lng, accuracy: 12 };
const CUPERTINO = { latitude: 37.3349, longitude: -122.009, accuracy: 20 };
const CODIGO = '123456';
// PNG de 1×1 (la «foto» que sirve TaxiCun).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const HTML = '<img src=x onerror="window.__xss=1">Mirador & "Cía"';

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const intento = async (pr) => {
  try {
    await pr;
    return true;
  } catch {
    return false;
  }
};

/* ---------------- Datos publicados (lo que respondería el servidor) ---------------- */
const fotoCommons = (id) => ({ url: `/api/que-hacer/fotos/${id}.jpg`, tipo: 'image/jpeg', ancho: 1280, alto: 720, credito: { texto: 'Foto: DnTrotaMundos ☮ · CC BY 3.0 · Wikimedia Commons', autor: 'DnTrotaMundos ☮', licencia: 'CC BY 3.0', licenciaUrl: 'https://creativecommons.org/licenses/by/3.0', pagina: 'https://commons.wikimedia.org/wiki/File:Iglesia_de_El_Rosal_-_panoramio.jpg', origen: 'commons' } });
const ROSAL = { id: 'el-rosal', nombre: 'El Rosal' };
const IGLESIA = {
  id: 'el-rosal-parroquia-san-jose', municipio: ROSAL, precision: 'exacta', nombre: 'Parroquia San José de El Rosal', categoria: 'religioso',
  resumen: 'El templo del parque principal, símbolo del pueblo.', descripcion: 'Es la iglesia principal de El Rosal y queda frente al parque central. Fue fundada en 1902.',
  lat: CENTRO.lat + 0.0005, lng: CENTRO.lng + 0.0003, direccion: 'Parque principal', horario: null, entrada: 'gratis', valorEntrada: null,
  recomendaciones: 'Respete los horarios de misa.\nSe puede combinar con el parque.', fotos: [fotoCommons('f-iglesia')],
  fuentes: [{ titulo: 'Wikipedia: El Rosal (Colombia)', url: 'https://es.wikipedia.org/wiki/El_Rosal_(Colombia)' }, { titulo: 'Fuente sin https', url: 'http://ejemplo.test/' }],
};
const MONASTERIO = {
  id: 'el-rosal-monasterio', municipio: ROSAL, precision: 'aproximada', nombre: 'Monasterio benedictino', categoria: 'religioso',
  resumen: 'En la vereda Cruz Verde.', descripcion: 'Monasterio en las afueras.', lat: CENTRO.lat + 0.025, lng: CENTRO.lng - 0.01,
  horario: 'Domingos, 9:00 a. m. a 12:00 m.', entrada: 'con_costo', valorEntrada: 5000,
  fotos: [{ url: '/api/que-hacer/fotos/f-propia.jpg', tipo: 'image/jpeg', ancho: 1600, alto: 900, credito: { texto: 'Foto: interOS', autor: null, licencia: null, licenciaUrl: null, pagina: null, origen: 'interos' } }],
};
const MALO = {
  id: 'el-rosal-mirador', municipio: ROSAL, precision: 'exacta', nombre: HTML, categoria: 'mirador',
  resumen: '<script>window.__xss=2</script>Vista', descripcion: '<b onclick="window.__xss=3">negrita</b>', lat: CENTRO.lat + 0.01, lng: CENTRO.lng + 0.01,
  horario: '<img src=y onerror="window.__xss=4">8 a 5', entrada: 'desconocido',
  fotos: [
    { url: 'https://upload.wikimedia.org/wikipedia/commons/a.jpg', credito: { texto: 'Foto: Alguien · CC BY 4.0', origen: 'commons' } }, // otro dominio: no
    { url: '/api/que-hacer/fotos/f-sin-autor.jpg', credito: { texto: '', autor: '', licencia: 'CC0', origen: 'commons' } }, // sin crédito: no
    { url: '/api/que-hacer/fotos/f-xss.jpg', credito: { texto: 'Foto: <i onmouseover="window.__xss=5">Autor</i> · CC BY-SA 4.0', autor: '<i>Autor</i>', licencia: 'CC BY-SA 4.0', licenciaUrl: 'javascript:window.__xss=6', pagina: 'https://evil.test/x', origen: 'commons' } },
  ],
};
const SOLO_MUNICIPIO = { ...IGLESIA, id: 'el-rosal-parque-principal', nombre: 'Parque principal de El Rosal', categoria: 'parque', fotos: [] };
// Paradas desordenadas a propósito: la app las pone por «orden».
const PLAN = { id: 'el-rosal-centro-y-monasterio', titulo: '<b>Mañana</b> en El Rosal', municipios: [ROSAL], resumen: 'Recorra el centro y suba al monasterio.', paradas: [{ orden: 2, sitio: MALO }, { orden: 1, sitio: IGLESIA }, { orden: 3, sitio: MONASTERIO }], duracion: 'medio día', recomendaciones: 'Almuerce fritanga.' };
const ORDEN_PLAN = [IGLESIA.id, MALO.id, MONASTERIO.id];
// Una parada dañada (sin coordenadas): el plan no sale.
const PLAN_INCOMPLETO = { id: 'el-rosal-incompleto', titulo: 'Plan con una parada dañada', municipios: [ROSAL], paradas: [{ orden: 1, sitio: IGLESIA }, { orden: 2, sitio: { id: 'sin-punto', nombre: 'Sin punto' } }], duracion: 'medio día' };

/* ---------------- Servidor de TaxiCun simulado ---------------- */
const srv = { n: 0, sesiones: new Map(), usuarios: new Map(), peticiones: [], qh: 'ok', revisionBus: false };
const usuario = (correo) => {
  srv.usuarios.set(correo, { nombre: 'Ana María Gómez', celular: '3001234567' });
  return correo;
};
const yoDe = (correo) => ({ usuario: { id: `u-${correo}`, correo, ...srv.usuarios.get(correo) }, conductor: null });
const pideQH = (correo, ruta = '') => srv.peticiones.filter((x) => x.ruta.startsWith(`que-hacer/${ruta}`) && x.correo === correo);

async function atenderApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const ruta = url.pathname.replace(/^\/api\//, '');
  const metodo = req.method();
  let cuerpo = null;
  try {
    cuerpo = req.postDataJSON();
  } catch {
    cuerpo = null;
  }
  const h = req.headers();
  const token = (h.authorization || '').replace(/^Bearer\s+/, '');
  // La consulta pública no lleva token: se anota a nombre de la cuenta de la prueba en curso.
  const correo = srv.sesiones.get(token) || srv.actual || null;
  srv.peticiones.push({ metodo, ruta, q: url.searchParams, correo, autorizacion: Boolean(h.authorization), t: Date.now() });
  const responder = (estado, datos, extra = {}) => route.fulfill({ status: estado, contentType: 'application/json', headers: extra, body: JSON.stringify(datos) });
  if (ruta.startsWith('que-hacer/')) {
    if (srv.qh === '404') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: `Route GET:/api/${ruta} not found`, error: 'Not Found', statusCode: 404 }) });
    if (ruta.startsWith('que-hacer/fotos/')) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (ruta === 'que-hacer/municipios') return responder(200, { version: 1, municipios: [{ id: 'el-rosal', nombre: 'El Rosal', centro: { lat: CENTRO.lat, lng: CENTRO.lng }, sitios: 2, planes: 0 }] });
    const municipio = url.searchParams.get('municipio');
    const cerca = url.searchParams.has('lat');
    // Como el servidor: lat/lng con 2 decimales como máximo y radioKm de 1 a 40.
    if (cerca && (!/^-?\d+(\.\d{1,2})?$/.test(url.searchParams.get('lat')) || !/^-?\d+(\.\d{1,2})?$/.test(url.searchParams.get('lng')) || !(Number(url.searchParams.get('radioKm') || 15) >= 1 && Number(url.searchParams.get('radioKm') || 15) <= 40))) return responder(400, { error: 'datos_invalidos' });
    const vacio = srv.qh === 'vacio-cerca' && cerca;
    const cab = { ETag: '"v1"', 'Cache-Control': 'public, max-age=60' };
    if (ruta === 'que-hacer/sitios') {
      if (vacio) return responder(200, { version: 1, total: 0, sitios: [] }, cab);
      return responder(200, { version: 1, total: 3, sitios: municipio === 'el-rosal' ? [SOLO_MUNICIPIO, IGLESIA] : [MONASTERIO, MALO, IGLESIA] }, cab);
    }
    if (ruta === 'que-hacer/planes') {
      if (vacio || municipio) return responder(200, { version: 1, total: 0, planes: [] }, cab);
      return responder(200, { version: 1, total: 2, planes: [PLAN, PLAN_INCOMPLETO] }, cab);
    }
    return responder(404, { error: 'no_existe' });
  }
  if (metodo === 'GET' && ruta === 'empresas/indice') return responder(404, { error: 'no_existe' });
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    const c = String(cuerpo?.correo || '').toLowerCase();
    if (cuerpo?.codigo !== CODIGO || !srv.usuarios.has(c)) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
    srv.sesiones.set(t, c);
    return responder(200, { token: t, ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'cercania') return responder(200, { lejos: false, km: 1, umbralKm: 30, exento: srv.revisionBus, cooperativa: null });
  if (!srv.sesiones.get(token)) return responder(401, { error: 'sin_sesion' });
  if (ruta === 'yo') return responder(200, yoDe(correo));
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (metodo === 'GET' && ruta === 'yo/avisos') return responder(200, { bajas: [] });
  return responder(404, { error: 'no_existe' });
}
const enviar = (ws, tipo, datos) => {
  try {
    ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de: 'servidor', ts: Date.now(), datos }));
  } catch {
    /* cerrado */
  }
};
function atenderBus(ws) {
  ws.onMessage((texto) => {
    let m;
    try {
      m = JSON.parse(String(texto));
    } catch {
      return;
    }
    if (m.tipo !== 'hola') return;
    const correo = srv.sesiones.get(m.datos?.token);
    if (!correo) {
      enviar(ws, 'error', { codigo: 'sin_sesion' });
      ws.close({ code: 4401, reason: 'sin_sesion' });
      return;
    }
    enviar(ws, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: srv.usuarios.get(correo).nombre, pasajeroId: `p_${correo}`, ...(srv.revisionBus ? { revision: true } : {}) });
    enviar(ws, 'viaje_actual', null);
  });
}

/* ---------------- Ayudas ---------------- */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { geo = EL_ROSAL, permiso = true } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'es-CO', timezoneId: 'America/Bogota',
    ...(permiso ? { geolocation: geo, permissions: ['geolocation'] } : { permissions: [] }),
  });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap|upload\.wikimedia)/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const sinXss = (p) => p.evaluate(() => window.__xss === undefined);

async function entrarPasajero(p, correo) {
  srv.actual = correo;
  await p.goto(`${BASE}taxicun/?real=1`);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', correo);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await p.waitForSelector('.a-bienvenida .a-casillas-6 input', { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click('.a-bienvenida .a-casillas-6 input >> nth=0');
  await p.keyboard.type(CODIGO, { delay: 30 });
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.click('.a-bienvenida [data-empezar]');
  await p.waitForSelector('.a-app[data-vista="inicio"]', { timeout: 20000 });
}
const botonVisible = (p, timeout = 12000) => intento(p.waitForSelector('[data-que-hacer]:not([hidden])', { state: 'visible', timeout }));
async function abrirLista(p) {
  await p.click('[data-que-hacer]');
  await p.waitForSelector('.a-panel-qh.a-abierto [data-qh-lista] :is(.a-qh-sitio, [data-qh-vacio])', { timeout: 10000 });
  await p.waitForTimeout(400);
}
const enConfirmar = async (p, nombre) => {
  const llego = await intento(p.waitForSelector('.a-app[data-vista="confirmar"]', { timeout: 8000 }));
  await p.waitForTimeout(500);
  return llego && (await texto(p, '.a-hoja')).includes(nombre) && (await p.$$('.a-panel-qh')).length === 0;
};

/* ---------------- Casos ---------------- */
async function conSitios() {
  console.log('\n— 1) a 4) Con sitios publicados cerca (El Rosal)');
  srv.qh = 'ok';
  srv.revisionBus = false;
  const correo = usuario('ana.qh@correo.test');
  const { ctx, p } = await contexto('qh-cerca');
  await entrarPasajero(p, correo);
  ok(await botonVisible(p), 'el botón «¿Qué hacer?» sale en el inicio');
  await p.waitForSelector('.a-bienvenida', { state: 'detached', timeout: 10000 }).catch(() => {});
  await p.waitForTimeout(800);
  await foto(p, 'Q1-inicio-boton');
  const previa = pideQH(correo, 'sitios')[0];
  ok(previa && previa.q.get('radioKm') === '20' && previa.q.get('lat') === EL_ROSAL.latitude.toFixed(2) && previa.q.get('lng') === EL_ROSAL.longitude.toFixed(2) && !previa.autorizacion, `antes, la app preguntó por /api/que-hacer/sitios con la posición en 2 decimales y sin token (${previa?.q})`);
  await abrirLista(p);
  await foto(p, 'Q1-lista');
  const ids = await p.$$eval('.a-qh-sitio', (xs) => xs.map((x) => x.dataset.sitio));
  ok(ids.join() === [IGLESIA.id, MALO.id, MONASTERIO.id].join(), `ordenados por distancia (${ids.join(', ')})`);
  const t1 = await texto(p, `.a-qh-sitio[data-sitio="${IGLESIA.id}"]`);
  ok(t1.includes('Parroquia San José de El Rosal') && t1.includes('El templo del parque principal') && /RELIGIOSO · EL ROSAL/i.test(t1), 'tarjeta con categoría, municipio, nombre y resumen');
  ok(/a \d+ m|a \d+(,\d)? km/.test(t1) && /Taxi ≈ \$\s?\d/.test(t1), `distancia y valor aproximado del taxi («${(t1.match(/a [\d,]+ k?m.*$/) || [''])[0]}»)`);
  const img = await p.$eval(`.a-qh-sitio[data-sitio="${IGLESIA.id}"] img`, (i) => ({ src: i.src, ok: i.complete && i.naturalWidth > 0, alt: i.alt }));
  ok(img.src === `${BASE}api/que-hacer/fotos/f-iglesia.jpg` && img.ok && img.alt === 'Parroquia San José de El Rosal', `la foto sale de TaxiCun (mismo origen) y carga (${img.src.replace(BASE, '/')})`);
  const credito = await p.$eval(`.a-qh-sitio[data-sitio="${IGLESIA.id}"] [data-credito]`, (c) => ({ t: c.innerText, vis: c.getBoundingClientRect().height > 8 && getComputedStyle(c).visibility !== 'hidden' }));
  ok(credito.t === 'Foto: DnTrotaMundos ☮ · CC BY 3.0 · Wikimedia Commons' && credito.vis, `crédito a la vista en la tarjeta («${credito.t}»)`);
  const valorLista = (t1.match(/Taxi ≈ (\$\s?[\d.]+)/) || [])[1];
  ok(valorLista === '$6.100' || /\$\s?6\.100/.test(valorLista || ''), `dentro del casco urbano: la carrera mínima oficial de Cootransrural (${valorLista})`);

  // 4) XSS y fotos que no pasan
  const tMalo = await texto(p, `.a-qh-sitio[data-sitio="${MALO.id}"]`);
  ok(tMalo.includes(HTML) && tMalo.includes('<script>window.__xss=2</script>Vista'), 'nombre y resumen con HTML salen como texto');
  const fotoMalo = await p.$eval(`.a-qh-sitio[data-sitio="${MALO.id}"]`, (x) => ({ src: x.querySelector('img')?.src || '', cred: x.querySelector('[data-credito]')?.innerText || '' }));
  ok(fotoMalo.src.endsWith('/api/que-hacer/fotos/f-xss.jpg') && fotoMalo.cred === 'Foto: <i onmouseover="window.__xss=5">Autor</i> · CC BY-SA 4.0', 'la foto de Commons enlazada directo y la foto sin autor no salen; el crédito con HTML es texto');
  ok(!(await p.$('.a-panel-qh img[src="x"], .a-panel-qh img[src="y"], .a-panel-qh script, .a-panel-qh b, .a-panel-qh i')), 'ningún elemento armado con los datos');

  // 2) Ficha
  await p.click(`.a-qh-sitio[data-sitio="${MALO.id}"]`);
  await p.waitForSelector('.a-panel-qh-ficha.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(400);
  const fMalo = await texto(p, '.a-panel-qh-ficha');
  ok(fMalo.includes('<b onclick="window.__xss=3">negrita</b>') && fMalo.includes('<img src=y onerror="window.__xss=4">8 a 5') && (await p.$eval('.a-panel-qh-ficha h2', (h2) => h2.textContent)) === HTML, 'ficha: título, descripción y horario con HTML salen como texto');
  ok(!(await p.$('.a-panel-qh-ficha [data-credito-licencia], .a-panel-qh-ficha [data-credito-pagina]')), 'enlaces del crédito que no son de Commons/Creative Commons no se pintan');
  ok(fMalo.includes('Entrada: consulta antes de ir'), 'entrada desconocida: «consulta antes de ir»');
  await foto(p, 'Q4-ficha-xss');
  await p.click('.a-panel-qh-ficha [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click(`.a-qh-sitio[data-sitio="${MONASTERIO.id}"]`);
  await p.waitForSelector('.a-panel-qh-ficha.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(400);
  const fMon = await texto(p, '.a-panel-qh-ficha');
  ok(fMon.includes('Foto: interOS') && fMon.includes('Domingos, 9:00 a. m. a 12:00 m.') && /Entrada: \$\s?5\.000/.test(fMon), 'foto de interOS («Foto: interOS»), horario y entrada con valor');
  ok(fMon.includes('Punto aproximado') && fMon.includes('Confirma la entrada con el conductor.'), 'precisión aproximada: «Confirma la entrada con el conductor.»');
  await p.click('.a-panel-qh-ficha [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click(`.a-qh-sitio[data-sitio="${IGLESIA.id}"]`);
  await p.waitForSelector('.a-panel-qh-ficha.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(500);
  const fIg = await texto(p, '.a-panel-qh-ficha');
  ok(!/\bnull\b|undefined/.test(fIg), 'sin «null» ni «undefined» sueltos en la ficha');
  ok(fIg.includes('Es la iglesia principal de El Rosal') && fIg.includes('Consulta el horario antes de ir.') && fIg.includes('Entrada gratis') && fIg.includes('Respete los horarios de misa.'), 'ficha: descripción, horario (sin dato), entrada gratis y recomendaciones');
  ok(await p.$eval('.a-panel-qh-ficha .a-qh-reco p', (x) => x.innerText === 'Respete los horarios de misa.\nSe puede combinar con el parque.'), 'las recomendaciones conservan el salto de línea');
  const fuentes = await p.$$eval('.a-panel-qh-ficha [data-qh-fuentes] li', (xs) => xs.map((x) => ({ t: x.innerText, href: x.querySelector('a')?.href || '' })));
  ok(fuentes.length === 2 && fuentes[0].href === 'https://es.wikipedia.org/wiki/El_Rosal_(Colombia)' && fuentes[1].href === '' && fuentes[1].t === 'Fuente sin https', 'fuentes: con enlace si es https, si no solo el título');
  const enlaces = await p.$eval('.a-panel-qh-ficha [data-credito]', (c) => ({ t: c.innerText, pag: c.querySelector('[data-credito-pagina]')?.href, lic: c.querySelector('[data-credito-licencia]')?.href, target: c.querySelector('[data-credito-pagina]')?.target }));
  ok(/Foto: DnTrotaMundos ☮ · CC BY 3\.0/.test(enlaces.t) && enlaces.pag === IGLESIA.fotos[0].credito.pagina && enlaces.lic === 'https://creativecommons.org/licenses/by/3.0' && enlaces.target === '_blank', 'crédito de la ficha con «Ver la foto» (Commons) y «Licencia»');
  ok(/Taxi desde tu punto: ≈ \$\s?6\.100/.test(fIg), 'valor aproximado del taxi en la ficha');
  await foto(p, 'Q2-ficha');
  ok(await sinXss(p), 'sin XSS');
  await p.click('.a-panel-qh-ficha [data-llevame]');
  ok(await enConfirmar(p, 'Parroquia San José de El Rosal'), '«Llévame» → «Confirma tu viaje» con ese destino y sin los paneles');
  await foto(p, 'Q2-confirmar');

  // 3) Planes
  // «Cambiar el destino» vuelve al inicio y abre el buscador: se cierra.
  await p.click('.a-hoja-contenido [data-volver]');
  await p.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await p.click('.a-buscador [data-cerrar]');
  await p.waitForSelector('.a-buscador', { state: 'detached', timeout: 8000 });
  await p.waitForSelector('[data-que-hacer]:not([hidden])', { timeout: 8000 });
  await abrirLista(p);
  await p.click('.a-qh-pestanas [data-pestana="planes"]');
  await p.waitForSelector('.a-qh-plan', { timeout: 5000 });
  const planes = await p.$$eval('.a-qh-plan', (xs) => xs.map((x) => x.dataset.plan));
  ok(planes.join() === PLAN.id, `solo el plan con todas sus paradas publicadas (${planes.join(', ')})`);
  const tPlan = await texto(p, '.a-qh-plan');
  ok(tPlan.includes('<b>Mañana</b> en El Rosal') && /MEDIO DÍA · EL ROSAL/i.test(tPlan) && tPlan.includes('Almuerce fritanga.'), 'título (texto), duración, municipio y recomendaciones');
  const paradas = await p.$$eval('.a-qh-plan [data-parada]', (xs) => xs.map((x) => x.dataset.parada));
  ok(paradas.join() === ORDEN_PLAN.join(), `las paradas en el orden del plan (${paradas.join(', ')})`);
  await foto(p, 'Q3-planes');
  await p.click(`.a-qh-plan [data-parada="${MONASTERIO.id}"]`);
  await p.waitForSelector('.a-panel-qh-ficha.a-abierto', { timeout: 5000 });
  ok((await p.$eval('.a-panel-qh-ficha h2', (h2) => h2.textContent)) === 'Monasterio benedictino', 'tocar una parada abre su ficha');
  await p.click('.a-panel-qh-ficha [data-cerrar]');
  await p.waitForTimeout(400);
  await p.click('.a-qh-plan [data-plan-llevame]');
  ok(await enConfirmar(p, 'Parroquia San José de El Rosal'), '«Empezar: llévame a …» → «Confirma tu viaje» con la primera parada');
  ok(await sinXss(p), 'sin XSS al final');
  await ctx.close();
}

async function alcanceYVacio() {
  console.log('\n— 5) Municipio de la cooperativa y nada cerca');
  srv.qh = 'ok';
  const correo = usuario('ana.qh2@correo.test');
  const { ctx, p } = await contexto('qh-municipio');
  await entrarPasajero(p, correo);
  await botonVisible(p);
  await abrirLista(p);
  await p.click('[data-qh-alcance]');
  await p.waitForFunction(() => document.querySelectorAll('.a-qh-sitio').length === 2, null, { timeout: 8000 });
  const ult = pideQH(correo, 'sitios').at(-1);
  ok(ult?.q.get('municipio') === 'el-rosal' && !ult.q.has('lat'), '«Ver los de El Rosal» pide por municipio (el-rosal)');
  ok((await texto(p, '[data-qh-intro]')).includes('El Rosal') && (await texto(p, '[data-qh-alcance]')) === 'Ver los cercanos', 'lo dice y ofrece volver a los cercanos');
  await ctx.close();

  srv.qh = 'vacio-cerca';
  const correo2 = usuario('ana.qh3@correo.test');
  const c2 = await contexto('qh-vacio');
  await entrarPasajero(c2.p, correo2);
  ok(await botonVisible(c2.p), 'sin nada cerca pero con sitios en el municipio: el botón sale');
  await abrirLista(c2.p);
  ok(/No hay sitios publicados cerca de ti\. Estos son los de El Rosal\./.test(await texto(c2.p, '[data-qh-intro]')) && (await c2.p.$$('.a-qh-sitio')).length === 2, 'la lista cae sola a los del municipio y lo dice');
  await foto(c2.p, 'Q5-municipio');
  await c2.ctx.close();
}

async function sinBoton(etiqueta, { qh = 'ok', revision = false, geo = EL_ROSAL, permiso = true, pregunta, municipio = false }) {
  console.log(`\n— ${etiqueta}`);
  srv.qh = qh;
  srv.revisionBus = revision;
  const correo = usuario(`ana.${etiqueta.replace(/\W+/g, '').slice(0, 12).toLowerCase()}@correo.test`);
  const { ctx, p } = await contexto(etiqueta, { geo, permiso });
  await entrarPasajero(p, correo);
  await p.waitForTimeout(3500);
  const visible = await p.$('[data-que-hacer]:not([hidden])');
  if (municipio) {
    ok(Boolean(visible), 'el botón sale');
    const q = pideQH(correo, 'sitios')[0]?.q;
    ok(q && q.get('municipio') === 'el-rosal' && !q.has('lat'), `sin GPS pregunta por el municipio de la cooperativa (${q})`);
  } else {
    ok(!visible && (await p.$('[data-que-hacer]')) !== null, 'el botón no sale (está en la página, escondido)');
    ok(pideQH(correo).length > 0 === pregunta, pregunta ? 'preguntó y el servidor no lo tiene (404)' : 'no le pregunta nada al servidor');
  }
  await ctx.close();
  srv.revisionBus = false;
}

async function demo() {
  console.log('\n— 9) La demo (sin el modo real)');
  srv.qh = 'ok';
  srv.actual = 'demo@correo.test';
  const { ctx, p } = await contexto('qh-demo');
  await p.goto(`${BASE}taxicun/?e=cootransrural`);
  await p.waitForSelector('.a-app', { timeout: 30000 });
  await p.waitForTimeout(4000);
  ok((await p.$('[data-que-hacer]')) === null, 'la demo no tiene el botón');
  ok(pideQH('demo@correo.test').length === 0, 'ni pregunta por «¿Qué hacer?»');
  await ctx.close();
}

try {
  await conSitios();
  await alcanceYVacio();
  await sinBoton('6) Servidor anterior (404)', { qh: '404', pregunta: true });
  await sinBoton('7) Modo revisor (bienvenida revision) en Cupertino', { revision: true, geo: CUPERTINO, pregunta: false });
  await sinBoton('8) Sin GPS', { permiso: false, municipio: true });
  await demo();
} catch (e) {
  ok(false, `la prueba se detuvo: ${e.message.split('\n')[0]}`);
} finally {
  ok(errores.length === 0, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 4).join(' | ')}` : ''}`);
  await b.close();
}
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exitCode = fallas ? 1 : 0;
