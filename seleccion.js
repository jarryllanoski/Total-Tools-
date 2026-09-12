/**
 * seleccion.js — Qué pedidos están marcados, en ESTE dispositivo
 * ==============================================================
 * Un solo dueño de la selección, igual que shalom.js lo es del rastreo.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * Antes la selección era un campo del pedido (`ship.sel`). Parece inofensivo y
 * no lo es: el pedido es la cosa que se sincroniza. `slimShipment` copia el
 * pedido entero al subirlo, así que `sel` viajaba de acarreo a Firestore en
 * cualquier guardado; y `_mergeRemote` reemplaza los pedidos con los remotos
 * cada 5 segundos sin conservar `sel`. Resultado: desmarcabas algo y cinco
 * segundos después volvía solo, o te aparecía marcado lo que marcó otro
 * vendedor en su pantalla.
 *
 * Y no era solo molesto. `delSelected` leía la selección DOS VECES —una al
 * abrir el aviso y otra al confirmar— y entre las dos cabía un latido: podía
 * desaparecer de la pantalla un pedido que nunca entró a la papelera ni se
 * borró de Firestore.
 *
 * LA REGLA, para cualquier dato que venga después:
 *   ¿de esto depende un cliente o un pedido?  → va compartido, en Firestore
 *   ¿solo cambia lo que ves TÚ en tu pantalla? → va local, como esto
 *
 * La selección es lo segundo: es efímera, es tuya, y muere al recargar.
 *
 * A PROPÓSITO NO SE GUARDA en localStorage. Marcar 60 pedidos obligaba a
 * serializar el estado completo (~0,7 MB con 1039 pedidos) en cada clic. Y
 * tampoco tiene sentido: si recargas la página, esa selección ya no describe
 * nada que estuvieras haciendo.
 */
(function (global) {
  'use strict';

  var _ids = new Set();

  /* Los pedidos vivos, sea cual sea la fuente. Se lee al vuelo (y no se
     guarda) porque _mergeRemote reemplaza el array entero cada pocos
     segundos: una referencia guardada quedaría apuntando a fantasmas. */
  function _pedidos() {
    return (global.S && Array.isArray(global.S.shipments)) ? global.S.shipments : [];
  }

  var Seleccion = {

    tiene: function (id) { return _ids.has(String(id)); },

    cantidad: function () { return this.ids().length; },

    hayAlguno: function () { return this.cantidad() > 0; },

    /* Los ids marcados QUE TODAVÍA EXISTEN. Un pedido borrado (acá o en otro
       dispositivo) deja de contar sin que nadie tenga que acordarse de
       limpiarlo: el olvido es lo que produce borrados fantasma. */
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

    /* Los pedidos marcados, en el orden en que están en el panel. */
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

    /* ── Pintado: se toca el DOM que cambió, no se rehace la lista ──────────
       Volver a montar las tarjetas con innerHTML obliga al navegador a
       reconstruir ~50 nodos por tarjeta (unos 50 000 con 1039 pedidos) y a
       recalcular el layout entero. Marcar una casilla no cambia la LISTA:
       cambia una casilla. Así que se cambia una clase y un carácter. */
    _pintarUno: function (id) {
      var doc = global.document;
      if (!doc) return;
      var card = doc.querySelector('.card[data-id="' + _cssId(id) + '"]');
      if (!card) return; // fuera del filtro actual: se pintará al renderizar
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

    /* Limpia el `sel` que quedó guardado dentro de los pedidos viejos.
       Solo en memoria: NO se reescriben los documentos de Firestore. Ese
       campo es inerte —ya nadie lo lee— y borrarlo de verdad costaría
       reescribir un millar de documentos de golpe, que es exactamente la
       tanda que deja el indicador de Firebase en rojo. Se limpia en memoria
       para que no vuelva a subir de acarreo. */
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
