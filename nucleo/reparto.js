// Ronda A de «algoritmos» (servidor 0.14.0, docs/CONTRATO.md §17 del servidor): despacho por cercanía y por turnos de
// paradero, tiempo de llegada y precio por calles reales. Aquí solo lo que la app lee del servidor (validado: nada se
// confía tal cual) y los textos que muestra. Todo es aditivo: con un servidor anterior (0.13.0) no llega nada de esto y
// las apps siguen exactamente como hoy.
//
// Contrato (lo que usa la app):
//   bienvenida.reglas.modo (pasajero y conductor; también en el mensaje «reglas»): 'todos' | 'cercania' | 'turno'.
//     Falta o es otro valor → 'todos'.
//   bienvenida.rutas (pasajero) = { cotizar: true, llegada: true } solo si interOS configuró la llave de rutas y no es
//     revisor. Sin el campo: la app calcula su ruta y su tarifa como siempre y no llama a /api/viajes/*.
//   POST /api/viajes/cotizacion { empresa, origen: { lat, lng }, destino: { lat, lng, idTarifa? } | { idTarifa } | null }
//     → { cotizacion: 'c1.…', valor, tipo, km, min, fuente: 'ruta'|'aproximada'|'tabla', vence (ms), version }.
//   POST /api/viajes/llegada { empresa, origen: { lat, lng } } → { min: n | null, fuente }.
//   solicitud (pasajero → central): + cotizacion (la ficha) y conCotizacion: true (entiende cotizacion_vencida).
//   error cotizacion_vencida { viajeId, cotizacion?: { cotizacion, valor, tipo, km, min, fuente, vence } }.
//   solicitud (central → conductor), solo en 'cercania' y 'turno': motivo 'fila'|'cercano'|'ola', llegadaMin (min),
//     equidad: true, fila: { paraderoId, paradero, alRechazar: 'al_final'|'conserva' } (con motivo 'fila').
//   fila (central → conductor) y bienvenida.fila:
//     { enFila: true, paraderoId, paradero, puesto, motivo?: 'entro'|'rechazo'|'sin_respuesta' }
//     { enFila: false, paraderoId, paradero, motivo: 'salio'|'servicio'|'fuera_de_turno'|'sacado'|'sin_senal'|'modo' }
//   presencia (conductor → central): pos.precision (metros, entero) cuando la lectura la trae.
// El nombre del paradero lo escribió el gerente: siempre como texto (textContent), nunca como HTML.

export const MODOS = Object.freeze(['todos', 'cercania', 'turno']);
export const MOTIVOS_OFERTA = Object.freeze(['fila', 'cercano', 'ola']);
const MOTIVOS_FILA_DENTRO = ['entro', 'rechazo', 'sin_respuesta'];
const MOTIVOS_FILA_FUERA = ['salio', 'servicio', 'fuera_de_turno', 'sacado', 'sin_senal', 'modo'];
const TIPOS_TARIFA = ['estimada', 'oficial', 'minima', 'referencia', 'fijada'];
const FUENTES = ['ruta', 'aproximada', 'tabla'];
const PATRON_COTIZACION = /^c1\.[A-Za-z0-9_-]{20,900}\.[A-Za-z0-9_-]{43}$/;
const PATRON_ID = /^[a-z0-9-]{1,60}$/;

// Vigencia de una cotización si el reloj del teléfono no cuadra con el del servidor.
export const VIGENCIA_COTIZACION_MS = 15 * 60 * 1000;
// Antes de pedir, una cotización que vence en menos de esto se vuelve a pedir.
export const MARGEN_COTIZACION_MS = 60 * 1000;
// «El taxi más cercano llega en…»: como mucho una consulta cada 10 s por celda (~110 m) y, con el pin quieto, se
// refresca al minuto.
export const LLEGADA_MISMA_CELDA_MS = 10 * 1000;
export const LLEGADA_REFRESCO_MS = 60 * 1000;
export const LLEGADA_TOPE_MIN = 30;

const numero = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const texto = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

// El modo de reparto de la cooperativa (bienvenida.reglas, el mensaje «reglas» o lo guardado).
export function leerModo(fuente) {
  const m = fuente && typeof fuente === 'object' ? fuente.modo : null;
  return MODOS.includes(m) ? m : 'todos';
}

// bienvenida.rutas → { cotizar, llegada } o null (servidor anterior, sin llave o revisor).
export function leerRutas(bienvenida) {
  const r = bienvenida?.rutas;
  if (!r || typeof r !== 'object' || bienvenida?.revision) return null;
  const cotizar = r.cotizar === true;
  const llegada = r.llegada === true;
  return cotizar || llegada ? { cotizar, llegada } : null;
}

