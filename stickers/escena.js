// Motor de dibujo de los stickers.
// Cada sticker se describe como una «escena»: una lista de figuras con medidas
// en milímetros. La misma escena se pinta en SVG (vista previa, hoja de
// impresión y descarga vectorial) y en canvas (descarga PNG a 300 ppp), así lo
// que se ve en pantalla es exactamente lo que sale impreso.
import * as N from '../nucleo/index.js';
import { icono as iconoApp } from './icono.js';

export const PPP = 300;
export const MM_POR_PULGADA = 25.4;
export const PX_POR_MM = PPP / MM_POR_PULGADA;

// ---------------------------------------------------------------------------
// Fuentes locales (fuentes/fuentes.css). Solo existen estos pesos.
// ---------------------------------------------------------------------------
export const FUENTES = {
  Sora: { archivo: 'sora', pesos: [400, 600, 700, 800] },
  'Plus Jakarta Sans': { archivo: 'plus-jakarta-sans', pesos: [400, 500, 700, 800] },
  Outfit: { archivo: 'outfit', pesos: [300, 400, 600, 700, 800] },
  Nunito: { archivo: 'nunito', pesos: [400, 600, 700, 800, 900] },
};

const RESPALDO = "'Helvetica Neue', Arial, sans-serif";

function pesoDisponible(familia, peso) {
  const lista = FUENTES[familia]?.pesos || [peso];
  return lista.reduce((mejor, p) => (Math.abs(p - peso) < Math.abs(mejor - peso) ? p : mejor), lista[0]);
}

export function urlFuente(familia, peso) {
  const f = FUENTES[familia];
  return new URL(`../fuentes/${f.archivo}-latin-${pesoDisponible(familia, peso)}-normal.woff2`, import.meta.url).href;
}

// Carga todas las fuentes y pesos antes de medir o dibujar texto.
export async function prepararFuentes() {
  const promesas = [];
  for (const [familia, { pesos }] of Object.entries(FUENTES)) {
    for (const peso of pesos) promesas.push(document.fonts.load(`${peso} 32px "${familia}"`, 'ÁÉÍÓÚáéíóúÑñ¡!¿?0123456789'));
  }
  await Promise.allSettled(promesas);
  await document.fonts.ready;
  anchos.clear();
}

// ---------------------------------------------------------------------------
// Medición de texto (en mm). Se mide con canvas y se usa igual en SVG y PNG.
// ---------------------------------------------------------------------------
const medidor = document.createElement('canvas').getContext('2d');
const anchos = new Map();

function fuenteCanvas(familia, peso, tamPx) {
  return `${pesoDisponible(familia, peso)} ${tamPx}px "${familia}", ${RESPALDO}`;
}

export function anchoTexto(texto, { familia, peso = 400, tam = 1, espaciado = 0 }) {
  const clave = `${familia}|${peso}|${texto}`;
  let base = anchos.get(clave);
  if (base === undefined) {
    medidor.font = fuenteCanvas(familia, peso, 100);
    base = medidor.measureText(texto).width / 100;
    anchos.set(clave, base);
  }
  return base * tam + espaciado * Math.max(0, [...texto].length - 1);
}

// Alto de las mayúsculas (fracción del tamaño), para centrar texto en franjas.
const altosMayus = new Map();
export function altoMayus(familia, peso = 400) {
  const clave = `${familia}|${peso}`;
  if (!altosMayus.has(clave)) {
    medidor.font = fuenteCanvas(familia, peso, 100);
    const m = medidor.measureText('H');
    altosMayus.set(clave, (m.actualBoundingBoxAscent || 72) / 100);
  }
  return altosMayus.get(clave);
}

// Tamaño de letra (mm) para que `texto` quepa en `anchoMax`, sin pasar de `tamMax`.
export function tamParaAncho(texto, estilo, anchoMax, tamMax = Infinity) {
  const em = estilo.espaciadoEm || 0;
  const porMm = anchoTexto(texto, { ...estilo, tam: 1, espaciado: 0 }) + em * Math.max(0, [...texto].length - 1);
  return Math.min(tamMax, anchoMax / porMm);
}

// ---------------------------------------------------------------------------
// QR: la matriz se toma del SVG que genera el núcleo (N.qrSVG) para dibujarla
// como un solo trazado (más liviano y sin rayitas entre módulos al imprimir).
// ---------------------------------------------------------------------------
const matrices = new Map();
export function matrizQR(texto, nivel = 'Q') {
  const clave = `${nivel}|${texto}`;
  if (matrices.has(clave)) return matrices.get(clave);
  const svg = N.qrSVG(texto, { nivel, margen: 0 });
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]);
  const filas = Array.from({ length: n }, () => new Uint8Array(n));
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1\.02"/g)) filas[Number(m[2])][Number(m[1])] = 1;
  const r = { n, filas, nivel };
  matrices.set(clave, r);
  return r;
}

