// «¿Qué hacer?» (modo real, servidor 0.13.0): sitios turísticos y planes de un día PUBLICADOS por interOS en el
// panel. La app los pide a la API pública (sin sesión) y los pinta como texto (S30). Las demos y el modo revisor no
// lo usan.
//
// Contrato (propuesto por la app; la integración lo ajusta con docs/CONTRATO.md del servidor):
//   GET /api/que-hacer/sitios?lat=<n>&lng=<n>&radioKm=<1..60>   (cerca de una posición)
//   GET /api/que-hacer/sitios?municipio=<id>                    (los de un municipio: «el-rosal», «facatativa»…)
//     → 200 { sitios: [Sitio] }  con ETag y Cache-Control corto; solo PUBLICADOS (nunca borradores ni retirados).
//   GET /api/que-hacer/planes?<la misma consulta>
//     → 200 { planes: [Plan], sitios: [Sitio] }  (sitios: las paradas, aunque queden fuera del radio).
//   Sitio: { id, nombre, municipio, municipioId, categoria, resumen, descripcion, lat, lng, direccion?, horario?,
//            entrada: 'gratis'|'con_costo'|'desconocido', valorEntrada?: número (pesos) o texto, recomendaciones?,
//            fotos: [{ id, url: '/api/que-hacer/fotos/<id>.jpg', ancho?, alto?, autor, licencia, licenciaUrl?,
//                      pagina?, propia? }] }
//   Plan: { id, titulo, resumen, municipios: [texto], duracion, recomendaciones?, paradas: [idSitio] (2 a 4) }
//   Las fotos las sirve TaxiCun (copia descargada de Commons o subida por interOS): la app solo acepta direcciones
//   del mismo origen bajo /api/que-hacer/ (la CSP de taxicun.com limita img-src). Una foto sin crédito (sin autor
//   y sin «propia») no se muestra: el crédito va SIEMPRE junto a la foto.
//   Con un servidor anterior (404/405) → { disponible: false }: la app no muestra el botón.
//
// Sin DOM y sin config.js: se prueba en Node (pruebas/que-hacer-nucleo.mjs).
import { distanciaKm } from './util.js';
import { urlSegura } from './enlaces.js';

export const CATEGORIAS_QH = Object.freeze({
  historia: 'Historia', religioso: 'Religioso', parque: 'Parque', naturaleza: 'Naturaleza', museo: 'Museo',
  mirador: 'Mirador', cultura: 'Cultura', gastronomia: 'Gastronomía', otro: 'Para visitar',
});
// Enlaces del crédito de una foto (la página del archivo y la licencia).
export const DOMINIOS_CREDITO = Object.freeze(['commons.wikimedia.org', 'creativecommons.org', 'wikimedia.org', 'taxicun.com', 'interos.com.co']);
export const RADIO_KM = 25;
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CACHE_MS = 2 * 60 * 1000;
const ESPERA_MS = 12000;

// Texto plano de una línea (sin controles ni marcas de dirección), recortado.
export function plano(t, max = 300) {
  if (typeof t !== 'string') return '';
  return t.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// «Facatativá» → «facatativa», «El Rosal» → «el-rosal».
export function idMunicipio(nombre) {
  return String(nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Dirección de una foto servida por TaxiCun: mismo origen que la API y bajo /api/que-hacer/; si no, ''.
export function urlFoto(u, urlApi) {
  if (typeof u !== 'string' || !u || u.length > 300) return '';
  let base;
  let url;
  try {
    base = new URL(urlApi);
    url = new URL(u, base);
  } catch {
    return '';
  }
  if (url.origin !== base.origin || url.username || url.password || url.hash) return '';
  if (!url.pathname.startsWith(`${base.pathname.replace(/\/?$/, '/')}que-hacer/`) || url.pathname.includes('..')) return '';
  return url.href;
}

const numero = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);

export function normalizarFoto(f, urlApi) {
  if (!f || typeof f !== 'object') return null;
  const url = urlFoto(f.url, urlApi);
  if (!url) return null;
  const propia = f.propia === true;
  const autor = plano(f.autor, 120);
  if (!autor && !propia) return null; // sin crédito, no se muestra
  return {
    url,
    autor: autor || 'interOS',
    licencia: plano(f.licencia, 60),
    licenciaUrl: urlSegura(f.licenciaUrl, DOMINIOS_CREDITO),
    pagina: urlSegura(f.pagina, DOMINIOS_CREDITO),
    propia,
    ancho: numero(f.ancho, 1, 10000),
    alto: numero(f.alto, 1, 10000),
  };
}

// «Foto: Autor · CC BY-SA 4.0» o «Foto de interOS».
export function textoCredito(f) {
  if (!f) return '';
  if (f.propia && (!f.autor || f.autor === 'interOS')) return 'Foto de interOS';
  return `Foto: ${[f.autor, f.licencia].filter(Boolean).join(' · ')}`;
}

export function normalizarSitio(s, urlApi) {
  if (!s || typeof s !== 'object' || !ID.test(String(s.id || ''))) return null;
  const lat = numero(s.lat, -5, 14);
  const lng = numero(s.lng, -82, -66);
  const nombre = plano(s.nombre, 120);
  if (lat === null || lng === null || !nombre) return null;
  const entrada = ['gratis', 'con_costo'].includes(s.entrada) ? s.entrada : 'desconocido';
  const valor = typeof s.valorEntrada === 'number' ? numero(s.valorEntrada, 1, 10000000) : plano(s.valorEntrada, 80) || null;
  return {
    id: s.id,
    nombre,
    municipio: plano(s.municipio, 60),
    municipioId: ID.test(String(s.municipioId || '')) ? s.municipioId : idMunicipio(s.municipio),
    categoria: Object.hasOwn(CATEGORIAS_QH, s.categoria) ? s.categoria : 'otro',
    resumen: plano(s.resumen, 300),
    descripcion: plano(s.descripcion, 2000),
    lat,
    lng,
    direccion: plano(s.direccion, 200),
    horario: plano(s.horario, 300),
    entrada,
    valorEntrada: entrada === 'con_costo' ? valor : null,
    recomendaciones: plano(s.recomendaciones, 600),
    fotos: (Array.isArray(s.fotos) ? s.fotos : []).slice(0, 8).map((f) => normalizarFoto(f, urlApi)).filter(Boolean),
  };
}

export function normalizarPlan(p, sitios) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id || ''))) return null;
  const titulo = plano(p.titulo, 140);
  const paradas = (Array.isArray(p.paradas) ? p.paradas : [])
    .map((x) => sitios.get(typeof x === 'string' ? x : x?.id))
    .filter(Boolean)
    .slice(0, 4);
  if (!titulo || paradas.length < 2) return null; // un plan sin sus paradas publicadas no sale
  return {
    id: p.id,
    titulo,
    resumen: plano(p.resumen, 300),
    municipios: (Array.isArray(p.municipios) ? p.municipios : []).map((m) => plano(m, 60)).filter(Boolean).slice(0, 4),
    duracion: plano(p.duracion, 40),
    recomendaciones: plano(p.recomendaciones, 600),
    paradas,
  };
}

