// Diseño B «Verde Rosal»: piezas compartidas por la app del pasajero y la del
// conductor (íconos, ilustraciones, avisos en pantalla, hojas, casillas de código).
// Sirve para cualquier cooperativa: el nombre, los datos y los colores salen de su
// ficha (empresas/<id>/ficha.json, vía el núcleo). En Cootransrural se ve igual
// que siempre (verde del escudo); en las demás toma los colores de la cooperativa.
import {
  escaparHTML, iniciales, qrSVG, EMPRESA, COLORES, ID_EMPRESA, ES_PROPUESTA, PROVEEDOR, CONDUCTORES_DEMO, urlEmpresa,
} from '../../nucleo/index.js';

/* ------------------------------------------------------------------ */
/* Datos de la cooperativa (nunca «null», «undefined» ni ceros)        */
/* ------------------------------------------------------------------ */
// Texto usable de la ficha: descarta null, undefined, «null» y cadenas vacías.
function dato(v) {
  if (v == null) return '';
  const t = String(v).trim();
  return /^(null|undefined|nan)$/i.test(t) ? '' : t;
}

// Número positivo de la ficha (taxis, año de fundación…) o 0 si no se sabe.
function cifra(v) {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) && n > 0 ? n : 0;
}

const FE = EMPRESA || {};
const TEL_CENTRAL = dato(FE.telefono).replace(/\D/g, '');
const DEMO = Array.isArray(CONDUCTORES_DEMO) ? CONDUCTORES_DEMO : [];

export const MARCA = Object.freeze({
  id: ID_EMPRESA,
  principal: ID_EMPRESA === 'cootransrural',
  propuesta: Boolean(ES_PROPUESTA),
  nombre: dato(FE.nombreCorto) || dato(FE.nombre) || 'la cooperativa',
  nombreLargo: dato(FE.nombre) || dato(FE.nombreCorto) || 'la cooperativa',
  razonSocial: dato(FE.razonSocial) || dato(FE.nombre) || dato(FE.nombreCorto),
  lema: dato(FE.lema),
  pueblo: dato(FE.pueblo),
  municipio: dato(FE.municipio) || dato(FE.pueblo),
  direccion: dato(FE.direccion),
  correo: dato(FE.correo),
  telefono: TEL_CENTRAL,
  telefonoVisible: dato(FE.telefonoVisible) || celularTexto(TEL_CENTRAL),
  whatsapp: dato(FE.whatsapp).replace(/\D/g, ''),
  fundada: cifra(FE.fundada),
  taxis: cifra(FE.taxis),
  microbuses: cifra(FE.microbuses),
  asociados: cifra(FE.asociados),
  // Si la ficha marca el NÚMERO de taxis como pendiente, la cifra es aproximada («unos 20»).
  // Otros pendientes que mencionan los taxis (p. ej. «modelo de los taxis») no cuentan.
  taxisAprox: (Array.isArray(FE.datosPendientes) ? FE.datosPendientes : []).some((d) => /(n[úu]mero|cantidad|cu[áa]ntos).*(taxis|veh[íi]culos)/i.test(String(d))),
  servicio24h: FE.servicio24h !== false,
  proveedor: dato(PROVEEDOR?.nombre) || 'interOS',
  // Móvil para entrar a la demo del conductor: el 023 si existe en la ficha; si no, el primero.
  movilDemo: DEMO.some((c) => c.movil === '023') ? '023' : dato(DEMO[0]?.movil) || '023',
  // Móviles de los conductores de prueba de la ficha (pueden pasar del número de taxis).
  movilesDemo: DEMO.map((c) => dato(c.movil).replace(/\D/g, '').padStart(3, '0')).filter((m) => m !== '000'),
});

// Nombre del diseño B: en Cootransrural es «Verde Rosal»; en las demás, «Color de la cooperativa».
export const NOMBRE_DISENO = MARCA.principal ? 'Verde Rosal' : 'Color de la cooperativa';

// «en El Rosal» / «en Subachoque» (o vacío si la ficha no trae el pueblo).
export function enPueblo(prefijo = 'en', { sinCortar = false } = {}) {
  if (!MARCA.pueblo) return '';
  return `${prefijo} ${sinCortar ? MARCA.pueblo.replace(/ /g, '\u00a0') : MARCA.pueblo}`;
}

// «Desde 1999 · El Rosal» (sin año si no se conoce; con el departamento si es largo).
export function lineaMarca({ largo = false } = {}) {
  const partes = [MARCA.fundada ? `Desde ${MARCA.fundada}` : '', largo ? MARCA.municipio : MARCA.pueblo].filter(Boolean);
  return partes.join(' · ') || 'Taxis de la cooperativa';
}

// Cifras conocidas de la cooperativa: «52 taxis», «3 microbuses», «105 asociados»
// (con «Unos» delante si la ficha dice que el número de taxis es aproximado).
export function cifrasMarca() {
  return [
    ['taxis', MARCA.taxis, 'taxi', 'taxis'],
    ['microbuses', MARCA.microbuses, 'microbús', 'microbuses'],
    ['asociados', MARCA.asociados, 'asociado', 'asociados'],
  ].filter(([, n]) => n).map(([clave, n, uno, varios]) => ({
    clave, n, texto: n === 1 ? uno : varios, antes: clave === 'taxis' && MARCA.taxisAprox ? 'Unos ' : '',
  }));
}

// Enlace tel: de la central (vacío si la ficha no trae teléfono).
export function telCentral() {
  const d = MARCA.telefono;
  if (!d) return '';
  return d.length === 12 && d.startsWith('57') ? `tel:+${d}` : `tel:+57${d}`;
}

// Móvil para las ilustraciones (el último de la flota si se sabe cuántos taxis hay).
export function movilEjemplo() {
  return MARCA.taxis && !MARCA.taxisAprox ? String(MARCA.taxis).padStart(3, '0') : MARCA.movilDemo;
}

// Política de privacidad de la cooperativa (<id>/privacidad/; en Cootransrural, la de la raíz).
export function urlPrivacidad() {
  return MARCA.principal ? '../privacidad/' : urlEmpresa('privacidad/');
}

// Enlace a la otra app de la MISMA cooperativa (pasajero ↔ conductor). Con un
// enlace relativo («../conductor/»), una página abierta desde la raíz con
// ?e=<id> llevaba al conductor de Cootransrural; así lleva a <id>/conductor/.
export function enlaceSeccion(seccion, diseno = 'b') {
  const u = new URL(urlEmpresa(seccion));
  u.searchParams.set('d', diseno);
  return u.href;
}

