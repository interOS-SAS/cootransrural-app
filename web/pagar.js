// Página de pago DE PRUEBA. Se abre cuando el pasajero escanea el QR de cobro
// del conductor con la cámara normal del celular:
//   pagar/?e=cooperativa&v=valor&id=viaje&m=movil&b=llave&c=conductorId&s=sala
// (sin ?e= es Cootransrural). pagar/index.html fija window.CT_EMPRESA desde ?e=
// antes de cargar este módulo, así el núcleo lee la ficha de esa cooperativa y
// el bus usa SU canal: el pago solo le llega a un conductor de esa cooperativa.
// No mueve dinero: solo avisa al conductor (por el bus de la sala) que el pago
// de prueba se hizo, para que la demostración se vea completa.
// Solo se cargan los módulos del núcleo que hacen falta (página ligera).
import { ID_EMPRESA, EMPRESA, TIPO_EMPRESA, COLORES, ES_PROPUESTA, PROVEEDOR, urlDelSitio } from '../nucleo/config.js';
import { Bus, enVivoActivo } from '../nucleo/bus.js';
import { BILLETERAS } from '../nucleo/datos.js';
import { pesos, horaTexto, fechaTexto, escaparHTML, esperar } from '../nucleo/util.js';
import { icono as iconoApp } from '../stickers/icono.js';

const tarjeta = document.getElementById('tarjeta');
const parametros = new URLSearchParams(location.search);
// Cada cooperativa guarda sus comprobantes aparte (Cootransrural conserva la clave de siempre).
const CLAVE_PAGOS = ID_EMPRESA === 'cootransrural' ? 'ct.pagosPrueba' : `ct.${ID_EMPRESA}.pagosPrueba`;
const NOMBRE = EMPRESA.nombre || EMPRESA.nombreCorto || 'la cooperativa';
// La app es TaxiCun (desarrollada por interOS), abierta con esta cooperativa.
const URL_APP = urlDelSitio(`taxicun/?e=${encodeURIComponent(ID_EMPRESA)}`);
// ¿La cooperativa del enlace es la que se cargó? (si la ficha no existe, el núcleo cae en Cootransrural).
const empresaReconocida = !window.CT_EMPRESA_INVALIDA && (window.CT_EMPRESA_PEDIDA || 'cootransrural') === ID_EMPRESA;

const valor = Math.round(Number(parametros.get('v')));
const viajeId = (parametros.get('id') || '').trim().slice(0, 80);
const movilCrudo = (parametros.get('m') || '').replace(/\D/g, '').slice(0, 3);
const movil = movilCrudo ? movilCrudo.padStart(3, '0') : '';
const conductorId = (parametros.get('c') || '').trim().slice(0, 80) || null;
const sala = (parametros.get('s') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
// Llave Bre-B de EJEMPLO que trae el QR del conductor (no existe en ningún banco).
const llaveBreB = /^@[a-z0-9]{3,40}$/i.test(parametros.get('b') || '') ? parametros.get('b') : '';

const billeteras = BILLETERAS?.length ? BILLETERAS : [{ id: 'breb', nombre: 'Bre-B', color: '#0B5FFF' }];
const valorValido = Number.isFinite(valor) && valor > 0 && valor <= 5000000;

/* ---------------- Marca de la cooperativa ---------------- */

const HEX = /^#[0-9a-f]{6}$/i;
// Colores de la ficha en las variables de web/paginas.css.
function aplicarColores() {
  const raiz = document.documentElement.style;
  const poner = (variable, color) => HEX.test(color || '') && raiz.setProperty(variable, color);
  poner('--verde', COLORES.primario);
  poner('--verde-2', COLORES.primario2 || COLORES.primario);
  poner('--verde-3', COLORES.primario2 || COLORES.primario);
  poner('--verde-osc', COLORES.oscuro);
  poner('--amarillo', COLORES.acento);
  if (HEX.test(COLORES.primario || '')) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORES.primario);
}

