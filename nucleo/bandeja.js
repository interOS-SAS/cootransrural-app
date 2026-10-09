// Avisos de la cooperativa (ronda 4A, servidor 0.9.0): los que el gerente manda a sus conductores o a los pasajeros que
// viajaron con ella hace poco. Contrato en la cabecera de nucleo/central.js. Solo modo real: lo crea cada controlador
// (ctl.bandeja); en la demo no existe.
//
//   const b = crearBandeja({ rol: 'conductor', bus });
//   b.on('nuevo', (aviso) => mostrarTarjeta(aviso));   // uno sin leer para mostrar como tarjeta (llegó por el bus o al
//                                                      // abrir la app), una vez por sesión; el más viejo primero
//   b.on('cambio', (lista) => pintarBandeja(lista));
//   b.lista        // [{ id, titulo, texto, de, en, para, leido }], el más nuevo primero (50 como mucho), texto plano
//   b.sinLeer()    // cuántos sin leer
//   await b.cargar({ forzar })   // GET /api/avisos (lo hace solo con cada bienvenida, a lo sumo una vez por minuto)
//   b.leer(id)     // «Entendido»: leído aquí ya y en el servidor (si no sale, se reintenta con la próxima carga)
//   await b.mostrar(id)          // el push { tipo: 'aviso', id } tocado: emite 'mostrar' con ese aviso (lo pide al
//                                // servidor si aún no lo tiene); false si no está
//
// Lo que llega se guarda en el celular (localStorage, con el prefijo del modo real: se borra si entra otra cuenta, ver
// perfil.borrarDatosLocales) para ver la bandeja sin señal y no volver a mostrar una tarjeta ya leída cuyo «leído» aún
// no salió. Con un servidor anterior (GET /api/avisos responde 404) no hace nada más hasta recargar.
import * as servidor from './servidor.js';
import { Emisor } from './util.js';
import { MODO_REAL } from './plataforma.js';
import { MENSAJES_CENTRAL, avisoDeCentral } from './central.js';

const MAX_LISTA = 50;
const MAX_TARJETAS = 5; // al abrir, como mucho estas tarjetas (las demás quedan en la bandeja, sin leer)
const CARGA_MIN_MS = 60000;
const clave = (rol) => `tc.real.avisos.${rol}`;
// La central es anterior a la 0.9.0 (GET /api/avisos respondió 404): no se vuelve a preguntar hasta recargar la página
// (vale para todas las bandejas de la página: el controlador se vuelve a crear al entrar otra vez).
let centralAnterior = false;

function leerGuardado(rol) {
  try {
    const g = JSON.parse(localStorage.getItem(clave(rol)) || 'null');
    return g && typeof g === 'object' ? g : null;
  } catch {
    return null;
  }
}

export function crearBandeja(op = {}) {
  return new Bandeja(op);
}

class Bandeja extends Emisor {
  constructor({ rol = 'pasajero', bus = null } = {}) {
    super();
    this.rol = rol === 'conductor' ? 'conductor' : 'pasajero';
    this.bus = bus;
    this.lista = [];
    this.cuenta = null; // el id (seudónimo) de la bienvenida: lo guardado es de esa cuenta
    this.pendientes = new Set(); // leídos aquí que aún no salieron al servidor
    this.mostrados = new Set(); // ya salieron como tarjeta en esta sesión
    this.noDisponible = false; // la central es anterior (sin /api/avisos)
    this.cargadoEn = 0;
    this.cargando = null;
    const g = leerGuardado(this.rol);
    if (g) {
      this.cuenta = typeof g.cuenta === 'string' ? g.cuenta : null;
      this.lista = (Array.isArray(g.lista) ? g.lista : []).map((a) => avisoDeCentral(a)).filter(Boolean).slice(0, MAX_LISTA);
      for (const id of Array.isArray(g.pendientes) ? g.pendientes : []) if (typeof id === 'string') this.pendientes.add(id);
    }
    if (bus) {
      bus.on('bienvenida', (d) => this.#alBienvenida(d));
      bus.on(MENSAJES_CENTRAL.aviso, (d) => this.recibir(d));
    }
  }

  sinLeer() {
    return this.lista.filter((a) => !a.leido).length;
  }

  #alBienvenida(d) {
    const cuenta = String(d?.pasajeroId || d?.conductor?.id || this.bus?.id || '') || null;
    if (cuenta && this.cuenta && cuenta !== this.cuenta) {
      // Otra cuenta en este celular: lo de la anterior no se muestra.
      this.lista = [];
      this.pendientes.clear();
      this.mostrados.clear();
      this.cargadoEn = 0;
    }
    if (cuenta) this.cuenta = cuenta;
    this.#guardar();
    this.cargar().catch(() => {});
  }

