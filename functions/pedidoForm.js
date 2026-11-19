"use strict";

const TEXTOS = {
  name: 120,
  address: 600,
  referencia: 300,
  notes: 600,
  ciudadDestino: 120,
  encAgencia: 200,
  agenciaNombre: 120,
  agenciaGeo: 200,
};

const DOCUMENTOS = ["dni", "dniRecoger", "dniDestinatario"];

const SIEMPRE = ["name", "address", "referencia", "notes"];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const GPS = /^-?\d{1,3}(\.\d{1,10})?,\s?-?\d{1,3}(\.\d{1,10})?$/;
const COURIER_NO = /[^\p{L}\p{N} .,&()/+-]/gu;

function _visible(c) {
  const n = c.charCodeAt(0);
  return c === "\n" || (n >= 32 && n !== 127 && c !== "<" && c !== ">");
}

function texto(v, max) {
  if (typeof v !== "string") return "";
  return Array.from(v.replace(/\r\n?/g, "\n").replace(/\t/g, " "))
      .filter(_visible).join("")
      .replace(/ +/g, " ")
      .trim()
      .slice(0, max);
}

function digitos(v, max) {
  if (typeof v !== "string" && typeof v !== "number") return "";
  return String(v).replace(/\D/g, "").slice(0, max);
}

function celular(v) {
  const d = digitos(v, 20);
  return d.length >= 9 ? d.slice(-9) : "";
}

function extra(v) {
  const out = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  Object.keys(v).slice(0, 20).forEach((k) => {
    const clave = texto(k, 40);
    if (clave) out[clave] = texto(v[k], 300);
  });
  return out;
}

function linkSeguro(u) {
  const s = typeof u === "string" ? u.trim() : "";
  if (!/^https:\/\/[^\s"'<>]+$/i.test(s) || s.length > 2000) return null;
  return {u: s, n: s.length > 36 ? s.slice(0, 36) + "…" : s};
}

function limpiar(order) {
  const o = order && typeof order === "object" ? order : {};
  const out = {};
  Object.keys(TEXTOS).forEach((k) => {
    const v = texto(o[k], TEXTOS[k]);
    if (v || SIEMPRE.indexOf(k) >= 0) out[k] = v;
  });
  DOCUMENTOS.forEach((k) => {
    const v = digitos(o[k], 12);
    if (v) out[k] = v;
  });
  out.phone = celular(o.phone);
  const courier = typeof o.courier === "string" ?
    o.courier.replace(COURIER_NO, "").trim().slice(0, 60) : "";
  out.courier = courier;
  if (typeof o.date === "string" && FECHA.test(o.date)) out.date = o.date;
  if (typeof o.gpsCoords === "string" && GPS.test(o.gpsCoords.trim())) {
    out.gpsCoords = o.gpsCoords.trim();
  }
  if (typeof o.agenciaId === "string") out.agenciaId = o.agenciaId;
  if (typeof o.agenciaCourier === "string") {
    out.agenciaCourier = o.agenciaCourier;
  }
  const ex = extra(o.extra);
  if (Object.keys(ex).length) out.extra = ex;
  return out;
}

module.exports = {TEXTOS, DOCUMENTOS, SIEMPRE, texto, digitos, celular, extra,
  linkSeguro, limpiar};
