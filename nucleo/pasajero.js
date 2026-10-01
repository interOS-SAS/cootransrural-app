// Lógica de la app del pasajero, independiente del diseño visual.
//
//   const p = await crearPasajero();
//   p.on('cambio', (estado) => pintar(estado));
//   p.on('aviso', ({ titulo, cuerpo, tipo }) => mostrarAviso(...));
//   await p.solicitar({ origen, destino, metodoPago: 'qr' });
//
// Fases: inicio → buscando → asignado → llego → en_viaje → pagar → calificar → inicio
import { Bus } from './bus.js';
import { TIEMPOS, CENTRO, EMPRESA } from './config.js';
import { calcularRuta, obtenerPosicion, fueraDeZona } from './geo.js';
import { calcularTarifa } from './tarifas.js';
import { avisar } from './avisos.js';
import { TaxisAmbiente, ConductorSimulado } from './simulador.js';
import { leerCobro, urlPago } from './qr.js';
import * as perfil from './perfil.js';
import { Emisor, uid, codigoNumerico, hashCorto, distanciaKm, pesos, minutosTexto, primerNombre, enlaceMapa, fechaTexto, horaTexto } from './util.js';

export const FASES = ['inicio', 'buscando', 'asignado', 'llego', 'en_viaje', 'pagar', 'calificar'];

export async function crearPasajero(opciones = {}) {
  const ctl = new ControladorPasajero(opciones);
  await ctl.arrancar();
  return ctl;
}

class ControladorPasajero extends Emisor {
  constructor({ ambiente = true } = {}) {
    super();
    this.bus = new Bus();
    this.usarAmbiente = ambiente;
    this.estado = {
      fase: 'inicio',
      viaje: null,
      conductor: null,
      posConductor: null,
      rutaConductor: null,
      etaMin: null,
      cobro: null,
      pago: null,
      pagoConfirmado: false,
      calificacionRecibida: null,
      miPosicion: null,
      taxisCercanos: [],
      conductoresReales: 0,
      conexion: this.bus.conexion,
      sala: this.bus.sala,
      ultimoAviso: null,
    };
    this.reales = new Map(); // conductorId → presencia
    this.simulado = null;
    this.temporizadorBusqueda = null;
    this.avisosDados = new Set();
  }

