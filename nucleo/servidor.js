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
};

const TEXTO_DESCONOCIDO = 'Algo falló. Intenta de nuevo.';

// e: ErrorServidor, { codigo } o el código como texto. Devuelve la frase para la persona.
export function textoError(e) {
  const codigo = typeof e === 'string' ? e : e?.codigo;
  return (codigo && TEXTOS[codigo]) || TEXTO_DESCONOCIDO;
}

export class ErrorServidor extends Error {
  constructor(codigo, estado = 0) {
    super(textoError(codigo));
    this.name = 'ErrorServidor';
    this.codigo = codigo;
    this.estado = estado;
  }
}

/* ---------------- HTTP ---------------- */

async function pedir(metodo, ruta, cuerpo, { avisarSesion = true } = {}) {
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
  if (r.status === 401) {
    borrarToken();
    if (avisarSesion) sesion.emit('cerrada', { codigo: 'sin_sesion' });
    throw new ErrorServidor('sin_sesion', 401);
  }
  if (!r.ok) {
    // Solo códigos del servidor ({ error: 'codigo_en_minusculas' }); el 404 de Fastify trae otra forma.
    const codigo = typeof datos?.error === 'string' && /^[a-z_]+$/.test(datos.error) ? datos.error : 'error_interno';
    throw new ErrorServidor(codigo, r.status);
  }
  return datos ?? {};
}

// ruta relativa a URL_API: 'yo', 'auth/codigo'…
export function api(metodo, ruta, cuerpo) {
  return pedir(metodo, ruta, cuerpo);
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
  return { usuario: r.usuario, conductor: r.conductor ?? null };
}

export const yo = () => api('GET', 'yo'); // { usuario, conductor }
export const actualizarYo = (datos) => api('PATCH', 'yo', datos); // { nombre?, celular? } → { usuario, conductor }
export const registrarConductor = (d) => api('PUT', 'conductor', d); // { empresa, movil, placa, vehiculo?, color? } → { usuario, conductor }

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
