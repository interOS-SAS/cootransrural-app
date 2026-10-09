// «Lejos de toda cooperativa» en el diseño A (modo real, 9-oct-2026). La cuenta y las reglas están en nucleo/lejos.js:
//  - avisoConductor(caja, …): «Todavía no hay una cooperativa de TaxiCun cerca de ti» con sus tres opciones (va en la
//    capa de cuenta del conductor, como un paso más del registro).
//  - avisoPasajero(app, …): «Todavía no llegamos a tu zona» con «Avísame cuando llegue» y «Ver cómo funciona» (diálogo).
//  - formularioInteresado(…): municipio, cooperativa, nombre, celular y la casilla de la autorización → POST
//    /api/interesados (rol conductor o pasajero; contrato en nucleo/lejos.js).
// Todo lo que escribió la persona o vino del servidor se pinta con textContent (nunca como HTML).
import { el, esc, icono, celularTexto, modal } from './ui.js';
import * as EM from './empresa.js';

// La demostración: enlace (target _blank) a la app de siempre sin el servidor. En la app nativa lo abre el navegador de
// adentro (plataforma.js): ahí la demo funciona y la app sigue donde estaba.
function enlaceDemo(N, rol, clase = 'a-btn a-btn-suave a-btn-grande') {
  const href = N.urlInterna(N.lejos.urlDemostracion(N.urlApp, rol));
  if (!href) return '';
  return `<a class="${clase}" href="${esc(href)}" target="_blank" rel="noopener" data-lejos-demo>${icono('externo', { tam: 20 })}<span>Ver cómo funciona</span></a>`;
}

