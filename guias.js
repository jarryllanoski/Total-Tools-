/**
 * guias.js — avisos sobre el número de guía de Shalom
 * ====================================================
 * Dos avisos, y los dos salieron de mirar los 971 pedidos reales:
 *
 *   1. EL FORMATO. 484 de las 487 guías tienen 8 dígitos. Las otras tres
 *      están mal escritas — y una, `939726661`, estaba EN TRÁNSITO con un
 *      dígito de más: su seguimiento llevaba semanas sin funcionar y no lo
 *      sabía nadie. Un número mal escrito no da error: da silencio.
 *
 *   2. LA GUÍA REPETIDA. Tres números aparecen en dos pedidos. Dos son el
 *      mismo cliente que pidió dos veces y salió en un solo paquete; el
 *      tercero son dos clientes distintos, o sea un error de tipeo. El panel
 *      no puede distinguirlos, y no debe intentarlo: repetir una guía es algo
 *      que se hace a propósito (un retorno a origen reutiliza la misma).
 *
 * POR ESO LOS DOS AVISAN Y NINGUNO IMPIDE. Bloquear el guardado por una guía
 * repetida rompería la forma de trabajar del negocio; callarse deja pasar el
 * error. Avisar es lo único que respeta las dos cosas.
 *
 * `revisar()` es lógica pura: no toca el DOM y se puede probar sola.
 * `vigilar()` es la parte que pinta.
 */
(function (global) {
  'use strict';

  var LARGO = 8;   // lo que mide una guía de Shalom (medido: 484 de 487)
  var MAX_LISTA = 3;

  function _guiaDe(s) {
    if (!s) return '';
    return String(s.trackingOrderNumber || s.shalomGuia || '').trim();
  }

  /**
   * Qué hay que avisar de este número. Devuelve [] si no hay nada que decir.
   * @param {string} numero lo que hay escrito en el campo
   * @param {string} idActual id del pedido que se está editando (se excluye)
   * @param {Array} lista los pedidos donde buscar repetidos
   * @return {Array} avisos {tipo, texto}
   */
  function revisar(numero, idActual, lista) {
    var n = String(numero === null || numero === undefined ? '' : numero).trim();
    var avisos = [];
    // Vacío no es un error: la guía es opcional y se pone después.
    if (!n) return avisos;

    if (!/^[0-9]+$/.test(n)) {
      avisos.push({tipo: 'FORMATO', texto: 'La guía solo lleva números.'});
    } else if (n.length !== LARGO) {
      avisos.push({
        tipo: 'FORMATO',
        texto: 'Una guía de Shalom tiene ' + LARGO + ' dígitos; esta tiene ' +
               n.length + '. Revisa que no falte o sobre uno.'
      });
    }

    var otros = (lista || []).filter(function (s) {
      return s && s.id !== idActual && _guiaDe(s) === n;
    });
    if (otros.length) {
      var nombres = otros.slice(0, MAX_LISTA).map(function (s) {
        return (s.name || 'sin nombre') + ' — ' + (s.status || 'sin etiqueta');
      }).join(' · ');
      var resto = otros.length > MAX_LISTA ?
        ' y ' + (otros.length - MAX_LISTA) + ' más' : '';
      avisos.push({
        tipo: 'REPETIDA',
        pedidos: otros,
        texto: 'Esta guía ya está en otro pedido: ' + nombres + resto + '.'
      });
    }
    return avisos;
  }

  /* ── La parte que pinta ─────────────────────────────────────────────── */

  function _caja(input) {
    var id = 'avisoGuia_' + (input.id || 'x');
    var caja = global.document.getElementById(id);
    if (!caja) {
      caja = global.document.createElement('div');
      caja.id = id;
      caja.style.cssText = 'display:none;margin-top:6px;font-size:11px;' +
        'line-height:1.45;color:#d29922;background:rgba(210,153,34,.08);' +
        'border:1px solid rgba(210,153,34,.25);border-radius:8px;padding:7px 9px';
      if (input.parentNode) input.parentNode.appendChild(caja);
    }
    return caja;
  }

  function _escapar(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Engancha un campo: cada vez que se escribe, se repintan los avisos.
   * Idempotente — llamarlo dos veces sobre el mismo campo no duplica nada.
   * @param {string} idInput id del <input>
   * @param {string} idActual id del pedido que se edita (o '' si es nuevo)
   */
  function vigilar(idInput, idActual) {
    var doc = global.document;
    if (!doc) return;
    var input = doc.getElementById(idInput);
    if (!input) return;

    var pintar = function () {
      var lista = (global.S && global.S.shipments) || [];
      // El id se lee del campo, NO de la variable de arriba: el oyente se
      // engancha una sola vez y se quedaría con el id del primer pedido que
      // se abrió. Al abrir otro, excluiría del control de repetidos al pedido
      // equivocado — y avisaría de que la guía está repetida consigo misma.
      var avisos = revisar(input.value, input._guiasIdActual, lista);
      var caja = _caja(input);
      if (!avisos.length) {
        caja.style.display = 'none';
        caja.innerHTML = '';
        return;
      }
      caja.innerHTML = avisos.map(function (a) {
        return '<div>⚠️ ' + _escapar(a.texto) + '</div>';
      }).join('');
      caja.style.display = 'block';
    };

    // Un solo oyente por campo: el formulario se abre muchas veces y el modal
    // de seguimiento se reconstruye entero cada vez.
    input._guiasIdActual = idActual;   // antes de enganchar: pintar lo lee
    if (input._guiasEnganchado !== true) {
      input.addEventListener('input', pintar);
      input.addEventListener('blur', pintar);
      input._guiasEnganchado = true;
    }
    pintar(); // por si el campo ya viene con algo escrito
  }

  global.Guias = {
    LARGO: LARGO,
    revisar: revisar,
    vigilar: vigilar
  };

})(window);
