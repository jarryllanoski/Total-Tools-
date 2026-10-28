"use strict";

const {setGlobalOptions} = require("firebase-functions");
const {onRequest} = require("firebase-functions/https");
const {onSchedule} = require("firebase-functions/scheduler");
const {defineSecret} = require("firebase-functions/params");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
const {getAuth} = require("firebase-admin/auth");
const {getAppCheck} = require("firebase-admin/app-check");
const {getStorage} = require("firebase-admin/storage");
const crypto = require("crypto");

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
const enlace = require("./enlaceSeguimiento");
const registroShalom = require("./registroShalom");
const nroComp = require("./nroComprobante");
const ticketShalom = require("./ticketShalom");
const instanciaShalom = require("./instanciaShalom");
const puertaInstancias = require("./puertaInstancias");
const reniecPublico = require("./reniecPublico");
const credenciales = require("./credenciales");

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

/* ── LAS CREDENCIALES DE SHALOM PRO ───────────────────────────────────────
   Viven en Secret Manager, la misma caja fuerte que la clave de la API. El
   dueño las escribe UNA vez desde el panel; a partir de ahí el servidor
   entra solo en Shalom — que es lo único que hace que la sesión no se caiga
   de madrugada sin nadie delante.

   ⚠️ NO CON `defineSecret()`, Y EL MOTIVO ES EL QUE LO HACE FUNCIONAR.
   Ese fija la versión al DESPLEGAR: si el panel guarda una contraseña
   nueva, la función seguiría usando la vieja hasta el próximo deploy —
   justo lo contrario de lo que se quiere. Se lee la versión `latest` en el
   momento de la petición, con la caché corta de `credenciales.js`.

   De regalo: como ya no van en `secrets: [...]`, un secreto que todavía no
   existe deja de romper el despliegue. Al dueño le acaba de pasar. */
let _smCliente = null;
/**
 * El cliente de Secret Manager, creado una sola vez.
 * @return {Object} el cliente
 */
function _sm() {
  if (!_smCliente) {
    const {SecretManagerServiceClient} =
      require("@google-cloud/secret-manager");
    _smCliente = new SecretManagerServiceClient();
  }
  return _smCliente;
}

/**
 * El id del proyecto.
 *
 * ⚠️ SE LO PREGUNTAMOS A LA LIBRERIA, no lo deducimos. Antes esto leia
 * `GCLOUD_PROJECT` / `GCP_PROJECT` / `FIREBASE_CONFIG` a mano, y en
 * Cloud Functions de 2ª generacion —que por dentro es Cloud Run— ninguna
 * de las tres esta garantizada. `getProjectId()` sale de las credenciales
 * con las que la funcion ya esta autenticada: es la misma fuente que usa
 * el cliente para hablar con Google, asi que no puede discrepar.
 * Las variables quedan de respaldo por si la metadata tarda.
 * @return {Promise<string>} el id del proyecto
 */
async function _proyecto() {
  try {
    const p = await _sm().getProjectId();
    if (p) return String(p);
  } catch (e) {
    // abajo el respaldo
  }
  return process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT ||
    (JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId) || "";
}

/**
 * Lee la versión MÁS NUEVA de un secreto.
 * @param {string} nombre del secreto
 * @return {Promise<string>} su valor
 */
async function _leerSecreto(nombre) {
  const [v] = await _sm().accessSecretVersion({
    name: `projects/${await _proyecto()}/secrets/${nombre}/versions/latest`,
  });
  return v.payload.data.toString("utf8");
}

/**
 * Escribe una versión nueva. Crea el secreto si es la primera vez.
 *
 * Las versiones viejas se quedan en el historial de Secret Manager: eso es
 * lo que permite volver atrás si el dueño se equivoca de cuenta.
 * @param {string} nombre del secreto
 * @param {string} valor lo que se guarda
 * @return {Promise<void>} nada
 */
