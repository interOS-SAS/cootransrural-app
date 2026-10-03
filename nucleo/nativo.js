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
//
// Ubicación en turno (plugin local «UbicacionTurno», solo en la app del conductor; ver
// /tmp/cootrans/v12/DISENO-segundo-plano.md): con la app minimizada, el teléfono sigue enviando
// la ubicación del conductor en turno por HTTP nativo (POST conductor/ubicacion), no por el JS.
//   turnoNativoDisponible()        ¿hay plugin? (sin él: la web, las demos, la 1.0 y la 1.2 (261))
//   aceptoSegundoPlano()           el conductor aceptó el aviso «Tu ubicación mientras estás conectado»
//   avisoSegundoPlano()            'si' | 'no' («Ahora no») | null (aún no se le mostró)
//   fijarAceptoSegundoPlano(si)    lo guarda (localStorage taxicun.turno.aviso) y se aplica ya
//   iniciarTurnoNativo({ modo, libre })  arranca (o actualiza) el seguimiento: url = URL_API +
//                                  'conductor/ubicacion', token = el de la sesión. Solo con la app
//                                  al frente. Lanza el código del plugin (SIN_PERMISO, SEGUNDO_PLANO…).
//   cambiarModoTurno(modo, { libre })  'libre' | 'viaje' (precisión y frecuencia del plugin)
//   detenerTurnoNativo(motivo, { avisar })  lo detiene; avisar: el plugin manda el último POST con
//                                  fin = motivo (la central lo saca de turno). Borra la marca.
//   estadoTurnoNativo()            { activo, modo, desde, motivo, precisa } (lo que dice el plugin)
//   turnoNativoActivo()            lo último que se sabe (sin esperar al plugin)
//   alDetenerTurno(fn)             fn({ motivo, alCargar }) cuando el plugin se detuvo SIN que la web
//                                  lo pidiera: 'turno_apagado' (botón «Salir de turno» de la
//                                  notificación de Android), 'permiso', 'tope' (14 h), 'sin_sesion',
//                                  'conductor_no_aprobado', 'empresa_no_disponible', 'servidor'.
//                                  Si llega antes de que alguien escuche, se entrega al suscribirse.
//                                  También como evento 'turno_detenido' de «eventos».
//   vigilarTurno(ctl, { libre })   aplica las reglas (§2.1) con cada cambio del controlador: corre si
//                                  está en turno, aceptó el aviso y (tiene un viaje activo o libre():
//                                  el teléfono puede recibir avisos). Al cargar y al volver a la app,
//                                  la recuperación del §2.2 (paso 7). Una sola vez por controlador;
//                                  devuelve cómo quitarlo (y entonces lo detiene).
// La marca localStorage 'tc.turno.conductor' = { desde } dice que la web dejó el turno al plugin:
// la web la borra siempre que lo detiene, así que «plugin detenido + marca» = lo detuvo el plugin
// (o la notificación) o se cerró la app.
import { ES_NATIVA, URL_API, appOculta, alCambiarVisibilidad } from './plataforma.js';
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

export function plataforma() {
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
  resuelto: false, // en esta carga ya se supo si el token llega al servidor (o que no habrá)
};
const CARGA = Date.now();
// Al abrir la app, el token guardado tarda un momento en volver a llegar al servidor: hasta que se
// sepa (o pasen 30 s), el seguimiento nativo que ya iba en modo libre no se detiene por eso.
const PUSH_PENDIENTE_MS = 30000;

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
      estadoPush.resuelto = true;
      eventos.emit('registrado', { app, token });
      return true;
    } catch (e) {
      estadoPush.enviado = false;
      estadoPush.resuelto = true;
      if (e?.estado === 404 || e?.estado === 400) estadoPush.noInsistir = true;
      eventos.emit('registro_fallido', { codigo: e?.codigo || '' });
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
    poner('registrationError', (e) => {
      estadoPush.resuelto = true;
      eventos.emit('error_registro', { error: String(e?.error || '') });
    }),
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
    resolverSinPush();
    return 'no-disponible';
  }
  if (permiso !== 'granted') {
    resolverSinPush();
    return permiso;
  }
  await escucharPush();
  if (estadoPush.app === 'conductor' && plataforma() === 'android') await crearCanalServicios();
  try {
    await P.register();
  } catch {
    resolverSinPush();
    return 'error';
  }
  return 'granted';
}

// Sin permiso (o sin poder registrarse) en esta carga: los avisos no van a llegar.
function resolverSinPush() {
  if (estadoPush.resuelto) return;
  estadoPush.resuelto = true;
  eventos.emit('registro_fallido', { codigo: 'sin_permiso' });
}

