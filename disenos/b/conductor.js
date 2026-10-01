// Diseño B «Verde Rosal» — app del conductor.
// Botones enormes y de alto contraste, solicitudes en tarjetas grandes y, durante
// el viaje, un solo botón principal abajo que cambia según el paso.
import {
  ic, insignia, taxiLado, esc, decimal, celularTexto, numeroMiles, placaHTML, avatarHTML, estrellasHTML,
  conexionHTML, actualizarConexion, casillasHTML, activarCasillas, crearAvisos, crearHoja, ladoMarco,
  enlaceParaCelular, ponerTeselas, nombreCorto, sinCorte, encuadrar, FOTOS, fotoHTML, activarFotos,
  protegerVibracion,
} from './comun.js';

const PESTANAS = [
  ['servicios', 'Servicios', 'volante'],
  ['ganancias', 'Ganancias', 'ganancias'],
  ['documentos', 'Documentos', 'documento'],
  ['perfil', 'Perfil', 'usuario'],
];
const TEXTO_ESTRELLAS = ['Toca las estrellas', 'Muy malo', 'Malo', 'Regular', 'Bueno', '¡Excelente!'];
const DOCUMENTOS = [
  ['soat', 'SOAT', 'Seguro obligatorio'],
  ['tecnomecanica', 'Revisión técnico-mecánica', 'Certificado vigente'],
  ['licencia', 'Licencia de conducción', 'Categoría C1 · servicio público'],
  ['tarjetaControl', 'Tarjeta de control', 'Expedida por la cooperativa'],
];
const COLOR_RUTA = '#0B6B3A';

