"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");

// Modulo aislado de extraccion de comprobantes.
const comprobante = require("./comprobante");
// Seleccion de datos del cliente recurrente (logica pura, testeable aparte).
const clienteLookup = require("./clienteLookup");
const {normalizarOlva} = require("./olvaNormalizar");
// Puerta unica a la API de Shalom (lista blanca + traduccion).
const shalomPuerta = require("./shalomPuerta");
// El interruptor: cuando apagar la puerta y cuando reencenderla (logica pura).
const interruptor = require("./interruptor");
// Verificar la firma de los avisos de Shalom (logica pura, sin red).
const webhook = require("./webhook");
// A quien consulta el barrido y cuando (logica pura).
const barrido = require("./barrido");
// Que etiqueta le toca a un pedido. LO COMPARTE CON EL PANEL: ver la
// cabecera de etiquetas.js — dos copias de esta regla divergirian.
const etiquetas = require("./etiquetas");
const agencias = require("./agencias");
const pedidoPublico = require("./pedidoPublico");

setGlobalOptions({maxInstances: 10});
initializeApp();
const db = getFirestore();

// ── Rutas Firestore (deben coincidir exactamente con el panel) ─────────────
const CFG_DOC = "panel/config";
const SHIP_COL = "panel/shipments/items";
const TOK_COL = "panel/tokens/items";
const FORMCFG_COL = "panel/forms/configs";

// La clave de Shalom vive en Secret Manager. Nunca en el codigo ni en el
// navegador. Se pone con: firebase functions:secrets:set SHALOM_API_KEY
const SHALOM_API_KEY = defineSecret("SHALOM_API_KEY");

// El secreto del webhook. `PUT /webhooks` lo devuelve COMPLETO una sola vez;
// despues queda enmascarado. Se pone con:
//   firebase functions:secrets:set SHALOM_WEBHOOK_SECRET
const SHALOM_WEBHOOK_SECRET = defineSecret("SHALOM_WEBHOOK_SECRET");

// ⚠️ ESTA LISTA DEBE COINCIDIR CON firestore.rules (funcion esAdmin).
// Son dos archivos distintos que expresan la misma regla: si se cambian por
// separado, alguien puede escribir en Firestore pero no hablar con Shalom, o
// al reves. Al tocar una, tocar la otra.
// ⚠️ Solo cuentas de Google: esAdminDe exige el correo VERIFICADO, y un
// registro con contrasena nunca lo esta. Misma regla que firestore.rules.
const ADMINS = [
  "jarryllanoski@gmail.com",
  "redbolima@gmail.com",
];


/**
 * EL ÚNICO CAMINO HACIA SHALOM: interruptor → llamada → interruptor.
 *
 * Lo usan el panel (a traves de shalomPuerta) y el barrido programado. Si el
 * barrido tuviera su propia llamada, seria un segundo camino que se salta el
 * interruptor — y entonces una caida de Shalom volveria a costar cientos de
 * consultas, justo de madrugada y sin nadie mirando.
 * @param {string} destino operacion de la lista blanca
 * @param {Object} datos cuerpo para las operaciones POST
 * @param {boolean} [diagnostico] true para `esquema` y `validate`
 * @return {Promise<Object>} {ok:true, json} o {ok:false, motivo, …}
 */
async function _porLaPuerta(destino, datos, diagnostico) {
  const estado = await _leerPuerta();
  /* `instances` sondea igual que `validate`: es UNA consulta, no toca
     ningun envio y no gasta cuota, asi que puede pasar mientras la puerta
     descansa. Y como cualquier respuesta buena la reabre, apretar
     "Verificar sesion" es tambien la forma de preguntar "¿ya volvio?". */
  const esSondeo = diagnostico || destino === "validate" ||
      destino === "instances";
  const llave = interruptor.decidir(estado, Date.now(), esSondeo);
  if (!llave.pasa) {
    return {ok: false, motivo: llave.motivo, reabre: llave.reabre};
  }
  const r = await shalomPuerta.llamar(destino, SHALOM_API_KEY.value(), datos);
  const cambios = interruptor.tras(estado, r, Date.now(), llave.probando);
  if (cambios) await _guardarPuerta(cambios);
  return r;
}

