// Promoción «Viaje gratis» (servidor 0.16.0) en el diseño A, modo real: las piezas que pintan las apps del pasajero y
// del conductor (DISENO-PROMOCIONES.md §13 y §14). La lógica y los textos están en nucleo/promo.js; el estado, en
// p.estado.promo / viaje.promo (pasajero) y viaje.promo / viaje.promoFinal (conductor).
//
// Pasajero: la tarjeta del inicio («Llevas 7 de 10»), el interruptor «Usar mi viaje gratis» de «Confirma tu viaje» (apagado
// por defecto), el chip «Viaje gratis» del viaje, lo de la pantalla de pagar, el modal del premio, el de
// premio_no_disponible, el aviso de promo_app y la hoja «Promociones» (con los viajes de la tarjeta y los términos).
// Conductor: lo que ve antes de aceptar («TaxiCun te paga $X + bono $Y»), el chip en el viaje, la línea de «¿Cuánto
// cobras?», el cobro («El pasajero no te paga» / «Cobra $300 al pasajero») y «Pagos de TaxiCun» con las condiciones.
// Todo lo que viene del servidor son números y códigos ya validados; los textos los arma la app y van escapados (esc) o
// con textContent: nada llega como HTML.
import * as N from '../../nucleo/index.js';
import { el, esc, $, icono, modal, abrirPanel, ponerTexto, franjaCuadros } from './ui.js';
import { sellosFidelidad } from './ilustraciones.js';

const P = N.promo;
const pesos = (n) => N.pesos(n);
export const urlTerminos = () => N.urlDelSitio(P.RUTA_TERMINOS);
const enlaceTerminos = (texto = 'Términos y condiciones') => {
  const url = urlTerminos();
  return url ? `<a class="a-promo-terminos" href="${esc(url)}" target="_blank" rel="noopener" data-promo-terminos>${icono('documento', { tam: 16 })}<span>${esc(texto)}</span></a>` : '';
};

/* ================= pasajero ================= */

// La tarjeta del inicio (reutiliza .a-fid-mini). '' si no hay nada que mostrar.
export function htmlTarjetaInicio(promo) {
  const t = P.tarjetaInicio(promo, { pesos });
  if (!t) return '';
  const anillo = 2 * Math.PI * 19;
  return `<button type="button" class="a-fid-mini a-promo-mini" data-promos data-promo-tipo="${esc(t.tipo)}">
    <span class="a-anillo" aria-hidden="true"><svg viewBox="0 0 44 44" width="46" height="46"><circle cx="22" cy="22" r="19" class="a-anillo-fondo"/><circle cx="22" cy="22" r="19" class="a-anillo-valor" style="stroke-dasharray:${anillo};stroke-dashoffset:${anillo * (1 - t.frac)}"/></svg><b data-promo-anillo>${esc(t.anillo)}</b></span>
    <span class="a-fid-mini-txt"><strong data-promo-titulo>${esc(t.titulo)}</strong><small data-promo-sub>${esc(t.sub)}</small></span>
    ${icono('adelante', { tam: 18 })}
  </button>`;
}

// Pone (o quita) la tarjeta en su caja si cambió. Devuelve true si cambió algo.
export function pintarTarjetaInicio(caja, promo) {
  if (!caja) return false;
  const html = htmlTarjetaInicio(promo);
  if (caja.dataset.firma === html) return false;
  caja.dataset.firma = html;
  caja.innerHTML = html;
  caja.hidden = !html;
  return true;
}

