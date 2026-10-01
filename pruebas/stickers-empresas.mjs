// Prueba de los stickers QR y del pago de prueba en TODAS las cooperativas
// (una vuelta por cada empresas/<id>/ficha.json que exista).
//  a) Página de stickers de la cooperativa: datos de su ficha, franja y marca
//     de agua en las propuestas, sin datos de otra cooperativa, sin «null».
//  b) Textos de todas las escenas (formatos × estilos): sin huecos, sin
//     «Cootransrural» en otras cooperativas, sin textos encimados; todos dicen
//     TaxiCun (la app) y llevan el ícono de TaxiCun.
//  c) PNG de 2 móviles decodificados con jsQR: el QR es EXACTAMENTE
//     <id>/descargar/?movil=…&o=sticker. SVG autónomo y legible.
//  d) PDF de las hojas: tamaño de página y de cada sticker, y el QR impreso.
//  e) pagar/?e=<id>: nombre y colores de la cooperativa, llave Bre-B del QR, y
//     el pago le llega al conductor de ESA cooperativa y NO al de otra.
// Uso: node pruebas/stickers-empresas.mjs [url_base]   (por defecto http://localhost:8775/)
//      SOLO=tabio,tenjo node pruebas/stickers-empresas.mjs   → solo esas cooperativas
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = (process.argv[2] || 'http://localhost:8775/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/coop-stickers/').replace(/\/?$/, '/');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PRINCIPAL = 'cootransrural';
mkdirSync(DIR, { recursive: true });

// Fichas que existen hoy (las que falten se prueban cuando aparezcan).
const FICHAS = readdirSync(path.join(RAIZ, 'empresas'))
  .filter((id) => existsSync(path.join(RAIZ, 'empresas', id, 'ficha.json')))
  .map((id) => JSON.parse(readFileSync(path.join(RAIZ, 'empresas', id, 'ficha.json'), 'utf8')))
  .sort((a, b) => (a.id !== PRINCIPAL) - (b.id !== PRINCIPAL) || a.id.localeCompare(b.id));
const SOLO = (process.env.SOLO || '').split(',').map((s) => s.trim()).filter(Boolean);
const A_PROBAR = SOLO.length ? FICHAS.filter((f) => SOLO.includes(f.id)) : FICHAS;

let fallas = 0;
const avisos = [];
const ok = (c, m) => {
  console.log((c ? '✔' : '✘') + ' ' + m);
  if (!c) {
    fallas++;
    process.exitCode = 1;
  }
};
const aviso = (m) => {
  console.log('⚠ ' + m);
  avisos.push(m);
};
const cerca = (a, b, tol = 0.15) => Math.abs(a - b) <= tol;
const PX_MM = 96 / 25.4;
const MEDIDAS = { taxi: [150, 150], espaldar: [100, 100], iman: [90, 55], afiche: [140, 216], tarjeta: [90, 50] };
const PAPEL = { carta: [215.9, 279.4], a4: [210, 297] };
const externo = (t) => /cartocdn|nominatim|project-osrm|openstreetmap|mapbox|mosquitto|emqx|hivemq|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION/i.test(t);
const prefijoDe = (id) => (id === PRINCIPAL ? '' : `${id}/`);
const rgbDe = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

function infoPNG(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const firma = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  return { firma, ancho: v.getUint32(16), alto: v.getUint32(20) };
}

const navegador = await chromium.launch({ executablePath: EXE });

async function estado200(url) {
  try {
    const r = await fetch(url);
    return r.status;
  } catch {
    return 0;
  }
}

