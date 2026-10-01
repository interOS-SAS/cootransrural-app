// Diseños de los 5 formatos de sticker en los 3 estilos de color.
// Todas las medidas están en milímetros sobre el tamaño final (corte).
// Lo que toca el borde se extiende EXT mm hacia afuera para el sangrado.
import * as N from '../nucleo/index.js';
import { anchoTexto, altoMayus, tamParaAncho, planQR } from './escena.js';

const EXT = 4;
const E = N.EMPRESA;

// ---------------------------------------------------------------------------
// Estilos de color (combinan con los tres diseños de la app)
// ---------------------------------------------------------------------------
export const ESTILOS = {
  clasico: {
    id: 'clasico',
    nombre: 'Clásico amarillo/negro',
    corto: 'Clásico',
    muestra: ['#FFCC00', '#111111', '#FFFFFF'],
    fondo: '#FFCC00',
    fondoDegradado: null,
    tinta: '#111111',
    tintaSuave: '#3A3000',
    panel: '#111111',
    sobrePanel: '#FFFFFF',
    destacado: '#FFCC00',
    cuadros: ['#111111', '#FFFFFF'],
    tarjeta: '#FFFFFF',
    modulo: '#000000',
    bordeTarjeta: null,
    insignia: '#111111',
    sobreInsignia: '#FFCC00',
    titulo: { familia: 'Sora', peso: 800 },
    negrita: { familia: 'Plus Jakarta Sans', peso: 800 },
    texto: { familia: 'Plus Jakarta Sans', peso: 700 },
    suave: { familia: 'Plus Jakarta Sans', peso: 500 },
  },
  verde: {
    id: 'verde',
    nombre: 'Verde cooperativa',
    corto: 'Verde',
    muestra: ['#0E7A43', '#FFD54A', '#FFFFFF'],
    fondo: '#0B6B3A',
    fondoDegradado: ['#0E7A43', '#05391F'],
    tinta: '#FFFFFF',
    tintaSuave: '#CFEBDC',
    panel: '#05331C',
    sobrePanel: '#FFFFFF',
    destacado: '#FFD54A',
    cuadros: ['#FFD54A', '#05331C'],
    tarjeta: '#FFFFFF',
    modulo: '#04261A',
    bordeTarjeta: null,
    insignia: '#FFD54A',
    sobreInsignia: '#05331C',
    titulo: { familia: 'Plus Jakarta Sans', peso: 800 },
    negrita: { familia: 'Plus Jakarta Sans', peso: 800 },
    texto: { familia: 'Plus Jakarta Sans', peso: 700 },
    suave: { familia: 'Plus Jakarta Sans', peso: 500 },
  },
  neon: {
    id: 'neon',
    nombre: 'Oscuro neón',
    corto: 'Neón',
    muestra: ['#0B1024', '#FFE14D', '#2EE6FF'],
    fondo: '#0B1024',
    fondoDegradado: ['#141B3C', '#070A17'],
    tinta: '#FFFFFF',
    tintaSuave: '#B9C3E6',
    panel: '#05070F',
    sobrePanel: '#FFFFFF',
    destacado: '#FFE14D',
    segundo: '#2EE6FF',
    cuadros: ['#FFE14D', '#05070F'],
    tarjeta: '#FFFFFF',
    modulo: '#070A17',
    bordeTarjeta: '#2EE6FF',
    insignia: '#FFE14D',
    sobreInsignia: '#070A17',
    titulo: { familia: 'Outfit', peso: 800 },
    negrita: { familia: 'Outfit', peso: 700 },
    texto: { familia: 'Outfit', peso: 600 },
    suave: { familia: 'Outfit', peso: 400 },
  },
};

// ---------------------------------------------------------------------------
// Formatos (tamaños reales exactos, en mm)
// ---------------------------------------------------------------------------
export const FORMATOS = {
  taxi: { id: 'taxi', nombre: 'Taxi — vidrio trasero y puertas', corto: 'Vidrio y puertas', ancho: 150, alto: 150, copias: 2, nota: '2 por taxi, uno a cada lado. Alto contraste para leer a 2–3 m.' },
  espaldar: { id: 'espaldar', nombre: 'Taxi — espaldar del asiento', corto: 'Espaldar', ancho: 100, alto: 100, copias: 1, nota: 'El pasajero lo escanea durante el viaje.' },
  iman: { id: 'iman', nombre: 'Imán de nevera', corto: 'Imán de nevera', ancho: 90, alto: 55, copias: 1, nota: 'Horizontal, para la nevera de la casa.' },
  afiche: { id: 'afiche', nombre: 'Afiche para restaurantes, tiendas y conjuntos', corto: 'Afiche', ancho: 140, alto: 216, copias: 1, nota: 'Media carta vertical, con pasos y ofertas.' },
  tarjeta: { id: 'tarjeta', nombre: 'Tarjeta de bolsillo / volante', corto: 'Tarjeta', ancho: 90, alto: 50, copias: 1, nota: 'Para entregar en la mano.' },
};

