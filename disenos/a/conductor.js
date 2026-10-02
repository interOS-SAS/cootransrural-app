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

// Placas que acepta el servidor: ABC123 (carros) y ABC12D (motos).
const PLACA_VALIDA = /^[A-Z]{3}\d{3}$|^[A-Z]{3}\d{2}[A-Z]$/;

const PASOS = ['Recoger', 'Llegué', 'Viaje', 'Cobrar'];
const PASO_DE_FASE = { confirmando: 0, hacia_origen: 0, en_origen: 1, en_viaje: 2, cobrando: 3, calificar: 3 };

export async function montar(raiz, { N, diseno = 'a', vitrina = false, taxicun = null }) {
  // Modo real: TaxiCun contra el servidor (app nativa o ?real=1). Sin él, todo
  // queda como en las 77 demos.
  const REAL = Boolean(EM.MODO_REAL ?? N.MODO_REAL);
  // App nativa (Capacitor): sin «Instalar», sin «App del pasajero» ni «Cambiar de municipio».
  const NATIVA = Boolean(EM.ES_NATIVA ?? N.ES_NATIVA);
  // Modo real con una sola cooperativa en servicio: «Cambiar de municipio» la volvería a abrir.
  const UNICA = REAL && Boolean(taxicun?.unica);
  // Cliente del servidor de TaxiCun (taxicun.com/api): solo se carga en modo real;
  // las demos no lo piden.
  const servidor = REAL ? await import('../../nucleo/servidor.js') : null;
  raiz.innerHTML = '';
  raiz.classList.add('a-raiz', 'a-raiz-conductor');
  if (EM.FICHA_EQUIVOCADA) {
    EM.pantallaSinFicha(raiz);
    return;
  }
  EM.aplicarColores();
  EM.aplicarFoto(raiz, { conductor: true });
  EM.marcarNoIndexar();
  // En la app nativa no va el panel de escritorio (es para abrir la web en el celular);
  // en el modo real de la web, su QR abre el modo real (sin ?real=1 sería la demo).
  if (!vitrina && !(REAL && NATIVA)) {
    raiz.append(panelEscritorio({
      titulo: `La app de los <em>conductores</em> de ${esc(EM.NOMBRE)}.`,
      texto: REAL
        ? 'Recibe servicios cerca de ti, navega hasta el pasajero, verifica su código y cobra en efectivo.'
        : 'Recibe servicios cerca de ti, navega hasta el pasajero, verifica su código y cobra con QR de prueba o en efectivo.',
      puntos: REAL
        ? ['Conéctate y desconéctate con un toque', 'Solicitudes con cuenta regresiva', 'Código de abordaje para viajar seguros', 'Ganancias del día']
        : ['Conéctate y desconéctate con un toque', 'Solicitudes con cuenta regresiva', 'Código de abordaje para viajar seguros', 'Ganancias del día y documentos al día'],
      // El QR abre la app de conductores de esta cooperativa con el mismo diseño;
      // dentro de TaxiCun, TaxiCun con esta cooperativa (?e=).
      url: REAL ? N.urlApp('conductor', { d: diseno, real: '1' }) : N.urlApp('conductor', { d: diseno }),
    }));
  }

  // En modo real el chip dice cómo va la conexión con la central (sin «MODO PRUEBA» ni sala).
  const chipConexion = REAL
    ? '<div class="a-chip-red a-chip-red-clara" data-conexion><span class="a-led"></span><span data-conexion-txt>Conectando…</span></div>'
    : `<div class="a-chip-red a-chip-red-clara${EM.ES_PROPUESTA ? ' a-chip-red-demo' : ''}" data-conexion><span class="a-led"></span><span data-conexion-txt>Solo este equipo</span><b>MODO PRUEBA</b>${avisoDemo()}</div>`;
  const app = el(`<div class="a-app a-conductor${REAL ? ' a-real' : ''}" data-vista="carga">
    <header class="a-cbarra">
      <button class="a-cbarra-menu" type="button" data-menu aria-label="Abrir menú"><span data-avatar>${avatar('')}</span><span class="a-barra-menu-ico">${icono('menu', { tam: 13, grosor: 3 })}</span></button>
      <div class="a-cbarra-txt"><strong data-movil>Conductor</strong><small data-nombre>${esc(EM.NOMBRE)}</small></div>
      <span class="a-chip-gps" data-gps title="Fuente de la ubicación"><span class="a-led"></span><span data-gps-txt>GPS…</span></span>
      <button class="a-icono-btn a-cbarra-campana" type="button" data-campana aria-label="Avisos">${icono('campana')}<span class="a-insignia" data-insignia hidden></span></button>
    </header>
    ${chipConexion}
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
    // Modo real: cuenta del servidor ({usuario, conductor} de GET /api/yo), pantalla
    // de cuenta abierta ('ingreso' | 'datos' | 'taxi' | 'revision' | 'app') y banderas.
    cuenta: null,
    pantalla: null,
    capa: null,
    relojReenvio: null,
    creando: null,
    revisando: false,
    saliendo: false,
    saludado: false,
    firmaYo: '',
    claveRevision: '',
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
    if (!c || REAL || b.classList.contains('a-ocupado')) return;
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

  // Datos del conductor para la barra, el menú y la vista libre. En modo real, mientras
  // no llega la bienvenida de la central (que los guarda en el perfil), se usan los de
  // la cuenta aprobada (GET /api/yo). En las demos es solo el perfil local.
  function yoConductor() {
    const yo = N.perfil.conductor();
    if (yo || !REAL) return yo;
    const dc = ui.cuenta?.conductor;
    if (!dc || dc.estado !== 'aprobado') return null;
    return { movil: dc.movil || '', placa: dc.placa || '', vehiculo: dc.vehiculo || '', color: dc.color || '', nombre: ui.cuenta.usuario?.nombre || '' };
  }

  function pintarBarra() {
    const yo = yoConductor();
    $(app, '[data-avatar]').innerHTML = avatar(yo?.nombre || '');
    ponerTexto(app, '[data-movil]', yo ? `Móvil ${yo.movil}` : 'Conductor');
    ponerTexto(app, '[data-nombre]', yo ? [yo.nombre, yo.placa].filter(Boolean).join(' · ') || EM.NOMBRE : EM.NOMBRE);
  }

  // Calificación y viajes del conductor: en modo real solo si el servidor los manda
  // (la bienvenida no los trae y «0,0 · 0 viajes» sería falso).
  function lineaCalificacion(yo) {
    if (!REAL) return `<span class="a-menu-cal">${icono('estrella', { tam: 14 })} ${decimal(yo.calificacion)} · ${Number(yo.viajes || 0).toLocaleString('es-CO')} viajes</span>`;
    const cal = Number(yo.calificacion) > 0 ? decimal(yo.calificacion) : '';
    const viajes = Number(yo.viajes) > 0 ? `${Number(yo.viajes).toLocaleString('es-CO')} viajes` : '';
    if (!cal && !viajes) return '';
    return `<span class="a-menu-cal">${cal ? icono('estrella', { tam: 14 }) : ''} ${esc(EM.unir([cal, viajes]))}</span>`;
  }

  function abrirMenuConductor() {
    const yo = yoConductor();
    if (!yo) return;
    const r = N.perfil.resumenDelDia();
    abrirMenu(app, {
      clase: 'a-menu-oscuro',
      cabeza: `${franjaCuadros()}
        <div class="a-menu-perfil">${avatar(yo.nombre, 'a-avatar-grande')}
          <div><strong>${esc(yo.nombre)}</strong><span>Móvil ${esc(yo.movil)} · ${esc(yo.placa)}</span>
          ${lineaCalificacion(yo)}</div>
        </div>`,
      items: [
        { icono: 'grafica', texto: 'Ganancias', detalle: `Hoy: ${N.pesos(r.ganado)} en ${r.viajes} ${r.viajes === 1 ? 'viaje' : 'viajes'}`, accion: () => abrirGanancias(ctx()) },
        { icono: 'reloj', texto: 'Historial', detalle: 'Tus servicios', accion: () => abrirHistorial(ctx()) },
        // En modo real no hay documentos de ejemplo.
        !REAL && { icono: 'documento', texto: 'Documentos', detalle: 'SOAT, técnico-mecánica, licencia', accion: () => abrirDocumentos(ctx()) },
        { icono: 'auto', texto: 'Mi taxi', detalle: REAL ? EM.unir([yo.vehiculo, yo.placa]) : `${yo.vehiculo} · ${yo.placa}`, accion: () => abrirMiTaxi(ctx()) },
        { icono: 'ajustes', texto: 'Ajustes', detalle: REAL ? 'GPS, sonido, tu cuenta' : 'GPS, sonido, sala, diseño', accion: () => abrirAjustesConductor(ctx()) },
        { separador: true },
        EM.EN_TAXICUN && !NATIVA && !UNICA && { icono: 'pin', texto: 'Cambiar de municipio', detalle: `Ahora: ${EM.PUEBLO} · ${EM.NOMBRE}`, accion: cambiarMunicipio },
        !NATIVA && { icono: 'usuario', texto: 'App del pasajero', detalle: 'Abrir la app para pedir taxi', href: EM.urlOtraApp('pasajero', diseno), clase: 'a-menu-marca' },
        { icono: 'salir', texto: 'Cerrar sesión', accion: cerrarSesion, clase: 'a-menu-peligro' },
        REAL && { icono: 'basura', texto: 'Eliminar mi cuenta', detalle: 'Borra tu cuenta y tu registro', accion: eliminarCuenta, clase: 'a-menu-peligro' },
      ].filter(Boolean),
      pie: `<div class="a-menu-pie-marca">${EM.marcaIcono(30)}<div><strong>${esc(EM.NOMBRE)} · Conductores</strong>${EM.LEMA ? `<small>${esc(EM.LEMA)}</small>` : ''}</div></div>
        ${EM.EN_TAXICUN ? `<div class="a-menu-pie-tc">${EM.iconoApp(18)}<span>${esc(EM.TEXTO_DESARROLLO)}</span></div>` : ''}
        ${REAL
          ? `<div class="a-menu-pie-estado"><span><span class="a-led ${estadoCentral() === 'en_linea' ? 'a-led-vivo' : ''}"></span>${esc(textoCentral())}</span></div>`
          : `<div class="a-menu-pie-estado">${chipPrueba('MODO PRUEBA')}${avisoDemo('a-chip-demo a-chip-demo-claro')}<span><span class="a-led ${c?.estado.conexion === 'en-vivo' ? 'a-led-vivo' : ''}"></span>${c?.estado.conexion === 'en-vivo' ? 'En vivo' : 'Solo este equipo'} · sala «${esc(c?.estado.sala || N.salaActual())}»</span></div>`}`,
    });
  }

  // Devuelve true si cerró la sesión.
  async function cerrarSesion() {
    if (c?.estado.viaje) {
      avisos.mostrar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo o cancélalo antes de cerrar sesión.', tipo: 'alerta' });
      return false;
    }
    const ok = await modal(app, {
      titulo: '¿Cerrar sesión?',
      texto: 'Te desconectamos y dejas de recibir solicitudes.',
      acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cerrar sesión', valor: true, clase: 'a-btn-peligro' }],
    });
    if (!ok) return false;
    if (REAL) {
      await cerrarSesionReal();
      return true;
    }
    c?.desconectar();
    N.perfil.cerrarSesionConductor();
    pintarBarra();
    mostrarIngreso();
    return true;
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
    return { N, app, c, avisos, diseno, cambiarMunicipio, real: REAL, nativa: NATIVA, unica: UNICA, cuenta: ui.cuenta, yo: yoConductor(), cerrarSesion, eliminarCuenta };
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

  /* ---------------- cuenta real (servidor taxicun.com/api) ---------------- */
  // Solo en modo real. Flujo: correo → código de 6 dígitos → «Tus datos» (si falta
  // nombre o celular) → «Tu taxi» (si no hay registro) → «Tu registro está en
  // revisión» (pendiente o suspendido) → aprobado: se crea el controlador y se abre
  // el bus con la central. Todo va en una capa .a-ingreso con la portada de la foto.

  // Taxi dibujado de la portada: con el móvil de la cuenta, o sin número (nunca el de la demo).
  function taxiPortada(movil = '') {
    const svg = taxiLateral({ ancho: 270, movil });
    return movil ? svg : svg.replace(/<text[^>]*>MÓVIL[^<]*<\/text>/, '');
  }

  function capaCuenta() {
    if (ui.capa?.isConnected && !ui.capa.classList.contains('a-sale')) return ui.capa;
    const capa = el(`<div class="a-ingreso a-ingreso-real" role="dialog" aria-modal="true" aria-label="Cuenta de conductor">
      <div class="a-ingreso-arte a-ingreso-con-foto">
        ${franjaCuadros()}
        <div class="a-ingreso-taxi" aria-hidden="true">${taxiPortada(ui.cuenta?.conductor?.movil || '')}</div>
        <div class="a-ingreso-carretera" aria-hidden="true"></div>
        <img class="a-ingreso-foto" src="${FOTO_CONDUCTOR}" alt="" decoding="async">
        <div class="a-marca a-marca-clara${EM.EN_TAXICUN ? ' a-marca-tc' : ''}">${EM.encabezadoMarca({ tam: 46, detalle: EM.EN_TAXICUN ? `App del conductor · ${EM.PUEBLO}` : 'App del conductor' })}</div>
      </div>
      <div class="a-ingreso-paso" data-paso-cuenta></div>
    </div>`);
    app.append(capa);
    const foto = capa.querySelector('.a-ingreso-foto');
    const fotoLista = () => capa.querySelector('.a-ingreso-arte').classList.add('a-foto-lista');
    if (foto.complete && foto.naturalWidth) fotoLista();
    else foto.addEventListener('load', fotoLista, { once: true });
    foto.addEventListener('error', () => foto.remove(), { once: true });
    ui.capa = capa;
    return capa;
  }

  // Pone un paso en la capa de cuenta y devuelve su contenedor.
  function ponerPaso(pantalla, etiqueta, html) {
    const capa = capaCuenta();
    clearInterval(ui.relojReenvio);
    ui.pantalla = pantalla;
    if (pantalla !== 'revision') ui.claveRevision = '';
    capa.setAttribute('aria-label', etiqueta);
    const caja = $(capa, '[data-paso-cuenta]');
    caja.innerHTML = html;
    caja.classList.remove('a-entra');
    void caja.offsetWidth;
    caja.classList.add('a-entra');
    capa.scrollTop = 0;
    return caja;
  }

  function cerrarCapaCuenta() {
    clearInterval(ui.relojReenvio);
    const capa = ui.capa;
    ui.capa = null;
    ui.claveRevision = '';
    if (!capa) return;
    capa.classList.add('a-sale');
    setTimeout(() => capa.remove(), 320);
  }

  // Foco inicial, salvo que la persona ya esté escribiendo.
  function enfocar(nodo, ms = 300) {
    setTimeout(() => {
      if (nodo?.isConnected && !ui.capa?.contains(document.activeElement)) nodo.focus({ preventScroll: true });
    }, ms);
  }

  // Botón ocupado mientras responde el servidor.
  function ocupar(boton, si) {
    if (!boton) return;
    boton.classList.toggle('a-ocupado', si);
    boton.disabled = si;
  }

  // Enlaces de abajo del ingreso: la app del pasajero y el municipio (no en la app nativa).
  function enlacesIngreso() {
    if (NATIVA) return '';
    return `<a class="a-btn-texto" href="${esc(EM.urlOtraApp('pasajero', diseno))}" data-ir-pasajero>¿Eres pasajero? Abre la app para pedir taxi</a>
      ${EM.EN_TAXICUN && !UNICA ? `<button type="button" class="a-btn-texto a-tc-cambiar" data-cambiar-municipio>${icono('pin', { tam: 16 })}<span>Cambiar de municipio</span></button>` : ''}`;
  }

  // Paso 1: correo.
  function mostrarIngresoReal(correoPrevio = '') {
    const caja = ponerPaso('ingreso', 'Ingreso de conductores', `<form class="a-ingreso-form" novalidate>
        <h1>Empieza tu turno</h1>
        <p class="a-sub">Ingresa con tu correo. Te enviamos un código de 6 dígitos para entrar, sin contraseña.</p>
        <label class="a-campo">
          <span>Correo electrónico</span>
          <input name="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" maxlength="254" placeholder="tucorreo@ejemplo.com" value="${esc(correoPrevio)}" required>
        </label>
        <p class="a-error" data-error role="alert"></p>
        <button type="submit" class="a-btn a-btn-primario a-btn-grande">${icono('mensaje', { tam: 20 })}<span>Recibir código</span></button>
        <p class="a-nota-prueba a-ingreso-legal">${icono('candado', { tam: 16 })}<span>Al continuar aceptas la <a href="${esc(EM.urlPrivacidad())}" target="_blank" rel="noopener">política de privacidad</a>.</span></p>
        ${enlacesIngreso()}
      </form>`);
    caja.querySelector('[data-cambiar-municipio]')?.addEventListener('click', cambiarMunicipio);
    const f = $(caja, 'form');
    const error = $(caja, '[data-error]');
    f.correo.addEventListener('input', () => {
      f.correo.classList.remove('a-invalido');
      error.textContent = '';
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const correo = f.correo.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        error.textContent = 'Escribe un correo válido, por ejemplo tunombre@gmail.com.';
        f.correo.classList.add('a-invalido');
        f.correo.focus();
        return;
      }
      const b = $(f, '[type="submit"]');
      if (b.disabled) return;
      ocupar(b, true);
      try {
        await servidor.pedirCodigo(correo);
        pasoCodigo(correo);
      } catch (err) {
        ocupar(b, false);
        // Ya se pidió un código hace menos de un minuto: el que llegó sirve.
        if (err?.codigo === 'espera_un_minuto') {
          pasoCodigo(correo, { yaEnviado: true });
          return;
        }
        error.textContent = servidor.textoError(err);
        if (err?.codigo === 'correo_invalido') f.correo.classList.add('a-invalido');
      }
    });
    enfocar(f.correo);
  }

  // Paso 2: código de 6 dígitos que llegó al correo.
  function pasoCodigo(correo, { yaEnviado = false } = {}) {
    const caja = ponerPaso('ingreso', 'Código del correo', `<form class="a-ingreso-form" novalidate>
        <h1>Revisa tu correo</h1>
        <p class="a-sub a-ingreso-correo">Escribe el código de 6 dígitos que ${yaEnviado ? 'te enviamos hace poco a' : 'enviamos a'} <strong>${esc(correo)}</strong>. Si no lo ves, busca en «Spam» o «Promociones».</p>
        <div class="a-campo"><span>Código del correo</span><div data-casillas></div></div>
        <p class="a-error" data-error role="alert"></p>
        <button type="submit" class="a-btn a-btn-primario a-btn-grande" disabled>${icono('volante', { tam: 20 })}<span>Entrar</span></button>
        <div class="a-ingreso-acciones">
          <button type="button" class="a-btn-texto" data-reenviar disabled>Reenviar código en 60 s</button>
          <button type="button" class="a-btn-texto" data-cambiar-correo>Cambiar correo</button>
        </div>
      </form>`);
    const f = $(caja, 'form');
    const error = $(caja, '[data-error]');
    const entrarBtn = $(f, '[type="submit"]');
    let enviando = false;
    const intentar = async (codigo) => {
      if (enviando || !/^\d{6}$/.test(codigo)) return;
      enviando = true;
      ocupar(entrarBtn, true);
      try {
        const r = await servidor.entrar(correo, codigo);
        // Otra persona pudo usar este celular: el perfil local lo vuelve a llenar la central.
        N.perfil.cerrarSesionConductor();
        seguirConCuenta(r, { recienEntra: true });
      } catch (err) {
        enviando = false;
        entrarBtn.classList.remove('a-ocupado');
        entrarBtn.disabled = cas.valor().length !== 6;
        error.textContent = servidor.textoError(err);
        if (err?.codigo === 'codigo_invalido' || err?.codigo === 'codigo_vencido') {
          cas.error();
          setTimeout(() => cas.limpiar(), 700);
        }
        // Código vencido o agotado: el reenvío queda disponible ya.
        if (err?.codigo === 'codigo_vencido') reloj(0);
      }
    };
    const cas = casillasCodigo({
      n: 6,
      etiqueta: 'Código del correo',
      alCambiar: (v) => {
        entrarBtn.disabled = v.length !== 6 || enviando;
        if (v.length) error.textContent = '';
      },
      alCompletar: (v) => intentar(v),
    });
    // ui.js le pone la clase al pedir 6; se repite aquí por si acaso (no hace daño).
    cas.el.classList.add('a-casillas-6');
    $(caja, '[data-casillas]').append(cas.el);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      intentar(cas.valor());
    });
    $(caja, '[data-cambiar-correo]').addEventListener('click', () => mostrarIngresoReal(correo));
    const reenviar = $(caja, '[data-reenviar]');
    // El servidor deja pedir un código por minuto.
    function reloj(segundos = 60) {
      clearInterval(ui.relojReenvio);
      let s = segundos;
      const tic = () => {
        if (s <= 0) {
          clearInterval(ui.relojReenvio);
          reenviar.disabled = false;
          reenviar.textContent = 'Reenviar código';
        } else {
          reenviar.disabled = true;
          reenviar.textContent = `Reenviar código en ${s} s`;
        }
        s -= 1;
      };
      tic();
      if (segundos > 0) ui.relojReenvio = setInterval(tic, 1000);
    }
    reloj(60);
    reenviar.addEventListener('click', async () => {
      if (reenviar.disabled) return;
      reenviar.disabled = true;
      try {
        await servidor.pedirCodigo(correo);
        error.textContent = '';
        avisos.mostrar({ titulo: 'Te enviamos otro código', cuerpo: `Revisa ${correo}. El código anterior ya no sirve.`, tipo: 'info' });
        cas.limpiar();
        reloj(60);
      } catch (err) {
        error.textContent = servidor.textoError(err);
        reloj(err?.codigo === 'espera_un_minuto' ? 60 : 0);
      }
    });
    setTimeout(() => {
      if (caja.isConnected) cas.enfocar();
    }, 350);
  }

  // Decide a dónde va el conductor según su cuenta ({usuario, conductor} del servidor).
  function seguirConCuenta(r, { recienEntra = false } = {}) {
    ui.cuenta = { usuario: r?.usuario || ui.cuenta?.usuario || {}, conductor: r?.conductor ?? null };
    // Si en este celular estaban los datos de otra cuenta (historial, ganancias, el servicio
    // guardado), se borran antes de seguir.
    N.perfil.fijarDueno?.(ui.cuenta.usuario.correo);
    pintarBarra();
    const u = ui.cuenta.usuario;
    const dc = ui.cuenta.conductor;
    if (!u.nombre || !u.celular) return pasoDatos();
    if (!dc) return pasoTaxi();
    if (dc.estado !== 'aprobado') return pantallaRevision();
    entrarAprobado({ saludar: recienEntra || ui.pantalla === 'revision' });
  }

  // Paso «Tus datos»: nombre y celular (PATCH /api/yo). Sin ellos el servidor no
  // deja registrar el taxi (completa_tu_perfil).
  function pasoDatos({ corrigiendo = false } = {}) {
    const u = ui.cuenta?.usuario || {};
    const caja = ponerPaso('datos', 'Tus datos', `<form class="a-ingreso-form" novalidate>
        <h1>Tus datos</h1>
        <p class="a-sub">Así te ven ${esc(EM.NOMBRE)} y el pasajero de cada servicio. Tu celular solo lo ve el pasajero que llevas, para llamarte.</p>
        ${u.correo ? `<p class="a-ingreso-cuenta">${icono('usuario', { tam: 16 })}<span>${esc(u.correo)}</span></p>` : ''}
        <label class="a-campo">
          <span>Nombre completo</span>
          <input name="nombre" autocomplete="name" autocapitalize="words" maxlength="80" placeholder="Ej.: Luis Alberto Rodríguez" value="${esc(u.nombre || '')}" required>
        </label>
        <label class="a-campo">
          <span>Celular</span>
          <span class="a-campo-tel"><span class="a-prefijo">+57</span><input name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" maxlength="12" value="${esc(celularTexto(u.celular || ''))}" required></span>
        </label>
        <p class="a-error" data-error role="alert"></p>
        <button type="submit" class="a-btn a-btn-primario a-btn-grande">${icono('adelante', { tam: 20 })}<span>Continuar</span></button>
        <div class="a-ingreso-acciones">
          ${corrigiendo ? '<button type="button" class="a-btn-texto" data-volver>Volver</button>' : ''}
          <button type="button" class="a-btn-texto" data-salir>Cerrar sesión</button>
          <button type="button" class="a-btn-texto a-texto-peligro" data-eliminar>Eliminar mi cuenta</button>
        </div>
      </form>`);
    const f = $(caja, 'form');
    const error = $(caja, '[data-error]');
    f.celular.addEventListener('input', () => {
      const d = f.celular.value.replace(/\D/g, '').slice(0, 10);
      f.celular.value = celularTexto(d) || d;
    });
    f.addEventListener('input', (e) => {
      e.target.classList?.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    $(caja, '[data-volver]')?.addEventListener('click', () => pantallaRevision());
    $(caja, '[data-salir]').addEventListener('click', cerrarSesion);
    $(caja, '[data-eliminar]').addEventListener('click', eliminarCuenta);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = f.nombre.value.trim().replace(/\s+/g, ' ');
      const celular = f.celular.value.replace(/\D/g, '');
      f.querySelectorAll('.a-invalido').forEach((x) => x.classList.remove('a-invalido'));
      const fallo = (campo, msj) => {
        error.textContent = msj;
        campo.classList.add('a-invalido');
        campo.focus();
      };
      if (nombre.length < 3 || !/[a-záéíóúñ]/i.test(nombre)) return fallo(f.nombre, 'Escribe tu nombre completo (mínimo 3 letras).');
      if (!/^3\d{9}$/.test(celular)) return fallo(f.celular, 'El celular debe tener 10 dígitos y empezar por 3.');
      const b = $(f, '[type="submit"]');
      if (b.disabled) return;
      ocupar(b, true);
      try {
        const cambio = nombre !== u.nombre || celular !== u.celular;
        const r = cambio ? await servidor.actualizarYo({ nombre, celular }) : null;
        ui.cuenta = {
          usuario: r?.usuario || { ...u, nombre, celular },
          conductor: r && 'conductor' in r ? r.conductor : ui.cuenta?.conductor ?? null,
        };
        // El servidor toma el nombre y el celular al saludar: si el bus ya estaba abierto, se reabre.
        if (cambio && c?.real && c.bus.estado === 'en_linea') c.bus.reconectar();
        pintarBarra();
        if (corrigiendo || !ui.cuenta.conductor) pasoTaxi({ corrigiendo });
        else seguirConCuenta(ui.cuenta);
      } catch (err) {
        ocupar(b, false);
        if (err?.codigo === 'sin_sesion') return;
        error.textContent = servidor.textoError(err);
        if (err?.codigo === 'nombre_invalido') f.nombre.classList.add('a-invalido');
        if (err?.codigo === 'celular_invalido') f.celular.classList.add('a-invalido');
      }
    });
    enfocar(u.nombre ? f.celular : f.nombre);
  }

  // Paso «Tu taxi»: móvil, placa, vehículo y color (PUT /api/conductor). Queda pendiente
  // hasta que la cooperativa o interOS lo aprueben.
  function pasoTaxi({ corrigiendo = false } = {}) {
    const dc = ui.cuenta?.conductor || {};
    const vehiculo = dc.vehiculo || N.EMPRESA?.vehiculo || '';
    const color = dc.color || N.EMPRESA?.colorTaxi || 'Amarillo';
    const caja = ponerPaso('taxi', 'Tu taxi', `<form class="a-ingreso-form" novalidate>
        <h1>Tu taxi</h1>
        <p class="a-sub">${esc(`Con estos datos ${EM.NOMBRE} revisa y aprueba tu registro.`)}</p>
        <div class="a-fila-2 a-fila-taxi">
          <label class="a-campo">
            <span>Número de móvil</span>
            <span class="a-campo-tel"><span class="a-prefijo">MÓVIL</span><input name="movil" inputmode="numeric" maxlength="3" placeholder="001" value="${esc(dc.movil || '')}" autocomplete="off" required></span>
          </label>
          <label class="a-campo">
            <span>Placa</span>
            <input name="placa" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="7" placeholder="ABC123" value="${esc(dc.placa || '')}" required>
          </label>
        </div>
        <div class="a-fila-2">
          <label class="a-campo"><span>Vehículo</span><input name="vehiculo" autocomplete="off" maxlength="60" placeholder="Marca y modelo" value="${esc(vehiculo)}"></label>
          <label class="a-campo"><span>Color</span><input name="color" autocomplete="off" maxlength="30" placeholder="Amarillo" value="${esc(color)}"></label>
        </div>
        ${corrigiendo ? `<p class="a-nota-prueba">${icono('info', { tam: 16 })}<span>Si cambias el móvil o la placa, tu registro vuelve a revisión.</span></p>` : ''}
        <p class="a-error" data-error role="alert"></p>
        <button type="submit" class="a-btn a-btn-primario a-btn-grande">${icono('auto', { tam: 20 })}<span>${corrigiendo ? 'Guardar cambios' : 'Enviar registro'}</span></button>
        <div class="a-ingreso-acciones">
          <button type="button" class="a-btn-texto" data-volver>${corrigiendo ? 'Volver' : 'Cambiar nombre o celular'}</button>
          <button type="button" class="a-btn-texto" data-salir>Cerrar sesión</button>
          <button type="button" class="a-btn-texto a-texto-peligro" data-eliminar>Eliminar mi cuenta</button>
        </div>
      </form>`);
    const f = $(caja, 'form');
    const error = $(caja, '[data-error]');
    f.movil.addEventListener('input', () => {
      f.movil.value = f.movil.value.replace(/\D/g, '').slice(0, 3);
    });
    f.placa.addEventListener('input', () => {
      const p = f.placa.selectionStart;
      f.placa.value = f.placa.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      try { f.placa.setSelectionRange(p, p); } catch { /* sin cursor */ }
    });
    f.addEventListener('input', (e) => {
      e.target.classList?.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    $(caja, '[data-volver]').addEventListener('click', () => (corrigiendo ? pantallaRevision() : pasoDatos({ corrigiendo: Boolean(ui.cuenta?.conductor) })));
    $(caja, '[data-salir]').addEventListener('click', cerrarSesion);
    $(caja, '[data-eliminar]').addEventListener('click', eliminarCuenta);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = Number(f.movil.value);
      const placaTxt = f.placa.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      f.querySelectorAll('.a-invalido').forEach((x) => x.classList.remove('a-invalido'));
      const fallo = (campo, msj) => {
        error.textContent = msj;
        campo.classList.add('a-invalido');
        campo.focus();
      };
      if (!f.movil.value || !Number.isInteger(n) || n < 1 || n > 999) return fallo(f.movil, 'Escribe tu número de móvil (de 001 a 999).');
      if (!PLACA_VALIDA.test(placaTxt)) return fallo(f.placa, 'Placa con formato ABC123.');
      const datos = {
        empresa: EM.ID,
        movil: String(n).padStart(3, '0'),
        placa: placaTxt,
        vehiculo: f.vehiculo.value.trim().replace(/\s+/g, ' '),
        color: f.color.value.trim().replace(/\s+/g, ' '),
      };
      const b = $(f, '[type="submit"]');
      if (b.disabled) return;
      ocupar(b, true);
      try {
        const r = await servidor.registrarConductor(datos);
        seguirConCuenta(r?.usuario || r?.conductor ? r : { usuario: ui.cuenta?.usuario, conductor: { ...dc, ...datos, estado: 'pendiente' } });
      } catch (err) {
        ocupar(b, false);
        if (err?.codigo === 'sin_sesion') return;
        if (err?.codigo === 'completa_tu_perfil') {
          avisos.mostrar({ titulo: 'Faltan tus datos', cuerpo: servidor.textoError(err), tipo: 'alerta' });
          pasoDatos();
          return;
        }
        error.textContent = servidor.textoError(err);
        if (err?.codigo === 'movil_invalido') f.movil.classList.add('a-invalido');
        if (err?.codigo === 'placa_invalida' || err?.codigo === 'placa_registrada') f.placa.classList.add('a-invalido');
      }
    });
    enfocar(dc.movil ? f.placa : f.movil);
  }

  // «Tu registro está en revisión» (pendiente), suspendido, o sin conexión con la
  // central (motivo = código del error). Aquí también va «Eliminar mi cuenta»: el
  // menú no abre sin un conductor aprobado.
  function pantallaRevision({ motivo = '' } = {}) {
    const dc = ui.cuenta?.conductor;
    const u = ui.cuenta?.usuario || {};
    const estado = motivo ? 'error' : dc?.estado === 'suspendido' ? 'suspendido' : 'pendiente';
    const clave = JSON.stringify([estado, motivo, dc?.movil, dc?.placa, dc?.vehiculo, dc?.color, u.nombre]);
    // «Revisar de nuevo» sin cambios: no se repinta (no salta la pantalla).
    if (ui.pantalla === 'revision' && ui.claveRevision === clave && ui.capa?.isConnected) return;
    const textos = {
      pendiente: {
        titulo: 'Tu registro está en revisión',
        texto: `${EM.NOMBRE} revisa tus datos antes de activar tu cuenta. Cuando te aprueben podrás conectarte y recibir servicios.`,
        chip: 'En revisión',
      },
      suspendido: {
        titulo: 'Tu cuenta está suspendida',
        texto: `Por ahora no puedes recibir servicios. Comunícate con ${EM.NOMBRE} para revisar tu caso.`,
        chip: 'Suspendida',
      },
      error: {
        titulo: 'No pudimos conectarte',
        texto: servidor.textoError(motivo),
        chip: '',
      },
    }[estado];
    const caja = ponerPaso('revision', textos.titulo, `<div class="a-ingreso-form a-revision a-revision-${estado}">
        <h1>${esc(textos.titulo)}</h1>
        <p class="a-sub">${esc(textos.texto)}</p>
        ${dc ? `<div class="a-revision-taxi">
          ${placa(dc.placa || '')}
          <span>${textos.chip ? `<em class="a-revision-chip">${esc(textos.chip)}</em>` : ''}<strong>${esc(EM.unir([dc.movil ? `Móvil ${dc.movil}` : '', dc.vehiculo, dc.color]))}</strong><small>${esc(EM.unir([u.nombre, u.correo]))}</small></span>
        </div>` : ''}
        ${estado === 'pendiente' ? `<p class="a-nota-prueba">${icono('info', { tam: 16 })}<span>Puedes cerrar la app: cuando vuelvas, revisamos de nuevo.</span></p>` : ''}
        <p class="a-error" data-error role="alert"></p>
        <button type="button" class="a-btn a-btn-primario a-btn-grande" data-revisar>${icono('reloj', { tam: 20 })}<span>${estado === 'error' ? 'Reintentar' : 'Revisar de nuevo'}</span></button>
        ${dc ? `<button type="button" class="a-btn a-btn-suave a-btn-grande" data-corregir>${icono('documento', { tam: 20 })}<span>Corregir mis datos</span></button>` : ''}
        ${EM.TELEFONO && estado !== 'error' ? `<a class="a-btn a-btn-suave a-btn-grande" href="tel:${esc(EM.TELEFONO)}">${icono('telefono', { tam: 20 })}<span>${esc(`Llamar a ${EM.NOMBRE}`)}</span></a>` : ''}
        <div class="a-ingreso-acciones">
          <button type="button" class="a-btn-texto" data-salir>Cerrar sesión</button>
          <button type="button" class="a-btn-texto a-texto-peligro" data-eliminar>Eliminar mi cuenta</button>
        </div>
      </div>`);
    ui.claveRevision = clave;
    $(caja, '[data-revisar]').addEventListener('click', () => revisarCuenta());
    $(caja, '[data-corregir]')?.addEventListener('click', () => pasoDatos({ corrigiendo: true }));
    $(caja, '[data-salir]').addEventListener('click', cerrarSesion);
    $(caja, '[data-eliminar]').addEventListener('click', eliminarCuenta);
  }

  // Vuelve a pedir la cuenta (GET /api/yo) y sigue según su estado.
  async function revisarCuenta({ silencioso = false } = {}) {
    if (ui.revisando) return;
    ui.revisando = true;
    const b = ui.capa && $(ui.capa, '[data-revisar]');
    if (!silencioso) ocupar(b, true);
    try {
      const r = await servidor.yo();
      const antes = ui.cuenta?.conductor?.estado;
      seguirConCuenta(r);
      const ahora = ui.cuenta?.conductor?.estado;
      if (!silencioso && ui.pantalla === 'revision' && ahora === antes) {
        avisos.mostrar({ titulo: ahora === 'suspendido' ? 'Tu cuenta sigue suspendida' : 'Tu registro sigue en revisión', cuerpo: 'Te avisamos aquí apenas cambie.', tipo: 'info' });
      }
    } catch (err) {
      if (err?.codigo !== 'sin_sesion' && !silencioso) {
        const error = ui.capa && $(ui.capa, '[data-error]');
        if (error) error.textContent = servidor.textoError(err);
        else avisos.mostrar({ titulo: 'No pudimos revisar tu cuenta', cuerpo: servidor.textoError(err), tipo: 'error' });
      }
    } finally {
      ui.revisando = false;
      if (b?.isConnected) ocupar(b, false);
    }
  }

  // Arranque en modo real: sin sesión → ingreso; con sesión → la cuenta decide.
  async function arrancarReal() {
    if (!servidor.haySesion()) {
      mostrarIngresoReal();
      return;
    }
    try {
      seguirConCuenta(await servidor.yo());
    } catch (err) {
      if (err?.codigo === 'sin_sesion') {
        if (ui.pantalla !== 'ingreso') mostrarIngresoReal();
        return;
      }
      // Sin señal: si este celular ya tenía un conductor aprobado, la app abre y el
      // bus se conecta solo cuando vuelva la red. Si no, «No pudimos conectarte».
      if (N.perfil.conductor()) entrarAprobado();
      else pantallaRevision({ motivo: err?.codigo || 'sin_red' });
    }
  }

  // Conductor aprobado: se crea el controlador y se abre el bus con la central. La
  // píldora de turno queda deshabilitada hasta la bienvenida.
  async function entrarAprobado({ saludar = false } = {}) {
    cerrarCapaCuenta();
    ui.pantalla = 'app';
    ui.saludado = !saludar;
    pintarBarra();
    const ctl = await prepararControlador();
    if (!ctl || ctl !== c || ui.pantalla !== 'app') return;
    if (ctl.real) ctl.bus.conectar();
    pintar();
  }

  // Suelta el controlador (cierra el bus sin reintentos) y deja la pantalla de carga.
  function soltarControlador() {
    const viejo = c;
    c = null;
    if (viejo) {
      try { viejo.desconectar(); } catch { /* ya estaba desconectado */ }
      try { viejo.destruir(); } catch (err) { console.error(err); }
    }
    clearInterval(ui.relojSolicitud);
    ui.solicitudVista = null;
    ui.llegoEn = null;
    ui.rutaRef = null;
    ui.firmaYo = '';
    $(app, '.a-solicitud')?.remove();
    // El menú y los paneles abiertos quedarían debajo de la capa de cuenta.
    $$(app, '.a-panel, .a-menu-capa').forEach((x) => x.remove());
    app.classList.remove('a-con-solicitud', 'a-en-linea');
    quitarPulso();
    ruta.quitar();
    m.quitarOrigen();
    m.quitarDestino();
    renderVista('carga');
  }

  async function cerrarSesionReal() {
    ui.saliendo = true;
    soltarControlador();
    await servidor.salir();
    N.perfil.cerrarSesionConductor();
    const correo = ui.cuenta?.usuario?.correo || '';
    ui.cuenta = null;
    ui.saliendo = false;
    pintarBarra();
    mostrarIngresoReal(correo);
  }

  // «Eliminar mi cuenta» (menú, Ajustes y pantalla de revisión). Devuelve true si se eliminó.
  async function eliminarCuenta() {
    if (!REAL) return false;
    if (c?.estado.viaje) {
      avisos.mostrar({ titulo: 'Tienes un servicio en curso', cuerpo: 'Termínalo o cancélalo antes de eliminar tu cuenta.', tipo: 'alerta' });
      return false;
    }
    const ok = await modal(app, {
      titulo: '¿Eliminar tu cuenta?',
      texto: `Borramos tu cuenta de ${EM.APP}, tu registro de conductor y tus sesiones en todos tus equipos. No se puede deshacer.`,
      icono: icono('basura', { tam: 30 }),
      acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Eliminar mi cuenta', valor: true, clase: 'a-btn-peligro' }],
    });
    if (!ok) return false;
    // El servidor cierra el bus con «sesión cerrada»: no es un cierre inesperado.
    ui.saliendo = true;
    try {
      await servidor.eliminarCuenta();
    } catch (err) {
      ui.saliendo = false;
      // La sesión ya no sirve (venció, se cerró en otra pestaña, o la cuenta se borró y se
      // perdió la respuesta): de vuelta al ingreso, diciendo qué pasó.
      if (err?.codigo === 'sin_sesion' || !servidor.haySesion()) {
        sesionCerrada({ cuerpo: 'Ingresa de nuevo con tu correo para eliminar tu cuenta.' });
        return true;
      }
      avisos.mostrar({ titulo: 'No pudimos eliminar tu cuenta', cuerpo: servidor.textoError(err), tipo: 'error' });
      return false;
    }
    soltarControlador();
    N.perfil.borrarDatosLocales?.();
    ui.cuenta = null;
    ui.saliendo = false;
    pintarBarra();
    mostrarIngresoReal();
    avisos.mostrar({ titulo: 'Eliminamos tu cuenta', cuerpo: `Tus datos se borraron de ${EM.APP} y de este celular.`, tipo: 'info' });
    return true;
  }

  // La central dijo que la sesión no sirve (HTTP 401 o cierre 4401): de vuelta al ingreso.
  function sesionCerrada({ cuerpo = 'Ingresa de nuevo con tu correo.' } = {}) {
    if (ui.saliendo || ui.pantalla === 'ingreso') return;
    soltarControlador();
    N.perfil.cerrarSesionConductor();
    const correo = ui.cuenta?.usuario?.correo || '';
    ui.cuenta = null;
    pintarBarra();
    mostrarIngresoReal(correo);
    avisos.mostrar({ titulo: 'Tu sesión se cerró', cuerpo, tipo: 'alerta' });
  }

  // El bus no reintenta: 4403 (no aprobado), 4401 (sin sesión) o 4404 (el 4400 sí se reintenta).
  async function alRechazo({ codigo } = {}) {
    if (ui.saliendo) return;
    if (codigo === 'sin_sesion') {
      sesionCerrada();
      return;
    }
    soltarControlador();
    if (codigo !== 'conductor_no_aprobado') {
      pantallaRevision({ motivo: codigo || 'error_interno' });
      return;
    }
    // Pendiente o suspendido: solo GET /api/yo lo distingue. Si la cuenta dice
    // «aprobado» (cambió hace un instante), se muestra la revisión igual y el
    // conductor entra con «Revisar de nuevo» (sin vueltas automáticas).
    let r = null;
    try { r = await servidor.yo(); } catch (err) { if (err?.codigo === 'sin_sesion') return; }
    if (ui.saliendo || c || ui.pantalla === 'ingreso') return;
    if (r) ui.cuenta = { usuario: r.usuario || ui.cuenta?.usuario || {}, conductor: r.conductor ?? null };
    const dc = ui.cuenta?.conductor;
    if (dc && dc.estado === 'aprobado') ui.cuenta.conductor = { ...dc, estado: 'pendiente' };
    // Sin registro de taxi (lo borraron): a registrarlo. Sin datos (sin red): revisión.
    if (r && !r.conductor) pasoTaxi();
    else pantallaRevision();
  }

  // Bienvenida de la central: el núcleo ya guardó el conductor (id c_…) en el perfil.
  function alBienvenida() {
    pintarBarra();
    const yo = yoConductor();
    const firma = JSON.stringify([yo?.movil, yo?.placa, yo?.vehiculo, yo?.nombre]);
    // La primera vez la tarjeta del taxi pudo pintarse sin datos: se vuelve a pintar.
    if (firma !== ui.firmaYo && ui.vista === 'libre') ui.vista = null;
    ui.firmaYo = firma;
    pintar();
    if (!ui.saludado) {
      ui.saludado = true;
      avisos.mostrar({ titulo: `¡Buen turno, ${nombreCorto(yo?.nombre || '') || 'conductor'}!`, cuerpo: 'Conéctate para empezar a recibir servicios.', tipo: 'exito' });
    }
  }

  // Estado de la conexión con la central (modo real).
  function estadoCentral() {
    if (!REAL) return 'en_linea';
    return c?.real ? c.bus.estado || 'sin_conectar' : 'sin_conectar';
  }
  function textoCentral() {
    const est = estadoCentral();
    if (est === 'en_linea') return 'En línea';
    if (est === 'reconectando') return 'Sin conexión, reintentando…';
    if (est === 'rechazado') return 'Sin conexión';
    return 'Conectando…';
  }

  /* ---------------- piezas ---------------- */
  function barraPasos(fase) {
    const actual = PASO_DE_FASE[fase] ?? 0;
    return `<ol class="a-pasos-barra" aria-label="Progreso del servicio">${PASOS.map((n, i) => `<li class="${i < actual ? 'a-hecho' : ''} ${i === actual ? 'a-actual' : ''}" ${i === actual ? 'aria-current="step"' : ''}><span>${i < actual ? icono('check', { tam: 14, grosor: 3 }) : i + 1}</span>${n}</li>`).join('')}</ol>`;
  }
  // En modo real el pago es solo en efectivo (no hay QR de prueba).
  function metodoTexto(m) {
    if (REAL) return 'Efectivo';
    return m === 'qr' ? 'QR (prueba)' : 'Efectivo';
  }
  function metodoIcono(m) {
    return !REAL && m === 'qr' ? 'qr' : 'efectivo';
  }
  function navegar(p) {
    if (!p) return '';
    return `<div class="a-nav">
      <a class="a-nav-btn" href="${esc(N.enlaceNavegacion(p, 'google'))}" target="_blank" rel="noopener">${icono('navegar', { tam: 18 })}<span>Google Maps</span></a>
      <a class="a-nav-btn" href="${esc(N.enlaceNavegacion(p, 'waze'))}" target="_blank" rel="noopener">${icono('navegar', { tam: 18 })}<span>Waze</span></a>
    </div>`;
  }
  // Llamar o escribir al pasajero. En modo real el celular llega con la asignación
  // (viaje.pasajero.celular); si no lo registró, se dice.
  function contacto(v) {
    const cel = v.pasajero?.celular;
    if (!cel) return REAL ? `<p class="a-sin-celular">${icono('telefono', { tam: 16 })}<span>El pasajero no tiene celular registrado</span></p>` : '';
    return `<div class="a-nav a-nav-contacto">
      <a class="a-nav-btn" href="tel:${esc(cel)}">${icono('telefono', { tam: 18 })}<span>Llamar</span></a>
      <a class="a-nav-btn" href="${esc(N.enlaceWhatsApp(cel, `Hola ${nombreCorto(v.pasajero.nombre)}, soy el conductor del móvil ${yoConductor()?.movil || ''} de ${EM.NOMBRE}.`))}" target="_blank" rel="noopener">${icono('chat', { tam: 18 })}<span>WhatsApp</span></a>
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

  // Modo real: antes de cobrar, el conductor confirma o corrige el valor del viaje. La
  // tarifa la estimó el teléfono del pasajero y, con «Destino a convenir», es solo la
  // carrera mínima: aquí se escribe lo que de verdad se cobra (le llega al pasajero y a
  // la central). Devuelve el valor, o null si sigue el viaje.
  const VALOR_MIN = 1000;
  const VALOR_MAX = 2000000;
  async function pedirValorCobro(v, { antesDelDestino = false } = {}) {
    const estimado = Math.round(Number(v?.tarifa) || 0);
    const sinDestino = !v?.destino;
    const miles = (n) => Number(n).toLocaleString('es-CO');
    const texto = sinDestino
      ? `Destino a convenir: escribe el valor del recorrido${estimado ? ` (la carrera mínima es ${N.pesos(estimado)})` : ''}.`
      : antesDelDestino
        ? 'Todavía no llegas al destino marcado. Confirma o corrige el valor del viaje.'
        : 'Confirma o corrige el valor del viaje antes de cobrar.';
    const leer = (cuerpo) => Number(String(cuerpo.querySelector('[name=valor]')?.value || '').replace(/\D/g, '')) || 0;
    const valido = (n) => Number.isInteger(n) && n >= VALOR_MIN && n <= VALOR_MAX;
    const valor = await modal(app, {
      titulo: '¿Cuánto cobras?',
      texto,
      cuerpo: `<label class="a-campo a-campo-valor"><span>Valor del viaje</span>
          <span class="a-campo-tel"><span class="a-prefijo">$</span><input name="valor" inputmode="numeric" autocomplete="off" maxlength="9" placeholder="${esc(estimado ? miles(estimado) : '15.000')}" value="${sinDestino || !estimado ? '' : esc(miles(estimado))}"></span>
        </label>
        <p class="a-ayuda-txt" data-valor-ayuda>${esc(`Entre ${N.pesos(VALOR_MIN)} y ${N.pesos(VALOR_MAX)}.`)}</p>`,
      acciones: [
        { texto: 'Seguir el viaje', valor: null },
        { texto: 'Terminar y cobrar', valor: (cuerpo) => leer(cuerpo), clase: 'a-btn-tinta' },
      ],
      alAbrir(cuerpo, cerrar, caja) {
        const input = cuerpo.querySelector('[name=valor]');
        const listo = caja.querySelector('.a-modal-acciones .a-btn-tinta');
        const revisar = () => {
          const d = input.value.replace(/\D/g, '').slice(0, 7);
          input.value = d ? miles(d) : '';
          listo.disabled = !valido(Number(d));
        };
        input.addEventListener('input', revisar);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !listo.disabled) listo.click();
        });
        input.setAttribute('autofocus', '');
        revisar();
      },
    });
    return valido(valor) ? valor : null;
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
          <span class="a-chip-metodo">${icono(metodoIcono(s.metodoPago), { tam: 16 })} ${metodoTexto(s.metodoPago)}</span>
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
      // Modo real: se nota que ya se está aceptando (la central asigna al primero).
      const boton = $(capa, '[data-aceptar]');
      const antes = boton.innerHTML;
      if (REAL) {
        capa.classList.add('a-aceptando');
        boton.disabled = true;
        $(capa, '[data-rechazar]').disabled = true;
        boton.innerHTML = '<span class="a-girador"></span> Aceptando…';
      }
      const ok = await c.aceptar(s.viajeId);
      if (!ok) {
        avisos.mostrar({ titulo: 'Ya no está disponible', cuerpo: 'Otro conductor tomó el servicio o la solicitud venció.', tipo: 'info' });
        if (REAL && capa.isConnected) {
          delete capa.dataset.ocupado;
          capa.classList.remove('a-aceptando');
          boton.disabled = false;
          $(capa, '[data-rechazar]').disabled = false;
          boton.innerHTML = antes;
        }
      }
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
        const yo = yoConductor();
        const docs = Object.values(yo?.documentos || {});
        const alDia = docs.every((d) => new Date(d.vence) > Date.now());
        const p = textoPildora(e);
        // En modo real no hay documentos de ejemplo: la tarjeta dice que el registro está aprobado.
        const lineaTaxi = REAL
          ? `<small class="a-ok-txt">${icono('check', { tam: 14 })} Registro aprobado</small>`
          : `<small class="${alDia ? 'a-ok-txt' : 'a-mal-txt'}">${icono(alDia ? 'check' : 'alerta', { tam: 14 })} ${alDia ? 'Documentos al día' : 'Revisa tus documentos'}</small>`;
        return `
          <button type="button" class="a-pildora" role="switch" aria-checked="${e.conectado}" data-conectar aria-label="Turno: ${e.conectado ? 'conectado' : 'desconectado'}"${turnoBloqueado(e) ? ' disabled' : ''}>
            <span class="a-pildora-perilla">${icono('potencia', { tam: 26, grosor: 2.6 })}</span>
            <span class="a-pildora-txt"><strong data-pildora-titulo>${p.titulo}</strong><small data-pildora-sub>${p.sub}</small></span>
          </button>
          <div class="a-hoy">
            <div class="a-hoy-total"><small>Ganado hoy</small><strong data-ganado>${N.pesos(e.resumen.ganado)}</strong></div>
            <div class="a-kpis">
              <span><strong data-viajes>${e.resumen.viajes}</strong><small>${e.resumen.viajes === 1 ? 'viaje' : 'viajes'}</small></span>
              <span><strong data-prom>${textoPromedio(e)}</strong><small>calificación</small></span>
              <span><strong data-km>${esc(N.kmTexto(e.resumen.km || 0))}</strong><small>recorridos</small></span>
            </div>
          </div>
          <div data-corte></div>
          <button type="button" class="a-tarjeta-taxi" data-mi-taxi>
            ${placa(yo?.placa || '')}
            <span><strong>Móvil ${esc(yo?.movil || '')} · ${esc(yo?.vehiculo || '')}</strong>${lineaTaxi}</span>
            ${icono('adelante', { tam: 18 })}
          </button>
          <div class="a-atajos-c">
            <button type="button" class="a-atajo-c" data-ganancias>${icono('grafica', { tam: 20 })}<span>Ganancias</span></button>
            <button type="button" class="a-atajo-c" data-historial>${icono('reloj', { tam: 20 })}<span>Historial</span></button>
            ${REAL
              ? `<button type="button" class="a-atajo-c" data-mi-taxi>${icono('auto', { tam: 20 })}<span>Mi taxi</span></button>`
              : `<button type="button" class="a-atajo-c" data-documentos>${icono('documento', { tam: 20 })}<span>Documentos</span></button>`}
          </div>
          ${REAL
            ? `<p class="a-ayuda-txt">${icono('info', { tam: 14 })} Para recibir servicios, deja la app abierta con la ubicación activada.</p>`
            : `<p class="a-ayuda-txt">${icono('info', { tam: 14 })} Con el botón «Simular solicitud» te llega un pasajero de prueba para enseñar la app.</p>`}`;
      },
      montar(cont) {
        cont.addEventListener('click', (ev) => {
          const t = ev.target;
          if (t.closest('[data-conectar]')) {
            N.prepararSonido();
            if (c.estado.conectado) c.desconectar();
            else if (REAL) conectarTurnoReal();
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
          const p = textoPildora(e);
          b.setAttribute('aria-checked', String(e.conectado));
          b.setAttribute('aria-label', `Turno: ${e.conectado ? 'conectado' : 'desconectado'}`);
          ponerTexto(cnt, '[data-pildora-titulo]', p.titulo);
          ponerTexto(cnt, '[data-pildora-sub]', p.sub);
        }
        if (REAL) pintarPildoraReal(e);
        ponerTexto(cnt, '[data-ganado]', N.pesos(e.resumen.ganado));
        ponerTexto(cnt, '[data-viajes]', String(e.resumen.viajes));
        ponerTexto(cnt, '[data-prom]', textoPromedio(e));
        ponerTexto(cnt, '[data-km]', N.kmTexto(e.resumen.km || 0));
      },
    },

    confirmando: {
      altura: 'media',
      html: (e) => `${barraPasos('confirmando')}
        ${REAL
          ? `<div class="a-cargando"><span class="a-girador"></span><div><strong>${esc(e.viaje?.esperaTexto || 'Confirmando con la central…')}</strong><small>En segundos sabrás si el servicio es tuyo.</small></div></div>`
          : '<div class="a-cargando"><span class="a-girador"></span><div><strong>Esperando al pasajero</strong><small>Confirmando que el servicio es tuyo…</small></div></div>'}
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
            ${v.codigoRevision ? `<div class="a-pista" data-pista-revision>${icono('info', { tam: 18 })}<span>Pasajero automático de prueba: su código de abordaje es <b>${esc(v.codigoRevision)}</b></span></div>` : ''}
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
          const antesDelDestino = !ui.llegoEn && c.estado.viaje?.destino && (c.estado.kmRestantes || 0) > 0.3;
          // Modo real: un solo diálogo con el valor (y el aviso si aún no llega al destino).
          if (REAL) {
            const v = c.estado.viaje;
            if (!v || v.fase !== 'en_viaje') return;
            const valor = await pedirValorCobro(v, { antesDelDestino });
            if (valor != null && c.estado.viaje?.id === v.id) c.finalizar(valor);
            return;
          }
          if (antesDelDestino) {
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
        // Modo real: solo efectivo (valor + «Recibí efectivo»), sin QR ni chip de prueba.
        if (REAL) {
          return `${barraPasos('cobrando')}
          <div class="a-cobro a-cobro-real">
            <small>Cobra a ${esc(nombreCorto(v.pasajero?.nombre || 'tu pasajero'))}</small>
            <strong class="a-cobro-valor">${N.pesos(v.valor)}</strong>
            <span class="a-cobro-chips"><span class="a-chip-metodo">${icono('efectivo', { tam: 15 })} Pago en efectivo</span></span>
            <p>Recibe el pago del pasajero y toca <b>Recibí efectivo</b> para registrarlo.</p>
            <div class="a-pago-anunciado" role="status" data-pago-anunciado${v.pagoAnunciado ? '' : ' hidden'}>${icono('efectivo', { tam: 18 })}<span>El pasajero dice que ya te pagó. Confírmalo cuando tengas el efectivo.</span></div>
          </div>`;
        }
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
      // Modo real: el pasajero avisa que pagó en efectivo; el conductor lo confirma.
      actualizar(e) {
        if (!REAL) return;
        const dijo = Boolean(e.viaje?.pagoAnunciado);
        const caja = $(hoja.contenido, '[data-pago-anunciado]');
        if (caja) caja.hidden = !dijo;
        $(hoja.pie, '[data-efectivo]')?.classList.toggle('a-resaltar', dijo);
      },
    },

    calificar: {
      altura: 'completa',
      html(e) {
        const v = e.viaje;
        const pago = v.pago || {};
        // En modo real no hay pago con QR de prueba.
        const esQR = !REAL && pago.metodo === 'qr';
        return `${barraPasos('calificar')}
          <div class="a-pago-recibido" role="status">
            <span class="a-check-anim" aria-hidden="true">${icono('check', { tam: 30, grosor: 3 })}</span>
            <small>${esQR ? 'Pago recibido por QR (prueba)' : 'Pago en efectivo registrado'}</small>
            <strong>${N.pesos(pago.valor || v.valor)}</strong>
            <span>${esQR ? `${pago.billetera ? `${esc(pago.billetera)} · ` : ''}${pago.ref ? `Ref. ${esc(pago.ref)} ` : ''}${chipPrueba()}` : `Recibido a las ${esc(N.horaTexto(pago.hora || Date.now()))}`}</span>
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
    // En modo real nunca hay GPS simulado: sin señal es «Sin GPS».
    ponerTexto(app, '[data-gps-txt]', e.gpsReal ? 'GPS real' : REAL ? 'Sin GPS' : 'GPS simulado');
    if (REAL) pintarConexionReal();
    else {
      const vivo = e.conexion === 'en-vivo';
      $(app, '[data-conexion]').classList.toggle('a-vivo', vivo);
      ponerTexto(app, '[data-conexion-txt]', vivo ? `En vivo · sala ${e.sala}` : 'Solo este equipo');
    }
    const fab = $(app, '[data-simular]');
    fab.hidden = REAL || !ingresado || Boolean(e.viaje) || e.solicitudes.length > 0;
    app.classList.toggle('a-en-linea', e.conectado);
  }

  /* ---------------- turno y conexión en modo real ---------------- */
  // Textos de la píldora de turno. En las demos, los de siempre.
  function textoPildora(e) {
    // Modo real: mientras se espera la primera lectura del GPS (hasta 7 s).
    if (REAL && !e.conectado && (c?.conectandoTurno || c?.buscandoGps)) {
      return { titulo: 'Desconectado', sub: 'Buscando tu ubicación…' };
    }
    if (REAL && estadoCentral() !== 'en_linea') {
      const est = estadoCentral();
      return {
        titulo: e.conectado ? 'Conectado' : 'Desconectado',
        sub: est === 'reconectando' ? 'Sin conexión, reintentando…' : est === 'rechazado' ? 'Sin conexión con la central' : 'Conectando con la central…',
      };
    }
    // Modo real: en línea pero sin GPS, la central no le manda servicios (no está disponible).
    if (REAL && e.conectado && !e.gpsReal) {
      return { titulo: 'Conectado', sub: 'Sin GPS: no te llegan servicios', alerta: true };
    }
    return {
      titulo: e.conectado ? 'Conectado' : 'Desconectado',
      sub: e.conectado ? 'Recibiendo solicitudes cercanas' : 'Toca para empezar a recibir servicios',
    };
  }
  // El turno solo se abre con la central en línea (después de la bienvenida) y sin otro
  // intento en curso; desconectarse siempre se puede.
  function turnoBloqueado(e) {
    return REAL && !e.conectado && (estadoCentral() !== 'en_linea' || Boolean(c?.conectandoTurno));
  }
  function pintarPildoraReal(e) {
    const cnt = hoja.contenido;
    const b = $(cnt, '[data-conectar]');
    if (!b) return;
    const p = textoPildora(e);
    b.disabled = turnoBloqueado(e);
    b.classList.toggle('a-pildora-alerta', Boolean(p.alerta));
    ponerTexto(cnt, '[data-pildora-titulo]', p.titulo);
    ponerTexto(cnt, '[data-pildora-sub]', p.sub);
  }
  // Calificación de la vista libre: en modo real el promedio que manda la central
  // (no las estrellas de cada pasajero); en las demos, el promedio del día.
  function textoPromedio(e) {
    if (!REAL) return e.resumen.promedio ? decimal(e.resumen.promedio) : '—';
    const cal = Number(yoConductor()?.calificacion);
    return cal > 0 ? decimal(cal) : '—';
  }
  async function conectarTurnoReal() {
    if (!c || turnoBloqueado(c.estado)) return;
    const ctl = c;
    try {
      await ctl.conectar();
    } catch (err) {
      avisos.mostrar({ titulo: 'No pudimos conectarte', cuerpo: err?.message || 'Intenta de nuevo.', tipo: 'error' });
    } finally {
      // Se suelta el «Buscando tu ubicación…» aunque no haya cambiado el estado.
      if (ctl === c && ui.vista === 'libre') pintarPildoraReal(ctl.estado);
    }
  }
  // Chip de conexión con la central y píldora (el estado del bus cambia sin «cambio»).
  function pintarConexionReal() {
    const est = estadoCentral();
    const chip = $(app, '[data-conexion]');
    chip.classList.toggle('a-vivo', est === 'en_linea');
    chip.classList.toggle('a-reintentando', est === 'reconectando' || est === 'rechazado');
    ponerTexto(app, '[data-conexion-txt]', textoCentral());
    if (c && ui.vista === 'libre') pintarPildoraReal(c.estado);
  }

  function actualizarMapa(e) {
    const movil = yoConductor()?.movil || '';
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
  // En modo real no aplica: el núcleo guarda el viaje en el celular y lo retoma con
  // el viaje_actual de la central (no se cancela un servicio real por recargar).
  const CLAVE_SERVICIO = EM.clave('servicio');
  function recordarServicio(e) {
    if (REAL) return;
    try {
      if (e.viaje) sessionStorage.setItem(CLAVE_SERVICIO, JSON.stringify({ id: e.viaje.id, fase: e.viaje.fase, simulado: e.viaje.simulado, pasajero: e.viaje.pasajero?.nombre || '', guardado: Date.now() }));
      else sessionStorage.removeItem(CLAVE_SERVICIO);
    } catch { /* sin sessionStorage */ }
  }
  function revisarServicioPerdido() {
    if (REAL) return;
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

  /* ---------------- controlador ---------------- */
  // Crea el controlador del núcleo y se suscribe a sus eventos. En las demos se crea
  // al arrancar; en modo real, solo con un conductor aprobado (y el bus no abre solo:
  // lo abre entrarAprobado con c.bus.conectar()). Devuelve el controlador o null.
  function prepararControlador() {
    if (c) return Promise.resolve(c);
    if (ui.creando) return ui.creando;
    ui.creando = (async () => {
      try {
        const nuevo = await N.crearConductor();
        // Mientras se creaba, la sesión pudo cerrarse (modo real): se descarta.
        if (REAL && ui.pantalla !== 'app') {
          nuevo.destruir();
          return null;
        }
        c = nuevo;
        // Los eventos de un controlador ya soltado (modo real) no pintan nada.
        const vigente = () => c === nuevo;
        c.on('cambio', pintar);
        // La solicitud entrante ya ocupa la pantalla (hoja amarilla): su aviso solo va al historial.
        c.on('aviso', (a) => {
          if (!vigente()) return;
          // El pasajero de prueba manda una referencia también cuando paga en efectivo: no aplica.
          const aviso = /efectivo/i.test(a.titulo || '') ? { ...a, cuerpo: String(a.cuerpo || '').replace(/ · Ref\. \S+/, '') } : a;
          avisos.mostrar(aviso, { silencioso: a.tipo === 'solicitud' });
        });
        c.on('llegada', () => {
          if (!vigente()) return;
          ui.llegoEn = c.estado.viaje?.fase || null;
          pintar();
          // El taxi quedó en el punto: se centra en la franja visible del mapa.
          if (c.estado.pos) setTimeout(() => c && centrarVisible(c.estado.pos, 17), 120);
        });
        c.on('vencida', () => vigente() && avisos.mostrar({ titulo: 'La solicitud venció', cuerpo: 'No se respondió a tiempo. Sigue atento a las nuevas.', tipo: 'info' }));
        if (REAL && c.real) {
          c.on('bienvenida', () => vigente() && alBienvenida());
          c.bus.on('rechazo', (d) => vigente() && alRechazo(d || {}));
          c.bus.on('conexion', () => vigente() && pintarConexionReal());
          // El núcleo reemite el estado del bus (conectando, en_linea, reconectando…).
          c.on('conexion', () => vigente() && pintarConexionReal());
          // Errores de la central: el núcleo ya avisa los que importan; aquí solo quedan
          // en la lista de la campana (sin aviso repetido en pantalla).
          c.on('error_servidor', (d) => vigente() && avisos.mostrar({ titulo: 'Aviso de la central', cuerpo: d?.texto || servidor.textoError(d?.codigo), tipo: 'info' }, { silencioso: true }));
        }
        revisarServicioPerdido();
        ui.vista = null;
        pintarAhora();
        return c;
      } catch (err) {
        console.error(err);
        avisos.mostrar({ titulo: 'No pudimos iniciar la app', cuerpo: err.message, tipo: 'error' });
        return null;
      } finally {
        ui.creando = null;
      }
    })();
    return ui.creando;
  }

  /* ---------------- arranque ---------------- */
  pintarBarra();
  renderVista('carga');

  if (REAL) {
    // Sesión cerrada por la central (HTTP 401 o cierre 4401): al ingreso.
    servidor.sesion.on('cerrada', () => sesionCerrada());
    // En revisión: al volver a la app se pregunta otra vez si ya lo aprobaron.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && ui.pantalla === 'revision') revisarCuenta({ silencioso: true });
    });
    // El estado del bus (conectando, en línea, reintentando) cambia sin aviso del controlador.
    // Solo con la app a la vista (al volver se pinta de una vez).
    N.relojVisible(() => {
      if (c) pintarConexionReal();
    }, 1000);
    arrancarReal();
    return;
  }

  if (!N.perfil.conductor()) mostrarIngreso();
  prepararControlador();
}
