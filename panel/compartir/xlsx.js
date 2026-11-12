(function(){
  'use strict';
  var URL_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var pendiente = null;

  function cargarXLSX(){
    if(window.XLSX) return Promise.resolve(window.XLSX);
    if(pendiente) return pendiente;
    pendiente = new Promise(function(ok, mal){
      var s = document.createElement('script');
      s.src = URL_XLSX;
      s.async = true;
      s.onload = function(){ window.XLSX ? ok(window.XLSX) : mal(new Error('xlsx')); };
      s.onerror = function(){ mal(new Error('xlsx')); };
      document.head.appendChild(s);
    });
    pendiente.catch(function(){ pendiente = null; });
    return pendiente;
  }

  function conXLSX(seguir, alFallar){
    if(window.XLSX) return true;
    if(typeof window.toast === 'function') window.toast('Cargando Excel...');
    cargarXLSX().then(seguir, function(){
      if(typeof alFallar === 'function') alFallar();
      else if(typeof window.toast === 'function') window.toast('No se pudo cargar Excel. Revisa tu conexión.');
    });
    return false;
  }

  window.cargarXLSX = cargarXLSX;
  window.conXLSX = conXLSX;
})();
