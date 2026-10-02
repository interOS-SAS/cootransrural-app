// Canal de mensajes entre pasajeros y conductores.
//  - BroadcastChannel: pestañas del mismo navegador (siempre disponible).
//  - MQTT por WebSocket a relés públicos: celulares distintos (demo en vivo).
// Cada mensaje lleva un uid y se descarta si llega repetido por otro camino.
// En MODO_REAL (app nativa o ?real=1 en TaxiCun) el canal es el servidor de TaxiCun:
// BusServidor, al final de este archivo. crearBus() escoge uno u otro.
import { RELES_MQTT, PREFIJO_TEMAS, SALA_POR_DEFECTO, ID_EMPRESA, urlDelSitio } from './config.js';
import { Emisor, uid } from './util.js';
import { MODO_REAL, URL_BUS } from './plataforma.js';
import * as servidor from './servidor.js';

let cargaMqtt = null;
function cargarMqtt() {
  if (window.mqtt) return Promise.resolve(window.mqtt);
  if (!cargaMqtt) {
    cargaMqtt = new Promise((resolver, rechazar) => {
      const s = document.createElement('script');
      s.src = urlDelSitio('vendor/mqtt.min.js');
      s.async = true;
      s.onload = () => (window.mqtt ? resolver(window.mqtt) : rechazar(new Error('mqtt no cargó')));
      s.onerror = () => rechazar(new Error('no se pudo cargar mqtt.min.js'));
      document.head.appendChild(s);
    });
  }
  return cargaMqtt;
}

export function salaActual() {
  const param = new URLSearchParams(location.search).get('sala');
  const guardada = localStorage.getItem('ct.sala');
  const sala = (param || guardada || SALA_POR_DEFECTO).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || SALA_POR_DEFECTO;
  if (param) localStorage.setItem('ct.sala', sala);
  return sala;
}

export function cambiarSala(sala) {
  localStorage.setItem('ct.sala', (sala || SALA_POR_DEFECTO).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || SALA_POR_DEFECTO);
}

// Si se desactiva, solo funciona entre pestañas del mismo equipo.
export function enVivoActivo() {
  return localStorage.getItem('ct.envivo') !== 'no';
}

export function activarEnVivo(si) {
  localStorage.setItem('ct.envivo', si ? 'si' : 'no');
}

export class Bus extends Emisor {
  constructor({ sala = salaActual(), id = uid('n'), enVivo = enVivoActivo() } = {}) {
    super();
    this.sala = sala;
    this.id = id;
    this.vistos = new Map(); // uid → hora, para descartar repetidos
    this.clientes = [];
    this.conectados = new Set();
    this.canal = 'BroadcastChannel' in window ? new BroadcastChannel(`apptaxi-${ID_EMPRESA}-${sala}`) : null;
    this.canal?.addEventListener('message', (e) => this.#recibir(e.data, 'local'));
    if (enVivo) this.#conectarRele();
  }

  get tema() {
    return `${PREFIJO_TEMAS}/${this.sala}`;
  }

  // Estado de conexión: 'local' (solo este equipo) o 'en-vivo' (algún relé conectado).
  get conexion() {
    return this.conectados.size > 0 ? 'en-vivo' : 'local';
  }

  async #conectarRele() {
    let mqtt;
    try {
      mqtt = await cargarMqtt();
    } catch (e) {
      console.warn('[bus]', e.message);
      return;
    }
    for (const url of RELES_MQTT) {
      try {
        const cliente = mqtt.connect(url, {
          clientId: `ct_${this.id}_${Math.random().toString(16).slice(2, 8)}`,
          connectTimeout: 10000,
          reconnectPeriod: 5000,
          keepalive: 30,
          clean: true,
        });
        cliente.on('connect', () => {
          // Se anuncia «en vivo» cuando la suscripción ya quedó activa, para no
          // perder las respuestas a lo que se publique enseguida.
          cliente.subscribe(`${this.tema}/#`, { qos: 0 }, (error) => {
            if (error) return;
            const nuevo = !this.conectados.has(url);
            this.conectados.add(url);
            if (nuevo) this.emit('conexion', this.conexion);
          });
        });
        const caer = () => {
          if (this.conectados.delete(url)) this.emit('conexion', this.conexion);
        };
        cliente.on('close', caer);
        cliente.on('offline', caer);
        cliente.on('error', () => {});
        cliente.on('message', (_tema, carga) => {
          try {
            this.#recibir(JSON.parse(carga.toString()), 'rele');
          } catch {
            /* mensaje ajeno o dañado */
          }
        });
        this.clientes.push(cliente);
      } catch (e) {
        console.warn('[bus] relé', url, e.message);
      }
    }
  }