// Formulario corto de interesados. Devuelve el <form> listo; alEnviado(datos) al guardar; alVolver() con «Volver».
// inicial: { nombre, celular } de la cuenta; km: la distancia que dio /api/cercania (va como distanciaKm). Errores del
// servidor: el texto; si la ruta no existe o no hay red, cómo escribir a info@taxicun.com.
// El servidor toma por trampa un envío a menos de 3 s de abrir el formulario o con el campo escondido «sitioWeb» lleno:
// se manda tiempoMs (desde que se pintó; si fue más rápido, la app espera a completar ESPERA_MINIMA_MS) y sitioWeb tal
// como quedó (una persona no lo ve ni lo llena).
export function formularioInteresado({ N, rol = 'conductor', km = null, inicial = {}, alEnviado = () => {}, alVolver = null }) {
  const conductor = rol === 'conductor';
  const T = N.lejos.TOPES;
  const abierto = Date.now();
  const f = el(`<form class="a-ingreso-form a-lejos-form" novalidate data-lejos-form="${conductor ? 'conductor' : 'pasajero'}">
      <h1 tabindex="-1">${conductor ? 'Quiero TaxiCun en mi cooperativa' : 'Avísame cuando llegue'}</h1>
      <p class="a-sub">${conductor
        ? 'Déjanos tus datos y le contamos a interOS. Te escribimos para llevar TaxiCun a tu cooperativa.'
        : 'Déjanos tu municipio y tu celular. Te avisamos cuando TaxiCun llegue a tu zona.'}</p>
      <label class="a-campo">
        <span>${conductor ? 'Municipio' : '¿En qué municipio estás?'}</span>
        <input name="municipio" autocomplete="address-level2" autocapitalize="words" maxlength="${T.municipio}" placeholder="Ej.: Fusagasugá" required>
      </label>
      <label class="a-campo">
        <span>${conductor ? 'Tu cooperativa o empresa de taxis' : 'Cooperativa de taxis de tu municipio <small>(opcional)</small>'}</span>
        <input name="cooperativa" autocomplete="organization" autocapitalize="words" maxlength="${T.cooperativa}" placeholder="${conductor ? 'Ej.: Cootransfusa' : 'Si la conoces'}"${conductor ? ' required' : ''}>
      </label>
      <label class="a-campo">
        <span>Nombre y apellido</span>
        <input name="nombre" autocomplete="name" autocapitalize="words" maxlength="${T.nombre}" placeholder="Ej.: Luis Alberto Rodríguez" required>
      </label>
      <label class="a-campo">
        <span>Celular</span>
        <span class="a-campo-tel"><span class="a-prefijo">+57</span><input name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" maxlength="12" required></span>
      </label>
      <label class="a-check a-lejos-autorizo">
        <input type="checkbox" name="autorizo" required>
        <span class="a-check-caja" aria-hidden="true">${icono('check', { tam: 16, grosor: 3 })}</span>
        <span data-autorizacion></span>
      </label>
      <label class="a-solo-lector" aria-hidden="true">Sitio web (déjalo vacío)<input name="sitioWeb" tabindex="-1" autocomplete="off"></label>
      <p class="a-error" data-error role="alert"></p>
      <p class="a-lejos-correo" data-correo hidden></p>
      <button type="submit" class="a-btn a-btn-primario a-btn-grande">${icono('mensaje', { tam: 20 })}<span>Enviar</span></button>
      ${alVolver ? '<div class="a-ingreso-acciones"><button type="button" class="a-btn-texto" data-volver>Volver</button></div>' : ''}
      <p class="a-nota-prueba">${icono('candado', { tam: 16 })}<span>Solo los usa el equipo de TaxiCun para contactarte. No se publican.</span></p>
    </form>`);
  // El texto de la autorización, TAL CUAL (versión en nucleo/lejos.js), y lo de la cuenta como valor (no en el HTML).
  f.querySelector('[data-autorizacion]').textContent = N.lejos.AUTORIZACION.texto;
  f.nombre.value = String(inicial.nombre || '').slice(0, T.nombre);
  f.celular.value = celularTexto(String(inicial.celular || '').replace(/\D/g, '').slice(0, 10)) || '';
  const error = f.querySelector('[data-error]');
  const correo = f.querySelector('[data-correo]');
  f.celular.addEventListener('input', () => {
    const d = f.celular.value.replace(/\D/g, '').slice(0, 10);
    f.celular.value = celularTexto(d) || d;
  });
  f.addEventListener('input', (e) => {
    e.target.classList?.remove('a-invalido');
    if (!f.querySelector('.a-invalido')) error.textContent = '';
  });
  f.querySelector('[data-volver]')?.addEventListener('click', () => alVolver?.());
  // Sin la ruta en el servidor (anterior a la ronda) o sin red: cómo escribirnos.
  const mostrarCorreo = () => {
    const href = N.enlaceCorreo(N.lejos.CORREO_INFO);
    correo.replaceChildren();
    correo.append('También puedes escribirnos a ');
    const a = document.createElement('a');
    a.textContent = N.lejos.CORREO_INFO;
    if (href) a.href = href;
    correo.append(a, '.');
    correo.hidden = false;
  };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = N.lejos.revisarInteresado({ rol, municipio: f.municipio.value, cooperativa: f.cooperativa.value, nombre: f.nombre.value, celular: f.celular.value, autorizo: f.autorizo.checked });
    if (r.error) {
      error.textContent = r.error.texto;
      f[r.error.campo]?.classList.add('a-invalido');
      f[r.error.campo]?.focus();
      return;
    }
    const b = f.querySelector('[type="submit"]');
    if (b.disabled) return;
    b.disabled = true;
    b.classList.add('a-ocupado');
    try {
      // Una persona rápida (nombre y celular ya vienen de la cuenta) puede enviar antes de los 3 s que el servidor toma
      // por trampa y su envío se perdería sin aviso: la app espera lo que falta, con el botón ocupado.
      const falta = N.lejos.ESPERA_MINIMA_MS - (Date.now() - abierto);
      if (falta > 0) await new Promise((listo) => { setTimeout(listo, falta); });
      if (!f.isConnected) return;
      await N.servidor.interesado(N.lejos.cuerpoInteresado(r.datos, { distanciaKm: km, tiempoMs: Date.now() - abierto, sitioWeb: f.sitioWeb.value }));
      alEnviado(r.datos);
    } catch (err) {
      b.disabled = false;
      b.classList.remove('a-ocupado');
      if (err?.codigo === 'sin_sesion') return;
      const sinRuta = N.servidor.rutaNoDisponible(err);
      error.textContent = sinRuta ? 'No pudimos enviar tus datos ahora.' : N.textoError(err);
      if (sinRuta || err?.codigo === 'sin_red' || err?.codigo === 'error_interno') mostrarCorreo();
    }
  });
  return f;
}

