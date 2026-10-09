// Bloques de ajustes que comparten el pasajero y el conductor: municipio (solo
// dentro de TaxiCun), diseño, sala de prueba, sonido, notificaciones, conexión en
// vivo, instalación, cuenta (modo real), seguridad (Face ID, app nativa 1.2) y «Acerca de».
// En modo real (EM.MODO_REAL) no se muestra nada de la demo: ni sala, ni relés, ni
// simulación, ni «MODO PRUEBA», ni «Instalar» (en la web la app instalada abriría la
// demo). En la app nativa (EM.ES_NATIVA) tampoco las notificaciones del navegador (el
// WebView no las tiene).
import { el, esc, icono, modal, chipPrueba, avisoDemo } from './ui.js';
import * as EM from './empresa.js';

const DISENOS = [
  { id: 'a', nombre: 'Ámbar Urbano', colores: ['#FFC107', '#121212', '#F4F5F7'] },
  { id: 'b', ...EM.DISENO_B },
  { id: 'c', nombre: 'Noche Neón', colores: ['#07090D', '#FFE14D', '#FF4D9D'] },
  { id: 'auto', nombre: 'A de día · C de noche', colores: ['#FFC107', '#F4F5F7', '#07090D', '#FF4D9D'] },
];

function recargarCon(cambios) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(cambios)) {
    if (v == null) u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  location.href = u.href;
}

export function interruptor({ id, titulo, detalle = '', icono: ico, activo = false, alCambiar }) {
  const fila = el(`<div class="a-fila-interruptor">
    <span class="a-fila-ico">${icono(ico, { tam: 20 })}</span>
    <span class="a-fila-txt"><strong id="${id}">${esc(titulo)}</strong>${detalle ? `<small>${esc(detalle)}</small>` : ''}</span>
    <button type="button" role="switch" class="a-interruptor" aria-checked="${activo}" aria-labelledby="${id}"><span></span></button>
  </div>`);
  const b = fila.querySelector('button');
  b.addEventListener('click', async () => {
    if (b.disabled) return;
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    // alCambiar puede ser asíncrono (Face ID, servidor): si devuelve false, vuelve a como estaba.
    const r = alCambiar(v);
    if (!r || typeof r.then !== 'function') return;
    b.disabled = true;
    try {
      if ((await r) === false) b.setAttribute('aria-checked', String(!v));
    } catch {
      b.setAttribute('aria-checked', String(!v));
    } finally {
      b.disabled = false;
    }
  });
  return fila;
}

export function bloqueDiseno(N, diseno) {
  // Marcado: lo elegido (puede ser «auto», Día y noche), no solo el diseño abierto ahora.
  const preferido = N.perfil.disenoPreferido?.() || diseno;
  const s = el(`<section class="a-grupo"><h3>Diseño de la app</h3>
    <div class="a-disenos" role="radiogroup" aria-label="Diseño de la app">
      ${DISENOS.map((d) => `<button type="button" role="radio" class="a-diseno" aria-checked="${d.id === preferido}" data-d="${d.id}">
        <span class="a-diseno-muestra">${d.colores.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <strong>${d.id === 'auto' ? 'Día y noche' : d.id.toUpperCase()}</strong><small>${esc(d.nombre)}</small></button>`).join('')}
    </div>
    <p class="a-ayuda-txt">Los tres diseños funcionan igual; cambia cómo se ve. «Día y noche» abre la A de día y la C de noche. Se guarda en este celular.</p></section>`);
  s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || b.dataset.d === preferido) return;
    N.perfil.elegirDiseno(b.dataset.d);
    recargarCon({ d: b.dataset.d });
  });
  return s;
}

export function bloqueSala(N, app) {
  if (EM.MODO_REAL) return '';
  const sala = N.salaActual();
  const s = el(`<section class="a-grupo"><h3>Sala de prueba</h3>
    <p class="a-ayuda-txt">Los celulares que estén en la misma sala se ven entre sí (pasajeros y conductores). Úsala para hacer la demo con varias personas.</p>
    <form class="a-sala">
      <label class="a-campo a-campo-chico"><span>Nombre de la sala</span><input name="sala" value="${esc(sala)}" maxlength="24" autocapitalize="off" spellcheck="false" pattern="[a-zA-Z0-9\\-]+"></label>
      <button class="a-btn a-btn-tinta" type="submit">Cambiar</button>
    </form></section>`);
  s.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = e.target.sala.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!v || v === sala) return;
    const ok = await modal(app, { titulo: `¿Pasar a la sala «${v}»?`, texto: 'La app se vuelve a abrir para conectarse a la nueva sala.', acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Cambiar sala', valor: true, clase: 'a-btn-primario' }] });
    if (!ok) return;
    N.cambiarSala(v);
    recargarCon({ sala: null });
  });
  return s;
}

