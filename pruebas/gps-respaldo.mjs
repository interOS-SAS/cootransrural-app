// El generador y el respaldo de la tienda GPS (herramientas/gps-planes.json → gps/index.html), §14.4 del diseño del GPS:
//  1) TOPES_GPS del generador (los que lleva la página en data-gps-topes) son los de §14.1.2; si está a mano el servidor de
//     esta ronda (src/gps/planes.js), se comparan también con sus TOPES, y su publicoDe() con la semilla tiene que dar el
//     respaldo;
//  2) con cada caso de pruebas/gps-planes-casos.mjs (los mismos cuerpos que la página tiene que rechazar), el generador se
//     niega a armar la tienda y dice qué y dónde; con los válidos, la arma (y con otra licencia que la del Plan B, se niega);
//  3) el generador completo, con un respaldo inválido, termina con error SIN escribir ni una página (copia aparte; nunca
//     escribe en el repositorio); con el respaldo de la rama, la tienda generada es la del repositorio.
// Uso: node pruebas/gps-respaldo.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { casosPlanes } from './gps-planes-casos.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/gps/r2/pruebas/tienda').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
let bien = 0;
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✔' : '✘'} ${m}`); if (c) bien += 1; else fallas += 1; };

const PLANES = JSON.parse(readFileSync(join(REPO, 'herramientas/gps-planes.json'), 'utf8'));
const CASOS = casosPlanes(PLANES.respaldo);
const TMP = mkdtempSync(join(DIR, 'respaldo-'));
try {
  // ---------------------------------------------------------------- 1) y 2): el generador como módulo, caso por caso
  writeFileSync(join(TMP, 'casos.json'), JSON.stringify(CASOS.map((c) => c.cuerpo)));
  const py = `
import importlib.util, json, pathlib, sys
spec = importlib.util.spec_from_file_location('g', ${JSON.stringify(join(REPO, 'herramientas/generar-empresas.py'))})
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
base = json.loads(g.GPS_PLANES.read_text(encoding='utf-8'))
salida = {'topes': g.TOPES_GPS, 'cuota': g.CUOTA_MES, 'casos': []}
tmp = pathlib.Path(${JSON.stringify(join(TMP, 'gps-planes.json'))})
for cuerpo in json.loads(pathlib.Path(${JSON.stringify(join(TMP, 'casos.json'))}).read_text()):
    d = dict(base); d['respaldo'] = cuerpo
    tmp.write_text(json.dumps(d, ensure_ascii=False), encoding='utf-8')
    g.GPS_PLANES = tmp; g._CACHE.pop('gps', None)
    error = ''
    try: g.gps_tienda()
    except ValueError as e: error = str(e)
    salida['casos'].append({'problemas': g.revisar_planes_gps(cuerpo), 'error': error})
print(json.dumps(salida, ensure_ascii=False))
`;
  const r = JSON.parse(execFileSync('python3', ['-c', py], { encoding: 'utf8', maxBuffer: 1 << 26 }));

  // 1) Los topes
  const DISENO = {
    planes: [1, 6], nombre: [2, 40], lema: [0, 80], condiciones: [0, 5], condicion: [3, 140], comboNombre: [2, 40], comboLema: [0, 80],
    precioEquipo: [0, 1500000], instalacion: [0, 300000], mes: [10000, 300000], permanenciaMeses: [0, 36], ahorroMesMin: 1000,
    licenciaMes: [10000, 100000], flotasDesde: [2, 200], extras: [0, 6], extraTexto: [3, 80], extraValor: [0, 500000], multiplo: 100,
    idPatron: '^[a-z][a-z0-9_]{1,23}$', idsReservados: ['combo', 'no_se'], version: [1, 1000000], bytes: 32768,
  };
  const distintos = Object.keys(DISENO).filter((k) => JSON.stringify(DISENO[k]) !== JSON.stringify(r.topes[k]));
  ok(distintos.length === 0 && Object.keys(r.topes).length === Object.keys(DISENO).length, `TOPES_GPS son los de §14.1.2${distintos.length ? ': distintos ' + distintos : ''}`);
  const generada = readFileSync(join(REPO, 'gps/index.html'), 'utf8');
  const enPagina = /data-gps-topes="([^"]+)"/.exec(generada);
  ok(enPagina && JSON.stringify(JSON.parse(enPagina[1].replace(/&quot;/g, '"'))) === JSON.stringify(r.topes), 'gps/index.html lleva esos mismos topes en data-gps-topes');
  const PLANES_SERVIDOR = process.env.PLANES_SERVIDOR || '/tmp/cootrans/gps/r2/servidor/src/gps/planes.js';
  if (existsSync(PLANES_SERVIDOR)) {
    try {
      const m = await import(PLANES_SERVIDOR);
      const T = m.TOPES || {};
      const comunes = Object.keys(DISENO).filter((k) => k in T);
      const otros = comunes.filter((k) => JSON.stringify(T[k]) !== JSON.stringify(DISENO[k]));
      if (comunes.length) ok(otros.length === 0, `los topes del servidor (${PLANES_SERVIDOR}) coinciden en ${comunes.length} campo(s)${otros.length ? '; distintos: ' + otros : ''}`);
      else console.log(`(TOPES de ${PLANES_SERVIDOR} tiene otra forma: ${Object.keys(T).slice(0, 8).join(', ')}…; se comparan en la integración)`);
      // El cuerpo público que arma el servidor con la semilla de §14.1.1 tiene que ser el respaldo, campo por campo.
      const diseno = '/tmp/cootrans/gps/DISENO-GPS.md';
      if (typeof m.publicoDe === 'function' && existsSync(diseno)) {
        const t = readFileSync(diseno, 'utf8');
        const sec = t.slice(t.indexOf('#### 14.1.1'), t.indexOf('#### 14.1.2'));
        const semilla = JSON.parse(/```json\n([\s\S]*?)```/.exec(sec)[1]);
        const delServidor = m.publicoDe(semilla, 1);
        ok(isDeepStrictEqual(JSON.parse(JSON.stringify(delServidor)), PLANES.respaldo), `publicoDe(semilla de §14.1.1, 1) del servidor es el respaldo, campo por campo${isDeepStrictEqual(JSON.parse(JSON.stringify(delServidor)), PLANES.respaldo) ? '' : ': ' + JSON.stringify(delServidor).slice(0, 300)}`);
      }
    } catch (e) {
      console.log(`(no se pudo cargar ${PLANES_SERVIDOR}: ${e.message.split('\n')[0]})`);
    }
  } else console.log(`(sin ${PLANES_SERVIDOR}: los topes no se comparan con los del servidor)`);

  // 2) Caso por caso
  CASOS.forEach((c, i) => {
    const { problemas, error } = r.casos[i];
    if (c.valido) {
      const niega = c.soloGenerador ? new RegExp(c.soloGenerador).test(error) : !error;
      ok(problemas.length === 0 && niega, `${c.nombre}: ${c.soloGenerador ? `cumple los topes, pero el generador se niega («${error.slice(0, 110)}…»)` : 'el generador la arma'}${problemas.length ? ' · ' + JSON.stringify(problemas) : ''}`);
    } else {
      const tiene = problemas.some(([ruta, codigo]) => ruta === c.ruta && codigo === c.codigo);
      ok(tiene && error.includes(`${c.ruta} ${c.codigo}`), `${c.nombre}: el generador se niega (${c.ruta} ${c.codigo})${tiene ? '' : ' · encontró ' + JSON.stringify(problemas)}`);
    }
  });

  // ---------------------------------------------------------------- 3) el generador completo, en una copia aparte
  const COPIA = join(TMP, 'copia');
  for (const d of ['herramientas', 'plantillas', 'empresas']) cpSync(join(REPO, d), join(COPIA, d), { recursive: true });
  mkdirSync(join(COPIA, 'nucleo'), { recursive: true });
  const malo = CASOS.find((c) => c.nombre === 'mes de 9.900');
  writeFileSync(join(COPIA, 'herramientas/gps-planes.json'), JSON.stringify({ ...PLANES, respaldo: malo.cuerpo }, null, 2));
  const antes = readdirSync(COPIA).sort();
  const corrida = spawnSync('python3', [join(COPIA, 'herramientas/generar-empresas.py')], { cwd: COPIA, encoding: 'utf8' });
  const despues = readdirSync(COPIA).sort();
  ok(corrida.status !== 0 && /gps-planes\.json.*planes\[compra\]\.mes fuera_de_tope/.test(corrida.stderr), `con un respaldo inválido, el generador termina con error y dice dónde (${(corrida.stderr.trim().split('\n').pop() || '').slice(0, 120)}…)`);
  ok(JSON.stringify(antes) === JSON.stringify(despues) && !existsSync(join(COPIA, 'gps')) && !existsSync(join(COPIA, 'nucleo/politica.js')), `… y sin escribir ni una página (${despues.join(', ')})`);
  writeFileSync(join(COPIA, 'herramientas/gps-planes.json'), JSON.stringify(PLANES, null, 2));
  const buena = spawnSync('python3', [join(COPIA, 'herramientas/generar-empresas.py')], { cwd: COPIA, encoding: 'utf8' });
  const sinVersiones = (t) => t.replace(/\?v=[0-9a-f]+/g, '');
  ok(buena.status === 0 && sinVersiones(readFileSync(join(COPIA, 'gps/index.html'), 'utf8')) === sinVersiones(generada), 'con el respaldo de la rama, la tienda generada es la del repositorio (salvo las huellas ?v=)');
} finally {
  rmSync(TMP, { recursive: true, force: true });
}
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · generador y respaldo de la tienda GPS · ${bien} ✔ · ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
