// App del conductor — diseño C «Noche Neón», estilo cabina / tablero.
// Anillo de ganancias contra una meta, botón de encendido neón, zonas de demanda,
// solicitud entrante con cuenta regresiva, HUD con números grandes y cobro con QR.
// Igual que en el pasajero: la vista completa se repinta solo cuando cambia la
// fase o la pestaña; el resto del tiempo se actualizan textos y marcadores.
import * as C from './comun.js';
import { crearSeccionesConductor } from './conductor-secciones.js';

const { icono, esc } = C;
const AMARILLO = '#FFE14D';

// Zonas de demanda decorativas: el paradero de taxis (si la ficha lo trae; en El Rosal el
// Decreto 89 de 2026 prohíbe recoger en el parque) o el parque principal del municipio, y
// otro punto concurrido cercano (en El Rosal, la rotonda), tomados de la ficha.
function zonasDemanda(N) {
  const L = N.LUGARES || [];
  const parque = L.find((l) => l.id === 'paradero') || L.find((l) => l.id === 'parque' && !l.noRecoger) || L.find((l) => l.id === 'parque') || { nombre: 'Centro', ...N.CENTRO };
  const cerca = (l) => {
    const km = N.distanciaKm(parque, l);
    return km >= 0.45 && km <= 1.6;
  };
  const otra = L.find((l) => l.id === 'rotonda') || L.find((l) => ['comercio', 'salud', 'centro', 'educacion', 'barrio', 'comida'].includes(l.cat) && String(l.nombre).length <= 18 && cerca(l));
  // Nombres cortos para las etiquetas del mapa (p. ej. «Parque Principal Pedro
  // Fernández Madrid» ocuparía media pantalla).
  const corto = (l) => (l.id === 'rotonda' ? 'Rotonda' : l.id === 'paradero' ? 'Paradero' : l.id === 'parque' && String(l.nombre).length > 20 ? 'Parque Principal' : l.nombre);
  const zonas = [
    { nombre: corto(parque), nivel: 'alta', lat: parque.lat, lng: parque.lng, radio: 280, color: '#FF4D9D' },
    otra ? { nombre: corto(otra), nivel: 'media', lat: otra.lat, lng: otra.lng, radio: 300, color: '#FFE14D' } : null,
  ].filter(Boolean);
  // Las etiquetas van encima de cada zona. Si las dos zonas quedan casi una
  // sobre otra (menos de 1 km de lado a lado), la etiqueta de la que está más
  // al sur pasa debajo para que no se tapen (en El Rosal no cambia nada).
  if (zonas.length === 2) {
    const [a, b] = zonas;
    const dx = Math.abs(a.lng - b.lng) * 111.32 * Math.cos((a.lat * Math.PI) / 180);
    if (dx < 1) (a.lat < b.lat ? a : b).abajo = true;
  }
  return zonas;
}

