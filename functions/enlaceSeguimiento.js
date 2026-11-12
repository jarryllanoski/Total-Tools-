"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.EnlaceSeguimiento = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const LEGADO = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

  const NUEVO = /^t1_[A-Za-z0-9_-]{22}$/;

  const PREFIJO = "t1_";
  const BYTES = 16;

  let _ref = (typeof globalThis !== "undefined" && globalThis.crypto) || null;

  function _crypto(nuevo) {
    if (arguments.length) _ref = nuevo;
    return _ref;
  }

  function _b64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const b64 = (typeof btoa === "function") ?
      btoa(s) : Buffer.from(s, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function generar() {
    const c = _crypto();
    if (!c || typeof c.getRandomValues !== "function") {
      throw new Error("ENLACE_SIN_CRIPTO");
    }
    const a = new Uint8Array(BYTES);
    c.getRandomValues(a);
    return PREFIJO + _b64url(a);
  }

  function tipoDe(token) {
    if (typeof token !== "string") return "invalido";
    if (NUEVO.test(token)) return "nuevo";
    if (LEGADO.test(token)) return "legado";
    return "invalido";
  }

  function aceptaLegado(pedido) {
    if (!pedido || typeof pedido !== "object") return true;
    return !(typeof pedido.trackToken === "string" && pedido.trackToken);
  }

  function tokenDe(pedido) {
    if (!pedido || typeof pedido !== "object") return "";
    if (typeof pedido.trackToken === "string" && pedido.trackToken) {
      return pedido.trackToken;
    }
    return String(pedido.id || "");
  }

  return {LEGADO, NUEVO, PREFIJO, generar, tipoDe, aceptaLegado, tokenDe,
    _crypto};
});