for (const F of A_PROBAR) {
  const E = F.EMPRESA;
  const id = F.id;
  const pref = prefijoDe(id);
  const esPrincipal = id === PRINCIPAL;
  const esPropuesta = F.estado === 'propuesta';
  const dir = `${DIR}${id}/`;
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (/\.(png|svg|pdf|txt)$/.test(f)) unlinkSync(dir + f);
  const taxis = Number.isInteger(E.taxis) && E.taxis > 0 ? E.taxis : 30;
  const tieneTel = Boolean((E.telefonoVisible || E.telefono || '').trim());
  const tieneWa = Boolean((E.whatsapp || '').trim());
  console.log(`\n══════ ${E.nombre} (${id}) · ${F.estado} · ${taxis} móviles ${E.taxis ? '' : '(no se sabe cuántos: 30)'} ══════`);

  const errores = [];
  const ctx = await navegador.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    geolocation: { latitude: F.CENTRO.lat, longitude: F.CENTRO.lng },
    permissions: ['geolocation'],
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('ct.envivo', 'no');
    if (!sessionStorage.getItem('prueba-iniciada')) {
      for (const k of Object.keys(localStorage)) if (/(^|\.)stickers$|pagosPrueba$/.test(k)) localStorage.removeItem(k);
      sessionStorage.setItem('prueba-iniciada', '1');
    }
    window.print = () => {
      window.__impresiones = (window.__impresiones || 0) + 1;
    };
  });
  const vigilar = (p, etiqueta) => {
    p.on('pageerror', (e) => errores.push(`${etiqueta} pageerror: ${e.message}`));
    p.on('console', (m) => {
      if (m.type() === 'error' && !externo(m.text())) errores.push(`${etiqueta} console: ${m.text()}`);
    });
    p.on('requestfailed', (r) => {
      if (!externo(r.url()) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) errores.push(`${etiqueta} recurso: ${r.url()} ${r.failure()?.errorText || ''}`);
    });
  };

  // -------------------------------------------------------------------------
  // a) Página de stickers
  // -------------------------------------------------------------------------
  console.log('— a) Página de stickers —');
  const p = await ctx.newPage();
  vigilar(p, 'stickers');
  await p.goto(`${BASE}${pref}stickers/`);
  await p.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 25000 });
  await p.addScriptTag({ url: BASE + 'vendor/jsQR.min.js' });
  await p.waitForTimeout(400);

  const pag = await p.evaluate(() => ({
    empresa: window.stickers.empresa,
    clave: window.stickers.clave,
    titulo: document.title,
    hasta: Number(window.stickers.estado.hasta),
    desde: Number(window.stickers.estado.desde),
    opciones: document.querySelectorAll('#movil-actual option').length,
    estilos: Object.keys(window.stickers.ESTILOS),
    nombresEstilos: Object.values(window.stickers.ESTILOS).map((e) => e.nombre),
    robots: document.querySelector('meta[name="robots"]')?.content || '',
    franja: document.querySelector('.franja-propuesta')?.innerText || '',
    franjaVisible: Boolean(document.querySelector('.franja-propuesta')?.offsetParent),
    marcaAgua: Boolean(document.querySelector('#marca-agua')?.offsetParent),
    pie: document.querySelector('.pie-pagina')?.innerText || '',
    texto: document.body.innerText,
    barra: document.querySelector('.marca strong')?.textContent,
    iconoVisible: getComputedStyle(document.querySelector('#marca-icono')).visibility,
    iconoSrc: document.querySelector('#marca-icono').src,
    colorPaso: getComputedStyle(document.querySelector('.paso')).backgroundColor,
    placeholder: document.querySelector('#url-base').placeholder,
    enlaceApp: document.querySelector('.barra-enlace').href,
  }));
  ok(pag.empresa === id, `la página fija la cooperativa «${pag.empresa}»`);
  ok(pag.titulo.includes(E.nombre) && pag.barra === E.nombre, `título y barra con «${E.nombre}»`);
  ok(pag.desde === 1 && pag.hasta === taxis && pag.opciones === taxis, `móviles 001–${String(taxis).padStart(3, '0')} por defecto (${pag.opciones} en el selector)`);
  ok(pag.clave === (esPrincipal ? 'ct.stickers' : `ct.${id}.stickers`), `opciones guardadas aparte (${pag.clave})`);
  if (esPrincipal) ok(pag.estilos.join() === 'clasico,verde,neon', `estilos de siempre: ${pag.nombresEstilos.join(', ')}`);
  else ok(pag.estilos.join() === 'clasico,cooperativa,verde,neon' && pag.nombresEstilos[1] === `Color de la ${E.tipo === 'empresa' ? 'empresa' : 'cooperativa'}`, `4 estilos: ${pag.nombresEstilos.join(', ')}`);
  ok(pag.enlaceApp === `${BASE}taxicun/?e=${id}`, `«Abrir TaxiCun» lleva a ${pag.enlaceApp}`);
  ok(pag.iconoVisible === 'visible' && (esPrincipal ? /img\/icono\.svg/.test(pag.iconoSrc) : pag.iconoSrc.startsWith('blob:')), `ícono de la barra ${esPrincipal ? 'de siempre' : 'con los colores de la cooperativa'}`);
  if (!esPrincipal) ok(pag.colorPaso === rgbDe(F.colores.primario), `la página usa el color primario (${pag.colorPaso})`);
  ok(/desarrollada por interOS/.test(pag.pie) && /TaxiCun/.test(pag.pie), 'pie «App TaxiCun · desarrollada por interOS»');
  if (esPropuesta) {
    ok(pag.robots === 'noindex', 'propuesta: <meta name="robots" content="noindex">');
    ok(pag.franjaVisible && pag.franja.includes(`Propuesta de demostración de TaxiCun, preparada por interOS para ${E.razonSocial}`) && /No es la página oficial de la (cooperativa|empresa)/.test(pag.franja) && pag.franja.includes(`la ${E.tipo === 'empresa' ? 'empresa' : 'cooperativa'}`), 'propuesta: franja «Propuesta de demostración … No es la página oficial»');
    ok(pag.marcaAgua, 'propuesta: marca de agua «PROPUESTA» en la vista previa');
    // Aun con la marca de agua, el QR de la pantalla se lee (foto de la vista previa).
    const foto = await (await p.$('#vista')).screenshot();
    const [enPantalla] = await p.evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      return [window.jsQR(d.data, d.width, d.height)?.data ?? null];
    }, foto.toString('base64'));
    ok(enPantalla === `${BASE}${pref}descargar/?movil=001&o=sticker`, `propuesta: con la marca de agua, el QR de la vista previa se lee («${enPantalla}»)`);
  } else {
    ok(!pag.robots && !pag.franja && !pag.marcaAgua, 'cliente: sin franja de propuesta, sin marca de agua y sin noindex');
  }
  if (!esPrincipal) ok(!/cootransrural|el rosal/i.test(pag.texto + pag.titulo + pag.placeholder), 'la página no menciona a Cootransrural ni a El Rosal');
  ok(!/\bnull\b|undefined|NaN/.test(pag.texto + pag.titulo), 'la página no muestra «null», «undefined» ni «NaN»');
  await p.waitForFunction(() => /verificado/i.test(document.querySelector('#chip-lectura')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/verificado/i.test(await p.textContent('#chip-lectura')), 'la vista previa lee su propio QR');
  await p.screenshot({ path: dir + 'pagina-escritorio.png' });

  // -------------------------------------------------------------------------
  // b) Textos de todas las escenas
  // -------------------------------------------------------------------------
  console.log('— b) Textos de los stickers —');
  const textos = await p.evaluate(async () => {
    const { anchoTexto } = await import(new URL('../stickers/escena.js', document.querySelector('script[type="module"]').src).href);
    const resultado = [];
    for (const formato of Object.keys(window.stickers.FORMATOS)) {
      for (const estilo of Object.keys(window.stickers.ESTILOS)) {
        for (const movil of ['001', '']) {
          const guardado = window.stickers.estado.modo;
          window.stickers.estado.modo = movil ? 'rango' : 'generico';
          const e = window.stickers.escenaDe(movil, formato, estilo);
          window.stickers.estado.modo = guardado;
          const cajas = [];
          const recorrer = (ops, dx = 0, dy = 0) =>
            ops.forEach((op) => {
              if (op.t === 'grupo') recorrer(op.ops, dx + (op.x || 0), dy + (op.y || 0));
              if (op.t !== 'texto') return;
              const total = op.tramos.reduce((s, t) => s + anchoTexto(t.texto, t), 0);
              let x = op.x + dx;
              if (op.alinear === 'centro') x -= total / 2;
              else if (op.alinear === 'der') x -= total;
              const tam = Math.max(...op.tramos.map((t) => t.tam));
              cajas.push({ texto: op.tramos.map((t) => t.texto).join(''), x1: x, x2: x + total, y: op.y + dy, tam, rotado: Boolean(op.rotar) });
            });
          recorrer(e.ops);
          resultado.push({ formato, estilo, movil, ancho: e.ancho, alto: e.alto, cajas });
        }
      }
    }
    return resultado;
  });
  const todos = textos.flatMap((r) => r.cajas.map((c) => c.texto));
  ok(todos.every((t) => typeof t === 'string' && t.trim().length > 0), 'ningún texto vacío en los stickers');
  ok(!todos.some((t) => /\bnull\b|undefined|NaN|\$0/.test(t)), 'ningún «null», «undefined», «NaN» ni «$0» en los stickers');
  ok(!todos.some((t) => /PROPUESTA/.test(t)), 'la marca «PROPUESTA» no va en los stickers (solo en la vista previa)');
  if (!esPrincipal) ok(!todos.some((t) => /cootransrural|el rosal|320 904/i.test(t)), 'sin datos de Cootransrural en los stickers');
  const del = (formato) => textos.filter((r) => r.formato === formato).flatMap((r) => r.cajas.map((c) => c.texto));
  for (const formato of ['taxi', 'iman', 'afiche', 'tarjeta']) ok(del(formato).includes(E.nombre), `${formato}: lleva el nombre «${E.nombre}»`);
  ok(del('iman').includes(E.pueblo.toUpperCase()) && del('tarjeta').some((t) => t.includes(E.pueblo)), `imán y tarjeta: el pueblo (${E.pueblo})`);
  if (E.lema) ok(del('afiche').includes(E.lema) && del('tarjeta').includes(E.lema), `afiche y tarjeta: el lema «${E.lema}»`);
  if (tieneTel) {
    ok(['taxi', 'iman', 'afiche', 'tarjeta'].every((f) => del(f).includes(E.telefonoVisible)), `teléfono ${E.telefonoVisible} en taxi, imán, afiche y tarjeta`);
  } else {
    ok(!todos.some((t) => /CENTRAL/.test(t)) || tieneWa, 'sin teléfono: no aparece «CENTRAL»');
    if (!tieneWa) {
      ok(del('afiche').includes('Pide tu taxi con TaxiCun'), 'sin teléfono: el afiche pone «Pide tu taxi con TaxiCun» en grande');
      ok(del('iman').includes('Descarga TaxiCun gratis') && del('tarjeta').includes('Descarga TaxiCun gratis'), 'sin teléfono: imán y tarjeta dicen «Descarga TaxiCun gratis» donde iba el número');
      ok(del('taxi').includes('SERVICIO 24 HORAS') || !E.servicio24h, 'sin teléfono: la banda del taxi dice «SERVICIO 24 HORAS» con el nombre en grande');
    }
  }
  if (E.servicio24h) ok(del('iman').includes('Servicio 24 horas') && del('afiche').includes('24 h'), 'servicio 24 horas en imán y afiche');
  // La app es TaxiCun: «Pide tu taxi con TaxiCun», el nombre y el ícono de TaxiCun en cada formato.
  ok(del('taxi').includes('¡Pide tu taxi con TaxiCun!') && del('taxi').includes('TaxiCun'), 'taxi: «¡Pide tu taxi con TaxiCun!» y el nombre TaxiCun bajo el ícono');
  ok(del('iman').includes('Pide tu taxi con') && del('iman').includes('TaxiCun') && del('tarjeta').includes('Pide tu taxi con') && del('tarjeta').includes('TaxiCun'), 'imán y tarjeta: «Pide tu taxi con» + TaxiCun');
  ok(del('afiche').includes('con TaxiCun') && del('espaldar').includes('Descarga TaxiCun'), 'afiche «con TaxiCun» y espaldar «Descarga TaxiCun»');
  ok(!todos.some((t) => /con la app|Descarga la app/.test(t)), 'ningún sticker dice «la app» sin nombrarla');
  const conIcono = await p.evaluate(() => {
    const tiene = (ops) => ops.some((op) => (op.t === 'imagen' && op.src === 'taxicun') || (op.t === 'grupo' && tiene(op.ops)));
    const malos = [];
    for (const formato of Object.keys(window.stickers.FORMATOS)) {
      for (const estilo of Object.keys(window.stickers.ESTILOS)) {
        if (!tiene(window.stickers.escenaDe('001', formato, estilo).ops)) malos.push(`${formato}/${estilo}`);
      }
    }
    return malos;
  });
  ok(!conIcono.length, `todos los formatos y estilos llevan el ícono de TaxiCun${conIcono.length ? ' — faltan: ' + conIcono.join(', ') : ''}`);
  ok(del('afiche').includes(`OFERTAS DE LA ${E.tipo === 'empresa' ? 'EMPRESA' : 'COOPERATIVA'}`) && del('afiche').includes('−10 %') && del('afiche').includes('50 %'), 'afiche: ofertas de la cooperativa (−10 % programado, 50 % fidelidad)');
  // Textos dentro del sticker y sin encimarse en el mismo renglón.
  const fuera = [];
  const encimados = [];
  for (const r of textos) {
    for (const c of r.cajas) if (!c.rotado && (c.x1 < -0.3 || c.x2 > r.ancho + 0.3)) fuera.push(`${r.formato}/${r.estilo}: «${c.texto}» (${c.x1.toFixed(1)}–${c.x2.toFixed(1)} de ${r.ancho} mm)`);
    for (let i = 0; i < r.cajas.length; i++) {
      for (let j = i + 1; j < r.cajas.length; j++) {
        const a = r.cajas[i];
        const b = r.cajas[j];
        const mismoRenglon = Math.abs(a.y - b.y) < Math.min(a.tam, b.tam) * 0.8;
        if (mismoRenglon && a.x1 < b.x2 - 0.2 && b.x1 < a.x2 - 0.2) encimados.push(`${r.formato}/${r.estilo}${r.movil ? '' : ' sin móvil'}: «${a.texto}» y «${b.texto}»`);
      }
    }
  }
  ok(!fuera.length, 'todos los textos caben en el sticker' + (fuera.length ? ':\n   ' + [...new Set(fuera)].slice(0, 6).join('\n   ') : ''));
  ok(!encimados.length, 'ningún texto se monta sobre otro del mismo renglón' + (encimados.length ? ':\n   ' + [...new Set(encimados)].slice(0, 6).join('\n   ') : ''));

  // -------------------------------------------------------------------------
  // c) PNG y SVG: el QR lleva a <id>/descargar/
  // -------------------------------------------------------------------------
  console.log('— c) PNG y SVG —');
  async function leerQR(base64, tipo = 'image/png', anchos = [null, 700]) {
    return p.evaluate(
      async ({ base64, tipo, anchos }) => {
        const img = new Image();
        img.src = `data:${tipo};base64,${base64}`;
        await img.decode();
        const w0 = img.naturalWidth || 1400;
        const h0 = img.naturalHeight || 1400;
        return anchos.map((w) => {
          const W = w || w0;
          const c = document.createElement('canvas');
          c.width = W;
          c.height = Math.round((h0 * W) / w0);
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(img, 0, 0, c.width, c.height);
          const d = g.getImageData(0, 0, c.width, c.height);
          return window.jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
        });
      },
      { base64, tipo, anchos },
    );
  }
  async function poner(cambios) {
    await p.evaluate((c) => {
      Object.assign(window.stickers.estado, c);
      window.stickers.actualizar();
    }, cambios);
    await p.waitForTimeout(250);
  }
  async function descargarCon(boton) {
    const [descarga] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.click(boton)]);
    const ruta = dir + descarga.suggestedFilename();
    await descarga.saveAs(ruta);
    return { nombre: descarga.suggestedFilename(), bytes: new Uint8Array(readFileSync(ruta)) };
  }
  const estiloPropio = esPrincipal ? 'verde' : 'cooperativa';
  const ultimo = String(taxis).padStart(3, '0');
  const slug = String(E.nombreCorto || E.nombre).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  for (const [movil, estilo] of [['001', 'clasico'], [ultimo, estiloPropio]]) {
    await poner({ formato: 'taxi', estilo, modo: 'rango', urlBase: '', movilActual: movil });
    const esperado = `${BASE}${pref}descargar/?movil=${movil}&o=sticker`;
    ok((await p.getAttribute('#url-final', 'href')) === esperado, `móvil ${movil}: el panel muestra ${esperado}`);
    const { nombre, bytes } = await descargarCon('#descargar-png');
    const info = infoPNG(bytes);
    ok(info.firma && info.ancho === 1772 && info.alto === 1772, `${nombre}: 1772 × 1772 px (15 cm a 300 ppp)`);
    ok(nombre.startsWith(`${slug}-taxi-`), `nombre del archivo con la cooperativa (${nombre})`);
    const [completo, chico] = await leerQR(Buffer.from(bytes).toString('base64'));
    ok(completo === esperado && chico === esperado, `móvil ${movil} (${estilo}): jsQR lee EXACTAMENTE «${completo}»`);
  }
  // Los demás formatos en el estilo de la cooperativa: el QR se lee.
  for (const formato of ['iman', 'tarjeta', 'afiche', 'espaldar']) {
    await poner({ formato, estilo: estiloPropio, movilActual: '002' });
    const { bytes } = await descargarCon('#descargar-png');
    const [leido] = await leerQR(Buffer.from(bytes).toString('base64'), 'image/png', [null]);
    ok(leido === `${BASE}${pref}descargar/?movil=002&o=sticker`, `${formato} (${estiloPropio}): el QR se lee`);
  }
  // Sticker sin móvil.
  await poner({ formato: 'iman', estilo: 'clasico', modo: 'generico' });
  {
    const { bytes } = await descargarCon('#descargar-png');
    const [leido] = await leerQR(Buffer.from(bytes).toString('base64'), 'image/png', [null]);
    ok(leido === `${BASE}${pref}descargar/?o=sticker`, `sticker sin móvil: «${leido}»`);
  }
  // SVG vectorial.
  await poner({ formato: 'taxi', estilo: estiloPropio, modo: 'rango', movilActual: '001' });
  {
    const { nombre, bytes } = await descargarCon('#descargar-svg');
    const svg = Buffer.from(bytes).toString('utf8');
    ok(/width="150mm" height="150mm"/.test(svg) && /@font-face/.test(svg) && !/href="(?!data:)[^"#]/.test(svg), `${nombre}: 150 × 150 mm, fuentes incluidas y autónomo`);
    ok(svg.includes(`<title>${E.nombre} ·`) && !/PROPUESTA/.test(svg), 'SVG con el nombre de la cooperativa y sin marca de agua');
    if (!esPrincipal) ok(!/cootransrural/i.test(svg), 'SVG sin «Cootransrural»');
    const [leido] = await leerQR(Buffer.from(svg).toString('base64'), 'image/svg+xml', [1400]);
    ok(leido === `${BASE}${pref}descargar/?movil=001&o=sticker`, `SVG: jsQR lee «${leido}»`);
  }

  // -------------------------------------------------------------------------
  // d) Hojas de impresión y PDF
  // -------------------------------------------------------------------------
  console.log('— d) Hojas y PDF —');
  async function hojas(cambios, nombre, papel, esperadas) {
    await poner(cambios);
    await p.click('#imprimir');
    await p.waitForFunction(() => document.querySelectorAll('#impresion .hoja').length > 0);
    await p.emulateMedia({ media: 'print' });
    const r = await p.evaluate(() =>
      [...document.querySelectorAll('#impresion .hoja')].map((h) => {
        const rh = h.getBoundingClientRect();
        return {
          w: rh.width,
          h: rh.height,
          pie: h.querySelector('.marcas text')?.textContent || '',
          piezas: [...h.querySelectorAll('.pieza')].map((el) => {
            const re = el.getBoundingClientRect();
            return { w: re.width, h: re.height, movil: el.dataset.movil };
          }),
        };
      }),
    );
    const [wP, hP] = PAPEL[papel];
    const [wS, hS] = MEDIDAS[cambios.formato];
    const piezas = r.flatMap((x) => x.piezas);
    ok(r.length === esperadas.hojas && piezas.length === esperadas.stickers, `${nombre}: ${r.length} hojas y ${piezas.length} stickers`);
    ok(r.every((x) => cerca(x.w / PX_MM, wP) && cerca(x.h / PX_MM, hP)), `${nombre}: hojas de ${wP} × ${hP} mm`);
    ok(piezas.every((s) => cerca(s.w / PX_MM, wS) && cerca(s.h / PX_MM, hS)), `${nombre}: cada sticker mide ${wS} × ${hS} mm`);
    const pie = r[0].pie;
    ok(pie.startsWith(`${E.nombre} · TaxiCun`) && (esPropuesta ? /^[^·]+ · TaxiCun · Propuesta de demostración · /.test(pie) && !/interOS/.test(pie) : !/Propuesta/.test(pie)), `${nombre}: pie de la hoja «${pie.slice(0, 70)}…»`);
    const ruta = `${dir}hoja-${nombre}.pdf`;
    await p.pdf({ path: ruta, preferCSSPageSize: true, printBackground: true });
    const info = execFileSync('pdfinfo', [ruta]).toString();
    const paginas = Number(/Pages:\s+(\d+)/.exec(info)[1]);
    const [, wPt, hPt] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info).map(Number);
    ok(paginas === esperadas.hojas, `PDF ${nombre}: ${paginas} páginas`);
    ok(cerca(wPt, (wP * 72) / 25.4, 0.6) && cerca(hPt, (hP * 72) / 25.4, 0.6), `PDF ${nombre}: ${((wPt * 25.4) / 72).toFixed(1)} × ${((hPt * 25.4) / 72).toFixed(1)} mm`);
    const textoPDF = execFileSync('pdftotext', [ruta, '-']).toString();
    if (!esPrincipal) ok(!/cootransrural|el rosal/i.test(textoPDF), `PDF ${nombre}: sin «Cootransrural» ni «El Rosal»`);
    ok(!/PROPUESTA/.test(textoPDF), `PDF ${nombre}: sin la marca de agua «PROPUESTA»`);
    execFileSync('pdftoppm', ['-r', '110', '-png', '-f', '1', '-l', '1', '-singlefile', ruta, `${dir}hoja-${nombre}`]);
    await p.emulateMedia({ media: 'screen' });
    return `${dir}hoja-${nombre}.png`;
  }
  const copias = { taxi: 1, espaldar: 1, iman: 1, afiche: 1, tarjeta: 1 };
  {
    const png = await hojas({ formato: 'taxi', estilo: estiloPropio, modo: 'rango', desde: 1, hasta: 2, copias, papel: 'carta', sangrado: true }, 'taxi-carta', 'carta', { hojas: 2, stickers: 2 });
    const [leido] = await leerQR(readFileSync(png).toString('base64'), 'image/png', [null]);
    ok(leido === `${BASE}${pref}descargar/?movil=001&o=sticker`, `PDF taxi: el QR impreso se lee «${leido}»`);
  }
  await hojas({ formato: 'tarjeta', estilo: 'clasico', modo: 'rango', desde: 1, hasta: 12, copias, papel: 'carta' }, 'tarjeta-carta', 'carta', { hojas: 2, stickers: 12 });
  {
    const png = await hojas({ formato: 'afiche', estilo: estiloPropio, modo: 'rango', desde: 3, hasta: 3, copias, papel: 'a4' }, 'afiche-a4', 'a4', { hojas: 1, stickers: 1 });
    const [leido] = await leerQR(readFileSync(png).toString('base64'), 'image/png', [null]);
    ok(leido === `${BASE}${pref}descargar/?movil=003&o=sticker`, `PDF afiche: el QR impreso se lee «${leido}»`);
  }

  // Capturas de la vista previa.
  await poner({ modo: 'rango', desde: 1, hasta: taxis, urlBase: '', movilActual: '007' });
  for (const estilo of [...new Set(['clasico', estiloPropio])]) {
    for (const formato of Object.keys(MEDIDAS)) {
      await poner({ formato, estilo, movilActual: '007' });
      await (await p.$('#vista')).screenshot({ path: `${dir}vista-${formato}-${estilo}.png` });
    }
  }
  await poner({ formato: 'taxi', estilo: 'clasico', modo: 'generico' });
  await (await p.$('#vista')).screenshot({ path: `${dir}vista-taxi-sin-movil.png` });
  await poner({ formato: 'taxi', estilo: estiloPropio, modo: 'rango', movilActual: '007' });
  await p.screenshot({ path: dir + 'pagina-completa.png', fullPage: true });

  // Celular.
  const pm = await ctx.newPage();
  vigilar(pm, 'celular');
  await pm.setViewportSize({ width: 390, height: 844 });
  await pm.goto(`${BASE}${pref}stickers/`);
  await pm.waitForFunction(() => document.documentElement.dataset.listo === '1', null, { timeout: 25000 });
  await pm.waitForTimeout(500);
  const desborde = await pm.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(desborde <= 1, `celular: sin desborde horizontal (${desborde} px)`);
  await pm.screenshot({ path: dir + 'celular.png' });
  await pm.close();

  // Páginas a las que llevan los enlaces (las hace otro equipo: solo se avisa).
  for (const ruta of [`${pref}descargar/`, `${pref}app/`]) {
    const st = await estado200(BASE + ruta);
    if (st !== 200) aviso(`${id}: ${ruta} responde ${st} (el QR de los stickers lleva ahí)`);
  }

  // -------------------------------------------------------------------------
  // e) Pago de prueba: llega al conductor de ESTA cooperativa y no al de otra
  // -------------------------------------------------------------------------
  console.log('— e) Pago de prueba —');
  const otra = FICHAS.find((x) => x.id !== id);
  const nucleo = async (empresa, etiqueta) => {
    const pg = await ctx.newPage();
    vigilar(pg, etiqueta);
    await pg.goto(`${BASE}pruebas/nucleo.html?e=${empresa}`);
    await pg.waitForFunction(() => window.listo);
    return pg;
  };
  const pc = await nucleo(id, 'conductor');
  const cobro = await pc.evaluate(async () => {
    const { N } = window;
    N.perfil.ingresarConductor({ movil: '7', pin: '1234' });
    const c = await N.crearConductor();
    window.c = c;
    c.conectar();
    await c.simularSolicitud();
    const s = c.estado.solicitudes[0];
    await c.aceptar(s.viajeId);
    c.llegue();
    await c.iniciar(c.estado.viaje.codigoSimulado);
    const r = c.finalizar();
    // El pasajero simulado no paga: el pago tiene que llegar desde pagar/.
    c.pasajeroSim?.detener();
    return { ...r, empresa: N.ID_EMPRESA, viajeId: c.estado.viaje.id, fase: c.estado.viaje.fase, llave: N.llaveBreB('007'), sala: c.estado.sala };
  });
  const u = new URL(cobro.url);
  ok(cobro.empresa === id && cobro.fase === 'cobrando', `conductor de ${id} cobrando ${cobro.valor} (viaje ${cobro.viajeId})`);
  ok(u.href.startsWith(`${BASE}pagar/`) && (esPrincipal ? !u.searchParams.has('e') : u.searchParams.get('e') === id), `URL de cobro: ${u.pathname}${u.search.slice(0, 40)}…`);
  ok(u.searchParams.get('b') === cobro.llave, `la llave Bre-B del QR es ${cobro.llave}`);

  // Otra cooperativa escuchando en la misma sala.
  let po = null;
  if (otra) {
    po = await nucleo(otra.id, 'otra');
    await po.evaluate((sala) => {
      window.recibidos = [];
      const bus = new window.N.Bus({ sala });
      bus.on('pago', (d) => window.recibidos.push(d));
    }, cobro.sala);
  }

  const pagar = async (url, etiqueta) => {
    const pg = await ctx.newPage();
    vigilar(pg, etiqueta);
    await pg.setViewportSize({ width: 412, height: 915 });
    await pg.goto(url);
    await pg.waitForSelector('#form-pago', { timeout: 15000 });
    return pg;
  };

  // 1) El mismo cobro abierto como si fuera de OTRA cooperativa: no le llega a este conductor.
  if (otra) {
    const cruzada = new URL(cobro.url);
    if (otra.id === PRINCIPAL) cruzada.searchParams.delete('e');
    else cruzada.searchParams.set('e', otra.id);
    const px = await pagar(cruzada.href, 'pagar-cruzado');
    const cab = await px.textContent('.pago-cabeza');
    ok(cab.includes(otra.EMPRESA.nombre), `con ?e=${otra.id} la página muestra «${otra.EMPRESA.nombre}»`);
    await px.click('#boton-pagar');
    await px.waitForSelector('.comprobante', { timeout: 15000 });
    await px.waitForTimeout(1500);
    const fase = await pc.evaluate(() => window.c.estado.viaje?.fase);
    const recibidosOtra = await po.evaluate(() => window.recibidos.length);
    ok(fase === 'cobrando', `un pago publicado en el canal de ${otra.id} NO le llega al conductor de ${id} (sigue «${fase}»)`);
    ok(recibidosOtra >= 1, `…y sí le llega al canal de ${otra.id} (${recibidosOtra} mensaje(s))`);
    await px.close();
  }
  const antesOtra = po ? await po.evaluate(() => window.recibidos.length) : 0;

  // 2) El cobro de verdad.
  const pp = await pagar(cobro.url, 'pagar');
  const vista = await pp.evaluate(() => ({
    titulo: document.title,
    cabeza: document.querySelector('.pago-cabeza').innerText,
    fondo: getComputedStyle(document.querySelector('.pago-cabeza')).backgroundImage,
    icono: document.querySelector('.pago-icono').src,
    franja: document.querySelector('#franja-propuesta').hidden ? '' : document.querySelector('#franja-propuesta').innerText,
    detalle: document.querySelector('#franja-detalle').textContent,
    pie: document.querySelector('#pie').innerText,
    enlaceApp: document.querySelector('#pie a').href,
    texto: document.body.innerText,
    elegida: document.querySelector('input[name="billetera"]:checked')?.value,
    empresa: window.CT_EMPRESA,
  }));
  ok(vista.empresa === id, `pagar/ fija window.CT_EMPRESA = «${vista.empresa}» desde ?e=`);
  ok(vista.cabeza.includes(E.nombre) && vista.cabeza.includes('Móvil 007') && vista.titulo.includes(E.nombre), `cabecera: «${vista.cabeza.split('\n')[0]}»`);
  ok(vista.cabeza.includes(`Llave Bre-B: ${cobro.llave}`) && vista.elegida === 'breb', `muestra la llave Bre-B del QR (${cobro.llave}) y elige Bre-B`);
  ok(vista.cabeza.includes(E.pueblo), `cobro del viaje en ${E.pueblo}`);
  const colorCabeza = rgbDe(F.colores.primario2 || F.colores.primario);
  ok(vista.fondo.includes(colorCabeza) && vista.fondo.includes(rgbDe(F.colores.oscuro)), `cabecera con los colores de la cooperativa (${colorCabeza})`);
  ok(esPrincipal ? /icono-192\.png/.test(vista.icono) : vista.icono.startsWith('blob:'), 'ícono de la app con los colores de la cooperativa');
  ok(vista.detalle.includes(E.nombre) && /App TaxiCun · desarrollada por interOS/.test(vista.pie) && vista.enlaceApp === `${BASE}taxicun/?e=${id}`, 'franja de prueba, pie «App TaxiCun · desarrollada por interOS» y enlace a TaxiCun con la cooperativa');
  if (esPropuesta) ok(vista.franja.includes(`Propuesta de demostración de TaxiCun, preparada por interOS para ${E.razonSocial}`) && /No es la página oficial/.test(vista.franja), 'propuesta: franja de propuesta de TaxiCun en pagar/');
  else ok(!vista.franja, 'cliente: sin franja de propuesta en pagar/');
  if (!esPrincipal) ok(!/cootransrural|el rosal/i.test(vista.texto + vista.titulo), 'pagar/ no menciona a Cootransrural ni a El Rosal');
  ok(!/\bnull\b|undefined|NaN/.test(vista.texto), 'pagar/ sin «null» ni «undefined»');
  await pp.screenshot({ path: dir + 'pagar-formulario.png', fullPage: true });
  await pp.click('#boton-pagar');
  await pp.waitForSelector('.comprobante', { timeout: 15000 });
  await pp.waitForFunction(() => document.querySelector('#estado-envio')?.classList.contains('ok'), null, { timeout: 8000 }).catch(() => {});
  const final = await pc.evaluate(() => ({ fase: window.c.estado.viaje?.fase, pago: window.c.estado.viaje?.pago }));
  const recibo = await pp.evaluate(() => ({ texto: document.querySelector('.comprobante').innerText, ok: document.querySelector('#estado-envio').classList.contains('ok') }));
  ok(final.fase === 'calificar' && final.pago?.metodo === 'qr' && final.pago?.billetera === 'Bre-B', `el conductor de ${id} recibió el pago (${final.pago?.billetera}, ref. ${final.pago?.ref})`);
  ok(recibo.ok && /El conductor recibió tu pago/.test(recibo.texto), 'pagar/ recibe la confirmación del conductor');
  ok(recibo.texto.includes(cobro.llave), 'el comprobante muestra la llave Bre-B');
  if (po) {
    const despues = await po.evaluate(() => window.recibidos.length);
    ok(despues === antesOtra, `el pago NO le llegó a ${otra.id} (${despues - antesOtra} mensajes nuevos)`);
  }
  const guardado = await pp.evaluate((k) => Boolean(JSON.parse(localStorage.getItem(k) || '{}')[new URLSearchParams(location.search).get('id')]), esPrincipal ? 'ct.pagosPrueba' : `ct.${id}.pagosPrueba`);
  ok(guardado, `comprobante guardado aparte (${esPrincipal ? 'ct.pagosPrueba' : `ct.${id}.pagosPrueba`})`);
  await pp.screenshot({ path: dir + 'pagar-comprobante.png', fullPage: true });

  ok(errores.length === 0, 'sin errores de JS' + (errores.length ? ':\n  ' + errores.slice(0, 8).join('\n  ') : ''));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// pagar/ con una cooperativa que no existe o con caracteres raros: no paga.
