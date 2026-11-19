"use strict";

const MAX_PROMOS = 6;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function _txt(v, max) {
  if (typeof v !== "string") return "";
  return Array.from(v.replace(/[\r\n\t]+/g, " "))
      .filter((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">")
      .join("").replace(/ +/g, " ").trim().slice(0, max);
}

function diaLima(ahoraMs) {
  return new Date(ahoraMs - 5 * 3600000).toISOString().slice(0, 10);
}

function vigente(hasta, ahoraMs) {
  if (typeof hasta !== "string" || !hasta) return true;
  if (!FECHA.test(hasta)) return false;
  return diaLima(ahoraMs) <= hasta;
}

function imagenPromo(u, bucket) {
  if (typeof u !== "string") return "";
  let url;
  try {
    url = new URL(u.trim());
  } catch (e) {
    return "";
  }
  if (url.protocol !== "https:" ||
      url.hostname !== "firebasestorage.googleapis.com") {
    return "";
  }
  const r = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(url.pathname);
  if (!r || (bucket && r[1] !== bucket)) return "";
  let ruta;
  try {
    ruta = decodeURIComponent(r[2]);
  } catch (e) {
    return "";
  }
  if (!/^recursos\/promos\/[A-Za-z0-9_-]{1,40}\.(jpg|png|webp)$/.test(ruta)) {
    return "";
  }
  return url.toString();
}

function linkSeguro(u) {
  const s = typeof u === "string" ? u.trim() : "";
  return /^https:\/\/[^\s"'<>]{4,500}$/i.test(s) ? s : "";
}

function precio(v) {
  const n = Number(String(v === undefined || v === null ? "" : v)
      .replace(",", "."));
  return isFinite(n) && n > 0 && n < 1000000 ? Math.round(n * 100) / 100 : 0;
}

function publica(doc, ahoraMs, bucket) {
  const d = doc && typeof doc === "object" ? doc : {};
  if (d.activa === false) return null;
  const promos = (Array.isArray(d.promos) ? d.promos : [])
      .filter((p) => p && typeof p === "object" && p.activa !== false &&
        vigente(p.hasta, ahoraMs))
      .map((p) => ({
        img: imagenPromo(p.img, bucket),
        titulo: _txt(p.titulo, 60),
        precio: precio(p.precio),
        antes: precio(p.antes),
      }))
      .filter((p) => p.img && p.titulo)
      .slice(0, MAX_PROMOS)
      .map((p) => {
        if (!(p.antes > p.precio && p.precio > 0)) delete p.antes;
        return p;
      });
  const s = d.sorteo && typeof d.sorteo === "object" ? d.sorteo : {};
  const sorteo = (s.activo === true && vigente(s.hasta, ahoraMs) &&
    linkSeguro(s.link) && _txt(s.titulo, 60)) ? {
      titulo: _txt(s.titulo, 60),
      texto: _txt(s.texto, 140),
      link: linkSeguro(s.link),
      hasta: FECHA.test(String(s.hasta || "")) ? s.hasta : "",
    } : null;
  if (!promos.length && !sorteo) return null;
  return {promos, sorteo};
}

module.exports = {MAX_PROMOS, diaLima, vigente, imagenPromo, linkSeguro,
  precio, publica};
