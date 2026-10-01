// Vitrina de los tres diseños: cada columna muestra la app real dentro de un
// marco de celular (iframe de 390 × 844 escalado). Cada diseño usa su propia
// sala (vitrina-a, vitrina-b, vitrina-c) para que el pasajero y el conductor de
// esa columna se encuentren entre sí sin mezclarse con los demás.
import * as N from '../nucleo/index.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const ANCHO = 390;
const ALTO = 844;
const NOMBRES = { a: 'Ámbar Urbano', b: 'Verde Rosal', c: 'Noche Neón' };

/* ---------------- La sala del usuario no se toca ----------------
   La app guarda en el celular la sala que recibe por ?sala=… (núcleo). Los
   iframes de la vitrina la cambiarían a «vitrina-x» para siempre, así que aquí
   se devuelve la sala que el usuario tenía antes de abrir la vitrina. */
const guardada = localStorage.getItem('ct.sala');
const salaPrevia = guardada && !guardada.startsWith('vitrina-') ? guardada : null;
function restaurarSala() {
  if (salaPrevia === null) localStorage.removeItem('ct.sala');
  else localStorage.setItem('ct.sala', salaPrevia);
}
window.addEventListener('storage', (e) => {
  if (e.key === 'ct.sala' && e.newValue && e.newValue !== salaPrevia) restaurarSala();
});
window.addEventListener('pagehide', restaurarSala);

/* ---------------- Rutas ---------------- */

const carpeta = (rol) => (rol === 'conductor' ? 'conductor' : 'app');
const rutaVitrina = (d, rol) => `../${carpeta(rol)}/?d=${d}&vitrina=1&sala=vitrina-${d}`;
const rutaCompleta = (d, rol) => `../${carpeta(rol)}/?d=${d}`;
const urlAbsoluta = (ruta) => new URL(ruta, location.href).href;

// ¿Ya está publicado este diseño? (otros equipos los construyen en paralelo)
const existencias = new Map();
function disenoDisponible(d, rol) {
  const archivo = `${d}/${rol === 'conductor' ? 'conductor' : 'pasajero'}.js`;
  if (!existencias.has(archivo)) {
    existencias.set(archivo, fetch(archivo, { method: 'HEAD', cache: 'no-store' }).then((r) => r.ok).catch(() => true));
  }
  return existencias.get(archivo);
}

/* ---------------- Columnas ---------------- */

const disenoActual = N.perfil.disenoElegido();
const columnas = new Map();

function armarColumna(col) {
  const d = col.dataset.d;
  col.insertAdjacentHTML('beforeend', `
    <div class="v-interruptor" role="group" aria-label="Qué app quieres ver">
      <button type="button" data-rol="pasajero" aria-pressed="true"><svg class="icono"><use href="#i-pasajero"/></svg>Pasajero</button>
      <button type="button" data-rol="conductor" aria-pressed="false"><svg class="icono"><use href="#i-volante"/></svg>Conductor</button>
    </div>
    <div class="v-marco">
      <div class="v-pantalla">
        <div class="v-espera"><img src="../img/icono-192.png" alt="" width="64" height="64"><span class="anillo"></span><span class="texto">Cargando el diseño…</span></div>
      </div>
    </div>
    <div class="v-acciones">
      <button class="v-boton usar" type="button"><svg class="icono"><use href="#i-check"/></svg>Usar este diseño</button>
      <div class="fila">
        <a class="v-boton completa" target="_blank" rel="noopener"><svg class="icono"><use href="#i-expandir"/></svg>Abrir en pantalla completa</a>
        <button class="v-boton recargar" type="button" aria-label="Reiniciar esta vista" title="Reiniciar esta vista"><svg class="icono"><use href="#i-recargar"/></svg></button>
      </div>
    </div>
    <div class="v-qr"><div class="codigo" aria-hidden="true"></div><div><b>Ábrelo en tu celular</b><span class="url"></span></div></div>`);

  if (d === disenoActual) {
    $('.v-cabeza', col).insertAdjacentHTML('beforeend', '<span class="v-actual"><svg class="icono"><use href="#i-check"/></svg>Tu diseño</span>');
  }

  const estado = { d, col, rol: 'pasajero', marcos: {}, visible: false, marco: $('.v-marco', col), pantalla: $('.v-pantalla', col), espera: $('.v-espera', col) };
  columnas.set(d, estado);

  $$('.v-interruptor button', col).forEach((b) => b.addEventListener('click', () => cambiarRol(estado, b.dataset.rol)));
  $('.usar', col).addEventListener('click', () => {
    N.perfil.elegirDiseno(d);
    restaurarSala();
    location.href = '../app/';
  });
  $('.completa', col).addEventListener('click', restaurarSala);
  $('.recargar', col).addEventListener('click', () => {
    estado.marcos[estado.rol]?.remove();
    delete estado.marcos[estado.rol];
    cargar(estado, estado.rol);
  });
  pintarEnlaces(estado);
}

