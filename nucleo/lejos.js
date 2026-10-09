// «Lejos de toda cooperativa» (pedido de Oscar, 9-oct-2026): la app TaxiCun en modo real avisa a quien la abre
// lejos de toda cooperativa que ya atiende de verdad, en vez de dejarlo registrarse o mirar un mapa vacío.
//
//  - Conductor, al enviar «Tu taxi» por primera vez: si el teléfono está a más de LEJOS_KM de la zona (o del
//    centro) de toda cooperativa real → «Todavía no hay una cooperativa de TaxiCun cerca de ti» con «Quiero TaxiCun en
//    mi cooperativa» (formulario de interesados), «Ver cómo funciona» (la demostración) y «Sí soy de <coop>,
//    continuar» (el registro sigue normal). El registro lleva la posición (pos) y, si la persona confirmó, confirmoLejos.
//  - Pasajero, con la sesión lista y la bienvenida de la central: lejos de toda zona → «Todavía no llegamos a tu zona»
//    con «Avísame cuando llegue» (el mismo formulario, rol pasajero) y «Ver cómo funciona».
//  - Sin GPS o sin permiso: no se bloquea nada (no hay aviso). La cuenta de revisión (revisores de Apple y Google, que
//    prueban desde otros países) nunca ve el aviso: el pasajero lo sabe por la bienvenida (revision: true) y el
//    conductor por la respuesta de la cuenta (revision: true|false en /api/yo, auth/entrar, auth/llave, PATCH yo y PUT
//    conductor). Si el servidor no dice nada (anterior a la ronda), el conductor no ve el aviso ni manda la posición:
//    así ningún revisor lo ve con un servidor viejo.
//
// Contrato propuesto (ver /tmp/cootrans/arreglos/CONTRATO-LEJOS.md; la integración lo ajusta):
//   PUT /api/conductor { …, pos?: { lat, lng, precision? }, confirmoLejos?: true }   (el servidor calcula y guarda los km)
//   POST /api/interesados { rol: 'conductor'|'pasajero', municipio, cooperativa, nombre, celular, empresa?, pos?: { lat, lng } }
//     → { ok: true }. Errores: datos_invalidos (400/422), demasiados_interesados (429, retryS). Con sesión (Bearer).
//     El servidor guarda el interesado para interOS y avisa por correo a info@taxicun.com.
// Todo lo que escribe la persona es TEXTO: se limpia aquí (sin caracteres de control, con tope) y el servidor lo vuelve a
// limpiar; en pantalla va con textContent o escapado.
import { distanciaKm, dentroDeZona } from './util.js';

export const LEJOS_KM = 30;
export const CORREO_INFO = 'info@taxicun.com';

// Topes del formulario (los mismos que revisa el servidor).
export const TOPES = Object.freeze({ municipio: 60, cooperativa: 80, nombre: 80 });

const valido = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

// Distancia (km) de pos al servicio de una cooperativa: a su zona (0 adentro) si la tiene; si no, a su centro.
export function kmACooperativa(pos, coop) {
  if (!valido(pos) || !coop) return Infinity;
  if (coop.zona) {
    const r = dentroDeZona(coop.zona, pos);
    if (r) return r.dentro ? 0 : r.km;
  }
  return valido(coop.centro) ? distanciaKm(pos, coop.centro) : Infinity;
}

// La más cercana de las cooperativas reales: { coop, km } o null (sin posición o sin cooperativas).
export function masCercana(pos, cooperativas = []) {
  let mejor = null;
  for (const c of cooperativas) {
    const km = kmACooperativa(pos, c);
    if (Number.isFinite(km) && (!mejor || km < mejor.km)) mejor = { coop: c, km };
  }
  return mejor;
}

// ¿Está lejos de TODA cooperativa real? Sin posición válida o sin cooperativas: false (no se bloquea nada).
export function estaLejos(pos, cooperativas = [], limite = LEJOS_KM) {
  const m = masCercana(pos, cooperativas);
  return Boolean(m) && m.km > limite;
}

// Lista de cooperativas reales para la cuenta: la abierta (con su zona de la ficha, si la tiene) y las otras que el
// servidor marca reales (con su centro del índice). actual: { id, nombre, pueblo, centro }; zona: ZONA_SERVICIO.
export function cooperativasReales({ actual = null, zona = null, centro = null, otras = [] } = {}) {
  const lista = [];
  if (actual) lista.push({ id: actual.id, nombre: actual.nombre, pueblo: actual.pueblo, centro: valido(actual.centro) ? actual.centro : centro, zona: zona || null });
  for (const c of Array.isArray(otras) ? otras : []) {
    if (c && c.id !== actual?.id && valido(c.centro)) lista.push({ id: c.id, nombre: c.nombre, pueblo: c.pueblo, centro: c.centro, zona: null });
  }
  return lista;
}

// Bandera de revisión que manda el servidor con la cuenta: true | false | null (no la mandó: servidor anterior).
export function revisionDe(r) {
  if (typeof r?.revision === 'boolean') return r.revision;
  if (typeof r?.usuario?.revision === 'boolean') return r.usuario.revision;
  return null;
}

// Kilómetros para el texto («a unos 45 km»): enteros; de 1000 en adelante, con separador de miles.
export function kmTexto(km) {
  const n = Math.max(1, Math.round(Number(km) || 0));
  return `${n.toLocaleString('es-CO')} km`;
}

// Texto plano: sin caracteres de control ni marcas de dirección, espacios simples y con tope.
export function textoLimpio(t, max) {
  return String(t ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Posición que viaja al servidor: redondeada (el registro, a ~10 m; los interesados, a ~1 km: basta para el municipio).
export function posParaServidor(p, decimales = 4) {
  if (!valido(p)) return null;
  const f = 10 ** decimales;
  const salida = { lat: Math.round(p.lat * f) / f, lng: Math.round(p.lng * f) / f };
  const precision = Number(p.precision);
  if (decimales >= 4 && Number.isFinite(precision) && precision >= 0) salida.precision = Math.min(99999, Math.round(precision));
  return salida;
}

// Revisa el formulario. Devuelve { datos } o { error: { campo, texto } }.
// rol pasajero: la cooperativa es opcional (puede no saber cuál hay en su municipio).
export function revisarInteresado({ rol, municipio, cooperativa, nombre, celular }) {
  const d = {
    rol: rol === 'pasajero' ? 'pasajero' : 'conductor',
    municipio: textoLimpio(municipio, TOPES.municipio),
    cooperativa: textoLimpio(cooperativa, TOPES.cooperativa),
    nombre: textoLimpio(nombre, TOPES.nombre),
    celular: String(celular ?? '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, ''),
  };
  if (d.municipio.length < 2) return { error: { campo: 'municipio', texto: 'Escribe tu municipio.' } };
  if (d.rol === 'conductor' && d.cooperativa.length < 2) return { error: { campo: 'cooperativa', texto: 'Escribe el nombre de tu cooperativa o empresa de taxis.' } };
  if (d.nombre.length < 3 || !/[a-záéíóúñü]/i.test(d.nombre) || /[\d@]/.test(d.nombre)) return { error: { campo: 'nombre', texto: 'Escribe tu nombre completo (sin números).' } };
  if (!/^3\d{9}$/.test(d.celular)) return { error: { campo: 'celular', texto: 'El celular debe tener 10 dígitos y empezar por 3.' } };
  return { datos: d };
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