/* ── EL INTERRUPTOR DE LA PUERTA ───────────────────────────────────────────
   El estado vive en Firestore para que lo compartan todos los dispositivos y
   sobreviva al reinicio de la funcion. Se cachea unos segundos en memoria
   para que un barrido de 484 guias no cueste 484 lecturas — y se actualiza a
   mano tras cada escritura, asi que dentro de un mismo barrido el conteo de
   fallos es exacto. */
const PUERTA_DOC = "panel/shalom";
const PUERTA_FRESCA_MS = 15000;
let _puerta = {estado: null, ts: 0};

/**
 * El estado de la puerta, de cache o de Firestore.
 * @return {Promise<Object>} estado normalizado
 */
async function _leerPuerta() {
  const ahora = Date.now();
  if (_puerta.estado && (ahora - _puerta.ts) < PUERTA_FRESCA_MS) {
    return _puerta.estado;
  }
  let doc = null;
  try {
    const snap = await db.doc(PUERTA_DOC).get();
    doc = snap.exists ? snap.data() : null;
  } catch (e) {
    // Si no se pudo leer, NO se bloquea a nadie: normalizar(null) deja la
    // puerta abierta. Una puerta que se cierra porque no pudo leerse a si
    // misma es peor que no tener puerta.
    console.warn("puerta: no se pudo leer el estado:", e && e.message);
  }
  _puerta = {estado: interruptor.normalizar(doc), ts: ahora};
  return _puerta.estado;
}

/**
 * Guarda los cambios del interruptor y refresca la cache.
 * @param {Object} cambios campos a escribir
 * @return {Promise<void>}
 */
async function _guardarPuerta(cambios) {
  _puerta.estado = interruptor.normalizar(
      Object.assign({}, _puerta.estado, cambios));
  _puerta.ts = Date.now();
  try {
    await db.doc(PUERTA_DOC).set(cambios, {merge: true});
  } catch (e) {
    console.warn("puerta: no se pudo guardar el estado:", e && e.message);
  }
}

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
  /* La agencia de destino IDENTIFICADA. Sin estos, registrar un envio en
     Shalom es imposible: `POST /account/register` pide el `ter_id`, y ese id
     solo se conoce sin adivinar en el instante en que el cliente elige la
     agencia de la lista. Si no viajan aqui, ese instante se pierde. */
  "agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier",
];

