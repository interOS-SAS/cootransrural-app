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
(`local` | `en-vivo`), `sala`. En modo real, además, `sinConductores` (`{ viajeId, desde }` mientras la
central diga que la búsqueda no le llegó a ningún taxi; `null` si no; ver «Reglas del despacho»).

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
await c.aceptar(viajeId); c.rechazar(viajeId)   // en modo real, «Rechazar» avisa a la central (rechazo)
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
codigo` solo en simuladas; `recibida`; `expira`: en modo real, a los `segundosOferta` de las reglas),
`viaje` (`fase`: `confirmando → hacia_origen →
en_origen → en_viaje → cobrando → calificar`; `urlCobro`, `valor`, `pago`,
`codigoSimulado`), `rutaActual`, `etaMin`, `kmRestantes`, `mensajePasajero`,
`resumen` (`viajes, ganado, porQR, efectivo, promedio, km`).

## Reglas del despacho (modo real, `nucleo/reglas.js`)

El gerente de cada cooperativa las edita en el panel (Reglas → «Reglas del despacho») y la central se las
manda a la app en la bienvenida del bus: `bienvenida.reglas = { segundosOferta, metrosLlegue,
minutosBusqueda }`; si cambian con la app abierta, en el mensaje `reglas` (las tres sueltas, valen desde ya).
`reglasDeBienvenida(d)` las completa y las lleva a los topes del panel (15–60 s, 50–300 m,
3–20 min); sin reglas (central anterior) quedan los valores de siempre (25 s, 150 m, 10 min). Se guardan por
cooperativa (`tc.real.reglas.<id>`) para antes de la próxima bienvenida. Como `N.reglas.*`.

- Conductor: la oferta dura `segundosOferta` (el anillo del diseño A cuenta desde ahí) y «Llegué» vale a
  `metrosLlegue` del punto (en modo revisor, al menos 400 m).
- Pasajero: una búsqueda que la central ya no tiene se vuelve a pedir si tiene menos de `minutosBusqueda`.

Mensajes nuevos del bus (los nombres están solo en `MENSAJES` de `reglas.js`; las centrales anteriores
ignoran los del conductor y no mandan los del pasajero, así que nada cambia con ellas):

- `oferta_vista { viajeId }` (conductor → central): la oferta quedó en pantalla (la primera, sin servicio) con
  la app a la vista, una vez cada vez que llega (`solicitud.vista`). La que llega con la app oculta sale al
  volver si sigue en pantalla. La central no la repite por push y cuenta sus `segundosOferta` desde ahí.
- `rechazo { viajeId }` (conductor → central): tocó «Rechazar». No sale al vencerse la cuenta regresiva ni
  cuando la oferta se quita sola. La central no se la vuelve a ofrecer (ni por push ni por el bus).
- `sin_conductores { viajeId, motivo }` (central → pasajero): la búsqueda no le llegó a nadie que la pueda
  tomar; `motivo`: `sin_taxis` (nadie en turno en el radio), `ocupados`, `rechazado` (la rechazaron o se les
  venció) o `excluidos` (solo hay taxis en pausa con él). `estado.sinConductores = { viajeId, desde, motivo }`
  y un aviso (una vez por búsqueda); el diseño A muestra el texto de `textoSinConductores(motivo)` («No hay
  taxis en turno cerca», «Los taxis cercanos están ocupados», «Ningún taxi tomó tu solicitud» o «No hay taxis
  disponibles ahora», que no habla de la pausa) con «Llamar a la central» (sin ella en modo revisor). La
  búsqueda sigue. `con_conductores { viajeId }` lo quita y avisa «Tu solicitud ya le llegó a un taxi». Con
  cada bienvenida se olvida: al reconectarse, la central lo repite después de `viaje_actual` si sigue así.
  Si la central suelta la búsqueda así, el aviso dice «No hubo taxis disponibles» (o «Ningún conductor
  aceptó» si la rechazaron).

Un mensaje de la central con el tipo de un evento propio del bus (`rechazo`, `conexion`, `estado_conexion`,
`mensaje`) solo sale como `mensaje`: un `rechazo` que volviera por el bus no saca al conductor del turno.

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

### Ubicación con la app minimizada (plugin local `UbicacionTurno`, solo en la app del conductor)

Con el plugin (detrás de `ES_NATIVA && isPluginAvailable('UbicacionTurno')`), el conductor en
turno que minimiza la app o usa otra sigue enviando su ubicación por HTTP nativo
(`POST /api/conductor/ubicacion`, servidor 0.4.0); el JS no manda nada mientras tanto.

- `turnoNativoDisponible()`, `aceptoSegundoPlano()` / `avisoSegundoPlano()` /
  `fijarAceptoSegundoPlano(si)` (localStorage `taxicun.turno.aviso`), `iniciarTurnoNativo({ modo, libre })`,
  `cambiarModoTurno(modo, { libre })`, `detenerTurnoNativo(motivo, { avisar })`,
  `estadoTurnoNativo()` (`{ activo, modo, desde, motivo, precisa }`), `turnoNativoActivo()`,
  `alDetenerTurno(fn)` (el plugin se detuvo solo: `turno_apagado` desde la notificación, `permiso`,
  `tope`, `sin_sesion`…; también `eventos.on('turno_detenido')`).
- `vigilarTurno(ctl, { libre })`: corre si está en turno, aceptó el aviso y tiene un viaje activo
  o el teléfono puede recibir avisos (`pushListo()`); modo `viaje` con el pasajero en camino o a
  bordo, `libre` si no. Lo inicia solo con la app al frente; al cargar y al volver revisa el
  plugin (retoma el turno si la página se recargó con el seguimiento vivo y la marca
  `tc.turno.conductor`; si no, arranca fuera de turno). Le da al controlador `ctl.nativo`
  (`activo()`, `enviando()`): presencia con `segundoPlano: true`, y con la app oculta el JS suelta
  su GPS y no manda presencia ni ubicación.
- Al volver, hasta la primera lectura del GPS del JS (`posVieja` en el controlador), la presencia sale
  **sin `pos`** y la aceptación sin `pos`, `etaMin` ni `ruta`: la central (0.4.0) usa la última posición
  del plugin. Si no, el taxi saltaría a donde se minimizó y el radio de las ofertas se mediría desde ahí.
- `turnoNativoEnCurso()`: el plugin lleva el turno o, recién cargada la página, su marca dice que lo
  llevaba. El diseño A lo usa en `bus.cerrarAlOcultar`: con la app oculta el bus no se abre (ni al
  volver la red, ni con un reintento, ni al recargarse la página) y el que se abría se suelta; se abre
  al volver (ver `nucleo/bus.js`). La central (0.4.0) además no despierta a un dormido con GPS hasta el
  primer mensaje de esa conexión.

El diseño A: `ofrecerSegundoPlano()` (aviso «Tu ubicación mientras estás conectado», antes de
iniciar), «Con la app minimizada» en Ajustes y los avisos cuando el plugin se detiene. Prueba:
`node pruebas/segundo-plano.mjs http://localhost:8961/`.

