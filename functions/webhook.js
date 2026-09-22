"use strict";

const crypto = require("crypto");

/**
 * functions/webhook.js — recibir avisos de Shalom sin creerles todavia
 * =====================================================================
 * Esta es la UNICA puerta publica sin autenticacion del sistema: cualquiera en
 * internet puede llamarla. Lo unico que separa un aviso de Shalom de uno
 * inventado es la firma. Por eso aqui no hay atajos.
 *
 * ⚠️ NO TRADUCE NADA, Y ES A PROPOSITO.
 * El webhook habla OTRO idioma que /track: donde /track dice "En transito", el
 * webhook dice "IN_TRANSIT". El mapa completo de codigos no esta documentado
 * en ninguna parte. Adivinarlo seria repetir el fallo que costo dias —pero
 * esta vez escribiendo solo, de madrugada—. Asi que primero se MIDE: se anota
 * la forma del evento y los codigos que trae, y recien despues se traduce.
 */

/** Cuanto se acepta de diferencia entre el reloj de Shalom y el nuestro. */
const TOLERANCIA_S = 300;

/** Tope de cuerpo. Un aviso de estado son cientos de bytes, no megas. */
const CUERPO_MAX = 64 * 1024;

/** Un codigo de estado: mayusculas y guion bajo. Nunca un nombre ni una
    direccion, asi que su VALOR se puede anotar sin exponer a nadie. */
const ES_CODIGO = /^[A-Z][A-Z_]{2,29}$/;

/**
 * Lee la cabecera `t=<unix>,v1=<hex>`.
 * @param {string} cab valor de X-Shalom-Signature
 * @return {?Object} {t, v1} o null si no se entiende
 */
function leerCabecera(cab) {
  const partes = String(cab || "").split(",");
  let t = null; let v1 = null;
  partes.forEach((p) => {
    const i = p.indexOf("=");
    if (i < 0) return;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim();
    if (k === "t") t = v;
    if (k === "v1") v1 = v;
  });
  if (!t || !v1 || !/^\d{1,15}$/.test(t) || !/^[0-9a-f]{64}$/i.test(v1)) {
    return null;
  }
  return {t: t, v1: v1};
}

/**
 * ¿Es de Shalom de verdad?
 *
 * Se firma "<t>.<cuerpo CRUDO>". El cuerpo crudo, no el JSON reparseado: dos
 * JSON con el mismo contenido pueden tener bytes distintos, y entonces la
 * firma no cuadra nunca. Ese detalle costo dias.
 * @param {string} cab cabecera X-Shalom-Signature
 * @param {Buffer|string} crudo cuerpo tal como llego
 * @param {string} secreto whsec_…
 * @param {number} ahoraMs Date.now()
 * @return {Object} {ok:true} o {ok:false, motivo}
 */
function verificarFirma(cab, crudo, secreto, ahoraMs) {
  if (!secreto) return {ok: false, motivo: "SIN_SECRETO"};
  const c = leerCabecera(cab);
  if (!c) return {ok: false, motivo: "FIRMA_MAL_FORMADA"};

  // Un aviso viejo repetido no vale: sin esto, quien grabe UNA llamada valida
  // puede reenviarla para siempre.
  const edad = Math.abs((Number(ahoraMs) || 0) / 1000 - Number(c.t));
  if (edad > TOLERANCIA_S) return {ok: false, motivo: "FIRMA_VENCIDA"};

  const cuerpo = Buffer.isBuffer(crudo) ? crudo :
    Buffer.from(String(crudo || ""));
  if (cuerpo.length > CUERPO_MAX) return {ok: false, motivo: "CUERPO_ENORME"};

  const esperada = crypto.createHmac("sha256", secreto)
      .update(Buffer.concat([Buffer.from(c.t + "."), cuerpo]))
      .digest("hex");

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(String(c.v1).toLowerCase(), "utf8");
  // La longitud se compara aparte porque timingSafeEqual exige que coincida.
  // Comparar el contenido con === filtraria, byte a byte, cuanto se acerto.
  if (a.length !== b.length) return {ok: false, motivo: "FIRMA_INVALIDA"};
  if (!crypto.timingSafeEqual(a, b)) {
    return {ok: false, motivo: "FIRMA_INVALIDA"};
  }
  return {ok: true, t: Number(c.t)};
}

/**
 * Identificador del evento para no aplicarlo dos veces.
 *
 * Shalom reintenta si no respondemos rapido, y aplicar dos veces el mismo
 * aviso duplica historiales. La propia firma sirve: incluye el momento y el
 * cuerpo, asi que dos avisos distintos no pueden compartirla.
 * @param {string} cab cabecera X-Shalom-Signature
 * @return {?string} id apto para Firestore, o null
 */
function idDeEvento(cab) {
  const c = leerCabecera(cab);
  if (!c) return null;
  return "ev_" + c.t + "_" + c.v1.slice(0, 32);
}

/**
 * Los CODIGOS que trae el aviso, con su ruta. Es el vocabulario que hay que
 * medir para poder traducir despues.
 *
 * Solo se anota el valor de lo que parece un codigo —MAYUSCULAS_CON_GUION—,
 * que nunca es un nombre ni una direccion. Todo lo demas queda como tipo.
 * @param {*} v cuerpo del evento
 * @param {string} [ruta] ruta acumulada
 * @param {Object} [salida] acumulador
 * @return {Object} {ruta: codigo}
 */
function codigos(v, ruta, salida) {
  salida = salida || {};
  ruta = ruta || "";
  if (typeof v === "string") {
    if (ES_CODIGO.test(v)) salida[ruta || "(raiz)"] = v;
    return salida;
  }
  if (!v || typeof v !== "object") return salida;
  if (Array.isArray(v)) {
    v.slice(0, 20).forEach((x, i) => codigos(x, ruta + "[" + i + "]", salida));
    return salida;
  }
  Object.keys(v).slice(0, 40).forEach((k) => {
    codigos(v[k], ruta ? ruta + "." + k : k, salida);
  });
  return salida;
}

module.exports = {
  TOLERANCIA_S,
  CUERPO_MAX,
  leerCabecera,
  verificarFirma,
  idDeEvento,
  codigos,
};
