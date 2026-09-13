"use strict";

/**
 * functions/shalomPuerta.js — la puerta única a la API de Shalom
 * ===============================================================
 * Se reconstruye endpoint por endpoint. Hoy solo sabe hacer UNA cosa:
 * `GET /validate`. Cada operación entra aquí cuando su forma real está
 * medida contra la API y traducida con pruebas — no antes.
 *
 * POR QUÉ UNA LISTA BLANCA Y NO UN PROXY
 * Un proxy ciego dejaría que cualquiera con sesión ejecutara `DELETE
 * /instances` o `POST /instances/logout` desde la consola del navegador, y
 * eso borra la sesión persistida y mata el auto-login. Solo se puede pedir
 * lo que está en PERMITIDAS, y ahí no hay nada destructivo.
 *
 * POR QUÉ LA CLAVE NO SALE DE AQUÍ
 * Vive en Secret Manager y solo la ve el servidor. Además, todo texto que
 * sale hacia el navegador pasa por `sanear()`: si algún día un mensaje de
 * error de Shalom devolviera la clave, no llega al cliente.
 *
 * Este archivo es lógica pura + una función de red. Se puede `require` desde
 * las pruebas sin levantar nada.
 */


const BASE = "https://api.shalom-api.lat";
const TIEMPO_MAX_MS = 20000;

/**
 * Lo único que se puede pedir. Añadir una entrada aquí es una decisión
 * consciente: implica que su respuesta ya se midió y se tradujo.
 */
const PERMITIDAS = {
  validate: {metodo: "GET", ruta: "/validate"},
  // `soloMedir` = se puede consultar con `esquema` pero NO usar todavía: su
  // respuesta aún no está traducida. Pedirla como operación normal responde
  // SIN_TRADUCTOR en vez de devolver algo a medio entender. Es el estado
  // intermedio de cada endpoint: medible antes que conectado.
  track: {metodo: "POST", ruta: "/track", soloMedir: true},
};

/**
 * Quita de un texto cualquier cosa con forma de clave antes de devolverlo.
 * @param {*} texto texto de origen (puede no ser string)
 * @return {string} texto saneado y recortado
 */
function sanear(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
      .replace(/sk_[A-Za-z0-9_-]{6,}/g, "sk_***")
      .slice(0, 300);
}

/**
 * Traduce el código HTTP de Shalom al vocabulario del panel.
 * Los motivos del lado de Shalom van aparte de los del panel a propósito:
 * mezclarlos manda a revisar la cuenta cuando el problema es la sesión.
 * @param {number} status código HTTP
 * @return {string} motivo del contrato
 */
function motivoDeHttp(status) {
  if (status === 401 || status === 403) return "BLOQUEADO";
  if (status === 429) return "LIMITE";
  if (status === 404) return "NO_ENCONTRADO";
  return "ERROR_SHALOM";
}

/**
 * La FORMA de un valor, sin un solo valor dentro. Es la herramienta de
 * diagnóstico: deja escribir el contrato contra lo que la API devuelve de
 * verdad sin que ningún dato de un cliente salga del servidor.
 * @param {*} v valor a describir
 * @param {number} [prof] profundidad actual
 * @return {*} descripción de tipos
 */
function forma(v, prof) {
  prof = prof || 0;
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (prof >= 4) return "array";
    return "array[" + v.length + "] de " +
      (v.length ? JSON.stringify(forma(v[0], prof + 1)) : "?");
  }
  const t = typeof v;
  if (t !== "object") return t;
  if (prof >= 4) return "objeto";
  const o = {};
  Object.keys(v).slice(0, 40).forEach((k) => {
    o[k] = forma(v[k], prof + 1);
  });
  return o;
}

/**
 * Traduce la respuesta de `GET /validate` al contrato del panel.
 *
 * REGLA DE ORO: jamás ok:true sin dato real. Si `valid` no es un booleano,
 * no sabemos qué nos respondieron y se dice FORMATO_DESCONOCIDO en vez de
 * inventar un éxito.
 *
 * ⚠️ `limite` en null significa PLAN ILIMITADO, no "sin cuota". La
 * documentación muestra `limit: 1000`, pero con plan ilimitado Shalom manda
 * `null` — y `remaining` también (contradicción 5 de SHALOM-API.md, medida el
 * 13 sep 2026 contra la API real). Convertirlo a 0 diría lo contrario.
 *
 * FORMA REAL MEDIDA — seis campos, no los cuatro documentados:
 *   valid:boolean · userId:string · limit:null · currentUsage:number
 *   · remaining:null · message:string
 *
 * `userId` y `message` NO están en la documentación. `message` se devuelve
 * (es lo que Shalom dice de tu clave, y mostrar sus palabras es mejor que
 * inventar las mías). `userId` NO: es un identificador de la cuenta que
 * ninguna pantalla necesita, y lo que no hace falta no viaja al navegador.
 *
 * Los campos que no se reconocen se ignoran a propósito: si Shalom añade uno
 * mañana, esto sigue funcionando en vez de romperse.
 * @param {*} j cuerpo JSON de Shalom
 * @return {Object} respuesta del contrato
 */
