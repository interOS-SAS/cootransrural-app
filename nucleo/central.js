// Fase 3 del panel («En vivo y viajes», servidor 0.7.0): lo que la central de la cooperativa hace desde el mapa en
// vivo del panel y les llega a las apps (modo real). La demo no cambia: estos mensajes solo los manda el servidor.
//
// Contrato (§6.3, §6.5 y §4.7 del diseño del panel; los nombres de los mensajes están solo aquí):
//
//   1) «Sacar de turno» (POST /api/panel/c/:coop/en-vivo/conductores/:id/sacar { motivo }):
//      - Con el WebSocket abierto: sacado_de_turno (central → conductor) { motivo, en, alTerminar }. motivo: texto
//        plano que escribió la central (el servidor lo valida, S30; la app lo pinta como texto y corta a 200); en: hora
//        (ms) en que lo sacó (opcional); alTerminar: tenía un servicio en curso (la app lo sabe sola y no lo usa). La central NO cierra el bus (no es un 4403): el conductor sigue con su sesión y puede
//        volver a ponerse en turno («Conectarme»), con su presencia disponible: true de siempre.
//        La app, sin servicio: queda «Desconectado» (sin ofertas, presencia disponible: false) y dice «La central te
//        sacó de turno» con el motivo. Con un servicio en curso: lo termina y queda «Desconectado» al terminarlo.
//        Acuse (integración con la 0.7.0): la presencia «no disponible» que manda la app sabiéndose sacada lleva
//        sacado: true (también cuando se entera estando ya fuera de turno, por la bienvenida o el push). La central
//        levanta su marca con ese acuse y el «Conectarme» de después lo vuelve a poner en turno; sin el acuse, la
//        central ignora un «no disponible» de los primeros 2 s y el conductor quedaría fuera hasta 30 minutos.
//      - Sin WebSocket (app minimizada o cerrada):
//          · push al conductor con datos { tipo: 'sacado_de_turno', motivo, en } (el texto lo arma el servidor:
//            «La central te sacó de turno: {motivo}.»);
//          · el siguiente POST /api/conductor/ubicacion del plugin recibe { ok: true, seguir: false } sin que lo haya
//            pedido (sin fin): el plugin se detiene con el motivo 'servidor';
//          · en la siguiente conexión de esa cuenta (si no volvió a ponerse en turno), la bienvenida trae
//            sacadoDeTurno: { motivo, en }. Así la app no anuncia presencia disponible al volver. El servidor 0.7.0,
//            además, repite sacado_de_turno después de viaje_actual mientras dure la marca (hasta que la app diga
//            «no disponible» sin servicio, o 30 min): la app que ya quedó fuera no lo vuelve a mostrar.
//        La app lo aplica también sola (sin esperar la bienvenida) al tocar ese push y cuando el plugin se detiene
//        con 'servidor' estando en turno y sin servicio; después vuelve a saludar a la central.
//   2) «Cancelar y avisar al pasajero» (POST …/en-vivo/viajes/:id/cancelar { motivo }):
//      cancelacion (central → pasajero y conductores que lo tenían, ofrecido o asignado)
//        { viajeId, por: 'sistema', motivo: 'central', conductorId? } (servidor 0.7.0: así las apps anteriores la
//        toman como una cancelación del sistema). El motivo que escribe la central NO viaja: solo queda en la bitácora
//        del panel, y la app dice que la canceló la central, sin motivo. Por si una central futura lo manda, también
//        vale { por: 'central', motivo: <texto> } (canceladaPorCentral y motivoDeCancelacion, abajo).
//      - Pasajero: no busca otro taxi solo (la central lo canceló a propósito): cierra el viaje, lo guarda en «Mis
//        viajes» como «Cancelado por la central» y avisa con el motivo y «Llamar a la central». Sin WebSocket, la
//        central le manda un push y, como hace con el final del viaje, le reenvía esta cancelación una vez al
//        reconectarse, entre la bienvenida y viaje_actual (si no, la app que vuelve con la búsqueda «perdida» la
//        pediría otra vez sola). Si de todas formas ya la volvió a pedir con otro id, la app cancela esa también.
//      - Conductor: quita la oferta o suelta el servicio con el aviso «La central canceló el servicio» y sigue en
//        turno.
//   3) «Ofrecer a un móvil» (POST …/en-vivo/viajes/:id/ofrecer { conductorId }): la solicitud de siempre, solo a ese
//      conductor, con central: true. La app la muestra igual, con «La central te ofrece este servicio» en la hoja
//      amarilla y en el aviso. Aceptar, «Rechazar» (rechazo), oferta_vista y segundosOferta, como cualquier oferta.
//   Las centrales anteriores no mandan nada de esto (y el tipo 'central' no existe para ellas): todo sigue igual.
//
// Ronda 4A «Operación de la central» (servidor 0.9.0; DISENO-4A.md §2.5, §2.6 y §4.2). Las centrales anteriores no
// mandan nada de esto y la app sigue igual con ellas (las rutas nuevas que respondan 404 se ignoran en silencio).
//   4) «Pedido por teléfono»: la operadora o el gerente crean en el panel un pedido para alguien que llamó. Les llega a
//      los conductores como la solicitud de siempre con pedidoCentral: true, pasajero { id, nombre: <primer nombre de
//      quien llamó>, calificacion: null } y la nota de la central. Al que gana, la asignacion de siempre con
//      pasajero.celular = el de quien llamó, codigoHash: '' y pedidoCentral: true; viaje_actual también trae
//      pedidoCentral: true. La app: «Pedido de la central» con el nombre y sin estrellas, «Llamar a {nombre}», en
//      «Recoger» «Confirma que es {nombre}» e «Iniciar viaje» sin código, y no lo califica (no hay app del pasajero).
//   5) «Avisar a la central» (SOS): bienvenida.avisarCentral: true si la cooperativa lo puede recibir (siempre en el
//      modo revisor, donde no le llega a nadie real); sin el campo no se ofrece. POST /api/sos { rol, empresa?,
//      viajeId?, pos?: { lat, lng, precision? }, clave } → { ok, id, veces, prueba? }; 403 sos_no_disponible,
//      429 demasiados_sos { retryS }. La misma clave no duplica la alerta: sin señal la app reintenta con ella hasta 2
//      minutos (nucleo/sos.js). El SOS no manda push: la central lo ve en su panel.
//   6) Avisos de la cooperativa (nucleo/bandeja.js): aviso (central → app) { id, titulo, texto, de, en,
//      para: 'conductores' | 'pasajeros' }; GET /api/avisos?rol= → { avisos: [{ id, titulo, texto, de, en, leido }] }
//      (los de 30 días); POST /api/avisos/leidos { ids }; push { tipo: 'aviso', id }. Texto plano sin enlaces: la app lo
//      pinta con textContent (avisoDeCentral lo limpia). El pasajero apaga los de una cooperativa: GET /api/yo/avisos →
//      { bajas: [empresa] } y PUT /api/yo/avisos { empresa, recibir }.

