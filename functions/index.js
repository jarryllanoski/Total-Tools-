"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {defineSecret, defineString} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");

// Modulo aislado de extraccion de comprobantes.
const comprobante = require("./comprobante");
// Motor B de tracking Shalom (navegador propio) — aislado del motor A
// (shalomTracking, API paga) y de tracking.js. Ver shalomweb-tracker/.
const shalomWebSync = require("./shalomWebSync");

setGlobalOptions({maxInstances: 10});
initializeApp();
const db = getFirestore();

// ── Secret Manager ─────────────────────────────────────────────────────────
const SHALOM_KEY = defineSecret("SHALOM_KEY");
const SHALOM_BASE = "https://shalom-api.lat";

// URL del worker propio (Cloud Run, shalomweb-tracker/). No es secreta (el
// servicio ya es publico de solo-lectura), pero se define como parametro
// para no hardcodear el proyecto/region y poder cambiarla sin tocar codigo.
const SHALOMWEB_URL = defineString("SHALOMWEB_TRACKER_URL", {
  default: "https://shalomweb-tracker-256086864182.us-central1.run.app",
});

// ── Rutas Firestore (deben coincidir exactamente con el panel) ─────────────
const CFG_DOC = "panel/config";
const SHIP_COL = "panel/shipments/items";
const TOK_COL = "panel/tokens/items";
const TRACK_COL = "panel/tracking/items";
const FORMCFG_COL = "panel/forms/configs";

// ── CORS ───────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://jarryllanoski.github.io",
  "https://total-tools-24ce8.web.app",
  "https://total-tools-24ce8.firebaseapp.com",
];
const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost(:\d+)?$/;

/**
 * Aplica headers CORS a la respuesta, reflejando el origen solo si está
 * en la lista permitida (o es localhost en cualquier puerto).
 * @param {Object} req request
 * @param {Object} res response
 */
