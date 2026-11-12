"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue, Timestamp} =
    require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getAppCheck} = require("firebase-admin/app-check");
const {getStorage} = require("firebase-admin/storage");
const crypto = require("crypto");

const comprobante = require("./comprobante");
const clienteLookup = require("./clienteLookup");
const {normalizarOlva} = require("./olvaNormalizar");
const shalomPuerta = require("./shalomPuerta");
const interruptor = require("./interruptor");
const webhook = require("./webhook");
const barrido = require("./barrido");
const limpieza = require("./limpieza");
const etiquetas = require("./etiquetas");
const agencias = require("./agencias");
const pedidoPublico = require("./pedidoPublico");
const enlace = require("./enlaceSeguimiento");
const registroShalom = require("./registroShalom");
const nroComp = require("./nroComprobante");
const ticketShalom = require("./ticketShalom");
const cuentaShalom = require("./cuentaShalom");
const reniecPublico = require("./reniecPublico");
const credenciales = require("./credenciales");

setGlobalOptions({maxInstances: 10});
initializeApp();
const db = getFirestore();

const CFG_DOC = "panel/config";
const SHIP_COL = "panel/shipments/items";

const SYNC_V = 1;
function _conMts(campos) {
  return Object.assign({}, campos, {_mts: FieldValue.serverTimestamp()});
}
const TOK_COL = "panel/tokens/items";
const FORMCFG_COL = "panel/forms/configs";

const SHALOM_API_KEY = defineSecret("SHALOM_API_KEY");

const SHALOM_WEBHOOK_SECRET = defineSecret("SHALOM_WEBHOOK_SECRET");

let _smCliente = null;
function _sm() {
  if (!_smCliente) {
    const {SecretManagerServiceClient} =
      require("@google-cloud/secret-manager");
    _smCliente = new SecretManagerServiceClient();
  }
  return _smCliente;
}

async function _proyecto() {
  try {
    const p = await _sm().getProjectId();
    if (p) return String(p);
  } catch (e) {
  }
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
    (JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId) || "";
}

async function _leerSecreto(nombre) {
  const [v] = await _sm().accessSecretVersion({
    name: `projects/${await _proyecto()}/secrets/${nombre}/versions/latest`,
  });
  return v.payload.data.toString("utf8");
}

async function _escribirSecreto(nombre, valor) {
  const padre = `projects/${await _proyecto()}`;
  try {
    await _sm().createSecret({parent: padre, secretId: nombre,
      secret: {replication: {automatic: {}}}});
  } catch (e) {
  }
  await _sm().addSecretVersion({
    parent: `${padre}/secrets/${nombre}`,
    payload: {data: Buffer.from(String(valor), "utf8")},
  });
}

const ADMINS = [
  "jarryllanoski@gmail.com",
  "redbolima@gmail.com",
];

async function _porLaPuerta(destino, datos, diagnostico) {
  const estado = await _leerPuerta();
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

async function _seguimientoPro(guia, memo) {
  const m = memo || {};
  if (m.filas === undefined) {
    m.filas = null;
    try {
      const c = await db.doc(CFG_DOC).get();
      const cfg = c.exists ? c.data() : {};
      const id = (cfg.shalomInstancia && cfg.shalomInstancia.id) || "";
      const filas = [];
      for (let pg = 1; id && pg <= 10; pg++) {
        const r = await _porLaPuerta("trackingList",
            {instanceId: id, page: String(pg)});
        if (!r || !r.ok) break;
        const f = shalomPuerta.filasDe(r.json);
        f.forEach((x) => filas.push(x));
        const meta = (r.json && r.json.data && r.json.data.meta) || {};
        if (!f.length || pg >= (Number(meta.last_page) || 1)) break;
      }
      m.filas = filas;
    } catch (e) {
      console.warn("seguimientoPro:", e && e.message);
    }
  }
  return shalomPuerta.deSeguimientoPro(m.filas, guia);
}

async function _esPendiente(guia, memo) {
  const m = memo || {};
  if (m.lista === undefined) {
    m.lista = null;
    try {
      const c = await db.doc(CFG_DOC).get();
      const cfg = c.exists ? c.data() : {};
      const id = (cfg.shalomInstancia && cfg.shalomInstancia.id) || "";
      if (id) {
        const pr = await _porLaPuerta("pendientes", {instanceId: id});
        m.lista = (pr && pr.ok && pr.json) || null;
      }
    } catch (e) {
      console.warn("pendientes:", e && e.message);
    }
  }
  if (!m.lista) return null;
  return registroShalom.enPendientes(m.lista, guia);
}

async function _contarFalloDeServicio() {
  const estado = await _leerPuerta();
  const cambios = interruptor.tras(estado, {ok: false,
    motivo: "ERROR_SHALOM"}, Date.now(), false);
  if (cambios) await _guardarPuerta(cambios);
}

async function _voucherPorLaPuerta(datos) {
  const estado = await _leerPuerta();
  const llave = interruptor.decidir(estado, Date.now(), false);
  if (!llave.pasa) {
    return {ok: false, motivo: llave.motivo, reabre: llave.reabre};
  }
  const r = await shalomPuerta.descargarVoucher(SHALOM_API_KEY.value(), datos);
  const cambios = interruptor.tras(estado, r, Date.now(), llave.probando);
  if (cambios) await _guardarPuerta(cambios);
  return r;
}

async function _subirAlBucket(ruta, bytes, tipo) {
  const bucket = getStorage().bucket();
  const token = crypto.randomUUID();
  await bucket.file(ruta).save(bytes, {
    resumable: false,
    contentType: tipo,
    metadata: {metadata: {firebaseStorageDownloadTokens: token}},
  });
  return "https://firebasestorage.googleapis.com/v0/b/" + bucket.name +
    "/o/" + encodeURIComponent(ruta) + "?alt=media&token=" + token;
}

const PUERTA_DOC = "panel/shalom";
const PUERTA_FRESCA_MS = 15000;
let _puerta = {estado: null, ts: 0};

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
    console.warn("puerta: no se pudo leer el estado:", e && e.message);
  }
  _puerta = {estado: interruptor.normalizar(doc), ts: ahora};
  return _puerta.estado;
}

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

