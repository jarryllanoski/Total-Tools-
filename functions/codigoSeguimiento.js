"use strict";

/**
 * functions/codigoSeguimiento.js — EL CÓDIGO CORTO DE UN PEDIDO (una regla)
 * ==========================================================================
 * Fase 6 (11/11/2026). El «#123456» que ve el cliente en su WhatsApp, en su
 * link de seguimiento y en la ETIQUETA impresa tiene que ser el mismo. Se
 * calculaba en dos sitios (cliente/comun.js y print.js) y divergían en un
 * caso: un pedido antiguo SIN fecha de creación salía con 6 dígitos en el
 * link y con 4 en la etiqueta. Ahora la regla vive aquí.
 *
 *   · Pedidos desde el 2026-08-08: los últimos 6 dígitos del id.
 *   · Antes (o sin fecha, que solo pasa en los antiguos): los últimos 4
 *     caracteres del id, en mayúsculas. NO se tocan: hay etiquetas impresas.
 * Determinístico: mismo pedido → mismo código, sin guardar nada.
 * (Con N° de factura/boleta, ESE es el código: functions/nroComprobante.js.)
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.CodigoSeguimiento = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /** Desde esta fecha, 6 dígitos. */
  const CORTE = "2026-08-08";

  /**
   * El código de un pedido.
   * @param {*} id el id del pedido (id_1762790000000)
   * @param {*} createdAt su fecha de creación, ISO
   * @return {string} 6 dígitos, o 4 caracteres en los antiguos; "" sin id
   */
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
