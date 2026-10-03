# TaxiCun · app de taxis para Cundinamarca (demo) · desarrollada por interOS

**TaxiCun** es la app (marca única, amarillo taxi y azul); **interOS** es quien
la desarrolla. Es una sola app para varias cooperativas de taxis de
Cundinamarca: por el enlace del sticker (`?e=<id>`), por la elección guardada o
por GPS escoge la cooperativa del municipio y la muestra con su nombre, sus
colores y el diseño que ella eligió («TaxiCun · Coptaxi»). Incluye app del
pasajero y del conductor (3 diseños), web de cada cooperativa, stickers QR,
propuestas comerciales y pago QR Bre-B **de prueba**.

**Sitio:** https://taxicun.com/ (página de TaxiCun; antes https://interos-sas.github.io/cootransrural-app/, que redirige aquí)
**TaxiCun:** https://taxicun.com/taxicun/ (conductores: `taxicun/conductor/`)
**Todas las cooperativas:** https://taxicun.com/cooperativas/ · Cootransrural: https://taxicun.com/el-rosal/

Dónde dice TaxiCun: la web de cada cooperativa («Pide tu taxi con TaxiCun»; los
botones «Pedir taxi», «Descargar TaxiCun» y los de conductores abren
`taxicun/?e=<id>` y `taxicun/conductor/?e=<id>`), la página de descarga (destino
del QR de los stickers: «Abrir TaxiCun» con el móvil escaneado; la instalación se
hace desde `taxicun/`, que tiene el manifiesto), los stickers («Pide tu taxi con
TaxiCun» con el ícono de TaxiCun y el nombre de la cooperativa; el QR sigue
llevando a `<id>/descargar/?movil=…`), las propuestas («Propuesta: TaxiCun para
…», desarrollada por interOS), la vitrina, la privacidad (responsable: la
cooperativa; encargado: interOS) y `cooperativas/`. El logotipo se arma con
`img/taxicun/icono.svg` y el nombre escrito con la letra Sora de la página
(`logo.svg` como imagen no puede cargar la fuente).

| Cooperativa | Pueblo | Estado | Ruta |
| --- | --- | --- | --- |
| Cootransrural | El Rosal | cliente | `./` (raíz) |
| Coopmultrasub | Subachoque | cliente | `subachoque/` |
| Cooptranstermales | Tabio | propuesta | `tabio/` |
| Cootranstenjo | Tenjo | propuesta | `tenjo/` |
| Cootransmadrid | Madrid | propuesta | `madrid/` |
| Cootransvi | Villeta | propuesta | `villeta/` |
| Cootransvillaleal | La Vega | propuesta | `la-vega/` |
| Coptaxi (S.A.S.) | Facatativá | propuesta | `facatativa/` |

Las «propuestas» muestran una franja de demostración, no se indexan en
buscadores y no usan logos de la cooperativa: aún no son clientes.

## Varias cooperativas

- **Ficha:** `empresas/<id>/ficha.json` tiene todo lo propio de cada cooperativa:
  nombre, teléfonos, colores, lugares del pueblo, rutas, tarifas de ejemplo,
  textos y datos pendientes por confirmar. Si no es una cooperativa (por ejemplo
  una S.A.S.), `EMPRESA.tipo: "empresa"` hace que la web y la app digan «la
  empresa» y «afiliados» en vez de «la cooperativa» y «asociados». Las tarifas
  que sean oficiales se explican en `TARIFAS.nota` (sale en la web en vez de
  «Valores de ejemplo…»), y el horario nocturno sale de `nocheDesde`/`nocheHasta`.
- **Tarifas oficiales (Cootransrural):** `TARIFAS.ejemplo: false` con `TARIFAS.fuente`
  (Decreto 05 de 2026 de la Alcaldía de El Rosal, con enlace) y la tabla
  `DESTINOS_TARIFA`: los 191 destinos «De El Rosal Centro a…» en 10 zonas, con
  `lat`/`lng` y `precision` (exacta, aproximada, vereda o sin_ubicar; los sin ubicar
  quedan en la tabla aunque no estén en el mapa). El núcleo cobra el precio oficial si
  el destino es de la tabla (elegido de la lista, mismo nombre o a pocos metros), la
  mínima de $6.100 dentro del casco urbano (`CASCO_URBANO`, límite de OSM) y, si no,
  una estimación (`banderazo` y `porKm` estimados, en `TARIFAS.estimados`); si la
  recogida no está en el casco urbano, también estima y lo dice. Las `RUTAS` a otros
  municipios son precio de referencia (`TARIFAS.rutasReferencia`). El decreto no fija
  recargos: van en 0 con `TARIFAS.notaRecargos`. `PARADERO` (Decreto 89 de 2026, Cra. 9
  junto al salón cultural) es la recogida que se propone sin GPS; el parque principal
  lleva `noRecoger` (sigue como destino). Las demás cooperativas no cambian.
