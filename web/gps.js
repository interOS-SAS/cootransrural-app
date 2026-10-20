// GPS y monitoreo de flotas (gps/): la demo de la plataforma y «Cotiza».
//
// La demo es una SIMULACIÓN en el navegador (no habla con ningún servidor): cuatro vehículos de prueba recorren un mapa
// dibujado aquí; se escoge uno para ver sus datos y sus cámaras (escenas dibujadas) y se prueba el apagado del motor a
// distancia (confirmar → la orden llega al equipo → el vehículo se detiene → motor apagado → habilitar). Las alertas
// salen de una lista fija. Sin movimiento si la persona lo pidió (prefers-reduced-motion) y en pausa fuera de la vista.
//
// «Cotiza» no tiene formulario en el servidor: arma un correo a info@taxicun.com con lo que la persona escogió.
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const QUIETO = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const nodo = (tag, attrs = {}, padre = null) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (padre) padre.appendChild(n);
    return n;
  };
  const icono = (id, clase = 'icono') => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"/></svg>`;
  const hora = (d = new Date()) => d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const horaCorta = (d = new Date()) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true });

  /* ================================ Demo ================================ */
  function iniciarDemo(raiz) {
    const mapa = $('[data-mapa]', raiz);
    const lista = $('[data-lista]', raiz);
    const detalle = $('[data-detalle]', raiz);
    const camaras = $('[data-camaras]', raiz);
    const alertas = $('[data-alertas]', raiz);
    const reloj = $('[data-reloj]', raiz);
    const resumen = $('[data-resumen]', raiz);

    // ---- El mapa (800 × 520): río, parques, el pueblo en cuadrícula y la vía principal ----
    nodo('rect', { width: 800, height: 520, fill: '#E9EEF5' }, mapa);
    nodo('path', { d: 'M -20 120 C 120 150 200 60 320 90 S 420 230 340 330 S 380 520 460 560', fill: 'none', stroke: '#BFDBFE', 'stroke-width': 22, 'stroke-linecap': 'round' }, mapa);
    for (const [x, y, w, h] of [[512, 196, 52, 128], [676, 356, 48, 48], [60, 250, 110, 70]]) nodo('rect', { x, y, width: w, height: h, rx: 8, fill: '#D9F2DF' }, mapa);
    const calles = nodo('g', { stroke: '#fff', 'stroke-width': 11, 'stroke-linecap': 'round', fill: 'none' }, mapa);
    for (const x of [420, 500, 580, 660, 740]) nodo('path', { d: `M ${x} 40 V 480` }, calles);
    for (const y of [100, 180, 260, 340, 420]) nodo('path', { d: `M 390 ${y} H 780` }, calles);
    nodo('path', { d: 'M 40 -10 C 70 120 30 260 110 360 S 260 470 300 540', stroke: '#fff' }, calles);
    const VIA = 'M -20 470 C 100 450 180 380 260 320 S 360 262 420 260';
    nodo('path', { d: VIA, fill: 'none', stroke: '#E8B923', 'stroke-width': 17, 'stroke-linecap': 'round' }, mapa);
    nodo('path', { d: VIA, fill: 'none', stroke: '#FCD34D', 'stroke-width': 12, 'stroke-linecap': 'round' }, mapa);
    // Zonas (geocercas)
    nodo('rect', { x: 548, y: 228, width: 64, height: 64, rx: 10, fill: 'rgba(26,79,160,.08)', stroke: '#1A4FA0', 'stroke-width': 2.5, 'stroke-dasharray': '7 6' }, mapa);
    nodo('rect', { x: 628, y: 148, width: 64, height: 64, rx: 10, fill: 'rgba(22,163,74,.08)', stroke: '#16A34A', 'stroke-width': 2.5, 'stroke-dasharray': '7 6' }, mapa);
    const etiquetas = nodo('g', { 'font-family': 'Plus Jakarta Sans, system-ui, sans-serif', 'font-weight': 800, 'font-size': 13, fill: '#475569' }, mapa);
    for (const [x, y, t, color] of [[580, 222, 'Terminal', '#1A4FA0'], [660, 142, 'Colegio', '#16A34A'], [700, 470, 'Centro', '#475569'], [120, 404, 'Vía principal', '#8A6A00'], [96, 245, 'Parque', '#3F7A4E']]) {
      const e = nodo('text', { x, y, 'text-anchor': 'middle', fill: color, 'paint-order': 'stroke', stroke: '#E9EEF5', 'stroke-width': 4 }, etiquetas);
      e.textContent = t;
    }

    // ---- Vehículos de prueba: cada uno sigue un recorrido (ida y vuelta, o un círculo) ----
    const RUTAS = {
      inter: { d: `${VIA} L 580 260 L 580 180`, vuelta: false },
      urbano: { d: 'M 420 100 L 740 100 L 740 420 L 420 420 Z', vuelta: true },
      escolar: { d: 'M 500 420 L 500 180 L 660 180 L 660 340 L 740 340', vuelta: false },
      taxi: { d: 'M 420 180 L 500 180 L 500 340 L 660 340 L 660 420', vuelta: false },
    };
    const VEHICULOS = [
      { id: 'BUS 101', ic: 'i-bus', tipo: 'Bus intermunicipal', ruta: 'inter', vmax: 78, conductor: 'Carlos R.', bateria: '12,8 V', camaras: 4, fase: 0.05 },
      { id: 'ESC 204', ic: 'i-escolar', tipo: 'Ruta escolar', ruta: 'escolar', vmax: 34, conductor: 'Martha L.', bateria: '24,6 V', camaras: 4, fase: 0.3 },
      { id: 'BTA 012', ic: 'i-buseta', tipo: 'Buseta urbana · Ruta 3', ruta: 'urbano', vmax: 32, conductor: 'Jhon F.', bateria: '12,6 V', camaras: 4, fase: 0.55 },
      { id: 'TAXI 045', ic: 'i-taxi', tipo: 'Taxi', ruta: 'taxi', vmax: 38, conductor: 'Luis A.', bateria: '12,4 V', camaras: 2, fase: 0.8 },
    ];
    const capaMarcas = nodo('g', {}, mapa);
    const vehs = VEHICULOS.map((v, i) => {
      const r = RUTAS[v.ruta];
      const camino = nodo('path', { d: r.d, fill: 'none', stroke: 'none' }, mapa);
      const largo = camino.getTotalLength();
      const g = nodo('g', { class: 'gps-marcador' }, capaMarcas);
      nodo('circle', { class: 'gps-m-halo', r: 24 }, g);
      nodo('circle', { class: 'gps-m-fondo', r: 13 }, g);
      const flecha = nodo('path', { class: 'gps-m-flecha', d: 'M 0 -7 L 5.5 5 L 0 2.2 L -5.5 5 Z' }, g);
      const txt = nodo('text', { y: -21, 'text-anchor': 'middle' }, g);
      txt.textContent = v.id;
      g.addEventListener('click', () => elegir(i));
      return {
        ...v, camino, largo, vuelta: r.vuelta, g, flecha, pos: largo * v.fase, dir: 1, vel: v.vmax * 0.7,
        paradaHasta: 0, siguienteParada: performance.now() + 6000 + i * 4000, motor: 'encendido', confirmando: false, cambioEn: 0,
        km: [86.4, 41.2, 63.8, 112.5][i] || 50, ang: 0, x: 0, y: 0,
      };
    });

    // ---- La lista ----
    lista.innerHTML = vehs.map((v, i) => `
      <li><button type="button" class="gps-vehiculo" data-i="${i}" aria-pressed="false">
        <span class="gps-vehiculo-ic">${icono(v.ic)}</span>
        <span><b>${esc(v.id)}</b><small data-sub><span class="gps-estado gps-estado-mov"></span>${esc(v.tipo)}</small></span>
        <span class="gps-vehiculo-vel"><span data-vel>0</span><small>km/h</small></span>
      </button></li>`).join('');
    lista.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (b) elegir(Number(b.dataset.i));
    });

    // ---- Movimiento ----
    const ESTADO_TXT = { mov: 'En movimiento', det: 'Detenido', apagado: 'Motor apagado' };
    const estadoDe = (v) => (v.motor === 'apagado' ? 'apagado' : v.vel < 2 ? 'det' : 'mov');
    function colocar(v) {
      const p = v.camino.getPointAtLength(v.pos);
      const q = v.camino.getPointAtLength(Math.min(v.largo, Math.max(0, v.pos + v.dir * 2)));
      if (q.x !== p.x || q.y !== p.y) v.ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90;
      v.x = p.x;
      v.y = p.y;
      v.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      v.flecha.setAttribute('transform', `rotate(${v.ang.toFixed(0)})`);
    }
    function mover(v, dt, ahora) {
      let objetivo = v.vmax * (0.72 + 0.28 * Math.sin(ahora / 2300 + v.fase * 9));
      if (v.motor === 'apagando' || v.motor === 'apagado') objetivo = 0;
      else if (ahora < v.paradaHasta) objetivo = 0;
      else if (ahora > v.siguienteParada) {
        v.paradaHasta = ahora + 2500 + Math.random() * 2500;
        v.siguienteParada = v.paradaHasta + 9000 + Math.random() * 9000;
      }
      const cambio = (objetivo > v.vel ? 14 : v.motor === 'apagando' ? 22 : 30) * dt;
      v.vel = objetivo > v.vel ? Math.min(objetivo, v.vel + cambio) : Math.max(objetivo, v.vel - cambio);
      if (v.motor === 'apagando' && v.vel < 0.5) apagado(v);
      const avance = v.vel * 0.75 * dt;
      v.km += (v.vel * dt) / 3600;
      v.pos += v.dir * avance;
      if (v.vuelta) v.pos = ((v.pos % v.largo) + v.largo) % v.largo;
      else if (v.pos > v.largo) { v.pos = v.largo; v.dir = -1; v.paradaHasta = ahora + 3000; }
      else if (v.pos < 0) { v.pos = 0; v.dir = 1; v.paradaHasta = ahora + 3000; }
      colocar(v);
    }

    // ---- Detalle del vehículo elegido ----
    let elegido = 0;
    function elegir(i) {
      elegido = i;
      lista.querySelectorAll('[data-i]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.i) === i)));
      vehs.forEach((v, k) => v.g.classList.toggle('elegido', k === i));
      pintarDetalle();
      pintarCamaras();
    }
    function pintarDetalle() {
      const v = vehs[elegido];
      detalle.innerHTML = `
        <div class="gps-detalle-cab"><span class="gps-vehiculo-ic">${icono(v.ic)}</span><div><h3>${esc(v.id)}</h3><p>${esc(v.tipo)} · ${esc(v.conductor)}</p></div></div>
        <dl class="gps-datos">
          <div><dt>Velocidad</dt><dd data-d-vel>—</dd></div>
          <div><dt>Estado</dt><dd data-d-estado>—</dd></div>
          <div><dt>Batería</dt><dd>${esc(v.bateria)}</dd></div>
          <div><dt>Hoy</dt><dd data-d-km>—</dd></div>
          <div><dt>Última señal</dt><dd data-d-senal>—</dd></div>
          <div><dt>Ubicación</dt><dd data-d-pos>—</dd></div>
        </dl>
        <div class="gps-motor" data-motor></div>`;
      pintarMotor();
      refrescarDetalle();
    }
    function pintarMotor() {
      const v = vehs[elegido];
      const caja = $('[data-motor]', detalle);
      if (!caja) return;
      let html;
      if (v.confirmando) {
        html = `<p class="gps-motor-estado">${icono('i-motor')}¿Apagar el motor de ${esc(v.id)}?</p>
          <p>El equipo lo apaga con el vehículo detenido o despacio, para no poner a nadie en riesgo.</p>
          <div class="gps-motor-botones"><button type="button" class="gps-btn gps-btn-rojo" data-accion="apagar-si">${icono('i-motor')}Sí, apagar</button><button type="button" class="gps-btn gps-btn-claro" data-accion="cancelar">Cancelar</button></div>`;
      } else if (v.motor === 'enviando') {
        html = `<p class="gps-motor-estado">${icono('i-motor')}Enviando la orden al equipo…</p><p>Por la red celular 4G, en segundos.</p>`;
      } else if (v.motor === 'apagando') {
        html = `<p class="gps-motor-estado">${icono('i-check')}Orden recibida</p><p>El vehículo se está deteniendo; el motor se apaga al quedar quieto.</p>`;
      } else if (v.motor === 'apagado') {
        html = `<p class="gps-motor-estado apagado">${icono('i-candado')}Motor apagado a distancia</p><p>No enciende hasta que lo habilites.</p>
          <div class="gps-motor-botones"><button type="button" class="gps-btn gps-btn-verde" data-accion="habilitar">${icono('i-motor')}Habilitar encendido</button></div>`;
      } else if (v.motor === 'habilitando') {
        html = `<p class="gps-motor-estado">${icono('i-motor')}Habilitando el encendido…</p><p>El conductor ya puede arrancar.</p>`;
      } else {
        html = `<p class="gps-motor-estado">${icono('i-motor')}Motor encendido</p><p>En caso de robo, apágalo desde aquí.</p>
          <div class="gps-motor-botones"><button type="button" class="gps-btn gps-btn-rojo" data-accion="apagar">${icono('i-motor')}Apagar motor</button></div>`;
      }
      caja.innerHTML = html;
    }
    detalle.addEventListener('click', (e) => {
      const b = e.target.closest('[data-accion]');
      if (!b) return;
      const v = vehs[elegido];
      const accion = b.dataset.accion;
      if (accion === 'apagar') v.confirmando = true;
      else if (accion === 'cancelar') v.confirmando = false;
      else if (accion === 'apagar-si') {
        v.confirmando = false;
        v.motor = 'enviando';
        setTimeout(() => {
          v.motor = 'apagando';
          if (QUIETO) apagado(v);
          refrescarMotor(v);
        }, 1300);
      } else if (accion === 'habilitar') {
        v.motor = 'habilitando';
        setTimeout(() => {
          v.motor = 'encendido';
          v.paradaHasta = performance.now() + 2500;
          avisar({ v: v.id, t: 'Encendido habilitado a distancia', tipo: 'verde', ic: 'i-motor' });
          refrescarMotor(v);
          if (vehs[elegido] === v) pintarCamaras();
        }, 1300);
      }
      pintarMotor();
      $('[data-motor] button', detalle)?.focus({ preventScroll: true });
    });
    function apagado(v) {
      if (v.motor === 'apagado') return;
      v.motor = 'apagado';
      v.vel = 0;
      v.cambioEn = Date.now();
      avisar({ v: v.id, t: 'Motor apagado a distancia', tipo: 'roja', ic: 'i-candado' });
      refrescarMotor(v);
      if (vehs[elegido] === v) pintarCamaras();
    }
    function refrescarMotor(v) {
      if (vehs[elegido] === v) pintarMotor();
    }
    function refrescarDetalle() {
      const v = vehs[elegido];
      const e = estadoDe(v);
      const fija = (sel, t) => {
        const n = $(sel, detalle);
        if (n && n.textContent !== t) n.textContent = t;
      };
      fija('[data-d-vel]', `${Math.round(v.vel)} km/h`);
      fija('[data-d-estado]', ESTADO_TXT[e]);
      fija('[data-d-km]', `${v.km.toFixed(1).replace('.', ',')} km`);
      fija('[data-d-senal]', 'hace 2 s');
      fija('[data-d-pos]', v.x > 400 ? 'En el pueblo' : 'Vía principal');
      for (const c of camaras.querySelectorAll('[data-vel-cam]')) c.textContent = `${Math.round(v.vel)} km/h`;
      camaras.querySelectorAll('.gps-vial').forEach((n) => (n.style.animationPlayState = v.vel > 2 ? 'running' : 'paused'));
    }
    function refrescarLista() {
      let enMov = 0;
      vehs.forEach((v, i) => {
        const e = estadoDe(v);
        if (e === 'mov') enMov += 1;
        v.g.classList.toggle('det', e === 'det');
        v.g.classList.toggle('apagado', e === 'apagado');
        const b = lista.querySelector(`[data-i="${i}"]`);
        const vel = $('[data-vel]', b);
        const t = String(Math.round(v.vel));
        if (vel.textContent !== t) vel.textContent = t;
        const punto = $('.gps-estado', b);
        const clase = `gps-estado gps-estado-${e}`;
        if (punto.className !== clase) punto.className = clase;
      });
      const r = `${vehs.length} vehículos · ${enMov} en movimiento`;
      if (resumen.textContent !== r) resumen.textContent = r;
    }

    // ---- Cámaras (escenas dibujadas) ----
    const ESCENAS = {
      Frontal: `<rect width="160" height="100" fill="#22303f"/><rect width="160" height="44" fill="#4b6584"/><path d="M0 100 L66 44 H94 L160 100 Z" fill="#39424f"/>
        <path class="gps-vial" d="M80 46 V100" stroke="#FFC21A" stroke-width="3" stroke-dasharray="8 6"/><path d="M0 44 H160" stroke="#6b7f99"/><rect x="18" y="30" width="20" height="14" fill="#3d5068"/><rect x="118" y="24" width="26" height="20" fill="#3d5068"/>`,
      Cabina: `<rect width="160" height="100" fill="#1d2633"/><rect x="0" y="62" width="160" height="38" fill="#141b25"/><circle cx="62" cy="40" r="14" fill="#55657a"/>
        <path d="M34 100 C 36 70 88 70 90 100 Z" fill="#46566b"/><path d="M96 92 a 30 18 0 0 1 56 0" stroke="#0b1018" stroke-width="7" fill="none"/>`,
      Pasillo: `<rect width="160" height="100" fill="#1f2a38"/><path d="M60 100 L74 30 H86 L100 100 Z" fill="#2a3646"/>
        <g fill="#3b4b61"><rect x="10" y="70" width="40" height="22" rx="4"/><rect x="110" y="70" width="40" height="22" rx="4"/><rect x="34" y="50" width="28" height="15" rx="3"/><rect x="98" y="50" width="28" height="15" rx="3"/><rect x="50" y="36" width="20" height="10" rx="2"/><rect x="90" y="36" width="20" height="10" rx="2"/></g>
        <g fill="#5b6b80"><circle cx="30" cy="62" r="7"/><circle cx="118" cy="44" r="5"/><circle cx="60" cy="31" r="4"/></g>`,
      Puerta: `<rect width="160" height="100" fill="#1d2631"/><rect x="48" y="10" width="64" height="86" rx="4" fill="#2b3747" stroke="#56677d" stroke-width="3"/>
        <path d="M80 10 V96" stroke="#56677d" stroke-width="3"/><rect x="40" y="88" width="80" height="6" fill="#3f4c5e"/><rect x="34" y="94" width="92" height="6" fill="#4a586b"/>`,
    };
    function pintarCamaras() {
      const v = vehs[elegido];
      const nombres = v.camaras === 2 ? ['Frontal', 'Cabina'] : ['Frontal', 'Cabina', 'Pasillo', 'Puerta'];
      camaras.classList.toggle('dos', nombres.length === 2);
      camaras.innerHTML = nombres.map((n, i) => `
        <figure class="gps-camara">
          <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Cámara ${i + 1}, ${n}, de ${esc(v.id)} (escena de prueba)">${ESCENAS[n]}</svg>
          <span class="gps-rec">● REC</span>
          <figcaption><span>CAM ${i + 1} · ${n}</span><span><span data-hora-cam>${hora()}</span> · <span data-vel-cam>${Math.round(v.vel)} km/h</span></span></figcaption>
        </figure>`).join('');
      refrescarDetalle();
    }

    // ---- Alertas ----
    const ALERTAS = [
      { v: 'BUS 101', t: 'Exceso de velocidad: 92 km/h en la vía principal', tipo: 'roja', ic: 'i-campana' },
      { v: 'ESC 204', t: 'Llegó a la zona Colegio', tipo: 'verde', ic: 'i-geocerca' },
      { v: 'BTA 012', t: 'Se detuvo 4 minutos fuera de su ruta', tipo: '', ic: 'i-ruta' },
      { v: 'BUS 101', t: 'Salió de la zona Terminal', tipo: '', ic: 'i-geocerca' },
      { v: 'TAXI 045', t: 'Botón de pánico: el conductor pide ayuda', tipo: 'roja', ic: 'i-sos' },
      { v: 'ESC 204', t: 'Salió de la zona Colegio', tipo: '', ic: 'i-geocerca' },
      { v: 'BTA 012', t: 'Batería del vehículo desconectada', tipo: 'roja', ic: 'i-bateria' },
      { v: 'TAXI 045', t: 'Encendido', tipo: 'verde', ic: 'i-motor' },
    ];
    function avisar(a, cuando = new Date(), nueva = true) {
      const li = document.createElement('li');
      li.className = `gps-alerta ${a.tipo || ''}${nueva ? ' nueva' : ''}`;
      li.innerHTML = `${icono(a.ic)}<span><b>${esc(a.v)}</b> · ${esc(a.t)}<small>${horaCorta(cuando)}</small></span>`;
      alertas.prepend(li);
      while (alertas.children.length > 5) alertas.lastElementChild.remove();
    }
    const ahora0 = Date.now();
    [ALERTAS[3], ALERTAS[2], ALERTAS[1]].forEach((a, i) => avisar(a, new Date(ahora0 - (3 - i) * 4 * 60000), false));
    let siguienteAlerta = 0;

    // ---- El reloj de la demo (solo con la demo a la vista) ----
    let visible = false;
    let ultimo = 0;
    let ultimoTexto = 0;
    let ultimaAlerta = performance.now();
    vehs.forEach(colocar);
    elegir(0);
    refrescarLista();
    function cuadro(t) {
      if (!visible) return;
      const dt = Math.min(0.1, (t - (ultimo || t)) / 1000);
      ultimo = t;
      if (!QUIETO) vehs.forEach((v) => mover(v, dt, t));
      if (t - ultimoTexto > 250) {
        ultimoTexto = t;
        refrescarLista();
        refrescarDetalle();
      }
      if (!QUIETO && t - ultimaAlerta > 7000) {
        ultimaAlerta = t;
        avisar(ALERTAS[siguienteAlerta % ALERTAS.length]);
        siguienteAlerta += 1;
      }
      requestAnimationFrame(cuadro);
    }
    setInterval(() => {
      if (!visible) return;
      const h = hora();
      reloj.textContent = h;
      camaras.querySelectorAll('[data-hora-cam]').forEach((n) => (n.textContent = h));
      if (QUIETO) {
        refrescarLista();
        refrescarDetalle();
      }
    }, 1000);
    const alVer = (si) => {
      const antes = visible;
      visible = si && !document.hidden;
      if (visible && !antes) {
        ultimo = 0;
        reloj.textContent = hora();
        requestAnimationFrame(cuadro);
      }
    };
    let enPantalla = true;
    if ('IntersectionObserver' in globalThis) {
      new IntersectionObserver((es) => {
        enPantalla = es.some((x) => x.isIntersecting);
        alVer(enPantalla);
      }, { rootMargin: '120px' }).observe(raiz);
    } else alVer(true);
    document.addEventListener('visibilitychange', () => alVer(enPantalla));
  }

  /* ================================ Cotiza ================================ */
  function iniciarCotiza(form) {
    const error = $('[data-error]', form);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      form.querySelectorAll('.gps-invalido').forEach((n) => n.classList.remove('gps-invalido'));
      error.classList.remove('gps-ok');
      const tipos = [...form.querySelectorAll('input[name="tipo"]:checked')].map((n) => n.value);
      const extras = [...form.querySelectorAll('input[name="extra"]:checked')].map((n) => n.value);
      const campo = (n) => form.elements[n].value.trim();
      const cantidad = Number(campo('cantidad'));
      const celular = campo('celular').replace(/[^\d+]/g, '');
      const falta = (n, texto) => {
        form.elements[n].classList.add('gps-invalido');
        form.elements[n].focus();
        error.textContent = texto;
      };
      if (!tipos.length) {
        error.textContent = 'Escoge al menos un tipo de vehículo.';
        form.querySelector('input[name="tipo"]').focus();
        return;
      }
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 5000) return falta('cantidad', 'Escribe cuántos vehículos son (de 1 a 5.000).');
      if (!campo('ciudad')) return falta('ciudad', 'Escribe el municipio o la ciudad.');
      if (!campo('nombre')) return falta('nombre', 'Escribe tu nombre.');
      if (celular.replace(/\D/g, '').length < 7) return falta('celular', 'Escribe un celular para contactarte.');
      const quien = campo('empresa') || campo('nombre');
      const asunto = `Cotización GPS · ${quien} · ${cantidad} ${cantidad === 1 ? 'vehículo' : 'vehículos'}`;
      const cuerpo = [
        'Hola, quiero una cotización de GPS y monitoreo.',
        '',
        `Vehículos: ${tipos.join(', ')}`,
        `Cantidad: ${cantidad}`,
        `Municipio o ciudad: ${campo('ciudad')}`,
        `Necesito: ${extras.length ? extras.join(', ') : 'que me asesoren'}`,
        '',
        `Nombre: ${campo('nombre')}`,
        campo('empresa') ? `Empresa: ${campo('empresa')}` : null,
        `Celular: ${campo('celular')}`,
      ].filter((l) => l !== null).join('\n');
      error.textContent = 'Listo: se abrió tu correo con la cotización. Si no se abrió, escríbenos a info@taxicun.com con estos datos.';
      error.classList.add('gps-ok');
      location.href = `mailto:info@taxicun.com?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    });
  }

  const demo = $('[data-demo]');
  if (demo) iniciarDemo(demo);
  const cotiza = $('[data-cotiza]');
  if (cotiza) iniciarCotiza(cotiza);
})();