const ALLOWED_ORIGINS = [
  "https://jarryllanoski.github.io",
  "https://total-tools-24ce8.web.app",
  "https://total-tools-24ce8.firebaseapp.com",
];
const LOCALHOST_ORIGIN_RE = /^http:\/\/localhost(:\d+)?$/;

function setCORS(req, res) {
  const origin = req.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_ORIGIN_RE.test(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck");
}

exports.formApi = onRequest(
    {secrets: [SHALOM_API_KEY]},
    async (req, res) => {
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
        else if (action === "reniec") await handleReniec(req, res);
        else {
          res.status(400).json(
              {status: "error", error: "Acción desconocida"});
        }
      } catch (e) {
        console.error("formApi error:", action, e);
        res.status(500).json({
          status: "error",
          error: "Ocurrió un error temporal. Intenta nuevamente.",
        });
      }
    });

const ORDER_FIELDS = [
  "id", "name", "phone", "address", "gpsCoords", "referencia",
  "dniRecoger", "ciudadDestino", "dniDestinatario", "encAgencia",
  "courier", "date", "status", "cost", "notes", "extra",
  "docGuia", "docEmbalado", "docComprobante", "links",
  "sel", "chkGuia", "chkEmbalado", "chkComprobante",
  "createdAt", "fromForm", "dni",
  "agenciaId", "agenciaNombre", "agenciaGeo", "agenciaCourier",
];

const FIELD_MAX = {
  name: 120, phone: 20, dni: 12, dniRecoger: 12, dniDestinatario: 12,
  cost: 20, courier: 60, date: 30, status: 60, encAgencia: 200,
  ciudadDestino: 120, address: 600, referencia: 300, notes: 600,
  gpsCoords: 60, id: 60, createdAt: 40,
  agenciaId: 10, agenciaNombre: 120, agenciaGeo: 200, agenciaCourier: 20,
};
const DEFAULT_MAX = 600;

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
  if (!agencias.idValido(out.agenciaId) ||
      !agencias.courierDe(out.agenciaCourier)) {
    agencias.CAMPOS.forEach((k) => delete out[k]);
  }
  return out;
}

const ID_RE = /^[A-Za-z0-9_-]{2,64}$/;

