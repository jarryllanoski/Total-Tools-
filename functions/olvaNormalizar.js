"use strict";

const DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const txt = (v) => String(v == null ? "" : v).trim();

function horario(h) {
  if (!h || typeof h !== "object") return "";
  let out = "";
  const lv = DIAS.map((d) => h[d]).find((d) => d && d.open && d.close);
  if (lv) out = "L-V " + lv.open + "-" + lv.close;
  const sab = h.saturday;
  if (sab && sab.open && sab.close) {
    out += (out ? " · " : "") + "S " + sab.open + "-" + sab.close;
  }
  return out;
}

function normalizarOlva(raw) {
  const r = raw || {};
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lng);
  return {
    ter_id: txt(r.id || r.ID),
    nombre: txt(r.nombres),
    departamento: txt(r.department),
    provincia: txt(r.province),
    distrito: txt(r.district),
    direccion: txt(r.direccion),
    referencia: "",
    telefono: txt(r.telefono || r.phone),
    horario: horario(r.horario),
    horarioDom: "",
    latitud: isFinite(lat) && lat ? String(lat) : "",
    longitud: isFinite(lng) && lng ? String(lng) : "",
  };
}

module.exports = {normalizarOlva};
