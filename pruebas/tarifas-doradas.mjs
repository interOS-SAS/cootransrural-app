// Prueba dorada de tarifas (§5.5 y S33 del diseño del panel). Sin navegador ni dependencias.
//
// pruebas/tarifas-doradas.json fija lo que cobra la app HOY: Cootransrural (los 191 destinos del
// Decreto 05 de 2026 por lista, por nombre y por cercanía, sin destino, las rutas, los lugares, los
// recargos a varias horas en día normal, domingo y festivo, programado y fidelidad) y una muestra de
// 21 demos (pruebas/tarifas-casos.mjs). La generó nucleo/tarifas.js ANTES de partirlo en
// tarifador.js (puro) y el envoltorio, así que esta prueba demuestra que el refactor no cambió nada.
//
// Comprueba dos caminos, cada caso contra la dorada (cifras y huella del resultado completo):
//   1) directo: crearTarifador(ficha) de nucleo/tarifador.js, como lo usarán el panel y el servidor;
//   2) envoltorio: nucleo/tarifas.js cargado como en las apps (config.js lee la ficha con fetch y
//      CT_EMPRESA), un proceso por cooperativa.
// También que la ficha de cada cooperativa sea la misma con la que se generó la dorada: si alguien
// cambia precios en una ficha, esta prueba lo dice.
//
// Uso:
//   node pruebas/tarifas-doradas.mjs                 → comprueba (sale con 1 si algo no cuadra)
//   node pruebas/tarifas-doradas.mjs --regenerar     → reescribe la dorada con el código de --raiz (por
//        [--raiz=<árbol>]                              defecto, este repo) por el camino del envoltorio.
//                                                      Solo para un cambio de precios A PROPÓSITO:
//                                                      revisar el diff de la dorada en el PR.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COOPERATIVAS_DORADAS, casosDe, entradaDe, valorDe as valorConHuella } from './tarifas-casos.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DORADA = join(REPO, 'pruebas', 'tarifas-doradas.json');
const arg = (n) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const RAIZ = resolve(arg('raiz') || REPO);

const sha256 = (t) => createHash('sha256').update(t).digest('hex');
const valorDe = (r) => valorConHuella(r, sha256);
const leerFicha = (raiz, id) => readFileSync(join(raiz, 'empresas', id, 'ficha.json'));

// ---------------------------------------------------------------- proceso hijo: el envoltorio
// Carga <raiz>/nucleo/tarifas.js como una página de la cooperativa y escribe {clave: valor} por stdout.
const hijo = arg('hijo');
if (hijo) {
  globalThis.CT_EMPRESA = hijo;
  globalThis.fetch = async (u) => {
    const texto = readFileSync(fileURLToPath(u), 'utf8');
    return { status: 200, ok: true, json: async () => JSON.parse(texto) };
  };
  const ficha = JSON.parse(leerFicha(RAIZ, hijo));
  const T = await import(pathToFileURL(join(RAIZ, 'nucleo', 'tarifas.js')).href);
  const salida = {};
  for (const caso of casosDe(ficha)) salida[caso.clave] = valorDe(T.calcularTarifa(entradaDe(caso)));
  process.stdout.write(JSON.stringify(salida));
  process.exit(0);
}

