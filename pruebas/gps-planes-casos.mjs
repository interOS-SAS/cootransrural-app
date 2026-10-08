// Casos de los topes y las reglas de los planes de la tienda GPS (§14.1.2 del diseño del GPS), para probar con los
// MISMOS cuerpos las dos revisiones: la del generador (revisar_planes_gps en herramientas/generar-empresas.py, que se
// niega a armar la página con un respaldo así; pruebas/gps-respaldo.mjs) y la de la página (gps/tienda.js, que deja el
// respaldo si la API manda algo así; pruebas/gps-tienda.mjs).
// Cada caso: { nombre, cuerpo, ruta, codigo } con el PRIMER problema que encuentra la página («invalido <ruta> <codigo>»);
// el generador tiene que encontrar ese mismo problema entre los suyos. Los casos con «valido: true» pasan en los dos
// (salvo licenciaMes distinta de la cuota del sitio, que solo el generador rechaza: «soloGenerador»).

// Recalcula lo que calcula el servidor (alInstalar, primerAnio y combo.ahorroMes): así un caso cambia UNA cosa.
export function recalcular(d) {
  const porId = Object.fromEntries(d.planes.map((p) => [p.id, p]));
  for (const p of d.planes) {
    p.alInstalar = p.precioEquipo + p.instalacion;
    p.primerAnio = p.alInstalar + 12 * p.mes;
    if (p.combo && porId[p.combo.base]) p.combo.ahorroMes = porId[p.combo.base].mes + d.licenciaMes - p.mes;
  }
  return d;
}

