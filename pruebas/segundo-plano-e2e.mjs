// Integración de punta a punta de la ubicación en turno con la app minimizada (entrega 2 de la
// 1.2): el servidor 0.4.0 (rama segundo-plano) con PUSH_SIMULADO y tiempos acortados, la web de
// la rama segundo-plano por el proxy de mismo origen, y la app del conductor 1.2 con el plugin
// propio «UbicacionTurno» SIMULADO EN NODE como el nativo: las mismas reglas de
// herramientas/nativo/ReglasTurno.java y UbicacionTurno.swift (taxicun-app), el mismo contrato con
// la web (iniciar, cambiarModo, detener, estado y el evento «detenido» con { motivo, origen }) y
// POST REALES a /api/conductor/ubicacion con el token de la sesión y el User-Agent nativo. La web
// llama al plugin por una puente de Playwright (exposeBinding); nada de /api se simula.
//
// Recorre:
//  1) Conductor A (iPhone 1.2 con el plugin y avisos) se pone en turno: «Te avisamos…» y «Tu
//     ubicación mientras estás conectado» → iniciar({ url: …/api/conductor/ubicacion, token de la
//     sesión, modo libre, libre }); presencia con segundoPlano: true; al frente el plugin lee pero
//     no envía.
//  2) El pasajero (iPhone 1.2) lo ve en el mapa.
//  3) A minimiza: el bus se cierra, el plugin envía enseguida y luego al moverse (≥ 50 m); la
//     central lo deja dormido CON GPS (plazo TURNO_GPS_MIN) y el pasajero lo ve moverse, sin
//     parpadeo.
//  4) El pasajero pide: a A le llega «Nuevo servicio» por push; lo toca (la app vuelve al frente),
//     ve la oferta y acepta → el plugin pasa a modo viaje.
//  5) A minimiza en viaje (Waze): el bus se cierra también en viaje; cada POST le llega al pasajero
//     como ubicacion con el etaMin del servidor; el pasajero ve acercarse el taxi y bajar el
//     tiempo; viaje_actual trae la posición del plugin (posGps).
//  6) Vuelve, llega, código, en viaje (minimiza otra vez: etaMin hacia el destino), termina, cobro
//     y calificación → modo libre.
//  7) Otro servicio aceptado; A minimiza y el pasajero cancela: push de la cancelación y la
//     respuesta del siguiente POST trae modo libre (vuelve al mapa como dormido con GPS).
//  8) Latido quieto: minimizado y sin moverse más que TURNO_GPS_OCULTAR_S y TURNO_GPS_MIN: los
//     latidos lo mantienen en el mapa y en turno.
//  9) Sin señal: a los TURNO_GPS_OCULTAR_S sale del mapa (sigue recibiendo servicios por push); a
//     los TURNO_GPS_MIN sale del turno con «Tu turno quedó en pausa». Vuelve la señal.
// 10) A mata la app (willTerminate → fin app_cerrada): sale ya del mapa y del turno, sin la pausa;
//     al abrirla otra vez arranca fuera de turno.
// 11) Conductor B (Android 1.2 con Firebase y el plugin): «Salir de turno» en la notificación fija
//     → fin turno_apagado, sale del mapa, «Te desconectaste desde la notificación.»; luego se
//     conecta otra vez y mata la app (onTaskRemoved → fin app_cerrada).
//
// Servidor (árbol de la rama segundo-plano) con los tiempos acortados (ver
// /tmp/cootrans/sp/integracion/arrancar.sh corto):
//   TURNO_GPS_MIN=0.6 TURNO_GPS_OCULTAR_S=15 PRESENCIA_SEGUNDO_PLANO_S=3 PUSH_SIMULADO=<avisos.jsonl>
//   CUENTAS_PRUEBA="pasajero@prueba.taxicun.com:246810,conductor@prueba.taxicun.com:135790,conductor2@prueba.taxicun.com:975310" …
// Proxy:  node pruebas/servidor-local.mjs --puerto=8971 --api=http://127.0.0.1:3971
// Prueba: AVISOS_PUSH=<el mismo .jsonl> DATABASE_URL=… SERVIDOR_TAXICUN=<árbol del servidor> \
//         TURNO_GPS_MIN=0.6 TURNO_GPS_OCULTAR_S=15 PRESENCIA_SEGUNDO_PLANO_S=3 \
//         node pruebas/segundo-plano-e2e.mjs http://localhost:8971/
// Se puede repetir sin reiniciar nada: borra y vuelve a crear las cuentas de prueba.
// --solo-android: solo la parte de B (11), ~20 s.
import { chromium } from '/tmp/cootrans/npm/node_modules/playwright-core/index.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://localhost:8971/').replace(/\/?$/, '/');
const EXE = process.env.CHROMIUM || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIR = (process.env.CAPTURAS || '/tmp/cootrans/capturas/segundo-plano-e2e').replace(/\/?$/, '/');
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

  // Android: botón «Salir de turno» de la notificación fija.
  salirDesdeNotificacion() {
    this.parar('turno_apagado', true, 'notificacion');
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
  await debe(salud.estado === 200 && /^0\.[45]\./.test(salud.datos?.version || ''), `servidor 0.4 o 0.5 (segundo plano) por el proxy (${salud.datos?.version || salud.estado})`);
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
  await foto(pp, 'p01-ve-a-con-la-app-abierta');
}

