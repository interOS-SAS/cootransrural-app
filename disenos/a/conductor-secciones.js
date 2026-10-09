// Secciones del menú del conductor: Ganancias, Historial, Documentos, Mi taxi,
// Ajustes y la lista de avisos.
//
// Modo real (servidor taxicun.com/api; ctx.real lo pasa conductor.js): sin QR ni
// documentos de ejemplo, sin GPS simulado, sala ni relés; calificación y viajes solo
// si los manda la central; en Ajustes, «Tu cuenta» con Cerrar sesión y Eliminar mi
// cuenta. En la app nativa (ctx.nativa), sin «Instalar» ni «Cambiar de municipio».
// Con el plugin UbicacionTurno, «Ubicación con la app minimizada» (activa / solo durante los
// viajes / apagada) y, en Android, cómo evitar que el teléfono cierre la app.
import { el, esc, icono, abrirPanel, chipPrueba, decimal, placa, franjaCuadros, celularTexto } from './ui.js';
import { ilustracionVacia, taxiLateral } from './ilustraciones.js';
import { bloqueSala, bloqueSonidoYAvisos, bloqueConexion, bloqueInstalar, bloqueAcerca, bloqueMunicipio, bloqueSeguridad, interruptor } from './ajustes-comunes.js';
import { ofrecerSegundoPlano } from './nativa.js';
import { seccionBandeja } from './central.js';
import * as EM from './empresa.js';

// Colores validados para las dos categorías (QR / efectivo) sobre fondo claro.
const COLOR_QR = '#1E7B4A';
const COLOR_EFECTIVO = '#E39A00';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function gananciasPorDia(N, dias = 7) {
  const hist = N.perfil.historialConductor().filter((v) => v.estado === 'finalizado');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const lista = [];
  for (let i = dias - 1; i >= 0; i--) {
    const inicio = new Date(hoy);
    inicio.setDate(hoy.getDate() - i);
    const fin = new Date(inicio);
    fin.setDate(inicio.getDate() + 1);
    const delDia = hist.filter((v) => (v.fin || v.fecha) >= inicio.getTime() && (v.fin || v.fecha) < fin.getTime());
    lista.push({ fecha: inicio, total: delDia.reduce((s, v) => s + (v.valor || 0), 0), viajes: delDia.length, hoy: i === 0 });
  }
  return lista;
}

// Calificación del conductor en modo real: el promedio que manda la central (nunca
// las estrellas de un pasajero en particular). '' si no viene.
function calificacionReal(yo) {
  const cal = Number(yo?.calificacion);
  return cal > 0 ? decimal(cal) : '';
}

