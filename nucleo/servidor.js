// Cliente del servidor de TaxiCun (taxicun.com/api): cuenta con código por correo,
// perfil y registro del conductor. Solo se usa en MODO_REAL; la demo no lo toca.
//
//   import * as N from '../../nucleo/index.js';
//   await N.servidor.pedirCodigo(correo);
//   const { usuario, conductor } = await N.servidor.entrar(correo, codigo);
//   try { … } catch (e) { mostrar(N.textoError(e)); }
//
// Los errores del servidor llegan como { error: '<codigo>' } y aquí se lanzan como
// ErrorServidor (codigo, estado HTTP; message = la frase en español).
import { ES_NATIVA, URL_API } from './plataforma.js';
import { Emisor } from './util.js';

const CLAVE_TOKEN = 'taxicun.token';
const ESPERA_MS = 15000;

// Emite 'cerrada' { codigo: 'sin_sesion' } cuando el servidor dice que la sesión ya no
// vale (HTTP 401 o cierre 4401 del tiempo real). El diseño vuelve al ingreso.
export const sesion = new Emisor();

export function token() {
  try {
    return localStorage.getItem(CLAVE_TOKEN) || null;
  } catch {
    return null;
  }
}

export function guardarToken(t) {
  if (t) localStorage.setItem(CLAVE_TOKEN, String(t));
}

