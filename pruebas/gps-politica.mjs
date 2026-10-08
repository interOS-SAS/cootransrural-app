// Política de privacidad con el capítulo «GPS para taxis» (TaxiCun GPS), escrito y APAGADO en
// plantillas/_raiz/privacidad/ (herramientas/politica.json: publicar_capitulo_gps). Corre el generador de esta rama
// y el de main en copias aparte (herramientas, plantillas y empresas; nunca escribe en el repositorio) y revisa
// (§14.4 del diseño del GPS):
//  1) la 1.3 y el GPS apagados: privacidad/index.html sale idéntica byte a byte a la del generador de main, igual a
//     la publicada en main (salvo las huellas ?v= de versionar.py), y nucleo/politica.js idéntico;
//  2) la 1.3 encendida y el GPS apagado: idéntica byte a byte a la de main con la 1.3 encendida (y politica.js);
//  3) el GPS encendido sin la 1.3, o sin la fecha, o con la fecha en otro formato: el generador se niega;
//  4) las dos encendidas: la versión 1.4 con su fecha, el capítulo #gps en el 4.º lugar y la numeración corrida
//     (1 a 16, en orden), todos los enlaces #… con su sección, los puntos del capítulo en su lugar, sin marcas sin
//     reemplazar ni etiquetas descuadradas, la tienda enlaza privacidad/#gps y nucleo/politica.js con la 1.4.
// Uso: node pruebas/gps-politica.mjs   (BASE_MAIN=94e62bab por defecto; CAPTURAS=carpeta para dejar la página 1.4)
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO = new URL('..', import.meta.url).pathname;
const BASE_MAIN = process.env.BASE_MAIN || '94e62bab';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/gps/r2/pruebas/tienda').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const sinVersiones = (t) => t.replace(/\?v=[0-9a-f]+/g, '');

