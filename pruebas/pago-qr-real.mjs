// Pago con QR o llave de punta a punta con el SERVIDOR DE VERDAD (0.10.0, docs/CONTRATO.md §12 de taxicun-servidor):
// el conductor guarda «Cómo me pagan» con la imagen de su QR (código fijo de la cuenta de prueba), se pone en turno, hace
// un viaje con la pasajera y, al cobrar, ella ve «Pagar con QR o llave» con el QR que manda el SERVIDOR (redibujado, se
// lee igual), copia la llave y dice «Ya pagué por transferencia»; el conductor lo ve y confirma → en la base el viaje queda
// con metodo_pago «transferencia» y pago_entidad «nequi». Al final se borran las dos cuentas (DELETE /api/yo).
//
// Uso (base propia, servidor 0.10.0 y el proxy de la web):
//   DATABASE_URL=postgres://…/taxicun_pagoqr_010 SERVIDOR_TAXICUN=<árbol del servidor> node pruebas/pago-qr-real.mjs http://localhost:5127/
// El servidor con CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790".
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:5127/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/pago-qr/pruebas/real/cap-pago-qr-real').replace(/\/?$/, '/');
const SERVIDOR = process.env.SERVIDOR_TAXICUN;
const BD = process.env.DATABASE_URL;
if (!SERVIDOR || !BD) throw new Error('Faltan SERVIDOR_TAXICUN y DATABASE_URL (la base PROPIA de la prueba)');
mkdirSync(DIR, { recursive: true });
const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const COND = { correo: 'conductor@prueba.taxicun.com', codigo: '135790', nombre: 'Luis Prueba Cobro', celular: '3109876543', movil: '078', placa: 'QRT178' };
const PAS = { correo: 'pasajero@prueba.taxicun.com', codigo: '246810', nombre: 'Ana Prueba', celular: '3001234567' };