// rol ('pasajero' | 'conductor'): en la app nativa 1.2, para qué sirven las notificaciones.
export function bloqueSonidoYAvisos(N, { rol = globalThis.CT_ROL === 'conductor' ? 'conductor' : 'pasajero' } = {}) {
  const s = el('<section class="a-grupo"><h3>Avisos</h3><div class="a-tarjeta-lista"></div></section>');
  const lista = s.querySelector('.a-tarjeta-lista');
  lista.append(interruptor({
    id: 'a-aj-sonido', titulo: 'Sonido de los avisos', detalle: 'Suena cuando cambia tu viaje', icono: 'sonido', activo: N.perfil.ajustes().sonido !== false,
    alCambiar: (v) => {
      N.perfil.guardarAjustes({ sonido: v });
      if (v) N.sonar('exito');
    },
  }));
  // En la app nativa no hay notificaciones del navegador: desde la 1.2, las del celular (push).
  if (EM.ES_NATIVA) {
    if (EM.MODO_REAL && N.nativo?.pushDisponible()) lista.append(filaAvisosNativos(N, rol));
    return s;
  }
  const estado = N.permisoNotificaciones();
  const txt = { granted: 'Activadas', denied: 'Bloqueadas en el navegador', default: 'Sin activar', 'no-soportado': 'Este navegador no las permite' }[estado] || estado;
  const fila = el(`<div class="a-fila-interruptor">
    <span class="a-fila-ico">${icono('campana', { tam: 20 })}</span>
    <span class="a-fila-txt"><strong>Notificaciones</strong><small data-estado>${esc(txt)}</small></span>
    ${estado === 'default' ? '<button type="button" class="a-btn a-btn-tinta a-btn-chico" data-activar>Activar</button>' : ''}
  </div>`);
  fila.querySelector('[data-activar]')?.addEventListener('click', async (e) => {
    const r = await N.pedirPermisoNotificaciones();
    fila.querySelector('[data-estado]').textContent = r === 'granted' ? 'Activadas' : r === 'denied' ? 'Bloqueadas en el navegador' : 'Sin activar';
    if (r !== 'default') e.target.remove();
  });
  lista.append(fila);
  return s;
}

// Ronda 4A (modo real, pasajero con sesión): «Avisos de {coop}», la baja voluntaria de los avisos que manda la
// cooperativa (GET y PUT /api/yo/avisos). Aparece cuando el servidor responde; con una central anterior (sin la ruta)
// o sin señal no aparece. Los textos van con textContent.
export function bloqueAvisosCooperativa(N) {
  if (!EM.MODO_REAL || !N.servidor?.haySesion?.()) return '';
  const t = N.textosCentral.bajaAvisos({ empresa: EM.NOMBRE });
  const s = el('<section class="a-grupo" data-avisos-cooperativa hidden><h3>Tu cooperativa</h3><div class="a-tarjeta-lista"></div><p class="a-ayuda-txt a-mal-txt" data-error hidden></p></section>');
  const error = s.querySelector('[data-error]');
  N.servidor.bajasAvisos().then((r) => {
    const bajas = Array.isArray(r?.bajas) ? r.bajas : [];
    const fila = interruptor({
      id: 'a-aj-avisos-coop',
      titulo: '',
      icono: 'campana',
      activo: !bajas.includes(N.ID_EMPRESA),
      alCambiar: async (v) => {
        error.hidden = true;
        try {
          await N.servidor.cambiarBajaAvisos(N.ID_EMPRESA, v);
          return true;
        } catch {
          error.textContent = t.error;
          error.hidden = false;
          return false;
        }
      },
    });
    fila.dataset.avisosCooperativa = '';
    fila.querySelector('strong').textContent = t.titulo;
    const detalle = document.createElement('small');
    detalle.textContent = t.detalle;
    fila.querySelector('.a-fila-txt').append(detalle);
    s.querySelector('.a-tarjeta-lista').append(fila);
    s.hidden = false;
  }).catch(() => {
    /* central anterior (sin /api/yo/avisos) o sin señal: no se muestra */
  });
  return s;
}

