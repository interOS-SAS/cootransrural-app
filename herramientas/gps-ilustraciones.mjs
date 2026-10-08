// Genera las ilustraciones de la tienda TaxiCun GPS (img/gps/*.svg). Ilustraciones PROPIAS, hechas por código,
// con el estilo de la del ingreso del panel (el mismo taxi amarillo de lado): sin fotos ni recursos de terceros,
// sin URLs ni data:, sin texto (los datos se ponen encima en HTML, con la letra de la página) y sin <style> ni
// <script>, para que se vean igual en todos lados y cumplan cualquier CSP (img-src 'self').
// No se usa en producción: solo sirve para volver a generar los SVG si hay que cambiar algo.
//
// Uso: node herramientas/gps-ilustraciones.mjs [carpeta]   (por defecto img/gps/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SALIDA = process.argv[2] || fileURLToPath(new URL('../img/gps/', import.meta.url));
mkdirSync(SALIDA, { recursive: true });

// ---------------------------------------------------------------- utilidades
let semilla = 20261003;
const azar = () => { semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0; return semilla / 4294967296; };
const n = (v) => { let s = (Math.round(v * 10) / 10).toFixed(1); if (s.endsWith('.0')) s = s.slice(0, -2); return s === '-0' ? '0' : s; };
const pts = (lista) => lista.map(([x, y]) => `${n(x)} ${n(y)}`).join(' ');

function suave(p) {
  let d = `M${n(p[0][0])} ${n(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i]; const p1 = p[i]; const p2 = p[i + 1]; const p3 = p[i + 2] || p2;
    d += `C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

const C = {
  azul: '#0A2552', azul2: '#1A4FA0', azul3: '#2A63C2', tinte: '#EAF0FA', amarillo: '#FFC21A', amarilloOsc: '#F2A900',
  negro: '#121212', marco: '#0B0F17', verde: '#22B45E', rojo: '#E53935', gris: '#C9D1DE', grisOsc: '#8A96A8',
  mapa: '#ECEFE6', manzana: '#F8F6EF', parque: '#CFE5B5', agua: '#BFDCF0', via: '#FFFFFF',
};

// Gradientes que usan el taxi y los aparatos (cada SVG los lleva en sus <defs>).
const DEFS_TAXI = `
<linearGradient id="carro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD84D"/><stop offset=".6" stop-color="#FFC107"/><stop offset="1" stop-color="#F0A500"/></linearGradient>
<linearGradient id="vidrio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22304F"/><stop offset=".6" stop-color="#2E3F66"/><stop offset="1" stop-color="#5B7BB8"/></linearGradient>
<radialGradient id="faro" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF6CF" stop-opacity=".95"/><stop offset=".4" stop-color="#FFE38A" stop-opacity=".4"/><stop offset="1" stop-color="#FFE38A" stop-opacity="0"/></radialGradient>
<pattern id="cuadrosc" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#121212"/><rect width="4" height="4" fill="#fff"/><rect x="4" y="4" width="4" height="4" fill="#fff"/></pattern>`;

const svg = (ancho, alto, defs, cuerpo) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}"><defs>${defs}</defs>${cuerpo}</svg>\n`;

