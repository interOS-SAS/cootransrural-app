// Ronda A de «algoritmos» (servidor 0.14.0) en el núcleo, sin navegador: lo que la app lee de la central (nucleo/reparto.js:
// modo, rutas, cotización, llegada, la oferta con su motivo y el mensaje «fila», todo validado) y sus textos, y el cliente
// HTTP de las dos rutas nuevas (nucleo/servidor.js: forma del cuerpo, sesión, esperas de 4 s y 3 s, errores nuevos) con
// un fetch falso. Lo que hacen los controladores (pasajero y conductor) lo prueba pruebas/algoritmos-a-app.mjs.
// Uso: node pruebas/algoritmos-a-nucleo.mjs   (sale con 1 si algo falla)
globalThis.location = { origin: 'http://prueba.local', search: '', pathname: '/taxicun/' };
const almacen = new Map();
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k),
};
const R = await import('../nucleo/reparto.js');
const S = await import('../nucleo/servidor.js');

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const FIRMA = 'A'.repeat(43);
const FICHA = `c1.${'eyJlIjoiY29vdHJhbnNydXJhbCJ9'.padEnd(40, 'x')}.${FIRMA}`;

/* ---------------- modo y rutas ---------------- */
ok(R.leerModo({ modo: 'cercania' }) === 'cercania' && R.leerModo({ modo: 'turno' }) === 'turno' && R.leerModo({ modo: 'todos' }) === 'todos', 'modo: los tres valores');
ok(R.leerModo({}) === 'todos' && R.leerModo(null) === 'todos' && R.leerModo({ modo: 'TURNO' }) === 'todos' && R.leerModo({ modo: '<b>' }) === 'todos', 'modo: sin el campo o con otro valor → «todos» (lo de hoy)');
ok(JSON.stringify(R.leerRutas({ rutas: { cotizar: true, llegada: true } })) === '{"cotizar":true,"llegada":true}', 'rutas: { cotizar, llegada } de la bienvenida');
ok(R.leerRutas({}) === null && R.leerRutas({ rutas: null }) === null && R.leerRutas({ rutas: { cotizar: 'si' } }) === null, 'rutas: sin el campo (servidor 0.13.0 o sin llave) o con valores raros → null');
ok(R.leerRutas({ rutas: { cotizar: true, llegada: true }, revision: true }) === null, 'rutas: el modo revisor nunca (aunque llegara)');
ok(JSON.stringify(R.leerRutas({ rutas: { cotizar: false, llegada: true } })) === '{"cotizar":false,"llegada":true}', 'rutas: cada una por su lado');
ok(R.celda({ lat: 4.85251, lng: -74.26049 }) === '4.853,-74.260' && R.celda({ lat: 4.8529, lng: -74.2601 }) === R.celda({ lat: 4.8526, lng: -74.2604 }) && R.celda(null) === '', 'celda de ~110 m (3 decimales)');

