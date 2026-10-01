// App del pasajero — diseño C «Noche Neón».
// Mapa oscuro a pantalla completa, píldora de búsqueda de vidrio arriba, tarjeta
// de vidrio abajo y navegación inferior flotante. La lógica vive en el núcleo;
// aquí solo se pinta y se reacciona a sus eventos.
//
// Rendimiento: el núcleo emite 'cambio' cada ~0,5 s durante los viajes. La
// pantalla completa se repinta solo cuando cambia la «vista» (fase, pestaña o
// paso); dentro de la misma vista solo se actualizan textos y marcadores.
import * as C from './comun.js';
import { montarRegistro } from './pasajero-registro.js';
import { crearSecciones } from './pasajero-secciones.js';

const { icono, esc } = C;
// Placa y móvil sin partirse al final del renglón («SUB» arriba y «609» abajo).
const sinCorte = (t) => esc(t).replace(/ /g, '&nbsp;');
const AMARILLO = '#FFE14D';
const CIAN = '#22D3EE';

// El núcleo guarda el viaje en curso en sessionStorage con la misma clave para
// todas las cooperativas ('ct.viaje.pasajero'): si en la misma pestaña se pasa
// de Subachoque a Tabio con un viaje por pagar, Tabio lo retomaría con el
// conductor de Subachoque. Antes de crear el pasajero se aparta el viaje de la
// otra cooperativa (queda guardado para cuando vuelva) y se trae el de esta.
const CLAVE_VIAJE = 'ct.viaje.pasajero';
const CLAVE_DUENO = 'ct.c.viaje.empresa';
function separarViajeGuardado(id) {
  try {
    const dueno = sessionStorage.getItem(CLAVE_DUENO);
    // Sin dueño anotado (versiones anteriores u otro diseño) se deja como está.
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

export async function montar(raiz, { N, vitrina = false, taxicun = null } = {}) {
  // Datos de la cooperativa activa (nombre, teléfonos, cifras) para las piezas comunes.
  C.usarNucleo(N);
  const E = C.empresa;
  separarViajeGuardado(E.id);
  // «de Subachoque», o «de tu municipio» si la ficha no trae el pueblo.
  const dePueblo = E.pueblo ? `de ${E.pueblo}` : 'de tu municipio';
  raiz.innerHTML = C.escenaHTML({
    tipo: 'pasajero',
    contenido: `<div class="c-app c-pasajero" data-vista="carga">
      <div class="c-mapa-envoltura"><div class="c-mapa"></div><div class="c-mapa-vineta"></div></div>
      <div class="c-pin-central" aria-hidden="true"><div class="c-pin-cabeza"><span></span></div><div class="c-pin-palo"></div><div class="c-pin-sombra"></div></div>
      <div class="c-radar" aria-hidden="true"><span></span><span></span><span></span><i></i><b></b></div>
      <header class="c-cabecera"></header>
      <main class="c-contenido" id="c-contenido"></main>
      <nav class="c-nav c-vidrio" aria-label="Secciones de la app" hidden>
        <button type="button" data-accion="tab" data-tab="inicio">${icono('mapa')}<span>Inicio</span></button>
        <button type="button" data-accion="tab" data-tab="viajes">${icono('viajes')}<span>Viajes</span></button>
        <button type="button" data-accion="tab" data-tab="billetera">${icono('billetera')}<span>Billetera</span></button>
        <button type="button" data-accion="tab" data-tab="perfil">${icono('perfil')}<span>Perfil</span></button>
      </nav>
      <div class="c-capa-registro" hidden></div>
      <div class="c-avisos" aria-live="polite" aria-atomic="false"></div>
    </div>`,
  });
  if (vitrina) document.documentElement.dataset.vitrina = '1';

  const app = raiz.querySelector('.c-app');
  const cabecera = app.querySelector('.c-cabecera');
  const contenido = app.querySelector('.c-contenido');
  const nav = app.querySelector('.c-nav');
  const capaRegistro = app.querySelector('.c-capa-registro');
  const avisar = C.crearAvisos(app.querySelector('.c-avisos'));
  document.addEventListener('pointerdown', () => N.prepararSonido(), { once: true, capture: true });

  app.querySelector('.c-mapa').dataset.capa = C.CAPA_MAPA;
  const m = await N.crearMapa(app.querySelector('.c-mapa'), {
    capa: C.CAPA_MAPA,
    colorRuta: AMARILLO,
    colorTaxi: C.COLORES.taxi,
    colorOrigen: CIAN,
    colorDestino: '#FF4D9D',
    controles: false,
    zoom: 16,
  });
  // El núcleo descarta al recargar un viaje simulado que iba en curso: se le
  // cuenta al usuario para que no crea que la app se «perdió».
  let viajeReiniciado = false;
  try {
    const g = JSON.parse(sessionStorage.getItem('ct.viaje.pasajero') || 'null');
    viajeReiniciado = Boolean(g?.estado?.viaje?.simulado && ['buscando', 'asignado', 'llego', 'en_viaje'].includes(g.fase));
  } catch {
    viajeReiniciado = false;
  }
  C.marcadoresSinFoco(m.mapa);
  const p = await N.crearPasajero();

  /* ------------------------------------------------------------------ */
  /* Estado de la interfaz                                              */
  /* ------------------------------------------------------------------ */
  const ui = {
    tab: 'inicio',
    sub: null,
    paso: 'recogida', // recogida | destino | mapa | confirmar
    origen: null,
    destino: null,
    sinDestino: false,
    puntoMapa: null,
    cot: null,
    metodoPago: 'qr',
    programar: false,
    fecha: '',
    nota: '',
    abrirNota: false,
    categoria: 'centro',
    q: '',
    guardando: null,
    viajesVista: 'historial',
    pinY: 0,
    etaInicial: null,
    etaViajeInicial: null,
    calif: { estrellas: 0, etiquetas: new Set() },
  };
  const pos0 = p.estado.miPosicion || N.CENTRO;
  ui.origen = { lat: pos0.lat, lng: pos0.lng, titulo: 'Tu ubicación', detalle: '' };
  if (p.estado.miPosicion?.real) m.ponerYo(p.estado.miPosicion);

  let claveVista = null;
  let faseAnterior = null;
  let pendiente = false;
  let limpiezas = [];
  let deslizador = null;
  let escaner = null;
  let hojaPago = null;
  let opcionesLista = [];
  let atajosLista = [];
  let ultimoEncuadre = 0;

  const programar = () => {
    if (pendiente) return;
    pendiente = true;
    requestAnimationFrame(() => {
      pendiente = false;
      pintar();
    });
  };
  const repintar = () => {
    claveVista = null;
    programar();
  };
  const irA = (paso) => {
    ui.paso = paso;
    programar();
  };
  const irATab = (tab, sub = null) => {
    ui.tab = tab;
    ui.sub = sub;
    if (tab === 'inicio') ui.paso = 'recogida';
    programar();
  };
  const nombre = () => p.perfil?.nombre || '';
  const primerNombre = () => N.primerNombre(nombre());
  const miles = (n) => Number(n || 0).toLocaleString('es-CO');

  /* ------------------------------------------------------------------ */
  /* Geometría: pin central y encuadres que respetan cabecera y tarjeta */
  /* ------------------------------------------------------------------ */
  function zonaVisible() {
    const a = app.getBoundingClientRect();
    const cab = cabecera.getBoundingClientRect();
    const tar = contenido.querySelector('.c-tarjeta');
    const arriba = cab.height ? cab.bottom - a.top : 0;
    const abajo = tar ? tar.getBoundingClientRect().top - a.top : nav.hidden ? a.height : nav.getBoundingClientRect().top - a.top;
    return { arriba, abajo, alto: a.height };
  }
  function ajustarPin() {
    const z = zonaVisible();
    ui.pinY = Math.round(Math.max(z.arriba + 70, (z.arriba + z.abajo) / 2));
    app.style.setProperty('--c-pin-y', `${ui.pinY}px`);
    app.style.setProperty('--c-atrib-arriba', `${Math.round(z.arriba + 6)}px`);
  }
  function centrarEnPin(punto, zoom) {
    if (!punto) return;
    const mapa = m.mapa;
    const z = zoom ?? mapa.getZoom();
    const desfase = ui.pinY - mapa.getSize().y / 2;
    const pt = mapa.project([punto.lat, punto.lng], z).subtract([0, desfase]);
    mapa.setView(mapa.unproject(pt, z), z, { animate: !C.reducirMovimiento() });
  }
  function puntoBajoPin() {
    const ll = m.mapa.containerPointToLatLng([m.mapa.getSize().x / 2, ui.pinY]);
    return { lat: ll.lat, lng: ll.lng };
  }
  function encuadrar(puntos, maxZoom = 17) {
    const validos = puntos.filter(Boolean);
    if (validos.length < 2) return centrarEnPin(validos[0], maxZoom);
    const z = zonaVisible();
    const arriba = Math.max(60, z.arriba + 30);
    const abajo = z.alto - z.abajo + 40;
    m.ajustar(validos, { margen: [56, arriba], margenAbajo: Math.max(0, abajo - arriba), maxZoom });
    ultimoEncuadre = Date.now();
  }
  // Si el taxi se sale de la zona visible, se vuelve a encuadrar (máx. cada 3 s).
  function mantenerVisible(punto, otro) {
    if (!punto || Date.now() - ultimoEncuadre < 3000) return;
    const z = zonaVisible();
    const pt = m.mapa.latLngToContainerPoint([punto.lat, punto.lng]);
    const w = m.mapa.getSize().x;
    if (pt.y < z.arriba + 20 || pt.y > z.abajo - 20 || pt.x < 20 || pt.x > w - 20) encuadrar([punto, otro]);
  }

  /* ------------------------------------------------------------------ */
  /* Direcciones (con antirrebote y descarte de respuestas viejas)      */
  /* ------------------------------------------------------------------ */
  let tokenOrigen = 0;
  let tokenMapa = 0;
  const resolverOrigen = N.antirrebote(async () => {
    const t = ++tokenOrigen;
    const punto = ui.origen;
    const d = await N.direccionDe(punto);
    if (t !== tokenOrigen || ui.origen !== punto) return;
    ui.origen = { ...punto, titulo: d.titulo, detalle: d.detalle };
    pintarDireccionOrigen();
  }, 350);
  const resolverPuntoMapa = N.antirrebote(async () => {
    const t = ++tokenMapa;
    const punto = ui.puntoMapa;
    if (!punto) return;
    const d = await N.direccionDe(punto);
    if (t !== tokenMapa || ui.puntoMapa !== punto) return;
    ui.puntoMapa = { ...punto, titulo: d.titulo, detalle: d.detalle };
    pintarPuntoMapa();
  }, 350);

  function pintarDireccionOrigen() {
    const enConfirmar = contenido.querySelector('[data-origen-confirmar]');
    if (enConfirmar && enConfirmar.textContent !== ui.origen.titulo) enConfirmar.textContent = ui.origen.titulo || 'Punto en el mapa';
    const t = contenido.querySelector('[data-dir-titulo]');
    if (!t) return;
    const ubicando = ui.origen.titulo === 'Ubicando…';
    t.textContent = ui.origen.titulo || 'Punto en el mapa';
    t.classList.toggle('c-cargando-texto', ubicando);
    contenido.querySelector('[data-dir-detalle]').textContent = ubicando ? '' : ui.origen.detalle || '';
  }
  function pintarPuntoMapa() {
    const t = contenido.querySelector('[data-mapa-titulo]');
    if (!t || !ui.puntoMapa) return;
    t.textContent = ui.puntoMapa.titulo;
    t.classList.toggle('c-cargando-texto', ui.puntoMapa.titulo === 'Ubicando…');
    contenido.querySelector('[data-mapa-detalle]').textContent = ui.puntoMapa.detalle || '';
    const b = contenido.querySelector('[data-accion="confirmar-mapa"]');
    if (b) b.disabled = ui.puntoMapa.titulo === 'Ubicando…';
  }

  m.alEmpezarAMoverse(() => {
    if (claveVista === 'inicio:recogida' || claveVista === 'inicio:mapa') app.classList.add('c-moviendo');
  });
  m.alMoverse(() => {
    app.classList.remove('c-moviendo');
    if (claveVista === 'inicio:recogida') {
      const c = puntoBajoPin();
      if (ui.origen && N.distanciaKm(c, ui.origen) < 0.008) return;
      ui.origen = { ...c, titulo: 'Ubicando…', detalle: '' };
      pintarDireccionOrigen();
      resolverOrigen();
    } else if (claveVista === 'inicio:mapa') {
      const c = puntoBajoPin();
      if (ui.puntoMapa && N.distanciaKm(c, ui.puntoMapa) < 0.008) return;
      ui.puntoMapa = { ...c, titulo: 'Ubicando…', detalle: '' };
      pintarPuntoMapa();
      resolverPuntoMapa();
    }
  });
  m.mapa.on('dragstart', () => (ultimoEncuadre = Date.now() + 6000));

  /* ------------------------------------------------------------------ */
  /* Ciclo de pintado                                                   */
  /* ------------------------------------------------------------------ */
  function claveActual() {
    if (!p.registrado) return 'registro';
    const f = p.estado.fase;
    if (f !== 'inicio') return `viaje:${f}`;
    if (ui.tab !== 'inicio') return `tab:${ui.tab}${ui.sub ? ':' + ui.sub : ''}`;
    return `inicio:${ui.paso}`;
  }

  function pintar() {
    const e = p.estado;
    if (e.fase !== faseAnterior) {
      const antes = faseAnterior;
      faseAnterior = e.fase;
      alCambiarFase(antes, e.fase);
    }
    const clave = claveActual();
    if (clave !== claveVista) {
      claveVista = clave;
      pintarVista(clave);
    }
    vistaDe(clave).actualizar?.(e);
    actualizarConexion(e);
  }

  function vistaDe(clave) {
    if (clave.startsWith('tab:')) return VISTAS.tab;
    return VISTAS[clave] || VISTAS['inicio:recogida'];
  }

  function pintarVista(clave) {
    for (const f of limpiezas.splice(0)) f();
    deslizador = null;
    app.dataset.vista = clave.replace(/:/g, '-');
    app.dataset.fase = p.estado.fase;
    // La bienvenida y el registro tapan todo: lo de atrás no debe recibir foco.
    C.inerte([app.querySelector('.c-mapa-envoltura'), cabecera, contenido, nav], clave === 'registro');
    if (clave === 'registro') {
      capaRegistro.hidden = false;
      cabecera.innerHTML = '';
      contenido.innerHTML = '';
      nav.hidden = true;
      app.dataset.nav = '0';
      montarRegistro(capaRegistro, {
        N,
        alTerminar: () => {
          capaRegistro.hidden = true;
          capaRegistro.innerHTML = '';
          avisar({ titulo: `¡Listo, ${primerNombre()}!`, cuerpo: 'Ya puedes pedir tu taxi. Mueve el mapa para ajustar el punto de recogida.', tipo: 'exito' });
          N.sonar('exito');
          repintar();
        },
      });
      return;
    }
    capaRegistro.hidden = true;
    const v = vistaDe(clave);
    const { cabeza = '', cuerpo = '' } = v.html(clave);
    cabecera.innerHTML = cabeza;
    contenido.innerHTML = cuerpo;
    nav.hidden = !(p.estado.fase === 'inicio' && (ui.tab !== 'inicio' || ui.paso === 'recogida'));
    app.dataset.nav = nav.hidden ? '0' : '1';
    for (const b of nav.querySelectorAll('[data-tab]')) {
      if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    ajustarPin();
    v.montar?.(clave);
    v.entrar?.(clave);
    actualizarConexion(p.estado, true);
  }

  let conexionPintada = null;
  function actualizarConexion(e, forzar = false) {
    if (!forzar && conexionPintada === e.conexion) return;
    conexionPintada = e.conexion;
    for (const el of app.querySelectorAll('[data-conexion]')) {
      el.dataset.estado = e.conexion;
      el.textContent = e.conexion === 'en-vivo' ? 'En vivo' : 'Solo este equipo';
      el.title = e.conexion === 'en-vivo' ? 'Conectado con los celulares de la sala' : 'Funciona en este equipo (sin relé en vivo)';
    }
  }

  function alCambiarFase(antes, ahora) {
    if (antes && antes !== ahora) C.cerrarHojas(app);
    detenerEscaner();
    if (ahora !== 'inicio') {
      ui.tab = 'inicio';
      ui.sub = null;
    }
    if (ahora === 'inicio' && antes && antes !== 'inicio') {
      Object.assign(ui, { paso: 'recogida', destino: null, sinDestino: false, cot: null, programar: false, nota: '', abrirNota: false, tab: 'inicio', sub: null });
      m.quitarRuta();
      m.quitarDestino();
      m.quitarOrigen();
      m.quitarTaxi('asignado');
    }
    if (ahora === 'asignado') ui.etaInicial = null;
    if (ahora === 'en_viaje') ui.etaViajeInicial = null;
    if (ahora === 'calificar') ui.calif = { estrellas: 0, etiquetas: new Set() };
  }

  /* ------------------------------------------------------------------ */
  /* Piezas de interfaz                                                 */
  /* ------------------------------------------------------------------ */
  const filaArriba = (izquierda) => `<div class="c-fila-arriba">${izquierda}<span class="c-conexion" data-conexion></span></div>`;
  // Dentro de TaxiCun, una marca discreta junto al saludo: abre una hoja con la
  // cooperativa que atiende y la opción de cambiar de municipio.
  const marcaMini = () => (C.enTaxiCun()
    ? `<button type="button" class="c-marca-mini" data-accion="marca-taxicun" aria-label="${esc(`${C.marcaTaxiCun.nombre} · ${E.nombre}`)}: cambiar de municipio">${C.iconoTaxiCunHTML(30)}</button>`
    : '');

  function chipFase(texto, ico = 'taxi') {
    return `<span class="c-chip-fase c-vidrio">${icono(ico)}<span>${esc(texto)}</span></span>`;
  }

  function ponerTaxiAsignado() {
    const e = p.estado;
    if (!e.posConductor) return;
    m.ponerTaxi('asignado', e.posConductor, { rumbo: e.posConductor.rumbo || 0, destacado: true, etiqueta: esc(e.conductor?.movil || '') });
  }

  function botonesSeguridad({ cancelar = true, llamar = true } = {}) {
    const cd = p.estado.conductor || {};
    // Se llama al conductor o, si no hay su número, a la central (si la cooperativa lo tiene).
    const tel = String(cd.tel || '').replace(/\D/g, '') || E.telefono;
    if (!tel) llamar = false;
    const wa = N.enlaceWhatsApp(cd.tel || E.whatsapp, `Hola ${N.primerNombre(cd.nombre || '')}, soy ${primerNombre()}, tu pasajero de ${E.nombre}.`);
    const demo = N.esTelDemo(tel);
    return `<div class="c-acciones-viaje${llamar ? '' : ' c-acciones-dos'}">
      ${llamar && demo ? `<button type="button" class="c-accion" data-accion="llamada-demo">${icono('telefono')}<span>Llamar</span></button>
      <button type="button" class="c-accion" data-accion="llamada-demo">${icono('chat')}<span>WhatsApp</span></button>` : ''}
      ${llamar && !demo ? `<a class="c-accion" href="tel:${esc(tel)}">${icono('telefono')}<span>Llamar</span></a>
      <a class="c-accion" href="${esc(wa)}" target="_blank" rel="noopener">${icono('chat')}<span>WhatsApp</span></a>` : ''}
      <button type="button" class="c-accion" data-accion="compartir">${icono('compartir')}<span>Compartir</span></button>
      <button type="button" class="c-accion c-accion-sos" data-accion="sos">${icono('escudo')}<span>SOS</span></button>
    </div>${cancelar ? `<button type="button" class="c-boton-texto c-cancelar" data-accion="cancelar-viaje">Cancelar servicio</button>` : ''}`;
  }

  /* ------------------------------------------------------------------ */
  /* Vistas                                                             */
  /* ------------------------------------------------------------------ */
  const secciones = crearSecciones({ N, p, app, ui, avisar, irATab, repintar, programar, abrirEscaner, icono, esc });

  const VISTAS = {
    /* ---------- Inicio: punto de recogida ---------- */
    'inicio:recogida': {
      html() {
        atajosLista = construirAtajos();
        return {
          cabeza: `${filaArriba(`<span class="c-fila-izq"><button type="button" class="c-saludo" data-accion="tab" data-tab="perfil" aria-label="Abrir tu perfil">${C.avatarHTML(nombre(), 'c-avatar-chico')}<span><small>${esc(N.saludo())}</small><strong>${esc(primerNombre())}</strong></span></button>${marcaMini()}</span>`)}
            <button type="button" class="c-pildora-busqueda c-vidrio" data-accion="abrir-destino">
              <span class="c-pildora-ico">${icono('buscar')}</span>
              <span class="c-pildora-texto"><strong>¿A dónde vas?</strong><small>Busca un lugar o una dirección</small></span>
              <span class="c-pildora-fin">${icono('flecha')}</span>
            </button>`,
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-inicio c-entrar" aria-label="Punto de recogida">
              <div class="c-recogida">
                <span class="c-recogida-ico">${icono('pin')}</span>
                <div class="c-recogida-texto"><small>Te recogemos en</small><strong data-dir-titulo>${esc(ui.origen.titulo)}</strong><span data-dir-detalle>${esc(ui.origen.detalle || '')}</span></div>
                <button type="button" class="c-boton-icono c-boton-icono-chico" data-accion="mi-ubicacion" aria-label="Volver a mi ubicación">${icono('mira')}</button>
              </div>
              <p class="c-nota-gps" data-sin-gps hidden>${icono('alerta')}<span>Usamos el centro ${esc(dePueblo)}; mueve el mapa para ubicar tu punto.</span></p>
              <div class="c-atajos" role="list" aria-label="Destinos rápidos">
                ${atajosLista.map((a, i) => `<button type="button" role="listitem" class="c-chip c-atajo" data-accion="atajo" data-i="${i}">${icono(a.icono)}<span>${esc(a.texto)}</span></button>`).join('')}
              </div>
              <div class="c-cercanos"><span class="c-pulso" aria-hidden="true"></span><span data-cercanos>Buscando taxis cerca…</span></div>
            </section>`,
        };
      },
      entrar() {
        app.dataset.pin = 'origen';
        m.quitarRuta();
        m.quitarOrigen();
        m.quitarDestino();
        m.quitarTaxi('asignado');
        centrarEnPin(ui.origen, Math.max(16, Math.min(17, m.mapa.getZoom())));
        pintarDireccionOrigen();
        if (ui.origen.titulo === 'Tu ubicación' || ui.origen.titulo === 'Ubicando…') resolverOrigen();
      },
      actualizar(e) {
        m.sincronizarTaxis(e.taxisCercanos);
        const sinGps = contenido.querySelector('[data-sin-gps]');
        if (sinGps) sinGps.hidden = e.miPosicion?.real !== false;
        const cerca = contenido.querySelector('[data-cercanos]');
        if (cerca) {
          const libres = e.taxisCercanos.filter((t) => !t.ocupado);
          let texto = 'Buscando taxis cerca…';
          if (libres.length) {
            const km = Math.min(...libres.map((t) => N.distanciaKm(t, ui.origen)));
            const min = Math.max(2, Math.round(((km * 1.35) / 22) * 60 + 1));
            texto = `${libres.length} ${libres.length === 1 ? 'taxi libre' : 'taxis libres'} de ${e.taxisCercanos.length} en línea · el más cercano a ~${min}\u00a0min`;
          }
          if (cerca.textContent !== texto) cerca.textContent = texto;
        }
      },
    },

    /* ---------- Inicio: buscar destino ---------- */
    'inicio:destino': {
      html() {
        const guardando = ui.guardando;
        return {
          cabeza: '',
          cuerpo: `<section class="c-panel-destino" aria-label="Elegir destino">
            <div class="c-buscador c-vidrio">
              <button type="button" class="c-boton-icono c-boton-icono-chico" data-accion="volver-recogida" aria-label="Volver">${icono('atras')}</button>
              <div class="c-buscador-campos">
                <div class="c-campo-fijo"><span class="c-punto c-punto-cian"></span><span class="c-campo-fijo-texto">${esc(ui.origen.titulo)}</span></div>
                <label class="c-campo-busqueda"><span class="c-punto c-punto-magenta"></span>
                  <span class="c-oculto-visual">${guardando ? `Dirección de tu ${guardando}` : 'Destino'}</span>
                  <input id="c-q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${guardando ? `Busca la dirección de tu ${guardando}` : '¿A dónde vas?'}" value="${esc(ui.q)}">
                  <button type="button" class="c-limpiar" data-accion="limpiar-busqueda" aria-label="Borrar búsqueda" ${ui.q ? '' : 'hidden'}>${icono('x')}</button>
                </label>
              </div>
            </div>
            ${guardando
              ? `<p class="c-guardando">${icono(guardando === 'casa' ? 'casa' : 'trabajo')}<span>Elige la dirección de tu <strong>${guardando}</strong> para guardarla.</span><button type="button" class="c-boton-texto" data-accion="cancelar-guardar">Cancelar</button></p>`
              : `<div class="c-acciones-destino">
                  <button type="button" class="c-chip" data-accion="elegir-mapa">${icono('mapa')}<span>Elegir en el mapa</span></button>
                  <button type="button" class="c-chip" data-accion="sin-destino">${icono('chat')}<span>Se lo digo al conductor</span></button>
                </div>`}
            <div class="c-resultados" id="c-resultados"></div>
          </section>`,
        };
      },
      montar() {
        const input = contenido.querySelector('#c-q');
        const limpiar = contenido.querySelector('[data-accion="limpiar-busqueda"]');
        const buscarRemoto = N.antirrebote((q) => buscar(q), 420);
        input.addEventListener('input', () => {
          ui.q = input.value;
          limpiar.hidden = !ui.q;
          if (ui.q.trim().length === 0) return pintarListaInicial();
          pintarResultados(N.buscarLocal(ui.q).map((r) => ({ ...r })), true);
          buscarRemoto(ui.q);
        });
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            input.blur();
          }
        });
        if (ui.q.trim()) {
          pintarResultados(N.buscarLocal(ui.q), true);
          buscar(ui.q);
        } else pintarListaInicial();
        setTimeout(() => input.focus({ preventScroll: true }), 120);
      },
    },

    /* ---------- Inicio: elegir destino en el mapa ---------- */
    'inicio:mapa': {
      html() {
        return {
          cabeza: `<div class="c-fila-arriba"><button type="button" class="c-boton-icono" data-accion="abrir-destino" aria-label="Volver a la búsqueda">${icono('atras')}</button><span class="c-chip-fase c-vidrio">${icono('mapa')}<span>Mueve el mapa hasta tu destino</span></span></div>`,
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-mapa c-entrar" aria-label="Destino elegido en el mapa">
            <div class="c-recogida">
              <span class="c-recogida-ico c-recogida-ico-magenta">${icono('pin')}</span>
              <div class="c-recogida-texto"><small>Destino</small><strong data-mapa-titulo>Ubicando…</strong><span data-mapa-detalle></span></div>
            </div>
            <button type="button" class="c-boton c-boton-grande c-boton-ancho" data-accion="confirmar-mapa">Usar este destino ${icono('check')}</button>
          </section>`,
        };
      },
      entrar() {
        app.dataset.pin = 'destino';
        m.quitarRuta();
        m.quitarDestino();
        m.ponerOrigen(ui.origen);
        const base = ui.puntoMapa || ui.destino || ui.origen;
        centrarEnPin(base, 16);
        setTimeout(() => {
          ui.puntoMapa = { ...puntoBajoPin(), titulo: 'Ubicando…', detalle: '' };
          pintarPuntoMapa();
          resolverPuntoMapa();
        }, C.reducirMovimiento() ? 0 : 450);
      },
    },

    /* ---------- Inicio: confirmar viaje ---------- */
    'inicio:confirmar': {
      html() {
        const destinoTitulo = ui.sinDestino ? 'Se lo digo al conductor' : ui.destino?.titulo || 'Destino';
        const fid = N.progresoFidelidad(p.viajesCompletados());
        return {
          cabeza: `<div class="c-fila-arriba"><button type="button" class="c-boton-icono" data-accion="cambiar-destino" aria-label="Cambiar el destino">${icono('atras')}</button><span class="c-chip-fase c-vidrio">${icono('ruta')}<span>Confirma tu viaje</span></span></div>`,
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-confirmar c-entrar" aria-label="Confirmar viaje">
            <div class="c-trayecto">
              <div class="c-trayecto-punto"><span class="c-punto c-punto-cian"></span><div><small>Recogida</small><strong data-origen-confirmar>${esc(ui.origen.titulo)}</strong></div></div>
              <div class="c-trayecto-punto"><span class="c-punto c-punto-magenta"></span><div><small>Destino</small><strong>${esc(destinoTitulo)}</strong></div><button type="button" class="c-boton-texto" data-accion="cambiar-destino">Cambiar</button></div>
            </div>
            <div class="c-cotizacion" data-cotizacion aria-live="polite">
              <div class="c-precio"><small>Tarifa estimada</small><strong data-total><span class="c-esqueleto"></span></strong><span class="c-etiqueta c-etiqueta-amarilla">Tarifa de ejemplo</span></div>
              <div class="c-metricas"><div><strong data-km>–</strong><small>distancia</small></div><div><strong data-min>–</strong><small>tiempo</small></div></div>
            </div>
            <details class="c-detalle-tarifa"><summary>Ver detalle de la tarifa ${icono('abajo')}</summary><ul data-detalle></ul><p>Valores de ejemplo: la ${E.tipo} confirmará las tarifas oficiales.</p></details>
            <div class="c-segmentado" role="radiogroup" aria-label="Método de pago">
              <button type="button" role="radio" aria-checked="${ui.metodoPago === 'qr'}" data-accion="pago" data-pago="qr">${icono('qr')} QR <small>(prueba)</small></button>
              <button type="button" role="radio" aria-checked="${ui.metodoPago === 'efectivo'}" data-accion="pago" data-pago="efectivo">${icono('efectivo')} Efectivo</button>
            </div>
            <div class="c-opciones-viaje">
              <button type="button" class="c-chip" data-accion="alternar-programar" aria-expanded="${ui.programar}" aria-pressed="${ui.programar}">${icono('calendario')}<span>Programar</span></button>
              <button type="button" class="c-chip" data-accion="alternar-nota" aria-expanded="${ui.abrirNota}" aria-pressed="${ui.abrirNota || Boolean(ui.nota)}">${icono('nota')}<span>Nota</span></button>
            </div>
            <div class="c-programar" data-programar ${ui.programar ? '' : 'hidden'}>
              <label class="c-campo-etiqueta">Fecha y hora de recogida<input class="c-input" type="datetime-local" id="c-fecha" value="${esc(ui.fecha)}"></label>
              <p class="c-programar-msg" data-programar-msg></p>
            </div>
            <div class="c-nota" data-nota ${ui.abrirNota ? '' : 'hidden'}>
              <label class="c-campo-etiqueta">Nota para el conductor<input class="c-input" id="c-nota" maxlength="120" placeholder="Ej.: casa de reja verde, timbre 2" value="${esc(ui.nota)}"></label>
            </div>
            <div class="c-fidelidad-mini" aria-label="Tarjeta de fidelidad: ${fid.completados} de ${fid.meta} viajes">
              <div class="c-fidelidad-puntos">${Array.from({ length: fid.meta }, (_, i) => `<span class="${i < fid.completados ? 'c-lleno' : ''}"></span>`).join('')}</div>
              <small>${fid.siguienteConDescuento ? '¡Este viaje va con 50 % de descuento!' : `${fid.completados}/${fid.meta} viajes · te faltan ${fid.faltan} para un viaje al 50 %`}</small>
            </div>
            ${C.deslizadorHTML(ui.programar ? 'Desliza para programar' : 'Desliza para pedir', ui.programar ? 'Programar el viaje' : 'Pedir taxi')}
          </section>`,
        };
      },
      montar() {
        deslizador = C.montarDeslizador(contenido.querySelector('[data-deslizador]'), pedir);
        const fecha = contenido.querySelector('#c-fecha');
        fecha.min = aFechaLocal(Date.now() + 35 * 60 * 1000);
        fecha.addEventListener('change', () => {
          ui.fecha = fecha.value;
          pintarMensajeProgramar();
          cotizar();
        });
        contenido.querySelector('#c-nota').addEventListener('input', (ev) => (ui.nota = ev.target.value));
        pintarMensajeProgramar();
      },
      entrar() {
        app.dataset.pin = '';
        ui.rutaPintada = null;
        m.ponerOrigen(ui.origen);
        if (ui.sinDestino) {
          m.quitarDestino();
          m.quitarRuta();
          centrarEnPin(ui.origen, 17);
        } else m.ponerDestino(ui.destino);
        cotizar();
      },
      actualizar(e) {
        m.sincronizarTaxis(e.taxisCercanos);
      },
    },

    /* ---------- Viaje: buscando ---------- */
    'viaje:buscando': {
      html() {
        const v = p.estado.viaje;
        return {
          cabeza: filaArriba(chipFase('Buscando tu taxi', 'buscar')),
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-buscando c-entrar" aria-label="Buscando taxi">
            <div class="c-buscando-cabeza">
              <span class="c-orbita" aria-hidden="true"><span></span></span>
              <div><h2>Buscando tu taxi</h2><p data-msg aria-live="polite">Avisando a los móviles cercanos…</p></div>
            </div>
            <div class="c-barra-indeterminada" aria-hidden="true"><span></span></div>
            <div class="c-resumen-viaje">
              <div><small>Destino</small><strong>${esc(v?.destino?.titulo || 'Se lo dices al conductor')}</strong></div>
              <div><small>Tarifa</small><strong>${N.pesos(v?.tarifa?.total || 0)}</strong></div>
              <div><small>Pago</small><strong>${v?.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}</strong></div>
            </div>
            <button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-accion="cancelar-viaje">${icono('x')} Cancelar solicitud</button>
          </section>`,
        };
      },
      entrar() {
        const v = p.estado.viaje;
        m.quitarRuta();
        m.quitarDestino();
        m.quitarTaxi('asignado');
        m.quitarOrigen();
        if (v?.origen) centrarEnPin(v.origen, 16);
        const mensajes = ['Avisando a los móviles cercanos…', 'Buscando el taxi más cercano a ti…', 'Confirmando tu punto de recogida…', `Los conductores ${dePueblo} ya ven tu solicitud…`, 'Ya casi: un móvil está por aceptar…'];
        let i = 0;
        const t = setInterval(() => {
          const el = contenido.querySelector('[data-msg]');
          if (!el) return;
          i = (i + 1) % mensajes.length;
          el.classList.remove('c-msg-entra');
          void el.offsetWidth;
          el.textContent = mensajes[i];
          el.classList.add('c-msg-entra');
        }, 2600);
        limpiezas.push(() => clearInterval(t));
      },
      actualizar(e) {
        m.sincronizarTaxis(e.taxisCercanos);
      },
    },

    /* ---------- Viaje: asignado (en camino) ---------- */
    'viaje:asignado': {
      html() {
        return { cabeza: filaArriba(chipFase('Tu taxi va en camino', 'taxi')), cuerpo: tarjetaConductor('asignado') };
      },
      entrar() {
        const e = p.estado;
        m.limpiarTaxis('asignado');
        m.quitarDestino();
        m.ponerOrigen(e.viaje.origen);
        if (e.rutaConductor?.length) m.ponerRuta(e.rutaConductor, { color: CIAN, grosor: 4 });
        else m.quitarRuta();
        ponerTaxiAsignado();
        encuadrar([e.posConductor, e.viaje.origen]);
      },
      actualizar(e) {
        ponerTaxiAsignado();
        mantenerVisible(e.posConductor, e.viaje?.origen);
        const eta = e.etaMin;
        if (eta == null) return;
        if (ui.etaInicial == null || eta > ui.etaInicial) ui.etaInicial = Math.max(eta, 1);
        const num = contenido.querySelector('[data-eta-num]');
        if (!num) return;
        const cerca = e.posConductor && e.viaje?.origen ? N.distanciaKm(e.posConductor, e.viaje.origen) < 0.3 : false;
        const minutos = Math.max(1, Math.round(eta));
        const texto = eta < 0.6 || cerca ? '<1' : String(minutos);
        if (num.textContent !== texto) num.textContent = texto;
        C.fijarAnillo(contenido.querySelector('.c-anillo'), cerca ? Math.max(0.92, 1 - eta / ui.etaInicial) : 1 - eta / ui.etaInicial);
        const sub = contenido.querySelector('[data-eta-sub]');
        const llegada = cerca ? 'Alístate: está a menos de 1 minuto' : `Llega cerca de las ${N.horaTexto(Date.now() + eta * 60000)}`;
        if (sub.textContent !== llegada) sub.textContent = llegada;
        const titulo = contenido.querySelector('[data-eta-titulo]');
        const t = eta < 1.2 || cerca ? 'Tu taxi está llegando' : 'Tu taxi va en camino';
        if (titulo.textContent !== t) titulo.textContent = t;
      },
    },

    /* ---------- Viaje: llegó a la puerta ---------- */
    'viaje:llego': {
      html() {
        return { cabeza: filaArriba(chipFase('Tu taxi llegó', 'campana')), cuerpo: tarjetaConductor('llego') };
      },
      entrar() {
        const e = p.estado;
        m.limpiarTaxis('asignado');
        m.quitarRuta();
        m.ponerOrigen(e.viaje.origen);
        ponerTaxiAsignado();
        centrarEnPin(e.viaje.origen, 17);
      },
      actualizar() {
        ponerTaxiAsignado();
      },
    },

    /* ---------- Viaje: en viaje ---------- */
    'viaje:en_viaje': {
      html() {
        const e = p.estado;
        const v = e.viaje;
        const cd = e.conductor || {};
        return {
          cabeza: filaArriba(chipFase('En viaje', 'ruta')),
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-enviaje c-entrar" aria-label="Viaje en curso">
            <div class="c-enviaje-cabeza">
              <div><small>En viaje hacia</small><h2>${esc(v.destino?.titulo || 'Destino a convenir')}</h2></div>
              ${v.simulado ? C.etiquetasPrueba() : ''}
            </div>
            <div class="c-progreso-viaje">
              <div class="c-progreso-pista" role="progressbar" aria-label="Avance del viaje" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-progreso-barra>
                <div class="c-progreso-barra" data-progreso></div>
                <span class="c-progreso-taxi" data-progreso-taxi>${icono('taxi')}</span>
              </div>
            </div>
            <div class="c-enviaje-metricas">
              <div><strong data-eta-viaje>–</strong><small>para llegar</small></div>
              <div><strong data-hora-llegada>–</strong><small>llegada aprox.</small></div>
              <div><strong>${N.pesos(v.tarifa?.total || 0)}</strong><small>${v.metodoPago === 'efectivo' ? 'en efectivo' : 'con QR'}</small></div>
            </div>
            <div class="c-conductor-mini">${C.avatarHTML(cd.nombre, 'c-avatar-chico')}<div><strong>${esc(cd.nombre)}</strong><span>Móvil ${esc(cd.movil)} · ${esc(cd.vehiculo || E.vehiculo)}</span></div>${C.placaHTML(cd.placa)}</div>
            ${botonesSeguridad({ cancelar: false, llamar: false })}
          </section>`,
        };
      },
      entrar() {
        const e = p.estado;
        const v = e.viaje;
        m.limpiarTaxis('asignado');
        m.quitarOrigen();
        if (v.destino) m.ponerDestino(v.destino);
        if (v.ruta?.coords?.length && v.destino) m.ponerRuta(v.ruta.coords, { color: AMARILLO });
        else m.quitarRuta();
        ponerTaxiAsignado();
        encuadrar([e.posConductor || v.origen, v.destino]);
      },
      actualizar(e) {
        ponerTaxiAsignado();
        if (e.viaje?.destino) mantenerVisible(e.posConductor, e.viaje.destino);
        const eta = e.etaMin;
        if (eta == null) return;
        if (ui.etaViajeInicial == null || eta > ui.etaViajeInicial) ui.etaViajeInicial = Math.max(eta, 1);
        const avance = Math.max(0, Math.min(1, 1 - eta / ui.etaViajeInicial));
        const barra = contenido.querySelector('[data-progreso]');
        if (!barra) return;
        barra.style.transform = `scaleX(${avance})`;
        contenido.querySelector('[data-progreso-taxi]').style.left = `${avance * 100}%`;
        contenido.querySelector('[data-progreso-barra]').setAttribute('aria-valuenow', String(Math.round(avance * 100)));
        const t1 = eta < 0.6 ? 'Llegando' : N.minutosTexto(eta);
        const el1 = contenido.querySelector('[data-eta-viaje]');
        if (el1.textContent !== t1) el1.textContent = t1;
        const t2 = N.horaTexto(Date.now() + eta * 60000);
        const el2 = contenido.querySelector('[data-hora-llegada]');
        if (el2.textContent !== t2) el2.textContent = t2;
      },
    },

    /* ---------- Viaje: pagar ---------- */
    'viaje:pagar': {
      html() {
        const e = p.estado;
        const v = e.viaje;
        const cd = e.conductor || {};
        const valor = e.cobro?.valor || v.tarifa?.total || 0;
        return {
          cabeza: filaArriba(chipFase('Llegaste a tu destino', 'check')),
          cuerpo: `<section class="c-tarjeta c-vidrio c-borde-neon c-tarjeta-pagar c-entrar" aria-label="Pagar el viaje"><div class="c-desplazable">
            <div class="c-pagar-cabeza">${C.etiquetasPrueba()}<span class="c-muted">${esc(v.destino?.titulo || 'Fin del viaje')}</span></div>
            <p class="c-pagar-titulo">Total a pagar</p>
            <strong class="c-total" data-total>${N.pesos(valor)}</strong>
            <p class="c-pagar-sub">Móvil ${esc(cd.movil)} · ${esc(N.primerNombre(cd.nombre || ''))}${e.kmFinal ? ` · ${N.kmTexto(e.kmFinal)}` : ''}</p>
            <div class="c-pagar-botones">
              <button type="button" class="c-boton c-boton-grande c-boton-ancho" data-accion="escanear">${icono('camara')} Escanear QR del conductor</button>
              <button type="button" class="c-boton c-boton-cian c-boton-ancho" data-accion="simular-pago">${icono('qr')} Simular pago con QR (prueba)</button>
              <button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-accion="efectivo">${icono('efectivo')} Pagar en efectivo</button>
            </div>
            <details class="c-otro-celular" data-otro-celular>
              <summary>${icono('celular')} ¿Probar con otro celular? ${icono('abajo')}</summary>
              <div class="c-otro-cuerpo"><div class="c-qr-blanco" data-qr-otro></div><p>Escanéalo con la cámara de otro celular: se abre la página de pago de prueba de este viaje.</p></div>
            </details>
            <p class="c-nota-prueba">${icono('info')} Pago de prueba: no se mueve dinero real.</p>
          </div></section>`,
        };
      },
      montar() {
        const det = contenido.querySelector('[data-otro-celular]');
        det.addEventListener('toggle', () => {
          if (det.open) pintarQROtro();
        });
      },
      entrar() {
        const e = p.estado;
        m.quitarRuta();
        m.quitarOrigen();
        ponerTaxiAsignado();
        centrarEnPin(e.viaje.destino || e.posConductor, 16);
      },
      actualizar(e) {
        const t = contenido.querySelector('[data-total]');
        const valor = N.pesos(e.cobro?.valor || e.viaje?.tarifa?.total || 0);
        if (t && t.textContent !== valor) t.textContent = valor;
      },
    },

    /* ---------- Viaje: calificar ---------- */
    'viaje:calificar': {
      html() {
        const e = p.estado;
        const pago = e.pago || {};
        const cd = e.conductor || {};
        return {
          cabeza: filaArriba(chipFase('Califica tu viaje', 'estrella')),
          cuerpo: `<section class="c-tarjeta c-vidrio c-tarjeta-calificar c-entrar" aria-label="Calificar al conductor">
            <div class="c-pago-ok">
              <span class="c-check-neon">${icono('check')}</span>
              <div><strong>${pago.metodo === 'qr' ? 'Pago exitoso (prueba)' : 'Pago en efectivo registrado'}</strong>
              <small>${N.pesos(pago.valor || 0)}${pago.billetera ? ` · ${esc(pago.billetera)}` : ''}${pago.ref ? ` · Ref. ${esc(pago.ref)}` : ''}</small></div>
            </div>
            <div class="c-calificar-conductor">${C.avatarHTML(cd.nombre)}<h2>¿Cómo estuvo tu viaje con ${esc(N.primerNombre(cd.nombre || 'el conductor'))}?</h2></div>
            ${C.estrellasHTML('Califica al conductor')}
            <p class="c-estrellas-texto" data-estrellas-texto>Toca para calificar</p>
            <div class="c-etiquetas" role="group" aria-label="¿Qué te gustó?">
              ${N.ETIQUETAS_CALIFICACION.conductor.map((t) => `<button type="button" class="c-chip" aria-pressed="false" data-accion="etiqueta" data-etiqueta="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
            <label class="c-oculto-visual" for="c-comentario">Comentario para el conductor</label>
            <textarea class="c-input" id="c-comentario" maxlength="240" placeholder="Cuéntanos algo más (opcional)"></textarea>
            <div class="c-calif-recibida" data-calif-recibida hidden></div>
            <div class="c-fila-botones">
              <button type="button" class="c-boton-texto" data-accion="omitir-calificacion">Omitir</button>
              <button type="button" class="c-boton c-boton-grande" data-accion="enviar-calificacion">Enviar calificación</button>
            </div>
          </section>`,
        };
      },
      montar() {
        C.montarEstrellas(contenido.querySelector('.c-estrellas'), (n, texto) => {
          ui.calif.estrellas = n;
          const t = contenido.querySelector('[data-estrellas-texto]');
          t.textContent = texto;
          t.classList.toggle('c-activo', n > 0);
        });
      },
      entrar() {
        m.quitarRuta();
      },
      actualizar(e) {
        const el = contenido.querySelector('[data-calif-recibida]');
        if (!el || e.calificacionRecibida == null || !el.hidden) return;
        el.hidden = false;
        el.innerHTML = `${C.estrellasFijas(e.calificacionRecibida)}<span><strong>${esc(N.primerNombre(e.conductor?.nombre || 'El conductor'))}</strong> te calificó con ${e.calificacionRecibida} ${e.calificacionRecibida === 1 ? 'estrella' : 'estrellas'}</span>`;
      },
    },

    /* ---------- Pestañas: viajes, billetera y perfil ---------- */
    tab: {
      html(clave) {
        const [, tab, sub] = clave.split(':');
        return { cabeza: '', cuerpo: secciones.html(tab, sub) };
      },
      montar(clave) {
        const [, tab, sub] = clave.split(':');
        secciones.montar(tab, sub, contenido);
      },
      entrar() {
        app.dataset.pin = '';
      },
    },
  };

  function tarjetaConductor(fase) {
    const e = p.estado;
    const cd = e.conductor || {};
    const v = e.viaje;
    const llego = fase === 'llego';
    const digitos = String(v.codigo || '').split('').map((d) => `<span>${esc(d)}</span>`).join('');
    const prueba = v.simulado ? C.etiquetasPrueba() : '';
    return `<section class="c-tarjeta c-vidrio c-borde-neon c-tarjeta-conductor${llego ? ' c-llego' : ''} c-entrar" aria-labelledby="c-titulo-viaje"><div class="c-desplazable">
      ${llego
        ? `<div class="c-alerta-puerta" role="alert">
            <span class="c-alerta-ico">${icono('campana')}</span>
            <div><h2 id="c-titulo-viaje">¡Tu taxi está en la puerta!</h2><p>Busca el <strong>${sinCorte(`móvil ${cd.movil}`)}</strong> · placa <strong>${sinCorte(cd.placa)}</strong></p>${prueba}</div>
          </div>`
        : `<div class="c-eta-fila">
            ${C.anillo({ tam: 80, grosor: 7, id: 'c-anillo-eta', contenido: '<strong class="c-eta-num" data-eta-num>–</strong><small class="c-eta-min">min</small>', etiqueta: 'Tiempo estimado de llegada' })}
            <div class="c-eta-texto"><h2 id="c-titulo-viaje" data-eta-titulo>Tu taxi va en camino</h2><p data-eta-sub>Calculando la hora de llegada…</p>${prueba}</div>
          </div>`}
      <div class="c-conductor-fila">
        ${C.avatarHTML(cd.nombre)}
        <div class="c-conductor-datos"><strong>${esc(cd.nombre)}</strong><span>${icono('estrella', 'c-ico-estrella')} ${C.calificacionTexto(cd.calificacion)} · ${miles(cd.viajes)} viajes</span></div>
        <div class="c-movil"><small>Móvil</small><strong>${esc(cd.movil)}</strong></div>
      </div>
      <div class="c-vehiculo-fila">
        ${C.placaHTML(cd.placa)}
        <span class="c-vehiculo-texto"><strong>${esc(cd.vehiculo || E.vehiculo)}</strong><small>${esc(cd.color || E.colorTaxi)}</small></span>
      </div>
      <div class="c-codigo-fila" role="group" aria-label="Código de abordaje ${esc(String(v.codigo || '').split('').join(' '))}">
        <div class="c-codigo-texto"><small>${icono('candado')} Tu código</small><p><strong>Díselo al conductor</strong> antes de subir.</p></div>
        <div class="c-codigo-digitos" data-codigo>${digitos}</div>
      </div>
      ${botonesSeguridad({ cancelar: true })}
    </div></section>`;
  }

  /* ------------------------------------------------------------------ */
  /* Destino: listas, búsqueda y atajos                                 */
  /* ------------------------------------------------------------------ */
  function construirAtajos() {
    const g = N.perfil.lugaresGuardados();
    const lista = [];
    if (g.casa) lista.push({ texto: 'Casa', icono: 'casa', punto: g.casa });
    if (g.trabajo) lista.push({ texto: 'Trabajo', icono: 'trabajo', punto: g.trabajo });
    const vistos = new Set();
    for (const r of N.perfil.recientes().slice(0, 2)) {
      vistos.add(r.titulo);
      lista.push({ texto: r.titulo, icono: 'reloj', punto: r });
    }
    // Lugares destacados de la cooperativa (parque principal y sitios a distancia de taxi).
    for (const l of C.lugaresDestacados()) {
      if (vistos.has(l.nombre) || lista.length >= 5) continue;
      lista.push({ texto: l.nombre, icono: 'pin', punto: { titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng } });
    }
    if (!g.casa) lista.push({ texto: 'Agregar casa', icono: 'casa', guardar: 'casa' });
    if (!g.trabajo) lista.push({ texto: 'Agregar trabajo', icono: 'trabajo', guardar: 'trabajo' });
    return lista;
  }

  function filaLugar(l, i, { ico = 'pin', extra = '' } = {}) {
    const km = ui.origen ? N.distanciaKm(ui.origen, l) : null;
    return `<div class="c-fila-lugar-envoltura"><button type="button" class="c-fila-lugar" data-accion="elegir-lugar" data-i="${i}">
      <span class="c-fila-ico">${l.cat ? C.iconoCategoria(l.cat) : icono(ico)}</span>
      <span class="c-fila-texto"><strong>${esc(l.titulo)}</strong><small>${esc(l.detalle || '')}</small></span>
      ${km != null ? `<span class="c-fila-dist">${N.kmTexto(km)}</span>` : ''}
    </button>${extra}</div>`;
  }

  function pintarListaInicial() {
    const cont = contenido.querySelector('#c-resultados');
    if (!cont) return;
    opcionesLista = [];
    const agregar = (l) => opcionesLista.push(l) - 1;
    const g = N.perfil.lugaresGuardados();
    let html = '<h3 class="c-seccion-titulo">Guardados</h3><div class="c-lista-lugares">';
    for (const tipo of ['casa', 'trabajo']) {
      const nombreTipo = tipo === 'casa' ? 'Casa' : 'Trabajo';
      if (g[tipo] && !ui.guardando) {
        const i = agregar({ ...g[tipo], titulo: g[tipo].titulo });
        html += filaLugar({ ...g[tipo], titulo: `${nombreTipo} · ${g[tipo].titulo}` }, i, { ico: tipo, extra: `<button type="button" class="c-boton-texto c-fila-extra" data-accion="guardar-lugar" data-tipo="${tipo}" aria-label="Cambiar la dirección de ${nombreTipo.toLowerCase()}">Cambiar</button>` });
      } else if (!ui.guardando) {
        html += `<div class="c-fila-lugar-envoltura"><button type="button" class="c-fila-lugar c-fila-agregar" data-accion="guardar-lugar" data-tipo="${tipo}"><span class="c-fila-ico">${icono(tipo)}</span><span class="c-fila-texto"><strong>Agregar ${nombreTipo.toLowerCase()}</strong><small>Guárdala para pedir en un toque</small></span><span class="c-fila-dist">${icono('mas')}</span></button></div>`;
      }
    }
    html += '</div>';
    const recientes = N.perfil.recientes().slice(0, 4);
    if (recientes.length) {
      html += '<h3 class="c-seccion-titulo">Recientes</h3><div class="c-lista-lugares">';
      for (const r of recientes) html += filaLugar(r, agregar(r), { ico: 'reloj' });
      html += '</div>';
    }
    // Solo las categorías con lugares en este municipio.
    const categorias = Object.entries(N.CATEGORIAS).filter(([id]) => N.LUGARES.some((l) => l.cat === id));
    if (categorias.length && !categorias.some(([id]) => id === ui.categoria)) ui.categoria = categorias[0][0];
    html += `<h3 class="c-seccion-titulo">Lugares frecuentes</h3>
      <div class="c-categorias" role="tablist" aria-label="Categorías">${categorias
        .map(([id, c]) => `<button type="button" role="tab" class="c-chip${ui.categoria === id ? ' c-activa' : ''}" aria-selected="${ui.categoria === id}" data-accion="categoria" data-cat="${id}">${C.iconoCategoria(id)}<span>${esc(c.nombre)}</span></button>`)
        .join('')}</div><div class="c-lista-lugares" role="tabpanel">`;
    for (const l of N.LUGARES.filter((x) => x.cat === ui.categoria)) {
      const punto = { titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng, cat: l.cat };
      html += filaLugar(punto, agregar(punto));
    }
    html += '</div>';
    cont.innerHTML = html;
  }

  function pintarResultados(lista, buscando = false) {
    const cont = contenido.querySelector('#c-resultados');
    if (!cont) return;
    opcionesLista = lista.slice();
    let html = `<h3 class="c-seccion-titulo">Resultados ${buscando ? '<span class="c-girando c-girando-chico" aria-label="Buscando"></span>' : ''}</h3>`;
    if (!lista.length && !buscando) {
      html += `<div class="c-vacio">${icono('buscar')}<strong>No encontramos ese lugar</strong><span>Prueba con otro nombre, elige en el mapa o dile el destino al conductor.</span></div>`;
    } else {
      html += `<div class="c-lista-lugares">${lista.map((l, i) => filaLugar(l, i, { ico: l.fuente === 'mapa' ? 'pin' : 'brillo' })).join('')}</div>`;
    }
    cont.innerHTML = html;
  }

  let tokenBusqueda = 0;
  async function buscar(q) {
    const t = ++tokenBusqueda;
    if (!q.trim()) return;
    const lista = await N.buscarDirecciones(q, { cerca: ui.origen || N.CENTRO, limite: 8 });
    if (t !== tokenBusqueda || ui.q !== q || claveVista !== 'inicio:destino') return;
    pintarResultados(lista, false);
  }

  function elegirDestino(punto) {
    if (ui.guardando) {
      const tipo = ui.guardando;
      N.perfil.guardarLugar(tipo, { titulo: punto.titulo, detalle: punto.detalle || '', lat: punto.lat, lng: punto.lng });
      ui.guardando = null;
      ui.q = '';
      avisar({ titulo: tipo === 'casa' ? 'Casa guardada' : 'Trabajo guardado', cuerpo: punto.titulo, tipo: 'exito' });
      repintar();
      return;
    }
    ui.destino = { titulo: punto.titulo, detalle: punto.detalle || '', lat: punto.lat, lng: punto.lng };
    ui.sinDestino = false;
    ui.q = '';
    irA('confirmar');
  }

  /* ------------------------------------------------------------------ */
  /* Cotización                                                         */
  /* ------------------------------------------------------------------ */
  function aFechaLocal(t) {
    const d = new Date(t);
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }
  function programadoPara() {
    if (!ui.programar || !ui.fecha) return null;
    const f = new Date(ui.fecha);
    return Number.isNaN(f.getTime()) ? null : f;
  }
  function pintarMensajeProgramar() {
    const el = contenido.querySelector('[data-programar-msg]');
    if (!el) return;
    const f = programadoPara();
    const aplica = f && N.aplicaDescuentoProgramado(f);
    el.classList.toggle('c-aplica', Boolean(aplica));
    el.innerHTML = aplica
      ? `${icono('regalo')}<span><strong>−10 %</strong> por programar con 24 h de anticipación.</span>`
      : `${icono('info')}<span>Programa con 24 h de anticipación y paga 10 % menos.</span>`;
  }

  let tokenCotizacion = 0;
  async function cotizar() {
    const t = ++tokenCotizacion;
    const caja = contenido.querySelector('[data-cotizacion]');
    caja?.classList.add('c-cargando');
    const r = await p.cotizar({ origen: ui.origen, destino: ui.sinDestino ? null : ui.destino, programadoPara: programadoPara() });
    if (t !== tokenCotizacion || claveVista !== 'inicio:confirmar') return;
    ui.cot = r;
    caja?.classList.remove('c-cargando');
    const { ruta, tarifa } = r;
    contenido.querySelector('[data-total]').innerHTML = `${ui.sinDestino ? '<small>desde</small> ' : ''}${N.pesos(tarifa.total)}${tarifa.descuento ? `<s>${N.pesos(tarifa.total + tarifa.descuento)}</s>` : ''}`;
    contenido.querySelector('[data-km]').textContent = ruta ? N.kmTexto(ruta.km) : '—';
    contenido.querySelector('[data-min]').textContent = ruta ? N.minutosTexto(ruta.min) : '—';
    contenido.querySelector('[data-detalle]').innerHTML =
      tarifa.detalle.map((d) => `<li><span>${esc(d.concepto)}</span><strong class="${d.valor < 0 ? 'c-descuento' : ''}">${d.valor < 0 ? '−' + N.pesos(-d.valor) : N.pesos(d.valor)}</strong></li>`).join('') +
      `<li class="c-total-detalle"><span>Total estimado</span><strong>${N.pesos(tarifa.total)}</strong></li>` +
      (tarifa.rutaFija ? `<li class="c-nota-detalle"><span>${icono('ruta')} Ruta con tarifa fija hacia ${esc(tarifa.rutaFija.destino)}</span></li>` : '') +
      (ui.sinDestino ? `<li class="c-nota-detalle"><span>${icono('info')} El valor final depende del destino que le digas al conductor.</span></li>` : '') +
      (ruta?.aproximada ? `<li class="c-nota-detalle"><span>${icono('info')} Distancia aproximada (sin conexión al servicio de rutas).</span></li>` : '');
    if (ruta && ui.destino && !ui.sinDestino) {
      const clave = `${ui.origen.lat},${ui.origen.lng}>${ui.destino.lat},${ui.destino.lng}`;
      if (ui.rutaPintada !== clave) {
        ui.rutaPintada = clave;
        m.ponerRuta(ruta.coords, { color: AMARILLO });
        encuadrar([ui.origen, ui.destino]);
      }
    }
  }

  async function pedir() {
    const fecha = programadoPara();
    if (ui.programar && !fecha) {
      avisar({ titulo: 'Elige fecha y hora', cuerpo: 'Para programar el viaje, dinos cuándo te recogemos.', tipo: 'error' });
      deslizador?.reiniciar();
      return;
    }
    if (fecha && fecha - Date.now() < 30 * 60 * 1000) {
      avisar({ titulo: 'Programa con más tiempo', cuerpo: 'Los viajes programados deben ser al menos 30 minutos después.', tipo: 'error' });
      deslizador?.reiniciar();
      return;
    }
    // Si la dirección de recogida aún no se conoce, se espera un momento: el
    // conductor debe ver una dirección y no «Tu ubicación».
    if (['Tu ubicación', 'Ubicando…'].includes(ui.origen.titulo)) {
      const punto = ui.origen;
      const d = await Promise.race([N.direccionDe(punto).catch(() => null), new Promise((r) => setTimeout(() => r(null), 3000))]);
      if (ui.origen === punto) ui.origen = { ...punto, titulo: d?.titulo || 'Punto marcado en el mapa', detalle: d?.detalle || '' };
    }
    // El permiso de notificaciones es del navegador (no de la cooperativa): clave común.
    if (!localStorage.getItem('ct.c.permisoPasajero')) {
      localStorage.setItem('ct.c.permisoPasajero', '1');
      N.pedirPermisoNotificaciones();
    }
    try {
      const r = await p.solicitar({ origen: ui.origen, destino: ui.sinDestino ? null : ui.destino, metodoPago: ui.metodoPago, programadoPara: fecha, nota: ui.nota.trim() });
      if (r?.programado) {
        Object.assign(ui, { paso: 'recogida', destino: null, sinDestino: false, cot: null, programar: false, nota: '', abrirNota: false });
        m.quitarRuta();
        m.quitarDestino();
        m.quitarOrigen();
        ui.viajesVista = 'programados';
        irATab('viajes');
      }
    } catch (err) {
      avisar({ titulo: 'No pudimos pedir el taxi', cuerpo: err.message, tipo: 'error' });
      deslizador?.reiniciar();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Pago: escáner, pago simulado y QR para otro celular                */
  /* ------------------------------------------------------------------ */
  function pintarQROtro() {
    const cont = contenido.querySelector('[data-qr-otro]');
    if (!cont || cont.childElementCount) return;
    const url = p.urlCobroActual();
    cont.innerHTML = url ? N.tarjetaBreB({ url, valor: p.estado.cobro?.valor || 0, movil: p.estado.conductor?.movil, compacta: true }) : '<p>Esperando el cobro del conductor…</p>';
  }

  function detenerEscaner() {
    try {
      escaner?.detener();
    } catch {
      /* ya estaba detenido */
    }
    escaner = null;
  }

  function abrirEscaner(modo = 'pagar') {
    detenerEscaner();
    const hoja = C.abrirHoja(app, {
      titulo: modo === 'pagar' ? 'Escanear QR del conductor' : 'Escanear un código QR',
      clase: 'c-hoja-escaner',
      contenido: `<div class="c-escaner"><video playsinline muted aria-label="Vista de la cámara"></video><div class="c-escaner-marco" aria-hidden="true"><i></i><i></i><i></i><i></i><span class="c-escaner-linea"></span></div></div>
        <p class="c-escaner-estado" data-escaner-estado role="status">${icono('camara')}<span>Abriendo la cámara…</span></p>
        <div class="c-escaner-acciones" data-escaner-acciones hidden></div>`,
      alCerrar: detenerEscaner,
    });
    const video = hoja.el.querySelector('video');
    const estado = hoja.el.querySelector('[data-escaner-estado]');
    const acciones = hoja.el.querySelector('[data-escaner-acciones]');
    const decir = (texto, tipo = '', ico = 'info') => {
      estado.className = `c-escaner-estado ${tipo}`;
      estado.innerHTML = `${icono(ico)}<span>${texto}</span>`;
    };
    const alLeer = (texto) => {
      escaner = null;
      if (modo === 'pagar' || p.estado.fase === 'pagar') {
        const r = p.pagarConQR(texto, 'Bre-B');
        if (r.ok) return hoja.cerrar();
        decir(esc(r.error || 'No pudimos leer ese cobro.'), 'c-error', 'alerta');
      } else {
        const cobro = N.leerCobro(texto);
        if (cobro) decir(`Cobro de <strong>${N.pesos(cobro.valor)}</strong>${cobro.movil ? ` del móvil ${esc(cobro.movil)}` : ''}. Cuando estés pagando un viaje lo puedes escanear aquí.`, 'c-ok', 'qr');
        else if (/\/descargar\//.test(texto)) decir(`Es un sticker de ${esc(E.nombre)}: ¡ya tienes la app! Pide tu taxi desde Inicio.`, 'c-ok', 'check');
        else decir(`Leímos: «${esc(texto.slice(0, 80))}». No es un cobro de ${esc(E.nombre)}.`, 'c-error', 'alerta');
      }
      acciones.hidden = false;
      acciones.innerHTML = `<button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-accion="reescanear" data-modo="${modo}">${icono('camara')} Escanear otra vez</button>`;
    };
    N.escanearQR(video, alLeer)
      .then((ctrl) => {
        escaner = ctrl;
        if (!hoja.abierta) return detenerEscaner();
        decir(modo === 'pagar' ? 'Apunta al QR que te muestra el conductor.' : 'Apunta a un código QR.', '', 'qr');
      })
      .catch((err) => {
        const motivo = err?.name === 'NotAllowedError' ? 'no diste permiso para usar la cámara' : err?.name === 'NotFoundError' ? 'este equipo no tiene cámara' : err?.message || 'la cámara no respondió';
        decir(`No pudimos abrir la cámara: ${esc(motivo)}. ${modo === 'pagar' ? 'Usa «Simular pago con QR (prueba)» o paga en efectivo.' : 'Puedes intentarlo desde un celular con cámara.'}`, 'c-error', 'alerta');
        hoja.el.querySelector('.c-escaner').classList.add('c-sin-camara');
        if (modo === 'pagar') {
          acciones.hidden = false;
          acciones.innerHTML = `<button type="button" class="c-boton c-boton-cian c-boton-ancho" data-accion="simular-pago">${icono('qr')} Simular pago con QR (prueba)</button>`;
        }
      });
  }

  function colorTexto(hex) {
    const n = parseInt(hex.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0A0C11' : '#FFFFFF';
  }

  function abrirSimularPago() {
    C.cerrarHojas(app);
    const valor = p.estado.cobro?.valor || p.estado.viaje?.tarifa?.total || 0;
    hojaPago = C.abrirHoja(app, {
      titulo: 'Simular pago con QR',
      clase: 'c-hoja-pago',
      contenido: `<div class="c-pago-resumen"><span class="c-etiqueta">Prueba</span><strong>${N.pesos(valor)}</strong><small>Móvil ${esc(p.estado.conductor?.movil || '')} · no se mueve dinero real</small></div>
        <p>Elige con qué billetera quieres simular el pago:</p>
        <div class="c-billeteras">${N.BILLETERAS.map((b) => `<button type="button" class="c-billetera" data-accion="billetera" data-billetera="${esc(b.id)}" style="--marca:${b.color};--marca-texto:${colorTexto(b.color)}"><span class="c-billetera-insignia" aria-hidden="true">${esc(b.nombre.slice(0, 1))}</span><strong>${esc(b.nombre)}</strong><small>Pago de prueba</small></button>`).join('')}</div>
        <p class="c-nota-prueba">${icono('info')} Solo usamos el nombre y el color de cada billetera; no hay conexión con bancos.</p>`,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Compartir y SOS                                                    */
  /* ------------------------------------------------------------------ */
  function abrirCompartir() {
    const texto = p.textoCompartir() || `Voy en un taxi de ${E.nombre}${E.telefono ? ` (${E.telefonoVisible})` : ''}.`;
    const contacto = p.perfil?.contactoEmergencia;
    C.abrirHoja(app, {
      titulo: 'Compartir mi viaje',
      persistente: true,
      contenido: `<p>Envía el móvil, la placa, el conductor y tu ubicación en vivo a alguien de confianza.</p>
        <pre class="c-texto-compartir">${esc(texto)}</pre>
        ${'share' in navigator ? `<button type="button" class="c-opcion" data-accion="compartir-nativo">${icono('compartir')}<span>Compartir con otra app<small>WhatsApp, mensajes, correo…</small></span></button>` : ''}
        ${contacto?.celular ? `<a class="c-opcion" href="${esc(N.enlaceWhatsApp(contacto.celular, texto))}" target="_blank" rel="noopener">${icono('usuarios')}<span>Enviar a ${esc(contacto.nombre)}<small>Tu contacto de emergencia · ${esc(C.formatoCelular(contacto.celular))}</small></span></a>` : ''}
        <a class="c-opcion" href="${esc(N.enlaceWhatsApp('', texto))}" target="_blank" rel="noopener">${icono('chat')}<span>Enviar por WhatsApp<small>Elige el contacto en WhatsApp</small></span></a>
        <button type="button" class="c-opcion" data-accion="copiar-viaje">${icono('copiar')}<span>Copiar el texto</span></button>`,
    });
  }

  // Hoja de la marca (solo dentro de TaxiCun): qué cooperativa atiende aquí y
  // «Cambiar de municipio» (vuelve a la lista de municipios de TaxiCun).
  function abrirMarcaTaxiCun() {
    const url = C.urlCambiarMunicipio('pasajero');
    const donde = E.pueblo ? `en ${E.pueblo}` : 'en tu municipio';
    C.abrirHoja(app, {
      titulo: C.marcaTaxiCun.nombre,
      clase: 'c-hoja-taxicun',
      contenido: `${C.marcaTaxiCunHTML({ etiqueta: E.pueblo, id: 'hoja', tam: 48 })}
        <p class="c-muted">Pides tu taxi ${esc(donde)} con <strong>${esc(E.nombre)}</strong>${taxicun?.porGps ? ', según tu ubicación' : ''}. ¿Estás en otro municipio? Escoge el tuyo y te mostramos sus taxis.</p>
        ${url ? `<a class="c-boton c-boton-ancho" href="${esc(url)}" data-cambiar-municipio>${icono('pin')} Cambiar de municipio</a>` : ''}
        <p class="c-pie-marca">${C.pieTaxiCunHTML()}</p>`,
    });
  }

  function abrirSOS() {
    const cd = p.estado.conductor;
    const contacto = p.perfil?.contactoEmergencia;
    const texto = `🆘 Necesito ayuda. ${p.textoCompartir()}`;
    C.abrirHoja(app, {
      titulo: 'Emergencia',
      clase: 'c-hoja-sos',
      persistente: true,
      contenido: `<p>Si estás en peligro, llama a la línea de emergencias. ${cd ? `Tu viaje: <strong>${sinCorte(`móvil ${cd.movil}`)}</strong> · placa <strong>${sinCorte(cd.placa)}</strong>.` : ''}</p>
        <a class="c-opcion c-opcion-peligro c-opcion-sos" href="tel:123">${icono('telefono')}<span>Llamar al 123<small>Línea nacional de emergencias</small></span></a>
        ${E.telefono ? `<a class="c-opcion" href="tel:${esc(E.telefono)}">${icono('taxi')}<span>Llamar a la central ${esc(E.nombre)}<small>${esc(E.telefonoVisible)}${E.servicio24h ? ' · 24 horas' : ''}</small></span></a>` : ''}
        ${contacto?.celular
          ? `<a class="c-opcion" href="${esc(N.enlaceWhatsApp(contacto.celular, texto))}" target="_blank" rel="noopener">${icono('usuarios')}<span>Avisar a ${esc(contacto.nombre)}<small>Le enviamos tu viaje y ubicación por WhatsApp</small></span></a>`
          : `<a class="c-opcion" href="${esc(N.enlaceWhatsApp('', texto))}" target="_blank" rel="noopener">${icono('chat')}<span>Enviar mi viaje por WhatsApp<small>Agrega un contacto de emergencia en Perfil › Ajustes</small></span></a>`}`,
    });
  }

  function abrirCancelar() {
    const buscando = p.estado.fase === 'buscando';
    C.abrirHoja(app, {
      titulo: buscando ? '¿Cancelar la solicitud?' : '¿Cancelar el servicio?',
      contenido: `<p>${buscando ? 'Dejaremos de buscar tu taxi.' : 'Le avisaremos al conductor.'} Cuéntanos por qué:</p>
        ${N.MOTIVOS_CANCELACION.pasajero.map((mtv) => `<button type="button" class="c-opcion" data-accion="motivo" data-motivo="${esc(mtv)}">${icono('chevron')}<span>${esc(mtv)}</span></button>`).join('')}
        <button type="button" class="c-boton c-boton-ancho" data-cerrar-hoja>Seguir con mi ${buscando ? 'solicitud' : 'taxi'}</button>`,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Acciones (delegadas por data-accion)                               */
  /* ------------------------------------------------------------------ */
  const acciones = {
    tab: (b) => {
      const volverAHistorial = b.dataset.tab === 'viajes' && b.closest('.c-nav') && ui.viajesVista !== 'historial';
      if (volverAHistorial) ui.viajesVista = 'historial';
      irATab(b.dataset.tab);
      // Si ya estaba en Viajes › Programados, la clave no cambia: se fuerza el repintado.
      if (volverAHistorial) repintar();
    },
    'abrir-destino': () => {
      ui.guardando = null;
      irA('destino');
    },
    'volver-recogida': () => {
      ui.guardando = null;
      ui.q = '';
      irA('recogida');
    },
    'mi-ubicacion': async (b) => {
      b.classList.add('c-girando-boton');
      const pos = await p.actualizarMiPosicion();
      b.classList.remove('c-girando-boton');
      if (!pos.real) avisar({ titulo: 'No pudimos leer tu GPS', cuerpo: `Usamos el centro ${dePueblo}; mueve el mapa para ubicar tu punto.`, tipo: 'alerta' });
      else m.ponerYo(pos);
      ui.origen = { lat: pos.lat, lng: pos.lng, titulo: 'Ubicando…', detalle: '' };
      pintarDireccionOrigen();
      centrarEnPin(pos, 17);
      resolverOrigen();
    },
    atajo: (b) => {
      const a = atajosLista[Number(b.dataset.i)];
      if (!a) return;
      if (a.guardar) {
        ui.guardando = a.guardar;
        ui.q = '';
        irA('destino');
      } else elegirDestino(a.punto);
    },
    'guardar-lugar': (b) => {
      ui.guardando = b.dataset.tipo;
      ui.q = '';
      if (ui.paso === 'destino') repintar();
      else irA('destino');
    },
    'cancelar-guardar': () => {
      ui.guardando = null;
      ui.q = '';
      repintar();
    },
    'elegir-lugar': (b) => {
      const l = opcionesLista[Number(b.dataset.i)];
      if (l) elegirDestino(l);
    },
    categoria: (b) => {
      ui.categoria = b.dataset.cat;
      pintarListaInicial();
      contenido.querySelector(`[data-cat="${ui.categoria}"]`)?.focus({ preventScroll: true });
    },
    'limpiar-busqueda': () => {
      const input = contenido.querySelector('#c-q');
      ui.q = '';
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();
    },
    'elegir-mapa': () => irA('mapa'),
    'confirmar-mapa': () => {
      if (!ui.puntoMapa || ui.puntoMapa.titulo === 'Ubicando…') return;
      elegirDestino(ui.puntoMapa);
    },
    'sin-destino': () => {
      ui.destino = null;
      ui.sinDestino = true;
      irA('confirmar');
    },
    'cambiar-destino': () => {
      ui.q = '';
      m.quitarRuta();
      m.quitarDestino();
      irA('destino');
    },
    pago: (b) => {
      ui.metodoPago = b.dataset.pago;
      for (const x of contenido.querySelectorAll('[data-accion="pago"]')) x.setAttribute('aria-checked', String(x === b));
    },
    'alternar-programar': (b) => {
      ui.programar = !ui.programar;
      if (ui.programar && !ui.fecha) ui.fecha = aFechaLocal(Date.now() + 24 * 3600 * 1000 + 15 * 60 * 1000);
      b.setAttribute('aria-expanded', String(ui.programar));
      b.setAttribute('aria-pressed', String(ui.programar));
      const caja = contenido.querySelector('[data-programar]');
      caja.hidden = !ui.programar;
      contenido.querySelector('#c-fecha').value = ui.fecha;
      contenido.querySelector('.c-desliza-texto').textContent = ui.programar ? 'Desliza para programar' : 'Desliza para pedir';
      contenido.querySelector('.c-desliza-perilla').setAttribute('aria-label', `${ui.programar ? 'Programar el viaje' : 'Pedir taxi'} (toca o desliza)`);
      pintarMensajeProgramar();
      cotizar();
    },
    'alternar-nota': (b) => {
      ui.abrirNota = !ui.abrirNota;
      b.setAttribute('aria-expanded', String(ui.abrirNota));
      b.setAttribute('aria-pressed', String(ui.abrirNota || Boolean(ui.nota)));
      contenido.querySelector('[data-nota]').hidden = !ui.abrirNota;
      if (ui.abrirNota) contenido.querySelector('#c-nota').focus();
    },
    'cancelar-viaje': abrirCancelar,
    motivo: (b) => {
      C.cerrarHojas(app, { todas: true });
      p.cancelar(b.dataset.motivo);
    },
    compartir: abrirCompartir,
    'llamada-demo': () => avisar(N.AVISO_LLAMADA_DEMO),
    'compartir-nativo': async () => {
      try {
        await navigator.share({ title: `Mi viaje en ${E.nombre}`, text: p.textoCompartir() });
      } catch {
        /* el usuario cerró el diálogo */
      }
    },
    'copiar-viaje': async (b) => {
      try {
        await navigator.clipboard.writeText(p.textoCompartir());
        b.querySelector('span').firstChild.textContent = '¡Copiado!';
      } catch {
        avisar({ titulo: 'No se pudo copiar', cuerpo: 'Selecciona el texto y cópialo a mano.', tipo: 'error' });
      }
    },
    sos: abrirSOS,
    escanear: () => abrirEscaner('pagar'),
    reescanear: (b) => {
      C.cerrarHojas(app, { todas: true });
      setTimeout(() => abrirEscaner(b.dataset.modo || 'pagar'), 280);
    },
    'simular-pago': abrirSimularPago,
    billetera: (b) => {
      const bill = N.BILLETERAS.find((x) => x.id === b.dataset.billetera);
      if (!bill || !hojaPago) return;
      const valor = p.estado.cobro?.valor || p.estado.viaje?.tarifa?.total || 0;
      hojaPago.el.querySelector('.c-hoja-cuerpo').innerHTML = `<div class="c-procesando" role="status" style="--marca:${bill.color}"><span class="c-procesando-anillo"></span><strong>Procesando pago de prueba…</strong><small>${esc(bill.nombre)} · ${N.pesos(valor)}</small></div>`;
      setTimeout(() => {
        const r = p.pagarConQR(null, bill.nombre);
        if (!r.ok) {
          avisar({ titulo: 'No se pudo pagar', cuerpo: r.error || '', tipo: 'error' });
          hojaPago?.cerrar();
        }
      }, C.reducirMovimiento() ? 200 : 1100);
    },
    efectivo: () => {
      p.pagarEnEfectivo();
    },
    etiqueta: (b) => {
      const t = b.dataset.etiqueta;
      if (ui.calif.etiquetas.has(t)) ui.calif.etiquetas.delete(t);
      else ui.calif.etiquetas.add(t);
      b.setAttribute('aria-pressed', String(ui.calif.etiquetas.has(t)));
    },
    'enviar-calificacion': () => {
      if (!ui.calif.estrellas) {
        avisar({ titulo: 'Elige las estrellas', cuerpo: 'Toca de 1 a 5 estrellas para calificar al conductor.', tipo: 'error' });
        contenido.querySelector('.c-estrella')?.focus();
        return;
      }
      const comentario = contenido.querySelector('#c-comentario')?.value.trim() || '';
      p.calificar(ui.calif.estrellas, { etiquetas: [...ui.calif.etiquetas], comentario });
    },
    'omitir-calificacion': () => p.omitirCalificacion(),
    'marca-taxicun': abrirMarcaTaxiCun,
    ...secciones.acciones,
  };

  app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b || !app.contains(b) || b.disabled) return;
    const fn = acciones[b.dataset.accion];
    if (!fn) return;
    if (b.tagName === 'A' && !b.getAttribute('href')) ev.preventDefault();
    fn(b, ev);
  });

  p.on('cambio', programar);
  p.on('aviso', (a) => avisar(a));
  window.addEventListener('resize', () => {
    m.refrescar();
    ajustarPin();
  });

  pintar();
  if (viajeReiniciado && p.estado.fase === 'inicio' && p.registrado) {
    avisar({ titulo: 'Tu viaje de prueba se reinició', cuerpo: 'La simulación no sigue al recargar la página. Pide el taxi otra vez.', tipo: 'info' });
  }
  return { p, m };
}
