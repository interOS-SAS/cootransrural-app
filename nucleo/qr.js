// Códigos QR: generación (SVG, canvas, PNG) y lectura con la cámara.
import qrcode from '../vendor/qrcode.mjs';
import { urlDelSitio, EMPRESA } from './config.js';
import { pesos, escaparHTML } from './util.js';

function matriz(texto, nivel = 'M') {
  const qr = qrcode(0, nivel);
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  return { n, oscuro: (f, c) => qr.isDark(f, c) };
}

// SVG del QR. `redondeado` suaviza solo los tres «ojos» de las esquinas; los
// módulos de datos van llenos y pegados para que cualquier lector lo lea.
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
      cuerpo += `<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dim} shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${total}" height="${total}" fill="${fondo}"/><g fill="${color}">${cuerpo}</g>${ojos}</svg>`;
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
  u.searchParams.set('b', llaveBreB(movil));
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
    return { valor, viaje, movil: u.searchParams.get('m') || '', conductor: u.searchParams.get('c') || '', sala: u.searchParams.get('s') || '', llave: u.searchParams.get('b') || '' };
  } catch {
    return null;
  }
}

const MENSAJES_CAMARA = {
  NotAllowedError: 'No diste permiso para usar la cámara. Actívalo en los ajustes del navegador.',
  SecurityError: 'El navegador bloqueó la cámara en esta página.',
  NotFoundError: 'Este equipo no tiene cámara disponible.',
  OverconstrainedError: 'No se encontró una cámara trasera.',
  NotReadableError: 'Otra aplicación está usando la cámara.',
  AbortError: 'Se interrumpió el acceso a la cámara.',
};

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
  let flujo;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    throw new Error(MENSAJES_CAMARA[e?.name] || 'No se pudo abrir la cámara.');
  }
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

/* ------------------------------------------------------------------ */
/* QR Bre-B de PRUEBA                                                  */
/* ------------------------------------------------------------------ */
// Se ve como un cobro Bre-B (llave, valor, comercio), pero el código lleva la
// URL de la página de pago de prueba: si alguien lo escanea con la app de un
// banco no se cobra nada ni se le paga a nadie por error. Cuando haya un
// proveedor real (PayU, Bold, Mono, Cobre…) se cambia solo el contenido del QR.

// Llave Bre-B de ejemplo para cada móvil (no existe en ningún banco).
export function llaveBreB(movil = '') {
  const m = String(movil || '').replace(/\D/g, '');
  return `@cootransrural${m ? m.padStart(3, '0') : ''}`;
}

// Tarjeta completa del cobro Bre-B (HTML). `compacta` reduce textos para
// pantallas pequeñas.
export function tarjetaBreB({ url, valor, movil = '', llave = llaveBreB(movil), compacta = false } = {}) {
  asegurarEstilosBreB();
  const qr = url ? qrSVG(url, { nivel: 'M', margen: 3, color: '#0B1F4D' }) : '';
  const comercio = `${EMPRESA.nombre}${movil ? ` · Móvil ${escaparHTML(String(movil).padStart(3, '0'))}` : ''}`;
  return `<figure class="ct-breb${compacta ? ' ct-breb-compacta' : ''}" role="group" aria-label="Cobro Bre-B de prueba por ${pesos(valor)}">
  <div class="ct-breb-cabeza">
    <span class="ct-breb-marca"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h6.2a4.3 4.3 0 0 1 2.9 7.5A4.6 4.6 0 0 1 13.6 21H7z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M7 11.2h6.4" stroke="currentColor" stroke-width="2.4"/></svg>Bre-B</span>
    <span class="ct-breb-prueba">PRUEBA</span>
  </div>
  <div class="ct-breb-qr">${qr}</div>
  <div class="ct-breb-valor">${pesos(valor)}</div>
  <dl class="ct-breb-datos">
    <div><dt>Comercio</dt><dd>${comercio}</dd></div>
    <div><dt>Llave Bre-B</dt><dd>${escaparHTML(llave)} <small>(ejemplo)</small></dd></div>
  </dl>
  <figcaption class="ct-breb-pie">${compacta ? 'Modo prueba: no se mueve dinero' : 'Escanéalo con la app o con la cámara del celular. Modo prueba: no se mueve dinero.'}</figcaption>
</figure>`;
}

function asegurarEstilosBreB() {
  if (document.getElementById('ct-estilos-breb')) return;
  const s = document.createElement('style');
  s.id = 'ct-estilos-breb';
  s.textContent = `
.ct-breb{--breb:#0B3D91;--breb-2:#1565FF;margin:0 auto;width:100%;max-width:320px;min-width:0;box-sizing:border-box;background:#fff;color:#0B1F4D;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(11,31,77,.18),0 0 0 1px rgba(11,31,77,.08);font-family:inherit;text-align:center}
.ct-breb-cabeza{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 16px;background:linear-gradient(120deg,var(--breb),var(--breb-2));color:#fff}
.ct-breb-marca{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:20px;letter-spacing:-.01em}
.ct-breb .ct-breb-marca svg{width:22px;height:22px;filter:none}
.ct-breb-prueba{font-size:11px;font-weight:800;letter-spacing:.12em;background:#FFC107;color:#1a1a1a;border-radius:999px;padding:4px 9px}
.ct-breb-qr{padding:14px 18px 4px}
.ct-breb .ct-breb-qr svg{display:block;width:100%;height:auto;max-width:240px;margin:0 auto;border-radius:8px;filter:none}
.ct-breb-valor{font-size:30px;font-weight:800;letter-spacing:-.02em;margin:2px 0 6px;font-variant-numeric:tabular-nums}
.ct-breb-datos{margin:0 16px;padding:10px 0;border-top:1px dashed rgba(11,31,77,.18);display:grid;gap:6px;text-align:left;font-size:13px}
.ct-breb-datos div{display:flex;justify-content:space-between;gap:10px}
.ct-breb-datos dt{color:#5b6b8c;margin:0;white-space:nowrap}
.ct-breb-datos dd{margin:0;font-weight:700;text-align:right;overflow-wrap:anywhere;min-width:0}
.ct-breb-datos small{font-weight:500;color:#5b6b8c}
.ct-breb-pie{margin:0;padding:10px 16px 14px;font-size:12px;line-height:1.35;color:#5b6b8c;background:#F3F6FC}
.ct-breb-compacta .ct-breb-valor{font-size:24px}
.ct-breb-compacta .ct-breb-qr{padding:10px 14px 2px}
`;
  document.head.appendChild(s);
}
