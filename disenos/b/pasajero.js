// Diseño B «Verde Rosal» — app del pasajero.
// Cooperativo, cercano y fácil para todas las edades: letra grande, botones
// grandes, pasos numerados y una línea de tiempo clara del viaje.
// Sirve para cualquier cooperativa: nombre, datos y colores salen de MARCA y
// PALETA (comun.js), que a su vez salen de la ficha de la cooperativa.
import {
  ic, insignia, taxiLado, escenaBienvenida, selloVerificado, esc, decimal, celularTexto, numeroMiles,
  placaHTML, avatarHTML, estrellasHTML, conexionHTML, actualizarConexion, sellosHTML, casillasHTML,
  activarCasillas, crearAvisos, crearHoja, ladoMarco, enlaceParaCelular, ponerTeselas, nombreCorto, sinCorte, encuadrar,
  FOTOS, fotoHTML, activarFotos,
  protegerVibracion,
  MARCA, PALETA, NOMBRE_DISENO, aplicarMarca, enPueblo, lineaMarca, cifrasMarca, telCentral, movilEjemplo, urlPrivacidad,
  chipPrueba, demoPara, notaPropuesta, desarrolladaPor, enlaceApp, enlaceMunicipio, separarViajeGuardado, sincronizarSonido,
  TAXICUN, lineaTaxiCun, iconoTaxiCun, textoDesarrollada,
} from './comun.js';

