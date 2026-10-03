// Fase 2 del panel (parte web), sin navegador: festivos, rutas «fijada», zona de servicio y la recarga
// por el mensaje «config».
//
//  1) Festivos de Colombia (Ley 51 de 1983, §5.6): los 18 de 2026 del diseño, 2025 (San Pedro y el
//     Sagrado Corazón el mismo lunes) y 2027; el día se cuenta en Bogotá (23:59 del festivo sí, 00:00 del
//     día siguiente no, aunque en UTC ya sea otro día).
//  2) El cálculo (nucleo/tarifador.js): en un festivo se cobra el recargo dominical («Recargo festivo»),
//     salvo recargoDominicalEnFestivos: false; el domingo sigue diciendo «Recargo dominical»; con
//     recargoUnico, de noche en un festivo, uno solo. Cootransrural (recargos en $0) no cambia.
//  3) Rutas «fijada» (precio que pone la cooperativa en el panel): tipo 'fijada', «Precio fijado por
//     Cootransrural» y sin «por confirmar»; sin la marca, siguen siendo precio de referencia.
//  4) dentroDeZona (util.js, la misma cuenta que hará la central) y revisarZona (geo.js, con la zona que
//     lee config.js de la ficha): dentro, cerca (≤ avisarHastaKm), lejos, avisarHastaKm 0 y 99, polígonos
//     con huecos, varias zonas, zonas dañadas y puntos que no son puntos.
//  5) vigilarConfig (config.js) con un bus y un documento simulados: solo el bus del servidor; solo la
//     cooperativa propia y versiones nuevas; con viaje espera; sin viaje y con la app oculta recarga de
//     una vez; nunca dos veces por la misma versión (ni en otra carga de la página).
//
// Uso: node pruebas/festivos-zona.mjs   (unos segundos; sale con 1 si algo falla)
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ficha = (id) => JSON.parse(readFileSync(join(REPO, 'empresas', id, 'ficha.json'), 'utf8'));
const modo = process.argv.find((a) => a.startsWith('--modo='))?.slice(7);

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};

/* ------------------------------------------------------------------ */
/* Proceso hijo: config.js y geo.js con una ficha y un documento falsos */
/* ------------------------------------------------------------------ */
if (modo === 'zona' || modo === 'config') {
  const id = 'cootransrural';
  const f = ficha(id);
  const extra = JSON.parse(process.env.FICHA_EXTRA || '{}');
  Object.assign(f, extra);
  globalThis.CT_EMPRESA = id;
  // Documento mínimo: visibilitychange y las clases de html (plataforma.js).
  const oyentes = new Map();
  globalThis.document = {
    hidden: false,
    documentElement: { dataset: {}, classList: { toggle() {}, add() {}, remove() {} } },
    addEventListener(t, fn) {
      if (!oyentes.has(t)) oyentes.set(t, new Set());
      oyentes.get(t).add(fn);
    },
    removeEventListener(t, fn) {
      oyentes.get(t)?.delete(fn);
    },
    disparar(t) {
      for (const fn of oyentes.get(t) || []) fn({ type: t });
    },
  };
  const almacen = new Map(Object.entries(JSON.parse(process.env.ALMACEN || '{}')));
  globalThis.localStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => almacen.set(k, String(v)),
    removeItem: (k) => almacen.delete(k),
  };
  globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(f)) });
  const C = await import(pathToFileURL(join(REPO, 'nucleo', 'config.js')).href);
  const salida = {};
  if (modo === 'zona') {
    const G = await import(pathToFileURL(join(REPO, 'nucleo', 'geo.js')).href);
    const puntos = JSON.parse(process.env.PUNTOS || '[]');
    salida.zona = C.ZONA_SERVICIO ? { avisarHastaKm: C.ZONA_SERVICIO.avisarHastaKm, texto: C.ZONA_SERVICIO.texto, anillos: C.ZONA_SERVICIO.poligonos.length } : null;
    salida.version = C.VERSION_CONFIG;
    salida.puntos = puntos.map((p) => G.revisarZona(p));
  } else {
    // Bus simulado (como BusServidor: real = true y on() devuelve cómo dejar de oír).
    const { Emisor } = await import(pathToFileURL(join(REPO, 'nucleo', 'util.js')).href);
    const bus = new Emisor();
    bus.real = process.env.BUS_REAL !== '0';
    const emisor = new Emisor();
    let ocupado = process.env.OCUPADO === '1';
    const recargas = [];
    C.vigilarConfig(bus, { ocupado: () => ocupado, emisor, recargar: () => recargas.push(Date.now()) });
    const pasos = JSON.parse(process.env.PASOS || '[]');
    const log = [];
    for (const p of pasos) {
      if (p.config) bus.emit('config', p.config);
      if ('ocupado' in p) {
        ocupado = p.ocupado;
        emisor.emit('cambio', {});
      }
      if ('oculta' in p) {
        document.hidden = p.oculta;
        document.disparar('visibilitychange');
      }
      log.push(recargas.length);
    }
    salida.recargas = log;
    salida.almacen = Object.fromEntries(almacen);
  }
  process.stdout.write(JSON.stringify(salida));
  process.exit(0);
}

