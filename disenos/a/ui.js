// Piezas de interfaz del diseño A «Ámbar Urbano»: íconos propios en SVG,
// hoja inferior arrastrable, avisos en pantalla, diálogos, paneles, menú
// lateral, estrellas, placa, casillas de código y «deslizar para aceptar».
// Las comparten la app del pasajero y la del conductor.
import * as N from '../../nucleo/index.js';
import * as EM from './empresa.js';

export const esc = (t) => N.escaparHTML(t ?? '');
export const $ = (raiz, sel) => raiz.querySelector(sel);
export const $$ = (raiz, sel) => [...raiz.querySelectorAll(sel)];
export const limitar = (v, a, b) => Math.min(b, Math.max(a, v));
export const sinMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Crea un elemento a partir de HTML (devuelve el primero).
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Cambia el texto de un nodo solo si cambió (evita repintar en cada evento).
export function ponerTexto(raiz, sel, valor) {
  const n = typeof sel === 'string' ? raiz.querySelector(sel) : sel;
  if (n && n.textContent !== String(valor)) n.textContent = valor;
}

export function celularTexto(c = '') {
  const d = String(c).replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d;
}

// Número con decimal colombiano: 4.9 → «4,9».
export function decimal(n, dig = 1) {
  return Number(n || 0).toFixed(dig).replace('.', ',');
}

/* ------------------------------------------------------------------ */
/* Íconos (trazos propios, 24×24)                                     */
/* ------------------------------------------------------------------ */
const TRAZOS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  campana: '<path d="M6 10a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 15 6 10Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  mira: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  casa: '<path d="M4 11 12 4l8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  trabajo: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  estrella: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" fill="currentColor" stroke="none"/>',
  estrellaVacia: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
  telefono: '<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4Z"/>',
  chat: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/><path d="M9 9.2c.2 2.9 2.6 5.3 5.6 5.6"/>',
  mensaje: '<path d="M4 5.5h16v11H9l-5 4Z"/><path d="M8 10h8M8 13h5"/>',
  compartir: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4"/>',
  escudo: '<path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6Z"/><path d="m9 12 2 2 4-4"/>',
  sos: '<path d="M12 3 5 6v5.5c0 4.5 3 8 7 9.5 4-1.5 7-5 7-9.5V6Z"/><path d="M12 8v5M12 16v.5"/>',
  cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  adelante: '<path d="m9 5 7 7-7 7"/>',
  abajo: '<path d="m6 9 6 6 6-6"/>',
  arriba: '<path d="m6 15 6-6 6 6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 19.5h1M20 14v1"/>',
  efectivo: '<rect x="2.5" y="6.5" width="19" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  camara: '<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.5-2h4.4l1.5 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5Z"/><circle cx="12" cy="12.5" r="3.5"/>',
  rayo: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6Z"/>',
  etiqueta: '<path d="M3.5 12.2V5a1.5 1.5 0 0 1 1.5-1.5h7.2L20.5 12 12 20.5Z"/><circle cx="8" cy="8" r="1.5"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
  ayuda: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7"/><path d="M12 17v.01"/>',
  salir: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
  volante: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M3.8 10.5 10 12M14 12l6.2-1.5M12 14v6.5"/>',
  lista: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  ruta: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  navegar: '<path d="M20.5 3.5 3.5 10.5l7 2.9 2.9 7Z"/>',
  documento: '<path d="M6.5 3.5h7l4 4V20a.5.5 0 0 1-.5.5H6.5A.5.5 0 0 1 6 20V4a.5.5 0 0 1 .5-.5Z"/><path d="M13.5 3.5v4h4M9 12h6M9 16h6"/>',
  auto: '<path d="M5 11.5 6.8 6.8A2 2 0 0 1 8.7 5.5h6.6a2 2 0 0 1 1.9 1.3L19 11.5"/><rect x="3.5" y="11.5" width="17" height="6" rx="2"/><path d="M6 17.5V20M18 17.5V20M7 14.5h.01M17 14.5h.01M10 3h4"/>',
  grafica: '<path d="M5 20V11M11 20V5M17 20v-6M3 20h18"/>',
  dinero: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.4 0-2.5.8-2.5 2s1.1 1.6 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5V8M12 16v1.5"/>',
  gps: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22"/>',
  usuario: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  sonido: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  instalar: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
  paleta: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-2.9 0-1 .8-1.6 1.8-1.6h2.2a3.5 3.5 0 0 0 3.5-3.6C20 6.7 16.4 3.5 12 3.5Z"/><circle cx="7.8" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="7.8" r="1"/>',
  antena: '<path d="M5 12.5a10 10 0 0 1 14 0M8 15.5a6 6 0 0 1 8 0"/><path d="M12 19h.01"/><path d="M2 9.5a14.5 14.5 0 0 1 20 0"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.01"/>',
  alerta: '<path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4.5M12 17v.01"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  basura: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  mapa: '<path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
  tarjeta: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19M6.5 15h4"/>',
  regalo: '<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5v8h14v-8M12 8.5v12M12 8.5S10.5 4 8 4.5 6.5 8.5 12 8.5Zm0 0s1.5-4.5 4-4 1.5 4-4 4Z"/>',
  externo: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  candado: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  bandera: '<path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/>',
  personas: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5a6 6 0 0 1 12 0"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14a6 6 0 0 1 3.5 5.5"/>',
  edificio: '<path d="M3.5 20.5h17M5 20.5V10M19 20.5V10M3.5 10 12 4l8.5 6Z"/><path d="M9 20.5v-6M12 20.5v-6M15 20.5v-6"/>',
  salud: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/>',
  birrete: '<path d="M2.5 9.5 12 5l9.5 4.5L12 14Z"/><path d="M6.5 11.5V16c1.5 1.5 3.5 2 5.5 2s4-.5 5.5-2v-4.5M21.5 9.5V14"/>',
  carrito: '<path d="M3 4.5h2.5l2 10.5h10l2-7.5H7"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>',
  casas: '<path d="M2.5 20.5h19M4 20.5v-8l5-4 5 4v8M14 12.5l3.5-3 3 2.5v8.5"/><path d="M7.5 20.5v-4h3v4"/>',
  hoja: '<path d="M5 19c0-8 5-13.5 14.5-14.5C19 14 13.5 19 5 19Z"/><path d="M5 19c3-4 6-6.5 9.5-8"/>',
  cubiertos: '<path d="M7 3.5v17M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5M17 20.5V3.5c-2.5 1-3.5 3.5-3.5 7.5h3.5"/>',
  carretera: '<path d="M8 3.5 4 20.5M16 3.5l4 17M12 4.5v2.5M12 10.5v3M12 17v3"/>',
  avion: '<path d="M21 15.5 13.5 11V5a1.5 1.5 0 0 0-3 0v6L3 15.5v2l7.5-2.5v4l-2 1.5v1.5l3.5-1 3.5 1v-1.5l-2-1.5v-4l7.5 2.5Z"/>',
  rayito: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  chispa: '<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z"/><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z"/>',
  copiar: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>',
  ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  potencia: '<path d="M12 3v8"/><path d="M6.5 6.5a7.5 7.5 0 1 0 11 0"/>',
};