function setCORS(req, res) {
  const origin = req.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGIN_RE.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ── formApi ────────────────────────────────────────────────────────────────
exports.formApi = onRequest(async (req, res) => {
  setCORS(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send(""); return;
  }

  const action = (req.query.action || "").trim();
  try {
    if (action === "create") await handleCreate(req, res);
    else if (action === "token") await handleToken(req, res);
    else if (action === "config") await handleConfig(req, res);
    else if (action === "track") await handleTrack(req, res);
    else if (action === "formcfg") await handleFormCfg(req, res);
    else res.status(400).json({status: "error", error: "Acción desconocida"});
  } catch (e) {
    console.error("formApi error:", action, e);
    res.status(500).json({
      status: "error",
      error: "Ocurrió un error temporal. Intenta nuevamente.",
    });
  }
});

// ── Whitelist de campos permitidos en order (formulario público) ───────────
// Refleja exactamente los campos que construye formulario.html.
// Cualquier campo extra enviado por el cliente se descarta antes de escribir
// en Firestore — los campos id/status/createdAt/fromForm los pone el backend.
const ORDER_FIELDS = [
  "id", "name", "phone", "address", "gpsCoords", "referencia",
  "dniRecoger", "ciudadDestino", "dniDestinatario", "encAgencia",
  "courier", "date", "status", "cost", "notes", "extra",
  "docGuia", "docEmbalado", "docComprobante", "links",
  "sel", "chkGuia", "chkEmbalado", "chkComprobante",
  "createdAt", "fromForm", "dni",
];

// Tamaño máximo por campo de texto — evita payloads gigantes (M-3).
const FIELD_MAX = {
  name: 120, phone: 20, dni: 12, dniRecoger: 12, dniDestinatario: 12,
  cost: 20, courier: 60, date: 30, status: 60, encAgencia: 200,
  ciudadDestino: 120, address: 600, referencia: 300, notes: 600,
  gpsCoords: 60, id: 60, createdAt: 40,
};
const DEFAULT_MAX = 600;

/**
 * Devuelve una copia de src con solo las claves de ORDER_FIELDS.
 * Trunca strings que excedan su tamaño máximo permitido.
 * @param {Object} src objeto order crudo del cliente
 * @return {Object} objeto filtrado
 */
function pickOrderFields(src) {
  const out = {};
  ORDER_FIELDS.forEach((k) => {
    if (!Object.prototype.hasOwnProperty.call(src, k)) return;
    let v = src[k];
    if (typeof v === "string") {
      const max = FIELD_MAX[k] || DEFAULT_MAX;
      if (v.length > max) v = v.slice(0, max);
    }
    out[k] = v;
  });
  return out;
}

// ── action=create ──────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleCreate(req, res) {
  // Rate limit: máx 10 pedidos/min por IP — evita spam de pedidos falsos.
  if (!(await checkRateLimit("formApi_create", req))) {
    res.status(429).json({
      status: "error",
      error: "Demasiadas solicitudes. Intenta de nuevo en un minuto.",
    });
    return;
  }

  const body = req.body || {};
  const order = body.order || {};
  const tokenId = (body.token || "").trim();

  if (!order.name || !order.phone) {
    res.status(400).json({
      status: "error", error: "Nombre y teléfono requeridos",
    });
    return;
  }

  // Re-validar token para evitar carreras: si ya fue usado entre ?t= y submit
  if (tokenId) {
    const tokSnap = await db.doc(`${TOK_COL}/${tokenId}`).get();
    if (!tokSnap.exists) {
      res.status(400).json({status: "error", error: "Token inválido"});
      return;
    }
    const tokData = tokSnap.data();
    if (tokData.used) {
      res.status(400).json({status: "error", error: "Token ya utilizado"});
      return;
    }
    if (tokData.expiresAt && new Date(tokData.expiresAt) < new Date()) {
      res.status(400).json({status: "error", error: "Token vencido"});
      return;
    }
  }

  const now = Date.now();
  const orderId = `id_${now}`;
  const trackCode = orderId.slice(-4).toUpperCase();
  // trackToken = orderId → ?seg=orderId → panel/shipments/items/{orderId}
  const trackToken = orderId;

  const orderToSave = Object.assign({}, pickOrderFields(order), {
    id: orderId,
    status: order.status || "NUEVO PEDIDO",
    createdAt: order.createdAt || new Date().toISOString(),
    fromForm: true,
  });

  // Escritura atómica: pedido + token + señal al panel
  const batch = db.batch();

  batch.set(db.doc(`${SHIP_COL}/${orderId}`), orderToSave);

  if (tokenId) {
    batch.set(
        db.doc(`${TOK_COL}/${tokenId}`),
        {
          used: true,
          orderId: orderId,
          trackCode: trackCode,
          clientName: order.name,
          usedAt: new Date().toISOString(),
        },
        {merge: true},
    );
  }

  // formTs: campo exclusivo del formulario — el panel nunca lo sobreescribe
  // ts   : señal legacy que el panel también escucha (threshold +500ms)
  batch.set(
      db.doc(CFG_DOC),
      {ts: now, formTs: now},
      {merge: true},
  );

  await batch.commit();

  res.json({status: "ok", orderId, trackCode, trackToken});
}

// ── action=token ───────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleToken(req, res) {
  const tokenId = (req.query.t || "").trim();
  if (!tokenId) {
    res.json({status: "invalid"}); return;
  }

  const snap = await db.doc(`${TOK_COL}/${tokenId}`).get();
  if (!snap.exists) {
    res.json({status: "invalid"}); return;
  }

  const d = snap.data();
  if (d.used) {
    res.json({status: "used", trackCode: d.trackCode || ""});
    return;
  }
  if (d.expiresAt && new Date(d.expiresAt) < new Date()) {
    res.json({status: "expired"});
    return;
  }
  res.json({
    status: "valid",
    prefillName: d.prefillName || "",
    prefillPhone: d.prefillPhone || "",
    prefillLink: d.prefillLink || "",
  });
}

// ── action=config ──────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleConfig(req, res) {
  const snap = await db.doc(CFG_DOC).get();
  const d = snap.exists ? snap.data() : {};
  // Solo campos públicos que el formulario necesita.
  // NUNCA exponer statusPin, trash, msgTemplates ni labels al público.
  res.json({
    config: d.config || {},
    couriers: d.couriers || [],
    courierActive: d.courierActive || {},
    courierTypes: d.courierTypes || {},
    dispatch: d.dispatch || {},
    extraFields: d.extraFields || [],
  });
}