export function abrirGanancias({ N, app, real = false, yo = null }) {
  abrirPanel(app, {
    titulo: 'Ganancias',
    construir(cuerpo) {
      const r = N.perfil.resumenDelDia();
      const total = r.ganado || 0;
      const pQR = total ? Math.round((r.porQR / total) * 100) : 0;
      const semana = gananciasPorDia(N);
      const max = Math.max(1, ...semana.map((d) => d.total));
      const cal = real ? calificacionReal(yo || N.perfil.conductor()) : '';
      cuerpo.innerHTML = `
        <section class="a-ganancias-hero">
          ${franjaCuadros()}
          <small>Hoy, ${esc(N.fechaTexto(Date.now()))}</small>
          <strong>${N.pesos(total)}</strong>
          <span>${r.viajes} ${r.viajes === 1 ? 'viaje completado' : 'viajes completados'}</span>
        </section>
        <div class="a-kpis a-kpis-claros">
          <span><strong>${r.viajes}</strong><small>viajes</small></span>
          <span><strong>${r.viajes ? N.pesos(total / r.viajes) : '—'}</strong><small>por viaje</small></span>
          <span><strong>${real ? (cal ? `${cal} ★` : '—') : r.promedio ? `${decimal(r.promedio)} ★` : '—'}</strong><small>calificación</small></span>
        </div>
        <section class="a-grupo"><h3>¿Cómo te pagaron hoy?</h3>
          <div class="a-tarjeta-blanca">
            ${total ? `<div class="a-barra-apilada" role="img" aria-label="${real ? `Efectivo ${N.pesos(r.efectivo)}` : `QR ${N.pesos(r.porQR)} (${pQR} %), efectivo ${N.pesos(r.efectivo)} (${100 - pQR} %)`}">
              ${r.porQR ? `<span style="flex:${r.porQR};background:${COLOR_QR}"></span>` : ''}
              ${r.efectivo ? `<span style="flex:${r.efectivo};background:${COLOR_EFECTIVO}"></span>` : ''}
            </div>` : '<div class="a-barra-apilada a-vacia"></div>'}
            <ul class="a-leyenda">
              ${real ? '' : `<li><i style="background:${COLOR_QR}"></i><span>QR (prueba)</span><b>${N.pesos(r.porQR)}</b><small>${pQR} %</small></li>`}
              <li><i style="background:${COLOR_EFECTIVO}"></i><span>Efectivo</span><b>${N.pesos(r.efectivo)}</b><small>${total ? 100 - pQR : 0} %</small></li>
            </ul>
          </div>
        </section>
        <section class="a-grupo"><h3>Últimos 7 días</h3>
          <div class="a-tarjeta-blanca">
            <div class="a-semana" role="img" aria-label="Ganancias por día de los últimos 7 días">
              ${semana.map((d) => `<div class="a-semana-dia ${d.hoy ? 'a-hoy-dia' : ''}" title="${esc(`${DIAS[d.fecha.getDay()]} ${d.fecha.getDate()}: ${N.pesos(d.total)} · ${d.viajes} viajes`)}">
                <span class="a-semana-valor">${d.hoy && d.total ? esc(N.pesos(d.total)) : ''}</span>
                <span class="a-semana-barra" style="height:${Math.max(d.total ? 6 : 2, (d.total / max) * 100)}%"></span>
                <small>${d.hoy ? 'hoy' : DIAS[d.fecha.getDay()]}</small>
              </div>`).join('')}
            </div>
            <table class="a-solo-lector"><caption>Ganancias por día</caption><thead><tr><th>Día</th><th>Total</th><th>Viajes</th></tr></thead><tbody>
              ${semana.map((d) => `<tr><td>${esc(N.fechaTexto(d.fecha))}</td><td>${N.pesos(d.total)}</td><td>${d.viajes}</td></tr>`).join('')}
            </tbody></table>
          </div>
        </section>
        ${real
          ? `<p class="a-ayuda-txt">${icono('info', { tam: 14 })} Cuentas de los servicios que hiciste con este celular.</p>`
          : `<p class="a-ayuda-txt">${chipPrueba('MODO PRUEBA')} Los pagos con QR de esta demo son de prueba: no se mueve dinero.</p>`}`;
    },
  });
}

export function abrirHistorial({ N, app, real = false }) {
  abrirPanel(app, {
    titulo: 'Historial',
    construir(cuerpo) {
      const hist = N.perfil.historialConductor();
      if (!hist.length) {
        cuerpo.innerHTML = ilustracionVacia(real ? 'Aún no tienes servicios. Conéctate para empezar a recibirlos.' : 'Aún no tienes servicios. Conéctate o toca «Simular solicitud» para probar.');
        return;
      }
      cuerpo.innerHTML = `<ul class="a-viajes" data-historial>${hist.map((v) => `
        <li class="a-viaje">
          <div class="a-viaje-cabeza">
            <span class="a-viaje-fecha">${icono('calendario', { tam: 15 })} ${esc(N.fechaTexto(v.fecha))} · ${esc(N.horaTexto(v.fecha))}</span>
            <span class="a-estado ${v.estado === 'finalizado' ? 'a-ok' : 'a-mal'}">${v.estado === 'finalizado' ? 'Finalizado' : 'Cancelado'}</span>
          </div>
          <div class="a-viaje-ruta">
            <span><i class="a-punto a-punto-verde"></i>${esc(v.origen?.titulo || 'Origen')}</span>
            <span><i class="a-punto a-punto-negro"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
          </div>
          <div class="a-viaje-pie">
            <span>${icono('usuario', { tam: 14 })} ${esc(v.pasajero || 'Pasajero')}${v.km && v.estado !== 'cancelado' ? ` · ${esc(N.kmTexto(v.km))}` : ''}</span>
            <strong>${v.estado === 'finalizado' ? N.pesos(v.valor) : '—'}</strong>
          </div>
          <div class="a-viaje-extra">
            <span>${icono(!real && v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 14 })} ${!real && v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}</span>
            ${!real && v.calificacionRecibida ? `<span>Te calificó <span class="a-viaje-cal">${'★'.repeat(v.calificacionRecibida)}</span></span>` : ''}
            ${v.motivo ? `<span>${esc(v.motivo)}</span>` : ''}
            ${v.simulado ? chipPrueba('SIMULADO') : ''}
          </div>
        </li>`).join('')}</ul>`;
    },
  });
}