export function icono(nombre, { tam = 24, clase = '', grosor = 2 } = {}) {
  return `<svg class="a-ico ${clase}" viewBox="0 0 24 24" width="${tam}" height="${tam}" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="${grosor}" stroke-linecap="round" stroke-linejoin="round">${TRAZOS[nombre] || TRAZOS.info}</svg>`;
}

// Ícono de cada categoría de lugares frecuentes (en vez de emojis).
export const ICONO_CATEGORIA = {
  centro: 'edificio', salud: 'salud', educacion: 'birrete', comercio: 'carrito', barrio: 'casas',
  vereda: 'hoja', comida: 'cubiertos', municipio: 'carretera', bogota: 'avion',
};

/* ------------------------------------------------------------------ */
/* Piezas pequeñas                                                     */
/* ------------------------------------------------------------------ */
export function avatar(nombre = '', clase = '') {
  return `<span class="a-avatar ${clase}" aria-hidden="true">${esc(N.iniciales(nombre) || '·')}</span>`;
}

// Placa estilo colombiano: letras negras y el municipio de la cooperativa abajo.
export function placa(texto = '', municipio = EM.MUNICIPIO_PLACA, clase = '') {
  return `<span class="a-placa ${clase}" role="img" aria-label="Placa ${esc(texto)}"><b>${esc(String(texto).replace(' ', '·'))}</b><small>${esc(municipio)}</small></span>`;
}

export function estrellasTexto(n) {
  const v = Math.round(Number(n) || 0);
  return `<span class="a-estrellas-txt" aria-label="${v} de 5 estrellas">${'★'.repeat(v)}<span aria-hidden="true">${'★'.repeat(5 - v)}</span></span>`;
}

export function chipPrueba(texto = 'PRUEBA') {
  return `<span class="a-chip-prueba">${esc(texto)}</span>`;
}

// En las propuestas (cooperativas que no son clientes), aviso discreto junto a «MODO PRUEBA».
export function avisoDemo(clase = 'a-chip-demo') {
  return EM.ES_PROPUESTA ? `<span class="${clase}">Demostración de ${esc(EM.APP)} para ${esc(EM.NOMBRE_LARGO)}</span>` : '';
}

