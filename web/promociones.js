// Términos de la promoción «Viaje gratis» (taxicun.com/promociones/viaje-gratis/, DISENO-PROMOCIONES.md §15).
// El texto de la página es fijo; los VALORES vienen de GET /api/promociones/viaje-gratis[?version=n] (pública, sin
// sesión) y se ponen como texto (textContent) en cada <span data-v="…">, en pesos colombianos y fechas de Bogotá.
// Si la API no responde o responde algo raro, los valores quedan «—» y sale la franja «No pudimos cargar…»: nunca un
// valor por defecto escrito aquí. Con ?version=n en la dirección de la página, los de esa versión (para un reclamo).
// Sin dependencias, script clásico (no módulo: así la página no lleva ni un mapa de importaciones en línea) y sin código
// en línea en la página (CSP). Para las pruebas deja window.terminosPromo = { valores, cargar }.
(() => {
'use strict';
const RAIZ = new URL('../', document.currentScript?.src || location.href);
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ESTADOS = ['vigente', 'programada', 'pausada', 'terminada', 'apagada'];
const VACIO = '—';

const entero = (v, min = 0, max = 100000000) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const pesos = (n) => `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const texto = (v, max = 80) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁯﻿]/g, ' ').trim().slice(0, max) : '');
// «20 de octubre de 2026» en la hora de Bogotá (UTC−5 todo el año).
function fecha(v) {
  const t = typeof v === 'string' && v.length <= 40 ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) return null;
  const d = new Date(t - 5 * 3600 * 1000);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
const decimal = (n) => String(n).replace('.', ',');

// La versión pedida en la dirección de la página (solo un número).
function versionPedida() {
  const v = new URLSearchParams(location.search).get('version');
  return v && /^\d{1,6}$/.test(v) ? Number(v) : null;
}

// Respuesta de la API → valores listos para pintar (todo texto) o null si no cuadra.
function valores(d) {
  if (!d || typeof d !== 'object' || d.id !== 'viaje-gratis') return null;
  const cada = entero(d.cada, 1, 100);
  const tope = entero(d.tope, 0, 5000000);
  const version = entero(d.version, 0, 1000000);
  if (cada === null || tope === null || version === null) return null;
  const bonoPct = entero(d.bonoPct, 0, 100);
  const bonoMax = entero(d.bonoMax, 0, 5000000);
  const minimo = d.minimo === 'minima' ? 'la carrera mínima de cada cooperativa' : entero(d.minimo, 0, 5000000) !== null ? pesos(d.minimo) : null;
  const avance = typeof d.avanceMinKm === 'number' && Number.isFinite(d.avanceMinKm) && d.avanceMinKm >= 0 && d.avanceMinKm < 100 ? decimal(Math.round(d.avanceMinKm * 10) / 10) : null;
  const duracionS = entero(d.duracionMinS, 0, 36000);
  const maxPorDia = entero(d.maxPorDia, 0, 100);
  const cooperativas = (Array.isArray(d.cooperativas) ? d.cooperativas : []).slice(0, 200).map((c) => {
    const nombre = texto(c?.nombre, 80);
    if (!nombre) return null;
    const municipio = texto(c?.municipio, 60);
    const t = entero(c?.tope, 0, 5000000);
    const m = entero(c?.minimo, 0, 5000000);
    const desde = fecha(c?.desde);
    return [`${nombre}${municipio ? ` (${municipio})` : ''}`, t !== null ? `tope ${pesos(t)}` : '', m !== null ? `carrera mínima ${pesos(m)}` : '', desde ? `desde el ${desde}` : ''].filter(Boolean).join(' · ');
  }).filter(Boolean);
  const versiones = (Array.isArray(d.versiones) ? d.versiones : []).slice(0, 50)
    .map((x) => ({ version: entero(x?.version, 0, 1000000), desde: fecha(x?.desde), hasta: fecha(x?.hasta) }))
    .filter((x) => x.version !== null);
  return {
    estado: ESTADOS.includes(d.estado) ? d.estado : 'apagada',
    v: {
      version: String(version),
      vigenteDesde: fecha(d.vigenteDesde) || VACIO,
      inicio: fecha(d.inicio) || fecha(d.vigenteDesde) || VACIO,
      fin: fecha(d.fin),
      cada: String(cada),
      tope: pesos(tope),
      bonoPct: bonoPct !== null ? String(bonoPct) : VACIO,
      bonoMax: bonoMax ? pesos(bonoMax) : null,
      minimo: minimo || VACIO,
      venceDias: entero(d.venceDias, 1, 3650) !== null ? String(d.venceDias) : VACIO,
      maxMismoConductor: entero(d.maxMismoConductor, 0, 100) !== null ? String(d.maxMismoConductor) : VACIO,
      maxPorDia: maxPorDia ? String(maxPorDia) : null,
      avanceMinKm: avance || VACIO,
      duracionMin: duracionS !== null ? decimal(Math.round((duracionS / 60) * 10) / 10) : VACIO,
      pagoDias: entero(d.pagoDias, 0, 60) !== null ? String(d.pagoDias) : VACIO,
    },
    unoPorCelular: d.unoPorCelular === true,
    cooperativas,
    versiones,
  };
}

function poner(raiz, r) {
  for (const n of raiz.querySelectorAll('[data-v]')) {
    const v = r?.v?.[n.dataset.v];
    n.textContent = v == null || v === '' ? VACIO : v;
  }
  const si = {
    fin: Boolean(r?.v.fin),
    sinFin: Boolean(r) && !r.v.fin,
    inicio: Boolean(r),
    maxPorDia: Boolean(r?.v.maxPorDia),
    bonoMax: Boolean(r?.v.bonoMax),
    unoPorCelular: Boolean(r?.unoPorCelular),
    versiones: Boolean(r?.versiones.some((x) => String(x.version) !== r.v.version)),
  };
  for (const n of raiz.querySelectorAll('[data-si]')) n.hidden = !si[n.dataset.si];
  const lista = raiz.querySelector('[data-lista="cooperativas"]');
  if (lista) {
    lista.replaceChildren();
    for (const linea of r?.cooperativas?.length ? r.cooperativas : [VACIO]) {
      const li = document.createElement('li');
      li.textContent = linea;
      lista.append(li);
    }
  }
  const vers = raiz.querySelector('[data-lista="versiones"]');
  if (vers) {
    vers.replaceChildren();
    // Las otras versiones (la que se está viendo no se enlaza).
    for (const x of (r?.versiones || []).filter((y) => String(y.version) !== r.v.version)) {
      const a = document.createElement('a');
      const url = new URL(location.href);
      url.search = `?version=${x.version}`;
      url.hash = '';
      a.href = url.pathname + url.search;
      a.textContent = `Versión ${x.version}${x.desde ? ` (desde el ${x.desde}${x.hasta ? ` hasta el ${x.hasta}` : ''})` : ''}`;
      vers.append(a);
    }
  }
}

function franjas(raiz, { error = false, estado = null, otraVersion = false } = {}) {
  const ver = {
    error,
    no_empieza: !error && (estado === 'apagada' || estado === 'programada'),
    terminada: !error && estado === 'terminada',
    pausada: !error && estado === 'pausada',
    version: !error && otraVersion,
  };
  for (const n of raiz.querySelectorAll('[data-franja]')) n.hidden = !ver[n.dataset.franja];
}

async function cargar(raiz = document) {
  const version = versionPedida();
  const url = new URL('api/promociones/viaje-gratis', RAIZ);
  if (version !== null) url.search = `?version=${version}`;
  let r = null;
  try {
    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), 8000);
    const resp = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit', signal: control.signal });
    clearTimeout(reloj);
    r = resp.ok ? valores(await resp.json()) : null;
  } catch {
    r = null;
  }
  poner(raiz, r);
  // Con ?version=n, la franja dice que no es la vigente (la última de la lista es la vigente si no tiene «hasta»).
  const vigente = r?.versiones?.find((x) => !x.hasta)?.version ?? null;
  franjas(raiz, { error: !r, estado: r?.estado, otraVersion: Boolean(r) && version !== null && vigente !== null && version !== vigente });
  raiz.querySelector?.('[data-terminos-promo]')?.setAttribute('data-cargado', r ? 'si' : 'error');
  return r;
}

window.terminosPromo = Object.freeze({ valores, cargar });
if (document.querySelector('[data-terminos-promo]')) cargar();
})();
