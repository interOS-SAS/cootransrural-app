// Datos de la demo. Lo propio de cada cooperativa (lugares reales tomados de
// OpenStreetMap, rutas y tarifas de EJEMPLO, conductores ficticios) viene de su
// ficha (empresas/<id>/ficha.json); aquí queda lo común a todas.
import { FICHA } from './config.js';
import { tablasTarifa } from './tarifador.js';

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

// Lugares frecuentes del municipio y lo que usa el cálculo de la tarifa, de la ficha. Lo arma
// tarifador.js (el único cálculo, §5.5 del diseño del panel) y son los mismos objetos que usa
// nucleo/tarifas.js:
//   · TARIFAS: las de la ficha, completadas con valores de EJEMPLO (nunca NaN). Son de ejemplo salvo
//     que la ficha diga «ejemplo: false» y traiga la fuente (p. ej. Cootransrural: Decreto 05 de 2026);
//   · RUTAS con tarifa fija a otros municipios;
//   · DESTINOS_TARIFA: tabla oficial de precios cerrados «De <pueblo> Centro a…» (zona, sector,
//     destino, valor y, si se pudo ubicar, lat/lng con su «precision»: exacta, aproximada, vereda o
//     sin_ubicar);
//   · CASCO_URBANO: lista de anillos [[lat, lng], …] (límite de OSM). Sin él, no hay tabla por zonas.
export const { LUGARES, TARIFAS, RUTAS, DESTINOS_TARIFA, CASCO_URBANO } = tablasTarifa(FICHA);

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
