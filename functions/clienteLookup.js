"use strict";

/**
 * clienteLookup.js — Elegir los datos del cliente que vuelve.
 *
 * Logica PURA (sin Firestore) para poder probarla aislada. La usa
 * handleClient de index.js.
 *
 * Dos reglas que evitan errores caros:
 *  1. Ventana de 12 meses: un cliente de hace anos no se expone ni se
 *     autocompleta con datos viejos.
 *  2. La direccion sale SOLO de pedidos DELIVERY. En agencia/encomienda el
 *     campo `address` guarda la direccion de la AGENCIA (ej. "SHALOM CERCADO
 *     LIMA..."); ofrecerla como "tu direccion de siempre" mandaria el proximo
 *     pedido a la agencia en vez de al domicilio del cliente.
 */

const VENTANA_DIAS = 365;

/**
 * @param {Object} p pedido
 * @return {boolean} true si el pedido es a domicilio
 */
const esDelivery = (p) => {
  const c = String((p && p.courier) || "").toUpperCase();
  return c.indexOf("DELIVERY") >= 0 || c.indexOf("MOTORIZADO") >= 0;
};

/**
 * Devuelve el MINIMO necesario para reconocer al cliente, o null.
 * @param {Array} pedidos pedidos con ese telefono
 * @param {number} nowMs ahora en ms
 * @return {?{name: string, address: string}} datos o null
 */
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