/* ---------------- cotización ---------------- */
const ahora = 1_800_000_000_000;
const q0 = { cotizacion: FICHA, valor: 14500, tipo: 'estimada', km: 6.43, min: 14.4, fuente: 'ruta', vence: ahora + 15 * 60000, version: 3 };
const q = R.limpiarCotizacion(q0, ahora);
ok(q && q.cotizacion === FICHA && q.valor === 14500 && q.km === 6.4 && q.min === 14 && q.fuente === 'ruta' && q.tipo === 'estimada', 'cotización: la ficha, el valor, km (1 decimal) y min');
ok(q.venceLocal === ahora + 15 * 60000, 'cotización: vence a los 15 min con el reloj del teléfono');
ok(R.limpiarCotizacion({ ...q0, vence: ahora - 3600000 }, ahora).venceLocal === ahora + 15 * 60000 && R.limpiarCotizacion({ ...q0, vence: ahora + 5 * 3600000 }, ahora).venceLocal === ahora + 15 * 60000, 'cotización: con el reloj del servidor muy distinto, 15 min desde que llegó');
ok(R.limpiarCotizacion({ ...q0, cotizacion: 'c1.corta.x' }, ahora) === null && R.limpiarCotizacion({ ...q0, cotizacion: `c1.${'a'.repeat(30)}.${'B'.repeat(42)}` }, ahora) === null && R.limpiarCotizacion({ ...q0, cotizacion: `c2.${'a'.repeat(30)}.${FIRMA}` }, ahora) === null, 'cotización: una ficha con otra forma no sirve');
ok(R.limpiarCotizacion({ ...q0, valor: 0 }, ahora) === null && R.limpiarCotizacion({ ...q0, valor: '14500' }, ahora) === null && R.limpiarCotizacion({ ...q0, valor: 14500.5 }, ahora) === null && R.limpiarCotizacion({ ...q0, valor: 9e9 }, ahora) === null, 'cotización: valor que no es un entero positivo razonable → no sirve');
const rara = R.limpiarCotizacion({ ...q0, tipo: 'gratis', fuente: '<img>', km: -1, min: 'x' }, ahora);
ok(rara && rara.tipo === 'estimada' && rara.fuente === 'aproximada' && rara.km === null && rara.min === null, 'cotización: tipo/fuente desconocidos y km/min raros quedan en lo prudente');
ok(R.limpiarCotizacion(null) === null && R.limpiarCotizacion('c1.x') === null, 'cotización: nada o texto suelto → null');

/* ---------------- llegada ---------------- */
ok(R.limpiarLlegada({ min: 4 }) === 4 && R.limpiarLlegada({ min: 4.2 }) === 5 && R.limpiarLlegada({ min: 0 }) === 1, 'llegada: minutos enteros hacia arriba, mínimo 1');
ok(R.limpiarLlegada({ min: 45 }) === 30 && R.limpiarLlegada({ min: null }) === null && R.limpiarLlegada({ min: '4' }) === null && R.limpiarLlegada({}) === null && R.limpiarLlegada({ min: -2 }) === null, 'llegada: más de 30 → 30; sin taxis (null) o raro → null');
ok(R.textoLlegada(4) === 'El taxi más cercano llega en ~4 min' && R.textoLlegada(30) === 'El taxi más cercano está a más de 30 min' && R.textoLlegada(null) === null, 'llegada: textos del inicio');
ok(R.textoPin(4) === 'Taxi a ~4 min' && R.textoPin(30) === 'Taxi a más de 30 min' && R.textoPin(undefined) === null, 'llegada: textos del pin');

/* ---------------- chip del precio y diálogo ---------------- */
const km = (x) => `${String(x).replace('.', ',')} km`;
ok(R.chipCotizacion({ cotizacion: FICHA, tipo: 'estimada', fuenteRuta: 'ruta', kmRuta: 6.4 }, km) === 'Valor por la ruta en calles · 6,4 km', 'chip: «Valor por la ruta en calles · {km}»');
ok(R.chipCotizacion({ cotizacion: FICHA, tipo: 'estimada', fuenteRuta: 'aproximada', kmRuta: 6.4 }, km) === 'Valor aproximado', 'chip: «Valor aproximado» con la aproximación del servidor');
ok(R.chipCotizacion({ cotizacion: FICHA, tipo: 'oficial', fuenteRuta: 'tabla' }, km) === null && R.chipCotizacion({ tipo: 'estimada' }, km) === null && R.chipCotizacion({ cotizacion: FICHA, tipo: 'fijada', fuenteRuta: 'ruta' }, km) === null, 'chip: tabla oficial, fijada o sin cotización → el chip de hoy');
const pc = R.textosPrecioCambio('$12.000', '$13.500');
ok(pc.titulo === 'El precio de tu viaje cambió' && pc.texto === 'Ahora es $13.500 (antes $12.000). ¿Pides el taxi por $13.500?' && pc.pedir === 'Pedir por $13.500' && pc.cambiar === 'Cambiar el viaje', 'diálogo del precio cambiado: título, texto y botones');

