"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.MontoPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CORTE = "2026-10-26";

  function num(x) {
    if (x === undefined || x === null) return 0;
    const n = Number(String(x).replace(/,/g, "").trim());
    return (isFinite(n) && n > 0) ? n : 0;
  }

  function formato(n) {
    const r = Math.round(num(n) * 100) / 100;
    return "S/ " + r.toLocaleString("en-US",
        {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  function deDatos(monto, adelanto) {
    const m = num(monto);
    const d = Math.max(0, m - num(adelanto));
    if (d > 0) return {tipo: "debe", valor: d, texto: formato(d)};
    if (m > 0) return {tipo: "pagado", valor: m, texto: formato(m)};
    return {tipo: "sin", valor: 0, texto: formato(0)};
  }

  function de(p) {
    const o = (p && typeof p === "object") ? p : {};
    const deuda = num(o.cost);
    const tieneMonto = o.monto !== undefined && o.monto !== null &&
      String(o.monto).trim() !== "";
    const monto = tieneMonto ? num(o.monto) : deuda;
    if (deuda > 0) return {tipo: "debe", valor: deuda, texto: formato(deuda)};
    if (monto > 0) return {tipo: "pagado", valor: monto, texto: formato(monto)};
    return {tipo: "sin", valor: 0, texto: formato(0)};
  }

  function esNuevo(p) {
    const f = String((p && p.createdAt) || "").slice(0, 10);
    return !!f && f >= CORTE;
  }

  function html(e) {
    return e.tipo === "pagado" ? "<s>" + e.texto + "</s>" : e.texto;
  }

  return {CORTE, num, formato, deDatos, de, esNuevo, html};
});
