// «¿Qué hacer?» (modo real, servidor 0.13.0): sitios turísticos y planes de un día PUBLICADOS por interOS en el
// panel. La app los pide a la API pública (sin sesión) y los pinta como texto (S30). Las demos y el modo revisor no
// la llaman.
//
// Contrato: docs/CONTRATO.md §16.2 del servidor (taxicun-servidor 0.13.0).
//   GET /api/que-hacer/sitios?lat=<2 decimales>&lng=<2 decimales>&radioKm=<1..40>   (cerca; la posición no viaja exacta)
//   GET /api/que-hacer/sitios?municipio=<id>            (ids de GET /api/que-hacer/municipios: «el-rosal», «chia»…)
//     → { version: 1, filtro, total, sitios: [Sitio] }  (ETag + max-age=60; solo PUBLICADOS)
//   GET /api/que-hacer/planes?<el mismo filtro>  → { version: 1, filtro, total, planes: [Plan] }
//   GET /api/que-hacer/municipios → { version: 1, municipios: [{ id, nombre, centro: { lat, lng }, sitios, planes }] }
//   Sitio: { id, nombre, municipio: { id, nombre }, categoria, resumen, descripcion, lat, lng, precision, direccion,
//            horario, entrada: 'gratis'|'con_costo'|'desconocido', valorEntrada: pesos|null, recomendaciones,
//            fuentes: [{ titulo, url }], fotos: [Foto], distanciaKm?, actualizado }
//   Foto: { url: '/api/que-hacer/fotos/<id>.jpg', tipo, ancho, alto,
//           credito: { texto, autor, licencia, licenciaUrl, pagina, origen: 'commons'|'interos'|'propia' } }
//   Plan: { id, titulo, resumen, duracion, recomendaciones, municipios: [{ id, nombre }],
//           paradas: [{ orden, sitio: Sitio }], distanciaKm?, actualizado }
//   Las fotos las sirve TaxiCun: la app solo acepta direcciones del mismo origen bajo /api/que-hacer/ (la CSP de
//   taxicun.com limita img-src) y nunca muestra una foto sin su crédito. 404/405 (servidor anterior) → SinQueHacer
//   ('no_disponible'): la app no muestra el acceso.
//
// Sin DOM y sin config.js: se prueba en Node (pruebas/que-hacer-nucleo.mjs).
import { distanciaKm } from './util.js';
import { urlSegura } from './enlaces.js';

export const CATEGORIAS_QH = Object.freeze({
  historia: 'Historia', religioso: 'Religioso', parque: 'Parques', naturaleza: 'Naturaleza', museo: 'Museos',
  mirador: 'Miradores', cultura: 'Cultura', gastronomia: 'Gastronomía', otro: 'Otros',
});
// Enlaces del crédito de una foto (la página del archivo y la licencia).
export const DOMINIOS_CREDITO = Object.freeze(['commons.wikimedia.org', 'creativecommons.org', 'wikimedia.org', 'taxicun.com', 'interos.com.co']);
export const RADIO_KM = 20;
const ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const CACHE_MS = 60 * 1000; // la API publica con max-age=60
const ESPERA_MS = 12000;
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

// Texto plano de una línea (sin controles ni marcas de dirección), recortado.
export function plano(t, max = 300) {
  if (typeof t !== 'string') return '';
  return t.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Texto plano que conserva los saltos de línea (descripción, horario, recomendaciones): a lo sumo una línea en blanco.
export function planoLineas(t, max = 2000) {
  if (typeof t !== 'string') return '';
  return t.replace(/\r\n?/g, '\n').replace(CONTROL, ' ').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
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

// Fuente de un sitio: el título siempre; el enlace solo si es https: sin usuario, clave ni puerto (se abre afuera).
export function urlFuente(u) {
  if (typeof u !== 'string' || u.length > 500) return '';
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port ? url.href : '';
  } catch {
    return '';
  }
}

const numero = (v, min, max) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null);
const ORIGENES = new Set(['commons', 'interos', 'propia']);

export function normalizarFoto(f, urlApi) {
  if (!f || typeof f !== 'object') return null;
  const url = urlFoto(f.url, urlApi);
  if (!url) return null;
  const c = f.credito && typeof f.credito === 'object' ? f.credito : f; // también la forma plana de antes
  const origen = ORIGENES.has(c.origen) ? c.origen : f.propia === true ? 'interos' : 'commons';
  const autor = plano(c.autor, 120);
  const licencia = plano(c.licencia, 60);
  let texto = plano(c.texto, 240);
  if (!texto) {
    if (autor) texto = `Foto: ${[autor, licencia].filter(Boolean).join(' · ')}`;
    else if (origen === 'interos') texto = 'Foto: interOS';
  }
  if (!texto) return null; // sin crédito, la foto no se muestra
  return {
    url,
    texto,
    autor,
    licencia,
    licenciaUrl: urlSegura(c.licenciaUrl, DOMINIOS_CREDITO),
    pagina: urlSegura(c.pagina, DOMINIOS_CREDITO),
    origen,
    ancho: numero(f.ancho, 1, 10000),
    alto: numero(f.alto, 1, 10000),
  };
}

// El crédito que va siempre junto a la foto: «Foto: DnTrotaMundos ☮ · CC BY 3.0 · Wikimedia Commons», «Foto: interOS».
export const textoCredito = (f) => f?.texto || '';

function municipioDe(m, id) {
  if (m && typeof m === 'object') return { id: ID.test(String(m.id || '')) ? m.id : idMunicipio(m.nombre), nombre: plano(m.nombre, 60) };
  const nombre = plano(m, 60);
  return { id: ID.test(String(id || '')) ? id : idMunicipio(nombre), nombre };
}

