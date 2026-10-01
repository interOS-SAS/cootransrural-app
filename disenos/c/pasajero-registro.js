// Bienvenida y registro obligatorio del pasajero (diseño C).
// Pasos: bienvenida → datos (nombre y celular) → código SMS simulado → seguridad
// (contacto de emergencia opcional y términos). Sin registro no se puede pedir.
import { icono, esc, montarCasillas, ilustracionTaxi, ilustracionRuta, formatoCelular, montarCelular, soloCelular } from './comun.js';

export function montarRegistro(capa, { N, alTerminar }) {
  const datos = { nombre: '', celular: '', codigo: '', contactoNombre: '', contactoCelular: '' };
  let paso = 'bienvenida';

  const progreso = (n) => `<div class="c-reg-progreso" role="progressbar" aria-label="Paso ${n} de 3" aria-valuemin="1" aria-valuemax="3" aria-valuenow="${n}">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'c-lleno' : ''}"></span>`).join('')}</div>`;
  const cabecera = (n, atras) => `<header class="c-reg-cabeza"><button type="button" class="c-boton-icono c-boton-icono-chico" data-reg="${atras}" aria-label="Volver">${icono('atras')}</button>${progreso(n)}<span class="c-reg-paso">${n}/3</span></header>`;

  function pintar() {
    capa.dataset.paso = paso;
    if (paso === 'bienvenida') {
      capa.innerHTML = `<section class="c-registro c-bienvenida">
        <div class="c-bienvenida-arte">
          ${ilustracionRuta('bv')}
          <div class="c-bienvenida-taxi">${ilustracionTaxi('bvt')}</div>
        </div>
        <div class="c-bienvenida-texto c-entrar">
          <span class="c-marca"><img src="../img/icono.svg" alt="" width="34" height="34">Cootransrural <span class="c-etiqueta c-etiqueta-cian">El Rosal</span></span>
          <h1>Tu taxi de confianza, <em>a un toque</em>.</h1>
          <p class="c-muted">Pídelo con tu ubicación exacta, mira quién te recoge y llega seguro a tu destino.</p>
          <ul class="c-beneficios">
            <li><span>${icono('pin')}</span><div><strong>Ubicación exacta</strong><small>El móvil llega a tu puerta, casa o negocio.</small></div></li>
            <li><span>${icono('escudo')}</span><div><strong>Viaja seguro</strong><small>Móvil, placa, código de abordaje y botón SOS.</small></div></li>
            <li><span>${icono('qr')}</span><div><strong>Tarifas claras</strong><small>Mira el valor antes de pedir y paga con QR o efectivo.</small></div></li>
          </ul>
          <div class="c-cifras">
            <div><strong>${N.EMPRESA.taxis}</strong><small>taxis</small></div>
            <div><strong>24 h</strong><small>servicio</small></div>
            <div><strong>${N.EMPRESA.fundada}</strong><small>desde</small></div>
          </div>
        </div>
        <div class="c-reg-pie">
          <button type="button" class="c-boton c-boton-grande c-boton-ancho" data-reg="a-datos">Crear mi cuenta ${icono('flecha')}</button>
          <a class="c-enlace" href="../conductor/">${icono('volante')} Soy conductor</a>
        </div>
      </section>`;
      return;
    }

    if (paso === 'datos') {
      capa.innerHTML = `<section class="c-registro c-formulario">
        ${cabecera(1, 'a-bienvenida')}
        <div class="c-reg-cuerpo c-entrar">
          <span class="c-reg-icono">${icono('perfil')}</span>
          <h1>Cuéntanos quién eres</h1>
          <p class="c-muted">Así el conductor sabe a quién recoger. Tus datos solo quedan en este celular.</p>
          <form class="c-reg-form" novalidate data-form="datos">
            <label class="c-campo-etiqueta">Nombre completo
              <input class="c-input" id="c-reg-nombre" name="nombre" autocomplete="name" autocapitalize="words" placeholder="Ej.: Laura Gómez" value="${esc(datos.nombre)}" required>
            </label>
            <label class="c-campo-etiqueta">Celular
              <span class="c-input-prefijo"><span>+57</span><input class="c-input" id="c-reg-celular" name="celular" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" value="${esc(datos.celular)}" required></span>
            </label>
            <p class="c-error" data-error hidden></p>
            <button type="submit" class="c-boton c-boton-grande c-boton-ancho">Enviarme el código ${icono('chat')}</button>
          </form>
        </div>
      </section>`;
      montarCelular(capa.querySelector('#c-reg-celular'));
      setTimeout(() => capa.querySelector('#c-reg-nombre')?.focus(), 60);
      return;
    }

    if (paso === 'codigo') {
      capa.innerHTML = `<section class="c-registro c-formulario">
        ${cabecera(2, 'a-datos')}
        <div class="c-reg-cuerpo c-entrar">
          <span class="c-reg-icono">${icono('celular')}</span>
          <h1>Escribe el código</h1>
          <p class="c-muted">Lo enviamos por SMS al <strong>${esc(formatoCelular(datos.celular))}</strong>.</p>
          <div class="c-sms-prueba" role="status">
            <span class="c-etiqueta">SMS de prueba</span>
            <span>Código de prueba: <strong data-codigo-prueba>${datos.codigo}</strong></span>
          </div>
          <div class="c-casillas" id="c-reg-casillas"></div>
          <p class="c-error" data-error hidden></p>
          <button type="button" class="c-boton-texto" data-reg="reenviar">Reenviar código</button>
        </div>
      </section>`;
      const casillas = montarCasillas(capa.querySelector('#c-reg-casillas'), {
        etiqueta: 'Código de verificación',
        alCompletar: (v) => {
          if (v === datos.codigo) {
            paso = 'seguridad';
            pintar();
          } else {
            casillas.error();
            mostrarError('Ese código no coincide. Revisa el SMS de prueba.');
            setTimeout(() => casillas.limpiar(), 450);
          }
        },
      });
      setTimeout(() => casillas.enfocar(), 80);
      return;
    }

    if (paso === 'seguridad') {
      capa.innerHTML = `<section class="c-registro c-formulario">
        ${cabecera(3, 'a-codigo')}
        <div class="c-reg-cuerpo c-entrar">
          <span class="c-reg-icono c-reg-icono-magenta">${icono('escudo')}</span>
          <h1>Tu seguridad primero</h1>
          <p class="c-muted">Opcional: ¿a quién le avisamos si compartes tu viaje o tocas el botón SOS?</p>
          <form class="c-reg-form" novalidate data-form="seguridad">
            <label class="c-campo-etiqueta"><span>Nombre del contacto <small class="c-opcional">(opcional)</small></span>
              <input class="c-input" id="c-reg-cnombre" autocomplete="off" placeholder="Ej.: Mamá" value="${esc(datos.contactoNombre)}">
            </label>
            <label class="c-campo-etiqueta"><span>Celular del contacto <small class="c-opcional">(opcional)</small></span>
              <span class="c-input-prefijo"><span>+57</span><input class="c-input" id="c-reg-ccelular" type="tel" inputmode="numeric" placeholder="300 765 4321" value="${esc(datos.contactoCelular)}"></span>
            </label>
            <label class="c-check">
              <input type="checkbox" id="c-reg-acepto">
              <span class="c-check-caja" aria-hidden="true">${icono('check')}</span>
              <span>Acepto los <a href="../privacidad/" target="_blank" rel="noopener">términos y la política de privacidad</a> de Cootransrural.</span>
            </label>
            <p class="c-error" data-error hidden></p>
            <button type="submit" class="c-boton c-boton-grande c-boton-ancho" data-terminar disabled>Empezar a viajar ${icono('flecha')}</button>
          </form>
        </div>
      </section>`;
      montarCelular(capa.querySelector('#c-reg-ccelular'));
      const acepto = capa.querySelector('#c-reg-acepto');
      acepto.addEventListener('change', () => (capa.querySelector('[data-terminar]').disabled = !acepto.checked));
    }
  }

  function mostrarError(texto) {
    const e = capa.querySelector('[data-error]');
    if (!e) return;
    e.hidden = !texto;
    e.innerHTML = texto ? `${icono('alerta')}<span>${esc(texto)}</span>` : '';
  }

  capa.addEventListener('click', (e) => {
    const b = e.target.closest('[data-reg]');
    if (!b) return;
    const accion = b.dataset.reg;
    if (accion === 'a-datos') paso = 'datos';
    else if (accion === 'a-bienvenida') paso = 'bienvenida';
    else if (accion === 'a-codigo') paso = 'codigo';
    else if (accion === 'reenviar') {
      datos.codigo = N.codigoNumerico ? N.codigoNumerico(4) : String(1000 + Math.floor(Math.random() * 9000));
      N.sonar?.('info');
    } else return;
    pintar();
  });

  capa.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (form === 'datos') {
      const nombre = capa.querySelector('#c-reg-nombre').value.trim().replace(/\s+/g, ' ');
      const celular = soloCelular(capa.querySelector('#c-reg-celular').value);
      datos.nombre = nombre;
      datos.celular = celular;
      if (nombre.length < 3 || !/\p{L}/u.test(nombre)) return mostrarError('Escribe tu nombre (mínimo 3 letras).');
      if (!/^3\d{9}$/.test(celular)) return mostrarError('El celular debe tener 10 dígitos y empezar por 3.');
      datos.codigo = N.codigoNumerico ? N.codigoNumerico(4) : String(1000 + Math.floor(Math.random() * 9000));
      paso = 'codigo';
      pintar();
      N.sonar?.('info');
      return;
    }
    if (form === 'seguridad') {
      const cn = capa.querySelector('#c-reg-cnombre').value.trim();
      const cc = soloCelular(capa.querySelector('#c-reg-ccelular').value);
      if (cc && !/^3\d{9}$/.test(cc)) return mostrarError('El celular del contacto debe tener 10 dígitos y empezar por 3.');
      if (!capa.querySelector('#c-reg-acepto').checked) return mostrarError('Para continuar acepta los términos.');
      N.perfil.registrarPasajero({
        nombre: datos.nombre,
        celular: datos.celular,
        verificado: true,
        contactoEmergencia: cc ? { nombre: cn || 'Contacto de emergencia', celular: cc } : null,
      });
      alTerminar();
    }
  });

  pintar();
}
