// Integración de la app 1.2 de punta a punta: el servidor de la rama v1.2 (0.3.0) con
// PUSH_SIMULADO (cada notificación queda como una línea en un archivo .jsonl, con lo que iría a
// Apple o a Google, en vez de enviarse), la web v1.2 por el proxy de mismo origen y Capacitor
// simulado como en la app 1.2 de iPhone (PushNotifications y NativeBiometric; tokens de APNs en
// hexadecimal MAYÚSCULAS, como los entrega iOS). Nada de /api se simula: todo va al servidor.
//
//  1) El conductor 1.2 se pone en turno, activa los avisos (PUT yo/dispositivo) y pasa a segundo
//     plano: la app cierra el WebSocket y la central lo deja «en turno en segundo plano»
//     (turnos_dormidos); el sistema mata la app. El pasajero pide → la central «envía» el push al
//     conductor (el archivo trae título, texto, tema, cabeceras y datos) → el conductor abre la
//     app desde ESA notificación (el payload de APNs tal cual, como notification.data en iOS) →
//     ve la oferta y la acepta → viaje completo (llegó, código, en viaje, fin, cobro, calificación).
//  2) El pasajero activa los avisos al pedir y cierra la app: le llegan por push la aceptación,
//     «llegó» y el final (con los textos del contrato). Abre desde «llegó» (ve el código de
//     abordaje) y desde el final (paga en efectivo y califica). Un aviso por cosa, nada repetido.
//  3) Face ID: la llave se crea al entrar con el código; «Pedir Face ID al abrir la app»; cerrar
//     sesión borra el teléfono en el servidor (DELETE con el token en mayúsculas) y conserva la
//     llave; «Entrar con Face ID» (POST auth/llave, último uso); al abrir la app, bloqueada.
//  4) Un conductor SIN token (app 1.0, sin los plugins) se comporta como hoy: al cerrar la app no
//     queda dormido, nunca aparece en el archivo y recibe la oferta por el tiempo real con la app
//     abierta. Y el conductor 1.2 que se desconecta a propósito tampoco queda dormido.
//  5) --pausa (aparte, con el servidor arrancado con TURNO_DORMIDO_MIN=0.1, 6 s): al vencerse el turno
//     en segundo plano, la central manda UN «Tu turno quedó en pausa» (sin time-sensitive, collapse-id
//     «turno», datos.hasta y vencimiento a las 2 h); tocarlo abre la app y la vuelve a poner en turno
//     («Volviste a estar en turno.»); tocar uno vencido no («Ponte en turno para recibir servicios.»);
//     volver antes del plazo y terminar el turno a propósito no mandan el aviso. El recorrido normal
//     necesita el plazo normal (con 6 s el turno vencería antes de que el pasajero pida).
//  6) A3, solo con la central de «Reglas del despacho» (bienvenida con reglas; con las anteriores se omite): el
//     conductor 1.2 ve la oferta (oferta_vista), la rechaza (rechazo) y minimiza enseguida (antes de 2 s, cuando la
//     central de oferta-fix sí se la repetía) → no le llega por push y el pasajero ve «Ningún taxi tomó tu solicitud»
//     con «Llamar a la central»; vuelve, ve otra y minimiza sin responder → tampoco, y al vencerse en su pantalla el
//     pasajero queda «sin conductores»; la que llega con la app ya minimizada sí le llega por push (control).
//
// Servidor (árbol de la rama v1.2), base taxicun_e2e:
//   PUSH_SIMULADO=/tmp/cootrans/v12/integracion/avisos.jsonl \
//   CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790,conductor2@prueba.taxicun.com:975310" \
//   DATABASE_URL=… CLAVE_SERVIDOR=… MODO_CORREO=prueba INDICE_EMPRESAS=… CODIGOS_POR_IP_HORA=100000 PUERTO=3199 node src/index.js
// Proxy:   node pruebas/servidor-local.mjs --puerto=8799 --api=http://127.0.0.1:3199
// Prueba:  AVISOS_PUSH=<el mismo .jsonl> DATABASE_URL=… SERVIDOR_TAXICUN=<árbol v1.2> node pruebas/push-e2e-v12.mjs http://localhost:8799/
// Pausa:   el mismo servidor con TURNO_DORMIDO_MIN=0.1 y … node pruebas/push-e2e-v12.mjs http://localhost:8799/ --pausa
// Se puede repetir sin reiniciar nada: borra y vuelve a crear las tres cuentas de prueba.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8799/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/push-e2e-v12').replace(/\/?$/, '/');
const AVISOS = process.env.AVISOS_PUSH || '/tmp/cootrans/v12/integracion/avisos.jsonl';
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_e2e';
const SERVIDOR = process.env.SERVIDOR_TAXICUN || '/root/proyectos/taxicun-servidor';
const SOLO_PAUSA = process.argv.includes('--pausa');
mkdirSync(DIR, { recursive: true });

const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const lugar = (nombre) => FICHA.LUGARES.find((l) => l.nombre === nombre) || FICHA.LUGARES[0];
const DESTINO = lugar('Tierra Grata');
const SEGUNDO = lugar('Puesto de Salud');
const GPS_P = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 };
const GPS_A = { latitude: CENTRO.lat + 0.0027, longitude: CENTRO.lng, accuracy: 10 };
const GPS_B = { latitude: CENTRO.lat - 0.0027, longitude: CENTRO.lng, accuracy: 10 };

const PAS = { correo: 'pasajero@prueba.taxicun.com', codigo: '246810', nombre: 'Ana María Gómez', celular: '3001234567' };
const CA = { correo: 'conductor@prueba.taxicun.com', codigo: '135790', nombre: 'Luis Alberto Rodríguez', celular: '3115550101', movil: '77', placa: 'TST777' };
const CB = { correo: 'conductor2@prueba.taxicun.com', codigo: '975310', nombre: 'Jorge Iván Peña', celular: '3125550202', movil: '78', placa: 'TST778' };
// Tokens de APNs como los entrega iOS a Capacitor: hexadecimal en MAYÚSCULAS (64 caracteres).
const TOKEN_A = 'C0FFEE12'.repeat(8);
const TOKEN_P = 'BEEF5678'.repeat(8);
const tA = TOKEN_A.toLowerCase();
const tP = TOKEN_P.toLowerCase();

/* ---------------- resultados ---------------- */
let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
class Detener extends Error {}
async function debe(promesa, m) {
  let motivo = '';
  const r = await Promise.resolve(promesa).then((x) => x !== false && x !== null && x !== undefined, (e) => {
    motivo = e?.message?.split('\n')[0] || String(e);
    return false;
  });
  ok(r, `${m}${r || !motivo ? '' : ` (${motivo})`}`);
  if (!r) throw new Detener(m);
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 8000, paso = 150) {
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
const pesos = (n) => `$${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

/* ---------------- base de datos, API y archivo de avisos ---------------- */
const sql = (q) => execFileSync('psql', [BASE_DATOS, '-tAc', q], { encoding: 'utf8', timeout: 15000 }).trim();
const cita = (t) => `'${String(t).replace(/'/g, "''")}'`;
const idDe = (correo) => sql(`select id from usuarios where correo = ${cita(correo)} and borrado is null`);
const dormido = (correo) => sql(`select count(*) from turnos_dormidos t join usuarios u on u.id = t.usuario_id where u.correo = ${cita(correo)}`) === '1';
// Segundos que le quedan de turno en segundo plano (el TURNO_DORMIDO_MIN con que arrancó el servidor).
const plazoDormido = (correo) => Number(sql(`select extract(epoch from t.hasta - now()) from turnos_dormidos t join usuarios u on u.id = t.usuario_id where u.correo = ${cita(correo)}`));
const dispositivosDe = (correo) => sql(`select coalesce(string_agg(d.app || '|' || d.plataforma || '|' || d.entorno || '|' || d.token, ','), '') from dispositivos d join usuarios u on u.id = d.usuario_id where u.correo = ${cita(correo)}`);