// ── action=formcfg ─────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleFormCfg(req, res) {
  const id = (req.query.id || "").trim();
  if (!id) return res.status(400).json({error: "missing id"});
  const snap = await db.doc(`${FORMCFG_COL}/${id}`).get();
  if (!snap.exists) return res.status(404).json({error: "not found"});
  res.json(snap.data());
}

// ── action=track ───────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleTrack(req, res) {
  const trackToken = (req.query.token || "").trim();
  if (!trackToken) {
    res.json({status: "error", error: "Token requerido"});
    return;
  }

  // trackToken IS the orderId (set in handleCreate)
  const snap = await db.doc(`${SHIP_COL}/${trackToken}`).get();
  if (!snap.exists) {
    res.json({status: "not_found"});
    return;
  }

  const order = snap.data();
  const code = (order.id || "").slice(-4).toUpperCase();
  const frozen = ["ENTREGADO", "CANCELADO"].includes(order.status || "");
  // A-2: no exponer datos que la vista de seguimiento no necesita
  // (teléfono, costo, notas privadas, GPS, documentos internos, y los campos
  // internos del Motor B de tracking).
  const safe = Object.assign({}, order, {code, frozen});
  ["phone", "cost", "privateNote", "gpsCoords",
    "docGuia", "docEmbalado", "docComprobante", "docTicket",
    "sel", "chkGuia", "chkEmbalado", "chkComprobante", "fromForm",
    "trackingWebRawStatus", "trackingWebEstadoNormalizado",
    "trackingWebEtiquetaSugerida", "trackingWebCoincide",
    "trackingWebUltimaConsulta", "trackingWebProximaConsulta",
    "trackingWebError", "trackingWebFuente", "trackingWebActivo",
    "erroresSeguidosWeb"]
      .forEach((k) => delete safe[k]);

  // Estado de Shalom: solo se muestra al cliente si el operador activo la
  // opcion "Mostrar en el link del cliente". Filtro MOTOR-AGNOSTICO: aplica
  // sin importar que motor genero el dato (A o B). Si esta apagado, ocultamos
  // el texto de tracking del link publico (el panel siempre lo ve). Solo
  // leemos config cuando hay un estado que potencialmente ocultar.
  if (order.trackingStatus) {
    const cfgSnap = await db.doc(CFG_DOC).get();
    const cfg = (cfgSnap.exists && cfgSnap.data().config) || {};
    if (!cfg.trackingWebMostrarCliente) {
      ["trackingStatus", "trackingMessage", "trackingLastUpdate"]
          .forEach((k) => delete safe[k]);
    }
  }
  delete safe.trackingMotorOrigen;

  res.json({status: "ok", order: safe});
}

// ── FUNCIONES SHALOM ──────────────────────────────────────────────────────
// Proxy seguro hacia shalom-api.lat
// Key leída desde Secret Manager (SHALOM_KEY) — nunca expuesta al cliente
// ──────────────────────────────────────────────────────────────────────────

/**
 * Hace un GET a la Shalom API y devuelve el JSON parseado.
 * Lanza un Error enriquecido con .status y .detail si la respuesta no es ok.
 * @param {string} url URL completa del endpoint Shalom
 * @param {string} key valor de SHALOM_KEY desde Secret Manager
 * @param {AbortSignal=} signal señal de cancelación opcional
 * @return {Promise<Object>} JSON de respuesta
 */
async function shalomGet(url, key, signal) {
  const opts = {headers: {"x-api-key": key}};
  if (signal) opts.signal = signal;
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    const err = new Error(`Shalom ${r.status}`);
    err.status = r.status;
    err.detail = txt.slice(0, 200);
    throw err;
  }
  return r.json();
}

const TRACK_FIELD_RE = /^[A-Za-z0-9\-_./ ]{1,40}$/;

/**
 * Valida un campo de tracking (orderNumber/orderCode): alfanumérico con
 * separadores comunes, máximo 40 caracteres.
 * @param {*} v valor crudo recibido del cliente
 * @return {?string} valor saneado, o null si es inválido
 */
function safeTrackField(v) {
  const s = String(v === undefined || v === null ? "" : v).trim();
  return TRACK_FIELD_RE.test(s) ? s : null;
}

