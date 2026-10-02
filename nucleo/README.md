# Núcleo compartido

Lógica de la app de taxis, independiente del diseño visual. Los tres diseños
(`disenos/a`, `disenos/b`, `disenos/c`) usan este mismo núcleo, así que funcionan
igual y solo cambia cómo se ven.

```js
import * as N from '../../nucleo/index.js';
```

## Cooperativa activa

Antes de cargar los módulos, la página fija `window.CT_EMPRESA = '<id>'` (o `?e=<id>`).
`config.js` carga `empresas/<id>/ficha.json` y exporta `FICHA`, `ID_EMPRESA`,
`EMPRESA`, `TIPO_EMPRESA` (`'cooperativa'` o `'empresa'`, de `EMPRESA.tipo`: los
textos dicen «la ${TIPO_EMPRESA}»), `COLORES`, `CENTRO`, `ZONA`, `ES_PROPUESTA`
(todo lo que no sea `estado: "cliente"`) y `PROVEEDOR`. `datos.js` toma de la ficha `LUGARES`,
`RUTAS`, `TARIFAS` (completadas con valores de ejemplo) y `CONDUCTORES_DEMO`.
Si la ficha no carga, el módulo falla (nunca muestra otra cooperativa) y la
pantalla de carga avisa a los 15 s.

- `urlDelSitio(ruta)`: raíz del sitio (librerías, `pagar/`).
- `urlEmpresa(ruta)`: raíz de la cooperativa (`<id>/descargar/`…).
- `perfil.*` guarda con prefijo `ct.<id>.` (Cootransrural: `ct.`).
- Bus: `BroadcastChannel apptaxi-<id>-<sala>` y temas `apptaxi-demo/v2/<id>/<sala>`.
- Pendiente conocido: el viaje en curso va en `sessionStorage['ct.viaje.pasajero']`
  (común a todas). Cada diseño lo aparta por cooperativa al abrir.

## Pasajero

```js
const p = await N.crearPasajero();      // pide GPS, arranca taxis de ambiente
p.on('cambio', (estado) => pintar(estado));   // se emite seguido (posiciones)
p.on('aviso', ({ titulo, cuerpo, tipo }) => toast(...)); // tipo: info|exito|alerta|error

p.registrado                  // ¿ya se registró?
N.perfil.registrarPasajero({ nombre, celular, correo, contactoEmergencia })
await p.cotizar({ origen, destino, programadoPara })  // → { ruta: {coords,km,min,aproximada}, tarifa: {total, detalle[], descuento, rutaFija} }
await p.solicitar({ origen, destino, metodoPago: 'qr'|'efectivo', programadoPara, nota })
p.cancelar(motivo)
p.pagarConQR(textoLeido | null, billetera)   // null = pago simulado con el cobro recibido
p.pagarEnEfectivo()
p.calificar(estrellas, { etiquetas, comentario })
p.omitirCalificacion()
p.textoCompartir()            // para WhatsApp
p.urlCobroActual()            // URL del QR que mostraría el conductor
```

`estado.fase`: `inicio → buscando → asignado → llego → en_viaje → pagar → calificar → inicio`.

Otros campos de `estado`: `viaje` (`id, origen, destino, ruta, tarifa, metodoPago,
codigo` de 4 dígitos, `simulado`), `conductor` (`movil, nombre, placa, vehiculo,
color, calificacion, viajes, tel`), `posConductor`, `rutaConductor`, `etaMin`,
`cobro` (`valor`), `pago`, `calificacionRecibida`, `miPosicion` (`real: false`
si no hubo GPS), `taxisCercanos`, `conductoresReales`, `conexion`
(`local` | `en-vivo`), `sala`.

Un punto (`origen`, `destino`) es `{ lat, lng, titulo, detalle }`.

## Conductor

```js
const c = await N.crearConductor();
c.on('cambio', pintar); c.on('aviso', toast);
c.on('llegada', (fase) => ...)   // la conducción simulada llegó al punto
c.on('vencida', (viajeId) => ...) // una solicitud expiró sin respuesta

N.perfil.ingresarConductor({ movil, pin })  // cualquier PIN de 4 dígitos en la demo
c.conectar() / c.desconectar()
await c.simularSolicitud()        // pasajero de prueba cerca
await c.aceptar(viajeId); c.rechazar(viajeId)
c.llegue()
await c.iniciar(codigo)           // false si el código no coincide; { sinCodigo: true } para saltarlo
c.finalizar(valorManual?)         // → { valor, url }  (url = contenido del QR de cobro)
c.confirmarEfectivo()
c.calificar(estrellas, { etiquetas })
c.cancelar(motivo)
await c.usarGpsSimulado(true|false|null)
```

`estado`: `conectado, pos, gpsReal, solicitudes[]` (`viajeId, pasajero, origen,
destino, tarifa, km, min, metodoPago, nota, distanciaAMi, expira, simulada,
codigo` solo en simuladas), `viaje` (`fase`: `confirmando → hacia_origen →
en_origen → en_viaje → cobrando → calificar`; `urlCobro`, `valor`, `pago`,
`codigoSimulado`), `rutaActual`, `etaMin`, `kmRestantes`, `mensajePasajero`,
`resumen` (`viajes, ganado, porQR, efectivo, promedio, km`).

## Mapa