const DOCUMENTOS = {
  soat: 'SOAT',
  tecnomecanica: 'Revisión técnico-mecánica',
  licencia: 'Licencia de conducción',
  tarjetaControl: 'Tarjeta de control',
};

export function abrirDocumentos({ N, app, real = false }) {
  abrirPanel(app, {
    titulo: 'Documentos del vehículo',
    construir(cuerpo) {
      // En modo real no hay documentos de ejemplo (el menú ni muestra esta sección).
      if (real) {
        cuerpo.innerHTML = ilustracionVacia(`${EM.NOMBRE} revisa tus documentos al aprobar tu registro.`);
        return;
      }
      const yo = N.perfil.conductor();
      const docs = Object.entries(yo?.documentos || {});
      const hoy = Date.now();
      const filas = docs.map(([k, d]) => {
        const vence = new Date(`${d.vence}T23:59:59`);
        const dias = Math.ceil((vence - hoy) / 86400000);
        const estado = dias < 0 ? { clase: 'a-mal', texto: 'Vencido', ico: 'alerta' } : dias <= 60 ? { clase: 'a-medio', texto: `Vence en ${dias} días`, ico: 'reloj' } : { clase: 'a-ok', texto: 'Al día', ico: 'check' };
        return { k, vence, dias, estado };
      });
      const malos = filas.filter((f) => f.estado.clase !== 'a-ok').length;
      cuerpo.innerHTML = `
        <div class="a-docs-resumen ${malos ? 'a-docs-alerta' : ''}">
          ${icono(malos ? 'alerta' : 'escudo', { tam: 28 })}
          <span><strong>${malos ? `${malos} ${malos === 1 ? 'documento requiere' : 'documentos requieren'} atención` : 'Todo al día'}</strong><small>Móvil ${esc(yo?.movil || '')} · ${esc(yo?.placa || '')}</small></span>
        </div>
        <ul class="a-docs">${filas.map((f) => `
          <li class="a-doc">
            <span class="a-semaforo ${f.estado.clase}" aria-hidden="true">${icono(f.estado.ico, { tam: 18, grosor: 2.6 })}</span>
            <span class="a-doc-txt"><strong>${esc(DOCUMENTOS[f.k] || f.k)}</strong><small>Vence el ${esc(f.vence.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }))}</small></span>
            <span class="a-estado ${f.estado.clase}">${esc(f.estado.texto)}</span>
          </li>`).join('')}</ul>
        <p class="a-ayuda-txt">${icono('info', { tam: 14 })} Fechas de ejemplo. Verde: al día · Ámbar: vence en 60 días o menos · Rojo: vencido.</p>`;
    },
  });
}

