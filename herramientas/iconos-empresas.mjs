// Íconos e imágenes propias de cada cooperativa (con Chromium sin pantalla).
//
// 1) Íconos: toma img/icono.svg (pin rojo y taxi sobre fondo verde) y cambia el
//    verde del fondo por los colores de la ficha (colores.primario, primario2 y
//    oscuro). Escribe en empresas/<id>/:
//      icono-192.png, icono-512.png, icono-maskable-512.png, apple-touch-icon.png,
//      favicon-32.png e insignia-96.png
// 2) Fotos con QR: img/web/sticker-taxi.jpg y nevera.jpg llevan el QR de
//    Cootransrural. Para las demás se pinta encima un QR nítido hacia su página
//    de descarga (empresas/<id>/sticker-taxi.jpg y nevera.jpg) y se comprueba
//    que se lea con jsQR.
// 3) (Opcional) Capturas de los 3 diseños de TaxiCun con cada cooperativa
//    (taxicun/?e=<id>&d=a|b|c: «TaxiCun · <cooperativa>») para las tarjetas de la
//    web y la propuesta (empresas/<id>/disenos-a|b|c.jpg). Necesita el sitio
//    servido:  --capturas http://localhost:8774/
//
// 4) Huella empresas/<id>/imagenes.json (colores y URL usados): si la ficha
//    cambia de colores, generar-empresas.py avisa que hay que volver a correr esto.
//
// Cootransrural conserva sus íconos y fotos de img/.
// Uso:  node herramientas/iconos-empresas.mjs [id …] [--capturas URL] [--sin-fotos]
//       (sin ids: todas las fichas de empresas/*/ficha.json)
// Después: python3 herramientas/generar-empresas.py (las plantillas usan estos
// archivos si existen) y python3 herramientas/versionar.py.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import qrcode from '../vendor/qrcode.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const URL_PUBLICA = 'https://interos-sas.github.io/cootransrural-app/';
const PRINCIPAL = 'cootransrural';

const args = process.argv.slice(2);
const iCapturas = args.indexOf('--capturas');
const URL_CAPTURAS = iCapturas >= 0 ? args[iCapturas + 1].replace(/\/?$/, '/') : '';
const SIN_FOTOS = args.includes('--sin-fotos');
const pedidas = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--capturas');

const fichas = readdirSync(join(RAIZ, 'empresas'))
  .filter((id) => existsSync(join(RAIZ, 'empresas', id, 'ficha.json')))
  .map((id) => JSON.parse(readFileSync(join(RAIZ, 'empresas', id, 'ficha.json'), 'utf8')))
  .filter((f) => f.id !== PRINCIPAL && (!pedidas.length || pedidas.includes(f.id)));

if (!fichas.length) {
  console.log('No hay cooperativas para procesar (Cootransrural usa los íconos de img/).');
  process.exit(0);
}

/* ---------------- Colores ---------------- */

const hexRgb = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [10, 92, 51];
};
const rgbHex = (c) => '#' + c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mezclar = (a, b, t) => rgbHex(hexRgb(a).map((x, i) => x + (hexRgb(b)[i] - x) * t));

function svgIcono(ficha, { maskable = false } = {}) {
  const c = ficha.colores || {};
  const p1 = c.primario || '#0A5C33';
  const p2 = c.primario2 || mezclar(p1, '#FFFFFF', 0.08);
  const osc = c.oscuro || mezclar(p1, '#000000', 0.55);
  // Mismo degradado que el de Cootransrural (#0E7A43 → #05391F), con los tonos de la ficha.
  const claro = mezclar(p2, '#FFFFFF', 0.06);
  const fondo = mezclar(p1, osc, 0.45);
  let svg = readFileSync(join(RAIZ, 'img', maskable ? 'icono-maskable.svg' : 'icono.svg'), 'utf8');
  svg = svg.replace('stop-color="#0E7A43"', `stop-color="${claro}"`).replace('stop-color="#05391F"', `stop-color="${fondo}"`);
  if (maskable) svg = svg.replace('fill="#0A5C33"', `fill="${p1}"`);
  return svg;
}