/* ------------------------------------------------------------------ */
/* 3) A minimiza: dormido con GPS, se mueve y el pasajero lo ve          */
/* ------------------------------------------------------------------ */
async function aMinimizaLibre() {
  const t0 = Date.now();
  const n0 = telA.envios.length;
  const sockets0 = telA.sockets.length;
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), `A minimiza: la web cierra el WebSocket (${s(Date.now() - t0)})`);
  const primero = await hasta(() => telA.envios[n0]?.estado && telA.envios[n0], 5000, 100);
  await debe(primero, 'A: el plugin envía enseguida al pasar a segundo plano');
  ok(primero.motivo === 'latido' && primero.cuerpo.plataforma === 'ios' && typeof primero.cuerpo.precision === 'number' && primero.cuerpo.rumbo === null && !('fin' in primero.cuerpo),
    `A: POST { motivo: latido, plataforma: ios, precision, rumbo: null, sin fin } (${primero.t - t0} ms después de minimizar)`);
  ok(primero.estado === 200 && primero.respuesta?.seguir === true && primero.respuesta?.modo === 'libre' && primero.respuesta?.visible === true,
    `A: la central responde 200 { seguir: true, modo: libre, visible: true } (${primero.estado} ${JSON.stringify(primero.respuesta)})`);
  await debe(hasta(() => dormido(CA.correo) && conGps(CA.correo), 5000), 'central: A queda en turno en segundo plano CON GPS (turnos_dormidos.visto_gps)');
  await espera(1500);
  ok(!ocultadoDesde(idA, t0 - 500), 'pasajero: al minimizar A no le llega disponible:false (el taxi no parpadea)');
  ok(Boolean(await taxiEnMapa(pp, CA.movil)), 'pasajero: A sigue en el mapa');

  // A maneja hacia el pasajero: 3 tramos de ~160 m (cada uno cambia la celda de ~110 m del mapa).
  let antes = await taxiEnMapa(pp, CA.movil);
  const movimientos = [];
  for (let i = 1; i <= 3; i += 1) {
    await esperarPausa(telA, REGLAS.PAUSA_LIBRE_MS + 100);
    const n = telA.envios.length;
    const tp = Date.now();
    await telA.mover({ lat: POS_A0.lat - 0.00145 * i, lng: POS_A0.lng });
    const env = await hasta(() => telA.envios.slice(n).find((x) => x.motivo === 'movimiento' && x.estado), 4000, 100);
    const pres = await hasta(() => presenciasDe(idA, tp).find((m) => m.datos.disponible), 5000, 100);
    const ahora = await hasta(async () => {
      const t = await taxiEnMapa(pp, CA.movil);
      return t && antes && (t.x !== antes.x || t.y !== antes.y) ? t : null;
    }, 5000, 150);
    movimientos.push(Boolean(env && env.estado === 200 && env.respuesta?.visible && pres && ahora));
    if (ahora) antes = ahora;
  }
  ok(movimientos.every(Boolean), `A se mueve (≥ 50 m, ≥ ${REGLAS.PAUSA_LIBRE_MS / 1000} s): un POST «movimiento» por tramo, el pasajero recibe la presencia nueva y el taxi se mueve en su mapa (${movimientos.map((x) => (x ? 'sí' : 'no')).join(', ')})`);
  ok(telA.sockets.length === sockets0 && !telA.busAbierto(), 'A: minimizada, la web no vuelve a abrir el bus ni manda nada por él');
  ok(!ocultadoDesde(idA, t0 - 500), 'pasajero: en todo este rato, ningún disponible:false de A');
  await foto(pp, 'p02-a-minimizado-en-el-mapa');
}

/* ------------------------------------------------------------------ */
/* 4) El pasajero pide: push a A, lo toca y acepta                       */
/* ------------------------------------------------------------------ */
let viajeId = null;
async function servicioPorPush() {
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), `pasajero: pide un taxi a ${DESTINO.nombre}`);
  await debe(pp.waitForSelector('.a-modal-nativa .a-modal h2:has-text("¿Te avisamos cuando llegue tu taxi?")', { timeout: 8000 }), 'pasajero: «¿Te avisamos cuando llegue tu taxi?»');
  await tocarModal(pp, 'Sí, avisarme');
  const sol = await hasta(() => avisosDesde(marca).find((l) => l.app === 'conductor' && l.datos?.tipo === 'solicitud'), 8000);
  await debe(sol, `central → A (minimizado, dormido con GPS): «Nuevo servicio»${sol ? ` (${resumenAviso(sol)})` : ''}`);
  ok(sol.token === tA && sol.apns?.cuerpo?.aps?.['interruption-level'] === 'time-sensitive', 'push: al iPhone de A, time-sensitive');
  viajeId = sol.datos.viajeId;
  // Toca la notificación: la app (viva) vuelve al frente.
  const nEnvios = telA.envios.length;
  const t0 = Date.now();
  await visibilidad(pa, false, telA);
  await pa.evaluate((n) => window.__tocarNotificacion(n), notificacionIos(sol));
  await debe(pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), `A: toca «Nuevo servicio» → vuelve a la app y ve la oferta (${s(Date.now() - t0)})`);
  ok(telA.busAbierto(), 'A: al volver, la web reabre el bus');
  await debe(hasta(() => !dormido(CA.correo), 5000), 'central: A ya no está dormido (volvió a conectarse)');
  await pa.click('.a-solicitud [data-aceptar]');
  await debe(vista(pa, 'hacia_origen', 20000), 'A: acepta → «Recoge a Ana»');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: su taxi va en camino');
  await debe(hasta(() => telA.plugin.modo === 'viaje', 5000), 'A: con el viaje, la web pasa el plugin a modo viaje (cambiarModo)');
  ok(telA.plugin.llamadas.some(([a, o]) => a === 'cambiarModo' && o?.modo === 'viaje'), 'A: cambiarModo({ modo: viaje })');
  ok(telA.envios.slice(nEnvios).every((x) => !x.frente || x.fin) && telA.envios.length - nEnvios <= 1, `A: con la app al frente el plugin no envía (${telA.envios.length - nEnvios} POST desde que volvió)`);
}

