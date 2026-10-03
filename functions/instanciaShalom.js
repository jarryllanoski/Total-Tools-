"use strict";

/**
 * functions/instanciaShalom.js — CONECTAR LA CUENTA DE SHALOM PRO
 * ================================================================
 * Una sola operación: «conectar». Crea la instancia si no existe, entra, y
 * comprueba. Idempotente a propósito — pulsarla dos veces no crea dos.
 *
 * ⚠️ POR QUÉ UNA Y NO DOS BOTONES («crear» y «entrar»)
 * Un botón de crear es un botón que acaba creando de más. La otra aplicación
 * del dueño tiene uno que se llama «Obtener instancia» y en realidad CREA:
 * con el límite en 1 recibía un 403 y no hacía daño, y el 3/10/2026 el plan
 * pasó a 900 — ahora funciona siempre. Aquí no hay botón de crear: hay uno
 * de conectar, y crear es un paso interno que solo ocurre si hace falta.
 *
 * ⚠️ POR QUÉ SE ENTRA SIEMPRE, AUNQUE YA ESTÉ CONECTADA
 * De la documentación de Shalom:
 *
 *     «hace auto-login cuando expira, SI GUARDASTE CREDENCIALES»
 *     «401 — la sesión expiró sin credenciales guardadas para auto-login.
 *      ⚠️ Ese es el fallo más repetido de esta API.»
 *
 * Entrar por `POST /instances/login` es lo que deja las credenciales
 * guardadas en la instancia. Una instancia creada y nunca logueada se cae y
 * no se levanta sola. Por eso conectar = crear (si hace falta) + entrar
 * (siempre) + comprobar.
 *
 * ⚠️ LAS CREDENCIALES NO PASAN POR AQUÍ DESDE EL NAVEGADOR
 * Su propia documentación desaconseja este endpoint en un panel porque
 * «obligaría a que tus credenciales de Shalom Pro pasen por tu sistema». No
 * pasan: las pone el servidor desde Secret Manager, igual que la clave de la
 * API. El navegador manda el nombre de la operación y nada más.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.InstanciaShalom = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /* ★ QUIEN SOMOS EN SHALOM. Vive aquí y no en el navegador porque el
     servidor la necesita para decidir, y lo que decide el servidor no puede
     venir del navegador: si el correo llegara de fuera, cualquiera podría
     pedir «conéctate a esta otra cuenta» desde la consola y acabaríamos
     creando instancias sueltas con nuestras credenciales.

     ⚠️ TIENE QUE COINCIDIR con `Shalom.INSTANCIA_PREFERIDA` de shalom.js,
     que es la misma declaración del lado del panel. Son dos archivos que
     dicen lo mismo, y hay una prueba que los compara: si divergen, el panel
     elegiría una cuenta y el servidor conectaría otra. */
  const DECLARADA = {
    correo: "Totaltools@gmail.com",
    nombre: "Total Tools Panel",
  };

  /**
   * Texto limpio.
   * @param {*} x lo que sea
   * @return {string} cadena recortada, o ""
   */
  function _txt(x) {
    return (x === undefined || x === null) ? "" : String(x).trim();
  }

  /**
   * Los NOMBRES de los campos que trajo una respuesta, sin un solo valor.
   * Es medio contrato gratis y se puede pegar en un chat sin exponer nada.
   * @param {*} json la respuesta
   * @return {Array<string>} nombres, con un nivel de anidado
   */
  function camposDe(json) {
    const j = (json && typeof json === "object") ? json : {};
    const out = [];
    Object.keys(j).forEach((k) => {
      const v = j[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        Object.keys(v).forEach((k2) => out.push(k + "." + k2));
      } else {
        out.push(k);
      }
    });
    return out;
  }

  /**
   * El id de la instancia dentro de una respuesta de `POST /instances`.
   *
   * ⚠️ VARIOS NOMBRES A PROPÓSITO. La forma exacta de ESTA respuesta no está
   * medida —crear una instancia tiene efecto, así que no se puede medir
   * gratis— y su documentación solo dice «Retorna: instanceId (UUID)».
   * Buscar por varios nombres y en un nivel de anidado es lo que evita que
   * una instancia creada DE VERDAD se dé por perdida porque la clave se
   * llamaba `id` en vez de `instanceId`. Una instancia perdida así se
   * convierte en otra creada al lado.
   * @param {*} json la respuesta de Shalom
   * @return {string} el id, o ""
   */
  function idDe(json) {
    const j = (json && typeof json === "object") ? json : {};
    const d = (j.data && typeof j.data === "object") ? j.data : {};
    const nombres = ["instanceId", "instance_id", "id"];
    for (let i = 0; i < nombres.length; i++) {
      const n = nombres[i];
      if (_txt(j[n])) return _txt(j[n]);
      if (_txt(d[n])) return _txt(d[n]);
    }
    return "";
  }

  /**
   * Cuál de las instancias de la cuenta es la nuestra.
   *
   * DOS FORMAS DE RECONOCERLA, y el orden importa:
   *   1. el CORREO — es el negocio. Con la regla del dueño («una instancia
   *      por cada correo de inicio de sesión») es una clave única.
   *   2. el NOMBRE exacto, pero SOLO si esa instancia no tiene correo. Ese
   *      caso existe de verdad: una instancia recién creada todavía no tiene
   *      `username` porque nunca entró. Sin esta segunda forma, un intento
   *      que creara la instancia y fallara al entrar dejaría un huérfano, y
   *      el siguiente intento crearía otra al lado. Así se reutiliza.
   *
   * Si casan DOS, no se elige: eso significaría que la regla de «una por
   * correo» se rompió, y ante una contradicción no se adivina.
   * @param {Array} lista instancias ya traducidas {id, nombre, usuario}
   * @param {string} correo el correo declarado
   * @param {string} nombre el nombre declarado
   * @return {Object} {estado: 'una'|'ninguna'|'varias', instancia}
   */
  function cual(lista, correo, nombre) {
    const L = Array.isArray(lista) ? lista.filter((x) =>
      x && typeof x === "object" && _txt(x.id)) : [];
    const c = _txt(correo).toLowerCase();
    const n = _txt(nombre).toLowerCase();

    if (c) {
      const porCorreo = L.filter((x) =>
        _txt(x.usuario).toLowerCase() === c);
      if (porCorreo.length === 1) {
        return {estado: "una", instancia: porCorreo[0]};
      }
      if (porCorreo.length > 1) return {estado: "varias", instancia: null};
    }
    if (n) {
      // Sin correo: huérfana de un intento anterior. Con OTRO correo: no es
      // nuestra por mucho que se llame igual.
      const porNombre = L.filter((x) =>
        _txt(x.nombre).toLowerCase() === n && !_txt(x.usuario));
      if (porNombre.length === 1) {
        return {estado: "una", instancia: porNombre[0]};
      }
      if (porNombre.length > 1) return {estado: "varias", instancia: null};
    }
    return {estado: "ninguna", instancia: null};
  }

  /**
   * Conectar la cuenta: crear si hace falta, entrar siempre, comprobar.
   *
   * @param {Object} deps {listar, crear, entrar, estado} — cada una
   *   devuelve {ok, json} o {ok:false, motivo}
   * @param {Object} opc {correo, nombre, usuario, clave}
   * @return {Promise<Object>} qué pasó, siempre con motivo en palabras
   */
  async function conectar(deps, opc) {
    const o = opc || {};
    const correo = _txt(o.correo);
    const nombre = _txt(o.nombre);
    if (!correo || !nombre) {
      return {ok: false, motivo: "SIN_DATO",
        detalle: "Falta el correo o el nombre declarados en el panel."};
    }
    /* Sin credenciales NO se crea nada. Crear y no poder entrar deja una
       instancia muerta en la cuenta, y lo que el dueño pidió es justo lo
       contrario: que la sesión no se caiga. */
    if (!_txt(o.usuario) || !_txt(o.clave)) {
      return {ok: false, motivo: "SIN_CREDENCIALES",
        detalle: "Faltan las credenciales de Shalom Pro en Secret Manager. " +
          "Se ponen con `firebase functions:secrets:set SHALOM_PRO_USER` y " +
          "`SHALOM_PRO_PASS`, desde tu terminal."};
    }

    // ── 1 · ¿ya existe? ───────────────────────────────────────────────
    const lis = await deps.listar();
    if (!lis || !lis.ok) {
      return {ok: false, motivo: (lis && lis.motivo) || "SIN_RED",
        detalle: "No se pudo leer la lista de instancias."};
    }
    const elegida = cual(lis.instancias, correo, nombre);
    if (elegida.estado === "varias") {
      return {ok: false, motivo: "VARIAS_INSTANCIAS",
        detalle: "Hay más de una instancia con ese correo o ese nombre. No " +
          "se elige sola: míralas en shalom-api.lat y deja una."};
    }

    let id = elegida.instancia ? _txt(elegida.instancia.id) : "";
    let creada = false;

    // ── 2 · crearla, SOLO si no había ─────────────────────────────────
    if (!id) {
      const cr = await deps.crear(nombre);
      if (!cr || !cr.ok) {
        return {ok: false, motivo: (cr && cr.motivo) || "SIN_RED",
          detalle: "No se pudo crear la instancia."};
      }
      id = idDe(cr.json);
      if (!id) {
        /* Pudo crearse igual y no saber su id es peor que no crearla: el
           siguiente intento crearía otra al lado. Se dice, con la forma de
           lo que contestó, y NO se reintenta. */
        return {ok: false, motivo: "FORMATO_DESCONOCIDO",
          detalle: "Shalom contestó al crear, pero no se reconoce el id. " +
            "Míralo en shalom-api.lat antes de volver a intentarlo.",
          forma: camposDe(cr.json)};
      }
      creada = true;
    }

    // ── 3 · entrar SIEMPRE: es lo que guarda las credenciales ─────────
    const en = await deps.entrar(id, _txt(o.usuario), _txt(o.clave));
    if (!en || !en.ok) {
      return {ok: false, motivo: (en && en.motivo) || "SIN_RED",
        detalle: creada ?
          "La instancia se creó pero no se pudo entrar. No se va a crear " +
            "otra: la próxima vez se reutiliza esta." :
          "No se pudo entrar en Shalom Pro. Comprueba el usuario y la clave.",
        id: id, creada: creada};
    }

    // ── 4 · comprobar, que es lo único que demuestra algo ─────────────
    const st = await deps.estado(id);
    const conectada = !!(st && st.ok && st.sesion && st.sesion.conectada);
    return {
      ok: true,
      id: id,
      creada: creada,
      conectada: conectada,
      usuario: (st && st.ok && st.sesion) ? st.sesion.usuario : null,
      // Los NOMBRES de lo que devolvió el login, sin un solo valor: es lo
      // que falta para cerrar el traductor y se puede pegar en un chat.
      forma: camposDe(en.json),
    };
  }

  return {DECLARADA, _txt, camposDe, idDe, cual, conectar};
});