// «Confirma tu viaje»: la fila «Usar mi viaje gratis» y lo que paga cada uno. Devuelve los textos (para el botón) o null
// si no hay premio usable aquí (la caja queda escondida).
export function pintarConfirmar(caja, { promo, tarifa, conDestino, usar, alCambiar }) {
  if (!caja) return null;
  if (!P.premioUsable(promo)) {
    caja.hidden = true;
    caja.replaceChildren();
    return promo ? P.textosConfirmar({ promo, vp: null, usar: false, conDestino, pesos }) : null;
  }
  const vp = tarifa ? P.vistaPrevia({ tarifa: tarifa.total, promo, cotizacionPromo: tarifa.promo || null }) : null;
  const t = P.textosConfirmar({ promo, vp, usar, conDestino, minima: tarifa?.total ?? null, pesos });
  if (!caja.querySelector('[data-usar-premio]')) {
    caja.innerHTML = `<div class="a-fila-interruptor a-promo-fila">
        <span class="a-fila-ico a-promo-ico">${icono('regalo', { tam: 20 })}</span>
        <span class="a-fila-txt"><strong data-promo-interruptor></strong><small data-promo-sub-interruptor></small></span>
        <button type="button" role="switch" class="a-interruptor" data-usar-premio aria-checked="false"><span></span></button>
      </div>
      <p class="a-promo-linea" data-promo-linea role="status" hidden></p>
      <p class="a-promo-nota" data-promo-nota hidden></p>`;
    const b = caja.querySelector('[data-usar-premio]');
    b.setAttribute('aria-label', 'Usar mi viaje gratis');
    b.addEventListener('click', () => alCambiar?.(b.getAttribute('aria-checked') !== 'true'));
  }
  caja.hidden = false;
  ponerTexto(caja, '[data-promo-interruptor]', t.interruptor);
  ponerTexto(caja, '[data-promo-sub-interruptor]', t.subInterruptor);
  caja.querySelector('[data-usar-premio]').setAttribute('aria-checked', String(Boolean(usar)));
  const linea = caja.querySelector('[data-promo-linea]');
  linea.textContent = t.linea;
  linea.hidden = !t.linea;
  linea.classList.toggle('a-promo-gratis', Boolean(usar && vp && vp.pasajeroPaga === 0));
  const nota = caja.querySelector('[data-promo-nota]');
  nota.textContent = t.nota;
  nota.hidden = !t.nota;
  return t;
}

// La línea de la tarjeta en «Confirma tu viaje» (.a-fid-linea).
export function pintarLineaTarjeta(caja, promo, texto) {
  if (!caja) return;
  const mostrar = Boolean(promo && texto);
  caja.hidden = !mostrar;
  if (!mostrar) return;
  const frac = promo.meta ? Math.min(1, promo.llevas / promo.meta) : 0;
  const barra = caja.querySelector('.a-fid-barra span');
  if (barra) barra.style.width = `${frac * 100}%`;
  ponerTexto(caja, 'small', texto);
}

// El chip del viaje gratis en «Buscando» / con el taxi / en viaje (y «Tú pagas $3.200» si aplica).
export function htmlChipViaje(viaje) {
  if (!viaje || (!viaje.premioId && !viaje.promo)) return '';
  const paga = viaje.promo?.pasajeroPaga;
  return `<p class="a-promo-chip-viaje" data-chip-promo>${icono('regalo', { tam: 16 })}<b>Viaje gratis</b>${paga > 0 ? `<span>Tú pagas ${esc(pesos(paga))}</span>` : ''}</p>`;
}
export function pintarChipViaje(raiz, viaje) {
  const caja = raiz?.querySelector('[data-promo-viaje]');
  if (!caja) return;
  const html = htmlChipViaje(viaje);
  if (caja.dataset.firma === html) return;
  caja.dataset.firma = html;
  caja.innerHTML = html;
  caja.hidden = !html;
}

// «Pagar» en el viaje gratis: lo que pagó TaxiCun y lo que paga el pasajero.
export function htmlPagar(final) {
  const t = P.textosPagar(final, { pesos });
  if (!t) return '';
  return `<div class="a-promo-pagar ${final.pasajeroPaga === 0 ? 'a-promo-pagar-gratis' : ''}" data-promo-pagar role="status">
    <span class="a-promo-ico">${icono('regalo', { tam: 22 })}</span>
    <span><strong data-promo-pagar-titulo>${esc(t.titulo)}</strong><small data-promo-pagar-cuerpo>${esc(t.cuerpo)}</small></span>
  </div>`;
}

// El aviso de «Buscando» cuando ningún taxi cerca tiene la app al día (sin_conductores promo_app).
export function htmlPromoApp() {
  return `<div class="a-promo-app" data-promo-app hidden role="status">
    <p>${esc('Los taxis cerca todavía no tienen la app al día para tu viaje gratis.')}</p>
    <div class="a-promo-app-botones">
      <button type="button" class="a-btn a-btn-suave" data-seguir-esperando>Seguir esperando</button>
      <button type="button" class="a-btn a-btn-primario" data-sin-premio>Pedir sin el viaje gratis</button>
    </div>
    <small>${esc('Si pides sin el viaje gratis, lo guardas para otra vez.')}</small>
  </div>`;
}

// «¡Ganaste un viaje gratis!» → 'terminos' si toca «Ver condiciones».
export function modalPremio(app, promo) {
  const t = P.textosPremio(promo, { pesos });
  return modal(app, {
    titulo: t.titulo,
    texto: t.cuerpo,
    clase: 'a-modal-promo',
    icono: `<span class="a-promo-regalo">${icono('regalo', { tam: 40 })}</span>`,
    acciones: [
      { texto: 'Ver condiciones', valor: 'terminos', href: urlTerminos(), externo: true },
      { texto: 'Listo', valor: true, clase: 'a-btn-primario' },
    ],
  });
}

