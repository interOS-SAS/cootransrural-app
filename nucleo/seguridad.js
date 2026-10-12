// Ronda B de «algoritmos» (servidor 0.15.0): «¿Todo bien en tu viaje?» en la app del pasajero (modo real) y los datos
// crudos de la lectura del GPS que la app del conductor le suma a su posición. Sin DOM: lo usan nucleo/pasajero.js,
// nucleo/conductor.js y el diseño (los textos). Contrato en DISENO-RONDA-B.md §7 y §11:
//
//  - hola del pasajero: capacidades: CAPACIDADES (la central solo le pregunta a una app que sabe responder).
//  - bienvenida.seguridadViaje: true si la cooperativa revisa la seguridad de los viajes (sin el campo, como hoy).
//  - seguridad_pregunta { viajeId, preguntaId, motivo, subtipo, plazoS, estado: 'abierta' | 'avisada', despues }:
//    limpiarPregunta() lo valida; si algo no cumple, null y no se muestra nada.
//  - seguridad_cierre { viajeId, preguntaId, estado: 'bien' | 'ayuda' | 'avisada' | 'retirada' }: limpiarCierre().
//  - POST /api/viajes/seguridad { viajeId, preguntaId, respuesta: 'vista' | 'bien' | 'ayuda' }: enviarRespuesta().
//
// Al conductor nunca le llega nada de esto (ni texto, ni aviso, ni campo): solo manda en su posición la precisión, la
// hora de la lectura, la velocidad, el rumbo y la altitud (crudoLectura), que la central usa para revisar el viaje y
// para notar un GPS inventado. Todo lo que manda la central se pinta como texto, nunca como HTML: aquí solo se aceptan
// valores de listas cerradas (el motivo nunca viaja como texto libre).
import * as servidor from './servidor.js';
import { Emisor } from './util.js';

export const CAPACIDADES = ['seguridad'];
export const MOTIVOS = ['desvio', 'parada', 'velocidad', 'sin_senal'];
export const SUBTIPOS = ['alejamiento', 'sin_avance', 'muy_largo', 'sin_ubicacion', 'ubicacion_dudosa'];
export const ESTADOS_PREGUNTA = ['abierta', 'avisada'];
export const ESTADOS_CIERRE = ['bien', 'ayuda', 'avisada', 'retirada'];
export const RESPUESTAS = ['vista', 'bien', 'ayuda'];
// Una pregunta guardada en el teléfono vale esto (después la central ya no la vuelve a mandar).
export const VIGENCIA_PREGUNTA_MS = 30 * 60 * 1000;
export const PLAZO_MAX_S = 1800;

const ID_VIAJE = /^[A-Za-z0-9_-]{6,64}$/;
const ID_PREGUNTA = /^sg_[A-Za-z0-9_-]{12,32}$/;

const enLista = (v, lista) => typeof v === 'string' && lista.includes(v);

// La pregunta que manda la central, validada. null si algo no cumple (no se muestra nada).
export function limpiarPregunta(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const { viajeId, preguntaId, motivo, plazoS, estado, despues } = d;
  if (typeof viajeId !== 'string' || !ID_VIAJE.test(viajeId)) return null;
  if (typeof preguntaId !== 'string' || !ID_PREGUNTA.test(preguntaId)) return null;
  if (!enLista(motivo, MOTIVOS)) return null;
  const subtipo = d.subtipo ?? null;
  if (subtipo !== null && !enLista(subtipo, SUBTIPOS)) return null;
  if (!Number.isInteger(plazoS) || plazoS < 0 || plazoS > PLAZO_MAX_S) return null;
  if (!enLista(estado, ESTADOS_PREGUNTA)) return null;
  if (typeof despues !== 'boolean') return null;
  return { viajeId, preguntaId, motivo, subtipo, plazoS, estado, despues };
}

// El cierre de una pregunta (la respondió desde otro aparato, escaló o se retiró). null si no cumple.
export function limpiarCierre(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const { viajeId, preguntaId, estado } = d;
  if (typeof viajeId !== 'string' || !ID_VIAJE.test(viajeId)) return null;
  if (typeof preguntaId !== 'string' || !ID_PREGUNTA.test(preguntaId)) return null;
  if (!enLista(estado, ESTADOS_CIERRE)) return null;
  return { viajeId, preguntaId, estado };
}

