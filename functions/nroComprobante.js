"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.NroComprobante = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const MAX = 20;
  const PREFIJO_QR = "TTPED:";
  const ID_OK = /^[A-Za-z0-9_-]{1,60}$/;

  function limpiar(x) {
    if (x === undefined || x === null) return "";
    return String(x).toUpperCase()
        .replace(/[\s/._]+/g, "-")
        .replace(/[^A-Z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, MAX)
        .replace(/-+$/, "");
  }

  function de(p) {
    return limpiar(p && typeof p === "object" ? p.nroComprobante : "");
  }

  function tipo(nro) {
    const c = String(nro || "").charAt(0);
    if (c === "F") return "FACTURA";
    if (c === "B") return "BOLETA";
    return "COMPROBANTE";
  }

  function coincide(p, q) {
    const n = de(p);
    if (!n) return false;
    const b = limpiar(q);
    return !!b && n.indexOf(b) >= 0;
  }

  function llevaQrPedido(p) {
    const o = (p && typeof p === "object") ? p : {};
    return ID_OK.test(String(o.id || ""));
  }

  function valorQrPedido(p) {
    return llevaQrPedido(p) ? PREFIJO_QR + String(p.id) : "";
  }

  function leerQrPedido(raw) {
    const s = String(raw || "").trim();
    if (s.indexOf(PREFIJO_QR) !== 0) return "";
    const id = s.slice(PREFIJO_QR.length);
    return ID_OK.test(id) ? id : "";
  }

  return {
    MAX, PREFIJO_QR,
    limpiar, de, tipo, coincide, llevaQrPedido, valorQrPedido, leerQrPedido,
  };
});
