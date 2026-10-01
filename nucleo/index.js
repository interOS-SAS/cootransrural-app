// Punto de entrada del núcleo compartido por los tres diseños.
// Cada diseño importa desde aquí: import * as N from '../../nucleo/index.js';
export * from './config.js';
export * from './datos.js';
export * from './util.js';
export * from './tarifas.js';
export * from './geo.js';
export * from './qr.js';
export * from './avisos.js';
export * from './pwa.js';
export { crearMapa, cargarLeaflet, svgTaxi } from './mapa.js';
export { crearPasajero, FASES } from './pasajero.js';
export { crearConductor } from './conductor.js';
export { Bus, salaActual, cambiarSala, enVivoActivo, activarEnVivo } from './bus.js';
export * as perfil from './perfil.js';
