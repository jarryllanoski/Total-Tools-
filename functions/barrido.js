"use strict";

/**
 * functions/barrido.js — a quién se consulta, y cuándo
 * =====================================================
 * La parte del barrido programado que se puede probar sin red, sin Firestore
 * y sin esperar a las 11:30: decidir si toca correr, y armar la lista.
 *
 * POR QUÉ EL RELOJ SE MIRA AQUÍ Y NO EN EL CRON
 * Cloud Scheduler dispara cada 30 minutos y esta función decide si le toca.
 * Suena a desperdicio y no lo es: los disparos que no tocan NO consultan nada
 * a Shalom, y a cambio los horarios pasan a ser un texto en Config que se
 * cambia sin volver a desplegar. Cuatro entradas de cron fijas atarían cada
 * cambio de horario a un despliegue.
 *
 * Solo funcionan las horas EN PUNTO y Y MEDIA — es a lo que dispara el cron.
 * Una hora suelta (08:15) se ajusta a la ranura más cercana en vez de no
 * ejecutarse nunca en silencio.
 */

/** Las cuatro de fábrica. */
const HORAS_POR_DEFECTO = ["08:00", "11:30", "16:30", "19:00"];

/** Zona del negocio. Fija: "8am" es 8am en Perú, sin cuentas con UTC. */
const ZONA = "America/Lima";

/** Minutos que tienen que pasar para volver a consultar la misma guía.
    No es un intervalo: es la defensa contra que el Scheduler dispare dos
    veces la misma ranura (reintentos) y se consulte todo por duplicado. */
const GRACIA_MIN = 50;

/** Una guía de Shalom son 8 dígitos. Medido: 484 de 487. */
const GUIA_OK = /^[0-9]{8}$/;

// La formula de las etiquetas. La MISMA que usa el panel.
const etiquetas = require("./etiquetas");

/**
 * Ajusta una hora a la ranura de 30 minutos más cercana.
 * @param {string} hhmm por ejemplo "8:15"
 * @return {?string} "08:30", o null si no se entiende
 */
function aSlot(hhmm) {
  const m = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})?\s*$/.exec(String(hhmm || ""));
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] === undefined ? 0 : parseInt(m[2], 10);
  if (!(h >= 0 && h <= 23) || !(min >= 0 && min <= 59)) return null;
  let slot = 0;
  if (min >= 45) {
    h = (h + 1) % 24;
  } else if (min >= 15) {
    slot = 30;
  }
  return String(h).padStart(2, "0") + ":" + String(slot).padStart(2, "0");
}

/**
 * Lee el texto de horas de Config. Devuelve las de fábrica si no hay nada
 * usable: quedarse sin ninguna hora apagaría el barrido en silencio.
 * @param {*} texto "08:00, 11:30, 16:30, 19:00"
 * @return {Array<string>} horas normalizadas, ordenadas y sin repetir
 */
function parseHoras(texto) {
  const crudas = String(texto === null || texto === undefined ? "" : texto)
      .split(/[,;\s]+/).filter(Boolean);
  const vistas = {};
  crudas.forEach((c) => {
    const s = aSlot(c);
    if (s) vistas[s] = true;
  });
  const lista = Object.keys(vistas).sort();
  return lista.length ? lista : HORAS_POR_DEFECTO.slice();
}

/**
 * La hora local del negocio, como "HH:MM".
 * @param {Date} fecha momento
 * @param {string} [zona] zona horaria
 * @return {string} "08:00"
 */
