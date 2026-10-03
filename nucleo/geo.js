// Ubicación, direcciones y rutas. Usa servicios gratuitos (Nominatim y OSRM) y,
// si fallan o no hay internet, responde con aproximaciones locales.
import { CENTRO, ZONA, SERVICIOS, PUNTO_RECOGIDA } from './config.js';
import { LUGARES, CATEGORIAS, DESTINOS_TARIFA, TARIFAS } from './datos.js';
import { distanciaKm, pesos } from './util.js';
import { posicion, seguir, MODO_REAL } from './plataforma.js';

const cacheDirecciones = new Map();
let ultimaConsultaNominatim = 0;

async function turnoNominatim() {
  // Nominatim pide máximo una consulta por segundo.
  const espera = ultimaConsultaNominatim + 1100 - Date.now();
  ultimaConsultaNominatim = Math.max(Date.now(), ultimaConsultaNominatim + 1100);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
}

async function pedirJSON(url, ms = 6000) {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(url, { signal: control.signal, headers: { 'Accept-Language': 'es' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// Posición actual. Si el GPS falla o se niega, devuelve el paradero de taxis de la ficha
// (El Rosal: el Decreto 89 de 2026 prohíbe recoger en el parque principal) o, si no hay,
// el centro del pueblo, con real: false para que la interfaz lo diga. El GPS lo da plataforma.js: en la web,
// el del navegador con las opciones de siempre; en la app nativa, el del plugin.
export async function obtenerPosicion({ espera = 8000, precisa = true } = {}) {
  try {
    const p = await posicion({ precisa, espera, edad: 15000 });
    return { lat: p.lat, lng: p.lng, precision: p.precision, real: true };
  } catch (e) {
    // motivo: 'sin-gps' (el aparato no tiene), 'denegado' (permiso), 'tiempo' (la lectura tardó),
    // 'sin-senal' (el GPS respondió sin posición) o 'no-disponible' (ubicación apagada u otro error).
    // 'tiempo' y 'sin-senal' son falta de señal: en la app, la ubicación apagada da 'no-disponible'.
    const motivo = e?.sinGps ? 'sin-gps' : e?.code === 1 ? 'denegado' : e?.code === 3 ? 'tiempo' : e?.sinSenal ? 'sin-senal' : 'no-disponible';
    return { ...PUNTO_RECOGIDA, precision: null, real: false, motivo };
  }
}

// Sigue la posición en tiempo real. Devuelve la función para detenerse.
// alFallar({ code, muerto }) avisa si se pierde el GPS (1 permiso negado, 2 no disponible, 3 tiempo);
// muerto: el seguimiento ya no existe y hay que pedir otro (ver plataforma.seguir).
// intervalo (ms): cada cuánto se quiere una lectura; solo lo respeta el plugin en Android.
export function seguirPosicion(fn, { precisa = true, alFallar = () => {}, intervalo } = {}) {
  return seguir((p) => fn({ ...p, real: true }), { precisa, alFallar, ...(intervalo ? { intervalo } : {}) });
}

// ¿La posición está lejos de la zona de servicio? (por ejemplo, alguien que
// prueba la demo desde otra ciudad).
export function fueraDeZona(p) {
  return distanciaKm(p, CENTRO) > 60;
}

function lugarCercano(p, maxKm = 0.06) {
  let mejor = null;
  for (const l of LUGARES) {
    const d = distanciaKm(p, l);
    if (d <= maxKm && (!mejor || d < mejor.d)) mejor = { ...l, d };
  }
  return mejor;
}

// Dirección legible de un punto («Calle 8 #10-20, Centro»).
export async function direccionDe(p) {
  const clave = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  if (cacheDirecciones.has(clave)) return cacheDirecciones.get(clave);
  const cerca = lugarCercano(p);
  if (cerca) {
    const r = { titulo: cerca.nombre, detalle: cerca.detalle, lat: p.lat, lng: p.lng };
    cacheDirecciones.set(clave, r);
    return r;
  }
  try {
    await turnoNominatim();
    const d = await pedirJSON(`${SERVICIOS.nominatim}/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${p.lat}&lon=${p.lng}`);
    const a = d.address || {};
    const via = [a.road, a.house_number ? `#${a.house_number}` : ''].filter(Boolean).join(' ');
    const sector = a.neighbourhood || a.suburb || a.hamlet || a.village || a.quarter || '';
    const ciudad = a.town || a.city || a.municipality || a.county || '';
    const titulo = via || d.name || sector || ciudad || 'Punto en el mapa';
    const detalle = [via ? sector : '', ciudad].filter(Boolean).join(', ') || 'Cundinamarca';
    const r = { titulo, detalle, lat: p.lat, lng: p.lng };
    cacheDirecciones.set(clave, r);
    return r;
  } catch {
    return { titulo: 'Punto en el mapa', detalle: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`, lat: p.lat, lng: p.lng };
  }
}

function normalizar(t) {
  return t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Destinos de la tabla oficial de tarifas (los que están en el mapa) que coinciden con el
// texto, como lugares para pedir el taxi: llevan idTarifa y su precio en el detalle.
function buscarEnTarifas(q, palabras, yaEstan) {
  if (TARIFAS.ejemplo || !DESTINOS_TARIFA.length) return [];
  return DESTINOS_TARIFA.map((d, i) => ({ d, i }))
    .filter(({ d }) => Number.isFinite(d.lat) && Number.isFinite(d.lng) && !yaEstan.has(normalizar(d.destino)))
    .filter(({ d }) => {
      const t = normalizar(`${d.destino} ${d.sector || ''}`);
      return palabras.every((w) => t.includes(w));
    })
    .map(({ d, i }) => {
      const nombre = normalizar(d.destino);
      const rango = nombre.startsWith(q) ? 0 : palabras.every((w) => nombre.includes(w)) ? 1 : 2;
      const aprox = d.precision === 'vereda' ? ' · punto aproximado' : '';
      return { l: d, i, r: rango, lugar: { titulo: d.destino, detalle: `Zona ${d.zona} · ${d.sector} · ${pesos(d.valor)} oficial${aprox}`, lat: d.lat, lng: d.lng, idTarifa: d.id, icono: '🏷️', fuente: 'frecuente', rango } };
    });
}

// Lugares frecuentes que coinciden con el texto (sin internet). Si la cooperativa tiene tabla
// oficial de tarifas, también sus destinos (después de los lugares, sin repetir nombres).
export function buscarLocal(texto, limite = 8) {
  const q = normalizar(texto.trim());
  if (!q) return [];
  const palabras = q.split(/\s+/);
  // Primero los que empiezan por lo buscado, luego los que lo traen en el nombre y al
  // final los que solo coinciden en el detalle o la categoría («Chía» → el municipio
  // antes que «Estación Terpel · Vía a Chía»). Dentro de cada grupo, el orden de la ficha.
  const rango = (l) => {
    const nombre = normalizar(l.nombre);
    if (nombre.startsWith(q)) return 0;
    return palabras.every((w) => nombre.includes(w)) ? 1 : 2;
  };
  const lugares = LUGARES.map((l, i) => ({ l, i }))
    .filter(({ l }) => {
      const t = normalizar(`${l.nombre} ${l.detalle} ${CATEGORIAS[l.cat]?.nombre || ''}`);
      return palabras.every((w) => t.includes(w));
    })
    .map((x) => ({ ...x, r: rango(x.l) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ l, r }) => ({ titulo: l.nombre, detalle: l.detalle, lat: l.lat, lng: l.lng, icono: CATEGORIAS[l.cat]?.icono, fuente: 'frecuente', rango: r }));
  const tarifas = buscarEnTarifas(q, palabras, new Set(LUGARES.map((l) => normalizar(l.nombre || ''))))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.lugar);
  // Los lugares de la ficha primero; los destinos de la tabla, después (mismo rango, antes los lugares).
  return [...lugares, ...tarifas].sort((a, b) => a.rango - b.rango).slice(0, limite);
}

// Búsqueda de direcciones: primero lugares frecuentes, luego Nominatim.
export async function buscarDirecciones(texto, { cerca = CENTRO, limite = 8 } = {}) {
  const locales = buscarLocal(texto, limite);
  if (texto.trim().length < 3) return locales;
  let remotos = [];
  try {
    await turnoNominatim();
    const q = encodeURIComponent(`${texto}`);
    const caja = `${ZONA.oeste},${ZONA.norte},${ZONA.este},${ZONA.sur}`;
    const d = await pedirJSON(`${SERVICIOS.nominatim}/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=co&viewbox=${caja}&bounded=1&q=${q}`);
    remotos = d.map((x) => {
      const a = x.address || {};
      const via = [a.road, a.house_number ? `#${a.house_number}` : ''].filter(Boolean).join(' ');
      const ciudad = a.town || a.city || a.village || a.municipality || '';
      return {
        titulo: x.name || via || x.display_name.split(',')[0],
        detalle: [via && x.name ? via : '', a.neighbourhood || a.suburb || '', ciudad].filter(Boolean).join(', '),
        lat: Number(x.lat),
        lng: Number(x.lon),
        icono: '📍',
        fuente: 'mapa',
      };
    });
  } catch {
    /* sin internet: solo lugares frecuentes */
  }
  const todos = [...locales];
  const nombres = new Set(locales.map((t) => normalizar(t.titulo)));
  for (const r of remotos) {
    // Fuera los repetidos: el mismo punto o el mismo nombre que un lugar frecuente.
    if (!todos.some((t) => distanciaKm(t, r) < 0.05) && !nombres.has(normalizar(r.titulo || ''))) todos.push(r);
  }
  // Los frecuentes conservan su orden por coincidencia; los de Nominatim, por cercanía.
  return todos.sort((a, b) => {
    if (a.fuente !== b.fuente) return a.fuente === 'frecuente' ? -1 : 1;
    if (a.fuente === 'frecuente') return (a.rango ?? 2) - (b.rango ?? 2) || 0;
    return distanciaKm(a, cerca) - distanciaKm(b, cerca);
  }).slice(0, limite);
}

// Ruta por carretera entre dos puntos: { coords: [[lat,lng]...], km, min, aproximada }
const cacheRutas = new Map();
// En modo real la caché lleva el prefijo «tc.real.»: se borra con los datos de la cuenta
// (perfil.borrarDatosLocales), porque guarda los puntos de recogida y los destinos.
const CLAVE_CACHE_RUTAS = MODO_REAL ? 'tc.real.cache.rutas' : 'ct.cache.rutas';
try {
  for (const [k, v] of JSON.parse(localStorage.getItem(CLAVE_CACHE_RUTAS) || '[]')) cacheRutas.set(k, v);
} catch {
  /* caché dañada: se ignora */
}
function guardarCacheRutas() {
  try {
    localStorage.setItem(CLAVE_CACHE_RUTAS, JSON.stringify([...cacheRutas].slice(-40)));
  } catch {
    /* sin espacio */
  }
}

// Olvida las rutas consultadas (en memoria y en el celular). Para «Eliminar mi cuenta».
export function vaciarCacheRutas() {
  cacheRutas.clear();
  try {
    localStorage.removeItem(CLAVE_CACHE_RUTAS);
  } catch {
    /* sin almacenamiento */
  }
}

export async function calcularRuta(a, b) {
  const clave = `${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  if (cacheRutas.has(clave)) return cacheRutas.get(clave);
  try {
    const d = await pedirJSON(`${SERVICIOS.osrm}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`, 7000);
    const r = d.routes?.[0];
    if (!r) throw new Error('sin ruta');
    const ruta = {
      coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      km: r.distance / 1000,
      // OSRM calcula para vías libres; en la Sabana el tráfico es más lento.
      min: Math.max(2, (r.duration / 60) * 1.25),
      aproximada: false,
    };
    cacheRutas.set(clave, ruta);
    guardarCacheRutas();
    return ruta;
  } catch {
    const km = distanciaKm(a, b) * 1.35;
    return { coords: [[a.lat, a.lng], [b.lat, b.lng]], km, min: Math.max(2, (km / 28) * 60), aproximada: true };
  }
}