async function handleCreate(req, res) {
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

  let tokData = null;
  if (tokenId) {
    if (!ID_RE.test(tokenId)) {
      res.status(400).json({status: "error", error: "Token inválido"});
      return;
    }
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
  const trackToken = enlace.generar();

  const orderToSave = Object.assign({}, pickOrderFields(order), {
    status: order.status || "NUEVO PEDIDO",
    createdAt: order.createdAt || new Date().toISOString(),
    fromForm: true,
    trackToken,
  });

  try {
    const _d = reniecPublico.normalizar(orderToSave.dni);
    if (_d) {
      const _c = await db.doc("panel/reniec/items/" + _d).get();
      const _p = _c.exists ? _c.data() : null;
      if (_p && String(_p.nombres || "").trim()) {
        orderToSave.reniec = {
          dni: _d,
          nombres: _p.nombres,
          apePaterno: _p.apePaterno || "",
          apeMaterno: _p.apeMaterno || "",
        };
      }
    }
  } catch (e) {
    console.warn("create: no se pudo adjuntar reniec:", e && e.message);
  }

  if (tokData && (tokData.monto || tokData.adelanto)) {
    const monto = Number(tokData.monto) || 0;
    const adelanto = Number(tokData.adelanto) || 0;
    const deuda = Math.max(0, monto - adelanto);
    orderToSave.monto = String(tokData.monto || "");
    orderToSave.adelanto = String(tokData.adelanto || "");
    orderToSave.cost = deuda > 0 ? String(deuda) : "";
  }

  const nroComprobante = tokData ? nroComp.de(tokData) : "";
  if (nroComprobante) orderToSave.nroComprobante = nroComprobante;

  const tokRef = tokenId ? db.doc(`${TOK_COL}/${tokenId}`) : null;
  let orderId = "";
  let trackCode = "";
  for (let intento = 0; intento < 5 && !orderId; intento++) {
    const id = `id_${now + intento}`;
    const code = id.slice(-4).toUpperCase();
    const shipRef = db.doc(`${SHIP_COL}/${id}`);
    const r = await db.runTransaction(async (tx) => {
      const [ts, ss] = await Promise.all([
        tokRef ? tx.get(tokRef) : Promise.resolve(null),
        tx.get(shipRef),
      ]);
      if (tokRef && (!ts.exists || ts.data().used)) return "usado";
      if (ss.exists) return "ocupado";
      tx.create(shipRef, _conMts(Object.assign({}, orderToSave, {id: id})));
      if (tokRef) {
        tx.set(tokRef, {
          used: true,
          orderId: id,
          trackCode: code,
          clientName: order.name,
          usedAt: new Date().toISOString(),
        }, {merge: true});
      }
      tx.set(db.doc(CFG_DOC), {ts: now, formTs: now, syncV: SYNC_V},
          {merge: true});
      return "ok";
    });
    if (r === "usado") {
      res.status(400).json({status: "error", error: "Token ya utilizado"});
      return;
    }
    if (r === "ok") {
      orderId = id;
      trackCode = code;
    }
  }
  if (!orderId) throw new Error("create: 5 ids seguidos ocupados");

  const resp = {status: "ok", orderId, trackCode, trackToken};
  if (nroComprobante) resp.nroComprobante = nroComprobante;
  res.json(resp);
}

async function handleToken(req, res) {
  const tokenId = (req.query.t || "").trim();
  if (!ID_RE.test(tokenId)) {
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
  const cfgId = /^[A-Za-z0-9_-]{6,40}$/.test(String(d.cfgId || "")) ?
    String(d.cfgId) : "";
  const out = {
    status: "valid",
    prefillName: d.prefillName || "",
    prefillPhone: d.prefillPhone || "",
    prefillLink: d.prefillLink || "",
    cfgId: cfgId,
  };
  try {
    if (cfgId) {
      const c = await db.doc(`${FORMCFG_COL}/${cfgId}`).get();
      if (c.exists) out.cfg = soloCampos(c.data(), FORMCFG_PUBLICO);
    }
    if (!out.cfg || !telefonoDe(out.cfg)) out.vivo = await configViva();
  } catch (e) {
    console.warn("token: sin config adjunta:", e && e.message);
  }
  res.json(out);
}

function telefonoDe(c) {
  return String((c && (c.phone || (c.config && c.config.phone))) || "")
      .trim();
}

async function configViva() {
  const snap = await db.doc(CFG_DOC).get();
  const d = snap.exists ? snap.data() : {};
  return {
    config: configPublica(d.config),
    couriers: d.couriers || [],
    courierActive: d.courierActive || {},
    courierTypes: d.courierTypes || {},
    dispatch: d.dispatch || {},
    extraFields: d.extraFields || [],
  };
}

async function handleConfig(req, res) {
  res.json(await configViva());
}

async function handleFormCfg(req, res) {
  const id = (req.query.id || "").trim();
  if (!ID_RE.test(id)) return res.status(400).json({error: "missing id"});
  const snap = await db.doc(`${FORMCFG_COL}/${id}`).get();
  if (!snap.exists) return res.status(404).json({error: "not found"});
  res.json(soloCampos(snap.data(), FORMCFG_PUBLICO));
}

const CONFIG_PUBLICA = ["name", "phone", "city"];
const FORMCFG_PUBLICO = ["name", "city", "phone", "couriers", "courierActive",
  "courierTypes", "dispatch", "extraFields", "createdAt"];

function soloCampos(src, claves) {
  const out = {};
  const o = src || {};
  claves.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
  });
  return out;
}

function configPublica(c) {
  return soloCampos(c, CONFIG_PUBLICA);
}

