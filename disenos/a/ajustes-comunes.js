// Bloques de ajustes que comparten el pasajero y el conductor: diseño, sala de
// prueba, sonido, notificaciones, conexión en vivo, instalación y «Acerca de».
import { el, esc, icono, modal, chipPrueba, avisoDemo } from './ui.js';
import * as EM from './empresa.js';

const DISENOS = [
  { id: 'a', nombre: 'Ámbar Urbano', colores: ['#FFC107', '#121212', '#F4F5F7'] },
  { id: 'b', ...EM.DISENO_B },
  { id: 'c', nombre: 'Noche Neón', colores: ['#07090D', '#FFE14D', '#FF4D9D'] },
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
  b.addEventListener('click', () => {
    const v = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(v));
    alCambiar(v);
  });
  return fila;
}

export function bloqueDiseno(N, diseno) {
  const s = el(`<section class="a-grupo"><h3>Diseño de la app</h3>
    <div class="a-disenos" role="radiogroup" aria-label="Diseño de la app">
      ${DISENOS.map((d) => `<button type="button" role="radio" class="a-diseno" aria-checked="${d.id === diseno}" data-d="${d.id}">
        <span class="a-diseno-muestra">${d.colores.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <strong>${d.id.toUpperCase()}</strong><small>${esc(d.nombre)}</small></button>`).join('')}
    </div>
    <p class="a-ayuda-txt">Los tres diseños funcionan igual; cambia cómo se ve. Se guarda en este celular.</p></section>`);
  s.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (!b || b.dataset.d === diseno) return;
    N.perfil.elegirDiseno(b.dataset.d);
    recargarCon({ d: b.dataset.d });
  });
  return s;
}

export function bloqueSala(N, app) {
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

export function bloqueSonidoYAvisos(N) {
  const s = el('<section class="a-grupo"><h3>Avisos</h3><div class="a-tarjeta-lista"></div></section>');
  const lista = s.querySelector('.a-tarjeta-lista');
  lista.append(interruptor({
    id: 'a-aj-sonido', titulo: 'Sonido de los avisos', detalle: 'Suena cuando cambia tu viaje', icono: 'sonido', activo: N.perfil.ajustes().sonido !== false,
    alCambiar: (v) => {
      N.perfil.guardarAjustes({ sonido: v });
      if (v) N.sonar('exito');
    },
  }));
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

export function bloqueConexion(N, { simulacion = true } = {}) {
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

export function bloqueInstalar(N, app) {
  const s = el(`<section class="a-grupo"><h3>Instalar la app</h3>
    <div class="a-instalar">
      ${EM.marcaIcono(52, { png: true })}
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

// «Acerca de»: de qué cooperativa es la app y quién la desarrolló.
export function bloqueAcerca(N, { que = 'App de pasajeros' } = {}) {
  return el(`<section class="a-grupo a-acerca" data-acerca><h3>Acerca de la app</h3>
    <div class="a-acerca-caja">
      ${EM.marcaIcono(48)}
      <span><strong>${esc(EM.NOMBRE_LARGO)}</strong><small>${esc(`${que} de ${EM.RAZON_SOCIAL}`)}</small></span>
    </div>
    <p class="a-ayuda-txt a-version">${chipPrueba('MODO PRUEBA')}${avisoDemo('a-chip-demo a-chip-demo-claro')}<span>App desarrollada por <b>${esc(EM.PROVEEDOR)}</b></span></p>
    ${EM.ES_PROPUESTA ? `<p class="a-ayuda-txt">${esc(EM.TEXTO_PROPUESTA)}.</p>` : ''}
  </section>`);
}