/* ------------------------------------------------------------------ */
/* 5) A minimiza en viaje: el pasajero ve acercarse el taxi              */
/* ------------------------------------------------------------------ */
let origen = null;
let destino = null;
async function viajeMinimizado() {
  const v = await pa.evaluate(() => JSON.parse(localStorage.getItem('tc.real.viaje.conductor') || 'null')?.viaje || null);
  origen = v?.origen;
  destino = v?.destino;
  await debe(origen && destino, `A: el viaje tiene origen y destino (${origen?.titulo || '?'} → ${destino?.titulo || '?'})`);
  const t0 = Date.now();
  const n0 = telA.envios.length;
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), 'A minimiza en viaje (Waze): con el plugin activo la web cierra el bus también en viaje');
  const primero = await hasta(() => telA.envios[n0]?.estado && telA.envios[n0], 5000, 100);
  ok(primero && primero.cuerpo.modo === 'viaje' && primero.respuesta?.modo === 'viaje' && primero.respuesta?.seguir === true, `A: POST enseguida en modo viaje; la central responde modo viaje (${JSON.stringify(primero?.respuesta)})`);
  ok(dormido(CA.correo) === false, 'central: con un viaje no queda dormido');
  // Se acerca al punto en 4 tramos (POST «movimiento» cada ≥ 3 s y ≥ 10 m).
  const desde = telA.pos;
  const etasFrame = [];
  const etasPantalla = [];
  const puntos = [];
  for (const f of [0.3, 0.55, 0.8, 0.93]) {
    await esperarPausa(telA, REGLAS.PAUSA_VIAJE_MS + 100);
    const n = telA.envios.length;
    const tp = Date.now();
    const pos = entre(desde, origen, f);
    await telA.mover(pos);
    const env = await hasta(() => telA.envios.slice(n).find((x) => x.estado), 4000, 100);
    const u = await hasta(() => ubicacionesDesde(tp).find((m) => m.datos?.viajeId === viajeId), 5000, 100);
    await pp.waitForTimeout(500);
    etasFrame.push(u ? { eta: u.datos.etaMin, esperado: etaFormula(env?.cuerpo || pos, origen), de: u.de, cid: u.datos.conductorId } : null);
    etasPantalla.push(await texto(pp, '[data-eta-num]'));
    puntos.push(await taxiDestacado(pp));
  }
  ok(etasFrame.every(Boolean), `pasajero: cada POST le llega como ubicacion de su viaje (${etasFrame.filter(Boolean).length} de 4)`);
  ok(etasFrame.every((x) => x && x.cid === idA && x.de === idA), 'pasajero: con el seudónimo de A (conductorId y de)');
  ok(etasFrame.every((x) => x && Math.abs(x.eta - x.esperado) <= 0.11), `pasajero: etaMin calculado por la central con la fórmula de la app, hacia el origen (${etasFrame.map((x) => x && `${x.eta}≈${x.esperado}`).join(', ')})`);
  ok(etasFrame.every((x, i) => i === 0 || (x && etasFrame[i - 1] && x.eta < etasFrame[i - 1].eta)), 'pasajero: el tiempo baja a medida que el taxi se acerca');
  const nums = etasPantalla.map(Number);
  ok(nums.every((x) => x >= 1) && nums[0] > nums[nums.length - 1], `pasajero: en pantalla «llega en» baja (${etasPantalla.join(' → ')} min)`);
  ok(puntos.every(Boolean) && new Set(puntos.map((p) => `${p.x},${p.y}`)).size === puntos.length, `pasajero: el taxi asignado se mueve en su mapa (${puntos.map((p) => p && `${p.x},${p.y}`).join(' → ')})`);
  const delPlugin = telA.envios.slice(n0).filter((x) => x.estado === 200).map((x) => x.cuerpo);
  const llegadas = ubicacionesDesde(t0 + 800).filter((m) => m.datos?.viajeId === viajeId);
  ok(llegadas.length >= 4 && llegadas.every((u) => delPlugin.some((c) => metros(c, u.datos.pos) < 1)),
    `pasajero: solo le llegan las ubicaciones del plugin; la web minimizada no manda ninguna (${llegadas.length} ubicaciones, ${delPlugin.length} POST)`);
  await foto(pp, 'p03-taxi-acercandose');
  // viaje_actual (p. ej. al reconectarse) trae la posición del plugin: el pasajero abre el bus otra vez.
  const ultima = telA.envios.filter((x) => x.estado === 200).pop().cuerpo;
  const va = await viajeActualPasajero();
  ok(va && va.viajeId === viajeId && va.pos && metros(va.pos, ultima) < 1, `central: viaje_actual del pasajero trae la última posición del plugin (posGps: ${va?.pos ? `${metros(va.pos, ultima).toFixed(1)} m` : 'sin pos'})`);
}
// Un bus aparte con la sesión del pasajero (como al reconectarse): devuelve los datos de viaje_actual.
async function viajeActualPasajero() {
  const { default: WebSocket } = await import(`${SERVIDOR}/node_modules/ws/wrapper.mjs`);
  const token = await ls(pp, 'taxicun.token');
  return new Promise((resolver) => {
    const ws = new WebSocket(`${BASE.replace(/^http/, 'ws')}api/bus`);
    const fin = setTimeout(() => {
      ws.terminate();
      resolver(null);
    }, 8000);
    ws.on('open', () => ws.send(JSON.stringify({ tipo: 'hola', datos: { token, rol: 'pasajero', empresa: 'cootransrural' } })));
    ws.on('message', (d) => {
      const m = JSON.parse(String(d));
      if (m.tipo !== 'viaje_actual') return;
      clearTimeout(fin);
      ws.close();
      resolver(m.datos);
    });
    ws.on('error', () => resolver(null));
  });
}

