"use strict";

/**
 * functions/fechaPedido.js — LAS DOS FECHAS DE UN PEDIDO.
 * =======================================================
 *   envío      `date`: el día programado para despachar («2026-10-28»).
 *   registro   el día en que ENTRÓ el pedido, sacado de `createdAt`.
 *
 * ⚠️ `createdAt` ESTÁ EN HORA UNIVERSAL, NO DE PERÚ. Un pedido registrado
 * el 26/10 a las 8:00 p. m. en Lima se guarda «2026-10-27T01:00:00Z».
 * Cortar los diez primeros caracteres lo mandaría al día siguiente — justo
 * los pedidos que llegan de noche. Aquí se convierte a la hora de Lima.
 *
 * ⚠️ LA IMPORTACIÓN DE EXCEL GUARDA «AAAA-MM-DDT00:00:00.000Z»: un día sin
 * hora. Convertido a Lima caería en el día ANTERIOR (medianoche UTC son las
 * 7:00 p. m. del día previo). Ese patrón exacto se toma tal cual.
 *
 * Solo lee: no escribe nada en ningún pedido.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.FechaPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const ZONA = "America/Lima";
  const DIA = /^\d{4}-\d{2}-\d{2}$/;
  const SIN_HORA = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;

  /**
   * «AAAA-MM-DD» de un instante, en la hora de Lima.
   * @param {Date} d instante
   * @return {string} el día, o "" si la fecha no vale
   */
  function diaLima(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    // en-CA da «AAAA-MM-DD» directamente.
    return new Intl.DateTimeFormat("en-CA", {timeZone: ZONA,
      year: "numeric", month: "2-digit", day: "2-digit"}).format(d);
  }

  /**
   * Día de envío.
   * @param {Object} p el pedido
   * @return {string} el `date` guardado, o ""
   */
  function envio(p) {
    // Tal cual está guardado: es lo que comparaba la búsqueda antes de este
    // módulo, y con «Fecha de envío» tiene que dar EXACTAMENTE lo mismo.
    return String((p && p.date) || "");
  }

  /**
   * Día de registro, en hora de Lima.
   * @param {Object} p el pedido
   * @return {string} «AAAA-MM-DD», o "" si no tiene `createdAt`
   */
  function registro(p) {
    const v = String((p && p.createdAt) || "").trim();
    if (!v) return "";
    const m = SIN_HORA.exec(v);
    if (m) return m[1];
    if (DIA.test(v)) return v;
    return diaLima(new Date(v));
  }

  /**
   * Hoy, en Lima.
   * @param {Date} [ahora] para las pruebas
   * @return {string} «AAAA-MM-DD»
   */
  function hoyLima(ahora) {
    return diaLima(ahora || new Date());
  }

  /**
   * La fecha que manda según el campo elegido en la búsqueda avanzada.
   * @param {Object} p el pedido
   * @param {string} campo "registro" | "envio" (por defecto, envío)
   * @return {string} «AAAA-MM-DD», o ""
   */
  function segun(p, campo) {
    return campo === "registro" ? registro(p) : envio(p);
  }

  /**
   * ¿El pedido cae en el rango? Desde/hasta vacíos no limitan. Sin fecha
   * en el campo elegido, no entra (si hay algún límite puesto).
   * @param {Object} p el pedido
   * @param {string} campo "registro" | "envio"
   * @param {string} desde «AAAA-MM-DD» o ""
   * @param {string} hasta «AAAA-MM-DD» o ""
   * @return {boolean} si entra
   */
  function enRango(p, campo, desde, hasta) {
    if (!desde && !hasta) return true;
    const f = segun(p, campo);
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  }

  return {ZONA, diaLima, envio, registro, hoyLima, segun, enRango};
});
