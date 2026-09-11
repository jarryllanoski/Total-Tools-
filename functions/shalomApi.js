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

// La unica instancia de Shalom Pro del negocio (panel Shalom API → Instancias).
// No es un secreto —identifica CUAL cuenta, no autoriza nada por si sola: sin
// la API key en la cabecera, no sirve de nada— pero vive aca, no en el
// navegador: el negocio tiene una sola cuenta, asi que el panel no necesita
// saber su plomeria interna. Si algun dia hay mas de una instancia, esto pasa
// a ser un parametro en vez de una constante.
const INSTANCE_ID = "3524c6ef-99ad-4988-b62d-8f85d22dbe67";

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

// Los pasos del recorrido, del MAS AVANZADO al menos. El primero que tenga
// dato real manda: asi un envio entregado no se confunde con uno en origen
// solo porque ambos pasos existen en el arbol.
//
// `idx` es la posicion en la barra de 4 pasos que ya pinta el panel y el link
// del cliente (0 origen · 1 transito · 2 destino · 3 entregado). Por eso
// `reparto` comparte el 2 con `destino`: para el cliente, el paquete ya llego
// a su ciudad; que salga a repartirse es un detalle del mismo tramo.
const PASOS = [
  {clave: "entregado", idx: 3, texto: "Entregado"},
  {clave: "reparto", idx: 2, texto: "En reparto"},
  {clave: "destino", idx: 2, texto: "En destino"},
  {clave: "transito", idx: 1, texto: "En tránsito"},
  {clave: "origen", idx: 0, texto: "En origen"},
  {clave: "registrado", idx: 0, texto: "Registrado"},
];

// Vocabulario UNICO para leer un texto de estado y decir en que punto del
// recorrido cae. Vive aca, junto a PASOS, para que no existan dos listas de
// palabras que se desincronicen: el panel importa esta misma idea.
//
// Devuelve: 0..3 (punto de la barra) · "condicion" (demora: no es un punto)
//           · null (no se reconoce — y entonces no contradice a nadie)
/**
 * @param {string} t texto de estado
 * @return {number|string|null} indice, "condicion", o null
 */