Contrato con el plugin nativo (taxicun-app, `herramientas/nativo/`, igual en iOS y Android):
`iniciar({ url, token, modo, libre })` (errores `DATOS`, `SIN_PERMISO`, `SEGUNDO_PLANO` y, solo en
iOS, `SIN_MODO`), `cambiarModo({ modo?, libre? })`, `detener({ motivo, avisar })` (con `avisar` manda
el último POST con `fin`; **no** dispara «detenido»), `estado()` (`{ activo, modo, libre, motivo,
origen, precisa, desde?, ultimoEnvio?, plataforma }`) y el evento «detenido» `{ motivo, origen }`
(solo cuando se detiene solo; `origen`: `notificacion`, `servidor` o `sistema`; retenido hasta que
la web lo escuche). De punta a punta, con el plugin simulado en Node (mismas reglas que el nativo,
POST reales) y el servidor 0.4.0 con tiempos cortos: `node pruebas/segundo-plano-e2e.mjs
http://localhost:8971/` (ver su cabecera). Los casos límite de la revisión (recarga con la app oculta,
la red que vuelve o un vistazo con la app oculta, la vuelta con el GPS del JS lento, sin ningún POST,
Android en un servicio sin «Salir de turno»): `node pruebas/segundo-plano-casos-e2e.mjs
http://localhost:8971/`, con el mismo montaje.

## Red

Sin servidor propio. Las pestañas del mismo navegador se hablan por
`BroadcastChannel`. Los celulares distintos, por relés MQTT públicos (varios a
la vez, ver `config.js`), dentro de una «sala» (`?sala=nombre`). Si nadie
acepta en unos segundos, entra un conductor simulado (`ajustes.simulacion = 'auto'`).
