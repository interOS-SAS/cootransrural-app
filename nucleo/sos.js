// «Avisar a la central» (ronda 4A, servidor 0.9.0): el SOS de las apps le llega a la central de la cooperativa con la
// posición del momento y el viaje en curso (una franja roja en su panel y un correo sin coordenadas a los gerentes).
// Contrato en la cabecera de nucleo/central.js. Lo usan los controladores (p.avisarCentral() y c.avisarCentral()).
//
//   const envio = enviarSos({ rol: 'pasajero', empresa, viajeId, pos });   // pos: { lat, lng, precision? }, una
//                                                                          // promesa de eso, o null
//   envio.on('estado', ({ estado, intento }) => pintar(estado));
//   const r = await envio.listo;
//   // r.estado: 'enviado' ({ id, veces, prueba }) | 'demasiados' ({ retryS }) | 'no_disponible' | 'fallo' (sin señal
//   //           en 2 minutos) | 'sin_sesion' | 'error' ({ codigo }) | 'cancelado'
//   envio.cancelar();
//
// Sin señal (sin_red) o con la central caída (5xx) reintenta con la MISMA clave (la central no duplica la alerta: la
// segunda vez responde lo mismo) a los 3, 5, 10 y luego cada 15 s, hasta 2 minutos desde el toque. Mientras tanto el
// estado es 'reintentando' ({ intento, hasta }). La clave la pone la app (^[A-Za-z0-9_-]{8,40}$).
import * as servidor from './servidor.js';
import { obtenerPosicion } from './geo.js';
import { Emisor, uid } from './util.js';

export const PLAZO_SOS_MS = 2 * 60 * 1000;
const ESPERAS_MS = [3000, 5000, 10000, 15000];

export const claveSos = () => uid('sos');

// { lat, lng, precision? } con números que la central acepta; null si no hay posición.
function posSos(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = Number(p.lat);
  const lng = Number(p.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const pos = { lat, lng };
  const precision = Number(p.precision);
  if (p.precision != null && Number.isFinite(precision) && precision >= 0) pos.precision = Math.min(100000, Math.round(precision));
  return pos;
}

// La posición para el SOS: una lectura del momento (hasta «espera» ms; con la caché de 15 s del GPS suele ser
// inmediata) o, si no llega, la última buena que tenga la app (ultima). leer: false para usar solo la última (el
// conductor en turno, que ya sigue su GPS, o el modo revisor, que usa el paradero de la cooperativa).
export async function posicionParaSos(ultima = null, { leer = true, espera = 4000 } = {}) {
  if (leer) {
    try {
      const p = await obtenerPosicion({ espera });
      if (p?.real) return posSos(p);
    } catch {
      /* sin GPS: la última */
    }
  }
  return posSos(ultima);
}

export function enviarSos({ rol = 'pasajero', empresa = '', viajeId = null, pos = null, clave = claveSos(), plazoMs = PLAZO_SOS_MS, esperas = ESPERAS_MS } = {}) {
  const envio = new Emisor();
  const cuerpo = { rol: rol === 'conductor' ? 'conductor' : 'pasajero', clave };
  // El conductor va con su cooperativa activa (la sabe la central); el pasajero manda la que usa.
  if (cuerpo.rol === 'pasajero' && empresa) cuerpo.empresa = String(empresa);
  if (viajeId) cuerpo.viajeId = String(viajeId).slice(0, 64);
  const inicio = Date.now();
  let intento = 0;
  let reloj = null;
  let final = null;
  let resolver;
  envio.listo = new Promise((r) => {
    resolver = r;
  });
  envio.clave = clave;
  envio.estado = 'enviando';
  envio.inicio = inicio;
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
      if (intento === 1) {
        const p = posSos(await pos);
        if (p) cuerpo.pos = p;
      }
      if (final) return;
      const r = await servidor.sos(cuerpo);
      terminar({ estado: 'enviado', id: r?.id ?? null, veces: Number(r?.veces) || 1, prueba: r?.prueba === true });
    } catch (err) {
      if (final) return;
      const codigo = err?.codigo || 'error_interno';
      if (codigo === 'demasiados_sos' || err?.estado === 429) return terminar({ estado: 'demasiados', retryS: err?.retryS ?? null });
      // Una central anterior (sin /api/sos) o una cooperativa que no lo recibe.
      if (codigo === 'sos_no_disponible' || servidor.rutaNoDisponible(err)) return terminar({ estado: 'no_disponible' });
      if (codigo === 'sin_sesion') return terminar({ estado: 'sin_sesion' });
      const reintentar = codigo === 'sin_red' || (Number(err?.estado) >= 500 && Number(err?.estado) <= 599);
      if (!reintentar) return terminar({ estado: 'error', codigo });
      const espera = esperas[Math.min(intento - 1, esperas.length - 1)];
      if (Date.now() - inicio + espera > plazoMs) return terminar({ estado: 'fallo', codigo });
      envio.estado = 'reintentando';
      envio.emit('estado', { estado: 'reintentando', intento, codigo, hasta: inicio + plazoMs });
      reloj = setTimeout(probar, espera);
    }
  };
  envio.cancelar = () => terminar({ estado: 'cancelado' });
  // Los oyentes se ponen después de crearlo: lo primero que se emite llega tras la primera respuesta.
  probar();
  return envio;
}
