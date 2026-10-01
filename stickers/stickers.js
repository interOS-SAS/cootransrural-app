// Generador de stickers QR imprimibles, para cualquier cooperativa.
// La página fija la cooperativa con window.CT_EMPRESA (o ?e=id) antes de
// cargar este módulo; nombre, colores, teléfono y número de taxis salen de su
// ficha (empresas/<id>/ficha.json).
// Vista previa, descarga PNG (300 ppp) y SVG (vectorial), e impresión en hoja
// carta o A4 con marcas de corte, todo en el tamaño real exacto.
import * as N from '../nucleo/index.js';
import { prepararFuentes, prepararImagenes, escenaASVG, escenaAPNG, escenaACanvas, fuentesIncrustadas, matrizQR, IMAGENES } from './escena.js';
import { ESTILOS, FORMATOS, crearEscena, medidaTexto } from './formatos.js';
import { PAPELES, imponer, construirHojas, reglaPagina } from './impresion.js';

const $ = (sel) => document.querySelector(sel);
// Cada cooperativa recuerda sus opciones aparte (Cootransrural conserva la clave de siempre).
const CLAVE = N.ID_EMPRESA === 'cootransrural' ? 'ct.stickers' : `ct.${N.ID_EMPRESA}.stickers`;
const MAX_MOVILES = 999;
// Nombre corto para archivos y ejemplos de dominio: «Coopmultrasub» → «coopmultrasub».
const SLUG = String(N.EMPRESA.nombreCorto || N.EMPRESA.nombre || N.ID_EMPRESA)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[^a-z0-9]/g, '') || N.ID_EMPRESA;
const EJEMPLO_URL = `https://app.${SLUG}.com/descargar/`;
// Taxis de la cooperativa; si no se sabe cuántos son, 30.
const TAXIS = Number.isInteger(N.EMPRESA.taxis) && N.EMPRESA.taxis > 0 ? Math.min(N.EMPRESA.taxis, MAX_MOVILES) : 30;

// ---------------------------------------------------------------------------
// Estado (se recuerda en este navegador)
// ---------------------------------------------------------------------------
const PREDETERMINADO = {
  formato: 'taxi',
  estilo: 'clasico',
  modo: 'rango',
  desde: 1,
  hasta: TAXIS,
  lista: '',
  imprimirMovil: true,
  urlBase: '',
  copias: Object.fromEntries(Object.values(FORMATOS).map((f) => [f.id, f.copias])),
  papel: 'carta',
  sangrado: true,
  movilActual: '',
};

function leerEstado() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || '{}');
    const e = { ...PREDETERMINADO, ...guardado, copias: { ...PREDETERMINADO.copias, ...(guardado.copias || {}) } };
    if (!FORMATOS[e.formato]) e.formato = PREDETERMINADO.formato;
    if (!ESTILOS[e.estilo]) e.estilo = PREDETERMINADO.estilo;
    if (!PAPELES[e.papel]) e.papel = PREDETERMINADO.papel;
    if (!['rango', 'lista', 'generico'].includes(e.modo)) e.modo = 'rango';
    return e;
  } catch {
    return { ...PREDETERMINADO };
  }
}

const estado = leerEstado();
function guardarEstado() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}

// ---------------------------------------------------------------------------
// Móviles y URL del QR
// ---------------------------------------------------------------------------
const rellenar = (n) => String(n).padStart(3, '0');

