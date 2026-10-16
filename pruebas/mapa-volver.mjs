// El mapa al volver a la app (13-oct-2026, Oscar en el iPhone): con la app en segundo plano y Face ID al volver, el mapa
// quedaba en blanco hasta cerrar y abrir la app. Aquí se reproduce en Chromium lo que hace el WKWebView, con el mapa de
// Mapbox (el de producción; las teselas las sirve la prueba):
//  a) el mapa se queda sin tamaño mientras la app está oculta y vuelve sin un «resize» (en Chromium las teselas siguen ahí;
//     se comprueba que al volver se acomoda y se ve);
//  b) las teselas que se piden con la app oculta fallan (el iPhone corta la red al suspenderla) y no se reintentan;
//  c) se quita el bloqueo de Face ID (evento ct-desbloqueo).
// 15-oct (seguía en blanco «cuando está vario tiempo en reposo o segundo plano»):
//  d) oculta más de 30 s: el mapa se pide completo otra vez (el iPhone suelta las imágenes); un momento oculta, no;
//  e) la red tarda en volver: las teselas fallan con la app YA a la vista y se reintentan solas hasta verse;
//  f) al volver la conexión (online) se piden enseguida, sin esperar el siguiente reintento;
//  g) si Mapbox no responde nunca (token vencido), pasa a OpenStreetMap después de dos reintentos.
// Al volver (visibilitychange, pageshow, «resume» de Capacitor, ct-desbloqueo u online) nucleo/mapa.js acomoda el tamaño y
// vuelve a pedir lo que falte, y una tesela cargada siempre se ve (opacidad 1).
// Uso: node pruebas/mapa-volver.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5695). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5695/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/mapa-volver/capturas').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const t0 = Date.now();

// Un PNG de 256 × 256 de un solo color (la «tesela» del servidor falso).
function png(r, g, b) {
  const crc = (buf) => {
    let c = ~0;
    for (const x of buf) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const t = Buffer.from(tipo);
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, datos])));
    return Buffer.concat([largo, t, datos, c]);
  };
  const lado = 256;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const fila = Buffer.alloc(1 + lado * 3);
  for (let x = 0; x < lado; x++) fila.set([r, g, b], 1 + x * 3);
  const crudo = Buffer.concat(Array.from({ length: lado }, () => fila));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo)), trozo('IEND', Buffer.alloc(0))]);
}
const TESELA = png(120, 180, 120);

