// Reglas del despacho y mensajes nuevos del bus (modo real, servidor con «Reglas del despacho»).
//
// El gerente de cada cooperativa edita en el panel (Reglas → «Reglas del despacho») cuánto dura una
// oferta, a cuántos metros vale «Llegué» y cuánto busca la central un taxi. La central se las manda a
// la app en la bienvenida del bus (y con el mensaje «reglas» si cambian con la app abierta); aquí se
// leen con los valores de hoy si no vienen (servidores anteriores) y se guardan en el teléfono por
// cooperativa: sirven antes de la próxima bienvenida (por ejemplo, «Llegué» recién recargada la página
// y sin conexión todavía).
//
// Contrato (docs/CONTRATO.md del servidor, rama reglas-despacho). Los nombres están solo en MENSAJES:
//
//   bienvenida (central → pasajero y conductor): datos.reglas = { segundosOferta, metrosLlegue,
//     minutosBusqueda }. Lo que falte o no sea número queda con el valor de hoy y lo que se salga de
//     los topes del panel se lleva al tope. Sin reglas (central anterior), los valores de hoy.
//   reglas (central → pasajero y conductor) { segundosOferta, metrosLlegue, minutosBusqueda }: el
//     gerente las cambió con la app abierta; valen desde ya (la oferta que ya está en pantalla sigue
//     con su cuenta).
//
//   oferta_vista (conductor → central) { viajeId }: la solicitud quedó en pantalla con la app a la
//     vista (una vez cada vez que llega). Si llega con la app oculta (la web, o la app sin el plugin),
//     sale al volver si sigue en pantalla. La central no se la vuelve a ofrecer por push y, si no la
//     acepta en segundosOferta, deja de contarlo como alguien que la puede tomar.
//   rechazo (conductor → central) { viajeId }: el conductor tocó «Rechazar». No sale cuando la cuenta
//     regresiva se vence (esa ya salió como vista) ni cuando la oferta se quita sola (la tomó otro, se
//     canceló). La central no se la vuelve a ofrecer (ni por push ni por el bus).
//   Las centrales anteriores ignoran los dos (tipos desconocidos): las apps nuevas sirven con la central
//   de hoy, y las viejas (sin estos mensajes) siguen como hoy con la nueva.
//
//   sin_conductores (central → pasajero) { viajeId, motivo }: la búsqueda no le llegó a nadie que la
//     pueda tomar. motivo: 'sin_taxis' (nadie en turno en el radio), 'ocupados' (los del radio están en
//     un servicio), 'rechazado' (los que la recibieron la rechazaron o se les venció) o 'excluidos' (solo
//     hay taxis en pausa con este pasajero). La app lo dice y ofrece llamar a la central, pero sigue
//     buscando: la central se la ofrece al primero que pueda. Al reconectarse, la central lo repite
//     después de viaje_actual si sigue así (por eso la app lo olvida con cada bienvenida).
//   con_conductores (central → pasajero) { viajeId }: el contrario, ya le llegó a alguien.
import { ID_EMPRESA } from './config.js';

export const MENSAJES = Object.freeze({
  reglas: 'reglas',
  ofertaVista: 'oferta_vista',
  rechazo: 'rechazo',
  sinConductores: 'sin_conductores',
  conConductores: 'con_conductores',
});

// Los valores de hoy (lo que la app hacía fijo) y los topes del panel.
export const REGLAS_POR_DEFECTO = Object.freeze({ segundosOferta: 25, metrosLlegue: 150, minutosBusqueda: 10 });
export const TOPES = Object.freeze({
  segundosOferta: [15, 60],
  metrosLlegue: [50, 300],
  minutosBusqueda: [3, 20],
});

const CLAVE = `tc.real.reglas.${ID_EMPRESA}`;

function valor(nombre, crudo) {
  const n = typeof crudo === 'string' && crudo.trim() !== '' ? Number(crudo) : crudo;
  if (typeof n !== 'number' || !Number.isFinite(n)) return REGLAS_POR_DEFECTO[nombre];
  const [min, max] = TOPES[nombre];
  return Math.min(max, Math.max(min, Math.round(n)));
}

// datos.reglas de la bienvenida, o los datos del mensaje «reglas» (las tres sueltas).
const fuenteDe = (datos) => (datos?.reglas && typeof datos.reglas === 'object' ? datos.reglas : datos || {});

// Las reglas que trae una bienvenida o un mensaje «reglas» (o lo guardado), completas y dentro de los topes.
export function leerReglas(datos) {
  const fuente = fuenteDe(datos);
  const r = {};
  for (const nombre of Object.keys(REGLAS_POR_DEFECTO)) r[nombre] = valor(nombre, fuente[nombre]);
  return r;
}

// ¿Trae reglas? (Una central anterior no las manda.)
export function traeReglas(datos) {
  const fuente = fuenteDe(datos);
  return Object.keys(REGLAS_POR_DEFECTO).some((n) => fuente[n] != null);
}

export function reglasGuardadas() {
  try {
    return leerReglas(JSON.parse(localStorage.getItem(CLAVE) || 'null'));
  } catch {
    return { ...REGLAS_POR_DEFECTO };
  }
}

function guardarReglas(r) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(r));
  } catch {
    /* almacenamiento lleno o bloqueado: valen en memoria */
  }
}

// Reglas con la bienvenida (o el mensaje «reglas»): las suyas si las trae, y se guardan. Si no las trae, la
// central es una anterior, que trabaja con los valores de hoy: esos.
export function reglasDeBienvenida(datos) {
  const r = traeReglas(datos) ? leerReglas(datos) : { ...REGLAS_POR_DEFECTO };
  guardarReglas(r);
  return r;
}

// Lo que dice la app del pasajero cuando su búsqueda no le llega a nadie, según el motivo de la central. No dice
// que un conductor está «en pausa» con él ('excluidos'): para el pasajero es que no hay taxis disponibles.
export function textoSinConductores(motivo, cooperativa = 'la cooperativa') {
  switch (motivo) {
    case 'sin_taxis':
      return { titulo: 'No hay taxis en turno cerca', detalle: `Ningún taxi de ${cooperativa} está en turno cerca de tu punto. Seguimos buscando: apenas uno se conecte, le llega tu solicitud.` };
    case 'ocupados':
      return { titulo: 'Los taxis cercanos están ocupados', detalle: `Los taxis de ${cooperativa} cerca de tu punto están en otros servicios. Seguimos buscando: apenas uno quede libre, le llega tu solicitud.` };
    case 'rechazado':
      return { titulo: 'Ningún taxi tomó tu solicitud', detalle: 'Los taxis cercanos no la aceptaron. Seguimos buscando: si otro queda libre, le llega tu solicitud.' };
    default:
      return { titulo: 'No hay taxis disponibles ahora', detalle: `Ningún taxi de ${cooperativa} cerca de tu punto puede recibir tu solicitud en este momento. Seguimos buscando: apenas uno quede libre, le llega.` };
  }
}