function leerMoviles() {
  if (estado.modo === 'generico') return { moviles: [''], error: '' };
  if (estado.modo === 'rango') {
    let a = Math.trunc(Number(estado.desde));
    let b = Math.trunc(Number(estado.hasta));
    if (!a || !b || a < 1 || b < 1 || a > MAX_MOVILES || b > MAX_MOVILES) return { moviles: [], error: `Escribe números de móvil entre 1 y ${MAX_MOVILES}.` };
    if (a > b) [a, b] = [b, a];
    return { moviles: Array.from({ length: b - a + 1 }, (_, i) => rellenar(a + i)), error: '' };
  }
  const vistos = new Set();
  const malos = [];
  for (const parte of estado.lista.split(/[,;\s]+/).filter(Boolean)) {
    const rango = /^(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(parte);
    const solo = /^\d{1,3}$/.test(parte);
    if (rango) {
      let [a, b] = [Number(rango[1]), Number(rango[2])];
      if (a > b) [a, b] = [b, a];
      for (let i = Math.max(1, a); i <= b; i++) vistos.add(rellenar(i));
    } else if (solo && Number(parte) >= 1) vistos.add(rellenar(Number(parte)));
    else malos.push(parte);
  }
  const moviles = [...vistos];
  if (malos.length) return { moviles, error: `No entendí: ${malos.slice(0, 3).join(', ')}. Usa números (3, 7, 12-15).` };
  if (!moviles.length) return { moviles, error: 'Escribe al menos un número de móvil.' };
  return { moviles, error: '' };
}

function validarBase(texto) {
  const t = texto.trim();
  if (!t) return { base: null, error: '' };
  try {
    const u = new URL(t);
    if (!/^https?:$/.test(u.protocol)) throw new Error('protocolo');
    return { base: u, error: '' };
  } catch {
    return { base: null, error: `La URL debe empezar por https:// (por ejemplo ${EJEMPLO_URL}). Mientras tanto se usa la de esta app.` };
  }
}

// Contenido exacto del QR de un móvil ('' = sticker genérico).
export function urlQR(movil) {
  const { base } = validarBase(estado.urlBase);
  if (!base) return N.urlDescarga({ movil, origen: 'sticker' });
  const u = new URL(base.href);
  if (movil) u.searchParams.set('movil', String(movil).padStart(3, '0'));
  u.searchParams.set('o', 'sticker');
  return u.href;
}

// ---------------------------------------------------------------------------
// Escenas
// ---------------------------------------------------------------------------
function escenaDe(movil, formato = estado.formato, estilo = estado.estilo) {
  const imprimir = estado.modo !== 'generico' && estado.imprimirMovil;
  return crearEscena(formato, estilo, { url: urlQR(movil), movil: imprimir ? movil : '' });
}

function movilActual() {
  const { moviles } = leerMoviles();
  if (!moviles.length) return null;
  return moviles.includes(estado.movilActual) ? estado.movilActual : moviles[0];
}

function nombreArchivo(movil, extension) {
  const f = FORMATOS[estado.formato];
  const medida = `${f.ancho / 10}x${f.alto / 10}cm`.replace(/\./g, ',');
  return `${SLUG}-${f.id}-${medida}-${estado.estilo}${movil ? `-movil-${movil}` : '-generico'}.${extension}`;
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

let temporizadorAviso;
function avisar(texto) {
  const el = $('#aviso');
  el.textContent = texto;
  el.classList.add('visible');
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove('visible'), 3200);
}

async function generarPNG(movil = movilActual()) {
  await document.fonts.ready;
  const escena = escenaDe(movil);
  const { bytes, ancho, alto } = await escenaAPNG(escena);
  return { bytes, ancho, alto, url: escena.url, nombre: nombreArchivo(movil, 'png') };
}

async function generarSVG(movil = movilActual()) {
  const escena = escenaDe(movil);
  const fuentes = await fuentesIncrustadas(escena);
  const f = FORMATOS[estado.formato];
  const svg = escenaASVG(escena, { incrustarFuentes: fuentes, imagenesEmbebidas: true, etiqueta: `${N.EMPRESA.nombre} · ${f.nombre} · ${medidaTexto(f)}${movil ? ` · Móvil ${movil}` : ''}` });
  return { svg: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, url: escena.url, nombre: nombreArchivo(movil, 'svg') };
}

// ---------------------------------------------------------------------------
// Verificación del QR en la vista previa (se lee con jsQR, como un celular)
// ---------------------------------------------------------------------------
let cargaJsQR = null;
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  cargaJsQR ||= new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = new URL('../vendor/jsQR.min.js', import.meta.url).href;
    s.onload = () => resolver(window.jsQR);
    s.onerror = () => rechazar(new Error('No se pudo cargar el lector QR'));
    document.head.appendChild(s);
  });
  return cargaJsQR;
}