```js
const m = await N.crearMapa(div, { capa: 'claro'|'suave'|'oscuro'|'osm', colorRuta, colorTaxi, colorOrigen, colorDestino });
m.ponerOrigen(p); m.ponerDestino(p); m.ponerRuta(coords, { color }); m.ponerYo(p)
m.ponerTaxi(id, p, { rumbo, destacado, etiqueta }); m.sincronizarTaxis(lista); m.limpiarTaxis(exceptoId)
m.ajustar([p1, p2], { margenAbajo }); m.centrar(p, zoom); m.centro(); m.alMoverse(fn); m.refrescar()
```

## Otros

- `N.buscarDirecciones(texto)`, `N.buscarLocal(texto)`, `N.direccionDe(p)`, `N.obtenerPosicion()`
- `N.LUGARES`, `N.CATEGORIAS`, `N.RUTAS`, `N.TARIFAS`, `N.EMPRESA`, `N.calcularTarifa(...)`, `N.progresoFidelidad(n)`
- `N.calcularTarifa(...)` devuelve además `tipo` (`'oficial'` | `'estimada'` | `'referencia'`),
  `etiqueta` (el texto del chip: «Tarifa oficial · Decreto 05 de 2026», «Tarifa estimada»,
  «Precio de referencia» o, en las fichas de ejemplo, «Tarifa de ejemplo»), `fuente`,
  `destinoOficial` y `notas`. Tabla oficial: `N.TARIFAS_OFICIALES`, `N.FUENTE_TARIFAS`,
  `N.ORIGEN_OFICIAL`, `N.DESTINOS_TARIFA`, `N.zonasTarifa()`, `N.buscarTarifas(texto)`,
  `N.destinoOficial(punto)`, `N.lugarDeTarifa(d)`, `N.textoPrecision(d)`, `N.enCascoUrbano(p)`.
- `N.PARADERO` y `N.PUNTO_RECOGIDA`: sin GPS, `N.obtenerPosicion()` devuelve el paradero de
  la ficha (si lo hay) en vez del centro del pueblo.
- `N.qrSVG(texto, { redondeado, color, fondo })`, `N.escanearQR(video, alLeer)`, `N.urlDescarga({ movil })`
- `N.pedirPermisoNotificaciones()`, `N.prepararSonido()`, `N.sonar(tipo)`
- `N.instalar()`, `N.puedeInstalar()`, `N.instruccionesInstalacion()`, `N.yaInstalada()`
- `N.pesos(v)`, `N.minutosTexto(m)`, `N.kmTexto(km)`, `N.horaTexto(t)`, `N.saludo()`, `N.enlaceWhatsApp(n, texto)`, `N.enlaceNavegacion(p, 'waze')`
- `N.perfil.*`: historial, lugares guardados, recientes, programados, ajustes (`simulacion: 'auto'|'real'`), diseño elegido.

## App nativa 1.2 (`N.nativo`)

Notificaciones push y Face ID / huella de la app de las tiendas (`nucleo/nativo.js`). Todo va
detrás de `ES_NATIVA && Capacitor.isPluginAvailable('PushNotifications' | 'NativeBiometric')`:
en la web, en las demos y en la app 1.0 (sin esos plugins) no hace nada.

- Push: `pushDisponible()`, `permisoPush()`, `registrarPush(app, { pedir })` (permiso →
  `register` → `PUT yo/dispositivo { app, plataforma, token, entorno: 'production' }`),
  `reanudarPush(app)` (sin pedir permiso, al tener sesión), `reintentarPush()` (al reconectar),
  `olvidarPush()` (`DELETE yo/dispositivo { token }`, antes de cerrar sesión o eliminar la cuenta),
  `alTocarAviso(fn)` (`{ tipo, viajeId }` al tocar una notificación; si la app se abrió desde
  ella, llega apenas el diseño se suscribe) y `eventos.on('recibida', fn)` (con la app abierta).
- Face ID: `biometria()` (`{ disponible, nombre: 'Face ID' | 'Touch ID' | 'tu huella' | …, icono }`),
  `llaveGuardada()`, `crearLlave({ correo })` (`verifyIdentity` → `POST yo/llave` →
  `setCredentials` con server `taxicun.com`), `entrarConLlave()` (`verifyIdentity` →
  `getCredentials` → `POST auth/llave`; `llave_invalida` borra las credenciales), `borrarLlave()`,
  `olvidarLlave()`, `verificar({ razon, respaldo })`, `bloqueoActivo()` / `fijarBloqueo(v)`,
  `vigilarBloqueo(fn)` (al abrir y al volver tras más de 60 s) y `olvidarTodo()` (al eliminar la cuenta).
- Cerrar sesión conserva la llave (para volver con Face ID); eliminar la cuenta la borra.

El diseño A lo usa en `disenos/a/nativa.js` (modales en el momento justo, «Entrar con Face ID»,
capa de bloqueo) y en Ajustes («Seguridad» y las notificaciones del celular). Prueba con
Capacitor y servidor simulados: `node pruebas/nativo-v12.mjs http://localhost:8823/`.

## Red

Sin servidor propio. Las pestañas del mismo navegador se hablan por
`BroadcastChannel`. Los celulares distintos, por relés MQTT públicos (varios a
la vez, ver `config.js`), dentro de una «sala» (`?sala=nombre`). Si nadie
acepta en unos segundos, entra un conductor simulado (`ajustes.simulacion = 'auto'`).
