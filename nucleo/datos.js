// Datos de la demo: lugares reales de El Rosal (OpenStreetMap), rutas y tarifas
// de EJEMPLO y conductores ficticios. Las tarifas hay que reemplazarlas por las
// oficiales de la cooperativa antes de salir a producción.

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
};

// Lugares frecuentes. Coordenadas tomadas de OpenStreetMap el 1-oct-2026.
export const LUGARES = [
  { id: 'parque', nombre: 'Parque Principal', detalle: 'Centro, El Rosal', cat: 'centro', lat: 4.85257, lng: -74.260592 },
  { id: 'alcaldia', nombre: 'Alcaldía Municipal', detalle: 'Calle 8, Centro', cat: 'centro', lat: 4.852103, lng: -74.260526 },
  { id: 'oficina', nombre: 'Oficina Cootransrural', detalle: 'Cra. 8 No. 12-38, San Carlos', cat: 'centro', lat: 4.855106, lng: -74.26222 },
  { id: 'policia', nombre: 'Estación de Policía', detalle: 'Centro, El Rosal', cat: 'centro', lat: 4.852989, lng: -74.26089 },
  { id: 'registraduria', nombre: 'Registraduría Municipal', detalle: 'El Rosal', cat: 'centro', lat: 4.853582, lng: -74.26321 },
  { id: 'biblioteca', nombre: 'Biblioteca Municipal', detalle: 'El Rosal', cat: 'centro', lat: 4.853905, lng: -74.262257 },
  { id: 'coliseo', nombre: 'Coliseo Municipal', detalle: 'El Rosal', cat: 'centro', lat: 4.851507, lng: -74.263157 },
  { id: 'parque-familia', nombre: 'Parque La Familia', detalle: 'El Rosal', cat: 'centro', lat: 4.853128, lng: -74.266178 },
  { id: 'cementerio', nombre: 'Cementerio Municipal', detalle: 'El Rosal', cat: 'centro', lat: 4.85222, lng: -74.264075 },
  { id: 'bomberos', nombre: 'Bomberos El Rosal', detalle: 'El Rosal', cat: 'centro', lat: 4.851492, lng: -74.261664 },
  { id: 'puesto-salud', nombre: 'Puesto de Salud', detalle: 'El Rosal', cat: 'salud', lat: 4.853409, lng: -74.261615 },
  { id: 'obando', nombre: 'Colegio José María Obando', detalle: 'El Rosal', cat: 'educacion', lat: 4.852706, lng: -74.26236 },
  { id: 'iedp-obando', nombre: 'IEDP José María Obando', detalle: 'Sede San Carlos', cat: 'educacion', lat: 4.85631, lng: -74.263572 },
  { id: 'liceo', nombre: 'Liceo El Rosal', detalle: 'El Rosal', cat: 'educacion', lat: 4.854711, lng: -74.260859 },
  { id: 'ied-san-jose', nombre: 'IED San José', detalle: 'Vereda San José', cat: 'educacion', lat: 4.842209, lng: -74.259631 },
  { id: 'fervan', nombre: 'Colegio Fervan Campestre', detalle: 'Vía Cruz Verde', cat: 'educacion', lat: 4.871283, lng: -74.285682 },
  { id: 'el-rey', nombre: 'Supertiendas El Rey', detalle: 'Centro', cat: 'comercio', lat: 4.85368, lng: -74.261828 },
  { id: 'd1', nombre: 'Tiendas D1', detalle: 'Centro', cat: 'comercio', lat: 4.853264, lng: -74.262988 },
  { id: 'terpel', nombre: 'Estación Terpel', detalle: 'El Rosal', cat: 'comercio', lat: 4.853211, lng: -74.262512 },
  { id: 'tierra-grata', nombre: 'Tierra Grata', detalle: 'Vía a Facatativá', cat: 'barrio', lat: 4.851205, lng: -74.273936 },
  { id: 'rotonda', nombre: 'Rotonda de El Rosal', detalle: 'Vía Bogotá - Medellín', cat: 'barrio', lat: 4.851749, lng: -74.271537 },
  { id: 'san-carlos', nombre: 'Barrio San Carlos', detalle: 'El Rosal', cat: 'barrio', lat: 4.855106, lng: -74.26222 },
  { id: 'bochica', nombre: 'Barrio Bochica', detalle: 'El Rosal', cat: 'barrio', lat: 4.855817, lng: -74.261507 },
  { id: 'bolonia', nombre: 'Barrio Bolonia', detalle: 'El Rosal', cat: 'barrio', lat: 4.849392, lng: -74.261915 },
  { id: 'villa-monica', nombre: 'Villa Mónica', detalle: 'El Rosal', cat: 'barrio', lat: 4.85379, lng: -74.267898 },
  { id: 'la-fiora', nombre: 'Reserva La Fiora', detalle: 'Conjunto residencial', cat: 'barrio', lat: 4.853263, lng: -74.269442 },
  { id: 'fiorento', nombre: 'Fiorento', detalle: 'Conjunto residencial', cat: 'barrio', lat: 4.844911, lng: -74.261385 },
  { id: 'mirador', nombre: 'El Mirador', detalle: 'El Rosal', cat: 'barrio', lat: 4.855745, lng: -74.283018 },
  { id: 'cruz-verde', nombre: 'Vereda Cruz Verde', detalle: 'El Rosal', cat: 'vereda', lat: 4.877324, lng: -74.27385 },
  { id: 'paso-ancho', nombre: 'Vereda Paso Ancho', detalle: 'El Rosal', cat: 'vereda', lat: 4.831455, lng: -74.27513 },
  { id: 'puerta-cuero', nombre: 'Vereda Puerta de Cuero', detalle: 'El Rosal', cat: 'vereda', lat: 4.827039, lng: -74.252103 },
  { id: 'san-antonio', nombre: 'Vereda San Antonio', detalle: 'El Rosal', cat: 'vereda', lat: 4.839827, lng: -74.240399 },
  { id: 'campo-alegre', nombre: 'Campo Alegre', detalle: 'El Rosal', cat: 'vereda', lat: 4.834977, lng: -74.257186 },
  { id: 'san-jose', nombre: 'Vereda San José', detalle: 'El Rosal', cat: 'vereda', lat: 4.842908, lng: -74.258999 },
  { id: 'santa-barbara', nombre: 'Vereda Santa Bárbara', detalle: 'El Rosal', cat: 'vereda', lat: 4.860462, lng: -74.247802 },
  { id: 'tierra-grata-alta', nombre: 'Tierra Grata Alta', detalle: 'El Rosal', cat: 'vereda', lat: 4.859956, lng: -74.279085 },
  { id: 'monasterio', nombre: 'Monasterio Benedictino', detalle: 'El Rosal', cat: 'vereda', lat: 4.863916, lng: -74.265014 },
  { id: 'la-molienda', nombre: 'Restaurante La Molienda', detalle: 'Vía Bogotá', cat: 'comida', lat: 4.834459, lng: -74.251211 },
  { id: 'juan-jose', nombre: 'Juan José Me Importa un Chorizo', detalle: 'Vía Bogotá', cat: 'comida', lat: 4.835925, lng: -74.252255 },
  { id: 'el-corral', nombre: 'Asadero El Corral', detalle: 'Tierra Grata', cat: 'comida', lat: 4.851525, lng: -74.274544 },
  { id: 'subachoque', nombre: 'Subachoque', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.9659026, lng: -74.1668581 },
  { id: 'madrid', nombre: 'Madrid', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.736726, lng: -74.2654685 },
  { id: 'facatativa', nombre: 'Facatativá', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.8097276, lng: -74.3541838 },
  { id: 'mosquera', nombre: 'Mosquera', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.7002001, lng: -74.2385058 },
  { id: 'funza', nombre: 'Funza', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.7177471, lng: -74.2031547 },
  { id: 'tenjo', nombre: 'Tenjo', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.8274537, lng: -74.1529851 },
  { id: 'zipacon', nombre: 'Zipacón', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.7527665, lng: -74.3795688 },
  { id: 'san-francisco', nombre: 'San Francisco', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.953252, lng: -74.264573 },
  { id: 'la-vega', nombre: 'La Vega', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.9997123, lng: -74.3395223 },
  { id: 'siberia', nombre: 'Siberia (Cota)', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.7518996, lng: -74.1484468 },
  { id: 'cota', nombre: 'Cota', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.8083869, lng: -74.1036768 },
  { id: 'chia', nombre: 'Chía', detalle: 'Cundinamarca', cat: 'municipio', lat: 4.8660334, lng: -74.0306281 },
  { id: 'portal-80', nombre: 'Portal 80 (TransMilenio)', detalle: 'Bogotá', cat: 'bogota', lat: 4.7097122, lng: -74.1104822 },
  { id: 'aeropuerto', nombre: 'Aeropuerto El Dorado', detalle: 'Bogotá', cat: 'bogota', lat: 4.6992528, lng: -74.1417611 },
];

