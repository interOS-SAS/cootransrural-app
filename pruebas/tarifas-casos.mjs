// Casos de la prueba dorada de tarifas (§5.5 y S33 del diseño del panel).
//
// Puro: solo depende de la ficha (empresas/<id>/ficha.json). Lo usan:
//   - pruebas/tarifas-doradas.mjs (este repo): nucleo/tarifador.js contra pruebas/tarifas-doradas.json;
//   - el servidor (taxicun-servidor, pruebas/tarifas-doradas.test.js): la COPIA FIJADA de tarifador.js,
//     con la ficha del archivo y con la ficha armada por la API (archivo + capa), contra la misma dorada.
// Por eso no importa nada: el servidor lo lee del commit fijado con «git show» y lo carga tal cual.
//
// Cada caso es { clave, entrada } y entrada es lo que recibe calcularTarifa (con la fecha en ISO, con su
// desfase de Bogotá). La clave dice qué se probó: «lista:z5-escuela-buenavista@jue-1000».
// No cambiar los casos sin regenerar la dorada (node pruebas/tarifas-doradas.mjs --regenerar) y revisar
// el diff: la dorada fija los precios de HOY.

// Cooperativa con tarifas oficiales y demos de la muestra: una por cada combinación distinta de tarifas
// (mínima, banderazo, km, redondeo, recargos, horario nocturno, descuentos, recargo único) y Subachoque.
export const COOPERATIVA_OFICIAL = 'cootransrural';
export const MUESTRA_DEMOS = Object.freeze([
  'agua-de-dios', 'chia-autoservicio', 'facatativa', 'facatativa-autofaca', 'funza-coomofu', 'funza-coopexfun',
  'fusagasuga-asoind', 'gacheta', 'girardot-central-taxis', 'guasca', 'guatavita', 'la-mesa',
  'la-vega-cootransgualiva', 'mosquera', 'nocaima', 'san-antonio-del-tequendama', 'sesquile', 'subachoque', 'tabio',
  'villeta-cootransye', 'zipaquira-cootranszipa',
]);
export const COOPERATIVAS_DORADAS = Object.freeze([COOPERATIVA_OFICIAL, ...MUESTRA_DEMOS]);

// Días: jueves normal, domingo y lunes festivo (12-oct-2026, Día de la Raza). Desde la fase 2 (§5.6) el
// festivo cobra el recargo dominical (salvo recargoDominicalEnFestivos: false): la dorada se regeneró a
// propósito con ese cambio y solo cambiaron los casos fes-* de las demos con recargo dominical
// (Cootransrural no cambia: sus recargos son $0).
const DIAS = { jue: '2026-10-08', dom: '2026-10-11', fes: '2026-10-12' };
// Horas: madrugada (noche para todas), 5:30 (noche si termina a las 6), día, y los bordes de las
// noches que empiezan a las 18, 19, 20 y 21.
const HORAS = ['0430', '0530', '1000', '1830', '1930', '2030', '2330'];
export const MOMENTOS = Object.freeze(Object.fromEntries(
  Object.entries(DIAS).flatMap(([d, f]) => HORAS.map((h) => [`${d}-${h}`, `${f}T${h.slice(0, 2)}:${h.slice(2)}:00-05:00`])),
));
const T0 = 'jue-1000';
const TODOS = Object.keys(MOMENTOS);
// Las 4 horas de S33 en día normal, domingo y festivo (para lo que no necesita las 7).
const CUATRO = TODOS.filter((m) => /-(0430|1000|1930|2330)$/.test(m));

const ubicado = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
const r6 = (x) => Math.round(x * 1e6) / 1e6;

// Punto a «km» del centro con rumbo «grados» (0 = norte), en un plano local.
function desplazar(c, km, grados) {
  const rad = (grados * Math.PI) / 180;
  return {
    lat: r6(c.lat + (km * Math.cos(rad)) / 110.57),
    lng: r6(c.lng + (km * Math.sin(rad)) / (111.32 * Math.cos((c.lat * Math.PI) / 180))),
  };
}