// El núcleo guarda el viaje en curso del pasajero en sessionStorage con la misma
// clave para todas las cooperativas ('ct.viaje.pasajero'). Si en la misma pestaña
// se pasa de una cooperativa a otra con un viaje por pagar o por calificar, la
// otra lo retomaría (con el conductor y la placa de la primera). Antes de crear
// el pasajero se aparta el viaje de la otra cooperativa (queda guardado para
// cuando vuelva) y se trae el de esta. Usa las mismas claves que el diseño C
// para que cambiar de diseño no rompa la separación.
// El núcleo guarda «sonido sí/no» en los ajustes de cada cooperativa y, además, en
// una clave común ('ct.sonido') que es la que de verdad silencia los avisos. Al
// abrir la app se copia a esa clave el ajuste de ESTA cooperativa: si no, apagar el
// sonido en una cooperativa lo apagaba en todas aunque su interruptor dijera que no.
export function sincronizarSonido(N) {
  try {
    localStorage.setItem('ct.sonido', N.perfil.ajustes().sonido === false ? 'no' : 'si');
  } catch {
    /* sin localStorage: el núcleo usa su valor por defecto */
  }
}

const CLAVE_VIAJE = 'ct.viaje.pasajero';
const CLAVE_DUENO = 'ct.c.viaje.empresa';
export function separarViajeGuardado(id = MARCA.id) {
  try {
    const dueno = sessionStorage.getItem(CLAVE_DUENO);
    // Sin dueño anotado (primera vez o un diseño que no lo anota) se deja como está.
    if (dueno && dueno !== id) {
      const otro = sessionStorage.getItem(CLAVE_VIAJE);
      if (otro) sessionStorage.setItem(`ct.c.viaje.${dueno}`, otro);
      sessionStorage.removeItem(CLAVE_VIAJE);
      const mio = sessionStorage.getItem(`ct.c.viaje.${id}`);
      if (mio) sessionStorage.setItem(CLAVE_VIAJE, mio);
    }
    sessionStorage.removeItem(`ct.c.viaje.${id}`);
    sessionStorage.setItem(CLAVE_DUENO, id);
  } catch {
    /* sessionStorage bloqueado: el núcleo tampoco podrá guardar el viaje */
  }
}

// Etiqueta «Modo prueba» y, en las propuestas, el aviso discreto de demostración al lado.
export function chipPrueba(texto = 'Modo prueba') {
  return `<span class="vb-prueba">${esc(texto)}</span>${demoPara()}`;
}

export function demoPara() {
  return MARCA.propuesta ? `<span class="vb-demo-para">Demostración para ${esc(MARCA.nombreLargo)}</span>` : '';
}

// Nota honesta para las cooperativas a las que solo se les muestra una propuesta.
export function notaPropuesta(clase = '') {
  if (!MARCA.propuesta) return '';
  return `<p class="vb-nota-propuesta ${clase}">${ic('info', 16)}<span>Propuesta de demostración preparada por ${esc(MARCA.proveedor)} para ${esc(MARCA.razonSocial)} · No es la app oficial de la cooperativa.</span></p>`;
}

// «App desarrollada por interOS».
export function desarrolladaPor(clase = '') {
  return `<p class="vb-desarrollada ${clase}">App desarrollada por <b>${esc(MARCA.proveedor)}</b></p>`;
}

/* ------------------------------------------------------------------ */
/* Colores de la cooperativa (con contraste AA)                        */
/* ------------------------------------------------------------------ */
function hexValido(h) {
  return /^#?[0-9a-f]{6}$/i.test(String(h || '').trim()) || /^#?[0-9a-f]{3}$/i.test(String(h || '').trim());
}