/* ---------------- la oferta (central → conductor) ---------------- */
const fila = R.limpiarOferta({ motivo: 'fila', llegadaMin: 2, fila: { paraderoId: 'paradero', paradero: 'Paradero de taxis (Cra. 9)', alRechazar: 'al_final' } });
ok(fila.motivo === 'fila' && fila.llegadaMin === 2 && fila.fila.paradero === 'Paradero de taxis (Cra. 9)' && fila.fila.alRechazar === 'al_final' && !fila.equidad, 'oferta: la de la fila con su paradero');
const malos = R.limpiarOferta({ motivo: 'primero', llegadaMin: 700, equidad: true, fila: { paradero: 'x' } });
ok(Object.keys(malos).length === 0, `oferta: motivo desconocido, llegadaMin fuera de 0–600 y equidad sin motivo se descartan (${JSON.stringify(malos)})`);
const xss = R.limpiarOferta({ motivo: 'fila', fila: { paraderoId: '../x', paradero: `<img src=x onerror=alert(1)>\u0007${'p'.repeat(200)}`, alRechazar: 'otro' } });
ok(xss.fila.paraderoId === '' && xss.fila.paradero.startsWith('<img src=x onerror=alert(1)> ') && xss.fila.paradero.length === 80 && xss.fila.alRechazar === 'al_final', 'oferta: el nombre del paradero queda como texto (sin controles, 80 como mucho); id raro fuera');
ok(R.limpiarOferta({ motivo: 'cercano', llegadaMin: 3.2, equidad: true }).llegadaMin === 4 && R.limpiarOferta({ motivo: 'cercano', equidad: true }).equidad === true && !R.limpiarOferta({ motivo: 'ola', fila: { paradero: 'x' } }).fila, 'oferta: minutos hacia arriba, equidad con motivo, fila solo con motivo fila');
ok(Object.keys(R.limpiarOferta({ viajeId: 'v1', tarifa: 8000 })).length === 0 && Object.keys(R.limpiarOferta(null)).length === 0, 'oferta: la de hoy (modo «todos», sin campos nuevos) no trae nada');

/* ---------------- textos de la tarjeta ---------------- */
const tf = R.textosOferta({ motivo: 'fila', llegadaMin: 2, fila: { paradero: 'Paradero de taxis', alRechazar: 'al_final' } });
ok(tf.etiqueta === 'Turno de paradero' && tf.detalle === 'Eres el primero de la fila en Paradero de taxis' && tf.nota === 'Si lo rechazas o no respondes, pasas al final de la fila.', 'tarjeta: fila con la nota «al final»');
ok(R.textosOferta({ motivo: 'fila', fila: { paradero: 'P', alRechazar: 'conserva' } }).nota === 'Si no respondes, pasas al final de la fila.', 'tarjeta: fila con la nota «conserva»');
ok(R.textosOferta({ motivo: 'fila', fila: {} }).detalle === 'Eres el primero de la fila en el paradero', 'tarjeta: sin nombre, «el paradero»');
ok(R.textosOferta({ motivo: 'cercano', llegadaMin: 3 }).etiqueta === 'Eres el más cercano · llegas en ~3 min' && R.textosOferta({ motivo: 'cercano' }).etiqueta === 'Eres el más cercano', 'tarjeta: «Eres el más cercano» con y sin minutos');
const to = R.textosOferta({ motivo: 'ola', llegadaMin: 6, equidad: true });
ok(to.etiqueta === 'Estás entre los más cercanos · llegas en ~6 min' && to.equidad === 'Llevas más tiempo sin servicio', 'tarjeta: ola con equidad');
const tc = R.textosOferta({ motivo: 'cercano', llegadaMin: 2, equidad: true });
ok(tc.etiqueta === 'Estás entre los más cercanos · llegas en ~2 min' && tc.equidad === 'Llevas más tiempo sin servicio', `tarjeta: el primero por equidad no dice «Eres el más cercano» (hay otro más cerca) (${tc.etiqueta})`);
ok(R.textosOferta({ viajeId: 'v1' }) === null && R.textosOferta({ motivo: 'x' }) === null, 'tarjeta: sin motivo, la de hoy');