export const reanudarPush = (app = appActual()) => registrarPush(app, { pedir: false });

// ¿El servidor ya tiene el token de este teléfono con la sesión actual? (los avisos llegarán
// con la app cerrada; el bus puede cerrar el WebSocket al pasar a segundo plano).
export const pushListo = () => pushDisponible() && estadoPush.enviado;

// Recién abierta la app: hay un token de antes que todavía no vuelve a llegar al servidor.
const pushPendiente = () => pushDisponible() && !estadoPush.enviado && !estadoPush.resuelto && Boolean(estadoPush.token)
  && !estadoPush.noInsistir && servidor.haySesion() && Date.now() - CARGA < PUSH_PENDIENTE_MS;

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
  // La cuenta nueva que entre en este teléfono vuelve a ver el aviso de la ubicación en turno.
  try {
    localStorage.removeItem(CLAVE_AVISO_TURNO);
  } catch {
    /* sin almacenamiento */
  }
  await olvidarLlave();
}

/* ---------------- ubicación en turno (segundo plano) ---------------- */

const CLAVE_AVISO_TURNO = 'taxicun.turno.aviso'; // '1' «Entendido»; '0' «Ahora no»
const CLAVE_MARCA_TURNO = 'tc.turno.conductor'; // { desde }: la web dejó el turno al plugin
// Con estas fases el pasajero sigue el taxi: el plugin va en modo 'viaje' (GPS fino, ~3 s).
const FASES_VIAJE_TURNO = ['hacia_origen', 'en_origen', 'en_viaje'];
// Con estos motivos el plugin no se vuelve a iniciar solo hasta que la central salude otra vez.
const MOTIVOS_FINALES = new Set(['sin_sesion', 'conductor_no_aprobado', 'empresa_no_disponible']);
// Lo que avise el plugin mientras la web lo está deteniendo es de esa misma parada.
const VENTANA_PROPIA_MS = 1500;

const turnoPlugin = () => plugin('UbicacionTurno');
export const turnoNativoDisponible = () => appActual() === 'conductor' && Boolean(turnoPlugin());

const turno = {
  activo: false, // el plugin sigue el turno (lo último que se sabe)
  modo: null,
  libre: null,
  token: null, // con qué sesión se inició
  precisa: true,
  motivo: '', // por qué se detuvo la última vez
  propias: 0, // paradas pedidas por la web en curso
  corrida: leerJson(CLAVE_MARCA_TURNO) ? 1 : 0, // cada seguimiento (para avisar una sola vez su parada)
  avisada: 0,
  bloqueo: null, // motivo final: no se reinicia solo hasta la próxima bienvenida
  cola: Promise.resolve(), // las llamadas al plugin, de a una
};

export function avisoSegundoPlano() {
  try {
    const v = localStorage.getItem(CLAVE_AVISO_TURNO);
    return v === '1' ? 'si' : v === '0' ? 'no' : null;
  } catch {
    return null;
  }
}

export const aceptoSegundoPlano = () => avisoSegundoPlano() === 'si';

export function fijarAceptoSegundoPlano(si) {
  try {
    localStorage.setItem(CLAVE_AVISO_TURNO, si ? '1' : '0');
  } catch {
    /* sin almacenamiento */
  }
  vigilante?.aplicar({ reintentar: true });
}

export const turnoNativoActivo = () => turnoNativoDisponible() && turno.activo;
// El plugin lleva el turno o, recién cargada la página (antes de preguntarle con estado()), su marca dice que lo
// llevaba. Mientras tanto, con la app oculta, la web no debe abrir el WebSocket con la central (ver
// bus.cerrarAlOcultar en disenos/a/conductor.js): oculta no manda presencia y la central lo despertaría sin ella.
export const turnoNativoEnCurso = () => turnoNativoDisponible() && (turno.activo || Boolean(leerJson(CLAVE_MARCA_TURNO)));

const marcaTurno = (desde = Date.now()) => guardarJson(CLAVE_MARCA_TURNO, { desde });

function codigoDe(e) {
  return String(e?.code || e?.codigo || e?.message || 'ERROR');
}

export async function estadoTurnoNativo() {
  const P = turnoPlugin();
  const local = { activo: turno.activo, modo: turno.modo, desde: leerJson(CLAVE_MARCA_TURNO)?.desde ?? null, motivo: turno.motivo, precisa: turno.precisa };
  if (!P?.estado) return { ...local, activo: false };
  try {
    const r = (await P.estado()) || {};
    return {
      activo: Boolean(r.activo),
      modo: r.modo === 'viaje' ? 'viaje' : r.activo ? 'libre' : null,
      desde: Number(r.desde) || null,
      motivo: String(r.motivo || ''),
      precisa: r.precisa !== false,
    };
  } catch {
    return local;
  }
}

