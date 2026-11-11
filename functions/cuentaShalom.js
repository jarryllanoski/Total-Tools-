"use strict";

/**
 * functions/cuentaShalom.js — LA CUENTA DE SHALOM PRO DEL PANEL
 * ==============================================================
 * Rehecho el 11/11/2026 (reemplaza a instanciaShalom.js y
 * puertaInstancias.js). Dos operaciones, y el navegador no ve nada más:
 *
 *   conectar → con el correo y la contraseña de Shalom Pro (escritos ahora
 *              o los guardados en Secret Manager): encuentra TU instancia,
 *              la crea si no existe, entra solo si hace falta y guarda en
 *              el servidor cuál es.
 *   estado   → ¿la instancia guardada sigue conectada?
 *
 * LA REGLA DE ORO: el panel solo usa la instancia cuyo `username` es TU
 * correo de Shalom Pro. La cuenta de la API puede tener instancias de otros
 * negocios; nunca se elige «la primera», «la única» ni «la conectada». Y el
 * navegador nunca recibe la lista: solo «conectada · tu correo».
 *
 * POR QUÉ SE REHIZO (el fallo del 11/11/2026): la instancia del panel estaba
 * CONECTADA en Shalom, pero el panel tenía guardado otro id. «Conectar»
 * buscaba por un correo fijo en el código, y aunque la encontraba, SIEMPRE
 * volvía a iniciar sesión: ese login falló, y como falló nunca guardaba el id
 * bueno. Ahora, si ya está conectada, solo se guarda su id.
 *
 * Según su documentación, la API guarda las credenciales cifradas en la
 * instancia y vuelve a entrar sola cuando la sesión vence: conectando una
 * vez, se mantiene. Listar, crear, entrar y ver el estado NO consumen cuota.
 *
 * Lógica pura: las llamadas a Shalom y a Firestore llegan en `deps`, para
 * probarla con las respuestas reales sin red.
 */

/** El nombre con el que el panel crea su instancia (si no existe). */
const NOMBRE = "Total Tools Panel";

/**
 * Texto recortado, o "".
 * @param {*} v valor
 * @return {string} texto
 */
function _txt(v) {
  return typeof v === "string" ? v.trim() : (typeof v === "number" ?
    String(v) : "");
}

/**
 * El id de una instancia recién creada, venga donde venga en la respuesta.
 * @param {*} json respuesta de POST /instances
 * @return {string} el id, o ""
 */
function idDe(json) {
  const j = (json && typeof json === "object") ? json : {};
  const d = (j.data && typeof j.data === "object") ? j.data : {};
  const nombres = ["instanceId", "instance_id", "id"];
  for (let i = 0; i < nombres.length; i++) {
    if (_txt(j[nombres[i]])) return _txt(j[nombres[i]]);
    if (_txt(d[nombres[i]])) return _txt(d[nombres[i]]);
  }
  return "";
}

/**
 * Cuál de la lista es la TUYA. Solo por tu correo; nunca otra.
 * @param {Array} lista instancias traducidas {id, nombre, usuario, conectada}
 * @param {string} correo tu correo de Shalom Pro
 * @param {string} idGuardado la que el panel tenía guardada, si alguna
 * @return {Object} {estado: una|varias|ninguna, instancia}
 */
function mia(lista, correo, idGuardado) {
  const L = Array.isArray(lista) ? lista.filter((x) => x && _txt(x.id)) : [];
  const c = _txt(correo).toLowerCase();
  if (!c) return {estado: "ninguna", instancia: null};
  const tuyas = L.filter((x) => _txt(x.usuario).toLowerCase() === c);
  if (tuyas.length === 1) return {estado: "una", instancia: tuyas[0]};
  if (tuyas.length > 1) {
    // Varias con TU correo: todas son tuyas. Manda la guardada; si no, la
    // única conectada. Si no se puede decidir, no se adivina.
    const g = tuyas.filter((x) => _txt(x.id) === _txt(idGuardado));
    if (g.length === 1) return {estado: "una", instancia: g[0]};
    const con = tuyas.filter((x) => x.conectada === true);
    if (con.length === 1) return {estado: "una", instancia: con[0]};
    return {estado: "varias", instancia: null};
  }
  /* Una creada por el panel que nunca llegó a entrar no tiene correo: se
     reconoce por SU nombre y por no tener usuario (nunca una ajena). */
  const huerf = L.filter((x) => !_txt(x.usuario) && _txt(x.nombre) === NOMBRE);
  if (huerf.length === 1) return {estado: "una", instancia: huerf[0]};
  return {estado: "ninguna", instancia: null};
}

/**
 * Conectar la cuenta.
 * @param {Object} deps {listar, crear, entrar, estado, guardarCuenta}
 * @param {Object} opc {usuario, clave, idGuardado, recienEscritas}
 * @return {Promise<Object>} {ok, conectada, usuario, id} o {ok:false, motivo,
 *   detalle} — nunca la contraseña, nunca otras instancias
 */
