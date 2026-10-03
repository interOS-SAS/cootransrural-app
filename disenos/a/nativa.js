// App nativa 1.2 en el diseño A: los permisos de avisos en el momento justo, Face ID /
// huella (ofrecerlo tras entrar con código y «Entrar con Face ID» en el ingreso) y la capa
// de bloqueo al abrir. Solo hace algo en la app de las tiendas con los plugins nuevos
// (N.nativo.*, ver nucleo/nativo.js); en la web, en las demos y en la app 1.0 no aparece nada.
//
//   ofrecerAvisos(app, { N, rol })          modal «Te avisamos…» la primera vez (conductor: al
//                                            ponerse en turno; pasajero: al pedir su primer taxi)
//   ofrecerBiometria(app, { N, correo })    «¿Entrar con Face ID la próxima vez?» tras el código
//   ingresoBiometria({ N, alEntrar, alError }) bloque «Entrar con Face ID» (o null si no hay llave)
//   montarBloqueo(app, { N, alSalir })      capa «TaxiCun está bloqueada» al abrir y al volver
//                                            tras más de 60 s (si está puesto en Ajustes)
//   ofrecerSegundoPlano(app, { N, forzar })  «Tu ubicación mientras estás conectado» (con el plugin
//                                            UbicacionTurno): la primera vez que se pone en turno,
//                                            antes de iniciar el seguimiento; forzar: desde Ajustes
import { el, esc, icono, modal, franjaCuadros } from './ui.js';
import * as EM from './empresa.js';

// ¿App nativa del modo real con el núcleo 1.2?
const activa = (N) => Boolean(EM.MODO_REAL && EM.ES_NATIVA && N?.nativo);

/* ---------------- ubicación con la app minimizada (plugin UbicacionTurno) ---------------- */

// El aviso va ANTES de iniciar el seguimiento: para Google es la «divulgación destacada» del
// servicio en primer plano de ubicación. «Entendido» lo guarda; «Ahora no», solo con la app
// abierta, como hasta ahora (se puede activar en Ajustes). Cerrarlo sin elegir no guarda nada.
// Devuelve true si quedó aceptado.
export async function ofrecerSegundoPlano(app, { N, forzar = false }) {
  if (!activa(N) || !N.nativo.turnoNativoDisponible?.()) return false;
  const dicho = N.nativo.avisoSegundoPlano();
  if (dicho === 'si') return true;
  if (dicho === 'no' && !forzar) return false;
  const android = N.nativo.plataforma?.() === 'android';
  const lista = [
    ['candado', 'La ven la central y el pasajero de tu servicio; los demás pasajeros de tu cooperativa solo ven una posición aproximada de tu taxi. No guardamos tu recorrido.'],
    android
      ? ['campana', 'En Android verás una notificación fija «Estás en turno»; desde ahí también puedes salir de turno cuando no tengas un servicio en curso.']
      : ['gps', 'En iPhone verás el indicador azul de ubicación arriba en la pantalla.'],
    ['potencia', 'Para que se detenga, desconéctate o cierra la app.'],
  ];
  const si = await modal(app, {
    titulo: 'Tu ubicación mientras estás conectado',
    texto: `Mientras estés conectado, ${EM.APP} Conductor sigue enviando tu ubicación aunque uses WhatsApp, Waze u otra app, o bloquees el teléfono. Así te llegan los servicios cercanos y tu pasajero ve por dónde vas.`,
    cuerpo: `<ul class="a-nat-lista">${lista.map(([ico, t]) => `<li>${icono(ico, { tam: 18 })}<span>${esc(t)}</span></li>`).join('')}</ul>`,
    icono: `<span class="a-nat-ico">${icono('gps', { tam: 32 })}</span>`,
    clase: 'a-modal-nativa a-modal-segundo-plano',
    acciones: [
      { texto: 'Entendido', valor: true, clase: 'a-btn-primario', icono: 'check' },
      { texto: 'Ahora no', valor: false, clase: 'a-btn-suave' },
    ],
  });
  if (si == null) return false;
  N.nativo.fijarAceptoSegundoPlano(Boolean(si));
  return Boolean(si);
}

/* ---------------- avisos (notificaciones push) ---------------- */

const claveOfrecido = (rol) => `taxicun.push.ofrecido.${rol}`;

