"use strict";

const NOMBRE = "Total Tools Panel";

function _txt(v) {
  return typeof v === "string" ? v.trim() : (typeof v === "number" ?
    String(v) : "");
}

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

function mia(lista, correo, idGuardado) {
  const L = Array.isArray(lista) ? lista.filter((x) => x && _txt(x.id)) : [];
  const c = _txt(correo).toLowerCase();
  if (!c) return {estado: "ninguna", instancia: null};
  const tuyas = L.filter((x) => _txt(x.usuario).toLowerCase() === c);
  if (tuyas.length === 1) return {estado: "una", instancia: tuyas[0]};
  if (tuyas.length > 1) {
    const orden = tuyas.slice().sort((a, b) =>
      _txt(a.id) < _txt(b.id) ? -1 : (_txt(a.id) > _txt(b.id) ? 1 : 0));
    const elegir = [
      (x) => _txt(idGuardado) !== "" && _txt(x.id) === _txt(idGuardado),
      (x) => _txt(x.nombre) === NOMBRE && x.conectada === true,
      (x) => _txt(x.nombre) === NOMBRE,
      (x) => x.conectada === true,
      () => true,
    ];
    for (let i = 0; i < elegir.length; i++) {
      const hit = orden.find(elegir[i]);
      if (hit) return {estado: "una", instancia: hit};
    }
  }
  const huerf = L.filter((x) => !_txt(x.usuario) && _txt(x.nombre) === NOMBRE);
  if (huerf.length === 1) return {estado: "una", instancia: huerf[0]};
  return {estado: "ninguna", instancia: null};
}

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

  if (!conectada || o.recienEscritas === true) {
    const en = await deps.entrar(id, usuario, clave);
    if (!en || !en.ok) {
      const m = (en && en.motivo) || "SIN_RED";
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

  await deps.guardarCuenta(id, usuario);
  if (!conectada) {
    return {ok: false, motivo: "SIN_SESION_SHALOM",
      detalle: "Entró, pero Shalom aún no confirma la sesión. Espera un " +
        "minuto y vuelve a abrir Config."};
  }
  return {ok: true, conectada: true, usuario, id};
}

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
