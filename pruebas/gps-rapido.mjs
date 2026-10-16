// La lectura rápida del GPS en iPhone (16-oct-2026, Oscar: «Ponerte en turno» se quedaba ~20 s en «Buscando tu
// ubicación…»). En iPhone, getCurrentPosition del plugin usa requestLocation() con la máxima precisión: dentro de un carro
// tarda o agota el plazo. Aquí el plugin Geolocation se simula como en el iPhone: getCurrentPosition tarda 9 s y
// watchPosition entrega primero la ubicación guardada (vieja) y luego lecturas nuevas.
//  1) rapida: sale la primera lectura nueva de 65 m o mejor (no la guardada) en menos de 1 s, y se suelta el seguimiento;
//  2) solo lecturas de 120 m: a los 3 s vale la de 120 m;
//  3) solo de 400 m: al cumplirse el plazo, la mejor que llegó;
//  4) sin lecturas: «se acabó el tiempo» (código 3) y el seguimiento suelto;
//  5) sin permiso: código 1 enseguida;
//  6) sin rapida, y en Android con rapida: getCurrentPosition, como siempre.
// Uso: node pruebas/gps-rapido.mjs [url_base]   (node pruebas/servidor-local.mjs --puerto=5695)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5695/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const t0 = Date.now();

// El plugin Geolocation del iPhone, simulado. window.__gps: { permiso, lecturas: [{ ms, precision, viejaS }], unaVezMs }
function capacitorFalso(plataforma) {
  const gps = (window.__gps = { permiso: 'granted', lecturas: [], unaVezMs: 9000, llamadas: [], activos: new Map() });
  let ultimo = 0;
  const lectura = (precision, viejaS = 0) => ({
    timestamp: Date.now() - viejaS * 1000,
    coords: { latitude: 4.9268, longitude: -74.1713, accuracy: precision, altitude: 2600, speed: 0, course: -1, heading: null },
  });
  const Geolocation = {
    async checkPermissions() {
      return { location: gps.permiso, coarseLocation: gps.permiso };
    },
    async requestPermissions() {
      return { location: gps.permiso, coarseLocation: gps.permiso };
    },
    getCurrentPosition() {
      gps.llamadas.push('getCurrentPosition');
      return new Promise((ok) => setTimeout(() => ok(lectura(8)), gps.unaVezMs));
    },
    async watchPosition(op, cb) {
      gps.llamadas.push('watchPosition');
      const id = String((ultimo += 1));
      const relojes = gps.lecturas.map((l) => setTimeout(() => gps.activos.has(id) && cb(lectura(l.precision, l.viejaS || 0)), l.ms));
      gps.activos.set(id, relojes);
      return id;
    },
    async clearWatch({ id }) {
      (gps.activos.get(id) || []).forEach(clearTimeout);
      gps.activos.delete(id);
    },
  };
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => plataforma, isPluginAvailable: (n) => n === 'Geolocation', Plugins: { Geolocation } };
}

const navegador = await chromium.launch({ executablePath: EXE });
const errores = [];
try {
  const abrir = async (plataforma) => {
    const ctx = await navegador.newContext();
    await ctx.addInitScript(capacitorFalso, plataforma);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(`${BASE}privacidad/`, { waitUntil: 'domcontentloaded' });
    await p.evaluate(async () => {
      globalThis.__plat = await import('/nucleo/plataforma.js');
    });
    return p;
  };
  // Una lectura: { ms, p (lectura) o e (error), llamadas, activos al terminar }.
  const leer = (p, gps, opciones) => p.evaluate(async ({ gps, opciones }) => {
    Object.assign(window.__gps, gps, { llamadas: [] });
    const t = performance.now();
    let r;
    try {
      r = { p: await globalThis.__plat.posicion(opciones) };
    } catch (e) {
      r = { e };
    }
    await new Promise((ok) => setTimeout(ok, 50));
    return { ...r, ms: Math.round(performance.now() - t), llamadas: window.__gps.llamadas, activos: window.__gps.activos.size };
  }, { gps, opciones });

  const ios = await abrir('ios');
  const conViejaYBuenas = [{ ms: 50, precision: 10, viejaS: 120 }, { ms: 600, precision: 48 }, { ms: 1500, precision: 8 }];
  let r = await leer(ios, { lecturas: conViejaYBuenas }, { espera: 7000, rapida: true });
  ok(r.p && r.p.precision === 48 && r.ms < 1000, `1) iPhone, rápida: la primera lectura nueva de 48 m en ${r.ms} ms (no la guardada de hace 2 min)`);
  ok(!r.llamadas.includes('getCurrentPosition') && r.activos === 0, `1) sin requestLocation y el seguimiento suelto (${r.llamadas.join(', ')}; activos ${r.activos})`);

  r = await leer(ios, { lecturas: [{ ms: 400, precision: 120 }, { ms: 900, precision: 130 }] }, { espera: 7000, rapida: true });
  ok(r.p && r.p.precision === 120 && r.ms >= 2900 && r.ms < 3600 && r.activos === 0, `2) solo de 120 m: a los 3 s vale la mejor (${r.p?.precision} m en ${r.ms} ms)`);

  r = await leer(ios, { lecturas: [{ ms: 300, precision: 400 }, { ms: 800, precision: 380 }] }, { espera: 4000, rapida: true });
  ok(r.p && r.p.precision === 380 && r.ms >= 3900 && r.ms < 4600 && r.activos === 0, `3) solo de ~400 m: al cumplirse el plazo, la mejor (${r.p?.precision} m en ${r.ms} ms)`);

  r = await leer(ios, { lecturas: [{ ms: 100, precision: 10, viejaS: 300 }] }, { espera: 2500, rapida: true });
  ok(r.e && r.e.code === 3 && r.ms >= 2400 && r.ms < 3100 && r.activos === 0, `4) sin lecturas nuevas: código ${r.e?.code} a los ${r.ms} ms y el seguimiento suelto`);

  r = await leer(ios, { permiso: 'denied', lecturas: conViejaYBuenas }, { espera: 7000, rapida: true });
  ok(r.e && r.e.code === 1 && r.ms < 500 && !r.llamadas.includes('watchPosition'), `5) sin permiso: código ${r.e?.code} en ${r.ms} ms`);

  r = await leer(ios, { permiso: 'granted', lecturas: conViejaYBuenas, unaVezMs: 300 }, { espera: 7000 });
  ok(r.p && r.llamadas.join() === 'getCurrentPosition', `6) iPhone sin rápida: getCurrentPosition como siempre (${r.llamadas.join(', ')})`);

  const android = await abrir('android');
  r = await leer(android, { lecturas: conViejaYBuenas, unaVezMs: 300 }, { espera: 7000, rapida: true });
  ok(r.p && r.llamadas.join() === 'getCurrentPosition', `6) Android con rápida: getCurrentPosition como siempre (${r.llamadas.join(', ')})`);
  ok(errores.length === 0, `sin errores de JavaScript (${errores.join(' | ')})`);
} finally {
  await navegador.close();
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · lectura rápida del GPS en iPhone · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(fallas ? 1 : 0);