// Elige el nivel de corrección: 'Q' si los módulos quedan de al menos `moduloMin`
// mm con el lado disponible; si no, 'M'. Devuelve también el lado final.
export function planQR(texto, ladoDisponible, { moduloMin = 0.5, margen = 4, preferido = 'Q' } = {}) {
  for (const nivel of [...new Set([preferido, 'M'])]) {
    const { n } = matrizQR(texto, nivel);
    const modulo = ladoDisponible / (n + margen * 2);
    if (modulo >= moduloMin || nivel === 'M') return { nivel, n, modulo, lado: ladoDisponible, margen };
  }
  return null;
}

function trazadoQR(filas) {
  let d = '';
  filas.forEach((fila, f) => {
    let c = 0;
    while (c < fila.length) {
      if (!fila[c]) {
        c++;
        continue;
      }
      let fin = c;
      while (fin < fila.length && fila[fin]) fin++;
      d += `M${c} ${f}h${fin - c}v1h${c - fin}z`;
      c = fin;
    }
  });
  return d;
}

// ---------------------------------------------------------------------------
// Imágenes: el ícono de TaxiCun (la app que abre el QR: img/taxicun/icono.svg)
// y el de la cooperativa (img/icono.svg con sus colores, para la barra de la
// página). Se guardan como URL (para canvas y vista previa) y como data URI
// (para que el SVG descargado sea autónomo).
// ---------------------------------------------------------------------------
export const IMAGENES = {};
const URL_TAXICUN = new URL('../img/taxicun/icono.svg', import.meta.url).href;

async function cargarImagen(url, dataURI) {
  const img = new Image();
  img.decoding = 'sync';
  img.src = url;
  await img.decode();
  return { url, dataURI, img };
}

async function iconoTaxiCun() {
  const r = await fetch(URL_TAXICUN);
  if (!r.ok) throw new Error('No se pudo cargar el ícono de TaxiCun');
  const texto = await r.text();
  return { url: URL_TAXICUN, dataURI: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(texto))) };
}

export async function prepararImagenes() {
  const [coop, tc] = await Promise.all([iconoApp(), iconoTaxiCun()]);
  [IMAGENES.icono, IMAGENES.taxicun] = await Promise.all([cargarImagen(coop.url, coop.dataURI), cargarImagen(tc.url, tc.dataURI)]);
}

// ---------------------------------------------------------------------------
// Utilidades de figuras
// ---------------------------------------------------------------------------
const num = (v) => (Math.round(v * 1000) / 1000).toString();

