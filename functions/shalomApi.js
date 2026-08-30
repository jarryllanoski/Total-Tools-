"use strict";

/**
 * shalomApi.js — Cliente de la API oficial de Shalom (api.shalom-api.lat)
 * =============================================================================
 * Este modulo es I/O PURO y no sabe nada de Firebase ni de HTTP entrante:
 * recibe la clave por parametro y devuelve datos normalizados. Asi se puede
 * probar sin desplegar nada.
 *
 * LA CLAVE NUNCA VIAJA AL NAVEGADOR. Vive en Secret Manager y solo la lee la
 * Cloud Function que envuelve a este modulo. Si la clave llegara al navegador,
 * cualquiera con F12 podria gastar el plan del negocio.
 *
 * REGLA DE ORO (heredada de docs/SHALOM.md, la leccion mas cara del proyecto):
 * jamas `ok:true` sin un dato real. Si no se reconoce la respuesta, se devuelve
 * `ok:false` con motivo — nunca un estado inventado, nunca un exito falso.
 */

const BASE = "https://api.shalom-api.lat";
const TIMEOUT_MS = 20000;

// ── Motivos de error (mismo vocabulario que el frontend en shalom.js) ────────
const MOTIVO = {
  SIN_CLAVE: "SIN_CLAVE",
  NO_ENCONTRADO: "NO_ENCONTRADO",
  BLOQUEADO: "BLOQUEADO", // clave invalida o plan vencido (401/403)
  LIMITE: "LIMITE", // se agoto la cuota (429)
  ERROR_SHALOM: "ERROR_SHALOM", // tropiezo temporal del lado de ellos (5xx)
  SIN_RED: "SIN_RED",
  FORMATO_DESCONOCIDO: "FORMATO_DESCONOCIDO",
  SIN_DATO: "SIN_DATO",
};

/**
 * Llamada base a la API. Traduce el codigo HTTP a un motivo del vocabulario
 * comun; nunca lanza por un 4xx/5xx (devuelve {ok:false}).
 * @param {string} apiKey clave de la API
 * @param {string} ruta ruta relativa, p.ej. "/track"
 * @param {Object} opts {method, body, query}
 * @return {Promise<Object>} {ok:true, data} o {ok:false, motivo, detalle}
 */