// Cuadros de colores tipo «tablero de taxi» (detalle de marca).
export function franjaCuadros(clase = '') {
  return `<div class="a-cuadros ${clase}" aria-hidden="true"></div>`;
}

/* ------------------------------------------------------------------ */
/* Hoja inferior arrastrable: contraída / media / completa             */
/* ------------------------------------------------------------------ */
export class Hoja {
  constructor(app, { tope = () => 84, alCambiarAlto = () => {}, etiqueta = 'Panel' } = {}) {
    this.app = app;
    this.tope = tope;
    this.alCambiarAlto = alCambiarAlto;
    this.estado = 'media';
    this.alto = 0;
    this.el = el(`<section class="a-hoja" aria-label="${esc(etiqueta)}">
      <button class="a-hoja-asa" type="button" aria-label="Agrandar o achicar el panel" aria-expanded="false"><span></span></button>
      <div class="a-hoja-contenido"></div>
      <div class="a-hoja-pie"></div>
    </section>`);
    this.asa = this.el.querySelector('.a-hoja-asa');
    this.contenido = this.el.querySelector('.a-hoja-contenido');
    this.pie = this.el.querySelector('.a-hoja-pie');
    app.append(this.el);
    this.#arrastre();
    this.asa.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); this.subir(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); this.bajar(); }
    });
  }

  limites() {
    const H = this.app.clientHeight;
    const asa = this.asa.offsetHeight || 26;
    const pie = this.pie.offsetHeight;
    const peek = Number(this.el.dataset.peek || 82);
    const contraida = Math.min(H * 0.45, asa + pie + peek);
    const corte = this.contenido.querySelector('[data-corte]');
    const medida = corte ? corte.offsetTop : this.contenido.scrollHeight;
    const maxMedia = Number(this.el.dataset.maxMedia || 0.74);
    const completa = Math.max(contraida + 40, H - this.tope());
    const media = limitar(asa + medida + pie + 6, contraida, Math.min(H * maxMedia, completa));
    return { contraida, media, completa };
  }

  fijar(estado = this.estado, animar = true) {
    this.estado = estado;
    const l = this.limites();
    this.#aplicar(l[estado], animar);
    this.asa.setAttribute('aria-expanded', String(estado === 'completa'));
    this.el.dataset.estado = estado;
  }

  // Cambia el contenido y el pie por nodos nuevos (sin los oyentes de la vista anterior).
  renovar() {
    const contenido = this.contenido.cloneNode(false);
    const pie = this.pie.cloneNode(false);
    this.contenido.replaceWith(contenido);
    this.pie.replaceWith(pie);
    this.contenido = contenido;
    this.pie = pie;
    return { contenido, pie };
  }

  subir() {
    this.fijar(this.estado === 'contraida' ? 'media' : 'completa');
  }

  bajar() {
    this.fijar(this.estado === 'completa' ? 'media' : 'contraida');
  }

  #aplicar(alto, animar) {
    this.el.classList.toggle('a-sin-transicion', !animar);
    this.alto = Math.round(alto);
    this.el.style.height = `${this.alto}px`;
    this.app.style.setProperty('--hoja-alto', `${this.alto}px`);
    this.alCambiarAlto(this.alto, this.estado, animar);
  }

  #arrastre() {
    let inicioY = 0;
    let inicioAlto = 0;
    let movio = false;
    let ultimo = [];
    let activo = false;
    let idPuntero = null;
    const empezar = (e) => {
      if (e.button > 0) return;
      const zona = e.target.closest('.a-hoja-asa, [data-arrastre]');
      if (!zona || e.target.closest('button:not(.a-hoja-asa), a, input, textarea, select, label')) return;
      activo = true;
      movio = false;
      inicioY = e.clientY;
      inicioAlto = this.alto;
      ultimo = [[e.timeStamp, e.clientY]];
      idPuntero = e.pointerId;
    };
    const mover = (e) => {
      if (!activo) return;
      const dy = e.clientY - inicioY;
      if (!movio && Math.abs(dy) < 5) return;
      if (!movio) {
        // Se captura el puntero solo cuando empieza el arrastre: así un toque
        // simple sigue siendo un clic normal sobre la asa.
        try { this.el.setPointerCapture(idPuntero); } catch { /* sin captura */ }
      }
      movio = true;
      const l = this.limites();
      this.#aplicar(limitar(inicioAlto - dy, l.contraida - 30, l.completa), false);
      ultimo.push([e.timeStamp, e.clientY]);
      if (ultimo.length > 5) ultimo.shift();
    };
    const soltar = () => {
      if (!activo) return;
      activo = false;
      if (!movio) return;
      const [t0, y0] = ultimo[0];
      const [t1, y1] = ultimo[ultimo.length - 1];
      const v = (y1 - y0) / Math.max(1, t1 - t0); // px/ms (positivo = hacia abajo)
      const l = this.limites();
      const orden = ['contraida', 'media', 'completa'];
      let destino;
      if (v < -0.45) destino = orden[Math.min(2, orden.indexOf(this.#mas_cercano(l)) + 1)];
      else if (v > 0.45) destino = orden[Math.max(0, orden.indexOf(this.#mas_cercano(l)) - 1)];
      else destino = this.#mas_cercano(l);
      this.fijar(destino);
      this.suprimirClic = true;
      setTimeout(() => (this.suprimirClic = false), 50);
    };
    this.el.addEventListener('pointerdown', empezar);
    this.el.addEventListener('pointermove', mover);
    this.el.addEventListener('pointerup', soltar);
    this.el.addEventListener('pointercancel', soltar);
    this.asa.addEventListener('click', () => {
      if (this.suprimirClic) return;
      this.fijar(this.estado === 'completa' ? 'media' : this.estado === 'media' ? 'completa' : 'media');
    });
  }

  #mas_cercano(l) {
    let mejor = 'media';
    let d = Infinity;
    for (const k of ['contraida', 'media', 'completa']) {
      const dd = Math.abs(l[k] - this.alto);
      if (dd < d) { d = dd; mejor = k; }
    }
    return mejor;
  }
}

/* ------------------------------------------------------------------ */
/* Avisos en pantalla (además del sonido y la vibración del núcleo)    */
/* ------------------------------------------------------------------ */
const ICONO_AVISO = { exito: 'check', alerta: 'campana', error: 'alerta', info: 'info', solicitud: 'campana' };

// Los avisos se apilan como las notificaciones del celular: el más nuevo
// adelante y los anteriores asomados detrás (así no tapan media pantalla).
// Todos quedan en el historial de la campana.
export function crearAvisos(app, { alAgregar = () => {} } = {}) {
  const zona = el('<div class="a-avisos" aria-live="polite" aria-relevant="additions"></div>');
  app.append(zona);
  const historial = [];
  const vivos = () => [...zona.children].filter((x) => !x.classList.contains('a-sale'));
  const ordenar = () => {
    vivos().forEach((t, i) => {
      t.dataset.pos = String(Math.min(i, 3));
      t.inert = i > 0;
    });
  };
  const quitar = (t) => {
    if (!t.isConnected || t.classList.contains('a-sale')) return;
    t.classList.add('a-sale');
    setTimeout(() => t.remove(), 260);
    ordenar();
  };
  // silencioso: solo va al historial (cuando la pantalla ya lo muestra en grande).
  function mostrar({ titulo, cuerpo = '', tipo = 'info' }, { silencioso = false } = {}) {
    historial.unshift({ titulo, cuerpo, tipo, hora: Date.now() });
    if (historial.length > 40) historial.pop();
    alAgregar(historial);
    if (silencioso) return null;
    const urgente = tipo === 'alerta' || tipo === 'error' || tipo === 'solicitud';
    const t = el(`<div class="a-toast a-toast-${esc(tipo)}" role="${urgente ? 'alert' : 'status'}" data-tipo="${esc(tipo)}">
      <span class="a-toast-ico">${icono(ICONO_AVISO[tipo] || 'info', { tam: 20 })}</span>
      <div class="a-toast-txt"><strong>${esc(titulo)}</strong>${cuerpo ? `<p>${esc(cuerpo)}</p>` : ''}</div>
      <button class="a-toast-cerrar" type="button" aria-label="Cerrar aviso">${icono('cerrar', { tam: 16 })}</button>
    </div>`);
    t.querySelector('button').addEventListener('click', () => quitar(t));
    zona.prepend(t);
    vivos().slice(3).forEach(quitar);
    ordenar();
    setTimeout(() => quitar(t), urgente ? 7000 : 4800);
    return t;
  }
  // Quita los avisos de ciertos tipos (por ejemplo, un error que ya no aplica).
  function limpiar(tipos = []) {
    vivos().filter((t) => tipos.includes(t.dataset.tipo)).forEach(quitar);
  }
  return { mostrar, limpiar, historial, zona };
}

// Nombre para hablarle a alguien: «Don Álvaro» y «Doña Rosa» conservan el tratamiento.
const TRATAMIENTOS = /^(don|doña|dona|sr\.?|sra\.?|señor|señora|dr\.?|dra\.?)$/i;
export function nombreCorto(nombre = '') {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '';
  return TRATAMIENTOS.test(partes[0]) && partes[1] ? `${partes[0]} ${partes[1]}` : partes[0];
}

/* ------------------------------------------------------------------ */
/* Diálogo modal (sube desde abajo dentro de la app)                   */
/* ------------------------------------------------------------------ */
let contadorIds = 0;
export function modal(app, { titulo, texto = '', cuerpo = '', acciones = [{ texto: 'Entendido', valor: true, clase: 'a-btn-primario' }], clase = '', alAbrir = null, icono: ico = '' }) {
  return new Promise((resolver) => {
    const id = `a-modal-${++contadorIds}`;
    const anterior = document.activeElement;
    const capa = el(`<div class="a-modal-capa ${clase}">
      <div class="a-modal" role="dialog" aria-modal="true" aria-labelledby="${id}">
        <div class="a-modal-asa" aria-hidden="true"></div>
        ${ico ? `<div class="a-modal-ico">${ico}</div>` : ''}
        <h2 id="${id}">${esc(titulo)}</h2>
        ${texto ? `<p class="a-modal-texto">${esc(texto)}</p>` : ''}
        <div class="a-modal-cuerpo"></div>
        <div class="a-modal-acciones"></div>
      </div>
    </div>`);
    const caja = capa.querySelector('.a-modal');
    const cuerpoEl = capa.querySelector('.a-modal-cuerpo');
    if (typeof cuerpo === 'string') cuerpoEl.innerHTML = cuerpo;
    else if (cuerpo) cuerpoEl.append(cuerpo);
    if (!cuerpoEl.innerHTML) cuerpoEl.remove();
    const zonaAcc = capa.querySelector('.a-modal-acciones');
    let cerrado = false;
    const cerrar = (valor) => {
      if (cerrado) return;
      cerrado = true;
      capa.classList.remove('a-abierto');
      document.removeEventListener('keydown', teclas);
      setTimeout(() => capa.remove(), 260);
      anterior?.focus?.({ preventScroll: true });
      resolver(valor);
    };
    for (const a of acciones) {
      const b = el(`<button type="button" class="a-btn ${a.clase || 'a-btn-suave'}">${a.icono ? icono(a.icono, { tam: 20 }) : ''}<span>${esc(a.texto)}</span></button>`);
      if (a.href) {
        const enlace = el(`<a class="a-btn ${a.clase || 'a-btn-suave'}" href="${esc(a.href)}" ${a.externo ? 'target="_blank" rel="noopener"' : ''}>${a.icono ? icono(a.icono, { tam: 20 }) : ''}<span>${esc(a.texto)}</span></a>`);
        enlace.addEventListener('click', () => setTimeout(() => cerrar(a.valor ?? null), 50));
        zonaAcc.append(enlace);
        continue;
      }
      b.addEventListener('click', () => cerrar(typeof a.valor === 'function' ? a.valor(cuerpoEl) : a.valor));
      zonaAcc.append(b);
    }
    if (!acciones.length) zonaAcc.remove();
    const teclas = (e) => {
      if (e.key === 'Escape') cerrar(null);
    };
    document.addEventListener('keydown', teclas);
    capa.addEventListener('click', (e) => {
      if (e.target === capa) cerrar(null);
    });
    app.append(capa);
    alAbrir?.(cuerpoEl, cerrar, caja);
    requestAnimationFrame(() => {
      capa.classList.add('a-abierto');
      (caja.querySelector('[autofocus]') || caja.querySelector('input, button, a'))?.focus({ preventScroll: true });
    });
  });
}

// Lista de opciones para elegir (motivos de cancelación, billeteras…).
export async function elegirOpcion(app, { titulo, texto = '', opciones, confirmar = 'Confirmar', clasePeligro = false }) {
  const nombre = `op${++contadorIds}`;
  const cuerpo = `<div class="a-opciones" role="radiogroup" aria-label="${esc(titulo)}">${opciones
    .map((o, i) => `<label class="a-opcion"><input type="radio" name="${nombre}" value="${i}" ${i === 0 ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span>${esc(o)}</span></label>`)
    .join('')}</div>`;
  const r = await modal(app, {
    titulo,
    texto,
    cuerpo,
    acciones: [
      { texto: 'Volver', valor: null, clase: 'a-btn-suave' },
      { texto: confirmar, clase: clasePeligro ? 'a-btn-peligro' : 'a-btn-primario', valor: (c) => opciones[Number(c.querySelector('input:checked')?.value || 0)] },
    ],
  });
  return r;
}

/* ------------------------------------------------------------------ */
/* Panel de sección a pantalla completa (entra desde la derecha)       */
/* ------------------------------------------------------------------ */
export function abrirPanel(app, { titulo, clase = '', construir, alCerrar = () => {} }) {
  const anterior = document.activeElement;
  const panel = el(`<section class="a-panel ${clase}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <header class="a-panel-cabeza">
      <button class="a-icono-btn" type="button" data-cerrar aria-label="Volver">${icono('atras')}</button>
      <h2>${esc(titulo)}</h2>
    </header>
    <div class="a-panel-cuerpo"></div>
  </section>`);
  const cuerpo = panel.querySelector('.a-panel-cuerpo');
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    panel.classList.remove('a-abierto');
    document.removeEventListener('keydown', teclas);
    setTimeout(() => panel.remove(), 300);
    anterior?.focus?.({ preventScroll: true });
    alCerrar();
  };
  const teclas = (e) => {
    if (e.key === 'Escape' && panel === app.querySelector('.a-panel:last-of-type')) cerrar();
  };
  document.addEventListener('keydown', teclas);
  panel.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  app.append(panel);
  construir?.(cuerpo, cerrar, panel);
  requestAnimationFrame(() => {
    panel.classList.add('a-abierto');
    panel.querySelector('[data-cerrar]').focus({ preventScroll: true });
  });
  return { panel, cuerpo, cerrar };
}

/* ------------------------------------------------------------------ */
/* Menú lateral                                                         */
/* ------------------------------------------------------------------ */
export function abrirMenu(app, { cabeza = '', items = [], pie = '', clase = '' }) {
  const anterior = document.activeElement;
  const capa = el(`<div class="a-menu-capa ${clase}">
    <nav class="a-menu" aria-label="Menú principal">
      <div class="a-menu-cabeza">${cabeza}</div>
      <ul class="a-menu-lista"></ul>
      <div class="a-menu-pie">${pie}</div>
    </nav>
  </div>`);
  const lista = capa.querySelector('.a-menu-lista');
  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    capa.classList.remove('a-abierto');
    document.removeEventListener('keydown', teclas);
    setTimeout(() => capa.remove(), 300);
    anterior?.focus?.({ preventScroll: true });
  };
  for (const it of items) {
    if (it.separador) {
      lista.append(el('<li class="a-menu-sep" role="separator"></li>'));
      continue;
    }
    const contenido = `<span class="a-menu-ico">${icono(it.icono, { tam: 22 })}</span><span class="a-menu-txt"><strong>${esc(it.texto)}</strong>${it.detalle ? `<small>${esc(it.detalle)}</small>` : ''}</span>${it.insignia ? `<span class="a-menu-insignia">${esc(it.insignia)}</span>` : ''}`;
    const li = el(`<li>${it.href ? `<a class="a-menu-item ${it.clase || ''}" href="${esc(it.href)}">${contenido}</a>` : `<button type="button" class="a-menu-item ${it.clase || ''}">${contenido}</button>`}</li>`);
    if (!it.href) {
      li.firstElementChild.addEventListener('click', () => {
        cerrar();
        setTimeout(() => it.accion?.(), 120);
      });
    }
    lista.append(li);
  }
  const teclas = (e) => {
    if (e.key === 'Escape') cerrar();
  };
  document.addEventListener('keydown', teclas);
  capa.addEventListener('click', (e) => {
    if (e.target === capa) cerrar();
  });
  app.append(capa);
  requestAnimationFrame(() => {
    capa.classList.add('a-abierto');
    capa.querySelector('.a-menu-item')?.focus({ preventScroll: true });
  });
  return { capa, cerrar };
}

/* ------------------------------------------------------------------ */
/* Estrellas para calificar                                             */
/* ------------------------------------------------------------------ */
export function estrellas({ valor = 0, etiqueta = 'Calificación', alCambiar = () => {} } = {}) {
  const nombres = ['Muy mal', 'Mal', 'Regular', 'Bien', '¡Excelente!'];
  const cont = el(`<div class="a-estrellas" role="radiogroup" aria-label="${esc(etiqueta)}">
    ${[1, 2, 3, 4, 5].map((n) => `<button type="button" role="radio" aria-checked="false" aria-label="${n} ${n === 1 ? 'estrella' : 'estrellas'}" data-n="${n}">${icono('estrella', { tam: 40 })}</button>`).join('')}
  </div>`);
  const leyenda = el('<p class="a-estrellas-leyenda" aria-live="polite"></p>');
  let actual = 0;
  const poner = (n, avisar = true) => {
    actual = n;
    cont.querySelectorAll('button').forEach((b) => {
      const k = Number(b.dataset.n);
      b.classList.toggle('a-llena', k <= n);
      b.setAttribute('aria-checked', String(k === n));
      b.tabIndex = k === (n || 1) ? 0 : -1;
    });
    leyenda.textContent = n ? nombres[n - 1] : 'Toca las estrellas';
    if (avisar) alCambiar(n);
  };
  cont.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    poner(Number(b.dataset.n));
    b.classList.remove('a-pop');
    void b.offsetWidth;
    b.classList.add('a-pop');
  });
  cont.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const n = limitar(actual + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1), 1, 5);
    poner(n);
    cont.querySelector(`[data-n="${n}"]`).focus();
  });
  poner(valor, false);
  return { el: cont, leyenda, valor: () => actual, poner };
}

