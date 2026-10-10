// «Fuera de turno» de verdad (lote final, 9-oct-2026): lo que reportó Oscar. Con su app de conductor en «Desconectado», el
// pasajero veía su taxi disponible («Taxi a 6 min») por momentos, porque la ubicación nativa (el plugin «UbicacionTurno»)
// seguía llegando y la central lo volvía a poner en turno.
//
// Mismo montaje que pruebas/segundo-plano-casos-e2e.mjs: el servidor con PUSH_SIMULADO y los tiempos del perfil corto, la
// web servida como taxicun.com y el plugin «UbicacionTurno» simulado en Node como el nativo (las reglas de ReglasTurno, POST
// reales a /api/conductor/ubicacion). Nada de /api se simula.
//
// Recorre:
//  F1) La web pierde el rastro del plugin (iOS rehace la escena de la app: vista, puente y plugin NUEVOS, inactivos; el
//      plugin viejo sigue vivo y enviando con la app en segundo plano; así llegaban los POST en producción el 9-oct con la
//      pantalla en «Desconectado»). La app abre en «Fuera de turno»; al saludar, la central le dice que la cree en turno y la
//      app la corrige (fuera de turno explícito): el pasajero deja de verlo, el siguiente POST del plugin viejo recibe
//      seguir:false y se detiene, y con la app en segundo plano el taxi no vuelve a aparecer ni se abre otro turno.
//  F2) Sale de turno con el bus medio caído (lo que manda la app no llega) y sin red para el «fin» del plugin: la central no
//      confirma por el bus y la app lo dice por REST (POST /api/conductor/turno). El pasajero que vuelve a abrir su app no
//      lo ve.
//  F3) Vuelve a ponerse en turno: el plugin arranca, sus POST valen otra vez (seguir:true) y el pasajero lo ve minimizado.
//  F4) Los textos: «En turno» / «Fuera de turno» en la píldora, el aviso de conexión de arriba solo cuando hay un problema y
//      el taxi propio gris con «Tú · fuera de turno» fuera de turno.
//
// Con la instalación local (perfil corto: TURNO_GPS_MIN=0.6 TURNO_GPS_OCULTAR_S=15 PRESENCIA_SEGUNDO_PLANO_S=3):
//   eval "$(cd <servidor> && node pruebas/local/instalacion.mjs entorno-app --dir=…)" \
//     && CAPTURAS=<carpeta>/ node pruebas/turno-fuera-e2e.mjs http://localhost:<B+3>/ [--solo --F1 --F2 …]
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8971/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/lote/pruebas/turno/e2e').replace(/\/?$/, '/');
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
    const reg = { ws, enviados: [], abierto: Date.now() };
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
// La foto del pasajero con su mapa un nivel más lejos, para que en la captura se vea si A está o no (A queda a ~450 m, al
// borde de la vista). La rueda va sobre la punta del pin: el punto de recogida no cambia. Después vuelve al nivel de antes.
async function fotoPasajero(n) {
  const caja = await pp.locator('.a-pin-svg').boundingBox().catch(() => null);
  if (!caja) return foto(pp, n);
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height - 2;
  await pp.mouse.move(x, y);
  await pp.mouse.wheel(0, 60);
  await espera(900);
  await foto(pp, n);
  await pp.mouse.move(x, y);
  await pp.mouse.wheel(0, -60);
  await espera(900);
}
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
  await debe(salud.estado === 200 && /^0\.([4-9]|[1-9]\d)\./.test(salud.datos?.version || ''), `servidor de la 0.4 a la 0.9 (segundo plano) por el proxy (${salud.datos?.version || salud.estado})`);
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
    const apr = execFileSync('node', ['bin/admin.js', 'aprobar', c.correo, '--motivo', 'Documentos revisados (prueba de punta a punta)'], { cwd: SERVIDOR, env: { ...process.env, DATABASE_URL: BASE_DATOS }, encoding: 'utf8', timeout: 20000 }).trim();
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
  await fotoPasajero('p01-ve-a-con-la-app-abierta');
}


async function minimizarA() {
  const t0 = Date.now();
  await visibilidad(pa, true, telA);
  await debe(hasta(async () => (await busVivo(pa)) === 0, 6000, 100), 'A minimiza: se cierra el bus');
  await debe(hasta(() => dormido(CA.correo) && conGps(CA.correo), 6000), 'central: A dormido con GPS');
  return t0;
}

// Mueve solo el GPS del teléfono que lee el plugin (el JS está oculto y no lee).
async function moverSoloPlugin(pos) {
  telA.pos = { ...pos };
  telA.plugin.alMoverse();
}

