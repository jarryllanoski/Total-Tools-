"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Agencias = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CAMPOS = ["agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier"];
  const MAX_ID = 10;
  const MAX_TXT = 120;

  function _plano(s) {
    return String(s == null ? "" : s).trim().toUpperCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ");
  }

  function idValido(x) {
    if (x === null || x === undefined) return false;
    const s = String(x).trim();
    return s.length > 0 && s.length <= MAX_ID && /^[0-9]+$/.test(s);
  }

  function geoDe(ag) {
    if (!ag || typeof ag !== "object") return "";
    const dist = _plano(ag.distrito) || _plano(ag.zona);
    return [_plano(ag.departamento), _plano(ag.provincia), dist].join("|");
  }

  function courierDe(nombre) {
    const u = _plano(nombre);
    if (u.indexOf("SHALOM") >= 0) return "SHALOM";
    if (u.indexOf("OLVA") >= 0) return "OLVA";
    return "";
  }

  function elegida(ag, courier) {
    if (!ag || typeof ag !== "object") return null;
    if (!idValido(ag.ter_id)) return null;
    const c = courierDe(courier);
    if (!c) return null;
    const nom = String(ag.lugar_over || ag.nombre || "").trim();
    return {
      agenciaId: String(ag.ter_id).trim(),
      agenciaNombre: nom.slice(0, MAX_TXT),
      agenciaGeo: geoDe(ag),
      agenciaCourier: c,
    };
  }

  function identificada(pedido) {
    return !!(pedido && idValido(pedido.agenciaId) && pedido.agenciaCourier);
  }

  function limpiar(pedido) {
    const tenia = pedido && CAMPOS.some((k) => {
      return pedido[k] !== undefined && pedido[k] !== null && pedido[k] !== "";
    });
    if (!tenia) return {};
    const out = {};
    CAMPOS.forEach((k) => {
      out[k] = null;
    });
    return out;
  }

  function verificar(pedido, catalogo) {
    if (!identificada(pedido)) return {ok: false, motivo: "SIN_AGENCIA"};
    const id = String(pedido.agenciaId).trim();
    const lista = Array.isArray(catalogo) ? catalogo : [];
    let ag = null;
    for (let i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].ter_id).trim() === id) {
        ag = lista[i]; break;
      }
    }
    if (!ag) return {ok: false, motivo: "NO_ESTA", de: pedido.agenciaGeo || ""};
    const ahora = geoDe(ag);
    if (pedido.agenciaGeo && ahora !== pedido.agenciaGeo) {
      return {ok: false, motivo: "SE_MUDO", de: pedido.agenciaGeo, a: ahora};
    }
    return {ok: true, agencia: ag};
  }

  return {
    CAMPOS,
    idValido,
    geoDe,
    courierDe,
    elegida,
    identificada,
    limpiar,
    verificar,
  };
});
