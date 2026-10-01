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

  let teselas = null;
  let logo = null;
  const ponerCapa = (nombre) => {
    teselas?.remove();
    logo?.remove();
    logo = null;
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
      // Si Mapbox no responde (sin red, token vencido o restringido), se pasa a OpenStreetMap.
      let errores = 0;
      let cargadas = 0;
      teselas.on('tileload', () => (cargadas += 1));
      teselas.on('tileerror', () => {
        errores += 1;
        if (errores >= 4 && cargadas < 2) {
          console.warn('[mapa] Mapbox no respondió; se usa OpenStreetMap');
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
    const d = CAPAS_MAPA.osm;
    teselas = L.tileLayer(d.url, { attribution: d.atribucion, maxZoom: 19 }).addTo(mapa);
    elemento.dataset.capa = nombre;
    // Con un estilo oscuro, el respaldo se oscurece con CSS (ver ESTILOS).
    if (nombre !== 'osm') elemento.classList.add('ct-mapa-respaldo');
  };
  ponerCapa(capa);

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
      for (const t of lista) api.ponerTaxi(t.id, t, { rumbo: t.rumbo || 0, ...opciones });
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
      mapa.remove();
    },
  };
  return api;
}

// Estilos mínimos de los marcadores (cada diseño puede sobreescribirlos).
const ESTILOS = `
.ct-marcador{background:none;border:0}
.ct-taxi{width:100%;height:100%;display:grid;place-items:center;transform:rotate(var(--rumbo));transition:transform .6s linear;filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))}
.ct-taxi-destacado{filter:drop-shadow(0 0 10px rgba(255,193,7,.9)) drop-shadow(0 3px 4px rgba(0,0,0,.4))}
.ct-taxi-marcador{transition:transform 1s linear}
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
