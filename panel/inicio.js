/**
 * panel/inicio.js — encabezado del negocio y ARRANQUE del panel
 * =============================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
/* El encabezado del negocio. Se pintaba UNA sola vez al arrancar, así que en
   un navegador sin respaldo local se quedaba en "Mi Negocio / 999000000" —los
   valores por defecto— aunque los de verdad llegaran de la nube un segundo
   después. Ahora es una función y la llama también el latido. */
function pintarEncabezado(){
  const cfg = (window.S && S.config) || {};
  const n = $('hdrName'), t = $('hdrPhone');
  if(n) n.textContent = cfg.name  || 'Mi Negocio';
  if(t) t.textContent = cfg.phone || '';
}
window.pintarEncabezado = pintarEncabezado;

/* ★ ARRANQUE DE LA NUBE — aquí y no en estado.js (Fase 3). Arranca una
   carga asíncrona que, al volver, pinta con la lista, las pestañas y el
   estado: cuando todo eso vivía en UN script, existía desde el primer
   instante. Partido en módulos, arrancar en estado.js dejaría una carrera
   (la respuesta llegando antes que lista.js). Aquí ya están todos los del
   panel. Los de Config (panel/configuracion.js y compañía) cargan después,
   exactamente igual que cuando eran config.js: el código los llama con
   `typeof … === 'function'`. */
if(window._fbReady) {
  _initFirebase();
} else {
  // Fallback: try after short delay
  setTimeout(_initFirebase, 500);
}

/* INIT */
pintarEncabezado();
renderChips();
render();
/* DASHBOARD — doble-tap en nombre del negocio */
(function(){
  var _t=0;
  document.getElementById('hdrName').addEventListener('click',function(){
    var now=Date.now();
    if(now-_t<380 && window.DashBoard){ DashBoard.abrir(); _t=0; }
    else _t=now;
  });
})();