async function _tokenDeEseCelular(t, phone) {
  const id = String(t || "").trim();
  if (!ID_RE.test(id)) return false;
  try {
    const s = await db.doc(`${TOK_COL}/${id}`).get();
    if (!s.exists) return false;
    const d = s.data() || {};
    if (d.used) return false;
    const tp = String(d.prefillPhone || d.phone || "").replace(/\D/g, "")
        .slice(-9);
    return tp.length === 9 && tp === phone;
  } catch (e) {
    return false;
  }
}

async function handleClient(req, res) {
  res.set("Cache-Control", "no-store");
  const vacio = () => res.json({});

  if (!(await checkRateLimit("formApi_client", req))) return vacio();

  const phone = String(req.query.phone || "").replace(/\D/g, "").slice(-9);
  if (phone.length !== 9) return vacio();

  try {
    const snap = await db.collection(SHIP_COL)
        .where("phone", "==", phone).limit(50).get();
    if (snap.empty) return vacio();

    const pedidos = [];
    snap.forEach((d) => pedidos.push(d.data()));

    const cli = clienteLookup.elegirCliente(pedidos, Date.now());
    if (!cli) return vacio();
    if (await _tokenDeEseCelular(req.query.t, phone)) return res.json(cli);
    return res.json({name: String(cli.name || "").split(/\s+/)[0] || "",
      parcial: true});
  } catch (e) {
    console.error("handleClient error:", e);
    return vacio();
  }
}

async function appCheckOk(req) {
  const t = req.get("X-Firebase-AppCheck") || "";
  if (!t) return false;
  try {
    await getAppCheck().verifyToken(t);
    return true;
  } catch (e) {
    console.warn("appCheck rechazado:", (e && e.message) || e);
    return false;
  }
}

async function handleReniec(req, res) {
  res.set("Cache-Control", "no-store");
  const no = (motivo, detalle) =>
    res.json({ok: false, motivo: motivo, detalle: detalle || ""});

  if (!(await checkRateLimit("formApi_reniec", req))) {
    return no("MUCHAS_CONSULTAS", "Espera un momento e intenta de nuevo.");
  }

  const dni = reniecPublico.normalizar(req.query.dni);
  const ahora = Date.now();
  const dia = reniecPublico.diaDe(ahora);
  const refCache = db.doc("panel/reniec/items/" + (dni || "x"));
  const refDia = db.doc("panel/reniec/dias/" + dia);

  let cache = null;
  let hoy = 0;
  try {
    const [c, d] = await Promise.all([
      dni ? refCache.get() : Promise.resolve(null),
      refDia.get(),
    ]);
    cache = (c && c.exists) ? c.data() : null;
    hoy = (d.exists && Number(d.data().consultas)) || 0;
  } catch (e) {
    console.warn("reniec: no se pudo leer caché/contador:", e && e.message);
  }

  const plan = reniecPublico.decidir({
    dni: dni,
    appCheck: await appCheckOk(req),
    cache: cache,
    consultasHoy: hoy,
    ahora: ahora,
  });

  if (plan.accion === "rechazar") return no(plan.motivo, plan.detalle);
  if (plan.accion === "cache") {
    return res.json({ok: true, persona: _reniecFuera(plan.persona),
      deCache: true});
  }

  try {
    await refDia.set({consultas: FieldValue.increment(1), dia: dia},
        {merge: true});
  } catch (e) {
    console.warn("reniec: no se pudo contar:", e && e.message);
  }

  const intentar = async () => {
    try {
      return reniecPublico.resultado(
          await shalomPuerta.llamar("dni", SHALOM_API_KEY.value(), {dni: dni}),
          (j) => shalomPuerta.traducir("dni", j));
    } catch (e) {
      console.error("reniec: llamada falló:", e && e.message);
      return {ok: false, motivo: "SIN_RED"};
    }
  };
  let x = await intentar();
  if (!x.ok && reniecPublico.esTemporal(x.motivo) && x.motivo !== "LIMITE") {
    await new Promise((z) => setTimeout(z, 600));
    try {
      await refDia.set({consultas: FieldValue.increment(1), dia: dia},
          {merge: true});
    } catch (e) {
      console.warn("reniec: no se pudo contar el reintento:", e && e.message);
    }
    x = await intentar();
  }
  if (!x.ok) {
    return no(x.motivo, x.motivo === "NO_ENCONTRADO" ?
      "No encontramos ese DNI. Revisa los 8 dígitos o escribe tu nombre." :
      "No pudimos consultar ahora. Intenta de nuevo o escribe tu nombre.");
  }
  const guardar = reniecPublico.guardable(x.persona, ahora);
  if (!guardar) {
    return no("NO_ENCONTRADO", "No encontramos ese DNI. Escribe tu nombre.");
  }
  try {
    await refCache.set(guardar, {merge: true});
  } catch (e) {
    console.warn("reniec: no se pudo guardar en caché:", e && e.message);
  }
  return res.json({ok: true, persona: _reniecFuera(guardar)});
}

