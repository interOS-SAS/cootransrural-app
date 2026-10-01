// Configuración general de la app de taxis (sirve para varias cooperativas).
// Todo lo que cambie de un despliegue a otro (relés, sala, tiempos) vive aquí.

// Cooperativa activa. Cada página la fija con window.CT_EMPRESA antes de cargar
// los módulos (o con ?e=id en la URL); sin nada, es Cootransrural. Sus datos
// (nombre, teléfonos, lugares, rutas, tarifas, colores) están en
// empresas/<id>/ficha.json.
export const RAIZ = new URL('../', import.meta.url);

function idPedido() {
  const crudo = String(globalThis.CT_EMPRESA || new URLSearchParams(globalThis.location?.search || '').get('e') || 'cootransrural').toLowerCase();
  // Solo ids válidos (a-z, 0-9 y guiones); cualquier otra cosa es Cootransrural.
  return /^[a-z0-9-]{1,40}$/.test(crudo) ? crudo : 'cootransrural';
}

async function cargarFicha(id) {
  // Hasta 3 intentos: en datos móviles la primera petición a veces falla.
  let error;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(new URL(`empresas/${id}/ficha.json`, RAIZ));
      if (r.status === 404) throw Object.assign(new Error(`No existe la cooperativa «${id}»`), { definitivo: true });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      error = e;
      if (e.definitivo) break;
      await new Promise((ok) => setTimeout(ok, 700 * (i + 1)));
    }
  }
  throw error;
}

// Si no carga la ficha pedida, NO se muestra otra cooperativa en su lugar: la
// página avisa que no pudo cargar (ver la pantalla de carga de app/ y conductor/).
const ficha = await cargarFicha(idPedido());

export const FICHA = ficha;
export const ID_EMPRESA = ficha.id;
// Sin «estado» explícito se trata como propuesta (franja y sin indexar): más seguro.
export const ES_PROPUESTA = ficha.estado !== 'cliente';
export const EMPRESA = ficha.EMPRESA;
// «cooperativa» o «empresa» (S.A.S. y similares: EMPRESA.tipo = "empresa"). Las dos
// son femeninas: los textos dicen «la ${TIPO_EMPRESA}» sin cambiar nada más.
export const TIPO_EMPRESA = ficha.EMPRESA?.tipo === 'empresa' ? 'empresa' : 'cooperativa';
export const COLORES = ficha.colores || {};
export const CENTRO = ficha.CENTRO;
export const ZONA = ficha.ZONA;

// Quién desarrolla la app (pie de página y franja de propuesta).
export const PROVEEDOR = { nombre: 'interOS', web: 'https://interos.com.co' };

// La app única de todas las cooperativas se llama TaxiCun (desarrollada por interOS).
export const MARCA = {
  nombre: 'TaxiCun',
  desarrollador: 'interOS',
  lema: 'Tu taxi de confianza en Cundinamarca',
  colores: { azul: '#0A2552', azul2: '#1A4FA0', amarillo: '#FFC21A', amarilloOscuro: '#F2A900' },
  icono: 'img/taxicun/icono-192.png',
  logo: 'img/taxicun/logo.svg',
  logoBlanco: 'img/taxicun/logo-blanco.svg',
};

// ¿La página es la app única TaxiCun (taxicun/), que elige la cooperativa por GPS?
export const EN_TAXICUN = Boolean(globalThis.CT_TAXICUN);

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

// Carpeta de la cooperativa: /<id>/ o la que diga la ficha (Cootransrural → /el-rosal/).
// En la raíz del sitio está la página de TaxiCun.
export const RAIZ_EMPRESA = new URL(`${FICHA.carpeta || ID_EMPRESA}/`, RAIZ);

export function urlEmpresa(ruta = '') {
  return new URL(ruta, RAIZ_EMPRESA).href;
}

// Enlace a la app del pasajero ('pasajero') o del conductor ('conductor').
// Dentro de TaxiCun se queda en TaxiCun (con la cooperativa en ?e=); fuera,
// va a las páginas propias de la cooperativa.
export function urlApp(rol = 'pasajero', extra = {}) {
  const u = EN_TAXICUN
    ? new URL(rol === 'conductor' ? 'taxicun/conductor/' : 'taxicun/', RAIZ)
    : new URL(rol === 'conductor' ? 'conductor/' : 'app/', RAIZ_EMPRESA);
  if (EN_TAXICUN) u.searchParams.set('e', ID_EMPRESA);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== '') u.searchParams.set(k, v);
  return u.href;
}

// Cambiar de municipio dentro de TaxiCun (muestra la lista de cooperativas).
export function urlElegirMunicipio(rol = 'pasajero') {
  return new URL(rol === 'conductor' ? 'taxicun/conductor/?elegir=1' : 'taxicun/?elegir=1', RAIZ).href;
}
