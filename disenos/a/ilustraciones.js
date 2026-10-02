// Ilustraciones propias (SVG) del diseño A: bienvenida, estados vacíos y
// tarjeta de fidelidad. Sin fotos: todo vectorial, liviano y nítido.
import * as N from '../../nucleo/index.js';
import * as EM from './empresa.js';

const esc = (t) => N.escaparHTML(t ?? '');
// Detalles de la cooperativa en los dibujos: color de marca, placa y conductor de ejemplo.
const MARCA = EM.COLORES.marca;
const CONDUCTOR_EJEMPLO = (N.CONDUCTORES_DEMO || [])[0]?.nombre || 'Conductor';
const PLACA_EJEMPLO = `${String(N.EMPRESA?.placaPrefijo || 'TAX').slice(0, 3).toUpperCase()}·623`;

let serie = 0;
const id = (b) => `${b}${++serie}`;

// Kia Picanto amarillo visto de lado (mirando a la derecha).
export function taxiLateral({ ancho = 220, movil = EM.MOVIL_DEMO } = {}) {
  const c = id('cq');
  return `<svg viewBox="0 0 220 112" width="${ancho}" height="${(ancho * 112) / 220}" aria-hidden="true">
  <defs>
    <pattern id="${c}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#121212"/><rect width="4" height="4" fill="#fff"/><rect x="4" y="4" width="4" height="4" fill="#fff"/></pattern>
  </defs>
  <ellipse cx="112" cy="101" rx="98" ry="6" fill="#000" opacity=".16"/>
  <path d="M14 80c-2-14 4-24 20-27l34-5 21-22c4-4 9-6 15-6h40c9 0 15 3 20 9l17 20 18 4c11 3 17 10 17 21v8c0 5-3 8-8 8H22c-5 0-8-3-8-8z" fill="#FFC107"/>
  <path d="M14 80c-2-14 4-24 20-27l34-5" fill="none" stroke="#E0A100" stroke-width="2"/>
  <path d="M74 48l19-20c3-3 6-4 10-4h20v24z" fill="#22313d"/>
  <path d="M128 24h16c7 0 11 2 15 7l13 17h-44z" fill="#22313d"/>
  <path d="M80 44l12-13" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>
  <rect x="24" y="62" width="176" height="8" fill="url(#${c})" opacity=".95"/>
  <rect x="100" y="8" width="38" height="13" rx="3.5" fill="#121212"/>
  <text x="119" y="18" font-family="Sora, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#FFC107" text-anchor="middle">TAXI</text>
  <text x="114" y="83" font-family="Sora, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#121212" text-anchor="middle">MÓVIL ${N.escaparHTML(movil)}</text>
  <rect x="108" y="52" width="10" height="3" rx="1.5" fill="#121212" opacity=".55"/>
  <path d="M200 66l9 2v7l-9-1z" fill="#FFF3B0"/>
  <rect x="15" y="64" width="6" height="9" rx="2" fill="#E53935"/>
  <circle cx="58" cy="90" r="16" fill="#121212"/><circle cx="58" cy="90" r="7.5" fill="#B9BEC6"/><circle cx="58" cy="90" r="2.5" fill="#121212"/>
  <circle cx="170" cy="90" r="16" fill="#121212"/><circle cx="170" cy="90" r="7.5" fill="#B9BEC6"/><circle cx="170" cy="90" r="2.5" fill="#121212"/>
</svg>`;
}