/* ------------------------------------------------------------------ */
/* 6) Vuelve, llega, viaje (minimizado otra vez), termina y cobra        */
/* ------------------------------------------------------------------ */
async function terminarViaje() {
  const n0 = telA.envios.length;
  await telA.mover({ lat: origen.lat, lng: origen.lng });
  await visibilidad(pa, false, telA);
  await debe(hasta(() => telA.busAbierto(), 8000), 'A vuelve a la app: el bus se reabre');
  await debe(pa.waitForSelector('[data-llegue].a-resaltar', { timeout: 20000 }), 'A: en el punto se resalta «Llegué»');
  await pa.click('[data-llegue]');
  await debe(vista(pa, 'en_origen', 10000), 'A: «Llegué» → pide el código');
  await debe(vista(pp, 'llego', 15000), 'pasajero: «llegó» y ve el código');
  const codigo = await pp.getAttribute('[data-codigo]', 'data-codigo').catch(() => null);
  await escribirCodigo(pa, '.a-codigo-c .a-casillas', codigo);
  await debe(vista(pa, 'en_viaje', 10000), 'A: con el código arranca el viaje');
  ok(telA.envios.slice(n0).every((x) => !x.frente), 'A: con la app al frente el plugin no envió nada');
  // En viaje minimiza otra vez: el etaMin va ahora hacia el destino.
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), 'A minimiza en viaje (en_viaje): el bus se cierra');
  const etas = [];
  for (const f of [0.35, 0.7]) {
    await esperarPausa(telA, REGLAS.PAUSA_VIAJE_MS + 100);
    const tp = Date.now();
    const pos = entre(origen, destino, f);
    await telA.mover(pos);
    const u = await hasta(() => ubicacionesDesde(tp).find((m) => m.datos?.viajeId === viajeId), 5000, 100);
    etas.push(u ? { eta: u.datos.etaMin, esperado: etaFormula(u.datos.pos, destino) } : null);
  }
  ok(etas.every((x) => x && Math.abs(x.eta - x.esperado) <= 0.11) && etas[1].eta < etas[0].eta, `pasajero: en viaje el etaMin de la central va hacia el destino y baja (${etas.map((x) => x && `${x.eta}≈${x.esperado}`).join(', ')})`);
  // Vuelve, llega al destino y termina.
  await telA.mover({ lat: destino.lat, lng: destino.lng });
  await visibilidad(pa, false, telA);
  await debe(pa.waitForSelector('[data-terminar].a-resaltar', { timeout: 20000 }), 'A: de vuelta en la app, en el destino se resalta «Terminar viaje»');
  await pa.click('[data-terminar]');
  await debe(pa.waitForSelector('.a-modal input[name=valor]', { timeout: 5000 }), 'A: confirma el valor');
  await tocarModal(pa, 'Terminar y cobrar');
  await debe(vista(pa, 'cobrando', 10000), 'A: termina → cobro');
  await debe(vista(pp, 'pagar', 15000), 'pasajero: pagar');
  await pp.click('[data-efectivo]');
  await tocarModal(pp, 'Sí, ya pagué');
  await debe(pa.waitForSelector('[data-pago-anunciado]:not([hidden])', { timeout: 10000 }), 'A: «El pasajero dice que ya te pagó»');
  await pa.click('[data-efectivo]');
  await tocarModal(pa, 'Sí, recibí el pago');
  await pp.click('.a-estrellas [data-n="5"]');
  await pp.click('[data-enviar]');
  await debe(vista(pp, 'inicio', 10000), 'pasajero: califica y vuelve al inicio');
  await pa.click('.a-estrellas [data-n="5"]');
  await pa.click('[data-enviar]');
  await debe(vista(pa, 'libre', 10000), 'A: califica y queda libre, en turno');
  await debe(hasta(() => telA.plugin.modo === 'libre' && telA.plugin.activo, 5000), 'A: el plugin vuelve a modo libre (sigue activo: está en turno)');
  ok(sql(`select estado from viajes where id = ${cita(viajeId)}`) === 'finalizado', 'central: viaje finalizado');
  await foto(pa, 'a03-libre-tras-el-viaje');
}

