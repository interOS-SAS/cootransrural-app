// Canal de mensajes entre pasajeros y conductores.
//  - BroadcastChannel: pestañas del mismo navegador (siempre disponible).
//  - MQTT por WebSocket a relés públicos: celulares distintos (demo en vivo).
// Cada mensaje lleva un uid y se descarta si llega repetido por otro camino.
import { RELES_MQTT, PREFIJO_TEMAS, SALA_POR_DEFECTO, urlDelSitio } from './config.js';
import { Emisor, uid } from './util.js';

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
    this.canal = 'BroadcastChannel' in window ? new BroadcastChannel(`cootransrural-${sala}`) : null;
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
