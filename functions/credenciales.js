"use strict";

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

  function _txt(x) {
    return (x === undefined || x === null) ? "" : String(x).trim();
  }

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
      f.push("Esa contraseña es demasiado corta: ¿se cortó al escribirla?");
    }
    return f;
  }

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
    if (deps.auditar) {
      try {
        await deps.auditar({usuario: usuario, cuando: deps.ahora ?
          deps.ahora() : Date.now()});
      } catch (e) {}
    }
    return {ok: true, usuario: usuario};
  }

  async function leer(deps) {
    let usuario = "";
    let clave = "";
    try {
      usuario = _txt(await deps.leer(NOMBRE_USER));
      clave = _txt(await deps.leer(NOMBRE_PASS));
    } catch (e) {
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