let iconoURL = '../img/icono-192.png';
function cabecera() {
  const lugar = EMPRESA.pueblo ? ` · ${escaparHTML(EMPRESA.pueblo)}` : '';
  return `<div class="pago-cabeza">
    <img class="pago-icono" src="${iconoURL}" alt="" width="46" height="46">
    <span><b>${escaparHTML(NOMBRE)}${movil ? ` · Móvil ${movil}` : ''}</b><small>Cobro del viaje${lugar}</small>${llaveBreB ? `<small class="pago-llave">Llave Bre-B: <b>${escaparHTML(llaveBreB)}</b> (ejemplo)</small>` : ''}</span>
  </div>`;
}

function pintarMarco() {
  aplicarColores();
  document.getElementById('franja-detalle').textContent = `Demostración del pago con QR de ${NOMBRE}`;
  if (ES_PROPUESTA) {
    const franja = document.getElementById('franja-propuesta');
    franja.innerHTML = `<b>Propuesta de demostración de TaxiCun</b>, preparada por ${escaparHTML(PROVEEDOR.nombre)} para ${escaparHTML(EMPRESA.razonSocial || NOMBRE)} · No es la página oficial de la ${TIPO_EMPRESA}`;
    franja.hidden = false;
  }
  document.getElementById('pie').innerHTML = `<a href="${escaparHTML(URL_APP)}">TaxiCun de ${escaparHTML(NOMBRE)}</a> · App TaxiCun · desarrollada por <a href="${escaparHTML(PROVEEDOR.web)}" rel="noopener">${escaparHTML(PROVEEDOR.nombre)}</a>`;
}

function esClaro(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return false;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}

function generarReferencia() {
  const azar = crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `PRB-${Date.now().toString(36).toUpperCase().slice(-4)}${azar}`;
}

function pagosGuardados() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_PAGOS) || '{}');
  } catch {
    return {};
  }
}

function guardarPago(recibo) {
  const todos = pagosGuardados();
  todos[recibo.viajeId] = recibo;
  // Solo se guardan los últimos 20 comprobantes.
  const recientes = Object.values(todos).sort((a, b) => b.hora - a.hora).slice(0, 20);
  localStorage.setItem(CLAVE_PAGOS, JSON.stringify(Object.fromEntries(recientes.map((r) => [r.viajeId, r]))));
}

/* ---------------- Enlace incompleto ---------------- */

function mostrarError() {
  const faltan = [];
  if (!valorValido) faltan.push('el valor del viaje');
  if (!viajeId) faltan.push('el número del viaje');
  document.title = `Enlace de pago incompleto · ${NOMBRE}`;
  tarjeta.innerHTML = `${cabecera()}
    <div class="error-pago">
      <span class="circulo"><svg class="icono"><use href="#i-alerta"/></svg></span>
      <h1>Este enlace de pago está incompleto</h1>
      <p>Falta ${faltan.join(' y ')}. Pídele al conductor que te muestre otra vez el código QR de cobro o, si prefieres, págale en efectivo.</p>
      <a class="boton boton-amarillo boton-ancho" href="${escaparHTML(URL_APP)}">Abrir TaxiCun con ${escaparHTML(NOMBRE)}</a>
    </div>`;
}

// El QR trae una cooperativa que no existe en la app: no se paga (el aviso
// iría al canal equivocado).
function mostrarEmpresaDesconocida() {
  document.title = 'Cooperativa no reconocida · Pago de prueba';
  document.getElementById('franja-detalle').textContent = 'Demostración del pago con QR';
  document.getElementById('pie').innerHTML = `App TaxiCun · desarrollada por <a href="${escaparHTML(PROVEEDOR.web)}" rel="noopener">${escaparHTML(PROVEEDOR.nombre)}</a>`;
  tarjeta.innerHTML = `<div class="error-pago">
      <span class="circulo"><svg class="icono"><use href="#i-alerta"/></svg></span>
      <h1>No reconocemos la cooperativa de este cobro</h1>
      <p>El código QR no corresponde a ninguna cooperativa de la app. Pídele al conductor que te muestre otra vez el código de cobro o, si prefieres, págale en efectivo.</p>
    </div>`;
}

