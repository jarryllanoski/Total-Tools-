"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Actividad = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const MAX = 50;
  const VENTANA_MS = 6 * 3600000;
  const TIPOS = {
    pedido: {ico: "📦", txt: "hizo un pedido", grupo: "pedidos"},
    visto: {ico: "👁️", txt: "vio su seguimiento", grupo: "vistas",
      unaVez: true},
    doc: {ico: "📄", txt: "abrió su", grupo: "vistas", unaVez: true},
    resena: {ico: "⭐", txt: "calificó su compra", grupo: "resenas"},
    reclamo: {ico: "🛡️", txt: "pidió", grupo: "reclamos"},
    promo: {ico: "🛍️", txt: "quiere la promo", grupo: "promos",
      unaVez: true},
    sorteo: {ico: "🎉", txt: "entró al sorteo", grupo: "promos",
      unaVez: true},
  };
  const DOCS = {boleta: "boleta", paquete: "foto del paquete",
    guia: "guía de envío"};
  const RECLAMOS = {cambio: "un cambio", devolucion: "una devolución",
    falla: "garantía por falla"};

  function _txt(v, max) {
    if (typeof v !== "string" && typeof v !== "number") return "";
    return Array.from(String(v).replace(/[\r\n\t]+/g, " "))
        .filter((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">")
        .join("").replace(/ +/g, " ").trim().slice(0, max);
  }

  function nombreCorto(n) {
    const p = _txt(n, 60).split(" ")[0] || "";
    return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
  }

  function codigo(pedido) {
    const p = pedido || {};
    const nro = _txt(p.nroComprobante, 20).replace(/[^A-Za-z0-9-]/g, "");
    if (nro) return nro.toUpperCase();
    return _txt(p.id, 64).slice(-4).toUpperCase();
  }

  function evento(tipo, pedido, extra, ahoraMs) {
    if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo)) return null;
    const p = pedido || {};
    const id = _txt(p.id, 64);
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(id)) return null;
    const e = extra || {};
    const ev = {t: tipo, id: id, n: nombreCorto(p.name), c: codigo(p),
      ts: Number(ahoraMs) || 0};
    const x = _txt(e.x, 40);
    const s = _txt(e.s, 80);
    if (x) ev.x = x;
    if (s) ev.s = s;
    return ev;
  }

  function valido(ev) {
    return !!(ev && typeof ev === "object" &&
      Object.prototype.hasOwnProperty.call(TIPOS, ev.t) &&
      typeof ev.id === "string" && ev.id &&
      typeof ev.ts === "number" && isFinite(ev.ts));
  }

  function lista(items) {
    return (Array.isArray(items) ? items : []).filter(valido);
  }

  function repetido(items, ev, ventanaMs) {
    if (!ev || !TIPOS[ev.t] || !TIPOS[ev.t].unaVez) return false;
    const v = typeof ventanaMs === "number" ? ventanaMs : VENTANA_MS;
    return lista(items).some((i) => i.t === ev.t && i.id === ev.id &&
      (i.x || "") === (ev.x || "") && ev.ts - i.ts < v && ev.ts >= i.ts);
  }

  function agregar(items, ev) {
    const l = lista(items);
    if (!valido(ev)) return l.slice(0, MAX);
    return [ev].concat(l).slice(0, MAX);
  }

  function clave(ev) {
    return ev.t + "|" + ev.id + "|" + (ev.x || "");
  }

  function texto(ev) {
    const d = TIPOS[ev && ev.t];
    if (!d) return "";
    const quien = (ev.n || "Cliente") + " (#" + (ev.c || "") + ")";
    if (ev.t === "doc") {
      return quien + " " + d.txt + " " + (DOCS[ev.x] || "documento");
    }
    if (ev.t === "reclamo") {
      return quien + " " + d.txt + " " + (RECLAMOS[ev.x] || "garantía");
    }
    if (ev.t === "resena") {
      const n = Math.max(0, Math.min(5, parseInt(ev.x, 10) || 0));
      return quien + " " + d.txt + " " + "★".repeat(n) + "☆".repeat(5 - n);
    }
    if (ev.t === "promo" || ev.t === "sorteo") {
      return quien + " " + d.txt + (ev.x ? " «" + ev.x + "»" : "");
    }
    return quien + " " + d.txt;
  }

  function urgente(ev) {
    if (!ev) return false;
    if (ev.t === "reclamo") return true;
    return ev.t === "resena" && (parseInt(ev.x, 10) || 0) <= 3;
  }

  return {MAX, VENTANA_MS, TIPOS, DOCS, RECLAMOS, nombreCorto, codigo,
    evento, valido, lista, repetido, agregar, clave, texto, urgente};
});