const navegador = await chromium.launch({ executablePath: EXE });
const errores = [];
try {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  let red = 'bien'; // 'bien' | 'caida'
  let mapbox = 'bien'; // 'bien' | 'mal' (403, como con el token vencido)
  const pedidas = [];
  await ctx.route(/tile|tiles/, (r) => {
    const url = r.request().url();
    pedidas.push(url);
    if (red !== 'bien') return r.abort('internetdisconnected');
    if (mapbox === 'mal' && url.includes('api.mapbox.com')) return r.fulfill({ status: 403, body: 'Forbidden' });
    return r.fulfill({ status: 200, contentType: 'image/png', body: TESELA });
  });
  // Una página con el mapa en un contenedor propio, con nucleo/mapa.js tal cual y Mapbox como en taxicun.com.
  const abrir = async () => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(`${BASE}privacidad/`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      localStorage.setItem('taxicun.mapbox', '1');
      document.body.replaceChildren();
      const d = document.createElement('div');
      d.id = 'mapa';
      d.style.cssText = 'width:390px;height:700px';
      document.body.append(d);
      // Lo que el iPhone hace: document.hidden se puede «poner» desde la prueba, y el reloj adelantar.
      let oculta = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
      globalThis.ponerOculta = (v) => {
        oculta = v;
        document.dispatchEvent(new Event('visibilitychange'));
      };
      const ahora = Date.now.bind(Date);
      let desfase = 0;
      Date.now = () => ahora() + desfase;
      globalThis.adelantar = (ms) => (desfase += ms);
      const { crearMapa } = await import('/nucleo/mapa.js');
      globalThis.elMapa = await crearMapa(d, { controles: false });
    });
    const cargadas = (servidor = '') => p.evaluate((servidor) => {
      const d = document.getElementById('mapa');
      const caja = d.getBoundingClientRect();
      return [...d.querySelectorAll('img.leaflet-tile-loaded')].filter((i) => {
        const r = i.getBoundingClientRect();
        return i.src.includes(servidor) && r.right > caja.left && r.left < caja.right && r.bottom > caja.top && r.top < caja.bottom && getComputedStyle(i).opacity === '1';
      }).length;
    }, servidor);
    const esperarCargadas = async (ms = 4000, servidor = '') => {
      const fin = Date.now() + ms;
      while (Date.now() < fin) {
        if ((await cargadas(servidor)) > 0) return true;
        await p.waitForTimeout(100);
      }
      return false;
    };
    return { p, cargadas, esperarCargadas };
  };

  const { p, cargadas, esperarCargadas } = await abrir();
  ok(await esperarCargadas(), 'al abrir: el mapa tiene teselas a la vista');
  ok(pedidas.some((u) => u.includes('api.mapbox.com')), 'el mapa es el de Mapbox (como en producción)');
  await p.screenshot({ path: `${DIR}1-al-abrir.png` });

  // a) Segundo plano: el contenedor queda sin tamaño y Leaflet se entera (resize); vuelve con su tamaño SIN otro resize.
  await p.evaluate(() => {
    globalThis.ponerOculta(true);
    document.getElementById('mapa').style.display = 'none';
    window.dispatchEvent(new Event('resize'));
  });
  await p.waitForTimeout(400);
  await p.evaluate(() => {
    document.getElementById('mapa').style.display = '';
  });
  await p.evaluate(() => globalThis.ponerOculta(false));
  ok(await esperarCargadas(), 'a) al volver a la app (visibilitychange), el mapa se acomoda y vuelve a tener teselas');
  await p.screenshot({ path: `${DIR}2-a-volvio.png` });

  // b) Las teselas pedidas con la app oculta fallan (sin red) y no se reintentan solas.
  await p.evaluate(() => globalThis.ponerOculta(true));
  red = 'caida';
  let antes = pedidas.length;
  await p.evaluate(() => globalThis.elMapa.centrar({ lat: 4.8700, lng: -74.2900 }, 15, { animar: false }));
  await p.waitForTimeout(800);
  ok(pedidas.length > antes, `b) con la app oculta se pidieron teselas nuevas (${pedidas.length - antes}) y fallaron`);
  ok((await cargadas()) === 0, 'b) reproducido: las teselas que fallaron dejan el mapa en blanco');
  red = 'bien';
  await p.evaluate(() => globalThis.ponerOculta(false));
  ok(await esperarCargadas(), 'b) al volver, las teselas que fallaron estando oculta se piden otra vez y se ven');
  await p.screenshot({ path: `${DIR}3-b-volvio.png` });

  // c) Se quita el bloqueo de Face ID (disenos/a/nativa.js manda ct-desbloqueo).
  await p.evaluate(() => {
    document.getElementById('mapa').style.display = 'none';
    window.dispatchEvent(new Event('resize'));
  });
  await p.waitForTimeout(300);
  await p.evaluate(() => {
    document.getElementById('mapa').style.display = '';
    window.dispatchEvent(new Event('ct-desbloqueo'));
  });
  ok(await esperarCargadas(), 'c) al quitarse el bloqueo de Face ID, el mapa se acomoda y tiene teselas');
  await p.waitForTimeout(1700);

  // d) Un momento oculta: no se pide nada otra vez. Más de 30 s oculta: el mapa se pide completo (en el iPhone las
  //    imágenes ya cargadas pueden quedar en blanco y Leaflet las cree dibujadas).
  antes = pedidas.length;
  // (Chromium las saca de su memoria sin pedirlas otra vez: se marcan las imágenes y se mira que sean otras.)
  const marcar = () => p.evaluate(() => document.querySelectorAll('#mapa img.leaflet-tile').forEach((i) => (i.dataset.vieja = '1')));
  const viejas = () => p.evaluate(() => document.querySelectorAll('#mapa img.leaflet-tile[data-vieja]').length);
  await marcar();
  await p.evaluate(() => globalThis.ponerOculta(true));
  await p.waitForTimeout(200);
  await p.evaluate(() => globalThis.ponerOculta(false));
  await p.waitForTimeout(1800);
  const quedan = await viejas();
  ok(pedidas.length === antes && quedan > 0, `d) oculta un momento: al volver no se vuelve a pedir nada (${pedidas.length - antes} pedidas, ${quedan} imágenes siguen)`);
  await p.evaluate(() => {
    globalThis.ponerOculta(true);
    globalThis.adelantar(45_000);
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => globalThis.ponerOculta(false));
  await p.waitForTimeout(1000);
  ok((await viejas()) === 0, `d) oculta 45 s: al volver el mapa se pide completo otra vez (quedan ${await viejas()} imágenes viejas)`);
  ok(await esperarCargadas(), 'd) y se ve');
  const diagD = await p.evaluate(() => globalThis.elMapa.diagnostico());
  ok(/vuelve \(visibilitychange\) tras \d+ s oculta/.test(diagD) && /se piden otra vez las teselas \(al volver: estuvo oculta un rato largo\)/.test(diagD), 'diagnóstico: anota cuándo se ocultó, cuándo volvió y que se pidió el mapa completo');

  // e) La red del iPhone tarda en volver: las teselas fallan con la app YA a la vista. Antes quedaba en blanco para siempre.
  red = 'caida';
  await p.evaluate(() => globalThis.elMapa.centrar({ lat: 4.9500, lng: -74.1000 }, 15, { animar: false }));
  await p.waitForTimeout(700);
  ok((await cargadas()) === 0, 'e) reproducido: con la app a la vista las teselas fallan y el mapa queda en blanco');
  await p.screenshot({ path: `${DIR}4-e-sin-red.png` });
  red = 'bien';
  ok(await esperarCargadas(5000), 'e) sin tocar nada, el mapa reintenta solo y se ve');
  await p.screenshot({ path: `${DIR}5-e-reintento.png` });

  // f) Sin conexión un rato: fallan el pedido y dos reintentos (1,5 s y 4 s; el siguiente sería a los 10 s). Al volver la
  //    conexión (online) se piden enseguida.
  red = 'caida';
  await p.evaluate(() => globalThis.elMapa.centrar({ lat: 4.9900, lng: -74.0500 }, 15, { animar: false }));
  await ctx.setOffline(true);
  await p.waitForTimeout(6500);
  ok((await cargadas()) === 0, 'f) sin conexión: el mapa sigue en blanco');
  red = 'bien';
  await ctx.setOffline(false);
  ok(await esperarCargadas(2500), 'f) al volver la conexión (online), las teselas se piden enseguida y se ven');

  // Diagnóstico en pantalla (16-oct): lo que hay a la vista y los últimos sucesos.
  const diag = await p.evaluate(() => {
    globalThis.elMapa.mostrarDiagnostico();
    return document.querySelector('.ct-diag-mapa pre')?.textContent || '';
  });
  ok(/encima: el mapa en 9 de 9 puntos\n/.test(diag) && /a la vista 6 cargadas, 0 fallidas/.test(diag), 'diagnóstico: dice qué hay encima del mapa y cuántas teselas se ven');
  ok(/vuelve \(online\)/.test(diag) && /reintento 2/.test(diag) && /Sucesos \(el último primero\):\n.*cargaron: 6 a la vista/.test(diag), 'diagnóstico: los reintentos y la vuelta de la conexión, el último suceso primero');
  console.log(diag.split('\n').map((l) => `    │ ${l}`).join('\n'));
  await p.screenshot({ path: `${DIR}7-diagnostico.png` });
  const rehecho = await p.evaluate(async () => {
    document.querySelector('.ct-diag-mapa [data-rehacer]').click();
    await new Promise((r) => setTimeout(r, 1500));
    const t = document.querySelector('.ct-diag-mapa pre').textContent;
    document.querySelector('.ct-diag-mapa [data-cerrar]').click();
    return { t, queda: Boolean(document.querySelector('.ct-diag-mapa')) };
  });
  ok(/Rehacer el mapa/.test(rehecho.t) && !rehecho.queda, '«Rehacer el mapa» vuelve a poner la capa y «Cerrar» quita el recuadro');
  ok(await esperarCargadas(), 'después de rehacer, el mapa se ve');

  // Una tesela cargada siempre se ve, aunque el desvanecido de Leaflet no haya terminado (requestAnimationFrame se
  // detiene en segundo plano).
  const opacidad = await p.evaluate(() => {
    const i = document.querySelector('#mapa img.leaflet-tile-loaded');
    i.style.opacity = '0';
    return getComputedStyle(i).opacity;
  });
  ok(opacidad === '1', `una tesela cargada se ve aunque Leaflet le deje opacidad 0 (${opacidad})`);

  // Destruir el mapa suelta los oyentes: volver a la app no hace nada ni da errores.
  await p.evaluate(() => {
    globalThis.elMapa.destruir();
    globalThis.ponerOculta(true);
    globalThis.ponerOculta(false);
    window.dispatchEvent(new Event('ct-desbloqueo'));
    window.dispatchEvent(new Event('online'));
  });
  await p.waitForTimeout(1700);

  // g) Mapbox no responde nunca (403): primero se reintenta (puede ser la red) y después pasa a OpenStreetMap.
  mapbox = 'mal';
  const g = await abrir();
  await g.p.waitForTimeout(1000);
  ok((await g.cargadas()) === 0 && !pedidas.slice(-30).some((u) => u.includes('openstreetmap')), 'g) Mapbox falla: no pasa a OpenStreetMap en el primer intento');
  ok(await g.esperarCargadas(9000, 'openstreetmap'), 'g) después de dos reintentos sin nada, el mapa sale de OpenStreetMap');
  await g.p.screenshot({ path: `${DIR}6-g-respaldo.png` });
  ok(errores.length === 0, `sin errores de JavaScript (${errores.join(' | ')})`);
} finally {
  await navegador.close();
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · el mapa al volver a la app · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - t0) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