/* ------------------------------------------------------------------ */
/* Casillas para códigos de 4 dígitos                                   */
/* ------------------------------------------------------------------ */
export function casillasCodigo({ n = 4, etiqueta = 'Código', secreto = false, alCompletar = () => {}, alCambiar = () => {} } = {}) {
  const cont = el(`<div class="a-casillas" role="group" aria-label="${esc(etiqueta)}">
    ${Array.from({ length: n }, (_, i) => `<input type="${secreto ? 'password' : 'text'}" inputmode="numeric" pattern="[0-9]*" maxlength="1" autocomplete="${i === 0 ? 'one-time-code' : 'off'}" aria-label="${esc(etiqueta)}: dígito ${i + 1} de ${n}">`).join('')}
  </div>`);
  const cajas = [...cont.querySelectorAll('input')];
  const valor = () => cajas.map((c) => c.value).join('');
  const revisar = () => {
    cont.classList.remove('a-error');
    cajas.forEach((c) => c.classList.toggle('a-lleno', Boolean(c.value)));
    alCambiar(valor());
    if (valor().length === n) alCompletar(valor());
  };
  cajas.forEach((caja, i) => {
    caja.addEventListener('input', () => {
      const digitos = caja.value.replace(/\D/g, '');
      if (digitos.length > 1) {
        // Pegó o el teclado autocompletó varios dígitos.
        digitos.split('').slice(0, n - i).forEach((d, k) => (cajas[i + k].value = d));
        cajas[Math.min(n - 1, i + digitos.length)].focus();
      } else {
        caja.value = digitos;
        if (digitos && i < n - 1) cajas[i + 1].focus();
      }
      revisar();
    });
    caja.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !caja.value && i > 0) {
        cajas[i - 1].value = '';
        cajas[i - 1].focus();
        revisar();
        e.preventDefault();
      }
      if (e.key === 'ArrowLeft' && i > 0) cajas[i - 1].focus();
      if (e.key === 'ArrowRight' && i < n - 1) cajas[i + 1].focus();
    });
    caja.addEventListener('focus', () => caja.select());
  });
  return {
    el: cont,
    valor,
    enfocar: () => (cajas.find((c) => !c.value) || cajas[n - 1]).focus(),
    limpiar: () => {
      cajas.forEach((c) => (c.value = ''));
      revisar();
      cajas[0].focus();
    },
    error: () => {
      cont.classList.remove('a-error');
      void cont.offsetWidth;
      cont.classList.add('a-error');
    },
  };
}