// premio_no_disponible: el pedido no salió. → 'sin' (pedir sin el viaje gratis) o null (volver).
export function modalNoDisponible(app, motivo) {
  return modal(app, {
    titulo: 'No pudimos usar tu viaje gratis',
    texto: P.textoNoDisponible(motivo),
    clase: 'a-modal-promo-no',
    acciones: [
      { texto: 'Volver', valor: null },
      { texto: 'Pedir sin el viaje gratis', valor: 'sin', clase: 'a-btn-primario' },
    ],
  });
}

// La hoja «Promociones» del modo real: la tarjeta, el premio, los viajes de la tarjeta, «Así funciona» y los términos.
export function abrirHojaPromo({ app, p }) {
  return abrirPanel(app, {
    titulo: 'Promociones',
    clase: 'a-panel-promo',
    construir(cuerpo) {
      const pintar = (promo, mia = null, error = false) => {
        cuerpo.replaceChildren();
        if (!promo) {
          cuerpo.append(el(`<p class="a-ayuda-txt">${esc('La promoción «Viaje gratis» no está activa en tu cooperativa.')}</p>`));
          return;
        }
        const t = P.tarjetaInicio(promo, { pesos }) || { titulo: 'Viaje gratis', sub: '' };
        const conPremio = t.tipo === 'premio';
        const llenos = conPremio || promo.llena ? promo.meta : promo.llevas;
        const tarjeta = el(`<div class="a-tarjeta-fid a-tarjeta-promo" data-hoja-promo>
          ${franjaCuadros()}
          <div class="a-tarjeta-fid-cabeza">
            <span><small>Viaje gratis</small><strong data-hoja-titulo></strong></span>
            <span class="a-promo-regalo-chico">${icono('regalo', { tam: 26 })}</span>
          </div>
          ${sellosFidelidad({ completados: llenos, meta: promo.meta, siguienteConDescuento: conPremio, premio: 'Gratis', etiqueta: `${llenos} de ${promo.meta} viajes en tu tarjeta` })}
          <p data-hoja-sub></p>
        </div>`);
        ponerTexto(tarjeta, '[data-hoja-titulo]', conPremio ? t.titulo : `${promo.llevas} de ${promo.meta} viajes`);
        ponerTexto(tarjeta, '[data-hoja-sub]', t.sub);
        cuerpo.append(tarjeta);
        if (promo.premio && ['emitido', 'en_uso'].includes(promo.premio.estado)) {
          const caja = el(`<div class="a-oferta a-promo-caja a-promo-premio" data-hoja-premio>${icono('regalo', { tam: 22 })}<span><strong></strong><small></small></span></div>`);
          caja.querySelector('strong').textContent = `Tu viaje gratis: hasta ${pesos(promo.premio.tope)}`;
          caja.querySelector('small').textContent = promo.canjePausado ? 'El canje está en pausa por unas horas. No pierdes días.' : `Vence el ${P.fechaLarga(promo.premio.vence)}. Lo eliges al confirmar tu viaje.`;
          cuerpo.append(caja);
        }
        const lista = el('<section class="a-promo-lista" data-hoja-viajes><h3 class="a-subtitulo">Viajes de tu tarjeta</h3><ul></ul></section>');
        const ul = lista.querySelector('ul');
        if (mia?.viajes?.length) {
          for (const v of mia.viajes) {
            const l = P.lineaViajeMia(v, { condiciones: promo.condiciones, pesos });
            const li = el(`<li class="${l.sumo ? 'a-promo-sumo' : 'a-promo-no-sumo'}"><b></b><span></span></li>`);
            li.querySelector('b').textContent = l.fecha;
            li.querySelector('span').textContent = l.texto;
            ul.append(li);
          }
        } else {
          const li = el('<li class="a-promo-vacio"><span></span></li>');
          li.querySelector('span').textContent = error ? 'No pudimos cargar tus viajes. Intenta de nuevo en un momento.' : mia ? 'Todavía no hay viajes en esta tarjeta.' : 'Cargando…';
          ul.append(li);
        }
        cuerpo.append(lista);
        const asi = el('<section class="a-promo-asi" data-hoja-asi><h3 class="a-subtitulo">Así funciona</h3><ul></ul></section>');
        for (const linea of P.asiFunciona(promo, { pesos })) {
          const li = el('<li></li>');
          li.textContent = linea;
          asi.querySelector('ul').append(li);
        }
        cuerpo.append(asi);
        const enlace = enlaceTerminos();
        if (enlace) cuerpo.append(el(enlace));
      };
      pintar(p.estado.promo);
      p.promoMia()
        .then((mia) => {
          if (!cuerpo.isConnected) return;
          pintar(mia.promo || p.estado.promo, mia);
        })
        .catch(() => cuerpo.isConnected && pintar(p.estado.promo, null, true));
    },
  });
}

