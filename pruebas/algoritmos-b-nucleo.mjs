// Ronda B de «algoritmos» (servidor 0.15.0) en el núcleo, sin navegador (DISENO-RONDA-B.md §7 y §11): lo que la app lee
// de la central para «¿Todo bien en tu viaje?» (nucleo/seguridad.js: la pregunta y el cierre validados, la bandera de la
// bienvenida y los textos), la respuesta por REST con sus reintentos (POST /api/viajes/seguridad con un fetch falso:
// forma del cuerpo, sesión, espera de 8 s, reintentos a los 3/5/10/15 s hasta 2 min, «vista» con un solo reintento,
// 404/400 sin insistir), el hola del pasajero con capacidades (y el del conductor sin ellas) y lo crudo de la lectura
// del GPS del conductor. Lo que hacen los controladores y la tarjeta lo prueba pruebas/algoritmos-b-app.mjs.
// Uso: node pruebas/algoritmos-b-nucleo.mjs   (sale con 1 si algo falla; unos 15 s)
globalThis.location = { origin: 'http://prueba.local', search: '?real=1', pathname: '/taxicun/', protocol: 'http:', host: 'prueba.local' };
globalThis.CT_TAXICUN = true;
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: null };
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
const almacen = new Map();
const almacenSesion = new Map();
const guardar = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
globalThis.localStorage = guardar(almacen);
globalThis.sessionStorage = guardar(almacenSesion);
// WebSocket falso: guarda lo que manda la app.
const enviados = [];
globalThis.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 5);
  }
  send(t) {
    enviados.push(JSON.parse(t));
  }
  close() {
    this.readyState = 3;
  }
};
localStorage.setItem('taxicun.token', 'tok-1');
// nucleo/config.js (que importa el bus) carga la ficha de la cooperativa al importarse.
const { readFileSync } = await import('node:fs');
const FICHA = readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8');
globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(FICHA) });
const G = await import('../nucleo/seguridad.js');
const S = await import('../nucleo/servidor.js');
const B = await import('../nucleo/bus.js');

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- la pregunta ---------------- */
const P0 = { viajeId: 'v_abc123', preguntaId: 'sg_ABCDEFGHijkl1234', motivo: 'parada', subtipo: null, plazoS: 120, estado: 'abierta', despues: false };
const q = G.limpiarPregunta(P0);
ok(q && JSON.stringify(q) === JSON.stringify(P0), 'pregunta: la de siempre pasa tal cual');
ok(G.limpiarPregunta({ ...P0, extra: '<b>x</b>', texto: 'hola' }) && !('texto' in G.limpiarPregunta({ ...P0, texto: 'hola' })), 'pregunta: los campos de más se descartan (nunca un texto libre)');
for (const m of G.MOTIVOS) ok(G.limpiarPregunta({ ...P0, motivo: m }) !== null, `pregunta: motivo «${m}»`);
for (const st of G.SUBTIPOS) ok(G.limpiarPregunta({ ...P0, motivo: 'desvio', subtipo: st }) !== null, `pregunta: subtipo «${st}»`);
const malas = [
  ['sin datos', null], ['un texto', 'sg_x'], ['un arreglo', [P0]],
  ['viajeId corto', { ...P0, viajeId: 'v1' }], ['viajeId con <', { ...P0, viajeId: 'v_<img>1' }], ['viajeId número', { ...P0, viajeId: 123456 }],
  ['preguntaId sin sg_', { ...P0, preguntaId: 'xx_ABCDEFGHijkl1234' }], ['preguntaId corto', { ...P0, preguntaId: 'sg_abc' }], ['preguntaId largo', { ...P0, preguntaId: `sg_${'a'.repeat(33)}` }],
  ['motivo desconocido', { ...P0, motivo: 'robo' }], ['motivo con HTML', { ...P0, motivo: '<img src=x onerror=alert(1)>' }], ['motivo en mayúsculas', { ...P0, motivo: 'PARADA' }],
  ['subtipo desconocido', { ...P0, subtipo: 'otro' }], ['subtipo número', { ...P0, subtipo: 3 }],
  ['plazo negativo', { ...P0, plazoS: -1 }], ['plazo > 1800', { ...P0, plazoS: 1801 }], ['plazo decimal', { ...P0, plazoS: 12.5 }], ['plazo texto', { ...P0, plazoS: '120' }], ['plazo NaN', { ...P0, plazoS: NaN }],
  ['estado desconocido', { ...P0, estado: 'bien' }], ['sin estado', { ...P0, estado: undefined }],
  ['despues texto', { ...P0, despues: 'true' }], ['sin despues', { ...P0, despues: undefined }],
];
for (const [n, d] of malas) ok(G.limpiarPregunta(d) === null, `pregunta: ${n} → null (no se muestra)`);
ok(G.limpiarPregunta({ ...P0, plazoS: 0 }) && G.limpiarPregunta({ ...P0, plazoS: 1800 }) && G.limpiarPregunta({ ...P0, estado: 'avisada', despues: true }), 'pregunta: bordes 0 y 1800 s, «avisada» y «después» valen');
ok(G.limpiarPregunta({ ...P0, subtipo: undefined })?.subtipo === null, 'pregunta: sin subtipo → null');

