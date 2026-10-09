// Pago con QR o llave del conductor (servidor 0.10.0, migración 010-cobro). La plata va DIRECTO del pasajero al
// conductor: TaxiCun no toca dinero, no cobra comisión y no es pasarela.
//
// Conductor (app real): «Cómo me pagan» guarda su entidad, su llave y, si quiere, el texto de su QR de cobro.
//   GET    /api/conductor/cobro                    → { cobro: { entidad, llaveTipo, llave, qrTexto?, titular? } | null, version, actualizado }
//   PUT    /api/conductor/cobro { entidad, llaveTipo, llave, qrTexto?, titular?, codigo } → lo mismo que el GET
//   DELETE /api/conductor/cobro { codigo }        → { cobro: null, version: 0, actualizado: null }
//   El código es uno fresco del correo de la cuenta: POST /api/auth/codigo { proposito: 'cobro' } (con la sesión).
//   `pago` y `pago_confirmado` llevan metodo 'transferencia' y `entidad` (id de la lista) para metodo_pago del viaje.
// Contrato del servidor: docs/CONTRATO.md §12 de taxicun-servidor.
// Pasajero: el SERVIDOR le manda `cobro` { viajeId, conductorId, valor, metodos: [{ entidad, llaveTipo, llave, qrTexto?,
//   titular?, prueba? }] } cuando el conductor de SU viaje pasa a «cobrando». Si no le llegó (recargó la app), lo pide
//   con `cobro` { viajeId } por el bus.
//
// La IMAGEN del QR nunca sale del teléfono: se lee aquí con jsQR y solo se sube el texto. El pasajero ve un QR
// REDIBUJADO desde ese texto (vendor/qrcode.js). Todo lo que viene del servidor se pinta como texto (textContent).
import { ES_NATIVA } from './plataforma.js';
import { api, ErrorServidor, rutaNoDisponible, textoError as textoErrorGeneral } from './servidor.js';
import { urlDelSitio } from './config.js';
import { dibujarQR } from './qr.js';

/* ---------------- entidades y llaves ---------------- */

export const ENTIDADES = [
  { id: 'nequi', nombre: 'Nequi', color: '#200020' },
  { id: 'daviplata', nombre: 'Daviplata', color: '#E30613' },
  { id: 'bancolombia', nombre: 'Bancolombia', color: '#FDDA24' },
  { id: 'breb', nombre: 'Bre-B', color: '#0B3D91' },
  { id: 'otro', nombre: 'Otro banco', color: '#5b6b8c' },
];
export const nombreEntidad = (id) => ENTIDADES.find((e) => e.id === id)?.nombre || 'Otro banco';

export const TIPOS_LLAVE = [
  { id: 'celular', nombre: 'Celular', ayuda: '10 dígitos, empieza por 3', teclado: 'tel', ejemplo: '3001234567' },
  { id: 'cedula', nombre: 'Cédula', ayuda: 'De 5 a 10 dígitos', teclado: 'numeric', ejemplo: '1020304050' },
  { id: 'correo', nombre: 'Correo', ayuda: 'El correo de tu cuenta del banco', teclado: 'email', ejemplo: 'nombre@correo.com' },
  { id: 'alfanumerica', nombre: 'Llave Bre-B (@)', ayuda: 'Empieza por @, de 3 a 20 letras, números, punto o guion bajo', teclado: 'text', ejemplo: '@mitaxi123' },
];
export const nombreTipoLlave = (id) => TIPOS_LLAVE.find((t) => t.id === id)?.nombre || 'Llave';

// Caracteres invisibles, de control y de dirección (S30): nunca en una llave ni en un titular.
const INVISIBLES = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0\ufff0-\ufff8]/u;
const ENLACE = /(https?:|www\.|javascript:|data:|\/\/)/i;

// Deja la llave como la guarda el servidor (sin espacios ni guiones en los números; correo y @ en minúscula).
export function normalizarLlave(tipo, llave) {
  const t = String(llave ?? '').normalize('NFC').trim();
  if (tipo === 'celular') {
    let d = t.replace(/[\s\-().]/g, '');
    if (/^\+?57\d{10}$/.test(d)) d = d.replace(/^\+?57/, '');
    return d;
  }
  if (tipo === 'cedula') return t.replace(/[\s.\-]/g, '');
  if (tipo === 'correo') return t.toLowerCase();
  if (tipo === 'alfanumerica') return (t.startsWith('@') ? t : `@${t}`).toLowerCase();
  return t;
}