// ── Rate limit básico ──────────────────────────────────────────────────────
// Contador por IP en Firestore — ventana de 60 s, fail-open si Firestore falla.
// Ruta: panel/rateLimits/items/{fn_ip_window} — cubierta por rules actuales
const RATE_LIMITS = {
  agenciasShalom: {windowMs: 60000, max: 100},
  shalomTracking: {windowMs: 60000, max: 150},
  shalomTicket: {windowMs: 60000, max: 50},
  formApi_create: {windowMs: 60000, max: 10},
};

/**
 * Devuelve false si la IP superó el límite en la ventana actual.
 * Fail-open: permite la solicitud si Firestore no está disponible.
 * @param {string} name clave de RATE_LIMITS
 * @param {Object} req request de Express
 * @return {Promise<boolean>} true = permitir, false = rechazar
 */
async function checkRateLimit(name, req) {
  const cfg = RATE_LIMITS[name];
  const forwarded = req.get("x-forwarded-for") || req.ip || "unknown";
  const ip = forwarded.split(",")[0].trim();
  const windowStart = Math.floor(Date.now() / cfg.windowMs) * cfg.windowMs;
  const docId = (name + "_" + ip + "_" + windowStart)
      .replace(/[^A-Za-z0-9_]/g, "_");
  const ref = db.doc("panel/rateLimits/items/" + docId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? (snap.data().count || 0) : 0;
      if (count >= cfg.max) return false;
      tx.set(ref, {count: count + 1, windowStart: windowStart}, {merge: true});
      return true;
    });
  } catch (e) {
    console.error("checkRateLimit error:", name, e);
    return true; // fail-open: nunca bloquear por error de Firestore
  }
}

// ── agenciasShalom ─────────────────────────────────────────────────────────
// GET ?q=TEXTO → busca agencias     (shalom-api.lat/api/buscar?q=)
// GET          → listado completo   (shalom-api.lat/api/listar)
// Caller: formulario.html — buscador público de agencias
exports.agenciasShalom = onRequest(
    {secrets: [SHALOM_KEY]},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      if (!(await checkRateLimit("agenciasShalom", req))) {
        res.status(429).json({
          error: true,
          message: "Demasiadas solicitudes. Intenta nuevamente en un minuto.",
        });
        return;
      }
      try {
        const q = (req.query.q || "").trim().slice(0, 100);
        const url = q ?
          `${SHALOM_BASE}/api/buscar?q=${encodeURIComponent(q)}` :
          `${SHALOM_BASE}/api/listar`;
        const data = await shalomGet(
            url, SHALOM_KEY.value(), AbortSignal.timeout(10000));
        res.set("Cache-Control", "no-store");
        res.json(data);
      } catch (e) {
        console.error("agenciasShalom error:", e);
        res.status(e.status || 500).json({
          error: true,
          message: "No se pudo cargar agencias. Intenta nuevamente.",
        });
      }
    },
);

// ── shalomListar ───────────────────────────────────────────────────────────
// GET → listado completo de agencias (shalom-api.lat/api/listar)
// URL separada de agenciasShalom — caller: agencias-extractor.js (panel admin)
exports.shalomListar = onRequest(
    {secrets: [SHALOM_KEY], region: "us-central1"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      try {
        const data = await shalomGet(
            `${SHALOM_BASE}/api/listar`,
            SHALOM_KEY.value(),
            AbortSignal.timeout(10000),
        );
        res.set("Cache-Control", "no-store");
        res.status(200).json(data);
      } catch (e) {
        console.error("shalomListar error:", e);
        res.status(e.status || 500).json({
          error: "No se pudo obtener el listado de agencias.",
        });
      }
    },
);

