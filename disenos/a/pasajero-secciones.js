// Secciones del menú del pasajero: Mis viajes, Programados, Tarifas y rutas,
// Promociones, Ajustes, Ayuda, la lista de avisos y, en modo real, Mi cuenta.
import { esc, icono, abrirPanel, modal, chipPrueba, franjaCuadros, celularTexto } from './ui.js';
import { ilustracionVacia, sellosFidelidad } from './ilustraciones.js';
import { bloqueSala, bloqueSonidoYAvisos, bloqueConexion, bloqueInstalar, bloqueAcerca, bloqueMunicipio, bloqueCuenta, enlacePrivacidad } from './ajustes-comunes.js';
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

export function abrirTarifas({ N, app, pedirA = null, puedePedir = false }) {
  const T = N.TARIFAS || {};
  // Solo se muestran los valores que trae la ficha (nada de «$NaN»).
  const hay = (v) => Number.isFinite(Number(v)) && v !== null && v !== '';
  // Tabla oficial (Cootransrural: Decreto 05 de 2026). Banderazo y valor por km pueden ser
  // estimados (TARIFAS.estimados): el decreto no los fija.
  const oficiales = Boolean(EM.TARIFAS_OFICIALES);
  const fuente = N.FUENTE_TARIFAS;
  const estimados = new Set(Array.isArray(T.estimados) ? T.estimados : []);
  const est = (clave, texto) => (estimados.has(clave) ? `${texto} (estimado)` : texto);
  const reglas = [
    hay(T.minimaUrbana) && [oficiales ? 'Carrera mínima (oficial)' : 'Carrera mínima', N.pesos(T.minimaUrbana)],
    hay(T.banderazo) && [est('banderazo', 'Banderazo'), N.pesos(T.banderazo)],
    hay(T.porKm) && [est('porKm', 'Por kilómetro'), N.pesos(T.porKm)],
    Number(T.recargoNocturno) > 0 && [hay(T.nocheDesde) && hay(T.nocheHasta) ? `Nocturno (${T.nocheDesde}:00 a ${(Number(T.nocheHasta) + 23) % 24}:59)` : 'Nocturno', `+${N.pesos(T.recargoNocturno)}`],
    Number(T.recargoDominical) > 0 && ['Domingos y festivos', `+${N.pesos(T.recargoDominical)}`],
    hay(T.redondeo) && ['Redondeo', `a ${N.pesos(T.redondeo)}`],
  ].filter(Boolean);
  const notasReglas = oficiales ? [T.notaRecargos, T.notaEstimacion].filter(Boolean) : [];
  const rutas = (N.RUTAS || []).filter((r) => r && r.destino && hay(r.valor));
  const referencia = oficiales && T.rutasReferencia;
  const ofertas = [
    !EM.MODO_REAL && hay(T.horasAnticipacion) && hay(T.descuentoProgramado) && `<div class="a-oferta">${icono('calendario', { tam: 22 })}<span><strong>Programa con ${T.horasAnticipacion} h: ${Math.round(T.descuentoProgramado * 100)} % menos</strong><small>Se aplica solo al programar con anticipación.</small></span></div>`,
    // En modo real no hay tarjeta de viajes (ver EM.fidelidad).
    !EM.MODO_REAL && hay(T.viajesFidelidad) && hay(T.descuentoFidelidad) && `<div class="a-oferta">${icono('regalo', { tam: 22 })}<span><strong>Cada ${T.viajesFidelidad} viajes, el siguiente al ${Math.round(T.descuentoFidelidad * 100)} %</strong><small>Los descuentos no se acumulan: se aplica el mayor.</small></span></div>`,
  ].filter(Boolean);
  // El aviso de «ejemplo» sale solo mientras la ficha diga que las tarifas son de ejemplo
  // (T.ejemplo); en modo real, sin hablar de «publicar la app».
  const ejemplo = Boolean(T.ejemplo);
  const avisoEjemplo = !ejemplo ? ''
    : EM.MODO_REAL
      ? `<div class="a-aviso-ejemplo">${icono('info', { tam: 20 })}<span><strong>Valores de ejemplo</strong><small>${esc(`${EM.NOMBRE} todavía no confirma sus tarifas oficiales. El valor final lo confirma el conductor al terminar el viaje.`)}</small></span></div>`
      : `<div class="a-aviso-ejemplo">${icono('info', { tam: 20 })}<span><strong>Valores de ejemplo</strong><small>${esc(EM.NOMBRE)} debe confirmar las tarifas oficiales antes de publicar la app.</small></span></div>`;
  const zonas = oficiales ? N.zonasTarifa() : [];
  const total = zonas.reduce((n, z) => n + z.destinos.length, 0);
  const avisoOficial = !oficiales ? '' : `<div class="a-aviso-ejemplo a-aviso-oficial" data-aviso-oficial>${icono('check', { tam: 20, grosor: 3 })}<span>
      <strong>${esc(fuente ? `Tarifas oficiales · ${fuente.acto}` : 'Tarifas oficiales')}</strong>
      <small>${esc(EM.unir([fuente?.entidad, fuente?.fecha], ', '))}${fuente ? '. ' : ''}${esc(`Precio cerrado desde ${N.ORIGEN_OFICIAL} a ${total} destinos en ${zonas.length} zonas.`)}</small>
      ${fuente?.url ? `<a class="a-enlace-decreto" href="${esc(fuente.url)}" target="_blank" rel="noopener" data-enlace-decreto>${icono('externo', { tam: 15 })} Ver el ${esc(fuente.acto)}</a>` : ''}
    </span></div>`;
  const fila = (d) => {
    const nota = N.textoPrecision(d);
    const lugar = puedePedir ? N.lugarDeTarifa(d) : null;
    return `<tr data-id="${esc(d.id)}"><th scope="row">${esc(d.destino)}${nota ? `<small>${esc(nota)}</small>` : ''}</th>
      <td><b>${N.pesos(d.valor)}</b>${lugar ? `<button type="button" class="a-pedir-a" data-pedir-a="${esc(d.id)}" aria-label="${esc(`Pedir taxi a ${d.destino}`)}">Pedir</button>` : ''}</td></tr>`;
  };
  const tablaOficial = !oficiales ? '' : `<section class="a-grupo a-tarifas-oficiales" data-tabla-oficial>
      <h3>${esc(`Precios desde ${N.ORIGEN_OFICIAL}`)}</h3>
      <label class="a-buscar-tarifa">${icono('buscar', { tam: 18 })}<span class="a-solo-lector">Buscar un destino de la tabla</span><input type="search" data-buscar-tarifa placeholder="Busca un destino o una vereda" autocomplete="off" enterkeyhint="search"></label>
      <p class="a-ayuda-txt" data-tarifas-cuenta aria-live="polite">${total} destinos en ${zonas.length} zonas. Toca una zona para ver sus precios.</p>
      <div class="a-zonas">${zonas.map((z) => `<details class="a-zona" data-zona="${z.zona}">
        <summary><span><strong>Zona ${z.zona}</strong><small>${esc(z.sector)} · ${z.destinos.length} ${z.destinos.length === 1 ? 'destino' : 'destinos'}</small></span><b>${z.destinos.every((d) => d.valor === z.destinos[0].valor) ? N.pesos(z.destinos[0].valor) : `${N.pesos(Math.min(...z.destinos.map((d) => d.valor)))} a ${N.pesos(Math.max(...z.destinos.map((d) => d.valor)))}`}</b>${icono('abajo', { tam: 16 })}</summary>
        <table class="a-tabla a-tabla-oficial"><caption class="a-solo-lector">${esc(`Zona ${z.zona}, ${z.sector}${fuente ? ` (${fuente.acto})` : ''}`)}</caption>
          <thead><tr><th scope="col">Destino</th><th scope="col">Valor</th></tr></thead>
          <tbody>${z.destinos.map(fila).join('')}</tbody></table>
      </details>`).join('')}</div>
      <p class="a-ayuda-txt" data-tarifas-vacio hidden>${icono('info', { tam: 14 })}<span></span></p>
    </section>`;
  abrirPanel(app, {
    titulo: 'Tarifas y rutas',
    construir(cuerpo, cerrar) {
      cuerpo.innerHTML = `
        ${avisoEjemplo}${avisoOficial}
        ${reglas.length ? `<section class="a-grupo"><h3>${esc(`Dentro de ${EM.PUEBLO}`)}</h3>
          <div class="a-reglas">${reglas.map(([k, v]) => `<div class="a-regla"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join('')}</div>
          ${notasReglas.map((t) => `<p class="a-ayuda-txt">${icono('info', { tam: 14 })}<span>${esc(t)}</span></p>`).join('')}
        </section>` : ''}
        ${tablaOficial}
        ${rutas.length ? `<section class="a-grupo"><h3>${esc(referencia ? 'Otros municipios: precio de referencia' : `Rutas con tarifa fija desde ${EM.PUEBLO}`)}</h3>
          ${referencia && T.notaRutas ? `<p class="a-ayuda-txt a-nota-rutas">${icono('alerta', { tam: 14 })}<span>${esc(T.notaRutas)}</span></p>` : ''}
          <table class="a-tabla" data-tabla-rutas>
            <caption class="a-solo-lector">${referencia ? 'Precios de referencia a otros municipios, por confirmar' : `Rutas intermunicipales con tarifa fija${ejemplo ? ' (valores de ejemplo)' : ''}`}</caption>
            <thead><tr><th scope="col">Destino</th><th scope="col">Distancia</th><th scope="col">Tiempo</th><th scope="col">Valor</th></tr></thead>
            <tbody>${rutas.map((r) => `<tr><th scope="row">${esc(r.destino)}</th><td>${hay(r.km) ? `${r.km} km` : '—'}</td><td>${hay(r.min) ? esc(N.minutosTexto(r.min)) : '—'}</td><td><b>${N.pesos(r.valor)}</b></td></tr>`).join('')}</tbody>
          </table>
        </section>` : ''}
        ${ofertas.length ? `<section class="a-grupo"><h3>Ofertas de la ${EM.TIPO}</h3>${ofertas.join('')}</section>` : ''}`;
      if (!oficiales) return;
      // Buscador de la tabla oficial: deja ver solo las filas que coinciden y abre sus zonas.
      const q = cuerpo.querySelector('[data-buscar-tarifa]');
      const cuenta = cuerpo.querySelector('[data-tarifas-cuenta]');
      const vacio = cuerpo.querySelector('[data-tarifas-vacio]');
      const detalles = [...cuerpo.querySelectorAll('.a-zona')];
      q.addEventListener('input', () => {
        const texto = q.value.trim();
        const ids = new Set(N.buscarTarifas(texto).map((d) => d.id));
        let n = 0;
        for (const det of detalles) {
          let enZona = 0;
          for (const tr of det.querySelectorAll('tbody tr')) {
            const ver = !texto || ids.has(tr.dataset.id);
            tr.hidden = !ver;
            if (ver) enZona++;
          }
          n += enZona;
          det.hidden = Boolean(texto) && !enZona;
          det.open = Boolean(texto) && enZona > 0;
        }
        cuenta.textContent = texto ? (n ? `${n} ${n === 1 ? 'destino' : 'destinos'} con «${texto}»` : '') : `${total} destinos en ${zonas.length} zonas. Toca una zona para ver sus precios.`;
        vacio.hidden = !texto || n > 0;
        if (texto && !n) vacio.querySelector('span').textContent = `«${texto}» no está en la tabla del ${fuente?.acto || 'decreto'}. Para otros destinos, la app estima el valor por la distancia.`;
      });
      cuerpo.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pedir-a]');
        if (!b || !pedirA) return;
        const lugar = N.lugarDeTarifa(N.DESTINOS_TARIFA.find((d) => d.id === b.dataset.pedirA));
        if (!lugar) return;
        cerrar();
        setTimeout(() => pedirA(lugar), 250);
      });
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
        ${EM.MODO_REAL ? '' : `<div class="a-oferta a-oferta-grande">
          <span class="a-oferta-sello">−10 %</span>
          <span><strong>Programa con 24 horas</strong><small>Agenda tu taxi con un día de anticipación y paga 10 % menos.</small></span>
        </div>
        <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-programar>${icono('calendario', { tam: 20 })} Programar un viaje</button>`}
        <div class="a-oferta">${icono('qr', { tam: 22 })}<span><strong>Stickers con QR en los taxis</strong><small>${esc(`Escanea el sticker de cualquier taxi de ${EM.NOMBRE} para descargar la app.`)}</small></span></div>
        <p class="a-ayuda-txt">Llevas ${n} ${n === 1 ? 'viaje completado' : 'viajes completados'} con ${esc(EM.NOMBRE)} en este celular.</p>`;
      cuerpo.querySelector('[data-programar]')?.addEventListener('click', () => {
        cerrar();
        setTimeout(programarViaje, 250);
      });
    },
  });
}

// En modo real, sala, conexión y simulación no salen (ajustes-comunes.js las
// devuelve vacías), «Instalar» tampoco en la app nativa, y aparece «Tu cuenta».
export function abrirAjustes(c) {
  const { N, app, cambiarMunicipio } = c;
  abrirPanel(app, {
    titulo: 'Ajustes',
    construir(cuerpo, cerrar) {
      const yo = N.perfil.pasajero();
      cuerpo.append(
        bloqueMunicipio(N, { alCambiar: cambiarMunicipio, unica: c.unica }),
        bloqueSonidoYAvisos(N),
        bloqueConexion(N, { simulacion: true }),
        bloqueSala(N, app),
        bloqueInstalar(N, app),
        bloqueCuenta(N, {
          nombre: yo?.nombre || '',
          correo: yo?.correo || '',
          abrir: () => abrirMiCuenta(c),
          cerrarSesion: c.cerrarSesion ? () => c.cerrarSesion({ alTerminar: cerrar }) : null,
          eliminar: c.eliminarCuenta ? () => c.eliminarCuenta({ alTerminar: cerrar }) : null,
        }),
        bloqueAcerca(N, { que: 'App de pasajeros' }),
      );
    },
  });
}

// Solo en modo real: los datos de la cuenta de TaxiCun. El correo no se cambia
// (es con el que se ingresa); el nombre y el celular se guardan en el servidor
// (PATCH /api/yo) y el contacto de emergencia solo en este celular.
//   alActualizar(): la app repinta la barra y reconecta el tiempo real (el
//   servidor toma nombre y celular al conectarse).
//   cerrarSesion({alTerminar}) y eliminarCuenta({alTerminar}): de pasajero.js.
export function abrirMiCuenta({ N, app, avisos, cerrarSesion, eliminarCuenta, alActualizar }) {
  abrirPanel(app, {
    titulo: 'Mi cuenta',
    clase: 'a-mi-cuenta',
    construir(cuerpo, cerrar) {
      const yo = N.perfil.pasajero() || {};
      const contacto = yo.contactoEmergencia || {};
      cuerpo.innerHTML = `
        <section class="a-grupo"><h3>Tus datos</h3>
          <form class="a-mi-cuenta-datos" novalidate>
            <div class="a-fila-interruptor">
              <span class="a-fila-ico">${icono('mensaje', { tam: 20 })}</span>
              <span class="a-fila-txt"><strong>${esc(yo.correo || 'Correo')}</strong><small>Correo verificado · con él ingresas</small></span>
            </div>
            <label class="a-campo">
              <span>Nombre y apellido</span>
              <input name="nombre" autocomplete="name" autocapitalize="words" maxlength="80" value="${esc(yo.nombre || '')}" required>
            </label>
            <label class="a-campo">
              <span>Celular</span>
              <span class="a-campo-tel"><span class="a-prefijo">+57</span><input name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" maxlength="12" value="${esc(celularTexto(yo.celular || ''))}" required></span>
            </label>
            <fieldset class="a-emergencia">
              <legend>${icono('escudo', { tam: 18 })} Contacto de emergencia <small>(opcional)</small></legend>
              <p>Queda solo en este celular. Le avisas con un toque desde SOS.</p>
              <div class="a-fila-2">
                <label class="a-campo a-campo-chico"><span>Nombre</span><input name="contactoNombre" autocomplete="off" placeholder="Ej.: Mamá" value="${esc(contacto.nombre || '')}"></label>
                <label class="a-campo a-campo-chico"><span>Celular</span><input name="contactoCelular" type="tel" inputmode="numeric" placeholder="10 dígitos" maxlength="12" value="${esc(celularTexto(contacto.celular || ''))}"></label>
              </div>
            </fieldset>
            <p class="a-error" data-error role="alert"></p>
            <button class="a-btn a-btn-primario" type="submit" data-guardar><span>Guardar cambios</span></button>
          </form>
        </section>
        <section class="a-grupo"><h3>Sesión</h3>
          <p class="a-ayuda-txt">${esc(`Cierra tu sesión de ${EM.APP} en este celular. Para volver, ingresas con tu correo.`)}</p>
          <button type="button" class="a-btn a-btn-suave a-btn-bloque" data-salir>${icono('salir', { tam: 20 })}<span>Cerrar sesión</span></button>
        </section>
        <section class="a-grupo"><h3>Eliminar cuenta</h3>
          <p class="a-ayuda-txt">${esc(`Borramos tu nombre, correo y celular de ${EM.APP} y cerramos tu sesión. Tus viajes quedan sin datos personales para la ${EM.TIPO}. No se puede deshacer.`)}</p>
          <button type="button" class="a-btn a-btn-peligro a-btn-bloque" data-eliminar>${icono('basura', { tam: 20 })}<span>Eliminar mi cuenta</span></button>
        </section>`;
      const f = cuerpo.querySelector('form');
      const error = cuerpo.querySelector('[data-error]');
      const boton = cuerpo.querySelector('[data-guardar]');
      const formatear = (input) => input.addEventListener('input', () => {
        const d = input.value.replace(/\D/g, '').slice(0, 10);
        input.value = celularTexto(d) || d;
      });
      formatear(f.celular);
      formatear(f.contactoCelular);
      f.addEventListener('input', (e) => {
        e.target.classList?.remove('a-invalido');
        if (!f.querySelector('.a-invalido')) error.textContent = '';
      });
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (boton.disabled) return;
        const nombre = f.nombre.value.trim().replace(/\s+/g, ' ');
        const celular = f.celular.value.replace(/\D/g, '');
        const cNombre = f.contactoNombre.value.trim();
        const cCel = f.contactoCelular.value.replace(/\D/g, '');
        f.querySelectorAll('.a-invalido').forEach((x) => x.classList.remove('a-invalido'));
        const fallo = (campo, msj) => {
          error.textContent = msj;
          campo?.classList.add('a-invalido');
          campo?.focus();
        };
        if (nombre.length < 3 || !/[a-záéíóúñ]/i.test(nombre)) return fallo(f.nombre, 'Escribe tu nombre (mínimo 3 letras).');
        if (!/^3\d{9}$/.test(celular)) return fallo(f.celular, 'El celular debe tener 10 dígitos y empezar por 3.');
        if (cCel && !/^3\d{9}$/.test(cCel)) return fallo(f.contactoCelular, 'El celular del contacto debe tener 10 dígitos.');
        if (cCel && cCel === celular) return fallo(f.contactoCelular, 'El contacto de emergencia debe ser otro número.');
        error.textContent = '';
        const actual = N.perfil.pasajero() || {};
        const cambioServidor = nombre !== (actual.nombre || '') || celular !== (actual.celular || '');
        boton.disabled = true;
        boton.classList.add('a-ocupado');
        try {
          if (cambioServidor) {
            const r = await N.servidor.actualizarYo({ nombre, celular });
            N.perfil.fijarPasajeroServidor(r?.usuario || { ...actual, nombre, celular });
          }
          N.perfil.registrarPasajero({ contactoEmergencia: cCel ? { nombre: cNombre || 'Contacto de emergencia', celular: cCel } : null });
          if (cambioServidor) alActualizar?.();
          avisos.mostrar({ titulo: 'Guardamos tus datos', tipo: 'exito' });
        } catch (err) {
          if (err?.codigo === 'nombre_invalido') fallo(f.nombre, EM.textoError(err));
          else if (err?.codigo === 'celular_invalido') fallo(f.celular, EM.textoError(err));
          else error.textContent = EM.textoError(err);
        } finally {
          boton.disabled = false;
          boton.classList.remove('a-ocupado');
        }
      });
      cuerpo.querySelector('[data-salir]').addEventListener('click', () => cerrarSesion?.({ alTerminar: cerrar }));
      cuerpo.querySelector('[data-eliminar]').addEventListener('click', () => eliminarCuenta?.({ alTerminar: cerrar }));
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
            EM.MODO_REAL
              ? ['¿Cómo pago?', 'En efectivo, directamente al conductor, al terminar el viaje.']
              : ['¿Cómo pago?', 'En efectivo al conductor o con QR. El pago con QR de esta demo es de PRUEBA: no se mueve dinero real.'],
            ['¿Qué hago si me siento inseguro?', 'Toca SOS durante el viaje para llamar a la Línea 123 o avisarle a tu contacto de emergencia. También puedes compartir tu viaje por WhatsApp.'],
            !EM.MODO_REAL && ['¿Cómo funciona la tarjeta de viajes?', 'Cada viaje completado suma un sello. Al completar 10, el siguiente viaje tiene 50 % de descuento.'],
            ['¿Puedo pedir para otra persona?', 'Sí: elige el punto de recogida en el mapa y escribe en la nota para quién es el servicio.'],
            EM.MODO_REAL && ['¿Cómo elimino mi cuenta?', 'En el menú, toca «Mi cuenta» y luego «Eliminar mi cuenta». También está en Ajustes, en «Tu cuenta».'],
          ].filter(Boolean).map(([p, r]) => `<details class="a-faq"><summary>${esc(p)}${icono('abajo', { tam: 18 })}</summary><p>${esc(r)}</p></details>`).join('')}
        </section>
        ${EM.MODO_REAL ? `<section class="a-grupo"><h3>Tus datos</h3>${enlacePrivacidad()}</section>` : ''}`;
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


