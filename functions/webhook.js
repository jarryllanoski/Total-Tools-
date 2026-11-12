"use strict";

const crypto = require("crypto");

const TOLERANCIA_S = 300;

const CUERPO_MAX = 64 * 1024;

const ES_CODIGO = /^[A-Z][A-Z_]{2,29}$/;

function leerCabecera(cab) {
  const partes = String(cab || "").split(",");
  let t = null; let v1 = null;
  partes.forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") v1 = v;
  });
  if (!t || !v1 || !/^\d{1,15}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) {
    return null;
  }
  return {t: t, v1: v1};
}

function verificarFirma(cab, crudo, secreto, ahoraMs) {
  if (!secreto) return {ok: false, motivo: "SIN_SECRETO"};
  const c = leerCabecera(cab);
  if (!c) return {ok: false, motivo: "FIRMA_MAL_FORMADA"};

  const edad = Math.abs((Number(ahoraMs) || 0) / 1000 - Number(c.t));
  if (edad > TOLERANCIA_S) return {ok: false, motivo: "FIRMA_VENCIDA"};

  const cuerpo = Buffer.isBuffer(crudo) ? crudo :
    Buffer.from(String(crudo || ""));
  if (cuerpo.length > CUERPO_MAX) return {ok: false, motivo: "CUERPO_ENORME"};

  const esperada = crypto.createHmac("sha256", secreto)
      .update(Buffer.concat([Buffer.from(c.t + "."), cuerpo]))
      .digest("hex");

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(String(c.v1).toLowerCase(), "utf8");
  if (a.length !== b.length) return {ok: false, motivo: "FIRMA_INVALIDA"};
  if (!crypto.timingSafeEqual(a, b)) {
    return {ok: false, motivo: "FIRMA_INVALIDA"};
  }
  return {ok: true, t: Number(c.t)};
}

function idDeEvento(cab) {
  const c = leerCabecera(cab);
  if (!c) return null;
  return "ev_" + c.t + "_" + c.v1.slice(0, 32);
}

function codigos(v, ruta, salida) {
  salida = salida || {};
  ruta = ruta || "";
  if (typeof v === "string") {
    if (ES_CODIGO.test(v)) salida[ruta || "(raiz)"] = v;
    return salida;
  }
  if (!v || typeof v !== "object") return salida;
  if (Array.isArray(v)) {
    v.slice(0, 20).forEach((x, i) => codigos(x, ruta + "[" + i + "]", salida));
    return salida;
  }
  Object.keys(v).slice(0, 40).forEach((k) => {
    codigos(v[k], ruta ? ruta + "." + k : k, salida);
  });
  return salida;
}

module.exports = {
  TOLERANCIA_S,
  CUERPO_MAX,
  leerCabecera,
  verificarFirma,
  idDeEvento,
  codigos,
};
