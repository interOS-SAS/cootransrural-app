// Utilidades sin dependencias: dinero, distancias, tiempos, eventos.

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

export function pesos(valor) {
  // «$ 12.000» → «$12.000» (sin el espacio duro que mete Intl).
  return FORMATO_PESOS.format(Math.round(valor || 0)).replace(/\s/g, '');
}

export function redondear(valor, paso = 500) {
  return Math.round(valor / paso) * paso;
}

export function uid(prefijo = '') {
  const azar = crypto.getRandomValues(new Uint32Array(2));
  return prefijo + Date.now().toString(36) + azar[0].toString(36) + azar[1].toString(36).slice(0, 4);
}

export function codigoNumerico(digitos = 4) {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10 ** digitos;
  return String(n).padStart(digitos, '0');
}

// Hash corto (FNV-1a) para verificar el código de abordaje sin enviarlo.
export function hashCorto(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function antirrebote(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Distancia en km entre dos puntos {lat, lng}.
export function distanciaKm(a, b) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ---------------- Polígonos: casco urbano y zona de servicio ----------------
 * Un anillo es [[lat, lng], …] (al menos 3 puntos; no hace falta repetir el primero al final).
 * Los usan tarifador.js (casco urbano) y la zona de servicio (§5.7 del diseño del panel). El
 * servidor tiene su copia fijada de este archivo: la misma cuenta en la app y en la central. */

// ¿p está dentro del anillo? (regla par-impar)
export function dentroDeAnillo(p, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [yi, xi] = anillo[i];
    const [yj, xj] = anillo[j];
    if ((yi > p.lat) !== (yj > p.lat) && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Distancia (km) de p al borde de un anillo, en un plano local (vale para unas decenas de km).
export function distanciaAlBordeKm(p, anillo) {
  const kx = 111.32 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110.57;
  let min = Infinity;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const ax = (anillo[j][1] - p.lng) * kx;
    const ay = (anillo[j][0] - p.lat) * ky;
    const bx = (anillo[i][1] - p.lng) * kx;
    const by = (anillo[i][0] - p.lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l)) : 0;
    min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return min;
}

const esCoordenada = (c) => Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])
  && Math.abs(c[0]) <= 90 && Math.abs(c[1]) <= 180;
const esAnillo = (a) => Array.isArray(a) && a.length >= 3 && a.every(esCoordenada);

// Los anillos válidos de una zona { poligonos: [anillo, …] } (o la lista de anillos sola). Un polígono
// con huecos ([exterior, hueco, …]) cuenta por su borde exterior. Lo que no tenga forma se ignora.
export function anillosDeZona(zona) {
  const lista = Array.isArray(zona) ? zona : zona && typeof zona === 'object' ? zona.poligonos : null;
  if (!Array.isArray(lista)) return [];
  const anillos = [];
  for (const x of lista.slice(0, 50)) {
    if (esAnillo(x)) anillos.push(x);
    else if (Array.isArray(x) && esAnillo(x[0])) anillos.push(x[0]);
  }
  return anillos;
}

// Zona de servicio (§5.7): ¿el punto está dentro y a qué distancia del borde? → { dentro, km, metros }
// (km: distancia al borde más cercano, adentro o afuera; metros: la misma, en metros enteros) o null si la
// zona no tiene polígonos válidos o el punto no es un punto. Sin zona no se revisa nada (las 76 demos).
// La central decide igual (src/zona.js del servidor: dentro; afuera, avisa hasta avisarHastaKm con km sin
// redondear; más lejos, fuera_de_zona).
export function dentroDeZona(zona, punto) {
  const anillos = anillosDeZona(zona);
  const lat = Number(punto?.lat);
  const lng = Number(punto?.lng);
  if (!anillos.length || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const p = { lat, lng };
  const dentro = anillos.some((a) => dentroDeAnillo(p, a));
  let km = Infinity;
  for (const a of anillos) km = Math.min(km, distanciaAlBordeKm(p, a));
  return { dentro, km, metros: Math.round(km * 1000) };
}

// Rumbo en grados (0 = norte, 90 = oriente) de a hacia b.
export function rumbo(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lng - a.lng) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// Punto a una distancia (km) y rumbo (grados) desde un origen.
export function desplazar(p, km, grados) {
  const rad = Math.PI / 180;
  const d = km / 6371;
  const th = grados * rad;
  const lat1 = p.lat * rad;
  const lng1 = p.lng * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(th));
  const lng2 = lng1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: lat2 / rad, lng: lng2 / rad };
}