function rgb(h) {
  let x = String(h).trim().replace('#', '');
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(v) {
  return `#${v.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

// Mezcla dos colores: t = cuánto se toma de «b» (0 a 1).
export function mezclar(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return hex(x.map((c, i) => c + (y[i] - c) * t));
}

function luminancia(h) {
  const k = [0.2126, 0.7152, 0.0722];
  return rgb(h).reduce((s, c, i) => {
    const v = c / 255;
    return s + k[i] * (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  }, 0);
}

// Relación de contraste WCAG entre dos colores (1 a 21).
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Acerca el color a «hacia» (negro o blanco) poco a poco hasta lograr el contraste pedido.
function ajustarHasta(color, fondo, minimo, hacia) {
  let c = color;
  for (let i = 0; i < 60 && contraste(c, fondo) < minimo; i++) c = mezclar(c, hacia, 0.05);
  return c;
}

const TEXTO = '#1E2A22';
const BLANCO = '#FFFFFF';

function rgbTexto(h) {
  return rgb(h).join(', ');
}

// Paleta del diseño. En Cootransrural, los valores de siempre (comun.css); en las
// demás se deriva de sus colores, garantizando AA: texto blanco sobre el color
// principal y el rojo, verde oscuro sobre el tono claro y texto oscuro sobre el acento.
function calcularPaleta() {
  if (ID_EMPRESA === 'cootransrural') {
    return {
      verde: '#0B6B3A', osc: '#0A5C33', prof: '#073D22', claro: '#E2F0E6', suave: '#F1F8F3', vivo: '#10804A', oscuro: '#052A17',
      oro: '#F2B705', oroOsc: '#B68900', rojo: '#D32F2F', rojoOsc: '#A61F1F', qr: '#0A3D22',
    };
  }
  const c = COLORES || {};
  const P = hexValido(c.primario) ? c.primario : '#0A5C33';
  const P2 = hexValido(c.primario2) ? c.primario2 : P;
  const O = hexValido(c.oscuro) ? c.oscuro : mezclar(P, '#000000', 0.55);
  const A = hexValido(c.acento) ? c.acento : '#F2B705';
  const R = hexValido(c.rojo) ? c.rojo : '#D32F2F';
  // 5,5:1 con el blanco (no solo 4,5) para que también el texto dorado se lea encima.
  const verde = ajustarHasta(P2, BLANCO, 5.5, '#000000');
  const claro = mezclar(verde, BLANCO, 0.88);
  const suave = mezclar(verde, BLANCO, 0.94);
  const osc = ajustarHasta(ajustarHasta(P, BLANCO, 4.6, '#000000'), claro, 4.6, '#000000');
  const prof = ajustarHasta(mezclar(P, O, 0.5), BLANCO, 8, '#000000');
  const oscuro = ajustarHasta(O, BLANCO, 12, '#000000');
  const vivo = ajustarHasta(mezclar(verde, BLANCO, 0.1), BLANCO, 4.6, '#000000');
  const oro = ajustarHasta(A, TEXTO, 4.6, BLANCO);
  const oroOsc = mezclar(oro, '#000000', 0.25);
  // Texto dorado sobre el color de la cooperativa (cabeceras, carné, «Tu taxi llega en»).
  const oroTexto = ajustarHasta(mezclar(oro, BLANCO, 0.3), verde, 4.6, BLANCO);
  const rojo = ajustarHasta(R, BLANCO, 4.6, '#000000');
  return {
    verde, osc, prof, claro, suave, vivo, oscuro,
    oro, oroOsc, oroClaro: mezclar(oro, BLANCO, 0.84), oroTexto, oroBorde: mezclar(oro, BLANCO, 0.5),
    rojo, rojoOsc: mezclar(rojo, '#000000', 0.22), rojoClaro: mezclar(rojo, BLANCO, 0.91), rojoLuz: mezclar(rojo, BLANCO, 0.2),
    rojoBorde: mezclar(rojo, BLANCO, 0.66), borde: mezclar(verde, BLANCO, 0.8), luz: mezclar(verde, BLANCO, 0.25), qr: prof,
  };
}

export const PALETA = Object.freeze(calcularPaleta());

// Fondo con figuritas: rosas en Cootransrural (comun.css); pines y estrellas en las demás.
const FIGURAS = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><g fill='none' stroke='#ffffff' stroke-opacity='.07' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M30 46s-10-9-10-17a10 10 0 0 1 20 0c0 8-10 17-10 17z'/><circle cx='30' cy='29' r='3.5'/><path d='M90 79l3.2 6.6 7.3 1-5.3 5.1 1.3 7.2L90 95.5l-6.5 3.4 1.3-7.2-5.3-5.1 7.3-1z'/></g></svg>`;

// Pone los colores de la cooperativa en las variables CSS del diseño (las de
// comun.css quedan como están en Cootransrural).
export function aplicarMarca() {
  const raiz = document.documentElement;
  raiz.dataset.empresa = MARCA.id;
  if (MARCA.propuesta) raiz.dataset.propuesta = '1';
  if (MARCA.principal) return;
  const P = PALETA;
  const variables = {
    '--vb-verde': P.verde,
    '--vb-verde-osc': P.osc,
    '--vb-verde-prof': P.prof,
    '--vb-verde-claro': P.claro,
    '--vb-verde-suave': P.suave,
    '--vb-verde-vivo': P.vivo,
    '--vb-verde-luz': P.luz,
    '--vb-verde-borde': P.borde,
    '--vb-oscuro': P.oscuro,
    '--vb-verde-rgb': rgbTexto(P.verde),
    '--vb-prof-rgb': rgbTexto(P.prof),
    '--vb-oscuro-rgb': rgbTexto(P.oscuro),
    '--vb-oro': P.oro,
    '--vb-oro-osc': P.oroOsc,
    '--vb-oro-claro': P.oroClaro,
    '--vb-oro-texto': P.oroTexto,
    '--vb-oro-borde': P.oroBorde,
    '--vb-oro-rgb': rgbTexto(P.oro),
    '--vb-oro-osc-rgb': rgbTexto(P.oroOsc),
    '--vb-rojo': P.rojo,
    '--vb-rojo-osc': P.rojoOsc,
    '--vb-rojo-claro': P.rojoClaro,
    '--vb-rojo-luz': P.rojoLuz,
    '--vb-rojo-hondo': P.rojoOsc,
    '--vb-rojo-borde': P.rojoBorde,
    '--vb-rojo-rgb': rgbTexto(P.rojo),
    '--vb-rojo-osc-rgb': rgbTexto(P.rojoOsc),
    '--vb-rosas': `url("data:image/svg+xml,${encodeURIComponent(FIGURAS)}")`,
  };
  for (const [k, v] of Object.entries(variables)) raiz.style.setProperty(k, v);
}

/* ------------------------------------------------------------------ */
/* Íconos (SVG en línea, trazo de 2 px, 24×24)                         */
/* ------------------------------------------------------------------ */
const TRAZOS = {
  atras: '<path d="M15 18l-6-6 6-6"/>',
  cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
  flecha: '<path d="M9 6l6 6-6 6"/>',
  flechaDer: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>',
  miUbicacion: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="8"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  marcador: '<path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.5L5.5 21V4.5a1 1 0 0 1 1-1z"/>',
  billete: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  ruta: '<circle cx="6" cy="18.5" r="2.3"/><circle cx="18" cy="5.5" r="2.3"/><path d="M8.3 18.5H15a3.3 3.3 0 0 0 0-6.6H9a3.3 3.3 0 0 1 0-6.6h6.7"/>',
  historial: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4.5V9h4.5"/><path d="M12 7.5V12l3 2"/>',
  tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  regalo: '<rect x="4" y="10.5" width="16" height="10" rx="1.5"/><path d="M3 7.5h18v3H3zM12 7.5v13"/><path d="M12 7.5C10.5 4 6.5 4 6.5 6s3.6 1.5 5.5 1.5zm0 0C13.5 4 17.5 4 17.5 6s-3.6 1.5-5.5 1.5z"/>',
  telefono: '<path d="M5.2 3.5h3.3l1.7 4.3-2.2 1.4a11 11 0 0 0 6.8 6.8l1.4-2.2 4.3 1.7v3.3a1.8 1.8 0 0 1-1.9 1.8A16.6 16.6 0 0 1 3.4 5.4a1.8 1.8 0 0 1 1.8-1.9z"/>',
  chat: '<path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.9 19z"/><path d="M9 10.5h6M9 13.5h4"/>',
  compartir: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
  escudo: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.8 12l2.2 2.2 4.2-4.4"/>',
  sos: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M12 8v4.5M12 15.8v.01"/>',
  alerta: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  casa: '<path d="M3.5 11L12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  trabajo: '<rect x="3" y="7.5" width="18" height="12.5" rx="2"/><path d="M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h3v3h-3zM18 18h2.5v2.5H18zM14 20.5h1.5M20.5 14v1.5"/>',
  camara: '<path d="M4 8h3l1.8-2.5h6.4L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/>',
  campana: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  ayuda: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 16.8v.01"/>',
  salir: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  usuario: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  documento: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  ganancias: '<path d="M4 19.5h16"/><path d="M5 15l4.5-4.5 3.5 3 6-6.5"/><path d="M15 7h4v4"/>',
  navegar: '<path d="M3.5 11L20.5 3.5 13 20.5l-2-7.5z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
  volante: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M3.8 10.5c2.5-.8 5.3-.8 8.2 1.5 2.9-2.3 5.7-2.3 8.2-1.5M12 14.2v6.3"/>',
  taxi: '<path d="M5 16.5V13l1.8-4.5A2 2 0 0 1 8.7 7h6.6a2 2 0 0 1 1.9 1.5L19 13v3.5"/><path d="M3.5 13h17v4.5h-17zM6.5 17.5v2M17.5 17.5v2M10 4.5h4V7h-4z"/><circle cx="7.3" cy="15.2" r=".6"/><circle cx="16.7" cy="15.2" r=".6"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  sonido: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  instalar: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5"/>',
  paleta: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 1.8-1 1.3-2.1-.6-1.2.1-2.4 1.5-2.4h2.2a3.5 3.5 0 0 0 3.5-3.5c0-5-3.8-9-8.5-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  antena: '<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a5.5 5.5 0 0 1 8 0"/><circle cx="12" cy="18.5" r="1.2"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4.5V8M9.5 12.8v.01M14.5 12.8v.01M9.5 16h5"/>',
  puerta: '<path d="M5.5 21V4.5A1.5 1.5 0 0 1 7 3h10a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18"/><circle cx="15" cy="12.5" r=".9"/>',
  bandera: '<path d="M5.5 21V4M5.5 4.5h11l-2 4 2 4h-11"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  carne: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.4"/><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3"/>',
  mensaje: '<path d="M4 5.5h16v10.5H9l-5 4z"/>',
  correo: '<rect x="3" y="5.5" width="18" height="13" rx="2.2"/><path d="M3.8 7.2l8.2 6 8.2-6"/>',
  encender: '<path d="M12 3.5v8"/><path d="M7 6.5a7.5 7.5 0 1 0 10 0"/>',
  moneda: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.9-1.5-1.4-2.6-1.4-1.6 0-2.7.9-2.7 2.1 0 2.9 5.6 1.5 5.6 4.3 0 1.2-1.2 2.1-2.8 2.1-1.2 0-2.3-.6-2.8-1.5M12 6.3v1.5M12 16.3v1.5"/>',
  mapa: '<path d="M3.5 6.5l5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  basura: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  gps: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/>',
  // Categorías de lugares
  centro: '<path d="M3.5 9.5L12 4.5l8.5 5"/><path d="M5.5 10.5v7.5M10 10.5v7.5M14 10.5v7.5M18.5 10.5v7.5M3.5 20.5h17"/>',
  salud: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M12 8v8M8 12h8"/>',
  educacion: '<path d="M2.5 9.5L12 5l9.5 4.5L12 14z"/><path d="M6.5 11.5V16c3 2 8 2 11 0v-4.5M21.5 9.5v5"/>',
  comercio: '<path d="M3 4.5h2.5l2.2 10.5h10.6l2-7.5H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  barrio: '<path d="M2.5 12l5-4.5 5 4.5M4 11v8.5h7V11"/><path d="M12.5 9.5l4.5-4 4.5 4M14 8.5v11h6v-11"/>',
  vereda: '<path d="M12 21.5V8"/><path d="M12 12.5C9 12.5 7 10.5 7 7.5c3 0 5 2 5 5zm0 0c3 0 5-2 5-5-3 0-5 2-5 5zM12 17.5c-3 0-5-2-5-5 3 0 5 2 5 5zm0 0c3 0 5-2 5-5-3 0-5 2-5 5zM12 8c-1.8 0-3-1.4-3-3.5 1.8 0 3 1.4 3 3.5zm0 0c1.8 0 3-1.4 3-3.5-1.8 0-3 1.4-3 3.5z"/>',
  comida: '<path d="M7 3v7.5M5 3v5a2 2 0 0 0 4 0V3M7 10.5V21"/><path d="M17.5 21V3c-2 1.5-3 4-3 7v3h3"/>',
  municipio: '<path d="M8 3L4 21M16 3l4 18M12 4v2.5M12 10v3M12 16.5V20"/>',
  bogota: '<path d="M10.8 3.6c0-.9.5-1.6 1.2-1.6s1.2.7 1.2 1.6v5.2l7.3 4.3v2l-7.3-2.2v4.6l2 1.6v1.6L12 19.8l-3.2.9v-1.6l2-1.6v-4.6l-7.3 2.2v-2l7.3-4.3z"/>',
};

const RELLENOS = {
  estrella: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
  punto: '<circle cx="12" cy="12" r="6"/>',
};

export function ic(nombre, tam = 24, clase = '') {
  const relleno = RELLENOS[nombre];
  const cuerpo = relleno || TRAZOS[nombre] || TRAZOS.info;
  const atributos = relleno ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  return `<svg class="vb-ic ${clase}" viewBox="0 0 24 24" width="${tam}" height="${tam}" ${atributos} aria-hidden="true" focusable="false">${cuerpo}</svg>`;
}

/* ------------------------------------------------------------------ */
/* Ilustraciones propias (reemplazan a las fotos viejas)               */
/* ------------------------------------------------------------------ */
function puntosEstrella(cx, cy, re, ri) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? ri : re;
    const a = (-90 + i * 36) * (Math.PI / 180);
    p.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return p.join(' ');
}

// Insignia de la marca. En Cootransrural: su escudo estilizado (verde con borde
// dorado y una rosa, por El Rosal). En las demás: una placa con un taxi en los
// colores de la cooperativa (no imita el logo de ninguna).
export function insignia(tam = 44, clase = '') {
  const alto = Math.round((tam * 72) / 64);
  if (!MARCA.principal) {
    const P = PALETA;
    return `<svg class="vb-insignia ${clase}" viewBox="0 0 64 72" width="${tam}" height="${alto}" aria-hidden="true" focusable="false">
  <rect x="4" y="8" width="56" height="56" rx="17" fill="${P.verde}" stroke="${P.oro}" stroke-width="3.2"/>
  <rect x="9.5" y="13.5" width="45" height="45" rx="12.5" fill="none" stroke="${P.oro}" stroke-width="1" opacity=".55"/>
  <rect x="26" y="19.5" width="12" height="5.5" rx="1.6" fill="${P.oro}"/>
  <path d="M17.5 47v-8.5l4.2-9.3a3 3 0 0 1 2.7-1.7h15.2a3 3 0 0 1 2.7 1.7l4.2 9.3V47z" fill="${P.oro}"/>
  <path d="M23.4 37.6l2.5-6.2h12.2l2.5 6.2z" fill="${P.prof}"/>
  <circle cx="23" cy="42" r="2.1" fill="#fff"/><circle cx="41" cy="42" r="2.1" fill="#fff"/>
  <rect x="19" y="46" width="6.5" height="5.5" rx="1.6" fill="#1E2A22"/><rect x="38.5" y="46" width="6.5" height="5.5" rx="1.6" fill="#1E2A22"/>
</svg>`;
  }
  return `<svg class="vb-insignia ${clase}" viewBox="0 0 64 72" width="${tam}" height="${alto}" aria-hidden="true" focusable="false">
  <path d="M32 3 59 11v24c0 18-13 29-27 34C18 64 5 53 5 35V11z" fill="#0B6B3A" stroke="#F2B705" stroke-width="3.2" stroke-linejoin="round"/>
  <path d="M32 9.5 53 15.8V35c0 14-10 23-21 27.5C21 58 11 49 11 35V15.8z" fill="none" stroke="#F2B705" stroke-width="1" opacity=".55"/>
  <polygon points="${puntosEstrella(32, 17.5, 4.4, 1.9)}" fill="#F2B705"/>
  <path d="M32 44v11" stroke="#A8DDB2" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M32 51c-6-.6-9.4-4.6-9.4-8 5.2 0 8.4 3.2 9.4 8z" fill="#A8DDB2"/>
  <path d="M32 51c6-.6 9.4-4.6 9.4-8-5.2 0-8.4 3.2-9.4 8z" fill="#7CC08A"/>
  <circle cx="32" cy="34" r="10.5" fill="#D32F2F"/>
  <path d="M32 28c3.4 0 5.6 2.4 5 5.2-.6 2.9-4.1 4-6.2 2.3-1.8-1.6-.6-4.3 1.5-4" fill="none" stroke="#8E1B1B" stroke-width="1.7" stroke-linecap="round"/>
  <path d="M23.3 32.5c1.4 4.2 4.7 7 8.7 7s7.3-2.8 8.7-7" fill="none" stroke="#8E1B1B" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;
}

// Nombre de la cooperativa en la franja del taxi (más apretado si es muy largo).
function textoFranja() {
  const nombre = escaparHTML(MARCA.nombre.toUpperCase());
  const n = MARCA.nombre.length;
  const tam = n > 18 ? Math.max(7.5, (10.5 * 18) / n).toFixed(1) : '10.5';
  const espacio = n > 15 ? '1.2' : '2.2';
  return `<text x="206" y="128.3" font-family="Nunito, Arial, sans-serif" font-size="${tam}" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="${espacio}">${nombre}</text>`;
}

// Kia Picanto amarillo de perfil, con la franja de la cooperativa (su color y su nombre).
function cuerpoTaxi(movil = '023') {
  const m = escaparHTML(String(movil).padStart(3, '0'));
  return `<ellipse cx="205" cy="184" rx="182" ry="8" fill="${MARCA.principal ? '#0A2E1A' : PALETA.oscuro}" opacity=".18"/>
  <path d="M24 150v-36c0-15 7-24 18-30l24-25c7-7 15-9 24-9.4l138-1.6c16 0 27 4 37 13l35 30 46 9c22 4.5 32 14 33 32l1 18c0 4-3 6-6 6H30c-4 0-6-2-6-6z" fill="url(#vbCarro)" stroke="#9A6A00" stroke-width="2"/>
  <path d="M30 104c40-6 300-6 350 4" stroke="#FFE08A" stroke-width="3" fill="none" opacity=".7"/>
  <path d="M74 64c5-5 11-6.5 19-6.8l66-.9V93H62z" fill="url(#vbVidrio)"/>
  <path d="M169 56.2l55-.6c13 0 22 3 30 10l29 27.4H169z" fill="url(#vbVidrio)"/>
  <path d="M96 61h22L95 88H80z" fill="#fff" opacity=".2"/>
  <path d="M190 60h18l-18 30h-12z" fill="#fff" opacity=".14"/>
  <rect x="159" y="55" width="10" height="40" fill="#1B2A33"/>
  <path d="M164 95v55M281 95l4 55" stroke="#B98200" stroke-width="1.6" fill="none"/>
  <path d="M26 117h356v14H26z" fill="${PALETA.verde}"/>
  <path d="M26 131h356v2.5H26z" fill="${PALETA.oro}"/>
  ${textoFranja()}
  <rect x="146" y="101" width="13" height="4.5" rx="2.2" fill="#9A6A00"/>
  <rect x="262" y="101" width="13" height="4.5" rx="2.2" fill="#9A6A00"/>
  <rect x="46" y="98.5" width="88" height="16" rx="5" fill="#FFF7D6" stroke="#B98200" stroke-width="1"/>
  <text x="90" y="110.6" font-family="Nunito, Arial, sans-serif" font-size="11" font-weight="900" fill="#1E2A22" text-anchor="middle" letter-spacing=".5">MÓVIL <tspan data-movil-taxi>${m}</tspan></text>
  <rect x="146" y="36" width="64" height="17" rx="4.5" fill="#1E2A22"/>
  <text x="178" y="48.6" font-family="Nunito, Arial, sans-serif" font-size="11.5" font-weight="900" fill="#FFD54A" text-anchor="middle" letter-spacing="1.5">TAXI</text>
  <path d="M360 107c12 1.5 19 6 21 14l-20-1.5z" fill="#FFF7CF" stroke="#9A6A00" stroke-width="1.2"/>
  <path d="M24 92h7c2 0 3 1 3 3v15c0 2-1 3-3 3h-7z" fill="#D32F2F"/>
  <path d="M287 89l13-5 5 8-13 3z" fill="#E3A21A" stroke="#9A6A00" stroke-width="1"/>
  <rect x="344" y="139" width="40" height="11" rx="5" fill="#25302A"/>
  <rect x="22" y="139" width="30" height="11" rx="5" fill="#25302A"/>
  <path d="M57 156a38 38 0 0 1 76 0z" fill="#25302A"/>
  <path d="M279 156a38 38 0 0 1 76 0z" fill="#25302A"/>
  <g><circle cx="95" cy="156" r="27" fill="#161A18"/><circle cx="95" cy="156" r="15" fill="#C9CFD3"/><circle cx="95" cy="156" r="5.5" fill="#7A848A"/><path d="M95 142v8M95 162v8M81 156h8M101 156h8" stroke="#9AA3A8" stroke-width="2.4"/></g>
  <g><circle cx="317" cy="156" r="27" fill="#161A18"/><circle cx="317" cy="156" r="15" fill="#C9CFD3"/><circle cx="317" cy="156" r="5.5" fill="#7A848A"/><path d="M317 142v8M317 162v8M303 156h8M323 156h8" stroke="#9AA3A8" stroke-width="2.4"/></g>`;
}

const DEFS_TAXI = `<linearGradient id="vbCarro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFCB45"/><stop offset=".55" stop-color="#F5B12E"/><stop offset="1" stop-color="#DC9512"/></linearGradient>
  <linearGradient id="vbVidrio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C7F9C"/><stop offset="1" stop-color="#16303F"/></linearGradient>`;

export function taxiLado({ movil = '023', clase = '' } = {}) {
  return `<svg class="vb-taxi-ilus ${clase}" viewBox="0 0 400 196" aria-hidden="true" focusable="false"><defs>${DEFS_TAXI}</defs>${cuerpoTaxi(movil)}</svg>`;
}

// Rosas en Cootransrural (El Rosal); en las demás, matas con florecitas.
function rosa(x, y, e = 1) {
  if (!MARCA.principal) {
    return `<g transform="translate(${x} ${y}) scale(${e})"><circle cx="-6" cy="4" r="7" fill="#3E9A5C"/><circle cx="6" cy="3" r="8" fill="#4FA56B"/><circle cx="0" cy="-4" r="7.5" fill="#57B074"/><circle cx="-3" cy="-5" r="1.9" fill="${PALETA.oro}"/><circle cx="5" cy="0" r="1.9" fill="#fff"/><circle cx="-7" cy="4" r="1.7" fill="#fff"/></g>`;
  }
  return `<g transform="translate(${x} ${y}) scale(${e})"><path d="M0 4v16" stroke="#2E7D4F" stroke-width="2.2"/><path d="M0 14c-6 0-9-4-9-7 5 0 8 3 9 7zM0 12c6 0 9-4 9-7-5 0-8 3-9 7z" fill="#3E9A5C"/><circle r="6.5" fill="#D32F2F"/><path d="M0-3.2c2.2 0 3.6 1.6 3.2 3.4-.4 1.9-2.7 2.6-4 1.5-1.2-1.1-.4-2.8 1-2.6" fill="none" stroke="#8E1B1B" stroke-width="1.3" stroke-linecap="round"/></g>`;
}

// Escena de bienvenida: la Sabana, el pueblo, la carretera y el taxi.
export function escenaBienvenida({ movil = '023' } = {}) {
  const casas = [[38, 150, '#D32F2F'], [64, 146, PALETA.verde], [92, 152, '#B5532D'], [330, 148, '#D32F2F'], [356, 152, PALETA.verde]]
    .map(([x, y, techo]) => `<g transform="translate(${x} ${y})"><path d="M-11 0h22v-14h-22z" fill="#FFFDF7" stroke="#E2D9C3"/><path d="M-13-13l13-9 13 9z" fill="${techo}"/><rect x="-3" y="-8" width="6" height="8" fill="#6C4A2F"/></g>`)
    .join('');
  return `<svg class="vb-escena" viewBox="0 0 400 270" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
  <defs>${DEFS_TAXI}
    <linearGradient id="vbCielo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1C9"/><stop offset="1" stop-color="#FBF8F1"/></linearGradient>
  </defs>
  <rect width="400" height="270" fill="url(#vbCielo)"/>
  <circle cx="318" cy="64" r="58" fill="#F2B705" opacity=".16"/>
  <circle cx="318" cy="64" r="34" fill="#F2B705" opacity=".9"/>
  <path d="M40 46c8-6 18-6 24 0 6-3 13-1 15 5H32c1-3 4-5 8-5z" fill="#fff" opacity=".9"/>
  <path d="M190 30c7-5 15-5 20 0 5-2 11-1 13 4h-38c1-2 3-4 5-4z" fill="#fff" opacity=".8"/>
  <path d="M0 140 60 96l44 26 62-48 66 46 58-34 54 30 56-20v124H0z" fill="#BFDDBE"/>
  <path d="M0 160c70-34 130-20 200-6s130 4 200-14v130H0z" fill="#8CC79A"/>
  ${casas}
  <path d="M168 136h20v-20l10-8 10 8v20h4v18h-44z" fill="#FFFDF7" stroke="#E2D9C3"/>
  <path d="M198 96v12M194 100h8" stroke="#B5532D" stroke-width="2"/>
  <path d="M0 186c90-22 170-14 240-4s120 8 160 0v88H0z" fill="#4FA56B"/>
  <path d="M0 226c120-14 260-14 400 0v44H0z" fill="#56635B"/>
  <path d="M10 246c120-10 260-10 380 0" stroke="#F8EFD6" stroke-width="3" stroke-dasharray="18 14" fill="none"/>
  <svg x="78" y="128" width="250" height="122" viewBox="0 0 400 196">${cuerpoTaxi(movil)}</svg>
  <g class="vb-escena-pin"><path d="M262 84c0 0 15-15 15-28a15 15 0 0 0-30 0c0 13 15 28 15 28z" fill="${PALETA.rojo}" stroke="#fff" stroke-width="2.5"/><circle cx="262" cy="56" r="6" fill="#fff"/></g>
  ${rosa(22, 214, 1.1)}${rosa(40, 222, 0.85)}${rosa(374, 216, 1.1)}${rosa(356, 224, 0.8)}
</svg>`;
}

// Fotos genéricas (sin marcas ni logos; generadas para la web, ver img/web/creditos.json),
// recortadas y comprimidas para el celular. Sirven para cualquier cooperativa.
export const FOTOS = {
  bienvenida: new URL('./img/bienvenida.jpg', import.meta.url).href,
  conductor: new URL('./img/conductor.jpg', import.meta.url).href,
};

// Foto que llena su caja. Mientras carga se ve un degradado; si no carga (sin
// conexión), se muestra la ilustración de respaldo.
export function fotoHTML({ src, alt, respaldo = '', posicion = '50% 50%', clase = '' }) {
  return `<span class="vb-foto ${clase}" style="--vb-foto-pos:${posicion}"><img src="${src}" alt="${esc(alt)}" decoding="async" data-vb-foto>${respaldo ? `<span class="vb-foto-respaldo" aria-hidden="true">${respaldo}</span>` : ''}</span>`;
}

export function activarFotos(raiz) {
  for (const img of raiz.querySelectorAll('img[data-vb-foto]')) {
    const caja = img.closest('.vb-foto');
    const lista = () => caja.classList.add('lista');
    const fallo = () => caja.classList.add('sin-foto');
    if (img.complete) {
      if (img.naturalWidth) lista();
      else fallo();
    } else {
      img.addEventListener('load', lista, { once: true });
      img.addEventListener('error', fallo, { once: true });
    }
  }
}

// Sello redondo «Verificado por <cooperativa>» (como sello de tinta). El texto da
// la vuelta completa: con nombres largos la letra se achica para que quepa.
let contadorSellos = 0;
export function selloVerificado(clase = '') {
  const id = `vbSello${++contadorSellos}`;
  const texto = `VERIFICADO · ${MARCA.nombre.toUpperCase()} ·`;
  const escala = Math.min(1, 28 / texto.length);
  return `<svg class="vb-sello ${clase}" viewBox="0 0 100 100" role="img" aria-label="Verificado por ${esc(MARCA.nombre)}">
  <defs><path id="${id}" d="M50 50m-35 0a35 35 0 1 1 70 0a35 35 0 1 1-70 0"/></defs>
  <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" stroke-width="3"/>
  <circle cx="50" cy="50" r="25" fill="none" stroke="currentColor" stroke-width="1.6"/>
  <text font-family="Nunito, Arial, sans-serif" font-size="${(10.2 * escala).toFixed(2)}" font-weight="900" letter-spacing="${(1.25 * escala).toFixed(2)}" fill="currentColor"><textPath href="#${id}">${esc(texto)}</textPath></text>
  <path d="M38 50.5l8 8 16-17" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Pequeñas piezas de interfaz                                         */
/* ------------------------------------------------------------------ */
function esc(texto) {
  return escaparHTML(texto);
}
export { esc };

export function decimal(n, digitos = 1) {
  return Number(n || 0).toFixed(digitos).replace('.', ',');
}

// Nombre corto para saludar: «Luz Marina Rojas» → «Luz»; «Doña Rosa» → «Doña Rosa».
export function nombreCorto(nombre = '') {
  const partes = String(nombre).trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  if (/^(don|doña|dona|señor|señora|sr\.?|sra\.?)$/i.test(partes[0]) && partes[1]) return `${partes[0]} ${partes[1]}`;
  return partes[0];
}

// Evita que «10:05 p. m.» se parta en dos renglones.
export function sinCorte(texto = '') {
  return String(texto).replace(/ /g, '\u00a0');
}

// Encuadra el mapa sin animación (las animaciones se cortan si el mapa se
// mueve de pantalla a mitad de camino y Leaflet deja de pintar teselas).
export function encuadrar(m, puntos, { margen = [40, 40], margenAbajo = 0, maxZoom = 17, reset = false } = {}) {
  const validos = puntos.filter(Boolean).map((p) => [p.lat, p.lng]);
  if (!m || !validos.length) return;
  const opciones = { animate: false, reset };
  if (validos.length === 1 || validos.every((v) => v[0] === validos[0][0] && v[1] === validos[0][1])) {
    m.mapa.setView(validos[0], maxZoom, opciones);
    return;
  }
  m.mapa.fitBounds(m.L.latLngBounds(validos), { ...opciones, paddingTopLeft: margen, paddingBottomRight: [margen[0], margen[1] + margenAbajo], maxZoom });
}

export function celularTexto(c = '') {
  const d = String(c).replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

export function numeroMiles(n) {
  return Number(n || 0).toLocaleString('es-CO');
}

// Placa de servicio público colombiana (blanca, letras negras, municipio abajo).
export function placaHTML(placa = '', municipio = MARCA.pueblo.toUpperCase()) {
  return `<span class="vb-placa" role="img" aria-label="Placa ${esc(placa)}"><b>${esc(placa)}</b><small>${esc(municipio)}</small></span>`;
}

export function avatarHTML(nombre = '', clase = '') {
  // «Don Álvaro» → «Á» (el tratamiento no cuenta como inicial).
  const sinTratamiento = String(nombre).trim().replace(/^(don|doña|dona|señor|señora|sr\.?|sra\.?)\s+/i, '');
  return `<span class="vb-avatar ${clase}" aria-hidden="true">${esc(iniciales(sinTratamiento) || '?')}</span>`;
}

export function estrellasHTML(n = 0, tam = 18) {
  let h = '';
  for (let i = 1; i <= 5; i++) h += `<span class="vb-estrella${i <= Math.round(n) ? ' llena' : ''}">${ic('estrella', tam)}</span>`;
  return `<span class="vb-estrellas" role="img" aria-label="${Math.round(n)} de 5 estrellas">${h}</span>`;
}

export function conexionHTML(conexion) {
  const vivo = conexion === 'en-vivo';
  return `<span class="vb-conexion${vivo ? ' en-vivo' : ''}" data-conexion title="${vivo ? 'Conectado con otros celulares' : 'Funciona solo en este equipo'}"><i aria-hidden="true"></i><span>${vivo ? 'En vivo' : 'Solo este equipo'}</span></span>`;
}

export function actualizarConexion(raiz, conexion) {
  const vivo = conexion === 'en-vivo';
  for (const el of raiz.querySelectorAll('[data-conexion]')) {
    if (el.classList.contains('en-vivo') === vivo && el.dataset.listo) continue;
    el.dataset.listo = '1';
    el.classList.toggle('en-vivo', vivo);
    el.title = vivo ? 'Conectado con otros celulares' : 'Funciona solo en este equipo';
    el.querySelector('span').textContent = vivo ? 'En vivo' : 'Solo este equipo';
  }
}

// Tarjeta de fidelidad: 10 sellos como la tarjeta física de la cooperativa.
export function sellosHTML(progreso, { mini = false } = {}) {
  const { completados, meta, siguienteConDescuento } = progreso;
  let h = '';
  for (let i = 1; i <= meta; i++) {
    const lleno = i <= completados;
    h += `<span class="vb-sello-viaje${lleno ? ' lleno' : ''}" aria-hidden="true">${lleno ? (mini ? '' : ic('check', 18)) : mini ? '' : i}</span>`;
  }
  h += `<span class="vb-sello-viaje premio${siguienteConDescuento ? ' activo' : ''}" aria-hidden="true">${mini ? '½' : '50 %'}</span>`;
  return `<span class="vb-sellos${mini ? ' mini' : ''}" role="img" aria-label="${completados} de ${meta} viajes para el viaje al 50 %">${h}</span>`;
}

// Casillas para códigos de 4 dígitos: un solo campo real (para que el teclado
// numérico, el autocompletar del SMS y los lectores de pantalla funcionen bien)
// dibujado como 4 casillas.
export function casillasHTML({ id, etiqueta, oculto = false, autocompletar = 'one-time-code' }) {
  return `<div class="vb-casillas" data-casillas>
    <label class="vb-sr" for="${id}">${esc(etiqueta)}</label>
    <input id="${id}" class="vb-casillas-campo" type="${oculto ? 'password' : 'text'}" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${autocompletar}" enterkeyhint="done">
    <span class="vb-casilla"></span><span class="vb-casilla"></span><span class="vb-casilla"></span><span class="vb-casilla"></span>
  </div>`;
}

export function activarCasillas(cont, { alCompletar, oculto = false } = {}) {
  const campo = cont.querySelector('.vb-casillas-campo');
  const casillas = [...cont.querySelectorAll('.vb-casilla')];
  const pintar = () => {
    const v = campo.value;
    casillas.forEach((c, i) => {
      c.textContent = v[i] ? (oculto ? '•' : v[i]) : '';
      c.classList.toggle('llena', Boolean(v[i]));
      c.classList.toggle('actual', document.activeElement === campo && i === Math.min(v.length, 3));
    });
  };
  campo.addEventListener('input', () => {
    const limpio = campo.value.replace(/\D/g, '').slice(0, 4);
    if (limpio !== campo.value) campo.value = limpio;
    cont.classList.remove('error');
    pintar();
    if (limpio.length === 4) alCompletar?.(limpio);
  });
  campo.addEventListener('focus', pintar);
  campo.addEventListener('blur', pintar);
  pintar();
  return {
    campo,
    valor: () => campo.value,
    limpiar() {
      campo.value = '';
      pintar();
    },
    error() {
      cont.classList.remove('error');
      void cont.offsetWidth;
      cont.classList.add('error');
    },
  };
}

/* ------------------------------------------------------------------ */
/* Vibración solo después del primer toque                             */
/* ------------------------------------------------------------------ */
// El núcleo vibra con cada aviso. Si llega un aviso antes de que la persona
// toque la pantalla (por ejemplo, justo después de recargar), Chrome bloquea la
// vibración y deja un error en la consola. Aquí se espera al primer toque.
export function protegerVibracion() {
  const nav = window.navigator;
  if (typeof nav.vibrate !== 'function' || nav.vibrate.vbProtegida) return;
  const original = nav.vibrate.bind(nav);
  const protegida = (patron) => (nav.userActivation && !nav.userActivation.hasBeenActive ? false : original(patron));
  protegida.vbProtegida = true;
  try {
    Object.defineProperty(nav, 'vibrate', { value: protegida, configurable: true, writable: true });
  } catch {
    /* sin cambios: el navegador no deja reemplazarla */
  }
}

/* ------------------------------------------------------------------ */
/* Avisos en pantalla (además del sonido y la vibración del núcleo)    */
/* ------------------------------------------------------------------ */
const ICONO_AVISO = { exito: 'check', info: 'info', alerta: 'campana', error: 'alerta', solicitud: 'taxi' };

// Se ve un solo aviso a la vez (el más reciente) para no tapar el mapa ni el
// taxi; el anterior se quita sin animación para que no se monten uno sobre otro.
export function crearAvisos(cont) {
  let actual = null;
  let reloj = null;
  function quitar(el, { animar = true } = {}) {
    if (!el?.isConnected) return;
    if (el === actual) {
      actual = null;
      clearTimeout(reloj);
    }
    if (!animar) return el.remove();
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 220);
  }
  return {
    limpiar() {
      quitar(actual, { animar: false });
    },
    mostrar({ titulo, cuerpo = '', tipo = 'info' }) {
      quitar(actual, { animar: false });
      // «… a. m.. Ahorras» → «… a. m. Ahorras» (los textos del núcleo a veces traen doble punto).
      const texto = String(cuerpo || '').replace(/\.\.(?=\s|$)/g, '.');
      const el = document.createElement('div');
      el.className = `vb-aviso tipo-${tipo}`;
      if (tipo === 'alerta' || tipo === 'error' || tipo === 'solicitud') el.setAttribute('role', 'alert');
      el.innerHTML = `<span class="vb-aviso-ic">${ic(ICONO_AVISO[tipo] || 'info', 22)}</span><span class="vb-aviso-txt"><b>${esc(titulo)}</b>${texto ? `<span>${esc(texto)}</span>` : ''}</span><button type="button" class="vb-aviso-x" aria-label="Cerrar aviso">${ic('cerrar', 18)}</button>`;
      el.querySelector('.vb-aviso-x').addEventListener('click', () => quitar(el));
      cont.prepend(el);
      actual = el;
      reloj = setTimeout(() => quitar(el), tipo === 'alerta' || tipo === 'solicitud' ? 6500 : 4200);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hoja inferior (diálogo modal)                                       */
/* ------------------------------------------------------------------ */
export function crearHoja(capa) {
  let alCerrar = null;
  let foco = null;
  const cerrar = () => {
    if (capa.hidden) return;
    capa.hidden = true;
    capa.innerHTML = '';
    const fn = alCerrar;
    alCerrar = null;
    fn?.();
    foco?.focus?.({ preventScroll: true });
  };
  capa.addEventListener('click', (e) => {
    if (e.target === capa || e.target.closest('[data-cerrar-hoja]')) cerrar();
  });
  capa.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cerrar();
    if (e.key === 'Tab') {
      const enfocables = [...capa.querySelectorAll('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent !== null);
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
  });
  return {
    abrir({ titulo, html, clase = '', alCerrar: fn } = {}) {
      foco = document.activeElement;
      alCerrar = fn || null;
      capa.innerHTML = `<section class="vb-hoja ${clase}" role="dialog" aria-modal="true" aria-labelledby="vb-hoja-titulo">
        <span class="vb-hoja-asa" aria-hidden="true"></span>
        <header class="vb-hoja-cab"><h2 id="vb-hoja-titulo">${esc(titulo)}</h2><button type="button" class="vb-btn-icono" data-cerrar-hoja aria-label="Cerrar">${ic('cerrar')}</button></header>
        <div class="vb-hoja-cuerpo">${html}</div>
      </section>`;
      capa.hidden = false;
      const primero = capa.querySelector('.vb-hoja-cuerpo button, .vb-hoja-cuerpo a, .vb-hoja-cuerpo input, .vb-hoja-cuerpo textarea') || capa.querySelector('[data-cerrar-hoja]');
      requestAnimationFrame(() => primero?.focus({ preventScroll: true }));
      return capa.querySelector('.vb-hoja');
    },
    cerrar,
    get abierta() {
      return !capa.hidden;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Teselas del mapa                                                    */
/* ------------------------------------------------------------------ */
// Las capas de CARTO del núcleo (basemaps.cartocdn.com) ahora responden con
// teselas «API KEY REQUIRED». Se reemplazan por OpenStreetMap: primero el
// estilo HOT de OSM Francia (suave y con los sitios del pueblo rotulados) y,
// si falla varias veces, el OSM estándar.
const FUENTES_TESELAS = [
  {
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · estilo <a href="https://www.hotosm.org/">HOT</a> (OSM Francia)',
  },
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
];

export function ponerTeselas(m) {
  // El núcleo ya trae Mapbox con respaldo a OpenStreetMap: solo se usa esta
  // función si el mapa quedó sin capa de Mapbox (por ejemplo, capa 'osm').
  if (m.mapa.getContainer().dataset.capa !== 'osm') return;
  const { L, mapa } = m;
  mapa.eachLayer((capa) => {
    if (capa instanceof L.TileLayer) mapa.removeLayer(capa);
  });
  let indice = 0;
  let capa = null;
  const poner = () => {
    capa?.remove();
    const f = FUENTES_TESELAS[indice];
    let errores = 0;
    capa = L.tileLayer(f.url, { subdomains: 'abc', maxZoom: 19, attribution: f.atribucion, crossOrigin: false }).addTo(mapa);
    capa.on('tileerror', () => {
      errores += 1;
      if (errores >= 6 && indice < FUENTES_TESELAS.length - 1) {
        indice += 1;
        poner();
      }
    });
  };
  poner();
}

/* ------------------------------------------------------------------ */
/* Marco para pantallas anchas (computador)                            */
/* ------------------------------------------------------------------ */
export function ladoMarco({ titulo, texto, puntos = [], enlaceQR, textoQR }) {
  let qr = '';
  try {
    qr = enlaceQR ? qrSVG(enlaceQR, { redondeado: true, color: PALETA.qr }) : '';
  } catch {
    qr = '';
  }
  return `<aside class="vb-lado" aria-label="Sobre ${esc(MARCA.nombre)}">
    <div class="vb-lado-marca">${insignia(76)}<div><b>${esc(MARCA.nombre)}</b><span>${esc(lineaMarca({ largo: true }))}</span></div></div>
    <h2>${esc(titulo)}</h2>
    <p>${esc(texto)}</p>
    <ul>${puntos.map((p) => `<li>${ic('check', 20)}<span>${esc(p)}</span></li>`).join('')}</ul>
    ${qr ? `<div class="vb-lado-qr" data-enlace-qr="${esc(enlaceQR)}"><div class="vb-lado-qr-img">${qr}</div><span>${esc(textoQR || 'Escanea para abrirla en tu celular')}</span></div>` : ''}
    ${MARCA.principal ? '' : `<p class="vb-lado-pie">${MARCA.propuesta ? `Propuesta de demostración preparada por ${esc(MARCA.proveedor)} para ${esc(MARCA.razonSocial)} · No es la app oficial de la cooperativa.` : `App desarrollada por ${esc(MARCA.proveedor)}.`}</p>`}
  </aside>`;
}

// Dirección para abrir esta misma pantalla en el celular (sin parámetros de
// prueba). Si la página se abrió desde la raíz con ?e=<id>, el QR lleva a la
// carpeta propia de la cooperativa (<id>/app/ o <id>/conductor/).
export function enlaceParaCelular(seccion = 'app/') {
  const u = new URL(location.href);
  u.searchParams.delete('vitrina');
  const propia = new URL(urlEmpresa(seccion));
  if (u.pathname.startsWith(propia.pathname)) return u.href;
  u.searchParams.delete('e');
  propia.search = u.search;
  return propia.href;
}
