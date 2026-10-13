// Promoción «Viaje gratis» (servidor 0.16.0) en el núcleo, sin navegador (DISENO-PROMOCIONES.md §5, §7 y §13–§14): lo que
// la app lee del servidor (nucleo/promo.js: la promo de la bienvenida, los eventos, lo del viaje, lo del conductor, la
// hoja y «Pagos de TaxiCun», validados), la vista previa, los textos por motivo y por evento, las fechas de Bogotá, la
// tabla de ejemplos de §5.3 como prueba dorada y el hola con capacidades de las dos apps.
// Uso: node pruebas/promo-nucleo.mjs   (sale con 1 si algo falla; unos segundos)
globalThis.location = { origin: 'http://prueba.local', search: '?real=1', pathname: '/taxicun/', protocol: 'http:', host: 'prueba.local', href: 'http://prueba.local/taxicun/?real=1' };
globalThis.CT_TAXICUN = true;
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: null };
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
const almacen = new Map();
const guardar = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
globalThis.localStorage = guardar(almacen);
globalThis.sessionStorage = guardar(new Map());
const enviados = [];
globalThis.WebSocket = class {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 5);
  }
  send(t) {
    enviados.push(JSON.parse(t));
  }
  close() {
    this.readyState = 3;
  }
};
localStorage.setItem('taxicun.token', 'tok-1');
const { readFileSync } = await import('node:fs');
const FICHA = readFileSync(new URL('../empresas/cootransrural/ficha.json', import.meta.url), 'utf8');
globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => JSON.parse(FICHA) });
const P = await import('../nucleo/promo.js');
const U = await import('../nucleo/util.js');
const B = await import('../nucleo/bus.js');
const R = await import('../nucleo/reglas.js');

