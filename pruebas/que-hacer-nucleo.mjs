// «¿Qué hacer?» (nucleo/que-hacer.js), sin navegador, con la forma del contrato del servidor 0.13.0 (§16.2): validación de
// lo que manda la API pública, fotos solo del mismo origen y con crédito, planes con todas sus paradas, la consulta (2
// decimales), el municipio de la cooperativa, el orden por distancia y el cliente (caché, servidor anterior, sin red).
// Uso: node pruebas/que-hacer-nucleo.mjs   (sale con 1 si algo falla)
import * as Q from '../nucleo/que-hacer.js';

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const API = 'https://taxicun.com/api/';
const credito = (extra = {}) => ({ texto: 'Foto: DnTrotaMundos ☮ · CC BY 3.0 · Wikimedia Commons', autor: 'DnTrotaMundos ☮', licencia: 'CC BY 3.0', licenciaUrl: 'https://creativecommons.org/licenses/by/3.0', pagina: 'https://commons.wikimedia.org/wiki/File:Iglesia.jpg', origen: 'commons', ...extra });
const foto = (extra = {}, cred = {}) => ({ url: '/api/que-hacer/fotos/f1.jpg', tipo: 'image/jpeg', ancho: 1280, alto: 720, credito: credito(cred), ...extra });
const sitio = (extra = {}) => ({ id: 'el-rosal-parque', nombre: 'Parque principal', municipio: { id: 'el-rosal', nombre: 'El Rosal' }, categoria: 'parque', resumen: 'La plaza del pueblo.', descripcion: 'El centro del pueblo.', lat: 4.8525, lng: -74.2605, precision: 'exacta', direccion: null, horario: null, entrada: 'gratis', valorEntrada: null, recomendaciones: null, fuentes: [], fotos: [foto()], actualizado: '2026-10-11T12:00:00Z', ...extra });

// Fotos
ok(Q.urlFoto('/api/que-hacer/fotos/a.jpg', API) === 'https://taxicun.com/api/que-hacer/fotos/a.jpg', 'foto del mismo origen bajo /api/que-hacer/');
ok(Q.urlFoto('https://upload.wikimedia.org/a.jpg', API) === '', 'una foto de Commons enlazada directo no pasa (la sirve TaxiCun)');
ok(Q.urlFoto('javascript:alert(1)', API) === '' && Q.urlFoto('data:image/png;base64,AA', API) === '', 'javascript: y data: no pasan');
ok(Q.urlFoto('/api/yo', API) === '' && Q.urlFoto('/otra/a.jpg', API) === '' && Q.urlFoto('//evil.test/api/que-hacer/a.jpg', API) === '', 'otras rutas del sitio y otros dominios no pasan');
const f0 = Q.normalizarFoto(foto(), API);
ok(f0 && Q.textoCredito(f0) === 'Foto: DnTrotaMundos ☮ · CC BY 3.0 · Wikimedia Commons' && f0.pagina && f0.licenciaUrl, 'el crédito del servidor (credito.texto) tal cual, con sus enlaces');
ok(Q.normalizarFoto(foto({}, { texto: '', autor: '', origen: 'commons' }), API) === null, 'sin texto ni autor: la foto no sale (crédito obligatorio)');
const deInteros = Q.normalizarFoto(foto({}, { texto: '', autor: '', licencia: '', origen: 'interos' }), API);
ok(deInteros && Q.textoCredito(deInteros) === 'Foto: interOS', 'foto de interOS sin texto: «Foto: interOS»');
const armado = Q.normalizarFoto(foto({}, { texto: '' }), API);
ok(armado && Q.textoCredito(armado) === 'Foto: DnTrotaMundos ☮ · CC BY 3.0', 'sin texto pero con autor: se arma «Foto: autor · licencia»');
const f = Q.normalizarFoto(foto({}, { licenciaUrl: 'javascript:alert(1)', pagina: 'https://evil.test/x' }), API);
ok(f && f.licenciaUrl === '' && f.pagina === '', 'enlaces del crédito solo de Commons o Creative Commons');
ok(Q.normalizarFoto({ id: 'x', url: '/api/que-hacer/fotos/x.jpg', autor: 'Ana', licencia: 'CC0' }, API)?.texto === 'Foto: Ana · CC0', 'también la forma plana (autor/licencia sueltos)');