function _reniecFuera(p) {
  const o = p || {};
  return {
    nombres: o.nombres || "",
    apePaterno: o.apePaterno || "",
    apeMaterno: o.apeMaterno || "",
    completo: o.completo || "",
  };
}

async function handleTrack(req, res) {
  const trackToken = (req.query.token || "").trim();
  if (!trackToken) {
    res.json({status: "error", error: "Token requerido"});
    return;
  }

  const tipo = enlace.tipoDe(trackToken);
  if (tipo === "invalido") {
    res.json({status: "not_found"});
    return;
  }

  if (!(await checkRateLimit("formApi_track", req))) {
    res.status(429).json({
      status: "rate_limited",
      error: "Demasiadas consultas. Espera un momento y vuelve a intentar.",
    });
    return;
  }

  let snap = null;
  if (tipo === "legado") {
    snap = await db.doc(`${SHIP_COL}/${trackToken}`).get();
    if (!snap.exists) snap = null;
  } else {
    const q = await db.collection(SHIP_COL)
        .where("trackToken", "==", trackToken).limit(1).get();
    snap = q.empty ? null : q.docs[0];
  }
  if (!snap) {
    res.json({status: "not_found"});
    return;
  }

  const order = snap.data();

  if (tipo === "legado" && !enlace.aceptaLegado(order)) {
    res.json({status: "not_found"});
    return;
  }
  const code = (order.id || "").slice(-4).toUpperCase();
  const frozen = ["ENTREGADO", "CANCELADO", "FINALIZADO"]
      .includes(String(order.status || "").trim().toUpperCase());

  const safe = pedidoPublico.minimizarViejo(
      pedidoPublico.proyectar(order, {code, frozen}), order, Date.now());

  if (order.trackingStatus && !safe.minimo) {
    const cfgSnap = await db.doc(CFG_DOC).get();
    const cfg = (cfgSnap.exists && cfgSnap.data().config) || {};
    if (!cfg.trackingWebMostrarCliente) {
      ["trackingStatus", "trackingMessage", "trackingLastUpdate"]
          .forEach((k) => delete safe[k]);
    }
  }
  res.json({status: "ok", order: safe});
}

const RATE_LIMITS = {
  agenciasOlva: {windowMs: 60000, max: 100},
  formApi_create: {windowMs: 60000, max: 10},
  formApi_client: {windowMs: 60000, max: 20},
  formApi_track: {windowMs: 60000, max: 120, memoria: true},
  formApi_reniec: {windowMs: 60000, max: 10},
};

const _frenoMem = new Map();
let _frenoMemVentana = 0;

function _frenoMemoria(clave, ventana, max) {
  if (ventana !== _frenoMemVentana) {
    _frenoMem.clear();
    _frenoMemVentana = ventana;
  }
  const n = (_frenoMem.get(clave) || 0) + 1;
  _frenoMem.set(clave, n);
  return n <= max;
}

async function checkRateLimit(name, req) {
  const cfg = RATE_LIMITS[name];
  const forwarded = req.get("x-forwarded-for") || req.ip || "unknown";
  const ip = forwarded.split(",")[0].trim();
  const windowStart = Math.floor(Date.now() / cfg.windowMs) * cfg.windowMs;
  if (cfg.memoria) return _frenoMemoria(name + "|" + ip, windowStart, cfg.max);
  const docId = (name + "_" + ip + "_" + windowStart)
      .replace(/[^A-Za-z0-9_]/g, "_");
  const ref = db.doc("panel/rateLimits/items/" + docId);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const count = snap.exists ? (snap.data().count || 0) : 0;
      if (count >= cfg.max) return false;
      tx.set(ref, {count: count + 1, windowStart: windowStart,
        rlExpira: new Date(windowStart + 3600 * 1000)}, {merge: true});
      return true;
    });
  } catch (e) {
    console.error("checkRateLimit error:", name, e);
    return true;
  }
}

const OLVA_STORES_URL =
  "https://www.olvacourier.com/wp-admin/admin-ajax.php?action=get_olva_stores";

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
          await ref.set(_conMts({extraccion: {
            estado: "error", urlHash: urlHash, parserVersion: PV,
            errorMensaje: r.motivo || "", procesadoEn: new Date().toISOString(),
          }}), {merge: true});
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
        const tenia = Array.isArray(s.cotizItems) && s.cotizItems.length;
        if (!tenia) write.cotizItems = cotizItems;
        await ref.set(_conMts(write), {merge: true});
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

const WEB_DOC = "panel/webhook";
const WEB_COL = "panel/webhook/eventos";

const WEBHOOK_ACTIVO = false;