function hijo(env) {
  const out = execFileSync(process.execPath, [fileURLToPath(import.meta.url), `--modo=${env.MODO}`], {
    env: { ...process.env, ...Object.fromEntries(Object.entries(env).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])) },
  });
  return JSON.parse(out);
}

/* ------------------------------------------------------------------ */
/* 1) Festivos                                                          */
/* ------------------------------------------------------------------ */
const U = await import(pathToFileURL(join(REPO, 'nucleo', 'util.js')).href);
const lista = (anio) => [...U.festivosDe(anio)].sort().join(' ');
const F2026 = ['01-01', '01-12', '03-23', '04-02', '04-03', '05-01', '05-18', '06-08', '06-15', '06-29', '07-20', '08-07', '08-17', '10-12', '11-02', '11-16', '12-08', '12-25'];
ok(lista(2026) === F2026.map((d) => `2026-${d}`).join(' '), `festivos 2026: los 18 del diseño (${U.festivosDe(2026).size})`);
// 2025: el Sagrado Corazón (Pascua + 71) cae el mismo lunes que San Pedro (30-jun): 17 fechas.
const F2025 = ['01-01', '01-06', '03-24', '04-17', '04-18', '05-01', '06-02', '06-23', '06-30', '07-20', '08-07', '08-18', '10-13', '11-03', '11-17', '12-08', '12-25'];
ok(lista(2025) === F2025.map((d) => `2025-${d}`).join(' '), 'festivos 2025 (17 fechas: San Pedro y el Sagrado Corazón el 30-jun)');
const F2027 = ['01-01', '01-11', '03-22', '03-25', '03-26', '05-01', '05-10', '05-31', '06-07', '07-05', '07-20', '08-07', '08-16', '10-18', '11-01', '11-15', '12-08', '12-25'];
ok(lista(2027) === F2027.map((d) => `2027-${d}`).join(' '), 'festivos 2027');
ok(U.esFestivo('2026-10-12T23:59:00-05:00') && !U.esFestivo('2026-10-13T00:00:00-05:00'), 'el día se cuenta en Bogotá: 12-oct 11:59 p. m. sí, 13-oct 12:00 a. m. no');
ok(U.esFestivo('2026-10-13T04:30:00Z'), '13-oct 04:30 UTC = 12-oct 11:30 p. m. en Bogotá: festivo');
ok(!U.esFestivo('2026-10-11T15:00:00-05:00') && U.horaBogota('2026-10-11T15:00:00-05:00').domingo, 'un domingo no es festivo (es domingo)');
const hb = U.horaBogota('2026-12-25T21:15:00-05:00');
ok(hb.festivo && hb.hora === 21 && hb.fecha === '2026-12-25' && !hb.domingo, 'horaBogota: hora, fecha y festivo (25-dic, 9:15 p. m.)');
ok(U.festivosDe(1900).size === 0 && U.festivosDe(NaN).size === 0, 'años fuera de rango: sin festivos (no revienta)');

