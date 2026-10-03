// Receptor FALSO de la tienda TaxiCun GPS, para probar gps/ sin el servidor de TaxiCun. Sin dependencias.
//  - Sirve el repositorio como sitio estático con una CSP estricta y OBLIGATORIA (sin 'unsafe-inline', con
//    Trusted Types): si la tienda trajera un script o un estilo en línea, el navegador lo bloquearía.
//  - Atiende POST /api/gps/interes revisando el contrato (el de gps/tienda.js): mismo origen, JSON, menos de
//    4 KB y el esquema cerrado. Guarda en memoria lo recibido (nunca en disco) y responde como el servidor de
//    verdad: 200 {"ok": true}. Con otro «modo» responde 404, 500, HTML en vez de JSON, o no responde.
//  - Solo para las pruebas: GET /__gps/recibidos (lo recibido) y POST /__gps/modo?m=<modo>.
//
// Uso: node pruebas/gps-servidor-falso.mjs [--puerto=4641] [--modo=ok|404|500|html|mudo]
//      y abrir http://127.0.0.1:4641/gps/   (también se importa: crearServidor({ puerto, modo }))
import http from 'node:http';
import { createHash } from 'node:crypto';
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
const SHA = createHash('sha256').update(PLANES.autorizacion.texto, 'utf8').digest('hex');
const COOPERATIVAS = new Set(JSON.parse(readFileSync(join(RAIZ, 'empresas/indice.json'), 'utf8')).cooperativas.map((c) => c.id));
const CLAVES = ['v', 'nombre', 'celular', 'correo', 'cooperativa', 'placa', 'taxis', 'plan', 'mensaje', 'autorizacion', 'sitio_web', 'ms_en_pagina'];
const ENLACE = /:\/\/|www\./i;

// El esquema cerrado de POST /api/gps/interes: devuelve la lista de problemas (vacía si cumple).
export function revisarCuerpo(d) {
  const mal = [];
  if (!d || typeof d !== 'object' || Array.isArray(d)) return ['no es un objeto'];
  const claves = Object.keys(d).sort();
  if (claves.join() !== [...CLAVES].sort().join()) mal.push(`claves: ${claves.join(',')}`);
  const texto = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
  if (d.v !== 1) mal.push('v');
  if (!texto(d.nombre, 2, 80) || ENLACE.test(d.nombre) || d.nombre !== d.nombre.trim()) mal.push('nombre');
  if (typeof d.celular !== 'string' || !/^(3\d{9}|60[1-8]\d{7})$/.test(d.celular)) mal.push('celular');
  if (!texto(d.correo, 0, 120) || (d.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.correo))) mal.push('correo');
  if (typeof d.cooperativa !== 'string' || !(d.cooperativa === 'otra' || COOPERATIVAS.has(d.cooperativa))) mal.push('cooperativa');
  if (typeof d.placa !== 'string' || !(d.placa === '' || /^[A-Z]{3}\d{3}$/.test(d.placa))) mal.push('placa');
  if (!Number.isInteger(d.taxis) || d.taxis < 1 || d.taxis > 500) mal.push('taxis');
  if (!['compra', 'sin_cuota', 'combo', 'no_se'].includes(d.plan)) mal.push('plan');
  if (!texto(d.mensaje, 0, 500) || ENLACE.test(d.mensaje)) mal.push('mensaje');
  const a = d.autorizacion;
  if (!a || typeof a !== 'object' || Object.keys(a).sort().join() !== 'texto_sha,version' || a.version !== PLANES.autorizacion.version || a.texto_sha !== SHA) mal.push('autorizacion');
  if (typeof d.sitio_web !== 'string' || d.sitio_web.length > 200) mal.push('sitio_web');
  if (!Number.isInteger(d.ms_en_pagina) || d.ms_en_pagina < 0) mal.push('ms_en_pagina');
  return mal;
}

export function crearServidor({ puerto = 4641, modo = 'ok', host = '127.0.0.1' } = {}) {
  const estado = { modo, recibidos: [] };
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/__gps/recibidos') return enviar(res, 200, JSON.stringify(estado.recibidos), 'application/json');
    if (url.pathname === '/__gps/modo' && req.method === 'POST') { estado.modo = url.searchParams.get('m') || 'ok'; estado.recibidos = []; return enviar(res, 204, ''); }
    if (url.pathname === '/api/gps/interes') return interes(req, res, estado, url);
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
  const { url } = await crearServidor({ puerto: Number(arg('puerto') || 4641), modo: arg('modo') || 'ok' });
  console.log(`Tienda GPS con el receptor falso: ${url}gps/  (PID ${process.pid})`);
}