export async function montar(raiz, { N, vitrina = false } = {}) {
  // Datos de la cooperativa activa para las piezas comunes (marca, placa, lateral).
  C.usarNucleo(N);
  const E = C.empresa;
  const ZONAS = zonasDemanda(N);
  // Móvil de la demo: el 023 en Cootransrural; en las demás, el primer conductor de su ficha.
  const maxMovil = E.taxis || 999;
  const demos = N.CONDUCTORES_DEMO || [];
  const MOVIL_DEMO = (demos.find((x) => x.movil === '023') || demos.find((x) => Number(x.movil) <= maxMovil) || { movil: '001' }).movil;
  raiz.innerHTML = C.escenaHTML({
    tipo: 'conductor',
    contenido: `<div class="c-app c-conductor" data-vista="carga">
      <div class="c-mapa-envoltura"><div class="c-mapa"></div><div class="c-mapa-vineta"></div></div>
      <header class="c-hud"></header>
      <main class="c-contenido" id="c-contenido"></main>
      <div class="c-capa-solicitud"></div>
      <nav class="c-nav c-dock c-vidrio" aria-label="Secciones del conductor" hidden>
        <button type="button" data-accion="tab" data-tab="tablero">${icono('volante')}<span>Tablero</span></button>
        <button type="button" data-accion="tab" data-tab="ganancias">${icono('grafica')}<span>Ganancias</span></button>
        <button type="button" data-accion="tab" data-tab="historial">${icono('viajes')}<span>Historial</span></button>
        <button type="button" data-accion="tab" data-tab="perfil">${icono('taxi')}<span>Mi taxi</span></button>
      </nav>
      <div class="c-capa-ingreso" hidden></div>
      <div class="c-avisos" aria-live="polite" aria-atomic="false"></div>
    </div>`,
  });
  if (vitrina) document.documentElement.dataset.vitrina = '1';

  const app = raiz.querySelector('.c-app');
  const hud = app.querySelector('.c-hud');
  const contenido = app.querySelector('.c-contenido');
  const capaSolicitud = app.querySelector('.c-capa-solicitud');
  const capaIngreso = app.querySelector('.c-capa-ingreso');
  const dock = app.querySelector('.c-dock');
  const avisar = C.crearAvisos(app.querySelector('.c-avisos'));
  document.addEventListener('pointerdown', () => N.prepararSonido(), { once: true, capture: true });

  app.querySelector('.c-mapa').dataset.capa = C.CAPA_MAPA;
  const m = await N.crearMapa(app.querySelector('.c-mapa'), {
    capa: C.CAPA_MAPA,
    colorRuta: AMARILLO,
    colorTaxi: C.COLORES.taxi,
    colorOrigen: '#22D3EE',
    colorDestino: '#FF4D9D',
    controles: false,
    zoom: 15,
  });
  const circulosZona = [];
  for (const z of ZONAS) {
    const circulo = m.L.circle([z.lat, z.lng], { radius: z.radio, color: z.color, weight: 1.5, opacity: 0.8, fillColor: z.color, fillOpacity: 0.09, className: `c-zona c-zona-${z.nivel}`, interactive: false }).addTo(m.mapa);
    circulosZona.push(circulo);
    m.L.marker([z.lat, z.lng], {
      icon: m.L.divIcon({ className: `c-zona-etiqueta${z.abajo ? ' c-zona-etiqueta-abajo' : ''}`, html: `<span style="--zona:${z.color}">${esc(z.nombre)}<b>Demanda ${z.nivel}</b></span>`, iconSize: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(m.mapa);
  }

  C.marcadoresSinFoco(m.mapa);
  const c = await N.crearConductor();

  const ui = {
    tab: 'tablero',
    sub: null,
    llegada: false,
    calif: { estrellas: 0, etiquetas: new Set() },
    meta: Number(localStorage.getItem(C.claveLocal('meta'))) || 150000,
    solicitudVista: null,
    rutaDibujada: null,
    simulando: false,
    pinY: 0,
  };

  let claveVista = null;
  let faseAnterior = undefined;
  let pendiente = false;
  let limpiezas = [];
  let casillas = null;
  let relojSolicitud = null;
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
  const irATab = (tab, sub = null) => {
    ui.tab = tab;
    ui.sub = sub;
    programar();
  };
  const yo = () => c.perfil || {};

  /* ------------------------------------------------------------------ */
  /* Geometría del mapa                                                 */
  /* ------------------------------------------------------------------ */
  function zonaVisible() {
    const a = app.getBoundingClientRect();
    const h = hud.getBoundingClientRect();
    const panel = contenido.querySelector('.c-panel, .c-tablero');
    const arriba = h.height ? h.bottom - a.top : 0;
    const abajo = panel ? panel.getBoundingClientRect().top - a.top : a.height;
    return { arriba, abajo, alto: a.height };
  }
  function ajustarMedidas() {
    const z = zonaVisible();
    ui.pinY = Math.round((z.arriba + z.abajo) / 2);
    app.style.setProperty('--c-atrib-arriba', `${Math.round(z.arriba + 6)}px`);
  }
  function centrarVisible(punto, zoom) {
    if (!punto) return;
    const mapa = m.mapa;
    const z = zoom ?? mapa.getZoom();
    const desfase = ui.pinY - mapa.getSize().y / 2;
    const pt = mapa.project([punto.lat, punto.lng], z).subtract([0, desfase]);
    mapa.setView(mapa.unproject(pt, z), z, { animate: !C.reducirMovimiento() });
  }
  function encuadrar(puntos, maxZoom = 17) {
    const validos = puntos.filter(Boolean);
    if (validos.length < 2) return centrarVisible(validos[0], maxZoom);
    const z = zonaVisible();
    const arriba = Math.max(60, z.arriba + 30);
    const abajo = z.alto - z.abajo + 36;
    m.ajustar(validos, { margen: [50, arriba], margenAbajo: Math.max(0, abajo - arriba), maxZoom });
    ultimoEncuadre = Date.now();
  }
  function mantenerVisible(punto, otro) {
    if (!punto || Date.now() - ultimoEncuadre < 3000) return;
    const z = zonaVisible();
    const pt = m.mapa.latLngToContainerPoint([punto.lat, punto.lng]);
    if (pt.y < z.arriba + 20 || pt.y > z.abajo - 20 || pt.x < 20 || pt.x > m.mapa.getSize().x - 20) encuadrar([punto, otro]);
  }
  m.mapa.on('dragstart', () => (ultimoEncuadre = Date.now() + 6000));

  function ponerMiTaxi() {
    const pos = c.estado.pos;
    if (pos) m.ponerTaxi('yo', pos, { rumbo: pos.rumbo || 0, destacado: true });
  }

  /* ------------------------------------------------------------------ */
  /* Ciclo de pintado                                                   */
  /* ------------------------------------------------------------------ */
  function claveActual() {
    if (!c.ingresado) return 'ingreso';
    const v = c.estado.viaje;
    if (v) return `viaje:${v.fase}`;
    return `tab:${ui.tab}${ui.sub ? ':' + ui.sub : ''}`;
  }

  function pintar() {
    const e = c.estado;
    const fase = e.viaje?.fase || null;
    if (fase !== faseAnterior) {
      const antes = faseAnterior;
      faseAnterior = fase;
      alCambiarFase(antes, fase);
    }
    const clave = claveActual();
    if (clave !== claveVista) {
      claveVista = clave;
      pintarVista(clave);
    }
    if (clave !== 'ingreso') {
      ponerMiTaxi();
      vistaDe(clave).actualizar?.(e);
      pintarSolicitud(e);
      actualizarChips(e);
    }
  }

  function alCambiarFase(antes, ahora) {
    if (antes !== undefined && antes !== ahora) {
      C.cerrarHojas(app);
      // Un error de la fase anterior (p. ej. «Código incorrecto») ya no aplica.
      app.querySelectorAll('.c-aviso-error').forEach((a) => a.remove());
    }
    ui.llegada = false;
    ui.rutaDibujada = null;
    if (ahora === 'calificar') ui.calif = { estrellas: 0, etiquetas: new Set() };
    if (!ahora && antes) {
      ui.tab = 'tablero';
      ui.sub = null;
      m.quitarRuta();
      m.quitarOrigen();
      m.quitarDestino();
    }
  }

  function vistaDe(clave) {
    if (clave.startsWith('tab:tablero')) return VISTAS.tablero;
    if (clave.startsWith('tab:')) return VISTAS.seccion;
    return VISTAS[clave] || VISTAS.tablero;
  }

  function pintarVista(clave) {
    for (const f of limpiezas.splice(0)) f();
    casillas = null;
    app.dataset.vista = clave.replace(/:/g, '-');
    // El ingreso tapa todo: lo de atrás no debe recibir foco.
    C.inerte([app.querySelector('.c-mapa-envoltura'), hud, contenido, capaSolicitud, dock], clave === 'ingreso');
    if (clave === 'ingreso') {
      capaIngreso.hidden = false;
      hud.innerHTML = '';
      contenido.innerHTML = '';
      dock.hidden = true;
      cerrarSolicitud();
      pintarIngreso();
      return;
    }
    capaIngreso.hidden = true;
    capaIngreso.innerHTML = '';
    const v = vistaDe(clave);
    const { cabeza = '', cuerpo = '' } = v.html(clave);
    hud.innerHTML = cabeza;
    contenido.innerHTML = cuerpo;
    dock.hidden = Boolean(c.estado.viaje);
    app.dataset.dock = dock.hidden ? '0' : '1';
    for (const b of dock.querySelectorAll('[data-tab]')) {
      if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    ajustarMedidas();
    v.montar?.(clave);
    v.entrar?.(clave);
    actualizarChips(c.estado, true);
  }

  let chipsPintados = '';
  function actualizarChips(e, forzar = false) {
    const firma = `${e.conexion}|${e.gpsReal}`;
    if (!forzar && firma === chipsPintados) return;
    chipsPintados = firma;
    for (const el of app.querySelectorAll('[data-conexion]')) {
      el.dataset.estado = e.conexion;
      el.textContent = e.conexion === 'en-vivo' ? 'En vivo' : 'Solo este equipo';
    }
    for (const el of app.querySelectorAll('[data-gps]')) {
      el.dataset.real = String(Boolean(e.gpsReal));
      el.innerHTML = `${icono('mira')}<span>${e.gpsReal ? 'GPS real' : 'GPS simulado'}</span>`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ingreso (C1)                                                       */
  /* ------------------------------------------------------------------ */
  function pintarIngreso() {
    capaIngreso.innerHTML = `<section class="c-ingreso${E.esPropuesta ? ' c-con-franja' : ''}">
      ${C.franjaPropuestaHTML()}
      <div class="c-ingreso-arte" aria-hidden="true">
        <div class="c-ingreso-tablero">${C.anillo({ tam: 230, grosor: 10, id: 'c-anillo-ingreso', degradado: ['#FFE14D', '#FF4D9D'] })}</div>
        <div class="c-ingreso-taxi">${C.ilustracionTaxi('ing', { movil: MOVIL_DEMO })}</div>
      </div>
      <div class="c-ingreso-texto c-entrar">
        ${C.marcaHTML({ etiqueta: 'Conductores', clase: 'c-etiqueta-amarilla', id: 'ing' })}
        <h1>Tu cabina de <em>trabajo</em>.</h1>
        <p class="c-muted">Recibe servicios cerca, navega hasta el pasajero y cobra con QR.</p>
      </div>
      <form class="c-ingreso-form c-vidrio c-entrar" novalidate>
        <label class="c-campo-etiqueta">Número de móvil
          <span class="c-input-prefijo"><span>${icono('taxi')}</span><input class="c-input" id="c-movil" inputmode="numeric" maxlength="3" autocomplete="username" placeholder="${E.taxis ? `001 a ${String(E.taxis).padStart(3, '0')}` : `Ej.: ${MOVIL_DEMO}`}" required></span>
        </label>
        <label class="c-campo-etiqueta">PIN de 4 dígitos
          <span class="c-input-prefijo"><span>${icono('candado')}</span><input class="c-input c-input-pin" id="c-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="••••" required></span>
        </label>
        <p class="c-pista">${icono('info')}<span>Demo: móvil <strong>${esc(MOVIL_DEMO)}</strong>, PIN <strong>1234</strong></span></p>
        <p class="c-error" data-error hidden></p>
        <button type="submit" class="c-boton c-boton-grande c-boton-ancho">Ingresar ${icono('flecha')}</button>
      </form>
      <a class="c-enlace c-ingreso-pasajero" href="${esc(C.urlApp('pasajero'))}" data-app-pasajero>${icono('perfil')} Soy pasajero</a>
    </section>`;
    C.fijarAnillo(capaIngreso.querySelector('.c-anillo'), 0.68);
    const form = capaIngreso.querySelector('form');
    const movil = form.querySelector('#c-movil');
    const pin = form.querySelector('#c-pin');
    for (const inp of [movil, pin]) inp.addEventListener('input', () => (inp.value = inp.value.replace(/\D/g, '')));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const n = Number(movil.value);
      const error = form.querySelector('[data-error]');
      const mostrar = (t) => {
        error.hidden = false;
        error.innerHTML = `${icono('alerta')}<span>${esc(t)}</span>`;
      };
      // Si la ficha no trae cuántos taxis hay, se acepta cualquier móvil de 001 a 999.
      if (!movil.value || !Number.isInteger(n) || n < 1 || n > maxMovil) return mostrar(`El número de móvil va del 001 al ${String(maxMovil).padStart(3, '0')}.`);
      if (!/^\d{4}$/.test(pin.value)) return mostrar('El PIN tiene 4 dígitos.');
      const cd = N.perfil.ingresarConductor({ movil: String(n).padStart(3, '0'), pin: pin.value });
      avisar({ titulo: `¡Hola, ${N.primerNombre(cd.nombre)}!`, cuerpo: `Móvil ${cd.movil} · ${cd.placa}. Conéctate para recibir servicios.`, tipo: 'exito' });
      N.sonar('exito');
      repintar();
    });
    if (!vitrina) setTimeout(() => movil.focus({ preventScroll: true }), 100);
  }

  /* ------------------------------------------------------------------ */
  /* Piezas                                                             */
  /* ------------------------------------------------------------------ */
  const hudBarra = () => `<div class="c-hud-barra c-vidrio">
      <button type="button" class="c-hud-perfil" data-accion="tab" data-tab="perfil" aria-label="Mi taxi y perfil">${C.avatarHTML(yo().nombre, 'c-avatar-chico')}<span><strong>Móvil ${esc(yo().movil)}</strong><small>${esc(N.primerNombre(yo().nombre || ''))} · ${esc(yo().placa || '')}</small></span></button>
      <div class="c-hud-chips"><span class="c-chip-gps" data-gps></span><span class="c-conexion" data-conexion></span></div>
    </div>`;

  function hudViaje(etiqueta, { numeros = true, extra = '' } = {}) {
    return `<div class="c-hud-viaje c-vidrio">
      <div class="c-hud-fila"><span class="c-hud-fase"><span class="c-hud-led" aria-hidden="true"></span><span data-hud-fase>${esc(etiqueta)}</span></span><span class="c-hud-derecha">${extra}<span class="c-chip-gps" data-gps></span></span></div>
      ${numeros
        ? `<div class="c-hud-numeros" aria-live="off">
            <div><strong data-hud-dist>–</strong><small data-hud-dist-u>km</small></div>
            <span class="c-hud-sep" aria-hidden="true"></span>
            <div><strong data-hud-min>–</strong><small>min</small></div>
          </div>`
        : ''}
    </div>`;
  }

  function actualizarHud(e) {
    const d = hud.querySelector('[data-hud-dist]');
    if (!d) return;
    const km = e.kmRestantes;
    let num = '–';
    let unidad = 'km';
    if (km != null) {
      if (km < 1) {
        num = String(Math.round((km * 1000) / 10) * 10);
        unidad = 'm';
      } else num = km.toFixed(1).replace('.', ',');
    }
    if (d.textContent !== num) d.textContent = num;
    hud.querySelector('[data-hud-dist-u]').textContent = unidad;
    const min = e.etaMin == null ? '–' : e.etaMin < 0.6 ? '<1' : String(Math.round(e.etaMin));
    const mm = hud.querySelector('[data-hud-min]');
    if (mm.textContent !== min) mm.textContent = min;
  }

  function filaPasajero(v) {
    const pas = v.pasajero || {};
    return `<div class="c-pasajero-fila">
      ${C.avatarHTML(pas.nombre)}
      <div class="c-pasajero-datos"><strong><span class="c-nombre-pasajero">${esc(pas.nombre || 'Pasajero')}</span>${v.simulado ? '<span class="c-etiqueta">Prueba</span>' : ''}</strong><span>${icono('estrella', 'c-ico-estrella')} ${C.calificacionTexto(pas.calificacion || 5)} · ${v.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}</span></div>
      <div class="c-tarifa-mini"><small>Tarifa</small><strong>${N.pesos(v.tarifa || 0)}</strong></div>
    </div>`;
  }

  function trayecto(v, { destinoPrimero = false } = {}) {
    const o = `<div class="c-trayecto-punto"><span class="c-punto c-punto-cian"></span><div><small>Recogida</small><strong>${esc(v.origen?.titulo || 'Punto marcado en el mapa')}</strong>${v.origen?.detalle ? `<span>${esc(v.origen.detalle)}</span>` : ''}</div></div>`;
    const d = `<div class="c-trayecto-punto"><span class="c-punto c-punto-magenta"></span><div><small>Destino</small><strong>${esc(v.destino?.titulo || 'A convenir con el pasajero')}</strong>${v.destino?.detalle ? `<span>${esc(v.destino.detalle)}</span>` : ''}</div></div>`;
    return `<div class="c-trayecto">${destinoPrimero ? d : o + d}</div>`;
  }

  function botonesNavegacion(p, { contacto = null } = {}) {
    if (!p) return '';
    const items = [
      `<a class="c-accion" href="${esc(N.urlSegura(N.enlaceNavegacion(p, 'google')))}" target="_blank" rel="noopener">${icono('navegar')}<span>Google Maps</span></a>`,
      `<a class="c-accion" href="${esc(N.urlSegura(N.enlaceNavegacion(p, 'waze')))}" target="_blank" rel="noopener">${icono('mapa')}<span>Waze</span></a>`,
    ];
    // El celular del pasajero llega del servidor: el enlace solo con dígitos (S30).
    if (contacto && N.enlaceTel(contacto)) {
      items.push(`<a class="c-accion" href="${esc(N.enlaceTel(contacto))}">${icono('telefono')}<span>Llamar</span></a>`);
      items.push(`<a class="c-accion" href="${esc(N.urlSegura(N.enlaceWhatsApp(contacto, `Hola, soy ${N.primerNombre(yo().nombre || '')}, tu conductor de ${E.nombre} (móvil ${yo().movil}).`)))}" target="_blank" rel="noopener">${icono('chat')}<span>WhatsApp</span></a>`);
    }
    return `<div class="c-acciones-viaje${items.length === 2 ? ' c-acciones-dos' : ''}">${items.join('')}</div>`;
  }

  function mensajePasajero(e) {
    const el = contenido.querySelector('[data-mensaje]');
    if (!el) return;
    if (!e.mensajePasajero) {
      el.hidden = true;
      return;
    }
    if (el.dataset.texto === e.mensajePasajero) return;
    el.dataset.texto = e.mensajePasajero;
    el.hidden = false;
    el.innerHTML = `<span class="c-mensaje-ico">${icono('chat')}</span><div><small>Mensaje del pasajero</small><p>${esc(e.mensajePasajero)}</p></div>`;
  }

  function dibujarRuta(e) {
    if (e.rutaActual === ui.rutaDibujada) return;
    ui.rutaDibujada = e.rutaActual;
    if (e.rutaActual?.length) m.ponerRuta(e.rutaActual, { color: AMARILLO });
    else m.quitarRuta();
  }

  /* ------------------------------------------------------------------ */
  /* Vistas                                                             */
  /* ------------------------------------------------------------------ */
  const secciones = crearSeccionesConductor({ N, c, app, ui, avisar, irATab, repintar });

  const VISTAS = {
    tablero: {
      html() {
        return {
          cabeza: hudBarra(),
          cuerpo: `<div class="c-demanda c-vidrio" aria-hidden="true"><span class="c-demanda-punto"></span><span class="c-demanda-texto">Alta demanda: <strong>${esc(ZONAS[0].nombre)}</strong>${ZONAS[1] ? ` · ${esc(ZONAS[1].nombre)}` : ''}</span></div>
          <section class="c-tablero c-vidrio c-entrar" aria-label="Tablero del día">
            <div class="c-tablero-fila">
              ${C.anillo({ tam: 150, grosor: 12, id: 'c-anillo-ganancias', degradado: ['#FFE14D', '#FF4D9D'], etiqueta: 'Ganancias del día contra la meta', contenido: `<small class="c-anillo-hoy">Hoy</small><strong class="c-anillo-valor-texto" data-ganado>$0</strong><span class="c-anillo-meta" data-meta>de ${N.pesos(ui.meta)}</span>` })}
              <div class="c-tablero-datos">
                <div><strong data-viajes>0</strong><small>viajes hoy</small></div>
                <div><strong data-km>0 km</strong><small>recorridos</small></div>
                <div><strong data-prom>—</strong><small>calificación</small></div>
              </div>
            </div>
            <div class="c-tablero-control">
              <button type="button" class="c-encendido" data-accion="encender" aria-pressed="false" aria-label="Conectarse">${icono('power')}</button>
              <div class="c-encendido-texto"><strong data-estado-titulo>Estás desconectado</strong><small data-estado-sub>Toca el botón para recibir servicios</small></div>
            </div>
            <button type="button" class="c-boton c-boton-cian c-boton-ancho" data-accion="simular">${icono('rayo')} Simular solicitud (demo)</button>
          </section>`,
        };
      },
      entrar() {
        m.quitarRuta();
        m.quitarOrigen();
        m.quitarDestino();
        const pos = c.estado.pos || N.CENTRO;
        // Se incluye el círculo completo de cada zona (y su etiqueta, arriba o abajo).
        const bordes = circulosZona.flatMap((z, i) => {
          const b = z.getBounds();
          const alto = b.getNorth() - b.getSouth();
          const abajo = ZONAS[i]?.abajo ? alto * 0.35 : 0;
          return [{ lat: b.getNorth() + (abajo ? 0 : alto * 0.35), lng: b.getWest() }, { lat: b.getSouth() - abajo, lng: b.getEast() }];
        });
        encuadrar([pos, ...bordes], 16);
      },
      actualizar(e) {
        const r = e.resumen || {};
        const set = (sel, t) => {
          const el = contenido.querySelector(sel);
          if (el && el.textContent !== t) el.textContent = t;
        };
        set('[data-ganado]', N.pesos(r.ganado || 0));
        set('[data-meta]', `${Math.round(((r.ganado || 0) / ui.meta) * 100)} % de ${N.pesos(ui.meta)}`);
        set('[data-viajes]', String(r.viajes || 0));
        set('[data-km]', r.km ? N.kmTexto(r.km) : '0 km');
        set('[data-prom]', r.promedio ? `${C.calificacionTexto(r.promedio)} ★` : '—');
        C.fijarAnillo(contenido.querySelector('.c-anillo'), (r.ganado || 0) / ui.meta);
        const b = contenido.querySelector('[data-accion="encender"]');
        if (b && b.getAttribute('aria-pressed') !== String(e.conectado)) {
          b.setAttribute('aria-pressed', String(e.conectado));
          b.setAttribute('aria-label', e.conectado ? 'Desconectarse' : 'Conectarse');
          app.classList.toggle('c-en-linea', e.conectado);
          set('[data-estado-titulo]', e.conectado ? 'En línea' : 'Estás desconectado');
          set('[data-estado-sub]', e.conectado ? 'Esperando solicitudes cerca de ti…' : 'Toca el botón para recibir servicios');
        }
        const sim = contenido.querySelector('[data-accion="simular"]');
        if (sim) sim.disabled = ui.simulando || e.solicitudes.length > 0;
      },
    },

    seccion: {
      html(clave) {
        const [, tab, sub] = clave.split(':');
        return { cabeza: '', cuerpo: secciones.html(tab, sub) };
      },
      montar(clave) {
        const [, tab, sub] = clave.split(':');
        secciones.montar(tab, sub, contenido);
      },
    },

    'viaje:confirmando': {
      html() {
        const v = c.estado.viaje;
        return {
          cabeza: hudViaje('Esperando confirmación', { numeros: false }),
          cuerpo: `<section class="c-panel c-vidrio c-entrar" aria-label="Esperando confirmación">
            ${filaPasajero(v)}
            <div class="c-esperando"><span class="c-girando"></span><span>Le avisamos a ${esc(v.pasajero?.nombre || 'el pasajero')} que tomaste el servicio…</span></div>
            ${trayecto(v)}
          </section>`,
        };
      },
      entrar() {
        const v = c.estado.viaje;
        m.ponerOrigen(v.origen);
        encuadrar([c.estado.pos, v.origen]);
      },
    },

    'viaje:hacia_origen': {
      html() {
        const v = c.estado.viaje;
        return {
          cabeza: hudViaje('Hacia el pasajero'),
          cuerpo: `<section class="c-panel c-vidrio c-entrar" aria-label="Hacia el pasajero">
            ${filaPasajero(v)}
            ${trayecto(v)}
            ${v.nota ? `<p class="c-nota-pasajero">${icono('nota')}<span>«${esc(v.nota)}»</span></p>` : ''}
            <div class="c-mensaje-pasajero" data-mensaje hidden></div>
            ${botonesNavegacion(v.origen, { contacto: v.pasajero?.celular || null })}
            <button type="button" class="c-boton c-boton-grande c-boton-ancho c-btn-llegue" data-accion="llegue">${icono('pin')} Llegué al punto</button>
            <button type="button" class="c-boton-texto c-cancelar" data-accion="cancelar">Cancelar servicio</button>
          </section>`,
        };
      },
      entrar() {
        const e = c.estado;
        m.quitarDestino();
        m.ponerOrigen(e.viaje.origen);
        dibujarRuta(e);
        encuadrar([e.pos, e.viaje.origen]);
      },
      actualizar(e) {
        actualizarHud(e);
        dibujarRuta(e);
        mensajePasajero(e);
        mantenerVisible(e.pos, e.viaje?.origen);
        if (ui.llegada) contenido.querySelector('[data-accion="llegue"]')?.classList.add('c-resaltado');
      },
    },

    'viaje:en_origen': {
      html() {
        const v = c.estado.viaje;
        return {
          cabeza: hudViaje(`Esperando a ${v.pasajero?.nombre || 'el pasajero'}`, { numeros: false, extra: '<span class="c-hud-espera" data-espera role="timer" aria-label="Tiempo de espera">0:00</span>' }),
          cuerpo: `<section class="c-panel c-vidrio c-entrar" aria-label="Verificar código de abordaje">
            ${filaPasajero(v)}
            <div class="c-mensaje-pasajero" data-mensaje hidden></div>
            <div class="c-codigo-panel">
              <h2>Pídele el código de abordaje</h2>
              <p class="c-muted">Son 4 dígitos que el pasajero ve en su app. Así confirmas que es la persona correcta.</p>
              <div class="c-casillas" id="c-codigo"></div>
              <p class="c-error" data-error hidden></p>
              ${v.codigoSimulado ? `<p class="c-pista">${icono('info')}<span>Pasajero de prueba: el código es <strong data-codigo-simulado>${esc(v.codigoSimulado)}</strong></span></p>` : ''}
            </div>
            <button type="button" class="c-boton c-boton-grande c-boton-ancho" data-accion="iniciar">${icono('check')} Verificar e iniciar viaje</button>
            <div class="c-fila-botones c-fila-discreta">
              <button type="button" class="c-boton-texto" data-accion="sin-codigo">Iniciar sin código</button>
              <button type="button" class="c-boton-texto" data-accion="cancelar">Cancelar servicio</button>
            </div>
          </section>`,
        };
      },
      montar() {
        casillas = C.montarCasillas(contenido.querySelector('#c-codigo'), { etiqueta: 'Código de abordaje', alCompletar: () => verificarCodigo() });
        setTimeout(() => casillas?.enfocar(), 200);
      },
      entrar() {
        const v = c.estado.viaje;
        m.quitarRuta();
        ui.rutaDibujada = null;
        m.ponerOrigen(v.origen);
        centrarVisible(v.origen, 17);
        const desde = Date.now();
        const t = setInterval(() => {
          const el = hud.querySelector('[data-espera]');
          if (!el) return;
          const sgs = Math.floor((Date.now() - desde) / 1000);
          el.textContent = `${Math.floor(sgs / 60)}:${String(sgs % 60).padStart(2, '0')}`;
        }, 1000);
        limpiezas.push(() => clearInterval(t));
      },
      actualizar(e) {
        mensajePasajero(e);
      },
    },

    'viaje:en_viaje': {
      html() {
        const v = c.estado.viaje;
        return {
          cabeza: hudViaje(v.destino ? 'En viaje al destino' : 'En viaje'),
          cuerpo: `<section class="c-panel c-vidrio c-entrar" aria-label="Viaje en curso">
            <div class="c-destino-grande"><span class="c-punto c-punto-magenta"></span><div><small>Destino</small><strong>${esc(v.destino?.titulo || 'A convenir con el pasajero')}</strong>${v.destino?.detalle ? `<span>${esc(v.destino.detalle)}</span>` : ''}</div></div>
            <div class="c-viaje-datos">
              <div><small>Pasajero</small><strong>${esc(v.pasajero?.nombre || 'Pasajero')}</strong></div>
              <div><small>Tarifa</small><strong>${N.pesos(v.tarifa || 0)}</strong></div>
              <div><small>Pago</small><strong>${v.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}</strong></div>
            </div>
            ${botonesNavegacion(v.destino)}
            <button type="button" class="c-boton c-boton-grande c-boton-ancho c-btn-terminar" data-accion="terminar">${icono('check')} Terminar viaje</button>
          </section>`,
        };
      },
      entrar() {
        const e = c.estado;
        m.quitarOrigen();
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
        dibujarRuta(e);
        encuadrar([e.pos, e.viaje.destino]);
      },
      actualizar(e) {
        actualizarHud(e);
        if (e.rutaActual !== ui.rutaDibujada) {
          dibujarRuta(e);
          if (e.rutaActual?.length) encuadrar([e.pos, e.viaje?.destino]);
        }
        mantenerVisible(e.pos, e.viaje?.destino);
        if (ui.llegada) contenido.querySelector('[data-accion="terminar"]')?.classList.add('c-resaltado');
      },
    },

    'viaje:cobrando': {
      html() {
        const v = c.estado.viaje;
        return {
          cabeza: hudViaje('Cobro del viaje', { numeros: false }),
          cuerpo: `<section class="c-panel c-panel-cobro c-vidrio c-borde-neon c-entrar" aria-label="Cobro con QR"><div class="c-desplazable">
            <div class="c-cobro-cabeza">${C.etiquetasPrueba('Cobro de prueba')}<span class="c-muted">${esc(v.pasajero?.nombre || 'El pasajero')} prefiere <strong>${v.metodoPago === 'efectivo' ? 'efectivo' : 'QR'}</strong></span></div>
            <div class="c-qr-breb" data-qr>${N.tarjetaBreB({ url: v.urlCobro, valor: v.valor, movil: c.perfil?.movil, compacta: true })}</div>
            <p class="c-cobro-ayuda">Muéstrale este QR Bre-B al pasajero para que lo escanee con su app o con la cámara.</p>
            <p class="c-esperando"><span class="c-girando"></span><span>Esperando el pago…</span></p>
            <button type="button" class="c-boton c-boton-cian c-boton-ancho" data-accion="efectivo">${icono('efectivo')} Recibí efectivo</button>
          </div></section>`,
        };
      },
      entrar() {
        m.quitarRuta();
        ui.rutaDibujada = null;
        centrarVisible(c.estado.pos, 16);
      },
    },

    'viaje:calificar': {
      html() {
        const v = c.estado.viaje;
        const pago = v.pago || {};
        return {
          cabeza: hudViaje('Viaje terminado', { numeros: false }),
          cuerpo: `<section class="c-panel c-vidrio c-entrar" aria-label="Calificar al pasajero">
            <div class="c-pago-ok c-pago-ok-grande">
              <span class="c-check-neon">${icono('check')}</span>
              <div><strong>${pago.metodo === 'qr' ? 'Pago recibido por QR (prueba)' : 'Pago en efectivo registrado'}</strong>
              <span class="c-pago-valor">${N.pesos(pago.valor || v.valor || 0)}</span>
              <small>${pago.billetera ? `${esc(pago.billetera)} · ` : ''}${pago.ref ? `Ref. ${esc(pago.ref)}` : pago.metodo === 'qr' ? 'Sin referencia' : 'Recibido en mano'}</small></div>
            </div>
            <h2 class="c-panel-titulo">¿Cómo fue el viaje con ${esc(v.pasajero?.nombre || 'el pasajero')}?</h2>
            ${C.estrellasHTML('Califica al pasajero')}
            <p class="c-estrellas-texto" data-estrellas-texto>Toca para calificar</p>
            <div class="c-etiquetas" role="group" aria-label="¿Qué destacas del pasajero?">
              ${N.ETIQUETAS_CALIFICACION.pasajero.map((t) => `<button type="button" class="c-chip" aria-pressed="false" data-accion="etiqueta" data-etiqueta="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
            <button type="button" class="c-boton c-boton-grande c-boton-ancho" data-accion="calificar">Enviar y seguir trabajando</button>
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
        m.quitarDestino();
      },
    },
  };

  /* ------------------------------------------------------------------ */
  /* Solicitud entrante (C3)                                            */
  /* ------------------------------------------------------------------ */
  function cerrarSolicitud() {
    clearInterval(relojSolicitud);
    relojSolicitud = null;
    if (ui.solicitudVista) {
      ui.solicitudVista = null;
      capaSolicitud.innerHTML = '';
      app.classList.remove('c-con-solicitud');
      if (!c.estado.viaje) {
        m.quitarOrigen();
        // Rechazada o vencida: el mapa vuelve a mostrar el tablero.
        if (claveVista === 'tab:tablero') VISTAS.tablero.entrar();
      }
    }
  }

  // Muestra en el mapa al conductor y el punto de recogida, por encima de la tarjeta.
  function encuadrarSolicitud(s) {
    const tarjeta = capaSolicitud.querySelector('.c-solicitud');
    if (!tarjeta || !s.origen) return;
    const alto = app.clientHeight;
    const h = hud.getBoundingClientRect();
    // 56 px de más arriba: el pin de recogida se dibuja por encima de su punta.
    const arriba = Math.max(60, (h.height ? h.bottom - app.getBoundingClientRect().top : 0) + 56);
    const abajo = alto - tarjeta.offsetTop + 40;
    if (alto - arriba - abajo < 80) return;
    m.ajustar([c.estado.pos || N.CENTRO, s.origen], { margen: [50, arriba], margenAbajo: Math.max(0, abajo - arriba), maxZoom: 16 });
    ultimoEncuadre = Date.now();
  }

  function pintarSolicitud(e) {
    const s = !e.viaje && e.solicitudes[0];
    if (!s) return cerrarSolicitud();
    if (ui.solicitudVista === s.viajeId) return;
    clearInterval(relojSolicitud);
    ui.solicitudVista = s.viajeId;
    app.classList.add('c-con-solicitud');
    const total = N.TIEMPOS.aceptar;
    capaSolicitud.innerHTML = `<div class="c-solicitud-fondo">
      <section class="c-solicitud c-vidrio c-borde-neon" role="alertdialog" aria-modal="true" aria-labelledby="c-sol-titulo" aria-describedby="c-sol-desc"><div class="c-desplazable">
        <div class="c-solicitud-cabeza">
          ${C.anillo({ tam: 104, grosor: 8, id: 'c-anillo-cuenta', degradado: ['#FF4D9D', '#FFE14D'], contenido: '<strong class="c-cuenta" data-seg>25</strong><small class="c-cuenta-u">seg</small>', etiqueta: 'Tiempo para aceptar' })}
          <div class="c-solicitud-quien">
            <div class="c-solicitud-etiquetas"><span class="c-etiqueta c-etiqueta-amarilla">${icono('rayo')} Nueva solicitud</span>${s.simulada ? '<span class="c-etiqueta">Prueba</span>' : ''}</div>
            <h2 id="c-sol-titulo">${esc(s.pasajero?.nombre || 'Pasajero')}</h2>
            <p>${icono('estrella', 'c-ico-estrella')} ${C.calificacionTexto(s.pasajero?.calificacion || 5)} · a <strong>${N.kmTexto(s.distanciaAMi || 0)}</strong> de ti</p>
          </div>
        </div>
        <div class="c-solicitud-tarifa">
          <strong>${N.pesos(s.tarifa || 0)}</strong>
          <div><span class="c-chip-pago">${icono(s.metodoPago === 'efectivo' ? 'efectivo' : 'qr')} ${s.metodoPago === 'efectivo' ? 'Efectivo' : 'QR'}</span><small>${s.km ? N.kmTexto(s.km) : ''}${s.min ? ` · ${N.minutosTexto(s.min)}` : ''}</small></div>
        </div>
        <div id="c-sol-desc">${trayecto(s)}</div>
        ${s.nota ? `<p class="c-nota-pasajero">${icono('nota')}<span>«${esc(s.nota)}»</span></p>` : ''}
        <div class="c-solicitud-botones">
          <button type="button" class="c-boton c-boton-fantasma" data-accion="rechazar" data-id="${esc(s.viajeId)}">${icono('x')} Rechazar</button>
          <button type="button" class="c-boton c-boton-grande" data-accion="aceptar" data-id="${esc(s.viajeId)}">${icono('check')} Aceptar</button>
        </div>
      </div></section>
    </div>`;
    m.ponerOrigen(s.origen);
    requestAnimationFrame(() => encuadrarSolicitud(s));
    const anilloEl = capaSolicitud.querySelector('.c-anillo');
    const seg = capaSolicitud.querySelector('[data-seg]');
    const tic = () => {
      const resta = Math.max(0, s.expira - Date.now());
      C.fijarAnillo(anilloEl, resta / total);
      const t = String(Math.ceil(resta / 1000));
      if (seg.textContent !== t) seg.textContent = t;
      anilloEl.classList.toggle('c-urgente', resta < 8000);
    };
    tic();
    relojSolicitud = setInterval(tic, 200);
    setTimeout(() => capaSolicitud.querySelector('[data-accion="aceptar"]')?.focus({ preventScroll: true }), 120);
  }

  /* ------------------------------------------------------------------ */
  /* Código de abordaje (C5)                                            */
  /* ------------------------------------------------------------------ */
  let verificando = false;
  async function verificarCodigo() {
    if (!casillas || verificando) return;
    const codigo = casillas.valor();
    const error = contenido.querySelector('[data-error]');
    if (codigo.length < 4) {
      error.hidden = false;
      error.innerHTML = `${icono('alerta')}<span>Escribe los 4 dígitos.</span>`;
      casillas.error();
      return;
    }
    verificando = true;
    const ok = await c.iniciar(codigo);
    verificando = false;
    if (!ok) {
      error.hidden = false;
      error.innerHTML = `${icono('alerta')}<span>Código incorrecto. Pídeselo de nuevo al pasajero.</span>`;
      casillas.error();
      setTimeout(() => casillas?.limpiar(), 500);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Acciones                                                           */
  /* ------------------------------------------------------------------ */
  function abrirCancelar() {
    C.abrirHoja(app, {
      titulo: '¿Cancelar el servicio?',
      contenido: `<p>Le avisaremos al pasajero. Elige el motivo:</p>
        ${N.MOTIVOS_CANCELACION.conductor.map((mtv) => `<button type="button" class="c-opcion" data-accion="motivo" data-motivo="${esc(mtv)}">${icono('chevron')}<span>${esc(mtv)}</span></button>`).join('')}
        <button type="button" class="c-boton c-boton-ancho" data-cerrar-hoja>Seguir con el servicio</button>`,
    });
  }

  const acciones = {
    tab: (b) => irATab(b.dataset.tab),
    encender: () => {
      if (c.estado.conectado) {
        if (!c.desconectar()) avisar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo antes de desconectarte.', tipo: 'error' });
        else avisar({ titulo: 'Te desconectaste', cuerpo: 'No te llegarán solicitudes.', tipo: 'info' });
      } else {
        // El permiso de notificaciones es del navegador (no de la cooperativa): clave común.
        if (!localStorage.getItem('ct.c.permisoConductor')) {
          localStorage.setItem('ct.c.permisoConductor', '1');
          N.pedirPermisoNotificaciones();
        }
        c.conectar();
      }
    },
    simular: async (b) => {
      if (ui.simulando) return;
      ui.simulando = true;
      b.disabled = true;
      b.classList.add('c-cargando-boton');
      try {
        // El núcleo a veces sortea un destino intermunicipal que no existe y
        // falla («reading 'lat'»); se reintenta en silencio antes de avisar.
        for (let intento = 1; ; intento++) {
          try {
            await c.simularSolicitud();
            break;
          } catch (err) {
            if (intento >= 4) throw err;
          }
        }
      } catch (err) {
        avisar({ titulo: 'No se pudo simular la solicitud', cuerpo: 'Intenta de nuevo en un momento.', tipo: 'error' });
      } finally {
        ui.simulando = false;
        b.classList.remove('c-cargando-boton');
        programar();
      }
    },
    aceptar: async (b) => {
      b.disabled = true;
      const ok = await c.aceptar(b.dataset.id);
      if (!ok) avisar({ titulo: 'La solicitud ya no está disponible', tipo: 'info' });
    },
    rechazar: (b) => {
      c.rechazar(b.dataset.id);
      avisar({ titulo: 'Solicitud rechazada', cuerpo: 'Seguirás recibiendo servicios.', tipo: 'info' });
    },
    llegue: () => c.llegue(),
    iniciar: () => verificarCodigo(),
    'sin-codigo': () => {
      C.abrirHoja(app, {
        titulo: '¿Iniciar sin código?',
        contenido: `<p>Úsalo solo si el pasajero no tiene la app a la mano. Confirma su nombre antes de arrancar.</p>
          <button type="button" class="c-boton c-boton-ancho" data-accion="confirmar-sin-codigo">Sí, iniciar el viaje</button>
          <button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-sin-codigo': async () => {
      C.cerrarHojas(app, { todas: true });
      await c.iniciar(null, { sinCodigo: true });
    },
    terminar: () => c.finalizar(),
    efectivo: () => c.confirmarEfectivo(),
    etiqueta: (b) => {
      const t = b.dataset.etiqueta;
      if (ui.calif.etiquetas.has(t)) ui.calif.etiquetas.delete(t);
      else ui.calif.etiquetas.add(t);
      b.setAttribute('aria-pressed', String(ui.calif.etiquetas.has(t)));
    },
    calificar: () => {
      if (!ui.calif.estrellas) {
        avisar({ titulo: 'Elige las estrellas', cuerpo: 'Toca de 1 a 5 estrellas para calificar al pasajero.', tipo: 'error' });
        return;
      }
      c.calificar(ui.calif.estrellas, { etiquetas: [...ui.calif.etiquetas] });
      avisar({ titulo: '¡Servicio completado!', cuerpo: 'Gracias por calificar. Sigues en línea.', tipo: 'exito' });
    },
    cancelar: abrirCancelar,
    motivo: (b) => {
      C.cerrarHojas(app, { todas: true });
      c.cancelar(b.dataset.motivo);
    },
    ...secciones.acciones,
  };

  app.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-accion]');
    if (!b || !app.contains(b) || b.disabled) return;
    const fn = acciones[b.dataset.accion];
    if (fn) fn(b, ev);
  });

  c.on('cambio', programar);
  c.on('aviso', (a) => avisar(a));
  c.on('vencida', () => avisar({ titulo: 'La solicitud venció', cuerpo: 'No respondiste a tiempo; se le ofreció a otro móvil.', tipo: 'info' }));
  c.on('llegada', (fase) => {
    ui.llegada = true;
    const boton = contenido.querySelector(fase === 'en_viaje' ? '[data-accion="terminar"]' : '[data-accion="llegue"]');
    boton?.classList.add('c-resaltado');
    N.sonar('alerta');
    avisar(fase === 'en_viaje'
      ? { titulo: 'Llegaste al destino', cuerpo: 'Toca «Terminar viaje» para cobrar.', tipo: 'alerta' }
      : { titulo: 'Llegaste al punto de recogida', cuerpo: 'Toca «Llegué» para avisarle al pasajero.', tipo: 'alerta' });
  });
  window.addEventListener('resize', () => {
    m.refrescar();
    ajustarMedidas();
  });

  if (c.estado.pos) m.centrar(c.estado.pos, 15);
  pintar();
  return { c, m };
}
