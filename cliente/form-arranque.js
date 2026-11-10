/**
 * cliente/form-arranque.js — lo que llaman los botones (window.X), efectos al tocar y el ARRANQUE
 * ================================================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ─── EXPOSE GLOBALS ────────────────────────────────────────────── */
/* Movidos aquí desde su módulo (Fase 5): se asignan cuando YA existen
   todas las funciones, sin importar en qué módulo viven. */
window.getDeliveryAddr = getDeliveryAddr;
window.agOnInput = agOnInput;
window.agSel     = agSel;
window.agIrALupa = agIrALupa;
window.agCambiar = agCambiar;
window.dlvAjustar = dlvAjustar;
window.dlvConfirmar = dlvConfirmar;
window.dlvAjusteOk = dlvAjusteOk;
window.dlvAjusteCerrar = dlvAjusteCerrar;
window.agUbicarme   = agUbicarme;
window.agVerTodos   = agVerTodos;
window.agMiPosicion = agMiPosicion;
window.agManual  = agManual;
window.agReset   = agReset;
window.agBuscar  = agBuscar;
window.agCerca   = agCerca;
window.onDniInput           = onDniInput;
window._dniMarca            = _dniMarca;
window.usarNombreDni        = usarNombreDni;
window.dniMantener          = dniMantener;
window.dniReintentar        = dniReintentar;
window.onNombreInput        = onNombreInput;
window.loadCfg              = loadCfg;
window.renderForm           = renderForm;
window.wzNext               = wzNext;
window.wzBack               = wzBack;
window.wzShow               = wzShow;
window.onPhoneInput         = onPhoneInput;
window.onCourierChange      = onCourierChange;
window.pickCourier          = pickCourier;
window.selDate              = selDate;
window._gpsCopiarLink       = _gpsCopiarLink;
// Dirección de entrega — una sola verdad (el textarea)
window.usarMiUbicacion      = usarMiUbicacion;
window.usarDireccionDeSiempre = usarDireccionDeSiempre;
window.onDireccionInput     = onDireccionInput;
window.quitarPin            = quitarPin;
window.submitOrder          = submitOrder;
window.checkToken           = checkToken;
// ★ Funciones que faltaban exponer (por eso sus onclick no funcionaban)
window.abrirAyudaForm       = abrirAyudaForm;
window._waAbierto           = _waAbierto;
window.waYaEnviado          = waYaEnviado;
window.cerrarAyudaForm      = cerrarAyudaForm;
window.onAgencyManual       = onAgencyManual;
window.toggleShalomHelp     = toggleShalomHelp;
window._notesCount          = _notesCount;

/* ★ «ESTOY ENCIMA» (.tocando) — el efecto SIGUE al puntero en todos los
   dispositivos (30/10/2026):
     · mouse / lápiz: se marca la tarjeta por la que pasa y se quita al salir;
     · dedo: se marca la tarjeta que está JUSTO DEBAJO del dedo y va
       cambiando mientras se desliza (como el mouse en PC). Se usan los
       eventos de toque (touchmove), que siguen llegando aunque la pantalla
       se esté desplazando — los de puntero se cortan al empezar el scroll.
       Una consulta por cuadro (requestAnimationFrame). Al soltar se queda
       0,26 s para que se vea.
   Deslizar ilumina pero NO elige: solo un toque genera el clic. */
try{
  (function(){
    var SEL='.date-opt,.cour-card,.ag-item', actual=null, toque=0, pend=null, raf=0;
    var marcar=function(t){
      if(t===actual) return;
      if(actual) actual.classList.remove('tocando');
      actual=t||null;
      if(actual) actual.classList.add('tocando');
    };
    var bajo=function(x, y){ var e=document.elementFromPoint(x, y); return e && e.closest ? e.closest(SEL) : null; };
    // ── Dedo
    var seguir=function(ev){
      var t=ev.touches && ev.touches[0]; if(!t) return;
      toque=Date.now(); pend=t;
      if(raf) return;
      // En el hueco entre dos tarjetas no hay ninguna debajo: se queda la
      // última (sin parpadeo) hasta que el dedo llegue a otra o se suelte.
      raf=requestAnimationFrame(function(){ raf=0; var t=pend && bajo(pend.clientX, pend.clientY); if(t) marcar(t); });
    };
    var soltar=function(){
      toque=Date.now(); pend=null;
      var t=actual; actual=null;
      if(t) setTimeout(function(){ if(t!==actual) t.classList.remove('tocando'); }, 260);
    };
    document.addEventListener('touchstart', seguir, {passive:true});
    document.addEventListener('touchmove', seguir, {passive:true});
    document.addEventListener('touchend', soltar, {passive:true});
    document.addEventListener('touchcancel', soltar, {passive:true});
    // ── Mouse y lápiz (con respaldo para navegadores sin PointerEvent)
    var entra=function(ev){
      // Tras un toque, algunos equipos (laptops táctiles) emiten un «mouse»
      // fantasma en la misma posición: se ignora un instante.
      if(Date.now()-toque<800) return;
      var t=ev.target && ev.target.closest ? ev.target.closest(SEL) : null;
      if(t) marcar(t);
    };
    var sale=function(ev){
      var t=ev.target && ev.target.closest ? ev.target.closest(SEL) : null;
      if(t && t===actual && !(ev.relatedTarget && t.contains(ev.relatedTarget))) marcar(null);
    };
    if(window.PointerEvent){
      document.addEventListener('pointerover', function(ev){ if(ev.pointerType!=='touch') entra(ev); }, {passive:true});
      document.addEventListener('pointerout', function(ev){ if(ev.pointerType!=='touch') sale(ev); }, {passive:true});
    } else {
      document.addEventListener('mouseover', entra, {passive:true});
      document.addEventListener('mouseout', sale, {passive:true});
    }
  })();
}catch(e){}

// iOS Safari solo aplica :active (el «hundirse» al tocar) si hay un oyente
// de toque en la página. Pasivo: no frena el scroll.
try{ document.addEventListener('touchstart', function(){}, {passive:true}); }catch(e){}

// Arranque AL FINAL: todo lo de arriba ya existe (ver INIT).
init();
