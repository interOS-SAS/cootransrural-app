// Secciones del menú del pasajero: Mis viajes, Programados, Tarifas y rutas,
// Promociones, Ajustes, Ayuda y la lista de avisos.
import { el, esc, icono, abrirPanel, modal, chipPrueba, franjaCuadros } from './ui.js';
import { ilustracionVacia, sellosFidelidad } from './ilustraciones.js';
import { bloqueDiseno, bloqueSala, bloqueSonidoYAvisos, bloqueConexion, bloqueInstalar } from './ajustes-comunes.js';

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
  const T = N.TARIFAS;
  abrirPanel(app, {
    titulo: 'Tarifas y rutas',
    construir(cuerpo) {
      cuerpo.innerHTML = `
        <div class="a-aviso-ejemplo">${icono('info', { tam: 20 })}<span><strong>Valores de ejemplo</strong><small>La cooperativa debe confirmar las tarifas oficiales antes de publicar la app.</small></span></div>
        <section class="a-grupo"><h3>Dentro de El Rosal</h3>
          <div class="a-reglas">
            <div class="a-regla"><small>Carrera mínima</small><strong>${N.pesos(T.minimaUrbana)}</strong></div>
            <div class="a-regla"><small>Banderazo</small><strong>${N.pesos(T.banderazo)}</strong></div>
            <div class="a-regla"><small>Por kilómetro</small><strong>${N.pesos(T.porKm)}</strong></div>
            <div class="a-regla"><small>Nocturno (${T.nocheDesde}:00 a ${T.nocheHasta - 1}:59)</small><strong>+${N.pesos(T.recargoNocturno)}</strong></div>
            <div class="a-regla"><small>Domingos y festivos</small><strong>+${N.pesos(T.recargoDominical)}</strong></div>
            <div class="a-regla"><small>Redondeo</small><strong>a ${N.pesos(T.redondeo)}</strong></div>
          </div>
        </section>
        <section class="a-grupo"><h3>Rutas con tarifa fija desde El Rosal</h3>
          <table class="a-tabla">
            <caption class="a-solo-lector">Rutas intermunicipales con tarifa fija (valores de ejemplo)</caption>
            <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Tiempo</th><th scope="col">Valor</th></tr></thead>
            <tbody>${N.RUTAS.map((r) => `<tr><th scope="row">${esc(r.destino)}</th><td>${r.km} km</td><td>${esc(N.minutosTexto(r.min))}</td><td><b>${N.pesos(r.valor)}</b></td></tr>`).join('')}</tbody>
          </table>
        </section>
        <section class="a-grupo"><h3>Ofertas de la cooperativa</h3>
          <div class="a-oferta">${icono('calendario', { tam: 22 })}<span><strong>Programa con ${T.horasAnticipacion} h: ${Math.round(T.descuentoProgramado * 100)} % menos</strong><small>Se aplica solo al programar con anticipación.</small></span></div>
          <div class="a-oferta">${icono('regalo', { tam: 22 })}<span><strong>Cada ${T.viajesFidelidad} viajes, el siguiente al ${Math.round(T.descuentoFidelidad * 100)} %</strong><small>Los descuentos no se acumulan: se aplica el mayor.</small></span></div>
        </section>`;
    },
  });
}

export function abrirPromociones({ N, app, programarViaje }) {
  abrirPanel(app, {
    titulo: 'Promociones',
    construir(cuerpo, cerrar) {
      const n = N.perfil.viajesCompletadosPasajero();
      const fid = N.progresoFidelidad(n);
      cuerpo.innerHTML = `
        <div class="a-tarjeta-fid">
          ${franjaCuadros()}
          <div class="a-tarjeta-fid-cabeza">
            <span><small>Tarjeta de viajes</small><strong>${fid.siguienteConDescuento ? '¡Viaje al 50 % listo!' : `${fid.completados} de ${fid.meta} viajes`}</strong></span>
            <img src="../img/icono.svg" alt="" width="40" height="40">
          </div>
          ${sellosFidelidad(fid)}
          <p>${fid.siguienteConDescuento ? 'Tu próximo viaje tiene 50 % de descuento. Se aplica solo al pedir.' : `Te ${fid.faltan === 1 ? 'falta 1 viaje' : `faltan ${fid.faltan} viajes`}: al completar ${fid.meta}, el siguiente va al 50 %.`}</p>
        </div>
        <div class="a-oferta a-oferta-grande">
          <span class="a-oferta-sello">−10 %</span>
          <span><strong>Programa con 24 horas</strong><small>Agenda tu taxi con un día de anticipación y paga 10 % menos.</small></span>
        </div>
        <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-programar>${icono('calendario', { tam: 20 })} Programar un viaje</button>
        <div class="a-oferta">${icono('qr', { tam: 22 })}<span><strong>Stickers con QR en los taxis</strong><small>Escanea el sticker de cualquier taxi de Cootransrural para descargar la app.</small></span></div>
        <p class="a-ayuda-txt">Llevas ${n} ${n === 1 ? 'viaje completado' : 'viajes completados'} con Cootransrural en este celular.</p>`;
      cuerpo.querySelector('[data-programar]').addEventListener('click', () => {
        cerrar();
        setTimeout(programarViaje, 250);
      });
    },
  });
}

export function abrirAjustes({ N, app, diseno }) {
  abrirPanel(app, {
    titulo: 'Ajustes',
    construir(cuerpo) {
      cuerpo.append(
        bloqueDiseno(N, diseno),
        bloqueSonidoYAvisos(N),
        bloqueConexion(N, { simulacion: true }),
        bloqueSala(N, app),
        bloqueInstalar(N, app),
        el(`<p class="a-ayuda-txt a-version">${chipPrueba('MODO PRUEBA')} Demo de ${esc(N.EMPRESA.razonSocial)}.</p>`),
      );
    },
  });
}

export function abrirAyuda({ N, app }) {
  const E = N.EMPRESA;
  abrirPanel(app, {
    titulo: 'Ayuda',
    construir(cuerpo) {
      cuerpo.innerHTML = `
        <div class="a-ayuda-cabeza">
          ${franjaCuadros()}
          <img src="../img/icono.svg" alt="" width="56" height="56">
          <strong>${esc(E.nombre)}</strong>
          <span>${esc(E.lema)}</span>
          <small>Servicio 24 horas · ${E.taxis} taxis · ${E.microbuses} microbuses · ${E.asociados} asociados</small>
        </div>
        <div class="a-contacto">
          <a class="a-btn a-btn-primario a-btn-grande" href="tel:${E.telefono}">${icono('telefono', { tam: 20 })} Llamar a la central · ${esc(E.telefonoVisible)}</a>
          <a class="a-btn a-btn-tinta a-btn-grande" href="${esc(N.enlaceWhatsApp(E.whatsapp, 'Hola, necesito ayuda con la app de Cootransrural.'))}" target="_blank" rel="noopener">${icono('chat', { tam: 20 })} Escribir por WhatsApp</a>
          <a class="a-btn a-btn-suave" href="mailto:${esc(E.correo)}">${icono('mensaje', { tam: 18 })} ${esc(E.correo)}</a>
        </div>
        <p class="a-direccion">${icono('pin', { tam: 18 })} ${esc(E.direccion)}</p>
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


