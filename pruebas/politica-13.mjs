// Política de privacidad 1.3 (fase 3 del panel): escrita en plantillas/_raiz/privacidad/ detrás de publicar_1_3
// (herramientas/politica.json). Corre el generador en una copia aparte (herramientas, plantillas y empresas; nunca
// escribe en el repositorio) y revisa:
//  1) apagada (como está en la rama): privacidad/index.html sale IGUAL a la publicada (salvo las huellas ?v= que pone
//     versionar.py) y nucleo/politica.js igual al del repositorio (1.2, sin aviso);
//  2) encendida sin la fecha: el generador se niega;
//  3) encendida con la fecha: los textos de documentos/POLITICA-1.3-CAMBIOS.md (fase 3) en su sección, sin marcas sin
//     reemplazar ni etiquetas descuadradas, sin las frases de la 1.2 que cambian, y nucleo/politica.js con la 1.3 y
//     avisar: true. Deja la página generada en $CAPTURAS/politica-1.3.html y, con un url_base, su captura completa
//     (servida en lugar de /privacidad/ con los estilos del sitio).
// Uso: node pruebas/politica-13.mjs [url_base]
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname;
const BASE = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/panel/f3/pruebas/app/capturas-politica').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const sinVersiones = (t) => t.replace(/\?v=[0-9a-f]+/g, '');

