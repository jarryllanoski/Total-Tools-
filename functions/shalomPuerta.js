"use strict";

const shalomEstado = require("./shalomEstado");

const BASE = "https://api.shalom-api.lat";
const TIEMPO_MAX_MS = 20000;
const PROF_MAX = 8;

const PERMITIDAS = {
  validate: {metodo: "GET", ruta: "/validate"},
  track: {metodo: "POST", ruta: "/track"},
  instances: {metodo: "GET", ruta: "/instances", soloServidor: true},
  agencies: {metodo: "GET", ruta: "/public/agencies", publico: true},
  dni: {metodo: "GET", ruta: "/account/dni/{dni}",
    rutaParam: {dni: /^[0-9]{8}$/}},
  instanceStatus: {metodo: "POST", ruta: "/instances/status",
    soloServidor: true, cuerpoCampos: ["instanceId"]},
  instanceLogin: {metodo: "POST", ruta: "/instances/login",
    soloServidor: true,
    cuerpoCampos: ["instanceId", "username", "password"]},
  instanceCrear: {metodo: "POST", ruta: "/instances",
    soloServidor: true, cuerpoCampos: ["name"]},
  register: {metodo: "POST", ruta: "/account/register", soloServidor: true,
    cuerpoCampos: ["instanceId", "origen", "destino", "documento", "name",
      "firstname", "lastname", "phone", "content", "cantidad", "clave",
      "declaracion_jurada"]},
  pendientes: {metodo: "POST", ruta: "/account/pending-shipments",
    soloServidor: true, cuerpoCampos: ["instanceId"]},
  borrarPendiente: {metodo: "DELETE", ruta: "/account/pending-shipments",
    soloServidor: true, cuerpoCampos: ["instanceId", "guia"]},
  trackingList: {metodo: "GET", ruta: "/account/tracking-list",
    soloServidor: true,
    consulta: {instanceId: /^[A-Za-z0-9-]{1,64}$/, page: /^[0-9]{1,3}$/}},
};

const ORQUESTADAS = {registrarEnvio: true, recuperarEnvio: true,
  conectarShalom: true, estadoShalom: true, jalarTicket: true};

function sanear(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
      .replace(/sk_[A-Za-z0-9_-]{6,}/g, "sk_***")
      .slice(0, 300);
}

function motivoDeHttp(status, texto) {
  if (/buscar[\s\S]*returned status 40[34]/i.test(String(texto || ""))) {
    return "SHALOM_SIN_RESPUESTA";
  }
  if (status === 403 && /instance/i.test(String(texto || ""))) {
    return "SIN_INSTANCIA_VALIDA";
  }
  if (status === 401 || status === 403) return "BLOQUEADO";
  if (status === 429) return "LIMITE";
  if (status === 404) return "NO_ENCONTRADO";
  if (status === 400 || status === 422) return "PETICION_INVALIDA";
  return "ERROR_SHALOM";
}

const _SOLO_NUMEROS = /^[0-9][0-9\-/: .TZ+]*$/;

function _formaTexto(s) {
  if (s.length <= 40 && _SOLO_NUMEROS.test(s)) {
    return "string(" + s.replace(/[0-9]/g, "#") + ")";
  }
  return "string";
}

function forma(v, prof) {
  prof = prof || 0;
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (prof >= PROF_MAX) return "array";
    return "array[" + v.length + "] de " +
      (v.length ? JSON.stringify(forma(v[0], prof + 1)) : "?");
  }
  const t = typeof v;
  if (t === "string") return _formaTexto(v);
  if (t !== "object") return t;
  if (prof >= PROF_MAX) return "objeto";
  const o = {};
  Object.keys(v).slice(0, 40).forEach((k) => {
    o[k] = forma(v[k], prof + 1);
  });
  return o;
}

