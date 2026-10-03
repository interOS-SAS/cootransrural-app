// Casos límite del turno con la app minimizada (entrega 2 de la 1.2), de la revisión de lógica del
// 3-oct-2026 (arnés de /tmp/cootrans/sp/rev-logica/rev-e2e.mjs, con las expectativas ya corregidas).
// Mismo montaje que pruebas/segundo-plano-e2e.mjs: el servidor 0.4.0 con PUSH_SIMULADO y tiempos
// acortados, la web por el proxy de mismo origen y el plugin «UbicacionTurno» simulado en Node como el
// nativo, con POST reales a /api/conductor/ubicacion.
//
// Comprueba:
//  E1) El WebView se recarga con la app oculta y el plugin vivo (iOS: se cayó su proceso): la web NO
//      abre el WebSocket hasta volver; la central lo sigue teniendo dormido con GPS, en el mapa y con
//      los servicios por push; al volver retoma el turno.
//  E2) Al volver (el GPS del JS tarda en leer), la presencia sale sin pos: el taxi no salta hacia atrás.
//  E4) Toca «Nuevo servicio» después de manejar minimizado ~12 km: ve la oferta enseguida, también si el
//      GPS del JS tarda 4 s; si acepta antes de esa lectura, al pasajero le llegan la posición del
//      plugin y el tiempo de llegada de la central (no la de donde minimizó).
//  E3) Minimiza con el plugin y no llega ningún POST: a los TURNO_GPS_MIN sale de turno con la pausa.
//  E5) Android en un servicio con la app minimizada: la notificación no trae «Salir de turno», el plugin
//      sigue y el pasajero sigue viendo el taxi; terminado el servicio, el botón vuelve.
//  E6) Con la app oculta vuelve la red («online») o se abre la app un instante: el bus no queda abierto;
//      la central lo sigue mostrando y le llegan los servicios por push.
//
// Servidor: /tmp/cootrans/sp/integracion/arrancar.sh corto (TURNO_GPS_MIN=0.6 TURNO_GPS_OCULTAR_S=15
// PRESENCIA_SEGUNDO_PLANO_S=3, PUSH_SIMULADO, CUENTAS_PRUEBA con conductor2).
// Prueba: AVISOS_PUSH=<avisos.jsonl> DATABASE_URL=… SERVIDOR_TAXICUN=<árbol del servidor> \
//         node pruebas/segundo-plano-casos-e2e.mjs http://localhost:8971/ [--solo --E1 --E4 …]
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8971/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/segundo-plano-casos-e2e').replace(/\/?$/, '/');
const AVISOS = process.env.AVISOS_PUSH || '/tmp/cootrans/sp/integracion/avisos.jsonl';
const BASE_DATOS = process.env.DATABASE_URL || 'postgres://taxicun_prueba:prueba@127.0.0.1:5432/taxicun_sp_e2e';
const SERVIDOR = process.env.SERVIDOR_TAXICUN || '/root/proyectos/taxicun-servidor';
// Los mismos tiempos con que se arrancó el servidor.
const GPS_MIN = Number(process.env.TURNO_GPS_MIN || 0.6);
const OCULTAR_S = Number(process.env.TURNO_GPS_OCULTAR_S || 15);
const PRESENCIA_S = Number(process.env.PRESENCIA_SEGUNDO_PLANO_S || 3);
const PLAZO_GPS_S = GPS_MIN * 60;
// El servidor revisa los plazos cada min(TURNO_DORMIDO_MIN, TURNO_GPS_MIN)/2 (como mucho cada minuto).
const REVISION_S = Math.max(1, Math.min(60, (Math.min(30, GPS_MIN) * 60) / 2));
mkdirSync(DIR, { recursive: true });

