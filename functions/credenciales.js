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

  /**
   * Leer. SIEMPRE de Secret Manager, sin caché.
   *
   * ⚠️ AQUÍ HUBO UNA CACHÉ DE 60 s, Y FALLÓ EL 11/10/2026 DE LA PEOR
   * MANERA: el dueño guardó sus credenciales, el panel dijo «Guardada ✓», y
   * al pulsar «Conectar» le contestó «faltan las credenciales».
   *
   * La caché guardaba también el NEGATIVO —«aquí no hay nada»— durante un
   * minuto, y `guardar` solo la limpiaba en LA INSTANCIA que atendió el
   * guardado. Cloud Functions corre varias:
   *
   *   1. pulsa Conectar antes de guardar → la instancia A lee, no hay
   *      nada, y cachea el «no hay»
   *   2. guarda → lo atiende la instancia B, que sí escribe
   *   3. pulsa Conectar → vuelve a caer en A → le sirve el «no hay» viejo
   *
   * Una caché cuya invalidación no cruza de instancia no es una caché: es
   * un dato viejo con fecha de caducidad. Y el negativo es el peor de los
   * dos para guardar, porque la acción que lo vuelve falso —guardar— es
   * justo la que el dueño acaba de hacer.
   *
   * Se quita entera, no se arregla. Esto se lee solo al pulsar «Conectar»,
   * un botón que se aprieta a mano unas pocas veces al día: dos lecturas de
   * Secret Manager no se notan, y a cambio la respuesta es siempre la de
   * ahora. Una caché que ahorra lo que no cuesta y puede mentir no vale lo
   * que pesa.
   * @param {Object} deps {leer}
   * @return {Promise<?Object>} las credenciales, o null si no hay
   */
  async function leer(deps) {
    let usuario = "";
    let clave = "";
    try {
      usuario = _txt(await deps.leer(NOMBRE_USER));
      clave = _txt(await deps.leer(NOMBRE_PASS));
    } catch (e) {
      /* ⚠️ AQUÍ SE TRAGABAN TODOS LOS ERRORES, Y ESO NOS DEJÓ CIEGOS DOS
         DÍAS. El comentario decía «que no existan todavía no es un error» —
         cierto— pero estaba implementado como «cualquier cosa que falle no
         es un error». Permiso denegado, proyecto mal resuelto, la API de
         Google caída: todo acababa saliendo por pantalla como «faltan las
         credenciales», que manda a guardarlas otra vez y no arregla nada.

         Un `catch` que convierte causas distintas en el mismo síntoma no
         simplifica: borra la información que hacía falta para arreglarlo.

         Ahora solo NO ENCONTRADO significa «todavía no hay». Lo demás sube
         con su motivo, y quien llame lo enseña. */
      const txt = String((e && e.message) || e);
      const cod = (e && (e.code === 5 || e.code === "NOT_FOUND")) ||
        /NOT_FOUND|not found|no existe/i.test(txt);
      if (cod) return null;
      const permiso = /permission|denied|forbidden|403|PERMISSION_DENIED/i
          .test(txt);
      const err = new Error(txt);
      err.motivo = permiso ? "SIN_PERMISO_SECRETOS" : "ERROR_SECRETOS";
      throw err;
    }
    return (usuario && clave) ? {usuario: usuario, clave: clave} : null;
  }

  return {NOMBRE_USER, NOMBRE_PASS, faltantes, guardar, leer};
});
