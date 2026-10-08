// Tienda TaxiCun GPS (gps/index.html; va en gps/ y no en web/ para no entrar en el mapa de importaciones de las
// páginas con módulos): el formulario «Quiero GPS para mi taxi».
//
// Contrato con el servidor (POST /api/gps/interes, mismo origen, sin cookies; el esquema es ESQUEMA_INTERES de
// src/gps/interes.js en la rama gps del servidor, cerrado: additionalProperties false):
//   Cabeceras: Content-Type: application/json (el navegador pone Origin: https://taxicun.com y Sec-Fetch-Site).
//   Cuerpo (JSON, menos de 4 KB):
//     { "nombre": "2 a 80 caracteres, sin :// ni www.",
//       "celular": "10 dígitos: 3XXXXXXXXX o fijo 60XXXXXXXX, sin +57",
//       "correo": "" | "correo válido, hasta 120",
//       "municipio": "2 a 60 caracteres: el de la cooperativa elegida, o el que escribe si elige «Otra»",
//       "cooperativa": "<id de empresas/indice.json>" | "otra",
//       "placa": "ABC123" (3 letras y 3 números; SOLO si la escribe, si no, no va),
//       "taxis": 1 a 500 (entero),
//       "plan": "compra" | "sin_cuota" | "combo" | "no_se",
//       "mensaje": "" | "hasta 500 caracteres, sin :// ni www.",
//       "autorizo": true, "version": "1.0" (versión del texto de la casilla; el servidor guarda la huella de su copia),
//       "sitioWeb": "" (trampa: si llega lleno, el servidor lo descarta en silencio),
//       "tiempoMs": milisegundos desde que se abrió la página (menos de 3000: se descarta en silencio) }
//   Respuesta esperada: 200 {"ok": true} siempre (se guarde o no). Cualquier otra cosa (404 porque el servidor
//   todavía no tiene GPS, 4xx, 5xx, sin respuesta en 12 s o sin red) muestra el respaldo: escribir a
//   info@taxicun.com con el asunto «Quiero GPS para mi taxi» y lo llenado en el cuerpo del correo.
//
// La página no guarda nada en el navegador (ni localStorage ni cookies), no pone datos en la dirección y no
// usa innerHTML: solo textContent (sirve con una CSP estricta y con Trusted Types).
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
