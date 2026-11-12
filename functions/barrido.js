"use strict";

const HORAS_POR_DEFECTO = ["08:00", "11:30", "16:30", "19:00"];

const ZONA = "America/Lima";

const GRACIA_MIN = 50;

const GUIA_OK = /^(?:[0-9]{8}|1[0-9]{8})$/;

const etiquetas = require("./etiquetas");
const shalomEstado = require("./shalomEstado");
const registroShalom = require("./registroShalom");
const VENCIDA_H = registroShalom.VENCIDA_MS / 3600000;

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

function horaLocal(fecha, zona) {
  const f = new Intl.DateTimeFormat("es-PE", {
    timeZone: zona || ZONA, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return f.format(fecha).replace(/^24:/, "00:");
}

function tocaAhora(horas, hhmm) {
  const s = aSlot(hhmm);
  return !!s && (horas || []).indexOf(s) >= 0;
}

function aConsultar(pedidos, ahora) {
  const consultar = [];
  const guiasMalas = [];
  const saltados = {noShalom: 0, sinGuia: 0, finalizados: 0,
    yaEntregados: 0, recien: 0, vencidas: 0};
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
    if (shalomEstado.rango(p.trackingStatus) === 3) {
      saltados.yaEntregados++; return;
    }
    const sit = registroShalom.situacion(p, t);
    if (sit.tipo === "vencida") {
      saltados.vencidas++; return;
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
      porDejar: sit.tipo === "porDejar",
      conMovimiento: !!String(p.trackingStatus || "").trim(),
    });
  });

  return {consultar, guiasMalas, saltados};
}

function cambiosDe(pedido, res, modo) {
  if (!pedido || !res || !res.ok || !res.estado) return null;
  const campos = {trackingLastAutoCheck: Date.now()};
  let algo = false;

  const nuevoRango = (typeof res.pasos === "number") ? res.pasos :
    etiquetas.rangoDeTexto(res.estado);
  const viejoRango = etiquetas.rangoDeTexto(pedido.trackingStatus);
  const retrocede = (nuevoRango !== null && viejoRango !== null &&
    nuevoRango < viejoRango);

  if (!retrocede && pedido.trackingStatus !== res.estado) {
    const iso = res.fecha || new Date().toISOString();
    const historial = Array.isArray(pedido.trackingHistory) ?
      pedido.trackingHistory.slice() : [];
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
  VENCIDA_H,
  GUIA_OK,
  aSlot,
  parseHoras,
  horaLocal,
  tocaAhora,
  aConsultar,
  cambiosDe,
};