// null si la llave sirve; si no, el código del error (el mismo que daría el servidor).
export function validarLlave(tipo, llave) {
  const t = String(llave ?? '');
  if (!t) return 'llave_vacia';
  if (t.length > 80 || INVISIBLES.test(t) || /[<>`"'\\]/.test(t)) return 'llave_no_valida';
  if (tipo === 'celular') return /^3\d{9}$/.test(t) ? null : 'llave_no_valida';
  if (tipo === 'cedula') return /^\d{5,10}$/.test(t) ? null : 'llave_no_valida';
  if (tipo === 'correo') return t.length <= 80 && /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) ? null : 'llave_no_valida';
  if (tipo === 'alfanumerica') return /^@[a-z0-9._]{3,20}$/.test(t) ? null : 'llave_no_valida';
  return 'llave_tipo_invalido';
}

// Titular (opcional): texto plano de hasta 40, sin < > `, enlaces ni invisibles.
export function normalizarTitular(t) {
  return String(t ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}
export function validarTitular(t) {
  if (!t) return null;
  if (t.length > 40 || INVISIBLES.test(t) || /[<>`]/.test(t) || ENLACE.test(t)) return 'titular_no_valido';
  return null;
}

/* ---------------- QR EMVCo y enlaces de las entidades ---------------- */

// CRC-16/CCITT-FALSE (polinomio 0x1021, inicio 0xFFFF), el del campo 63 de EMVCo.
export function crc16(texto) {
  let crc = 0xffff;
  const bytes = new TextEncoder().encode(texto);
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Lee los campos de primer nivel de un QR EMVCo («000201…»). null si la estructura no cuadra.
export function camposEMV(texto) {
  const campos = new Map();
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const largo = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !/^\d{2}$/.test(texto.slice(i + 2, i + 4))) return null;
    const valor = texto.slice(i + 4, i + 4 + largo);
    if (valor.length !== largo) return null;
    campos.set(id, valor);
    i += 4 + largo;
  }
  return campos;
}

// Dominios de las entidades para los QR que son un enlace (https, sin puerto ni IP). La lista manda el servidor;
// esta es la misma, para avisar antes de subir.
export const DOMINIOS_QR = ['nequi.com.co', 'daviplata.com', 'bancolombia.com'];

function enlaceDeEntidad(texto) {
  let u;
  try {
    u = new URL(texto);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
  return DOMINIOS_QR.some((d) => host === d || host.endsWith(`.${d}`));
}

// ¿Este texto leído de un QR se puede guardar? → { ok: true, tipo: 'emv'|'enlace', titular? } o { ok: false, error }.
export function validarQrTexto(texto) {
  const t = String(texto ?? '');
  if (!t) return { ok: false, error: 'qr_vacio' };
  if (t.length > 512) return { ok: false, error: 'qr_muy_largo' };
  if (/[\u0000-\u001f\u007f]/.test(t) || INVISIBLES.test(t)) return { ok: false, error: 'qr_no_valido' };
  if (t.startsWith('000201')) {
    const campos = camposEMV(t);
    if (!campos || !/6304[0-9A-Fa-f]{4}$/.test(t)) return { ok: false, error: 'qr_no_valido' };
    if (crc16(t.slice(0, -4)) !== t.slice(-4).toUpperCase()) return { ok: false, error: 'qr_crc' };
    const nombre = normalizarTitular(campos.get('59') || '');
    return { ok: true, tipo: 'emv', titular: nombre && !validarTitular(nombre) ? nombre : '' };
  }
  if (enlaceDeEntidad(t)) return { ok: true, tipo: 'enlace' };
  return { ok: false, error: 'qr_no_es_de_cobro' };
}

/* ---------------- leer el QR de una imagen ---------------- */

let cargaJsQR = null;
function cargarJsQR() {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR);
  if (!cargaJsQR) {
    cargaJsQR = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = urlDelSitio('vendor/jsQR.min.js');
      s.onload = () => resolver(globalThis.jsQR);
      s.onerror = () => {
        cargaJsQR = null;
        rechazar(new Error('lector'));
      };
      document.head.appendChild(s);
    });
  }
  return cargaJsQR;
}

async function imagenDeArchivo(archivo) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(archivo);
    } catch {
      /* formato que createImageBitmap no abre: se intenta con <img> */
    }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Lee el texto del QR de una imagen (File/Blob). Nada sale del teléfono. Lanza Error con un mensaje para la persona.
export async function leerQRDeImagen(archivo) {
  if (!archivo || !/^image\//.test(archivo.type || 'image/')) throw new Error('Elige una imagen (foto o captura de pantalla) del QR.');
  if (archivo.size > 15 * 1024 * 1024) throw new Error('La imagen es muy pesada. Usa una captura de pantalla del QR.');
  let jsQR;
  try {
    jsQR = await cargarJsQR();
  } catch {
    throw new Error('No pudimos abrir el lector de QR. Revisa tu conexión e intenta de nuevo.');
  }
  let img;
  try {
    img = await imagenDeArchivo(archivo);
  } catch {
    throw new Error('No pudimos abrir esa imagen. Prueba con una captura de pantalla del QR.');
  }
  const ancho = img.width || img.naturalWidth;
  const alto = img.height || img.naturalHeight;
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  // Varios tamaños: un QR chico en una foto grande se lee mejor completo; uno enorme, reducido.
  for (const lado of [1200, 800, 1800, 500]) {
    const escala = Math.min(1, lado / Math.max(ancho, alto));
    lienzo.width = Math.max(1, Math.round(ancho * escala));
    lienzo.height = Math.max(1, Math.round(alto * escala));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const r = jsQR(datos.data, datos.width, datos.height, { inversionAttempts: 'attemptBoth' });
    if (r?.data) {
      img.close?.();
      return r.data;
    }
    if (escala === 1 && lado > Math.max(ancho, alto)) break; // ya se probó a tamaño completo
  }
  img.close?.();
  throw new Error('No encontramos un QR en esa imagen. Usa la captura del QR de cobro de tu app del banco, completa y nítida.');
}

// Un QR redibujado desde el texto (canvas): no hay HTML de por medio.
export function lienzoQR(texto, lado = 240) {
  const c = document.createElement('canvas');
  const px = Math.round(lado * Math.min(3, globalThis.devicePixelRatio || 1));
  c.width = c.height = px;
  c.style.width = c.style.height = `${lado}px`;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', 'Código QR de cobro del conductor');
  dibujarQR(c.getContext('2d'), texto, 0, 0, px, { nivel: 'M', margen: 3, color: '#0B1F4D' });
  return c;
}

/* ---------------- ¿se puede ofrecer «Subir la imagen del QR»? ---------------- */

// La app de iPhone anterior a la 1.2.1 no declara los permisos de cámara y fotos: el <input type=file> ofrece
// «Tomar foto» y el sistema cierra la app. La 1.2.1 avisa su versión en el agente («TaxiCun-Nativo/1.2.1»).
export function versionNativa(ua = globalThis.navigator?.userAgent || '') {
  const m = /\bTaxiCun-Nativo\/(\d+)\.(\d+)(?:\.(\d+))?/.exec(ua);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] || 0)] : null;
}

function esAndroid(ua) {
  try {
    const p = globalThis.Capacitor?.getPlatform?.();
    if (p) return p === 'android';
  } catch {
    /* sin Capacitor */
  }
  return /\bAndroid\b/i.test(ua);
}

export function imagenQRPermitida({ nativa = ES_NATIVA, ua = globalThis.navigator?.userAgent || '' } = {}) {
  if (!nativa) return true; // navegador: el sistema pide el permiso
  if (esAndroid(ua)) return true; // Android: el selector de archivos no cierra la app
  const v = versionNativa(ua);
  if (!v) return false;
  const [a, b, c] = v;
  return a > 1 || (a === 1 && (b > 2 || (b === 2 && c >= 1)));
}

/* ---------------- copiar ---------------- */

export async function copiarTexto(texto) {
  const t = String(texto ?? '');
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch {
    /* sin permiso: el método de siempre */
  }
  const area = document.createElement('textarea');
  area.value = t;
  area.setAttribute('readonly', '');
  area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/* ---------------- lo que manda el servidor ---------------- */

// Un método de pago tal como llega (del GET del conductor o del `cobro` del pasajero), ya limpio: solo campos
// conocidos, la llave revalidada y el QR solo si es uno que se puede redibujar. null si no sirve.
export function limpiarMetodo(m) {
  if (!m || typeof m !== 'object') return null;
  const entidad = ENTIDADES.some((e) => e.id === m.entidad) ? m.entidad : 'otro';
  const llaveTipo = m.llaveTipo ?? m.llave_tipo;
  const llave = typeof m.llave === 'string' ? m.llave : '';
  if (!TIPOS_LLAVE.some((t) => t.id === llaveTipo) || validarLlave(llaveTipo, llave)) return null;
  const qr = m.qrTexto ?? m.qr_texto;
  const qrTexto = typeof qr === 'string' && validarQrTexto(qr).ok ? qr : '';
  const tit = typeof m.titular === 'string' ? normalizarTitular(m.titular) : '';
  return {
    entidad, llaveTipo, llave, qrTexto,
    titular: tit && !validarTitular(tit) ? tit : '',
    prueba: m.prueba === true,
    actualizado: m.actualizado ?? null,
  };
}

/* ---------------- API del conductor ---------------- */

const TEXTOS = {
  llave_vacia: 'Escribe tu llave.',
  llave_no_valida: 'Revisa la llave: no tiene el formato de ese tipo.',
  llave_invalida: 'Revisa la llave: no tiene el formato de ese tipo.',
  llave_tipo_invalido: 'Elige el tipo de llave.',
  entidad_invalida: 'Elige tu banco o billetera.',
  titular_no_valido: 'El nombre del titular: solo texto, hasta 40 caracteres.',
  titular_invalido: 'El nombre del titular: solo texto, hasta 40 caracteres.',
  qr_vacio: 'No encontramos un QR en esa imagen.',
  qr_muy_largo: 'Ese QR no parece de cobro: es muy largo.',
  qr_no_valido: 'Ese QR no es un QR de cobro válido.',
  qr_invalido: 'Ese QR no es un QR de cobro válido.',
  qr_crc: 'Ese QR está dañado (no cuadra su verificación). Descárgalo de nuevo de tu app del banco.',
  qr_no_es_de_cobro: 'Ese QR no es de cobro de un banco o billetera. Usa el QR para recibir pagos de tu app del banco.',
  codigo_requerido: 'Escribe el código que te enviamos al correo.',
  codigo_invalido: 'Ese código no coincide.',
  codigo_vencido: 'El código venció o se acabaron los intentos. Pide uno nuevo.',
  demasiados_cambios: 'Cambiaste tus datos de pago muchas veces. Intenta de nuevo más tarde.',
  conductor_no_aprobado: 'Tu registro está en revisión.',
  no_es_conductor: 'Esta opción es solo para conductores registrados.',
  espera_un_minuto: 'Ya te enviamos un código; espera un minuto para pedir otro.',
  demasiados_intentos: 'Pediste muchos códigos o te equivocaste varias veces. Intenta de nuevo en una hora.',
};

export function textoErrorCobro(e) {
  const codigo = typeof e === 'string' ? e : e?.codigo;
  if (codigo && TEXTOS[codigo]) return TEXTOS[codigo];
  if (e && typeof e === 'object' && rutaNoDisponible(e)) return 'Esta función todavía no está disponible. Intenta más tarde.';
  return textoErrorGeneral(e);
}

export async function miCobro() {
  const r = await api('GET', 'conductor/cobro');
  const crudo = r && 'cobro' in r ? r.cobro : r && r.llave ? r : null;
  return limpiarMetodo(crudo);
}

export const pedirCodigoCobro = (correo) => api('POST', 'auth/codigo', { correo: String(correo || '').trim(), proposito: 'cobro' });

export async function guardarCobro({ entidad, llaveTipo, llave, qrTexto = '', titular = '', codigo }) {
  const cuerpo = { entidad, llaveTipo, llave, codigo: String(codigo ?? '').replace(/\D/g, '') };
  if (qrTexto) cuerpo.qrTexto = qrTexto;
  if (titular) cuerpo.titular = titular;
  const r = await api('PUT', 'conductor/cobro', cuerpo);
  return limpiarMetodo(r?.cobro ?? r) || null;
}

export async function borrarCobro(codigo) {
  await api('DELETE', 'conductor/cobro', { codigo: String(codigo ?? '').replace(/\D/g, '') });
}

export { ErrorServidor };
