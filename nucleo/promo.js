// Promoción «Viaje gratis» (servidor 0.16.0, DISENO-PROMOCIONES.md §7 y §13–§14). Aquí solo lo que la app lee del
// servidor (validado: nada se confía tal cual), las cuentas de la vista previa y los textos que muestra. Todo es aditivo:
// con un servidor anterior (0.15.0) no llega nada de esto y las apps siguen exactamente como hoy.
//
// Contrato (lo que usa la app):
//   hola: el pasajero declara capacidades ['seguridad', 'promo'] y el conductor ['promo'] (un servidor anterior las ignora).
//   bienvenida.promo (pasajero, nunca al revisor) y el mensaje «promo» (lo mismo + evento):
//     { id, version, vigente, meta, llevas, llena, premio: { id: 'pr_…', estado, vence (ISO), tope, viajeId, aqui } | null,
//       condiciones: { tope, venceDias, maxMismoConductor, minimo, cada }, canjePausado, terminos }
//     evento: { tipo: 'sumo'|'no_sumo'|'premio'|'premio_en_uso'|'premio_devuelto'|'premio_vencido'|'premio_anulado'|'config',
//               viajeId?, motivo? }
//   solicitud (pasajero → central): premioId opcional (^pr_[A-Za-z0-9_-]{22}$).
//   promo_viaje { viajeId, cubre, pasajeroPaga, tope }; viaje_actual.promo { cubre, pasajeroPaga, tope }; estado final
//     .promo { cubierto, pasajeroPaga }; cobro: valor = lo que paga el pasajero y promo { cubierto }.
//   error premio_no_disponible { viajeId, motivo } (no_existe · usado · vencido · anulado · en_uso · pausado · cooperativa ·
//     sin_tarifa): no se guardó nada. sin_conductores con motivo 'promo_app'.
//   POST /api/viajes/cotizacion: + promo { premioId, cubre, pasajeroPaga, tope }.
//   GET /api/promociones/mia → { promo, viajes: [{ viajeId, fin, cuenta, motivo }], premios: [{ id, estado, emitido, vence,
//     usadoEn, viajeId }] }.
//   Conductor: solicitud, asignacion y viaje_actual .promo { cubre, bono, total, pasajeroPaga }; promo_final { viajeId,
//     valor, cubierto, bono, total, pasajeroPaga, corte: 'AAAA-MM-DD', falta: null|'como_me_pagan'|'condiciones' };
//     pago_confirmado { metodo: 'promocion' }; GET /api/conductor/promociones; POST /api/conductor/promociones/aceptar.
//   Pública: GET /api/promociones/viaje-gratis[?version=n] (la página de términos, web/promociones.js).
// Todo lo que sale en pantalla lo arma la app con estos textos fijos y números ya validados: nada del servidor llega
// como HTML. La tarifa del decreto nunca cambia (S31): la promoción solo cambia quién paga.

export const CAPACIDAD = 'promo';
export const VERSION_CONDICIONES = 'c1';
export const PATRON_PREMIO = /^pr_[A-Za-z0-9_-]{22}$/;
export const RUTA_TERMINOS = 'promociones/viaje-gratis/';
export const ESTADOS_PREMIO = Object.freeze(['emitido', 'en_uso', 'usado', 'vencido', 'anulado']);
export const EVENTOS = Object.freeze(['sumo', 'no_sumo', 'premio', 'premio_en_uso', 'premio_devuelto', 'premio_vencido', 'premio_anulado', 'config']);
export const MOTIVOS_NO_SUMA = Object.freeze(['viaje_gratis', 'mismo_usuario', 'sin_celular', 'tarjeta_llena', 'valor_minimo', 'sin_recorrido',
  'sin_avance', 'gps_dudoso', 'mismo_conductor', 'tope_dia', 'manual']);
