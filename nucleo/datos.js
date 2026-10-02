// Datos de la demo. Lo propio de cada cooperativa (lugares reales tomados de
// OpenStreetMap, rutas y tarifas de EJEMPLO, conductores ficticios) viene de su
// ficha (empresas/<id>/ficha.json); aquí queda lo común a todas.
import { FICHA } from './config.js';

export const CATEGORIAS = {
  centro: { nombre: 'Centro', icono: '🏛️' },
  salud: { nombre: 'Salud', icono: '🏥' },
  educacion: { nombre: 'Colegios', icono: '🎓' },
  comercio: { nombre: 'Comercio', icono: '🛒' },
  barrio: { nombre: 'Barrios', icono: '🏘️' },
  vereda: { nombre: 'Veredas', icono: '🌾' },
  comida: { nombre: 'Restaurantes', icono: '🍽️' },
  municipio: { nombre: 'Municipios', icono: '🛣️' },
  bogota: { nombre: 'Bogotá', icono: '✈️' },
  turismo: { nombre: 'Turismo', icono: '⛰️' },
};

// Lugares frecuentes del municipio (de la ficha).
export const LUGARES = FICHA.LUGARES || [];

// Tarifas y rutas con tarifa fija: de EJEMPLO, por cooperativa (ficha), salvo que la ficha
// diga «ejemplo: false» y traiga la fuente (p. ej. Cootransrural: Decreto 05 de 2026).
const TARIFAS_BASE = {
  ejemplo: true, minimaUrbana: 8000, banderazo: 5500, porKm: 1300, redondeo: 500,
  recargoNocturno: 2000, recargoDominical: 1000, nocheDesde: 20, nocheHasta: 6,
  descuentoProgramado: 0.10, horasAnticipacion: 24, viajesFidelidad: 10, descuentoFidelidad: 0.50,
};
// Lo que falte en la ficha se completa con los valores de ejemplo (nunca NaN).
export const TARIFAS = { ...TARIFAS_BASE, ...(FICHA.TARIFAS || {}) };
export const RUTAS = FICHA.RUTAS || [];
// Tabla oficial de precios cerrados «De <pueblo> Centro a…» (zona, sector, destino, valor y,
// si se pudo ubicar, lat/lng con su «precision»: exacta, aproximada, vereda o sin_ubicar).
export const DESTINOS_TARIFA = Array.isArray(FICHA.DESTINOS_TARIFA) ? FICHA.DESTINOS_TARIFA.filter((d) => d && d.destino && Number.isFinite(Number(d.valor))) : [];
// Casco urbano: lista de anillos [[lat, lng], …] (límite de OSM). Sin él, no hay tabla por zonas.
export const CASCO_URBANO = Array.isArray(FICHA.CASCO_URBANO) ? FICHA.CASCO_URBANO.filter((a) => Array.isArray(a) && a.length >= 3) : [];

// Conductores y pasajeros ficticios para la simulación (ficha).
export const CONDUCTORES_DEMO = FICHA.CONDUCTORES_DEMO || [];
export const PASAJEROS_DEMO = FICHA.PASAJEROS_DEMO || [
  { nombre: 'María Fernanda', calificacion: 4.9 },
  { nombre: 'Andrés', calificacion: 4.8 },
  { nombre: 'Doña Rosa', calificacion: 5.0 },
  { nombre: 'Julián', calificacion: 4.7 },
];

export const ETIQUETAS_CALIFICACION = {
  conductor: ['Puntual', 'Amable', 'Conduce seguro', 'Taxi limpio', 'Conoce la ruta', 'Buena música'],
  pasajero: ['Puntual', 'Amable', 'Respetuoso', 'Pago rápido', 'Buena ubicación'],
};

export const MOTIVOS_CANCELACION = {
  pasajero: ['Ya no lo necesito', 'El taxi se demora', 'Pedí por error', 'Conseguí otro transporte'],
  conductor: ['El pasajero no aparece', 'Problema con el vehículo', 'Dirección errada', 'Emergencia'],
};

// Bancos y billeteras que aparecen en la pantalla de pago de PRUEBA.
export const BILLETERAS = [
  { id: 'breb', nombre: 'Bre-B', color: '#0B5FFF' },
  { id: 'nequi', nombre: 'Nequi', color: '#DA0081' },
  { id: 'daviplata', nombre: 'DaviPlata', color: '#E30613' },
  { id: 'bancolombia', nombre: 'Bancolombia', color: '#FDDA24' },
];
