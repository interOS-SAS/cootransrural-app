// Piezas compartidas del diseño C «Noche Neón» (app del pasajero y del conductor):
// íconos SVG propios, avisos en pantalla, hojas (diálogos que suben desde abajo),
// anillos de progreso, placa colombiana, casillas de código, deslizador e
// ilustraciones vectoriales (en vez de fotos).

export const COLORES = { fondo: '#07090D', amarillo: '#FFE14D', cian: '#22D3EE', magenta: '#FF4D9D', verde: '#34D399', taxi: '#FFD60A' };

// Capa del mapa: Mapbox «navigation-night» del núcleo. Si Mapbox falla, el
// núcleo pasa a OpenStreetMap y lo oscurece con CSS.
export const CAPA_MAPA = 'oscuro';

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

// Marca como inertes (sin foco ni lector de pantalla) las capas tapadas por
// una pantalla completa o por una hoja, y las devuelve al quitarla.
export function inerte(elementos, si) {
  for (const el of elementos) {
    if (!el) continue;
    if (si) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }
}

// Leaflet deja los marcadores con tabindex=0 y role=button aunque no sean
// interactivos (taxis que pasan, mi punto, origen y destino): el teclado se
// detenía en cada taxi. Aquí se les quita el foco y se ocultan al lector.
export function marcadoresSinFoco(mapa) {
  const panel = mapa.getPane('markerPane');
  const arreglar = () => {
    for (const el of panel.querySelectorAll('.leaflet-marker-icon')) {
      if (el.getAttribute('tabindex') !== '-1') el.setAttribute('tabindex', '-1');
      if (el.hasAttribute('role')) el.removeAttribute('role');
      if (el.getAttribute('aria-hidden') !== 'true') el.setAttribute('aria-hidden', 'true');
    }
  };
  new MutationObserver(arreglar).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'role'] });
  arreglar();
}

