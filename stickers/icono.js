// Ícono de la app (img/icono.svg: un taxi con un pin, sin logo de ninguna
// cooperativa) pintado con los colores de la cooperativa activa.
// Cootransrural usa el archivo tal cual; las demás cambian el verde del fondo
// por su color primario y su color oscuro (empresas/<id>/ficha.json).
import { COLORES, ID_EMPRESA } from '../nucleo/config.js';

const URL_ICONO = new URL('../img/icono.svg', import.meta.url).href;
const HEX = /^#[0-9a-f]{6}$/i;

// Colores del degradado de fondo en img/icono.svg.
const FONDO_ORIGINAL = ['#0E7A43', '#05391F'];

export const ICONO_PROPIO = ID_EMPRESA === 'cootransrural';

function coloresFondo() {
  const claro = HEX.test(COLORES.primario2 || '') ? COLORES.primario2 : HEX.test(COLORES.primario || '') ? COLORES.primario : null;
  const oscuro = HEX.test(COLORES.oscuro || '') ? COLORES.oscuro : null;
  return claro && oscuro ? [claro, oscuro] : null;
}

let cache = null;

// Texto SVG del ícono con los colores de la cooperativa.
export function textoIcono() {
  cache ||= fetch(URL_ICONO)
    .then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar el ícono de la app');
      return r.text();
    })
    .then((svg) => {
      const nuevos = ICONO_PROPIO ? null : coloresFondo();
      if (!nuevos) return svg;
      return FONDO_ORIGINAL.reduce((t, viejo, i) => t.replace(new RegExp(viejo, 'gi'), nuevos[i]), svg);
    });
  return cache;
}

// Data URI (para SVG autónomos) y URL para <img>/canvas.
// Para Cootransrural la URL es el archivo del sitio; para las demás, un blob local.
export async function icono() {
  const texto = await textoIcono();
  const dataURI = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(texto)));
  const url = ICONO_PROPIO ? URL_ICONO : URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml' }));
  return { texto, dataURI, url };
}