/* ---------------- el cierre ---------------- */
for (const e of ['bien', 'ayuda', 'avisada', 'retirada']) ok(G.limpiarCierre({ viajeId: P0.viajeId, preguntaId: P0.preguntaId, estado: e })?.estado === e, `cierre: «${e}»`);
ok(G.limpiarCierre({ viajeId: P0.viajeId, preguntaId: P0.preguntaId, estado: 'abierta' }) === null && G.limpiarCierre({ viajeId: P0.viajeId, preguntaId: 'sg_1', estado: 'bien' }) === null && G.limpiarCierre(null) === null && G.limpiarCierre({ preguntaId: P0.preguntaId, estado: 'bien' }) === null, 'cierre: estado, ids o forma raros → null');

/* ---------------- bienvenida ---------------- */
ok(G.seguridadDeBienvenida({ seguridadViaje: true }) === true, 'bienvenida: seguridadViaje: true');
ok([{}, null, { seguridadViaje: 'true' }, { seguridadViaje: 1 }, { seguridadViaje: false }].every((d) => G.seguridadDeBienvenida(d) === false), 'bienvenida: sin el campo (servidor 0.14.0) o raro → false (como hoy)');
ok(G.seguridadDeBienvenida({ seguridadViaje: true, revision: true }) === false, 'bienvenida: el modo revisor nunca');

/* ---------------- textos ---------------- */
const T = G.textosSeguridad({ empresa: 'Cootransrural' });
ok(T.titulo === '¿Todo bien en tu viaje?' && T.tituloDespues === '¿Llegaste bien?', 'textos: títulos');
const motivos = {
  'parada/': 'El taxi lleva un rato detenido.',
  'desvio/alejamiento': 'El taxi se está alejando de tu destino.',
  'desvio/sin_avance': 'Tu viaje está tardando más de lo normal.',
  'desvio/muy_largo': 'Tu viaje está tardando más de lo normal.',
  'velocidad/': 'El taxi va muy rápido.',
  'sin_senal/sin_ubicacion': 'Perdimos la ubicación del taxi.',
  'sin_senal/ubicacion_dudosa': 'No podemos ver bien la ubicación del taxi.',
};
for (const [k, v] of Object.entries(motivos)) {
  const [m, st] = k.split('/');
  ok(T.motivo(m, st || null) === v, `textos: motivo ${k} → «${v}»`);
}
ok(T.cuenta('1:45') === 'Si no respondes, en 1:45 le avisamos a la central de Cootransrural.', 'textos: la cuenta regresiva');
ok(T.bien === 'Sí, todo bien' && T.ayuda === 'Necesito ayuda' && T.gracias.titulo === 'Gracias' && T.gracias.cuerpo === 'Seguimos pendientes de tu viaje.', 'textos: botones y «Gracias»');
ok(T.avisadaTitulo === 'Le avisamos a la central de Cootransrural' && T.avisadaTexto === 'No alcanzaste a responder. Si todo está bien, dilo aquí.', 'textos: «avisada»');
ok(T.error === 'No pudimos enviar tu respuesta. Revisa tu conexión.' && T.reintentar === 'Intentar de nuevo', 'textos: error y «Intentar de nuevo»');
ok(T.sosTexto === 'Ya le avisamos a la central de Cootransrural. Si estás en peligro, llama a la Línea 123 de la Policía.' && T.sosBoton === 'Mandar mi ubicación a la central', 'textos: el SOS desde «Necesito ayuda»');
ok(T.lineaViaje === 'Cuidamos tu viaje: si notamos algo raro, te preguntamos si todo está bien. Compártelo con alguien de confianza.' && T.lineaHoy === 'Tu viaje queda registrado. Compártelo con alguien de confianza.', 'textos: la línea del viaje en curso (con y sin la revisión)');
ok(G.textosSeguridad({}).cuenta('0:10').endsWith('central de tu cooperativa.'), 'textos: sin nombre de cooperativa → «tu cooperativa»');
ok(G.cuentaRegresiva(120000) === '2:00' && G.cuentaRegresiva(61001) === '1:02' && G.cuentaRegresiva(9000) === '0:09' && G.cuentaRegresiva(-5) === '0:00', 'cuenta regresiva m:ss');

