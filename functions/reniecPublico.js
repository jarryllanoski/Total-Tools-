"use strict";

/**
 * functions/reniecPublico.js — CONSULTAR UN DNI DESDE LA PÁGINA DEL CLIENTE
 * ===========================================================================
 * El dueño pidió que, al escribir su DNI, el cliente vea su nombre oficial y
 * no tenga que teclearlo. Para el negocio es claro: un nombre escrito a mano
 * llega con faltas, sin tildes o con el apellido delante, y eso es justo lo
 * que Shalom rechaza al registrar el envío.
 *
 * ⚠️ PERO ESTO ABRE UN BUSCADOR DE NOMBRES POR DNI EN INTERNET, PAGADO CON SU
 * CLAVE DE API. Hasta hoy la consulta vivía detrás de `shalomPuerta`, que
 * exige token de Firebase Y estar en la lista de administradores. Eso no era
 * un descuido: era la barrera. Al quitarla hay que poner otra cosa en su
 * sitio, y este archivo es esa cosa.
 *
 * TRES COSAS LO HACEN PEOR DE LO QUE PARECE:
 *
 *   1. El freno por IP es flojo aquí. El propio código ya lo dice en
 *      `RATE_LIMITS`: en Perú, Claro y Movistar meten miles de usuarios
 *      detrás de una misma IP pública. Un bot con datos móviles cambia de IP
 *      cuando quiere; un cliente real la comparte con su barrio.
 *   2. Son datos de personas reales. Un robot recorriendo los 8 dígitos no
 *      «gasta cuota»: se lleva nombres. Eso no es un gasto, es una fuga.
 *   3. Cada consulta nueva cuesta dinero de verdad.
 *
 * LAS CUATRO CAPAS, Y POR QUÉ CADA UNA
 *
 *   App Check    dice DESDE DÓNDE viene la petición: de la página real y no
 *                de un script. Es la que más corta, y por eso esta operación
 *                —que nace hoy— la EXIGE desde el primer día. Las que ya
 *                existían no: dejar fuera a un cliente con reCAPTCHA caído
 *                es peor que el ataque del que protege.
 *   Freno por IP  frena al torpe. No al que sabe.
 *   Caché         un DNI ya consultado NO VUELVE A COSTAR. Los clientes
 *                repiten, así que esto es casi todo el ahorro real.
 *   Tope diario   el que de verdad acota el daño: pasado el tope no se
 *                consulta más hoy, y el formulario SIGUE FUNCIONANDO —el
 *                cliente escribe su nombre a mano. Degrada, no rompe.
 *
 * Ese último es el que importa. Sin él, un bot que pase las otras tres
 * capas gasta hasta donde llegue la factura. Con él, cuesta como mucho un
 * día de tope y ningún cliente se queda sin poder pedir.
 *
 * ⚠️ Y EL NAVEGADOR NO PUEDE DECIR DE QUIÉN ES UN DNI. Si el formulario
 * mandara el nombre junto al pedido, cualquiera podría poner el que quisiera
 * EN UNA ETIQUETA DE ENVÍO REAL. Por eso el navegador pregunta, el servidor
 * consulta, y el servidor guarda: la caché de aquí es también de dónde sale
 * el nombre oficial que se graba en el pedido. Lo de fuera nunca se cree.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.ReniecPublico = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /* El tope de consultas NUEVAS por día. Las que salen de la caché no
     cuentan: no cuestan nada y no son una consulta.

     150 y no 20: el dueño mueve unas decenas de pedidos al día y el número
     tiene que dejarle sitio a un día bueno, a los que escriben mal el DNI y
     lo corrigen, y a los que abandonan el formulario a medias. Un tope que
     se alcanza un martes cualquiera no protege nada — se apaga solo y nadie
     se entera de por qué dejó de funcionar. */
  const LIMITE_DIA = 150;

  /* Cuánto vale una entrada de la caché. Un año: el nombre de un DNI no
     cambia, y lo que se gana con un plazo corto —volver a pagar por el
     mismo dato— no es ganar nada. No es infinito solo para que un dato mal
     guardado no se quede para siempre. */
  const CACHE_DIAS = 365;

  /**
   * El DNI, limpio, o "" si no sirve.
   * @param {*} x lo que llegó
   * @return {string} 8 dígitos, o ""
   */
  function normalizar(x) {
    const d = String(x === undefined || x === null ? "" : x)
        .replace(/[^0-9]/g, "");
    return d.length === 8 ? d : "";
  }

  /**
   * El día al que se le cuentan las consultas, en hora de Lima (UTC-5).
   *
   * ⚠️ EN HORA DE LIMA Y NO EN UTC, y no es un detalle: en UTC el día cambia
   * a las 7 de la tarde de Perú. El tope se reiniciaría en mitad de la tarde
   * —las horas de más pedidos— y se agotaría a media mañana. Un tope diario
   * tiene que partir la noche, no la jornada.
   * @param {number} ahora milisegundos
   * @return {string} "YYYY-MM-DD"
   */
  function diaDe(ahora) {
    const t = new Date((Number(ahora) || 0) - 5 * 3600 * 1000);
    return t.toISOString().slice(0, 10);
  }

  /**
   * ¿Sigue valiendo lo que hay guardado?
   * @param {Object} c la entrada de caché
   * @param {number} ahora milisegundos
   * @return {boolean} si se puede usar
   */
  function cacheVale(c, ahora) {
    if (!c || typeof c !== "object") return false;
    if (!String(c.nombres || "").trim()) return false;
    const t = Number(c.cuando);
    if (!isFinite(t) || t <= 0) return false;
    return (Number(ahora) - t) < CACHE_DIAS * 86400000;
  }

  /**
   * QUÉ HACER con una consulta. Todo lo que decide, en un sitio y sin red.
   *
   * @param {Object} e {dni, appCheck, cache, consultasHoy, ahora}
   * @return {Object} {accion:'rechazar'|'cache'|'consultar', motivo, persona}
   */
  function decidir(e) {
    const o = e || {};
    const dni = normalizar(o.dni);
    if (!dni) {
      return {accion: "rechazar", motivo: "DNI_NO_VALIDO",
        detalle: "El DNI son 8 números."};
    }
    /* ⚠️ APP CHECK ANTES QUE LA CACHÉ, y el orden importa. Al revés, un
       robot sin App Check podría ir preguntando DNIs y quedarse con todos
       los que alguna vez consultó un cliente de verdad: la caché se
       convertiría en la lista de clientes del negocio, servida gratis. */
    if (o.appCheck !== true) {
      return {accion: "rechazar", motivo: "SIN_APPCHECK",
        detalle: "Recarga la página e intenta de nuevo."};
    }
    if (cacheVale(o.cache, o.ahora)) {
      return {accion: "cache", persona: o.cache};
    }
    const n = Number(o.consultasHoy) || 0;
    if (n >= LIMITE_DIA) {
      /* No es un error del cliente y no se le dice como tal: se le pide que
         escriba su nombre, que es lo que hacía ayer. */
      return {accion: "rechazar", motivo: "TOPE_DIA",
        detalle: "Escribe tu nombre completo, por favor."};
    }
    return {accion: "consultar", dni: dni};
  }

  /**
   * Lo que se guarda y lo que se devuelve: SOLO el nombre.
   *
   * Nada de la respuesta cruda de Shalom cruza esta frontera. Lo que no se
   * copia a mano no se escapa por accidente el día que ellos añadan un campo
   * —una dirección, una fecha de nacimiento— que nadie pidió y que acabaría
   * viajando al navegador de cualquiera que escriba un DNI.
   * @param {Object} persona la del traductor de shalomPuerta
   * @param {number} ahora milisegundos
   * @return {?Object} lo guardable, o null
   */
  function guardable(persona, ahora) {
    const p = (persona && typeof persona === "object") ? persona : {};
    const txt = (x) => String(x === undefined || x === null ? "" : x).trim();
    const nombres = txt(p.nombres);
    if (!nombres) return null;
    const pat = txt(p.apePaterno);
    const mat = txt(p.apeMaterno);
    return {
      nombres: nombres,
      apePaterno: pat,
      apeMaterno: mat,
      completo: [nombres, pat, mat].filter(Boolean).join(" "),
      cuando: Number(ahora) || 0,
    };
  }

  return {LIMITE_DIA, CACHE_DIAS, normalizar, diaDe, cacheVale, decidir,
    guardable};
});