// 1) Pide con tu ubicación exacta.
export function ilustracionUbicacion() {
  const r = id('rec');
  return `<svg class="a-ilus" viewBox="0 0 320 250" role="img" aria-label="${esc(`Mapa de ${EM.PUEBLO} con tu punto de recogida y un taxi en camino`)}">
  <defs><clipPath id="${r}"><rect x="34" y="26" width="252" height="184" rx="28"/></clipPath></defs>
  <g transform="rotate(-5 160 118)">
    <rect x="38" y="34" width="252" height="184" rx="28" fill="#121212" opacity=".12"/>
    <rect x="34" y="26" width="252" height="184" rx="28" fill="#fff"/>
    <g clip-path="url(#${r})">
      <rect x="34" y="26" width="252" height="184" fill="#F2EFE7"/>
      <rect x="46" y="38" width="78" height="52" rx="10" fill="#E6E1D4"/>
      <rect x="138" y="38" width="56" height="52" rx="10" fill="#CFE6C8"/>
      <rect x="208" y="38" width="70" height="52" rx="10" fill="#E6E1D4"/>
      <rect x="46" y="120" width="56" height="44" rx="10" fill="#E6E1D4"/>
      <rect x="208" y="122" width="70" height="40" rx="10" fill="#E6E1D4"/>
      <circle cx="160" cy="64" r="9" fill="#9CCB91"/>
      <path d="M20 104H300" stroke="#fff" stroke-width="17"/>
      <path d="M131 10v220" stroke="#fff" stroke-width="13"/>
      <path d="M200 10v220" stroke="#fff" stroke-width="9"/>
      <path d="M20 186c70-14 150 12 280-22" stroke="#fff" stroke-width="13" fill="none"/>
      <path d="M68 184c30-6 52-8 63-14V112c0-6 4-8 10-8h56" stroke="#121212" stroke-width="5" stroke-dasharray="1 10" stroke-linecap="round" fill="none"/>
    </g>
  </g>
  <g class="a-ilus-pulso"><circle cx="205" cy="104" r="30" fill="#121212" opacity=".07"/><circle cx="205" cy="104" r="18" fill="#121212" opacity=".1"/></g>
  <ellipse cx="205" cy="105" rx="10" ry="4" fill="#121212" opacity=".25"/>
  <g class="a-ilus-pin">
    <path d="M205 102s-27-28-27-50a27 27 0 0 1 54 0c0 22-27 50-27 50z" fill="#121212"/>
    <circle cx="205" cy="51" r="11" fill="#FFC107"/>
  </g>
  <g transform="translate(240 20)">
    <rect width="70" height="28" rx="14" fill="#fff"/>
    <circle cx="16" cy="14" r="5" fill="#16A34A"/>
    <text x="27" y="18.5" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="11" font-weight="800" fill="#121212">GPS ✓</text>
  </g>
  <g transform="translate(6 150)"><g class="a-ilus-taxi">${taxiLateral({ ancho: 132 })}</g></g>
</svg>`;
}

// 2) Sabes quién te recoge: datos del conductor, placa y código.
export function ilustracionSeguridad() {
  return `<svg class="a-ilus" viewBox="0 0 320 250" role="img" aria-label="Celular con los datos del conductor, la placa y el código de abordaje">
  <rect x="96" y="14" width="132" height="228" rx="26" fill="#121212"/>
  <rect x="104" y="22" width="116" height="212" rx="20" fill="#fff"/>
  <rect x="140" y="28" width="44" height="7" rx="3.5" fill="#121212"/>
  <rect x="112" y="46" width="100" height="56" rx="14" fill="#F4F5F7"/>
  <circle cx="132" cy="66" r="12" fill="#FFC107"/>
  <text x="132" y="70" font-family="Sora, Arial, sans-serif" font-size="10" font-weight="800" fill="#121212" text-anchor="middle">${esc(N.iniciales(CONDUCTOR_EJEMPLO) || 'TX')}</text>
  <rect x="150" y="58" width="48" height="6" rx="3" fill="#121212"/>
  <text x="150" y="80" font-family="Arial, sans-serif" font-size="9" fill="#E0A100">★★★★★</text>
  <rect x="120" y="86" width="44" height="12" rx="3" fill="#121212"/>
  <rect x="121.5" y="87.5" width="41" height="9" rx="2" fill="#FFC107"/>
  <text x="142" y="95" font-family="Sora, Arial, sans-serif" font-size="7" font-weight="800" fill="#121212" text-anchor="middle">${esc(PLACA_EJEMPLO)}</text>
  <text x="162" y="122" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="8" font-weight="700" fill="#555B66" text-anchor="middle">CÓDIGO DE ABORDAJE</text>
  ${['4', '8', '2', '1'].map((d, i) => `<rect x="${118 + i * 23}" y="130" width="19" height="25" rx="6" fill="#FFF4CC" stroke="#FFB300" stroke-width="1.5"/><text x="${127.5 + i * 23}" y="148" font-family="Sora, Arial, sans-serif" font-size="13" font-weight="800" fill="#121212" text-anchor="middle">${d}</text>`).join('')}
  <rect x="112" y="168" width="100" height="26" rx="13" fill="#FFC107"/>
  <text x="162" y="185" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="9.5" font-weight="800" fill="#121212" text-anchor="middle">Compartir viaje</text>
  <rect x="112" y="202" width="46" height="22" rx="11" fill="#F4F5F7"/><rect x="166" y="202" width="46" height="22" rx="11" fill="#E53935"/>
  <text x="189" y="217" font-family="Sora, Arial, sans-serif" font-size="9" font-weight="800" fill="#fff" text-anchor="middle">SOS</text>
  <g transform="translate(8 52)"><g class="a-ilus-burbuja">
    <rect width="104" height="46" rx="16" fill="#fff"/>
    <rect width="104" height="46" rx="16" fill="none" stroke="#121212" stroke-opacity=".08"/>
    <circle cx="22" cy="23" r="12" fill="#FFC107"/>
    <path d="M17 24a5 5 0 0 1 10 0c0 3 1.5 4 1.5 4h-13s1.5-1 1.5-4z" fill="#121212"/>
    <text x="40" y="20" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="9" font-weight="800" fill="#121212">Tu taxi está</text>
    <text x="40" y="32" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="9" font-weight="800" fill="#121212">en la puerta</text>
  </g></g>
  <g transform="translate(236 118)"><g class="a-ilus-escudo">
    <path d="M34 0 6 11v21c0 18 12 32 28 38 16-6 28-20 28-38V11z" fill="${MARCA}"/>
    <path d="m21 35 9 9 17-18" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g></g>
  <g transform="translate(232 40)"><circle cx="22" cy="22" r="22" fill="#fff"/><text x="22" y="29" font-family="Sora, Arial, sans-serif" font-size="18" font-weight="800" fill="#121212" text-anchor="middle">4,9</text></g>
  <text x="254" y="100" font-family="Arial, sans-serif" font-size="12" fill="#121212" text-anchor="middle">★★★★★</text>
</svg>`;
}