function traducirValidate(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  }
  if (typeof j.valid !== "boolean") {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  }
  // Una clave rechazada es una respuesta legítima de Shalom, pero para quien
  // llama es lo mismo que estar bloqueado: se traduce a su motivo.
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

/**
 * Llama a Shalom. Devuelve el JSON crudo o un motivo; NO traduce.
 * Separado a propósito: así la traducción se prueba sin red y la red se
 * prueba sin traducción.
 * @param {string} op nombre de la operación en PERMITIDAS
 * @param {string} clave API key
 * @param {Object} [cuerpo] cuerpo para las operaciones POST
 * @return {Promise<Object>} {ok:true, json} o {ok:false, motivo, detalle}
 */
async function llamar(op, clave, cuerpo) {
  const def = PERMITIDAS[op];
  if (!def) return {ok: false, motivo: "NO_PERMITIDO"};
  if (!clave) return {ok: false, motivo: "BLOQUEADO", detalle: "sin clave"};

  let r;
  try {
    const opciones = {
      method: def.metodo,
      headers: {"x-api-key": clave},
      signal: AbortSignal.timeout(TIEMPO_MAX_MS),
    };
    if (def.metodo === "POST") {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo || {});
    }
    r = await fetch(BASE + def.ruta, opciones);
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
      motivo: motivoDeHttp(r.status),
      http: r.status,
      detalle: sanear((json && (json.message || json.error)) || texto),
    };
  }
  if (json === null) {
    return {ok: false, motivo: "FORMATO_DESCONOCIDO", detalle: sanear(texto)};
  }
  return {ok: true, json: json};
}

/**
 * Las cuatro barreras, en orden y como función pura.
 *
 * Vive aquí y no en index.js para que se pueda PROBAR. Es el límite de
 * seguridad del sistema: si el orden se rompe —por ejemplo, si la lista
 * blanca se mirara antes que la sesión— un desconocido podría averiguar qué
 * operaciones existen. Un límite de seguridad sin pruebas es una intención.
 *
 * `deps.verificar` recibe el token y devuelve el usuario, o lanza. Se inyecta
 * para poder probar sin Firebase.
 * @param {Object} entrada {metodo, authorization, cuerpo}
 * @param {Object} deps {verificar, admins}
 * @return {Promise<Object>} {corte:{http,motivo}} o {ok:true, destino, ...}
 */
async function barreras(entrada, deps) {
  const cortar = (http, motivo) => ({corte: {http: http, motivo: motivo}});

  // 1 · POST con sesión válida
  if (entrada.metodo !== "POST") return cortar(405, "NO_PERMITIDO");
  const bearer = String(entrada.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!bearer) return cortar(401, "SIN_SESION");
  let usuario;
  try {
    usuario = await deps.verificar(bearer[1]);
  } catch (e) {
    return cortar(401, "SIN_SESION");
  }

  // 2 · administrador. Va ANTES de mirar la operación: a un desconocido no se
  // le confirma ni qué operaciones existen.
  const correo = String((usuario && usuario.email) || "").toLowerCase();
  const admins = (deps.admins || []).map((x) => String(x).toLowerCase());
  if (!correo || admins.indexOf(correo) < 0) return cortar(403, "SIN_PERMISO");

  // 3 · lista blanca
  const cuerpo = (entrada.cuerpo && typeof entrada.cuerpo === "object") ?
    entrada.cuerpo : {};
  const op = String(cuerpo.op || "");
  const diagnostico = op === "esquema";
  const destino = diagnostico ? String(cuerpo.de || "") : op;
  if (!Object.prototype.hasOwnProperty.call(PERMITIDAS, destino)) {
    return cortar(200, "NO_PERMITIDO");
  }
  // Medible sí, usable todavía no. Sin esta guarda, un endpoint recién
  // añadido devolvería su JSON crudo por la puerta de otro traductor.
  if (!diagnostico && PERMITIDAS[destino].soloMedir) {
    return cortar(200, "SIN_TRADUCTOR");
  }

  // 4 · recién ahora quien llama puede usar la clave
  return {ok: true, destino: destino, diagnostico: diagnostico,
    datos: cuerpo.datos, correo: correo};
}

/**
 * Traduce la respuesta cruda del endpoint que sea. Un endpoint sin traductor
 * NO devuelve su JSON: eso es justo lo que hace que una forma mal entendida
 * llegue a la pantalla como si fuera un dato bueno.
 * @param {string} op operación
 * @param {*} json cuerpo devuelto por Shalom
 * @return {Object} respuesta del contrato
 */
function traducir(op, json) {
  if (op === "validate") return traducirValidate(json);
  return {ok: false, motivo: "SIN_TRADUCTOR"};
}

module.exports = {
  BASE,
  PERMITIDAS,
  sanear,
  motivoDeHttp,
  forma,
  traducirValidate,
  traducir,
  barreras,
  llamar,
};