// Celda de ~110 m del punto (3 decimales), para no repetir la consulta de «llega en» por un pin que casi no se movió.
export const celda = (p) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? `${p.lat.toFixed(3)},${p.lng.toFixed(3)}` : '');

// Respuesta de POST /api/viajes/cotizacion (o la cotización que trae cotizacion_vencida) → objeto limpio o null.
// recibida: Date.now() del teléfono al recibirla; venceLocal se mide con el reloj del teléfono (si el del servidor no
// cuadra, se toman los 15 min de la ficha).
export function limpiarCotizacion(q, recibida = Date.now()) {
  if (!q || typeof q !== 'object') return null;
  const ficha = typeof q.cotizacion === 'string' ? q.cotizacion : null;
  if (!ficha || !PATRON_COTIZACION.test(ficha)) return null;
  const valor = numero(q.valor);
  if (valor === null || valor <= 0 || valor > 5000000 || !Number.isInteger(valor)) return null;
  const tipo = TIPOS_TARIFA.includes(q.tipo) ? q.tipo : 'estimada';
  const fuente = FUENTES.includes(q.fuente) ? q.fuente : 'aproximada';
  const km = numero(q.km);
  const min = numero(q.min);
  const vence = numero(q.vence);
  const resta = vence !== null ? vence - recibida : NaN;
  const venceLocal = recibida + (resta > 0 && resta <= VIGENCIA_COTIZACION_MS + 60000 ? resta : VIGENCIA_COTIZACION_MS);
  return {
    cotizacion: ficha,
    valor,
    tipo,
    fuente,
    km: km !== null && km >= 0 && km < 1000 ? Math.round(km * 10) / 10 : null,
    min: min !== null && min >= 0 && min < 1000 ? Math.round(min) : null,
    venceLocal,
  };
}

// Respuesta de POST /api/viajes/llegada → minutos (1–30) o null (sin taxis libres o respuesta rara).
export function limpiarLlegada(r) {
  const min = numero(r?.min);
  if (min === null || min < 0) return null;
  return Math.min(LLEGADA_TOPE_MIN, Math.max(1, Math.ceil(min)));
}

// Lo nuevo de una solicitud (central → conductor), validado: { motivo?, llegadaMin?, equidad?, fila? }. Lo que no
// cumpla se descarta (la tarjeta queda como hoy).
export function limpiarOferta(s) {
  const r = {};
  if (!s || typeof s !== 'object') return r;
  if (MOTIVOS_OFERTA.includes(s.motivo)) r.motivo = s.motivo;
  const llegada = numero(s.llegadaMin);
  if (llegada !== null && llegada >= 0 && llegada <= 600) r.llegadaMin = Math.max(1, Math.ceil(llegada));
  if (s.equidad === true && r.motivo) r.equidad = true;
  if (r.motivo === 'fila') {
    const f = s.fila && typeof s.fila === 'object' ? s.fila : {};
    r.fila = {
      paraderoId: typeof f.paraderoId === 'string' && PATRON_ID.test(f.paraderoId) ? f.paraderoId : '',
      paradero: texto(f.paradero, 80),
      alRechazar: f.alRechazar === 'conserva' ? 'conserva' : 'al_final',
    };
  }
  return r;
}

// Mensaje «fila» (o bienvenida.fila) → { enFila, paraderoId, paradero, puesto, motivo, en } o null si no sirve.
export function limpiarFila(d, ahora = Date.now()) {
  if (!d || typeof d !== 'object' || typeof d.enFila !== 'boolean') return null;
  const paradero = texto(d.paradero, 80);
  const paraderoId = typeof d.paraderoId === 'string' && PATRON_ID.test(d.paraderoId) ? d.paraderoId : '';
  if (d.enFila) {
    const puesto = numero(d.puesto);
    if (puesto === null || !Number.isInteger(puesto) || puesto < 1 || puesto > 999) return null;
    return { enFila: true, paraderoId, paradero, puesto, motivo: MOTIVOS_FILA_DENTRO.includes(d.motivo) ? d.motivo : null, en: ahora };
  }
  return { enFila: false, paraderoId, paradero, puesto: null, motivo: MOTIVOS_FILA_FUERA.includes(d.motivo) ? d.motivo : 'salio', en: ahora };
}

/* ---------------- textos (siempre como texto) ---------------- */

const ordinal = (n) => `${n}.º`;
const nombreParadero = (p) => texto(p, 80) || 'el paradero';

