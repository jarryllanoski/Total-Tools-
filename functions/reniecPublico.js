"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.ReniecPublico = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const LIMITE_DIA = 150;

  const CACHE_DIAS = 365;

  function normalizar(x) {
    const d = String(x === undefined || x === null ? "" : x)
        .replace(/[^0-9]/g, "");
    return d.length === 8 ? d : "";
  }

  function diaDe(ahora) {
    const t = new Date((Number(ahora) || 0) - 5 * 3600 * 1000);
    return t.toISOString().slice(0, 10);
  }

  function cacheVale(c, ahora) {
    if (!c || typeof c !== "object") return false;
    if (!String(c.nombres || "").trim()) return false;
    const t = Number(c.cuando);
    if (!isFinite(t) || t <= 0) return false;
    return (Number(ahora) - t) < CACHE_DIAS * 86400000;
  }

  function decidir(e) {
    const o = e || {};
    const dni = normalizar(o.dni);
    if (!dni) {
      return {accion: "rechazar", motivo: "DNI_NO_VALIDO",
        detalle: "El DNI son 8 números."};
    }
    if (o.appCheck !== true) {
      return {accion: "rechazar", motivo: "SIN_APPCHECK",
        detalle: "Recarga la página e intenta de nuevo."};
    }
    if (cacheVale(o.cache, o.ahora)) {
      return {accion: "cache", persona: o.cache};
    }
    const n = Number(o.consultasHoy) || 0;
    if (n >= LIMITE_DIA) {
      return {accion: "rechazar", motivo: "TOPE_DIA",
        detalle: "Escribe tu nombre completo, por favor."};
    }
    return {accion: "consultar", dni: dni};
  }

  function guardable(persona, ahora) {
    const p = (persona && typeof persona === "object") ? persona : {};
    const txt = (x) => String(x === undefined || x === null ? "" : x).trim();
    const nombres = txt(p.nombres);
    if (!nombres) return null;
    const pat = txt(p.apePaterno);
    const mat = txt(p.apeMaterno);
    return {
      nombres: nombres,
      apePaterno: pat,
      apeMaterno: mat,
      completo: [nombres, pat, mat].filter(Boolean).join(" "),
      cuando: Number(ahora) || 0,
    };
  }

  const TEMPORALES = ["SIN_RED", "ERROR_SHALOM", "FORMATO_DESCONOCIDO",
    "SIN_RESPUESTA", "LIMITE", "MUCHAS_CONSULTAS", "SIN_APPCHECK"];
  function esTemporal(motivo) {
    return TEMPORALES.indexOf(String(motivo || "")) >= 0;
  }
  function resultado(r, traducir) {
    if (!r || !r.ok) return {ok: false, motivo: (r && r.motivo) || "SIN_RED"};
    const t = traducir(r.json);
    if (t && t.ok && t.persona) return {ok: true, persona: t.persona};
    const msj = String((r.json && (r.json.message || r.json.error)) || "");
    if (/no\s+(se\s+)?encontr|not\s+found|no\s+existe/i.test(msj)) {
      return {ok: false, motivo: "NO_ENCONTRADO"};
    }
    return {ok: false, motivo: "SIN_RESPUESTA"};
  }

  return {LIMITE_DIA, CACHE_DIAS, normalizar, diaDe, cacheVale, decidir,
    guardable, esTemporal, resultado};
});
