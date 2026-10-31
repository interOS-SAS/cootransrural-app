// El GPS del pasajero al abrir la app (31-oct-2026, Oscar: «lo toma y me manda casi siempre al paradero»). Al abrir, la app
// pedía la ubicación una vez con 6 s de espera; en el iPhone la primera lectura suele tardar más, así que se usaba el paradero
// (o el centro) y el GPS no se volvía a pedir hasta tocar «mi ubicación». Además el punto azul se pintaba en el paradero,
// como si la persona estuviera ahí. Aquí, en Chromium, la primera lectura no llega a tiempo y el seguimiento entrega la
// posición unos segundos después:
//  a) mientras no hay GPS: sale el aviso («Usamos el …») y NO hay punto azul;
//  b) cuando llega la lectura: aparece el punto azul donde está la persona, el aviso se quita y el pin va hasta allá;
//  c) con el GPS a tiempo: ni aviso ni paradero, el pin donde está la persona.
// Uso: node pruebas/gps-pasajero-abrir.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5695).
const { chromium } = await import(process.env.PLAYWRIGHT_CORE || '/root/proyectos/_trabajo-taxicun/contrato-firma/npm/node_modules/playwright-core/index.mjs');

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5695/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
// La Calera (demo): el centro de la ficha y la persona a unos 330 m (más de los 40 m con los que el pin la sigue).
const CENTRO = { lat: 4.720135, lng: -73.968955 };
const PERSONA = { lat: CENTRO.lat + 0.003, lng: CENTRO.lng };

let bien = 0;
let fallas = 0;
const metros = (a, b) => (a && b ? Math.round(Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180))) : Infinity);
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};

const navegador = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const errores = [];

// GPS falso: getCurrentPosition contesta (o vence) a los msLectura; watchPosition entrega la posición a los msSeguir.
async function abrir({ msLectura, msSeguir }) {
  const ctx = await navegador.newContext({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'es-CO' });
  await ctx.addInitScript(({ persona, msLectura, msSeguir }) => {
    // Para leer el mapa desde la prueba: cada L.map() que cree la app queda en window.__mapas.
    Object.defineProperty(window, 'L', {
      configurable: true,
      get() { return undefined; },
      set(v) {
        const crear = v.map;
        v.map = function (...args) {
          const m = crear.apply(this, args);
          (window.__mapas ||= []).push(m);
          return m;
        };
        Object.defineProperty(window, 'L', { value: v, writable: true, configurable: true });
      },
    });
    const lectura = () => ({ coords: { latitude: persona.lat, longitude: persona.lng, accuracy: 12 }, timestamp: Date.now() });
    const geo = navigator.geolocation;
    geo.getCurrentPosition = (ok, no, o) => {
      const espera = o?.timeout ?? 8000;
      if (msLectura <= espera) setTimeout(() => ok(lectura()), msLectura);
      else setTimeout(() => no({ code: 3, message: 'Timeout expired' }), espera);
    };
    let n = 0;
    const vivos = new Set();
    geo.watchPosition = (ok) => {
      const id = ++n;
      vivos.add(id);
      setTimeout(() => vivos.has(id) && ok(lectura()), msSeguir);
      return id;
    };
    geo.clearWatch = (id) => vivos.delete(id);
  }, { persona: PERSONA, msLectura, msSeguir });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto(`${BASE}la-calera/app/`);
  await p.waitForSelector('.a-app .leaflet-container', { timeout: 20000 });
  const estado = () => p.evaluate(() => {
    const yo = document.querySelector('.ct-yo');
    const pin = document.querySelector('.a-pin');
    const aviso = document.querySelector('[data-aviso-gps]');
    const caja = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, abajo: r.bottom };
    };
    // Dónde cae la punta del pin en el mapa, y dónde está el punto azul.
    const m = (window.__mapas || []).at(-1);
    let bajoPin = null;
    let puntoAzul = null;
    if (m && pin) {
      const r = pin.getBoundingClientRect();
      const c = m.getContainer().getBoundingClientRect();
      const ll = m.containerPointToLatLng([r.left + r.width / 2 - c.left, r.bottom - c.top]);
      bajoPin = { lat: ll.lat, lng: ll.lng };
      m.eachLayer((l) => { if (l.options?.icon?.options?.className === 'ct-yo') { const q = l.getLatLng(); puntoAzul = { lat: q.lat, lng: q.lng }; } });
    }
    return { yo: caja(yo), pin: caja(pin), aviso: aviso ? !aviso.hidden : null, bajoPin, puntoAzul };
  });
  return { ctx, p, estado };
}

try {
  // a) y b): la primera lectura no llega en 6 s; el seguimiento entrega la posición a los 9 s.
  const a = await abrir({ msLectura: 60000, msSeguir: 9000 });
  await a.p.waitForTimeout(7000);
  const antes = await a.estado();
  ok(antes.aviso === true, 'a) sin GPS a tiempo: sale el aviso «Usamos el …»');
  ok(!antes.yo, 'a) y no se pinta el punto azul (el respaldo no es la persona)');
  let despues = antes;
  for (let i = 0; i < 40 && !(despues.yo && despues.aviso === false); i++) {
    await a.p.waitForTimeout(250);
    despues = await a.estado();
  }
  ok(Boolean(despues.yo), 'b) cuando llega la lectura, aparece el punto azul');
  ok(despues.aviso === false, 'b) y el aviso se quita');
  await a.p.waitForTimeout(800);
  despues = await a.estado();
  ok(metros(despues.puntoAzul, PERSONA) < 5, `b) el punto azul está donde está la persona (a ${metros(despues.puntoAzul, PERSONA)} m)`);
  ok(metros(despues.bajoPin, PERSONA) < 30, `b) y el pin de recogida va hasta allá (a ${metros(despues.bajoPin, PERSONA)} m; antes se quedaba en el paradero o el centro)`);
  await a.p.screenshot({ path: '/tmp/claude-0/gps-pasajero-abrir-b.png' }).catch(() => {});
  await a.ctx.close();

  // c) el GPS contesta a tiempo.
  const c = await abrir({ msLectura: 1200, msSeguir: 1500 });
  await c.p.waitForTimeout(4000);
  const e = await c.estado();
  ok(e.aviso === false && metros(e.puntoAzul, PERSONA) < 5 && metros(e.bajoPin, PERSONA) < 30, `c) con el GPS a tiempo: sin aviso, punto azul y pin donde está la persona (${metros(e.bajoPin, PERSONA)} m)`);
  await c.ctx.close();
  ok(errores.length === 0, `sin errores de JavaScript (${errores.join(' | ')})`);
} finally {
  await navegador.close();
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · el GPS del pasajero al abrir · ${bien} ✔ · ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
