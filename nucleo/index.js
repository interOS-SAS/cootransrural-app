// Punto de entrada del núcleo compartido por los tres diseños.
// Cada diseño importa desde aquí: import * as N from '../../nucleo/index.js';
export * from './config.js';
export * from './datos.js';
export * from './util.js';
// Enlaces seguros (S30): urlSegura, urlDecreto, urlInterna, enlaceTel, enlaceCorreo y hrefSeguro.
export * from './enlaces.js';
export * from './tarifas.js';
export * from './geo.js';
export * from './qr.js';
export * from './avisos.js';
export * from './pwa.js';
export { crearMapa, cargarLeaflet, svgTaxi } from './mapa.js';
export { crearPasajero, FASES } from './pasajero.js';
export { crearConductor } from './conductor.js';
export { Bus, BusServidor, crearBus, salaActual, cambiarSala, enVivoActivo, activarEnVivo } from './bus.js';
export * as perfil from './perfil.js';
// Modo real: banderas y GPS (ES_NATIVA, MODO_REAL, URL_API, URL_BUS, posicion, seguir),
// el cliente del servidor como N.servidor.* y, a mano, el texto de los errores.
export * from './plataforma.js';
export * as servidor from './servidor.js';
export { textoError, ErrorServidor } from './servidor.js';
// App nativa 1.2: notificaciones push y Face ID / huella como N.nativo.* (sin los plugins, no hace nada).
export * as nativo from './nativo.js';
// Pago con QR o llave del conductor (servidor 0.10.0) como N.cobro.*: validación, lectura del QR de una imagen y la API.
export * as cobro from './cobro.js';
// Reglas del despacho de la cooperativa (las manda la central en la bienvenida) y los mensajes nuevos del bus.
export * as reglas from './reglas.js';
// Fase 3 del panel: lo que hace la central desde su mapa (sacar de turno, cancelar, ofrecer) y sus textos.
export * from './central.js';
// Versión vigente de la política de privacidad (la escribe herramientas/generar-empresas.py): la tarjeta de las apps.
export { POLITICA } from './politica.js';
// «Lejos de toda cooperativa» (9-oct): distancia a las cooperativas reales, formulario de interesados y la demostración.
export * as lejos from './lejos.js';
