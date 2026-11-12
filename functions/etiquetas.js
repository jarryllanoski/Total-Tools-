"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica(require("./shalomEstado"));
  } else {
    raiz.Etiquetas = fabrica(raiz.ShalomEstado);
  }
})(typeof globalThis !== "undefined" ? globalThis : window, (ShalomEstado) => {
  const ESCALERA = ["NUEVO PEDIDO", "EN PROCESO", "POR ALISTAR", "ALISTADO",
    "ENVIADO", "LLEGÓ A DESTINO", "PENDIENTE DE PAGO", "FINALIZADO"];

  const MODOS = {APAGADO: "apagado", SEMI: "semi", AUTO: "auto"};

  function escalon(etiqueta) {
    return ESCALERA.indexOf(String(etiqueta || "").trim().toUpperCase());
  }

  function rangoDeTexto(texto) {
    return ShalomEstado.rango(texto);
  }

  function haySaldo(pedido) {
    const p = pedido || {};
    const n = (x) => {
      const v = parseFloat(x);
      return isFinite(v) ? v : 0;
    };
    const bruto = (p.cost === undefined || p.cost === null) ? "" :
      String(p.cost).trim();
    if (bruto !== "") return n(bruto) > 0;
    return (n(p.monto) - n(p.adelanto)) > 0;
  }

  function etiquetaDeRango(rango, pedido) {
    if (rango === 0 || rango === 1) return "ENVIADO";
    if (rango === 2) {
      return haySaldo(pedido) ? "PENDIENTE DE PAGO" : "LLEGÓ A DESTINO";
    }
    if (rango === 3) {
      return haySaldo(pedido) ? "PENDIENTE DE PAGO" : "FINALIZADO";
    }
    return null;
  }

  function decidirEtiqueta(pedido, res, modo) {
    const p = pedido || {};
    const m = String(modo || MODOS.SEMI).toLowerCase();
    if (m === MODOS.APAGADO) return null;
    if (!res || !res.ok) return null;

    const rango = (typeof res.pasos === "number") ?
      res.pasos : rangoDeTexto(res.estado);
    if (rango === null || rango === undefined) return null;

    let nueva = etiquetaDeRango(rango, p);
    if (!nueva) return null;

    if (m === MODOS.SEMI && nueva === "FINALIZADO") nueva = "LLEGÓ A DESTINO";

    const actual = String(p.status || "").trim().toUpperCase();
    if (nueva === actual) return null;

    const deAhora = escalon(actual);
    if (deAhora < 0) return null;

    if (escalon(nueva) <= deAhora) return null;

    return {nueva: nueva, porQue: res.estado || ("paso " + rango)};
  }

  return {
    ESCALERA,
    MODOS,
    escalon,
    rangoDeTexto,
    haySaldo,
    etiquetaDeRango,
    decidirEtiqueta,
  };
});
