// Lógica de la app del conductor, independiente del diseño visual.
//
//   const c = await crearConductor();
//   c.on('cambio', (estado) => pintar(estado));
//   c.on('aviso', ({ titulo, cuerpo, tipo }) => mostrarAviso(...));
//   c.conectar();            // queda disponible y recibe solicitudes
//   c.aceptar(viajeId);
//   c.llegue(); c.iniciar(codigo); c.finalizar(); …
//
// Fases del viaje: confirmando → hacia_origen → en_origen → en_viaje → cobrando → calificar
//
// En MODO_REAL (c.real) todo va por el servidor de TaxiCun: GPS siempre real (sin GPS no
// se puede «Conectarme»), sin solicitudes ni recorridos simulados y cobro solo en efectivo.
// El tiempo real se abre aparte, con el conductor ya aprobado: c.bus.conectar().
// Eventos extra en modo real: 'bienvenida' (datos), 'rechazo' ({ codigo, motivo }),
// 'conexion' (estado del bus: 'sin_conectar'|'conectando'|'en_linea'|'reconectando'|
// 'rechazado') y 'error_servidor' ({ codigo, texto }). El estado lleva además estadoBus;
// el viaje en 'confirmando' lleva esperaTexto y esperaHasta; en 'cobrando', pagoAnunciado
// cuando el pasajero dice que ya pagó (se espera confirmarEfectivo()).
// Modo revisor (bienvenida.revision: las cuentas de los revisores de Apple y Google): la central
// manda un «pasajero automático» a ~120 m, con el código de abordaje fijo (codigoAbordaje, 1234).
// Ese código va en la nota de la solicitud y en viaje.codigoRevision (el diseño lo muestra al
// pedir el código), y «Llegué» se acepta hasta a 400 m. Sin esa bandera, nada cambia.
import { crearBus } from './bus.js';
import { TIEMPOS, CENTRO } from './config.js';
import { calcularRuta, obtenerPosicion, seguirPosicion, fueraDeZona, direccionDe } from './geo.js';
import { calcularTarifa } from './tarifas.js';
import { avisar } from './avisos.js';
import { recorrer, duracionSimulada, crearSolicitudSimulada, PasajeroSimulado } from './simulador.js';
import { urlPago } from './qr.js';
import * as perfil from './perfil.js';
import * as servidor from './servidor.js';
import { Emisor, hashCorto, distanciaKm, pesos, kmTexto, minutosTexto } from './util.js';
import { GPS_CON_INTERVALO, alCambiarVisibilidad, appOculta } from './plataforma.js';

// Distancia máxima (km) al pasajero para poder marcar «Llegué» con GPS real.
const DISTANCIA_LLEGADA_KM = 0.15;
// Con el pasajero automático del modo revisor (el GPS bajo techo se mueve decenas de metros).
const DISTANCIA_LLEGADA_REVISION_KM = 0.4;

// Modo real, batería. El GPS se sigue solo en turno o con un servicio; fuera de turno basta la
// lectura al abrir la app, la de «Conectarme» y una al volver a la app (y, sin ninguna lectura
// buena todavía, se sigue hasta que llegue una para salir de «Sin GPS»). En turno y sin
// servicio, en Android las lecturas se espacian (la presencia sale cada 8 s); con un servicio,
// cada 2 s como siempre (el pasajero ve el taxi y «Llegué» se mide a 150 m), siempre con alta
// precisión. En iPhone el plugin no deja espaciarlas: allí se ahorra no repintando el panel
// con cada lectura (REPINTAR_GPS).
const INTERVALO_GPS_MS = { espera: 5000, libre: 5000, viaje: 2000 };
// Con una lectura nueva el panel y el mapa se repintan solo si el taxi se movió (m) o pasó un
// rato (ms). La posición, la ubicación que ve el pasajero y la llegada al punto no esperan.
const REPINTAR_GPS = { viaje: { m: 5, ms: 3000 }, libre: { m: 15, ms: 10000 } };
// Fuera de turno, al volver a la app después de este tiempo se lee el GPS una vez (el mapa).
const RELEER_AL_VOLVER_MS = 20000;
// Un seguimiento que murió (no pudo arrancar, por ejemplo con la ubicación del sistema apagada,
// o el plugin lo borró) se vuelve a pedir a los 5 s, luego a los 10, 20… hasta cada minuto
// (con la app a la vista; con la app oculta, al volver).
const REINTENTO_GPS_MS = { primero: 5000, maximo: 60000 };

// Modo real.
const CLAVE_VIAJE_REAL = 'tc.real.viaje.conductor'; // localStorage: en la app nativa sessionStorage se pierde
const FASES_ACTIVAS = ['confirmando', 'hacia_origen', 'en_origen', 'en_viaje'];
const FASE_DEL_SERVIDOR = { asignado: 'hacia_origen', llego: 'en_origen', en_viaje: 'en_viaje' };
const ORDEN_FASES = { confirmando: 0, hacia_origen: 1, en_origen: 2, en_viaje: 3, cobrando: 4, calificar: 5 };
const ESPERA_VIAJE_ACTUAL_MS = 2500; // el servidor 0.1 solo manda viaje_actual si hay viaje
const CONFIRMAR_REAL_MS = 15000; // la central decide quién se queda con el servicio
const VIAJE_GUARDADO_MAX_MS = 12 * 3600 * 1000;
const MAX_PUNTOS_RUTA = 800; // el servidor corta la ruta de la aceptación en 800 puntos
// La central asigna al primero que acepta: la aceptación no espera más que esto por la
// ruta (OSRM puede tardar hasta 7 s con datos lentos); la ruta buena llega después.
const ESPERA_RUTA_ACEPTAR_MS = 1500;
// Una aceptación que se soltó por tiempo (o al recargar) todavía se reconoce si la central
// la asigna o la manda en viaje_actual.
const ACEPTADA_VIGENTE_MS = 30 * 60 * 1000;

// Ruta para aceptar sin hacer esperar a la central: la de OSRM si llega a tiempo; si no,
// una aproximada en línea recta (la misma que da calcularRuta sin internet).
async function rutaRapida(a, b, ms = ESPERA_RUTA_ACEPTAR_MS) {
  let reloj;
  const lenta = new Promise((listo) => {
    reloj = setTimeout(() => listo(null), ms);
  });
  const r = await Promise.race([calcularRuta(a, b).catch(() => null), lenta]);
  clearTimeout(reloj);
  if (r) return r;
  const km = distanciaKm(a, b) * 1.35;
  return { coords: [[a.lat, a.lng], [b.lat, b.lng]], km, min: Math.max(2, (km / 28) * 60), aproximada: true };
}

// Menos puntos, mismo recorrido (conserva el primero y el último).
function recortarRuta(coords, max = MAX_PUNTOS_RUTA) {
  if (!Array.isArray(coords) || coords.length <= max) return coords;
  const paso = (coords.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => coords[Math.round(i * paso)]);
}

export async function crearConductor(opciones = {}) {
  const ctl = new ControladorConductor(opciones);
  await ctl.arrancar();
  return ctl;
}

class ControladorConductor extends Emisor {
  constructor() {
    super();
    this.bus = crearBus({ rol: 'conductor' });
    this.real = this.bus.real === true;
    this.estado = {
      conectado: false,
      pos: null,
      gpsReal: false,
      gpsSimulado: false, // true si la posición la mueve la simulación
      solicitudes: [],
      viaje: null,
      rutaActual: null,
      etaMin: null,
      kmRestantes: null,
      mensajePasajero: null,
      resumen: perfil.resumenDelDia(),
      conexion: this.bus.conexion,
      sala: this.bus.sala,
      pasajerosEnLinea: 0,
    };
    this.pasajeroSim = null;
    this.recorrido = null;
    this.temporizadores = new Map();
    if (this.real) {
      this.estado.estadoBus = this.bus.estado;
      this.relojViajeActual = null;
      this.viajeARevisar = null; // id del viaje que había al llegar la última bienvenida
      this.ultimoRechazo = null;
      this.llegadaAvisada = null;
      this.aceptadaReciente = null;
      this.cierreRepetido = null; // el último fin que se repitió al reconectar (ver #valorRechazado)
      this.reconexionPorValor = 0; // cuándo se reconectó por un valor_invalido que llegó tarde
      this.revision = false; // modo revisor (bienvenida.revision)
      this.gpsNegado = false; // la última lectura dijo «permiso negado»: no hay a quién seguir
      this.claveSeguimiento = null; // con qué opciones va el seguimiento del GPS
      this.leyendoGps = false;
      this.primeraLectura = false;
      this.ultimoPintadoGps = null;
      this.ocultaDesde = 0;
      this.relojReintentoGps = null;
      this.esperaReintentoGps = 0;
    }
  }