/* ---------------- lo crudo del GPS del conductor ---------------- */
const ahora = Date.now();
const cr = G.crudoLectura({ precision: 12.4, ts: ahora - 800, velocidad: 11.234, rumbo: 271.6, altitud: 2563.7 });
ok(JSON.stringify(cr) === JSON.stringify({ precision: 12, ts: ahora - 800, velocidad: 11.2, rumbo: 272, altitud: 2564 }), `crudo: precisión, hora, velocidad, rumbo y altitud (${JSON.stringify(cr)})`);
ok(JSON.stringify(G.crudoLectura({ precision: null, ts: null, velocidad: null, rumbo: null, altitud: null })) === '{}', 'crudo: lo que no viene no se manda');
ok(JSON.stringify(G.crudoLectura({ precision: -1, ts: 12, velocidad: 140, rumbo: 400, altitud: 1e6 })) === '{}' && JSON.stringify(G.crudoLectura({ precision: '12', ts: '1', velocidad: NaN, rumbo: Infinity })) === '{}', 'crudo: fuera de rango o no numérico → se descarta');
ok(G.crudoLectura({ ts: ahora + 3 * 86400000 }).ts === undefined, 'crudo: una hora de lectura muy adelantada se descarta');
ok(JSON.stringify(G.crudoLectura(null)) === '{}', 'crudo: sin lectura → nada');

/* ---------------- el hola ---------------- */
const busP = new B.BusServidor({ rol: 'pasajero', empresa: 'cootransrural' });
busP.conectar();
await espera(60);
const holaP = enviados.find((m) => m.tipo === 'hola' && m.datos?.rol === 'pasajero');
ok(holaP && JSON.stringify(holaP.datos.capacidades) === '["seguridad"]' && holaP.datos.empresa === 'cootransrural' && holaP.datos.token === 'tok-1', `hola del pasajero: capacidades: ['seguridad'] (${JSON.stringify(holaP?.datos)})`);
busP.cerrar();
const busC = new B.BusServidor({ rol: 'conductor' });
busC.conectar();
await espera(60);
const holaC = enviados.find((m) => m.tipo === 'hola' && m.datos?.rol === 'conductor');
ok(holaC && !('capacidades' in holaC.datos), 'hola del conductor: sin capacidades (al conductor nunca se le pregunta nada)');
busC.cerrar();

/* ---------------- la respuesta (REST) ---------------- */
const pedidas = [];
let respuesta = () => ({ status: 200, body: { ok: true, estado: 'bien' } });
globalThis.fetch = (url, op) => {
  pedidas.push({ url: String(url), op, cuerpo: op.body ? JSON.parse(op.body) : null, t: Date.now() });
  const r = respuesta(url, op);
  if (r === 'colgar') return new Promise((_, no) => op.signal.addEventListener('abort', () => no(new DOMException('abortado', 'AbortError'))));
  if (r === 'sin_red') return Promise.reject(new TypeError('Failed to fetch'));
  return Promise.resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body });
};
const R0 = { viajeId: P0.viajeId, preguntaId: P0.preguntaId };
let e = G.enviarRespuesta({ ...R0, respuesta: 'bien' });
let r = await e.listo;
const p0 = pedidas.at(-1);
ok(p0.url === 'http://prueba.local/api/viajes/seguridad' && p0.op.method === 'POST' && p0.op.headers.Authorization === 'Bearer tok-1', 'respuesta: POST /api/viajes/seguridad con la sesión');
ok(JSON.stringify(p0.cuerpo) === JSON.stringify({ viajeId: P0.viajeId, preguntaId: P0.preguntaId, respuesta: 'bien' }), `respuesta: solo viajeId, preguntaId y respuesta (${JSON.stringify(p0.cuerpo)})`);
ok(r.estado === 'enviado' && r.estadoCentral === 'bien' && r.intentos === 1, 'respuesta: enviada al primer intento con el estado de la central');
respuesta = () => ({ status: 200, body: { ok: true, estado: '<b>raro</b>' } });
r = await G.enviarRespuesta({ ...R0, respuesta: 'ayuda' }).listo;
ok(r.estado === 'enviado' && r.estadoCentral === null, 'respuesta: un estado de la central desconocido no se usa');
ok(G.enviarRespuesta({ ...R0, respuesta: 'cualquiera' }) && pedidas.at(-1).cuerpo.respuesta === 'vista', 'respuesta: una respuesta desconocida no sale como «bien» ni «ayuda»');
await espera(50);