export function reducirMovimiento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatoCelular(cel = '') {
  const d = String(cel).replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

export function iniciales(nombre = '') {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
}

/* ------------------------------------------------------------------ */
/* Íconos (trazos de 24 × 24 dibujados para este diseño)              */
/* ------------------------------------------------------------------ */
const TRAZOS = {
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  pin: '<path d="M12 21.5s7-6.1 7-11.8a7 7 0 1 0-14 0c0 5.7 7 11.8 7 11.8z"/><circle cx="12" cy="9.7" r="2.6"/>',
  casa: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  trabajo: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8.5 7V5.2A1.7 1.7 0 0 1 10.2 3.5h3.6a1.7 1.7 0 0 1 1.7 1.7V7"/><path d="M3 12.5h18"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  telefono: '<path d="M5 3.5h3l1.6 4.2-2 1.3a11 11 0 0 0 5.4 5.4l1.3-2 4.2 1.6v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 3 5.7a2 2 0 0 1 2-2.2z"/>',
  chat: '<path d="M20.5 11.6a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.5-4.4a8.4 8.4 0 1 1 15.5-4.5z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" stroke-width="2.6"/>',
  compartir: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  escudo: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="M12 8v4.5M12 15.6h.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m4.5 12.5 4.8 4.8L19.5 7"/>',
  qr: '<rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.2"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.2"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM14 18.5v2M18.5 14h2"/>',
  camara: '<path d="M4 8.5A2 2 0 0 1 6 6.5h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/>',
  billetera: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3"/><rect x="4" y="8" width="16.5" height="11.5" rx="2.5"/><path d="M16 13.8h.01" stroke-width="2.8"/>',
  perfil: '<circle cx="12" cy="8.2" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  viajes: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="6" r="2.4"/><path d="M8.4 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.6"/>',
  mapa: '<path d="m3.5 6.5 5.5-2.5 6 2.5 5.5-2.5v13.5L15 20l-6-2.5-5.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  flecha: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  mira: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5"/>',
  ajustes: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  ayuda: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 16.8h.01"/>',
  salir: '<path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
  taxi: '<path d="M5 11.5 6.8 6.8A2 2 0 0 1 8.7 5.5h6.6a2 2 0 0 1 1.9 1.3l1.8 4.7"/><rect x="3.5" y="11.5" width="17" height="6" rx="2"/><path d="M6 17.5v2M18 17.5v2M10 3.5h4"/><circle cx="7.5" cy="14.5" r=".9" fill="currentColor"/><circle cx="16.5" cy="14.5" r=".9" fill="currentColor"/>',
  efectivo: '<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  regalo: '<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7.5h14V13M12 9v11.5"/><path d="M12 9S10.8 4.5 8.4 4.5a2.2 2.2 0 0 0 0 4.5zM12 9s1.2-4.5 3.6-4.5a2.2 2.2 0 0 1 0 4.5z"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  nota: '<path d="M5 4.5h10l4 4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z"/><path d="M8 11h8M8 15h5"/>',
  power: '<path d="M12 3v8.5"/><path d="M6.6 6.6a7.5 7.5 0 1 0 10.8 0"/>',
  navegar: '<path d="M3.5 11 20.5 3.5 13 20.5l-2-7.5z"/>',
  documento: '<path d="M6.5 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z"/><path d="M13.5 3.5v4h4M9 12.5h6M9 16h6"/>',
  sonido: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  campana: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  volante: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M3.8 10.5c2.6-.9 5.3-1.3 8.2-1.3s5.6.4 8.2 1.3M10.5 14l-3.5 6M13.5 14l3.5 6"/>',
  rayo: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  alerta: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.2M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  celular: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  estrella: '<path d="M12 3.2 14.7 8.8l6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" stroke="none"/>',
  estrellaVacia: '<path d="M12 3.2 14.7 8.8l6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
  antena: '<circle cx="12" cy="12" r="2"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.3 5.3a9.5 9.5 0 0 0 0 13.4M18.7 5.3a9.5 9.5 0 0 1 0 13.4"/>',
  descargar: '<path d="M12 3.5v11M7 10l5 5 5-5M4.5 20h15"/>',
  tarifa: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z"/><circle cx="8" cy="8" r="1.4"/>',
  ruta: '<circle cx="6" cy="5.5" r="2.3"/><path d="M6 8v4.5a3.5 3.5 0 0 0 3.5 3.5h5a3.5 3.5 0 0 1 3.5 3.5"/><path d="M18 21.5h.01" stroke-width="3"/>',
  centro: '<path d="M3.5 20.5h17M5 20.5V10M19 20.5V10M9 20.5V10M15 20.5V10M3.5 10 12 4l8.5 6z"/>',
  salud: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
  educacion: '<path d="m2.5 9 9.5-4.5L21.5 9 12 13.5z"/><path d="M6.5 11v5c1.6 1.5 3.4 2.2 5.5 2.2s3.9-.7 5.5-2.2v-5M21.5 9v5"/>',
  comercio: '<path d="M4 4.5h2l2 11h10l2-8H7.2"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/>',
  barrio: '<path d="M3 20.5V11l5-4 5 4v9.5M13 20.5V8.5L17 5.5l4 3v12M3 20.5h18M7 14.5h2M16 11.5h2M16 15.5h2"/>',
  vereda: '<path d="M12 21V11"/><path d="M12 11c0-3.6 2.4-6 6-6 0 3.6-2.4 6-6 6zM12 14c0-3-2-5-5-5 0 3 2 5 5 5z"/><path d="M4 21h16"/>',
  comida: '<path d="M7 3.5v17M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M17 20.5V3.5c-2.2 0-3.5 2.5-3.5 6s1.3 4.5 3.5 4.5"/>',
  municipio: '<path d="M8 20.5 10.5 3.5M16 20.5 13.5 3.5M12 7v2M12 12v2M12 17v2"/>',
  avion: '<path d="M21 15.5 13.5 11V5.2a1.5 1.5 0 0 0-3 0V11L3 15.5v2l7.5-2.3v3.6l-2 1.5v1.2l3.5-1 3.5 1v-1.2l-2-1.5v-3.6l7.5 2.3z"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  usuarios: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.2a6.5 6.5 0 0 1 3 5.8"/>',
  grafica: '<path d="M4 20.5h16"/><path d="M7 16.5v-4M12 16.5V7M17 16.5v-6.5"/>',
  instalar: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3"/>',
  sala: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  brillo: '<path d="M12 3.5 13.6 10.4 20.5 12l-6.9 1.6L12 20.5l-1.6-6.9L3.5 12l6.9-1.6z"/>',
};

export function icono(nombre, clase = '') {
  return `<svg class="c-ico${clase ? ' ' + clase : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre] || TRAZOS.info}</svg>`;
}

// Ícono propio para cada categoría de lugares (el núcleo trae emojis).
const ICONO_CATEGORIA = { centro: 'centro', salud: 'salud', educacion: 'educacion', comercio: 'comercio', barrio: 'barrio', vereda: 'vereda', comida: 'comida', municipio: 'municipio', bogota: 'avion' };
export function iconoCategoria(cat) {
  return icono(ICONO_CATEGORIA[cat] || 'pin');
}

/* ------------------------------------------------------------------ */
/* Avisos en pantalla (además del sonido y la vibración del núcleo)   */
/* ------------------------------------------------------------------ */
const ICONO_AVISO = { exito: 'check', alerta: 'campana', error: 'alerta', info: 'info', solicitud: 'rayo' };

// Los avisos se apilan como las notificaciones del celular: el más nuevo
// adelante y el anterior asomado detrás, para no tapar medio mapa.
export function crearAvisos(contenedor) {
  const reacomodar = () => {
    const vivos = [...contenedor.children].filter((x) => !x.classList.contains('c-saliendo'));
    vivos.forEach((x, i) => {
      x.classList.toggle('c-aviso-atras', i > 0);
      x.style.zIndex = String(10 - i);
      x.style.height = i > 0 && vivos[0] ? `${vivos[0].offsetHeight}px` : '';
      x.setAttribute('aria-hidden', i > 0 ? 'true' : 'false');
    });
  };
  return function mostrar({ titulo, cuerpo = '', tipo = 'info' } = {}) {
    if (!titulo) return;
    // Algunos textos del núcleo terminan en «a. m.» y luego llevan otro punto.
    const limpio = (t) => String(t || '').replace(/\.\.(?=\s|$)/g, '.');
    const el = document.createElement('div');
    el.className = `c-aviso c-aviso-${ICONO_AVISO[tipo] ? tipo : 'info'}`;
    el.dataset.titulo = titulo;
    el.innerHTML = `<span class="c-aviso-ico">${icono(ICONO_AVISO[tipo] || 'info')}</span><div class="c-aviso-texto"><strong>${esc(limpio(titulo))}</strong>${cuerpo ? `<span>${esc(limpio(cuerpo))}</span>` : ''}</div>`;
    contenedor.prepend(el);
    while (contenedor.children.length > 2) contenedor.lastElementChild.remove();
    reacomodar();
    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      el.classList.add('c-saliendo');
      reacomodar();
      setTimeout(() => el.remove(), reducirMovimiento() ? 0 : 260);
    };
    el.addEventListener('click', cerrar);
    setTimeout(cerrar, { alerta: 6000, solicitud: 6000, error: 5000, exito: 4200 }[tipo] || 3600);
  };
}

