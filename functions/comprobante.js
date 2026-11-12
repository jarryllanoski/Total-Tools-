"use strict";

const pdfParse = require("pdf-parse");
const crypto = require("crypto");

const PARSER_VERSION = 3;

const hashUrl = (u) =>
  crypto.createHash("sha256").update(String(u)).digest("hex");

const buscarLink = (links) => {
  const arr = Array.isArray(links) ? links : [];
  for (let i = 0; i < arr.length; i++) {
    const u = (arr[i] && arr[i].u) || "";
    if (/apisale\.institucional\.pe/i.test(u)) return u;
  }
  return "";
};

const HOST_PERMITIDO = "apisale.institucional.pe";
const RUTA_PDF_RE = /^\/sale\/view\/logistico\/pdf\/[^/]+\/(ticket|A4)\/?$/i;
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20000;

const validarUrl = (url) => {
  let u;
  try {
    u = new URL(String(url || ""));
  } catch (e) {
    return {ok: false, motivo: "URL invalida"};
  }
  if (u.protocol !== "https:") return {ok: false, motivo: "Debe ser HTTPS"};
  if (u.hostname !== HOST_PERMITIDO) {
    return {ok: false, motivo: "Dominio no permitido: " + u.hostname};
  }
  if (!RUTA_PDF_RE.test(u.pathname)) {
    return {ok: false, motivo: "Ruta no corresponde a un PDF ticket/A4"};
  }
  return {ok: true, url: u.href};
};

const descargarPdf = async (url) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {"User-Agent": "TotalTools/1.0 (comprobante)"},
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " al descargar");
    const tipo = (resp.headers.get("content-type") || "").toLowerCase();
    const okTipo = !tipo || tipo.indexOf("pdf") >= 0 ||
      tipo.indexOf("octet-stream") >= 0;
    if (!okTipo) throw new Error("El contenido no es un PDF (" + tipo + ")");
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error("PDF demasiado grande");
    if (buf.slice(0, 4).toString("latin1") !== "%PDF") {
      throw new Error("El archivo no tiene firma de PDF");
    }
    return buf;
  } finally {
    clearTimeout(timer);
  }
};

const extraerTexto = async (buf) => {
  const data = await pdfParse(buf);
  return (data && data.text) || "";
};

const COD = /^([A-Z]{2,6}\d[A-Z0-9]{0,10})\b[\s:–—-]*/;
const UNIT_WORDS = "UND|UNID|UN|PZA|PZS|PCS|DOC|JGO|KG|MT|GLN|LT";
const UNIT = new RegExp("^(?:" + UNIT_WORDS + ")\\b", "i");
const STOP_WORDS = [
  "SUBTOTAL", "SON:", "VENTA NETA", "OPERACI", "IGV", "IMPORTE TOTAL",
  "TOTAL\\s*S/", "BANCO", "YAPE", "Representaci", "GRACIAS", "EFECTIVO",
  "CANCELADA", "I\\.?\\s*G",
];
const STOP = new RegExp("^(" + STOP_WORDS.join("|") + ")", "i");
const A4_HDR = /ITEM.*CANTIDAD.*UNIDAD/i;
const A4_ROW = /^(\d+)UND(\d{6,}|-)$/i;
const CANT_HDR = /CANT.*(P\.?\s*UNIT|IMPORTE)/i;

const codeOf = (linea) => {
  const t = String(linea);
  const m = t.match(COD);
  if (!m) return {codigo: "", resto: t};
  return {codigo: m[1].toUpperCase(), resto: t.slice(m[0].length)};
};

const buildItem = (buf, cant, ean) => {
  const arr = buf.slice();
  const c = codeOf(arr[0] || "");
  if (c.codigo) arr[0] = c.resto;
  let desc = arr.join(" ").replace(/\s+/g, " ").trim();
  desc = desc.replace(/\s*No asignado\s*$/i, "").trim();
  return {codigo: c.codigo, desc: desc, cant: cant, ean: ean || ""};
};

const parseTicket = (lines) => {
  let s = 0;
  let e = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (CANT_HDR.test(lines[i])) {
      s = i + 1;
      break;
    }
  }
  for (let i = s; i < lines.length; i++) {
    if (STOP.test(lines[i])) {
      e = i;
      break;
    }
  }
  const out = [];
  let buf = [];
  let i = s;
  while (i < e) {
    const ln = lines[i];
    const next = lines[i + 1] || "";
    if (/^\d+$/.test(ln) && UNIT.test(next)) {
      const cant = parseInt(ln, 10) || 1;
      if (buf.length) {
        out.push(buildItem(buf, cant));
        buf = [];
      }
      i += 2;
      if (lines[i] && /^[\d.,]+$/.test(lines[i])) i += 1;
      continue;
    }
    buf.push(ln);
    i += 1;
  }
  return out;
};

const parseA4 = (lines) => {
  const hdr = lines.findIndex((l) => A4_HDR.test(l));
  const rows = [];
  for (let i = hdr + 1; i < lines.length; i++) {
    if (STOP.test(lines[i])) break;
    const m = lines[i].match(A4_ROW);
    if (m) rows.push({m: m, i: i});
  }
  const out = [];
  for (let r = 0; r < rows.length; r++) {
    const m = rows[r].m;
    const lead = m[1];
    const ean = /^\d+$/.test(m[2]) ? m[2] : "";
    const item = String(out.length + 1);
    let cant = parseInt(lead, 10) || 1;
    if (lead.indexOf(item) === 0 && lead.length > item.length) {
      cant = parseInt(lead.slice(item.length), 10) || 1;
    }
    const start = rows[r].i + 1;
    const end = (r + 1 < rows.length) ? rows[r + 1].i : lines.length;
    const buf = [];
    for (let i = start; i < end; i++) {
      const ln = lines[i];
      if (STOP.test(ln)) break;
      if (/^[\d.,]+$/.test(ln)) continue;
      if (/^(No|asignado|No asignado)$/i.test(ln)) continue;
      buf.push(ln);
    }
    out.push(buildItem(buf, cant, ean));
  }
  return out;
};

const parseComprobante = (raw) => {
  const lines = String(raw || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const isA4 = lines.some((l) => A4_HDR.test(l));
  return isA4 ? parseA4(lines) : parseTicket(lines);
};

const procesarUrl = async (url) => {
  const v = validarUrl(url);
  if (!v.ok) return {ok: false, motivo: v.motivo};
  const buf = await descargarPdf(v.url);
  const textoCrudo = await extraerTexto(buf);
  const productos = parseComprobante(textoCrudo);
  return {ok: true, textoCrudo: textoCrudo, productos: productos};
};

module.exports = {
  validarUrl,
  descargarPdf,
  extraerTexto,
  parseComprobante,
  procesarUrl,
  hashUrl,
  buscarLink,
  PARSER_VERSION,
};
