// Pago con QR o llave del conductor (modo real, servidor 0.10.0) en las apps del diseño A, con el servidor de TaxiCun
// simulado aquí mismo (page.route y routeWebSocket, como f4a-app.mjs) y, para la app de las tiendas, Capacitor simulado.
// Contrato: cabecera de nucleo/cobro.js.
//
//  a) Núcleo (en la página): CRC16 de EMVCo, QR buenos y malos (CRC malo, enlaces fuera de la lista, http, IP, puerto,
//     javascript:, invisibles), llaves de cada tipo, leer un QR EMVCo de una IMAGEN (foto con margen, girada un poco y
//     reducida) con jsQR, y el QR REDIBUJADO se vuelve a leer igual. ¿Se ofrece la imagen? navegador, Android, iPhone
//     1.2.1 sí; iPhone 1.0/1.2 no.
//  b) Conductor (web ?real=1): menú «Cómo me pagan» → formulario vacío; una imagen sin QR y una con CRC malo → error;
//     la imagen buena → vista previa redibujada y el titular del campo 59; «Guardar» pide el código (POST auth/codigo con
//     proposito «cobro») y manda PUT con el TEXTO del QR (nunca la imagen) y el código; código malo → «no coincide»;
//     el resumen; «Borrar» con código → DELETE. Datos del servidor con HTML (titular): solo texto.
//  c) App de iPhone 1.0/1.2 (Capacitor simulado, sin TaxiCun-Nativo): sin «Subir la imagen del QR» ni <input type=file>,
//     con la explicación; la 1.2.1 y Android sí lo tienen.
//  d) Conductor, cobro: manda `cobro` sin url ni QR; «Recibí efectivo» y «Recibí la transferencia»; el pasajero dice
//     «transferencia» (con HTML en la entidad) → el aviso como texto y el botón resaltado → pago_confirmado
//     transferencia → «Transferencia registrada». Marcar transferencia sin que el pasajero lo diga.
//  e) Pasajero: sin `cobro` solo «Ya pagué en efectivo»; llega el `cobro` → «Pagar con QR o llave» → la hoja: QR
//     redibujado (se lee igual), entidad, llave, «Copiar» (portapapeles), titular con HTML como texto, valor; «Ya pagué
//     por transferencia» → `pago` transferencia + Nequi → «Pago por transferencia». El otro camino (efectivo) con el QR
//     disponible. Un `cobro` de otro viaje no cuenta; uno viejo (solo url) no muestra el botón; un QR javascript: no se
//     dibuja (queda la llave). Recargar en «pagar» vuelve a pedir el cobro. El revisor ve la llave de muestra «DE PRUEBA».
//  f) Las demos no cambian (pagar con el QR de prueba sigue igual y no hay «Cómo me pagan»).
//
// Uso: node pruebas/pago-qr-app.mjs [url_base]   (servidor estático del repositorio, p. ej.
//      node pruebas/servidor-local.mjs --puerto=5121 --api=http://127.0.0.1:5129). Capturas en $CAPTURAS.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5121/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/pago-qr/pruebas/app/capturas').replace(/\/?$/, '/');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const DESTINO = FICHA.LUGARES.find((l) => l.nombre === 'Tierra Grata') || FICHA.LUGARES[0];
const CODIGO = '123456';
const CODIGO_COBRO = '654321';
const LUIS = 'luis@prueba.taxicun.com';
const ANA = 'ana@prueba.taxicun.com';
const UA_BASE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