// Pasajero: la línea del inicio. null sin dato.
export function textoLlegada(min) {
  if (!Number.isFinite(min)) return null;
  return min >= LLEGADA_TOPE_MIN ? 'El taxi más cercano está a más de 30 min' : `El taxi más cercano llega en ~${min} min`;
}

// Pasajero: la etiqueta del pin de recogida.
export function textoPin(min) {
  if (!Number.isFinite(min)) return null;
  return min >= LLEGADA_TOPE_MIN ? 'Taxi a más de 30 min' : `Taxi a ~${min} min`;
}

// Pasajero: el chip del precio en «Confirma tu viaje» cuando el valor lo calculó TaxiCun por la ruta (null: el de hoy).
export function chipCotizacion(tarifa, kmTexto) {
  if (!tarifa?.cotizacion || ['oficial', 'fijada', 'referencia', 'minima'].includes(tarifa.tipo)) return null;
  if (tarifa.fuenteRuta === 'ruta') return Number.isFinite(tarifa.kmRuta) ? `Valor por la ruta en calles · ${kmTexto(tarifa.kmRuta)}` : 'Valor por la ruta en calles';
  if (tarifa.fuenteRuta === 'aproximada') return 'Valor aproximado';
  return null;
}

// Pasajero: el diálogo cuando el precio cambió. antes y ahora ya en pesos (texto).
export function textosPrecioCambio(antes, ahora) {
  return {
    titulo: 'El precio de tu viaje cambió',
    texto: `Ahora es ${ahora} (antes ${antes}). ¿Pides el taxi por ${ahora}?`,
    pedir: `Pedir por ${ahora}`,
    cambiar: 'Cambiar el viaje',
  };
}

// Conductor: la línea de arriba de la tarjeta de la solicitud ({ etiqueta, detalle, equidad, nota }) o null (la de hoy).
export function textosOferta(s) {
  const o = limpiarOferta(s);
  if (!o.motivo) return null;
  const llega = o.llegadaMin ? ` · llegas en ~${o.llegadaMin} min` : '';
  const r = { motivo: o.motivo, etiqueta: '', detalle: '', equidad: o.equidad ? 'Llevas más tiempo sin servicio' : '', nota: '' };
  if (o.motivo === 'fila') {
    r.etiqueta = 'Turno de paradero';
    r.detalle = `Eres el primero de la fila en ${nombreParadero(o.fila.paradero)}`;
    r.nota = o.fila.alRechazar === 'conserva' ? 'Si no respondes, pasas al final de la fila.' : 'Si lo rechazas o no respondes, pasas al final de la fila.';
  } else if (o.motivo === 'cercano') r.etiqueta = `Eres el más cercano${llega}`;
  else r.etiqueta = `Estás entre los más cercanos${llega}`;
  return r;
}

// Conductor: el chip de la fila en la pantalla principal (null si no está en una fila).
export function textoChipFila(fila) {
  if (!fila?.enFila) return null;
  const p = nombreParadero(fila.paradero);
  return fila.puesto === 1 ? `Eres el primero en la fila de ${p}` : `Vas ${ordinal(fila.puesto)} en la fila de ${p}`;
}

// Conductor: el aviso de un mensaje «fila» ({ titulo, cuerpo, tipo: 'info' } o null: sin aviso). cooperativa: nombre.
export function avisoFila(fila, cooperativa = 'La cooperativa') {
  if (!fila) return null;
  const p = nombreParadero(fila.paradero);
  if (fila.enFila) {
    if (fila.motivo === 'entro') return { titulo: 'Entraste a la fila', cuerpo: `${p}: vas ${ordinal(fila.puesto)}.`, tipo: 'info' };
    if (fila.motivo === 'rechazo' || fila.motivo === 'sin_respuesta') return { titulo: 'Pasaste al final de la fila', cuerpo: `${p}: ahora vas ${ordinal(fila.puesto)}.`, tipo: 'info' };
    return null;
  }
  if (fila.motivo === 'salio') return { titulo: 'Saliste de la fila', cuerpo: `Te alejaste del paradero ${p}.`, tipo: 'info' };
  if (fila.motivo === 'sin_senal') return { titulo: 'Saliste de la fila', cuerpo: 'No recibimos tu ubicación por unos minutos.', tipo: 'info' };
  if (fila.motivo === 'modo') return { titulo: 'La fila del paradero se apagó', cuerpo: `${texto(cooperativa, 60) || 'La cooperativa'} cambió cómo reparte los pedidos.`, tipo: 'info' };
  return null; // servicio, fuera_de_turno, sacado: ya hay otra pantalla
}
