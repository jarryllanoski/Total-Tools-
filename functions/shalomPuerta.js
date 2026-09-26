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
// Hasta dónde baja el diagnóstico. Con 4 se cortaba justo donde hacía falta:
// `statuses.data.entregado.cliente` salía como "objeto" a secas, y ahí es
// donde vive quién recibió el paquete. Describir tipos no pesa nada; quedarse
// corto obliga a otra ronda de despliegue y medición.
const PROF_MAX = 8;

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
  track: {metodo: "POST", ruta: "/track"},
  /* La sesión de Shalom Pro. Se abre en `soloMedir` a propósito: la
     documentación de esta API y la realidad ya se contradijeron seis veces
     (ver docs/SHALOM-API.md), así que primero se mira la forma con `esquema`
     y recién después se escribe el traductor.
     Va el GET y no el `POST /instances/status` porque el POST exige un
     `instanceId` que el panel no tiene guardado en ninguna parte, mientras
     que el GET no pide nada Y DEVUELVE ESE ID — que es además la llave que
     van a necesitar el ticket y el registro de envíos. No gasta cuota y no
     puede crear ni borrar nada. */
  instances: {metodo: "GET", ruta: "/instances"},
  /* El catálogo de agencias. Va la variante PÚBLICA a propósito: devuelve la
     misma estructura que `/agencies` y NO CONSUME CUOTA, así que refrescar el
     catálogo sale gratis. `publico` hace que la puerta no mande la clave: una
     credencial no viaja donde no hace falta.
     Sigue pasando por aquí y no por el navegador porque su API responde
     `access-control-allow-origin: https://shalom-api.lat` — medido el
     22/09/2026 —, así que un fetch desde el panel lo bloquearía CORS.
     En `soloMedir` hasta medir su forma: la doc dice 552 agencias con 48
     campos, y la doc de esta API ya se equivocó siete veces. */
  agencies: {metodo: "GET", ruta: "/public/agencies", publico: true},
  /* RENIEC. Es lo que convierte el registro de envios en algo que no hay que
     adivinar: `POST /account/register` pide el nombre PARTIDO en nombres,
     apellido paterno y apellido materno, y partir "JARLYN LLANOS ARTEAGA" a
     ojo se equivoca con cualquier nombre compuesto. RENIEC ya los da
     separados.

     ⚠️ EL DNI VA EN LA RUTA, y eso no es un detalle. Un parametro de ruta NO
     se puede escapar: un "../" ahi no ensucia un valor, CAMBIA EL ENDPOINT al
     que llamas — `/account/dni/../../instances` seria otra cosa. Por eso
     `rutaParam` no codifica: EXIGE la forma, y si no cuadra la peticion no
     sale. La forma es la que documenta su API: 8 digitos, ni uno mas. */
  dni: {metodo: "GET", ruta: "/account/dni/{dni}",
    rutaParam: {dni: /^[0-9]{8}$/}, soloMedir: true},
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
/* Solo dígitos y separadores, empezando por un dígito. Un nombre nunca entra
   (tiene letras); una fecha o un monto, sí. */
const _SOLO_NUMEROS = /^[0-9][0-9\-/: .TZ+]*$/;

/**
 * El tipo de un texto — y si parece una fecha o un número, TAMBIÉN su forma,
 * con los dígitos tapados: "2026-08-19 16:10" sale como "####-##-## ##:##".
 *
 * Hace falta: el formato de fecha decide si se puede ordenar y mostrar bien, y
 * no está documentado. Sin esto habría que pedir un valor real — o sea, un
 * dato de un cliente pasando por el chat.
 *
 * Solo se destapa la forma de lo que es puro número: cualquier texto con
 * letras (un nombre, una dirección) sale como "string" a secas.
 * @param {string} s texto
 * @return {string} descripción
 */