  #yaVisto(id) {
    if (this.vistos.has(id)) return true;
    this.vistos.set(id, Date.now());
    if (this.vistos.size > 600) {
      const limite = Date.now() - 5 * 60 * 1000;
      for (const [k, t] of this.vistos) if (t < limite) this.vistos.delete(k);
    }
    return false;
  }

  #recibir(msj, via) {
    if (!msj || typeof msj !== 'object' || !msj.tipo || !msj.uid) return;
    if (this.#yaVisto(msj.uid)) return;
    if (msj.de === this.id) return; // propio
    if (Date.now() - (msj.ts || 0) > 2 * 60 * 1000) return; // muy viejo
    this.emit('mensaje', { ...msj, via });
    this.emit(msj.tipo, msj.datos, msj);
  }

  publicar(tipo, datos = {}) {
    const msj = { uid: uid('m'), tipo, de: this.id, ts: Date.now(), datos };
    this.#yaVisto(msj.uid);
    try {
      this.canal?.postMessage(msj);
    } catch (e) {
      console.warn('[bus] local', e.message);
    }
    const texto = JSON.stringify(msj);
    for (const c of this.clientes) {
      if (c.connected) c.publish(`${this.tema}/${tipo}`, texto, { qos: 0 });
    }
    return msj;
  }

  cerrar() {
    this.canal?.close();
    for (const c of this.clientes) c.end(true);
    this.clientes = [];
    this.conectados.clear();
  }
}

/* ---------------- Modo real: el servidor de TaxiCun ----------------
 * Un WebSocket del mismo origen a /api/bus. Primero { tipo:'hola', datos:{ token, rol,
 * empresa } } y nada más hasta la «bienvenida»; después, los mismos sobres que Bus
 * ({ uid, tipo, de, ts, datos }). El servidor decide a quién le llega cada mensaje:
 * nunca le reenvía a uno lo propio, reutiliza el uid de la solicitud cuando la vuelve a
 * ofrecer y pone su hora en ts. Por eso aquí NO se filtra por uid repetido, ni por
 * «de», ni por antigüedad (con el reloj del celular corrido se perdería todo).
 *
 * Eventos (además de cada tipo de mensaje y 'mensaje', como Bus):
 *   'bienvenida'      datos de la bienvenida ({ rol, empresa, nombre, pasajeroId | conductor })
 *   'conexion'        'en-vivo' | 'local' (lo mismo que Bus, para la interfaz de hoy)
 *   'estado_conexion' 'sin_conectar' | 'conectando' | 'en_linea' | 'reconectando' | 'rechazado'
 *   'rechazo'         { codigo, motivo } el servidor no deja entrar y NO se reintenta:
 *                     sin_sesion, conductor_no_aprobado, empresa_desconocida,
 *                     empresa_no_disponible
 *   'error'           { codigo } errores del servidor ya conectado (sin viajeId)
 * El cierre 4400 («falta_hola») no es definitivo: llega cuando el saludo tardó más de
 * 10 s (red muy lenta o app suspendida justo al abrir) y se reintenta como cualquier corte.
 */
const ESPERAS_MS = [1000, 2000, 5000, 10000];
const CIERRES_FINALES = { 4401: 'sin_sesion', 4403: 'conductor_no_aprobado', 4404: 'empresa_desconocida' };
const CODIGOS_FINALES = new Set(['sin_sesion', 'conductor_no_aprobado', 'empresa_desconocida', 'empresa_no_disponible']);
// Lo que se repite solo o solo sirve en el momento no se guarda para después.
const NO_ENCOLAR = new Set(['presencia', 'ubicacion', 'consulta_presencia', 'consulta_solicitudes']);
const VIDA_COLA_MS = 60000;
// Lo que cierra o cambia un viaje sale aunque lleve más de VIDA_COLA_MS en la cola: si se
// perdiera, la central seguiría con el viaje abierto (un viaje cobrado quedaría «en curso»
// y después se cancelaría o volvería a aparecer). El servidor los ignora si ya no aplican.
const SIN_VENCER = new Set(['estado', 'cancelacion', 'pago', 'pago_confirmado', 'calificacion']);
const VIDA_COLA_CIERRES_MS = 12 * 3600 * 1000;
// Si en este tiempo no llega la bienvenida, se corta y se vuelve a intentar.
const ESPERA_BIENVENIDA_MS = 15000;
// En segundo plano el teléfono no contesta el ping del servidor (cada 25 s) y la conexión
// muere sin aviso: si la app estuvo oculta más que esto, al volver se reconecta de una vez.
const OCULTA_MAX_MS = 25000;