// Recogida por defecto de la app: el paradero oficial si la ficha lo trae; si no, el centro (config.js).
function recogida(ficha) {
  const p = ficha.PARADERO;
  return ubicado(p) ? { lat: p.lat, lng: p.lng } : { lat: ficha.CENTRO.lat, lng: ficha.CENTRO.lng };
}

function lugarDe(ficha, id) {
  const l = (ficha.LUGARES || []).find((x) => x.id === id);
  return ubicado(l) ? { titulo: l.nombre, lat: l.lat, lng: l.lng } : null;
}

// Puntos de El Rosal en los bordes (buscados una vez sobre la ficha de hoy y fijados aquí):
//   · dentro del casco urbano, a 145 y 155 m del destino con precio propio más cercano (radio de 150 m);
//   · recogida fuera del casco, a 70–90 m del borde y a más de 90 m (margen de 80 m por el GPS).
const BORDES_ROSAL = {
  casco: [
    ['z2-fiorento-interior-recepcion', 145, { lat: 4.844461, lng: -74.260162 }],
    ['z2-fiorento-interior-recepcion', 155, { lat: 4.844431, lng: -74.260077 }],
    ['z2-vagones-autopista-bogota-por-campo-alegre', 145, { lat: 4.840515, lng: -74.25909 }],
    ['z2-vagones-autopista-bogota-por-campo-alegre', 155, { lat: 4.840584, lng: -74.259148 }],
  ],
  recogidas: [
    ['70a90m-n', { lat: 4.8591, lng: -74.26059 }],
    ['mas90m-n', { lat: 4.859308, lng: -74.26059 }],
    ['70a90m-nne', { lat: 4.859918, lng: -74.259298 }],
    ['mas90m-nne', { lat: 4.860301, lng: -74.259231 }],
  ],
};

// Distancias (m) y rumbos alrededor de un destino de la tabla, a lado y lado de cada radio.
const ANILLO = [[145, 0], [155, 0], [145, 180], [155, 180], [295, 90], [305, 90], [395, 270], [405, 270]];
const ANILLO_CASCO = Array.from({ length: 24 }, (_, i) => i * 15).filter((g) => g % 90).flatMap((g) => [[145, g], [155, g]]);
const kmPlano = (a, b) => Math.hypot((a.lat - b.lat) * 110.57, (a.lng - b.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180));

// Puntos para estimar por distancia: [nombre, km, rumbo].
const PUNTOS = [['n1', 1.2, 0], ['ne2', 2.5, 45], ['e3', 3.5, 90], ['so5', 5, 225], ['s7', 7, 180], ['se10', 10, 135], ['o15', 15, 270], ['no25', 25, 315]];