export async function montar(raiz, { N, diseno = 'b' } = {}) {
  protegerVibracion();
  const c = await N.crearConductor();

  raiz.innerHTML = `<div class="vb-marco">
    ${ladoMarco({
      titulo: 'App de los conductores',
      texto: 'Recibe servicios cerca de ti, sigue la ruta, verifica al pasajero con su código y cobra con QR.',
      puntos: ['Solicitudes con distancia, destino y tarifa', 'Navegación con Google Maps o Waze', 'Código de abordaje para cada pasajero', 'Ganancias del día y documentos al día'],
      enlaceQR: enlaceParaCelular(),
      textoQR: 'Escanea para abrirla en tu celular',
    })}
    <div class="vb-app vb-conductor">
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

  const ui = {
    pestana: 'servicios',
    clave: '',
    faseAnterior: null,
    resaltado: false,
    simulando: false,
    idsSolicitudes: '',
    estrellas: 0,
    etiquetas: new Set(),
    relojes: [],
    arrastre: 0,
    rutaDibujada: null,
    iniciando: false,
  };

  /* ---------------- mapa ---------------- */
  const mapaEl = document.createElement('div');
  mapaEl.className = 'vb-mapa';
  let m = null;
  let promesaMapa = null;
  let tokenMapa = 0;
  let modoMapa = null;

  function crearMapaUnaVez() {
    const pos = c.estado.pos || N.CENTRO;
    promesaMapa ??= N.crearMapa(mapaEl, { capa: 'suave', centro: pos, zoom: 16, colorRuta: COLOR_RUTA, colorOrigen: '#0B6B3A', colorDestino: '#D32F2F', controles: false }).then((mm) => {
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
    } catch {
      slot.insertAdjacentHTML('beforeend', '<p class="vb-mapa-error">No se pudo cargar el mapa. Revisa tu conexión.</p>');
      return;
    }
    if (token !== tokenMapa || !slot.isConnected) return;
    m.refrescar();
    configurarModo(modo);
  }

  function configurarModo(modo) {
    modoMapa = modo;
    m.quitarOrigen();
    m.quitarDestino();
    m.quitarRuta();
    ui.rutaDibujada = null;
    const e = c.estado;
    const pos = e.pos || N.CENTRO;
    ponerMiTaxi();
    if (modo === 'libre') {
      m.mapa.setView([pos.lat, pos.lng], 16, { animate: false, reset: true });
      return;
    }
    const v = e.viaje;
    if (!v) return;
    m.ponerOrigen(v.origen);
    if (v.destino) m.ponerDestino(v.destino);
    dibujarRuta();
    encuadrarViaje(true);
  }

  function ponerMiTaxi() {
    const e = c.estado;
    if (!m || !e.pos) return;
    const yo = c.perfil;
    m.ponerTaxi('yo', e.pos, { rumbo: e.pos.rumbo || 0, destacado: true, etiqueta: yo ? `Móvil ${esc(yo.movil)}` : '' });
  }

  function dibujarRuta() {
    const ruta = c.estado.rutaActual;
    if (!m || ruta === ui.rutaDibujada) return;
    ui.rutaDibujada = ruta;
    if (ruta?.length) m.ponerRuta(ruta, { color: COLOR_RUTA, grosor: 6, discontinua: c.estado.viaje?.fase !== 'en_viaje' });
    else m.quitarRuta();
  }

  function encuadrarViaje(reset = false) {
    const e = c.estado;
    const v = e.viaje;
    if (!m || !v) return;
    const objetivo = v.fase === 'en_viaje' ? v.destino || v.origen : v.origen;
    if (v.fase === 'en_origen') encuadrar(m, [v.origen], { maxZoom: 17, reset });
    else encuadrar(m, [e.pos, objetivo], { margen: [44, 92], maxZoom: 17, reset });
  }

  function seguirTaxi() {
    const e = c.estado;
    if (!m || !e.pos || !mapaEl.isConnected || Date.now() - ui.arrastre < 10000) return;
    const dentro = m.mapa.getBounds().pad(-0.15).contains([e.pos.lat, e.pos.lng]);
    if (dentro) return;
    if (modoMapa === 'viaje') encuadrarViaje();
    else m.mapa.setView([e.pos.lat, e.pos.lng], m.mapa.getZoom(), { animate: false });
  }

  /* ---------------- pintado ---------------- */
  function clave() {
    if (!c.ingresado) return 'ingreso';
    const v = c.estado.viaje;
    if (v) return `viaje:${v.fase}`;
    return `tab:${ui.pestana}`;
  }

  function pintar(forzar = false) {
    const fase = c.estado.viaje?.fase || null;
    if (fase !== ui.faseAnterior) {
      hoja.cerrar();
      avisos.limpiar();
      ui.resaltado = false;
      if (!fase) {
        ui.estrellas = 0;
        ui.etiquetas.clear();
        ui.pestana = 'servicios';
      }
      ui.faseAnterior = fase;
    }
    const k = clave();
    if (forzar || k !== ui.clave) renderCompleto(k);
    else actualizar();
  }

  function limpiarRelojes() {
    ui.relojes.forEach((r) => clearInterval(r));
    ui.relojes = [];
  }

  function renderCompleto(k) {
    const anterior = ui.clave;
    ui.clave = k;
    limpiarRelojes();
    m?.mapa.stop();
    const def = pantallaDe(k);
    vista.dataset.pantalla = k.replace(':', '-');
    vista.innerHTML = def.html();
    const conPestanas = k.startsWith('tab:');
    nav.hidden = !conPestanas;
    if (conPestanas) nav.innerHTML = htmlPestanas(ui.pestana);
    ui.idsSolicitudes = '';
    def.montar?.();
    actualizar();
    if (anterior !== k) vista.querySelector('h1')?.focus({ preventScroll: true });
  }

  function pantallaDe(k) {
    if (k === 'ingreso') return { html: htmlIngreso, montar: montarIngreso };
    if (k === 'tab:servicios') return { html: htmlServicios, montar: montarServicios };
    if (k === 'tab:ganancias') return { html: htmlGanancias };
    if (k === 'tab:documentos') return { html: htmlDocumentos };
    if (k === 'tab:perfil') return { html: htmlPerfil };
    if (k === 'viaje:cobrando') return { html: htmlCobro };
    if (k === 'viaje:calificar') return { html: htmlCalificar };
    return { html: htmlViaje, montar: montarViaje };
  }

  function actualizar() {
    const e = c.estado;
    actualizarConexion(app, e.conexion);
    const k = ui.clave;
    if (m && mapaEl.isConnected) {
      ponerMiTaxi();
      if (modoMapa === 'viaje') dibujarRuta();
      seguirTaxi();
    }
    if (k === 'tab:servicios') actualizarServicios();
    if (k.startsWith('viaje:')) actualizarViaje();
  }

  function htmlPestanas(actual) {
    return PESTANAS.map(([id, texto, icono]) => `<button type="button" class="vb-pestana${id === actual ? ' activa' : ''}" data-accion="tab" data-pantalla="${id}" ${id === actual ? 'aria-current="page"' : ''}>
      <span class="vb-pestana-ic">${ic(icono, 24)}</span><span>${texto}</span></button>`).join('');
  }

  /* ================================================================ */
  /* INGRESO                                                           */
  /* ================================================================ */
  function htmlIngreso() {
    return `<div class="vb-desliza vb-ingreso">
      <header class="vb-ingreso-cab">
        ${fotoHTML({ src: FOTOS.conductor, alt: 'Conductor de Cootransrural sonriendo junto a su taxi amarillo', posicion: '62% 28%', respaldo: `<span class="vb-ingreso-taxi">${taxiLado({ movil: '023' })}</span>` })}
        <div class="vb-ingreso-marca">${insignia(56)}<div><b>Cootransrural</b><span>App del conductor</span></div></div>
        <span class="vb-ingreso-chip" aria-hidden="true">${ic('taxi', 20)} Móvil <b data-movil-taxi>023</b></span>
      </header>
      <form class="vb-ingreso-form" data-form="ingreso" novalidate>
        <h1 tabindex="-1">Ingresa a tu turno</h1>
        <label class="vb-campo"><span>Número de móvil</span>
          <span class="vb-campo-movil"><span class="vb-prefijo">Móvil</span><input name="movil" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="username" placeholder="023" required></span></label>
        <div class="vb-campo"><span id="vb-pin-t">PIN de 4 dígitos</span>${casillasHTML({ id: 'vb-pin', etiqueta: 'PIN de 4 dígitos', oculto: true, autocompletar: 'current-password' })}</div>
        <p class="vb-pista">${ic('info', 20)}<span>Demo: móvil <b>023</b>, PIN <b>1234</b> (cualquier PIN de 4 dígitos sirve).</span></p>
        <p class="vb-error" data-error role="alert"></p>
        <button type="submit" class="vb-btn vb-btn-primario vb-btn-xl">${ic('volante')} Ingresar</button>
        <a class="vb-btn vb-btn-texto vb-btn-bloque" href="../app/?d=${diseno}">¿Eres pasajero? Pide tu taxi aquí</a>
      </form>
    </div>`;
  }

  let casillasPin = null;
  function montarIngreso() {
    activarFotos(vista);
    casillasPin = activarCasillas($('[data-casillas]'), { oculto: true, alCompletar: () => $('.vb-ingreso-form button[type="submit"]')?.focus() });
  }

  function ingresar(form) {
    const movil = String(new FormData(form).get('movil') || '').replace(/\D/g, '');
    const pin = casillasPin?.valor() || '';
    const error = form.querySelector('[data-error]');
    const n = Number(movil);
    if (!movil || n < 1 || n > N.EMPRESA.taxis) {
      error.textContent = `Los móviles de Cootransrural van del 001 al 0${N.EMPRESA.taxis}.`;
      form.querySelector('[name="movil"]').focus();
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      error.textContent = 'Escribe tu PIN de 4 dígitos.';
      casillasPin?.error();
      casillasPin?.campo.focus();
      return;
    }
    const perfil = N.perfil.ingresarConductor({ movil, pin });
    ui.pestana = 'servicios';
    pintar(true);
    avisos.limpiar();
    avisos.mostrar({ titulo: `¡Buen turno, ${nombreCorto(perfil.nombre)}!`, cuerpo: `Móvil ${perfil.movil} · ${perfil.placa}. Conéctate para recibir servicios.`, tipo: 'exito' });
  }

  /* ================================================================ */
  /* SERVICIOS (inicio)                                                */
  /* ================================================================ */
  function htmlCabConductor() {
    const yo = c.perfil || {};
    const e = c.estado;
    return `<header class="vb-c-cab">
      <div class="vb-c-yo">
        <span class="vb-c-movil" aria-label="Móvil ${esc(yo.movil)}"><small>Móvil</small><b>${esc(yo.movil)}</b></span>
        <div><b>${esc(yo.nombre || '')}</b><span>${esc(yo.placa || '')} · ${esc(yo.vehiculo || '')}</span></div>
      </div>
      <div class="vb-c-chips">
        <span class="vb-c-gps${e.gpsReal ? ' real' : ''}" data-gps>${ic('gps', 16)}<span>${e.gpsReal ? 'GPS real' : 'GPS simulado'}</span></span>
        ${conexionHTML(e.conexion)}
      </div>
    </header>`;
  }

  function htmlEstadoConexion() {
    const e = c.estado;
    if (!e.conectado) {
      return `<section class="vb-c-estado apagado">
        <div class="vb-c-estado-txt"><span class="vb-c-punto"></span><div><b>Estás desconectado</b><small>Conéctate para recibir servicios cerca de ti.</small></div></div>
        <button type="button" class="vb-btn vb-btn-primario vb-btn-xl vb-c-conectar" data-accion="conectar">${ic('encender')} Conectarme</button>
      </section>`;
    }
    return `<section class="vb-c-estado encendido">
      <div class="vb-c-estado-txt"><span class="vb-c-punto"></span><div><b>En línea</b><small>Esperando servicios cerca de ti…</small></div></div>
      <button type="button" class="vb-btn vb-btn-borde vb-c-desconectar" data-accion="desconectar">${ic('encender', 20)} Desconectarme</button>
    </section>`;
  }

  function htmlResumen() {
    const r = c.estado.resumen;
    return `<section class="vb-c-resumen" aria-label="Resumen de hoy">
      <h2>${ic('ganancias', 18)} Tu día</h2>
      <div><b>${r.viajes}</b><span>viaje${r.viajes === 1 ? '' : 's'}</span></div>
      <div><b>${N.pesos(r.ganado)}</b><span>ganado</span></div>
      <div><b>${r.promedio ? decimal(r.promedio) : '—'}</b><span>★ promedio</span></div>
    </section>`;
  }

  function htmlServicios() {
    return `<div class="vb-c-servicios">
      <div class="vb-c-mapa" data-slot-mapa>
        ${htmlCabConductor()}
        <button type="button" class="vb-btn-flotante vb-c-centrar" data-accion="centrar" aria-label="Centrar en mi taxi">${ic('miUbicacion', 22)}</button>
      </div>
      <section class="vb-c-panel">
        <span class="vb-asa" aria-hidden="true"></span>
        <h1 class="vb-sr" tabindex="-1">Servicios</h1>
        <div class="vb-c-solicitudes" data-solicitudes aria-live="polite"></div>
        <div data-estado-conexion>${htmlEstadoConexion()}</div>
        <button type="button" class="vb-btn vb-btn-oro vb-btn-xl vb-c-simular" data-accion="simular-solicitud">${ic('robot')} Simular solicitud (demo)</button>
        <div data-resumen>${htmlResumen()}</div>
      </section>
    </div>`;
  }

  function montarServicios() {
    colocarMapa($('[data-slot-mapa]'), 'libre');
    ui.relojes.push(setInterval(actualizarCuentas, 250));
  }

  function htmlSolicitud(s) {
    const pasajero = s.pasajero || {};
    const destino = s.destino;
    return `<article class="vb-solicitud" data-viaje="${esc(s.viajeId)}" aria-label="Solicitud de ${esc(pasajero.nombre || 'pasajero')}">
      <div class="vb-cuenta" aria-hidden="true"><i data-cuenta-barra></i></div>
      <header class="vb-solicitud-cab">
        <span class="vb-solicitud-tit">${ic('campana', 20)} Nueva solicitud</span>
        <span class="vb-solicitud-seg"><b data-cuenta-seg>25</b> s</span>
      </header>
      <div class="vb-solicitud-pasajero">
        ${avatarHTML(pasajero.nombre)}
        <div class="vb-solicitud-quien"><b>${esc(pasajero.nombre || 'Pasajero')}</b><span class="vb-sol-cal">${ic('estrella', 16)} ${decimal(pasajero.calificacion || 5)}</span>${s.simulada ? '<span class="vb-prueba">Prueba</span>' : ''}</div>
      </div>
      <div class="vb-solicitud-valor"><b>${N.pesos(s.tarifa)}</b><span class="vb-chip-pago ${s.metodoPago === 'qr' ? 'qr' : ''}">${ic(s.metodoPago === 'qr' ? 'qr' : 'billete', 18)} Paga ${s.metodoPago === 'qr' ? 'con QR' : 'en efectivo'}</span></div>
      <div class="vb-solicitud-cifras">
        <span>${ic('pin', 18)} A <b>${N.kmTexto(s.distanciaAMi || 0)}</b> de ti</span>
        ${s.km ? `<span>${ic('ruta', 18)} Viaje de <b>${N.kmTexto(s.km)}</b> · ${N.minutosTexto(s.min || 0)}</span>` : ''}
      </div>
      <div class="vb-punto-ruta"><i class="a">A</i><div><b>${esc(s.origen?.titulo || 'Punto en el mapa')}</b><span>${esc(s.origen?.detalle || '')}</span></div></div>
      <div class="vb-punto-ruta"><i class="b">B</i><div><b>${esc(destino?.titulo || 'Destino a convenir')}</b><span>${esc(destino?.detalle || (destino ? '' : 'El pasajero te lo dice al subir'))}</span></div></div>
      ${s.nota ? `<p class="vb-c-nota">${ic('mensaje', 18)} «${esc(s.nota)}»</p>` : ''}
      <div class="vb-solicitud-botones">
        <button type="button" class="vb-btn vb-btn-borde vb-c-rechazar" data-accion="rechazar" data-id="${esc(s.viajeId)}">Rechazar</button>
        <button type="button" class="vb-btn vb-btn-primario vb-c-aceptar" data-accion="aceptar" data-id="${esc(s.viajeId)}">${ic('check')} Aceptar</button>
      </div>
    </article>`;
  }

  function actualizarServicios() {
    const e = c.estado;
    const caja = $('[data-solicitudes]');
    if (caja) {
      const ids = e.solicitudes.map((s) => s.viajeId).join(',');
      if (ids !== ui.idsSolicitudes) {
        const habia = ui.idsSolicitudes;
        ui.idsSolicitudes = ids;
        caja.innerHTML = e.solicitudes.length
          ? `<h2 class="vb-c-sol-titulo">${e.solicitudes.length === 1 ? 'Te pidieron un servicio' : `${e.solicitudes.length} solicitudes`}</h2>${e.solicitudes.map(htmlSolicitud).join('')}`
          : '';
        const raizServicios = $('.vb-c-servicios');
        const antes = raizServicios?.classList.contains('con-solicitudes');
        raizServicios?.classList.toggle('con-solicitudes', e.solicitudes.length > 0);
        if (m && antes !== e.solicitudes.length > 0) requestAnimationFrame(() => {
          m.refrescar();
          if (c.estado.pos) m.mapa.setView([c.estado.pos.lat, c.estado.pos.lng], m.mapa.getZoom(), { animate: false });
        });
        if (ids && ids !== habia) $('.vb-c-panel')?.scrollTo({ top: 0, behavior: 'smooth' });
        actualizarCuentas();
      }
    }
    const estado = $('[data-estado-conexion]');
    if (estado && estado.dataset.conectado !== String(e.conectado)) {
      estado.dataset.conectado = String(e.conectado);
      estado.innerHTML = htmlEstadoConexion();
    }
    const resumen = $('[data-resumen]');
    const clave = JSON.stringify(e.resumen);
    if (resumen && resumen.dataset.clave !== clave) {
      resumen.dataset.clave = clave;
      resumen.innerHTML = htmlResumen();
    }
    const gps = $('[data-gps]');
    if (gps) {
      gps.classList.toggle('real', e.gpsReal);
      gps.querySelector('span').textContent = e.gpsReal ? 'GPS real' : 'GPS simulado';
    }
  }

  function actualizarCuentas() {
    const ahora = Date.now();
    for (const s of c.estado.solicitudes) {
      const el = vista.querySelector(`.vb-solicitud[data-viaje="${CSS.escape(s.viajeId)}"]`);
      if (!el) continue;
      const total = s.expira - s.recibida || N.TIEMPOS.aceptar;
      const queda = Math.max(0, s.expira - ahora);
      el.querySelector('[data-cuenta-barra]').style.width = `${(queda / total) * 100}%`;
      const seg = el.querySelector('[data-cuenta-seg]');
      const texto = String(Math.ceil(queda / 1000));
      if (seg.textContent !== texto) seg.textContent = texto;
      el.classList.toggle('urgente', queda < 8000);
    }
  }

  async function simularSolicitud(boton) {
    if (ui.simulando) return;
    ui.simulando = true;
    boton.disabled = true;
    boton.classList.add('cargando');
    try {
      await c.simularSolicitud();
    } catch (e) {
      avisos.mostrar({ titulo: 'No se pudo simular', cuerpo: e.message || '', tipo: 'error' });
    } finally {
      ui.simulando = false;
      if (boton.isConnected) {
        boton.disabled = false;
        boton.classList.remove('cargando');
      }
    }
  }

  async function aceptar(boton) {
    boton.disabled = true;
    boton.classList.add('cargando');
    const ok = await c.aceptar(boton.dataset.id);
    if (!ok && boton.isConnected) {
      boton.disabled = false;
      boton.classList.remove('cargando');
      avisos.mostrar({ titulo: 'Esa solicitud ya no está disponible', tipo: 'info' });
    }
  }

  /* ================================================================ */
  /* VIAJE                                                             */
  /* ================================================================ */
  function htmlBotonPrincipal(fase) {
    const textos = { hacia_origen: ['puerta', 'Ya llegué'], en_origen: ['taxi', 'Iniciar viaje'], en_viaje: ['bandera', 'Terminar viaje'] };
    const t = textos[fase];
    if (!t) return `<button type="button" class="vb-btn vb-btn-xl vb-c-principal espera" disabled><span class="vb-c-girando"></span> Esperando al pasajero…</button>`;
    return `<button type="button" class="vb-btn vb-btn-xl vb-c-principal fase-${fase}${ui.resaltado ? ' resaltado' : ''}" data-accion="principal">${ic(t[0], 26)} ${t[1]}</button>`;
  }

  function htmlAccionesNavegar(punto) {
    const v = c.estado.viaje;
    const cel = String(v?.pasajero?.celular || '').replace(/\D/g, '');
    return `<div class="vb-c-acciones">
      <a class="vb-accion" href="${esc(N.enlaceNavegacion(punto, 'google'))}" target="_blank" rel="noopener">${ic('navegar')}<span>Google Maps</span></a>
      <a class="vb-accion" href="${esc(N.enlaceNavegacion(punto, 'waze'))}" target="_blank" rel="noopener">${ic('mapa')}<span>Waze</span></a>
      ${cel ? `<a class="vb-accion" href="tel:+57${cel}">${ic('telefono')}<span>Llamar</span></a>
        <a class="vb-accion" href="${esc(N.enlaceWhatsApp(cel, 'Hola, soy tu conductor de Cootransrural.'))}" target="_blank" rel="noopener">${ic('chat')}<span>WhatsApp</span></a>` : ''}
    </div>`;
  }

  function htmlPasajero(v) {
    const p = v.pasajero || {};
    return `<div class="vb-c-pasajero">${avatarHTML(p.nombre)}<div><b>${esc(p.nombre || 'Pasajero')}</b><span>${ic('estrella', 16)} ${decimal(p.calificacion || 5)} · ${v.metodoPago === 'qr' ? 'Paga con QR' : 'Paga en efectivo'}</span></div>
      <span class="vb-c-tarifa">${N.pesos(v.tarifa)}</span></div>`;
  }

  function htmlMensajePasajero() {
    const msj = c.estado.mensajePasajero;
    return `<p class="vb-c-mensaje" data-mensaje ${msj ? '' : 'hidden'}>${ic('mensaje', 20)}<span>${esc(msj || '')}</span></p>`;
  }

  function htmlViaje() {
    const e = c.estado;
    const v = e.viaje;
    const f = v.fase;
    let cuerpo = '';
    if (f === 'confirmando') {
      cuerpo = `<div class="vb-c-espera"><span class="vb-c-girando grande"></span><h1 tabindex="-1">Esperando que el pasajero confirme…</h1><p>En unos segundos sabrás si el servicio es tuyo.</p></div>${htmlPasajero(v)}`;
    } else if (f === 'hacia_origen') {
      cuerpo = `${htmlMensajePasajero()}
        <div class="vb-c-titulo"><small>Recoge a tu pasajero</small><h1 tabindex="-1">Ve por ${esc(nombreCorto(v.pasajero?.nombre || 'el pasajero'))}</h1></div>
        <div class="vb-c-cifras${yaLlego(e) ? ' llego' : ''}" data-cifras><div class="vb-c-llegaste">${ic('check', 28)}<b>¡Llegaste al punto de recogida!</b></div><div><b data-eta>${e.etaMin != null ? N.minutosTexto(e.etaMin) : '…'}</b><span>para llegar</span></div><div><b data-km>${e.kmRestantes != null ? N.kmTexto(e.kmRestantes) : '…'}</b><span>de distancia</span></div></div>
        ${htmlPasajero(v)}
        <div class="vb-tarjeta vb-c-punto-tarjeta"><div class="vb-punto-ruta"><i class="a">A</i><div><small>Recogida</small><b>${esc(v.origen?.titulo || 'Punto en el mapa')}</b><span>${esc(v.origen?.detalle || '')}</span></div></div>
          ${v.nota ? `<p class="vb-c-nota">${ic('mensaje', 18)} «${esc(v.nota)}»</p>` : ''}</div>
        ${htmlAccionesNavegar(v.origen)}`;
    } else if (f === 'en_origen') {
      cuerpo = `${htmlMensajePasajero()}
        <div class="vb-c-titulo"><small>Estás en el punto de recogida</small><h1 tabindex="-1">Pídele el código a ${esc(nombreCorto(v.pasajero?.nombre || 'tu pasajero'))}</h1></div>
        <p class="vb-sub">Son 4 dígitos que el pasajero ve en su app. Así confirmas que es el servicio correcto.</p>
        ${casillasHTML({ id: 'vb-codigo-abordaje', etiqueta: 'Código de abordaje de 4 dígitos', autocompletar: 'off' })}
        <p class="vb-error centro" data-error-codigo role="alert"></p>
        ${v.codigoSimulado ? `<p class="vb-pista centro" data-pista-codigo>${ic('robot', 20)}<span>Pasajero de prueba: el código es <b>${esc(v.codigoSimulado)}</b></span></p>` : ''}
        ${htmlPasajero(v)}
        <button type="button" class="vb-btn vb-btn-texto vb-btn-bloque" data-accion="sin-codigo">Iniciar sin código</button>`;
    } else {
      cuerpo = `<div class="vb-c-titulo"><small>Rumbo a</small><h1 tabindex="-1">${esc(v.destino?.titulo || 'Destino a convenir')}</h1></div>
        <div class="vb-c-cifras${yaLlego(e) ? ' llego' : ''}" data-cifras><div class="vb-c-llegaste">${ic('bandera', 28)}<b>¡Llegaste al destino!</b></div><div><b data-eta>${e.etaMin != null ? N.minutosTexto(e.etaMin) : '—'}</b><span>restantes</span></div><div><b data-km>${e.kmRestantes != null ? N.kmTexto(e.kmRestantes) : '—'}</b><span>por recorrer</span></div></div>
        <div class="vb-progreso" aria-hidden="true"><i data-progreso></i><span class="vb-progreso-taxi" data-progreso-taxi>${ic('taxi', 22)}</span></div>
        ${htmlPasajero(v)}
        ${v.destino ? `<div class="vb-tarjeta vb-c-punto-tarjeta"><div class="vb-punto-ruta"><i class="b">B</i><div><small>Destino</small><b>${esc(v.destino.titulo || 'Punto en el mapa')}</b><span>${esc(v.destino.detalle || '')}</span></div></div></div>${htmlAccionesNavegar(v.destino)}` : '<p class="vb-c-nota">El pasajero te indica el destino.</p>'}`;
    }
    const puedeCancelar = ['confirmando', 'hacia_origen', 'en_origen', 'en_viaje'].includes(f);
    return `<div class="vb-c-viaje fase-${f}">
      <div class="vb-c-mapa" data-slot-mapa>
        <header class="vb-c-cab-viaje">
          <span class="vb-c-movil chico"><small>Móvil</small><b>${esc(c.perfil?.movil || '')}</b></span>
          <span class="vb-c-paso">${{ confirmando: 'Confirmando', hacia_origen: '1 · Hacia el pasajero', en_origen: '2 · En el punto', en_viaje: '3 · En viaje' }[f] || ''}</span>
          ${v.simulado ? '<span class="vb-prueba">Prueba</span>' : ''}
        </header>
        <button type="button" class="vb-btn-flotante vb-c-centrar" data-accion="encuadrar" aria-label="Ver toda la ruta">${ic('miUbicacion', 22)}</button>
      </div>
      <section class="vb-c-panel">
        <span class="vb-asa" aria-hidden="true"></span>
        ${cuerpo}
        ${puedeCancelar && f !== 'en_viaje' ? `<button type="button" class="vb-btn vb-btn-texto vb-btn-bloque vb-cancelar" data-accion="cancelar">${ic('cerrar', 20)} Cancelar servicio</button>` : ''}
      </section>
      <footer class="vb-c-barra">${htmlBotonPrincipal(f)}</footer>
    </div>`;
  }

  let casillasCodigo = null;
  function montarViaje() {
    colocarMapa($('[data-slot-mapa]'), 'viaje');
    const caja = $('[data-casillas]');
    casillasCodigo = caja ? activarCasillas(caja, { alCompletar: (codigo) => iniciarConCodigo(codigo) }) : null;
  }

  // La conducción llegó al punto: se cambia «1 min / 0 m» por un «¡Llegaste!» claro.
  function yaLlego(e) {
    return e.etaMin != null && e.etaMin < 0.5 && (e.kmRestantes ?? 0) < 0.05;
  }

  function actualizarViaje() {
    const e = c.estado;
    const v = e.viaje;
    if (!v) return;
    const cifras = $('[data-cifras]');
    if (cifras) cifras.classList.toggle('llego', yaLlego(e));
    // Solo se escribe el texto si cambió (el núcleo avisa varias veces por segundo).
    const poner = (el, texto) => {
      if (el && el.textContent !== texto) el.textContent = texto;
    };
    if (e.etaMin != null) poner($('[data-eta]'), N.minutosTexto(e.etaMin));
    if (e.kmRestantes != null) poner($('[data-km]'), N.kmTexto(e.kmRestantes));
    if (v.fase === 'en_viaje' && v.km && e.kmRestantes != null) {
      const frac = Math.min(1, Math.max(0, 1 - e.kmRestantes / v.km));
      const ancho = `${Math.round(frac * 100)}%`;
      const barra = $('[data-progreso]');
      if (barra && barra.style.width !== ancho) barra.style.width = ancho;
      const taxi = $('[data-progreso-taxi]');
      if (taxi && taxi.style.left !== ancho) taxi.style.left = ancho;
    }
    const msj = $('[data-mensaje]');
    if (msj) {
      const texto = e.mensajePasajero || '';
      msj.hidden = !texto;
      if (msj.querySelector('span').textContent !== texto) msj.querySelector('span').textContent = texto;
    }
  }

  async function iniciarConCodigo(codigo) {
    if (ui.iniciando) return;
    const error = $('[data-error-codigo]');
    if (!/^\d{4}$/.test(codigo || '')) {
      if (error) error.textContent = 'Escribe los 4 dígitos que te dice el pasajero.';
      casillasCodigo?.error();
      return;
    }
    ui.iniciando = true;
    try {
      const ok = await c.iniciar(codigo);
      if (!ok && c.estado.viaje?.fase === 'en_origen') {
        if (error) error.textContent = 'Ese código no coincide. Pídeselo de nuevo al pasajero.';
        casillasCodigo?.error();
        casillasCodigo?.limpiar();
        casillasCodigo?.campo.focus();
      }
    } finally {
      ui.iniciando = false;
    }
  }

  function accionPrincipal() {
    const v = c.estado.viaje;
    if (!v) return;
    if (v.fase === 'hacia_origen') c.llegue();
    else if (v.fase === 'en_origen') iniciarConCodigo(casillasCodigo?.valor() || '');
    else if (v.fase === 'en_viaje') c.finalizar();
  }

  function abrirCancelar() {
    hoja.abrir({
      titulo: '¿Por qué cancelas el servicio?',
      html: `<div class="vb-motivos" role="radiogroup" aria-label="Motivo">
          ${N.MOTIVOS_CANCELACION.conductor.map((x, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-accion="motivo" data-m="${esc(x)}">${esc(x)}</button>`).join('')}
        </div>
        <button type="button" class="vb-btn vb-btn-rojo vb-btn-xl" data-accion="confirmar-cancelar">Cancelar servicio</button>
        <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-cerrar-hoja>Seguir con el servicio</button>`,
    });
  }

  /* ================================================================ */
  /* COBRO Y CALIFICACIÓN                                              */
  /* ================================================================ */
  function htmlCobro() {
    const v = c.estado.viaje;
    let qr = '';
    try {
      qr = N.tarjetaBreB({ url: v.urlCobro, valor: v.valor, movil: c.perfil?.movil, compacta: true });
    } catch {
      qr = '<p>No se pudo generar el QR.</p>';
    }
    const p = v.pasajero || {};
    return `<div class="vb-desliza vb-c-cobro">
      <header class="vb-c-cobro-cab">
        <div><small>Viaje terminado</small><h1 tabindex="-1">Cobra el viaje</h1></div>
        <span class="vb-prueba">Modo prueba</span>
      </header>
      <section class="vb-c-qr-tarjeta" aria-label="Código QR de cobro">
        <span class="vb-c-qr-etq">Total a cobrar</span>
        <div class="vb-c-valor">${N.pesos(v.valor)}</div>
        <div class="vb-c-qr">${qr}</div>
        <p class="vb-c-qr-ayuda">${ic('camara', 20)} Muéstrale este QR Bre-B a ${esc(nombreCorto(p.nombre || 'tu pasajero'))} para que pague desde su app o con la cámara.</p>
        <div class="vb-c-qr-pie">${insignia(26)}<span>Cootransrural · Móvil ${esc(c.perfil?.movil || '')}</span></div>
      </section>
      <div class="vb-c-metodo">${ic(v.metodoPago === 'qr' ? 'qr' : 'billete', 22)}<span>${esc(nombreCorto(p.nombre || 'El pasajero'))} prefiere pagar <b>${v.metodoPago === 'qr' ? 'con QR' : 'en efectivo'}</b></span></div>
      <p class="vb-c-esperando" role="status"><span class="vb-c-girando"></span> Esperando el pago…</p>
      <button type="button" class="vb-btn vb-btn-primario vb-btn-xl" data-accion="efectivo">${ic('billete')} Recibí efectivo</button>
      <p class="vb-letra-chica centro">${ic('candado', 16)} Pago de prueba: no se mueve dinero real.</p>
    </div>`;
  }

  function htmlCalificar() {
    const v = c.estado.viaje;
    const pago = v.pago || {};
    const p = v.pasajero || {};
    return `<div class="vb-paso vb-c-calificar-pantalla">
      <div class="vb-desliza vb-c-calificar">
        <section class="vb-c-pago-ok" role="status">
          <span class="vb-recibo-ok-ic">${ic('check', 30)}</span>
          <div><b>${pago.metodo === 'qr' ? 'Pago recibido por QR' : 'Pago en efectivo registrado'}</b>
            <span class="vb-c-pago-valor">${N.pesos(pago.valor || v.valor)}</span>
            <span>${pago.metodo === 'qr' ? `${pago.billetera ? `${esc(pago.billetera)} · ` : ''}${pago.ref ? `Ref. ${esc(pago.ref)}` : ''}` : 'Recibido en mano'}</span></div>
          ${pago.metodo === 'qr' ? '<span class="vb-prueba">Prueba</span>' : ''}
        </section>
        <div class="vb-calif-quien">${avatarHTML(p.nombre, 'grande')}<h1 tabindex="-1">¿Cómo te fue con ${esc(nombreCorto(p.nombre || 'el pasajero'))}?</h1><p>Tu calificación ayuda a cuidar a la cooperativa.</p></div>
        <div class="vb-estrellas-elegir" role="radiogroup" aria-label="Calificación del pasajero">
          ${[1, 2, 3, 4, 5].map((i) => `<button type="button" role="radio" aria-checked="${ui.estrellas === i}" aria-label="${i} estrella${i > 1 ? 's' : ''}" data-accion="estrella" data-n="${i}" class="${i <= ui.estrellas ? 'llena' : ''}">${ic('estrella', 46)}</button>`).join('')}
        </div>
        <p class="vb-estrellas-texto" data-texto-estrellas>${TEXTO_ESTRELLAS[ui.estrellas]}</p>
        <div class="vb-etiquetas">${N.ETIQUETAS_CALIFICACION.pasajero.map((t) => `<button type="button" class="vb-chip" aria-pressed="${ui.etiquetas.has(t)}" data-accion="etiqueta" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      </div>
      <footer class="vb-c-barra"><button type="button" class="vb-btn vb-btn-primario vb-btn-xl vb-c-principal" data-accion="enviar-calificacion" ${ui.estrellas ? '' : 'disabled'}>${ic('estrella', 24)} Enviar calificación</button></footer>
    </div>`;
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
  /* GANANCIAS, DOCUMENTOS Y PERFIL                                    */
  /* ================================================================ */
  function mayuscula(t) {
    const x = String(t || '');
    return x.charAt(0).toUpperCase() + x.slice(1);
  }

  function cabSeccion(titulo, sub = '') {
    return `<header class="vb-cab-seccion"><div><h1 tabindex="-1">${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${insignia(36)}</header>`;
  }

  function htmlGanancias() {
    const r = c.estado.resumen;
    const hist = c.historial();
    const pctQR = r.ganado ? Math.round((r.porQR / r.ganado) * 100) : 0;
    return `<div class="vb-desliza vb-c-ganancias">
      ${cabSeccion('Ganancias', mayuscula(N.fechaTexto(Date.now())))}
      <section class="vb-c-total">
        <span>Hoy ganaste</span>
        <b>${N.pesos(r.ganado)}</b>
        <div class="vb-c-total-cifras">
          <div><b>${r.viajes}</b><small>viaje${r.viajes === 1 ? '' : 's'}</small></div>
          <div><b>${r.ganado && r.viajes ? N.pesos(r.ganado / r.viajes) : '—'}</b><small>por viaje</small></div>
          <div><b>${r.promedio ? decimal(r.promedio) : '—'}</b><small>★ promedio</small></div>
          <div><b>${N.kmTexto(r.km || 0)}</b><small>recorridos</small></div>
        </div>
      </section>
      <section class="vb-tarjeta vb-c-metodos">
        <h2>¿Cómo te pagaron?</h2>
        <div class="vb-c-barra-metodos" role="img" aria-label="${pctQR} % por QR y ${100 - pctQR} % en efectivo"><i style="width:${r.ganado ? pctQR : 50}%"></i></div>
        <div class="vb-c-metodos-fila"><span><i class="qr"></i> QR (prueba) <b>${N.pesos(r.porQR)}</b></span><span><i class="ef"></i> Efectivo <b>${N.pesos(r.efectivo)}</b></span></div>
      </section>
      <h2 class="vb-titulo-seccion">Historial</h2>
      ${hist.length ? `<div class="vb-lista-viajes">${hist.map((x) => `<article class="vb-viaje ${x.estado}">
          <header><span class="vb-viaje-fecha">${ic('reloj', 18)} ${esc(mayuscula(N.fechaTexto(x.fin || x.fecha)))} · ${esc(sinCorte(N.horaTexto(x.fin || x.fecha)))}</span>
            <span class="vb-estado-chip ${x.estado}">${x.estado === 'finalizado' ? `${ic('check', 16)} Cobrado` : `${ic('cerrar', 16)} Cancelado`}</span></header>
          <div class="vb-punto-ruta chico"><i class="a">A</i><div><b>${esc(x.origen?.titulo || 'Recogida')}</b></div></div>
          <div class="vb-punto-ruta chico"><i class="b">B</i><div><b>${esc(x.destino?.titulo || 'Destino a convenir')}</b></div></div>
          <footer><span>${esc(x.pasajero || 'Pasajero')}${x.estado === 'finalizado' ? ` · ${x.metodoPago === 'qr' ? 'QR' : 'Efectivo'}` : ` · ${esc(x.motivo || '')}`}${x.calificacionRecibida ? ` · te dio ${'★'.repeat(x.calificacionRecibida)}` : ''}${x.simulado ? ' · <em>prueba</em>' : ''}</span><b>${x.estado === 'finalizado' ? N.pesos(x.valor) : '—'}</b></footer>
        </article>`).join('')}</div>`
        : `<div class="vb-vacio">${taxiLado({ movil: c.perfil?.movil || '023', clase: 'vb-vacio-ilus' })}<h2>Aún no hay viajes</h2><p>Conéctate o toca «Simular solicitud» para probar.</p></div>`}
    </div>`;
  }

  function estadoDocumento(vence) {
    const dias = Math.floor((new Date(`${vence}T23:59:59-05:00`) - Date.now()) / 86400000);
    if (dias < 0) return { clase: 'rojo', texto: 'Vencido', detalle: `Venció hace ${-dias} día${dias === -1 ? '' : 's'}` };
    if (dias <= 92) return { clase: 'amarillo', texto: 'Por vencer', detalle: `Faltan ${dias} día${dias === 1 ? '' : 's'}` };
    return { clase: 'verde', texto: 'Al día', detalle: `Faltan ${dias} días` };
  }

  function htmlDocumentos() {
    const docs = c.perfil?.documentos || {};
    const lista = DOCUMENTOS.map(([id, nombre, sub]) => ({ id, nombre, sub, vence: docs[id]?.vence, ...(docs[id]?.vence ? estadoDocumento(docs[id].vence) : { clase: 'rojo', texto: 'Sin registrar', detalle: '' }) }));
    const malos = lista.filter((d) => d.clase !== 'verde').length;
    return `<div class="vb-desliza vb-c-documentos">
      ${cabSeccion('Documentos', `Móvil ${esc(c.perfil?.movil || '')} · ${esc(c.perfil?.placa || '')}`)}
      <section class="vb-c-doc-resumen ${malos ? 'aviso' : 'ok'}">${ic(malos ? 'alerta' : 'escudo', 30)}<div><b>${malos ? `${malos} documento${malos === 1 ? '' : 's'} requiere${malos === 1 ? '' : 'n'} atención` : 'Todo al día'}</b><span>${malos ? 'Renuévalo antes de la fecha para seguir trabajando.' : 'Tu vehículo puede prestar servicio.'}</span></div></section>
      <div class="vb-c-semaforo-leyenda"><span><i class="verde"></i> Al día</span><span><i class="amarillo"></i> Menos de 3 meses</span><span><i class="rojo"></i> Vencido</span></div>
      ${lista.map((d) => `<article class="vb-documento ${d.clase}">
          <span class="vb-semaforo" aria-hidden="true"><i class="r"></i><i class="a"></i><i class="v"></i></span>
          <div><b>${d.nombre}</b><small>${d.sub}</small><span>Vence: <b>${d.vence ? esc(mayuscula(new Date(`${d.vence}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }))) : '—'}</b></span></div>
          <span class="vb-doc-estado">${d.texto}<small>${d.detalle}</small></span>
        </article>`).join('')}
      <p class="vb-letra-chica centro">Fechas de ejemplo para la demostración.</p>
    </div>`;
  }

  function interruptor(accion, activo, titulo, sub, icono) {
    return `<div class="vb-ajuste"><span class="vb-menu-ic">${ic(icono, 24)}</span><span class="vb-ajuste-txt"><b>${titulo}</b>${sub ? `<small>${sub}</small>` : ''}</span>
      <button type="button" class="vb-interruptor" role="switch" aria-checked="${activo}" aria-label="${titulo}" data-accion="${accion}"><i></i></button></div>`;
  }

  function htmlPerfil() {
    const yo = c.perfil || {};
    const a = N.perfil.ajustes();
    const gps = a.gpsSimulado === true ? 'sim' : a.gpsSimulado === false ? 'real' : 'auto';
    const disenos = [['a', 'Ámbar Urbano', 'Amarillo y directo'], ['b', 'Verde Rosal', 'Este diseño'], ['c', 'Noche Neón', 'Modo oscuro']];
    return `<div class="vb-desliza vb-c-perfil">
      ${cabSeccion('Mi taxi', 'Tus datos en la cooperativa')}
      <article class="vb-c-mi-taxi">
        <div class="vb-c-mi-taxi-ilus">${taxiLado({ movil: yo.movil || '023' })}</div>
        <div class="vb-c-mi-taxi-datos">
          <div class="vb-c-yo grande">${avatarHTML(yo.nombre, 'grande')}<div><b>${esc(yo.nombre || '')}</b><span>${ic('estrella', 16)} ${decimal(yo.calificacion || 5)} · ${numeroMiles(yo.viajes || 0)} viajes · desde ${esc(yo.desde || '')}</span></div></div>
          <dl>
            <div><dt>Móvil</dt><dd class="vb-c-movil-dd">${esc(yo.movil || '')}</dd></div>
            <div><dt>Placa</dt><dd>${placaHTML(yo.placa || '')}</dd></div>
            <div><dt>Vehículo</dt><dd>${esc(yo.vehiculo || '')}</dd></div>
            <div><dt>Color</dt><dd>${esc(yo.color || '')}</dd></div>
          </dl>
        </div>
      </article>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('gps', 22)} Ubicación</h2>
        <div class="vb-segmentos" role="radiogroup" aria-label="GPS">
          <button type="button" role="radio" aria-checked="${gps === 'auto'}" data-accion="gps" data-v="auto">Automático</button>
          <button type="button" role="radio" aria-checked="${gps === 'sim'}" data-accion="gps" data-v="sim">Simulado</button>
          <button type="button" role="radio" aria-checked="${gps === 'real'}" data-accion="gps" data-v="real">Real</button>
        </div>
        <p class="vb-letra-chica">Ahora: ${c.estado.gpsReal ? 'GPS real del celular' : 'GPS simulado en El Rosal (para la demostración)'}.</p>
      </section>
      <section class="vb-bloque"><h2 class="vb-titulo-seccion">${ic('ajustes', 22)} Ajustes</h2>
        ${interruptor('sonido', a.sonido !== false, 'Sonido de solicitudes', 'Timbre cuando llega un servicio.', 'sonido')}
        ${interruptor('envivo', N.enVivoActivo(), 'Conectar con otros celulares', c.estado.conexion === 'en-vivo' ? 'Ahora: en vivo.' : 'Ahora: solo este equipo.', 'antena')}
        <form class="vb-sala" data-form="sala"><label class="vb-campo"><span>Sala de prueba</span><input name="sala" value="${esc(c.estado.sala)}" maxlength="24" autocomplete="off"></label>
          <button type="submit" class="vb-btn vb-btn-borde">Cambiar</button></form>
        <h3 class="vb-c-subtitulo">${ic('paleta', 20)} Diseño de la app</h3>
        <div class="vb-disenos" role="radiogroup" aria-label="Diseño">
          ${disenos.map(([id, t, s]) => `<button type="button" role="radio" aria-checked="${id === diseno}" data-accion="diseno" data-d="${id}" class="d-${id}"><span class="vb-diseno-muestra" aria-hidden="true"></span><b>${t}</b><small>${s}</small></button>`).join('')}
        </div>
      </section>
      <div class="vb-menu">
        <a class="vb-menu-item" href="../app/?d=${diseno}"><span class="vb-menu-ic">${ic('usuario', 24)}</span><span><b>App del pasajero</b><small>Para pedir un taxi</small></span>${ic('flecha', 20)}</a>
        <a class="vb-menu-item" href="tel:+57${N.EMPRESA.telefono}"><span class="vb-menu-ic">${ic('telefono', 24)}</span><span><b>Llamar a la central</b><small>${N.EMPRESA.telefonoVisible}</small></span>${ic('flecha', 20)}</a>
        <button type="button" class="vb-menu-item rojo" data-accion="salir"><span class="vb-menu-ic">${ic('salir', 24)}</span><span><b>Cerrar sesión</b><small>Terminar el turno en este celular</small></span></button>
      </div>
    </div>`;
  }

  /* ================================================================ */
  /* ACCIONES                                                          */
  /* ================================================================ */
  function recargarCon(param, valor) {
    const u = new URL(location.href);
    if (valor == null) u.searchParams.delete(param);
    else u.searchParams.set(param, valor);
    location.replace(u.href);
  }

  const ACCIONES = {
    tab: (b) => {
      ui.pestana = b.dataset.pantalla;
      pintar(true);
    },
    conectar: () => c.conectar(),
    desconectar: () => {
      if (!c.desconectar()) avisos.mostrar({ titulo: 'Termina el servicio primero', tipo: 'info' });
      else avisos.mostrar({ titulo: 'Te desconectaste', cuerpo: 'No recibirás solicitudes hasta que te conectes.', tipo: 'info' });
    },
    'simular-solicitud': (b) => simularSolicitud(b),
    aceptar: (b) => aceptar(b),
    rechazar: (b) => c.rechazar(b.dataset.id),
    centrar: () => {
      ui.arrastre = 0;
      if (c.estado.pos) m?.centrar(c.estado.pos, 16);
    },
    encuadrar: () => {
      ui.arrastre = 0;
      encuadrarViaje();
    },
    principal: () => accionPrincipal(),
    'sin-codigo': () => {
      hoja.abrir({
        titulo: '¿Iniciar sin el código?',
        html: `<p class="vb-sub">Úsalo solo si el pasajero no tiene la app a la mano. Verifica su nombre antes de arrancar.</p>
          <button type="button" class="vb-btn vb-btn-oro vb-btn-xl" data-accion="confirmar-sin-codigo">Sí, iniciar sin código</button>
          <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-sin-codigo': () => {
      hoja.cerrar();
      c.iniciar(null, { sinCodigo: true });
    },
    cancelar: () => abrirCancelar(),
    motivo: (b) => b.parentElement.querySelectorAll('[data-accion="motivo"]').forEach((x) => x.setAttribute('aria-checked', String(x === b))),
    'confirmar-cancelar': () => {
      const elegido = app.querySelector('.vb-capa-hoja [data-accion="motivo"][aria-checked="true"]');
      hoja.cerrar();
      c.cancelar(elegido?.dataset.m || N.MOTIVOS_CANCELACION.conductor[0]);
    },
    efectivo: () => c.confirmarEfectivo(),
    estrella: (b) => marcarEstrellas(Number(b.dataset.n)),
    etiqueta: (b) => {
      const t = b.dataset.t;
      if (ui.etiquetas.has(t)) ui.etiquetas.delete(t);
      else ui.etiquetas.add(t);
      b.setAttribute('aria-pressed', String(ui.etiquetas.has(t)));
    },
    'enviar-calificacion': () => {
      if (!ui.estrellas) return;
      c.calificar(ui.estrellas, { etiquetas: [...ui.etiquetas] });
      avisos.mostrar({ titulo: '¡Servicio terminado!', cuerpo: 'Gracias. Ya puedes recibir el siguiente.', tipo: 'exito' });
    },
    gps: async (b) => {
      const v = { auto: null, sim: true, real: false }[b.dataset.v];
      $$('[data-accion="gps"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      await c.usarGpsSimulado(v);
      pintar(true);
    },
    sonido: (b) => {
      const activo = b.getAttribute('aria-checked') !== 'true';
      N.perfil.guardarAjustes({ sonido: activo });
      b.setAttribute('aria-checked', String(activo));
      if (activo) N.sonar('solicitud');
    },
    envivo: (b) => {
      N.activarEnVivo(b.getAttribute('aria-checked') !== 'true');
      location.reload();
    },
    diseno: (b) => {
      N.perfil.elegirDiseno(b.dataset.d);
      recargarCon('d', b.dataset.d);
    },
    salir: () => {
      if (c.estado.viaje) return avisos.mostrar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo antes de cerrar sesión.', tipo: 'info' });
      hoja.abrir({
        titulo: '¿Cerrar sesión?',
        html: `<p class="vb-sub">Te desconectarás y dejarás de recibir servicios.</p>
          <button type="button" class="vb-btn vb-btn-rojo vb-btn-xl" data-accion="confirmar-salir">Sí, cerrar sesión</button>
          <button type="button" class="vb-btn vb-btn-borde vb-btn-xl" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-salir': () => {
      hoja.cerrar();
      c.desconectar();
      N.perfil.cerrarSesionConductor();
      pintar(true);
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
    if (form.matches('[data-form="ingreso"]')) {
      e.preventDefault();
      ingresar(form);
    } else if (form.matches('[data-form="sala"]')) {
      e.preventDefault();
      N.cambiarSala(String(new FormData(form).get('sala') || ''));
      recargarCon('sala', null);
    }
  });

  raiz.addEventListener('input', (e) => {
    if (e.target.name === 'movil') {
      const limpio = e.target.value.replace(/\D/g, '').slice(0, 3);
      if (limpio !== e.target.value) e.target.value = limpio;
      const texto = limpio ? limpio.padStart(3, '0') : '023';
      vista.querySelectorAll('[data-movil-taxi]').forEach((t) => (t.textContent = texto));
      const error = vista.querySelector('[data-error]');
      if (error) error.textContent = '';
    }
  });

  raiz.addEventListener('pointerdown', () => N.prepararSonido(), { once: true });
  raiz.addEventListener('keydown', () => N.prepararSonido(), { once: true });
  window.addEventListener('resize', () => m?.refrescar());

  /* ---------------- eventos del núcleo ---------------- */
  c.on('cambio', () => pintar());
  c.on('aviso', (a) => avisos.mostrar(a));
  c.on('llegada', (fase) => {
    ui.resaltado = true;
    const boton = vista.querySelector('.vb-c-principal');
    boton?.classList.add('resaltado');
    N.sonar('alerta');
    avisos.mostrar(fase === 'en_viaje'
      ? { titulo: 'Llegaste al destino', cuerpo: 'Toca «Terminar viaje» para cobrar.', tipo: 'alerta' }
      : { titulo: 'Llegaste al punto de recogida', cuerpo: 'Toca «Ya llegué» para avisarle al pasajero.', tipo: 'alerta' });
  });
  c.on('vencida', () => avisos.mostrar({ titulo: 'La solicitud venció', cuerpo: 'No alcanzaste a responder a tiempo.', tipo: 'info' }));

  pintar(true);
}