// ---------------------------------------------------------------- piezas
// Taxi de lado (el del ingreso del panel: Kia Picanto amarillo), mirando a la derecha.
function taxiLado(x, suelo, k, { faro = true } = {}) {
  let s = `<g transform="translate(${n(x)} ${n(suelo - 106 * k)}) scale(${n(k * 100) / 100})">`;
  s += '<ellipse cx="112" cy="104" rx="106" ry="8" fill="#000" opacity=".25"/>';
  s += '<path d="M14 80c-2-14 4-24 20-27l34-5 21-22c4-4 9-6 15-6h40c9 0 15 3 20 9l17 20 18 4c11 3 17 10 17 21v8c0 5-3 8-8 8H22c-5 0-8-3-8-8z" fill="url(#carro)"/>';
  s += '<path d="M14 80c-2-14 4-24 20-27l34-5" fill="none" stroke="#E0A100" stroke-width="2"/>';
  s += '<path d="M74 48l19-20c3-3 6-4 10-4h20v24z" fill="url(#vidrio)"/><path d="M128 24h16c7 0 11 2 15 7l13 17h-44z" fill="url(#vidrio)"/>';
  s += '<path d="M80 44l12-13M133 43l9-12" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>';
  s += '<path d="M125 24v56M70 52v28" stroke="#C99100" stroke-width="1.6" opacity=".7"/>';
  s += '<rect x="24" y="62" width="176" height="8" fill="url(#cuadrosc)"/>';
  s += '<rect x="100" y="8" width="38" height="13" rx="3.5" fill="#121212"/><rect x="104" y="11.5" width="30" height="6" rx="2" fill="#FFC107"/>';
  s += '<rect x="108" y="52" width="10" height="3" rx="1.5" fill="#121212" opacity=".55"/><rect x="150" y="52" width="10" height="3" rx="1.5" fill="#121212" opacity=".55"/>';
  s += '<path d="M200 66l9 2v7l-9-1z" fill="#FFF3B0"/>';
  if (faro) s += '<ellipse cx="236" cy="72" rx="34" ry="13" fill="url(#faro)"/>';
  s += '<rect x="15" y="64" width="6" height="9" rx="2" fill="#E53935"/>';
  for (const cx of [58, 170]) s += `<circle cx="${cx}" cy="90" r="16" fill="#121212"/><circle cx="${cx}" cy="90" r="7.5" fill="#B9BEC6"/><circle cx="${cx}" cy="90" r="2.5" fill="#121212"/>`;
  return `${s}</g>`;
}

// Taxi visto desde arriba (marcador del mapa), centrado en (0,0) y mirando hacia arriba.
function taxiArriba(k = 1) {
  return `<g transform="scale(${n(k * 100) / 100})">`
    + '<rect x="-11" y="-19" width="22" height="38" rx="7" fill="#000" opacity=".22" transform="translate(1.5 2)"/>'
    + '<rect x="-11" y="-19" width="22" height="38" rx="7" fill="#FFC107" stroke="#121212" stroke-width="1.6"/>'
    + '<path d="M-8 -9Q0 -13 8 -9L7 -3H-7Z" fill="#22304F"/><path d="M-7 8H7L8 12Q0 15 -8 12Z" fill="#22304F"/>'
    + '<rect x="-4.5" y="-1.6" width="9" height="4.4" rx="1.2" fill="#121212"/><rect x="-3" y="-.6" width="6" height="2.4" rx=".8" fill="#FFC107"/>'
    + '</g>';
}

// Pin de TaxiCun (amarillo con el chulo), con la punta en (0,0).
function pin(k = 1, color = C.amarillo) {
  return `<g transform="scale(${n(k * 100) / 100})">`
    + '<ellipse cx="0" cy="2" rx="12" ry="3.5" fill="#000" opacity=".2"/>'
    + `<path d="M0 0C0 0-28-24-28-46C-28-62-15-74 0-74S28-62 28-46C28-24 0 0 0 0Z" fill="${color}" stroke="#121212" stroke-width="3"/>`
    + '<circle cx="0" cy="-46" r="12" fill="#121212"/><path d="M-5.5 -46l4 4 7.5-8" fill="none" stroke="#FFC107" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</g>';
}

// Ondas de señal (arcos) que salen de (x,y) hacia «ang» grados.
function ondas(x, y, ang, radios, color, grosor = 4, apertura = 50) {
  let s = '';
  radios.forEach((r, i) => {
    const a1 = ((ang - apertura / 2) * Math.PI) / 180; const a2 = ((ang + apertura / 2) * Math.PI) / 180;
    s += `<path d="M${n(x + r * Math.cos(a1))} ${n(y + r * Math.sin(a1))}A${r} ${r} 0 0 1 ${n(x + r * Math.cos(a2))} ${n(y + r * Math.sin(a2))}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" opacity="${n((1 - i * 0.22) * 100) / 100}"/>`;
  });
  return s;
}