/* ---------------- EMVCo de prueba ---------------- */
function crc16(texto) {
  let crc = 0xffff;
  for (const b of Buffer.from(texto, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
function emv(nombre = 'LUIS RODRIGUEZ') {
  const cuerpo = campo('00', '01') + campo('01', '11') + campo('26', campo('00', 'CO.COM.NEQUI') + campo('01', '3109876543')) +
    campo('52', '4111') + campo('53', '170') + campo('58', 'CO') + campo('59', nombre) + campo('60', 'EL ROSAL') + '6304';
  return cuerpo + crc16(cuerpo);
}
const EMV = emv();
const EMV_CRC_MALO = EMV.slice(0, -4) + (EMV.slice(-4) === '0000' ? '0001' : '0000');
const TITULAR_HTML = 'Luis <img src=x onerror="window.__xss=1"> & "Pérez"';

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 8000, paso = 100) {
  const fin = Date.now() + ms;
  for (;;) {
    let v;
    try {
      v = await fn();
    } catch {
      v = null;
    }
    if (v) return v;
    if (Date.now() > fin) return null;
    await espera(paso);
  }
}
const intento = async (pr) => {
  try {
    await pr;
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ */
/* Servidor de TaxiCun simulado                                        */
/* ------------------------------------------------------------------ */
const CONDUCTOR = { estado: 'aprobado', empresa: 'cootransrural', movil: '023', placa: 'WFK123', vehiculo: 'Renault Logan', color: 'Amarillo' };
const USUARIOS = {
  [LUIS]: { nombre: 'Luis Alberto Rodríguez', celular: '3109876543', conductor: CONDUCTOR },
  [ANA]: { nombre: 'Ana María Gómez', celular: '3001234567', conductor: null },
};
const srv = {
  n: 0,
  sesiones: new Map(),
  peticiones: [],
  hola: [],
  mensajes: [],
  ofertas: new Map(),
  viajes: new Map(),
  sockets: new Set(),
  cobro: null, // lo guardado del conductor (GET /api/conductor/cobro)
  cobroCrudo: null, // si no es null, GET responde esto tal cual (datos «del servidor» con HTML)
};
const yoDe = (correo) => {
  const u = USUARIOS[correo];
  return { usuario: { id: `u-${correo}`, correo, nombre: u.nombre, celular: u.celular, rol: u.conductor ? 'conductor' : 'pasajero' }, conductor: u.conductor };
};
const pide = (metodo, ruta) => srv.peticiones.filter((x) => x.metodo === metodo && x.ruta === ruta);

async function atenderApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const ruta = url.pathname.replace(/^\/api\//, '');
  const metodo = req.method();
  let cuerpo = null;
  try {
    cuerpo = req.postDataJSON();
  } catch {
    cuerpo = null;
  }
  const token = (req.headers().authorization || '').replace(/^Bearer\s+/, '');
  const correo = srv.sesiones.get(token) || null;
  srv.peticiones.push({ metodo, ruta, cuerpo, correo, crudo: req.postData() || '', t: Date.now() });
  const responder = (estado, datos) => route.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify(datos) });
  if (metodo === 'GET' && ruta === 'empresas/indice') return responder(404, { error: 'no_existe' });
  if (metodo === 'POST' && ruta === 'auth/codigo') return responder(200, { ok: true });
  if (metodo === 'POST' && ruta === 'auth/entrar') {
    const c = String(cuerpo?.correo || '').toLowerCase();
    if (cuerpo?.codigo !== CODIGO || !USUARIOS[c]) return responder(400, { error: 'codigo_invalido' });
    const t = `t${++srv.n}-${Math.random().toString(36).slice(2)}`;
    srv.sesiones.set(t, c);
    return responder(200, { token: t, ...yoDe(c) });
  }
  if (metodo === 'POST' && ruta === 'auth/salir') return responder(200, { ok: true });
  if (!correo) return responder(401, { error: 'sin_sesion' });
  if (metodo === 'GET' && ruta === 'yo') return responder(200, yoDe(correo));
  if (metodo === 'PATCH' && ruta === 'yo') return responder(200, yoDe(correo));
  if (ruta === 'yo/dispositivo') return responder(200, { ok: true });
  if (metodo === 'GET' && ruta === 'avisos') return responder(200, { avisos: [] });
  if (ruta === 'yo/avisos') return responder(200, { bajas: [] });
  // 0.10.0: cómo le pagan al conductor.
  if (ruta === 'conductor/cobro') {
    if (!USUARIOS[correo].conductor) return responder(403, { error: 'conductor_no_aprobado' });
    // Forma de docs/CONTRATO.md §12.1 del servidor: { cobro, version, actualizado }.
    if (metodo === 'GET') return responder(200, srv.cobroCrudo ?? { cobro: srv.cobro, version: srv.cobro ? 1 : 0, actualizado: null });
    if (cuerpo?.codigo !== CODIGO_COBRO) return responder(400, { error: 'codigo_invalido' });
    if (metodo === 'PUT') {
      const { entidad, llaveTipo, llave, qrTexto = '', titular = '' } = cuerpo;
      srv.cobro = { entidad, llaveTipo, llave, ...(qrTexto ? { qrTexto } : {}), ...(titular ? { titular } : {}) };
      return responder(200, { cobro: srv.cobro, version: 2, actualizado: new Date().toISOString() });
    }
    if (metodo === 'DELETE') {
      srv.cobro = null;
      return responder(200, { cobro: null, version: 0, actualizado: null });
    }
  }
  return responder(404, { error: 'no_existe' });
}

const enviar = (cx, tipo, datos, de = 'servidor') => {
  try {
    cx.ws.send(JSON.stringify({ uid: `m${++srv.n}`, tipo, de, ts: Date.now(), datos }));
  } catch {
    /* ya cerrado */
  }
};
const enviarA = (rol, tipo, datos) => {
  for (const cx of srv.sockets) if (cx.rol === rol) enviar(cx, tipo, datos);
};

function atenderBus(ws) {
  const cx = { ws, rol: null, correo: null, disponible: false };
  srv.sockets.add(cx);
  ws.onClose(() => srv.sockets.delete(cx));
  ws.onMessage((texto) => {
    let m;
    try {
      m = JSON.parse(String(texto));
    } catch {
      return;
    }
    if (m.tipo === 'hola') {
      const correo = srv.sesiones.get(m.datos?.token);
      if (!correo) {
        enviar(cx, 'error', { codigo: 'sin_sesion' });
        ws.close({ code: 4401, reason: 'sin_sesion' });
        return;
      }
      const u = USUARIOS[correo];
      cx.rol = m.datos.rol === 'conductor' ? 'conductor' : 'pasajero';
      cx.correo = correo;
      srv.hola.push({ rol: cx.rol, correo, t: Date.now() });
      if (cx.rol === 'conductor') {
        enviar(cx, 'bienvenida', { rol: 'conductor', empresa: 'cootransrural', nombre: u.nombre, conductor: { id: 'c_luis', ...u.conductor, nombre: u.nombre, tel: u.celular, calificacion: 4.9, viajes: 120 } });
        enviar(cx, 'viaje_actual', srv.viajes.get(correo) || null);
        return;
      }
      enviar(cx, 'bienvenida', { rol: 'pasajero', empresa: 'cootransrural', nombre: u.nombre, pasajeroId: 'p_ana' });
      enviar(cx, 'viaje_actual', srv.viajePasajero || null);
      return;
    }
    srv.mensajes.push({ rol: cx.rol, correo: cx.correo, tipo: m.tipo, datos: m.datos, t: Date.now() });
    if (cx.rol !== 'conductor') return;
    if (m.tipo === 'presencia') cx.disponible = Boolean(m.datos?.disponible);
    if (m.tipo === 'aceptacion') {
      const s = srv.ofertas.get(m.datos?.viajeId);
      if (!s) return enviar(cx, 'error', { codigo: 'servicio_no_disponible' });
      srv.ofertas.delete(s.viajeId);
      const pc = s.pedidoCentral === true;
      srv.viajes.set(cx.correo, { viajeId: s.viajeId, estado: 'asignado', origen: s.origen, destino: s.destino, pasajero: { ...s.pasajero, celular: '3001234567' }, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: 'efectivo', nota: '', codigoHash: '', ...(pc ? { pedidoCentral: true } : {}) });
      enviar(cx, 'asignacion', { viajeId: s.viajeId, conductorId: 'c_luis', pasajero: { celular: '3001234567' }, codigoHash: '', ...(pc ? { pedidoCentral: true } : {}) });
    }
    if (m.tipo === 'estado') {
      const v = srv.viajes.get(cx.correo);
      if (v && v.viajeId === m.datos?.viajeId) {
        if (m.datos.fase === 'en_viaje') v.estado = 'en_viaje';
        if (m.datos.fase === 'llego') v.estado = 'llego';
        if (m.datos.fase === 'finalizado') srv.viajes.delete(cx.correo);
      }
    }
  });
}

const oferta = (viajeId, extra = {}) => ({
  viajeId,
  pasajero: { id: `p_${viajeId}`, nombre: 'Marta', calificacion: 4.9 },
  origen: { lat: CENTRO.lat + 0.0003, lng: CENTRO.lng, titulo: 'Parque principal', detalle: '' },
  destino: { lat: DESTINO.lat, lng: DESTINO.lng, titulo: DESTINO.nombre, detalle: '' },
  tarifa: 8400, km: 2.1, min: 6, metodoPago: 'efectivo', nota: '',
  ...extra,
});
function ofrecer(viajeId, extra = {}) {
  const s = oferta(viajeId, extra);
  srv.ofertas.set(viajeId, s);
  for (const cx of srv.sockets) if (cx.rol === 'conductor' && cx.disponible) enviar(cx, 'solicitud', s, s.pasajero.id);
}

/* ------------------------------------------------------------------ */
/* Capacitor simulado                                                  */
/* ------------------------------------------------------------------ */
function capacitorFalso(cfg) {
  if (!cfg) return;
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => cfg.plataforma || 'ios',
    isPluginAvailable: () => false,
    Plugins: {},
  };
}

/* ------------------------------------------------------------------ */
/* Ayudas                                                              */
/* ------------------------------------------------------------------ */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function contexto(nombre, { cfg = null, ua = null, geo = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 } } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: geo, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
    locale: 'es-CO', timezoneId: 'America/Bogota', ...(ua ? { userAgent: ua } : {}),
  });
  await ctx.route(`${BASE}api/**`, atenderApi);
  await ctx.routeWebSocket(/\/api\/bus$/, atenderBus);
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  if (cfg) await ctx.addInitScript(capacitorFalso, cfg);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  return { ctx, p };
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ').trim() || '', sel);
const textoCrudo = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const msjDesde = (i, rol, tipo) => srv.mensajes.slice(i).filter((m) => m.rol === rol && m.tipo === tipo);
const sinXss = (p) => p.evaluate(() => window.__xss === undefined);
const conAviso = (p, re, timeout = 15000) => intento(p.waitForFunction((f) => [...document.querySelectorAll('.a-avisos .a-toast:not(.a-sale)')].some((t) => new RegExp(f).test(t.textContent.replace(/\s+/g, ' '))), re.source, { timeout }));