// Devuelve el permiso que quedó ('granted', 'denied', 'prompt' o 'no-disponible').
export async function ofrecerAvisos(app, { N, rol }) {
  if (!activa(N) || !N.nativo.pushDisponible()) return 'no-disponible';
  const permiso = await N.nativo.permisoPush();
  if (permiso === 'granted') {
    // Ya los tenía (por ejemplo, reinstaló la app): solo se registra este teléfono.
    N.nativo.registrarPush(rol, { pedir: false });
    return permiso;
  }
  if (permiso !== 'prompt') return permiso;
  try {
    if (localStorage.getItem(claveOfrecido(rol))) return permiso;
    localStorage.setItem(claveOfrecido(rol), String(Date.now()));
  } catch {
    /* sin almacenamiento: se ofrece igual */
  }
  const conductor = rol === 'conductor';
  const si = await modal(app, {
    titulo: conductor ? 'Que no se te pase ningún servicio' : '¿Te avisamos cuando llegue tu taxi?',
    texto: conductor
      ? 'Te avisamos de servicios nuevos aunque tengas la app cerrada o el celular bloqueado. Si pasa un rato sin que abras la app, te avisamos que tu turno quedó en pausa.'
      : 'Te avisamos cuando un conductor acepte tu servicio y cuando tu taxi esté en la puerta, aunque tengas la app cerrada.',
    icono: `<span class="a-nat-ico">${icono('campana', { tam: 32 })}</span>`,
    clase: 'a-modal-nativa',
    acciones: [
      { texto: conductor ? 'Activar avisos' : 'Sí, avisarme', valor: true, clase: 'a-btn-primario', icono: 'campana' },
      { texto: 'Ahora no', valor: false, clase: 'a-btn-suave' },
    ],
  });
  if (!si) return 'prompt';
  return N.nativo.registrarPush(rol, { pedir: true });
}

/* ---------------- Face ID / huella ---------------- */

// Después de entrar con el código del correo: si hay biometría y este teléfono no tiene
// llave de esta cuenta, se ofrece. Devuelve true si quedó activado.
export async function ofrecerBiometria(app, { N, correo = '', avisar = null }) {
  if (!activa(N) || !N.nativo.biometriaPosible()) return false;
  const b = await N.nativo.biometria();
  if (!b.disponible) return false;
  const llave = await N.nativo.llaveGuardada();
  const dueno = String(correo || '').trim().toLowerCase();
  if (llave && (!llave.correo || !dueno || llave.correo === dueno)) return false;
  const si = await modal(app, {
    titulo: `¿Entrar con ${b.nombre} la próxima vez?`,
    texto: `Así entras a ${EM.APP} sin esperar el código del correo. Puedes quitarlo cuando quieras en Ajustes.`,
    icono: `<span class="a-nat-ico">${icono(b.icono, { tam: 34 })}</span>`,
    clase: 'a-modal-nativa',
    acciones: [
      { texto: `Usar ${b.nombre}`, valor: true, clase: 'a-btn-primario', icono: b.icono },
      { texto: 'Ahora no', valor: false, clase: 'a-btn-suave' },
    ],
  });
  if (!si) return false;
  try {
    await N.nativo.crearLlave({ correo: dueno });
  } catch (err) {
    if (err?.codigo === 'cancelada') return false;
    const texto = err?.name === 'ErrorBiometria' ? err.message : EM.textoError(err);
    if (avisar) avisar({ titulo: `No pudimos activar ${b.nombre}`, cuerpo: `${texto} Puedes intentarlo en Ajustes.`, tipo: 'error' });
    else await modal(app, { titulo: `No pudimos activar ${b.nombre}`, texto: `${texto} Puedes intentarlo en Ajustes.` });
    return false;
  }
  avisar?.({ titulo: `Listo: entrarás con ${b.nombre}`, cuerpo: `La próxima vez entras a ${EM.APP} sin esperar el código del correo.`, tipo: 'exito' });
  return true;
}

// Bloque del ingreso: «Entrar con Face ID» (con el correo de la llave, si se conoce) y la
// raya «o con el código del correo». null si no hay biometría o no hay llave guardada.
//   alEntrar(r): ya hay sesión ({ usuario, conductor }, como tras el código)
//   alError(texto): la llave ya no sirve o algo falló (el bloque se quita si la llave no sirve)
export async function ingresoBiometria({ N, alEntrar, alError = () => {} }) {
  if (!activa(N) || !N.nativo.biometriaPosible()) return null;
  const [b, llave] = await Promise.all([N.nativo.biometria(), N.nativo.llaveGuardada()]);
  if (!b.disponible || !llave) return null;
  const bloque = el(`<div class="a-bio-ingreso" data-biometria>
      <button type="button" class="a-btn a-btn-tinta a-btn-grande a-btn-bio" data-entrar-bio>${icono(b.icono, { tam: 24 })}<span>Entrar con ${esc(b.nombre)}</span></button>
      ${llave.correo ? `<p class="a-bio-cuenta">${icono('usuario', { tam: 14 })}<span>${esc(llave.correo)}</span></p>` : ''}
      <p class="a-separador-o"><span>o con el código del correo</span></p>
    </div>`);
  const boton = bloque.querySelector('[data-entrar-bio]');
  boton.addEventListener('click', async () => {
    if (boton.disabled) return;
    boton.disabled = true;
    boton.classList.add('a-ocupado');
    try {
      const r = await N.nativo.entrarConLlave({ razon: `Entra a ${EM.APP}` });
      alEntrar(r);
    } catch (err) {
      boton.disabled = false;
      boton.classList.remove('a-ocupado');
      if (err?.codigo === 'cancelada') return;
      if (err?.codigo === 'llave_invalida') bloque.remove();
      alError(err?.name === 'ErrorBiometria' ? err.message : EM.textoError(err));
    }
  });
  return bloque;
}