/* ------------------------------------------------------------------ */
/* 7) Cancelación del pasajero con A minimizado en viaje                 */
/* ------------------------------------------------------------------ */
async function cancelaConLaAppMinimizada() {
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, SEGUNDO), `pasajero: pide otro taxi (${SEGUNDO.nombre})`);
  await debe(pa.waitForSelector('.a-solicitud.a-abierta', { timeout: 20000 }), 'A (al frente): le llega la oferta por el bus');
  await pa.click('.a-solicitud [data-aceptar]');
  await debe(vista(pa, 'hacia_origen', 20000), 'A: acepta');
  await debe(vista(pp, 'asignado', 15000), 'pasajero: asignado');
  await debe(hasta(() => telA.plugin.modo === 'viaje', 5000), 'A: plugin en modo viaje');
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), 'A minimiza con el servicio asignado: el bus se cierra');
  await espera(1000);
  const t0 = Date.now();
  await debe(cancelarPasajero(pp), 'pasajero: cancela el servicio');
  const can = await hasta(() => avisosDesde(marca).find((l) => l.app === 'conductor' && l.token === tA && l.datos?.tipo === 'cancelacion'), 8000);
  await debe(can, `central → A (minimizado): la cancelación por push${can ? ` (${resumenAviso(can)})` : ''}`);
  const n = telA.envios.length;
  await esperarPausa(telA, REGLAS.PAUSA_VIAJE_MS + 100);
  await telA.mover({ lat: telA.pos.lat + 0.0003, lng: telA.pos.lng }); // ~33 m: en viaje se envía
  const env = await hasta(() => telA.envios.slice(n).find((x) => x.estado), 5000, 100);
  ok(env && env.cuerpo.modo === 'viaje' && env.respuesta?.modo === 'libre' && env.respuesta?.visible === true, `A: el siguiente POST (aún en modo viaje) responde modo libre y visible (${JSON.stringify(env?.respuesta)})`);
  ok(telA.plugin.modo === 'libre', 'A: el plugin baja a modo libre con esa respuesta');
  await debe(hasta(() => dormido(CA.correo) && conGps(CA.correo), 5000), 'central: A vuelve a quedar en turno en segundo plano con GPS');
  ok(Boolean(await hasta(() => presenciasDe(idA, t0).find((m) => m.datos.disponible), 6000)) && Boolean(await hasta(() => taxiEnMapa(pp, CA.movil), 6000)), 'pasajero: A vuelve a aparecer en su mapa, libre');
  await visibilidad(pa, false, telA);
  await debe(vista(pa, 'libre', 15000), 'A vuelve a la app: libre (ya sin el servicio cancelado)');
  ok((await pa.getAttribute('[data-conectar]', 'aria-checked')) === 'true' && telA.plugin.activo && telA.plugin.modo === 'libre', 'A: sigue en turno, plugin activo en modo libre');
}

/* ------------------------------------------------------------------ */
/* 8) Latido quieto                                                     */
/* ------------------------------------------------------------------ */
async function latidoQuieto() {
  await espera(1500);
  const t0 = Date.now();
  const n0 = telA.envios.length;
  await visibilidad(pa, true, telA);
  await debe(hasta(() => !telA.busAbierto(), 6000, 100), 'A minimiza libre otra vez');
  const largo = Math.max(OCULTAR_S, PLAZO_GPS_S) * 1000 + 8000;
  // Quieto: en iPhone no llegan lecturas (filtro de 50 m); solo el reloj del latido.
  await espera(largo);
  const env = telA.envios.slice(n0);
  const latidos = env.filter((x) => x.motivo === 'latido');
  ok(env.length >= 4 && latidos.length === env.length, `A quieto ${s(largo)}: solo latidos (${latidos.length} POST, cada ~${REGLAS.RELOJ_MS / 1000} s)`);
  ok(env.every((x) => x.estado === 200 && x.respuesta?.visible === true), 'A: todos con 200 y visible');
  const conHoraNueva = latidos.filter((x) => x.cuerpo.ts >= x.t - 50);
  ok(conHoraNueva.length >= 2 && latidos[latidos.length - 1].cuerpo.ts >= latidos[latidos.length - 1].t - 50, `A: con la lectura vieja (> ${REGLAS.LECTURA_VIEJA_MS / 1000} s), el latido viaja con la hora actual (${conHoraNueva.length} de ${latidos.length})`);
  // (El plazo vive en memoria; la base lo guarda como mucho cada 60 s, solo para un reinicio.)
  ok(dormido(CA.correo), `central: más de TURNO_GPS_OCULTAR_S (${OCULTAR_S} s) y de TURNO_GPS_MIN (${PLAZO_GPS_S} s) después, A sigue en turno: cada latido renueva el plazo`);
  ok(!ocultadoDesde(idA, t0) && Boolean(await taxiEnMapa(pp, CA.movil)), 'pasajero: A sigue en el mapa todo el rato (sin disponible:false)');
  ok(pausasDe(tA).length === 0, 'central: sin «Tu turno quedó en pausa»');
  const veces = presenciasDe(idA, t0).length;
  ok(veces >= Math.floor(largo / 10000) - 1, `pasajero: la central le repite la presencia de A mientras está quieto (${veces} en ${s(largo)})`);
  await foto(pp, 'p04-a-quieto-sigue-en-el-mapa');
}