/* ------------------------------------------------------------------ */
/* 2) y 3) El cálculo: festivos y rutas «fijada»                       */
/* ------------------------------------------------------------------ */
const { crearTarifador, esFestivo } = await import(pathToFileURL(join(REPO, 'nucleo', 'tarifador.js')).href);
ok(esFestivo === U.esFestivo, 'tarifador.js exporta el mismo esFestivo de util.js (la copia fijada lleva util.js)');
const sub = ficha('subachoque');
const T = crearTarifador(sub);
const sinDestino = (fecha) => T.calcularTarifa({ origen: sub.CENTRO, destino: null, fecha });
const fes = sinDestino('2026-10-12T10:00:00-05:00');
const jue = sinDestino('2026-10-08T10:00:00-05:00');
const dom = sinDestino('2026-10-11T10:00:00-05:00');
ok(fes.recargos === 1000 && fes.detalle.some((d) => d.concepto === 'Recargo festivo' && d.valor === 1000), `festivo de día: recargo festivo de $1.000 (${fes.total})`);
ok(jue.recargos === 0 && fes.total === jue.total + 1000, 'día hábil a la misma hora: sin recargo');
ok(dom.detalle.some((d) => d.concepto === 'Recargo dominical') && dom.total === fes.total, 'domingo: «Recargo dominical», el mismo valor');
const fesNoche = sinDestino('2026-10-12T22:00:00-05:00');
ok(fesNoche.recargos === 3000, 'festivo de noche: nocturno + festivo ($3.000)');
const Tno = crearTarifador({ ...sub, TARIFAS: { ...sub.TARIFAS, recargoDominicalEnFestivos: false } });
const fesNo = Tno.calcularTarifa({ origen: sub.CENTRO, destino: null, fecha: '2026-10-12T10:00:00-05:00' });
ok(fesNo.recargos === 0, 'recargoDominicalEnFestivos: false → el festivo no cobra recargo');
const chia = ficha('chia-autoservicio');
const Tc = crearTarifador(chia);
const unico = Tc.calcularTarifa({ origen: chia.CENTRO, destino: null, fecha: '2026-10-12T22:00:00-05:00' });
ok(chia.TARIFAS.recargoUnico && unico.detalle.filter((d) => /^Recargo/.test(d.concepto)).length === 1, 'recargoUnico (Chía): de noche en un festivo, un solo recargo');
const coop = ficha('cootransrural');
const Tr = crearTarifador(coop);
const lugar = coop.LUGARES.find((l) => l.nombre === 'Tierra Grata') || coop.LUGARES[3];
const rFes = Tr.calcularTarifa({ origen: coop.PARADERO, destino: lugar, fecha: '2026-10-12T10:00:00-05:00' });
const rJue = Tr.calcularTarifa({ origen: coop.PARADERO, destino: lugar, fecha: '2026-10-08T10:00:00-05:00' });
ok(rFes.total === rJue.total && rFes.recargos === 0, `Cootransrural: el festivo cuesta lo mismo (recargos en $0): ${rFes.total}`);

// Rutas «fijada» (fase 2): Madrid con precio fijado por la cooperativa.
const madrid = coop.LUGARES.find((l) => l.id === 'madrid');
const conFijada = { ...coop, RUTAS: coop.RUTAS.map((r) => (r.id === 'madrid' ? { ...r, valor: 32000, fijada: true } : r)) };
const Tf = crearTarifador(conFijada);
const fij = Tf.calcularTarifa({ origen: coop.PARADERO, destino: madrid, fecha: '2026-10-08T10:00:00-05:00' });
ok(fij.tipo === 'fijada' && fij.total === 32000 && fij.etiqueta === 'Precio fijado por Cootransrural', `ruta fijada: ${fij.etiqueta} · ${fij.total}`);
ok(fij.detalle[0]?.concepto === 'Precio fijado por Cootransrural: El Rosal → Madrid', `detalle: «${fij.detalle[0]?.concepto}»`);
ok(!fij.notas[0].includes('confirmar') && /no fija viajes a otros municipios: este precio lo fija Cootransrural/.test(fij.notas[0]), `la nota de la ruta no dice «por confirmar»: «${fij.notas[0]}»`);
const ref = Tr.calcularTarifa({ origen: coop.PARADERO, destino: madrid, fecha: '2026-10-08T10:00:00-05:00' });
ok(ref.tipo === 'referencia' && ref.etiqueta === 'Precio de referencia', 'sin «fijada»: sigue siendo precio de referencia (como hoy)');
const fac = coop.LUGARES.find((l) => l.id === 'facatativa');
ok(Tf.calcularTarifa({ origen: coop.PARADERO, destino: fac }).tipo === 'referencia', 'las demás rutas de la misma ficha siguen de referencia');
const Ts = crearTarifador({ ...sub, RUTAS: sub.RUTAS.map((r) => ({ ...r, fijada: true })) });
const enDemo = Ts.calcularTarifa({ origen: sub.CENTRO, destino: sub.LUGARES.find((l) => l.id === sub.RUTAS[0].id) });
ok(enDemo.tipo === 'fijada' && enDemo.etiqueta === 'Tarifa de ejemplo', 'ficha de ejemplo con «fijada»: el chip sigue diciendo «Tarifa de ejemplo»');