export class BusServidor extends Emisor {
  #ws = null;
  #estado = 'sin_conectar';
  #listo = false; // llegó la bienvenida en el WebSocket actual
  #cola = [];
  #intento = 0;
  #reintento = null;
  #vigia = null;
  #errorHola = null;
  #cerrado = false;
  #ocultaDesde = 0;

  constructor({ rol = 'pasajero', empresa = ID_EMPRESA } = {}) {
    super();
    this.rol = rol === 'conductor' ? 'conductor' : 'pasajero';
    this.empresa = empresa;
    this.sala = empresa; // la interfaz de hoy la muestra; aquí no hay salas
    this.id = null;
    this.yo = null;
    this.real = true;
    this.url = URL_BUS;
    // Al volver a la app (o al recuperar la red) se reintenta ya, sin esperar el turno.
    const alOcultar = () => {
      if (!this.#ocultaDesde) this.#ocultaDesde = Date.now();
    };
    const alVolver = () => {
      const oculta = this.#ocultaDesde ? Date.now() - this.#ocultaDesde : 0;
      this.#ocultaDesde = 0;
      if (oculta > OCULTA_MAX_MS && this.#estado === 'en_linea') this.reconectar();
      else this.#reintentarYa();
    };
    document.addEventListener('visibilitychange', () => (document.hidden ? alOcultar() : alVolver()));
    window.addEventListener('online', () => this.#reintentarYa());
    try {
      const app = globalThis.Capacitor?.Plugins?.App;
      app?.addListener?.('pause', alOcultar)?.catch?.(() => {});
      app?.addListener?.('resume', alVolver)?.catch?.(() => {});
    } catch {
      /* sin el plugin App */
    }
  }

  get estado() {
    return this.#estado;
  }

  get conexion() {
    return this.#listo && this.#ws?.readyState === 1 ? 'en-vivo' : 'local';
  }

  // Abre la conexión (si ya está abierta o abriéndose, no hace nada). También vuelve a
  // intentar después de un rechazo o de cerrar(), porque alguien lo pidió.
  conectar() {
    this.#cerrado = false;
    if (this.#ws && this.#ws.readyState <= 1) return;
    clearTimeout(this.#reintento);
    this.#intento = 0;
    this.#abrir('conectando');
  }

  // Cierra y vuelve a abrir ya: el servidor toma nombre, celular y vehículo solo en el hola.
  reconectar() {
    if (this.#cerrado || this.#estado === 'sin_conectar') return;
    clearTimeout(this.#reintento);
    this.#soltar(4000, 'reconectar');
    this.#intento = 0;
    this.#abrir('conectando');
  }

  // Definitivo: sin reintentos y sin lo que estaba en cola (para salir de la cuenta).
  cerrar() {
    this.#cerrado = true;
    clearTimeout(this.#reintento);
    this.#cola = [];
    this.#soltar(1000, 'cerrar');
    this.#fijarEstado('sin_conectar');
  }

  publicar(tipo, datos = {}) {
    const msj = { uid: uid('m'), tipo, de: this.id, ts: Date.now(), datos };
    if (this.#listo && this.#ws?.readyState === 1) {
      try {
        this.#ws.send(JSON.stringify(msj));
        return msj;
      } catch (e) {
        console.warn('[bus servidor]', e.message);
      }
    }
    if (!this.#cerrado && !NO_ENCOLAR.has(tipo)) this.#cola.push(msj);
    return msj;
  }

  #fijarEstado(estado) {
    if (estado === this.#estado) return;
    this.#estado = estado;
    this.emit('estado_conexion', estado);
  }

  // estado: 'conectando' si alguien lo pidió; 'reconectando' en los reintentos solos.
  #abrir(estado = 'reconectando') {
    const token = servidor.token();
    if (!token) {
      this.#fijarEstado('rechazado');
      this.emit('rechazo', { codigo: 'sin_sesion', motivo: 'sin_token' });
      return;
    }
    this.#fijarEstado(estado);
    this.#errorHola = null;
    this.#listo = false;
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch (e) {
      console.warn('[bus servidor]', e.message);
      this.#programarReintento();
      return;
    }
    this.#ws = ws;
    clearTimeout(this.#vigia);
    this.#vigia = setTimeout(() => {
      if (ws === this.#ws && !this.#listo) this.#soltar(4000, 'sin_bienvenida', { reintentar: true });
    }, ESPERA_BIENVENIDA_MS);
    ws.onopen = () => {
      if (ws !== this.#ws) return;
      const datos = { token, rol: this.rol };
      if (this.rol === 'pasajero') datos.empresa = this.empresa;
      ws.send(JSON.stringify({ tipo: 'hola', datos }));
    };
    ws.onmessage = (e) => {
      if (ws !== this.#ws) return;
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return; // dañado
      }
      this.#recibir(m);
    };
    ws.onerror = () => {}; // después llega el cierre
    ws.onclose = (e) => {
      if (ws === this.#ws) this.#alCerrar(e.code, e.reason);
    };
  }

  // Suelta el WebSocket actual sin que su cierre dispare nada (o reintentando, si se pide).
  #soltar(codigo, motivo, { reintentar = false } = {}) {
    clearTimeout(this.#vigia);
    const ws = this.#ws;
    const estaba = this.#listo;
    this.#ws = null;
    this.#listo = false;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = null;
      try {
        ws.close(codigo, motivo);
      } catch {
        /* ya cerrado */
      }
    }
    if (estaba) this.emit('conexion', 'local');
    if (reintentar) this.#programarReintento();
  }

  #alCerrar(codigo, motivo = '') {
    clearTimeout(this.#vigia);
    const estaba = this.#listo;
    this.#ws = null;
    this.#listo = false;
    if (estaba) this.emit('conexion', 'local');
    if (this.#cerrado) return this.#fijarEstado('sin_conectar');
    const previo = CODIGOS_FINALES.has(this.#errorHola) ? this.#errorHola : null;
    if (CIERRES_FINALES[codigo] || previo) {
      // 4401 sin mensaje (sesión cerrada al borrar la cuenta o en otro lado) también es sin_sesion.
      const final = codigo === 4401 ? 'sin_sesion' : previo || CIERRES_FINALES[codigo];
      this.#fijarEstado('rechazado');
      if (final === 'sin_sesion') {
        servidor.borrarToken();
        servidor.sesion.emit('cerrada', { codigo: 'sin_sesion' });
      }
      this.emit('rechazo', { codigo: final, motivo: motivo || '' });
      return;
    }
    this.#programarReintento();
  }

  #programarReintento() {
    clearTimeout(this.#reintento);
    this.#fijarEstado('reconectando');
    const espera = ESPERAS_MS[Math.min(this.#intento, ESPERAS_MS.length - 1)];
    this.#intento += 1;
    this.#reintento = setTimeout(() => this.#abrir(), espera);
  }

  #reintentarYa() {
    if (this.#cerrado || this.#estado !== 'reconectando' || this.#ws) return;
    clearTimeout(this.#reintento);
    this.#abrir();
  }

  #recibir(m) {
    if (!m || typeof m !== 'object' || typeof m.tipo !== 'string') return;
    if (m.tipo === 'bienvenida') {
      clearTimeout(this.#vigia);
      this.#listo = true;
      this.#intento = 0;
      this.#errorHola = null;
      this.yo = m.datos || {};
      this.id = this.yo.pasajeroId || this.yo.conductor?.id || this.id;
      this.#fijarEstado('en_linea');
      // Lo que se pidió sin conexión sale ahora (si no es muy viejo), con el id ya conocido.
      // Los cierres de viaje salen siempre (ver SIN_VENCER).
      const cola = this.#cola;
      this.#cola = [];
      for (const x of cola) {
        if (Date.now() - x.ts > (SIN_VENCER.has(x.tipo) ? VIDA_COLA_CIERRES_MS : VIDA_COLA_MS)) continue;
        x.de = this.id;
        try {
          this.#ws.send(JSON.stringify(x));
        } catch {
          /* se cayó justo ahora: se pierde */
        }
      }
      this.emit('bienvenida', this.yo);
      this.emit('conexion', 'en-vivo');
      return;
    }
    if (m.tipo === 'error' && !this.#listo) {
      // Antes de la bienvenida: el cierre que sigue dice por qué.
      this.#errorHola = m.datos?.codigo || null;
      return;
    }
    // viaje_actual puede llegar con datos null («no hay viaje»).
    const datos = m.tipo === 'viaje_actual' ? (m.datos ?? null) : (m.datos ?? {});
    this.emit('mensaje', { ...m, via: 'servidor' });
    this.emit(m.tipo, datos);
  }
}

// Bus de la demo o del servidor, según el modo. Las demos siguen con el Bus de siempre.
export function crearBus(op = {}) {
  return MODO_REAL ? new BusServidor(op) : new Bus(op);
}
