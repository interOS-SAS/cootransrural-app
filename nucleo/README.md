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

## Fase 3 del panel: la central desde su mapa (modo real, `nucleo/central.js`)

Desde el mapa en vivo del panel (servidor 0.7.0) la central saca a un conductor de turno, cancela un pedido y le
ofrece un pedido a un móvil. El contrato completo está en la cabecera de `central.js` (los nombres, solo ahí); las
centrales anteriores no mandan nada de esto y todo sigue igual. Los textos salen de `textosCentral` (todos los
diseños los mismos) y el motivo que escribió la central es texto plano: `motivoCentral()` lo limpia y lo corta a 200,
y el diseño lo pinta con `textContent` o escapado (S30).

- **Sacar de turno.** `sacado_de_turno { motivo, en }` (con el bus abierto) o `bienvenida.sacadoDeTurno` (lo sacó
  sin el bus abierto; llega antes de anunciarse, así no queda disponible ni un instante). El conductor queda
  `conectado: false` y `estado.sacado = { motivo, en, desde }` hasta su próximo «Conectarme» (lo puede hacer
  cuando quiera); con un servicio en curso lo termina y queda fuera al terminarlo (también si la página se recarga
  en medio). Evento `'sacado_de_turno'` ({ motivo, conServicio, alTerminar, actualizado, yaFuera, origen, titulo,
  cuerpo }) y el aviso con `clave: 'sacado_de_turno'`. `c.sacadoDeTurno(datos, { origen })` lo aplica desde el
  diseño: al tocar el push `{ tipo: 'sacado_de_turno', motivo, en }` y cuando el plugin UbicacionTurno se detiene
  con `'servidor'` (la central respondió `seguir: false`); `nativo.js` no lo vuelve a iniciar hasta la próxima
  bienvenida.
- **Cancelar.** `cancelacion { viajeId, por: 'central', motivo }`. El conductor quita la oferta o suelta el servicio
  y sigue en turno. El pasajero cierra el viaje SIN buscar otro taxi, lo guarda en «Mis viajes» como «Cancelado por
  la central: …» y emite `'cancelado_por_central'` ({ viajeId, motivo, fase, titulo, cuerpo }); el diseño A lo
  muestra con «Llamar a la central». Si llega con el id anterior y la app ya lo había vuelto a pedir, cancela
  también la búsqueda nueva (si ya la tomó un conductor, el viaje sigue).
- **Ofrecer a un móvil.** La solicitud de siempre con `central: true` (`ofrecidaPorCentral(s)`): el aviso dice «La
  central te ofrece un servicio» y la hoja amarilla del diseño A «La central te ofrece este servicio».

**Política de privacidad (S36).** `N.POLITICA = { version, vigenteDesde, avisar }` sale de `nucleo/politica.js`, que
escribe `herramientas/generar-empresas.py` desde `herramientas/politica.json` (`publicar_1_3`). Con `avisar`, el
diseño A muestra una vez por versión la tarjeta «Actualizamos la política de privacidad» (`disenos/a/politica.js`;
`taxicun.politica.vista` en el celular), solo en modo real; quien entra aceptando la política ya la tiene vista.

## Ronda 4A «Operación de la central» (modo real, servidor 0.9.0)

El contrato está en la cabecera de `nucleo/central.js` (los textos, en `textosCentral`, iguales para los tres diseños).
Las centrales anteriores no mandan nada de esto y las rutas nuevas que respondan 404 se ignoran en silencio: con el
servidor 0.8 todo sigue igual. Lo que manda la central (el nombre de quien llamó, la nota, el título y el texto de un
aviso) es texto plano: el diseño lo pinta con `textContent` (`lineaCentral()` y `avisoDeCentral()` lo limpian).