/* ================= conductor ================= */

// Bajo la tarifa de la oferta: chip y lo que paga cada uno (y el aviso de «Cómo me pagan» si ya se sabe que no lo tiene).
export function htmlOferta(promo, { sinComoMePagan = false } = {}) {
  const t = P.textosOferta(promo, { pesos, sinComoMePagan });
  if (!t) return '';
  return `<div class="a-sol-promo" data-sol-promo>
    <span class="a-chip-promo">${icono('regalo', { tam: 14 })} ${esc(t.chip)}</span>
    <strong data-sol-promo-paga>${esc(t.paga)}</strong>
    <small data-sol-promo-pasajero>${esc(t.pasajero)}</small>
    <small class="a-sol-promo-registrar" data-sol-promo-registrar ${t.registrar ? '' : 'hidden'}>${esc(t.registrar)}</small>
  </div>`;
}

export function htmlChipConductor(viaje) {
  if (!viaje?.promo) return '';
  return `<p class="a-promo-chip-viaje a-promo-chip-conductor" data-chip-promo>${icono('regalo', { tam: 16 })}<b>Viaje con promoción</b></p>`;
}

// «Cobrando» del viaje gratis. acciones: { comoMePagan(), condiciones() }.
export function pintarCobrando(caja, viaje, acciones = {}) {
  if (!caja) return null;
  if (!viaje?.promo) {
    caja.hidden = true;
    return null;
  }
  const t = P.textosCobrando({ final: viaje.promoFinal || null, valor: viaje.valor, p: viaje.promo, pesos });
  const firma = JSON.stringify(t);
  if (caja.dataset.firma !== firma) {
    caja.dataset.firma = firma;
    caja.innerHTML = `<span class="a-chip-promo">${icono('regalo', { tam: 14 })} Viaje con promoción</span>
      <strong data-promo-cobro-titulo></strong>
      <p data-promo-cobro-taxicun></p>
      ${t.falta ? `<p class="a-promo-falta" data-promo-falta></p><button type="button" class="a-btn a-btn-suave a-btn-bloque" data-promo-falta-accion></button>` : ''}`;
    ponerTexto(caja, '[data-promo-cobro-titulo]', t.titulo);
    ponerTexto(caja, '[data-promo-cobro-taxicun]', t.taxicun);
    if (t.falta) {
      ponerTexto(caja, '[data-promo-falta]', t.falta);
      const b = caja.querySelector('[data-promo-falta-accion]');
      b.textContent = t.accionFalta === 'como_me_pagan' ? 'Registrar «Cómo me pagan»' : 'Ver las condiciones';
      b.addEventListener('click', () => (t.accionFalta === 'como_me_pagan' ? acciones.comoMePagan?.() : acciones.condiciones?.()));
    }
  }
  caja.hidden = false;
  return t;
}

// La tarjeta de las condiciones de pagos (versión c1) con «Ver términos» y «Acepto». → true si las aceptó.
export async function aceptarCondiciones({ app, c, avisos }) {
  const cuerpo = el(`<div class="a-promo-condiciones"><ul></ul>${enlaceTerminos('Ver términos')}</div>`);
  for (const linea of P.CONDICIONES_CONDUCTOR) {
    const li = el('<li></li>');
    li.textContent = linea;
    cuerpo.querySelector('ul').append(li);
  }
  const si = await modal(app, {
    titulo: 'Condiciones de pagos de la promoción',
    cuerpo,
    clase: 'a-modal-promo-condiciones',
    acciones: [{ texto: 'Ahora no', valor: false }, { texto: 'Acepto', valor: true, clase: 'a-btn-primario' }],
  });
  if (!si) return false;
  try {
    await c.aceptarCondicionesPromo();
    avisos.mostrar({ titulo: 'Aceptaste las condiciones', cuerpo: 'TaxiCun te paga los viajes gratis en la liquidación semanal.', tipo: 'exito' });
    return true;
  } catch (e) {
    avisos.mostrar({ titulo: 'No pudimos guardar tu respuesta', cuerpo: N.textoError(e), tipo: 'error' });
    return false;
  }
}