export function medidaTexto(f) {
  const cm = (mm) => String(mm / 10).replace('.', ',');
  return `${cm(f.ancho)} × ${cm(f.alto)} cm`;
}

// ---------------------------------------------------------------------------
// Ayudas de dibujo
// ---------------------------------------------------------------------------
const tramo = (texto, estilo, tam, color, espaciadoEm = 0) => ({ texto, familia: estilo.familia, peso: estilo.peso, tam, color, espaciado: espaciadoEm * tam });

function texto(x, y, cadena, estilo, tam, color, { alinear = 'izq', espaciadoEm = 0, rotar = 0 } = {}) {
  return { t: 'texto', x, y, alinear, rotar, tramos: [tramo(cadena, estilo, tam, color, espaciadoEm)] };
}

// Texto ajustado a un ancho máximo (reduce la letra si no cabe).
function textoAjustado(x, y, cadena, estilo, tamMax, anchoMax, color, opciones = {}) {
  const tam = tamParaAncho(cadena, { ...estilo, espaciadoEm: opciones.espaciadoEm || 0 }, anchoMax, tamMax);
  return { op: texto(x, y, cadena, estilo, tam, color, opciones), tam };
}

// Parte un texto en renglones que quepan en `anchoMax`.
function envolver(cadena, estilo, tam, anchoMax) {
  const palabras = cadena.split(/\s+/);
  const renglones = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (actual && anchoTexto(prueba, { ...estilo, tam }) > anchoMax) {
      renglones.push(actual);
      actual = p;
    } else actual = prueba;
  }
  if (actual) renglones.push(actual);
  return renglones;
}

function parrafo(x, y, cadena, estilo, tam, color, anchoMax, interlineado = 1.32, alinear = 'izq') {
  const lineas = envolver(cadena, estilo, tam, anchoMax);
  return { ops: lineas.map((l, i) => texto(x, y + i * tam * interlineado, l, estilo, tam, color, { alinear })), alto: lineas.length * tam * interlineado, lineas: lineas.length };
}

const ancho = (cadena, estilo, tam, espaciadoEm = 0) => anchoTexto(cadena, { ...estilo, tam, espaciado: espaciadoEm * tam });

// Línea base para centrar verticalmente mayúsculas en una franja [y, y+h].
const baseCentrada = (y, h, estilo, tam) => y + h / 2 + (altoMayus(estilo.familia, estilo.peso) * tam) / 2;

function fondo(est, w, h) {
  const relleno = est.fondoDegradado ? { tipo: 'lineal', x1: 0, y1: 0, x2: w * 0.35, y2: h, paradas: [[0, est.fondoDegradado[0]], [1, est.fondoDegradado[1]]] } : est.fondo;
  const ops = [{ t: 'rect', x: -EXT, y: -EXT, w: w + 2 * EXT, h: h + 2 * EXT, relleno }];
  if (est.id === 'neon') {
    // Brillos suaves de neón detrás (se imprimen bien: son degradados, no filtros).
    ops.push({ t: 'circulo', cx: w * 0.92, cy: h * 0.08, r: Math.max(w, h) * 0.55, relleno: { tipo: 'radial', cx: w * 0.92, cy: h * 0.08, r: Math.max(w, h) * 0.55, paradas: [[0, '#2EE6FF', 0.22], [1, '#2EE6FF', 0]] } });
    ops.push({ t: 'circulo', cx: w * 0.05, cy: h * 0.95, r: Math.max(w, h) * 0.5, relleno: { tipo: 'radial', cx: w * 0.05, cy: h * 0.95, r: Math.max(w, h) * 0.5, paradas: [[0, '#FF3DA5', 0.16], [1, '#FF3DA5', 0]] } });
  }
  if (est.id === 'verde') {
    ops.push({ t: 'circulo', cx: w * 0.95, cy: -h * 0.05, r: Math.max(w, h) * 0.6, relleno: { tipo: 'radial', cx: w * 0.95, cy: -h * 0.05, r: Math.max(w, h) * 0.6, paradas: [[0, '#FFFFFF', 0.12], [1, '#FFFFFF', 0]] } });
  }
  return ops;
}

// Franja de cuadros de taxi (ajedrez) con cuadros de `lado` mm. La grilla se
// alinea con x = 0 y con `anclaY`, así los cuadros calzan con el corte.
function cuadros(x, y, w, h, lado, [a, b], { desfase = 0, anclaY = y, anclaX = 0 } = {}) {
  const ops = [{ t: 'rect', x, y, w, h, relleno: b }];
  const c0 = Math.floor((x - anclaX) / lado);
  const c1 = Math.ceil((x + w - anclaX) / lado);
  const f0 = Math.floor((y - anclaY) / lado);
  const f1 = Math.ceil((y + h - anclaY) / lado);
  for (let f = f0; f < f1; f++) {
    for (let c = c0; c < c1; c++) {
      if ((((f + c + desfase) % 2) + 2) % 2 === 0) ops.push({ t: 'rect', x: anclaX + c * lado, y: anclaY + f * lado, w: lado + 0.02, h: lado + 0.02, relleno: a });
    }
  }
  return { t: 'grupo', recorte: { x, y, w, h }, ops };
}

