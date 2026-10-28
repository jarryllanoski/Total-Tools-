"use strict";

/**
 * functions/ticketShalom.js — «🧾 Jalar ticket de Shalom».
 * =========================================================
 * El SERVIDOR hace todo: pide el ticket a Shalom (con la clave que nunca
 * sale del servidor), lo guarda en Firebase Storage, en la carpeta del
 * pedido, y lo apunta en el pedido como «Guía / Ticket» (`docGuia`). El
 * navegador solo recibe el enlace del archivo ya guardado: nunca manipula
 * el archivo, así que no hay base64 que se pierda ni memoria que se llene.
 *
 * Orquestación pura: la red, el bucket y Firestore llegan como `deps`, así
 * que se prueba sin ninguno de los tres.
 */

const ID_PEDIDO = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * @param {Object} datos {pedidoId, orderNumber, orderCode} (del navegador)
 * @param {Object} deps {leerPedido(id), instancia() → id de Shalom Pro,
 *   descargar({orderNumber,orderCode,instanceId}),
 *   subir(ruta, bytes, tipo) → url, guardar(campos)}
 * @return {Promise<Object>} {ok:true, doc} o {ok:false, motivo, detalle}
 */
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
  /* La cuenta de Shalom Pro: de la configuración del SERVIDOR (la guardó
     «Conectar»). Lo que el navegador mandara con ese nombre se ignora. */
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
