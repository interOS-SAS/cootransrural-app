// Ronda 4A «Operación de la central» en el diseño A (modo real; el contrato está en la cabecera de nucleo/central.js):
//  - seguirSos(app, { N, envio, empresa, avisos }): después de tocar «Avisar a la central», «Avisando a la central…» y lo
//    que pasa luego (enviado; sin señal, reintentando hasta 2 minutos; no se pudo; «Ya le avisaste…»), siempre con
//    «Llamar a la Línea 123». Si se cierra antes de terminar, el resultado sale como aviso en pantalla.
//  - montarAvisosCentral(app, { N, bandeja, ocupado, alCambiar }): la tarjeta «Aviso de {cooperativa}» de cada aviso
//    nuevo de la cooperativa (llegó por el bus, estaba sin leer al abrir la app o se tocó su notificación), de a una y
//    sin tapar otro diálogo ni una oferta; «Entendido» lo marca leído.
//  - seccionBandeja(N, bandeja): la sección «De tu cooperativa» del panel «Avisos» (lo que se ve ahí queda leído).
// Todo lo que manda la central (título, texto y remitente de un aviso) se pinta con textContent, nunca como HTML.
import { el, icono, modal } from './ui.js';
import * as EM from './empresa.js';

/* ---------------- «Avisar a la central» (SOS) ---------------- */

const EN_CURSO = new Set(['enviando', 'reintentando']);

export function seguirSos(app, { N, envio, empresa = EM.NOMBRE, avisos = null }) {
  const t = N.textosCentral.sos({ empresa });
  // La central dejó de ofrecerlo justo antes del toque (una bienvenida nueva sin la bandera): se dice, con la 123.
  if (!envio) {
    avisos?.mostrar({ ...t.noDisponible, tipo: 'alerta' });
    return Promise.resolve(null);
  }
  const textos = { enviando: t.enviando, reintentando: t.sinSenal, enviado: t.enviado, demasiados: t.demasiados, no_disponible: t.noDisponible, fallo: t.fallo };
  const textoDe = (estado) => textos[estado] || t.error;
  const cuerpo = document.createElement('div');
  cuerpo.className = 'a-sos-central';
  cuerpo.dataset.sosCentral = '';
  const linea = document.createElement('p');
  linea.className = 'a-sos-central-estado';
  linea.setAttribute('role', 'status');
  linea.setAttribute('aria-live', 'polite');
  const giro = el('<span class="a-girador" aria-hidden="true"></span>');
  const txt = document.createElement('span');
  txt.dataset.sosTexto = '';
  linea.append(giro, txt);
  cuerpo.append(linea);
  let titulo = null;
  let caja = null;
  let abierto = true;
  const pintar = (estado) => {
    const x = textoDe(estado);
    if (titulo) titulo.textContent = x.titulo;
    txt.textContent = x.cuerpo;
    giro.hidden = !EN_CURSO.has(estado);
    cuerpo.dataset.estado = estado;
    const listo = estado === 'enviado';
    if (caja && caja.classList.contains('a-sos-listo') !== listo) {
      caja.classList.toggle('a-sos-listo', listo);
      // El ícono: el escudo mientras se avisa (o si no se pudo) y un visto bueno cuando la central lo recibió.
      caja.querySelector('.a-sos-ico')?.replaceChildren(el(icono(listo ? 'check' : 'sos', { tam: 34, grosor: listo ? 2.6 : 2 })));
    }
  };
  const promesa = modal(app, {
    titulo: '',
    cuerpo,
    clase: 'a-modal-sos a-modal-sos-central',
    icono: `<span class="a-sos-ico">${icono('sos', { tam: 34 })}</span>`,
    acciones: [
      { texto: 'Llamar a la Línea 123', href: 'tel:123', valor: '123', clase: 'a-btn-peligro', icono: 'telefono' },
      { texto: 'Cerrar', valor: null, clase: 'a-btn-suave' },
    ],
    alAbrir(_c, _cerrar, laCaja) {
      caja = laCaja;
      titulo = laCaja.querySelector('h2');
      pintar(envio.estado);
    },
  });
  const quitar = envio.on('estado', (r) => {
    if (abierto) return pintar(r.estado);
    // Se cerró mientras intentaba: el resultado, como aviso en pantalla.
    if (EN_CURSO.has(r.estado) || r.estado === 'cancelado') return;
    const x = textoDe(r.estado);
    avisos?.mostrar({ titulo: x.titulo, cuerpo: x.cuerpo, tipo: r.estado === 'enviado' ? 'exito' : 'alerta' });
  });
  promesa.finally(() => {
    abierto = false;
    if (envio.terminado) quitar();
  });
  envio.listo.then(() => {
    if (!abierto) setTimeout(quitar, 0);
  });
  return promesa;
}

/* ---------------- avisos de la cooperativa ---------------- */

function cuandoTexto(N, en) {
  const d = new Date(en);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  return mismoDia ? `Hoy, ${N.horaTexto(en)}` : `${N.fechaTexto(en)}, ${N.horaTexto(en)}`;
}

