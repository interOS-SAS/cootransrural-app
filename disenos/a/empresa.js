// Datos de la cooperativa activa, listos para el diseño A «Ámbar Urbano».
// La app sirve para varias cooperativas: todo lo que antes estaba escrito a mano
// (nombre, municipio, teléfono, número de taxis, colores de marca…) sale de la
// ficha (empresas/<id>/ficha.json) a través del núcleo. Aquí se resuelve qué
// mostrar cuando un dato falta: nunca «null», «undefined» ni un enlace vacío.
import * as N from '../../nucleo/index.js';

const E = N.EMPRESA || {};
const esc = (t) => N.escaparHTML(t ?? '');
const limpio = (v) => (v == null ? '' : String(v).trim());
const digitos = (v) => limpio(v).replace(/\D/g, '');

export const ID = N.ID_EMPRESA;
export const ES_PRINCIPAL = ID === 'cootransrural';
export const ES_PROPUESTA = Boolean(N.ES_PROPUESTA);

// Modo real (servidor taxicun.com/api) y app nativa (Capacitor). Las decide el
// núcleo (nucleo/plataforma.js); las pantallas preguntan EM.MODO_REAL igual que
// preguntan EM.EN_TAXICUN. Sin ?real=1 y fuera de la app nativa, las dos son
// falsas y todo queda como en la demo.
export const MODO_REAL = Boolean(N.MODO_REAL);
export const ES_NATIVA = Boolean(N.ES_NATIVA);

// Texto en español para un error del servidor (ErrorServidor o el código suelto).
// Lo traduce el núcleo (nucleo/servidor.js); si faltara, una frase genérica.
export function textoError(e) {
  const traducir = N.textoError || N.servidor?.textoError;
  if (typeof traducir === 'function') return traducir(e);
  return 'Algo falló. Intenta de nuevo.';
}

// Rodeo de un fallo del núcleo: si la ficha que pide la página (window.CT_EMPRESA o
// ?e=) no carga, nucleo/config.js cae en silencio a Cootransrural. En la página de
// otra cooperativa eso mostraría (y guardaría) datos de Cootransrural; mejor un
// aviso claro con «Reintentar».
const PEDIDA = String(globalThis.CT_EMPRESA || new URLSearchParams(globalThis.location?.search || '').get('e') || '')
  .toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
export const FICHA_EQUIVOCADA = Boolean(PEDIDA) && PEDIDA !== ID;

export function pantallaSinFicha(raiz) {
  raiz.innerHTML = `<div class="a-sin-ficha" role="alert">
    <svg viewBox="0 0 24 24" width="56" height="56" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><path d="M12 7.5v3.5M12 13.6v.1"/></svg>
    <h1>No pudimos abrir la app</h1>
    <p>Faltan los datos de la cooperativa. Revisa tu conexión a internet y vuelve a intentarlo.</p>
    <button type="button" class="a-btn a-btn-primario a-btn-grande" data-reintentar>Reintentar</button>
  </div>`;
  raiz.querySelector('[data-reintentar]').addEventListener('click', () => location.reload());
}

// Nombres.
// «cooperativa» o «empresa» (ver nucleo/config.js).
export const TIPO = N.TIPO_EMPRESA || 'cooperativa';
export const NOMBRE = limpio(E.nombreCorto) || limpio(E.nombre) || 'la cooperativa';
export const NOMBRE_LARGO = limpio(E.nombre) || NOMBRE;
export const RAZON_SOCIAL = limpio(E.razonSocial) || NOMBRE_LARGO;
export const LEMA = limpio(E.lema);
export const PUEBLO = limpio(E.pueblo) || limpio(E.municipio).split(',')[0].trim() || 'tu municipio';
export const DIRECCION = limpio(E.direccion);
export const PROVEEDOR = limpio(N.PROVEEDOR?.nombre) || 'interOS';

// Contacto: solo cuenta si hay un número de verdad.
export const TELEFONO = digitos(E.telefono).length >= 7 ? digitos(E.telefono) : '';
export const TELEFONO_VISIBLE = TELEFONO ? limpio(E.telefonoVisible) || TELEFONO : '';
export const WHATSAPP = digitos(E.whatsapp).length >= 10 ? digitos(E.whatsapp) : '';
export const CORREO = N.enlaceCorreo(limpio(E.correo)) ? limpio(E.correo) : '';
export const SERVICIO_24H = E.servicio24h !== false;