function _formaTexto(s) {
  if (s.length <= 40 && _SOLO_NUMEROS.test(s)) {
    return "string(" + s.replace(/[0-9]/g, "#") + ")";
  }
  return "string";
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
  // Un endpoint público no necesita clave, así que tampoco se le manda: una
  // credencial no viaja donde no hace falta, ni siquiera a un sitio de
  // confianza. Y si falta la clave, eso ya no puede bloquear su consulta.
  if (!clave && !def.publico) {
    return {ok: false, motivo: "BLOQUEADO", detalle: "sin clave"};
  }

  /* Los parametros que van DENTRO de la ruta. Se validan contra la forma
     declarada y se sustituyen; no se codifican. Codificar sirve para un
     valor —un querystring, un cuerpo—, pero aqui el valor ES parte de la
     direccion: lo unico seguro es no dejar pasar nada que no tenga la forma
     exacta que se espera. */
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
  // Un hueco sin rellenar significa que la declaracion y lo que llego no
  // coinciden. Antes de llamar a una URL con una llave dentro, no se llama.
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
    if (def.metodo === "POST") {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(cuerpo || {});
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

/* ── /track ───────────────────────────────────────────────────────────────
   FORMA REAL MEDIDA el 13 sep 2026 con `esquema`:

     statuses.data → registrado · origen · transito · destino
                     · reparto · entregado · demora

   Cada rama es `null` mientras no ocurre y un objeto con `fecha` cuando
   ocurre. `transito` trae además `carguero`, `completo` y `cargueros[]`;
   `entregado` trae `cliente:{nombre,documento}` — QUIÉN recibió el paquete.

   ⚠️ `statuses` es un OBJETO. La documentación lo pinta como array. */

// El orden de esta lista ES el avance del envío. Gana el ÚLTIMO que tenga
// fecha, no el de número más alto: `destino` y `reparto` comparten pasos:2 y
// aun así reparto va después.
const PASOS = [
  {clave: "registrado", texto: "En origen", pasos: 0},
  {clave: "origen", texto: "En origen", pasos: 0},
  {clave: "transito", texto: "En tránsito", pasos: 1},
  {clave: "destino", texto: "En destino", pasos: 2},
  {clave: "reparto", texto: "En reparto", pasos: 2},
  {clave: "entregado", texto: "Entregado", pasos: 3},
];

/**
 * La fecha de una rama del árbol, o null si esa rama no ha ocurrido.
 * @param {*} rama valor de la rama
 * @return {?string} fecha tal cual la manda Shalom
 */
function _fechaDe(rama) {
  if (!rama || typeof rama !== "object" || Array.isArray(rama)) return null;
  const f = rama.fecha;
  return (typeof f === "string" && f.trim()) ? f.trim() : null;
}

/**
 * Traduce `POST /track`.
 *
 * ⚠️ `demora` NO ES UN PASO, y por eso no está en PASOS. Es una bandera que
 * viaja aparte. Aquí está la lección más cara de este proyecto: cuando la
 * demora podía convertirse en el estado, un paquete ENTREGADO se mostraba
 * como "Demora de envíos" — el envío desandaba el camino y había que
 * explicárselo al cliente. Con demora fuera de la lista de pasos, eso no es
 * que esté arreglado: es que no se puede escribir.
 *
 * La fecha se devuelve TAL CUAL la manda Shalom. No se parsea: su formato no
 * está medido todavía, y adivinarlo es como se ordenan mal los historiales.
 * @param {*} j cuerpo JSON de Shalom
 * @return {Object} respuesta del contrato
 */
function traducirTrack(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  const st = j.statuses;

  /* SIN SEGUIMIENTO NO ES LO MISMO QUE NO ENTENDER LA RESPUESTA.
     Medido con la guía 94578959 (un retorno a origen): Shalom contesta 200 con
     `statuses: null` y un `search` que solo trae {message, success}, sin
     `data`. Es una respuesta clara — "de esta guía no sé nada" —, no una que
     no sepamos leer.
     La diferencia no es cosmética: FORMATO_DESCONOCIDO manda a revisar la
     integración, y NO_ENCONTRADO manda a revisar el número de guía. Confundir
     el lado del panel con el lado de Shalom ya costó días una vez. */
  if (st === null || st === undefined) {
    // Con `search` delante es la forma medida y la lectura es segura. Sin él
    // no hay respuesta que reconocer: un cuerpo vacío no dice "no encontrado",
    // no dice nada, y afirmar lo primero sería inventar.
    const bus = j.search;
    if (!bus || typeof bus !== "object" || Array.isArray(bus)) return raro;
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: sanear(bus.message)};
  }
  if (typeof st !== "object" || Array.isArray(st)) return raro;
  if (st.success === false) {
    return {ok: false, motivo: "NO_ENCONTRADO", detalle: sanear(st.message)};
  }
  const d = st.data;
  // Mismo caso un nivel más abajo: el árbol ausente es "no hay seguimiento".
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
      alcanzado = p; // el último con fecha manda
    }
  });
  // REGLA DE ORO: sin un paso real, no hay éxito. Un árbol entero en null es
  // una guía que Shalom aún no registró — no un error, pero tampoco un dato.
  if (!alcanzado) return {ok: false, motivo: "SIN_DATO"};

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
    // Se llama `pasos` y no `paso` porque ese es el nombre del contrato que ya
    // existe (ver la cabecera de shalom.js) y el que lee el aplicador de
    // tracking.js para su guarda de no-retroceso. Dos nombres para lo mismo es
    // como una guarda deja de guardar.
    pasos: alcanzado.pasos,
    fecha: arbol[alcanzado.clave],
    demora: demora ? {fecha: demora} : null,
    // Quién recibió: solo tiene sentido si de verdad se entregó.
    recibio: alcanzado.clave === "entregado" ? recibio : null,
    arbol: arbol,
  };
}