export async function iniciarTurnoNativo({ modo = 'libre', libre = true } = {}) {
  const P = turnoPlugin();
  if (!P) throw Object.assign(new Error('Sin el plugin UbicacionTurno'), { code: 'NO_DISPONIBLE' });
  const token = servidor.token();
  if (!token) throw Object.assign(new Error('Sin sesión'), { code: 'SIN_SESION' });
  const m = modo === 'viaje' ? 'viaje' : 'libre';
  const nuevo = !turno.activo;
  const r = (await P.iniciar({ url: `${URL_API}conductor/ubicacion`, token, modo: m, libre: Boolean(libre) })) || {};
  turno.activo = true;
  turno.modo = m;
  turno.libre = Boolean(libre);
  turno.token = token;
  turno.motivo = '';
  turno.precisa = r.precisa !== false;
  if (nuevo) turno.corrida += 1;
  // Si la página se recarga sin que la app muera, la web retoma el turno con esto (§2.2, paso 7).
  if (nuevo || !leerJson(CLAVE_MARCA_TURNO)) marcaTurno(Number(r.desde) || Date.now());
  eventos.emit('turno', { activo: true, modo: m });
  return r;
}

export async function cambiarModoTurno(modo, { libre } = {}) {
  const P = turnoPlugin();
  if (!P || !turno.activo) return null;
  const m = modo === 'viaje' ? 'viaje' : 'libre';
  const datos = { modo: m };
  if (typeof libre === 'boolean') datos.libre = libre;
  const r = await P.cambiarModo(datos);
  turno.modo = m;
  if (typeof libre === 'boolean') turno.libre = libre;
  eventos.emit('turno', { activo: true, modo: m });
  return r;
}

// motivo: el fin que va en el último POST si avisar ('turno_apagado' al salir de turno). Sin
// avisar (ajustes, sin viaje ni avisos, sesión vencida) no sale nada: el turno sigue en la central.
export async function detenerTurnoNativo(motivo = 'turno_apagado', { avisar = true } = {}) {
  if (!turnoNativoDisponible()) return null; // la web, las demos y las apps sin el plugin
  guardarJson(CLAVE_MARCA_TURNO, null);
  const P = turnoPlugin();
  const estaba = turno.activo;
  turno.activo = false;
  turno.modo = null;
  turno.libre = null;
  turno.motivo = motivo;
  turno.avisada = turno.corrida; // esta parada la pidió la web: no se avisa como inesperada
  if (estaba) eventos.emit('turno', { activo: false, motivo });
  if (!P) return null;
  turno.propias += 1;
  try {
    return await P.detener({ motivo, avisar: Boolean(avisar) });
  } catch {
    return null;
  } finally {
    setTimeout(() => {
      turno.propias -= 1;
    }, VENTANA_PROPIA_MS);
  }
}

/* ----- paradas que no pidió la web ----- */

const manejadoresParada = new Set();
let paradaPendiente = null;

export function alDetenerTurno(fn) {
  manejadoresParada.add(fn);
  if (paradaPendiente) {
    const p = paradaPendiente;
    paradaPendiente = null;
    setTimeout(() => entregarA(fn, p), 0);
  }
  return () => manejadoresParada.delete(fn);
}

function entregarA(fn, p) {
  try {
    fn(p);
  } catch (e) {
    console.error('[turno detenido]', e);
  }
}

// Una vez por seguimiento (el evento del plugin y la revisión al volver pueden decir lo mismo).
function avisarParada(motivo, { alCargar = false } = {}) {
  if (turno.avisada === turno.corrida) return;
  turno.avisada = turno.corrida;
  const p = { motivo, alCargar };
  eventos.emit('turno_detenido', p);
  if (!manejadoresParada.size) {
    paradaPendiente = p;
    return;
  }
  for (const fn of [...manejadoresParada]) entregarA(fn, p);
}

function alPararseElPlugin(motivo) {
  const propia = turno.propias > 0;
  const tenia = turno.activo || Boolean(leerJson(CLAVE_MARCA_TURNO));
  turno.activo = false;
  turno.modo = null;
  turno.libre = null;
  turno.motivo = motivo;
  eventos.emit('turno', { activo: false, motivo });
  if (propia || !tenia) return;
  guardarJson(CLAVE_MARCA_TURNO, null);
  if (MOTIVOS_FINALES.has(motivo)) turno.bloqueo = motivo;
  avisarParada(motivo);
  vigilante?.aplicar();
}