const FICHA = JSON.parse(readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8'));
const CENTRO = FICHA.CENTRO;
const lugar = (nombre) => FICHA.LUGARES.find((l) => l.nombre === nombre) || FICHA.LUGARES[0];
const DESTINO = lugar('Tierra Grata');
const SEGUNDO = lugar('Puesto de Salud');
const GPS_P = { latitude: CENTRO.lat, longitude: CENTRO.lng, accuracy: 10 };
// A empieza ~2 km al norte del pasajero; B, ~600 m al sur.
const POS_A0 = { lat: CENTRO.lat + 0.018, lng: CENTRO.lng };
const POS_B0 = { lat: CENTRO.lat - 0.0055, lng: CENTRO.lng + 0.001 };

const PAS = { correo: 'pasajero@prueba.taxicun.com', codigo: '246810', nombre: 'Ana María Gómez', celular: '3001234567' };
const CA = { correo: 'conductor@prueba.taxicun.com', codigo: '135790', nombre: 'Luis Alberto Rodríguez', celular: '3115550101', movil: '77', placa: 'TST777' };
const CB = { correo: 'conductor2@prueba.taxicun.com', codigo: '975310', nombre: 'Jorge Iván Peña', celular: '3125550202', movil: '78', placa: 'TST778' };
const TOKEN_A = 'A11CE5E9'.repeat(8); // APNs (iOS lo entrega en MAYÚSCULAS)
const TOKEN_P = 'BEEF5678'.repeat(8);
const TOKEN_B = 'fK3sP9-segundoplano:APA91bH' + 'x7Qe'.repeat(30); // FCM (Android)
const tA = TOKEN_A.toLowerCase();

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
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
// Espera a que el plugin pueda volver a enviar por movimiento (sin dar tiempo a un latido antes).
const esperarPausa = (tel, ms) => hasta(() => Date.now() - tel.plugin.ultimoEnvio >= ms, 20000, 50);

/* ---------------- base de datos, API y archivo de avisos ---------------- */
const sql = (q) => execFileSync('psql', [BASE_DATOS, '-tAc', q], { encoding: 'utf8', timeout: 15000 }).trim();
const cita = (t) => `'${String(t).replace(/'/g, "''")}'`;
const dondeCorreo = (correo) => `t.usuario_id = (select id from usuarios where correo = ${cita(correo)} and borrado is null)`;
const dormido = (correo) => sql(`select count(*) from turnos_dormidos t where ${dondeCorreo(correo)}`) === '1';
const conGps = (correo) => sql(`select (t.visto_gps is not null)::text from turnos_dormidos t where ${dondeCorreo(correo)}`) === 'true';
const dispositivosDe = (correo) => sql(`select coalesce(string_agg(d.app || '|' || d.plataforma || '|' || d.token, ','), '') from dispositivos d join usuarios u on u.id = d.usuario_id where u.correo = ${cita(correo)}`);

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
let marcaInicio = 0;
const avisosDesde = (n) => leerAvisos().slice(n);
const resumenAviso = (l) => `${l.app}/${l.datos?.tipo}${l.datos?.fase ? `/${l.datos.fase}` : ''} «${l.cuerpo}»`;
const pausasDe = (token) => leerAvisos().slice(marcaInicio).filter((l) => l.app === 'conductor' && l.token === token && l.datos?.tipo === 'turno_pausa');
const notificacionIos = (l) => ({
  id: `n-${l.datos?.viajeId || 'x'}`,
  title: l.apns?.cuerpo?.aps?.alert?.title || '',
  body: l.apns?.cuerpo?.aps?.alert?.body || '',
  data: l.apns?.cuerpo || {},
});

/* ---------------- geometría ---------------- */
function metros(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const entre = (a, b, f) => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
// La fórmula de la app del conductor (y del servidor 0.4.0): línea recta × 1,3 a 25 km/h.
const etaFormula = (pos, objetivo) => Math.min(600, Math.round((((metros(pos, objetivo) / 1000) * 1.3) / 25) * 60 * 10) / 10);

/* ------------------------------------------------------------------ */
/* El plugin «UbicacionTurno», como el nativo (corre en Node)           */
/* ------------------------------------------------------------------ */
// Las reglas de herramientas/nativo/ReglasTurno.java (UbicacionTurno.swift las sigue igual). Los
// tiempos que son de la batería van ACORTADOS para la prueba (entre corchetes, el del teléfono);
// los demás son los mismos.
const REGLAS = {
  LATIDO_MS: 5000, // [55 s] latido aunque esté quieto
  RELOJ_MS: 6000, // [60 s] el reloj del latido en iPhone
  PAUSA_AL_SALIR_MS: 3000, // al pasar a segundo plano se envía enseguida
  PAUSA_LIBRE_MS: 4000, // [15 s] libre: entre envíos por movimiento
  PAUSA_VIAJE_MS: 3000, // en viaje
  LECTURA_VIEJA_MS: 10000, // [30 s] el latido con una lectura más vieja viaja con la hora actual
  TOPE_MS: 14 * 3600 * 1000,
  LECTURAS_ANDROID_MS: { libre: 4000, viaje: 3000 }, // [30 s / 3 s] el proveedor Fused de Android
};
const ERRORES_QUE_DETIENEN = new Set(['sin_sesion', 'conductor_no_aprobado', 'empresa_no_disponible']);
const FINES = new Set(['app_cerrada', 'turno_apagado', 'tope', 'permiso']);
const modoValido = (m) => (m === 'viaje' ? 'viaje' : 'libre');
const distanciaMinima = (m) => (m === 'viaje' ? 10 : 50);
const pausaMinima = (m) => (m === 'viaje' ? REGLAS.PAUSA_VIAJE_MS : REGLAS.PAUSA_LIBRE_MS);
const puedeEnviar = (modo, libre, fin) => fin != null || modo === 'viaje' || libre;
function decidir(alFrente, modo, libre, ahora, ultimoEnvio, distancia) {
  if (alFrente || !puedeEnviar(modo, libre, null)) return null;
  const pausa = ahora - ultimoEnvio;
  const seMovio = distancia < 0 || distancia >= distanciaMinima(modo);
  if (seMovio && pausa >= pausaMinima(modo)) return 'movimiento';
  if (pausa >= REGLAS.LATIDO_MS) return 'latido';
  return null;
}
const enviarAlSalir = (hay, modo, libre, ahora, ultimoEnvio) => hay && puedeEnviar(modo, libre, null) && ahora - ultimoEnvio >= REGLAS.PAUSA_AL_SALIR_MS;
const tsParaEnviar = (motivo, ts, ahora) => (motivo === 'latido' && ahora - ts > REGLAS.LECTURA_VIEJA_MS ? ahora : ts);
const finParaServidor = (m) => (FINES.has(m) ? m : 'turno_apagado');
function interpretar(error, seguir, modoResp, modoActual) {
  if (error && ERRORES_QUE_DETIENEN.has(error)) return { detener: true, valor: error };
  if (seguir === false) return { detener: true, valor: 'servidor' };
  if ((modoResp === 'libre' || modoResp === 'viaje') && modoResp !== modoActual) return { detener: false, valor: modoResp };
  return null;
}

class UbicacionTurnoNativo {
  constructor(tel) {
    this.tel = tel;
    this.ios = tel.plataforma === 'ios';
    this.activo = false;
    this.muerto = false;
    this.url = null;
    this.token = '';
    this.modo = 'libre';
    this.libre = true;
    this.motivo = '';
    this.origen = '';
    this.desde = null;
    this.ultima = null; // última lectura { lat, lng, precision, ts }
    this.enviada = null;
    this.entregada = null; // iPhone: última posición que entregó Core Location (filtro de distancia)
    this.ultimoEnvio = 0;
    this.generacion = 0;
    this.reloj = null;
    this.llamadas = []; // [accion, op] que hizo la web
  }

  // La web llama por la puente (window.__utNativo). Los errores van como { error: { code, message } }.
  llamar(accion, op) {
    this.llamadas.push([accion, op ?? null, Date.now()]);
    if (this.muerto) return { error: { code: 'MUERTO', message: 'Proceso terminado' } };
    if (accion === 'iniciar') return this.iniciar(op || {});
    if (accion === 'cambiarModo') return this.cambiarModo(op || {});
    if (accion === 'detener') {
      this.parar(op?.motivo ?? 'turno_apagado', op?.avisar ?? true, 'app');
      return this.estado();
    }
    if (accion === 'estado') return this.estado();
    return { error: { code: 'NO_EXISTE', message: accion } };
  }

  iniciar(op) {
    const url = op.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || !op.token) return { error: { code: 'DATOS', message: 'Faltan url o token' } };
    if (this.tel.sinPermiso) return { error: { code: 'SIN_PERMISO', message: 'Sin permiso de ubicación' } };
    // iOS solo mantiene viva la app si el seguimiento arranca al frente; Android 12+ no deja arrancar el servicio.
    if (!this.activo && !this.tel.alFrente) return { error: { code: 'SEGUNDO_PLANO', message: 'La app no está al frente' } };
    const nuevo = !this.activo;
    this.url = url;
    this.token = op.token;
    this.libre = op.libre ?? true;
    this.motivo = '';
    this.origen = '';
    if (nuevo) {
      this.generacion += 1;
      this.desde = Date.now();
      this.ultima = null;
      this.enviada = null;
      this.entregada = null;
      this.ultimoEnvio = 0;
    }
    this.aplicar(op.modo ?? 'libre');
    this.activo = true;
    if (nuevo) setTimeout(() => this.entregar(true), 150); // la primera lectura llega enseguida
    if (this.ios && !this.reloj) this.reloj = setInterval(() => this.activo && this.revisar(Date.now()), REGLAS.RELOJ_MS);
    return this.estado();
  }

  cambiarModo(op) {
    if (op.modo) this.aplicar(op.modo);
    if (typeof op.libre === 'boolean') this.libre = op.libre;
    return this.estado();
  }

  estado() {
    const e = { activo: this.activo, modo: this.modo, libre: this.libre, motivo: this.motivo, origen: this.origen, precisa: this.tel.precisa !== false, plataforma: this.tel.plataforma };
    if (this.activo && this.desde) e.desde = this.desde;
    if (this.ultimoEnvio) e.ultimoEnvio = this.ultimoEnvio;
    return e;
  }

  // Precisión y frecuencia según el modo. Android: el proveedor Fused entrega cada X s, se mueva o no.
  aplicar(m) {
    this.modo = modoValido(m);
    if (!this.ios) {
      clearInterval(this.reloj);
      this.reloj = setInterval(() => this.activo && this.entregar(true), REGLAS.LECTURAS_ANDROID_MS[this.modo]);
    }
  }

  // Una lectura del GPS. En iPhone, Core Location solo entrega si se movió el filtro de distancia.
  entregar(forzar = false) {
    if (!this.activo) return;
    const p = this.tel.pos;
    if (this.ios && !forzar && this.entregada && metros(this.entregada, p) < distanciaMinima(this.modo)) return;
    this.entregada = { ...p };
    this.ultima = { lat: p.lat, lng: p.lng, precision: this.modo === 'viaje' ? 6 : 35, ts: Date.now() };
    this.revisar(Date.now());
  }

  alMoverse() {
    if (this.ios) this.entregar(false); // Android: llega con la siguiente lectura del Fused
  }

  revisar(ahora) {
    if (this.desde && ahora - this.desde > REGLAS.TOPE_MS) return this.parar('tope', true, 'sistema');
    const l = this.ultima;
    if (!l) return;
    const m = decidir(this.tel.alFrente, this.modo, this.libre, ahora, this.ultimoEnvio, this.enviada ? metros(l, this.enviada) : -1);
    if (m) this.enviar(l, m);
  }

  // Pasó a segundo plano (iOS didEnterBackground / Android handleOnPause): se envía enseguida.
  alFondo() {
    if (this.activo && enviarAlSalir(Boolean(this.ultima), this.modo, this.libre, Date.now(), this.ultimoEnvio)) this.enviar(this.ultima, 'latido');
  }

  // POST /api/conductor/ubicacion, como URLSession / HttpURLConnection. Sin cola: lo que falla se pierde.
  async enviar(l, motivo, fin = null) {
    if (!this.url || !puedeEnviar(this.modo, this.libre, fin)) return null;
    const ahora = Date.now();
    const cuerpo = {
      lat: l.lat,
      lng: l.lng,
      ...(this.ios ? { precision: l.precision } : {}), // Android: puede no venir
      rumbo: null,
      velocidad: null,
      ts: tsParaEnviar(motivo, l.ts, ahora),
      modo: this.modo,
      motivo,
      plataforma: this.tel.plataforma,
      simulada: false,
    };
    if (fin) cuerpo.fin = fin;
    if (!fin) {
      this.ultimoEnvio = ahora;
      this.enviada = l;
    }
    const gen = this.generacion;
    const reg = { t: ahora, motivo, fin, modo: this.modo, cuerpo, estado: null, respuesta: null, perdido: false, frente: this.tel.alFrente };
    this.tel.envios.push(reg);
    if (this.tel.sinRed) {
      reg.perdido = true;
      return null;
    }
    try {
      const r = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${this.token}`,
          'user-agent': `TaxiCun-App/conductor (nativo; ${this.tel.plataforma})`,
        },
        body: JSON.stringify(cuerpo),
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      reg.estado = r.status;
      const texto = await r.text();
      try {
        reg.respuesta = JSON.parse(texto);
      } catch {
        reg.respuesta = null; // una página que no es de TaxiCun nunca detiene el turno
      }
    } catch (e) {
      reg.perdido = true;
      reg.error = e.message;
      return null;
    }
    if (!fin) this.alResponder(reg.respuesta, gen);
    return reg.respuesta;
  }

  alResponder(j, gen) {
    if (!j || !this.activo || gen !== this.generacion) return;
    const a = interpretar(j.error ?? null, j.seguir ?? null, j.modo ?? null, this.modo);
    if (!a) return;
    if (a.detener) this.parar(a.valor, false, 'servidor');
    else this.aplicar(a.valor);
  }

  parar(m, avisar, origen) {
    if (!this.activo) return;
    if (avisar && this.ultima) this.tel.ultimoFin = this.enviar(this.ultima, 'fin', finParaServidor(m));
    clearInterval(this.reloj);
    this.reloj = null;
    this.activo = false;
    this.desde = null;
    this.motivo = m;
    this.origen = origen;
    this.generacion += 1;
    if (origen !== 'app') this.tel.emitir('detenido', { motivo: m, origen });
  }

  // Android: botón «Salir de turno» de la notificación fija. Durante un servicio (modo viaje) la
  // notificación no lo trae (ServicioTurno.aviso de taxicun-app): devuelve false y no pasa nada.
  salirDesdeNotificacion() {
    if (this.ios || !this.activo || this.modo === 'viaje') return false;
    this.parar('turno_apagado', true, 'notificacion');
    return true;
  }

  // La persona desliza la app: iOS willTerminate / Android onTaskRemoved mandan el fin esperando
  // hasta 2 s; el proceso muere (sin evento: ya no hay web que lo reciba).
  async matarApp() {
    let r = null;
    if (this.activo && this.ultima) r = await Promise.race([this.enviar(this.ultima, 'fin', 'app_cerrada'), espera(2000).then(() => null)]);
    this.morir();
    return r;
  }

  morir() {
    clearInterval(this.reloj);
    this.reloj = null;
    this.activo = false;
    this.muerto = true;
  }
}

// Un teléfono: su GPS, si la app está al frente, si hay red y el plugin (uno por proceso de la app).
class Telefono {
  constructor({ nombre, plataforma, pos }) {
    this.nombre = nombre;
    this.plataforma = plataforma;
    this.pos = { ...pos };
    this.alFrente = true;
    this.sinRed = false;
    this.precisa = true;
    this.envios = [];
    this.ultimoFin = null;
    this.pagina = null;
    this.ctx = null;
    this.sockets = []; // WebSocket del bus que abrió la web: { ws, abierto, enviados: [] }
    this.plugin = new UbicacionTurnoNativo(this);
  }

  // El sistema mató la app: el próximo arranque es otro proceso (plugin nuevo, inactivo).
  nuevoProceso() {
    this.plugin.morir();
    this.plugin = new UbicacionTurnoNativo(this);
    this.alFrente = true;
  }

  async mover(pos) {
    this.pos = { ...pos };
    await this.ctx?.setGeolocation({ latitude: pos.lat, longitude: pos.lng, accuracy: 8 });
    this.plugin.alMoverse();
  }

  emitir(evento, datos) {
    const p = this.pagina;
    if (!p || p.isClosed()) return;
    p.evaluate(([e, d]) => window.__utEmitir?.(e, d), [evento, datos]).catch(() => {});
  }

  busAbierto = () => this.sockets.some((x) => !x.ws.isClosed());
  presenciasEnviadas = () => this.sockets.flatMap((x) => x.enviados).filter((m) => m.tipo === 'presencia');
}

/* ---------------- Capacitor simulado (app 1.2) ---------------- */
function capacitorFalso(cfg) {
  if (!cfg) return;
  const L = (k, v) => (v === undefined ? JSON.parse(localStorage.getItem(k) || 'null') : localStorage.setItem(k, JSON.stringify(v)));
  const oyentes = {};
  const plugins = {};
  if (cfg.push) {
    plugins.PushNotifications = {
      async checkPermissions() {
        return { receive: L('__permisoPush') || 'prompt' };
      },
      async requestPermissions() {
        L('__permisoPush', 'granted');
        return { receive: 'granted' };
      },
      async register() {
        setTimeout(() => (oyentes.registration || []).forEach((f) => f({ value: cfg.tokenPush })), 40);
      },
      async addListener(ev, fn) {
        (oyentes[ev] ||= []).push(fn);
        return { remove: async () => { oyentes[ev] = (oyentes[ev] || []).filter((x) => x !== fn); } };
      },
      async removeAllListeners() {},
      async createChannel() {},
      async removeAllDeliveredNotifications() {},
    };
    // Tocar una notificación con la app viva (en segundo plano): vuelve al frente y llega el toque.
    window.__tocarNotificacion = (n) => (oyentes.pushNotificationActionPerformed || []).forEach((f) => f({ actionId: 'tap', notification: n }));
  }
  if (cfg.turno) {
    // El plugin vive en Node (window.__utNativo); los eventos llegan por window.__utEmitir.
    const oyentesUt = [];
    let retenidos = [];
    window.__utEmitir = (ev, d) => {
      if (ev !== 'detenido') return;
      if (oyentesUt.length) oyentesUt.forEach((f) => f(d));
      else retenidos.push(d); // retainUntilConsumed
    };
    const llamar = async (accion, op) => {
      const r = await window.__utNativo(accion, op ?? null);
      if (r && r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
      return r;
    };
    plugins.UbicacionTurno = {
      iniciar: (op) => llamar('iniciar', op),
      cambiarModo: (op) => llamar('cambiarModo', op),
      detener: (op) => llamar('detener', op),
      estado: () => llamar('estado'),
      async addListener(ev, fn) {
        if (ev === 'detenido') {
          oyentesUt.push(fn);
          const r = retenidos;
          retenidos = [];
          r.forEach((d) => setTimeout(() => fn(d), 0));
        }
        return { remove: async () => { const i = oyentesUt.indexOf(fn); if (i >= 0) oyentesUt.splice(i, 1); } };
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
    if (/Failed to load resource|net::ERR_|status of \d{3}/.test(m.text())) return;
    errores.push(`[${nombre}] consola: ${m.text()}`);
  });
  p.on('response', (r) => {
    if (r.url().startsWith(BASE) && r.status() >= 500) errores.push(`[${nombre}] ${r.status()} ${r.url()}`);
  });
}
async function contexto(cfg, gps, tel = null) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, geolocation: gps, permissions: ['geolocation'], locale: 'es-CO', timezoneId: 'America/Bogota' });
  if (tel) {
    tel.ctx = ctx;
    await ctx.exposeBinding('__utNativo', (_fuente, accion, op) => tel.plugin.llamar(accion, op));
  }
  await ctx.addInitScript(capacitorFalso, cfg);
  await ctx.addInitScript(() => {
    const Original = window.WebSocket;
    window.__wsBus = [];
    window.WebSocket = class extends Original {
      constructor(url, protocolos) {
        super(url, protocolos);
        if (/\/api\/bus/.test(String(url))) window.__wsBus.push(this);
      }
    };
  });
  await ctx.addInitScript(() => {
    window.__avisos = [];
    new MutationObserver(() => {
      document.querySelectorAll('.a-toast:not([data-visto])').forEach((n) => {
        n.dataset.visto = '1';
        window.__avisos.push(n.textContent.replace(/\s+/g, ' ').trim());
      });
    }).observe(document, { childList: true, subtree: true });
  });
  return ctx;
}
// Frames del bus de una página: los que manda y los que recibe (con la hora).
function escucharBus(p, { tel = null, recibidos = null } = {}) {
  p.on('websocket', (ws) => {
    if (!/\/api\/bus/.test(ws.url())) return;
    const reg = { ws, enviados: [] };
    tel?.sockets.push(reg);
    ws.on('framesent', (f) => {
      try {
        reg.enviados.push({ ...JSON.parse(String(f.payload)), t: Date.now() });
      } catch {
        /* no es JSON */
      }
    });
    if (recibidos) {
      ws.on('framereceived', (f) => {
        try {
          recibidos.push({ ...JSON.parse(String(f.payload)), t: Date.now() });
        } catch {
          /* no es JSON */
        }
      });
    }
  });
}
async function abrirApp(ctx, nombre, url, { tel = null, recibidos = null } = {}) {
  const p = await ctx.newPage();
  vigilar(p, nombre);
  escucharBus(p, { tel, recibidos });
  if (tel) tel.pagina = p;
  await p.goto(`${BASE}${url}`);
  return p;
}
// WebSocket del bus abiertos o abriéndose en la página (desde la página: readyState 0 o 1).
const busVivo = (p) => p.evaluate(() => (window.__wsBus || []).filter((w) => w.readyState <= 1).length).catch(() => 0);
const foto = (p, n) => p.screenshot({ path: `${DIR}${n}.png` }).catch(() => {});
const texto = (p, sel = 'body') => p.evaluate((x) => document.querySelector(x)?.innerText.replace(/\s+/g, ' ') || '', sel);
const vista = (p, v, timeout = 30000) => p.waitForSelector(`.a-app[data-vista="${v}"]`, { timeout });
const avisosVistos = (p) => p.evaluate(() => window.__avisos || []);
const ls = (p, k) => p.evaluate((x) => localStorage.getItem(x), k);
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
// La app pasa a segundo plano (true) o vuelve (false). Con el teléfono: el plugin se entera igual
// que en iOS (didEnterBackground) o Android (handleOnPause / handleOnResume).
async function visibilidad(p, oculta, tel = null) {
  if (tel) tel.alFrente = !oculta;
  await p.evaluate((o) => {
    if (!window.__visibilidadFalsa) {
      window.__visibilidadFalsa = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
    }
    window.__oculta = o;
    document.dispatchEvent(new Event('visibilitychange'));
  }, oculta);
  if (tel && oculta) tel.plugin.alFondo();
}
async function entrarConductor(p, c) {
  await p.waitForSelector('.a-ingreso-real input[name=correo]', { timeout: 30000 });
  await p.fill('.a-ingreso-real input[name=correo]', c.correo);
  await p.click('.a-ingreso-real [type=submit]');
  await escribirCodigo(p, '.a-ingreso-real .a-casillas-6', c.codigo);
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
async function cancelarPasajero(p) {
  await p.click('[data-cancelar]');
  await p.waitForSelector('.a-opciones', { timeout: 5000 });
  await p.click('.a-opcion >> nth=0');
  await p.waitForTimeout(300);
  await p.click('.a-modal .a-btn-peligro');
  return vista(p, 'inicio', 10000);
}
// El taxi de un móvil en el mapa del pasajero: su punto en la capa de Leaflet (null si no está).
const taxiEnMapa = (p, movil) => p.evaluate((m) => {
  const re = new RegExp(`Móvil 0*${m}\\b`);
  const n = [...document.querySelectorAll('.ct-taxi-marcador')].find((x) => re.test(x.textContent || ''));
  return n ? { x: Math.round(n._leaflet_pos?.x ?? NaN), y: Math.round(n._leaflet_pos?.y ?? NaN) } : null;
}, movil);
const taxiDestacado = (p) => p.evaluate(() => {
  const n = document.querySelector('.ct-taxi-marcador .ct-taxi-destacado')?.closest('.ct-taxi-marcador');
  return n ? { x: Math.round(n._leaflet_pos?.x ?? NaN), y: Math.round(n._leaflet_pos?.y ?? NaN) } : null;
});

/* ------------------------------------------------------------------ */
/* Estado de la corrida                                                 */
/* ------------------------------------------------------------------ */
const recibidosP = []; // lo que el pasajero recibe por el bus
const telA = new Telefono({ nombre: 'conductor A (iPhone)', plataforma: 'ios', pos: POS_A0 });
const telB = new Telefono({ nombre: 'conductor B (Android)', plataforma: 'android', pos: POS_B0 });
let ctxA;
let ctxB;
let ctxP;
let pa;
let pb;
let pp;
let idA = null; // seudónimo de A en el bus del pasajero (c_…)
let idB = null;
const presenciasDe = (id, desde = 0) => recibidosP.filter((m) => m.tipo === 'presencia' && m.datos?.conductorId === id && m.t >= desde);
const ocultadoDesde = (id, desde) => presenciasDe(id, desde).some((m) => !m.datos.disponible);
const ubicacionesDesde = (desde) => recibidosP.filter((m) => m.tipo === 'ubicacion' && m.t >= desde);
const idPorMovil = (movil) => recibidosP.find((m) => m.tipo === 'presencia' && Number(m.datos?.movil) === Number(movil))?.datos.conductorId || null;

/* ------------------------------------------------------------------ */
/* 0) Cuentas limpias                                                   */
/* ------------------------------------------------------------------ */
async function preparar() {
  const salud = await api('GET', 'salud');
  await debe(salud.estado === 200 && /^0\.4\./.test(salud.datos?.version || ''), `servidor 0.4 (rama segundo-plano) por el proxy (${salud.datos?.version || salud.estado})`);
  await debe(existsSync(AVISOS), `el servidor escribe los avisos simulados en ${AVISOS} (PUSH_SIMULADO)`);
  marcaInicio = leerAvisos().length;
  for (const c of [PAS, CA, CB]) {
    const r = await entrarApi(c);
    await debe(r.estado === 200, `cuenta de prueba ${c.correo} (¿está en CUENTAS_PRUEBA?)`);
    await api('DELETE', 'yo', undefined, r.datos.token);
  }
  const p = await entrarApi(PAS);
  await api('PATCH', 'yo', { nombre: PAS.nombre, celular: PAS.celular }, p.datos?.token);
  await api('POST', 'auth/salir', undefined, p.datos?.token);
  for (const c of [CA, CB]) {
    const r = await entrarApi(c);
    await api('PATCH', 'yo', { nombre: c.nombre, celular: c.celular }, r.datos?.token);
    const reg = await api('PUT', 'conductor', { empresa: 'cootransrural', movil: c.movil, placa: c.placa }, r.datos?.token);
    const apr = execFileSync('node', ['bin/admin.js', 'aprobar', c.correo], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000 }).trim();
    await api('POST', 'auth/salir', undefined, r.datos?.token);
    await debe(reg.estado === 200 && /aprobado/.test(apr), `conductor ${c.nombre} registrado y aprobado (móvil ${c.movil})`);
  }
}

/* ------------------------------------------------------------------ */
/* 1) A se pone en turno: los dos avisos e iniciar()                   */
/* ------------------------------------------------------------------ */
async function aEnTurno() {
  ctxA = await contexto({ push: true, turno: true, plataforma: 'ios', tokenPush: TOKEN_A }, { latitude: POS_A0.lat, longitude: POS_A0.lng, accuracy: 8 }, telA);
  pa = await abrirApp(ctxA, 'conductor A', 'taxicun/conductor/', { tel: telA });
  await debe(entrarConductor(pa, CA), 'A (iPhone 1.2 con UbicacionTurno): entra con el código');
  ok(telA.plugin.llamadas.some(([a]) => a === 'estado') && !telA.plugin.activo, 'A: al cargar la web pregunta estado() al plugin; fuera de turno no lo inicia');
  await pa.click('[data-conectar]');
  await debe(pa.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Que no se te pase ningún servicio")', { timeout: 8000 }), 'A: al ponerse en turno, primero el aviso de las notificaciones');
  await tocarModal(pa, 'Activar avisos');
  await debe(pa.waitForSelector('.a-modal h2:has-text("Tu ubicación mientras estás conectado")', { timeout: 8000 }), 'A: después, «Tu ubicación mientras estás conectado» (antes de iniciar el seguimiento)');
  const modal = await texto(pa, '.a-modal-segundo-plano');
  ok(/WhatsApp, Waze/.test(modal) && /indicador azul/.test(modal) && !/notificación fija/.test(modal), 'A: el aviso explica WhatsApp/Waze y, en iPhone, el indicador azul (sin la línea de Android)');
  ok(!telA.plugin.activo && !telA.plugin.llamadas.some(([a]) => a === 'iniciar'), 'A: con el aviso en pantalla el plugin aún no arranca');
  await foto(pa, 'a01-aviso-segundo-plano');
  await tocarModal(pa, 'Entendido');
  await debe(pa.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'A: en turno');
  await debe(hasta(() => dispositivosDe(CA.correo) === `conductor|ios|${tA}`, 8000), 'A: su iPhone quedó registrado para push');
  await debe(hasta(() => telA.plugin.activo, 8000), 'A: el plugin quedó iniciado');
  const [, op] = telA.plugin.llamadas.find(([a]) => a === 'iniciar');
  const token = await ls(pa, 'taxicun.token');
  ok(op.url === `${BASE}api/conductor/ubicacion`, `A: iniciar({ url }) = URL_API + 'conductor/ubicacion' (${op.url})`);
  ok(op.token && op.token === token, 'A: iniciar({ token }) = el token de la sesión');
  ok(op.modo === 'libre' && op.libre === true, `A: iniciar({ modo: 'libre', libre: true }) (${op.modo}, ${op.libre})`);
  ok(Boolean(JSON.parse((await ls(pa, 'tc.turno.conductor')) || 'null')?.desde) && (await ls(pa, 'taxicun.turno.aviso')) === '1', 'A: la web guardó la marca tc.turno.conductor y el aviso aceptado');
  await debe(hasta(() => telA.presenciasEnviadas().some((m) => m.datos?.disponible && m.datos?.segundoPlano === true), 10000), 'A: su presencia por el bus va con segundoPlano: true');
  await espera(2500);
  ok(telA.plugin.ultima && telA.envios.length === 0, `A: con la app al frente el plugin lee (${telA.plugin.ultima ? 'hay lectura' : 'sin lectura'}) pero no envía (${telA.envios.length} POST)`);
  await foto(pa, 'a02-en-turno');
}

/* ------------------------------------------------------------------ */
/* 2) El pasajero lo ve en el mapa                                      */
/* ------------------------------------------------------------------ */
async function abrirPasajero() {
  ctxP = await contexto({ push: true, plataforma: 'ios', tokenPush: TOKEN_P }, GPS_P);
  pp = await abrirApp(ctxP, 'pasajero', 'taxicun/', { recibidos: recibidosP });
  await pp.waitForSelector('.a-bienvenida [data-saltar]', { timeout: 30000 });
  await pp.click('.a-bienvenida [data-saltar]');
  await entrarPasajero(pp, PAS);
  await pp.waitForSelector('.a-bienvenida [data-empezar]', { timeout: 15000 });
  await pp.click('.a-bienvenida [data-empezar]');
  await vista(pp, 'inicio', 20000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 });
}
async function pasajeroLoVe() {
  await abrirPasajero();
  idA = await hasta(() => idPorMovil(CA.movil), 10000);
  await debe(idA, `pasajero: recibe la presencia de A (${idA})`);
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 10000), 'pasajero: ve el taxi de A (Móvil 77) en el mapa');
  await foto(pp, 'p01-ve-a-con-la-app-abierta');
}


/* ================================================================== */
/* Revisor de lógica: escenarios propios                               */
/* ================================================================== */
const POS_LEJOS = { lat: CENTRO.lat - 0.004, lng: CENTRO.lng + 0.002 }; // ~2,5 km al sur de POS_A0 (cerca del pasajero)
const presenciasA = (desde) => presenciasDe(idA, desde).map((m) => ({ t: m.t - desde, disp: m.datos.disponible, pos: m.datos.pos }));
const fmt = (l) => l.map((x) => `${(x.t / 1000).toFixed(1)}s:${x.disp ? 'disp' : 'NO'}${x.pos ? `@${Math.round(metros(x.pos, POS_LEJOS))}m` : ''}`).join(' | ');

// La página del conductor puede cargar ya oculta (WebView que se recarga con la app en segundo plano)
// y el GPS del JS puede tardar en dar la primera lectura al volver.
async function extrasA() {
  const envolver = () => {
    if (window.__geoEnvuelto) return;
    window.__geoEnvuelto = true;
    const geo = navigator.geolocation;
    const orig = geo.watchPosition.bind(geo);
    geo.watchPosition = (bien, mal, op) => orig((p) => {
      if (window.__gpsRetenerHasta && Date.now() < window.__gpsRetenerHasta) return;
      bien(p);
    }, mal, op);
    const unaVez = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (bien, mal, op) => {
      const falta = (window.__gpsRetenerHasta || 0) - Date.now();
      if (falta > 0) setTimeout(() => unaVez(bien, mal, op), falta + 50);
      else unaVez(bien, mal, op);
    };
  };
  await pa.evaluate(envolver);
  await ctxA.addInitScript(() => {
    if (localStorage.getItem('__ocultaAlCargar') === '1') {
      localStorage.removeItem('__ocultaAlCargar');
      window.__visibilidadFalsa = true;
      window.__oculta = true;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__oculta === true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__oculta ? 'hidden' : 'visible') });
    }
    if (window.__geoEnvuelto) return;
    window.__geoEnvuelto = true;
    const geo = navigator.geolocation;
    const orig = geo.watchPosition.bind(geo);
    geo.watchPosition = (bien, mal, op) => orig((p) => {
      if (window.__gpsRetenerHasta && Date.now() < window.__gpsRetenerHasta) return; // aún sin primera lectura
      bien(p);
    }, mal, op);
    const unaVez = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = (bien, mal, op) => {
      const falta = (window.__gpsRetenerHasta || 0) - Date.now();
      if (falta > 0) setTimeout(() => unaVez(bien, mal, op), falta + 50);
      else unaVez(bien, mal, op);
    };
  });
}

async function minimizarA() {
  const t0 = Date.now();
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), 'A minimiza: se cierra el bus');
  await debe(hasta(() => dormido(CA.correo) && conGps(CA.correo), 6000), 'central: A dormido con GPS');
  return t0;
}

// Mueve solo el GPS del teléfono que lee el plugin (el JS está oculto y no lee).
async function moverSoloPlugin(pos) {
  telA.pos = { ...pos };
  telA.plugin.alMoverse();
}

/* ---- E1: el WebView se recarga con la app oculta (iOS: se cayó el proceso del WebView) ---- */
async function e1RecargaOculta() {
  console.log('\n— E1: recarga del WebView con la app en segundo plano y el plugin vivo —');
  await minimizarA();
  // Se mueve hacia el pasajero (POST del plugin) para que el pasajero lo vea al día.
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  await moverSoloPlugin(POS_LEJOS);
  await debe(hasta(() => telA.envios.at(-1)?.respuesta?.visible === true, 5000), 'A minimizado: POST del plugin con visible:true');
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 8000), 'pasajero: ve a A en el mapa');
  // iOS mata el proceso del WebView (Waze en primer plano) y Capacitor recarga la página EN SEGUNDO PLANO.
  await pa.evaluate(() => localStorage.setItem('__ocultaAlCargar', '1'));
  const t0 = Date.now();
  await pa.reload();
  ok(await pa.evaluate(() => document.hidden), 'A: la página recargó oculta (document.hidden)');
  const abrio = await hasta(async () => (await busVivo(pa)) > 0, 15000, 100);
  ok(!abrio, `A: al recargar oculta la web NO abre el WebSocket con la central (${abrio ? `lo abrió a los ${s(Date.now() - t0)}` : 'bien'})`);
  ok(telA.plugin.activo, 'A: el plugin sigue activo (el proceso de la app no murió)');
  const sigueDormido = await hasta(() => !dormido(CA.correo), 6000).then((x) => !x);
  ok(sigueDormido, `central: A sigue «en turno en segundo plano» (dormido) después de la recarga (${sigueDormido ? 'sí' : 'NO: lo despertó el hola del WebSocket'})`);
  // El plugin sigue enviando: ¿lo ve la central?
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  const n = telA.envios.length;
  await moverSoloPlugin({ lat: POS_LEJOS.lat + 0.0015, lng: POS_LEJOS.lng });
  const env = await hasta(() => telA.envios.slice(n).find((x) => x.estado), 5000, 100);
  ok(env?.respuesta?.visible === true, `A: POST del plugin después de la recarga → ${JSON.stringify(env?.respuesta)} (se espera visible:true)`);
  const enTurnoWeb = await pa.evaluate(() => document.querySelector('[data-conectar]')?.getAttribute('aria-checked'));
  console.log(`   (la web oculta: interruptor aria-checked=${enTurnoWeb}; la marca tc.turno.conductor=${await ls(pa, 'tc.turno.conductor')})`);
  // ¿Sigue en el mapa del pasajero pasados 35 s (la presencia vence a los 30 s)?
  await espera(36000);
  const enMapa = await taxiEnMapa(pp, CA.movil);
  ok(Boolean(enMapa), `pasajero: 36 s después de la recarga A sigue en el mapa (${enMapa ? 'sí' : 'NO, desapareció'})`);
  await foto(pp, 'e1-pasajero-tras-recarga-oculta');
  // ¿Le llegan servicios? El pasajero pide.
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), 'pasajero: pide un taxi');
  await tocarModal(pp, 'Sí, avisarme').catch(() => {});
  await espera(4000);
  const push = avisosDesde(marca).find((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'solicitud');
  const porBus = await pa.evaluate(() => Boolean(document.querySelector('.a-solicitud.a-abierta')));
  ok(Boolean(push), `A (en turno para el plugin, app oculta): le llega el servicio por push (push: ${push ? 'sí' : 'no'}; por el bus: ${porBus ? 'sí' : 'no'})`);
  await cancelarPasajero(pp).catch(() => {});
  // Vuelve a la app: la web retoma el turno.
  await visibilidad(pa, false, telA);
  const retomo = await hasta(() => pa.evaluate(() => document.querySelector('[data-conectar]')?.getAttribute('aria-checked') === 'true'), 15000);
  ok(retomo, `A: al volver a la app la web retoma el turno (${retomo ? 'sí' : 'no'})`);
  await espera(1500);
}

/* ---- E2: al volver a la app, la primera presencia sale con la posición vieja del JS ---- */
async function e2PosicionVieja() {
  console.log('\n— E2: al volver a la app (GPS del JS sin lectura aún), qué posición ve el pasajero —');
  // Al frente en POS_A0 (el JS la lee); luego minimiza y maneja ~2,5 km (solo el plugin lo ve).
  await telA.mover(POS_A0);
  await espera(9000); // presencia con POS_A0
  await minimizarA();
  for (const f of [0.35, 0.7, 1]) {
    await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
    await moverSoloPlugin(entre(POS_A0, POS_LEJOS, f));
  }
  await espera(1500);
  const tV = Date.now();
  // Vuelve a la app; el GPS del JS tarda 4 s en dar la primera lectura (Android: intervalo de 5 s).
  // El GPS del teléfono ya está en POS_LEJOS; el JS aún no recibe su primera lectura.
  await ctxA.setGeolocation({ latitude: POS_LEJOS.lat, longitude: POS_LEJOS.lng, accuracy: 8 });
  await pa.evaluate(() => { window.__gpsRetenerHasta = Date.now() + 4000; });
  await visibilidad(pa, false, telA);
  await espera(4500);
  await ctxA.setGeolocation({ latitude: POS_LEJOS.lat, longitude: POS_LEJOS.lng, accuracy: 9 }); // llega la primera lectura
  await espera(4000);
  const lista = presenciasA(tV - 8000);
  console.log(`   presencias de A que recibe el pasajero (t desde la vuelta; metros a la posición real): ${fmt(lista)}`);
  const despues = lista.filter((x) => x.t >= 8000 && x.pos);
  const saltoAtras = despues.find((x) => metros(x.pos, POS_LEJOS) > 1000);
  ok(!saltoAtras, `pasajero: al volver A a la app, su taxi no salta hacia atrás (${saltoAtras ? `saltó a ${Math.round(metros(saltoAtras.pos, POS_LEJOS))} m de donde está, ${(saltoAtras.t / 1000 - 8).toFixed(1)} s después de volver` : 'bien'})`);
  await foto(pp, 'e2-pasajero-tras-volver');
}

/* ---- E3: minimiza con el plugin activo pero no llega ningún POST (Cloudflare, servicio muerto) ---- */
async function e3SinNingunPost() {
  console.log('\n— E3: minimiza con el plugin activo y no llega ningún POST —');
  const marca = leerAvisos().length;
  telA.sinRed = true; // los POST del plugin se pierden (p. ej. Cloudflare los reta con un 403 en HTML)
  const t0 = await minimizarA();
  const espera1 = (GPS_MIN * 60 + REVISION_S + 6) * 1000;
  await hasta(() => !dormido(CA.correo), espera1, 500);
  const sigue = dormido(CA.correo);
  const hastaBase = sql(`select round(extract(epoch from t.hasta - now()))::int from turnos_dormidos t where ${dondeCorreo(CA.correo)}`);
  const pausa = avisosDesde(marca).find((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'turno_pausa');
  ok(!sigue && Boolean(pausa), `central: sin ninguna ubicación, a los TURNO_GPS_MIN (${PLAZO_GPS_S} s) sale de turno con la pausa (a los ${s(Date.now() - t0)}: dormido=${sigue}, le quedan ${hastaBase || '—'} s; pausa=${pausa ? 'sí' : 'no'})`);
  telA.sinRed = false;
  await visibilidad(pa, false, telA);
  await espera(2000);
}

/* ---- E4: toca «Nuevo servicio» después de manejar minimizado lejos de donde lo dejó el JS ---- */
async function e4OfertaTrasPush(retenerMs) {
  console.log(`\n— E4 (${retenerMs ? `GPS del JS tarda ${retenerMs} ms al volver` : 'GPS del JS al instante: control'}): toca «Nuevo servicio» tras manejar minimizado ~12 km —`);
  const P_FAR = { lat: CENTRO.lat + 0.11, lng: CENTRO.lng };
  const P_NEAR = { lat: CENTRO.lat - 0.003, lng: CENTRO.lng + 0.001 };
  await telA.mover(P_FAR);
  await espera(9000); // la presencia del JS sale con P_FAR
  await minimizarA();
  for (const f of [0.5, 0.9, 1]) {
    await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
    await moverSoloPlugin(entre(P_FAR, P_NEAR, f));
  }
  await debe(hasta(() => { const e = telA.envios.at(-1); return e?.estado === 200 && metros(e.cuerpo, P_NEAR) < 5; }, 8000), 'A minimizado: la central ya tiene su posición junto al pasajero (POST del plugin)');
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), 'pasajero: pide un taxi');
  await tocarModal(pp, 'Sí, avisarme').catch(() => {});
  const sol = await hasta(() => avisosDesde(marca).find((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'solicitud'), 8000);
  await debe(sol, 'central → A (dormido con GPS, cerca): «Nuevo servicio» por push');
  await ctxA.setGeolocation({ latitude: P_NEAR.lat, longitude: P_NEAR.lng, accuracy: 8 });
  await pa.evaluate((ms) => { window.__gpsRetenerHasta = ms ? Date.now() + ms : 0; }, retenerMs);
  const t0 = Date.now();
  await visibilidad(pa, false, telA);
  await pa.evaluate((n) => window.__tocarNotificacion(n), notificacionIos(sol));
  // La primera lectura del GPS del JS llega a los retenerMs (Android: intervalo de 5 s).
  const soltarGps = retenerMs ? espera(retenerMs + 300).then(() => ctxA.setGeolocation({ latitude: P_NEAR.lat, longitude: P_NEAR.lng, accuracy: 9 })) : Promise.resolve();
  const vio = await pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 12000 }).then(() => Date.now() - t0, () => null);
  const avA = await avisosVistos(pa);
  const pres = telA.presenciasEnviadas().filter((m) => m.t >= t0).map((m) => `${((m.t - t0) / 1000).toFixed(1)}s@${m.datos?.pos ? `${Math.round(metros(m.datos.pos, P_NEAR))}m` : 'sin pos'}`);
  console.log(`   presencias que manda A al volver (metros a donde está): ${pres.join(' | ')}`);
  const sigue = await pp.$('.a-app[data-vista="buscando"]');
  ok(vio !== null && vio < 3000, `A: tras tocar el aviso ve la oferta enseguida (${vio !== null ? s(vio) : `NO; avisos: ${avA.slice(-1).join(' / ')}; el pasajero ${sigue ? 'SIGUE buscando' : 'ya no busca'}`})`);
  if (vio === null) {
    await foto(pa, `e4-conductor-sin-oferta-${retenerMs}`);
  } else if (retenerMs) {
    // Acepta antes de la primera lectura del GPS del JS: la aceptación sale sin pos y la central pone la
    // del plugin (junto al pasajero), no la de donde minimizó.
    const ta = Date.now();
    await pa.click('.a-solicitud [data-aceptar]');
    const acepto = await hasta(() => recibidosP.find((m) => m.tipo === 'aceptacion' && m.t >= ta), 8000, 100);
    const lejos = acepto?.datos?.pos ? Math.round(metros(acepto.datos.pos, P_NEAR)) : null;
    ok(Date.now() - t0 < retenerMs && acepto && lejos !== null && lejos < 300 && acepto.datos.etaMin > 0 && acepto.datos.etaMin < 5,
      `pasajero: la aceptación (antes de que el GPS del JS lea) trae la posición del plugin y el tiempo de la central (${lejos} m de donde está A, ${acepto?.datos?.etaMin} min)`);
    await debe(vista(pa, 'hacia_origen', 15000), 'A: servicio confirmado');
    await foto(pp, 'e4-pasajero-aceptado-sin-gps');
  }
  await soltarGps;
  await cancelarPasajero(pp).catch(() => {});
  await espera(2500);
}

/* ---- E5: Android en viaje con la app minimizada: la notificación no trae «Salir de turno» ---- */
async function e5SalirEnViaje() {
  console.log('\n— E5: Android, servicio en curso con la app minimizada: sin «Salir de turno» en la notificación —');
  if (!pp) await abrirPasajero();
  ctxB = await contexto({ push: true, turno: true, plataforma: 'android', tokenPush: TOKEN_B }, { latitude: POS_B0.lat, longitude: POS_B0.lng, accuracy: 8 }, telB);
  pb = await abrirApp(ctxB, 'conductor B', 'taxicun/conductor/', { tel: telB });
  await debe(entrarConductor(pb, CB), 'B (Android): entra');
  await pb.click('[data-conectar]');
  await tocarModal(pb, 'Activar avisos');
  await debe(pb.waitForSelector('.a-modal h2:has-text("Tu ubicación mientras estás conectado")', { timeout: 8000 }), 'B: «Tu ubicación mientras estás conectado»');
  const modal = await texto(pb, '.a-modal-segundo-plano');
  ok(/demás pasajeros de tu cooperativa solo ven una posición aproximada/.test(modal) && !/La ves solo tú/.test(modal), 'B: el aviso dice que los demás pasajeros de la cooperativa ven una posición aproximada');
  ok(/salir de turno cuando no tengas un servicio en curso/.test(modal), 'B: y que desde la notificación se sale de turno cuando no hay un servicio en curso');
  await tocarModal(pb, 'Entendido');
  await debe(pb.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'B: en turno');
  await debe(hasta(() => telB.plugin.activo, 8000), 'B: plugin iniciado');
  await debe(pedirTaxi(pp, DESTINO), 'pasajero: pide un taxi');
  await tocarModal(pp, 'Sí, avisarme').catch(() => {});
  await debe(pb.waitForSelector('.a-solicitud.a-abierta', { timeout: 15000 }), 'B: ve la oferta');
  await pb.click('.a-solicitud [data-aceptar]');
  await debe(vista(pb, 'hacia_origen', 20000), 'B: acepta');
  await debe(hasta(() => telB.plugin.modo === 'viaje', 6000), 'B: plugin en modo viaje');
  await visibilidad(pb, true, telB);
  await debe(hasta(() => !telB.busAbierto(), 6000, 100), 'B minimiza en viaje (Waze): se cierra el bus');
  const origenP = { lat: GPS_P.latitude, lng: GPS_P.longitude };
  for (const f of [0.2, 0.4]) {
    await espera(REGLAS.LECTURAS_ANDROID_MS.viaje + 300);
    await telB.mover(entre(POS_B0, origenP, f));
  }
  await espera(REGLAS.LECTURAS_ANDROID_MS.viaje + 500);
  const t1 = Date.now();
  const antes = ubicacionesDesde(t1 - 15000).length;
  ok(antes > 0, `pasajero: mientras B maneja minimizado le llegan ubicaciones (${antes})`);
  const salio = telB.plugin.salirDesdeNotificacion();
  ok(salio === false && telB.plugin.activo && !telB.envios.some((e) => e.fin), 'B: durante el servicio la notificación no trae «Salir de turno» (el plugin sigue, sin fin)');
  for (const f of [0.6, 0.8, 0.95]) {
    await espera(REGLAS.LECTURAS_ANDROID_MS.viaje + 300);
    await telB.mover(entre(POS_B0, origenP, f));
  }
  await espera(3000);
  const despues = ubicacionesDesde(t1 + 500).length;
  ok(despues > 0, `pasajero: con el servicio en curso sigue viendo por dónde va B (${despues} ubicaciones en ${s(Date.now() - t1)})`);
  const avB = await avisosVistos(pb);
  ok(!avB.some((a) => /Sigues con un servicio en curso|Saldrás de turno/.test(a)), 'B: la app no dice nada de salir de turno (no tocó nada)');
  await foto(pp, 'e5-pasajero-sigue-viendo-a-b');
  // El pasajero cancela con B minimizado: el siguiente POST lo pasa a modo libre y el botón vuelve.
  await cancelarPasajero(pp).catch(() => {});
  await debe(hasta(() => telB.plugin.modo === 'libre', 15000), 'B: cancelado el servicio, el plugin vuelve a modo libre');
  const tf = Date.now();
  ok(telB.plugin.salirDesdeNotificacion() === true, 'B: sin servicio, «Salir de turno» de la notificación funciona');
  const fin = await hasta(async () => {
    const x = telB.envios.find((e) => e.fin && e.t >= tf);
    if (x && !x.estado) await telB.ultimoFin;
    return x?.estado ? x : null;
  }, 4000, 100);
  ok(fin?.cuerpo?.fin === 'turno_apagado' && fin.respuesta?.seguir === false, `B: → POST { fin: turno_apagado } → ${JSON.stringify(fin?.respuesta)}`);
  await visibilidad(pb, false, telB);
  const desconecto = await hasta(async () => (await avisosVistos(pb)).some((a) => /Te desconectaste desde la notificación\./.test(a)), 8000);
  ok(desconecto, `B: al volver, «Te desconectaste desde la notificación.»${desconecto ? '' : ` (avisos: ${(await avisosVistos(pb)).slice(-3).join(' / ')} · zona: ${await pb.evaluate(() => document.querySelector('.a-avisos')?.textContent.replace(/\s+/g, ' '))})`}`);
  await debe(hasta(async () => (await pb.getAttribute('[data-conectar]', 'aria-checked')) === 'false', 8000), 'B: fuera de turno');
}

/* ---- E6: con la app minimizada vuelve la red (evento «online») o vuelve a la app un instante ---- */
async function e6BusSeAbreOculto(como) {
  console.log(`\n— E6 (${como}): el bus se abre con la app oculta y el plugin enviando —`);
  await minimizarA();
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  await moverSoloPlugin({ lat: CENTRO.lat - 0.002, lng: CENTRO.lng + 0.001 });
  await debe(hasta(() => telA.envios.at(-1)?.respuesta?.visible === true, 5000), 'A minimizado: POST con visible:true');
  if (como === 'online') {
    // Pasa por un tramo sin señal (túnel, zona rural) y vuelve la red: el navegador dispara offline/online.
    await ctxA.setOffline(true);
    await espera(1500);
    await ctxA.setOffline(false);
  } else {
    // Abre TaxiCun un instante (cambio rápido de apps) y vuelve a WhatsApp antes de que el bus salude.
    await visibilidad(pa, false, telA);
    await visibilidad(pa, true, telA);
  }
  const t0 = Date.now();
  // Puede abrirse un instante (el vistazo lo abre con la app a la vista), pero no queda abierto.
  await espera(1500);
  const abierto = await hasta(async () => (await busVivo(pa)) > 0, 6500, 100);
  ok(!abierto, `A: con la app oculta el bus no queda abierto (${abierto ? `abierto a los ${s(Date.now() - t0)}` : 'bien'})`);
  await espera(2500);
  const presOcultas = telA.presenciasEnviadas().filter((m) => m.t >= t0).length;
  ok(dormido(CA.correo) && presOcultas === 0, `central: A sigue dormido con GPS (sin presencias de la web oculta: ${presOcultas})`);
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  const n = telA.envios.length;
  await moverSoloPlugin({ lat: CENTRO.lat - 0.0035, lng: CENTRO.lng + 0.001 });
  const env = await hasta(() => telA.envios.slice(n).find((x) => x.estado), 5000, 100);
  ok(env?.respuesta?.visible === true, `A: el plugin sigue enviando y la central lo muestra (${JSON.stringify(env?.respuesta)})`);
  await espera(33000);
  const enMapa = await taxiEnMapa(pp, CA.movil);
  ok(Boolean(enMapa), `pasajero: ~35 s después A sigue en el mapa (${enMapa ? 'sí' : 'NO'})`);
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), 'pasajero: pide un taxi');
  await tocarModal(pp, 'Sí, avisarme').catch(() => {});
  await espera(4000);
  const push = avisosDesde(marca).find((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'solicitud');
  const recibidosA = await pa.evaluate(() => Boolean(document.querySelector('.a-solicitud')));
  ok(Boolean(push), `A (minimizado, plugin enviando): le llega «Nuevo servicio» por push (${push ? 'sí' : 'NO'}; por el bus oculto: ${recibidosA ? 'sí, pero la app está oculta' : 'no'})`);
  await foto(pp, `e6-pasajero-${como}`);
  await cancelarPasajero(pp).catch(() => {});
  await visibilidad(pa, false, telA);
  await espera(2500);
}

try {
  await preparar();
  if (!(process.argv.includes('--solo') && process.argv.includes('--E5') && !process.argv.some((a) => /^--E[1-46]$/.test(a)))) {
    await aEnTurno();
    await extrasA();
    await pasajeroLoVe();
  }
  for (const [nombre, fn] of [['E1', e1RecargaOculta], ['E2', e2PosicionVieja], ['E4', () => e4OfertaTrasPush(0)], ['E4', () => e4OfertaTrasPush(4000)], ['E3', e3SinNingunPost], ['E5', e5SalirEnViaje], ['E6', () => e6BusSeAbreOculto('online')], ['E6', () => e6BusSeAbreOculto('vistazo')]]) {
    if (process.argv.includes('--solo') && !process.argv.includes(`--${nombre}`)) continue;
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Detener)) throw e;
      console.log(`   (${nombre} se detuvo: ${e.message})`);
      await visibilidad(pa, false, telA).catch(() => {});
      await espera(3000);
    }
  }
} catch (e) {
  if (!(e instanceof Detener)) {
    console.error(e);
    fallas += 1;
  }
} finally {
  telA.plugin.morir();
  telB.plugin.morir();
  ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 6).join(' | ')}` : ''}`);
  await b.close();
  console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'} · segundo plano: casos límite (servidor ${BASE}) · ${bien} ✔ · ${fallas} ✘ · capturas en ${DIR}`);
  process.exit(fallas ? 1 : 0);
}