// 3) Paga con QR o en efectivo y gana descuentos. soloEfectivo (modo real): el pago
// es en efectivo al conductor, sin QR de prueba ni descuentos.
export function ilustracionPago({ soloEfectivo = false } = {}) {
  if (soloEfectivo) return ilustracionEfectivo();
  const qr = N.qrSVG(N.urlDescarga({ origen: 'bienvenida' }), { redondeado: true, color: '#121212', margen: 1 }).replace('<svg ', '<svg x="110" y="52" width="100" height="100" ');
  return `<svg class="a-ilus" viewBox="0 0 320 250" role="img" aria-label="Código QR de cobro, monedas y descuentos de 50 % y 10 %">
  <g transform="rotate(4 160 120)">
    <rect x="94" y="30" width="132" height="182" rx="24" fill="#121212" opacity=".12" transform="translate(5 7)"/>
    <rect x="94" y="30" width="132" height="182" rx="24" fill="#fff"/>
    ${qr}
    <text x="160" y="176" font-family="Sora, Arial, sans-serif" font-size="20" font-weight="800" fill="#121212" text-anchor="middle">$9.500</text>
    <rect x="128" y="186" width="64" height="16" rx="8" fill="#FFF4CC"/>
    <text x="160" y="197.5" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#121212" text-anchor="middle">PAGO DE PRUEBA</text>
  </g>
  <g transform="translate(30 150)"><g class="a-ilus-moneda">
    <circle cx="26" cy="30" r="24" fill="#E0A100"/><circle cx="26" cy="26" r="24" fill="#FFD54F"/><circle cx="26" cy="26" r="17" fill="none" stroke="#E0A100" stroke-width="3"/>
    <text x="26" y="33" font-family="Sora, Arial, sans-serif" font-size="20" font-weight="800" fill="#8A5A00" text-anchor="middle">$</text>
  </g></g>
  <g transform="translate(56 196)"><g class="a-ilus-moneda a-ilus-moneda-2">
    <circle cx="18" cy="21" r="16" fill="#E0A100"/><circle cx="18" cy="18" r="16" fill="#FFD54F"/>
    <text x="18" y="23.5" font-family="Sora, Arial, sans-serif" font-size="14" font-weight="800" fill="#8A5A00" text-anchor="middle">$</text>
  </g></g>
  <g transform="translate(222 18) rotate(10 42 42)"><g class="a-ilus-sello">
    <path d="M42 0l9 9 12-3 3 12 12 3-3 12 9 9-9 9 3 12-12 3-3 12-12-3-9 9-9-9-12 3-3-12-12-3 3-12-9-9 9-9-3-12 12-3 3-12 12 3z" fill="${MARCA}"/>
    <text x="42" y="44" font-family="Sora, Arial, sans-serif" font-size="19" font-weight="800" fill="#fff" text-anchor="middle">50 %</text>
    <text x="42" y="58" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="8" font-weight="800" fill="#FFE082" text-anchor="middle">VIAJE 11</text>
  </g></g>
  <g transform="translate(228 150) rotate(-8)"><g class="a-ilus-ticket">
    <path d="M0 0h76v12a8 8 0 0 0 0 16v12H0V28a8 8 0 0 0 0-16z" fill="#121212"/>
    <text x="38" y="25" font-family="Sora, Arial, sans-serif" font-size="15" font-weight="800" fill="#FFC107" text-anchor="middle">−10 %</text>
  </g></g>
</svg>`;
}