function traducirValidate(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  }
  if (typeof j.valid !== "boolean") {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  }
  if (!j.valid) return {ok: false, motivo: "BLOQUEADO"};
  const num = (x) => (typeof x === "number" && isFinite(x) ? x : null);
  return {
    ok: true,
    valida: true,
    limite: num(j.limit),
    usado: num(j.currentUsage),
    restante: num(j.remaining),
    ilimitado: j.limit === null,
    mensaje: typeof j.message === "string" ? j.message : null,
  };
}

function filtrarCuerpo(def, cuerpo) {
  if (!def.cuerpoCampos) return cuerpo || {};
  const dentro = (cuerpo && typeof cuerpo === "object") ? cuerpo : {};
  const out = {};
  def.cuerpoCampos.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(dentro, k)) out[k] = dentro[k];
  });
  return out;
}

async function llamar(op, clave, cuerpo) {
  const def = PERMITIDAS[op];
  if (!def) return {ok: false, motivo: "NO_PERMITIDO"};
  if (!clave && !def.publico) {
    return {ok: false, motivo: "BLOQUEADO", detalle: "sin clave"};
  }

  let ruta = def.ruta;
  if (def.rutaParam) {
    const claves = Object.keys(def.rutaParam);
    for (let i = 0; i < claves.length; i++) {
      const k = claves[i];
      const dato = (cuerpo && cuerpo[k] !== undefined && cuerpo[k] !== null) ?
        String(cuerpo[k]).trim() : "";
      if (!def.rutaParam[k].test(dato)) {
        return {ok: false, motivo: "SIN_DATO",
          detalle: sanear("el parametro '" + k + "' no tiene la forma pedida")};
      }
      ruta = ruta.split("{" + k + "}").join(dato);
    }
  }
  if (def.consulta) {
    const qs = [];
    const ks = Object.keys(def.consulta);
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      if (!cuerpo || cuerpo[k] === undefined || cuerpo[k] === null ||
          cuerpo[k] === "") continue;
      const dato = String(cuerpo[k]).trim();
      if (!def.consulta[k].test(dato)) {
        return {ok: false, motivo: "SIN_DATO",
          detalle: sanear("el parametro '" + k + "' no tiene la forma pedida")};
      }
      qs.push(encodeURIComponent(k) + "=" + encodeURIComponent(dato));
    }
    if (qs.length) ruta += "?" + qs.join("&");
  }
  if (ruta.indexOf("{") >= 0 || ruta.indexOf("}") >= 0) {
    return {ok: false, motivo: "SIN_DATO", detalle: "ruta incompleta"};
  }

  let r;
  try {
    const opciones = {
      method: def.metodo,
      headers: def.publico ? {} : {"x-api-key": clave},
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    };
    if (def.metodo === "POST" || def.metodo === "DELETE") {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(filtrarCuerpo(def, cuerpo));
    }
    r = await fetch(BASE + ruta, opciones);
  } catch (e) {
    const corte = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      motivo: corte ? "ERROR_SHALOM" : "SIN_RED",
      detalle: sanear(e && e.message),
    };
  }

  let texto = "";
  try {
    texto = await r.text();
  } catch (e) {
    texto = "";
  }
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch (e) {
    json = null;
  }

  if (!r.ok) {
    return {
      ok: false,
      motivo: motivoDeHttp(r.status,
          (json && (json.message || json.error)) || texto),
      http: r.status,
      detalle: sanear((json && (json.message || json.error)) || texto),
    };
  }
  if (json === null) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO", detalle: sanear(texto)};
  }
  return {ok: true, json: json};
}

const PASOS = [
  {clave: "origen", texto: "En origen", pasos: 0},
  {clave: "transito", texto: "En tránsito", pasos: 1},
  {clave: "destino", texto: "En destino", pasos: 2},
  {clave: "reparto", texto: "En reparto", pasos: 2},
  {clave: "entregado", texto: "Entregado", pasos: 3},
];

function _fechaDe(rama) {
  if (!rama || typeof rama !== "object" || Array.isArray(rama)) return null;
  const f = rama.fecha;
  return (typeof f === "string" && f.trim()) ? f.trim() : null;
}

