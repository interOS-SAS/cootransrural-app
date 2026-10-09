// Datos guardados en el celular (localStorage). En la demo no hay servidor:
// el registro, el historial y los ajustes viven solo en este navegador.
// En MODO_REAL la cuenta vive en el servidor (taxicun.com/api): aquí queda una copia
// de lo que dijo el servidor, con otro prefijo para no mezclarse con la demo.
import { uid } from './util.js';
import { CONDUCTORES_DEMO } from './datos.js';
import { ID_EMPRESA, EMPRESA, FICHA } from './config.js';
import { MODO_REAL } from './plataforma.js';
import { vaciarCacheRutas } from './geo.js';

// Cada cooperativa guarda lo suyo aparte (mismo sitio, varias cooperativas).
// Cootransrural conserva las claves de siempre. El modo real usa «tc.real.<id>.».
const PREFIJO_REAL = 'tc.real.';
const PREFIJO = MODO_REAL ? `${PREFIJO_REAL}${ID_EMPRESA}.` : ID_EMPRESA === 'cootransrural' ? 'ct.' : `ct.${ID_EMPRESA}.`;
const k = (nombre) => PREFIJO + nombre;

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
  return leer(k('pasajero'), null);
}

// Registro del pasajero. Campos: nombre, celular, correo?, contactoEmergencia?
export function registrarPasajero(datos) {
  const actual = pasajero();
  return guardar(k('pasajero'), {
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
  localStorage.removeItem(k('pasajero'));
}

/* ---- Modo real: lo que dice el servidor ---- */

// Copia local del usuario del servidor (GET /api/yo, PATCH /api/yo): nombre, celular y
// correo. El contacto de emergencia es solo de este teléfono y se conserva, salvo que
// sea otra cuenta (otro correo).
export function fijarPasajeroServidor(usuario = {}) {
  fijarDueno(usuario.correo);
  const antes = pasajero();
  const otraCuenta = Boolean(antes?.correo && usuario.correo && antes.correo !== usuario.correo);
  const actual = otraCuenta ? null : antes;
  const datos = {
    ...(actual || {}),
    id: actual?.id || null, // el seudónimo p_… llega con la bienvenida (fijarIdPasajero)
    creado: actual?.creado || Date.now(),
    nombre: String(usuario.nombre ?? actual?.nombre ?? '').trim(),
    celular: String(usuario.celular ?? actual?.celular ?? '').replace(/\D/g, '').slice(-10),
    correo: String(usuario.correo ?? actual?.correo ?? '').trim(),
    verificado: true,
  };
  if (actual?.contactoEmergencia) datos.contactoEmergencia = actual.contactoEmergencia;
  return guardar(k('pasajero'), datos);
}

// El id del pasajero en el tiempo real es el de la bienvenida (p_…).
export function fijarIdPasajero(id) {
  if (!id) return pasajero();
  return guardar(k('pasajero'), { ...(pasajero() || {}), id });
}

export function lugaresGuardados() {
  return leer(k('lugares'), { casa: null, trabajo: null, otros: [] });
}

export function guardarLugar(tipo, lugar) {
  const l = lugaresGuardados();
  if (tipo === 'casa' || tipo === 'trabajo') l[tipo] = lugar;
  else l.otros = [lugar, ...l.otros.filter((o) => o.titulo !== lugar.titulo)].slice(0, 6);
  return guardar(k('lugares'), l);
}

export function recientes() {
  return leer(k('recientes'), []);
}

export function agregarReciente(lugar) {
  const r = recientes().filter((x) => !(Math.abs(x.lat - lugar.lat) < 1e-4 && Math.abs(x.lng - lugar.lng) < 1e-4));
  // idTarifa: destino de la tabla oficial de tarifas (así conserva su precio oficial).
  return guardar(k('recientes'), [{ titulo: lugar.titulo, detalle: lugar.detalle || '', lat: lugar.lat, lng: lugar.lng, ...(lugar.idTarifa ? { idTarifa: lugar.idTarifa } : {}) }, ...r].slice(0, 8));
}

export function historialPasajero() {
  return leer(k('historial.pasajero'), []);
}

export function agregarAlHistorialPasajero(viaje) {
  return guardar(k('historial.pasajero'), [viaje, ...historialPasajero().filter((v) => v.id !== viaje.id)].slice(0, 50));
}

export function viajesCompletadosPasajero() {
  return historialPasajero().filter((v) => v.estado === 'finalizado').length;
}

export function viajesProgramados() {
  return leer(k('programados'), []).filter((v) => v.fecha > Date.now() - 3600 * 1000);
}

export function guardarProgramado(viaje) {
  return guardar(k('programados'), [...viajesProgramados().filter((v) => v.id !== viaje.id), viaje].sort((a, b) => a.fecha - b.fecha));
}

export function quitarProgramado(id) {
  return guardar(k('programados'), viajesProgramados().filter((v) => v.id !== id));
}

/* ---------------- Conductor ---------------- */

export function conductor() {
  return leer(k('conductor'), null);
}

// Ingreso del conductor con su número de móvil. En la demo cualquier PIN de 4
// dígitos sirve; si el móvil es de la lista demo se toman esos datos.
export function ingresarConductor({ movil, nombre, placa, pin }) {
  const m = String(movil || '').replace(/\D/g, '').padStart(3, '0').slice(-3);
  const base = CONDUCTORES_DEMO.find((c) => c.movil === m);
  const actual = conductor();
  return guardar(k('conductor'), {
    id: actual?.movil === m ? actual.id : uid('c'),
    movil: m,
    nombre: (nombre || base?.nombre || `Conductor móvil ${m}`).trim(),
    placa: (placa || base?.placa || `${EMPRESA.placaPrefijo || 'TAX'} ${600 + (Number(m) % 100)}`).toUpperCase(),
    vehiculo: base?.vehiculo || EMPRESA.vehiculo || 'Kia Picanto',
    color: base?.color || EMPRESA.colorTaxi || 'Amarillo',
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
  return c ? guardar(k('conductor'), { ...c, ...cambios }) : null;
}

export function cerrarSesionConductor() {
  localStorage.removeItem(k('conductor'));
}

// Modo real: guarda SOLO lo que manda el servidor (bienvenida.conductor o lo que haya de
// GET /api/yo), sin documentos ni calificación inventada. El id (c_…) es el seudónimo del
// tiempo real: con él se reconoce la asignación del servicio. null borra el perfil.
export function fijarConductorServidor(dc) {
  if (!dc) {
    localStorage.removeItem(k('conductor'));
    return null;
  }
  const antes = conductor();
  // Lo anterior solo vale si es del servidor y del mismo conductor.
  const actual = antes?.real && (!dc.id || !antes.id || antes.id === dc.id) ? antes : null;
  const texto = (v, previo) => String(v ?? previo ?? '').trim();
  const datos = {
    id: dc.id || actual?.id || null,
    movil: texto(dc.movil, actual?.movil),
    nombre: texto(dc.nombre, actual?.nombre),
    placa: texto(dc.placa, actual?.placa).toUpperCase(),
    vehiculo: texto(dc.vehiculo, actual?.vehiculo),
    color: texto(dc.color, actual?.color),
    real: true,
  };
  const calificacion = Number.isFinite(dc.calificacion) ? dc.calificacion : actual?.calificacion;
  const viajes = Number.isFinite(dc.viajes) ? dc.viajes : actual?.viajes;
  if (Number.isFinite(calificacion)) datos.calificacion = calificacion;
  if (Number.isFinite(viajes)) datos.viajes = viajes;
  return guardar(k('conductor'), datos);
}

// Borra todo lo del modo real en este teléfono (todas las cooperativas): perfil,
// historial, lugares, ajustes, rutas consultadas y los viajes guardados
// («tc.real.viaje.pasajero» y «tc.real.viaje.conductor»). Para «Eliminar mi cuenta» y
// cuando entra otra cuenta en el mismo celular. La sesión la borra servidor.js.
export function borrarDatosLocales() {
  const claves = [];
  for (let i = 0; i < localStorage.length; i++) {
    const c = localStorage.key(i);
    if (c?.startsWith(PREFIJO_REAL)) claves.push(c);
  }
  for (const c of claves) localStorage.removeItem(c);
  // La cooperativa elegida en TaxiCun (web/taxicun.js) y las rutas que quedaron en memoria.
  localStorage.removeItem('taxicun.real.empresa');
  vaciarCacheRutas();
}

// Modo real: de qué cuenta (correo) es lo guardado en este celular. No se borra al
// cerrar sesión (la misma persona vuelve y encuentra su historial y sus lugares); si
// entra OTRA cuenta, lo de la anterior se borra antes de seguir. Devuelve true si borró.
const CLAVE_DUENO = `${PREFIJO_REAL}dueno`;
export function fijarDueno(correo) {
  const nuevo = String(correo || '').trim().toLowerCase();
  if (!MODO_REAL || !nuevo) return false;
  const antes = localStorage.getItem(CLAVE_DUENO);
  const otra = Boolean(antes) && antes !== nuevo;
  if (otra) borrarDatosLocales();
  if (otra || !antes) {
    try {
      localStorage.setItem(CLAVE_DUENO, nuevo);
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }
  return otra;
}

// Modo real: viajes que este teléfono cerró hace poco (terminados o cancelados aquí).
// Si la central todavía los tiene activos (el cierre salió sin señal, o su viaje_actual
// se armó antes de leer lo que estaba en cola), los controladores le vuelven a mandar el
// cierre en vez de retomarlos o cancelarlos. rol: 'pasajero' | 'conductor'.
// registro: { id, ids?: [otros ids del mismo viaje], final: 'finalizado' | 'cancelado', …lo que haga falta para repetir el cierre }
const CERRADOS_MAX = 20;
const CERRADOS_VIDA_MS = 12 * 3600 * 1000;
const claveCerrados = (rol) => `${PREFIJO_REAL}cerrados.${rol}`;

function viajesCerrados(rol) {
  const ahora = Date.now();
  const lista = leer(claveCerrados(rol), []);
  return Array.isArray(lista) ? lista.filter((c) => c?.id && ahora - (c.cuando || 0) < CERRADOS_VIDA_MS) : [];
}

export function anotarViajeCerrado(rol, registro) {
  if (!MODO_REAL || !registro?.id) return;
  const ids = new Set([registro.id, ...(registro.ids || [])]);
  const lista = viajesCerrados(rol).filter((c) => !ids.has(c.id));
  try {
    guardar(claveCerrados(rol), [{ ...registro, cuando: Date.now() }, ...lista].slice(0, CERRADOS_MAX));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export function viajeCerrado(rol, viajeId) {
  if (!MODO_REAL || !viajeId) return null;
  return viajesCerrados(rol).find((c) => c.id === viajeId || (c.ids || []).includes(viajeId)) || null;
}

export function historialConductor() {
  return leer(k('historial.conductor'), []);
}

export function agregarAlHistorialConductor(viaje) {
  const antes = historialConductor();
  // Modo real: un servicio ya cobrado no pasa a «cancelado» (por ejemplo, si la central
  // lo cerró sin conexión después de que este teléfono lo terminó).
  if (MODO_REAL && viaje.estado === 'cancelado' && antes.some((v) => v.id === viaje.id && v.estado === 'finalizado')) return antes;
  return guardar(k('historial.conductor'), [viaje, ...antes.filter((v) => v.id !== viaje.id)].slice(0, 100));
}

// Resumen del día para el conductor.
export function resumenDelDia(ahora = new Date()) {
  // Medianoche de hoy en Colombia (UTC−5, sin horario de verano).
  const enBogota = new Date(new Date(ahora).getTime() - 5 * 3600 * 1000);
  const inicio = Date.UTC(enBogota.getUTCFullYear(), enBogota.getUTCMonth(), enBogota.getUTCDate()) + 5 * 3600 * 1000;
  const hoy = historialConductor().filter((v) => v.fin >= inicio && v.estado === 'finalizado');
  const ganado = hoy.reduce((s, v) => s + (v.valor || 0), 0);
  const conCalificacion = hoy.filter((v) => v.calificacionRecibida);
  const promedio = conCalificacion.length ? conCalificacion.reduce((s, v) => s + v.calificacionRecibida, 0) / conCalificacion.length : null;
  const porQR = hoy.filter((v) => v.metodoPago === 'qr').reduce((s, v) => s + (v.valor || 0), 0);
  const porTransferencia = hoy.filter((v) => v.metodoPago === 'transferencia').reduce((s, v) => s + (v.valor || 0), 0);
  return { viajes: hoy.length, ganado, porQR, porTransferencia, efectivo: ganado - porQR - porTransferencia, promedio, km: hoy.reduce((s, v) => s + (v.km || 0), 0) };
}

/* ---------------- Ajustes ---------------- */

export function ajustes() {
  const a = leer(k('ajustes'), { simulacion: 'auto', sonido: true });
  // En modo real no hay simulación: ni conductor de prueba ni GPS simulado.
  return MODO_REAL ? { ...a, simulacion: 'real', gpsSimulado: false } : a;
}

// simulacion: 'auto' (si nadie acepta, acepta un conductor de prueba) o 'real'
export function guardarAjustes(cambios) {
  const a = guardar(k('ajustes'), { ...ajustes(), ...cambios });
  localStorage.setItem('ct.sonido', a.sonido === false ? 'no' : 'si');
  return a;
}

// «auto» (Día y noche): la A (Ámbar, clara) de 6 a. m. a 6 p. m. y la C (Neón, oscura)
// de 6 p. m. a 6 a. m., con la hora de Colombia.
export function disenoPorHora(fecha = new Date()) {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(fecha));
  return h >= 18 || h < 6 ? 'c' : 'a';
}

// TaxiCun tiene un solo diseño, el A (Ámbar). Los otros (B, C y «auto», A de día y C
// de noche) solo se abren si la URL los pide (?d=) o si la ficha de la cooperativa
// dice otro. Lo que se haya guardado antes en Ajustes ya no cuenta.
export function disenoPreferido() {
  // El modo real (servidor de verdad) solo existe en el diseño A: ni ?d= ni la ficha lo cambian.
  if (MODO_REAL) return 'a';
  const p = new URLSearchParams(location.search).get('d');
  if (p && /^([abc]|auto)$/.test(p)) return p;
  return /^([abc]|auto)$/.test(FICHA.diseno || '') ? FICHA.diseno : 'a';
}

// El diseño que se abre ahora: el preferido o, en «auto», el de la hora.
export function disenoElegido() {
  const d = disenoPreferido();
  return d === 'auto' ? disenoPorHora() : d;
}

export function elegirDiseno(d) {
  if (/^([abc]|auto)$/.test(d)) localStorage.setItem(k('diseno'), d);
}

// Móvil del sticker por el que llegó el pasajero (para medir qué taxis atraen
// más usuarios cuando haya servidor).
export function referido() {
  return localStorage.getItem(k('referido')) || '';
}

export function guardarReferido(movil) {
  if (movil && !referido()) localStorage.setItem(k('referido'), movil);
}