let oyenteTurno = null;
function escucharTurno() {
  if (oyenteTurno) return oyenteTurno;
  const P = turnoPlugin();
  if (!P?.addListener) return Promise.resolve(null);
  try {
    // retainUntilConsumed: una parada con la app suspendida llega al poner el oyente.
    oyenteTurno = Promise.resolve(P.addListener('detenido', (d) => alPararseElPlugin(String(d?.motivo || '')))).catch(() => null);
  } catch {
    oyenteTurno = Promise.resolve(null);
  }
  return oyenteTurno;
}

/* ----- reglas (§2.1) y recuperación (§2.2) ----- */

let vigilante = null;

export function vigilarTurno(ctl, { libre = pushListo } = {}) {
  if (!turnoNativoDisponible() || !ctl?.real) return () => {};
  if (ctl.vigilanciaTurno) return ctl.vigilanciaTurno;
  vigilante?.quitar({ detener: false });
  let quitado = false;
  let retomarAlVolver = false;
  let impreciso = false; // ya se avisó «Ubicación exacta» con este controlador
  const fallo = { codigo: null, clave: null }; // el último iniciar que no se pudo (no se insiste)
  const dejar = [];

  const encolar = (fn) => {
    turno.cola = turno.cola.then(() => (quitado ? null : fn())).catch((e) => console.error('[turno]', e));
    return turno.cola;
  };

  function deseado() {
    const e = ctl.estado;
    if (ctl.destruido || !servidor.haySesion() || !aceptoSegundoPlano() || !e.conectado) return null;
    const enViaje = FASES_VIAJE_TURNO.includes(e.viaje?.fase);
    let puede = false;
    try {
      puede = Boolean(libre());
    } catch {
      puede = false;
    }
    // Recargó con el seguimiento libre andando: mientras el token de los avisos vuelve a llegar
    // al servidor, se deja como iba (si no, se detendría y, con la app oculta, no volvería).
    if (!puede && turno.activo && turno.libre !== false && pushPendiente()) puede = true;
    // Sin avisos (Android sin Firebase, notificaciones negadas): solo durante los viajes. Así nunca
    // se ve en el mapa un taxi libre que no se entera de los servicios.
    if (!enViaje && !puede) return null;
    return { modo: enViaje ? 'viaje' : 'libre', libre: puede };
  }

  function motivoParada() {
    if (!servidor.haySesion()) return ['sesion', false];
    if (!ctl.estado.conectado || ctl.destruido) return ['turno_apagado', true];
    if (!aceptoSegundoPlano()) return ['ajustes', false];
    return ['sin_viaje', false]; // sigue en turno con la app abierta, como en la 1.2
  }

  async function paso() {
    // Recargó con la app oculta y el seguimiento vivo: hasta retomar el turno al volver, nada.
    if (retomarAlVolver) return;
    const d = deseado();
    if (!d) {
      if (turno.activo) {
        const [motivo, avisar] = motivoParada();
        await detenerTurnoNativo(motivo, { avisar });
      }
      return;
    }
    if (turno.bloqueo) return;
    const clave = `${d.modo}|${d.libre}`;
    // Lo que ya falló con estos datos no se repite hasta volver a la app o cambiar algo.
    const yaFallo = Boolean(fallo.codigo) && fallo.clave === clave;
    if (turno.activo) {
      // Otra sesión (o retomado al cargar): el plugin necesita el token de ahora. iniciar con el
      // seguimiento en marcha solo actualiza los datos, pero también pide la app al frente.
      if (servidor.token() !== turno.token && !appOculta() && !yaFallo) return iniciarYa(d, clave);
      if (d.modo !== turno.modo || d.libre !== turno.libre) await cambiarModoTurno(d.modo, { libre: d.libre }).catch(() => {});
      return;
    }
    // iOS y Android solo dejan arrancarlo con la app al frente: si no, al volver.
    if (appOculta() || yaFallo) return;
    await iniciarYa(d, clave);
  }

  async function iniciarYa(d, clave) {
    try {
      const r = await iniciarTurnoNativo(d);
      fallo.codigo = null;
      if (r?.precisa === false && !impreciso) {
        impreciso = true;
        eventos.emit('turno_impreciso', {});
      }
      // La presencia sale ya con segundoPlano: true (la central no lo saca del mapa al minimizar).
      ctl.anunciarPresencia?.();
    } catch (e) {
      fallo.codigo = codigoDe(e);
      fallo.clave = clave;
      eventos.emit('turno', { activo: false, error: fallo.codigo });
    }
  }

  // Recarga de la página sin que la app muera (§2.2, paso 7) y vuelta a la app.
  async function revisar({ alCargar = false } = {}) {
    const est = await estadoTurnoNativo();
    const marca = leerJson(CLAVE_MARCA_TURNO);
    if (est.activo) {
      turno.activo = true;
      turno.modo = est.modo;
      turno.precisa = est.precisa;
      if (!alCargar) return;
      // Al cargar no se sabe con qué datos va: se le pasan otra vez (token de esta sesión).
      turno.token = null;
      turno.libre = null;
      if (!marca || !servidor.haySesion()) {
        await detenerTurnoNativo('turno_apagado', { avisar: servidor.haySesion() });
        return;
      }
      if (!ctl.estado.conectado) {
        // Retomar lee el GPS: con la app oculta (el JS de iOS no lo recibe), al volver.
        if (appOculta()) retomarAlVolver = true;
        else await retomar();
      }
      return;
    }
    // El plugin no sigue el turno.
    const tenia = turno.activo || Boolean(marca);
    turno.activo = false;
    turno.modo = null;
    turno.libre = null;
    if (est.motivo) turno.motivo = est.motivo;
    if (!marca) return;
    guardarJson(CLAVE_MARCA_TURNO, null);
    // Con la marca puesta la web no lo detuvo: se cerró la app (al cargar arranca fuera de turno,
    // como siempre) o lo detuvo el plugin o la notificación (se avisa, una sola vez).
    if (tenia && est.motivo && est.motivo !== 'app_cerrada') {
      if (MOTIVOS_FINALES.has(est.motivo)) turno.bloqueo = est.motivo;
      avisarParada(est.motivo, { alCargar });
    }
  }

  async function retomar() {
    retomarAlVolver = false;
    if (ctl.destruido || ctl.estado.conectado || !servidor.haySesion()) return;
    const ok = await ctl.conectar();
    if (ok) eventos.emit('turno_retomado', {});
  }

  const aplicar = ({ reintentar = false } = {}) => {
    if (quitado) return;
    if (reintentar) fallo.codigo = null;
    encolar(paso);
  };

  // El núcleo pregunta esto: con el plugin activo la presencia lleva segundoPlano: true y, con
  // la app oculta, el JS no manda presencia ni ubicación (las manda el plugin por HTTP).
  ctl.nativo = {
    activo: () => turnoNativoActivo(),
    enviando: () => turnoNativoActivo() && appOculta(),
  };

  dejar.push(ctl.on('cambio', () => aplicar()));
  dejar.push(ctl.on('bienvenida', () => {
    // La central lo dejó entrar: la sesión y la aprobación están bien.
    turno.bloqueo = null;
    aplicar();
  }));
  dejar.push(eventos.on('registrado', () => aplicar()));
  dejar.push(eventos.on('registro_fallido', () => aplicar()));
  dejar.push(eventos.on('error_registro', () => aplicar()));
  dejar.push(alCambiarVisibilidad((oculta) => {
    if (oculta || quitado) return;
    fallo.codigo = null;
    encolar(async () => {
      await revisar();
      if (retomarAlVolver) await retomar();
      await paso();
    });
  }));

  function quitar({ detener = true } = {}) {
    if (quitado) return;
    quitado = true;
    for (const f of dejar) f?.();
    if (ctl.nativo) ctl.nativo = null;
    ctl.vigilanciaTurno = null;
    if (vigilante?.ctl === ctl) vigilante = null;
    // Sin controlador no hay turno (cerró sesión, se eliminó la cuenta, la central lo rechazó).
    if (detener && (turno.activo || leerJson(CLAVE_MARCA_TURNO))) {
      const avisar = servidor.haySesion();
      turno.cola = turno.cola.then(() => detenerTurnoNativo('turno_apagado', { avisar })).catch(() => {});
    }
  }

  vigilante = { ctl, aplicar, quitar };
  ctl.vigilanciaTurno = () => quitar();
  encolar(async () => {
    await escucharTurno();
    await revisar({ alCargar: true });
    await paso();
  });
  return ctl.vigilanciaTurno;
}

if (turnoNativoDisponible()) {
  escucharTurno();
  // Sin sesión no hay turno: un seguimiento que quedó de antes (la página se recargó, se borraron
  // los datos) se suelta. Si no había ninguno, el plugin no hace nada.
  if (!servidor.haySesion()) detenerTurnoNativo('sesion', { avisar: false });
}