/* ---------------- QR ---------------- */

function matrizQR(texto, nivel = 'M') {
  const qr = qrcode(0, nivel);
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  const filas = [];
  for (let f = 0; f < n; f++) {
    let fila = '';
    for (let c = 0; c < n; c++) fila += qr.isDark(f, c) ? '1' : '0';
    filas.push(fila);
  }
  return filas;
}

// Zonas del QR en las fotos originales (píxeles de la imagen de 1920 × 1440):
// «limpiar» se pinta del blanco del sticker y el QR nuevo va en «qr».
const FOTOS = [
  { archivo: 'sticker-taxi.jpg', muestra: [[680, 570], [1240, 570], [680, 1125], [1240, 1125]], limpiar: [700, 587, 520, 518], qr: [708, 595, 504] },
  { archivo: 'nevera.jpg', muestra: [[1230, 546], [1552, 546], [1230, 878], [1552, 878]], limpiar: [1236, 550, 310, 324], qr: [1243, 563, 296] },
];

/* ---------------- Chromium ---------------- */

const navegador = await chromium.launch({ executablePath: EXE });
const pagina = await navegador.newPage();
const jsqr = readFileSync(join(RAIZ, 'vendor', 'jsQR.min.js'), 'utf8');

async function png(svg, lado, destino) {
  await pagina.setViewportSize({ width: lado, height: lado });
  const datos = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  await pagina.setContent(`<html><body style="margin:0;background:transparent"><img id="i" src="${datos}" width="${lado}" height="${lado}" style="display:block"></body></html>`);
  await pagina.waitForFunction(() => document.getElementById('i').complete);
  await pagina.screenshot({ path: destino, omitBackground: true });
}

async function fotoConQR(foto, url, destino) {
  const original = 'data:image/jpeg;base64,' + readFileSync(join(RAIZ, 'img', 'web', foto.archivo)).toString('base64');
  await pagina.setViewportSize({ width: 800, height: 600 });
  await pagina.setContent('<html><body></body></html>');
  await pagina.addScriptTag({ content: jsqr });
  const r = await pagina.evaluate(async ({ original, foto, filas }) => {
    const img = new Image();
    img.src = original;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    // Color del sticker en sus cuatro esquinas (arriba izq., arriba der., abajo izq.,
    // abajo der.): la zona se rellena con un degradado entre ellas, así no se nota
    // un recuadro sobre la luz de la foto.
    const esquinas = foto.muestra.map(([x, y]) => {
      const d = g.getImageData(x - 4, y - 4, 8, 8).data;
      const s = [0, 0, 0];
      for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
      return s.map((v) => v / 64);
    });
    const [lx, ly, lw, lh] = foto.limpiar;
    const zona = g.getImageData(lx, ly, lw, lh);
    for (let y = 0; y < lh; y++) {
      const v = y / (lh - 1);
      for (let x = 0; x < lw; x++) {
        const u = x / (lw - 1);
        const i = (y * lw + x) * 4;
        for (let k = 0; k < 3; k++) {
          const arriba = esquinas[0][k] * (1 - u) + esquinas[1][k] * u;
          const abajo = esquinas[2][k] * (1 - u) + esquinas[3][k] * u;
          zona.data[i + k] = arriba * (1 - v) + abajo * v;
        }
        zona.data[i + 3] = 255;
      }
    }
    g.putImageData(zona, lx, ly);
    const blanco = esquinas.map((c) => `rgb(${c.map(Math.round).join(',')})`).join(' / ');
    // QR nuevo (módulos llenos y pegados, color casi negro como el original).
    const [qx, qy, lado] = foto.qr;
    const m = lado / filas.length;
    g.fillStyle = '#1B1B1B';
    filas.forEach((fila, f) => {
      for (let k = 0; k < fila.length; k++) {
        if (fila[k] === '1') g.fillRect(Math.floor(qx + k * m), Math.floor(qy + f * m), Math.ceil(m), Math.ceil(m));
      }
    });
    // Comprobación: se lee a tamaño real y reducida al 30 %.
    const leer = (escala) => {
      const w = Math.round(c.width * escala);
      const h = Math.round(c.height * escala);
      const c2 = document.createElement('canvas');
      c2.width = w;
      c2.height = h;
      const g2 = c2.getContext('2d');
      g2.drawImage(c, 0, 0, w, h);
      return window.jsQR(g2.getImageData(0, 0, w, h).data, w, h)?.data || null;
    };
    return { jpg: c.toDataURL('image/jpeg', 0.86), leido: leer(1), leidoChico: leer(0.3), blanco };
  }, { original, foto, filas: matrizQR(url) });
  writeFileSync(destino, Buffer.from(r.jpg.split(',')[1], 'base64'));
  return r;
}

