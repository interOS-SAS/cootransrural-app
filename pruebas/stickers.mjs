// Prueba del generador de stickers QR (stickers/).
//  a) Descarga el PNG de 3 móviles (y de otros formatos) y lo decodifica con jsQR:
//     el texto tiene que ser EXACTAMENTE la URL esperada.
//  b) Genera el PDF de las hojas (carta y A4) y comprueba el tamaño de página y
//     que cada sticker mide lo pedido en la vista de impresión.
//  c) Guarda capturas de la vista previa de cada formato y de las hojas.
// Uso: node pruebas/stickers.mjs [url_base]   (por defecto http://localhost:8775/)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const BASE = (process.argv[2] || 'http://localhost:8775/').replace(/\/?$/, '/');
// Cootransrural vive en el-rosal/ desde que la raíz del sitio es TaxiCun (stickers/ redirige ahí):
// el QR lleva a el-rosal/descargar/.
const COOP = `${BASE}el-rosal/`;
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = process.env.CAPTURAS || '/tmp/cootrans/capturas/stickers/';
const ROSAL = { latitude: 4.8531, longitude: -74.2611 };
mkdirSync(DIR, { recursive: true });

let fallas = 0;
const ok = (c, m) => {
  console.log((c ? '✔' : '✘') + ' ' + m);
  if (!c) {
    fallas++;
    process.exitCode = 1;
  }
};
const cerca = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const PX_MM = 96 / 25.4;

// Errores de JS de la página (se ignoran solo recursos externos caídos).
const errores = [];
const externo = (t) => /cartocdn|nominatim|project-osrm|openstreetmap|mosquitto|emqx|hivemq|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED/i.test(t);

const navegador = await chromium.launch({ executablePath: EXE });
const ctx = await navegador.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  acceptDownloads: true,
  geolocation: ROSAL,
  permissions: ['geolocation'],
});
await ctx.addInitScript(() => {
  localStorage.setItem('ct.envivo', 'no');
  if (!sessionStorage.getItem('prueba-iniciada')) {
    localStorage.removeItem('ct.stickers');
    sessionStorage.setItem('prueba-iniciada', '1');
  }
  // En la prueba no se abre el diálogo de impresión: se emula el medio «print».
  window.print = () => {
    window.__impresiones = (window.__impresiones || 0) + 1;
  };
});

const p = await ctx.newPage();
p.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
p.on('console', (m) => {
  if (m.type() === 'error' && !externo(m.text())) errores.push('console: ' + m.text());
});
p.on('requestfailed', (r) => {
  if (!externo(r.url()) && !r.url().startsWith('blob:')) errores.push('recurso: ' + r.url() + ' ' + (r.failure()?.errorText || ''));
});

