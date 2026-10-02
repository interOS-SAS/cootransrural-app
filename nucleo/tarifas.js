// Cálculo de la tarifa estimada. Las cifras están en datos.js (son de ejemplo).
import { TARIFAS, RUTAS, LUGARES } from './datos.js';
import { distanciaKm, redondear, horaBogota } from './util.js';
import { CENTRO, EMPRESA } from './config.js';

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

// Devuelve el detalle de la tarifa. `km` es la distancia por vía (si se conoce).
export function calcularTarifa({ origen, destino, km, fecha = new Date(), programado = false, viajesPrevios = 0 }) {
  const detalle = [];
  const ruta = rutaFija(origen, destino);
  let base;
  if (ruta) {
    base = ruta.valor;
    detalle.push({ concepto: `Tarifa fija ${EMPRESA.pueblo || 'desde el pueblo'} → ${ruta.destino}`, valor: ruta.valor });
  } else {
    const distancia = km ?? (origen && destino ? distanciaKm(origen, destino) * 1.35 : 0);
    base = Math.max(TARIFAS.minimaUrbana, redondear(TARIFAS.banderazo + distancia * TARIFAS.porKm, TARIFAS.redondeo));
    detalle.push({ concepto: base === TARIFAS.minimaUrbana ? 'Carrera mínima' : `Recorrido (${distancia.toFixed(1).replace('.', ',')} km)`, valor: base });
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

  return { total, base, recargos, descuento, rutaFija: ruta, detalle, ejemplo: TARIFAS.ejemplo };
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
