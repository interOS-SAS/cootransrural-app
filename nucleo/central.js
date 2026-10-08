// Fase 3 del panel («En vivo y viajes», servidor 0.7.0): lo que la central de la cooperativa hace desde el mapa en
// vivo del panel y les llega a las apps (modo real). La demo no cambia: estos mensajes solo los manda el servidor.
//
// Contrato (§6.3, §6.5 y §4.7 del diseño del panel; los nombres de los mensajes están solo aquí):
//
//   1) «Sacar de turno» (POST /api/panel/c/:coop/en-vivo/conductores/:id/sacar { motivo }):
//      - Con el WebSocket abierto: sacado_de_turno (central → conductor) { motivo, en }. motivo: texto plano que
//        escribió la central (el servidor lo valida, S30; la app lo pinta como texto y corta a 200); en: hora (ms) en
//        que lo sacó (opcional). La central NO cierra el bus (no es un 4403): el conductor sigue con su sesión y puede
//        volver a ponerse en turno («Conectarme»), con su presencia disponible: true de siempre.
//        La app, sin servicio: queda «Desconectado» (sin ofertas, presencia disponible: false) y dice «La central te
//        sacó de turno» con el motivo. Con un servicio en curso: lo termina y queda «Desconectado» al terminarlo.
//      - Sin WebSocket (app minimizada o cerrada):
//          · push al conductor con datos { tipo: 'sacado_de_turno', motivo, en } (el texto lo arma el servidor:
//            «La central te sacó de turno: {motivo}.»);
//          · el siguiente POST /api/conductor/ubicacion del plugin recibe { ok: true, seguir: false } sin que lo haya
//            pedido (sin fin): el plugin se detiene con el motivo 'servidor';
//          · en la siguiente conexión de esa cuenta (si no volvió a ponerse en turno), la bienvenida trae
//            sacadoDeTurno: { motivo, en } (una sola vez). Así la app no anuncia presencia disponible al volver.
//        La app lo aplica también sola (sin esperar la bienvenida) al tocar ese push y cuando el plugin se detiene
//        con 'servidor' estando en turno y sin servicio; después vuelve a saludar a la central.
//   2) «Cancelar y avisar al pasajero» (POST …/en-vivo/viajes/:id/cancelar { motivo }):
//      cancelacion (central → pasajero y conductores que lo tenían, ofrecido o asignado)
//        { viajeId, por: 'central', motivo, conductorId? }.
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

export const MENSAJES_CENTRAL = Object.freeze({
  sacadoDeTurno: 'sacado_de_turno',
});

// cancelacion.por cuando cancela la central desde el panel.
export const POR_CENTRAL = 'central';

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

// Hora (ms) de un dato de la central: número o texto con dígitos (en Android los datos del push llegan como texto).
export function horaCentral(v) {
  const n = typeof v === 'string' && /^\d{10,16}$/.test(v.trim()) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
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
});