// Tamaño máximo por campo de texto — evita payloads gigantes (M-3).
const FIELD_MAX = {
  name: 120, phone: 20, dni: 12, dniRecoger: 12, dniDestinatario: 12,
  cost: 20, courier: 60, date: 30, status: 60, encAgencia: 200,
  ciudadDestino: 120, address: 600, referencia: 300, notes: 600,
  gpsCoords: 60, id: 60, createdAt: 40,
  agenciaId: 10, agenciaNombre: 120, agenciaGeo: 200, agenciaCourier: 20,
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
  /* La agencia: o entran los CUATRO campos con un id valido, o no entra
     ninguno. Recortar no basta — `agenciaId: "../x"` recortado sigue siendo
     basura, y un pedido con id malo y geo buena PARECE identificado sin
     serlo. Se valida con el MISMO modulo que usa el panel, no con una copia
     que se desincronice.
     Y se limpia entero, porque tres campos sin el cuarto es peor que nada:
     el panel diria "agencia identificada" sobre algo que no se puede
     registrar, y eso se descubre con un envio pagado. */
  if (!agencias.idValido(out.agenciaId) ||
      !agencias.courierDe(out.agenciaCourier)) {
    agencias.CAMPOS.forEach((k) => delete out[k]);
  }
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

  /* ★ LISTA BLANCA, no lista negra.
     Aqui se copiaba el pedido ENTERO y se borraba una lista de campos
     prohibidos. Con ese diseño CADA CAMPO NUEVO NACE PUBLICO: nadie se
     acuerda de añadirlo a la lista de borrados, y el fallo no se ve — el
     dato simplemente viaja.

     Paso de verdad: la clave de recojo (`shalomClave`) se añadio al pedido y
     empezo a salir en la respuesta de este endpoint sin que nada avisara. Un
     link de seguimiento se reenvia, se queda en un historial y no caduca; una
     clave que viaja por ahi deja de proteger el paquete.

     Es OWASP API3:2023 (Broken Object Property Level Authorization), y su
     remedio documentado es exactamente esto: enumerar lo permitido.

     Lo que el cliente ve se decide en functions/pedidoPublico.js, y hay una
     prueba que compara esa lista con los campos que el formulario lee de
     verdad — asi no se puede quedar corta sin que salte. */
  const safe = pedidoPublico.proyectar(order, {code, frozen});

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

// ── SHALOM · retirado el 2026-09-13, se reconstruye endpoint por endpoint ───
//
// Aqui vivian `shalomApi` (intermediario con la API oficial) y `shalomWebhook`
// (avisos de cambio de estado). Se retiran ENTEROS para rehacer la integracion
// desde cero: la clave anterior quedo expuesta en capturas y se rota, y hubo
// dos fallos de traduccion que costaron dias — `statuses.message` pisando el
// arbol de pasos, y una demora tapando un "Entregado".
//
// Lo que NO se tira es lo aprendido: la forma REAL de `/track` y de
// `/instances/status`, medida contra la API y no supuesta, sigue escrita en
// docs/SHALOM.md junto al plan de reconstruccion. Volver a medir lo que ya
// estaba medido seria pagar dos veces.
//
// Mientras tanto el panel funciona igual: `shalom.js` es la puerta unica y
// responde DESCONECTADO, que la interfaz ya sabe mostrar ("Rastreo Shalom en
// reconstruccion"). Ninguna pantalla se rompe.
//
// AL VOLVER A CONECTAR, lo que habia y hay que conservar:
//   · La clave vive en Secret Manager, nunca en el navegador.
//   · Tres barreras antes de hablar con Shalom: token de Firebase Auth valido,
//     correo en la lista de administradores (la misma de firestore.rules), y
//     lista blanca de operaciones — no un proxy ciego.
//   · El webhook verifica la firma sobre el CUERPO CRUDO, compara en tiempo
//     constante y deduplica con un create() atomico.
//   · La etiqueta del pedido (`status`) no se toca nunca: informar si, decidir
//     por el operador no.
//   · Un envio no desanda el camino (ver docs/INVARIANTES.md, 2 bis).

// ── shalomWebhook ─────────────────────────────────────────────────────────
// LA UNICA PUERTA PUBLICA SIN AUTENTICACION DEL SISTEMA. Cualquiera en
// internet puede llamarla; lo unico que separa un aviso de Shalom de uno
// inventado es la firma. Por eso aqui no hay atajos y no se escribe NADA
// antes de verificarla.
//
// ⚠️ ETAPA 4a: MIDE, NO TRADUCE. El webhook habla otro idioma que /track
// ("IN_TRANSIT" en vez de "En transito") y ese mapa no esta documentado en
// ninguna parte. Adivinarlo seria repetir el fallo que costo dias, esta vez
// escribiendo solo y de madrugada. Asi que por ahora: verifica, descarta
// repetidos, y ANOTA la forma y los codigos. Ningun pedido se toca.
const WEB_DOC = "panel/webhook";
const WEB_COL = "panel/webhook/eventos";

// ⏸ APARCADO — 22 de septiembre de 2026.
// La funcion NO se despliega: el despliegue se retiro a proposito porque
// Shalom nunca llego a registrar la URL (su formulario devolvia "URL
// requerida" con el campo lleno), asi que no recibia nada — pero seguia
// siendo una puerta publica abierta en internet, y cada peticion rechazada
// le costaba una escritura a Firestore. Cero beneficio, costo real.
//
// El codigo y sus pruebas se quedan intactos. Para revivirlo: poner esto en
// true, ARREGLAR ANTES el contador de rechazos (ver docs/DEUDA.md § 24),
// registrar la URL con `PUT /webhooks` y guardar el secreto que devuelve.
//
// Sin este interruptor, un `firebase deploy --only functions` volveria a
// crear la funcion sola y la puerta reaparecia sin que nadie se enterara.
const WEBHOOK_ACTIVO = false;

const _shalomWebhook = onRequest({
  region: "us-central1",
  secrets: [SHALOM_WEBHOOK_SECRET],
  timeoutSeconds: 30,
  memory: "256MiB",
}, async (req, res) => {
  // No lo llama un navegador: no hay CORS que dar.
  if (req.method !== "POST") {
    res.status(405).send("no");
    return;
  }

  const firma = req.get("X-Shalom-Signature") || "";
  // req.rawBody son los bytes TAL COMO LLEGARON. Reparsear el JSON y volver a
  // serializarlo cambia los bytes, y entonces la firma no cuadra nunca.
  const crudo = req.rawBody;
  const v = webhook.verificarFirma(
      firma, crudo, SHALOM_WEBHOOK_SECRET.value(), Date.now());

  if (!v.ok) {
    console.warn("webhook rechazado:", v.motivo);
    // Se anota para poder ver si alguien esta probando la puerta. El cuerpo NO
    // se guarda: si no esta firmado, no hay razon para creer nada de lo que
    // trae —ni para darle sitio en la base de datos—.
    try {
      await db.doc(WEB_DOC).set({
        rechazados: FieldValue.increment(1),
        ultimoRechazo: {ts: Date.now(), motivo: v.motivo},
      }, {merge: true});
    } catch (e) {
      // No vale fallar por no poder anotar.
    }
    // Respuesta corta y sin detalle: decir QUE fallo ayuda a quien prueba.
    res.status(401).send("no");
    return;
  }

  /* Repetidos. Shalom reintenta si no respondemos rapido, y aplicar dos veces
     el mismo aviso duplica historiales. `create()` falla si el documento ya
     existe, asi que la comprobacion y la marca son UNA sola operacion: entre
     mirar y escribir no cabe un segundo intento. */
  const id = webhook.idDeEvento(firma);
  try {
    await db.doc(WEB_COL + "/" + id).create({recibido: Date.now()});
  } catch (e) {
    // Ya estaba: es un reintento. 200 para que deje de insistir, y nada mas.
    res.status(200).send("ok");
    return;
  }

  let cuerpo = null;
  try {
    cuerpo = JSON.parse(crudo.toString("utf8"));
  } catch (e) {
    cuerpo = null;
  }
  const codigos = webhook.codigos(cuerpo);
  try {
    await db.doc(WEB_COL + "/" + id).set({
      // La FORMA (tipos, sin valores) y los CODIGOS (MAYUSCULAS, que nunca son
      // un nombre ni una direccion). Con eso se mide el vocabulario sin
      // guardar datos de nadie.
      forma: shalomPuerta.forma(cuerpo),
      codigos: codigos,
      bytes: crudo ? crudo.length : 0,
    }, {merge: true});
    await db.doc(WEB_DOC).set({
      recibidos: FieldValue.increment(1),
      ultimo: {ts: Date.now(), codigos: codigos,
        bytes: crudo ? crudo.length : 0},
    }, {merge: true});
  } catch (e) {
    console.error("webhook: no se pudo anotar el evento:", e);
  }

  console.log("webhook ok", JSON.stringify({id: id, codigos: codigos}));
  res.status(200).send("ok");
});

// Solo se exporta —y por tanto solo existe en internet— si el interruptor
// esta en true. Con false, `firebase deploy` ni la ve.
if (WEBHOOK_ACTIVO) exports.shalomWebhook = _shalomWebhook;

// ── barridoShalom ─────────────────────────────────────────────────────────
// El seguimiento automatico. Cloud Scheduler dispara CADA 30 MINUTOS y la
// funcion decide si le toca: asi los horarios viven en Config y se cambian sin
// volver a desplegar. Los disparos que no tocan no consultan nada a Shalom.
//
// ⚠️ ARRANCA EN SIMULACRO. Decide todo igual y NO ESCRIBE: deja el informe de
// que habria cambiado. Mover 71 etiquetas a ciegas y corregirlas a mano
// despues no es una opcion. Se apaga desde Config cuando el informe cuadre.
const BARRIDO_DOC = "panel/barrido";
const PAUSA_MS = 300; // entre consulta y consulta
const TOPE_MS = 450000; // margen bajo el timeout de 540 s
const TOPE_DETALLE = 60; // cuantas lineas guarda el informe

/**
 * El barrido, en una funcion: lo llaman el horario y el boton "Correr ahora".
 * Dos copias de esto acabarian barriendo distinto segun quien lo dispare.
 * @param {boolean} [forzado] true = saltarse el reloj (boton manual)
 * @return {Promise<?Object>} el informe, o null si no le tocaba
 */
async function _correrBarrido(forzado) {
  const arranque = Date.now();

  // 1 · ¿toca ahora?
  let cfg = {};
  try {
    const snap = await db.doc(CFG_DOC).get();
    cfg = (snap.exists && snap.data()) || {};
  } catch (e) {
    console.error("barrido: no se pudo leer la configuracion:", e);
    return null;
  }
  const b = (cfg.config && cfg.config.barrido) || {};
  // El boton manual se salta el horario, pero NO el interruptor: si el
  // seguimiento automatico esta apagado, apagado esta.
  if (b.activo === false) return null;
  const horas = barrido.parseHoras(b.horas);
  const ahoraLocal = barrido.horaLocal(new Date());
  if (!forzado && !barrido.tocaAhora(horas, ahoraLocal)) return null;

  const modo = String(b.modo || etiquetas.MODOS.SEMI);
  const simulacro = b.simulacro !== false; // de fabrica, simulacro

  // 2 · a quien se consulta
  const docs = [];
  try {
    const snap = await db.collection(SHIP_COL).get();
    snap.forEach((d) => docs.push(Object.assign({id: d.id}, d.data())));
  } catch (e) {
    console.error("barrido: no se pudieron leer los pedidos:", e);
    return null;
  }
  const porId = {};
  docs.forEach((d) => {
    porId[d.id] = d;
  });
  const sel = barrido.aConsultar(docs, arranque);

  // 3 · consultar, decidir
  const escrituras = [];
  const detalle = [];
  let consultadas = 0; let fallidas = 0; let cortado = "";
  /* Por que fallaron, no solo cuantas. "6 fallaron" no se puede accionar:
     no distingue un corte de red de una cuota agotada ni de una clave
     rechazada, y cada una se arregla en un sitio distinto. */
  const motivos = {};
  for (const item of sel.consultar) {
    if (Date.now() - arranque > TOPE_MS) {
      cortado = "se acabo el tiempo";
      break;
    }
    const r = await _porLaPuerta("track",
        {orderNumber: item.guia, orderCode: item.codigo});
    consultadas++;
    if (!r.ok) {
      fallidas++;
      const m = r.motivo || "DESCONOCIDO";
      motivos[m] = (motivos[m] || 0) + 1;
      // La puerta se cerro: seguir seria pedirle a un servicio caido 60 veces
      // mas que nos diga que sigue caido.
      if (r.motivo === "PUERTA_CERRADA" || r.motivo === "APAGADA") {
        cortado = r.motivo;
        break;
      }
      await new Promise((res) => setTimeout(res, PAUSA_MS));
      continue;
    }
    const traducido = shalomPuerta.traducir("track", r.json);
    const cambios = barrido.cambiosDe(porId[item.id], traducido, modo);
    if (cambios) {
      escrituras.push({id: item.id, campos: cambios.campos});
      if (detalle.length < TOPE_DETALLE) {
        detalle.push({
          nombre: item.nombre, guia: item.guia,
          de: porId[item.id].status || "",
          a: cambios.etiqueta || porId[item.id].status || "",
          shalom: traducido.estado,
          movio: !!cambios.etiqueta,
        });
      }
    }
    await new Promise((res) => setTimeout(res, PAUSA_MS));
  }

  // 4 · escribir (o no, si es simulacro)
  let escritas = 0;
  if (!simulacro && escrituras.length) {
    for (let i = 0; i < escrituras.length; i += 400) {
      const lote = db.batch();
      escrituras.slice(i, i + 400).forEach((w) => {
        lote.set(db.doc(SHIP_COL + "/" + w.id), w.campos, {merge: true});
      });
      try {
        await lote.commit();
        escritas += Math.min(400, escrituras.length - i);
      } catch (e) {
        console.error("barrido: fallo una tanda de escritura:", e);
      }
    }
    // Que el panel se entere de que hay datos nuevos sin releerlo todo.
    try {
      await db.doc(CFG_DOC).set({ts: Date.now()}, {merge: true});
    } catch (e) {/* el latido se encargara */}
  }

  // 5 · el informe. Es lo unico que se ve desde Config, asi que dice TODO:
  //     a cuantos no se les pregunto y por que, no solo lo que cambio.
  const informe = {
    ts: Date.now(), hora: ahoraLocal, forzado: !!forzado,
    modo: modo, simulacro: simulacro,
    candidatos: sel.consultar.length, consultadas: consultadas,
    fallidas: fallidas, motivos: motivos,
    conCambio: escrituras.length, escritas: escritas,
    movidas: escrituras.filter((w) => w.campos.status).length,
    saltados: sel.saltados, guiasMalas: sel.guiasMalas.slice(0, 20),
    cortado: cortado, duracionMs: Date.now() - arranque,
    detalle: detalle,
  };
  try {
    await db.doc(BARRIDO_DOC).set({ultima: informe}, {merge: true});
  } catch (e) {
    console.error("barrido: no se pudo guardar el informe:", e);
  }
  console.log("barrido", JSON.stringify({
    hora: ahoraLocal, consultadas, conCambio: escrituras.length,
    escritas, simulacro, cortado, forzado: !!forzado,
  }));
  return informe;
}

// El horario. Cada 30 min pregunta; _correrBarrido decide si le toca.
exports.barridoShalom = onSchedule({
  schedule: "*/30 * * * *",
  timeZone: barrido.ZONA,
  region: "us-central1",
  secrets: [SHALOM_API_KEY],
  timeoutSeconds: 540,
  memory: "512MiB",
  // Un barrido perdido se recupera en el horario siguiente; uno repetido
  // consultaria todo dos veces.
  retryCount: 0,
}, async () => {
  await _correrBarrido(false);
});

// ── barridoAhora ──────────────────────────────────────────────────────────
// El mismo barrido, a peticion. Sirve para ver el informe sin esperar a las
// 19:00, y despues para forzar una actualizacion cuando hace falta.
// Mismas barreras que la puerta: POST, token valido y correo de administrador.
exports.barridoAhora = onRequest({
  region: "us-central1",
  secrets: [SHALOM_API_KEY],
  timeoutSeconds: 540,
  memory: "512MiB",
}, async (req, res) => {
  setCORS(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ok: false, motivo: "NO_PERMITIDO"});
    return;
  }
  const authz = req.get("Authorization") || "";
  const bearer = authz.match(/^Bearer\s+(.+)$/i);
  if (!bearer) {
    res.status(401).json({ok: false, motivo: "SIN_SESION"});
    return;
  }
  let tok;
  try {
    tok = await getAuth().verifyIdToken(bearer[1]);
  } catch (e) {
    res.status(401).json({ok: false, motivo: "SIN_SESION"});
    return;
  }
  // Misma regla que la puerta: el correo solo vale si esta verificado.
  if (!shalomPuerta.esAdminDe(tok, ADMINS)) {
    res.status(403).json({ok: false, motivo: "SIN_PERMISO"});
    return;
  }
  try {
    const informe = await _correrBarrido(true);
    if (!informe) {
      res.status(200).json({ok: false, motivo: "BARRIDO_APAGADO"});
      return;
    }
    res.status(200).json({ok: true, informe: informe});
  } catch (e) {
    console.error("barridoAhora error:", e);
    res.status(200).json({ok: false, motivo: "ERROR_SHALOM",
      detalle: shalomPuerta.sanear(e && e.message)});
  }
});