export const MENSAJES_CENTRAL = Object.freeze({
  sacadoDeTurno: 'sacado_de_turno',
  aviso: 'aviso',
});

// cancelacion.por cuando cancela la central desde el panel (forma futura; la 0.7.0 manda por: 'sistema' con
// motivo: 'central', ver canceladaPorCentral).
export const POR_CENTRAL = 'central';
// cancelacion.motivo con el que la central 0.7.0 dice «la canceló la central» (es un código, no un texto).
export const MOTIVO_CENTRAL = 'central';

// ¿Esta cancelación la hizo la central desde el panel? { por: 'sistema', motivo: 'central' } (0.7.0) o
// { por: 'central' }.
export function canceladaPorCentral(d) {
  return Boolean(d) && typeof d === 'object' && (d.por === POR_CENTRAL || (d.por === 'sistema' && d.motivo === MOTIVO_CENTRAL));
}

// El motivo que se puede mostrar de una cancelación de la central: '' si solo trae el código 'central'.
export function motivoDeCancelacion(d) {
  return !d || d.motivo === MOTIVO_CENTRAL ? '' : motivoCentral(d.motivo);
}

// Motivo del plugin UbicacionTurno cuando la central respondió seguir: false sin que la app lo pidiera.
export const PARADA_POR_CENTRAL = 'servidor';

const MAX_MOTIVO = 200;

// El motivo que escribió la central, como texto plano de una línea: sin caracteres de control ni de dirección (el
// servidor ya los rechaza; esto es la segunda barrera), sin espacios repetidos y cortado a 200. '' si no hay.
export function motivoCentral(m) {
  if (typeof m !== 'string') return '';
  const limpio = m
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpio.length > MAX_MOTIVO ? `${limpio.slice(0, MAX_MOTIVO - 1).trimEnd()}…` : limpio;
}

// ¿La solicitud la ofrece la central a este conductor («Ofrecer a un móvil»)?
export function ofrecidaPorCentral(s) {
  return s?.central === true;
}

