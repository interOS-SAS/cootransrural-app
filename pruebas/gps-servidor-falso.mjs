// Receptor FALSO de la tienda TaxiCun GPS, para probar gps/ sin el servidor de TaxiCun. Sin dependencias.
//  - Sirve el repositorio como sitio estático con una CSP estricta y OBLIGATORIA (sin 'unsafe-inline', con
//    Trusted Types): si la tienda trajera un script o un estilo en línea, el navegador lo bloquearía.
//  - Atiende POST /api/gps/interes revisando el contrato (el de gps/tienda.js y §14.2.3 del diseño del GPS): mismo
//    origen, JSON, menos de 4 KB y el esquema cerrado (con placa, plan por patrón y planesVersion). Guarda en memoria
//    lo recibido (nunca en disco) y responde como el servidor de verdad: 200 {"ok": true}. Con otro «modo» responde
//    404, 500, HTML en vez de JSON, o no responde.
//  - Atiende GET /api/gps/planes como §14.2.1: 200 JSON con Cache-Control public, max-age=60 y ETag
//    "gps-planes-<version>-<12 hex del sha256 del cuerpo>", y 304 con If-None-Match igual. estado.planes dice qué
//    responde: 'v1' (el respaldo de gps-planes.json, como el servidor recién instalado), 'v2' y 'v3' (otras versiones
//    válidas), 'xss' (válida, con señuelos de HTML que pasan los topes), o una falla: '404', '500', 'html', 'texto'
//    (JSON con otro tipo), 'json-malo', 'grande', 'topes', 'no-cuadra', 'id-reservado', 'xss-html', 'redirige' o
//    'mudo' (no responde nunca); o un objeto { cuerpo } con cualquier cuerpo. Anota cada pedido en estado.pedidosPlanes.
//  - Solo para las pruebas: GET /__gps/recibidos (lo recibido) y POST /__gps/modo?m=<modo>&planes=<modo>.
//
// Uso: node pruebas/gps-servidor-falso.mjs [--puerto=4721] [--modo=ok|404|500|html|mudo] [--planes=v1|v2|…]
//      y abrir http://127.0.0.1:4721/gps/   (también se importa: crearServidor({ puerto, modo, planes }))
import { createHash } from 'node:crypto';
import http from 'node:http';
import { createReadStream, readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CSP_ESTRICTA = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; "
  + "manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const PLANES = JSON.parse(readFileSync(join(RAIZ, 'herramientas/gps-planes.json'), 'utf8'));
const COOPERATIVAS = new Set(JSON.parse(readFileSync(join(RAIZ, 'empresas/indice.json'), 'utf8')).cooperativas.map((c) => c.id));
// El esquema del servidor (ESQUEMA_INTERES de src/gps/interes.js; §14.2.3 del diseño del GPS), cerrado: «placa» y
// «planesVersion» opcionales, y «plan» por patrón (el id de un plan, «combo» o «no_se»).
export const OBLIGATORIAS = ['nombre', 'celular', 'municipio', 'taxis', 'plan', 'autorizo', 'version'];
export const OPCIONALES = ['correo', 'cooperativa', 'placa', 'planesVersion', 'mensaje', 'tiempoMs', 'sitioWeb'];

// ---------------------------------------------------------------- GET /api/gps/planes
// El cuerpo público a partir de lo que edita interOS (§14.1.1): calcula alInstalar, primerAnio y combo.ahorroMes como
// el servidor, y no lleva costos ni nada interno.
export function publico(datos, version) {
  const porId = Object.fromEntries(datos.planes.map((p) => [p.id, p]));
  return {
    version, moneda: 'COP', ivaIncluido: true, licenciaMes: datos.licenciaMes, flotasDesde: datos.flotasDesde,
    combo: { nombre: datos.combo.nombre, lema: datos.combo.lema },
    planes: datos.planes.map((p) => {
      const alInstalar = p.precioEquipo + p.instalacion;
      return {
        id: p.id, nombre: p.nombre, lema: p.lema, equipo: p.equipo, precioEquipo: p.precioEquipo, instalacion: p.instalacion, alInstalar,
        mes: p.mes, primerAnio: alInstalar + 12 * p.mes, permanenciaMeses: p.permanenciaMeses, destacado: p.destacado,
        combo: p.combo ? { base: p.combo.base, ahorroMes: porId[p.combo.base].mes + datos.licenciaMes - p.mes } : null,
        condiciones: p.condiciones,
      };
    }),
    extras: datos.extras,
  };
}
export const RESPALDO = PLANES.respaldo;
// Versión 2: cambian precios, entra un plan nuevo destacado («flota_10»), sale el combo con compra y cambian los otros
// valores y las flotas.
export const PLANES_V2 = publico({
  licenciaMes: 27000, flotasDesde: 15, combo: { nombre: 'Combo TaxiCun + GPS', lema: 'Todo junto, más barato' },
  planes: [
    { id: 'compra', nombre: 'Compra', lema: 'El equipo queda tuyo', equipo: 'propio', precioEquipo: 259000, instalacion: 60000, mes: 31900,
      permanenciaMeses: 0, destacado: false, combo: null, condiciones: ['Garantía del equipo: 12 meses.'] },
    { id: 'sin_cuota', nombre: 'Sin cuota inicial', lema: '', equipo: 'comodato', precioEquipo: 0, instalacion: 0, mes: 54900,
      permanenciaMeses: 18, destacado: false, combo: null, condiciones: ['El equipo es de interOS (en comodato).', 'Garantía mientras dure el contrato.'] },
    { id: 'flota_10', nombre: 'Flotas de 10 o más', lema: 'Para cooperativas y flotas', equipo: 'propio', precioEquipo: 239000, instalacion: 0,
      mes: 27900, permanenciaMeses: 6, destacado: true, combo: null, condiciones: ['Desde 10 taxis del mismo propietario o de la cooperativa.'] },
    { id: 'combo_sin_cuota', nombre: 'Sin cuota inicial', lema: '', equipo: 'comodato', precioEquipo: 0, instalacion: 0, mes: 74900,
      permanenciaMeses: 18, destacado: false, combo: { base: 'sin_cuota' }, condiciones: [] },
  ],
  extras: [{ texto: 'Pasar el equipo a otro taxi', valor: 90000 }, { texto: 'Revisión a domicilio', valor: 40000 }],
}, 2);
// Versión 3: un solo plan, sin combos ni otros valores, y sin «compra» ni «sin_cuota» (la nota de arriba se oculta).
export const PLANES_V3 = publico({
  licenciaMes: 27000, flotasDesde: 2, combo: { nombre: 'Combo TaxiCun + GPS', lema: '' },
  planes: [{ id: 'basico', nombre: 'Básico', lema: 'Lo justo', equipo: 'propio', precioEquipo: 300000, instalacion: 50000, mes: 35000,
    permanenciaMeses: 1, destacado: false, combo: null, condiciones: [] }],
  extras: [],
}, 3);
// Señuelos de HTML que SÍ pasan los topes (no traen < ni >): tienen que verse tal cual, nunca como HTML.
export const SENUELOS = {
  nombre: '&lt;b&gt;Compra&lt;/b&gt;', lema: '{{gps.nombre}} ${alert(1)} %3Cscript%3E',
  condicion: '&#60;img src=x onerror=1&#62; y &amp;amp;', combo: '&lt;i&gt;Combo&lt;/i&gt;', extra: '&lt;script&gt;x&lt;/script&gt;',
};
export const PLANES_XSS = (() => {
  const d = structuredClone(RESPALDO);
  d.version = 7;
  d.planes[0].nombre = SENUELOS.nombre;
  d.planes[0].lema = SENUELOS.lema;
  d.planes[0].condiciones = [SENUELOS.condicion];
  d.combo.nombre = SENUELOS.combo;
  d.extras[0].texto = SENUELOS.extra;
  return d;
})();
const conCambio = (cambiar) => { const d = structuredClone(RESPALDO); d.version = 9; cambiar(d); return d; };
const MODOS_PLANES = {
  v1: () => ({ cuerpo: RESPALDO }),
  v2: () => ({ cuerpo: PLANES_V2 }),
  v3: () => ({ cuerpo: PLANES_V3 }),
  xss: () => ({ cuerpo: PLANES_XSS }),
  404: () => ({ codigo: 404, texto: '{"error":"no_existe"}' }),
  500: () => ({ codigo: 500, texto: '{"error":"interno"}' }),
  html: () => ({ codigo: 200, tipo: 'text/html; charset=utf-8', texto: '<!doctype html><title>Mantenimiento</title><p>Volvemos pronto</p>' }),
  texto: () => ({ codigo: 200, tipo: 'text/plain; charset=utf-8', texto: JSON.stringify(PLANES_V2) }),
  'json-malo': () => ({ codigo: 200, texto: '{"version": 2, "planes": [' }),
  grande: () => ({ cuerpo: { ...PLANES_V2, relleno: 'x'.repeat(40000) } }),
  topes: () => ({ cuerpo: conCambio((d) => { d.planes[0].mes = 5000; d.planes[0].primerAnio = d.planes[0].alInstalar + 12 * 5000; }) }),
  'no-cuadra': () => ({ cuerpo: conCambio((d) => { d.planes[1].primerAnio += 100; }) }),
  'id-reservado': () => ({ cuerpo: conCambio((d) => { d.planes[0].id = 'no_se'; }) }),
  'xss-html': () => ({ cuerpo: conCambio((d) => { d.planes[0].nombre = 'Compra<img src=x onerror="window.__xss=1">'; }) }),
};

function planes(req, res, estado) {
  const registro = { en: Date.now(), inm: req.headers['if-none-match'] || '', cookie: req.headers.cookie || '', modo: estado.planes, respuesta: null };
  estado.pedidosPlanes.push(registro);
  if (req.method !== 'GET' && req.method !== 'HEAD') { registro.respuesta = 405; return enviar(res, 405, '{"error":"metodo"}', 'application/json'); }
  if (estado.planes === 'mudo') return; // no responde nunca (la página corta a los 4 s)
  if (estado.planes === 'redirige') { registro.respuesta = 302; res.writeHead(302, { location: '/api/gps/otra' }); return res.end(); }
  // estado.planes también puede ser { cuerpo } (un cuerpo cualquiera, con su ETag) o { codigo, tipo, texto }.
  const r = estado.planes && typeof estado.planes === 'object' ? estado.planes : (MODOS_PLANES[estado.planes] || MODOS_PLANES[404])();
  if (r.cuerpo) {
    const texto = JSON.stringify(r.cuerpo);
    const etag = `"gps-planes-${r.cuerpo.version}-${createHash('sha256').update(texto).digest('hex').slice(0, 12)}"`;
    const cabeceras = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', etag, 'x-content-type-options': 'nosniff' };
    if (registro.inm === etag) { registro.respuesta = 304; res.writeHead(304, cabeceras); return res.end(); }
    registro.respuesta = 200;
    res.writeHead(200, { ...cabeceras, 'content-length': Buffer.byteLength(texto) });
    return res.end(req.method === 'HEAD' ? '' : texto);
  }
  registro.respuesta = r.codigo;
  return enviar(res, r.codigo, r.texto, r.tipo || 'application/json; charset=utf-8');
}
const ENLACE = /:\/\/|www\./i;

// Devuelve la lista de problemas del cuerpo (vacía si cumple).
export function revisarCuerpo(d) {
  const mal = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['no es un objeto'];
  const sobran = Object.keys(d).filter((k) => !OBLIGATORIAS.includes(k) && !OPCIONALES.includes(k));
  const faltan = OBLIGATORIAS.filter((k) => !(k in d));
  if (sobran.length || faltan.length) mal.push(`claves: sobran ${sobran} · faltan ${faltan}`);
  const texto = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
  if (!texto(d.nombre, 2, 80) || ENLACE.test(d.nombre) || d.nombre !== d.nombre.trim()) mal.push('nombre');
  if (typeof d.celular !== 'string' || !/^(3\d{9}|60[1-8]\d{7})$/.test(d.celular)) mal.push('celular');
  if ('correo' in d && (!texto(d.correo, 0, 120) || (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo)))) mal.push('correo');
  if (!texto(d.municipio, 2, 60) || ENLACE.test(d.municipio)) mal.push('municipio');
  if ('cooperativa' in d && (typeof d.cooperativa !== 'string' || !(d.cooperativa === 'otra' || COOPERATIVAS.has(d.cooperativa)))) mal.push('cooperativa');
  if ('placa' in d && (typeof d.placa !== 'string' || !/^[A-Z]{3}\d{3}$/.test(d.placa))) mal.push('placa');
  if (!Number.isInteger(d.taxis) || d.taxis < 1 || d.taxis > 500) mal.push('taxis');
  if (typeof d.plan !== 'string' || !/^[a-z][a-z0-9_]{1,23}$/.test(d.plan)) mal.push('plan');
  if ('planesVersion' in d && (!Number.isInteger(d.planesVersion) || d.planesVersion < 1 || d.planesVersion > 1000000)) mal.push('planesVersion');
  if ('mensaje' in d && (!texto(d.mensaje, 0, 500) || ENLACE.test(d.mensaje))) mal.push('mensaje');
  if (d.autorizo !== true || d.version !== PLANES.autorizacion.version) mal.push('autorizo/version');
  if ('sitioWeb' in d && (typeof d.sitioWeb !== 'string' || d.sitioWeb.length > 200)) mal.push('sitioWeb');
  if ('tiempoMs' in d && (!Number.isInteger(d.tiempoMs) || d.tiempoMs < 0)) mal.push('tiempoMs');
  return mal;
}