function pintarEnlaces(estado) {
  const { d, rol, col } = estado;
  const completa = rutaCompleta(d, rol);
  $('.completa', col).href = completa;
  const absoluta = urlAbsoluta(completa);
  try {
    $('.codigo', col).innerHTML = N.qrSVG(absoluta, { margen: 1, color: '#0E1E16' });
  } catch (e) {
    console.warn('[vitrina] qr:', e.message);
  }
  $('.url', col).textContent = `${rol === 'conductor' ? 'App del conductor' : 'App del pasajero'} · ${absoluta.replace(/^https?:\/\//, '')}`;
}

function cambiarRol(estado, rol) {
  if (estado.rol === rol) return;
  estado.rol = rol;
  $$('.v-interruptor button', estado.col).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.rol === rol)));
  pintarEnlaces(estado);
  if (estado.visible) cargar(estado, rol);
}

function mostrarEspera(estado, texto, { girando = true, detalle = '' } = {}) {
  estado.espera.hidden = false;
  $('.anillo', estado.espera).hidden = !girando;
  $('.texto', estado.espera).innerHTML = `${texto}${detalle ? `<small>${detalle}</small>` : ''}`;
}

async function cargar(estado, rol) {
  const { d, pantalla } = estado;
  for (const [r, f] of Object.entries(estado.marcos)) f.classList.toggle('oculto', r !== rol);
  if (estado.marcos[rol]) {
    estado.espera.hidden = Boolean(estado.marcos[rol].dataset.cargado);
    return;
  }
  mostrarEspera(estado, 'Cargando el diseño…');
  const disponible = await disenoDisponible(d, rol);
  if (estado.rol !== rol || estado.marcos[rol]) return;
  if (!disponible) {
    mostrarEspera(estado, `«${NOMBRES[d]}» se está terminando`, { girando: false, detalle: 'Vuelve en un momento y recarga la página.' });
    return;
  }
  const marco = document.createElement('iframe');
  marco.title = `Diseño ${NOMBRES[d]}: app del ${rol}`;
  marco.src = rutaVitrina(d, rol);
  marco.allow = 'geolocation; clipboard-write; web-share; fullscreen; camera';
  marco.addEventListener('load', () => {
    marco.dataset.cargado = '1';
    if (estado.rol === rol) setTimeout(() => { estado.espera.hidden = true; }, 250);
  });
  estado.marcos[rol] = marco;
  pantalla.appendChild(marco);
}

/* ---------------- Escala del celular ---------------- */

function ajustarEscala(estado) {
  const estilo = getComputedStyle(estado.col);
  const ancho = estado.col.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight);
  if (ancho <= 0) return;
  const bisel = ancho < 300 ? 8 : 11;
  const altoMax = Math.max(540, window.innerHeight - 120);
  const escala = Math.max(0.35, Math.min(1, (ancho - bisel * 2) / ANCHO, (altoMax - bisel * 2) / ALTO));
  estado.marco.style.setProperty('--escala', escala.toFixed(4));
  estado.marco.style.setProperty('--bisel', `${bisel}px`);
}

/* ---------------- Pestañas (pantallas angostas) ---------------- */

const pestanas = $$('.v-pestanas [role="tab"]');
function activar(d, { enfocar = false } = {}) {
  if (!columnas.has(d)) return;
  for (const p of pestanas) {
    const si = p.dataset.d === d;
    p.setAttribute('aria-selected', String(si));
    p.tabIndex = si ? 0 : -1;
    if (si && enfocar) p.focus();
  }
  for (const [clave, estado] of columnas) {
    estado.col.classList.toggle('activa', clave === d);
    if (clave === d) requestAnimationFrame(() => ajustarEscala(estado));
  }
  history.replaceState(null, '', `#${d}`);
}
pestanas.forEach((p, i) => {
  p.addEventListener('click', () => activar(p.dataset.d));
  p.addEventListener('keydown', (e) => {
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    activar(pestanas[(i + paso + pestanas.length) % pestanas.length].dataset.d, { enfocar: true });
  });
});

/* ---------------- Arranque ---------------- */

$$('.v-columna').forEach(armarColumna);

const medidor = new ResizeObserver((entradas) => {
  for (const e of entradas) {
    const estado = columnas.get(e.target.dataset.d);
    if (estado) ajustarEscala(estado);
  }
});
for (const estado of columnas.values()) medidor.observe(estado.col);
window.addEventListener('resize', () => columnas.forEach(ajustarEscala));

// Los iframes se cargan solo cuando la columna se ve en pantalla.
const vigia = new IntersectionObserver((entradas) => {
  for (const e of entradas) {
    const estado = columnas.get(e.target.closest('.v-columna').dataset.d);
    estado.visible = e.isIntersecting;
    if (e.isIntersecting) cargar(estado, estado.rol);
  }
}, { rootMargin: '150px 0px' });
for (const estado of columnas.values()) vigia.observe(estado.pantalla);

const inicial = location.hash.replace('#', '');
if (columnas.has(inicial)) {
  activar(inicial);
  const estado = columnas.get(inicial);
  if (matchMedia('(min-width: 901px)').matches) {
    estado.col.classList.add('resaltada');
    setTimeout(() => estado.col.classList.remove('resaltada'), 2600);
  }
} else if (columnas.has(disenoActual)) {
  // En el celular se abre primero la pestaña del diseño que ya usa.
  activar(disenoActual);
  history.replaceState(null, '', location.pathname + location.search);
}