/* ------------------------------------------------------------------ */
/* 9) Sin señal: sale del mapa y luego del turno                         */
/* ------------------------------------------------------------------ */
async function sinSenal() {
  telA.sinRed = true;
  const ultimo = telA.envios.filter((x) => x.estado === 200).pop().t;
  const t0 = Date.now();
  const oculto = await hasta(() => presenciasDe(idA, t0).find((m) => !m.datos.disponible), (OCULTAR_S + PRESENCIA_S + 8) * 1000, 200);
  await debe(oculto, `sin señal: a los ~TURNO_GPS_OCULTAR_S la central saca a A del mapa (disponible:false a los ${oculto ? s(oculto.t - ultimo) : '?'} del último POST; ${OCULTAR_S} s)`);
  ok(oculto.t - ultimo >= OCULTAR_S * 1000 - 500 && oculto.t - ultimo < 30000, 'sin señal: lo saca la central (antes de los 30 s en que el pasajero borraría la presencia por su cuenta)');
  ok(await hasta(async () => !(await taxiEnMapa(pp, CA.movil)), 3000), 'pasajero: el taxi de A desaparece del mapa');
  ok(dormido(CA.correo), 'central: fuera del mapa, A sigue en turno en segundo plano');
  // Sigue recibiendo servicios por push (con la última posición).
  const marca = leerAvisos().length;
  await debe(pedirTaxi(pp, DESTINO), 'pasajero: pide un taxi (no ve ninguno en el mapa)');
  const sol = await hasta(() => avisosDesde(marca).find((l) => l.app === 'conductor' && l.datos?.tipo === 'solicitud'), 8000);
  ok(sol && sol.token === tA, `central → A (fuera del mapa): «Nuevo servicio» por push${sol ? ` (${resumenAviso(sol)})` : ''}`);
  await debe(cancelarPasajero(pp), 'pasajero: cancela la búsqueda');
  // A los TURNO_GPS_MIN sin ubicaciones: fuera de turno y «Tu turno quedó en pausa».
  const pausa = await hasta(() => pausasDe(tA)[0], (PLAZO_GPS_S + REVISION_S + 10) * 1000 - (Date.now() - ultimo), 300);
  await debe(pausa, `sin señal: a los ~TURNO_GPS_MIN la central lo saca del turno y le avisa «${pausa?.titulo || '?'}» (a los ${pausa ? s(Date.parse(pausa.fecha) - ultimo) : '?'} del último POST; ${PLAZO_GPS_S} s + revisión cada ${REVISION_S} s)`);
  ok(Date.parse(pausa.fecha) - ultimo >= PLAZO_GPS_S * 1000 - 1000, 'sin señal: no antes de TURNO_GPS_MIN');
  ok(!dormido(CA.correo), 'central: A ya no está en turno');
  ok(telA.plugin.activo && telA.envios.slice(-3).every((x) => x.perdido), 'A: mientras tanto el plugin seguía (los POST se perdían, sin cola)');
  await foto(pp, 'p05-a-fuera-del-mapa');
  // Vuelve la señal: el siguiente POST lo pone otra vez en turno con GPS (contrato §6, punto 5).
  const n = telA.envios.length;
  telA.sinRed = false;
  const env = await hasta(() => telA.envios.slice(n).find((x) => x.estado), (REGLAS.RELOJ_MS + 3000), 200);
  ok(env && env.estado === 200 && env.respuesta?.visible === true, `vuelve la señal: el siguiente latido lo pone otra vez en turno con GPS (contrato §6, punto 5: ${JSON.stringify(env?.respuesta)})`);
  ok(await hasta(() => dormido(CA.correo), 4000), 'central: A otra vez en turno en segundo plano');
  ok(Boolean(await hasta(() => taxiEnMapa(pp, CA.movil), 6000)), 'pasajero: A vuelve a aparecer en su mapa');
}

/* ------------------------------------------------------------------ */
/* 10) A mata la app                                                     */
/* ------------------------------------------------------------------ */
let finA = 0;
async function aMataLaApp() {
  const t0 = Date.now();
  const r = await telA.plugin.matarApp();
  finA = Date.now();
  const fin = telA.envios.filter((x) => x.fin).pop();
  ok(fin && fin.cuerpo.fin === 'app_cerrada' && fin.cuerpo.motivo === 'fin', `A desliza la app: willTerminate manda { motivo: fin, fin: app_cerrada } (${fin ? s(fin.t - t0) : '—'})`);
  ok(fin?.estado === 200 && r?.seguir === false, `central: responde { seguir: false } (${JSON.stringify(r)})`);
  await pa.close();
  telA.nuevoProceso();
  ok(!dormido(CA.correo), 'central: A sale del turno ya');
  const oculto = await hasta(() => presenciasDe(idA, t0).find((m) => !m.datos.disponible), 4000, 100);
  ok(oculto && oculto.t - t0 < 3000, `pasajero: A sale del mapa enseguida (disponible:false a los ${oculto ? s(oculto.t - t0) : '?'})`);
  ok(await hasta(async () => !(await taxiEnMapa(pp, CA.movil)), 3000), 'pasajero: el taxi de A ya no está en el mapa');
  // La abre otra vez (otro proceso: el plugin no sigue): arranca fuera de turno, sin avisos.
  pa = await abrirApp(ctxA, 'conductor A', 'taxicun/conductor/', { tel: telA });
  await debe(pa.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 }), 'A abre la app otra vez (con su sesión)');
  await pa.waitForTimeout(2000);
  ok((await pa.getAttribute('[data-conectar]', 'aria-checked')) !== 'true' && !telA.plugin.activo, 'A: arranca fuera de turno y el plugin no sigue');
  ok(!(await ls(pa, 'tc.turno.conductor')) || (await ls(pa, 'tc.turno.conductor')) === 'null', 'A: la web borró la marca tc.turno.conductor');
  ok(!(await avisosVistos(pa)).some((a) => /desconectaste|Sin permiso|14 horas/.test(a)), `A: sin avisos de parada (${(await avisosVistos(pa)).join(' | ') || 'ninguno'})`);
  await foto(pa, 'a04-reabre-fuera-de-turno');
}

