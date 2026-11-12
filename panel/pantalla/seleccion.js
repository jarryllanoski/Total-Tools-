(function (global) {
  'use strict';

  var _ids = new Set();

  function _pedidos() {
    return (global.S && Array.isArray(global.S.shipments)) ? global.S.shipments : [];
  }

  var Seleccion = {

    tiene: function (id) { return _ids.has(String(id)); },

    cantidad: function () { return this.ids().length; },

    hayAlguno: function () { return this.cantidad() > 0; },

    ids: function () {
      if (!_ids.size) return [];
      var vivos = {}, l = _pedidos();
      for (var i = 0; i < l.length; i++) vivos[String(l[i].id)] = true;
      var out = [];
      _ids.forEach(function (id) {
        if (vivos[id]) out.push(id); else _ids.delete(id);
      });
      return out;
    },

    marcados: function () {
      if (!_ids.size) return [];
      return _pedidos().filter(function (s) { return _ids.has(String(s.id)); });
    },

    alternar: function (id) {
      id = String(id);
      if (_ids.has(id)) _ids.delete(id); else _ids.add(id);
      this._pintarUno(id);
      this._pintarBoton();
      return _ids.has(id);
    },

    marcar: function (ids) {
      (ids || []).forEach(function (x) {
        var id = String(x && x.id !== undefined ? x.id : x);
        if (id) _ids.add(id);
      });
      this._pintarTodo();
    },

    quitar: function (ids) {
      if (!Array.isArray(ids)) ids = [ids];
      ids.forEach(function (x) {
        _ids.delete(String(x && x.id !== undefined ? x.id : x));
      });
      this._pintarTodo();
    },

    limpiar: function () {
      _ids.clear();
      this._pintarTodo();
    },

    _pintarUno: function (id) {
      var doc = global.document;
      if (!doc) return;
      var card = doc.querySelector('.card[data-id="' + _cssId(id) + '"]');
      if (!card) return;
      var chk = card.querySelector('.chk');
      if (!chk) return;
      var on = _ids.has(String(id));
      chk.classList.toggle('on', on);
      chk.textContent = on ? '✓' : '';
    },

    _pintarTodo: function () {
      var doc = global.document;
      if (!doc) return;
      var cards = doc.querySelectorAll('.card[data-id]');
      for (var i = 0; i < cards.length; i++) {
        var chk = cards[i].querySelector('.chk');
        if (!chk) continue;
        var on = _ids.has(String(cards[i].getAttribute('data-id')));
        chk.classList.toggle('on', on);
        chk.textContent = on ? '✓' : '';
      }
      this._pintarBoton();
    },

    _pintarBoton: function () {
      var doc = global.document;
      if (!doc) return;
      var b = doc.getElementById('selAllBtn');
      if (b) b.classList.toggle('sel-on', this.cantidad() > 0);
    },

    _olvidarHeredado: function () {
      var l = _pedidos(), n = 0;
      for (var i = 0; i < l.length; i++) {
        if (l[i] && l[i].sel !== undefined) { delete l[i].sel; n++; }
      }
      return n;
    }
  };

  function _cssId(id) {
    return String(id).replace(/["\\]/g, '\\$&');
  }

  global.Seleccion = Seleccion;

})(window);