function _idxDeTexto(t) {
  const u = String(t || "").toUpperCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!u.trim()) return null;
  // El orden importa: "demora" se comprueba primero porque una frase puede
  // mezclar condicion y tramo ("demora en transito") y la condicion manda.
  if (u.includes("DEMORA") || u.includes("RETRAS")) return "condicion";
  if (u.includes("ENTREGAD")) return 3;
  if (u.includes("REPART")) return 2;
  if (u.includes("DESTINO") || u.includes("AGENCIA") ||
      u.includes("RECOJO") || u.includes("RECOGER")) return 2;
  if (u.includes("TRANSITO") || u.includes("CAMINO") ||
      u.includes("RUTA")) return 1;
  if (u.includes("ORIGEN") || u.includes("REGISTRAD")) return 0;
  return null;
}

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

  // ── Forma REAL, medida contra la API el 31/08/2026 ────────────────────────
  //   { search:   {success, message, data:{...detalles del envio...}},
  //     statuses: {success, message, data:{ registrado, origen, transito,
  //                destino, entregado, reparto, demora }} }
  // El envoltorio se llama "statuses" (en ingles), no "estados".
  const st = crudo.statuses || crudo.estados;
  if (st && typeof st === "object") {
    const arbol = (st.data && typeof st.data === "object") ? st.data : {};
    // `message` es la redaccion del propio Shalom ("En tránsito", "Entregado").
    const msg = String(st.message || "").trim();

    // ── QUIEN MANDA: EL RECORRIDO, NO LA REDACCION ────────────────────────
    // Antes `message` pisaba SIEMPRE al paso encontrado. Costo dos fallos
    // reales, con la misma forma:
    //   · guia entregada que el panel mostraba como "Demora de envios"
    //   · guia En destino que el panel mostraba como "En transito" (95046118,
    //     11/09/2026: Shalom mostraba En destino en su web desde las 08:34 y
    //     el panel decia En transito con "visto recien")
    // El arbol de pasos es un hecho fechado; `message` es una frase que puede
    // venir atrasada. Cuando se contradicen, gana el hecho.
    //
    // Pero `message` no se tira: cuando CONCUERDA con el paso se prefiere, que
    // es la redaccion que el cliente ve en la web de Shalom. Y cuando no se
    // puede clasificar (una frase que no reconocemos) tampoco contradice nada,
    // asi que se respeta. Solo se descarta la contradiccion demostrable.
    const idxMsg = _idxDeTexto(msg);

    // "demora" no es un paso del recorrido: es una condicion que se superpone.
    const demorado = _pasoCumplido(arbol.demora);

    for (const p of PASOS) {
      if (!_pasoCumplido(arbol[p.clave])) continue;

      let texto;
      let discrepancia = "";
      if (!msg) {
        texto = p.texto;
      } else if (idxMsg === null) {
        texto = msg; // no clasificable: no contradice, se respeta
      } else if (idxMsg === "condicion") {
        // Una condicion (demora) no puede ser el estado de un envio que ya
        // llego. Solo describe un tramo en curso.
        texto = p.idx <= 1 ? msg : p.texto;
        if (p.idx > 1) discrepancia = "message=condicion vs paso=" + p.clave;
      } else if (idxMsg === p.idx) {
        texto = msg; // concuerda: gana la redaccion de Shalom
      } else {
        texto = p.texto; // contradice: gana el arbol
        discrepancia = "message=idx" + idxMsg + " vs paso=" + p.clave;
      }

      // La demora solo describe un envio EN CAMINO. Una vez que llego a
      // destino (o se entrego), el retraso es historia: informarlo como
      // estado actual manda a buscar un paquete que ya esta en la agencia.
      if (demorado && p.idx <= 1 && !/demor/i.test(texto)) {
        texto = "Demora de envíos";
      }

      const r = {
        ok: true,
        estado: String(texto).trim(),
        pasos: p.idx,
        fecha: _fechaDe(arbol[p.clave]),
      };
      if (discrepancia) r.discrepancia = discrepancia;
      if (demorado) r.demorado = true;

      // Confirmacion independiente: `search.data.entregado`. Antes se guardaba
      // y no se miraba — justo el dato que habria delatado el bug de la guia
      // entregada. Ahora se usa, y SOLO HACIA ADELANTE: si Shalom afirma que
      // se entrego y el arbol todavia no lo registra, se cree la afirmacion.
      // Al reves no: un paso fechado pesa mas que un booleano, asi que un
      // `false` nunca deshace un `entregado` del arbol.
      const det = (crudo.search && crudo.search.data) || null;
      if (det && typeof det.entregado === "boolean") {
        r.entregado = det.entregado;
        if (det.entregado === true && p.idx < 3) {
          r.pasos = 3;
          r.estado = "Entregado";
          r.ascendido = "search.entregado";
        }
      }
      return r;
    }
    // Estructura reconocida pero ningun paso cumplido: la guia existe y aun no
    // registra movimiento. No es un fallo, pero tampoco hay estado que mostrar.
    return {ok: false, motivo: MOTIVO.SIN_DATO};
  }

  // A partir de aqui, formas alternativas por si la API cambia. No se han
  // observado, pero cuestan poco y evitan quedarse ciego ante un cambio menor.
  const cont = crudo.data || crudo;
  const pasosObj = (cont && (cont.data || cont)) || {};
  const tienePasos = PASOS.some((p) =>
    Object.prototype.hasOwnProperty.call(pasosObj, p.clave));

  if (tienePasos) {
    for (const p of PASOS) {
      if (_pasoCumplido(pasosObj[p.clave])) {
        const msg2 = (cont && (cont.message || cont.mensaje)) || "";
        return {
          ok: true,
          estado: String(msg2 || p.texto).trim(),
          pasos: p.idx,
          fecha: _fechaDe(pasosObj[p.clave]),
        };
      }
    }
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

/**
 * Interpreta la respuesta de /instances/status.
 *
 * FORMA MEDIDA (respuesta real del 2026-09-09, no supuesta):
 *   { isLoggedIn: boolean, username: string|null, url: string }
 *
 * "Instancia encendida" y "sesion de Shalom viva" NO son lo mismo: la pantalla
 * de Instancias puede decir Conectado (el robot corre) mientras isLoggedIn es
 * false (la cuenta se deslogueo y el robot quedo parado en /login). Este
 * traductor mira la sesion, que es lo que decide si un registro va a funcionar.
 *
 * Solo afirma algo cuando isLoggedIn es un booleano de verdad. Si Shalom
 * cambia la forma, devuelve conocido:false y quien llama muestra la respuesta
 * cruda — nunca un "conectado" que nadie midio. Esa es exactamente la regla
 * que faltaba cuando el traductor de /track daba por bueno un formato que ya
 * no existia.
 * @param {*} data cuerpo devuelto por Shalom
 * @return {Object} {conocido:false} o {conocido:true, conectada, usuario, url}
 */
function interpretarInstancia(data) {
  const d = data && typeof data === "object" ? data : null;
  if (!d || typeof d.isLoggedIn !== "boolean") return {conocido: false};
  return {
    conocido: true,
    conectada: d.isLoggedIn,
    usuario: typeof d.username === "string" && d.username ? d.username : null,
    url: typeof d.url === "string" ? d.url : "",
  };
}

/**
 * ¿La instancia de Shalom Pro sigue con sesion activa? Se llama ANTES de
 * intentar registrar un envio: si la sesion se cayo, es mejor enterarse con
 * un aviso claro que con 10 registros fallidos en fila sin saber por que.
 * Devuelve la respuesta cruda en `data` Y su lectura en `sesion`. Las dos:
 * la cruda deja diagnosticar el dia que Shalom cambie algo, sin tener que
 * volver a desplegar una version especial para mirar.
 * @param {string} apiKey clave
 * @return {Promise<Object>} {ok:true, data, sesion} o {ok:false, motivo}
 */
async function instanceStatus(apiKey) {
  const r = await llamar(apiKey, "/instances/status", {
    method: "POST",
    body: {instanceId: INSTANCE_ID},
  });
  if (!r.ok) return r;
  return {ok: true, data: r.data, sesion: interpretarInstancia(r.data)};
}

// ── Diagnostico: la FORMA de una respuesta, nunca su contenido ──────────────
// La documentacion publica describe que enviar pero no que devuelve. En vez de
// suponer la forma (y escribir un traductor contra una hipotesis), se mide: se
// hace una llamada real y se devuelve solo el ESQUELETO — nombres de campos y
// tipos, con los valores reemplazados por su tipo.
//
// Por que devolver tipos y no valores: la respuesta trae datos de personas
// (nombre y documento del destinatario). Lo que no sale del servidor no se
// puede filtrar por accidente. El esquema alcanza para escribir el traductor.

/**
 * Reemplaza cada valor por su tipo, conservando la estructura.
 * @param {*} v valor a describir
 * @param {number} prof profundidad actual (corta la recursion)
 * @return {*} el mismo arbol, con tipos en lugar de valores
 */
function esquemaDe(v, prof) {
  prof = prof || 0;
  if (prof > 6) return "…(mas profundo)";
  if (v === null) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "array vacio";
    return ["array de " + v.length, esquemaDe(v[0], prof + 1)];
  }
  const t = typeof v;
  if (t !== "object") return t;
  const out = {};
  Object.keys(v).slice(0, 40).forEach((k) => {
    out[k] = esquemaDe(v[k], prof + 1);
  });
  return out;
}

