"use strict";

const TOPE_FALLOS = 5;

const DESCANSO_MS = 60 * 1000;

const MOTIVOS_DE_SERVICIO = ["SIN_RED", "ERROR_SHALOM", "BLOQUEADO", "LIMITE"];

function normalizar(doc) {
  const d = (doc && typeof doc === "object" && !Array.isArray(doc)) ? doc : {};
  const num = (x) => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);
  return {
    encendida: d.encendida !== false,
    fallos: num(d.fallos),
    cerradaHasta: num(d.cerradaHasta),
    ultimoMotivo: typeof d.ultimoMotivo === "string" ? d.ultimoMotivo : "",
  };
}

function decidir(estado, ahora, esDiagnostico) {
  const e = normalizar(estado);
  if (!e.encendida) return {pasa: false, motivo: "APAGADA"};
  if (e.cerradaHasta > ahora && !esDiagnostico) {
    return {pasa: false, motivo: "PUERTA_CERRADA", reabre: e.cerradaHasta};
  }
  return {pasa: true, probando: e.cerradaHasta > 0};
}

function tras(estado, r, ahora, probando) {
  const e = normalizar(estado);

  if (r && r.ok) {
    if (!e.fallos && !e.cerradaHasta) return null;
    return {fallos: 0, cerradaHasta: 0, ultimoMotivo: "", ultimoCambio: ahora};
  }

  const motivo = (r && r.motivo) || "ERROR_SHALOM";
  if (MOTIVOS_DE_SERVICIO.indexOf(motivo) < 0) return null;

  if (probando) {
    return {fallos: 0, cerradaHasta: ahora + DESCANSO_MS,
      ultimoMotivo: motivo, ultimoCambio: ahora};
  }

  const fallos = e.fallos + 1;
  if (fallos >= TOPE_FALLOS) {
    return {fallos: 0, cerradaHasta: ahora + DESCANSO_MS,
      ultimoMotivo: motivo, ultimoCambio: ahora};
  }
  return {fallos: fallos, ultimoMotivo: motivo, ultimoCambio: ahora};
}

module.exports = {
  TOPE_FALLOS,
  DESCANSO_MS,
  MOTIVOS_DE_SERVICIO,
  normalizar,
  decidir,
  tras,
};