export function abrirMiTaxi({ N, app, real = false, yo: yoCtx = null }) {
  abrirPanel(app, {
    titulo: 'Mi taxi',
    construir(cuerpo) {
      // En modo real, antes de la bienvenida de la central, sirven los datos de la cuenta.
      const yo = N.perfil.conductor() || (real ? yoCtx : null);
      if (!yo) return;
      // Modo real: sin sticker por ahora. Su QR abre la página de descarga y de ahí la web
      // sin ?real=1 (la demo), y el servidor no registra por qué móvil llegó cada pasajero.
      const url = real ? '' : N.urlDescarga({ movil: yo.movil });
      // Modo real: calificación y viajes solo si la central los manda.
      const cal = real ? calificacionReal(yo) : '';
      const lineaReal = EM.unir([cal, Number(yo.viajes) > 0 ? `${Number(yo.viajes).toLocaleString('es-CO')} viajes` : '']);
      cuerpo.innerHTML = `
        <section class="a-mi-taxi">
          <div class="a-mi-taxi-arte">${taxiLateral({ ancho: 250, movil: yo.movil })}</div>
          ${placa(yo.placa)}
          <h3>${esc(yo.nombre)}</h3>
          ${real
            ? lineaReal ? `<p>${cal ? icono('estrella', { tam: 15 }) : ''} ${esc(lineaReal)}</p>` : ''
            : `<p>${icono('estrella', { tam: 15 })} ${esc(EM.unir([decimal(yo.calificacion), `${Number(yo.viajes || 0).toLocaleString('es-CO')} viajes`, Number(yo.desde) > 1900 ? `asociado desde ${yo.desde}` : '']))}</p>`}
        </section>
        <div class="a-reglas">
          <div class="a-regla"><small>Móvil</small><strong>${esc(yo.movil)}</strong></div>
          <div class="a-regla"><small>Placa</small><strong>${esc(yo.placa)}</strong></div>
          <div class="a-regla"><small>Vehículo</small><strong>${esc(yo.vehiculo)}</strong></div>
          <div class="a-regla"><small>Color</small><strong>${esc(yo.color)}</strong></div>
        </div>
        ${real ? '' : `<section class="a-grupo"><h3>Tu sticker con QR</h3>
          <div class="a-sticker">
            <div class="a-sticker-qr">${N.qrSVG(url, { redondeado: true })}</div>
            <span><strong>Va en las dos puertas traseras</strong><small>${esc(`Quien lo escanea descarga la app de ${EM.NOMBRE} y queda registrado que llegó por el móvil ${yo.movil}.`)}</small></span>
          </div>
        </section>`}`;
    },
  });
}

// «Tu cuenta» (modo real): correo, nombre y celular de la cuenta; Cerrar sesión y
// Eliminar mi cuenta (las dos piden confirmación en conductor.js).
function bloqueCuenta({ cuenta, yo, cerrarSesion, eliminarCuenta, alSalir }) {
  const u = cuenta?.usuario || {};
  const nombre = u.nombre || yo?.nombre || '';
  const s = el(`<section class="a-grupo a-cuenta-conductor" data-cuenta><h3>Tu cuenta</h3>
    <div class="a-reglas">
      ${u.correo ? `<div class="a-regla a-regla-ancha"><small>Correo</small><strong>${esc(u.correo)}</strong></div>` : ''}
      ${nombre ? `<div class="a-regla a-regla-ancha"><small>Nombre</small><strong>${esc(nombre)}</strong></div>` : ''}
      ${u.celular ? `<div class="a-regla"><small>Celular</small><strong>${esc(celularTexto(u.celular))}</strong></div>` : ''}
      ${yo?.movil ? `<div class="a-regla"><small>Móvil</small><strong>${esc(yo.movil)}</strong></div>` : ''}
    </div>
    <div class="a-cuenta-acciones">
      <button type="button" class="a-btn a-btn-suave" data-salir>${icono('salir', { tam: 20 })}<span>Cerrar sesión</span></button>
      <button type="button" class="a-btn a-btn-suave a-texto-peligro" data-eliminar>${icono('basura', { tam: 20 })}<span>Eliminar mi cuenta</span></button>
    </div>
    <p class="a-ayuda-txt">Eliminar tu cuenta borra tu registro de conductor y tus datos de ${esc(EM.APP)}. No se puede deshacer.</p>
  </section>`);
  s.querySelector('[data-salir]').addEventListener('click', async () => {
    if (await cerrarSesion?.()) alSalir();
  });
  s.querySelector('[data-eliminar]').addEventListener('click', async () => {
    if (await eliminarCuenta?.()) alSalir();
  });
  return s;
}