  async arrancar() {
    this.bus.on('conexion', (c) => {
      this.#cambiar({ conexion: c });
      if (c === 'en-vivo') this.bus.publicar('consulta_presencia', {});
    });
    for (const tipo of ['presencia', 'aceptacion', 'ubicacion', 'estado', 'cobro', 'cancelacion', 'calificacion', 'pago_confirmado']) {
      this.bus.on(tipo, (datos, msj) => this.#manejar(tipo, datos, msj));
    }
    // Un conductor que se conecta tarde pide las solicitudes que siguen buscando.
    this.bus.on('consulta_solicitudes', () => {
      if (this.estado.fase === 'buscando' && this.estado.viaje && !this.estado.viaje.simulado) this.#publicarSolicitud();
    });
    // Retomar un viaje en curso si se recargó la página.
    const guardado = JSON.parse(sessionStorage.getItem('ct.viaje.pasajero') || 'null');
    if (guardado && Date.now() - guardado.guardado < 30 * 60 * 1000 && guardado.fase !== 'inicio') {
      Object.assign(this.estado, guardado.estado);
      if (this.estado.viaje?.simulado && ['buscando', 'asignado', 'llego', 'en_viaje'].includes(this.estado.fase)) {
        // La simulación no sobrevive a la recarga: se vuelve a pedir.
        this.estado.fase = 'inicio';
        this.estado.viaje = null;
      }
    }
    // Pide a los conductores en línea que se anuncien ya (sin esperar su turno).
    this.bus.publicar('consulta_presencia', {});
    const pos = await obtenerPosicion({ espera: 6000 });
    this.estado.miPosicion = pos;
    if (this.usarAmbiente) {
      const centroSim = pos.real && !fueraDeZona(pos) ? pos : pos.real ? pos : CENTRO;
      this.ambiente = new TaxisAmbiente(centroSim, { cantidad: 5 });
      this.relojTaxis = setInterval(() => this.#actualizarTaxis(), 1000);
    }
    this.#cambiar({});
  }

  /* ---------------- consultas ---------------- */

  get perfil() {
    return perfil.pasajero();
  }

  get registrado() {
    return Boolean(perfil.pasajero()?.nombre);
  }

  viajesCompletados() {
    return perfil.viajesCompletadosPasajero();
  }

  // Ruta y tarifa estimada para mostrar antes de pedir.
  async cotizar({ origen, destino, programadoPara = null }) {
    const ruta = destino ? await calcularRuta(origen, destino) : null;
    const fecha = programadoPara ? new Date(programadoPara) : new Date();
    const programado = Boolean(programadoPara) && new Date(programadoPara) - Date.now() >= 23.98 * 3600 * 1000;
    const tarifa = calcularTarifa({ origen, destino, km: ruta?.km, fecha, programado, viajesPrevios: this.viajesCompletados() });
    return { ruta, tarifa };
  }

  async actualizarMiPosicion() {
    const pos = await obtenerPosicion({ espera: 8000 });
    this.#cambiar({ miPosicion: pos });
    return pos;
  }

  /* ---------------- acciones ---------------- */

  // Pide el taxi. Si programadoPara es más de 30 min en el futuro, lo guarda como programado.
  async solicitar({ origen, destino = null, metodoPago = 'qr', programadoPara = null, nota = '' }) {
    if (!origen) throw new Error('Falta el punto de recogida');
    if (!this.registrado) throw new Error('Primero hay que registrarse');
    const { ruta, tarifa } = await this.cotizar({ origen, destino, programadoPara });
    if (destino) perfil.agregarReciente(destino);

    if (programadoPara && new Date(programadoPara) - Date.now() > 30 * 60 * 1000) {
      const prog = { id: uid('pr'), origen, destino, metodoPago, nota, fecha: new Date(programadoPara).getTime(), tarifa, creado: Date.now() };
      perfil.guardarProgramado(prog);
      const cuando = `${fechaTexto(programadoPara)}, ${horaTexto(programadoPara)}`;
      this.#avisar({ titulo: 'Viaje programado', cuerpo: `Te recogemos el ${cuando}${tarifa.descuento ? ` · Ahorras ${pesos(tarifa.descuento)}` : ''}`, tipo: 'exito' });
      this.#cambiar({});
      return { programado: prog };
    }

    const codigo = codigoNumerico(4);
    const viaje = {
      id: uid('v'),
      origen,
      destino,
      ruta,
      tarifa,
      metodoPago,
      nota,
      codigo,
      creado: Date.now(),
      intentos: 1,
      simulado: false,
    };
    this.avisosDados.clear();
    this.#cambiar({ fase: 'buscando', viaje, conductor: null, posConductor: null, rutaConductor: null, etaMin: null, cobro: null, pago: null, pagoConfirmado: false, calificacionRecibida: null });
    this.#publicarSolicitud();
    this.#programarRespaldo();
    return { viaje };
  }

  #publicarSolicitud() {
    const { viaje } = this.estado;
    const yo = this.perfil;
    this.bus.publicar('solicitud', {
      viajeId: viaje.id,
      pasajero: { id: yo.id, nombre: primerNombre(yo.nombre), calificacion: yo.calificacion || 5, celular: yo.celular },
      origen: viaje.origen,
      destino: viaje.destino,
      metodoPago: viaje.metodoPago,
      nota: viaje.nota,
      tarifa: viaje.tarifa.total,
      km: viaje.ruta?.km || null,
      min: viaje.ruta?.min || null,
      codigoHash: hashCorto(viaje.id + viaje.codigo),
      referido: perfil.referido(),
    });
  }

  // Si nadie acepta, entra el conductor de prueba (salvo en modo «solo reales»).
  #programarRespaldo() {
    clearTimeout(this.temporizadorBusqueda);
    const modo = perfil.ajustes().simulacion;
    const hayReales = this.#conductoresRealesDisponibles().length > 0;
    if (modo === 'real') {
      this.temporizadorBusqueda = setTimeout(() => {
        if (this.estado.fase !== 'buscando') return;
        this.#avisar({ titulo: 'Ningún conductor aceptó', cuerpo: 'Intenta de nuevo o llama a la central.', tipo: 'error' });
        this.#cerrarViaje('sin-conductor');
      }, 90000);
      return;
    }
    const espera = hayReales ? TIEMPOS.esperaConConductores : TIEMPOS.esperaSinConductores;
    this.temporizadorBusqueda = setTimeout(() => this.#activarSimulado(), espera);
  }

  #activarSimulado() {
    if (this.estado.fase !== 'buscando') return;
    const viaje = { ...this.estado.viaje, simulado: true };
    this.estado.viaje = viaje;
    this.simulado = new ConductorSimulado({ viaje, ambiente: this.ambiente, entregar: (tipo, datos) => this.#manejar(tipo, datos, { simulado: true }) });
    this.simulado.iniciar();
  }

  cancelar(motivo = 'Ya no lo necesito') {
    const { viaje, fase } = this.estado;
    if (!viaje || !['buscando', 'asignado', 'llego'].includes(fase)) return;
    if (!viaje.simulado) this.bus.publicar('cancelacion', { viajeId: viaje.id, por: 'pasajero', motivo });
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo }));
    this.#avisar({ titulo: 'Servicio cancelado', cuerpo: motivo, tipo: 'info' });
    this.#cerrarViaje('cancelado');
  }

  // Pago con QR. `lectura` es el texto leído por la cámara (o null para usar el
  // cobro recibido del conductor directamente, como «pago simulado»).
  pagarConQR(lectura = null, billetera = 'Bre-B') {
    const { viaje, cobro } = this.estado;
    if (!viaje || this.estado.fase !== 'pagar') return { ok: false, error: 'No hay nada por pagar' };
    let datos = cobro;
    if (lectura) {
      const leido = leerCobro(lectura);
      if (!leido) return { ok: false, error: `Ese código no es un cobro de ${EMPRESA.nombre}` };
      if (leido.viaje !== viaje.id) return { ok: false, error: 'Ese QR es de otro viaje' };
      datos = { valor: leido.valor };
    }
    const valor = datos?.valor || viaje.tarifa.total;
    const pago = { metodo: 'qr', billetera, valor, ref: uid('PG').toUpperCase().slice(0, 10), hora: Date.now() };
    this.#confirmarPago(pago);
    return { ok: true, pago };
  }

  pagarEnEfectivo() {
    const { viaje, cobro } = this.estado;
    if (!viaje || this.estado.fase !== 'pagar') return { ok: false };
    const pago = { metodo: 'efectivo', valor: cobro?.valor || viaje.tarifa.total, ref: null, hora: Date.now() };
    this.#confirmarPago(pago);
    return { ok: true, pago };
  }

  #confirmarPago(pago) {
    const { viaje, conductor } = this.estado;
    if (!viaje.simulado) this.bus.publicar('pago', { viajeId: viaje.id, conductorId: conductor?.id, ...pago });
    this.#avisar({ titulo: pago.metodo === 'qr' ? 'Pago exitoso (prueba)' : 'Pago en efectivo', cuerpo: `${pesos(pago.valor)} · Móvil ${conductor?.movil || ''}`, tipo: 'exito' });
    this.#cambiar({ fase: 'calificar', pago });
    this.simulado?.alPagar();
  }

  calificar(estrellas, { etiquetas = [], comentario = '' } = {}) {
    const { viaje, conductor } = this.estado;
    if (!viaje) return;
    if (!viaje.simulado) this.bus.publicar('calificacion', { viajeId: viaje.id, conductorId: conductor?.id, de: 'pasajero', estrellas, etiquetas, comentario });
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('finalizado', { calificacionDada: estrellas }));
    const completados = this.viajesCompletados();
    if (completados > 0 && completados % 10 === 0) {
      this.#avisar({ titulo: '¡Tu próximo viaje va al 50 %!', cuerpo: `Completaste ${completados} viajes con ${EMPRESA.nombre}.`, tipo: 'exito' });
    } else {
      this.#avisar({ titulo: `¡Gracias por viajar con ${EMPRESA.nombre}!`, cuerpo: 'Tu calificación ayuda a mejorar el servicio.', tipo: 'exito' });
    }
    this.#cerrarViaje('finalizado');
  }

  omitirCalificacion() {
    if (!this.estado.viaje) return;
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('finalizado', {}));
    this.#cerrarViaje('finalizado');
  }

  // Texto para compartir el viaje por WhatsApp (seguridad).
  textoCompartir() {
    const { viaje, conductor, posConductor } = this.estado;
    if (!viaje || !conductor) return '';
    return [
      `🚕 Voy en un taxi de ${EMPRESA.nombre}`,
      `Móvil ${conductor.movil} · Placa ${conductor.placa}`,
      `Conductor: ${conductor.nombre}`,
      viaje.destino ? `Destino: ${viaje.destino.titulo || ''}` : '',
      posConductor ? `Ubicación actual: ${enlaceMapa(posConductor)}` : '',
    ].filter(Boolean).join('\n');
  }

  // Cobro que el conductor debe mostrar en pantalla (para la simulación).
  urlCobroActual() {
    const { viaje, conductor, cobro } = this.estado;
    if (!viaje || !cobro) return null;
    return urlPago({ viaje: viaje.id, valor: cobro.valor, movil: conductor?.movil, sala: this.bus.sala });
  }

  /* ---------------- mensajes ---------------- */

  #manejar(tipo, d, msj = {}) {
    const { viaje, fase, conductor } = this.estado;
    if (tipo === 'presencia') {
      if (d.disponible) this.reales.set(d.conductorId, { ...d, visto: Date.now() });
      else this.reales.delete(d.conductorId);
      return;
    }
    if (!viaje || d.viajeId !== viaje.id) return;

    switch (tipo) {
      case 'aceptacion': {
        if (fase !== 'buscando') {
          // Otro conductor aceptó tarde: se le avisa que el servicio ya tiene taxi.
          if (!msj.simulado && d.conductor?.id !== conductor?.id) this.bus.publicar('asignacion', { viajeId: viaje.id, conductorId: conductor?.id });
          return;
        }
        clearTimeout(this.temporizadorBusqueda);
        if (!msj.simulado) this.bus.publicar('asignacion', { viajeId: viaje.id, conductorId: d.conductor.id });
        const eta = d.etaMin ?? null;
        this.#cambiar({ fase: 'asignado', conductor: d.conductor, posConductor: d.pos, rutaConductor: d.ruta || null, etaMin: eta, asignadoEn: Date.now() });
        this.#avisar({
          titulo: '¡Tu taxi va en camino!',
          cuerpo: `Móvil ${d.conductor.movil} · ${d.conductor.placa} · ${primerNombre(d.conductor.nombre)}${eta ? ` llega en ${minutosTexto(eta)}` : ''}`,
          tipo: 'exito',
        });
        break;
      }
      case 'ubicacion': {
        if (d.conductorId && conductor && d.conductorId !== conductor.id) return;
        const cambios = { posConductor: d.pos };
        if (fase === 'asignado') {
          const km = distanciaKm(d.pos, viaje.origen);
          cambios.etaMin = d.etaMin ?? (km * 1.3 / 25) * 60;
          if (km < 0.3) cambios.etaMin = Math.min(cambios.etaMin, 1);
          const desdeAsignacion = Date.now() - (this.estado.asignadoEn || 0);
          if (km < 0.3 && desdeAsignacion > 10000 && !this.avisosDados.has('cerca')) {
            this.avisosDados.add('cerca');
            this.#avisar({ titulo: 'Tu taxi está llegando', cuerpo: `El móvil ${conductor.movil} está a menos de 1 minuto. Alístate.`, tipo: 'info' });
          }
        } else if (fase === 'en_viaje') {
          cambios.etaMin = d.etaMin ?? (viaje.destino ? (distanciaKm(d.pos, viaje.destino) * 1.3 / 30) * 60 : null);
        }
        this.#cambiar(cambios);
        break;
      }
      case 'estado': {
        if (d.fase === 'llego' && ['asignado'].includes(fase)) {
          this.#cambiar({ fase: 'llego', etaMin: 0 });
          this.#avisar({ titulo: '¡Tu taxi está en la puerta!', cuerpo: `Móvil ${conductor.movil} · Placa ${conductor.placa}. Tu código es ${viaje.codigo}.`, tipo: 'alerta' });
        } else if (d.fase === 'en_viaje' && ['asignado', 'llego'].includes(fase)) {
          // El tiempo de llegada a la puerta (0) no sirve para el viaje: se arranca con el de
          // la ruta hasta que el conductor mande su posición (con el GPS quieto no la manda).
          this.#cambiar({ fase: 'en_viaje', inicioViaje: Date.now(), etaMin: viaje.ruta?.min ?? null });
          this.#avisar({ titulo: 'Viaje iniciado', cuerpo: viaje.destino ? `Rumbo a ${viaje.destino.titulo || 'tu destino'}. ¡Buen viaje!` : '¡Buen viaje!', tipo: 'info' });
        } else if (d.fase === 'finalizado' && ['en_viaje', 'llego', 'asignado'].includes(fase)) {
          const valor = d.valor || viaje.tarifa.total;
          this.#cambiar({ fase: 'pagar', cobro: { valor }, etaMin: 0, finViaje: Date.now(), kmFinal: d.km || viaje.ruta?.km || null });
          this.#avisar({ titulo: 'Llegaste a tu destino', cuerpo: `Total: ${pesos(valor)}. Paga con QR o en efectivo.`, tipo: 'exito' });
        }
        break;
      }
      case 'cobro': {
        this.#cambiar({ cobro: { valor: d.valor, url: d.url || null } });
        break;
      }
      case 'pago_confirmado': {
        // Si el pasajero pagó escaneando con la cámara del celular (fuera de la
        // app), el conductor lo confirma y aquí se pasa directo a calificar.
        if (fase === 'pagar') {
          const pago = { metodo: d.metodo || 'qr', billetera: d.billetera || null, valor: d.valor || this.estado.cobro?.valor || viaje.tarifa.total, ref: d.ref || null, hora: Date.now(), externo: true };
          this.#cambiar({ fase: 'calificar', pago, pagoConfirmado: true });
          this.#avisar({ titulo: 'Pago recibido', cuerpo: `${pesos(pago.valor)} · el conductor confirmó tu pago`, tipo: 'exito' });
        } else {
          this.#cambiar({ pagoConfirmado: true });
        }
        break;
      }
      case 'cancelacion': {
        if (d.por !== 'conductor' || !conductor || (d.conductorId && d.conductorId !== conductor.id)) return;
        this.#avisar({ titulo: 'El conductor canceló', cuerpo: `${d.motivo || ''}. Te buscamos otro taxi.`, tipo: 'alerta' });
        viaje.intentos += 1;
        this.#cambiar({ fase: 'buscando', conductor: null, posConductor: null, rutaConductor: null, etaMin: null });
        this.#publicarSolicitud();
        this.#programarRespaldo();
        break;
      }
      case 'calificacion': {
        if (d.de === 'conductor') this.#cambiar({ calificacionRecibida: d.estrellas });
        break;
      }
    }
  }

  /* ---------------- interno ---------------- */

  #conductoresRealesDisponibles() {
    const limite = Date.now() - TIEMPOS.presenciaVence;
    for (const [id, p] of this.reales) if (p.visto < limite) this.reales.delete(id);
    return [...this.reales.values()];
  }

  #actualizarTaxis() {
    const reales = this.#conductoresRealesDisponibles().filter((p) => p.pos).map((p) => ({ id: p.conductorId, lat: p.pos.lat, lng: p.pos.lng, rumbo: p.pos.rumbo || 0, movil: p.movil, simulado: false }));
    const amb = this.ambiente ? this.ambiente.lista() : [];
    const taxis = [...reales, ...amb];
    const igual = taxis.length === this.estado.taxisCercanos.length && taxis.every((t, i) => t.lat === this.estado.taxisCercanos[i]?.lat && t.lng === this.estado.taxisCercanos[i]?.lng);
    if (!igual || reales.length !== this.estado.conductoresReales) this.#cambiar({ taxisCercanos: taxis, conductoresReales: reales.length }, { silencioso: true });
  }

  #resumenViaje(estadoFinal, extra) {
    const { viaje, conductor, pago, cobro } = this.estado;
    return {
      id: viaje.id,
      estado: estadoFinal,
      fecha: viaje.creado,
      origen: viaje.origen,
      destino: viaje.destino,
      valor: pago?.valor || cobro?.valor || viaje.tarifa.total,
      metodoPago: pago?.metodo || viaje.metodoPago,
      conductor: conductor ? { nombre: conductor.nombre, movil: conductor.movil, placa: conductor.placa } : null,
      km: this.estado.kmFinal || viaje.ruta?.km || null,
      simulado: viaje.simulado,
      ...extra,
    };
  }

  #cerrarViaje() {
    clearTimeout(this.temporizadorBusqueda);
    this.simulado?.detener();
    this.simulado = null;
    this.#cambiar({ fase: 'inicio', viaje: null, conductor: null, posConductor: null, rutaConductor: null, etaMin: null, cobro: null, pago: null, pagoConfirmado: false });
  }

  async #avisar(aviso) {
    const a = await avisar(aviso);
    this.estado.ultimoAviso = a;
    this.emit('aviso', a);
  }

  #cambiar(cambios, { silencioso = false } = {}) {
    Object.assign(this.estado, cambios);
    if (!silencioso) {
      const { taxisCercanos, ...persistible } = this.estado;
      sessionStorage.setItem('ct.viaje.pasajero', JSON.stringify({ guardado: Date.now(), fase: this.estado.fase, estado: persistible }));
    }
    this.emit('cambio', this.estado);
  }

  destruir() {
    clearInterval(this.relojTaxis);
    clearTimeout(this.temporizadorBusqueda);
    this.ambiente?.detener();
    this.simulado?.detener();
    this.bus.cerrar();
  }
}