export function borrarToken() {
  try {
    localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}

export function haySesion() {
  return Boolean(token());
}

/* ---------------- textos de error ---------------- */

const TEXTOS = {
  // Ingreso con código
  correo_invalido: 'Revisa tu correo.',
  espera_un_minuto: 'Ya te enviamos un código; espera un minuto para pedir otro.',
  demasiados_intentos: 'Pediste muchos códigos. Intenta de nuevo en una hora.',
  correo_no_disponible: 'No pudimos enviar el correo ahora. Intenta de nuevo en un momento.',
  codigo_invalido: 'Ese código no coincide.',
  codigo_vencido: 'El código venció o se acabaron los intentos. Pide uno nuevo.',
  sin_sesion: 'Tu sesión se cerró. Ingresa de nuevo con tu correo.',
  // Ingreso rápido (Face ID / huella, app 1.2)
  llave_invalida: 'Tu ingreso rápido ya no sirve. Entra con el código del correo.',
  // Generales
  datos_invalidos: 'Revisa los datos e intenta de nuevo.',
  peticion_invalida: 'Revisa los datos e intenta de nuevo.',
  sin_red: 'Sin conexión. Revisa tus datos o el wifi e intenta de nuevo.',
  error_interno: 'Algo falló en TaxiCun. Intenta de nuevo en un momento.',
  // Perfil y conductor
  nombre_invalido: 'Escribe tu nombre completo.',
  celular_invalido: 'Celular de 10 dígitos que empiece por 3.',
  completa_tu_perfil: 'Completa tu nombre y tu celular primero.',
  empresa_desconocida: 'Esta cooperativa aún no está en TaxiCun.',
  empresa_no_disponible: 'Esta cooperativa todavía no presta servicio en TaxiCun.',
  movil_invalido: 'Revisa el número de móvil.',
  placa_invalida: 'Placa con formato ABC123.',
  placa_registrada: 'Esa placa ya está registrada en la cooperativa.',
  conductor_no_aprobado: 'Tu registro está en revisión.',
  // Tiempo real
  falta_hola: 'No pudimos conectarnos con la central. Intenta de nuevo.',
  ya_tienes_un_viaje: 'Ya tienes un viaje en curso.',
  ya_tienes_un_servicio: 'Ya tienes un servicio en curso.',
  servicio_no_disponible: 'Ese servicio ya no está disponible.',
  viaje_ajeno: 'No pudimos pedir el taxi. Intenta de nuevo.',
  solicitud_invalida: 'No pudimos pedir el taxi. Intenta de nuevo.',
  origen_invalido: 'Mueve el mapa a tu punto e intenta de nuevo.',
  // Servidor 0.2.2: topes de precio con las tarifas de la cooperativa.
  tarifa_invalida: 'No pudimos calcular la tarifa de ese viaje. Revisa el destino e intenta de nuevo.',
  valor_invalido: 'Ese valor no es válido para este viaje. Corrígelo e intenta de nuevo.',
  // Servidor 0.6.0 (fase 2 del panel): la recogida está muy lejos de la zona de servicio.
  fuera_de_zona: 'Ese punto está fuera de la zona de servicio de la cooperativa. Mueve el punto de recogida o llama a la central.',
  // Servidor 0.9.0 (ronda 4A): «Avisar a la central» (SOS).
  sos_no_disponible: 'La central de tu cooperativa no recibe avisos por la app. Si estás en peligro, llama al 123.',
  demasiados_sos: 'Ya le avisaste a la central hace un momento.',
};

const TEXTO_DESCONOCIDO = 'Algo falló. Intenta de nuevo.';

// e: ErrorServidor, { codigo } o el código como texto. Devuelve la frase para la persona.
export function textoError(e) {
  const codigo = typeof e === 'string' ? e : e?.codigo;
  return (codigo && TEXTOS[codigo]) || TEXTO_DESCONOCIDO;
}

export class ErrorServidor extends Error {
  // datos: lo que el servidor manda junto al código y la app puede usar (hoy solo retryS, los segundos para reintentar).
  constructor(codigo, estado = 0, datos = null) {
    super(textoError(codigo));
    this.name = 'ErrorServidor';
    this.codigo = codigo;
    this.estado = estado;
    const retryS = Number(datos?.retryS);
    if (Number.isFinite(retryS) && retryS >= 0 && retryS <= 86400) this.retryS = Math.ceil(retryS);
  }
}

/* ---------------- HTTP ---------------- */

// publica: rutas sin sesión (POST auth/llave). Ahí un 401 es «esa llave no sirve», no
// «tu sesión se cerró»: no se borra nada ni se avisa, y se lanza el código del servidor.
async function pedir(metodo, ruta, cuerpo, { avisarSesion = true, publica = false } = {}) {
  const cabeceras = { Accept: 'application/json' };
  const t = token();
  if (t) cabeceras.Authorization = `Bearer ${t}`;
  const opciones = { method: metodo, headers: cabeceras, cache: 'no-store', credentials: 'omit' };
  if (cuerpo !== undefined) {
    cabeceras['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  opciones.signal = control.signal;
  let r;
  try {
    r = await fetch(new URL(ruta, URL_API), opciones);
  } catch {
    throw new ErrorServidor('sin_red', 0);
  } finally {
    clearTimeout(reloj);
  }
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    /* respuesta vacía o que no es JSON (p. ej. la página de error de un proxy) */
  }
  if (r.status === 401 && publica) {
    const codigo = typeof datos?.error === 'string' && /^[a-z_]+$/.test(datos.error) ? datos.error : 'llave_invalida';
    throw new ErrorServidor(codigo, 401);
  }
  if (r.status === 401) {
    borrarToken();
    if (avisarSesion) sesion.emit('cerrada', { codigo: 'sin_sesion' });
    throw new ErrorServidor('sin_sesion', 401);
  }
  if (!r.ok) {
    // Solo códigos del servidor ({ error: 'codigo_en_minusculas' }); el 404 de Fastify trae otra forma.
    const codigo = typeof datos?.error === 'string' && /^[a-z_]+$/.test(datos.error) ? datos.error : 'error_interno';
    throw new ErrorServidor(codigo, r.status, datos);
  }
  return datos ?? {};
}

// ruta relativa a URL_API: 'yo', 'auth/codigo'…
// opciones: { avisarSesion: false } para no emitir 'cerrada' con un 401 (p. ej. al salir).
export function api(metodo, ruta, cuerpo, opciones) {
  return pedir(metodo, ruta, cuerpo, opciones);
}

export const pedirCodigo = (correo) => api('POST', 'auth/codigo', { correo: String(correo || '').trim() });

// Entra con el código del correo y guarda la sesión. Devuelve { usuario, conductor }.
export async function entrar(correo, codigo) {
  const r = await api('POST', 'auth/entrar', {
    correo: String(correo || '').trim(),
    codigo: String(codigo ?? '').replace(/\D/g, ''),
    dispositivo: ES_NATIVA ? 'app' : 'web',
  });
  if (!r.token) throw new ErrorServidor('error_interno', 200);
  guardarToken(r.token);
  return conMotivo({ usuario: r.usuario, conductor: r.conductor ?? null }, r);
}

// Servidor 0.6.0: el motivo de un conductor rechazado o retirado (conductor.motivo, o motivo_conductor) pasa
// tal cual; la app lo pinta como texto (S30).
function conMotivo(salida, r) {
  if (typeof r?.motivo_conductor === 'string') salida.motivo_conductor = r.motivo_conductor;
  return salida;
}

/* ---------------- Ingreso rápido (app 1.2: Face ID / huella) ----------------
 * Una «llave» es un secreto largo que el servidor da UNA vez (POST yo/llave) y que la app
 * guarda en el llavero del teléfono (nucleo/nativo.js). Con ella se entra sin el código del
 * correo (POST auth/llave), igual que con entrar(). El servidor guarda solo su huella. */
export const crearLlave = (nombre) => api('POST', 'yo/llave', nombre ? { nombre: String(nombre).slice(0, 60) } : {}); // → { id, secreto }
export const borrarLlave = (id) => api('DELETE', `yo/llave/${encodeURIComponent(id)}`, undefined, { avisarSesion: false });

// Entra con una llave guardada y guarda la sesión. Devuelve { usuario, conductor }.
// Errores: llave_invalida (revocada, borrada o de una cuenta eliminada) y los límites del código.
export async function entrarConLlave(id, secreto) {
  const r = await pedir('POST', 'auth/llave', {
    id: String(id || ''),
    secreto: String(secreto || ''),
    dispositivo: ES_NATIVA ? 'app' : 'web',
  }, { avisarSesion: false, publica: true });
  if (!r.token) throw new ErrorServidor('error_interno', 200);
  guardarToken(r.token);
  return conMotivo({ usuario: r.usuario, conductor: r.conductor ?? null }, r);
}

export const yo = () => api('GET', 'yo'); // { usuario, conductor }
export const actualizarYo = (datos) => api('PATCH', 'yo', datos); // { nombre?, celular? } → { usuario, conductor }
export const registrarConductor = (d) => api('PUT', 'conductor', d); // { empresa, movil, placa, vehiculo?, color?, ubicacion? } → { usuario, conductor }

// «Lejos de toda cooperativa» (servidor 0.11.0, docs/CONTRATO.md §13; nucleo/lejos.js):
//  cercania({ lat, lng, precisionM? }) → { lejos, km, umbralKm, exento, cooperativa }. Con un servidor anterior, 404: la
//    app sigue sin aviso.
//  interesado(cuerpo de lejos.cuerpoInteresado) → { ok: true } siempre que el formato cuadre (400 datos_invalidos si no).
//    Con un servidor anterior, 404 (rutaNoDisponible): la app ofrece escribir a info@taxicun.com.
export const cercania = (pos) => api('POST', 'cercania', pos);
export const interesado = (d) => api('POST', 'interesados', d);

/* ---------------- Ronda 4A: SOS y avisos de la cooperativa (servidor 0.9.0) ----------------
 * Contrato en la cabecera de nucleo/central.js. Con un servidor anterior estas rutas responden 404 (no_existe o
 * error_interno): quien llama lo toma como «no disponible» y no le dice nada a la persona. */

// «Avisar a la central»: { rol: 'pasajero'|'conductor', empresa?, viajeId?, pos?: { lat, lng, precision? }, clave }
// → { ok, id, veces, prueba? }. Errores: sos_no_disponible (403), demasiados_sos (429, con retryS). nucleo/sos.js
// reintenta con la misma clave si no hay señal.
export const sos = (d) => api('POST', 'sos', d);
// Los avisos de la cooperativa de los últimos 30 días → { avisos: [{ id, titulo, texto, de, en, leido }] }.
export const avisos = (rol) => api('GET', `avisos?rol=${rol === 'conductor' ? 'conductor' : 'pasajero'}`);
// Marca leídos (hasta 50 ids) → { ok }.
export const avisosLeidos = (ids) => api('POST', 'avisos/leidos', { ids: [...ids].slice(0, 50) });
// Pasajero: las cooperativas cuyos avisos apagó → { bajas: ['cootransrural'] }.
export const bajasAvisos = () => api('GET', 'yo/avisos');
// Pasajero: apaga (recibir: false) o vuelve a encender los avisos de una cooperativa → { ok }.
export const cambiarBajaAvisos = (empresa, recibir) => api('PUT', 'yo/avisos', { empresa: String(empresa || ''), recibir: Boolean(recibir) });

// ¿La ruta no existe en este servidor (anterior a la 0.9.0)? Fastify responde 404 con otra forma (error_interno).
export const rutaNoDisponible = (e) => e?.estado === 404 || e?.estado === 405 || e?.codigo === 'no_existe';

// Borra la cuenta en el servidor y, solo si lo logró, la sesión de este teléfono.
// Si falla (sin red, error), lanza y no borra nada: la persona puede intentar otra vez.
export async function eliminarCuenta() {
  await api('DELETE', 'yo');
  borrarToken();
}

// Cierra la sesión: avisa al servidor (sin importar si falla) y la borra del teléfono.
// No emite 'cerrada': la persona lo pidió. El tiempo real lo cierra quien llama (bus.cerrar()).
export async function salir() {
  try {
    if (token()) await pedir('POST', 'auth/salir', undefined, { avisarSesion: false });
  } catch {
    /* sin red o sesión ya vencida: igual se borra aquí */
  }
  borrarToken();
}
