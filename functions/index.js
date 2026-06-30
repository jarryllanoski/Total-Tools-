"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

setGlobalOptions({maxInstances: 10});
initializeApp();
const db = getFirestore();

// ── Secret Manager ─────────────────────────────────────────────────────────
const SHALOM_KEY = defineSecret("SHALOM_KEY");
const SHALOM_BASE = "https://shalom-api.lat";

// ── Rutas Firestore (deben coincidir exactamente con el panel) ─────────────
const CFG_DOC = "panel/config";
const SHIP_COL = "panel/shipments/items";
const TOK_COL = "panel/tokens/items";
const TRACK_COL = "panel/tracking";

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
  res.set("Access-Control-Allow-Headers", "Content-Type");
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
    else if (action === "token" ) await handleToken(req, res);
    else if (action === "config") await handleConfig(req, res);
    else if (action === "track" ) await handleTrack(req, res);
    else res.status(400).json({status: "error", error: "Acción desconocida"});
  } catch (e) {
    console.error("formApi error:", action, e);
    res.status(500).json({
      status: "error",
      error: "Ocurrió un error temporal. Intenta nuevamente.",
    });
  }
});

// ── action=create ──────────────────────────────────────────────────────────
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleCreate(req, res) {
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

  const orderToSave = Object.assign({}, order, {
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
  res.json(snap.exists ? snap.data() : {});
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
  res.json({status: "ok", order: Object.assign({}, order, {code, frozen})});
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
      const cacheRef = db.doc(`${TRACK_COL}/${orderNum}`);
      try {
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
        const snap = await cacheRef.get().catch(() => null);
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