await p.goto(BASE + 'stickers/');
await p.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 20000 });
await p.addScriptTag({ url: BASE + 'vendor/jsQR.min.js' });
await p.waitForTimeout(500);

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------
const inicial = await p.evaluate(() => ({
  estado: { ...window.stickers.estado, copias: { ...window.stickers.estado.copias } },
  resumen: document.querySelector('#resumen').textContent,
  opciones: document.querySelectorAll('#movil-actual option').length,
  lectura: document.querySelector('#chip-lectura')?.textContent || '',
  formatos: document.querySelectorAll('.formato').length,
}));
ok(inicial.formatos === 5, '5 formatos disponibles');
ok(inicial.estado.formato === 'taxi' && inicial.estado.desde === 1 && inicial.estado.hasta === 52, 'por defecto: sticker de taxi, móviles 001–052');
ok(inicial.estado.copias.taxi === 2 && inicial.estado.copias.tarjeta === 1, 'copias por defecto: 2 en el de taxi, 1 en los demás');
ok(inicial.estado.papel === 'carta', 'hoja carta por defecto');
ok(inicial.opciones === 52, '52 móviles en el selector');
ok(await p.evaluate(() => !document.querySelector('#lista').offsetParent && !!document.querySelector('#desde').offsetParent), 'modo rango: se esconde el campo de lista');
ok(/104\s*stickers/.test(inicial.resumen), `resumen: ${inicial.resumen.trim()}`);
await p.waitForFunction(() => /verificado/i.test(document.querySelector('#chip-lectura')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
ok(/verificado/i.test(await p.textContent('#chip-lectura')), 'la vista previa se autoverifica leyendo su propio QR');
await p.screenshot({ path: DIR + 'pagina-escritorio.png', fullPage: false });

// ---------------------------------------------------------------------------
// Utilidades: PNG y lectura del QR en el navegador
// ---------------------------------------------------------------------------
function infoPNG(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firma = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  const ancho = v.getUint32(16);
  const alto = v.getUint32(20);
  let ppm = null;
  let i = 8;
  while (i < bytes.length) {
    const largo = v.getUint32(i);
    const tipo = String.fromCharCode(...bytes.subarray(i + 4, i + 8));
    if (tipo === 'pHYs') ppm = [v.getUint32(i + 8), v.getUint32(i + 12), bytes[i + 16]];
    if (tipo === 'IEND') break;
    i += 12 + largo;
  }
  return { firma, ancho, alto, ppm };
}

async function leerQR(base64, tipo = 'image/png', anchos = [null, 900, 500]) {
  return p.evaluate(
    async ({ base64, tipo, anchos }) => {
      const img = new Image();
      img.src = `data:${tipo};base64,${base64}`;
      await img.decode();
      const w0 = img.naturalWidth || 1200;
      const h0 = img.naturalHeight || 1200;
      return anchos.map((w) => {
        const W = w || w0;
        const c = document.createElement('canvas');
        c.width = W;
        c.height = Math.round((h0 * W) / w0);
        const g = c.getContext('2d');
        g.fillStyle = '#fff';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height);
        return window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
      });
    },
    { base64, tipo, anchos },
  );
}

async function poner(cambios) {
  await p.evaluate((c) => {
    Object.assign(window.stickers.estado, c);
    window.stickers.actualizar();
  }, cambios);
  await p.waitForTimeout(250);
}

async function descargarCon(boton) {
  const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click(boton)]);
  const ruta = DIR + descarga.suggestedFilename();
  await descarga.saveAs(ruta);
  return { ruta, nombre: descarga.suggestedFilename(), bytes: new Uint8Array(readFileSync(ruta)) };
}

// Limpia descargas de corridas anteriores.
for (const f of readdirSync(DIR)) if (/^cootransrural-.*\.(png|svg)$/.test(f) || /^hoja-.*\.(pdf|png)$/.test(f)) unlinkSync(DIR + f);

// ---------------------------------------------------------------------------
// a) PNG de 3 móviles distintos, decodificados con jsQR
// ---------------------------------------------------------------------------
console.log('\n— a) PNG a 300 ppp y lectura del QR —');
for (const movil of ['001', '023', '052']) {
  await p.selectOption('#movil-actual', movil);
  await p.waitForTimeout(200);
  const esperado = `${COOP}descargar/?movil=${movil}&o=sticker`;
  const desdeNucleo = await p.evaluate((m) => window.stickers.urlQR(m), movil);
  const { nombre, bytes } = await descargarCon('#descargar-png');
  const info = infoPNG(bytes);
  ok(info.firma && info.ancho === 1772 && info.alto === 1772, `${nombre}: 1772 × 1772 px (15 cm a 300 ppp)`);
  ok(info.ppm && info.ppm[0] === 11811 && info.ppm[2] === 1, `${nombre}: resolución anotada de 300 ppp (pHYs)`);
  const [completo, medio, chico] = await leerQR(Buffer.from(bytes).toString('base64'));
  ok(completo === esperado, `móvil ${movil}: jsQR lee «${completo}»`);
  ok(medio === esperado && chico === esperado, `móvil ${movil}: también se lee reducido a 900 px y 500 px`);
  ok(desdeNucleo === esperado, `móvil ${movil}: coincide con N.urlDescarga({ movil, origen: 'sticker' })`);
}
const datosQR = await p.evaluate(() => window.stickers.escenaDe('023').qr);
const moduloTaxi = datosQR.lado / (datosQR.modulos + 8);
ok(['Q', 'M'].includes(datosQR.nivel), `nivel de corrección ${datosQR.nivel}`);
ok(moduloTaxi * datosQR.modulos >= 90, `QR del taxi: código de ${(moduloTaxi * datosQR.modulos / 10).toFixed(2)} cm de lado (≥ 9 cm) + zona silenciosa de 4 módulos`);