// Sin red: reintentos a los 3, 5, ... con el mismo cuerpo (idempotente).
let n = 0;
respuesta = () => (++n <= 2 ? 'sin_red' : { status: 200, body: { ok: true, estado: 'ayuda' } });
let t0 = Date.now();
e = G.enviarRespuesta({ ...R0, respuesta: 'ayuda' });
const estados = [];
e.on('estado', (x) => estados.push(x.estado));
r = await e.listo;
let dt = Date.now() - t0;
const tres = pedidas.filter((x) => x.t >= t0);
ok(r.estado === 'enviado' && r.intentos === 3 && tres.length === 3 && new Set(tres.map((x) => x.op.body)).size === 1, `sin red: 3 intentos con el mismo cuerpo (${tres.length})`);
ok(dt >= 7800 && dt < 9500 && estados.join(',') === 'reintentando,reintentando,enviado', `sin red: a los 3 s y a los 5 s más (${dt} ms; ${estados.join(',')})`);

// 5xx se reintenta; 404 y 400 no insisten; 401 cierra.
n = 0;
respuesta = () => (++n === 1 ? { status: 503, body: { error: 'error_interno' } } : { status: 200, body: { ok: true, estado: 'bien' } });
r = await G.enviarRespuesta({ ...R0, respuesta: 'bien', esperas: [100] }).listo;
ok(r.estado === 'enviado' && r.intentos === 2, '503: se reintenta');
for (const [st, cuerpo, nombre] of [[404, { error: 'no_existe' }, '404 no_existe'], [404, { message: 'Route POST:/api/viajes/seguridad not found', error: 'Not Found', statusCode: 404 }, '404 de Fastify (servidor anterior)'], [400, { error: 'datos_invalidos' }, '400 datos_invalidos']]) {
  const antes = pedidas.length;
  respuesta = () => ({ status: st, body: cuerpo });
  r = await G.enviarRespuesta({ ...R0, respuesta: 'bien', esperas: [50] }).listo;
  await espera(150);
  ok(r.estado === 'no_existe' && pedidas.length - antes === 1, `${nombre}: se cierra sin insistir (${pedidas.length - antes} intento)`);
}
respuesta = () => ({ status: 429, body: { error: 'demasiados_intentos', retryS: 0 } });
n = 0;
respuesta = () => (++n === 1 ? { status: 429, body: { error: 'demasiados_intentos', retryS: 0 } } : { status: 200, body: { ok: true, estado: 'bien' } });
r = await G.enviarRespuesta({ ...R0, respuesta: 'bien', esperas: [100] }).listo;
ok(r.estado === 'enviado' && r.intentos === 2, '429: espera y reintenta');
respuesta = () => ({ status: 401, body: { error: 'sin_sesion' } });
r = await G.enviarRespuesta({ ...R0, respuesta: 'bien' }).listo;
ok(r.estado === 'sin_sesion', '401: sin sesión (no se insiste)');
localStorage.setItem('taxicun.token', 'tok-1');

// Plazo: sin red todo el tiempo → «fallo» al pasar el plazo (aquí corto).
respuesta = () => 'sin_red';
t0 = Date.now();
r = await G.enviarRespuesta({ ...R0, respuesta: 'bien', esperas: [100, 200], plazoMs: 900 }).listo;
dt = Date.now() - t0;
ok(r.estado === 'fallo' && dt < 1200 && r.intentos >= 4, `sin red hasta el plazo → «fallo» (${r.intentos} intentos, ${dt} ms)`);

// «vista»: un intento y un reintento, nada más.
let antes = pedidas.length;
r = await G.enviarRespuesta({ ...R0, respuesta: 'vista' }).listo;
ok(r.estado === 'fallo' && pedidas.length - antes === 2, `vista: un intento y un reintento (${pedidas.length - antes})`);

// Espera máxima de 8 s.
respuesta = () => 'colgar';
t0 = Date.now();
let err = null;
try {
  await S.seguridad({ ...R0, respuesta: 'bien' });
} catch (x) {
  err = x;
}
dt = Date.now() - t0;
ok(err?.codigo === 'sin_red' && dt >= 7900 && dt < 9500, `la petición espera 8 s como mucho (${dt} ms)`);

// cancelar
respuesta = () => 'sin_red';
e = G.enviarRespuesta({ ...R0, respuesta: 'bien' });
await espera(50);
e.cancelar();
r = await e.listo;
antes = pedidas.length;
await espera(3500);
ok(r.estado === 'cancelado' && pedidas.length === antes, 'cancelar: ya no reintenta');

console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
