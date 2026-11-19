"use strict";

const TIPOS = {
  boleta: {campo: "docTicket", nombre: "boleta"},
  paquete: {campo: "docEmbalado", nombre: "foto-del-paquete"},
  guia: {campo: "docGuia", nombre: "guia-de-envio"},
};

const MAX_BYTES = 8 * 1024 * 1024;
const MIME = /^(image\/(png|jpe?g|webp|gif|heic|heif)|application\/pdf)$/i;
const ID = /^[A-Za-z0-9_-]{2,64}$/;

function _txt(v) {
  return typeof v === "string" ? v.trim() : "";
}

function linkHttps(pedido) {
  const l = ((pedido && pedido.links) || []).find((x) =>
    x && /^https:\/\/[^\s"'<>]+$/i.test(_txt(x.u)));
  return l ? _txt(l.u) : "";
}

function origen(doc, pedidoId, bucket) {
  if (!doc || typeof doc !== "object" || !ID.test(_txt(pedidoId))) return null;
  const d = _txt(doc.d);
  if (!d || d === "[img]") return null;
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(d);
  if (m) {
    if (!MIME.test(m[1])) return null;
    return {tipo: "base64", mime: m[1].toLowerCase(), datos: m[2]};
  }
  let u;
  try {
    u = new URL(d);
  } catch (e) {
    return null;
  }
  const host = "firebasestorage.googleapis.com";
  if (u.protocol !== "https:" || u.hostname !== host) return null;
  const r = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
  if (!r || (bucket && r[1] !== bucket)) return null;
  let ruta;
  try {
    ruta = decodeURIComponent(r[2]);
  } catch (e) {
    return null;
  }
  const carpeta = "shipments/" + _txt(pedidoId) + "/";
  if (ruta.indexOf(carpeta) !== 0 || /\.\.|\/\//.test(ruta) ||
      ruta.length > 200 || ruta.slice(carpeta.length).indexOf("/") >= 0) {
    return null;
  }
  return {tipo: "bucket", ruta: ruta};
}

function disponibles(pedido, bucket) {
  const p = pedido || {};
  const hay = (k) => !!origen(p[TIPOS[k].campo], p.id, bucket);
  const link = linkHttps(p);
  return {
    boleta: hay("boleta") ? "archivo" : (link ? "link" : ""),
    paquete: hay("paquete") ? "archivo" : "",
    guia: hay("guia") ? "archivo" : "",
    link: link,
  };
}

module.exports = {TIPOS, MAX_BYTES, MIME, origen, disponibles, linkHttps};