// Mapa de calles (manzanas giradas, un parque, una quebrada y una avenida), recortado al rectángulo dado.
// Devuelve el SVG y una función que lleva puntos de la cuadrícula (columna, fila) a la pantalla.
function mapa(id, x, y, w, h, { rx = 0, giro = -16, paso = 54, ancho = 9, avenida = 3, parque = [1, 1], quebrada = true } = {}) {
  const cx = x + w / 2; const cy = y + h / 2;
  const rad = (giro * Math.PI) / 180;
  const aPantalla = (c, f) => {
    const gx = (c - 0.5) * paso; const gy = (f - 0.5) * paso;
    return [cx + gx * Math.cos(rad) - gy * Math.sin(rad), cy + gx * Math.sin(rad) + gy * Math.cos(rad)];
  };
  const radio = Math.hypot(w, h) / 2 + paso;
  const cuantas = Math.ceil(radio / paso) + 1;
  let manzanas = '';
  for (let c = -cuantas; c <= cuantas; c++) {
    for (let f = -cuantas; f <= cuantas; f++) {
      const x0 = c * paso - paso / 2 + ancho / 2; const y0 = f * paso - paso / 2 + ancho / 2;
      const esParque = c === parque[0] && f === parque[1];
      const tono = esParque ? C.parque : (azar() < 0.12 ? '#F2EFE4' : C.manzana);
      manzanas += `<rect x="${n(x0)}" y="${n(y0)}" width="${n(paso - ancho)}" height="${n(paso - ancho)}" rx="5" fill="${tono}"/>`;
      if (esParque) manzanas += `<circle cx="${n(x0 + (paso - ancho) * 0.3)}" cy="${n(y0 + (paso - ancho) * 0.35)}" r="6" fill="#9CC77E"/><circle cx="${n(x0 + (paso - ancho) * 0.7)}" cy="${n(y0 + (paso - ancho) * 0.62)}" r="7" fill="#9CC77E"/>`;
    }
  }
  // Avenida: una fila de calles más ancha y amarillenta.
  const av = `<rect x="${n(-radio)}" y="${n(avenida * paso - paso / 2 - ancho * 0.9)}" width="${n(radio * 2)}" height="${n(ancho * 1.8)}" fill="#FFF3C9"/>`;
  const que = quebrada ? `<path d="${suave([[-radio, -paso * 2.6], [-paso * 1.4, -paso * 1.9], [paso * 0.3, -paso * 2.4], [paso * 2.2, -paso * 1.6], [radio, -paso * 2.1]])}" fill="none" stroke="${C.agua}" stroke-width="10" stroke-linecap="round"/>` : '';
  const cuerpo = `<clipPath id="${id}"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${rx}"/></clipPath>`
    + `<g clip-path="url(#${id})"><rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${C.via}"/>`
    + `<g transform="translate(${n(cx)} ${n(cy)}) rotate(${giro})">${manzanas}${av}${que}</g>`;
  return { abre: cuerpo, cierra: '</g>', aPantalla };
}

// Recorrido por las calles: lista de cruces (columna, fila) → trazo.
function recorrido(aPantalla, cruces, { color = C.azul2, grosor = 6, punteado = false, opac = 1 } = {}) {
  const p = cruces.map(([c, f]) => aPantalla(c, f));
  return `<path d="M${pts(p.slice(0, 1))}L${pts(p.slice(1))}" fill="none" stroke="#fff" stroke-width="${grosor + 4}" stroke-linecap="round" stroke-linejoin="round" opacity="${opac * 0.9}"/>`
    + `<path d="M${pts(p.slice(0, 1))}L${pts(p.slice(1))}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round"${punteado ? ' stroke-dasharray="2 11"' : ''} opacity="${opac}"/>`;
}

function angulo(a, b) { return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI + 90; }

// Barras grises que hacen de texto en las pantallas dibujadas (el texto de verdad va en HTML).
const barra = (x, y, w, color = '#DCE2EC', alto = 8) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${alto}" rx="${alto / 2}" fill="${color}"/>`;

