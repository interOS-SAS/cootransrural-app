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
import { Bus } from './bus.js';
import { TIEMPOS, CENTRO } from './config.js';
import { calcularRuta, obtenerPosicion, seguirPosicion, fueraDeZona, direccionDe } from './geo.js';
import { calcularTarifa } from './tarifas.js';
import { avisar } from './avisos.js';
import { recorrer, duracionSimulada, crearSolicitudSimulada, PasajeroSimulado } from './simulador.js';
import { urlPago } from './qr.js';
import * as perfil from './perfil.js';
import { Emisor, hashCorto, distanciaKm, pesos, kmTexto, minutosTexto } from './util.js';

export async function crearConductor(opciones = {}) {
  const ctl = new ControladorConductor(opciones);
  await ctl.arrancar();
  return ctl;
}

class ControladorConductor extends Emisor {
  constructor() {
    super();
    this.bus = new Bus();
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
  }

  async arrancar() {
    this.bus.on('conexion', (c) => this.#cambiar({ conexion: c }));
    for (const tipo of ['solicitud', 'asignacion', 'cancelacion', 'pago', 'calificacion']) {
      this.bus.on(tipo, (datos) => this.#manejar(tipo, datos));
    }
    this.bus.on('consulta_presencia', () => {
      if (this.estado.conectado) this.#anunciar();
    });
    await this.#configurarGps();
  }

  async #configurarGps() {
    this.dejarDeSeguir?.();
    this.dejarDeSeguir = null;
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
    return Boolean(perfil.conductor());
  }

  historial() {
    return perfil.historialConductor();
  }

  /* ---------------- disponibilidad ---------------- */

  conectar() {
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

  async #recibirSolicitud(s) {
    if (!this.estado.conectado || this.estado.viaje) return;
    if (this.estado.solicitudes.some((x) => x.viajeId === s.viajeId)) return;
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
    for (const id of this.temporizadores.keys()) clearTimeout(this.temporizadores.get(id));
    this.temporizadores.clear();
    const c = this.perfil;
    const pos = this.estado.pos || CENTRO;
    const hacia = await calcularRuta(pos, s.origen);
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
      simulado: Boolean(s.simulada),
      fase: s.simulada ? 'hacia_origen' : 'confirmando',
      aceptado: Date.now(),
      pago: null,
    };
    this.#cambiar({ viaje, solicitudes: [], rutaActual: hacia.coords, etaMin: hacia.min, kmRestantes: hacia.km, mensajePasajero: null });
    this.#anunciar();

    if (viaje.simulado) {
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
    this.emit('posicion', p);
    this.emit('cambio', this.estado);
  }

  /* ---------------- viaje ---------------- */

  llegue() {
    const v = this.estado.viaje;
    if (!v || !['hacia_origen'].includes(v.fase)) return;
    this.recorrido?.detener();
    this.recorrido = null;
    this.#moverA({ ...v.origen, rumbo: this.estado.pos?.rumbo || 0 });
    this.#faseViaje('en_origen');
    if (!v.simulado) this.bus.publicar('estado', { viajeId: v.id, conductorId: this.perfil.id, fase: 'llego' });
    this.#avisar({ titulo: 'Le avisamos al pasajero', cuerpo: 'Ya sabe que estás en la puerta.', tipo: 'info' });
    this.pasajeroSim?.alLlegarConductor();
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
    if (v.destino && (!this.estado.gpsReal || v.simulado)) this.#moverA({ ...v.destino, rumbo: this.estado.pos?.rumbo || 0 });
    const valor = Math.round(valorManual || v.tarifa || 8000);
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
    this.pasajeroSim?.alCalificar();
    this.#guardarEnHistorial('finalizado', { calificacionDada: estrellas });
    // Se espera un momento por si llega la calificación del pasajero simulado.
    this.#terminar();
  }

  cancelar(motivo = 'El pasajero no aparece') {
    const v = this.estado.viaje;
    if (!v || ['cobrando', 'calificar'].includes(v.fase)) return;
    if (!v.simulado) this.bus.publicar('cancelacion', { viajeId: v.id, conductorId: this.perfil.id, por: 'conductor', motivo });
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
        if (v && v.id === d.viajeId && v.fase === 'confirmando') {
          clearTimeout(this.temporizadores.get('confirmar'));
          if (d.conductorId === this.perfil?.id) {
            this.#faseViaje('hacia_origen');
            this.#avisar({ titulo: 'Servicio confirmado', cuerpo: `Recoge a ${v.pasajero.nombre} en ${v.origen.titulo || 'el punto marcado'}.`, tipo: 'exito' });
            calcularRuta(this.estado.pos || CENTRO, v.origen).then((r) => this.#conducir(r));
          } else {
            this.#avisar({ titulo: 'Otro conductor tomó el servicio', cuerpo: 'Sigue atento a nuevas solicitudes.', tipo: 'info' });
            this.#terminar();
          }
        } else if (d.conductorId !== this.perfil?.id) {
          this.rechazar(d.viajeId);
        }
        break;
      }
      case 'cancelacion': {
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
        if (v && v.id === d.viajeId && v.fase === 'cobrando') this.#registrarPago({ metodo: d.metodo, valor: d.valor, billetera: d.billetera, ref: d.ref });
        break;
      }
      case 'calificacion': {
        if (d.de !== 'pasajero') break;
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

  async #avisar(aviso) {
    const a = await avisar(aviso);
    this.emit('aviso', a);
  }

  #cambiar(cambios) {
    Object.assign(this.estado, cambios);
    this.emit('cambio', this.estado);
  }

  // Cambia entre GPS real y simulado (true/false/null = automático).
  async usarGpsSimulado(valor) {
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
    clearInterval(this.relojPresencia);
    this.recorrido?.detener();
    this.dejarDeSeguir?.();
    this.pasajeroSim?.detener();
    this.bus.cerrar();
  }
}