async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function tocarModal(p, textoBoton, clase = '') {
  const sel = `${clase ? `.${clase} ` : ''}.a-modal :is(button, a):has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(350);
  await p.click(sel);
  await p.waitForTimeout(400);
}
async function entrarConductor(p, url) {
  await p.goto(url);
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', LUIS);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', CODIGO);
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(700);
}
async function conectar(p) {
  await p.click('[data-conectar]');
  return intento(p.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }));
}
async function entrarPasajero(p, url = `${BASE}taxicun/?real=1`) {
  await p.goto(url);
  await p.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await p.click('.a-bienvenida [data-saltar]');
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 8000 });
  await p.fill('.a-bienvenida input[name=correo]', ANA);
  await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', CODIGO);
  await p.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await p.click('.a-bienvenida [data-empezar]');
  await vista(p, 'inicio', 20000);
  await p.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
}
const solicitudes = (desde) => srv.mensajes.filter((m) => m.rol === 'pasajero' && m.tipo === 'solicitud' && m.t >= desde);
async function pedir(p) {
  const t0 = Date.now();
  await p.waitForFunction(() => !/Buscando dirección/.test(document.querySelector('[data-origen-titulo]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
  await p.click('[data-frecuente] >> nth=0');
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 20000 });
  await p.waitForTimeout(500);
  await p.click('[data-pedir]');
  await vista(p, 'buscando', 10000);
  const s = await hasta(() => solicitudes(t0)[0], 8000);
  return s?.datos?.viajeId || null;
}
// El pasajero llega al final del viaje (vista «pagar») con valor 9.700.
async function hastaPagar(p) {
  const t0 = Date.now();
  const v = await pedir(p);
  const s = solicitudes(t0)[0]?.datos || {};
  const conductor = { id: 'c_luis', movil: '023', placa: 'WFK123', nombre: 'Luis Alberto Rodríguez', vehiculo: 'Renault Logan', color: 'Amarillo', calificacion: 4.9, viajes: 120, tel: '3109876543' };
  const pos = { lat: CENTRO.lat + 0.004, lng: CENTRO.lng };
  srv.viajePasajero = { viajeId: v, estado: 'asignado', origen: s.origen, destino: s.destino, tarifa: s.tarifa, km: s.km, min: s.min, metodoPago: s.metodoPago, nota: '', codigoHash: s.codigoHash || '', conductorId: 'c_luis', conductor, pos };
  enviarA('pasajero', 'aceptacion', { viajeId: v, conductor, pos, etaMin: 4 });
  await vista(p, 'asignado', 10000);
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'en_viaje' });
  srv.viajePasajero.estado = 'en_viaje';
  await vista(p, 'en_viaje', 10000);
  enviarA('pasajero', 'estado', { viajeId: v, conductorId: 'c_luis', fase: 'finalizado', valor: 9700, km: 2.4 });
  await vista(p, 'pagar', 10000);
  return v;
}
const metodoNequi = (extra = {}) => ({ entidad: 'nequi', llaveTipo: 'celular', llave: '3109876543', qrTexto: EMV, titular: TITULAR_HTML, ...extra });

// Lee el QR de un canvas de la página con jsQR (el mismo lector de la app).
const leerCanvas = (p, sel) => p.evaluate(async (s) => {
  if (!window.jsQR) {
    await new Promise((ok, no) => {
      const sc = document.createElement('script');
      sc.src = '/vendor/jsQR.min.js';
      sc.onload = ok;
      sc.onerror = no;
      document.head.append(sc);
    });
  }
  const c = document.querySelector(s);
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  return window.jsQR(d.data, d.width, d.height)?.data || null;
}, sel);

// PNG de una «foto» del QR: margen grande, texto alrededor, girado 4° y escalado (lo hace la página con qrcode.js).
const imagenQR = (p, textoQR, { girar = 4, lado = 900 } = {}) => p.evaluate(async ({ t, girar, lado }) => {
  const { dibujarQR } = await import('/nucleo/qr.js');
  const c = document.createElement('canvas');
  c.width = lado;
  c.height = Math.round(lado * 1.6);
  const x = c.getContext('2d');
  x.fillStyle = '#7a1fa2';
  x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff';
  x.fillRect(lado * 0.08, lado * 0.25, lado * 0.84, lado * 1.1);
  x.font = '40px sans-serif';
  x.fillText('Cobra con tu QR', lado * 0.15, lado * 0.18);
  x.save();
  x.translate(lado / 2, lado * 0.8);
  x.rotate((girar * Math.PI) / 180);
  if (t) dibujarQR(x, t, -lado * 0.33, -lado * 0.33, lado * 0.66, { margen: 2 });
  x.restore();
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (const n of buf) s += String.fromCharCode(n);
  return btoa(s);
}, { t: textoQR, girar, lado }).then((b64) => Buffer.from(b64, 'base64'));

/* ================================================================== */
async function nucleo() {
  const { ctx, p } = await contexto('nucleo');
  await p.goto(`${BASE}taxicun/?e=cootransrural`);
  await p.waitForSelector('.a-app', { timeout: 30000 });
  const r = await p.evaluate(async ({ EMV, EMV_CRC_MALO }) => {
    const C = await import('/nucleo/cobro.js');
    const qr = (t) => C.validarQrTexto(t);
    return {
      crcConocido: C.crc16('123456789'),
      emv: qr(EMV),
      crcMalo: qr(EMV_CRC_MALO).error,
      cortado: qr(EMV.slice(0, 40)).error,
      control: qr(EMV.replace('EL ROSAL', 'EL\u0007ROSA')).ok,
      invisible: qr(`https://nequi.com.co/p/​abc`).ok,
      nequi: qr('https://recarga.nequi.com.co/pagar?x=1').ok,
      davi: qr('https://daviplata.com/qr/abc').ok,
      http: qr('http://nequi.com.co/x').ok,
      ajeno: qr('https://nequi.com.co.malo.com/x').ok,
      ip: qr('https://190.1.2.3/x').ok,
      puerto: qr('https://nequi.com.co:8443/x').ok,
      js: qr('javascript:alert(1)').ok,
      data: qr('data:text/html,<b>x</b>').ok,
      largo: qr(`https://nequi.com.co/${'a'.repeat(600)}`).error,
      llaves: [
        C.validarLlave('celular', '3109876543'), C.validarLlave('celular', '2109876543'), C.validarLlave('celular', C.normalizarLlave('celular', '+57 310 987 6543')),
        C.validarLlave('cedula', '12345'), C.validarLlave('cedula', '1234'), C.validarLlave('cedula', '12345678901'),
        C.validarLlave('correo', 'luis@correo.com'), C.validarLlave('correo', 'luis@correo'), C.validarLlave('correo', 'a<b>@c.com'),
        C.validarLlave('alfanumerica', C.normalizarLlave('alfanumerica', 'MiTaxi_23')), C.validarLlave('alfanumerica', '@ab'), C.validarLlave('alfanumerica', '@mi taxi'),
        C.validarLlave('alfanumerica', '@mi​taxi'), C.validarLlave('otro', 'x'),
      ],
      titulares: [C.validarTitular('Luis Pérez'), C.validarTitular('Luis <b>'), C.validarTitular('www.x.com'), C.validarTitular('a'.repeat(41)), C.validarTitular('Luis‮X')],
      uas: [
        C.imagenQRPermitida({ nativa: false, ua: 'Chrome' }),
        C.imagenQRPermitida({ nativa: true, ua: 'iPhone TaxiCun-App/conductor' }),
        C.imagenQRPermitida({ nativa: true, ua: 'iPhone TaxiCun-App/conductor TaxiCun-Nativo/1.2.0' }),
        C.imagenQRPermitida({ nativa: true, ua: 'iPhone TaxiCun-App/conductor TaxiCun-Nativo/1.2.1' }),
        C.imagenQRPermitida({ nativa: true, ua: 'iPhone TaxiCun-App/conductor TaxiCun-Nativo/1.3' }),
        C.imagenQRPermitida({ nativa: true, ua: 'Linux; Android 14 TaxiCun-App/conductor' }),
      ],
      limpio: C.limpiarMetodo({ entidad: 'nequi', llave_tipo: 'celular', llave: '3109876543', qr_texto: 'javascript:alert(1)', titular: '<b>x</b>', extra: 1 }),
      sinLlave: C.limpiarMetodo({ entidad: 'nequi', llaveTipo: 'celular', llave: '<img src=x>' }),
    };
  }, { EMV, EMV_CRC_MALO });
  ok(r.crcConocido === '29B1', `a1) CRC16/CCITT-FALSE de «123456789» = 29B1 (${r.crcConocido})`);
  ok(r.emv.ok && r.emv.tipo === 'emv' && r.emv.titular === 'LUIS RODRIGUEZ', `a1) EMVCo bueno, con el titular del campo 59 (${JSON.stringify(r.emv)})`);
  ok(r.crcMalo === 'qr_crc' && r.cortado === 'qr_no_valido' && r.control === false && r.invisible === false, `a1) CRC malo, cortado, de control e invisibles: no (${r.crcMalo}, ${r.cortado})`);
  ok(r.nequi && r.davi && !r.http && !r.ajeno && !r.ip && !r.puerto && !r.js && !r.data && r.largo === 'qr_muy_largo', 'a1) enlaces: solo https de la lista (nada de http, otro dominio, IP, puerto, javascript:, data:, > 512)');
  ok(JSON.stringify(r.llaves) === JSON.stringify([null, 'llave_no_valida', null, null, 'llave_no_valida', 'llave_no_valida', null, 'llave_no_valida', 'llave_no_valida', null, 'llave_no_valida', 'llave_no_valida', 'llave_no_valida', 'llave_tipo_invalido']), `a1) llaves por tipo (${JSON.stringify(r.llaves)})`);
  ok(JSON.stringify(r.titulares) === JSON.stringify([null, 'titular_no_valido', 'titular_no_valido', 'titular_no_valido', 'titular_no_valido']), `a1) titular: texto plano ≤ 40 (${JSON.stringify(r.titulares)})`);
  ok(JSON.stringify(r.uas) === JSON.stringify([true, false, false, true, true, true]), `a2) imagen del QR: navegador sí, iPhone sin versión y 1.2.0 no, 1.2.1 y 1.3 sí, Android sí (${JSON.stringify(r.uas)})`);
  ok(r.limpio && r.limpio.qrTexto === '' && r.limpio.titular === '' && !('extra' in r.limpio) && r.limpio.llaveTipo === 'celular' && r.sinLlave === null, `a1) lo del servidor se revisa: QR javascript: y titular con HTML fuera; llave con HTML → nada (${JSON.stringify(r.limpio)})`);

  // a3) Leer el QR de una imagen («foto» con margen, girada y en tamaños distintos) y redibujarlo igual.
  for (const [n, op] of [['grande girada', { girar: 4, lado: 1400 }], ['chica', { girar: 0, lado: 420 }], ['girada 10°', { girar: 10, lado: 900 }]]) {
    const png = await imagenQR(p, EMV, op);
    const leido = await p.evaluate(async (b64) => {
      const C = await import('/nucleo/cobro.js');
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      try {
        return await C.leerQRDeImagen(new File([bytes], 'qr.png', { type: 'image/png' }));
      } catch (e) {
        return `ERROR ${e.message}`;
      }
    }, png.toString('base64'));
    ok(leido === EMV, `a3) lee el EMVCo de una imagen ${n} (${String(leido).slice(0, 40)}…)`);
  }
  const sinQR = await p.evaluate(async (b64) => {
    const C = await import('/nucleo/cobro.js');
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    try {
      return await C.leerQRDeImagen(new File([bytes], 'x.png', { type: 'image/png' }));
    } catch (e) {
      return `ERROR ${e.message}`;
    }
  }, (await imagenQR(p, '', {})).toString('base64'));
  ok(/^ERROR No encontramos un QR/.test(sinQR), `a3) una imagen sin QR → «No encontramos un QR…» (${sinQR})`);
  const redibujado = await p.evaluate(async (t) => {
    const C = await import('/nucleo/cobro.js');
    const c = C.lienzoQR(t, 240);
    c.id = 'qr-redibujado';
    document.body.append(c);
    return c.width;
  }, EMV);
  ok(redibujado >= 240 && (await leerCanvas(p, '#qr-redibujado')) === EMV, 'a3) el QR redibujado con qrcode.js se lee igual al original');
  await ctx.close();
}

