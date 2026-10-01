"use strict";

/**
 * functions/enlaceSeguimiento.js — EL TOKEN DEL LINK DE SEGUIMIENTO
 * ===================================================================
 * El link que el cliente recibe por WhatsApp lleva un token. Ese token es lo
 * único que separa su pedido —nombre, dirección, documento— del resto del
 * mundo: la página es pública a propósito, porque obligar a un cliente a
 * iniciar sesión para ver dónde está su paquete no es una opción.
 *
 * ⚠️ EL FALLO QUE ESTE ARCHIVO CIERRA
 * El token ERA `id_` + el reloj en milisegundos (`Date.now()`). Eso no es un
 * secreto: es un número que avanza solo y que cualquiera puede recorrer.
 * Quien tuviera UN link sabía aproximadamente cuándo se crearon los demás. Y
 * `handleTrack` no tenía freno de peticiones, así que nada —absolutamente
 * nada— impedía probar millones de valores hasta dar con pedidos ajenos.
 *
 * ⚠️ LA REGLA QUE MANDA SOBRE TODO LO DEMÁS
 * **Los links ya enviados tienen que seguir abriendo. Para siempre.** Hay
 * más de mil pedidos con su link ya en el WhatsApp de alguien. Cambiar el
 * formato y romperlos sería arreglar un problema que nadie ha sufrido
 * causando uno que sufrirían todos. Por eso hay DOS formas válidas, no una.
 *
 * ⚠️ POR QUÉ ESTE ARCHIVO VIVE EN `functions/` Y NO EN LA RAÍZ
 * Lo usan los dos lados: el panel (`config.js`) genera el token al crear un
 * pedido, y la Cloud Function lo valida al recibir una consulta. Una copia
 * por lado divergiría, y divergir aquí significa que el servidor rechace un
 * token que el panel acaba de fabricar. Mismo motivo que `agencias.js` y
 * `etiquetas.js`.
 *
 * NO EXISTE UN SERVICIO DE GOOGLE PARA ESTO, y conviene saberlo para no
 * buscarlo: Firebase Dynamic Links se apagó en agosto de 2025 y nunca sirvió
 * para esto; las Signed URLs de Cloud Storage solo firman archivos de un
 * bucket. Lo que hace Google por dentro es exactamente lo de aquí abajo:
 * pedirle bytes al generador criptográfico.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.EnlaceSeguimiento = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /**
   * LA FORMA VIEJA — los links que ya están en el WhatsApp de tus clientes.
   *
   * Deliberadamente ANCHA. Podría exigir `id_` + 13 dígitos, que es lo que
   * produce `Date.now()` hoy, pero un solo pedido importado con otro formato
   * se quedaría sin poder abrir su link y **nadie se enteraría hasta que un
   * cliente llamara**. Aquí el error caro es rechazar de más, no aceptar de
   * más: lo que pase esta reja todavía tiene que existir en la base de datos.
   *
   * Lo único que sí se exige es el prefijo `id_`, y eso se comprobó contra
   * los pedidos REALES antes de escribirlo — no se dio por supuesto.
   */
  const LEGADO = /^id_[A-Za-z0-9_-]{1,64}$/;

  /**
   * LA FORMA NUEVA — 128 bits del generador criptográfico.
   *
   * ⚠️ POR QUÉ LLEVA EL PREFIJO `t1_` Y NO ES AL AZAR A SECAS.
   * Sin prefijo, un token al azar podría empezar por `id_` de pura
   * casualidad: una vez cada 262.144. El servidor lo tomaría por un id
   * viejo, buscaría un documento que no existe, y el cliente vería "link no
   * disponible" sin que nadie entendiera por qué. Un fallo así aparece meses
   * después, le toca a una persona de cada tantas, y es imposible de
   * reproducir. El prefijo lo vuelve **imposible por construcción**, no
   * improbable — que es la diferencia entre un diseño y una apuesta.
   *
   * El `1` es la versión. Si algún día hace falta otro formato, será `t2_` y
   * los `t1_` seguirán abriendo, igual que hoy siguen abriendo los `id_`.
   */
  const NUEVO = /^t1_[A-Za-z0-9_-]{22}$/;

  const PREFIJO = "t1_";
  const BYTES = 16; // 128 bits

  /* El generador criptográfico, en una variable y no leído directo, para que
     las pruebas puedan comprobar que SE USA DE VERDAD. No es un adorno: ya
     pasó en este proyecto que una prueba comprobaba que el código
     *mencionaba* `getRandomValues`, la mención seguía ahí en una rama
     muerta, y lo que corría de verdad era `Math.random()`. Un texto en el
     fuente no prueba nada; solo el comportamiento lo hace. */
  let _ref = (typeof globalThis !== "undefined" && globalThis.crypto) || null;

  /**
   * Lee o cambia el generador criptográfico. Cambiarlo es cosa de pruebas.
   * @param {Object} [nuevo] con qué sustituirlo
   * @return {Object} el que está puesto
   */
  function _crypto(nuevo) {
    if (arguments.length) _ref = nuevo;
    return _ref;
  }

  /**
   * Bytes → base64 apto para URL, sin depender de Buffer (el panel no lo
   * tiene) ni de btoa (Node no lo tenía hasta hace poco).
   * @param {Uint8Array} bytes los bytes
   * @return {string} texto seguro en una URL
   */
  function _b64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const b64 = (typeof btoa === "function") ?
      btoa(s) : Buffer.from(s, "binary").toString("base64");
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * Un token nuevo, al azar de verdad.
   *
   * ⚠️ SI NO HAY GENERADOR CRIPTOGRÁFICO, LANZA. No cae a `Math.random()`.
   * `Math.random` produce una secuencia que se deduce a partir de las
   * anteriores: un token así sería adivinable, o sea exactamente el fallo
   * que estamos cerrando, pero disimulado. Fallar a gritos es la única
   * opción honesta — un pedido sin token se nota; uno con token de mentira,
   * no.
   *
   * @return {string} token nuevo
   */
  function generar() {
    const c = _crypto();
    if (!c || typeof c.getRandomValues !== "function") {
      throw new Error("ENLACE_SIN_CRIPTO");
    }
    const a = new Uint8Array(BYTES);
    c.getRandomValues(a);
    return PREFIJO + _b64url(a);
  }

  /**
   * ¿Qué clase de token es esto? Se responde SIN tocar la base de datos.
   *
   * Es la primera reja y la más barata: hoy, cualquier texto —`token=x`,
   * `token=`, basura de un robot— provoca una lectura de Firestore que se
   * paga. Mirar la forma primero hace que un barrido automático no cueste
   * nada.
   *
   * Y cierra algo más: el token se pega a una ruta de base de datos
   * (`panel/shipments/items/<token>`). Una barra dentro del token cambia esa
   * ruta. Hoy no se puede llegar a `panel/config` —está en dos segmentos y
   * aquí se parte de tres—, así que no era una fuga; pero concatenar texto
   * de fuera a una ruta sin validarlo es como empiezan las que sí lo son.
   *
   * @param {*} token lo que llegó en la URL
   * @return {string} 'nuevo' | 'legado' | 'invalido'
   */
  function tipoDe(token) {
    if (typeof token !== "string") return "invalido";
    if (NUEVO.test(token)) return "nuevo";
    if (LEGADO.test(token)) return "legado";
    return "invalido";
  }

  /**
   * ¿Se puede abrir este pedido con un token de la forma vieja?
   *
   * ⚠️ AQUÍ ESTABA LA PUERTA TRASERA, y casi deja el arreglo en nada.
   * Un pedido nuevo guarda un token al azar, pero su **id de documento**
   * sigue siendo `id_` + el reloj: cambiar el id obligaría a tocar el panel
   * entero, los enlaces guardados y el respaldo. Si el servidor siguiera
   * aceptando el id de cualquiera, el pedido nuevo se abriría por su id
   * adivinable **igual que antes** y el token al azar sería decoración.
   *
   * La regla, entonces:
   *   · pedido CON token nuevo  → solo se abre por el token
   *   · pedido SIN token (ayer) → se sigue abriendo por su id, para siempre
   *
   * Y ante la duda, **se abre**. Dejar a un cliente sin ver su pedido por
   * una duda mía es peor que aceptar un id que de todas formas ya era
   * público ayer.
   *
   * @param {Object} pedido el documento leído de Firestore
   * @return {boolean} true si el id viejo vale para este pedido
   */
  function aceptaLegado(pedido) {
    if (!pedido || typeof pedido !== "object") return true;
    return !(typeof pedido.trackToken === "string" && pedido.trackToken);
  }

  /**
   * Con qué token se arma el link de ESTE pedido.
   *
   * Vive aquí y no en cada botón porque hay DOS sitios que copian links —la
   * tarjeta del panel y la vista de seguimiento— y si uno se quedara con el
   * id, la mitad de los links que salieran seguirían siendo adivinables sin
   * que nada lo indicara. Una regla, un sitio.
   *
   * @param {Object} pedido el pedido
   * @return {string} el token para el `?seg=`, o '' si no hay pedido
   */
  function tokenDe(pedido) {
    if (!pedido || typeof pedido !== "object") return "";
    if (typeof pedido.trackToken === "string" && pedido.trackToken) {
      return pedido.trackToken;
    }
    return String(pedido.id || "");
  }

  return {LEGADO, NUEVO, PREFIJO, generar, tipoDe, aceptaLegado, tokenDe,
    _crypto};
});