// Longitud acumulada (km) de una polilínea [[lat, lng], ...].
export function longitudes(coords) {
  const acum = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
    const b = { lat: coords[i][0], lng: coords[i][1] };
    acum.push(acum[i - 1] + distanciaKm(a, b));
  }
  return acum;
}

// Punto de la polilínea a una fracción (0..1) del recorrido, con su rumbo.
export function puntoEnRuta(coords, acum, fraccion) {
  const total = acum[acum.length - 1] || 0;
  if (coords.length === 0) return null;
  if (coords.length === 1 || total === 0) return { lat: coords[0][0], lng: coords[0][1], rumbo: 0 };
  const objetivo = Math.min(Math.max(fraccion, 0), 1) * total;
  let i = 1;
  while (i < acum.length - 1 && acum[i] < objetivo) i++;
  const tramo = acum[i] - acum[i - 1] || 1e-9;
  const t = (objetivo - acum[i - 1]) / tramo;
  const a = { lat: coords[i - 1][0], lng: coords[i - 1][1] };
  const b = { lat: coords[i][0], lng: coords[i][1] };
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, rumbo: rumbo(a, b) };
}

export function minutosTexto(min) {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

export function kmTexto(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

const FORMATO_HORA = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Bogota' });
const FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'America/Bogota' });

export function horaTexto(fecha) {
  return FORMATO_HORA.format(new Date(fecha));
}

export function fechaTexto(fecha) {
  return FORMATO_FECHA.format(new Date(fecha));
}

// Hora, día de la semana y fecha en Bogotá, sin depender de la zona del equipo. festivo: el día es
// festivo en Colombia (esFestivo, abajo). fecha: «aaaa-mm-dd» del día en Bogotá.
const FORMATO_BOGOTA = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric', hour12: false, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota',
});
export function horaBogota(fecha = new Date()) {
  const partes = FORMATO_BOGOTA.formatToParts(new Date(fecha));
  const parte = (tipo) => partes.find((p) => p.type === tipo)?.value;
  const hora = Number(parte('hour')) % 24;
  const dia = parte('weekday');
  const ymd = `${parte('year')}-${parte('month')}-${parte('day')}`;
  return { hora, domingo: dia === 'Sun', festivo: festivosDe(Number(parte('year'))).has(ymd), fecha: ymd };
}

/* ---------------- Festivos de Colombia (Ley 51 de 1983) ----------------
 * §5.6 del diseño del panel. Fijos: 1-ene, 1-may, 20-jul, 7-ago, 8-dic y 25-dic. Se pasan al lunes
 * siguiente (si no caen en lunes): 6-ene, 19-mar, 29-jun, 15-ago, 12-oct, 1-nov y 11-nov. Según la
 * Pascua: Jueves y Viernes Santo, y en lunes la Ascensión (+43), Corpus Christi (+64) y el Sagrado
 * Corazón (+71). 2026: 1-ene, 12-ene, 23-mar, 2-abr, 3-abr, 1-may, 18-may, 8-jun, 15-jun, 29-jun,
 * 20-jul, 7-ago, 17-ago, 12-oct, 2-nov, 16-nov, 8-dic y 25-dic. */