// ---------------------------------------------------------------------------
console.log('\n— pagar/ con ?e= desconocido —');
{
  const ctx = await navegador.newContext({ viewport: { width: 412, height: 915 } });
  await ctx.addInitScript(() => localStorage.setItem('ct.envivo', 'no'));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  for (const e of ['noexiste', 'tabio%22%3E%3Cimg', '..%2Fempresas']) {
    await p.goto(`${BASE}pagar/?e=${e}&v=9000&id=v-prueba&m=7&b=%40prueba007`);
    await p.waitForSelector('.error-pago', { timeout: 15000 });
    const r = await p.evaluate(() => ({ h1: document.querySelector('.error-pago h1').textContent, form: Boolean(document.querySelector('#form-pago')), cuerpo: document.body.innerText }));
    ok(/No reconocemos la cooperativa/.test(r.h1) && !r.form, `?e=${decodeURIComponent(e)}: «${r.h1}» y no deja pagar`);
    ok(!/cootransrural/i.test(r.cuerpo), `?e=${decodeURIComponent(e)}: no se hace pasar por Cootransrural`);
  }
  await p.screenshot({ path: DIR + 'pagar-desconocida.png' });
  // El núcleo se detiene a propósito con «No existe la cooperativa …» (nunca carga
  // otra en su lugar): ese error es el esperado; cualquier otro es una falla.
  const inesperados = errores.filter((m) => !/No existe la cooperativa/.test(m));
  ok(inesperados.length === 0, 'sin errores de JS inesperados' + (inesperados.length ? ': ' + inesperados.join(' | ') : ''));
  await ctx.close();
}

await navegador.close();
const faltan = ['madrid', 'villeta', 'la-vega'].filter((x) => !FICHAS.some((f) => f.id === x));
if (faltan.length) aviso(`todavía no hay ficha de: ${faltan.join(', ')} (se prueban cuando existan)`);
console.log(`\n${fallas ? `✘ ${fallas} comprobaciones fallaron` : '✔ Todo bien'} · ${A_PROBAR.map((f) => f.id).join(', ')} · capturas en ${DIR}${avisos.length ? `\n⚠ Avisos:\n  ${avisos.join('\n  ')}` : ''}`);
writeFileSync(DIR + 'resultado.txt', (fallas ? `fallas: ${fallas}\n` : 'ok\n') + avisos.map((a) => `aviso: ${a}\n`).join(''));
