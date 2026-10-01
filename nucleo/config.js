// Configuración general de la app de taxis (sirve para varias cooperativas).
// Todo lo que cambie de un despliegue a otro (relés, sala, tiempos) vive aquí.

// Cooperativa activa. Cada página la fija con window.CT_EMPRESA antes de cargar
// los módulos (o con ?e=id en la URL); sin nada, es Cootransrural. Sus datos
// (nombre, teléfonos, lugares, rutas, tarifas, colores) están en
// empresas/<id>/ficha.json.
export const RAIZ = new URL('../', import.meta.url);

function idPedido() {
  const crudo = globalThis.CT_EMPRESA || new URLSearchParams(globalThis.location?.search || '').get('e') || 'cootransrural';
  return String(crudo).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'cootransrural';
}

async function cargarFicha(id) {
  const r = await fetch(new URL(`empresas/${id}/ficha.json`, RAIZ));
  if (!r.ok) throw new Error(`No existe la ficha de «${id}»`);
  return r.json();
}

let ficha;
try {
  ficha = await cargarFicha(idPedido());
} catch (e) {
  console.warn('[config]', e.message, '· se usa Cootransrural');
  ficha = await cargarFicha('cootransrural');
}

export const FICHA = ficha;
export const ID_EMPRESA = ficha.id;
export const ES_PROPUESTA = ficha.estado === 'propuesta';
export const EMPRESA = ficha.EMPRESA;
export const COLORES = ficha.colores || {};
export const CENTRO = ficha.CENTRO;
export const ZONA = ficha.ZONA;

// Quién hizo la app (pie de página y franja de propuesta).
export const PROVEEDOR = { nombre: 'interOS', web: 'https://interos.com.co' };

// Relés MQTT públicos para conectar celulares distintos en la demo.
// Se usan TODOS a la vez y se descartan los mensajes repetidos: así, si una red
// bloquea un relé (el DNS de algunas redes responde 0.0.0.0), los otros siguen.
export const RELES_MQTT = [
  'wss://test.mosquitto.org:8081',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

export const PREFIJO_TEMAS = `apptaxi-demo/v2/${ID_EMPRESA}`;
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

// Mapas de Mapbox (token público de Oscar; restringirlo por URL en mapbox.com).
// Cada diseño usa un estilo: 'claro' (calles), 'suave' (claro y limpio),
// 'oscuro' (navegación nocturna), 'navegacion' (navegación de día).
// Si Mapbox falla, el mapa pasa solo a OpenStreetMap.
export const MAPBOX = {
  token: '', // pendiente: GitHub bloquea el token público hasta que se autorice
  estilos: {
    claro: 'mapbox/streets-v12',
    suave: 'mapbox/light-v11',
    oscuro: 'mapbox/navigation-night-v1',
    navegacion: 'mapbox/navigation-day-v1',
    noche: 'mapbox/dark-v11',
  },
};

// Respaldo sin llave (y la capa 'osm' explícita).
export const CAPAS_MAPA = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
};

// Raíz del sitio (sirve igual en GitHub Pages, en un subdirectorio o en localhost).
export function urlDelSitio(ruta = '') {
  return new URL(ruta, RAIZ).href;
}

// Raíz de la cooperativa: Cootransrural está en la raíz; las demás en /<id>/.
export const RAIZ_EMPRESA = ID_EMPRESA === 'cootransrural' ? RAIZ : new URL(`${ID_EMPRESA}/`, RAIZ);

export function urlEmpresa(ruta = '') {
  return new URL(ruta, RAIZ_EMPRESA).href;
}
