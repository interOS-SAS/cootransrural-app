// Bienvenida (3 diapositivas ilustradas) y registro del pasajero con
// verificación por SMS SIMULADA. Sin registro no se puede pedir taxi.
import { el, esc, icono, casillasCodigo, celularTexto, franjaCuadros, nombreCorto } from './ui.js';
import { ilustracionUbicacion, ilustracionSeguridad, ilustracionPago } from './ilustraciones.js';

const DIAPOSITIVAS = [
  { ilus: ilustracionUbicacion, titulo: 'Tu taxi llega a tu puerta', texto: 'Pides con tu ubicación exacta y el móvil más cercano de Cootransrural va por ti, a tu casa o a tu negocio.', puntos: [['pin', 'GPS exacto'], ['auto', '52\u00a0taxis'], ['reloj', '24\u00a0horas']] },
  { ilus: ilustracionSeguridad, titulo: 'Sabes quién te recoge', texto: 'Ves al conductor, el número de móvil, la placa y un código de abordaje. Compartes tu viaje y tienes botón de emergencia.', puntos: [['escudo', 'Placa y móvil'], ['candado', 'Código de 4 dígitos'], ['sos', 'SOS']] },
  { ilus: ilustracionPago, titulo: 'Pagas fácil y ahorras', texto: 'Paga en efectivo o con QR. Programa con 24\u00a0h y ahorra 10\u00a0%. Cada 10 viajes, el siguiente va al 50\u00a0%.', puntos: [['qr', 'QR de prueba'], ['calendario', '−10\u00a0% programando'], ['regalo', 'Viaje 11 al 50\u00a0%']] },
];

