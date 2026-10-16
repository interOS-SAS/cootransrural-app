// Mapa (Leaflet + teselas de OpenStreetMap/CARTO) con los elementos de la app:
// punto de recogida, destino, ruta, taxis y selección de punto arrastrando el mapa.
import { CENTRO, CAPAS_MAPA, MAPBOX, urlDelSitio } from './config.js';

let cargaLeaflet = null;
export function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!cargaLeaflet) {
    cargaLeaflet = new Promise((resolver, rechazar) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = urlDelSitio('vendor/leaflet/leaflet.css');
      document.head.prepend(css);
      const s = document.createElement('script');
      s.src = urlDelSitio('vendor/leaflet/leaflet.js');
      s.onload = () => resolver(window.L);
      s.onerror = () => rechazar(new Error('no se pudo cargar Leaflet'));
      document.head.appendChild(s);
    });
  }
  return cargaLeaflet;
}

// Taxi visto desde arriba (apunta al norte; se rota con CSS según el rumbo).
export function svgTaxi({ color = '#FFC107', borde = '#1a1a1a', tamano = 34 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 64" width="${tamano * 0.625}" height="${tamano}" aria-hidden="true">
  <rect x="3" y="4" width="34" height="56" rx="11" fill="${color}" stroke="${borde}" stroke-width="2.4"/>
  <path d="M8 18 Q20 12 32 18 L30 26 Q20 23 10 26 Z" fill="#1d2b36" opacity=".85"/>
  <path d="M10 44 Q20 47 30 44 L32 51 Q20 55 8 51 Z" fill="#1d2b36" opacity=".8"/>
  <rect x="13" y="30" width="14" height="7" rx="2" fill="${borde}"/>
  <text x="20" y="35.6" font-size="5.2" font-family="Arial, sans-serif" font-weight="700" fill="${color}" text-anchor="middle">TAXI</text>
  <rect x="6" y="5" width="7" height="3" rx="1.5" fill="#fff9c4"/><rect x="27" y="5" width="7" height="3" rx="1.5" fill="#fff9c4"/>
  <rect x="6" y="56" width="7" height="3" rx="1.5" fill="#e53935"/><rect x="27" y="56" width="7" height="3" rx="1.5" fill="#e53935"/>
</svg>`;
}

function svgPin(color, letra) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 48" width="36" height="48" aria-hidden="true">
  <path d="M18 47C18 47 33 30 33 18A15 15 0 0 0 3 18C3 30 18 47 18 47Z" fill="${color}" stroke="#fff" stroke-width="2.5"/>
  <circle cx="18" cy="18" r="7.5" fill="#fff"/>
  ${letra ? `<text x="18" y="22" font-size="11" font-family="Arial, sans-serif" font-weight="800" fill="${color}" text-anchor="middle">${letra}</text>` : ''}
</svg>`;
}

// Para saber en el diagnóstico qué versión de este archivo corre en el teléfono.
const VERSION_MAPA = '2026-10-16';

export async function crearMapa(elemento, opciones = {}) {
  const L = await cargarLeaflet();
  const {
    capa = 'claro',
    centro = CENTRO,
    zoom = 16,
    colorOrigen = '#16a34a',
    colorDestino = '#dc2626',
    colorRuta = '#111827',
    colorTaxi = '#FFC107',
    controles = true,
  } = opciones;

  const mapa = L.map(elemento, {
    center: [centro.lat, centro.lng],
    zoom,
    zoomControl: false,
    attributionControl: true,
    keyboard: false,
    tap: true,
  });
  if (controles) L.control.zoom({ position: 'topright' }).addTo(mapa);
  mapa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

  // Los taxis se mueven suave entre posiciones (transition de 1 s en .ct-taxi-marcador); durante el zoom esa transición los
  // hacía «viajar» a su nuevo lugar en pantalla y caer después (13-oct, Oscar). Mientras dura el zoom (también el de
  // pellizco) se apaga y al terminar vuelve.
  let finZoom = null;
  mapa.on('zoomstart', () => {
    clearTimeout(finZoom);
    elemento.classList.add('ct-haciendo-zoom');
  });
  mapa.on('zoomend', () => {
    clearTimeout(finZoom);
    finZoom = setTimeout(() => elemento.classList.remove('ct-haciendo-zoom'), 80);
  });

  let teselas = null;
  let logo = null;
  let errorOculta = false; // una tesela falló con la app en segundo plano (el iPhone corta la red al suspenderla)

  // Diagnóstico (16-oct): el mapa seguía saliendo en blanco en el iPhone de Oscar tras un rato en reposo y en el
  // simulador no pasa. Se guardan los últimos sucesos del mapa; con una pulsación larga en el botón de ubicación
  // (vigilarDiagnostico) se ven en pantalla con lo que hay a la vista, para mandar la captura.
  const t0 = Date.now();
  const sucesos = [];
  let fallasTotal = 0;
  let redibujos = 0;
  let esperandoCarga = '';
  const anotar = (texto) => {
    sucesos.push(`${Math.round((Date.now() - t0) / 1000)} s · ${texto}`);
    if (sucesos.length > 30) sucesos.shift();
  };
  const redibujar = (motivo) => {
    redibujos += 1;
    esperandoCarga = motivo;
    anotar(`se piden otra vez las teselas (${motivo})`);
    teselas.redraw();
  };

  // Las teselas a la vista: cargadas, fallidas (Leaflet nunca las vuelve a pedir) y en camino.
  const enVista = () => {
    const n = { conTamano: false, cargadas: 0, fallidas: 0, pendientes: 0 };
    const caja = elemento.getBoundingClientRect();
    if (!caja.width || !caja.height) return n;
    n.conTamano = true;
    for (const img of elemento.querySelectorAll('img.leaflet-tile')) {
      const r = img.getBoundingClientRect();
      if (!(r.right > caja.left && r.left < caja.right && r.bottom > caja.top && r.top < caja.bottom)) continue;
      if (img.classList.contains('leaflet-tile-loaded')) n.cargadas += 1;
      else if (img.complete && !img.naturalWidth) n.fallidas += 1;
      else n.pendientes += 1;
    }
    return n;
  };

  // Reintentos (15-oct, Oscar: el mapa seguía en blanco «cuando está vario tiempo en reposo o segundo plano»). Después de
  // un rato largo el iPhone tarda unos segundos en devolver la red: las teselas que se piden en ese momento fallan con la
  // app YA a la vista y Leaflet no las vuelve a pedir nunca. Mientras haya teselas fallidas a la vista se piden otra vez,
  // cada vez más espaciado (1,5 s, 4 s, 10 s, 25 s y luego cada minuto, hasta 10 veces); al volver a la app o la conexión
  // (alVolver) se empieza de nuevo.
  const ESPERAS = [1500, 4000, 10000, 25000, 60000];
  const MAX_REINTENTOS = 10;
  let intento = 0;
  let relojReintento = null;
  let activo = true; // false al destruir el mapa
  const reiniciarReintentos = () => {
    clearTimeout(relojReintento);
    relojReintento = null;
    intento = 0;
    errorOculta = false;
  };
  const reintentar = () => {
    relojReintento = null;
    if (!teselas || globalThis.document?.hidden || !elemento.isConnected) return; // al volver sigue alVolver
    try {
      const v = enVista();
      if (!v.conTamano) return;
      if (v.fallidas || (!v.cargadas && !v.pendientes)) {
        intento += 1;
        redibujar(`reintento ${intento}: ${v.fallidas} fallidas, ${v.cargadas} cargadas`); // si vuelven a fallar, tileerror programa el siguiente
      } else if (v.pendientes) {
        intento += 1;
        reintentarLuego();
      }
    } catch (e) {
      console.warn('[mapa] al reintentar:', e?.message || e);
    }
  };
  const reintentarLuego = () => {
    if (!activo || relojReintento || intento >= MAX_REINTENTOS || globalThis.document?.hidden) return;
    relojReintento = setTimeout(reintentar, ESPERAS[Math.min(intento, ESPERAS.length - 1)]);
  };
  const vigilar = (capa) => {
    capa.on('tileerror', () => {
      if (capa !== teselas) return;
      fallasTotal += 1;
      if (globalThis.document?.hidden) {
        if (!errorOculta) anotar('falló una tesela con la app oculta');
        errorOculta = true; // se piden otra vez al volver (alVolver)
      } else {
        if (!relojReintento) anotar(`falló una tesela a la vista${globalThis.navigator?.onLine === false ? ' (sin conexión)' : ''}`);
        reintentarLuego();
      }
    });
    capa.on('load', () => {
      if (capa !== teselas) return;
      const v = enVista();
      if (!v.fallidas) intento = 0;
      if (esperandoCarga) anotar(`cargaron: ${v.cargadas} a la vista, ${v.fallidas} fallidas`);
      esperandoCarga = '';
    });
  };

  const ponerCapa = (nombre) => {
    teselas?.remove();
    logo?.remove();
    logo = null;
    reiniciarReintentos();
    elemento.dataset.capa = nombre;
    elemento.classList.remove('ct-mapa-respaldo');
    const estilo = MAPBOX.token && MAPBOX.estilos[nombre];
    if (estilo) {
      teselas = L.tileLayer(`https://api.mapbox.com/styles/v1/${estilo}/tiles/512/{z}/{x}/{y}{r}?access_token=${MAPBOX.token}`, {
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener"><strong>Mejorar este mapa</strong></a>',
      }).addTo(mapa);
      logo = L.control({ position: 'bottomleft' });
      logo.onAdd = () => {
        const a = L.DomUtil.create('a', 'ct-mapbox-logo');
        a.href = 'https://www.mapbox.com/';
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', 'Mapbox');
        a.innerHTML = `<img src="${urlDelSitio('vendor/mapbox-logo.svg')}" alt="Mapbox" width="88" height="23">`;
        return a;
      };
      logo.addTo(mapa);
      // Si Mapbox no responde (token vencido o restringido) ni después de dos reintentos y nunca cargó nada, se pasa a
      // OpenStreetMap. Lo que falla en segundo plano o sin conexión no cuenta: ahí OpenStreetMap tampoco cargaría.
      const capa = teselas;
      vigilar(capa);
      let errores = 0;
      let cargadas = 0;
      capa.on('tileload', () => (cargadas += 1));
      capa.on('tileerror', () => {
        if (capa !== teselas || globalThis.document?.hidden || globalThis.navigator?.onLine === false) return;
        errores += 1;
        if (errores >= 4 && cargadas < 2 && intento >= 2) {
          console.warn('[mapa] Mapbox no respondió; se usa OpenStreetMap');
          anotar('Mapbox no respondió: OpenStreetMap');
          ponerRespaldo(nombre);
        }
      });
    } else {
      ponerRespaldo(nombre);
    }
  };
  const ponerRespaldo = (nombre) => {
    teselas?.remove();
    logo?.remove();
    logo = null;
    reiniciarReintentos();
    const d = CAPAS_MAPA.osm;
    teselas = L.tileLayer(d.url, { attribution: d.atribucion, maxZoom: 19 }).addTo(mapa);
    vigilar(teselas);
    elemento.dataset.capa = nombre;
    // Con un estilo oscuro, el respaldo se oscurece con CSS (ver ESTILOS).
    if (nombre !== 'osm') elemento.classList.add('ct-mapa-respaldo');
  };
  ponerCapa(capa);
  anotar(`mapa creado (${elemento.getBoundingClientRect().width | 0}×${elemento.getBoundingClientRect().height | 0})`);

  const icono = (html, tam, ancla, clase = '') => L.divIcon({ html, className: `ct-marcador ${clase}`, iconSize: tam, iconAnchor: ancla });
  const iconoOrigen = icono(svgPin(colorOrigen, 'A'), [36, 48], [18, 46], 'ct-origen');
  const iconoDestino = icono(svgPin(colorDestino, 'B'), [36, 48], [18, 46], 'ct-destino');

  let origen = null;
  let destino = null;
  let ruta = null;
  let rutaSombra = null;
  let yo = null;
  let yoPrecision = null;
  const taxis = new Map();

  function diagnostico() {
    const nombreDe = (n) => (n ? `${n.tagName.toLowerCase()}${[...n.classList].slice(0, 2).map((c) => `.${c}`).join('')}` : 'nada');
    try {
      const caja = elemento.getBoundingClientRect();
      const v = enVista();
      // Qué hay encima en 9 puntos del mapa (la hoja de abajo y la barra de arriba lo tapan a propósito).
      const otros = new Map();
      let delMapa = 0;
      for (const fx of [0.2, 0.5, 0.8]) {
        for (const fy of [0.25, 0.45, 0.65]) {
          const n = document.elementFromPoint(caja.left + caja.width * fx, caja.top + caja.height * fy);
          if (n && elemento.contains(n)) delMapa += 1;
          else otros.set(nombreDe(n), (otros.get(nombreDe(n)) || 0) + 1);
        }
      }
      const raros = [];
      for (let n = elemento, i = 0; n && i < 6; n = n.parentElement, i += 1) {
        const cs = getComputedStyle(n);
        const r = [cs.display === 'none' && 'display:none', cs.visibility !== 'visible' && `visibility:${cs.visibility}`,
          cs.opacity !== '1' && `opacity:${cs.opacity}`, cs.filter !== 'none' && `filter:${cs.filter}`].filter(Boolean);
        if (r.length) raros.push(`${nombreDe(n)} ${r.join(' ')}`);
      }
      const cont = elemento.querySelector('.leaflet-container') || elemento;
      const c = mapa.getCenter();
      const t = mapa.getSize();
      const img = elemento.querySelector('img.leaflet-tile-loaded');
      const nav = globalThis.performance?.getEntriesByType?.('navigation')?.[0]?.type || '?';
      const nativa = (globalThis.navigator?.userAgent || '').match(/TaxiCun-Nativo\/[\d.]+/)?.[0] || 'web';
      return [
        `mapa ${VERSION_MAPA} · ${nativa} · página: ${nav} hace ${Math.round((Date.now() - t0) / 1000)} s`,
        `${globalThis.navigator?.onLine === false ? 'SIN conexión' : 'con conexión'} · ${document.visibilityState}`,
        `caja ${Math.round(caja.width)}×${Math.round(caja.height)} · Leaflet ${t.x}×${t.y} · pantalla ${innerWidth}×${innerHeight}`,
        `teselas: ${elemento.querySelectorAll('img.leaflet-tile').length} en total; a la vista ${v.cargadas} cargadas, ${v.fallidas} fallidas, ${v.pendientes} en camino`,
        `capa ${elemento.dataset.capa || '?'}${elemento.classList.contains('ct-mapa-respaldo') ? ' (respaldo)' : ''} · ${img ? new URL(img.src).host : 'sin imagen'} ${img ? `${img.naturalWidth}px` : ''} · zoom ${mapa.getZoom()} · ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`,
        `encima: el mapa en ${delMapa} de 9 puntos${otros.size ? ` · tapan: ${[...otros].map(([k, n]) => `${k} (${n})`).join(', ')}` : ''}`,
        `fondo ${getComputedStyle(cont).backgroundColor} · capas ${elemento.querySelector('.leaflet-map-pane')?.style.transform || '-'}`,
        ...(raros.length ? raros : ['sin estilos que lo oculten']),
        `reintentos ${intento} · fallas ${fallasTotal} · redibujos ${redibujos}`,
        'Sucesos (el último primero):',
        ...sucesos.slice().reverse(),
      ].join('\n');
    } catch (e) {
      return `error en el diagnóstico: ${e?.message || e}\n${sucesos.join('\n')}`;
    }
  }

  const api = {
    L,
    mapa,

    cambiarCapa(nombre) {
      ponerCapa(nombre);
    },

    ponerOrigen(p) {
      if (!p) return api.quitarOrigen();
      if (origen) origen.setLatLng([p.lat, p.lng]);
      else origen = L.marker([p.lat, p.lng], { icon: iconoOrigen, zIndexOffset: 500, keyboard: false, interactive: false }).addTo(mapa);
    },
    quitarOrigen() {
      origen?.remove();
      origen = null;
    },

    ponerDestino(p) {
      if (!p) return api.quitarDestino();
      if (destino) destino.setLatLng([p.lat, p.lng]);
      else destino = L.marker([p.lat, p.lng], { icon: iconoDestino, zIndexOffset: 500, keyboard: false, interactive: false }).addTo(mapa);
    },
    quitarDestino() {
      destino?.remove();
      destino = null;
    },

    // Punto azul con la posición del usuario.
    ponerYo(p) {
      if (!p) return;
      if (!yo) {
        yo = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html: '<span class="ct-yo-punto"></span>', className: 'ct-yo', iconSize: [22, 22], iconAnchor: [11, 11] }),
          interactive: false,
          keyboard: false,
          zIndexOffset: 400,
        }).addTo(mapa);
        if (p.precision) yoPrecision = L.circle([p.lat, p.lng], { radius: p.precision, color: '#2563eb', weight: 1, opacity: 0.3, fillOpacity: 0.08, interactive: false }).addTo(mapa);
      } else {
        yo.setLatLng([p.lat, p.lng]);
        if (yoPrecision && p.precision) yoPrecision.setLatLng([p.lat, p.lng]).setRadius(p.precision);
      }
    },

    ponerRuta(coords, { color = colorRuta, grosor = 5, discontinua = false, colorSombra = opciones.colorSombra || '#ffffff' } = {}) {
      api.quitarRuta();
      if (!coords?.length) return;
      rutaSombra = L.polyline(coords, { color: colorSombra, weight: grosor + 4, opacity: 0.85, interactive: false }).addTo(mapa);
      ruta = L.polyline(coords, { color, weight: grosor, opacity: 0.95, dashArray: discontinua ? '2 10' : null, lineCap: 'round', interactive: false }).addTo(mapa);
    },
    quitarRuta() {
      ruta?.remove();
      rutaSombra?.remove();
      ruta = rutaSombra = null;
    },

    // Taxi en el mapa. destacado = el taxi asignado (más grande y encima).
    ponerTaxi(id, p, { rumbo = 0, destacado = false, etiqueta = '', color = colorTaxi } = {}) {
      let t = taxis.get(id);
      const tam = destacado ? 44 : 32;
      const html = `<div class="ct-taxi${destacado ? ' ct-taxi-destacado' : ''}" style="--rumbo:${Math.round(rumbo)}deg">${svgTaxi({ color, tamano: tam })}</div>${etiqueta ? `<span class="ct-taxi-etiqueta">${etiqueta}</span>` : ''}`;
      if (!t) {
        t = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ html, className: 'ct-marcador ct-taxi-marcador', iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] }),
          zIndexOffset: destacado ? 900 : 300,
          interactive: false,
          keyboard: false,
        }).addTo(mapa);
        t._ctHtml = html;
        taxis.set(id, t);
      } else {
        t.setLatLng([p.lat, p.lng]);
        if (t._ctHtml !== html) {
          t.setIcon(L.divIcon({ html, className: 'ct-marcador ct-taxi-marcador', iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] }));
          t.setZIndexOffset(destacado ? 900 : 300);
          t._ctHtml = html;
        }
      }
    },
    quitarTaxi(id) {
      taxis.get(id)?.remove();
      taxis.delete(id);
    },
    // Deja solo los taxis de la lista [{id, lat, lng, rumbo}].
    sincronizarTaxis(lista, opciones = {}) {
      const ids = new Set(lista.map((t) => t.id));
      for (const id of [...taxis.keys()]) if (!ids.has(id) && id !== opciones.conservar) api.quitarTaxi(id);
      // Los conductores reales (no los de ejemplo) llevan su número de móvil encima,
      // para que en una demo con dos celulares se vea cuál es el conectado.
      for (const t of lista) {
        api.ponerTaxi(t.id, t, { rumbo: t.rumbo || 0, ...(t.simulado === false && t.movil ? { etiqueta: `Móvil ${t.movil}` } : {}), ...opciones });
      }
    },
    limpiarTaxis(excepto) {
      for (const id of [...taxis.keys()]) if (id !== excepto) api.quitarTaxi(id);
    },

    centrar(p, z, { animar = true } = {}) {
      mapa.setView([p.lat, p.lng], z ?? mapa.getZoom(), { animate: animar });
    },
    ajustar(puntos, { margen = [60, 60], margenAbajo = 0, maxZoom = 17, animar = true } = {}) {
      const validos = puntos.filter(Boolean).map((p) => (Array.isArray(p) ? p : [p.lat, p.lng]));
      if (validos.length === 0) return;
      if (validos.length === 1) return mapa.setView(validos[0], Math.min(mapa.getZoom(), maxZoom), { animate: animar });
      mapa.fitBounds(L.latLngBounds(validos), { paddingTopLeft: margen, paddingBottomRight: [margen[0], margen[1] + margenAbajo], maxZoom, animate: animar });
    },
    centro() {
      const c = mapa.getCenter();
      return { lat: c.lat, lng: c.lng };
    },
    // Avisa cuando el usuario termina de mover el mapa (para elegir un punto con
    // un pin fijo en el centro de la pantalla). Devuelve la función para quitarlo.
    alMoverse(fn) {
      const h = () => fn(api.centro());
      mapa.on('moveend', h);
      return () => mapa.off('moveend', h);
    },
    alEmpezarAMoverse(fn) {
      mapa.on('movestart', fn);
      return () => mapa.off('movestart', fn);
    },
    // Llamar cuando cambie el tamaño del contenedor.
    refrescar() {
      mapa.invalidateSize();
    },
    destruir() {
      quitarVolver();
      mapa.remove();
    },
    // Diagnóstico en pantalla con una pulsación larga (1,5 s, sin mover el dedo) sobre `boton`.
    vigilarDiagnostico(boton) {
      if (!boton) return;
      let reloj = null;
      let x = 0;
      let y = 0;
      const parar = () => {
        clearTimeout(reloj);
        reloj = null;
      };
      boton.addEventListener('pointerdown', (e) => {
        parar();
        x = e.clientX;
        y = e.clientY;
        reloj = setTimeout(() => {
          reloj = null;
          api.mostrarDiagnostico();
        }, 1500);
      });
      boton.addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - x, e.clientY - y) > 12) parar();
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) boton.addEventListener(t, parar);
      boton.addEventListener('contextmenu', (e) => e.preventDefault());
    },
    diagnostico,
    mostrarDiagnostico() {
      globalThis.document?.querySelector('.ct-diag-mapa')?.remove();
      const d = document.createElement('div');
      d.className = 'ct-diag-mapa';
      d.setAttribute('role', 'dialog');
      d.innerHTML = '<pre></pre><div><button type="button" data-rehacer>Rehacer el mapa</button><button type="button" data-cerrar>Cerrar</button></div>';
      const pre = d.querySelector('pre');
      pre.textContent = diagnostico();
      d.querySelector('[data-cerrar]').addEventListener('click', () => d.remove());
      d.querySelector('[data-rehacer]').addEventListener('click', () => {
        anotar('«Rehacer el mapa» (a mano)');
        try {
          mapa.invalidateSize({ pan: false });
          ponerCapa(elemento.dataset.capa || capa);
        } catch (e) {
          anotar(`error al rehacer: ${e?.message || e}`);
        }
        pre.textContent = diagnostico();
        setTimeout(() => d.isConnected && (pre.textContent = diagnostico()), 3000);
      });
      document.body.append(d);
    },
  };

  // Al volver a la app (iPhone, después de Face ID): el mapa quedaba en blanco hasta cerrarla y abrirla (13-oct, Oscar).
  // En segundo plano el WKWebView puede quedar sin tamaño (Leaflet calcula la vista con 0 × 0 y suelta las teselas) y las
  // teselas pedidas mientras estaba suspendida fallan sin reintento. Al volver, se acomoda el tamaño y, si a la vista no
  // hay teselas cargadas (ni en camino) o alguna falló, se piden otra vez; se revisa de nuevo al segundo y medio, y lo que
  // falle después lo siguen los reintentos. Si la app estuvo oculta más de 30 s (15-oct: seguía en blanco tras un rato
  // largo en reposo), el mapa se pide completo de una vez: el iPhone suelta de la memoria las imágenes ya dibujadas y
  // Leaflet las sigue creyendo cargadas. Lo mismo al volver la conexión (online).
  const OCULTA_LARGO_MS = 30_000;
  let ocultaDesde = 0;
  let forzar = false;
  const revisar = () => {
    if (globalThis.document?.hidden || !elemento.isConnected) return;
    try {
      mapa.invalidateSize({ pan: false });
      if (!teselas) return;
      const v = enVista();
      if (!v.conTamano) return;
      if (forzar || errorOculta || v.fallidas || (!v.cargadas && !v.pendientes)) {
        const motivo = forzar ? 'estuvo oculta un rato largo' : errorOculta ? 'fallaron estando oculta' : v.fallidas ? `${v.fallidas} fallidas` : 'ninguna a la vista';
        if (forzar) {
          // Además, que el iPhone vuelva a armar las capas del mapa (no solo las imágenes): sin esto, si soltó el dibujo
          // del contenedor, las teselas nuevas tampoco se verían.
          const antes = elemento.style.display;
          elemento.style.display = 'none';
          void elemento.offsetHeight;
          elemento.style.display = antes;
        }
        forzar = false;
        errorOculta = false;
        redibujar(`al volver: ${motivo}`);
      } else if (!v.cargadas) {
        anotar(`al volver: ${v.pendientes} en camino`);
      }
    } catch (e) {
      console.warn('[mapa] al volver:', e?.message || e);
    }
  };
  const relojes = [];
  const marcarOculta = (ev) => {
    if (!ocultaDesde) anotar(`se oculta (${ev?.type || 'pause'})`);
    ocultaDesde ||= Date.now();
  };
  const alVolver = (ev) => {
    if (globalThis.document?.hidden) return marcarOculta(ev);
    const fuera = ocultaDesde ? Math.round((Date.now() - ocultaDesde) / 1000) : 0;
    if (ocultaDesde || !['pageshow', 'resume'].includes(ev?.type || 'resume')) anotar(`vuelve (${ev?.type || 'resume'})${fuera ? ` tras ${fuera} s oculta` : ''}`);
    if (ocultaDesde && Date.now() - ocultaDesde > OCULTA_LARGO_MS) forzar = true;
    ocultaDesde = 0;
    intento = 0;
    while (relojes.length) clearTimeout(relojes.pop());
    relojes.push(setTimeout(revisar, 300), setTimeout(revisar, 1500));
  };
  globalThis.document?.addEventListener('visibilitychange', alVolver);
  globalThis.addEventListener?.('pageshow', alVolver);
  globalThis.addEventListener?.('online', alVolver);
  globalThis.addEventListener?.('ct-desbloqueo', alVolver); // se quitó el bloqueo de Face ID (disenos/a/nativa.js)
  const nativos = [];
  for (const [evento, fn] of [['resume', alVolver], ['pause', marcarOculta]]) {
    try {
      const h = globalThis.Capacitor?.Plugins?.App?.addListener?.(evento, fn);
      Promise.resolve(h).then((x) => (activo ? x && nativos.push(x) : x?.remove?.())).catch(() => {});
    } catch {
      /* sin el plugin App */
    }
  }
  function quitarVolver() {
    activo = false;
    while (relojes.length) clearTimeout(relojes.pop());
    clearTimeout(relojReintento);
    relojReintento = null;
    globalThis.document?.removeEventListener('visibilitychange', alVolver);
    globalThis.removeEventListener?.('pageshow', alVolver);
    globalThis.removeEventListener?.('online', alVolver);
    globalThis.removeEventListener?.('ct-desbloqueo', alVolver);
    for (const h of nativos.splice(0)) {
      try {
        h?.remove?.();
      } catch {
        /* nada */
      }
    }
  }
  return api;
}

