"use strict";

const VENTANA_DIAS = 365;

const esDelivery = (p) => {
  const c = String((p && p.courier) || "").toUpperCase();
  return c.indexOf("DELIVERY") >= 0 || c.indexOf("MOTORIZADO") >= 0;
};

const elegirCliente = (pedidos, nowMs) => {
  const desde = new Date(nowMs - VENTANA_DIAS * 86400000).toISOString();
  const recientes = (pedidos || [])
      .filter((p) => p && String(p.createdAt || "") >= desde)
      .sort((a, b) => String(b.createdAt || "")
          .localeCompare(String(a.createdAt || "")));
  if (!recientes.length) return null;

  const conNombre = recientes.find((p) => String(p.name || "").trim());
  if (!conNombre) return null;

  const ultDelivery = recientes.find(
      (p) => esDelivery(p) && String(p.address || "").trim());

  return {
    name: String(conNombre.name).trim(),
    address: ultDelivery ? String(ultDelivery.address).trim() : "",
  };
};

module.exports = {elegirCliente, esDelivery, VENTANA_DIAS};