function traducirTrack(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  const st = j.statuses;

  if (st === null || st === undefined) {
    const bus = j.search;
    if (!bus || typeof bus !== "object" || Array.isArray(bus)) return raro;
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: sanear(bus.message)};
  }
  if (typeof st !== "object" || Array.isArray(st)) return raro;
  if (st.success === false) {
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: sanear(st.message)};
  }
  const d = st.data;
  if (d === null || d === undefined) {
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: sanear(st.message)};
  }
  if (typeof d !== "object" || Array.isArray(d)) return raro;

  const arbol = {};
  let alcanzado = null;
  PASOS.forEach((p) => {
    const f = _fechaDe(d[p.clave]);
    if (f) {
      arbol[p.clave] = f;
      alcanzado = p;
    }
  });
  const reg = _fechaDe(d.registrado);
  if (!alcanzado) {
    return reg ?
      {ok: false, motivo: "SOLO_REGISTRADO", registrado: {fecha: reg}} :
      {ok: false, motivo: "SIN_DATO"};
  }

  const ent = d.entregado;
  const cli = (ent && typeof ent === "object") ? ent.cliente : null;
  const recibio = (cli && typeof cli === "object" && !Array.isArray(cli)) ? {
    nombre: typeof cli.nombre === "string" ? cli.nombre : null,
    documento: typeof cli.documento === "string" ? cli.documento : null,
  } : null;
  const demora = _fechaDe(d.demora);

  return {
    ok: true,
    estado: alcanzado.texto,
    pasos: alcanzado.pasos,
    fecha: arbol[alcanzado.clave],
    demora: demora ? {fecha: demora} : null,
    registrado: reg ? {fecha: reg} : null,
    recibio: alcanzado.clave === "entregado" ? recibio : null,
    arbol: arbol,
  };
}

function esAdminDe(usuario, admins) {
  const correo = String((usuario && usuario.email) || "").toLowerCase();
  if (!correo) return false;
  if (usuario.email_verified !== true) return false;
  const lista = (admins || []).map((x) => String(x).toLowerCase());
  return lista.indexOf(correo) >= 0;
}

async function barreras(entrada, deps) {
  const cortar = (http, motivo) => ({corte: {http: http, motivo: motivo}});

  if (entrada.metodo !== "POST") return cortar(405, "NO_PERMITIDO");
  const bearer = String(entrada.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!bearer) return cortar(401, "SIN_SESION");
  let usuario;
  try {
    usuario = await deps.verificar(bearer[1]);
  } catch (e) {
    return cortar(401, "SIN_SESION");
  }

  if (!esAdminDe(usuario, deps.admins, deps.legado)) {
    return cortar(403, "SIN_PERMISO");
  }
  const correo = String((usuario && usuario.email) || "").toLowerCase();

  const cuerpo = (entrada.cuerpo && typeof entrada.cuerpo === "object") ?
    entrada.cuerpo : {};
  const op = String(cuerpo.op || "");

  if (Object.prototype.hasOwnProperty.call(ORQUESTADAS, op)) {
    return {ok: true, orquestar: op, datos: cuerpo.datos, correo: correo};
  }

  const diagnostico = op === "esquema";
  const destino = diagnostico ? String(cuerpo.de || "") : op;
  if (!Object.prototype.hasOwnProperty.call(PERMITIDAS, destino)) {
    return cortar(200, "NO_PERMITIDO");
  }
  if (PERMITIDAS[destino].soloServidor) {
    return cortar(200, "NO_PERMITIDO");
  }
  if (!diagnostico && PERMITIDAS[destino].soloMedir) {
    return cortar(200, "SIN_TRADUCTOR");
  }

  return {ok: true, destino: destino, diagnostico: diagnostico,
    datos: cuerpo.datos, correo: correo};
}