// Estilos mínimos de los marcadores (cada diseño puede sobreescribirlos).
const ESTILOS = `
.ct-marcador{background:none;border:0}
.leaflet-tile.leaflet-tile-loaded{opacity:1!important}
.ct-diag-mapa{position:fixed;left:8px;right:8px;top:calc(env(safe-area-inset-top,0px) + 8px);z-index:2147483000;background:rgba(10,10,10,.93);color:#fff;border-radius:12px;padding:10px 12px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.ct-diag-mapa pre{margin:0;white-space:pre-wrap;word-break:break-word;max-height:62vh;overflow:auto;font:11px/1.4 ui-monospace,Menlo,monospace}
.ct-diag-mapa button{margin:10px 8px 0 0;padding:9px 14px;border:0;border-radius:9px;background:#FFC107;color:#111;font:700 13px system-ui,sans-serif}
.ct-diag-mapa button[data-cerrar]{background:#3a3a3a;color:#fff}
.ct-taxi{width:100%;height:100%;display:grid;place-items:center;transform:rotate(var(--rumbo));transition:transform .6s linear;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
.ct-taxi-destacado{filter:drop-shadow(0 0 10px rgba(255,193,7,.9)) drop-shadow(0 3px 4px rgba(0,0,0,.4))}
.ct-taxi-marcador{transition:transform 1s linear}
.ct-haciendo-zoom .ct-taxi-marcador,.leaflet-zoom-anim .ct-taxi-marcador{transition:none!important}
.ct-taxi-etiqueta{position:absolute;left:50%;top:-18px;transform:translateX(-50%);background:#111;color:#fff;font:700 11px/1 system-ui,sans-serif;padding:3px 6px;border-radius:8px;white-space:nowrap}
.ct-yo{background:none;border:0}
.ct-yo-punto{display:block;width:18px;height:18px;margin:2px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,99,235,.25),0 2px 6px rgba(0,0,0,.3)}
.ct-origen svg,.ct-destino svg{filter:drop-shadow(0 4px 4px rgba(0,0,0,.3))}
.leaflet-container img.leaflet-tile{mix-blend-mode:normal}
.ct-mapbox-logo{display:block;width:88px;height:23px;margin:0 0 4px 6px!important;opacity:.9}
.ct-mapbox-logo img{display:block;width:88px;height:23px}
.ct-mapa-respaldo[data-capa="oscuro"] .leaflet-tile-pane,.ct-mapa-respaldo[data-capa="noche"] .leaflet-tile-pane{filter:invert(1) hue-rotate(185deg) brightness(.92) contrast(1.08) saturate(.55)}
`;
if (!document.getElementById('ct-estilos-mapa')) {
  const s = document.createElement('style');
  s.id = 'ct-estilos-mapa';
  s.textContent = ESTILOS;
  document.head.appendChild(s);
}