/* ================================================================== */
/* Fuera de turno de verdad: escenarios                                 */
/* ================================================================== */
const POS_CERCA = { lat: CENTRO.lat + 0.004, lng: CENTRO.lng }; // ~450 m al norte del pasajero
const pildora = (p) => p.evaluate(() => {
  const b = document.querySelector('[data-conectar]');
  return {
    checked: b?.getAttribute('aria-checked') ?? null,
    titulo: b?.querySelector('[data-pildora-titulo]')?.textContent.trim() ?? '',
    sub: b?.querySelector('[data-pildora-sub]')?.textContent.trim() ?? '',
    aria: b?.getAttribute('aria-label') ?? '',
  };
});
const enTurnoWeb = async (p) => (await pildora(p)).checked === 'true';
// El aviso de conexión de arriba: visible y su texto.
const chipConexion = (p) => p.evaluate(() => {
  const c = document.querySelector('[data-conexion]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  return { visible: !c.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 && r.width > 0, texto: c.textContent.replace(/\s+/g, ' ').trim() };
});
// El taxi propio en el mapa del conductor (el destacado): color de la carrocería y etiqueta.
const taxiPropio = (p) => p.evaluate(() => {
  const n = document.querySelector('.ct-taxi-marcador .ct-taxi-destacado')?.closest('.ct-taxi-marcador');
  if (!n) return null;
  return { color: n.querySelector('svg rect')?.getAttribute('fill') || '', etiqueta: n.querySelector('.ct-taxi-etiqueta')?.textContent.trim() || '' };
});
const turnosDesde = (correo, t) => Number(sql(`select count(*) from turnos t where ${dondeCorreo(correo)} and t.inicio >= to_timestamp(${t / 1000})`) || 0);
const turnoAbierto = (correo) => sql(`select count(*) from turnos t where ${dondeCorreo(correo)} and t.fin is null`) !== '0';

// iOS rehace la escena de la app (vista, puente y plugin NUEVOS) mientras el proceso sigue vivo: el plugin viejo sigue
// recibiendo el GPS y enviando con la app en segundo plano, pero ya no le habla a ninguna página.
function separarPlugin(tel) {
  const viejo = tel.plugin;
  const envios = [];
  viejo.tel = new Proxy(tel, {
    get(t, k) {
      if (k === 'emitir') return () => {}; // su puente ya no existe: nadie recibe «detenido»
      if (k === 'envios') return envios;
      return Reflect.get(t, k);
    },
  });
  viejo.envios = envios;
  tel.plugin = new UbicacionTurnoNativo(tel);
  return viejo;
}

async function aEnTurnoOtraVez() {
  await pa.waitForSelector('[data-conectar]:not([disabled])', { timeout: 20000 });
  if (!(await enTurnoWeb(pa))) await pa.click('[data-conectar]');
  await debe(hasta(() => enTurnoWeb(pa), 15000), 'A: en turno');
  await debe(hasta(() => telA.plugin.activo, 10000), 'A: el plugin quedó iniciado');
}

/* ---- F1: la web pierde el rastro del plugin y la ubicación nativa sigue llegando ---- */
async function f1WebPierdeElPlugin() {
  console.log('\n— F1: la web pierde el rastro del plugin (escena nueva) y la ubicación nativa sigue llegando —');
  await minimizarA();
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  await moverSoloPlugin(POS_CERCA);
  await debe(hasta(() => telA.envios.at(-1)?.respuesta?.visible === true, 5000), 'A minimizado en turno: POST del plugin con visible:true');
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 8000), 'pasajero: ve a A (en turno, minimizado)');
  await fotoPasajero('f1-pasajero-ve-a-minimizado');
  const viejo = separarPlugin(telA);
  telA.alFrente = true;
  const tAbre = Date.now();
  await pa.reload();
  await pa.waitForSelector('[data-conectar]', { timeout: 30000 });
  await hasta(async () => (await pildora(pa)).titulo && !/Buscando/.test((await pildora(pa)).sub), 10000);
  const pil = await pildora(pa);
  ok(pil.checked === 'false' && pil.titulo === 'Fuera de turno', `A abre la app (escena nueva): la píldora dice «${pil.titulo}» (${pil.checked === 'false' ? 'fuera de turno' : 'EN TURNO'})`);
  ok(!telA.plugin.activo && viejo.activo, `el plugin nuevo no sigue el turno (${telA.plugin.activo}) y el viejo sigue vivo (${viejo.activo})`);
  const dijo = await hasta(() => telA.presenciasEnviadas().find((m) => m.t >= tAbre && m.datos?.enTurno === false), 12000);
  ok(Boolean(dijo), `A: la central lo creía en turno y la app le dice «fuera de turno» al saludar (${dijo ? JSON.stringify(dijo.datos) : 'no mandó nada'})`);
  const loDejaDeVer = await hasta(async () => !(await taxiEnMapa(pp, CA.movil)), 12000, 200);
  ok(Boolean(loDejaDeVer), 'pasajero: A deja de verse en cuanto su app dice «Fuera de turno»');
  await foto(pa, 'f1-a-abre-fuera-de-turno');
  // Oscar se va a la app del pasajero: la de conductor queda en segundo plano y el plugin viejo sigue enviando.
  const tOculta = Date.now();
  const n0 = viejo.envios.length;
  await visibilidad(pa, true, telA);
  viejo.alFondo();
  let segundosVisible = 0;
  let segundosDormido = 0;
  const hastaMs = Date.now() + 45000;
  while (Date.now() < hastaMs) {
    if (await taxiEnMapa(pp, CA.movil)) segundosVisible += 1;
    if (dormido(CA.correo)) segundosDormido += 1;
    await espera(1000);
  }
  const disp = presenciasDe(idA, tOculta).filter((m) => m.datos.disponible).length;
  const buses = telA.sockets.filter((x) => x.abierto >= tOculta).length;
  console.log(`   (con la app oculta: ${viejo.envios.length - n0} POST del plugin viejo; ${buses} WebSocket abiertos por la web; respuestas: ${viejo.envios.slice(n0).map((r) => r.estado ? `${r.estado}:${JSON.stringify(r.respuesta)}` : 'perdido').slice(0, 4).join(' · ')})`);
  ok(segundosVisible === 0 && disp === 0, `pasajero: con A en segundo plano y el plugin viejo enviando, A NO aparece en 45 s (${segundosVisible} s visible, ${disp} presencias «disponible»)`);
  ok(segundosDormido === 0, `central: A no vuelve a quedar «en turno en segundo plano» (${segundosDormido} s dormido)`);
  const resp = viejo.envios.slice(n0).filter((r) => r.estado);
  ok(resp.length > 0 && resp[0].respuesta?.seguir === false, `el primer POST del plugin viejo recibe seguir:false (${JSON.stringify(resp[0]?.respuesta)})`);
  ok(!viejo.activo && resp.length === 1, `el plugin viejo se detuvo y no mandó más (${resp.length} POST respondidos)`);
  await espera(6000); // el registro de operación escribe cada 5 s
  const nuevos = turnosDesde(CA.correo, tAbre);
  ok(nuevos === 0, `central: ningún turno nuevo de A desde que abrió la app en «Fuera de turno» (${nuevos})`);
  await fotoPasajero('f1-pasajero-sin-a');
  await visibilidad(pa, false, telA);
  await espera(1500);
  viejo.morir();
}

