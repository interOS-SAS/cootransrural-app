# Cootransrural — App de taxis (demo)

Demo de la app de taxis de **Cootransrural** (Cooperativa de Transportadores
Rurales de El Rosal, Cundinamarca): app del pasajero, app del conductor, web
renovada y generador de stickers QR para los taxis.

**Sitio de pruebas:** https://interos-sas.github.io/cootransrural-app/

| Página | Para qué |
| --- | --- |
| `./` | Web renovada de la cooperativa |
| `app/` | App del pasajero (`?d=a`, `?d=b` o `?d=c` para elegir el diseño) |
| `conductor/` | App del conductor (demo: móvil 023, PIN 1234) |
| `disenos/` | Vitrina para comparar los 3 diseños lado a lado |
| `stickers/` | Stickers QR imprimibles (taxi, nevera, afiche, tarjeta) |
| `descargar/` | Página a la que lleva el QR de los stickers |
| `pagar/` | Pago con QR **de prueba** (no mueve dinero) |

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

Antes de cada commit: `python3 herramientas/versionar.py` (pone `?v=` a los CSS
y JS para que el navegador no muestre una versión vieja; GitHub Pages guarda los
archivos 10 minutos).

Sitio estático, sin compilación: `python3 -m http.server 8765` y abrir
http://localhost:8765/. Pruebas automáticas con Chromium (playwright-core):

```
node pruebas/probar-nucleo.mjs http://localhost:8765/
node pruebas/diseno-a.mjs http://localhost:8765/   # y b, c
node pruebas/web.mjs http://localhost:8765/
node pruebas/stickers.mjs http://localhost:8765/
```

Librerías incluidas en `vendor/`: Leaflet (BSD-2), MQTT.js (MIT),
qrcode-generator (MIT) y jsQR (Apache-2.0). Mapas © OpenStreetMap y CARTO.