/* ------------------------------------------------------------------ */
/* 4) Zona de servicio                                                  */
/* ------------------------------------------------------------------ */
// Cuadrado de ~11 km de lado alrededor de El Rosal (4.80–4.90, -74.31 – -74.21).
const CUADRO = [[4.80, -74.31], [4.90, -74.31], [4.90, -74.21], [4.80, -74.21]];
const z = { poligonos: [CUADRO] };
const dentro = U.dentroDeZona(z, { lat: 4.85, lng: -74.26 });
ok(dentro?.dentro === true && Math.abs(dentro.metros - 5530) < 30, `dentro, a ${dentro?.metros} m del borde`);
const afuera = U.dentroDeZona(z, { lat: 4.85, lng: -74.20 });
ok(afuera?.dentro === false && Math.abs(afuera.metros - 1110) < 15, `afuera, a ${afuera?.metros} m del borde (≈ 0,01° de longitud)`);
ok(U.dentroDeZona([CUADRO], { lat: 4.85, lng: -74.26 })?.dentro === true, 'también acepta la lista de anillos sola');
ok(U.dentroDeZona({ poligonos: [[CUADRO, [[4.84, -74.27], [4.86, -74.27], [4.86, -74.25], [4.84, -74.25]]]] }, { lat: 4.85, lng: -74.26 })?.dentro === true, 'polígono con hueco: cuenta el borde exterior');
const dos = { poligonos: [CUADRO, [[5.00, -74.31], [5.10, -74.31], [5.10, -74.21], [5.00, -74.21]]] };
ok(U.dentroDeZona(dos, { lat: 5.05, lng: -74.26 })?.dentro === true && U.dentroDeZona(dos, { lat: 4.95, lng: -74.26 })?.dentro === false, 'dos polígonos: dentro del segundo; entre los dos, afuera');
ok(U.dentroDeZona(null, { lat: 4.85, lng: -74.26 }) === null && U.dentroDeZona({ poligonos: [[[4.8, -74.3], [4.9, -74.3]]] }, { lat: 4.85, lng: -74.26 }) === null, 'sin zona o con un anillo de 2 puntos: null (no se revisa)');
ok(U.dentroDeZona({ poligonos: [[[4.8, 'x'], [4.9, -74.3], [4.9, -74.2]]] }, { lat: 4.85, lng: -74.26 }) === null && U.dentroDeZona({ poligonos: 'x' }, { lat: 1, lng: 1 }) === null, 'coordenadas que no son números: null');
ok(U.dentroDeZona(z, { lat: 'a', lng: -74.2 }) === null && U.dentroDeZona(z, null) === null, 'un punto que no es punto: null');

