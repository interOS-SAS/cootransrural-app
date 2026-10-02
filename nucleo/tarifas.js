// Cálculo de la tarifa. Las cifras salen de la ficha de cada cooperativa (datos.js).
//
// Casi todas las fichas traen tarifas de EJEMPLO (TARIFAS.ejemplo): todo viaje se estima con
// banderazo + valor por km, y las rutas a otros municipios llevan su tarifa fija.
//
// Si la ficha trae tarifas OFICIALES (ejemplo: false, TARIFAS.fuente y la tabla
// DESTINOS_TARIFA; p. ej. Cootransrural con el Decreto 05 de 2026 de El Rosal, que fija el
// precio «De El Rosal Centro a…» 191 destinos):
//   · destino de la tabla (elegido de la lista, con el mismo nombre o a pocos metros de un
//     destino ubicado) → el precio OFICIAL ('oficial');
//   · otro punto dentro del casco urbano → la carrera mínima urbana, también oficial;
//   · lo demás → estimación con banderazo y valor por km estimados ('estimada');
//   · rutas a otros municipios (RUTAS) → precio de referencia por confirmar ('referencia').
// El decreto fija precios desde el centro: si la recogida no está en el casco urbano (de una
// vereda a otra, por ejemplo), el valor es estimado y la tarifa lo dice.
import { TARIFAS, RUTAS, LUGARES, DESTINOS_TARIFA, CASCO_URBANO } from './datos.js';
import { distanciaKm, redondear, horaBogota, pesos } from './util.js';
import { CENTRO, EMPRESA } from './config.js';

// ¿Esta cooperativa tiene tabla oficial de precios?
export const TARIFAS_OFICIALES = !TARIFAS.ejemplo && DESTINOS_TARIFA.length > 0;
// De dónde salen las tarifas oficiales: { acto, entidad, fecha, url, pdf }.
export const FUENTE_TARIFAS = TARIFAS.fuente && TARIFAS.fuente.acto ? TARIFAS.fuente : null;
// «El Rosal Centro»: el origen de los precios de la tabla.
export const ORIGEN_OFICIAL = TARIFAS.origenOficial || `${EMPRESA?.pueblo || 'el pueblo'} Centro`;

// Distancia máxima (km) para tomar el precio de un destino ubicado de la tabla. Dentro del
// casco urbano, solo muy cerca (allí rige la tarifa única); afuera, según qué tan exacto es
// el punto. Los destinos ubicados solo por la vereda no cuentan por cercanía.
const RADIO = { casco: 0.15, exacta: 0.3, aproximada: 0.4 };
// Un nombre igual al de la tabla cuenta si el punto está a esta distancia (km) del destino
// (o del centro, si el destino no está en el mapa).
const RADIO_NOMBRE = 3;
const RADIO_MUNICIPIO = 9;

const POR_ID = new Map(DESTINOS_TARIFA.map((d) => [d.id, d]));
const ubicado = (d) => Number.isFinite(d?.lat) && Number.isFinite(d?.lng);
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const tipoEmpresa = () => (EMPRESA?.tipo === 'empresa' ? 'empresa' : 'cooperativa');

/* ---------------- casco urbano ---------------- */