async function arrancar() {
  if (!empresaReconocida) {
    mostrarEmpresaDesconocida();
    return;
  }
  pintarMarco();
  // Ícono de la app con los colores de la cooperativa (si falla, queda el de siempre).
  if (ID_EMPRESA !== 'cootransrural') {
    try {
      iconoURL = (await iconoApp()).url;
    } catch {
      /* se queda el ícono por defecto */
    }
  }
  if (!valorValido || !viajeId) mostrarError();
  else iniciar();
}

arrancar();

/* ---------------- Pago ---------------- */

function iniciar() {
  document.title = `Pagar ${pesos(valor)} (prueba) · ${NOMBRE}`;
  // El bus se abre de una vez para que alcance a conectarse mientras el pasajero elige.
  const bus = new Bus(sala ? { sala } : {});
  let confirmado = false;
  let alConfirmar = null;
  bus.on('pago_confirmado', (d) => {
    if (d?.viajeId !== viajeId) return;
    confirmado = true;
    alConfirmar?.();
  });
  window.addEventListener('pagehide', () => bus.cerrar());

  const esperarConexion = (ms) => new Promise((resolver) => {
    if (bus.conexion !== 'local') return resolver(true);
    let quitar = () => {};
    const t = setTimeout(() => { quitar(); resolver(false); }, ms);
    quitar = bus.on('conexion', (c) => {
      if (c === 'local') return;
      clearTimeout(t);
      quitar();
      resolver(true);
    });
  });

  const enviar = async (recibo) => {
    if (bus.conexion === 'local' && enVivoActivo()) await esperarConexion(4000);
    const datos = { viajeId, conductorId, metodo: 'qr', valor, billetera: recibo.billetera, ref: recibo.ref };
    bus.publicar('pago', datos);
    // Segundo envío por si el primero se perdió en algún relé.
    setTimeout(() => bus.publicar('pago', datos), 1500);
  };

  const previo = pagosGuardados()[viajeId];
  if (previo) mostrarComprobante(previo, { yaPagado: true });
  else mostrarFormulario();

  function mostrarFormulario() {
    // Si el QR es un cobro Bre-B, Bre-B va elegido de entrada.
    const elegida = llaveBreB ? 'breb' : localStorage.getItem('ct.billeteraPrueba');
    const inicial = billeteras.some((b) => b.id === elegida) ? elegida : billeteras[0].id;
    tarjeta.innerHTML = `${cabecera()}
      <div class="pago-valor">
        <span>Total a pagar</span>
        <b>${pesos(valor)}</b>
        <small>Viaje #${escaparHTML(viajeId.slice(-8).toUpperCase())}</small>
      </div>
      <form class="pago-cuerpo" id="form-pago">
        <h2>¿Con qué billetera pagas?</h2>
        <fieldset class="billeteras">
          <legend class="sr">Billetera</legend>
          ${billeteras.map((b) => `
            <div class="billetera${esClaro(b.color) ? ' clara' : ''}" style="--c:${b.color}">
              <input type="radio" name="billetera" id="b-${b.id}" value="${b.id}"${b.id === inicial ? ' checked' : ''}>
              <label for="b-${b.id}"><i aria-hidden="true">${escaparHTML(b.nombre.charAt(0))}</i>${escaparHTML(b.nombre)}</label>
            </div>`).join('')}
        </fieldset>
        <button class="boton boton-amarillo boton-grande boton-ancho" id="boton-pagar" type="submit">
          <svg class="icono"><use href="#i-candado"/></svg>Pagar ${pesos(valor)} (prueba)
        </button>
        <p class="pago-nota">Es una demostración: no se descuenta nada de tu cuenta.</p>
      </form>`;
    document.getElementById('form-pago').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = new FormData(e.target).get('billetera') || inicial;
      const billetera = billeteras.find((b) => b.id === id) || billeteras[0];
      localStorage.setItem('ct.billeteraPrueba', billetera.id);
      pagar(billetera);
    });
  }

  async function pagar(billetera) {
    tarjeta.innerHTML = `${cabecera()}
      <div class="procesando" style="--c:${billetera.color}">
        <div class="anillo"></div>
        <b id="paso-pago">Conectando con ${escaparHTML(billetera.nombre)}…</b>
        <small>Pago de prueba · no se mueve dinero</small>
      </div>`;
    const paso = document.getElementById('paso-pago');
    const t1 = setTimeout(() => { paso.textContent = 'Confirmando el pago…'; }, 700);
    const t2 = setTimeout(() => { paso.textContent = 'Avisándole al conductor…'; }, 1600);
    const recibo = { viajeId, valor, movil, billetera: billetera.nombre, color: billetera.color, ref: generarReferencia(), hora: Date.now() };
    await Promise.all([enviar(recibo), esperar(1500)]);
    clearTimeout(t1);
    clearTimeout(t2);
    guardarPago(recibo);
    mostrarComprobante(recibo, { yaPagado: false });
  }

  function mostrarComprobante(recibo, { yaPagado }) {
    tarjeta.innerHTML = `${cabecera()}
      <div class="comprobante">
        <div class="chulo"><svg class="icono"><use href="#i-check"/></svg></div>
        <h2>${yaPagado ? 'Este viaje ya está pagado' : 'Pago aprobado'} (prueba)</h2>
        <div class="monto">${pesos(recibo.valor)}</div>
        <dl class="recibo">
          <div><dt>Billetera</dt><dd>${escaparHTML(recibo.billetera)}</dd></div>
          ${llaveBreB && recibo.billetera === 'Bre-B' ? `<div><dt>Llave Bre-B</dt><dd>${escaparHTML(llaveBreB)} (ejemplo)</dd></div>` : ''}
          <div><dt>Referencia</dt><dd id="referencia">${escaparHTML(recibo.ref)}</dd></div>
          ${recibo.movil ? `<div><dt>Móvil</dt><dd>${escaparHTML(recibo.movil)}</dd></div>` : ''}
          <div><dt>Viaje</dt><dd>#${escaparHTML(recibo.viajeId.slice(-8).toUpperCase())}</dd></div>
          <div><dt>Fecha</dt><dd>${escaparHTML(fechaTexto(recibo.hora))}, ${escaparHTML(horaTexto(recibo.hora))}</dd></div>
        </dl>
        <p class="estado-envio" id="estado-envio"><span class="punto"></span><span id="texto-envio">Avisándole al conductor…</span></p>
        <div class="acciones">
          <a class="boton boton-amarillo boton-ancho" href="${escaparHTML(URL_APP)}">Volver a TaxiCun</a>
          <button class="boton boton-borde boton-ancho" id="reenviar" type="button">Reenviar la confirmación</button>
        </div>
        <p class="sello-agua">Comprobante de prueba · sin valor</p>
      </div>`;
    const estado = document.getElementById('estado-envio');
    const texto = document.getElementById('texto-envio');
    const marcarConfirmado = () => {
      estado.classList.add('ok');
      texto.textContent = 'El conductor recibió tu pago';
    };
    alConfirmar = marcarConfirmado;
    if (confirmado) marcarConfirmado();
    else if (yaPagado) texto.textContent = 'Si el conductor no lo ve, toca «Reenviar la confirmación».';
    else {
      setTimeout(() => {
        if (!confirmado) texto.textContent = 'Confirmación enviada. Si el conductor no la ve, muéstrale esta pantalla.';
      }, 6000);
    }
    document.getElementById('reenviar').addEventListener('click', async (e) => {
      const boton = e.currentTarget;
      boton.disabled = true;
      if (!confirmado) texto.textContent = 'Avisándole al conductor…';
      await enviar(recibo);
      setTimeout(() => {
        boton.disabled = false;
        if (!confirmado) texto.textContent = 'Confirmación enviada otra vez.';
      }, 1200);
    });
  }
}
