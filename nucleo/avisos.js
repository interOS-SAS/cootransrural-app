// Avisos al usuario: notificación del sistema (si dio permiso), vibración y
// sonido. La interfaz de cada diseño muestra además su propio aviso en pantalla
// escuchando el evento 'aviso' de los controladores.
import { urlDelSitio, ID_EMPRESA } from './config.js';
import { MODO_REAL } from './plataforma.js';

let contextoAudio = null;

// Batería (modo real): un AudioContext «running» mantiene despierto el audio del teléfono
// aunque no suene nada. Se suspende al terminar cada melodía y sonar() lo reanuda (la app
// nativa no pide un toque para sonar; en el navegador ya hubo el primer toque).
const SUSPENDER_AUDIO = MODO_REAL;
const MARGEN_SUSPENDER_MS = 1500;
let relojSuspender = null;
let suspendiendo = null; // la promesa de suspend() mientras no termina
let finSonido = 0; // en el reloj del audio (currentTime): cuándo termina lo último programado
function suspenderLuego(segundos = 0) {
  if (!SUSPENDER_AUDIO || !contextoAudio) return;
  clearTimeout(relojSuspender);
  relojSuspender = setTimeout(() => {
    relojSuspender = null;
    // Aún sin arrancar (resume() lento o una interrupción): lo vuelve a programar el 'statechange'.
    if (contextoAudio?.state !== 'running') return;
    // El audio arrancó tarde (o un aviso corto cambió el plazo) y la melodía aún suena: se espera.
    const falta = finSonido - contextoAudio.currentTime;
    if (falta > 0.05) return suspenderLuego(falta);
    const p = contextoAudio.suspend().catch(() => {});
    suspendiendo = p;
    p.then(() => {
      if (suspendiendo === p) suspendiendo = null;
    });
  }, segundos * 1000 + MARGEN_SUSPENDER_MS);
}

export function permisoNotificaciones() {
  if (!('Notification' in window)) return 'no-soportado';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

export async function pedirPermisoNotificaciones() {
  if (!('Notification' in window)) return 'no-soportado';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

// Desbloquea el audio (los navegadores exigen un toque del usuario antes).
export function prepararSonido() {
  try {
    if (!contextoAudio) {
      contextoAudio = new (window.AudioContext || window.webkitAudioContext)();
      finSonido = 0;
      // Arrancó tarde o volvió solo (fin de una interrupción en el iPhone) sin reloj pendiente:
      // se programa la suspensión (si no, quedaría andando y gastando).
      if (SUSPENDER_AUDIO) {
        contextoAudio.addEventListener?.('statechange', () => {
          if (contextoAudio?.state === 'running' && !relojSuspender) suspenderLuego(Math.max(0, finSonido - contextoAudio.currentTime));
        });
      }
    }
    // En iPhone queda «interrupted» después de una llamada o de pasar a segundo plano.
    const parado = SUSPENDER_AUDIO ? contextoAudio.state !== 'running' && contextoAudio.state !== 'closed' : contextoAudio.state === 'suspended';
    // Un sonido justo cuando se estaba suspendiendo: se reanuda apenas termine la suspensión.
    if (SUSPENDER_AUDIO && suspendiendo) suspendiendo.then(() => contextoAudio?.resume()?.catch?.(() => {}));
    else if (parado) contextoAudio.resume()?.catch?.(() => {});
    // Desbloqueado con el toque: no hace falta dejarlo andando hasta que suene algo.
    if (!relojSuspender) suspenderLuego();
  } catch {
    contextoAudio = null;
  }
}

// Tonos cortos generados (no hay archivos de audio que descargar).
const MELODIAS = {
  info: [[880, 0.09]],
  exito: [[660, 0.1], [990, 0.16]],
  alerta: [[988, 0.12], [0, 0.06], [988, 0.12], [0, 0.06], [1318, 0.22]],
  solicitud: [[740, 0.14], [0, 0.05], [988, 0.14], [0, 0.05], [1175, 0.14], [0, 0.2], [740, 0.14], [0, 0.05], [988, 0.14], [0, 0.05], [1175, 0.2]],
  error: [[300, 0.18], [0, 0.05], [220, 0.25]],
};

export function sonar(tipo = 'info') {
  if (localStorage.getItem('ct.sonido') === 'no') return;
  try {
    prepararSonido();
    if (!contextoAudio) return;
    // Con un suspend() en curso (el contexto aún «running»), las notas se programan cuando
    // termina, con el reloj del audio ya quieto: suenan enteras al reanudarse (prepararSonido
    // pidió el resume() antes), sin un silencio en medio.
    if (SUSPENDER_AUDIO && suspendiendo) suspendiendo.then(() => programarMelodia(tipo));
    else programarMelodia(tipo);
  } catch {
    /* sin audio */
  }
}

function programarMelodia(tipo) {
  if (!contextoAudio) return;
  try {
    // Si estaba suspendido, las notas quedan programadas y suenan apenas se reanuda.
    let t = contextoAudio.currentTime + 0.02;
    const inicio = t;
    for (const [frecuencia, duracion] of MELODIAS[tipo] || MELODIAS.info) {
      if (frecuencia > 0) {
        const osc = contextoAudio.createOscillator();
        const vol = contextoAudio.createGain();
        osc.type = 'sine';
        osc.frequency.value = frecuencia;
        vol.gain.setValueAtTime(0.0001, t);
        vol.gain.exponentialRampToValueAtTime(0.25, t + 0.015);
        vol.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
        osc.connect(vol).connect(contextoAudio.destination);
        osc.start(t);
        osc.stop(t + duracion + 0.02);
      }
      t += duracion;
    }
    finSonido = Math.max(finSonido, t);
    suspenderLuego(t - inicio);
  } catch {
    /* sin audio */
  }
}

export function vibrar(patron = [120]) {
  // Chrome no deja vibrar antes del primer toque (y lo reporta como error).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* sin vibración */
  }
}

const PATRONES = { info: [60], exito: [80, 60, 80], alerta: [200, 100, 200, 100, 300], solicitud: [300, 120, 300, 120, 300], error: [400] };

// Aviso completo: sistema + sonido + vibración. Devuelve el aviso para la UI.
const ICONO_EMPRESA = ID_EMPRESA === 'cootransrural' ? 'img/icono-192.png' : `empresas/${ID_EMPRESA}/icono-192.png`;

export async function avisar({ titulo, cuerpo = '', tipo = 'info', etiqueta = `apptaxi-${ID_EMPRESA}`, icono = ICONO_EMPRESA }) {
  sonar(tipo);
  vibrar(PATRONES[tipo] || PATRONES.info);
  // La notificación del sistema solo cuando la app no está a la vista.
  if (permisoNotificaciones() === 'granted' && document.visibilityState !== 'visible') {
    try {
      const opciones = { body: cuerpo, tag: etiqueta, renotify: true, icon: urlDelSitio(icono), badge: urlDelSitio(ID_EMPRESA === 'cootransrural' ? 'img/insignia-96.png' : icono), vibrate: PATRONES[tipo] };
      const reg = await navigator.serviceWorker?.getRegistration?.(urlDelSitio(''));
      if (reg) await reg.showNotification(titulo, opciones);
      else new Notification(titulo, opciones);
    } catch {
      /* sin notificación del sistema */
    }
  }
  return { titulo, cuerpo, tipo, hora: Date.now() };
}