/* ---- F2: sale de turno con el bus medio caído y sin red para el «fin» del plugin ---- */
async function f2BusMedioCaido() {
  console.log('\n— F2: «Fuera de turno» con el bus medio caído: la app lo confirma por REST —');
  await aEnTurnoOtraVez();
  await telA.mover(POS_CERCA);
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 15000), 'pasajero: ve a A en turno');
  const pedidos = [];
  const oir = (r) => {
    if (/\/api\/conductor\/turno\b/.test(r.url())) pedidos.push({ metodo: r.method(), cuerpo: r.postData(), t: Date.now() });
  };
  pa.on('request', oir);
  // Lo que manda la app ya no llega a la central (el socket sigue abierto: ping y pong andan) y el plugin no tiene red.
  await pa.evaluate(() => {
    for (const w of window.__wsBus || []) if (w.readyState === 1) w.send = () => {};
  });
  telA.sinRed = true;
  const t0 = Date.now();
  await pa.click('[data-conectar]');
  await debe(hasta(async () => (await pildora(pa)).checked === 'false', 8000), 'A toca la píldora: «Fuera de turno»');
  ok(!telA.plugin.activo, 'A: el plugin se detuvo (su «fin» se perdió: sin red)');
  const rest = await hasta(() => pedidos.find((x) => x.metodo === 'POST'), 15000, 100);
  ok(Boolean(rest), `A: la central no confirmó por el bus y la app lo dijo por REST (${rest ? `POST /api/conductor/turno a los ${s(rest.t - t0)}: ${rest.cuerpo}` : 'no lo dijo'})`);
  pa.off('request', oir);
  telA.sinRed = false;
  // El pasajero vuelve a abrir su app: la central le manda los taxis en turno.
  await pp.reload();
  await vista(pp, 'inicio', 30000);
  await pp.waitForSelector('[data-conexion][data-estado="en_linea"]', { timeout: 15000 });
  await espera(4000);
  const loVe = await taxiEnMapa(pp, CA.movil);
  ok(!loVe, `pasajero que vuelve a abrir su app: A no está (${loVe ? 'SÍ lo ve: la central lo sigue creyendo en turno' : 'bien'})`);
  await fotoPasajero('f2-pasajero-tras-recargar');
  // A recarga su app (bus nuevo).
  await pa.reload();
  await pa.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 });
  ok((await pildora(pa)).checked === 'false', 'A recarga: sigue «Fuera de turno»');
}

