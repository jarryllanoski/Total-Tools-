"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.DniPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  function _txt(x) {
    return (x === undefined || x === null) ? "" : String(x).trim();
  }

  function de(p) {
    const o = (p && typeof p === "object") ? p : {};
    if (o.dni !== undefined && o.dni !== null) return _txt(o.dni);
    const r = _txt(o.dniRecoger);
    if (r) return r;
    return _txt(o.dniDestinatario);
  }

  function etiqueta(p) {
    const o = (p && typeof p === "object") ? p : {};
    if (_txt(o.ciudadDestino) || _txt(o.encAgencia) ||
        _txt(o.dniDestinatario)) {
      return "DNI destinatario";
    }
    if (_txt(o.agenciaId) || _txt(o.dniRecoger)) return "DNI para recoger";
    return "DNI";
  }

  function copiasAlDia(previo, dni) {
    const o = (previo && typeof previo === "object") ? previo : {};
    const v = _txt(dni);
    const out = {};
    if (o.dniRecoger !== undefined) out.dniRecoger = v;
    if (o.dniDestinatario !== undefined) out.dniDestinatario = v;
    return out;
  }

  return {de, etiqueta, copiasAlDia};
});