- **Pedido por teléfono** (conductor). La solicitud, la asignación y `viaje_actual` con `pedidoCentral: true` dejan
  `viaje.pedidoCentral` (`N.esPedidoCentral(x)`): el pasajero es quien llamó (primer nombre, sin calificación), al que gana
  le llega su celular y `codigoHash: ''` (se inicia con `c.iniciar(null, { sinCodigo: true })`), y al confirmar el
  efectivo el servicio se cierra sin pasar por «calificar» (no hay app del pasajero: no se manda `calificacion`). El
  historial lo anota con `pedidoCentral: true`. El diseño A: «Pedido de la central» con el nombre en la hoja amarilla (sin
  estrellas ni «pasajero verificado»), «Llamar a {nombre}» (solo `tel:`, sin WhatsApp) y, en «Recoger», «Confirma que es
  {nombre}» con «Iniciar viaje».
- **«Avisar a la central»** (SOS de las dos apps, `nucleo/sos.js`). `estado.avisarCentral` (de `bienvenida.avisarCentral`;
  sin el campo, `false`) dice si se ofrece; `p.avisarCentral()` / `c.avisarCentral()` lo mandan sin otra confirmación
  (`POST /api/sos { rol, empresa? (solo el pasajero), viajeId?, pos?, clave }`) con la posición del momento (el conductor
  en turno usa la de su GPS; el modo revisor, la del paradero) y devuelven el envío (`on('estado')`, `listo`,
  `cancelar()`). Sin señal o con la central caída reintenta con la MISMA clave a los 3, 5, 10 y cada 15 s hasta 2 minutos
  (`'reintentando'`); finales: `'enviado'`, `'demasiados'` (429), `'no_disponible'` (403 o una central anterior: la
  bandera se apaga hasta la próxima bienvenida), `'fallo'`, `'sin_sesion'` o `'error'`. El diseño A
  (`disenos/a/central.js`, `seguirSos`): «Avisando a la central…», «Le avisamos a la central de {coop}. Si estás en peligro,
  llama al 123.», «Sin señal: seguimos intentando…» o «Ya le avisaste a la central hace un momento.», siempre con la 123; el
  pasajero lo tiene en su SOS (entre la 123 y «Llamar a la central») y el conductor en «¿Necesitas ayuda?» (botón en la
  barra y en la hoja del servicio).
- **Avisos de la cooperativa** (`nucleo/bandeja.js`, `ctl.bandeja`). El mensaje `aviso` del bus y, con cada bienvenida (a
  lo sumo una vez por minuto), `GET /api/avisos?rol=`; `'nuevo'` (para la tarjeta, una vez por sesión), `'mostrar'` (el push
  `{ tipo: 'aviso', id }` tocado: `bandeja.mostrar(id)`), `'cambio'`, `lista`, `sinLeer()` y `leer(ids)` (`POST
  /api/avisos/leidos`; si no sale, se reintenta). Se guarda con el prefijo `tc.real.` (se borra si entra otra cuenta). Uno
  `para` el otro rol se descarta. El diseño A: la tarjeta «Aviso de {coop}» («Entendido» lo deja leído; no tapa una oferta
  ni otro diálogo), la sección «De tu cooperativa» en «Avisos» (verla los deja leídos), la insignia de la campana y, para
  el pasajero, «Avisos de {coop}» en Ajustes (`GET`/`PUT /api/yo/avisos`, la baja voluntaria).

Pruebas: `node pruebas/f4a-app.mjs <url>` (servidor y Capacitor simulados, ~2 min) y, contra la instalación local con el
servidor 0.9.0, `node pruebas/f4a-app-real.mjs --dir=<instalación> --servidor=<árbol del servidor>`. Las e2e de siempre
aceptan servidores 0.8 y 0.9.

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
  generó con el `tarifas.js` de antes del refactor y se regeneró a propósito con los festivos de la
  fase 2 (solo cambiaron los casos `fes-*` de las demos con recargo dominical). Si una ficha de la
  muestra cambia, también falla.
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

## Fase 2 del panel: la ficha armada por la API (`panel.taxicun.com`, «Precios y zona»)

Las cooperativas con configuración publicada en el panel reciben `empresas/<id>/ficha.json` armada por
la API (archivo + capa; nginx manda a la API solo esas fichas). Las 76 demos siguen con su archivo: sin
estas claves, todo queda igual. Todo lo que viene de la ficha o del servidor es **texto** (S30).

