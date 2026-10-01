// Secciones del pasajero (diseño C): Viajes, Billetera, Perfil y sus pantallas
// internas (Tarifas y rutas, Ajustes, Ayuda). Se pintan como paneles de vidrio
// sobre el mapa; las acciones se delegan con data-accion desde pasajero.js.
import * as C from './comun.js';

export function crearSecciones({ N, p, app, ui, avisar, irATab, repintar, abrirEscaner }) {
  const { icono, esc } = C;
  const E = C.empresa;
  const perfil = () => p.perfil || {};

  const cabeza = (titulo, subtitulo = '', volver = null) => `<header class="c-pantalla-cabeza${volver ? ' c-con-volver' : ''}">
    ${volver ? `<button type="button" class="c-boton-icono c-boton-icono-chico" data-accion="${volver}" aria-label="Volver">${icono('atras')}</button>` : ''}
    <h1>${titulo}${subtitulo ? `<small>${subtitulo}</small>` : ''}</h1>
    <span class="c-conexion" data-conexion></span>
  </header>`;

  /* ---------------- Viajes ---------------- */
  function filaViaje(v) {
    const fin = v.estado === 'finalizado';
    return `<article class="c-viaje-item" data-estado="${esc(v.estado)}">
      <header><span class="c-viaje-fecha">${icono('calendario')}${esc(N.fechaTexto(v.fecha))} · ${esc(N.horaTexto(v.fecha))}</span>
        <span class="c-estado-viaje c-estado-${fin ? 'ok' : 'cancelado'}">${fin ? 'Finalizado' : 'Cancelado'}</span></header>
      <div class="c-viaje-ruta">
        <span><i class="c-punto c-punto-cian"></i>${esc(v.origen?.titulo || 'Punto de recogida')}</span>
        <span><i class="c-punto c-punto-magenta"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
      </div>
      <footer>
        <strong class="c-viaje-valor">${fin ? N.pesos(v.valor) : '—'}</strong>
        <span>${fin ? (v.metodoPago === 'qr' ? `${icono('qr')} QR (prueba)` : `${icono('efectivo')} Efectivo`) : esc(v.motivo || 'Cancelado')}</span>
        ${v.conductor ? `<span>${icono('taxi')} Móvil ${esc(v.conductor.movil)} · ${esc(v.conductor.placa)}</span>` : ''}
        ${v.calificacionDada ? `<span>${C.estrellasFijas(v.calificacionDada)}</span>` : ''}
        ${v.simulado ? '<span class="c-etiqueta">Prueba</span>' : ''}
      </footer>
    </article>`;
  }

  function filaProgramado(v) {
    const t = v.tarifa || {};
    return `<article class="c-viaje-item c-programado">
      <header><span class="c-viaje-fecha">${icono('calendario')}${esc(N.fechaTexto(v.fecha))} · ${esc(N.horaTexto(v.fecha))}</span><span class="c-estado-viaje c-estado-programado">Programado</span></header>
      <div class="c-viaje-ruta">
        <span><i class="c-punto c-punto-cian"></i>${esc(v.origen?.titulo || 'Punto de recogida')}</span>
        <span><i class="c-punto c-punto-magenta"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
      </div>
      <footer>
        <strong class="c-viaje-valor">${N.pesos(t.total || 0)}</strong>
        ${t.descuento ? `<span class="c-ahorro">${icono('regalo')} Ahorras ${N.pesos(t.descuento)}</span>` : ''}
        <span>${v.metodoPago === 'efectivo' ? 'Efectivo' : 'QR (prueba)'}</span>
        <button type="button" class="c-boton-texto" data-accion="quitar-programado" data-id="${esc(v.id)}">Cancelar</button>
      </footer>
    </article>`;
  }

  function htmlViajes() {
    const historial = N.perfil.historialPasajero();
    const programados = N.perfil.viajesProgramados();
    const enHistorial = ui.viajesVista !== 'programados';
    const lista = enHistorial ? historial : programados;
    const completados = historial.filter((v) => v.estado === 'finalizado');
    const gastado = completados.reduce((s, v) => s + (v.valor || 0), 0);
    return `<section class="c-pantalla c-pantalla-viajes" aria-label="Tus viajes">
      ${cabeza('Tus viajes', `${completados.length} ${completados.length === 1 ? 'viaje completado' : 'viajes completados'}`)}
      <div class="c-resumen-cifras">
        <div><strong>${completados.length}</strong><small>viajes</small></div>
        <div><strong>${N.pesos(gastado)}</strong><small>en total</small></div>
        <div><strong>${programados.length}</strong><small>programados</small></div>
      </div>
      <div class="c-segmentado" role="tablist" aria-label="Tipo de viajes">
        <button type="button" role="tab" aria-selected="${enHistorial}" data-accion="viajes-vista" data-vista="historial">${icono('viajes')} Mis viajes</button>
        <button type="button" role="tab" aria-selected="${!enHistorial}" data-accion="viajes-vista" data-vista="programados">${icono('calendario')} Programados</button>
      </div>
      <div class="c-lista c-lista-viajes" role="tabpanel">
        ${lista.length
          ? lista.map(enHistorial ? filaViaje : filaProgramado).join('')
          : `<div class="c-vacio">${icono(enHistorial ? 'ruta' : 'calendario')}<strong>${enHistorial ? 'Aún no tienes viajes' : 'No tienes viajes programados'}</strong>
              <span>${enHistorial ? 'Cuando termines tu primer viaje lo verás aquí con su valor y su conductor.' : 'Programa con 24 h de anticipación y paga 10 % menos.'}</span>
              <button type="button" class="c-boton" data-accion="tab" data-tab="inicio">${icono('taxi')} Pedir un taxi</button></div>`}
      </div>
    </section>`;
  }

  /* ---------------- Billetera ---------------- */
  function tarjetaFidelidad() {
    const f = N.progresoFidelidad(p.viajesCompletados());
    return `<div class="c-fidelidad" aria-label="Tarjeta de fidelidad: ${f.completados} de ${f.meta} viajes">
      <div class="c-fidelidad-cabeza"><div><small>Tarjeta de fidelidad</small><strong>${esc(E.nombre)}</strong></div>${C.iconoAppHTML(40, 'fid')}</div>
      <div class="c-fidelidad-sellos">${Array.from({ length: f.meta }, (_, i) => `<span class="${i < f.completados ? 'c-lleno' : ''}">${icono('taxi')}</span>`).join('')}</div>
      <p>${f.siguienteConDescuento ? '<strong>¡Tu próximo viaje va al 50 %!</strong>' : `<strong>${f.completados} de ${f.meta}</strong> viajes · te faltan ${f.faltan} para un viaje al <strong>50 %</strong>`}</p>
    </div>`;
  }

  function htmlBilletera() {
    const pagos = N.perfil.historialPasajero().filter((v) => v.estado === 'finalizado' && v.metodoPago === 'qr');
    const total = pagos.reduce((s, v) => s + (v.valor || 0), 0);
    return `<section class="c-pantalla c-pantalla-billetera" aria-label="Billetera">
      ${cabeza('Billetera', 'Pagos con QR de prueba y promociones')}
      ${tarjetaFidelidad()}
      <button type="button" class="c-escanear-grande" data-accion="escanear-billetera">
        <span class="c-escanear-ico">${icono('qr')}</span>
        <span><strong>Escanear QR</strong><small>Paga el cobro del conductor o lee un sticker</small></span>
        ${icono('chevron')}
      </button>
      <h2 class="c-seccion-titulo">Promociones</h2>
      <div class="c-promos">
        <div class="c-promo c-promo-cian">${icono('calendario')}<div><strong>10 % menos</strong><small>Programa tu viaje con 24 h de anticipación.</small></div></div>
        <div class="c-promo c-promo-magenta">${icono('regalo')}<div><strong>Viaje al 50 %</strong><small>Cada 10 viajes, el siguiente va a mitad de precio.</small></div></div>
      </div>
      <h2 class="c-seccion-titulo">Pagos con QR <span class="c-etiqueta">Prueba</span></h2>
      ${pagos.length
        ? `<div class="c-bloque c-pagos">
            <div class="c-pagos-total"><small>Total pagado con QR (prueba)</small><strong>${N.pesos(total)}</strong></div>
            ${pagos.slice(0, 12).map((v) => `<div class="c-pago-fila"><span class="c-pago-ico">${icono('qr')}</span><div><strong>${esc(v.destino?.titulo || 'Viaje')}</strong><small>${esc(N.fechaTexto(v.fecha))} · Móvil ${esc(v.conductor?.movil || '—')}</small></div><strong>${N.pesos(v.valor)}</strong></div>`).join('')}
          </div>`
        : `<div class="c-vacio c-bloque">${icono('billetera')}<strong>Sin pagos todavía</strong><span>Cuando pagues un viaje con QR (prueba) aparecerá aquí.</span></div>`}
      <h2 class="c-seccion-titulo">Billeteras para la prueba</h2>
      <div class="c-billeteras c-billeteras-lista">${N.BILLETERAS.map((b) => `<div class="c-billetera c-billetera-fija" style="--marca:${b.color}"><span class="c-billetera-insignia" aria-hidden="true">${esc(b.nombre.slice(0, 1))}</span><strong>${esc(b.nombre)}</strong><small>Simulada</small></div>`).join('')}</div>
      <p class="c-nota-prueba">${icono('info')} Por ahora le pagas al conductor. El pago con QR es una prueba: no se mueve dinero real.</p>
    </section>`;
  }

  /* ---------------- Perfil ---------------- */
  function htmlPerfil() {
    const yo = perfil();
    const completados = p.viajesCompletados();
    const g = N.perfil.lugaresGuardados();
    const fila = (accion, ico, titulo, sub, extra = '') => `<button type="button" class="c-fila-menu" data-accion="${accion}" ${extra}>${icono(ico)}<span><strong>${titulo}</strong><small>${sub}</small></span>${icono('chevron')}</button>`;
    return `<section class="c-pantalla c-pantalla-perfil" aria-label="Perfil">
      ${cabeza('Perfil')}
      <div class="c-perfil-cabeza">
        ${C.avatarHTML(yo.nombre, 'c-avatar-grande')}
        <div><h2>${esc(yo.nombre || '')}</h2><p>+57 ${esc(C.formatoCelular(yo.celular || ''))}</p>
        <span class="c-etiqueta c-etiqueta-cian">${icono('check')} Celular verificado</span></div>
      </div>
      <div class="c-resumen-cifras">
        <div><strong>${completados}</strong><small>viajes</small></div>
        <div><strong>${icono('estrella', 'c-ico-estrella')} ${C.calificacionTexto(yo.calificacion || 5)}</strong><small>tu calificación</small></div>
        <div><strong>${(g.casa ? 1 : 0) + (g.trabajo ? 1 : 0)}</strong><small>lugares</small></div>
      </div>
      <div class="c-lista">
        ${fila('sub', 'tarifa', 'Tarifas y rutas', 'Valores de ejemplo y rutas fijas', 'data-sub="tarifas"')}
        ${fila('tab', 'regalo', 'Promociones y fidelidad', '10 % programando · cada 10 viajes, uno al 50 %', 'data-tab="billetera"')}
        ${fila('sub', 'ajustes', 'Ajustes', C.enTaxiCun() ? 'Municipio, diseño, sala, simulación, sonido' : 'Diseño, sala, simulación, sonido, instalar', 'data-sub="ajustes"')}
        ${fila('sub', 'ayuda', 'Ayuda y central', E.telefono ? `Llama o escribe al ${esc(E.telefonoVisible)}` : E.whatsapp ? 'Escríbenos por WhatsApp' : `Preguntas frecuentes y datos de la ${E.tipo}`, 'data-sub="ayuda"')}
        <a class="c-fila-menu" href="${esc(C.urlApp('conductor'))}" data-soy-conductor>${icono('volante')}<span><strong>Soy conductor</strong><small>Abrir la app de los conductores</small></span>${icono('chevron')}</a>
        <button type="button" class="c-fila-menu c-fila-peligro" data-accion="cerrar-sesion">${icono('salir')}<span><strong>Cerrar sesión</strong><small>Tu nombre y tu celular se borran de este equipo</small></span></button>
      </div>
      ${C.pieMarcaHTML()}
    </section>`;
  }

  function htmlTarifas() {
    const T = N.TARIFAS;
    return `<section class="c-pantalla c-pantalla-tarifas" aria-label="Tarifas y rutas">
      ${cabeza('Tarifas y rutas', 'Para que sepas cuánto pagas antes de subir', 'volver-perfil')}
      <div class="c-aviso-ejemplo">${icono('info')}<span><strong>Valores de ejemplo.</strong> La ${E.tipo} publicará las tarifas oficiales.</span></div>
      <h2 class="c-seccion-titulo">${E.pueblo ? `Dentro de ${esc(E.pueblo)}` : 'Dentro del municipio'}</h2>
      <div class="c-reglas">
        <div class="c-regla"><small>Carrera mínima</small><strong>${N.pesos(T.minimaUrbana)}</strong></div>
        <div class="c-regla"><small>Banderazo</small><strong>${N.pesos(T.banderazo)}</strong></div>
        <div class="c-regla"><small>Por kilómetro</small><strong>${N.pesos(T.porKm)}</strong></div>
        <div class="c-regla"><small>Recargo nocturno <span>(${T.nocheDesde}:00 a ${String(T.nocheHasta - 1).padStart(2, '0')}:59)</span></small><strong>+${N.pesos(T.recargoNocturno)}</strong></div>
        <div class="c-regla"><small>Domingos y festivos</small><strong>+${N.pesos(T.recargoDominical)}</strong></div>
        <div class="c-regla c-regla-promo"><small>Programando con ${T.horasAnticipacion} h</small><strong>−${Math.round(T.descuentoProgramado * 100)} %</strong></div>
        <div class="c-regla c-regla-promo"><small>Cada ${T.viajesFidelidad} viajes, el siguiente</small><strong>−${Math.round(T.descuentoFidelidad * 100)} %</strong></div>
      </div>
      <h2 class="c-seccion-titulo">Rutas con tarifa fija${E.pueblo ? ` desde ${esc(E.pueblo)}` : ''}</h2>
      <div class="c-bloque">
        <table class="c-tabla">
          <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Valor</th></tr></thead>
          <tbody>${N.RUTAS.map((r) => `<tr><td>${esc(r.destino)}<small class="c-tabla-sub">${N.minutosTexto(r.min)} aprox.</small></td><td>${r.km} km</td><td><strong>${N.pesos(r.valor)}</strong></td></tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="c-nota-prueba">${icono('info')} Los descuentos no se acumulan: se aplica el mayor.</p>
    </section>`;
  }

  function htmlAjustes() {
    const a = N.perfil.ajustes();
    const d = N.perfil.disenoElegido();
    const permiso = N.permisoNotificaciones();
    const textoPermiso = { granted: 'Activadas', denied: 'Bloqueadas en el navegador', default: 'Sin activar', 'no-soportado': 'Este navegador no las permite' }[permiso] || permiso;
    const contacto = perfil().contactoEmergencia || {};
    const instalada = N.yaInstalada();
    return `<section class="c-pantalla c-pantalla-ajustes" aria-label="Ajustes">
      ${cabeza('Ajustes', '', 'volver-perfil')}
      ${C.municipioHTML('pasajero')}
      <h2 class="c-seccion-titulo">Diseño de la app</h2>
      <div class="c-disenos" role="radiogroup" aria-label="Diseño">
        ${C.nombresDisenos()
          .map(([id, t, s]) => `<button type="button" role="radio" aria-checked="${d === id}" class="c-diseno c-diseno-${id}" data-accion="diseno" data-d="${id}"><span class="c-diseno-muestra" aria-hidden="true"></span><strong>${t}</strong><small>${s}</small></button>`)
          .join('')}
      </div>
      <h2 class="c-seccion-titulo">Prueba en vivo</h2>
      <div class="c-lista">
        <div class="c-fila-ajuste c-fila-sala">${icono('sala')}<div><strong>Sala de prueba</strong><small>Usa la misma sala en el celular del pasajero y en el del conductor.</small>
          <form class="c-sala-form" data-form-sala><label class="c-oculto-visual" for="c-sala">Nombre de la sala</label><input class="c-input" id="c-sala" value="${esc(N.salaActual())}" maxlength="24" autocapitalize="off" autocomplete="off"><button type="submit" class="c-boton c-boton-cian">Cambiar</button></form></div></div>
        <div class="c-fila-ajuste">${icono('taxi')}<div><strong>Conductores</strong><small>Si nadie acepta, entra un conductor de prueba.</small>
          <div class="c-segmentado c-segmentado-chico" role="radiogroup" aria-label="Simulación">
            <button type="button" role="radio" aria-checked="${a.simulacion !== 'real'}" data-accion="simulacion" data-modo="auto">Automática</button>
            <button type="button" role="radio" aria-checked="${a.simulacion === 'real'}" data-accion="simulacion" data-modo="real">Solo conductores reales</button>
          </div></div></div>
        <label class="c-fila-ajuste">${icono('antena')}<div><strong>Conexión en vivo</strong><small>Conecta celulares distintos por internet (recarga la app).</small></div><span class="c-interruptor"><input type="checkbox" data-ajuste="envivo" ${N.enVivoActivo() ? 'checked' : ''}><span></span></span></label>
      </div>
      <h2 class="c-seccion-titulo">Avisos</h2>
      <div class="c-lista">
        <label class="c-fila-ajuste">${icono('sonido')}<div><strong>Sonido</strong><small>Tonos cuando el taxi acepta, llega y termina.</small></div><span class="c-interruptor"><input type="checkbox" data-ajuste="sonido" ${a.sonido !== false ? 'checked' : ''}><span></span></span></label>
        <div class="c-fila-ajuste">${icono('campana')}<div><strong>Notificaciones</strong><small>${esc(textoPermiso)}</small></div>${permiso === 'default' ? `<button type="button" class="c-boton c-boton-cian" data-accion="notificaciones">Activar</button>` : ''}</div>
      </div>
      <h2 class="c-seccion-titulo">Seguridad</h2>
      <form class="c-bloque c-contacto-form" data-form-contacto>
        <p class="c-muted">Contacto de emergencia para el botón SOS y para compartir tu viaje.</p>
        <label class="c-campo-etiqueta">Nombre<input class="c-input" id="c-cont-nombre" value="${esc(contacto.nombre || '')}" placeholder="Ej.: Mamá"></label>
        <label class="c-campo-etiqueta">Celular<span class="c-input-prefijo"><span>+57</span><input class="c-input" id="c-cont-cel" type="tel" inputmode="numeric" value="${esc(contacto.celular || '')}" placeholder="300 765 4321"></span></label>
        <button type="submit" class="c-boton c-boton-fantasma">Guardar contacto</button>
      </form>
      <h2 class="c-seccion-titulo">App</h2>
      <div class="c-lista">
        <div class="c-fila-ajuste">${icono('instalar')}<div><strong>Instalar la app</strong><small>${instalada ? 'Ya está instalada en este celular.' : 'Tenla en tu pantalla de inicio, como una app.'}</small></div>${instalada ? '' : `<button type="button" class="c-boton" data-accion="instalar">Instalar</button>`}</div>
      </div>
      <h2 class="c-seccion-titulo">Acerca de</h2>
      ${C.acercaDeHTML()}
    </section>`;
  }

  function htmlAyuda() {
    // Oficina: el lugar de la ficha, sus coordenadas o, si no hay, la dirección escrita.
    const oficina = N.LUGARES.find((l) => l.id === 'oficina') || (N.EMPRESA?.oficina?.lat ? N.EMPRESA.oficina : null);
    const enlaceOficina = oficina ? N.enlaceNavegacion(oficina) : E.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(E.direccion)}` : '';
    const privacidad = C.urlPrivacidad();
    const preguntas = [
      ['¿Cómo sé que es mi taxi?', 'En la app ves el número de móvil, la placa, el nombre y la calificación del conductor. Antes de subir dile tu código de abordaje de 4 dígitos: si el conductor lo confirma, es tu taxi.'],
      ['¿Cómo pago?', 'Por ahora le pagas al conductor en efectivo o con QR. El pago con QR de la app es una prueba y no mueve dinero real.'],
      ['¿Puedo programar un viaje?', 'Sí. Si lo programas con 24 horas de anticipación te descontamos el 10 %.'],
      ['¿Qué hago en una emergencia?', `Toca SOS durante el viaje: puedes llamar al 123${E.telefono ? ', a la central' : ''} o avisarle a tu contacto de emergencia.`],
    ];
    const central = E.telefono
      ? `<div><small>Central ${esc(E.nombre)}</small><strong>${esc(E.telefonoVisible)}</strong>${E.servicio24h ? '<span>Servicio 24 horas</span>' : ''}</div>
        <div class="c-central-botones${E.whatsapp ? '' : ' c-central-uno'}">
          <a class="c-boton" href="tel:${esc(E.telefono)}">${icono('telefono')} Llamar</a>
          ${E.whatsapp ? `<a class="c-boton c-boton-cian" href="${esc(N.enlaceWhatsApp(E.whatsapp, `Hola, ${E.nombre}. Necesito ayuda con la app.`))}" target="_blank" rel="noopener">${icono('chat')} WhatsApp</a>` : ''}
        </div>`
      : `<div><small>Central ${esc(E.nombre)}</small><strong class="c-central-pronto">Teléfono de la central: pronto</strong><span>Mientras tanto, pide tu taxi desde la app${E.servicio24h ? ', las 24 horas' : ''}.</span></div>
        ${E.whatsapp ? `<div class="c-central-botones c-central-uno"><a class="c-boton c-boton-cian" href="${esc(N.enlaceWhatsApp(E.whatsapp, `Hola, ${E.nombre}. Necesito ayuda con la app.`))}" target="_blank" rel="noopener">${icono('chat')} WhatsApp</a></div>` : ''}`;
    const filas = [
      E.correo ? `<a class="c-fila-menu" href="mailto:${esc(E.correo)}">${icono('nota')}<span><strong>Correo</strong><small>${esc(E.correo)}</small></span>${icono('chevron')}</a>` : '',
      E.direccion && enlaceOficina ? `<a class="c-fila-menu" href="${esc(enlaceOficina)}" target="_blank" rel="noopener">${icono('pin')}<span><strong>Oficina</strong><small>${esc(E.direccion)}</small></span>${icono('chevron')}</a>` : '',
      E.sitioOficial ? `<a class="c-fila-menu" href="${esc(E.sitioOficial)}" target="_blank" rel="noopener">${icono('info')}<span><strong>Página oficial de la ${E.tipo}</strong><small>${esc(E.sitioOficial.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</small></span>${icono('chevron')}</a>` : '',
    ].filter(Boolean);
    return `<section class="c-pantalla c-pantalla-ayuda" aria-label="Ayuda">
      ${cabeza('Ayuda', E.servicio24h ? 'Estamos contigo las 24 horas' : 'Estamos para ayudarte', 'volver-perfil')}
      <div class="c-central c-borde-neon">${central}</div>
      ${filas.length ? `<div class="c-lista">${filas.join('')}</div>` : ''}
      <h2 class="c-seccion-titulo">Preguntas frecuentes</h2>
      <div class="c-lista">${preguntas.map(([q, r]) => `<details class="c-pregunta"><summary>${esc(q)}${icono('abajo')}</summary><p>${esc(r)}</p></details>`).join('')}</div>
      <p class="c-pie-marca">${privacidad ? `<a href="${esc(privacidad)}">Política de privacidad</a>` : 'Política de privacidad: en preparación'}<br>${C.pieTaxiCunHTML()}</p>
    </section>`;
  }

  function html(tab, sub) {
    if (tab === 'viajes') return htmlViajes();
    if (tab === 'billetera') return htmlBilletera();
    if (tab === 'perfil' && sub === 'tarifas') return htmlTarifas();
    if (tab === 'perfil' && sub === 'ajustes') return htmlAjustes();
    if (tab === 'perfil' && sub === 'ayuda') return htmlAyuda();
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
    if (tab !== 'perfil' || sub !== 'ajustes') return;
    C.montarCelular(contenido.querySelector('#c-cont-cel'));
    contenido.querySelector('[data-form-sala]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = contenido.querySelector('#c-sala').value.trim();
      if (!v) return;
      N.cambiarSala(v);
      avisar({ titulo: 'Sala cambiada', cuerpo: 'Recargando la app…', tipo: 'exito' });
      setTimeout(() => recargarCon({ sala: null }), 500);
    });
    contenido.querySelector('[data-form-contacto]')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = contenido.querySelector('#c-cont-nombre').value.trim();
      const celular = C.soloCelular(contenido.querySelector('#c-cont-cel').value);
      if (celular && !/^3\d{9}$/.test(celular)) return avisar({ titulo: 'Revisa el celular', cuerpo: 'Debe tener 10 dígitos y empezar por 3.', tipo: 'error' });
      N.perfil.registrarPasajero({ contactoEmergencia: celular ? { nombre: nombre || 'Contacto de emergencia', celular } : null });
      avisar({ titulo: 'Contacto guardado', cuerpo: celular ? `${nombre || 'Tu contacto'} · ${C.formatoCelular(celular)}` : 'Sin contacto de emergencia', tipo: 'exito' });
    });
    for (const input of contenido.querySelectorAll('[data-ajuste]')) {
      input.addEventListener('change', () => {
        if (input.dataset.ajuste === 'sonido') {
          N.perfil.guardarAjustes({ sonido: input.checked });
          if (input.checked) N.sonar('exito');
        } else if (input.dataset.ajuste === 'envivo') {
          N.activarEnVivo(input.checked);
          avisar({ titulo: input.checked ? 'Conexión en vivo activada' : 'Solo este equipo', cuerpo: 'Recargando la app…', tipo: 'info' });
          setTimeout(() => location.reload(), 600);
        }
      });
    }
  }

  const acciones = {
    sub: (b) => irATab(ui.tab, b.dataset.sub),
    'volver-perfil': () => irATab('perfil'),
    'viajes-vista': (b) => {
      ui.viajesVista = b.dataset.vista;
      repintar();
    },
    'quitar-programado': (b) => {
      N.perfil.quitarProgramado(b.dataset.id);
      avisar({ titulo: 'Viaje programado cancelado', tipo: 'info' });
      repintar();
    },
    'escanear-billetera': () => abrirEscaner('billetera'),
    diseno: (b) => {
      const d = b.dataset.d;
      N.perfil.elegirDiseno(d);
      recargarCon({ d });
    },
    simulacion: (b) => {
      N.perfil.guardarAjustes({ simulacion: b.dataset.modo });
      for (const x of app.querySelectorAll('[data-accion="simulacion"]')) x.setAttribute('aria-checked', String(x === b));
      avisar({ titulo: b.dataset.modo === 'real' ? 'Solo conductores reales' : 'Simulación automática', cuerpo: b.dataset.modo === 'real' ? 'Esperaremos a que un conductor de la sala acepte.' : 'Si nadie acepta en unos segundos, entra un conductor de prueba.', tipo: 'info' });
    },
    notificaciones: async () => {
      const r = await N.pedirPermisoNotificaciones();
      avisar({ titulo: r === 'granted' ? 'Notificaciones activadas' : 'Notificaciones sin activar', cuerpo: r === 'granted' ? 'Te avisaremos aunque la app esté en segundo plano.' : 'Puedes activarlas en los ajustes del navegador.', tipo: r === 'granted' ? 'exito' : 'alerta' });
      repintar();
    },
    instalar: async () => {
      const r = await N.instalar();
      if (r === 'aceptada') return avisar({ titulo: '¡App instalada!', cuerpo: 'Búscala en tu pantalla de inicio.', tipo: 'exito' });
      if (r === 'rechazada') return;
      C.abrirHoja(app, {
        titulo: 'Instalar la app',
        contenido: `<ol class="c-pasos-instalar">${N.instruccionesInstalacion().map((paso) => `<li>${esc(paso)}</li>`).join('')}</ol><button type="button" class="c-boton c-boton-ancho" data-cerrar-hoja>Entendido</button>`,
      });
    },
    'cerrar-sesion': () => {
      C.abrirHoja(app, {
        titulo: '¿Cerrar sesión?',
        contenido: `<p>Se borrarán tu nombre y tu celular de este equipo. Tu historial se conserva.</p>
          <button type="button" class="c-boton c-boton-magenta c-boton-ancho" data-accion="confirmar-cerrar-sesion">${icono('salir')} Sí, cerrar sesión</button>
          <button type="button" class="c-boton c-boton-fantasma c-boton-ancho" data-cerrar-hoja>Volver</button>`,
      });
    },
    'confirmar-cerrar-sesion': () => {
      C.cerrarHojas(app, { todas: true });
      N.perfil.cerrarSesionPasajero();
      irATab('inicio');
    },
  };

  return { html, montar, acciones };
}
