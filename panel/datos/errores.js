(function (global) {
  'use strict';

  var TOPE_SESION = 20;
  var VENTANA_MS = 60000;
  var _vistos = {};
  var _escritos = 0;

  function _huella(donde, msg) {
    return (donde + '|' + msg).slice(0, 200);
  }

  function _mensaje(e) {
    try {
      if (!e) return 'sin mensaje';
      if (typeof e === 'string') return e.slice(0, 300);
      if (e.message) return String(e.message).slice(0, 300);
      return String(e).slice(0, 300);
    } catch (_) { return 'no se pudo leer el error'; }
  }

  function _pila(e) {
    try {
      if (!e || !e.stack) return '';
      return String(e.stack).split('\n').slice(0, 6).join('\n').slice(0, 800);
    } catch (_) { return ''; }
  }

  function _equipo() {
    try {
      var ua = navigator.userAgent || '';
      var movil = /Android|iPhone|iPad|iPod/i.test(ua);
      return {
        movil: movil,
        navegador: ua.slice(0, 120),
        pantalla: (global.screen ? global.screen.width + 'x' + global.screen.height : ''),
        online: navigator.onLine !== false
      };
    } catch (_) { return {}; }
  }

  function _quien() {
    try { return localStorage.getItem('tt_email') || ''; } catch (_) { return ''; }
  }

  var Errores = {

    anotar: function (donde, e, extra) {
      try {
        if (_escritos >= TOPE_SESION) return;

        var msg = _mensaje(e);
        var h = _huella(donde, msg);
        var ahora = Date.now();
        var visto = _vistos[h];
        if (visto && (ahora - visto.cuando) < VENTANA_MS) {
          visto.veces++;
          return;
        }
        _vistos[h] = {cuando: ahora, veces: (visto ? visto.veces + 1 : 1)};
        _escritos++;

        var doc = {
          cuando: new Date().toISOString(),
          donde: String(donde || '?').slice(0, 60),
          mensaje: msg,
          pila: _pila(e),
          veces: _vistos[h].veces,
          quien: _quien(),
          equipo: _equipo(),
          version: (global.FBConfig && global.FBConfig.VERSION) || '',
          ruta: (global.location ? String(global.location.hash || '').slice(0, 60) : '')
        };
        if (extra && typeof extra === 'object') {
          var lim = {};
          Object.keys(extra).slice(0, 8).forEach(function (k) {
            var v = extra[k];
            if (v === null || ['string', 'number', 'boolean'].indexOf(typeof v) >= 0) {
              lim[k] = String(v).slice(0, 120);
            }
          });
          doc.extra = lim;
        }

        var id = 'e' + ahora + '_' + Math.random().toString(36).slice(2, 8);
        if (typeof global._fbEscribirError === 'function') {
          global._fbEscribirError(id, doc);
        }
      } catch (_) {  }
    },

    resumen: function () {
      return {escritos: _escritos, tope: TOPE_SESION, distintos: Object.keys(_vistos).length};
    }
  };

  try {
    global.addEventListener('error', function (ev) {
      Errores.anotar('window.onerror', ev && (ev.error || ev.message), {
        archivo: ev && ev.filename ? String(ev.filename).split('/').pop() : '',
        linea: ev && ev.lineno
      });
    });
    global.addEventListener('unhandledrejection', function (ev) {
      Errores.anotar('promesa sin atrapar', ev && ev.reason);
    });
  } catch (_) {  }

  global.Errores = Errores;

})(window);
