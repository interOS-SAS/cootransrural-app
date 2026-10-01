// Comportamiento de la página de inicio de Cootransrural: menú, animaciones al
// hacer scroll, códigos QR, tabla de tarifas, cotizador, mapa de la oficina y
// formulario «Programa tu servicio» (arma el mensaje de WhatsApp para la central).
import * as N from '../nucleo/index.js';

window.ctSitioListo = true;

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
      const t0 = performance.now();
      const duracion = 1300;
      const paso = (t) => {
        const avance = Math.min(1, (t - t0) / duracion);
        const suave = 1 - (1 - avance) ** 3;
        e.target.textContent = String(Math.round(meta * suave));
        if (avance < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    }
  }, { threshold: 0.6 });
  cifras.forEach((c) => observador.observe(c));
}

/* ---------------- Códigos QR ---------------- */

function codigosQR() {
  const urlDescarga = N.urlDescarga({ origen: 'web' });
  const caja = $('#qr-descarga');
  // Módulos cuadrados: el estilo redondeado no siempre lo lee jsQR (el lector de la app en iPhone).
  caja.innerHTML = N.qrSVG(urlDescarga, { nivel: 'H', color: '#0A5C33', margen: 1 }) + '<img class="qr-logo" src="img/icono-192.png" alt="" width="48" height="48">';
  const enlace = $('#qr-descarga-url');
  enlace.href = urlDescarga;
  enlace.textContent = urlDescarga.replace(/^https?:\/\//, '').replace(/\?.*$/, '');

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

function horasTexto(h) {
  if (h === 0) return '12:00 a. m.';
  if (h === 12) return '12:00 p. m.';
  return h < 12 ? `${h}:00 a. m.` : `${h - 12}:00 p. m.`;
}

function tarifas() {
  const T = N.TARIFAS;
  const urbanas = $('#urbanas');
  urbanas.innerHTML = `
    <div class="urbana"><span>Carrera mínima</span><b>${N.pesos(T.minimaUrbana)}</b><small>Dentro del casco urbano</small></div>
    <div class="urbana"><span>Por recorrido</span><b>${N.pesos(T.banderazo)}</b><small>de arranque + ${N.pesos(T.porKm)} por km</small></div>
    <div class="urbana"><span>Recargo nocturno</span><b>+${N.pesos(T.recargoNocturno)}</b><small>De ${horasTexto(T.nocheDesde)} a ${horasTexto(T.nocheHasta)}</small></div>
    <div class="urbana"><span>Domingos y festivos</span><b>+${N.pesos(T.recargoDominical)}</b><small>Todo el día</small></div>`;

  const rutas = [...N.RUTAS].sort((a, b) => a.valor - b.valor || a.km - b.km);
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
  select.innerHTML = '<option value="urbano">Dentro de El Rosal (carrera mínima)</option>' +
    rutas.map((r) => `<option value="${r.id}">${N.escaparHTML(r.destino)}</option>`).join('');
  select.value = rutas.find((r) => r.id === 'aeropuerto') ? 'aeropuerto' : rutas[0]?.id || 'urbano';

  const calcular = () => {
    const origen = N.LUGARES.find((l) => l.id === 'parque') || N.CENTRO;
    const destino = select.value === 'urbano' ? (lugares.get('alcaldia') || origen) : lugares.get(select.value);
    if (!destino) return;
    const t = N.calcularTarifa({ origen, destino, programado: programado.checked, km: select.value === 'urbano' ? 0.5 : undefined });
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
      ejemplo.innerHTML = `<span>Ejemplo: El Rosal → Aeropuerto</span><s>${N.pesos(normal.total)}</s><b>${N.pesos(con.total)}</b>`;
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
  const oficina = N.LUGARES.find((l) => l.id === 'oficina') || { lat: 4.855106, lng: -74.26222 };
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
        icon: L.divIcon({ className: 'ct-marcador', html: '<div class="pin-oficina"><img src="img/icono-192.png" alt=""></div>', iconSize: [52, 52], iconAnchor: [26, 56] }),
        title: 'Oficina Cootransrural',
      }).addTo(mapa).bindPopup('<b>Oficina Cootransrural</b><br>Carrera 8 No. 12-38, Barrio San Carlos');
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
    if (f && !Number.isNaN(f.getTime()) && N.aplicaDescuentoProgramado(f)) textoPista('<b>¡Aplica el 10 % de descuento!</b> Lo programas con más de 24 horas de anticipación.', true);
    else textoPista('Programa con 24 horas de anticipación y recibe 10 % de descuento.', false);
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
      'Hola, Cootransrural. Quiero programar un servicio:',
      `• Nombre: ${datos.nombre.trim()}`,
      `• Teléfono: ${datos.telefono.trim()}`,
      `• Servicio: ${datos.servicio}`,
      `• Origen: ${datos.origen.trim()}`,
      `• Destino: ${datos.destino.trim()}`,
      `• Fecha y hora: ${N.fechaTexto(cuando)}, ${N.horaTexto(cuando)}`,
    ];
    if (descuento) lineas.push('', 'Lo estoy programando con 24 horas de anticipación (10 % de descuento).');
    const url = N.enlaceWhatsApp(N.EMPRESA.whatsapp, lineas.join('\n'));
    const ventana = window.open(url, '_blank');
    if (ventana) ventana.opener = null;
    enviado.hidden = false;
    enviado.innerHTML = ventana
      ? '¡Listo! Te abrimos WhatsApp con tu mensaje. Solo falta tocar «Enviar».'
      : `Toca aquí para abrir WhatsApp con tu mensaje: <a href="${url}" target="_blank" rel="noopener">enviar a la central</a>.`;
  });
}

/* ---------------- Arranque ---------------- */

intentar('barra', barraSuperior);
intentar('revelar', revelarAlVer);
intentar('contadores', contadores);
intentar('qr', codigosQR);
intentar('tarifas', tarifas);
intentar('mapa', mapaOficina);
intentar('formulario', formulario);
intentar('año', () => { $('#anio').textContent = String(new Date().getFullYear()); });