// Campo de celular colombiano: acepta espacios, guiones o «+57» pegado y lo
// deja como «300 123 4567» (sin cortar dígitos como haría un maxlength).
export function soloCelular(texto = '') {
  let d = String(texto).replace(/\D/g, '');
  if (d.length > 10 && d.startsWith('57')) d = d.slice(2);
  return d.slice(0, 10);
}
export function montarCelular(input) {
  if (!input) return;
  input.removeAttribute('maxlength');
  const formatear = () => {
    const d = soloCelular(input.value);
    const f = d.length > 6 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d.length > 3 ? `${d.slice(0, 3)} ${d.slice(3)}` : d;
    if (input.value !== f) input.value = f;
  };
  input.addEventListener('input', formatear);
  formatear();
}

/* ------------------------------------------------------------------ */
/* Hojas: diálogos que suben desde abajo                              */
/* ------------------------------------------------------------------ */
export function abrirHoja(contenedor, { titulo, contenido, clase = '', alCerrar = null, persistente = false }) {
  const fondo = document.createElement('div');
  fondo.className = 'c-hoja-fondo';
  if (persistente) fondo.dataset.persistente = '1';
  fondo.innerHTML = `<section class="c-hoja ${clase}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" tabindex="-1">
    <div class="c-hoja-asa" aria-hidden="true"></div>
    <header class="c-hoja-cabeza"><h2>${esc(titulo)}</h2><button type="button" class="c-boton-icono c-boton-icono-chico" data-cerrar-hoja aria-label="Cerrar">${icono('x')}</button></header>
    <div class="c-hoja-cuerpo">${contenido}</div>
  </section>`;
  contenedor.appendChild(fondo);
  const previo = document.activeElement;
  const hoja = fondo.querySelector('.c-hoja');
  // Mientras la hoja está abierta, lo de atrás no recibe foco (diálogo modal).
  const tapados = [...contenedor.children].filter((x) => x !== fondo && !x.classList.contains('c-avisos') && !x.classList.contains('c-hoja-fondo') && !x.hasAttribute('inert'));
  inerte(tapados, true);
  requestAnimationFrame(() => fondo.classList.add('c-abierta'));
  let cerrada = false;
  const tecla = (e) => {
    if (e.key === 'Escape') cerrar();
  };
  function cerrar() {
    if (cerrada) return;
    cerrada = true;
    document.removeEventListener('keydown', tecla);
    inerte(tapados, false);
    fondo.classList.remove('c-abierta');
    setTimeout(() => fondo.remove(), reducirMovimiento() ? 0 : 260);
    try {
      alCerrar?.();
    } finally {
      if (previo?.isConnected) previo.focus?.({ preventScroll: true });
    }
  }
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo || e.target.closest('[data-cerrar-hoja]')) cerrar();
  });
  document.addEventListener('keydown', tecla);
  setTimeout(() => hoja.focus({ preventScroll: true }), 30);
  return { el: hoja, cerrar, get abierta() { return !cerrada; } };
}

