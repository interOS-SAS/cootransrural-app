// App nativa 1.2 (TaxiCun en las tiendas): notificaciones push y Face ID / huella.
//
// Todo va detrás de ES_NATIVA && Capacitor.isPluginAvailable('<Plugin>'): en la web, en las
// 77 demos y en la app 1.0 (build 221, sin estos plugins) nada de esto existe y todo sigue
// igual. Sin dependencias de config.js: solo plataforma.js, servidor.js y util.js.
//
// Notificaciones (@capacitor/push-notifications, plugin «PushNotifications»):
//   pushDisponible()               ¿hay plugin? (app 1.2; en Android, solo con Firebase)
//   permisoPush()                  'granted' | 'denied' | 'prompt' | 'no-disponible'
//   registrarPush(app, {pedir})    pide el permiso (si pedir y aún no se decidió) y, con permiso,
//                                  registra el teléfono; al llegar el token (evento 'registration')
//                                  lo manda: PUT yo/dispositivo { app, plataforma, token, entorno }.
//                                  Devuelve el permiso. app: 'pasajero' | 'conductor'.
//   reanudarPush(app)              lo mismo sin pedir permiso (al tener sesión, en cada arranque).
//   reintentarPush()               vuelve a mandar el token si el último envío no salió (al
//                                  reconectar el tiempo real y al volver la red).
//   pushListo()                    el servidor ya tiene el token con esta sesión (con eso el
//                                  diseño deja que el bus se cierre al pasar a segundo plano).
//   olvidarPush()                  DELETE yo/dispositivo { token }: antes de cerrar sesión o de
//                                  eliminar la cuenta (necesita la sesión; espera máximo 4 s).
//   alTocarAviso(fn)               fn({ tipo, viajeId, titulo, cuerpo, datos }) al tocar una
//                                  notificación. Si se tocó con la app cerrada (antes de que el
//                                  diseño escuchara), llega apenas se suscribe. Devuelve cómo quitarlo.
//   eventos 'recibida'             llegó una con la app abierta. No se muestra otra vez: lo que
//                                  importa ya llega por el tiempo real (el diseño solo reconecta).
//
// Face ID / huella (@capgo/capacitor-native-biometric, plugin «NativeBiometric»):
//   biometriaPosible()             ¿hay plugin?
//   biometria()                    { disponible, tipo, nombre, icono }; nombre: 'Face ID',
//                                  'Touch ID', 'tu huella', 'tu rostro' o 'huella o rostro'
//   llaveGuardada()                { id, correo } si hay credenciales en el llavero (sin el secreto;
//                                  id y correo pueden faltar si se reinstaló la app) o null
//   crearLlave({ correo })         verifyIdentity → POST yo/llave → setCredentials (server 'taxicun.com',
//                                  username = id, password = secreto)
//   entrarConLlave()               verifyIdentity → getCredentials → POST auth/llave → sesión guardada;
//                                  devuelve { usuario, conductor } como servidor.entrar().
//                                  llave_invalida: borra las credenciales y lanza el error.
//   borrarLlave()                  DELETE yo/llave/:id (si hay sesión) y las credenciales
//   olvidarLlave()                 solo las credenciales del teléfono
//   verificar({ razon, respaldo }) verifyIdentity; respaldo: deja usar el código del celular (iOS)
//   bloqueoActivo(), fijarBloqueo(v)  «Pedir Face ID al abrir la app» (localStorage)
//   vigilarBloqueo(alBloquear)     alBloquear() al abrir y al volver tras más de 60 s fuera
//                                  (solo con el ajuste puesto y con sesión)
//   olvidarTodo()                  al eliminar la cuenta: credenciales, bloqueo y estado del push
// Cerrar sesión conserva la llave (para volver con Face ID); eliminar la cuenta la borra.
// Los errores de la biometría se lanzan como ErrorBiometria (codigo: 'cancelada',
// 'no_reconocida', 'bloqueada', 'no_disponible' o 'fallo'); los del servidor, como ErrorServidor.
import { ES_NATIVA } from './plataforma.js';
import * as servidor from './servidor.js';
import { Emisor } from './util.js';