const TMP = mkdtempSync(join(DIR, 'gen-'));
try {
  // Las dos copias: la de esta rama y la de main.
  const ACTUAL = join(TMP, 'actual');
  const MAIN = join(TMP, 'main');
  for (const d of ['herramientas', 'plantillas', 'empresas']) cpSync(join(REPO, d), join(ACTUAL, d), { recursive: true });
  mkdirSync(MAIN, { recursive: true });
  const tar = execFileSync('git', ['-C', REPO, 'archive', '--format=tar', BASE_MAIN, 'herramientas', 'plantillas', 'empresas'], { maxBuffer: 1 << 30 });
  execFileSync('tar', ['-x', '-C', MAIN], { input: tar });
  for (const raiz of [ACTUAL, MAIN]) mkdirSync(join(raiz, 'nucleo'), { recursive: true });

  const generar = (raiz, cfg) => {
    const p = JSON.parse(readFileSync(join(raiz, 'herramientas/politica.json'), 'utf8'));
    writeFileSync(join(raiz, 'herramientas/politica.json'), JSON.stringify({ ...p, ...cfg }, null, 2));
    return execFileSync('python3', [join(raiz, 'herramientas/generar-empresas.py')], { cwd: raiz, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  };
  const negado = (raiz, cfg) => {
    try {
      generar(raiz, cfg);
      return '';
    } catch (e) {
      return String(e.stderr || e.message);
    }
  };
  const leer = (raiz, rel) => readFileSync(join(raiz, rel), 'utf8');

  // 1) Todo apagado (como está en la rama).
  generar(ACTUAL, {});
  generar(MAIN, {});
  const publicadaMain = execFileSync('git', ['-C', REPO, 'show', `${BASE_MAIN}:privacidad/index.html`], { encoding: 'utf8' });
  ok(leer(ACTUAL, 'privacidad/index.html') === leer(MAIN, 'privacidad/index.html'), `1) 1.3 y GPS apagados: privacidad/index.html idéntica byte a byte a la del generador de main (${BASE_MAIN})`);
  ok(sinVersiones(leer(ACTUAL, 'privacidad/index.html')) === sinVersiones(publicadaMain), '1) … e igual a la publicada en main (salvo las huellas ?v=)');
  ok(readFileSync(join(REPO, 'privacidad/index.html'), 'utf8') === publicadaMain, '1) la privacidad/index.html de esta rama (generada y versionada) es idéntica byte a byte a la de main');
  ok(leer(ACTUAL, 'nucleo/politica.js') === leer(MAIN, 'nucleo/politica.js') && leer(ACTUAL, 'nucleo/politica.js') === readFileSync(join(REPO, 'nucleo/politica.js'), 'utf8'), '1) nucleo/politica.js idéntico (la 1.2, sin la tarjeta)');
  ok(!/id="gps"|GPS para taxis/.test(leer(ACTUAL, 'privacidad/index.html')), '1) el capítulo GPS no sale');
  ok(!/privacidad\/#gps/.test(leer(ACTUAL, 'gps/index.html')), '1) la tienda enlaza privacidad/ sin #gps');

  // 2) La 1.3 encendida, el GPS apagado.
  const v13 = { publicar_1_3: true, vigente_desde_1_3: '20 de octubre de 2026' };
  generar(ACTUAL, v13);
  generar(MAIN, v13);
  ok(leer(ACTUAL, 'privacidad/index.html') === leer(MAIN, 'privacidad/index.html'), '2) 1.3 encendida y GPS apagado: idéntica byte a byte a la de main con la 1.3 encendida');
  ok(leer(ACTUAL, 'nucleo/politica.js') === leer(MAIN, 'nucleo/politica.js'), '2) nucleo/politica.js idéntico al de main con la 1.3');

  // 3) El GPS encendido sin lo que pide.
  ok(/publicar_1_3/.test(negado(ACTUAL, { publicar_1_3: false, publicar_capitulo_gps: true, vigente_desde_gps: '5 de noviembre de 2026' })), '3) GPS sin la 1.3: el generador se niega y dice que falta la 1.3');
  ok(/vigente_desde_gps/.test(negado(ACTUAL, { ...v13, publicar_capitulo_gps: true, vigente_desde_gps: '' })), '3) GPS sin la fecha: el generador se niega y dice qué falta');
  ok(/vigente_desde_gps/.test(negado(ACTUAL, { ...v13, publicar_capitulo_gps: true, vigente_desde_gps: '2026-11-05' })), '3) GPS con la fecha en otro formato: también');

  // 4) Las dos encendidas.
  generar(ACTUAL, { ...v13, publicar_capitulo_gps: true, vigente_desde_gps: '5 de noviembre de 2026' });
  const h = leer(ACTUAL, 'privacidad/index.html');
  writeFileSync(`${DIR}politica-1.4-con-gps.html`, h);
  const plano = h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
  const tiene = (t) => plano.includes(t);
  ok(tiene('Versión 1.4 · Vigente desde el 5 de noviembre de 2026'), '4) cabecera: «Versión 1.4 · Vigente desde el 5 de noviembre de 2026»');
  ok(tiene('Política de privacidad de TaxiCun, versión 1.4, vigente desde el 5 de noviembre de 2026.'), '4) pie: versión 1.4 con su fecha');
  ok(tiene('Qué cambió en la versión 1.3 (20 de octubre de 2026):') && tiene('Qué cambió en la versión 1.4 (5 de noviembre de 2026):'), '4) «Cambios»: lo de la 1.3 y lo de la 1.4, cada uno con su fecha');
  const secciones = [...h.matchAll(/<section id="([a-z-]+)">\s*<h2>(\d+)\. /g)].map((m) => [m[1], Number(m[2])]);
  ok(secciones.length === 16 && secciones.every(([, n], i) => n === i + 1), `4) 16 secciones numeradas de 1 a 16, en orden (${secciones.map(([i, n]) => `${n}.${i}`).join(' ')})`);
  ok(secciones[3]?.[0] === 'gps' && secciones[2]?.[0] === 'ubicacion' && secciones[4]?.[0] === 'finalidades' && secciones[15]?.[0] === 'contacto', '4) «GPS para taxis» es la 4, después de «Tu ubicación»; «Contacto» pasa a la 16');
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  const anclas = [...h.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((a) => !a.startsWith('i-'));
  const sinDestino = anclas.filter((a) => !ids.has(a));
  ok(sinDestino.length === 0, `4) todos los enlaces internos tienen su sección (${anclas.length}${sinDestino.length ? '; faltan ' + sinDestino : ''})`);
  ok(anclas.filter((a) => a === 'gps').length >= 6, `4) los enlaces a #gps (${anclas.filter((a) => a === 'gps').length}): en pocas palabras, índice, ubicación, quién ve, lo que no hacemos`);
  ok(tiene('Si el taxi tiene TaxiCun GPS, el equipo del vehículo envía su ubicación todo el tiempo') && tiene('La app no guarda un historial de tus recorridos') && !tiene('No guardamos un historial de tus recorridos'), '4) «En pocas palabras» y «Tu ubicación» con el GPS (la app no guarda historial; el equipo sí)');
  ok(tiene('y tampoco tu cooperativa guarda un historial. Si el taxi que manejas tiene TaxiCun GPS, el equipo instalado en el vehículo sí guarda su recorrido'), '4) con la 1.3: la frase de la cooperativa y la del GPS juntas');
  ok(tiene('El propietario del taxi y su cooperativa, si el taxi tiene TaxiCun GPS') && tiene('el servidor de GPS (Traccar, un programa de código abierto) funciona en nuestro propio servidor') && tiene('Esto es de la app: el GPS instalado en un taxi funciona aparte') && tiene('Los datos que nos dejas en taxicun.com/gps: hasta 12 meses'), '4) quién ve, proveedores, lo que no hacemos y cuánto se guarda: con el GPS');
  ok(tiene('placa y cuántos taxis'), '4) el capítulo nombra la placa entre los datos del formulario de la tienda');
  ok(!/\{\{|\}\}/.test(h), '4) sin marcas de la plantilla sin reemplazar');
  const cuenta = (re) => (h.match(re) || []).length;
  ok(cuenta(/<li[\s>]/g) === cuenta(/<\/li>/g) && cuenta(/<ul[\s>]/g) === cuenta(/<\/ul>/g) && cuenta(/<section[\s>]/g) === cuenta(/<\/section>/g) && cuenta(/<p[\s>]/g) === cuenta(/<\/p>/g),
    `4) etiquetas cuadradas (li ${cuenta(/<li[\s>]/g)}/${cuenta(/<\/li>/g)}, section ${cuenta(/<section[\s>]/g)}/${cuenta(/<\/section>/g)}, p ${cuenta(/<p[\s>]/g)}/${cuenta(/<\/p>/g)})`);
  const js = leer(ACTUAL, 'nucleo/politica.js');
  ok(/"version":"1\.4"/.test(js) && /"vigenteDesde":"5 de noviembre de 2026"/.test(js) && /"avisar":true/.test(js), '4) nucleo/politica.js: la 1.4, su fecha y avisar (la tarjeta de las apps)');
  ok(/href="\.\.\/privacidad\/#gps"/.test(leer(ACTUAL, 'gps/index.html')), '4) la tienda enlaza privacidad/#gps');
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · política con el capítulo GPS (apagado, con la 1.3 y encendido) · ${bien} ✔ · ${fallas} ✘ · página 1.4 en ${DIR}politica-1.4-con-gps.html`);
process.exit(fallas ? 1 : 0);
