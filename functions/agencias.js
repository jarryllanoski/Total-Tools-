"use strict";

/**
 * functions/agencias.js — LA AGENCIA DE DESTINO DE UN PEDIDO, IDENTIFICADA
 * ==========================================================================
 * Registrar un envío en Shalom exige el `ter_id` de la agencia de destino
 * (`POST /account/register`). Ese id **solo se puede saber con certeza en el
 * instante en que se elige la agencia de la lista**: después solo queda el
 * texto de la dirección, y emparejar por texto es adivinar — en Lima hay
 * siete "SJL" y tres en "Los Jardines".
 *
 * ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
 * Lo usan TRES: el panel, el formulario público (los dos lo cargan como
 * `functions/agencias.js`) y la Cloud Function que recibe los pedidos del
 * formulario. Una copia por lado divergiría, y divergir AQUÍ significa que el
 * servidor acepte un id que el panel habría rechazado — o al revés. Es el
 * mismo motivo por el que `etiquetas.js` está aquí.
 *
 * LA REGLA QUE NO SE NEGOCIA
 *   El id y el texto no pueden divergir NUNCA. Cualquier cosa que cambie la
 *   dirección por una vía que no sea elegir de la lista **borra el id**.
 *
 * ⚠️ UN `ter_id` NO ES UNA PROMESA. Medido con dos catálogos reales (19 jul y
 * 5 sep 2026, 48 días): 539 de 546 estables, pero el id 671 pasó de
 * CALLAO/VENTANILLA ("POR DEFINIR") a AREQUIPA/SACHACA — Shalom recicla los
 * ids de los huecos. Por eso `verificar()` se llama ANTES de gastar dinero, y
 * compara por **departamento/provincia/distrito**, no por nombre: contra esos
 * mismos catálogos, el distrito da 1 aviso verdadero y 0 falsas alarmas; el
 * nombre daría 13 falsas ("HUARAZ" → "HUARAZ CO") y el aviso dejaría de
 * leerse.
 *
 * NO TOCA NADA VIEJO: un pedido sin estos campos funciona exactamente igual
 * que hoy, y `limpiar()` devuelve {} —no nulls— cuando no había nada que
 * borrar, para que abrir y guardar un pedido antiguo no le añada ni un campo.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Agencias = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const CAMPOS = ["agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier"];
  const MAX_ID = 10;
  const MAX_TXT = 120;

  /**
   * Texto comparable: mayúsculas, sin tildes, sin espacios de sobra. Así
   * "Cañete" y "CAÑETE" no se cuentan como una mudanza.
   * @param {*} s texto
   * @return {string} texto normalizado
   */
  function _plano(s) {
    return String(s == null ? "" : s).trim().toUpperCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ");
  }

  /**
   * ¿Es un `ter_id` con forma de tal? Solo dígitos.
   *
   * Importa que sea texto y no número: la API los devuelve como NÚMERO y el
   * catálogo los guarda como TEXTO, y `3 !== "3"` no da error — simplemente
   * no encuentra la agencia, y un envío sin verificar es un paquete pagado.
   * @param {*} x candidato
   * @return {boolean} true si sirve
   */
  function idValido(x) {
    if (x === null || x === undefined) return false;
    const s = String(x).trim();
    return s.length > 0 && s.length <= MAX_ID && /^[0-9]+$/.test(s);
  }

  /**
   * La ubicación de una agencia, en la forma que se compara.
   * @param {Object} ag agencia del catálogo
   * @return {string} "DEPARTAMENTO|PROVINCIA|DISTRITO"
   */
  function geoDe(ag) {
    if (!ag || typeof ag !== "object") return "";
    // `distrito` en el catálogo guardado, `zona` en la respuesta cruda de la
    // API. Este módulo lo comparten el panel, el formulario público y el
    // servidor, y no todos reciben la misma forma: aceptar las dos evita que
    // una ubicación quede vacía y la verificación no pueda comparar nada.
    const dist = _plano(ag.distrito) || _plano(ag.zona);
    return [_plano(ag.departamento), _plano(ag.provincia), dist].join("|");
  }

  /**
   * De qué catálogo es un courier. Olva y Shalom tienen espacios de ids
   * distintos: el 3 de uno no es el 3 del otro, y mezclarlos manda el paquete
   * a donde no es.
   * @param {*} nombre nombre del courier
   * @return {string} 'SHALOM' | 'OLVA' | ''
   */
  function courierDe(nombre) {
    const u = _plano(nombre);
    if (u.indexOf("SHALOM") >= 0) return "SHALOM";
    if (u.indexOf("OLVA") >= 0) return "OLVA";
    return "";
  }

  /**
   * Los campos que se guardan al ELEGIR una agencia de la lista. Es el único
   * momento en que el id se conoce sin adivinar.
   * @param {Object} ag agencia del catálogo
   * @param {*} courier nombre del courier
   * @return {?Object} los cuatro campos, o null si no hay id utilizable
   */
  function elegida(ag, courier) {
    if (!ag || typeof ag !== "object") return null;
    if (!idValido(ag.ter_id)) return null;
    const c = courierDe(courier);
    // Sin saber de qué catálogo es, el id no significa nada: el 3 de Olva no
    // es el 3 de Shalom.
    if (!c) return null;
    const nom = String(ag.lugar_over || ag.nombre || "").trim();
    return {
      agenciaId: String(ag.ter_id).trim(),
      agenciaNombre: nom.slice(0, MAX_TXT),
      agenciaGeo: geoDe(ag),
      agenciaCourier: c,
    };
  }

  /**
   * ¿Este pedido tiene agencia identificada?
   * @param {Object} pedido pedido
   * @return {boolean} true si se puede registrar
   */
  function identificada(pedido) {
    return !!(pedido && idValido(pedido.agenciaId) && pedido.agenciaCourier);
  }

  /**
   * Lo que hay que escribir para BORRAR la identificación.
   *
   * Devuelve `{}` —nada— cuando el pedido no tenía ninguna. Eso es lo que
   * hace que abrir un pedido antiguo y guardarlo **no le añada campos
   * vacíos**: si no había nada que borrar, no se escribe nada.
   * @param {Object} pedido pedido
   * @return {Object} campos a escribir
   */
  function limpiar(pedido) {
    const tenia = pedido && CAMPOS.some((k) => {
      return pedido[k] !== undefined && pedido[k] !== null && pedido[k] !== "";
    });
    if (!tenia) return {};
    const out = {};
    CAMPOS.forEach((k) => {
      out[k] = null;
    });
    return out;
  }

  /**
   * ¿El id guardado sigue apuntando a donde creemos? Se llama ANTES de
   * registrar, que es antes de gastar dinero.
   * @param {Object} pedido pedido con los campos de agencia
   * @param {Array<Object>} catalogo catálogo vigente
   * @return {Object} {ok:true, agencia} o {ok:false, motivo, de, a}
   */
  function verificar(pedido, catalogo) {
    if (!identificada(pedido)) return {ok: false, motivo: "SIN_AGENCIA"};
    const id = String(pedido.agenciaId).trim();
    const lista = Array.isArray(catalogo) ? catalogo : [];
    let ag = null;
    for (let i = 0; i < lista.length; i++) {
      if (lista[i] && String(lista[i].ter_id).trim() === id) {
        ag = lista[i]; break;
      }
    }
    // Seis ids desaparecieron del catálogo entre julio y septiembre. Un id que
    // ya no existe no se puede verificar, y no verificado no se registra.
    if (!ag) return {ok: false, motivo: "NO_ESTA", de: pedido.agenciaGeo || ""};
    const ahora = geoDe(ag);
    if (pedido.agenciaGeo && ahora !== pedido.agenciaGeo) {
      return {ok: false, motivo: "SE_MUDO", de: pedido.agenciaGeo, a: ahora};
    }
    return {ok: true, agencia: ag};
  }

  return {
    CAMPOS,
    idValido,
    geoDe,
    courierDe,
    elegida,
    identificada,
    limpiar,
    verificar,
  };
});