export function abrirAjustesConductor({ N, app, c, avisos, diseno, cambiarMunicipio, real = false, nativa = false, unica = false, cuenta = null, yo = null, cerrarSesion, eliminarCuenta }) {
  abrirPanel(app, {
    titulo: 'Ajustes',
    construir(cuerpo, cerrarPanel) {
      // Modo real: el GPS es siempre el del celular (no hay simulado), sin sala ni relés.
      if (real) {
        const gpsReal = Boolean(c?.estado.gpsReal);
        const gps = el(`<section class="a-grupo"><h3>Ubicación del taxi</h3>
          <div class="a-tarjeta-blanca a-gps-info">
            <span class="a-semaforo ${gpsReal ? 'a-ok' : 'a-medio'}" aria-hidden="true">${icono(gpsReal ? 'gps' : 'alerta', { tam: 18, grosor: 2.6 })}</span>
            <span><strong>${gpsReal ? 'Usando el GPS del celular' : 'Sin señal del GPS'}</strong><small>${gpsReal ? 'Los pasajeros ven tu taxi en el mapa mientras estás en turno.' : 'Activa la ubicación del celular para conectarte y recibir servicios.'}</small></span>
          </div></section>`);
        const acerca = bloqueAcerca(N, { que: 'App de conductores' });
        // «MODO PRUEBA» no aplica en modo real.
        acerca.querySelector?.('.a-chip-prueba')?.remove();
        cuerpo.append(
          ...[
            nativa ? '' : bloqueMunicipio(N, { alCambiar: cambiarMunicipio, unica }),
            gps,
            // Con el plugin UbicacionTurno (en la web y sin el plugin no aparece).
            nativa ? bloqueSegundoPlano({ N, app }) : '',
            bloqueSonidoYAvisos(N, { rol: 'conductor' }),
            // App nativa 1.2: Face ID / huella (en la web no aparece).
            bloqueSeguridad(N, { correo: cuenta?.usuario?.correo || '' }),
            bloqueCuenta({ cuenta, yo, cerrarSesion, eliminarCuenta, alSalir: cerrarPanel }),
            nativa ? '' : bloqueInstalar(N, app),
            acerca,
          ].filter(Boolean),
        );
        return;
      }
      const actual = N.perfil.ajustes().gpsSimulado;
      const valor = actual === true ? 'simulado' : actual === false ? 'real' : 'auto';
      const gps = el(`<section class="a-grupo"><h3>Ubicación del taxi</h3>
        <div class="a-tarjeta-lista"><div class="a-radios" role="radiogroup" aria-label="Fuente de la ubicación">
          <label class="a-opcion"><input type="radio" name="a-gps" value="auto" ${valor === 'auto' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>Automática</strong><small>${esc(`GPS real si estás en la zona; si no, simulado en ${EM.PUEBLO}.`)}</small></span></label>
          <label class="a-opcion"><input type="radio" name="a-gps" value="simulado" ${valor === 'simulado' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>GPS simulado</strong><small>${esc(`Para la demo: el taxi se mueve solo por las calles de ${EM.PUEBLO}.`)}</small></span></label>
          <label class="a-opcion"><input type="radio" name="a-gps" value="real" ${valor === 'real' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>GPS real</strong><small>Usa la ubicación del celular.</small></span></label>
        </div></div>
        <p class="a-ayuda-txt" data-gps-estado>Ahora: ${c?.estado.gpsReal ? 'GPS real' : 'GPS simulado'}.</p></section>`);
      gps.addEventListener('change', async (e) => {
        const v = e.target.value;
        await c?.usarGpsSimulado(v === 'auto' ? null : v === 'simulado');
        gps.querySelector('[data-gps-estado]').textContent = `Ahora: ${c?.estado.gpsReal ? 'GPS real' : 'GPS simulado'}.`;
        avisos.mostrar({ titulo: 'Ubicación actualizada', cuerpo: c?.estado.gpsReal ? 'Usando el GPS del celular.' : 'Usando el GPS simulado.', tipo: 'info' });
      });
      cuerpo.append(
        bloqueMunicipio(N, { alCambiar: cambiarMunicipio }),
        gps,
        bloqueSonidoYAvisos(N, { rol: 'conductor' }),
        bloqueConexion(N, { simulacion: false }),
        bloqueSala(N, app),
        nativa ? '' : bloqueInstalar(N, app),
        bloqueAcerca(N, { que: 'App de conductores' }),
      );
    },
  });
}

