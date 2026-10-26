"use strict";

/**
 * functions/montoPedido.js — CUÁNTO DEBE UN PEDIDO, Y CÓMO SE ENSEÑA.
 * ===================================================================
 * Tres pantallas enseñan el monto de un pedido: la tarjeta, el aviso de
 * «llegó a destino» y «Editar». Hasta el 26/10/2026 solo «Editar» sabía
 * decir «ya pagó» (monto tachado); la tarjeta enseñaba `cost` crudo
 * —«S/ 15996.1», «S/ 33.333333»— y nada si no había monto. Tres sitios con
 * su propia regla terminan diciendo cosas distintas del mismo pedido.
 *
 * LOS TRES CASOS, con las cuentas de siempre (deuda = monto − adelanto,
 * guardada en `cost`):
 *
 *   debe     la deuda es mayor que 0       → «S/ 45.50»
 *   pagado   hay monto y la deuda es 0     → «S/ 120.00» TACHADO
 *   sin      no hay monto ni deuda         → «S/ 0.00»
 *
 * ⚠️ LOS PEDIDOS DE ANTES NO CAMBIAN. Su tarjeta sigue enseñando lo que
 * enseñaba (ver `esNuevo`): el dueño pidió que lo de hoy no le cambie la
 * cara a 1500 pedidos de ayer. Solo es presentación: nada se guarda.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.MontoPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CORTE = "2026-10-26";

  /**
   * Un importe como número: vacío, basura o negativo → 0.
   * Admite la coma de miles («1,234.5»).
   * @param {*} x lo que haya guardado
   * @return {number} el importe, nunca NaN ni negativo
   */
  function num(x) {
    if (x === undefined || x === null) return 0;
    const n = Number(String(x).replace(/,/g, "").trim());
    return (isFinite(n) && n > 0) ? n : 0;
  }

  /**
   * «S/ 1,234.50»: redondeado a céntimos, siempre con dos decimales.
   * @param {number} n importe
   * @return {string} el importe para enseñar
   */
  function formato(n) {
    const r = Math.round(num(n) * 100) / 100;
    return "S/ " + r.toLocaleString("en-US",
        {minimumFractionDigits: 2, maximumFractionDigits: 2});
  }

  /**
   * El caso, a partir de monto y adelanto (lo que se escribe en «Editar»).
   * @param {*} monto monto total
   * @param {*} adelanto lo ya pagado
   * @return {Object} {tipo: debe|pagado|sin, valor, texto}
   */
  function deDatos(monto, adelanto) {
    const m = num(monto);
    const d = Math.max(0, m - num(adelanto));
    if (d > 0) return {tipo: "debe", valor: d, texto: formato(d)};
    if (m > 0) return {tipo: "pagado", valor: m, texto: formato(m)};
    return {tipo: "sin", valor: 0, texto: formato(0)};
  }

  /**
   * El caso de un pedido GUARDADO. La deuda es `cost` —lo que leen tarjeta,
   * dashboard y seguimiento—; el monto, `monto`, o `cost` en los pedidos de
   * antes de que existiera ese campo (ahí `cost` era el total).
   * @param {Object} p el pedido
   * @return {Object} {tipo: debe|pagado|sin, valor, texto}
   */
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

  /**
   * ¿Este pedido se enseña con la regla nueva? Los creados desde el corte.
   * @param {Object} p el pedido
   * @return {boolean} true si es de hoy en adelante
   */
  function esNuevo(p) {
    const f = String((p && p.createdAt) || "").slice(0, 10);
    return !!f && f >= CORTE;
  }

  /**
   * El importe listo para pintar: tachado si ya pagó. Solo lleva dígitos,
   * comas, puntos y «S/», así que no hay nada que escapar.
   * @param {Object} e lo que devuelve `de` o `deDatos`
   * @return {string} HTML
   */
  function html(e) {
    return e.tipo === "pagado" ? "<s>" + e.texto + "</s>" : e.texto;
  }

  return {CORTE, num, formato, deDatos, de, esNuevo, html};
});
