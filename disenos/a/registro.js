// Bienvenida (3 diapositivas ilustradas) y registro del pasajero con
// verificación por SMS SIMULADA. Sin registro no se puede pedir taxi.
// En modo real (EM.MODO_REAL) el registro es la cuenta de TaxiCun en el servidor:
// correo → código de 6 dígitos que llega al correo → completar nombre y celular
// (PATCH /api/yo) → listo. El contacto de emergencia sigue solo en el celular.
// App nativa 1.2: si el teléfono tiene una llave guardada, el ingreso muestra «Entrar con
// Face ID»; después de entrar con el código se ofrece activarlo (disenos/a/nativa.js).
import { el, esc, icono, casillasCodigo, celularTexto, franjaCuadros, nombreCorto, modal } from './ui.js';
import { ilustracionUbicacion, ilustracionSeguridad, ilustracionPago } from './ilustraciones.js';
import { ingresoBiometria, ofrecerBiometria } from './nativa.js';
import { marcarPoliticaVista } from './politica.js';
import * as EM from './empresa.js';

const DIAPOSITIVAS = [
  {
    ilus: ilustracionUbicacion,
    titulo: 'Tu taxi llega a tu puerta',
    texto: `Pides con tu ubicación exacta y el móvil más cercano de ${EM.NOMBRE} va por ti, a tu casa o a tu negocio.`,
    // Solo cifras que conocemos: si la ficha no trae el número de taxis, no se inventa.
    puntos: [['pin', 'GPS exacto'], ['auto', EM.textoTaxis().replace(/ /g, '\u00a0') || 'El móvil más cercano'], ['reloj', EM.SERVICIO_24H ? '24\u00a0horas' : 'Sin llamar']],
  },
  { ilus: ilustracionSeguridad, titulo: 'Sabes quién te recoge', texto: 'Ves al conductor, el número de móvil, la placa y un código de abordaje. Compartes tu viaje y tienes botón de emergencia.', puntos: [['escudo', 'Placa y móvil'], ['candado', 'Código de 4 dígitos'], ['sos', 'SOS']] },
  EM.MODO_REAL
    ? { ilus: () => ilustracionPago({ soloEfectivo: true }), titulo: 'Pagas fácil', texto: 'Pagas en efectivo, directamente al conductor, al terminar el viaje. Antes de pedir ves la tarifa estimada.', puntos: [['efectivo', 'Efectivo al conductor'], ['ruta', 'Tarifa estimada']] }
    : { ilus: ilustracionPago, titulo: 'Pagas fácil y ahorras', texto: 'Paga en efectivo o con QR. Programa con 24\u00a0h y ahorra 10\u00a0%. Cada 10 viajes, el siguiente va al 50\u00a0%.', puntos: [['qr', 'QR de prueba'], ['calendario', '−10\u00a0% programando'], ['regalo', 'Viaje 11 al 50\u00a0%']] },
];

// Correo con forma de correo (el servidor revisa lo demás).
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Espera para volver a pedir el código (el servidor deja 1 por minuto).
const ESPERA_REENVIO = 60;

// Dentro de TaxiCun, el registro lleva la marca: «TaxiCun · Coptaxi».
function sello() {
  return EM.EN_TAXICUN ? `<p class="a-tc-linea">${EM.marcaApp(30)}<span>${EM.palabraApp()}<span class="a-tc-punto"> · </span>${esc(EM.NOMBRE)}</span></p>` : '';
}

