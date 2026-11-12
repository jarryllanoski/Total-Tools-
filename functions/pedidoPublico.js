"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.PedidoPublico = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CAMPOS = [
    "id", "code", "frozen", "createdAt", "date", "status",
    "minimo",
    "nroComprobante",
    "name", "address", "ciudadDestino", "referencia", "encAgencia",
    "dni", "dniRecoger", "dniDestinatario",
    "courier", "notes", "extra", "links",
    "shalomGuia", "shalomCodigo",
    "trackingOrderNumber", "trackingOrderCode",
    "trackingStatus", "trackingMessage", "trackingLastUpdate",
  ];

  const SECRETOS = [
    "shalomClave",
    "privateNote", "shalomGuiasAnteriores",
    "agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier",
  ];

  const ENMASCARAR = ["dni", "dniRecoger", "dniDestinatario"];

  const VISIBLES = 5;
  const TAPADOS_MIN = 3;

  function recortarDoc(valor) {
    if (typeof valor !== "string" || valor === "") return valor;
    const n = valor.length;
    const ver = Math.min(VISIBLES, Math.max(0, n - TAPADOS_MIN));
    return valor.slice(0, ver) + "*".repeat(n - ver);
  }

  function proyectar(pedido, extra) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    const e = (extra && typeof extra === "object") ? extra : {};
    const fuente = Object.assign({}, p, e);
    const out = {};
    CAMPOS.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(fuente, k)) out[k] = fuente[k];
    });
    SECRETOS.forEach((k) => {
      delete out[k];
    });
    ENMASCARAR.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        out[k] = recortarDoc(out[k]);
      }
    });
    if (typeof out.notes === "string") out.notes = taparClave(out.notes);
    if (out.extra && typeof out.extra === "object") {
      const ex = {};
      Object.keys(out.extra).forEach((k) => {
        ex[k] = /clave/i.test(k) ? "****" : taparClave(out.extra[k]);
      });
      out.extra = ex;
    }
    return out;
  }

  function taparClave(t) {
    if (typeof t !== "string") return t;
    return t.replace(/(clave[^0-9\n]{0,20})\d{4}/gi, "$1****");
  }

  const DIAS_MINIMO = 60;
  const CAMPOS_MINIMOS = ["id", "code", "frozen", "createdAt", "date",
    "status", "nroComprobante", "courier", "shalomGuia", "shalomCodigo",
    "minimo"];

  function minimizarViejo(out, pedido, ahoraMs) {
    const p = pedido || {};
    const fin = ["FINALIZADO", "ENTREGADO"].indexOf(
        String(p.status || "").trim().toUpperCase()) >= 0;
    const t = Date.parse(String(p.createdAt || p.date || ""));
    if (!fin || !isFinite(t) || ahoraMs - t < DIAS_MINIMO * 86400000) {
      return out;
    }
    const m = {minimo: true};
    CAMPOS_MINIMOS.forEach((k) => {
      if (k in out) m[k] = out[k];
    });
    return m;
  }

  function secretosEn(obj) {
    if (!obj || typeof obj !== "object") return [];
    return SECRETOS.filter((k) =>
      Object.prototype.hasOwnProperty.call(obj, k));
  }

  return {CAMPOS, SECRETOS, ENMASCARAR, proyectar, secretosEn,
    recortarDoc, taparClave, minimizarViejo, DIAS_MINIMO};
});