/* ------------------------------------------------------------------ */
/* Deslizar para aceptar                                                */
/* ------------------------------------------------------------------ */
export function deslizador({ texto = 'Deslizar para aceptar', alConfirmar = () => {} } = {}) {
  const d = el(`<div class="a-deslizador">
    <span class="a-deslizador-relleno" aria-hidden="true"></span>
    <span class="a-deslizador-texto" aria-hidden="true">${esc(texto)} <span class="a-flechitas">›››</span></span>
    <button class="a-deslizador-mango" type="button" aria-label="${esc(texto)}">${icono('adelante', { tam: 26, grosor: 2.6 })}</button>
  </div>`);
  const mango = d.querySelector('.a-deslizador-mango');
  const relleno = d.querySelector('.a-deslizador-relleno');
  let x0 = 0;
  let x = 0;
  let activo = false;
  let hecho = false;
  const max = () => d.clientWidth - mango.offsetWidth - 8;
  const poner = (v, animar) => {
    x = limitar(v, 0, max());
    mango.style.transition = relleno.style.transition = animar ? 'transform .25s, width .25s' : 'none';
    mango.style.transform = `translateX(${x}px)`;
    relleno.style.width = x > 0 ? `${x + mango.offsetWidth + 5}px` : '0px';
    d.style.setProperty('--avance', String(x / Math.max(1, max())));
  };
  const confirmar = () => {
    if (hecho) return;
    hecho = true;
    poner(max(), true);
    d.classList.add('a-hecho');
    setTimeout(alConfirmar, 180);
  };
  mango.addEventListener('pointerdown', (e) => {
    if (hecho) return;
    activo = true;
    x0 = e.clientX - x;
    mango.setPointerCapture?.(e.pointerId);
  });
  mango.addEventListener('pointermove', (e) => {
    if (!activo) return;
    poner(e.clientX - x0, false);
  });
  const soltar = () => {
    if (!activo) return;
    activo = false;
    if (x >= max() * 0.82) confirmar();
    else poner(0, true);
  };
  mango.addEventListener('pointerup', soltar);
  mango.addEventListener('pointercancel', soltar);
  mango.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      confirmar();
    }
  });
  requestAnimationFrame(() => poner(0, false));
  return { el: d, confirmar };
}

