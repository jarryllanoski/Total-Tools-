"use strict";

const ID_PEDIDO = /^[A-Za-z0-9_-]{1,80}$/;
const registroShalom = require("./registroShalom");

async function jalar(datos, deps) {
  const d = datos || {};
  const pid = String(d.pedidoId || "").trim();
  if (!ID_PEDIDO.test(pid)) {
    return {ok: false, motivo: "SIN_DATO", detalle: "pedido no válido"};
  }
  const pedido = await deps.leerPedido(pid);
  if (!pedido) {
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: "el pedido no existe"};
  }
  if (!/SHALOM/i.test(String(pedido.courier || ""))) {
    return {ok: false, motivo: "SIN_DATO",
      detalle: "el ticket de Shalom es solo para pedidos de Shalom"};
  }
  const guiaPedido = String(pedido.trackingOrderNumber || pedido.shalomGuia ||
      "").trim();
  if (String(d.orderNumber || "").trim() === guiaPedido) {
    const sit = registroShalom.situacion(pedido,
        deps.ahora ? deps.ahora() : Date.now());
    if (sit.tipo === "porDejar" || sit.tipo === "vencida") {
      return {ok: false, motivo: sit.tipo === "porDejar" ? "POR_DEJAR" :
        "VENCIDA"};
    }
  }
  const instanceId = String((deps.instancia && await deps.instancia()) || "")
      .trim();
  if (!instanceId) {
    return {ok: false, motivo: "SIN_INSTANCIA",
      detalle: "Conecta tu cuenta de Shalom Pro en Config"};
  }
  const r = await deps.descargar({
    orderNumber: String(d.orderNumber || "").trim(),
    orderCode: String(d.orderCode || "").trim(),
    instanceId: instanceId,
  });
  if (r && !r.ok && r.motivo === "NO_ENCONTRADO" && deps.esPendiente &&
      await deps.esPendiente(String(d.orderNumber || "").trim()) === true) {
    return {ok: false, motivo: "POR_DEJAR"};
  }
  if (!r || !r.ok) {
    return {ok: false, motivo: (r && r.motivo) || "ERROR_SHALOM",
      detalle: (r && r.detalle) || ""};
  }
  const ext = {"application/pdf": "pdf", "image/jpeg": "jpg",
    "image/webp": "webp", "image/gif": "gif"}[r.tipo] || "png";
  const ruta = "shipments/" + pid + "/guia." + ext;
  const url = await deps.subir(ruta, r.bytes, r.tipo);
  const doc = {d: url, n: "ticket-shalom." + ext, t: r.tipo,
    storage: true, path: ruta, origen: "shalom"};
  await deps.guardar({docGuia: doc});
  return {ok: true, doc: doc};
}

module.exports = {ID_PEDIDO, jalar};
