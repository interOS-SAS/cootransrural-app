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

- `urlDelSitio(ruta)`: raíz del sitio (librerías, `pagar/`). Solo rutas del mismo sitio:
  cualquier otra cosa da `''`.
- `urlEmpresa(ruta)`: raíz de la cooperativa (`<id>/descargar/`…), con la misma regla. La
  carpeta (`FICHA.carpeta`) y el id solo pueden ser nombres simples (a-z, 0-9 y guiones).
- `perfil.*` guarda con prefijo `ct.<id>.` (Cootransrural: `ct.`).
- Bus: `BroadcastChannel apptaxi-<id>-<sala>` y temas `apptaxi-demo/v2/<id>/<sala>`.
- Pendiente conocido: el viaje en curso va en `sessionStorage['ct.viaje.pasajero']`
  (común a todas). Cada diseño lo aparta por cooperativa al abrir.

## Enlaces seguros (`enlaces.js`)

Con el panel, la ficha la escriben los gerentes: **todo `href` o `src` armado con datos
de la ficha o del servidor pasa por estos ayudantes** (requisito S30 del diseño del
panel). Si el dato no cumple, devuelven `''` y la pantalla no pinta el enlace.

- `urlSegura(u)`: solo `https:`, sin usuario, clave ni puerto, y de un dominio de
  `DOMINIOS_PERMITIDOS` (WhatsApp, Google Maps, Waze, interOS, TaxiCun, *.gov.co y
  `SITIOS_COOPERATIVAS`, la lista revisada de páginas oficiales de las cooperativas).
  Una cooperativa nueva con página propia se agrega a esa lista: `pruebas/enlaces-seguros.mjs`
  falla si alguna ficha no pasa.
- `urlDecreto(u)`: la fuente oficial de las tarifas, solo `*.gov.co`. `FUENTE_TARIFAS.url`
  ya sale filtrada por aquí.
- `urlInterna(u)`: rutas del mismo sitio (privacidad, la otra app, íconos).
- `enlaceTel(n)` y `enlaceCorreo(c)`: `tel:` solo con dígitos (y `+`) y `mailto:` con un
  correo sencillo.
- `hrefSeguro(u)`: cualquiera de los anteriores (acciones de un diálogo, ítems de un menú).
- Al cargarse pone una barrera de clics: un enlace `javascript:`, `data:` u otro esquema
  que ejecute código no navega (los `blob:`, solo si son de este mismo sitio).

`enlaces.js` no depende de la ficha: `web/taxicun.js` lo usa antes de escoger la cooperativa.
Las páginas no llevan manejadores en línea (`onclick`, `onerror`, `onsubmit`): la CSP de
taxicun.com no los deja.

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

## Tarifas: un solo cálculo (`tarifador.js`)

El cálculo de la tarifa vive **solo** en `tarifador.js` (§5.5 del diseño del panel). Es puro: sin
DOM, sin red y sin `config.js` ni `datos.js`; todo sale de la ficha que se le pasa, y solo importa
`util.js` y `enlaces.js`.

```js
import { crearTarifador, tablasTarifa, TARIFAS_BASE } from './tarifador.js';
const T = crearTarifador(ficha);   // ficha = empresas/<id>/ficha.json, o la que arma la API (archivo + capa)
T.calcularTarifa({ origen, destino, km, fecha, programado, viajesPrevios });
// y T.TARIFAS, T.RUTAS, T.LUGARES, T.DESTINOS_TARIFA, T.CASCO_URBANO, T.TARIFAS_OFICIALES,
// T.FUENTE_TARIFAS, T.ORIGEN_OFICIAL, T.enCascoUrbano, T.destinoOficial, T.rutaFija, …
```

- `tarifas.js` es el envoltorio: `crearTarifador(FICHA)` con la ficha de la página. Las apps y la
  web siguen importando `N.calcularTarifa`, `N.TARIFAS_OFICIALES`… como antes.
- `datos.js` toma `TARIFAS`, `RUTAS`, `LUGARES`, `DESTINOS_TARIFA` y `CASCO_URBANO` de
  `tablasTarifa(FICHA)`: son los mismos objetos que usa el tarifador de la página.
- **Prueba dorada:** `node pruebas/tarifas-doradas.mjs` (sin navegador, unos 8 s). Compara
  los 3.425 casos de Cootransrural (los 191 destinos del Decreto 05 por lista, por nombre y por
  cercanía, sin destino, las 14 rutas, los lugares, los bordes de cada radio y los recargos a varias
  horas en día normal, domingo y festivo) y de 21 demos con `pruebas/tarifas-doradas.json`, que se
  generó con el `tarifas.js` de antes del refactor. Si una ficha de la muestra cambia, también falla.
  Un cambio de precios **a propósito**: `node pruebas/tarifas-doradas.mjs --regenerar` y revisar el
  diff de la dorada en el PR. Los casos están en `pruebas/tarifas-casos.mjs` (sin importaciones: el
  servidor los lee del commit fijado).
- **Copia fijada en el panel y el servidor:** `taxicun-servidor` lleva `tarifador.js`, `util.js` y
  `enlaces.js` en `panel/vendor/nucleo/`, copiados de un commit concreto de este repo con su SHA-256
  (`panel/vendor/FUENTES.json` y `SHA256SUMS`; `node bin/panel-vendor.mjs copiar --web=<este repo>`).
  El panel la usa para la vista previa de «Precios» y el servidor para la prueba dorada con la ficha
  armada (S33) y, más adelante, para los topes por destino (S31). **Cambiar `tarifador.js` aquí no
  cambia nada allá** hasta que se vuelva a fijar el commit; no le agregues importaciones (la copia
  lleva solo esos tres archivos).

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
http://localhost:8971/` (ver su cabecera).

## Red

Sin servidor propio. Las pestañas del mismo navegador se hablan por
`BroadcastChannel`. Los celulares distintos, por relés MQTT públicos (varios a
la vez, ver `config.js`), dentro de una «sala» (`?sala=nombre`). Si nadie
acepta en unos segundos, entra un conductor simulado (`ajustes.simulacion = 'auto'`).
