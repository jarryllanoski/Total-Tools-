'use strict';

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
window.usarMiUbicacion      = usarMiUbicacion;
window.usarDireccionDeSiempre = usarDireccionDeSiempre;
window.onDireccionInput     = onDireccionInput;
window.quitarPin            = quitarPin;
window.submitOrder          = submitOrder;
window.checkToken           = checkToken;
window.abrirAyudaForm       = abrirAyudaForm;
window._waAbierto           = _waAbierto;
window.waYaEnviado          = waYaEnviado;
window.cerrarAyudaForm      = cerrarAyudaForm;
window.onAgencyManual       = onAgencyManual;
window.toggleShalomHelp     = toggleShalomHelp;
window._notesCount          = _notesCount;

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
    var seguir=function(ev){
      var t=ev.touches && ev.touches[0]; if(!t) return;
      toque=Date.now(); pend=t;
      if(raf) return;
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
    var entra=function(ev){
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

try{ document.addEventListener('touchstart', function(){}, {passive:true}); }catch(e){}

init();
