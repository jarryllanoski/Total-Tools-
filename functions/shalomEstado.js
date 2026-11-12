"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.ShalomEstado = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  function norm(t) {
    return String(t === null || t === undefined ? "" : t).toUpperCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  const REGLAS = [
    {re: /ENTREGAD|RECOGID|CULMIN|(RECEP|RECIB)\w*.*DESTINATARIO/, etapa: 3},
    {re: /REPART/, etapa: 2},
    {re: /ORIGEN/, etapa: 0},
    {re: /TRANSITO|CAMINO|RUTA|TRASLAD|VIAJ|HACIA|DESPACH/, etapa: 1},
    {re: /DESTINO|AGENCIA|RECOJO|RECOGER|DISPONIBLE|LLEG/, etapa: 2},
    {re: /REGISTRAD|RECEP|RECIB|ADMITID|EMITID/, etapa: 0},
  ];

  function esDemora(texto) {
    return /DEMOR|RETRAS/.test(norm(texto));
  }

  function rango(texto) {
    const u = norm(texto);
    if (!u.trim() || esDemora(u)) return null;
    for (let i = 0; i < REGLAS.length; i++) {
      if (REGLAS[i].re.test(u)) return REGLAS[i].etapa;
    }
    return null;
  }

  function fase(texto) {
    if (esDemora(texto)) return {idx: 1, demora: true, reparto: false};
    const r = rango(texto);
    return {idx: r === null ? -1 : r, demora: false,
      reparto: r === 2 && /REPART/.test(norm(texto))};
  }

  return {rango, fase, esDemora, ETAPAS: ["origen", "camino", "destino",
    "entregado"]};
});