// Ronda 4A: ¿la solicitud (o el viaje) es un pedido que la central tomó por teléfono («Pedido de la central»)?
export function esPedidoCentral(x) {
  return x?.pedidoCentral === true;
}

// Hora (ms) de un dato de la central: número o texto con dígitos (en Android los datos del push llegan como texto).
export function horaCentral(v) {
  const n = typeof v === 'string' && /^\d{10,16}$/.test(v.trim()) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------------- ronda 4A: avisos de la cooperativa ---------------- */

const MAX_TITULO_AVISO = 60;
const MAX_TEXTO_AVISO = 300;
const MAX_DE_AVISO = 80;
const ID_AVISO = /^[A-Za-z0-9_-]{1,64}$/;
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

// Una línea de texto plano: sin caracteres de control ni de dirección, sin espacios repetidos y cortada a max.
export function lineaCentral(t, max = MAX_MOTIVO) {
  if (typeof t !== 'string') return '';
  const limpio = t.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

// Texto de varios renglones (el del aviso): como lineaCentral, pero conserva los saltos de línea (dos seguidos como
// mucho). El diseño lo pinta con textContent (white-space: pre-line).
function parrafosCentral(t, max) {
  if (typeof t !== 'string') return '';
  const limpio = t
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, ' ')
    .split('\n')
    .map((r) => r.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trimEnd()}…` : limpio;
}

// Hora de un aviso: ms (número o texto con dígitos) o una fecha ISO.
function horaAviso(v) {
  const n = horaCentral(v);
  if (n) return n;
  const t = typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN;
  return Number.isFinite(t) && t > 0 ? t : null;
}

// Un aviso de la cooperativa (mensaje «aviso» del bus o una fila de GET /api/avisos) como texto plano y con lo justo:
// { id, titulo, texto, de, en, para, leido }. null si no sirve (sin id, sin título o sin texto) o si es para el otro rol
// (rol: 'conductor' | 'pasajero'; sin «para», vale).
export function avisoDeCentral(d, { rol = '' } = {}) {
  if (!d || typeof d !== 'object') return null;
  const id = typeof d.id === 'number' && Number.isInteger(d.id) && d.id > 0 ? String(d.id) : typeof d.id === 'string' && ID_AVISO.test(d.id) ? d.id : '';
  const titulo = lineaCentral(d.titulo, MAX_TITULO_AVISO);
  const texto = parrafosCentral(d.texto, MAX_TEXTO_AVISO);
  if (!id || !titulo || !texto) return null;
  const para = d.para === 'conductores' || d.para === 'pasajeros' ? d.para : null;
  if (rol && para && para !== (rol === 'conductor' ? 'conductores' : 'pasajeros')) return null;
  return { id, titulo, texto, de: lineaCentral(d.de, MAX_DE_AVISO), en: horaAviso(d.en) || Date.now(), para, leido: Boolean(d.leido) };
}

// «Motivo: …» con un solo punto al final.
function conMotivo(motivo) {
  if (!motivo) return '';
  return `Motivo: ${motivo}${/[.!?…]$/.test(motivo) ? '' : '.'} `;
}

// Los textos de la app (todos los diseños usan estos). El motivo va como texto: el diseño lo pinta con textContent o
// escapado (S30).
export const textosCentral = Object.freeze({
  // La central lo sacó de turno. conServicio: tiene un servicio en curso; alTerminar: lo terminó y ya quedó fuera;
  // yaFuera: la app ya estaba fuera de turno (estuvo cerrada).
  sacado({ motivo = '', conServicio = false, alTerminar = false, yaFuera = false } = {}) {
    if (conServicio) {
      return { titulo: 'La central te sacó de turno', cuerpo: `${conMotivo(motivo)}Termina este servicio; después quedarás desconectado.` };
    }
    if (alTerminar) {
      return { titulo: 'Quedaste desconectado', cuerpo: `La central te sacó de turno. ${conMotivo(motivo)}Puedes volver a conectarte cuando quieras.` };
    }
    return {
      titulo: 'La central te sacó de turno',
      cuerpo: `${conMotivo(motivo)}${yaFuera ? 'No estás recibiendo servicios.' : 'Ya no te llegan servicios.'} Puedes volver a conectarte cuando quieras.`,
    };
  },
  // La central canceló el servicio que tenía el conductor (o la oferta que le había llegado).
  // sigueEnTurno: false si la central ya lo había sacado de turno (queda «Desconectado» al soltar el servicio).
  canceladoConductor({ motivo = '', sigueEnTurno = true } = {}) {
    return {
      titulo: 'La central canceló el servicio',
      cuerpo: `${conMotivo(motivo)}${sigueEnTurno ? 'Sigues en turno.' : 'Ya no estás en turno.'}`,
      tituloOferta: 'La central canceló ese servicio',
      cuerpoOferta: 'Sigue atento a nuevas solicitudes.',
      historial: motivo ? `Cancelado por la central: ${motivo}` : 'Cancelado por la central',
    };
  },
  // La central canceló la solicitud (buscando) o el servicio (con conductor) del pasajero. empresa: el nombre.
  canceladoPasajero({ motivo = '', buscando = true, empresa = 'La cooperativa', hayCentral = true } = {}) {
    return {
      titulo: `${empresa} canceló tu ${buscando ? 'solicitud' : 'servicio'}`,
      cuerpo: `${conMotivo(motivo)}Si aún necesitas un taxi, ${hayCentral ? 'llama a la central o ' : ''}pide otro.`,
      historial: motivo ? `Cancelado por la central: ${motivo}` : 'Cancelado por la central',
    };
  },
  // Ronda 4A: el pedido que la central tomó por teléfono, en la app del conductor. nombre: el primer nombre de quien
  // llamó (texto plano; el diseño lo pinta con textContent).
  pedidoCentral({ nombre = '' } = {}) {
    const n = lineaCentral(nombre, 40) || 'quien llamó';
    return {
      chip: 'Pedido de la central',
      detalle: 'Lo pidió por teléfono a la central',
      tituloOferta: 'Pedido de la central',
      llamar: `Llamar a ${n}`,
      sinCelular: 'La central no dejó un celular para este pedido.',
      confirmar: `Confirma que es ${n}`,
      confirmarDetalle: 'Este pedido lo tomó la central por teléfono: no tiene código de abordaje. Pregúntale su nombre antes de iniciar el viaje.',
      iniciar: 'Iniciar viaje',
      historial: 'Pedido de la central',
    };
  },
  // Ronda 4A: «Avisar a la central» (SOS) de las dos apps. empresa: el nombre de la cooperativa.
  sos({ empresa = 'tu cooperativa' } = {}) {
    return {
      boton: `Avisar a la central de ${empresa}`,
      botonCorto: 'Avisar a la central',
      enviando: { titulo: 'Avisando a la central…', cuerpo: `Le estamos mandando a la central de ${empresa} tu ubicación y tu viaje.` },
      enviado: { titulo: `Le avisamos a la central de ${empresa}`, cuerpo: 'Si estás en peligro, llama al 123.' },
      sinSenal: { titulo: 'Sin señal: seguimos intentando', cuerpo: `Seguimos tratando de avisarle a la central de ${empresa} durante 2 minutos. Si estás en peligro, llama al 123.` },
      fallo: { titulo: 'No pudimos avisarle a la central', cuerpo: 'No hubo señal en 2 minutos. Si estás en peligro, llama al 123.' },
      demasiados: { titulo: 'Ya le avisaste a la central', cuerpo: 'Ya le avisaste a la central hace un momento. Si estás en peligro, llama al 123.' },
      noDisponible: { titulo: 'La central no recibe este aviso', cuerpo: `La central de ${empresa} no recibe avisos por la app. Si estás en peligro, llama al 123.` },
      error: { titulo: 'No pudimos avisarle a la central', cuerpo: 'Intenta de nuevo. Si estás en peligro, llama al 123.' },
    };
  },
  // Ronda 4A: un aviso de la cooperativa (la tarjeta y la bandeja). de: el nombre que manda la central.
  avisoCooperativa({ de = '' } = {}) {
    const d = lineaCentral(de, MAX_DE_AVISO);
    return {
      titulo: d ? `Aviso de ${d}` : 'Aviso de tu cooperativa',
      boton: 'Entendido',
      bandeja: 'De tu cooperativa',
      vacia: 'Aquí verás los avisos que te mande tu cooperativa.',
      nuevo: 'Nuevo',
    };
  },
  // Ronda 4A: el interruptor del pasajero en Ajustes (la baja voluntaria). empresa: el nombre de la cooperativa.
  bajaAvisos({ empresa = 'tu cooperativa' } = {}) {
    return {
      titulo: `Avisos de ${empresa}`,
      detalle: 'Avisos del servicio de tu cooperativa, nunca publicidad',
      error: 'No pudimos guardar el cambio. Intenta de nuevo.',
    };
  },
});