// ── shalomPuerta ───────────────────────────────────────────────────────────
// POST {op}  →  la unica via del panel hacia Shalom.
//
// CUATRO BARRERAS, en este orden y todas obligatorias:
//   1. POST con token de Firebase Auth valido        → si no: SIN_SESION
//   2. Correo en ADMINS (la misma lista que las reglas) → si no: SIN_PERMISO
//   3. La operacion esta en la lista blanca          → si no: NO_PERMITIDO
//   4. Recien entonces se usa la clave, del lado servidor
//
// Los codigos HTTP son de las BARRERAS (401/403/405). Lo que pase con Shalom
// viaja siempre en 200 con {ok:false, motivo}: para el panel, "Shalom dijo que
// no" no es un error de transporte, y mezclarlos fue lo que hizo que un fallo
// de sesion se leyera como "tu plan vencio".
//
// Operaciones de hoy:
//   {op:"validate"}                        → {ok, valida, limite, usado, …}
//   {op:"esquema", de:"validate"}          → la FORMA, sin valores
//   {op:"esquema", de:"track", datos:{…}}  → idem, para medir /track
//
// `track` esta en la lista pero marcado `soloMedir`: se puede medir y todavia
// no usar. Pedirlo como operacion normal responde SIN_TRADUCTOR.
exports.shalomPuerta = onRequest(
    {region: "us-central1", secrets: [SHALOM_API_KEY], timeoutSeconds: 60},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      // Las cuatro barreras viven en shalomPuerta.js para poder probarlas.
      const paso = await shalomPuerta.barreras({
        metodo: req.method,
        authorization: req.get("Authorization"),
        cuerpo: req.body,
      }, {
        verificar: (t) => getAuth().verifyIdToken(t),
        admins: ADMINS,
      });
      if (paso.corte) {
        res.status(paso.corte.http)
            .json({ok: false, motivo: paso.corte.motivo});
        return;
      }
      const destino = paso.destino;
      const diagnostico = paso.diagnostico;

      // 4 · el interruptor y la llamada, por el camino unico.
      try {
        const r = await _porLaPuerta(destino, paso.datos, diagnostico);
        if (!r.ok) {
          res.status(200).json({
            ok: false, motivo: r.motivo, detalle: r.detalle,
            http: r.http, reabre: r.reabre,
          });
          return;
        }
        if (diagnostico) {
          // Solo tipos, ni un valor: asi se escribe el contrato contra lo que
          // la API devuelve de verdad sin que salga un dato de nadie.
          res.status(200).json({ok: true, de: destino,
            forma: shalomPuerta.forma(r.json)});
          return;
        }
        res.status(200).json(shalomPuerta.traducir(destino, r.json));
      } catch (e) {
        console.error("shalomPuerta error:", e);
        res.status(200).json({
          ok: false,
          motivo: "ERROR_SHALOM",
          detalle: shalomPuerta.sanear(e && e.message),
        });
      }
    },
);
