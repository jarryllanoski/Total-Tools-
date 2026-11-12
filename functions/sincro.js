"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Sincro = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const V = 1;
  const MARGEN_MS = 60 * 1000;
  const COMPLETA_CADA_MS = 12 * 3600 * 1000;
  const MAX_DELTA = 1500;
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  function decidir(e) {
    const o = e || {};
    const s = o.sync;
    if (o.forzarCompleta) return {modo: "completa", motivo: "pedida"};
    if (!o.activo) return {modo: "completa", motivo: "apagada en esta PC"};
    if (!o.cfg || !(Number(o.cfg.syncV) >= V)) {
      return {modo: "completa", motivo: "servidor sin _mts aún"};
    }
    if (!o.tieneLocal) return {modo: "completa", motivo: "sin copia local"};
    if (!s || s.v !== V || !ISO.test(String(s.ts || ""))) {
      return {modo: "completa", motivo: "sin marca válida"};
    }
    const ahora = Number(o.ahora) || Date.now();
    if (!(Number(s.full) > 0) || ahora - Number(s.full) > COMPLETA_CADA_MS) {
      return {modo: "completa", motivo: "más de 12 h sin carga completa"};
    }
    return {modo: "cambios", motivo: ""};
  }

  function desde(sync) {
    const t = Date.parse(sync.ts);
    return new Date(t - MARGEN_MS).toISOString();
  }

  function _maxMts(lista) {
    let m = "";
    (lista || []).forEach((d) => {
      const v = d && d._mts;
      if (typeof v === "string" && ISO.test(v) && v > m) m = v;
    });
    return m;
  }

  function marcaTras(previa, vistos, completa, ahora) {
    const p = (previa && previa.v === V && ISO.test(String(previa.ts || ""))) ?
      previa : null;
    let ts = _maxMts(vistos);
    if (p && p.ts > ts) ts = p.ts;
    if (!ts) ts = "1970-01-01T00:00:00.000Z";
    return {v: V, ts: ts,
      full: completa ? (Number(ahora) || Date.now()) : (p ? p.full : 0)};
  }

  function aplicar(local, cambiados, lapidas) {
    const porId = {};
    (local || []).forEach((d) => {
      if (d && d.id) porId[d.id] = d;
    });
    const borrar = {};
    (lapidas || []).forEach((l) => {
      if (l && l.id) borrar[l.id] = String(l._mts || "");
    });
    (cambiados || []).forEach((d) => {
      if (!d || !d.id) return;
      const tb = borrar[d.id];
      if (tb && tb > String(d._mts || "")) return;
      porId[d.id] = d;
      delete borrar[d.id];
    });
    Object.keys(borrar).forEach((id) => {
      delete porId[id];
    });
    return Object.keys(porId).map((k) => porId[k]);
  }

  function novedades(local, recibidos) {
    const ya = {};
    (local || []).forEach((d) => {
      if (d && d.id) ya[d.id] = String(d._mts || "");
    });
    let n = 0;
    (recibidos || []).forEach((d) => {
      if (!d || !d.id) return;
      if (!(d.id in ya) || ya[d.id] !== String(d._mts || "")) n++;
    });
    return n;
  }

  function novedadTotal(local, r) {
    const l = local || {};
    const rr = r || {};
    const mts = {};
    ["shipments", "suppliers"].forEach((col) => {
      (l[col] || []).forEach((d) => {
        if (d && d.id) mts[col + "|" + d.id] = String(d._mts || "");
      });
    });
    const lap = (rr.lapidas || []).filter((x) => {
      if (!x || !x.id) return false;
      const k = (x.col || "shipments") + "|" + x.id;
      return (k in mts) && mts[k] < String(x._mts || "");
    }).length;
    return novedades(l.shipments, rr.ships) + novedades(l.suppliers, rr.supps) +
      lap;
  }

  function total(r) {
    return ((r && r.ships) || []).length + ((r && r.supps) || []).length +
      ((r && r.lapidas) || []).length;
  }

  function idLapida(col, id) {
    return String(col) + "__" + String(id).replace(/\//g, "_");
  }

  return {V, MARGEN_MS, COMPLETA_CADA_MS, MAX_DELTA, decidir, desde,
    marcaTras, aplicar, total, novedades, novedadTotal, idLapida};
});
