"use strict";

/**
 * functions/dniPedido.js — EL DNI DE UN PEDIDO. UNO, Y SOLO UNO.
 * ================================================================
 * ⚠️ EL FALLO DEL 13/10/2026, Y POR QUÉ UN DATO NO PUEDE TENER TRES CASAS
 *
 * El dueño corrigió un pedido en el panel: el destinatario pasó de DUBER
 * GARCÍA PEÑA (DNI 76307875) a JOSE LINO CORDOVA MORETO (DNI 44049239). El
 * nombre cambió en todas partes. **El DNI de la etiqueta no.** Imprimió a las
 * 5:51 p. m. un rótulo con el nombre nuevo y el documento viejo.
 *
 * Un pedido guardaba el mismo dato en TRES campos:
 *
 *   dni               el formulario lo escribe siempre
 *   dniRecoger        además, si el envío es a agencia
 *   dniDestinatario   además, si es encomienda
 *
 * Y cada uno de los nueve sitios que lo leían usaba su propio orden:
 *
 *   etiqueta grande   dniRecoger ⟶ dni        → el VIEJO
 *   lista impresa     dniRecoger              → el corregido no salía nunca
 *   seguimiento       dniRecoger ⟶ dniDest.   → al cliente se le decía que
 *                                               fuera con el documento viejo
 *   registro Shalom   dni                      → el NUEVO
 *
 * Así que la etiqueta pegada al paquete y la guía de Shalom llevaban
 * documentos distintos: en la agencia no se lo entregan a nadie.
 *
 * El formulario público YA lo tenía claro —su comentario dice «DNI: fuente
 * única = order.dni»— y la línea de abajo seguía haciendo tres copias. La
 * intención era correcta; el código no la siguió. Un dato con tres copias y
 * sin dueño no es un dato duplicado: es un dato que todavía no se ha
 * contradicho.
 *
 * ⚠️ LA BISAGRA: «NO EXISTE» NO ES LO MISMO QUE «ESTÁ VACÍO»
 *
 * Los cinco lectores rotos usaban `a || b || c`, y ese encadenado no
 * distingue las dos cosas. Aquí sí:
 *
 *   dni AUSENTE (la clave no está)  → se miran las copias viejas
 *   dni PRESENTE, aunque valga ''   → manda él, y punto
 *
 * Y de esa distinción dependen los dos casos que se contradicen:
 *
 *   · un pedido de antes de que existiera el campo `dni` cae a `dniRecoger`
 *     y SIGUE IMPRIMIENDO EXACTAMENTE IGUAL QUE HOY;
 *   · un pedido al que le BORRASTE el DNI a propósito se queda sin DNI, en
 *     vez de resucitar el anterior.
 *
 * Con `||` el segundo caso falla en silencio: borrar un documento haría
 * reaparecer el de otra persona en la etiqueta. Borrar es una decisión, y
 * una decisión no se deshace sola.
 *
 * ⚠️ NO SE NORMALIZA EL TEXTO. Solo se recortan los espacios. Quitar lo que
 * no sean dígitos parecía más limpio hasta caer en el carné de extranjería,
 * que lleva letras: lo habríamos destrozado. Quien necesita ocho dígitos
 * —el registro en Shalom— ya los exige por su cuenta.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.DniPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /**
   * Texto recortado.
   * @param {*} x lo que sea
   * @return {string} cadena sin espacios a los lados, o ""
   */
  function _txt(x) {
    return (x === undefined || x === null) ? "" : String(x).trim();
  }

  /**
   * El DNI de un pedido. **El único sitio donde se decide cuál es.**
   * @param {Object} p el pedido
   * @return {string} el documento, o "" si no hay
   */
  function de(p) {
    const o = (p && typeof p === "object") ? p : {};
    // PRESENTE manda, aunque esté vacío: ver la bisagra, arriba.
    if (o.dni !== undefined && o.dni !== null) return _txt(o.dni);
    const r = _txt(o.dniRecoger);
    if (r) return r;
    return _txt(o.dniDestinatario);
  }

  /**
   * Cómo se llama ese documento en pantalla.
   *
   * ⚠️ SE DEDUCE DEL TIPO DE ENVÍO, NO DE QUÉ COPIA ESTÉ LLENA. Antes el
   * seguimiento público decía «DNI para recoger» solo porque existía
   * `dniRecoger` — así que un pedido a agencia creado desde el panel, que
   * nunca tiene esa copia, le decía «DNI» a secas al cliente. El rótulo
   * seguía al campo en vez de seguir al hecho.
   * @param {Object} p el pedido
   * @return {string} "DNI" · "DNI para recoger" · "DNI destinatario"
   */
  function etiqueta(p) {
    const o = (p && typeof p === "object") ? p : {};
    if (_txt(o.ciudadDestino) || _txt(o.encAgencia) ||
        _txt(o.dniDestinatario)) {
      return "DNI destinatario";
    }
    if (_txt(o.agenciaId) || _txt(o.dniRecoger)) return "DNI para recoger";
    return "DNI";
  }

  /**
   * Las copias viejas que ESTE pedido ya tenía, puestas al día.
   *
   * ⚠️ SOLO LAS QUE YA TENÍA, y esa es toda la regla. Si el pedido nunca
   * tuvo `dniRecoger`, abrirlo y guardarlo no se lo añade: el dueño pidió
   * que lo de hoy no le estrene campos a lo de ayer. Pero si lo tenía, se
   * reescribe —vacío incluido— porque una copia que se queda atrás es
   * exactamente lo que imprimió el documento de otra persona.
   *
   * Es la misma regla que ya usa `shalomClave` al guardar.
   * @param {Object} previo el pedido tal como estaba guardado
   * @param {string} dni el documento que se está guardando
   * @return {Object} los campos a escribir; {} si no hay ninguno
   */
  function copiasAlDia(previo, dni) {
    const o = (previo && typeof previo === "object") ? previo : {};
    const v = _txt(dni);
    const out = {};
    if (o.dniRecoger !== undefined) out.dniRecoger = v;
    if (o.dniDestinatario !== undefined) out.dniDestinatario = v;
    return out;
  }

  return {de, etiqueta, copiasAlDia};
});
