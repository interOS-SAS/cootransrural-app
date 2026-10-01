// Secciones del menú del pasajero: Mis viajes, Programados, Tarifas y rutas,
// Promociones, Ajustes, Ayuda y la lista de avisos.
import { esc, icono, abrirPanel, modal, chipPrueba, franjaCuadros } from './ui.js';
import { ilustracionVacia, sellosFidelidad } from './ilustraciones.js';
import { bloqueSala, bloqueSonidoYAvisos, bloqueConexion, bloqueInstalar, bloqueAcerca, bloqueMunicipio } from './ajustes-comunes.js';
import * as EM from './empresa.js';

const ESTADOS = {
  finalizado: { texto: 'Finalizado', clase: 'a-ok' },
  cancelado: { texto: 'Cancelado', clase: 'a-mal' },
};

export function abrirMisViajes({ N, app }) {
  abrirPanel(app, {
    titulo: 'Mis viajes',
    construir(cuerpo) {
      const hist = N.perfil.historialPasajero();
      const fin = hist.filter((v) => v.estado === 'finalizado');
      const gastado = fin.reduce((s, v) => s + (v.valor || 0), 0);
      if (!hist.length) {
        cuerpo.innerHTML = ilustracionVacia('Aún no tienes viajes. Cuando pidas tu primer taxi, aquí verás el recorrido, el valor y el conductor.');
        return;
      }
      cuerpo.innerHTML = `
        <div class="a-resumen-viajes">
          <span><strong>${fin.length}</strong><small>${fin.length === 1 ? 'viaje' : 'viajes'}</small></span>
          <span><strong>${N.pesos(gastado)}</strong><small>en total</small></span>
          <span><strong>${N.kmTexto(fin.reduce((s, v) => s + (v.km || 0), 0))}</strong><small>recorridos</small></span>
        </div>
        <ul class="a-viajes" data-lista-viajes>
          ${hist.map((v) => {
            const est = ESTADOS[v.estado] || { texto: v.estado, clase: '' };
            return `<li class="a-viaje">
              <div class="a-viaje-cabeza">
                <span class="a-viaje-fecha">${icono('calendario', { tam: 15 })} ${esc(N.fechaTexto(v.fecha))} · ${esc(N.horaTexto(v.fecha))}</span>
                <span class="a-estado ${est.clase}">${esc(est.texto)}</span>
              </div>
              <div class="a-viaje-ruta">
                <span><i class="a-punto a-punto-verde"></i>${esc(v.origen?.titulo || 'Origen')}</span>
                <span><i class="a-punto a-punto-negro"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
              </div>
              <div class="a-viaje-pie">
                <span>${v.conductor ? `Móvil ${esc(v.conductor.movil)} · ${esc(v.conductor.placa)}` : 'Sin conductor asignado'}${v.km && v.estado !== 'cancelado' ? ` · ${esc(N.kmTexto(v.km))}` : ''}</span>
                <strong>${v.estado === 'cancelado' ? '—' : N.pesos(v.valor)}</strong>
              </div>
              <div class="a-viaje-extra">
                <span>${icono(v.metodoPago === 'qr' ? 'qr' : 'efectivo', { tam: 14 })} ${v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}</span>
                ${v.calificacionDada ? `<span class="a-viaje-cal">${'★'.repeat(v.calificacionDada)}</span>` : ''}
                ${v.motivo ? `<span>${esc(v.motivo)}</span>` : ''}
                ${v.simulado ? chipPrueba('SIMULADO') : ''}
              </div>
            </li>`;
          }).join('')}
        </ul>`;
    },
  });
}

