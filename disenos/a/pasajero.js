// App del pasajero — diseño A «Ámbar Urbano».
// Mapa a pantalla completa, barra flotante, hoja inferior arrastrable y una
// vista por fase del viaje. La lógica vive en el núcleo (N); aquí solo se pinta.
//
// Modo real (EM.MODO_REAL: app nativa o ?real=1 en TaxiCun): cuenta de TaxiCun
// con correo y código, tiempo real con el servidor (p.bus) y solo pago en
// efectivo. No hay QR de prueba, programados, «MODO PRUEBA», sala ni simulación.
// Sin el modo real todo sigue como en la demo.
import {
  el, esc, $, $$, icono, ICONO_CATEGORIA, avatar, placa, chipPrueba, franjaCuadros, Hoja, crearAvisos,
  modal, elegirOpcion, abrirMenu, estrellas, celularTexto, decimal, ponerTexto, capaRuta, puntoVisible,
  panelEscritorio, limitar, nombreCorto, sinMovimiento, avisoDemo, pintarChipConexion, TEXTO_CONEXION,
} from './ui.js';
import * as EM from './empresa.js';
import { mostrarBienvenida } from './registro.js';
import { abrirMisViajes, abrirProgramados, abrirTarifas, abrirPromociones, abrirAjustes, abrirAyuda, abrirAvisos, abrirMiCuenta } from './pasajero-secciones.js';

const REAL = EM.MODO_REAL;

const MENSAJES_BUSQUEDA = [
  'Avisando a los taxis cercanos…',
  `Tu solicitud les llegó a los conductores de ${EM.NOMBRE}`,
  'Buscando el móvil más cercano a tu punto',
  'Un conductor está revisando tu servicio',
];
// Modo real: solo lo que la app sabe de verdad (no ve si un conductor está revisando).
const MENSAJES_BUSQUEDA_REAL = [
  'Avisando a los taxis cercanos…',
  'Buscando el móvil más cercano a tu punto',
  `Esperamos a que un conductor de ${EM.NOMBRE} acepte`,
];
const SIN_RED_BUSCANDO = 'Sin conexión: enviaremos tu solicitud al reconectar';
// La tarifa se marca «de ejemplo» solo mientras la ficha lo diga (las 76 cooperativas de la
// demo). Con tarifas oficiales (Cootransrural) el chip dice si es oficial, estimada o de referencia.
const TARIFA_EJEMPLO = Boolean(EM.TARIFAS_EJEMPLO);