/**
 * Trae el catalogo completo de agencias.
 * @param {string} apiKey clave
 * @return {Promise<Object>} {ok:true, data} o {ok:false, motivo}
 */
async function agencies(apiKey) {
  return llamar(apiKey, "/agencies");
}

// ── Que se puede diagnosticar ───────────────────────────────────────────────
// Un mapa, no un if por endpoint: cada vez que haga falta medir la forma de
// una respuesta nueva se agrega una linea aqui y ya se puede consultar desde
// el panel. La documentacion de la API describe que enviar pero no que
// devuelve, asi que esto se va a necesitar para cada endpoint que integremos.
const DIAGNOSTICABLES = {
  track: (apiKey, p) => llamar(apiKey, "/track", {
    method: "POST",
    body: {
      orderNumber: String(p.orderNumber || ""),
      orderCode: String(p.orderCode || ""),
    },
  }),
  agencies: (apiKey) => llamar(apiKey, "/agencies"),
  validate: (apiKey) => llamar(apiKey, "/validate"),
  instanceStatus: (apiKey) => instanceStatus(apiKey),
};

/**
 * Devuelve la FORMA de la respuesta de un endpoint, no su contenido.
 * Los valores se reemplazan por su tipo, asi que no salen datos de personas.
 * Para /track incluye ademas como lo interpreta hoy el traductor, para ver de
 * un vistazo si acierta.
 * @param {string} apiKey clave
 * @param {string} de nombre en DIAGNOSTICABLES
 * @param {Object} params parametros del endpoint (guia y codigo para /track)
 * @return {Promise<Object>} {ok, esquema, interpretado} o {ok:false, motivo}
 */
async function esquema(apiKey, de, params) {
  const fn = DIAGNOSTICABLES[de];
  if (!fn) {
    return {
      ok: false,
      motivo: "NO_DIAGNOSTICABLE",
      disponibles: Object.keys(DIAGNOSTICABLES),
    };
  }
  const r = await fn(apiKey, params || {});
  if (!r.ok) return r;
  const out = {ok: true, de: de, esquema: esquemaDe(r.data)};
  // Cuantos elementos trae, si es una lista: para /agencies es el dato que
  // decide si el catalogo esta completo o la API pagino.
  const lista = _listaDe(r.data);
  if (lista) out.cuantos = lista.length;
  if (de === "track") out.interpretado = normalizarTrack(r.data);
  return out;
}

/**
 * Encuentra la lista dentro de una respuesta, venga como venga envuelta.
 * @param {*} data respuesta cruda
 * @return {Array|null} la lista, o null si no hay
 */
function _listaDe(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return null;
  const claves = ["agencias", "agencies", "data", "resultados", "results",
    "items", "terminales"];
  for (const k of claves) {
    if (Array.isArray(data[k])) return data[k];
    // Un nivel mas adentro: {data:{agencies:[...]}}
    if (data[k] && typeof data[k] === "object") {
      for (const k2 of claves) {
        if (Array.isArray(data[k][k2])) return data[k][k2];
      }
    }
  }
  return null;
}

module.exports = {
  BASE,
  MOTIVO,
  INSTANCE_ID,
  llamar,
  normalizarTrack,
  _pasosDesdeTexto,
  _listaDe,
  esquemaDe,
  esquema,
  agencies,
  track,
  validate,
  instanceStatus,
  interpretarInstancia,
  _idxDeTexto,
};