/* ------------------------------------------------------------------ */
/* 11) B (Android): «Salir de turno» en la notificación y matar la app   */
/* ------------------------------------------------------------------ */
let finB = 0;
async function androidNotificacion() {
  ctxB = await contexto({ push: true, turno: true, plataforma: 'android', tokenPush: TOKEN_B }, { latitude: POS_B0.lat, longitude: POS_B0.lng, accuracy: 8 }, telB);
  pb = await abrirApp(ctxB, 'conductor B', 'taxicun/conductor/', { tel: telB });
  await debe(entrarConductor(pb, CB), 'B (Android 1.2 con Firebase y UbicacionTurno): entra con el código');
  await pb.click('[data-conectar]');
  await debe(pb.waitForSelector('.a-modal-nativa .a-modal h2:has-text("Que no se te pase ningún servicio")', { timeout: 8000 }), 'B: el aviso de las notificaciones');
  await tocarModal(pb, 'Activar avisos');
  await debe(pb.waitForSelector('.a-modal h2:has-text("Tu ubicación mientras estás conectado")', { timeout: 8000 }), 'B: «Tu ubicación mientras estás conectado»');
  const modal = await texto(pb, '.a-modal-segundo-plano');
  ok(/notificación fija «Estás en turno»/.test(modal) && /salir de turno/.test(modal) && !/indicador azul/.test(modal), 'B: en Android el aviso habla de la notificación fija «Estás en turno» y de salir desde ahí');
  await foto(pb, 'b01-aviso-android');
  await tocarModal(pb, 'Entendido');
  await debe(pb.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'B: en turno');
  await debe(hasta(() => dispositivosDe(CB.correo) === `conductor|android|${TOKEN_B}`, 8000), 'B: su Android quedó registrado para push (FCM)');
  await debe(hasta(() => telB.plugin.activo, 8000), 'B: plugin iniciado');
  await debe(hasta(() => telB.presenciasEnviadas().some((m) => m.datos?.disponible && m.datos?.segundoPlano === true), 10000), 'B: su presencia va con segundoPlano: true');
  const t0 = Date.now();
  await visibilidad(pb, true, telB);
  await debe(hasta(() => !telB.busAbierto(), 6000, 100), 'B minimiza: el bus se cierra');
  const primero = await hasta(() => telB.envios.find((x) => x.estado), 5000, 100);
  ok(primero && primero.cuerpo.plataforma === 'android' && !('precision' in primero.cuerpo) && primero.estado === 200 && primero.respuesta?.visible === true,
    `B: POST de Android (sin precision) → 200 visible (${JSON.stringify(primero?.respuesta)})`);
  await debe(hasta(() => dormido(CB.correo) && conGps(CB.correo), 5000), 'central: B en turno en segundo plano con GPS');
  idB = await hasta(() => idPorMovil(CB.movil), 8000);
  await debe(idB && (await hasta(() => taxiEnMapa(pp, CB.movil), 8000)), `pasajero: ve a B (Móvil 78) en el mapa (${idB})`);
  ok(!ocultadoDesde(idB, t0), 'pasajero: B no parpadeó al minimizar');
  // Lecturas del Fused cada pocos segundos: B se mueve y sigue enviando.
  await telB.mover({ lat: POS_B0.lat + 0.0012, lng: POS_B0.lng });
  ok(Boolean(await hasta(() => telB.envios.find((x) => x.motivo === 'movimiento' && x.estado === 200), 9000, 200)), 'B: se mueve y el servicio manda «movimiento»');
  await foto(pp, 'p06-ve-a-b');
  // «Salir de turno» en la notificación fija.
  const t1 = Date.now();
  telB.plugin.salirDesdeNotificacion();
  const fin = await hasta(async () => {
    const x = telB.envios.find((e) => e.fin);
    if (x && !x.estado) await telB.ultimoFin;
    return x?.estado ? x : null;
  }, 4000, 100);
  ok(fin && fin.cuerpo.fin === 'turno_apagado' && fin.cuerpo.motivo === 'fin' && fin.respuesta?.seguir === false, `B: «Salir de turno» → POST { fin: turno_apagado } → { seguir: false } (${JSON.stringify(fin?.respuesta)})`);
  ok(await hasta(() => !dormido(CB.correo), 3000), 'central: B sale del turno ya');
  const oculto = await hasta(() => presenciasDe(idB, t1).find((m) => !m.datos.disponible), 4000, 100);
  ok(oculto && oculto.t - t1 < 3000, `pasajero: B sale del mapa enseguida (${oculto ? s(oculto.t - t1) : '?'})`);
  ok(await hasta(async () => (await avisosVistos(pb)).some((a) => /Te desconectaste desde la notificación\./.test(a)), 5000), 'B: la web recibe «detenido» { turno_apagado, notificacion } y avisa «Te desconectaste desde la notificación.»');
  await visibilidad(pb, false, telB);
  await debe(hasta(async () => (await pb.getAttribute('[data-conectar]', 'aria-checked')) === 'false', 8000), 'B vuelve a la app: está fuera de turno');
  await debe(hasta(() => telB.busAbierto(), 8000), 'B: el bus se reabre');
  await pb.waitForTimeout(1500);
  ok(!telB.plugin.activo && !(await ls(pb, 'tc.turno.conductor')), 'B: el plugin no se reinicia y la marca ya no está');
  ok(!telB.presenciasEnviadas().some((m) => m.t > t1 && m.datos?.disponible), 'B: la web no vuelve a anunciarlo disponible');
  ok(!dormido(CB.correo), 'central: B sigue fuera de turno');
  await foto(pb, 'b02-salio-desde-la-notificacion');
}
async function androidMataLaApp() {
  const n0 = telB.plugin.llamadas.filter(([a]) => a === 'iniciar').length;
  await pb.click('[data-conectar]');
  await debe(pb.waitForSelector('[data-conectar][aria-checked="true"]', { timeout: 15000 }), 'B se conecta otra vez');
  ok(!(await pb.$('.a-modal')), 'B: sin volver a preguntar los avisos');
  const ti = Date.now();
  await debe(hasta(() => telB.plugin.activo && telB.plugin.llamadas.filter(([a]) => a === 'iniciar').length === n0 + 1, 8000), 'B: el plugin arranca otra vez');
  await debe(hasta(() => telB.presenciasEnviadas().some((m) => m.t >= ti && m.datos?.disponible && m.datos?.segundoPlano === true), 10000), 'B: la presencia vuelve a ir con segundoPlano: true');
  const n1 = telB.envios.length;
  const tm = Date.now();
  await visibilidad(pb, true, telB);
  const quedo = await hasta(() => dormido(CB.correo) && presenciasDe(idB, tm).every((m) => m.datos.disponible), 8000);
  if (!quedo) {
    console.log('DIAG B', JSON.stringify({
      envios: telB.envios.slice(n1).map((x) => ({ t: x.t - tm, motivo: x.motivo, estado: x.estado, r: x.respuesta })),
      bus: telB.sockets.map((x) => ({ cerrado: x.ws.isClosed(), ultimos: x.enviados.slice(-3).map((m) => ({ t: m.t - tm, tipo: m.tipo, datos: m.datos })) })),
      dormido: dormido(CB.correo),
      plugin: telB.plugin.estado(),
    }, null, 1));
  }
  await debe(quedo, 'B minimiza: en turno en segundo plano (sin parpadear en el mapa)');
  ok(Boolean(await hasta(() => taxiEnMapa(pp, CB.movil), 8000)), 'pasajero: ve a B otra vez');
  const t0 = Date.now();
  const r = await telB.plugin.matarApp(); // onTaskRemoved
  finB = Date.now();
  const fin = telB.envios.filter((x) => x.fin).pop();
  ok(fin && fin.cuerpo.fin === 'app_cerrada' && fin.cuerpo.plataforma === 'android' && r?.seguir === false, `B desliza la app: onTaskRemoved manda { fin: app_cerrada } → { seguir: false } (${JSON.stringify(r)})`);
  await pb.close();
  telB.nuevoProceso();
  ok(!dormido(CB.correo), 'central: B sale del turno ya');
  const oculto = await hasta(() => presenciasDe(idB, t0).find((m) => !m.datos.disponible), 4000, 100);
  ok(oculto && oculto.t - t0 < 3000, `pasajero: B sale del mapa enseguida (${oculto ? s(oculto.t - t0) : '?'})`);
  pb = await abrirApp(ctxB, 'conductor B', 'taxicun/conductor/', { tel: telB });
  await debe(pb.waitForSelector('[data-conectar]:not([disabled])', { timeout: 30000 }), 'B abre la app otra vez');
  await pb.waitForTimeout(2000);
  ok((await pb.getAttribute('[data-conectar]', 'aria-checked')) !== 'true' && !telB.plugin.activo, 'B: arranca fuera de turno, sin el plugin');
  ok(!(await avisosVistos(pb)).some((a) => /desconectaste/.test(a)), 'B: sin «Te desconectaste…» (cerró la app, no fue la notificación)');
}