export function abrirProgramados({ N, app, avisos, programarViaje }) {
  abrirPanel(app, {
    titulo: 'Viajes programados',
    construir(cuerpo, cerrar) {
      const pintar = () => {
        const lista = N.perfil.viajesProgramados();
        cuerpo.innerHTML = `
          <div class="a-promo a-promo-grande">
            <span class="a-promo-ico">${icono('calendario', { tam: 24 })}</span>
            <span><strong>Programa con 24 horas y paga 10 % menos</strong><small>Ideal para el aeropuerto, citas médicas o el colegio.</small></span>
          </div>
          ${lista.length ? `<ul class="a-viajes">${lista.map((v) => `
            <li class="a-viaje">
              <div class="a-viaje-cabeza">
                <span class="a-viaje-fecha">${icono('reloj', { tam: 15 })} ${esc(N.fechaTexto(v.fecha))} · ${esc(N.horaTexto(v.fecha))}</span>
                ${v.tarifa?.descuento ? `<span class="a-estado a-ok">−${N.pesos(v.tarifa.descuento)}</span>` : '<span class="a-estado">Programado</span>'}
              </div>
              <div class="a-viaje-ruta">
                <span><i class="a-punto a-punto-verde"></i>${esc(v.origen?.titulo || 'Origen')}</span>
                <span><i class="a-punto a-punto-negro"></i>${esc(v.destino?.titulo || 'Destino a convenir')}</span>
              </div>
              <div class="a-viaje-pie">
                <span>${v.metodoPago === 'qr' ? 'QR (prueba)' : 'Efectivo'}${v.nota ? ` · «${esc(v.nota)}»` : ''}</span>
                <strong>${N.pesos(v.tarifa?.total || 0)}</strong>
              </div>
              <button type="button" class="a-btn-texto a-texto-peligro" data-quitar="${esc(v.id)}">Cancelar este viaje</button>
            </li>`).join('')}</ul>` : ilustracionVacia('No tienes viajes programados.')}
          <button type="button" class="a-btn a-btn-primario a-btn-grande" data-nuevo>${icono('mas', { tam: 20 })} Programar un viaje</button>`;
      };
      pintar();
      cuerpo.addEventListener('click', async (e) => {
        const q = e.target.closest('[data-quitar]');
        if (q) {
          const ok = await modal(app, { titulo: '¿Cancelar el viaje programado?', acciones: [{ texto: 'No', valor: false }, { texto: 'Sí, cancelar', valor: true, clase: 'a-btn-peligro' }] });
          if (ok) {
            N.perfil.quitarProgramado(q.dataset.quitar);
            avisos.mostrar({ titulo: 'Viaje programado cancelado', tipo: 'info' });
            pintar();
          }
        }
        if (e.target.closest('[data-nuevo]')) {
          cerrar();
          setTimeout(programarViaje, 250);
        }
      });
    },
  });
}