- **Nueva cooperativa:** agregarla a `herramientas/cooperativas.json` y correr
  `python3 herramientas/crear-ficha.py <id>`. El script saca de OpenStreetMap el
  centro del pueblo y sus lugares, y de OSRM la distancia por carretera a los
  municipios vecinos. Después hay que revisar la ficha y completar los textos.
- **Páginas:** salen de `plantillas/` con `python3 herramientas/generar-empresas.py`.
  Cootransrural queda en la raíz y las demás en `<id>/`. Íconos y capturas de
  cada cooperativa: `node herramientas/iconos-empresas.mjs`.
- **Núcleo:** cada página fija la cooperativa con `window.CT_EMPRESA`, y el
  núcleo carga su ficha. El almacenamiento del celular, los canales en vivo, los
  enlaces de descarga y el pago van separados por cooperativa.

| Página | Para qué |
| --- | --- |
| `./` | Web renovada de la cooperativa |
| `app/` | App del pasajero propia de la cooperativa (la usa la vitrina; `?d=a`, `?d=b` o `?d=c`). La web ya lleva a TaxiCun |
| `conductor/` | App del conductor (demo: móvil 023, PIN 1234) |
| `disenos/` | Vitrina para comparar los 3 diseños lado a lado |
| `stickers/` | Stickers QR imprimibles (taxi, nevera, afiche, tarjeta) |
| `descargar/` | «Descarga TaxiCun»: página a la que lleva el QR de los stickers (abre `taxicun/?e=<id>&movil=…`) |
| `pagar/` | Pago con QR **de prueba** (no mueve dinero) |
| `propuesta/` | Propuesta comercial de TaxiCun, desarrollada por interOS (6 hojas carta; 7 con el anexo de Coptaxi; imprimible; no se indexa) |
| `taxicun/` | La app TaxiCun (raíz del sitio): escoge la cooperativa por `?e=`, la elección guardada o el GPS |
| `cooperativas/` | Portada de TaxiCun con todas las cooperativas (raíz del sitio) |

## Los 3 diseños

- **A · Ámbar Urbano**: moderno, mapa a pantalla completa, hoja inferior, amarillo taxi.
- **B · Verde Rosal**: los colores del escudo de la cooperativa, letra grande y pedido por pasos (pensado para todas las edades).
- **C · Noche Neón**: oscuro, efecto vidrio y neón, el más llamativo.

Los tres usan el mismo núcleo (`nucleo/`), así que hacen lo mismo y solo cambia
cómo se ven.

## Qué hace

Pasajero: registro, ubicación por GPS (o moviendo el mapa), destino por búsqueda,
lugares frecuentes de El Rosal o el mapa, tarifa estimada, pago QR o efectivo,
viaje programado (−10 % con 24 h) y tarjeta de fidelidad (cada 10 viajes, el
siguiente al 50 %).

Durante el servicio recibe avisos cuando el conductor toma el servicio, cuando
está llegando, cuando está en la puerta, cuando inicia y cuando termina el viaje.
Ve los datos del conductor, el móvil y la placa. Tiene un código de abordaje de
4 dígitos, puede compartir el viaje por WhatsApp y tiene botón SOS (123). Al
final paga y califica.

Conductor: conectarse o desconectarse, recibir solicitudes con cuenta regresiva,
navegar con Google Maps o Waze, avisar «Llegué», verificar el código del
pasajero, terminar el viaje, cobrar con QR o en efectivo, calificar al pasajero,
ver ganancias del día, historial y documentos del vehículo.

## Cómo probar

1. **Con un solo celular:** abre `app/` y pide un taxi. Si no hay conductores
   conectados, a los pocos segundos acepta un **conductor de prueba** que hace
   todo el recorrido. En `conductor/` usa «Simular solicitud».
