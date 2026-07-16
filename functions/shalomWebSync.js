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
  if (!ship || !ship.trackingWebProximaConsulta) return true; // primera vez
  const t = Date.parse(ship.trackingWebProximaConsulta);
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

// Calcula la etiqueta que corresponderia segun lo que dice Shalom (o null si
// no hay cambio: el pedido ya esta en el estado correcto). Es la MISMA regla
// del Manual Shalom. Solo SUGIERE — no decide si aplicarla.
const calcularEtiqueta = (ship, autoEstado) => {
  if (autoEstado === "FINALIZADO") {
    return ship.status === "FINALIZADO" ? null : "FINALIZADO";
  }
  if (autoEstado === "EN_DESTINO") {
    const tienePago = ship.cost && parseFloat(ship.cost) > 0;
    if (tienePago) {
      return ship.status === "PENDIENTE DE PAGO" ? null : "PENDIENTE DE PAGO";
    }
    return ["LLEGÓ A DESTINO", "PENDIENTE DE PAGO", "FINALIZADO"]
        .indexOf(ship.status) >= 0 ? null : "LLEGÓ A DESTINO";
  }
  // autoEstado null (en transito / en origen): solo mueve si aun no salio.
  if (ESTADOS_PREVIOS.indexOf(ship.status) >= 0) return "ENVIADO";
  return null;
};

// Decide que escribir en Firestore para UN pedido, a partir de la respuesta
// del worker. No escribe nada — solo devuelve el objeto a mergear.
//
// Dos niveles independientes:
//  - TRACKING VISIBLE (trackingStatus/trackingHistory + campos trackingWeb*)
//    se escribe SIEMPRE — revive la tarjeta del panel como el Motor A. Su
//    visibilidad para el CLIENTE se filtra aparte en handleTrack.
//  - ETIQUETA INTERNA (status): SOLO si cfg.trackingWebCambiaEtiqueta === true.
//    Mientras este apagado, el pedido no se mueve de columna (modo observacion
//    de la etiqueta).
const decidirCambios = (ship, data, nowMs, cfg) => {
  const nowIso = new Date(nowMs).toISOString();
  const cambiaEtiqueta = !!(cfg && cfg.trackingWebCambiaEtiqueta);

  // Error del worker: solo campos de observacion, nada visible.
  if (!data || !data.ok) {
    return {
      trackingWebFuente: "web",
      trackingWebUltimaConsulta: nowIso,
      trackingWebError: (data && data.error) || "sin respuesta",
      erroresSeguidosWeb: (ship.erroresSeguidosWeb || 0) + 1,
      trackingWebActivo: true,
      trackingWebProximaConsulta: calcularProximaConsulta(null, nowMs, cfg),
    };
  }

  const rawStatus = (data.statuses && data.statuses.message) || null;
  const autoEstado = detectarEstadoAuto(rawStatus);
  const sugerida = calcularEtiqueta(ship, autoEstado);
  const coincide = sugerida ? (sugerida === ship.status) : true;

  // Campos de OBSERVACION — siempre, separados de lo visible.
  const write = {
    trackingWebFuente: "web",
    trackingWebRawStatus: rawStatus,
    trackingWebEstadoNormalizado: autoEstado,
    trackingWebEtiquetaSugerida: sugerida, // null = ya esta correcto
    trackingWebCoincide: coincide,
    trackingWebUltimaConsulta: nowIso,
    trackingWebError: null,
    erroresSeguidosWeb: 0,
  };

  // TRACKING VISIBLE (texto de Shalom): se escribe SIEMPRE que el texto cambie,
  // sin importar el modo. Esto revive la tarjeta del panel como con el Motor A.
  // Marcamos trackingMotorOrigen="web" para poder filtrar este dato en el link
  // del cliente (solo se le muestra si el operador activo esa opcion). NO toca
  // la etiqueta interna (status).
  const mismoTexto = ship.trackingStatus === (rawStatus || "—");
  if (rawStatus && !mismoTexto) {
    write.trackingStatus = rawStatus;
    write.trackingMessage = rawStatus;
    write.trackingLastUpdate = nowIso;
    write.trackingMotorOrigen = "web";
    const hist = Array.isArray(ship.trackingHistory) ?
      ship.trackingHistory.slice() : [];
    hist.push({
      date: nowIso, status: rawStatus, message: rawStatus, source: "auto-web",
    });
    write.trackingHistory = hist;
  }

  // ETIQUETA INTERNA (status): SOLO en modo activo. Mueve el pedido de columna
  // y decide FINALIZADO/PENDIENTE. Sigue controlada por "cambiar etiquetas".
  if (cambiaEtiqueta && sugerida) {
    write.status = sugerida;
  }

  // El polling se detiene cuando Shalom marca entregado (aunque en observacion
  // no se haya movido la etiqueta): un envio entregado ya no cambia.
  const detenerse = autoEstado === "FINALIZADO";
  write.trackingWebActivo = !detenerse;
  if (!detenerse) {
    write.trackingWebProximaConsulta =
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
