// Simulación para mostrar la app con un solo celular: taxis que circulan por
// El Rosal, un conductor de prueba que acepta y hace el recorrido, y pasajeros
// de prueba para la app del conductor. Nada de esto sale por la red.
import { CONDUCTORES_DEMO, PASAJEROS_DEMO, LUGARES } from './datos.js';
import { TIEMPOS } from './config.js';
import { calcularRuta } from './geo.js';
import { distanciaKm, desplazar, longitudes, puntoEnRuta, esperar, uid, codigoNumerico } from './util.js';

const azar = (a, b) => a + Math.random() * (b - a);
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];

// Duración de un trayecto en la simulación (acelerada, pero creíble).
export function duracionSimulada(minutos, { min = 12000, max = 40000 } = {}) {
  return Math.min(max, Math.max(min, minutos * TIEMPOS.minutoSimulado));
}

// Recorre una ruta en `ms` milisegundos llamando a alAvanzar(punto, fraccion).
// Devuelve { detener, terminado: Promise }.
export function recorrer(coords, ms, alAvanzar, paso = 500) {
  const acum = longitudes(coords);
  const inicio = performance.now();
  let activo = true;
  let temporizador;
  const terminado = new Promise((resolver) => {
    const tic = () => {
      if (!activo) return resolver(false);
      const f = Math.min(1, (performance.now() - inicio) / ms);
      const p = puntoEnRuta(coords, acum, f);
      if (p) alAvanzar(p, f);
      if (f >= 1) return resolver(true);
      temporizador = setTimeout(tic, paso);
    };
    tic();
  });
  return {
    detener() {
      activo = false;
      clearTimeout(temporizador);
    },
    terminado,
  };
}

// Puntos cercanos a un centro, preferiblemente lugares reales de la lista.
function puntosCerca(centro, n, radioKm = 1.6) {
  const cercanos = LUGARES.filter((l) => distanciaKm(l, centro) < radioKm && distanciaKm(l, centro) > 0.15);
  const puntos = [];
  for (let i = 0; i < n; i++) {
    if (cercanos.length > 2 && Math.random() < 0.7) {
      const l = elegir(cercanos);
      puntos.push({ lat: l.lat + azar(-0.0004, 0.0004), lng: l.lng + azar(-0.0004, 0.0004) });
    } else {
      puntos.push(desplazar(centro, azar(0.3, radioKm), azar(0, 360)));
    }
  }
  return puntos;
}

/* ------------------------------------------------------------------ */
/* Taxis que circulan (decoración del mapa del pasajero)              */
/* ------------------------------------------------------------------ */
export class TaxisAmbiente {
  constructor(centro, { cantidad = 6, alCambiar = () => {} } = {}) {
    this.centro = centro;
    this.anclas = this.#crearAnclas(centro);
    this.alCambiar = alCambiar;
    this.taxis = CONDUCTORES_DEMO.slice(0, cantidad).map((c, i) => ({
      id: `amb-${c.movil}`,
      movil: c.movil,
      conductor: c,
      simulado: true,
      ...this.anclas[i % this.anclas.length],
      rumbo: azar(0, 360),
      ocupado: i % 3 === 2,
    }));
    this.activo = true;
    this.reservados = new Set();
    for (const t of this.taxis) this.#vagar(t);
  }