let bien = 0;
let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? '✔' : '✘'} ${m}`);
  if (c) bien += 1;
  else fallas += 1;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pesos = U.pesos;
const AHORA = Date.parse('2026-10-13T15:00:00Z');
const PREMIO = { id: 'pr_ABCDEFGHIJKLMNOPQRSTUV', estado: 'emitido', vence: '2026-12-13T04:59:59.999Z', tope: 10000, viajeId: null, aqui: true };
const PROMO = {
  id: 'viaje-gratis', version: 3, vigente: true, meta: 10, llevas: 7, llena: false, premio: null,
  condiciones: { tope: 10000, venceDias: 60, maxMismoConductor: 3, minimo: 6100, cada: 10 }, canjePausado: false,
  terminos: 'https://taxicun.com/promociones/viaje-gratis/',
};

/* ---------------- lectura ---------------- */
const p0 = P.leerPromo(PROMO);
ok(p0 && p0.meta === 10 && p0.llevas === 7 && p0.vigente && p0.premio === null && p0.condiciones.minimo === 6100 && p0.version === 3, 'leerPromo: la de la bienvenida pasa');
ok(P.leerPromo(undefined) === null && P.leerPromo(null) === null && P.leerPromo('promo') === null && P.leerPromo([]) === null, 'leerPromo: sin el campo (servidor 0.15.0) o con otro tipo → null');
ok(P.leerPromo({ ...PROMO, meta: '10', condiciones: {} }) === null, 'leerPromo: meta como texto y sin «cada» → null');
const conBasura = P.leerPromo({ ...PROMO, titulo: '<img src=x onerror=alert(1)>', terminos: 'javascript:alert(1)', html: '<b>x</b>' });
ok(conBasura && !('titulo' in conBasura) && !('terminos' in conBasura) && !('html' in conBasura), 'leerPromo: campos de más (textos, enlaces) se descartan: nunca un texto libre del servidor');
ok(P.leerPromo({ ...PROMO, llevas: 25 }).llevas === 10 && P.leerPromo({ ...PROMO, llevas: -1 }).llevas === 0 && P.leerPromo({ ...PROMO, llevas: 2.5 }).llevas === 0, 'leerPromo: llevas fuera de rango se acota (0…meta)');
ok(P.leerPromo({ ...PROMO, vigente: 'true', llena: 1, canjePausado: 'si' }).vigente === false, 'leerPromo: banderas solo con true de verdad');
const p1 = P.leerPromo({ ...PROMO, premio: PREMIO });
ok(p1.premio && p1.premio.id === PREMIO.id && p1.premio.vence === Date.parse(PREMIO.vence) && p1.premio.aqui === true && p1.premio.tope === 10000, 'leerPremio: id, vence (ms), tope y aqui');
for (const malo of [{ ...PREMIO, id: 'pr_corto' }, { ...PREMIO, id: '<b>pr_ABCDEFGHIJKLMNOPQRSTUV</b>' }, { ...PREMIO, estado: 'regalado' }, { ...PREMIO, vence: 'mañana' }, { ...PREMIO, tope: -5 }, { ...PREMIO, tope: '10000' }]) {
  ok(P.leerPromo({ ...PROMO, premio: malo }).premio === null, `leerPremio: ${JSON.stringify(malo).slice(0, 70)}… → sin premio`);
}
ok(igual(P.leerEvento({ tipo: 'no_sumo', motivo: 'gps_dudoso', viajeId: 'v_1' }), { tipo: 'no_sumo', viajeId: 'v_1', motivo: 'gps_dudoso' }), 'leerEvento: no_sumo con motivo');
ok(P.leerEvento({ tipo: 'fiesta' }) === null && P.leerEvento(null) === null, 'leerEvento: tipo desconocido → null');
ok(P.leerEvento({ tipo: 'no_sumo', motivo: '<script>' }).motivo === null, 'leerEvento: motivo desconocido → null (texto genérico)');
ok(igual(P.leerPromoViaje({ viajeId: 'v_1', cubre: 10000, pasajeroPaga: 300, tope: 10000 }), { cubre: 10000, pasajeroPaga: 300, tope: 10000 }), 'leerPromoViaje: promo_viaje');
ok(P.leerPromoViaje({ cubre: '10000', pasajeroPaga: 0 }) === null && P.leerPromoViaje({ cubre: 1.5, pasajeroPaga: 0 }) === null, 'leerPromoViaje: montos que no son pesos enteros → null');
ok(igual(P.leerPromoFinalPasajero({ cubierto: 10000, pasajeroPaga: 3200 }), { cubierto: 10000, pasajeroPaga: 3200 }), 'leerPromoFinalPasajero');
ok(P.leerCotizacionPromo({ premioId: PREMIO.id, cubre: 10000, pasajeroPaga: 300, tope: 10000 })?.premioId === PREMIO.id && P.leerCotizacionPromo({ premioId: 'x', cubre: 1, pasajeroPaga: 0 }) === null, 'leerCotizacionPromo: con premioId válido');
ok(igual(P.leerPromoConductor({ cubre: 10000, bono: 3090, total: 13090, pasajeroPaga: 300, extra: '<b>' }), { cubre: 10000, bono: 3090, total: 13090, pasajeroPaga: 300 }), 'leerPromoConductor: la oferta');
ok(P.leerPromoConductor({ cubre: 10000, bono: 3000, pasajeroPaga: 0 }).total === 13000, 'leerPromoConductor: sin total, cubre + bono');
const f = P.leerPromoFinal({ viajeId: 'v_1', valor: 10300, cubierto: 10000, bono: 3090, total: 13090, pasajeroPaga: 300, corte: '2026-10-19', falta: 'como_me_pagan' });
ok(f && f.corte === '2026-10-19' && f.falta === 'como_me_pagan' && f.total === 13090, 'leerPromoFinal: con corte y falta');
ok(P.leerPromoFinal({ viajeId: 'v_1', valor: 1, cubierto: 1, bono: 0, pasajeroPaga: 0, corte: 'lunes', falta: 'otra' }).corte === null && P.leerPromoFinal({ viajeId: 'v_1', valor: 1, cubierto: 1, bono: 0, pasajeroPaga: 0, falta: 'otra' }).falta === null, 'leerPromoFinal: corte y falta desconocidos → null');
ok(P.leerPromoFinal({ viajeId: '<x>', valor: 1, cubierto: 1, bono: 0, pasajeroPaga: 0 }) === null, 'leerPromoFinal: viajeId raro → null');
for (const m of P.MOTIVOS_NO_DISPONIBLE) ok(P.leerMotivoNoDisponible(m) === m, `leerMotivoNoDisponible: ${m}`);
ok(P.leerMotivoNoDisponible('<b>') === 'no_existe', 'leerMotivoNoDisponible: desconocido → no_existe');
const mia = P.leerMia({ promo: PROMO, viajes: [{ viajeId: 'v_1', fin: '2026-10-13T20:00:00Z', cuenta: true, motivo: null }, { viajeId: 'v_2', fin: 'ayer' }, { viajeId: 'v_3', fin: '2026-10-12T20:00:00Z', cuenta: false, motivo: 'gps_dudoso' }], premios: [{ id: PREMIO.id, estado: 'usado', emitido: '2026-10-01T00:00:00Z', vence: PREMIO.vence, usadoEn: '2026-10-05T00:00:00Z', viajeId: 'v_9' }, { id: 'x', estado: 'usado' }] });
ok(mia.promo && mia.viajes.length === 2 && mia.premios.length === 1 && mia.viajes[1].motivo === 'gps_dudoso', 'leerMia: lo que no cuadra se descarta');
ok(igual(P.leerMia(null), { promo: null, viajes: [], premios: [] }), 'leerMia: respuesta rara → vacía');
const pc = P.leerPagosConductor({
  condiciones: { version: 'c1', aceptadas: true, aceptadasEn: '2026-10-13T10:00:00Z' }, comoMePagan: true,
  semanas: [{ semana: '2026-10-19', desde: '2026-10-12', hasta: '2026-10-18', viajes: 3, cubierto: 26100, bono: 8130, total: 34230, estado: 'por_pagar', pagadaEn: null }, { semana: 'x', total: 1 }],
  viajes: [{ viajeId: 'v_1', fin: '2026-10-13T20:00:00Z', valor: 10300, cubierto: 10000, bono: 3090, total: 13090, estado: 'retenido' }],
  pasajero: { nombre: 'Ana', celular: '3001234567' },
});
ok(pc.condiciones.aceptadas && pc.comoMePagan && pc.semanas.length === 1 && pc.viajes[0].estado === 'pendiente' && !('pasajero' in pc), 'leerPagosConductor: semanas válidas, estado desconocido → pendiente, nada del pasajero');

/* ---------------- tabla dorada §5.3 ---------------- */
// [caso, T, S, F, V, C, bono, total, pasajeroPaga, bonoPct, bonoMax]
const TABLA = [
  ['1 Barrio Bochica', 6100, 6100, 6100, 6100, 6100, 1830, 7930, 0, 30, 0],
  ['2 El ejemplo de Oscar', 10000, 10000, 10000, 10000, 10000, 3000, 13000, 0, 30, 0],
  ['3 Fiorento', 10300, 10300, 10300, 10300, 10000, 3090, 13090, 300, 30, 0],
  ['4 Vereda Puerta de Cuero', 13200, 13200, 13200, 13200, 10000, 3960, 13960, 3200, 30, 0],
  ['5 Madrid', 30000, 30000, 30000, 30000, 10000, 9000, 19000, 20000, 30, 0],
  ['5b Madrid con bonoMax', 30000, 30000, 30000, 30000, 10000, 5000, 15000, 20000, 30, 5000],
  ['6 cobra menos', 8700, 8700, 7000, 7000, 7000, 2100, 9100, 0, 30, 0],
  ['7 cobra más', 8700, 8700, 12000, 8700, 8700, 2610, 11310, 3300, 30, 0],
  ['8 T > S', 12000, 10500, 12000, 10500, 10000, 3150, 13150, 2000, 30, 0],
  ['9 sin destino', 6100, 6100, 9000, 6100, 6100, 1830, 7930, 2900, 30, 0],
  ['10 bonoPct 25', 8350, 8350, 8350, 8350, 8350, 2088, 10438, 0, 25, 0],
];
for (const [caso, T, S, F, V, C, bono, total, paga, b, M] of TABLA) {
  const a = P.alPedir({ T, S, P: 10000, b, M });
  const z = P.alTerminar({ B: a.B, F, P: 10000, b, M });
  ok(z.V === V && z.C === C && z.bono === bono && z.total === total && z.pasajeroPaga === paga, `§5.3 caso ${caso}: V ${z.V} · cubre ${z.C} · bono ${z.bono} · total ${z.total} · paga ${z.pasajeroPaga}`);
}
ok(P.alPedir({ T: 10300, S: 10300, P: 10000, b: 30 }).pasajeroPaga === 300 && P.alPedir({ T: 10300, S: 10300, P: 10000, b: 30 }).bono === 3090, 'alPedir: Fiorento antes de aceptar (bono 3.090, paga 300)');
let redondeo = true;
for (let b = 0; b <= 100 && redondeo; b++) for (let v = 0; v <= 100000; v += 50) if (P.redondearBono(v, b) !== Math.floor((v * b + 50) / 100)) redondeo = false;
ok(redondeo, 'redondearBono: la mitad hacia arriba con enteros (todos los bonoPct, de $50 en $50 hasta $100.000)');
ok(P.pasajeroPagaLocal(10300, 10000) === 300 && P.pasajeroPagaLocal(7000, 8700) === 0 && P.pasajeroPagaLocal(12000, 8700) === 3300, 'pasajeroPagaLocal: F − min(F, cubre)');

/* ---------------- vista previa y «Confirma tu viaje» ---------------- */
const conPremio = P.leerPromo({ ...PROMO, premio: PREMIO });
ok(P.premioUsable(conPremio, AHORA) && !P.premioUsable({ ...conPremio, canjePausado: true }, AHORA) && !P.premioUsable({ ...conPremio, premio: { ...conPremio.premio, aqui: false } }, AHORA) && !P.premioUsable(conPremio, Date.parse('2026-12-14T00:00:00Z')), 'premioUsable: emitido, aquí, sin pausa y sin vencer');
let vp = P.vistaPrevia({ tarifa: 13200, promo: conPremio });
ok(vp.cubre === 10000 && vp.pasajeroPaga === 3200 && vp.aprox, 'vistaPrevia sin cotización: con la tarifa y el tope, «aprox.»');
vp = P.vistaPrevia({ tarifa: 12000, promo: conPremio, cotizacionPromo: { premioId: PREMIO.id, cubre: 10000, pasajeroPaga: 2000, tope: 10000 } });
ok(vp.cubre === 10000 && vp.pasajeroPaga === 2000 && !vp.aprox, 'vistaPrevia con cotizacion.promo: exacta');
ok(P.vistaPrevia({ tarifa: 12000, promo: conPremio, cotizacionPromo: { premioId: 'pr_OTROOTROOTROOTROOTROOT', cubre: 1, pasajeroPaga: 1 } }).aprox, 'vistaPrevia: la cotización de otro premio no vale');
let t = P.textosConfirmar({ promo: conPremio, vp: P.vistaPrevia({ tarifa: 13200, promo: conPremio }), usar: true, conDestino: true, pesos });
ok(t.interruptor === 'Usar mi viaje gratis' && t.subInterruptor === 'TaxiCun paga hasta $10.000', `confirmar: «${t.interruptor}» · «${t.subInterruptor}»`);
ok(t.linea === 'TaxiCun paga $10.000 · Tú pagas $3.200 (aprox.)' && t.boton === 'Pedir taxi · pagas $3.200', `confirmar con diferencia: «${t.linea}» · «${t.boton}»`);
ok(t.lineaTarjeta === 'Este viaje no suma mientras uses tu viaje gratis', `confirmar: la línea de la tarjeta («${t.lineaTarjeta}»)`);
t = P.textosConfirmar({ promo: conPremio, vp: P.vistaPrevia({ tarifa: 8700, promo: conPremio }), usar: true, conDestino: true, pesos });
ok(t.linea === 'Este viaje te sale gratis (aprox.)' && t.boton === 'Pedir taxi gratis', `confirmar gratis: «${t.linea}» · «${t.boton}»`);
t = P.textosConfirmar({ promo: conPremio, vp: P.vistaPrevia({ tarifa: 6100, promo: conPremio }), usar: true, conDestino: false, minima: 6100, pesos });
ok(t.nota === 'Sin destino, TaxiCun cubre la carrera mínima ($6.100). Marca tu destino para que cubra hasta $10.000.', `confirmar sin destino: «${t.nota}»`);
t = P.textosConfirmar({ promo: conPremio, vp: null, usar: false, conDestino: true, pesos });
ok(t.linea === '' && t.boton === 'Pedir taxi' && t.lineaTarjeta === 'Viaje 8 de 10 de tu tarjeta', `confirmar con el interruptor apagado: el botón de siempre y «${t.lineaTarjeta}»`);

/* ---------------- inicio y textos ---------------- */
const ti = (x) => P.tarjetaInicio(P.leerPromo(x), { pesos, ahora: AHORA });
ok(igual([ti(PROMO).titulo, ti(PROMO).sub, ti(PROMO).anillo], ['Llevas 7 de 10', 'Tu viaje gratis está cerca', '7/10']), 'inicio: «Llevas 7 de 10 · Tu viaje gratis está cerca»');
ok(ti({ ...PROMO, llevas: 0 }).sub === 'Cada 10 viajes, el siguiente es gratis' && ti({ ...PROMO, llevas: 9 }).sub === '¡Te falta 1 viaje para tu viaje gratis!', 'inicio: con 0 y con 9');
ok(ti({ ...PROMO, premio: PREMIO }).titulo === '¡Tienes un viaje gratis!' && ti({ ...PROMO, premio: PREMIO }).sub === 'Úsalo antes del 12 de diciembre' && ti({ ...PROMO, premio: PREMIO }).anillo === 'Gratis', 'inicio: con premio usable aquí (vence el 12 de diciembre en Bogotá)');
ok(ti({ ...PROMO, premio: { ...PREMIO, aqui: false } }).titulo === 'Tienes un viaje gratis', 'inicio: con premio que no es de aquí');
ok(ti({ ...PROMO, premio: PREMIO, canjePausado: true }).sub === 'Tu viaje gratis está en pausa por unas horas. No pierdes días.', 'inicio: canje en pausa');
ok(ti({ ...PROMO, llena: true }).titulo === 'Completaste otra tarjeta', 'inicio: tarjeta llena esperando');
ok(ti({ ...PROMO, vigente: false }) === null && P.tarjetaInicio(null) === null, 'inicio: sin vigencia ni premio, o sin promo → nada');
ok(P.detalleMenu(P.leerPromo({ ...PROMO, premio: PREMIO }), AHORA) === '¡Tienes un viaje gratis!' && P.detalleMenu(P.leerPromo(PROMO), AHORA) === 'Llevas 7 de 10', 'menú: el detalle de «Promociones»');
const ESPERADOS = {
  mismo_usuario: 'Este viaje no sumó: no cumple las condiciones de la promoción.',
  sin_celular: 'Este viaje no sumó: agrega tu celular en “Mi cuenta” para participar.',
  tarjeta_llena: 'Este viaje no sumó: ya completaste otra tarjeta. Usa tu viaje gratis para seguir sumando.',
  valor_minimo: 'Este viaje no sumó: su valor fue menor que la carrera mínima ($6.100).',
  sin_recorrido: 'Este viaje no sumó: no pudimos verificar el recorrido.',
  sin_avance: 'Este viaje no sumó: no pudimos verificar el recorrido.',
  gps_dudoso: 'Este viaje no sumó: no pudimos verificar el recorrido.',
  mismo_conductor: 'Este viaje no sumó: ya llevas 3 viajes de esta tarjeta con el mismo conductor. Viaja con otros conductores para completarla.',
  tope_dia: 'Este viaje no sumó: ya sumaste los viajes permitidos por hoy.',
};
for (const [m, txt] of Object.entries(ESPERADOS)) ok(P.textoNoSumo(m, { condiciones: p0.condiciones, pesos }) === txt, `no sumó por ${m}`);
ok(P.textoNoSumo('viaje_gratis') === null, 'no sumó por viaje_gratis: sin aviso');
ok(P.avisoEvento({ tipo: 'sumo' }, P.leerPromo({ ...PROMO, llevas: 8 }), { pesos }).cuerpo === 'Llevas 8 de 10 para tu viaje gratis.', 'evento sumo: «Llevas 8 de 10…»');
ok(P.avisoEvento({ tipo: 'premio_devuelto' }, p0).titulo === 'Tu viaje gratis sigue guardado', 'evento premio_devuelto');
ok(P.avisoEvento({ tipo: 'premio_vencido' }, p0).titulo === 'Tu viaje gratis venció' && P.avisoEvento({ tipo: 'premio_anulado' }, p0).cuerpo.includes('info@taxicun.com'), 'eventos vencido y anulado');
ok(P.avisoEvento({ tipo: 'premio' }, p0) === null && P.avisoEvento({ tipo: 'config' }, p0) === null, 'eventos premio y config: los pinta el diseño (sin aviso del núcleo)');
const tp = P.textosPremio(P.leerPromo({ ...PROMO, premio: PREMIO }), { pesos, ahora: AHORA });
ok(tp.titulo === '¡Ganaste un viaje gratis!' && tp.cuerpo === 'TaxiCun te regala tu próximo viaje (hasta $10.000). Úsalo antes del 12 de diciembre.', `premio: «${tp.cuerpo}»`);
const ND = { no_existe: 'Ese viaje gratis ya no está disponible.', anulado: 'Ese viaje gratis ya no está disponible.', usado: 'Ya usaste ese viaje gratis.', vencido: 'Tu viaje gratis venció.', en_uso: 'Tu viaje gratis está en otro pedido.', pausado: 'El canje está en pausa por unas horas. No pierdes días.', cooperativa: 'Tu viaje gratis no se puede usar en esta cooperativa.', sin_tarifa: 'No pudimos calcular el valor de este viaje para la promoción. Intenta de nuevo en un momento o pide sin el viaje gratis.' };
for (const [m, txt] of Object.entries(ND)) ok(P.textoNoDisponible(m) === txt, `premio_no_disponible ${m}`);
ok(igual(P.asiFunciona(p0, { pesos }), ['Cada 10 viajes completados, el siguiente es gratis hasta $10.000.', 'Si tu viaje vale más, pagas la diferencia al conductor.', 'Tienes 60 días para usarlo.', 'Máximo 3 viajes de cada tarjeta con el mismo conductor.']), '«Así funciona» con los valores vigentes');
ok(igual(P.textosPagar({ cubierto: 10000, pasajeroPaga: 3200 }, { pesos }), { titulo: 'TaxiCun pagó $10.000 de tu viaje', cuerpo: 'Paga $3.200 al conductor' }) && P.textosPagar({ cubierto: 8700, pasajeroPaga: 0 }, { pesos }).cuerpo === 'No tienes que pagar nada. ¡Disfruta tu viaje gratis!', 'pagar: con diferencia y gratis');
ok(R.textoSinConductores('promo_app').titulo === 'Los taxis cerca todavía no tienen la app al día', 'sin_conductores promo_app: su texto');
ok(igual(P.lineaViajeMia({ fin: Date.parse('2026-10-13T20:00:00Z'), cuenta: true }), { fecha: '13 oct', texto: 'Sumó', sumo: true }) && P.lineaViajeMia({ fin: Date.parse('2026-10-12T20:00:00Z'), cuenta: false, motivo: 'gps_dudoso' }).texto === 'No sumó: no pudimos verificar el recorrido.', 'hoja: «13 oct · Sumó» / «No sumó: …»');

/* ---------------- fechas de Bogotá ---------------- */
ok(P.fechaLarga(Date.parse('2026-12-13T04:59:59.999Z'), { ahora: AHORA }) === '12 de diciembre', 'fecha: 2026-12-13T04:59:59.999Z es el 12 de diciembre en Bogotá');
ok(P.fechaLarga(Date.parse('2027-01-02T12:00:00Z'), { ahora: AHORA }) === '2 de enero de 2027', 'fecha: con año si no es el de ahora');
ok(P.fechaCorta(Date.parse('2026-10-14T03:00:00Z')) === '13 oct', 'fecha corta: 14-oct 03:00 UTC es 13 oct en Bogotá');
ok(P.diaConNombre('2026-10-19') === 'lunes 19 de octubre', 'corte: «lunes 19 de octubre»');
ok(P.semanaTexto('2026-10-12', '2026-10-18') === 'del 12 al 18 de oct' && P.semanaTexto('2026-09-28', '2026-10-04') === 'del 28 de sep al 4 de oct', 'semana: «del 12 al 18 de oct»');

/* ---------------- conductor ---------------- */
let o = P.textosOferta({ cubre: 10000, bono: 3000, total: 13000, pasajeroPaga: 0 }, { pesos });
ok(o.chip === 'Viaje con promoción' && o.paga === 'TaxiCun te paga $10.000 + bono $3.000' && o.pasajero === 'El pasajero no te paga' && o.registrar === '', 'oferta gratis: «TaxiCun te paga $10.000 + bono $3.000»');
o = P.textosOferta({ cubre: 10000, bono: 3960, total: 13960, pasajeroPaga: 3200 }, { pesos, sinComoMePagan: true });
ok(o.pasajero === 'El pasajero te paga $3.200' && o.registrar === 'Registra “Cómo me pagan” para recibir este pago', 'oferta con diferencia y sin «Cómo me pagan»');
ok(P.textoCuantoCobras({ cubre: 10000, bono: 3090, pasajeroPaga: 300 }, { pesos }) === 'Viaje con promoción: TaxiCun te paga hasta $10.000 de este valor y un bono del 30 %. Escribe el valor real del viaje.', '«¿Cuánto cobras?»: con el 30 % que cuadra');
ok(P.textoCuantoCobras({ cubre: 10000, bono: 3150, pasajeroPaga: 2000 }, { pesos }).endsWith('y un bono. Escribe el valor real del viaje.'), '«¿Cuánto cobras?»: sin porcentaje si no cuadra con la tarifa (caso 8)');
let cb = P.textosCobrando({ final: { cubierto: 10000, bono: 3090, total: 13090, pasajeroPaga: 0, corte: '2026-10-19', falta: null }, valor: 10000, p: null, pesos });
ok(cb.titulo === 'El pasajero no te paga' && cb.taxicun === 'TaxiCun te paga $13.090 ($10.000 del viaje + $3.090 de bono) en la liquidación del lunes 19 de octubre.', `cobrando gratis: «${cb.taxicun}»`);
cb = P.textosCobrando({ final: { cubierto: 10000, bono: 3090, total: 13090, pasajeroPaga: 300, corte: '2026-10-19', falta: 'como_me_pagan' }, valor: 10300, pesos });
ok(cb.titulo === 'Cobra $300 al pasajero' && cb.falta === 'Para recibir este pago registra “Cómo me pagan”.' && cb.accionFalta === 'como_me_pagan', 'cobrando con diferencia y sin «Cómo me pagan»');
cb = P.textosCobrando({ final: null, valor: 10300, p: { cubre: 10000, bono: 3090, pasajeroPaga: 300 }, pesos });
ok(cb.titulo === 'Cobra $300 al pasajero' && cb.pasajeroPaga === 300, 'cobrando antes de promo_final: con lo de la oferta');
ok(P.textosCobrando({ final: { cubierto: 1, bono: 0, total: 1, pasajeroPaga: 0, corte: null, falta: 'condiciones' }, pesos }).accionFalta === 'condiciones', 'cobrando: falta aceptar las condiciones');
ok(P.lineaSemana({ desde: '2026-10-12', hasta: '2026-10-18', viajes: 3, total: 34230, estado: 'por_pagar' }, { pesos }) === 'Semana del 12 al 18 de oct · 3 viajes · $34.230 · Por pagar', 'Pagos de TaxiCun: la semana por pagar');
ok(P.lineaSemana({ desde: '2026-10-12', hasta: '2026-10-18', viajes: 1, total: 13090, estado: 'pagada', pagadaEn: Date.parse('2026-10-20T15:00:00Z') }, { pesos }).endsWith('Pagado el 20 de oct'), 'Pagos de TaxiCun: «Pagado el 20 de oct»');
ok(P.lineaViajePago({ fin: Date.parse('2026-10-13T20:00:00Z'), total: 13090, estado: 'en_revision' }, { pesos }) === '13 oct · $13.090 · En revisión', 'Pagos de TaxiCun: «13 oct · $13.090 · En revisión»');

/* ---------------- hola con capacidades ---------------- */
const bp = new B.BusServidor({ rol: 'pasajero', empresa: 'cootransrural' });
bp.conectar();
const bc = new B.BusServidor({ rol: 'conductor' });
bc.conectar();
await new Promise((r) => setTimeout(r, 40));
const holas = enviados.filter((m) => m.tipo === 'hola');
ok(igual(holas.find((h) => h.datos.rol === 'pasajero')?.datos.capacidades, ['seguridad', 'promo']), 'hola del pasajero: capacidades [seguridad, promo]');
ok(igual(holas.find((h) => h.datos.rol === 'conductor')?.datos.capacidades, ['promo']), 'hola del conductor: capacidades [promo] (y nada más)');
ok(!('empresa' in (holas.find((h) => h.datos.rol === 'conductor')?.datos || {})), 'hola del conductor: sin empresa, como siempre');
bp.cerrar();
bc.cerrar();

console.log(`\n${bien} bien, ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