/**
 * ¿Este usuario es administrador?
 *
 * ⚠️ EL CORREO SOLO VALE SI ESTA VERIFICADO — misma regla que firestore.rules,
 * y por el mismo motivo: Firebase deja que cualquiera cree una cuenta con
 * CUALQUIER correo sin comprobar que sea suyo. Sin esta linea, alguien que
 * sepa uno de estos correos se registra con el, pone su contrasena, y habla
 * con la API de Shalom del negocio.
 *
 * No hay excepciones. Hubo una —una cuenta creada a mano, sin correo
 * verificado— y se retiro el 20 sep 2026 junto con la cuenta: una contrasena
 * de un buzon que no existe no se puede cambiar ni recuperar, asi que no era
 * una llave de emergencia sino una llave perdida.
 * @param {Object} usuario token decodificado
 * @param {Array<string>} admins correos autorizados
 * @return {boolean} true si puede
 */
function esAdminDe(usuario, admins) {
  const correo = String((usuario && usuario.email) || "").toLowerCase();
  if (!correo) return false;
  if (usuario.email_verified !== true) return false;
  const lista = (admins || []).map((x) => String(x).toLowerCase());
  return lista.indexOf(correo) >= 0;
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
  if (!esAdminDe(usuario, deps.admins, deps.legado)) {
    return cortar(403, "SIN_PERMISO");
  }
  const correo = String((usuario && usuario.email) || "").toLowerCase();

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
 * Traduce la respuesta de `GET /instances` al contrato del panel.
 *
 * FORMA REAL MEDIDA (22 sep 2026, contra la API desplegada):
 *   {instances: [{id:string, name:string, username:string,
 *                 createdAt:string(ISO con milisegundos), isLoggedIn:boolean}]}
 *
 * La documentación la pinta PLANA; viene envuelta en `instances`. Una vez más
 * la doc y la realidad no coinciden — por eso se mide antes de traducir.
 *
 * REGLA DE ORO, la de este endpoint en particular: solo se afirma algo cuando
 * `isLoggedIn` es un booleano de verdad. Si Shalom cambia la forma se devuelve
 * FORMATO_DESCONOCIDO y el panel enseña la respuesta cruda, en vez de inventar
 * un "conectado" que haría fallar un lote entero de registros sin decir por
 * qué. Es exactamente lo que faltaba cuando el traductor de /track daba por
 * bueno un formato que ya no existía.
 *
 * ⚠️ NINGUNA instancia y VARIAS instancias son cosas distintas, y ninguna de
 * las dos es "la sesión está caída":
 *   - 0 → no hay cuenta de Shalom Pro que consultar.
 *   - >1 → no se puede saber CUÁL usa el panel, y elegir la primera sería
 *     adivinar. Con dos instancias, una dentro y otra fuera, afirmar por la
 *     primera es una mentira que se paga con un lote de registros fallidos.
 *
 * `url` (dónde quedó parado el robot) NO lo da este endpoint, solo el
 * `POST /instances/status`. Va en null a propósito: el panel no pinta el
 * enlace en vez de inventarse una dirección.
 * @param {*} j cuerpo JSON de Shalom
 * @return {Object} respuesta del contrato
 */
function traducirInstancias(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  const lista = j.instances;
  if (!Array.isArray(lista)) return raro;
  if (!lista.length) return {ok: false, motivo: "SIN_INSTANCIA"};
  if (lista.length > 1) return {ok: false, motivo: "VARIAS_INSTANCIAS"};
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
      // La llave que van a necesitar el ticket y el registro de envíos. No se
      // guarda en ninguna parte a propósito: pedirla es una consulta que no
      // gasta cuota, y un id guardado puede quedar viejo si la instancia se
      // rehace. Menos estado que mantener, y nunca desfasado.
      id: txt(it.id),
      url: null,
    },
  };
}

