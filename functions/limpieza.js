"use strict";

const DIAS = 30;
const TANDA = 400;
const MAX_TANDAS = 10;
const DIAS_PAPELERA = 30;
const CONFIG_DOC = "panel/config";
const PAPELERA_COL = "panel/trash/items";

function vencida(item, corteMs) {
  return !!(item && typeof item.deletedAt === "number" &&
    item.deletedAt < corteMs);
}

async function limpiarPapelera(db, ahoraMs) {
  const corte = ahoraMs - DIAS_PAPELERA * 86400000;
  const ref = db.doc(CONFIG_DOC);
  const enConfig = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lista = snap.exists && Array.isArray(snap.data().trash) ?
      snap.data().trash : [];
    const quedan = lista.filter((x) => !vencida(x, corte));
    if (quedan.length === lista.length) return 0;
    tx.update(ref, {trash: quedan});
    return lista.length - quedan.length;
  });
  let sueltos = 0;
  for (let t = 0; t < MAX_TANDAS; t++) {
    const snap = await db.collection(PAPELERA_COL)
        .where("deletedAt", "<", corte).limit(TANDA).get();
    if (snap.empty) break;
    const lote = db.batch();
    snap.docs.forEach((d) => lote.delete(d.ref));
    await lote.commit();
    sueltos += snap.docs.length;
    if (snap.docs.length < TANDA) break;
  }
  return {enConfig, sueltos};
}

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

module.exports = {limpiarLapidas, limpiarPapelera, vencida, DIAS,
  DIAS_PAPELERA, TANDA, MAX_TANDAS};
