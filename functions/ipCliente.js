"use strict";

const INTERNAS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^35\.191\./,
  /^130\.211\.[0-3]\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

const FORMA = /^[0-9a-f:.]{3,45}$/i;

function _interna(ip) {
  return INTERNAS.some((r) => r.test(ip));
}

function de(req) {
  const cabecera = req && typeof req.get === "function" ?
    String(req.get("x-forwarded-for") || "") : "";
  const partes = cabecera.split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = partes.length - 1; i >= 0; i--) {
    if (!FORMA.test(partes[i])) return "invalida";
    if (!_interna(partes[i])) return partes[i];
  }
  const directa = String((req && req.ip) || "").trim();
  return FORMA.test(directa) ? directa : "desconocida";
}

module.exports = {de, INTERNAS};
