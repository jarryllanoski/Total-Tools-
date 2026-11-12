"use strict";

const DIAS = 30;
const TANDA = 400;
const MAX_TANDAS = 10;

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