// Otros formatos y URL base propia.
const pruebasExtra = [
  { formato: 'tarjeta', estilo: 'neon', movil: '007', base: 'https://app.cootransrural.com/descargar/', px: [1063, 591] },
  { formato: 'iman', estilo: 'verde', movil: '018', base: '', px: [1063, 650] },
  { formato: 'espaldar', estilo: 'clasico', movil: '031', base: '', px: [1181, 1181] },
  { formato: 'afiche', estilo: 'verde', movil: '044', base: '', px: [1654, 2551] },
];
for (const t of pruebasExtra) {
  await poner({ formato: t.formato, estilo: t.estilo, urlBase: t.base, movilActual: t.movil });
  const esperado = t.base ? `${t.base}?movil=${t.movil}&o=sticker` : `${COOP}descargar/?movil=${t.movil}&o=sticker`;
  const enlace = await p.getAttribute('#url-final', 'href');
  ok(enlace === esperado, `${t.formato}: el panel muestra la URL del QR (${enlace})`);
  const { nombre, bytes } = await descargarCon('#descargar-png');
  const info = infoPNG(bytes);
  ok(info.ancho === t.px[0] && info.alto === t.px[1], `${nombre}: ${info.ancho} × ${info.alto} px`);
  const [completo, , chico] = await leerQR(Buffer.from(bytes).toString('base64'));
  ok(completo === esperado && chico === esperado, `${t.formato} (${t.estilo}): jsQR lee la URL exacta`);
}

// Sticker genérico (sin móvil): el QR no lleva ?movil.
await poner({ formato: 'iman', estilo: 'clasico', urlBase: '', modo: 'generico' });
{
  const esperado = `${COOP}descargar/?o=sticker`;
  const { bytes } = await descargarCon('#descargar-png');
  const [leido] = await leerQR(Buffer.from(bytes).toString('base64'));
  ok(leido === esperado, `sticker sin móvil: jsQR lee «${leido}»`);
}