// Notificaciones del celular (app nativa 1.2): estado del permiso y «Activar» si aún no se decidió.
function filaAvisosNativos(N, rol) {
  const fila = el(`<div class="a-fila-interruptor" data-avisos-nativos>
    <span class="a-fila-ico">${icono('campana', { tam: 20 })}</span>
    <span class="a-fila-txt"><strong>Notificaciones</strong><small data-estado>Revisando…</small></span>
  </div>`);
  const detalle = rol === 'conductor' ? 'Servicios nuevos aunque tengas la app cerrada' : 'Cuando un conductor acepte y cuando llegue tu taxi';
  const pintar = (permiso) => {
    fila.querySelector('[data-activar]')?.remove();
    const txt = {
      granted: `Activadas · ${detalle}`,
      denied: 'Desactivadas. Actívalas en los ajustes del celular, en TaxiCun.',
      prompt: `Sin activar · ${detalle}`,
    }[permiso] || 'No disponibles en este celular';
    fila.querySelector('[data-estado]').textContent = txt;
    if (permiso !== 'prompt') return;
    const b = el('<button type="button" class="a-btn a-btn-tinta a-btn-chico" data-activar>Activar</button>');
    b.addEventListener('click', async () => {
      b.disabled = true;
      pintar(await N.nativo.registrarPush(rol, { pedir: true }));
    });
    fila.append(b);
  };
  N.nativo.permisoPush().then(pintar);
  return fila;
}

// Solo en la app nativa 1.2 con Face ID o huella: «Entrar con Face ID» (crea o borra la llave
// de este teléfono) y «Pedir Face ID al abrir la app». Se arma cuando el plugin responde; sin
// biometría configurada, la sección no aparece.
export function bloqueSeguridad(N, { correo = '' } = {}) {
  if (!EM.MODO_REAL || !EM.ES_NATIVA || !N.nativo?.biometriaPosible()) return '';
  const s = el('<section class="a-grupo a-seguridad" data-seguridad hidden><h3>Seguridad</h3><div class="a-tarjeta-lista"></div><p class="a-ayuda-txt a-error" data-error role="alert"></p></section>');
  const lista = s.querySelector('.a-tarjeta-lista');
  const error = s.querySelector('[data-error]');
  const dueno = String(correo || '').trim().toLowerCase();
  const fallo = (err) => {
    if (err?.codigo !== 'cancelada') error.textContent = err?.name === 'ErrorBiometria' ? err.message : EM.textoError(err);
    return false;
  };
  (async () => {
    const [b, llave] = await Promise.all([N.nativo.biometria(), N.nativo.llaveGuardada()]);
    if (!b.disponible) return;
    const propia = Boolean(llave) && (!llave.correo || !dueno || llave.correo === dueno);
    lista.append(
      interruptor({
        id: 'a-aj-bio', titulo: `Entrar con ${b.nombre}`, detalle: 'Sin esperar el código del correo', icono: b.icono, activo: propia,
        alCambiar: async (v) => {
          error.textContent = '';
          try {
            if (v) await N.nativo.crearLlave({ correo: dueno });
            else await N.nativo.borrarLlave();
            return true;
          } catch (err) {
            return fallo(err);
          }
        },
      }),
      interruptor({
        id: 'a-aj-bloqueo', titulo: `Pedir ${b.nombre} al abrir la app`, detalle: 'Al abrir y al volver después de un minuto. Sirve también el código del celular.', icono: 'candado', activo: N.nativo.bloqueoActivo(),
        alCambiar: async (v) => {
          error.textContent = '';
          if (!v) {
            N.nativo.fijarBloqueo(false);
            return true;
          }
          try {
            await N.nativo.verificar({ razon: 'Confirma que eres tú', respaldo: true });
            N.nativo.fijarBloqueo(true);
            return true;
          } catch (err) {
            return fallo(err);
          }
        },
      }),
    );
    s.hidden = false;
  })();
  return s;
}