export async function montar(raiz, { N, diseno = 'a', vitrina = false, taxicun = null }) {
  // Modo real con una sola cooperativa en servicio: «Cambiar de municipio» la volvería a abrir.
  const UNICA = REAL && Boolean(taxicun?.unica);
  raiz.innerHTML = '';
  raiz.classList.add('a-raiz');
  if (EM.FICHA_EQUIVOCADA) {
    EM.pantallaSinFicha(raiz);
    return;
  }
  EM.aplicarColores();
  EM.aplicarFoto(raiz);
  EM.marcarNoIndexar();
  // En la app nativa no va el panel de escritorio (es para abrir la web en el celular).
  if (!vitrina && REAL && !EM.ES_NATIVA) {
    raiz.append(panelEscritorio({
      titulo: `Pide tu taxi en <em>${esc(EM.PUEBLO)}</em>, sin llamar.`,
      texto: `${EM.APP} con los taxis de ${EM.NOMBRE}: ubicación exacta, seguimiento en vivo y código de abordaje. Pagas en efectivo al conductor.`,
      puntos: [
        EM.unir([EM.textoTaxis(), EM.SERVICIO_24H ? 'servicio 24 horas' : ''], ' y ').replace(/^s/, 'S') || `Taxis de la ${EM.TIPO} cerca de ti`,
        'Sabes quién llega: móvil, placa y código', 'Pagas en efectivo, sin sorpresas',
      ],
      url: N.urlApp('pasajero', { d: diseno, real: '1' }),
    }));
  } else if (!vitrina && !REAL) {
    raiz.append(panelEscritorio({
      titulo: `Pide tu taxi en <em>${esc(EM.PUEBLO)}</em>, sin llamar.`,
      texto: EM.EN_TAXICUN
        ? `Demo de ${EM.APP} con los taxis de ${EM.NOMBRE}: ubicación exacta, seguimiento en vivo, código de abordaje y pago con QR de prueba.`
        : `Demo de la app de ${EM.NOMBRE}: ubicación exacta, seguimiento en vivo, código de abordaje y pago con QR de prueba.`,
      puntos: [
        EM.unir([EM.textoTaxis(), EM.SERVICIO_24H ? 'servicio 24 horas' : ''], ' y ').replace(/^s/, 'S') || `Taxis de la ${EM.TIPO} cerca de ti`,
        'Sabes quién llega: móvil, placa y código', 'Programa con 24 h y ahorra 10 %', 'Cada 10 viajes, el siguiente al 50 %',
      ],
      // El QR abre la app de esta cooperativa (no la de otra) con el mismo diseño;
      // dentro de TaxiCun, TaxiCun con esta cooperativa (?e=).
      url: N.urlApp('pasajero', { d: diseno }),
    }));
  }

  const app = el(`<div class="a-app a-pasajero" data-vista="carga">
    <div class="a-pin" aria-hidden="true">
      <span class="a-pin-etiqueta" data-pin-etiqueta>Recoger aquí</span>
      <svg class="a-pin-svg" viewBox="0 0 40 54" width="40" height="54"><path d="M20 52S3 35 3 21a17 17 0 0 1 34 0c0 14-17 31-17 31Z" fill="currentColor" stroke="#fff" stroke-width="2.5"/><circle class="a-pin-centro" cx="20" cy="21" r="7"/></svg>
      <span class="a-pin-sombra"></span>
    </div>
    <header class="a-barra">
      <button class="a-barra-menu" type="button" data-menu aria-label="Abrir menú">
        <span data-avatar>${avatar('')}</span><span class="a-barra-menu-ico">${icono('menu', { tam: 13, grosor: 3 })}</span>
      </button>
      <div class="a-barra-saludo"><small data-saludo>${esc(N.saludo())}</small><strong data-nombre>${esc(EM.NOMBRE)}</strong></div>
      ${EM.EN_TAXICUN ? `<span class="a-tc-sello a-tc-sello-barra" title="${esc(`${EM.APP} · ${EM.NOMBRE}`)}">${EM.iconoApp(20)}<span>${EM.palabraApp()}</span></span>` : ''}
      <button class="a-icono-btn a-barra-campana" type="button" data-campana aria-label="Avisos">${icono('campana')}<span class="a-insignia" data-insignia hidden></span></button>
    </header>
    ${REAL
      ? `<div class="a-chip-red a-reconectando" data-conexion data-estado="sin_conectar" role="status"><span class="a-led"></span><span data-conexion-txt>${TEXTO_CONEXION.sin_conectar}</span></div>`
      : `<div class="a-chip-red${EM.ES_PROPUESTA ? ' a-chip-red-demo' : ''}" data-conexion><span class="a-led"></span><span data-conexion-txt>Solo este equipo</span><b>MODO PRUEBA</b>${avisoDemo()}</div>`}
    <div class="a-banner-puerta" data-banner-puerta hidden role="alert"></div>
    <button class="a-flotante a-btn-ubicacion" type="button" data-mi-ubicacion aria-label="Volver a mi ubicación">${icono('mira')}</button>
  </div>`);
  raiz.append(app);

  const barra = $(app, '.a-barra');
  const arriba = () => barra.offsetTop + barra.offsetHeight;
  const avisos = crearAvisos(app, { alAgregar: () => marcarCampana(1) });
  const hoja = new Hoja(app, {
    etiqueta: 'Panel del viaje',
    tope: () => arriba() + 10,
    alCambiarAlto: () => {
      app.dataset.hoja = hoja?.estado || '';
    },
  });

  // El mapa va de último en el DOM: con teclado se llega primero al menú y al panel.
  const divMapa = el(`<div class="a-mapa" role="region" aria-label="${esc(`Mapa de ${EM.PUEBLO}`)}"></div>`);
  app.append(divMapa);
  // Los marcadores no se tocan ni se enfocan: que el tabulador no pase por cada taxi.
  const L = await N.cargarLeaflet();
  L.Marker.prototype.options.keyboard = false;
  // Las capas de CARTO del núcleo («claro», «suave», «oscuro») hoy devuelven una marca de agua
  // «API KEY REQUIRED»; se usa OpenStreetMap y el estilo claro se logra con un filtro CSS.
  const m = await N.crearMapa(divMapa, { capa: 'claro', controles: false, zoom: 16, colorOrigen: '#15803D', colorDestino: '#121212', colorRuta: '#121212' });
  const ruta = capaRuta(m, { color: '#121212', grosor: 5 });
  let radar = null;

  /* ---------------- estado de la interfaz ---------------- */
  let p = null;
  const ui = {
    modo: 'inicio',
    vista: null,
    fase: null,
    origen: null,
    destino: undefined,
    destinoProvisional: null,
    cotizacion: null,
    reqCot: 0,
    // En modo real solo hay efectivo (el QR es de prueba).
    metodo: REAL || localStorage.getItem(EM.clave('metodo')) === 'efectivo' ? 'efectivo' : 'qr',
    programar: false,
    fecha: null,
    nota: '',
    pinY: 260,
    taxisRef: null,
    yoRef: null,
    centrado: false,
    limpiezas: [],
    ultimoEncuadre: 0,
    sinLeer: 0,
    calif: null,
    etiquetasElegidas: new Set(),
  };

  /* ---------------- utilidades de mapa ---------------- */
  function encuadrar(puntos, { maxZoom = 17 } = {}) {
    const validos = puntos.filter(Boolean).map((x) => (Array.isArray(x) ? x : [x.lat, x.lng]));
    if (!validos.length) return;
    ui.ultimoEncuadre = Date.now();
    const pad = { paddingTopLeft: [44, arriba() + 36], paddingBottomRight: [44, hoja.alto + 36], maxZoom, animate: true };
    if (validos.length === 1) return centrarVisible({ lat: validos[0][0], lng: validos[0][1] }, Math.min(m.mapa.getZoom(), maxZoom));
    m.mapa.fitBounds(m.L.latLngBounds(validos), pad);
  }
  // Pone un punto en el centro de la zona visible (entre la barra y la hoja).
  function centrarVisible(punto, zoom, y = (arriba() + app.clientHeight - hoja.alto) / 2, animar = true) {
    if (!punto) return;
    const z = zoom ?? m.mapa.getZoom();
    const t = m.mapa.getSize();
    const px = m.mapa.project([punto.lat, punto.lng], z).subtract(m.L.point(0, y - t.y / 2));
    m.mapa.setView(m.mapa.unproject(px, z), z, { animate: animar });
  }
  function puntoDelPin() {
    const t = m.mapa.getSize();
    const ll = m.mapa.containerPointToLatLng([t.x / 2, ui.pinY]);
    return { lat: ll.lat, lng: ll.lng };
  }
  function ubicarPin() {
    const media = hoja.limites().media;
    const nuevo = Math.round(arriba() + (app.clientHeight - media - arriba()) / 2 + 22);
    if (Math.abs(nuevo - ui.pinY) > 1 && ui.centrado) m.mapa.panBy([0, ui.pinY - nuevo], { animate: false });
    ui.pinY = nuevo;
    app.style.setProperty('--pin-y', `${nuevo}px`);
  }
  function ponerRadar(punto) {
    quitarRadar();
    radar = m.L.marker([punto.lat, punto.lng], {
      icon: m.L.divIcon({ className: 'a-radar', html: '<span></span><span></span><span></span><i></i>', iconSize: [260, 260], iconAnchor: [130, 130] }),
      interactive: false,
      zIndexOffset: -200,
      keyboard: false,
    }).addTo(m.mapa);
  }
  function quitarRadar() {
    radar?.remove();
    radar = null;
  }

  // Lectura del punto bajo el pin (con espera para no saturar Nominatim).
  let reqDir = 0;
  let esperaPin = null;
  m.alEmpezarAMoverse(() => {
    if (app.dataset.pin) app.classList.add('a-moviendo');
    // Mientras se mueve el mapa no se puede confirmar el punto anterior.
    if (app.dataset.pin === 'destino') {
      const b = $(hoja.pie, '[data-confirmar-destino]');
      if (b) b.disabled = true;
    }
  });
  m.alMoverse(() => {
    app.classList.remove('a-moviendo');
    if (!app.dataset.pin || !ui.centrado) return;
    const tipo = app.dataset.pin;
    const punto = puntoDelPin();
    // Si el punto casi no cambió (por ejemplo, al volver a esta vista), no se vuelve a consultar.
    const previo = tipo === 'origen' ? ui.origen : ui.destinoProvisional;
    if (previo && !previo.provisional && N.distanciaKm(previo, punto) < 0.004) {
      if (tipo === 'destino') pintarPunto('destino', false);
      return;
    }
    if (tipo === 'origen') ui.origen = { ...punto, titulo: ui.origen?.titulo || 'Punto en el mapa', detalle: '', provisional: true };
    else ui.destinoProvisional = { ...punto, titulo: 'Buscando dirección…', detalle: '', provisional: true };
    pintarPunto(tipo, true);
    clearTimeout(esperaPin);
    esperaPin = setTimeout(async () => {
      const n = ++reqDir;
      const d = await N.direccionDe(punto);
      if (n !== reqDir) return;
      const lugar = { lat: punto.lat, lng: punto.lng, titulo: d.titulo, detalle: d.detalle };
      if (tipo === 'origen' && app.dataset.pin === 'origen') ui.origen = lugar;
      if (tipo === 'destino' && app.dataset.pin === 'destino') ui.destinoProvisional = lugar;
      pintarPunto(tipo, false);
    }, 450);
  });

  // Aviso si el punto de recogida cae donde la ficha prohíbe recoger (noRecoger: el parque
  // principal de El Rosal, Decreto 89 de 2026), con un botón para ir al paradero de taxis.
  function revisarRecogida() {
    const aviso = $(hoja.contenido, '[data-aviso-recogida]');
    if (!aviso) return;
    const o = ui.origen;
    const lugar = o && EM.LUGARES_SIN_RECOGIDA.find((l) => N.distanciaKm(o, l) <= 0.06);
    aviso.hidden = !lugar;
    if (lugar) ponerTexto(aviso, '[data-aviso-recogida-txt]', typeof lugar.noRecoger === 'string' ? lugar.noRecoger : `En ${lugar.nombre} no se recogen pasajeros.`);
  }

  function pintarPunto(tipo, cargando) {
    const c = hoja.contenido;
    if (tipo === 'origen') {
      ponerTexto(c, '[data-origen-titulo]', cargando && ui.origen?.provisional ? 'Buscando dirección…' : ui.origen?.titulo || 'Punto en el mapa');
      ponerTexto(c, '[data-origen-detalle]', cargando ? '' : ui.origen?.detalle || '');
      revisarRecogida();
    } else {
      ponerTexto(c, '[data-destino-titulo]', ui.destinoProvisional?.titulo || 'Mueve el mapa');
      ponerTexto(c, '[data-destino-detalle]', cargando ? '' : ui.destinoProvisional?.detalle || '');
      const b = $(hoja.pie, '[data-confirmar-destino]');
      if (b) b.disabled = cargando;
    }
  }

  // Desplaza el contenido de la hoja para que se vea un nodo (sin mover la página).
  function verEnHoja(nodo, donde = 'cerca') {
    const cont = hoja.contenido;
    if (!nodo || !cont.contains(nodo)) return;
    const rc = cont.getBoundingClientRect();
    const rn = nodo.getBoundingClientRect();
    let top = cont.scrollTop;
    if (donde === 'centro') top += rn.top - rc.top - Math.max(12, (rc.height - rn.height) / 2);
    else if (rn.bottom > rc.bottom) top += Math.min(rn.bottom - rc.bottom + 16, rn.top - rc.top - 12);
    else if (rn.top < rc.top) top += rn.top - rc.top - 12;
    cont.scrollTo({ top: Math.max(0, top), behavior: sinMovimiento() ? 'auto' : 'smooth' });
  }

  /* ---------------- barra superior y menú ---------------- */
  function marcarCampana(n) {
    ui.sinLeer += n;
    const b = $(app, '[data-insignia]');
    b.hidden = ui.sinLeer === 0;
    b.textContent = ui.sinLeer > 9 ? '9+' : String(ui.sinLeer);
    $(app, '[data-campana]').setAttribute('aria-label', ui.sinLeer ? `Avisos, ${ui.sinLeer} sin leer` : 'Avisos');
  }
  $(app, '[data-campana]').addEventListener('click', () => {
    ui.sinLeer = 0;
    marcarCampana(0);
    abrirAvisos(ctx());
  });
  $(app, '[data-menu]').addEventListener('click', abrirMenuPasajero);
  // Al volver a la app después de un rato en segundo plano la persona pudo moverse: si está en el
  // inicio y no movió el pin a mano, se vuelve a leer el GPS y el punto de recogida lo sigue.
  m.mapa.on('dragstart', () => {
    if (app.dataset.pin === 'origen') ui.pinAMano = true;
  });
  function escucharVueltaALaApp() {
    let ocultaDesde = 0;
    const alOcultar = () => {
      if (!ocultaDesde) ocultaDesde = Date.now();
    };
    const alVolver = async () => {
      const fuera = ocultaDesde ? Date.now() - ocultaDesde : 0;
      ocultaDesde = 0;
      if (fuera < 20000 || !p || p.estado.fase !== 'inicio' || ui.modo !== 'inicio') return;
      // El GPS se afina unos segundos; 'posicion_afinada' mueve el pin si no se movió a mano.
      p.afinarPosicion();
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? alOcultar() : alVolver()));
    try {
      const appNativa = globalThis.Capacitor?.Plugins?.App;
      appNativa?.addListener?.('pause', alOcultar)?.catch?.(() => {});
      appNativa?.addListener?.('resume', alVolver)?.catch?.(() => {});
    } catch {
      /* sin el plugin App */
    }
  }

  $(app, '[data-mi-ubicacion]').addEventListener('click', async () => {
    const b = $(app, '[data-mi-ubicacion]');
    b.classList.add('a-girando');
    ui.pinAMano = false;
    // Con lo último que se sabe se centra de una vez; el GPS se afina unos segundos más.
    const ultima = p?.estado.miPosicion;
    const pos = ultima?.real ? ultima : p ? await p.actualizarMiPosicion() : await N.obtenerPosicion();
    if (p) {
      p.afinarPosicion();
      setTimeout(() => b.classList.remove('a-girando'), 1500);
    } else b.classList.remove('a-girando');
    m.ponerYo(pos);
    if (pos.real === false) avisos.mostrar({ titulo: 'No tenemos tu GPS', cuerpo: EM.TEXTO_SIN_GPS, tipo: 'info' });
    if (app.dataset.pin) centrarVisible(pos, 17, ui.pinY);
    else centrarVisible(pos, 17);
  });

  function pintarBarra() {
    const yo = N.perfil.pasajero();
    $(app, '[data-avatar]').innerHTML = avatar(yo?.nombre || '');
    ponerTexto(app, '[data-nombre]', yo?.nombre ? nombreCorto(yo.nombre) : EM.NOMBRE);
    ponerTexto(app, '[data-saludo]', N.saludo());
  }

  function abrirMenuPasajero() {
    const yo = N.perfil.pasajero();
    const completados = N.perfil.viajesCompletadosPasajero();
    const fid = EM.fidelidad(completados);
    const programados = REAL ? 0 : N.perfil.viajesProgramados().length;
    const conexion = p?.estado.conexion === 'en-vivo' ? 'En vivo' : 'Solo este equipo';
    // Modo real: estado del tiempo real con el servidor (sin sala ni «MODO PRUEBA»).
    const estadoBus = p?.bus?.estado || 'sin_conectar';
    abrirMenu(app, {
      cabeza: REAL
        ? `${franjaCuadros()}
        <div class="a-menu-perfil">${avatar(yo?.nombre || '', 'a-avatar-grande')}
          <div><strong>${esc(yo?.nombre || 'Pasajero')}</strong><span class="a-menu-correo">${esc(yo?.correo || '')}</span>
          <span class="a-menu-cal">${icono('check', { tam: 14, grosor: 3 })} Correo verificado</span></div>
        </div>`
        : `${franjaCuadros()}
        <div class="a-menu-perfil">${avatar(yo?.nombre || '', 'a-avatar-grande')}
          <div><strong>${esc(yo?.nombre || 'Pasajero')}</strong><span>+57 ${esc(celularTexto(yo?.celular || ''))}</span>
          <span class="a-menu-cal">${icono('estrella', { tam: 14 })} ${decimal(yo?.calificacion || 5)} · ${yo?.verificado ? 'Celular verificado' : 'Pasajero'}</span></div>
        </div>`,
      items: [
        REAL && { icono: 'usuario', texto: 'Mi cuenta', detalle: yo?.correo || 'Tus datos y tu sesión', accion: () => abrirMiCuenta(ctx()) },
        { icono: 'reloj', texto: 'Mis viajes', detalle: completados ? `${completados} ${completados === 1 ? 'viaje completado' : 'viajes completados'}` : 'Tu historial', accion: () => abrirMisViajes(ctx()) },
        // El servidor no tiene viajes programados: en modo real no se ofrecen.
        !REAL && { icono: 'calendario', texto: 'Programados', detalle: 'Con 24 h: 10 % menos', insignia: programados ? String(programados) : '', accion: () => abrirProgramados(ctx()) },
        { icono: 'ruta', texto: 'Tarifas y rutas', detalle: TARIFA_EJEMPLO ? 'Valores de ejemplo' : N.FUENTE_TARIFAS ? `Tarifas oficiales · ${N.FUENTE_TARIFAS.acto}` : `Tarifas de ${EM.NOMBRE}`, accion: () => abrirTarifas(ctx()) },
        // Modo real: sin tarjeta de viajes ni programados, Promociones quedaría vacío.
        !REAL && { icono: 'regalo', texto: 'Promociones', detalle: !fid ? `Ofertas de la ${EM.TIPO}` : fid.siguienteConDescuento ? '¡Tu próximo viaje va al 50 %!' : `Tarjeta de viajes: ${fid.completados}/${fid.meta}`, accion: () => abrirPromociones(ctx()) },
        { icono: 'ajustes', texto: 'Ajustes', detalle: !REAL ? 'Diseño, sala, sonido, instalar' : EM.ES_NATIVA ? 'Sonido y tu cuenta' : 'Sonido, avisos y tu cuenta', accion: () => abrirAjustes(ctx()) },
        { icono: 'ayuda', texto: 'Ayuda', detalle: EM.TELEFONO ? `Central${EM.SERVICIO_24H ? ' 24 h' : ''} · ${EM.TELEFONO_VISIBLE}` : 'Preguntas frecuentes y contacto', accion: () => abrirAyuda(ctx()) },
        { separador: true },
        EM.EN_TAXICUN && !UNICA && { icono: 'pin', texto: 'Cambiar de municipio', detalle: `Ahora: ${EM.PUEBLO} · ${EM.NOMBRE}`, accion: cambiarMunicipio },
        // En la app nativa los conductores tienen su propia app.
        !EM.ES_NATIVA && { icono: 'volante', texto: 'Soy conductor', detalle: 'Abrir la app de conductores', href: EM.urlOtraApp('conductor', diseno), clase: 'a-menu-marca' },
        { icono: 'salir', texto: 'Cerrar sesión', accion: () => cerrarSesion(), clase: 'a-menu-peligro' },
      ].filter(Boolean),
      pie: `<div class="a-menu-pie-marca">${EM.marcaIcono(30)}<div><strong>${esc(EM.NOMBRE_LARGO)}</strong>${EM.LEMA ? `<small>${esc(EM.LEMA)}</small>` : ''}</div></div>
        ${EM.EN_TAXICUN ? `<div class="a-menu-pie-tc">${EM.iconoApp(18)}<span>${esc(EM.TEXTO_DESARROLLO)}</span></div>` : ''}
        ${REAL
          ? `<div class="a-menu-pie-estado"><span><span class="a-led ${estadoBus === 'en_linea' ? 'a-led-vivo' : ''}"></span>${esc(TEXTO_CONEXION[estadoBus] || TEXTO_CONEXION.sin_conectar)}</span></div>`
          : `<div class="a-menu-pie-estado">${chipPrueba('MODO PRUEBA')}${avisoDemo('a-chip-demo a-chip-demo-claro')}<span><span class="a-led ${p?.estado.conexion === 'en-vivo' ? 'a-led-vivo' : ''}"></span>${conexion} · sala «${esc(p?.estado.sala || N.salaActual())}»</span></div>`}`,
    });
  }

  async function cerrarSesion({ alTerminar = null } = {}) {
    if (p && !['inicio'].includes(p.estado.fase)) {
      avisos.mostrar({ titulo: 'Tienes un viaje en curso', cuerpo: 'Termínalo o cancélalo antes de cerrar sesión.', tipo: 'alerta' });
      return;
    }
    if (REAL) {
      const ok = await modal(app, {
        titulo: '¿Cerrar sesión?',
        texto: 'Para volver a pedir taxi ingresas con tu correo. Tu historial de viajes se conserva en este celular, salvo que entre otra cuenta.',
        acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cerrar sesión', valor: true, clase: 'a-btn-peligro' }],
      });
      if (!ok) return;
      conSesion = false;
      const quitar = procesando('Cerrando sesión…');
      await N.servidor.salir();
      quitar();
      alTerminar?.();
      terminarSesionLocal();
      return;
    }
    const ok = await modal(app, {
      titulo: '¿Cerrar sesión?',
      texto: 'Tus datos de registro se borran de este celular. Tu historial de viajes se conserva.',
      acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cerrar sesión', valor: true, clase: 'a-btn-peligro' }],
    });
    if (!ok) return;
    N.perfil.cerrarSesionPasajero();
    pintarBarra();
    mostrarBienvenida(app, { N, alTerminar: alRegistrarse });
  }

  // Solo en modo real: borra la cuenta en el servidor (DELETE /api/yo) y los datos
  // de este celular, y vuelve al ingreso. Si falla, no se borra nada.
  async function eliminarCuenta({ alTerminar = null } = {}) {
    if (p && p.estado.fase !== 'inicio') {
      avisos.mostrar({ titulo: 'Tienes un viaje en curso', cuerpo: 'Termínalo o cancélalo antes de eliminar tu cuenta.', tipo: 'alerta' });
      return;
    }
    const ok = await modal(app, {
      titulo: '¿Eliminar tu cuenta?',
      texto: `Borramos tu nombre, correo y celular de ${EM.APP} y cerramos tu sesión en todos tus equipos. Tus viajes quedan sin datos personales para la ${EM.TIPO}. Esto no se puede deshacer.`,
      icono: `<span class="a-sos-ico">${icono('basura', { tam: 32 })}</span>`,
      clase: 'a-modal-sos',
      acciones: [{ texto: 'Eliminar mi cuenta', valor: true, clase: 'a-btn-peligro', icono: 'basura' }, { texto: 'Cancelar', valor: false, clase: 'a-btn-suave' }],
    });
    if (!ok) return;
    // El servidor cierra el tiempo real con «sesión cerrada»: no es un cierre inesperado.
    const antes = conSesion;
    conSesion = false;
    const quitar = procesando('Eliminando tu cuenta…');
    try {
      await N.servidor.eliminarCuenta();
    } catch (err) {
      quitar();
      if (err?.codigo === 'sin_sesion') {
        alTerminar?.();
        avisos.mostrar({ titulo: 'Tu sesión se cerró', cuerpo: 'Ingresa de nuevo con tu correo para eliminar tu cuenta.', tipo: 'alerta' });
        terminarSesionLocal();
        return;
      }
      conSesion = antes;
      avisos.mostrar({ titulo: 'No pudimos eliminar tu cuenta', cuerpo: EM.textoError(err), tipo: 'error' });
      return;
    }
    quitar();
    alTerminar?.();
    terminarSesionLocal({ borrarTodo: true });
    avisos.mostrar({ titulo: 'Tu cuenta se eliminó', cuerpo: `Borramos tus datos de ${EM.APP} y de este celular.`, tipo: 'exito' });
  }

  // Capa de espera sobre la app (cerrar sesión, eliminar cuenta). Devuelve cómo quitarla.
  function procesando(texto) {
    const capa = el(`<div class="a-procesando" role="status"><div class="a-procesando-caja"><span class="a-girador a-girador-grande"></span><strong>${esc(texto)}</strong></div></div>`);
    app.append(capa);
    return () => capa.remove();
  }

  // Solo dentro de TaxiCun: vuelve a la lista de municipios (no con un viaje en curso).
  function cambiarMunicipio() {
    if (p && p.estado.fase !== 'inicio') {
      avisos.mostrar({ titulo: 'Tienes un viaje en curso', cuerpo: 'Termínalo o cancélalo antes de cambiar de municipio.', tipo: 'alerta' });
      return;
    }
    location.href = EM.urlCambiarMunicipio('pasajero');
  }

  function ctx() {
    return {
      N, app, p, avisos, diseno, hoja, cambiarMunicipio, unica: UNICA,
      // Modo real: «Mi cuenta» y Ajustes → Tu cuenta.
      cerrarSesion: REAL ? cerrarSesion : null,
      eliminarCuenta: REAL ? eliminarCuenta : null,
      alActualizar: datosActualizados,
      programarViaje: () => {
        ui.programar = true;
        ui.fecha = fechaPorDefecto();
        abrirBuscador();
      },
      // Pedir a un destino de la tabla oficial de tarifas (desde «Tarifas y rutas»).
      puedePedir: ui.modo === 'inicio' && Boolean(ui.origen) && (!p || p.estado.fase === 'inicio'),
      pedirA: (destino) => {
        if (ui.modo !== 'inicio' || !ui.origen || (p && p.estado.fase !== 'inicio')) return;
        irAConfirmar(destino);
      },
    };
  }

  /* ---------------- búsqueda de destino (pantalla completa) ---------------- */
  function aLugar(l) {
    return { titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng, cat: l.cat };
  }
  function filaLugar(l, i, extra = '') {
    const cat = l.cat || N.LUGARES.find((x) => x.nombre === l.titulo)?.cat;
    const ico = l.reciente ? 'reloj' : cat ? ICONO_CATEGORIA[cat] : 'pin';
    const km = ui.origen ? N.kmTexto(N.distanciaKm(ui.origen, l)) : '';
    return `<li><button type="button" class="a-fila" data-i="${i}">
      <span class="a-fila-ico">${icono(ico, { tam: 20 })}</span>
      <span class="a-fila-txt"><strong>${esc(l.titulo)}</strong><small>${esc(l.detalle || '')}</small></span>
      ${extra || (km ? `<span class="a-fila-km">${esc(km)}</span>` : '')}
    </button></li>`;
  }

  function abrirBuscador({ guardar = null } = {}) {
    const anterior = document.activeElement;
    const titulo = guardar === 'casa' ? 'Guarda la dirección de tu casa' : guardar === 'trabajo' ? 'Guarda la dirección de tu trabajo' : '¿A dónde vas?';
    const panel = el(`<section class="a-buscador" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <header class="a-buscador-cabeza">
        <div class="a-buscador-top">
          <button class="a-icono-btn" type="button" data-cerrar aria-label="Cerrar la búsqueda">${icono('atras')}</button>
          <h2>${esc(guardar ? titulo : 'Elige tu destino')}</h2>
          ${ui.programar ? `<span class="a-chip-prog">${icono('calendario', { tam: 14 })} Programado</span>` : ''}
        </div>
        <div class="a-buscador-campos">
          <div class="a-buscador-fila"><span class="a-punto a-punto-verde" aria-hidden="true"></span><span class="a-trunca"><small>Recogida</small>${esc(ui.origen?.titulo || 'Tu ubicación')}</span></div>
          <div class="a-buscador-fila a-buscador-activa"><span class="a-punto a-punto-negro" aria-hidden="true"></span>
            <input type="search" data-q placeholder="${guardar ? 'Busca la dirección' : 'Busca un lugar o dirección'}" aria-label="${esc(titulo)}" autocomplete="off" enterkeyhint="search" spellcheck="false">
            <button type="button" class="a-limpiar" data-limpiar aria-label="Borrar el texto" hidden>${icono('cerrar', { tam: 16 })}</button>
          </div>
        </div>
        <div class="a-buscador-atajos">
          ${guardar
            ? `<button type="button" class="a-atajo" data-usar-origen>${icono('mira', { tam: 18 })} Usar mi punto de recogida</button>`
            : `<button type="button" class="a-atajo" data-en-mapa>${icono('mapa', { tam: 18 })} Elegir en el mapa</button>
               <button type="button" class="a-atajo" data-sin-destino>${icono('chat', { tam: 18 })} Se lo digo al conductor</button>`}
        </div>
      </header>
      <div class="a-buscador-cuerpo" data-cuerpo></div>
    </section>`);
    app.append(panel);
    const cuerpo = $(panel, '[data-cuerpo]');
    const q = $(panel, '[data-q]');
    let lista = [];
    let catActual = 'centro';
    let consulta = 0;

    let elegido = false;
    const cerrar = () => {
      panel.classList.remove('a-abierto');
      document.removeEventListener('keydown', teclas);
      setTimeout(() => panel.remove(), 280);
      anterior?.focus?.({ preventScroll: true });
    };
    // Cerrar sin elegir nada deja la pantalla como estaba (sin «Programar»).
    const salir = () => {
      if (!elegido && !guardar && ui.modo === 'inicio') ui.programar = false;
      cerrar();
    };
    const teclas = (e) => {
      if (e.key === 'Escape') salir();
    };
    document.addEventListener('keydown', teclas);
    const elegir = (l) => {
      elegido = true;
      const lugar = { titulo: l.titulo, detalle: l.detalle || '', lat: l.lat, lng: l.lng };
      if (guardar) {
        N.perfil.guardarLugar(guardar, lugar);
        avisos.mostrar({ titulo: guardar === 'casa' ? 'Casa guardada' : 'Trabajo guardado', cuerpo: lugar.titulo, tipo: 'exito' });
        cerrar();
        if (ui.vista === 'inicio') renderVista('inicio', true);
        return;
      }
      cerrar();
      irAConfirmar(lugar);
    };

    function sugerencias() {
      const g = N.perfil.lugaresGuardados();
      const rec = N.perfil.recientes().slice(0, 5).map((r) => ({ ...r, reciente: true }));
      const cats = Object.entries(N.CATEGORIAS);
      const delCat = N.LUGARES.filter((l) => l.cat === catActual).map(aLugar);
      lista = [];
      const agregar = (arr) => arr.map((l) => { lista.push(l); return filaLugar(l, lista.length - 1); }).join('');
      let html = '';
      if (!guardar) {
        const guardados = [];
        for (const tipo of ['casa', 'trabajo']) {
          if (g[tipo]) {
            lista.push(g[tipo]);
            guardados.push(`<li><button type="button" class="a-fila" data-i="${lista.length - 1}"><span class="a-fila-ico a-fila-ico-ambar">${icono(tipo, { tam: 20 })}</span><span class="a-fila-txt"><strong>${tipo === 'casa' ? 'Casa' : 'Trabajo'}</strong><small>${esc(g[tipo].titulo)}</small></span></button></li>`);
          } else {
            guardados.push(`<li><button type="button" class="a-fila" data-guardar="${tipo}"><span class="a-fila-ico">${icono(tipo, { tam: 20 })}</span><span class="a-fila-txt"><strong>Agregar ${tipo === 'casa' ? 'casa' : 'trabajo'}</strong><small>Para pedir con un toque</small></span><span class="a-fila-km">${icono('mas', { tam: 18 })}</span></button></li>`);
          }
        }
        html += `<section class="a-grupo"><h3>Guardados</h3><ul class="a-filas">${guardados.join('')}</ul></section>`;
        if (rec.length) html += `<section class="a-grupo"><h3>Recientes</h3><ul class="a-filas">${agregar(rec)}</ul></section>`;
      }
      html += `<section class="a-grupo"><h3>Lugares frecuentes</h3>
        <div class="a-cats" role="tablist" aria-label="Categorías">${cats.map(([k, c]) => `<button type="button" role="tab" class="a-cat" data-cat="${k}" aria-selected="${k === catActual}">${icono(ICONO_CATEGORIA[k], { tam: 16 })}${esc(c.nombre)}</button>`).join('')}</div>
        <ul class="a-filas" data-lista-cat>${agregar(delCat)}</ul></section>`;
      cuerpo.innerHTML = html;
    }

    // ofrecerMapa (modo real): todavía no se buscó en el mapa; se ofrece hacerlo.
    function resultados(items, { cargando = false, ofrecerMapa = false } = {}) {
      lista = items;
      const texto = q.value.trim();
      cuerpo.innerHTML = `<section class="a-grupo">
        <ul class="a-filas" role="list">${items.map((l, i) => filaLugar(l, i)).join('')}</ul>
        ${cargando ? `<p class="a-buscando-mas"><span class="a-girador"></span> Buscando más direcciones en el mapa…</p>` : ''}
        ${ofrecerMapa ? `<button type="button" class="a-btn a-btn-suave a-btn-bloque" data-buscar-mapa>${icono('buscar', { tam: 18 })} Buscar «${esc(texto)}» en el mapa</button>` : ''}
        ${!cargando && !ofrecerMapa && !items.length ? `<div class="a-sin-resultados">${icono('buscar', { tam: 28 })}<p>No encontramos «${esc(texto)}».</p><button type="button" class="a-btn a-btn-suave" data-en-mapa-2>${icono('mapa', { tam: 18 })} Elegir en el mapa</button></div>` : ''}
      </section>`;
    }

    // Modo real: el servicio de direcciones de OpenStreetMap (Nominatim) no permite
    // autocompletar mientras se escribe desde la app. Se busca al tocar «Buscar en el
    // mapa» o Enter; mientras se escribe, solo los lugares frecuentes de la ficha.
    let buscadoEnMapa = '';
    async function buscarEnMapa(texto) {
      if (texto.length < 3) return;
      buscadoEnMapa = texto;
      const n = ++consulta;
      resultados(N.buscarLocal(texto), { cargando: true });
      const r = await N.buscarDirecciones(texto, { cerca: ui.origen || N.CENTRO });
      if (n !== consulta || q.value.trim() !== texto) return;
      resultados(r);
    }

    const buscarRemoto = N.antirrebote ? N.antirrebote(async (texto) => {
      const n = ++consulta;
      const r = await N.buscarDirecciones(texto, { cerca: ui.origen || N.CENTRO });
      if (n !== consulta || q.value.trim() !== texto) return;
      resultados(r);
    }, 380) : null;

    q.addEventListener('input', () => {
      const texto = q.value.trim();
      $(panel, '[data-limpiar]').hidden = !q.value;
      if (!texto) {
        consulta++;
        sugerencias();
        return;
      }
      const locales = N.buscarLocal(texto);
      if (REAL) {
        consulta++;
        buscadoEnMapa = '';
        resultados(locales, { ofrecerMapa: texto.length >= 3 });
        return;
      }
      resultados(locales, { cargando: texto.length >= 3 });
      if (texto.length >= 3) buscarRemoto(texto);
    });
    q.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const texto = q.value.trim();
      // Modo real: Enter busca en el mapa (si no se ha buscado ese texto todavía).
      if (REAL && texto.length >= 3 && buscadoEnMapa !== texto) {
        e.preventDefault();
        buscarEnMapa(texto);
        return;
      }
      if (lista[0] && texto) elegir(lista[0]);
    });
    $(panel, '[data-limpiar]').addEventListener('click', () => {
      q.value = '';
      q.dispatchEvent(new Event('input'));
      q.focus();
    });
    panel.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-cerrar]')) return salir();
      if (t.closest('[data-buscar-mapa]')) return buscarEnMapa(q.value.trim());
      const cat = t.closest('[data-cat]');
      if (cat) {
        catActual = cat.dataset.cat;
        sugerencias();
        $(panel, `[data-cat="${catActual}"]`)?.focus();
        return;
      }
      const g = t.closest('[data-guardar]');
      if (g) {
        cerrar();
        setTimeout(() => abrirBuscador({ guardar: g.dataset.guardar }), 300);
        return;
      }
      if (t.closest('[data-en-mapa], [data-en-mapa-2]')) {
        elegido = true;
        cerrar();
        ui.destinoProvisional = null;
        ui.modo = 'elegir-destino';
        pintar();
        return;
      }
      if (t.closest('[data-sin-destino]')) {
        elegido = true;
        cerrar();
        irAConfirmar(null);
        return;
      }
      if (t.closest('[data-usar-origen]') && ui.origen) {
        elegir(ui.origen);
        return;
      }
      const fila = t.closest('[data-i]');
      if (fila) elegir(lista[Number(fila.dataset.i)]);
    });
    sugerencias();
    requestAnimationFrame(() => {
      panel.classList.add('a-abierto');
      q.focus({ preventScroll: true });
    });
  }

  function irAConfirmar(destino) {
    ui.destino = destino;
    ui.cotizacion = null;
    ui.modo = 'confirmar';
    pintar();
  }

  function fechaPorDefecto() {
    const f = new Date(Date.now() + 24 * 3600 * 1000 + 10 * 60 * 1000);
    f.setMinutes(Math.ceil(f.getMinutes() / 15) * 15, 0, 0);
    return f;
  }
  const aLocal = (f) => {
    const d = new Date(f.getTime() - f.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  };

  /* ---------------- piezas repetidas ---------------- */
  // Seis lugares frecuentes para la pantalla de inicio: primero los conocidos de
  // Cootransrural (si existen en la ficha) y luego uno por categoría, sin repetir.
  function lugaresDestacados(cuantos = 6) {
    const lista = [];
    const usados = new Set();
    const agregar = (l) => {
      const llave = String(l?.nombre || '').toLowerCase();
      if (!l || lista.length >= cuantos || usados.has(l.id) || usados.has(llave)) return;
      usados.add(l.id);
      usados.add(llave);
      lista.push(l);
    };
    const lugares = (N.LUGARES || []).filter((l) => l && l.nombre && Number.isFinite(l.lat) && Number.isFinite(l.lng));
    ['parque', 'tierra-grata', 'puesto-salud', 'el-rey', 'rotonda', 'facatativa'].forEach((k) => agregar(lugares.find((l) => l.id === k)));
    for (const cat of ['centro', 'salud', 'comercio', 'barrio', 'educacion', 'vereda', 'comida', 'municipio', 'bogota']) {
      agregar(lugares.find((l) => l.cat === cat && !usados.has(l.id)));
    }
    lugares.forEach(agregar);
    return lista;
  }

  // Tarjeta de la central: solo es un enlace para llamar si hay teléfono.
  function bloqueCentral() {
    const titulo = EM.SERVICIO_24H ? 'Central 24 horas' : `Central de ${EM.NOMBRE}`;
    const taxis = EM.textoTaxis(` en ${EM.PUEBLO}`);
    if (EM.TELEFONO) {
      return `<a class="a-central" href="tel:${esc(EM.TELEFONO)}">${icono('telefono', { tam: 20 })}<span><strong>${esc(titulo)}</strong><small>${esc(EM.unir([EM.TELEFONO_VISIBLE, taxis]))}</small></span>${icono('adelante', { tam: 18 })}</a>`;
    }
    return `<div class="a-central a-central-sin">${icono('telefono', { tam: 20 })}<span><strong>${esc(titulo)}</strong><small>${esc(EM.unir(['Teléfono de la central: pronto', taxis]))}</small><small>Mientras tanto, pide tu taxi desde la app.</small></span></div>`;
  }

  function trayecto(origen, destino, { datos = true } = {}) {
    return `<div class="a-trayecto">
      <div class="a-trayecto-linea" aria-hidden="true"></div>
      <div class="a-trayecto-punto"><span class="a-punto a-punto-verde" aria-hidden="true"></span><span><small>Recogida</small><strong>${esc(origen?.titulo || 'Punto en el mapa')}</strong></span></div>
      <div class="a-trayecto-punto"><span class="a-punto a-punto-negro" aria-hidden="true"></span><span><small>Destino</small><strong>${destino ? esc(destino.titulo || 'Punto en el mapa') : 'Se lo digo al conductor'}</strong></span></div>
      ${datos ? '<div class="a-trayecto-datos" data-ruta-datos></div>' : ''}
    </div>`;
  }

  function tarjetaConductor(c) {
    // En modo real la calificación y los viajes salen del servidor: si no vienen, no se inventan.
    const conCal = !REAL || Number(c.calificacion) > 0;
    const conViajes = !REAL || Number.isFinite(Number(c.viajes)) && c.viajes != null;
    return `<div class="a-tarjeta-conductor">
      <div class="a-conductor-fila">
        <span class="a-conductor-foto">${avatar(c.nombre, 'a-avatar-grande')}${conCal ? `<span class="a-conductor-cal">${icono('estrella', { tam: 11 })}${decimal(c.calificacion)}</span>` : ''}</span>
        <span class="a-conductor-datos">
          <strong>${esc(c.nombre)}</strong>
          <small>${conViajes ? `${Number(c.viajes || 0).toLocaleString('es-CO')} viajes · ` : ''}${esc(c.vehiculo || EM.VEHICULO)} ${esc((c.color || '').toLowerCase())}</small>
        </span>
        <span class="a-movil" aria-label="Móvil ${esc(c.movil)}"><small>MÓVIL</small><b>${esc(c.movil)}</b></span>
      </div>
      <div class="a-conductor-placa">${placa(c.placa)}<span>Verifica la <b>placa</b> y el <b>número de móvil</b> antes de subir.</span></div>
    </div>`;
  }

  function codigoAbordaje(codigo, grande = false) {
    return `<div class="a-codigo ${grande ? 'a-codigo-grande' : ''}">
      <span class="a-codigo-txt"><small>Código de abordaje</small><strong>Díselo al conductor</strong></span>
      <span class="a-codigo-digitos" role="text" aria-label="Código ${esc(String(codigo).split('').join(' '))}" data-codigo="${esc(codigo)}">${String(codigo).split('').map((d) => `<b>${esc(d)}</b>`).join('')}</span>
    </div>`;
  }

  // Modo real: ¿la solicitud espera conexión? (el bus no está en línea o quedó en la cola)
  function sinRedBuscando() {
    return Boolean(p) && (p.bus?.estado !== 'en_linea' || Boolean(p.estado.viaje?.enCola));
  }
  function textoBuscandoReal(i) {
    return sinRedBuscando() ? SIN_RED_BUSCANDO : MENSAJES_BUSQUEDA_REAL[i % MENSAJES_BUSQUEDA_REAL.length];
  }

  function acciones(c) {
    const yo = N.perfil.pasajero();
    // Con la cuenta de los revisores de las tiendas el conductor es automático: sin su celular no se
    // ofrece la central real de la cooperativa.
    const tel = String(c.tel || (p?.revision ? '' : EM.TELEFONO) || '').replace(/\D/g, '');
    const wa = c.tel ? N.enlaceWhatsApp(c.tel, `Hola ${nombreCorto(c.nombre)}, soy ${nombreCorto(yo?.nombre || '')}, el pasajero de ${EM.NOMBRE}.`) : '';
    // En modo real el celular es el que manda la central, aunque caiga en el rango de la demo.
    if (!REAL && N.esTelDemo(c.tel)) {
      return `<div class="a-acciones">
      <button type="button" class="a-accion" data-llamada-demo>${icono('telefono')}<span>Llamar</span></button>
      <button type="button" class="a-accion" data-llamada-demo>${icono('chat')}<span>WhatsApp</span></button>
      <button type="button" class="a-accion" data-compartir>${icono('compartir')}<span>Compartir</span></button>
      <button type="button" class="a-accion a-accion-sos" data-sos>${icono('sos')}<span>SOS</span></button>
    </div>`;
    }
    return `<div class="a-acciones">
      ${tel ? `<a class="a-accion" href="tel:${esc(tel)}">${icono('telefono')}<span>Llamar</span></a>` : ''}
      ${wa ? `<a class="a-accion" href="${esc(wa)}" target="_blank" rel="noopener">${icono('chat')}<span>WhatsApp</span></a>` : ''}
      <button type="button" class="a-accion" data-compartir>${icono('compartir')}<span>Compartir</span></button>
      <button type="button" class="a-accion a-accion-sos" data-sos>${icono('sos')}<span>SOS</span></button>
    </div>`;
  }

  async function compartir() {
    const texto = p.textoCompartir();
    if (!texto) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Mi viaje en ${EM.NOMBRE}`, text: texto });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    window.open(N.enlaceWhatsApp('', texto), '_blank', 'noopener');
  }

  async function sos() {
    const yo = N.perfil.pasajero();
    const contacto = yo?.contactoEmergencia;
    const acc = [
      { texto: 'Llamar a la Línea 123', href: 'tel:123', clase: 'a-btn-peligro', icono: 'telefono' },
      contacto?.celular ? { texto: `Avisar a ${contacto.nombre || 'mi contacto'}`, href: N.enlaceWhatsApp(contacto.celular, `🆘 Necesito ayuda.\n${p.textoCompartir()}`), externo: true, clase: 'a-btn-tinta', icono: 'chat' } : null,
      EM.TELEFONO ? { texto: `Llamar a la central ${EM.NOMBRE}`, href: `tel:${EM.TELEFONO}`, clase: 'a-btn-suave', icono: 'telefono' } : null,
      { texto: 'Cancelar', valor: null, clase: 'a-btn-texto' },
    ].filter(Boolean);
    await modal(app, {
      titulo: '¿Necesitas ayuda?',
      texto: 'Si estás en peligro, llama a la Línea 123 de la Policía. También puedes compartir tu viaje.',
      icono: `<span class="a-sos-ico">${icono('sos', { tam: 34 })}</span>`,
      clase: 'a-modal-sos',
      acciones: acc,
    });
  }

  async function cancelarViaje() {
    const motivo = await elegirOpcion(app, { titulo: '¿Por qué cancelas?', texto: 'Le avisamos al conductor de inmediato.', opciones: N.MOTIVOS_CANCELACION.pasajero, confirmar: 'Cancelar servicio', clasePeligro: true });
    if (motivo) p.cancelar(motivo);
  }

  /* ---------------- vistas ---------------- */
  const VISTAS = {
    carga: {
      altura: 'media',
      html: () => `<div class="a-cargando"><span class="a-girador"></span><div><strong>Ubicándote…</strong><small>Buscando tu posición con el GPS</small></div></div>
        <div class="a-esqueleto" style="height:58px"></div><div class="a-esqueleto" style="height:40px;width:70%"></div>`,
    },

    inicio: {
      altura: 'media',
      pin: 'origen',
      peek: 90,
      html() {
        const g = N.perfil.lugaresGuardados();
        const rec = N.perfil.recientes().slice(0, 3);
        const fid = EM.fidelidad(p.viajesCompletados());
        const prog = REAL ? [] : N.perfil.viajesProgramados();
        const chips = [
          g.casa ? `<button type="button" class="a-chip" data-lugar="casa">${icono('casa', { tam: 16 })}<span>Casa</span></button>` : `<button type="button" class="a-chip a-chip-vacio" data-guardar="casa">${icono('casa', { tam: 16 })}<span>Casa</span>${icono('mas', { tam: 14 })}</button>`,
          g.trabajo ? `<button type="button" class="a-chip" data-lugar="trabajo">${icono('trabajo', { tam: 16 })}<span>Trabajo</span></button>` : `<button type="button" class="a-chip a-chip-vacio" data-guardar="trabajo">${icono('trabajo', { tam: 16 })}<span>Trabajo</span>${icono('mas', { tam: 14 })}</button>`,
          ...rec.map((r, i) => `<button type="button" class="a-chip" data-reciente="${i}">${icono('reloj', { tam: 16 })}<span>${esc(r.titulo)}</span></button>`),
        ];
        const anillo = 2 * Math.PI * 19;
        const frac = !fid ? 0 : fid.siguienteConDescuento ? 1 : fid.completados / fid.meta;
        const destacados = lugaresDestacados();
        return `
          <div class="a-recoger" data-arrastre>
            <span class="a-punto a-punto-verde a-punto-vivo" aria-hidden="true"></span>
            <span class="a-recoger-txt"><small>Te recogemos en</small><strong data-origen-titulo>${esc(ui.origen?.titulo || 'Buscando dirección…')}</strong></span>
            <span class="a-recoger-ayuda">${icono('mapa', { tam: 14 })} Mueve el mapa</span>
          </div>
          <div class="a-aviso-gps" data-aviso-gps hidden>${icono('info', { tam: 18 })}<span>${esc(EM.TEXTO_SIN_GPS)}</span></div>
          ${EM.LUGARES_SIN_RECOGIDA.length ? `<div class="a-aviso-gps a-aviso-recogida" data-aviso-recogida hidden role="status">${icono('alerta', { tam: 18 })}<span><span data-aviso-recogida-txt></span>${N.PARADERO ? ` <button type="button" class="a-btn-texto a-ir-paradero" data-ir-paradero>Ir al paradero</button>` : ''}</span></div>` : ''}
          <div class="a-campo-destino">
            <button type="button" class="a-campo-destino-btn" data-buscar>${icono('buscar', { tam: 22, grosor: 2.4 })}<span>¿A dónde vas?</span></button>
            ${REAL ? '' : `<button type="button" class="a-campo-prog" data-programar aria-label="Programar un viaje">${icono('calendario', { tam: 18 })}<span>Programar</span></button>`}
          </div>
          <div class="a-chips" role="list">${chips.join('')}</div>
          ${fid ? `<button type="button" class="a-fid-mini" data-promos>
            <span class="a-anillo" aria-hidden="true"><svg viewBox="0 0 44 44" width="46" height="46"><circle cx="22" cy="22" r="19" class="a-anillo-fondo"/><circle cx="22" cy="22" r="19" class="a-anillo-valor" style="stroke-dasharray:${anillo};stroke-dashoffset:${anillo * (1 - frac)}"/></svg><b>${fid.siguienteConDescuento ? '50&nbsp;%' : `${fid.completados}/${fid.meta}`}</b></span>
            <span class="a-fid-mini-txt"><strong>${fid.siguienteConDescuento ? '¡Tu próximo viaje va al 50 %!' : 'Tarjeta de viajes'}</strong><small>${fid.siguienteConDescuento ? 'Se aplica solo al pedir tu taxi' : `Te ${fid.faltan === 1 ? 'falta 1 viaje' : `faltan ${fid.faltan} viajes`} para uno al 50 %`}</small></span>
            ${icono('adelante', { tam: 18 })}
          </button>` : ''}
          <div data-corte></div>
          ${prog.length ? `<button type="button" class="a-prog-aviso" data-ver-programados>${icono('calendario', { tam: 20 })}<span><strong>${prog.length} ${prog.length === 1 ? 'viaje programado' : 'viajes programados'}</strong><small>El próximo: ${esc(N.fechaTexto(prog[0].fecha))}, ${esc(N.horaTexto(prog[0].fecha))}</small></span>${icono('adelante', { tam: 18 })}</button>` : ''}
          <section class="a-bloque">
            <h3>Lugares frecuentes</h3>
            <div class="a-rejilla-lugares">${destacados.map((l) => `<button type="button" class="a-lugar" data-frecuente="${esc(l.id)}"><span class="a-lugar-ico">${icono(ICONO_CATEGORIA[l.cat], { tam: 20 })}</span><strong>${esc(l.nombre)}</strong><small>${esc(l.detalle)}</small></button>`).join('')}</div>
            <button type="button" class="a-btn a-btn-suave a-btn-bloque" data-buscar>${icono('buscar', { tam: 18 })} Ver todos los lugares</button>
          </section>
          <section class="a-bloque">
            ${REAL ? '' : `<div class="a-promo">
              <span class="a-promo-ico">${icono('calendario', { tam: 22 })}</span>
              <span><strong>Programa con 24 horas</strong><small>y paga 10 % menos en tu viaje.</small></span>
              <button type="button" class="a-btn a-btn-tinta a-btn-chico" data-programar>Programar</button>
            </div>`}
            ${bloqueCentral()}
          </section>`;
      },
      montar(c) {
        const lug = N.perfil.lugaresGuardados();
        const rec = N.perfil.recientes();
        c.addEventListener('click', (e) => {
          const t = e.target;
          if (t.closest('[data-buscar]')) return abrirBuscador();
          if (t.closest('[data-programar]')) return ctx().programarViaje();
          if (t.closest('[data-ir-paradero]') && N.PARADERO) return centrarVisible(N.PARADERO, 17, ui.pinY);
          if (t.closest('[data-promos]')) return abrirPromociones(ctx());
          if (t.closest('[data-ver-programados]')) return abrirProgramados(ctx());
          const g = t.closest('[data-guardar]');
          if (g) return abrirBuscador({ guardar: g.dataset.guardar });
          const l = t.closest('[data-lugar]');
          if (l && lug[l.dataset.lugar]) return irAConfirmar(lug[l.dataset.lugar]);
          const r = t.closest('[data-reciente]');
          if (r && rec[Number(r.dataset.reciente)]) return irAConfirmar(rec[Number(r.dataset.reciente)]);
          const f = t.closest('[data-frecuente]');
          if (f) return irAConfirmar(aLugar(N.LUGARES.find((x) => x.id === f.dataset.frecuente)));
        });
      },
      entrar(e) {
        quitarRadar();
        ruta.quitar();
        m.quitarOrigen();
        m.quitarDestino();
        m.quitarTaxi('asignado');
        ui.taxisRef = null;
        ubicarPin();
        const punto = ui.origen || e.miPosicion;
        if (punto) {
          centrarVisible(punto, ui.centrado ? m.mapa.getZoom() : 17, ui.pinY, ui.centrado);
          if (!ui.centrado) {
            ui.centrado = true;
            setTimeout(() => m.mapa.fire('moveend'), 60);
          }
        }
      },
      actualizar(e) {
        const aviso = $(hoja.contenido, '[data-aviso-gps]');
        if (aviso) aviso.hidden = e.miPosicion?.real !== false;
        // Tiempo estimado del taxi libre más cercano al pin.
        if (ui.origen && e.taxisCercanos?.length) {
          let km = Infinity;
          for (const t of e.taxisCercanos) if (!t.ocupado) km = Math.min(km, N.distanciaKm(t, ui.origen));
          const min = Number.isFinite(km) ? Math.max(1, Math.round(((km * 1.4) / 22) * 60)) : null;
          ponerTexto(app, '[data-pin-etiqueta]', min ? `Taxi a ${min} min` : 'Recoger aquí');
        }
      },
    },

    'elegir-destino': {
      altura: 'media',
      pin: 'destino',
      html: () => `
        <div class="a-vista-cabeza" data-arrastre>
          <button type="button" class="a-icono-btn" data-volver aria-label="Volver">${icono('atras')}</button>
          <span><h2>Elige tu destino</h2><small>Mueve el mapa hasta el punto exacto</small></span>
        </div>
        <div class="a-punto-elegido"><span class="a-punto a-punto-negro" aria-hidden="true"></span><span><strong data-destino-titulo>Mueve el mapa</strong><small data-destino-detalle></small></span></div>`,
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande" data-confirmar-destino disabled>Confirmar destino</button>`,
      montar(c, pie) {
        $(c, '[data-volver]').addEventListener('click', () => {
          ui.modo = 'inicio';
          pintar();
        });
        $(pie, '[data-confirmar-destino]').addEventListener('click', () => {
          if (ui.destinoProvisional && !ui.destinoProvisional.provisional) irAConfirmar(ui.destinoProvisional);
        });
      },
      entrar() {
        m.ponerOrigen(ui.origen);
        ubicarPin();
        app.style.setProperty('--pin-y', `${ui.pinY}px`);
        ponerTexto(app, '[data-pin-etiqueta]', 'Tu destino');
        const desde = ui.destino || ui.origen;
        if (desde) centrarVisible(desde, 16, ui.pinY);
        setTimeout(() => m.mapa.fire('moveend'), 380);
      },
    },

    confirmar: {
      altura: 'media',
      maxMedia: 0.8,
      html() {
        const fid = EM.fidelidad(p.viajesCompletados());
        return `
        <div class="a-vista-cabeza" data-arrastre>
          <button type="button" class="a-icono-btn" data-volver aria-label="Cambiar el destino">${icono('atras')}</button>
          <span><h2>Confirma tu viaje</h2><small data-ruta-sub>Calculando la ruta…</small></span>
        </div>
        <div class="a-tarifa" data-arrastre>
          <span class="a-tarifa-txt"><small data-tarifa-titulo>${TARIFA_EJEMPLO ? 'Tarifa estimada' : 'Valor del viaje'}</small><strong data-total class="a-esqueleto-txt">$——</strong>${TARIFA_EJEMPLO ? `<span class="a-chip-ejemplo">${icono('info', { tam: 13 })} Tarifa de ejemplo</span>` : '<span class="a-chip-ejemplo a-chip-tarifa" data-chip-tarifa hidden></span>'}</span>
          <span class="a-tarifa-taxi" aria-hidden="true"><svg viewBox="0 0 40 64" width="30" height="48">${N.svgTaxi ? N.svgTaxi({ tamano: 48 }).replace(/<svg[^>]*>|<\/svg>/g, '') : ''}</svg><small>${esc(EM.VEHICULO)}<br>4 puestos</small></span>
        </div>
        <button type="button" class="a-ver-detalle" data-detalle aria-expanded="false">${icono('lista', { tam: 16 })} Ver detalle de la tarifa ${icono('abajo', { tam: 16 })}</button>
        <div class="a-detalle" data-detalle-lista hidden></div>
        ${REAL
          ? `<div class="a-pago-fijo">${icono('efectivo', { tam: 22 })}<span>Pagas en efectivo<small>Directamente al conductor, al terminar el viaje</small></span></div>`
          : `<div class="a-segmentado" role="radiogroup" aria-label="Método de pago">
          <button type="button" role="radio" data-metodo="qr" aria-checked="${ui.metodo === 'qr'}">${icono('qr', { tam: 20 })}<span>QR <small>prueba</small></span></button>
          <button type="button" role="radio" data-metodo="efectivo" aria-checked="${ui.metodo === 'efectivo'}">${icono('efectivo', { tam: 20 })}<span>Efectivo</span></button>
        </div>`}
        <div data-corte></div>
        ${trayecto(ui.origen, ui.destino)}
        ${REAL ? '' : `<div class="a-fila-interruptor">
          <span class="a-fila-ico">${icono('calendario', { tam: 20 })}</span>
          <span class="a-fila-txt"><strong>Programar</strong><small>Con 24 h de anticipación: 10 % menos</small></span>
          <button type="button" role="switch" class="a-interruptor" data-programar aria-checked="${ui.programar}" aria-label="Programar el viaje"><span></span></button>
        </div>
        <div class="a-programar" data-programar-caja ${ui.programar ? '' : 'hidden'}>
          <label class="a-campo a-campo-chico"><span>Fecha y hora de recogida</span><input type="datetime-local" data-fecha step="900"></label>
          <div class="a-chips">
            <button type="button" class="a-chip" data-rapido="24">${icono('etiqueta', { tam: 15 })} Mañana a esta hora</button>
            <button type="button" class="a-chip" data-rapido="2">En 2 horas</button>
          </div>
          <p class="a-programar-info" data-programar-info></p>
        </div>`}
        <label class="a-campo-nota">${icono('mensaje', { tam: 20 })}<input data-nota maxlength="140" placeholder="Nota para el conductor (opcional)" value="${esc(ui.nota)}" aria-label="Nota para el conductor"></label>
        ${fid ? `<div class="a-fid-linea ${fid.siguienteConDescuento ? 'a-fid-premio' : ''}">
          <span class="a-fid-barra" aria-hidden="true"><span style="width:${(fid.siguienteConDescuento ? 1 : fid.completados / fid.meta) * 100}%"></span></span>
          <small>${fid.siguienteConDescuento ? '¡Este viaje va con 50 % de descuento!' : `Viaje ${fid.completados + 1} de tu tarjeta · al completar ${fid.meta}, el siguiente va al 50 %`}</small>
        </div>` : ''}`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande a-btn-pedir" data-pedir disabled><span data-pedir-txt>${ui.programar ? 'Programar viaje' : 'Pedir taxi'}</span><strong data-total-boton></strong></button>`,
      montar(c, pie) {
        $(c, '[data-volver]').addEventListener('click', () => {
          ui.modo = 'inicio';
          pintar();
          setTimeout(abrirBuscador, 120);
        });
        $(c, '[data-detalle]').addEventListener('click', (e) => {
          const b = e.currentTarget;
          const abierto = b.getAttribute('aria-expanded') === 'true';
          b.setAttribute('aria-expanded', String(!abierto));
          $(c, '[data-detalle-lista]').hidden = abierto;
          if (!abierto) hoja.fijar('completa');
        });
        $$(c, '[data-metodo]').forEach((b) => b.addEventListener('click', () => {
          ui.metodo = b.dataset.metodo;
          localStorage.setItem(EM.clave('metodo'), ui.metodo);
          $$(c, '[data-metodo]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
        }));
        $(c, '[data-nota]').addEventListener('input', (e) => (ui.nota = e.target.value));
        $(pie, '[data-pedir]').addEventListener('click', pedir);
        // En modo real no hay programar (el servidor no tiene viajes programados).
        const fecha = $(c, '[data-fecha]');
        if (!fecha) return;
        const minimo = () => aLocal(new Date(Date.now() + 35 * 60 * 1000));
        fecha.min = minimo();
        if (ui.programar) fecha.value = aLocal(ui.fecha || fechaPorDefecto());
        $(c, '[data-programar]').addEventListener('click', (e) => {
          ui.programar = !ui.programar;
          e.currentTarget.setAttribute('aria-checked', String(ui.programar));
          $(c, '[data-programar-caja]').hidden = !ui.programar;
          if (ui.programar) {
            ui.fecha = ui.fecha || fechaPorDefecto();
            fecha.value = aLocal(ui.fecha);
            hoja.fijar('completa');
            // Que se vea la fecha y los atajos, no solo el interruptor.
            setTimeout(() => verEnHoja($(c, '[data-programar-caja]'), 'centro'), 420);
          }
          ponerTexto(pie, '[data-pedir-txt]', ui.programar ? 'Programar viaje' : 'Pedir taxi');
          cotizar();
        });
        fecha.addEventListener('change', () => {
          const f = new Date(fecha.value);
          if (Number.isNaN(f.getTime())) return;
          if (f - Date.now() < 30 * 60 * 1000) {
            avisos.mostrar({ titulo: 'Elige otra hora', cuerpo: 'Para programar, la recogida debe ser en 30 minutos o más.', tipo: 'info' });
            fecha.value = minimo();
          }
          ui.fecha = new Date(fecha.value);
          cotizar();
        });
        $$(c, '[data-rapido]').forEach((b) => b.addEventListener('click', () => {
          const h = Number(b.dataset.rapido);
          const f = h === 24 ? fechaPorDefecto() : new Date(Date.now() + h * 3600 * 1000);
          f.setSeconds(0, 0);
          ui.fecha = f;
          fecha.value = aLocal(f);
          cotizar();
        }));
      },
      entrar() {
        quitarRadar();
        m.ponerOrigen(ui.origen);
        if (ui.destino) m.ponerDestino(ui.destino);
        else m.quitarDestino();
        cotizar();
      },
    },

    buscando: {
      altura: 'media',
      html(e) {
        const v = e.viaje;
        return `
        <div class="a-buscando" data-arrastre>
          <div class="a-buscando-anim" aria-hidden="true"><span></span><span></span><svg viewBox="0 0 40 64" width="26" height="42">${N.svgTaxi({ tamano: 42 }).replace(/<svg[^>]*>|<\/svg>/g, '')}</svg></div>
          <div class="a-buscando-txt">
            <h2>Buscando tu taxi</h2>
            <p data-mensaje aria-live="polite">${REAL ? textoBuscandoReal(0) : MENSAJES_BUSQUEDA[0]}</p>
          </div>
        </div>
        <div class="a-barra-progreso" aria-hidden="true"><span></span></div>
        <p class="a-taxis-cerca" data-taxis-cerca></p>
        <div data-corte></div>
        ${trayecto(v.origen, v.destino, { datos: false })}
        <div class="a-resumen-pago">
          <span>${icono(v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 18 })} ${v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}</span>
          <strong>${v.tarifa?.total != null ? N.pesos(v.tarifa.total) : ''}</strong>
        </div>
        ${v.nota ? `<p class="a-nota-viaje">${icono('mensaje', { tam: 16 })} «${esc(v.nota)}»</p>` : ''}`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-suave a-btn-grande" data-cancelar>${icono('cerrar', { tam: 18 })} Cancelar solicitud</button>`,
      montar(c, pie) {
        $(pie, '[data-cancelar]').addEventListener('click', cancelarViaje);
        let i = 0;
        const t = setInterval(() => {
          const nodo = $(c, '[data-mensaje]');
          if (!nodo) return;
          // Modo real: sin conexión no se rota (la solicitud espera en la cola).
          const siguiente = REAL ? textoBuscandoReal(sinRedBuscando() ? i : (i = (i + 1) % MENSAJES_BUSQUEDA_REAL.length)) : MENSAJES_BUSQUEDA[(i = (i + 1) % MENSAJES_BUSQUEDA.length)];
          if (nodo.textContent === siguiente) return;
          nodo.classList.remove('a-entra-txt');
          void nodo.offsetWidth;
          nodo.textContent = siguiente;
          nodo.classList.add('a-entra-txt');
        }, 2600);
        ui.limpiezas.push(() => clearInterval(t));
      },
      entrar(e) {
        const v = e.viaje;
        m.ponerOrigen(v.origen);
        if (v.destino) m.ponerDestino(v.destino);
        if (v.ruta?.coords) ruta.poner(v.ruta.coords, { color: '#9AA0A6', discontinua: true });
        ponerRadar(v.origen);
        centrarVisible(v.origen, 16);
      },
      actualizar(e) {
        const libres = (e.taxisCercanos || []).filter((t) => !t.ocupado).length;
        ponerTexto(hoja.contenido, '[data-taxis-cerca]', libres ? `${libres} ${libres === 1 ? 'taxi libre' : 'taxis libres'} cerca de ti · ${(e.taxisCercanos || []).length} en línea` : '');
      },
    },

    asignado: {
      altura: 'media',
      html: (e) => vistaConductor(e, false),
      montar: montarConductor,
      entrar(e) {
        entrarConductor(e);
      },
      actualizar: actualizarConductor,
    },

    llego: {
      altura: 'media',
      html: (e) => vistaConductor(e, true),
      montar: montarConductor,
      entrar(e) {
        entrarConductor(e);
        const b = $(app, '[data-banner-puerta]');
        b.innerHTML = `<span class="a-banner-ico">${icono('campana', { tam: 26 })}</span><span><strong>¡Tu taxi está en la puerta!</strong><small>Móvil ${esc(e.conductor.movil)} · Placa ${esc(e.conductor.placa)}</small></span>`;
        b.hidden = false;
        ui.limpiezas.push(() => (b.hidden = true));
      },
      actualizar: actualizarConductor,
    },

    en_viaje: {
      altura: 'media',
      html(e) {
        const c = e.conductor;
        const v = e.viaje;
        return `
        <div class="a-estado-viaje" data-arrastre>
          <span class="a-eta a-eta-tinta"><strong data-eta-num>—</strong><small data-eta-unidad>min</small></span>
          <span class="a-estado-txt"><h2>${v.destino ? `Rumbo a ${esc(v.destino.titulo)}` : 'Viaje en curso'}</h2><small data-estado-sub>¡Buen viaje!</small></span>
        </div>
        ${v.destino && v.ruta?.min ? `<div class="a-progreso-viaje" aria-hidden="true">
          <div class="a-progreso-pista"><span class="a-progreso-relleno" data-progreso></span><span class="a-progreso-taxi" data-progreso-taxi>${icono('auto', { tam: 18 })}</span></div>
          <div class="a-progreso-puntos"><span>${esc(v.origen.titulo || 'Origen')}</span><span>${esc(v.destino.titulo || 'Destino')}</span></div>
        </div>` : `<p class="a-sin-destino-txt">${icono('chat', { tam: 18 })} Indícale al conductor a dónde vas.</p>`}
        <div class="a-conductor-mini">
          ${avatar(c.nombre)}<span><strong>${esc(c.nombre)}</strong><small>Móvil ${esc(c.movil)} · ${esc(c.vehiculo || '')}</small></span>${placa(c.placa, undefined, 'a-placa-chica')}
        </div>
        ${acciones(c)}
        <div data-corte></div>
        <p class="a-seguro">${icono('escudo', { tam: 18 })} Tu viaje queda registrado. Compártelo con alguien de confianza.</p>`;
      },
      montar(c) {
        c.addEventListener('click', (e) => {
          if (e.target.closest('[data-compartir]')) compartir();
          if (e.target.closest('[data-llamada-demo]')) avisos.mostrar(N.AVISO_LLAMADA_DEMO);
          if (e.target.closest('[data-sos]')) sos();
        });
      },
      entrar(e) {
        quitarRadar();
        m.quitarOrigen();
        m.limpiarTaxis('asignado');
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
        if (e.viaje.ruta?.coords && e.viaje.destino) ruta.poner(e.viaje.ruta.coords, { color: '#121212' });
        else ruta.quitar();
        encuadrar([e.posConductor, e.viaje.destino || e.viaje.origen]);
      },
      actualizar(e) {
        const c = hoja.contenido;
        const eta = e.etaMin;
        if (eta != null) {
          const n = Math.max(1, Math.round(eta));
          ponerTexto(c, '[data-eta-num]', String(n));
          ponerTexto(c, '[data-estado-sub]', `Llegas a las ${N.horaTexto(Date.now() + eta * 60000)}`);
        }
        const total = e.viaje.ruta?.min;
        if (total && eta != null) {
          const f = limitar(1 - eta / total, 0, 1);
          const r = $(c, '[data-progreso]');
          const t = $(c, '[data-progreso-taxi]');
          if (r) r.style.width = `${f * 100}%`;
          if (t) t.style.left = `${f * 100}%`;
        }
      },
    },

    pagar: {
      altura: 'completa',
      html(e) {
        const v = e.viaje;
        const c = e.conductor;
        const valor = e.cobro?.valor || v.tarifa?.total || 0;
        // Modo real: solo efectivo (el QR, las billeteras y «otro celular» son de prueba).
        if (REAL) {
          return `
        <div class="a-pago-cabeza">
          <span class="a-meta-ico" aria-hidden="true">${icono('bandera', { tam: 28 })}</span>
          <h2>${v.destino ? `Llegaste a ${esc(v.destino.titulo)}` : 'Llegaste a tu destino'}</h2>
          <p>${esc(`Gracias por viajar con ${EM.NOMBRE}`)}</p>
        </div>
        <div class="a-total">
          <small>Total a pagar</small>
          <strong data-total-pagar>${N.pesos(valor)}</strong>
          <span class="a-total-detalle">${esc(EM.unir([e.kmFinal ? N.kmTexto(e.kmFinal) : '', c?.movil ? `Móvil ${c.movil}` : '', nombreCorto(c?.nombre || '')]))}</span>
        </div>
        <h3 class="a-subtitulo">Pagas en efectivo</h3>
        <div class="a-opciones-pago">
          <button type="button" class="a-op-pago a-op-destacada" data-efectivo>
            <span class="a-op-ico">${icono('efectivo')}</span>
            <span class="a-op-txt"><strong>Ya pagué en efectivo</strong><small>Le pagas directamente al conductor</small></span>
            ${icono('adelante', { tam: 20 })}
          </button>
        </div>`;
        }
        return `
        <div class="a-pago-cabeza">
          <span class="a-meta-ico" aria-hidden="true">${icono('bandera', { tam: 28 })}</span>
          <h2>${v.destino ? `Llegaste a ${esc(v.destino.titulo)}` : 'Llegaste a tu destino'}</h2>
          <p>${esc(`Gracias por viajar con ${EM.NOMBRE}`)}</p>
        </div>
        <div class="a-total">
          <small>Total a pagar</small>
          <strong data-total-pagar>${N.pesos(valor)}</strong>
          <span class="a-total-detalle">${e.kmFinal ? `${N.kmTexto(e.kmFinal)} · ` : ''}Móvil ${esc(c.movil)} · ${esc(nombreCorto(c.nombre))} ${chipPrueba('MODO PRUEBA')}</span>
        </div>
        <h3 class="a-subtitulo">¿Cómo quieres pagar?</h3>
        <div class="a-opciones-pago">
          <button type="button" class="a-op-pago" data-escanear>
            <span class="a-op-ico">${icono('camara')}</span>
            <span class="a-op-txt"><strong>Escanear QR del conductor</strong><small>Usa la cámara para leer el cobro</small></span>
            ${icono('adelante', { tam: 20 })}
          </button>
          <button type="button" class="a-op-pago a-op-destacada" data-simular aria-expanded="false">
            <span class="a-op-ico">${icono('rayo')}</span>
            <span class="a-op-txt"><strong>Simular pago con QR (prueba)</strong><small>Elige una billetera · no se mueve dinero</small></span>
            ${icono('abajo', { tam: 20 })}
          </button>
          <div class="a-billeteras" data-billeteras hidden>
            <div class="a-billeteras-lista" role="radiogroup" aria-label="Billetera de prueba">
              ${N.BILLETERAS.map((b, i) => `<label class="a-billetera"><input type="radio" name="a-billetera" value="${esc(b.nombre)}" ${i === 0 ? 'checked' : ''}><span class="a-billetera-color" style="--color:${esc(b.color)}"></span><span>${esc(b.nombre)}</span></label>`).join('')}
            </div>
            <button type="button" class="a-btn a-btn-primario a-btn-grande" data-pagar-qr>${icono('candado', { tam: 18 })}<span>Pagar ${N.pesos(valor)} (prueba)</span></button>
            <p class="a-nota-prueba">Las billeteras se muestran solo por nombre. Es una simulación: nadie recibe dinero.</p>
          </div>
          <button type="button" class="a-op-pago" data-efectivo>
            <span class="a-op-ico">${icono('efectivo')}</span>
            <span class="a-op-txt"><strong>Pagar en efectivo</strong><small>Le pagas directamente al conductor</small></span>
            ${icono('adelante', { tam: 20 })}
          </button>
        </div>
        <details class="a-otro-celular" data-otro>
          <summary>${icono('qr', { tam: 20 })}<span>¿Probar con otro celular?</span>${icono('abajo', { tam: 18 })}</summary>
          <p>Escanea este código con la cámara de otro celular: abre la página de pago de prueba de este viaje.</p>
          <div class="a-qr-caja" data-qr-otro></div>
        </details>`;
      },
      montar(c) {
        c.addEventListener('click', async (e) => {
          const t = e.target;
          if (t.closest('[data-simular]')) {
            const b = t.closest('[data-simular]');
            const abierto = b.getAttribute('aria-expanded') === 'true';
            b.setAttribute('aria-expanded', String(!abierto));
            $(c, '[data-billeteras]').hidden = abierto;
            if (!abierto) verEnHoja($(c, '[data-billeteras]'));
          }
          if (t.closest('[data-pagar-qr]')) {
            const billetera = $(c, 'input[name="a-billetera"]:checked')?.value || 'Bre-B';
            await procesarPago(billetera);
          }
          if (t.closest('[data-efectivo]')) {
            const ok = await modal(app, {
              titulo: '¿Pagaste en efectivo?',
              texto: `Confirma que le entregaste ${N.pesos(p.estado.cobro?.valor || p.estado.viaje?.tarifa?.total || 0)} al conductor.`,
              acciones: [{ texto: 'Todavía no', valor: false }, { texto: 'Sí, ya pagué', valor: true, clase: 'a-btn-primario' }],
            });
            if (ok) p.pagarEnEfectivo();
          }
          if (t.closest('[data-escanear]')) escanear();
        });
        $(c, '[data-otro]')?.addEventListener('toggle', (e) => {
          if (!e.target.open) return;
          const url = p.urlCobroActual();
          $(c, '[data-qr-otro]').innerHTML = url
            ? N.tarjetaBreB({ url, valor: p.estado.cobro?.valor || 0, movil: p.estado.conductor?.movil, compacta: true })
            : '<p>Aún no llega el cobro del conductor.</p>';
          verEnHoja(e.target);
        });
      },
      entrar(e) {
        quitarRadar();
        ruta.quitar();
        m.quitarOrigen();
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
        if (e.posConductor) centrarVisible(e.posConductor, 17);
      },
    },

    calificar: {
      altura: 'completa',
      html(e) {
        const c = e.conductor || { nombre: 'Conductor', movil: '', placa: '' };
        const pago = e.pago;
        return `
        ${pago ? `<div class="a-pago-ok" role="status">
          <span class="a-check-anim" aria-hidden="true">${icono('check', { tam: 26, grosor: 3 })}</span>
          <span><strong>${pago.metodo === 'qr' ? 'Pago exitoso (prueba)' : 'Pago en efectivo'}</strong>
          <small>${N.pesos(pago.valor)}${pago.billetera ? ` · ${esc(pago.billetera)}` : ''}${pago.ref ? ` · Ref. ${esc(pago.ref)}` : ''}</small></span>
          ${pago.metodo === 'qr' ? chipPrueba() : ''}
        </div>` : ''}
        <div class="a-recibida" data-recibida hidden></div>
        <div class="a-calificar">
          ${avatar(c.nombre, 'a-avatar-xl')}
          <h2>¿Cómo te fue con ${esc(nombreCorto(c.nombre))}?</h2>
          <p>Móvil ${esc(c.movil)} · ${esc(c.placa)}</p>
          <div data-estrellas></div>
          <div class="a-etiquetas" role="group" aria-label="¿Qué te gustó?">
            ${N.ETIQUETAS_CALIFICACION.conductor.map((t) => `<button type="button" class="a-etiqueta" aria-pressed="false" data-etiqueta="${esc(t)}">${esc(t)}</button>`).join('')}
          </div>
          <label class="a-campo a-campo-chico"><span>Comentario (opcional)</span><textarea data-comentario rows="2" maxlength="200" placeholder="Cuéntanos cómo te fue"></textarea></label>
        </div>`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande" data-enviar disabled>Enviar calificación</button><button type="button" class="a-btn-texto" data-omitir>Ahora no</button>`,
      montar(c, pie) {
        ui.etiquetasElegidas = new Set();
        const env = $(pie, '[data-enviar]');
        ui.calif = estrellas({
          etiqueta: 'Califica al conductor',
          alCambiar: (n) => (env.disabled = !n),
        });
        $(c, '[data-estrellas]').append(ui.calif.el, ui.calif.leyenda);
        c.addEventListener('click', (e) => {
          const t = e.target.closest('[data-etiqueta]');
          if (!t) return;
          const on = t.getAttribute('aria-pressed') !== 'true';
          t.setAttribute('aria-pressed', String(on));
          if (on) ui.etiquetasElegidas.add(t.dataset.etiqueta);
          else ui.etiquetasElegidas.delete(t.dataset.etiqueta);
        });
        env.addEventListener('click', () => {
          const n = ui.calif.valor();
          if (!n) return;
          p.calificar(n, { etiquetas: [...ui.etiquetasElegidas], comentario: $(c, '[data-comentario]').value.trim() });
        });
        $(pie, '[data-omitir]').addEventListener('click', () => p.omitirCalificacion());
      },
      entrar() {
        quitarRadar();
        ruta.quitar();
      },
      actualizar(e) {
        const r = $(hoja.contenido, '[data-recibida]');
        if (r && e.calificacionRecibida && r.hidden) {
          r.innerHTML = `${icono('estrella', { tam: 18 })}<span>${esc(nombreCorto(e.conductor?.nombre || 'El conductor'))} te calificó con <b>${'★'.repeat(e.calificacionRecibida)}</b></span>`;
          r.hidden = false;
        }
      },
    },
  };

  /* ---- vistas asignado / llegó (comparten piezas) ---- */
  function vistaConductor(e, llego) {
    const c = e.conductor;
    const v = e.viaje;
    return `
      <div class="a-estado-viaje ${llego ? 'a-estado-llego' : ''}" data-arrastre>
        ${llego
          ? `<span class="a-eta a-eta-llego">${icono('campana', { tam: 26 })}</span>`
          : '<span class="a-eta"><strong data-eta-num>—</strong><small data-eta-unidad>min</small></span>'}
        <span class="a-estado-txt"><h2>${llego ? 'Tu taxi está en la puerta' : 'Tu taxi va en camino'}</h2><small data-estado-sub>${llego ? 'Sal y verifica la placa antes de subir' : 'Calculando…'}</small></span>
      </div>
      ${llego && v.codigo ? codigoAbordaje(v.codigo, true) : ''}
      ${tarjetaConductor(c)}
      ${llego || !v.codigo ? '' : codigoAbordaje(v.codigo)}
      ${acciones(c)}
      <div data-corte></div>
      ${trayecto(v.origen, v.destino, { datos: false })}
      <div class="a-resumen-pago">
        <span>${icono(v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 18 })} ${v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}</span>
        <strong>${v.tarifa?.total != null ? N.pesos(v.tarifa.total) : ''}</strong>
      </div>
      <button type="button" class="a-btn-texto a-texto-peligro" data-cancelar>Cancelar servicio</button>`;
  }
  function montarConductor(c) {
    c.addEventListener('click', (e) => {
      if (e.target.closest('[data-compartir]')) compartir();
      if (e.target.closest('[data-llamada-demo]')) avisos.mostrar(N.AVISO_LLAMADA_DEMO);
      if (e.target.closest('[data-sos]')) sos();
      if (e.target.closest('[data-cancelar]')) cancelarViaje();
    });
  }
  function entrarConductor(e) {
    quitarRadar();
    m.limpiarTaxis('asignado');
    ui.taxisRef = null;
    m.ponerOrigen(e.viaje.origen);
    if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
    else m.quitarDestino();
    if (e.rutaConductor?.length) ruta.poner(e.rutaConductor, { color: '#121212' });
    else ruta.quitar();
    if (e.posConductor) m.ponerTaxi('asignado', e.posConductor, { rumbo: e.posConductor.rumbo || 0, destacado: true, etiqueta: esc(`Móvil ${e.conductor.movil}`) });
    encuadrar([e.posConductor, e.viaje.origen]);
  }
  function actualizarConductor(e) {
    const c = hoja.contenido;
    if (e.fase === 'asignado' && e.etaMin != null) {
      const cerca = e.etaMin < 1;
      ponerTexto(c, '[data-eta-num]', cerca ? '1' : String(Math.round(e.etaMin)));
      ponerTexto(c, '[data-estado-sub]', cerca ? 'Está llegando a tu punto. ¡Alístate!' : `Llega a las ${N.horaTexto(Date.now() + e.etaMin * 60000)} · Móvil ${e.conductor.movil}`);
    }
  }

  /* ---------------- cotización y pedido ---------------- */
  async function cotizar() {
    const n = ++ui.reqCot;
    const c = hoja.contenido;
    $(hoja.pie, '[data-pedir]')?.setAttribute('disabled', '');
    $(c, '[data-total]')?.classList.add('a-esqueleto-txt');
    const r = await p.cotizar({ origen: ui.origen, destino: ui.destino || null, programadoPara: ui.programar ? ui.fecha : null });
    if (n !== ui.reqCot || ui.vista !== 'confirmar') return;
    ui.cotizacion = r;
    const { ruta: rt, tarifa } = r;
    const total = $(c, '[data-total]');
    total.classList.remove('a-esqueleto-txt');
    total.textContent = N.pesos(tarifa.total);
    total.classList.remove('a-cambia');
    void total.offsetWidth;
    total.classList.add('a-cambia');
    // Con tarifas oficiales: oficial (precio cerrado del decreto), estimada o de referencia.
    const oficial = !TARIFA_EJEMPLO && tarifa.tipo === 'oficial';
    const chip = $(c, '[data-chip-tarifa]');
    if (chip) {
      chip.innerHTML = `${icono(oficial ? 'check' : 'info', { tam: 13, grosor: oficial ? 3 : 2 })} ${esc(tarifa.etiqueta || N.etiquetaTarifa(tarifa))}`;
      chip.dataset.tipo = tarifa.tipo || '';
      chip.hidden = false;
    }
    const tipoRuta = !tarifa.rutaFija ? '' : TARIFA_EJEMPLO || tarifa.tipo !== 'referencia' ? ' · ruta con tarifa fija' : ' · precio de referencia';
    ponerTexto(c, '[data-ruta-sub]', rt ? `${N.kmTexto(rt.km)} · ${N.minutosTexto(rt.min)}${rt.aproximada ? ' (aprox.)' : ''}${tipoRuta}` : 'Destino a convenir con el conductor');
    const minimaTexto = TARIFA_EJEMPLO ? ' (mínima de ejemplo)' : EM.TARIFAS_OFICIALES ? ` (mínima oficial ${N.pesos(N.TARIFAS.minimaUrbana)})` : '';
    ponerTexto(c, '[data-ruta-datos]', rt ? `${N.kmTexto(rt.km)} · ${N.minutosTexto(rt.min)} de viaje · llegas a las ${N.horaTexto((ui.programar && ui.fecha ? ui.fecha.getTime() : Date.now()) + rt.min * 60000 + 5 * 60000)}` : `El conductor te cobra según el recorrido${minimaTexto}.`);
    const fuente = tarifa.fuente || N.FUENTE_TARIFAS;
    const pieDetalle = TARIFA_EJEMPLO
      ? `Tarifas de ejemplo: la ${EM.TIPO} confirmará las oficiales. Con taxímetro o ruta fija, el valor final puede variar.`
      : [...(tarifa.notas || []), oficial ? '' : 'El valor final lo confirma el conductor.'].filter(Boolean).map(esc).join(' ')
        + (fuente?.url ? ` <a href="${esc(fuente.url)}" target="_blank" rel="noopener" data-enlace-decreto>Ver el ${esc(fuente.acto)}</a>` : '');
    $(c, '[data-detalle-lista]').innerHTML = `<ul>${tarifa.detalle.map((d) => `<li class="${d.valor < 0 ? 'a-descuento' : ''}"><span>${esc(d.concepto)}</span><b>${d.valor < 0 ? '−' : ''}${N.pesos(Math.abs(d.valor))}</b></li>`).join('')}
      <li class="a-detalle-total"><span>${oficial && !tarifa.descuento ? 'Total' : 'Total estimado'}</span><b>${N.pesos(tarifa.total)}</b></li></ul>
      <p>${icono('info', { tam: 14 })} <span>${TARIFA_EJEMPLO ? esc(pieDetalle) : pieDetalle}</span></p>`;
    const info = $(c, '[data-programar-info]');
    if (info) {
      if (ui.programar && ui.fecha) {
        const aplica = N.aplicaDescuentoProgramado(ui.fecha);
        // La fecha escrita en español (el selector nativo usa el idioma del navegador).
        const cuando = `<strong class="a-programar-cuando">${icono('calendario', { tam: 15 })} Te recogemos el ${esc(N.fechaTexto(ui.fecha))} a las ${esc(N.horaTexto(ui.fecha))}</strong>`;
        info.innerHTML = cuando + (aplica
          ? `<span class="a-programar-ahorro"><span class="a-descuento-chip">−10&nbsp;%</span> Programado con 24&nbsp;h o más: ahorras ${N.pesos(tarifa.descuento || 0)}.</span>`
          : `<span class="a-programar-ahorro">${icono('info', { tam: 14 })} Para el 10&nbsp;% de descuento, programa con 24 horas o más de anticipación.</span>`);
      } else info.textContent = '';
    }
    ponerTexto(hoja.pie, '[data-total-boton]', N.pesos(tarifa.total));
    $(hoja.pie, '[data-pedir]')?.removeAttribute('disabled');
    if (rt?.coords && ui.destino) ruta.poner(rt.coords, { color: '#121212' });
    else ruta.quitar();
    hoja.fijar(hoja.estado);
    encuadrar([ui.origen, ui.destino]);
  }

  async function pedir() {
    if (!p.registrado) {
      if (REAL) abrirIngreso();
      else mostrarBienvenida(app, { N, alTerminar: alRegistrarse });
      return;
    }
    const b = $(hoja.pie, '[data-pedir]');
    b.disabled = true;
    b.classList.add('a-ocupado');
    if (!localStorage.getItem('ct.a.permisoPedido')) {
      localStorage.setItem('ct.a.permisoPedido', '1');
      N.pedirPermisoNotificaciones();
    }
    try {
      const r = await p.solicitar({ origen: ui.origen, destino: ui.destino || null, metodoPago: REAL ? 'efectivo' : ui.metodo, programadoPara: !REAL && ui.programar ? ui.fecha : null, nota: ui.nota.trim() });
      ui.pinAMano = false; // el próximo viaje vuelve a seguir el GPS
      if (r?.programado) {
        reiniciarUI();
        pintar();
      }
    } catch (err) {
      avisos.mostrar({ titulo: 'No pudimos pedir el taxi', cuerpo: REAL && err?.codigo ? EM.textoError(err) : err.message, tipo: 'error' });
      b.disabled = false;
      b.classList.remove('a-ocupado');
    }
  }

  async function procesarPago(billetera) {
    const capa = el(`<div class="a-procesando" role="status"><div class="a-procesando-caja"><span class="a-girador a-girador-grande"></span><strong>Procesando pago de prueba…</strong><small>${esc(billetera)} · ${N.pesos(p.estado.cobro?.valor || p.estado.viaje?.tarifa.total || 0)}</small>${chipPrueba('SIN DINERO REAL')}</div></div>`);
    app.append(capa);
    await new Promise((r) => setTimeout(r, 1300));
    capa.remove();
    const r = p.pagarConQR(null, billetera);
    if (!r.ok) avisos.mostrar({ titulo: 'No se pudo pagar', cuerpo: r.error, tipo: 'error' });
  }

  // Mensaje claro (en español) cuando la cámara no abre.
  function errorDeCamara(e) {
    const n = e?.name || '';
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return 'La cámara solo funciona cuando la página abre con https.';
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'No diste permiso para usar la cámara. Puedes activarlo en los ajustes del navegador.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Este equipo no tiene una cámara disponible.';
    if (n === 'NotReadableError' || n === 'AbortError') return 'La cámara está ocupada por otra app. Ciérrala e intenta de nuevo.';
    return 'No pudimos abrir la cámara.';
  }

  async function escanear() {
    let lector = null;
    const billetera = $(hoja.contenido, 'input[name="a-billetera"]:checked')?.value || 'Bre-B';
    const r = await modal(app, {
      titulo: 'Escanea el QR del conductor',
      texto: 'Apunta la cámara al código que te muestra el conductor en su celular.',
      clase: 'a-modal-camara',
      cuerpo: `<div class="a-camara"><video playsinline muted></video><span class="a-camara-marco" aria-hidden="true"></span>
        <div class="a-camara-error" data-error hidden>${icono('camara', { tam: 30 })}<p data-error-txt></p><small>Sigue con «Simular pago con QR (prueba)» o paga en efectivo.</small></div></div>`,
      acciones: [
        { texto: 'Simular pago (prueba)', valor: 'simular', clase: 'a-btn-primario', icono: 'rayo' },
        { texto: 'Cerrar', valor: null, clase: 'a-btn-suave' },
      ],
      alAbrir: async (cuerpo, cerrar) => {
        const video = $(cuerpo, 'video');
        const error = $(cuerpo, '[data-error]');
        const mostrarError = (txt) => {
          error.hidden = false;
          $(error, '[data-error-txt]').textContent = txt;
          $(cuerpo, '.a-camara').classList.add('a-sin-camara');
        };
        try {
          lector = await N.escanearQR(video, (texto) => {
            const r = p.pagarConQR(texto, billetera);
            if (r.ok) cerrar(true);
            else mostrarError(`${r.error}. Intenta de nuevo.`);
          });
          if (!cuerpo.isConnected) lector?.detener?.();
        } catch (e) {
          mostrarError(errorDeCamara(e));
        }
      },
    });
    lector?.detener?.();
    if (r === 'simular' && p.estado.fase === 'pagar') {
      const b = $(hoja.contenido, '[data-simular]');
      if (b && b.getAttribute('aria-expanded') !== 'true') b.click();
      else verEnHoja($(hoja.contenido, '[data-billeteras]'));
    }
  }

  function reiniciarUI() {
    ui.modo = 'inicio';
    ui.destino = undefined;
    ui.destinoProvisional = null;
    ui.cotizacion = null;
    ui.programar = false;
    ui.fecha = null;
    ui.nota = '';
  }

  /* ---------------- pintado ---------------- */
  function renderVista(clave, forzar = false) {
    const e = p?.estado || {};
    const v = VISTAS[clave];
    if (!v) return;
    if (ui.vista === clave && !forzar) return;
    ui.limpiezas.splice(0).forEach((f) => f());
    ui.vista = clave;
    app.dataset.vista = clave;
    app.dataset.pin = v.pin || '';
    hoja.el.dataset.peek = String(v.peek || 82);
    hoja.el.dataset.maxMedia = String(v.maxMedia || 0.74);
    hoja.renovar();
    hoja.contenido.innerHTML = v.html(e);
    hoja.pie.innerHTML = v.pie ? v.pie(e) : '';
    hoja.pie.hidden = !v.pie;
    hoja.contenido.scrollTop = 0;
    hoja.contenido.classList.remove('a-entra');
    void hoja.contenido.offsetWidth;
    hoja.contenido.classList.add('a-entra');
    v.montar?.(hoja.contenido, hoja.pie, e);
    hoja.fijar(v.altura || 'media');
    if (p) v.entrar?.(e);
    if (v.pin === 'origen') pintarPunto('origen', !ui.origen || ui.origen.provisional);
  }

  let pendiente = false;
  function pintar() {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      pintarAhora();
    });
  }

  function pintarAhora() {
    if (!p) return;
    const e = p.estado;
    if (ui.fase && ui.fase !== 'inicio' && e.fase === 'inicio') reiniciarUI();
    if (e.fase !== ui.fase) anotarViaje(e.fase);
    ui.fase = e.fase;
    const clave = e.fase === 'inicio' ? ui.modo : e.fase;
    if (clave !== ui.vista) renderVista(clave);
    VISTAS[ui.vista]?.actualizar?.(e);
    actualizarMapa(e);
    // Indicador de conexión.
    if (REAL) return pintarConexion();
    const vivo = e.conexion === 'en-vivo';
    $(app, '[data-conexion]').classList.toggle('a-vivo', vivo);
    ponerTexto(app, '[data-conexion-txt]', vivo ? `En vivo · ${e.conductoresReales || 0} conductores` : 'Solo este equipo');
  }

  // Modo real: «Conectando… / En línea / Sin conexión, reintentando…» según bus.estado.
  function pintarConexion() {
    if (!REAL) return;
    pintarChipConexion($(app, '[data-conexion]'), p?.bus?.estado || 'sin_conectar');
  }

  function actualizarMapa(e) {
    if (e.miPosicion && e.miPosicion !== ui.yoRef) {
      ui.yoRef = e.miPosicion;
      m.ponerYo(e.miPosicion);
    }
    const v = ui.vista;
    if (['inicio', 'elegir-destino', 'confirmar', 'buscando'].includes(v)) {
      if (e.taxisCercanos !== ui.taxisRef) {
        ui.taxisRef = e.taxisCercanos;
        m.sincronizarTaxis(e.taxisCercanos || []);
      }
    } else if (e.posConductor && ['asignado', 'llego', 'en_viaje', 'pagar', 'calificar'].includes(v)) {
      m.ponerTaxi('asignado', e.posConductor, { rumbo: e.posConductor.rumbo || 0, destacado: true, etiqueta: esc(`Móvil ${e.conductor?.movil || ''}`) });
      if (v === 'asignado' || v === 'en_viaje') {
        ruta.recortar(e.posConductor);
        if (Date.now() - ui.ultimoEncuadre > 2500 && !puntoVisible(m, e.posConductor, { arriba: arriba() + 50, abajo: hoja.alto })) {
          encuadrar([e.posConductor, v === 'asignado' ? e.viaje.origen : e.viaje.destino || e.posConductor]);
        }
      }
    }
  }

  window.addEventListener('resize', () => {
    m.refrescar();
    hoja.fijar(hoja.estado, false);
    if (app.dataset.pin) ubicarPin();
  });

  // El primer toque desbloquea el sonido de los avisos.
  const desbloquear = () => {
    N.prepararSonido();
    document.removeEventListener('pointerdown', desbloquear);
    document.removeEventListener('keydown', desbloquear);
  };
  document.addEventListener('pointerdown', desbloquear);
  document.addEventListener('keydown', desbloquear);

  function alRegistrarse() {
    pintarBarra();
    avisos.mostrar({ titulo: `¡Hola, ${nombreCorto(N.perfil.pasajero()?.nombre || '')}!`, cuerpo: 'Mueve el mapa a tu punto y dinos a dónde vas.', tipo: 'exito' });
    avisarMunicipioPorGps();
  }

  // TaxiCun escogió la cooperativa por el GPS: se dice cuál y cómo cambiarla (una vez por sesión).
  function avisarMunicipioPorGps() {
    // Si aún no se registró, se avisa después del registro (no encima de la bienvenida).
    if (!EM.EN_TAXICUN || !taxicun?.porGps || !N.perfil.pasajero()?.nombre) return;
    try {
      if (sessionStorage.getItem('ct.a.tc.avisoGps') === N.ID_EMPRESA) return;
      sessionStorage.setItem('ct.a.tc.avisoGps', N.ID_EMPRESA);
    } catch { /* sin sessionStorage */ }
    avisos.mostrar({ titulo: `Estás en ${EM.PUEBLO}`, cuerpo: `Te mostramos los taxis de ${EM.NOMBRE}. Si no es tu municipio, cámbialo en el menú.`, tipo: 'info' });
  }

  /* ---------------- modo real: sesión con el servidor ---------------- */
  // conSesion: hay cuenta lista (token + nombre + celular) y el tiempo real debe
  // estar conectado. Mientras se ingresa es false: así un «sesión cerrada» que
  // llegue en ese momento no abre otro ingreso encima.
  let conSesion = false;
  let reintentoYo = null;
  let fallosYo = 0; // reintentos seguidos de GET /api/yo sin red (el aviso sale solo la primera vez)

  function abrirBienvenida(op = {}) {
    return mostrarBienvenida(app, { N, alTerminar: REAL ? alIngresar : alRegistrarse, ...op });
  }

  // Pedir sin cuenta lista: sin sesión, la bienvenida; con sesión, completar los datos.
  function abrirIngreso() {
    if (N.servidor.haySesion()) abrirBienvenida({ paso: 'perfil', usuario: N.perfil.pasajero() || {} });
    else abrirBienvenida();
  }

  function alIngresar() {
    sesionLista();
    // Si entró otra cuenta, sus datos locales se borraron: el inicio no debe mostrar los
    // lugares ni los recientes de la anterior.
    if (ui.vista === 'inicio') renderVista('inicio', true);
    alRegistrarse();
  }

  function sesionLista() {
    conSesion = true;
    clearTimeout(reintentoYo);
    pintarBarra();
    conectarBus();
  }

  // El tiempo real se abre solo con sesión y datos completos (el servidor toma el
  // nombre y el celular en el saludo).
  function conectarBus() {
    if (!REAL || !conSesion || !p?.bus) return;
    p.bus.conectar();
    pintarConexion();
  }

  // Tras guardar nombre o celular en «Mi cuenta»: el servidor los congela al
  // conectar, así que se reconecta si el tiempo real ya estaba abierto.
  function datosActualizados() {
    pintarBarra();
    if (!REAL || !conSesion || !p?.bus) return;
    if (['en_linea', 'conectando', 'reconectando'].includes(p.bus.estado)) p.bus.reconectar();
  }

  // Al abrir: sin token → bienvenida; con token → GET /api/yo para saber si la
  // cuenta sigue viva y si le faltan datos.
  // ¿Ya se ve «Completa tus datos»? (la persona puede estar escribiendo)
  function completandoPerfil() {
    return Boolean(app.querySelector('.a-bienvenida form.a-registro [data-guardar]'));
  }

  async function prepararSesion() {
    clearTimeout(reintentoYo);
    if (!N.servidor.haySesion()) {
      N.perfil.cerrarSesionPasajero();
      pintarBarra();
      abrirBienvenida();
      return;
    }
    try {
      const r = await N.servidor.yo();
      const u = r?.usuario || {};
      fallosYo = 0;
      N.perfil.fijarPasajeroServidor(u);
      pintarBarra();
      if (!u.nombre || !u.celular) {
        // Si ya está abierto (lo abrió «Pedir» mientras no había red), no se borra lo escrito.
        if (!completandoPerfil()) abrirBienvenida({ paso: 'perfil', usuario: u });
        return;
      }
      sesionLista();
    } catch (err) {
      if (err?.codigo === 'sin_sesion') {
        N.perfil.cerrarSesionPasajero();
        pintarBarra();
        avisos.mostrar({ titulo: 'Tu sesión se cerró', cuerpo: 'Ingresa de nuevo con tu correo.', tipo: 'alerta' });
        abrirBienvenida({ paso: 'correo' });
        return;
      }
      // Sin señal (u otro fallo): con los datos ya guardados se sigue; el tiempo
      // real reintenta solo. Si no hay datos, se vuelve a intentar en un rato.
      const yo = N.perfil.pasajero();
      if (yo?.nombre && yo?.celular) {
        sesionLista();
        return;
      }
      // El aviso, solo la primera vez; los reintentos se espacian (8, 16, 30, 60 s…).
      fallosYo += 1;
      if (fallosYo === 1) avisos.mostrar({ titulo: 'No pudimos revisar tu cuenta', cuerpo: EM.textoError(err), tipo: 'error' });
      reintentoYo = setTimeout(prepararSesion, Math.min(60000, 8000 * 2 ** (fallosYo - 1)));
    }
  }

  // El servidor dijo «sin sesión» (HTTP 401 o cierre 4401 del tiempo real).
  function sesionCerrada() {
    if (!conSesion) return;
    avisos.mostrar({ titulo: 'Tu sesión se cerró', cuerpo: 'Ingresa de nuevo con tu correo.', tipo: 'alerta' });
    terminarSesionLocal();
  }

  // Cierra el tiempo real, borra los datos de la cuenta en este celular y vuelve
  // al ingreso con correo. borrarTodo (eliminar cuenta): también historial y lugares.
  function terminarSesionLocal({ borrarTodo = false } = {}) {
    conSesion = false;
    clearTimeout(reintentoYo);
    p?.bus?.cerrar?.();
    if (borrarTodo) N.perfil.borrarDatosLocales();
    else N.perfil.cerrarSesionPasajero();
    app.querySelectorAll('.a-panel, .a-menu-capa, .a-buscador').forEach((n) => n.remove());
    pintarBarra();
    pintarConexion();
    abrirBienvenida({ paso: 'correo' });
  }

  // Eventos del tiempo real que le importan a la pantalla (el resto lo maneja el núcleo).
  function escucharBus() {
    const b = p.bus;
    b.on('conexion', pintarConexion);
    b.on('estado_conexion', pintarConexion);
    b.on('bienvenida', pintarConexion);
    b.on('rechazo', (d) => {
      pintarConexion();
      const codigo = d?.codigo || 'sin_sesion';
      if (codigo === 'sin_sesion') return sesionCerrada();
      if (conSesion) avisos.mostrar({ titulo: 'No pudimos conectarte', cuerpo: EM.textoError(codigo), tipo: 'error' });
    });
    // Respaldo por si algún cambio de estado no llega como evento.
    setInterval(pintarConexion, 3000);
  }

  /* ---------------- arranque ---------------- */
  pintarBarra();
  renderVista('carga');
  if (REAL) {
    N.servidor.sesion.on('cerrada', sesionCerrada);
    prepararSesion();
  } else if (!N.perfil.pasajero()?.nombre) mostrarBienvenida(app, { N, alTerminar: alRegistrarse });

  // Rodeo del núcleo: el viaje en curso se guarda en sessionStorage con la misma
  // clave para todas las cooperativas ('ct.viaje.pasajero'). Si en esta pestaña
  // quedó un viaje de OTRA cooperativa, no se debe retomar aquí. Este diseño anota
  // de qué cooperativa es el viaje activo (CLAVE_VIAJE_DE) y, si no coincide, lo descarta.
  // En modo real no aplica: el núcleo guarda el viaje en localStorage con claves
  // propias y lo retoma con el servidor (viaje_actual).
  const CLAVE_VIAJE_DE = 'ct.a.viaje.empresa';
  try {
    const de = REAL ? null : sessionStorage.getItem(CLAVE_VIAJE_DE);
    if (de && de !== N.ID_EMPRESA) {
      sessionStorage.removeItem('ct.viaje.pasajero');
      sessionStorage.removeItem(CLAVE_VIAJE_DE);
    }
  } catch { /* sin sessionStorage */ }
  function anotarViaje(fase) {
    if (REAL) return;
    try {
      if (fase && fase !== 'inicio') sessionStorage.setItem(CLAVE_VIAJE_DE, N.ID_EMPRESA);
      else sessionStorage.removeItem(CLAVE_VIAJE_DE);
    } catch { /* sin sessionStorage */ }
  }

  // Viaje que estaba en curso antes de recargar (lo guarda el núcleo en sessionStorage).
  let previo = null;
  try {
    const g = REAL ? null : JSON.parse(sessionStorage.getItem('ct.viaje.pasajero') || 'null');
    if (g && Date.now() - g.guardado < 30 * 60 * 1000 && ['buscando', 'asignado', 'llego', 'en_viaje'].includes(g.fase)) previo = g.estado?.viaje || null;
  } catch { /* sin datos previos */ }

  // Rodeo de dos casos del núcleo al recargar la página:
  //  · un viaje con conductor simulado vuelve a «inicio» sin explicación → se deja listo para pedirlo otra vez;
  //  · una solicitud «buscando» se restaura sin volver a publicarse ni a programar el conductor de
  //    respaldo, y se queda buscando para siempre → se vuelve a pedir con los mismos datos.
  async function retomarTrasRecarga() {
    if (!previo) return;
    const e = p.estado;
    if (e.fase === 'buscando' && e.viaje && !e.viaje.simulado) {
      const v = e.viaje;
      try {
        await p.solicitar({ origen: v.origen, destino: v.destino, metodoPago: v.metodoPago, nota: v.nota || '' });
        avisos.mostrar({ titulo: 'Retomamos tu solicitud', cuerpo: 'Seguimos buscando tu taxi.', tipo: 'info' });
      } catch { /* si falla, queda la opción de cancelar */ }
      return;
    }
    if (e.fase === 'inicio' && previo.simulado && previo.origen) {
      ui.origen = previo.origen;
      ui.metodo = previo.metodoPago === 'efectivo' ? 'efectivo' : 'qr';
      ui.nota = previo.nota || '';
      ui.centrado = true;
      irAConfirmar(previo.destino || null);
      avisos.mostrar({ titulo: 'Tu viaje de prueba se reinició', cuerpo: 'Al recargar la página la simulación vuelve a empezar. Toca «Pedir taxi» para repetirlo.', tipo: 'info' });
    }
  }

  (async () => {
    try {
      // Modo real: sin taxis de ambiente simulados; el tiempo real se abre al tener sesión.
      p = REAL ? await N.crearPasajero({ ambiente: false }) : await N.crearPasajero();
      p.on('cambio', pintar);
      // «¡Tu taxi está en la puerta!» ya se ve en el banner grande: solo va al historial.
      p.on('aviso', (a) => avisos.mostrar(a, { silencioso: p.estado.fase === 'llego' && /puerta/i.test(a.titulo) }));
      // Modo revisor (revisores de las tiendas, desde otro país): el núcleo cambió la posición al
      // paradero de taxis; si aún no hay un punto de recogida en la zona, el mapa y el pin van allá.
      // El GPS se afinó (al abrir, al volver o con «mi ubicación»): si el pin de recogida no se
      // movió a mano y quedó a más de 40 m de la lectura buena, se lleva a donde está la persona.
      p.on('posicion_afinada', (pos) => {
        if (p.estado.fase !== 'inicio' || ui.modo !== 'inicio' || ui.pinAMano || !pos?.real) return;
        if (ui.origen && N.distanciaKm(ui.origen, pos) <= 0.04) return;
        Object.assign(ui, { origen: null, centrado: false });
        renderVista('inicio', true);
      });
      p.on('revision_lejos', () => {
        if (p.estado.fase !== 'inicio' || (ui.origen && !N.fueraDeZona(ui.origen))) return;
        Object.assign(ui, { origen: null, destino: undefined, destinoProvisional: null, cotizacion: null, centrado: false, modo: 'inicio' });
        renderVista('inicio', true);
      });
      if (REAL) escucharBus();
      escucharVueltaALaApp();
      ui.origen = null;
      ui.vista = null;
      pintarAhora();
      if (REAL) conectarBus();
      else if (p.registrado) await retomarTrasRecarga();
      avisarMunicipioPorGps();
    } catch (err) {
      console.error(err);
      avisos.mostrar({ titulo: 'No pudimos iniciar la app', cuerpo: err.message, tipo: 'error' });
    }
  })();
}
