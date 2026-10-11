// «¿Qué hacer?» del pasajero — diseño A, solo modo real (ni las demos ni el modo revisor lo muestran).
// Sitios turísticos cerca (o del municipio de la cooperativa) y planes de un día publicados por interOS
// (nucleo/que-hacer.js). Cada sitio: foto con su crédito SIEMPRE a la vista, resumen, distancia y el valor
// aproximado del taxi con el tarifador de la cooperativa; la ficha trae descripción, horario, entrada, el crédito
// con sus enlaces y «Llévame», que abre «Confirma tu viaje» con ese destino (zona y reglas de siempre).
// Lo que llega del servidor se pinta SOLO con textContent (S30): aquí no hay HTML armado con esos datos.
import { el, icono, abrirPanel } from './ui.js';
import * as EM from './empresa.js';

// Íconos por categoría (los trazos de ui.js).
const ICONO_QH = {
  historia: 'edificio', religioso: 'edificio', parque: 'hoja', naturaleza: 'hoja', museo: 'edificio',
  mirador: 'mira', cultura: 'personas', gastronomia: 'cubiertos', otro: 'pin',
};
const FACTOR_RUTA = 1.35; // la línea recta se queda corta: el mismo factor de geo.js sin OSRM

// Nodo con atributos y texto (o hijos). Nunca innerHTML con datos.
function h(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'clase') n.className = v;
    else if (k === 'texto') n.textContent = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const x of hijos.flat()) if (x !== null && x !== undefined && x !== false) n.append(x);
  return n;
}
// Ícono fijo (trazo propio, sin datos del servidor).
const ico = (nombre, tam = 18) => el(icono(nombre, { tam }));

// Valor aproximado del taxi (línea recta × 1,35) con el tarifador de la cooperativa. null si no se puede.
export function valorTaxi(N, desde, sitio, km = null) {
  if (!desde || !Number.isFinite(desde.lat)) return null;
  try {
    const t = N.calcularTarifa({
      origen: desde, destino: { lat: sitio.lat, lng: sitio.lng, titulo: sitio.nombre },
      km: km ?? N.distanciaKm(desde, sitio) * FACTOR_RUTA, fecha: new Date(), programado: false, viajesPrevios: 0,
    });
    return Number.isFinite(t?.total) && t.total > 0 ? t.total : null;
  } catch {
    return null;
  }
}

// «Vereda Cruz Verde, finca San Benito, El Rosal»: el municipio solo si la dirección no lo trae ya (en el piloto, 51 de
// las 59 direcciones lo traen: sin esto saldría «…, El Rosal, El Rosal»).
const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export function lugarDe(s) {
  if (!s.direccion) return s.municipio || '';
  if (!s.municipio || sinTildes(s.direccion).includes(sinTildes(s.municipio))) return s.direccion;
  return `${s.direccion}, ${s.municipio}`;
}

export const destinoDe = (s) => ({ titulo: s.nombre, detalle: lugarDe(s), lat: s.lat, lng: s.lng, queHacer: s.id });