// Lista de móviles con rangos y URL base inválida (se avisa y se usa la de la app).
await poner({ formato: 'taxi', estilo: 'clasico', modo: 'lista', lista: '3, 7, 12-15, 40, 7', urlBase: 'app.cootransrural.com' });
{
  const r = await p.evaluate(() => ({
    moviles: window.stickers.leerMoviles().moviles,
    opciones: [...document.querySelectorAll('#movil-actual option')].map((o) => o.value),
    errorUrl: document.querySelector('#error-url').hidden ? '' : document.querySelector('#error-url').textContent,
    url: document.querySelector('#url-final').href,
    resumen: document.querySelector('#resumen').textContent,
  }));
  const visibles = await p.evaluate(() => ({ lista: !!document.querySelector('#lista').offsetParent, desde: !!document.querySelector('#desde').offsetParent }));
  ok(visibles.lista && !visibles.desde, 'modo lista: se ve el campo de lista y se esconden «Desde / Hasta»');
  ok(r.moviles.join(',') === '003,007,012,013,014,015,040', `lista «3, 7, 12-15, 40, 7» → ${r.moviles.join(', ')}`);
  ok(r.opciones.length === 7, 'el selector muestra los 7 móviles de la lista');
  ok(/https:\/\//.test(r.errorUrl) && r.url === `${COOP}descargar/?movil=003&o=sticker`, 'URL base inválida: avisa y el QR sigue con la página de la app');
  ok(/14\s*stickers/.test(r.resumen), `resumen con la lista: ${r.resumen.trim()}`);
  await poner({ lista: '3, siete' });
  ok(!(await p.evaluate(() => document.querySelector('#error-moviles').hidden)), 'avisa si la lista trae algo que no es un número');
}
// URL corta: el QR del taxi sigue con el código de al menos 9 cm.
{
  const q = await p.evaluate(() => {
    window.stickers.estado.urlBase = 'https://ct.co/d/';
    const e = window.stickers.escenaDe('001');
    window.stickers.estado.urlBase = '';
    return e.qr;
  });
  const codigo = (q.lado * q.modulos) / (q.modulos + 8);
  ok(codigo >= 90, `URL corta: código de ${(codigo / 10).toFixed(2)} cm con nivel ${q.nivel}`);
}

// SVG vectorial: tamaño en mm, fuentes incluidas y QR legible.
await poner({ formato: 'taxi', estilo: 'clasico', modo: 'rango', urlBase: '', movilActual: '023' });
{
  const { nombre, bytes } = await descargarCon('#descargar-svg');
  const svg = Buffer.from(bytes).toString('utf8');
  ok(/width="150mm" height="150mm"/.test(svg) && /viewBox="0 0 150 150"/.test(svg), `${nombre}: 150 × 150 mm`);
  ok(/@font-face\{font-family:'Sora'/.test(svg) && /data:font\/woff2;base64,/.test(svg), 'SVG con las fuentes incrustadas');
  ok(!/href="(?!data:)[^"#]/.test(svg), 'SVG autónomo (sin enlaces a archivos externos)');
  const [leido] = await leerQR(Buffer.from(svg).toString('base64'), 'image/svg+xml', [1400]);
  ok(leido === `${COOP}descargar/?movil=023&o=sticker`, `SVG: jsQR lee «${leido}»`);
}

// ---------------------------------------------------------------------------
// b) Hojas de impresión: tamaño de página y medidas exactas
// ---------------------------------------------------------------------------
console.log('\n— b) Hojas de impresión y PDF —');
const MEDIDAS = { taxi: [150, 150], espaldar: [100, 100], iman: [90, 55], afiche: [140, 216], tarjeta: [90, 50] };
const PAPEL = { carta: [215.9, 279.4], a4: [210, 297] };

async function medirImpresion(cambios) {
  await poner(cambios);
  await p.click('#imprimir');
  await p.waitForFunction(() => document.querySelectorAll('#impresion .hoja').length > 0);
  await p.emulateMedia({ media: 'print' });
  const r = await p.evaluate(() => {
    const hojas = [...document.querySelectorAll('#impresion .hoja')].map((h) => {
      const rh = h.getBoundingClientRect();
      return {
        w: rh.width,
        h: rh.height,
        piezas: [...h.querySelectorAll('.pieza')].map((el) => {
          const re = el.getBoundingClientRect();
          return { x: re.left - rh.left, y: re.top - rh.top, w: re.width, h: re.height, movil: el.dataset.movil };
        }),
      };
    });
    return { hojas, regla: document.querySelector('#estilo-pagina').textContent, impresiones: window.__impresiones || 0 };
  });
  return r;
}

function revisarMedidas(r, formato, papel, esperadas) {
  const [wP, hP] = PAPEL[papel];
  const [wS, hS] = MEDIDAS[formato];
  ok(r.hojas.length === esperadas.hojas, `${formato} en ${papel}: ${r.hojas.length} hojas (esperadas ${esperadas.hojas})`);
  ok(r.hojas.every((h) => cerca(h.w / PX_MM, wP) && cerca(h.h / PX_MM, hP)), `${formato}: cada hoja mide ${wP} × ${hP} mm en la vista de impresión`);
  const piezas = r.hojas.flatMap((h) => h.piezas);
  ok(piezas.length === esperadas.stickers, `${formato}: ${piezas.length} stickers en total`);
  ok(piezas.every((s) => cerca(s.w / PX_MM, wS) && cerca(s.h / PX_MM, hS)), `${formato}: cada sticker mide ${wS} × ${hS} mm (${(piezas[0].w / PX_MM).toFixed(2)} × ${(piezas[0].h / PX_MM).toFixed(2)} mm medidos)`);
  ok(piezas.every((s) => s.x >= 4 && s.y >= 4 && s.x + s.w <= wP * PX_MM - 4 * PX_MM + 0.5 && s.y + s.h <= hP * PX_MM - 4 * PX_MM + 0.5), `${formato}: todos quedan dentro de la hoja con margen`);
  const choques = r.hojas.some((h) => h.piezas.some((a, i) => h.piezas.some((b, j) => j > i && a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5)));
  ok(!choques, `${formato}: ningún sticker se monta sobre otro`);
  ok(r.regla.includes(`size: ${wP}mm ${hP}mm`) && r.regla.includes('margin: 0'), `${formato}: @page { ${r.regla.match(/size:[^;]+/)[0]}; margin: 0 }`);
}

async function pdf(nombre, papel, esperadas) {
  const ruta = `${DIR}hoja-${nombre}.pdf`;
  await p.pdf({ path: ruta, preferCSSPageSize: true, printBackground: true });
  const info = execFileSync('pdfinfo', [ruta]).toString();
  const paginas = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const [, wPt, hPt] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info).map(Number);
  const [wMm, hMm] = PAPEL[papel];
  ok(paginas === esperadas.hojas, `PDF ${nombre}: ${paginas} páginas`);
  ok(cerca(wPt, (wMm * 72) / 25.4, 0.6) && cerca(hPt, (hMm * 72) / 25.4, 0.6), `PDF ${nombre}: página de ${wPt} × ${hPt} pt = ${((wPt * 25.4) / 72).toFixed(1)} × ${((hPt * 25.4) / 72).toFixed(1)} mm (${papel})`);
  // Imagen de la primera página para mirarla y leer el QR desde el PDF.
  execFileSync('pdftoppm', ['-r', '110', '-png', '-f', '1', '-l', '1', '-singlefile', ruta, `${DIR}hoja-${nombre}`]);
  return `${DIR}hoja-${nombre}.png`;
}

// 1) Taxi, móviles 001–004, 2 copias, carta: 8 hojas (1 por hoja).
{
  const r = await medirImpresion({ formato: 'taxi', estilo: 'clasico', modo: 'rango', desde: 1, hasta: 4, copias: { taxi: 2, espaldar: 1, iman: 1, afiche: 1, tarjeta: 1 }, papel: 'carta', sangrado: true, urlBase: '' });
  ok(r.impresiones >= 1, 'el botón «Imprimir / Guardar PDF» abre la impresión');
  revisarMedidas(r, 'taxi', 'carta', { hojas: 8, stickers: 8 });
  ok(r.hojas[0].piezas[0].movil === '001' && r.hojas[1].piezas[0].movil === '001' && r.hojas[2].piezas[0].movil === '002', 'taxi: 2 copias seguidas de cada móvil');
  await p.screenshot({ path: DIR + 'impresion-taxi-carta.png', fullPage: true, clip: { x: 0, y: 0, width: 216 * PX_MM, height: 280 * PX_MM } });
  const png = await pdf('taxi-carta', 'carta', { hojas: 8 });
  const [leido] = await leerQR(readFileSync(png).toString('base64'), 'image/png', [null]);
  ok(leido === `${COOP}descargar/?movil=001&o=sticker`, `PDF taxi: el QR impreso se lee «${leido}»`);
  await p.emulateMedia({ media: 'screen' });
}

// 2) Espaldar 10 × 10, carta: 4 por hoja (pegados).
{
  const r = await medirImpresion({ formato: 'espaldar', estilo: 'neon', desde: 1, hasta: 6, papel: 'carta' });
  revisarMedidas(r, 'espaldar', 'carta', { hojas: 2, stickers: 6 });
  await pdf('espaldar-carta', 'carta', { hojas: 2 });
  await p.emulateMedia({ media: 'screen' });
}

// 3) Imán, A4.
{
  const r = await medirImpresion({ formato: 'iman', estilo: 'verde', desde: 1, hasta: 12, papel: 'a4' });
  const porHoja = r.hojas[0].piezas.length;
  revisarMedidas(r, 'iman', 'a4', { hojas: Math.ceil(12 / porHoja), stickers: 12 });
  await pdf('iman-a4', 'a4', { hojas: Math.ceil(12 / porHoja) });
  await p.emulateMedia({ media: 'screen' });
}

// 4) Afiche media carta, carta.
{
  const r = await medirImpresion({ formato: 'afiche', estilo: 'clasico', desde: 5, hasta: 6, papel: 'carta' });
  revisarMedidas(r, 'afiche', 'carta', { hojas: 2, stickers: 2 });
  const png = await pdf('afiche-carta', 'carta', { hojas: 2 });
  const [leido] = await leerQR(readFileSync(png).toString('base64'), 'image/png', [null]);
  ok(leido === `${COOP}descargar/?movil=005&o=sticker`, `PDF afiche: el QR impreso se lee «${leido}»`);
  await p.emulateMedia({ media: 'screen' });
}

// 5) Tarjetas: 10 por hoja carta (2 × 5).
{
  const r = await medirImpresion({ formato: 'tarjeta', estilo: 'clasico', desde: 1, hasta: 12, papel: 'carta' });
  revisarMedidas(r, 'tarjeta', 'carta', { hojas: 2, stickers: 12 });
  ok(r.hojas[0].piezas.length === 10, 'tarjeta: 10 por hoja carta');
  await pdf('tarjeta-carta', 'carta', { hojas: 2 });
  await p.emulateMedia({ media: 'screen' });
}

// ---------------------------------------------------------------------------
// c) Capturas de la vista previa de cada formato
// ---------------------------------------------------------------------------
console.log('\n— c) Capturas —');
await poner({ modo: 'rango', desde: 1, hasta: 52, urlBase: '', papel: 'carta', movilActual: '023' });
for (const estilo of ['clasico', 'verde', 'neon']) {
  for (const formato of Object.keys(MEDIDAS)) {
    await poner({ formato, estilo, movilActual: '023' });
    await p.waitForFunction(() => /verificado/i.test(document.querySelector('#chip-lectura')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
    const verificado = /verificado/i.test(await p.textContent('#chip-lectura'));
    ok(verificado, `vista previa ${formato} (${estilo}): QR verificado en pantalla`);
    await (await p.$('#vista-sticker svg')).screenshot({ path: `${DIR}vista-${formato}-${estilo}.png` });
  }
}
await poner({ formato: 'taxi', estilo: 'clasico' });
await p.screenshot({ path: DIR + 'pagina-completa.png', fullPage: true });

// Celular.
const movilCtx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await movilCtx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
const pm = await movilCtx.newPage();
pm.on('pageerror', (e) => errores.push('celular pageerror: ' + e.message));
await pm.goto(BASE + 'stickers/');
await pm.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 20000 });
await pm.waitForTimeout(600);
const desborde = await pm.evaluate(() => document.documentElement.scrollWidth - 390);
ok(desborde <= 1, `celular: sin desborde horizontal (${desborde} px)`);
await pm.screenshot({ path: DIR + 'celular.png', fullPage: true });
await movilCtx.close();

ok(errores.length === 0, 'sin errores de JS' + (errores.length ? ':\n  ' + errores.join('\n  ') : ''));
await navegador.close();
console.log(`\n${fallas ? `✘ ${fallas} comprobaciones fallaron` : '✔ Todo bien'} · capturas en ${DIR}`);
writeFileSync(DIR + 'resultado.txt', fallas ? `fallas: ${fallas}\n` : 'ok\n');
