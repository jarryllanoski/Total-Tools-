"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");

// Modulo aislado de extraccion de comprobantes.
const comprobante = require("./comprobante");
// Seleccion de datos del cliente recurrente (logica pura, testeable aparte).
const clienteLookup = require("./clienteLookup");
const {normalizarOlva} = require("./olvaNormalizar");

setGlobalOptions({maxInstances: 10});
initializeApp();
const db = getFirestore();

// ── Rutas Firestore (deben coincidir exactamente con el panel) ─────────────
const CFG_DOC = "panel/config";
const SHIP_COL = "panel/shipments/items";
const TOK_COL = "panel/tokens/items";
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
    else if (action === "client") await handleClient(req, res);
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
  let tokData = null;
  if (tokenId) {
    const tokSnap = await db.doc(`${TOK_COL}/${tokenId}`).get();
    if (!tokSnap.exists) {
      res.status(400).json({status: "error", error: "Token inválido"});
      return;
    }
    tokData = tokSnap.data();
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

  // Monto/adelanto vienen del TOKEN (los puso el operador), NO del cliente →
  // el cliente no los ve ni los puede alterar. Deuda = max(0, monto-adelanto)
  // se guarda en `cost` (lo leen tarjeta/dashboard/tracking, etc.).
  if (tokData && (tokData.monto || tokData.adelanto)) {
    const monto = Number(tokData.monto) || 0;
    const adelanto = Number(tokData.adelanto) || 0;
    const deuda = Math.max(0, monto - adelanto);
    orderToSave.monto = String(tokData.monto || "");
    orderToSave.adelanto = String(tokData.adelanto || "");
    orderToSave.cost = deuda > 0 ? String(deuda) : "";
  }

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

// ── action=client ──────────────────────────────────────────────────────────
// GET ?action=client&phone=9XXXXXXXX → {name, address} del ultimo pedido, para
// reconocer al cliente que vuelve y ahorrarle escribir sus datos.
//
// PRIVACIDAD — el formulario es publico (se abre sin token), asi que este
// endpoint podria usarse para averiguar si un numero es cliente y obtener su
// domicilio. Cuatro barreras lo hacen inviable como via de cosecha:
//   1. Rate limit por IP (20/min).
//   2. Se devuelve el MINIMO: nombre y direccion. Nunca DNI, montos, notas,
//      documentos, historial ni el resto del pedido.
//   3. Solo pedidos de los ultimos 12 meses.
//   4. Respuesta IDENTICA ({}) en todos los casos negativos —sin datos, fuera
//      de ventana, limite alcanzado o error— para no revelar el porque.
/**
 * @param {Object} req request
 * @param {Object} res response
 */
async function handleClient(req, res) {
  res.set("Cache-Control", "no-store");
  const vacio = () => res.json({});

  if (!(await checkRateLimit("formApi_client", req))) return vacio();

  const phone = String(req.query.phone || "").replace(/\D/g, "").slice(-9);
  if (phone.length !== 9) return vacio();

  try {
    // Sin orderBy: la igualdad usa el indice automatico y no hace falta crear
    // un indice compuesto. El tope acota el costo; el mas reciente se elige en
    // memoria (un cliente real no tiene decenas de pedidos abiertos).
    const snap = await db.collection(SHIP_COL)
        .where("phone", "==", phone).limit(50).get();
    if (snap.empty) return vacio();

    const pedidos = [];
    snap.forEach((d) => pedidos.push(d.data()));

    const cli = clienteLookup.elegirCliente(pedidos, Date.now());
    return cli ? res.json(cli) : vacio();
  } catch (e) {
    console.error("handleClient error:", e);
    return vacio(); // nunca romper el formulario por esto
  }
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
  // NOTA: DNI y notas (dni/dniRecoger/dniDestinatario, notes) SE MANTIENEN a
  // pedido del operador — el cliente puede verlos en su link. Lo que NO se
  // expone: fotos/firmas de entrega y datos internos del motorizado/cotización.
  ["phone", "cost", "privateNote", "gpsCoords",
    "docGuia", "docEmbalado", "docComprobante", "docTicket",
    "sel", "chkGuia", "chkEmbalado", "chkComprobante", "fromForm",
    // Entrega/motorizado (internos — no autorizados para el cliente):
    "_dlvFoto", "_dlvFirma", "_dlvReceptor", "_dlvDriver",
    "_dlvDriverPhone", "_dlvRutaLink", "_dlvDone", "_dlvFecha",
    "_dlvOrden", "_dlvAsignadoTs",
    "cotizItems", "extraccion",
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

// ── Rate limit básico ──────────────────────────────────────────────────────
// Contador por IP en Firestore — ventana de 60 s, fail-open si Firestore falla.
// Ruta: panel/rateLimits/items/{fn_ip_window} — cubierta por rules actuales
const RATE_LIMITS = {
  agenciasOlva: {windowMs: 60000, max: 100},
  formApi_create: {windowMs: 60000, max: 10},
  // Consulta de cliente recurrente: 20/min alcanza de sobra para el uso real
  // (una consulta por pedido) y hace inviable cosechar la cartera.
  formApi_client: {windowMs: 60000, max: 20},
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

// ── FUNCIONES OLVA ───────────────────────────────────────────────────────
// Mismo patron que Shalom (proxy servidor → JSON local → buscador vivo), pero
// SIN clave: el endpoint del sitio de Olva es publico y abierto.
// ──────────────────────────────────────────────────────────────────────────
const OLVA_STORES_URL =
  "https://www.olvacourier.com/wp-admin/admin-ajax.php?action=get_olva_stores";

/**
 * Trae el catalogo COMPLETO de agencias Olva (publico, sin clave).
 * Desenvuelve el sobre estandar de WordPress AJAX: {success, data}, donde
 * `data` puede venir como array directo o anidado en `data.data` (asi lo
 * maneja el propio script.js de Olva).
 * @return {Promise<Array>} lista de agencias crudas
 */
async function olvaFetchAll() {
  const r = await fetch(OLVA_STORES_URL, {signal: AbortSignal.timeout(90000)});
  if (!r.ok) {
    const err = new Error(`Olva ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const body = await r.json();
  if (!body || body.success !== true) {
    throw new Error((body && body.data && body.data.message) ||
      "Respuesta invalida de Olva");
  }
  const stores = body.data;
  if (stores && Array.isArray(stores.data)) return stores.data;
  if (Array.isArray(stores)) return stores;
  return [];
}

// ── olvaListar ──────────────────────────────────────────────────────────
// GET → listado completo de agencias Olva. Caller: agencias-extractor.js.
exports.olvaListar = onRequest(
    {region: "us-central1", timeoutSeconds: 120, memory: "512MiB"},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      try {
        const lista = await olvaFetchAll();
        res.set("Cache-Control", "no-store");
        res.status(200).json({data: lista});
      } catch (e) {
        console.error("olvaListar error:", e);
        const esTimeout = e && (e.name === "TimeoutError" ||
          e.name === "AbortError");
        const motivo = esTimeout ?
          "Olva tardo demasiado en responder (mas de 90 s)." :
          (e && e.status ?
            "Olva respondio " + e.status :
            "No se pudo conectar con Olva: " +
              String((e && e.message) || e).slice(0, 120));
        res.status(e && e.status ? e.status : 502).json({
          error: "No se pudo obtener el listado de agencias.",
          motivo: motivo,
        });
      }
    },
);

// ── agenciasOlva ────────────────────────────────────────────────────────
// GET ?q=TEXTO → filtra en memoria (el endpoint de Olva no soporta busqueda
// server-side, asi que se filtra aqui sobre el catalogo completo).
// GET          → listado completo.
// Caller: formulario.html — buscador publico de agencias (fallback en vivo).
exports.agenciasOlva = onRequest(
    {region: "us-central1", timeoutSeconds: 60},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
      }
      if (!(await checkRateLimit("agenciasOlva", req))) {
        res.status(429).json({
          error: true,
          message: "Demasiadas solicitudes. Intenta nuevamente en un minuto.",
        });
        return;
      }
      try {
        const q = (req.query.q || "").trim().slice(0, 100).toLowerCase();
        let lista = await olvaFetchAll();
        if (q) {
          lista = lista.filter((a) => [
            a.nombres, a.direccion, a.department, a.province, a.district,
          ].some((f) => String(f || "").toLowerCase().includes(q)));
        }
        // Se responde en el MISMO formato que data/agencias-olva.json: el
        // formulario tiene un solo contrato, venga del JSON o de aqui.
        res.set("Cache-Control", "no-store");
        res.json({resultados: lista.map(normalizarOlva)});
      } catch (e) {
        console.error("agenciasOlva error:", e);
        res.status(e.status || 500).json({
          error: true,
          message: "No se pudo cargar agencias. Intenta nuevamente.",
        });
      }
    },
);

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

// ── shalomApi ──────────────────────────────────────────────────────────────
// Intermediario entre el panel y la API oficial de Shalom.
//
// POR QUE EXISTE (y el navegador no llama a Shalom directo): la API key es un
// secreto. En el navegador, cualquiera con F12 la ve y gasta el plan del
// negocio. Aqui vive en Secret Manager y no sale nunca.
//
// TRES BARRERAS, en este orden:
//   1. Token de Firebase Auth valido  → no es un endpoint abierto.
//   2. Correo en la lista de administradores → que alguien tenga cuenta de
//      Firebase no basta; tiene que ser el duenio. Mismo criterio que
//      firestore.rules → esAdmin().
//   3. Lista blanca de operaciones → NO es un proxy ciego. Solo se permite lo
//      que el panel usa; nadie puede pasar por aqui para llamar a cualquier
//      ruta de Shalom con la clave del negocio.
const {defineSecret} = require("firebase-functions/params");
const SHALOM_API_KEY = defineSecret("SHALOM_API_KEY");
const shalomApi = require("./shalomApi");

// Misma lista que firestore.rules. Si agregas un admin, actualiza los dos.
const ADMINS = ["admin@totaltools.com"];

/**
 * Comprueba que quien llama es un administrador del panel.
 * @param {Object} req request
 * @return {Promise<Object>} {ok:true, email} o {ok:false, code, motivo}
 */
async function exigirAdmin(req) {
  const authz = req.get("Authorization") || "";
  const bearer = authz.match(/^Bearer\s+(.+)$/i);
  if (!bearer) return {ok: false, code: 401, motivo: "No autorizado"};
  let tok;
  try {
    tok = await getAuth().verifyIdToken(bearer[1]);
  } catch (e) {
    return {ok: false, code: 401, motivo: "Token invalido"};
  }
  const email = (tok && tok.email) || "";
  if (!ADMINS.includes(email)) {
    return {ok: false, code: 403, motivo: "Sin permiso"};
  }
  return {ok: true, email};
}

exports.shalomApi = onRequest(
    {region: "us-central1", secrets: [SHALOM_API_KEY], timeoutSeconds: 60},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }
      try {
        const permiso = await exigirAdmin(req);
        if (!permiso.ok) {
          res.status(permiso.code).json({ok: false, motivo: permiso.motivo});
          return;
        }

        const clave = SHALOM_API_KEY.value();
        const op = String(req.query.op || "").trim();
        const b = req.body;
        const cuerpo = (b && typeof b === "object") ? b : {};

        // ── Lista blanca de operaciones ───────────────────────────────────
        if (op === "validate") {
          // Comprueba la clave y devuelve el consumo del mes.
          const r = await shalomApi.validate(clave);
          res.status(r.ok ? 200 : 502).json(r);
          return;
        }

        if (op === "esquema") {
          // Diagnostico: devuelve la FORMA de la respuesta de Shalom (tipos,
          // no valores) para poder escribir el traductor contra el contrato
          // real en vez de contra una suposicion. No escribe en ningun pedido.
          const g = String(
              cuerpo.orderNumber || req.query.orderNumber || "").trim();
          const c = String(
              cuerpo.orderCode || req.query.orderCode || "").trim();
          if (!g || !c) {
            res.status(400).json({ok: false, motivo: "Falta guia o codigo"});
            return;
          }
          const r = await shalomApi.esquemaTrack(clave, g, c);
          res.status(200).json(r);
          return;
        }

        if (op === "track") {
          const guia = String(
              cuerpo.orderNumber || req.query.orderNumber || "").trim();
          const codigo = String(
              cuerpo.orderCode || req.query.orderCode || "").trim();
          if (!guia || !codigo) {
            res.status(400).json({ok: false, motivo: "Falta guia o codigo"});
            return;
          }
          const r = await shalomApi.track(clave, guia, codigo);
          // 200 siempre que la llamada se pudo hacer: el {ok:false, motivo} es
          // una respuesta valida del contrato, no un fallo de transporte.
          res.status(200).json(r);
          return;
        }

        res.status(400).json({ok: false, motivo: "Operacion no permitida"});
      } catch (e) {
        console.error("shalomApi error:", e);
        res.status(500).json({ok: false, motivo: "ERROR_INTERNO"});
      }
    },
);


// ── shalomWebhook ──────────────────────────────────────────────────────────
// Recibe los avisos de Shalom cuando una guia cambia de estado. Es la pieza
// que reemplaza al sondeo: en vez de preguntar cada 6 h desde la PC, Shalom
// avisa en el momento.
//
// ES UNA PUERTA ABIERTA A INTERNET. Cualquiera puede enviarle un POST, asi que
// TODO evento se verifica antes de tocar un pedido:
//
//   1. FIRMA HMAC-SHA256 sobre el cuerpo CRUDO (no el interpretado: si se
//      re-serializa el JSON, un espacio de diferencia cambia la firma).
//   2. COMPARACION DE TIEMPO CONSTANTE. Comparar con === filtra informacion:
//      el tiempo que tarda en fallar delata cuantos caracteres acerto, y con
//      suficientes intentos se reconstruye la firma.
//   3. DEDUPLICACION por id de evento. La documentacion garantiza que los
//      reintentos reusan el mismo id; se usa `create()`, que falla si el
//      documento ya existe — atomico, sin condiciones de carrera.
//
// Si algo no cuadra, NO se toca el pedido y queda anotado el motivo. Nunca se
// escribe un estado que no se pudo verificar.
//
// La cabecera de la firma no esta documentada, asi que se detecta: se prueban
// las que huelen a firma y se anota cual encajo. Queda registrado para poder
// fijarlo despues.
const crypto = require("crypto");
const WEBHOOK_DIAG = "panel/diagnostico";
const WEBHOOK_EVENTOS = "panel/webhookEventos/items";
const SHALOM_WEBHOOK_SECRET = defineSecret("SHALOM_WEBHOOK_SECRET");

/**
 * Compara dos textos en tiempo constante. Devuelve false ante cualquier
 * diferencia de longitud o contenido, sin delatar donde estaba la diferencia.
 * @param {string} a primer valor
 * @param {string} b segundo valor
 * @return {boolean} si son iguales
 */
function _igualSeguro(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ba, bb);
  } catch (e) {
    return false;
  }
}

/**
 * Busca la cabecera de firma y comprueba el HMAC contra el cuerpo crudo.
 * Prueba los formatos habituales (hex pelado y con prefijo "sha256=").
 * @param {Object} req request
 * @param {string} secreto secreto de firma
 * @return {Object} {valida, cabecera, formato, motivo}
 */
function _verificarFirma(req, secreto) {
  if (!secreto) return {valida: false, motivo: "SIN_SECRETO"};
  const crudo = req.rawBody;
  if (!crudo) return {valida: false, motivo: "SIN_CUERPO_CRUDO"};

  const esperado = crypto.createHmac("sha256", secreto)
      .update(crudo).digest("hex");

  const h = req.headers || {};
  const candidatas = Object.keys(h).filter((k) =>
    /signature|firma|hmac|digest/i.test(k));
  if (!candidatas.length) return {valida: false, motivo: "SIN_CABECERA_FIRMA"};

  for (const k of candidatas) {
    const recibido = String(h[k] || "").trim();
    if (_igualSeguro(recibido, esperado)) {
      return {valida: true, cabecera: k, formato: "hex"};
    }
    // Formato "sha256=<hex>", el que usan GitHub y Shopify.
    const conPrefijo = recibido.replace(/^sha256=/i, "");
    if (_igualSeguro(conPrefijo, esperado)) {
      return {valida: true, cabecera: k, formato: "sha256=hex"};
    }
    // Algunos proveedores lo mandan en base64.
    const b64 = crypto.createHmac("sha256", secreto)
        .update(crudo).digest("base64");
    if (_igualSeguro(recibido, b64)) {
      return {valida: true, cabecera: k, formato: "base64"};
    }
  }
  return {valida: false, motivo: "FIRMA_NO_COINCIDE", probadas: candidatas};
}

/**
 * Saca el id de evento de las cabeceras (para deduplicar).
 * @param {Object} req request
 * @return {string} id, o cadena vacia
 */
function _idEvento(req) {
  const h = req.headers || {};
  const k = Object.keys(h).find((x) => /event-id|event_id/i.test(x));
  return k ? String(h[k] || "").trim() : "";
}

/**
 * Encuentra la guia, el codigo y el estado dentro del evento. La forma no
 * esta documentada, asi que se buscan los nombres habituales en la raiz y un
 * nivel adentro. Si no aparece, se dice — no se inventa.
 * @param {Object} ev cuerpo del evento
 * @return {Object} {guia, codigo, estado}
 */
function _datosDelEvento(ev) {
  const cajas = [ev, ev.data, ev.order, ev.tracking, ev.payload]
      .filter((x) => x && typeof x === "object");
  const buscar = (nombres) => {
    for (const caja of cajas) {
      for (const n of nombres) {
        const v = caja[n];
        if (v !== undefined && v !== null && String(v).trim() !== "") {
          return String(v).trim();
        }
      }
    }
    return "";
  };
  return {
    guia: buscar(["orderNumber", "numero_orden", "guia", "numeroOrden"]),
    codigo: buscar(["orderCode", "codigo_orden", "codigo", "codigoOrden"]),
    estado: buscar(
        ["status", "estado", "message", "newStatus", "estadoActual"]),
  };
}

/**
 * Anota en Firestore lo que llego, para poder ajustar sin volver a esperar un
 * evento. Guarda tipos y nombres, nunca valores con datos de personas.
 * @param {Object} datos que anotar
 * @return {Promise<void>}
 */
async function _anotarDiagnostico(datos) {
  try {
    const ref = db.doc(WEBHOOK_DIAG);
    const snap = await ref.get();
    const previo = (snap.exists && snap.data().webhook) || {};
    const muestras = Array.isArray(previo.muestras) ? previo.muestras : [];
    if (muestras.length < 5) muestras.push(datos);
    await ref.set({webhook: {
      recibidos: (previo.recibidos || 0) + 1,
      ultimo: new Date().toISOString(),
      muestras: muestras,
    }}, {merge: true});
  } catch (e) {
    console.error("[shalomWebhook] no se pudo anotar:", e.message);
  }
}

/**
 * Busca el pedido por su numero de guia. Se prueban los dos campos que
 * conviven en los datos historicos.
 * @param {string} guia numero de guia
 * @return {Promise<Object|null>} {ref, datos} o null
 */
async function _pedidoPorGuia(guia) {
  const campos = ["trackingOrderNumber", "shalomGuia"];
  for (const campo of campos) {
    const q = await db.collection(SHIP_COL)
        .where(campo, "==", guia).limit(1).get();
    if (!q.empty) return {ref: q.docs[0].ref, datos: q.docs[0].data()};
  }
  return null;
}

exports.shalomWebhook = onRequest(
    {region: "us-central1", secrets: [SHALOM_WEBHOOK_SECRET],
      timeoutSeconds: 30},
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).json({ok: false, motivo: "Solo POST"});
        return;
      }
      try {
        const secreto = SHALOM_WEBHOOK_SECRET.value();
        const firma = _verificarFirma(req, secreto);
        const cuerpo = (req.body && typeof req.body === "object") ?
          req.body : {};

        if (!firma.valida) {
          // No se toca nada. Se anota para poder ajustar la verificacion.
          await _anotarDiagnostico({
            cuando: new Date().toISOString(),
            resultado: "FIRMA_RECHAZADA",
            motivo: firma.motivo,
            cabecerasProbadas: firma.probadas || [],
            cabeceras: Object.keys(req.headers || {})
                .filter((k) => /shalom|signature|event|hmac/i.test(k)),
            esquemaCuerpo: shalomApi.esquemaDe(cuerpo),
          });
          console.warn("[shalomWebhook] firma rechazada:", firma.motivo);
          res.status(401).json({ok: false, motivo: "Firma invalida"});
          return;
        }

        // Deduplicacion atomica: create() falla si el evento ya se proceso.
        const idEv = _idEvento(req);
        if (idEv) {
          const idLimpio = idEv.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
          try {
            await db.doc(WEBHOOK_EVENTOS + "/" + idLimpio)
                .create({cuando: new Date().toISOString()});
          } catch (e) {
            console.log("[shalomWebhook] repetido, se ignora:", idLimpio);
            res.status(200).json({ok: true, repetido: true});
            return;
          }
        }

        const d = _datosDelEvento(cuerpo);
        if (!d.guia) {
          await _anotarDiagnostico({
            cuando: new Date().toISOString(),
            resultado: "SIN_GUIA_EN_EVENTO",
            firmaOk: true, cabeceraFirma: firma.cabecera,
            formatoFirma: firma.formato,
            esquemaCuerpo: shalomApi.esquemaDe(cuerpo),
          });
          res.status(200).json({ok: true, motivo: "Sin guia reconocible"});
          return;
        }

        const pedido = await _pedidoPorGuia(d.guia);
        if (!pedido) {
          // Guia que no es nuestra o pedido borrado: no es un error.
          res.status(200).json({ok: true, motivo: "Pedido no encontrado"});
          return;
        }

        // Solo se escribe si el texto CAMBIO. Repetir el mismo estado
        // ensuciaria el historial con entradas identicas.
        const s = pedido.datos;
        if (d.estado && s.trackingStatus !== d.estado) {
          const iso = new Date().toISOString();
          const hist = Array.isArray(s.trackingHistory) ?
            s.trackingHistory.slice() : [];
          hist.push({date: iso, status: d.estado, message: d.estado,
            source: "webhook"});
          await pedido.ref.set({
            trackingStatus: d.estado,
            trackingMessage: d.estado,
            trackingLastUpdate: iso,
            trackingHistory: hist,
          }, {merge: true});
          console.log("[shalomWebhook] actualizado", d.guia, "->", d.estado);
        }

        // La ETIQUETA (status) no se toca nunca. Ese es el invariante de todo
        // el sistema: informar si, decidir por el operador no.
        await _anotarDiagnostico({
          cuando: new Date().toISOString(),
          resultado: "PROCESADO",
          cabeceraFirma: firma.cabecera, formatoFirma: firma.formato,
          esquemaCuerpo: shalomApi.esquemaDe(cuerpo),
        });
        res.status(200).json({ok: true});
      } catch (e) {
        console.error("shalomWebhook error:", e);
        res.status(500).json({ok: false});
      }
    },
);