// Mensaje de «Gracias» después de enviar (texto de la persona con textContent).
function gracias(N, rol, datos) {
  const caja = el(`<div class="a-lejos-gracias" role="status" data-lejos-gracias>
      <div class="a-lejos-ico a-lejos-ico-ok" aria-hidden="true">${icono('check', { tam: 30, grosor: 3 })}</div>
      <h1 tabindex="-1"></h1>
      <p class="a-sub" data-texto></p>
    </div>`);
  caja.querySelector('h1').textContent = `¡Gracias, ${String(datos.nombre || '').split(' ')[0]}!`;
  const cel = celularTexto(datos.celular);
  caja.querySelector('[data-texto]').textContent = rol === 'conductor'
    ? `Le contamos a interOS que quieres TaxiCun en ${datos.cooperativa} (${datos.municipio}). Te escribimos al ${cel}.`
    : `Te avisamos al ${cel} cuando TaxiCun llegue a ${datos.municipio}.`;
  return caja;
}

// Conductor: el aviso dentro de la capa de cuenta. caja: el contenedor del paso (ponerPaso).
// cercana: { km, lugar } (lo que dijo /api/cercania: a cuántos km está la cooperativa real más cercana y dónde queda).
// alContinuar(): «Sí soy de …, continuar».
export function avisoConductor(caja, { N, cercana, inicial = {}, alContinuar, alSalir }) {
  const nombre = EM.NOMBRE;
  const pintarAviso = () => {
    caja.replaceChildren(el(`<div class="a-ingreso-form a-lejos" data-lejos="conductor">
        <div class="a-lejos-ico" aria-hidden="true">${icono('pin', { tam: 30 })}</div>
        <h1 tabindex="-1">Todavía no hay una cooperativa de TaxiCun cerca de ti</h1>
        <p class="a-sub" data-lejos-texto></p>
        <button type="button" class="a-btn a-btn-primario a-btn-grande" data-lejos-quiero>${icono('mensaje', { tam: 20 })}<span>Quiero TaxiCun en mi cooperativa</span></button>
        ${enlaceDemo(N, 'conductor')}
        <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-lejos-continuar>${icono('adelante', { tam: 20 })}<span>${esc(`Sí soy de ${nombre}, continuar`)}</span></button>
        <div class="a-ingreso-acciones"><button type="button" class="a-btn-texto" data-salir>Cerrar sesión</button></div>
      </div>`));
    const donde = cercana?.lugar || '';
    caja.querySelector('[data-lejos-texto]').textContent = donde && Number.isFinite(cercana?.km)
      ? `Estás a unos ${N.lejos.kmTexto(cercana.km)} de ${donde}, donde está la cooperativa de TaxiCun más cercana. Si tu cooperativa quiere TaxiCun, cuéntanos.`
      : 'Por ahora TaxiCun funciona con pocas cooperativas de Cundinamarca. Si tu cooperativa quiere TaxiCun, cuéntanos.';
    caja.querySelector('[data-lejos-quiero]').addEventListener('click', pintarFormulario);
    caja.querySelector('[data-lejos-continuar]').addEventListener('click', () => alContinuar?.());
    caja.querySelector('[data-salir]').addEventListener('click', () => alSalir?.());
    caja.querySelector('h1').focus({ preventScroll: true });
  };
  const pintarFormulario = () => {
    const f = formularioInteresado({
      N, rol: 'conductor', km: cercana?.km ?? null, inicial,
      alVolver: pintarAviso,
      alEnviado: (datos) => {
        const g = gracias(N, 'conductor', datos);
        const acciones = el(`<div class="a-lejos-acciones">
            ${enlaceDemo(N, 'conductor')}
            <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-lejos-continuar>${icono('adelante', { tam: 20 })}<span>${esc(`Sí soy de ${nombre}, continuar`)}</span></button>
          </div>`);
        acciones.querySelector('[data-lejos-continuar]').addEventListener('click', () => alContinuar?.());
        const envoltura = el('<div class="a-ingreso-form a-lejos"></div>');
        envoltura.append(g, acciones);
        caja.replaceChildren(envoltura);
        g.querySelector('h1').focus({ preventScroll: true });
      },
    });
    caja.replaceChildren(f);
    f.querySelector('h1').focus({ preventScroll: true });
  };
  pintarAviso();
}

