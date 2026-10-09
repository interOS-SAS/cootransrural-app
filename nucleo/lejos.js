// «Lejos de toda cooperativa» (pedido de Oscar, 9-oct-2026): la app TaxiCun en modo real avisa a quien la abre
// lejos de toda cooperativa que ya atiende de verdad, en vez de dejarlo registrarse o mirar un mapa vacío.
//
// Contrato: docs/CONTRATO.md §13 del servidor (0.11.0). Quien decide si está lejos es el SERVIDOR:
//   POST /api/cercania { lat, lng, precisionM? } (con el token de la sesión)
//     → { lejos, km, umbralKm, exento, cooperativa: { id, nombre } | null }
//     La cuenta de revisión de las tiendas y las de prueba responden exento: true esté donde esté (Apple y Google prueban
//     desde otros países): con exento nunca hay aviso. La posición no se guarda.
//   POST /api/interesados { rol, nombre, celular, municipio, cooperativa?, distanciaKm?, plataforma?, autorizo: true,
//     version, tiempoMs?, sitioWeb? } → SIEMPRE 200 { ok: true } si el formato cuadra (400 datos_invalidos si no).
//     Esquema cerrado: nada más que eso. tiempoMs < 3000 o sitioWeb con algo = trampa (no se guarda, igual { ok }).
//   PUT /api/conductor { …, ubicacion?: { lat, lng, precisionM? } }: el servidor guarda a cuántos km de la cooperativa
//     se hizo el registro («Se registró a N km» en el panel). Solo si /api/cercania respondió y no es exento.
//
//  - Conductor, al enviar «Tu taxi» por primera vez: una lectura del GPS y /api/cercania. Si lejos → «Todavía no hay una
//    cooperativa de TaxiCun cerca de ti» con «Quiero TaxiCun en mi cooperativa» (formulario de interesados), «Ver cómo
//    funciona» (la demostración) y «Sí soy de <coop>, continuar» (el registro sigue con la ubicación).
//  - Pasajero, con la sesión lista y la bienvenida de la central: /api/cercania; lejos → «Todavía no llegamos a tu zona»
//    con «Avísame cuando llegue» (el mismo formulario, rol pasajero) y «Ver cómo funciona».
//  - Sin GPS, sin permiso, sin red o con un error de /api/cercania (p. ej. un servidor anterior, 404): no se bloquea nada
//    (ni aviso ni ubicación en el registro).
// Todo lo que escribe la persona es TEXTO: se limpia aquí (sin caracteres de control, con tope) y el servidor lo vuelve a
// limpiar; en pantalla va con textContent o escapado.
import { ES_NATIVA } from './plataforma.js';

export const LEJOS_KM = 30;
export const CORREO_INFO = 'info@taxicun.com';

// Topes del formulario (los mismos que revisa el servidor).
export const TOPES = Object.freeze({ municipio: 60, cooperativa: 80, nombre: 80 });

// La casilla de la autorización: el texto va TAL CUAL (si cambia, cambia la versión en el servidor y aquí).
export const AUTORIZACION = Object.freeze({
  version: '1.0',
  texto: 'Autorizo a interOS S.A.S. (NIT 901.213.197-5) a usar estos datos para contactarme sobre la llegada de TaxiCun a '
    + 'mi municipio o cooperativa. Los guardan hasta 12 meses. Puedo pedir que los borren en info@taxicun.com.',
});

const valido = (p) => p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

// La posición que viaja al servidor (cercanía y registro): { lat, lng, precisionM? } redondeada a ~10 m.
export function ubicacionParaServidor(p) {
  if (!valido(p)) return null;
  const salida = { lat: Math.round(p.lat * 1e4) / 1e4, lng: Math.round(p.lng * 1e4) / 1e4 };
  const precision = Number(p.precision);
  if (p.precision != null && Number.isFinite(precision) && precision >= 0) salida.precisionM = Math.min(1_000_000, Math.round(precision));
  return salida;
}

// La respuesta de POST /api/cercania, revisada: { lejos, km, exento, cooperativa } o null si no tiene la forma esperada
// (entonces no hay aviso).
export function respuestaCercania(r) {
  if (!r || typeof r !== 'object' || typeof r.lejos !== 'boolean') return null;
  const km = typeof r.km === 'number' && Number.isFinite(r.km) && r.km >= 0 ? r.km : null;
  const c = r.cooperativa && typeof r.cooperativa === 'object' && typeof r.cooperativa.id === 'string'
    ? { id: r.cooperativa.id, nombre: typeof r.cooperativa.nombre === 'string' ? r.cooperativa.nombre : '' }
    : null;
  const exento = r.exento === true;
  return { lejos: r.lejos && !exento && km !== null, km, exento, cooperativa: c };
}

// ios | android | web: la plataforma que se anota con el interesado.
export function plataforma() {
  try {
    const p = globalThis.Capacitor?.getPlatform?.();
    if (p === 'ios' || p === 'android') return p;
  } catch {
    /* sin Capacitor */
  }
  if (ES_NATIVA) return /\bAndroid\b/i.test(globalThis.navigator?.userAgent || '') ? 'android' : 'ios';
  return 'web';
}

