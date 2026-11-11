"use strict";

/**
 * functions/limpieza.js — BORRAR LAS LÁPIDAS VIEJAS (Fase 8, 11/11/2026)
 * =====================================================================
 * Cada pedido o proveedor borrado deja una LÁPIDA en
 * `panel/borrados/items/<col>__<id>`, para que los demás equipos se enteren
 * del borrado al pedir «solo lo que cambió» (functions/sincro.js). Nadie las
 * borraba: se acumulaban para siempre.
 *
 * ¿CUÁNDO DEJA DE HACER FALTA UNA? Un equipo cuya última carga completa
 * tiene más de 12 horas (`COMPLETA_CADA_MS`) no pide cambios: baja TODO de
 * nuevo, y ahí los borrados ya no están. Así que ninguna lápida de más de
 * 12 h le sirve a nadie. Se borran las de más de DIAS (30): una margen
 * enorme a propósito, por si algún día esa regla cambia.
 *
 * Lógica aislada de Firestore: recibe una `db` con la forma mínima que usa,
 * para poder probarla con una de mentira.
 */

const DIAS = 30;
/** Por tanda: Firestore admite 500 escrituras por lote. */
const TANDA = 400;
/** Tandas por corrida: una corrida diaria no tiene por qué ser larga. */
const MAX_TANDAS = 10;

/**
 * Borra las lápidas con `_mts` anterior a hace DIAS días.
 * @param {Object} db Firestore (o una con collection/where/limit/get/batch)
 * @param {number} ahoraMs ahora, en ms
 * @param {Function} aFecha convierte ms en el tipo de fecha de Firestore
 * @return {Promise<Object>} {borradas, tandas, quedan}
 */
async function limpiarLapidas(db, ahoraMs, aFecha) {
  const corte = aFecha(ahoraMs - DIAS * 86400000);
  let borradas = 0;
  let tandas = 0;
  let quedan = false;
  for (; tandas < MAX_TANDAS; tandas++) {
    const snap = await db.collection("panel/borrados/items")
        .where("_mts", "<", corte).limit(TANDA).get();
    if (snap.empty) break;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
    borradas += snap.docs.length;
    if (snap.docs.length < TANDA) {
      tandas++;
      break;
    }
    quedan = tandas + 1 >= MAX_TANDAS;
  }
  return {borradas, tandas, quedan};
}

module.exports = {limpiarLapidas, DIAS, TANDA, MAX_TANDAS};