// ── shalomTracking ─────────────────────────────────────────────────────────
// POST {orderNumber, orderCode} → tracking en tiempo real
// Si Shalom falla, sirve último tracking guardado en panel/tracking/{num}
exports.shalomTracking = onRequest(
    {secrets: [SHALOM_KEY]},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      if (req.method !== "POST") {
        res.status(405).json({error: true, message: "Usar POST"}); return;
      }
      if (!(await checkRateLimit("shalomTracking", req))) {
        res.status(429).json({
          error: true,
          message: "Demasiadas solicitudes. Intenta nuevamente en un minuto.",
        });
        return;
      }
      const {orderNumber, orderCode} = req.body || {};
      const orderNum = safeTrackField(orderNumber);
      if (!orderNum) {
        res.status(400).json({error: true, message: "orderNumber inválido"});
        return;
      }
      const orderCodeRaw = orderCode || "";
      const orderCod = orderCodeRaw ? safeTrackField(orderCodeRaw) : "";
      if (orderCod === null) {
        res.status(400).json({error: true, message: "orderCode inválido"});
        return;
      }
      // cacheDocId nunca debe contener "/": evita romper el path de Firestore
      // si en el futuro el formato de orderNum cambia.
      const cacheDocId = orderNum.replace(/\//g, "_");
      let cacheRef = null;
      try {
        cacheRef = db.doc(`${TRACK_COL}/${cacheDocId}`);
        const r = await fetch(`${SHALOM_BASE}/api/track`, {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            "x-api-key": SHALOM_KEY.value(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderNumber: orderNum,
            orderCode: orderCod,
          }),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw Object.assign(
              new Error(`Shalom ${r.status}`),
              {status: r.status, detail: txt.slice(0, 200)},
          );
        }
        const data = await r.json();
        await cacheRef.set({
          orderNumber: orderNum,
          orderCode: orderCod,
          data,
          updatedAt: FieldValue.serverTimestamp(),
          source: "shalom",
        }).catch((e) => console.error("tracking cache write:", e));
        res.json(data);
      } catch (e) {
        console.error("shalomTracking error:", e);
        const snap = cacheRef ? await cacheRef.get().catch(() => null) : null;
        if (snap && snap.exists) {
          const c = snap.data();
          const ts = c.updatedAt && c.updatedAt.toDate;
          const cachedAt = ts ? c.updatedAt.toDate().toISOString() : null;
          res.json({cached: true, cachedAt, data: c.data});
          return;
        }
        res.status(503).json({
          error: true,
          message: "Tracking temporalmente no disponible." +
            " Intenta nuevamente en unos minutos.",
        });
      }
    },
);

// ── shalomTicket ───────────────────────────────────────────────────────────
// POST {orderNumber, orderCode} → PNG binario del ticket de despacho
// Caller: ticket.js — botón "Jalar ticket" en el panel
exports.shalomTicket = onRequest(
    {secrets: [SHALOM_KEY], region: "us-central1"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
      }
      if (!(await checkRateLimit("shalomTicket", req))) {
        res.status(429).json({
          error: true,
          message: "Demasiadas solicitudes. Intenta nuevamente en un minuto.",
        });
        return;
      }
      const {orderNumber, orderCode} = req.body || {};
      const orderNum = safeTrackField(orderNumber);
      const orderCod = safeTrackField(orderCode);
      if (!orderNum || !orderCod) {
        res.status(400).json({
          error: "orderNumber/orderCode inválido o requerido",
        });
        return;
      }
      try {
        const r = await fetch(`${SHALOM_BASE}/api/ticket-image`, {
          method: "POST",
          signal: AbortSignal.timeout(20000),
          headers: {
            "x-api-key": SHALOM_KEY.value(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderNumber: orderNum,
            orderCode: orderCod,
          }),
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          console.error(
              "shalomTicket upstream error:", r.status, txt.slice(0, 200));
          res.status(r.status).json({
            error: "No se pudo generar el ticket. Intenta nuevamente.",
          });
          return;
        }
        const ct = r.headers.get("content-type") || "image/png";
        const buf = Buffer.from(await r.arrayBuffer());
        res.set("Content-Type", ct);
        res.set("Cache-Control", "no-store");
        res.status(200).send(buf);
      } catch (e) {
        console.error("shalomTicket error:", e);
        res.status(500).json({
          error: "No se pudo generar el ticket. Intenta nuevamente.",
        });
      }
    },
);

