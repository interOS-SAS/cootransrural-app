// Tarjeta «Actualizamos la política de privacidad» (§7.5 del diseño del panel, S36): avisa en las apps los cambios de
// la política ANTES de que empiecen a regir (Decreto 1377 de 2013), una vez por versión y por celular. Solo en el modo
// real (la app de las tiendas y ?real=1). La versión, la fecha y si hay que avisar salen de nucleo/politica.js (lo
// escribe herramientas/generar-empresas.py desde herramientas/politica.json): con la 1.3 apagada no aparece nada.
//
//   avisarPolitica(app, { N, rol })   la muestra si toca (devuelve true si quedó vista). rol: 'pasajero' | 'conductor'
//                                     (en la del conductor el botón dice «Acepto», como recomienda el borrador de la 1.3)
//   marcarPoliticaVista(N)            la persona aceptó la política vigente al entrar (casilla o «Al continuar…»)
// El texto es el del borrador para el abogado (documentos/POLITICA-1.3-CAMBIOS.md de la fase 3).
import { icono, modal } from './ui.js';
import * as EM from './empresa.js';

const CLAVE = 'taxicun.politica.vista';

function vista() {
  try {
    return localStorage.getItem(CLAVE) || '';
  } catch {
    return '';
  }
}

export function marcarPoliticaVista(N) {
  const version = N?.POLITICA?.version;
  if (!EM.MODO_REAL || !version) return;
  try {
    localStorage.setItem(CLAVE, version);
  } catch {
    /* sin almacenamiento: se vuelve a mostrar */
  }
}

// ¿Hay que mostrarla? (Modo real, con la versión nueva publicada y sin verla en este celular.)
export function politicaPendiente(N) {
  const p = N?.POLITICA;
  return Boolean(EM.MODO_REAL && p?.avisar && p.version && vista() !== p.version);
}

let abierta = null;

export async function avisarPolitica(app, { N, rol = 'pasajero' } = {}) {
  if (abierta || !politicaPendiente(N)) return false;
  const p = N.POLITICA;
  const conductor = rol === 'conductor';
  const desde = p.vigenteDesde ? `Desde el ${p.vigenteDesde}, tu` : 'Tu';
  abierta = modal(app, {
    titulo: 'Actualizamos la política de privacidad',
    texto: `${desde} cooperativa usará un panel para despachar y supervisar el servicio. Ahí ve la posición de los taxis en turno y los viajes con tu nombre abreviado; tu celular solo lo ve con un motivo, que queda registrado. No se guarda un historial de recorridos.`,
    icono: `<span class="a-nat-ico">${icono('escudo', { tam: 32 })}</span>`,
    clase: 'a-modal-politica',
    acciones: [
      { texto: conductor ? 'Acepto' : 'Entendido', valor: true, clase: 'a-btn-primario', icono: 'check' },
      { texto: 'Leer la política', href: EM.urlPrivacidad(), externo: true, valor: 'leer', clase: 'a-btn-suave', icono: 'candado' },
    ],
  });
  let r = null;
  try {
    r = await abierta;
  } finally {
    abierta = null;
  }
  // «Leer la política» no la da por vista: al volver (o la próxima vez) se pide «Entendido».
  if (r === true) marcarPoliticaVista(N);
  return r === true;
}