export function bloqueConexion(N, { simulacion = true } = {}) {
  if (EM.MODO_REAL) return '';
  const s = el('<section class="a-grupo"><h3>Conexión y simulación</h3><div class="a-tarjeta-lista"></div></section>');
  const lista = s.querySelector('.a-tarjeta-lista');
  lista.append(interruptor({
    id: 'a-aj-vivo', titulo: 'Conexión en vivo entre celulares', detalle: 'Usa relés públicos de internet. Al cambiarla, la app se vuelve a abrir.', icono: 'antena', activo: N.enVivoActivo(),
    alCambiar: (v) => {
      N.activarEnVivo(v);
      setTimeout(() => location.reload(), 350);
    },
  }));
  if (simulacion) {
    const actual = N.perfil.ajustes().simulacion || 'auto';
    const bloque = el(`<div class="a-radios" role="radiogroup" aria-label="Simulación de conductores">
      <label class="a-opcion"><input type="radio" name="a-sim" value="auto" ${actual === 'auto' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>Automática</strong><small>Si ningún conductor real acepta en unos segundos, entra uno de prueba.</small></span></label>
      <label class="a-opcion"><input type="radio" name="a-sim" value="real" ${actual === 'real' ? 'checked' : ''}><span class="a-opcion-marca" aria-hidden="true"></span><span><strong>Solo conductores reales</strong><small>Para la demo con celulares de conductores en la misma sala.</small></span></label>
    </div>`);
    bloque.addEventListener('change', (e) => N.perfil.guardarAjustes({ simulacion: e.target.value }));
    lista.append(bloque);
  }
  return s;
}

// Solo dentro de TaxiCun: de qué municipio y cooperativa es la app ahora, y
// «Cambiar de municipio» (vuelve a la lista de TaxiCun). alCambiar decide si se
// puede salir (por ejemplo, no con un viaje en curso). unica: en modo real hay una
// sola cooperativa con servicio y la lista la volvería a abrir (no se ofrece).
export function bloqueMunicipio(N, { alCambiar, unica = false } = {}) {
  if (!EM.EN_TAXICUN || (EM.MODO_REAL && unica)) return '';
  const s = el(`<section class="a-grupo a-tc-municipio" data-municipio><h3>Tu municipio</h3>
    <div class="a-tc-municipio-caja">
      ${EM.marcaIcono(44)}
      <span><strong>${esc(EM.PUEBLO)}</strong><small>${esc(`Taxis de ${EM.NOMBRE_LARGO} en ${EM.APP}`)}</small></span>
    </div>
    <button type="button" class="a-btn a-btn-suave" data-cambiar-municipio>${icono('pin', { tam: 20 })}<span>Cambiar de municipio</span></button>
    <p class="a-ayuda-txt">${esc(`${EM.APP} funciona en varios municipios de Cundinamarca. Si viajas a otro, escógelo y te mostramos su ${EM.TIPO} de taxis.`)}</p>
  </section>`);
  s.querySelector('[data-cambiar-municipio]').addEventListener('click', () => (alCambiar ? alCambiar() : (location.href = N.urlElegirMunicipio())));
  return s;
}

export function bloqueInstalar(N, app) {
  // Dentro de la app de la tienda no hay nada que instalar. En el modo real de la web
  // tampoco: la app instalada abre sin ?real=1, o sea la demo.
  if (EM.ES_NATIVA || EM.MODO_REAL) return '';
  const s = el(`<section class="a-grupo"><h3>${EM.EN_TAXICUN ? `Instalar ${esc(EM.APP)}` : 'Instalar la app'}</h3>
    <div class="a-instalar">
      ${EM.EN_TAXICUN ? EM.iconoApp(52) : EM.marcaIcono(52, { png: true })}
      <span><strong>${N.yaInstalada() ? 'Ya está instalada' : 'Tenla en tu pantalla de inicio'}</strong><small>${N.yaInstalada() ? 'La abriste desde tu pantalla de inicio.' : 'Se abre como una app, sin tienda y sin ocupar espacio.'}</small></span>
      ${N.yaInstalada() ? '' : `<button type="button" class="a-btn a-btn-primario a-btn-chico" data-instalar>${icono('instalar', { tam: 18 })} Instalar</button>`}
    </div></section>`);
  s.querySelector('[data-instalar]')?.addEventListener('click', async () => {
    const r = await N.instalar();
    if (r === 'manual') {
      await modal(app, {
        titulo: 'Así la instalas',
        cuerpo: `<ol class="a-pasos">${N.instruccionesInstalacion().map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`,
        acciones: [{ texto: 'Entendido', valor: true, clase: 'a-btn-primario' }],
      });
    }
  });
  return s;
}

