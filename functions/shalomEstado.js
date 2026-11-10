"use strict";

/**
 * functions/shalomEstado.js — QUÉ SIGNIFICA LO QUE DICE SHALOM (una regla)
 * =========================================================================
 * Fase 6 (11/11/2026). El texto de estado de Shalom («En origen», «En
 * tránsito», «En destino», «En reparto», «Entregado», y los textos libres de
 * guías viejas) se interpretaba en DOS sitios con reglas distintas:
 *   · functions/etiquetas.js — panel y servidor: mueve las etiquetas;
 *   · el seguimiento del cliente — lo que ve el cliente.
 * Divergían: «En reparto» movía la etiqueta a LLEGÓ A DESTINO y al cliente
 * le decía «en camino». Y Delfi se calló porque un tercer sitio leía otra
 * cosa. Ahora la regla vive AQUÍ y la usan todos (servidor, panel, cliente).
 *
 * Las cuatro etapas: 0 origen · 1 camino · 2 destino · 3 entregado.
 * La DEMORA no es una etapa (lección cara: un paquete entregado llegó a
 * mostrarse como «Demora de envíos»): `rango` devuelve null y `fase` la
 * marca aparte, para que la pantalla diga «sigue en camino».
 *
 * El ORDEN de las preguntas importa y está probado: «agencia de origen» es
 * origen (no destino), «en camino a destino» es camino, «en reparto» es
 * destino (sale de la agencia de destino hacia el cliente).
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.ShalomEstado = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /**
   * El texto en mayúsculas y sin tildes.
   * @param {*} t el texto
   * @return {string} normalizado
   */
  function norm(t) {
    return String(t === null || t === undefined ? "" : t).toUpperCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  /** Las preguntas, EN ORDEN. La primera que casa decide. */
  const REGLAS = [
    {re: /ENTREGAD|RECOGID|CULMIN|(RECEP|RECIB)\w*.*DESTINATARIO/, etapa: 3},
    {re: /REPART/, etapa: 2},
    {re: /ORIGEN/, etapa: 0},
    {re: /TRANSITO|CAMINO|RUTA|TRASLAD|VIAJ|HACIA|DESPACH/, etapa: 1},
    {re: /DESTINO|AGENCIA|RECOJO|RECOGER|DISPONIBLE|LLEG/, etapa: 2},
    {re: /REGISTRAD|RECEP|RECIB|ADMITID|EMITID/, etapa: 0},
  ];

  /**
   * ¿Es una demora? No es una etapa: es una bandera.
   * @param {*} texto el estado de Shalom
   * @return {boolean} true si habla de demora o retraso
   */
  function esDemora(texto) {
    return /DEMOR|RETRAS/.test(norm(texto));
  }

  /**
   * La etapa del recorrido, para mover etiquetas (nunca hacia atrás).
   * @param {*} texto el estado de Shalom
   * @return {?number} 0..3, o null si no se reconoce o es una demora
   */
  function rango(texto) {
    const u = norm(texto);
    if (!u.trim() || esDemora(u)) return null;
    for (let i = 0; i < REGLAS.length; i++) {
      if (REGLAS[i].re.test(u)) return REGLAS[i].etapa;
    }
    return null;
  }

  /**
   * La etapa para MOSTRAR: como `rango`, pero una demora se ve «en camino»
   * (con su bandera) en vez de quedarse sin etapa.
   * @param {*} texto el estado de Shalom
   * @return {Object} {idx: -1..3, demora, reparto} — `reparto`: en destino
   *   pero ya saliendo hacia el cliente (para decirlo con esas palabras)
   */
  function fase(texto) {
    if (esDemora(texto)) return {idx: 1, demora: true, reparto: false};
    const r = rango(texto);
    return {idx: r === null ? -1 : r, demora: false,
      reparto: r === 2 && /REPART/.test(norm(texto))};
  }

  return {rango, fase, esDemora, ETAPAS: ["origen", "camino", "destino",
    "entregado"]};
});
