// App única TaxiCun: escoge la cooperativa (por el enlace del sticker, la
// elección guardada o el GPS) y después carga el núcleo con esa cooperativa y el
// diseño que ella eligió. No importa el núcleo antes de saber cuál es: el núcleo
// lee window.CT_EMPRESA al cargar.
const RAIZ = new URL('../', import.meta.url);
const CLAVE = 'taxicun.empresa';

const $ = (id) => document.getElementById(id);
const escapar = (t = '') => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function distanciaKm(a, b) {
  const r = Math.PI / 180;
  const s = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

function ubicacion(espera = 8000) {
  return new Promise((ok) => {
    if (!('geolocation' in navigator)) return ok(null);
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: false, timeout: espera, maximumAge: 5 * 60 * 1000 },
    );
  });
}

function texto(t) {
  const el = $('carga-texto');
  if (el) el.textContent = t;
}

async function leerIndice() {
  const r = await fetch(new URL('empresas/indice.json', RAIZ), { cache: 'no-cache' });
  if (!r.ok) throw new Error('No se pudo cargar la lista de cooperativas');
  return (await r.json()).cooperativas || [];
}

function masCercana(lista, pos) {
  let mejor = null;
  for (const c of lista) {
    if (!c.centro) continue;
    const d = distanciaKm(pos, c.centro);
    if (!mejor || d < mejor.d) mejor = { c, d };
  }
  return mejor;
}

export async function iniciarTaxiCun({ rol = 'pasajero', version = '' } = {}) {
  let lista;
  try {
    lista = await leerIndice();
  } catch {
    texto('No pudimos cargar TaxiCun. Revisa tu conexión.');
    return;
  }
  const p = new URLSearchParams(location.search);
  const valida = (id) => lista.find((c) => c.id === id);

  if (p.get('elegir')) return mostrarLista(lista, { rol, version, motivo: 'elegir' });

  // 1) Enlace con la cooperativa (sticker QR, «Pedir taxi» de su web).
  const pedida = valida((p.get('e') || '').toLowerCase());
  if (pedida) return abrir(pedida, { rol, version });
  // 2) La que la persona escogió a mano.
  const guardada = valida(localStorage.getItem(CLAVE) || '');
  if (guardada) return abrir(guardada, { rol, version });
  // 3) Por GPS: la cooperativa del municipio donde está.
  texto('Buscando tu municipio…');
  const pos = await ubicacion();
  if (!pos) return mostrarLista(lista, { rol, version, motivo: 'sin-gps' });
  const cerca = masCercana(lista, pos);
  if (cerca && cerca.d <= (cerca.c.radioKm || 9)) return abrir(cerca.c, { rol, version, porGps: true });
  return mostrarLista(lista, { rol, version, motivo: 'fuera', pos });
}

async function abrir(coop, { rol, version, porGps = false }) {
  $('elegir').hidden = true;
  $('carga').classList.remove('oculta');
  texto(`${coop.pueblo} · ${coop.nombre}`);
  document.documentElement.style.setProperty('--tc-cooperativa', coop.color || '#0A5C33');
  // La URL guarda la cooperativa: al recargar o compartir abre la misma.
  const u = new URL(location.href);
  u.searchParams.set('e', coop.id);
  u.searchParams.delete('elegir');
  history.replaceState(null, '', u);

  window.CT_EMPRESA = coop.id;
  const N = await import(new URL('nucleo/index.js', RAIZ).href);
  const p = new URLSearchParams(location.search);
  if (p.get('movil')) N.perfil.guardarReferido(p.get('movil'));
  const d = N.perfil.disenoElegido();
  document.documentElement.dataset.diseno = d;
  document.documentElement.dataset.taxicun = '1';
  const archivo = rol === 'conductor' ? 'conductor' : 'pasajero';
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL(`disenos/${d}/${archivo}.css?v=${version}`, RAIZ).href;
  document.head.appendChild(css);
  try {
    const { montar } = await import(new URL(`disenos/${d}/${archivo}.js?v=${version}`, RAIZ).href);
    await montar($('app'), { N, diseno: d, vitrina: false, taxicun: { porGps, cooperativa: coop } });
  } catch (e) {
    console.error(e);
    $('app').innerHTML = `<p class="tc-error">No se pudo abrir TaxiCun para ${escapar(coop.nombre)}. ${escapar(e.message || '')}</p>`;
  }
  $('carga').classList.add('oculta');
  setTimeout(() => $('carga')?.remove(), 450);
  N.registrarServiceWorker();
}