// Tarjeta blanca con el QR. `lado` incluye la zona silenciosa (4 módulos).
function tarjetaQR(est, x, y, lado, url, nivel, r = 2.5, { doble = true } = {}) {
  const ops = [];
  if (est.bordeTarjeta) {
    // Contorno de neón por fuera de la zona silenciosa (no la invade).
    const g = doble ? 0.9 : 0.6;
    const d = doble ? 1.6 : 1.1;
    ops.push({ t: 'rect', x: x - d, y: y - d, w: lado + 2 * d, h: lado + 2 * d, r: r + d, relleno: null, trazo: est.bordeTarjeta, grosor: g });
    if (doble) ops.push({ t: 'rect', x: x - 3.1, y: y - 3.1, w: lado + 6.2, h: lado + 6.2, r: r + 3.1, relleno: null, trazo: est.bordeTarjeta, grosor: 0.35, opacidad: 0.45 });
  }
  ops.push({ t: 'rect', x, y, w: lado, h: lado, r, relleno: est.tarjeta });
  ops.push({ t: 'qr', x, y, lado, texto: url, nivel, margen: 4, color: est.modulo, fondo: null });
  return ops;
}

// Íconos en caja de 24 × 24.
const ICONOS = {
  // «call» de Material Icons (Apache 2.0).
  telefono: 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z',
  // Cámara / escanear: cuatro esquinas.
  escanear: 'M3 9V5a2 2 0 0 1 2-2h4v2.2H5.2V9H3zm12-6h4a2 2 0 0 1 2 2v4h-2.2V5.2H15V3zM3 15h2.2v3.8H9V21H5a2 2 0 0 1-2-2v-4zm15.8 0H21v4a2 2 0 0 1-2 2h-4v-2.2h3.8V15zM7 11h10v2H7z',
  calendario: 'M7 2h2v2h6V2h2v2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zM5 9v10h14V9H5zm2 2h4v4H7v-4z',
  regalo: 'M20 7h-2.2c.13-.3.2-.64.2-1a3 3 0 0 0-5.5-1.66L12 5l-.5-.66A3 3 0 0 0 6 6c0 .36.07.7.2 1H4a1 1 0 0 0-1 1v3h8V8h2v3h8V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm6 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zM4 13h7v8H5a1 1 0 0 1-1-1v-7zm9 0h7v7a1 1 0 0 1-1 1h-6v-8z',
};

function icono(nombre, x, y, lado, relleno) {
  return { t: 'ruta', d: ICONOS[nombre], x, y, escala: lado / 24, relleno };
}

function reloj(cx, cy, r, color, grosor) {
  return [
    { t: 'circulo', cx, cy, r, relleno: null, trazo: color, grosor },
    { t: 'linea', x1: cx, y1: cy, x2: cx, y2: cy - r * 0.55, trazo: color, grosor, punta: 'round' },
    { t: 'linea', x1: cx, y1: cy, x2: cx + r * 0.45, y2: cy + r * 0.2, trazo: color, grosor, punta: 'round' },
  ];
}

function estrella(cx, cy, rExt, relleno) {
  const rInt = rExt * 0.45;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rExt : rInt;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'}${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`;
  }
  return { t: 'ruta', d: d + 'Z', relleno, trazo: relleno, grosor: rExt * 0.12, punta: 'round' };
}

// Ícono de la app. Sobre fondos oscuros lleva un filo claro para que no se pierda.
function iconoApp(est, x, y, lado) {
  const ops = [];
  if (est.id !== 'clasico') {
    const g = Math.max(0.35, lado * 0.025);
    ops.push({ t: 'rect', x: x - g, y: y - g, w: lado + 2 * g, h: lado + 2 * g, r: lado * 0.219 + g, relleno: est.id === 'neon' ? est.segundo : '#FFFFFF', opacidad: est.id === 'neon' ? 0.9 : 0.85 });
  }
  ops.push({ t: 'imagen', src: 'icono', x, y, w: lado, h: lado });
  return ops;
}

// Lado del QR (con zona silenciosa) para que los módulos midan al menos `codigoMin` mm.
function ladoPara(url, codigoMin, ladoMin, nivel = 'Q') {
  const { n } = planQR(url, 100, { preferido: nivel });
  return Math.max(ladoMin, (codigoMin * (n + 8)) / n);
}

