// Hojas de impresión: reparte los stickers en hojas carta o A4, en tamaño
// exacto (mm), con marcas de corte y una barra de control de escala.
import { EMPRESA, ES_PROPUESTA } from '../nucleo/config.js';
import { escenaASVG } from './escena.js';
import { medidaTexto } from './formatos.js';

export const PAPELES = {
  carta: { id: 'carta', nombre: 'Carta', ancho: 215.9, alto: 279.4, medida: '21,59 × 27,94 cm' },
  a4: { id: 'a4', nombre: 'A4', ancho: 210, alto: 297, medida: '21 × 29,7 cm' },
};

const MARGEN_SEPARADOS = 8; // mm al borde de la hoja
const SEPARACION = 8; // mm entre stickers (ahí van el sangrado y las marcas)
const MARGEN_JUNTOS = 5;
const LARGO_MARCA = 4;
const GROSOR_MARCA = 0.2;
const ESPACIO_PIE = 14;

// Calcula la mejor distribución: «separados» (cada sticker con su sangrado y
// marcas en las esquinas) o «juntos» (pegados entre sí: un solo corte separa
// dos stickers; marcas solo en el borde). Se elige la que más stickers mete.
export function imponer(formato, papel, { sangrado = 2 } = {}) {
  const P = PAPELES[papel] || PAPELES.carta;
  const opcion = (sep, margen, modo) => {
    const cols = Math.max(1, Math.floor((P.ancho - 2 * margen + sep) / (formato.ancho + sep)));
    const filas = Math.max(1, Math.floor((P.alto - 2 * margen + sep) / (formato.alto + sep)));
    return { modo, sep, margen, cols, filas, porHoja: cols * filas };
  };
  const separados = opcion(SEPARACION, MARGEN_SEPARADOS, 'separados');
  const juntos = opcion(0, MARGEN_JUNTOS, 'juntos');
  const e = separados.porHoja >= juntos.porHoja ? separados : juntos;
  const anchoGrilla = e.cols * formato.ancho + (e.cols - 1) * e.sep;
  const altoGrilla = e.filas * formato.alto + (e.filas - 1) * e.sep;
  // Centrado, pero dejando abajo al menos 14 mm (si se puede) para el pie con la barra de 5 cm.
  const y0 = Math.max(e.margen, Math.min((P.alto - altoGrilla) / 2, P.alto - altoGrilla - ESPACIO_PIE));
  return {
    ...e,
    papel: P,
    sangrado: e.modo === 'separados' ? sangrado : 0,
    x0: (P.ancho - anchoGrilla) / 2,
    y0,
    anchoGrilla,
    altoGrilla,
  };
}

const n = (v) => (Math.round(v * 1000) / 1000).toString();

function linea(x1, y1, x2, y2) {
  return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}"/>`;
}

// Marcas de corte de una hoja con `cantidad` stickers.
function marcas(plan, formato, cantidad) {
  const { cols, x0, y0, sep, sangrado } = plan;
  const w = formato.ancho;
  const h = formato.alto;
  const lineas = [];
  if (plan.modo === 'separados') {
    const ini = sangrado + 1;
    for (let i = 0; i < cantidad; i++) {
      const x = x0 + (i % cols) * (w + sep);
      const y = y0 + Math.floor(i / cols) * (h + sep);
      for (const [cx, sx] of [[x, -1], [x + w, 1]]) {
        for (const [cy, sy] of [[y, -1], [y + h, 1]]) {
          lineas.push(linea(cx + sx * ini, cy, cx + sx * (ini + LARGO_MARCA), cy));
          lineas.push(linea(cx, cy + sy * ini, cx, cy + sy * (ini + LARGO_MARCA)));
        }
      }
    }
  } else {
    const P = plan.papel;
    const filasUsadas = Math.ceil(cantidad / cols);
    const colsUsadas = Math.min(cols, cantidad);
    const arriba = y0;
    const abajo = y0 + filasUsadas * h;
    const izq = x0;
    const der = x0 + colsUsadas * w;
    // Largo según el espacio real que queda hasta el borde (sin acercarse a menos de 2 mm).
    const largo = (espacio) => Math.max(1.5, Math.min(LARGO_MARCA, espacio - 3.2));
    const lArriba = largo(arriba);
    const lAbajo = Math.min(largo(P.alto - abajo), LARGO_MARCA);
    const lIzq = largo(izq);
    const lDer = largo(P.ancho - der);
    for (let c = 0; c <= colsUsadas; c++) {
      const x = x0 + c * w;
      lineas.push(linea(x, arriba - 1, x, arriba - 1 - lArriba));
      lineas.push(linea(x, abajo + 1, x, abajo + 1 + lAbajo));
    }
    for (let f = 0; f <= filasUsadas; f++) {
      const y = y0 + f * h;
      lineas.push(linea(izq - 1, y, izq - 1 - lIzq, y));
      lineas.push(linea(der + 1, y, der + 1 + lDer, y));
    }
  }
  return lineas.join('');
}

