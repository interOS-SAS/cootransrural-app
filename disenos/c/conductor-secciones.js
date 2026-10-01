// Secciones del conductor (diseño C): Ganancias, Historial, Mi taxi y sus
// pantallas internas (Documentos del vehículo y Ajustes).
import * as C from './comun.js';

const DOCUMENTOS = [
  ['soat', 'SOAT', 'Seguro obligatorio'],
  ['tecnomecanica', 'Revisión técnico-mecánica', 'Certificado de revisión'],
  ['licencia', 'Licencia de conducción', 'Categoría C1'],
  ['tarjetaControl', 'Tarjeta de control', 'Servicio público'],
];
const DIAS_AVISO = 100; // a partir de aquí el semáforo se pone en amarillo

export function crearSeccionesConductor({ N, c, app, ui, avisar, irATab, repintar }) {
  const { icono, esc } = C;
  const E = C.empresa;
  const yo = () => c.perfil || {};

  const cabeza = (titulo, subtitulo = '', volver = null) => `<header class="c-pantalla-cabeza${volver ? ' c-con-volver' : ''}">
    ${volver ? `<button type="button" class="c-boton-icono c-boton-icono-chico" data-accion="${volver}" aria-label="Volver">${icono('atras')}</button>` : ''}
    <h1>${titulo}${subtitulo ? `<small>${subtitulo}</small>` : ''}</h1>
    <span class="c-conexion" data-conexion></span>
  </header>`;

  const inicioDeHoy = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  function filaViaje(v) {
    const fin = v.estado === 'finalizado';
    return `<article class="c-viaje-item" data-estado="${esc(v.estado)}">
      <header><span class="c-viaje-fecha">${icono('calendario')}${esc(N.fechaTexto(v.fin || v.fecha))} · ${esc(N.horaTexto(v.fin || v.fecha))}</span>
        <span class="c-estado-viaje c-estado-${fin ? 'ok' : 'cancelado'}">${fin ? 'Finalizado' : 'Cancelado'}</span></header>
      <div class="c-viaje-ruta">
        <span><i class="c-punto c-punto-cian"></i>${esc(v.origen?.titulo || 'Punto de recogida')}</span>
        <span><i class="c-punto c-punto-magenta"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
      </div>
      <footer>
        <strong class="c-viaje-valor">${fin ? N.pesos(v.valor) : '—'}</strong>
        <span>${icono('perfil')} ${esc(v.pasajero || 'Pasajero')}</span>
        ${fin ? `<span>${v.metodoPago === 'qr' ? `${icono('qr')} QR (prueba)` : `${icono('efectivo')} Efectivo`}</span>` : `<span>${esc(v.motivo || '')}</span>`}
        ${v.km ? `<span>${icono('ruta')} ${N.kmTexto(v.km)}</span>` : ''}
        ${v.calificacionRecibida ? `<span title="Calificación que te dio el pasajero">${C.estrellasFijas(v.calificacionRecibida)}</span>` : ''}
        ${v.simulado ? '<span class="c-etiqueta">Prueba</span>' : ''}
      </footer>
    </article>`;
  }

  /* ---------------- Ganancias ---------------- */
  function htmlGanancias() {
    const r = c.estado.resumen || {};
    const ganado = r.ganado || 0;
    const pct = Math.round((ganado / ui.meta) * 100);
    const hoy = c.historial().filter((v) => (v.fin || 0) >= inicioDeHoy() && v.estado === 'finalizado');
    const porViaje = r.viajes ? Math.round(ganado / r.viajes) : 0;
    const maximo = Math.max(r.porQR || 0, r.efectivo || 0, 1);
    return `<section class="c-pantalla c-pantalla-ganancias" aria-label="Ganancias">
      ${cabeza('Ganancias', `Hoy, ${esc(N.fechaTexto(Date.now()))}`)}
      <div class="c-ganancias-anillo">
        ${C.anillo({ tam: 214, grosor: 14, id: 'c-anillo-ganancias-2', degradado: ['#FFE14D', '#FF4D9D'], etiqueta: `Ganado hoy: ${N.pesos(ganado)}, ${pct} % de la meta`, contenido: `<small class="c-anillo-hoy">Ganado hoy</small><strong class="c-anillo-valor-texto c-grande">${N.pesos(ganado)}</strong><span class="c-anillo-meta">${pct} % de ${N.pesos(ui.meta)}</span>` })}
      </div>
      <p class="c-metas-titulo">Meta del día</p>
      <div class="c-metas c-segmentado" role="radiogroup" aria-label="Meta del día">
        ${[100000, 150000, 200000].map((v) => `<button type="button" role="radio" aria-checked="${ui.meta === v}" data-accion="meta" data-valor="${v}">${N.pesos(v)}</button>`).join('')}
      </div>
      <div class="c-resumen-cifras">
        <div><strong>${r.viajes || 0}</strong><small>viajes</small></div>
        <div><strong>${N.pesos(porViaje)}</strong><small>promedio por viaje</small></div>
        <div><strong>${r.promedio ? `${C.calificacionTexto(r.promedio)} ★` : '—'}</strong><small>calificación</small></div>
      </div>
      <h2 class="c-seccion-titulo">QR frente a efectivo</h2>
      <div class="c-bloque c-reparto">
        <div class="c-reparto-fila"><span>${icono('qr')} QR <small>(prueba)</small></span><strong>${N.pesos(r.porQR || 0)}</strong></div>
        <div class="c-barra" aria-hidden="true"><span class="c-barra-qr" style="width:${((r.porQR || 0) / maximo) * 100}%"></span></div>
        <div class="c-reparto-fila"><span>${icono('efectivo')} Efectivo</span><strong>${N.pesos(r.efectivo || 0)}</strong></div>
        <div class="c-barra" aria-hidden="true"><span class="c-barra-efectivo" style="width:${((r.efectivo || 0) / maximo) * 100}%"></span></div>
        <p class="c-muted c-reparto-nota">${N.kmTexto(r.km || 0)} recorridos hoy</p>
      </div>
      <h2 class="c-seccion-titulo">Viajes de hoy</h2>
      <div class="c-lista">${hoy.length ? hoy.map(filaViaje).join('') : `<div class="c-vacio c-bloque">${icono('grafica')}<strong>Aún no hay viajes hoy</strong><span>Conéctate en el Tablero o toca «Simular solicitud» para probar.</span></div>`}</div>
    </section>`;
  }

  /* ---------------- Historial ---------------- */
  function htmlHistorial() {
    const h = c.historial();
    const fin = h.filter((v) => v.estado === 'finalizado');
    const total = fin.reduce((s, v) => s + (v.valor || 0), 0);
    return `<section class="c-pantalla c-pantalla-historial" aria-label="Historial">
      ${cabeza('Historial', `${fin.length} ${fin.length === 1 ? 'servicio completado' : 'servicios completados'}`)}
      <div class="c-resumen-cifras">
        <div><strong>${fin.length}</strong><small>servicios</small></div>
        <div><strong>${N.pesos(total)}</strong><small>en total</small></div>
        <div><strong>${h.length - fin.length}</strong><small>cancelados</small></div>
      </div>
      <div class="c-lista">${h.length ? h.slice(0, 40).map(filaViaje).join('') : `<div class="c-vacio c-bloque">${icono('viajes')}<strong>Sin servicios todavía</strong><span>Aquí verás cada viaje con su pasajero, valor y calificación.</span></div>`}</div>
    </section>`;
  }

  /* ---------------- Mi taxi ---------------- */
  function estadoDocumento(vence) {
    const dias = Math.ceil((new Date(`${vence}T23:59:59`) - Date.now()) / 86400000);
    if (dias < 0) return { clase: 'vencido', texto: `Vencido hace ${-dias} ${-dias === 1 ? 'día' : 'días'}`, corto: 'Vencido' };
    if (dias <= DIAS_AVISO) return { clase: 'pronto', texto: `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`, corto: 'Renueva pronto' };
    return { clase: 'ok', texto: `Faltan ${dias} días`, corto: 'Al día' };
  }

  function htmlPerfil() {
    const cd = yo();
    const docs = cd.documentos || {};
    const estados = DOCUMENTOS.map(([id]) => (docs[id] ? estadoDocumento(docs[id].vence).clase : 'ok'));
    const alertas = estados.filter((e) => e !== 'ok').length;
    return `<section class="c-pantalla c-pantalla-taxi" aria-label="Mi taxi">
      ${cabeza('Mi taxi')}
      <div class="c-mi-taxi c-borde-neon">
        <div class="c-mi-taxi-arte">${C.ilustracionTaxi('mt', { movil: cd.movil || '' })}</div>
        <div class="c-mi-taxi-datos">${C.placaHTML(cd.placa || '')}<div><strong>Móvil ${esc(cd.movil || '')}</strong><small>${esc(cd.vehiculo || E.vehiculo)} · ${esc(cd.color || E.colorTaxi)}</small></div></div>
      </div>
      <div class="c-perfil-cabeza">
        ${C.avatarHTML(cd.nombre, 'c-avatar-grande')}
        <div><h2>${esc(cd.nombre || '')}</h2><p>Asociado desde ${esc(String(cd.desde || ''))}</p>
        <span class="c-etiqueta c-etiqueta-amarilla">${icono('estrella')} ${C.calificacionTexto(cd.calificacion)} · ${Number(cd.viajes || 0).toLocaleString('es-CO')} viajes</span></div>
      </div>
      <div class="c-lista">
        <button type="button" class="c-fila-menu" data-accion="sub" data-sub="documentos">${icono('documento')}<span><strong>Documentos del vehículo</strong><small>${alertas ? `${alertas} ${alertas === 1 ? 'documento necesita' : 'documentos necesitan'} atención` : 'Todo al día'}</small></span><i class="c-semaforo-mini" data-estado="${estados.includes('vencido') ? 'vencido' : alertas ? 'pronto' : 'ok'}" aria-hidden="true"></i>${icono('chevron')}</button>
        <button type="button" class="c-fila-menu" data-accion="sub" data-sub="ajustes">${icono('ajustes')}<span><strong>Ajustes</strong><small>${C.enTaxiCun() ? 'Municipio, GPS, sonido, sala y diseño' : 'GPS, sonido, sala y diseño'}</small></span>${icono('chevron')}</button>
        ${E.telefono
          ? `<a class="c-fila-menu" href="tel:${esc(E.telefono)}">${icono('telefono')}<span><strong>Llamar a la central</strong><small>${esc(E.telefonoVisible)}${E.servicio24h ? ' · 24 horas' : ''}</small></span>${icono('chevron')}</a>`
          : `<div class="c-fila-info">${icono('telefono')}<span><strong>Teléfono de la central: pronto</strong><small>${esc(E.nombre)} lo publicará en la app</small></span></div>`}
        <a class="c-fila-menu" href="${esc(C.urlApp('pasajero'))}" data-app-pasajero>${icono('perfil')}<span><strong>App del pasajero</strong><small>Ábrela para probar un viaje completo</small></span>${icono('chevron')}</a>
        <button type="button" class="c-fila-menu c-fila-peligro" data-accion="cerrar-sesion">${icono('salir')}<span><strong>Cerrar sesión</strong><small>Te desconecta y sale del móvil ${esc(cd.movil || '')}</small></span></button>
      </div>
      ${C.pieMarcaHTML({ conDesde: false })}
    </section>`;
  }

  function htmlDocumentos() {
    const docs = yo().documentos || {};
    return `<section class="c-pantalla c-pantalla-documentos" aria-label="Documentos del vehículo">
      ${cabeza('Documentos', `Móvil ${esc(yo().movil || '')} · ${esc(yo().placa || '')}`, 'volver-taxi')}
      <div class="c-leyenda-semaforo">
        <span><i data-estado="ok"></i>Al día</span><span><i data-estado="pronto"></i>Vence en ${DIAS_AVISO} días o menos</span><span><i data-estado="vencido"></i>Vencido</span>
      </div>
      <div class="c-lista">
        ${DOCUMENTOS.map(([id, nombre, detalle]) => {
          const vence = docs[id]?.vence;
          const e = vence ? estadoDocumento(vence) : { clase: 'pronto', texto: 'Sin fecha registrada', corto: 'Revisar' };
          return `<article class="c-documento" data-estado="${e.clase}">
            <div class="c-semaforo" role="img" aria-label="Semáforo: ${e.corto}"><i data-luz="vencido"></i><i data-luz="pronto"></i><i data-luz="ok"></i></div>
            <div class="c-documento-texto"><strong>${esc(nombre)}</strong><small>${esc(detalle)}</small><span>${vence ? `Vence el ${esc(new Date(`${vence}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }))}` : ''}</span><em class="c-documento-detalle">${esc(e.texto)}</em></div>
            <span class="c-documento-estado">${esc(e.corto)}</span>
          </article>`;
        }).join('')}
      </div>
      <p class="c-nota-prueba">${icono('info')} Fechas de ejemplo. La ${E.tipo} las actualizará con los documentos reales.</p>
    </section>`;
  }

  function htmlAjustes() {
    const a = N.perfil.ajustes();
    const gps = a.gpsSimulado === true ? 'simulado' : a.gpsSimulado === false ? 'real' : 'auto';
    const d = N.perfil.disenoPreferido();
    const permiso = N.permisoNotificaciones();
    return `<section class="c-pantalla c-pantalla-ajustes" aria-label="Ajustes">
      ${cabeza('Ajustes', '', 'volver-taxi')}
      ${C.municipioHTML('conductor')}
      <h2 class="c-seccion-titulo">Ubicación</h2>
      <div class="c-fila-ajuste">${icono('mira')}<div><strong>GPS</strong><small>Ahora: <span data-gps-texto>${c.estado.gpsReal ? 'GPS real del celular' : 'GPS simulado (la demo mueve el taxi)'}</span></small>
        <div class="c-segmentado c-segmentado-chico" role="radiogroup" aria-label="Modo de GPS">
          <button type="button" role="radio" aria-checked="${gps === 'auto'}" data-accion="gps" data-modo="auto">Automático</button>
          <button type="button" role="radio" aria-checked="${gps === 'simulado'}" data-accion="gps" data-modo="simulado">Simulado</button>
          <button type="button" role="radio" aria-checked="${gps === 'real'}" data-accion="gps" data-modo="real">Real</button>
        </div></div></div>
      <h2 class="c-seccion-titulo">Avisos</h2>
      <div class="c-lista">
        <label class="c-fila-ajuste">${icono('sonido')}<div><strong>Sonido</strong><small>Tono fuerte cuando llega una solicitud.</small></div><span class="c-interruptor"><input type="checkbox" data-ajuste="sonido" ${a.sonido !== false ? 'checked' : ''}><span></span></span></label>
        <div class="c-fila-ajuste">${icono('campana')}<div><strong>Notificaciones</strong><small>${permiso === 'granted' ? 'Activadas' : permiso === 'denied' ? 'Bloqueadas en el navegador' : permiso === 'default' ? 'Sin activar' : 'No disponibles'}</small></div>${permiso === 'default' ? `<button type="button" class="c-boton c-boton-cian" data-accion="notificaciones">Activar</button>` : ''}</div>
      </div>
      <h2 class="c-seccion-titulo">Prueba en vivo</h2>
      <div class="c-lista">
        <div class="c-fila-ajuste c-fila-sala">${icono('sala')}<div><strong>Sala de prueba</strong><small>La misma sala que use el celular del pasajero.</small>
          <form class="c-sala-form" data-form-sala><label class="c-oculto-visual" for="c-sala">Nombre de la sala</label><input class="c-input" id="c-sala" value="${esc(N.salaActual())}" maxlength="24" autocapitalize="off" autocomplete="off"><button type="submit" class="c-boton c-boton-cian">Cambiar</button></form></div></div>
        <label class="c-fila-ajuste">${icono('antena')}<div><strong>Conexión en vivo</strong><small>Recibe solicitudes de otros celulares (recarga la app).</small></div><span class="c-interruptor"><input type="checkbox" data-ajuste="envivo" ${N.enVivoActivo() ? 'checked' : ''}><span></span></span></label>
      </div>
      <h2 class="c-seccion-titulo">Diseño de la app</h2>
      <div class="c-disenos" role="radiogroup" aria-label="Diseño">
        ${C.nombresDisenos()
          .map(([id, t, s]) => `<button type="button" role="radio" aria-checked="${d === id}" class="c-diseno c-diseno-${id}" data-accion="diseno" data-d="${id}"><span class="c-diseno-muestra" aria-hidden="true"></span><strong>${t}</strong><small>${s}</small></button>`)
          .join('')}
      </div>
      <h2 class="c-seccion-titulo">Acerca de</h2>
      ${C.acercaDeHTML()}
    </section>`;
  }

  function html(tab, sub) {
    if (tab === 'ganancias') return htmlGanancias();
    if (tab === 'historial') return htmlHistorial();
    if (tab === 'perfil' && sub === 'documentos') return htmlDocumentos();
    if (tab === 'perfil' && sub === 'ajustes') return htmlAjustes();
    return htmlPerfil();
  }

  function recargarCon(cambios = {}) {
    const u = new URL(location.href);
    for (const [k, v] of Object.entries(cambios)) {
      if (v == null) u.searchParams.delete(k);
      else u.searchParams.set(k, v);
    }
    location.replace(u.href);
  }

  function montar(tab, sub, contenido) {
    if (tab === 'ganancias') {
      const r = c.estado.resumen || {};
      requestAnimationFrame(() => C.fijarAnillo(contenido.querySelector('.c-anillo'), (r.ganado || 0) / ui.meta));
    }
    if (tab !== 'perfil' || sub !== 'ajustes') return;
    contenido.querySelector('[data-form-sala]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = contenido.querySelector('#c-sala').value.trim();
      if (!v) return;
      N.cambiarSala(v);
      avisar({ titulo: 'Sala cambiada', cuerpo: 'Recargando la app…', tipo: 'exito' });
      setTimeout(() => recargarCon({ sala: null }), 500);
    });
    for (const input of contenido.querySelectorAll('[data-ajuste]')) {
      input.addEventListener('change', () => {
        if (input.dataset.ajuste === 'sonido') {
          N.perfil.guardarAjustes({ sonido: input.checked });
          if (input.checked) N.sonar('solicitud');
        } else if (input.dataset.ajuste === 'envivo') {
          N.activarEnVivo(input.checked);
          avisar({ titulo: input.checked ? 'Conexión en vivo activada' : 'Solo este equipo', cuerpo: 'Recargando la app…', tipo: 'info' });
          setTimeout(() => location.reload(), 600);
        }
      });
    }
  }

  const acciones = {
    sub: (b) => irATab('perfil', b.dataset.sub),
    'volver-taxi': () => irATab('perfil'),
    meta: (b) => {
      ui.meta = Number(b.dataset.valor);
      localStorage.setItem(C.claveLocal('meta'), String(ui.meta));
      repintar();
    },
    gps: async (b) => {
      const modo = b.dataset.modo;
      for (const x of app.querySelectorAll('[data-accion="gps"]')) x.setAttribute('aria-checked', String(x === b));
      await c.usarGpsSimulado(modo === 'auto' ? null : modo === 'simulado');
      const t = app.querySelector('[data-gps-texto]');
      if (t) t.textContent = c.estado.gpsReal ? 'GPS real del celular' : 'GPS simulado (la demo mueve el taxi)';
      avisar({ titulo: c.estado.gpsReal ? 'Usando el GPS del celular' : 'GPS simulado', cuerpo: modo === 'real' && !c.estado.gpsReal ? 'No pudimos leer el GPS; seguimos con la simulación.' : '', tipo: 'info' });
    },
    notificaciones: async () => {
      const r = await N.pedirPermisoNotificaciones();
      avisar({ titulo: r === 'granted' ? 'Notificaciones activadas' : 'Notificaciones sin activar', tipo: r === 'granted' ? 'exito' : 'alerta' });
      repintar();
    },
    diseno: (b) => {
      N.perfil.elegirDiseno(b.dataset.d);
      recargarCon({ d: b.dataset.d });
    },
    'cerrar-sesion': () => {
      C.abrirHoja(app, {
        titulo: '¿Cerrar sesión?',
        contenido: `<p>Te desconectas y dejas de recibir solicitudes en este celular.</p>
          <button type="button" class="c-boton c-boton-magenta c-boton-ancho" data-accion="confirmar-cerrar-sesion">${icono('salir')} Sí, cerrar sesión</button>
          <button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-cerrar-sesion': () => {
      C.cerrarHojas(app, { todas: true });
      c.desconectar();
      N.perfil.cerrarSesionConductor();
      ui.tab = 'tablero';
      ui.sub = null;
      repintar();
    },
  };

  return { html, montar, acciones };
}