export function crearServidor({ puerto = 4721, modo = 'ok', planes: modoPlanes = 'v1', host = '127.0.0.1' } = {}) {
  // recibidos se vacía en cada caso de la prueba; historial guarda todos los cuerpos (para revisarlos con el esquema del servidor).
  const estado = { modo, recibidos: [], historial: [], planes: modoPlanes, pedidosPlanes: [] };
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/__gps/recibidos') return enviar(res, 200, JSON.stringify(estado.recibidos), 'application/json');
    if (url.pathname === '/__gps/modo' && req.method === 'POST') {
      estado.modo = url.searchParams.get('m') || 'ok'; estado.planes = url.searchParams.get('planes') || estado.planes; estado.recibidos = []; return enviar(res, 204, '');
    }
    if (url.pathname === '/api/gps/interes') return interes(req, res, estado, url);
    if (url.pathname === '/api/gps/planes') return planes(req, res, estado);
    if (url.pathname.startsWith('/api/')) return enviar(res, 404, '{"error":"no_existe"}', 'application/json');
    return estatico(req, res, url.pathname);
  });
  return new Promise((ok) => servidor.listen(puerto, host, () => ok({ servidor, estado, url: `http://${host}:${puerto}/` })));
}

function enviar(res, codigo, cuerpo, tipo = 'text/plain; charset=utf-8') {
  res.writeHead(codigo, { 'content-type': tipo, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(cuerpo);
}

function interes(req, res, estado, url) {
  if (req.method !== 'POST') return enviar(res, 405, '{"error":"metodo"}', 'application/json');
  let tam = 0; const partes = [];
  req.on('data', (c) => { tam += c.length; if (tam <= 8192) partes.push(c); });
  req.on('end', () => {
    const crudo = Buffer.concat(partes).toString('utf8');
    const registro = {
      en: Date.now(), tam, origen: req.headers.origin || '', tipo: req.headers['content-type'] || '', cookie: req.headers.cookie || '',
      referer: req.headers.referer || '', consulta: url.search, cuerpo: null, problemas: [],
    };
    const esperado = `http://${req.headers.host}`;
    if (registro.origen !== esperado) registro.problemas.push(`origen ${registro.origen}`);
    if (!/^application\/json\b/.test(registro.tipo)) registro.problemas.push(`tipo ${registro.tipo}`);
    if (tam > 4096) registro.problemas.push(`tamaño ${tam}`);
    try { registro.cuerpo = JSON.parse(crudo); } catch { registro.problemas.push('json'); }
    if (registro.cuerpo) registro.problemas.push(...revisarCuerpo(registro.cuerpo));
    estado.recibidos.push(registro);
    if (registro.cuerpo) estado.historial.push(registro.cuerpo);
    if (estado.modo === 'mudo') return; // no responde nunca (la página corta a los 12 s)
    if (estado.modo === '404') return enviar(res, 404, '{"error":"no_existe"}', 'application/json');
    if (estado.modo === '500') return enviar(res, 500, '{"error":"interno"}', 'application/json');
    if (estado.modo === 'html') return enviar(res, 200, '<!doctype html><p>hola</p>', 'text/html; charset=utf-8');
    // Como el servidor de verdad: la misma respuesta siempre (también con trampa, topes o datos malos).
    return enviar(res, 200, '{"ok":true}', 'application/json; charset=utf-8');
  });
}

async function estatico(req, res, ruta) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return enviar(res, 405, 'Método no permitido');
  let rel;
  try { rel = decodeURIComponent(ruta); } catch { return enviar(res, 400, 'Ruta inválida'); }
  let archivo = normalize(join(RAIZ, rel));
  if (archivo !== RAIZ && !archivo.startsWith(RAIZ + sep)) return enviar(res, 403, 'Prohibido');
  let info;
  try { info = await stat(archivo); } catch { return enviar(res, 404, 'No existe'); }
  if (info.isDirectory()) {
    if (!ruta.endsWith('/')) { res.writeHead(301, { location: `${ruta}/` }); return res.end(); }
    archivo = join(archivo, 'index.html');
    try { info = await stat(archivo); } catch { return enviar(res, 404, 'No existe'); }
  }
  const tipo = TIPOS[extname(archivo).toLowerCase()] || 'application/octet-stream';
  const cabeceras = { 'content-type': tipo, 'content-length': info.size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  if (tipo.startsWith('text/html')) Object.assign(cabeceras, { 'content-security-policy': CSP_ESTRICTA, 'referrer-policy': 'strict-origin-when-cross-origin' });
  res.writeHead(200, cabeceras);
  if (req.method === 'HEAD') return res.end();
  createReadStream(archivo).pipe(res);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
  const { url } = await crearServidor({ puerto: Number(arg('puerto') || 4721), modo: arg('modo') || 'ok', planes: arg('planes') || 'v1' });
  console.log(`Tienda GPS con el receptor falso: ${url}gps/  (PID ${process.pid})`);
}