- **Índice con las compuertas** (`web/taxicun.js`, pedido de Oscar del 3-oct). En modo real, cuáles
  cooperativas atienden de verdad lo dice `GET /api/empresas/indice` (el `indice.json` con `real: true`
  para las que están activas en el panel, con zona y tarifas publicadas y al menos un conductor aprobado,
  y `pronto: true` para las activas a las que les falta algo). De ahí solo se toman `real` y `pronto` de
  los ids que ya están en el índice de la web; si no responde bien (servidor 0.5.0, sin red), queda el
  `real` del archivo. Las «pronto» salen en la lista como «Pronto» y no se abren; con una sola real se
  abre directo, como hoy. La demo no pregunta nada.
- **Zona de servicio** (§5.7). `N.ZONA_SERVICIO` (`{ poligonos, avisarHastaKm, texto }` o `null`),
  `N.dentroDeZona(zona, punto)` (`util.js`: `{ dentro, km, metros }`, la misma cuenta de la central) y
  `N.revisarZona(punto)` (`geo.js`: `null` sin zona; si no, `estado` `'dentro'`, `'cerca'` —afuera, a
  `avisarHastaKm` o menos— o `'lejos'`). El controlador del pasajero: `p.zonaDe(punto)` (`null` en la demo
  y en el modo revisor) y `solicitar()` no pide un taxi «lejos» (`fuera_de_zona`). El diseño A avisa en el
  inicio y en «Confirma tu viaje» y abre la hoja de fuera de zona al pedir; el conductor ve el chip
  «Fuera de zona · 1,4 km del límite» (`fueraZona: { km }` de la oferta).
- **Recarga con «config»** (`config.js`: `vigilarConfig(bus, { ocupado, emisor })`, ya lo llaman los dos
  controladores). Con `{ tipo: 'config', datos: { empresa, version } }` y una versión mayor que
  `N.VERSION_CONFIG.version`: con viaje espera; sin viaje recarga en silencio (al ocultarse la app o tras
  un minuto sin tocarla); el conductor, solo fuera de turno. Solo el bus del servidor; nunca dos veces por
  la misma versión (`localStorage['tc.config.recargas']`). En modo real la ficha se pide con
  `cache: 'no-cache'`.
- **Festivos** (§5.6, `util.js`): `esFestivo(fecha)`, `festivosDe(año)` y `horaBogota()` con `festivo`
  y `fecha`. El recargo dominical se cobra también en los festivos («Recargo festivo»), salvo
  `TARIFAS.recargoDominicalEnFestivos: false`. La dorada se regeneró a propósito: solo cambiaron los casos
  `fes-*` de las demos con recargo dominical; Cootransrural no cambia (recargos en $0).
- **Precio fijado por la cooperativa**: una ruta con `fijada: true` da `tipo: 'fijada'` y la etiqueta
  «Precio fijado por Cootransrural» (sin «por confirmar»). Los diseños A, B y C y la web lo dicen.
- **Conductor rechazado o retirado** (servidor 0.6.0): su pantalla, con el motivo de la cooperativa
  (`conductor.motivo` o `motivo_conductor` de `GET /api/yo`) pintado con `textContent`.
- **`data-precio`** (`web/sitio.js`): la plantilla marca los precios de la página
  (`data-precio="minimaUrbana"`, `"destino:<id>"`, `data-precio-zona`, `data-texto-tarifas="nota"`,
  `data-enlace-fuente`) y la página pone los vigentes de la ficha que cargó.
- `N.VERSION_CONFIG` (`{ version, publicada, fuente }` o `null`) y `N.textoPlano(t, max)`.

La copia fijada del servidor (`tarifador.js`, `util.js` y `enlaces.js`) **cambia** con esta fase
(festivos y geometría en `util.js`, rutas «fijada» y festivos en `tarifador.js`): hay que volver a fijar el
commit en `panel/vendor/FUENTES.json` del servidor.