// «Ubicación con la app minimizada»: activa (con los avisos del celular), solo durante los viajes
// (sin avisos no se muestra en el mapa un taxi libre que no se entera de los servicios) o apagada
// (dijo «Ahora no»). Encenderla muestra otra vez el aviso «Tu ubicación mientras estás conectado».
function bloqueSegundoPlano({ N, app }) {
  if (!EM.MODO_REAL || !EM.ES_NATIVA || !N.nativo?.turnoNativoDisponible?.()) return '';
  const android = N.nativo.plataforma?.() === 'android';
  const s = el(`<section class="a-grupo a-segundo-plano" data-segundo-plano><h3>Con la app minimizada</h3>
    <div class="a-tarjeta-lista" data-lista></div>
    <p class="a-ayuda-txt" data-sp-ahora hidden></p>
    ${android ? `<div class="a-tarjeta-blanca a-sp-marcas" data-sp-marcas>
      <strong>¿Tu teléfono cierra ${esc(EM.APP)} Conductor cuando no la estás usando?</strong>
      <ul>
        <li><b>Samsung:</b> Ajustes › Batería › Límites de uso en segundo plano › quita ${esc(EM.APP)} Conductor de «Aplicaciones en suspensión».</li>
        <li><b>Xiaomi:</b> Ajustes › Aplicaciones › ${esc(EM.APP)} Conductor › Ahorro de batería › Sin restricciones.</li>
        <li><b>Huawei:</b> Ajustes › Batería › Inicio de aplicaciones › ${esc(EM.APP)} Conductor › Gestionar manualmente, con «Ejecutar en segundo plano».</li>
        <li><b>Otras marcas:</b> Ajustes › Aplicaciones › ${esc(EM.APP)} Conductor › Batería › Sin restricciones.</li>
      </ul>
    </div>` : ''}
  </section>`);
  const estadoTxt = () => {
    if (!N.nativo.aceptoSegundoPlano()) return 'Apagada · Solo con la app abierta.';
    if (!N.nativo.pushListo()) return 'Solo durante los viajes · Activa las notificaciones para recibir servicios con la app minimizada.';
    return 'Activa · Mientras estés conectado te llegan servicios y tu pasajero te ve, aunque uses otra app.';
  };
  const fila = interruptor({
    id: 'a-aj-segundo-plano', titulo: 'Ubicación con la app minimizada', detalle: estadoTxt(), icono: 'gps', activo: N.nativo.aceptoSegundoPlano(),
    alCambiar: async (v) => {
      let si = true;
      if (v) si = await ofrecerSegundoPlano(app, { N, forzar: true });
      else N.nativo.fijarAceptoSegundoPlano(false);
      setTimeout(pintar, 0);
      return si;
    },
  });
  s.querySelector('[data-lista]').append(fila);
  const ahora = s.querySelector('[data-sp-ahora]');
  async function pintar() {
    const det = fila.querySelector('small');
    if (det) det.textContent = estadoTxt();
    const est = await N.nativo.estadoTurnoNativo();
    let txt = '';
    if (est.activo) txt = est.precisa ? 'Ahora la estás compartiendo porque estás conectado.' : `Ahora la estás compartiendo, pero aproximada: activa «${android ? 'Usar ubicación precisa' : 'Ubicación exacta'}» para que tu pasajero te vea llegar.`;
    else if (est.motivo === 'permiso' && N.nativo.aceptoSegundoPlano()) txt = 'Se detuvo porque la app no tiene permiso de ubicación. Actívalo en los ajustes del celular.';
    ahora.textContent = txt;
    ahora.hidden = !txt;
  }
  pintar();
  return s;
}

export function abrirAvisosConductor({ N, app, avisos, c = null }) {
  abrirPanel(app, {
    titulo: 'Avisos',
    construir(cuerpo) {
      const h = avisos.historial;
      // Ronda 4A: arriba, los avisos de la cooperativa («De tu cooperativa»; abrirla los da por leídos).
      const bandeja = EM.MODO_REAL ? seccionBandeja(N, c?.bandeja) : null;
      cuerpo.innerHTML = h.length
        ? `<ul class="a-lista-avisos">${h.map((a) => `<li class="a-aviso-item a-aviso-${esc(a.tipo)}"><span class="a-aviso-punto"></span><span><strong>${esc(a.titulo)}</strong>${a.cuerpo ? `<small>${esc(a.cuerpo)}</small>` : ''}</span><time>${esc(N.horaTexto(a.hora))}</time></li>`).join('')}</ul>`
        : bandeja ? '' : ilustracionVacia('Aquí verás las solicitudes, los pagos y las calificaciones que recibas.');
      if (bandeja) cuerpo.prepend(bandeja);
    },
  });
}
