// Genera el PDF de la propuesta comercial de TaxiCun (desarrollada por interOS)
// para cada cooperativa a partir de <url>/<id>/propuesta/ (plantillas/propuesta/),
// con Chromium sin pantalla.
//
// Uso:  node herramientas/propuestas-pdf.mjs [url_base] [id …] [--salida=CARPETA] [--todas] [--copiar]
//   url_base   donde se sirve el sitio (por defecto http://localhost:8775/)
//   id …       solo esas cooperativas (por ejemplo: tenjo madrid)
//   --todas    incluye también a Cootransrural (por defecto no: es la principal)
//   --salida   carpeta de salida (por defecto /tmp/cootrans/propuestas)
//   --copiar   además, copia cada PDF a <id>/propuesta/ (de ahí lo enlazan los correos)
//
// Deja /tmp/cootrans/propuestas/<id>/Propuesta-app-taxis-<NombreCorto>.pdf.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, readdirSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const PRINCIPAL = 'cootransrural';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => (args.find((a) => a.startsWith(`--${nombre}=`)) || '').split('=').slice(1).join('=') || porDefecto;
const sueltos = args.filter((a) => !a.startsWith('--'));
const BASE = (sueltos.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:8775/').replace(/\/?$/, '/');
const PEDIDAS = sueltos.filter((a) => !/^https?:\/\//.test(a));
const SALIDA = opcion('salida', '/tmp/cootrans/propuestas');
const TODAS = args.includes('--todas');
const COPIAR = args.includes('--copiar');

const ids = readdirSync(join(RAIZ, 'empresas'))
  .filter((id) => existsSync(join(RAIZ, 'empresas', id, 'ficha.json')))
  .filter((id) => (PEDIDAS.length ? PEDIDAS.includes(id) : TODAS || id !== PRINCIPAL))
  .sort();
if (!ids.length) {
  console.error('No hay cooperativas para generar. Revisa los id.');
  process.exit(1);
}

const navegador = await chromium.launch({ executablePath: EXE });
const contexto = await navegador.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota' });
await contexto.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
let fallas = 0;

for (const id of ids) {
  const ruta = id === PRINCIPAL ? 'propuesta/' : `${id}/propuesta/`;
  if (!existsSync(join(RAIZ, ruta, 'index.html'))) {
    console.error(`✘ ${id}: falta ${ruta}index.html (corre python3 herramientas/generar-empresas.py)`);
    fallas++;
    continue;
  }
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  pagina.on('requestfailed', (r) => errores.push(`no cargó ${r.url()}`));
  pagina.on('response', (r) => { if (r.status() >= 400) errores.push(`${r.status()} ${r.url()}`); });
  try {
    await pagina.goto(BASE + ruta, { waitUntil: 'networkidle', timeout: 60000 });
    await pagina.waitForSelector('html[data-listo="si"]', { timeout: 30000 });
    const archivo = await pagina.evaluate(() => document.body.dataset.pdf);
    const carpeta = join(SALIDA, id);
    mkdirSync(carpeta, { recursive: true });
    const destino = join(carpeta, archivo || `Propuesta-app-taxis-${id}.pdf`);
    await pagina.emulateMedia({ media: 'print' });
    await pagina.pdf({ path: destino, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    const kb = Math.round(statSync(destino).size / 1024);
    const paginas = (readFileSync(destino, 'latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
    console.log(`${errores.length ? '!' : '✔'} ${id}: ${destino} · ${paginas} páginas · ${kb} KB${errores.length ? ` · avisos: ${errores.join(' | ')}` : ''}`);
    if (COPIAR) {
      const copia = join(RAIZ, ruta, archivo || `Propuesta-app-taxis-${id}.pdf`);
      copyFileSync(destino, copia);
      console.log(`  copiado a ${ruta}${archivo}`);
    }
  } catch (e) {
    fallas++;
    console.error(`✘ ${id}: ${e.message}`);
  }
  await pagina.close();
}

await navegador.close();
process.exitCode = fallas ? 1 : 0;