// ---------------------------------------------------------------------------
// 1. Taxi — vidrio trasero y puertas (15 × 15 cm)
// ---------------------------------------------------------------------------
function disenoTaxi({ est, url, movil }) {
  const W = 150;
  const H = 150;
  const M = 6;
  const ops = [...fondo(est, W, H)];

  // Franja de cuadros arriba (2 filas de 3,5 mm; sigue en el sangrado).
  ops.push(cuadros(-EXT, -EXT, W + 2 * EXT, 7 + EXT, 3.5, est.cuadros, { anclaY: 0, desfase: 1 }));

  // Titular a todo lo ancho.
  const tit = textoAjustado(W / 2, 18.6, '¡Pide tu taxi con la app!', est.titulo, 11, W - 2 * M, est.tinta, { alinear: 'centro', espaciadoEm: -0.012 });
  ops.push(tit.op);

  // QR: los módulos ocupan al menos 9 cm de lado (sin contar la zona silenciosa).
  const yQR = 23;
  // Nivel Q; si la URL es tan corta que la zona silenciosa no deja llegar a 9 cm,
  // se usa H (más módulos y aún más corrección de errores).
  const nivelTaxi = ladoPara(url, 90, 104, 'Q') <= 110 ? 'Q' : 'H';
  const lado = Math.min(110, ladoPara(url, 90.5, 104, nivelTaxi));
  const plan = planQR(url, lado, { moduloMin: 1.2, preferido: nivelTaxi });
  ops.push(...tarjetaQR(est, M, yQR, lado, url, plan.nivel, 3));
  const yFinQR = yQR + lado;

  // Carril derecho: ícono, móvil y «Escanéame».
  const xc = M + lado + 4;
  const wc = W - M - xc;
  const cx = xc + wc / 2;
  const icon = Math.min(wc, 26);
  ops.push(...iconoApp(est, cx - icon / 2, yQR, icon));

  // «Escanéame» con flecha hacia el QR, alineado con el borde inferior del QR.
  const hPill = 20;
  const yPill = yFinQR - hPill;
  ops.push({ t: 'rect', x: xc, y: yPill, w: wc, h: hPill, r: 3, relleno: est.insignia });
  ops.push({ t: 'ruta', d: 'M9 2 2 9l7 7M2.6 9H20', x: cx - 5.8, y: yPill + 2.7, escala: 0.58, relleno: null, trazo: est.sobreInsignia, grosor: 3.1, punta: 'round' });
  ops.push(textoAjustado(cx, yPill + hPill - 4.2, 'ESCANÉAME', est.titulo, 4.6, wc - 3.6, est.sobreInsignia, { alinear: 'centro', espaciadoEm: 0.04 }).op);

  // Tarjeta del móvil (o del servicio 24 h si no se imprime el número).
  const libreIni = yQR + icon + 4;
  const libreFin = yPill - 4;
  const hMov = Math.min(libreFin - libreIni, 38);
  const yMov = libreIni + (libreFin - libreIni - hMov) / 2;
  ops.push({ t: 'rect', x: xc, y: yMov, w: wc, h: hMov, r: 3, relleno: est.tarjeta });
  if (est.bordeTarjeta) ops.push({ t: 'rect', x: xc, y: yMov, w: wc, h: hMov, r: 3, relleno: null, trazo: est.bordeTarjeta, grosor: 0.6 });
  const tintaTarjeta = est.id === 'clasico' ? '#111111' : est.modulo;
  const etiqueta = movil ? 'MÓVIL' : 'SERVICIO';
  const grande = movil || '24 h';
  const tamEt = Math.min(4, (wc - 6) / (anchoTexto(etiqueta, { ...est.negrita, tam: 1 }) + 0.16 * (etiqueta.length - 1)));
  const tamNum = tamParaAncho(grande, { ...est.titulo, espaciadoEm: -0.03 }, wc - 3.4, 17);
  const altoNum = altoMayus(est.titulo.familia, est.titulo.peso) * tamNum;
  const altoBloque = altoMayus(est.negrita.familia, est.negrita.peso) * tamEt + 4.2 + altoNum;
  const yBloque = yMov + (hMov - altoBloque) / 2;
  ops.push(texto(cx, yBloque + altoMayus(est.negrita.familia, est.negrita.peso) * tamEt, etiqueta, est.negrita, tamEt, tintaTarjeta, { alinear: 'centro', espaciadoEm: 0.16 }));
  ops.push(texto(cx, yBloque + altoBloque, grande, est.titulo, tamNum, tintaTarjeta, { alinear: 'centro', espaciadoEm: -0.03 }));

  // Pie: central telefónica 24 horas.
  const yBanda = yFinQR + 3.5;
  const hBanda = H - yBanda;
  ops.push({ t: 'rect', x: -EXT, y: yBanda, w: W + 2 * EXT, h: hBanda + EXT, relleno: est.panel });
  if (est.id !== 'clasico') ops.push({ t: 'rect', x: -EXT, y: yBanda, w: W + 2 * EXT, h: 0.8, relleno: est.destacado });
  const cyB = yBanda + hBanda / 2 + (est.id !== 'clasico' ? 0.4 : 0);
  const rIco = Math.min(5.4, hBanda / 2 - 2);
  ops.push({ t: 'circulo', cx: M + rIco, cy: cyB, r: rIco, relleno: est.destacado });
  ops.push(icono('telefono', M + rIco - rIco * 0.6, cyB - rIco * 0.6, rIco * 1.2, est.panel));
  const xTel = M + rIco * 2 + 3.4;
  const tamTel = Math.min(7.6, (hBanda - 4) * 0.62);
  const tamEtTel = Math.min(2.7, tamTel * 0.37);
  const altoTel = altoMayus(est.titulo.familia, est.titulo.peso) * tamTel;
  const altoEtTel = altoMayus(est.negrita.familia, est.negrita.peso) * tamEtTel;
  const yTexto = cyB - (altoTel + altoEtTel + 2.2) / 2;
  ops.push(texto(xTel, yTexto + altoEtTel, 'CENTRAL 24 HORAS', est.negrita, tamEtTel, est.sobrePanel, { espaciadoEm: 0.16 }));
  ops.push(texto(xTel, yTexto + altoEtTel + 2.2 + altoTel, E.telefonoVisible, est.titulo, tamTel, est.destacado, { espaciadoEm: 0.01 }));
  const tamMarca = Math.min(4.8, tamTel * 0.62);
  const altoMarca = altoMayus(est.titulo.familia, est.titulo.peso) * tamMarca;
  ops.push(texto(W - M, yTexto + altoMarca, E.nombre, est.titulo, tamMarca, est.sobrePanel, { alinear: 'der' }));
  ops.push(texto(W - M, yTexto + altoEtTel + 2.2 + altoTel, 'EL ROSAL · CUND.', est.negrita, tamEtTel, est.destacado, { alinear: 'der', espaciadoEm: 0.14 }));

  return { ancho: W, alto: H, ops, qr: { nivel: plan.nivel, lado, modulos: plan.n } };
}

