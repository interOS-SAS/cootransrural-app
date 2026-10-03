// Tarifas de la cooperativa de la página. El cálculo vive en tarifador.js (puro, el único: §5.5 del
// diseño del panel); aquí solo se ata a la ficha que cargó config.js, para que las apps y la web
// sigan importando lo mismo de siempre (N.calcularTarifa, N.TARIFAS_OFICIALES…).
// TARIFAS, RUTAS, LUGARES, DESTINOS_TARIFA y CASCO_URBANO se exportan desde datos.js (los mismos
// objetos): no se repiten aquí para que nucleo/index.js no los exporte dos veces.
import { FICHA } from './config.js';
import { crearTarifador } from './tarifador.js';

const T = crearTarifador(FICHA);

// ¿Esta cooperativa tiene tabla oficial de precios? De dónde salen ({ acto, entidad, fecha, url, pdf },
// con enlaces solo https: de *.gov.co, S30) y desde dónde rigen («El Rosal Centro»).
export const { TARIFAS_OFICIALES, FUENTE_TARIFAS, ORIGEN_OFICIAL } = T;
export const {
  enCascoUrbano, destinoOficial, zonasTarifa, buscarTarifas, textoPrecision, lugarDeTarifa,
  etiquetaTarifa, rutaFija, calcularTarifa, progresoFidelidad, aplicaDescuentoProgramado,
} = T;