// Cifras: si no se conocen, no se muestran.
const entero = (v) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);
export const TAXIS = entero(E.taxis);
export const MICROBUSES = entero(E.microbuses);
export const ASOCIADOS = entero(E.asociados);
export const FUNDADA = entero(E.fundada) && Number(E.fundada) > 1900 ? Number(E.fundada) : null;
export const VEHICULO = limpio(E.vehiculo) || 'Taxi';
// Algunas fichas traen solo un aproximado de la flota (por ejemplo «100+»).
export const FLOTA_APROX = !TAXIS && /^\d+\+?$/.test(limpio(E.vehiculos)) ? limpio(E.vehiculos).replace(/^(\d+)\+$/, 'Más de $1') : '';

// Municipio que va abajo en la placa del taxi.
export const MUNICIPIO_PLACA = PUEBLO.toLocaleUpperCase('es-CO');

// Móviles de la demo del conductor: los de la ficha (Cootransrural conserva el 023).
const MOVILES_DEMO = (N.CONDUCTORES_DEMO || []).map((c) => String(c.movil || '').padStart(3, '0')).filter((m) => /^\d{3}$/.test(m) && m !== '000');
export const MOVIL_DEMO = MOVILES_DEMO.includes('023') ? '023' : MOVILES_DEMO[0] || '001';
export const MOVIL_DEMO_2 = MOVILES_DEMO.filter((m) => m !== MOVIL_DEMO).slice(-1)[0] || MOVIL_DEMO;
// ¿El número de taxis es aproximado? (la ficha lo anota en datosPendientes, igual
// que lee la web: «número exacto de taxis»).
const PENDIENTES = (Array.isArray(E.datosPendientes) ? E.datosPendientes : []).join(' ').toLowerCase();
export const TAXIS_APROX = Boolean(TAXIS) && PENDIENTES.includes('exacto de taxis');
// Número de móvil más alto que se acepta al ingresar. Si no se sabe cuántos taxis
// hay (o es un aproximado), cualquier móvil de 3 dígitos: 999.
export const MOVIL_MAXIMO = TAXIS && !TAXIS_APROX ? Math.max(TAXIS, ...MOVILES_DEMO.map(Number)) : 999;

// Texto corto de la flota: «52 taxis», «Unos 20 taxis», «Más de 100 vehículos»,
// o nada si no se sabe.
export const textoTaxis = (sufijo = '') => {
  if (TAXIS) return `${TAXIS_APROX ? 'Unos ' : ''}${TAXIS} taxis${sufijo}`;
  return FLOTA_APROX ? `${FLOTA_APROX} vehículos${sufijo}` : '';
};

// Tarjeta de viajes: solo si la ficha trae la regla (viajesFidelidad). Rodea un
// fallo del núcleo: sin ese dato, N.progresoFidelidad devuelve NaN y undefined.
// En modo real no hay tarjeta: la cuenta viviría solo en este celular y ni la
// cooperativa ni la central la respaldan (el núcleo tampoco aplica el descuento).
export function fidelidad(completados) {
  if (MODO_REAL) return null;
  const f = N.progresoFidelidad(completados);
  return f && Number.isFinite(f.meta) && f.meta > 0 && Number.isFinite(f.completados) ? f : null;
}

// Zona de servicio (fase 2 del panel, §5.7): { poligonos, avisarHastaKm, texto } o null. Solo la traen
// las cooperativas con configuración publicada en el panel; las 76 demos no.
export const ZONA_SERVICIO = N.ZONA_SERVICIO || null;
// Versión de la configuración publicada ({ version, publicada, fuente }) o null (archivo de git).
export const VERSION_CONFIG = N.VERSION_CONFIG || null;

// ¿Las tarifas de la ficha son de ejemplo (la cooperativa aún no confirma las oficiales)?
export const TARIFAS_EJEMPLO = Boolean(N.TARIFAS?.ejemplo);
// ¿Tiene tabla oficial de precios (Cootransrural: Decreto 05 de 2026 de El Rosal)?
export const TARIFAS_OFICIALES = Boolean(N.TARIFAS_OFICIALES);