const _shalomWebhook = onRequest({
  region: "us-central1",
  secrets: [SHALOM_WEBHOOK_SECRET],
  timeoutSeconds: 30,
  memory: "256MiB",
}, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("no");
    return;
  }

  const firma = req.get("X-Shalom-Signature") || "";
  const crudo = req.rawBody;
  const v = webhook.verificarFirma(
      firma, crudo, SHALOM_WEBHOOK_SECRET.value(), Date.now());

  if (!v.ok) {
    console.warn("webhook rechazado:", v.motivo);
    try {
      await db.doc(WEB_DOC).set({
        rechazados: FieldValue.increment(1),
        ultimoRechazo: {ts: Date.now(), motivo: v.motivo},
      }, {merge: true});
    } catch (e) {
    }
    res.status(401).send("no");
    return;
  }

  const id = webhook.idDeEvento(firma);
  try {
    await db.doc(WEB_COL + "/" + id).create({recibido: Date.now()});
  } catch (e) {
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

if (WEBHOOK_ACTIVO) exports.shalomWebhook = _shalomWebhook;

const BARRIDO_DOC = "panel/barrido";
const PAUSA_MS = 300;
const TOPE_MS = 450000;
const TOPE_DETALLE = 60;

async function _correrBarrido(forzado) {
  const arranque = Date.now();

  let cfg = {};
  try {
    const snap = await db.doc(CFG_DOC).get();
    cfg = (snap.exists && snap.data()) || {};
  } catch (e) {
    console.error("barrido: no se pudo leer la configuracion:", e);
    return null;
  }
  const b = (cfg.config && cfg.config.barrido) || {};
  if (b.activo === false) return null;
  const horas = barrido.parseHoras(b.horas);
  const ahoraLocal = barrido.horaLocal(new Date());
  if (!forzado && !barrido.tocaAhora(horas, ahoraLocal)) return null;

  const modo = String(b.modo || etiquetas.MODOS.SEMI);

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

  const escrituras = [];
  const detalle = [];
  let consultadas = 0; let fallidas = 0; let cortado = "";
  const memoPend = {};
  const memoPro = {};
  let porPro = 0;
  let porDejar = 0;
  const motivos = {};
  for (const item of sel.consultar) {
    if (Date.now() - arranque > TOPE_MS) {
      cortado = "se acabo el tiempo";
      break;
    }
    const r = await _porLaPuerta("track",
        {orderNumber: item.guia, orderCode: item.codigo});
    consultadas++;
    const pro = (!r.ok && r.motivo === "SHALOM_SIN_RESPUESTA") ?
      await _seguimientoPro(item.guia, memoPro) : null;
    const sinRastro = !r.ok && r.motivo === "NO_ENCONTRADO";
    if (sinRastro && (item.porDejar ||
        await _esPendiente(item.guia, memoPend) === true)) {
      porDejar++;
      await new Promise((res) => setTimeout(res, PAUSA_MS));
      continue;
    }
    if (sinRastro && item.conMovimiento) await _contarFalloDeServicio();
    if (!r.ok && !pro) {
      fallidas++;
      const m = r.motivo || "DESCONOCIDO";
      motivos[m] = (motivos[m] || 0) + 1;
      if (r.motivo === "PUERTA_CERRADA" || r.motivo === "APAGADA") {
        cortado = r.motivo;
        break;
      }
      await new Promise((res) => setTimeout(res, PAUSA_MS));
      continue;
    }
    if (pro) porPro++;
    const traducido = pro || shalomPuerta.traducir("track", r.json);
    if (!traducido.ok && traducido.motivo === "SOLO_REGISTRADO") porDejar++;
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

  let escritas = 0;
  if (escrituras.length) {
    for (let i = 0; i < escrituras.length; i += 400) {
      const lote = db.batch();
      escrituras.slice(i, i + 400).forEach((w) => {
        lote.set(db.doc(SHIP_COL + "/" + w.id), _conMts(w.campos),
            {merge: true});
      });
      try {
        await lote.commit();
        escritas += Math.min(400, escrituras.length - i);
      } catch (e) {
        console.error("barrido: fallo una tanda de escritura:", e);
      }
    }
    try {
      await db.doc(CFG_DOC).set({ts: Date.now(), syncV: SYNC_V},
          {merge: true});
    } catch (e) {}
  } else {
    try {
      await db.doc(CFG_DOC).set({syncV: SYNC_V}, {merge: true});
    } catch (e) {}
  }

  const informe = {
    ts: Date.now(), hora: ahoraLocal, forzado: !!forzado,
    modo: modo,
    candidatos: sel.consultar.length, consultadas: consultadas,
    fallidas: fallidas, motivos: motivos, porDejar: porDejar, porPro: porPro,
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
    escritas, cortado, forzado: !!forzado,
  }));
  return informe;
}

