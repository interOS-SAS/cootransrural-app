// Página de términos de la promoción «Viaje gratis» (taxicun.com/promociones/viaje-gratis/, DISENO-PROMOCIONES.md §15)
// con la API pública simulada (GET /api/promociones/viaje-gratis[?version=n], §7.5): los valores vigentes en su lugar (en
// pesos y fechas de Bogotá), las cooperativas, las versiones y ?version=n, cada estado (vigente, programada, apagada,
// pausada, terminada), la API caída o con basura («—» y la franja, nunca valores escritos a mano), que todo valor entra
// como texto (un nombre de cooperativa con <b> sale literal) y que la página funciona con una CSP sin código en línea.
// También el alias /gratis/ y el enlace del pie de la página de inicio. Capturas a 390 y 1366 px.
// Uso: node --import <pw-registrar.mjs> pruebas/promo-terminos.mjs [url_base]   (servidor estático del repositorio)
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5961/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/root/proyectos/_trabajo-taxicun/promociones/app/capturas').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const PAGINA = `${BASE}promociones/viaje-gratis/`;
const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};

const VIGENTE = {
  id: 'viaje-gratis', nombre: 'Viaje gratis', estado: 'vigente', version: 3, vigenteDesde: '2026-10-20T05:00:00Z',
  inicio: '2026-10-20T05:00:00Z', fin: null, cada: 10, tope: 10000, bonoPct: 30, bonoMax: 0, minimo: 'minima', venceDias: 60,
  maxMismoConductor: 3, unoPorCelular: true, maxPorDia: 0, avanceMinKm: 0.4, duracionMinS: 120, pagoDias: 5,
  cooperativas: [
    { id: 'cootransrural', nombre: 'Cootransrural', municipio: 'El Rosal', tope: 10000, minimo: 6100, desde: '2026-10-20T05:00:00Z' },
    { id: 'prueba', nombre: '<b>Coop</b> <img src=x onerror="window.__xss=1">', municipio: 'Tenjo', tope: 12000, minimo: 7000, desde: '2026-10-21T05:00:00Z' },
  ],
  versiones: [{ version: 3, desde: '2026-10-20T05:00:00Z', hasta: null }, { version: 2, desde: '2026-10-15T05:00:00Z', hasta: '2026-10-20T05:00:00Z' }],
  empresa: { nombre: 'interOS S.A.S.', nit: '901.213.197-5', correo: 'info@taxicun.com' },
};
const api = { modo: 'ok', datos: VIGENTE, pedidas: [] }; // modo: ok | 500 | abortar