export function mostrarBienvenida(app, { N, alTerminar }) {
  const capa = el(`<div class="a-bienvenida" role="dialog" aria-modal="true" aria-label="Bienvenida a Cootransrural"></div>`);
  app.append(capa);
  const datos = { nombre: '', celular: '', contacto: { nombre: '', celular: '' } };
  let codigo = '';
  let relojReenvio = null;

  /* ---------- diapositivas ---------- */
  function diapositivas() {
    capa.innerHTML = `
      <div class="a-bien-carrusel" tabindex="-1">
        ${DIAPOSITIVAS.map((d, i) => `
          <section class="a-bien-diapo" aria-roledescription="diapositiva" aria-label="${i + 1} de ${DIAPOSITIVAS.length}">
            <div class="a-bien-arte">
              <div class="a-bien-burbujas" aria-hidden="true"><span></span><span></span></div>
              ${d.ilus()}
            </div>
            <div class="a-bien-texto">
              <h2>${esc(d.titulo)}</h2>
              <p>${esc(d.texto)}</p>
              <ul class="a-bien-puntos">${d.puntos.map(([ico, t]) => `<li>${icono(ico, { tam: 16 })}${esc(t)}</li>`).join('')}</ul>
            </div>
          </section>`).join('')}
      </div>
      <header class="a-bien-cabeza">
        <div class="a-marca"><img src="../img/icono.svg" alt="" width="34" height="34"><span><strong>Cootransrural</strong><small>El Rosal · desde ${N.EMPRESA.fundada}</small></span></div>
        <button type="button" class="a-btn-texto" data-saltar>Saltar</button>
      </header>
      <footer class="a-bien-pie">
        <div class="a-puntos" role="tablist" aria-label="Diapositivas">${DIAPOSITIVAS.map((_, i) => `<button type="button" role="tab" aria-label="Ir a la diapositiva ${i + 1}" data-ir="${i}"></button>`).join('')}</div>
        <button type="button" class="a-btn a-btn-tinta a-btn-grande" data-siguiente><span>Siguiente</span>${icono('adelante', { tam: 20 })}</button>
      </footer>`;
    const carrusel = capa.querySelector('.a-bien-carrusel');
    const puntos = [...capa.querySelectorAll('[data-ir]')];
    const btn = capa.querySelector('[data-siguiente]');
    let actual = 0;
    const marcar = () => {
      actual = Math.round(carrusel.scrollLeft / Math.max(1, carrusel.clientWidth));
      puntos.forEach((p, i) => p.setAttribute('aria-selected', String(i === actual)));
      btn.querySelector('span').textContent = actual === DIAPOSITIVAS.length - 1 ? 'Crear mi cuenta' : 'Siguiente';
      btn.classList.toggle('a-btn-primario', actual === DIAPOSITIVAS.length - 1);
      btn.classList.toggle('a-btn-tinta', actual !== DIAPOSITIVAS.length - 1);
    };
    const ir = (i) => carrusel.scrollTo({ left: i * carrusel.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    carrusel.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true });
    puntos.forEach((p) => p.addEventListener('click', () => ir(Number(p.dataset.ir))));
    btn.addEventListener('click', () => (actual < DIAPOSITIVAS.length - 1 ? ir(actual + 1) : registro()));
    capa.querySelector('[data-saltar]').addEventListener('click', registro);
    marcar();
    carrusel.focus({ preventScroll: true });
  }

  /* ---------- formulario ---------- */
  function registro() {
    clearInterval(relojReenvio);
    capa.innerHTML = `
      <form class="a-registro" novalidate>
        <div class="a-registro-cabeza">
          <button type="button" class="a-icono-btn" data-atras aria-label="Volver a la bienvenida">${icono('atras')}</button>
          <span class="a-paso">Paso 1 de 2</span>
        </div>
        <h1>Crea tu cuenta</h1>
        <p class="a-sub">Así el conductor sabe a quién recoger y tú viajas más seguro.</p>
        <label class="a-campo">
          <span>Nombre y apellido</span>
          <input name="nombre" autocomplete="name" autocapitalize="words" placeholder="Ej.: Ana María Gómez" value="${esc(datos.nombre)}" required>
        </label>
        <label class="a-campo">
          <span>Celular</span>
          <span class="a-campo-tel"><span class="a-prefijo">+57</span><input name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" maxlength="12" value="${esc(celularTexto(datos.celular))}" required></span>
        </label>
        <fieldset class="a-emergencia">
          <legend>${icono('escudo', { tam: 18 })} Contacto de emergencia <small>(opcional)</small></legend>
          <p>Le avisas con un toque si algo pasa en tu viaje.</p>
          <div class="a-fila-2">
            <label class="a-campo a-campo-chico"><span>Nombre</span><input name="contactoNombre" autocomplete="off" placeholder="Ej.: Mamá" value="${esc(datos.contacto.nombre)}"></label>
            <label class="a-campo a-campo-chico"><span>Celular</span><input name="contactoCelular" type="tel" inputmode="numeric" placeholder="10 dígitos" maxlength="12" value="${esc(celularTexto(datos.contacto.celular))}"></label>
          </div>
        </fieldset>
        <label class="a-check">
          <input type="checkbox" name="terminos">
          <span class="a-check-caja" aria-hidden="true">${icono('check', { tam: 16, grosor: 3 })}</span>
          <span>Acepto los <a href="../privacidad/" target="_blank" rel="noopener">términos y la política de privacidad</a></span>
        </label>
        <p class="a-error" data-error role="alert"></p>
        <button class="a-btn a-btn-primario a-btn-grande" type="submit">${icono('mensaje', { tam: 20 })}<span>Recibir código por SMS</span></button>
        <p class="a-nota-prueba">${icono('info', { tam: 16 })} Demo: el SMS es simulado y tus datos solo quedan en este celular.</p>
      </form>`;
    const f = capa.querySelector('form');
    const error = capa.querySelector('[data-error]');
    const formatear = (input) => input.addEventListener('input', () => {
      const d = input.value.replace(/\D/g, '').slice(0, 10);
      input.value = celularTexto(d) || d;
    });
    formatear(f.celular);
    formatear(f.contactoCelular);
    // Al corregir un campo se quita la marca roja (y el mensaje, si ya no queda ninguno).
    f.addEventListener('input', (e) => {
      e.target.classList?.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    f.terminos.addEventListener('change', () => {
      f.terminos.classList.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    capa.querySelector('[data-atras]').addEventListener('click', diapositivas);
    f.addEventListener('submit', (e) => {
      e.preventDefault();
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
      if (!f.terminos.checked) return fallo(f.terminos, 'Para seguir, acepta los términos y la política de privacidad.');
      error.textContent = '';
      Object.assign(datos, { nombre, celular, contacto: { nombre: cNombre, celular: cCel } });
      verificar();
    });
    f.nombre.focus({ preventScroll: true });
  }

  /* ---------- verificación SMS simulada ---------- */
  function verificar() {
    codigo = N.codigoNumerico ? N.codigoNumerico(4) : String(Math.floor(1000 + Math.random() * 9000));
    capa.innerHTML = `
      <div class="a-registro a-verificar">
        <div class="a-registro-cabeza">
          <button type="button" class="a-icono-btn" data-atras aria-label="Cambiar el número">${icono('atras')}</button>
          <span class="a-paso">Paso 2 de 2</span>
        </div>
        <div class="a-sms-prueba" role="status">
          <span class="a-sms-ico">${icono('mensaje', { tam: 20 })}</span>
          <span><small>SMS simulado · Cootransrural</small><strong>Código de prueba: <b data-codigo-prueba>${codigo}</b></strong></span>
        </div>
        <h1>Verifica tu celular</h1>
        <p class="a-sub">Escribe el código de 4 dígitos que enviamos al <strong>+57 ${esc(celularTexto(datos.celular))}</strong>.</p>
        <div data-casillas></div>
        <p class="a-error" data-error role="alert"></p>
        <button type="button" class="a-btn-texto" data-reenviar disabled>Reenviar código en 30 s</button>
        <button type="button" class="a-btn-texto" data-cambiar>Cambiar número</button>
      </div>`;
    const error = capa.querySelector('[data-error]');
    const cas = casillasCodigo({
      etiqueta: 'Código SMS',
      alCompletar: (v) => {
        if (v === codigo) listo();
        else {
          error.textContent = 'Ese código no coincide. Revisa el SMS de prueba.';
          cas.error();
          setTimeout(() => cas.limpiar(), 700);
        }
      },
      alCambiar: () => (error.textContent = ''),
    });
    capa.querySelector('[data-casillas]').append(cas.el);
    capa.querySelector('[data-atras]').addEventListener('click', registro);
    capa.querySelector('[data-cambiar]').addEventListener('click', registro);
    const reenviar = capa.querySelector('[data-reenviar]');
    let s = 30;
    clearInterval(relojReenvio);
    relojReenvio = setInterval(() => {
      s -= 1;
      if (s <= 0) {
        clearInterval(relojReenvio);
        reenviar.disabled = false;
        reenviar.textContent = 'Reenviar código';
      } else reenviar.textContent = `Reenviar código en ${s} s`;
    }, 1000);
    reenviar.addEventListener('click', verificar);
    setTimeout(() => cas.enfocar(), 350);
  }

  /* ---------- listo ---------- */
  function listo() {
    clearInterval(relojReenvio);
    N.perfil.registrarPasajero({
      nombre: datos.nombre,
      celular: datos.celular,
      contactoEmergencia: datos.contacto.celular ? { nombre: datos.contacto.nombre || 'Contacto de emergencia', celular: datos.contacto.celular } : null,
      verificado: true,
    });
    const primer = nombreCorto(datos.nombre);
    capa.innerHTML = `
      <div class="a-listo">
        ${franjaCuadros()}
        <div class="a-listo-check" aria-hidden="true">${icono('check', { tam: 56, grosor: 3 })}</div>
        <h1>¡Listo, ${esc(primer)}!</h1>
        <p>Tu cuenta quedó verificada. Ya puedes pedir tu taxi de Cootransrural.</p>
        <ul class="a-listo-lista">
          <li>${icono('pin', { tam: 20 })} Mueve el mapa para ajustar tu punto de recogida.</li>
          <li>${icono('escudo', { tam: 20 })} Confirma el móvil, la placa y tu código antes de subir.</li>
          <li>${icono('regalo', { tam: 20 })} Cada 10 viajes, el siguiente va al 50 %.</li>
        </ul>
        <button type="button" class="a-btn a-btn-primario a-btn-grande" data-empezar>Pedir mi primer taxi</button>
      </div>`;
    const b = capa.querySelector('[data-empezar]');
    b.focus({ preventScroll: true });
    b.addEventListener('click', () => {
      capa.classList.add('a-sale');
      setTimeout(() => capa.remove(), 320);
      alTerminar?.();
    });
  }

  diapositivas();
  return capa;
}
