"use strict";

/**
 * functions/sincro.js — TRAER SOLO LO QUE CAMBIÓ (Fase 2, 29/10/2026).
 * ====================================================================
 * Antes, cada cambio en la nube (un pedido del formulario, otra PC, el
 * seguimiento automático) hacía que cada PC abierta bajara los ~1500
 * pedidos completos. Ahora:
 *
 *   · Cada escritura de un pedido o proveedor graba `_mts` = la hora del
 *     SERVIDOR de Google (no la de la PC: un reloj atrasado escondería
 *     cambios). Lo ponen el panel (commit con REQUEST_TIME) y las Cloud
 *     Functions (serverTimestamp).
 *   · Borrar deja una LÁPIDA en `panel/borrados/items/<col>__<id>` en la
 *     MISMA operación que el borrado (commit atómico).
 *   · El panel pide solo `_mts > marca − 60 s` y aplica lápidas. El margen
 *     cubre una escritura cuya hora es anterior pero que se hizo visible un
 *     instante después de la consulta: lo repetido se descarta por id.
 *
 * ⚠️ NO ESCONDER PEDIDOS es la regla número uno, así que ante la MENOR duda
 * se hace la carga completa de siempre:
 *   · no hay copia local, o no tiene marca, o la marca es rara;
 *   · el servidor todavía no está desplegado con `_mts` (`syncV` ausente);
 *   · la última carga completa tiene más de 12 horas;
 *   · la nube dice que hubo un cambio y la consulta no trae NADA: alguien
 *     escribió sin `_mts` (una pestaña con el panel viejo en caché);
 *   · la consulta falla, o trae demasiado;
 *   · el dueño apagó la sincronización rápida en esta PC.
 *
 * Lógica PURA: ni red ni DOM. La usa index.html (`_fbLoad`).
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Sincro = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const V = 1; // versión del formato de la marca
  const MARGEN_MS = 60 * 1000; // ventana de solape hacia atrás
  const COMPLETA_CADA_MS = 12 * 3600 * 1000;
  const MAX_DELTA = 1500; // más que esto: carga completa
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  /**
   * ¿Carga completa o solo lo cambiado?
   * @param {Object} e {activo, cfg, sync, tieneLocal, ahora, forzarCompleta}
   * @return {Object} {modo: "completa"|"cambios", motivo}
   */
  function decidir(e) {
    const o = e || {};
    const s = o.sync;
    if (o.forzarCompleta) return {modo: "completa", motivo: "pedida"};
    if (!o.activo) return {modo: "completa", motivo: "apagada en esta PC"};
    // `!(… >= V)` y no `< V`: con syncV ausente, Number() da NaN, y
    // `NaN < 1` es false — el panel habría creído listo al servidor.
    if (!o.cfg || !(Number(o.cfg.syncV) >= V)) {
      return {modo: "completa", motivo: "servidor sin _mts aún"};
    }
    if (!o.tieneLocal) return {modo: "completa", motivo: "sin copia local"};
    if (!s || s.v !== V || !ISO.test(String(s.ts || ""))) {
      return {modo: "completa", motivo: "sin marca válida"};
    }
    const ahora = Number(o.ahora) || Date.now();
    if (!(Number(s.full) > 0) || ahora - Number(s.full) > COMPLETA_CADA_MS) {
      return {modo: "completa", motivo: "más de 12 h sin carga completa"};
    }
    return {modo: "cambios", motivo: ""};
  }

  /**
   * Desde dónde pedir: la marca menos el margen.
   * @param {Object} sync {ts}
   * @return {string} ISO
   */
  function desde(sync) {
    const t = Date.parse(sync.ts);
    return new Date(t - MARGEN_MS).toISOString();
  }

  /**
   * El mayor `_mts` (ISO) de una lista.
   * @param {Array} lista documentos
   * @return {string} ISO, o ""
   */
  function _maxMts(lista) {
    let m = "";
    (lista || []).forEach((d) => {
      const v = d && d._mts;
      if (typeof v === "string" && ISO.test(v) && v > m) m = v;
    });
    return m;
  }

  /**
   * La marca tras una carga. Solo avanza con horas que DIJO EL SERVIDOR:
   * nunca con el reloj de la PC, y nunca hacia atrás.
   * @param {?Object} previa la marca anterior
   * @param {Array} vistos documentos y lápidas recibidos
   * @param {boolean} completa si fue una carga completa
   * @param {number} ahora Date.now()
   * @return {Object} nueva marca
   */
  function marcaTras(previa, vistos, completa, ahora) {
    const p = (previa && previa.v === V && ISO.test(String(previa.ts || ""))) ?
      previa : null;
    let ts = _maxMts(vistos);
    if (p && p.ts > ts) ts = p.ts;
    // Primera carga completa sin ningún `_mts` en la nube todavía: se marca
    // el origen de los tiempos para que el siguiente cambio SÍ se pida.
    if (!ts) ts = "1970-01-01T00:00:00.000Z";
    return {v: V, ts: ts,
      full: completa ? (Number(ahora) || Date.now()) : (p ? p.full : 0)};
  }

  /**
   * Aplica lo cambiado sobre la lista local. Por id, quien tenga el `_mts`
   * más nuevo gana entre documento y lápida (un pedido borrado y luego
   * restaurado de la papelera vuelve a existir).
   * Lo que tiene cambios locales sin subir NO se toca aquí: de eso ya se
   * encarga `_mergeRemote`, igual que con la carga completa.
   * @param {Array} local la lista actual
   * @param {Array} cambiados documentos recibidos (con id y _mts)
   * @param {Array} lapidas {id, _mts} de esta colección
   * @return {Array} lista nueva
   */
  function aplicar(local, cambiados, lapidas) {
    const porId = {};
    (local || []).forEach((d) => {
      if (d && d.id) porId[d.id] = d;
    });
    const borrar = {};
    (lapidas || []).forEach((l) => {
      if (l && l.id) borrar[l.id] = String(l._mts || "");
    });
    (cambiados || []).forEach((d) => {
      if (!d || !d.id) return;
      const tb = borrar[d.id];
      if (tb && tb > String(d._mts || "")) return; // la lápida es posterior
      porId[d.id] = d;
      delete borrar[d.id];
    });
    Object.keys(borrar).forEach((id) => {
      delete porId[id];
    });
    return Object.keys(porId).map((k) => porId[k]);
  }

  /**
   * Cuántos de lo recibido son NOVEDAD de verdad: documentos que no se
   * tenían, o con otra hora de cambio. Por el margen de 60 s la consulta
   * repite casi siempre algo ya conocido; contar eso como «trajo algo»
   * escondería una escritura sin `_mts` hecha en esa misma ventana.
   * @param {Array} local lista actual
   * @param {Array} recibidos documentos de la consulta
   * @return {number} novedades
   */
  function novedades(local, recibidos) {
    const ya = {};
    (local || []).forEach((d) => {
      if (d && d.id) ya[d.id] = String(d._mts || "");
    });
    let n = 0;
    (recibidos || []).forEach((d) => {
      if (!d || !d.id) return;
      if (!(d.id in ya) || ya[d.id] !== String(d._mts || "")) n++;
    });
    return n;
  }

  /**
   * Novedad total de una consulta: documentos nuevos o con otra hora, y
   * lápidas que de verdad quitarían algo de aquí (una lápida más vieja que
   * el pedido que hay —borrado y restaurado— no es novedad).
   * @param {Object} local {shipments, suppliers}
   * @param {Object} r {ships, supps, lapidas}
   * @return {number} novedades
   */
  function novedadTotal(local, r) {
    const l = local || {};
    const rr = r || {};
    const mts = {};
    ["shipments", "suppliers"].forEach((col) => {
      (l[col] || []).forEach((d) => {
        if (d && d.id) mts[col + "|" + d.id] = String(d._mts || "");
      });
    });
    const lap = (rr.lapidas || []).filter((x) => {
      if (!x || !x.id) return false;
      const k = (x.col || "shipments") + "|" + x.id;
      return (k in mts) && mts[k] < String(x._mts || "");
    }).length;
    return novedades(l.shipments, rr.ships) + novedades(l.suppliers, rr.supps) +
      lap;
  }

  /**
   * Cuánto trajo la consulta (con lo repetido por el margen).
   * @param {Object} r {ships, supps, lapidas}
   * @return {number} total recibido
   */
  function total(r) {
    return ((r && r.ships) || []).length + ((r && r.supps) || []).length +
      ((r && r.lapidas) || []).length;
  }

  /**
   * Id del documento de lápida: colección + id, sin barras.
   * @param {string} col "shipments" | "suppliers"
   * @param {string} id id del documento
   * @return {string} "shipments__id_123"
   */
  function idLapida(col, id) {
    return String(col) + "__" + String(id).replace(/\//g, "_");
  }

  return {V, MARGEN_MS, COMPLETA_CADA_MS, MAX_DELTA, decidir, desde,
    marcaTras, aplicar, total, novedades, novedadTotal, idLapida};
});