const TMP = mkdtempSync('/tmp/cootrans/panel/f3/pruebas/app/gen-');
try {
  for (const d of ['herramientas', 'plantillas', 'empresas']) cpSync(join(REPO, d), join(TMP, d), { recursive: true });
  mkdirSync(join(TMP, 'nucleo'));
  const generar = (cfg) => {
    const p = JSON.parse(readFileSync(join(REPO, 'herramientas/politica.json'), 'utf8'));
    writeFileSync(join(TMP, 'herramientas/politica.json'), JSON.stringify({ ...p, ...cfg }, null, 2));
    return execFileSync('python3', [join(TMP, 'herramientas/generar-empresas.py')], { cwd: TMP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };
  const leer = (rel) => readFileSync(join(TMP, rel), 'utf8');

  // 1) Apagada.
  generar({});
  const publicada = readFileSync(join(REPO, 'privacidad/index.html'), 'utf8');
  ok(sinVersiones(leer('privacidad/index.html')) === sinVersiones(publicada), '1) apagada: privacidad/index.html sale igual a la publicada (la 1.2)');
  ok(leer('nucleo/politica.js') === readFileSync(join(REPO, 'nucleo/politica.js'), 'utf8'), '1) apagada: nucleo/politica.js igual al del repositorio');
  ok(/"version":"1\.2"/.test(leer('nucleo/politica.js')) && /"avisar":false/.test(leer('nucleo/politica.js')), '1) las apps siguen con la 1.2 y sin la tarjeta');

  // 2) Encendida sin la fecha.
  let negado = '';
  try {
    generar({ publicar_1_3: true, vigente_desde_1_3: '' });
  } catch (e) {
    negado = String(e.stderr || e.message);
  }
  ok(/vigente_desde_1_3/.test(negado), '2) encendida sin la fecha: el generador se niega y dice qué falta');
  try {
    generar({ publicar_1_3: true, vigente_desde_1_3: '2026-10-20' });
    negado = '';
  } catch (e) {
    negado = String(e.stderr || e.message);
  }
  ok(/vigente_desde_1_3/.test(negado), '2) con la fecha en otro formato, también');

  // 3) Encendida con la fecha.
  generar({ publicar_1_3: true, vigente_desde_1_3: '20 de octubre de 2026' });
  const h = leer('privacidad/index.html');
  writeFileSync(`${DIR}politica-1.3.html`, h);
  const plano = h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const tiene = (t) => plano.includes(t);
  ok(tiene('Versión 1.3 · Vigente desde el 20 de octubre de 2026') && /href="#cambios">Qué cambió</.test(h), '3) cabecera: «Versión 1.3 · Vigente desde el 20 de octubre de 2026 · Qué cambió»');
  ok(tiene('en su panel y solo lo necesario: en los viajes ve tu primer nombre y la inicial de tu apellido, y tu celular solo con un motivo'), '3) «En pocas palabras»: el punto de la cooperativa');
  ok(tiene('Si usas el panel de una cooperativa o de interOS') && tiene('Tus ingresos: fecha, hora, navegador y ciudad aproximada') && tiene('en un registro que no se puede alterar'), '3) §2: los datos de quienes usan el panel');
  ok(tiene('rechazado o retirado') && tiene('Las fechas de vencimiento de tu licencia, el SOAT'), '3) §2 conductores: estados de la fase 2 y las fechas de los documentos');
  ok(tiene('Mientras estás en turno, tu cooperativa ve en su panel la posición de tu taxi, tu número de móvil y tu estado') && tiene('tampoco tu cooperativa guarda un historial'), '3) §3: la cooperativa ve la posición en turno, sin historial');
  ok(tiene('la posición exacta solo la ven tu pasajero, durante su viaje, y tu cooperativa, mientras estás en turno') && !tiene('la posición exacta solo la ve tu pasajero, durante su viaje.'), '3) §3: ya no dice que la posición exacta solo la ve el pasajero');
  ok(tiene('despache desde su central (ofrecer un pedido a un taxi, sacar a un conductor de turno o cancelar un pedido que no encuentra taxi, con el motivo)'), '3) §4: despachar desde la central');
  ok(tiene('en su panel (panel.taxicun.com). Solo ve lo de su propio servicio') && tiene('Pasadas 24 horas, el origen y el destino se ven solo por sector') && tiene('un requerimiento de autoridad, y queda registrado quién lo vio, cuándo y por qué. Nunca ve tu correo') && tiene('sin tu celular, tu correo ni tus notas') && tiene('por encargo de interOS'), '3) §5: qué ve la cooperativa (conductor, pasajero enmascarado, revelar con motivo, listado sin contacto)');
  ok(tiene('Tu cooperativa sí las ve en su panel, para revisar el servicio'), '3) §5: las calificaciones las ve la cooperativa');
  ok(tiene('El registro de lo que se hace en el panel: 2 años') && tiene('Los listados que descarga una cooperativa: no se guardan en nuestro servidor'), '3) §8: cuánto se guarda la bitácora (2 años, por confirmar) y los listados');
  ok(tiene('topes diarios para ver celulares o descargar listados'), '3) §9: el panel y sus protecciones');
  ok(tiene('Qué cambió en la versión 1.3 (20 de octubre de 2026):'), '3) §14: qué cambió');
  ok(tiene('Política de privacidad de TaxiCun, versión 1.3, vigente desde el 20 de octubre de 2026.'), '3) pie: versión 1.3 con la fecha');
  ok(!/\{\{|\}\}/.test(h), '3) sin marcas de la plantilla sin reemplazar');
  const cuenta = (re) => (h.match(re) || []).length;
  ok(cuenta(/<li[\s>]/g) === cuenta(/<\/li>/g) && cuenta(/<ul[\s>]/g) === cuenta(/<\/ul>/g) && cuenta(/<section[\s>]/g) === cuenta(/<\/section>/g), `3) etiquetas cuadradas (li ${cuenta(/<li[\s>]/g)}/${cuenta(/<\/li>/g)}, ul ${cuenta(/<ul[\s>]/g)}/${cuenta(/<\/ul>/g)})`);
  ok(!tiene('Vigente desde el 3 de octubre de 2026'), '3) sin la vigencia de la 1.2');
  const js = leer('nucleo/politica.js');
  ok(/"version":"1\.3"/.test(js) && /"vigenteDesde":"20 de octubre de 2026"/.test(js) && /"avisar":true/.test(js), '3) nucleo/politica.js: la 1.3, la fecha y avisar (la tarjeta de las apps)');

  // Captura de la página 1.3 con los estilos del sitio (servida en lugar de /privacidad/).
  if (BASE) {
    const { chromium } = await import('/tmp/cootrans/npm/node_modules/playwright-core/index.mjs');
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome' });
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const base = BASE.replace(/\/?$/, '/');
    await ctx.route(`${base}privacidad/`, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: h }));
    const p = await ctx.newPage();
    const errores = [];
    p.on('pageerror', (e) => errores.push(e.message));
    await p.goto(`${base}privacidad/`);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${DIR}politica-1.3-celular.png`, fullPage: true });
    await p.locator('#compartir').screenshot({ path: `${DIR}politica-1.3-quien-ve.png` });
    await p.locator('.resumen').screenshot({ path: `${DIR}politica-1.3-en-pocas-palabras.png` });
    ok(errores.length === 0, '3) la página se abre sin errores (captura completa en politica-1.3-celular.png)');
    await b.close();
  }
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · política 1.3 (apagada y encendida) · ${bien} ✔ · ${fallas} ✘ · página en ${DIR}politica-1.3.html`);
process.exit(fallas ? 1 : 0);
