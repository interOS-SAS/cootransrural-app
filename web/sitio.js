// Comportamiento de la página de inicio de cada cooperativa: menú, animaciones
// al hacer scroll, códigos QR, tabla de tarifas, cotizador, mapa de la oficina,
// formulario «Programa tu servicio» (arma el mensaje de WhatsApp para la central)
// y calculadora de costos. La cooperativa la fija la página con
// window.CT_EMPRESA; sus datos salen de la ficha que carga el núcleo.
import * as N from '../nucleo/index.js';

window.ctSitioListo = true;

// Ícono de la cooperativa (ruta relativa a la página, la pone la plantilla).
const ICONO = document.documentElement.dataset.icono || 'img/icono-192.png';
// Ícono de TaxiCun (la app que abre el QR de la portada).
const ICONO_TAXICUN = new URL('../img/taxicun/icono-192.png', import.meta.url).href;
const E = N.EMPRESA;
// Oferta de servicio programado (de las tarifas de la ficha).
const DESCUENTO = Math.round((N.TARIFAS.descuentoProgramado ?? 0.1) * 100);
const HORAS = N.TARIFAS.horasAnticipacion ?? 24;

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Cada parte va por separado: si una falla, las demás siguen funcionando.
function intentar(nombre, fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch((e) => console.warn(`[web] ${nombre}:`, e));
  } catch (e) {
    console.warn(`[web] ${nombre}:`, e);
  }
}

/* ---------------- Barra superior y menú ---------------- */

/* ---------------- Franja de propuesta ---------------- */

// La franja fija de las propuestas puede ocupar una, dos o tres líneas: su alto
// real corre la barra y el menú hacia abajo.
function franjaPropuesta() {
  const franja = $('#franja');
  if (!franja) return;
  const medir = () => document.documentElement.style.setProperty('--alto-franja', `${Math.ceil(franja.getBoundingClientRect().height)}px`);
  medir();
  if ('ResizeObserver' in window) new ResizeObserver(medir).observe(franja);
  else window.addEventListener('resize', medir);
}