/* ---------------- bloqueo al abrir ---------------- */

// En la capa no se habla del código del correo (ahí no se usa): solo de intentar otra vez.
const TEXTOS_BLOQUEO = {
  no_reconocida: 'No pudimos reconocerte. Intenta otra vez.',
  bloqueada: 'Se bloqueó por muchos intentos. Desbloquea el celular y vuelve a intentar.',
  fallo: 'No pudimos verificarte. Intenta otra vez.',
};

// alSalir(): cierra la sesión sin preguntar (la persona lo confirmó en la capa) y vuelve al
// ingreso. Devuelve { mostrar, quitar }.
export function montarBloqueo(app, { N, alSalir = null }) {
  const nada = { mostrar() {}, quitar() {} };
  if (!activa(N) || !N.nativo.biometriaPosible()) return nada;
  let capa = null;
  let nombre = 'Face ID';
  let ico = 'rostro';
  N.nativo.biometria().then((b) => {
    if (b.nombre) [nombre, ico] = [b.nombre, b.icono];
    if (capa) pintar();
  });

  function quitar() {
    if (!capa) return;
    const c = capa;
    capa = null;
    c.classList.add('a-sale');
    setTimeout(() => c.remove(), 280);
  }

  function pintar({ error = '', confirmarSalida = false } = {}) {
    if (!capa) return;
    capa.innerHTML = `
      ${franjaCuadros('a-bloqueo-cuadros')}
      <div class="a-bloqueo-caja">
        <div class="a-bloqueo-marca">${EM.iconoApp(64)}</div>
        <span class="a-bloqueo-candado" aria-hidden="true">${icono('candado', { tam: 22 })}</span>
        <h1 tabindex="-1">${esc(EM.APP)} está bloqueada</h1>
        ${confirmarSalida
          ? `<p class="a-bloqueo-texto">Cerramos tu sesión en este celular. Para volver a entrar usas el código del correo.</p>
            <button type="button" class="a-btn a-btn-peligro a-btn-grande" data-salir-si>${icono('salir', { tam: 20 })}<span>Cerrar sesión</span></button>
            <button type="button" class="a-btn-texto" data-salir-no>Volver</button>`
          : `<p class="a-bloqueo-texto">Desbloquéala con ${esc(nombre)} o con el código de tu celular.</p>
            <p class="a-bloqueo-error" role="alert">${esc(error)}</p>
            <button type="button" class="a-btn a-btn-primario a-btn-grande" data-desbloquear>${icono(ico, { tam: 22 })}<span>Desbloquear</span></button>
            ${alSalir ? '<button type="button" class="a-btn-texto" data-salir>¿No puedes? Cierra sesión</button>' : ''}`}
      </div>`;
    capa.querySelector('[data-desbloquear]')?.addEventListener('click', () => desbloquear());
    capa.querySelector('[data-salir]')?.addEventListener('click', () => pintar({ confirmarSalida: true }));
    capa.querySelector('[data-salir-no]')?.addEventListener('click', () => pintar());
    capa.querySelector('[data-salir-si]')?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.classList.add('a-ocupado');
      try {
        await alSalir?.();
      } finally {
        quitar();
      }
    });
    (capa.querySelector('[data-desbloquear], [data-salir-si]') || capa.querySelector('h1'))?.focus({ preventScroll: true });
  }

  let verificando = false;
  async function desbloquear() {
    if (!capa || verificando || document.hidden) return;
    verificando = true;
    const b = capa.querySelector('[data-desbloquear]');
    b?.classList.add('a-ocupado');
    try {
      await N.nativo.verificar({ razon: `Desbloquea ${EM.APP}`, respaldo: true });
      quitar();
    } catch (err) {
      b?.classList.remove('a-ocupado');
      // Sin Face ID ni código en el celular ya no hay cómo desbloquear: se quita el bloqueo.
      if (err?.codigo === 'no_disponible') {
        N.nativo.fijarBloqueo(false);
        quitar();
        return;
      }
      pintar({ error: err?.codigo === 'cancelada' ? '' : TEXTOS_BLOQUEO[err?.codigo] || TEXTOS_BLOQUEO.fallo });
    } finally {
      verificando = false;
    }
  }

  function mostrar() {
    if (capa) return;
    capa = el(`<div class="a-bloqueo" role="dialog" aria-modal="true" aria-label="${esc(`${EM.APP} está bloqueada`)}"></div>`);
    app.append(capa);
    pintar();
    // Face ID sale solo si la app está a la vista (al volver, iOS la muestra un instante después).
    if (!document.hidden) setTimeout(desbloquear, 250);
  }

  // Al volver a la app con la capa puesta (se fue a mitad de camino), se pide de nuevo.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && capa) setTimeout(desbloquear, 250);
  });
  N.nativo.vigilarBloqueo(mostrar);
  return { mostrar, quitar };
}