function traducirInstancias(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  const lista = j.instances;
  if (!Array.isArray(lista)) return raro;

  const tx = (x) => (typeof x === "string" && x ? x : null);
  const instancias = lista
      .filter((x) => x && typeof x === "object" && !Array.isArray(x))
      .map((x) => ({
        id: tx(x.id),
        nombre: tx(x.name),
        usuario: tx(x.username),
        conectada: x.isLoggedIn === true,
      }))
      .filter((x) => x.id);

  if (!lista.length) return {ok: false, motivo: "SIN_INSTANCIA", instancias};
  if (lista.length > 1) {
    return {ok: false, motivo: "VARIAS_INSTANCIAS", instancias};
  }
  const it = lista[0];
  if (!it || typeof it !== "object" || Array.isArray(it)) return raro;
  if (typeof it.isLoggedIn !== "boolean") return raro;
  const txt = (x) => (typeof x === "string" && x ? x : null);
  return {
    ok: true,
    sesion: {
      conocido: true,
      conectada: it.isLoggedIn,
      usuario: txt(it.username),
      nombre: txt(it.name),
      id: txt(it.id),
      url: null,
      enLogin: null,
    },
    instancias,
  };
}

function traducirInstanceStatus(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  if (typeof j.isLoggedIn !== "boolean") return raro;
  const txt = (x) => (typeof x === "string" && x ? x : null);
  const url = txt(j.url);
  let ruta = "";
  if (url) {
    ruta = url.split("#")[0].split("?")[0].replace(/\/+$/, "");
  }
  return {
    ok: true,
    sesion: {
      conocido: true,
      conectada: j.isLoggedIn,
      usuario: txt(j.username),
      nombre: null,
      id: null,
      url: url,
      enLogin: url ? /\/login$/.test(ruta) : null,
    },
  };
}

function _txt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v.trim();
  return "";
}

function traducirAgencias(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  if (j.success !== true) return raro;
  if (!Array.isArray(j.data)) return raro;

  const agencias = [];
  let sinId = 0;
  j.data.forEach((a) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) {
      sinId++;
      return;
    }
    const id = _txt(a.ter_id);
    if (!id) {
      sinId++;
      return;
    }
    agencias.push({
      ter_id: id,
      nombre: _txt(a.nombre) || _txt(a.lugar_over),
      departamento: _txt(a.departamento),
      provincia: _txt(a.provincia),
      distrito: _txt(a.zona) || _txt(a.ter_zona),
      direccion: _txt(a.direccion),
      referencia: "",
      telefono: _txt(a.telefono),
      horario: _txt(a.hora_atencion),
      horarioDom: "",
      latitud: _txt(a.latitud),
      longitud: _txt(a.longitud),
    });
  });

  if (!agencias.length) return raro;

  return {ok: true, agencias: agencias, total: agencias.length, sinId: sinId};
}

function traducirDni(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  if (j.success !== true) return raro;
  const d = j.data;
  if (!d || typeof d !== "object" || Array.isArray(d)) return raro;
  const txt = (x) => (typeof x === "string" ? x.trim() : "");
  const nombres = txt(d.nombres);
  if (!nombres) return raro;
  const pat = txt(d.apellidoPaterno);
  const mat = txt(d.apellidoMaterno);
  return {
    ok: true,
    persona: {
      dni: txt(d.dni),
      nombres: nombres,
      apePaterno: pat,
      apeMaterno: mat,
      completo: [nombres, pat, mat].filter(Boolean).join(" "),
    },
  };
}

function traducir(op, json) {
  if (op === "validate") return traducirValidate(json);
  if (op === "track") return traducirTrack(json);
  if (op === "instances") return traducirInstancias(json);
  if (op === "agencies") return traducirAgencias(json);
  if (op === "dni") return traducirDni(json);
  if (op === "instanceStatus") return traducirInstanceStatus(json);
  return {ok: false, motivo: "SIN_TRADUCTOR"};
}

