"use strict";

/**
 * functions/etiquetas.js — QUÉ ETIQUETA LE TOCA A UN PEDIDO
 * ==========================================================
 * La fórmula del negocio, en un solo sitio.
 *
 * ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
 * Lo usan los DOS: el panel (que lo carga como `functions/etiquetas.js`) y el
 * barrido programado del servidor. Una copia en cada lado divergiría, y
 * divergir AQUÍ significa que el barrido mueva una etiqueta que el panel
 * habría rechazado — de madrugada, sin nadie delante. Un archivo raro de ver
 * en el árbol es mejor que dos reglas que deciden si tus pedidos retroceden.
 *
 * LA FÓRMULA (del manual del panel, ajustada en un punto):
 *   existe la guía / En origen / En tránsito → ENVIADO
 *   En destino · En reparto                  → LLEGÓ A DESTINO
 *   …y si queda saldo                        → PENDIENTE DE PAGO
 *   Entregado                                → FINALIZADO
 *   …y si queda saldo                        → PENDIENTE DE PAGO
 *
 * ⚠️ EL PUNTO AJUSTADO: el manual decía «Demora de envíos → ENVIADO». Esa
 * línea es la que hacía que un pedido en LLEGÓ A DESTINO saltara hacia atrás
 * al demorarse. La demora ya no es un estado sino una bandera: se AVISA (el
 * cliente la ve en su link) y no mueve nada. La etiqueta sigue al paso real.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Etiquetas = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /** El orden del recorrido. Su ÍNDICE es lo que define "avanzar". */
  const ESCALERA = ["NUEVO PEDIDO", "EN PROCESO", "POR ALISTAR", "ALISTADO",
    "ENVIADO", "LLEGÓ A DESTINO", "PENDIENTE DE PAGO", "FINALIZADO"];

  const MODOS = {APAGADO: "apagado", SEMI: "semi", AUTO: "auto"};

  /**
   * Dónde está una etiqueta en la escalera. -1 = no está.
   * @param {string} etiqueta nombre de la etiqueta
   * @return {number} índice o -1
   */
  function escalon(etiqueta) {
    return ESCALERA.indexOf(String(etiqueta || "").trim().toUpperCase());
  }

  /**
   * Cuánto ha avanzado el envío según el TEXTO de Shalom, 0..3.
   * null = no se puede clasificar, y entonces no se decide nada con él.
   *
   * Vive aquí y no en tracking.js porque el barrido necesita exactamente la
   * misma respuesta. Una demora devuelve null a propósito: no es un punto del
   * recorrido, así que no puede ni adelantar ni hacer retroceder a nadie.
   * @param {string} texto estado tal como lo dice Shalom
   * @return {?number} 0..3 o null
   */
  function rangoDeTexto(texto) {
    const u = String(texto || "").toUpperCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!u.trim()) return null;
    if (u.indexOf("DEMORA") >= 0 || u.indexOf("RETRAS") >= 0) return null;
    if (u.indexOf("ENTREGAD") >= 0) return 3;
    if (u.indexOf("REPART") >= 0) return 2;
    if (u.indexOf("DESTINO") >= 0 || u.indexOf("AGENCIA") >= 0 ||
        u.indexOf("RECOJO") >= 0 || u.indexOf("RECOGER") >= 0) return 2;
    if (u.indexOf("TRANSITO") >= 0 || u.indexOf("CAMINO") >= 0 ||
        u.indexOf("RUTA") >= 0) return 1;
    if (u.indexOf("ORIGEN") >= 0 || u.indexOf("REGISTRAD") >= 0) return 0;
    return null;
  }

  /**
   * ¿Le queda saldo por cobrar? `cost` es lo que ya calcula el formulario
   * (monto − adelanto); si falta, se recalcula de los dos campos.
   * @param {Object} pedido el pedido
   * @return {boolean} true si debe algo
   */
  function haySaldo(pedido) {
    const p = pedido || {};
    const n = (x) => {
      const v = parseFloat(x);
      return isFinite(v) ? v : 0;
    };
    const bruto = (p.cost === undefined || p.cost === null) ? "" :
      String(p.cost).trim();
    if (bruto !== "") return n(bruto) > 0;
    return (n(p.monto) - n(p.adelanto)) > 0;
  }

  /**
   * La etiqueta que le tocaría por el recorrido, SIN mirar dónde está hoy.
   * @param {number} rango 0..3
   * @param {Object} pedido el pedido (para el saldo)
   * @return {?string} etiqueta o null
   */
  function etiquetaDeRango(rango, pedido) {
    if (rango === 0 || rango === 1) return "ENVIADO";
    if (rango === 2) {
      return haySaldo(pedido) ? "PENDIENTE DE PAGO" : "LLEGÓ A DESTINO";
    }
    if (rango === 3) {
      /* Entregado CON saldo no se cierra. Shalom entregó el paquete, pero a ti
         no te pagaron: cerrar ese pedido solo es un error de negocio que la
         máquina no debe poder cometer. Se queda esperándote. */
      return haySaldo(pedido) ? "PENDIENTE DE PAGO" : "FINALIZADO";
    }
    return null;
  }

  /**
   * LA DECISIÓN COMPLETA. Único punto por el que pasan el panel y el barrido.
   * Devuelve null cuando no hay que mover nada — que es la mayoría de veces.
   * @param {Object} pedido el pedido tal como está guardado
   * @param {Object} res respuesta ya traducida de /track
   * @param {string} modo apagado | semi | auto
   * @return {?Object} {nueva, porQue} o null
   */
  function decidirEtiqueta(pedido, res, modo) {
    const p = pedido || {};
    const m = String(modo || MODOS.SEMI).toLowerCase();
    if (m === MODOS.APAGADO) return null;
    if (!res || !res.ok) return null;

    const rango = (typeof res.pasos === "number") ?
      res.pasos : rangoDeTexto(res.estado);
    if (rango === null || rango === undefined) return null;

    let nueva = etiquetaDeRango(rango, p);
    if (!nueva) return null;

    /* EN MODO SEMI, FINALIZADO LO CIERRAS TÚ — pero el pedido igual avanza
       hasta donde puede sin cerrarse.

       Antes esto devolvía null y el pedido se quedaba QUIETO. Lo vio el
       simulacro: tres pedidos que Shalom daba por entregados seguían en
       ENVIADO. Y no era solo feo — en cuanto se guarda `trackingStatus:
       "Entregado"`, el barrido deja de consultarlos (ya no pueden traer nada
       nuevo), así que se habrían quedado en ENVIADO para siempre.

       Si está entregado, como mínimo llegó a destino. Eso se puede afirmar. */
    if (m === MODOS.SEMI && nueva === "FINALIZADO") nueva = "LLEGÓ A DESTINO";

    const actual = String(p.status || "").trim().toUpperCase();
    if (nueva === actual) return null; // ya está ahí

    /* ⚠️ UNA ETIQUETA QUE NO ESTÁ EN LA ESCALERA NO SE TOCA JAMÁS.
       "RECLAMOS, DEVOLUCIONES, GARANTÍA", "AVISAR CUANDO LLEGUE", "RETORNO A
       ORIGEN"… son etiquetas tuyas, puestas a mano para algo que el recorrido
       de Shalom no sabe. Si no se puede ubicar en la escalera, no se puede
       saber si moverla sería avanzar o retroceder — y ante la duda, no se
       mueve. Sin esta regla, un pedido en RECLAMOS volvería a ENVIADO solo. */
    const deAhora = escalon(actual);
    if (deAhora < 0) return null;

    // Un envío no desanda el camino.
    if (escalon(nueva) <= deAhora) return null;

    return {nueva: nueva, porQue: res.estado || ("paso " + rango)};
  }

  return {
    ESCALERA,
    MODOS,
    escalon,
    rangoDeTexto,
    haySaldo,
    etiquetaDeRango,
    decidirEtiqueta,
  };
});