  async arrancar() {
    this.bus.on('conexion', (c) => this.#cambiar({ conexion: c }));
    for (const tipo of ['solicitud', 'asignacion', 'cancelacion', 'pago', 'calificacion']) {
      this.bus.on(tipo, (datos) => this.#manejar(tipo, datos));
    }
    this.bus.on('consulta_presencia', () => {
      if (this.estado.conectado) this.#anunciar();
    });
    if (this.real) {
      this.#escucharServidor();
      this.#retomarReal();
      this.dejarVisibilidad = alCambiarVisibilidad((oculta) => this.#alCambiarVisibilidad(oculta));
    }
    await this.#configurarGps();
    if (this.real && this.estado.viaje) this.#rutaHaciaObjetivo();
  }

  async #configurarGps() {
    this.dejarDeSeguir?.();
    this.dejarDeSeguir = null;
    if (this.real) {
      // Mientras se lee, #ajustarSeguimiento no arranca otro seguimiento (lo hace al final).
      this.claveSeguimiento = null;
      this.leyendoGps = true;
      let pos;
      try {
        pos = await obtenerPosicion({ espera: 7000 });
      } finally {
        this.leyendoGps = false;
      }
      return this.#configurarGpsReal(pos);
    }
    const pos = await obtenerPosicion({ espera: 7000 });
    const usarSimulado = this.#gpsDebeSimularse(pos);
    this.estado.gpsReal = pos.real && !usarSimulado;
    this.estado.gpsSimulado = !this.estado.gpsReal;
    this.estado.pos = usarSimulado && (!pos.real || fueraDeZona(pos)) ? { ...CENTRO, rumbo: 0 } : { lat: pos.lat, lng: pos.lng, rumbo: 0 };
    if (this.estado.gpsReal) {
      this.dejarDeSeguir = seguirPosicion((p) => {
        if (this.recorrido) return; // durante la conducción simulada manda la simulación
        this.#moverA({ lat: p.lat, lng: p.lng, rumbo: p.rumbo ?? this.estado.pos?.rumbo ?? 0 });
      });
    }
    this.#cambiar({});
  }

  #gpsDebeSimularse(pos) {
    const a = perfil.ajustes().gpsSimulado;
    if (a === true) return true;
    if (a === false) return false;
    return !pos.real || fueraDeZona(pos);
  }

  get perfil() {
    return perfil.conductor();
  }

  get ingresado() {
    // En modo real: con sesión y con el perfil que mandó el servidor.
    if (this.real) return servidor.haySesion() && Boolean(perfil.conductor()?.real);
    return Boolean(perfil.conductor());
  }

  historial() {
    return perfil.historialConductor();
  }

  /* ---------------- disponibilidad ---------------- */

  // En modo real devuelve una promesa (true si quedó en línea) y nunca lanza: avisa.
  conectar() {
    if (this.real) return this.#conectarReal();
    if (!this.ingresado) throw new Error('Primero hay que ingresar');
    this.#cambiar({ conectado: true });
    this.#anunciar();
    // Pide las solicitudes que ya estaban buscando antes de conectarse.
    this.bus.publicar('consulta_solicitudes', {});
    clearInterval(this.relojPresencia);
    this.relojPresencia = setInterval(() => this.#anunciar(), TIEMPOS.presencia);
    this.#avisar({ titulo: 'Estás en línea', cuerpo: 'Te llegarán las solicitudes cercanas.', tipo: 'exito' });
  }

  desconectar() {
    if (this.estado.viaje) return false;
    clearInterval(this.relojPresencia);
    this.#cambiar({ conectado: false, solicitudes: [] });
    this.#anunciar();
    return true;
  }

  #anunciar() {
    const c = this.perfil;
    if (!c) return;
    if (this.real) {
      // Siempre con la posición del GPS de verdad: sin pos el servidor le mandaría al
      // conductor todas las solicitudes de la cooperativa. Sin GPS, no disponible.
      const conGps = Boolean(this.estado.gpsReal && this.estado.pos);
      this.bus.publicar('presencia', {
        conductorId: c.id,
        movil: c.movil,
        disponible: conGps && this.estado.conectado && !this.estado.viaje,
        ...(conGps ? { pos: this.estado.pos } : {}),
      });
      return;
    }
    this.bus.publicar('presencia', {
      conductorId: c.id,
      movil: c.movil,
      disponible: this.estado.conectado && !this.estado.viaje,
      pos: this.estado.pos,
    });
  }

  /* ---------------- solicitudes ---------------- */

  // Crea una solicitud de un pasajero de prueba cerca del conductor.
  async simularSolicitud() {
    if (this.real) return false; // en la app real no hay pasajeros de prueba
    if (!this.estado.conectado) this.conectar();
    const s = await crearSolicitudSimulada(this.estado.pos || CENTRO);
    const ruta = await calcularRuta(s.origen, s.destino);
    const [dirO, dirD] = await Promise.all([direccionDe(s.origen), direccionDe(s.destino)]);
    const tarifa = calcularTarifa({ origen: s.origen, destino: s.destino, km: ruta.km });
    this.#recibirSolicitud({
      ...s,
      origen: { ...s.origen, titulo: dirO.titulo, detalle: dirO.detalle },
      destino: { ...s.destino, titulo: dirD.titulo, detalle: dirD.detalle },
      tarifa: tarifa.total,
      km: ruta.km,
      min: ruta.min,
      codigoHash: hashCorto(s.viajeId + s.codigo),
    });
  }

  // Modo revisor: el código de abordaje del pasajero automático (null si no aplica).
  #codigoDePrueba(s) {
    const codigo = String(s?.codigoAbordaje ?? '');
    return this.real && this.revision && s?.pasajero?.automatico && /^\d{4}$/.test(codigo) ? codigo : null;
  }

  // Distancia para «Llegué» (más holgada con el pasajero automático del modo revisor).
  #distanciaLlegada(v) {
    return v?.codigoRevision ? DISTANCIA_LLEGADA_REVISION_KM : DISTANCIA_LLEGADA_KM;
  }

  // Modo revisor: el pasajero automático aparece al lado y, con el teléfono quieto (en un escritorio
  // no llegan lecturas nuevas del GPS), «Llegué» se resalta sin esperar a que el taxi se mueva.
  #llegadaSinMoverse() {
    const v = this.estado.viaje;
    if (this.real && v?.codigoRevision && this.estado.gpsReal && this.estado.pos) this.#moverA(this.estado.pos);
  }

  async #recibirSolicitud(s) {
    if (!this.estado.conectado || this.estado.viaje) return;
    if (this.estado.solicitudes.some((x) => x.viajeId === s.viajeId)) return;
    // Modo revisor: el código del pasajero automático se ve en la nota de la solicitud.
    const codigo = this.#codigoDePrueba(s);
    if (codigo && !String(s.nota || '').includes(codigo)) s = { ...s, nota: [s.nota, `Código de abordaje: ${codigo}`].filter(Boolean).join(' · ') };
    const pos = this.estado.pos || CENTRO;
    const distanciaAMi = distanciaKm(pos, s.origen);
    const solicitud = { ...s, distanciaAMi, recibida: Date.now(), expira: Date.now() + TIEMPOS.aceptar };
    this.#cambiar({ solicitudes: [...this.estado.solicitudes, solicitud] });
    this.#avisar({
      titulo: 'Nueva solicitud de servicio',
      cuerpo: `${s.pasajero.nombre} · a ${kmTexto(distanciaAMi)} · ${s.destino?.titulo || 'Destino a convenir'} · ${pesos(s.tarifa)}`,
      tipo: 'solicitud',
    });
    this.temporizadores.set(s.viajeId, setTimeout(() => this.rechazar(s.viajeId, true), TIEMPOS.aceptar));
  }

  rechazar(viajeId, vencida = false) {
    clearTimeout(this.temporizadores.get(viajeId));
    this.temporizadores.delete(viajeId);
    const quedan = this.estado.solicitudes.filter((s) => s.viajeId !== viajeId);
    if (quedan.length !== this.estado.solicitudes.length) {
      this.#cambiar({ solicitudes: quedan });
      if (vencida) this.emit('vencida', viajeId);
    }
  }

  async aceptar(viajeId) {
    const s = this.estado.solicitudes.find((x) => x.viajeId === viajeId);
    if (!s || this.estado.viaje) return false;
    const soltarOfertas = () => {
      for (const id of this.temporizadores.keys()) clearTimeout(this.temporizadores.get(id));
      this.temporizadores.clear();
    };
    if (!this.real) soltarOfertas();
    const c = this.perfil;
    const pos = this.estado.pos || CENTRO;
    const hacia = this.real ? await rutaRapida(pos, s.origen) : await calcularRuta(pos, s.origen);
    if (this.real) {
      // Mientras se esperaba la ruta pudo irse la oferta (venció, la tomó otro, se canceló).
      if (this.estado.viaje || !this.estado.solicitudes.some((x) => x.viajeId === viajeId)) return false;
      soltarOfertas();
    }
    const viaje = {
      id: s.viajeId,
      pasajero: s.pasajero,
      origen: s.origen,
      destino: s.destino,
      metodoPago: s.metodoPago,
      nota: s.nota,
      tarifa: s.tarifa,
      km: s.km,
      min: s.min,
      codigoHash: s.codigoHash,
      codigoSimulado: s.simulada ? s.codigo : null,
      codigoRevision: this.#codigoDePrueba(s),
      simulado: Boolean(s.simulada),
      fase: s.simulada ? 'hacia_origen' : 'confirmando',
      aceptado: Date.now(),
      pago: null,
    };
    if (this.real) {
      viaje.esperaTexto = 'Confirmando con la central…';
      viaje.esperaHasta = Date.now() + CONFIRMAR_REAL_MS;
      viaje.conductorId = c?.id || null; // de quién es (otra cuenta en este celular no lo retoma)
      // Por si la asignación llega después de soltarlo por tiempo.
      this.aceptadaReciente = { s, cuando: Date.now() };
    }
    this.#cambiar({ viaje, solicitudes: [], rutaActual: hacia.coords, etaMin: hacia.min, kmRestantes: hacia.km, mensajePasajero: null });
    this.#anunciar();

    if (this.real) {
      // El servidor toma los datos del conductor de la base: aquí solo el viaje y la ruta
      // (la aproximada en línea recta no se manda: el pasajero vería una ruta que no existe).
      this.bus.publicar('aceptacion', { viajeId, pos, etaMin: hacia.min, ruta: hacia.aproximada ? null : recortarRuta(hacia.coords) });
      // Quien decide es la central: si no confirma en 15 s, se suelta.
      this.temporizadores.set('confirmar', setTimeout(() => {
        if (this.estado.viaje?.fase === 'confirmando' && this.estado.viaje.id === viajeId) {
          this.#avisar({ titulo: 'La central no confirmó el servicio', cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'error' });
          this.#terminar();
        }
      }, CONFIRMAR_REAL_MS));
    } else if (viaje.simulado) {
      this.pasajeroSim = new PasajeroSimulado({ viaje: { ...viaje, codigo: s.codigo }, entregar: (tipo, d) => this.#manejar(tipo, d, true) });
      this.#avisar({ titulo: 'Servicio asignado', cuerpo: `Recoge a ${s.pasajero.nombre} en ${s.origen.titulo || 'el punto marcado'}.`, tipo: 'exito' });
      this.#conducir(hacia);
    } else {
      this.bus.publicar('aceptacion', {
        viajeId,
        conductor: { id: c.id, movil: c.movil, nombre: c.nombre, placa: c.placa, vehiculo: c.vehiculo, color: c.color, calificacion: c.calificacion, viajes: c.viajes, tel: c.tel },
        pos,
        etaMin: hacia.min,
        ruta: hacia.coords,
      });
      // Si el pasajero no confirma en 12 s, se suelta el servicio.
      this.temporizadores.set('confirmar', setTimeout(() => {
        if (this.estado.viaje?.fase === 'confirmando') {
          this.#avisar({ titulo: 'El pasajero no confirmó', cuerpo: 'El servicio se liberó.', tipo: 'error' });
          this.#terminar();
        }
      }, 12000));
    }
    return true;
  }

  // Mueve el taxi por la ruta cuando el GPS es simulado.
  #conducir(ruta) {
    this.recorrido?.detener();
    this.recorrido = null;
    if (this.real) return; // en la app real el taxi lo mueve solo el GPS
    // Con GPS real solo se simula el recorrido si el pasajero es de prueba.
    if (this.estado.gpsReal && !this.estado.viaje?.simulado) return;
    const ms = duracionSimulada(ruta.min, { min: 14000, max: 40000 });
    this.recorrido = recorrer(ruta.coords, ms, (p, f) => {
      this.#moverA(p);
      this.#cambiar({ etaMin: Math.max(0, ruta.min * (1 - f)), kmRestantes: Math.max(0, ruta.km * (1 - f)) });
    });
    this.recorrido.terminado.then((completo) => {
      this.recorrido = null;
      if (completo) this.emit('llegada', this.estado.viaje?.fase);
    });
  }

  #moverA(p) {
    this.estado.pos = p;
    const v = this.estado.viaje;
    const ahora = Date.now();
    if (v && !v.simulado && ['hacia_origen', 'en_origen', 'en_viaje'].includes(v.fase) && ahora - (this.ultimaUbicacion || 0) >= TIEMPOS.ubicacion) {
      this.ultimaUbicacion = ahora;
      const objetivo = v.fase === 'en_viaje' ? v.destino : v.origen;
      const etaMin = objetivo ? (distanciaKm(p, objetivo) * 1.3 / 25) * 60 : null;
      this.bus.publicar('ubicacion', { viajeId: v.id, conductorId: this.perfil.id, pos: p, etaMin: this.recorrido ? this.estado.etaMin : etaMin });
    }
    if (v && this.estado.gpsReal && !this.recorrido) {
      const objetivo = v.fase === 'en_viaje' ? v.destino : v.origen;
      if (objetivo) {
        const km = distanciaKm(p, objetivo) * 1.3;
        this.estado.kmRestantes = km;
        this.estado.etaMin = (km / 25) * 60;
      }
    }
    // Modo real: 'llegada' cuando el GPS queda en el punto (lo que en la demo hace el recorrido).
    if (this.real && v && this.estado.gpsReal) {
      const objetivo = v.fase === 'hacia_origen' ? v.origen : v.fase === 'en_viaje' ? v.destino : null;
      const clave = `${v.id}:${v.fase}`;
      if (objetivo && this.llegadaAvisada !== clave && distanciaKm(p, objetivo) <= (v.fase === 'hacia_origen' ? this.#distanciaLlegada(v) : DISTANCIA_LLEGADA_KM)) {
        this.llegadaAvisada = clave;
        this.emit('llegada', v.fase);
      }
    }
    this.emit('posicion', p);
    // Modo real: el GPS da ~1 lectura por segundo (iPhone) y cada 'cambio' repinta el panel,
    // el taxi y la ruta: solo si se movió o pasó un rato.
    if (this.real && !this.#repintarPorGps(p)) return;
    this.emit('cambio', this.estado);
  }

  #repintarPorGps(p) {
    const r = REPINTAR_GPS[this.estado.viaje ? 'viaje' : 'libre'];
    const u = this.ultimoPintadoGps;
    const ahora = Date.now();
    if (u && ahora - u.t < r.ms && distanciaKm(u.p, p) * 1000 < r.m) return false;
    this.ultimoPintadoGps = { p, t: ahora };
    return true;
  }

  /* ---------------- viaje ---------------- */

  // Con GPS real, «Llegué» solo vale si el taxi está de verdad en el punto de
  // recogida: así nadie puede «simular estar en el punto» desde otro lado.
  llegue() {
    const v = this.estado.viaje;
    if (!v || !['hacia_origen'].includes(v.fase)) return false;
    // Modo real: sin GPS no se puede comprobar que el taxi está en el punto, y el
    // pasajero no debe ver su taxi «en la puerta» si no lo está.
    if (this.real && !v.simulado && (!this.estado.gpsReal || !this.estado.pos)) {
      this.#avisar({ titulo: 'Activa la ubicación', cuerpo: 'Para avisarle al pasajero que llegaste necesitamos la ubicación del celular.', tipo: 'error' });
      this.#reintentarGps();
      return false;
    }
    if (this.estado.gpsReal && !v.simulado && this.estado.pos) {
      const d = distanciaKm(this.estado.pos, v.origen);
      if (d > this.#distanciaLlegada(v)) {
        this.#avisar({ titulo: 'Aún no estás en el punto', cuerpo: `Estás a ${kmTexto(d)} del pasajero. Marca «Llegué» cuando estés en la puerta.`, tipo: 'error' });
        return false;
      }
    }
    this.recorrido?.detener();
    this.recorrido = null;
    // Solo la simulación «salta» al punto; con GPS real manda la posición del celular.
    if (!this.estado.gpsReal || v.simulado) this.#moverA({ ...v.origen, rumbo: this.estado.pos?.rumbo || 0 });
    this.#faseViaje('en_origen');
    if (!v.simulado) this.bus.publicar('estado', { viajeId: v.id, conductorId: this.perfil.id, fase: 'llego' });
    this.#avisar({ titulo: 'Le avisamos al pasajero', cuerpo: 'Ya sabe que estás en la puerta.', tipo: 'info' });
    this.pasajeroSim?.alLlegarConductor();
    return true;
  }

  // Verifica el código de 4 dígitos que dice el pasajero y arranca el viaje.
  // Devuelve false si el código no coincide. sinCodigo: arrancar sin verificar.
  async iniciar(codigo, { sinCodigo = false } = {}) {
    const v = this.estado.viaje;
    if (!v || v.fase !== 'en_origen') return false;
    if (!sinCodigo && v.codigoHash && hashCorto(v.id + String(codigo || '').trim()) !== v.codigoHash) {
      this.#avisar({ titulo: 'Código incorrecto', cuerpo: 'Pídele al pasajero el código de 4 dígitos de su app.', tipo: 'error' });
      return false;
    }
    this.#faseViaje('en_viaje', { inicio: Date.now() });
    if (!v.simulado) this.bus.publicar('estado', { viajeId: v.id, conductorId: this.perfil.id, fase: 'en_viaje' });
    this.#avisar({ titulo: 'Viaje iniciado', cuerpo: v.destino?.titulo ? `Destino: ${v.destino.titulo}` : 'Destino a convenir con el pasajero', tipo: 'info' });
    if (v.destino) {
      const ruta = await calcularRuta(v.origen, v.destino);
      this.#cambiar({ rutaActual: ruta.coords, etaMin: ruta.min, kmRestantes: ruta.km });
      this.#conducir(ruta);
    } else {
      this.#cambiar({ rutaActual: null, etaMin: null, kmRestantes: null });
    }
    return true;
  }

  // Termina el viaje y genera el cobro (QR). valorManual permite ajustar la tarifa.
  finalizar(valorManual = null) {
    const v = this.estado.viaje;
    if (!v || v.fase !== 'en_viaje') return null;
    this.recorrido?.detener();
    this.recorrido = null;
    // Solo la simulación «salta» al destino; en modo real el taxi lo mueve únicamente el GPS.
    if (v.destino && (v.simulado || (!this.real && !this.estado.gpsReal))) this.#moverA({ ...v.destino, rumbo: this.estado.pos?.rumbo || 0 });
    const valor = Math.round(valorManual || v.tarifa || 8000);
    if (this.real) {
      // Sin QR de prueba: el pasajero paga en efectivo y el conductor lo confirma.
      this.#faseViaje('cobrando', { valor, urlCobro: null, fin: Date.now() });
      this.#cambiar({ rutaActual: null, etaMin: 0, kmRestantes: 0 });
      this.bus.publicar('estado', { viajeId: v.id, conductorId: this.perfil?.id, fase: 'finalizado', valor, km: v.km });
      return { valor, url: null };
    }
    const url = urlPago({ viaje: v.id, valor, movil: this.perfil.movil, sala: this.bus.sala, conductor: this.perfil.id });
    this.#faseViaje('cobrando', { valor, urlCobro: url, fin: Date.now() });
    this.#cambiar({ rutaActual: null, etaMin: 0, kmRestantes: 0 });
    if (!v.simulado) {
      this.bus.publicar('estado', { viajeId: v.id, conductorId: this.perfil.id, fase: 'finalizado', valor, km: v.km });
      this.bus.publicar('cobro', { viajeId: v.id, conductorId: this.perfil.id, valor, url, movil: this.perfil.movil });
    }
    this.pasajeroSim?.alCobrar(valor);
    return { valor, url };
  }

  // El conductor confirma que recibió el efectivo.
  confirmarEfectivo() {
    const v = this.estado.viaje;
    if (!v || v.fase !== 'cobrando') return;
    this.#registrarPago({ metodo: 'efectivo', valor: v.valor });
  }

  #registrarPago(pago) {
    const v = this.estado.viaje;
    if (!v || v.fase !== 'cobrando') return;
    // También en viajes simulados: la página pagar/ espera esta confirmación.
    this.bus.publicar('pago_confirmado', { viajeId: v.id, conductorId: this.perfil.id, metodo: pago.metodo, valor: pago.valor, billetera: pago.billetera || null, ref: pago.ref || null });
    this.#faseViaje('calificar', { pago: { ...pago, hora: Date.now() } });
    this.#avisar({
      titulo: pago.metodo === 'qr' ? 'Pago recibido por QR (prueba)' : 'Pago en efectivo registrado',
      cuerpo: `${pesos(pago.valor)}${pago.billetera ? ` · ${pago.billetera}` : ''}${pago.ref ? ` · Ref. ${pago.ref}` : ''}`,
      tipo: 'exito',
    });
  }

  calificar(estrellas, { etiquetas = [], comentario = '' } = {}) {
    const v = this.estado.viaje;
    if (!v) return;
    if (!v.simulado) this.bus.publicar('calificacion', { viajeId: v.id, de: 'conductor', estrellas, etiquetas, comentario });
    // Si el cierre salió sin señal, la central lo sigue teniendo en curso un rato: no se retoma.
    if (this.real && !v.simulado) {
      perfil.anotarViajeCerrado('conductor', {
        id: v.id, final: 'finalizado', valor: v.valor ?? null, km: v.km ?? null,
        pago: v.pago ? { metodo: v.pago.metodo, valor: v.pago.valor } : null, estrellas, etiquetas, comentario,
      });
    }
    this.pasajeroSim?.alCalificar();
    this.#guardarEnHistorial('finalizado', { calificacionDada: estrellas });
    // Se espera un momento por si llega la calificación del pasajero simulado.
    this.#terminar();
  }

  cancelar(motivo = 'El pasajero no aparece') {
    const v = this.estado.viaje;
    if (!v || ['cobrando', 'calificar'].includes(v.fase)) return;
    if (!v.simulado) this.bus.publicar('cancelacion', { viajeId: v.id, conductorId: this.perfil.id, por: 'conductor', motivo });
    if (this.real && !v.simulado) {
      perfil.anotarViajeCerrado('conductor', { id: v.id, final: 'cancelado', motivo });
      // Si lo canceló mientras se confirmaba, una asignación que llegue tarde no lo retoma.
      if (this.aceptadaReciente?.s?.viajeId === v.id) this.aceptadaReciente = null;
    }
    this.#guardarEnHistorial('cancelado', { motivo });
    this.#avisar({ titulo: 'Servicio cancelado', cuerpo: motivo, tipo: 'info' });
    this.#terminar();
  }

  #faseViaje(fase, extra = {}) {
    this.#cambiar({ viaje: { ...this.estado.viaje, fase, ...extra } });
  }

  #guardarEnHistorial(estadoFinal, extra = {}) {
    const v = this.estado.viaje;
    perfil.agregarAlHistorialConductor({
      id: v.id,
      estado: estadoFinal,
      fecha: v.aceptado,
      fin: Date.now(),
      pasajero: v.pasajero?.nombre,
      origen: v.origen,
      destino: v.destino,
      valor: estadoFinal === 'finalizado' ? v.pago?.valor || v.valor || 0 : 0,
      metodoPago: v.pago?.metodo || v.metodoPago,
      km: v.km || null,
      simulado: v.simulado,
      calificacionRecibida: v.calificacionRecibida || null,
      ...extra,
    });
  }

  #terminar() {
    clearTimeout(this.temporizadores.get('confirmar'));
    this.temporizadores.delete('confirmar');
    if (this.real) this.llegadaAvisada = null;
    this.recorrido?.detener();
    this.recorrido = null;
    const sim = this.pasajeroSim;
    this.pasajeroSim = null;
    // El pasajero simulado puede calificar unos segundos después.
    if (sim) setTimeout(() => sim.detener(), 5000);
    this.#cambiar({ viaje: null, rutaActual: null, etaMin: null, kmRestantes: null, mensajePasajero: null, resumen: perfil.resumenDelDia() });
    this.#anunciar();
  }

  /* ---------------- mensajes ---------------- */

  #manejar(tipo, d, simulado = false) {
    const v = this.estado.viaje;
    switch (tipo) {
      case 'solicitud':
        if (!simulado) this.#recibirSolicitud(d);
        break;
      case 'asignacion': {
        // En modo real el id propio es el seudónimo c_… de la bienvenida.
        const yo = this.real ? this.bus.id || this.perfil?.id : this.perfil?.id;
        const reciente = this.real && this.aceptadaReciente && Date.now() - this.aceptadaReciente.cuando < 2 * 60 * 1000;
        if (reciente && d.conductorId === yo && !v && this.aceptadaReciente.s.viajeId === d.viajeId) {
          // Se soltó por tiempo pero la central sí lo asignó: se retoma.
          this.#retomarAsignado(d);
          break;
        }
        if (v && v.id === d.viajeId && v.fase === 'confirmando') {
          clearTimeout(this.temporizadores.get('confirmar'));
          if (d.conductorId === yo) {
            if (this.real) this.aceptadaReciente = null;
            // El celular del pasajero solo le llega al que ganó (en la solicitud no viene).
            // Desde el servidor 0.2.1 la huella del código de abordaje también llega solo
            // aquí (la oferta ya no la trae); con 0.1/0.2.0 se conserva la de la solicitud.
            this.#faseViaje('hacia_origen', this.real ? { pasajero: { ...v.pasajero, celular: d.pasajero?.celular || '' }, codigoHash: d.codigoHash || v.codigoHash || null, esperaTexto: null, esperaHasta: null } : {});
            this.#avisar({ titulo: 'Servicio confirmado', cuerpo: `Recoge a ${v.pasajero.nombre} en ${v.origen.titulo || 'el punto marcado'}.`, tipo: 'exito' });
            // En modo real el taxi lo mueve el GPS: solo se trae la ruta buena (al aceptar pudo ir la aproximada).
            if (this.real) this.#rutaHaciaObjetivo();
            else calcularRuta(this.estado.pos || CENTRO, v.origen).then((r) => this.#conducir(r));
          } else {
            this.#avisar({ titulo: 'Otro conductor tomó el servicio', cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'info' });
            this.#terminar();
          }
        } else if (d.conductorId !== yo) {
          this.rechazar(d.viajeId);
        }
        break;
      }
      case 'cancelacion': {
        if (this.real && d.por === 'sistema' && d.motivo === 'cuenta_borrada') {
          // El pasajero eliminó su cuenta (servidor 0.2.2): la central ya canceló el viaje,
          // en la fase que sea. Se quita la oferta y se suelta el servicio sin cancelarlo allá.
          this.rechazar(d.viajeId);
          if (this.aceptadaReciente?.s?.viajeId === d.viajeId) this.aceptadaReciente = null;
          if (v && v.id === d.viajeId && v.fase !== 'calificar') {
            if (v.fase !== 'confirmando') this.#guardarEnHistorial('cancelado', { motivo: 'El pasajero canceló el servicio' });
            this.#avisar({ titulo: 'El pasajero canceló el servicio', cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'alerta' });
            this.#terminar();
          }
          break;
        }
        if (this.real && d.por === 'sistema') {
          // Nadie lo tomó en 10 min: se quita la oferta (y se suelta si se estaba confirmando).
          this.rechazar(d.viajeId);
          if (v && v.id === d.viajeId && v.fase === 'confirmando') {
            this.#avisar({ titulo: 'El servicio ya no está disponible', cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'info' });
            this.#terminar();
          }
          break;
        }
        if (d.por !== 'pasajero') break;
        this.rechazar(d.viajeId);
        if (v && v.id === d.viajeId && !['cobrando', 'calificar'].includes(v.fase)) {
          this.#guardarEnHistorial('cancelado', { motivo: `Pasajero: ${d.motivo || ''}` });
          this.#avisar({ titulo: 'El pasajero canceló', cuerpo: d.motivo || '', tipo: 'alerta' });
          this.#terminar();
        }
        break;
      }
      case 'pago': {
        if (this.real) {
          // En efectivo no basta con que el pasajero toque el botón: confirma el conductor.
          if (v && v.id === d.viajeId && v.fase === 'cobrando') {
            const valor = d.valor || v.valor;
            this.#faseViaje('cobrando', { pagoAnunciado: { metodo: d.metodo || 'efectivo', valor } });
            this.#avisar({ titulo: 'El pasajero dice que pagó en efectivo', cuerpo: `${pesos(valor)}. Confirma cuando lo recibas.`, tipo: 'info' });
          }
          break;
        }
        if (v && v.id === d.viajeId && v.fase === 'cobrando') this.#registrarPago({ metodo: d.metodo, valor: d.valor, billetera: d.billetera, ref: d.ref });
        break;
      }
      case 'calificacion': {
        if (d.de !== 'pasajero') break;
        if (this.real) {
          // Solo el promedio nuevo, nunca las estrellas de ese pasajero (para evitar represalias).
          if (Number.isFinite(d.calificacion)) {
            perfil.actualizarConductor({ calificacion: d.calificacion });
            this.#avisar({ titulo: 'Tu calificación se actualizó', cuerpo: `Promedio: ${d.calificacion.toFixed(1).replace('.', ',')} ★`, tipo: 'exito' });
            this.#cambiar({});
          }
          break;
        }
        if (v && v.id === d.viajeId) {
          this.estado.viaje.calificacionRecibida = d.estrellas;
        } else {
          // Llegó después de cerrar: se anota en el historial.
          const h = perfil.historialConductor().find((x) => x.id === d.viajeId);
          if (h) perfil.agregarAlHistorialConductor({ ...h, calificacionRecibida: d.estrellas });
        }
        this.#avisar({ titulo: `Te calificaron con ${'★'.repeat(d.estrellas)}`, cuerpo: (d.etiquetas || []).join(' · '), tipo: 'exito' });
        this.#cambiar({ resumen: perfil.resumenDelDia() });
        break;
      }
      case 'aviso_pasajero':
        this.#cambiar({ mensajePasajero: d.texto });
        this.#avisar({ titulo: 'Mensaje del pasajero', cuerpo: d.texto, tipo: 'info' });
        break;
    }
  }

  /* ---------------- modo real: servidor ---------------- */

  #escucharServidor() {
    this.bus.on('estado_conexion', (e) => {
      this.#cambiar({ estadoBus: e });
      this.emit('conexion', e);
    });
    this.bus.on('bienvenida', (d) => this.#alBienvenida(d));
    this.bus.on('viaje_actual', (d) => {
      clearTimeout(this.relojViajeActual);
      this.#reconciliar(d ?? null);
    });
    this.bus.on('error', (d) => this.#alErrorServidor(d));
    this.bus.on('rechazo', (d) => {
      this.ultimoRechazo = d?.codigo || null;
      // Sin la central no se puede estar en línea (el viaje en curso, si hay, se conserva).
      clearInterval(this.relojPresencia);
      if (this.estado.conectado && !this.estado.viaje) this.#cambiar({ conectado: false, solicitudes: [] });
      this.emit('rechazo', d);
    });
  }

  #retomarReal() {
    let g = null;
    try {
      g = JSON.parse(localStorage.getItem(CLAVE_VIAJE_REAL) || 'null');
    } catch {
      g = null;
    }
    if (!g?.viaje) return;
    // Lo que se estaba confirmando no sobrevive: lo resuelve la central. Se recuerda la
    // oferta por si la central sí lo asignó (llega con la asignación o con viaje_actual).
    if (Date.now() - (g.guardado || 0) > VIAJE_GUARDADO_MAX_MS || g.viaje.fase === 'confirmando') {
      const v = g.viaje;
      if (v.fase === 'confirmando' && v.id && Date.now() - (v.aceptado || 0) < ACEPTADA_VIGENTE_MS) {
        this.aceptadaReciente = { s: { ...v, viajeId: v.id }, cuando: v.aceptado || Date.now() };
      }
      localStorage.removeItem(CLAVE_VIAJE_REAL);
      return;
    }
    this.estado.viaje = g.viaje;
    // Si estaba en línea, sigue en línea al terminar el servicio (se anuncia con la bienvenida).
    if (g.conectado) this.estado.conectado = true;
  }

  #guardarReal() {
    const v = this.estado.viaje;
    try {
      if (!v || v.simulado) localStorage.removeItem(CLAVE_VIAJE_REAL);
      else localStorage.setItem(CLAVE_VIAJE_REAL, JSON.stringify({ guardado: Date.now(), conectado: this.estado.conectado, viaje: v }));
    } catch {
      /* almacenamiento lleno o bloqueado */
    }
  }

  // GPS en modo real: nunca simulado. Sin GPS se ve el centro del pueblo en el mapa,
  // pero no se puede estar en línea ni se anuncia esa posición.
  #configurarGpsReal(pos) {
    // Dos llamadas seguidas (por ejemplo, dos toques en la píldora mientras se espera la
    // primera lectura) no dejan un seguimiento suelto: se detiene el anterior aquí también.
    this.#pararSeguimiento();
    this.estado.gpsReal = Boolean(pos.real);
    this.estado.gpsSimulado = false;
    // Con el permiso negado no hay a quién seguir (hasta otra lectura: «Conectarme», «Llegué»).
    this.gpsNegado = !pos.real && pos.motivo === 'denegado';
    if (pos.real) this.estado.pos = { lat: pos.lat, lng: pos.lng, rumbo: this.estado.pos?.rumbo ?? 0 };
    else if (!this.estado.pos) this.estado.pos = { ...CENTRO, rumbo: 0 };
    if (!pos.real && this.estado.conectado && !this.estado.viaje) {
      clearInterval(this.relojPresencia);
      this.estado.conectado = false;
      this.#anunciar();
    }
    // #cambiar arranca el seguimiento que haga falta (#ajustarSeguimiento).
    this.#cambiar({});
  }

  // Qué seguimiento del GPS hace falta ahora (modo real): 'viaje' con un servicio, 'libre' en
  // turno, 'espera' fuera de turno mientras no haya llegado ninguna lectura buena (también si
  // la primera tardó o no había señal: cuando llegue una, el taxi vuelve a estar disponible), o
  // ninguno.
  #modoGps() {
    if (this.gpsNegado) return null;
    if (this.estado.viaje) return 'viaje';
    if (this.estado.conectado) return 'libre';
    return this.estado.gpsReal ? null : 'espera';
  }

  // Arranca, cambia o detiene el seguimiento según #modoGps(). Se llama con cada #cambiar.
  #ajustarSeguimiento() {
    if (!this.real || this.leyendoGps || this.destruido) return;
    const modo = this.#modoGps();
    // Las opciones solo cambian algo en Android (el intervalo); en lo demás no se reinicia.
    const clave = modo && (GPS_CON_INTERVALO ? `cada ${INTERVALO_GPS_MS[modo]}` : 'siempre');
    if (modo ? this.dejarDeSeguir && clave === this.claveSeguimiento : !this.dejarDeSeguir) return;
    this.#pararSeguimiento();
    if (!modo) return;
    this.claveSeguimiento = clave;
    this.primeraLectura = true;
    // Lo que avise un seguimiento ya reemplazado no cuenta (solo el vigente).
    let dejar = null;
    dejar = seguirPosicion((p) => this.dejarDeSeguir === dejar && this.#alLeerGps(p), {
      intervalo: INTERVALO_GPS_MS[modo],
      alFallar: (e) => this.#alFallarSeguimiento(e, dejar),
    });
    this.dejarDeSeguir = dejar;
  }

  #pararSeguimiento() {
    clearTimeout(this.relojReintentoGps);
    this.relojReintentoGps = null;
    this.dejarDeSeguir?.();
    this.dejarDeSeguir = null;
    this.claveSeguimiento = null;
  }

  // Permiso negado: #gpsPerdido. Si el seguimiento vigente murió (código 3: el plugin lo borró;
  // o no pudo arrancar), se suelta y se vuelve a pedir en un rato: sin esto la posición quedaría
  // congelada (presencia vieja, «Llegué» bloqueado). Los «sin señal» de un seguimiento vivo los
  // resuelve el mismo GPS.
  #alFallarSeguimiento(e, dejar) {
    if (e?.code === 1) return this.#gpsPerdido(e);
    if (!(e?.muerto || e?.code === 3) || this.destruido || this.dejarDeSeguir !== dejar) return;
    this.#pararSeguimiento();
    const espera = this.esperaReintentoGps || REINTENTO_GPS_MS.primero;
    this.esperaReintentoGps = Math.min(espera * 2, REINTENTO_GPS_MS.maximo);
    this.relojReintentoGps = setTimeout(() => {
      this.relojReintentoGps = null;
      // Con la app oculta se pide al volver (#alCambiarVisibilidad).
      if (!appOculta()) this.#ajustarSeguimiento();
    }, espera);
  }

  #alLeerGps(p) {
    this.esperaReintentoGps = 0;
    const recuperado = !this.estado.gpsReal;
    if (recuperado) this.estado.gpsReal = true;
    const primera = this.primeraLectura;
    this.primeraLectura = false;
    this.#moverA({ lat: p.lat, lng: p.lng, rumbo: p.rumbo ?? this.estado.pos?.rumbo ?? 0 });
    // La central lo tenía como no disponible (sin GPS) o, al empezar el turno, con la posición
    // de la última lectura (fuera de turno no se sigue el GPS): se anuncia ya.
    if (this.estado.conectado && (recuperado || (primera && !this.estado.viaje))) this.#anunciar();
    if (recuperado) this.#cambiar({});
  }

  // Al volver a la app: en turno o con servicio, que el seguimiento esté vivo; fuera de turno (no
  // se sigue el GPS), después de un rato, una lectura suelta para que el mapa muestre dónde está.
  #alCambiarVisibilidad(oculta) {
    if (oculta) {
      if (!this.ocultaDesde) this.ocultaDesde = Date.now();
      return;
    }
    const fuera = this.ocultaDesde ? Date.now() - this.ocultaDesde : 0;
    this.ocultaDesde = 0;
    if (this.leyendoGps) return;
    // En turno, con un servicio o esperando la primera lectura: si el seguimiento murió o no ha
    // dado ninguna lectura (arrancó con la app oculta, donde Android no da la ubicación), se pide
    // uno nuevo (el anterior se suelta: nunca quedan dos).
    if (this.#modoGps()) {
      if (!this.dejarDeSeguir || this.primeraLectura) {
        this.esperaReintentoGps = 0;
        this.#pararSeguimiento();
        this.#ajustarSeguimiento();
      }
      return;
    }
    if (fuera >= RELEER_AL_VOLVER_MS && !this.dejarDeSeguir && !this.gpsNegado) this.#releerFueraDeTurno();
  }

  async #releerFueraDeTurno() {
    const pos = await obtenerPosicion({ espera: 8000 });
    // Mientras tanto pudo empezar el turno o un servicio (con su propio seguimiento).
    if (this.destruido || this.dejarDeSeguir || this.leyendoGps || !pos.real) return;
    this.estado.pos = { lat: pos.lat, lng: pos.lng, rumbo: this.estado.pos?.rumbo ?? 0 };
    this.#cambiar({});
  }

  #gpsPerdido(e) {
    // Solo el permiso negado; los «sin señal» momentáneos los resuelve el mismo GPS.
    if (e?.code !== 1) return;
    this.gpsNegado = true;
    this.#pararSeguimiento();
    if (!this.estado.gpsReal) return;
    this.estado.gpsReal = false;
    this.#avisar({ titulo: 'Sin permiso de ubicación', cuerpo: 'Actívalo para seguir recibiendo servicios.', tipo: 'error' });
    if (this.estado.conectado && !this.estado.viaje) this.desconectar();
    else this.#cambiar({});
  }

  // Vuelve a pedir el GPS si no hay seguimiento en marcha (por ejemplo, después de que la
  // persona activó la ubicación). Una sola vez a la vez.
  async #reintentarGps() {
    if (!this.real || this.buscandoGps || (this.estado.gpsReal && this.dejarDeSeguir)) return;
    this.buscandoGps = true;
    try {
      await this.#configurarGps();
      if (this.estado.gpsReal && this.estado.conectado) this.#anunciar();
    } finally {
      this.buscandoGps = false;
    }
  }

  async #conectarReal() {
    // Un segundo toque mientras se espera el GPS (hasta 7 s) no abre otra conexión.
    if (this.conectandoTurno) return false;
    this.conectandoTurno = true;
    try {
      return await this.#conectarRealYa();
    } finally {
      this.conectandoTurno = false;
    }
  }

  async #conectarRealYa() {
    if (!servidor.haySesion()) {
      this.#avisar({ titulo: 'Ingresa de nuevo', cuerpo: servidor.textoError('sin_sesion'), tipo: 'error' });
      return false;
    }
    if (this.bus.estado === 'rechazado') {
      // Se vuelve a intentar (la aprobación o la sesión pudieron cambiar); si sigue el
      // rechazo, llega otra vez el evento 'rechazo'.
      this.bus.conectar();
      this.#avisar({ titulo: 'Conectando con la central…', cuerpo: servidor.textoError(this.ultimoRechazo || 'sin_sesion'), tipo: 'info' });
      return false;
    }
    if (this.bus.estado === 'sin_conectar') this.bus.conectar();
    // Fuera de turno no se sigue el GPS: la última lectura puede ser vieja (o la ubicación del
    // sistema estar apagada desde entonces). Se lee ahora: así no se conecta sin GPS, y la primera
    // presencia y la consulta de solicitudes salen con la posición actual.
    if (!this.estado.gpsReal || !this.dejarDeSeguir) {
      this.buscandoGps = true;
      this.#cambiar({});
      try {
        await this.#configurarGps();
      } finally {
        this.buscandoGps = false;
      }
    }
    if (!this.estado.gpsReal) {
      this.#avisar({ titulo: 'Activa la ubicación para conectarte', cuerpo: 'Con tu ubicación te llegan los servicios cercanos y el pasajero ve por dónde vas.', tipo: 'error' });
      return false;
    }
    this.#cambiar({ conectado: true });
    // Si la central aún no saluda, la presencia sale con la bienvenida.
    this.#anunciar();
    this.bus.publicar('consulta_solicitudes', {});
    this.#arrancarRelojPresencia();
    this.#avisar({ titulo: 'Estás en línea', cuerpo: 'Te llegarán las solicitudes cercanas.', tipo: 'exito' });
    return true;
  }

  #arrancarRelojPresencia() {
    clearInterval(this.relojPresencia);
    this.relojPresencia = setInterval(() => this.#anunciar(), TIEMPOS.presencia);
  }

  #alBienvenida(d) {
    // El id c_… de la bienvenida es con el que la central asigna los servicios.
    if (d?.conductor) perfil.fijarConductorServidor(d.conductor);
    this.revision = Boolean(d?.revision); // modo revisor (cuentas de los revisores de las tiendas)
    // Un servicio de otra cuenta (entró otro conductor en este celular) no se retoma.
    const propio = this.estado.viaje?.conductorId;
    if (propio && d?.conductor?.id && propio !== d.conductor.id) {
      this.aceptadaReciente = null;
      this.#terminar();
    }
    // Solo se revisa el servicio que había al conectar: uno aceptado después es de esta conexión.
    const v = this.estado.viaje;
    this.viajeARevisar = v && !v.simulado && FASES_ACTIVAS.includes(v.fase) ? v.id : null;
    clearTimeout(this.relojViajeActual);
    this.relojViajeActual = setTimeout(() => this.#reconciliar(undefined), ESPERA_VIAJE_ACTUAL_MS);
    // El servidor arranca a cada conductor como no disponible: se anuncia ya.
    if (this.estado.conectado) {
      this.#anunciar();
      if (!this.estado.viaje) this.bus.publicar('consulta_solicitudes', {});
      this.#arrancarRelojPresencia();
    }
    this.#cambiar({});
    this.emit('bienvenida', d);
  }

  // d: datos de viaje_actual; null = el servidor no tiene viaje activo (0.2);
  // undefined = no llegó nada en 2,5 s (servidor 0.1).
  #reconciliar(d) {
    clearTimeout(this.relojViajeActual);
    const aRevisar = this.viajeARevisar;
    this.viajeARevisar = null;
    const v = this.estado.viaje;
    const activo = Boolean(v) && !v.simulado && FASES_ACTIVAS.includes(v.fase);
    if (d && d.viajeId) {
      if (v && v.id === d.viajeId) return this.#seguirDelServidor(d);
      // Un servicio que este teléfono ya cerró (terminó y cobró, o canceló): la central aún
      // no lo sabe porque el cierre salió sin señal o este viaje_actual se armó antes de leer
      // lo que estaba en la cola. Se repite el cierre en vez de retomarlo o cancelarlo.
      const cerrado = perfil.viajeCerrado('conductor', d.viajeId);
      if (cerrado) {
        this.#repetirCierre(cerrado, d.viajeId, d);
        return;
      }
      // La oferta que se aceptó y se soltó por tiempo (o al recargar): la central sí la
      // asignó. Con el servidor 0.1 este viaje_actual no trae origen: se usa la oferta.
      const aceptada = this.aceptadaReciente?.s;
      if (!v && aceptada?.viajeId === d.viajeId && d.estado === 'asignado') {
        return this.#retomarAsignado({ pasajero: d.pasajero, codigoHash: d.codigoHash });
      }
      // La central tiene otro servicio para este conductor: el del teléfono ya no vale.
      if (v) {
        if (activo && v.fase !== 'confirmando') this.#guardarEnHistorial('cancelado', { motivo: 'Terminó sin conexión' });
        this.#terminar();
      }
      if (d.origen && FASE_DEL_SERVIDOR[d.estado]) return this.#rearmar(d);
      // Sin datos para atenderlo (servidor 0.1): se cancela y la central busca otro taxi.
      this.bus.publicar('cancelacion', { viajeId: d.viajeId, conductorId: this.perfil?.id, por: 'conductor', motivo: 'datos_perdidos' });
      this.#avisar({ titulo: 'Cancelamos un servicio anterior', cuerpo: 'No pudimos recuperar sus datos; la central le busca otro taxi al pasajero.', tipo: 'info' });
      return;
    }
    // 'confirmando': la aceptación pudo salir con esta conexión; la resuelve su reloj.
    // Un servicio aceptado después de la bienvenida tampoco se revisa.
    if (!activo || v.fase === 'confirmando' || v.id !== aRevisar) return;
    // El servidor ya no tiene el servicio: el pasajero canceló o se cerró sin conexión.
    this.#guardarEnHistorial('cancelado', { motivo: 'Terminó sin conexión' });
    this.#avisar({ titulo: 'Tu servicio anterior terminó', cuerpo: 'El pasajero canceló o el servicio se cerró mientras estabas sin conexión.', tipo: 'info' });
    this.#terminar();
  }

  // viaje_actual del mismo servicio: manda la fase más avanzada.
  #seguirDelServidor(d) {
    const v = this.estado.viaje;
    const extra = {};
    if (d.pasajero) extra.pasajero = { ...v.pasajero, ...d.pasajero, nombre: v.pasajero?.nombre || d.pasajero.nombre, celular: d.pasajero.celular || v.pasajero?.celular || '' };
    if (!v.origen && d.origen) extra.origen = d.origen;
    if (!v.destino && d.destino) extra.destino = d.destino;
    if (!v.codigoHash && d.codigoHash) extra.codigoHash = d.codigoHash;
    const faseServidor = FASE_DEL_SERVIDOR[d.estado];
    if (!faseServidor) return this.#faseViaje(v.fase, extra);
    if (ORDEN_FASES[v.fase] < ORDEN_FASES[faseServidor]) {
      // La central va adelante (p. ej. confirmó mientras no había conexión).
      if (v.fase === 'confirmando') {
        clearTimeout(this.temporizadores.get('confirmar'));
        Object.assign(extra, { esperaTexto: null, esperaHasta: null });
        this.#avisar({ titulo: 'Servicio confirmado', cuerpo: `Recoge a ${v.pasajero?.nombre || 'tu pasajero'} en ${v.origen?.titulo || 'el punto marcado'}.`, tipo: 'exito' });
      }
      if (faseServidor === 'en_viaje' && !v.inicio) extra.inicio = Date.now();
      this.#faseViaje(faseServidor, extra);
      this.#rutaHaciaObjetivo();
    } else {
      this.#faseViaje(v.fase, extra);
      // El teléfono va adelante: lo que no alcanzó a llegar a la central se manda otra vez.
      if (ORDEN_FASES[v.fase] > ORDEN_FASES[faseServidor]) this.#reenviarFase(this.estado.viaje, d.estado);
    }
    this.#anunciar();
  }

  #reenviarFase(v, estadoServidor) {
    const base = { viajeId: v.id, conductorId: this.perfil?.id };
    if (v.fase === 'en_origen' && estadoServidor === 'asignado') this.bus.publicar('estado', { ...base, fase: 'llego' });
    else if (v.fase === 'en_viaje') this.bus.publicar('estado', { ...base, fase: 'en_viaje' });
    else if (['cobrando', 'calificar'].includes(v.fase)) {
      this.bus.publicar('estado', { ...base, fase: 'finalizado', valor: v.valor, km: v.km });
      // Ya confirmó el efectivo: que al pasajero también le llegue.
      if (v.fase === 'calificar' && v.pago) this.bus.publicar('pago_confirmado', { ...base, metodo: v.pago.metodo, valor: v.pago.valor, billetera: null, ref: null });
    }
  }

  // Repite el cierre de un servicio que este teléfono ya cerró (ver #reconciliar). La
  // central ignora lo que ya no aplica (un fin repetido, una cancelación de algo cerrado).
  #repetirCierre(cerrado, viajeId, d = null) {
    const base = { viajeId, conductorId: this.perfil?.id };
    if (cerrado.final === 'cancelado') {
      this.bus.publicar('cancelacion', { ...base, por: 'conductor', motivo: cerrado.motivo || '' });
    } else {
      // Si la central rechaza ese valor (valor_invalido), el servicio se retoma con estos datos.
      this.cierreRepetido = { d, cuando: Date.now() };
      this.bus.publicar('estado', { ...base, fase: 'finalizado', valor: cerrado.valor, km: cerrado.km });
      if (cerrado.pago) this.bus.publicar('pago_confirmado', { ...base, metodo: cerrado.pago.metodo, valor: cerrado.pago.valor, billetera: null, ref: null });
      if (cerrado.estrellas) this.bus.publicar('calificacion', { viajeId, de: 'conductor', estrellas: cerrado.estrellas, etiquetas: cerrado.etiquetas || [], comentario: cerrado.comentario || '' });
    }
    // La central lo tenía ocupado con ese servicio: queda libre otra vez.
    this.#anunciar();
  }

  // viaje_actual de un servicio que el teléfono no tiene (servidor 0.2: trae los datos).
  // aviso: el que se muestra en vez de «Retomamos tu servicio».
  #rearmar(d, aviso = null) {
    const fase = FASE_DEL_SERVIDOR[d.estado];
    const viaje = {
      id: d.viajeId,
      pasajero: { id: d.pasajero?.id || null, nombre: d.pasajero?.nombre || 'Pasajero', calificacion: d.pasajero?.calificacion ?? null, celular: d.pasajero?.celular || '' },
      origen: d.origen,
      destino: d.destino || null,
      metodoPago: d.metodoPago || 'efectivo',
      nota: d.nota || '',
      tarifa: Number(d.tarifa) || 0,
      km: d.km ?? null,
      min: d.min ?? null,
      codigoHash: d.codigoHash || null,
      codigoSimulado: null,
      codigoRevision: this.#codigoDePrueba(d),
      simulado: false,
      fase,
      aceptado: Date.now(),
      pago: null,
      rearmado: true,
      conductorId: this.perfil?.id || null,
    };
    if (fase === 'en_viaje') viaje.inicio = Date.now();
    this.#cambiar({ viaje, solicitudes: [], rutaActual: null, etaMin: null, kmRestantes: null, mensajePasajero: null });
    this.#avisar(aviso || {
      titulo: 'Retomamos tu servicio',
      cuerpo: fase === 'en_viaje' ? `Lleva a ${viaje.pasajero.nombre} a ${viaje.destino?.titulo || 'su destino'}.` : `Recoge a ${viaje.pasajero.nombre} en ${viaje.origen?.titulo || 'el punto marcado'}.`,
      tipo: 'info',
    });
    this.#rutaHaciaObjetivo();
    this.#anunciar();
  }

  // La asignación llegó después de soltar el servicio por tiempo.
  #retomarAsignado(d) {
    const { s } = this.aceptadaReciente;
    this.aceptadaReciente = null;
    const viaje = {
      id: s.viajeId,
      pasajero: { ...s.pasajero, celular: d.pasajero?.celular || '' },
      origen: s.origen,
      destino: s.destino,
      metodoPago: s.metodoPago,
      nota: s.nota,
      tarifa: s.tarifa,
      km: s.km,
      min: s.min,
      codigoHash: d.codigoHash || s.codigoHash || null, // 0.2.1: llega con la asignación
      codigoSimulado: null,
      codigoRevision: this.#codigoDePrueba(s),
      simulado: false,
      fase: 'hacia_origen',
      aceptado: Date.now(),
      pago: null,
      conductorId: this.perfil?.id || null,
    };
    this.#cambiar({ viaje, solicitudes: [], mensajePasajero: null });
    this.#avisar({ titulo: 'Servicio confirmado', cuerpo: `Recoge a ${s.pasajero?.nombre || 'tu pasajero'} en ${s.origen?.titulo || 'el punto marcado'}.`, tipo: 'exito' });
    this.#rutaHaciaObjetivo();
    this.#anunciar();
  }

  // Ruta desde donde está el taxi hasta el punto de recogida o el destino.
  #rutaHaciaObjetivo() {
    this.#llegadaSinMoverse();
    const v = this.estado.viaje;
    if (!v || !this.estado.pos) return;
    const objetivo = v.fase === 'hacia_origen' ? v.origen : v.fase === 'en_viaje' ? v.destino : null;
    if (!objetivo) return;
    calcularRuta(this.estado.pos, objetivo)
      .then((r) => {
        if (!r || this.estado.viaje?.id !== v.id || this.estado.viaje.fase !== v.fase) return;
        this.#cambiar({ rutaActual: r.coords, etaMin: r.min, kmRestantes: r.km });
      })
      .catch(() => {});
  }

  // Errores del servidor (sin viajeId: responden a lo último que se mandó).
  #alErrorServidor(d) {
    const codigo = d?.codigo || '';
    this.emit('error_servidor', { codigo, texto: servidor.textoError(codigo) });
    if (codigo === 'valor_invalido') return this.#valorRechazado();
    const v = this.estado.viaje;
    if (!['servicio_no_disponible', 'ya_tienes_un_servicio'].includes(codigo) || v?.fase !== 'confirmando') return;
    clearTimeout(this.temporizadores.get('confirmar'));
    this.aceptadaReciente = null;
    this.#avisar({ titulo: servidor.textoError(codigo), cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'info' });
    this.#terminar();
    // La central dice que ya hay un servicio a tu nombre: al reconectar llega con viaje_actual.
    if (codigo === 'ya_tienes_un_servicio') this.bus.reconectar();
  }

  // La central no aceptó el valor del cobro (servidor 0.2.2: más de 3 veces el máximo de la
  // tarifa de la cooperativa) y el viaje sigue en curso allá; al pasajero no le llegó el fin.
  // Se vuelve a «En viaje» para corregir el valor y terminar otra vez: mientras tanto no se
  // registra el pago ni se califica (piden la fase de cobro).
  #valorRechazado() {
    const v = this.estado.viaje;
    // 'alerta' y no 'error': el diseño A quita los avisos de error al cambiar de pantalla.
    const aviso = { titulo: 'Revisa el valor del viaje', cuerpo: servidor.textoError('valor_invalido'), tipo: 'alerta' };
    if (v && !v.simulado && ['cobrando', 'calificar'].includes(v.fase)) {
      this.#faseViaje('en_viaje', { valor: null, valorRechazado: v.valor ?? null, urlCobro: null, fin: null, pago: null, pagoAnunciado: null });
      this.#avisar(aviso);
      // Si sigue en el destino, «Terminar viaje» vuelve a resaltarse.
      this.llegadaAvisada = null;
      if (this.estado.gpsReal && this.estado.pos) this.#moverA(this.estado.pos);
      this.#rutaHaciaObjetivo();
      return;
    }
    // El fin que se repitió al reconectar (el teléfono ya había cerrado el servicio sin
    // señal, ver #repetirCierre): sin esto la central lo tendría en curso para siempre.
    const r = this.cierreRepetido;
    this.cierreRepetido = null;
    if (v) return;
    if (r?.d?.origen && FASE_DEL_SERVIDOR[r.d.estado] && Date.now() - r.cuando < 15000) {
      this.#rearmar({ ...r.d, estado: 'en_viaje' }, aviso);
      return;
    }
    // El fin salió tarde (la conexión se trabó sin cortarse) y el teléfono ya cobró y
    // calificó: la central lo sigue teniendo en curso y no le manda solicitudes. Se
    // reconecta para que llegue con viaje_actual y se retome como arriba (una vez cada 30 s).
    if (Date.now() - (this.reconexionPorValor || 0) > 30000) {
      this.reconexionPorValor = Date.now();
      this.bus.reconectar();
    }
  }

  async #avisar(aviso) {
    const a = await avisar(aviso);
    this.emit('aviso', a);
  }

  #cambiar(cambios) {
    Object.assign(this.estado, cambios);
    if (this.real && ('viaje' in cambios || 'conectado' in cambios)) this.#guardarReal();
    // Modo real: el GPS se sigue o se suelta según el turno y el servicio.
    if (this.real) this.#ajustarSeguimiento();
    this.emit('cambio', this.estado);
  }

  // Cambia entre GPS real y simulado (true/false/null = automático).
  async usarGpsSimulado(valor) {
    if (this.real) return; // en la app real el GPS siempre es el de verdad
    perfil.guardarAjustes({ gpsSimulado: valor });
    await this.#configurarGps();
    if (this.estado.conectado) this.#anunciar();
  }

  textoResumen() {
    const r = this.estado.resumen;
    return `${r.viajes} viajes · ${pesos(r.ganado)} · ${kmTexto(r.km)} · ${r.promedio ? r.promedio.toFixed(1) : '—'}★`;
  }

  etaTexto() {
    return this.estado.etaMin == null ? '' : minutosTexto(this.estado.etaMin);
  }

  destruir() {
    this.destruido = true;
    clearInterval(this.relojPresencia);
    clearTimeout(this.relojViajeActual);
    clearTimeout(this.relojReintentoGps);
    this.recorrido?.detener();
    this.dejarVisibilidad?.();
    this.dejarDeSeguir?.();
    this.dejarDeSeguir = null;
    this.pasajeroSim?.detener();
    this.bus.cerrar();
  }
}