const SERVIDOR_LLAVE = 'taxicun.com';
const CLAVE_PUSH = 'taxicun.push'; // { token, app } del último registro (para olvidarlo al salir)
const CLAVE_LLAVE = 'taxicun.llave'; // { id, correo } de la llave guardada en el llavero (nunca el secreto)
const CLAVE_BLOQUEO = 'taxicun.bloqueo'; // '1': pedir Face ID al abrir la app
const BLOQUEO_TRAS_MS = 60 * 1000;
const ESPERA_SALIR_MS = 4000; // cerrar sesión no espera más que esto por el servidor
const VIDA_TOQUE_MS = 10 * 60 * 1000; // un toque que nadie atendió se olvida a los 10 min

export const eventos = new Emisor();

/* ---------------- utilidades ---------------- */

function leerJson(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave) || 'null');
  } catch {
    return null;
  }
}

function guardarJson(clave, valor) {
  try {
    if (valor == null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

function conTope(promesa, ms) {
  let reloj;
  return Promise.race([
    promesa,
    new Promise((_, no) => {
      reloj = setTimeout(() => no(new servidor.ErrorServidor('sin_red', 0)), ms);
    }),
  ]).finally(() => clearTimeout(reloj));
}

function plugin(nombre) {
  if (!ES_NATIVA) return null;
  try {
    const c = globalThis.Capacitor;
    return c?.isPluginAvailable?.(nombre) ? c?.Plugins?.[nombre] || null : null;
  } catch {
    return null;
  }
}

const push = () => plugin('PushNotifications');
const bio = () => plugin('NativeBiometric');

function plataforma() {
  try {
    return globalThis.Capacitor?.getPlatform?.() === 'android' ? 'android' : 'ios';
  } catch {
    return 'ios';
  }
}

// La app la dice la página (window.CT_ROL en taxicun/ y taxicun/conductor/).
const appActual = () => (globalThis.CT_ROL === 'conductor' ? 'conductor' : 'pasajero');
const normalizarApp = (a) => (a === 'conductor' || a === 'pasajero' ? a : appActual());

export const pushDisponible = () => Boolean(push());
export const biometriaPosible = () => Boolean(bio());

/* ---------------- notificaciones push ---------------- */

const estadoPush = {
  token: leerJson(CLAVE_PUSH)?.token || null,
  app: leerJson(CLAVE_PUSH)?.app || null,
  enviado: false, // el servidor ya tiene el token con la sesión actual
  enviando: null,
  noInsistir: false, // el servidor no tiene la ruta (0.2.x, 404) o rechaza el token (400): no se insiste
};

const normalizarPermiso = (r) => (r === 'granted' ? 'granted' : r === 'denied' ? 'denied' : 'prompt');

export async function permisoPush() {
  const P = push();
  if (!P) return 'no-disponible';
  try {
    return normalizarPermiso((await P.checkPermissions())?.receive);
  } catch {
    return 'no-disponible';
  }
}

async function enviarToken() {
  const token = estadoPush.token;
  if (!token || estadoPush.noInsistir || !servidor.haySesion()) return false;
  if (estadoPush.enviando) return estadoPush.enviando;
  const app = normalizarApp(estadoPush.app);
  estadoPush.enviando = (async () => {
    try {
      await servidor.api('PUT', 'yo/dispositivo', { app, plataforma: plataforma(), token, entorno: 'production' });
      estadoPush.enviado = token === estadoPush.token;
      eventos.emit('registrado', { app, token });
      return true;
    } catch (e) {
      estadoPush.enviado = false;
      if (e?.estado === 404 || e?.estado === 400) estadoPush.noInsistir = true;
      return false;
    } finally {
      estadoPush.enviando = null;
    }
  })();
  return estadoPush.enviando;
}

function alRegistrar(t) {
  const token = String(t?.value || '').trim();
  if (!token) return;
  if (token !== estadoPush.token) estadoPush.noInsistir = false;
  estadoPush.token = token;
  estadoPush.enviado = false;
  guardarJson(CLAVE_PUSH, { token, app: normalizarApp(estadoPush.app) });
  // Si justo se estaba mandando el anterior, este sale después.
  Promise.resolve(estadoPush.enviando).then(() => {
    if (!estadoPush.enviado) enviarToken();
  });
}

// Datos de la notificación: { tipo, viajeId } van sueltos en el payload (APNs: junto a «aps»;
// FCM: en «data»). Se aceptan también dentro de «datos» (objeto o JSON).
function datosDe(n) {
  const d = n?.data && typeof n.data === 'object' ? n.data : {};
  let anidado = {};
  if (d.datos && typeof d.datos === 'object') anidado = d.datos;
  else if (typeof d.datos === 'string') {
    try {
      anidado = JSON.parse(d.datos) || {};
    } catch {
      anidado = {};
    }
  }
  const { aps, ...resto } = d;
  return {
    tipo: String(d.tipo || anidado.tipo || ''),
    viajeId: String(d.viajeId || anidado.viajeId || '') || null,
    titulo: n?.title || aps?.alert?.title || '',
    cuerpo: n?.body || aps?.alert?.body || '',
    datos: { ...anidado, ...resto },
  };
}

const manejadoresToque = new Set();
let toquePendiente = null;

function alTocar(accion) {
  const aviso = { ...datosDe(accion?.notification), accion: accion?.actionId || 'tap', cuando: Date.now() };
  if (!manejadoresToque.size) {
    toquePendiente = aviso;
    return;
  }
  for (const fn of [...manejadoresToque]) {
    try {
      fn(aviso);
    } catch (e) {
      console.error('[aviso tocado]', e);
    }
  }
}

export function alTocarAviso(fn) {
  manejadoresToque.add(fn);
  if (toquePendiente) {
    const aviso = toquePendiente;
    toquePendiente = null;
    if (Date.now() - aviso.cuando < VIDA_TOQUE_MS) {
      setTimeout(() => {
        try {
          fn(aviso);
        } catch (e) {
          console.error('[aviso tocado]', e);
        }
      }, 0);
    }
  }
  return () => manejadoresToque.delete(fn);
}

let oyentesPush = null;
function escucharPush() {
  if (oyentesPush) return oyentesPush;
  const P = push();
  if (!P?.addListener) return Promise.resolve();
  const poner = (evento, fn) => {
    try {
      return Promise.resolve(P.addListener(evento, fn)).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  };
  oyentesPush = Promise.all([
    poner('registration', alRegistrar),
    poner('registrationError', (e) => eventos.emit('error_registro', { error: String(e?.error || '') })),
    poner('pushNotificationReceived', (n) => eventos.emit('recibida', datosDe(n))),
    // iOS y Android guardan el toque hasta que haya quien lo escuche (app abierta desde la notificación).
    poner('pushNotificationActionPerformed', alTocar),
  ]);
  return oyentesPush;
}

// Android: canal «servicios» de importancia alta para el conductor (suena y aparece arriba con
// el celular bloqueado). Si la app nativa ya lo creó, esto no cambia nada.
let canalPedido = false;
async function crearCanalServicios() {
  if (canalPedido) return;
  canalPedido = true;
  try {
    await push()?.createChannel?.({
      id: 'servicios',
      name: 'Servicios nuevos',
      description: 'Servicios nuevos cerca de ti, aunque tengas la app cerrada.',
      importance: 5,
      visibility: 1,
      vibration: true,
      lights: true,
    });
  } catch {
    /* versiones sin canales */
  }
}

export async function registrarPush(app = appActual(), { pedir = true } = {}) {
  const P = push();
  if (!P) return 'no-disponible';
  estadoPush.app = normalizarApp(app);
  let permiso;
  try {
    let s = await P.checkPermissions();
    if (pedir && normalizarPermiso(s?.receive) === 'prompt') s = await P.requestPermissions();
    permiso = normalizarPermiso(s?.receive);
  } catch {
    return 'no-disponible';
  }
  if (permiso !== 'granted') return permiso;
  await escucharPush();
  if (estadoPush.app === 'conductor' && plataforma() === 'android') await crearCanalServicios();
  try {
    await P.register();
  } catch {
    return 'error';
  }
  return 'granted';
}

export const reanudarPush = (app = appActual()) => registrarPush(app, { pedir: false });

// ¿El servidor ya tiene el token de este teléfono con la sesión actual? (los avisos llegarán
// con la app cerrada; el bus puede cerrar el WebSocket al pasar a segundo plano).
export const pushListo = () => pushDisponible() && estadoPush.enviado;

export function reintentarPush() {
  if (!pushDisponible() || estadoPush.enviado || !estadoPush.token) return Promise.resolve(false);
  return enviarToken();
}

export async function olvidarPush() {
  const token = estadoPush.token;
  estadoPush.enviado = false;
  if (!token || !pushDisponible() || !servidor.haySesion()) return false;
  try {
    await conTope(servidor.api('DELETE', 'yo/dispositivo', { token }, { avisarSesion: false }), ESPERA_SALIR_MS);
    return true;
  } catch {
    return false;
  }
}

// Conductor: al abrir la app se quitan los «Nuevo servicio» que quedaron en el centro de
// notificaciones (la oferta, si sigue, ya se ve en la app).
function limpiarEntregadas() {
  if (appActual() !== 'conductor') return;
  try {
    Promise.resolve(push()?.removeAllDeliveredNotifications?.()).catch(() => {});
  } catch {
    /* sin el método */
  }
}

if (pushDisponible()) {
  escucharPush();
  globalThis.addEventListener?.('online', () => reintentarPush());
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (!document.hidden) limpiarEntregadas();
  });
  limpiarEntregadas();
}

/* ---------------- Face ID / huella ---------------- */

const TEXTOS_BIO = {
  cancelada: 'Cancelaste la verificación.',
  no_reconocida: 'No pudimos reconocerte. Intenta otra vez o entra con el código del correo.',
  bloqueada: 'Se bloqueó por muchos intentos. Desbloquea el celular y vuelve a intentar, o entra con el código del correo.',
  no_disponible: 'Este celular no tiene Face ID ni huella configurados.',
  fallo: 'No pudimos verificarte. Intenta otra vez o entra con el código del correo.',
};

export class ErrorBiometria extends Error {
  constructor(codigo = 'fallo', detalle = '') {
    super(TEXTOS_BIO[codigo] || TEXTOS_BIO.fallo);
    this.name = 'ErrorBiometria';
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

// Códigos del plugin (BiometricAuthError) a los nuestros.
function codigoBio(e) {
  const n = Number(e?.code ?? e?.errorCode);
  if ([11, 15, 16, 17].includes(n)) return 'cancelada';
  if (n === 10) return 'no_reconocida';
  if (n === 2 || n === 4) return 'bloqueada';
  if (n === 1 || n === 3 || n === 14) return 'no_disponible';
  if (/not available/i.test(String(e?.message || ''))) return 'no_disponible';
  if (/cancel/i.test(String(e?.message || ''))) return 'cancelada';
  return 'fallo';
}

// BiometryType: 1 Touch ID, 2 Face ID, 3 huella, 4 rostro (Android), 5 iris, 6 varios, 7 código.
export async function biometria() {
  const nada = { disponible: false, tipo: 0, nombre: '', icono: 'rostro' };
  const B = bio();
  if (!B) return nada;
  try {
    const r = await B.isAvailable({ useFallback: false });
    const tipo = Number(r?.biometryType) || 0;
    const ios = plataforma() === 'ios';
    const [nombre, icono] = tipo === 2 ? ['Face ID', 'rostro']
      : tipo === 1 ? ['Touch ID', 'huella']
        : tipo === 3 ? ['tu huella', 'huella']
          : tipo === 4 ? ['tu rostro', 'rostro']
            : ios ? ['Face ID', 'rostro'] : ['huella o rostro', 'huella'];
    return { disponible: Boolean(r?.isAvailable), tipo, nombre, icono };
  } catch {
    return nada;
  }
}

export async function verificar({ razon = 'Confirma que eres tú', respaldo = false } = {}) {
  const B = bio();
  if (!B) throw new ErrorBiometria('no_disponible');
  try {
    await B.verifyIdentity({
      reason: razon,
      title: 'TaxiCun',
      subtitle: razon,
      negativeButtonText: 'Cancelar',
      useFallback: Boolean(respaldo),
      ...(respaldo ? { fallbackTitle: 'Usar el código del celular' } : {}),
      maxAttempts: 3,
    });
    return true;
  } catch (e) {
    throw new ErrorBiometria(codigoBio(e), String(e?.message || ''));
  }
}

async function leerCredenciales() {
  try {
    const c = await bio()?.getCredentials({ server: SERVIDOR_LLAVE });
    return c?.username && c?.password ? c : null;
  } catch {
    return null;
  }
}

export async function llaveGuardada() {
  const B = bio();
  if (!B) return null;
  let hay;
  try {
    hay = Boolean((await B.isCredentialsSaved({ server: SERVIDOR_LLAVE }))?.isSaved);
  } catch {
    hay = Boolean(await leerCredenciales());
  }
  if (!hay) {
    guardarJson(CLAVE_LLAVE, null);
    return null;
  }
  return leerJson(CLAVE_LLAVE) || {};
}

function nombreDispositivo() {
  const equipo = plataforma() === 'android' ? 'Android' : /iPad/.test(globalThis.navigator?.userAgent || '') ? 'iPad' : 'iPhone';
  return `${equipo} · ${appActual() === 'conductor' ? 'app del conductor' : 'app del pasajero'}`;
}

export async function crearLlave({ correo = '', razon = '' } = {}) {
  const B = bio();
  if (!B) throw new ErrorBiometria('no_disponible');
  // Primero se confirma que la persona puede usar Face ID (y iOS pide aquí su permiso).
  const { nombre } = await biometria();
  await verificar({ razon: razon || `Activa el ingreso con ${nombre || 'Face ID'} en TaxiCun` });
  const anterior = leerJson(CLAVE_LLAVE);
  const r = await servidor.crearLlave(nombreDispositivo());
  if (!r?.id || !r?.secreto) throw new servidor.ErrorServidor('error_interno', 200);
  try {
    await B.setCredentials({ username: String(r.id), password: String(r.secreto), server: SERVIDOR_LLAVE });
  } catch (e) {
    servidor.borrarLlave(r.id).catch(() => {});
    throw new ErrorBiometria('fallo', String(e?.message || ''));
  }
  const dueno = String(correo || '').trim().toLowerCase();
  guardarJson(CLAVE_LLAVE, { id: String(r.id), correo: dueno });
  // La llave que había antes ya no está en el teléfono: si era de esta cuenta, se revoca.
  if (anterior?.id && anterior.id !== String(r.id) && (!anterior.correo || anterior.correo === dueno)) {
    servidor.borrarLlave(anterior.id).catch(() => {});
  }
  return { id: String(r.id) };
}

export async function olvidarLlave() {
  guardarJson(CLAVE_LLAVE, null);
  try {
    await bio()?.deleteCredentials({ server: SERVIDOR_LLAVE });
  } catch {
    /* no había nada */
  }
}

export async function borrarLlave() {
  const id = leerJson(CLAVE_LLAVE)?.id || (await leerCredenciales())?.username;
  if (id && servidor.haySesion()) await conTope(servidor.borrarLlave(id), ESPERA_SALIR_MS).catch(() => {});
  await olvidarLlave();
}

export async function entrarConLlave({ razon = 'Entra a TaxiCun' } = {}) {
  if (!bio()) throw new ErrorBiometria('no_disponible');
  await verificar({ razon });
  const cred = await leerCredenciales();
  if (!cred) {
    await olvidarLlave();
    throw new servidor.ErrorServidor('llave_invalida', 0);
  }
  try {
    return await servidor.entrarConLlave(cred.username, cred.password);
  } catch (e) {
    if (e?.codigo === 'llave_invalida') await olvidarLlave();
    throw e;
  }
}

/* ---------------- bloqueo al abrir ---------------- */

export function bloqueoActivo() {
  try {
    return localStorage.getItem(CLAVE_BLOQUEO) === '1';
  } catch {
    return false;
  }
}

export function fijarBloqueo(si) {
  try {
    if (si) localStorage.setItem(CLAVE_BLOQUEO, '1');
    else localStorage.removeItem(CLAVE_BLOQUEO);
  } catch {
    /* sin almacenamiento */
  }
}

export function vigilarBloqueo(alBloquear, { haySesion = servidor.haySesion, tras = BLOQUEO_TRAS_MS } = {}) {
  if (!biometriaPosible()) return () => {};
  let ocultaDesde = 0;
  const revisar = () => {
    if (bloqueoActivo() && haySesion()) alBloquear();
  };
  const alOcultar = () => {
    if (!ocultaDesde) ocultaDesde = Date.now();
  };
  // visibilitychange y el «resume» del plugin App llegan los dos: el segundo ya no cuenta.
  const alVolver = () => {
    const fuera = ocultaDesde ? Date.now() - ocultaDesde : 0;
    ocultaDesde = 0;
    if (fuera > tras) revisar();
  };
  const alVisibilidad = () => (document.hidden ? alOcultar() : alVolver());
  document.addEventListener('visibilitychange', alVisibilidad);
  const manijas = [];
  try {
    const App = globalThis.Capacitor?.Plugins?.App;
    for (const [evento, fn] of [['pause', alOcultar], ['resume', alVolver]]) {
      Promise.resolve(App?.addListener?.(evento, fn)).then((h) => h && manijas.push(h)).catch(() => {});
    }
  } catch {
    /* sin el plugin App */
  }
  revisar();
  return () => {
    document.removeEventListener('visibilitychange', alVisibilidad);
    for (const h of manijas) h?.remove?.();
  };
}

export async function olvidarTodo() {
  fijarBloqueo(false);
  estadoPush.enviado = false;
  await olvidarLlave();
}