async function _escribirSecreto(nombre, valor) {
  const padre = `projects/${await _proyecto()}`;
  /* ⚠️ CREAR PUEDE FALLAR Y NO PASA NADA, A PROPÓSITO.
     Dos motivos, y los dos son normales:
       · el secreto YA EXISTE — el caso de todas las veces menos la primera;
       · la cuenta de servicio no tiene permiso para CREAR secretos, porque
         el dueño le dio los permisos estrechos (añadir versión + leer) en
         vez de `admin`. Eso es mejor, no peor: así la función nunca puede
         borrar un secreto, ni el día que alguien se equivoque de línea.
     Quien manda es `addSecretVersion` de abajo: si de verdad no se puede
     escribir, falla ahí y el error llega entero. Tragarse este no esconde
     nada — solo deja de exigir un permiso que no hace falta. */
  try {
    await _sm().createSecret({parent: padre, secretId: nombre,
      secret: {replication: {automatic: {}}}});
  } catch (e) {
    // ver arriba
  }
  await _sm().addSecretVersion({
    parent: `${padre}/secrets/${nombre}`,
    payload: {data: Buffer.from(String(valor), "utf8")},
  });
}

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

/**
 * El ticket (binario) por la MISMA puerta: respeta el interruptor —si la
 * puerta está apagada o pausada tras fallos, no se llama— y cuenta como una
 * consulta más para abrirla o cerrarla.
 * @param {Object} datos {orderNumber, orderCode}
 * @return {Promise<Object>} {ok:true, bytes, tipo} o {ok:false, motivo}
 */
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

/**
 * Guarda bytes en el bucket con un token de descarga (el MISMO esquema de
 * URL que usa el panel al subir: `…/o/<ruta>?alt=media&token=…`). No usa
 * URLs firmadas: esas piden un permiso de IAM extra a la cuenta de servicio.
 * @param {string} ruta "shipments/<id>/guia.png"
 * @param {Buffer} bytes contenido
 * @param {string} tipo content-type
 * @return {Promise<string>} URL de descarga
 */
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
  /* ⚠️ CADA CABECERA QUE EL NAVEGADOR MANDE TIENE QUE ESTAR AQUÍ, Y ESTO
     CASI ROMPE EL FORMULARIO ENTERO EL 15/10/2026.

     Añadir `X-Firebase-AppCheck` a las llamadas de la página del cliente
     convierte un GET simple en uno con preflight: el navegador pregunta
     primero con OPTIONS y, si la cabecera no está permitida AQUÍ, BLOQUEA
     la petición de verdad. No la rechaza el servidor — no llega a salir.

     Es decir: desplegar la página sin desplegar antes esta línea deja a
     TODOS los clientes sin poder pedir. Una medida de seguridad que tumba
     el negocio no es una medida de seguridad.

     Hay una prueba que compara las cabeceras que el navegador manda con
     esta lista. Si alguien añade una cabecera y se olvida de ponerla aquí,
     se pone roja antes de salir de casa. */
  res.set("Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck");
}