function mostrarLista(lista, { rol, version, motivo, pos = null }) {
  $('carga').classList.add('oculta');
  const caja = $('elegir');
  const ordenadas = [...lista].sort((a, b) => (pos ? distanciaKm(pos, a.centro) - distanciaKm(pos, b.centro) : a.pueblo.localeCompare(b.pueblo, 'es')));
  const mensajes = {
    elegir: ['¿En qué municipio estás?', 'Escoge tu municipio y te mostramos la cooperativa de taxis de ahí.'],
    'sin-gps': ['¿En qué municipio estás?', 'No pudimos ver tu ubicación. Escoge tu municipio o activa la ubicación.'],
    fuera: ['TaxiCun aún no llega a tu municipio', 'Por ahora estamos en estos municipios de Cundinamarca. Si vas para alguno, escógelo.'],
  };
  const [titulo, detalle] = mensajes[motivo] || mensajes.elegir;
  caja.innerHTML = `
    <header class="tc-elegir-cabeza">
      <img src="${new URL('img/taxicun/logo-blanco.svg', RAIZ).href}" alt="TaxiCun" width="200" height="50">
      <h1 tabindex="-1">${escapar(titulo)}</h1>
      <p>${escapar(detalle)}</p>
      ${rol === 'conductor' ? '<p class="tc-rol">App del conductor</p>' : ''}
    </header>
    <button type="button" class="tc-boton tc-boton-ubicacion" data-ubicacion>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2"/></svg>Usar mi ubicación
    </button>
    <ul class="tc-lista">
      ${ordenadas.map((c) => `
        <li><button type="button" data-id="${escapar(c.id)}" style="--c:${escapar(c.color)}">
          <img src="${new URL(c.icono, RAIZ).href}" alt="" width="48" height="48">
          <span class="tc-lista-texto"><b>${escapar(c.pueblo)}</b><small>${escapar(c.nombre)}${pos && c.centro ? ` · a ${Math.round(distanciaKm(pos, c.centro))} km` : ''}</small></span>
          ${c.estado === 'propuesta' ? '<span class="tc-demo">Demo</span>' : ''}
          <svg class="tc-flecha" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button></li>`).join('')}
    </ul>
    <p class="tc-elegir-pie">TaxiCun · desarrollada por interOS</p>`;
  caja.hidden = false;
  caja.querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => {
    const coop = lista.find((c) => c.id === b.dataset.id);
    localStorage.setItem(CLAVE, coop.id);
    abrir(coop, { rol, version });
  }));
  caja.querySelector('[data-ubicacion]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.lastChild.textContent = 'Buscando…';
    localStorage.removeItem(CLAVE);
    const nueva = await ubicacion(10000);
    if (!nueva) return mostrarLista(lista, { rol, version, motivo: 'sin-gps' });
    const cerca = masCercana(lista, nueva);
    if (cerca && cerca.d <= (cerca.c.radioKm || 9)) return abrir(cerca.c, { rol, version, porGps: true });
    mostrarLista(lista, { rol, version, motivo: 'fuera', pos: nueva });
  });
  // El foco va al título (lo anuncia el lector de pantalla) y no al primer municipio:
  // en el celular, el anillo del foco hacía parecer que ese municipio ya estaba escogido.
  caja.querySelector('h1')?.focus({ preventScroll: true });
}