export const MOTIVOS_NO_DISPONIBLE = Object.freeze(['no_existe', 'usado', 'vencido', 'anulado', 'en_uso', 'pausado', 'cooperativa', 'sin_tarifa']);
export const FALTAS = Object.freeze(['como_me_pagan', 'condiciones']);
const ESTADOS_SEMANA = ['por_pagar', 'pagada', 'anulada'];
const ESTADOS_PAGO = ['pendiente', 'en_revision', 'por_pagar', 'pagado', 'anulado'];
const MAX_PESOS = 5000000;

/* ---------------- lectura (validación) ---------------- */

const entero = (v, min = 0, max = MAX_PESOS) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const plata = (v) => entero(v, 0, MAX_PESOS);
// Fecha ISO (o ms) → ms; null si no es una fecha razonable (2020–2100).
export function ms(v) {
  const t = typeof v === 'number' ? v : typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t > 1577836800000 && t < 4102444800000 ? t : null;
}
const fechaDia = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T12:00:00Z`)) ? v : null);
const idViaje = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null);

// premio de la bienvenida o del mensaje «promo» → limpio o null.
export function leerPremio(p) {
  if (!p || typeof p !== 'object' || !PATRON_PREMIO.test(p.id || '') || !ESTADOS_PREMIO.includes(p.estado)) return null;
  const vence = ms(p.vence);
  const tope = plata(p.tope);
  if (vence === null || tope === null || tope === 0) return null;
  return { id: p.id, estado: p.estado, vence, tope, viajeId: idViaje(p.viajeId), aqui: p.aqui === true };
}

// bienvenida.promo o el mensaje «promo» → objeto limpio o null (sin el campo, con basura, o del modo revisor).
export function leerPromo(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const meta = entero(d.meta, 1, 100);
  const c = d.condiciones && typeof d.condiciones === 'object' ? d.condiciones : {};
  const cada = entero(c.cada, 1, 100) ?? meta;
  if (meta === null || cada === null) return null;
  const llevas = Math.min(entero(d.llevas, 0, 100) ?? 0, meta);
  const condiciones = {
    cada,
    tope: plata(c.tope),
    venceDias: entero(c.venceDias, 1, 3650),
    maxMismoConductor: entero(c.maxMismoConductor, 0, 100),
    minimo: plata(c.minimo),
  };
  const premio = leerPremio(d.premio);
  return {
    id: 'viaje-gratis',
    version: entero(d.version, 0, 1000000),
    vigente: d.vigente === true,
    meta,
    llevas,
    llena: d.llena === true,
    premio,
    condiciones,
    canjePausado: d.canjePausado === true,
  };
}

export function leerEvento(e) {
  if (!e || typeof e !== 'object' || !EVENTOS.includes(e.tipo)) return null;
  return {
    tipo: e.tipo,
    viajeId: idViaje(e.viajeId),
    motivo: MOTIVOS_NO_SUMA.includes(e.motivo) ? e.motivo : null,
  };
}

// promo_viaje / viaje_actual.promo (pasajero) → { cubre, pasajeroPaga, tope } o null.
export function leerPromoViaje(d) {
  if (!d || typeof d !== 'object') return null;
  const cubre = plata(d.cubre);
  const pasajeroPaga = plata(d.pasajeroPaga);
  if (cubre === null || pasajeroPaga === null) return null;
  return { cubre, pasajeroPaga, tope: plata(d.tope) };
}

// estado final .promo (pasajero) → { cubierto, pasajeroPaga } o null.
export function leerPromoFinalPasajero(d) {
  if (!d || typeof d !== 'object') return null;
  const cubierto = plata(d.cubierto);
  const pasajeroPaga = plata(d.pasajeroPaga);
  if (cubierto === null || pasajeroPaga === null) return null;
  return { cubierto, pasajeroPaga };
}

// cotizacion.promo → { premioId, cubre, pasajeroPaga, tope } o null.
export function leerCotizacionPromo(d) {
  if (!d || typeof d !== 'object' || !PATRON_PREMIO.test(d.premioId || '')) return null;
  const v = leerPromoViaje(d);
  return v ? { premioId: d.premioId, ...v } : null;
}

// solicitud / asignacion / viaje_actual .promo (conductor) → { cubre, bono, total, pasajeroPaga } o null.
export function leerPromoConductor(d) {
  if (!d || typeof d !== 'object') return null;
  const cubre = plata(d.cubre);
  const bono = plata(d.bono);
  const pasajeroPaga = plata(d.pasajeroPaga);
  if (cubre === null || bono === null || pasajeroPaga === null) return null;
  const total = plata(d.total) ?? cubre + bono;
  return { cubre, bono, total, pasajeroPaga };
}

// promo_final (conductor) → objeto limpio o null.
export function leerPromoFinal(d) {
  if (!d || typeof d !== 'object' || !idViaje(d.viajeId)) return null;
  const valor = plata(d.valor);
  const cubierto = plata(d.cubierto);
  const bono = plata(d.bono);
  const pasajeroPaga = plata(d.pasajeroPaga);
  if ([valor, cubierto, bono, pasajeroPaga].includes(null)) return null;
  return {
    viajeId: d.viajeId, valor, cubierto, bono, total: plata(d.total) ?? cubierto + bono, pasajeroPaga,
    corte: fechaDia(d.corte), falta: FALTAS.includes(d.falta) ? d.falta : null,
  };
}

export function leerMotivoNoDisponible(m) {
  return MOTIVOS_NO_DISPONIBLE.includes(m) ? m : 'no_existe';
}

// GET /api/promociones/mia → { promo, viajes, premios } (lo que no cuadre se descarta).
export function leerMia(r) {
  const viajes = (Array.isArray(r?.viajes) ? r.viajes : []).slice(0, 40).map((v) => {
    const fin = ms(v?.fin);
    if (fin === null) return null;
    return { viajeId: idViaje(v.viajeId), fin, cuenta: v.cuenta === true, motivo: MOTIVOS_NO_SUMA.includes(v.motivo) ? v.motivo : null };
  }).filter(Boolean);
  const premios = (Array.isArray(r?.premios) ? r.premios : []).slice(0, 5).map((p) => {
    if (!p || !PATRON_PREMIO.test(p.id || '') || !ESTADOS_PREMIO.includes(p.estado)) return null;
    return { id: p.id, estado: p.estado, emitido: ms(p.emitido), vence: ms(p.vence), usadoEn: ms(p.usadoEn), viajeId: idViaje(p.viajeId) };
  }).filter(Boolean);
  return { promo: leerPromo(r?.promo), viajes, premios };
}

// GET /api/conductor/promociones → limpio (nunca nada del pasajero).
export function leerPagosConductor(r) {
  const c = r?.condiciones && typeof r.condiciones === 'object' ? r.condiciones : {};
  const semanas = (Array.isArray(r?.semanas) ? r.semanas : []).slice(0, 60).map((s) => {
    const semana = fechaDia(s?.semana);
    const desde = fechaDia(s?.desde);
    const hasta = fechaDia(s?.hasta);
    const total = plata(s?.total);
    if (!semana || !desde || !hasta || total === null) return null;
    return {
      semana, desde, hasta, viajes: entero(s.viajes, 0, 10000) ?? 0, cubierto: plata(s.cubierto) ?? 0, bono: plata(s.bono) ?? 0, total,
      estado: ESTADOS_SEMANA.includes(s.estado) ? s.estado : 'por_pagar', pagadaEn: ms(s.pagadaEn),
    };
  }).filter(Boolean);
  const viajes = (Array.isArray(r?.viajes) ? r.viajes : []).slice(0, 200).map((v) => {
    const fin = ms(v?.fin);
    const total = plata(v?.total);
    if (fin === null || total === null) return null;
    return {
      viajeId: idViaje(v.viajeId), fin, valor: plata(v.valor) ?? 0, cubierto: plata(v.cubierto) ?? 0, bono: plata(v.bono) ?? 0, total,
      estado: ESTADOS_PAGO.includes(v.estado) ? v.estado : 'pendiente',
    };
  }).filter(Boolean);
  return {
    condiciones: { version: typeof c.version === 'string' ? c.version.slice(0, 10) : VERSION_CONDICIONES, aceptadas: c.aceptadas === true, aceptadasEn: ms(c.aceptadasEn) },
    comoMePagan: r?.comoMePagan === true,
    semanas,
    viajes,
  };
}

/* ---------------- estado del premio ---------------- */

// ¿El pasajero puede usar su premio en esta cooperativa ahora? (Emitido, sin vencer, usable aquí y sin pausa.)
export function premioUsable(promo, ahora = Date.now()) {
  const p = promo?.premio;
  return Boolean(p && p.estado === 'emitido' && p.aqui && !promo.canjePausado && p.vence > ahora);
}

// Tope que cubre un premio: el suyo o el vigente de la cooperativa si es mayor (§5.1).
export function topePremio(promo) {
  return Math.max(promo?.premio?.tope || 0, promo?.condiciones?.tope || 0);
}

/* ---------------- las cuentas (§5, en pesos enteros) ---------------- */

// Al peso más cercano, la mitad hacia arriba (con enteros: (V × b + 50) div 100).
export const redondearBono = (v, b) => Math.floor((v * b + 50) / 100);

// §5.1: lo que ve el conductor antes de aceptar. T tarifa, S valor del servidor, P tope, b bonoPct, M bonoMax (0 = sin tope).
export function alPedir({ T, S = T, P, b, M = 0 }) {
  const B = Math.min(T, S);
  const cubre = Math.min(B, P);
  let bono = redondearBono(B, b);
  if (M > 0) bono = Math.min(bono, M);
  return { B, cubre, bono, total: cubre + bono, pasajeroPaga: T - cubre };
}

// §5.2: lo que se paga al terminar. F valor final que escribe el conductor.
export function alTerminar({ B, F, P, b, M = 0 }) {
  const V = Math.min(B, F);
  const C = Math.min(V, P);
  let bono = redondearBono(V, b);
  if (M > 0) bono = Math.min(bono, M);
  return { V, C, bono, total: C + bono, pasajeroPaga: F - C };
}

// Lo que la app del conductor puede saber antes de que llegue promo_final: TaxiCun cubre min(F, cubre).
export function pasajeroPagaLocal(F, cubre) {
  return Math.max(0, Math.round(Number(F) || 0) - Math.min(Math.round(Number(F) || 0), cubre || 0));
}

// §5.4: la vista previa del pasajero. Con la cotización del servidor (promo exacta) o, sin ella, con la tarifa y el tope.
export function vistaPrevia({ tarifa, promo, cotizacionPromo = null }) {
  if (cotizacionPromo && cotizacionPromo.premioId === promo?.premio?.id) {
    return { cubre: cotizacionPromo.cubre, pasajeroPaga: cotizacionPromo.pasajeroPaga, tope: cotizacionPromo.tope || topePremio(promo), aprox: false };
  }
  const T = Math.max(0, Math.round(Number(tarifa) || 0));
  const P = topePremio(promo);
  const cubre = Math.min(T, P);
  return { cubre, pasajeroPaga: T - cubre, tope: P, aprox: true };
}

/* ---------------- fechas (Bogotá, UTC−5 todo el año) ---------------- */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const enBogota = (t) => new Date(t - 5 * 3600 * 1000);

// «12 de diciembre» (con año si no es el de ahora: «12 de diciembre de 2027»).
export function fechaLarga(t, { ahora = Date.now(), conAnio = null } = {}) {
  if (!Number.isFinite(t)) return '';
  const d = enBogota(t);
  const anio = conAnio ?? d.getUTCFullYear() !== enBogota(ahora).getUTCFullYear();
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}${anio ? ` de ${d.getUTCFullYear()}` : ''}`;
}
// «13 oct»
export function fechaCorta(t) {
  if (!Number.isFinite(t)) return '';
  const d = enBogota(t);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}