async function llamar(apiKey, ruta, opts) {
  opts = opts || {};
  if (!apiKey) return {ok: false, motivo: MOTIVO.SIN_CLAVE};

  let url = BASE + ruta;
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    if (qs) url += "?" + qs;
  }

  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let r;
  try {
    r = await fetch(url, {
      method: opts.method || "GET",
      headers: Object.assign(
          {"x-api-key": apiKey},
          opts.body ? {"Content-Type": "application/json"} : {},
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(reloj);
    return {ok: false, motivo: MOTIVO.SIN_RED, detalle: String(e && e.message)};
  }
  clearTimeout(reloj);

  // Binarios (comprobante / etiqueta): se devuelven tal cual.
  const tipo = r.headers.get("content-type") || "";
  if (r.ok && !tipo.includes("json")) {
    const buf = Buffer.from(await r.arrayBuffer());
    return {ok: true, binario: true, tipo, data: buf};
  }

  let cuerpo = null;
  try {
    cuerpo = await r.json();
  } catch (e) {
    cuerpo = null;
  }

  if (!r.ok) {
    const motivo =
      r.status === 404 ? MOTIVO.NO_ENCONTRADO :
      r.status === 401 || r.status === 403 ? MOTIVO.BLOQUEADO :
      r.status === 429 ? MOTIVO.LIMITE :
      MOTIVO.ERROR_SHALOM;
    return {
      ok: false,
      motivo,
      http: r.status,
      detalle: (cuerpo && (cuerpo.message || cuerpo.error)) || "",
    };
  }
  return {ok: true, data: cuerpo};
}

// ── Normalizacion del estado ────────────────────────────────────────────────
// La documentacion publica describe QUE ENVIAR pero no QUE DEVUELVE /track, asi
// que el traductor reconoce las formas plausibles y, si no reconoce ninguna,
// lo dice (FORMATO_DESCONOCIDO) en vez de inventar. Cuando veamos una respuesta
// real, esto se ajusta en un solo sitio.

/** Los cuatro pasos de la barra de Shalom, en orden. */
const PASOS = [
  {clave: "entregado", idx: 3, texto: "Entregado"},
  {clave: "destino", idx: 2, texto: "En destino"},
  {clave: "transito", idx: 1, texto: "En tránsito"},
  {clave: "origen", idx: 0, texto: "En origen"},
];

/**
 * @param {*} v valor del paso
 * @return {boolean} si el paso tiene dato real
 */
function _pasoCumplido(v) {
  if (!v) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "object") {
    return !!(v.fecha || v.date || v.completo === true);
  }
  return false;
}

/**
 * @param {*} v valor del paso
 * @return {string} fecha en texto, si la hay
 */
function _fechaDe(v) {
  if (!v || typeof v !== "object") return "";
  return String(v.fecha || v.date || "");
}

/**
 * Traduce la respuesta cruda de /track al contrato del panel.
 * Contrato: {ok:true, estado:'En destino', pasos:2, fecha:'...'}
 * @param {Object} crudo respuesta de la API
 * @return {Object} normalizado, o {ok:false, motivo}
 */
function normalizarTrack(crudo) {
  if (!crudo || typeof crudo !== "object") {
    return {ok: false, motivo: MOTIVO.SIN_DATO};
  }

  // Forma A — arbol de pasos, como lo expone el portal de Shalom:
  //   { estados: { message, data: { registrado, origen, transito, destino,
  //     entregado } } }  · tambien se acepta sin el envoltorio "estados".
  const cont = crudo.estados || crudo.data || crudo;
  const pasosObj = (cont && (cont.data || cont)) || {};
  const tienePasos = PASOS.some((p) =>
    Object.prototype.hasOwnProperty.call(pasosObj, p.clave));

  if (tienePasos) {
    // El paso MAS AVANZADO que tenga dato real manda.
    for (const p of PASOS) {
      if (_pasoCumplido(pasosObj[p.clave])) {
        const msg = (cont && (cont.message || cont.mensaje)) || "";
        return {
          ok: true,
          estado: String(msg || p.texto).trim(),
          pasos: p.idx,
          fecha: _fechaDe(pasosObj[p.clave]),
        };
      }
    }
    // Estructura reconocida pero ningun paso cumplido: la guia existe y aun no
    // registra movimiento. No es un fallo, pero tampoco hay estado que mostrar.
    return {ok: false, motivo: MOTIVO.SIN_DATO};
  }

  // Forma B — plano: { estado | status | estado_actual: "ENTREGADO", fecha }
  const plano = crudo.estado_actual || crudo.estado || crudo.status ||
    (crudo.data && (crudo.data.estado_actual || crudo.data.estado));
  if (typeof plano === "string" && plano.trim()) {
    const texto = plano.trim();
    return {
      ok: true,
      estado: texto,
      pasos: _pasosDesdeTexto(texto),
      fecha: String(crudo.fecha_estado || crudo.fecha ||
        (crudo.data && crudo.data.fecha_estado) || ""),
    };
  }

  // Forma C — historial: se toma el evento mas reciente.
  const hist = crudo.historial || crudo.history || crudo.eventos ||
    (crudo.data && (crudo.data.historial || crudo.data.history));
  if (Array.isArray(hist) && hist.length) {
    const ult = hist[hist.length - 1] || {};
    const texto = String(
        ult.estado || ult.status || ult.descripcion || "").trim();
    if (texto) {
      return {
        ok: true,
        estado: texto,
        pasos: _pasosDesdeTexto(texto),
        fecha: String(ult.fecha || ult.date || ""),
      };
    }
  }

  // No se reconocio nada. Se devuelven las CLAVES (no los valores: pueden traer
  // datos personales) para poder ajustar el traductor sin volver a consultar.
  return {
    ok: false,
    motivo: MOTIVO.FORMATO_DESCONOCIDO,
    claves: Object.keys(crudo).slice(0, 20),
  };
}

/**
 * Deduce el paso (0..3) a partir del texto, cuando la API no da el arbol.
 * Mismo vocabulario que detectarEstadoAuto del panel.
 * @param {string} texto estado en texto
 * @return {number} 0..3, o -1 si no se reconoce
 */
function _pasosDesdeTexto(texto) {
  const t = String(texto || "").toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/entregad|recogid|culminad/.test(t)) return 3;
  if (/destino|disposicion|recojo|agencia de destino/.test(t)) return 2;
  if (/transito|camino|viaja|reparto/.test(t)) return 1;
  if (/origen|recepcionad|registrad/.test(t)) return 0;
  return -1;
}

// ── Operaciones ─────────────────────────────────────────────────────────────

/**
 * Rastrea un envio. Devuelve el contrato que espera el panel.
 * @param {string} apiKey clave
 * @param {string} orderNumber numero de guia
 * @param {string} orderCode codigo
 * @return {Promise<Object>} {ok, estado, pasos, fecha} o {ok:false, motivo}
 */
async function track(apiKey, orderNumber, orderCode) {
  const r = await llamar(apiKey, "/track", {
    method: "POST",
    body: {orderNumber: String(orderNumber), orderCode: String(orderCode)},
  });
  if (!r.ok) return r;
  return normalizarTrack(r.data);
}

/**
 * Comprueba la clave y devuelve el consumo del mes.
 * @param {string} apiKey clave
 * @return {Promise<Object>} respuesta cruda de /validate
 */
async function validate(apiKey) {
  return llamar(apiKey, "/validate");
}

module.exports = {
  BASE,
  MOTIVO,
  llamar,
  normalizarTrack,
  _pasosDesdeTexto,
  track,
  validate,
};