// El cuerpo de un aviso (título, texto y la hora), con textContent.
function cuerpoAviso(N, a, { conDe = false } = {}) {
  const caja = document.createElement('div');
  caja.className = 'a-aviso-central';
  const titulo = document.createElement('strong');
  titulo.className = 'a-aviso-central-titulo';
  titulo.textContent = a.titulo;
  const texto = document.createElement('p');
  texto.className = 'a-aviso-central-texto';
  texto.textContent = a.texto;
  const pie = document.createElement('small');
  pie.className = 'a-aviso-central-pie';
  pie.textContent = conDe && a.de ? `${N.textosCentral.avisoCooperativa({ de: a.de }).titulo} · ${cuandoTexto(N, a.en)}` : cuandoTexto(N, a.en);
  caja.append(titulo, texto, pie);
  return caja;
}

function tarjeta(app, N, a) {
  const t = N.textosCentral.avisoCooperativa({ de: a.de });
  return modal(app, {
    titulo: '',
    cuerpo: cuerpoAviso(N, a),
    clase: 'a-modal-aviso-central',
    icono: `<span class="a-aviso-central-ico">${icono('campana', { tam: 30 })}</span>`,
    acciones: [{ texto: t.boton, valor: true, clase: 'a-btn-primario', icono: 'check' }],
    alAbrir(_c, _cerrar, caja) {
      caja.querySelector('h2').textContent = t.titulo;
    },
  });
}

// ocupado(): true si ahora no conviene tapar la pantalla (por ejemplo, una oferta en la hoja amarilla); se vuelve a
// intentar en un momento. alCambiar(sinLeer): para la insignia de la campana.
export function montarAvisosCentral(app, { N, bandeja, ocupado = () => false, alCambiar = () => {} }) {
  if (!bandeja) return null;
  const cola = [];
  let abierta = false;
  let reloj = null;
  const leido = (id) => Boolean(bandeja.lista.find((x) => x.id === id)?.leido);
  const intentar = () => {
    clearTimeout(reloj);
    if (abierta || !cola.length) return;
    if (ocupado() || app.querySelector('.a-modal-capa')) {
      reloj = setTimeout(intentar, 1500);
      return;
    }
    const a = cola.shift();
    // Lo leyó mientras esperaba (en la bandeja o en otro celular): no se repite, salvo que se tocara su notificación.
    if (!a.forzar && leido(a.id)) return intentar();
    abierta = true;
    tarjeta(app, N, a)
      .then((ok) => {
        if (ok === true) bandeja.leer(a.id);
      })
      .finally(() => {
        abierta = false;
        reloj = setTimeout(intentar, 400);
      });
  };
  const encolar = (a, forzar) => {
    if (cola.some((x) => x.id === a.id)) return;
    cola.push({ ...a, forzar });
    intentar();
  };
  let sonoEn = 0;
  bandeja.on('nuevo', (a) => {
    // Suena y vibra como un aviso (y, en la web con la app oculta, la notificación del navegador); varios juntos (al abrir
    // la app), una sola vez.
    if (Date.now() - sonoEn > 5000) {
      sonoEn = Date.now();
      N.avisar?.({ titulo: N.textosCentral.avisoCooperativa({ de: a.de }).titulo, cuerpo: a.titulo, tipo: 'info', etiqueta: `aviso-${a.id}` }).catch?.(() => {});
    }
    encolar(a, false);
  });
  bandeja.on('mostrar', (a) => encolar(a, true));
  bandeja.on('cambio', () => alCambiar(bandeja.sinLeer()));
  return { intentar, pendientes: () => cola.length };
}

// La sección «De tu cooperativa» del panel «Avisos» (null si no hay ninguno). Los que estaban sin leer llevan «Nuevo»
// y quedan leídos (se ven completos aquí).
export function seccionBandeja(N, bandeja) {
  const lista = bandeja?.lista || [];
  if (!lista.length) return null;
  const t = N.textosCentral.avisoCooperativa();
  const s = el('<section class="a-grupo a-bandeja-central" data-bandeja-central><h3></h3><ul class="a-lista-avisos"></ul></section>');
  s.querySelector('h3').textContent = t.bandeja;
  const ul = s.querySelector('ul');
  const nuevos = [];
  for (const a of lista) {
    const li = el(`<li class="a-aviso-item a-aviso-central-item" data-aviso-central><span class="a-aviso-punto"></span></li>`);
    if (!a.leido) {
      li.classList.add('a-aviso-nuevo');
      nuevos.push(a.id);
    }
    const cuerpo = cuerpoAviso(N, a, { conDe: true });
    if (!a.leido) {
      const chip = document.createElement('em');
      chip.className = 'a-aviso-nuevo-chip';
      chip.textContent = t.nuevo;
      cuerpo.prepend(chip);
    }
    li.append(cuerpo);
    ul.append(li);
  }
  if (nuevos.length) bandeja.leer(nuevos);
  return s;
}
