"use strict";

/**
 * functions/credenciales.js — LAS CREDENCIALES DE SHALOM PRO
 * ===========================================================
 * Guardarlas y leerlas. Nada más — quien habla con Secret Manager es
 * `functions/index.js`; aquí viven las DECISIONES, y por eso esto se prueba
 * entero sin red y sin Google.
 *
 * ⚠️ POR QUÉ ESTO EXISTE, Y POR QUÉ NO ES «la contraseña en el navegador»
 *
 * Shalom pide usuario y contraseña EN TEXTO PLANO para `POST
 * /instances/login`: no tienen OAuth ni intercambio de token. Y su API
 * bloquea al navegador por CORS. Así que la contraseña real tiene que
 * llegarles por alguien. No hay truco criptográfico que lo evite: la
 * pregunta no es SI viaja, sino DÓNDE DESCANSA y CUÁNTAS VECES viaja.
 *
 *   la otra aplicación del dueño → la guarda en su base de datos, y te la
 *                                  RELLENA en el formulario cada vez que
 *                                  entras. Eso es poder leerla.
 *   usar y olvidar               → la escribes CADA VEZ que la sesión se
 *                                  cae. Viaja muchas veces, y de madrugada
 *                                  no hay nadie para escribirla.
 *   esto                         → la escribes UNA vez. Va a Secret
 *                                  Manager, la misma caja fuerte que la
 *                                  clave de la API, y el servidor entra
 *                                  solo a partir de ahí.
 *
 * Una contraseña que se escribe una vez se expone una vez.
 *
 * ⚠️ WRITE-ONLY. No hay forma de pedirla de vuelta desde el navegador: la
 * operación `guardarCredenciales` SOLO guarda, y no existe su pareja de
 * lectura en la lista blanca. Ni disfrazada de diagnóstico. En pantalla se
 * ve «guardada ✓» y el correo, nunca la clave.
 *
 * ⚠️ Y NO CON `defineSecret()`. Ese fija la versión al desplegar: si el
 * panel guarda una contraseña nueva, la función seguiría usando la vieja
 * hasta el próximo deploy — justo lo contrario de lo que se quiere. Se lee
 * la versión `latest` en el momento de la petición, con una caché corta.
 * De regalo: como ya no van declaradas en `secrets: [...]`, un secreto que
 * todavía no existe deja de romper el despliegue.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Credenciales = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /** Cuánto se guarda en memoria lo leído. Corto a propósito: si el dueño
   *  cambia de cuenta, la siguiente conexión no debería usar la anterior. */
  const CACHE_MS = 60000;

  const NOMBRE_USER = "SHALOM_PRO_USER";
  const NOMBRE_PASS = "SHALOM_PRO_PASS";

  /**
   * Texto limpio.
   * @param {*} x lo que sea
   * @return {string} cadena recortada
   */
  function _txt(x) {
    return (x === undefined || x === null) ? "" : String(x).trim();
  }

  /**
   * ¿Sirve esto como credencial?
   *
   * ⚠️ LO VACÍO SE RECHAZA AQUÍ Y NO EN SECRET MANAGER. Al dueño le pasó
   * con la terminal: pulsó Enter sin escribir (el campo va enmascarado y no
   * se ve nada) y Google contestó «Secret Payload cannot be empty» — un
   * error de Google sobre un descuido suyo. Dicho aquí, el aviso habla su
   * idioma y señala el campo.
   * @param {Object} c {usuario, clave}
   * @return {Array<string>} lo que falta, en palabras; vacío si está bien
   */
  function faltantes(c) {
    const o = c || {};
    const u = _txt(o.usuario);
    const k = _txt(o.clave);
    const f = [];
    if (!u) {
      f.push("Falta el correo de Shalom Pro.");
    } else if (u.indexOf("@") < 0 || u.indexOf(".") < 0 || /\s/.test(u)) {
      f.push("Ese correo no tiene forma de correo: " +
        "con el que entras en pro.shalom.pe.");
    }
    if (!k) {
      f.push("Falta la contraseña de Shalom Pro.");
    } else if (k.length < 4) {
      /* No se valida la fuerza —es la contraseña de ELLOS, no nuestra— pero
         menos de cuatro caracteres es casi siempre un dedo que resbaló. */
      f.push("Esa contraseña es demasiado corta: ¿se cortó al escribirla?");
    }
    return f;
  }

  /**
   * Guardar. Escribe una versión nueva de cada secreto; la anterior se
   * queda en el historial de Secret Manager, que es justo lo que permite
   * volver atrás si te equivocas de cuenta.
   * @param {Object} deps {escribir, ahora, auditar}
   * @param {Object} c {usuario, clave}
   * @return {Promise<Object>} {ok, motivo, detalle, usuario}
   */
  async function guardar(deps, c) {
    const f = faltantes(c);
    if (f.length) {
      return {ok: false, motivo: "SIN_DATO", faltan: f};
    }
    const usuario = _txt(c.usuario);
    const clave = _txt(c.clave);
    try {
      await deps.escribir(NOMBRE_USER, usuario);
      await deps.escribir(NOMBRE_PASS, clave);
    } catch (e) {
      /* El fallo típico y su arreglo, dichos juntos: sin permiso para
         escribir secretos, Google devuelve PERMISSION_DENIED y el mensaje
         no dice qué rol falta. */
      const txt = String((e && e.message) || e);
      const sinPermiso = /permission|denied|forbidden|403/i.test(txt);
      return {ok: false,
        motivo: sinPermiso ? "SIN_PERMISO_SECRETOS" : "ERROR_SHALOM",
        detalle: sinPermiso ?
          "La función no tiene permiso para escribir en Secret Manager. " +
            "Hace falta darle el rol `roles/secretmanager.admin` a su " +
            "cuenta de servicio — una sola vez." :
          "No se pudo guardar. " + txt};
    }
    _cache = null; // lo guardado manda desde ya, sin esperar a la caché
    /* La auditoría registra QUIÉN y CUÁNDO, nunca el valor. Un registro que
       guardara la contraseña sería una segunda copia fuera de la caja
       fuerte, que es exactamente lo que se quiere evitar. */
    if (deps.auditar) {
      try {
        await deps.auditar({usuario: usuario, cuando: deps.ahora ?
          deps.ahora() : Date.now()});
      } catch (e) {/* una auditoría que falla no anula lo guardado */}
    }
    return {ok: true, usuario: usuario};
  }

  let _cache = null;

  /**
   * Leer, con caché corta. Devuelve `{usuario, clave}` o `null` si no hay.
   * @param {Object} deps {leer, ahora}
   * @return {Promise<?Object>} las credenciales, o null
   */
  async function leer(deps) {
    const ahora = deps.ahora ? deps.ahora() : Date.now();
    if (_cache && (ahora - _cache.t) < CACHE_MS) return _cache.v;
    let usuario = "";
    let clave = "";
    try {
      usuario = _txt(await deps.leer(NOMBRE_USER));
      clave = _txt(await deps.leer(NOMBRE_PASS));
    } catch (e) {
      /* Que no existan todavía NO es un error: es el estado del primer día.
         Se devuelve null y quien llame dirá «guárdalas en el panel». */
      usuario = "";
      clave = "";
    }
    const v = (usuario && clave) ? {usuario: usuario, clave: clave} : null;
    _cache = {t: ahora, v: v};
    return v;
  }

  /** Olvidar lo cacheado. Para las pruebas y para después de guardar. */
  function olvidar() {
    _cache = null;
  }

  return {NOMBRE_USER, NOMBRE_PASS, CACHE_MS, faltantes, guardar, leer,
    olvidar};
});