export function casosPlanes(respaldo) {
  const casos = [];
  // cambiar(d) cambia el cuerpo; con recalc, después se recalculan los valores calculados.
  const caso = (nombre, cambiar, ruta, codigo, { recalc = true, ...extra } = {}) => {
    const d = structuredClone(respaldo);
    d.version = 50 + casos.length;
    cambiar(d);
    if (recalc) recalcular(d);
    casos.push({ nombre, cuerpo: d, ruta, codigo, ...extra });
  };
  const plan = (d, id) => d.planes.find((p) => p.id === id);
  const base = (id, extra = {}) => ({ id, nombre: `Plan ${id}`, lema: '', equipo: 'propio', precioEquipo: 100000, instalacion: 0, mes: 20000,
    permanenciaMeses: 0, destacado: false, combo: null, condiciones: [], ...extra });

  // Cuerpo
  caso('versión 0', (d) => { d.version = 0; }, 'version', 'fuera_de_tope');
  caso('moneda USD', (d) => { d.moneda = 'USD'; }, 'moneda', 'no_cop');
  caso('sin IVA', (d) => { d.ivaIncluido = false; }, 'ivaIncluido', 'sin_iva');
  caso('licencia de 9.000', (d) => { d.licenciaMes = 9000; }, 'licenciaMes', 'fuera_de_tope');
  caso('flotas desde 1', (d) => { d.flotasDesde = 1; }, 'flotasDesde', 'fuera_de_tope');
  caso('combo sin nombre', (d) => { d.combo.nombre = 'X'; }, 'combo.nombre', 'texto_corto');
  // Lista de planes
  caso('sin planes', (d) => { d.planes = []; }, 'planes', 'demasiados');
  caso('7 planes', (d) => { for (let i = 1; i <= 3; i++) d.planes.push(base(`extra_${i}`)); }, 'planes', 'demasiados');
  caso('solo combos', (d) => { d.planes = d.planes.filter((p) => p.combo); }, 'planes', 'sin_plan_base');
  caso('dos destacados', (d) => { plan(d, 'compra').destacado = true; }, 'planes', 'destacado_repetido');
  // Ids
  caso('id con mayúsculas', (d) => { plan(d, 'combo_compra').id = 'Combo-Compra'; }, 'planes[2].id', 'id_invalido');
  caso('id de 25 letras', (d) => { plan(d, 'combo_compra').id = 'c'.repeat(25); }, 'planes[2].id', 'id_invalido');
  caso('id repetido', (d) => { plan(d, 'combo_sin_cuota').id = 'combo_compra'; }, 'planes[combo_compra].id', 'id_repetido', { recalc: false });
  caso('id «combo»', (d) => { plan(d, 'combo_compra').id = 'combo'; }, 'planes[combo].id', 'id_reservado');
  caso('id «no_se»', (d) => { plan(d, 'combo_compra').id = 'no_se'; }, 'planes[no_se].id', 'id_reservado');
  // Textos
  caso('nombre de 1 letra', (d) => { plan(d, 'compra').nombre = 'C'; }, 'planes[compra].nombre', 'texto_corto');
  caso('nombre de 41 letras', (d) => { plan(d, 'compra').nombre = 'C'.repeat(41); }, 'planes[compra].nombre', 'texto_largo');
  caso('lema de 81 letras', (d) => { plan(d, 'compra').lema = 'l'.repeat(81); }, 'planes[compra].lema', 'texto_largo');
  caso('condición de 2 letras', (d) => { plan(d, 'compra').condiciones = ['ab']; }, 'planes[compra].condiciones[0]', 'texto_corto');
  caso('6 condiciones', (d) => { plan(d, 'compra').condiciones = ['Una.', 'Dos.', 'Tres.', 'Cuatro.', 'Cinco.', 'Seis.']; }, 'planes[compra].condiciones', 'demasiados');
  caso('otro valor de 2 letras', (d) => { d.extras[0].texto = 'ab'; }, 'extras[0].texto', 'texto_corto');
  // Texto plano (S30) y sin enlaces: las cargas de §14.6
  for (const [que, texto] of [
    ['<img onerror>', '<img src=x onerror=alert(1)>'], ['javascript: con mayúsculas y espacios', 'JaVaScRiPt :alert(1)'], ['U+202E', 'Compra‮dab'],
    ['salto de línea', 'Compra\r\notra'], ['" onmouseover=', 'x" onmouseover=alert(1)'], ['https://', 'Mira https://x.co'], ['www.', 'Mira www.x.co'],
    ['data: al empezar', 'data:text/html,hola'], ['comilla invertida', 'Compra `x`'], ['espacio de ancho cero', 'Com​pra'],
  ]) caso(`nombre con ${que}`, (d) => { plan(d, 'compra').nombre = texto; }, 'planes[compra].nombre', 'texto_no_permitido');
  caso('condición con www.', (d) => { plan(d, 'sin_cuota').condiciones[0] = 'Lee www.ejemplo.co'; }, 'planes[sin_cuota].condiciones[0]', 'texto_no_permitido');
  caso('otro valor con <b>', (d) => { d.extras[1].texto = '<b>Visita</b>'; }, 'extras[1].texto', 'texto_no_permitido');
  caso('lema del combo con javascript:', (d) => { d.combo.lema = 'javascript:alert(1)'; }, 'combo.lema', 'texto_no_permitido');
  // Equipo y precios
  caso('equipo «alquiler»', (d) => { plan(d, 'compra').equipo = 'alquiler'; }, 'planes[compra].equipo', 'equipo_invalido');
  caso('comodato con precio', (d) => { plan(d, 'sin_cuota').precioEquipo = 100000; }, 'planes[sin_cuota].precioEquipo', 'comodato_con_precio');
  caso('equipo de 1.500.100', (d) => { plan(d, 'compra').precioEquipo = 1500100; }, 'planes[compra].precioEquipo', 'fuera_de_tope');
  caso('instalación de 300.100', (d) => { plan(d, 'compra').instalacion = 300100; }, 'planes[compra].instalacion', 'fuera_de_tope');
  caso('mes de 9.900', (d) => { plan(d, 'compra').mes = 9900; }, 'planes[compra].mes', 'fuera_de_tope');
  caso('mes de 300.100', (d) => { plan(d, 'combo_sin_cuota').mes = 300100; }, 'planes[combo_sin_cuota].mes', 'fuera_de_tope');
  caso('mes que no es múltiplo de 100', (d) => { plan(d, 'compra').mes = 29950; }, 'planes[compra].mes', 'no_multiplo_100');
  caso('mes con decimales', (d) => { plan(d, 'compra').mes = 29900.5; }, 'planes[compra].mes', 'no_entero');
  caso('mes como texto', (d) => { plan(d, 'compra').mes = '29900'; }, 'planes[compra].mes', 'no_entero', { recalc: false });
  caso('permanencia de 37 meses', (d) => { plan(d, 'sin_cuota').permanenciaMeses = 37; plan(d, 'combo_sin_cuota').permanenciaMeses = 37; }, 'planes[sin_cuota].permanenciaMeses', 'fuera_de_tope');
  caso('otros valores: 7', (d) => { for (let i = 0; i < 4; i++) d.extras.push({ texto: `Otro ${i}`, valor: 1000 }); }, 'extras', 'demasiados');
  caso('otro valor de 500.100', (d) => { d.extras[0].valor = 500100; }, 'extras[0].valor', 'fuera_de_tope');
  caso('otro valor de $150', (d) => { d.extras[0].valor = 150; }, 'extras[0].valor', 'no_multiplo_100');
  // Valores calculados
  caso('al instalar que no cuadra', (d) => { plan(d, 'compra').alInstalar += 100; }, 'planes[compra].alInstalar', 'no_cuadra', { recalc: false });
  caso('primer año que no cuadra', (d) => { plan(d, 'sin_cuota').primerAnio -= 100; }, 'planes[sin_cuota].primerAnio', 'no_cuadra', { recalc: false });
  caso('ahorro que no cuadra', (d) => { plan(d, 'combo_compra').combo.ahorroMes = 8000; }, 'planes[combo_compra].combo.ahorroMes', 'no_cuadra', { recalc: false });
  // Combos
  caso('combo sin base', (d) => { plan(d, 'combo_compra').combo.base = 'nada'; }, 'planes[combo_compra].combo', 'combo_sin_base');
  caso('combo de un combo', (d) => { plan(d, 'combo_sin_cuota').combo.base = 'combo_compra'; plan(d, 'combo_sin_cuota').equipo = 'propio'; }, 'planes[combo_sin_cuota].combo', 'combo_sin_base');
  caso('combo con otro equipo', (d) => { plan(d, 'combo_compra').equipo = 'comodato'; plan(d, 'combo_compra').precioEquipo = 0; plan(d, 'combo_compra').instalacion = 0; }, 'planes[combo_compra].combo', 'combo_sin_base');
  caso('combo con menos permanencia que su base', (d) => { plan(d, 'combo_sin_cuota').permanenciaMeses = 6; }, 'planes[combo_sin_cuota].combo', 'combo_sin_base');
  caso('combo sin ahorro', (d) => { plan(d, 'combo_compra').mes = 56000; }, 'planes[combo_compra].combo.ahorroMes', 'combo_sin_ahorro');
  // Válidos
  caso('válido: sin lemas ni condiciones', (d) => { for (const p of d.planes) { p.lema = ''; p.condiciones = []; } d.combo.lema = ''; }, '', '', { valido: true });
  caso('válido: sin otros valores', (d) => { d.extras = []; }, '', '', { valido: true });
  caso('válido: sin combos', (d) => { d.planes = d.planes.filter((p) => !p.combo); }, '', '', { valido: true });
  caso('válido: 6 planes y 6 otros valores', (d) => { d.planes.push(base('extra_1'), base('extra_2')); d.extras.push({ texto: 'Cuatro', valor: 0 }, { texto: 'Cinco', valor: 500000 }, { texto: 'Seis', valor: 100 }); }, '', '', { valido: true });
  caso('válido: «habeas data:» y «candidata:» son texto', (d) => { plan(d, 'compra').condiciones = ['Tu habeas data: lo cuidamos.', 'Plan para candidata: sí.']; }, '', '', { valido: true });
  caso('válido: otra licencia (solo el generador la rechaza: no es la del Plan B del sitio)', (d) => { d.licenciaMes = 30000; }, '', '', { valido: true, soloGenerador: 'licenciaMes' });
  return casos;
}
