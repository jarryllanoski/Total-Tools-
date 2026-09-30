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
   * TERCERA REJA: campos que salen, pero RECORTADOS.
   *
   * Las dos rejas de arriba deciden QUÉ campos salen. Esta decide CUÁNTO de
   * un campo sale. El dueño quiere que el cliente siga viendo su documento
   * —lo necesita para recoger el paquete— pero no entero.
   *
   * ⚠️ LÍMITE HONESTO, y va escrito aquí para que nadie lo olvide después:
   * enseñar 5 de 8 dígitos deja **1000 combinaciones**. Quien tenga el link
   * puede deducir el resto probando. Esto NO convierte el DNI en un secreto.
   * Reduce lo que se regala de un vistazo —una captura reenviada por
   * WhatsApp, alguien mirando la pantalla de al lado—, que es un riesgo real
   * y frecuente. Lo que de verdad protege el dato es que **el link no se
   * pueda adivinar**, y eso es otro trabajo.
   */
  const ENMASCARAR = ["dni", "dniRecoger", "dniDestinatario"];

  /** Cuántos caracteres se enseñan como mucho. */
  const VISIBLES = 5;
  /** Y cuántos se tapan como mínimo, pase lo que pase. */
  const TAPADOS_MIN = 3;

  /**
   * Recorta un documento dejando ver solo el principio.
   *
   * Se enseña el PRINCIPIO y no el final, al revés que una tarjeta de
   * crédito, y es a propósito: en un DNI peruano los primeros dígitos van
   * ligados a la época y el lugar de emisión —o sea, son los más
   * deducibles—, mientras que los últimos son los que menos se pueden
   * inferir. Tapar el final esconde la parte que de verdad cuesta adivinar.
   *
   * El largo se conserva: que se vea si son 8 o 9 no le sirve a nadie para
   * hacer daño, y al cliente le confirma que su dato está completo.
   *
   * @param {*} valor lo que haya en el campo
   * @return {*} recortado, o igual que entró si no es texto con contenido
   */
  function recortarDoc(valor) {
    // Lo que no es texto no se toca: un nulo se queda nulo y un ausente
    // sigue ausente. Inventar un '***' donde no hay dato le diría al cliente
    // que existe algo que no existe.
    if (typeof valor !== "string" || valor === "") return valor;
    const n = valor.length;
    const ver = Math.min(VISIBLES, Math.max(0, n - TAPADOS_MIN));
    return valor.slice(0, ver) + "*".repeat(n - ver);
  }

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
    // Tercera reja: lo que sale, sale recortado.
    ENMASCARAR.forEach((k) => {
      if (Object.prototype.hasOwnProperty.call(out, k)) {
        out[k] = recortarDoc(out[k]);
      }
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

  return {CAMPOS, SECRETOS, ENMASCARAR, proyectar, secretosEn,
    recortarDoc};
});