// Foto con su crédito encima (en la lista) o debajo con los enlaces (en la ficha).
function figura(N, s, f, { ficha = false } = {}) {
  const fig = h('figure', { clase: ficha ? 'a-qh-foto a-qh-foto-ficha' : 'a-qh-foto' });
  if (f) {
    const img = h('img', { alt: s.nombre, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    if (f.ancho && f.alto) Object.assign(img, { width: f.ancho, height: f.alto });
    img.addEventListener('error', () => {
      img.replaceWith(h('span', { clase: 'a-qh-sin-foto', 'aria-hidden': 'true' }, ico(ICONO_QH[s.categoria] || 'pin', 34)));
    }, { once: true });
    img.src = f.url; // ya validada: mismo origen y bajo /api/que-hacer/
    fig.append(img);
    const cap = h('figcaption', { clase: 'a-qh-credito', 'data-credito': '' }, h('span', { texto: N.queHacer.textoCredito(f) }));
    if (ficha) {
      if (f.pagina) cap.append(' ', h('a', { href: f.pagina, target: '_blank', rel: 'noopener noreferrer', 'data-credito-pagina': '', texto: 'Ver la foto' }));
      if (f.licenciaUrl) cap.append(' ', h('a', { href: f.licenciaUrl, target: '_blank', rel: 'noopener noreferrer license', 'data-credito-licencia': '', texto: f.licencia ? `Licencia ${f.licencia}` : 'Licencia' }));
    }
    fig.append(cap);
  } else {
    fig.classList.add('a-qh-foto-vacia');
    fig.append(h('span', { clase: 'a-qh-sin-foto', 'aria-hidden': 'true' }, ico(ICONO_QH[s.categoria] || 'pin', 34)));
  }
  return fig;
}

/**
 * Abre «¿Qué hacer?».
 *  N, app: los de siempre. cliente: N.queHacer.crearQueHacer(...). ctx: () => ctx() del pasajero (puedePedir, pedirA).
 *  desde(): el punto de recogida (para la distancia y el taxi). gps(): la posición del GPS de verdad o null.
 */
export function abrirQueHacer({ N, app, cliente, ctx, desde, gps }) {
  const municipio = EM.PUEBLO;
  let idMunicipio = null; // el id en la API (GET /api/que-hacer/municipios), una vez
  const conGps = Boolean(gps());
  const estado = { alcance: conGps ? 'cerca' : 'municipio', pestana: 'sitios', datos: null, aviso: '' };

  return abrirPanel(app, {
    titulo: '¿Qué hacer?',
    clase: 'a-panel-qh',
    construir(cuerpo, cerrarLista) {
      const intro = h('p', { clase: 'a-ayuda-txt a-qh-intro', 'data-qh-intro': '' });
      const alcance = h('button', { type: 'button', clase: 'a-btn-texto a-qh-alcance', 'data-qh-alcance': '' });
      const pestanas = h('div', { clase: 'a-cats a-qh-pestanas', role: 'tablist', 'aria-label': 'Sitios o planes' },
        h('button', { type: 'button', role: 'tab', clase: 'a-cat', 'data-pestana': 'sitios', 'aria-selected': 'true' }, ico('pin', 16), h('span', { texto: 'Sitios' })),
        h('button', { type: 'button', role: 'tab', clase: 'a-cat', 'data-pestana': 'planes', 'aria-selected': 'false' }, ico('ruta', 16), h('span', { texto: 'Planes de un día' })));
      const lista = h('div', { clase: 'a-qh-lista', 'data-qh-lista': '', 'aria-live': 'polite' });
      const pie = h('p', { clase: 'a-ayuda-txt a-qh-pie', texto: `Sitios revisados por interOS. Confirma horarios y entrada antes de ir. El valor del taxi es aproximado, con las tarifas de ${EM.NOMBRE}; el valor final lo confirma el conductor.` });
      cuerpo.append(h('div', { clase: 'a-qh-cabeza' }, intro, conGps ? alcance : null), pestanas, lista, pie);

      const llevar = (s, cerrarFicha) => {
        const c = ctx();
        if (!c.puedePedir || !c.pedirA) return;
        cerrarFicha?.();
        cerrarLista();
        setTimeout(() => c.pedirA(destinoDe(s)), 250);
      };

      function pintarCabeza() {
        intro.textContent = estado.aviso || (estado.alcance === 'cerca' ? 'Sitios para visitar cerca de ti.' : `Sitios para visitar en ${municipio} y sus alrededores.`);
        alcance.textContent = estado.alcance === 'cerca' ? `Ver los de ${municipio}` : 'Ver los cercanos';
        for (const b of pestanas.querySelectorAll('[data-pestana]')) b.setAttribute('aria-selected', String(b.dataset.pestana === estado.pestana));
      }

      function cargando() {
        lista.replaceChildren(...[0, 1, 2].map(() => h('div', { clase: 'a-esqueleto a-qh-esqueleto' })));
      }

      function vacio(texto, reintentar = false) {
        const caja = h('div', { clase: 'a-qh-vacio', 'data-qh-vacio': '' }, ico('mapa', 30), h('p', { texto }));
        if (reintentar) {
          const b = h('button', { type: 'button', clase: 'a-btn a-btn-suave', 'data-qh-reintentar': '', texto: 'Intentar de nuevo' });
          b.addEventListener('click', () => cargar());
          caja.append(b);
        }
        lista.replaceChildren(caja);
      }

      function tarjetaSitio(s, origen) {
        const valor = valorTaxi(N, origen, s);
        const km = origen ? N.distanciaKm(origen, s) : null;
        const datos = [km !== null ? `a ${N.kmTexto(km)}` : '', valor ? `Taxi ≈ ${N.pesos(valor)}` : ''].filter(Boolean);
        const b = h('button', { type: 'button', clase: 'a-qh-sitio', 'data-sitio': s.id },
          figura(N, s, s.fotos[0]),
          h('span', { clase: 'a-qh-sitio-txt' },
            h('small', { clase: 'a-qh-cat', texto: [N.queHacer.CATEGORIAS_QH[s.categoria], s.municipio].filter(Boolean).join(' · ') }),
            h('strong', { texto: s.nombre }),
            s.resumen ? h('span', { clase: 'a-qh-resumen', texto: s.resumen }) : null,
            datos.length ? h('span', { clase: 'a-qh-datos', 'data-qh-datos': '', texto: datos.join(' · ') }) : null));
        b.addEventListener('click', () => abrirFicha(s));
        return b;
      }

      function tarjetaPlan(pl, origen) {
        const tarjeta = h('article', { clase: 'a-qh-plan', 'data-plan': pl.id },
          h('small', { clase: 'a-qh-cat', texto: [pl.duracion, pl.municipios.join(' y ')].filter(Boolean).join(' · ') }),
          h('h3', { texto: pl.titulo }),
          pl.resumen ? h('p', { texto: pl.resumen }) : null);
        const ol = h('ol', { clase: 'a-qh-paradas' });
        pl.paradas.forEach((s) => {
          const b = h('button', { type: 'button', clase: 'a-qh-parada', 'data-parada': s.id }, h('span', { texto: s.nombre }), ico('adelante', 16));
          b.addEventListener('click', () => abrirFicha(s));
          ol.append(h('li', {}, b));
        });
        tarjeta.append(ol);
        if (pl.recomendaciones) tarjeta.append(h('p', { clase: 'a-qh-reco', texto: pl.recomendaciones }));
        const primera = pl.paradas[0];
        const valor = valorTaxi(N, origen, primera);
        const ir = h('button', { type: 'button', clase: 'a-btn a-btn-tinta a-btn-bloque', 'data-plan-llevame': '' },
          ico('navegar', 18), h('span', { texto: `Empezar: llévame a ${primera.nombre}${valor ? ` (≈ ${N.pesos(valor)})` : ''}` }));
        ir.disabled = !ctx().puedePedir;
        ir.addEventListener('click', () => llevar(primera));
        tarjeta.append(ir);
        return tarjeta;
      }

      function pintarLista() {
        pintarCabeza();
        const d = estado.datos;
        if (!d) return;
        const origen = desde();
        if (estado.pestana === 'planes') {
          if (!d.planes.length) return vacio('Todavía no hay planes publicados aquí. Mira los sitios mientras tanto.');
          lista.replaceChildren(...d.planes.map((pl) => tarjetaPlan(pl, origen)));
          return;
        }
        if (!d.sitios.length) return vacio(`Todavía no hay sitios publicados ${estado.alcance === 'cerca' ? 'cerca de ti' : `en ${municipio}`}.`);
        const orden = N.queHacer.ordenarPorDistancia(d.sitios, origen);
        lista.replaceChildren(...orden.map((s) => tarjetaSitio(s, origen)));
      }

      async function cargar({ caer = true } = {}) {
        cargando();
        pintarCabeza();
        try {
          if (estado.alcance === 'municipio' && !idMunicipio) idMunicipio = await cliente.municipio(municipio, N.CENTRO);
          const q = estado.alcance === 'cerca' ? { cerca: gps() || desde() } : { municipio: idMunicipio };
          let d = await cliente.cargar(q);
          // Nada cerca: los del municipio de la cooperativa (una vez).
          if (caer && estado.alcance === 'cerca' && !d.sitios.length && !d.planes.length) {
            estado.alcance = 'municipio';
            idMunicipio ||= await cliente.municipio(municipio, N.CENTRO);
            d = await cliente.cargar({ municipio: idMunicipio });
            estado.aviso = d.sitios.length ? `No hay sitios publicados cerca de ti. Estos son los de ${municipio}.` : '';
          }
          estado.datos = d;
          pintarLista();
        } catch (e) {
          estado.datos = null;
          vacio(e?.motivo === 'sin_red' ? 'Sin conexión. Revisa tus datos o el wifi.' : 'No pudimos traer los sitios ahora.', true);
        }
      }

      function abrirFicha(s) {
        abrirPanel(app, {
          titulo: s.nombre,
          clase: 'a-panel-qh a-panel-qh-ficha',
          construir(c, cerrarFicha) {
            const fotos = h('div', { clase: 'a-qh-fotos', 'data-qh-fotos': '' }, ...(s.fotos.length ? s.fotos.map((f) => figura(N, s, f, { ficha: true })) : [figura(N, s, null, { ficha: true })]));
            const filas = h('dl', { clase: 'a-qh-filas' });
            const fila = (icono_, titulo, texto, attr) => filas.append(h('div', { clase: 'a-qh-fila', [attr]: '' }, ico(icono_, 18), h('dt', { texto: titulo }), h('dd', { texto })));
            fila('reloj', 'Horario', s.horario || 'Consulta el horario antes de ir.', 'data-qh-horario');
            fila('etiqueta', 'Entrada', N.queHacer.textoEntrada(s, N.pesos), 'data-qh-entrada');
            if (s.direccion) fila('pin', 'Dónde queda', lugarDe(s), 'data-qh-direccion');
            if (s.aproximado) fila('info', 'Punto aproximado', 'Confirma la entrada con el conductor.', 'data-qh-aproximado');
            const origen = desde();
            const valor = valorTaxi(N, origen, s);
            const taxi = h('p', { clase: 'a-qh-taxi', 'data-qh-taxi': '' });
            const pintarTaxi = (v, km) => {
              taxi.replaceChildren(ico('auto', 18), h('span', { texto: v ? `Taxi desde tu punto: ≈ ${N.pesos(v)}${km ? ` · ${N.kmTexto(km)}` : ''}` : 'Pide el taxi y el conductor te confirma el valor.' }));
            };
            pintarTaxi(valor, origen ? N.distanciaKm(origen, s) * FACTOR_RUTA : null);
            // Con la ruta de verdad (si responde), el valor se afina.
            if (origen) {
              N.calcularRuta(origen, s).then((r) => {
                if (r && !r.aproximada && taxi.isConnected) pintarTaxi(valorTaxi(N, origen, s, r.km), r.km);
              }).catch(() => {});
            }
            const llevame = h('button', { type: 'button', clase: 'a-btn a-btn-primario a-btn-grande', 'data-llevame': '' }, ico('navegar', 20), h('span', { texto: 'Llévame' }));
            const puede = ctx().puedePedir;
            llevame.disabled = !puede;
            llevame.addEventListener('click', () => llevar(s, cerrarFicha));
            c.append(...[
              fotos,
              h('small', { clase: 'a-qh-cat', texto: [N.queHacer.CATEGORIAS_QH[s.categoria], s.municipio].filter(Boolean).join(' · ') }),
              s.descripcion ? h('p', { clase: 'a-qh-desc', 'data-qh-desc': '', texto: s.descripcion }) : null,
              filas,
              s.recomendaciones ? h('div', { clase: 'a-qh-reco' }, h('strong', { texto: 'Recomendaciones' }), h('p', { texto: s.recomendaciones })) : null,
              s.fuentes.length ? h('div', { clase: 'a-qh-fuentes', 'data-qh-fuentes': '' }, h('strong', { texto: 'Fuentes' }),
                h('ul', {}, s.fuentes.map((x) => h('li', {}, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer', texto: x.titulo }) : h('span', { texto: x.titulo }))))) : null,
              taxi,
              llevame,
              puede ? null : h('p', { clase: 'a-ayuda-txt', texto: 'Termina o cancela tu viaje en curso para pedir otro.' }),
            ].filter(Boolean)); // append() pintaría «null» como texto
          },
        });
      }

      pestanas.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pestana]');
        if (!b || b.dataset.pestana === estado.pestana) return;
        estado.pestana = b.dataset.pestana;
        pintarLista();
      });
      alcance.addEventListener('click', () => {
        estado.alcance = estado.alcance === 'cerca' ? 'municipio' : 'cerca';
        estado.aviso = '';
        cargar({ caer: false });
      });
      cargar();
    },
  });
}

// ¿Hay algo para mostrar? (para el botón del inicio). Con un servidor anterior o sin nada publicado, false.
export async function hayQueHacer({ N, cliente, gps, municipio = EM.PUEBLO }) {
  try {
    const cerca = gps();
    const d = cerca ? await cliente.cargar({ cerca }) : { sitios: [], planes: [] };
    if (d.sitios.length || d.planes.length) return true;
    const m = await cliente.cargar({ municipio: await cliente.municipio(municipio, N.CENTRO) });
    return Boolean(m.sitios.length || m.planes.length);
  } catch {
    return false;
  }
}

