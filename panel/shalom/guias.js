(function (global) {
  'use strict';

  var LARGO = 8;
  var FORMATO = /^(?:[0-9]{8}|1[0-9]{8})$/;
  var MAX_LISTA = 3;

  function _guiaDe(s) {
    if (!s) return '';
    return String(s.trackingOrderNumber || s.shalomGuia || '').trim();
  }

  function revisar(numero, idActual, lista) {
    var n = String(numero === null || numero === undefined ? '' : numero).trim();
    var avisos = [];
    if (!n) return avisos;

    if (!/^[0-9]+$/.test(n)) {
      avisos.push({tipo: 'FORMATO', texto: 'La guía solo lleva números.'});
    } else if (!FORMATO.test(n)) {
      avisos.push({
        tipo: 'FORMATO',
        texto: 'Una guía de Shalom tiene ' + LARGO + ' dígitos, o 9 si ' +
          'empieza por 1; esta tiene ' + n.length +
          (n.length === LARGO + 1 ? ' y empieza por ' + n.charAt(0) : '') +
          '. Revisa que no falte o sobre uno.'
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

  function vigilar(idInput, idActual) {
    var doc = global.document;
    if (!doc) return;
    var input = doc.getElementById(idInput);
    if (!input) return;

    var pintar = function () {
      var lista = (global.S && global.S.shipments) || [];
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

    input._guiasIdActual = idActual;
    if (input._guiasEnganchado !== true) {
      input.addEventListener('input', pintar);
      input.addEventListener('blur', pintar);
      input._guiasEnganchado = true;
    }
    pintar();
  }

  global.Guias = {
    LARGO: LARGO,
    FORMATO: FORMATO,
    revisar: revisar,
    vigilar: vigilar
  };

})(window);