function escaparXML(t) {
  return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

export function rectRedondeado(x, y, w, h, r = 0) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (!rr) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`;
  return (
    `M${num(x + rr)} ${num(y)}h${num(w - 2 * rr)}a${num(rr)} ${num(rr)} 0 0 1 ${num(rr)} ${num(rr)}` +
    `v${num(h - 2 * rr)}a${num(rr)} ${num(rr)} 0 0 1 ${num(-rr)} ${num(rr)}` +
    `h${num(-(w - 2 * rr))}a${num(rr)} ${num(rr)} 0 0 1 ${num(-rr)} ${num(-rr)}` +
    `v${num(-(h - 2 * rr))}a${num(rr)} ${num(rr)} 0 0 1 ${num(rr)} ${num(-rr)}z`
  );
}

// Posición x de cada tramo de un texto según la alineación.
function disponerTramos(op) {
  const medidas = op.tramos.map((t) => anchoTexto(t.texto, t));
  const total = medidas.reduce((a, b) => a + b, 0);
  let x = op.x;
  if (op.alinear === 'centro') x -= total / 2;
  else if (op.alinear === 'der') x -= total;
  return op.tramos.map((t, i) => {
    const r = { ...t, x };
    x += medidas[i];
    return r;
  });
}

function transformacion(op) {
  const partes = [];
  if (op.x || op.y) partes.push(`translate(${num(op.x || 0)} ${num(op.y || 0)})`);
  if (op.rotar) partes.push(`rotate(${num(op.rotar)})`);
  if (op.escala && op.escala !== 1) partes.push(`scale(${num(op.escala)})`);
  return partes.join(' ');
}

// ---------------------------------------------------------------------------
// Salida SVG
// ---------------------------------------------------------------------------
let contadorIds = 0;

// opciones: { sangrado (mm visibles fuera del corte), anchoCSS / altoCSS (atributos width/height),
//             incrustarFuentes (CSS @font-face), imagenesEmbebidas (data URI), clase }
export function escenaASVG(escena, { sangrado = 0, incrustarFuentes = '', imagenesEmbebidas = false, unidades = true, clase = '', etiqueta = '' } = {}) {
  const pref = `s${++contadorIds}-`;
  const defs = [];
  let idLocal = 0;
  const nuevoId = () => `${pref}${++idLocal}`;

  const pintura = (p) => {
    if (!p) return 'none';
    if (typeof p === 'string') return p;
    const id = nuevoId();
    const paradas = p.paradas.map(([o, c, a = 1]) => `<stop offset="${num(o)}" stop-color="${c}"${a < 1 ? ` stop-opacity="${num(a)}"` : ''}/>`).join('');
    if (p.tipo === 'radial') defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(p.r)}">${paradas}</radialGradient>`);
    else defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(p.x1)}" y1="${num(p.y1)}" x2="${num(p.x2)}" y2="${num(p.y2)}">${paradas}</linearGradient>`);
    return `url(#${id})`;
  };

  const trazo = (op) => (op.trazo ? ` stroke="${pintura(op.trazo)}" stroke-width="${num(op.grosor || 0.3)}"${op.punta ? ` stroke-linecap="${op.punta}" stroke-linejoin="round"` : ''}${op.guiones ? ` stroke-dasharray="${op.guiones.map(num).join(' ')}"` : ''}` : '');
  const opac = (op) => (op.opacidad != null && op.opacidad < 1 ? ` opacity="${num(op.opacidad)}"` : '');

  const pintar = (op) => {
    switch (op.t) {
      case 'rect':
        if (!op.r) return `<rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.w)}" height="${num(op.h)}" fill="${pintura(op.relleno)}"${trazo(op)}${opac(op)}/>`;
        return `<rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.w)}" height="${num(op.h)}" rx="${num(op.r)}" fill="${pintura(op.relleno)}"${trazo(op)}${opac(op)}/>`;
      case 'circulo':
        return `<circle cx="${num(op.cx)}" cy="${num(op.cy)}" r="${num(op.r)}" fill="${pintura(op.relleno)}"${trazo(op)}${opac(op)}/>`;
      case 'linea':
        return `<line x1="${num(op.x1)}" y1="${num(op.y1)}" x2="${num(op.x2)}" y2="${num(op.y2)}" fill="none"${trazo(op)}${opac(op)}/>`;
      case 'ruta': {
        const tr = transformacion(op);
        return `<path d="${op.d}"${tr ? ` transform="${tr}"` : ''} fill="${pintura(op.relleno)}"${op.parImpar ? ' fill-rule="evenodd"' : ''}${trazo(op)}${opac(op)}/>`;
      }
      case 'texto': {
        const rot = op.rotar ? ` transform="rotate(${num(op.rotar)} ${num(op.x)} ${num(op.y)})"` : '';
        const partes = disponerTramos(op).map((t) => {
          const familia = `'${t.familia}', ${RESPALDO}`;
          const esp = t.espaciado ? ` letter-spacing="${num(t.espaciado)}"` : '';
          return `<text x="${num(t.x)}" y="${num(op.y)}" font-family="${familia}" font-weight="${pesoDisponible(t.familia, t.peso)}" font-size="${num(t.tam)}" fill="${pintura(t.color)}"${esp}>${escaparXML(t.texto)}</text>`;
        });
        return `<g${rot}${opac(op)}>${partes.join('')}</g>`;
      }
      case 'imagen': {
        const im = IMAGENES[op.src];
        const href = imagenesEmbebidas ? im.dataURI : im.url;
        return `<image href="${href}" x="${num(op.x)}" y="${num(op.y)}" width="${num(op.w)}" height="${num(op.h)}" preserveAspectRatio="xMidYMid meet"${opac(op)}/>`;
      }
      case 'qr': {
        const { n, filas } = matrizQR(op.texto, op.nivel);
        const margen = op.margen ?? 4;
        const m = op.lado / (n + margen * 2);
        return (
          `<g class="qr" data-nivel="${op.nivel}" data-modulos="${n}">` +
          `<rect x="${num(op.x)}" y="${num(op.y)}" width="${num(op.lado)}" height="${num(op.lado)}" fill="${op.fondo || '#ffffff'}"/>` +
          `<path d="${trazadoQR(filas)}" transform="translate(${num(op.x + margen * m)} ${num(op.y + margen * m)}) scale(${num(m)})" fill="${op.color || '#000000'}"/></g>`
        );
      }
      case 'grupo': {
        let atributos = opac(op);
        if (op.recorte) {
          const id = nuevoId();
          const { x, y, w, h, r = 0 } = op.recorte;
          defs.push(`<clipPath id="${id}"><path d="${rectRedondeado(x, y, w, h, r)}"/></clipPath>`);
          atributos += ` clip-path="url(#${id})"`;
        }
        const tr = transformacion(op);
        if (tr) atributos += ` transform="${tr}"`;
        return `<g${atributos}>${op.ops.map(pintar).join('')}</g>`;
      }
      default:
        return '';
    }
  };

  const cuerpo = escena.ops.map(pintar).join('');
  const s = sangrado;
  const vw = escena.ancho + 2 * s;
  const vh = escena.alto + 2 * s;
  const dim = unidades ? ` width="${num(vw)}mm" height="${num(vh)}mm"` : '';
  const estilo = incrustarFuentes ? `<style>${incrustarFuentes}</style>` : '';
  const titulo = etiqueta ? `<title>${escaparXML(etiqueta)}</title>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(-s)} ${num(-s)} ${num(vw)} ${num(vh)}"${dim}${clase ? ` class="${clase}"` : ''} role="img">` +
    `${titulo}${estilo}<defs>${defs.join('')}</defs>${cuerpo}</svg>`
  );
}