const FESTIVOS = new Map(); // año → Set('aaaa-mm-dd')
const DIA_MS = 86400000;
const ymdUTC = (t) => new Date(t).toISOString().slice(0, 10);

// Domingo de Pascua (calendario gregoriano, algoritmo de Meeus/Jones/Butcher), en ms UTC.
function pascua(anio) {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(anio, mes - 1, dia);
}

// Si el día no es lunes, el lunes siguiente.
const alLunes = (t) => t + (((8 - new Date(t).getUTCDay()) % 7) * DIA_MS);

// Los festivos de un año como 'aaaa-mm-dd' (Set; vacío para un año fuera de 1984 a 2200).
export function festivosDe(anio) {
  if (!Number.isInteger(anio) || anio < 1984 || anio > 2200) return new Set();
  let f = FESTIVOS.get(anio);
  if (f) return f;
  const dia = (mes, d) => Date.UTC(anio, mes - 1, d);
  const p = pascua(anio);
  f = new Set([
    dia(1, 1), dia(5, 1), dia(7, 20), dia(8, 7), dia(12, 8), dia(12, 25),
    ...[[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([mes, d]) => alLunes(dia(mes, d))),
    p - 3 * DIA_MS, p - 2 * DIA_MS, p + 43 * DIA_MS, p + 64 * DIA_MS, p + 71 * DIA_MS,
  ].map(ymdUTC));
  FESTIVOS.set(anio, f);
  return f;
}

// ¿La fecha (Date, ms o texto que entienda Date) cae en un festivo de Colombia, según el día en Bogotá?
export function esFestivo(fecha = new Date()) {
  return horaBogota(fecha).festivo;
}

export function saludo(fecha = new Date()) {
  const { hora } = horaBogota(fecha);
  if (hora < 5) return 'Buenas noches';
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export function iniciales(nombre = '') {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export function primerNombre(nombre = '') {
  return nombre.trim().split(/\s+/)[0] || '';
}

export function escaparHTML(texto = '') {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Emisor de eventos mínimo.
export class Emisor {
  #oyentes = new Map();
  on(evento, fn) {
    if (!this.#oyentes.has(evento)) this.#oyentes.set(evento, new Set());
    this.#oyentes.get(evento).add(fn);
    return () => this.off(evento, fn);
  }
  off(evento, fn) {
    this.#oyentes.get(evento)?.delete(fn);
  }
  emit(evento, datos) {
    for (const fn of [...(this.#oyentes.get(evento) || [])]) {
      try {
        fn(datos);
      } catch (e) {
        console.error(`[${evento}]`, e);
      }
    }
  }
}

// Teléfonos de los conductores de ejemplo (300 000 0xxx): en la demo no se marcan,
// porque tienen formato de celular real y le sonarían a un desconocido.
export function esTelDemo(numero) {
  return /^(57)?3000000\d{3}$/.test(String(numero || '').replace(/\D/g, ''));
}

export const AVISO_LLAMADA_DEMO = {
  titulo: 'En la demostración no se llama al conductor',
  cuerpo: 'Con la app real, este botón llama o escribe por WhatsApp al conductor que te recoge.',
  tipo: 'info',
};

// Enlace de WhatsApp con texto.
export function enlaceWhatsApp(numero, texto) {
  const n = String(numero || '').replace(/\D/g, '');
  const base = n ? `https://wa.me/${n.startsWith('57') ? n : '57' + n}` : 'https://wa.me/';
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

// Las coordenadas pueden llegar del servidor: en el enlace solo van como números.
const coordenadas = (p) => `${Number(p?.lat)},${Number(p?.lng)}`;

export function enlaceMapa(p) {
  return `https://www.google.com/maps/search/?api=1&query=${coordenadas(p)}`;
}

export function enlaceNavegacion(p, app = 'google') {
  if (app === 'waze') return `https://waze.com/ul?ll=${coordenadas(p)}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${coordenadas(p)}&travelmode=driving`;
}