export function normalizarSitio(s, urlApi) {
  if (!s || typeof s !== 'object' || !ID.test(String(s.id || ''))) return null;
  const lat = numero(s.lat, -5, 14);
  const lng = numero(s.lng, -82, -66);
  const nombre = plano(s.nombre, 120);
  if (lat === null || lng === null || !nombre) return null;
  const entrada = ['gratis', 'con_costo'].includes(s.entrada) ? s.entrada : 'desconocido';
  const mun = municipioDe(s.municipio, s.municipioId);
  return {
    id: s.id,
    nombre,
    municipio: mun.nombre,
    municipioId: mun.id,
    categoria: Object.hasOwn(CATEGORIAS_QH, s.categoria) ? s.categoria : 'otro',
    resumen: plano(s.resumen, 300),
    descripcion: planoLineas(s.descripcion, 2000),
    lat,
    lng,
    aproximado: s.precision === 'aproximada',
    direccion: plano(s.direccion, 200),
    horario: planoLineas(s.horario, 400),
    entrada,
    valorEntrada: entrada === 'con_costo' ? numero(s.valorEntrada, 1, 10000000) : null,
    recomendaciones: planoLineas(s.recomendaciones, 800),
    fuentes: (Array.isArray(s.fuentes) ? s.fuentes : []).slice(0, 10)
      .map((x) => ({ titulo: plano(x?.titulo, 160), url: urlFuente(x?.url) })).filter((x) => x.titulo),
    fotos: (Array.isArray(s.fotos) ? s.fotos : []).slice(0, 8).map((f) => normalizarFoto(f, urlApi)).filter(Boolean),
  };
}

// paradas: [{ orden, sitio }] (contrato) o ids de sitios ya cargados (mapa).
export function normalizarPlan(p, urlApi, mapa = new Map()) {
  if (!p || typeof p !== 'object' || !ID.test(String(p.id || ''))) return null;
  const titulo = plano(p.titulo, 140);
  const lista = Array.isArray(p.paradas) ? [...p.paradas] : [];
  if (lista.every((x) => x && typeof x === 'object' && Number.isFinite(x.orden))) lista.sort((a, b) => a.orden - b.orden);
  const paradas = lista.slice(0, 4).map((x) => {
    if (typeof x === 'string') return mapa.get(x) || null;
    return normalizarSitio(x?.sitio, urlApi);
  });
  if (!titulo || paradas.length < 2 || paradas.some((x) => !x)) return null; // con una parada sin publicar, el plan no sale
  return {
    id: p.id,
    titulo,
    resumen: plano(p.resumen, 300),
    municipios: (Array.isArray(p.municipios) ? p.municipios : []).map((m) => municipioDe(m).nombre).filter(Boolean).slice(0, 4),
    duracion: plano(p.duracion, 40),
    recomendaciones: planoLineas(p.recomendaciones, 800),
    paradas,
  };
}

// «Entrada gratis», «Entrada: $5.000», «Entrada con costo», «Entrada: consulta antes de ir».
export function textoEntrada(s, pesos = (v) => `$${Math.round(v).toLocaleString('es-CO')}`) {
  if (s.entrada === 'gratis') return 'Entrada gratis';
  if (s.entrada === 'con_costo') return typeof s.valorEntrada === 'number' ? `Entrada: ${pesos(s.valorEntrada)}` : 'Entrada con costo';
  return 'Entrada: consulta antes de ir';
}

// Consulta para la API: cerca de { lat, lng } (2 decimales: la posición no viaja exacta) o de un municipio (id).
export function consulta({ cerca = null, municipio = '', radioKm = RADIO_KM } = {}) {
  const q = new URLSearchParams();
  if (cerca && Number.isFinite(cerca.lat) && Number.isFinite(cerca.lng)) {
    q.set('lat', cerca.lat.toFixed(2));
    q.set('lng', cerca.lng.toFixed(2));
    q.set('radioKm', String(Math.max(1, Math.min(40, Math.round(radioKm)))));
  } else if (ID.test(String(municipio || ''))) {
    q.set('municipio', municipio);
  }
  return q.toString();
}

// Ordena por distancia a «desde» y le pone km a cada uno (línea recta, desde la posición exacta del celular).
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
    // El id del municipio de la cooperativa en la API: su nombre si está en la lista; si no, el más cercano a su centro
    // (a 25 km o menos). Sin la lista (servidor anterior, sin red): el id armado con el nombre.
    async municipio(nombre, centro = null) {
      const propio = idMunicipio(nombre);
      let lista;
      try {
        lista = (await json('que-hacer/municipios'))?.municipios;
      } catch {
        return propio;
      }
      if (!Array.isArray(lista)) return propio;
      const ms = lista.filter((m) => m && ID.test(String(m.id || '')));
      if (ms.some((m) => m.id === propio)) return propio;
      if (centro && Number.isFinite(centro.lat)) {
        const cerca = ms.filter((m) => Number.isFinite(m.centro?.lat) && Number.isFinite(m.centro?.lng))
          .map((m) => ({ id: m.id, km: distanciaKm(centro, m.centro) })).sort((a, b) => a.km - b.km)[0];
        if (cerca && cerca.km <= 25) return cerca.id;
      }
      return propio;
    },
    // → { sitios, planes } normalizados. opciones: { cerca: { lat, lng } } o { municipio: <id> }.
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
      const vistos = new Set();
      const sitios = sitiosDe(ds?.sitios).filter((s) => !vistos.has(s.id) && vistos.add(s.id));
      const mapa = new Map(sitios.map((s) => [s.id, s]));
      const planes = (Array.isArray(dp?.planes) ? dp.planes : []).slice(0, 100).map((p) => normalizarPlan(p, urlApi, mapa)).filter(Boolean);
      return { sitios, planes };
    },
    olvidar: () => cache.clear(),
  };
}
