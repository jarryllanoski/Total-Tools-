"use strict";

/**
 * functions/interruptor.js — la puerta de Shalom se apaga sola y se reenciende
 * ============================================================================
 * Lo que pidió el negocio, literal: "si Shalom API deja de funcionar, que solo
 * apague la puerta y siga con otras formas; y cuando regrese la API, que la
 * prenda y siga funcionando bien".
 *
 * TRES ESTADOS
 *   ABIERTA   normal: pasa todo.
 *   CERRADA   tras varios fallos seguidos. Se responde al instante, SIN llamar
 *             a Shalom. Una caída suya deja de costar cientos de consultas que
 *             van a fallar igual, y el panel deja de quedarse colgado.
 *   A PRUEBA  pasado el descanso, se deja pasar UNA sola consulta. Si entra,
 *             la puerta se abre; si falla, otro descanso. Reabrir de golpe
 *             mandaría las 484 guías contra un servicio que sigue caído.
 *
 * ⚠️ LO QUE APAGA LA PUERTA Y LO QUE NO — es la decisión central de este
 * archivo. Solo apagan los fallos DEL SERVICIO (no hay red, error suyo, clave
 * bloqueada, cuota agotada). Nunca los del DATO: una guía que no existe es
 * información correcta sobre esa guía, y cinco guías malas seguidas no pueden
 * dejar al negocio sin seguimiento. Confundir los dos lados es el error que ya
 * costó dias en este proyecto, dos veces.
 *
 * Este archivo es logica PURA: no habla con Firestore ni con la red. Recibe el
 * estado y la hora, y dice que hacer. Asi se puede probar cada transicion sin
 * esperar diez minutos reales.
 */

/** Fallos seguidos del servicio antes de cerrar. */
const TOPE_FALLOS = 5;

/** Cuanto descansa la puerta cerrada, en ms. */
const DESCANSO_MS = 10 * 60 * 1000;

/**
 * Motivos que SI son culpa del servicio. Todo lo demas es informacion sobre
 * un dato concreto y no dice nada sobre si Shalom esta en pie.
 */
const MOTIVOS_DE_SERVICIO = ["SIN_RED", "ERROR_SHALOM", "BLOQUEADO", "LIMITE"];

/**
 * Un estado seguro a partir de lo que haya guardado (o nada).
 * @param {*} doc lo leido de Firestore
 * @return {Object} estado normalizado
 */
function normalizar(doc) {
  const d = (doc && typeof doc === "object" && !Array.isArray(doc)) ? doc : {};
  const num = (x) => (typeof x === "number" && isFinite(x) && x > 0 ? x : 0);
  return {
    // Por defecto ENCENDIDA: un documento que no existe todavia no puede
    // dejar el seguimiento apagado sin que nadie lo haya decidido.
    encendida: d.encendida !== false,
    fallos: num(d.fallos),
    cerradaHasta: num(d.cerradaHasta),
    ultimoMotivo: typeof d.ultimoMotivo === "string" ? d.ultimoMotivo : "",
  };
}

/**
 * ¿Pasa esta consulta?
 * @param {Object} estado estado normalizado
 * @param {number} ahora Date.now()
 * @param {boolean} [esDiagnostico] true para `validate`: ver abajo
 * @return {Object} {pasa, probando} o {pasa:false, motivo, reabre}
 */
function decidir(estado, ahora, esDiagnostico) {
  const e = normalizar(estado);
  // El interruptor manual manda sobre todo lo demas: si el operador la apago,
  // no se consulta ni para probar. Ni el diagnostico se salta esto — apagada
  // es apagada, y una excepcion aqui haria que el interruptor mintiera.
  if (!e.encendida) return {pasa: false, motivo: "APAGADA"};
  /* `validate` se salta el descanso a proposito: es UNA consulta, no toca
     ningun envio, y es la unica forma de preguntar "¿ya volvio?" sin esperar
     los diez minutos a ciegas. La documentacion de Shalom lo dice igual: ante
     un 429, backoff y consultar GET /validate. Y como cualquier respuesta
     buena reabre la puerta, preguntar es tambien lo que la reenciende. */
  if (e.cerradaHasta > ahora && !esDiagnostico) {
    return {pasa: false, motivo: "PUERTA_CERRADA", reabre: e.cerradaHasta};
  }
  // Habia descanso y ya paso: esta es la consulta de prueba.
  return {pasa: true, probando: e.cerradaHasta > 0};
}

/**
 * Que guardar despues de una consulta. Devuelve null si nada cambia — asi no
 * se escribe en Firestore por cada consulta que sale bien estando ya abierta.
 * @param {Object} estado estado normalizado
 * @param {Object} r resultado {ok, motivo}
 * @param {number} ahora Date.now()
 * @param {boolean} probando si esta consulta era la de prueba
 * @return {?Object} campos a escribir, o null
 */
function tras(estado, r, ahora, probando) {
  const e = normalizar(estado);

  if (r && r.ok) {
    // Entro. Si no habia nada que limpiar, no se escribe nada.
    if (!e.fallos && !e.cerradaHasta) return null;
    return {fallos: 0, cerradaHasta: 0, ultimoMotivo: "", ultimoCambio: ahora};
  }

  const motivo = (r && r.motivo) || "ERROR_SHALOM";
  // Un fallo del DATO no dice nada sobre si Shalom esta en pie.
  if (MOTIVOS_DE_SERVICIO.indexOf(motivo) < 0) return null;

  // La consulta de prueba fallo: se vuelve a cerrar sin contar hasta cinco.
  // Ya sabemos que sigue caido; gastar cuatro consultas mas es regalarlas.
  if (probando) {
    return {fallos: 0, cerradaHasta: ahora + DESCANSO_MS,
      ultimoMotivo: motivo, ultimoCambio: ahora};
  }

  const fallos = e.fallos + 1;
  if (fallos >= TOPE_FALLOS) {
    return {fallos: 0, cerradaHasta: ahora + DESCANSO_MS,
      ultimoMotivo: motivo, ultimoCambio: ahora};
  }
  return {fallos: fallos, ultimoMotivo: motivo, ultimoCambio: ahora};
}

module.exports = {
  TOPE_FALLOS,
  DESCANSO_MS,
  MOTIVOS_DE_SERVICIO,
  normalizar,
  decidir,
  tras,
};
