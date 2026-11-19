"use strict";

const FINALES = ["FINALIZADO", "ENTREGADO"];
const DIAS_ABIERTA = 60;
const MAX_TEXTO = 500;
const HOSTS_GOOGLE = ["g.page", "search.google.com", "www.google.com",
  "google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"];
const GOOGLE_DEFECTO = "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Total Tools Perú Puente Piedra");

function _txt(v, max) {
  if (typeof v !== "string") return "";
  return Array.from(v.replace(/[\r\n\t]+/g, " "))
      .filter((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">")
      .join("").replace(/ +/g, " ").trim().slice(0, max);
}

function abierta(pedido, ahoraMs) {
  const p = pedido || {};
  if (FINALES.indexOf(String(p.status || "").trim().toUpperCase()) < 0) {
    return false;
  }
  const t = Date.parse(String(p.createdAt || p.date || ""));
  return isFinite(t) && ahoraMs - t < DIAS_ABIERTA * 86400000;
}

function limpiar(body) {
  const b = body && typeof body === "object" ? body : {};
  const n = Number(b.estrellas);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return {estrellas: n, texto: _txt(b.texto, MAX_TEXTO)};
}

function publica(resena) {
  const r = resena && typeof resena === "object" ? resena : null;
  if (!r || !Number.isInteger(r.estrellas) || r.estrellas < 1 ||
      r.estrellas > 5) {
    return null;
  }
  return {estrellas: r.estrellas, texto: _txt(r.texto, MAX_TEXTO)};
}

function linkGoogle(cfg) {
  const s = cfg && typeof cfg.link === "string" ? cfg.link.trim() : "";
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return GOOGLE_DEFECTO;
  }
  if (u.protocol !== "https:" || HOSTS_GOOGLE.indexOf(u.hostname) < 0 ||
      u.username || u.password || s.length > 500) {
    return GOOGLE_DEFECTO;
  }
  return u.toString();
}

module.exports = {FINALES, DIAS_ABIERTA, MAX_TEXTO, HOSTS_GOOGLE,
  GOOGLE_DEFECTO, abierta, limpiar, publica, linkGoogle};
