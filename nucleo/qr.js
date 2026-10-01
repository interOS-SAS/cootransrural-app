// Códigos QR: generación (SVG, canvas, PNG) y lectura con la cámara.
import qrcode from '../vendor/qrcode.mjs';
import { urlDelSitio } from './config.js';

function matriz(texto, nivel = 'M') {
  const qr = qrcode(0, nivel);
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return { n, oscuro: (f, c) => qr.isDark(f, c) };
}

// SVG del QR. `redondeado` dibuja módulos con puntas suaves (más moderno).
export function qrSVG(texto, { nivel = 'M', margen = 2, color = '#000000', fondo = '#ffffff', redondeado = false, tamano = null } = {}) {
  const { n, oscuro } = matriz(texto, nivel);
  const total = n + margen * 2;
  let cuerpo = '';
  const esOjo = (f, c) => (f < 7 && c < 7) || (f < 7 && c >= n - 7) || (f >= n - 7 && c < 7);
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (!oscuro(f, c)) continue;
      if (redondeado && esOjo(f, c)) continue;
      const x = c + margen;
      const y = f + margen;
      cuerpo += redondeado ? `<rect x="${x + 0.06}" y="${y + 0.06}" width=".88" height=".88" rx=".3"/>` : `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
    }
  }
  let ojos = '';
  if (redondeado) {
    for (const [f, c] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
      const x = c + margen;
      const y = f + margen;
      ojos += `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="${color}" stroke-width="1"/>`;
      ojos += `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".9" fill="${color}"/>`;
    }
  }
  const dim = tamano ? ` width="${tamano}" height="${tamano}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dim} shape-rendering="${redondeado ? 'geometricPrecision' : 'crispEdges'}" role="img" aria-label="Código QR"><rect width="${total}" height="${total}" fill="${fondo}"/><g fill="${color}">${cuerpo}</g>${ojos}</svg>`;
}

// Dibuja el QR en un canvas (para descargar PNG o componer stickers).
export function dibujarQR(ctx, texto, x, y, lado, { nivel = 'M', color = '#000', fondo = '#fff', margen = 2 } = {}) {
  const { n, oscuro } = matriz(texto, nivel);
  const total = n + margen * 2;
  const m = lado / total;
  ctx.save();
  if (fondo) {
    ctx.fillStyle = fondo;
    ctx.fillRect(x, y, lado, lado);
  }
  ctx.fillStyle = color;
  for (let f = 0; f < n; f++) {
    for (let c = 0; c < n; c++) {
      if (oscuro(f, c)) ctx.fillRect(Math.floor(x + (c + margen) * m), Math.floor(y + (f + margen) * m), Math.ceil(m), Math.ceil(m));
    }
  }
  ctx.restore();
}

export function qrDataURL(texto, lado = 512, opciones = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = lado;
  dibujarQR(c.getContext('2d'), texto, 0, 0, lado, opciones);
  return c.toDataURL('image/png');
}

// URL a la que lleva el sticker del taxi (instala/abre la app del pasajero).
export function urlDescarga({ movil = '', origen = 'sticker' } = {}) {
  const u = new URL(urlDelSitio('descargar/'));
  if (movil) u.searchParams.set('movil', String(movil).padStart(3, '0'));
  if (origen) u.searchParams.set('o', origen);
  return u.href;
}

// URL del cobro: si el pasajero la escanea con la cámara del celular, abre la
// página de pago de prueba; si la escanea desde la app, se paga ahí mismo.
export function urlPago({ viaje, valor, movil, sala, conductor }) {
  const u = new URL(urlDelSitio('pagar/'));
  u.searchParams.set('v', String(Math.round(valor)));
  u.searchParams.set('id', viaje);
  if (movil) u.searchParams.set('m', movil);
  if (conductor) u.searchParams.set('c', conductor);
  if (sala) u.searchParams.set('s', sala);
  return u.href;
}

// Interpreta un texto leído: ¿es un cobro de Cootransrural?
export function leerCobro(texto) {
  try {
    const u = new URL(texto);
    if (!u.pathname.replace(/\/+$/, '').endsWith('/pagar')) return null;
    const valor = Number(u.searchParams.get('v'));
    const viaje = u.searchParams.get('id');
    if (!valor || !viaje) return null;
    return { valor, viaje, movil: u.searchParams.get('m') || '', conductor: u.searchParams.get('c') || '', sala: u.searchParams.get('s') || '' };
  } catch {
    return null;
  }
}

let cargaJsQR = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!cargaJsQR) {
    cargaJsQR = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = urlDelSitio('vendor/jsQR.min.js');
      s.onload = () => resolver(window.jsQR);
      s.onerror = () => rechazar(new Error('no se pudo cargar el lector QR'));
      document.head.appendChild(s);
    });
  }
  return cargaJsQR;
}

// Abre la cámara trasera en el <video> dado y llama a alLeer(texto) con el
// primer QR que encuentre. Devuelve { detener }. Lanza error si no hay cámara.
export async function escanearQR(video, alLeer) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite usar la cámara (se necesita https).');
  const flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  video.srcObject = flujo;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  let activo = true;
  let detector = null;
  if ('BarcodeDetector' in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats();
      if (formatos.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      detector = null;
    }
  }
  const jsQR = detector ? null : await cargarJsQR();
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  const detener = () => {
    activo = false;
    flujo.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const ciclo = async () => {
    if (!activo) return;
    try {
      if (video.readyState >= 2) {
        let texto = null;
        if (detector) {
          const r = await detector.detect(video);
          texto = r[0]?.rawValue || null;
        } else {
          const w = video.videoWidth;
          const h = video.videoHeight;
          const escala = Math.min(1, 640 / Math.max(w, h));
          lienzo.width = Math.round(w * escala);
          lienzo.height = Math.round(h * escala);
          ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
          const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
          texto = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
        }
        if (texto && activo) {
          detener();
          alLeer(texto);
          return;
        }
      }
    } catch {
      /* cuadro inválido: seguir */
    }
    setTimeout(ciclo, 180);
  };
  ciclo();
  return { detener };
}
