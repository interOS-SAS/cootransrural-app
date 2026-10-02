// Propuesta comercial (plantillas/propuesta/): dibuja los códigos QR, ajusta las
// hojas al ancho de la pantalla y abre la impresión («Guardar como PDF»).
// Cuando todo está listo marca <html data-listo="si"> (lo espera herramientas/propuestas-pdf.mjs).
import qrcode from '../vendor/qrcode.js';

const COLOR = document.body.dataset.colorQr || '#111111';

// SVG del QR con un solo trazo: cada fila une los módulos oscuros seguidos y se
// solapa un poco con la de abajo, para que el PDF no muestre líneas finas entre filas.
export function qrSVG(texto, { margen = 2, color = COLOR, nivel = 'M' } = {}) {
  const qr = qrcode(0, nivel);
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const total = n + margen * 2;
  let d = '';
  for (let f = 0; f < n; f++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(f, c)) { c++; continue; }
      let fin = c;
      while (fin < n && qr.isDark(f, fin)) fin++;
      d += `M${c + margen} ${f + margen}h${fin - c}v1.04h${c - fin}z`;
      c = fin;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">`
    + `<rect width="${total}" height="${total}" fill="#fff"/><path d="${d}" fill="${color}"/></svg>`;
}

for (const caja of document.querySelectorAll('[data-qr]')) {
  caja.innerHTML = qrSVG(caja.dataset.qr);
}

// En pantallas angostas las hojas se encogen para caber a lo ancho (al imprimir, no).
const hojas = document.getElementById('hojas');
const ANCHO_HOJA = (215.9 / 25.4) * 96;
function ajustar() {
  const escala = Math.min(1, (document.documentElement.clientWidth - 16) / ANCHO_HOJA);
  hojas.style.zoom = escala < 1 ? escala.toFixed(3) : '';
}
ajustar();
addEventListener('resize', ajustar);
addEventListener('beforeprint', () => { hojas.style.zoom = ''; });
addEventListener('afterprint', ajustar);

document.getElementById('imprimir')?.addEventListener('click', () => window.print());

// Listo cuando cargan las fuentes y las imágenes.
// Con nombres largos (razón social, pueblo) una hoja puede no caber: se aprieta un poco
// (menos espacio entre bloques y luego letra algo menor), solo esa hoja.
const NIVELES = ['apretada-1', 'apretada-2', 'apretada-3'];
// Los bloques no se encogen (propuesta.css): si no caben, se desborda el contenido o el
// último bloque se mete en el pie. (En la hoja 3 el último bloque llega al pie a propósito.)
function noCabe(hoja) {
  const c = hoja.querySelector('.contenido');
  if (!c) return false;
  if (c.scrollHeight > c.clientHeight + 1) return true;
  const pie = hoja.querySelector('.pie');
  const ultimo = c.lastElementChild;
  return !hoja.classList.contains('hoja-demo') && Boolean(pie && ultimo && ultimo.getBoundingClientRect().bottom > pie.getBoundingClientRect().top - 1);
}
function apretar() {
  const zoom = hojas.style.zoom;
  hojas.style.zoom = '';
  for (const hoja of document.querySelectorAll('.hoja')) {
    hoja.classList.remove(...NIVELES);
    for (const nivel of NIVELES) {
      if (!noCabe(hoja)) break;
      hoja.classList.add(nivel);
    }
  }
  hojas.style.zoom = zoom;
}

const imagenes = [...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; })));
Promise.all([document.fonts?.ready, ...imagenes]).then(() => {
  apretar();
  document.documentElement.dataset.listo = 'si';
});
