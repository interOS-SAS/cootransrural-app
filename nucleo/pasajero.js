// Lógica de la app del pasajero, independiente del diseño visual.
//
//   const p = await crearPasajero();
//   p.on('cambio', (estado) => pintar(estado));
//   p.on('aviso', ({ titulo, cuerpo, tipo }) => mostrarAviso(...));
//   await p.solicitar({ origen, destino, metodoPago: 'qr' });
//
// Fases: inicio → buscando → asignado → llego → en_viaje → pagar → calificar → inicio
//
// En MODO_REAL (p.real) el viaje va por el servidor de TaxiCun: sin taxis de ambiente ni
// conductor simulado, solo efectivo y sin programados. El tiempo real se abre aparte,
// cuando ya hay sesión: p.bus.conectar(). Eventos extra en modo real:
//   'bienvenida' (datos), 'rechazo' ({ codigo, motivo }), 'conexion' (estado del bus:
//   'sin_conectar'|'conectando'|'en_linea'|'reconectando'|'rechazado'),
//   'error_servidor' ({ codigo, texto }). El estado lleva además estadoBus.
import { crearBus } from './bus.js';
import { TIEMPOS, CENTRO, EMPRESA } from './config.js';
import { calcularRuta, obtenerPosicion, fueraDeZona } from './geo.js';
import { calcularTarifa } from './tarifas.js';
import { avisar } from './avisos.js';
import { TaxisAmbiente, ConductorSimulado } from './simulador.js';
import { leerCobro, urlPago } from './qr.js';
import * as perfil from './perfil.js';
import * as servidor from './servidor.js';
import { Emisor, uid, codigoNumerico, hashCorto, distanciaKm, pesos, minutosTexto, primerNombre, enlaceMapa, fechaTexto, horaTexto } from './util.js';

export const FASES = ['inicio', 'buscando', 'asignado', 'llego', 'en_viaje', 'pagar', 'calificar'];

// Modo real.
const CLAVE_VIAJE_REAL = 'tc.real.viaje.pasajero'; // localStorage: en la app nativa sessionStorage se pierde
const FASES_ACTIVAS = ['buscando', 'asignado', 'llego', 'en_viaje']; // las que el servidor tiene «activas»
const ESPERA_VIAJE_ACTUAL_MS = 2500; // el servidor 0.1 solo manda viaje_actual si hay viaje
const BUSQUEDA_MAX_MS = 10 * 60 * 1000; // el servidor suelta la búsqueda a los 10 min
const VIDA_COLA_MS = 60000; // lo que el bus guarda sin conexión (ver BusServidor)
const VIAJE_GUARDADO_MAX_MS = 12 * 3600 * 1000;

// El código de abordaje solo vive en este teléfono; el servidor guarda su huella
// (hashCorto(viajeId + código)). Si se perdió lo guardado, se recupera de la huella.
function recuperarCodigo(viajeId, huella) {
  if (!viajeId || !huella) return null;
  for (let i = 0; i < 10000; i++) {
    const codigo = String(i).padStart(4, '0');
    if (hashCorto(viajeId + codigo) === huella) return codigo;
  }
  return null;
}

// El servidor guarda «direccion» (y desde 0.2 también «detalle»): se manda el detalle en los dos.
const lugarParaServidor = (l) => (l ? { ...l, direccion: l.direccion || l.detalle || '' } : null);

export async function crearPasajero(opciones = {}) {
  const ctl = new ControladorPasajero(opciones);
  await ctl.arrancar();
  return ctl;
}

class ControladorPasajero extends Emisor {
  constructor({ ambiente = true } = {}) {
    super();
    this.bus = crearBus({ rol: 'pasajero' });
    this.real = this.bus.real === true;
    this.usarAmbiente = ambiente && !this.real;
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
    if (this.real) {
      this.estado.estadoBus = this.bus.estado;
      this.relojViajeActual = null;
      this.viajeARevisar = null; // id del viaje que había al llegar la última bienvenida
      this.ultimoRechazo = null;
    }
  }