/* ------------------------------------------------------------------ */
/* 12) Al final: nada de más                                            */
/* ------------------------------------------------------------------ */
async function alFinal() {
  // Ni A ni B (que salieron con fin) reciben la pausa: se espera a que habría vencido su plazo.
  const vence = Math.max(finA, finB) + (PLAZO_GPS_S + REVISION_S + 4) * 1000;
  if (Date.now() < vence) await espera(vence - Date.now());
  ok(pausasDe(tA).length === 1, `A: una sola «Tu turno quedó en pausa» (la de sin señal; matar la app no la manda) (${pausasDe(tA).length})`);
  ok(pausasDe(TOKEN_B).length === 0, 'B: ninguna «Tu turno quedó en pausa» (salió con la notificación y cerró la app)');
  ok(!dormido(CA.correo) && !dormido(CB.correo), 'central: nadie quedó en turno en segundo plano');
  const todos = [...telA.envios, ...telB.envios].filter((x) => !x.perdido);
  const malos = todos.filter((x) => x.estado !== 200);
  ok(todos.length > 20 && malos.length === 0, `todos los POST de ubicación respondieron 200 (${todos.length}; ${malos.map((x) => `${x.estado} ${JSON.stringify(x.respuesta)}`).join(' | ') || 'ninguno con error'})`);
  ok(todos.every((x) => !x.frente || x.fin), 'ningún POST con la app al frente (salvo el fin)');
}

const inicio = Date.now();
const SOLO_ANDROID = process.argv.includes('--solo-android');
try {
  await preparar();
  if (SOLO_ANDROID) {
    await abrirPasajero();
    await androidNotificacion();
    await androidMataLaApp();
    throw new Detener('--solo-android');
  }
  await aEnTurno();
  await pasajeroLoVe();
  await aMinimizaLibre();
  await servicioPorPush();
  await viajeMinimizado();
  await terminarViaje();
  await cancelaConLaAppMinimizada();
  await latidoQuieto();
  await sinSenal();
  await aMataLaApp();
  await androidNotificacion();
  await androidMataLaApp();
  await alFinal();
} catch (e) {
  if (!(e instanceof Detener)) {
    console.error(e);
    ok(false, `la prueba se cortó: ${e.message.split('\n')[0]}`);
  }
}
for (const t of [telA, telB]) t.plugin.morir();
ok(!errores.length, `sin errores de JavaScript${errores.length ? `: ${errores.slice(0, 6).join(' | ')}` : ''}`);
await b.close();
console.log(`${fallas ? 'FALLÓ' : 'PASÓ'} · segundo plano e2e (servidor ${BASE}, avisos en ${AVISOS}) · ${bien} ✔ · ${fallas} ✘ · ${Math.round((Date.now() - inicio) / 1000)} s · capturas en ${DIR}`);
process.exit(fallas ? 1 : 0);