let fallas = 0;
for (const ficha of fichas) {
  const dir = join(RAIZ, 'empresas', ficha.id);
  console.log(`· ${ficha.id} (${ficha.EMPRESA?.nombre}) · ${ficha.colores?.primario}`);
  const normal = svgIcono(ficha);
  const maskable = svgIcono(ficha, { maskable: true });
  for (const [svg, nombre, lado] of [[normal, 'icono-192.png', 192], [normal, 'icono-512.png', 512], [maskable, 'icono-maskable-512.png', 512],
    [normal, 'apple-touch-icon.png', 180], [normal, 'insignia-96.png', 96], [normal, 'favicon-32.png', 32]]) {
    await png(svg, lado, join(dir, nombre));
  }
  console.log('  íconos: icono-192, icono-512, icono-maskable-512, apple-touch-icon, insignia-96, favicon-32');

  if (!SIN_FOTOS) {
    const url = `${URL_PUBLICA}${ficha.id}/descargar/?o=foto`;
    for (const foto of FOTOS) {
      const r = await fotoConQR(foto, url, join(dir, foto.archivo));
      const bien = r.leido === url && r.leidoChico === url;
      if (!bien) fallas++;
      console.log(`  ${bien ? '✔' : '✘'} ${foto.archivo}: QR → ${r.leido || 'ilegible'} (reducida: ${r.leidoChico ? 'se lee' : 'NO se lee'}; fondo ${r.blanco})`);
    }
  }

  // Huella: con qué colores y para qué dirección se hicieron (generar-empresas.py
  // avisa si la ficha cambió después).
  // (Las fotos solo dependen de la dirección, que es fija por cooperativa.)
  writeFileSync(join(dir, 'imagenes.json'), JSON.stringify({ colores: ficha.colores || {}, url: `${URL_PUBLICA}${ficha.id}/descargar/?o=foto` }, null, 2) + '\n');

  if (URL_CAPTURAS) {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
      geolocation: { latitude: ficha.CENTRO.lat, longitude: ficha.CENTRO.lng }, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
    await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
    const p = await ctx.newPage();
    // TaxiCun tiene un solo diseño (A): el pasajero y el ingreso del conductor (con la foto de portada).
    for (const [archivo, ruta] of [['disenos-a.jpg', 'taxicun/'], ['conductor-a.jpg', 'taxicun/conductor/']]) {
      await p.goto(`${URL_CAPTURAS}${ruta}?e=${ficha.id}&d=a&sala=captura-${ficha.id}`, { waitUntil: 'load' });
      await p.waitForSelector('#carga', { state: 'detached', timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(3500);
      await p.screenshot({ path: join(dir, archivo), type: 'jpeg', quality: 80 });
    }
    console.log('  capturas: disenos-a.jpg (pasajero), conductor-a.jpg (conductor)');
    await ctx.close();
  }
}
await navegador.close();
if (fallas) {
  console.log(`\n${fallas} foto(s) con un QR que no se leyó bien: revisa las zonas de FOTOS.`);
  process.exitCode = 1;
} else {
  console.log('\nListo. Ahora: python3 herramientas/generar-empresas.py && python3 herramientas/versionar.py');
}
