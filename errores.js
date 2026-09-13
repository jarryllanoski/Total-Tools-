/**
 * errores.js — saber qué se rompe en los teléfonos de los demás
 * =============================================================
 * Varios vendedores usan este panel desde equipos distintos. Hoy, si a uno se
 * le rompe algo, aparece un aviso genérico en SU pantalla y ahí muere: nadie
 * más se entera nunca. Eso convierte cualquier fallo intermitente en una
 * cacería a ciegas — y ya perdimos días así.
 *
 * Esto anota los fallos en Firestore, en `<RAIZ>/errores/items`.
 *
 * LO QUE **NO** GUARDA, Y ES DELIBERADO
 * Nada de clientes: ni nombres, ni teléfonos, ni direcciones, ni DNI. Un
 * registro de errores es el sitio más fácil del mundo para filtrar datos de
 * personas sin darse cuenta, porque nadie lo revisa. Se guarda qué se rompió y
 * en qué equipo — nunca con quién estabas trabajando.
 *
 * TRES FRENOS, PORQUE UN BUCLE DE ERRORES CUESTA DINERO
 *   1. Tope duro por sesión: pasado ese número, deja de escribir.
 *   2. El mismo error no se repite: se cuenta, no se duplica.
 *   3. Nunca lanza. Si falla al guardar, se calla — un registro de errores que
 *      rompe la app es peor que no tenerlo.
 */
(function (global) {
  'use strict';

  var TOPE_SESION = 20;      // fallos distintos por sesión, y para
  var VENTANA_MS = 60000;    // el mismo error, no más de uno por minuto
  var _vistos = {};          // huella → { cuando, veces }
  var _escritos = 0;

  function _huella(donde, msg) {
    return (donde + '|' + msg).slice(0, 200);
  }

  /* De un Error, un string o cualquier cosa, saca un mensaje legible.
     Nunca lanza: lo llaman desde manejadores de error, y reventar ahí dejaría
     el fallo original sin registrar Y añadiría uno nuevo. */
  function _mensaje(e) {
    try {
      if (!e) return 'sin mensaje';
      if (typeof e === 'string') return e.slice(0, 300);
      if (e.message) return String(e.message).slice(0, 300);
      return String(e).slice(0, 300);
    } catch (_) { return 'no se pudo leer el error'; }
  }

  /* Las primeras líneas de la pila, que es donde está la información. El resto
     es ruido del navegador y ocuparía espacio en cada documento. */
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
        // El userAgent entero es largo y no aporta; lo que importa es
        // distinguir un equipo de otro y saber si es teléfono o PC.
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

    /* Anota un fallo. `donde` es una etiqueta corta y estable ('render',
       'shalom.consultarGuia', 'guardar'): es lo que permite agrupar después.
       `extra` son datos SIN informacion de personas. */
    anotar: function (donde, e, extra) {
      try {
        if (_escritos >= TOPE_SESION) return;

        var msg = _mensaje(e);
        var h = _huella(donde, msg);
        var ahora = Date.now();
        var visto = _vistos[h];
        if (visto && (ahora - visto.cuando) < VENTANA_MS) {
          visto.veces++;
          return;               // el mismo error, otra vez: se cuenta y ya
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
          // Solo valores simples y cortos. Un objeto entero podría arrastrar
          // un pedido completo con los datos del cliente dentro.
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
      } catch (_) { /* un registro de errores no puede romper nada */ }
    },

    /* Cuántos van en esta sesión — lo usa el diagnóstico de Configuración. */
    resumen: function () {
      return {escritos: _escritos, tope: TOPE_SESION, distintos: Object.keys(_vistos).length};
    }
  };

  /* Los dos manejadores globales atrapan lo que nadie envolvió en try/catch,
     que es justamente lo que hoy se pierde. Se enganchan una sola vez y no
     estorban a los que ya existan. */
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
  } catch (_) { /* navegador sin addEventListener: no pasa nada */ }

  global.Errores = Errores;

})(window);
