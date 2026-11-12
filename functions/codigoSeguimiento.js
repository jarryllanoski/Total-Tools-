"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.CodigoSeguimiento = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CORTE = "2026-08-08";

  function de(id, createdAt) {
    const sid = String(id === null || id === undefined ? "" : id);
    if (!sid) return "";
    const fecha = String(createdAt || "").slice(0, 10);
    const num = sid.replace(/\D/g, "");
    if (fecha && fecha >= CORTE && num) return num.slice(-6);
    return sid.slice(-4).toUpperCase();
  }

  return {de, CORTE};
});