// Sitios
const s = Q.normalizarSitio(sitio({ nombre: '  <b>Parque</b>‮  principal ', categoria: 'rara', entrada: 'con_costo', valorEntrada: 5000, precision: 'aproximada' }), API);
ok(s && s.nombre === '<b>Parque</b> principal' && s.categoria === 'otro', 'textos planos (sin controles) y categoría desconocida → «otro»');
ok(s.municipio === 'El Rosal' && s.municipioId === 'el-rosal' && s.aproximado === true, 'municipio { id, nombre } y la precisión aproximada');
ok(Q.textoEntrada(s, (v) => `$${v}`) === 'Entrada: $5000' && Q.textoEntrada({ entrada: 'con_costo', valorEntrada: null }) === 'Entrada con costo', 'entrada con costo, con y sin valor');
ok(Q.textoEntrada({ entrada: 'gratis' }) === 'Entrada gratis' && Q.textoEntrada({ entrada: 'desconocido' }) === 'Entrada: consulta antes de ir', 'entrada gratis y desconocida');
const lineas = Q.normalizarSitio(sitio({ horario: 'Sábados: 8 a 4\nDomingos:\t9 a 5\n\n\n\nFestivos cerrado', recomendaciones: 'Uno\r\nDos' }), API);
ok(lineas.horario === 'Sábados: 8 a 4\nDomingos: 9 a 5\n\nFestivos cerrado' && lineas.recomendaciones === 'Uno\nDos', 'horario y recomendaciones conservan los saltos de línea');
const fu = Q.normalizarSitio(sitio({ fuentes: [{ titulo: 'Alcaldía', url: 'https://elrosal-cundinamarca.gov.co/x' }, { titulo: 'Viejo', url: 'http://ejemplo.test' }, { titulo: 'Malo', url: 'javascript:alert(1)' }, { titulo: '', url: 'https://x.test' }] }), API).fuentes;
ok(fu.length === 3 && fu[0].url === 'https://elrosal-cundinamarca.gov.co/x' && fu[1].url === '' && fu[2].url === '', 'fuentes: el título siempre, el enlace solo https');
ok(Q.normalizarSitio(sitio({ id: '../x' }), API) === null && Q.normalizarSitio(sitio({ lat: 'a' }), API) === null && Q.normalizarSitio(sitio({ lat: 40 }), API) === null, 'id raro, coordenadas que no son número o fuera de Colombia: fuera');

// Planes
const parada = (orden, id) => ({ orden, sitio: sitio({ id }) });
const pl = Q.normalizarPlan({ id: 'plan-1', titulo: 'Mañana', duracion: 'medio día', municipios: [{ id: 'el-rosal', nombre: 'El Rosal' }], paradas: [parada(2, 'b-2'), parada(1, 'a-1'), parada(3, 'c-3')] }, API);
ok(pl && pl.paradas.map((x) => x.id).join() === 'a-1,b-2,c-3' && pl.municipios.join() === 'El Rosal', 'paradas en el orden del plan y municipios por nombre');
ok(Q.normalizarPlan({ id: 'plan-2', titulo: 'Corto', paradas: [parada(1, 'a-1')] }, API) === null, 'un plan con menos de 2 paradas no sale');
ok(Q.normalizarPlan({ id: 'plan-3', titulo: 'Roto', paradas: [parada(1, 'a-1'), { orden: 2, sitio: { id: 'x' } }] }, API) === null, 'un plan con una parada dañada no sale');