  // Puntos fijos entre los que circulan los taxis (las rutas se reutilizan).
  #crearAnclas(centro) {
    const reales = LUGARES.filter((l) => distanciaKm(l, centro) < 1.6).map((l) => ({ lat: l.lat, lng: l.lng }));
    if (reales.length >= 6) return reales.slice(0, 14);
    return Array.from({ length: 10 }, (_, i) => desplazar(centro, 0.4 + (i % 4) * 0.35, i * 36));
  }

  async #vagar(t) {
    await esperar(azar(200, 2500));
    while (this.activo) {
      if (this.reservados.has(t.id)) {
        await esperar(1000);
        continue;
      }
      const destino = elegir(this.anclas.filter((a) => distanciaKm(a, t) > 0.2)) || elegir(this.anclas);
      const ruta = await calcularRuta(t, destino);
      if (!this.activo) return;
      // A velocidad de pueblo: unos 25 km/h, acelerado ×4 para que se note.
      const ms = Math.max(8000, (ruta.km / 25) * 3600 * 1000 / 4);
      const r = recorrer(ruta.coords, ms, (p) => {
        if (this.reservados.has(t.id)) return;
        t.lat = p.lat;
        t.lng = p.lng;
        t.rumbo = p.rumbo;
      }, 1000);
      this.actual = r;
      await r.terminado;
      await esperar(azar(1500, 6000));
    }
  }

  // Lista visible (sin los reservados para un viaje).
  lista() {
    return this.taxis.filter((t) => !this.reservados.has(t.id)).map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, rumbo: t.rumbo, movil: t.movil, simulado: true, ocupado: t.ocupado }));
  }

  // Taxi libre más cercano a un punto (para que el simulado salga de ahí).
  masCercano(p) {
    let mejor = null;
    for (const t of this.taxis) {
      if (t.ocupado || this.reservados.has(t.id)) continue;
      const d = distanciaKm(t, p);
      if (!mejor || d < mejor.d) mejor = { t, d };
    }
    return mejor?.t || null;
  }

  reservar(id) {
    this.reservados.add(id);
  }

  liberar(id) {
    this.reservados.delete(id);
  }

  moverCentro(centro) {
    if (distanciaKm(centro, this.centro) < 3) return;
    this.centro = centro;
    this.anclas = this.#crearAnclas(centro);
    this.taxis.forEach((t, i) => Object.assign(t, this.anclas[i % this.anclas.length]));
  }

  detener() {
    this.activo = false;
  }
}

/* ------------------------------------------------------------------ */
/* Conductor simulado (para la app del pasajero)                      */
/* ------------------------------------------------------------------ */
// entregar(tipo, datos) inyecta mensajes como si llegaran de la red.
export class ConductorSimulado {
  constructor({ viaje, entregar, ambiente }) {
    this.viaje = viaje;
    this.entregar = entregar;
    this.ambiente = ambiente;
    this.activo = true;
    this.recorrido = null;
    this.pagado = null;
    const taxi = ambiente?.masCercano(viaje.origen);
    this.taxiAmbiente = taxi;
    this.perfil = { ...(taxi?.conductor || elegir(CONDUCTORES_DEMO)), simulado: true };
    this.pos = taxi ? { lat: taxi.lat, lng: taxi.lng, rumbo: taxi.rumbo } : { ...desplazar(viaje.origen, azar(0.7, 1.4), azar(0, 360)), rumbo: 0 };
    if (taxi) ambiente.reservar(taxi.id);
  }

  async iniciar() {
    const { viaje } = this;
    const id = viaje.id;
    const conductorId = `sim-${this.perfil.movil}`;
    const hacia = await calcularRuta(this.pos, viaje.origen);
    if (!this.activo) return;
    this.entregar('aceptacion', {
      viajeId: id,
      conductor: { ...this.perfil, id: conductorId },
      pos: this.pos,
      etaMin: hacia.min,
      ruta: hacia.coords,
    });
    await esperar(1200);

    // 1) Hacia el punto de recogida.
    const ms1 = duracionSimulada(hacia.min, { min: 14000, max: 35000 });
    this.recorrido = recorrer(hacia.coords, ms1, (p, f) => {
      this.pos = p;
      this.entregar('ubicacion', { viajeId: id, conductorId, pos: p, etaMin: Math.max(0, hacia.min * (1 - f)) });
    });
    if (!(await this.recorrido.terminado) || !this.activo) return;
    this.entregar('estado', { viajeId: id, conductorId, fase: 'llego' });

    // 2) El pasajero aborda; el conductor verifica el código y arranca.
    await esperar(8000);
    if (!this.activo) return;
    this.entregar('estado', { viajeId: id, conductorId, fase: 'en_viaje' });

    // 3) Hacia el destino (si no hay destino, a un punto cercano).
    let ruta = viaje.ruta;
    if (!ruta || !viaje.destino) {
      const destino = viaje.destino || desplazar(viaje.origen, azar(1, 2), azar(0, 360));
      ruta = await calcularRuta(viaje.origen, destino);
    }
    const ms2 = duracionSimulada(ruta.min, { min: 16000, max: 45000 });
    this.recorrido = recorrer(ruta.coords, ms2, (p, f) => {
      this.pos = p;
      this.entregar('ubicacion', { viajeId: id, conductorId, pos: p, etaMin: Math.max(0, ruta.min * (1 - f)) });
    });
    if (!(await this.recorrido.terminado) || !this.activo) return;

    // 4) Fin del viaje y cobro.
    const valor = viaje.tarifa?.total || 8000;
    this.entregar('estado', { viajeId: id, conductorId, fase: 'finalizado', valor, km: ruta.km });
    this.entregar('cobro', { viajeId: id, conductorId, valor, movil: this.perfil.movil });
  }