function crc16(texto) {
  let crc = 0xffff;
  for (const b of Buffer.from(texto, 'utf8')) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const campo = (id, v) => `${id}${String(v.length).padStart(2, '0')}${v}`;
const cuerpoEmv = campo('00', '01') + campo('01', '11') + campo('26', campo('00', 'CO.COM.NEQUI') + campo('01', COND.celular)) +
  campo('52', '4111') + campo('53', '170') + campo('58', 'CO') + campo('59', 'LUIS PRUEBA') + campo('60', 'EL ROSAL') + '6304';
const EMV = cuerpoEmv + crc16(cuerpoEmv);

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const intento = async (pr) => {
  try {
    await pr;
    return true;
  } catch {
    return false;
  }
};
const sql = (q) => execFileSync('psql', [BD, '-At', '-c', q], { encoding: 'utf8' }).trim();
async function api(metodo, ruta, cuerpo, token) {
  const r = await fetch(new URL(`api/${ruta}`, BASE), {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  return { estado: r.status, datos: await r.json().catch(() => null) };
}

// Prepara al conductor por la API (perfil, taxi y aprobación) para entrar directo a la app.
await api('POST', 'auth/codigo', { correo: COND.correo });
const e = await api('POST', 'auth/entrar', { correo: COND.correo, codigo: COND.codigo, dispositivo: 'web' });
const tokC = e.datos?.token;
await api('PATCH', 'yo', { nombre: COND.nombre, celular: COND.celular }, tokC);
const reg = await api('PUT', 'conductor', { empresa: 'cootransrural', movil: COND.movil, placa: COND.placa, vehiculo: 'Chevrolet Spark', color: 'Amarillo' }, tokC);
execFileSync('node', ['bin/admin.js', 'aprobar', COND.correo, '--motivo', 'Prueba de pago con QR'], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BD }, encoding: 'utf8' });
ok(Boolean(tokC) && reg.estado === 200, `0) conductor de prueba registrado y aprobado (${reg.estado})`);
await api('POST', 'auth/salir', undefined, tokC);

const b = await chromium.launch({ executablePath: EXE });
const errores = [];
async function pagina(nombre) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 12 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.route(/^https:\/\/(nominatim|router\.project-osrm|[a-c]?\.?tile\.openstreetmap|api\.mapbox|tile\.openstreetmap)/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (x) => errores.push(`[${nombre}] ${x.message}`));
  return p;
}
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const textoCrudo = (p, sel) => p.evaluate((s) => document.querySelector(s)?.textContent ?? null, sel);
async function escribir(p, sel, codigo) {
  await p.waitForSelector(`${sel} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${sel} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 30 });
}
async function tocarModal(p, t) {
  const sel = `.a-modal :is(button, a):has-text("${t}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(350);
  await p.click(sel);
  await p.waitForTimeout(400);
}
const leerCanvas = (p, sel) => p.evaluate(async (s) => {
  if (!window.jsQR) await new Promise((r) => { const x = document.createElement('script'); x.src = '/vendor/jsQR.min.js'; x.onload = r; document.head.append(x); });
  const c = document.querySelector(s);
  if (!c) return null;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
  return window.jsQR(d.data, d.width, d.height)?.data || null;
}, sel);

try {
  // 1) Conductor: entra y guarda «Cómo me pagan» con la imagen del QR.
  const pc = await pagina('conductor');
  await pc.goto(`${BASE}taxicun/conductor/?real=1`);
  await pc.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await pc.fill('.a-ingreso-real input[name=correo]', COND.correo);
  await pc.click('.a-ingreso-real [type=submit]');
  await escribir(pc, '.a-ingreso-real .a-casillas-6', COND.codigo);
  await pc.waitForSelector('[data-conectar]:not([disabled])', { timeout: 25000 });
  await pc.waitForTimeout(800);
  await pc.click('[data-menu]');
  await pc.click('.a-menu :is(button, a):has-text("Cómo me pagan")');
  await pc.waitForSelector('.a-panel-cobro [data-llave-input]', { timeout: 10000 });
  const png = Buffer.from(await pc.evaluate(async (t) => {
    const { dibujarQR } = await import('/nucleo/qr.js');
    const c = document.createElement('canvas');
    c.width = 700; c.height = 1000;
    const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 700, 1000);
    dibujarQR(x, t, 120, 250, 460, { margen: 2 });
    return c.toDataURL('image/png').split(',')[1];
  }, EMV), 'base64');
  await pc.setInputFiles('.a-panel-cobro [data-archivo-qr]', { name: 'nequi.png', mimeType: 'image/png', buffer: png });
  await pc.waitForSelector('.a-panel-cobro [data-vista-qr] canvas', { timeout: 10000 });
  await pc.selectOption('.a-panel-cobro [data-entidad-sel]', 'nequi');
  await pc.selectOption('.a-panel-cobro [data-tipo-llave]', 'celular');
  await pc.fill('.a-panel-cobro [data-llave-input]', '+57 310 987 6543');
  await pc.click('.a-panel-cobro [data-guardar-cobro]');
  await pc.waitForSelector('.a-modal [data-codigo-cobro]', { timeout: 10000 });
  await pc.fill('.a-modal [data-codigo-cobro]', COND.codigo);
  await tocarModal(pc, 'Confirmar');
  ok(await intento(pc.waitForSelector('.a-panel-cobro [data-cambiar]', { timeout: 10000 })), '1) «Cómo me pagan» guardado con el servidor (código fijo de la cuenta de prueba)');
  const fila = sql(`select entidad || '|' || llave_tipo || '|' || llave || '|' || coalesce(titular, '') || '|' || (qr_texto = '${EMV}') from conductores_cobro`);
  ok(fila === 'nequi|celular|3109876543|LUIS PRUEBA|true', `1) en conductores_cobro: nequi, celular normalizado, titular del campo 59 y el TEXTO del QR (${fila})`);
  await foto(pc, '01-como-me-pagan');
  await pc.click('.a-panel-cobro [data-cerrar]');
  await pc.waitForTimeout(500);
  await pc.click('[data-conectar]');
  ok(await intento(pc.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 })), '1) en turno');

  // 2) Pasajera: entra, pide y el conductor la lleva.
  const pp = await pagina('pasajero');
  await pp.goto(`${BASE}taxicun/?real=1`);
  await pp.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await pp.click('.a-bienvenida [data-saltar]');
  await pp.fill('.a-bienvenida input[name=correo]', PAS.correo);
  await pp.click('.a-bienvenida .a-check');
  await pp.click('.a-bienvenida [data-enviar]');
  await escribir(pp, '.a-bienvenida .a-casillas-6', PAS.codigo);
  await pp.waitForSelector('.a-bienvenida input[name=nombre], .a-bienvenida [data-empezar]', { timeout: 15000 });
  if (await pp.$('.a-bienvenida input[name=nombre]')) {
    await pp.fill('.a-bienvenida input[name=nombre]', PAS.nombre);
    await pp.fill('.a-bienvenida input[name=celular]', PAS.celular);
    await pp.click('.a-bienvenida [data-guardar]');
  }
  await pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 });
  await pp.waitForTimeout(2500);
  await pp.click('[data-frecuente] >> nth=0');
  await vista(pp, 'confirmar', 10000);
  await pp.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await pp.waitForTimeout(800);
  await pp.click('[data-pedir]');
  await pc.waitForSelector('.a-solicitud.a-abierta', { timeout: 25000 });
  await pc.waitForTimeout(600);
  await pc.press('.a-solicitud .a-deslizador-mango', 'Enter');
  await vista(pc, 'hacia_origen', 20000);
  await vista(pp, 'asignado', 20000);
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo');
  await pc.click('[data-llegue]');
  await vista(pc, 'en_origen', 15000);
  await escribir(pc, '.a-hoja [data-casillas]', codigo);
  await vista(pc, 'en_viaje', 15000);
  await vista(pp, 'en_viaje', 15000);
  await pc.click('[data-terminar]');
  await tocarModal(pc, 'Terminar y cobrar');
  await vista(pc, 'cobrando', 15000);
  ok(await intento(vista(pp, 'pagar', 15000)), '2) viaje completo: el conductor cobra y la pasajera llega a «pagar»');

  // 3) La pasajera paga por transferencia con lo que manda el servidor.
  ok(await intento(pp.waitForSelector('[data-pagar-qr-llave]:not([hidden])', { timeout: 10000 })), '3) el servidor manda el `cobro` con los métodos → «Pagar con QR o llave»');
  await pp.click('[data-pagar-qr-llave]');
  await pp.waitForSelector('.a-modal [data-hoja-pago-qr]', { timeout: 8000 });
  await pp.waitForTimeout(500);
  ok((await leerCanvas(pp, '.a-modal [data-qr] canvas')) === EMV, '3) el QR redibujado se lee igual al que subió el conductor');
  ok((await textoCrudo(pp, '.a-modal [data-llave]')) === '3109876543' && (await textoCrudo(pp, '.a-modal [data-titular]')) === 'LUIS PRUEBA' && (await textoCrudo(pp, '.a-modal [data-entidad]')) === 'Nequi', '3) Nequi, la llave y el titular');
  await pp.click('.a-modal [data-copiar]');
  await pp.waitForTimeout(300);
  ok((await pp.evaluate(() => navigator.clipboard.readText())) === '3109876543', '3) «Copiar» copia la llave');
  await foto(pp, '03-hoja-pago');
  await tocarModal(pp, 'Ya pagué por transferencia');
  await vista(pp, 'calificar', 10000);
  ok(await intento(pc.waitForFunction(() => /ya te transfirió \(Nequi\)/.test(document.querySelector('[data-pago-anunciado-txt]')?.textContent || ''), null, { timeout: 10000 })), '4) al conductor: «El pasajero dice que ya te transfirió (Nequi)…»');
  await foto(pc, '04-conductor-transferencia');
  await pc.click('[data-transferencia]');
  await tocarModal(pc, 'Sí, me llegó');
  await vista(pc, 'calificar', 10000);
  await pc.waitForTimeout(1500);
  const pago = sql("select metodo_pago || '|' || coalesce(pago_entidad, '') from viajes order by creado desc limit 1");
  ok(pago === 'transferencia|nequi', `5) en la base: metodo_pago transferencia, pago_entidad nequi (${pago})`);
  ok(await intento(pp.waitForFunction(() => /Pago por transferencia/.test(document.querySelector('.a-pago-ok')?.textContent || ''), null, { timeout: 5000 })), '5) la pasajera ve «Pago por transferencia»');
  await pc.click('[data-enviar]');
  await pp.click('[data-omitir]').catch(() => {});

  // 6) Borrar las cuentas borra lo de cobro.
  const tc = await pc.evaluate(() => localStorage.getItem('taxicun.token'));
  const tp = await pp.evaluate(() => localStorage.getItem('taxicun.token'));
  const d1 = await api('DELETE', 'yo', undefined, tc);
  const d2 = await api('DELETE', 'yo', undefined, tp);
  ok(d1.estado === 200 && d2.estado === 200 && sql('select count(*) from conductores_cobro') === '0', '6) borrar la cuenta del conductor borra su fila de conductores_cobro');
} catch (x) {
  ok(false, `se cortó: ${x.message.split('\n')[0]}`);
}
ok(errores.length === 0, `sin errores de JavaScript (${errores.slice(0, 3).join(' | ')})`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · pago con QR o llave con el servidor de verdad · ${bien} ✔ · ${fallas} ✘ · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