export function casosDe(ficha) {
  const casos = [];
  const origen = recogida(ficha);
  const centro = { lat: ficha.CENTRO.lat, lng: ficha.CENTRO.lng };
  const agregar = (clave, entrada, momentos = [T0]) => {
    for (const m of momentos) casos.push({ clave: `${clave}@${m}`, entrada: { origen: null, destino: null, ...entrada, fecha: MOMENTOS[m] } });
  };

  // Sin destino, y sin origen ni destino (la cotización de la web sin datos).
  agregar('sin-destino', { origen }, TODOS);
  agregar('sin-nada', {});

  // Rutas a otros municipios. Cootransrural: las 14 a las 4 horas de S33 en día normal, domingo y
  // festivo. Demos: la primera a esas horas y las demás de día y un domingo de noche (los recargos son
  // los mismos para todo destino: la hora se prueba a fondo con «sin-destino»).
  const oficial = ficha.id === COOPERATIVA_OFICIAL;
  (ficha.RUTAS || []).forEach((ruta, i) => {
    const destino = lugarDe(ficha, ruta.id);
    if (!destino) return;
    agregar(`ruta:${ruta.id}`, { origen, destino }, oficial || i === 0 ? CUATRO : [T0, 'dom-2330']);
    if (oficial || i === 0) agregar(`ruta-km:${ruta.id}`, { origen, destino, km: ruta.km });
    // Desde más de 8 km del centro ya no es la ruta fija: se estima.
    if (i === 0) {
      agregar(`ruta-desde-lejos:${ruta.id}`, { origen: desplazar(centro, 12, 200), destino });
      for (const km of [7.9, 8.1]) agregar(`ruta-desde-${km * 1000}m:${ruta.id}`, { origen: desplazar(centro, km, 200), destino });
    }
  });

  // Lugares frecuentes de la ficha (los que la gente elige de la lista).
  const lugares = (ficha.LUGARES || []).filter(ubicado);
  for (const l of oficial ? lugares : lugares.slice(0, 8)) {
    agregar(`lugar:${l.id}`, { origen, destino: { titulo: l.nombre, lat: l.lat, lng: l.lng } });
  }

  // Puntos en el mapa a varias distancias: sin km (línea recta × 1,35) y con km por vía.
  for (const [nombre, km, grados] of PUNTOS) {
    const destino = { titulo: 'Punto en el mapa', ...desplazar(centro, km, grados) };
    agregar(`punto:${nombre}`, { origen, destino }, nombre === 'e3' ? CUATRO : [T0]);
    if (oficial || ['n1', 's7', 'no25'].includes(nombre)) agregar(`punto-km:${nombre}`, { origen, destino, km: Math.round(km * 1.4 * 10) / 10 });
  }
  agregar('sin-origen:e3', { destino: { titulo: 'Punto en el mapa', ...desplazar(centro, 3.5, 90) } });

  // Descuentos: programado con 24 h y fidelidad (el viaje 11 va al 50 %; el 10 no), con recargos.
  const destinoDescuento = (ficha.RUTAS || []).map((r) => lugarDe(ficha, r.id)).find(Boolean) || { titulo: 'Punto en el mapa', ...desplazar(centro, 3.5, 90) };
  for (const m of [T0, 'dom-2330']) {
    agregar('programado:sin-destino', { origen, programado: true }, [m]);
    agregar('programado:ruta', { origen, destino: destinoDescuento, programado: true }, [m]);
    agregar('fidelidad-10:ruta', { origen, destino: destinoDescuento, viajesPrevios: 10 }, [m]);
    agregar('fidelidad-9:ruta', { origen, destino: destinoDescuento, viajesPrevios: 9 }, [m]);
    agregar('fidelidad-20:sin-destino', { origen, viajesPrevios: 20, programado: true }, [m]);
  }

  // Tabla oficial (Decreto 05 de 2026 para Cootransrural): cada destino elegido de la lista, por su
  // nombre (sin punto y con un punto cerca), por cercanía en el mapa y, uno por zona, desde una vereda
  // (estimado: el decreto fija los precios desde el centro).
  const vereda = desplazar(centro, 3, 330);
  const tabla = Array.isArray(ficha.DESTINOS_TARIFA) ? ficha.DESTINOS_TARIFA : [];
  tabla.forEach((d, i) => {
    const punto = ubicado(d) ? { lat: d.lat, lng: d.lng } : {};
    // Unos pocos a toda hora (uno por zona, el primero de cada una); los demás, al mediodía del jueves.
    const primeroDeZona = tabla.findIndex((x) => x.zona === d.zona) === i;
    agregar(`lista:${d.id}`, { origen, destino: { titulo: d.destino, ...punto, idTarifa: d.id } }, primeroDeZona ? CUATRO : [T0]);
    agregar(`nombre:${d.id}`, { origen, destino: { titulo: d.destino } });
    if (!ubicado(d)) {
      // Sin ubicar en el mapa: el nombre vale si el punto está a 9 km o menos del centro.
      for (const km of [8.9, 9.1]) agregar(`nombre-sin-mapa-${km * 1000}m:${d.id}`, { origen, destino: { titulo: d.destino, ...desplazar(centro, km, 90) } });
      return;
    }
    // El nombre vale si el punto está a 3 km o menos del destino.
    if (primeroDeZona) for (const km of [2.9, 3.1]) agregar(`nombre-a-${km * 1000}m:${d.id}`, { origen, destino: { titulo: d.destino, ...desplazar(d, km, 0) } });
    agregar(`nombre-cerca:${d.id}`, { origen, destino: { titulo: d.destino, lat: r6(d.lat + 0.001), lng: d.lng } });
    agregar(`cerca:${d.id}`, { origen, destino: { titulo: 'Punto en el mapa', lat: r6(d.lat + 0.0005), lng: r6(d.lng - 0.0005) } });
    if (primeroDeZona) agregar(`desde-vereda:${d.id}`, { origen: vereda, destino: { titulo: d.destino, lat: d.lat, lng: d.lng, idTarifa: d.id } });
    // Bordes de los radios de cercanía (casco 150 m, exacta 300 m, aproximada 400 m): el primero de cada
    // zona y los que tienen precio propio cerca del centro (Fiorento, al otro lado de la autopista).
    // Los de precio propio cerca del centro, a 145 y 155 m en 24 rumbos: algunos de esos puntos caen
    // dentro del casco urbano, donde rige el radio de 150 m.
    const cercaDelCentro = d.zona !== 1 && kmPlano(centro, d) < 1.2;
    const anillo = [...(primeroDeZona || cercaDelCentro ? ANILLO : []), ...(cercaDelCentro ? ANILLO_CASCO : [])];
    for (const [m, grados] of anillo) {
      agregar(`anillo-${m}m-${grados}:${d.id}`, { origen, destino: { titulo: 'Punto en el mapa', ...desplazar(d, m / 1000, grados) } });
    }
  });
  if (ficha.id === COOPERATIVA_OFICIAL) {
    for (const [id, m, p] of BORDES_ROSAL.casco) agregar(`borde-casco-${m}m:${id}`, { origen, destino: { titulo: 'Punto en el mapa', ...p } });
    const destino = tabla.find((d) => d.zona === 5 && ubicado(d));
    for (const [nombre, p] of BORDES_ROSAL.recogidas) {
      agregar(`recogida-borde-${nombre}:${destino.id}`, { origen: p, destino: { titulo: destino.destino, lat: destino.lat, lng: destino.lng, idTarifa: destino.id } });
    }
  }
  return casos;
}

