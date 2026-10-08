// El ÚNICO cálculo de la tarifa (§5.5 del diseño del panel). Puro: sin DOM, sin red y sin importar
// config.js ni datos.js; todo sale de la ficha que se le pasa. Lo usan:
//   - las apps y la web, por nucleo/tarifas.js (el envoltorio con la ficha de la página);
//   - nucleo/datos.js, para TARIFAS, RUTAS, LUGARES, DESTINOS_TARIFA y CASCO_URBANO;
//   - el panel y el servidor (taxicun-servidor), con una COPIA FIJADA de este archivo y de sus dos
//     importaciones (util.js y enlaces.js), con su SHA-256 verificado: panel/vendor/nucleo/ del
//     servidor, copiada de un commit concreto de este repo. Si se cambia este archivo, el panel y el
//     servidor siguen con la copia vieja hasta que se vuelva a fijar (ver el README del núcleo).
// No le agregues importaciones: la copia fijada lleva solo tarifador.js, util.js y enlaces.js.
//
//   import { crearTarifador } from './tarifador.js';
//   const T = crearTarifador(ficha);       // ficha = empresas/<id>/ficha.json (o la que arma la API)
//   T.calcularTarifa({ origen, destino, km, fecha, programado, viajesPrevios });
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
//
// Fase 2 del panel:
//   · una ruta con «fijada: true» (el precio a otro municipio lo puso la cooperativa en el panel) es
//     'fijada': «Precio fijado por <cooperativa>», sin «por confirmar»;
//   · festivos (§5.6): el recargo dominical se cobra también en los festivos de Colombia, salvo que
//     TARIFAS.recargoDominicalEnFestivos sea false (lo define cada decreto). esFestivo está en util.js.
import { distanciaKm, redondear, horaBogota, pesos, dentroDeAnillo, distanciaAlBordeKm } from './util.js';
import { urlDecreto } from './enlaces.js';

// Festivos de Colombia (Ley 51 de 1983), los mismos que usa el cálculo.
export { esFestivo, festivosDe } from './util.js';

// Lo que falte en TARIFAS de la ficha se completa con estos valores de EJEMPLO (nunca NaN).
// Son los mismos de herramientas/generar-empresas.py y crear-ficha.py.
export const TARIFAS_BASE = Object.freeze({
  ejemplo: true, minimaUrbana: 8000, banderazo: 5500, porKm: 1300, redondeo: 500,
  recargoNocturno: 2000, recargoDominical: 1000, nocheDesde: 20, nocheHasta: 6,
  descuentoProgramado: 0.10, horasAnticipacion: 24, viajesFidelidad: 10, descuentoFidelidad: 0.50,
});

// Las tablas de la ficha que usa el cálculo, ya completadas y filtradas. Se arman una vez por ficha
// (el mismo objeto para datos.js y para el tarifador de esa ficha, como cuando todo salía de datos.js).
const TABLAS = new WeakMap();
export function tablasTarifa(ficha) {
  const f = ficha && typeof ficha === 'object' ? ficha : {};
  let t = TABLAS.get(f);
  if (t) return t;
  t = {
    // Tarifas y rutas con tarifa fija: de EJEMPLO, por cooperativa, salvo que la ficha diga
    // «ejemplo: false» y traiga la fuente (p. ej. Cootransrural: Decreto 05 de 2026).
    TARIFAS: { ...TARIFAS_BASE, ...(f.TARIFAS || {}) },
    RUTAS: f.RUTAS || [],
    // Lugares frecuentes del municipio.
    LUGARES: f.LUGARES || [],
    // Tabla oficial de precios cerrados «De <pueblo> Centro a…» (zona, sector, destino, valor y,
    // si se pudo ubicar, lat/lng con su «precision»: exacta, aproximada, vereda o sin_ubicar).
    DESTINOS_TARIFA: Array.isArray(f.DESTINOS_TARIFA) ? f.DESTINOS_TARIFA.filter((d) => d && d.destino && Number.isFinite(Number(d.valor))) : [],
    // Casco urbano: lista de anillos [[lat, lng], …] (límite de OSM). Sin él, no hay tabla por zonas.
    CASCO_URBANO: Array.isArray(f.CASCO_URBANO) ? f.CASCO_URBANO.filter((a) => Array.isArray(a) && a.length >= 3) : [],
  };
  TABLAS.set(f, t);
  return t;
}