// Cierra las hojas abiertas (menos las marcadas como persistentes, p. ej. SOS).
export function cerrarHojas(contenedor, { todas = false } = {}) {
  for (const f of contenedor.querySelectorAll('.c-hoja-fondo')) {
    if (!todas && f.dataset.persistente) continue;
    f.querySelector('[data-cerrar-hoja]')?.click();
  }
}

/* ------------------------------------------------------------------ */
/* Anillos de progreso (ETA, cuenta regresiva, ganancias)             */
/* ------------------------------------------------------------------ */
export function anillo({ tam = 72, grosor = 6, id, clase = '', degradado = [COLORES.amarillo, COLORES.cian], contenido = '', etiqueta = '' }) {
  const r = (tam - grosor) / 2 - 2;
  const c = +(2 * Math.PI * r).toFixed(2);
  const m = tam / 2;
  return `<div class="c-anillo ${clase}" style="--tam:${tam}px"${etiqueta ? ` role="img" aria-label="${esc(etiqueta)}"` : ''}>
    <svg viewBox="0 0 ${tam} ${tam}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${degradado[0]}"/><stop offset="1" stop-color="${degradado[1]}"/></linearGradient></defs>
      <circle class="c-anillo-pista" cx="${m}" cy="${m}" r="${r}" stroke-width="${grosor}"/>
      <circle class="c-anillo-valor" cx="${m}" cy="${m}" r="${r}" stroke-width="${grosor}" stroke="url(#${id})" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${m} ${m})"/>
    </svg>
    <div class="c-anillo-centro">${contenido}</div>
  </div>`;
}

export function fijarAnillo(el, fraccion) {
  const v = el?.querySelector?.('.c-anillo-valor');
  if (!v) return;
  const c = Number(v.getAttribute('stroke-dasharray'));
  const f = Math.max(0, Math.min(1, Number.isFinite(fraccion) ? fraccion : 0));
  v.style.strokeDashoffset = String(c * (1 - f));
}

/* ------------------------------------------------------------------ */
/* Placa colombiana (amarilla con letras negras), avatar y estrellas  */
/* ------------------------------------------------------------------ */
export function placaHTML(placa = '', municipio = 'EL ROSAL') {
  return `<span class="c-placa" role="img" aria-label="Placa ${esc(placa)}"><span class="c-placa-num">${esc(placa)}</span><span class="c-placa-mun">${esc(municipio)}</span></span>`;
}

