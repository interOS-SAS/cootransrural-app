// Diseños de los 5 formatos de sticker en los estilos de color. Todos dicen
// «Pide tu taxi con TaxiCun» (la app, desarrollada por interOS), llevan el
// ícono de TaxiCun y el nombre de la cooperativa.
// Todas las medidas están en milímetros sobre el tamaño final (corte).
// Lo que toca el borde se extiende EXT mm hacia afuera para el sangrado.
// Los datos (nombre, lema, teléfono, pueblo, ofertas) salen de la ficha de la
// cooperativa activa (empresas/<id>/ficha.json): lo que falte no se imprime.
import * as N from '../nucleo/index.js';
import { anchoTexto, altoMayus, tamParaAncho, planQR } from './escena.js';

const EXT = 4;
const E = N.EMPRESA;
const T = N.TARIFAS || {};
const ES_PRINCIPAL = N.ID_EMPRESA === 'cootransrural';
// «cooperativa» o «empresa» (ver nucleo/config.js).
const TIPO = N.TIPO_EMPRESA || 'cooperativa';

// ---------------------------------------------------------------------------
// Datos de la cooperativa, ya listos para imprimir
// ---------------------------------------------------------------------------
const limpio = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());
const sinTildes = (t) => limpio(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digitos = (t) => limpio(t).replace(/\D/g, '');

// «3209042977» → «320 904 2977»; «573125847257» → «312 584 7257».
function telefonoVisible(numero) {
  let d = digitos(numero);
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
  if (d.length === 10) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  if (d.length === 7) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return d;
}

const ABREVIATURAS_DEPTO = { cundinamarca: 'Cund.', boyaca: 'Boy.', antioquia: 'Ant.', tolima: 'Tol.', santander: 'Sant.', 'valle del cauca': 'Valle' };

export const DATOS = (() => {
  const pueblo = limpio(E.pueblo) || limpio(E.municipio).split(',')[0].trim();
  const depto = limpio(E.municipio).split(',').slice(1).join(',').trim();
  const deptoCorto = ABREVIATURAS_DEPTO[sinTildes(depto)] || depto;

  // Teléfono de la central y WhatsApp (pueden faltar los dos).
  const tel = limpio(E.telefonoVisible) || telefonoVisible(E.telefono);
  const wa = digitos(E.whatsapp);
  const mismoWhatsApp = Boolean(tel && wa && wa.endsWith(digitos(E.telefono || E.telefonoVisible)));
  let contacto = null;
  if (tel) contacto = { numero: tel, etiqueta: 'CENTRAL', conWhatsApp: mismoWhatsApp };
  else if (wa) contacto = { numero: telefonoVisible(wa), etiqueta: 'WHATSAPP', conWhatsApp: false };

  // Dirección corta: «Carrera 8 No. 12-38, Barrio San Carlos, El Rosal, Cundinamarca» → «Cra. 8 No. 12-38, San Carlos».
  const fuera = new Set([sinTildes(pueblo), sinTildes(depto)]);
  const direccion = limpio(E.direccion)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && !fuera.has(sinTildes(s)))
    .join(', ')
    .replace(/^Carrera\b/i, 'Cra.')
    .replace(/^Calle\b/i, 'Cl.')
    .replace(/^Avenida\b/i, 'Av.')
    .replace(/^Transversal\b/i, 'Tv.')
    .replace(/^Diagonal\b/i, 'Dg.')
    .replace(/\bBarrio\s+/i, '');

  // Ofertas de la app (de las tarifas de la cooperativa).
  const pct = (x) => `${Math.round(x * 100)} %`;
  const ofertas = [];
  if (T.descuentoProgramado > 0 && T.horasAnticipacion > 0) {
    ofertas.push({ grande: `−${pct(T.descuentoProgramado)}`, icono: 'calendario', texto: `Programa tu viaje con ${T.horasAnticipacion} horas de anticipación.` });
  }
  if (T.viajesFidelidad > 0 && T.descuentoFidelidad > 0) {
    const premio = T.descuentoFidelidad >= 1 ? 'el siguiente es gratis' : T.descuentoFidelidad === 0.5 ? 'el siguiente a mitad de precio' : `el siguiente con ${pct(T.descuentoFidelidad)} de descuento`;
    ofertas.push({ grande: T.descuentoFidelidad >= 1 ? 'Gratis' : pct(T.descuentoFidelidad), icono: 'regalo', texto: `Cada ${T.viajesFidelidad} viajes, ${premio}.` });
  }

  return {
    nombre: limpio(E.nombre) || limpio(E.nombreCorto) || 'Taxis',
    lema: limpio(E.lema),
    pueblo,
    municipio: [pueblo, depto].filter(Boolean).join(', '),
    // «EL ROSAL · CUND.»
    lugarCorto: [pueblo, deptoCorto].filter(Boolean).join(' · ').toUpperCase(),
    deptoMayus: depto.toUpperCase(),
    contacto,
    correo: limpio(E.correo),
    direccion,
    servicio24h: E.servicio24h !== false,
    ofertas,
  };
})();

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------
const HEX = /^#[0-9a-f]{6}$/i;
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// Luminancia relativa (WCAG), de 0 (negro) a 1 (blanco).
export function luminancia(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function mezclar(a, b, t) {
  const [x, y] = [rgb(a), rgb(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Estilo con los colores de la cooperativa (ficha.colores).
function estiloCooperativa() {
  const C = N.COLORES || {};
  const claro = HEX.test(C.primario2 || '') ? C.primario2 : HEX.test(C.primario || '') ? C.primario : '#1D4E89';
  let oscuro = HEX.test(C.oscuro || '') ? C.oscuro : mezclar(claro, '#000000', 0.55);
  if (luminancia(oscuro) > 0.06) oscuro = mezclar(oscuro, '#000000', 0.5);
  const acento = HEX.test(C.acento || '') ? C.acento : '#FFD54A';
  const panel = mezclar(oscuro, '#000000', 0.2);
  const fondoOscuro = luminancia(claro) < 0.3;
  return {
    id: 'cooperativa',
    nombre: `Color de la ${TIPO}`,
    corto: TIPO === 'empresa' ? 'Empresa' : 'Cooperativa',
    muestra: [claro, acento, '#FFFFFF'],
    fondo: claro,
    fondoDegradado: [claro, oscuro],
    tinta: fondoOscuro ? '#FFFFFF' : '#111111',
    tintaSuave: fondoOscuro ? mezclar(claro, '#FFFFFF', 0.8) : mezclar(claro, '#000000', 0.7),
    panel,
    sobrePanel: '#FFFFFF',
    destacado: acento,
    cuadros: [acento, panel],
    tarjeta: '#FFFFFF',
    // Los módulos del QR tienen que ser oscuros para que se lea bien.
    modulo: oscuro,
    bordeTarjeta: null,
    insignia: acento,
    sobreInsignia: luminancia(acento) > 0.35 ? panel : '#FFFFFF',
    titulo: { familia: 'Plus Jakarta Sans', peso: 800 },
    negrita: { familia: 'Plus Jakarta Sans', peso: 800 },
    texto: { familia: 'Plus Jakarta Sans', peso: 700 },
    suave: { familia: 'Plus Jakarta Sans', peso: 500 },
  };
}

// ---------------------------------------------------------------------------
// Estilos de color (combinan con los tres diseños de la app). Cootransrural
// usa su verde («Verde cooperativa»); las demás cooperativas, además de los
// tres de siempre, tienen «Color de la cooperativa» con los colores de su ficha.
// ---------------------------------------------------------------------------
const CLASICO = {
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
};

const VERDE = {
  id: 'verde',
  nombre: ES_PRINCIPAL ? 'Verde cooperativa' : 'Verde campo',
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
};

const NEON = {
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
};

export const ESTILOS = ES_PRINCIPAL ? { clasico: CLASICO, verde: VERDE, neon: NEON } : { clasico: CLASICO, cooperativa: estiloCooperativa(), verde: VERDE, neon: NEON };

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

// ---------------------------------------------------------------------------
// Marca TaxiCun: la app que abre el QR (desarrollada por interOS). El nombre va
// en dos colores como en img/taxicun/logo.svg: sobre fondo oscuro, «Taxi» blanco
// y «Cun» amarillo TaxiCun; sobre fondo claro (estilo clásico), todo en azul TaxiCun.
// ---------------------------------------------------------------------------
const TAXICUN = { nombre: 'TaxiCun', azul: '#0A2552', amarillo: '#FFC21A' };
const fondoClaro = (est) => est.tinta !== '#FFFFFF';

// «antes» + TaxiCun + «despues», ajustado a un ancho máximo.
function textoMarca(x, y, { antes = '', despues = '' }, estilo, tamMax, anchoMax, colorTexto, claro, { alinear = 'izq', espaciadoEm = 0 } = {}) {
  const tam = tamParaAncho(`${antes}${TAXICUN.nombre}${despues}`, { ...estilo, espaciadoEm }, anchoMax, tamMax);
  const [c1, c2] = claro ? [TAXICUN.azul, TAXICUN.azul] : ['#FFFFFF', TAXICUN.amarillo];
  const tramos = [];
  if (antes) tramos.push(tramo(antes, estilo, tam, colorTexto, espaciadoEm));
  tramos.push(tramo('Taxi', estilo, tam, c1, espaciadoEm), tramo('Cun', estilo, tam, c2, espaciadoEm));
  if (despues) tramos.push(tramo(despues, estilo, tam, colorTexto, espaciadoEm));
  return { op: { t: 'texto', x, y, alinear, rotar: 0, tramos }, tam };
}

function fondo(est, w, h) {
  const relleno = est.fondoDegradado ? { tipo: 'lineal', x1: 0, y1: 0, x2: w * 0.35, y2: h, paradas: [[0, est.fondoDegradado[0]], [1, est.fondoDegradado[1]]] } : est.fondo;
  const ops = [{ t: 'rect', x: -EXT, y: -EXT, w: w + 2 * EXT, h: h + 2 * EXT, relleno }];
  if (est.id === 'neon') {
    // Brillos suaves de neón detrás (se imprimen bien: son degradados, no filtros).
    ops.push({ t: 'circulo', cx: w * 0.92, cy: h * 0.08, r: Math.max(w, h) * 0.55, relleno: { tipo: 'radial', cx: w * 0.92, cy: h * 0.08, r: Math.max(w, h) * 0.55, paradas: [[0, '#2EE6FF', 0.22], [1, '#2EE6FF', 0]] } });
    ops.push({ t: 'circulo', cx: w * 0.05, cy: h * 0.95, r: Math.max(w, h) * 0.5, relleno: { tipo: 'radial', cx: w * 0.05, cy: h * 0.95, r: Math.max(w, h) * 0.5, paradas: [[0, '#FF3DA5', 0.16], [1, '#FF3DA5', 0]] } });
  }
  if (est.id === 'verde' || est.id === 'cooperativa') {
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

// Ícono de la app (TaxiCun). Sobre fondos oscuros lleva un filo claro para que no se pierda.
function iconoApp(est, x, y, lado) {
  const ops = [];
  if (est.id !== 'clasico') {
    const g = Math.max(0.35, lado * 0.025);
    ops.push({ t: 'rect', x: x - g, y: y - g, w: lado + 2 * g, h: lado + 2 * g, r: lado * 0.219 + g, relleno: est.id === 'neon' ? est.segundo : '#FFFFFF', opacidad: est.id === 'neon' ? 0.9 : 0.85 });
  }
  ops.push({ t: 'imagen', src: 'taxicun', x, y, w: lado, h: lado });
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
  const tit = textoMarca(W / 2, 18.6, { antes: '¡Pide tu taxi con ', despues: '!' }, est.titulo, 11, W - 2 * M, est.tinta, fondoClaro(est), { alinear: 'centro', espaciadoEm: -0.012 });
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
  // El nombre de la app bajo el ícono (logo pequeño de TaxiCun).
  const nombreApp = textoMarca(cx, 0, {}, est.titulo, 6, wc, est.tinta, fondoClaro(est), { alinear: 'centro', espaciadoEm: -0.02 });
  nombreApp.op.y = yQR + icon + 2.4 + altoMayus(est.titulo.familia, est.titulo.peso) * nombreApp.tam;
  ops.push(nombreApp.op);

  // «Escanéame» con flecha hacia el QR, alineado con el borde inferior del QR.
  const hPill = 20;
  const yPill = yFinQR - hPill;
  ops.push({ t: 'rect', x: xc, y: yPill, w: wc, h: hPill, r: 3, relleno: est.insignia });
  ops.push({ t: 'ruta', d: 'M9 2 2 9l7 7M2.6 9H20', x: cx - 5.8, y: yPill + 2.7, escala: 0.58, relleno: null, trazo: est.sobreInsignia, grosor: 3.1, punta: 'round' });
  ops.push(textoAjustado(cx, yPill + hPill - 4.2, 'ESCANÉAME', est.titulo, 4.6, wc - 3.6, est.sobreInsignia, { alinear: 'centro', espaciadoEm: 0.04 }).op);

  // Tarjeta del móvil (o del servicio 24 h si no se imprime el número).
  const libreIni = nombreApp.op.y + 3.6;
  const libreFin = yPill - 4;
  const hMov = Math.min(libreFin - libreIni, 38);
  const yMov = libreIni + (libreFin - libreIni - hMov) / 2;
  ops.push({ t: 'rect', x: xc, y: yMov, w: wc, h: hMov, r: 3, relleno: est.tarjeta });
  if (est.bordeTarjeta) ops.push({ t: 'rect', x: xc, y: yMov, w: wc, h: hMov, r: 3, relleno: null, trazo: est.bordeTarjeta, grosor: 0.6 });
  const tintaTarjeta = est.id === 'clasico' ? '#111111' : est.modulo;
  const etiqueta = movil ? 'MÓVIL' : DATOS.servicio24h ? 'SERVICIO' : 'APP';
  const grande = movil || (DATOS.servicio24h ? '24 h' : 'GRATIS');
  const tamEt = Math.min(4, (wc - 6) / (anchoTexto(etiqueta, { ...est.negrita, tam: 1 }) + 0.16 * (etiqueta.length - 1)));
  const tamNum = tamParaAncho(grande, { ...est.titulo, espaciadoEm: -0.03 }, wc - 3.4, 17);
  const altoNum = altoMayus(est.titulo.familia, est.titulo.peso) * tamNum;
  const altoBloque = altoMayus(est.negrita.familia, est.negrita.peso) * tamEt + 4.2 + altoNum;
  const yBloque = yMov + (hMov - altoBloque) / 2;
  ops.push(texto(cx, yBloque + altoMayus(est.negrita.familia, est.negrita.peso) * tamEt, etiqueta, est.negrita, tamEt, tintaTarjeta, { alinear: 'centro', espaciadoEm: 0.16 }));
  ops.push(texto(cx, yBloque + altoBloque, grande, est.titulo, tamNum, tintaTarjeta, { alinear: 'centro', espaciadoEm: -0.03 }));

  // Pie: central telefónica (si la cooperativa no tiene teléfono, va su nombre en grande).
  const D = DATOS;
  const C = D.contacto;
  const yBanda = yFinQR + 3.5;
  const hBanda = H - yBanda;
  ops.push({ t: 'rect', x: -EXT, y: yBanda, w: W + 2 * EXT, h: hBanda + EXT, relleno: est.panel });
  if (est.id !== 'clasico') ops.push({ t: 'rect', x: -EXT, y: yBanda, w: W + 2 * EXT, h: 0.8, relleno: est.destacado });
  const cyB = yBanda + hBanda / 2 + (est.id !== 'clasico' ? 0.4 : 0);
  const rIco = Math.min(5.4, hBanda / 2 - 2);
  ops.push({ t: 'circulo', cx: M + rIco, cy: cyB, r: rIco, relleno: est.destacado });
  if (C) ops.push(icono('telefono', M + rIco - rIco * 0.6, cyB - rIco * 0.6, rIco * 1.2, est.panel));
  else if (D.servicio24h) ops.push(...reloj(M + rIco, cyB, rIco * 0.58, est.panel, rIco * 0.15));
  else ops.push(icono('escanear', M + rIco - rIco * 0.6, cyB - rIco * 0.6, rIco * 1.2, est.panel));
  const xTel = M + rIco * 2 + 3.4;
  const tamTel = Math.min(7.6, (hBanda - 4) * 0.62);
  const tamEtTel = Math.min(2.7, tamTel * 0.37);
  const tamMarca = Math.min(4.8, tamTel * 0.62);
  const altoEtTel = altoMayus(est.negrita.familia, est.negrita.peso) * tamEtTel;
  // Bloque derecho: con teléfono, nombre y lugar; sin teléfono, solo el lugar.
  const der1 = C ? D.nombre : D.pueblo.toUpperCase();
  const der2 = C ? D.lugarCorto : D.deptoMayus;
  const etiquetaIzq = C ? `${C.etiqueta}${D.servicio24h ? ' 24 HORAS' : ''}` : D.servicio24h ? 'SERVICIO 24 HORAS' : 'SERVICIO DE TAXI';
  const grandeIzq = C ? C.numero : D.nombre;
  const anchoDerMax = Math.max(ancho(der1, est.titulo, tamMarca), ancho(der2, est.negrita, tamEtTel, 0.14));
  const anchoIzqDisp = W - M - xTel - Math.min(anchoDerMax, 52) - 5;
  const tamGrande = tamParaAncho(grandeIzq, { ...est.titulo, espaciadoEm: 0.01 }, anchoIzqDisp, tamTel);
  const altoTel = altoMayus(est.titulo.familia, est.titulo.peso) * tamTel;
  const yTexto = cyB - (altoTel + altoEtTel + 2.2) / 2;
  const yBase = yTexto + altoEtTel + 2.2 + altoTel;
  ops.push(textoAjustado(xTel, yTexto + altoEtTel, etiquetaIzq, est.negrita, tamEtTel, anchoIzqDisp, est.sobrePanel, { espaciadoEm: 0.16 }).op);
  ops.push(texto(xTel, yBase, grandeIzq, est.titulo, tamGrande, est.destacado, { espaciadoEm: 0.01 }));
  const xFinIzq = xTel + Math.max(ancho(etiquetaIzq, est.negrita, tamEtTel, 0.16), ancho(grandeIzq, est.titulo, tamGrande, 0.01));
  const anchoDer = W - M - xFinIzq - 5;
  const marca = textoAjustado(W - M, 0, der1, est.titulo, tamMarca, anchoDer, est.sobrePanel, { alinear: 'der' });
  marca.op.y = yTexto + altoMayus(est.titulo.familia, est.titulo.peso) * marca.tam;
  ops.push(marca.op);
  if (der2) ops.push(textoAjustado(W - M, yBase, der2, est.negrita, tamEtTel, anchoDer, est.destacado, { alinear: 'der', espaciadoEm: 0.14 }).op);

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
  const t1 = textoMarca(M, 11.4, { antes: 'Descarga ' }, est.titulo, 8.4, W - 2 * M, est.destacado, false, { espaciadoEm: -0.01 });
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
  const anchoMarca = xPanel - 2.4 - (M + ic + 2) - 1.5;
  ops.push(textoAjustado(M + ic + 2, M + 3.4, DATOS.nombre, est.titulo, 3.4, anchoMarca, est.tinta).op);
  ops.push(textoAjustado(M + ic + 2, M + 6.9, DATOS.pueblo.toUpperCase(), est.texto, 2.0, anchoMarca, est.id === 'clasico' ? est.tintaSuave : est.destacado, { espaciadoEm: 0.2 }).op);

  // Titular: «Pide tu taxi con» y, en grande, TaxiCun.
  const anchoTexto1 = xPanel - 2.4 - M - 3;
  ops.push(textoAjustado(M, 21.6, 'Pide tu taxi con', est.titulo, 4.8, anchoTexto1, est.tinta, { espaciadoEm: -0.01 }).op);
  ops.push(textoMarca(M, 31.4, {}, est.titulo, 8.6, anchoTexto1, est.tinta, fondoClaro(est), { espaciadoEm: -0.02 }).op);

  // Teléfono en píldora (sin teléfono: «Descarga la app gratis»).
  const yTel = 35.2;
  const hTel = 8;
  ops.push({ t: 'rect', x: M, y: yTel, w: anchoTexto1, h: hTel, r: hTel / 2, relleno: est.insignia });
  ops.push(icono(DATOS.contacto ? 'telefono' : 'escanear', M + 2.2, yTel + 1.9, 4.2, est.sobreInsignia));
  const enPildora = DATOS.contacto ? DATOS.contacto.numero : 'Descarga TaxiCun gratis';
  const tamPildora = DATOS.contacto ? 4.2 : 3.4;
  ops.push(textoAjustado(M + 7.6, baseCentrada(yTel, hTel, est.titulo, tamPildora), enPildora, est.titulo, tamPildora, anchoTexto1 - 10, est.sobreInsignia).op);

  // Servicio 24 horas.
  if (DATOS.servicio24h) {
    ops.push(...reloj(M + 1.9, 49.3, 1.75, est.tinta, 0.5));
    ops.push(textoAjustado(M + 5.3, 50.4, 'Servicio 24 horas', est.negrita, 3.1, anchoTexto1 - 5.3, est.tinta).op);
  } else {
    ops.push(textoAjustado(M, 50.4, `Taxis de ${DATOS.pueblo}`, est.negrita, 3.1, anchoTexto1, est.tinta).op);
  }

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
  const rB = 7.6;
  ops.push(...iconoApp(est, M, (hEnc - ic) / 2, ic));
  const xNom = M + ic + 4;
  const anchoNom = (DATOS.servicio24h ? W - M - 2 * rB - 4 : W - M) - xNom;
  const nom = textoAjustado(xNom, 12.9, DATOS.nombre, est.titulo, 6.8, anchoNom, est.sobrePanel, { espaciadoEm: -0.01 });
  if (!DATOS.lema) nom.op.y = baseCentrada(0, hEnc, est.titulo, nom.tam);
  ops.push(nom.op);
  if (DATOS.lema) ops.push(textoAjustado(xNom, 19.2, DATOS.lema, est.texto, 3.3, anchoNom, est.destacado).op);
  if (DATOS.servicio24h) {
    ops.push({ t: 'circulo', cx: W - M - rB, cy: hEnc / 2, r: rB, relleno: est.destacado });
    ops.push(texto(W - M - rB, hEnc / 2 + 1.2, '24 h', est.titulo, 4.9, est.panel, { alinear: 'centro' }));
    ops.push(texto(W - M - rB, hEnc / 2 + 4.4, 'SERVICIO', est.negrita, 1.6, est.panel, { alinear: 'centro', espaciadoEm: 0.12 }));
  }
  ops.push(cuadros(-EXT, hEnc, W + 2 * EXT, 5, 2.5, est.cuadros));

  // Titular.
  const t1 = textoAjustado(M, 0, 'Pide tu taxi', est.titulo, 15, W - 2 * M, est.tinta, { espaciadoEm: -0.025 });
  const tam = t1.tam;
  const yT = hEnc + 5 + 5.2 + altoMayus(est.titulo.familia, est.titulo.peso) * tam;
  t1.op.y = yT;
  ops.push(t1.op);
  // «con TaxiCun» resaltado en una franja (más chico si al lado va el móvil que lo recomienda).
  let tam2 = tam;
  if (movil) {
    const anchoMovil = Math.max(ancho('TE LO RECOMIENDA', est.negrita, 2.1, 0.12), ancho(`MÓVIL ${movil}`, est.titulo, 4.8));
    tam2 = Math.min(tam, tamParaAncho('con TaxiCun', { ...est.titulo, espaciadoEm: -0.025 }, W - 2 * M - anchoMovil - 4.8 - 5));
  }
  const w2 = ancho('con TaxiCun', est.titulo, tam2, -0.025);
  const yR = yT + 4.4;
  const hR = tam * 1.1;
  ops.push({ t: 'rect', x: M - 2.2, y: yR, w: w2 + 4.8, h: hR, r: 2.2, relleno: est.insignia });
  ops.push(texto(M, baseCentrada(yR, hR, est.titulo, tam2), 'con TaxiCun', est.titulo, tam2, est.sobreInsignia, { espaciadoEm: -0.025 }));
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
    ['Escanea el código', 'Abre TaxiCun gratis y regístrate en un minuto.'],
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

  // Ofertas (de las tarifas de la cooperativa).
  const ofertas = DATOS.ofertas;
  let yPie = yEsc + hEsc + 8.6;
  if (ofertas.length) {
    const yO = yEsc + hEsc + 8.6;
    const etiquetaO = `OFERTAS DE LA ${TIPO.toUpperCase()}`;
    const wEt = ancho(etiquetaO, est.negrita, 2.9, 0.16);
    ops.push(texto(M, yO, etiquetaO, est.negrita, 2.9, est.tinta, { espaciadoEm: 0.16 }));
    ops.push({ t: 'rect', x: M + wEt + 3, y: yO - 1.25, w: W - 2 * M - wEt - 3, h: 0.45, relleno: est.tinta, opacidad: 0.45 });
    const yC = yO + 3.4;
    const hC = 23.5;
    const wC = ofertas.length > 1 ? (W - 2 * M - 5) / 2 : W - 2 * M;
    ofertas.slice(0, 2).forEach((o, i) => {
      const x = M + i * (wC + 5);
      ops.push({ t: 'rect', x, y: yC, w: wC, h: hC, r: 3, relleno: est.panel });
      if (est.bordeTarjeta) ops.push({ t: 'rect', x, y: yC, w: wC, h: hC, r: 3, relleno: null, trazo: i ? '#FF3DA5' : est.bordeTarjeta, grosor: 0.5 });
      ops.push(icono(o.icono, x + wC - 9.4, yC + 3.4, 5.8, est.destacado));
      ops.push(textoAjustado(x + 4, yC + 10.8, o.grande, est.titulo, 8.4, wC - 15, est.destacado, { espaciadoEm: -0.02 }).op);
      ops.push(...parrafo(x + 4, yC + 16.2, o.texto, est.texto, 2.7, est.sobrePanel, wC - 8, 1.3).ops);
    });
    yPie = yC + hC + 5;
  }

  // Pie de contacto (sin teléfono: «Pide tu taxi con la app» en grande).
  const C = DATOS.contacto;
  ops.push({ t: 'rect', x: M, y: yPie, w: W - 2 * M, h: 0.4, relleno: est.tinta, opacidad: 0.3 });
  const yL = yPie + 8.2;
  ops.push({ t: 'circulo', cx: M + 4.2, cy: yL - 2, r: 4.2, relleno: est.insignia });
  ops.push(icono(C ? 'telefono' : 'escanear', M + 1.7, yL - 4.5, 5, est.sobreInsignia));
  const etiquetaPie = C ? `${C.etiqueta}${C.conWhatsApp ? ' Y WHATSAPP' : ''}${DATOS.servicio24h ? ' · 24 HORAS' : ''}` : DATOS.servicio24h ? 'SERVICIO 24 HORAS' : `TAXIS DE ${DATOS.pueblo.toUpperCase()}`;
  const grandePie = C ? C.numero : 'Pide tu taxi con TaxiCun';
  // Columna derecha: correo, dirección y municipio (solo los que existan).
  const lineas = [DATOS.correo, DATOS.direccion, DATOS.municipio].filter(Boolean);
  const estiloLinea = (i) => (i === 0 && DATOS.correo ? est.texto : est.suave);
  const anchoLineas = Math.min(56, Math.max(0, ...lineas.map((l, i) => ancho(l, estiloLinea(i), 2.4))));
  const xIzq = M + 11;
  const anchoIzq = W - M - xIzq - (lineas.length ? anchoLineas + 5 : 0);
  ops.push(textoAjustado(xIzq, yL - 3.6, etiquetaPie, est.negrita, 2.1, anchoIzq, est.tinta, { espaciadoEm: 0.12 }).op);
  const grande = textoAjustado(xIzq, yL + 2.3, grandePie, est.titulo, 5.4, anchoIzq, est.tinta);
  ops.push(grande.op);
  const anchoDer = W - M - (xIzq + Math.max(ancho(etiquetaPie, est.negrita, 2.1, 0.12), ancho(grandePie, est.titulo, grande.tam))) - 5;
  lineas.forEach((l, i) => {
    const y = yL - 0.1 + (i - (lineas.length - 1) / 2) * 3.5;
    ops.push(textoAjustado(W - M, y, l, estiloLinea(i), 2.4, anchoDer, est.tinta, { alinear: 'der' }).op);
  });

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
  const nom = textoAjustado(M + ic + 1.8, M + 2.9, DATOS.nombre, est.titulo, 3.2, wIzq - ic - 1.8, est.tinta);
  if (!DATOS.lema) nom.op.y = baseCentrada(M - 0.6, ic, est.titulo, nom.tam);
  ops.push(nom.op);
  if (DATOS.lema) ops.push(textoAjustado(M + ic + 1.8, M + 6.1, DATOS.lema, est.suave, 1.95, wIzq - ic - 1.8, est.id === 'clasico' ? est.tinta : est.destacado).op);

  // Titular: «Pide tu taxi con» y, en grande, TaxiCun.
  ops.push(textoAjustado(M, 18.4, 'Pide tu taxi con', est.titulo, 3.9, wIzq, est.tinta, { espaciadoEm: -0.01 }).op);
  ops.push(textoMarca(M, 27.2, {}, est.titulo, 7.4, wIzq, est.tinta, fondoClaro(est), { espaciadoEm: -0.02 }).op);

  // Teléfono.
  const yTel = 31;
  const hTel = 7;
  ops.push({ t: 'rect', x: M, y: yTel, w: wIzq, h: hTel, r: hTel / 2, relleno: est.insignia });
  ops.push(icono(DATOS.contacto ? 'telefono' : 'escanear', M + 2, yTel + 1.7, 3.6, est.sobreInsignia));
  const enPildora = DATOS.contacto ? DATOS.contacto.numero : 'Descarga TaxiCun gratis';
  const tamPildora = DATOS.contacto ? 3.7 : 3.0;
  ops.push(textoAjustado(M + 6.8, baseCentrada(yTel, hTel, est.titulo, tamPildora), enPildora, est.titulo, tamPildora, wIzq - 9, est.sobreInsignia).op);
  if (DATOS.servicio24h) {
    ops.push(...reloj(M + 1.5, 42.2, 1.35, est.tinta, 0.4));
    ops.push(textoAjustado(M + 4.2, 43.1, `Servicio 24 horas · ${DATOS.pueblo}`, est.texto, 2.3, wIzq - 4.2, est.tinta).op);
  } else {
    ops.push(textoAjustado(M, 43.1, `Taxis de ${DATOS.pueblo}`, est.texto, 2.3, wIzq, est.tinta).op);
  }

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

