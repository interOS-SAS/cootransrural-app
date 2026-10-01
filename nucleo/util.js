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

// Hora y día de la semana en Bogotá, sin depender de la zona del equipo.
export function horaBogota(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, weekday: 'short', timeZone: 'America/Bogota' }).formatToParts(new Date(fecha));
  const hora = Number(partes.find((p) => p.type === 'hour').value) % 24;
  const dia = partes.find((p) => p.type === 'weekday').value;
  return { hora, domingo: dia === 'Sun' };
}

export function saludo(fecha = new Date()) {
  const { hora } = horaBogota(fecha);
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

// Enlace de WhatsApp con texto.
export function enlaceWhatsApp(numero, texto) {
  const n = String(numero || '').replace(/\D/g, '');
  const base = n ? `https://wa.me/${n.startsWith('57') ? n : '57' + n}` : 'https://wa.me/';
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export function enlaceMapa(p) {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}

export function enlaceNavegacion(p, app = 'google') {
  if (app === 'waze') return `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`;
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
}