export function avatarHTML(nombre = '', clase = '') {
  return `<span class="c-avatar ${clase}" aria-hidden="true"><span>${esc(iniciales(nombre))}</span></span>`;
}

export function calificacionTexto(v) {
  return v == null ? '—' : Number(v).toFixed(1).replace('.', ',');
}

export function estrellasFijas(n = 0) {
  const r = Math.round(n);
  return `<span class="c-estrellas-fijas" role="img" aria-label="${r} de 5 estrellas">${Array.from({ length: 5 }, (_, i) => icono(i < r ? 'estrella' : 'estrellaVacia', i < r ? 'c-llena' : '')).join('')}</span>`;
}

// Selector de 1 a 5 estrellas. Devuelve el HTML; montarEstrellas le da vida.
export function estrellasHTML(etiqueta = 'Calificación') {
  return `<div class="c-estrellas" role="radiogroup" aria-label="${esc(etiqueta)}">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="c-estrella" role="radio" aria-checked="false" data-estrella="${n}" aria-label="${n} ${n === 1 ? 'estrella' : 'estrellas'}">${icono('estrella')}</button>`)
    .join('')}</div>`;
}

const TEXTO_ESTRELLAS = ['Toca para calificar', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'];
export function montarEstrellas(contenedor, alCambiar) {
  const botones = $$('.c-estrella', contenedor);
  const fijar = (n) => {
    botones.forEach((b, i) => {
      b.classList.toggle('c-activa', i < n);
      b.setAttribute('aria-checked', String(i + 1 === n));
    });
    alCambiar?.(n, TEXTO_ESTRELLAS[n]);
  };
  botones.forEach((b) => b.addEventListener('click', () => fijar(Number(b.dataset.estrella))));
  return { fijar };
}
export { TEXTO_ESTRELLAS };

/* ------------------------------------------------------------------ */
/* Casillas para códigos de 4 dígitos                                 */
/* ------------------------------------------------------------------ */
export function montarCasillas(contenedor, { n = 4, etiqueta = 'Código', alCompletar } = {}) {
  contenedor.innerHTML = Array.from({ length: n }, (_, i) => `<input class="c-casilla" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="${esc(etiqueta)}: dígito ${i + 1} de ${n}">`).join('');
  const inputs = $$('input', contenedor);
  const valor = () => inputs.map((i) => i.value).join('');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => {
      const d = inp.value.replace(/\D/g, '');
      if (d.length > 1) {
        d.split('').slice(0, n - i).forEach((ch, k) => (inputs[i + k].value = ch));
        inputs[Math.min(n - 1, i + d.length)].focus();
      } else {
        inp.value = d;
        if (d && i < n - 1) inputs[i + 1].focus();
      }
      contenedor.classList.remove('c-error-casillas');
      if (valor().length === n) alCompletar?.(valor());
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !inp.value && i > 0) {
        inputs[i - 1].value = '';
        inputs[i - 1].focus();
        e.preventDefault();
      }
    });
    inp.addEventListener('focus', () => inp.select());
  });
  return {
    inputs,
    valor,
    limpiar() {
      inputs.forEach((x) => (x.value = ''));
      inputs[0].focus();
    },
    error() {
      contenedor.classList.remove('c-error-casillas');
      void contenedor.offsetWidth;
      contenedor.classList.add('c-error-casillas');
    },
    enfocar() {
      inputs[0].focus();
    },
  };
}

/* ------------------------------------------------------------------ */
/* «Desliza para pedir» (también funciona con un toque o con teclado) */
/* ------------------------------------------------------------------ */
export function deslizadorHTML(texto = 'Desliza para pedir', etiqueta = 'Pedir taxi') {
  return `<div class="c-desliza" data-deslizador>
    <div class="c-desliza-relleno" aria-hidden="true"></div>
    <span class="c-desliza-texto" aria-hidden="true">${esc(texto)}</span>
    <button type="button" class="c-desliza-perilla" aria-label="${esc(etiqueta)} (toca o desliza)">${icono('flecha')}</button>
  </div>`;
}

export function montarDeslizador(el, alConfirmar) {
  const perilla = el.querySelector('.c-desliza-perilla');
  let x0 = null;
  let dx = 0;
  let max = 0;
  let arrastro = false;
  let hecho = false;
  const medir = () => (max = Math.max(1, el.clientWidth - perilla.offsetWidth - 12));
  const fijar = (x) => {
    perilla.style.transform = `translateX(${x}px)`;
    el.style.setProperty('--avance', String(x / max));
  };
  const confirmar = () => {
    if (hecho) return;
    hecho = true;
    medir();
    el.classList.add('c-hecho');
    fijar(max);
    setTimeout(alConfirmar, reducirMovimiento() ? 0 : 240);
  };
  perilla.addEventListener('pointerdown', (e) => {
    if (hecho) return;
    medir();
    x0 = e.clientX;
    dx = 0;
    arrastro = false;
    perilla.setPointerCapture?.(e.pointerId);
    el.classList.add('c-arrastrando');
  });
  perilla.addEventListener('pointermove', (e) => {
    if (x0 == null) return;
    dx = Math.max(0, Math.min(max, e.clientX - x0));
    if (dx > 8) arrastro = true;
    fijar(dx);
  });
  const soltar = () => {
    if (x0 == null) return;
    x0 = null;
    el.classList.remove('c-arrastrando');
    if (arrastro && dx >= max * 0.78) confirmar();
    else if (arrastro) fijar(0);
  };
  perilla.addEventListener('pointerup', soltar);
  perilla.addEventListener('pointercancel', () => {
    x0 = null;
    el.classList.remove('c-arrastrando');
    fijar(0);
  });
  perilla.addEventListener('click', () => {
    if (arrastro) {
      arrastro = false;
      return;
    }
    confirmar();
  });
  // Tocar la pista también pide (alternativa de un toque).
  el.addEventListener('click', (e) => {
    if (!e.target.closest('.c-desliza-perilla')) confirmar();
  });
  return {
    reiniciar() {
      hecho = false;
      el.classList.remove('c-hecho');
      fijar(0);
    },
  };
}

/* ------------------------------------------------------------------ */
/* Ilustraciones vectoriales                                          */
/* ------------------------------------------------------------------ */
// Taxi tipo Kia Picanto (hatchback compacto) de perfil, con franja de cuadros,
// rines de cinco radios y brillo neón. `id` evita choques de ids entre copias.
function rueda(cx, cy) {
  const radios = [0, 72, 144, 216, 288].map((g) => `<path d="M${cx} ${cy}V${cy - 11.5}" transform="rotate(${g} ${cx} ${cy})"/>`).join('');
  return `<g class="c-ilus-rueda">
    <circle cx="${cx}" cy="${cy}" r="22" fill="#0B0D12" stroke="#22D3EE" stroke-width="2.6"/>
    <circle cx="${cx}" cy="${cy}" r="14.5" fill="#161C28" stroke="#5B6577" stroke-width="1.2"/>
    <g stroke="#C9D2E0" stroke-width="3.4" stroke-linecap="round">${radios}</g>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#FFE14D"/>
  </g>`;
}
export function ilustracionTaxi(id = 'tx', { movil = '023' } = {}) {
  const cuerpo = 'M40 132 L34 128 Q30 125 30 119 L30 104 Q30 98 35 96 L39 94 L45 70 Q49 58 63 56 L180 52 Q192 52 200 58 L236 86 Q240 89 247 89.6 L294 94 Q311 97 316 108 L318 120 Q318 128 311 130.5 L300 132 L281 132 A27 27 0 0 0 227 132 L119 132 A27 27 0 0 0 65 132 Z';
  return `<svg class="c-ilus-taxi" viewBox="0 0 340 172" role="img" aria-label="Taxi amarillo de Cootransrural, móvil ${esc(movil)}">
  <defs>
    <linearGradient id="${id}-carro" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF08A"/><stop offset=".45" stop-color="#FFD60A"/><stop offset="1" stop-color="#E2A100"/></linearGradient>
    <linearGradient id="${id}-vidrio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22324F"/><stop offset=".55" stop-color="#0B1220"/><stop offset="1" stop-color="#22D3EE" stop-opacity=".6"/></linearGradient>
    <linearGradient id="${id}-piso" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE" stop-opacity="0"/><stop offset=".5" stop-color="#22D3EE"/><stop offset="1" stop-color="#FF4D9D" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}-faro" cx="0" cy=".5" r="1"><stop offset="0" stop-color="#FFF6C2" stop-opacity=".95"/><stop offset="1" stop-color="#FFE14D" stop-opacity="0"/></radialGradient>
    <pattern id="${id}-cuadros" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#0B0D12"/><rect width="4" height="4" fill="#FFE14D"/><rect x="4" y="4" width="4" height="4" fill="#FFE14D"/></pattern>
    <clipPath id="${id}-recorte"><path d="${cuerpo}"/></clipPath>
    <filter id="${id}-brillo" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <g class="c-ilus-velocidad" stroke-linecap="round">
    <path d="M4 72h38" stroke="#22D3EE" stroke-width="3" opacity=".8"/>
    <path d="M0 94h28" stroke="#FF4D9D" stroke-width="3" opacity=".7"/>
    <path d="M8 114h20" stroke="#FFE14D" stroke-width="3" opacity=".6"/>
  </g>
  <ellipse cx="176" cy="154" rx="150" ry="8" fill="#22D3EE" opacity=".16"/>
  <path d="M28 153h296" stroke="url(#${id}-piso)" stroke-width="2"/>
  <path d="M316 104 L340 92 V128 L316 116 Z" fill="url(#${id}-faro)" opacity=".8"/>
  <g filter="url(#${id}-brillo)">
    <rect x="102" y="37" width="56" height="15" rx="5" fill="#0B0D12" stroke="#FFE14D" stroke-width="1.5"/>
    <text x="130" y="48.4" font-family="Outfit, Arial, sans-serif" font-size="10.5" font-weight="800" fill="#FFE14D" text-anchor="middle" letter-spacing="1.6">TAXI</text>
    <path d="${cuerpo}" fill="url(#${id}-carro)" stroke="#FFF3A6" stroke-width="1.3"/>
  </g>
  <rect x="112" y="51.5" width="36" height="3" rx="1.5" fill="#0B0D12"/>
  <g clip-path="url(#${id}-recorte)">
    <rect x="28" y="104" width="292" height="8" fill="url(#${id}-cuadros)"/>
    <path d="M30 128 H320 V134 H30Z" fill="#0B0D12" opacity=".28"/>
  </g>
  <path d="M52 93 L58 70 Q61 62 70 61 L178 57 Q188 57 195 63 L226 90.5 Z" fill="url(#${id}-vidrio)" stroke="#0B0D12" stroke-width="2" stroke-linejoin="round"/>
  <path d="M84 60 L98 59.5 L96 93 L80 93 Z M188 57.6 L196 58.6 L224 90.3 L216 90.6 Z" fill="url(#${id}-carro)"/>
  <rect x="146" y="57.5" width="7" height="35" fill="#0B0D12"/>
  <path d="M104 64 l16 -1 -22 26 h-9z M160 62 l13 -1 -20 25 h-8z" fill="#fff" opacity=".16"/>
  <path d="M58 95.5 L300 98" stroke="#FFFBD1" stroke-width="1.6" opacity=".55"/>
  <g stroke="#0B0D12" stroke-width="1.4" fill="none" opacity=".55"><path d="M101 94 V106 M149.5 93 V112 M223 92 V130"/></g>
  <g fill="#0B0D12" opacity=".75"><rect x="128" y="96" width="12" height="3" rx="1.5"/><rect x="194" y="96" width="12" height="3" rx="1.5"/></g>
  <path d="M218 89 l9 -7 h6 v8 z" fill="#0B0D12"/>
  <rect x="120" y="114.5" width="26" height="12" rx="4" fill="#0B0D12"/>
  <text x="133" y="123.6" font-family="Outfit, Arial, sans-serif" font-size="8.4" font-weight="800" fill="#FFE14D" text-anchor="middle" letter-spacing=".5">${esc(movil)}</text>
  <text x="185.5" y="123.4" font-family="Outfit, Arial, sans-serif" font-size="7.2" font-weight="800" fill="#0B0D12" text-anchor="middle" letter-spacing=".7">COOTRANSRURAL</text>
  <path d="M296 98.5 Q309 100.5 314 107.5 L302 108 Q295 105 296 98.5 Z" fill="#FFF6C2"/>
  <rect x="300" y="117" width="16" height="5" rx="2.5" fill="#0B0D12" opacity=".8"/>
  <rect x="33" y="73" width="7" height="19" rx="3" fill="#FF4D9D"/>
  <rect x="30" y="109" width="8" height="5" rx="2" fill="#0B0D12" opacity=".7"/>
  ${rueda(92, 130)}
  ${rueda(254, 130)}