function barraSuperior() {
  const barra = $('#barra');
  const boton = $('#hamburguesa');
  const menu = $('#menu');
  const alHacerScroll = () => barra.classList.toggle('con-fondo', window.scrollY > 30);
  alHacerScroll();
  window.addEventListener('scroll', alHacerScroll, { passive: true });

  const abrir = (si) => {
    barra.classList.toggle('abierta', si);
    boton.setAttribute('aria-expanded', String(si));
    boton.setAttribute('aria-label', si ? 'Cerrar el menú' : 'Abrir el menú');
  };
  boton.addEventListener('click', () => abrir(!barra.classList.contains('abierta')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
  document.addEventListener('click', (e) => { if (!barra.contains(e.target)) abrir(false); });

  // Resalta en el menú la sección que se está viendo.
  const enlaces = new Map($$('a', menu).map((a) => [a.getAttribute('href').slice(1), a]));
  const secciones = [...enlaces.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  const visibles = new Map();
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) visibles.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
    let mejor = null;
    let valor = 0;
    for (const [id, v] of visibles) if (v > valor) { mejor = id; valor = v; }
    for (const [id, a] of enlaces) {
      const activo = id === mejor;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
  }, { rootMargin: '-35% 0px -55% 0px', threshold: [0, 0.01, 0.5, 1] });
  secciones.forEach((s) => observador.observe(s));
}

/* ---------------- Animaciones al hacer scroll ---------------- */

function revelarAlVer() {
  const elementos = $$('.revelar');
  if (sinMovimiento || !('IntersectionObserver' in window)) {
    elementos.forEach((el) => el.classList.add('visible'));
    return;
  }
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('visible');
      observador.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  elementos.forEach((el) => observador.observe(el));
}

function contadores() {
  const cifras = $$('[data-contar]');
  if (sinMovimiento || !cifras.length) return;
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observador.unobserve(e.target);
      const meta = Number(e.target.dataset.contar);
      // Solo cambia el número: el sufijo («+», «h») va en un <small> aparte y se conserva.
      const numero = [...e.target.childNodes].find((n) => n.nodeType === Node.TEXT_NODE)
        || e.target.insertBefore(document.createTextNode(''), e.target.firstChild);
      const t0 = performance.now();
      const duracion = 1300;
      const paso = (t) => {
        const avance = Math.min(1, (t - t0) / duracion);
        const suave = 1 - (1 - avance) ** 3;
        numero.textContent = String(Math.round(meta * suave));
        if (avance < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  }, { threshold: 0.6 });
  cifras.forEach((c) => observador.observe(c));
}

/* ---------------- Códigos QR ---------------- */

// Color de los QR: el de la cooperativa si es bastante oscuro (los lectores
// necesitan contraste); si no, su tono oscuro.
function colorQR() {
  const luz = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 1;
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const { primario, oscuro } = N.COLORES || {};
  if (primario && luz(primario) < 0.18) return primario;
  if (oscuro && luz(oscuro) < 0.18) return oscuro;
  return '#0E1E16';
}

function codigosQR() {
  const urlDescarga = N.urlDescarga({ origen: 'web' });
  const caja = $('#qr-descarga');
  // Módulos cuadrados: el estilo redondeado no siempre lo lee jsQR (el lector de la app en iPhone).
  caja.innerHTML = N.qrSVG(urlDescarga, { nivel: 'H', color: colorQR(), margen: 1 }) + `<img class="qr-logo" src="${ICONO_TAXICUN}" alt="" width="48" height="48">`;
  const enlace = $('#qr-descarga-url');
  enlace.href = urlDescarga;
  // La dirección completa solo en la cooperativa principal: en las demás, la del
  // sitio de pruebas lleva el nombre del repositorio y confunde; queda el texto del enlace.
  if (N.ID_EMPRESA === 'cootransrural') enlace.textContent = urlDescarga.replace(/^https?:\/\//, '').replace(/\?.*$/, '');

  // QR de cobro de muestra: si lo escaneas, abre la página de pago de prueba.
  const valor = 12000;
  const urlCobro = N.urlPago({ viaje: 'muestra-web', valor, movil: '023', sala: 'muestra-web' });
  $('#qr-cobro').innerHTML = N.qrSVG(urlCobro, { color: '#0E1E16', margen: 1 });
  $('#cobro-valor').textContent = N.pesos(valor);

  // Sticker de muestra (móvil 023).
  $('#qr-sticker').innerHTML = N.qrSVG(N.urlDescarga({ movil: '023' }), { color: '#0E1E16', margen: 1 });

  // Los colores de las billeteras salen del núcleo.
  const lista = $('#billeteras');
  if (N.BILLETERAS?.length) {
    lista.innerHTML = N.BILLETERAS.map((b) => `<li><i style="--c:${b.color}"></i>${N.escaparHTML(b.nombre)}</li>`).join('');
  }
}

/* ---------------- Tarifas y cotizador ---------------- */

// Con espacios que no parten: «6:00 a. m.» nunca queda con la «m.» sola en otro renglón.
function horasTexto(h) {
  if (h === 0) return '12:00\u00a0a.\u00a0m.';
  if (h === 12) return '12:00\u00a0p.\u00a0m.';
  return h < 12 ? `${h}:00\u00a0a.\u00a0m.` : `${h - 12}:00\u00a0p.\u00a0m.`;
}

function tarifas() {
  const T = N.TARIFAS || {};
  const urbanas = $('#urbanas');
  // Si la ficha no trae todas las tarifas, se deja lo que puso la plantilla (sin «NaN»).
  const completas = ['minimaUrbana', 'banderazo', 'porKm', 'recargoNocturno', 'recargoDominical', 'nocheDesde', 'nocheHasta']
    .every((k) => Number.isFinite(T[k]));
  if (completas) urbanas.innerHTML = `
    <div class="urbana"><span>Carrera mínima</span><b>${N.pesos(T.minimaUrbana)}</b><small>Dentro del casco urbano</small></div>
    <div class="urbana"><span>Por recorrido</span><b>${N.pesos(T.banderazo)}</b><small>de arranque + ${N.pesos(T.porKm)} por km</small></div>
    ${T.recargoNocturno > 0 ? `<div class="urbana"><span>Recargo nocturno</span><b>+${N.pesos(T.recargoNocturno)}</b><small>De ${horasTexto(T.nocheDesde)} a ${horasTexto(T.nocheHasta)}</small></div>` : ''}
    ${T.recargoDominical > 0 ? `<div class="urbana"><span>Domingos y festivos</span><b>+${N.pesos(T.recargoDominical)}</b><small>Todo el día</small></div>` : ''}`;

  const rutas = [...N.RUTAS].sort((a, b) => a.valor - b.valor || a.km - b.km);
  // Sin rutas con tarifa fija en la ficha: no se muestra una tabla vacía.
  if (!rutas.length) $('.tabla-caja')?.setAttribute('hidden', '');
  $('#tabla-rutas').innerHTML = rutas.map((r) => `
    <tr>
      <td><span class="destino"><svg class="icono"><use href="#i-pin"/></svg>${N.escaparHTML(r.destino)}</span></td>
      <td class="col-km">${r.km} km</td>
      <td>${N.minutosTexto(r.min)}</td>
      <td><b>${N.pesos(r.valor)}</b></td>
    </tr>`).join('');

  // Cotizador: usa el mismo cálculo de la app (núcleo).
  const select = $('#cotizar-destino');
  const programado = $('#cotizar-programado');
  const salida = $('#cotizacion');
  const lugares = new Map(N.LUGARES.map((l) => [l.id, l]));
  select.innerHTML = `<option value="urbano">Dentro de ${N.escaparHTML(E.pueblo)} (carrera mínima)</option>` +
    rutas.map((r) => `<option value="${r.id}">${N.escaparHTML(r.destino)}</option>`).join('');
  select.value = rutas.find((r) => r.id === 'aeropuerto') ? 'aeropuerto' : rutas[0]?.id || 'urbano';

  const calcular = () => {
    const origen = N.LUGARES.find((l) => l.id === 'parque') || N.CENTRO;
    const destino = select.value === 'urbano' ? (lugares.get('alcaldia') || origen) : lugares.get(select.value);
    if (!destino) return;
    const t = N.calcularTarifa({ origen, destino, programado: programado.checked, km: select.value === 'urbano' ? 0.5 : undefined });
    if (!Number.isFinite(t.total)) {
      salida.textContent = `La ${N.TIPO_EMPRESA || 'cooperativa'} está confirmando sus tarifas. Muy pronto podrás calcular tu viaje aquí.`;
      return;
    }
    salida.innerHTML = `
      <div class="cotizacion-total"><span>Total estimado</span><b>${N.pesos(t.total)}</b></div>
      <ul>${t.detalle.map((d) => `<li class="${d.valor < 0 ? 'menos' : ''}"><span>${N.escaparHTML(d.concepto)}</span><span>${d.valor < 0 ? '−' + N.pesos(-d.valor) : N.pesos(d.valor)}</span></li>`).join('')}</ul>`;
  };
  // Ejemplo de la oferta del 10 %: viaje al aeropuerto un lunes a las 10:00 a. m.
  const aeropuerto = lugares.get('aeropuerto');
  const ejemplo = $('#ejemplo-programado');
  if (aeropuerto && ejemplo) {
    const origen = N.LUGARES.find((l) => l.id === 'parque') || N.CENTRO;
    const fecha = new Date('2026-10-05T10:00:00-05:00');
    const normal = N.calcularTarifa({ origen, destino: aeropuerto, fecha });
    const con = N.calcularTarifa({ origen, destino: aeropuerto, fecha, programado: true });
    if (con.total < normal.total) {
      ejemplo.innerHTML = `<span>Ejemplo: ${N.escaparHTML(E.pueblo)} → Aeropuerto</span><s>${N.pesos(normal.total)}</s><b>${N.pesos(con.total)}</b>`;
      ejemplo.hidden = false;
    }
  }

  select.addEventListener('change', calcular);
  programado.addEventListener('change', calcular);
  calcular();
}

/* ---------------- Mapa de la oficina ---------------- */

function mapaOficina() {
  const caja = $('#mapa-oficina');
  if (!caja) return;
  // La plantilla pone la ubicación (EMPRESA.oficina, el lugar «oficina» o el centro del pueblo).
  const d = caja.dataset;
  const oficina = Number(d.lat) && Number(d.lng) ? { lat: Number(d.lat), lng: Number(d.lng) } : (E.oficina || N.LUGARES.find((l) => l.id === 'oficina') || N.CENTRO);
  const titulo = d.titulo || `Oficina ${E.nombre}`;
  const direccion = d.direccion || '';
  let creado = false;
  const crear = async () => {
    if (creado) return;
    creado = true;
    try {
      // Capa 'osm': las teselas de CARTO ('claro', 'suave', 'oscuro') ahora piden llave de API.
      const m = await N.crearMapa(caja, { capa: 'claro', centro: oficina, zoom: 16, controles: true });
      $('.mapa-respaldo', caja)?.remove();
      const { L, mapa } = m;
      mapa.scrollWheelZoom.disable();
      if (matchMedia('(pointer: coarse)').matches) mapa.dragging.disable();
      L.marker([oficina.lat, oficina.lng], {
        icon: L.divIcon({ className: 'ct-marcador', html: `<div class="pin-oficina"><img src="${ICONO}" alt=""></div>`, iconSize: [52, 52], iconAnchor: [26, 56] }),
        title: titulo,
      }).addTo(mapa).bindPopup(`<b>${N.escaparHTML(titulo)}</b>${direccion ? `<br>${N.escaparHTML(direccion)}` : ''}`);
      setTimeout(() => m.refrescar(), 300);
    } catch (e) {
      console.warn('[web] mapa:', e.message);
    }
  };
  if (!('IntersectionObserver' in window)) return crear();
  const observador = new IntersectionObserver((entradas) => {
    if (entradas.some((e) => e.isIntersecting)) {
      observador.disconnect();
      crear();
    }
  }, { rootMargin: '300px 0px' });
  observador.observe(caja);
}

/* ---------------- Formulario «Programa tu servicio» ---------------- */

function aFechaLocal(fecha) {
  const d = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function formulario() {
  const form = $('#formulario');
  // Sin WhatsApp de la central, la plantilla muestra otra tarjeta (programar desde la app).
  if (!form) return;
  const whatsapp = form.dataset.whatsapp || E.whatsapp;
  const fecha = $('#f-fecha');
  const pista = $('#f-pista');
  const enviado = $('#f-enviado');
  const ahora = new Date();
  fecha.min = aFechaLocal(new Date(ahora.getTime() + 15 * 60000));
  // Por defecto: mañana a esta hora (así aplica el descuento del 10 %); si eso cae
  // de noche, a las 8:00 a. m. siguientes (sigue siendo con más de 24 horas).
  const manana = new Date(ahora.getTime() + 24.5 * 3600 * 1000);
  manana.setMinutes(Math.ceil(manana.getMinutes() / 15) * 15, 0, 0);
  if (manana.getHours() >= 21 || manana.getHours() < 6) {
    if (manana.getHours() >= 21) manana.setDate(manana.getDate() + 1);
    manana.setHours(8, 0, 0, 0);
  }
  fecha.value = aFechaLocal(manana);

  const textoPista = (html, descuento) => {
    pista.classList.toggle('descuento', descuento);
    pista.querySelector('span').innerHTML = html;
  };
  const revisarDescuento = () => {
    const f = fecha.value ? new Date(fecha.value) : null;
    if (f && !Number.isNaN(f.getTime()) && N.aplicaDescuentoProgramado(f)) textoPista(`<b>¡Aplica el ${DESCUENTO} % de descuento!</b> Lo programas con más de ${HORAS} horas de anticipación.`, true);
    else textoPista(`Programa con ${HORAS} horas de anticipación y recibe ${DESCUENTO} % de descuento.`, false);
  };
  fecha.addEventListener('input', revisarDescuento);
  revisarDescuento();

  const marcar = (campo, mensaje) => {
    campo.setAttribute('aria-invalid', mensaje ? 'true' : 'false');
    let error = campo.parentElement.querySelector('.error');
    if (mensaje) {
      if (!error) {
        error = document.createElement('span');
        error.className = 'error';
        error.id = `${campo.id}-error`;
        campo.parentElement.appendChild(error);
        campo.setAttribute('aria-describedby', error.id);
      }
      error.textContent = mensaje;
    } else if (error) {
      error.remove();
      campo.removeAttribute('aria-describedby');
    }
  };

  form.addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid') === 'true') marcar(e.target, ''); });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = Object.fromEntries(new FormData(form));
    const digitos = String(datos.telefono || '').replace(/\D/g, '');
    const errores = [
      ['f-nombre', !String(datos.nombre || '').trim() ? 'Escribe tu nombre.' : ''],
      ['f-telefono', digitos.length < 7 || digitos.length > 12 ? 'Escribe un teléfono válido (10 dígitos).' : ''],
      ['f-origen', !String(datos.origen || '').trim() ? '¿Dónde te recogemos?' : ''],
      ['f-destino', !String(datos.destino || '').trim() ? '¿A dónde vas?' : ''],
      ['f-fecha', !datos.fecha ? 'Elige la fecha y la hora.' : ''],
    ];
    let primero = null;
    for (const [id, mensaje] of errores) {
      const campo = document.getElementById(id);
      marcar(campo, mensaje);
      if (mensaje && !primero) primero = campo;
    }
    if (primero) {
      primero.focus();
      return;
    }
    const cuando = new Date(datos.fecha);
    const descuento = N.aplicaDescuentoProgramado(cuando);
    const lineas = [
      `Hola, ${E.nombre}. Quiero programar un servicio:`,
      `• Nombre: ${datos.nombre.trim()}`,
      `• Teléfono: ${datos.telefono.trim()}`,
      `• Servicio: ${datos.servicio}`,
      `• Origen: ${datos.origen.trim()}`,
      `• Destino: ${datos.destino.trim()}`,
      `• Fecha y hora: ${N.fechaTexto(cuando)}, ${N.horaTexto(cuando)}`,
    ];
    if (descuento) lineas.push('', `Lo estoy programando con ${HORAS} horas de anticipación (${DESCUENTO} % de descuento).`);
    const url = N.enlaceWhatsApp(whatsapp, lineas.join('\n'));
    const ventana = window.open(url, '_blank');
    if (ventana) ventana.opener = null;
    enviado.hidden = false;
    enviado.innerHTML = ventana
      ? '¡Listo! Te abrimos WhatsApp con tu mensaje. Solo falta tocar «Enviar».'
      : `Toca aquí para abrir WhatsApp con tu mensaje: <a href="${url}" target="_blank" rel="noopener">enviar a la central</a>.`;
  });
}

/* ---------------- Costos: calculadora de los dos planes ---------------- */

const PLAN_A_COMISION = 0.019; // 1,9 % de cada viaje pedido por la app
const PLAN_B_DIA = 900; // por taxi al día (≈ $27.000 al mes)

function calculadoraCostos() {
  const form = $('#calculadora');
  if (!form) return;
  const campo = (id, min, max) => {
    const n = Math.round(Number($(id).value));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  };
  const porcentaje = (x) => `${(Math.round(x * 10) / 10).toString().replace('.', ',')} %`;
  const actualizar = () => {
    // Con un campo vacío no se calcula con el mínimo: se muestra «—» hasta que lo llenen.
    if (['#calc-taxis', '#calc-viajes', '#calc-valor', '#calc-app', '#calc-cuota'].some((id) => $(id) && $(id).value.trim() === '')) {
      for (const id of ['#calc-a', '#calc-b']) {
        $(id).querySelector('b').textContent = '—';
        $(id).querySelector('small').textContent = 'Completa los datos';
        $(id).classList.remove('mas-barato');
      }
      $('#calc-flota').textContent = 'Completa los datos para calcular.';
      $('#calc-veredicto').textContent = '';
      return;
    }
    const taxis = campo('#calc-taxis', 1, 2000);
    const viajes = campo('#calc-viajes', 1, 60);
    const valor = campo('#calc-valor', 1000, 500000);
    const app = campo('#calc-app', 0, 100) / 100;
    const porDia = $('#calc-unidad').value === 'dia';
    const cuota = campo('#calc-cuota', 100, 200000);
    const cuotaMes = porDia ? cuota * 30 : cuota;
    const viajesMes = taxis * viajes * 30;
    const flota = viajesMes * valor;
    const planA = flota * app * PLAN_A_COMISION;
    const planB = taxis * cuotaMes;
    $('#calc-b-titulo').textContent = `Plan B · ${N.pesos(cuota)} ${porDia ? 'al día' : 'al mes'} por taxi`;
    $('#calc-app-texto').textContent = porcentaje(app * 100);
    $('#calc-flota').innerHTML = `La flota hace unos ${viajesMes.toLocaleString('es-CO')} viajes al mes (${N.pesos(flota)}). Por la app: ${Math.round(viajesMes * app).toLocaleString('es-CO')} viajes, que suman <b>${N.pesos(flota * app)}</b>.`;
    const a = $('#calc-a');
    const b = $('#calc-b');
    a.querySelector('b').textContent = `${N.pesos(planA)} al mes`;
    a.querySelector('small').textContent = `1,9 % de ${N.pesos(flota * app)} facturados por la app`;
    b.querySelector('b').textContent = `${N.pesos(planB)} al mes`;
    b.querySelector('small').textContent = porDia ? `${N.pesos(cuotaMes)} al mes por taxi` : `${N.pesos(cuotaMes / 30)} por taxi al día`;
    a.classList.toggle('mas-barato', planA < planB);
    b.classList.toggle('mas-barato', planB < planA);
    // Punto en el que los dos planes cuestan lo mismo.
    const equilibrio = (planB / (flota * PLAN_A_COMISION)) * 100;
    const v = $('#calc-veredicto');
    if (equilibrio > 100) {
      v.innerHTML = 'Con estos números, el <b>Plan A</b> siempre sale más barato.';
    } else {
      v.innerHTML = `Los dos planes cuestan lo mismo cuando <b>${porcentaje(equilibrio)}</b> de los viajes llegan por la app. Por debajo conviene el <b>Plan A</b>; por encima, el <b>Plan B</b>.`;
    }
  };
  // Al cambiar la unidad se propone un valor razonable ($900 al día ↔ $27.000 al mes).
  $('#calc-unidad').addEventListener('change', () => {
    const c = $('#calc-cuota');
    const v = Number(c.value) || 0;
    c.value = $('#calc-unidad').value === 'dia' ? Math.round(v / 30 / 50) * 50 || PLAN_B_DIA : v * 30 || PLAN_B_DIA * 30;
    c.step = $('#calc-unidad').value === 'dia' ? '50' : '1000';
    actualizar();
  });
  form.addEventListener('input', actualizar);
  form.addEventListener('change', actualizar);
  actualizar();
}

/* ---------------- Arranque ---------------- */

intentar('franja', franjaPropuesta);
intentar('barra', barraSuperior);
intentar('revelar', revelarAlVer);
intentar('contadores', contadores);
intentar('qr', codigosQR);
intentar('tarifas', tarifas);
intentar('mapa', mapaOficina);
intentar('formulario', formulario);
intentar('costos', calculadoraCostos);
intentar('año', () => { $('#anio').textContent = String(new Date().getFullYear()); });