// paso (solo modo real): 'correo' abre directo el ingreso con correo y 'perfil'
// abre «Completa tus datos» (sesión abierta pero sin nombre o sin celular; usuario
// trae lo que dijo el servidor). Sin paso, empieza por las diapositivas.
export function mostrarBienvenida(app, { N, alTerminar, paso = null, usuario = null }) {
  // Modo real: una sola capa de ingreso a la vez (por ejemplo, si la sesión se
  // cierra mientras ya se ve el ingreso).
  if (EM.MODO_REAL) app.querySelectorAll('.a-bienvenida').forEach((n) => n.remove());
  const capa = el(`<div class="a-bienvenida" role="dialog" aria-modal="true" aria-label="${esc(`Bienvenida a ${EM.NOMBRE_EN_APP}`)}"></div>`);
  app.append(capa);
  const datos = { nombre: '', celular: '', contacto: { nombre: '', celular: '' } };
  let codigo = '';
  let relojReenvio = null;
  // Modo real: correo con el que se ingresa, si ya aceptó los términos y cómo entró
  // ('codigo' | 'llave'; tras el código se ofrece Face ID en la app nativa).
  const cuenta = { correo: '', terminos: false, via: null };
  // Primer paso del registro: el formulario de la demo o el ingreso con correo.
  const empezarRegistro = () => (EM.MODO_REAL ? ingresoCorreo() : registro());

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
        <div class="a-marca${EM.EN_TAXICUN ? ' a-marca-tc' : ''}">${EM.encabezadoMarca({ tam: 34, detalle: EM.unir([EM.PUEBLO, EM.FUNDADA ? `desde ${EM.FUNDADA}` : '']) })}</div>
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
      btn.querySelector('span').textContent = actual === DIAPOSITIVAS.length - 1 ? (EM.MODO_REAL ? 'Empezar' : 'Crear mi cuenta') : 'Siguiente';
      btn.classList.toggle('a-btn-primario', actual === DIAPOSITIVAS.length - 1);
      btn.classList.toggle('a-btn-tinta', actual !== DIAPOSITIVAS.length - 1);
    };
    const ir = (i) => carrusel.scrollTo({ left: i * carrusel.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    carrusel.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true });
    puntos.forEach((p) => p.addEventListener('click', () => ir(Number(p.dataset.ir))));
    btn.addEventListener('click', () => (actual < DIAPOSITIVAS.length - 1 ? ir(actual + 1) : empezarRegistro()));
    capa.querySelector('[data-saltar]').addEventListener('click', empezarRegistro);
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
        ${sello()}
        <h1>Crea tu cuenta</h1>
        <p class="a-sub">${EM.EN_TAXICUN ? esc(`Con tu cuenta de ${EM.APP} pides los taxis de ${EM.NOMBRE}. Así el conductor sabe a quién recoger y tú viajas más seguro.`) : 'Así el conductor sabe a quién recoger y tú viajas más seguro.'}</p>
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
          <span>Acepto los <a href="${esc(EM.urlPrivacidad())}" target="_blank" rel="noopener">términos y la política de privacidad</a></span>
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
        ${sello()}
        <div class="a-sms-prueba" role="status">
          <span class="a-sms-ico">${icono('mensaje', { tam: 20 })}</span>
          <span><small>SMS simulado · ${esc(EM.NOMBRE_EN_APP)}</small><strong>Código de prueba: <b data-codigo-prueba>${codigo}</b></strong></span>
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

  /* ---------- modo real: ingreso con correo ---------- */
  // Casilla de términos (en modo real se acepta al pedir el código).
  const casillaTerminos = (marcada) => `
        <label class="a-check">
          <input type="checkbox" name="terminos" ${marcada ? 'checked' : ''}>
          <span class="a-check-caja" aria-hidden="true">${icono('check', { tam: 16, grosor: 3 })}</span>
          <span>Acepto los <a href="${esc(EM.urlPrivacidad())}" target="_blank" rel="noopener">términos y la política de privacidad</a></span>
        </label>`;

  // Botón ocupado (girador) mientras responde el servidor.
  const ocupar = (b, si) => {
    if (!b) return;
    b.disabled = si;
    b.classList.toggle('a-ocupado', si);
  };

  function ingresoCorreo({ aviso = '' } = {}) {
    clearInterval(relojReenvio);
    capa.innerHTML = `
      <form class="a-registro" novalidate>
        <div class="a-registro-cabeza">
          <button type="button" class="a-icono-btn" data-atras aria-label="Volver a la bienvenida">${icono('atras')}</button>
          <span class="a-paso">Paso 1 de 3</span>
        </div>
        ${sello()}
        <h1>Ingresa con tu correo</h1>
        <p class="a-sub">${esc(`Te enviamos un código de 6 dígitos para entrar. Si es tu primera vez, así creas tu cuenta de ${EM.APP} y pides los taxis de ${EM.NOMBRE}.`)}</p>
        <label class="a-campo">
          <span>Correo electrónico</span>
          <input name="correo" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="tucorreo@ejemplo.com" maxlength="254" value="${esc(cuenta.correo)}" required>
        </label>
        ${casillaTerminos(cuenta.terminos)}
        <p class="a-error" data-error role="alert">${esc(aviso)}</p>
        <button class="a-btn a-btn-primario a-btn-grande" type="submit" data-enviar>${icono('mensaje', { tam: 20 })}<span>Enviarme el código</span></button>
      </form>`;
    const f = capa.querySelector('form');
    const error = capa.querySelector('[data-error]');
    const boton = capa.querySelector('[data-enviar]');
    // App nativa 1.2: «Entrar con Face ID» arriba del correo si hay una llave guardada (sin
    // abrir el teclado del correo mientras se revisa).
    const conBio = Boolean(EM.ES_NATIVA && N.nativo?.biometriaPosible?.());
    ingresoBiometria({
      N,
      alEntrar: (r) => trasEntrar(r, 'llave'),
      alError: (texto) => {
        error.textContent = texto;
        f.correo.focus({ preventScroll: true });
      },
    }).then((bloque) => {
      if (!f.isConnected) return;
      if (bloque) {
        f.querySelector('.a-campo')?.before(bloque);
        bloque.querySelector('[data-entrar-bio]')?.focus({ preventScroll: true });
      } else if (conBio && !aviso) f.correo.focus({ preventScroll: true });
    }).catch(() => {});
    f.addEventListener('input', (e) => {
      e.target.classList?.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    f.terminos.addEventListener('change', () => {
      cuenta.terminos = f.terminos.checked;
      f.terminos.classList.remove('a-invalido');
      if (!f.querySelector('.a-invalido')) error.textContent = '';
    });
    capa.querySelector('[data-atras]').addEventListener('click', diapositivas);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (boton.disabled) return;
      const correo = f.correo.value.trim().toLowerCase();
      f.querySelectorAll('.a-invalido').forEach((x) => x.classList.remove('a-invalido'));
      const fallo = (campo, msj) => {
        error.textContent = msj;
        campo?.classList.add('a-invalido');
        campo?.focus();
      };
      if (!CORREO_VALIDO.test(correo)) return fallo(f.correo, 'Escribe un correo válido, por ejemplo ana@gmail.com.');
      if (!f.terminos.checked) return fallo(f.terminos, 'Para seguir, acepta los términos y la política de privacidad.');
      error.textContent = '';
      cuenta.correo = correo;
      cuenta.terminos = true;
      ocupar(boton, true);
      try {
        await N.servidor.pedirCodigo(correo);
        codigoCorreo();
      } catch (err) {
        ocupar(boton, false);
        // Ya hay un código vigente para ese correo: se sigue a escribirlo.
        if (err?.codigo === 'espera_un_minuto') return codigoCorreo({ aviso: EM.textoError(err) });
        if (err?.codigo === 'correo_invalido') return fallo(f.correo, EM.textoError(err));
        error.textContent = EM.textoError(err);
      }
    });
    if (!aviso && !conBio) f.correo.focus({ preventScroll: true });
  }

  function codigoCorreo({ aviso = '' } = {}) {
    clearInterval(relojReenvio);
    capa.innerHTML = `
      <div class="a-registro a-verificar">
        <div class="a-registro-cabeza">
          <button type="button" class="a-icono-btn" data-atras aria-label="Cambiar el correo">${icono('atras')}</button>
          <span class="a-paso">Paso 2 de 3</span>
        </div>
        ${sello()}
        <h1>Revisa tu correo</h1>
        <p class="a-sub">Escribe el código de 6 dígitos que enviamos a <strong class="a-correo-txt">${esc(cuenta.correo)}</strong>. Si no lo ves, busca en el correo no deseado.</p>
        <div data-casillas></div>
        <p class="a-verificando" data-verificando role="status" hidden><span class="a-girador"></span>Verificando el código…</p>
        <p class="a-error" data-error role="alert">${esc(aviso)}</p>
        <button type="button" class="a-btn a-btn-primario a-btn-grande" data-reintentar hidden>Intentar de nuevo</button>
        <button type="button" class="a-btn-texto" data-reenviar disabled>Reenviar código en ${ESPERA_REENVIO} s</button>
        <button type="button" class="a-btn-texto" data-cambiar>Cambiar correo</button>
      </div>`;
    const error = capa.querySelector('[data-error]');
    const verificando = capa.querySelector('[data-verificando]');
    // Con un fallo de paso (sin red, servidor ocupado) las casillas siguen llenas y no se
    // vuelve a verificar solo: este botón lo intenta otra vez con el mismo código.
    const reintentar = capa.querySelector('[data-reintentar]');
    reintentar.addEventListener('click', () => {
      if (cas.valor().length === 6) verificar(cas.valor());
      else cas.enfocar();
    });
    const verificar = async (v) => {
      reintentar.hidden = true;
      error.textContent = '';
      cas.desactivar(true);
      verificando.hidden = false;
      try {
        const r = await N.servidor.entrar(cuenta.correo, v);
        // Entró con la casilla «Acepto los términos y la política de privacidad»: la vigente ya la aceptó.
        if (cuenta.terminos) marcarPoliticaVista(N);
        trasEntrar(r, 'codigo');
      } catch (err) {
        verificando.hidden = true;
        cas.desactivar(false);
        error.textContent = EM.textoError(err);
        if (err?.codigo === 'codigo_invalido' || err?.codigo === 'codigo_vencido') {
          cas.error();
          setTimeout(() => cas.limpiar(), 700);
        } else {
          reintentar.hidden = false;
          reintentar.focus({ preventScroll: true });
        }
      }
    };
    const cas = casillasCodigo({
      n: 6,
      etiqueta: 'Código del correo',
      alCompletar: verificar,
      alCambiar: () => {
        error.textContent = '';
        reintentar.hidden = true;
      },
    });
    capa.querySelector('[data-casillas]').append(cas.el);
    capa.querySelector('[data-atras]').addEventListener('click', () => ingresoCorreo());
    capa.querySelector('[data-cambiar]').addEventListener('click', () => ingresoCorreo());
    const reenviar = capa.querySelector('[data-reenviar]');
    const contar = () => {
      let s = ESPERA_REENVIO;
      reenviar.disabled = true;
      reenviar.textContent = `Reenviar código en ${s} s`;
      clearInterval(relojReenvio);
      relojReenvio = setInterval(() => {
        s -= 1;
        if (!reenviar.isConnected) return clearInterval(relojReenvio);
        if (s <= 0) {
          clearInterval(relojReenvio);
          reenviar.disabled = false;
          reenviar.textContent = 'Reenviar código';
        } else reenviar.textContent = `Reenviar código en ${s} s`;
      }, 1000);
    };
    reenviar.addEventListener('click', async () => {
      reenviar.disabled = true;
      error.textContent = '';
      try {
        await N.servidor.pedirCodigo(cuenta.correo);
        cas.limpiar();
        verificando.hidden = true;
        error.textContent = '';
        reenviar.textContent = 'Te enviamos un código nuevo';
        setTimeout(contar, 1500);
      } catch (err) {
        error.textContent = EM.textoError(err);
        contar();
      }
    });
    contar();
    setTimeout(() => cas.enfocar(), 350);
  }

  // Ya hay sesión (con el código del correo o con Face ID): el perfil decide el paso.
  function trasEntrar(r, via) {
    clearInterval(relojReenvio);
    cuenta.via = via;
    const usuario = r?.usuario || {};
    if (usuario.correo) cuenta.correo = usuario.correo;
    N.perfil.fijarPasajeroServidor(usuario);
    if (usuario.nombre && usuario.celular) listoReal(usuario, { nuevo: false });
    else completarPerfil(usuario);
  }

  // Sesión abierta pero sin nombre o sin celular: se completan en el servidor
  // (PATCH /api/yo). El contacto de emergencia queda solo en este celular.
  function completarPerfil(usuario = {}) {
    clearInterval(relojReenvio);
    const local = N.perfil.pasajero() || {};
    const contacto = local.contactoEmergencia || {};
    const correo = usuario.correo || local.correo || cuenta.correo;
    capa.innerHTML = `
      <form class="a-registro" novalidate>
        <div class="a-registro-cabeza">
          <span></span>
          <span class="a-paso">Paso 3 de 3</span>
        </div>
        ${sello()}
        <h1>Completa tus datos</h1>
        <p class="a-sub">Así el conductor sabe a quién recoger y puede llamarte si hace falta.${correo ? ` Entraste con <strong class="a-correo-txt">${esc(correo)}</strong>.` : ''}</p>
        <label class="a-campo">
          <span>Nombre y apellido</span>
          <input name="nombre" autocomplete="name" autocapitalize="words" placeholder="Ej.: Ana María Gómez" maxlength="80" value="${esc(usuario.nombre || local.nombre || '')}" required>
        </label>
        <label class="a-campo">
          <span>Celular</span>
          <span class="a-campo-tel"><span class="a-prefijo">+57</span><input name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" maxlength="12" value="${esc(celularTexto(usuario.celular || local.celular || ''))}" required></span>
        </label>
        <fieldset class="a-emergencia">
          <legend>${icono('escudo', { tam: 18 })} Contacto de emergencia <small>(opcional)</small></legend>
          <p>Le avisas con un toque si algo pasa en tu viaje. Queda solo en este celular.</p>
          <div class="a-fila-2">
            <label class="a-campo a-campo-chico"><span>Nombre</span><input name="contactoNombre" autocomplete="off" placeholder="Ej.: Mamá" value="${esc(contacto.nombre || '')}"></label>
            <label class="a-campo a-campo-chico"><span>Celular</span><input name="contactoCelular" type="tel" inputmode="numeric" placeholder="10 dígitos" maxlength="12" value="${esc(celularTexto(contacto.celular || ''))}"></label>
          </div>
        </fieldset>
        <p class="a-error" data-error role="alert"></p>
        <button class="a-btn a-btn-primario a-btn-grande" type="submit" data-guardar><span>Guardar y seguir</span></button>
        <button type="button" class="a-btn-texto" data-otro-correo>Usar otro correo</button>
        <button type="button" class="a-btn-texto a-texto-peligro" data-eliminar-cuenta>Eliminar mi cuenta</button>
      </form>`;
    const f = capa.querySelector('form');
    const error = capa.querySelector('[data-error]');
    const boton = capa.querySelector('[data-guardar]');
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
    capa.querySelector('[data-otro-correo]').addEventListener('click', async (e) => {
      ocupar(e.currentTarget, true);
      // App nativa 1.2: este teléfono deja de recibir los avisos de esta cuenta.
      await N.nativo?.olvidarPush?.();
      await N.servidor.salir();
      N.perfil.cerrarSesionPasajero();
      cuenta.correo = '';
      ingresoCorreo();
    });
    // La cuenta ya existe (se creó al verificar el correo): también se puede borrar desde aquí.
    capa.querySelector('[data-eliminar-cuenta]').addEventListener('click', async (e) => {
      const b = e.currentTarget;
      const ok = await modal(app, {
        titulo: '¿Eliminar tu cuenta?',
        texto: `Borramos tu cuenta de ${EM.APP} (${correo || 'tu correo'}) y los datos de este celular. Esto no se puede deshacer.`,
        icono: `<span class="a-sos-ico">${icono('basura', { tam: 32 })}</span>`,
        clase: 'a-modal-sos',
        acciones: [{ texto: 'Eliminar mi cuenta', valor: true, clase: 'a-btn-peligro', icono: 'basura' }, { texto: 'Cancelar', valor: false, clase: 'a-btn-suave' }],
      });
      if (!ok) return;
      ocupar(b, true);
      try {
        await N.nativo?.olvidarPush?.();
        await N.servidor.eliminarCuenta();
      } catch (err) {
        ocupar(b, false);
        if (err?.codigo === 'sin_sesion') return ingresoCorreo({ aviso: 'Tu sesión se cerró. Ingresa de nuevo con tu correo para eliminar tu cuenta.' });
        error.textContent = `No pudimos eliminar tu cuenta. ${EM.textoError(err)}`;
        return;
      }
      // La cuenta ya no existe: tampoco su llave de Face ID ni el bloqueo en este teléfono.
      await N.nativo?.olvidarTodo?.();
      N.perfil.borrarDatosLocales();
      cuenta.correo = '';
      ingresoCorreo({ aviso: `Tu cuenta se eliminó. Borramos tus datos de ${EM.APP} y de este celular.` });
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
      ocupar(boton, true);
      try {
        const r = await N.servidor.actualizarYo({ nombre, celular });
        const u = r?.usuario || { ...usuario, nombre, celular };
        N.perfil.fijarPasajeroServidor(u);
        N.perfil.registrarPasajero({ contactoEmergencia: cCel ? { nombre: cNombre || 'Contacto de emergencia', celular: cCel } : null });
        listoReal(u, { nuevo: true });
      } catch (err) {
        ocupar(boton, false);
        if (err?.codigo === 'sin_sesion') return ingresoCorreo({ aviso: 'Tu sesión se cerró. Ingresa de nuevo con tu correo.' });
        if (err?.codigo === 'nombre_invalido') return fallo(f.nombre, EM.textoError(err));
        if (err?.codigo === 'celular_invalido') return fallo(f.celular, EM.textoError(err));
        error.textContent = EM.textoError(err);
      }
    });
    if (!f.nombre.value) f.nombre.focus({ preventScroll: true });
  }

  function listoReal(usuario, { nuevo }) {
    clearInterval(relojReenvio);
    const primer = nombreCorto(usuario.nombre || N.perfil.pasajero()?.nombre || '');
    pintarListo({
      titulo: nuevo ? `¡Listo, ${primer}!` : `¡Hola de nuevo, ${primer}!`,
      texto: nuevo ? `Tu cuenta de ${EM.APP} quedó lista. Ya puedes pedir tu taxi de ${EM.NOMBRE}.` : `Entraste a tu cuenta de ${EM.APP}. Ya puedes pedir tu taxi de ${EM.NOMBRE}.`,
      boton: nuevo ? 'Pedir mi primer taxi' : 'Pedir mi taxi',
    });
    // App nativa 1.2: tras entrar con el código, «¿Entrar con Face ID la próxima vez?».
    if (cuenta.via === 'codigo') ofrecerBiometria(app, { N, correo: usuario.correo || cuenta.correo }).catch(() => {});
    cuenta.via = null;
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
    pintarListo({
      titulo: `¡Listo, ${primer}!`,
      texto: EM.EN_TAXICUN ? `Tu cuenta de ${EM.APP} quedó verificada. Ya puedes pedir tu taxi de ${EM.NOMBRE}.` : `Tu cuenta quedó verificada. Ya puedes pedir tu taxi de ${EM.NOMBRE}.`,
      boton: 'Pedir mi primer taxi',
    });
  }

  function pintarListo({ titulo, texto, boton }) {
    capa.innerHTML = `
      <div class="a-listo">
        ${franjaCuadros()}
        <div class="a-listo-check" aria-hidden="true">${icono('check', { tam: 56, grosor: 3 })}</div>
        <h1>${esc(titulo)}</h1>
        <p>${esc(texto)}</p>
        <ul class="a-listo-lista">
          <li>${icono('pin', { tam: 20 })} Mueve el mapa para ajustar tu punto de recogida.</li>
          <li>${icono('escudo', { tam: 20 })} Confirma el móvil, la placa y tu código antes de subir.</li>
          ${EM.MODO_REAL
            ? `<li>${icono('efectivo', { tam: 20 })} Pagas en efectivo al conductor al terminar el viaje.</li>`
            : `<li>${icono('regalo', { tam: 20 })} Cada 10 viajes, el siguiente va al 50 %.</li>`}
        </ul>
        <button type="button" class="a-btn a-btn-primario a-btn-grande" data-empezar>${esc(boton)}</button>
      </div>`;
    const b = capa.querySelector('[data-empezar]');
    b.focus({ preventScroll: true });
    b.addEventListener('click', () => {
      capa.classList.add('a-sale');
      setTimeout(() => capa.remove(), 320);
      alTerminar?.();
    });
  }

  if (EM.MODO_REAL && paso === 'perfil') completarPerfil(usuario || {});
  else if (EM.MODO_REAL && paso === 'correo') ingresoCorreo();
  else diapositivas();
  return capa;
}