// Tarifas de EJEMPLO (pesos colombianos). Reemplazar por las oficiales.
export const TARIFAS = {
  ejemplo: true,
  minimaUrbana: 8000,
  banderazo: 5500,
  porKm: 1300,
  redondeo: 500,
  // Recargo nocturno (20:00 a 05:59) y dominicales o festivos.
  recargoNocturno: 2000,
  recargoDominical: 1000,
  nocheDesde: 20,
  nocheHasta: 6,
  // Ofertas que ya anuncia la web de la cooperativa.
  descuentoProgramado: 0.10, // programando con 24 h de anticipación
  horasAnticipacion: 24,
  viajesFidelidad: 10, // cada 10 viajes, el siguiente al 50 %
  descuentoFidelidad: 0.50,
};

// Rutas con tarifa fija desde El Rosal (EJEMPLO). radioKm: qué tan cerca del
// destino debe quedar el punto para que se cobre la tarifa fija.
export const RUTAS = [
  { id: 'subachoque', destino: 'Subachoque', valor: 32000, km: 19, min: 30, radioKm: 4 },
  { id: 'madrid', destino: 'Madrid', valor: 30000, km: 14, min: 22, radioKm: 4 },
  { id: 'facatativa', destino: 'Facatativá', valor: 35000, km: 13, min: 22, radioKm: 4 },
  { id: 'mosquera', destino: 'Mosquera', valor: 40000, km: 20, min: 30, radioKm: 4 },
  { id: 'funza', destino: 'Funza', valor: 45000, km: 23, min: 35, radioKm: 4 },
  { id: 'tenjo', destino: 'Tenjo', valor: 45000, km: 22, min: 35, radioKm: 4 },
  { id: 'zipacon', destino: 'Zipacón', valor: 45000, km: 21, min: 35, radioKm: 4 },
  { id: 'san-francisco', destino: 'San Francisco', valor: 45000, km: 22, min: 40, radioKm: 4 },
  { id: 'la-vega', destino: 'La Vega', valor: 60000, km: 30, min: 50, radioKm: 4 },
  { id: 'siberia', destino: 'Siberia (Cota)', valor: 55000, km: 25, min: 35, radioKm: 3 },
  { id: 'cota', destino: 'Cota', valor: 60000, km: 30, min: 45, radioKm: 4 },
  { id: 'chia', destino: 'Chía', valor: 75000, km: 40, min: 60, radioKm: 5 },
  { id: 'portal-80', destino: 'Portal 80 (Bogotá)', valor: 75000, km: 28, min: 50, radioKm: 3 },
  { id: 'aeropuerto', destino: 'Aeropuerto El Dorado', valor: 90000, km: 32, min: 55, radioKm: 3 },
];

