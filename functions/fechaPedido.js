"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.FechaPedido = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const ZONA = "America/Lima";
  const DIA = /^\d{4}-\d{2}-\d{2}$/;
  const SIN_HORA = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.000)?Z$/;

  function diaLima(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {timeZone: ZONA,
      year: "numeric", month: "2-digit", day: "2-digit"}).format(d);
  }

  function envio(p) {
    return String((p && p.date) || "");
  }

  function registro(p) {
    const v = String((p && p.createdAt) || "").trim();
    if (!v) return "";
    const m = SIN_HORA.exec(v);
    if (m) return m[1];
    if (DIA.test(v)) return v;
    return diaLima(new Date(v));
  }

  function hoyLima(ahora) {
    return diaLima(ahora || new Date());
  }

  function segun(p, campo) {
    return campo === "registro" ? registro(p) : envio(p);
  }

  function enRango(p, campo, desde, hasta) {
    if (!desde && !hasta) return true;
    const f = segun(p, campo);
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    return true;
  }

  function sumarDias(dia, n) {
    if (!DIA.test(String(dia || ""))) return "";
    const [a, m, d] = dia.split("-").map(Number);
    const t = new Date(Date.UTC(a, m - 1, d + (Number(n) || 0)));
    return t.toISOString().slice(0, 10);
  }

  function inicioDiaLimaISO(dia) {
    if (!DIA.test(String(dia || ""))) return "";
    return new Date(dia + "T00:00:00-05:00").toISOString();
  }

  return {ZONA, diaLima, envio, registro, hoyLima, segun, enRango,
    sumarDias, inicioDiaLimaISO};
});