</svg>`;
}

// Fondo de la bienvenida: cuadrícula de calles nocturnas con una ruta neón.
export function ilustracionRuta(id = 'rt') {
  return `<svg class="c-ilus-ruta" viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-linea" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#22D3EE"/><stop offset=".55" stop-color="#FFE14D"/><stop offset="1" stop-color="#FF4D9D"/></linearGradient>
    <radialGradient id="${id}-halo" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#22D3EE" stop-opacity=".22"/><stop offset="1" stop-color="#07090D" stop-opacity="0"/></radialGradient>
    <filter id="${id}-neon" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="390" height="300" fill="url(#${id}-halo)"/>
  <g stroke="#FFFFFF" stroke-opacity=".07" stroke-width="10" fill="none">
    <path d="M-10 60 Q120 90 210 40 T400 70"/><path d="M-10 170 Q90 150 200 190 T400 160"/><path d="M60 -10 Q80 120 40 310"/><path d="M250 -10 Q230 130 300 310"/><path d="M150 -10 Q170 150 130 310"/>
  </g>
  <g stroke="#FFFFFF" stroke-opacity=".05" stroke-width="3" fill="none">
    <path d="M-10 110 H400"/><path d="M-10 235 H400"/><path d="M340 -10 V310"/><path d="M-10 20 L400 280"/>
  </g>
  <path class="c-ilus-trazo" d="M70 236 C 110 200, 120 150, 175 150 S 250 120, 300 70" fill="none" stroke="url(#${id}-linea)" stroke-width="5" stroke-linecap="round" filter="url(#${id}-neon)"/>
  <g filter="url(#${id}-neon)">
    <circle cx="70" cy="236" r="9" fill="#07090D" stroke="#22D3EE" stroke-width="4"/>
    <path d="M300 48c-9 0-16 7-16 15.5 0 11 16 24.5 16 24.5s16-13.5 16-24.5C316 55 309 48 300 48z" fill="#FF4D9D"/><circle cx="300" cy="63.5" r="5.5" fill="#07090D"/>
  </g>
  <g fill="#FFE14D" opacity=".9"><circle cx="40" cy="80" r="1.6"/><circle cx="350" cy="190" r="1.4"/><circle cx="210" cy="260" r="1.4"/><circle cx="120" cy="40" r="1.2"/><circle cx="360" cy="30" r="1.6"/></g>
