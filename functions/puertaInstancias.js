"use strict";

/**
 * functions/puertaInstancias.js — EL EMPALME ENTRE LA PUERTA Y CONECTAR
 * =======================================================================
 * Cuatro llamadas, un solo sitio: las que `instanciaShalom.conectar` necesita
 * para crear la instancia, entrar y comprobar. Este archivo no decide nada —
 * decide `conectar`. Lo que hace es TRADUCIR, y existe porque no traducir
 * costó dos días.
 *
 * ⚠️ EL FALLO DEL 11/10/2026, Y POR QUÉ MERECE UN ARCHIVO ENTERO
 *
 * La orquestación de `index.js` le pasaba a `conectar` las cuatro llamadas EN
 * CRUDO, tal y como salen de la puerta:
 *
 *     listar: () => _porLaPuerta("instances", {})   → {ok, json:{instances}}
 *     estado: (id) => _porLaPuerta("instanceStatus", {instanceId: id})
 *
 * Pero `conectar` lee `lis.instancias` y `st.sesion.conectada` — el
 * vocabulario del panel, el que sale del TRADUCTOR. En crudo esos dos campos
 * son `undefined` siempre. Y `undefined` no se queja:
 *
 *   · `cual(undefined, …)` contesta «ninguna» → se CREABA UNA INSTANCIA
 *     NUEVA EN CADA PULSACIÓN, sin ver nunca las que ya estaban. Hasta el
 *     3/10 el plan permitía una sola y el 403 nos tapaba el agujero; con 900
 *     ya no hay nada que lo pare.
 *   · `st.sesion` undefined → `conectada: false` aunque el login fuera bien.
 *
 * Las otras dos —`crear` y `entrar`— SÍ casaban, porque `conectar` lee de
 * ellas `.json`, que es justo lo que la puerta devuelve. Dos cables bien y
 * dos mal, en la misma función, y ninguna prueba en rojo.
 *
 * ⚠️ POR QUÉ LAS 1745 PRUEBAS NO LO VIERON, que es la parte que importa
 *
 * Los dobles de `tests/instancia-shalom.test.js` devolvían la forma YA
 * TRADUCIDA:
 *
 *     listar: async () => ({ok: true, instancias: []})
 *     estado: async () => ({ok: true, sesion: {conectada: true}})
 *
 * Un doble más amable que la realidad no prueba el código: prueba el doble.
 * La lógica estaba bien cubierta; lo que nadie probó fue el EMPALME, porque
 * vivía suelto dentro de una función de 120 líneas en `index.js`, donde no
 * se puede llamar sin levantar Firebase entero.
 *
 * Por eso esto es un módulo: para que el doble se ponga en la frontera que SÍ
 * medimos —el JSON crudo de Shalom— y el traductor de verdad quede dentro de
 * lo que se prueba. Un empalme que no se puede probar acaba desviándose.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.PuertaInstancias = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /**
   * Las cuatro llamadas que `conectar` necesita, ya traducidas.
   *
   * @param {Function} porLaPuerta (op, datos) → {ok, json} | {ok:false,motivo}
   * @param {Function} traducir (op, json) → el contrato del panel
   * @return {Object} {listar, crear, entrar, estado}
   */
  function hacer(porLaPuerta, traducir) {
    return {
      /**
       * La lista de instancias de la cuenta, en vocabulario del panel.
       *
       * ⚠️ NINGUNA NO ES UN FALLO, Y FORMATO DESCONOCIDO SÍ. El traductor
       * devuelve `ok:false` con `SIN_INSTANCIA` cuando la cuenta está vacía y
       * con `VARIAS_INSTANCIAS` cuando hay más de una — pero en los dos casos
       * TRAE LA LISTA, y las dos son respuestas buenas para quien va a
       * decidir: «ninguna» es exactamente la señal de crear una, y con varias
       * `cual()` sabe desempatar por correo, que es más de lo que el traductor
       * puede hacer solo.
       *
       * Lo que NO puede pasar por «ninguna» es `FORMATO_DESCONOCIDO`: ahí no
       * hay lista porque no entendimos la respuesta. Tratarlo como cuenta
       * vacía crearía una instancia duplicada el día que Shalom cambie un
       * nombre de campo — el peor día para crear nada.
       * @return {Promise<Object>} {ok:true, instancias} | {ok:false, motivo}
       */
      listar: async () => {
        const r = await porLaPuerta("instances", {});
        if (!r || !r.ok) {
          return {ok: false, motivo: (r && r.motivo) || "SIN_RED"};
        }
        const t = traducir("instances", r.json) || {};
        if (!Array.isArray(t.instancias)) {
          return {ok: false, motivo: t.motivo || "FORMATO_DESCONOCIDO"};
        }
        return {ok: true, instancias: t.instancias};
      },

      /* `crear` y `entrar` van EN CRUDO a propósito, no por descuido:
         `conectar` les lee `.json` porque ninguna de las dos respuestas está
         medida —crear y entrar tienen efecto, así que medirlas no es gratis—
         y lo que hace con ese json es buscar el id entre varios nombres
         posibles y sacar la FORMA de los campos para poder cerrar el
         traductor más adelante. Traducir aquí sería traducir a ciegas. */
      crear: (nombre) => porLaPuerta("instanceCrear", {name: nombre}),

      entrar: (id, usuario, clave) => porLaPuerta("instanceLogin",
          {instanceId: id, username: usuario, password: clave}),

      /**
       * El estado de UNA instancia, en vocabulario del panel.
       * @param {string} id la instancia
       * @return {Promise<Object>} {ok, sesion:{conectada,…}} | {ok:false}
       */
      estado: async (id) => {
        const r = await porLaPuerta("instanceStatus", {instanceId: id});
        if (!r || !r.ok) {
          return {ok: false, motivo: (r && r.motivo) || "SIN_RED"};
        }
        return traducir("instanceStatus", r.json);
      },
    };
  }

  return {hacer};
});