// Distancia máxima (km) para tomar el precio de un destino ubicado de la tabla. Dentro del
// casco urbano, solo muy cerca (allí rige la tarifa única); afuera, según qué tan exacto es
// el punto. Los destinos ubicados solo por la vereda no cuentan por cercanía.
const RADIO = { casco: 0.15, exacta: 0.3, aproximada: 0.4 };
// Un nombre igual al de la tabla cuenta si el punto está a esta distancia (km) del destino
// (o del centro, si el destino no está en el mapa).
const RADIO_NOMBRE = 3;
const RADIO_MUNICIPIO = 9;

const ubicado = (d) => Number.isFinite(d?.lat) && Number.isFinite(d?.lng);
const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/* ---------------- tabla oficial (sin ficha) ---------------- */

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

// Texto corto de la precisión del punto en el mapa (para listas y tablas).
export function textoPrecision(d) {
  if (!d) return '';
  if (!ubicado(d) || d.precision === 'sin_ubicar') return 'Sin ubicar en el mapa';
  if (d.precision === 'vereda') return 'Punto aproximado (centro de la vereda)';
  if (d.precision === 'aproximada') return 'Ubicación aproximada';
  return '';
}

/* ---------------- el tarifador de una ficha ---------------- */

export function crearTarifador(ficha) {
  const { TARIFAS, RUTAS, LUGARES, DESTINOS_TARIFA, CASCO_URBANO } = tablasTarifa(ficha);
  const CENTRO = ficha?.CENTRO;
  const EMPRESA = ficha?.EMPRESA;

  // ¿Esta cooperativa tiene tabla oficial de precios?
  const TARIFAS_OFICIALES = !TARIFAS.ejemplo && DESTINOS_TARIFA.length > 0;
  // De dónde salen las tarifas oficiales: { acto, entidad, fecha, url, pdf }. Los enlaces
  // solo quedan si son https: de un dominio *.gov.co (S30); si no, quedan vacíos y las
  // pantallas no pintan «Ver el decreto».
  const FUENTE_FICHA = TARIFAS.fuente && TARIFAS.fuente.acto ? TARIFAS.fuente : null;
  const FUENTE_TARIFAS = FUENTE_FICHA
    ? { ...FUENTE_FICHA, url: urlDecreto(FUENTE_FICHA.url), ...(FUENTE_FICHA.pdf ? { pdf: urlDecreto(FUENTE_FICHA.pdf) } : {}) }
    : null;
  // «El Rosal Centro»: el origen de los precios de la tabla.
  const ORIGEN_OFICIAL = TARIFAS.origenOficial || `${EMPRESA?.pueblo || 'el pueblo'} Centro`;

  const POR_ID = new Map(DESTINOS_TARIFA.map((d) => [d.id, d]));
  const tipoEmpresa = () => (EMPRESA?.tipo === 'empresa' ? 'empresa' : 'cooperativa');
  // Quién fija los precios de las rutas «fijada» (texto plano de la ficha; las pantallas lo escapan).
  const NOMBRE = String(EMPRESA?.nombreCorto || EMPRESA?.nombre || '').trim() || `la ${tipoEmpresa()}`;

  // ¿El punto está en el casco urbano? margenKm: tolerancia por el error del GPS en el borde.
  function enCascoUrbano(p, margenKm = 0.08) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || !CASCO_URBANO.length) return false;
    return CASCO_URBANO.some((a) => dentroDeAnillo(p, a) || (margenKm > 0 && distanciaAlBordeKm(p, a) <= margenKm));
  }

  // Destino de la tabla oficial que corresponde a un punto { lat, lng, titulo, idTarifa }:
  // por su id (elegido de la lista), por el nombre exacto o por cercanía. null si ninguno.
  function destinoOficial(destino) {
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
  function zonasTarifa() {
    const zonas = new Map();
    for (const d of DESTINOS_TARIFA) {
      if (!zonas.has(d.zona)) zonas.set(d.zona, { zona: d.zona, sector: d.sector || `Zona ${d.zona}`, destinos: [] });
      zonas.get(d.zona).destinos.push(d);
    }
    return [...zonas.values()].sort((a, b) => a.zona - b.zona);
  }

  // Destinos de la tabla que coinciden con lo escrito (nombre, sector o «zona 5»).
  function buscarTarifas(texto) {
    const palabras = normalizar(texto).split(' ').filter(Boolean);
    if (!palabras.length) return DESTINOS_TARIFA.slice();
    return DESTINOS_TARIFA.filter((d) => {
      const t = normalizar(`${d.destino} ${d.sector || ''} zona ${d.zona}`);
      return palabras.every((w) => t.includes(w));
    });
  }

  // Un destino de la tabla como punto para pedir el taxi (null si no está en el mapa).
  function lugarDeTarifa(d) {
    if (!d || !ubicado(d)) return null;
    return { titulo: d.destino, detalle: `Zona ${d.zona} · ${d.sector} · ${pesos(d.valor)}`, lat: d.lat, lng: d.lng, idTarifa: d.id };
  }

  /* ---------------- etiquetas ---------------- */

  // Lo que dice el chip de la tarifa: «Tarifa oficial · Decreto 05 de 2026», «Tarifa estimada»,
  // «Precio de referencia», «Precio fijado por Cootransrural» o, en las fichas de ejemplo,
  // «Tarifa de ejemplo».
  function etiquetaTarifa(t) {
    if (TARIFAS.ejemplo) return 'Tarifa de ejemplo';
    const tipo = typeof t === 'string' ? t : t?.tipo;
    if (tipo === 'oficial') return FUENTE_TARIFAS ? `Tarifa oficial · ${FUENTE_TARIFAS.acto}` : 'Tarifa oficial';
    if (tipo === 'referencia') return 'Precio de referencia';
    if (tipo === 'fijada') return `Precio fijado por ${NOMBRE}`;
    return 'Tarifa estimada';
  }

  // Ruta fija que corresponde al destino, si el destino cae cerca de uno de los
  // municipios de la tabla y el origen está en el pueblo de la cooperativa.
  function rutaFija(origen, destino) {
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
  // Además del total y el detalle: tipo ('oficial' | 'estimada' | 'referencia' | 'fijada'), etiqueta
  // (para el chip), fuente (la del decreto, si es oficial), destinoOficial y notas (por qué es así).
  function calcularTarifa({ origen, destino, km, fecha = new Date(), programado = false, viajesPrevios = 0 }) {
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

    if (ruta && ruta.fijada === true) {
      // Precio a otro municipio que la cooperativa fijó en el panel (fase 2): no lo fija el decreto.
      base = ruta.valor;
      tipo = 'fijada';
      detalle.push({ concepto: `Precio fijado por ${NOMBRE}: ${pueblo} → ${ruta.destino}`, valor: ruta.valor });
      notas.push(TARIFAS_OFICIALES
        ? `El ${acto} no fija viajes a otros municipios: este precio lo fija ${NOMBRE}.`
        : `Este precio lo fija ${NOMBRE}.`);
    } else if (!TARIFAS_OFICIALES) {
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

    const { hora, domingo, festivo } = horaBogota(fecha);
    let recargos = 0;
    if (TARIFAS.recargoNocturno > 0 && (hora >= TARIFAS.nocheDesde || hora < TARIFAS.nocheHasta)) {
      recargos += TARIFAS.recargoNocturno;
      detalle.push({ concepto: 'Recargo nocturno', valor: TARIFAS.recargoNocturno });
    }
    // El dominical vale también en los festivos (§5.6), salvo que el decreto diga otra cosa.
    const festivoConRecargo = festivo && TARIFAS.recargoDominicalEnFestivos !== false;
    // Algunos decretos (p. ej. Chía) fijan un solo recargo, no acumulable: noche o domingo.
    if ((domingo || festivoConRecargo) && TARIFAS.recargoDominical > 0 && !(TARIFAS.recargoUnico && recargos > 0)) {
      recargos += TARIFAS.recargoDominical;
      detalle.push({ concepto: domingo ? 'Recargo dominical' : 'Recargo festivo', valor: TARIFAS.recargoDominical });
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
  function progresoFidelidad(viajesCompletados) {
    const n = TARIFAS.viajesFidelidad;
    const enCiclo = viajesCompletados % n;
    const siguienteConDescuento = viajesCompletados > 0 && enCiclo === 0;
    return { completados: siguienteConDescuento ? n : enCiclo, meta: n, siguienteConDescuento, faltan: siguienteConDescuento ? 0 : n - enCiclo };
  }

  // ¿Se puede aplicar el descuento por programar? (hora del viaje ≥ 24 h después)
  function aplicaDescuentoProgramado(fechaViaje, ahora = new Date()) {
    return new Date(fechaViaje) - ahora >= TARIFAS.horasAnticipacion * 3600 * 1000 - 60 * 1000;
  }

  return {
    // Tablas (las mismas de nucleo/datos.js para la ficha de la página).
    TARIFAS, RUTAS, LUGARES, DESTINOS_TARIFA, CASCO_URBANO,
    TARIFAS_OFICIALES, FUENTE_TARIFAS, ORIGEN_OFICIAL,
    enCascoUrbano, destinoOficial, zonasTarifa, buscarTarifas, textoPrecision, lugarDeTarifa,
    etiquetaTarifa, rutaFija, calcularTarifa, progresoFidelidad, aplicaDescuentoProgramado,
  };
}