// Pago en efectivo al conductor (modo real): billete, valor y monedas.
function ilustracionEfectivo() {
  return `<svg class="a-ilus" viewBox="0 0 320 250" role="img" aria-label="Pago en efectivo al conductor">
  <g transform="rotate(4 160 120)">
    <rect x="94" y="30" width="132" height="182" rx="24" fill="#121212" opacity=".12" transform="translate(5 7)"/>
    <rect x="94" y="30" width="132" height="182" rx="24" fill="#fff"/>
    <g transform="translate(112 62)">
      <rect x="0" y="8" width="96" height="56" rx="8" fill="#2E7D32" opacity=".35" transform="rotate(-8 48 36)"/>
      <rect x="0" y="8" width="96" height="56" rx="8" fill="#43A047"/>
      <rect x="6" y="14" width="84" height="44" rx="5" fill="none" stroke="#C8E6C9" stroke-width="2"/>
      <circle cx="48" cy="36" r="14" fill="#C8E6C9"/>
      <text x="48" y="42" font-family="Sora, Arial, sans-serif" font-size="17" font-weight="800" fill="#1B5E20" text-anchor="middle">$</text>
    </g>
    <text x="160" y="176" font-family="Sora, Arial, sans-serif" font-size="20" font-weight="800" fill="#121212" text-anchor="middle">$9.500</text>
    <rect x="124" y="186" width="72" height="16" rx="8" fill="#E8F5E9"/>
    <text x="160" y="197.5" font-family="Plus Jakarta Sans, Arial, sans-serif" font-size="8.5" font-weight="800" fill="#1B5E20" text-anchor="middle">EN EFECTIVO</text>
  </g>
  <g transform="translate(30 150)"><g class="a-ilus-moneda">
    <circle cx="26" cy="30" r="24" fill="#E0A100"/><circle cx="26" cy="26" r="24" fill="#FFD54F"/><circle cx="26" cy="26" r="17" fill="none" stroke="#E0A100" stroke-width="3"/>
    <text x="26" y="33" font-family="Sora, Arial, sans-serif" font-size="20" font-weight="800" fill="#8A5A00" text-anchor="middle">$</text>
  </g></g>
  <g transform="translate(56 196)"><g class="a-ilus-moneda a-ilus-moneda-2">
    <circle cx="18" cy="21" r="16" fill="#E0A100"/><circle cx="18" cy="18" r="16" fill="#FFD54F"/>
    <text x="18" y="23.5" font-family="Sora, Arial, sans-serif" font-size="14" font-weight="800" fill="#8A5A00" text-anchor="middle">$</text>
  </g></g>
  <g transform="translate(236 40)"><g class="a-ilus-moneda a-ilus-moneda-2">
    <circle cx="22" cy="25" r="20" fill="#E0A100"/><circle cx="22" cy="22" r="20" fill="#FFD54F"/>
    <text x="22" y="28" font-family="Sora, Arial, sans-serif" font-size="17" font-weight="800" fill="#8A5A00" text-anchor="middle">$</text>
  </g></g>
</svg>`;
}

// Estado vacío (sin viajes, sin programados…).
export function ilustracionVacia(texto = '') {
  return `<div class="a-vacio">
    <svg viewBox="0 0 200 120" width="200" height="120" aria-hidden="true">
      <ellipse cx="100" cy="108" rx="80" ry="8" fill="#121212" opacity=".06"/>
      <path d="M20 100h160" stroke="#E3E5EA" stroke-width="4" stroke-linecap="round"/>
      <path d="M40 100c20-30 40-40 60-40s40 10 60 40" stroke="#E3E5EA" stroke-width="3" stroke-dasharray="2 8" fill="none" stroke-linecap="round"/>
      <g transform="translate(46 50) scale(.5)">${taxiLateral({ ancho: 220 }).replace(/<svg[^>]*>/, '').replace('</svg>', '')}</g>
    </svg>
    <p>${N.escaparHTML(texto)}</p>
  </div>`;
}

// Sellos de la tarjeta de fidelidad (10 casillas).
export function sellosFidelidad({ completados = 0, meta = 10, siguienteConDescuento = false } = {}) {
  let html = '';
  for (let i = 1; i <= meta; i++) {
    const lleno = siguienteConDescuento || i <= completados;
    html += `<span class="a-sello ${lleno ? 'a-lleno' : ''}" aria-hidden="true">${lleno ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 11.5 6.8 6.8A2 2 0 0 1 8.7 5.5h6.6a2 2 0 0 1 1.9 1.3L19 11.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><rect x="3.5" y="11.5" width="17" height="6" rx="2" fill="currentColor"/></svg>' : i}</span>`;
  }
  html += `<span class="a-sello a-sello-premio ${siguienteConDescuento ? 'a-lleno' : ''}" aria-hidden="true">50&nbsp;%</span>`;
  return `<div class="a-sellos" role="img" aria-label="${siguienteConDescuento ? 'Tu próximo viaje tiene 50 % de descuento' : `${completados} de ${meta} viajes en tu tarjeta`}">${html}</div>`;
}