// ── extraerComprobante (Fase 2: on-demand, escribe en el pedido) ────────────
// Requiere token de Firebase Auth (solo el panel logueado). Uso principal:
//   ?pedidoId=<id>  -> detecta el link apisale del pedido, descarga, parsea,
//                      guarda cotizItems + extraccion en el pedido (idempot.).
//   ?url=<link>     -> modo prueba: solo devuelve texto/productos (no escribe).
const PV = comprobante.PARSER_VERSION;
exports.extraerComprobante = onRequest(
    {region: "us-central1"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      try {
        const pedidoId = (req.query.pedidoId || "").trim();
        const urlDirecta = (req.query.url || "").trim();

        // Ambos modos exigen token de Firebase Auth (solo el panel logueado).
        const authz = req.get("Authorization") || "";
        const bearer = authz.match(/^Bearer\s+(.+)$/i);
        if (!bearer) {
          res.status(401).json({ok: false, motivo: "No autorizado"});
          return;
        }
        try {
          await getAuth().verifyIdToken(bearer[1]);
        } catch (e) {
          res.status(401).json({ok: false, motivo: "Token invalido"});
          return;
        }

        // Modo prueba (?url=): solo lectura, no escribe en Firestore.
        // Solo baja de apisale (whitelist). Ahora tambien protegido con token.
        if (!pedidoId && urlDirecta) {
          const r = await comprobante.procesarUrl(urlDirecta);
          res.status(r.ok ? 200 : 400).json(r);
          return;
        }

        if (!pedidoId) {
          res.status(400).json({ok: false, motivo: "Falta pedidoId"});
          return;
        }

        const ref = db.doc(SHIP_COL + "/" + pedidoId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ok: false, motivo: "Pedido no existe"});
          return;
        }
        const s = snap.data();
        const link = comprobante.buscarLink(s.links);
        if (!link) {
          res.status(400).json({
            ok: false, motivo: "El pedido no tiene link de comprobante apisale",
          });
          return;
        }
        const urlHash = comprobante.hashUrl(link);

        // Idempotencia: ya procesado con mismo hash y version -> lo guardado.
        const ext = s.extraccion || {};
        if (ext.estado === "procesado" && ext.urlHash === urlHash &&
            ext.parserVersion === PV) {
          res.status(200).json({
            ok: true, estado: "procesado", cacheado: true,
            cotizItems: s.cotizItems || [],
          });
          return;
        }

        const r = await comprobante.procesarUrl(link);
        if (!r.ok) {
          await ref.set({extraccion: {
            estado: "error", urlHash: urlHash, parserVersion: PV,
            errorMensaje: r.motivo || "", procesadoEn: new Date().toISOString(),
          }}, {merge: true});
          res.status(400).json({ok: false, motivo: r.motivo});
          return;
        }
        const cotizItems = (r.productos || []).map((p) => ({
          codigo: p.codigo || "", desc: p.desc || "", cant: p.cant || 1,
          enTienda: false, proveedor: null, ean: p.ean || "",
        }));
        const write = {extraccion: {
          estado: "procesado", urlHash: urlHash, parserVersion: PV,
          procesadoEn: new Date().toISOString(),
        }};
        // No pisar ediciones: solo escribe cotizItems si el pedido no tenia.
        const tenia = Array.isArray(s.cotizItems) && s.cotizItems.length;
        if (!tenia) write.cotizItems = cotizItems;
        await ref.set(write, {merge: true});
        res.status(200).json({
          ok: true, estado: "procesado",
          cotizItems: tenia ? s.cotizItems : cotizItems,
        });
      } catch (e) {
        console.error("extraerComprobante error:", e);
        const msg = String((e && e.message) || e);
        res.status(500).json({ok: false, motivo: msg});
      }
    },
);

// ── syncShalomWeb (Motor B: tracking Shalom con navegador propio) ──────────
// Corre cada 30 min por Cloud Scheduler (gestionado por firebase deploy, sin
// pasos manuales). Por defecto NO HACE NADA: solo actua si
// panel/config.trackingMotor === "web" — el interruptor que decide cual
// motor esta "vivo" (nunca los dos a la vez, para que no se pisen). El
// motor A (shalomTracking, API paga) sigue existiendo sin tocarse.
const MAX_SHALOMWEB_POR_CORRIDA = 25;
const PAUSA_ENTRE_CONSULTAS_MS = 2500; // gentil con Shalom/reCAPTCHA

// Lee panel/config y devuelve la config ANIDADA bajo "config" (igual que
// handleConfig: d.config). Leer el nivel raiz da siempre undefined.
const leerCfgTracking = async () => {
  const cfgSnap = await db.doc(CFG_DOC).get();
  const raw = cfgSnap.exists ? cfgSnap.data() : {};
  return raw.config || {};
};