// 'AAAA-MM-DD' → «lunes 19 de octubre»
export function diaConNombre(dia) {
  const f = fechaDia(dia);
  if (!f) return '';
  const d = new Date(`${f}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
// Semana 'AAAA-MM-DD'…'AAAA-MM-DD' → «del 12 al 18 de oct» (o «del 28 de sep al 4 de oct»).
export function semanaTexto(desde, hasta) {
  const a = fechaDia(desde) && new Date(`${desde}T12:00:00Z`);
  const b = fechaDia(hasta) && new Date(`${hasta}T12:00:00Z`);
  if (!a || !b) return '';
  if (a.getUTCMonth() === b.getUTCMonth()) return `del ${a.getUTCDate()} al ${b.getUTCDate()} de ${MESES_CORTOS[b.getUTCMonth()]}`;
  return `del ${a.getUTCDate()} de ${MESES_CORTOS[a.getUTCMonth()]} al ${b.getUTCDate()} de ${MESES_CORTOS[b.getUTCMonth()]}`;
}

/* ---------------- textos (pasajero) ---------------- */

// pesos: la función de formato del núcleo (util.pesos), para no depender aquí de Intl.
const pesosPor = (pesos) => pesos || ((n) => `$${Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`);

// La tarjeta del inicio (§13.2) → { anillo, frac, titulo, sub, tipo } o null (sin nada que mostrar).
export function tarjetaInicio(promo, { pesos, ahora = Date.now() } = {}) {
  if (!promo) return null;
  const $ = pesosPor(pesos);
  const p = promo.premio;
  const conPremio = p && (p.estado === 'emitido' || p.estado === 'en_uso') && (p.estado === 'en_uso' || p.vence > ahora);
  if (conPremio) {
    const sub = promo.canjePausado
      ? 'Tu viaje gratis está en pausa por unas horas. No pierdes días.'
      : p.estado === 'en_uso' ? 'Lo estás usando en tu viaje.'
        : p.aqui ? `Úsalo antes del ${fechaLarga(p.vence, { ahora })}` : 'Se puede usar en las cooperativas de la promoción.';
    return { tipo: 'premio', anillo: 'Gratis', frac: 1, titulo: p.aqui || p.estado === 'en_uso' ? '¡Tienes un viaje gratis!' : 'Tienes un viaje gratis', sub, tope: $(p.tope) };
  }
  if (promo.llena) return { tipo: 'llena', anillo: `${promo.meta}/${promo.meta}`, frac: 1, titulo: 'Completaste otra tarjeta', sub: 'Tu siguiente viaje gratis llega cuando uses el que tienes' };
  if (!promo.vigente) return null;
  const n = promo.llevas;
  const meta = promo.meta;
  const sub = n === 0 ? `Cada ${meta} viajes, el siguiente es gratis`
    : n >= meta - 1 ? '¡Te falta 1 viaje para tu viaje gratis!' : 'Tu viaje gratis está cerca';
  return { tipo: 'progreso', anillo: `${n}/${meta}`, frac: n / meta, titulo: `Llevas ${n} de ${meta}`, sub };
}

// Detalle del menú del pasajero («Promociones»).
export function detalleMenu(promo, ahora = Date.now()) {
  const t = tarjetaInicio(promo, { ahora });
  if (!t) return 'Viaje gratis';
  return t.tipo === 'premio' ? '¡Tienes un viaje gratis!' : t.tipo === 'llena' ? 'Completaste otra tarjeta' : t.titulo;
}

// «Confirma tu viaje» (§13.3) con el interruptor. vp: vistaPrevia(). conDestino: si el pasajero marcó destino.
export function textosConfirmar({ promo, vp, usar, conDestino, minima = null, pesos }) {
  const $ = pesosPor(pesos);
  const tope = topePremio(promo);
  const r = {
    interruptor: 'Usar mi viaje gratis',
    subInterruptor: `TaxiCun paga hasta ${$(tope)}`,
    linea: '',
    nota: '',
    boton: 'Pedir taxi',
    lineaTarjeta: '',
  };
  if (usar && vp) {
    const aprox = vp.aprox ? ' (aprox.)' : '';
    r.linea = vp.pasajeroPaga === 0 ? `Este viaje te sale gratis${aprox}` : `TaxiCun paga ${$(vp.cubre)} · Tú pagas ${$(vp.pasajeroPaga)}${aprox}`;
    if (!conDestino) r.nota = `Sin destino, TaxiCun cubre la carrera mínima${minima ? ` (${$(minima)})` : ''}. Marca tu destino para que cubra hasta ${$(tope)}.`;
    r.boton = vp.pasajeroPaga === 0 ? 'Pedir taxi gratis' : `Pedir taxi · pagas ${$(vp.pasajeroPaga)}`;
  }
  const premioSinUsar = premioUsable(promo);
  if (premioSinUsar && usar) r.lineaTarjeta = 'Este viaje no suma mientras uses tu viaje gratis';
  else if (promo?.vigente && !promo.llena) r.lineaTarjeta = `Viaje ${Math.min(promo.llevas + 1, promo.meta)} de ${promo.meta} de tu tarjeta`;
  return r;
}

// Por qué un viaje no sumó (§13.5): aviso informativo, nunca alerta roja. null: sin aviso.
export function textoNoSumo(motivo, { condiciones, pesos } = {}) {
  const $ = pesosPor(pesos);
  switch (motivo) {
    case 'viaje_gratis':
      return null;
    case 'mismo_usuario':
      return 'Este viaje no sumó: no cumple las condiciones de la promoción.';
    case 'sin_celular':
      return 'Este viaje no sumó: agrega tu celular en “Mi cuenta” para participar.';
    case 'tarjeta_llena':
      return 'Este viaje no sumó: ya completaste otra tarjeta. Usa tu viaje gratis para seguir sumando.';
    case 'valor_minimo':
      return `Este viaje no sumó: su valor fue menor que la carrera mínima${condiciones?.minimo ? ` (${$(condiciones.minimo)})` : ''}.`;
    case 'mismo_conductor': {
      const n = condiciones?.maxMismoConductor;
      return `Este viaje no sumó: ya llevas ${n || 'los'} viajes de esta tarjeta con el mismo conductor. Viaja con otros conductores para completarla.`;
    }
    case 'tope_dia':
      return 'Este viaje no sumó: ya sumaste los viajes permitidos por hoy.';
    case 'sin_recorrido':
    case 'sin_avance':
    case 'gps_dudoso':
    default:
      return 'Este viaje no sumó: no pudimos verificar el recorrido.';
  }
}

// Una línea de la lista de viajes de la hoja («13 oct · Sumó» / «12 oct · No sumó: …»).
export function lineaViajeMia(v, { condiciones, pesos } = {}) {
  if (v.cuenta) return { fecha: fechaCorta(v.fin), texto: 'Sumó', sumo: true };
  if (v.motivo === 'viaje_gratis') return { fecha: fechaCorta(v.fin), texto: 'Tu viaje gratis', sumo: false };
  const t = textoNoSumo(v.motivo, { condiciones, pesos }) || '';
  return { fecha: fechaCorta(v.fin), texto: t.replace(/^Este viaje no sumó: /, 'No sumó: '), sumo: false };
}

// Aviso por evento (§13.5) → { titulo, cuerpo, tipo } o null (el premio y la configuración los maneja el diseño aparte).
export function avisoEvento(evento, promo, { pesos } = {}) {
  if (!evento) return null;
  switch (evento.tipo) {
    case 'sumo':
      return { titulo: 'Sumaste 1 viaje', cuerpo: `Llevas ${promo?.llevas ?? 0} de ${promo?.meta ?? 10} para tu viaje gratis.`, tipo: 'exito' };
    case 'no_sumo': {
      const t = textoNoSumo(evento.motivo, { condiciones: promo?.condiciones, pesos });
      return t ? { titulo: 'Tu tarjeta de viajes', cuerpo: t, tipo: 'info' } : null;
    }
    case 'premio_devuelto':
      return { titulo: 'Tu viaje gratis sigue guardado', cuerpo: 'El viaje se canceló: puedes usar tu viaje gratis en otro viaje.', tipo: 'info' };
    case 'premio_vencido':
      return { titulo: 'Tu viaje gratis venció', cuerpo: 'Sigue viajando para ganar otro.', tipo: 'info' };
    case 'premio_anulado':
      return { titulo: 'Tu viaje gratis fue anulado', cuerpo: 'Si crees que es un error, escríbenos a info@taxicun.com.', tipo: 'info' };
    default:
      return null;
  }
}

// El modal del premio ganado.
export function textosPremio(promo, { pesos, ahora = Date.now() } = {}) {
  const $ = pesosPor(pesos);
  const p = promo?.premio;
  const tope = p ? p.tope : promo?.condiciones?.tope || 0;
  return {
    titulo: '¡Ganaste un viaje gratis!',
    cuerpo: `TaxiCun te regala tu próximo viaje (hasta ${$(tope)}).${p ? ` Úsalo antes del ${fechaLarga(p.vence, { ahora })}.` : ''}`,
  };
}

// premio_no_disponible (§13.5).
export function textoNoDisponible(motivo) {
  switch (motivo) {
    case 'usado':
      return 'Ya usaste ese viaje gratis.';
    case 'vencido':
      return 'Tu viaje gratis venció.';
    case 'en_uso':
      return 'Tu viaje gratis está en otro pedido.';
    case 'pausado':
      return 'El canje está en pausa por unas horas. No pierdes días.';
    case 'cooperativa':
      return 'Tu viaje gratis no se puede usar en esta cooperativa.';
    case 'sin_tarifa':
      return 'No pudimos calcular el valor de este viaje para la promoción. Intenta de nuevo en un momento o pide sin el viaje gratis.';
    case 'no_existe':
    case 'anulado':
    default:
      return 'Ese viaje gratis ya no está disponible.';
  }
}

// «Así funciona» (4 líneas con los valores vigentes).
export function asiFunciona(promo, { pesos } = {}) {
  const $ = pesosPor(pesos);
  const c = promo?.condiciones || {};
  return [
    `Cada ${c.cada || promo?.meta || 10} viajes completados, el siguiente es gratis${c.tope ? ` hasta ${$(c.tope)}` : ''}.`,
    'Si tu viaje vale más, pagas la diferencia al conductor.',
    c.venceDias ? `Tienes ${c.venceDias} días para usarlo.` : 'Tu viaje gratis tiene fecha de vencimiento.',
    c.maxMismoConductor ? `Máximo ${c.maxMismoConductor} viajes de cada tarjeta con el mismo conductor.` : '',
  ].filter(Boolean);
}

// La pantalla «pagar» del pasajero en un viaje gratis (§13.4).
export function textosPagar(final, { pesos } = {}) {
  const $ = pesosPor(pesos);
  if (!final) return null;
  return {
    titulo: `TaxiCun pagó ${$(final.cubierto)} de tu viaje`,
    cuerpo: final.pasajeroPaga > 0 ? `Paga ${$(final.pasajeroPaga)} al conductor` : 'No tienes que pagar nada. ¡Disfruta tu viaje gratis!',
  };
}

/* ---------------- textos (conductor) ---------------- */

// La oferta (§14): «TaxiCun te paga $10.000 + bono $3.000» y, si aplica, «El pasajero te paga $3.200».
export function textosOferta(p, { pesos, sinComoMePagan = false } = {}) {
  if (!p) return null;
  const $ = pesosPor(pesos);
  return {
    chip: 'Viaje con promoción',
    paga: `TaxiCun te paga ${$(p.cubre)} + bono ${$(p.bono)}`,
    pasajero: p.pasajeroPaga > 0 ? `El pasajero te paga ${$(p.pasajeroPaga)}` : 'El pasajero no te paga',
    registrar: sinComoMePagan ? 'Registra “Cómo me pagan” para recibir este pago' : '',
  };
}

// La línea de «¿Cuánto cobras?» en un viaje gratis.
export function textoCuantoCobras(p, { pesos, bonoPct = null } = {}) {
  if (!p) return '';
  const $ = pesosPor(pesos);
  // El porcentaje no llega en la oferta: se deduce de la tarifa (cubre + lo que paga el pasajero) y solo se dice si cuadra
  // exacto con el bono (si el servidor tomó otra base, no se adivina).
  const T = p.cubre + p.pasajeroPaga;
  const candidato = T > 0 ? Math.round((p.bono * 100) / T) : null;
  const pct = bonoPct ?? (candidato && candidato <= 100 && redondearBono(T, candidato) === p.bono ? candidato : null);
  return `Viaje con promoción: TaxiCun te paga hasta ${$(p.cubre)} de este valor${pct ? ` y un bono del ${pct} %` : ' y un bono'}. Escribe el valor real del viaje.`;
}

// «Cobrando» (§14). final: promo_final (o null mientras llega); valor: lo que escribió el conductor; p: promo de la oferta.
export function textosCobrando({ final, valor, p, pesos }) {
  const $ = pesosPor(pesos);
  const pasajeroPaga = final ? final.pasajeroPaga : pasajeroPagaLocal(valor, p?.cubre);
  const r = {
    pasajeroPaga,
    titulo: pasajeroPaga > 0 ? `Cobra ${$(pasajeroPaga)} al pasajero` : 'El pasajero no te paga',
    taxicun: final
      ? `TaxiCun te paga ${$(final.total)} (${$(final.cubierto)} del viaje + ${$(final.bono)} de bono)${final.corte ? ` en la liquidación del ${diaConNombre(final.corte)}` : ' en la liquidación semanal'}.`
      : 'TaxiCun te paga lo que cubre del viaje más el bono en la liquidación semanal.',
    falta: '',
    accionFalta: null,
  };
  if (final?.falta === 'como_me_pagan') {
    r.falta = 'Para recibir este pago registra “Cómo me pagan”.';
    r.accionFalta = 'como_me_pagan';
  } else if (final?.falta === 'condiciones') {
    r.falta = 'Acepta las condiciones de pagos de la promoción para recibir este pago.';
    r.accionFalta = 'condiciones';
  }
  return r;
}

export const ESTADO_PAGO_TEXTO = Object.freeze({
  pendiente: 'Pendiente', en_revision: 'En revisión', por_pagar: 'Por pagar', pagado: 'Pagado', anulado: 'Anulado por TaxiCun',
});

// «Semana del 12 al 18 de oct · 3 viajes · $34.230 · Por pagar» (o «Pagado el 20 de oct», «Anulado por TaxiCun»).
export function lineaSemana(s, { pesos } = {}) {
  const $ = pesosPor(pesos);
  const estado = s.estado === 'pagada' ? `Pagado${s.pagadaEn ? ` el ${fechaCorta(s.pagadaEn).replace(' ', ' de ')}` : ''}` : s.estado === 'anulada' ? 'Anulado por TaxiCun' : 'Por pagar';
  return `Semana ${semanaTexto(s.desde, s.hasta)} · ${s.viajes} ${s.viajes === 1 ? 'viaje' : 'viajes'} · ${$(s.total)} · ${estado}`;
}
export function lineaViajePago(v, { pesos } = {}) {
  const $ = pesosPor(pesos);
  return `${fechaCorta(v.fin)} · ${$(v.total)} · ${ESTADO_PAGO_TEXTO[v.estado] || 'Pendiente'}`;
}

export const CONDICIONES_CONDUCTOR = Object.freeze([
  'TaxiCun te paga cada semana los viajes gratis que hagas, con un bono.',
  'Te pagamos a la llave que registres en “Cómo me pagan”.',
  'Si hay indicios de fraude, una persona de TaxiCun revisa y puede anular el pago.',
  'Autorizo a interOS S.A.S. a usar mi llave de cobro para pagarme estos viajes.',
]);