// ¿La bienvenida dice que la cooperativa revisa la seguridad de los viajes? (Nunca en el modo revisor.)
export const seguridadDeBienvenida = (d) => d?.seguridadViaje === true && d?.revision !== true;

// «m:ss» de lo que falta (0:00 si ya pasó).
export function cuentaRegresiva(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Todos los textos de la tarjeta y del SOS que abre «Necesito ayuda». empresa: el nombre de la cooperativa.
export function textosSeguridad({ empresa = '' } = {}) {
  const coop = String(empresa || '').trim() || 'tu cooperativa';
  const MOTIVO = {
    parada: 'El taxi lleva un rato detenido.',
    'desvio/alejamiento': 'El taxi se está alejando de tu destino.',
    'desvio/sin_avance': 'Tu viaje está tardando más de lo normal.',
    'desvio/muy_largo': 'Tu viaje está tardando más de lo normal.',
    desvio: 'Tu viaje está tardando más de lo normal.',
    velocidad: 'El taxi va muy rápido.',
    'sin_senal/sin_ubicacion': 'Perdimos la ubicación del taxi.',
    'sin_senal/ubicacion_dudosa': 'No podemos ver bien la ubicación del taxi.',
    sin_senal: 'Perdimos la ubicación del taxi.',
  };
  return {
    titulo: '¿Todo bien en tu viaje?',
    tituloDespues: '¿Llegaste bien?',
    motivo: (motivo, subtipo) => MOTIVO[`${motivo}/${subtipo}`] || MOTIVO[motivo] || '',
    cuenta: (mmss) => `Si no respondes, en ${mmss} le avisamos a la central de ${coop}.`,
    bien: 'Sí, todo bien',
    ayuda: 'Necesito ayuda',
    gracias: { titulo: 'Gracias', cuerpo: 'Seguimos pendientes de tu viaje.' },
    avisadaTitulo: `Le avisamos a la central de ${coop}`,
    avisadaTexto: 'No alcanzaste a responder. Si todo está bien, dilo aquí.',
    enviando: 'Enviando tu respuesta…',
    error: 'No pudimos enviar tu respuesta. Revisa tu conexión.',
    reintentar: 'Intentar de nuevo',
    // El SOS de siempre, abierto desde «Necesito ayuda».
    sosTexto: `Ya le avisamos a la central de ${coop}. Si estás en peligro, llama a la Línea 123 de la Policía.`,
    sosBoton: 'Mandar mi ubicación a la central',
    // La línea de abajo del viaje en curso.
    lineaViaje: 'Cuidamos tu viaje: si notamos algo raro, te preguntamos si todo está bien. Compártelo con alguien de confianza.',
    lineaHoy: 'Tu viaje queda registrado. Compártelo con alguien de confianza.',
  };
}

// La respuesta a la central, con reintentos como el SOS: sin red o con la central caída (5xx), a los 3, 5, 10 y luego
// cada 15 s hasta 2 minutos (vista: un intento y un reintento). 404 (la pregunta ya no existe para la central) y 400:
// se cierra sin insistir. Repetir lo mismo es seguro: la central responde lo mismo.
//   const envio = enviarRespuesta({ viajeId, preguntaId, respuesta });
//   envio.on('estado', ({ estado }) => …);   // 'enviando' | 'reintentando' | 'enviado' ({ estadoCentral }) |
//                                             // 'no_existe' | 'fallo' | 'sin_sesion' | 'error' ({ codigo }) | 'cancelado'
//   await envio.listo;
const ESPERAS_MS = [3000, 5000, 10000, 15000];
export const PLAZO_RESPUESTA_MS = 2 * 60 * 1000;
const ESTADOS_CENTRAL = new Set(['preguntando', 'bien', 'ayuda', 'sin_respuesta', 'cerrada']);

export function enviarRespuesta({ viajeId, preguntaId, respuesta, esperas = null, plazoMs = null } = {}) {
  const envio = new Emisor();
  const vista = respuesta === 'vista';
  const listaEsperas = esperas || (vista ? [3000] : ESPERAS_MS);
  const plazo = plazoMs ?? (vista ? 4000 : PLAZO_RESPUESTA_MS);
  const maxIntentos = vista ? 2 : Infinity;
  const cuerpo = { viajeId: String(viajeId || ''), preguntaId: String(preguntaId || ''), respuesta: RESPUESTAS.includes(respuesta) ? respuesta : 'vista' };
  const inicio = Date.now();
  let intento = 0;
  let reloj = null;
  let final = null;
  let resolver;
  envio.listo = new Promise((r) => {
    resolver = r;
  });
  envio.respuesta = cuerpo.respuesta;
  envio.estado = 'enviando';
  envio.terminado = false;
  const terminar = (r) => {
    if (final) return;
    final = { ...r, intentos: intento };
    clearTimeout(reloj);
    envio.estado = r.estado;
    envio.terminado = true;
    envio.resultado = final;
    envio.emit('estado', final);
    resolver(final);
  };
  const probar = async () => {
    if (final) return;
    intento += 1;
    try {
      const r = await servidor.seguridad(cuerpo);
      const estadoCentral = ESTADOS_CENTRAL.has(r?.estado) ? r.estado : null;
      terminar({ estado: 'enviado', estadoCentral });
    } catch (err) {
      if (final) return;
      const codigo = err?.codigo || 'error_interno';
      if (codigo === 'sin_sesion') return terminar({ estado: 'sin_sesion' });
      // La pregunta ya no existe (o una central anterior, sin la ruta): nada que insistir.
      if (codigo === 'no_existe' || servidor.rutaNoDisponible(err)) return terminar({ estado: 'no_existe' });
      if (codigo === 'datos_invalidos' || err?.estado === 400) return terminar({ estado: 'no_existe', codigo });
      const reintentar = codigo === 'sin_red' || codigo === 'demasiados_intentos' || (Number(err?.estado) >= 500 && Number(err?.estado) <= 599);
      if (!reintentar) return terminar({ estado: 'error', codigo });
      let espera = listaEsperas[Math.min(intento - 1, listaEsperas.length - 1)];
      if (codigo === 'demasiados_intentos' && Number.isFinite(err?.retryS)) espera = Math.max(espera, err.retryS * 1000);
      if (intento >= maxIntentos || Date.now() - inicio + espera > plazo) return terminar({ estado: 'fallo', codigo });
      envio.estado = 'reintentando';
      envio.emit('estado', { estado: 'reintentando', intento, codigo });
      reloj = setTimeout(probar, espera);
    }
  };
  envio.cancelar = () => terminar({ estado: 'cancelado' });
  probar();
  return envio;
}

// Conductor: lo crudo de una lectura del GPS de verdad, validado (§7.4). Solo los campos que vengan bien: { precision
// (m, entero), ts (ms), velocidad (m/s, 0–100), rumbo (0–360), altitud (m) }. La central los usa para revisar el viaje
// y la calidad de la ubicación; un servidor anterior los ignora. La posición simulada de la demo no lleva nada.
export function crudoLectura(p) {
  if (!p || typeof p !== 'object') return {};
  const r = {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const precision = num(p.precision);
  if (precision !== null && precision >= 0 && precision < 100000) r.precision = Math.round(precision);
  const ts = num(p.ts);
  // Una hora de la lectura razonable (desde 2020 y no más de un día adelante del reloj del teléfono).
  if (ts !== null && ts > 1_577_836_800_000 && ts < Date.now() + 86_400_000) r.ts = Math.round(ts);
  const velocidad = num(p.velocidad);
  if (velocidad !== null && velocidad >= 0 && velocidad <= 100) r.velocidad = Math.round(velocidad * 10) / 10;
  const rumbo = num(p.rumbo);
  if (rumbo !== null && rumbo >= 0 && rumbo <= 360) r.rumbo = Math.round(rumbo);
  const altitud = num(p.altitud);
  if (altitud !== null && altitud >= -500 && altitud <= 9000) r.altitud = Math.round(altitud);
  return r;
}
