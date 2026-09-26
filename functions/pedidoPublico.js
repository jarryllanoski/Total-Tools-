"use strict";

/**
 * functions/pedidoPublico.js — QUÉ VE EL CLIENTE DE SU PEDIDO
 * =============================================================
 * Un pedido tiene hoy más de sesenta campos y mañana tendrá más. El link de
 * seguimiento es público: quien tenga la dirección ve lo que este archivo
 * decida, y solo eso.
 *
 * ⚠️ POR QUÉ ESTO ES UNA LISTA BLANCA Y NO UNA NEGRA
 * Antes, `handleTrack` copiaba el pedido ENTERO y borraba una lista de
 * campos prohibidos. Con ese diseño, **cada campo nuevo nace público**: nadie
 * se acuerda de añadirlo a la lista de borrados, y el fallo no se ve — el
 * dato simplemente viaja.
 *
 * Pasó de verdad: la clave de recojo (`shalomClave`) se añadió al pedido y
 * empezó a salir en la respuesta del link sin que nada avisara.
 *
 * Es exactamente **OWASP API3:2023 — Broken Object Property Level
 * Authorization** (antes "Excessive Data Exposure"), cuya causa documentada
 * es *"serializar objetos enteros y confiar en que el cliente filtre"* y cuyo
 * remedio es este: **enumerar lo permitido; lo demás no sale.**
 *
 * DOS REJAS INDEPENDIENTES, no una:
 *   1. Solo salen los campos de `CAMPOS`.
 *   2. Y aunque alguien meta un secreto en `CAMPOS` por error, `SECRETOS`
 *      lo quita igual. Hacen falta DOS equivocaciones para filtrar algo.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.PedidoPublico = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /**
   * Lo ÚNICO que el cliente ve de su pedido.
   *
   * Añadir aquí es una decisión consciente: significa "esto puede verlo
   * cualquiera que tenga el link, hoy y dentro de un año, porque un link se
   * reenvía y no caduca".
   *
   * `dni`, `dniRecoger`, `dniDestinatario` y `notes` están a propósito: el
   * dueño pidió que el cliente los viera en su link.
   */
  const CAMPOS = [
    // Identidad del pedido
    "id", "code", "frozen", "createdAt", "date", "status",
    // A quién y a dónde
    "name", "address", "ciudadDestino", "referencia", "encAgencia",
    "dni", "dniRecoger", "dniDestinatario",
    // Qué y con quién
    "courier", "notes", "extra", "links",
    // Seguimiento de Shalom
    "shalomGuia", "shalomCodigo",
    "trackingOrderNumber", "trackingOrderCode",
    "trackingStatus", "trackingMessage", "trackingLastUpdate",
  ];

  /**
   * Lo que NO SALE JAMÁS, aunque alguien lo ponga en `CAMPOS`.
   *
   * `shalomClave` es la clave de recojo: los cuatro dígitos con los que se
   * retira el paquete en la agencia. Si viaja en el link, deja de proteger
   * nada — un link se reenvía, se queda en un historial y no caduca.
   *
   * Los cuatro de agencia no son secretos, pero el cliente no los necesita y
   * lo que no hace falta no viaja.
   */
  const SECRETOS = [
    "shalomClave",
    "agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier",
  ];

  /**
   * El pedido tal como lo ve el cliente.
   * @param {Object} pedido documento completo de Firestore
   * @param {Object} [extra] campos calculados por el endpoint (code, frozen…)
   * @return {Object} solo lo permitido
   */
  function proyectar(pedido, extra) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    const e = (extra && typeof extra === "object") ? extra : {};
    const fuente = Object.assign({}, p, e);
    const out = {};
    CAMPOS.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(fuente, k)) out[k] = fuente[k];
    });
    // Segunda reja. Si esto llega a borrar algo, es que alguien metió un
    // secreto en CAMPOS — y el fallo queda tapado igual.
    SECRETOS.forEach((k) => {
      delete out[k];
    });
    return out;
  }

  /**
   * ¿Se le escapó algún secreto a este objeto? Para las pruebas y para poder
   * afirmarlo, no suponerlo.
   * @param {Object} obj objeto a revisar
   * @return {Array<string>} los secretos que contiene (vacío = limpio)
   */
  function secretosEn(obj) {
    if (!obj || typeof obj !== "object") return [];
    return SECRETOS.filter((k) =>
      Object.prototype.hasOwnProperty.call(obj, k));
  }

  return {CAMPOS, SECRETOS, proyectar, secretosEn};
});
