// App del conductor — diseño A «Ámbar Urbano».
// Barra superior oscura, interruptor grande de turno, solicitud entrante como
// hoja amarilla con cuenta regresiva y «deslizar para aceptar», barra de pasos
// del servicio y cobro con QR grande. La lógica vive en el núcleo (N).
import {
  el, esc, $, $$, icono, avatar, placa, chipPrueba, franjaCuadros, Hoja, crearAvisos, modal, elegirOpcion,
  abrirMenu, estrellas, casillasCodigo, deslizador, celularTexto, decimal, ponerTexto, capaRuta, puntoVisible,
  panelEscritorio, nombreCorto, avisoDemo,
} from './ui.js';
import * as EM from './empresa.js';
import { taxiLateral } from './ilustraciones.js';
import { abrirGanancias, abrirHistorial, abrirDocumentos, abrirMiTaxi, abrirAjustesConductor, abrirAvisosConductor } from './conductor-secciones.js';

// Foto de portada del ingreso (generada para la web, sin marcas: ver img/web/creditos.json).
const FOTO_CONDUCTOR = new URL('./img/conductor.jpg', import.meta.url).href;

const PASOS = ['Recoger', 'Llegué', 'Viaje', 'Cobrar'];
const PASO_DE_FASE = { confirmando: 0, hacia_origen: 0, en_origen: 1, en_viaje: 2, cobrando: 3, calificar: 3 };