/* ------------------------------------------------------------------ */
/* Capa de ruta en el mapa (con borde blanco y recorte en vivo)         */
/* ------------------------------------------------------------------ */
export function capaRuta(m, { color = '#121212', grosor = 5 } = {}) {
  const { L, mapa } = m;
  let borde = null;
  let linea = null;
  let coords = null;
  let indice = 0;
  return {
    poner(lista, opciones = {}) {
      coords = lista && lista.length ? lista : null;
      indice = 0;
      if (!coords) return this.quitar();
      const c = opciones.color || color;
      if (!linea) {
        borde = L.polyline(coords, { color: '#ffffff', weight: grosor + 5, opacity: 0.95, interactive: false, lineCap: 'round', lineJoin: 'round' }).addTo(mapa);
        linea = L.polyline(coords, { color: c, weight: grosor, opacity: 0.95, interactive: false, lineCap: 'round', lineJoin: 'round', dashArray: opciones.discontinua ? '1 10' : null }).addTo(mapa);
      } else {
        borde.setLatLngs(coords);
        linea.setLatLngs(coords);
        linea.setStyle({ color: c, dashArray: opciones.discontinua ? '1 10' : null });
      }
    },
    // Corta la parte ya recorrida desde la posición actual del taxi.
    recortar(pos) {
      if (!coords || !linea || !pos) return;
      let mejor = indice;
      let dMejor = Infinity;
      const hasta = Math.min(coords.length, indice + 60);
      for (let i = indice; i < hasta; i++) {
        const d = (coords[i][0] - pos.lat) ** 2 + (coords[i][1] - pos.lng) ** 2;
        if (d < dMejor) { dMejor = d; mejor = i; }
      }
      indice = mejor;
      const resto = [[pos.lat, pos.lng], ...coords.slice(mejor + 1)];
      borde.setLatLngs(resto);
      linea.setLatLngs(resto);
    },
    quitar() {
      borde?.remove();
      linea?.remove();
      borde = linea = null;
      coords = null;
    },
    get activa() {
      return Boolean(linea);
    },
  };
}

