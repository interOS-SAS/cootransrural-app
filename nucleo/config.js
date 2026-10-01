// Configuración general de la demo de Cootransrural.
// Todo lo que cambie de un despliegue a otro (relés, sala, tiempos) vive aquí.

export const EMPRESA = {
  nombre: 'Cootransrural',
  razonSocial: 'Cooperativa de Transportadores Rurales de El Rosal Ltda.',
  lema: 'Más que transporte, confianza',
  municipio: 'El Rosal, Cundinamarca',
  telefono: '3209042977',
  telefonoVisible: '320 904 2977',
  whatsapp: '573209042977',
  correo: 'recepcion@cootransrural.com',
  direccion: 'Carrera 8 No. 12-38, Barrio San Carlos, El Rosal, Cundinamarca',
  web: 'https://cootransrural.com',
  fundada: 1999,
  taxisIniciales: 22,
  taxis: 52,
  microbuses: 3,
  asociados: 105,
  servicio24h: true,
};

// Centro del casco urbano (Parque Principal de El Rosal).
export const CENTRO = { lat: 4.85257, lng: -74.26059 };

// Zona que se usa para buscar direcciones (Sabana Occidente y alrededores).
export const ZONA = { sur: 4.60, norte: 5.08, oeste: -74.48, este: -73.98 };

// Relés MQTT públicos para conectar celulares distintos en la demo.
// Se usan TODOS a la vez y se descartan los mensajes repetidos: así, si una red
// bloquea un relé (el DNS de algunas redes responde 0.0.0.0), los otros siguen.
export const RELES_MQTT = [
  'wss://test.mosquitto.org:8081',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

export const PREFIJO_TEMAS = 'cootransrural/demo-v1';
export const SALA_POR_DEFECTO = 'demo';

export const TIEMPOS = {
  // Si no hay conductores reales conectados, el conductor simulado acepta tras esto.
  esperaSinConductores: 6000,
  // Si hay conductores reales en línea, se les da este margen antes de simular.
  esperaConConductores: 25000,
  // Cada cuánto anuncia un conductor que está en línea.
  presencia: 8000,
  // Un conductor que no se reporta en este tiempo se da por desconectado.
  presenciaVence: 30000,
  // Envío de ubicación durante un viaje real.
  ubicacion: 2000,
  // Tiempo que tiene un conductor para aceptar una solicitud.
  aceptar: 25000,
  // Aceleración de la simulación: 1 minuto real = estos milisegundos.
  minutoSimulado: 6000,
};

// Servicios externos gratuitos (con respaldo local si fallan).
export const SERVICIOS = {
  nominatim: 'https://nominatim.openstreetmap.org',
  osrm: 'https://router.project-osrm.org',
};

export const CAPAS_MAPA = {
  claro: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  suave: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  oscuro: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

// Raíz del sitio, calculada desde este archivo (sirve igual en GitHub Pages,
// en un subdirectorio o en localhost).
export const RAIZ = new URL('../', import.meta.url);

export function urlDelSitio(ruta = '') {
  return new URL(ruta, RAIZ).href;
}