// Celular: marco, pantalla y el borde brillante. Devuelve el marco y el rectángulo de la pantalla.
function celular(x, y, w, h) {
  const r = Math.round(w * 0.15);
  const p = { x: x + 10, y: y + 10, w: w - 20, h: h - 20, rx: r - 8 };
  const marco = `<rect x="${x + 6}" y="${y + 16}" width="${w}" height="${h}" rx="${r}" fill="#000" opacity=".28"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${C.marco}"/>`
    + `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h - 3}" rx="${r - 1}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
  const isla = `<rect x="${n(x + w / 2 - 34)}" y="${y + 20}" width="68" height="18" rx="9" fill="${C.marco}"/>`;
  return { marco, isla, p };
}

// ================================================================ 1) portada.svg: el celular con «Mi taxi» y el taxi
function portada() {
  const AN = 620; const AL = 640;
  let s = '';
  s += `<circle cx="360" cy="300" r="270" fill="url(#halo)"/>`;
  const tel = celular(220, 16, 300, 604);
  const p = tel.p;
  s += tel.marco;
  const m = mapa('pantalla-portada', p.x, p.y, p.w, p.h, { rx: p.rx, giro: -14, paso: 58, parque: [-1, 2], avenida: 1 });
  s += m.abre;
  // El recorrido de hoy (claro) y el tramo de ahora (azul fuerte), por las calles.
  const hoy = [[-3, 5], [-2, 5], [-2, 4], [-1, 4], [-1, 3], [0, 3], [0, 2]];
  const ahora = [[0, 2], [0, 1], [1, 1], [1, 0], [1, -1], [2, -1]];
  s += recorrido(m.aPantalla, hoy, { color: '#7FA6E0', grosor: 6, opac: 0.9 });
  s += recorrido(m.aPantalla, ahora, { color: C.azul2, grosor: 7 });
  const ini = m.aPantalla(...hoy[0]);
  s += `<circle cx="${n(ini[0])}" cy="${n(ini[1])}" r="8" fill="#fff" stroke="${C.azul2}" stroke-width="4"/>`;
  const fin = m.aPantalla(2, -1); const antes = m.aPantalla(1, -1);
  s += `<circle cx="${n(fin[0])}" cy="${n(fin[1])}" r="44" fill="${C.amarillo}" opacity=".18"/><circle cx="${n(fin[0])}" cy="${n(fin[1])}" r="28" fill="${C.amarillo}" opacity=".3"/>`;
  s += `<g transform="translate(${n(fin[0])} ${n(fin[1])}) rotate(${n(angulo(antes, fin))})">${taxiArriba(1.15)}</g>`;
  // Barra de arriba de la app y la hoja de abajo (con tres datos del día).
  s += `<rect x="${p.x + 14}" y="${p.y + 44}" width="${p.w - 28}" height="48" rx="16" fill="#fff" opacity=".96"/>`;
  s += `<circle cx="${p.x + 40}" cy="${p.y + 68}" r="13" fill="${C.azul}"/><path d="M${p.x + 40} ${p.y + 75}c0 0-7-6-7-10a7 7 0 1 1 14 0c0 4-7 10-7 10z" fill="${C.amarillo}"/>`;
  s += barra(p.x + 62, p.y + 58, 92, '#C3CDDC') + barra(p.x + 62, p.y + 72, 58, '#E1E6EE', 7);
  s += `<circle cx="${p.x + p.w - 38}" cy="${p.y + 68}" r="6" fill="${C.verde}"/>`;
  const hy = p.y + p.h - 150;
  s += `<rect x="${p.x}" y="${hy}" width="${p.w}" height="170" rx="26" fill="#fff"/>`;
  s += barra(p.x + p.w / 2 - 22, hy + 10, 44, '#D5DBE5', 5);
  for (let i = 0; i < 3; i++) {
    const bx = p.x + 16 + i * ((p.w - 32 - 16) / 3 + 8); const bw = (p.w - 32 - 16) / 3;
    s += `<rect x="${n(bx)}" y="${hy + 28}" width="${n(bw)}" height="62" rx="14" fill="${i === 0 ? C.tinte : '#F4F6FA'}"/>`;
    s += `<circle cx="${n(bx + 18)}" cy="${hy + 46}" r="8" fill="${[C.azul2, C.amarillo, C.verde][i]}"/>`;
    s += barra(bx + 12, hy + 64, bw * 0.62, '#9AA7BB', 9) + barra(bx + 12, hy + 78, bw * 0.4, '#D5DBE5', 6);
  }
  s += m.cierra;
  s += tel.isla;
  // El taxi de verdad, adelante, con el pin y la señal que sube al celular.
  s += taxiLado(18, 612, 1.32, { faro: false });
  s += `<g transform="translate(166 448)">${pin(0.82)}</g>`;
  s += ondas(166, 382, -62, [40, 62, 84], C.amarillo, 5, 56);
  return svg(AN, AL, DEFS_TAXI + '<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFC21A" stop-opacity=".28"/><stop offset=".6" stop-color="#FFC21A" stop-opacity=".08"/><stop offset="1" stop-color="#FFC21A" stop-opacity="0"/></radialGradient>', s);
}

// ================================================================ 2) mi-taxi.svg: el celular con el día del taxi
function miTaxi() {
  const AN = 560; const AL = 640;
  let s = '';
  s += `<circle cx="280" cy="330" r="250" fill="${C.tinte}"/>`;
  const tel = celular(130, 18, 300, 604);
  const p = tel.p;
  s += tel.marco;
  s += `<clipPath id="pantalla-mi-taxi"><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}"/></clipPath><g clip-path="url(#pantalla-mi-taxi)">`;
  s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="#F4F6FA"/>`;
  // Encabezado azul.
  s += `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="104" fill="${C.azul}"/>`;
  s += `<circle cx="${p.x + 34}" cy="${p.y + 70}" r="15" fill="${C.amarillo}"/>` + taxiArribaMini(p.x + 34, p.y + 70);
  s += barra(p.x + 58, p.y + 60, 96, '#FFFFFF', 9) + barra(p.x + 58, p.y + 75, 62, '#6F86B3', 7);
  s += `<rect x="${p.x + p.w - 70}" y="${p.y + 60}" width="50" height="20" rx="10" fill="#1E7A47"/><circle cx="${p.x + p.w - 58}" cy="${p.y + 70}" r="4" fill="#7CF0A8"/>` + barra(p.x + p.w - 50, p.y + 67, 22, '#BFF5D3', 6);
  // Tarjeta del mapa con el recorrido del día.
  const mx = p.x + 14; const my = p.y + 118; const mw = p.w - 28; const mh = 150;
  s += `<rect x="${mx}" y="${my}" width="${mw}" height="${mh}" rx="16" fill="#fff"/>`;
  const m = mapa('mapa-mi-taxi', mx, my, mw, mh, { rx: 16, giro: 12, paso: 44, ancho: 7, parque: [2, -1], avenida: 0, quebrada: false });
  s += m.abre;
  const ruta = [[-4, 2], [-3, 2], [-3, 1], [-2, 1], [-1, 1], [-1, 0], [0, 0], [1, 0], [1, 1], [2, 1]];
  s += recorrido(m.aPantalla, ruta, { color: C.azul2, grosor: 5 });
  const a = m.aPantalla(...ruta[0]);
  s += `<circle cx="${n(a[0])}" cy="${n(a[1])}" r="6" fill="#fff" stroke="${C.azul2}" stroke-width="3.5"/>`;
  const b = m.aPantalla(2, 1); const b0 = m.aPantalla(1, 1);
  s += `<g transform="translate(${n(b[0])} ${n(b[1])}) rotate(${n(angulo(b0, b))})">${taxiArriba(0.9)}</g>`;
  s += m.cierra;
  // Kilómetros por día: siete barras (la de hoy, azul).
  const kx = p.x + 14; const ky = my + mh + 12; const kw = p.w - 28; const kh = 134;
  s += `<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" rx="16" fill="#fff"/>`;
  s += barra(kx + 16, ky + 16, 110, '#9AA7BB', 9);
  const alturas = [52, 68, 40, 80, 60, 34, 74];
  const base = ky + kh - 18; const bw = (kw - 32) / 7;
  alturas.forEach((h, i) => {
    s += `<rect x="${n(kx + 16 + i * bw + bw * 0.18)}" y="${n(base - h)}" width="${n(bw * 0.64)}" height="${h}" rx="6" fill="${i === 6 ? C.azul2 : C.amarillo}"/>`;
  });
  s += `<path d="M${kx + 14} ${base + 1}H${kx + kw - 14}" stroke="#DCE2EC" stroke-width="2"/>`;
  // Alertas: velocidad, equipo desconectado, grúa.
  const ay = ky + kh + 12;
  const filas = [
    { color: '#F57C00', icono: '<path d="M-7 3a7 7 0 1 1 14 0" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M0 3l4-5" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' },
    { color: C.rojo, icono: '<path d="M-3 -7v5M3 -7v5M-6 -2h12v3a6 6 0 0 1-12 0zM0 7v3" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' },
    { color: C.azul2, icono: '<path d="M-8 4h16M-6 4V-2h7l3 3v3M4 -6l-6 6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' },
  ];
  filas.forEach((f, i) => {
    const fy = ay + i * 46;
    s += `<rect x="${p.x + 14}" y="${fy}" width="${p.w - 28}" height="38" rx="12" fill="#fff"/>`;
    s += `<circle cx="${p.x + 36}" cy="${fy + 19}" r="12" fill="${f.color}"/><g transform="translate(${p.x + 36} ${fy + 19})">${f.icono}</g>`;
    s += barra(p.x + 56, fy + 12, [118, 96, 132][i], '#9AA7BB', 7) + barra(p.x + 56, fy + 24, [70, 84, 60][i], '#DCE2EC', 6);
  });
  s += '</g>' + tel.isla;
  // Dos medallas flotando: el velocímetro y el reloj de horas de motor.
  s += medalla(84, 250, C.amarillo, '<path d="M-14 6a14 14 0 1 1 28 0" fill="none" stroke="#0A2552" stroke-width="4" stroke-linecap="round"/><path d="M0 6l8-10" stroke="#0A2552" stroke-width="4" stroke-linecap="round"/><circle cx="0" cy="6" r="3" fill="#0A2552"/>');
  s += medalla(480, 420, C.azul2, '<circle cx="0" cy="0" r="14" fill="none" stroke="#fff" stroke-width="4"/><path d="M0 -7v7l5 4" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>');
  return svg(AN, AL, DEFS_TAXI, s);
}