// ---------------------------------------------------------------------------
// 2. Taxi — espaldar del asiento (10 × 10 cm)
// ---------------------------------------------------------------------------
function disenoEspaldar({ est, url, movil }) {
  const W = 100;
  const H = 100;
  const M = 6;
  const ops = [...fondo(est, W, H)];

  // Encabezado oscuro.
  const hEnc = 25;
  ops.push({ t: 'rect', x: -EXT, y: -EXT, w: W + 2 * EXT, h: hEnc + EXT, relleno: est.panel });
  const t1 = textoAjustado(M, 11.4, 'Descarga la app', est.titulo, 8.4, W - 2 * M, est.destacado, { espaciadoEm: -0.01 });
  ops.push(t1.op);
  ops.push(textoAjustado(M, 19.6, 'y califica tu viaje', est.titulo, t1.tam * 0.78, W - 2 * M, est.sobrePanel, { espaciadoEm: -0.01 }).op);
  ops.push(cuadros(-EXT, hEnc, W + 2 * EXT, 4, 2, est.cuadros));

  // QR.
  const lado = 56;
  const plan = planQR(url, lado, { moduloMin: 0.75 });
  const yQR = hEnc + 4 + 4;
  ops.push(...tarjetaQR(est, M, yQR, lado, url, plan.nivel, 2.4, { doble: false }));
  ops.push(texto(M + lado / 2, yQR + lado + 5.4, 'ESCANÉAME CON LA CÁMARA', est.negrita, 2.5, est.tinta, { alinear: 'centro', espaciadoEm: 0.12 }));

  // Carril derecho.
  const xc = M + lado + 4;
  const wc = W - M - xc;
  const cx = xc + wc / 2;
  let y = yQR + 0.6;
  if (movil) {
    ops.push(texto(cx, y + 3.2, 'MÓVIL', est.negrita, 3.1, est.tinta, { alinear: 'centro', espaciadoEm: 0.16 }));
    ops.push(textoAjustado(cx, y + 14, movil, est.titulo, 11.5, wc, est.tinta, { alinear: 'centro', espaciadoEm: -0.02 }).op);
    y += 20;
  } else {
    y += 2;
  }
  // Cinco estrellas.
  const rE = Math.min(2.6, wc / 10.6);
  for (let i = 0; i < 5; i++) ops.push(estrella(cx + (i - 2) * rE * 2.1, y + rE, rE, est.id === 'clasico' ? est.tinta : est.destacado));
  y += rE * 2 + 5;
  ops.push(...parrafo(cx, y, 'Tu opinión nos ayuda a cuidarte', est.texto, 2.85, est.tinta, wc, 1.3, 'centro').ops);
  const icon = Math.min(wc - 8, 14);
  ops.push(...iconoApp(est, cx - icon / 2, yQR + lado - icon, icon));

  return { ancho: W, alto: H, ops, qr: { nivel: plan.nivel, lado, modulos: plan.n } };
}

