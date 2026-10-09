// Pago con QR o llave del conductor (modo real, servidor 0.10.0; núcleo en nucleo/cobro.js).
//
//   abrirComoMePagan(ctx)   app del conductor, menú → «Cómo me pagan»: entidad, llave, titular (opcional) y la imagen
//                           de su QR de cobro (solo donde es seguro: navegador, Android y la app de iPhone 1.2.1 o
//                           más). La imagen se lee aquí con jsQR y solo sube el texto; guardar y borrar piden el
//                           código fresco del correo.
//   hojaPagoQR(app, datos)  app del pasajero, «Pagar con QR o llave»: el QR REDIBUJADO, la entidad, la llave con
//                           «Copiar», el valor y «Ya pagué por transferencia».
//
// Todo lo que viene del servidor (llave, titular, texto del QR) se pone con textContent o se dibuja en un canvas:
// nunca pasa por innerHTML. Las demos no usan este archivo.
import * as N from '../../nucleo/index.js';
import { icono, abrirPanel, modal } from './ui.js';

const C = N.cobro;

// Nodo con texto (nunca HTML). attrs: atributos; hijos: nodos o textos.
function h(tag, { clase = '', texto = null, attrs = {} } = {}, ...hijos) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = String(texto);
  for (const [k, v] of Object.entries(attrs)) if (v !== false && v != null) n.setAttribute(k, v === true ? '' : String(v));
  for (const x of hijos) if (x != null && x !== false) n.append(x);
  return n;
}

// Un ícono propio (SVG fijo de ui.js, sin datos de nadie).
function ico(nombre, tam = 18) {
  const t = document.createElement('template');
  t.innerHTML = icono(nombre, { tam });
  return t.content.firstElementChild;
}