function taxiArribaMini(x, y) {
  return `<g transform="translate(${x} ${y}) rotate(-35)">${taxiArriba(0.55)}</g>`;
}

function medalla(x, y, color, icono) {
  return `<g transform="translate(${x} ${y})"><circle cx="3" cy="8" r="38" fill="#000" opacity=".16"/><circle cx="0" cy="0" r="38" fill="#fff"/><circle cx="0" cy="0" r="30" fill="${color}"/>${icono}</g>`;
}

// ================================================================ 3) central.svg: el portátil de la central con la flota
function central() {
  const AN = 760; const AL = 500;
  let s = '';
  // Pantalla del portátil.
  s += '<rect x="66" y="28" width="628" height="404" rx="22" fill="#000" opacity=".3"/>';
  s += `<rect x="60" y="14" width="640" height="404" rx="22" fill="${C.marco}"/>`;
  s += '<rect x="61.5" y="15.5" width="637" height="401" rx="21" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>';
  const P = { x: 76, y: 30, w: 608, h: 372 };
  s += `<clipPath id="pantalla-central"><rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="10"/></clipPath><g clip-path="url(#pantalla-central)">`;
  s += `<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="#F4F6FA"/>`;
  // Menú lateral azul con la lista de taxis (uno en pánico).
  const L = 168;
  s += `<rect x="${P.x}" y="${P.y}" width="${L}" height="${P.h}" fill="${C.azul}"/>`;
  s += `<circle cx="${P.x + 26}" cy="${P.y + 28}" r="12" fill="${C.amarillo}"/>` + barra(P.x + 46, P.y + 24, 80, '#FFFFFF', 8);
  for (let i = 0; i < 7; i++) {
    const fy = P.y + 62 + i * 42;
    const panico = i === 1;
    s += `<rect x="${P.x + 10}" y="${fy}" width="${L - 20}" height="34" rx="10" fill="${panico ? C.rojo : '#13336B'}"/>`;
    s += `<circle cx="${P.x + 28}" cy="${fy + 17}" r="7" fill="${panico ? '#fff' : (i % 3 === 2 ? '#7E8FB0' : C.amarillo)}"/>`;
    s += barra(P.x + 42, fy + 10, [70, 82, 64, 76, 58, 72, 66][i], panico ? '#FFFFFF' : '#C9D4EA', 7) + barra(P.x + 42, fy + 21, [44, 50, 38, 46, 52, 40, 48][i], panico ? '#FFC9C7' : '#5872A6', 5);
  }
  // Barra de arriba.
  s += `<rect x="${P.x + L}" y="${P.y}" width="${P.w - L}" height="46" fill="#fff"/>`;
  s += barra(P.x + L + 18, P.y + 14, 120, '#9AA7BB', 9) + barra(P.x + L + 18, P.y + 28, 70, '#DCE2EC', 6);
  s += `<rect x="${P.x + P.w - 150}" y="${P.y + 11}" width="58" height="24" rx="12" fill="${C.tinte}"/><circle cx="${P.x + P.w - 136}" cy="${P.y + 23}" r="5" fill="${C.verde}"/>` + barra(P.x + P.w - 126, P.y + 19, 26, '#9AB0D6', 7);
  s += `<rect x="${P.x + P.w - 84}" y="${P.y + 11}" width="70" height="24" rx="12" fill="${C.rojo}"/><path d="M${P.x + P.w - 70} ${P.y + 29}l7-13 7 13z" fill="#fff"/>` + barra(P.x + P.w - 56, P.y + 19, 34, '#FFFFFF', 7);
  // Mapa de la flota.
  const MX = P.x + L; const MY = P.y + 46; const MW = P.w - L; const MH = P.h - 46;
  const m = mapa('mapa-central', MX, MY, MW, MH, { giro: -10, paso: 56, parque: [1, -1], avenida: 1 });
  s += m.abre;
  const taxis = [[-3, -2, 20], [-2, 1, 110], [-1, -1, 0], [0, 2, 90], [1, 0, 180], [2, 2, 270], [3, -1, 90], [-3, 2, 0], [2, -2, 180], [0, -2, 270]];
  for (const [c, f, giro] of taxis) {
    const [x, y] = m.aPantalla(c + 0.5, f);
    s += `<g transform="translate(${n(x)} ${n(y)}) rotate(${giro - 10})">${taxiArriba(0.7)}</g>`;
  }
  // El taxi en pánico: rojo, con anillos.
  const [px, py] = m.aPantalla(-0.5, 0.5);
  s += `<circle cx="${n(px)}" cy="${n(py)}" r="54" fill="${C.rojo}" opacity=".1"/><circle cx="${n(px)}" cy="${n(py)}" r="36" fill="${C.rojo}" opacity=".18"/><circle cx="${n(px)}" cy="${n(py)}" r="22" fill="${C.rojo}" opacity=".3"/>`;
  s += `<g transform="translate(${n(px)} ${n(py)})"><circle r="16" fill="${C.rojo}" stroke="#fff" stroke-width="3"/><path d="M0 -8v9M0 6v.5" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></g>`;
  s += m.cierra;
  s += '</g>';
  // Base del portátil.
  s += `<path d="M14 432H746L732 452Q728 458 718 458H42Q32 458 28 452Z" fill="#B9C2D0"/><path d="M14 432H746V438H14Z" fill="#D6DCE6"/><rect x="330" y="432" width="100" height="8" rx="4" fill="#9AA5B6"/>`;
  s += '<ellipse cx="380" cy="470" rx="330" ry="10" fill="#000" opacity=".14"/>';
  return svg(AN, AL, '', s);
}