export function abrirTarifas({ N, app }) {
  const T = N.TARIFAS || {};
  // Solo se muestran los valores que trae la ficha (nada de «$NaN»).
  const hay = (v) => Number.isFinite(Number(v)) && v !== null && v !== '';
  const reglas = [
    hay(T.minimaUrbana) && ['Carrera mínima', N.pesos(T.minimaUrbana)],
    hay(T.banderazo) && ['Banderazo', N.pesos(T.banderazo)],
    hay(T.porKm) && ['Por kilómetro', N.pesos(T.porKm)],
    hay(T.recargoNocturno) && [hay(T.nocheDesde) && hay(T.nocheHasta) ? `Nocturno (${T.nocheDesde}:00 a ${(Number(T.nocheHasta) + 23) % 24}:59)` : 'Nocturno', `+${N.pesos(T.recargoNocturno)}`],
    Number(T.recargoDominical) > 0 && ['Domingos y festivos', `+${N.pesos(T.recargoDominical)}`],
    hay(T.redondeo) && ['Redondeo', `a ${N.pesos(T.redondeo)}`],
  ].filter(Boolean);
  const rutas = (N.RUTAS || []).filter((r) => r && r.destino && hay(r.valor));
  const ofertas = [
    hay(T.horasAnticipacion) && hay(T.descuentoProgramado) && `<div class="a-oferta">${icono('calendario', { tam: 22 })}<span><strong>Programa con ${T.horasAnticipacion} h: ${Math.round(T.descuentoProgramado * 100)} % menos</strong><small>Se aplica solo al programar con anticipación.</small></span></div>`,
    hay(T.viajesFidelidad) && hay(T.descuentoFidelidad) && `<div class="a-oferta">${icono('regalo', { tam: 22 })}<span><strong>Cada ${T.viajesFidelidad} viajes, el siguiente al ${Math.round(T.descuentoFidelidad * 100)} %</strong><small>Los descuentos no se acumulan: se aplica el mayor.</small></span></div>`,
  ].filter(Boolean);
  abrirPanel(app, {
    titulo: 'Tarifas y rutas',
    construir(cuerpo) {
      cuerpo.innerHTML = `
        <div class="a-aviso-ejemplo">${icono('info', { tam: 20 })}<span><strong>Valores de ejemplo</strong><small>${esc(EM.NOMBRE)} debe confirmar las tarifas oficiales antes de publicar la app.</small></span></div>
        ${reglas.length ? `<section class="a-grupo"><h3>${esc(`Dentro de ${EM.PUEBLO}`)}</h3>
          <div class="a-reglas">${reglas.map(([k, v]) => `<div class="a-regla"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('')}</div>
        </section>` : ''}
        ${rutas.length ? `<section class="a-grupo"><h3>${esc(`Rutas con tarifa fija desde ${EM.PUEBLO}`)}</h3>
          <table class="a-tabla">
            <caption class="a-solo-lector">Rutas intermunicipales con tarifa fija (valores de ejemplo)</caption>
            <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Tiempo</th><th scope="col">Valor</th></tr></thead>
            <tbody>${rutas.map((r) => `<tr><th scope="row">${esc(r.destino)}</th><td>${hay(r.km) ? `${r.km} km` : '—'}</td><td>${hay(r.min) ? esc(N.minutosTexto(r.min)) : '—'}</td><td><b>${N.pesos(r.valor)}</b></td></tr>`).join('')}</tbody>
          </table>
        </section>` : ''}
        ${ofertas.length ? `<section class="a-grupo"><h3>Ofertas de la ${EM.TIPO}</h3>${ofertas.join('')}</section>` : ''}`;
    },
  });
}

export function abrirPromociones({ N, app, programarViaje }) {
  abrirPanel(app, {
    titulo: 'Promociones',
    construir(cuerpo, cerrar) {
      const n = N.perfil.viajesCompletadosPasajero();
      const fid = EM.fidelidad(n);
      cuerpo.innerHTML = `
        ${fid ? `<div class="a-tarjeta-fid">
          ${franjaCuadros()}
          <div class="a-tarjeta-fid-cabeza">
            <span><small>Tarjeta de viajes</small><strong>${fid.siguienteConDescuento ? '¡Viaje al 50 % listo!' : `${fid.completados} de ${fid.meta} viajes`}</strong></span>
            ${EM.marcaIcono(40)}
          </div>
          ${sellosFidelidad(fid)}
          <p>${fid.siguienteConDescuento ? 'Tu próximo viaje tiene 50 % de descuento. Se aplica solo al pedir.' : `Te ${fid.faltan === 1 ? 'falta 1 viaje' : `faltan ${fid.faltan} viajes`}: al completar ${fid.meta}, el siguiente va al 50 %.`}</p>
        </div>` : ''}
        <div class="a-oferta a-oferta-grande">
          <span class="a-oferta-sello">−10 %</span>
          <span><strong>Programa con 24 horas</strong><small>Agenda tu taxi con un día de anticipación y paga 10 % menos.</small></span>
        </div>
        <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-programar>${icono('calendario', { tam: 20 })} Programar un viaje</button>
        <div class="a-oferta">${icono('qr', { tam: 22 })}<span><strong>Stickers con QR en los taxis</strong><small>${esc(`Escanea el sticker de cualquier taxi de ${EM.NOMBRE} para descargar la app.`)}</small></span></div>
        <p class="a-ayuda-txt">Llevas ${n} ${n === 1 ? 'viaje completado' : 'viajes completados'} con ${esc(EM.NOMBRE)} en este celular.</p>`;
      cuerpo.querySelector('[data-programar]').addEventListener('click', () => {
        cerrar();
        setTimeout(programarViaje, 250);
      });
    },
  });
}

export function abrirAjustes({ N, app, diseno, cambiarMunicipio }) {
  abrirPanel(app, {
    titulo: 'Ajustes',
    construir(cuerpo) {
      cuerpo.append(
        bloqueMunicipio(N, { alCambiar: cambiarMunicipio }),
        bloqueSonidoYAvisos(N),
        bloqueConexion(N, { simulacion: true }),
        bloqueSala(N, app),
        bloqueInstalar(N, app),
        bloqueAcerca(N, { que: 'App de pasajeros' }),
      );
    },
  });
}

export function abrirAyuda({ N, app }) {
  const cifras = EM.unir([
    EM.SERVICIO_24H ? 'Servicio 24 horas' : '',
    EM.textoTaxis(),
    EM.MICROBUSES ? `${EM.MICROBUSES} microbuses` : '',
    EM.ASOCIADOS ? `${EM.ASOCIADOS} asociados` : '',
  ]);
  // Solo se ofrecen los canales que existen; si falta el teléfono, se dice con honestidad.
  const contacto = [
    EM.TELEFONO && `<a class="a-btn a-btn-primario a-btn-grande" href="tel:${esc(EM.TELEFONO)}">${icono('telefono', { tam: 20 })} Llamar a la central · ${esc(EM.TELEFONO_VISIBLE)}</a>`,
    EM.WHATSAPP && `<a class="a-btn a-btn-tinta a-btn-grande" href="${esc(N.enlaceWhatsApp(EM.WHATSAPP, EM.EN_TAXICUN ? `Hola, necesito ayuda con ${EM.APP} (taxis de ${EM.NOMBRE}).` : `Hola, necesito ayuda con la app de ${EM.NOMBRE}.`))}" target="_blank" rel="noopener">${icono('chat', { tam: 20 })} Escribir por WhatsApp</a>`,
    !EM.TELEFONO && `<div class="a-sin-telefono" data-sin-telefono>${icono('telefono', { tam: 20 })}<span><strong>Teléfono de la central: pronto</strong><small>Mientras tanto, pide tu taxi desde la app: el móvil más cercano te recoge.</small></span></div>`,
    EM.CORREO && `<a class="a-btn a-btn-suave" href="mailto:${esc(EM.CORREO)}">${icono('mensaje', { tam: 18 })} ${esc(EM.CORREO)}</a>`,
  ].filter(Boolean);
  abrirPanel(app, {
    titulo: 'Ayuda',
    construir(cuerpo) {
      cuerpo.innerHTML = `
        <div class="a-ayuda-cabeza">
          ${franjaCuadros()}
          ${EM.marcaIcono(56)}
          <strong>${esc(EM.NOMBRE_LARGO)}</strong>
          ${EM.LEMA ? `<span>${esc(EM.LEMA)}</span>` : ''}
          ${cifras ? `<small>${esc(cifras)}</small>` : ''}
        </div>
        <div class="a-contacto">${contacto.join('')}</div>
        ${EM.DIRECCION ? `<p class="a-direccion">${icono('pin', { tam: 18 })} ${esc(EM.DIRECCION)}</p>` : ''}
        <section class="a-grupo"><h3>Preguntas frecuentes</h3>
          ${[
            ['¿Cómo sé que es mi taxi?', 'Antes de subir revisa el número de móvil y la placa que te muestra la app. Dile al conductor tu código de abordaje de 4 dígitos: él lo escribe en su app para iniciar el viaje.'],
            ['¿Cómo pago?', 'En efectivo al conductor o con QR. El pago con QR de esta demo es de PRUEBA: no se mueve dinero real.'],
            ['¿Qué hago si me siento inseguro?', 'Toca SOS durante el viaje para llamar a la Línea 123 o avisarle a tu contacto de emergencia. También puedes compartir tu viaje por WhatsApp.'],
            ['¿Cómo funciona la tarjeta de viajes?', 'Cada viaje completado suma un sello. Al completar 10, el siguiente viaje tiene 50 % de descuento.'],
            ['¿Puedo pedir para otra persona?', 'Sí: elige el punto de recogida en el mapa y escribe en la nota para quién es el servicio.'],
          ].map(([p, r]) => `<details class="a-faq"><summary>${esc(p)}${icono('abajo', { tam: 18 })}</summary><p>${esc(r)}</p></details>`).join('')}
        </section>`;
    },
  });
}

export function abrirAvisos({ N, app, avisos }) {
  abrirPanel(app, {
    titulo: 'Avisos',
    construir(cuerpo) {
      const h = avisos.historial;
      cuerpo.innerHTML = h.length
        ? `<ul class="a-lista-avisos" data-lista-avisos>${h.map((a) => `<li class="a-aviso-item a-aviso-${esc(a.tipo)}"><span class="a-aviso-punto"></span><span><strong>${esc(a.titulo)}</strong>${a.cuerpo ? `<small>${esc(a.cuerpo)}</small>` : ''}</span><time>${esc(N.horaTexto(a.hora))}</time></li>`).join('')}</ul>`
        : ilustracionVacia('Aquí verás los avisos de tu viaje: cuando el conductor acepta, cuando está llegando y cuando termina.');
    },
  });
}