// ¿El punto está dentro de la zona visible del mapa (descontando bordes)?
export function puntoVisible(m, p, { arriba = 90, abajo = 0, lados = 30 } = {}) {
  if (!p) return true;
  const { mapa } = m;
  const t = mapa.getSize();
  const pt = mapa.latLngToContainerPoint([p.lat, p.lng]);
  return pt.x > lados && pt.x < t.x - lados && pt.y > arriba && pt.y < t.y - abajo - 20;
}

/* ------------------------------------------------------------------ */
/* Panel de escritorio (fuera de la vitrina): QR para abrir en el celular */
/* ------------------------------------------------------------------ */
export function panelEscritorio({ titulo, texto, puntos = [], url = location.href }) {
  const propuesta = EM.ES_PROPUESTA ? `<p class="a-escritorio-propuesta">${icono('info', { tam: 18 })}<span>${esc(EM.TEXTO_PROPUESTA)}</span></p>` : '';
  return el(`<aside class="a-escritorio" aria-label="Información de la demo">
    ${propuesta}
    <div class="a-escritorio-marca">${EM.EN_TAXICUN ? EM.marcaApp(52) : EM.marcaIcono(52)}<div><strong>${EM.EN_TAXICUN ? `${EM.palabraApp()} · ${esc(EM.NOMBRE)}` : esc(EM.NOMBRE)}</strong>${EM.LEMA ? `<span>${esc(EM.LEMA)}</span>` : ''}</div></div>
    <h1>${titulo}</h1>
    <p>${esc(texto)}</p>
    <ul>${puntos.filter(Boolean).map((p) => `<li>${icono('check', { tam: 18 })}<span>${esc(p)}</span></li>`).join('')}</ul>
    <div class="a-escritorio-qr">
      <div class="a-escritorio-qr-img">${N.qrSVG(url, { redondeado: true, color: '#121212' })}</div>
      <div><strong>Ábrela en tu celular</strong><span>Escanea el código con la cámara.</span></div>
    </div>
    <small>${esc(EM.unir(['Demo', EM.RAZON_SOCIAL, EM.TELEFONO_VISIBLE]))}<br>${esc(EM.TEXTO_DESARROLLO)}</small>
  </aside>`);
}