async function conectar(deps, opc) {
  const o = opc || {};
  const usuario = _txt(o.usuario);
  const clave = typeof o.clave === "string" ? o.clave : "";
  if (!usuario || !clave) {
    return {ok: false, motivo: "SIN_CREDENCIALES",
      detalle: "Escribe tu correo y tu contraseña de pro.shalom.pe y pulsa " +
        "Conectar."};
  }

  const lis = await deps.listar();
  if (!lis || !lis.ok) {
    return {ok: false, motivo: (lis && lis.motivo) || "SIN_RED",
      detalle: "No se pudo consultar Shalom. Intenta en un momento."};
  }
  const e = mia(lis.instancias, usuario, o.idGuardado);
  if (e.estado === "varias") {
    return {ok: false, motivo: "VARIAS_INSTANCIAS",
      detalle: "Hay más de una instancia con tu correo en shalom-api.lat. " +
        "Deja una sola y vuelve a pulsar Conectar."};
  }

  let id = e.instancia ? _txt(e.instancia.id) : "";
  let conectada = !!(e.instancia && e.instancia.conectada === true);
  if (!id) {
    const cr = await deps.crear(NOMBRE);
    if (!cr || !cr.ok) {
      const m = (cr && cr.motivo) || "SIN_RED";
      return {ok: false, motivo: m === "BLOQUEADO" ? "PLAN_LLENO" : m,
        detalle: m === "BLOQUEADO" ?
          "Tu plan llegó al límite de instancias. Libera una en " +
            "shalom-api.lat y vuelve a pulsar Conectar." :
          "No se pudo crear tu cuenta en Shalom. Intenta en un momento."};
    }
    id = idDe(cr.json);
    if (!id) {
      return {ok: false, motivo: "FORMATO_DESCONOCIDO",
        detalle: "Shalom creó la cuenta pero no devolvió su id. Mírala en " +
          "shalom-api.lat antes de volver a intentarlo."};
    }
    conectada = false;
  }

  /* ★ YA CONECTADA → NO SE VUELVE A ENTRAR. Solo se guarda cuál es.
     Excepción: si ACABAS de escribir la contraseña, se entra para que
     Shalom guarde la nueva (y la use al reconectar solo). */
  if (!conectada || o.recienEscritas === true) {
    const en = await deps.entrar(id, usuario, clave);
    if (!en || !en.ok) {
      const m = (en && en.motivo) || "SIN_RED";
      // Aquí un rechazo es la contraseña, no la clave de la API.
      if (conectada) {
        await deps.guardarCuenta(id, usuario);
        return {ok: true, conectada: true, usuario, id,
          aviso: "La sesión sigue activa, pero Shalom no aceptó la " +
            "contraseña nueva. Revísala."};
      }
      return {ok: false,
        motivo: m === "BLOQUEADO" ? "CREDENCIALES_MALAS" : m,
        detalle: m === "BLOQUEADO" ?
          "Shalom no aceptó el correo o la contraseña de pro.shalom.pe." :
          "Shalom no respondió al entrar. Intenta en unos minutos."};
    }
    const st = await deps.estado(id);
    conectada = !!(st && st.ok && st.sesion && st.sesion.conectada);
  }

  // La instancia es TUYA (por correo): se guarda aunque falte confirmar.
  await deps.guardarCuenta(id, usuario);
  if (!conectada) {
    return {ok: false, motivo: "SIN_SESION_SHALOM",
      detalle: "Entró, pero Shalom aún no confirma la sesión. Espera un " +
        "minuto y vuelve a abrir Config."};
  }
  return {ok: true, conectada: true, usuario, id};
}

/**
 * ¿Sigue conectada la instancia guardada? Gratis.
 * @param {Object} deps {estado}
 * @param {Object} opc {idGuardado, usuarioGuardado, hayCredenciales}
 * @return {Promise<Object>} {ok, conectada, usuario, motivo}
 */
async function estado(deps, opc) {
  const o = opc || {};
  const id = _txt(o.idGuardado);
  const base = {usuario: _txt(o.usuarioGuardado) || null, id: id || null,
    hayCredenciales: !!o.hayCredenciales};
  if (!id) {
    return Object.assign({ok: true, conectada: false, motivo: "SIN_CUENTA"},
        base);
  }
  const st = await deps.estado(id);
  if (!st || !st.ok) {
    const m = (st && st.motivo) || "SIN_RED";
    return Object.assign({ok: m !== "SIN_RED", conectada: false,
      motivo: m === "SIN_INSTANCIA_VALIDA" ? "NO_EXISTE" : m}, base);
  }
  return Object.assign({ok: true, conectada: !!st.sesion.conectada,
    motivo: st.sesion.conectada ? "" : "SIN_SESION"}, base);
}

module.exports = {NOMBRE, mia, idDe, conectar, estado};
