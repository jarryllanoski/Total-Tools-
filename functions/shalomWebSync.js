"use strict";

/*
 * shalomWebSync.js — Motor B (logica pura, sin Firestore).
 * ==========================================================
 * Decide QUE pedidos consultar, COMO interpretar el resultado del worker
 * propio (shalomweb-tracker/, navegador real) y CUANDO toca la proxima
 * consulta. No toca Firestore aqui (eso lo hace index.js, igual que con
 * comprobante.js) y no importa nada de tracking.js: es un motor aislado con
 * su propia copia minima de las mismas reglas del "Manual Shalom", para que
 * nunca dependa de — ni pueda romper — el motor A (API paga, shalomTracking).
 *
 * El motor B SOLO queda "vivo" (escribe los campos que ve el panel) cuando
 * panel/config.trackingMotor === "web". Por defecto esta apagado: desplegar
 * esta funcion no cambia nada hasta que se active el interruptor.
 */

// Mismas palabras clave que tracking.js (duplicadas a proposito: motor
// aislado, no se comparte codigo con el frontend).
const KEYWORDS_ENTREGADO = [
  "entregado", "entrega realizada", "entrega completa", "recogido",
  "recojo completado", "delivered",
];
const KEYWORDS_DESTINO = [
  "llegó a destino", "llego a destino", "en agencia destino",
  "disponible para recojo", "disponible para retiro",
  "en agencia de destino", "a disposicion", "en destino", "en la agencia",
];

const ESTADOS_TERMINALES = ["FINALIZADO", "ANULADO", "DEVUELTO"];
const ESTADOS_PREVIOS = [
  "NUEVO PEDIDO", "EN PROCESO", "POR ALISTAR", "ALISTADO",
];

const _norm = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Misma logica que detectarEstadoAuto de tracking.js (copia intencional).
const detectarEstadoAuto = (estadoTexto) => {
  if (!estadoTexto) return null;
  const t = _norm(estadoTexto);
  if (KEYWORDS_ENTREGADO.some((k) => t.indexOf(_norm(k)) >= 0)) {
    return "FINALIZADO";
  }
  if (KEYWORDS_DESTINO.some((k) => t.indexOf(_norm(k)) >= 0)) {
    return "EN_DESTINO";
  }
  return null;
};

// ¿Este pedido es candidato al motor B? (Shalom + guia/codigo + no terminal).
const esElegible = (ship) => {
  const courier = String((ship && ship.courier) || "").toUpperCase();
  if (courier.indexOf("SHALOM") < 0) return false;
  const guia = (ship && (ship.trackingOrderNumber || ship.shalomGuia)) || "";
  const codigo = (ship && (ship.trackingOrderCode || ship.shalomCodigo)) || "";
  if (!guia || !codigo) return false;
  if (ESTADOS_TERMINALES.indexOf(ship && ship.status) >= 0) return false;
  return true;
};

// ¿Ya toca consultarlo? (regla exacta: por timestamp, no por "alguien entro").
const estaVencido = (ship, nowMs) => {
  if (!ship || !ship.proximaConsultaWeb) return true; // primera vez
  const t = Date.parse(ship.proximaConsultaWeb);
  return !Number.isFinite(t) || t <= nowMs;
};

// Calcula la proxima consulta segun el estado detectado (horas configurables
// desde panel/config, con los mismos valores del Manual Shalom por defecto).
const calcularProximaConsulta = (autoEstado, nowMs, cfg) => {
  const hTransito = (cfg && Number(cfg.trackingWebIntervalTransitoH)) || 12;
  const hDestino = (cfg && Number(cfg.trackingWebIntervalDestinoH)) || 24;
  const horas = (autoEstado === "EN_DESTINO") ? hDestino : hTransito;
  return new Date(nowMs + horas * 60 * 60 * 1000).toISOString();
};

// Llama al worker propio (Cloud Run, navegador real) por un pedido puntual.
const consultarWorker = async (workerUrl, numero, codigo) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const base = String(workerUrl || "").replace(/\/+$/, "");
    const url = base + "/track?numero=" + encodeURIComponent(numero) +
      "&codigo=" + encodeURIComponent(codigo);
    const r = await fetch(url, {signal: ctrl.signal});
    return await r.json();
  } catch (e) {
    return {ok: false, error: String((e && e.message) || e)};
  } finally {
    clearTimeout(timer);
  }
};

// Decide que escribir en Firestore para UN pedido, a partir de la respuesta
// del worker. No escribe nada — solo devuelve el objeto a mergear.
const decidirCambios = (ship, data, nowMs, cfg) => {
  const nowIso = new Date(nowMs).toISOString();

  if (!data || !data.ok) {
    return {
      erroresSeguidosWeb: (ship.erroresSeguidosWeb || 0) + 1,
      trackingLastAutoCheckWeb: nowIso,
      // Reintenta en el ciclo corto (como si siguiera en transito).
      proximaConsultaWeb: calcularProximaConsulta(null, nowMs, cfg),
    };
  }

  const estadoTexto = (data.statuses && data.statuses.message) || null;
  const autoEstado = detectarEstadoAuto(estadoTexto);
  const write = {
    erroresSeguidosWeb: 0,
    trackingLastAutoCheckWeb: nowIso,
  };

  const mismoTexto = ship.trackingStatus === (estadoTexto || "—");
  if (!mismoTexto && estadoTexto) {
    write.trackingStatus = estadoTexto;
    write.trackingMessage = estadoTexto;
    write.trackingLastUpdate = nowIso;
    write.trackingMotorOrigen = "web";
    const hist = Array.isArray(ship.trackingHistory) ?
      ship.trackingHistory.slice() : [];
    hist.push({
      date: nowIso, status: estadoTexto, message: estadoTexto,
      source: "auto-web",
    });
    write.trackingHistory = hist;
  }

  let nuevoStatus = null;
  if (autoEstado === "FINALIZADO" && ship.status !== "FINALIZADO") {
    nuevoStatus = "FINALIZADO";
  } else if (autoEstado === "EN_DESTINO") {
    const tienePago = ship.cost && parseFloat(ship.cost) > 0;
    if (tienePago && ship.status !== "PENDIENTE DE PAGO") {
      nuevoStatus = "PENDIENTE DE PAGO";
    } else if (!tienePago &&
        ["LLEGÓ A DESTINO", "PENDIENTE DE PAGO", "FINALIZADO"]
            .indexOf(ship.status) < 0) {
      nuevoStatus = "LLEGÓ A DESTINO";
    }
  } else if (autoEstado === null &&
      ESTADOS_PREVIOS.indexOf(ship.status) >= 0) {
    nuevoStatus = "ENVIADO";
  }
  if (nuevoStatus) write.status = nuevoStatus;

  const estadoFinal = nuevoStatus || ship.status;
  const detenerse = estadoFinal === "FINALIZADO";
  write.trackingWebActivo = !detenerse;
  if (!detenerse) {
    write.proximaConsultaWeb =
      calcularProximaConsulta(autoEstado, nowMs, cfg);
  }

  return write;
};

module.exports = {
  detectarEstadoAuto,
  esElegible,
  estaVencido,
  calcularProximaConsulta,
  consultarWorker,
  decidirCambios,
};