const GUIA_FORMA = /^(?:[0-9]{8}|1[0-9]{8})$/;
const CODIGO_FORMA = /^[A-Za-z0-9]{3,8}$/;
const INSTANCIA_FORMA = /^[A-Za-z0-9-]{8,64}$/;
const VOUCHER_MAX = 3 * 1024 * 1024;

function tipoPorFirma(b) {
  if (!b || b.length < 5) return "";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {
    return "image/png";
  }
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return "application/pdf";
  }
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" &&
      b.toString("latin1", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (b.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  return "";
}

const _B64 = /^[A-Za-z0-9+/=\s]+$/;

function buscarArchivo(v, prof) {
  const p = prof || 0;
  if (p > 6 || v === null || v === undefined) return {};
  if (typeof v === "string") {
    const s = v.trim();
    const m = /^data:([a-z/+.-]+);base64,([\s\S]+)$/i.exec(s);
    if (m) {
      const b = Buffer.from(m[2], "base64");
      return tipoPorFirma(b) ? {bytes: b} : {};
    }
    if (s.length > 200 && _B64.test(s)) {
      const b = Buffer.from(s, "base64");
      if (tipoPorFirma(b)) return {bytes: b};
    }
    if (/^https:\/\/[^\s]+$/i.test(s)) return {url: s};
    return {};
  }
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const r = buscarArchivo(v[i], p + 1);
      if (r.bytes || r.url) return r;
    }
    return {};
  }
  if (typeof v === "object") {
    let url = null;
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) {
      const r = buscarArchivo(v[ks[i]], p + 1);
      if (r.bytes) return r;
      if (r.url && !url) url = r.url;
    }
    return url ? {url: url} : {};
  }
  return {};
}

async function descargarVoucher(clave, datos) {
  const d = datos || {};
  const guia = String(d.orderNumber || "").trim();
  const codigo = String(d.orderCode || "").trim().toUpperCase();
  const instancia = String(d.instanceId || "").trim();
  if (!GUIA_FORMA.test(guia) || !CODIGO_FORMA.test(codigo)) {
    return {ok: false, motivo: "SIN_DATO",
      detalle: "guía o código con forma no válida"};
  }
  if (!INSTANCIA_FORMA.test(instancia)) {
    return {ok: false, motivo: "SIN_INSTANCIA",
      detalle: "no hay cuenta de Shalom Pro conectada"};
  }
  if (!clave) return {ok: false, motivo: "BLOQUEADO", detalle: "sin clave"};
  const url = BASE + "/track/voucher?orderNumber=" + encodeURIComponent(guia) +
    "&orderCode=" + encodeURIComponent(codigo) + "&format=image" +
    "&instanceId=" + encodeURIComponent(instancia);
  let r;
  try {
    r = await fetch(url, {method: "GET", headers: {"x-api-key": clave},
      signal: AbortSignal.timeout(TIEMPO_MAX_MS)});
  } catch (e) {
    const corte = e && (e.name === "TimeoutError" || e.name === "AbortError");
    return {ok: false, motivo: corte ? "ERROR_SHALOM" : "SIN_RED",
      detalle: sanear(e && e.message)};
  }
  if (!r.ok) {
    let texto = "";
    try {
      texto = await r.text();
    } catch (e) {
      texto = "";
    }
    return {ok: false, http: r.status, motivo: motivoDeHttp(r.status, texto),
      detalle: sanear(texto)};
  }
  const largo = Number(r.headers && r.headers.get &&
    r.headers.get("content-length")) || 0;
  if (largo > VOUCHER_MAX) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO",
      detalle: "archivo enorme"};
  }
  let bytes;
  try {
    bytes = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return {ok: false, motivo: "ERROR_SHALOM", detalle: "no se pudo leer"};
  }
  if (!bytes.length || bytes.length > VOUCHER_MAX) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO",
      detalle: bytes.length ? "archivo enorme" : "vacío"};
  }
  let tipo = tipoPorFirma(bytes);
  if (tipo) return {ok: true, bytes: bytes, tipo: tipo};

  const ct = String((r.headers && r.headers.get &&
    r.headers.get("content-type")) || "");
  let json = null;
  try {
    json = JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    json = null;
  }
  if (json !== null) {
    const hallado = buscarArchivo(json);
    if (hallado.bytes) {
      tipo = tipoPorFirma(hallado.bytes);
      if (hallado.bytes.length <= VOUCHER_MAX) {
        return {ok: true, bytes: hallado.bytes, tipo: tipo};
      }
    }
    if (hallado.url) {
      const r2 = await _bajarUrl(hallado.url, clave);
      if (r2.ok) return r2;
    }
  }
  const formaTxt = json !== null ?
    "JSON " + JSON.stringify(forma(json)).slice(0, 220) :
    "inicio «" + bytes.toString("latin1", 0, 8).replace(/[^\x20-\x7E]/g, "·") +
      "»";
  console.warn("voucher: forma no reconocida", ct, formaTxt);
  return {ok: false, motivo: "FORMATO_DESCONOCIDO",
    detalle: "Shalom no devolvió una imagen ni un PDF (" +
      (ct || "sin tipo") + "; " + formaTxt + ")"};
}