  async arrancar() {
    this.bus.on('conexion', (c) => {
      this.#cambiar({ conexion: c });
      // En modo real el servidor manda las presencias solo, después de la bienvenida.
      if (c === 'en-vivo' && !this.real) this.bus.publicar('consulta_presencia', {});
    });
    for (const tipo of ['presencia', 'aceptacion', 'ubicacion', 'estado', 'cobro', 'cancelacion', 'calificacion', 'pago_confirmado']) {
      this.bus.on(tipo, (datos, msj) => this.#manejar(tipo, datos, msj));
    }
    if (this.real) {
      this.#escucharServidor();
      this.#retomarReal();
    } else {
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
    }
    const pos = await obtenerPosicion({ espera: 6000 });
    this.estado.miPosicion = pos;
    if (this.usarAmbiente) {
      const centroSim = pos.real && !fueraDeZona(pos) ? pos : pos.real ? pos : CENTRO;
      this.ambiente = new TaxisAmbiente(centroSim, { cantidad: 5 });
      this.relojTaxis = setInterval(() => this.#actualizarTaxis(), 1000);
    } else if (this.real) {
      // Solo los taxis de verdad (presencias del servidor).
      this.relojTaxis = setInterval(() => this.#actualizarTaxis(), 1000);
    }
    this.#cambiar({});
  }

  /* ---------------- consultas ---------------- */

  get perfil() {
    return perfil.pasajero();
  }

  get registrado() {
    if (this.real) {
      // Con sesión en el servidor y los datos que necesita el conductor.
      const yo = perfil.pasajero();
      return servidor.haySesion() && Boolean(yo?.nombre && yo?.celular);
    }
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
    // Modo real: la tarjeta de viajes (cada 10, el siguiente al 50 %) no se aplica: la
    // cuenta vive solo en este celular y ni la cooperativa ni la central la respaldan.
    const viajesPrevios = this.real ? 0 : this.viajesCompletados();
    const tarifa = calcularTarifa({ origen, destino, km: ruta?.km, fecha, programado, viajesPrevios });
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
    if (!this.registrado) throw new Error(this.real ? 'Primero ingresa con tu correo y completa tus datos' : 'Primero hay que registrarse');
    if (this.real) {
      // El servidor no tiene viajes programados: nadie los despacharía.
      if (programadoPara && new Date(programadoPara) - Date.now() > 30 * 60 * 1000) {
        throw new Error('Por ahora no se pueden programar viajes. Pide tu taxi cuando lo necesites.');
      }
      if (this.bus.estado === 'rechazado') {
        // Se vuelve a intentar para la próxima (la sesión pudo cambiar) y se dice por qué no.
        this.bus.conectar();
        throw new servidor.ErrorServidor(this.ultimoRechazo || 'sin_sesion');
      }
      if (this.bus.estado === 'sin_conectar') this.bus.conectar();
      metodoPago = 'efectivo'; // por ahora solo efectivo
    }
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
    if (this.real) {
      viaje.idsPrevios = [];
      viaje.cuenta = this.#cuenta(); // de quién es (otra cuenta en este celular no lo retoma)
    }
    this.avisosDados.clear();
    this.#cambiar({ fase: 'buscando', viaje, conductor: null, posConductor: null, rutaConductor: null, etaMin: null, cobro: null, pago: null, pagoConfirmado: false, calificacionRecibida: null });
    this.#publicarSolicitud();
    this.#programarRespaldo();
    if (this.real) this.#cambiar({}); // guarda cuándo salió la solicitud (y si quedó en cola)
    return { viaje };
  }

  #publicarSolicitud() {
    const { viaje } = this.estado;
    if (this.real) {
      // El servidor arma el pasajero con lo de la cuenta: aquí ni celular ni referido.
      this.bus.publicar('solicitud', {
        viajeId: viaje.id,
        origen: lugarParaServidor(viaje.origen),
        destino: lugarParaServidor(viaje.destino),
        metodoPago: viaje.metodoPago,
        nota: viaje.nota,
        tarifa: viaje.tarifa.total,
        km: viaje.ruta?.km || null,
        min: viaje.ruta?.min || null,
        codigoHash: hashCorto(viaje.id + viaje.codigo),
      });
      // Sin conexión la solicitud queda en la cola del bus y sale con la próxima bienvenida.
      viaje.solicitadoEn = Date.now();
      viaje.enCola = this.bus.conexion !== 'en-vivo';
      return;
    }
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
    // En modo real no hay conductor de prueba ni cierre local: el servidor suelta la
    // búsqueda a los 10 min con una cancelación «por sistema».
    if (this.real) return;
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
    // Si la cancelación sale sin señal, la central lo sigue teniendo activo un rato: no se retoma.
    if (this.real) perfil.anotarViajeCerrado('pasajero', { id: viaje.id, ids: viaje.idsPrevios || [], final: 'cancelado', motivo });
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo }));
    this.#avisar({ titulo: 'Servicio cancelado', cuerpo: motivo, tipo: 'info' });
    this.#cerrarViaje('cancelado');
  }

  // Pago con QR. `lectura` es el texto leído por la cámara (o null para usar el
  // cobro recibido del conductor directamente, como «pago simulado»).
  pagarConQR(lectura = null, billetera = 'Bre-B') {
    // El pago con QR es de prueba: en modo real, solo efectivo.
    if (this.real) throw new Error('Por ahora el pago es en efectivo.');
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
    if (this.real) this.bus.publicar('pago', { viajeId: viaje.id, metodo: pago.metodo, valor: pago.valor });
    else if (!viaje.simulado) this.bus.publicar('pago', { viajeId: viaje.id, conductorId: conductor?.id, ...pago });
    this.#avisar({ titulo: pago.metodo === 'qr' ? 'Pago exitoso (prueba)' : 'Pago en efectivo', cuerpo: `${pesos(pago.valor)} · Móvil ${conductor?.movil || ''}`, tipo: 'exito' });
    this.#cambiar({ fase: 'calificar', pago });
    this.simulado?.alPagar();
  }

  calificar(estrellas, { etiquetas = [], comentario = '' } = {}) {
    const { viaje, conductor } = this.estado;
    if (!viaje) return;
    if (!viaje.simulado) this.bus.publicar('calificacion', { viajeId: viaje.id, conductorId: conductor?.id, de: 'pasajero', estrellas, etiquetas, comentario });
    if (this.real) perfil.anotarViajeCerrado('pasajero', { id: viaje.id, ids: viaje.idsPrevios || [], final: 'finalizado' });
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('finalizado', { calificacionDada: estrellas }));
    const completados = this.viajesCompletados();
    // En modo real no hay tarjeta de viajes (ver cotizar).
    if (!this.real && completados > 0 && completados % 10 === 0) {
      this.#avisar({ titulo: '¡Tu próximo viaje va al 50 %!', cuerpo: `Completaste ${completados} viajes con ${EMPRESA.nombre}.`, tipo: 'exito' });
    } else {
      this.#avisar({ titulo: `¡Gracias por viajar con ${EMPRESA.nombre}!`, cuerpo: 'Tu calificación ayuda a mejorar el servicio.', tipo: 'exito' });
    }
    this.#cerrarViaje('finalizado');
  }

  omitirCalificacion() {
    if (!this.estado.viaje) return;
    if (this.real) perfil.anotarViajeCerrado('pasajero', { id: this.estado.viaje.id, ids: this.estado.viaje.idsPrevios || [], final: 'finalizado' });
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
    if (!viaje || !cobro || this.real) return null;
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
    // Modo real: la aceptación de una búsqueda anterior de este mismo viaje (cambió de id
    // al volver a pedir) también vale; el servidor solo deja un viaje activo por pasajero.
    if (this.real && tipo === 'aceptacion' && viaje && fase === 'buscando' && viaje.idsPrevios?.includes(d.viajeId)) viaje.id = d.viajeId;
    if (!viaje || d.viajeId !== viaje.id) return;

    switch (tipo) {
      case 'aceptacion': {
        if (fase !== 'buscando') {
          // Otro conductor aceptó tarde: se le avisa que el servicio ya tiene taxi.
          // (Con el servidor real lo decide y lo avisa el servidor.)
          if (!this.real && !msj.simulado && d.conductor?.id !== conductor?.id) this.bus.publicar('asignacion', { viajeId: viaje.id, conductorId: conductor?.id });
          return;
        }
        if (this.real && !d.conductor) return;
        clearTimeout(this.temporizadorBusqueda);
        if (!msj.simulado && !this.real) this.bus.publicar('asignacion', { viajeId: viaje.id, conductorId: d.conductor.id });
        if (this.real) viaje.enCola = false;
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
          this.#avisar({ titulo: '¡Tu taxi está en la puerta!', cuerpo: `Móvil ${conductor.movil} · Placa ${conductor.placa}.${viaje.codigo ? ` Tu código es ${viaje.codigo}.` : ''}`, tipo: 'alerta' });
        } else if (d.fase === 'en_viaje' && ['asignado', 'llego'].includes(fase)) {
          // El tiempo de llegada a la puerta (0) no sirve para el viaje: se arranca con el de
          // la ruta hasta que el conductor mande su posición (con el GPS quieto no la manda).
          this.#cambiar({ fase: 'en_viaje', inicioViaje: Date.now(), etaMin: viaje.ruta?.min ?? null });
          this.#avisar({ titulo: 'Viaje iniciado', cuerpo: viaje.destino ? `Rumbo a ${viaje.destino.titulo || 'tu destino'}. ¡Buen viaje!` : '¡Buen viaje!', tipo: 'info' });
        } else if (d.fase === 'finalizado' && ['en_viaje', 'llego', 'asignado'].includes(fase)) {
          const valor = d.valor || viaje.tarifa.total;
          this.#cambiar({ fase: 'pagar', cobro: { valor }, etaMin: 0, finViaje: Date.now(), kmFinal: d.km || viaje.ruta?.km || null });
          this.#avisar({ titulo: 'Llegaste a tu destino', cuerpo: `Total: ${pesos(valor)}. ${this.real ? 'Paga en efectivo al conductor.' : 'Paga con QR o en efectivo.'}`, tipo: 'exito' });
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
        if (this.real) {
          this.#cancelacionReal(d);
          break;
        }
        if (d.por !== 'conductor' || !conductor || (d.conductorId && d.conductorId !== conductor.id)) return;
        this.#avisar({ titulo: 'El conductor canceló', cuerpo: `${d.motivo || ''}. Te buscamos otro taxi.`, tipo: 'alerta' });
        viaje.intentos += 1;
        this.#cambiar({ fase: 'buscando', conductor: null, posConductor: null, rutaConductor: null, etaMin: null });
        this.#publicarSolicitud();
        this.#programarRespaldo();
        break;
      }
      case 'calificacion': {
        // Modo real: las estrellas que puso el conductor no se muestran (la política de
        // privacidad dice que la otra persona no las ve; así nadie califica por revancha).
        if (d.de === 'conductor' && !this.real) this.#cambiar({ calificacionRecibida: d.estrellas });
        break;
      }
    }
  }

  /* ---------------- modo real: servidor ---------------- */

  #escucharServidor() {
    this.bus.on('estado_conexion', (e) => {
      this.#cambiar({ estadoBus: e }, { silencioso: true });
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
      this.emit('rechazo', d);
    });
  }

  // Lo guardado en el teléfono (localStorage) se retoma y después se confirma con el servidor.
  #retomarReal() {
    let g = null;
    try {
      g = JSON.parse(localStorage.getItem(CLAVE_VIAJE_REAL) || 'null');
    } catch {
      g = null;
    }
    if (!g?.estado?.viaje || g.fase === 'inicio') return;
    if (Date.now() - (g.guardado || 0) > VIAJE_GUARDADO_MAX_MS) {
      localStorage.removeItem(CLAVE_VIAJE_REAL);
      return;
    }
    Object.assign(this.estado, g.estado);
    // La cola del bus vive en memoria: lo que había quedado en ella se perdió al recargar.
    // La solicitud se vuelve a mandar con la próxima bienvenida (ver #reconciliar).
    const v = this.estado.viaje;
    if (v?.enCola) {
      v.enCola = false;
      if (this.estado.fase === 'buscando') v.porReenviar = true;
    }
  }

  // Correo de la cuenta con la que se pidió el viaje (modo real).
  #cuenta() {
    return String(perfil.pasajero()?.correo || '').trim().toLowerCase();
  }

  #alBienvenida(d) {
    perfil.fijarIdPasajero(d?.pasajeroId);
    // El servidor vuelve a mandar las presencias de los conductores conectados.
    this.reales.clear();
    // Un viaje de otra cuenta (se cerró la sesión y entró otra persona en este celular) no
    // se retoma ni se vuelve a pedir desde esta cuenta: se olvida sin avisar a nadie.
    const deOtro = this.estado.viaje?.cuenta && this.#cuenta() && this.estado.viaje.cuenta !== this.#cuenta();
    if (deOtro) this.#cerrarViaje('otra-cuenta');
    // Solo se revisa el viaje que había al conectar: uno pedido después ya es de esta conexión.
    const { viaje, fase } = this.estado;
    this.viajeARevisar = viaje && FASES_ACTIVAS.includes(fase) ? viaje.id : null;
    // viaje_actual llega enseguida (servidor 0.2, también null); el 0.1 solo si hay viaje.
    clearTimeout(this.relojViajeActual);
    this.relojViajeActual = setTimeout(() => this.#reconciliar(undefined), ESPERA_VIAJE_ACTUAL_MS);
    this.emit('bienvenida', d);
  }

  // ¿La solicitud del viaje salió de la cola del bus con esta conexión? Entonces el
  // servidor la atiende después de su viaje_actual y no hay que darla por perdida.
  #solicitudRecienEnviada(viaje) {
    return Boolean(viaje?.enCola) && Date.now() - (viaje.solicitadoEn || 0) < VIDA_COLA_MS;
  }

  // d: datos de viaje_actual; null = el servidor no tiene viaje activo (0.2);
  // undefined = no llegó nada en 2,5 s (servidor 0.1).
  #reconciliar(d) {
    clearTimeout(this.relojViajeActual);
    const aRevisar = this.viajeARevisar;
    this.viajeARevisar = null;
    const { viaje, fase } = this.estado;
    const activo = Boolean(viaje) && FASES_ACTIVAS.includes(fase);
    const recien = fase === 'buscando' && this.#solicitudRecienEnviada(viaje);
    // La solicitud que se perdió con la cola al recargar (ver #retomarReal).
    const porReenviar = fase === 'buscando' && Boolean(viaje?.porReenviar);
    if (viaje) {
      viaje.enCola = false;
      viaje.porReenviar = false;
    }

    if (d && d.viajeId) {
      const nuestro = Boolean(viaje) && (d.viajeId === viaje.id || (viaje.idsPrevios || []).includes(d.viajeId));
      // Un viaje que este teléfono ya cerró: la central aún no lo sabe (la cancelación salió
      // sin señal, o este viaje_actual se armó antes de leer lo que estaba en la cola).
      // Se le repite el cierre y no se retoma ni se cancela otra cosa.
      const cerrado = !nuestro && perfil.viajeCerrado('pasajero', d.viajeId);
      if (cerrado) {
        if (cerrado.final === 'cancelado' && FASES_ACTIVAS.includes(d.estado)) {
          this.bus.publicar('cancelacion', { viajeId: d.viajeId, por: 'pasajero', motivo: cerrado.motivo || 'Ya no lo necesito' });
        }
        // El viaje de este teléfono sigue: si busca y su solicitud no va en la cola, sale otra vez
        // (la central la habrá rechazado mientras tenía el otro activo).
        if (activo && fase === 'buscando' && !recien) {
          this.#publicarSolicitud();
          this.#cambiar({});
        }
        return;
      }
      if (nuestro) return this.#seguirDelServidor(d);
      // Otro viaje: el del teléfono (si había) ya no está activo en el servidor.
      if (d.origen && (d.estado === 'buscando' || d.conductor?.nombre)) return this.#rearmar(d);
      // Sin datos para mostrarlo (servidor 0.1): se cancela para que no quede colgado.
      this.bus.publicar('cancelacion', { viajeId: d.viajeId, por: 'pasajero', motivo: 'datos_perdidos' });
      if (activo && fase === 'buscando') {
        // Lo que se pidió en este teléfono sigue: sale de nuevo (con id nuevo, por si acaso).
        this.#avisar({ titulo: 'Cancelamos un servicio anterior', cuerpo: 'No pudimos recuperar sus datos. Seguimos buscando tu taxi.', tipo: 'info' });
        this.#idNuevo();
        this.#publicarSolicitud();
        this.#cambiar({});
      } else if (activo) {
        this.#terminoSinAviso();
      } else {
        this.#avisar({ titulo: 'Cancelamos un servicio anterior', cuerpo: 'No pudimos recuperar sus datos. Si necesitas taxi, pídelo de nuevo.', tipo: 'info' });
      }
      return;
    }

    if (!activo || recien) return;
    // Un viaje pedido después de la bienvenida no se revisa: el servidor ya lo tiene.
    if (!porReenviar && (!aRevisar || (viaje.id !== aRevisar && !(viaje.idsPrevios || []).includes(aRevisar)))) return;
    if (fase === 'buscando' && Date.now() - (viaje.solicitadoEn || viaje.creado) < BUSQUEDA_MAX_MS) {
      // La central no tiene esta búsqueda: la solicitud se perdió (cola descartada o borrada
      // al recargar, conexión medio muerta) o el servidor 0.1 la soltó al reiniciarse. Se
      // vuelve a pedir con id nuevo: si el viejo quedó cerrado, el servidor lo ignoraría.
      // (El 0.2 retoma las búsquedas de menos de 10 min con el mismo id: llegan arriba.)
      this.#idNuevo();
      this.#publicarSolicitud();
      this.#cambiar({});
      return;
    }
    // El servidor ya no tiene este viaje (terminó o se canceló sin que llegara el aviso).
    this.#terminoSinAviso();
  }

  #terminoSinAviso() {
    this.#avisar({ titulo: 'Tu servicio anterior terminó', cuerpo: 'Si necesitas taxi, pídelo de nuevo.', tipo: 'info' });
    this.#cerrarViaje('terminado');
  }

  // viaje_actual de este mismo viaje: la fase es la del servidor.
  #seguirDelServidor(d) {
    const { viaje, fase, conductor } = this.estado;
    if (viaje.id !== d.viajeId) viaje.id = d.viajeId; // el servidor siguió con un id anterior
    if (!viaje.origen && d.origen) viaje.origen = d.origen;
    if (!viaje.destino && d.destino) viaje.destino = d.destino;
    if (!viaje.codigo) viaje.codigo = recuperarCodigo(viaje.id, d.codigoHash);
    if (['pagar', 'calificar'].includes(fase)) return this.#cambiar({ viaje });
    if (d.estado === 'buscando') {
      if (fase === 'buscando') return this.#cambiar({ viaje });
      return this.#cambiar({ fase: 'buscando', viaje, conductor: null, posConductor: null, rutaConductor: null, etaMin: null });
    }
    if (!FASES_ACTIVAS.includes(d.estado)) return;
    // Con conductor: lo que traiga el servidor completa lo guardado.
    const id = d.conductorId || d.conductor?.id || conductor?.id || null;
    const mismo = conductor && (!id || conductor.id === id);
    const nuevo = { ...(mismo ? conductor : {}), ...(d.conductor || {}), id };
    for (const campo of ['nombre', 'movil', 'placa', 'vehiculo', 'color']) nuevo[campo] ??= '';
    if (!nuevo.movil && id) nuevo.movil = this.reales.get(id)?.movil || '';
    const cambios = { viaje, conductor: nuevo };
    if (d.pos) cambios.posConductor = d.pos;
    if (fase !== d.estado) {
      cambios.fase = d.estado;
      if (d.estado === 'asignado') cambios.asignadoEn = Date.now();
      if (d.estado === 'llego') cambios.etaMin = 0;
      if (d.estado === 'en_viaje') Object.assign(cambios, { inicioViaje: Date.now(), etaMin: viaje.ruta?.min ?? null });
    }
    this.#cambiar(cambios);
    if (fase === d.estado) return;
    const taxi = [nuevo.movil && `Móvil ${nuevo.movil}`, nuevo.placa].filter(Boolean).join(' · ');
    if (d.estado === 'asignado') this.#avisar({ titulo: '¡Tu taxi va en camino!', cuerpo: taxi || 'Un conductor aceptó tu servicio.', tipo: 'exito' });
    else if (d.estado === 'llego') this.#avisar({ titulo: '¡Tu taxi está en la puerta!', cuerpo: `${taxi ? `${taxi}.` : ''}${viaje.codigo ? ` Tu código es ${viaje.codigo}.` : ''}`.trim(), tipo: 'alerta' });
    else if (d.estado === 'en_viaje') this.#avisar({ titulo: 'Viaje en curso', cuerpo: viaje.destino ? `Rumbo a ${viaje.destino.titulo || 'tu destino'}.` : '¡Buen viaje!', tipo: 'info' });
  }

  // viaje_actual de un viaje que el teléfono no tiene (se borró lo guardado, otro
  // teléfono…): se rearma con lo que manda el servidor 0.2.
  #rearmar(d) {
    const viaje = {
      id: d.viajeId,
      origen: d.origen,
      destino: d.destino || null,
      ruta: d.km != null || d.min != null ? { km: d.km ?? null, min: d.min ?? null, coords: null } : null,
      tarifa: { total: Number(d.tarifa) || 0 },
      metodoPago: d.metodoPago || 'efectivo',
      nota: d.nota || '',
      codigo: recuperarCodigo(d.viajeId, d.codigoHash),
      creado: Date.now(),
      solicitadoEn: Date.now(),
      intentos: 1,
      simulado: false,
      idsPrevios: [],
      rearmado: true,
      cuenta: this.#cuenta(),
    };
    const conductor = d.conductor ? { ...d.conductor, id: d.conductor.id || d.conductorId } : null;
    this.avisosDados.clear();
    this.#cambiar({
      fase: d.estado, viaje, conductor, posConductor: d.pos || null, rutaConductor: null, etaMin: d.estado === 'llego' ? 0 : null,
      cobro: null, pago: null, pagoConfirmado: false, calificacionRecibida: null, asignadoEn: Date.now(),
      inicioViaje: d.estado === 'en_viaje' ? Date.now() : null,
    });
    this.#avisar({
      titulo: 'Retomamos tu servicio',
      cuerpo: d.estado === 'buscando' ? 'Seguimos buscando tu taxi.' : `Móvil ${conductor?.movil || ''} · ${conductor?.placa || ''}`,
      tipo: 'info',
    });
    if (viaje.destino) {
      calcularRuta(viaje.origen, viaje.destino)
        .then((ruta) => {
          if (this.estado.viaje?.id !== viaje.id || !ruta) return;
          this.estado.viaje.ruta = ruta;
          this.#cambiar({});
        })
        .catch(() => {});
    }
  }

  // Errores del servidor (no traen viajeId: responden a lo último que se mandó).
  #alErrorServidor(d) {
    const codigo = d?.codigo || '';
    this.emit('error_servidor', { codigo, texto: servidor.textoError(codigo) });
    const { viaje, fase } = this.estado;
    if (fase !== 'buscando' || !viaje) return;
    if (codigo === 'ya_tienes_un_viaje') {
      // El servidor tiene otro viaje activo: al reconectar llega viaje_actual y se reconcilia.
      viaje.choques = (viaje.choques || 0) + 1;
      if (viaje.choques > 2) {
        this.#avisar({ titulo: 'No pudimos pedir el taxi', cuerpo: servidor.textoError(codigo), tipo: 'error' });
        return this.#cerrarViaje('error');
      }
      this.#avisar({ titulo: 'Ya tienes un viaje en curso', cuerpo: 'Estamos recuperando tu servicio…', tipo: 'info' });
      this.bus.reconectar();
    } else if (codigo === 'viaje_ajeno') {
      // El id ya existía (por ejemplo, después de un reinicio del servidor): uno nuevo, una vez.
      if (!viaje.reintentoAjeno) {
        viaje.reintentoAjeno = true;
        this.#idNuevo();
        this.#publicarSolicitud();
        this.#cambiar({});
        return;
      }
      this.#avisar({ titulo: 'No pudimos pedir el taxi', cuerpo: servidor.textoError(codigo), tipo: 'error' });
      this.#cerrarViaje('error');
    } else if (codigo === 'solicitud_invalida' || codigo === 'origen_invalido' || codigo === 'tarifa_invalida') {
      // tarifa_invalida (servidor 0.2.2): la tarifa no cabe en las de la cooperativa y la
      // central no guardó nada; no se vuelve a mandar igual.
      this.#avisar({ titulo: 'No pudimos pedir el taxi', cuerpo: servidor.textoError(codigo), tipo: 'error' });
      this.#cerrarViaje('error');
    }
  }

  #cancelacionReal(d) {
    const { fase, conductor } = this.estado;
    if (d.por === 'sistema') {
      // El conductor eliminó su cuenta (servidor 0.2.2): la central canceló el viaje.
      if (d.motivo === 'cuenta_borrada' && ['asignado', 'llego', 'en_viaje'].includes(fase)) {
        if (!conductor || (d.conductorId && d.conductorId !== conductor.id)) return;
        if (fase === 'en_viaje') {
          perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo: 'El conductor ya no está disponible' }));
          this.#avisar({ titulo: 'El conductor ya no está disponible', cuerpo: 'Si necesitas taxi, pídelo de nuevo.', tipo: 'alerta' });
          this.#cerrarViaje('cancelado');
          return;
        }
        this.#buscarOtroTaxi({ titulo: 'El conductor ya no está disponible', cuerpo: 'Buscamos otro taxi.', tipo: 'alerta' });
        return;
      }
      // Pasaron 10 minutos sin que nadie aceptara.
      if (fase !== 'buscando') return;
      perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo: 'Ningún conductor aceptó' }));
      this.#avisar({ titulo: 'Ningún conductor aceptó', cuerpo: 'Intenta de nuevo.', tipo: 'error' });
      this.#cerrarViaje('sin-conductor');
      return;
    }
    if (d.por !== 'conductor' || !conductor || (d.conductorId && d.conductorId !== conductor.id)) return;
    if (fase === 'en_viaje') {
      // Ya iba en el taxi: no tiene sentido buscar otro desde el punto de recogida.
      perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo: `Conductor: ${d.motivo || ''}` }));
      this.#avisar({ titulo: 'El conductor canceló el viaje', cuerpo: d.motivo || 'Si necesitas taxi, pídelo de nuevo.', tipo: 'alerta' });
      this.#cerrarViaje('cancelado');
      return;
    }
    if (!['asignado', 'llego'].includes(fase)) return;
    this.#buscarOtroTaxi({ titulo: 'El conductor canceló', cuerpo: `${d.motivo ? `${d.motivo}. ` : ''}Buscamos otro taxi.`, tipo: 'alerta' });
  }

  // El servidor dejó ese viaje cancelado: se busca otro taxi con un id nuevo (con el
  // mismo, la central lo ignoraría en silencio).
  #buscarOtroTaxi(aviso) {
    const { viaje } = this.estado;
    this.#avisar(aviso);
    viaje.intentos = (viaje.intentos || 1) + 1;
    this.#idNuevo();
    this.avisosDados.clear();
    this.#publicarSolicitud();
    this.#cambiar({ fase: 'buscando', viaje, conductor: null, posConductor: null, rutaConductor: null, etaMin: null });
  }

  // Mismo viaje (origen, destino, código), id nuevo para el servidor.
  #idNuevo() {
    const viaje = this.estado.viaje;
    if (!viaje) return;
    viaje.idsPrevios = [...(viaje.idsPrevios || []), viaje.id].slice(-6);
    viaje.id = uid('v');
  }

  #guardarReal(persistible) {
    const { conexion, sala, estadoBus, ultimoAviso, miPosicion, ...resto } = persistible;
    try {
      if (resto.fase === 'inicio' || !resto.viaje) localStorage.removeItem(CLAVE_VIAJE_REAL);
      else localStorage.setItem(CLAVE_VIAJE_REAL, JSON.stringify({ guardado: Date.now(), fase: resto.fase, estado: resto }));
    } catch {
      /* almacenamiento lleno o bloqueado */
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
    clearTimeout(this.relojViajeActual);
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
      if (this.real) this.#guardarReal(persistible);
      else sessionStorage.setItem('ct.viaje.pasajero', JSON.stringify({ guardado: Date.now(), fase: this.estado.fase, estado: persistible }));
    }
    this.emit('cambio', this.estado);
  }

  destruir() {
    clearInterval(this.relojTaxis);
    clearTimeout(this.temporizadorBusqueda);
    clearTimeout(this.relojViajeActual);
    this.ambiente?.detener();
    this.simulado?.detener();
    this.bus.cerrar();
  }
}