// Consulta y orden
ok(Q.consulta({ cerca: { lat: 4.852512, lng: -74.2649 } }) === 'lat=4.85&lng=-74.26&radioKm=20', 'cerca con 2 decimales (la posición no viaja exacta) y radio 20');
ok(Q.consulta({ municipio: 'el-rosal' }) === 'municipio=el-rosal' && Q.consulta({ municipio: 'El Rosal' }) === '' && Q.idMunicipio('Facatativá') === 'facatativa', 'por municipio solo con un id');
const orden = Q.ordenarPorDistancia([{ id: 'lejos', lat: 4.9, lng: -74.3 }, { id: 'cerca', lat: 4.853, lng: -74.26 }], { lat: 4.8525, lng: -74.2605 });
ok(orden[0].id === 'cerca' && orden[0].km < orden[1].km, 'ordena por distancia y pone los km');

// Cliente
const llamadas = [];
let modo = 'ok';
const pedir = async (url, op) => {
  llamadas.push({ url, op });
  if (modo === 'red') throw new TypeError('sin red');
  if (modo === '404') return { status: 404, ok: false, json: async () => ({ error: 'no_existe' }) };
  let datos;
  if (url.includes('/municipios')) datos = { version: 1, municipios: [{ id: 'el-rosal', nombre: 'El Rosal', centro: { lat: 4.85, lng: -74.26 }, sitios: 4, planes: 1 }, { id: 'subachoque', nombre: 'Subachoque', centro: { lat: 4.93, lng: -74.17 }, sitios: 5, planes: 2 }] };
  else if (url.includes('/planes')) datos = { version: 1, total: 1, planes: [{ id: 'p-1', titulo: 'Plan', duracion: 'medio día', paradas: [parada(1, 'el-rosal-parque'), parada(2, 'otro-sitio')] }] };
  else datos = { version: 1, total: 3, sitios: [sitio(), sitio(), sitio({ id: 'malo', lat: 'x' })] };
  return { status: 200, ok: true, json: async () => datos };
};
const c = Q.crearQueHacer({ urlApi: API, pedir });
const d = await c.cargar({ municipio: 'el-rosal' });
ok(d.sitios.length === 1 && d.planes.length === 1 && d.planes[0].paradas.map((x) => x.id).join() === 'el-rosal-parque,otro-sitio', 'sitios sin repetir ni dañados; el plan trae sus paradas');
ok(llamadas.every((x) => x.op.credentials === 'omit' && !x.op.headers.Authorization && x.op.cache === 'no-cache'), 'pública: sin token ni cookies, revalida con el ETag (no-cache)');
ok(llamadas.map((x) => x.url).sort().join() === 'https://taxicun.com/api/que-hacer/planes?municipio=el-rosal,https://taxicun.com/api/que-hacer/sitios?municipio=el-rosal', 'rutas /api/que-hacer/sitios y /planes');
await c.cargar({ municipio: 'el-rosal' });
ok(llamadas.length === 2, 'caché corta en memoria');
ok(await c.municipio('El Rosal') === 'el-rosal', 'municipio de la cooperativa: su id si está en /municipios');
ok(await c.municipio('Bojacá', { lat: 4.92, lng: -74.18 }) === 'subachoque', 'si no está, el más cercano a su centro (≤ 25 km)');
ok(await c.municipio('Girardot', { lat: 4.3, lng: -74.8 }) === 'girardot', 'lejos de todos: su propio id (la API responde vacío)');
modo = '404';
c.olvidar();
ok(await c.municipio('Tabio') === 'tabio', 'sin /municipios (servidor anterior): el id armado con el nombre');
let motivo = '';
try { await c.cargar({ municipio: 'tenjo' }); } catch (e) { motivo = e.motivo; }
ok(motivo === 'no_disponible', 'servidor anterior (404): no_disponible');
modo = 'red';
try { await c.cargar({ municipio: 'tabio' }); } catch (e) { motivo = e.motivo; }
ok(motivo === 'sin_red', 'sin red: sin_red');

console.log(`\n${bien} bien, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