/**
 * El texto de un valor, o "" si no hay. Un número se convierte a texto a
 * propósito — ver `traducirAgencias`.
 * @param {*} v valor
 * @return {string} texto
 */
function _txt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return isFinite(v) ? String(v) : "";
  if (typeof v === "string") return v.trim();
  return "";
}

/**
 * Traduce `GET /public/agencies` al esquema común del catálogo — el MISMO que
 * ya usa el buscador del formulario, así no hay que tocarlo.
 *
 * FORMA REAL MEDIDA (24 sep 2026, contra la API desplegada): 34 campos por
 * agencia, no los 48 que dice la documentación para `/agencies`. Faltan
 * `hora_domingo` y `referencia`. Se comprobó que **no las usa nadie** (el
 * formulario lee `ag.horario || ag.hora_atencion`, y `hora_atencion` sí
 * viene), así que se quedan vacías en vez de mentir con un dato inventado.
 * Es la contradicción nº 8 entre la documentación de esta API y la realidad.
 *
 * ⚠️ `ter_id` LLEGA COMO NÚMERO y en el catálogo guardado es TEXTO ("3").
 * Se normaliza a texto aquí, en un solo sitio. Sin esto, el día que se
 * verifique la agencia antes de registrar un envío, `3 !== "3"` fallaría en
 * silencio — y un envío sin agencia verificada es un paquete pagado que puede
 * salir a la ciudad equivocada.
 *
 * ⚠️ No hay campo `distrito`: la API manda `zona`. Es el mismo mapeo que hace
 * `_mapShalom` en el navegador. Antes de reemplazar el catálogo, el extractor
 * compara con el que ya está en uso, así que un cambio masivo de distritos se
 * vería antes de aceptar nada.
 *
 * Una agencia sin id no entra: no sirve para registrar y ensucia el catálogo.
 * Cuántas se descartaron se DICE, no se calla.
 * @param {*} j cuerpo JSON de Shalom
 * @return {Object} respuesta del contrato
 */
function traducirAgencias(j) {
  const raro = {ok: false, motivo: "FORMATO_DESCONOCIDO"};
  if (!j || typeof j !== "object" || Array.isArray(j)) return raro;
  // Jamás ok:true sin dato real: si no dice que salió bien, no salió bien.
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
      referencia: "", // no viene en la variante pública
      telefono: _txt(a.telefono),
      horario: _txt(a.hora_atencion),
      horarioDom: "", // tampoco viene, y no lo usa nadie
      latitud: _txt(a.latitud),
      longitud: _txt(a.longitud),
    });
  });

  // 554 agencias que se vuelven 0 no es un catálogo vacío: es que cambió la
  // forma. Reemplazar el catálogo con eso lo dejaría inservible.
  if (!agencias.length) return raro;

  return {ok: true, agencias: agencias, total: agencias.length, sinId: sinId};
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
  if (op === "track") return traducirTrack(json);
  if (op === "instances") return traducirInstancias(json);
  if (op === "agencies") return traducirAgencias(json);
  return {ok: false, motivo: "SIN_TRADUCTOR"};
}

module.exports = {
  BASE,
  PERMITIDAS,
  sanear,
  motivoDeHttp,
  forma,
  traducirValidate,
  traducirTrack,
  traducirInstancias,
  traducirAgencias,
  PASOS,
  esAdminDe,
  traducir,
  barreras,
  llamar,
};