// «Pagos de TaxiCun»: semanas, viajes, el estado de «Cómo me pagan», las condiciones y los términos.
export function abrirPagosTaxiCun({ app, c, avisos, abrirComoMePagan }) {
  return abrirPanel(app, {
    titulo: 'Pagos de TaxiCun',
    clase: 'a-panel-promo a-panel-pagos-promo',
    construir(cuerpo, cerrar) {
      const cargar = async () => {
        cuerpo.replaceChildren(el('<p class="a-ayuda-txt" data-cargando>Cargando…</p>'));
        let r;
        try {
          r = await c.pagosPromo();
        } catch (e) {
          cuerpo.replaceChildren();
          const p = el('<p class="a-pq-error" data-error-pagos></p>');
          p.textContent = N.servidor.rutaNoDisponible(e) ? 'Esta función todavía no está disponible. Intenta más tarde.' : N.textoError(e);
          const otra = el('<button type="button" class="a-btn a-btn-suave">Intentar de nuevo</button>');
          otra.addEventListener('click', cargar);
          cuerpo.append(p, otra);
          return;
        }
        if (!cuerpo.isConnected) return;
        cuerpo.replaceChildren();
        cuerpo.append(el(`<p class="a-ayuda-txt">${esc('Por cada viaje gratis, TaxiCun te paga lo que cubre del viaje más un bono. Te pagamos cada semana.')}</p>`));
        if (!r.condiciones.aceptadas) {
          const caja = el(`<div class="a-oferta a-promo-caja a-promo-pendiente" data-pagos-condiciones>${icono('documento', { tam: 22 })}<span><strong>Condiciones de pagos de la promoción</strong><small>${esc('Acéptalas para que TaxiCun te pague los viajes gratis.')}</small></span><button type="button" class="a-btn a-btn-primario a-btn-chico" data-ver-condiciones>Ver</button></div>`);
          caja.querySelector('[data-ver-condiciones]').addEventListener('click', async () => {
            if (await aceptarCondiciones({ app, c, avisos })) cargar();
          });
          cuerpo.append(caja);
        }
        const cobro = el(`<div class="a-oferta a-promo-caja" data-pagos-como-me-pagan>${icono('dinero', { tam: 22 })}<span><strong></strong><small></small></span></div>`);
        cobro.querySelector('strong').textContent = r.comoMePagan ? '«Cómo me pagan» registrado' : 'Sin «Cómo me pagan»';
        cobro.querySelector('small').textContent = r.comoMePagan ? 'Te pagamos a la llave que registraste.' : 'Regístralo para recibir tus pagos.';
        if (!r.comoMePagan && abrirComoMePagan) {
          const b = el('<button type="button" class="a-btn a-btn-primario a-btn-chico" data-registrar-cobro>Registrar</button>');
          b.addEventListener('click', () => {
            cerrar();
            setTimeout(abrirComoMePagan, 250);
          });
          cobro.append(b);
        }
        cuerpo.append(cobro);
        const sem = el('<section class="a-promo-lista" data-pagos-semanas><h3 class="a-subtitulo">Semanas</h3><ul></ul></section>');
        for (const s of r.semanas) {
          const li = el(`<li class="a-promo-semana-${esc(s.estado)}"><span></span></li>`);
          li.querySelector('span').textContent = P.lineaSemana(s, { pesos });
          sem.querySelector('ul').append(li);
        }
        if (!r.semanas.length) {
          const li = el('<li class="a-promo-vacio"><span></span></li>');
          li.querySelector('span').textContent = 'Todavía no tienes liquidaciones.';
          sem.querySelector('ul').append(li);
        }
        cuerpo.append(sem);
        const via = el('<section class="a-promo-lista" data-pagos-viajes><h3 class="a-subtitulo">Viajes gratis</h3><ul></ul></section>');
        for (const v of r.viajes) {
          const li = el('<li><span></span></li>');
          li.querySelector('span').textContent = P.lineaViajePago(v, { pesos });
          via.querySelector('ul').append(li);
        }
        if (!r.viajes.length) {
          const li = el('<li class="a-promo-vacio"><span></span></li>');
          li.querySelector('span').textContent = 'Todavía no has hecho viajes gratis.';
          via.querySelector('ul').append(li);
        }
        cuerpo.append(via);
        const enlace = enlaceTerminos();
        if (enlace) cuerpo.append(el(enlace));
      };
      cargar();
    },
  });
}