export async function montar(raiz, { N, diseno = 'a', vitrina = false }) {
  raiz.innerHTML = '';
  raiz.classList.add('a-raiz', 'a-raiz-conductor');
  if (EM.FICHA_EQUIVOCADA) {
    EM.pantallaSinFicha(raiz);
    return;
  }
  EM.aplicarColores();
  EM.aplicarFoto(raiz, { conductor: true });
  EM.marcarNoIndexar();
  if (!vitrina) {
    raiz.append(panelEscritorio({
      titulo: `La app de los <em>conductores</em> de ${esc(EM.NOMBRE)}.`,
      texto: 'Recibe servicios cerca de ti, navega hasta el pasajero, verifica su código y cobra con QR de prueba o en efectivo.',
      puntos: ['Conéctate y desconéctate con un toque', 'Solicitudes con cuenta regresiva', 'Código de abordaje para viajar seguros', 'Ganancias del día y documentos al día'],
      // El QR abre la app de conductores de esta cooperativa con el mismo diseño;
      // dentro de TaxiCun, TaxiCun con esta cooperativa (?e=).
      url: N.urlApp('conductor', { d: diseno }),
    }));
  }

  const app = el(`<div class="a-app a-conductor" data-vista="carga">
    <header class="a-cbarra">
      <button class="a-cbarra-menu" type="button" data-menu aria-label="Abrir menú"><span data-avatar>${avatar('')}</span><span class="a-barra-menu-ico">${icono('menu', { tam: 13, grosor: 3 })}</span></button>
      <div class="a-cbarra-txt"><strong data-movil>Conductor</strong><small data-nombre>${esc(EM.NOMBRE)}</small></div>
      <span class="a-chip-gps" data-gps title="Fuente de la ubicación"><span class="a-led"></span><span data-gps-txt>GPS…</span></span>
      <button class="a-icono-btn a-cbarra-campana" type="button" data-campana aria-label="Avisos">${icono('campana')}<span class="a-insignia" data-insignia hidden></span></button>
    </header>
    <div class="a-chip-red a-chip-red-clara${EM.ES_PROPUESTA ? ' a-chip-red-demo' : ''}" data-conexion><span class="a-led"></span><span data-conexion-txt>Solo este equipo</span><b>MODO PRUEBA</b>${avisoDemo()}</div>
    <button class="a-flotante a-btn-ubicacion" type="button" data-centrar aria-label="Centrar el mapa en mi taxi">${icono('mira')}</button>
    <button class="a-fab-simular" type="button" data-simular hidden>${icono('chispa', { tam: 20 })}<span>Simular solicitud (demo)</span></button>
  </div>`);
  raiz.append(app);

  const barra = $(app, '.a-cbarra');
  const arriba = () => barra.offsetTop + barra.offsetHeight;
  let sinLeer = 0;
  const avisos = crearAvisos(app, {
    alAgregar: () => {
      sinLeer += 1;
      pintarCampana();
    },
  });
  const hoja = new Hoja(app, {
    etiqueta: 'Panel del servicio',
    tope: () => arriba() + 10,
    alCambiarAlto: () => {
      app.dataset.hoja = hoja?.estado || '';
    },
  });
  // El mapa va de último en el DOM (orden del tabulador) y sus marcadores no se enfocan.
  const divMapa = el('<div class="a-mapa" role="region" aria-label="Mapa del conductor"></div>');
  app.append(divMapa);
  const L = await N.cargarLeaflet();
  L.Marker.prototype.options.keyboard = false;
  // Las capas de CARTO del núcleo hoy devuelven «API KEY REQUIRED»: se usa OpenStreetMap.
  const m = await N.crearMapa(divMapa, { capa: 'claro', controles: false, zoom: 16, colorOrigen: '#15803D', colorDestino: '#121212', colorRuta: '#121212' });
  const ruta = capaRuta(m, { color: '#121212', grosor: 6 });
  let pulso = null;

  let c = null;
  const ui = {
    vista: null,
    solicitudVista: null,
    relojSolicitud: null,
    llegoEn: null,
    ultimoEncuadre: 0,
    rutaRef: null,
    centrado: false,
    limpiezas: [],
    calif: null,
    etiquetas: new Set(),
    ultimaPos: null,
  };

  /* ---------------- utilidades de mapa ---------------- */
  function encuadrar(puntos, { maxZoom = 17 } = {}) {
    const validos = puntos.filter(Boolean).map((x) => [x.lat, x.lng]);
    if (!validos.length) return;
    ui.ultimoEncuadre = Date.now();
    if (validos.length === 1) return centrarVisible({ lat: validos[0][0], lng: validos[0][1] }, Math.min(Math.max(m.mapa.getZoom(), 15), maxZoom));
    m.mapa.fitBounds(m.L.latLngBounds(validos), { paddingTopLeft: [46, arriba() + 50], paddingBottomRight: [46, hoja.alto + 40], maxZoom, animate: true });
  }
  function centrarVisible(punto, zoom, animar = true) {
    if (!punto) return;
    const z = zoom ?? m.mapa.getZoom();
    const t = m.mapa.getSize();
    const y = (arriba() + app.clientHeight - hoja.alto) / 2;
    const px = m.mapa.project([punto.lat, punto.lng], z).subtract(m.L.point(0, y - t.y / 2));
    m.mapa.setView(m.mapa.unproject(px, z), z, { animate: animar });
  }
  function ponerPulso(pos) {
    if (!pos) return;
    if (!pulso) {
      pulso = m.L.marker([pos.lat, pos.lng], {
        icon: m.L.divIcon({ className: 'a-radar a-radar-conductor', html: '<span></span><span></span>', iconSize: [200, 200], iconAnchor: [100, 100] }),
        interactive: false,
        keyboard: false,
        zIndexOffset: -200,
      }).addTo(m.mapa);
    } else pulso.setLatLng([pos.lat, pos.lng]);
  }
  function quitarPulso() {
    pulso?.remove();
    pulso = null;
  }

  /* ---------------- barra, menú y avisos ---------------- */
  function pintarCampana() {
    const b = $(app, '[data-insignia]');
    b.hidden = sinLeer === 0;
    b.textContent = sinLeer > 9 ? '9+' : String(sinLeer);
  }
  $(app, '[data-campana]').addEventListener('click', () => {
    sinLeer = 0;
    pintarCampana();
    abrirAvisosConductor(ctx());
  });
  $(app, '[data-menu]').addEventListener('click', abrirMenuConductor);
  $(app, '[data-centrar]').addEventListener('click', () => {
    const e = c?.estado;
    if (!e?.pos) return;
    if (e.viaje) encuadrar([e.pos, e.viaje.fase === 'en_viaje' ? e.viaje.destino : e.viaje.origen]);
    else centrarVisible(e.pos, 16);
  });
  $(app, '[data-simular]').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    if (!c || b.classList.contains('a-ocupado')) return;
    b.classList.add('a-ocupado');
    ponerTexto(b, 'span', 'Buscando un pasajero de prueba…');
    try {
      await c.simularSolicitud();
    } catch (err) {
      avisos.mostrar({ titulo: 'No se pudo simular', cuerpo: err.message, tipo: 'error' });
    }
    b.classList.remove('a-ocupado');
    ponerTexto(b, 'span', 'Simular solicitud (demo)');
  });

  function pintarBarra() {
    const yo = N.perfil.conductor();
    $(app, '[data-avatar]').innerHTML = avatar(yo?.nombre || '');
    ponerTexto(app, '[data-movil]', yo ? `Móvil ${yo.movil}` : 'Conductor');
    ponerTexto(app, '[data-nombre]', yo ? [yo.nombre, yo.placa].filter(Boolean).join(' · ') || EM.NOMBRE : EM.NOMBRE);
  }

  function abrirMenuConductor() {
    const yo = N.perfil.conductor();
    if (!yo) return;
    const r = N.perfil.resumenDelDia();
    abrirMenu(app, {
      clase: 'a-menu-oscuro',
      cabeza: `${franjaCuadros()}
        <div class="a-menu-perfil">${avatar(yo.nombre, 'a-avatar-grande')}
          <div><strong>${esc(yo.nombre)}</strong><span>Móvil ${esc(yo.movil)} · ${esc(yo.placa)}</span>
          <span class="a-menu-cal">${icono('estrella', { tam: 14 })} ${decimal(yo.calificacion)} · ${Number(yo.viajes || 0).toLocaleString('es-CO')} viajes</span></div>
        </div>`,
      items: [
        { icono: 'grafica', texto: 'Ganancias', detalle: `Hoy: ${N.pesos(r.ganado)} en ${r.viajes} ${r.viajes === 1 ? 'viaje' : 'viajes'}`, accion: () => abrirGanancias(ctx()) },
        { icono: 'reloj', texto: 'Historial', detalle: 'Tus servicios', accion: () => abrirHistorial(ctx()) },
        { icono: 'documento', texto: 'Documentos', detalle: 'SOAT, técnico-mecánica, licencia', accion: () => abrirDocumentos(ctx()) },
        { icono: 'auto', texto: 'Mi taxi', detalle: `${yo.vehiculo} · ${yo.placa}`, accion: () => abrirMiTaxi(ctx()) },
        { icono: 'ajustes', texto: 'Ajustes', detalle: 'GPS, sonido, sala, diseño', accion: () => abrirAjustesConductor(ctx()) },
        { separador: true },
        EM.EN_TAXICUN && { icono: 'pin', texto: 'Cambiar de municipio', detalle: `Ahora: ${EM.PUEBLO} · ${EM.NOMBRE}`, accion: cambiarMunicipio },
        { icono: 'usuario', texto: 'App del pasajero', detalle: 'Abrir la app para pedir taxi', href: EM.urlOtraApp('pasajero', diseno), clase: 'a-menu-marca' },
        { icono: 'salir', texto: 'Cerrar sesión', accion: cerrarSesion, clase: 'a-menu-peligro' },
      ].filter(Boolean),
      pie: `<div class="a-menu-pie-marca">${EM.marcaIcono(30)}<div><strong>${esc(EM.NOMBRE)} · Conductores</strong>${EM.LEMA ? `<small>${esc(EM.LEMA)}</small>` : ''}</div></div>
        ${EM.EN_TAXICUN ? `<div class="a-menu-pie-tc">${EM.iconoApp(18)}<span>${esc(EM.TEXTO_DESARROLLO)}</span></div>` : ''}
        <div class="a-menu-pie-estado">${chipPrueba('MODO PRUEBA')}${avisoDemo('a-chip-demo a-chip-demo-claro')}<span><span class="a-led ${c?.estado.conexion === 'en-vivo' ? 'a-led-vivo' : ''}"></span>${c?.estado.conexion === 'en-vivo' ? 'En vivo' : 'Solo este equipo'} · sala «${esc(c?.estado.sala || N.salaActual())}»</span></div>`,
    });
  }

  async function cerrarSesion() {
    if (c?.estado.viaje) {
      avisos.mostrar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo o cancélalo antes de cerrar sesión.', tipo: 'alerta' });
      return;
    }
    const ok = await modal(app, {
      titulo: '¿Cerrar sesión?',
      texto: 'Te desconectamos y dejas de recibir solicitudes.',
      acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cerrar sesión', valor: true, clase: 'a-btn-peligro' }],
    });
    if (!ok) return;
    c?.desconectar();
    N.perfil.cerrarSesionConductor();
    pintarBarra();
    mostrarIngreso();
  }

  // Solo dentro de TaxiCun: vuelve a la lista de municipios (no con un servicio en curso).
  function cambiarMunicipio() {
    if (c?.estado.viaje) {
      avisos.mostrar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo o cancélalo antes de cambiar de municipio.', tipo: 'alerta' });
      return;
    }
    c?.desconectar();
    location.href = EM.urlCambiarMunicipio('conductor');
  }

  function ctx() {
    return { N, app, c, avisos, diseno, cambiarMunicipio };
  }

  /* ---------------- ingreso ---------------- */
  function mostrarIngreso() {
    const capa = el(`<div class="a-ingreso" role="dialog" aria-modal="true" aria-label="Ingreso de conductores">
      <div class="a-ingreso-arte a-ingreso-con-foto">
        ${franjaCuadros()}
        <div class="a-ingreso-taxi" aria-hidden="true">${taxiLateral({ ancho: 270, movil: EM.MOVIL_DEMO })}</div>
        <div class="a-ingreso-carretera" aria-hidden="true"></div>
        <!-- Portada: foto de un conductor (si no carga, queda el taxi dibujado). -->
        <img class="a-ingreso-foto" src="${FOTO_CONDUCTOR}" alt="" decoding="async">
        <span class="a-ingreso-chip" aria-hidden="true">${icono('auto', { tam: 20 })} Móvil <b>${esc(EM.MOVIL_DEMO)}</b></span>
        <div class="a-marca a-marca-clara${EM.EN_TAXICUN ? ' a-marca-tc' : ''}">${EM.encabezadoMarca({ tam: 46, detalle: EM.EN_TAXICUN ? `App del conductor · ${EM.PUEBLO}` : 'App del conductor' })}</div>
      </div>
      <form class="a-ingreso-form" novalidate>
        <h1>Empieza tu turno</h1>
        <p class="a-sub">Ingresa con tu número de móvil y tu PIN de 4 dígitos.</p>
        <label class="a-campo">
          <span>${EM.MOVIL_MAXIMO < 999 ? `Número de móvil (001 a ${String(EM.MOVIL_MAXIMO).padStart(3, '0')})` : 'Número de móvil (3 dígitos)'}</span>
          <span class="a-campo-tel"><span class="a-prefijo">MÓVIL</span><input name="movil" inputmode="numeric" maxlength="3" placeholder="${esc(EM.MOVIL_DEMO)}" autocomplete="username" required></span>
        </label>
        <p class="a-hola" data-hola aria-live="polite"></p>
        <div class="a-campo"><span id="a-pin-txt">PIN de 4 dígitos</span><div data-pin></div></div>
        <div class="a-pista">${icono('info', { tam: 18 })}<span>Demo: móvil <b data-movil-demo>${esc(EM.MOVIL_DEMO)}</b>, PIN <b>1234</b> (cualquier PIN de 4 dígitos sirve).</span></div>
        <p class="a-error" data-error role="alert"></p>
        <button type="submit" class="a-btn a-btn-primario a-btn-grande">${icono('volante', { tam: 20 })}<span>Ingresar</span></button>
        <a class="a-btn-texto" href="${esc(EM.urlOtraApp('pasajero', diseno))}" data-ir-pasajero>¿Eres pasajero? Abre la app para pedir taxi</a>
        ${EM.EN_TAXICUN ? `<button type="button" class="a-btn-texto a-tc-cambiar" data-cambiar-municipio>${icono('pin', { tam: 16 })}<span>Cambiar de municipio</span></button>` : ''}
      </form>
    </div>`);
    app.append(capa);
    const foto = capa.querySelector('.a-ingreso-foto');
    const fotoLista = () => capa.querySelector('.a-ingreso-arte').classList.add('a-foto-lista');
    if (foto.complete && foto.naturalWidth) fotoLista();
    else foto.addEventListener('load', fotoLista, { once: true });
    foto.addEventListener('error', () => foto.remove(), { once: true });
    capa.querySelector('[data-cambiar-municipio]')?.addEventListener('click', cambiarMunicipio);
    const f = $(capa, 'form');
    const pin = casillasCodigo({ etiqueta: 'PIN', secreto: true });
    $(capa, '[data-pin]').append(pin.el);
    const hola = $(capa, '[data-hola]');
    f.movil.addEventListener('input', () => {
      f.movil.value = f.movil.value.replace(/\D/g, '').slice(0, 3);
      const n = Number(f.movil.value);
      const base = N.CONDUCTORES_DEMO?.find((x) => Number(x.movil) === n);
      hola.textContent = base ? `Hola, ${base.nombre} · ${base.placa}` : '';
      if (f.movil.value.length === 3) pin.enfocar();
    });
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const error = $(capa, '[data-error]');
      const n = Number(f.movil.value);
      if (!f.movil.value || !Number.isInteger(n) || n < 1 || n > EM.MOVIL_MAXIMO) {
        error.textContent = `Escribe un número de móvil entre 001 y ${String(EM.MOVIL_MAXIMO).padStart(3, '0')}.`;
        f.movil.classList.add('a-invalido');
        f.movil.focus();
        return;
      }
      if (!/^\d{4}$/.test(pin.valor())) {
        error.textContent = 'Escribe tu PIN de 4 dígitos.';
        pin.error();
        pin.enfocar();
        return;
      }
      N.perfil.ingresarConductor({ movil: String(n).padStart(3, '0'), pin: pin.valor() });
      capa.classList.add('a-sale');
      setTimeout(() => capa.remove(), 320);
      pintarBarra();
      const yo = N.perfil.conductor();
      avisos.mostrar({ titulo: `¡Buen turno, ${nombreCorto(yo.nombre)}!`, cuerpo: 'Conéctate para empezar a recibir servicios.', tipo: 'exito' });
      ui.vista = null;
      pintar();
    });
    // Foco inicial en el móvil, salvo que la persona ya esté escribiendo (si no, el
    // foco tardío le quitaría el PIN a quien escribe rápido).
    setTimeout(() => {
      if (!capa.contains(document.activeElement)) f.movil.focus({ preventScroll: true });
    }, 300);
  }

  /* ---------------- piezas ---------------- */
  function barraPasos(fase) {
    const actual = PASO_DE_FASE[fase] ?? 0;
    return `<ol class="a-pasos-barra" aria-label="Progreso del servicio">${PASOS.map((n, i) => `<li class="${i < actual ? 'a-hecho' : ''} ${i === actual ? 'a-actual' : ''}" ${i === actual ? 'aria-current="step"' : ''}><span>${i < actual ? icono('check', { tam: 14, grosor: 3 }) : i + 1}</span>${n}</li>`).join('')}</ol>`;
  }
  function metodoTexto(m) {
    return m === 'qr' ? 'QR (prueba)' : 'Efectivo';
  }
  function navegar(p) {
    if (!p) return '';
    return `<div class="a-nav">
      <a class="a-nav-btn" href="${esc(N.enlaceNavegacion(p, 'google'))}" target="_blank" rel="noopener">${icono('navegar', { tam: 18 })}<span>Google Maps</span></a>
      <a class="a-nav-btn" href="${esc(N.enlaceNavegacion(p, 'waze'))}" target="_blank" rel="noopener">${icono('navegar', { tam: 18 })}<span>Waze</span></a>
    </div>`;
  }
  function contacto(v) {
    const cel = v.pasajero?.celular;
    if (!cel) return '';
    return `<div class="a-nav a-nav-contacto">
      <a class="a-nav-btn" href="tel:${esc(cel)}">${icono('telefono', { tam: 18 })}<span>Llamar</span></a>
      <a class="a-nav-btn" href="${esc(N.enlaceWhatsApp(cel, `Hola ${nombreCorto(v.pasajero.nombre)}, soy el conductor del móvil ${N.perfil.conductor()?.movil || ''} de ${EM.NOMBRE}.`))}" target="_blank" rel="noopener">${icono('chat', { tam: 18 })}<span>WhatsApp</span></a>
    </div>`;
  }
  function tarjetaPasajero(v) {
    return `<div class="a-pasajero-fila">
      ${avatar(v.pasajero?.nombre || 'Pasajero', 'a-avatar-tinta')}
      <span><strong>${esc(v.pasajero?.nombre || 'Pasajero')}</strong><small>${icono('estrella', { tam: 12 })} ${decimal(v.pasajero?.calificacion || 5)} · ${metodoTexto(v.metodoPago)}${v.simulado ? ' · demo' : ''}</small></span>
      <b>${N.pesos(v.tarifa)}</b>
    </div>`;
  }
  async function cancelarServicio() {
    const motivo = await elegirOpcion(app, { titulo: '¿Por qué cancelas el servicio?', texto: 'Le avisamos al pasajero.', opciones: N.MOTIVOS_CANCELACION.conductor, confirmar: 'Cancelar servicio', clasePeligro: true });
    if (motivo) c.cancelar(motivo);
  }

  /* ---------------- solicitud entrante ---------------- */
  function pintarSolicitud(e) {
    const s = !e.viaje && e.solicitudes.length ? e.solicitudes[0] : null;
    if (!s) {
      if (ui.solicitudVista) {
        const vieja = $(app, '.a-solicitud');
        clearInterval(ui.relojSolicitud);
        ui.solicitudVista = null;
        app.classList.remove('a-con-solicitud');
        vieja?.classList.remove('a-abierta');
        setTimeout(() => vieja?.remove(), 320);
        m.quitarOrigen();
        if (!e.viaje) m.quitarDestino();
      }
      return;
    }
    if (ui.solicitudVista === s.viajeId) {
      ponerTexto(app, '[data-en-espera]', e.solicitudes.length > 1 ? `+${e.solicitudes.length - 1} en espera` : '');
      return;
    }
    $(app, '.a-solicitud')?.remove();
    clearInterval(ui.relojSolicitud);
    ui.solicitudVista = s.viajeId;
    app.classList.add('a-con-solicitud');
    const total = N.TIEMPOS?.aceptar || 25000;
    const circ = 2 * Math.PI * 34;
    const minHasta = Math.max(1, Math.round(((s.distanciaAMi * 1.3) / 25) * 60));
    const capa = el(`<section class="a-solicitud" role="alertdialog" aria-modal="true" aria-labelledby="a-sol-titulo" aria-describedby="a-sol-desc">
      ${franjaCuadros()}
      <div class="a-sol-cuerpo">
        <div class="a-sol-cabeza">
          <div class="a-cuenta" aria-hidden="true">
            <svg viewBox="0 0 80 80" width="84" height="84"><circle class="a-cuenta-fondo" cx="40" cy="40" r="34"/><circle class="a-cuenta-valor" cx="40" cy="40" r="34" style="stroke-dasharray:${circ}" data-anillo/></svg>
            <span><b data-seg>${Math.ceil((s.expira - Date.now()) / 1000)}</b><small>seg</small></span>
          </div>
          <div class="a-sol-quien">
            <small>${icono('campana', { tam: 14 })} Nueva solicitud${s.simulada ? ' · demo' : ''}</small>
            <h2 id="a-sol-titulo">${esc(s.pasajero?.nombre || 'Pasajero')}</h2>
            <span>${icono('estrella', { tam: 14 })} ${decimal(s.pasajero?.calificacion || 5)} · pasajero verificado</span>
          </div>
          <span class="a-en-espera" data-en-espera></span>
        </div>
        <div class="a-sol-tarifa" id="a-sol-desc">
          <span><small>Tarifa estimada</small><strong>${N.pesos(s.tarifa)}</strong></span>
          <span class="a-chip-metodo">${icono(s.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 16 })} ${metodoTexto(s.metodoPago)}</span>
        </div>
        <div class="a-sol-datos">
          <span><strong>${esc(N.kmTexto(s.distanciaAMi))}</strong><small>hasta el pasajero · ${minHasta} min</small></span>
          <span><strong>${s.km ? esc(N.kmTexto(s.km)) : '—'}</strong><small>de viaje${s.min ? ` · ${esc(N.minutosTexto(s.min))}` : ''}</small></span>
        </div>
        <div class="a-sol-ruta">
          <div><span class="a-punto a-punto-verde"></span><span><small>Recoger en</small><strong>${esc(s.origen?.titulo || 'Punto en el mapa')}</strong></span></div>
          <div><span class="a-punto a-punto-negro"></span><span><small>Destino</small><strong>${esc(s.destino?.titulo || 'A convenir con el pasajero')}</strong></span></div>
        </div>
        ${s.nota ? `<p class="a-sol-nota">${icono('mensaje', { tam: 16 })}<span>«${esc(s.nota)}»</span></p>` : ''}
      </div>
      <div class="a-sol-acciones">
        <div data-deslizar></div>
        <div class="a-sol-botones">
          <button type="button" class="a-btn a-btn-suave" data-rechazar>${icono('cerrar', { tam: 18 })} Rechazar</button>
          <button type="button" class="a-btn a-btn-tinta" data-aceptar>${icono('check', { tam: 18 })} Aceptar</button>
        </div>
      </div>
    </section>`);
    app.append(capa);
    const aceptar = async () => {
      if (capa.dataset.ocupado) return;
      capa.dataset.ocupado = '1';
      N.prepararSonido();
      const ok = await c.aceptar(s.viajeId);
      if (!ok) avisos.mostrar({ titulo: 'Ya no está disponible', cuerpo: 'Otro conductor tomó el servicio o la solicitud venció.', tipo: 'info' });
    };
    const d = deslizador({ texto: 'Desliza para aceptar', alConfirmar: aceptar });
    $(capa, '[data-deslizar]').append(d.el);
    $(capa, '[data-aceptar]').addEventListener('click', aceptar);
    $(capa, '[data-rechazar]').addEventListener('click', () => c.rechazar(s.viajeId));
    const anillo = $(capa, '[data-anillo]');
    const seg = $(capa, '[data-seg]');
    const tic = () => {
      const resta = Math.max(0, s.expira - Date.now());
      anillo.style.strokeDashoffset = String(circ * (1 - resta / total));
      ponerTexto(capa, seg, String(Math.ceil(resta / 1000)));
      capa.classList.toggle('a-urgente', resta < 8000);
    };
    tic();
    ui.relojSolicitud = setInterval(tic, 200);
    m.ponerOrigen(s.origen);
    if (s.destino) m.ponerDestino(s.destino);
    requestAnimationFrame(() => {
      capa.classList.add('a-abierta');
      $(capa, '[data-aceptar]').focus({ preventScroll: true });
      // El mapa queda arriba, en la franja que deja la hoja amarilla.
      const alto = capa.offsetHeight;
      const yo = e.pos || N.CENTRO;
      m.mapa.fitBounds(m.L.latLngBounds([[yo.lat, yo.lng], [s.origen.lat, s.origen.lng]]), { paddingTopLeft: [40, arriba() + 46], paddingBottomRight: [40, alto + 16], maxZoom: 16 });
    });
  }

  /* ---------------- vistas del panel ---------------- */
  const VISTAS = {
    carga: {
      html: () => `<div class="a-cargando"><span class="a-girador"></span><div><strong>Ubicando tu taxi…</strong><small>Buscando la señal del GPS</small></div></div><div class="a-esqueleto" style="height:72px"></div>`,
    },

    libre: {
      altura: 'media',
      html(e) {
        const yo = N.perfil.conductor();
        const docs = Object.values(yo?.documentos || {});
        const alDia = docs.every((d) => new Date(d.vence) > Date.now());
        return `
          <button type="button" class="a-pildora" role="switch" aria-checked="${e.conectado}" data-conectar aria-label="Turno: ${e.conectado ? 'conectado' : 'desconectado'}">
            <span class="a-pildora-perilla">${icono('potencia', { tam: 26, grosor: 2.6 })}</span>
            <span class="a-pildora-txt"><strong data-pildora-titulo>${e.conectado ? 'Conectado' : 'Desconectado'}</strong><small data-pildora-sub>${e.conectado ? 'Recibiendo solicitudes cercanas' : 'Toca para empezar a recibir servicios'}</small></span>
          </button>
          <div class="a-hoy">
            <div class="a-hoy-total"><small>Ganado hoy</small><strong data-ganado>${N.pesos(e.resumen.ganado)}</strong></div>
            <div class="a-kpis">
              <span><strong data-viajes>${e.resumen.viajes}</strong><small>${e.resumen.viajes === 1 ? 'viaje' : 'viajes'}</small></span>
              <span><strong data-prom>${e.resumen.promedio ? decimal(e.resumen.promedio) : '—'}</strong><small>calificación</small></span>
              <span><strong data-km>${esc(N.kmTexto(e.resumen.km || 0))}</strong><small>recorridos</small></span>
            </div>
          </div>
          <div data-corte></div>
          <button type="button" class="a-tarjeta-taxi" data-mi-taxi>
            ${placa(yo?.placa || '')}
            <span><strong>Móvil ${esc(yo?.movil || '')} · ${esc(yo?.vehiculo || '')}</strong><small class="${alDia ? 'a-ok-txt' : 'a-mal-txt'}">${icono(alDia ? 'check' : 'alerta', { tam: 14 })} ${alDia ? 'Documentos al día' : 'Revisa tus documentos'}</small></span>
            ${icono('adelante', { tam: 18 })}
          </button>
          <div class="a-atajos-c">
            <button type="button" class="a-atajo-c" data-ganancias>${icono('grafica', { tam: 20 })}<span>Ganancias</span></button>
            <button type="button" class="a-atajo-c" data-historial>${icono('reloj', { tam: 20 })}<span>Historial</span></button>
            <button type="button" class="a-atajo-c" data-documentos>${icono('documento', { tam: 20 })}<span>Documentos</span></button>
          </div>
          <p class="a-ayuda-txt">${icono('info', { tam: 14 })} Con el botón «Simular solicitud» te llega un pasajero de prueba para enseñar la app.</p>`;
      },
      montar(cont) {
        cont.addEventListener('click', (ev) => {
          const t = ev.target;
          if (t.closest('[data-conectar]')) {
            N.prepararSonido();
            if (c.estado.conectado) c.desconectar();
            else c.conectar();
          }
          if (t.closest('[data-mi-taxi]')) abrirMiTaxi(ctx());
          if (t.closest('[data-ganancias]')) abrirGanancias(ctx());
          if (t.closest('[data-historial]')) abrirHistorial(ctx());
          if (t.closest('[data-documentos]')) abrirDocumentos(ctx());
        });
      },
      entrar(e) {
        ruta.quitar();
        ui.rutaRef = null;
        m.quitarOrigen();
        m.quitarDestino();
        if (e.pos) centrarVisible(e.pos, 16, ui.centrado);
        ui.centrado = true;
      },
      actualizar(e) {
        const cnt = hoja.contenido;
        const b = $(cnt, '[data-conectar]');
        if (b && b.getAttribute('aria-checked') !== String(e.conectado)) {
          b.setAttribute('aria-checked', String(e.conectado));
          b.setAttribute('aria-label', `Turno: ${e.conectado ? 'conectado' : 'desconectado'}`);
          ponerTexto(cnt, '[data-pildora-titulo]', e.conectado ? 'Conectado' : 'Desconectado');
          ponerTexto(cnt, '[data-pildora-sub]', e.conectado ? 'Recibiendo solicitudes cercanas' : 'Toca para empezar a recibir servicios');
        }
        ponerTexto(cnt, '[data-ganado]', N.pesos(e.resumen.ganado));
        ponerTexto(cnt, '[data-viajes]', String(e.resumen.viajes));
        ponerTexto(cnt, '[data-prom]', e.resumen.promedio ? decimal(e.resumen.promedio) : '—');
        ponerTexto(cnt, '[data-km]', N.kmTexto(e.resumen.km || 0));
      },
    },

    confirmando: {
      altura: 'media',
      html: (e) => `${barraPasos('confirmando')}
        <div class="a-cargando"><span class="a-girador"></span><div><strong>Esperando al pasajero</strong><small>Confirmando que el servicio es tuyo…</small></div></div>
        ${tarjetaPasajero(e.viaje)}`,
      entrar(e) {
        m.ponerOrigen(e.viaje.origen);
        encuadrar([e.pos, e.viaje.origen]);
      },
    },

    hacia_origen: {
      altura: 'media',
      html(e) {
        const v = e.viaje;
        return `${barraPasos('hacia_origen')}
          <div class="a-estado-viaje" data-arrastre>
            <span class="a-eta"><strong data-eta-num>—</strong><small>min</small></span>
            <span class="a-estado-txt"><h2>Recoge a ${esc(nombreCorto(v.pasajero?.nombre || 'tu pasajero'))}</h2><small data-estado-sub>Calculando la ruta…</small></span>
          </div>
          <div class="a-llegaste" data-llegaste hidden>${icono('pin', { tam: 18 })}<span>Estás en el punto de recogida. Toca <b>Llegué</b> para avisarle.</span></div>
          <div class="a-dir">${icono('pin', { tam: 20 })}<span><small>Punto de recogida</small><strong>${esc(v.origen?.titulo || 'Punto en el mapa')}</strong>${v.origen?.detalle ? `<em>${esc(v.origen.detalle)}</em>` : ''}</span></div>
          ${navegar(v.origen)}
          <div class="a-msj-pasajero" data-msj hidden></div>
          <div data-corte></div>
          ${v.nota ? `<p class="a-sol-nota">${icono('mensaje', { tam: 16 })}<span>«${esc(v.nota)}»</span></p>` : ''}
          ${tarjetaPasajero(v)}
          ${contacto(v)}
          <button type="button" class="a-btn-texto a-texto-peligro" data-cancelar>Cancelar servicio</button>`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande" data-llegue>${icono('check', { tam: 22, grosor: 2.6 })}<span>Llegué</span></button>`,
      montar(cont, pie) {
        cont.addEventListener('click', (ev) => {
          if (ev.target.closest('[data-cancelar]')) cancelarServicio();
        });
        $(pie, '[data-llegue]').addEventListener('click', () => c.llegue());
      },
      entrar(e) {
        quitarPulso();
        m.ponerOrigen(e.viaje.origen);
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
        encuadrar([e.pos, e.viaje.origen]);
      },
      actualizar(e) {
        const cnt = hoja.contenido;
        if (e.etaMin != null && ui.llegoEn !== 'hacia_origen') {
          ponerTexto(cnt, '[data-eta-num]', String(Math.max(1, Math.round(e.etaMin))));
          ponerTexto(cnt, '[data-estado-sub]', `${e.kmRestantes != null ? `A ${N.kmTexto(e.kmRestantes)} · ` : ''}llegas a las ${N.horaTexto(Date.now() + e.etaMin * 60000)}`);
        }
        const llego = ui.llegoEn === 'hacia_origen';
        $(hoja.pie, '[data-llegue]')?.classList.toggle('a-resaltar', llego);
        const aviso = $(cnt, '[data-llegaste]');
        if (aviso) aviso.hidden = !llego;
        if (llego) marcarLlegada(cnt, 'Ya llegaste al punto');
        pintarMensaje(e);
      },
    },

    en_origen: {
      altura: 'media',
      maxMedia: 0.82,
      html(e) {
        const v = e.viaje;
        return `${barraPasos('en_origen')}
          <div class="a-codigo-c">
            <h2>Pide el código de abordaje</h2>
            <p>${esc(nombreCorto(v.pasajero?.nombre || 'El pasajero'))} te dice los 4 dígitos que ve en su app.</p>
            ${v.codigoSimulado ? `<div class="a-pista">${icono('info', { tam: 18 })}<span>Pista de la demo: el código del pasajero de prueba es <b data-pista>${esc(v.codigoSimulado)}</b></span></div>` : ''}
            <div data-casillas></div>
            <p class="a-error" data-error role="alert"></p>
          </div>
          <div class="a-msj-pasajero" data-msj hidden></div>
          <div data-corte></div>
          ${tarjetaPasajero(v)}
          ${contacto(v)}
          <div class="a-fila-botones">
            <button type="button" class="a-btn-texto" data-sin-codigo>Iniciar sin código</button>
            <button type="button" class="a-btn-texto a-texto-peligro" data-cancelar>Cancelar servicio</button>
          </div>`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande" data-iniciar disabled>${icono('volante', { tam: 22 })}<span>Iniciar viaje</span></button>`,
      montar(cont, pie) {
        const btn = $(pie, '[data-iniciar]');
        const error = $(cont, '[data-error]');
        const intentar = async (codigo) => {
          if (btn.classList.contains('a-ocupado')) return;
          btn.classList.add('a-ocupado');
          const ok = await c.iniciar(codigo);
          btn.classList.remove('a-ocupado');
          if (!ok) {
            error.textContent = 'Ese código no coincide. Pídeselo de nuevo al pasajero.';
            cas.error();
            hoja.fijar(hoja.estado);
            setTimeout(() => cas.limpiar(), 650);
          }
        };
        const cas = casillasCodigo({
          etiqueta: 'Código de abordaje',
          alCambiar: (v) => {
            btn.disabled = v.length !== 4;
            if (v.length) error.textContent = '';
          },
          alCompletar: (v) => intentar(v),
        });
        $(cont, '[data-casillas]').append(cas.el);
        btn.addEventListener('click', () => intentar(cas.valor()));
        cont.addEventListener('click', async (ev) => {
          if (ev.target.closest('[data-cancelar]')) cancelarServicio();
          if (ev.target.closest('[data-sin-codigo]')) {
            const ok = await modal(app, {
              titulo: '¿Iniciar sin el código?',
              texto: 'El código confirma que subió la persona correcta. Úsalo solo si el pasajero no puede verlo (por ejemplo, se le apagó el celular).',
              acciones: [{ texto: 'Volver', valor: false }, { texto: 'Iniciar sin código', valor: true, clase: 'a-btn-tinta' }],
            });
            if (ok) c.iniciar(null, { sinCodigo: true });
          }
        });
        setTimeout(() => cas.enfocar(), 400);
      },
      entrar(e) {
        ruta.quitar();
        ui.rutaRef = null;
        m.ponerOrigen(e.viaje.origen);
        centrarVisible(e.viaje.origen, 17);
      },
      actualizar: (e) => pintarMensaje(e),
    },

    en_viaje: {
      altura: 'media',
      html(e) {
        const v = e.viaje;
        return `${barraPasos('en_viaje')}
          <div class="a-estado-viaje" data-arrastre>
            <span class="a-eta a-eta-tinta"><strong data-eta-num>—</strong><small>min</small></span>
            <span class="a-estado-txt"><h2>${v.destino ? `Rumbo a ${esc(v.destino.titulo || 'destino')}` : 'Viaje en curso'}</h2><small data-estado-sub>${v.destino ? 'Calculando…' : 'Destino a convenir con el pasajero'}</small></span>
          </div>
          <div class="a-llegaste" data-llegaste hidden>${icono('bandera', { tam: 18 })}<span>Llegaste al destino. Toca <b>Terminar viaje</b> para cobrar.</span></div>
          ${v.destino ? `<div class="a-dir">${icono('bandera', { tam: 20 })}<span><small>Destino</small><strong>${esc(v.destino.titulo || 'Punto en el mapa')}</strong>${v.destino.detalle ? `<em>${esc(v.destino.detalle)}</em>` : ''}</span></div>${navegar(v.destino)}` : ''}
          <div data-corte></div>
          ${tarjetaPasajero(v)}`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-tinta a-btn-grande" data-terminar>${icono('bandera', { tam: 22 })}<span>Terminar viaje</span></button>`,
      montar(cont, pie) {
        $(pie, '[data-terminar]').addEventListener('click', async () => {
          if (!ui.llegoEn && c.estado.viaje?.destino && (c.estado.kmRestantes || 0) > 0.3) {
            const ok = await modal(app, {
              titulo: '¿Terminar el viaje aquí?',
              texto: 'Todavía no llegas al destino marcado. El cobro se hace con la tarifa estimada.',
              acciones: [{ texto: 'Seguir', valor: false }, { texto: 'Terminar', valor: true, clase: 'a-btn-tinta' }],
            });
            if (!ok) return;
          }
          c.finalizar();
        });
      },
      entrar(e) {
        quitarPulso();
        m.quitarOrigen();
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
        encuadrar([e.pos, e.viaje.destino || e.viaje.origen]);
      },
      actualizar(e) {
        const cnt = hoja.contenido;
        if (e.etaMin != null && e.viaje.destino && ui.llegoEn !== 'en_viaje') {
          ponerTexto(cnt, '[data-eta-num]', String(Math.max(1, Math.round(e.etaMin))));
          ponerTexto(cnt, '[data-estado-sub]', `${e.kmRestantes != null ? `Faltan ${N.kmTexto(e.kmRestantes)} · ` : ''}llegas a las ${N.horaTexto(Date.now() + e.etaMin * 60000)}`);
        }
        const llego = ui.llegoEn === 'en_viaje';
        $(hoja.pie, '[data-terminar]')?.classList.toggle('a-resaltar', llego);
        const aviso = $(cnt, '[data-llegaste]');
        if (aviso) aviso.hidden = !llego;
        if (llego) marcarLlegada(cnt, 'Ya llegaste al destino');
      },
    },

    cobrando: {
      altura: 'completa',
      html(e) {
        const v = e.viaje;
        return `${barraPasos('cobrando')}
          <div class="a-cobro">
            <small>Cobra a ${esc(nombreCorto(v.pasajero?.nombre || 'tu pasajero'))}</small>
            <strong class="a-cobro-valor">${N.pesos(v.valor)}</strong>
            <span class="a-cobro-chips">${chipPrueba('PAGO DE PRUEBA')}<span class="a-chip-metodo">${icono(v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 15 })} Prefiere: ${metodoTexto(v.metodoPago)}</span></span>
            <div class="a-cobro-breb" data-qr-cobro>${N.tarjetaBreB({ url: v.urlCobro, valor: v.valor, movil: c.perfil?.movil, compacta: true })}</div>
            <p>Muéstrale este QR Bre-B al pasajero. Lo escanea desde su app o con la cámara del celular.</p>
            <div class="a-esperando-pago" role="status"><span class="a-girador"></span>Esperando el pago…</div>
          </div>`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-verde a-btn-grande" data-efectivo>${icono('efectivo', { tam: 22 })}<span>Recibí efectivo</span></button>`,
      montar(cont, pie) {
        $(pie, '[data-efectivo]').addEventListener('click', async () => {
          const ok = await modal(app, {
            titulo: '¿Recibiste el efectivo?',
            texto: `Confirma que el pasajero te pagó ${N.pesos(c.estado.viaje?.valor || 0)}.`,
            acciones: [{ texto: 'Todavía no', valor: false }, { texto: 'Sí, recibí el pago', valor: true, clase: 'a-btn-verde' }],
          });
          if (ok) c.confirmarEfectivo();
        });
      },
      entrar(e) {
        ruta.quitar();
        ui.rutaRef = null;
        if (e.viaje.destino) m.ponerDestino(e.viaje.destino);
      },
    },

    calificar: {
      altura: 'completa',
      html(e) {
        const v = e.viaje;
        const pago = v.pago || {};
        return `${barraPasos('calificar')}
          <div class="a-pago-recibido" role="status">
            <span class="a-check-anim" aria-hidden="true">${icono('check', { tam: 30, grosor: 3 })}</span>
            <small>${pago.metodo === 'qr' ? 'Pago recibido por QR (prueba)' : 'Pago en efectivo registrado'}</small>
            <strong>${N.pesos(pago.valor || v.valor)}</strong>
            <span>${pago.metodo === 'qr' ? `${pago.billetera ? `${esc(pago.billetera)} · ` : ''}${pago.ref ? `Ref. ${esc(pago.ref)} ` : ''}${chipPrueba()}` : `Recibido a las ${esc(N.horaTexto(pago.hora || Date.now()))}`}</span>
          </div>
          <div class="a-calificar">
            ${avatar(v.pasajero?.nombre || 'Pasajero', 'a-avatar-xl a-avatar-tinta')}
            <h2>¿Cómo te fue con ${esc(nombreCorto(v.pasajero?.nombre || 'el pasajero'))}?</h2>
            <div data-estrellas></div>
            <div class="a-etiquetas" role="group" aria-label="¿Qué destacas del pasajero?">
              ${N.ETIQUETAS_CALIFICACION.pasajero.map((t) => `<button type="button" class="a-etiqueta" aria-pressed="false" data-etiqueta="${esc(t)}">${esc(t)}</button>`).join('')}
            </div>
          </div>`;
      },
      pie: () => `<button type="button" class="a-btn a-btn-primario a-btn-grande" data-enviar>Calificar y seguir</button>`,
      montar(cont, pie) {
        ui.etiquetas = new Set();
        const env = $(pie, '[data-enviar]');
        ui.calif = estrellas({ valor: 5, etiqueta: 'Califica al pasajero', alCambiar: (n) => (env.disabled = !n) });
        $(cont, '[data-estrellas]').append(ui.calif.el, ui.calif.leyenda);
        cont.addEventListener('click', (ev) => {
          const t = ev.target.closest('[data-etiqueta]');
          if (!t) return;
          const on = t.getAttribute('aria-pressed') !== 'true';
          t.setAttribute('aria-pressed', String(on));
          if (on) ui.etiquetas.add(t.dataset.etiqueta);
          else ui.etiquetas.delete(t.dataset.etiqueta);
        });
        env.addEventListener('click', () => {
          const n = ui.calif.valor();
          if (n) c.calificar(n, { etiquetas: [...ui.etiquetas] });
        });
      },
      entrar() {
        ruta.quitar();
        ui.rutaRef = null;
      },
    },
  };

  // Al llegar, el recuadro del tiempo deja de decir «0 min» y muestra un visto bueno.
  function marcarLlegada(cnt, texto) {
    const eta = $(cnt, '.a-estado-viaje .a-eta');
    if (eta && !eta.classList.contains('a-eta-llego')) {
      eta.classList.add('a-eta-llego');
      eta.innerHTML = `${icono('check', { tam: 30, grosor: 3 })}<small>listo</small>`;
    }
    ponerTexto(cnt, '[data-estado-sub]', texto);
  }

  function pintarMensaje(e) {
    const caja = $(hoja.contenido, '[data-msj]');
    if (!caja) return;
    const antes = caja.hidden;
    if (e.mensajePasajero) {
      if (caja.dataset.texto !== e.mensajePasajero) {
        caja.dataset.texto = e.mensajePasajero;
        caja.innerHTML = `${icono('chat', { tam: 18 })}<span><small>Mensaje del pasajero</small>${esc(e.mensajePasajero)}</span>`;
      }
      caja.hidden = false;
    } else caja.hidden = true;
    // Si apareció el mensaje, la hoja crece para que se vea.
    if (antes !== caja.hidden && hoja.estado === 'media') hoja.fijar('media');
  }

  /* ---------------- pintado ---------------- */
  function renderVista(clave) {
    const e = c?.estado || {};
    const v = VISTAS[clave];
    if (!v) return;
    ui.limpiezas.splice(0).forEach((f) => f());
    // Un «Código incorrecto» de la fase anterior ya no aplica.
    if (ui.vista && ui.vista !== clave) avisos.limpiar(['error']);
    ui.vista = clave;
    app.dataset.vista = clave;
    hoja.el.dataset.maxMedia = String(v.maxMedia || 0.74);
    hoja.el.dataset.peek = String(v.peek || 92);
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
    if (c) v.entrar?.(e);
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
    if (!c) return;
    const e = c.estado;
    const ingresado = Boolean(N.perfil.conductor());
    const clave = !ingresado ? 'libre' : e.viaje ? e.viaje.fase : 'libre';
    if (e.viaje?.fase !== ui.faseLlegada) {
      // La marca de «llegaste» vale solo para la fase en que ocurrió.
      if (ui.llegoEn && ui.llegoEn !== e.viaje?.fase) ui.llegoEn = null;
      ui.faseLlegada = e.viaje?.fase;
    }
    if (clave !== ui.vista) {
      renderVista(clave);
      recordarServicio(e);
    }
    VISTAS[ui.vista]?.actualizar?.(e);
    pintarSolicitud(e);
    actualizarMapa(e);
    // Barra: GPS y conexión.
    const gps = $(app, '[data-gps]');
    gps.classList.toggle('a-gps-real', e.gpsReal);
    ponerTexto(app, '[data-gps-txt]', e.gpsReal ? 'GPS real' : 'GPS simulado');
    const vivo = e.conexion === 'en-vivo';
    $(app, '[data-conexion]').classList.toggle('a-vivo', vivo);
    ponerTexto(app, '[data-conexion-txt]', vivo ? `En vivo · sala ${e.sala}` : 'Solo este equipo');
    const fab = $(app, '[data-simular]');
    fab.hidden = !ingresado || Boolean(e.viaje) || e.solicitudes.length > 0;
    app.classList.toggle('a-en-linea', e.conectado);
  }

  function actualizarMapa(e) {
    const movil = N.perfil.conductor()?.movil || '';
    if (e.pos && (e.pos !== ui.ultimaPos || movil !== ui.movilEtiqueta)) {
      ui.ultimaPos = e.pos;
      ui.movilEtiqueta = movil;
      m.ponerTaxi('yo', e.pos, { rumbo: e.pos.rumbo || 0, destacado: true, etiqueta: movil ? esc(`Móvil ${movil}`) : '' });
      if (e.conectado && !e.viaje) ponerPulso(e.pos);
      if (e.viaje) {
        ruta.recortar(e.pos);
        const objetivo = e.viaje.fase === 'en_viaje' ? e.viaje.destino : e.viaje.origen;
        if (['hacia_origen', 'en_viaje'].includes(e.viaje.fase) && Date.now() - ui.ultimoEncuadre > 2500 && !puntoVisible(m, e.pos, { arriba: arriba() + 64, abajo: hoja.alto })) {
          encuadrar([e.pos, objetivo]);
        }
      }
    }
    if (!e.conectado || e.viaje) quitarPulso();
    else if (e.pos && !pulso) ponerPulso(e.pos);
    if (e.rutaActual !== ui.rutaRef) {
      ui.rutaRef = e.rutaActual;
      if (e.rutaActual?.length && e.viaje) ruta.poner(e.rutaActual, { color: e.viaje.fase === 'en_viaje' ? '#121212' : '#1F2937' });
      else ruta.quitar();
    }
  }

  // El núcleo del conductor no guarda el servicio al recargar la página: se pierde
  // sin aviso y, si era un pasajero real, este se queda esperando. Aquí se anota el
  // servicio en curso para avisar al volver y liberar al pasajero.
  const CLAVE_SERVICIO = EM.clave('servicio');
  function recordarServicio(e) {
    try {
      if (e.viaje) sessionStorage.setItem(CLAVE_SERVICIO, JSON.stringify({ id: e.viaje.id, fase: e.viaje.fase, simulado: e.viaje.simulado, pasajero: e.viaje.pasajero?.nombre || '', guardado: Date.now() }));
      else sessionStorage.removeItem(CLAVE_SERVICIO);
    } catch { /* sin sessionStorage */ }
  }
  function revisarServicioPerdido() {
    let previo = null;
    try { previo = JSON.parse(sessionStorage.getItem(CLAVE_SERVICIO) || 'null'); } catch { previo = null; }
    if (!previo || c.estado.viaje || Date.now() - previo.guardado > 30 * 60 * 1000) return;
    sessionStorage.removeItem(CLAVE_SERVICIO);
    const real = !previo.simulado && !['cobrando', 'calificar'].includes(previo.fase);
    if (real && c.perfil) c.bus.publicar('cancelacion', { viajeId: previo.id, conductorId: c.perfil.id, por: 'conductor', motivo: 'Se cerró la app del conductor' });
    avisos.mostrar({
      titulo: 'Tu servicio anterior se cerró',
      cuerpo: real ? `Al recargar la página se pierde el servicio. Le avisamos a ${nombreCorto(previo.pasajero) || 'tu pasajero'} y su app ya le busca otro taxi.` : 'Al recargar la página se pierde el servicio de prueba. Toca «Simular solicitud» para empezar otro.',
      tipo: 'alerta',
    });
  }

  window.addEventListener('resize', () => {
    m.refrescar();
    hoja.fijar(hoja.estado, false);
  });
  const desbloquear = () => {
    N.prepararSonido();
    document.removeEventListener('pointerdown', desbloquear);
    document.removeEventListener('keydown', desbloquear);
  };
  document.addEventListener('pointerdown', desbloquear);
  document.addEventListener('keydown', desbloquear);

  /* ---------------- arranque ---------------- */
  pintarBarra();
  renderVista('carga');
  if (!N.perfil.conductor()) mostrarIngreso();

  (async () => {
    try {
      c = await N.crearConductor();
      c.on('cambio', pintar);
      // La solicitud entrante ya ocupa la pantalla (hoja amarilla): su aviso solo va al historial.
      c.on('aviso', (a) => {
        // El pasajero de prueba manda una referencia también cuando paga en efectivo: no aplica.
        const aviso = /efectivo/i.test(a.titulo || '') ? { ...a, cuerpo: String(a.cuerpo || '').replace(/ · Ref\. \S+/, '') } : a;
        avisos.mostrar(aviso, { silencioso: a.tipo === 'solicitud' });
      });
      c.on('llegada', () => {
        ui.llegoEn = c.estado.viaje?.fase || null;
        pintar();
        // El taxi quedó en el punto: se centra en la franja visible del mapa.
        if (c.estado.pos) setTimeout(() => centrarVisible(c.estado.pos, 17), 120);
      });
      c.on('vencida', () => avisos.mostrar({ titulo: 'La solicitud venció', cuerpo: 'No se respondió a tiempo. Sigue atento a las nuevas.', tipo: 'info' }));
      revisarServicioPerdido();
      ui.vista = null;
      pintarAhora();
    } catch (err) {
      console.error(err);
      avisos.mostrar({ titulo: 'No pudimos iniciar la app', cuerpo: err.message, tipo: 'error' });
    }
  })();
}