exports.limpiezaLapidas = onSchedule({
  schedule: "17 3 * * *",
  timeZone: barrido.ZONA,
  region: "us-central1",
  timeoutSeconds: 300,
  retryCount: 0,
}, async () => {
  const r = await limpieza.limpiarLapidas(db, Date.now(),
      (ms) => Timestamp.fromMillis(ms));
  console.log("limpiezaLapidas:", JSON.stringify(r));
});

exports.barridoShalom = onSchedule({
  schedule: "*/30 * * * *",
  timeZone: barrido.ZONA,
  region: "us-central1",
  secrets: [SHALOM_API_KEY],
  timeoutSeconds: 540,
  memory: "512MiB",
  retryCount: 0,
}, async () => {
  await _correrBarrido(false);
});

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

exports.shalomPuerta = onRequest(
    {region: "us-central1", secrets: [SHALOM_API_KEY], timeoutSeconds: 120},
    async (req, res) => {
      setCORS(req, res);
      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

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
      if (paso.orquestar === "registrarEnvio" ||
          paso.orquestar === "recuperarEnvio") {
        try {
          const cfgSnap = await db.doc(CFG_DOC).get();
          const cfgDoc = cfgSnap.exists ? cfgSnap.data() : {};
          const pid = String((paso.datos && paso.datos.pedidoId) || "").trim();
          const ref = db.doc(`${SHIP_COL}/${pid}`);
          const depsReg = {
            leerPedido: async () => {
              if (enlace.tipoDe(pid) === "invalido") return null;
              const s2 = await ref.get();
              return s2.exists ? s2.data() : null;
            },
            leerConfig: async () => registroShalom.configDe(cfgDoc),
            llamar: (c) => _porLaPuerta("register", c),
            pendientes: async () => {
              const pr = await _porLaPuerta("pendientes", {
                instanceId: (cfgDoc.shalomInstancia &&
                  cfgDoc.shalomInstancia.id) || ""});
              return (pr && pr.ok && pr.json) || null;
            },
            borrarPendiente: (guia) => _porLaPuerta("borrarPendiente", {
              instanceId: (cfgDoc.shalomInstancia &&
                cfgDoc.shalomInstancia.id) || "",
              guia: guia}),
            guardar: (campos) => ref.set(_conMts(campos), {merge: true}),
            rastrear: async (guia, codigo) => {
              const rt = await _porLaPuerta("track",
                  {orderNumber: guia, orderCode: codigo || ""});
              if (!rt || !rt.ok) {
                return {ok: false, motivo: (rt && rt.motivo) || "SIN_RED"};
              }
              return shalomPuerta.traducir("track", rt.json);
            },
          };
          const salida2 = paso.orquestar === "recuperarEnvio" ?
            await registroShalom.recuperarEnvio(paso.datos, depsReg) :
            await registroShalom.orquestar(paso.datos, depsReg,
                {simulacro: cfgDoc.shalomRegistroSimulacro !== false});
          res.status(200).json(salida2);
        } catch (e) {
          console.error("registrarEnvio:", e);
          res.status(200).json({ok: false, estado: "duda",
            motivo: "ERROR_SHALOM",
            detalle: "Algo se rompio a mitad y NO SABEMOS si el envio llego " +
              "a crearse. Verifica en pro.shalom.pe antes de reintentar."});
        }
        return;
      }

      if (paso.orquestar === "jalarTicket") {
        try {
          const pid = String((paso.datos && paso.datos.pedidoId) || "").trim();
          const ok = ticketShalom.ID_PEDIDO.test(pid);
          const ref = ok ? db.doc(`${SHIP_COL}/${pid}`) : null;
          const salida4 = await ticketShalom.jalar(paso.datos, {
            leerPedido: async () => {
              if (!ref) return null;
              const s4 = await ref.get();
              return s4.exists ? s4.data() : null;
            },
            instancia: async () => {
              const c5 = await db.doc(CFG_DOC).get();
              const cfg5 = c5.exists ? c5.data() : {};
              return (cfg5.shalomInstancia && cfg5.shalomInstancia.id) || "";
            },
            descargar: _voucherPorLaPuerta,
            esPendiente: (g) => _esPendiente(g),
            subir: _subirAlBucket,
            guardar: async (campos) => {
              await ref.set(_conMts(campos), {merge: true});
              await db.doc(CFG_DOC).set({ts: Date.now(), syncV: SYNC_V},
                  {merge: true});
            },
          });
          res.status(200).json(salida4);
        } catch (e) {
          console.error("jalarTicket:", e);
          res.status(200).json({ok: false, motivo: "ERROR_SHALOM",
            detalle: "No se pudo guardar el ticket. Intenta de nuevo."});
        }
        return;
      }

      if (paso.orquestar === "conectarShalom" ||
          paso.orquestar === "estadoShalom") {
        try {
          const cfgSnap2 = await db.doc(CFG_DOC).get();
          const cfg2 = cfgSnap2.exists ? cfgSnap2.data() : {};
          const inst = (cfg2.shalomInstancia &&
            typeof cfg2.shalomInstancia === "object") ? cfg2.shalomInstancia :
            {};
          const audit = (cfg2.shalomCredenciales &&
            typeof cfg2.shalomCredenciales === "object") ?
            cfg2.shalomCredenciales : {};
          const depsCuenta = {
            listar: async () => {
              const r = await _porLaPuerta("instances", {});
              if (!r || !r.ok) {
                return {ok: false, motivo: (r && r.motivo) || "SIN_RED"};
              }
              const t = shalomPuerta.traducir("instances", r.json) || {};
              return Array.isArray(t.instancias) ?
                {ok: true, instancias: t.instancias} :
                {ok: false, motivo: t.motivo || "FORMATO_DESCONOCIDO"};
            },
            crear: (nombre) => _porLaPuerta("instanceCrear", {name: nombre}),
            entrar: (id, usuario, clave) => _porLaPuerta("instanceLogin",
                {instanceId: id, username: usuario, password: clave}),
            estado: async (id) => {
              const r = await _porLaPuerta("instanceStatus", {instanceId: id});
              if (!r || !r.ok) {
                return {ok: false, motivo: (r && r.motivo) || "SIN_RED"};
              }
              return shalomPuerta.traducir("instanceStatus", r.json);
            },
            guardarCuenta: (id, usuario) => db.doc(CFG_DOC).set({
              shalomInstancia: {id: id, nombre: cuentaShalom.NOMBRE,
                usuario: usuario}}, {merge: true}),
          };

          if (paso.orquestar === "estadoShalom") {
            res.status(200).json(await cuentaShalom.estado(depsCuenta, {
              idGuardado: inst.id,
              usuarioGuardado: inst.usuario || audit.usuario,
              hayCredenciales: !!audit.usuario,
            }));
            return;
          }

          const d = (paso.datos && typeof paso.datos === "object") ?
            paso.datos : {};
          const escritas = !!(String(d.usuario || "").trim() && d.clave);
          let cred = null;
          if (escritas) {
            const g = await credenciales.guardar({
              escribir: _escribirSecreto,
              auditar: (a) => db.doc(CFG_DOC).set({shalomCredenciales: {
                usuario: a.usuario,
                cuando: a.cuando,
                porQuien: paso.correo || "",
              }}, {merge: true}),
            }, {usuario: d.usuario, clave: d.clave});
            if (!g || !g.ok) {
              res.status(200).json(g || {ok: false, motivo: "ERROR_SHALOM"});
              return;
            }
            cred = {usuario: g.usuario, clave: d.clave};
          } else {
            try {
              cred = await credenciales.leer({leer: _leerSecreto});
            } catch (e) {
              console.error("leerCredenciales:", e && e.message);
              res.status(200).json({ok: false,
                motivo: (e && e.motivo) || "ERROR_SECRETOS",
                detalle: "No se pudieron leer tus credenciales guardadas."});
              return;
            }
          }
          res.status(200).json(await cuentaShalom.conectar(depsCuenta, {
            usuario: cred && cred.usuario,
            clave: cred && cred.clave,
            idGuardado: inst.id,
            recienEscritas: escritas,
          }));
        } catch (e) {
          console.error("cuentaShalom:", e && e.message);
          res.status(200).json({ok: false, motivo: "ERROR_SHALOM",
            detalle: "Algo falló al conectar con Shalom. Intenta en un " +
              "momento."});
        }
        return;
      }

      const destino = paso.destino;
      const diagnostico = paso.diagnostico;

      try {
        const r = await _porLaPuerta(destino, paso.datos, diagnostico);
        if (!r.ok && destino === "track" && !diagnostico &&
            r.motivo === "SHALOM_SIN_RESPUESTA") {
          const pro = await _seguimientoPro(paso.datos &&
            paso.datos.orderNumber);
          if (pro) {
            res.status(200).json(pro);
            return;
          }
        }
        if (!r.ok && destino === "track" && !diagnostico &&
            r.motivo === "NO_ENCONTRADO") {
          const g = paso.datos && paso.datos.orderNumber;
          const pend = await _esPendiente(g);
          if (pend === true) {
            res.status(200).json({ok: false, motivo: "PENDIENTE"});
            return;
          }
          res.status(200).json({ok: false, motivo: "NO_ENCONTRADO",
            detalle: r.detalle, revisoPendientes: pend === false});
          return;
        }
        if (!r.ok) {
          res.status(200).json({
            ok: false, motivo: r.motivo, detalle: r.detalle,
            http: r.http, reabre: r.reabre,
          });
          return;
        }
        if (diagnostico) {
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