  // Un aviso que llegó por el bus (mensaje «aviso»).
  recibir(d) {
    const a = avisoDeCentral(d, { rol: this.rol });
    if (!a) return null;
    if (this.pendientes.has(a.id)) a.leido = true;
    this.#poner([a]);
    if (!a.leido) this.#ofrecer([a]);
    return a;
  }

  // GET /api/avisos: lo que hay en el servidor (30 días). Devuelve la lista (o la de siempre si falló).
  async cargar({ forzar = false } = {}) {
    if (!MODO_REAL || this.noDisponible || centralAnterior || !servidor.haySesion()) return this.lista;
    if (this.cargando) return this.cargando;
    if (!forzar && Date.now() - this.cargadoEn < CARGA_MIN_MS) return this.lista;
    this.cargando = (async () => {
      try {
        await this.#enviarLeidos();
        const r = await servidor.avisos(this.rol);
        this.cargadoEn = Date.now();
        const del = (Array.isArray(r?.avisos) ? r.avisos : []).map((x) => avisoDeCentral(x, { rol: this.rol })).filter(Boolean);
        for (const a of del) if (this.pendientes.has(a.id)) a.leido = true;
        // Lo del servidor manda (lo leído en otro celular, lo que ya venció); lo que llegó por el bus y aún no está
        // allá (no debería pasar) se conserva.
        const ids = new Set(del.map((a) => a.id));
        const locales = this.lista.filter((a) => !ids.has(a.id) && Date.now() - a.en < 5 * 60 * 1000);
        this.lista = [];
        this.#poner([...del, ...locales]);
        const nuevos = this.lista.filter((a) => !a.leido && !this.mostrados.has(a.id)).slice(0, MAX_TARJETAS);
        this.#ofrecer(nuevos.reverse());
      } catch (e) {
        if (servidor.rutaNoDisponible(e)) {
          this.noDisponible = true;
          centralAnterior = true;
        }
      } finally {
        this.cargando = null;
      }
      return this.lista;
    })();
    return this.cargando;
  }

  // «Entendido» en la tarjeta (o abrir la bandeja): leído aquí ya; al servidor, de a 50.
  leer(ids) {
    const lista = (Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string');
    let cambio = false;
    for (const id of lista) {
      const a = this.lista.find((x) => x.id === id);
      if (!a || a.leido) continue;
      a.leido = true;
      this.pendientes.add(id);
      cambio = true;
    }
    if (!cambio) return;
    this.#guardar();
    this.emit('cambio', this.lista);
    this.#enviarLeidos().catch(() => {});
  }

  // El push { tipo: 'aviso', id } tocado: la tarjeta de ese aviso (aunque ya se haya mostrado).
  async mostrar(id) {
    let a = this.lista.find((x) => x.id === String(id || ''));
    if (!a) {
      await this.cargar({ forzar: true });
      a = this.lista.find((x) => x.id === String(id || ''));
    }
    if (!a) return false;
    this.mostrados.add(a.id);
    this.emit('mostrar', a);
    return true;
  }

  async #enviarLeidos() {
    if (!this.pendientes.size || this.noDisponible || centralAnterior || !servidor.haySesion()) return;
    const ids = [...this.pendientes].slice(0, 50);
    try {
      await servidor.avisosLeidos(ids);
      for (const id of ids) this.pendientes.delete(id);
    } catch (e) {
      // Una central anterior no los conoce: no hay nada que reintentar.
      if (servidor.rutaNoDisponible(e) || e?.codigo === 'datos_invalidos') for (const id of ids) this.pendientes.delete(id);
    }
    this.#guardar();
  }

  #poner(avisos) {
    const por = new Map(this.lista.map((a) => [a.id, a]));
    for (const a of avisos) {
      const antes = por.get(a.id);
      // Un aviso leído no vuelve a quedar sin leer.
      por.set(a.id, antes?.leido ? { ...a, leido: true } : a);
    }
    this.lista = [...por.values()].sort((x, y) => y.en - x.en).slice(0, MAX_LISTA);
    this.#guardar();
    this.emit('cambio', this.lista);
  }

  #ofrecer(avisos) {
    for (const a of avisos) {
      if (this.mostrados.has(a.id)) continue;
      this.mostrados.add(a.id);
      this.emit('nuevo', a);
    }
  }

  #guardar() {
    try {
      localStorage.setItem(clave(this.rol), JSON.stringify({ cuenta: this.cuenta, lista: this.lista, pendientes: [...this.pendientes].slice(0, 200) }));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }
}
