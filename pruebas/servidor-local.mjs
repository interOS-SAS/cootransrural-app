// Servidor local de mismo origen para probar el modo real (?real=1) sin nginx:
// sirve el repositorio como sitio estático y pasa /api/* (HTTP y el WebSocket
// de /api/bus) al servidor de TaxiCun que corre en local. Sin dependencias.
//
// Uso: node pruebas/servidor-local.mjs [--puerto=8799] [--api=http://127.0.0.1:3199] [--raiz=<repo>]
//      (también PUERTO_LOCAL y API_LOCAL como variables de entorno)
// Luego: http://localhost:8799/taxicun/?real=1 y http://localhost:8799/taxicun/conductor/?real=1
import http from 'node:http';
import net from 'node:net';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (nombre) => process.argv.slice(2).find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3);
const PUERTO = Number(arg('puerto') || process.env.PUERTO_LOCAL || 8799);
const API = new URL(arg('api') || process.env.API_LOCAL || 'http://127.0.0.1:3199');
const RAIZ = resolve(arg('raiz') || fileURLToPath(new URL('..', import.meta.url)));

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

const esApi = (ruta) => ruta === '/api' || ruta.startsWith('/api/');

function responder(res, codigo, texto, extra = {}) {
  res.writeHead(codigo, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra });
  res.end(texto);
}

// Archivos del repositorio. Igual que python -m http.server: una carpeta sin «/»
// final redirige con «/» (las rutas relativas de las páginas dependen de eso) y
// una carpeta entrega su index.html.
async function estatico(req, res, ruta) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return responder(res, 405, 'Método no permitido', { allow: 'GET, HEAD' });
  let rel;
  try { rel = decodeURIComponent(ruta); } catch { return responder(res, 400, 'Ruta inválida'); }
  const archivo = normalize(join(RAIZ, rel));
  if (archivo !== RAIZ && !archivo.startsWith(RAIZ + sep)) return responder(res, 403, 'Prohibido');
  let info;
  try { info = await stat(archivo); } catch { return responder(res, 404, 'No existe'); }
  let final = archivo;
  if (info.isDirectory()) {
    if (!ruta.endsWith('/')) {
      const q = req.url.indexOf('?');
      return responder(res, 301, '', { location: `${ruta}/${q >= 0 ? req.url.slice(q) : ''}` });
    }
    final = join(archivo, 'index.html');
    try { info = await stat(final); } catch { return responder(res, 404, 'No existe'); }
  }
  res.writeHead(200, {
    'content-type': TIPOS[extname(final).toLowerCase()] || 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(final).on('error', () => res.destroy()).pipe(res);
}

// /api/* por HTTP: misma petición al servidor local (cabeceras y cuerpo tal cual).
function pasarHttp(req, res) {
  const salida = http.request({
    host: API.hostname, port: API.port || 80, method: req.method, path: req.url,
    headers: { ...req.headers, host: API.host, 'x-forwarded-for': req.socket.remoteAddress || '' },
  }, (r) => {
    res.writeHead(r.statusCode || 502, r.headers);
    r.pipe(res);
  });
  salida.on('error', () => {
    if (!res.headersSent) responder(res, 502, JSON.stringify({ error: 'sin_servidor' }), { 'content-type': 'application/json' });
    else res.destroy();
  });
  req.pipe(salida);
}

// /api/bus por WebSocket: se reenvía la petición de upgrade cruda y luego se
// unen los dos sockets (el proxy no interpreta los marcos).
function pasarUpgrade(req, socket, cabeza) {
  const ruta = req.url.split('?')[0];
  if (!esApi(ruta)) return socket.destroy();
  const destino = net.connect(Number(API.port || 80), API.hostname, () => {
    const lineas = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      const [k, v] = [req.rawHeaders[i], req.rawHeaders[i + 1]];
      lineas.push(`${k}: ${k.toLowerCase() === 'host' ? API.host : v}`);
    }
    destino.write(`${lineas.join('\r\n')}\r\n\r\n`);
    if (cabeza?.length) destino.write(cabeza);
    destino.pipe(socket);
    socket.pipe(destino);
  });
  const cerrar = () => { socket.destroy(); destino.destroy(); };
  destino.on('error', cerrar);
  socket.on('error', cerrar);
  destino.on('close', () => socket.destroy());
  socket.on('close', () => destino.destroy());
}

const servidor = http.createServer((req, res) => {
  const ruta = (req.url || '/').split('?')[0];
  if (esApi(ruta)) return pasarHttp(req, res);
  estatico(req, res, ruta).catch(() => { if (!res.headersSent) responder(res, 500, 'Error'); else res.destroy(); });
});
servidor.on('upgrade', pasarUpgrade);
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log(`Sitio ${RAIZ} en http://localhost:${PUERTO}/ · /api → ${API.origin}`);
});
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    servidor.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref(); // conexiones abiertas (WebSocket, keep-alive)
  });
}
