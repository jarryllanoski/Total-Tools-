"use strict";

/**
 * functions/nroComprobante.js — EL NÚMERO DE FACTURA O BOLETA DE UN PEDIDO.
 * =========================================================================
 * Lo escribe el dueño al generar un link personalizado (va DENTRO del
 * token, como el monto) o en «Editar pedido». Cuando existe, ES el código
 * del pedido: sustituye al de 6 dígitos en la etiqueta, en el QR, en el
 * escáner y en el WhatsApp de confirmación del cliente.
 *
 * Panel, etiqueta y servidor preguntan AQUÍ. Una sola regla y un solo
 * nombre de campo —`nroComprobante`, no `comprobante`: ese nombre ya lo usan
 * `docComprobante`/`chkComprobante` (la FOTO del comprobante) y el módulo
 * `comprobante.js` (el PDF de API Sale). Dos datos con el mismo nombre
 * terminan mezclándose.
 *
 * ⚠️ POR QUÉ SE LIMPIA. El número viaja dentro de un QR con la forma
 * `teléfono#NÚMERO`. Un `#`, un espacio o una barra dentro del número
 * partirían ese QR en trozos que el escáner leería mal. Así que se queda
 * en lo que lleva un comprobante peruano: letras, números y guion
 * (`F001-00000123`, `B001-456`).
 *
 * ⚠️ SOLO PEDIDOS DE HOY EN ADELANTE. Un pedido sin el campo devuelve "" y
 * todo lo demás sigue exactamente igual que antes: mismo código, mismo QR,
 * misma etiqueta. El QR pequeño del pie solo lo llevan los pedidos creados
 * desde `CORTE_QR_PEDIDO`, o los que tienen número.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.NroComprobante = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const MAX = 20;
  const CORTE_QR_PEDIDO = "2026-10-26";
  // Prefijo del QR pequeño. Lo distingue de los demás QR que lee el panel
  // (el de la etiqueta, `teléfono#código`, y el de la guía Shalom).
  const PREFIJO_QR = "TTPED:";
  const ID_OK = /^[A-Za-z0-9_-]{1,60}$/;

  /**
   * El número, limpio: mayúsculas, letras/números/guion, máximo 20.
   * Espacios, barras y puntos se vuelven guion; los guiones repetidos o en
   * los bordes se quitan. «f001 / 123» → «F001-123».
   * @param {*} x lo que sea
   * @return {string} el número limpio, o ""
   */
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

  /**
   * El número de un pedido. **El único sitio donde se lee.**
   * @param {Object} p el pedido (o el token)
   * @return {string} el número limpio, o ""
   */
  function de(p) {
    return limpiar(p && typeof p === "object" ? p.nroComprobante : "");
  }

  /**
   * Cómo se llama en pantalla, según la serie (SUNAT: F = factura,
   * B = boleta).
   * @param {string} nro el número limpio
   * @return {string} "FACTURA" · "BOLETA" · "COMPROBANTE"
   */
  function tipo(nro) {
    const c = String(nro || "").charAt(0);
    if (c === "F") return "FACTURA";
    if (c === "B") return "BOLETA";
    return "COMPROBANTE";
  }

  /**
   * ¿Lo que se busca está en el número de este pedido? Admite escribirlo
   * en minúsculas, con espacios o a medias («123», «f001 123»).
   * @param {Object} p el pedido
   * @param {string} q el texto del buscador
   * @return {boolean} si coincide
   */
  function coincide(p, q) {
    const n = de(p);
    if (!n) return false;
    const b = limpiar(q);
    return !!b && n.indexOf(b) >= 0;
  }

  /**
   * ¿La etiqueta de este pedido lleva el QR pequeño del pie?
   * @param {Object} p el pedido
   * @return {boolean} si lo lleva
   */
  function llevaQrPedido(p) {
    const o = (p && typeof p === "object") ? p : {};
    if (!ID_OK.test(String(o.id || ""))) return false;
    if (de(o)) return true;
    return String(o.createdAt || "").slice(0, 10) >= CORTE_QR_PEDIDO;
  }

  /**
   * El valor del QR pequeño. Lleva el ID del pedido, no el número impreso:
   * el código de 6 dígitos se repite cada ~17 minutos de reloj, y un número
   * de factura puede repetirse entre dos bultos. El id no se repite nunca,
   * así que escanearlo lleva a UN pedido, sin adivinar.
   * @param {Object} p el pedido
   * @return {string} "TTPED:<id>", o "" si no lleva
   */
  function valorQrPedido(p) {
    return llevaQrPedido(p) ? PREFIJO_QR + String(p.id) : "";
  }

  /**
   * Lee un QR pequeño. Cualquier otra cosa devuelve "".
   * @param {string} raw lo que leyó la cámara
   * @return {string} el id del pedido, o ""
   */
  function leerQrPedido(raw) {
    const s = String(raw || "").trim();
    if (s.indexOf(PREFIJO_QR) !== 0) return "";
    const id = s.slice(PREFIJO_QR.length);
    return ID_OK.test(id) ? id : "";
  }

  return {
    MAX, CORTE_QR_PEDIDO, PREFIJO_QR,
    limpiar, de, tipo, coincide, llevaQrPedido, valorQrPedido, leerQrPedido,
  };
});
