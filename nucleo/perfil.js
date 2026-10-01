// Datos guardados en el celular (localStorage). En la demo no hay servidor:
// el registro, el historial y los ajustes viven solo en este navegador.
import { uid } from './util.js';
import { CONDUCTORES_DEMO } from './datos.js';

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function guardar(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
  return valor;
}

/* ---------------- Pasajero ---------------- */

export function pasajero() {
  return leer('ct.pasajero', null);
}

// Registro del pasajero. Campos: nombre, celular, correo?, contactoEmergencia?
export function registrarPasajero(datos) {
  const actual = pasajero();
  return guardar('ct.pasajero', {
    id: actual?.id || uid('p'),
    creado: actual?.creado || Date.now(),
    calificacion: actual?.calificacion || 5,
    ...actual,
    ...datos,
    nombre: String(datos.nombre ?? actual?.nombre ?? '').trim(),
    celular: String(datos.celular ?? actual?.celular ?? '').replace(/\D/g, '').slice(-10),
  });
}

export function cerrarSesionPasajero() {
  localStorage.removeItem('ct.pasajero');
}

export function lugaresGuardados() {
  return leer('ct.lugares', { casa: null, trabajo: null, otros: [] });
}

export function guardarLugar(tipo, lugar) {
  const l = lugaresGuardados();
  if (tipo === 'casa' || tipo === 'trabajo') l[tipo] = lugar;
  else l.otros = [lugar, ...l.otros.filter((o) => o.titulo !== lugar.titulo)].slice(0, 6);
  return guardar('ct.lugares', l);
}

export function recientes() {
  return leer('ct.recientes', []);
}

export function agregarReciente(lugar) {
  const r = recientes().filter((x) => !(Math.abs(x.lat - lugar.lat) < 1e-4 && Math.abs(x.lng - lugar.lng) < 1e-4));
  return guardar('ct.recientes', [{ titulo: lugar.titulo, detalle: lugar.detalle || '', lat: lugar.lat, lng: lugar.lng }, ...r].slice(0, 8));
}

export function historialPasajero() {
  return leer('ct.historial.pasajero', []);
}

export function agregarAlHistorialPasajero(viaje) {
  return guardar('ct.historial.pasajero', [viaje, ...historialPasajero().filter((v) => v.id !== viaje.id)].slice(0, 50));
}

export function viajesCompletadosPasajero() {
  return historialPasajero().filter((v) => v.estado === 'finalizado').length;
}

export function viajesProgramados() {
  return leer('ct.programados', []).filter((v) => v.fecha > Date.now() - 3600 * 1000);
}

export function guardarProgramado(viaje) {
  return guardar('ct.programados', [...viajesProgramados().filter((v) => v.id !== viaje.id), viaje].sort((a, b) => a.fecha - b.fecha));
}

export function quitarProgramado(id) {
  return guardar('ct.programados', viajesProgramados().filter((v) => v.id !== id));
}

/* ---------------- Conductor ---------------- */

export function conductor() {
  return leer('ct.conductor', null);
}

// Ingreso del conductor con su número de móvil. En la demo cualquier PIN de 4
// dígitos sirve; si el móvil es de la lista demo se toman esos datos.
export function ingresarConductor({ movil, nombre, placa, pin }) {
  const m = String(movil || '').replace(/\D/g, '').padStart(3, '0').slice(-3);
  const base = CONDUCTORES_DEMO.find((c) => c.movil === m);
  const actual = conductor();
  return guardar('ct.conductor', {
    id: actual?.movil === m ? actual.id : uid('c'),
    movil: m,
    nombre: (nombre || base?.nombre || `Conductor móvil ${m}`).trim(),
    placa: (placa || base?.placa || `VAK ${600 + (Number(m) % 100)}`).toUpperCase(),
    vehiculo: base?.vehiculo || 'Kia Picanto',
    color: base?.color || 'Amarillo',
    calificacion: base?.calificacion || 4.8,
    viajes: base?.viajes || 0,
    desde: base?.desde || new Date().getFullYear(),
    tel: base?.tel || '',
    pinDemo: Boolean(pin),
    documentos: {
      soat: { vence: '2027-03-15' },
      tecnomecanica: { vence: '2027-01-20' },
      licencia: { vence: '2029-08-02' },
      tarjetaControl: { vence: '2026-12-31' },
    },
  });
}

export function actualizarConductor(cambios) {
  const c = conductor();
  return c ? guardar('ct.conductor', { ...c, ...cambios }) : null;
}

export function cerrarSesionConductor() {
  localStorage.removeItem('ct.conductor');
}

export function historialConductor() {
  return leer('ct.historial.conductor', []);
}

export function agregarAlHistorialConductor(viaje) {
  return guardar('ct.historial.conductor', [viaje, ...historialConductor().filter((v) => v.id !== viaje.id)].slice(0, 100));
}

// Resumen del día para el conductor.
export function resumenDelDia(ahora = new Date()) {
  const inicio = new Date(ahora);
  inicio.setHours(0, 0, 0, 0);
  const hoy = historialConductor().filter((v) => v.fin >= inicio.getTime() && v.estado === 'finalizado');
  const ganado = hoy.reduce((s, v) => s + (v.valor || 0), 0);
  const conCalificacion = hoy.filter((v) => v.calificacionRecibida);
  const promedio = conCalificacion.length ? conCalificacion.reduce((s, v) => s + v.calificacionRecibida, 0) / conCalificacion.length : null;
  const porQR = hoy.filter((v) => v.metodoPago === 'qr').reduce((s, v) => s + (v.valor || 0), 0);
  return { viajes: hoy.length, ganado, porQR, efectivo: ganado - porQR, promedio, km: hoy.reduce((s, v) => s + (v.km || 0), 0) };
}

/* ---------------- Ajustes ---------------- */

export function ajustes() {
  return leer('ct.ajustes', { simulacion: 'auto', sonido: true });
}

// simulacion: 'auto' (si nadie acepta, acepta un conductor de prueba) o 'real'
export function guardarAjustes(cambios) {
  const a = guardar('ct.ajustes', { ...ajustes(), ...cambios });
  localStorage.setItem('ct.sonido', a.sonido === false ? 'no' : 'si');
  return a;
}

export function disenoElegido() {
  const p = new URLSearchParams(location.search).get('d');
  if (p && /^[abc]$/.test(p)) return p;
  return localStorage.getItem('ct.diseno') || 'a';
}

export function elegirDiseno(d) {
  if (/^[abc]$/.test(d)) localStorage.setItem('ct.diseno', d);
}

// Móvil del sticker por el que llegó el pasajero (para medir qué taxis atraen
// más usuarios cuando haya servidor).
export function referido() {
  return localStorage.getItem('ct.referido') || '';
}

export function guardarReferido(movil) {
  if (movil && !referido()) localStorage.setItem('ct.referido', movil);
}
