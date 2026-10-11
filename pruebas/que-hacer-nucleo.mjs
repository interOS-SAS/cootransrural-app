// «¿Qué hacer?» (nucleo/que-hacer.js), sin navegador: validación de lo que manda la API pública, fotos solo del mismo
// origen y con crédito, planes con sus paradas publicadas, la consulta, el orden por distancia y el cliente (caché,
// servidor anterior, sin red). Uso: node pruebas/que-hacer-nucleo.mjs   (sale con 1 si algo falla)
import * as Q from '../nucleo/que-hacer.js';

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const API = 'https://taxicun.com/api/';
const foto = (extra = {}) => ({ id: 'f1', url: '/api/que-hacer/fotos/f1.jpg', autor: 'DnTrotaMundos ☮', licencia: 'CC BY 3.0', licenciaUrl: 'https://creativecommons.org/licenses/by/3.0', pagina: 'https://commons.wikimedia.org/wiki/File:Iglesia.jpg', ...extra });
const sitio = (extra = {}) => ({ id: 'el-rosal-parque', nombre: 'Parque principal', municipio: 'El Rosal', municipioId: 'el-rosal', categoria: 'parque', resumen: 'La plaza.', descripcion: 'El centro.', lat: 4.8525, lng: -74.2605, entrada: 'gratis', fotos: [foto()], ...extra });

// Fotos
ok(Q.urlFoto('/api/que-hacer/fotos/a.jpg', API) === 'https://taxicun.com/api/que-hacer/fotos/a.jpg', 'foto del mismo origen bajo /api/que-hacer/');
ok(Q.urlFoto('https://upload.wikimedia.org/a.jpg', API) === '', 'una foto de Commons enlazada directo no pasa (la sirve TaxiCun)');
ok(Q.urlFoto('javascript:alert(1)', API) === '' && Q.urlFoto('data:image/png;base64,AA', API) === '', 'javascript: y data: no pasan');
ok(Q.urlFoto('/api/yo', API) === '' && Q.urlFoto('/otra/a.jpg', API) === '', 'otras rutas del sitio no pasan');
ok(Q.urlFoto('//evil.test/api/que-hacer/a.jpg', API) === '', 'otro dominio con «//» no pasa');
ok(Q.urlFoto('/api/que-hacer/../yo', API) === '', 'sin «..»');
ok(Q.normalizarFoto(foto({ autor: '' }), API) === null, 'sin autor y sin «propia»: la foto no sale (crédito obligatorio)');
const propia = Q.normalizarFoto(foto({ autor: '', propia: true, licencia: '' }), API);
ok(propia && Q.textoCredito(propia) === 'Foto de interOS', 'foto propia sin autor: «Foto de interOS»');
const f = Q.normalizarFoto(foto({ licenciaUrl: 'javascript:alert(1)', pagina: 'https://evil.test/x' }), API);
ok(f && f.licenciaUrl === '' && f.pagina === '' && Q.textoCredito(f) === 'Foto: DnTrotaMundos ☮ · CC BY 3.0', 'enlaces del crédito solo de Commons o Creative Commons; el texto del crédito queda');

// Sitios
const s = Q.normalizarSitio(sitio({ nombre: '  <b>Parque</b>‮  principal ', categoria: 'rara', entrada: 'con_costo', valorEntrada: 5000 }), API);
ok(s && s.nombre === '<b>Parque</b> principal' && s.categoria === 'otro', 'textos planos (sin controles) y categoría desconocida → «otro»');
ok(Q.textoEntrada(s, (v) => `$${v}`) === 'Entrada: $5000', 'entrada con costo y valor');
ok(Q.textoEntrada({ entrada: 'gratis' }) === 'Entrada gratis' && Q.textoEntrada({ entrada: 'desconocido' }) === 'Entrada: consulta antes de ir', 'entrada gratis y desconocida');
ok(Q.normalizarSitio(sitio({ id: '../x' }), API) === null && Q.normalizarSitio(sitio({ lat: 'a' }), API) === null && Q.normalizarSitio(sitio({ lat: 40 }), API) === null, 'id raro, coordenadas que no son número o fuera de Colombia: fuera');
ok(Q.normalizarSitio(sitio({ descripcion: 'x'.repeat(5000) }), API).descripcion.length === 2000, 'descripción recortada a 2000');