const PESTANAS = [
  ['inicio', 'Inicio', 'casa'],
  ['viajes', 'Viajes', 'historial'],
  ['tarifas', 'Tarifas', 'billete'],
  ['perfil', 'Perfil', 'usuario'],
];
const CON_PESTANAS = new Set(PESTANAS.map((x) => x[0]));
const MENSAJES_BUSQUEDA = [
  'Avisando a los taxis cercanos…',
  'Buscando el móvil más cercano a ti…',
  'Un conductor está revisando tu solicitud…',
  'Ya casi: confirmando tu taxi…',
];
const TEXTO_ESTRELLAS = ['Toca las estrellas', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'];
const NOTAS_RAPIDAS = ['Estoy en la portería', 'Llevo maletas', 'Voy con mascota', 'Casa de reja verde'];
const COLOR_RUTA = PALETA.verde;

export async function montar(raiz, { N, diseno = 'b' } = {}) {
  // El viaje guardado de otra cooperativa (misma pestaña) se aparta antes de leerlo.
  separarViajeGuardado(MARCA.id);
  sincronizarSonido(N);
  // Viaje que había antes de recargar la página (para explicar qué pasó con él).
  let previo = null;
  try {
    previo = JSON.parse(sessionStorage.getItem('ct.viaje.pasajero') || 'null');
  } catch {
    previo = null;
  }
  protegerVibracion();
  aplicarMarca();
  const p = await N.crearPasajero();

  /* ---------------- estructura base ---------------- */
  raiz.innerHTML = `<div class="vb-marco">
    ${ladoMarco({
      titulo: ['Pide tu taxi', enPueblo('en', { sinCortar: true })].filter(Boolean).join(' '),
      texto: `${TAXICUN.activo ? `${TAXICUN.nombre}, con los taxis de ${MARCA.nombre}` : `La app de ${MARCA.nombre}`}: ubicación exacta, conductores verificados y pago con QR.${MARCA.lema ? ` ${MARCA.lema.replace(/[.!]*$/, '.')}` : ''}`,
      puntos: ['Te recogemos en la puerta con GPS', 'Sabes qué móvil llega y con qué placa', 'Código de abordaje y botón de emergencia', 'Tarifas claras y programación con 10 % menos'],
      enlaceQR: enlaceParaCelular('pasajero'),
      textoQR: 'Escanea para probarla en tu celular',
    })}
    <div class="vb-app vb-pasajero">
      <div class="vb-avisos" role="status" aria-live="polite"></div>
      <main class="vb-vista" tabindex="-1"></main>
      <nav class="vb-pestanas" aria-label="Secciones" hidden></nav>
      <div class="vb-capa-hoja" hidden></div>
    </div>
  </div>`;
  const app = raiz.querySelector('.vb-app');
  const vista = app.querySelector('.vb-vista');
  const nav = app.querySelector('.vb-pestanas');
  const avisos = crearAvisos(app.querySelector('.vb-avisos'));
  const hoja = crearHoja(app.querySelector('.vb-capa-hoja'));
  const $ = (s) => vista.querySelector(s);
  const $$ = (s) => [...vista.querySelectorAll(s)];

  /* ---------------- estado de la interfaz ---------------- */
  const posInicial = p.estado.miPosicion || N.PUNTO_RECOGIDA || N.CENTRO;
  const ui = {
    pantalla: 'inicio',
    clave: '',
    registro: { etapa: 'bienvenida', datos: null, codigo: '' },
    recogida: { lat: posInicial.lat, lng: posInicial.lng, titulo: 'Tu ubicación', detalle: 'Buscando la dirección…' },
    destino: undefined, // undefined = sin elegir; null = «se lo digo al conductor»
    destinoMapa: null,
    cot: null,
    cotSeq: 0,
    dirSeq: 0,
    busSeq: 0,
    metodoPago: 'qr',
    programar: false,
    fecha: '',
    nota: '',
    categoria: 'centro',
    pestanaViajes: 'historial',
    tiempos: {},
    relojes: [],
    faseAnterior: p.estado.fase,
    permisoPedido: false,
    arrastre: 0,
    billetera: N.BILLETERAS[0].id,
    estrellas: 0,
    etiquetas: new Set(),
    listas: {},
  };
  if (p.estado.fase !== 'inicio') ui.tiempos[p.estado.fase] = Date.now();

  /* ---------------- mapa (uno solo, se mueve entre pantallas) ---------------- */
  const mapaEl = document.createElement('div');
  mapaEl.className = 'vb-mapa';
  let m = null;
  let promesaMapa = null;
  let tokenMapa = 0;
  let modoMapa = null;
  let quitarOyentes = [];
  let temporizadorDir = null;

  function crearMapaUnaVez() {
    promesaMapa ??= N.crearMapa(mapaEl, {
      capa: 'suave',
      centro: ui.recogida,
      zoom: 16,
      colorRuta: COLOR_RUTA,
      colorOrigen: PALETA.verde,
      colorDestino: PALETA.rojo,
      controles: false,
    }).then((mm) => {
      m = mm;
      ponerTeselas(m);
      m.mapa.on('dragstart', () => (ui.arrastre = Date.now()));
      return mm;
    });
    return promesaMapa;
  }

  async function colocarMapa(slot, modo) {
    const token = ++tokenMapa;
    slot.prepend(mapaEl);
    try {
      await crearMapaUnaVez();
    } catch (e) {
      slot.classList.add('sin-mapa');
      slot.insertAdjacentHTML('beforeend', '<p class="vb-mapa-error">No se pudo cargar el mapa. Revisa tu conexión.</p>');
      return;
    }
    if (token !== tokenMapa || !slot.isConnected) return;
    m.refrescar();
    configurarModo(modo);
  }

  function interactivo(si) {
    for (const h of ['dragging', 'touchZoom', 'doubleClickZoom', 'scrollWheelZoom', 'boxZoom', 'keyboard']) {
      const control = m.mapa[h];
      if (control) si ? control.enable() : control.disable();
    }
  }

  function configurarModo(modo) {
    modoMapa = modo;
    quitarOyentes.forEach((f) => f());
    quitarOyentes = [];
    m.quitarOrigen();
    m.quitarDestino();
    m.quitarRuta();
    const e = p.estado;
    // Sin GPS la posición es el paradero de taxis de la ficha o el centro del pueblo: no se marca como «aquí estás».
    if (e.miPosicion && e.miPosicion.real !== false) m.ponerYo(e.miPosicion);
    interactivo(modo !== 'vista');
    // La vista previa del inicio es solo para mirar: fuera del orden del teclado
    // (los toques pasan a la tarjeta, que lleva al paso 1).
    mapaEl.inert = modo === 'vista';
    if (modo === 'vista') {
      m.limpiarTaxis();
      m.sincronizarTaxis(e.taxisCercanos);
      m.mapa.setView([ui.recogida.lat, ui.recogida.lng], 15, { animate: false, reset: true });
    } else if (modo === 'recogida' || modo === 'destino-mapa') {
      m.limpiarTaxis();
      m.sincronizarTaxis(e.taxisCercanos);
      const centro = modo === 'recogida' ? ui.recogida : ui.destinoMapa || ui.recogida;
      m.mapa.setView([centro.lat, centro.lng], 17, { animate: false, reset: true });
      const pin = vista.querySelector('.vb-pin-fijo');
      quitarOyentes.push(
        m.alEmpezarAMoverse(() => pin?.classList.add('moviendo')),
        m.alMoverse((c) => {
          pin?.classList.remove('moviendo');
          alMoverPin(modo, c);
        }),
      );
    } else if (modo === 'ruta') {
      m.limpiarTaxis();
      m.ponerOrigen(ui.recogida);
      if (ui.destino) m.ponerDestino(ui.destino);
      dibujarRutaCotizada();
    } else if (modo === 'seguimiento') {
      configurarSeguimiento();
    }
  }

  function alMoverPin(modo, c) {
    const actual = modo === 'recogida' ? ui.recogida : ui.destinoMapa;
    if (actual && N.distanciaKm(actual, c) < 0.004) return;
    const punto = { lat: c.lat, lng: c.lng, titulo: 'Buscando la dirección…', detalle: '' };
    if (modo === 'recogida') ui.recogida = punto;
    else ui.destinoMapa = punto;
    pintarDireccion(modo === 'recogida' ? 'recogida' : 'destinoMapa');
    clearTimeout(temporizadorDir);
    temporizadorDir = setTimeout(() => resolverDireccion(modo === 'recogida' ? 'recogida' : 'destinoMapa'), 450);
  }

  async function resolverDireccion(campo = 'recogida') {
    const punto = ui[campo];
    if (!punto) return;
    const seq = ++ui.dirSeq;
    const d = await N.direccionDe(punto);
    if (seq !== ui.dirSeq || ui[campo] !== punto) return;
    punto.titulo = d.titulo;
    punto.detalle = d.detalle;
    pintarDireccion(campo);
  }

  // Si el usuario confirma antes de que llegue la dirección, se espera un momento.
  async function completarDireccion(campo, boton) {
    const punto = ui[campo];
    if (!punto || (punto.titulo && punto.titulo !== 'Buscando la dirección…')) return;
    clearTimeout(temporizadorDir);
    boton?.classList.add('cargando');
    if (boton) boton.disabled = true;
    const d = await Promise.race([N.direccionDe(punto), N.esperar(4000).then(() => null)]);
    if (boton) {
      boton.disabled = false;
      boton.classList.remove('cargando');
    }
    punto.titulo = d?.titulo || 'Punto en el mapa';
    punto.detalle = d?.detalle || '';
  }

  function pintarDireccion(campo = 'recogida') {
    const punto = ui[campo];
    if (!punto) return;
    for (const el of vista.querySelectorAll(`[data-dir="${campo}"] [data-dir-titulo]`)) el.textContent = punto.titulo || 'Punto en el mapa';
    for (const el of vista.querySelectorAll(`[data-dir="${campo}"] [data-dir-detalle]`)) el.textContent = punto.detalle || '';
  }

  function dibujarRutaCotizada() {
    if (!m || modoMapa !== 'ruta') return;
    const ruta = ui.cot?.ruta;
    if (ruta?.coords?.length) m.ponerRuta(ruta.coords, { color: COLOR_RUTA, grosor: 6 });
    encuadrar(m, [ui.recogida, ui.destino], { margen: [48, 48], maxZoom: 16, reset: true });
  }

  function configurarSeguimiento() {
    const e = p.estado;
    const v = e.viaje;
    if (!v) return;
    interactivo(true);
    m.ponerOrigen(v.origen);
    if (v.destino) m.ponerDestino(v.destino);
    if (e.fase === 'buscando') {
      m.limpiarTaxis();
      m.sincronizarTaxis(e.taxisCercanos);
      m.mapa.setView([v.origen.lat, v.origen.lng], 16, { animate: false, reset: true });
      return;
    }
    m.limpiarTaxis('asignado');
    if (e.fase === 'asignado' && e.rutaConductor?.length) m.ponerRuta(e.rutaConductor, { color: COLOR_RUTA, discontinua: true, grosor: 5 });
    if (e.fase === 'en_viaje' && v.ruta?.coords?.length) m.ponerRuta(v.ruta.coords, { color: COLOR_RUTA, grosor: 6 });
    ponerTaxiAsignado();
    encuadrarSeguimiento(true);
  }

  function ponerTaxiAsignado() {
    const e = p.estado;
    if (!m || !e.posConductor || !e.conductor) return;
    m.ponerTaxi('asignado', e.posConductor, { rumbo: e.posConductor.rumbo || 0, destacado: true, etiqueta: `Móvil ${esc(e.conductor.movil)}` });
  }

  function encuadrarSeguimiento(reset = false) {
    const e = p.estado;
    const v = e.viaje;
    if (!m || !v) return;
    const opciones = { margen: [44, 86], maxZoom: 17, reset };
    if (e.fase === 'llego') encuadrar(m, [v.origen], opciones);
    else if (e.fase === 'asignado') encuadrar(m, [e.posConductor, v.origen], opciones);
    else if (e.fase === 'en_viaje') encuadrar(m, [e.posConductor, v.destino || v.origen], opciones);
  }

  /* ---------------- navegación ---------------- */
  try {
    history.replaceState({ vb: 'inicio' }, '');
  } catch {
    /* sin historial (iframe restringido) */
  }

  function irA(pantalla, { reemplazar = false } = {}) {
    ui.pantalla = pantalla;
    try {
      if (reemplazar) history.replaceState({ vb: pantalla }, '');
      else history.pushState({ vb: pantalla }, '');
    } catch {
      /* nada */
    }
    pintar(true, true);
  }

  function irTab(pantalla) {
    irA(pantalla, { reemplazar: true });
  }

  function volver() {
    if (history.state?.vb && history.state.vb !== 'inicio') history.back();
    else irA('inicio', { reemplazar: true });
  }

  window.addEventListener('popstate', (e) => {
    if (p.estado.fase !== 'inicio' || !p.registrado) return;
    hoja.cerrar();
    let destino = e.state?.vb || 'inicio';
    if (destino === 'paso3' && ui.destino === undefined) destino = 'paso2';
    ui.pantalla = destino;
    pintar(true, true);
  });

  /* ---------------- ciclo de pintado ---------------- */
  function clave() {
    const f = p.estado.fase;
    if (f !== 'inicio') return ['buscando', 'asignado', 'llego', 'en_viaje'].includes(f) ? `seg:${f}` : f;
    if (!p.registrado) return `registro:${ui.registro.etapa}`;
    return ui.pantalla;
  }

  function pintar(forzar = false, enfocar = false) {
    const f = p.estado.fase;
    if (f !== ui.faseAnterior) {
      alCambiarFase(ui.faseAnterior, f);
      ui.faseAnterior = f;
      enfocar = true;
    }
    const k = clave();
    if (forzar || k !== ui.clave) renderCompleto(k, enfocar || k !== ui.clave);
    else actualizar();
  }

  function alCambiarFase(de, a) {
    hoja.cerrar();
    // Los avisos de la fase anterior ya no aplican (el núcleo manda el nuevo enseguida).
    avisos.limpiar();
    if (de === 'inicio' && a !== 'inicio') ui.tiempos = {};
    if (a !== 'inicio') ui.tiempos[a] ??= Date.now();
    if (a === 'inicio' && de !== 'inicio') {
      ui.pantalla = 'inicio';
      ui.destino = undefined;
      ui.cot = null;
      ui.nota = '';
      ui.programar = false;
      ui.estrellas = 0;
      ui.etiquetas.clear();
      try {
        history.replaceState({ vb: 'inicio' }, '');
      } catch {
        /* nada */
      }
    }
  }

  function limpiarRelojes() {
    ui.relojes.forEach((r) => clearInterval(r));
    ui.relojes = [];
  }

  function renderCompleto(k, enfocar) {
    ui.clave = k;
    limpiarRelojes();
    m?.mapa.stop();
    const def = pantallaDe(k);
    vista.dataset.pantalla = k.replace(':', '-');
    vista.innerHTML = def.html();
    const conPestanas = CON_PESTANAS.has(k);
    nav.hidden = !conPestanas;
    if (conPestanas) nav.innerHTML = htmlPestanas(k);
    def.montar?.();
    actualizar();
    if (enfocar) {
      const titulo = vista.querySelector('h1');
      titulo?.focus({ preventScroll: true });
    }
  }

  function pantallaDe(k) {
    if (k.startsWith('seg:')) return { html: htmlSeguimiento, montar: montarSeguimiento };
    return PANTALLAS[k] || PANTALLAS.inicio;
  }

  // Actualizaciones pequeñas dentro de la pantalla actual (sin repintar todo).
  function actualizar() {
    const e = p.estado;
    actualizarConexion(app, e.conexion);
    const k = ui.clave;
    if (m && (modoMapa === 'vista' || modoMapa === 'recogida' || modoMapa === 'destino-mapa' || (modoMapa === 'seguimiento' && e.fase === 'buscando'))) {
      if (mapaEl.isConnected) m.sincronizarTaxis(e.taxisCercanos);
    }
    if (k === 'inicio') {
      const chip = $('[data-taxis-cerca] span');
      // Libres y en línea: el pasajero ve cuántos hay sin llamar uno por uno.
      const enLinea = e.taxisCercanos.length;
      const libres = e.taxisCercanos.filter((t) => !t.ocupado).length;
      if (chip) chip.textContent = libres ? `${libres} ${libres === 1 ? 'taxi libre' : 'taxis libres'} cerca · ${enLinea} en línea` : 'Buscando taxis cerca…';
    }
    if (k.startsWith('seg:')) actualizarSeguimiento();
    if (k === 'calificar') actualizarCalificacionRecibida();
  }

  /* ================================================================ */
  /* REGISTRO                                                          */
  /* ================================================================ */
  // Cifras conocidas de la cooperativa (las que la ficha no trae no se muestran).
  function htmlCifras() {
    const cifras = cifrasMarca().filter((c) => c.clave !== 'microbuses')
      .map((c) => `<span>${c.antes}<b>${numeroMiles(c.n)}</b> ${c.texto}</span>`);
    if (MARCA.servicio24h) cifras.push('<span><b>24 h</b> de servicio</span>');
    return cifras.length ? `<p class="vb-cifras">${cifras.join('')}</p>` : '';
  }

  function htmlBienvenida() {
    const titulo = ['Tu taxi de confianza', enPueblo()].filter(Boolean).join(' ');
    // El lema solo se muestra si no repite el título (en Subachoque son iguales).
    const normal = (s) => s.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-záéíóúñü ]/g, '').trim();
    const lema = MARCA.lema && normal(MARCA.lema) !== normal(titulo) ? MARCA.lema : '';
    return `<div class="vb-desliza vb-bienvenida">
      ${notaPropuesta('franja')}
      <div class="vb-bienv-escena">
        ${fotoHTML({ src: FOTOS.bienvenida, alt: 'Taxi amarillo en una calle empedrada de un pueblo de la Sabana, al atardecer', posicion: '38% 70%', respaldo: escenaBienvenida({ movil: MARCA.movilDemo }) })}
        <div class="vb-bienv-marca">${insignia(52)}<div><b>${esc(MARCA.nombre)}</b><span>${esc(lineaMarca())}</span></div></div>
        ${MARCA.servicio24h ? `<span class="vb-bienv-chip">${ic('reloj', 18)} Servicio las 24 horas</span>` : ''}
      </div>
      <div class="vb-bienv-cuerpo">
        ${TAXICUN.activo ? lineaTaxiCun('vb-bienv-tc') : ''}
        <h1 tabindex="-1">${esc(titulo)}</h1>
        ${lema ? `<p class="vb-lema">«${esc(lema)}»</p>` : ''}
        <ul class="vb-beneficios">
          <li><span class="vb-beneficio-ic">${ic('pin')}</span><span><b>Te recogemos en la puerta</b> con tu ubicación exacta.</span></li>
          <li><span class="vb-beneficio-ic">${ic('escudo')}</span><span><b>Conductores verificados</b> y código para abordar.</span></li>
          <li><span class="vb-beneficio-ic">${ic('qr')}</span><span><b>Paga con QR o en efectivo</b>, como prefieras.</span></li>
        </ul>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="reg-empezar">Crear mi cuenta ${ic('flechaDer')}</button>
        <a class="vb-btn vb-btn-texto vb-btn-bloque" href="${esc(enlaceApp('conductor', diseno))}" data-enlace-conductor>Soy conductor de ${esc(MARCA.nombre)}</a>
        ${htmlCifras()}
      </div>
    </div>`;
  }

  function htmlRegistroDatos() {
    const d = ui.registro.datos || {};
    return `<div class="vb-desliza vb-registro">
      <header class="vb-cab-simple">
        <button type="button" class="vb-btn-icono" data-accion="reg-atras" aria-label="Volver">${ic('atras')}</button>
        <span class="vb-paso-mini">Paso 1 de 2</span>
      </header>
      ${TAXICUN.activo ? lineaTaxiCun('vb-registro-tc', 26) : ''}
      <h1 tabindex="-1">Crea tu cuenta</h1>
      <p class="vb-sub">Por tu seguridad, todos los pasajeros se registran. Solo toma un minuto.</p>
      <form class="vb-form" data-form="registro" novalidate>
        <label class="vb-campo"><span>Tu nombre</span>
          <input name="nombre" autocomplete="name" placeholder="Ej.: María Fernanda Gómez" value="${esc(d.nombre || '')}" required></label>
        <label class="vb-campo"><span>Tu celular</span>
          <span class="vb-campo-celular"><span class="vb-prefijo">+57</span><input name="celular" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20" placeholder="300 123 4567" value="${esc(d.celular || '')}" required></span>
          <small>Te enviaremos un código por SMS para verificarlo.</small></label>
        <fieldset class="vb-grupo">
          <legend>Contacto de emergencia <em class="vb-opcional">Opcional</em></legend>
          <p>Si algo pasa en un viaje, con un toque le avisas dónde vas.</p>
          <label class="vb-campo"><span>Nombre</span><input name="emerNombre" autocomplete="off" placeholder="Ej.: Mamá" value="${esc(d.emerNombre || '')}"></label>
          <label class="vb-campo"><span>Celular</span><input name="emerCelular" type="tel" inputmode="tel" maxlength="20" placeholder="310 000 0000" value="${esc(d.emerCelular || '')}"></label>
        </fieldset>
        <label class="vb-check"><input type="checkbox" name="terminos" ${d.terminos ? 'checked' : ''}><span class="vb-check-caja" aria-hidden="true">${ic('check', 18)}</span>
          <span>Acepto los <a href="${esc(urlPrivacidad())}" target="_blank" rel="noopener">términos y la política de privacidad</a>.</span></label>
        <p class="vb-error" id="vb-error-registro" data-error role="alert"></p>
        <button type="submit" class="vb-btn vb-btn-primario vb-btn-xl">Enviarme el código ${ic('mensaje')}</button>
      </form>
    </div>`;
  }

  function htmlRegistroCodigo() {
    const d = ui.registro.datos || {};
    return `<div class="vb-desliza vb-registro">
      <header class="vb-cab-simple">
        <button type="button" class="vb-btn-icono" data-accion="reg-atras" aria-label="Volver">${ic('atras')}</button>
        <span class="vb-paso-mini">Paso 2 de 2</span>
      </header>
      ${TAXICUN.activo ? lineaTaxiCun('vb-registro-tc', 26) : ''}
      <h1 tabindex="-1">Escribe el código</h1>
      <p class="vb-sub">Lo enviamos por SMS al <b>${esc(celularTexto(d.celular))}</b>.</p>
      <div class="vb-sms-prueba" role="note">
        <span class="vb-sms-ic">${ic('mensaje', 26)}</span>
        <div><small>SMS simulado · modo prueba</small><b>Código de prueba: <span data-codigo-prueba>${ui.registro.codigo}</span></b></div>
      </div>
      ${casillasHTML({ id: 'vb-codigo-sms', etiqueta: 'Código de 4 dígitos' })}
      <p class="vb-error" data-error role="alert"></p>
      <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="reg-verificar">Verificar y entrar</button>
      <button type="button" class="vb-btn vb-btn-texto vb-btn-bloque" data-accion="reg-reenviar">Enviar otro código</button>
      <p class="vb-nota-segura">${insignia(34)}<span>Tus datos quedan guardados en este celular y solo se usan para tus viajes con ${esc(MARCA.nombre)}${TAXICUN.activo ? ` en ${esc(TAXICUN.nombre)}` : ''}.</span></p>
    </div>`;
  }

  let casillasSMS = null;
  function montarRegistroCodigo() {
    casillasSMS = activarCasillas($('[data-casillas]'), { alCompletar: () => verificarCodigo() });
    setTimeout(() => casillasSMS?.campo.focus({ preventScroll: true }), 50);
  }

  function codigo4() {
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  function soloDigitos(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
    return d;
  }

  function enviarRegistro(form) {
    const f = new FormData(form);
    const datos = {
      nombre: String(f.get('nombre') || '').trim().replace(/\s+/g, ' '),
      celular: soloDigitos(f.get('celular')),
      emerNombre: String(f.get('emerNombre') || '').trim(),
      emerCelular: soloDigitos(f.get('emerCelular')),
      terminos: f.get('terminos') === 'on',
    };
    ui.registro.datos = datos;
    const error = form.querySelector('[data-error]');
    form.querySelectorAll('[aria-invalid]').forEach((x) => x.removeAttribute('aria-invalid'));
    // El mensaje se pone justo debajo del campo con el problema, que queda marcado en rojo.
    const fallar = (texto, campo) => {
      const el = form.querySelector(`[name="${campo}"]`);
      error.textContent = texto;
      if (el) {
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', 'vb-error-registro');
        el.closest('.vb-campo, .vb-check')?.after(error);
        el.focus();
        error.scrollIntoView({ block: 'nearest' });
      }
    };
    if (datos.nombre.length < 3 || !/[a-záéíóúñ]/i.test(datos.nombre)) return fallar('Escribe tu nombre (mínimo 3 letras).', 'nombre');
    if (!/^3\d{9}$/.test(datos.celular)) return fallar('El celular debe tener 10 dígitos y empezar por 3.', 'celular');
    if (datos.emerCelular && !/^[36]\d{9}$/.test(datos.emerCelular)) return fallar('El celular del contacto de emergencia debe tener 10 dígitos.', 'emerCelular');
    if (datos.emerCelular && !datos.emerNombre) return fallar('Escribe el nombre de tu contacto de emergencia.', 'emerNombre');
    if (!datos.terminos) return fallar('Para continuar, acepta los términos y la política de privacidad.', 'terminos');
    ui.registro.codigo = codigo4();
    ui.registro.etapa = 'codigo';
    pintar(true, true);
    avisos.mostrar({ titulo: 'SMS enviado (simulado)', cuerpo: `Tu código de prueba es ${ui.registro.codigo}.`, tipo: 'info' });
  }

  function verificarCodigo() {
    const valor = casillasSMS?.valor() || '';
    const error = $('[data-error]');
    if (valor.length < 4) {
      error.textContent = 'Escribe los 4 dígitos del código.';
      casillasSMS?.error();
      return;
    }
    if (valor !== ui.registro.codigo) {
      error.textContent = 'Ese código no coincide. Revisa el SMS e intenta de nuevo.';
      casillasSMS?.error();
      casillasSMS?.limpiar();
      return;
    }
    const d = ui.registro.datos;
    N.perfil.registrarPasajero({
      nombre: d.nombre,
      celular: d.celular,
      contactoEmergencia: d.emerCelular ? { nombre: d.emerNombre, celular: d.emerCelular } : null,
      verificado: true,
    });
    ui.registro = { etapa: 'bienvenida', datos: null, codigo: '' };
    ui.pantalla = 'inicio';
    pintar(true, true);
    avisos.limpiar();
    avisos.mostrar({ titulo: `¡Hola, ${N.primerNombre(d.nombre)}!`, cuerpo: 'Tu cuenta quedó lista. Ya puedes pedir tu taxi.', tipo: 'exito' });
  }

  /* ================================================================ */
  /* INICIO                                                            */
  /* ================================================================ */
  function htmlPestanas(actual) {
    return PESTANAS.map(([id, texto, icono]) => `<button type="button" class="vb-pestana${id === actual ? ' activa' : ''}" data-accion="tab" data-pantalla="${id}" ${id === actual ? 'aria-current="page"' : ''}>
      <span class="vb-pestana-ic">${ic(icono, 24)}</span><span>${texto}</span></button>`).join('');
  }

  function notaSinGps() {
    return p.estado.miPosicion?.real === false
      ? `<p class="vb-nota-gps" role="note">${ic('info', 20)}<span>${N.PARADERO?.nombre ? `Usamos el ${esc(N.PARADERO.nombre.charAt(0).toLowerCase() + N.PARADERO.nombre.slice(1))}` : `Usamos el centro de ${esc(MARCA.pueblo || 'el municipio')}`}. Mueve el mapa para ubicar tu punto.</span></p>`
      : '';
  }

  function htmlInicio() {
    const yo = p.perfil || {};
    const prog = N.progresoFidelidad(p.viajesCompletados());
    const programados = N.perfil.viajesProgramados();
    const historial = N.perfil.historialPasajero();
    return `<div class="vb-desliza vb-inicio">
      <header class="vb-cab-inicio">
        <div class="vb-cab-marca">${insignia(40)}${TAXICUN.activo ? `<i class="vb-cab-tc-sello" aria-hidden="true">${iconoTaxiCun(18)}</i>` : ''}<div><b>${esc(MARCA.nombre)}</b><span>${esc(lineaMarca())}</span></div></div>
        ${conexionHTML(p.estado.conexion)}
        ${TAXICUN.activo ? `<span class="vb-cab-tc" role="img" aria-label="${esc(TAXICUN.nombre)}" title="${esc(`${TAXICUN.nombre} · ${MARCA.nombre}`)}" data-taxicun>${iconoTaxiCun(34)}</span>` : ''}
      </header>
      <div class="vb-saludo"><span>${esc(N.saludo())},</span><h1 tabindex="-1">${esc(N.primerNombre(yo.nombre) || 'vecino')}</h1></div>

      <section class="vb-pedir" aria-labelledby="vb-pedir-titulo">
        <div class="vb-pedir-cab">
          <span class="vb-pedir-ic">${ic('taxi', 32)}</span>
          <div><h2 id="vb-pedir-titulo">Pedir taxi ahora</h2><p>Llega a tu puerta en minutos</p></div>
        </div>
        <button type="button" class="vb-pedir-dir" data-accion="ir-paso1" data-dir="recogida" aria-label="Cambiar el punto de recogida">
          <span class="vb-pedir-dir-ic">${ic('pin', 22)}</span>
          <span class="vb-pedir-dir-txt"><small>Te recogemos en</small><b data-dir-titulo>${esc(ui.recogida.titulo)}</b><em data-dir-detalle>${esc(ui.recogida.detalle)}</em></span>
          ${ic('editar', 20)}
        </button>
        <div class="vb-pedir-mapa" data-slot-mapa data-accion="ir-paso1">
          <span class="vb-chip-taxis" data-taxis-cerca>${ic('taxi', 18)}<span>Buscando taxis cerca…</span></span>
        </div>
        ${notaSinGps()}
        <button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="ir-paso1">Pedir taxi ${ic('flechaDer')}</button>
      </section>

      ${programados.length ? htmlAvisoProgramado(programados[0]) : ''}

      <h2 class="vb-titulo-seccion">¿Qué necesitas?</h2>
      <div class="vb-mosaicos">
        <button type="button" class="vb-mosaico m-oro" data-accion="programar">
          <span class="vb-mosaico-ic">${ic('calendario', 28)}</span><b>Programar viaje</b><span>Con 24 h de anticipación</span><em class="vb-desc">−10 %</em></button>
        <button type="button" class="vb-mosaico" data-accion="ir" data-pantalla="lugares">
          <span class="vb-mosaico-ic">${ic('marcador', 28)}</span><b>Mis lugares</b><span>Casa, trabajo y más</span></button>
        <button type="button" class="vb-mosaico" data-accion="tab" data-pantalla="tarifas">
          <span class="vb-mosaico-ic">${ic('billete', 28)}</span><b>Tarifas y rutas</b><span>Precios claros</span></button>
        <button type="button" class="vb-mosaico" data-accion="tab" data-pantalla="viajes">
          <span class="vb-mosaico-ic">${ic('historial', 28)}</span><b>Mis viajes</b><span>${historial.length ? `${historial.length} en tu historial` : 'Aún no hay viajes'}</span></button>
        <button type="button" class="vb-mosaico m-tarjeta" data-accion="ir" data-pantalla="fidelidad">
          <span class="vb-mosaico-ic">${ic('tarjeta', 28)}</span><b>Tarjeta de fidelidad</b>${sellosHTML(prog, { mini: true })}
          <span>${prog.siguienteConDescuento ? '¡El próximo va al 50 %!' : `${prog.completados} de ${prog.meta} viajes`}</span></button>
        ${htmlMosaicoCentral()}
      </div>

      <section class="vb-seguridad" aria-labelledby="vb-seg-titulo">
        <h2 id="vb-seg-titulo">${ic('escudo', 26)} Tu seguridad primero</h2>
        <ul>
          <li><span>${ic('carne', 22)}</span><div><b>Conductores verificados</b><small>Ves su carné, el móvil y la placa antes de subir.</small></div></li>
          <li><span>${ic('candado', 22)}</span><div><b>Código de abordaje</b><small>4 dígitos que solo tú y tu conductor conocen.</small></div></li>
          <li><span>${ic('compartir', 22)}</span><div><b>Comparte tu viaje</b><small>Y botón de emergencia durante todo el recorrido.</small></div></li>
        </ul>
      </section>

      <footer class="vb-pie">${insignia(30)}<span>${htmlPie()}</span></footer>
      ${notaPropuesta()}
    </div>`;
  }

  // Pie del inicio: nombre, lema, cifras conocidas y quién hizo la app.
  function htmlPie() {
    const cifras = cifrasMarca().map((c, i) => `${i ? c.antes.toLowerCase() : c.antes}${numeroMiles(c.n)} ${c.texto}`).join(' · ');
    return [`<b>${esc(MARCA.nombre)}</b>${MARCA.lema ? ` · ${esc(MARCA.lema)}` : ''}`, cifras ? esc(cifras) : '', esc(textoDesarrollada())]
      .filter(Boolean).join('<br>');
  }

  // Mosaico de la central: llamar si hay teléfono; WhatsApp si solo hay WhatsApp; si
  // no hay ninguno, lleva a Ayuda con un texto honesto (sin enlaces tel: vacíos).
  function htmlMosaicoCentral() {
    if (MARCA.telefono) {
      return `<a class="vb-mosaico m-verde" href="${esc(telCentral())}">
          <span class="vb-mosaico-ic">${ic('telefono', 28)}</span><b>Llamar a la central</b><span>${esc(sinCorte(MARCA.telefonoVisible))}${MARCA.servicio24h ? '<br>Las 24 horas' : ''}</span></a>`;
    }
    if (MARCA.whatsapp) {
      return `<a class="vb-mosaico m-verde" href="${esc(N.urlSegura(N.enlaceWhatsApp(MARCA.whatsapp, `Hola ${MARCA.nombre}, necesito un taxi.`)))}" target="_blank" rel="noopener">
          <span class="vb-mosaico-ic">${ic('chat', 28)}</span><b>Escribir a la central</b><span>Por WhatsApp${MARCA.servicio24h ? '<br>Las 24 horas' : ''}</span></a>`;
    }
    return `<button type="button" class="vb-mosaico m-verde" data-accion="ir" data-pantalla="ayuda">
          <span class="vb-mosaico-ic">${ic('ayuda', 28)}</span><b>Ayuda</b><span>Teléfono de la central: pronto</span></button>`;
  }

  function htmlAvisoProgramado(v) {
    return `<button type="button" class="vb-programado-aviso" data-accion="ver-programados">
      <span class="vb-programado-ic">${ic('calendario', 26)}</span>
      <span><small>Tienes un viaje programado</small><b>${esc(fechaLarga(v.fecha))}</b><em>${esc(v.destino?.titulo || 'Destino a convenir')}</em></span>${ic('flecha')}
    </button>`;
  }

  function montarInicio() {
    colocarMapa($('[data-slot-mapa]'), 'vista');
    if (ui.recogida.detalle === 'Buscando la dirección…') resolverDireccion('recogida');
  }

  /* ================================================================ */
  /* PEDIDO EN 3 PASOS                                                 */
  /* ================================================================ */
  function htmlPaso(n, titulo, sub = '') {
    const pasos = [1, 2, 3].map((i) => `<li class="${i < n ? 'hecho' : i === n ? 'actual' : ''}"${i === n ? ' aria-current="step"' : ''}><span>${i < n ? ic('check', 18) : i}</span><em>${['Recogida', 'Destino', 'Confirmar'][i - 1]}</em></li>`).join('');
    return `<header class="vb-paso-cab">
        <button type="button" class="vb-btn-icono" data-accion="volver" aria-label="Volver">${ic('atras')}</button>
        <ol class="vb-pasos" aria-label="Paso ${n} de 3">${pasos}</ol>
      </header>
      <div class="vb-paso-titulo"><small>Paso ${n} de 3</small><h1 tabindex="-1">${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
  }

  function svgPinGrande(color, letra) {
    return `<svg viewBox="0 0 48 64" width="48" height="64" aria-hidden="true"><path d="M24 62S44 39 44 22A20 20 0 0 0 4 22c0 17 20 40 20 40z" fill="${color}" stroke="#fff" stroke-width="3"/><circle cx="24" cy="22" r="9" fill="#fff"/><text x="24" y="27" font-family="Nunito, Arial" font-weight="900" font-size="13" fill="${color}" text-anchor="middle">${letra}</text></svg>`;
  }

  function htmlPaso1() {
    return `<div class="vb-paso vb-paso1">
      ${htmlPaso(1, '¿Dónde te recogemos?')}
      <div class="vb-mapa-grande" data-slot-mapa>
        <div class="vb-pin-fijo" aria-hidden="true"><span class="vb-pin-globo">Te recogemos aquí</span>${svgPinGrande(PALETA.verde, 'A')}<i class="vb-pin-sombra"></i></div>
        <button type="button" class="vb-btn-flotante" data-accion="mi-ubicacion">${ic('miUbicacion', 22)} Usar mi ubicación</button>
      </div>
      <div class="vb-panel-paso">
        ${notaSinGps() || '<p class="vb-ayuda-mapa">Mueve el mapa para dejar el pin en tu puerta.</p>'}
        <div class="vb-direccion" data-dir="recogida"><span class="vb-direccion-ic">${ic('pin', 24)}</span><div><b data-dir-titulo>${esc(ui.recogida.titulo)}</b><span data-dir-detalle>${esc(ui.recogida.detalle)}</span></div></div>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="confirmar-recogida">${ic('check')} Sí, es aquí</button>
      </div>
    </div>`;
  }

  function montarPaso1() {
    colocarMapa($('[data-slot-mapa]'), 'recogida');
  }

  async function usarMiUbicacion(boton) {
    boton.disabled = true;
    boton.classList.add('cargando');
    const pos = await p.actualizarMiPosicion();
    boton.disabled = false;
    boton.classList.remove('cargando');
    if (!pos.real) {
      avisos.mostrar({ titulo: 'No pudimos leer tu GPS', cuerpo: 'Revisa que la ubicación esté activada y con permiso. Mientras tanto, mueve el mapa.', tipo: 'error' });
      return;
    }
    m?.ponerYo(pos);
    m?.centrar(pos, 17);
  }

  function itemLugar(lugar, lista, i, icono) {
    return `<li><button type="button" class="vb-lugar" data-accion="elegir-lugar" data-ref="${lista}:${i}">
      <span class="vb-lugar-ic">${ic(icono || 'pin', 22)}</span>
      <span class="vb-lugar-txt"><b>${esc(lugar.titulo)}</b>${lugar.detalle ? `<small>${esc(lugar.detalle)}</small>` : ''}</span>${ic('flecha', 20)}
    </button></li>`;
  }

  function lugaresDeCategoria(cat) {
    return N.LUGARES.filter((l) => l.cat === cat).map((l) => ({ titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng, cat: l.cat }));
  }

  function htmlListaCategoria() {
    ui.listas.cat = lugaresDeCategoria(ui.categoria);
    return ui.listas.cat.map((l, i) => itemLugar(l, 'cat', i, l.cat)).join('');
  }

  function htmlPaso2() {
    const guardados = N.perfil.lugaresGuardados();
    ui.listas.rec = N.perfil.recientes().slice(0, 4);
    ui.listas.fav = guardados.otros || [];
    const atajo = (tipo, icono, titulo) => {
      const l = guardados[tipo];
      return `<button type="button" class="vb-atajo" data-accion="destino-guardado" data-tipo="${tipo}">
        <span class="vb-atajo-ic">${ic(icono, 24)}</span><span><b>${titulo}</b><small>${l ? esc(l.titulo) : 'Guárdala en Mis lugares'}</small></span></button>`;
    };
    return `<div class="vb-paso vb-paso2">
      ${htmlPaso(2, '¿A dónde vas?')}
      <div class="vb-desliza">
        <div class="vb-desde">${ic('pin', 18)}<span>Desde <b>${esc(ui.recogida.titulo)}</b></span></div>
        <div class="vb-buscador">${ic('buscar', 24)}
          <input type="search" data-campo="busqueda" placeholder="Buscar lugar o dirección" aria-label="Buscar destino" autocomplete="off" enterkeyhint="search">
          <button type="button" class="vb-buscador-x" data-accion="limpiar-busqueda" aria-label="Borrar búsqueda" hidden>${ic('cerrar', 20)}</button>
        </div>
        <div class="vb-resultados" data-resultados aria-live="polite"></div>
        <div class="vb-atajos">
          ${atajo('casa', 'casa', 'Casa')}
          ${atajo('trabajo', 'trabajo', 'Trabajo')}
          <button type="button" class="vb-atajo" data-accion="destino-en-mapa"><span class="vb-atajo-ic">${ic('mapa', 24)}</span><span><b>Elegir en el mapa</b><small>Mueve el pin</small></span></button>
          <button type="button" class="vb-atajo" data-accion="destino-conductor"><span class="vb-atajo-ic">${ic('chat', 24)}</span><span><b>Se lo digo al conductor</b><small>Sin destino fijo</small></span></button>
        </div>
        ${ui.listas.rec.length ? `<h2 class="vb-titulo-seccion">Recientes</h2><ul class="vb-lista">${ui.listas.rec.map((l, i) => itemLugar(l, 'rec', i, 'historial')).join('')}</ul>` : ''}
        ${ui.listas.fav.length ? `<h2 class="vb-titulo-seccion">Favoritos</h2><ul class="vb-lista">${ui.listas.fav.map((l, i) => itemLugar(l, 'fav', i, 'marcador')).join('')}</ul>` : ''}
        <h2 class="vb-titulo-seccion">Lugares frecuentes</h2>
        <div class="vb-categorias" role="tablist" aria-label="Categorías de lugares">
          ${Object.entries(N.CATEGORIAS).map(([id, c]) => `<button type="button" role="tab" aria-selected="${id === ui.categoria}" data-accion="categoria" data-cat="${id}">${ic(id, 20)}<span>${esc(c.nombre)}</span></button>`).join('')}
        </div>
        <ul class="vb-lista" data-lista-categoria role="tabpanel">${htmlListaCategoria()}</ul>
      </div>
    </div>`;
  }

  const buscarConPausa = N.antirrebote(async (texto) => {
    const seq = ++ui.busSeq;
    const caja = $('[data-resultados]');
    if (!caja) return;
    if (!texto.trim()) {
      caja.innerHTML = '';
      return;
    }
    const locales = N.buscarLocal(texto, 6);
    pintarResultados(locales, texto, true);
    const todos = await N.buscarDirecciones(texto, { cerca: ui.recogida });
    if (seq !== ui.busSeq) return;
    pintarResultados(todos, texto, false);
  }, 350);

  function iconoDeResultado(r) {
    if (r.fuente !== 'frecuente') return 'pin';
    const l = N.LUGARES.find((x) => x.nombre === r.titulo);
    return l?.cat || 'pin';
  }

  function pintarResultados(lista, texto, cargando) {
    const caja = $('[data-resultados]');
    if (!caja) return;
    ui.listas.bus = lista;
    if (!lista.length && !cargando) {
      caja.innerHTML = `<p class="vb-vacio-chico">No encontramos «${esc(texto)}». Prueba con otro nombre o elige en el mapa.</p>`;
      return;
    }
    caja.innerHTML = `<h2 class="vb-titulo-seccion">Resultados${cargando ? ' <span class="vb-cargando-txt">buscando…</span>' : ''}</h2>
      <ul class="vb-lista">${lista.map((r, i) => itemLugar(r, 'bus', i, iconoDeResultado(r))).join('')}</ul>`;
  }

  function elegirDestino(lugar) {
    // idTarifa: destino de la tabla oficial (p. ej. Decreto 05 de 2026 de El Rosal); sin él, el
    // precio saldría por el nombre, y el Monasterio Trapense está en dos zonas con dos precios.
    ui.destino = lugar ? { lat: lugar.lat, lng: lugar.lng, titulo: lugar.titulo, detalle: lugar.detalle || '', ...(lugar.idTarifa ? { idTarifa: lugar.idTarifa } : {}) } : null;
    irA('paso3');
  }

  function htmlPaso2Mapa() {
    const d = ui.destinoMapa || { titulo: 'Mueve el mapa', detalle: '' };
    return `<div class="vb-paso vb-paso1 destino">
      ${htmlPaso(2, '¿A dónde vas?', 'Mueve el mapa hasta tu destino.')}
      <div class="vb-mapa-grande" data-slot-mapa>
        <div class="vb-pin-fijo rojo" aria-hidden="true"><span class="vb-pin-globo">Voy para acá</span>${svgPinGrande(PALETA.rojo, 'B')}<i class="vb-pin-sombra"></i></div>
      </div>
      <div class="vb-panel-paso">
        <div class="vb-direccion destino" data-dir="destinoMapa"><span class="vb-direccion-ic">${ic('bandera', 24)}</span><div><b data-dir-titulo>${esc(d.titulo)}</b><span data-dir-detalle>${esc(d.detalle)}</span></div></div>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="confirmar-destino-mapa">${ic('check')} Este es mi destino</button>
      </div>
    </div>`;
  }

  function montarPaso2Mapa() {
    if (!ui.destinoMapa) {
      const c = N.desplazar(ui.recogida, 0.5, 70);
      ui.destinoMapa = { lat: c.lat, lng: c.lng, titulo: 'Buscando la dirección…', detalle: '' };
      resolverDireccion('destinoMapa');
    }
    colocarMapa($('[data-slot-mapa]'), 'destino-mapa');
  }

  /* ---------------- paso 3 ---------------- */
  function fechaInput(d) {
    const dd = new Date(d);
    const dos = (n) => String(n).padStart(2, '0');
    return `${dd.getFullYear()}-${dos(dd.getMonth() + 1)}-${dos(dd.getDate())}T${dos(dd.getHours())}:${dos(dd.getMinutes())}`;
  }

  function fechaSugerida() {
    const d = new Date(Date.now() + 24 * 3600 * 1000 + 15 * 60 * 1000);
    d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
    return fechaInput(d);
  }

  function mayuscula(t) {
    const x = String(t || '');
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  function fechaLarga(t) {
    // Hora local del celular: es la misma con la que se eligió en el campo de fecha y hora.
    // Solo la hora va sin cortes («9:30 a. m.»), para que la fecha sí pueda pasar de renglón.
    const d = new Date(t);
    const dia = mayuscula(d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }));
    const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    return `${dia}, ${sinCorte(hora)}`;
  }

  function programadoPara() {
    return ui.programar && ui.fecha ? new Date(ui.fecha).getTime() : null;
  }

  function htmlCuando() {
    const conDescuento = ui.programar && ui.fecha && N.aplicaDescuentoProgramado(new Date(ui.fecha));
    return `<div class="vb-segmentos" role="radiogroup" aria-label="¿Cuándo?">
        <button type="button" role="radio" aria-checked="${!ui.programar}" data-accion="cuando" data-v="ahora">${ic('taxi', 20)} Ahora</button>
        <button type="button" role="radio" aria-checked="${ui.programar}" data-accion="cuando" data-v="programar">${ic('calendario', 20)} Programar</button>
      </div>
      ${ui.programar ? `<label class="vb-campo vb-campo-fecha"><span>Fecha y hora de recogida</span>
          <input type="datetime-local" data-campo="fecha" value="${ui.fecha}" min="${fechaInput(Date.now() + 31 * 60 * 1000)}"></label>
        ${conDescuento
          ? `<p class="vb-desc-ok">${ic('regalo', 22)}<span><b>¡Ahorras 10 %!</b> Programaste con 24 h o más de anticipación.</span></p>`
          : `<p class="vb-desc-pista">${ic('info', 20)}<span>Programa con <b>24 h de anticipación</b> y te descontamos el 10 %.</span></p>`}` : ''}`;
  }

  function htmlPaso3() {
    const o = ui.recogida;
    const d = ui.destino;
    const prog = N.progresoFidelidad(p.viajesCompletados());
    const guardados = N.perfil.lugaresGuardados();
    return `<div class="vb-paso vb-paso3">
      ${htmlPaso(3, 'Confirma tu taxi')}
      <div class="vb-desliza">
        <div class="vb-mapa-medio" data-slot-mapa></div>
        <section class="vb-tarjeta vb-resumen-ruta" aria-label="Recorrido">
          <div class="vb-punto-ruta"><i class="a">A</i><div><small>Recogida</small><b>${esc(o.titulo)}</b><span>${esc(o.detalle || '')}</span></div><button type="button" class="vb-btn-mini" data-accion="volver-a" data-pantalla="paso1">Cambiar</button></div>
          <div class="vb-punto-ruta"><i class="b">B</i><div><small>Destino</small><b>${d ? esc(d.titulo) : 'Se lo dices al conductor'}</b><span>${d ? esc(d.detalle || '') : 'El valor final depende del recorrido'}</span></div><button type="button" class="vb-btn-mini" data-accion="volver-a" data-pantalla="paso2">Cambiar</button></div>
          <div class="vb-ruta-datos" data-ruta-datos ${d ? '' : 'hidden'}><span>${ic('ruta', 20)} <b data-ruta-km>…</b></span><span>${ic('reloj', 20)} <b data-ruta-min>…</b></span></div>
        </section>

        <section class="vb-tarjeta vb-tarifa" aria-labelledby="vb-tarifa-t">
          <div class="vb-tarifa-cab"><h2 id="vb-tarifa-t">${N.TARIFAS.ejemplo ? 'Tarifa estimada' : 'Valor del viaje'}</h2><span class="vb-chip-ejemplo" data-chip-tarifa ${N.TARIFAS.ejemplo ? '' : 'hidden'}>${N.TARIFAS.ejemplo ? 'Tarifa de ejemplo' : ''}</span></div>
          <div class="vb-tarifa-total" data-tarifa-total><span class="vb-esqueleto"></span></div>
          <details class="vb-detalle"><summary>Ver cómo se calcula</summary><ul data-tarifa-detalle></ul></details>
          <p class="vb-letra-chica" data-tarifa-nota>${N.TARIFAS.ejemplo ? `Valores de ejemplo mientras la ${MARCA.tipo} publica sus tarifas oficiales.` : ''}</p>
        </section>

        <section class="vb-bloque" aria-labelledby="vb-pago-t">
          <h2 class="vb-titulo-seccion" id="vb-pago-t">¿Cómo vas a pagar?</h2>
          <div class="vb-opciones-pago" role="radiogroup" aria-labelledby="vb-pago-t">
            <button type="button" role="radio" aria-checked="${ui.metodoPago === 'qr'}" data-accion="pago" data-metodo="qr"><span class="vb-op-ic">${ic('qr', 28)}</span><b>Código QR</b><small>Nequi, Bre-B, DaviPlata… <em>(prueba)</em></small></button>
            <button type="button" role="radio" aria-checked="${ui.metodoPago === 'efectivo'}" data-accion="pago" data-metodo="efectivo"><span class="vb-op-ic">${ic('billete', 28)}</span><b>Efectivo</b><small>Le pagas al conductor</small></button>
          </div>
        </section>

        <section class="vb-bloque" aria-labelledby="vb-cuando-t">
          <h2 class="vb-titulo-seccion" id="vb-cuando-t">¿Cuándo?</h2>
          <div data-cuando>${htmlCuando()}</div>
        </section>

        <section class="vb-bloque">
          <label class="vb-campo"><span class="vb-titulo-seccion">Nota para el conductor <em>(opcional)</em></span>
            <textarea data-campo="nota" rows="2" maxlength="140" placeholder="Ej.: Estoy en la portería del conjunto">${esc(ui.nota)}</textarea></label>
          <div class="vb-chips">${NOTAS_RAPIDAS.map((t) => `<button type="button" class="vb-chip" data-accion="nota-rapida" data-t="${esc(t)}">${ic('mas', 16)} ${esc(t)}</button>`).join('')}</div>
        </section>

        <section class="vb-fidelidad-mini">
          ${sellosHTML(prog, { mini: true })}
          <p>${prog.siguienteConDescuento ? '<b>¡Este viaje va con 50 % de descuento!</b>' : `Llevas <b>${prog.completados} de ${prog.meta}</b> viajes. Te faltan ${prog.faltan} para un viaje al 50 %.`}</p>
        </section>

        ${d ? `<div class="vb-guardar-como"><span class="vb-guardar-como-t">${ic('marcador', 18)} Guardar este destino como</span>
          <button type="button" class="vb-chip" data-accion="guardar-destino" data-tipo="casa">${ic('casa', 16)} Casa${guardados.casa?.titulo === d.titulo ? ' ✓' : ''}</button>
          <button type="button" class="vb-chip" data-accion="guardar-destino" data-tipo="trabajo">${ic('trabajo', 16)} Trabajo${guardados.trabajo?.titulo === d.titulo ? ' ✓' : ''}</button>
          <button type="button" class="vb-chip" data-accion="guardar-destino" data-tipo="otro">${ic('marcador', 16)} Favorito</button></div>` : ''}
      </div>
      <footer class="vb-barra-accion">
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="pedir-taxi" data-boton-pedir>${ic('taxi')} <span>Pedir taxi</span></button>
      </footer>
    </div>`;
  }

  function montarPaso3() {
    colocarMapa($('[data-slot-mapa]'), 'ruta');
    cotizarAhora();
  }

  async function cotizarAhora() {
    const seq = ++ui.cotSeq;
    ui.cot = null;
    pintarCotizacion();
    try {
      const c = await p.cotizar({ origen: ui.recogida, destino: ui.destino, programadoPara: programadoPara() });
      if (seq !== ui.cotSeq) return;
      ui.cot = c;
    } catch (e) {
      if (seq !== ui.cotSeq) return;
      ui.cot = { ruta: null, tarifa: N.calcularTarifa({ origen: ui.recogida, destino: ui.destino }) };
    }
    pintarCotizacion();
    dibujarRutaCotizada();
  }

  function pintarCotizacion() {
    const total = $('[data-tarifa-total]');
    if (!total) return;
    const boton = $('[data-boton-pedir] span');
    const c = ui.cot;
    if (!c) {
      total.innerHTML = '<span class="vb-esqueleto"></span>';
      if (boton) boton.textContent = 'Calculando…';
      return;
    }
    const t = c.tarifa;
    // Con tarifas oficiales (Cootransrural): el chip dice si es oficial, estimada o de referencia.
    if (!N.TARIFAS.ejemplo) {
      const chip = $('[data-chip-tarifa]');
      if (chip) {
        chip.textContent = t.etiqueta || N.etiquetaTarifa(t);
        chip.dataset.tipo = t.tipo || '';
        chip.hidden = false;
      }
      const nota = $('[data-tarifa-nota]');
      if (nota) nota.textContent = (t.notas || []).join(' ');
    }
    total.innerHTML = `${ui.destino ? '' : '<small>Desde</small> '}${N.pesos(t.total)}${t.descuento ? ` <s>${N.pesos(t.total + t.descuento)}</s>` : ''}`;
    $('[data-tarifa-detalle]').innerHTML = t.detalle.map((x) => `<li><span>${esc(x.concepto)}</span><b class="${x.valor < 0 ? 'menos' : ''}">${x.valor < 0 ? '−' : ''}${N.pesos(Math.abs(x.valor))}</b></li>`).join('')
      + `<li class="total"><span>Total estimado</span><b>${N.pesos(t.total)}</b></li>`;
    if (c.ruta) {
      $('[data-ruta-km]').textContent = N.kmTexto(c.ruta.km);
      $('[data-ruta-min]').textContent = `${N.minutosTexto(c.ruta.min)}${c.ruta.aproximada ? ' (aprox.)' : ''}`;
    }
    if (boton) boton.textContent = `${ui.programar ? 'Programar viaje' : 'Pedir taxi'} · ${N.pesos(t.total)}`;
  }

  async function pedirTaxi(boton) {
    if (!ui.permisoPedido) {
      ui.permisoPedido = true;
      N.pedirPermisoNotificaciones().catch(() => {});
    }
    const prog = programadoPara();
    if (ui.programar) {
      if (!prog || Number.isNaN(prog)) return avisos.mostrar({ titulo: 'Elige la fecha y la hora', cuerpo: 'Dinos cuándo te recogemos.', tipo: 'error' });
      if (prog - Date.now() < 30 * 60 * 1000) return avisos.mostrar({ titulo: 'Elige una hora más adelante', cuerpo: 'Para programar, el viaje debe ser al menos 30 minutos después de ahora.', tipo: 'error' });
    }
    boton.disabled = true;
    boton.classList.add('cargando');
    boton.querySelector('span').textContent = ui.programar ? 'Programando…' : 'Pidiendo tu taxi…';
    try {
      const r = await p.solicitar({ origen: { ...ui.recogida }, destino: ui.destino ? { ...ui.destino } : null, metodoPago: ui.metodoPago, programadoPara: prog, nota: ui.nota.trim() });
      if (r?.programado) {
        ui.programar = false;
        ui.destino = undefined;
        ui.pestanaViajes = 'programados';
        irA('viajes', { reemplazar: true });
      }
    } catch (e) {
      avisos.mostrar({ titulo: 'No pudimos pedir el taxi', cuerpo: e.message || 'Intenta de nuevo.', tipo: 'error' });
      if (boton.isConnected) {
        boton.disabled = false;
        boton.classList.remove('cargando');
        pintarCotizacion();
      }
    }
  }

  /* ================================================================ */
  /* SEGUIMIENTO (buscando → asignado → en la puerta → en viaje)       */
  /* ================================================================ */
  function hora(t) {
    return t ? sinCorte(N.horaTexto(t)) : '';
  }

  function htmlLinea(f) {
    const e = p.estado;
    const t = ui.tiempos;
    const actual = { buscando: 1, asignado: 2, llego: 3, en_viaje: 4, pagar: 5, calificar: 6 }[f] ?? 0;
    const pasos = [
      ['Solicitado', hora(t.buscando) || 'Recibimos tu pedido'],
      [actual <= 1 ? 'Buscando conductor…' : 'Conductor asignado', actual <= 1 ? 'Avisando a los móviles cercanos' : `Móvil ${esc(e.conductor?.movil || '')} · ${hora(t.asignado)}`],
      ['En camino', actual === 2 ? 'Llega en <b data-eta-linea>…</b>' : actual > 2 ? 'Llegó a recogerte' : 'Hacia tu punto de recogida'],
      ['En la puerta', actual === 3 ? 'Sal y busca el móvil' : hora(t.llego)],
      ['En viaje', actual === 4 ? 'Disfruta el recorrido' : hora(t.en_viaje)],
      ['Llegada', e.viaje?.destino ? esc(e.viaje.destino.titulo || '') : 'Destino a convenir'],
    ];
    return `<ol class="vb-linea">${pasos.map(([titulo, detalle], i) => {
      const clase = i < actual ? 'hecho' : i === actual ? 'actual' : '';
      return `<li class="${clase}"${i === actual ? ' aria-current="step"' : ''}><span class="vb-linea-punto">${i < actual ? ic('check', 16) : ''}</span><div><b>${titulo}</b>${detalle ? `<small>${detalle}</small>` : ''}</div></li>`;
    }).join('')}</ol>`;
  }

  function htmlCodigo(codigo) {
    const digitos = String(codigo || '').split('');
    return `<section class="vb-codigo-abordaje" aria-label="Tu código de abordaje es ${digitos.join(' ')}">
      <div class="vb-codigo-txt">${ic('candado', 20)}<b>Tu código para abordar</b></div>
      <div class="vb-codigo-digitos" aria-hidden="true">${digitos.map((d) => `<span>${esc(d)}</span>`).join('')}</div>
      <span class="vb-codigo-pie">Díselo al conductor al subir. Si no te lo pide, no es tu taxi.</span>
    </section>`;
  }

  function htmlCarne(c) {
    return `<article class="vb-carne" aria-label="Carné del conductor">
      <header class="vb-carne-cab">${insignia(30)}<div><b>${esc(MARCA.nombre)}</b><small>Carné del conductor</small></div>
        <span class="vb-carne-movil">Móvil<b>${esc(c.movil)}</b></span></header>
      <div class="vb-carne-cuerpo">
        ${avatarHTML(c.nombre, 'grande')}
        <div class="vb-carne-datos">
          <h2>${esc(c.nombre)}</h2>
          <p class="vb-carne-cal">${ic('estrella', 18)} <b>${decimal(c.calificacion)}</b> · ${numeroMiles(c.viajes)} viajes</p>
          ${c.desde ? `<p class="vb-carne-desde">En la ${MARCA.tipo} desde ${esc(c.desde)}</p>` : ''}
        </div>
        ${selloVerificado()}
        <span class="vb-verificado">${ic('check', 16)} Verificado por ${esc(MARCA.nombre)}</span>
      </div>
      <footer class="vb-carne-pie">${placaHTML(c.placa)}<span>${esc(c.vehiculo || N.EMPRESA.vehiculo || 'Kia Picanto')} · ${esc(c.color || N.EMPRESA.colorTaxi || 'Amarillo')}</span></footer>
    </article>`;
  }

  function htmlAcciones(c) {
    const tel = String(c?.tel || '').replace(/\D/g, '');
    if (N.esTelDemo(tel)) {
      return `<div class="vb-acciones">
      <button type="button" class="vb-accion" data-accion="llamada-demo">${ic('telefono')}<span>Llamar</span></button>
      <button type="button" class="vb-accion" data-accion="llamada-demo">${ic('chat')}<span>WhatsApp</span></button>
      <button type="button" class="vb-accion" data-accion="compartir">${ic('compartir')}<span>Compartir</span></button>
      <button type="button" class="vb-accion sos" data-accion="sos">${ic('sos')}<span>SOS</span></button></div>`;
    }
    // Enlaces armados con el celular que manda el servidor: solo dígitos (S30).
    const llamar = tel && N.enlaceTel(`+57${tel}`)
      ? `<a class="vb-accion" href="${esc(N.enlaceTel(`+57${tel}`))}">${ic('telefono')}<span>Llamar</span></a>`
      : `<button type="button" class="vb-accion" disabled>${ic('telefono')}<span>Llamar</span></button>`;
    const wa = tel
      ? `<a class="vb-accion" href="${esc(N.urlSegura(N.enlaceWhatsApp(tel, `Hola, soy tu pasajero de ${MARCA.nombre}.`)))}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>`
      : `<button type="button" class="vb-accion" disabled>${ic('chat')}<span>WhatsApp</span></button>`;
    return `<div class="vb-acciones">${llamar}${wa}
      <button type="button" class="vb-accion" data-accion="compartir">${ic('compartir')}<span>Compartir</span></button>
      <button type="button" class="vb-accion sos" data-accion="sos">${ic('sos')}<span>SOS</span></button></div>`;
  }

  function htmlEstadoPrincipal(f) {
    const e = p.estado;
    const c = e.conductor;
    const v = e.viaje;
    if (f === 'buscando') {
      return `<div class="vb-estado-buscando">
        <div class="vb-buscando-anim" aria-hidden="true"><span class="vb-buscando-taxi">${ic('taxi', 34)}</span><i></i><i></i><i></i></div>
        <div><h1 tabindex="-1">Buscando tu taxi</h1><p data-mensaje-busqueda>${MENSAJES_BUSQUEDA[0]}</p></div>
      </div>
      <button type="button" class="vb-btn vb-btn-borde vb-cancelar-busqueda" data-accion="cancelar">${ic('cerrar', 20)} Cancelar solicitud</button>`;
    }
    if (f === 'asignado') {
      return `<div class="vb-estado-eta">
        <div><small>Tu taxi llega en</small><h1 tabindex="-1"><span data-eta>${e.etaMin != null ? N.minutosTexto(e.etaMin) : '…'}</span></h1>
        <p>Móvil <b>${esc(c?.movil)}</b> · ${esc(nombreCorto(c?.nombre || ''))} va en camino</p></div>
        ${placaHTML(c?.placa)}
      </div>`;
    }
    if (f === 'llego') {
      return `<div class="vb-alerta-puerta">
        <span class="vb-puerta-ic">${ic('puerta', 34)}</span>
        <div><h1 tabindex="-1">¡Tu taxi está en la puerta!</h1><p>Busca el <b>${esc(sinCorte(`móvil ${c?.movil || ''}`))}</b>, placa <b>${esc(sinCorte(c?.placa || ''))}</b>.</p></div>
      </div>`;
    }
    return `<div class="vb-estado-viaje">
      <small>Rumbo a</small><h1 tabindex="-1">${esc(v?.destino?.titulo || 'tu destino')}</h1>
      <div class="vb-progreso" aria-hidden="true"><i data-progreso></i><span class="vb-progreso-taxi" data-progreso-taxi>${ic('taxi', 22)}</span></div>
      <p><b data-eta>${e.etaMin != null ? N.minutosTexto(e.etaMin) : '…'}</b> para llegar · llegada aprox. <b data-hora-llegada>…</b></p>
    </div>`;
  }

  function htmlSeguimiento() {
    const e = p.estado;
    const f = e.fase;
    const v = e.viaje;
    const c = e.conductor;
    return `<div class="vb-seg fase-${f}">
      <div class="vb-seg-mapa" data-slot-mapa>
        <header class="vb-seg-cab">
          <span class="vb-seg-marca">${insignia(28)}<b>Tu viaje</b></span>
          <span class="vb-seg-cab-der">${v?.simulado ? chipPrueba() : demoPara()}${conexionHTML(e.conexion)}</span>
        </header>
        ${f === 'buscando' ? `<div class="vb-radar" aria-hidden="true"><i></i><i></i><i></i></div>` : ''}
        <button type="button" class="vb-sos-flotante" data-accion="sos" aria-label="Emergencia: SOS">SOS</button>
      </div>
      <section class="vb-seg-panel">
        <span class="vb-asa" aria-hidden="true"></span>
        ${htmlEstadoPrincipal(f)}
        ${(f === 'asignado' || f === 'llego') && v?.codigo ? htmlCodigo(v.codigo) : ''}
        ${c ? htmlCarne(c) : ''}
        ${c ? htmlAcciones(c) : ''}
        <section class="vb-tarjeta vb-seg-linea" aria-labelledby="vb-linea-t"><h2 id="vb-linea-t">Estado de tu viaje</h2>${htmlLinea(f)}</section>
        ${v ? htmlResumenMini(v) : ''}
        ${['asignado', 'llego'].includes(f) ? `<button type="button" class="vb-btn vb-btn-texto vb-btn-bloque vb-cancelar" data-accion="cancelar">${ic('cerrar', 20)} Cancelar servicio</button>` : ''}
      </section>
    </div>`;
  }

  function htmlResumenMini(v) {
    return `<section class="vb-tarjeta vb-resumen-mini" aria-label="Resumen del viaje">
      <div class="vb-punto-ruta chico"><i class="a">A</i><div><b>${esc(v.origen?.titulo || 'Punto de recogida')}</b></div></div>
      <div class="vb-punto-ruta chico"><i class="b">B</i><div><b>${esc(v.destino?.titulo || 'Se lo dices al conductor')}</b></div></div>
      <div class="vb-resumen-pie"><span>${ic(v.metodoPago === 'qr' ? 'qr' : 'billete', 20)} ${v.metodoPago === 'qr' ? 'Pago con QR (prueba)' : 'Pago en efectivo'}</span><b>${N.pesos(v.tarifa?.total)}</b></div>
      ${v.nota ? `<p class="vb-nota-viaje">${ic('mensaje', 18)} «${esc(v.nota)}»</p>` : ''}
    </section>`;
  }

  function montarSeguimiento() {
    colocarMapa($('[data-slot-mapa]'), 'seguimiento');
    if (p.estado.fase === 'buscando') {
      let i = 0;
      ui.relojes.push(setInterval(() => {
        const el = $('[data-mensaje-busqueda]');
        if (!el) return;
        i = (i + 1) % MENSAJES_BUSQUEDA.length;
        el.classList.remove('entra');
        void el.offsetWidth;
        el.textContent = MENSAJES_BUSQUEDA[i];
        el.classList.add('entra');
      }, 2600));
    }
  }

  function actualizarSeguimiento() {
    const e = p.estado;
    const f = e.fase;
    if (e.etaMin != null) {
      const texto = e.etaMin < 0.6 && f === 'asignado' ? 'menos de 1 min' : N.minutosTexto(e.etaMin);
      for (const el of $$('[data-eta], [data-eta-linea]')) if (el.textContent !== texto) el.textContent = texto;
    }
    if (f === 'en_viaje') {
      const total = e.viaje?.ruta?.min;
      const frac = total && e.etaMin != null ? Math.min(1, Math.max(0, 1 - e.etaMin / total)) : 0;
      const barra = $('[data-progreso]');
      if (barra) barra.style.width = `${Math.round(frac * 100)}%`;
      const taxi = $('[data-progreso-taxi]');
      if (taxi) taxi.style.left = `${Math.round(frac * 100)}%`;
      const llegada = $('[data-hora-llegada]');
      if (llegada && e.etaMin != null) llegada.textContent = sinCorte(N.horaTexto(Date.now() + e.etaMin * 60000));
    }
    if (m && modoMapa === 'seguimiento' && f !== 'buscando' && mapaEl.isConnected) {
      ponerTaxiAsignado();
      // Reencuadra si el taxi se sale de la vista (sin pelear con quien mueve el mapa).
      if (e.posConductor && Date.now() - ui.arrastre > 10000) {
        const dentro = m.mapa.getBounds().pad(-0.12).contains([e.posConductor.lat, e.posConductor.lng]);
        if (!dentro) encuadrarSeguimiento();
      }
    }
  }

  function abrirCancelar() {
    const motivos = N.MOTIVOS_CANCELACION.pasajero;
    hoja.abrir({
      titulo: '¿Por qué cancelas?',
      html: `<div class="vb-motivos" role="radiogroup" aria-label="Motivo">
          ${motivos.map((x, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-accion="motivo" data-m="${esc(x)}">${esc(x)}</button>`).join('')}
        </div>
        <button type="button" class="vb-btn vb-btn-rojo vb-btn-xl" data-accion="confirmar-cancelar">Sí, cancelar</button>
        <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-cerrar-hoja>Seguir con mi taxi</button>`,
    });
  }

  function abrirSOS() {
    const e = p.estado;
    const c = e.conductor;
    const yo = p.perfil || {};
    const contacto = yo.contactoEmergencia;
    const texto = p.textoCompartir() || `Estoy pidiendo un taxi de ${MARCA.nombre} en ${ui.recogida.titulo}.`;
    hoja.abrir({
      titulo: 'Emergencia',
      clase: 'vb-hoja-sos',
      html: `<p class="vb-sub">Si estás en peligro, llama ya. Tu ubicación y los datos del taxi van en el mensaje.</p>
        <a class="vb-btn vb-btn-rojo vb-btn-xl" href="tel:123">${ic('telefono')} Llamar al 123 (Policía)</a>
        ${contacto?.celular
          ? `<a class="vb-btn vb-btn-oro vb-btn-xl" href="${esc(N.urlSegura(N.enlaceWhatsApp(contacto.celular, `🚨 Necesito ayuda.\n${texto}`)))}" target="_blank" rel="noopener">${ic('chat')} Avisar a ${esc(contacto.nombre || 'mi contacto')}</a>`
          : `<p class="vb-nota-gps">${ic('info', 20)}<span>Agrega un contacto de emergencia en tu Perfil para avisarle con un toque.</span></p>`}
        ${MARCA.telefono ? `<a class="vb-btn vb-btn-borde vb-btn-xl" href="${esc(telCentral())}">${ic('telefono')} Llamar a la central</a>` : ''}
        <button type="button" class="vb-btn vb-btn-suave vb-btn-xl" data-accion="compartir">${ic('compartir')} Compartir mi viaje</button>
        ${c ? `<p class="vb-letra-chica">Tu taxi: móvil ${esc(c.movil)} · placa ${esc(c.placa)} · ${esc(c.nombre)}</p>` : ''}`,
    });
  }

  async function compartir() {
    const texto = p.textoCompartir() || `Voy a pedir un taxi de ${MARCA.nombre} en ${ui.recogida.titulo}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Mi viaje en ${MARCA.nombre}`, text: texto });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    window.open(N.enlaceWhatsApp('', texto), '_blank', 'noopener');
  }

  /* ================================================================ */
  /* PAGO                                                              */
  /* ================================================================ */
  function billeteraElegida() {
    return N.BILLETERAS.find((b) => b.id === ui.billetera) || N.BILLETERAS[0];
  }

  function htmlPagar() {
    const e = p.estado;
    const v = e.viaje || {};
    const c = e.conductor || {};
    const valor = e.cobro?.valor || v.tarifa?.total || 0;
    const url = p.urlCobroActual();
    let qr = '';
    try {
      qr = url ? N.tarjetaBreB({ url, valor, movil: c.movil, compacta: true }) : '';
    } catch {
      qr = '';
    }
    const km = e.kmFinal || v.ruta?.km;
    return `<div class="vb-desliza vb-pagar">
      <header class="vb-pagar-cab">
        <span class="vb-check-grande">${ic('bandera', 30)}</span>
        <div><h1 tabindex="-1">¡Llegaste a tu destino!</h1><p>${esc(v.destino?.titulo || 'Fin del recorrido')}</p></div>
      </header>
      <section class="vb-recibo" aria-label="Valor del viaje">
        <div class="vb-recibo-cab"><span>Total a pagar</span><span class="vb-recibo-etiquetas">${chipPrueba()}</span></div>
        <div class="vb-recibo-total">${N.pesos(valor)}</div>
        <div class="vb-recibo-fila"><span>${esc(sinCorte(`Móvil ${c.movil || ''}`))} · ${esc(sinCorte(c.placa || ''))}</span><b>${esc(c.nombre || '')}</b></div>
        <details class="vb-detalle"><summary>Ver detalle</summary><ul>
          ${km ? `<li><span>Recorrido</span><b>${N.kmTexto(km)}</b></li>` : ''}
          ${(v.tarifa?.detalle || []).map((x) => `<li><span>${esc(x.concepto)}</span><b>${x.valor < 0 ? '−' : ''}${N.pesos(Math.abs(x.valor))}</b></li>`).join('')}
        </ul></details>
      </section>

      <section class="vb-pago-qr" aria-labelledby="vb-qr-t">
        <h2 id="vb-qr-t" class="vb-titulo-seccion">${ic('qr', 24)} Paga con código QR</h2>
        <div class="vb-billeteras" role="radiogroup" aria-label="Banco o billetera">
          ${N.BILLETERAS.map((b) => `<button type="button" role="radio" aria-checked="${b.id === ui.billetera}" data-accion="billetera" data-id="${esc(b.id)}" style="--marca:${esc(b.color)}"><i aria-hidden="true"></i>${esc(b.nombre)}</button>`).join('')}
        </div>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="escanear">${ic('camara')} Escanear QR del conductor</button>
        <button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="simular-pago">${ic('qr')} Simular pago con QR (prueba)</button>
        <p class="vb-letra-chica centro">${ic('candado', 16)} Demostración: no se mueve dinero real.</p>
      </section>

      <div class="vb-separador"><span>o</span></div>
      <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-accion="pagar-efectivo">${ic('billete')} Pagar en efectivo</button>

      ${qr ? `<details class="vb-tarjeta vb-otro-cel">
        <summary>${ic('qr', 22)} ¿Probar con otro celular?</summary>
        <p>Escanea este código con la cámara de otro celular: se abre la página de pago de prueba.</p>
        <div class="vb-qr-marco vb-qr-breb">${qr}</div>
      </details>` : ''}
    </div>`;
  }

  // Explica en palabras sencillas por qué no abrió la cámara (el navegador lo dice en inglés).
  function motivoCamara(err) {
    const nombre = err?.name || '';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'La cámara solo funciona si la página abre con https';
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') return 'No diste permiso para usar la cámara';
    if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No encontramos una cámara en este equipo';
    if (nombre === 'NotReadableError' || nombre === 'AbortError') return 'La cámara está ocupada por otra aplicación';
    return 'No pudimos abrir la cámara';
  }

  async function abrirEscaner() {
    let lector = null;
    let cerrada = false;
    const el = hoja.abrir({
      titulo: 'Escanea el QR del conductor',
      html: `<div class="vb-escaner"><video playsinline muted aria-label="Vista de la cámara"></video><span class="vb-escaner-marco" aria-hidden="true"></span><span class="vb-escaner-sin" aria-hidden="true">${ic('camara', 40)}</span></div>
        <p class="vb-escaner-estado" data-estado-camara role="status">Abriendo la cámara…</p>
        <button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="simular-pago">${ic('qr')} Simular pago con QR (prueba)</button>`,
      alCerrar: () => {
        cerrada = true;
        lector?.detener();
      },
    });
    const video = el.querySelector('video');
    const estado = el.querySelector('[data-estado-camara]');
    const alLeer = (texto) => {
      const r = p.pagarConQR(texto, billeteraElegida().nombre);
      if (r.ok) return hoja.cerrar();
      estado.textContent = `${r.error}. Intenta de nuevo.`;
      estado.classList.add('error');
      iniciar();
    };
    async function iniciar() {
      try {
        lector = await N.escanearQR(video, alLeer);
        if (cerrada) return lector.detener();
        if (!estado.classList.contains('error')) estado.textContent = 'Apunta al código QR que muestra el conductor.';
      } catch (err) {
        if (cerrada) return;
        estado.classList.add('error');
        el.querySelector('.vb-escaner')?.classList.add('sin-camara');
        estado.textContent = `${motivoCamara(err)}. Puedes usar «Simular pago con QR».`;
      }
    }
    iniciar();
  }

  /* ================================================================ */
  /* CALIFICAR                                                         */
  /* ================================================================ */
  function htmlCalificar() {
    const e = p.estado;
    const c = e.conductor || {};
    const pago = e.pago || {};
    return `<div class="vb-paso vb-calificar-pantalla">
      <div class="vb-desliza vb-calificar">
        <section class="vb-recibo-ok" aria-label="Pago">
          <span class="vb-recibo-ok-ic">${ic('check', 28)}</span>
          <div><b>${pago.metodo === 'qr' ? 'Pago exitoso' : 'Pago en efectivo registrado'}</b>
            <span>${N.pesos(pago.valor)}${pago.billetera ? ` · ${esc(pago.billetera)}` : ''}${pago.ref ? ` · Ref. ${esc(pago.ref)}` : ''}</span></div>
          ${pago.metodo === 'qr' ? '<span class="vb-prueba">Prueba</span>' : ''}
        </section>
        <div class="vb-calif-recibida" data-calif-recibida hidden></div>
        <div class="vb-calif-quien">${avatarHTML(c.nombre, 'grande')}
          <h1 tabindex="-1">¿Cómo te fue con ${esc(nombreCorto(c.nombre || 'tu conductor'))}?</h1>
          <p>Móvil ${esc(c.movil || '')} · ${esc(c.placa || '')}</p></div>
        <div class="vb-estrellas-elegir" role="radiogroup" aria-label="Calificación del conductor">
          ${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${ui.estrellas === i}" aria-label="${i} estrella${i > 1 ? 's' : ''}" data-accion="estrella" data-n="${i}" class="${i <= ui.estrellas ? 'llena' : ''}">${ic('estrella', 46)}</button>`).join('')}
        </div>
        <p class="vb-estrellas-texto" data-texto-estrellas>${TEXTO_ESTRELLAS[ui.estrellas]}</p>
        <div class="vb-etiquetas" aria-label="¿Qué te gustó?">
          ${N.ETIQUETAS_CALIFICACION.conductor.map((t) => `<button type="button" class="vb-chip" aria-pressed="${ui.etiquetas.has(t)}" data-accion="etiqueta" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
        </div>
        <label class="vb-campo"><span>Comentario <em>(opcional)</em></span><textarea data-campo="comentario" rows="2" maxlength="200" placeholder="Cuéntanos algo más…"></textarea></label>
      </div>
      <footer class="vb-barra-accion vb-barra-doble">
        <button type="button" class="vb-btn vb-btn-texto" data-accion="omitir-calificacion">Ahora no</button>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="enviar-calificacion" ${ui.estrellas ? '' : 'disabled'}>Enviar calificación</button>
      </footer>
    </div>`;
  }

  function actualizarCalificacionRecibida() {
    const caja = $('[data-calif-recibida]');
    const n = p.estado.calificacionRecibida;
    if (!caja || !n || !caja.hidden) return;
    const c = p.estado.conductor || {};
    caja.hidden = false;
    caja.innerHTML = `<span class="vb-calif-recibida-ic">${ic('estrella', 26)}</span><div><b>${esc(nombreCorto(c.nombre || 'Tu conductor'))} te calificó</b>${estrellasHTML(n, 22)}<small>¡Gracias por ser un gran pasajero!</small></div>`;
  }

  function marcarEstrellas(n) {
    ui.estrellas = n;
    $$('[data-accion="estrella"]').forEach((b) => {
      const i = Number(b.dataset.n);
      b.classList.toggle('llena', i <= n);
      b.setAttribute('aria-checked', String(i === n));
    });
    const t = $('[data-texto-estrellas]');
    if (t) t.textContent = TEXTO_ESTRELLAS[n];
    const enviar = $('[data-accion="enviar-calificacion"]');
    if (enviar) enviar.disabled = !n;
  }

  /* ================================================================ */
  /* MIS VIAJES, TARIFAS, PERFIL Y SUBPANTALLAS                        */
  /* ================================================================ */
  function cabSeccion(titulo, sub = '') {
    return `<header class="vb-cab-seccion"><div><h1 tabindex="-1">${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${insignia(36)}</header>`;
  }

  function cabSub(titulo, sub = '') {
    return `<header class="vb-cab-sub"><button type="button" class="vb-btn-icono" data-accion="volver" aria-label="Volver">${ic('atras')}</button><div><h1 tabindex="-1">${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div></header>`;
  }

  function vacio(titulo, texto, boton = '') {
    return `<div class="vb-vacio">${taxiLado({ movil: movilEjemplo(), clase: 'vb-vacio-ilus' })}<h2>${titulo}</h2><p>${texto}</p>${boton}</div>`;
  }

  function htmlHistorial() {
    const hist = N.perfil.historialPasajero();
    if (!hist.length) return vacio('Aún no tienes viajes', 'Cuando hagas tu primer viaje, aquí verás el recorrido, el conductor y el valor.', `<button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="ir-paso1">${ic('taxi')} Pedir mi primer taxi</button>`);
    return `<div class="vb-lista-viajes">${hist.map((v) => `<article class="vb-viaje ${v.estado}">
        <header><span class="vb-viaje-fecha">${ic('calendario', 18)} ${esc(mayuscula(N.fechaTexto(v.fecha)))} · ${esc(sinCorte(N.horaTexto(v.fecha)))}</span>
          <span class="vb-estado-chip ${v.estado}">${v.estado === 'finalizado' ? `${ic('check', 16)} Finalizado` : `${ic('cerrar', 16)} Cancelado`}</span></header>
        <div class="vb-punto-ruta chico"><i class="a">A</i><div><b>${esc(v.origen?.titulo || 'Punto de recogida')}</b></div></div>
        <div class="vb-punto-ruta chico"><i class="b">B</i><div><b>${esc(v.destino?.titulo || 'Destino a convenir')}</b></div></div>
        <footer><span>${v.conductor ? `Móvil ${esc(v.conductor.movil)} · ${esc(v.conductor.placa)}` : esc(v.motivo || 'Sin conductor')}
          ${v.estado === 'finalizado' ? ` · ${v.metodoPago === 'qr' ? 'QR' : 'Efectivo'}` : ''}${v.calificacionDada ? ` · ${'★'.repeat(v.calificacionDada)}` : ''}${v.simulado ? ' · <em>prueba</em>' : ''}</span>
          <b>${v.estado === 'finalizado' ? N.pesos(v.valor) : '—'}</b></footer>
      </article>`).join('')}</div>`;
  }

  function htmlProgramados() {
    const prog = N.perfil.viajesProgramados();
    if (!prog.length) return vacio('No tienes viajes programados', 'Programa con 24 horas de anticipación y ahorra el 10 %.', `<button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="programar">${ic('calendario')} Programar un viaje</button>`);
    return `<div class="vb-lista-viajes">${prog.map((v) => `<article class="vb-viaje programado">
        <header><span class="vb-viaje-fecha">${ic('calendario', 18)} ${esc(fechaLarga(v.fecha))}</span>${v.tarifa?.descuento ? '<span class="vb-estado-chip oro">−10 %</span>' : ''}</header>
        <div class="vb-punto-ruta chico"><i class="a">A</i><div><b>${esc(v.origen?.titulo || '')}</b></div></div>
        <div class="vb-punto-ruta chico"><i class="b">B</i><div><b>${esc(v.destino?.titulo || 'Destino a convenir')}</b></div></div>
        <footer><span>${v.metodoPago === 'qr' ? 'Pago con QR' : 'Efectivo'}${v.tarifa?.descuento ? ` · ahorras ${N.pesos(v.tarifa.descuento)}` : ''}</span><b>${N.pesos(v.tarifa?.total)}</b></footer>
        <button type="button" class="vb-btn vb-btn-texto" data-accion="quitar-programado" data-id="${esc(v.id)}">${ic('basura', 18)} Cancelar este viaje</button>
      </article>`).join('')}</div>`;
  }

  function htmlViajes() {
    const nH = N.perfil.historialPasajero().length;
    const nP = N.perfil.viajesProgramados().length;
    return `<div class="vb-desliza vb-viajes">
      ${cabSeccion('Mis viajes', 'Tu historial y tus viajes programados')}
      <div class="vb-segmentos" role="tablist" aria-label="Tipo de viajes">
        <button type="button" role="tab" aria-selected="${ui.pestanaViajes === 'historial'}" data-accion="seg-viajes" data-v="historial">${ic('historial', 20)} Historial <em>${nH}</em></button>
        <button type="button" role="tab" aria-selected="${ui.pestanaViajes === 'programados'}" data-accion="seg-viajes" data-v="programados">${ic('calendario', 20)} Programados <em>${nP}</em></button>
      </div>
      <div role="tabpanel">${ui.pestanaViajes === 'historial' ? htmlHistorial() : htmlProgramados()}</div>
    </div>`;
  }

  // 20 → «8:00 p. m.»; 6 → «6:00 a. m.» (las horas salen de N.TARIFAS).
  function hora12(h) {
    return `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'a. m.' : 'p. m.'}`;
  }

  function htmlTarifas() {
    const T = N.TARIFAS;
    // Tabla oficial (Cootransrural: Decreto 05 de 2026). Banderazo y valor por km, estimados.
    const oficiales = Boolean(N.TARIFAS_OFICIALES);
    const fuente = N.FUENTE_TARIFAS;
    const estimados = new Set(Array.isArray(T.estimados) ? T.estimados : []);
    const zonas = oficiales ? N.zonasTarifa() : [];
    const totalDestinos = zonas.reduce((n, z) => n + z.destinos.length, 0);
    const aviso = T.ejemplo
      ? `<p class="vb-aviso-ejemplo">${ic('info', 22)}<span><b>Tarifas de ejemplo.</b> Son valores de prueba para esta demostración; los oficiales los define la ${MARCA.tipo}.</span></p>`
      : fuente ? `<p class="vb-aviso-ejemplo vb-aviso-oficial" data-aviso-oficial>${ic('check', 22)}<span><b>Tarifas oficiales · ${esc(fuente.acto)}.</b> ${esc([fuente.entidad, fuente.fecha].filter(Boolean).join(', '))}${oficiales ? `: precio cerrado desde ${esc(N.ORIGEN_OFICIAL)} a ${totalDestinos} destinos.` : '.'}${N.urlDecreto(fuente.url) ? ` <a href="${esc(N.urlDecreto(fuente.url))}" target="_blank" rel="noopener" data-enlace-decreto>Ver el decreto</a>` : ''}</span></p>` : '';
    const zonasHTML = !oficiales ? '' : `<section class="vb-tarjeta vb-zonas-tarifa" data-tabla-oficial>
        <h2>${ic('ruta', 24)} ${esc(`Precios desde ${N.ORIGEN_OFICIAL}`)}</h2>
        <p class="vb-sub">${esc(`${fuente?.acto || 'Tabla oficial'}: ${totalDestinos} destinos en ${zonas.length} zonas. Toca una zona.`)}</p>
        ${zonas.map((z) => `<details class="vb-zona" data-zona="${z.zona}"><summary><b>Zona ${z.zona}</b> <span>${esc(z.sector)} · ${z.destinos.length}</span></summary>
          <ul>${z.destinos.map((d) => { const nota = N.textoPrecision(d); return `<li data-id="${esc(d.id)}"><span>${esc(d.destino)}${nota ? `<small>${esc(nota)}</small>` : ''}</span><b>${N.pesos(d.valor)}</b></li>`; }).join('')}</ul></details>`).join('')}
      </section>`;
    return `<div class="vb-desliza vb-tarifas">
      ${cabSeccion('Tarifas y rutas', 'Para que sepas cuánto vale antes de subir')}
      ${aviso}
      <section class="vb-ofertas">
        <button type="button" class="vb-oferta oro" data-accion="programar"><span class="vb-oferta-num">−10 %</span><span><b>Programa con 24 h</b><small>Pide con un día de anticipación y paga menos.</small></span>${ic('flecha')}</button>
        <button type="button" class="vb-oferta verde" data-accion="ir" data-pantalla="fidelidad"><span class="vb-oferta-num">50 %</span><span><b>Cada 10 viajes</b><small>El siguiente viaje va a mitad de precio.</small></span>${ic('flecha')}</button>
      </section>
      <section class="vb-tarjeta vb-reglas">
        <h2>${ic('taxi', 24)} ${esc(MARCA.pueblo ? `Dentro de ${MARCA.pueblo}` : 'Dentro del municipio')}</h2>
        <dl>
          <div><dt>Carrera mínima${oficiales ? ' <small>(oficial)</small>' : ''}</dt><dd>${N.pesos(T.minimaUrbana)}</dd></div>
          <div><dt>Banderazo${estimados.has('banderazo') ? ' <small>(estimado)</small>' : ''}</dt><dd>${N.pesos(T.banderazo)}</dd></div>
          <div><dt>Por kilómetro${estimados.has('porKm') ? ' <small>(estimado)</small>' : ''}</dt><dd>${N.pesos(T.porKm)}</dd></div>
          ${T.recargoNocturno > 0 ? `<div><dt>Recargo nocturno <small>(${sinCorte(hora12(T.nocheDesde))} a ${sinCorte(hora12(T.nocheHasta))})</small></dt><dd>+${N.pesos(T.recargoNocturno)}</dd></div>` : ''}
          ${T.recargoDominical > 0 ? `<div><dt>Domingos y festivos</dt><dd>+${N.pesos(T.recargoDominical)}</dd></div>` : ''}
        </dl>
        ${oficiales ? [T.notaRecargos, T.notaEstimacion].filter(Boolean).map((x) => `<p class="vb-letra-chica">${esc(x)}</p>`).join('') : ''}
      </section>
      ${zonasHTML}
      <section class="vb-tarjeta vb-rutas">
        <h2>${ic('ruta', 24)} ${esc(MARCA.pueblo ? `Rutas desde ${MARCA.pueblo}` : 'Rutas a otros municipios')}</h2>
        <p class="vb-sub">${oficiales && T.rutasReferencia && N.RUTAS.some((r) => r.fijada !== true) ? 'Precio de referencia por trayecto, por confirmar con la cooperativa (el decreto no fija viajes a otros municipios). Toca una ruta para pedirla.' : 'Tarifa fija por trayecto. Toca una ruta para pedirla.'}</p>
        <ul>${N.RUTAS.map((r) => `<li><button type="button" data-accion="ruta-pedir" data-id="${esc(r.id)}">
            <span class="vb-ruta-nombre"><b>${esc(r.destino)}</b><small>${r.km} km · ${N.minutosTexto(r.min)}${!T.ejemplo && r.fijada === true ? ` · ${esc(`fijado por ${MARCA.nombre}`)}` : ''}</small></span>
            <span class="vb-ruta-valor">${N.pesos(r.valor)}</span>${ic('flecha', 20)}</button></li>`).join('')}</ul>
      </section>
      <p class="vb-letra-chica centro">Los valores pueden cambiar por peajes, esperas o paradas adicionales.</p>
    </div>`;
  }

  // Solo dentro de TaxiCun: volver a la lista de municipios para usar otra cooperativa.
  function itemMunicipio() {
    const ahora = [MARCA.pueblo, MARCA.nombre].filter(Boolean).join(' · ');
    return `<a class="vb-menu-item vb-menu-tc" href="${esc(enlaceMunicipio('pasajero'))}" data-accion="cambiar-municipio" data-cambiar-municipio>
      <span class="vb-menu-ic vb-menu-ic-tc">${iconoTaxiCun(44)}</span><span><b>Cambiar de municipio</b><small>Ahora: ${esc(ahora)}</small></span>${ic('flecha', 20)}</a>`;
  }

  function htmlPerfil() {
    const yo = p.perfil || {};
    const n = p.viajesCompletados();
    const contacto = yo.contactoEmergencia;
    const item = (accion, icono, titulo, sub, extra = '') => `<button type="button" class="vb-menu-item" data-accion="${accion}" ${extra}><span class="vb-menu-ic">${ic(icono, 24)}</span><span><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</span>${ic('flecha', 20)}</button>`;
    return `<div class="vb-desliza vb-perfil">
      <header class="vb-perfil-cab">
        ${avatarHTML(yo.nombre, 'grande claro')}
        <div><h1 tabindex="-1">${esc(yo.nombre || '')}</h1><p>${esc(celularTexto(yo.celular))} ${yo.verificado ? `<span class="vb-verificado claro">${ic('check', 14)} Verificado</span>` : ''}</p>
        <p class="vb-perfil-datos">${ic('estrella', 16)} ${decimal(yo.calificacion || 5)} como pasajero · ${n} viaje${n === 1 ? '' : 's'}</p></div>
      </header>
      <div class="vb-menu">
        <h2>Mi cuenta</h2>
        ${item('ir', 'marcador', 'Mis lugares', 'Casa, trabajo y favoritos', 'data-pantalla="lugares"')}
        ${item('ir', 'tarjeta', 'Tarjeta de fidelidad y promociones', 'Cada 10 viajes, uno al 50 %', 'data-pantalla="fidelidad"')}
        ${item('emergencia', 'sos', 'Contacto de emergencia', contacto?.celular ? `${esc(contacto.nombre || '')} · ${esc(celularTexto(contacto.celular))}` : 'Agrégalo para avisarle con un toque')}
        <h2>La app</h2>
        ${item('ir', 'ajustes', 'Ajustes', 'Diseño, sonido, avisos y modo de prueba', 'data-pantalla="ajustes"')}
        ${item('instalar', 'instalar', 'Instalar la app', N.yaInstalada() ? 'Ya está instalada en este celular' : 'Tenla a un toque en tu pantalla')}
        ${item('ir', 'ayuda', 'Ayuda y contacto', MARCA.telefono ? `Central${MARCA.servicio24h ? ' 24 h' : ''} · ${esc(MARCA.telefonoVisible)}` : 'Preguntas frecuentes y contacto', 'data-pantalla="ayuda"')}
        ${TAXICUN.activo ? itemMunicipio() : ''}
        <a class="vb-menu-item" href="${esc(enlaceApp('conductor', diseno))}" data-enlace-conductor><span class="vb-menu-ic">${ic('volante', 24)}</span><span><b>Soy conductor</b><small>Abrir la app de conductores</small></span>${ic('flecha', 20)}</a>
        <button type="button" class="vb-menu-item rojo" data-accion="cerrar-sesion"><span class="vb-menu-ic">${ic('salir', 24)}</span><span><b>Cerrar sesión</b></span></button>
      </div>
      <p class="vb-version">${esc(MARCA.nombre)} · Diseño B «${esc(NOMBRE_DISENO)}» · <a href="${esc(urlPrivacidad())}" target="_blank" rel="noopener">Privacidad</a><br>${esc(textoDesarrollada())}</p>
      ${notaPropuesta()}
    </div>`;
  }

  function htmlLugares() {
    const g = N.perfil.lugaresGuardados();
    ui.listas.rec = N.perfil.recientes();
    ui.listas.fav = g.otros || [];
    const fila = (tipo, icono, titulo) => {
      const l = g[tipo];
      return `<section class="vb-tarjeta vb-lugar-guardado">
        <div class="vb-lugar-guardado-cab"><span class="vb-menu-ic">${ic(icono, 24)}</span><div><b>${titulo}</b><small>${l ? esc(l.titulo) : 'Sin guardar'}</small></div></div>
        <div class="vb-fila-botones">
          ${l ? `<button type="button" class="vb-btn vb-btn-primario" data-accion="usar-guardado" data-tipo="${tipo}">${ic('taxi', 20)} Ir</button>` : ''}
          <button type="button" class="vb-btn vb-btn-borde" data-accion="guardar-actual" data-tipo="${tipo}">${ic('pin', 20)} ${l ? 'Cambiar por mi ubicación' : 'Guardar mi ubicación actual'}</button>
        </div></section>`;
    };
    return `<div class="vb-desliza vb-lugares">
      ${cabSub('Mis lugares', 'Para pedir más rápido')}
      ${fila('casa', 'casa', 'Casa')}
      ${fila('trabajo', 'trabajo', 'Trabajo')}
      <p class="vb-letra-chica">Consejo: al confirmar un taxi también puedes guardar el destino como Casa, Trabajo o Favorito.</p>
      ${ui.listas.fav.length ? `<h2 class="vb-titulo-seccion">Favoritos</h2><ul class="vb-lista">${ui.listas.fav.map((l, i) => itemLugar(l, 'fav', i, 'marcador')).join('')}</ul>` : ''}
      ${ui.listas.rec.length ? `<h2 class="vb-titulo-seccion">Recientes</h2><ul class="vb-lista">${ui.listas.rec.map((l, i) => itemLugar(l, 'rec', i, 'historial')).join('')}</ul>` : ''}
    </div>`;
  }

  function htmlFidelidad() {
    const n = p.viajesCompletados();
    const prog = N.progresoFidelidad(n);
    const yo = p.perfil || {};
    return `<div class="vb-desliza vb-fidelidad">
      ${cabSub('Tarjeta de fidelidad', `Promociones de ${esc(MARCA.nombre)}`)}
      <article class="vb-tarjeta-fisica" aria-label="Tarjeta de fidelidad">
        <header>${insignia(40)}<div><b>${esc(MARCA.nombre)}</b><small>Tarjeta de fidelidad</small></div><span class="vb-tf-num">N.º ${esc(String(yo.id || '').slice(-5).toUpperCase())}</span></header>
        <p class="vb-tf-nombre">${esc(yo.nombre || '')}</p>
        ${sellosHTML(prog)}
        <footer>${prog.siguienteConDescuento ? '<b>¡Tu próximo viaje va al 50 %!</b>' : `Te faltan <b>${prog.faltan}</b> viaje${prog.faltan === 1 ? '' : 's'} para tu viaje al 50 %`}</footer>
      </article>
      <section class="vb-tarjeta vb-reglas-promo">
        <h2>${ic('regalo', 24)} Así funciona</h2>
        <ol>
          <li>Cada viaje terminado te da un sello.</li>
          <li>Con 10 sellos, el viaje número 11 va con el <b>50 % de descuento</b>.</li>
          <li>Si programas con <b>24 h de anticipación</b>, ahorras el <b>10 %</b>.</li>
          <li>Los descuentos no se suman: siempre te aplicamos el mayor.</li>
        </ol>
      </section>
      <button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="programar">${ic('calendario')} Programar y ahorrar 10 %</button>
      <p class="vb-letra-chica centro">Llevas ${n} viaje${n === 1 ? '' : 's'} completado${n === 1 ? '' : 's'} con ${esc(MARCA.nombre)}.</p>
    </div>`;
  }

  function interruptor(accion, activo, titulo, sub, icono) {
    return `<div class="vb-ajuste"><span class="vb-menu-ic">${ic(icono, 24)}</span><span class="vb-ajuste-txt"><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      <button type="button" class="vb-interruptor" role="switch" aria-checked="${activo}" aria-label="${titulo}" data-accion="${accion}"><i></i></button></div>`;
  }

  function htmlAjustes() {
    const a = N.perfil.ajustes();
    const permiso = N.permisoNotificaciones();
    const textoPermiso = { granted: 'Activadas: te avisamos aunque la app esté cerrada.', denied: 'Bloqueadas en el navegador. Actívalas en la configuración del sitio.', default: 'Aún no están activadas.', 'no-soportado': 'Este navegador no las permite.' }[permiso] || '';
    const disenos = [
      ['a', 'Ámbar Urbano', 'Amarillo taxi, alegre y directo'],
      ['b', NOMBRE_DISENO, 'Cooperativo y fácil (este)'],
      ['c', 'Noche Neón', 'Modo oscuro con luces de neón'],
      ['auto', 'Día y noche', 'Ámbar de día y Neón de noche'],
    ];
    const elegido = N.perfil.disenoPreferido?.() || diseno;
    // Dentro de TaxiCun se abre el diseño que eligió la cooperativa; cambiarlo aquí vale solo en este celular.
    const deLaCooperativa = disenos.find(([id]) => id === N.FICHA?.diseno);
    return `<div class="vb-desliza vb-ajustes">
      ${cabSub('Ajustes')}
      ${TAXICUN.activo ? `<section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('pin', 22)} Tu municipio</h2>
        ${itemMunicipio()}
        <p class="vb-letra-chica">${esc(TAXICUN.nombre)} te muestra los taxis de la ${MARCA.tipo} de tu municipio. Si vas para otro, cámbialo aquí.</p></section>` : ''}
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('paleta', 22)} Diseño de la app</h2>
        <div class="vb-disenos" role="radiogroup" aria-label="Diseño">
          ${disenos.map(([id, t, s]) => `<button type="button" role="radio" aria-checked="${id === elegido}" data-accion="diseno" data-d="${id}" class="d-${id}"><span class="vb-diseno-muestra" aria-hidden="true"></span><b>${esc(t)}</b><small>${esc(s)}</small></button>`).join('')}
        </div>
        ${TAXICUN.activo && deLaCooperativa ? `<p class="vb-letra-chica" data-diseno-cooperativa>${esc(MARCA.nombre)} eligió el diseño «${esc(deLaCooperativa[1])}». Si escoges otro, cambia solo en este celular.</p>` : ''}</section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('robot', 22)} Conductor de prueba</h2>
        <div class="vb-opciones-lista" role="radiogroup" aria-label="Simulación">
          <button type="button" role="radio" aria-checked="${a.simulacion !== 'real'}" data-accion="simulacion" data-v="auto"><b>Automática</b><small>Si ningún conductor real acepta, entra uno de prueba.</small></button>
          <button type="button" role="radio" aria-checked="${a.simulacion === 'real'}" data-accion="simulacion" data-v="real"><b>Solo conductores reales</b><small>Para probar con la app del conductor en otro celular.</small></button>
        </div></section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('campana', 22)} Avisos</h2>
        ${interruptor('sonido', a.sonido !== false, 'Sonido de avisos', 'Tonos cuando el taxi acepta, llega o termina.', 'sonido')}
        <div class="vb-ajuste"><span class="vb-menu-ic">${ic('campana', 24)}</span><span class="vb-ajuste-txt"><b>Notificaciones</b><small>${textoPermiso}</small></span>
          ${permiso === 'default' ? '<button type="button" class="vb-btn vb-btn-suave vb-btn-chico" data-accion="notificaciones">Activar</button>' : ''}</div>
      </section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('antena', 22)} Conexión de prueba</h2>
        ${interruptor('envivo', N.enVivoActivo(), 'Conectar con otros celulares', p.estado.conexion === 'en-vivo' ? 'Ahora: en vivo.' : 'Ahora: solo este equipo.', 'antena')}
        <form class="vb-sala" data-form="sala"><label class="vb-campo"><span>Sala de prueba</span><input name="sala" value="${esc(p.estado.sala)}" maxlength="24" autocomplete="off" autocapitalize="none" spellcheck="false"></label>
          <button type="submit" class="vb-btn vb-btn-borde">Cambiar sala</button></form>
        <p class="vb-letra-chica">El pasajero y el conductor deben estar en la misma sala para encontrarse.</p>
      </section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('instalar', 22)} Instalar</h2>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="instalar">${ic('instalar')} ${N.yaInstalada() ? 'Ya está instalada' : 'Instalar la app'}</button></section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('info', 22)} Acerca de</h2>
        <div class="vb-acerca" data-acerca>${insignia(40)}<div><b>${esc(MARCA.nombre)}</b>${MARCA.razonSocial && MARCA.razonSocial !== MARCA.nombre ? `<small>${esc(MARCA.razonSocial)}</small>` : ''}${desarrolladaPor()}</div></div>
        ${notaPropuesta()}
      </section>
    </div>`;
  }

  function htmlAyuda() {
    const pregunta = (q, r) => `<details class="vb-tarjeta vb-pregunta"><summary>${q}</summary><p>${r}</p></details>`;
    // Solo los medios de contacto que la ficha trae; si falta el teléfono, se dice con honestidad.
    const contacto = [
      MARCA.telefono ? `<a class="vb-btn vb-btn-primario vb-btn-xl" href="${esc(telCentral())}">${ic('telefono')} Llamar a la central</a>` : '',
      MARCA.whatsapp ? `<a class="vb-btn vb-btn-oro vb-btn-xl" href="${esc(N.urlSegura(N.enlaceWhatsApp(MARCA.whatsapp, `Hola ${MARCA.nombre}, necesito ayuda con la app.`)))}" target="_blank" rel="noopener">${ic('chat')} Escribir por WhatsApp</a>` : '',
      MARCA.correo ? `<a class="vb-btn vb-btn-borde vb-btn-xl" href="${esc(N.enlaceCorreo(MARCA.correo))}">${ic('correo')} ${esc(MARCA.correo)}</a>` : '',
    ].filter(Boolean).join('');
    const sinTelefono = MARCA.telefono ? '' : `<p class="vb-nota-gps" role="note" data-sin-telefono>${ic('info', 20)}<span><b>Teléfono de la central: pronto.</b> Mientras tanto, pide tu taxi desde la app${MARCA.whatsapp ? ' o escríbenos por WhatsApp' : ''}.</span></p>`;
    const lineaOficina = [MARCA.telefono ? esc(MARCA.telefonoVisible) : '', MARCA.servicio24h ? 'Servicio 24 horas' : ''].filter(Boolean).join(' · ');
    return `<div class="vb-desliza vb-ayuda">
      ${cabSub('Ayuda y contacto', MARCA.servicio24h ? 'Estamos para servirte las 24 horas' : 'Estamos para servirte')}
      ${sinTelefono}
      ${contacto ? `<div class="vb-contacto">${contacto}</div>` : ''}
      <section class="vb-tarjeta vb-oficina">${insignia(44)}<div><b>${esc(MARCA.razonSocial || MARCA.nombre)}</b>${MARCA.direccion ? `<p>${esc(MARCA.direccion)}</p>` : ''}${lineaOficina ? `<p>${lineaOficina}</p>` : ''}</div></section>
      <h2 class="vb-titulo-seccion">Preguntas frecuentes</h2>
      ${pregunta('¿Cómo sé que es mi taxi?', 'En la app ves el carné del conductor con su nombre, el número de móvil y la placa. Al subir, dile tu código de 4 dígitos: si no te lo pide, no es tu servicio.')}
      ${pregunta('¿Cómo pago?', 'Puedes pagar en efectivo o escaneando el código QR que el conductor muestra en su celular. En esta demostración el pago con QR es de prueba.')}
      ${pregunta('¿Puedo programar un viaje?', 'Sí. Toca «Programar viaje» y elige la fecha y la hora. Si es con 24 horas de anticipación, te descontamos el 10 %.')}
      ${pregunta('¿Qué hago en una emergencia?', 'Durante el viaje tienes el botón SOS: llama al 123, avisa a tu contacto de emergencia o comparte tu viaje en un toque.')}
    </div>`;
  }

  const PANTALLAS = {
    'registro:bienvenida': { html: htmlBienvenida, montar: () => activarFotos(vista) },
    'registro:datos': { html: htmlRegistroDatos },
    'registro:codigo': { html: htmlRegistroCodigo, montar: montarRegistroCodigo },
    inicio: { html: htmlInicio, montar: montarInicio },
    paso1: { html: htmlPaso1, montar: montarPaso1 },
    paso2: { html: htmlPaso2 },
    paso2mapa: { html: htmlPaso2Mapa, montar: montarPaso2Mapa },
    paso3: { html: htmlPaso3, montar: montarPaso3 },
    pagar: { html: htmlPagar },
    calificar: { html: htmlCalificar },
    viajes: { html: htmlViajes },
    tarifas: { html: htmlTarifas },
    perfil: { html: htmlPerfil },
    lugares: { html: htmlLugares },
    fidelidad: { html: htmlFidelidad },
    ajustes: { html: htmlAjustes },
    ayuda: { html: htmlAyuda },
  };

  /* ================================================================ */
  /* ACCIONES                                                          */
  /* ================================================================ */
  function lugarDeRef(ref) {
    const [lista, i] = String(ref).split(':');
    return ui.listas[lista]?.[Number(i)] || null;
  }

  function recargarCon(param, valor) {
    const u = new URL(location.href);
    if (valor == null) u.searchParams.delete(param);
    else u.searchParams.set(param, valor);
    location.replace(u.href);
  }

  async function instalarApp() {
    if (N.yaInstalada()) return avisos.mostrar({ titulo: 'Ya está instalada', cuerpo: 'Búscala en la pantalla de inicio de tu celular.', tipo: 'info' });
    const r = await N.instalar();
    if (r === 'aceptada') return avisos.mostrar({ titulo: '¡Listo!', cuerpo: 'La app quedó instalada.', tipo: 'exito' });
    if (r === 'manual') {
      hoja.abrir({
        titulo: 'Instala la app',
        html: `<ol class="vb-pasos-instalar">${N.instruccionesInstalacion().map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
          <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-cerrar-hoja>Entendido</button>`,
      });
    }
  }

  function abrirEmergencia() {
    const c = p.perfil?.contactoEmergencia || {};
    hoja.abrir({
      titulo: 'Contacto de emergencia',
      html: `<form class="vb-form" data-form="emergencia" novalidate>
          <p class="vb-sub">Con el botón SOS le enviarás por WhatsApp los datos del taxi y tu ubicación.</p>
          <label class="vb-campo"><span>Nombre</span><input name="nombre" value="${esc(c.nombre || '')}" placeholder="Ej.: Mamá"></label>
          <label class="vb-campo"><span>Celular</span><input name="celular" type="tel" inputmode="tel" maxlength="20" value="${esc(c.celular || '')}" placeholder="310 000 0000"></label>
          <p class="vb-error" data-error role="alert"></p>
          <button type="submit" class="vb-btn vb-btn-primario vb-btn-xl">Guardar</button>
          ${c.celular ? '<button type="button" class="vb-btn vb-btn-texto vb-btn-bloque" data-accion="quitar-emergencia">Quitar contacto</button>' : ''}
        </form>`,
    });
  }

  const ACCIONES = {
    'reg-empezar': () => {
      ui.registro.etapa = 'datos';
      pintar(true, true);
    },
    'reg-atras': () => {
      ui.registro.etapa = ui.registro.etapa === 'codigo' ? 'datos' : 'bienvenida';
      pintar(true, true);
    },
    'reg-verificar': () => verificarCodigo(),
    'reg-reenviar': () => {
      ui.registro.codigo = codigo4();
      pintar(true);
      avisos.mostrar({ titulo: 'Te enviamos otro código', cuerpo: `Código de prueba: ${ui.registro.codigo}`, tipo: 'info' });
    },
    'ir-paso1': () => irA('paso1'),
    ir: (b) => irA(b.dataset.pantalla),
    tab: (b) => irTab(b.dataset.pantalla),
    volver: () => volver(),
    'volver-a': (b) => irA(b.dataset.pantalla),
    programar: () => {
      ui.programar = true;
      ui.fecha = fechaSugerida();
      irA('paso1');
    },
    'ver-programados': () => {
      ui.pestanaViajes = 'programados';
      irTab('viajes');
    },
    'mi-ubicacion': (b) => usarMiUbicacion(b),
    'confirmar-recogida': async (b) => {
      await completarDireccion('recogida', b);
      irA('paso2');
    },
    'limpiar-busqueda': (b) => {
      const campo = $('[data-campo="busqueda"]');
      campo.value = '';
      b.hidden = true;
      $('[data-resultados]').innerHTML = '';
      campo.focus();
    },
    'destino-guardado': (b) => {
      const l = N.perfil.lugaresGuardados()[b.dataset.tipo];
      if (l) elegirDestino(l);
      else irA('lugares');
    },
    'destino-en-mapa': () => {
      ui.destinoMapa = null;
      irA('paso2mapa');
    },
    'destino-conductor': () => elegirDestino(null),
    categoria: (b) => {
      ui.categoria = b.dataset.cat;
      $$('[data-accion="categoria"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $('[data-lista-categoria]').innerHTML = htmlListaCategoria();
    },
    'elegir-lugar': (b) => {
      const l = lugarDeRef(b.dataset.ref);
      if (l) elegirDestino(l);
    },
    'confirmar-destino-mapa': async (b) => {
      if (!ui.destinoMapa) return;
      await completarDireccion('destinoMapa', b);
      elegirDestino(ui.destinoMapa);
    },
    pago: (b) => {
      ui.metodoPago = b.dataset.metodo;
      $$('[data-accion="pago"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    },
    cuando: (b) => {
      ui.programar = b.dataset.v === 'programar';
      if (ui.programar && !ui.fecha) ui.fecha = fechaSugerida();
      $('[data-cuando]').innerHTML = htmlCuando();
      cotizarAhora();
    },
    'nota-rapida': (b) => {
      const campo = $('[data-campo="nota"]');
      const t = b.dataset.t;
      campo.value = campo.value.trim() ? `${campo.value.trim()}. ${t}` : t;
      ui.nota = campo.value.slice(0, 140);
    },
    'guardar-destino': (b) => {
      if (!ui.destino) return;
      const tipo = b.dataset.tipo;
      N.perfil.guardarLugar(tipo === 'otro' ? 'otro' : tipo, { ...ui.destino });
      b.classList.add('hecho');
      avisos.mostrar({ titulo: 'Lugar guardado', cuerpo: `${ui.destino.titulo} quedó como ${tipo === 'otro' ? 'favorito' : tipo}.`, tipo: 'exito' });
    },
    'pedir-taxi': (b) => pedirTaxi(b),
    cancelar: () => abrirCancelar(),
    motivo: (b) => b.parentElement.querySelectorAll('[data-accion="motivo"]').forEach((x) => x.setAttribute('aria-checked', String(x === b))),
    'confirmar-cancelar': () => {
      const elegido = app.querySelector('.vb-capa-hoja [data-accion="motivo"][aria-checked="true"]');
      hoja.cerrar();
      p.cancelar(elegido?.dataset.m || N.MOTIVOS_CANCELACION.pasajero[0]);
    },
    sos: () => abrirSOS(),
    compartir: () => compartir(),
    'llamada-demo': () => avisos.mostrar(N.AVISO_LLAMADA_DEMO),
    billetera: (b) => {
      ui.billetera = b.dataset.id;
      $$('[data-accion="billetera"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    },
    escanear: () => abrirEscaner(),
    'simular-pago': () => {
      hoja.cerrar();
      const r = p.pagarConQR(null, billeteraElegida().nombre);
      if (!r.ok) avisos.mostrar({ titulo: 'No se pudo pagar', cuerpo: r.error || '', tipo: 'error' });
    },
    'pagar-efectivo': () => p.pagarEnEfectivo(),
    estrella: (b) => marcarEstrellas(Number(b.dataset.n)),
    etiqueta: (b) => {
      const t = b.dataset.t;
      if (ui.etiquetas.has(t)) ui.etiquetas.delete(t);
      else ui.etiquetas.add(t);
      b.setAttribute('aria-pressed', String(ui.etiquetas.has(t)));
    },
    'enviar-calificacion': () => {
      if (!ui.estrellas) return;
      const comentario = $('[data-campo="comentario"]')?.value.trim() || '';
      p.calificar(ui.estrellas, { etiquetas: [...ui.etiquetas], comentario });
    },
    'omitir-calificacion': () => p.omitirCalificacion(),
    'seg-viajes': (b) => {
      ui.pestanaViajes = b.dataset.v;
      pintar(true);
    },
    'quitar-programado': (b) => {
      N.perfil.quitarProgramado(b.dataset.id);
      avisos.mostrar({ titulo: 'Viaje programado cancelado', tipo: 'info' });
      pintar(true);
    },
    'ruta-pedir': (b) => {
      const l = N.LUGARES.find((x) => x.id === b.dataset.id);
      if (l) elegirDestino({ titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng });
    },
    'usar-guardado': (b) => {
      const l = N.perfil.lugaresGuardados()[b.dataset.tipo];
      if (l) elegirDestino(l);
    },
    'guardar-actual': (b) => {
      const tipo = b.dataset.tipo;
      N.perfil.guardarLugar(tipo, { lat: ui.recogida.lat, lng: ui.recogida.lng, titulo: ui.recogida.titulo, detalle: ui.recogida.detalle });
      avisos.mostrar({ titulo: 'Lugar guardado', cuerpo: `${ui.recogida.titulo} quedó como ${tipo}.`, tipo: 'exito' });
      pintar(true);
    },
    emergencia: () => abrirEmergencia(),
    'quitar-emergencia': () => {
      N.perfil.registrarPasajero({ contactoEmergencia: null });
      hoja.cerrar();
      pintar(true);
    },
    'cerrar-sesion': () => {
      hoja.abrir({
        titulo: '¿Cerrar sesión?',
        html: `<p class="vb-sub">Tu historial queda guardado en este celular.</p>
          <button type="button" class="vb-btn vb-btn-rojo vb-btn-xl" data-accion="confirmar-cerrar-sesion">Sí, cerrar sesión</button>
          <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-cerrar-sesion': () => {
      hoja.cerrar();
      N.perfil.cerrarSesionPasajero();
      ui.registro = { etapa: 'bienvenida', datos: null, codigo: '' };
      ui.pantalla = 'inicio';
      pintar(true, true);
    },
    instalar: () => instalarApp(),
    // Es un enlace a la lista de municipios de TaxiCun (urlElegirMunicipio); con un
    // viaje en curso no se sale (se perdería el seguimiento del taxi).
    'cambiar-municipio': (b, e) => {
      if (p.estado.fase === 'inicio') return;
      e.preventDefault();
      avisos.mostrar({ titulo: 'Tienes un viaje en curso', cuerpo: 'Termínalo antes de cambiar de municipio.', tipo: 'info' });
    },
    diseno: (b) => {
      N.perfil.elegirDiseno(b.dataset.d);
      recargarCon('d', b.dataset.d);
    },
    simulacion: (b) => {
      N.perfil.guardarAjustes({ simulacion: b.dataset.v });
      $$('[data-accion="simulacion"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      avisos.mostrar({ titulo: 'Ajuste guardado', cuerpo: b.dataset.v === 'real' ? 'Solo conductores reales.' : 'Si nadie acepta, entra un conductor de prueba.', tipo: 'info' });
    },
    sonido: (b) => {
      const activo = b.getAttribute('aria-checked') !== 'true';
      N.perfil.guardarAjustes({ sonido: activo });
      b.setAttribute('aria-checked', String(activo));
      if (activo) N.sonar('exito');
    },
    notificaciones: async () => {
      await N.pedirPermisoNotificaciones();
      pintar(true);
    },
    envivo: (b) => {
      const activo = b.getAttribute('aria-checked') !== 'true';
      N.activarEnVivo(activo);
      location.reload();
    },
  };

  raiz.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accion]');
    if (!b || !raiz.contains(b) || b.disabled) return;
    const fn = ACCIONES[b.dataset.accion];
    if (!fn) return;
    if (b.tagName !== 'A') e.preventDefault();
    fn(b, e);
  });

  raiz.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.matches('[data-form="registro"]')) {
      e.preventDefault();
      enviarRegistro(form);
    } else if (form.matches('[data-form="emergencia"]')) {
      e.preventDefault();
      const f = new FormData(form);
      const celular = soloDigitos(f.get('celular'));
      const nombre = String(f.get('nombre') || '').trim();
      if (!/^[36]\d{9}$/.test(celular)) {
        form.querySelector('[data-error]').textContent = 'Escribe un celular de 10 dígitos.';
        return;
      }
      N.perfil.registrarPasajero({ contactoEmergencia: { nombre: nombre || 'Mi contacto', celular } });
      hoja.cerrar();
      avisos.mostrar({ titulo: 'Contacto guardado', cuerpo: `${nombre || 'Tu contacto'} recibirá tu aviso de emergencia.`, tipo: 'exito' });
      pintar(true);
    } else if (form.matches('[data-form="sala"]')) {
      e.preventDefault();
      const sala = new FormData(form).get('sala');
      N.cambiarSala(String(sala || ''));
      recargarCon('sala', null);
    }
  });

  raiz.addEventListener('input', (e) => {
    const formulario = e.target.closest?.('form');
    const error = formulario?.querySelector('[data-error]');
    if (error) error.textContent = '';
    e.target.removeAttribute?.('aria-invalid');
    const campo = e.target.dataset?.campo;
    if (campo === 'busqueda') {
      const x = $('[data-accion="limpiar-busqueda"]');
      if (x) x.hidden = !e.target.value;
      buscarConPausa(e.target.value);
    } else if (campo === 'nota') {
      ui.nota = e.target.value;
    }
  });

  raiz.addEventListener('change', (e) => {
    if (e.target.name === 'terminos') {
      const error = e.target.closest('form')?.querySelector('[data-error]');
      if (error) error.textContent = '';
      e.target.removeAttribute('aria-invalid');
    }
    if (e.target.dataset?.campo === 'fecha') {
      ui.fecha = e.target.value;
      $('[data-cuando]').innerHTML = htmlCuando();
      cotizarAhora();
    }
  });

  raiz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset?.campo === 'busqueda') {
      e.preventDefault();
      const primero = $('[data-resultados] .vb-lugar');
      primero?.click();
    }
  });

  // El sonido necesita un primer toque del usuario.
  raiz.addEventListener('pointerdown', () => N.prepararSonido(), { once: true });
  raiz.addEventListener('keydown', () => N.prepararSonido(), { once: true });

  window.addEventListener('resize', () => m?.refrescar());

  /* ---------------- eventos del núcleo ---------------- */
  p.on('cambio', () => pintar());
  p.on('aviso', (a) => {
    if (!ui.silencio) avisos.mostrar(a);
  });

  pintar(true);
  retomarTrasRecarga();

  // Al recargar la página: el núcleo descarta los viajes simulados en curso y, si
  // estaba buscando, deja la búsqueda quieta (no vuelve a llamar al conductor de
  // prueba). Aquí se explica lo primero y se vuelve a pedir lo segundo.
  async function retomarTrasRecarga() {
    const e = p.estado;
    const enCurso = ['buscando', 'asignado', 'llego', 'en_viaje'];
    if (e.fase === 'buscando' && e.viaje) {
      const v = e.viaje;
      ui.silencio = true;
      try {
        p.cancelar('Se recargó la página y se volvió a pedir');
        await p.solicitar({ origen: v.origen, destino: v.destino, metodoPago: v.metodoPago, nota: v.nota || '' });
      } catch {
        /* si falla, queda en el inicio para pedir de nuevo */
      } finally {
        ui.silencio = false;
      }
      avisos.mostrar({ titulo: 'Seguimos buscando tu taxi', cuerpo: 'La página se recargó y volvimos a enviar tu solicitud.', tipo: 'info' });
    } else if (e.fase === 'inicio' && previo?.estado?.viaje?.simulado && enCurso.includes(previo.fase) && p.registrado) {
      avisos.mostrar({ titulo: 'El viaje de prueba se reinició', cuerpo: 'Al recargar la página la simulación vuelve a empezar. Pide otro taxi cuando quieras.', tipo: 'info' });
    }
  }
}
