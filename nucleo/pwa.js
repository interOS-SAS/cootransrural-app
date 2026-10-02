// Instalación como app (PWA): service worker y botón «Instalar».
// En la app de las tiendas (ES_NATIVA) no hay ni lo uno ni lo otro: ya es una app, y
// un service worker viejo guardaría copias de la web (y de /api/) dentro de ella.
import { urlDelSitio } from './config.js';
import { Emisor } from './util.js';
import { ES_NATIVA } from './plataforma.js';

export const instalacion = new Emisor();

// ¿Tiene sentido ofrecer «Instalar»? En la app nativa, no.
export const PUEDE_INSTALARSE = !ES_NATIVA;

// Quita los service workers y las copias que hayan quedado (los APK de prueba de
// Android alcanzaron a registrar sw.js).
let limpieza = null;
function quitarServiceWorkers() {
  if (!limpieza) {
    limpieza = (async () => {
      try {
        const registros = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all((registros || []).map((r) => r.unregister()));
      } catch {
        /* sin permiso o sin soporte */
      }
      try {
        if ('caches' in globalThis) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      } catch {
        /* sin Cache Storage */
      }
    })();
  }
  return limpieza;
}
if (ES_NATIVA) quitarServiceWorkers();
let eventoInstalar = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  eventoInstalar = e;
  instalacion.emit('disponible', true);
});

window.addEventListener('appinstalled', () => {
  eventoInstalar = null;
  instalacion.emit('instalada', true);
});

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (ES_NATIVA) return quitarServiceWorkers().then(() => null);
  // En localhost sin https también funciona; en http normal el navegador lo ignora.
  return navigator.serviceWorker.register(urlDelSitio('sw.js'), { scope: urlDelSitio('') }).catch((e) => {
    console.warn('[pwa]', e.message);
    return null;
  });
}

export function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function esAndroid() {
  return /android/i.test(navigator.userAgent);
}

export function yaInstalada() {
  // La app nativa ya está instalada: así ningún diseño ofrece «Instalar» dentro de ella.
  if (ES_NATIVA) return true;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function puedeInstalar() {
  return Boolean(eventoInstalar);
}

// Muestra el diálogo del navegador. Devuelve 'aceptada', 'rechazada' o
// 'manual' (iPhone o navegador sin diálogo: hay que dar instrucciones).
export async function instalar() {
  if (eventoInstalar) {
    eventoInstalar.prompt();
    const { outcome } = await eventoInstalar.userChoice;
    eventoInstalar = null;
    return outcome === 'accepted' ? 'aceptada' : 'rechazada';
  }
  return 'manual';
}

export function instruccionesInstalacion() {
  if (esIOS()) return ['Abre esta página en Safari.', 'Toca el botón Compartir (el cuadrado con la flecha hacia arriba).', 'Elige «Agregar a pantalla de inicio» y luego «Agregar».'];
  if (esAndroid()) return ['Abre esta página en Chrome.', 'Toca el menú ⋮ (arriba a la derecha).', 'Elige «Instalar app» o «Agregar a la pantalla principal».'];
  return ['Abre esta página en Chrome o Edge.', 'Haz clic en el ícono de instalar en la barra de direcciones.', 'Confirma con «Instalar».'];
}