function porEnvoltorio(raiz, id) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), `--hijo=${id}`, `--raiz=${raiz}`], { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

// ---------------------------------------------------------------- regenerar
if (process.argv.includes('--regenerar')) {
  const commit = (() => { try { return execFileSync('git', ['-C', RAIZ, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return ''; } })();
  const dorada = {
    descripcion: 'Prueba dorada de tarifas: lo que cobra la app hoy (pruebas/tarifas-doradas.mjs). Cada valor: total base recargos descuento tipo destinoOficial/por rutaFija huella(resultado completo). NO editar a mano.',
    generada: { arbol: RAIZ === REPO ? 'este repo' : RAIZ, commit, por: 'nucleo/tarifas.js (envoltorio, como lo cargan las apps)', fecha: new Date().toISOString().slice(0, 10) },
    fichas: {},
    casos: {},
  };
  for (const id of COOPERATIVAS_DORADAS) {
    dorada.fichas[id] = sha256(leerFicha(RAIZ, id));
    dorada.casos[id] = porEnvoltorio(RAIZ, id);
  }
  writeFileSync(DORADA, `${JSON.stringify(dorada, null, 1)}\n`);
  const n = Object.values(dorada.casos).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`✔ dorada regenerada: ${COOPERATIVAS_DORADAS.length} cooperativas, ${n} casos → ${DORADA}`);
  process.exit(0);
}

// ---------------------------------------------------------------- comprobar
const dorada = JSON.parse(readFileSync(DORADA, 'utf8'));
const { crearTarifador } = await import(pathToFileURL(join(RAIZ, 'nucleo', 'tarifador.js')).href);
let fallas = 0;
let total = 0;
const ok = (c, m) => { if (!c) { fallas++; console.log(`✘ ${m}`); } return c; };

for (const id of COOPERATIVAS_DORADAS) {
  const bytes = leerFicha(RAIZ, id);
  if (!ok(dorada.fichas[id] === sha256(bytes), `${id}: la ficha cambió desde que se generó la dorada (si el cambio de precios es a propósito: --regenerar y revisar el diff)`)) continue;
  const ficha = JSON.parse(bytes);
  const esperado = dorada.casos[id];
  const casos = casosDe(ficha);
  ok(casos.length === Object.keys(esperado).length, `${id}: ${casos.length} casos y la dorada tiene ${Object.keys(esperado).length}`);
  // 1) directo
  const T = crearTarifador(ficha);
  let malos = 0;
  for (const caso of casos) {
    total++;
    const v = valorDe(T.calcularTarifa(entradaDe(caso)));
    if (v !== esperado[caso.clave] && malos++ < 5) ok(false, `${id} ${caso.clave} (directo): ${v} ≠ ${esperado[caso.clave]}`);
  }
  if (malos > 5) ok(false, `${id}: ${malos} casos distintos en total (directo)`);
  // 2) envoltorio, como en las apps
  const env = porEnvoltorio(RAIZ, id);
  const distintos = Object.keys(esperado).filter((k) => env[k] !== esperado[k]);
  ok(!distintos.length, `${id} (envoltorio): ${distintos.length} casos distintos, p. ej. ${distintos.slice(0, 3).map((k) => `${k}: ${env[k]} ≠ ${esperado[k]}`).join('; ')}`);
  ok(Object.keys(env).length === Object.keys(esperado).length, `${id} (envoltorio): número de casos`);
}

// Cootransrural: los 191 destinos del decreto, cada uno con su precio oficial al elegirlo de la lista.
const rosal = JSON.parse(leerFicha(RAIZ, 'cootransrural'));
const T = crearTarifador(rosal);
ok(rosal.DESTINOS_TARIFA.length === 191 && T.DESTINOS_TARIFA.length === 191, '191 destinos en la tabla del Decreto 05');
ok(rosal.DESTINOS_TARIFA.every((d) => {
  const r = T.calcularTarifa({ origen: rosal.PARADERO, destino: { titulo: d.destino, idTarifa: d.id }, fecha: new Date('2026-10-08T10:00:00-05:00') });
  return r.total === d.valor && r.tipo === 'oficial' && r.destinoOficial?.id === d.id;
}), 'cada destino del decreto elegido de la lista cobra su valor oficial');
ok(T.RUTAS.length === 14, '14 rutas de referencia');

if (fallas) {
  console.log(`✘ ${fallas} falla(s) en ${total} casos`);
  process.exit(1);
}
console.log(`✔ tarifas doradas: ${COOPERATIVAS_DORADAS.length} cooperativas, ${total} casos idénticos (directo y envoltorio)`);