// Planes
const mapa = new Map([['a-1', { id: 'a-1' }], ['a-2', { id: 'a-2' }]]);
const pl = Q.normalizarPlan({ id: 'plan-1', titulo: 'Mañana', paradas: ['a-1', { id: 'a-2' }, 'no-esta'] }, mapa);
ok(pl && pl.paradas.length === 2, 'paradas por id o como objeto; la que no está publicada se cae');
ok(Q.normalizarPlan({ id: 'plan-2', titulo: 'Corto', paradas: ['a-1', 'no-esta'] }, mapa) === null, 'un plan con menos de 2 paradas publicadas no sale');

// Consulta y orden
ok(Q.consulta({ cerca: { lat: 4.852512, lng: -74.26 } }) === 'lat=4.8525&lng=-74.2600&radioKm=25', 'consulta cerca (4 decimales, radio 25)');
ok(Q.consulta({ municipio: 'Facatativá' }) === 'municipio=facatativa' && Q.idMunicipio('El Rosal') === 'el-rosal', 'consulta por municipio (id sin tildes)');
const orden = Q.ordenarPorDistancia([{ id: 'lejos', lat: 4.9, lng: -74.3 }, { id: 'cerca', lat: 4.853, lng: -74.26 }], { lat: 4.8525, lng: -74.2605 });
ok(orden[0].id === 'cerca' && orden[0].km < orden[1].km, 'ordena por distancia y pone los km');

// Cliente
const llamadas = [];
let modo = 'ok';
const pedir = async (url, op) => {
  llamadas.push({ url, op });
  if (modo === 'red') throw new TypeError('sin red');
  if (modo === '404') return { status: 404, ok: false, json: async () => ({ error: 'no_existe' }) };
  const datos = url.includes('/planes')
    ? { planes: [{ id: 'p-1', titulo: 'Plan', paradas: ['el-rosal-parque', 'otro-sitio'] }], sitios: [sitio({ id: 'otro-sitio', lat: 4.86 })] }
    : { sitios: [sitio(), sitio(), sitio({ id: 'borrador', lat: 'x' })] };
  return { status: 200, ok: true, json: async () => datos };
};
const c = Q.crearQueHacer({ urlApi: API, pedir });
const d = await c.cargar({ municipio: 'El Rosal' });
ok(d.sitios.length === 1 && d.planes.length === 1 && d.planes[0].paradas.map((x) => x.id).join() === 'el-rosal-parque,otro-sitio', 'sitios sin repetir; el plan toma su parada de los sitios del plan');
ok(llamadas.every((x) => x.op.credentials === 'omit' && !x.op.headers.Authorization && x.op.cache === 'no-cache'), 'pública: sin token ni cookies, revalida con el ETag (no-cache)');
ok(llamadas.map((x) => x.url).sort().join() === 'https://taxicun.com/api/que-hacer/planes?municipio=el-rosal,https://taxicun.com/api/que-hacer/sitios?municipio=el-rosal', 'rutas /api/que-hacer/sitios y /planes');
await c.cargar({ municipio: 'El Rosal' });
ok(llamadas.length === 2, 'caché corta en memoria');
modo = '404';
c.olvidar();
let motivo = '';
try { await c.cargar({ municipio: 'Tenjo' }); } catch (e) { motivo = e.motivo; }
ok(motivo === 'no_disponible', 'servidor anterior (404): no_disponible');
modo = 'red';
try { await c.cargar({ municipio: 'Tabio' }); } catch (e) { motivo = e.motivo; }
ok(motivo === 'sin_red', 'sin red: sin_red');

console.log(`\n${bien} bien, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