</svg>`;
}

/* ------------------------------------------------------------------ */
/* Escena: en pantallas anchas la app va en una columna tipo celular  */
/* ------------------------------------------------------------------ */
export function escenaHTML({ tipo = 'pasajero', contenido }) {
  const pasajero = tipo === 'pasajero';
  return `<div class="c-escena">
    <aside class="c-lateral" aria-label="Sobre Cootransrural">
      <div class="c-lateral-marca"><img src="../img/icono.svg" alt="" width="56" height="56"><div><strong>Cootransrural</strong><span>Más que transporte, confianza</span></div></div>
      <h2>${pasajero ? 'Tu taxi de El Rosal, <em>en tu celular</em>.' : 'La cabina del conductor, <em>en tu celular</em>.'}</h2>
      <ul>
        ${pasajero
          ? `<li>${icono('pin')}Pide con tu ubicación exacta</li><li>${icono('escudo')}Móvil, placa y código de abordaje</li><li>${icono('qr')}Paga con QR o en efectivo</li>`
          : `<li>${icono('rayo')}Solicitudes cercanas al instante</li><li>${icono('navegar')}Ruta al pasajero y al destino</li><li>${icono('qr')}Cobro con QR y ganancias del día</li>`}
      </ul>
      <p class="c-lateral-pie">52 taxis · 3 microbuses · 105 asociados · servicio 24 horas</p>
    </aside>
    ${contenido}
  </div>`;
}
