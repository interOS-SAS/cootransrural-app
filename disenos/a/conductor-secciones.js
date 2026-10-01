// Secciones del menú del conductor: Ganancias, Historial, Documentos, Mi taxi,
// Ajustes y la lista de avisos.
import { el, esc, icono, abrirPanel, chipPrueba, decimal, placa, franjaCuadros } from './ui.js';
import { ilustracionVacia, taxiLateral } from './ilustraciones.js';
import { bloqueDiseno, bloqueSala, bloqueSonidoYAvisos, bloqueConexion, bloqueInstalar } from './ajustes-comunes.js';

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

export function abrirGanancias({ N, app }) {
  abrirPanel(app, {
    titulo: 'Ganancias',
    construir(cuerpo) {
      const r = N.perfil.resumenDelDia();
      const total = r.ganado || 0;
      const pQR = total ? Math.round((r.porQR / total) * 100) : 0;
      const semana = gananciasPorDia(N);
      const max = Math.max(1, ...semana.map((d) => d.total));
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
          <span><strong>${r.promedio ? `${decimal(r.promedio)} ★` : '—'}</strong><small>calificación</small></span>
        </div>
        <section class="a-grupo"><h3>¿Cómo te pagaron hoy?</h3>
          <div class="a-tarjeta-blanca">
            ${total ? `<div class="a-barra-apilada" role="img" aria-label="QR ${N.pesos(r.porQR)} (${pQR} %), efectivo ${N.pesos(r.efectivo)} (${100 - pQR} %)">
              ${r.porQR ? `<span style="flex:${r.porQR};background:${COLOR_QR}"></span>` : ''}
              ${r.efectivo ? `<span style="flex:${r.efectivo};background:${COLOR_EFECTIVO}"></span>` : ''}
            </div>` : '<div class="a-barra-apilada a-vacia"></div>'}
            <ul class="a-leyenda">
              <li><i style="background:${COLOR_QR}"></i><span>QR (prueba)</span><b>${N.pesos(r.porQR)}</b><small>${pQR} %</small></li>
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
        <p class="a-ayuda-txt">${chipPrueba('MODO PRUEBA')} Los pagos con QR de esta demo son de prueba: no se mueve dinero.</p>`;
    },
  });
}

export function abrirHistorial({ N, app }) {
  abrirPanel(app, {
    titulo: 'Historial',
    construir(cuerpo) {
      const hist = N.perfil.historialConductor();
      if (!hist.length) {
        cuerpo.innerHTML = ilustracionVacia('Aún no tienes servicios. Conéctate o toca «Simular solicitud» para probar.');
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
            <span>${icono(v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 14 })} ${v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}</span>
            ${v.calificacionRecibida ? `<span>Te calificó <span class="a-viaje-cal">${'★'.repeat(v.calificacionRecibida)}</span></span>` : ''}
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

export function abrirDocumentos({ N, app }) {
  abrirPanel(app, {
    titulo: 'Documentos del vehículo',
    construir(cuerpo) {
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

export function abrirMiTaxi({ N, app }) {
  abrirPanel(app, {
    titulo: 'Mi taxi',
    construir(cuerpo) {
      const yo = N.perfil.conductor();
      if (!yo) return;
      const url = N.urlDescarga({ movil: yo.movil });
      cuerpo.innerHTML = `
        <section class="a-mi-taxi">
          <div class="a-mi-taxi-arte">${taxiLateral({ ancho: 250, movil: yo.movil })}</div>
          ${placa(yo.placa)}
          <h3>${esc(yo.nombre)}</h3>
          <p>${icono('estrella', { tam: 15 })} ${decimal(yo.calificacion)} · ${Number(yo.viajes || 0).toLocaleString('es-CO')} viajes · asociado desde ${esc(yo.desde)}</p>
        </section>
        <div class="a-reglas">
          <div class="a-regla"><small>Móvil</small><strong>${esc(yo.movil)}</strong></div>
          <div class="a-regla"><small>Placa</small><strong>${esc(yo.placa)}</strong></div>
          <div class="a-regla"><small>Vehículo</small><strong>${esc(yo.vehiculo)}</strong></div>
          <div class="a-regla"><small>Color</small><strong>${esc(yo.color)}</strong></div>
        </div>
        <section class="a-grupo"><h3>Tu sticker con QR</h3>
          <div class="a-sticker">
            <div class="a-sticker-qr">${N.qrSVG(url, { redondeado: true })}</div>
            <span><strong>Va en las dos puertas traseras</strong><small>Quien lo escanea descarga la app de Cootransrural y queda registrado que llegó por el móvil ${esc(yo.movil)}.</small></span>
          </div>
        </section>`;
    },
  });
}

export function abrirAjustesConductor({ N, app, c, avisos, diseno }) {
  abrirPanel(app, {
    titulo: 'Ajustes',
    construir(cuerpo) {
      const actual = N.perfil.ajustes().gpsSimulado;
      const valor = actual === true ? 'simulado' : actual === false ? 'real' : 'auto';
      const gps = el(`<section class="a-grupo"><h3>Ubicación del taxi</h3>
        <div class="a-tarjeta-lista"><div class="a-radios" role="radiogroup" aria-label="Fuente de la ubicación">
          <label class="a-opcion"><input type="radio" name="a-gps" value="auto" ${valor === 'auto' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>Automática</strong><small>GPS real si estás en la zona; si no, simulado en El Rosal.</small></span></label>
          <label class="a-opcion"><input type="radio" name="a-gps" value="simulado" ${valor === 'simulado' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>GPS simulado</strong><small>Para la demo: el taxi se mueve solo por las calles de El Rosal.</small></span></label>
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
        gps,
        bloqueSonidoYAvisos(N),
        bloqueConexion(N, { simulacion: false }),
        bloqueSala(N, app),
        bloqueDiseno(N, diseno),
        bloqueInstalar(N, app),
        el(`<p class="a-ayuda-txt a-version">${chipPrueba('MODO PRUEBA')} App de conductores de ${esc(N.EMPRESA.razonSocial)}.</p>`),
      );
    },
  });
}

export function abrirAvisosConductor({ N, app, avisos }) {
  abrirPanel(app, {
    titulo: 'Avisos',
    construir(cuerpo) {
      const h = avisos.historial;
      cuerpo.innerHTML = h.length
        ? `<ul class="a-lista-avisos">${h.map((a) => `<li class="a-aviso-item a-aviso-${esc(a.tipo)}"><span class="a-aviso-punto"></span><span><strong>${esc(a.titulo)}</strong>${a.cuerpo ? `<small>${esc(a.cuerpo)}</small>` : ''}</span><time>${esc(N.horaTexto(a.hora))}</time></li>`).join('')}</ul>`
        : ilustracionVacia('Aquí verás las solicitudes, los pagos y las calificaciones que recibas.');
    },
  });
}