function asegurarEstilos() {
  if (document.getElementById('a-estilos-pago-qr')) return;
  const s = document.createElement('style');
  s.id = 'a-estilos-pago-qr';
  s.textContent = `
.a-pq{display:grid;gap:14px}
.a-pq-tarjeta{background:#fff;border:1.5px solid var(--a-borde,#e3e6ee);border-radius:20px;padding:14px;display:grid;gap:10px;color:var(--a-tinta,#111)}
.a-pq-cabeza{display:flex;align-items:center;justify-content:space-between;gap:8px}
.a-pq-entidad{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:17px}
.a-pq-entidad i{width:14px;height:14px;border-radius:50%;background:var(--color,#5b6b8c);box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(0,0,0,.12)}
.a-pq-prueba{font-size:11px;font-weight:800;letter-spacing:.08em;background:#FFC107;color:#1a1a1a;border-radius:999px;padding:3px 8px}
.a-pq-qr{display:grid;justify-items:center;gap:6px;padding:6px 0}
.a-pq-qr canvas{display:block;border-radius:12px;background:#fff;box-shadow:0 0 0 1px rgba(11,31,77,.1);max-width:100%;height:auto}
.a-pq-qr small,.a-pq-nota{color:var(--a-texto-2,#5b6b8c);font-size:13px;line-height:1.35;margin:0}
.a-pq-dato{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px dashed rgba(11,31,77,.14)}
.a-pq-dato>div{display:grid;min-width:0}
.a-pq-dato small{color:var(--a-texto-2,#5b6b8c);font-size:12px}
.a-pq-dato strong{font-size:17px;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.a-pq-copiar{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;border:1.5px solid var(--a-tinta,#111);background:#fff;color:var(--a-tinta,#111);font:inherit;font-weight:700;cursor:pointer;flex:none}
.a-pq-copiar[data-copiado]{background:#1E7B4A;border-color:#1E7B4A;color:#fff}
.a-pq-valor{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:12px 14px;border-radius:16px;background:#F3F6FC}
.a-pq-valor strong{font-size:26px;font-variant-numeric:tabular-nums}
.a-pq-form{display:grid;gap:12px}
.a-pq-form label{display:grid;gap:6px;font-weight:700;font-size:14px}
.a-pq-form select,.a-pq-form input[type=text],.a-pq-form input[type=tel],.a-pq-form input[type=email]{min-height:48px;border-radius:14px;border:1.5px solid var(--a-borde,#d5d9e3);padding:0 12px;font:inherit;font-weight:500;background:#fff;color:inherit}
.a-pq-form small{font-weight:500;color:var(--a-texto-2,#5b6b8c)}
.a-pq-error{color:#B3261E;font-size:13px;font-weight:600;margin:0}
.a-pq-subir{display:flex;align-items:center;justify-content:center;gap:8px;min-height:52px;border-radius:16px;border:1.5px dashed var(--a-tinta,#111);background:#fff;font:inherit;font-weight:700;cursor:pointer;color:inherit}
.a-pq-acciones{display:grid;gap:10px}
.a-pq-codigo{width:100%;min-height:54px;font-size:24px;letter-spacing:.3em;text-align:center;border-radius:14px;border:1.5px solid var(--a-borde,#d5d9e3);font-variant-numeric:tabular-nums}
.a-pq-vivo{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;
  document.head.appendChild(s);
}

// Tarjeta con el QR redibujado y la llave (la usan el pasajero y la vista previa del conductor).
function tarjetaMetodo(m, { copiar = true, avisar = () => {} } = {}) {
  const ent = C.ENTIDADES.find((e) => e.id === m.entidad) || C.ENTIDADES.at(-1);
  const marca = h('i', { attrs: { 'aria-hidden': 'true' } });
  marca.style.setProperty('--color', ent.color);
  const cabeza = h('div', { clase: 'a-pq-cabeza' },
    h('span', { clase: 'a-pq-entidad', attrs: { 'data-entidad': '' } }, marca, h('span', { texto: ent.nombre })),
    m.prueba ? h('span', { clase: 'a-pq-prueba', texto: 'DE PRUEBA', attrs: { 'data-prueba': '' } }) : null);
  const tarjeta = h('section', { clase: 'a-pq-tarjeta', attrs: { 'data-metodo': m.entidad } }, cabeza);
  if (m.qrTexto) {
    let lienzo = null;
    try {
      lienzo = C.lienzoQR(m.qrTexto, 220);
      lienzo.dataset.qrTexto = '';
    } catch {
      lienzo = null; // un texto que no cabe en un QR: queda la llave
    }
    if (lienzo) tarjeta.append(h('div', { clase: 'a-pq-qr', attrs: { 'data-qr': '' } }, lienzo, h('small', { texto: 'Escanéalo con la app de tu banco o billetera.' })));
  }
  const vivo = h('span', { clase: 'a-pq-vivo', attrs: { 'aria-live': 'polite' } });
  const llave = h('div', { clase: 'a-pq-dato' },
    h('div', {}, h('small', { texto: C.nombreTipoLlave(m.llaveTipo) }), h('strong', { texto: m.llave, attrs: { 'data-llave': '' } })));
  if (copiar) {
    const b = h('button', { clase: 'a-pq-copiar', attrs: { type: 'button', 'data-copiar': '', 'aria-label': 'Copiar la llave' } }, ico('copiar', 16), h('span', { texto: 'Copiar' }));
    b.addEventListener('click', async () => {
      const ok = await C.copiarTexto(m.llave);
      if (ok) {
        b.dataset.copiado = '';
        b.lastChild.textContent = 'Copiada';
        vivo.textContent = 'Llave copiada';
        setTimeout(() => {
          delete b.dataset.copiado;
          b.lastChild.textContent = 'Copiar';
        }, 2500);
      } else {
        avisar({ titulo: 'No pudimos copiar', cuerpo: 'Mantén presionada la llave para copiarla.', tipo: 'alerta' });
      }
    });
    llave.append(b);
  }
  tarjeta.append(llave, vivo);
  if (m.titular) {
    tarjeta.append(h('div', { clase: 'a-pq-dato' },
      h('div', {}, h('small', { texto: 'A nombre de' }), h('strong', { texto: m.titular, attrs: { 'data-titular': '' } }))));
  }
  if (m.prueba) tarjeta.append(h('p', { clase: 'a-pq-nota', texto: 'Llave de muestra para la revisión de la app: no existe en ningún banco. No transfieras dinero.' }));
  return tarjeta;
}

/* ================= pasajero ================= */

// Devuelve el método con el que dijo que pagó, o null si cerró la hoja.
// Lo que identifica a los métodos que se están mostrando (entidad, tipo, llave y QR): si el `cobro` cambia con la hoja
// abierta (el conductor cambió o quitó cómo le pagan), la app del pasajero la cierra (disenos/a/pasajero.js).
export function firmaMetodos(metodos) {
  return (metodos || []).map(C.limpiarMetodo).filter(Boolean).map((m) => [m.entidad, m.llaveTipo, m.llave, m.qrTexto].join('|')).join('\n');
}

export function hojaPagoQR(app, { metodos, valor, avisar = () => {} }) {
  asegurarEstilos();
  const lista = (metodos || []).map(C.limpiarMetodo).filter(Boolean);
  const cuerpo = h('div', { clase: 'a-pq', attrs: { 'data-hoja-pago-qr': firmaMetodos(metodos) } },
    h('p', { clase: 'a-pq-nota', texto: 'Le pagas directo al conductor desde la app de tu banco o billetera. TaxiCun no recibe tu dinero ni cobra comisión.' }),
    ...lista.map((m) => tarjetaMetodo(m, { avisar })),
    h('div', { clase: 'a-pq-valor' }, h('span', { texto: 'Valor a pagar' }), h('strong', { texto: N.pesos(valor), attrs: { 'data-valor': '' } })));
  return modal(app, {
    titulo: 'Pagar con QR o llave',
    cuerpo,
    clase: 'a-modal-pago-qr',
    acciones: [
      { texto: 'Volver', valor: null },
      { texto: 'Ya pagué por transferencia', valor: 'pague', clase: 'a-btn-primario' },
    ],
  }).then((r) => (r === 'pague' ? lista[0] || null : null));
}

/* ================= conductor ================= */

// Pide el código del correo y lo devuelve (o null si la persona cancela).
async function pedirCodigo(app, correo, avisos, accion) {
  try {
    await C.pedirCodigoCobro(correo);
  } catch (e) {
    // Si ya se pidió hace un momento, sirve el que llegó.
    if (e?.codigo !== 'espera_un_minuto') {
      avisos.mostrar({ titulo: 'No pudimos enviarte el código', cuerpo: C.textoErrorCobro(e), tipo: 'error' });
      return null;
    }
  }
  const input = h('input', { clase: 'a-pq-codigo', attrs: { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', 'aria-label': 'Código del correo', 'data-codigo-cobro': '' } });
  const cuerpo = h('div', { clase: 'a-pq' }, h('p', { clase: 'a-pq-nota', texto: `Para ${accion}, escribe el código que te enviamos a ${correo || 'tu correo'}. Así nadie con tu teléfono puede poner otra cuenta.` }), input);
  const r = await modal(app, {
    titulo: 'Confirma que eres tú',
    cuerpo,
    alAbrir: () => input.focus(),
    acciones: [{ texto: 'Cancelar', valor: null }, { texto: 'Confirmar', valor: () => input.value, clase: 'a-btn-primario' }],
  });
  setTimeout(() => input.focus(), 50);
  return r == null ? null : String(r).replace(/\D/g, '');
}

export function abrirComoMePagan({ app, avisos, cuenta }) {
  asegurarEstilos();
  const correo = cuenta?.usuario?.correo || '';
  abrirPanel(app, {
    titulo: 'Cómo me pagan',
    clase: 'a-panel-cobro',
    construir(cuerpo) {
      const caja = h('div', { clase: 'a-pq', attrs: { 'data-como-me-pagan': '' } });
      cuerpo.append(caja);
      let guardado = null;

      const limpiar = () => caja.replaceChildren();

      async function cargar() {
        limpiar();
        caja.append(h('p', { clase: 'a-pq-nota', texto: 'Cargando…', attrs: { 'data-cargando': '' } }));
        try {
          guardado = await C.miCobro();
        } catch (e) {
          limpiar();
          caja.append(h('p', { clase: 'a-pq-error', texto: C.textoErrorCobro(e), attrs: { 'data-error-cobro': '' } }));
          const otra = h('button', { clase: 'a-btn a-btn-suave', texto: 'Intentar de nuevo', attrs: { type: 'button' } });
          otra.addEventListener('click', cargar);
          caja.append(otra);
          return;
        }
        if (guardado) resumen();
        else formulario(null);
      }

      function intro() {
        return h('p', { clase: 'a-pq-nota', texto: 'Cuando termines un viaje, el pasajero ve tu QR o tu llave y te paga directo a tu cuenta. TaxiCun no toca la plata ni cobra comisión. La cooperativa no ve tu llave.' });
      }

      function resumen() {
        limpiar();
        caja.append(intro(), h('h3', { clase: 'a-subtitulo', texto: 'Así te ve el pasajero' }), tarjetaMetodo(guardado, { copiar: false }));
        const cambiar = h('button', { clase: 'a-btn a-btn-primario a-btn-grande', texto: 'Cambiar', attrs: { type: 'button', 'data-cambiar': '' } });
        const borrar = h('button', { clase: 'a-btn-texto a-texto-peligro', texto: 'Borrar mis datos de pago', attrs: { type: 'button', 'data-borrar': '' } });
        cambiar.addEventListener('click', () => formulario(guardado));
        borrar.addEventListener('click', borrarDatos);
        caja.append(h('div', { clase: 'a-pq-acciones' }, cambiar, borrar));
      }

      async function borrarDatos() {
        const ok = await modal(app, {
          titulo: '¿Borrar tus datos de pago?',
          texto: 'Los pasajeros dejarán de ver tu QR y tu llave. Te pueden seguir pagando en efectivo.',
          acciones: [{ texto: 'Cancelar', valor: false }, { texto: 'Borrar', valor: true, clase: 'a-btn-peligro' }],
        });
        if (!ok) return;
        const codigo = await pedirCodigo(app, correo, avisos, 'borrar tus datos de pago');
        if (!codigo) return;
        try {
          await C.borrarCobro(codigo);
          guardado = null;
          avisos.mostrar({ titulo: 'Borramos tus datos de pago', cuerpo: 'Los pasajeros te pagan en efectivo.', tipo: 'exito' });
          formulario(null);
        } catch (e) {
          avisos.mostrar({ titulo: 'No pudimos borrarlos', cuerpo: C.textoErrorCobro(e), tipo: 'error' });
        }
      }

      function formulario(previo) {
        limpiar();
        const datos = { qrTexto: previo?.qrTexto || '' };
        const selEntidad = h('select', { attrs: { 'data-entidad-sel': '', name: 'entidad' } },
          ...C.ENTIDADES.map((e) => h('option', { texto: e.nombre, attrs: { value: e.id, selected: previo?.entidad === e.id } })));
        const selTipo = h('select', { attrs: { 'data-tipo-llave': '', name: 'llaveTipo' } },
          ...C.TIPOS_LLAVE.map((t) => h('option', { texto: t.nombre, attrs: { value: t.id, selected: previo?.llaveTipo === t.id } })));
        const inLlave = h('input', { attrs: { type: 'text', 'data-llave-input': '', name: 'llave', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: '80' } });
        inLlave.value = previo?.llave || '';
        const ayuda = h('small');
        const inTitular = h('input', { attrs: { type: 'text', 'data-titular-input': '', name: 'titular', maxlength: '40', autocomplete: 'name', placeholder: 'Como aparece en tu banco (opcional)' } });
        inTitular.value = previo?.titular || '';
        const error = h('p', { clase: 'a-pq-error', attrs: { 'data-error-cobro': '', role: 'alert', hidden: true } });
        const ponerTipo = () => {
          const t = C.TIPOS_LLAVE.find((x) => x.id === selTipo.value) || C.TIPOS_LLAVE[0];
          ayuda.textContent = `${t.ayuda}. Ej.: ${t.ejemplo}`;
          inLlave.setAttribute('inputmode', t.teclado === 'tel' || t.teclado === 'numeric' ? 'numeric' : t.teclado === 'email' ? 'email' : 'text');
        };
        selTipo.addEventListener('change', ponerTipo);
        ponerTipo();

        // QR: la imagen solo donde es seguro (ver nucleo/cobro.js imagenQRPermitida).
        const zonaQR = h('div', { clase: 'a-pq', attrs: { 'data-zona-qr': '' } });
        const pintarQR = () => {
          zonaQR.replaceChildren();
          if (datos.qrTexto) {
            let lienzo = null;
            try {
              lienzo = C.lienzoQR(datos.qrTexto, 200);
            } catch {
              lienzo = null;
            }
            const quitar = h('button', { clase: 'a-btn-texto', texto: 'Quitar el QR', attrs: { type: 'button', 'data-quitar-qr': '' } });
            quitar.addEventListener('click', () => {
              datos.qrTexto = '';
              pintarQR();
            });
            zonaQR.append(h('div', { clase: 'a-pq-qr', attrs: { 'data-vista-qr': '' } }, lienzo, h('small', { texto: 'Así lo verá el pasajero (lo dibuja la app; tu imagen no se guarda).' })), quitar);
          }
          if (C.imagenQRPermitida()) {
            const archivo = h('input', { attrs: { type: 'file', accept: 'image/*', hidden: true, 'data-archivo-qr': '' } });
            const subir = h('button', { clase: 'a-pq-subir', attrs: { type: 'button', 'data-subir-qr': '' } }, ico('qr', 20), h('span', { texto: datos.qrTexto ? 'Cambiar la imagen del QR' : 'Subir la imagen del QR' }));
            subir.addEventListener('click', () => archivo.click());
            archivo.addEventListener('change', async () => {
              const f = archivo.files?.[0];
              archivo.value = '';
              if (!f) return;
              error.hidden = true;
              try {
                const texto = await C.leerQRDeImagen(f);
                const v = C.validarQrTexto(texto);
                if (!v.ok) throw new Error(C.textoErrorCobro(v.error));
                datos.qrTexto = texto;
                if (v.titular && !inTitular.value.trim()) inTitular.value = v.titular;
                pintarQR();
              } catch (e) {
                error.textContent = e?.message || 'No pudimos leer ese QR.';
                error.hidden = false;
              }
            });
            zonaQR.append(subir, archivo, h('p', { clase: 'a-pq-nota', texto: 'Descarga el QR para recibir pagos desde tu app de Nequi, Daviplata o tu banco y súbelo aquí. Solo guardamos lo que dice el código, no la imagen.' }));
          } else {
            zonaQR.append(h('p', { clase: 'a-pq-nota', attrs: { 'data-sin-imagen': '' }, texto: 'Para subir la imagen de tu QR, actualiza la app a la versión 1.2.1 o más nueva. Mientras tanto, escribe tu llave: el pasajero la copia y te paga desde su banco.' }));
          }
        };
        pintarQR();

        const guardar = h('button', { clase: 'a-btn a-btn-primario a-btn-grande', texto: 'Guardar', attrs: { type: 'submit', 'data-guardar-cobro': '' } });
        const form = h('form', { clase: 'a-pq-form', attrs: { novalidate: true } },
          h('label', {}, h('span', { texto: 'Banco o billetera' }), selEntidad),
          h('label', {}, h('span', { texto: 'Tipo de llave' }), selTipo),
          h('label', {}, h('span', { texto: 'Tu llave' }), inLlave, ayuda),
          h('label', {}, h('span', { texto: 'Titular' }), inTitular),
          h('h3', { clase: 'a-subtitulo', texto: 'Tu QR de cobro (opcional)' }), zonaQR,
          error, guardar);
        if (previo) {
          const volver = h('button', { clase: 'a-btn-texto', texto: 'Cancelar', attrs: { type: 'button', 'data-cancelar-cobro': '' } });
          volver.addEventListener('click', resumen);
          form.append(volver);
        }
        form.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          error.hidden = true;
          const llaveTipo = selTipo.value;
          const llave = C.normalizarLlave(llaveTipo, inLlave.value);
          const titular = C.normalizarTitular(inTitular.value);
          const fallo = C.validarLlave(llaveTipo, llave) || C.validarTitular(titular) || (datos.qrTexto && !C.validarQrTexto(datos.qrTexto).ok ? 'qr_no_valido' : null);
          if (fallo) {
            error.textContent = C.textoErrorCobro(fallo);
            error.hidden = false;
            return;
          }
          inLlave.value = llave;
          guardar.disabled = true;
          try {
            const codigo = await pedirCodigo(app, correo, avisos, 'guardar cómo te pagan');
            if (!codigo) return;
            const r = await C.guardarCobro({ entidad: selEntidad.value, llaveTipo, llave, qrTexto: datos.qrTexto, titular, codigo });
            guardado = r || { entidad: selEntidad.value, llaveTipo, llave, qrTexto: datos.qrTexto, titular, prueba: false };
            avisos.mostrar({ titulo: 'Guardamos cómo te pagan', cuerpo: 'Te enviamos un aviso al correo. Si no fuiste tú, cámbialo enseguida.', tipo: 'exito' });
            resumen();
          } catch (e) {
            error.textContent = C.textoErrorCobro(e);
            error.hidden = false;
          } finally {
            guardar.disabled = false;
          }
        });
        caja.append(intro(), form);
      }

      cargar();
    },
  });
}