  // El pasajero pagó: el conductor confirma y lo califica.
  async alPagar() {
    await esperar(1500);
    if (!this.activo) return;
    this.entregar('pago_confirmado', { viajeId: this.viaje.id, conductorId: `sim-${this.perfil.movil}` });
    await esperar(1500);
    this.entregar('calificacion', { viajeId: this.viaje.id, de: 'conductor', estrellas: 5, etiquetas: ['Puntual', 'Amable'] });
  }

  detener() {
    this.activo = false;
    this.recorrido?.detener();
    if (this.taxiAmbiente) {
      Object.assign(this.taxiAmbiente, { lat: this.pos.lat, lng: this.pos.lng });
      this.ambiente?.liberar(this.taxiAmbiente.id);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Pasajero simulado (para la app del conductor)                      */
/* ------------------------------------------------------------------ */
export async function crearSolicitudSimulada(posConductor) {
  const [origen] = puntosCerca(posConductor, 1, 1.3);
  let destino;
  if (Math.random() < 0.25) {
    // A veces un viaje intermunicipal.
    destino = LUGARES.find((l) => l.id === elegir(['madrid', 'facatativa', 'subachoque', 'funza', 'mosquera']));
  } else {
    [destino] = puntosCerca(origen, 1, 2.2);
  }
  const pasajero = elegir(PASAJEROS_DEMO);
  const codigo = codigoNumerico(4);
  return {
    viajeId: uid('v'),
    pasajero: { id: uid('ps'), nombre: pasajero.nombre, calificacion: pasajero.calificacion, simulado: true },
    origen: { lat: origen.lat, lng: origen.lng },
    destino: { lat: destino.lat, lng: destino.lng },
    metodoPago: Math.random() < 0.65 ? 'qr' : 'efectivo',
    nota: elegir(['', '', 'Estoy en la portería', 'Llevo una maleta', 'Casa de reja verde', 'Frente a la tienda']),
    codigo, // solo en la simulación: así el conductor puede probar la verificación
    simulada: true,
  };
}

export class PasajeroSimulado {
  constructor({ viaje, entregar }) {
    this.viaje = viaje;
    this.entregar = entregar;
    this.activo = true;
  }

  async alLlegarConductor() {
    await esperar(3500);
    if (this.activo) this.entregar('aviso_pasajero', { viajeId: this.viaje.id, texto: `${this.viaje.pasajero.nombre} ya salió. Código: ${this.viaje.codigo}` });
  }

  async alCobrar(valor) {
    await esperar(4000);
    if (!this.activo) return;
    this.entregar('pago', { viajeId: this.viaje.id, metodo: this.viaje.metodoPago, valor, billetera: this.viaje.metodoPago === 'qr' ? elegir(['Nequi', 'Bre-B', 'DaviPlata', 'Bancolombia']) : null, ref: uid('PG').toUpperCase().slice(0, 10) });
  }

  async alCalificar() {
    await esperar(2000);
    if (this.activo) this.entregar('calificacion', { viajeId: this.viaje.id, de: 'pasajero', estrellas: elegir([5, 5, 5, 4]), etiquetas: ['Amable', 'Conduce seguro'] });
  }

  detener() {
    this.activo = false;
  }
}