// Pipeline completo (consultar vencidos -> decidir -> escribir). Compartido
// entre el scheduler automatico y el boton manual "Sincronizar ahora", para
// no duplicar logica. No filtra por trackingMotor — quien llama decide si
// corresponde ejecutar.
const runShalomWebSync = async (cfg) => {
  const workerUrl = SHALOMWEB_URL.value();
  const nowMs = Date.now();

  const snap = await db.collection(SHIP_COL)
      .where("courier", "==", "SHALOM").get();

  const vencidos = [];
  const rellenar = []; // backfill: tienen dato observado pero tarjeta vacia
  snap.forEach((doc) => {
    const ship = doc.data();
    if (shalomWebSync.esElegible(ship) &&
        shalomWebSync.estaVencido(ship, nowMs)) {
      vencidos.push({id: doc.id, ship: ship});
    }
    // Backfill: el Motor B ya observo el estado (trackingWebRawStatus) pero
    // la tarjeta (trackingStatus) esta vacia o desactualizada. Copiamos el
    // dato existente SIN volver a consultar Shalom. Aplica a cualquier pedido
    // Shalom con dato observado (incluidos terminales).
    if (ship.trackingWebRawStatus &&
        ship.trackingStatus !== ship.trackingWebRawStatus) {
      rellenar.push({id: doc.id, ship: ship});
    }
  });

  // Backfill primero (instantaneo, sin red).
  let rellenados = 0;
  for (let i = 0; i < rellenar.length; i++) {
    const item = rellenar[i];
    const raw = item.ship.trackingWebRawStatus;
    await db.doc(SHIP_COL + "/" + item.id).set({
      trackingStatus: raw,
      trackingMessage: raw,
      trackingLastUpdate: item.ship.trackingWebUltimaConsulta ||
        new Date(nowMs).toISOString(),
      trackingMotorOrigen: "web",
    }, {merge: true});
    rellenados++;
  }

  const lote = vencidos.slice(0, MAX_SHALOMWEB_POR_CORRIDA);
  let actualizados = 0;
  let errores = 0;
  const detalle = [];

  for (let i = 0; i < lote.length; i++) {
    const item = lote[i];
    const guia = item.ship.trackingOrderNumber || item.ship.shalomGuia;
    const codigo = item.ship.trackingOrderCode || item.ship.shalomCodigo;
    const data = await shalomWebSync.consultarWorker(workerUrl, guia, codigo);
    const write = shalomWebSync.decidirCambios(item.ship, data, nowMs, cfg);
    if (write && Object.keys(write).length) {
      await db.doc(SHIP_COL + "/" + item.id).set(write, {merge: true});
    }
    if (data && data.ok) actualizados++; else errores++;
    detalle.push({
      pedido: item.ship.name || item.id,
      ok: !!(data && data.ok),
      sugerida: write.trackingWebEtiquetaSugerida || null,
    });
    if (i < lote.length - 1) {
      await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CONSULTAS_MS));
    }
  }

  return {
    pedidosShalom: snap.size,
    vencidos: vencidos.length,
    procesados: lote.length,
    rellenados: rellenados,
    ok: actualizados,
    errores: errores,
    pendientes: vencidos.length - lote.length,
    detalle: detalle,
  };
};

exports.syncShalomWeb = onSchedule(
    {
      schedule: "every 30 minutes",
      timeZone: "America/Lima",
      region: "us-central1",
      timeoutSeconds: 540,
      memory: "256MiB",
    },
    async () => {
      const cfg = await leerCfgTracking();
      if (cfg.trackingMotor !== "web") {
        console.log("[syncShalomWeb] motor 'web' apagado — nada que hacer");
        return;
      }
      const r = await runShalomWebSync(cfg);
      console.log(
          "[syncShalomWeb] listo — pedidos Shalom:", r.pedidosShalom,
          "vencidos:", r.vencidos, "procesados:", r.procesados,
          "ok:", r.ok, "errores:", r.errores, "pendientes:", r.pendientes,
      );
    },
);