/* ================================================================== */
async function abrirComoMePagan(p) {
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu :is(button, a):has-text("Cómo me pagan")', { timeout: 8000 });
  await p.waitForTimeout(300);
  await p.click('.a-menu :is(button, a):has-text("Cómo me pagan")');
  await p.waitForSelector('.a-panel-cobro [data-como-me-pagan]', { timeout: 8000 });
  await p.waitForFunction(() => !document.querySelector('.a-panel-cobro [data-cargando]'), null, { timeout: 8000 });
}
async function cerrarPanel(p) {
  await p.click('.a-panel-cobro [data-cerrar]');
  await p.waitForTimeout(400);
}

async function conductorCobro() {
  srv.cobro = null;
  const { ctx, p } = await contexto('conductor-cobro');
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  await abrirComoMePagan(p);
  ok(Boolean(await p.$('.a-panel-cobro [data-llave-input]')) && Boolean(await p.$('.a-panel-cobro [data-subir-qr]')), 'b1) sin datos: el formulario con «Subir la imagen del QR» (navegador)');
  await foto(p, 'b1-como-me-pagan-vacio');

  // Imagen sin QR y con CRC malo → error.
  await p.setInputFiles('.a-panel-cobro [data-archivo-qr]', { name: 'nada.png', mimeType: 'image/png', buffer: await imagenQR(p, '') });
  await p.waitForSelector('.a-panel-cobro [data-error-cobro]:not([hidden])', { timeout: 10000 });
  ok(/No encontramos un QR/.test(await texto(p, '.a-panel-cobro [data-error-cobro]')), 'b2) imagen sin QR → «No encontramos un QR…»');
  await p.setInputFiles('.a-panel-cobro [data-archivo-qr]', { name: 'malo.png', mimeType: 'image/png', buffer: await imagenQR(p, EMV_CRC_MALO) });
  await p.waitForFunction(() => /dañado/.test(document.querySelector('.a-panel-cobro [data-error-cobro]')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/dañado/.test(await texto(p, '.a-panel-cobro [data-error-cobro]')) && !(await p.$('.a-panel-cobro [data-vista-qr]')), 'b2) QR con CRC malo → «Ese QR está dañado…» y no queda');
  await p.setInputFiles('.a-panel-cobro [data-archivo-qr]', { name: 'nequi.png', mimeType: 'image/png', buffer: await imagenQR(p, 'https://evil.example.com/pagar') });
  await p.waitForFunction(() => /no es de cobro/.test(document.querySelector('.a-panel-cobro [data-error-cobro]')?.textContent || ''), null, { timeout: 10000 }).catch(() => {});
  ok(/no es de cobro/.test(await texto(p, '.a-panel-cobro [data-error-cobro]')), 'b2) QR con un enlace de otro dominio → «no es de cobro»');

  // La buena: vista previa redibujada y el titular sugerido del campo 59.
  await p.setInputFiles('.a-panel-cobro [data-archivo-qr]', { name: 'nequi.png', mimeType: 'image/png', buffer: await imagenQR(p, EMV) });
  await p.waitForSelector('.a-panel-cobro [data-vista-qr] canvas', { timeout: 10000 });
  ok((await leerCanvas(p, '.a-panel-cobro [data-vista-qr] canvas')) === EMV, 'b3) vista previa: el QR redibujado se lee igual');
  ok((await p.inputValue('.a-panel-cobro [data-titular-input]')) === 'LUIS RODRIGUEZ', 'b3) el titular sugerido sale del campo 59 del EMVCo');
  await p.selectOption('.a-panel-cobro [data-entidad-sel]', 'nequi');
  await p.selectOption('.a-panel-cobro [data-tipo-llave]', 'celular');
  // Llave mala primero.
  await p.fill('.a-panel-cobro [data-llave-input]', '210 987 6543');
  await p.click('.a-panel-cobro [data-guardar-cobro]');
  await p.waitForTimeout(400);
  ok(/Revisa la llave/.test(await texto(p, '.a-panel-cobro [data-error-cobro]')) && pide('POST', 'auth/codigo').filter((x) => x.cuerpo?.proposito === 'cobro').length === 0, 'b4) celular que no empieza por 3 → «Revisa la llave…», sin pedir código');
  await p.fill('.a-panel-cobro [data-llave-input]', '310 987 6543');
  await foto(p, 'b4-formulario-lleno');
  const c0 = pide('POST', 'auth/codigo').length;
  await p.click('.a-panel-cobro [data-guardar-cobro]');
  await p.waitForSelector('.a-modal [data-codigo-cobro]', { timeout: 8000 });
  const pc = pide('POST', 'auth/codigo').slice(c0)[0];
  ok(pc?.cuerpo?.proposito === 'cobro' && pc?.cuerpo?.correo === LUIS, `b5) «Guardar» pide el código del correo con proposito «cobro» (${JSON.stringify(pc?.cuerpo)})`);
  // Código malo.
  await p.fill('.a-modal [data-codigo-cobro]', '111111');
  await tocarModal(p, 'Confirmar');
  await p.waitForFunction(() => /no coincide/.test(document.querySelector('.a-panel-cobro [data-error-cobro]')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  ok(/no coincide/.test(await texto(p, '.a-panel-cobro [data-error-cobro]')) && srv.cobro === null, 'b5) código malo → «Ese código no coincide.» y no se guarda');
  // Código bueno.
  const u0 = pide('PUT', 'conductor/cobro').length;
  await p.click('.a-panel-cobro [data-guardar-cobro]');
  await p.waitForSelector('.a-modal [data-codigo-cobro]', { timeout: 8000 });
  await p.fill('.a-modal [data-codigo-cobro]', CODIGO_COBRO);
  await tocarModal(p, 'Confirmar');
  await p.waitForSelector('.a-panel-cobro [data-cambiar]', { timeout: 8000 });
  const put = pide('PUT', 'conductor/cobro').slice(u0).at(-1);
  ok(put && JSON.stringify(Object.keys(put.cuerpo).sort()) === JSON.stringify(['codigo', 'entidad', 'llave', 'llaveTipo', 'qrTexto', 'titular']), `b6) PUT solo con entidad, llaveTipo, llave, qrTexto, titular y codigo (${Object.keys(put?.cuerpo || {}).join(', ')})`);
  ok(put?.cuerpo?.qrTexto === EMV && put?.cuerpo?.llave === '3109876543' && put?.cuerpo?.codigo === CODIGO_COBRO && put?.crudo.length < 900 && !/base64|image\//.test(put?.crudo), `b6) va el TEXTO del QR (no la imagen: ${put?.crudo.length} bytes) y la llave sin espacios`);
  ok(await conAviso(p, /Guardamos cómo te pagan/, 5000), 'b6) «Guardamos cómo te pagan» (con el aviso al correo)');
  ok((await textoCrudo(p, '.a-panel-cobro [data-llave]')) === '3109876543' && (await leerCanvas(p, '.a-panel-cobro [data-qr] canvas')) === EMV, 'b6) el resumen: la llave y el QR redibujado');
  await foto(p, 'b6-como-me-pagan-guardado');
  await cerrarPanel(p);

  // b7) Lo que manda «el servidor» con HTML se pinta como texto (y la llave con HTML no se muestra).
  srv.cobroCrudo = { cobro: { entidad: 'daviplata', llaveTipo: 'alfanumerica', llave: '@luis.taxi', titular: 'Luis & "Pérez"', qrTexto: 'javascript:window.__xss=2' } };
  await abrirComoMePagan(p);
  ok((await textoCrudo(p, '.a-panel-cobro [data-titular]')) === 'Luis & "Pérez"' && (await textoCrudo(p, '.a-panel-cobro [data-entidad]')) === 'Daviplata' && !(await p.$('.a-panel-cobro [data-qr]')), 'b7) titular con & y comillas como texto; QR javascript: no se dibuja');
  await cerrarPanel(p);
  srv.cobroCrudo = { cobro: { entidad: 'nequi', llaveTipo: 'correo', llave: '<img src=x onerror="window.__xss=3">@a.co', titular: TITULAR_HTML } };
  await abrirComoMePagan(p);
  ok(Boolean(await p.$('.a-panel-cobro [data-llave-input]')) && !(await p.$('.a-panel-cobro img')) && (await sinXss(p)), 'b7) una llave con HTML del servidor no se muestra (formulario) y nada corre');
  await cerrarPanel(p);
  srv.cobroCrudo = null;

  // b8) Borrar con código → DELETE.
  await abrirComoMePagan(p);
  const d0 = pide('DELETE', 'conductor/cobro').length;
  await p.click('.a-panel-cobro [data-borrar]');
  await tocarModal(p, 'Borrar');
  await p.waitForSelector('.a-modal [data-codigo-cobro]', { timeout: 8000 });
  await p.fill('.a-modal [data-codigo-cobro]', CODIGO_COBRO);
  await tocarModal(p, 'Confirmar');
  await p.waitForSelector('.a-panel-cobro [data-llave-input]', { timeout: 8000 });
  const del = pide('DELETE', 'conductor/cobro').slice(d0)[0];
  ok(del?.cuerpo?.codigo === CODIGO_COBRO && srv.cobro === null, 'b8) «Borrar» con el código → DELETE y vuelve el formulario vacío');
  await cerrarPanel(p);
  ok(await sinXss(p), 'b) nada del HTML corrió');
  await ctx.close();
}

/* ================================================================== */
async function iphoneViejo() {
  for (const [n, cfg, ua, debe] of [
    ['iPhone 1.2 (sin TaxiCun-Nativo)', { plataforma: 'ios' }, `${UA_BASE} TaxiCun-App/conductor`, false],
    ['iPhone 1.2.1', { plataforma: 'ios' }, `${UA_BASE} TaxiCun-App/conductor TaxiCun-Nativo/1.2.1`, true],
    ['Android 1.2', { plataforma: 'android' }, 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 TaxiCun-App/conductor', true],
  ]) {
    srv.cobro = null;
    const { ctx, p } = await contexto(n, { cfg, ua });
    await entrarConductor(p, `${BASE}taxicun/conductor/`);
    await abrirComoMePagan(p);
    const subir = Boolean(await p.$('.a-panel-cobro [data-subir-qr]'));
    const archivo = Boolean(await p.$('.a-panel-cobro input[type=file]'));
    const sin = await texto(p, '.a-panel-cobro [data-sin-imagen]');
    if (debe) ok(subir && archivo && !sin, `c) ${n}: ofrece «Subir la imagen del QR»`);
    else ok(!subir && !archivo && /actualiza la app a la versión 1\.2\.1/.test(sin) && Boolean(await p.$('.a-panel-cobro [data-llave-input]')), `c) ${n}: sin el botón ni <input type=file> (la app se cerraría), con la explicación y la llave`);
    await foto(p, `c-${n.replace(/\W+/g, '-')}`);
    await ctx.close();
  }
}

/* ================================================================== */
async function aceptarYViajar(p, viajeId) {
  ofrecer(viajeId);
  await p.waitForSelector('.a-solicitud [data-aceptar]', { timeout: 15000 });
  await p.waitForTimeout(500);
  await p.click('.a-solicitud [data-aceptar]');
  await vista(p, 'hacia_origen', 15000);
  await p.click('[data-llegue]');
  await vista(p, 'en_origen', 10000);
  // Sin codigoHash vale cualquiera; al completar las 4 casillas arranca solo.
  await escribirCodigo(p, '.a-hoja [data-casillas]', '1234');
  await vista(p, 'en_viaje', 10000);
  await p.click('[data-terminar]');
  await tocarModal(p, 'Terminar y cobrar');
  await vista(p, 'cobrando', 10000);
}

async function conductorCobrando() {
  const { ctx, p } = await contexto('conductor-cobrando');
  await entrarConductor(p, `${BASE}taxicun/conductor/?real=1`);
  ok(await conectar(p), 'd0) en turno');
  let m0 = srv.mensajes.length;
  await aceptarYViajar(p, 'v-qr-1');
  const cobro = msjDesde(m0, 'conductor', 'cobro')[0]?.datos;
  ok(cobro && cobro.viajeId === 'v-qr-1' && !('url' in cobro) && !('qrTexto' in cobro) && !('metodos' in cobro), `d1) manda «cobro» sin url ni QR (los arma el servidor): ${JSON.stringify(cobro)}`);
  ok(/Pago en efectivo o transferencia/.test(await texto(p, '.a-hoja')) && Boolean(await p.$('[data-efectivo]')) && Boolean(await p.$('[data-transferencia]')), 'd1) «Recibí efectivo» y «Recibí la transferencia»');
  await p.waitForTimeout(800);
  await foto(p, 'd1-cobrando');
  // El pasajero dice que transfirió (la entidad con HTML: texto).
  const conHtml = 'Nequi <img src=x onerror="window.__xss=4">';
  enviarA('conductor', 'pago', { viajeId: 'v-qr-1', metodo: 'transferencia', valor: 8400, billetera: conHtml, entidad: 'nequi' });
  await p.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 8000 });
  ok((await textoCrudo(p, '[data-pago-anunciado-txt]')) === `El pasajero dice que ya te transfirió (${conHtml.slice(0, 40)}). Revisa tu app del banco y confírmalo.` && !(await p.$('.a-hoja img')), 'd2) «El pasajero dice que ya te transfirió (…)» como texto');
  ok(await p.$eval('[data-transferencia]', (n) => n.classList.contains('a-resaltar')) && !(await p.$eval('[data-efectivo]', (n) => n.classList.contains('a-resaltar'))), 'd2) resalta «Recibí la transferencia» (no el efectivo)');
  await p.waitForTimeout(1500);
  await foto(p, 'd2-dice-que-transfirio');
  m0 = srv.mensajes.length;
  await p.click('[data-transferencia]');
  await tocarModal(p, 'Sí, me llegó');
  await vista(p, 'calificar', 10000);
  const pc = msjDesde(m0, 'conductor', 'pago_confirmado')[0]?.datos;
  ok(pc?.metodo === 'transferencia' && pc?.valor === 8400 && pc?.billetera === conHtml.slice(0, 40) && pc?.entidad === 'nequi', `d3) pago_confirmado: transferencia, 8.400 y la entidad que dijo (${JSON.stringify(pc)})`);
  ok(/Transferencia registrada/.test(await texto(p, '.a-pago-recibido')) && !(await p.$('.a-pago-recibido img')), 'd3) «Transferencia registrada» (entidad como texto)');
  await foto(p, 'd3-transferencia-registrada');
  await p.click('[data-enviar]');
  await vista(p, 'libre', 10000);
  const h = JSON.parse(await p.evaluate(() => localStorage.getItem('tc.real.cootransrural.historial.conductor') || '[]')).find((v) => v.id === 'v-qr-1');
  ok(h?.metodoPago === 'transferencia', `d3) en su historial como transferencia (${h?.metodoPago})`);

  // d4) Marca transferencia sin que el pasajero lo diga.
  m0 = srv.mensajes.length;
  await aceptarYViajar(p, 'v-qr-2');
  await p.click('[data-transferencia]');
  await tocarModal(p, 'Sí, me llegó');
  await vista(p, 'calificar', 10000);
  const pc2 = msjDesde(m0, 'conductor', 'pago_confirmado')[0]?.datos;
  ok(pc2?.metodo === 'transferencia' && pc2?.billetera === null && !('entidad' in pc2), `d4) sin aviso del pasajero también la puede marcar (${JSON.stringify(pc2)})`);
  await p.click('[data-enviar]');
  await vista(p, 'libre', 10000);
  // d5) Efectivo sigue igual.
  m0 = srv.mensajes.length;
  await aceptarYViajar(p, 'v-qr-3');
  enviarA('conductor', 'pago', { viajeId: 'v-qr-3', metodo: 'efectivo', valor: 8400 });
  await p.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 8000 });
  ok(/ya te pagó\. Confírmalo cuando tengas el efectivo/.test(await textoCrudo(p, '[data-pago-anunciado-txt]')), 'd5) efectivo: «El pasajero dice que ya te pagó…»');
  await p.click('[data-efectivo]');
  await tocarModal(p, 'Sí, recibí el pago');
  await vista(p, 'calificar', 10000);
  ok(msjDesde(m0, 'conductor', 'pago_confirmado')[0]?.datos?.metodo === 'efectivo' && /Pago en efectivo registrado/.test(await texto(p, '.a-pago-recibido')), 'd5) «Recibí efectivo» → efectivo');
  ok(await sinXss(p), 'd) nada del HTML corrió');
  await ctx.close();
}

/* ================================================================== */
async function pasajeroPago() {
  const { ctx, p } = await contexto('pasajero-pago');
  await entrarPasajero(p);
  let v = await hastaPagar(p);
  ok(Boolean(await p.$('[data-efectivo]')) && (await p.$eval('[data-pagar-qr-llave]', (n) => n.hidden)) && /Pagas en efectivo/.test(await texto(p, '.a-hoja')), 'e1) sin `cobro`: solo «Ya pagué en efectivo»');
  // Un cobro viejo (solo url, como el 0.9.0) y uno de otro viaje: no cuentan.
  enviarA('pasajero', 'cobro', { viajeId: v, conductorId: 'c_luis', valor: 9700, url: 'https://evil.example/pagar' });
  enviarA('pasajero', 'cobro', { viajeId: 'otro-viaje', conductorId: 'c_luis', valor: 9700, metodos: [metodoNequi()] });
  await p.waitForTimeout(800);
  ok(await p.$eval('[data-pagar-qr-llave]', (n) => n.hidden), 'e1) un `cobro` sin métodos (servidor anterior) o de otro viaje: no aparece el botón');
  enviarA('pasajero', 'cobro', { viajeId: v, conductorId: 'c_luis', valor: 9700, metodos: [metodoNequi()] });
  await p.waitForSelector('[data-pagar-qr-llave]:not([hidden])', { timeout: 8000 });
  ok(/¿Cómo pagaste\?/.test(await texto(p, '.a-hoja')), 'e2) llega el `cobro` → «Pagar con QR o llave»');
  await foto(p, 'e2-pagar-opciones');
  await p.click('[data-pagar-qr-llave]');
  await p.waitForSelector('.a-modal [data-hoja-pago-qr]', { timeout: 8000 });
  await p.waitForTimeout(400);
  ok((await leerCanvas(p, '.a-modal [data-qr] canvas')) === EMV, 'e3) la hoja: el QR REDIBUJADO se lee igual al del conductor');
  ok((await textoCrudo(p, '.a-modal [data-entidad]')) === 'Nequi' && (await textoCrudo(p, '.a-modal [data-llave]')) === '3109876543' && /^\$\s?9\.700$/.test(await textoCrudo(p, '.a-modal [data-valor]')), `e3) entidad, llave y valor (${await textoCrudo(p, '.a-modal [data-valor]')})`);
  ok(!(await p.$('.a-modal [data-titular]')) && !(await p.$('.a-modal img')) && (await sinXss(p)), 'e3) un titular con HTML no se muestra ni corre');
  await p.click('.a-modal [data-copiar]');
  await p.waitForTimeout(300);
  const copiado = await p.evaluate(() => navigator.clipboard.readText());
  ok(copiado === '3109876543' && /Copiada/.test(await texto(p, '.a-modal [data-copiar]')), `e4) «Copiar» pone la llave en el portapapeles (${copiado})`);
  await foto(p, 'e4-hoja-pago-qr');
  const m0 = srv.mensajes.length;
  await tocarModal(p, 'Ya pagué por transferencia');
  await vista(p, 'calificar', 10000);
  const pago = msjDesde(m0, 'pasajero', 'pago')[0]?.datos;
  ok(pago?.metodo === 'transferencia' && pago?.valor === 9700 && pago?.billetera === 'Nequi' && pago?.entidad === 'nequi', `e5) «Ya pagué por transferencia» → pago transferencia, 9.700, Nequi (${JSON.stringify(pago)})`);
  ok(/Pago por transferencia/.test(await texto(p, '.a-pago-ok')), 'e5) «Pago por transferencia»');
  await foto(p, 'e5-pago-por-transferencia');
  await p.click('[data-omitir]');
  await vista(p, 'inicio', 10000);

  // e6) El otro camino: efectivo con el QR disponible. Titular en texto con & y comillas; QR javascript: no se dibuja.
  v = await hastaPagar(p);
  enviarA('pasajero', 'cobro', { viajeId: v, conductorId: 'c_luis', valor: 9700, metodos: [metodoNequi({ titular: 'Luis & "Pérez"', qrTexto: 'javascript:window.__xss=5' })] });
  await p.waitForSelector('[data-pagar-qr-llave]:not([hidden])', { timeout: 8000 });
  await p.click('[data-pagar-qr-llave]');
  await p.waitForSelector('.a-modal [data-hoja-pago-qr]', { timeout: 8000 });
  ok(!(await p.$('.a-modal [data-qr]')) && (await textoCrudo(p, '.a-modal [data-titular]')) === 'Luis & "Pérez"' && (await textoCrudo(p, '.a-modal [data-llave]')) === '3109876543', 'e6) QR javascript: no se dibuja; queda la llave y el titular como texto');
  await tocarModal(p, 'Volver');
  const m1 = srv.mensajes.length;
  await p.click('[data-efectivo]');
  await tocarModal(p, 'Sí, ya pagué');
  await vista(p, 'calificar', 10000);
  ok(msjDesde(m1, 'pasajero', 'pago')[0]?.datos?.metodo === 'efectivo' && /Pago en efectivo/.test(await texto(p, '.a-pago-ok')), 'e6) «Ya pagué en efectivo» sigue igual');
  await p.click('[data-omitir]');
  await vista(p, 'inicio', 10000);

  // e7) Recarga en «pagar» sin el cobro guardado: lo vuelve a pedir.
  v = await hastaPagar(p);
  srv.viajePasajero = { ...srv.viajePasajero, estado: 'finalizado' };
  const m2 = srv.mensajes.length;
  await p.reload();
  await vista(p, 'pagar', 20000);
  const pedido = await hasta(() => msjDesde(m2, 'pasajero', 'cobro')[0], 8000);
  ok(pedido?.datos?.viajeId === v, `e7) recargada en «pagar»: pide el cobro otra vez (${JSON.stringify(pedido?.datos)})`);

  // e8) Revisor: la llave de muestra marcada de prueba.
  enviarA('pasajero', 'cobro', { viajeId: v, conductorId: 'c_luis', valor: 9700, metodos: [{ entidad: 'breb', llaveTipo: 'alfanumerica', llave: '@taxicunprueba', titular: 'Conductor de prueba', prueba: true }] });
  await p.waitForSelector('[data-pagar-qr-llave]:not([hidden])', { timeout: 8000 });
  await p.click('[data-pagar-qr-llave]');
  await p.waitForSelector('.a-modal [data-hoja-pago-qr]', { timeout: 8000 });
  ok((await textoCrudo(p, '.a-modal [data-llave]')) === '@taxicunprueba' && Boolean(await p.$('.a-modal [data-prueba]')) && /No transfieras dinero/.test(await texto(p, '.a-modal')), 'e8) revisor: «@taxicunprueba» con «DE PRUEBA» y «No transfieras dinero»');
  await p.waitForTimeout(300);
  await foto(p, 'e8-revisor-llave-de-prueba');
  await tocarModal(p, 'Volver');
  ok(await sinXss(p), 'e) nada del HTML corrió');
  await ctx.close();
  srv.viajePasajero = null;
}

/* ================================================================== */
async function demos() {
  const { ctx, p } = await contexto('demo');
  await p.goto(`${BASE}taxicun/conductor/?e=cootransrural`);
  await p.waitForSelector('.a-app', { timeout: 30000 });
  await p.waitForTimeout(2500);
  const menu = await p.$('[data-menu]');
  if (menu) {
    await menu.click().catch(() => {});
    await p.waitForTimeout(600);
  }
  ok(!(await p.$('.a-menu :is(button, a):has-text("Cómo me pagan")')), 'f) la demo del conductor no tiene «Cómo me pagan»');
  ok(pide('GET', 'conductor/cobro').filter((x) => !x.correo).length === 0, 'f) y no llama a /api/conductor/cobro');
  await ctx.close();
}

const ini = Date.now();
const SOLO = (process.argv.find((a) => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean);
for (const [nombre, fn] of [['a', nucleo], ['b', conductorCobro], ['c', iphoneViejo], ['d', conductorCobrando], ['e', pasajeroPago], ['f', demos]]) {
  if (SOLO.length && !SOLO.includes(nombre)) continue;
  srv.viajePasajero = null;
  try {
    await fn();
  } catch (e) {
    ok(false, `${nombre}) se cortó: ${e.message.split('\n')[0]}`);
    console.log(e.stack?.split('\n').slice(1, 4).join('\n'));
  }
}
ok(errores.length === 0, `sin errores de JavaScript (${errores.slice(0, 5).join(' | ')})`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · pago con QR o llave (app) · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - ini) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