async function _bajarUrl(url, clave) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return {ok: false};
  }
  if (u.protocol !== "https:") return {ok: false};
  const mismo = u.origin === new URL(BASE).origin;
  try {
    const r = await fetch(u.toString(), {method: "GET",
      headers: mismo ? {"x-api-key": clave} : {},
      signal: AbortSignal.timeout(TIEMPO_MAX_MS)});
    if (!r.ok) return {ok: false};
    const b = Buffer.from(await r.arrayBuffer());
    const t = tipoPorFirma(b);
    if (!t || b.length > VOUCHER_MAX) return {ok: false};
    return {ok: true, bytes: b, tipo: t};
  } catch (e) {
    return {ok: false};
  }
}

function filasDe(j) {
  const cands = [j, j && j.items, j && j.data, j && j.data && j.data.items,
    j && j.data && j.data.data];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    if (Array.isArray(c)) return c;
  }
  const o = (j && j.data && typeof j.data === "object") ? j.data : j;
  if (o && typeof o === "object" && Object.keys(o).length &&
      Object.keys(o).every((k) => /^[0-9]+$/.test(k))) {
    return Object.keys(o).map((k) => o[k]);
  }
  return [];
}

function deSeguimientoPro(filas, guia) {
  const g = String(guia || "").replace(/\D/g, "");
  if (!g || !Array.isArray(filas)) return null;
  const f = filas.find((x) => x && typeof x === "object" &&
    String(x.guideNumber || "").replace(/\D/g, "") === g);
  if (!f) return null;
  const fuente = "seguimientoPro";
  if (f.packageDelivered === true) {
    return {ok: true, estado: "Entregado", pasos: 3, fuente};
  }
  const txt = String(f.status || "");
  const u = txt.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!u.trim() || /REGISTR|PENDIENT/.test(u)) return null;
  const etapa = shalomEstado.rango(txt);
  if (etapa === null) return null;
  const textos = ["En origen", "En tránsito", shalomEstado.fase(txt).reparto ?
    "En reparto" : "En destino", "Entregado"];
  return {ok: true, estado: textos[etapa], pasos: etapa, fuente};
}

module.exports = {
  deSeguimientoPro,
  filasDe,
  BASE,
  GUIA_FORMA,
  INSTANCIA_FORMA,
  VOUCHER_MAX,
  tipoPorFirma,
  buscarArchivo,
  descargarVoucher,
  PERMITIDAS,
  ORQUESTADAS,
  sanear,
  motivoDeHttp,
  forma,
  traducirValidate,
  traducirTrack,
  traducirInstancias,
  traducirAgencias,
  traducirInstanceStatus,
  traducirDni,
  PASOS,
  esAdminDe,
  traducir,
  barreras,
  llamar,
};
