"use strict";

/*
 * comprobante.js — Modulo aislado (Fase 1).
 *
 * Descarga un comprobante PDF de API Sale, extrae su texto y parsea los
 * productos (codigo interno / descripcion / cantidad). Detecta formato
 * ticket y A4. NO escribe en Firestore ni toca otras funciones: solo
 * descarga, lee y devuelve.
 *
 * El parser es la misma logica validada con muestras reales (ticket y A4,
 * con y sin codigo, con codigos raros tipo WAY1A10).
 */

const pdfParse = require("pdf-parse");

// ── Seguridad: solo se permite este dominio y estas rutas (anti-SSRF) ──────
const HOST_PERMITIDO = "apisale.institucional.pe";
const RUTA_PDF_RE = /^\/sale\/view\/logistico\/pdf\/[^/]+\/(ticket|A4)\/?$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const TIMEOUT_MS = 20000; // 20 s

// Valida que la URL sea segura para descargar. Devuelve {ok, motivo?, url?}.
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

// Descarga el PDF con timeout, limite de tamano y validacion de tipo/firma.
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

// Extrae el texto plano del PDF.
const extraerTexto = async (buf) => {
  const data = await pdfParse(buf);
  return (data && data.text) || "";
};

// ── Parser (ticket + A4) ───────────────────────────────────────────────────
// Codigo interno: 2-6 letras + un digito + alfanumerico (WAY1A10, THT1320503).
const COD = /^([A-Z]{2,6}\d[A-Z0-9]{0,10})\b[\s:–—-]*/;
const CANT_UNITS = "UND|UNID|UN|PZA|PZS|PCS|DOC|JGO|KG|MT|GLN|LT";
const CANT = new RegExp("^(\\d{1,5})\\s*(?:" + CANT_UNITS + ")\\b", "i");
const STOP_WORDS = [
  "SUBTOTAL", "SON:", "VENTA NETA", "OPERACI", "IGV", "IMPORTE TOTAL",
  "TOTAL\\b", "BANCO", "YAPE", "Representaci", "GRACIAS", "I\\.?\\s*G",
];
const STOP = new RegExp("^(" + STOP_WORDS.join("|") + ")", "i");
const A4_HDR = /ITEM\b[\s\S]*CANTIDAD[\s\S]*(DESCRIP|COD)/i;
const A4_ROW = new RegExp(
    "^(\\d+)\\s+(\\d+(?:[.,]\\d+)?)\\s+([A-Za-zÁÉÍÓÚ.]+)\\s+" +
    "(.+?)\\s+([\\d.,]+)\\s+([\\d.,]+)\\s+([\\d.,]+)\\s*$");

// Extrae el codigo interno del inicio de un texto. {codigo, resto}.
const limpiarCodigo = (linea) => {
  const s = String(linea);
  const m = s.match(COD);
  if (!m) return {codigo: "", resto: s};
  return {codigo: m[1].toUpperCase(), resto: s.slice(m[0].length)};
};

// Arma un item de ticket a partir de las lineas acumuladas + la cantidad.
const buildTicket = (buf, cant) => {
  const arr = buf.slice();
  const c = limpiarCodigo(arr[0] || "");
  if (c.codigo) arr[0] = c.resto;
  const desc = arr.join(" ").replace(/\s+/g, " ").trim();
  return {codigo: c.codigo, desc: desc, cant: cant};
};

// Ticket: lineas apiladas; un item se cierra en cada linea de cantidad.
const parseTicket = (lines) => {
  let s = 0;
  let e = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/CANT\b.*IMPORTE|CANT\.?\s*P\.?\s*UNIT/i.test(lines[i])) {
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
  for (let i = s; i < e; i++) {
    const mc = lines[i].match(CANT);
    if (mc) {
      if (buf.length) {
        out.push(buildTicket(buf, parseInt(mc[1], 10) || 1));
        buf = [];
      }
      continue;
    }
    buf.push(lines[i]);
  }
  return out;
};

// A4: cada producto en una linea con columnas (EAN + codigo interno + LAB).
const parseA4 = (lines, hdr) => {
  const out = [];
  for (let i = hdr + 1; i < lines.length; i++) {
    const ln = lines[i];
    if (STOP.test(ln)) break;
    const m = ln.match(A4_ROW);
    if (!m) continue;
    let mid = m[4].trim();
    const ean = (mid.match(/^\d{6,}/) || [""])[0];
    mid = mid.replace(/^\d{6,}\s+/, "");
    const c = limpiarCodigo(mid);
    const desc = c.resto.replace(/\s*No asignado\s*$/i, "").trim();
    const cant = parseInt(String(m[2]).replace(",", "."), 10) || 1;
    out.push({codigo: c.codigo, desc: desc, cant: cant, ean: ean});
  }
  return out;
};

// Detecta el formato (ticket vs A4) y devuelve la lista de productos.
const parseComprobante = (raw) => {
  const lines = String(raw || "")
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  const hdr = lines.findIndex((l) => A4_HDR.test(l));
  return hdr >= 0 ? parseA4(lines, hdr) : parseTicket(lines);
};

// Orquesta todo: valida -> descarga -> extrae texto -> parsea.
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
};