// ================================================================ 4) equipo.svg: el equipo, la SIM, el relé y el botón de pánico
function equipo() {
  const AN = 680; const AL = 470;
  let s = '';
  s += '<circle cx="300" cy="250" r="210" fill="#FFF3CF"/>';
  // Señal 4G hacia arriba.
  s += ondas(250, 150, -90, [46, 70, 94], C.azul2, 6, 64);
  // Cables del equipo al relé, al botón y a la corriente (rojo, negro, amarillo, blanco).
  const cables = [
    { c: '#E53935', p: [[352, 262], [420, 262], [470, 210], [540, 190]] },
    { c: '#1D1D1F', p: [[352, 274], [430, 280], [480, 250], [546, 232]] },
    { c: '#F2A900', p: [[352, 286], [420, 312], [470, 360], [530, 372]] },
    { c: '#F4F6FA', p: [[352, 298], [410, 336], [440, 400], [500, 420]], borde: true },
  ];
  for (const k of cables) {
    if (k.borde) s += `<path d="${suave(k.p)}" fill="none" stroke="#B5BDCB" stroke-width="9" stroke-linecap="round"/>`;
    s += `<path d="${suave(k.p)}" fill="none" stroke="${k.c}" stroke-width="6" stroke-linecap="round"/>`;
  }
  // El equipo: caja negra en perspectiva, con dos luces, la batería interna y el conector.
  s += '<ellipse cx="250" cy="352" rx="128" ry="16" fill="#000" opacity=".16"/>';
  s += '<path d="M134 196L172 172H364L338 196Z" fill="#3A4150"/>';
  s += '<path d="M338 196L364 172V306L338 336Z" fill="#1A1E26"/>';
  s += '<rect x="134" y="196" width="204" height="140" rx="12" fill="url(#caja)"/>';
  s += '<rect x="134" y="196" width="204" height="140" rx="12" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>';
  s += '<rect x="156" y="216" width="112" height="70" rx="8" fill="#2E3542"/>';
  s += '<rect x="172" y="232" width="52" height="26" rx="5" fill="none" stroke="#C9D1DE" stroke-width="3.5"/><rect x="224" y="240" width="6" height="10" rx="2" fill="#C9D1DE"/><rect x="177" y="237" width="26" height="16" rx="2" fill="#5BD08A"/>';
  s += barra(172, 268, 78, '#596273', 7);
  s += '<circle cx="296" cy="226" r="7" fill="#22B45E"/><circle cx="296" cy="226" r="12" fill="#22B45E" opacity=".25"/><circle cx="318" cy="226" r="7" fill="#FFC21A"/><circle cx="318" cy="226" r="12" fill="#FFC21A" opacity=".25"/>';
  s += '<rect x="282" y="300" width="44" height="18" rx="4" fill="#2E3542"/>';
  s += '<rect x="338" y="252" width="20" height="58" rx="4" fill="#4A5262"/>';
  // La SIM de datos, entrando al equipo.
  s += '<g transform="translate(74 112) rotate(-14)"><path d="M0 0H44L58 14V74H0Z" fill="#fff" stroke="#9AA5B6" stroke-width="2.5"/><rect x="12" y="26" width="34" height="30" rx="5" fill="#E7B94A"/><path d="M12 41H46M29 26V56" stroke="#B88A1E" stroke-width="2"/></g>';
  s += '<path d="M128 196C118 182 116 172 118 160" fill="none" stroke="#9AA5B6" stroke-width="3" stroke-dasharray="3 7" stroke-linecap="round"/>';
  // El relé del arranque (cubo negro con sus patas).
  s += '<g transform="translate(540 160)"><path d="M0 18L18 6H78L60 18Z" fill="#454C5A"/><path d="M60 18L78 6V70L60 82Z" fill="#14171D"/><rect x="0" y="18" width="60" height="64" rx="6" fill="#262B35"/>'
    + '<path d="M16 40h28M16 52h28" stroke="#596273" stroke-width="3" stroke-linecap="round"/><path d="M22 64l8-8 8 8" fill="none" stroke="#FFC21A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    + '<path d="M10 82v12M24 82v12M38 82v12M52 82v12" stroke="#B5BDCB" stroke-width="4" stroke-linecap="round"/></g>';
  // El botón de pánico (rojo, en su base negra).
  s += '<g transform="translate(560 384)"><ellipse cx="0" cy="22" rx="56" ry="14" fill="#000" opacity=".16"/><path d="M-50 0V14A50 14 0 0 0 50 14V0Z" fill="#1A1E26"/><ellipse cx="0" cy="0" rx="50" ry="14" fill="#2E3542"/>'
    + '<path d="M-32 -10V-2A32 9 0 0 0 32 -2V-10Z" fill="#B71C1C"/><ellipse cx="0" cy="-10" rx="32" ry="9" fill="#E53935"/><ellipse cx="-8" cy="-12" rx="12" ry="3" fill="#fff" opacity=".35"/></g>';
  // Fusible en el cable de corriente.
  s += '<g transform="translate(486 410) rotate(14)"><rect x="-16" y="-8" width="32" height="16" rx="4" fill="#3B82F6"/><rect x="-8" y="-4" width="16" height="8" rx="2" fill="#BFDBFE"/></g>';
  return svg(AN, AL, '<linearGradient id="caja" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2B313C"/><stop offset="1" stop-color="#171B22"/></linearGradient>', s);
}

const archivos = { 'portada.svg': portada(), 'mi-taxi.svg': miTaxi(), 'central.svg': central(), 'equipo.svg': equipo() };
for (const [nombre, contenido] of Object.entries(archivos)) {
  if (/<(script|style|text|image|foreignObject)\b|https?:|data:|\bon\w+=/i.test(contenido.replace('http://www.w3.org/2000/svg', ''))) throw new Error(`${nombre}: trae algo activo, texto o de afuera`);
  writeFileSync(join(SALIDA, nombre), contenido);
  console.log(`${nombre}: ${(contenido.length / 1024).toFixed(1)} KB`);
}