const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function abrir(url = PAGINA, { ancho = 390, alto = 844, csp = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(`${BASE}api/**`, async (route) => {
    const u = new URL(route.request().url());
    api.pedidas.push(u.pathname + u.search);
    if (api.modo === 'abortar') return route.abort('internetdisconnected');
    if (api.modo === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"error_interno"}' });
    const v = u.searchParams.get('version');
    const datos = v ? { ...api.datos, version: Number(v), vigenteDesde: '2026-10-15T05:00:00Z', tope: 8000 } : api.datos;
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'public, max-age=60' }, body: JSON.stringify(datos) });
  });
  if (csp) {
    // La misma página, con una CSP sin código en línea (como la pondría nginx).
    await ctx.route(/\/promociones\/viaje-gratis\/(\?.*)?$/, async (route) => {
      const r = await route.fetch();
      return route.fulfill({ response: r, headers: { ...r.headers(), 'content-security-policy': CSP } });
    });
  }
  const p = await ctx.newPage();
  const consola = [];
  p.on('pageerror', (e) => errores.push(e.message));
  p.on('console', (m) => consola.push(m.text()));
  await p.goto(url);
  await p.waitForSelector('[data-terminos-promo][data-cargado]', { timeout: 15000 });
  return { ctx, p, consola };
}
const valor = (p, k) => p.$$eval(`[data-v="${k}"]`, (ns) => ns.map((n) => n.textContent));
const franja = (p) => p.$$eval('[data-franja]', (ns) => ns.filter((n) => !n.hidden).map((n) => `${n.dataset.franja}: ${n.textContent.replace(/\s+/g, ' ').trim()}`));
const visible = (p, sel) => p.$eval(sel, (n) => !n.hidden && !n.closest('[hidden]')).catch(() => false);
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png`, fullPage: true }).catch(() => {});

// 1) Vigente.
let { ctx, p, consola } = await abrir(PAGINA, { csp: true });
ok(api.pedidas.at(-1) === '/api/promociones/viaje-gratis', `1) pide la API pública (${api.pedidas.at(-1)})`);
ok((await valor(p, 'tope')).every((x) => x === '$10.000') && (await valor(p, 'cada')).every((x) => x === '10'), '1) tope $10.000 y cada 10 en todos sus lugares');
ok((await valor(p, 'version'))[0] === '3' && (await valor(p, 'vigenteDesde'))[0] === '20 de octubre de 2026', `1) versión 3, vigente desde el ${(await valor(p, 'vigenteDesde'))[0]} (Bogotá)`);
ok((await valor(p, 'bonoPct'))[0] === '30' && (await valor(p, 'venceDias'))[0] === '60' && (await valor(p, 'maxMismoConductor'))[0] === '3' && (await valor(p, 'pagoDias'))[0] === '5', '1) bono 30 %, 60 días, 3 con el mismo conductor, 5 días hábiles');
ok((await valor(p, 'minimo'))[0] === 'la carrera mínima de cada cooperativa' && (await valor(p, 'avanceMinKm'))[0] === '0,4' && (await valor(p, 'duracionMin'))[0] === '2', '1) mínimo, 0,4 km y 2 minutos');
ok((await visible(p, '[data-si="sinFin"]')) && !(await visible(p, '[data-si="fin"]')), '1) sin fin: «Hasta que TaxiCun anuncie su terminación…» (art. 33 de la Ley 1480)');
ok(!(await visible(p, '[data-si="bonoMax"]')) && !(await visible(p, '[data-si="maxPorDia"]')) && (await visible(p, '[data-si="unoPorCelular"]')), '1) sin tope de bono ni máximo por día; uno por celular');
const coops = await p.$$eval('[data-lista="cooperativas"] li', (ns) => ns.map((n) => n.textContent));
ok(coops[0] === 'Cootransrural (El Rosal) · tope $10.000 · carrera mínima $6.100 · desde el 20 de octubre de 2026', `1) cooperativas: «${coops[0]}»`);
ok(coops[1]?.startsWith('<b>Coop</b> <img src=x onerror="window.__xss=1"> (Tenjo)') && (await p.evaluate(() => window.__xss === undefined && !document.querySelector('[data-lista] b, [data-lista] img'))), '2) un nombre con <b> y <img> sale literal (texto, nada ejecutado)');
const vers = await p.$$eval('[data-lista="versiones"] a', (ns) => ns.map((n) => [n.getAttribute('href'), n.textContent]));
ok(vers.length === 1 && vers[0][0] === '/promociones/viaje-gratis/?version=2' && /Versión 2 \(desde el 15 de octubre de 2026 hasta el 20 de octubre de 2026\)/.test(vers[0][1]), `1) versiones anteriores, sin la que se ve (${vers.map((v) => v[0]).join(', ')})`);
ok((await franja(p)).length === 0, '1) vigente: sin franja');
const csp = consola.filter((x) => /Content Security Policy|Refused to/i.test(x));
ok(csp.length === 0, `3) con una CSP sin código en línea, ninguna violación (${csp.slice(0, 2).join(' | ')})`);
const enLinea = await p.evaluate(() => ({ scripts: [...document.scripts].filter((s) => !s.src).length, manejadores: [...document.querySelectorAll('*')].filter((n) => [...n.attributes].some((a) => /^on/i.test(a.name))).length }));
ok(enLinea.scripts === 0 && enLinea.manejadores === 0, `3) sin scripts ni manejadores en línea (${JSON.stringify(enLinea)})`);
const ancho = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
ok(ancho, '1) a 390 px no hay desplazamiento horizontal');
await foto(p, 't1-terminos-390');
await ctx.close();
({ ctx, p } = await abrir(PAGINA, { ancho: 1366, alto: 900 }));
await foto(p, 't1-terminos-1366');
await ctx.close();

// 4) ?version=2: los valores de esa versión y la franja.
({ ctx, p } = await abrir(`${PAGINA}?version=2`));
ok(api.pedidas.at(-1) === '/api/promociones/viaje-gratis?version=2', `4) ?version=2 pide esa versión (${api.pedidas.at(-1)})`);
ok((await valor(p, 'tope'))[0] === '$8.000' && (await valor(p, 'version'))[0] === '2', '4) con los valores de la versión 2');
ok((await franja(p)).some((x) => x.startsWith('version:')), '4) franja «Estás viendo la versión 2…»');
await ctx.close();
({ ctx, p } = await abrir(`${PAGINA}?version=2%3Cb%3E`));
ok(api.pedidas.at(-1) === '/api/promociones/viaje-gratis', '4) ?version con algo que no es un número: se ignora');
await ctx.close();

// 5) Cada estado.
const ESTADOS = [
  ['programada', /^no_empieza: La promoción todavía no ha empezado\.$/],
  ['apagada', /^no_empieza: La promoción todavía no ha empezado\.$/],
  ['pausada', /^pausada: El canje está en pausa temporal\.$/],
  ['terminada', /^terminada: La promoción terminó el 30 de noviembre de 2026\. Los viajes gratis ganados se pueden usar hasta su vencimiento\.$/],
];
for (const [estado, re] of ESTADOS) {
  api.datos = { ...VIGENTE, estado, ...(estado === 'terminada' ? { fin: '2026-12-01T04:59:59Z' } : {}) };
  ({ ctx, p } = await abrir());
  const f = await franja(p);
  ok(f.length === 1 && re.test(f[0]), `5) ${estado}: «${f[0]}»`);
  if (estado === 'terminada') {
    ok((await visible(p, '[data-si="fin"]')) && (await valor(p, 'fin'))[0] === '30 de noviembre de 2026', '5) terminada: «hasta el 30 de noviembre de 2026»');
    await foto(p, 't5-terminada');
  }
  await ctx.close();
}
api.datos = { ...VIGENTE, bonoMax: 5000, maxPorDia: 2 };
({ ctx, p } = await abrir());
ok((await visible(p, '[data-si="bonoMax"]')) && (await valor(p, 'bonoMax'))[0] === '$5.000' && (await visible(p, '[data-si="maxPorDia"]')) && (await valor(p, 'maxPorDia'))[0] === '2', '5) con tope de bono ($5.000) y máximo por día (2)');
await ctx.close();

// 6) La API caída o con basura: «—» y la franja; nunca valores por defecto.
for (const [modo, datos] of [['500', null], ['abortar', null], ['ok', { id: 'otra-cosa', tope: 999 }], ['ok', { ...VIGENTE, tope: '10000' }]]) {
  api.modo = modo;
  api.datos = datos || VIGENTE;
  ({ ctx, p } = await abrir());
  const vals = [...(await valor(p, 'tope')), ...(await valor(p, 'cada')), ...(await valor(p, 'version'))];
  const f = await franja(p);
  ok(vals.every((x) => x === '—') && f.length === 1 && f[0].startsWith('error: No pudimos cargar los valores vigentes'), `6) API ${modo}${datos ? ` (${JSON.stringify(datos).slice(0, 30)}…)` : ''}: valores «—» y la franja`);
  if (modo === '500') await foto(p, 't6-api-caida');
  await ctx.close();
}
api.modo = 'ok';
api.datos = VIGENTE;

// 7) El alias /gratis/ y el enlace del pie de la página de inicio.
({ ctx, p } = await abrir(`${BASE}gratis/`));
ok(new URL(p.url()).pathname === '/promociones/viaje-gratis/', `7) /gratis/ lleva a los términos (${new URL(p.url()).pathname})`);
await ctx.close();
ctx = await b.newContext();
p = await ctx.newPage();
await p.goto(BASE);
const pie = await p.$eval('footer.pie a[href*="promociones/viaje-gratis"]', (a) => [a.getAttribute('href'), a.textContent]).catch(() => null);
ok(pie && /^(\.\/)?promociones\/viaje-gratis\/$/.test(pie[0]), `7) la página de inicio enlaza los términos desde el pie (${pie?.join(' · ')})`);
await ctx.close();

await b.close();
ok(errores.length === 0, `sin errores de página (${errores.slice(0, 3).join(' | ')})`);
console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