// ---------------------------------------------------------------------------
// 3. Imán de nevera (9 × 5,5 cm, horizontal)
// ---------------------------------------------------------------------------
function disenoIman({ est, url, movil }) {
  const W = 90;
  const H = 55;
  const M = 4.5;
  const ops = [...fondo(est, W, H)];

  // Panel oscuro a la derecha con el QR.
  const xPanel = 49;
  ops.push({ t: 'rect', x: xPanel, y: -EXT, w: W - xPanel + EXT, h: H + 2 * EXT, relleno: est.panel });
  ops.push(cuadros(xPanel - 2.4, -EXT, 2.4, H + 2 * EXT, 1.2, est.cuadros, { anclaY: 0, anclaX: xPanel - 2.4 }));
  const lado = 37;
  const plan = planQR(url, lado, { moduloMin: 0.55 });
  const xQR = xPanel + (W - xPanel - lado) / 2 + 0.2;
  const yQR = 4.2;
  ops.push(...tarjetaQR(est, xQR, yQR, lado, url, plan.nivel, 2, { doble: false }));
  const cxP = xQR + lado / 2;
  ops.push(texto(cxP, yQR + lado + 5.4, 'ESCANÉAME', est.titulo, 3.6, est.destacado, { alinear: 'centro', espaciadoEm: 0.1 }));
  if (movil) ops.push(texto(cxP, yQR + lado + 9.9, `MÓVIL ${movil}`, est.negrita, 2.4, est.sobrePanel, { alinear: 'centro', espaciadoEm: 0.14 }));

  // Marca.
  const ic = 8;
  ops.push(...iconoApp(est, M, M - 0.5, ic));
  ops.push(texto(M + ic + 2, M + 3.4, E.nombre, est.titulo, 3.4, est.tinta));
  ops.push(texto(M + ic + 2, M + 6.9, 'EL ROSAL', est.texto, 2.0, est.id === 'clasico' ? est.tintaSuave : est.destacado, { espaciadoEm: 0.2 }));

  // Titular.
  const anchoTexto1 = xPanel - 2.4 - M - 3;
  const t1 = textoAjustado(M, 23.2, 'Tu taxi', est.titulo, 8.4, anchoTexto1, est.tinta, { espaciadoEm: -0.02 });
  ops.push(t1.op);
  ops.push(textoAjustado(M, 31.4, 'a un toque', est.titulo, t1.tam, anchoTexto1, est.tinta, { espaciadoEm: -0.02 }).op);

  // Teléfono en píldora.
  const yTel = 35.2;
  const hTel = 8;
  ops.push({ t: 'rect', x: M, y: yTel, w: anchoTexto1, h: hTel, r: hTel / 2, relleno: est.insignia });
  ops.push(icono('telefono', M + 2.2, yTel + 1.9, 4.2, est.sobreInsignia));
  ops.push(textoAjustado(M + 7.6, baseCentrada(yTel, hTel, est.titulo, 4.2), E.telefonoVisible, est.titulo, 4.2, anchoTexto1 - 10, est.sobreInsignia).op);

  // Servicio 24 horas.
  ops.push(...reloj(M + 1.9, 49.3, 1.75, est.tinta, 0.5));
  ops.push(texto(M + 5.3, 50.4, 'Servicio 24 horas', est.negrita, 3.1, est.tinta));

  return { ancho: W, alto: H, ops, qr: { nivel: plan.nivel, lado, modulos: plan.n } };
}