async function leerQRDeEscena(escena) {
  const jsQR = await cargarJsQR();
  const modulo = escena.qr.lado / (escena.qr.modulos + 8);
  // Resolución con la que cada módulo mide ~8 píxeles (como una foto de celular de cerca).
  const ppp = Math.max(100, Math.min(300, (8 / modulo) * 25.4));
  const lienzo = escenaACanvas(escena, ppp);
  const datos = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height);
  return jsQR(datos.data, datos.width, datos.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

// ---------------------------------------------------------------------------
// Interfaz
// ---------------------------------------------------------------------------
function pintarFormatos() {
  const cont = $('#formatos');
  cont.innerHTML = '';
  for (const f of Object.values(FORMATOS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'formato';
    b.setAttribute('role', 'radio');
    b.dataset.formato = f.id;
    b.innerHTML = `<span class="mini" aria-hidden="true"></span><span><b>${f.nombre}</b><span class="medida">${medidaTexto(f)}</span></span>`;
    b.addEventListener('click', () => {
      estado.formato = f.id;
      actualizar();
    });
    cont.appendChild(b);
  }
}

function pintarEstilos() {
  const cont = $('#estilos');
  cont.innerHTML = '';
  cont.dataset.cantidad = String(Object.keys(ESTILOS).length);
  for (const e of Object.values(ESTILOS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'estilo';
    b.setAttribute('role', 'radio');
    b.dataset.estilo = e.id;
    b.innerHTML = `<span class="muestras" aria-hidden="true">${e.muestra.map((c) => `<i style="background:${c}"></i>`).join('')}</span>${e.nombre}`;
    b.addEventListener('click', () => {
      estado.estilo = e.id;
      actualizar();
    });
    cont.appendChild(b);
  }
}

function marcarRadios(selector, atributo, valor) {
  document.querySelectorAll(selector).forEach((b) => {
    const activo = b.dataset[atributo] === valor;
    b.setAttribute('aria-checked', String(activo));
    b.tabIndex = activo ? 0 : -1;
  });
}

// Miniaturas en vivo de cada formato con el estilo y el móvil elegidos.
function pintarMiniaturas(movil) {
  document.querySelectorAll('.formato').forEach((b) => {
    const escena = escenaDe(movil, b.dataset.formato);
    b.querySelector('.mini').innerHTML = escenaASVG(escena, { unidades: false, imagenesEmbebidas: false });
  });
}

let escalaReal = false;
function pintarVista(escena) {
  const f = FORMATOS[estado.formato];
  const lienzo = $('#vista-sticker');
  lienzo.innerHTML = escenaASVG(escena, { unidades: false, etiqueta: `Vista previa: ${f.nombre}` });
  // Tamaño en pantalla: cabe en la mesa, o «tamaño real» en mm CSS.
  const vista = $('#vista');
  if (escalaReal) {
    vista.style.width = `${f.ancho}mm`;
  } else {
    const mesa = $('#mesa');
    const cs = getComputedStyle(mesa);
    const disponibleW = Math.max(200, mesa.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 8);
    const disponibleH = Math.max(260, Math.min(window.innerHeight - 260, 620));
    const escala = Math.min(disponibleW / f.ancho, disponibleH / f.alto, 4.2);
    vista.style.width = `${Math.round(f.ancho * escala)}px`;
  }
  $('#cota-ancho').textContent = `${String(f.ancho / 10).replace('.', ',')} cm`;
  $('#cota-alto').textContent = `${String(f.alto / 10).replace('.', ',')} cm`;
  $('#vista-descripcion').textContent = `${f.nombre}, ${medidaTexto(f)}, estilo ${ESTILOS[estado.estilo].nombre}.`;
}

let verificacion = 0;
async function pintarFicha(escena) {
  const { qr } = escena;
  const modulo = qr.lado / (qr.modulos + 8);
  const codigo = (modulo * qr.modulos) / 10;
  const ficha = $('#ficha');
  const cm = (v) => v.toFixed(1).replace('.', ',');
  ficha.innerHTML =
    `<span class="chip">Corrección <b>${qr.nivel}</b></span>` +
    `<span class="chip">Código de <b>${cm(codigo)} cm</b> de lado</span>` +
    `<span class="chip"><b>${qr.modulos} × ${qr.modulos}</b> módulos de ${(modulo).toFixed(2).replace('.', ',')} mm</span>` +
    `<span class="chip">Zona silenciosa de <b>4 módulos</b></span>` +
    `<span class="chip" id="chip-lectura">Leyendo el QR…</span>`;
  const turno = ++verificacion;
  try {
    const leido = await leerQRDeEscena(escena);
    if (turno !== verificacion) return;
    const chip = $('#chip-lectura');
    if (leido === escena.url) {
      chip.className = 'chip ok';
      chip.textContent = 'QR verificado: se lee bien';
    } else {
      chip.className = 'chip mal';
      chip.textContent = leido ? 'El QR no coincide con la URL' : 'No se pudo leer el QR';
    }
  } catch {
    if (turno === verificacion) $('#chip-lectura').textContent = 'Lector QR no disponible';
  }
}

function piezasDelTrabajo() {
  const { moviles } = leerMoviles();
  const copias = Math.max(1, Math.min(20, Math.trunc(estado.copias[estado.formato]) || 1));
  const piezas = [];
  for (const movil of moviles) {
    const escena = escenaDe(movil);
    for (let i = 0; i < copias; i++) piezas.push({ escena, movil });
  }
  return { piezas, copias, moviles };
}

function pintarResumen() {
  const f = FORMATOS[estado.formato];
  const { moviles } = leerMoviles();
  const copias = Math.max(1, Math.trunc(estado.copias[estado.formato]) || 1);
  const total = moviles.length * copias;
  const plan = imponer(f, estado.papel, { sangrado: estado.sangrado ? 2 : 0 });
  const hojas = Math.ceil(total / plan.porHoja) || 0;
  const generico = estado.modo === 'generico';
  const cuantos = generico ? `${copias} ${copias === 1 ? 'copia' : 'copias'} sin móvil` : `${moviles.length} ${moviles.length === 1 ? 'móvil' : 'móviles'} × ${copias} ${copias === 1 ? 'copia' : 'copias'}`;
  $('#resumen').innerHTML =
    `<p><b>${total}</b> ${total === 1 ? 'sticker' : 'stickers'} · ${cuantos}</p>` +
    `<p>${hojas} ${hojas === 1 ? 'hoja' : 'hojas'} ${PAPELES[estado.papel].nombre.toLowerCase()} · ${plan.porHoja} por hoja (${plan.cols} × ${plan.filas})</p>`;
  return { plan, total, hojas };
}

function pintarHojasPrevia(plan) {
  const f = FORMATOS[estado.formato];
  const { piezas } = piezasDelTrabajo();
  const { html, totalHojas } = construirHojas(piezas, f, plan, { limite: 2, estiloNombre: ESTILOS[estado.estilo].nombre });
  const cont = $('#hojas-previa');
  cont.innerHTML = '';
  const temp = document.createElement('div');
  temp.innerHTML = html;
  const anchoPx = 300;
  const escala = anchoPx / ((plan.papel.ancho / 25.4) * 96);
  [...temp.children].forEach((hoja, i) => {
    const caja = document.createElement('div');
    const marco = document.createElement('div');
    marco.className = 'miniatura';
    marco.style.width = `${anchoPx}px`;
    marco.style.height = `${Math.round((anchoPx * plan.papel.alto) / plan.papel.ancho)}px`;
    hoja.style.transform = `scale(${escala})`;
    marco.appendChild(hoja);
    const pie = document.createElement('div');
    pie.className = 'miniatura-pie';
    pie.textContent = `Hoja ${i + 1} de ${totalHojas}`;
    caja.append(marco, pie);
    cont.appendChild(caja);
  });
  const modo = plan.modo === 'juntos' ? 'Los stickers van pegados: un solo corte separa dos vecinos; las marcas están en el borde.' : `Cada sticker lleva marcas de corte en las esquinas${plan.sangrado ? ' y 2 mm de sangrado' : ''}.`;
  $('#hojas-texto').textContent = `${plan.papel.nombre} (${plan.papel.medida}) · ${totalHojas} ${totalHojas === 1 ? 'hoja' : 'hojas'} · ${modo}`;
}

function pintarControles() {
  marcarRadios('.formato', 'formato', estado.formato);
  marcarRadios('.estilo', 'estilo', estado.estilo);
  marcarRadios('#modo-moviles button', 'modo', estado.modo);
  marcarRadios('#papel button', 'papel', estado.papel);
  document.querySelectorAll('[data-si-modo]').forEach((el) => (el.hidden = el.dataset.siModo !== estado.modo));
  document.querySelectorAll('[data-no-modo]').forEach((el) => (el.hidden = el.dataset.noModo === estado.modo));
  const poner = (sel, valor) => {
    const el = $(sel);
    if (document.activeElement !== el && String(el.value) !== String(valor)) el.value = valor;
  };
  poner('#desde', estado.desde);
  poner('#hasta', estado.hasta);
  poner('#lista', estado.lista);
  poner('#url-base', estado.urlBase);
  poner('#copias', estado.copias[estado.formato]);
  $('#imprimir-movil').checked = estado.imprimirMovil;
  $('#sangrado').checked = estado.sangrado;
  $('#etiqueta-copias').textContent = estado.modo === 'generico' ? 'Copias' : 'Copias por móvil';

  const { moviles, error } = leerMoviles();
  const errMov = $('#error-moviles');
  errMov.hidden = !error;
  errMov.textContent = error;
  $('#lista').setAttribute('aria-invalid', String(Boolean(error) && estado.modo === 'lista'));
  const errUrl = validarBase(estado.urlBase).error;
  $('#error-url').hidden = !errUrl;
  $('#error-url').textContent = errUrl;
  $('#url-base').setAttribute('aria-invalid', String(Boolean(errUrl)));

  const sel = $('#movil-actual');
  const actual = movilActual();
  const opciones = moviles.map((m) => (m ? `Móvil ${m}` : 'Sticker sin móvil'));
  if (sel.dataset.opciones !== opciones.join('|')) {
    sel.innerHTML = moviles.map((m, i) => `<option value="${m}">${opciones[i]}</option>`).join('');
    sel.dataset.opciones = opciones.join('|');
  }
  if (actual !== null) sel.value = actual;
  const i = moviles.indexOf(actual);
  $('#movil-anterior').disabled = i <= 0;
  $('#movil-siguiente').disabled = i < 0 || i >= moviles.length - 1;
  sel.disabled = moviles.length <= 1;
}

let cuadroPendiente = null;
function actualizar() {
  guardarEstado();
  pintarControles();
  cancelAnimationFrame(cuadroPendiente);
  cuadroPendiente = requestAnimationFrame(() => {
    const movil = movilActual();
    const hayMoviles = movil !== null;
    ['#descargar-png', '#descargar-svg', '#imprimir'].forEach((s) => ($(s).disabled = !hayMoviles));
    if (!hayMoviles) return;
    const escena = escenaDe(movil);
    const enlace = $('#url-final');
    enlace.textContent = escena.url;
    enlace.href = escena.url;
    pintarMiniaturas(movil);
    pintarVista(escena);
    pintarFicha(escena);
    const { plan } = pintarResumen();
    pintarHojasPrevia(plan);
    document.documentElement.dataset.listo = '1';
  });
}

// Construye todas las hojas en #impresion (en el tamaño exacto).
async function prepararImpresion() {
  const f = FORMATOS[estado.formato];
  const plan = imponer(f, estado.papel, { sangrado: estado.sangrado ? 2 : 0 });
  const { piezas } = piezasDelTrabajo();
  $('#estilo-pagina').textContent = reglaPagina(estado.papel);
  const { html, totalHojas } = construirHojas(piezas, f, plan, { estiloNombre: ESTILOS[estado.estilo].nombre });
  $('#impresion').innerHTML = html;
  await document.fonts.ready;
  return { totalHojas, stickers: piezas.length, plan };
}

function enlazar() {
  document.querySelectorAll('#modo-moviles button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.modo = b.dataset.modo;
      actualizar();
    }),
  );
  document.querySelectorAll('#papel button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.papel = b.dataset.papel;
      actualizar();
    }),
  );
  // Flechas del teclado dentro de cada grupo de opciones.
  for (const grupo of ['#formatos', '#estilos', '#modo-moviles', '#papel']) {
    $(grupo).addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const botones = [...$(grupo).querySelectorAll('[role="radio"]')];
      const i = botones.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      const paso = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
      const sig = botones[(i + paso + botones.length) % botones.length];
      sig.click();
      sig.focus();
    });
  }
  $('#desde').addEventListener('input', (e) => {
    estado.desde = e.target.value;
    actualizar();
  });
  $('#hasta').addEventListener('input', (e) => {
    estado.hasta = e.target.value;
    actualizar();
  });
  $('#lista').addEventListener('input', (e) => {
    estado.lista = e.target.value;
    actualizar();
  });
  $('#url-base').addEventListener('input', (e) => {
    estado.urlBase = e.target.value;
    actualizar();
  });
  $('#imprimir-movil').addEventListener('change', (e) => {
    estado.imprimirMovil = e.target.checked;
    actualizar();
  });
  $('#sangrado').addEventListener('change', (e) => {
    estado.sangrado = e.target.checked;
    actualizar();
  });
  const ponerCopias = (v) => {
    estado.copias[estado.formato] = Math.max(1, Math.min(20, Math.trunc(Number(v)) || 1));
    actualizar();
  };
  $('#copias').addEventListener('change', (e) => ponerCopias(e.target.value));
  $('#copias-menos').addEventListener('click', () => ponerCopias((estado.copias[estado.formato] || 1) - 1));
  $('#copias-mas').addEventListener('click', () => ponerCopias((estado.copias[estado.formato] || 1) + 1));

  $('#movil-actual').addEventListener('change', (e) => {
    estado.movilActual = e.target.value;
    actualizar();
  });
  const mover = (paso) => {
    const { moviles } = leerMoviles();
    const i = moviles.indexOf(movilActual());
    const j = Math.max(0, Math.min(moviles.length - 1, i + paso));
    estado.movilActual = moviles[j];
    actualizar();
  };
  $('#movil-anterior').addEventListener('click', () => mover(-1));
  $('#movil-siguiente').addEventListener('click', () => mover(1));

  $('#tamano-real').addEventListener('click', (e) => {
    escalaReal = !escalaReal;
    e.currentTarget.setAttribute('aria-pressed', String(escalaReal));
    actualizar();
  });

  const conEspera = (boton, tarea) => async () => {
    boton.setAttribute('aria-busy', 'true');
    try {
      await tarea();
    } catch (err) {
      console.error(err);
      avisar(`No se pudo completar: ${err.message}`);
    } finally {
      boton.removeAttribute('aria-busy');
    }
  };

  $('#descargar-png').addEventListener(
    'click',
    conEspera($('#descargar-png'), async () => {
      const r = await generarPNG();
      descargar(new Blob([r.bytes], { type: 'image/png' }), r.nombre);
      avisar(`PNG listo: ${r.ancho} × ${r.alto} px a 300 ppp.`);
    }),
  );
  $('#descargar-svg').addEventListener(
    'click',
    conEspera($('#descargar-svg'), async () => {
      const r = await generarSVG();
      descargar(new Blob([r.svg], { type: 'image/svg+xml' }), r.nombre);
      avisar('SVG vectorial listo, con las fuentes incluidas.');
    }),
  );
  $('#imprimir').addEventListener(
    'click',
    conEspera($('#imprimir'), async () => {
      const { totalHojas, stickers } = await prepararImpresion();
      avisar(`${stickers} ${stickers === 1 ? 'sticker' : 'stickers'} en ${totalHojas} ${totalHojas === 1 ? 'hoja' : 'hojas'}. Imprime al 100 %.`);
      window.print();
    }),
  );
  window.addEventListener('afterprint', () => {
    $('#impresion').innerHTML = '';
  });

  let temporizador;
  window.addEventListener('resize', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(actualizar, 150);
  });
}

async function iniciar() {
  $('#url-base').placeholder = EJEMPLO_URL;
  await Promise.all([prepararFuentes(), prepararImagenes()]);
  // El ícono de la barra, con los colores de la cooperativa (como en los stickers).
  const marca = $('#marca-icono');
  if (marca && IMAGENES.icono) {
    marca.src = IMAGENES.icono.url;
    marca.style.visibility = '';
  }
  pintarFormatos();
  pintarEstilos();
  enlazar();
  $('#taller').setAttribute('aria-busy', 'false');
  actualizar();
}

// Para las pruebas automáticas y para usar desde la consola.
window.stickers = { estado, urlQR, generarPNG, generarSVG, prepararImpresion, leerMoviles, escenaDe, actualizar, matrizQR, FORMATOS, ESTILOS, empresa: N.ID_EMPRESA, clave: CLAVE };

iniciar().catch((e) => {
  console.error(e);
  avisar('No se pudo iniciar el generador. Recarga la página.');
});