/* ---------------- la fila ---------------- */
const f1 = R.limpiarFila({ enFila: true, paraderoId: 'paradero', paradero: 'Paradero de taxis', puesto: 2, motivo: 'entro' }, 5);
ok(f1 && f1.enFila && f1.puesto === 2 && f1.motivo === 'entro' && f1.en === 5, 'fila: en la fila con su puesto');
ok(R.limpiarFila({ enFila: true, puesto: 0 }) === null && R.limpiarFila({ enFila: true, puesto: 2.5 }) === null && R.limpiarFila({ enFila: 'si', puesto: 1 }) === null && R.limpiarFila(null) === null, 'fila: puesto raro o enFila que no es booleano → nada');
ok(R.limpiarFila({ enFila: true, puesto: 1, motivo: 'raro' }).motivo === null && R.limpiarFila({ enFila: false, motivo: 'raro' }).motivo === 'salio' && R.limpiarFila({ enFila: false, motivo: 'modo' }).motivo === 'modo', 'fila: motivos desconocidos (dentro: ninguno; fuera: «salio»)');
ok(R.textoChipFila({ enFila: true, puesto: 1, paradero: 'Paradero de taxis' }) === 'Eres el primero en la fila de Paradero de taxis' && R.textoChipFila({ enFila: true, puesto: 3, paradero: 'Terminal' }) === 'Vas 3.º en la fila de Terminal' && R.textoChipFila(null) === null, 'fila: chip del puesto');
const av = (d) => R.avisoFila(R.limpiarFila(d), 'Cootransrural');
ok(av({ enFila: true, puesto: 2, paradero: 'P', motivo: 'entro' })?.titulo === 'Entraste a la fila' && av({ enFila: true, puesto: 2, paradero: 'P', motivo: 'entro' }).cuerpo === 'P: vas 2.º.', 'aviso: entrar');
ok(av({ enFila: true, puesto: 5, paradero: 'P', motivo: 'rechazo' })?.cuerpo === 'P: ahora vas 5.º.' && av({ enFila: true, puesto: 5, paradero: 'P', motivo: 'sin_respuesta' })?.titulo === 'Pasaste al final de la fila', 'aviso: al final (rechazo y sin respuesta)');
ok(av({ enFila: true, puesto: 1, paradero: 'P' }) === null, 'aviso: subir de puesto no avisa (solo cambia el chip)');
ok(av({ enFila: false, paradero: 'P', motivo: 'salio' })?.cuerpo === 'Te alejaste del paradero P.' && av({ enFila: false, motivo: 'sin_senal' })?.cuerpo === 'No recibimos tu ubicación por unos minutos.', 'aviso: salir (alejarse y sin señal)');
ok(av({ enFila: false, motivo: 'modo' })?.titulo === 'La fila del paradero se apagó' && av({ enFila: false, motivo: 'modo' }).cuerpo === 'Cootransrural cambió cómo reparte los pedidos.', 'aviso: la cooperativa cambió el modo');
ok(['servicio', 'fuera_de_turno', 'sacado'].every((m) => av({ enFila: false, motivo: m }) === null), 'aviso: servicio, fuera de turno y sacado no avisan (ya hay otra pantalla)');