// ---------------------------------------------------------------------------
// 4. Afiche media carta vertical (14 × 21,6 cm)
// ---------------------------------------------------------------------------
function disenoAfiche({ est, url, movil }) {
  const W = 140;
  const H = 216;
  const M = 10;
  const ops = [...fondo(est, W, H)];

  // Encabezado con la marca.
  const hEnc = 26;
  ops.push({ t: 'rect', x: -EXT, y: -EXT, w: W + 2 * EXT, h: hEnc + EXT, relleno: est.panel });
  const ic = 16;
  ops.push(...iconoApp(est, M, (hEnc - ic) / 2, ic));
  ops.push(texto(M + ic + 4, 12.9, E.nombre, est.titulo, 6.8, est.sobrePanel, { espaciadoEm: -0.01 }));
  ops.push(texto(M + ic + 4, 19.2, E.lema, est.texto, 3.3, est.destacado));
  const rB = 7.6;
  ops.push({ t: 'circulo', cx: W - M - rB, cy: hEnc / 2, r: rB, relleno: est.destacado });
  ops.push(texto(W - M - rB, hEnc / 2 + 1.2, '24 h', est.titulo, 4.9, est.panel, { alinear: 'centro' }));
  ops.push(texto(W - M - rB, hEnc / 2 + 4.4, 'SERVICIO', est.negrita, 1.6, est.panel, { alinear: 'centro', espaciadoEm: 0.12 }));
  ops.push(cuadros(-EXT, hEnc, W + 2 * EXT, 5, 2.5, est.cuadros));

  // Titular.
  const t1 = textoAjustado(M, 0, 'Pide tu taxi', est.titulo, 15, W - 2 * M, est.tinta, { espaciadoEm: -0.025 });
  const tam = t1.tam;
  const yT = hEnc + 5 + 5.2 + altoMayus(est.titulo.familia, est.titulo.peso) * tam;
  t1.op.y = yT;
  ops.push(t1.op);
  // «con la app» resaltado en una franja.
  const w2 = ancho('con la app', est.titulo, tam, -0.025);
  const yR = yT + 4.4;
  const hR = tam * 1.1;
  ops.push({ t: 'rect', x: M - 2.2, y: yR, w: w2 + 4.8, h: hR, r: 2.2, relleno: est.insignia });
  ops.push(texto(M, baseCentrada(yR, hR, est.titulo, tam), 'con la app', est.titulo, tam, est.sobreInsignia, { espaciadoEm: -0.025 }));
  if (movil) {
    // Móvil que recomienda (a la derecha de la franja).
    const xD = W - M;
    const cyR = yR + hR / 2;
    ops.push(texto(xD, cyR - 1.4, 'TE LO RECOMIENDA', est.negrita, 2.1, est.tinta, { alinear: 'der', espaciadoEm: 0.12 }));
    ops.push(texto(xD, cyR + 5, `MÓVIL ${movil}`, est.titulo, 4.8, est.tinta, { alinear: 'der' }));
  }
  const sub = parrafo(M, yR + hR + 7.2, 'Tu ubicación exacta por GPS, el móvil correcto en tu puerta y la tarifa clara antes de salir.', est.suave, 3.6, est.tinta, W - 2 * M, 1.36);
  ops.push(...sub.ops);

  // QR y pasos.
  const yQR = yR + hR + 7.2 + sub.alto + 1.6;
  const lado = 60;
  const plan = planQR(url, lado, { moduloMin: 0.8 });
  ops.push(...tarjetaQR(est, M, yQR, lado, url, plan.nivel, 2.6));
  const hEsc = 7.6;
  const yEsc = yQR + lado + 2.6;
  ops.push({ t: 'rect', x: M, y: yEsc, w: lado, h: hEsc, r: hEsc / 2, relleno: est.insignia });
  const tamEsc = 3.3;
  const wEsc = ancho('ESCANÉAME', est.titulo, tamEsc, 0.1) + 6.2;
  ops.push(icono('escanear', M + lado / 2 - wEsc / 2, yEsc + (hEsc - 4.4) / 2, 4.4, est.sobreInsignia));
  ops.push(texto(M + lado / 2 - wEsc / 2 + 6.2, baseCentrada(yEsc, hEsc, est.titulo, tamEsc), 'ESCANÉAME', est.titulo, tamEsc, est.sobreInsignia, { espaciadoEm: 0.1 }));

  const xP = M + lado + 7;
  const pasos = [
    ['Escanea el código', 'Descarga la app gratis y regístrate en un minuto.'],
    ['Marca tu destino', 'Tu ubicación GPS le llega sola al conductor.'],
    ['Sube tranquilo', 'Verifica móvil, placa y tu código de 4 dígitos.'],
  ];
  const altoPaso = (lado + 2.6 + hEsc) / 3;
  pasos.forEach(([titulo, detalle], i) => {
    const yP = yQR + i * altoPaso + 0.6;
    const r = 4.3;
    ops.push({ t: 'circulo', cx: xP + r, cy: yP + r, r, relleno: est.insignia });
    ops.push(texto(xP + r, baseCentrada(yP, 2 * r, est.titulo, 4.5), String(i + 1), est.titulo, 4.5, est.sobreInsignia, { alinear: 'centro' }));
    const xT = xP + 2 * r + 3;
    const wT = W - M - xT;
    ops.push(textoAjustado(xT, yP + 5.4, titulo, est.negrita, 3.9, wT, est.tinta).op);
    ops.push(...parrafo(xT, yP + 10.4, detalle, est.suave, 2.9, est.tinta, wT, 1.3).ops);
  });

  // Ofertas.
  const yO = yEsc + hEsc + 8.6;
  const etiquetaO = 'OFERTAS DE LA COOPERATIVA';
  const wEt = ancho(etiquetaO, est.negrita, 2.9, 0.16);
  ops.push(texto(M, yO, etiquetaO, est.negrita, 2.9, est.tinta, { espaciadoEm: 0.16 }));
  ops.push({ t: 'rect', x: M + wEt + 3, y: yO - 1.25, w: W - 2 * M - wEt - 3, h: 0.45, relleno: est.tinta, opacidad: 0.45 });
  const yC = yO + 3.4;
  const hC = 23.5;
  const wC = (W - 2 * M - 5) / 2;
  const ofertas = [
    { grande: '−10 %', icono: 'calendario', texto: 'Programa tu viaje con 24 horas de anticipación.' },
    { grande: '50 %', icono: 'regalo', texto: 'Cada 10 viajes, el siguiente a mitad de precio.' },
  ];
  ofertas.forEach((o, i) => {
    const x = M + i * (wC + 5);
    ops.push({ t: 'rect', x, y: yC, w: wC, h: hC, r: 3, relleno: est.panel });
    if (est.bordeTarjeta) ops.push({ t: 'rect', x, y: yC, w: wC, h: hC, r: 3, relleno: null, trazo: i ? '#FF3DA5' : est.bordeTarjeta, grosor: 0.5 });
    ops.push(icono(o.icono, x + wC - 9.4, yC + 3.4, 5.8, est.destacado));
    ops.push(texto(x + 4, yC + 10.8, o.grande, est.titulo, 8.4, est.destacado, { espaciadoEm: -0.02 }));
    ops.push(...parrafo(x + 4, yC + 16.2, o.texto, est.texto, 2.7, est.sobrePanel, wC - 8, 1.3).ops);
  });

  // Pie de contacto.
  const yPie = yC + hC + 5;
  ops.push({ t: 'rect', x: M, y: yPie, w: W - 2 * M, h: 0.4, relleno: est.tinta, opacidad: 0.3 });
  const yL = yPie + 8.2;
  ops.push({ t: 'circulo', cx: M + 4.2, cy: yL - 2, r: 4.2, relleno: est.insignia });
  ops.push(icono('telefono', M + 1.7, yL - 4.5, 5, est.sobreInsignia));
  ops.push(texto(M + 11, yL - 3.6, 'CENTRAL Y WHATSAPP · 24 HORAS', est.negrita, 2.1, est.tinta, { espaciadoEm: 0.12 }));
  ops.push(texto(M + 11, yL + 2.3, E.telefonoVisible, est.titulo, 5.4, est.tinta));
  ops.push(texto(W - M, yL - 3.6, E.correo, est.texto, 2.4, est.tinta, { alinear: 'der' }));
  ops.push(texto(W - M, yL - 0.1, 'Cra. 8 No. 12-38, San Carlos', est.suave, 2.4, est.tinta, { alinear: 'der' }));
  ops.push(texto(W - M, yL + 3.4, 'El Rosal, Cundinamarca', est.suave, 2.4, est.tinta, { alinear: 'der' }));

  return { ancho: W, alto: H, ops, qr: { nivel: plan.nivel, lado, modulos: plan.n }, finContenido: yL + 4.5 };
}