async function api(metodo, ruta, cuerpo, token) {
  const cabeceras = { accept: 'application/json' };
  if (cuerpo !== undefined) cabeceras['content-type'] = 'application/json';
  if (token) cabeceras.authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}api/${ruta}`, { method: metodo, headers: cabeceras, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  let datos = null;
  try {
    datos = await r.json();
  } catch {
    datos = null;
  }
  return { estado: r.status, datos };
}
async function entrarApi(c) {
  await api('POST', 'auth/codigo', { correo: c.correo });
  return api('POST', 'auth/entrar', { correo: c.correo, codigo: c.codigo });
}

const leerAvisos = () => (existsSync(AVISOS) ? readFileSync(AVISOS, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
let marca = 0; // líneas del archivo antes de la parte actual
let marcaInicio = 0; // líneas del archivo antes de esta corrida (otras pruebas también escriben ahí)
const nuevos = () => leerAvisos().slice(marca);
const resumen = (l) => `${l.app}/${l.datos?.tipo}${l.datos?.fase ? `/${l.datos.fase}` : ''} «${l.cuerpo}»`;
// La notificación como la entrega @capacitor/push-notifications en iOS: data = userInfo (el cuerpo de APNs con «aps»).
const notificacionIos = (l) => ({
  id: `n-${l.datos?.viajeId || 'x'}`,
  title: l.apns?.cuerpo?.aps?.alert?.title || '',
  body: l.apns?.cuerpo?.aps?.alert?.body || '',
  data: l.apns?.cuerpo || {},
});

/* ---------------- Capacitor simulado (app 1.2 de iPhone) ---------------- */
// cfg: { push, bio, plataforma, tokenPush, tipoBio }. Lo que dura entre aperturas (permiso, llavero,
// falla de la biometría, notificación con la que se abre) va en localStorage con prefijo «__».
function capacitorFalso(cfg) {
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const llamadas = (window.__llamadas = []);
  const anotar = (n, a) => llamadas.push([n, a ?? null]);
  const oyentes = {};
  const plugins = {};
  if (cfg.push) {
    plugins.PushNotifications = {
      async checkPermissions() {
        return { receive: L('__permisoPush') || 'prompt' };
      },
      async requestPermissions() {
        anotar('push.requestPermissions');
        L('__permisoPush', 'granted');
        return { receive: 'granted' };
      },
      async register() {
        anotar('push.register');
        setTimeout(() => (oyentes.registration || []).forEach((f) => f({ value: cfg.tokenPush })), 40);
      },
      async addListener(ev, fn) {
        (oyentes[ev] ||= []).push(fn);
        // iOS guarda el toque de la notificación con la que se abrió la app hasta que haya oyente.
        if (ev === 'pushNotificationActionPerformed' && L('__toqueAlAbrir')) {
          const n = L('__toqueAlAbrir');
          localStorage.removeItem('__toqueAlAbrir');
          setTimeout(() => fn({ actionId: 'tap', notification: n }), 30);
        }
        return { remove: async () => { oyentes[ev] = (oyentes[ev] || []).filter((x) => x !== fn); } };
      },
      async removeAllListeners() {},
      async createChannel() {},
      async removeAllDeliveredNotifications() { anotar('push.limpiarEntregadas'); },
    };
  }
  if (cfg.bio) {
    plugins.NativeBiometric = {
      async isAvailable() {
        return { isAvailable: true, biometryType: cfg.tipoBio ?? 2, authenticationStrength: 1, deviceIsSecure: true, strongBiometryIsAvailable: true };
      },
      async verifyIdentity(op) {
        anotar('bio.verifyIdentity', op);
        const f = L('__bioFalla');
        if (f) {
          const e = new Error('Biometric authentication failed');
          e.code = String(f);
          throw e;
        }
      },
      async setCredentials(op) {
        anotar('bio.setCredentials');
        L('__llavero', { ...(L('__llavero') || {}), [op.server]: { username: op.username, password: op.password } });
      },
      async getCredentials(op) {
        const c = (L('__llavero') || {})[op.server];
        if (!c) throw new Error('No credentials found');
        return c;
      },
      async deleteCredentials(op) {
        const ll = L('__llavero') || {};
        delete ll[op.server];
        L('__llavero', ll);
      },
      async isCredentialsSaved(op) {
        return { isSaved: Boolean((L('__llavero') || {})[op.server]) };
      },
    };
  }
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => cfg.plataforma || 'ios',
    isPluginAvailable: (n) => n in plugins,
    Plugins: plugins,
  };
}

/* ---------------- navegador ---------------- */
const b = await chromium.launch({ executablePath: EXE });
const errores = [];
function vigilar(p, nombre) {
  p.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  p.on('console', (m) => {
    if (m.type() !== 'error') return;
    const url = m.location()?.url || '';
    if (/Failed to load resource|net::ERR_|status of \d{3}|CORS policy/.test(m.text()) && url && !url.startsWith(BASE)) return;
    if (/Failed to load resource|net::ERR_/.test(m.text())) return;
    errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  p.on('response', (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 500) errores.push(`[${nombre}] ${r.status()} ${r.url()}`);
  });
}
async function contexto(cfg, gps) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: gps, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  await ctx.addInitScript(capacitorFalso, cfg);
  // Cada aviso que se ve en pantalla.
  await ctx.addInitScript(() => {
    window.__avisos = [];
    new MutationObserver(() => {
      document.querySelectorAll('.a-toast:not([data-visto])').forEach((n) => {
        n.dataset.visto = '1';
        window.__avisos.push(n.innerText.replace(/\s+/g, ' ').trim());
      });
    }).observe(document, { childList: true, subtree: true });
  });
  return ctx;
}
// Abre la app (una página nueva en el mismo teléfono); con «notificacion», la app se abre al tocarla.
async function abrirApp(ctx, nombre, url, notificacion = null) {
  const p = await ctx.newPage();
  vigilar(p, nombre);
  if (notificacion) {
    await p.goto(`${BASE}empresas/indice.json`);
    await p.evaluate((n) => localStorage.setItem('__toqueAlAbrir', JSON.stringify(n)), notificacion);
  }
  await p.goto(`${BASE}${url}`);
  return p;
}
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((s) => document.querySelector(s)?.innerText.replace(/\s+/g, ' ') || '', sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const avisosVistos = (p) => p.evaluate(() => window.__avisos || []);
const llavero = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('__llavero') || '{}')['taxicun.com'] || null);
const ls = (p, k) => p.evaluate((x) => localStorage.getItem(x), k);
const intento = (pr) => Promise.resolve(pr).then(() => true, () => false);
async function escribirCodigo(p, selector, codigo) {
  await p.waitForSelector(`${selector} input`, { timeout: 15000 });
  await p.waitForTimeout(400);
  await p.click(`${selector} input >> nth=0`);
  await p.keyboard.type(codigo, { delay: 35 });
}
async function tocarModal(p, textoBoton) {
  const sel = `.a-modal button:has-text("${textoBoton}")`;
  await p.waitForSelector(sel, { timeout: 8000 });
  await p.waitForTimeout(300);
  await p.click(sel);
  await p.waitForTimeout(300);
}
// La app pasa a segundo plano (true) o vuelve (false).
async function visibilidad(p, oculta) {
  await p.evaluate((o) => {
    if (!window.__visibilidadFalsa) {
      window.__visibilidadFalsa = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
    }
    window.__oculta = o;
    document.dispatchEvent(new Event('visibilitychange'));
  }, oculta);
}
async function menu(p, item) {
  await p.click('[data-menu]');
  await p.waitForSelector('.a-menu-item', { timeout: 5000 });
  await p.waitForTimeout(450);
  await p.click(`.a-menu-item:has-text("${item}")`);
}
async function abrirAjustes(p) {
  await menu(p, 'Ajustes');
  await p.waitForSelector('.a-panel.a-abierto', { timeout: 5000 });
  await p.waitForTimeout(700);
}
async function entrarConductor(p, c, faceId) {
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', c.correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', c.codigo);
  if (faceId) {
    await p.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Face ID")', { timeout: 15000 });
    await tocarModal(p, faceId);
  }
  await p.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  return true;
}
async function entrarPasajero(p, c) {
  await p.waitForSelector('.a-bienvenida input[name=correo]', { timeout: 15000 });
  await p.fill('.a-bienvenida input[name=correo]', c.correo);
  const marcado = await p.$eval('.a-bienvenida input[name=terminos]', (n) => n.checked).catch(() => true);
  if (!marcado) await p.click('.a-bienvenida .a-check');
  await p.click('.a-bienvenida [data-enviar]');
  await escribirCodigo(p, '.a-bienvenida .a-casillas-6', c.codigo);
}
async function pedirTaxi(p, destino) {
  await p.click('[data-buscar]');
  await p.waitForSelector('.a-buscador.a-abierto', { timeout: 8000 });
  await p.fill('[data-q]', destino.nombre);
  const fila = `.a-buscador .a-fila:has-text("${destino.nombre}")`;
  await p.waitForSelector(fila, { timeout: 10000 });
  await p.waitForTimeout(500);
  await p.click(fila);
  await vista(p, 'confirmar', 10000);
  await p.waitForSelector('[data-pedir]:not([disabled])', { timeout: 25000 });
  await p.waitForTimeout(600);
  await p.click('[data-pedir]');
  return vista(p, 'buscando', 15000);
}

/* ------------------------------------------------------------------ */
/* 0) Cuentas limpias: pasajero con perfil y dos conductores aprobados */
/* ------------------------------------------------------------------ */
async function preparar() {
  const salud = await api('GET', 'salud');
  await debe(salud.estado === 200 && /^0\.[345678]\./.test(salud.datos?.version || ''), `servidor 1.2 (0.3), 0.4, 0.5, 0.6, 0.7 o 0.8 por el proxy (${salud.datos?.version || salud.estado})`);
  await debe(existsSync(AVISOS), `el servidor escribe los avisos simulados en ${AVISOS} (PUSH_SIMULADO)`);
  marcaInicio = leerAvisos().length;
  for (const c of [PAS, CA, CB]) {
    const r = await entrarApi(c);
    await debe(r.estado === 200, `cuenta de prueba ${c.correo} (¿está en CUENTAS_PRUEBA?)`);
    await api('DELETE', 'yo', undefined, r.datos.token); // cancela lo que haya quedado y borra teléfonos y llaves
  }
  const p = await entrarApi(PAS);
  await api('PATCH', 'yo', { nombre: PAS.nombre, celular: PAS.celular }, p.datos?.token);
  await api('POST', 'auth/salir', undefined, p.datos?.token);
  for (const c of [CA, CB]) {
    const r = await entrarApi(c);
    await api('PATCH', 'yo', { nombre: c.nombre, celular: c.celular }, r.datos?.token);
    const reg = await api('PUT', 'conductor', { empresa: 'cootransrural', movil: c.movil, placa: c.placa }, r.datos?.token);
    const apr = execFileSync('node', ['bin/admin.js', 'aprobar', c.correo, '--motivo', 'Documentos revisados (prueba de punta a punta)'], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000 }).trim();
    await api('POST', 'auth/salir', undefined, r.datos?.token);
    await debe(reg.estado === 200 && /aprobado/.test(apr), `conductor ${c.nombre} registrado y aprobado (móvil ${c.movil})`);
  }
}

let P; // pasajero (iPhone con la app 1.2)
let A; // conductor 1.2 con avisos
let B; // conductor con la app 1.0 (sin los plugins: sin token)
let pp;
let pa;
let pb;

/* ------------------------------------------------------------------ */
/* 4a) Conductor SIN token: al cerrar la app no queda dormido           */
/* ------------------------------------------------------------------ */
async function conductorSinToken() {
  B = await contexto({ push: false, bio: false, plataforma: 'ios' }, GPS_B);
  pb = await abrirApp(B, 'conductor 1.0', 'taxicun/conductor/');
  await debe(entrarConductor(pb, CB, null), 'conductor 1.0 (sin plugins): entra con el código');
  await pb.waitForTimeout(1200);
  ok(!(await pb.$('.a-modal-nativa')), 'conductor 1.0: no ofrece Face ID');
  await pb.click('[data-conectar]');
  await debe(pb.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'conductor 1.0: en turno (sin el modal de los avisos)');
  ok(!(await pb.$('.a-modal-nativa')), 'conductor 1.0: no pregunta por los avisos');
  await pb.waitForTimeout(1000);
  ok(dispositivosDe(CB.correo) === '', 'conductor 1.0: no registró ningún teléfono');
  await foto(pb, 'b01-en-turno');
  await pb.close(); // el sistema mata la app
  await espera(2500);
  ok(!dormido(CB.correo), 'conductor 1.0: al cerrar la app en turno NO queda dormido (como hoy)');
}

/* ------------------------------------------------------------------ */
/* 1a) Conductor 1.2: en turno, avisos y a segundo plano → dormido       */
/* ------------------------------------------------------------------ */
async function conductorDuerme() {
  A = await contexto({ push: true, bio: true, plataforma: 'ios', tokenPush: TOKEN_A, tipoBio: 2 }, GPS_A);
  pa = await abrirApp(A, 'conductor 1.2', 'taxicun/conductor/');
  await debe(entrarConductor(pa, CA, 'Ahora no'), 'conductor 1.2: entra con el código («Ahora no» a Face ID)');
  await pa.click('[data-conectar]');
  await debe(pa.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Que no se te pase ningún servicio")', { timeout: 8000 }), 'conductor 1.2: al ponerse en turno, «Que no se te pase ningún servicio»');
  await tocarModal(pa, 'Activar avisos');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'conductor 1.2: en turno');
  await debe(hasta(() => dispositivosDe(CA.correo) === `conductor|ios|production|${tA}`, 8000), 'conductor 1.2: PUT yo/dispositivo; el servidor guarda el token de iOS en minúsculas (conductor, ios, production)');
  await pa.waitForTimeout(800);
  ok(!dormido(CA.correo), 'conductor 1.2: con la app abierta no está dormido');
  const t0 = Date.now();
  await visibilidad(pa, true); // botón de inicio: la app pasa a segundo plano
  const dormidoYa = await hasta(() => dormido(CA.correo), 6000, 100);
  await debe(dormidoYa, `conductor 1.2: al minimizar, la app cierra el WebSocket y la central lo deja en turno en segundo plano (${((Date.now() - t0) / 1000).toFixed(1)} s, sin esperar el latido)`);
  const pos = sql(`select pos::text from turnos_dormidos t join usuarios u on u.id = t.usuario_id where u.correo = ${cita(CA.correo)}`);
  ok(/lat/.test(pos), `conductor 1.2: queda con su última posición (${pos.slice(0, 60)})`);
  const plazo = plazoDormido(CA.correo);
  await debe(plazo > 120, `conductor 1.2: plazo en segundo plano de ${Math.round(plazo)} s (este recorrido necesita el TURNO_DORMIDO_MIN normal; con uno corto, --pausa)`);
  await pa.close(); // y el sistema mata la app
  await espera(1000);
  ok(dormido(CA.correo), 'conductor 1.2: con la app cerrada sigue en turno en segundo plano');
}

/* ------------------------------------------------------------------ */
/* 1b + 2) Pasajero pide → push al conductor → viaje completo con avisos */
/* ------------------------------------------------------------------ */
async function viaje() {
  marca = leerAvisos().length;
  P = await contexto({ push: true, bio: true, plataforma: 'ios', tokenPush: TOKEN_P, tipoBio: 2 }, GPS_P);
  pp = await abrirApp(P, 'pasajero', 'taxicun/');
  await pp.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await pp.click('.a-bienvenida [data-saltar]');
  await entrarPasajero(pp, PAS);
  await debe(pp.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Entrar con Face ID la próxima vez?")', { timeout: 15000 }), 'pasajero: tras el código, «¿Entrar con Face ID la próxima vez?»');
  await tocarModal(pp, 'Usar Face ID');
  const cred = await hasta(() => llavero(pp), 8000);
  await debe(cred && sql(`select count(*) from llaves_dispositivo where id = ${cita(cred.username)} and usuario_id = ${cita(idDe(PAS.correo))} and not revocada`) === '1', 'pasajero: POST yo/llave → la llave existe en el servidor con el id del llavero');
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 });
  ok(nuevos().length === 0, 'antes de pedir: ningún aviso enviado');

  await debe(pedirTaxi(pp, DESTINO), `pasajero: pide un taxi a ${DESTINO.nombre} (queda buscando)`);
  await debe(pp.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Te avisamos cuando llegue tu taxi?")', { timeout: 8000 }), 'pasajero: con el primer taxi, «¿Te avisamos cuando llegue tu taxi?»');
  await tocarModal(pp, 'Sí, avisarme');
  await debe(hasta(() => dispositivosDe(PAS.correo) === `pasajero|ios|production|${tP}`, 8000), 'pasajero: el servidor guardó su teléfono (pasajero, ios, production)');
  const viajeId = await hasta(() => sql(`select id from viajes where pasajero_id = ${cita(idDe(PAS.correo))} and estado = 'buscando'`), 8000);
  await debe(viajeId, `pasajero: viaje buscando en la base (${viajeId})`);
  const tarifa = Number(sql(`select tarifa from viajes where id = ${cita(viajeId)}`));

  // El push «Nuevo servicio» al conductor dormido.
  const sol = await hasta(() => nuevos().find((l) => l.app === 'conductor' && l.datos?.tipo === 'solicitud'), 8000);
  await debe(sol, `central → conductor dormido: «Nuevo servicio» en el archivo${sol ? ` (${resumen(sol)})` : ''}`);
  ok(sol.plataforma === 'ios' && sol.token === tA && sol.entorno === 'production', 'push solicitud: al iPhone del conductor (token y entorno registrados)');
  ok(sol.titulo === 'Nuevo servicio' && sol.apns.cuerpo.aps.alert.title === 'Nuevo servicio', 'push solicitud: título «Nuevo servicio»');
  const cuerpoEsperado = new RegExp(`^Ana · .+ → ${DESTINO.nombre} · ${pesos(tarifa).replace(/[$.]/g, '\\$&')}$`);
  ok(cuerpoEsperado.test(sol.cuerpo), `push solicitud: «<Nombre> · <origen> → <destino> · $<tarifa>» = «${sol.cuerpo}» (tarifa ${pesos(tarifa)})`);
  ok(!sol.cuerpo.includes('Gómez') && !sol.cuerpo.includes(PAS.celular), 'push solicitud: sin apellido ni celular del pasajero');
  ok(sol.datos.tipo === 'solicitud' && sol.datos.viajeId === viajeId, 'push solicitud: datos { tipo: solicitud, viajeId }');
  ok(sol.apns.tema === 'com.taxicun.conductor' && sol.apns.cabeceras['apns-topic'] === 'com.taxicun.conductor', 'push solicitud: tema com.taxicun.conductor');
  ok(sol.apns.cuerpo.aps['interruption-level'] === 'time-sensitive' && sol.apns.cuerpo.aps.sound === 'default', 'push solicitud: sonido y time-sensitive (suena con el iPhone bloqueado o en concentración)');
  ok(sol.apns.cabeceras['apns-collapse-id'] === viajeId && sol.apns.cabeceras['apns-push-type'] === 'alert' && sol.apns.cabeceras['apns-priority'] === '10', 'push solicitud: collapse-id = viajeId, alert, prioridad 10');
  const vence = Number(sol.apns.cabeceras['apns-expiration']) - Date.parse(sol.fecha) / 1000;
  ok(vence > 50 && vence <= 61, `push solicitud: vence en ~60 s (${Math.round(vence)} s)`);
  ok(sol.apns.cuerpo.tipo === 'solicitud' && sol.apns.cuerpo.viajeId === viajeId, 'push solicitud: tipo y viajeId junto a «aps» (la app los lee en notification.data)');
  ok(!nuevos().some((l) => l.app === 'conductor' && l.token !== tA), 'push solicitud: nada para el conductor sin token (app 1.0)');
  await foto(pp, 'p01-buscando');

  // El pasajero también cierra la app: con los avisos listos, al minimizar se cierra el WebSocket.
  await visibilidad(pp, true);
  await pp.waitForTimeout(800);
  await pp.close();

  // El conductor toca «Nuevo servicio»: la app abre, vuelve a quedar en turno y muestra la oferta.
  pa = await abrirApp(A, 'conductor 1.2', 'taxicun/conductor/', notificacionIos(sol));
  await debe(pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 30000 }), 'conductor 1.2: abierta desde «Nuevo servicio», ve la oferta');
  const oferta = await texto(pa, '.a-solicitud');
  ok(oferta.includes('Ana') && oferta.includes(DESTINO.nombre), `conductor 1.2: es el servicio de Ana a ${DESTINO.nombre}`);
  ok(await hasta(() => !dormido(CA.correo), 5000), 'conductor 1.2: conectado, ya no está dormido');
  ok(await hasta(() => dispositivosDe(CA.correo) === `conductor|ios|production|${tA}`, 5000), 'conductor 1.2: su teléfono sigue registrado (uno solo)');
  await foto(pa, 'c01-oferta-desde-aviso');
  await pa.click('.a-solicitud [data-aceptar]');
  await debe(vista(pa, 'hacia_origen', 20000), 'conductor 1.2: acepta → «Recoge a Ana»');
  ok(await hasta(() => sql(`select estado from viajes where id = ${cita(viajeId)}`) === 'asignado', 5000), 'central: viaje asignado');
  await espera(2000);
  ok(!(await avisosVistos(pa)).some((a) => /ya no está disponible/.test(a)), 'conductor 1.2: sin «Ese servicio ya no está disponible»');

  // Aceptación → push al pasajero (app cerrada).
  const acep = await hasta(() => nuevos().find((l) => l.app === 'pasajero' && l.datos?.tipo === 'aceptacion'), 8000);
  await debe(acep, `central → pasajero (app cerrada): aceptación${acep ? ` (${resumen(acep)})` : ''}`);
  ok(acep.token === tP && acep.apns.tema === 'com.taxicun.app', 'push aceptación: al iPhone del pasajero (tema com.taxicun.app)');
  ok(/^Tu taxi va en camino: Luis Alberto Rodríguez · Móvil 0?77 · TST ?777$/i.test(acep.cuerpo), `push aceptación: «Tu taxi va en camino: <nombre> · Móvil <movil> · <placa>» = «${acep.cuerpo}»`);
  ok(acep.datos.viajeId === viajeId && acep.apns.cuerpo.aps['interruption-level'] === 'time-sensitive', 'push aceptación: viajeId y time-sensitive');

  // Llega al punto: «Llegué» → push «llegó».
  const origen = await pa.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje?.origen || null);
  await A.setGeolocation({ latitude: origen?.lat ?? CENTRO.lat, longitude: origen?.lng ?? CENTRO.lng, accuracy: 8 });
  await debe(pa.waitForSelector('[data-llegue].a-resaltar', { timeout: 20000 }), 'conductor 1.2: en el punto se resalta «Llegué»');
  await pa.click('[data-llegue]');
  await debe(vista(pa, 'en_origen', 10000), 'conductor 1.2: «Llegué» → pide el código de abordaje');
  const lle = await hasta(() => nuevos().find((l) => l.app === 'pasajero' && l.datos?.tipo === 'estado' && l.datos?.fase === 'llego'), 8000);
  await debe(lle, `central → pasajero (app cerrada): llegó${lle ? ` (${resumen(lle)})` : ''}`);
  ok(lle.cuerpo === 'Tu taxi está en la puerta' && lle.apns.cuerpo.aps['interruption-level'] === 'time-sensitive', 'push llegó: «Tu taxi está en la puerta», time-sensitive');
  ok(lle.datos.viajeId === viajeId && lle.apns.cuerpo.fase === 'llego', 'push llegó: datos { tipo: estado, fase: llego, viajeId }');

  // El pasajero abre la app desde «Tu taxi está en la puerta»: ve el código.
  pp = await abrirApp(P, 'pasajero', 'taxicun/', notificacionIos(lle));
  await debe(vista(pp, 'llego', 30000), 'pasajero: abierta desde «Tu taxi está en la puerta» → pantalla «llegó»');
  await pp.waitForTimeout(600);
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  await debe(/^\d{4}$/.test(codigo || ''), `pasajero: ve el código de abordaje (${codigo})`);
  ok((await texto(pp, '.a-tarjeta-conductor')).includes('Luis Alberto Rodríguez'), 'pasajero: ve a su conductor');
  await foto(pp, 'p02-llego-desde-aviso');
  await visibilidad(pp, true);
  await pp.waitForTimeout(800);
  await pp.close(); // se lo dice al conductor y vuelve a cerrar la app

  await escribirCodigo(pa, '.a-codigo-c .a-casillas', codigo);
  await debe(vista(pa, 'en_viaje', 10000), 'conductor 1.2: con el código arranca el viaje');
  await espera(1500);
  ok(!nuevos().some((l) => l.app === 'pasajero' && l.datos?.fase === 'en_viaje'), 'en viaje: sin push (no hace falta)');

  // Llega al destino y termina → push con el total.
  const destino = await pa.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje?.destino || null);
  await A.setGeolocation({ latitude: destino?.lat ?? DESTINO.lat, longitude: destino?.lng ?? DESTINO.lng, accuracy: 8 });
  await debe(pa.waitForSelector('[data-terminar].a-resaltar', { timeout: 20000 }), 'conductor 1.2: en el destino se resalta «Terminar viaje»');
  await pa.click('[data-terminar]');
  await debe(pa.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 }), 'conductor 1.2: confirma el valor');
  const valor = Number((await pa.inputValue('.a-modal input[name=valor]')).replace(/\D/g, ''));
  await tocarModal(pa, 'Terminar y cobrar');
  await debe(vista(pa, 'cobrando', 10000), `conductor 1.2: termina (${pesos(valor)}) → cobro`);
  const fin = await hasta(() => nuevos().find((l) => l.app === 'pasajero' && l.datos?.tipo === 'estado' && l.datos?.fase === 'finalizado'), 8000);
  await debe(fin, `central → pasajero (app cerrada): final${fin ? ` (${resumen(fin)})` : ''}`);
  ok(fin.cuerpo === `Llegaste: total ${pesos(valor)}`, `push final: «Llegaste: total ${pesos(valor)}» = «${fin.cuerpo}»`);
  ok(fin.datos.viajeId === viajeId && !fin.apns.cuerpo.aps['interruption-level'], 'push final: viajeId, sin time-sensitive');

  // El pasajero abre desde el final: paga en efectivo y califica.
  pp = await abrirApp(P, 'pasajero', 'taxicun/', notificacionIos(fin));
  await debe(vista(pp, 'pagar', 30000), 'pasajero: abierta desde «Llegaste: total…» → pagar');
  ok((await texto(pp, '[data-total-pagar]')).replace(/\D/g, '') === String(valor), `pasajero: el total es el del conductor (${await texto(pp, '[data-total-pagar]')})`);
  await foto(pp, 'p03-pagar-desde-aviso');
  await pp.click('[data-efectivo]');
  await tocarModal(pp, 'Sí, ya pagué');
  await debe(vista(pp, 'calificar', 10000), 'pasajero: pagó en efectivo → calificar');
  await debe(pa.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 10000 }), 'conductor 1.2: «El pasajero dice que ya te pagó»');
  await pa.click('[data-efectivo]');
  await tocarModal(pa, 'Sí, recibí el pago');
  await debe(vista(pa, 'calificar', 10000), 'conductor 1.2: «Recibí efectivo» → calificar');
  await pp.click('.a-estrellas [data-n="5"]');
  await pp.click('[data-enviar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: califica y vuelve al inicio');
  await pa.click('.a-estrellas [data-n="5"]');
  await pa.click('[data-enviar]');
  await debe(vista(pa, 'libre', 10000), 'conductor 1.2: califica y vuelve al inicio');
  ok(await hasta(() => sql(`select estado || '|' || coalesce(valor_final, 0) from viajes where id = ${cita(viajeId)}`) === `finalizado|${valor}`, 5000), `central: viaje finalizado con ${pesos(valor)}`);
  await foto(pa, 'c02-fin');

  // Un aviso por cosa, nada repetido ni de más.
  await espera(1500);
  const delViaje = nuevos().filter((l) => l.datos?.viajeId === viajeId);
  const clave = (l) => `${l.app}:${l.datos?.tipo}${l.datos?.fase ? `:${l.datos.fase}` : ''}`;
  const claves = delViaje.map(clave).sort();
  ok(JSON.stringify(claves) === JSON.stringify(['conductor:solicitud', 'pasajero:aceptacion', 'pasajero:estado:finalizado', 'pasajero:estado:llego']),
    `avisos del viaje: solicitud, aceptación, llegó y final, uno de cada uno (${claves.join(', ')})`);
  ok(nuevos().length === delViaje.length, `ningún otro aviso en el archivo (${nuevos().length})`);
  return viajeId;
}

/* ------------------------------------------------------------------ */
/* 4b) Desconectado a propósito y conductor sin token con la app abierta */
/* ------------------------------------------------------------------ */
async function comoHoy() {
  // El conductor 1.2 termina su turno (presencia disponible: false) y cierra la app.
  await pa.waitForTimeout(800);
  if ((await pa.getAttribute('[data-conectar]', 'aria-checked')) === 'true') {
    await pa.click('[data-conectar]');
    await pa.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 });
  }
  await pa.waitForTimeout(800);
  await pa.close();
  await espera(2500);
  ok(!dormido(CA.correo), 'conductor 1.2: se desconectó a propósito y cerró la app → NO queda dormido');
  ok(dispositivosDe(CA.correo) === `conductor|ios|production|${tA}`, 'conductor 1.2: (su teléfono sigue registrado: no cerró sesión)');

  // El conductor 1.0 vuelve a abrir la app: sigue con su sesión y se pone en turno.
  marca = leerAvisos().length;
  pb = await abrirApp(B, 'conductor 1.0', 'taxicun/conductor/');
  await debe(pb.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 }), 'conductor 1.0: abre con su sesión');
  await pb.waitForTimeout(1500);
  ok((await pb.getAttribute('[data-conectar]', 'aria-checked')) !== 'true', 'conductor 1.0: al abrir no está en turno solo (como hoy)');
  await pb.click('[data-conectar]');
  await debe(pb.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'conductor 1.0: en turno');

  // El pasajero pide otro taxi: al conductor 1.0 le llega por el tiempo real; push, ninguno.
  await debe(pedirTaxi(pp, SEGUNDO), `pasajero: pide otro taxi (${SEGUNDO.nombre})`);
  await pp.waitForTimeout(1000);
  ok(!(await pp.$('.a-modal-nativa')), 'pasajero: la segunda vez no vuelve a preguntar por los avisos');
  await debe(pb.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'conductor 1.0: con la app abierta le llega la oferta por el tiempo real');
  ok((await texto(pb, '.a-solicitud')).includes('Ana'), 'conductor 1.0: es el servicio de Ana');
  await foto(pb, 'b02-oferta-por-el-bus');
  await espera(1500);
  ok(nuevos().length === 0, `sin push: nadie dormido y todos con la app abierta (${nuevos().map(resumen).join(' | ') || 'ninguno'})`);
  // Cierra la app con la oferta a la vista: tampoco queda dormido.
  await pb.close();
  await espera(2500);
  ok(!dormido(CB.correo), 'conductor 1.0: al cerrar la app NO queda dormido');
  // El pasajero cancela (la app abierta: por el tiempo real; el conductor 1.0 no tenía el servicio asignado).
  await pp.click('[data-cancelar]');
  await pp.waitForSelector('.a-opciones', { timeout: 5000 });
  await pp.click('.a-opcion >> nth=0');
  await pp.waitForTimeout(300);
  await pp.click('.a-modal .a-btn-peligro');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: cancela y vuelve al inicio');
  await espera(1500);
  ok(nuevos().length === 0, 'cancelar con la app abierta: ningún push');
  ok(!leerAvisos().slice(marcaInicio).some((l) => l.token !== tA && l.token !== tP), 'en toda la corrida solo aparecen los dos teléfonos 1.2');
}

/* ------------------------------------------------------------------ */
/* 3) Face ID: bloqueo, cerrar sesión, «Entrar con Face ID», al abrir    */
/* ------------------------------------------------------------------ */
async function faceId() {
  const cred = await llavero(pp);
  await abrirAjustes(pp);
  await debe(pp.waitForSelector('.a-panel.a-abierto [data-seguridad]:not([hidden])', { timeout: 5000 }), 'pasajero: Ajustes → Seguridad');
  ok((await pp.getAttribute('[aria-labelledby="a-aj-bio"]', 'aria-checked')) === 'true', 'pasajero: «Entrar con Face ID» activo');
  ok(/Activadas/.test(await texto(pp, '.a-panel.a-abierto [data-avisos-nativos]')), 'pasajero: Notificaciones «Activadas»');
  await pp.click('[aria-labelledby="a-aj-bloqueo"]');
  await debe(hasta(async () => (await ls(pp, 'taxicun.bloqueo')) === '1', 5000), 'pasajero: «Pedir Face ID al abrir la app» puesto');
  await foto(pp, 'p04-ajustes-seguridad');
  await pp.click('.a-panel.a-abierto [data-cerrar]');
  await pp.waitForTimeout(450);

  await menu(pp, 'Cerrar sesión');
  await tocarModal(pp, 'Cerrar sesión');
  await debe(pp.waitForSelector('.a-bienvenida [data-entrar-bio]', { timeout: 10000 }), 'pasajero: cierra sesión → el ingreso muestra «Entrar con Face ID»');
  ok(dispositivosDe(PAS.correo) === '', 'pasajero: cerrar sesión borra su teléfono en el servidor (DELETE con el token en mayúsculas)');
  ok(sql(`select revocada from llaves_dispositivo where id = ${cita(cred.username)}`) === 'f' && Boolean(await llavero(pp)), 'pasajero: la llave sigue vigente (servidor y llavero)');
  ok((await texto(pp, '.a-bio-cuenta')).includes(PAS.correo), 'pasajero: con el correo de la cuenta');
  await foto(pp, 'p05-ingreso-face-id');
  await pp.click('[data-entrar-bio]');
  await debe(pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 10000 }), 'pasajero: «Entrar con Face ID» → POST auth/llave → «¡Hola de nuevo!»');
  ok(sql(`select ultimo_uso is not null from llaves_dispositivo where id = ${cita(cred.username)}`) === 't', 'pasajero: la llave queda con su último uso');
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  ok(await hasta(() => dispositivosDe(PAS.correo) === `pasajero|ios|production|${tP}`, 8000), 'pasajero: con la sesión nueva el teléfono vuelve a quedar registrado');
  ok(!(await pp.$('.a-bloqueo')), 'pasajero: entrar con Face ID no muestra el bloqueo');
  ok((await ls(pp, 'taxicun.bloqueo')) === '1', 'pasajero: «Pedir Face ID al abrir la app» sigue puesto tras cerrar sesión');

  // Cierra la app y la vuelve a abrir: bloqueada hasta Face ID (al abrir lo pide solo; la primera vez se cancela).
  await pp.evaluate(() => localStorage.setItem('__bioFalla', '16'));
  await pp.close();
  pp = await abrirApp(P, 'pasajero', 'taxicun/');
  await debe(pp.waitForSelector('.a-bloqueo', { timeout: 20000 }), 'pasajero: al abrir la app, «TaxiCun está bloqueada»');
  await pp.waitForTimeout(1200);
  ok(Boolean(await pp.$('.a-bloqueo')) && (await pp.evaluate(() => (window.__llamadas || []).filter(([n]) => n === 'bio.verifyIdentity').length)) >= 1, 'pasajero: pide Face ID al abrir; cancelado, la capa sigue');
  await foto(pp, 'p06-bloqueo-al-abrir');
  await pp.evaluate(() => localStorage.removeItem('__bioFalla'));
  await pp.click('.a-bloqueo [data-desbloquear]');
  const quitada = await intento(pp.waitForSelector('.a-bloqueo', { state: 'detached', timeout: 6000 }));
  if (!quitada) {
    console.log('DIAG', JSON.stringify(await pp.evaluate(() => ({
      capas: document.querySelectorAll('.a-bloqueo').length,
      clases: [...document.querySelectorAll('.a-bloqueo')].map((c) => c.className),
      boton: document.querySelector('.a-bloqueo [data-desbloquear]')?.className,
      error: document.querySelector('.a-bloqueo-error')?.textContent,
      llamadas: (window.__llamadas || []).map(([n]) => n),
      falla: localStorage.getItem('__bioFalla'),
      oculta: document.hidden,
    }))));
    await foto(pp, 'p06b-bloqueo-sigue');
  }
  await debe(quitada, 'pasajero: Face ID quita la capa');
  await debe(vista(pp, 'inicio', 20000), 'pasajero: y sigue en su inicio con la sesión');
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 }).catch(() => {});
  ok(await intento(pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 1000 })), 'pasajero: en línea con la central');
}

/* ------------------------------------------------------------------ */
/* 6) A3 · Reglas del despacho: lo visto o rechazado no se repite por push */
/* ------------------------------------------------------------------ */
// Con la central de «Reglas del despacho» (la bienvenida trae reglas), la app 1.2 manda oferta_vista al mostrar la
// oferta y rechazo al rechazarla. Al minimizar después, la central no le repite por push lo que ya vio en pantalla
// (antes lo adivinaba con la siguiente presencia: si minimizaba enseguida, le llegaba un «Nuevo servicio» de lo que
// acababa de ver). Lo que le llega con la app ya minimizada, sí, por push. Con centrales anteriores se omite.
const solicitudesPush = (viajeId) => nuevos().filter((l) => l.app === 'conductor' && l.datos?.tipo === 'solicitud' && l.datos?.viajeId === viajeId);
const buscandoDe = (correo) => sql(`select id from viajes where pasajero_id = ${cita(idDe(correo))} and estado = 'buscando'`);
async function cancelarBusqueda(p) {
  await p.click('[data-cancelar]');
  await p.waitForSelector('.a-opciones', { timeout: 5000 });
  await p.click('.a-opcion >> nth=0');
  await p.waitForTimeout(300);
  await p.click('.a-modal .a-btn-peligro');
  return vista(p, 'inicio', 10000);
}
async function vistaNoSeRepite() {
  const enviados = []; // oferta_vista y rechazo que manda la app del conductor
  const llego = new Map(); // viajeId → cuándo le llegó la solicitud por el bus
  let conReglas = false;
  pa = await A.newPage();
  vigilar(pa, 'conductor 1.2');
  pa.on('websocket', (ws) => {
    ws.on('framesent', (f) => {
      try {
        const m = JSON.parse(typeof f.payload === 'string' ? f.payload : '');
        if (m.tipo === 'oferta_vista' || m.tipo === 'rechazo') enviados.push(m);
      } catch {
        /* no es JSON */
      }
    });
    ws.on('framereceived', (f) => {
      const s = typeof f.payload === 'string' ? f.payload : '';
      if (s.includes('"tipo":"bienvenida"') && s.includes('"reglas"')) conReglas = true;
      if (s.includes('"tipo":"solicitud"')) {
        try {
          const m = JSON.parse(s);
          if (!llego.has(m.datos?.viajeId)) llego.set(m.datos?.viajeId, Date.now());
        } catch {
          /* no es JSON */
        }
      }
    });
  });
  const mando = (tipo, viajeId) => enviados.filter((m) => m.tipo === tipo && m.datos?.viajeId === viajeId).length;
  // Segundos desde que le llegó la solicitud por el bus. La central de antes la daba por vista solo si el conductor
  // hablaba 2 s o más después: minimizar antes es justo el caso A3.
  const desdeQueLlego = (viajeId) => ((Date.now() - (llego.get(viajeId) ?? Date.now())) / 1000).toFixed(1);
  await pa.goto(`${BASE}taxicun/conductor/`);
  await debe(pa.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 }), 'A3 · conductor 1.2: abre la app con su sesión');
  if ((await pa.getAttribute('[data-conectar]', 'aria-checked')) !== 'true') {
    await pa.click('[data-conectar]');
    if (await intento(pa.waitForSelector('.a-modal-nativa .a-modal', { timeout: 2000 }))) await tocarModal(pa, 'Activar avisos');
  }
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'A3 · conductor 1.2: en turno con la app a la vista');
  await hasta(() => conReglas, 8000);
  if (!conReglas) {
    console.log('· A3: la central no trae «Reglas del despacho» (bienvenida sin reglas): se omite');
    await pa.close();
    return;
  }
  ok(dispositivosDe(CA.correo) === `conductor|ios|production|${tA}`, 'A3 · conductor 1.2: con su teléfono registrado (le pueden llegar push)');

  // a) La ve en pantalla, la rechaza y minimiza enseguida: no le llega por push.
  marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), `A3 · pasajero: pide un taxi a ${DESTINO.nombre}`);
  const v1 = await hasta(() => buscandoDe(PAS.correo), 8000);
  await debe(v1, `A3 · pasajero: viaje buscando (${v1})`);
  await debe(pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'A3 · conductor: con la app a la vista le llega la oferta por el tiempo real');
  await pa.click('.a-solicitud [data-rechazar]');
  await visibilidad(pa, true);
  const dtA = desdeQueLlego(v1);
  await debe(hasta(() => dormido(CA.correo), 6000, 100), `A3 · conductor: la rechaza y minimiza enseguida (${dtA} s después de que le llegó) → en turno en segundo plano`);
  ok(Number(dtA) < 2, `A3 · (minimizó antes de 2 s: con la central de antes le llegaba por push) (${dtA} s)`);
  ok(mando('oferta_vista', v1) === 1, 'A3 · conductor: la app mandó oferta_vista { viajeId } al mostrarla (una vez)');
  ok(mando('rechazo', v1) === 1, 'A3 · conductor: «Rechazar» mandó rechazo { viajeId }');
  await espera(4000);
  ok(solicitudesPush(v1).length === 0, `A3 · lo que rechazó en pantalla no le llega por push al minimizar (${nuevos().map(resumen).join(' | ') || 'ningún aviso'})`);
  ok(await intento(pp.waitForSelector('[data-sin-taxis]:not([hidden])', { timeout: 15000 })) && /Ningún taxi tomó tu solicitud/.test(await texto(pp, '[data-sin-taxis]')),
    'A3 · pasajero: era el único → «Ningún taxi tomó tu solicitud» (sigue buscando)');
  ok(/Llamar a la central/.test(await texto(pp, '[data-sin-taxis]')), 'A3 · pasajero: con «Llamar a la central»');
  await foto(pp, 'a3-01-pasajero-sin-conductores');
  await debe(cancelarBusqueda(pp), 'A3 · pasajero: cancela');

  // b) Vuelve, la ve en pantalla y minimiza sin responder (antes de hablar otra vez): tampoco le llega por push.
  //    Al vencerse en su pantalla (segundosOferta + 5 s) ya no cuenta como alguien que la puede tomar.
  await visibilidad(pa, false);
  await debe(hasta(() => !dormido(CA.correo), 10000, 150), 'A3 · conductor: vuelve a la app (sale de en turno en segundo plano)');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'A3 · conductor: sigue en turno');
  await pa.waitForTimeout(1200);
  marca = leerAvisos().length;
  await debe(pedirTaxi(pp, SEGUNDO), `A3 · pasajero: pide otra vez (${SEGUNDO.nombre})`);
  const v2 = await hasta(() => buscandoDe(PAS.correo), 8000);
  await debe(v2 && v2 !== v1, `A3 · pasajero: otro viaje buscando (${v2})`);
  await debe(pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'A3 · conductor: le llega la nueva oferta por el tiempo real');
  await visibilidad(pa, true);
  const dtB = desdeQueLlego(v2);
  await debe(hasta(() => dormido(CA.correo), 6000, 100), `A3 · conductor: minimiza con la oferta en pantalla y sin responder (${dtB} s después de que le llegó)`);
  ok(Number(dtB) < 2, `A3 · (minimizó antes de 2 s) (${dtB} s)`);
  ok(mando('oferta_vista', v2) === 1, 'A3 · conductor: la app mandó oferta_vista de la nueva antes de minimizar');
  ok(mando('rechazo', v2) === 0, 'A3 · conductor: sin responder no manda rechazo');
  await espera(4000);
  ok(solicitudesPush(v2).length === 0, `A3 · lo que vio en pantalla no le llega por push al minimizar (${nuevos().map(resumen).join(' | ') || 'ningún aviso'})`);
  const vencida = await intento(pp.waitForSelector('[data-sin-taxis]:not([hidden])', { timeout: 45000 }));
  ok(vencida && /Ningún taxi tomó tu solicitud/.test(await texto(pp, '[data-sin-taxis]')), 'A3 · pasajero: se le venció en la pantalla (25 s + 5) → «Ningún taxi tomó tu solicitud»');
  ok(solicitudesPush(v2).length === 0, 'A3 · (y tampoco le llegó por push después)');
  await debe(cancelarBusqueda(pp), 'A3 · pasajero: cancela');

  // c) Control: lo que llega con la app ya minimizada sí le llega por push (una vez).
  await espera(1000);
  marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), 'A3 · pasajero: pide con el conductor minimizado');
  const v3 = await hasta(() => buscandoDe(PAS.correo), 8000);
  await debe(v3 && v3 !== v2, `A3 · pasajero: viaje buscando (${v3})`);
  ok(await hasta(() => solicitudesPush(v3).length === 1, 10000), `A3 · control: con la app minimizada, «Nuevo servicio» por push (${nuevos().map(resumen).join(' | ') || 'ningún aviso'})`);
  ok(!(await pp.$('[data-sin-taxis]:not([hidden])')), 'A3 · pasajero: le llegó a alguien (sin el aviso)');
  await debe(cancelarBusqueda(pp), 'A3 · pasajero: cancela');
  await pa.close();
}

/* ------------------------------------------------------------------ */
/* 5) --pausa: «Tu turno quedó en pausa» (TURNO_DORMIDO_MIN corto)       */
/* ------------------------------------------------------------------ */
const pausasNuevas = () => nuevos().filter((l) => l.app === 'conductor' && l.datos?.tipo === 'turno_pausa');
// Minimiza la app del conductor en turno y espera a que la central lo deje dormido.
async function minimizarEnTurno(p, m) {
  await p.waitForTimeout(800);
  await visibilidad(p, true);
  await debe(hasta(() => dormido(CA.correo), 6000, 100), m);
}
async function turnoEnPausa() {
  marca = leerAvisos().length;
  A = await contexto({ push: true, bio: true, plataforma: 'ios', tokenPush: TOKEN_A, tipoBio: 2 }, GPS_A);
  pa = await abrirApp(A, 'conductor 1.2', 'taxicun/conductor/');
  await debe(entrarConductor(pa, CA, 'Ahora no'), 'pausa · conductor 1.2: entra con el código');
  await pa.click('[data-conectar]');
  await debe(pa.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Que no se te pase ningún servicio")', { timeout: 8000 }), 'pausa · conductor 1.2: al ponerse en turno, el modal de los avisos');
  ok(/Si pasa un rato sin que abras la app, te avisamos que tu turno quedó en pausa/.test(await texto(pa, '.a-modal-nativa')), 'pausa · el modal avisa que el turno queda en pausa si pasa un rato sin abrir la app');
  await tocarModal(pa, 'Activar avisos');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'pausa · conductor 1.2: en turno');
  await debe(hasta(() => dispositivosDe(CA.correo) === `conductor|ios|production|${tA}`, 8000), 'pausa · conductor 1.2: teléfono registrado');

  // Minimiza y vuelve antes del plazo: sale de dormidos sin aviso (y con la app abierta, nada).
  await minimizarEnTurno(pa, 'pausa · al minimizar queda dormido');
  const plazo = plazoDormido(CA.correo);
  await debe(plazo > 0 && plazo <= 60, `pausa · el servidor tiene un plazo corto (${plazo.toFixed(1)} s; arráncalo con TURNO_DORMIDO_MIN=0.1)`);
  await visibilidad(pa, false);
  await debe(hasta(() => !dormido(CA.correo), 6000, 100), 'pausa · vuelve antes del plazo: sale de dormidos');
  await espera(plazo * 1000 + 7000);
  ok(pausasNuevas().length === 0, 'pausa · volver a la app antes del plazo: sin aviso de la pausa');
  ok((await pa.getAttribute('[data-conectar]', 'aria-checked')) === 'true', 'pausa · y sigue en turno con la app abierta');

  // Minimiza otra vez y el sistema mata la app: al vencerse, UN aviso.
  await minimizarEnTurno(pa, 'pausa · minimiza otra vez: dormido');
  await pa.close();
  const t0 = Date.now();
  const aviso = await hasta(() => pausasNuevas()[0], (plazo + 30) * 1000, 300);
  await debe(aviso, `central → conductor: «Tu turno quedó en pausa» al vencerse (${((Date.now() - t0) / 1000).toFixed(1)} s después de cerrar; ${aviso ? resumen(aviso) : 'nada'})`);
  ok(!dormido(CA.correo), 'pausa · ya no está dormido');
  ok(aviso.plataforma === 'ios' && aviso.token === tA && aviso.entorno === 'production', 'pausa · al iPhone del conductor');
  ok(aviso.titulo === 'Tu turno quedó en pausa' && aviso.cuerpo === 'Toca aquí para seguir recibiendo servicios.', `pausa · «Tu turno quedó en pausa» / «${aviso.cuerpo}»`);
  ok(aviso.apns.tema === 'com.taxicun.conductor' && aviso.apns.cuerpo.aps.alert.title === 'Tu turno quedó en pausa', 'pausa · tema com.taxicun.conductor y título en aps');
  ok(!aviso.urgente && !aviso.apns.cuerpo.aps['interruption-level'] && aviso.apns.cuerpo.aps.sound === 'default', 'pausa · con sonido y sin time-sensitive');
  ok(aviso.apns.cabeceras['apns-collapse-id'] === 'turno', `pausa · collapse-id fijo «turno» (${aviso.apns.cabeceras['apns-collapse-id']})`);
  const vale = Number(aviso.datos.hasta) / 1000 - Date.parse(aviso.fecha) / 1000;
  const vence = Number(aviso.apns.cabeceras['apns-expiration']) - Date.parse(aviso.fecha) / 1000;
  ok(vale > 7190 && vale <= 7201 && vence > 7190 && vence <= 7201, `pausa · datos.hasta y vencimiento a las 2 h (${Math.round(vale)} s, ${Math.round(vence)} s)`);
  ok(aviso.datos.tipo === 'turno_pausa' && aviso.apns.cuerpo.tipo === 'turno_pausa' && aviso.apns.cuerpo.hasta === aviso.datos.hasta && !aviso.datos.viajeId, 'pausa · datos { tipo: turno_pausa, hasta } junto a «aps», sin viajeId');
  await espera(7000);
  ok(pausasNuevas().length === 1, `pausa · uno solo por vencimiento (${pausasNuevas().length})`);

  // Lo toca: la app abre y vuelve a quedar en turno.
  pa = await abrirApp(A, 'conductor 1.2', 'taxicun/conductor/', notificacionIos(aviso));
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 30000 }), 'pausa · abierta desde «Tu turno quedó en pausa», vuelve a quedar en turno');
  ok(await hasta(async () => (await avisosVistos(pa)).some((a) => /Volviste a estar en turno\./.test(a)), 8000), 'pausa · «Volviste a estar en turno.»');
  await pa.waitForTimeout(1200);
  await foto(pa, 'k01-pausa-vuelve-al-turno');
  // La central lo tiene en turno y libre: al minimizar vuelve a quedar dormido (solo pasa si estaba disponible).
  await minimizarEnTurno(pa, 'pausa · la central lo tiene en turno (al minimizar vuelve a quedar dormido)');
  await pa.close();
  const segundo = await hasta(() => pausasNuevas()[1], (plazo + 30) * 1000, 300);
  await debe(segundo, 'pausa · se vuelve a vencer: otro aviso');

  // Lo toca cuando ya pasó datos.hasta (se quedó en el centro de notificaciones): no lo pone en turno.
  const viejo = notificacionIos(segundo);
  viejo.data = { ...viejo.data, hasta: Date.now() - 60 * 1000 };
  pa = await abrirApp(A, 'conductor 1.2', 'taxicun/conductor/', viejo);
  ok(await hasta(async () => (await avisosVistos(pa)).some((a) => /Ponte en turno para recibir servicios\./.test(a)), 30000), 'pausa · aviso vencido → «Ponte en turno para recibir servicios.»');
  await pa.waitForTimeout(1500);
  await foto(pa, 'k02-pausa-vencida');
  ok((await pa.getAttribute('[data-conectar]', 'aria-checked')) === 'false', 'pausa · y no queda en turno');
  ok(!(await avisosVistos(pa)).some((a) => /Volviste a estar en turno/.test(a)), 'pausa · sin «Volviste a estar en turno.»');

  // Se pone en turno, termina el turno a propósito y cierra: ni dormido ni aviso.
  await pa.click('[data-conectar]');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'pausa · se pone en turno con la píldora');
  await pa.waitForTimeout(800);
  await pa.click('[data-conectar]');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="false"]', { timeout: 8000 }), 'pausa · termina el turno a propósito');
  await pa.waitForTimeout(800);
  await pa.close();
  await espera(plazo * 1000 + 7000);
  ok(!dormido(CA.correo), 'pausa · terminó el turno y cerró: no queda dormido');
  ok(pausasNuevas().length === 2, `pausa · terminar el turno a propósito no manda el aviso (${pausasNuevas().length} en total)`);
  ok(nuevos().every((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'turno_pausa'), `pausa · en el archivo solo los dos avisos de la pausa (${nuevos().map(resumen).join(' | ')})`);
}

const inicio = Date.now();
let viajeId = null;
try {
  await preparar();
  if (SOLO_PAUSA) {
    await turnoEnPausa();
  } else {
    await conductorSinToken();
    await conductorDuerme();
    viajeId = await viaje();
    await comoHoy();
    await faceId();
    await vistaNoSeRepite();
  }
} catch (e) {
  if (!(e instanceof Detener)) {
    console.error(e);
    ok(false, `la prueba se cortó: ${e.message.split('\n')[0]}`);
  }
}
ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 6).join(' | ')}` : ''}`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · push e2e 1.2${SOLO_PAUSA ? ' · turno en pausa' : ''} (servidor ${BASE}, avisos en ${AVISOS}) · viaje ${viajeId || '—'} · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - inicio) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