/* ---------------- cliente HTTP ---------------- */
const pedidas = [];
let respuesta = () => ({ status: 200, body: {} });
globalThis.fetch = (url, op) => {
  pedidas.push({ url: String(url), op, cuerpo: op.body ? JSON.parse(op.body) : null, inicio: Date.now() });
  const r = respuesta(url, op);
  if (r === 'colgar') {
    return new Promise((_, rechazar) => op.signal.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError'))));
  }
  return Promise.resolve({ status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body });
};
localStorage.setItem('taxicun.token', 'tok-1');
respuesta = () => ({ status: 200, body: q0 });
const c = await S.cotizar('cootransrural', { lat: 4.85, lng: -74.26, titulo: 'Casa', detalle: 'x' }, { lat: 4.87, lng: -74.2, titulo: 'Madrid', idTarifa: 'madrid-centro' });
const p0 = pedidas.at(-1);
ok(p0.url === 'http://prueba.local/api/viajes/cotizacion' && p0.op.method === 'POST' && p0.op.headers.Authorization === 'Bearer tok-1', 'cotizar: POST /api/viajes/cotizacion con la sesión');
ok(JSON.stringify(p0.cuerpo) === JSON.stringify({ empresa: 'cootransrural', origen: { lat: 4.85, lng: -74.26 }, destino: { lat: 4.87, lng: -74.2, idTarifa: 'madrid-centro' } }), `cotizar: solo puntos (sin títulos ni direcciones) y el idTarifa del destino (${JSON.stringify(p0.cuerpo)})`);
ok(c.valor === 14500, 'cotizar: devuelve lo del servidor');
await S.cotizar('cootransrural', { lat: 4.85, lng: -74.26 }, null);
ok(pedidas.at(-1).cuerpo.destino === null, 'cotizar: sin destino → destino null');
respuesta = () => ({ status: 200, body: { min: 4, fuente: 'ruta' } });
await S.llegada('cootransrural', { lat: 4.85, lng: -74.26, precision: 12 });
ok(pedidas.at(-1).url === 'http://prueba.local/api/viajes/llegada' && JSON.stringify(pedidas.at(-1).cuerpo) === JSON.stringify({ empresa: 'cootransrural', origen: { lat: 4.85, lng: -74.26 } }), 'llegada: POST /api/viajes/llegada con empresa y origen');
const error = async (fn) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e;
  }
};
for (const [estado, codigo] of [[503, 'sin_tarifas'], [422, 'fuera_de_zona'], [429, 'demasiados_intentos'], [403, 'empresa_no_disponible']]) {
  respuesta = () => ({ status: estado, body: { error: codigo, retryS: 30 } });
  const e = await error(() => S.cotizar('cootransrural', { lat: 4.85, lng: -74.26 }, null));
  ok(e?.codigo === codigo && e.estado === estado && (codigo !== 'demasiados_intentos' || e.retryS === 30), `cotizar: ${estado} → ${codigo}`);
}
respuesta = () => ({ status: 404, body: { message: 'Route POST:/api/viajes/cotizacion not found', error: 'Not Found', statusCode: 404 } });
const e404 = await error(() => S.cotizar('cootransrural', { lat: 4.85, lng: -74.26 }, null));
ok(e404?.estado === 404 && S.rutaNoDisponible(e404), 'cotizar: un servidor anterior (404 de Fastify) → ruta no disponible (la app sigue como hoy)');
ok(localStorage.getItem('taxicun.token') === 'tok-1', 'cotizar: los errores no cierran la sesión');
respuesta = () => 'colgar';
let t = Date.now();
const eTiempo = await error(() => S.cotizar('cootransrural', { lat: 4.85, lng: -74.26 }, null));
const dc = Date.now() - t;
ok(eTiempo?.codigo === 'sin_red' && dc >= 3900 && dc < 5500, `cotizar: espera 4 s como mucho (${dc} ms)`);
t = Date.now();
const eTiempo2 = await error(() => S.llegada('cootransrural', { lat: 4.85, lng: -74.26 }));
const dl = Date.now() - t;
ok(eTiempo2?.codigo === 'sin_red' && dl >= 2900 && dl < 4500, `llegada: espera 3 s como mucho (${dl} ms)`);
ok(S.textoError('cotizacion_vencida') === 'El precio de tu viaje cambió.' && S.textoError('sin_tarifas') === S.textoError('tarifa_invalida'), 'textos de error nuevos: cotizacion_vencida y sin_tarifas');

console.log(`\n${fallas ? 'FALLÓ' : 'PASÓ'}: ${bien} ✔, ${fallas} ✘`);
process.exit(fallas ? 1 : 0);
