// Ronda B de «algoritmos» (servidor 0.15.0) en el diseño A, modo real: la tarjeta «¿Todo bien en tu viaje?» del pasajero
// (el contrato y los textos están en nucleo/seguridad.js; el estado en p.estado.pregunta, ver nucleo/pasajero.js).
//
//   const tarjeta = montarSeguridad(app, { p, alAyuda: () => sos({ desdeSeguridad: true }) });
//   tarjeta.pintar();   // con cada 'cambio' del pasajero: pone, cambia o quita la tarjeta
//
// Capa propia (a-modal-seguridad, role="alertdialog", aria-live="assertive"), encima de todo lo demás: no se cierra
// tocando afuera ni con Escape; el foco va a «Sí, todo bien». Cuenta regresiva hasta que la central avise; «avisada»
// (la central ya sabe) con los mismos dos botones; si la respuesta no sale, «Intentar de nuevo». «Necesito ayuda» la
// manda y abre el SOS de siempre (alAyuda). Cuando la tarjeta queda a la vista con la app visible, p.vistaSeguridad().
// Todo se pinta con textContent: lo que manda la central solo elige entre textos fijos (nunca HTML).
import * as N from '../../nucleo/index.js';
import { el, icono } from './ui.js';

let contador = 0;

export function montarSeguridad(app, { p, alAyuda = () => {} }) {
  const t = p.textosSeguridad();
  let capa = null;
  let partes = null;
  let reloj = null;
  let actual = null; // preguntaId de la tarjeta a la vista
  let ultimaRespuesta = 'bien';

  function construir() {
    const id = `a-seg-${++contador}`;
    capa = el(`<div class="a-modal-capa a-modal-seguridad" data-seguridad>
      <div class="a-modal" role="alertdialog" aria-modal="true" aria-live="assertive" aria-labelledby="${id}-t" aria-describedby="${id}-m ${id}-c">
        <div class="a-modal-ico"><span class="a-seg-ico">${icono('escudo', { tam: 34 })}</span></div>
        <h2 id="${id}-t" data-seg-titulo></h2>
        <p class="a-seg-motivo" id="${id}-m" data-seg-motivo></p>
        <p class="a-seg-cuenta" id="${id}-c" data-seg-cuenta></p>
        <p class="a-seg-estado" role="status" data-seg-estado hidden></p>
        <div class="a-modal-acciones">
          <button type="button" class="a-btn a-btn-primario" data-seg-bien><span></span></button>
          <button type="button" class="a-btn a-btn-peligro" data-seg-ayuda><span></span></button>
          <button type="button" class="a-btn a-btn-suave" data-seg-reintentar hidden><span></span></button>
        </div>
      </div>
    </div>`);
    partes = {
      caja: capa.querySelector('.a-modal'),
      titulo: capa.querySelector('[data-seg-titulo]'),
      motivo: capa.querySelector('[data-seg-motivo]'),
      cuenta: capa.querySelector('[data-seg-cuenta]'),
      estado: capa.querySelector('[data-seg-estado]'),
      bien: capa.querySelector('[data-seg-bien]'),
      ayuda: capa.querySelector('[data-seg-ayuda]'),
      reintentar: capa.querySelector('[data-seg-reintentar]'),
    };
    partes.bien.querySelector('span').textContent = t.bien;
    partes.ayuda.querySelector('span').textContent = t.ayuda;
    partes.reintentar.querySelector('span').textContent = t.reintentar;
    partes.bien.addEventListener('click', () => responder('bien'));
    partes.ayuda.addEventListener('click', () => responder('ayuda'));
    partes.reintentar.addEventListener('click', () => responder(ultimaRespuesta));
    // Ni tocar afuera ni Escape la cierran: solo una respuesta (o la central).
    capa.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') e.stopPropagation();
    });
    app.append(capa);
    requestAnimationFrame(() => {
      capa?.classList.add('a-abierto');
      partes?.bien.focus({ preventScroll: true });
    });
    reloj = setInterval(pintarCuenta, 1000);
  }

  function quitar() {
    clearInterval(reloj);
    reloj = null;
    actual = null;
    if (!capa) return;
    const vieja = capa;
    capa = null;
    partes = null;
    vieja.classList.remove('a-abierto');
    setTimeout(() => vieja.remove(), 260);
  }

  function responder(respuesta) {
    ultimaRespuesta = respuesta;
    p.responderSeguridad(respuesta);
    if (respuesta === 'ayuda') alAyuda();
  }

  // El título dice «¿Llegaste bien?» si la central lo dice o si el viaje ya no está en curso.
  function despues(q) {
    const e = p.estado;
    return q.despues || e.fase !== 'en_viaje' || e.viaje?.id !== q.viajeId;
  }

  function estadoVisible(q) {
    return q.estado === 'enviando' ? q.antes || 'abierta' : q.estado;
  }

  function pintarCuenta() {
    const q = p.estado.pregunta;
    if (!partes || !q) return;
    const abierta = estadoVisible(q) === 'abierta';
    partes.cuenta.hidden = !abierta;
    if (abierta) partes.cuenta.textContent = t.cuenta(N.seguridad.cuentaRegresiva(q.venceEn - Date.now()));
  }

  function pintar() {
    const q = p.estado.pregunta;
    // Sin pregunta, o pidió ayuda (el SOS ya está abierto): sin tarjeta.
    if (!q || (q.estado === 'enviando' && q.respuesta === 'ayuda')) return quitar();
    const nueva = !capa;
    if (nueva) construir();
    const visible = estadoVisible(q);
    const avisada = visible === 'avisada';
    partes.caja.dataset.estado = visible;
    partes.titulo.textContent = avisada ? t.avisadaTitulo : despues(q) ? t.tituloDespues : t.titulo;
    partes.motivo.textContent = avisada ? t.avisadaTexto : t.motivo(q.motivo, q.subtipo);
    partes.motivo.hidden = !partes.motivo.textContent;
    pintarCuenta();
    const enviando = q.estado === 'enviando';
    partes.estado.hidden = !enviando && !q.error;
    partes.estado.textContent = enviando ? t.enviando : q.error ? t.error : '';
    partes.estado.classList.toggle('a-seg-error', Boolean(q.error) && !enviando);
    partes.reintentar.hidden = !q.error || enviando;
    partes.bien.disabled = enviando && q.respuesta === 'bien';
    if (actual !== q.preguntaId) {
      actual = q.preguntaId;
      if (!nueva) partes.bien.focus({ preventScroll: true });
    }
    vista();
  }

  // La tarjeta está a la vista con la app visible: la central lo anota (una vez por pregunta; el núcleo lo cuida).
  function vista() {
    if (!capa || document.hidden) return;
    p.vistaSeguridad();
  }
  document.addEventListener('visibilitychange', vista);

  return { pintar, quitar };
}