// ── syncShalomWebNow (boton manual "Sincronizar ahora") ────────────────────
// Corre el mismo pipeline del scheduler pero disparado desde el panel, con
// respuesta inmediata: siempre devuelve el diagnostico (que motor/config esta
// leyendo realmente el backend); si el motor esta en "web" ademas sincroniza
// y devuelve el resultado. Requiere login del panel (mismo Bearer que las
// demas funciones autenticadas).
exports.syncShalomWebNow = onRequest(
    {region: "us-central1", timeoutSeconds: 540, memory: "256MiB"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      try {
        const authz = req.get("Authorization") || "";
        const bearer = authz.match(/^Bearer\s+(.+)$/i);
        if (!bearer) {
          res.status(401).json({ok: false, motivo: "No autorizado"});
          return;
        }
        try {
          await getAuth().verifyIdToken(bearer[1]);
        } catch (e) {
          res.status(401).json({ok: false, motivo: "Token invalido"});
          return;
        }

        const cfg = await leerCfgTracking();
        const diag = {
          trackingMotor: cfg.trackingMotor || null,
          trackingWebCambiaEtiqueta: !!cfg.trackingWebCambiaEtiqueta,
          horasTransito: cfg.trackingWebIntervalTransitoH || 12,
          horasDestino: cfg.trackingWebIntervalDestinoH || 24,
        };

        if (cfg.trackingMotor !== "web") {
          res.status(200).json({
            ok: true, ejecutado: false, diag: diag,
            motivo: "El motor no esta en 'web' — solo diagnostico, " +
              "no se sincronizo nada.",
          });
          return;
        }

        const r = await runShalomWebSync(cfg);
        res.status(200).json({ok: true, ejecutado: true, diag: diag, ...r});
      } catch (e) {
        console.error("syncShalomWebNow error:", e);
        const msg = String((e && e.message) || e);
        res.status(500).json({ok: false, motivo: msg});
      }
    },
);

// ── syncShalomWebTest (prueba manual, un solo pedido) ───────────────────────
// Corre el mismo pipeline del motor B para UN pedido puntual, sin depender
// del interruptor panel/config.trackingMotor ni del scheduler — para probar
// contra un pedido real antes de activar el ciclo automatico. Requiere login
// del panel (mismo Bearer que extraerComprobante). Con ?dryRun=1 no escribe.
exports.syncShalomWebTest = onRequest(
    {region: "us-central1"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      try {
        const authz = req.get("Authorization") || "";
        const bearer = authz.match(/^Bearer\s+(.+)$/i);
        if (!bearer) {
          res.status(401).json({ok: false, motivo: "No autorizado"});
          return;
        }
        try {
          await getAuth().verifyIdToken(bearer[1]);
        } catch (e) {
          res.status(401).json({ok: false, motivo: "Token invalido"});
          return;
        }

        const pedidoId = (req.query.pedidoId || "").trim();
        const dryRun = req.query.dryRun === "1";
        if (!pedidoId) {
          res.status(400).json({ok: false, motivo: "Falta pedidoId"});
          return;
        }

        const ref = db.doc(SHIP_COL + "/" + pedidoId);
        const snap = await ref.get();
        if (!snap.exists) {
          res.status(404).json({ok: false, motivo: "Pedido no existe"});
          return;
        }
        const ship = snap.data();
        if (!shalomWebSync.esElegible(ship)) {
          res.status(400).json({
            ok: false,
            motivo: "El pedido no es elegible (no es Shalom, falta guia" +
              "/codigo, o ya esta en un estado terminal)",
          });
          return;
        }

        const cfgSnap = await db.doc(CFG_DOC).get();
        // Config anidada bajo "config" (panel/config.config.*), igual que
        // handleConfig — no leer el nivel raiz.
        const cfg = (cfgSnap.exists && cfgSnap.data().config) || {};
        const guia = ship.trackingOrderNumber || ship.shalomGuia;
        const codigo = ship.trackingOrderCode || ship.shalomCodigo;
        const nowMs = Date.now();

        const data = await shalomWebSync.consultarWorker(
            SHALOMWEB_URL.value(), guia, codigo);
        const write = shalomWebSync.decidirCambios(ship, data, nowMs, cfg);

        if (!dryRun && write && Object.keys(write).length) {
          await ref.set(write, {merge: true});
        }

        res.status(200).json({
          ok: true, dryRun: dryRun, resultadoWorker: data, cambios: write,
        });
      } catch (e) {
        console.error("syncShalomWebTest error:", e);
        const msg = String((e && e.message) || e);
        res.status(500).json({ok: false, motivo: msg});
      }
    },
);