// Pie de la hoja: datos del trabajo y barra de 5 cm para comprobar la escala.
function pie(plan, formato, nHoja, totalHojas, estiloNombre) {
  const P = plan.papel;
  const espacio = P.alto - (plan.y0 + plan.altoGrilla);
  if (espacio < 12) return '';
  const y = P.alto - Math.min(7, espacio / 2 - 1);
  // En las propuestas, la hoja (fuera del corte) dice que es una demostración de
  // TaxiCun (la app; interOS solo la desarrolla): «<cooperativa> · TaxiCun · Propuesta de demostración».
  const propuesta = ES_PROPUESTA ? ' · Propuesta de demostración' : '';
  // El sticker es de TaxiCun (la app) con el nombre de la cooperativa.
  const texto = `${EMPRESA.nombre} · TaxiCun${propuesta} · ${formato.corto} · ${medidaTexto(formato)} · ${estiloNombre} · Hoja ${nHoja} de ${totalHojas} · Imprime al 100 % (tamaño real)`;
  const xb = P.ancho - 8 - 50;
  return (
    `<text x="8" y="${n(y)}" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="2.3" font-weight="500" fill="#555">${texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text>` +
    `<g class="barra-escala"><rect x="${n(xb)}" y="${n(y - 2.6)}" width="50" height="1.6" fill="#222"/>` +
    `<rect x="${n(xb + 10)}" y="${n(y - 2.6)}" width="10" height="1.6" fill="#fff"/><rect x="${n(xb + 30)}" y="${n(y - 2.6)}" width="10" height="1.6" fill="#fff"/>` +
    `<rect x="${n(xb)}" y="${n(y - 2.6)}" width="50" height="1.6" fill="none" stroke="#222" stroke-width="0.15"/>` +
    `<text x="${n(xb + 25)}" y="${n(y + 1.8)}" text-anchor="middle" font-family="'Plus Jakarta Sans', Arial, sans-serif" font-size="2" font-weight="500" fill="#555">Esta barra debe medir 5 cm</text></g>`
  );
}

// Construye el HTML de las hojas. `piezas` = [{ escena, movil }].
// `limite`: cuántas hojas construir (para la vista previa en pantalla).
export function construirHojas(piezas, formato, plan, { limite = Infinity, estiloNombre = '' } = {}) {
  const totalHojas = Math.max(1, Math.ceil(piezas.length / plan.porHoja));
  const hojas = [];
  const { papel: P, cols, x0, y0, sep, sangrado } = plan;
  const w = formato.ancho;
  const h = formato.alto;
  for (let k = 0; k < Math.min(totalHojas, limite); k++) {
    const grupo = piezas.slice(k * plan.porHoja, (k + 1) * plan.porHoja);
    const contenido = grupo
      .map(({ escena, movil }, i) => {
        const x = x0 + (i % cols) * (w + sep);
        const y = y0 + Math.floor(i / cols) * (h + sep);
        const svg = escenaASVG(escena, { sangrado, imagenesEmbebidas: true, unidades: false, clase: 'arte' });
        return `<div class="pieza" data-movil="${movil}" style="left:${n(x)}mm;top:${n(y)}mm;width:${n(w)}mm;height:${n(h)}mm;--sangrado:${n(sangrado)}mm">${svg}</div>`;
      })
      .join('');
    hojas.push(
      `<div class="hoja" data-hoja="${k + 1}" style="width:${n(P.ancho)}mm;height:${n(P.alto)}mm">` +
        `<svg class="marcas" viewBox="0 0 ${n(P.ancho)} ${n(P.alto)}" aria-hidden="true"><g stroke="#000" stroke-width="${GROSOR_MARCA}" fill="none">${marcas(plan, formato, grupo.length)}</g>${pie(plan, formato, k + 1, totalHojas, estiloNombre)}</svg>` +
        contenido +
        `</div>`,
    );
  }
  return { html: hojas.join(''), totalHojas };
}

// Regla @page para el papel elegido.
export function reglaPagina(papel) {
  const P = PAPELES[papel] || PAPELES.carta;
  return `@page { size: ${n(P.ancho)}mm ${n(P.alto)}mm; margin: 0; }`;
}