// «Acerca de»: de qué cooperativa es la app y que la app es TaxiCun, desarrollada por interOS.
export function bloqueAcerca(N, { que = 'App de pasajeros' } = {}) {
  return el(`<section class="a-grupo a-acerca" data-acerca><h3>Acerca de la app</h3>
    <div class="a-acerca-caja">
      ${EM.marcaIcono(48)}
      <span><strong>${esc(EM.NOMBRE_LARGO)}</strong><small>${esc(`${que} de ${EM.RAZON_SOCIAL}`)}</small></span>
    </div>
    <div class="a-acerca-caja a-acerca-tc">
      ${EM.iconoApp(48)}
      <span><strong>${EM.palabraApp()}</strong><small>${esc(EM.LEMA_APP)}</small></span>
    </div>
    <p class="a-ayuda-txt a-version">${EM.MODO_REAL ? '' : `${chipPrueba('MODO PRUEBA')}${avisoDemo('a-chip-demo a-chip-demo-claro')}`}<span data-desarrollo>${esc(EM.TEXTO_DESARROLLO).replace(esc(EM.DESARROLLADOR), `<b>${esc(EM.DESARROLLADOR)}</b>`)}</span></p>
    ${EM.MODO_REAL ? enlacePrivacidad() : ''}
    ${EM.ES_PROPUESTA ? `<p class="a-ayuda-txt">${esc(EM.TEXTO_PROPUESTA)}.</p>` : ''}
  </section>`);
}

// Modo real: la política de privacidad a mano también con la sesión iniciada (Ajustes y
// Ayuda), como piden las tiendas.
export function enlacePrivacidad() {
  return `<a class="a-btn a-btn-suave a-btn-privacidad" href="${esc(EM.urlPrivacidad())}" target="_blank" rel="noopener" data-privacidad>${icono('candado', { tam: 18 })}<span>Política de privacidad</span></a>`;
}

// Solo en modo real: la cuenta de TaxiCun (correo con el que entró), «Mi cuenta»,
// «Cerrar sesión» y «Eliminar mi cuenta». Va en Ajustes para que se encuentre sin
// ayuda (lo pide la revisión de las tiendas). Lo usan el pasajero y el conductor:
//   abrir()        abre «Mi cuenta» (opcional)
//   cerrarSesion() y eliminar(): las acciones de cada app (piden confirmación ellas)
export function bloqueCuenta(N, { nombre = '', correo = '', abrir = null, cerrarSesion = null, eliminar = null } = {}) {
  if (!EM.MODO_REAL) return '';
  const s = el(`<section class="a-grupo a-tu-cuenta" data-cuenta><h3>Tu cuenta</h3>
    <div class="a-tarjeta-lista">
      ${abrir
        ? `<button type="button" class="a-fila-interruptor a-fila-boton" data-mi-cuenta>
            <span class="a-fila-ico">${icono('usuario', { tam: 20 })}</span>
            <span class="a-fila-txt"><strong>${esc(nombre || 'Mi cuenta')}</strong><small>${esc(correo || 'Tus datos y tu sesión')}</small></span>
            ${icono('adelante', { tam: 18 })}
          </button>`
        : `<div class="a-fila-interruptor">
            <span class="a-fila-ico">${icono('usuario', { tam: 20 })}</span>
            <span class="a-fila-txt"><strong>${esc(nombre || 'Tu cuenta')}</strong>${correo ? `<small>${esc(correo)}</small>` : ''}</span>
          </div>`}
    </div>
    ${cerrarSesion ? `<button type="button" class="a-btn a-btn-suave" data-salir>${icono('salir', { tam: 20 })}<span>Cerrar sesión</span></button>` : ''}
    ${eliminar ? `<button type="button" class="a-btn a-btn-eliminar" data-eliminar>${icono('basura', { tam: 20 })}<span>Eliminar mi cuenta</span></button>
      <p class="a-ayuda-txt">${esc(`Borra tu cuenta de ${EM.APP} y tus datos personales. No se puede deshacer.`)}</p>` : ''}
  </section>`);
  s.querySelector('[data-mi-cuenta]')?.addEventListener('click', () => abrir?.());
  s.querySelector('[data-salir]')?.addEventListener('click', () => cerrarSesion?.());
  s.querySelector('[data-eliminar]')?.addEventListener('click', () => eliminar?.());
  return s;
}