function dentroDeAnillo(p, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i];
    const [yj, xj] = anillo[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Distancia (km) de p al borde de un anillo, en un plano local (vale para pocos km).
function distanciaAlBorde(p, anillo) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  let min = Infinity;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const ax = (anillo[j][1] - p.lng) * kx;
    const ay = (anillo[j][0] - p.lat) * ky;
    const bx = (anillo[i][1] - p.lng) * kx;
    const by = (anillo[i][0] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

// ¿El punto está en el casco urbano? margenKm: tolerancia por el error del GPS en el borde.
export function enCascoUrbano(p, margenKm = 0.08) {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !CASCO_URBANO.length) return false;
  return CASCO_URBANO.some((a) => dentroDeAnillo(p, a) || (margenKm > 0 && distanciaAlBorde(p, a) <= margenKm));
}

/* ---------------- tabla oficial ---------------- */

// El mejor de varios destinos de la tabla para un punto: el más cercano (los ubicados con
// precisión «aproximada» cuentan 50 m más lejos) y, si empatan, el más barato.
function masCercano(punto, candidatos, radio) {
  let mejor = null;
  for (const d of candidatos) {
    if (!ubicado(d)) continue;
    const km = distanciaKm(punto, d);
    const r = typeof radio === 'function' ? radio(d) : radio;
    if (km > r) continue;
    const puntaje = km + (d.precision === 'aproximada' ? 0.05 : 0);
    if (!mejor || puntaje < mejor.puntaje - 1e-9 || (Math.abs(puntaje - mejor.puntaje) <= 1e-9 && d.valor < mejor.d.valor)) mejor = { d, km, puntaje };
  }
  return mejor;
}

// Destino de la tabla oficial que corresponde a un punto { lat, lng, titulo, idTarifa }:
// por su id (elegido de la lista), por el nombre exacto o por cercanía. null si ninguno.
export function destinoOficial(destino) {
  if (!TARIFAS_OFICIALES || !destino) return null;
  if (destino.idTarifa && POR_ID.has(destino.idTarifa)) return { ...POR_ID.get(destino.idTarifa), por: 'lista' };
  const conPunto = ubicado(destino);
  const nombre = normalizar(destino.titulo);
  if (nombre) {
    // Si el nombre coincide letra por letra (mayúsculas incluidas) con uno de la tabla, ese
    // manda: «Monasterio Trapense» (zona 3) y «Monasterio trapense» (zona 4) solo se distinguen así.
    const todos = DESTINOS_TARIFA.filter((d) => normalizar(d.destino) === nombre);
    const exactos = todos.filter((d) => d.destino === String(destino.titulo).trim());
    const iguales = exactos.length ? exactos : todos;
    if (iguales.length && !conPunto) return { ...iguales[0], por: 'nombre' };
    if (iguales.length) {
      // El mismo nombre en dos zonas (p. ej. el Monasterio Trapense): el más cercano.
      const cerca = masCercano(destino, iguales, RADIO_NOMBRE);
      if (cerca) return { ...cerca.d, por: 'nombre' };
      const sinMapa = iguales.find((d) => !ubicado(d));
      if (sinMapa && distanciaKm(destino, CENTRO) <= RADIO_MUNICIPIO) return { ...sinMapa, por: 'nombre' };
    }
  }
  if (!conPunto) return null;
  // Dentro del casco urbano rige la tarifa única (zona 1): solo cuentan, muy cerca, los
  // destinos con precio propio (p. ej. Fiorento, al otro lado de la autopista).
  const casco = enCascoUrbano(destino, 0);
  const cerca = masCercano(
    destino,
    DESTINOS_TARIFA.filter((d) => (d.precision === 'exacta' || d.precision === 'aproximada') && !(casco && d.zona === 1)),
    (d) => (casco ? RADIO.casco : RADIO[d.precision]),
  );
  return cerca ? { ...cerca.d, por: 'cercania', km: cerca.km } : null;
}

// Zonas de la tabla con sus destinos, en el orden del decreto: [{ zona, sector, destinos }].
export function zonasTarifa() {
  const zonas = new Map();
  for (const d of DESTINOS_TARIFA) {
    if (!zonas.has(d.zona)) zonas.set(d.zona, { zona: d.zona, sector: d.sector || `Zona ${d.zona}`, destinos: [] });
    zonas.get(d.zona).destinos.push(d);
  }
  return [...zonas.values()].sort((a, b) => a.zona - b.zona);
}

// Destinos de la tabla que coinciden con lo escrito (nombre, sector o «zona 5»).
export function buscarTarifas(texto) {
  const palabras = normalizar(texto).split(' ').filter(Boolean);
  if (!palabras.length) return DESTINOS_TARIFA.slice();
  return DESTINOS_TARIFA.filter((d) => {
    const t = normalizar(`${d.destino} ${d.sector || ''} zona ${d.zona}`);
    return palabras.every((w) => t.includes(w));
  });
}

// Texto corto de la precisión del punto en el mapa (para listas y tablas).
export function textoPrecision(d) {
  if (!d) return '';
  if (!ubicado(d) || d.precision === 'sin_ubicar') return 'Sin ubicar en el mapa';
  if (d.precision === 'vereda') return 'Punto aproximado (centro de la vereda)';
  if (d.precision === 'aproximada') return 'Ubicación aproximada';
  return '';
}

// Un destino de la tabla como punto para pedir el taxi (null si no está en el mapa).
export function lugarDeTarifa(d) {
  if (!d || !ubicado(d)) return null;
  return { titulo: d.destino, detalle: `Zona ${d.zona} · ${d.sector} · ${pesos(d.valor)}`, lat: d.lat, lng: d.lng, idTarifa: d.id };
}

/* ---------------- etiquetas ---------------- */

// Lo que dice el chip de la tarifa: «Tarifa oficial · Decreto 05 de 2026», «Tarifa estimada»,
// «Precio de referencia» o, en las fichas de ejemplo, «Tarifa de ejemplo».
export function etiquetaTarifa(t) {
  if (TARIFAS.ejemplo) return 'Tarifa de ejemplo';
  const tipo = typeof t === 'string' ? t : t?.tipo;
  if (tipo === 'oficial') return FUENTE_TARIFAS ? `Tarifa oficial · ${FUENTE_TARIFAS.acto}` : 'Tarifa oficial';
  if (tipo === 'referencia') return 'Precio de referencia';
  return 'Tarifa estimada';
}

// Ruta fija que corresponde al destino, si el destino cae cerca de uno de los
// municipios de la tabla y el origen está en el pueblo de la cooperativa.
export function rutaFija(origen, destino) {
  if (!origen || !destino) return null;
  if (distanciaKm(origen, CENTRO) > 8) return null;
  let mejor = null;
  for (const ruta of RUTAS) {
    const lugar = LUGARES.find((l) => l.id === ruta.id);
    if (!lugar) continue;
    const d = distanciaKm(destino, lugar);
    if (d <= ruta.radioKm && (!mejor || d < mejor.d)) mejor = { ruta, d };
  }
  return mejor?.ruta || null;
}

/* ---------------- cálculo ---------------- */

// Devuelve el detalle de la tarifa. `km` es la distancia por vía (si se conoce).
// Además del total y el detalle: tipo ('oficial' | 'estimada' | 'referencia'), etiqueta (para
// el chip), fuente (la del decreto, si es oficial), destinoOficial y notas (por qué es así).
export function calcularTarifa({ origen, destino, km, fecha = new Date(), programado = false, viajesPrevios = 0 }) {
  const detalle = [];
  const notas = [];
  const ruta = rutaFija(origen, destino);
  const pueblo = EMPRESA?.pueblo || 'el pueblo';
  const acto = FUENTE_TARIFAS?.acto || 'decreto';
  let base;
  let tipo = 'estimada';
  let oficial = null;

  const estimar = (enTexto) => {
    const d = km ?? (origen && destino ? distanciaKm(origen, destino) * 1.35 : 0);
    const valor = Math.max(TARIFAS.minimaUrbana, redondear(TARIFAS.banderazo + d * TARIFAS.porKm, TARIFAS.redondeo));
    detalle.push({ concepto: valor === TARIFAS.minimaUrbana ? 'Carrera mínima' : `${enTexto} (${d.toFixed(1).replace('.', ',')} km)`, valor });
    return valor;
  };

  if (!TARIFAS_OFICIALES) {
    // Tarifas de ejemplo (o sin tabla oficial): ruta fija o recorrido, como siempre.
    if (ruta) {
      base = ruta.valor;
      tipo = 'referencia';
      detalle.push({ concepto: `Tarifa fija ${EMPRESA?.pueblo || 'desde el pueblo'} → ${ruta.destino}`, valor: ruta.valor });
    } else {
      base = estimar('Recorrido');
    }
  } else if (ruta) {
    base = ruta.valor;
    tipo = 'referencia';
    detalle.push({ concepto: `Precio de referencia ${pueblo} → ${ruta.destino}`, valor: ruta.valor });
    notas.push(TARIFAS.notaRutas || `El ${acto} no fija viajes a otros municipios: es un precio de referencia, por confirmar con la ${tipoEmpresa()}.`);
  } else if (!destino) {
    base = TARIFAS.minimaUrbana;
    detalle.push({ concepto: 'Carrera mínima urbana', valor: base });
    notas.push(`Sin destino, el valor final depende del recorrido. La carrera mínima urbana (${pesos(base)}) es la del ${acto}.`);
  } else if (origen && !enCascoUrbano(origen)) {
    // El decreto fija precios desde el centro: de otro punto a otro, se estima.
    const desdeCentro = destinoOficial(destino);
    base = estimar('Recorrido estimado');
    notas.push(`El ${acto} fija los precios desde ${ORIGEN_OFICIAL}. Este viaje sale de fuera del casco urbano, así que el valor es estimado.`);
    if (desdeCentro) notas.push(`Desde ${ORIGEN_OFICIAL} a ${desdeCentro.destino}, el decreto fija ${pesos(desdeCentro.valor)}.`);
  } else if ((oficial = destinoOficial(destino))) {
    base = oficial.valor;
    tipo = 'oficial';
    detalle.push({ concepto: `De ${ORIGEN_OFICIAL} a ${oficial.destino} (zona ${oficial.zona})`, valor: base });
    notas.push(`Precio cerrado del ${acto}${FUENTE_TARIFAS?.entidad ? ` de la ${FUENTE_TARIFAS.entidad}` : ''}.`);
    if (oficial.por !== 'cercania' && oficial.precision !== 'exacta') notas.push(`El punto de «${oficial.destino}» en el mapa es aproximado; el precio es el del decreto.`);
  } else if (enCascoUrbano(destino)) {
    base = TARIFAS.minimaUrbana;
    tipo = 'oficial';
    detalle.push({ concepto: 'Tarifa única urbana (zona 1)', valor: base });
    notas.push(`Dentro del casco urbano de ${pueblo} rige la tarifa única del ${acto}.`);
  } else {
    base = estimar('Recorrido estimado');
    notas.push(`Este destino no está en la tabla del ${acto}: el valor se estima por la distancia.`);
  }

  const { hora, domingo } = horaBogota(fecha);
  let recargos = 0;
  if (TARIFAS.recargoNocturno > 0 && (hora >= TARIFAS.nocheDesde || hora < TARIFAS.nocheHasta)) {
    recargos += TARIFAS.recargoNocturno;
    detalle.push({ concepto: 'Recargo nocturno', valor: TARIFAS.recargoNocturno });
  }
  // Algunos decretos (p. ej. Chía) fijan un solo recargo, no acumulable: noche o domingo.
  if (domingo && TARIFAS.recargoDominical > 0 && !(TARIFAS.recargoUnico && recargos > 0)) {
    recargos += TARIFAS.recargoDominical;
    detalle.push({ concepto: 'Recargo dominical', valor: TARIFAS.recargoDominical });
  }
  if (TARIFAS_OFICIALES && !(TARIFAS.recargoNocturno > 0) && !(TARIFAS.recargoDominical > 0)) {
    notas.push(`Sin recargo nocturno ni dominical: el ${acto} no los fija (por confirmar con la ${tipoEmpresa()}).`);
  }

  let total = base + recargos;
  let descuento = 0;
  // Descuentos que ya ofrece la cooperativa (no se acumulan: se aplica el mayor).
  const tocaFidelidad = viajesPrevios > 0 && (viajesPrevios % TARIFAS.viajesFidelidad) === 0;
  if (tocaFidelidad) {
    descuento = redondear(total * TARIFAS.descuentoFidelidad, 100);
    detalle.push({ concepto: `Viaje #${viajesPrevios + 1}: 50 % de descuento`, valor: -descuento });
  } else if (programado) {
    descuento = redondear(total * TARIFAS.descuentoProgramado, 100);
    detalle.push({ concepto: 'Programado con 24 h: 10 % menos', valor: -descuento });
  }
  total -= descuento;

  return {
    total, base, recargos, descuento, rutaFija: ruta, detalle, ejemplo: TARIFAS.ejemplo,
    tipo, etiqueta: etiquetaTarifa(tipo), fuente: tipo === 'oficial' ? FUENTE_TARIFAS : null,
    destinoOficial: oficial, nota: notas[0] || '', notas,
  };
}

// Progreso de la tarjeta de fidelidad (cada 10 viajes, el siguiente al 50 %).
export function progresoFidelidad(viajesCompletados) {
  const n = TARIFAS.viajesFidelidad;
  const enCiclo = viajesCompletados % n;
  const siguienteConDescuento = viajesCompletados > 0 && enCiclo === 0;
  return { completados: siguienteConDescuento ? n : enCiclo, meta: n, siguienteConDescuento, faltan: siguienteConDescuento ? 0 : n - enCiclo };
}

// ¿Se puede aplicar el descuento por programar? (hora del viaje ≥ 24 h después)
export function aplicaDescuentoProgramado(fechaViaje, ahora = new Date()) {
  return new Date(fechaViaje) - ahora >= TARIFAS.horasAnticipacion * 3600 * 1000 - 60 * 1000;
}
