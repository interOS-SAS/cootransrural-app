// Propuesta comercial (plantillas/propuesta/): dibuja los códigos QR, ajusta las
// hojas al ancho de la pantalla y abre la impresión («Guardar como PDF»).
// Cuando todo está listo marca <html data-listo="si"> (lo espera herramientas/propuestas-pdf.mjs).
import qrcode from '../vendor/qrcode.mjs';

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
const imagenes = [...document.images].map((img) => (img.complete ? null : new Promise((ok) => { img.onload = img.onerror = ok; })));
Promise.all([document.fonts?.ready, ...imagenes]).then(() => {
  document.documentElement.dataset.listo = 'si';
});
