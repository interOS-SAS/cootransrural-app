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
// Reglas del despacho (bienvenida.reglas y el mensaje «reglas», ver nucleo/reglas.js): la búsqueda que se
// perdió se vuelve a pedir si tiene menos de minutosBusqueda (sin reglas, 10 min, como siempre). Si la central
// dice que la búsqueda no le llegó a nadie que la pueda tomar (sin_conductores), estado.sinConductores =
// { viajeId, desde, motivo } (null cuando ya le llegó a alguien, con con_conductores, con cada bienvenida —la
// central lo repite si sigue así— o fuera de «buscando»): la búsqueda sigue igual, el diseño lo dice y ofrece
// llamar a la central. Se avisa una vez por búsqueda. La demo no cambia.
// Modo revisor (bienvenida.revision: las cuentas de los revisores de Apple y Google, que prueban
// desde otro país): si el GPS está lejos de la cooperativa, miPosicion pasa a ser el parque
// principal (con revision: true), se avisa una vez y se emite 'revision_lejos' (punto) para que el
// diseño lleve allá el mapa y el punto de recogida. Sin esa bandera, nada cambia.
// Fase 3 del panel (nucleo/central.js): si la central cancela el pedido desde su mapa (cancelacion con por:
// 'central'), el viaje se cierra sin buscar otro taxi (lo canceló a propósito), queda en «Mis viajes» como «Cancelado
// por la central» y se emite 'cancelado_por_central' ({ viajeId, motivo, fase, titulo, cuerpo }) para que el diseño
// lo muestre con «Llamar a la central». Vale también para el id anterior (la búsqueda que ya se había vuelto a pedir).
// Ronda 4A (servidor 0.9.0, nucleo/central.js): estado.avisarCentral (bienvenida.avisarCentral) dice si el SOS ofrece
// «Avisar a la central»; p.avisarCentral() lo manda (nucleo/sos.js). p.bandeja: los avisos de la cooperativa
// (nucleo/bandeja.js: 'nuevo' para la tarjeta, la lista para la bandeja).
// Fase 2 del panel (modo real): p.zonaDe(punto) dice si la recogida está dentro de la zona de
// servicio de la cooperativa ('dentro' | 'cerca' | 'lejos', ver geo.revisarZona; null sin zona o
// en el modo revisor); solicitar() no pide un taxi «lejos» (ErrorServidor fuera_de_zona). Con el
// mensaje «config» de la central la app recarga la ficha nueva al quedar sin viaje (config.js).
import { crearBus } from './bus.js';
import { TIEMPOS, CENTRO, EMPRESA, ID_EMPRESA, vigilarConfig } from './config.js';
import { LUGARES } from './datos.js';
import { calcularRuta, obtenerPosicion, seguirPosicion, fueraDeZona, revisarZona } from './geo.js';
import { calcularTarifa } from './tarifas.js';
import { avisar } from './avisos.js';
import { TaxisAmbiente, ConductorSimulado } from './simulador.js';
import { leerCobro, urlPago } from './qr.js';
import * as perfil from './perfil.js';
import * as servidor from './servidor.js';
import { Emisor, uid, codigoNumerico, hashCorto, distanciaKm, pesos, minutosTexto, primerNombre, enlaceMapa, fechaTexto, horaTexto } from './util.js';
import { relojVisible, appOculta, alCambiarVisibilidad } from './plataforma.js';
import { MENSAJES, reglasGuardadas, reglasDeBienvenida, textoSinConductores } from './reglas.js';
import { canceladaPorCentral, motivoDeCancelacion, textosCentral } from './central.js';
import { enviarSos, posicionParaSos } from './sos.js';
import { crearBandeja } from './bandeja.js';

export const FASES = ['inicio', 'buscando', 'asignado', 'llego', 'en_viaje', 'pagar', 'calificar'];

