"use strict";

const GUIA = /^[0-9]{8,12}$/;
const GUIA_PANEL = /^(?:[0-9]{8}|1[0-9]{8})$/;
const CODIGO = /^[A-Za-z0-9]{4}$/;
const FIRMA = /(?:^|,)\s*t=\d{1,15}\s*,\s*v1=[0-9a-f]{64}\s*(?:,|$)/i;

const POR_CODIGO = {
  EN_ORIGIN: ["En origen", 0],
  IN_TRANSIT: ["En tránsito", 1],
  AT_DESTINATION: ["En destino", 2],
  OUT_FOR_DELIVERY: ["En reparto", 2],
  DELIVERED: ["Entregado", 3],
};

function _txt(v) {
  return v === null || v === undefined ? "" : String(v).trim();
}

function buscarFirma(cabeceras) {
  const c = cabeceras && typeof cabeceras === "object" ? cabeceras : {};
  const claves = Object.keys(c);
  for (let i = 0; i < claves.length; i++) {
    const v = Array.isArray(c[claves[i]]) ? c[claves[i]][0] : c[claves[i]];
    if (typeof v === "string" && FIRMA.test(v)) return v;
  }
  return "";
}

function leer(evento) {
  const raiz = evento && typeof evento === "object" ? evento : null;
  if (!raiz) return null;
  const e = (!raiz.orderNumber && raiz.data && typeof raiz.data === "object") ?
    raiz.data : raiz;
  if (raiz.event && raiz.event !== "tracking.status_changed") return null;
  const guia = _txt(e.orderNumber).replace(/\D/g, "");
  if (!GUIA.test(guia)) return null;
  const codigo = _txt(e.orderCode).toUpperCase();
  const par = POR_CODIGO[_txt(e.statusCode).toUpperCase()];
  if (!par) return {guia, codigo, res: null};
  const fecha = _txt(e.statusAt);
  return {guia, codigo, res: {ok: true, estado: par[0], pasos: par[1],
    fecha: isFinite(Date.parse(fecha)) ? new Date(fecha).toISOString() : "",
    demora: e.delayed === true, fuente: "aviso"}};
}

function esDelPedido(pedido, aviso) {
  const p = pedido || {};
  const g = _txt(p.trackingOrderNumber || p.shalomGuia).replace(/\D/g, "");
  if (!aviso || g !== aviso.guia) return false;
  const c = _txt(p.trackingOrderCode || p.shalomCodigo).toUpperCase();
  return !c || !aviso.codigo || c === aviso.codigo;
}

function porSuscribir(pedidos, max) {
  const out = [];
  (pedidos || []).forEach((p) => {
    if (!p || !p.id || out.length >= (max || 60)) return;
    if (_txt(p.courier).toUpperCase().indexOf("SHALOM") < 0) return;
    if (_txt(p.status).toUpperCase() === "FINALIZADO") return;
    if (/ENTREGAD/i.test(_txt(p.trackingStatus))) return;
    const guia = _txt(p.trackingOrderNumber || p.shalomGuia);
    const codigo = _txt(p.trackingOrderCode || p.shalomCodigo).toUpperCase();
    if (!GUIA_PANEL.test(guia) || !CODIGO.test(codigo)) return;
    if (_txt(p.shalomAvisos) === guia) return;
    out.push({id: p.id, guia, codigo});
  });
  return out;
}

module.exports = {POR_CODIGO, buscarFirma, leer, esDelPedido, porSuscribir};
