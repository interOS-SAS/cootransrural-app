// Tienda TaxiCun GPS (gps/index.html; va en gps/ y no en web/ para no entrar en el mapa de importaciones de las
// páginas con módulos). Dos partes:
//
// 1) LOS PLANES Y PRECIOS DESDE LA API (§14.4 del diseño del GPS). interOS los cambia en el panel y el servidor los
//    publica en GET /api/gps/planes (mismo origen, sin cookies; cuerpo de §14.2.1). Al abrir la página:
//    - se pide con credentials 'omit' y una espera máxima de 4 s (el ETag del servidor ahorra el cuerpo si no cambió);
//    - la respuesta tiene que ser 200, JSON, de hasta 32 KB, con version entera, moneda 'COP', ivaIncluido true, y
//      cumplir los topes y las reglas (data-gps-topes, los de TOPES_GPS del generador = TOPES de src/gps/planes.js):
//      ids, textos planos sin < > ni enlaces, pesos enteros y múltiplos de 100, combos con su base, y los valores
//      calculados (alInstalar, primerAnio, ahorroMes) que cuadran;
//    - TODO O NADA: si algo falla (404, 5xx, HTML, JSON malo, fuera de topes, sin respuesta o sin red) la página queda
//      entera con el respaldo que trae (herramientas/gps-planes.json), sin mezclar, y deja el motivo en
//      data-gps-motivo. Si todo está bien, arma primero todos los nodos y después reemplaza, de una vez: las tarjetas,
//      el combo, los otros valores, las filas de TaxiCun de la comparación, las opciones del plan del formulario, la
//      nota de arriba (la oculta si nombra un plan que ya no existe), las flotas y la respuesta de la permanencia; y
//      deja data-gps-fuente="api" y la versión en data-gps-version (el formulario la manda como planesVersion).
//    Las reglas de dibujo son las del generador (herramientas/generar-empresas.py): una prueba compara lo que pintan
//    los dos con los mismos datos. Solo nodos y textContent: ni innerHTML ni nada parecido, así que un texto de la API
//    nunca se vuelve HTML (y la página sirve con una CSP estricta y Trusted Types). Las etiquetas «borrador» siguen
//    a la página (data-gps-borrador), también sobre lo que llega de la API.
//
// 2) EL FORMULARIO «QUIERO GPS PARA MI TAXI». Contrato con el servidor (POST /api/gps/interes, mismo origen, sin
// cookies; el esquema es ESQUEMA_INTERES de src/gps/interes.js, cerrado: additionalProperties false; §14.2.3):
//   Cabeceras: Content-Type: application/json (el navegador pone Origin: https://taxicun.com y Sec-Fetch-Site).
//   Cuerpo (JSON, menos de 4 KB):
//     { "nombre": "2 a 80 caracteres, sin :// ni www.",
//       "celular": "10 dígitos: 3XXXXXXXXX o fijo 60XXXXXXXX, sin +57",
//       "correo": "" | "correo válido, hasta 120",
//       "municipio": "2 a 60 caracteres: el de la cooperativa elegida, o el que escribe si elige «Otra»",
//       "cooperativa": "<id de empresas/indice.json>" | "otra",
//       "placa": "ABC123" (3 letras y 3 números; SOLO si la escribe, si no, no va),
//       "taxis": 1 a 500 (entero),
//       "plan": "<id de un plan sin combo>" | "combo" | "no_se" (patrón ^[a-z][a-z0-9_]{1,23}$),
//       "planesVersion": versión de los precios que vio la persona (la de la API o la del respaldo), 1 a 1.000.000,
//       "mensaje": "" | "hasta 500 caracteres, sin :// ni www.",
//       "autorizo": true, "version": "1.0" (versión del texto de la casilla; el servidor guarda la huella de su copia),
//       "sitioWeb": "" (trampa: si llega lleno, el servidor lo descarta en silencio),
//       "tiempoMs": milisegundos desde que se abrió la página (menos de 3000: se descarta en silencio) }
//   Respuesta esperada: 200 {"ok": true} siempre (se guarde o no). Cualquier otra cosa (404 porque el servidor
//   todavía no tiene GPS, 4xx, 5xx, sin respuesta en 12 s o sin red) muestra el respaldo: escribir a
//   info@taxicun.com con el asunto «Quiero GPS para mi taxi» y lo llenado en el cuerpo del correo.
//
// La página no guarda nada en el navegador (ni localStorage, ni sessionStorage, ni cookies) y no pone datos en la
// dirección.
(function () {
  'use strict';
  var seccion = document.querySelector('[data-gps-fuente]');
  var cajaPlanes = document.querySelector('[data-gps-planes]');
  if (!seccion || !cajaPlanes || !window.fetch || !window.AbortController || !window.JSON) return;
  var API = seccion.getAttribute('data-gps-api') || '/api/gps/planes';
  var ESPERA_MS = 4000;
  var SVG = 'http://www.w3.org/2000/svg';
  var BORRADOR = seccion.getAttribute('data-gps-borrador') === 'true';
  var T = null;
  try { T = JSON.parse(seccion.getAttribute('data-gps-topes') || 'null'); } catch (e) { T = null; }

  function motivo(m) { seccion.setAttribute('data-gps-motivo', String(m).slice(0, 200)); }
  if (!T || typeof T !== 'object') { motivo('sin_topes'); return; }

  // ------------------------------------------------------------------ revisión (los topes y las reglas de §14.1.2)
  // Texto plano (S30, textoPlano de src/config-validar.js) más lo de la tienda: sin enlaces ni saltos de línea.
  // eslint-disable-next-line no-control-regex
  var PROHIBIDOS = /[<>`\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
  var ATRIBUTOS = 'on[a-z]+|style|src|srcset|srcdoc|href|xlink:href|formaction|action|background|poster|xmlns';
  var INYECCION = new RegExp('["\'][\\s/]*[a-z_:-]+\\s*=' + '|["\'][\\s\\S]*?(^|[^a-z0-9_:-])(' + ATRIBUTOS + ')\\s*=' +
    '|(javascript|vbscript)\\s*:' + '|^\\s*(data|blob|file)\\s*:' + '|(^|[^a-z\\u00C0-\\u024F])(data|blob|file):\\S', 'i');
  var ENLACE = /:\/\/|www\./i;
  var ID = new RegExp(T.idPatron);

  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function esEntero(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }
  function largo(t) { return Array.from(t).length; }
  function entre(v, r) { return esEntero(v) && v >= r[0] && v <= r[1]; }

  // Devuelve el primer problema («ruta código») o '' si cumple.
  function revisar(d) {
    var mal = '';
    function falla(ruta, codigo) { if (!mal) mal = ruta + ' ' + codigo; }
    function pesosOk(v, ruta, tope) {
      if (!esEntero(v)) falla(ruta, 'no_entero');
      else if (v % T.multiplo) falla(ruta, 'no_multiplo_100');
      else if (!entre(v, T[tope])) falla(ruta, 'fuera_de_tope');
    }
    function textoOk(v, ruta, tope) {
      if (typeof v !== 'string') falla(ruta, 'no_texto');
      else if (PROHIBIDOS.test(v) || INYECCION.test(v) || ENLACE.test(v)) falla(ruta, 'texto_no_permitido');
      else if (largo(v) < T[tope][0]) falla(ruta, 'texto_corto');
      else if (largo(v) > T[tope][1]) falla(ruta, 'texto_largo');
    }
    if (!esObjeto(d)) return '(cuerpo) no_objeto';
    if (!entre(d.version, T.version)) falla('version', 'fuera_de_tope');
    if (d.moneda !== 'COP') falla('moneda', 'no_cop');
    if (d.ivaIncluido !== true) falla('ivaIncluido', 'sin_iva');
    pesosOk(d.licenciaMes, 'licenciaMes', 'licenciaMes');
    if (!entre(d.flotasDesde, T.flotasDesde)) falla('flotasDesde', 'fuera_de_tope');
    if (!esObjeto(d.combo)) falla('combo', 'no_objeto');
    else { textoOk(d.combo.nombre, 'combo.nombre', 'comboNombre'); textoOk(d.combo.lema, 'combo.lema', 'comboLema'); }
    if (!Array.isArray(d.planes) || !d.planes.every(esObjeto)) return mal || 'planes no_lista';
    if (d.planes.length < T.planes[0] || d.planes.length > T.planes[1]) falla('planes', 'demasiados');
    var ids = {};
    var destacados = 0;
    var bases = 0;
    d.planes.forEach(function (p, i) {
      var r = 'planes[' + (typeof p.id === 'string' && ID.test(p.id) ? p.id : i) + ']';
      if (typeof p.id !== 'string' || !ID.test(p.id)) falla(r + '.id', 'id_invalido');
      else if (T.idsReservados.indexOf(p.id) !== -1) falla(r + '.id', 'id_reservado');
      else if (Object.prototype.hasOwnProperty.call(ids, p.id)) falla(r + '.id', 'id_repetido');
      else ids[p.id] = p;
      textoOk(p.nombre, r + '.nombre', 'nombre');
      textoOk(p.lema, r + '.lema', 'lema');
      if (p.equipo !== 'propio' && p.equipo !== 'comodato') falla(r + '.equipo', 'equipo_invalido');
      ['precioEquipo', 'instalacion', 'mes'].forEach(function (c) { pesosOk(p[c], r + '.' + c, c); });
      if (!entre(p.permanenciaMeses, T.permanenciaMeses)) falla(r + '.permanenciaMeses', 'fuera_de_tope');
      if (typeof p.destacado !== 'boolean') falla(r + '.destacado', 'no_booleano');
      if (p.destacado === true) destacados += 1;
      if (!Array.isArray(p.condiciones)) falla(r + '.condiciones', 'no_lista');
      else {
        if (p.condiciones.length < T.condiciones[0] || p.condiciones.length > T.condiciones[1]) falla(r + '.condiciones', 'demasiados');
        p.condiciones.forEach(function (c, j) { textoOk(c, r + '.condiciones[' + j + ']', 'condicion'); });
      }
      if (p.equipo === 'comodato' && p.precioEquipo !== 0) falla(r + '.precioEquipo', 'comodato_con_precio');
      if (esEntero(p.precioEquipo) && esEntero(p.instalacion) && esEntero(p.mes)) {
        if (p.alInstalar !== p.precioEquipo + p.instalacion) falla(r + '.alInstalar', 'no_cuadra');
        else if (p.primerAnio !== p.alInstalar + 12 * p.mes) falla(r + '.primerAnio', 'no_cuadra');
      }
      if (p.combo === null) bases += 1;
      else if (!esObjeto(p.combo) || typeof p.combo.base !== 'string') falla(r + '.combo', 'combo_sin_base');
    });
    if (destacados > 1) falla('planes', 'destacado_repetido');
    if (!bases) falla('planes', 'sin_plan_base');
    d.planes.forEach(function (p) {
      if (!esObjeto(p.combo) || typeof p.combo.base !== 'string') return;
      var r = 'planes[' + p.id + '].combo';
      var base = Object.prototype.hasOwnProperty.call(ids, p.combo.base) ? ids[p.combo.base] : null;
      if (!base || base.combo !== null || base.equipo !== p.equipo || !esEntero(base.permanenciaMeses) || !esEntero(p.permanenciaMeses)
        || p.permanenciaMeses < base.permanenciaMeses) { falla(r, 'combo_sin_base'); return; }
      if (esEntero(base.mes) && esEntero(d.licenciaMes) && esEntero(p.mes)) {
        var ahorro = base.mes + d.licenciaMes - p.mes;
        if (p.combo.ahorroMes !== ahorro) falla(r + '.ahorroMes', 'no_cuadra');
        else if (ahorro < T.ahorroMesMin) falla(r + '.ahorroMes', 'combo_sin_ahorro');
      }
    });
    if (!Array.isArray(d.extras) || !d.extras.every(esObjeto)) falla('extras', 'no_lista');
    else {
      if (d.extras.length < T.extras[0] || d.extras.length > T.extras[1]) falla('extras', 'demasiados');
      d.extras.forEach(function (e, j) {
        textoOk(e.texto, 'extras[' + j + '].texto', 'extraTexto');
        pesosOk(e.valor, 'extras[' + j + '].valor', 'extraValor');
      });
    }
    return mal;
  }

  // ------------------------------------------------------------------ dibujo (las reglas de generar-empresas.py)
  function pesos(n) { return '$' + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function meses(n) { return n + (n === 1 ? ' mes' : ' meses'); }
  function permanencia(n) { return n === 0 ? 'Sin permanencia.' : 'Permanencia de ' + meses(n) + '.'; }
  function desglose(p) {
    if (p.precioEquipo > 0 && p.instalacion > 0) return 'equipo ' + pesos(p.precioEquipo) + ' + instalación ' + pesos(p.instalacion);
    return p.alInstalar === 0 ? 'instalación incluida' : '';
  }
  function notaCompara(p) {
    if (p.alInstalar === 0) return 'instalación incluida';
    if (p.precioEquipo > 0 && p.instalacion > 0) return 'equipo e instalación';
    return p.precioEquipo > 0 ? 'equipo, con la instalación incluida' : 'instalación';
  }
  function faqPermanencia(planes) {
    var porId = {};
    planes.forEach(function (p) { porId[p.id] = p; });
    var partes = [];
    planes.forEach(function (p) {
      if (p.combo !== null) return;
      var n = p.permanenciaMeses;
      partes.push(n === 0 ? 'En «' + p.nombre + '», no.'
        : 'En «' + p.nombre + '», ' + meses(n) + (p.equipo === 'comodato' ? ', porque el equipo es nuestro' : '') + '.');
    });
    var combos = planes.filter(function (p) { return p.combo !== null; });
    if (combos.length && combos.every(function (c) { return c.permanenciaMeses === porId[c.combo.base].permanenciaMeses; })) {
      partes.push('En el combo, la misma del plan del equipo.');
    } else {
      combos.forEach(function (c) { partes.push('En el combo «' + c.nombre + '», ' + (c.permanenciaMeses === 0 ? 'no' : meses(c.permanenciaMeses)) + '.'); });
    }
    return partes.join(' ');
  }

  // Un elemento con sus atributos (en orden) y sus hijos (nodos o textos, que van como texto).
  function el(etiqueta, atributos, hijos) {
    var n = document.createElement(etiqueta);
    (atributos || []).forEach(function (a) { n.setAttribute(a[0], a[1]); });
    (hijos || []).forEach(function (h) { if (h !== null && h !== undefined) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }
  function icono(cual) {
    var s = document.createElementNS(SVG, 'svg');
    s.setAttribute('class', 'icono');
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(SVG, 'use');
    u.setAttribute('href', '#i-' + cual);
    s.appendChild(u);
    return s;
  }
  function precio(valor, conEtiqueta) {
    return el('dd', [], conEtiqueta && BORRADOR ? [pesos(valor) + ' ', el('span', [['class', 'etiqueta-borrador']], ['borrador'])] : [pesos(valor)]);
  }
  function fila(titulo, dds, clase) { return el('div', clase ? [['class', clase]] : [], [el('dt', [], [titulo])].concat(dds)); }
  function condicion(texto) { return el('li', [], [icono('check'), texto]); }

  function tarjeta(p) {
    var d = desglose(p);
    return el('article', [['class', 'gps-plan' + (p.destacado ? ' gps-plan-destacado' : '')], ['aria-labelledby', 'plan-' + p.id]], [
      el('h3', [['id', 'plan-' + p.id]], [p.nombre]),
      p.lema ? el('p', [['class', 'gps-plan-lema']], [p.lema]) : null,
      el('dl', [['class', 'gps-precios']], [
        fila('Al instalar', [precio(p.alInstalar, true), d ? el('dd', [['class', 'gps-desglose']], [d]) : null]),
        fila('Cada mes', [precio(p.mes, true)], 'gps-precio-mes'),
        fila('Primer año', [precio(p.primerAnio, false)]),
      ]),
      el('ul', [['class', 'gps-condiciones']], [condicion(permanencia(p.permanenciaMeses))].concat(p.condiciones.map(condicion))),
    ]);
  }

  function tarjetaCombo(d, combos) {
    return el('article', [['class', 'gps-plan gps-plan-combo'], ['aria-labelledby', 'plan-combo']], [
      el('h3', [['id', 'plan-combo']], [d.combo.nombre]),
      d.combo.lema ? el('p', [['class', 'gps-plan-lema']], [d.combo.lema]) : null,
    ].concat(combos.map(function (c) {
      return el('div', [['class', 'gps-variante']], [
        el('h4', [], [c.nombre]),
        el('dl', [['class', 'gps-precios']], [fila('Al instalar', [precio(c.alInstalar, true)]), fila('Cada mes', [precio(c.mes, true)], 'gps-precio-mes')]),
        el('p', [['class', 'gps-ahorro']], ['Te ahorras ' + pesos(c.combo.ahorroMes) + ' al mes frente a pagarlos por separado.']),
      ]);
    })).concat([
      el('p', [['class', 'gps-plan-pie']], ['Incluye la licencia de TaxiCun para ese taxi (Plan B, ' + pesos(d.licenciaMes) + ' al mes) y las mismas condiciones del plan del equipo.']),
    ]));
  }

  function filaCompara(p) {
    return el('tr', [['class', 'gps-fila-taxicun'], ['data-gps-compara', '']], [
      el('th', [['scope', 'row']], ['TaxiCun GPS · ' + p.nombre]),
      el('td', [['data-titulo', 'Al instalar']], [pesos(p.alInstalar), el('small', [], [notaCompara(p)])]),
      el('td', [['data-titulo', 'Cada mes']], [pesos(p.mes)]),
      el('td', [['data-titulo', 'Primer año']], [el('b', [], [pesos(p.primerAnio)])]),
    ]);
  }

  function opcion(valor, texto, marcada) {
    var atributos = [['type', 'radio'], ['name', 'plan'], ['value', valor]];
    if (marcada) atributos.push(['checked', '']);
    return el('label', [], [el('input', atributos), el('span', [], [texto])]);
  }

  function reemplazar(caja, nodos) {
    while (caja.firstChild) caja.removeChild(caja.firstChild);
    nodos.forEach(function (n) { caja.appendChild(n); });
  }

  // Arma TODO primero; si algo falla aquí, no se cambió nada. Después reemplaza de una vez.
  function pintar(d) {
    var bases = d.planes.filter(function (p) { return p.combo === null; });
    var combos = d.planes.filter(function (p) { return p.combo !== null; });
    var porId = {};
    d.planes.forEach(function (p) { porId[p.id] = p; });
    var cambios = [];

    var tarjetas = bases.map(tarjeta);
    if (combos.length) tarjetas.push(tarjetaCombo(d, combos));
    cambios.push(function () { reemplazar(cajaPlanes, tarjetas); });

    var cajaExtras = document.querySelector('[data-gps-extras]');
    if (cajaExtras) {
      var extras = d.extras.map(function (e) { return el('li', [], [el('span', [], [e.texto]), el('b', [], [pesos(e.valor)])]); });
      cambios.push(function () {
        reemplazar(cajaExtras, extras);
        if (cajaExtras.parentNode) { if (extras.length) cajaExtras.parentNode.removeAttribute('hidden'); else cajaExtras.parentNode.setAttribute('hidden', ''); }
      });
    }

    var viejas = Array.prototype.slice.call(document.querySelectorAll('tr[data-gps-compara]'));
    if (viejas.length) {
      var cuerpo = viejas[0].parentNode;
      var filas = bases.map(filaCompara);
      cambios.push(function () {
        viejas.forEach(function (f) { f.parentNode.removeChild(f); });
        var primera = cuerpo.firstElementChild;
        filas.forEach(function (f) { cuerpo.insertBefore(f, primera); });
      });
    }

    var cajaOpciones = document.querySelector('[data-gps-opciones-plan]');
    if (cajaOpciones) {
      var elegida = cajaOpciones.querySelector('input[name="plan"]:checked');
      var valorElegido = elegida ? elegida.value : 'no_se';
      var opciones = bases.map(function (p) { return opcion(p.id, p.nombre, false); });
      if (combos.length) opciones.push(opcion('combo', 'Combo con TaxiCun', false));
      opciones.push(opcion('no_se', 'No sé todavía', true));
      cambios.push(function () {
        reemplazar(cajaOpciones, opciones);
        var sigue = Array.prototype.filter.call(cajaOpciones.querySelectorAll('input[name="plan"]'), function (i) { return i.value === valorElegido; })[0];
        if (sigue) sigue.checked = true;
      });
    }

    var nota = document.querySelector('[data-gps-nota]');
    if (nota) {
      var marcas = Array.prototype.slice.call(nota.querySelectorAll('[data-gps]'));
      var valores = marcas.map(function (m) {
        var partes = (m.getAttribute('data-gps') || '').split('.');
        var p = Object.prototype.hasOwnProperty.call(porId, partes[0]) ? porId[partes[0]] : null;
        return p && p.combo === null && esEntero(p[partes[1]]) ? pesos(p[partes[1]]) : null;
      });
      cambios.push(function () {
        if (valores.indexOf(null) !== -1) { nota.setAttribute('hidden', ''); return; }
        marcas.forEach(function (m, i) { m.textContent = valores[i]; });
        nota.removeAttribute('hidden');
      });
    }

    var flotas = document.querySelector('[data-gps-flotas]');
    if (flotas) cambios.push(function () { flotas.textContent = String(d.flotasDesde); });
    var faq = document.querySelector('[data-gps-faq-permanencia]');
    if (faq) {
      var respuesta = faqPermanencia(d.planes);
      cambios.push(function () { faq.textContent = respuesta; });
    }

    cambios.forEach(function (c) { c(); });
    seccion.setAttribute('data-gps-fuente', 'api');
    seccion.setAttribute('data-gps-version', String(d.version));
    seccion.removeAttribute('data-gps-motivo');
  }

  // ------------------------------------------------------------------ el pedido
  function Falla(m) { this.motivo = m; }
  function bytes(t) { return window.TextEncoder ? new TextEncoder().encode(t).length : t.length * 3; }
  var control = new AbortController();
  var reloj = setTimeout(function () { control.abort(); }, ESPERA_MS);
  fetch(API, {
    method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-cache', redirect: 'error', signal: control.signal,
  })
    .then(function (r) {
      if (r.status !== 200) throw new Falla('http_' + r.status);
      if (!/^application\/json\b/i.test(r.headers.get('content-type') || '')) throw new Falla('no_json');
      return r.text();
    })
    .then(function (t) {
      if (bytes(t) > T.bytes) throw new Falla('grande');
      var d;
      try { d = JSON.parse(t); } catch (e) { throw new Falla('json_malo'); }
      var mal;
      try { mal = revisar(d); } catch (e) { mal = '(topes) no_se_pudo_revisar'; }
      if (mal) throw new Falla('invalido ' + mal);
      if (control.signal.aborted) throw new Falla('sin_respuesta');
      // pintar() arma todo antes de tocar la página: si algo falla al armar, queda el respaldo entero.
      try { pintar(d); } catch (e) { throw new Falla('no_se_pudo_pintar'); }
    })
    .catch(function (e) {
      motivo(e instanceof Falla ? e.motivo : control.signal.aborted ? 'sin_respuesta' : 'sin_red');
    })
    .then(function () { clearTimeout(reloj); });
}());

(function () {
  'use strict';
  var form = document.getElementById('formulario-gps');
  if (!form || !window.fetch) return;
  var listo = document.getElementById('gps-listo');
  var respaldo = document.getElementById('gps-respaldo');
  var enlaceRespaldo = respaldo ? respaldo.querySelector('.gps-respaldo-correo') : null;
  var reintentar = respaldo ? respaldo.querySelector('.gps-reintentar') : null;
  var estado = form.querySelector('.gps-estado');
  var boton = form.querySelector('.gps-enviar');
  var textoBoton = boton ? boton.querySelector('span') : null;
  var ENDPOINT = form.getAttribute('data-endpoint') || '/api/gps/interes';
  var CORREO = form.getAttribute('data-correo') || 'info@taxicun.com';
  var ESPERA_MS = 12000;
  var ENLACE = /:\/\/|www\./i;
  var enviando = false;

  form.hidden = false;

  var campos = {
    nombre: form.elements.nombre,
    celular: form.elements.celular,
    correo: form.elements.correo,
    cooperativa: form.elements.cooperativa,
    municipio: form.elements.municipio,
    placa: form.elements.placa,
    taxis: form.elements.taxis,
    mensaje: form.elements.mensaje,
    autorizacion: form.elements.autorizacion,
  };

  function limpio(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
  function soloDigitos(t) { return String(t || '').replace(/\D/g, ''); }

  function celularNormal(t) {
    var d = soloDigitos(t);
    if (d.length === 12 && d.indexOf('57') === 0) d = d.slice(2);
    return d;
  }
  function placaNormal(t) { return String(t || '').toUpperCase().replace(/[\s.\-]/g, ''); }

  // Cada regla devuelve el mensaje de error, o '' si está bien.
  var reglas = {
    nombre: function (v) {
      v = limpio(v);
      if (!v) return 'Escribe tu nombre.';
      if (ENLACE.test(v)) return 'Escribe solo tu nombre, sin enlaces.';
      if (v.length < 2 || !/[a-záéíóúüñ]/i.test(v)) return 'Escribe tu nombre completo.';
      if (v.length > 80) return 'El nombre puede tener hasta 80 caracteres.';
      return '';
    },
    celular: function (v) {
      if (!limpio(v)) return 'Escribe tu celular.';
      return /^(3\d{9}|60[1-8]\d{7})$/.test(celularNormal(v)) ? '' : 'Escribe un celular de 10 dígitos que empiece por 3 (o un fijo que empiece por 60).';
    },
    correo: function (v) {
      v = limpio(v);
      if (!v) return '';
      return v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Revisa el correo: parece incompleto.';
    },
    cooperativa: function (v) { return v ? '' : 'Elige tu municipio y tu cooperativa, o «Otra».'; },
    municipio: function (v) {
      if (campos.cooperativa.value !== 'otra') return '';
      v = limpio(v);
      if (!v) return 'Escribe tu municipio.';
      if (ENLACE.test(v)) return 'Escribe solo el nombre del municipio.';
      return v.length >= 2 && v.length <= 60 ? '' : 'Escribe el nombre del municipio.';
    },
    placa: function (v) {
      v = placaNormal(v);
      if (!v) return '';
      return /^[A-Z]{3}\d{3}$/.test(v) ? '' : 'La placa son 3 letras y 3 números, como TAX123.';
    },
    taxis: function (v) {
      var t = String(v || '').trim();
      return /^\d{1,3}$/.test(t) && +t >= 1 && +t <= 500 ? '' : 'Escribe cuántos taxis: de 1 a 500.';
    },
    mensaje: function (v) {
      v = String(v || '').trim();
      if (v.length > 500) return 'El mensaje puede tener hasta 500 caracteres.';
      return ENLACE.test(v) ? 'Quita los enlaces del mensaje.' : '';
    },
    autorizacion: function (_v, el) { return el.checked ? '' : 'Para llamarte necesitamos tu autorización.'; },
  };

  function mostrarError(nombre, mensaje) {
    var el = campos[nombre];
    var caja = document.getElementById(el.id + '-error');
    if (mensaje) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    if (caja) { caja.textContent = mensaje; caja.hidden = !mensaje; }
  }

  function revisar(nombre) {
    var el = campos[nombre];
    var mensaje = reglas[nombre](el.value, el);
    mostrarError(nombre, mensaje);
    return mensaje;
  }

  // Al tocar «Quiero que me llamen» no se revisa el campo que se deja: el mensaje de error correría el botón hacia
  // abajo entre el toque y el clic, y el clic se perdería (el envío revisa todo de todas formas).
  var tocandoEnviar = false;
  if (boton) {
    boton.addEventListener('pointerdown', function () {
      tocandoEnviar = true;
      setTimeout(function () { tocandoEnviar = false; }, 1500);
    });
  }

  Object.keys(campos).forEach(function (nombre) {
    var el = campos[nombre];
    if (!el) return;
    // Al corregir se quita el error; al salir del campo se revisa (solo si ya tiene algo o ya tenía error).
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', function () {
      if (el.getAttribute('aria-invalid') === 'true') revisar(nombre);
    });
    el.addEventListener('blur', function (evento) {
      if (tocandoEnviar || evento.relatedTarget === boton) return;
      if (el.type !== 'checkbox' && (el.value || el.getAttribute('aria-invalid') === 'true')) revisar(nombre);
    });
  });

  // «Otra / no estoy en una»: se pide el municipio (con una cooperativa de la lista, sale de ella).
  var cajaMunicipio = document.getElementById('g-municipio-caja');
  function verMunicipio() {
    var otra = campos.cooperativa.value === 'otra';
    if (cajaMunicipio) cajaMunicipio.hidden = !otra;
    campos.municipio.required = otra;
    if (!otra) mostrarError('municipio', '');
  }
  campos.cooperativa.addEventListener('change', verMunicipio);
  verMunicipio();

  function municipioElegido() {
    if (campos.cooperativa.value === 'otra') return limpio(campos.municipio.value);
    var opcion = campos.cooperativa.selectedOptions && campos.cooperativa.selectedOptions[0];
    return opcion ? opcion.getAttribute('data-municipio') || '' : '';
  }

  function planElegido() {
    var p = form.querySelector('input[name="plan"]:checked');
    return p ? p.value : 'no_se';
  }

  function datos() {
    var d = {
      nombre: limpio(campos.nombre.value),
      celular: celularNormal(campos.celular.value),
      correo: limpio(campos.correo.value),
      municipio: municipioElegido(),
      cooperativa: campos.cooperativa.value,
      taxis: parseInt(String(campos.taxis.value).trim(), 10),
      plan: planElegido(),
      mensaje: String(campos.mensaje.value || '').replace(/\r\n?/g, '\n').trim(),
      autorizo: true,
      version: form.getAttribute('data-autorizacion-version') || '',
      sitioWeb: form.elements.sitioWeb ? form.elements.sitioWeb.value : '',
      tiempoMs: Math.round(window.performance && performance.now ? performance.now() : 0),
    };
    // La versión de los precios que vio la persona: la de la API, si se pintó, o la del respaldo.
    var seccionPlanes = document.querySelector('[data-gps-version]');
    var version = seccionPlanes ? parseInt(seccionPlanes.getAttribute('data-gps-version'), 10) : NaN;
    if (version >= 1 && version <= 1000000) d.planesVersion = version;
    var placa = placaNormal(campos.placa.value);
    if (placa) d.placa = placa;
    return d;
  }

  // El respaldo: el correo a info@ con el asunto puesto y lo que llenó la persona (no pasa por ningún servidor).
  function correoRespaldo(d) {
    var opcion = campos.cooperativa.selectedOptions && campos.cooperativa.selectedOptions[0];
    var plan = form.querySelector('input[name="plan"]:checked');
    var lineas = [
      'Hola, quiero GPS para mi taxi.',
      '',
      'Nombre: ' + d.nombre,
      'Celular: ' + d.celular,
      d.correo ? 'Correo: ' + d.correo : null,
      'Municipio y cooperativa: ' + (d.cooperativa === 'otra' ? d.municipio + ' (otra cooperativa o ninguna)' : (opcion ? limpio(opcion.textContent) : '')),
      d.placa ? 'Placa: ' + d.placa : null,
      '¿Cuántos taxis?: ' + d.taxis,
      'Plan que me interesa: ' + (plan ? limpio(plan.parentNode.textContent) : 'No sé todavía'),
      d.mensaje ? 'Mensaje: ' + d.mensaje : null,
      '',
      'Autorizo a interOS S.A.S. a usar estos datos para contactarme sobre TaxiCun GPS (taxicun.com/gps).',
    ].filter(function (l) { return l !== null; });
    return 'mailto:' + CORREO + '?subject=' + encodeURIComponent('Quiero GPS para mi taxi') + '&body=' + encodeURIComponent(lineas.join('\n'));
  }

  function ocupado(si) {
    enviando = si;
    if (boton) { boton.disabled = si; boton.setAttribute('aria-busy', si ? 'true' : 'false'); }
    if (textoBoton) textoBoton.textContent = si ? 'Enviando…' : 'Quiero que me llamen';
    if (estado) estado.textContent = si ? 'Enviando tus datos…' : '';
  }

  function mostrar(caja) {
    form.hidden = true;
    caja.hidden = false;
    caja.focus();
    caja.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function exito() { mostrar(listo); }

  function fallo(d) {
    if (enlaceRespaldo) enlaceRespaldo.setAttribute('href', correoRespaldo(d));
    mostrar(respaldo);
  }

  if (reintentar) {
    reintentar.addEventListener('click', function () {
      respaldo.hidden = true;
      form.hidden = false;
      if (boton) boton.focus();
    });
  }

  form.addEventListener('submit', function (evento) {
    evento.preventDefault();
    tocandoEnviar = false;
    if (enviando) return;
    var primero = null;
    Object.keys(reglas).forEach(function (nombre) {
      if (revisar(nombre) && !primero) primero = campos[nombre];
    });
    if (primero) {
      if (estado) estado.textContent = 'Revisa los campos marcados.';
      primero.focus();
      return;
    }
    var d = datos();
    ocupado(true);
    var control = window.AbortController ? new AbortController() : null;
    // data-espera-ms solo lo usan las pruebas (para no esperar los 12 s).
    var espera = parseInt(form.getAttribute('data-espera-ms'), 10) || ESPERA_MS;
    var reloj = setTimeout(function () { if (control) control.abort(); }, espera);
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: control ? control.signal : undefined,
    })
      .then(function (r) {
        var tipo = r.headers.get('content-type') || '';
        if (!r.ok || tipo.indexOf('application/json') === -1) throw new Error('respuesta ' + r.status);
        return r.json();
      })
      .then(function (cuerpo) {
        if (!cuerpo || cuerpo.ok !== true) throw new Error('sin ok');
        exito();
      })
      .catch(function () { fallo(d); })
      .then(function () { clearTimeout(reloj); ocupado(false); });
  });
}());