// Kilómetros para el texto («a unos 45 km»): enteros; de 1000 en adelante, con separador de miles.
export function kmTexto(km) {
  const n = Math.max(1, Math.round(Number(km) || 0));
  return `${n.toLocaleString('es-CO')} km`;
}

// Texto plano: sin caracteres de control ni marcas de dirección, sin < > ` (el servidor los quita), espacios simples y
// con tope.
export function textoLimpio(t, max) {
  return String(t ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/[<>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Lo que el servidor toma por un enlace (y rechaza con 400): mejor decirlo aquí, junto al campo.
const conEnlace = (t) => /:\/\/|www\.|\.(com|co|net|org|me|ly)\b/i.test(String(t || ''));

// Revisa el formulario. Devuelve { datos } o { error: { campo, texto } }.
// rol pasajero: la cooperativa es opcional (puede no saber cuál hay en su municipio).
export function revisarInteresado({ rol, municipio, cooperativa, nombre, celular, autorizo }) {
  const d = {
    rol: rol === 'pasajero' ? 'pasajero' : 'conductor',
    municipio: textoLimpio(municipio, TOPES.municipio),
    cooperativa: textoLimpio(cooperativa, TOPES.cooperativa),
    nombre: textoLimpio(nombre, TOPES.nombre),
    celular: String(celular ?? '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, ''),
  };
  if (d.municipio.length < 2) return { error: { campo: 'municipio', texto: 'Escribe tu municipio.' } };
  if (conEnlace(d.municipio)) return { error: { campo: 'municipio', texto: 'Escribe solo el nombre del municipio, sin enlaces.' } };
  if (d.rol === 'conductor' && d.cooperativa.length < 2) return { error: { campo: 'cooperativa', texto: 'Escribe el nombre de tu cooperativa o empresa de taxis.' } };
  if (conEnlace(d.cooperativa)) return { error: { campo: 'cooperativa', texto: 'Escribe solo el nombre de la cooperativa, sin enlaces.' } };
  if (d.nombre.length < 3 || !/[a-záéíóúñü]/i.test(d.nombre) || /[\d@]/.test(d.nombre) || conEnlace(d.nombre)) return { error: { campo: 'nombre', texto: 'Escribe tu nombre completo (sin números).' } };
  if (!/^3\d{9}$/.test(d.celular)) return { error: { campo: 'celular', texto: 'El celular debe tener 10 dígitos y empezar por 3.' } };
  if (autorizo !== true) return { error: { campo: 'autorizo', texto: 'Para enviar tus datos, marca la casilla de la autorización.' } };
  return { datos: d };
}

// El cuerpo de POST /api/interesados (esquema cerrado del servidor: solo estos campos).
// extra: { distanciaKm, tiempoMs, sitioWeb } (distanciaKm: el km de /api/cercania; sin él, no va).
export function cuerpoInteresado(datos, { distanciaKm = null, tiempoMs = null, sitioWeb = '' } = {}) {
  const c = { rol: datos.rol, nombre: datos.nombre, celular: datos.celular, municipio: datos.municipio, autorizo: true, version: AUTORIZACION.version, plataforma: plataforma() };
  if (datos.cooperativa) c.cooperativa = datos.cooperativa;
  if (typeof distanciaKm === 'number' && Number.isFinite(distanciaKm) && distanciaKm >= 0) c.distanciaKm = Math.min(20000, Math.round(distanciaKm * 10) / 10);
  if (Number.isFinite(tiempoMs) && tiempoMs >= 0) c.tiempoMs = Math.min(864_000_000, Math.round(tiempoMs));
  if (sitioWeb) c.sitioWeb = String(sitioWeb).slice(0, 200);
  return c;
}

// URL de la demostración (la app de siempre, sin el servidor): ?real=0 quita el modo real de la pestaña nueva. En la app
// nativa el enlace (target _blank) se abre en el navegador de la app (plataforma.js), donde la demo funciona.
export function urlDemostracion(urlApp, rol = 'pasajero') {
  return urlApp(rol === 'conductor' ? 'conductor' : 'pasajero', { real: '0' });
}

/* ---------------- Recordar el aviso del pasajero ----------------
 * «Ahora no»: no vuelve a salir en un día. Ya pidió «Avísame»: no vuelve en 30 días. */
const CLAVE_PASAJERO = 'taxicun.lejos.pasajero';
const DIA_MS = 24 * 3600 * 1000;

export function avisoPasajeroPendiente(ahora = Date.now()) {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_PASAJERO) || 'null');
    return !(g && Number(g.hasta) > ahora);
  } catch {
    return true;
  }
}

export function posponerAvisoPasajero({ enviado = false } = {}, ahora = Date.now()) {
  try {
    localStorage.setItem(CLAVE_PASAJERO, JSON.stringify({ hasta: ahora + (enviado ? 30 : 1) * DIA_MS }));
  } catch {
    /* sin almacenamiento: vuelve a salir la próxima vez */
  }
}
