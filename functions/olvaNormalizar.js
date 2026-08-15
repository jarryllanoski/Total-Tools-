"use strict";

/**
 * olvaNormalizar.js — Traduce una agencia CRUDA de Olva al formato del
 * catalogo (data/agencias-olva.json), que es el que entiende el buscador
 * del formulario.
 *
 * POR QUE EXISTE: Olva devuelve `nombres/department/province/district/lat/lng`
 * y el formulario lee `nombre/departamento/provincia/distrito/latitud` y
 * `longitud`.
 * Sin traducir, el respaldo en vivo (agenciasOlva) pintaba la agencia como
 * "—" y sin ubicacion, y al elegirla se guardaba solo la direccion.
 *
 * Gemelo en el navegador: `_mapOlva` de agencias-extractor.js (mismo mapeo,
 * para generar el JSON). Si cambia el formato de Olva, se tocan los dos.
 */

const DIAS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const txt = (v) => String(v == null ? "" : v).trim();

/**
 * Arma "L-V 08:00-19:00 · S 08:00-14:30" desde el objeto horario de Olva.
 * @param {Object} h horario crudo
 * @return {string} horario legible
 */
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

/**
 * @param {Object} raw agencia cruda de Olva
 * @return {Object} agencia en el formato del catalogo
 */
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