/* ---- F3: vuelve a ponerse en turno: todo como siempre ---- */
async function f3VuelveATurno() {
  console.log('\n— F3: vuelve a ponerse en turno —');
  await aEnTurnoOtraVez();
  const pil = await pildora(pa);
  ok(pil.titulo === 'En turno', `A: la píldora dice «${pil.titulo}»`);
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 15000), 'pasajero: ve a A');
  await minimizarA();
  await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
  await moverSoloPlugin({ lat: POS_CERCA.lat + 0.001, lng: POS_CERCA.lng });
  const env = await hasta(() => telA.envios.at(-1)?.estado && telA.envios.at(-1), 5000, 100);
  ok(env?.respuesta?.seguir === true && env.respuesta.visible === true, `A minimizado: el POST del plugin vale otra vez (${JSON.stringify(env?.respuesta)})`);
  await debe(hasta(() => taxiEnMapa(pp, CA.movil), 8000), 'pasajero: ve a A minimizado en turno');
  await fotoPasajero('f3-pasajero-ve-a-en-turno');
  await visibilidad(pa, false, telA);
  await debe(hasta(() => enTurnoWeb(pa), 10000), 'A vuelve a la app: sigue en turno');
}

/* ---- F4: textos, aviso de conexión y el taxi propio ---- */
async function f4Textos() {
  console.log('\n— F4: textos y el taxi propio —');
  await hasta(() => enTurnoWeb(pa), 5000);
  await espera(1500);
  let pil = await pildora(pa);
  let chip = await chipConexion(pa);
  let taxi = await taxiPropio(pa);
  ok(pil.titulo === 'En turno' && /en turno/i.test(pil.aria), `en turno: «${pil.titulo}» · ${pil.aria}`);
  ok(chip && !chip.visible, `en turno y en línea: el aviso de conexión de arriba no se ve (${JSON.stringify(chip)})`);
  ok(taxi && taxi.color.toUpperCase() === '#FFC107' && !/fuera de turno/.test(taxi.etiqueta), `en turno: el taxi propio amarillo (${JSON.stringify(taxi)})`);
  await foto(pa, 'f4-en-turno');
  await pa.click('[data-conectar]');
  await debe(hasta(async () => (await pildora(pa)).checked === 'false', 8000), 'A sale de turno');
  await espera(800);
  pil = await pildora(pa);
  taxi = await taxiPropio(pa);
  ok(pil.titulo === 'Fuera de turno' && /fuera de turno/i.test(pil.aria), `fuera de turno: «${pil.titulo}» · ${pil.aria}`);
  ok(taxi && taxi.color.toUpperCase() !== '#FFC107' && taxi.etiqueta === 'Tú · fuera de turno', `fuera de turno: el taxi propio gris con «Tú · fuera de turno» (${JSON.stringify(taxi)})`);
  await foto(pa, 'f4-fuera-de-turno');
  // Sin red: el WebSocket se cae y no se puede volver a abrir.
  await ctxA.setOffline(true);
  await pa.evaluate(() => {
    for (const w of window.__wsBus || []) if (w.readyState <= 1) w.close();
  });
  const conProblema = await hasta(async () => {
    const c = await chipConexion(pa);
    return c?.visible && /Sin conexión|Conectando|reintentando/i.test(c.texto) ? c : null;
  }, 15000, 200);
  ok(Boolean(conProblema), `sin red: el aviso de conexión de arriba aparece (${JSON.stringify(conProblema || (await chipConexion(pa)))})`);
  await foto(pa, 'f4-sin-conexion');
  await ctxA.setOffline(false);
  const vuelve = await hasta(async () => {
    const c = await chipConexion(pa);
    return c && !c.visible;
  }, 20000, 200);
  ok(Boolean(vuelve), 'vuelve la red: el aviso se va');
}

try {
  await preparar();
  await aEnTurno();
  await pasajeroLoVe();
  for (const [nombre, fn] of [['F1', f1WebPierdeElPlugin], ['F2', f2BusMedioCaido], ['F3', f3VuelveATurno], ['F4', f4Textos]]) {
    if (process.argv.includes('--solo') && !process.argv.includes(`--${nombre}`)) continue;
    try {
      await fn();
    } catch (e) {
      if (!(e instanceof Detener)) throw e;
      console.log(`   (${nombre} se detuvo: ${e.message})`);
      telA.sinRed = false;
      await ctxA.setOffline(false).catch(() => {});
      await pa.reload().catch(() => {});
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
  console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'} · fuera de turno de verdad (servidor ${BASE}) · ${bien} ✔ · ${fallas} ✘ · capturas en ${DIR}`);
  process.exit(fallas ? 1 : 0);
}