// ---------------------------------------------------------------------------
// 5. Tarjeta de bolsillo / volante (9 × 5 cm)
// ---------------------------------------------------------------------------
function disenoTarjeta({ est, url, movil }) {
  const W = 90;
  const H = 50;
  const M = 4.5;
  const ops = [...fondo(est, W, H)];

  // Franja de cuadros abajo.
  ops.push(cuadros(-EXT, H - 3.6, W + 2 * EXT, 3.6 + EXT, 1.8, est.cuadros, { anclaY: H - 3.6 }));

  // QR a la derecha.
  const lado = 34;
  const plan = planQR(url, lado, { moduloMin: 0.5 });
  const xQR = W - M - lado;
  const yQR = 3.6;
  ops.push(...tarjetaQR(est, xQR, yQR, lado, url, plan.nivel, 1.8, { doble: false }));
  ops.push(texto(xQR + lado / 2, yQR + lado + 4.4, movil ? `ESCANÉAME · MÓVIL ${movil}` : 'ESCANÉAME', est.negrita, 2.25, est.tinta, { alinear: 'centro', espaciadoEm: 0.12 }));

  // Marca.
  const wIzq = xQR - M - 4;
  const ic = 7.4;
  ops.push(...iconoApp(est, M, M - 0.6, ic));
  ops.push(texto(M + ic + 1.8, M + 2.9, E.nombre, est.titulo, 3.2, est.tinta));
  ops.push(textoAjustado(M + ic + 1.8, M + 6.1, E.lema, est.suave, 1.95, wIzq - ic - 1.8, est.id === 'clasico' ? est.tinta : est.destacado).op);

  // Titular.
  const t1 = textoAjustado(M, 20.4, 'Pide tu taxi', est.titulo, 6.6, wIzq, est.tinta, { espaciadoEm: -0.02 });
  ops.push(t1.op);
  ops.push(textoAjustado(M, 27.2, 'con la app', est.titulo, t1.tam, wIzq, est.tinta, { espaciadoEm: -0.02 }).op);

  // Teléfono.
  const yTel = 31;
  const hTel = 7;
  ops.push({ t: 'rect', x: M, y: yTel, w: wIzq, h: hTel, r: hTel / 2, relleno: est.insignia });
  ops.push(icono('telefono', M + 2, yTel + 1.7, 3.6, est.sobreInsignia));
  ops.push(textoAjustado(M + 6.8, baseCentrada(yTel, hTel, est.titulo, 3.7), E.telefonoVisible, est.titulo, 3.7, wIzq - 9, est.sobreInsignia).op);
  ops.push(...reloj(M + 1.5, 42.2, 1.35, est.tinta, 0.4));
  ops.push(texto(M + 4.2, 43.1, 'Servicio 24 horas · El Rosal', est.texto, 2.3, est.tinta));

  return { ancho: W, alto: H, ops, qr: { nivel: plan.nivel, lado, modulos: plan.n } };
}

const DISENOS = { taxi: disenoTaxi, espaldar: disenoEspaldar, iman: disenoIman, afiche: disenoAfiche, tarjeta: disenoTarjeta };

// Crea la escena de un sticker.
// `movil`: texto del número a imprimir ('' = no imprimir); `url`: contenido del QR.
export function crearEscena(formato, estilo, { url, movil = '' }) {
  const est = ESTILOS[estilo] || ESTILOS.clasico;
  const escena = DISENOS[formato]({ est, url, movil });
  escena.formato = formato;
  escena.estilo = est.id;
  escena.url = url;
  escena.movil = movil;
  return escena;
}