// Conductores ficticios para la simulación. Vehículos como los de la flota real
// (Kia Picanto amarillo, placas de El Rosal), pero con datos inventados.
export const CONDUCTORES_DEMO = [
  { id: 'demo-07', movil: '007', nombre: 'Jorge Castañeda', placa: 'VAK 607', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.9, viajes: 1820, desde: 2012, tel: '3000000007' },
  { id: 'demo-12', movil: '012', nombre: 'Luz Marina Rojas', placa: 'VAK 612', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.8, viajes: 1311, desde: 2015, tel: '3000000012' },
  { id: 'demo-18', movil: '018', nombre: 'Édgar Molina', placa: 'VAK 618', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.7, viajes: 2210, desde: 2008, tel: '3000000018' },
  { id: 'demo-23', movil: '023', nombre: 'Carlos Rodríguez', placa: 'VAK 623', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.9, viajes: 987, desde: 2018, tel: '3000000023' },
  { id: 'demo-31', movil: '031', nombre: 'Wilson Gómez', placa: 'VAK 631', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.6, viajes: 1544, desde: 2011, tel: '3000000031' },
  { id: 'demo-36', movil: '036', nombre: 'Sandra Patiño', placa: 'VAK 636', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 5.0, viajes: 640, desde: 2020, tel: '3000000036' },
  { id: 'demo-44', movil: '044', nombre: 'Fabio Cruz', placa: 'VAK 644', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.8, viajes: 2034, desde: 2009, tel: '3000000044' },
  { id: 'demo-52', movil: '052', nombre: 'Héctor Bernal', placa: 'VAK 652', vehiculo: 'Kia Picanto', color: 'Amarillo', calificacion: 4.7, viajes: 1102, desde: 2016, tel: '3000000052' },
];

// Pasajeros ficticios para que el conductor pueda probar la app solo.
export const PASAJEROS_DEMO = [
  { nombre: 'María Fernanda', calificacion: 4.9 },
  { nombre: 'Andrés', calificacion: 4.8 },
  { nombre: 'Doña Rosa', calificacion: 5.0 },
  { nombre: 'Julián', calificacion: 4.7 },
  { nombre: 'Camila', calificacion: 4.9 },
  { nombre: 'Don Álvaro', calificacion: 4.6 },
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