// CSS con las fuentes usadas por la escena incrustadas en base64 (SVG autónomo).
export async function fuentesIncrustadas(escena) {
  const usadas = new Set();
  const recorrer = (ops) =>
    ops.forEach((op) => {
      if (op.t === 'texto') op.tramos.forEach((t) => usadas.add(`${t.familia}|${pesoDisponible(t.familia, t.peso)}`));
      if (op.t === 'grupo') recorrer(op.ops);
    });
  recorrer(escena.ops);
  const reglas = await Promise.all(
    [...usadas].map(async (clave) => {
      const [familia, peso] = clave.split('|');
      const datos = new Uint8Array(await (await fetch(urlFuente(familia, Number(peso)))).arrayBuffer());
      let binario = '';
      for (let i = 0; i < datos.length; i += 0x8000) binario += String.fromCharCode.apply(null, datos.subarray(i, i + 0x8000));
      return `@font-face{font-family:'${familia}';font-weight:${peso};font-style:normal;src:url(data:font/woff2;base64,${btoa(binario)}) format('woff2')}`;
    }),
  );
  return reglas.join('');
}

// ---------------------------------------------------------------------------
// Salida canvas (PNG)
// ---------------------------------------------------------------------------
function pinturaCanvas(ctx, p) {
  if (!p || typeof p === 'string') return p || 'transparent';
  const g = p.tipo === 'radial' ? ctx.createRadialGradient(p.cx, p.cy, 0, p.cx, p.cy, p.r) : ctx.createLinearGradient(p.x1, p.y1, p.x2, p.y2);
  for (const [o, c, a = 1] of p.paradas) g.addColorStop(o, a < 1 ? conAlfa(c, a) : c);
  return g;
}