2. **Con dos celulares (en vivo):** uno abre `conductor/` y se conecta; el otro
   pide desde `app/`. Usen la misma sala (por defecto `demo`; con `?sala=nombre`
   se separan las pruebas). Los mensajes viajan por relés MQTT públicos, así que
   en esta demo **no se deben poner datos reales sensibles**.
3. **Pago QR de prueba:** al terminar el viaje el conductor muestra un QR. El
   pasajero lo escanea desde la app o con la cámara del celular, lo que abre
   `pagar/`. No se mueve dinero.

## Antes de salir a producción

- **Tarifas:** las de `nucleo/datos.js` son de EJEMPLO. Hay que poner las oficiales.
- **Dominio:** los stickers llevan en el QR la dirección de esta página de
  pruebas. Antes de imprimirlos en serie conviene un dominio fijo, por ejemplo
  `app.cootransrural.com` apuntando a GitHub Pages. El generador permite
  cambiar la URL.
- **Servidor propio:** para usuarios reales hace falta un backend con registro
  verificado por SMS, despacho, historial central y notificaciones push. Hoy
  todo vive en el celular y en relés públicos.
- **Pagos reales:** integrar un proveedor con QR interoperable Bre-B (por
  ejemplo PayU, Bold, Mono o Cobre).
- **Tiendas:** publicar en Google Play y App Store, empaquetando esta misma
  app web (por ejemplo con Capacitor).

## Desarrollo

Antes de cada commit: `python3 herramientas/generar-empresas.py && python3 herramientas/versionar.py` (pone `?v=` a los CSS
y JS para que el navegador no muestre una versión vieja; GitHub Pages guarda los
archivos 10 minutos).

Sitio estático, sin compilación: `python3 -m http.server 8765` y abrir
http://localhost:8765/. Pruebas automáticas con Chromium (playwright-core):

```
node pruebas/probar-nucleo.mjs http://localhost:8765/
node pruebas/diseno-a.mjs http://localhost:8765/ --empresa=subachoque   # y b, c; sin --empresa = Cootransrural
node pruebas/taxicun.mjs http://localhost:8765/                         # TaxiCun de punta a punta: sticker, GPS, viaje, cambiar de municipio, web
node pruebas/web.mjs http://localhost:8765/
node pruebas/web-empresas.mjs http://localhost:8765/                     # todas las cooperativas
node pruebas/stickers.mjs http://localhost:8765/
node pruebas/stickers-empresas.mjs http://localhost:8765/
node herramientas/propuestas-pdf.mjs http://localhost:8765/ --copiar     # PDF de cada propuesta en /tmp/cootrans/propuestas/<id>/ y copia en <id>/propuesta/
node pruebas/propuestas.mjs http://localhost:8765/                       # propuestas web y PDF (datos, precios, QR)
```

Modo real (`?real=1`) de punta a punta contra el servidor de TaxiCun en local
(repo taxicun-servidor, base aparte `taxicun_e2e`; los comandos completos están
al comienzo de `pruebas/real-e2e.mjs`):

```
node src/index.js                                   # en taxicun-servidor, con DATABASE_URL, CLAVE_SERVIDOR, CUENTAS_PRUEBA… y PUERTO=3199
node pruebas/servidor-local.mjs --puerto=8799 --api=http://127.0.0.1:3199   # sitio + /api (y el WebSocket) en el mismo origen
node pruebas/real-e2e.mjs http://localhost:8799/    # pasajero y conductor: registro, viaje, recargas, cancelaciones y eliminar cuenta
```

Reglas del despacho (las edita el gerente en el panel y llegan en la bienvenida del bus; ver
`nucleo/README.md`): `node pruebas/reglas-despacho.mjs http://localhost:8765/` con el servidor simulado
(oferta que dura lo que diga la cooperativa, «Llegué» a sus metros, `oferta_vista` y `rechazo` del conductor,
«No hay taxis…» con «Llamar a la central» para el pasajero) y `node pruebas/reglas-despacho-e2e.mjs
http://localhost:8799/` contra el servidor de la rama reglas-despacho (con dos conductores y la pausa tras
cancelar). Con esa central, `pruebas/push-e2e-v12.mjs` revisa además que la oferta vista o rechazada en pantalla no
se repita por push al minimizar (parte 6; con centrales anteriores se omite).

Librerías incluidas en `vendor/`: Leaflet (BSD-2), MQTT.js (MIT),
qrcode-generator (MIT) y jsQR (Apache-2.0). Mapas © OpenStreetMap y CARTO.
