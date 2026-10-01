// Avisos al usuario: notificación del sistema (si dio permiso), vibración y
// sonido. La interfaz de cada diseño muestra además su propio aviso en pantalla
// escuchando el evento 'aviso' de los controladores.
import { urlDelSitio, ID_EMPRESA } from './config.js';

let contextoAudio = null;

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
    contextoAudio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (contextoAudio.state === 'suspended') contextoAudio.resume();
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
    let t = contextoAudio.currentTime + 0.02;
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