// ── formApi ────────────────────────────────────────────────────────────────
/* ⚠️ `secrets` AQUI DESDE EL 15/10/2026. `action=reniec` consulta el espejo
   de RENIEC de Shalom, y para eso hace falta la clave de la API. El resto de
   acciones no la tocan: declararla no las cambia en nada. */
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
  /* El token del link ya NO es el id. Era `id_` + el reloj, o sea un numero
     que avanza solo y que cualquiera puede recorrer. Ahora son 128 bits del
     generador criptografico. Ver functions/enlaceSeguimiento.js. */
  const trackToken = enlace.generar();

  const orderToSave = Object.assign({}, pickOrderFields(order), {
    id: orderId,
    status: order.status || "NUEVO PEDIDO",
    createdAt: order.createdAt || new Date().toISOString(),
    fromForm: true,
    /* Se guarda en el pedido, no en una tabla aparte: asi la consulta es una
       sola lectura (indice automatico de Firestore sobre un campo) y el
       panel puede armar el link SIN CONEXION, porque el token ya viaja con
       el pedido. Pedirselo al servidor para copiar un link dejaria a Jarry
       sin poder mandarlo cuando se le cae internet. */
    trackToken,
  });

  /* ★ EL NOMBRE OFICIAL, PUESTO POR EL SERVIDOR Y NUNCA POR EL NAVEGADOR.
     `POST /account/register` de Shalom pide el nombre en TRES campos
     (`name`, `firstname`, `lastname`), y partir «JOSE LUIS DE LA CRUZ» a ojo
     se equivoca. Si el pedido nace con el nombre ya partido, el dueño puede
     registrarlo sin volver a consultar el DNI.

     ⚠️ SALE DE LA CACHÉ DEL SERVIDOR, NO DE LO QUE MANDE EL FORMULARIO. Si
     el navegador pudiera mandar `reniec: {...}`, cualquiera podría poner el
     nombre que quisiera EN UNA ETIQUETA DE ENVÍO REAL. El navegador
     pregunta; el servidor consultó, guardó, y ahora se acuerda. `reniec`
     tampoco está en ORDER_FIELDS, así que lo que venga de fuera con ese
     nombre se tira antes de llegar aquí.

     Y solo si CORRESPONDE AL DNI DEL PEDIDO: el cliente puede consultar un
     documento y escribir otro. Pegar el nombre del primero sería darle a
     Shalom el nombre de otra persona — peor que no tener ninguno. */
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
    // Un pedido NUNCA se pierde por esto: el nombre partido es una mejora,
    // no un requisito. Sin él, el panel lo consulta al abrir el pedido.
    console.warn("create: no se pudo adjuntar reniec:", e && e.message);
  }

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

  /* ★ EL NÚMERO DE FACTURA O BOLETA, DEL TOKEN Y NUNCA DEL CLIENTE.
     Igual que el monto: lo escribió el dueño al generar el link. No está
     en ORDER_FIELDS, así que si el formulario manda `nroComprobante` se
     tira antes de llegar aquí — nadie puede ponerse el número de otra
     venta. Se vuelve a limpiar aunque lo haya escrito el panel: en el QR
     de la etiqueta un `#` de más rompe la lectura. */
  const nroComprobante = tokData ? nroComp.de(tokData) : "";
  if (nroComprobante) orderToSave.nroComprobante = nroComprobante;

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

  /* El formulario lo usa como código en el WhatsApp del cliente, para que
     diga lo mismo que la etiqueta. Solo si existe: los links sin número
     responden exactamente igual que antes. */
  const resp = {status: "ok", orderId, trackCode, trackToken};
  if (nroComprobante) resp.nroComprobante = nroComprobante;
  res.json(resp);
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
  /* ★ LA FOTO DE LA CONFIGURACIÓN VIAJA CON EL TOKEN, NO SOLO EN LA URL.
     Cada link congela al generarse qué días y qué couriers ofrece (la
     «foto», en FORMCFG_COL). Hasta el 26/10/2026 su id viajaba solo en la
     URL (`&cfg=…`), y un cliente que editara el enlace podía cambiarlo por
     el de otro link y ver otros couriers u otros días. Ahora el panel lo
     guarda también DENTRO del token, y el formulario prefiere este.
     Los tokens viejos no lo tienen: devuelven "" y el formulario sigue con
     el de la URL, como antes. Se valida la forma para no devolver basura
     que el formulario usaría como ruta. */
  const cfgId = /^[A-Za-z0-9_-]{6,40}$/.test(String(d.cfgId || "")) ?
    String(d.cfgId) : "";
  res.json({
    status: "valid",
    prefillName: d.prefillName || "",
    prefillPhone: d.prefillPhone || "",
    prefillLink: d.prefillLink || "",
    cfgId: cfgId,
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

// ── action=reniec ──────────────────────────────────────────────────────────
/**
 * ¿Trae esta petición una prueba válida de App Check?
 *
 * ⚠️ SE EXIGE AQUÍ Y NO EN LAS DEMÁS ACCIONES, A PROPÓSITO. `create`,
 * `track` y `client` ya tienen clientes de verdad usándolas: exigirles de
 * golpe una capa nueva dejaría fuera a quien tenga reCAPTCHA caído o un
 * navegador viejo, y perder un pedido real es peor que el ataque del que
 * protege. Esas se MIDEN primero (ver appcheck.js en formulario.html).
 *
 * `reniec` nace hoy. Una puerta que todavía no existe no tiene a nadie a
 * quien dejar fuera, así que nace cerrada — que es la única vez que sale
 * gratis cerrarla.
 * @param {Object} req request de Express
 * @return {Promise<boolean>} true si la prueba es válida
 */
async function appCheckOk(req) {
  const t = req.get("X-Firebase-AppCheck") || "";
  if (!t) return false;
  try {
    await getAppCheck().verifyToken(t);
    return true;
  } catch (e) {
    /* No se dice por qué: a quien no pasa no se le explica cómo pasar. En
       los registros sí queda, que es donde el dueño lo necesita. */
    console.warn("appCheck rechazado:", (e && e.message) || e);
    return false;
  }
}

/**
 * El espejo de RENIEC, para la página del cliente.
 *
 * Las cuatro capas y el porqué de cada una están en
 * `functions/reniecPublico.js`. Aquí solo está el ir y venir: leer la
 * caché, contar el día, llamar a Shalom y guardar.
 *
 * ⚠️ ESTO NO TOCA EL INTERRUPTOR DE LA PUERTA. `_porLaPuerta` apunta los
 * fallos y cierra el paso tras cinco seguidos — correcto para el panel, y
 * peligroso aquí: una racha de fallos desde la página pública dejaría al
 * dueño sin poder REGISTRAR ENVÍOS, que es lo que da de comer. La página
 * del cliente no puede apagarle el panel. Lo que acota el gasto aquí es el
 * tope diario, no el interruptor.
 * @param {Object} req request
 * @param {Object} res response
 * @return {Promise<void>}
 */
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
    /* Si no se puede leer, se sigue como si no hubiera nada: el tope de
       abajo y el freno por IP siguen puestos. Un formulario que se cae
       porque Firestore tosió es peor que una consulta de más. */
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

  /* ⚠️ SE CUENTA ANTES DE LLAMAR, Y NO DESPUÉS DE ACERTAR. Contar solo los
     aciertos deja el gasto sin tope el día que Shalom conteste mal a todo:
     cada fallo sería gratis para el contador y caro para la factura. Con el
     día caído, el cliente escribe su nombre — que es lo que hacía ayer. */
  try {
    await refDia.set({consultas: FieldValue.increment(1), dia: dia},
        {merge: true});
  } catch (e) {
    console.warn("reniec: no se pudo contar:", e && e.message);
  }

  let r = null;
  try {
    r = await shalomPuerta.llamar("dni", SHALOM_API_KEY.value(), {dni: dni});
  } catch (e) {
    console.error("reniec: llamada falló:", e && e.message);
    return no("SIN_RED", "No se pudo consultar. Escribe tu nombre.");
  }
  if (!r || !r.ok) {
    return no((r && r.motivo) || "SIN_RED",
        "No se pudo consultar. Escribe tu nombre.");
  }
  const t = shalomPuerta.traducir("dni", r.json);
  if (!t || !t.ok) {
    return no("NO_ENCONTRADO", "No encontramos ese DNI. Escribe tu nombre.");
  }
  const guardar = reniecPublico.guardable(t.persona, ahora);
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

/**
 * Lo que sale al navegador. SOLO el nombre, y campo por campo.
 *
 * Devolver el objeto guardado entero enseñaría `cuando` —cuándo se consultó
 * ese DNI por primera vez— que no le hace falta a nadie en la pantalla y le
 * diría a cualquiera si ese documento ya pasó por aquí. Lo que no se copia a
 * mano no se escapa por accidente.
 * @param {Object} p lo guardado
 * @return {Object} lo que ve el navegador
 */
function _reniecFuera(p) {
  const o = p || {};
  return {
    nombres: o.nombres || "",
    apePaterno: o.apePaterno || "",
    apeMaterno: o.apeMaterno || "",
    completo: o.completo || "",
  };
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

  /* ── REJA 1: LA FORMA, y antes que nada ────────────────────────────────
     Lo que no tiene forma de token se responde aqui mismo, SIN tocar la
     base de datos. Antes, `token=cualquiercosa` costaba una lectura de
     Firestore: un robot recorriendo valores nos cobraba a nosotros cada
     intento. Ahora la basura no cuesta nada.
     De paso cierra algo que no era una fuga pero lo parecia: el token se
     concatenaba a una ruta (`panel/shipments/items/<token>`) sin validarlo. */
  const tipo = enlace.tipoDe(trackToken);
  if (tipo === "invalido") {
    res.json({status: "not_found"});
    return;
  }

  /* ── REJA 2: EL FRENO, antes de leer ───────────────────────────────────
     Se responde 429 y no un "no encontrado": decirle a alguien que su link
     no existe cuando lo que pasa es que hay demasiadas consultas lo manda a
     buscar el problema donde no esta. La pagina lo traduce a palabras. */
  if (!(await checkRateLimit("formApi_track", req))) {
    res.status(429).json({
      status: "rate_limited",
      error: "Demasiadas consultas. Espera un momento y vuelve a intentar.",
    });
    return;
  }

  /* ── REJA 3: BUSCAR, por el camino que toque ───────────────────────────
     Dos formas de token conviven a proposito: hay mas de mil links ya
     enviados por WhatsApp y tienen que seguir abriendo para siempre. */
  let snap = null;
  if (tipo === "legado") {
    snap = await db.doc(`${SHIP_COL}/${trackToken}`).get();
    if (!snap.exists) snap = null;
  } else {
    // Igualdad sobre un campo: usa el indice automatico de Firestore, no
    // hace falta declarar ninguno (mismo patron que la busqueda por phone).
    const q = await db.collection(SHIP_COL)
        .where("trackToken", "==", trackToken).limit(1).get();
    snap = q.empty ? null : q.docs[0];
  }
  if (!snap) {
    res.json({status: "not_found"});
    return;
  }

  const order = snap.data();

  /* ⚠️ LA PUERTA TRASERA, cerrada aqui.
     Un pedido nuevo guarda token al azar, pero su id de documento sigue
     siendo `id_` + el reloj. Sin esta linea, ese pedido se abriria por su
     id adivinable IGUAL QUE ANTES y el token al azar seria decoracion.
     Los pedidos de ayer no tienen token, asi que su id les sigue valiendo. */
  if (tipo === "legado" && !enlace.aceptaLegado(order)) {
    res.json({status: "not_found"});
    return;
  }
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
  /* El link de seguimiento. 120/min y NO 30, que fue mi primer numero.
     La pagina del cliente se refresca sola cada 30 s —2 peticiones por
     minuto por pestaña abierta— y en Peru Claro y Movistar meten miles de
     usuarios detras de una misma IP publica (CGNAT). Un freno de 30 habria
     bloqueado CLIENTES REALES: un autogol, peor que el problema que
     resuelve. Con 120 caben 60 pestañas desde una misma IP, muy por encima
     del uso real, y aun asi recorrer un solo dia de milisegundos le tomaria
     a un raspador medio año. */
  formApi_track: {windowMs: 60000, max: 120},
  /* La consulta de DNI. 10/min: un cliente escribe UNO, como mucho lo
     corrige dos veces. Mas bajo que `client` (20) porque esta cuesta dinero
     de verdad y la otra solo una lectura. Y aun asi el freno por IP aqui es
     la capa DEBIL —en Peru media ciudad comparte IP publica, y un bot con
     datos moviles cambia de IP cuando quiere—: quien de verdad acota el
     daño es el tope diario de reniecPublico.js. */
  formApi_reniec: {windowMs: 60000, max: 10},
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
// Nacio en simulacro (decidia y no escribia) hasta que el informe cuadro.
// El 26/10/2026 el dueño lo retiro: desde entonces SIEMPRE escribe. Un
// `config.barrido.simulacro` que quede guardado en la nube se ignora.
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

  // 4 · escribir
  let escritas = 0;
  if (escrituras.length) {
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
    modo: modo,
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
    escritas, cortado, forzado: !!forzado,
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
    /* ⚠️ LOS TRES SECRETOS TIENEN QUE EXISTIR ANTES DE DESPLEGAR. Una
       funcion que declara un secreto que no esta en Secret Manager NO
       DESPLIEGA — y que falle en el deploy es exactamente donde se quiere
       que falle, no en produccion con el dueño delante. */
    /* Solo la clave de la API va declarada. Las credenciales de Shalom Pro
       se leen en el momento de la peticion (ver arriba), asi que un secreto
       que aun no existe NO rompe el despliegue. */
    {region: "us-central1", secrets: [SHALOM_API_KEY], timeoutSeconds: 120},
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
      /* ★ REGISTRAR UN ENVIO — no es un reenvio, es una orquestacion.
         El navegador manda SOLO el id del pedido: aqui se lee de Firestore,
         se comprueban los candados contra lo que hay AHORA, se arma el
         cuerpo, se llama y se escribe el resultado. Asi nadie puede
         falsificar un campo ni saltarse un candado desde la consola.
         Arranca en SIMULACRO: se enciende desde Config, a conciencia. */
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
            // La MISMA funcion que usa el panel para avisarte antes de
            // gastar una llamada. Dos copias divergen; una no puede.
            leerConfig: async () => registroShalom.configDe(cfgDoc),
            llamar: (c) => _porLaPuerta("register", c),
            pendientes: async () => {
              const pr = await _porLaPuerta("pendientes", {
                instanceId: (cfgDoc.shalomInstancia &&
                  cfgDoc.shalomInstancia.id) || ""});
              return (pr && pr.ok && pr.json) || null;
            },
            guardar: (campos) => ref.set(campos, {merge: true}),
          };
          /* `recuperarEnvio` SOLO LEE: busca el envio en pendientes y
             rellena la guia. Nunca llama a `register`, asi que no tiene
             simulacro ni puede costar nada. */
          const salida2 = paso.orquestar === "recuperarEnvio" ?
            await registroShalom.recuperarEnvio(paso.datos, depsReg) :
            await registroShalom.orquestar(paso.datos, depsReg,
                {simulacro: cfgDoc.shalomRegistroSimulacro !== false});
          res.status(200).json(salida2);
        } catch (e) {
          console.error("registrarEnvio:", e);
          /* ⚠️ Un error AQUI tampoco es "fallo": si revento despues de
             llamar a Shalom, el envio pudo crearse. Se dice duda. */
          res.status(200).json({ok: false, estado: "duda",
            motivo: "ERROR_SHALOM",
            detalle: "Algo se rompio a mitad y NO SABEMOS si el envio llego " +
              "a crearse. Verifica en pro.shalom.pe antes de reintentar."});
        }
        return;
      }

      /* ★ JALAR EL TICKET DE SHALOM. El servidor descarga, guarda en el
         bucket y apunta en el pedido; el navegador recibe solo el enlace.
         Ver functions/ticketShalom.js. */
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
            descargar: _voucherPorLaPuerta,
            subir: _subirAlBucket,
            guardar: async (campos) => {
              await ref.set(campos, {merge: true});
              // Que las otras PCs se enteren, como hace el barrido.
              await db.doc(CFG_DOC).set({ts: Date.now()}, {merge: true});
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

      /* ★ CONECTAR LA CUENTA DE SHALOM PRO — crear si hace falta, entrar
         siempre, comprobar. Una sola operacion idempotente: pulsarla dos
         veces no crea dos instancias.

         Se entra SIEMPRE aunque ya figure conectada, y no es un descuido:
         entrar por la API es lo que deja las credenciales guardadas en la
         instancia, y eso es lo que hace que la sesion se levante sola
         cuando expira. Sin credenciales guardadas llega el 401 que su
         propia documentacion llama «el fallo mas repetido de esta API». */
      if (paso.orquestar === "conectarShalom") {
        try {
          /* Si leer el secreto falla de verdad —permiso, API caída— se
             dice QUÉ pasó. Antes todo acababa en «faltan las credenciales»,
             que manda a guardarlas otra vez y no arregla nada. */
          let cred = null;
          try {
            cred = await credenciales.leer({leer: _leerSecreto});
          } catch (e) {
            console.error("leerCredenciales:", e && e.message);
            res.status(200).json({ok: false,
              motivo: (e && e.motivo) || "ERROR_SECRETOS",
              detalle: "No se pudieron LEER las credenciales de Secret " +
                "Manager (guardarlas sí funcionó). Motivo de Google: " +
                String((e && e.message) || e).slice(0, 300)});
            return;
          }
          const cfgSnap2 = await db.doc(CFG_DOC).get();
          const cfg2 = cfgSnap2.exists ? cfgSnap2.data() : {};
          const decl = (cfg2.shalomInstanciaPreferida &&
            typeof cfg2.shalomInstanciaPreferida === "object") ?
            cfg2.shalomInstanciaPreferida : {};
          /* ⚠️ LAS CUATRO LLAMADAS VIVEN EN `puertaInstancias`, NO AQUI.
             Estuvieron escritas aqui mismo, sueltas, y dos de las cuatro
             devolvian la respuesta EN CRUDO donde `conectar` esperaba la
             traducida: `lis.instancias` y `st.sesion` salian `undefined`
             siempre, asi que no se veia ninguna instancia existente —se
             creaba una nueva en cada pulsacion— y el login bueno se
             reportaba como «no conectada». Ninguna prueba en rojo: los
             dobles devolvian la forma traducida, mas amable que la realidad.
             Ahora el empalme es un modulo y se prueba con el JSON medido. */
          const cables = puertaInstancias.hacer(
              _porLaPuerta, shalomPuerta.traducir);
          const salida3 = await instanciaShalom.conectar(cables, {
            // Lo declarado en Config pisa lo del codigo, igual que el resto.
            // Config puede pisarla sin desplegar; si no, la del modulo.
            // NUNCA del navegador: ver el comentario de DECLARADA.
            correo: decl.correo || instanciaShalom.DECLARADA.correo,
            nombre: decl.nombre || instanciaShalom.DECLARADA.nombre,
            usuario: (cred && cred.usuario) || "",
            clave: (cred && cred.clave) || "",
          });
          /* Si acabo de conectar una instancia, se guarda cual — el
             registro de envios la lee de Firestore, no del navegador. */
          if (salida3 && salida3.ok && salida3.id) {
            await db.doc(CFG_DOC).set({shalomInstancia: {
              id: salida3.id,
              nombre: decl.nombre || instanciaShalom.DECLARADA.nombre,
            }}, {merge: true});
          }
          res.status(200).json(salida3);
        } catch (e) {
          console.error("conectarShalom:", e);
          res.status(200).json({ok: false, motivo: "ERROR_SHALOM",
            detalle: "Algo se rompio al conectar. Mira la cuenta en " +
              "shalom-api.lat antes de volver a intentarlo."});
        }
        return;
      }

      /* ★ GUARDAR LAS CREDENCIALES DE SHALOM PRO — write-only.
         Es la unica operacion que recibe un secreto del navegador, y el
         trato es: entra una vez, va a Secret Manager, y no se puede volver
         a sacar. No hay operacion de lectura; la respuesta no devuelve la
         clave ni enmascarada; y lo que se audita es QUIEN y CUANDO.

         Su documentacion desaconseja tener el login en un panel porque
         «obligaria a que tus credenciales pasen por tu sistema». Pasan UNA
         vez, en una peticion, y acaban en la misma caja fuerte que la clave
         de la API. Una contraseña que se escribe una vez se expone una vez
         — frente a escribirla cada vez que la sesion se cae. */
      if (paso.orquestar === "guardarCredenciales") {
        try {
          const d = (paso.datos && typeof paso.datos === "object") ?
            paso.datos : {};
          const salida4 = await credenciales.guardar({
            escribir: _escribirSecreto,
            auditar: (a) => db.doc(CFG_DOC).set({shalomCredenciales: {
              usuario: a.usuario, // el correo SI: no es un secreto
              cuando: a.cuando,
              porQuien: paso.correo || "",
            }}, {merge: true}),
          }, {usuario: d.usuario, clave: d.clave});
          /* Sin `clave` en la respuesta, ni aqui ni en el error. El correo
             si vuelve: es lo que el panel pinta para que sepas cual quedo. */
          res.status(200).json(salida4);
        } catch (e) {
          console.error("guardarCredenciales:", e && e.message);
          res.status(200).json({ok: false, motivo: "ERROR_SHALOM",
            detalle: "No se pudieron guardar las credenciales."});
        }
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