// revisarZona con la zona leída de la ficha (config.js): dentro, cerca (1,1 km) y lejos (3,3 km) con el
// aviso por defecto (2 km); con 0, afuera siempre «lejos»; con 99, siempre «cerca».
const P = [{ lat: 4.85, lng: -74.26 }, { lat: 4.85, lng: -74.20 }, { lat: 4.85, lng: -74.18 }];
const z2 = hijo({ MODO: 'zona', FICHA_EXTRA: { ZONA_SERVICIO: { poligonos: [CUADRO], texto: 'Fuera de El Rosal‮ <b>ojo</b>\n' }, VERSION_CONFIG: { version: 4, publicada: '2026-10-06T05:00:00Z', fuente: { acto: 'Decreto 05 de 2026' } } }, PUNTOS: P });
ok(z2.zona?.avisarHastaKm === 2 && z2.zona.texto === 'Fuera de El Rosal <b>ojo</b>', `config.js: avisar hasta 2 km por defecto y el texto plano (sin caracteres de dirección): «${z2.zona?.texto}»`);
ok(z2.puntos.map((x) => x?.estado).join(',') === 'dentro,cerca,lejos', `revisarZona: ${z2.puntos.map((x) => `${x?.estado} ${x?.metros} m`).join(' · ')}`);
ok(z2.version?.version === 4 && z2.version.fuente.acto === 'Decreto 05 de 2026', 'VERSION_CONFIG leída de la ficha');
const z0 = hijo({ MODO: 'zona', FICHA_EXTRA: { ZONA_SERVICIO: { poligonos: [CUADRO], avisarHastaKm: 0 } }, PUNTOS: P });
ok(z0.puntos.map((x) => x?.estado).join(',') === 'dentro,lejos,lejos', 'avisarHastaKm 0: todo lo de afuera es «lejos» (no deja pedir)');
const z99 = hijo({ MODO: 'zona', FICHA_EXTRA: { ZONA_SERVICIO: { poligonos: [CUADRO], avisarHastaKm: 99 } }, PUNTOS: P });
ok(z99.puntos.map((x) => x?.estado).join(',') === 'dentro,cerca,cerca', 'avisarHastaKm 99: solo avisa');
const zNo = hijo({ MODO: 'zona', FICHA_EXTRA: {}, PUNTOS: P });
ok(zNo.zona === null && zNo.version === null && zNo.puntos.every((x) => x === null), 'la ficha del archivo (sin capa): sin zona ni versión, no se revisa nada');
const zMal = hijo({ MODO: 'zona', FICHA_EXTRA: { ZONA_SERVICIO: { poligonos: [[[4.8, -74.3]]], avisarHastaKm: -3 }, VERSION_CONFIG: { version: '2' } }, PUNTOS: P });
ok(zMal.zona === null && zMal.version === null, 'zona o versión dañadas: se ignoran (como sin capa)');

/* ------------------------------------------------------------------ */
/* 5) Recarga por «config»                                              */
/* ------------------------------------------------------------------ */
const conVersion = { VERSION_CONFIG: { version: 3, publicada: '2026-10-06T05:00:00Z' } };
const c1 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, PASOS: [{ oculta: true }, { config: { empresa: 'cootransrural', version: 4 } }] });
ok(c1.recargas.join() === '0,1', 'sin viaje y con la app oculta: recarga de una vez');
ok(JSON.parse(c1.almacen['tc.config.recargas'] || '{}').cootransrural?.version === 4, 'anota la versión por la que recargó');
const c2 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, OCUPADO: '1', PASOS: [{ oculta: true }, { config: { empresa: 'cootransrural', version: 4 } }, { ocupado: false }] });
ok(c2.recargas.join() === '0,0,1', 'con un viaje activo espera; al terminar el viaje (cambio), recarga');
const c3 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, PASOS: [{ oculta: true }, { config: { empresa: 'otra-coop', version: 9 } }, { config: { empresa: 'cootransrural', version: 3 } }, { config: { empresa: 'cootransrural', version: 2 } }, { config: { empresa: 'cootransrural', version: 'x' } }, { config: null }] });
ok(c3.recargas.every((n) => n === 0), 'otra cooperativa, la misma versión, una vieja o datos dañados: no recarga');
const c4 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, BUS_REAL: '0', PASOS: [{ oculta: true }, { config: { empresa: 'cootransrural', version: 5 } }] });
ok(c4.recargas.every((n) => n === 0), 'el bus de la demo (relés públicos): no hace caso');
const c5 = hijo({ MODO: 'config', FICHA_EXTRA: {}, ALMACEN: { 'tc.config.recargas': JSON.stringify({ cootransrural: { version: 1, t: Date.now() } }) }, PASOS: [{ oculta: true }, { config: { empresa: 'cootransrural', version: 1 } }, { config: { empresa: 'cootransrural', version: 2 } }] });
ok(c5.recargas.join() === '0,0,1', 'ya recargó por la v1 y la ficha sigue sin versión (nginx aún sirve el archivo): no entra en ciclo; la v2 sí');
const c6 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, PASOS: [{ config: { empresa: 'cootransrural', version: 4 } }, { ocupado: false }] });
ok(c6.recargas.join() === '0,0', 'con la app a la vista y la persona usándola: no recarga de inmediato (espera a que la deje quieta o la oculte)');
const c7 = hijo({ MODO: 'config', FICHA_EXTRA: conVersion, PASOS: [{ config: { empresa: 'cootransrural', version: 4 } }, { oculta: true }] });
ok(c7.recargas.join() === '0,1', '… y al ocultarla, recarga');

console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'} · festivos, rutas fijadas, zona y recarga · ${bien} ✔ · ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