// Modo real.
const CLAVE_VIAJE_REAL = 'tc.real.viaje.pasajero'; // localStorage: en la app nativa sessionStorage se pierde
const FASES_ACTIVAS = ['buscando', 'asignado', 'llego', 'en_viaje']; // las que el servidor tiene «activas»
const ESPERA_VIAJE_ACTUAL_MS = 2500; // el servidor 0.1 solo manda viaje_actual si hay viaje
// El servidor suelta la búsqueda a los minutosBusqueda de las reglas de la cooperativa (10 min sin reglas).
const VIDA_COLA_MS = 60000; // lo que el bus guarda sin conexión (ver BusServidor)
const VIAJE_GUARDADO_MAX_MS = 12 * 3600 * 1000;
// Batería (modo real). Los taxis cercanos se recalculan cuando llega una presencia (en las fases
// que los muestran) y, para quitar los que dejaron de anunciarse, con este reloj (solo con la app
// a la vista). Antes era cada segundo aunque no hubiera llegado nada.
const RELOJ_TAXIS_REAL_MS = 5000;
const FASES_CON_TAXIS = ['inicio', 'buscando'];
// La ubicación del taxi llega cada 2 s: el viaje se guarda en el celular (para retomarlo al
// recargar) con ella a lo sumo cada tanto, y siempre al ocultarse la app o cerrarse la página
// (así al volver no retroceden la barra ni la hora de llegada); al reconectar, la central manda
// el viaje de nuevo.
const GUARDAR_UBICACION_MS = 30000;

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
      this.revision = false; // modo revisor (bienvenida.revision)
      this.avisoLejos = false;
      // Reglas del despacho de la cooperativa (las guardadas hasta la próxima bienvenida).
      this.reglas = reglasGuardadas();
      this.estado.sinConductores = null;
      // Ronda 4A: la central recibe «Avisar a la central» (bienvenida.avisarCentral) y los avisos de la cooperativa.
      this.estado.avisarCentral = false;
      this.envioSos = null;
      this.bandeja = crearBandeja({ rol: 'pasajero', bus: this.bus });
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
      // Configuración nueva de la cooperativa (fase 2): recarga cuando no haya viaje.
      this.dejarConfig = vigilarConfig(this.bus, { ocupado: () => this.estado.fase !== 'inicio', emisor: this });
      // Lo que quedó sin guardar por la espera de GUARDAR_UBICACION_MS (matar la app pasa antes
      // por segundo plano; recargar o cerrar la pestaña, por pagehide).
      this.alSalir = () => this.#guardarUbicacionPendiente();
      this.dejarVisibilidad = alCambiarVisibilidad((oculta) => oculta && this.alSalir());
      globalThis.addEventListener?.('pagehide', this.alSalir);
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
    const pos = this.#paraRevision(await obtenerPosicion({ espera: 6000 }));
    this.estado.miPosicion = pos;
    // La primera lectura del teléfono suele ser aproximada o vieja: se afina unos segundos.
    if (pos.real) this.afinarPosicion();
    if (this.usarAmbiente) {
      const centroSim = pos.real && !fueraDeZona(pos) ? pos : pos.real ? pos : CENTRO;
      this.ambiente = new TaxisAmbiente(centroSim, { cantidad: 5 });
      // Con la app oculta no hace falta recalcularlos (al volver se recalculan de una vez).
      this.pararRelojTaxis = relojVisible(() => this.#actualizarTaxis(), 1000);
    } else if (this.real) {
      // Solo los taxis de verdad (presencias del servidor): al llegar cada presencia
      // (#programarTaxis) y, para quitar los vencidos, cada RELOJ_TAXIS_REAL_MS.
      this.pararRelojTaxis = relojVisible(() => this.#actualizarTaxis(), RELOJ_TAXIS_REAL_MS);
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

  // Zona de servicio (fase 2, solo modo real): null si la cooperativa no tiene zona, en el modo
  // revisor (Apple y Google prueban desde otro país) o en la demo; si no, lo de geo.revisarZona.
  zonaDe(punto) {
    if (!this.real || this.revision || punto?.revision) return null;
    return revisarZona(punto);
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

  // Afina la ubicación con el GPS continuo durante unos segundos: cada lectura mejor (más
  // precisa, o que se movió) actualiza miPosicion y emite 'posicion_afinada'. Se detiene con una
  // lectura buena (≤ 25 m) o a los 25 s, para no gastar batería.
  afinarPosicion({ duracion = 25000, buena = 25 } = {}) {
    this.detenerAfinado?.();
    let mejor = this.estado.miPosicion?.real ? this.estado.miPosicion : null;
    let detenerGps = () => {};
    let reloj = null;
    const fin = () => {
      clearTimeout(reloj);
      detenerGps();
      if (this.detenerAfinado === fin) this.detenerAfinado = null;
    };
    this.detenerAfinado = fin;
    reloj = setTimeout(fin, duracion);
    detenerGps = seguirPosicion((p) => {
      const pos = this.#paraRevision({ lat: p.lat, lng: p.lng, precision: p.precision, real: true });
      const precision = pos.precision ?? 999;
      const mejora = !mejor || !mejor.real || precision <= (mejor.precision ?? 999) || distanciaKm(pos, mejor) > 0.05;
      if (!mejora) return;
      mejor = pos;
      this.#cambiar({ miPosicion: pos });
      this.emit('posicion_afinada', pos);
      if (precision <= buena) fin();
    });
    return fin;
  }

  async actualizarMiPosicion() {
    const pos = this.#paraRevision(await obtenerPosicion({ espera: 8000 }));
    this.#cambiar({ miPosicion: pos });
    return pos;
  }

  // Modo revisor: lejos de la cooperativa (p. ej. en Cupertino), la recogida de la prueba es el
  // paradero de taxis (en El Rosal el Decreto 89 de 2026 prohíbe recoger en el parque principal).
  // Devuelve la posición que se usa (la misma si no aplica).
  #paraRevision(pos) {
    if (!this.real || !this.revision || !pos || pos.revision || !fueraDeZona(pos)) return pos;
    const paradero = LUGARES.find((l) => l.id === 'paradero' || /paradero/i.test(l.nombre || ''));
    const punto = paradero || CENTRO;
    if (!this.avisoLejos) {
      this.avisoLejos = true;
      const pueblo = EMPRESA?.pueblo || 'la cooperativa';
      this.#avisar({
        titulo: `Estás lejos de ${pueblo}`,
        cuerpo: `Para la prueba usamos ${paradero ? 'el paradero de taxis' : `el centro de ${pueblo}`} como punto de recogida. Elige tu destino y pide tu taxi.`,
        tipo: 'info',
      });
    }
    return { lat: punto.lat, lng: punto.lng, precision: null, real: true, revision: true };
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
      // Muy lejos de la zona de servicio (fase 2): la central lo rechazaría (fuera_de_zona).
      if (this.zonaDe(origen)?.estado === 'lejos') throw new servidor.ErrorServidor('fuera_de_zona');
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
      if (this.real) this.#programarTaxis();
      return;
    }
    // Modo real: la aceptación de una búsqueda anterior de este mismo viaje (cambió de id
    // al volver a pedir) también vale; el servidor solo deja un viaje activo por pasajero.
    if (this.real && tipo === 'aceptacion' && viaje && fase === 'buscando' && viaje.idsPrevios?.includes(d.viajeId)) viaje.id = d.viajeId;
    // Fase 3: la cancelación de la central con el id anterior (la app ya lo había vuelto a pedir con otro) también llega
    // (#canceladoPorCentral decide).
    const deLaCentral = this.real && tipo === 'cancelacion' && canceladaPorCentral(d) && Boolean(viaje?.idsPrevios?.includes(d.viajeId));
    if (!viaje || (d.viajeId !== viaje.id && !deLaCentral)) return;

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
        // Modo real: no se reescribe todo el viaje en el celular cada 2 s (ver GUARDAR_UBICACION_MS).
        const guardar = !this.real || Date.now() - (this.ubicacionGuardada || 0) >= GUARDAR_UBICACION_MS;
        if (guardar) this.ubicacionGuardada = Date.now();
        this.#cambiar(cambios, { silencioso: !guardar });
        if (!guardar) this.ubicacionSinGuardar = true;
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
    this.bus.on(MENSAJES.sinConductores, (d) => this.#alSinConductores(true, d));
    this.bus.on(MENSAJES.conConductores, (d) => this.#alSinConductores(false, d));
    // El gerente cambió las reglas con la app abierta: valen desde ya.
    this.bus.on(MENSAJES.reglas, (d) => {
      this.reglas = reglasDeBienvenida(d);
    });
  }

  // ¿La búsqueda le llegó a alguien que la pueda tomar? (sin_conductores / con_conductores.) sin: true = a nadie
  // (d.motivo: sin_taxis, ocupados, rechazado o excluidos); false = ya le llegó a alguien. Solo cambia lo que ve el
  // pasajero: la búsqueda sigue y la central se la ofrece al primero que pueda.
  #alSinConductores(sin, d) {
    const { viaje, fase } = this.estado;
    if (fase !== 'buscando' || !viaje) return;
    const viajeId = d?.viajeId;
    if (viajeId && viajeId !== viaje.id && !(viaje.idsPrevios || []).includes(viajeId)) return;
    const motivo = typeof d?.motivo === 'string' ? d.motivo.slice(0, 40) : '';
    const antes = this.estado.sinConductores;
    if (sin && antes) {
      if (antes.motivo !== motivo) this.#cambiar({ sinConductores: { ...antes, motivo } });
      return;
    }
    if (!sin && !antes) return;
    this.#cambiar({ sinConductores: sin ? { viajeId: viaje.id, desde: Date.now(), motivo } : null });
    const clave = sin ? 'sin_conductores' : 'con_conductores';
    if (this.avisosDados.has(clave)) return;
    this.avisosDados.add(clave);
    if (sin) {
      const central = this.#hayCentral() ? ' Si tienes afán, llama a la central.' : '';
      this.#avisar({ titulo: textoSinConductores(motivo, EMPRESA?.nombre).titulo, cuerpo: `Seguimos buscando tu taxi.${central}`, tipo: 'alerta' });
    } else {
      this.#avisar({ titulo: 'Tu solicitud ya le llegó a un taxi', cuerpo: 'Esperamos a que el conductor acepte.', tipo: 'info' });
    }
  }

  // Ronda 4A: «Avisar a la central» (SOS). Un toque lo manda, sin otra confirmación, con la posición del momento (o la
  // última que tenga la app) y el viaje en curso; sin señal reintenta 2 minutos con la misma clave (nucleo/sos.js).
  // Devuelve el envío ({ on('estado'), listo, cancelar() }) o null si no se ofrece (demo, central sin la bandera). Un
  // segundo toque mientras el primero sigue intentando devuelve el mismo envío. En el modo revisor la central lo marca
  // de prueba y no le llega a nadie (la posición es la del paradero de la cooperativa, sin leer el GPS).
  avisarCentral() {
    if (!this.real || !this.estado.avisarCentral) return null;
    if (this.envioSos && !this.envioSos.terminado) return this.envioSos;
    const { viaje, fase } = this.estado;
    const ultima = this.estado.miPosicion?.real ? this.estado.miPosicion : null;
    this.envioSos = enviarSos({
      rol: 'pasajero',
      empresa: ID_EMPRESA,
      viajeId: viaje && FASES_ACTIVAS.includes(fase) ? viaje.id : null,
      pos: posicionParaSos(ultima, { leer: !this.revision }),
    });
    this.envioSos.on('estado', ({ estado }) => {
      // La central dejó de recibirlo (o es anterior): ya no se ofrece hasta la próxima bienvenida.
      if (estado === 'no_disponible' && this.estado.avisarCentral) this.#cambiar({ avisarCentral: false }, { silencioso: true });
    });
    return this.envioSos;
  }

  // ¿Se le puede ofrecer llamar a la central? (Con teléfono en la ficha y fuera del modo revisor: a los revisores
  // de las tiendas no se les ofrece la central de verdad.)
  #hayCentral() {
    return !this.revision && String(EMPRESA?.telefono || '').replace(/\D/g, '').length >= 7;
  }

  // Cuánto busca la central antes de soltar una búsqueda (reglas de la cooperativa).
  #msBusqueda() {
    return this.reglas.minutosBusqueda * 60 * 1000;
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
    // Ronda 4A: lo dice la próxima bienvenida (la cooperativa pudo dejar de recibirlo).
    this.estado.avisarCentral = false;
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
    // Reglas del despacho de la cooperativa (sin ellas, las de siempre: la central es anterior).
    this.reglas = reglasDeBienvenida(d);
    // «Sin conductores» se olvida: si la búsqueda sigue así, la central lo repite después de viaje_actual (y si en
    // la desconexión apareció alguien, el con_conductores se perdió).
    if (this.estado.sinConductores) this.#cambiar({ sinConductores: null });
    // Ronda 4A: «Avisar a la central» solo si la central dice que la cooperativa lo recibe (siempre en el modo revisor).
    if (this.estado.avisarCentral !== (d?.avisarCentral === true)) this.#cambiar({ avisarCentral: d?.avisarCentral === true }, { silencioso: true });
    // Modo revisor: con el GPS lejos de la cooperativa, la recogida pasa al parque principal.
    this.revision = Boolean(d?.revision);
    const antes = this.estado.miPosicion;
    const ahora = this.#paraRevision(antes);
    if (ahora !== antes) {
      this.#cambiar({ miPosicion: ahora });
      this.emit('revision_lejos', ahora);
    }
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
    if (fase === 'buscando' && Date.now() - (viaje.solicitadoEn || viaje.creado) < this.#msBusqueda()) {
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
    } else if (codigo === 'solicitud_invalida' || codigo === 'origen_invalido' || codigo === 'tarifa_invalida' || codigo === 'fuera_de_zona') {
      // tarifa_invalida (servidor 0.2.2): la tarifa no cabe en las de la cooperativa y la
      // central no guardó nada; no se vuelve a mandar igual. fuera_de_zona (0.6.0): la recogida
      // está muy lejos de la zona de servicio (p. ej. la zona cambió mientras se pedía).
      this.#avisar({ titulo: 'No pudimos pedir el taxi', cuerpo: servidor.textoError(codigo), tipo: 'error' });
      this.#cerrarViaje('error');
    }
  }

  #cancelacionReal(d) {
    const { fase, conductor } = this.estado;
    if (canceladaPorCentral(d)) return this.#canceladoPorCentral(d);
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
      // Pasó el tiempo de búsqueda (minutosBusqueda) sin que nadie aceptara.
      if (fase !== 'buscando') return;
      // Modo real con la búsqueda sin nadie que la pudiera tomar (sin_conductores, salvo que la rechazaran): no es
      // que nadie aceptó.
      const sinTaxis = Boolean(this.estado.sinConductores) && this.estado.sinConductores.motivo !== 'rechazado';
      const motivo = sinTaxis ? 'No hubo taxis disponibles' : 'Ningún conductor aceptó';
      perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo }));
      this.#avisar({ titulo: motivo, cuerpo: sinTaxis && this.#hayCentral() ? 'Intenta de nuevo en unos minutos o llama a la central.' : 'Intenta de nuevo.', tipo: 'error' });
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

  // Fase 3: la central canceló el pedido desde su mapa. No se busca otro taxi solo: lo canceló a propósito (por
  // ejemplo, no hay taxis para esa vereda) y lo dice el motivo. Si llega con el id anterior y la app ya lo había vuelto
  // a pedir (volvió sin enterarse), esa búsqueda también se cancela; si ya la tomó otro conductor, el viaje sigue.
  #canceladoPorCentral(d) {
    const { viaje, fase } = this.estado;
    if (!viaje || !FASES_ACTIVAS.includes(fase)) return;
    const anterior = d.viajeId !== viaje.id && (viaje.idsPrevios || []).includes(d.viajeId);
    if (d.viajeId !== viaje.id && !anterior) return;
    if (anterior) {
      if (fase !== 'buscando') return;
      this.bus.publicar('cancelacion', { viajeId: viaje.id, por: 'pasajero', motivo: 'Cancelado por la central' });
    }
    const motivo = motivoDeCancelacion(d);
    const t = textosCentral.canceladoPasajero({ motivo, buscando: fase === 'buscando', empresa: EMPRESA?.nombre || 'La cooperativa', hayCentral: this.#hayCentral() });
    perfil.agregarAlHistorialPasajero(this.#resumenViaje('cancelado', { motivo: t.historial }));
    // Si la central lo volviera a mandar en viaje_actual (no debería), no se retoma: se le repite la cancelación.
    perfil.anotarViajeCerrado('pasajero', { id: viaje.id, ids: viaje.idsPrevios || [], final: 'cancelado', motivo: 'Cancelado por la central' });
    this.emit('cancelado_por_central', { viajeId: d.viajeId, motivo, fase, titulo: t.titulo, cuerpo: t.cuerpo });
    this.#avisar({ titulo: t.titulo, cuerpo: t.cuerpo, tipo: 'alerta', clave: 'cancelado_por_central' });
    this.#cerrarViaje('cancelado');
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

  // Una presencia nueva: los taxis se recalculan en un momento (varias juntas, una sola vez) si
  // la pantalla los muestra; si no, los pone al día el reloj.
  #programarTaxis() {
    if (this.taxisPendientes || appOculta() || !FASES_CON_TAXIS.includes(this.estado.fase)) return;
    this.taxisPendientes = setTimeout(() => {
      this.taxisPendientes = null;
      this.#actualizarTaxis();
    }, 300);
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
    // clave: de qué es el aviso, para el diseño (p. ej. 'cancelado_por_central', que el diseño muestra en grande).
    if (aviso.clave) a.clave = aviso.clave;
    this.estado.ultimoAviso = a;
    this.emit('aviso', a);
  }

  // Modo real: guarda el viaje si quedó una ubicación del taxi sin guardar (ver GUARDAR_UBICACION_MS).
  #guardarUbicacionPendiente() {
    if (!this.ubicacionSinGuardar) return;
    const { taxisCercanos, ...persistible } = this.estado;
    this.#guardarReal(persistible);
    this.ubicacionSinGuardar = false;
    this.ubicacionGuardada = Date.now();
  }

  #cambiar(cambios, { silencioso = false } = {}) {
    Object.assign(this.estado, cambios);
    // Modo real: «sin conductores» es de la búsqueda en curso (se olvida al salir de «buscando»).
    if (this.real && this.estado.sinConductores && (this.estado.fase !== 'buscando' || !this.estado.viaje)) this.estado.sinConductores = null;
    if (!silencioso) {
      const { taxisCercanos, ...persistible } = this.estado;
      this.ubicacionSinGuardar = false;
      if (this.real) this.#guardarReal(persistible);
      else sessionStorage.setItem('ct.viaje.pasajero', JSON.stringify({ guardado: Date.now(), fase: this.estado.fase, estado: persistible }));
    }
    this.emit('cambio', this.estado);
  }

  destruir() {
    this.dejarConfig?.();
    this.dejarVisibilidad?.();
    if (this.alSalir) globalThis.removeEventListener?.('pagehide', this.alSalir);
    this.pararRelojTaxis?.();
    clearTimeout(this.taxisPendientes);
    clearTimeout(this.temporizadorBusqueda);
    clearTimeout(this.relojViajeActual);
    this.ambiente?.detener();
    this.simulado?.detener();
    this.bus.cerrar();
  }
}