Pruebas: `node pruebas/festivos-zona.mjs` (sin navegador) y `node pruebas/fase2-web.mjs <url>` (servidor
simulado: índice, fuera de zona, precio fijado, conductor, recarga y `data-precio`).

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

## «Lejos de toda cooperativa» (modo real, `nucleo/lejos.js` y `disenos/a/lejos.js`, 9-oct-2026)

Solo en TaxiCun en modo real (diseño A). Quien decide es el servidor 0.11.0 (`docs/CONTRATO.md` §13):
`POST /api/cercania { lat, lng, precisionM? }` (con el token) → `{ lejos, km, umbralKm, exento, cooperativa }`, «lejos» a
más de 30 km de la zona (o del centro) de toda cooperativa real. La cuenta de revisión de las tiendas y las de prueba
responden `exento: true` (nunca hay aviso). Sin GPS, sin permiso, sin red o con un error de la ruta (un servidor
anterior, 404): no hay aviso ni se bloquea nada.

- Conductor: al «Enviar registro» de «Tu taxi» por primera vez, una lectura del GPS (sin precisión, tope 15 s) y
  `/api/cercania`. Lejos → «Todavía no hay una cooperativa de TaxiCun cerca de ti» (con los km y el municipio de la
  cooperativa más cercana) con «Quiero TaxiCun en mi cooperativa» (formulario de interesados), «Ver cómo funciona» (la
  demo: `urlApp(rol, { real: '0' })` en otra pestaña; en la app nativa, el navegador de adentro) y «Sí soy de
  <cooperativa>, continuar» (manda el registro con lo que ya escribió). El registro lleva `ubicacion: { lat, lng,
  precisionM }` (4 decimales) si `/api/cercania` respondió y no es exento, haya habido aviso o no: el servidor guarda a
  cuántos km se hizo y el panel dice «Se registró a N km».
- Pasajero: con la sesión lista y la bienvenida de la central (sin `revision`), si `miPosicion` es del GPS de verdad (no
  el punto de la ficha ni el del modo revisor), una consulta a `/api/cercania` por sesión (si falla, otra al minuto). Lejos
  → el diálogo «Todavía no llegamos a tu zona» con «Avísame cuando llegue» (el mismo formulario, rol pasajero), «Ver cómo
  funciona» y «Ahora no». «Ahora no» lo guarda un día y el envío 30 (`localStorage` `taxicun.lejos.pasajero`).
- Formulario: municipio (60), cooperativa (80; opcional para el pasajero), nombre (80, sin dígitos ni @), celular (3 + 9
  dígitos), sin enlaces, y la casilla con el texto de la autorización TAL CUAL (`N.lejos.AUTORIZACION`, versión 1.0).
  `POST /api/interesados { rol, nombre, celular, municipio, cooperativa?, distanciaKm?, plataforma, autorizo: true,
  version: '1.0', tiempoMs, sitioWeb? }` (esquema cerrado: `N.lejos.cuerpoInteresado`) → siempre `{ ok }`. El servidor
  descarta sin decirlo un envío a menos de 3 s de abrir el formulario o con el campo escondido `sitioWeb` lleno: la app
  nunca manda antes de `N.lejos.ESPERA_MINIMA_MS` (3,2 s; si la persona fue más rápida, espera con el botón ocupado). Sin la
  ruta (404) o sin red: «No pudimos enviar tus datos ahora.» con info@taxicun.com. Lo escrito se pinta con
  `textContent`.

Pruebas: `node pruebas/lejos-app.mjs http://localhost:5221/` (servidor simulado con `page.route`: lejos, cerca, sin GPS,
exento, servidor anterior, ruta inexistente, «Ahora no» y la demo de verdad). Contra el servidor de verdad, el recorrido
`pruebas/lejos-e2e.mjs` del servidor (apps y panel).

## Red

Sin servidor propio. Las pestañas del mismo navegador se hablan por
`BroadcastChannel`. Los celulares distintos, por relés MQTT públicos (varios a
la vez, ver `config.js`), dentro de una «sala» (`?sala=nombre`). Si nadie
acepta en unos segundos, entra un conductor simulado (`ajustes.simulacion = 'auto'`).