// Sin GPS se propone el paradero de taxis de la ficha (El Rosal: Decreto 89 de 2026, que
// prohíbe recoger en el parque principal) o, si no hay, el centro del pueblo.
const minuscula = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
export const TEXTO_SIN_GPS = N.PARADERO?.nombre
  ? `Usamos el ${minuscula(limpio(N.PARADERO.nombre))}. Mueve el mapa para ubicar tu punto.`
  : `Usamos el centro de ${PUEBLO}. Mueve el mapa para ubicar tu punto.`;
// Lugares de la ficha donde no se puede recoger (noRecoger: el parque principal de El Rosal).
export const LUGARES_SIN_RECOGIDA = (N.LUGARES || []).filter((l) => l && l.noRecoger && Number.isFinite(l.lat) && Number.isFinite(l.lng));

// Une piezas de texto omitiendo las vacías.
export const unir = (piezas, sep = ' · ') => piezas.filter((x) => x != null && String(x).trim() !== '').join(sep);

/* ------------------------------------------------------------------ */
/* Colores de marca                                                    */
/* ------------------------------------------------------------------ */
const HEX = /^#[0-9a-f]{6}$/i;
const color = (v, porDefecto) => (HEX.test(limpio(v)) ? limpio(v) : porDefecto);
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function luminancia(h) {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrasteConBlanco = (h) => 1.05 / (luminancia(h) + 0.05);
function mezclarConBlanco(h, fraccion) {
  return `#${rgb(h).map((v) => Math.round(v * fraccion + 255 * (1 - fraccion)).toString(16).padStart(2, '0')).join('')}`;
}

const C = N.COLORES || {};
const PRIMARIO = color(C.primario, '#0A5C33');
const OSCURO = color(C.oscuro, '#121212');
// La marca se usa también como color de texto sobre blanco: si el primario es muy
// claro, se cae al oscuro de la cooperativa (y si tampoco alcanza, a la tinta).
const MARCA = contrasteConBlanco(PRIMARIO) >= 4.5 ? PRIMARIO : contrasteConBlanco(OSCURO) >= 4.5 ? OSCURO : '#121212';
// El segundo tono va de fondo bajo letra blanca (tarjeta de viajes): si no da el
// contraste, se usa el mismo de la marca.
const MARCA_2 = color(C.primario2, MARCA);
export const COLORES = {
  marca: MARCA,
  marca2: contrasteConBlanco(MARCA_2) >= 4.5 ? MARCA_2 : MARCA,
  oscuro: OSCURO,
  marcaClaro: mezclarConBlanco(MARCA, 0.1),
  acento: color(C.acento, '#F2B705'),
};

// Nombre y muestra del diseño B en el selector de Ajustes: en Cootransrural es
// «Verde Rosal»; en las demás lleva los colores de la cooperativa (el mismo nombre
// que usa la vitrina, o el que traiga la ficha en disenos.b.nombre).
const NOMBRE_B_FICHA = limpio(N.FICHA?.disenos?.b?.nombre);
export const DISENO_B = {
  nombre: NOMBRE_B_FICHA || (ES_PRINCIPAL ? 'Verde Rosal' : `Color de la ${TIPO}`),
  colores: ES_PRINCIPAL ? ['#0B6B3A', '#FBF8F1', '#F2B705'] : [color(C.primario2, PRIMARIO), '#FBF8F1', COLORES.acento],
};

// Pone los colores de la cooperativa en las variables del diseño (detalles de marca).
// El ámbar y la tinta del diseño A no cambian.
export function aplicarColores(nodo = document.documentElement) {
  nodo.style.setProperty('--a-marca', COLORES.marca);
  nodo.style.setProperty('--a-marca-2', COLORES.marca2);
  nodo.style.setProperty('--a-marca-claro', COLORES.marcaClaro);
}

// Foto de fondo del panel de escritorio: la de la ficha, si la trae (imagenes.hero
// para el pasajero; imagenes.noche o la misma para el conductor).
export function aplicarFoto(nodo, { conductor = false } = {}) {
  const img = N.FICHA?.imagenes || {};
  const propia = conductor ? img.noche || img.conductor || img.hero : img.hero;
  const valida = typeof propia === 'string' && /^[\w\/.-]+\.(?:jpe?g|png|webp)$/i.test(propia) && !propia.includes('..');
  // Siempre con URL absoluta: una relativa dentro de una variable CSS se resolvería
  // contra la página (y <id>/app/ está un nivel más abajo que app/).
  const ruta = valida ? propia : conductor ? 'img/web/noche.jpg' : 'img/web/hero.jpg';
  nodo.style.setProperty('--a-foto', `url("${N.urlDelSitio(ruta)}")`);
}

/* ------------------------------------------------------------------ */
/* Ícono de la app                                                     */
/* ------------------------------------------------------------------ */
// Cootransrural usa el ícono de siempre. Las demás cooperativas no llevan logo
// (no nos lo han dado y en las propuestas no se debe usar): el mismo pin con taxi
// de la app, pintado con sus colores.
let serie = 0;
export function marcaIcono(tam = 40, { clase = '', png = false } = {}) {
  if (ES_PRINCIPAL) {
    const src = N.urlDelSitio(png ? 'img/icono-192.png' : 'img/icono.svg');
    return `<img class="a-marca-ico ${clase}" src="${esc(src)}" alt="" width="${tam}" height="${tam}">`;
  }
  const f = `a-mf${++serie}`;
  const t = `a-mt${serie}`;
  return `<svg class="a-marca-ico ${clase}" viewBox="0 0 512 512" width="${tam}" height="${tam}" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="${f}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COLORES.marca2}"/><stop offset="1" stop-color="${COLORES.oscuro}"/></linearGradient>
      <linearGradient id="${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD54A"/><stop offset="1" stop-color="#F5A400"/></linearGradient>
    </defs>
    <rect width="512" height="512" rx="112" fill="url(#${f})"/>
    <circle cx="256" cy="232" r="168" fill="#fff" opacity=".06"/>
    <path d="M256 70c-56 0-100 43-100 97 0 70 100 158 100 158s100-88 100-158c0-54-44-97-100-97z" fill="#E53935"/>
    <circle cx="256" cy="166" r="40" fill="#fff"/>
    <g transform="translate(96 250)">
      <rect x="120" y="0" width="80" height="26" rx="8" fill="#1B1B1B"/>
      <path d="M58 92 L92 34 Q98 24 112 24 H208 Q222 24 228 34 L262 92 Z" fill="url(#${t})"/>
      <path d="M86 88 L108 46 Q112 40 120 40 H200 Q208 40 212 46 L234 88 Z" fill="#14324A"/>
      <rect x="22" y="86" width="276" height="96" rx="34" fill="url(#${t})"/>
      <rect x="22" y="132" width="276" height="16" fill="#1B1B1B" opacity=".9"/>
      <circle cx="74" cy="118" r="20" fill="#FFF8D6"/><circle cx="246" cy="118" r="20" fill="#FFF8D6"/>
      <rect x="118" y="152" width="84" height="22" rx="5" fill="#fff"/>
      <rect x="34" y="174" width="52" height="40" rx="12" fill="#1B1B1B"/><rect x="234" y="174" width="52" height="40" rx="12" fill="#1B1B1B"/>
    </g>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* TaxiCun: la app de todas las cooperativas                            */
/* ------------------------------------------------------------------ */
// La app se llama TaxiCun y la desarrolla interOS. Cada cooperativa conserva su
// nombre y sus colores dentro de la app. EN_TAXICUN: la página es la app única
// (taxicun/), que escoge la cooperativa por el sticker, el GPS o la lista.
export const EN_TAXICUN = Boolean(N.EN_TAXICUN);
export const APP = limpio(N.MARCA?.nombre) || 'TaxiCun';
export const DESARROLLADOR = limpio(N.MARCA?.desarrollador) || PROVEEDOR;
export const LEMA_APP = limpio(N.MARCA?.lema) || 'Tu taxi de confianza en Cundinamarca';
export const TEXTO_DESARROLLO = EN_TAXICUN ? `${APP} · desarrollada por ${DESARROLLADOR}` : `Esta app es ${APP}, desarrollada por ${DESARROLLADOR}`;
// «TaxiCun · Coptaxi» dentro de TaxiCun; fuera, solo el nombre de la cooperativa.
export const NOMBRE_EN_APP = EN_TAXICUN ? `${APP} · ${NOMBRE}` : NOMBRE;

// Ícono de TaxiCun (el de la pantalla de inicio del celular).
export function iconoApp(tam = 40, clase = '') {
  const src = N.urlDelSitio(N.MARCA?.icono || 'img/taxicun/icono-192.png');
  return `<img class="a-tc-ico ${clase}" src="${esc(src)}" alt="" width="${tam}" height="${tam}" decoding="async">`;
}

// La palabra «TaxiCun» como en el logo («Cun» de otro color).
export function palabraApp() {
  return APP === 'TaxiCun' ? '<span class="a-tc-palabra">Taxi<span>Cun</span></span>' : `<span class="a-tc-palabra">${esc(APP)}</span>`;
}

// Ícono de TaxiCun con el de la cooperativa en la esquina: «TaxiCun · <cooperativa>».
export function marcaApp(tam = 38) {
  return `<span class="a-tc-duo" style="--a-tc-tam:${tam}px">${iconoApp(tam)}${marcaIcono(Math.round(tam * 0.5), { clase: 'a-tc-duo-coop' })}</span>`;
}

// Encabezado de marca: dentro de TaxiCun, «TaxiCun · Coptaxi» con el ícono de
// TaxiCun; fuera, la cooperativa con su ícono (como siempre).
export function encabezadoMarca({ tam = 36, detalle = '' } = {}) {
  if (!EN_TAXICUN) return `${marcaIcono(tam)}<span><strong>${esc(NOMBRE)}</strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</span>`;
  return `${marcaApp(tam)}<span><strong class="a-tc-titulo">${palabraApp()}<span class="a-tc-punto"> · </span><span class="a-tc-coop">${esc(NOMBRE)}</span></strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</span>`;
}

// Enlace a la otra app (pasajero ↔ conductor). Dentro de TaxiCun se queda en
// taxicun/… con la cooperativa (?e=); fuera, va a las páginas de la cooperativa.
// Fuera conserva el diseño (?d=); dentro, solo si la página lo trae en la URL (si
// no, la otra app usa el mismo diseño guardado o el que eligió la cooperativa).
export function urlOtraApp(rol, diseno) {
  const conDiseno = !EN_TAXICUN || new URLSearchParams(globalThis.location?.search || '').has('d');
  return N.urlInterna(N.urlApp(rol, { d: conDiseno ? diseno : '' }));
}

// Cambiar de municipio (solo dentro de TaxiCun): vuelve a la lista de cooperativas.
export function urlCambiarMunicipio(rol = 'pasajero') {
  return EN_TAXICUN ? N.urlInterna(N.urlElegirMunicipio(rol)) : '';
}

/* ------------------------------------------------------------------ */
/* Propuestas y almacenamiento                                          */
/* ------------------------------------------------------------------ */
export const TEXTO_PROPUESTA = `Demostración de ${APP} para ${RAZON_SOCIAL} · No es la página oficial de la ${TIPO}`;

// Las propuestas no se indexan (la plantilla debería traerlo; si no, se agrega aquí).
export function marcarNoIndexar() {
  if (!ES_PROPUESTA || document.querySelector('meta[name="robots"]')) return;
  const m = document.createElement('meta');
  m.name = 'robots';
  m.content = 'noindex';
  document.head.append(m);
}

// Claves propias del diseño A. Cootransrural conserva las de siempre; las demás
// cooperativas guardan lo suyo aparte (mismo sitio, varias cooperativas).
export const clave = (nombre) => (ES_PRINCIPAL ? `ct.a.${nombre}` : `ct.a.${ID}.${nombre}`);

// Página de privacidad de la cooperativa (el generador la crea para cada ficha:
// privacidad/ en la raíz para Cootransrural y <id>/privacidad/ para las demás).
// En modo real los datos los guarda TaxiCun (interOS) en su servidor: se enlaza la
// política de TaxiCun, en privacidad/ de la raíz del sitio.
export function urlPrivacidad() {
  return N.urlInterna(MODO_REAL ? N.urlDelSitio('privacidad/') : N.urlEmpresa('privacidad/'));
}