// «Entrada gratis», «Entrada: $5.000», «Entrada con costo», «Entrada: consulta antes de ir».
export function textoEntrada(s, pesos = (v) => `$${Math.round(v).toLocaleString('es-CO')}`) {
  if (s.entrada === 'gratis') return 'Entrada gratis';
  if (s.entrada === 'con_costo') {
    if (typeof s.valorEntrada === 'number') return `Entrada: ${pesos(s.valorEntrada)}`;
    return s.valorEntrada ? `Entrada: ${s.valorEntrada}` : 'Entrada con costo';
  }
  return 'Entrada: consulta antes de ir';
}

// Consulta para la API: cerca de { lat, lng } (con radio) o de un municipio.
export function consulta({ cerca = null, municipio = '', radioKm = RADIO_KM } = {}) {
  const q = new URLSearchParams();
  if (cerca && Number.isFinite(cerca.lat) && Number.isFinite(cerca.lng)) {
    q.set('lat', cerca.lat.toFixed(4));
    q.set('lng', cerca.lng.toFixed(4));
    q.set('radioKm', String(Math.max(1, Math.min(60, Math.round(radioKm)))));
  } else if (ID.test(idMunicipio(municipio))) {
    q.set('municipio', idMunicipio(municipio));
  }
  return q.toString();
}

// Ordena por distancia a «desde» y le pone km a cada uno (línea recta).
export function ordenarPorDistancia(sitios, desde) {
  if (!desde || !Number.isFinite(desde.lat)) return sitios.map((s) => ({ ...s, km: null }));
  return sitios.map((s) => ({ ...s, km: distanciaKm(desde, s) })).sort((a, b) => a.km - b.km);
}

export class SinQueHacer extends Error {
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo; // 'no_disponible' (servidor anterior) | 'sin_red' | 'error'
  }
}

// Cliente con caché corta en memoria. urlApi: N.URL_API; pedir: fetch (en las pruebas, uno falso).
export function crearQueHacer({ urlApi, pedir = (...a) => globalThis.fetch(...a) } = {}) {
  const cache = new Map();
  async function json(ruta) {
    const guardado = cache.get(ruta);
    if (guardado && Date.now() - guardado.t < CACHE_MS) return guardado.datos;
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), ESPERA_MS);
    let r;
    try {
      // Pública: sin token ni cookies. «no-cache» revalida con el ETag (304 si nada cambió).
      r = await pedir(new URL(ruta, urlApi).href, { headers: { Accept: 'application/json' }, cache: 'no-cache', credentials: 'omit', signal: control.signal });
    } catch {
      throw new SinQueHacer('sin_red');
    } finally {
      clearTimeout(reloj);
    }
    if (r.status === 404 || r.status === 405) throw new SinQueHacer('no_disponible');
    if (!r.ok) throw new SinQueHacer('error');
    let datos;
    try {
      datos = await r.json();
    } catch {
      throw new SinQueHacer('error');
    }
    cache.set(ruta, { t: Date.now(), datos });
    return datos;
  }
  const sitiosDe = (lista) => (Array.isArray(lista) ? lista : []).slice(0, 300).map((s) => normalizarSitio(s, urlApi)).filter(Boolean);
  return {
    // → { sitios, planes } normalizados (sitios sin repetir; los de los planes se suman al mapa, no a la lista).
    async cargar(opciones) {
      const q = consulta(opciones);
      if (!q) return { sitios: [], planes: [] };
      const [ds, dp] = await Promise.all([
        json(`que-hacer/sitios?${q}`),
        json(`que-hacer/planes?${q}`).catch((e) => {
          if (e.motivo === 'no_disponible') return { planes: [] };
          throw e;
        }),
      ]);
      const sitios = sitiosDe(ds?.sitios);
      const mapa = new Map(sitios.map((s) => [s.id, s]));
      for (const s of sitiosDe(dp?.sitios)) if (!mapa.has(s.id)) mapa.set(s.id, s);
      const planes = (Array.isArray(dp?.planes) ? dp.planes : []).slice(0, 100).map((p) => normalizarPlan(p, mapa)).filter(Boolean);
      const vistos = new Set();
      return { sitios: sitios.filter((s) => !vistos.has(s.id) && vistos.add(s.id)), planes };
    },
    olvidar: () => cache.clear(),
  };
}
