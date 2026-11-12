(function(){
  'use strict';
  var BD = 'totaltools-panel', ALMACEN = 'copia', CLAVE = 'dpanel';
  var ESPERA = 1500;
  var _bd = null, _timer = null;

  function abrir(){
    if(_bd) return _bd;
    _bd = new Promise(function(ok, mal){
      try{
        if(!window.indexedDB) return mal(new Error('sin IndexedDB'));
        var r = indexedDB.open(BD, 1);
        r.onupgradeneeded = function(){ r.result.createObjectStore(ALMACEN); };
        r.onsuccess = function(){ ok(r.result); };
        r.onerror = function(){ mal(r.error); };
        r.onblocked = function(){ mal(new Error('IndexedDB bloqueada')); };
      }catch(e){ mal(e); }
    });
    _bd.catch(function(){ _bd = null; });
    return _bd;
  }

  function escribir(obj){
    return abrir().then(function(bd){
      return new Promise(function(ok, mal){
        var tx = bd.transaction(ALMACEN, 'readwrite');
        tx.objectStore(ALMACEN).put(obj, CLAVE);
        tx.oncomplete = function(){ ok(true); };
        tx.onerror = function(){ mal(tx.error); };
      });
    });
  }

  function leer(){
    return abrir().then(function(bd){
      return new Promise(function(ok){
        var tx = bd.transaction(ALMACEN, 'readonly');
        var g = tx.objectStore(ALMACEN).get(CLAVE);
        g.onsuccess = function(){ ok(g.result || null); };
        g.onerror = function(){ ok(null); };
      });
    }).catch(function(){ return null; });
  }

  function programar(){
    clearTimeout(_timer);
    _timer = setTimeout(function(){
      try{
        var S = window.S; if(!S) return;
        var obj = window._slimStateForLocal ? window._slimStateForLocal(S) : S;
        escribir(obj).catch(function(e){
          try{ window.Errores && window.Errores.anotar('copia.idb', e); }catch(_){}
        });
      }catch(_){}
    }, ESPERA);
  }

  window.CopiaLocal = {leer: leer, programar: programar, escribir: escribir, ESPERA: ESPERA};
})();