// La entrada lista para calcularTarifa (la fecha como Date).
export function entradaDe(caso) {
  return { ...caso.entrada, fecha: new Date(caso.entrada.fecha) };
}

// Lo que se compara del resultado: las cifras y el tipo a la vista, y una huella del resultado COMPLETO
// (detalle, notas, etiqueta, fuente, ruta y destino oficial). Los números con decimales (la distancia del
// destino por cercanía) van con 12 cifras significativas, para no depender del último bit.
export function cifras(r) {
  const destino = r.destinoOficial ? `${r.destinoOficial.id}/${r.destinoOficial.por}` : '-';
  return `${r.total} ${r.base} ${r.recargos} ${r.descuento} ${r.tipo} ${destino} ${r.rutaFija?.id || '-'}`;
}

// El valor que guarda la dorada para un resultado: las cifras y los primeros 12 hex del SHA-256 del
// resultado completo en JSON canónico. sha256hex(texto) la pone quien llama (node:crypto), para que
// este módulo no importe nada.
export function valorDe(r, sha256hex) {
  return `${cifras(r)} ${sha256hex(canonico(r)).slice(0, 12)}`;
}

// JSON canónico (claves ordenadas; números con decimales a 12 cifras significativas).
export function canonico(v) {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('número no finito');
    return JSON.stringify(Number.isInteger(v) ? v : Number(v.toPrecision(12)));
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonico(x))).join(',')}]`;
  if (typeof v === 'object') {
    const claves = Object.keys(v).filter((k) => v[k] !== undefined).sort();
    return `{${claves.map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`;
  }
  throw new Error(`tipo no admitido: ${typeof v}`);
}