function conAlfa(hex, a) {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

function rellenarYTrazar(ctx, op, ruta) {
  if (op.relleno) {
    ctx.fillStyle = pinturaCanvas(ctx, op.relleno);
    ctx.fill(ruta, op.parImpar ? 'evenodd' : 'nonzero');
  }
  if (op.trazo) {
    ctx.strokeStyle = pinturaCanvas(ctx, op.trazo);
    ctx.lineWidth = op.grosor || 0.3;
    ctx.lineCap = op.punta || 'butt';
    ctx.lineJoin = op.punta ? 'round' : 'miter';
    ctx.setLineDash(op.guiones || []);
    ctx.stroke(ruta);
    ctx.setLineDash([]);
  }
}

function aplicarTransformacion(ctx, op) {
  if (op.x || op.y) ctx.translate(op.x || 0, op.y || 0);
  if (op.rotar) ctx.rotate((op.rotar * Math.PI) / 180);
  if (op.escala && op.escala !== 1) ctx.scale(op.escala, op.escala);
}

function pintarCanvas(ctx, op, s) {
  ctx.save();
  if (op.opacidad != null) ctx.globalAlpha *= op.opacidad;
  switch (op.t) {
    case 'rect':
      rellenarYTrazar(ctx, op, new Path2D(rectRedondeado(op.x, op.y, op.w, op.h, op.r || 0)));
      break;
    case 'circulo': {
      const p = new Path2D();
      p.arc(op.cx, op.cy, op.r, 0, Math.PI * 2);
      rellenarYTrazar(ctx, op, p);
      break;
    }
    case 'linea': {
      const p = new Path2D();
      p.moveTo(op.x1, op.y1);
      p.lineTo(op.x2, op.y2);
      rellenarYTrazar(ctx, { ...op, relleno: null }, p);
      break;
    }
    case 'ruta':
      aplicarTransformacion(ctx, op);
      rellenarYTrazar(ctx, op, new Path2D(op.d));
      break;
    case 'texto': {
      // El texto se dibuja en píxeles reales (sin escalar la fuente) para que quede nítido.
      ctx.scale(1 / s, 1 / s);
      if (op.rotar) {
        ctx.translate(op.x * s, op.y * s);
        ctx.rotate((op.rotar * Math.PI) / 180);
        ctx.translate(-op.x * s, -op.y * s);
      }
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      for (const t of disponerTramos(op)) {
        ctx.font = fuenteCanvas(t.familia, t.peso, t.tam * s);
        ctx.letterSpacing = `${(t.espaciado || 0) * s}px`;
        ctx.fillStyle = typeof t.color === 'string' ? t.color : '#000';
        ctx.fillText(t.texto, t.x * s, op.y * s);
      }
      break;
    }
    case 'imagen':
      ctx.drawImage(IMAGENES[op.src].img, op.x, op.y, op.w, op.h);
      break;
    case 'qr': {
      // El núcleo dibuja el QR en píxeles enteros: se llama sin escala.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      N.dibujarQR(ctx, op.texto, Math.round(op.x * s), Math.round(op.y * s), Math.round(op.lado * s), {
        nivel: op.nivel,
        color: op.color || '#000000',
        fondo: op.fondo || '#ffffff',
        margen: op.margen ?? 4,
      });
      break;
    }
    case 'grupo':
      aplicarTransformacion(ctx, op);
      if (op.recorte) {
        const { x, y, w, h, r = 0 } = op.recorte;
        ctx.clip(new Path2D(rectRedondeado(x, y, w, h, r)));
      }
      for (const hijo of op.ops) pintarCanvas(ctx, hijo, s);
      break;
    default:
      break;
  }
  ctx.restore();
}

// Dibuja la escena en un canvas nuevo a `ppp` puntos por pulgada (tamaño real).
export function escenaACanvas(escena, ppp = PPP) {
  const s = ppp / MM_POR_PULGADA;
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(escena.ancho * s);
  lienzo.height = Math.round(escena.alto * s);
  const ctx = lienzo.getContext('2d');
  ctx.scale(lienzo.width / escena.ancho, lienzo.height / escena.alto);
  for (const op of escena.ops) pintarCanvas(ctx, op, s);
  return lienzo;
}

// ---------------------------------------------------------------------------
// PNG con la resolución anotada (chunk pHYs) para que cualquier programa lo
// abra al tamaño real: 300 ppp = 11 811 puntos por metro.
// ---------------------------------------------------------------------------
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function conResolucion(png, ppp = PPP) {
  const ppm = Math.round(ppp / 0.0254);
  const datos = new Uint8Array(9);
  const vista = new DataView(datos.buffer);
  vista.setUint32(0, ppm);
  vista.setUint32(4, ppm);
  datos[8] = 1; // unidad: metro
  const tipo = new TextEncoder().encode('pHYs');
  const trozo = new Uint8Array(4 + 4 + 9 + 4);
  const v = new DataView(trozo.buffer);
  v.setUint32(0, 9);
  trozo.set(tipo, 4);
  trozo.set(datos, 8);
  v.setUint32(17, crc32(new Uint8Array([...tipo, ...datos])));
  // Firma (8) + IHDR (25): el pHYs va justo después del IHDR.
  const fin = 8 + 25;
  const salida = new Uint8Array(png.length + trozo.length);
  salida.set(png.subarray(0, fin), 0);
  salida.set(trozo, fin);
  salida.set(png.subarray(fin), fin + trozo.length);
  return salida;
}

export async function escenaAPNG(escena, ppp = PPP) {
  const lienzo = escenaACanvas(escena, ppp);
  const blob = await new Promise((r) => lienzo.toBlob(r, 'image/png'));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { bytes: conResolucion(bytes, ppp), ancho: lienzo.width, alto: lienzo.height };
}