function horaLocal(fecha, zona) {
  const f = new Intl.DateTimeFormat("es-PE", {
    timeZone: zona || ZONA, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  // Algunos entornos devuelven "24:00" a medianoche; se normaliza.
  return f.format(fecha).replace(/^24:/, "00:");
}

/**
 * ¿Le toca correr a esta hora?
 * @param {Array<string>} horas horas configuradas (ya normalizadas)
 * @param {string} hhmm hora local actual
 * @return {boolean} true si toca
 */
function tocaAhora(horas, hhmm) {
  const s = aSlot(hhmm);
  return !!s && (horas || []).indexOf(s) >= 0;
}

/**
 * A quién se consulta, y por qué se saltó al resto.
 *
 * Las cuatro razones para NO consultar, en orden de cuánto ahorran:
 *   · Shalom ya dijo ENTREGADO — es la última rama del árbol, no hay nada
 *     después. Preguntar otra vez no puede traer nada nuevo.
 *   · la etiqueta es FINALIZADO — el pedido está cerrado.
 *   · la guía está mal escrita — se sabe de antemano que va a fallar, así que
 *     se lista para corregirla en vez de gastar 4 consultas diarias en ella.
 *   · se consultó hace un momento — defensa contra un disparo repetido.
 * @param {Array<Object>} pedidos todos los pedidos
 * @param {number} ahora Date.now()
 * @return {Object} {consultar, guiasMalas, saltados}
 */
function aConsultar(pedidos, ahora) {
  const consultar = [];
  const guiasMalas = [];
  const saltados = {noShalom: 0, sinGuia: 0, finalizados: 0,
    yaEntregados: 0, recien: 0};
  const t = Number(ahora) || Date.now();

  (pedidos || []).forEach((p) => {
    if (!p || !p.id) return;
    const courier = String(p.courier || "").toUpperCase();
    if (courier.indexOf("SHALOM") < 0) {
      saltados.noShalom++; return;
    }
    const guia = String(p.trackingOrderNumber || p.shalomGuia || "").trim();
    if (!guia) {
      saltados.sinGuia++; return;
    }
    if (String(p.status || "").trim().toUpperCase() === "FINALIZADO") {
      saltados.finalizados++; return;
    }
    if (/ENTREGAD/i.test(String(p.trackingStatus || ""))) {
      saltados.yaEntregados++; return;
    }
    if (!GUIA_OK.test(guia)) {
      guiasMalas.push({id: p.id, nombre: p.name || "", guia: guia});
      return;
    }
    const ultima = Number(p.trackingLastAutoCheck) || 0;
    if (ultima && (t - ultima) < GRACIA_MIN * 60000) {
      saltados.recien++; return;
    }
    consultar.push({
      id: p.id,
      nombre: p.name || "",
      guia: guia,
      codigo: String(p.trackingOrderCode || p.shalomCodigo || "").trim(),
    });
  });

  return {consultar, guiasMalas, saltados};
}

/**
 * Suma los campos de seguimiento que toca escribir para un pedido.
 * No escribe: devuelve lo que HABRIA que escribir, para que el simulacro
 * pueda decidir exactamente igual sin tocar nada. Y por eso vive aqui y no en
 * index.js: una decision que ninguna prueba puede alcanzar es una decision sin
 * red.
 *
 * Si nada cambio, devuelve null y NO se escribe nada — ni siquiera la hora de
 * la consulta. Estampar "te mire y no habia novedad" en 71 pedidos, cuatro
 * veces al dia, es pagar 284 escrituras diarias por no-noticias.
 * @param {Object} pedido datos actuales del pedido
 * @param {Object} res respuesta ya traducida de /track
 * @param {string} modo apagado | semi | auto
 * @return {?Object} {campos, etiqueta} o null si no hay nada que cambiar
 */
function cambiosDe(pedido, res, modo) {
  if (!pedido || !res || !res.ok || !res.estado) return null;
  const campos = {trackingLastAutoCheck: Date.now()};
  let algo = false;

  /* El texto del seguimiento tampoco desanda el camino. Es la misma guarda
     que el panel: una respuesta peor no pisa a una buena. */
  const nuevoRango = (typeof res.pasos === "number") ? res.pasos :
    etiquetas.rangoDeTexto(res.estado);
  const viejoRango = etiquetas.rangoDeTexto(pedido.trackingStatus);
  const retrocede = (nuevoRango !== null && viejoRango !== null &&
    nuevoRango < viejoRango);

  if (!retrocede && pedido.trackingStatus !== res.estado) {
    const iso = res.fecha || new Date().toISOString();
    const historial = Array.isArray(pedido.trackingHistory) ?
      pedido.trackingHistory.slice() : [];
    // Mismo formato que escribe el panel (_escribirTracking en tracking.js):
    // un tercer formato de historial haria ilegible la mitad de las entradas.
    historial.push({date: iso, status: res.estado, message: res.estado,
      source: "shalom"});
    campos.trackingStatus = res.estado;
    campos.trackingMessage = res.estado;
    campos.trackingLastUpdate = iso;
    campos.trackingHistory = historial;
    algo = true;
  }

  const etq = etiquetas.decidirEtiqueta(pedido, res, modo);
  if (etq) {
    campos.status = etq.nueva;
    algo = true;
  }
  return algo ? {campos: campos, etiqueta: etq ? etq.nueva : null} : null;
}

module.exports = {
  HORAS_POR_DEFECTO,
  ZONA,
  GRACIA_MIN,
  GUIA_OK,
  aSlot,
  parseHoras,
  horaLocal,
  tocaAhora,
  aConsultar,
  cambiosDe,
};