// Pasajero: el diálogo. Devuelve la promesa del modal (se resuelve al cerrarlo: 'enviado' | null).
// km: lo que dijo /api/cercania (va con el interesado).
export function avisoPasajero(app, { N, km = null, inicial = {} }) {
  let enviado = false;
  return modal(app, {
    titulo: 'Todavía no llegamos a tu zona',
    clase: 'a-modal-lejos',
    icono: `<div class="a-lejos-ico">${icono('pin', { tam: 30 })}</div>`,
    texto: `TaxiCun todavía no tiene una cooperativa cerca de donde estás. Por ahora funciona en ${EM.PUEBLO || 'algunos municipios'} y pronto en más municipios de Cundinamarca.`,
    acciones: [],
    // Un contenedor propio: modal() quita el cuerpo vacío antes de alAbrir.
    cuerpo: el('<div class="a-lejos-cuerpo"></div>'),
    alAbrir: (cuerpoModal, cerrar, caja) => {
      const cuerpo = cuerpoModal.querySelector('.a-lejos-cuerpo');
      const pintarOpciones = () => {
        cuerpo.replaceChildren(el(`<div class="a-lejos-acciones" data-lejos="pasajero">
            <button type="button" class="a-btn a-btn-primario a-btn-grande" data-lejos-avisame>${icono('campana', { tam: 20 })}<span>Avísame cuando llegue</span></button>
            ${enlaceDemo(N, 'pasajero')}
            <button type="button" class="a-btn-texto" data-lejos-cerrar>Ahora no</button>
          </div>`));
        cuerpo.querySelector('[data-lejos-avisame]').addEventListener('click', pintarFormulario);
        cuerpo.querySelector('[data-lejos-demo]')?.addEventListener('click', () => setTimeout(() => cerrar(null), 50));
        cuerpo.querySelector('[data-lejos-cerrar]').addEventListener('click', () => cerrar(null));
      };
      const encabezado = (ver) => {
        caja.querySelectorAll(':scope > h2, :scope > .a-modal-texto, :scope > .a-modal-ico').forEach((n) => { n.hidden = !ver; });
      };
      const pintarFormulario = () => {
        encabezado(false);
        const f = formularioInteresado({
          N, rol: 'pasajero', km, inicial,
          alVolver: () => {
            encabezado(true);
            pintarOpciones();
          },
          alEnviado: (datos) => {
            enviado = true;
            const g = gracias(N, 'pasajero', datos);
            const listo = el(`<div class="a-lejos-acciones">${enlaceDemo(N, 'pasajero')}<button type="button" class="a-btn a-btn-tinta a-btn-grande" data-lejos-listo><span>Listo</span></button></div>`);
            listo.querySelector('[data-lejos-listo]').addEventListener('click', () => cerrar('enviado'));
            listo.querySelector('[data-lejos-demo]')?.addEventListener('click', () => setTimeout(() => cerrar('enviado'), 50));
            cuerpo.replaceChildren(g, listo);
            g.querySelector('h1').focus({ preventScroll: true });
          },
        });
        cuerpo.replaceChildren(f);
        f.querySelector('input[name="municipio"]').focus({ preventScroll: true });
      };
      pintarOpciones();
    },
  }).then((v) => (enviado ? 'enviado' : v));
}
