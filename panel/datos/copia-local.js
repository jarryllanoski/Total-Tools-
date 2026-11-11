/**
 * panel/datos/copia-local.js — la copia de los pedidos en ESTE navegador
 * =====================================================================
 * Fase 8 (11/11/2026). El panel guarda una copia del estado en el navegador
 * para abrir al instante y pedirle a la nube SOLO lo que cambió
 * (functions/sincro.js). Esa copia vivía solo en localStorage, que tiene un
 * tope de ~5 MB: el día que los pedidos no quepan, la escritura falla en
 * silencio, el panel abre sin copia y baja TODO cada vez — más lento y miles
 * de lecturas de Firestore.
 *
 * Ahora:
 *   · se sigue escribiendo en localStorage mientras quepa (es síncrono: el
 *     panel abre pintado, como siempre);
 *   · y SIEMPRE en IndexedDB, que admite cientos de MB, sin bloquear la
 *     pantalla (agrupado: una escritura por ráfaga de cambios);
 *   · si localStorage se llena, se libera y se marca `dpanel_en_idb`: al
 *     abrir, la copia se lee de IndexedDB ANTES de pedir a la nube.
 * Si IndexedDB no existe o falla, todo sigue exactamente como antes.
 * Solo es una copia: la nube manda (estado.js → _mergeRemote).
 */
(function(){
  'use strict';
  var BD = 'totaltools-panel', ALMACEN = 'copia', CLAVE = 'dpanel';
  var ESPERA = 1500;            // ms: una escritura por ráfaga de cambios
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
    _bd.catch(function(){ _bd = null; });   // un fallo no queda pegado
    return _bd;
  }

  /** Escribe YA la copia que se le pasa (objeto, no texto). */
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

  /** La copia guardada, o null. Nunca falla: sin copia es null. */
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

  /** Programa la escritura de la copia ACTUAL (la de ese momento). */
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
