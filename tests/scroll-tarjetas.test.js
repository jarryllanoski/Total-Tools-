/**
 * tests/scroll-tarjetas.test.js — ▲▼ del grupo dejan la tarjeta bajo lo fijo
 * 30/10/2026: desde el 26/10 las pestañas «Envíos · Compartir · Config» son
 * fijas y ▲▼ no las contaba: la tarjeta quedaba escondida debajo.
 */
'use strict';
const E = require('./_entorno.js');

module.exports = async ({bloque, ok}) => {
  const idx = E.leer('index.html');
  bloque('▲▼: UNA medida de lo fijo arriba (barra + pestañas + courier)');
  {
    const f = idx.slice(idx.indexOf('function _altoFijoArriba('), idx.indexOf('function scrollCard('));
    ok(/parseFloat\(getComputedStyle\(ch\)\.top\)/.test(f) && /return top\+alto\(ch\);/.test(f),
       '⚠️ el fin de lo fijo = top CSS del encabezado del courier (barra + pestañas) + su alto: la misma cuenta del navegador');
    ok(/alto\(document\.querySelector\('\.tabs'\)\)/.test(f), 'sin CSS, la suma incluye las pestañas');
    ok(/card\.closest\('\.cgroup'\)/.test(f), 'el encabezado es el del grupo de ESA tarjeta');
    const s = idx.slice(idx.indexOf('function scrollCard('), idx.indexOf('function escU('));
    ok((s.match(/_altoFijoArriba\(cards\[/g) || []).length === 2, 'la tarjeta actual y la de destino usan la MISMA medida');
    ok(!/querySelector\('\.hdr'\)/.test(s) && !/\+6; \/\/ debajo de AMBOS/.test(s), 'sin el cálculo viejo que olvidaba las pestañas');
    ok(/Math\.max\(0,Math\.min\(cards\.length-1, cur\+dir\)\)/.test(s), 'no se pasa de la primera ni de la última');
  }
};
