// Los taxis al hacer zoom (13-oct-2026, Oscar): al acercar o alejar, los taxis no quedaban pegados al mapa: «viajaban» a
// su nuevo lugar en pantalla durante un segundo (la transición suave de .ct-taxi-marcador) y caían después. Aquí se hace
// zoom con animación y se mide dónde está el taxi justo al terminar el zoom y un rato después: tiene que ser el mismo
// lugar. Durante el zoom el mapa tiene la clase ct-haciendo-zoom y la transición está apagada; después vuelve (para que
// el taxi siga moviéndose suave cuando cambia de posición).
// Uso: node pruebas/mapa-zoom.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5698). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5698/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/mapa-zoom/capturas').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const t0 = Date.now();
const navegador = await chromium.launch({ executablePath: EXE });
const errores = [];
try {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await ctx.route(/tile|tiles/, (r) => r.abort());
  await p.goto(`${BASE}privacidad/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(async () => {
    document.body.replaceChildren();
    const d = document.createElement('div');
    d.id = 'mapa';
    d.style.cssText = 'width:390px;height:700px';
    document.body.append(d);
    const { crearMapa } = await import('/nucleo/mapa.js');
    globalThis.elMapa = await crearMapa(d, { controles: false, centro: { lat: 4.927969, lng: -74.173964 }, zoom: 15 });
    globalThis.elMapa.ponerTaxi('t1', { lat: 4.9300, lng: -74.1712 }, { etiqueta: 'Móvil 901' });
    globalThis.elMapa.ponerTaxi('t2', { lat: 4.9395, lng: -74.1665 }, { etiqueta: 'Móvil 902' });
  });
  await p.waitForTimeout(1500); // los taxis quedan quietos en su sitio
  const donde = () => p.evaluate(() => [...document.querySelectorAll('#mapa .ct-taxi-marcador')].map((m) => {
    const r = m.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }));
  const transicion = () => p.evaluate(() => getComputedStyle(document.querySelector('#mapa .ct-taxi-marcador')).transitionDuration);
  ok((await transicion()) === '1s', `sin zoom, el taxi se mueve suave entre posiciones (transition ${await transicion()})`);

  // Con animación (los botones, la rueda) y sin animación (como el pellizco del celular, que mueve los taxis cuadro a
  // cuadro sin la animación de Leaflet: ahí se veía el salto).
  for (const [z, nombre, animar] of [[17, 'acercar', true], [13, 'alejar', true], [16, 'pellizco: acercar', false], [14, 'pellizco: alejar', false]]) {
    const durante = !animar ? Promise.resolve('0s') : p.evaluate(() => new Promise((r) => {
      const d = document.getElementById('mapa');
      const ver = () => (d.classList.contains('ct-haciendo-zoom') ? r(getComputedStyle(d.querySelector('.ct-taxi-marcador')).transitionDuration) : requestAnimationFrame(ver));
      ver();
      setTimeout(() => r('sin clase'), 1500);
    }));
    await p.evaluate(([zz, an]) => globalThis.elMapa.centrar({ lat: 4.927969, lng: -74.173964 }, zz, { animar: an }), [z, animar]);
    if (animar) ok((await durante) === '0s', `${nombre}: durante el zoom la transición está apagada (${await durante})`);
    await p.waitForFunction(() => !document.querySelector('#mapa .leaflet-zoom-anim'), null, { timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(animar ? 120 : 30);
    const alTerminar = await donde();
    await p.waitForTimeout(1500);
    const despues = await donde();
    const salto = Math.max(...alTerminar.map((a, i) => Math.hypot(a.x - despues[i].x, a.y - despues[i].y)));
    ok(salto <= 2, `${nombre}: al terminar el zoom los taxis ya están en su sitio (se movieron ${Math.round(salto)} px después)`);
    ok((await transicion()) === '1s', `${nombre}: después del zoom vuelve la transición suave`);
  }
  await p.screenshot({ path: `${DIR}zoom.png` });
  // Un taxi que cambia de posición (sin zoom) se sigue moviendo suave.
  const antes = await donde();
  await p.evaluate(() => globalThis.elMapa.ponerTaxi('t1', { lat: 4.9420, lng: -74.1600 }, { etiqueta: 'Móvil 901' }));
  await p.waitForTimeout(300);
  const aMitad = await donde();
  await p.waitForTimeout(1300);
  const alFinal = await donde();
  const recorrido = Math.hypot(alFinal[0].x - antes[0].x, alFinal[0].y - antes[0].y);
  const hecho = Math.hypot(aMitad[0].x - antes[0].x, aMitad[0].y - antes[0].y);
  ok(recorrido > 20 && hecho > 0 && hecho < recorrido - 2, `sin zoom, el taxi va de un lugar al otro poco a poco (a los 300 ms: ${Math.round(hecho)} de ${Math.round(recorrido)} px)`);
  ok(errores.length === 0, `sin errores de JavaScript (${errores.join(' | ')})`);
} finally {
  await navegador.close();
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · los taxis al hacer zoom · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - t0) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
