"use strict";

/**
 * functions/registroShalom.js — REGISTRAR UN ENVÍO EN SHALOM
 * ============================================================
 * ⚠️ LA ÚNICA OPERACIÓN DEL PROYECTO QUE CUESTA DINERO Y NO SE DESHACE.
 * `POST /account/register` crea un envío de verdad. Shalom **no tiene
 * endpoint para anularlo** y **no tiene clave de idempotencia**: dos
 * llamadas son dos envíos y dos cobros.
 *
 * Por eso toda la decisión vive aquí, en código puro y probado, y no
 * repartida entre la pantalla y el servidor. El navegador decide si habilita
 * el botón; el servidor decide si manda. **Los dos preguntan a este
 * archivo**: si cada uno tuviera su regla, el día que divergieran se
 * registraría un envío que la pantalla creía bloqueado.
 *
 * Vive en `functions/` por lo mismo que `agencias.js` y `etiquetas.js`: lo
 * cargan el panel y la Cloud Function, y una copia por lado divergiría.
 */

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.RegistroShalom = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  /** El único estado desde el que se registra. Lo pidió el dueño así. */
  const ESTADO_PUERTA = "POR ALISTAR";

  /**
   * Catálogo de cajas de Shalom. Medidas confirmadas DOS VECES: por la app
   * de Shalom y, por separado, por la otra aplicación del dueño.
   *
   * ⚠️ EL PESO IMPORTA, y me equivoqué diciendo que no. Un paquete de
   * 20×15×12 entra en XS por medidas, pero si pesa 3 kg se va a M: XS tope
   * 0.5 kg. Sin el peso elegiríamos una caja más chica de la que
   * corresponde y Shalom lo cobraría distinto.
   *
   * Las dimensiones van ya ordenadas de mayor a menor: comparar así deja
   * elegir cualquier cara como largo/ancho/alto sin perder el ajuste — una
   * caja no distingue de qué lado la acuestas.
   */
  const CAJAS = [
    {tipo: "XXS", dims: [15, 10, 10], pesoMaxKg: 0.25},
    {tipo: "XS", dims: [20, 15, 12], pesoMaxKg: 0.5},
    {tipo: "S", dims: [30, 20, 12], pesoMaxKg: 2},
    {tipo: "M", dims: [30, 24, 20], pesoMaxKg: 5},
    {tipo: "L", dims: [42, 30, 23], pesoMaxKg: 10},
  ];

  /**
   * Lo que `content` puede valer. El registro individual ofrece de XS a XL:
   * la caja XXS —la más chica del catálogo— se registra como XS, igual que
   * hace la otra aplicación.
   */
  const CONTENIDOS = ["PAQUETE XS", "PAQUETE S", "PAQUETE M", "PAQUETE L",
    "PAQUETE XL", "SOBRE"];

  /**
   * La caja donde entra un paquete, o null.
   * @param {*} largo cm
   * @param {*} ancho cm
   * @param {*} alto cm
   * @param {*} peso kg
   * @return {Object} {tipo, etiqueta}, {tipo:'OTRA'} o null si faltan datos
   */
  function clasificar(largo, ancho, alto, peso) {
    const l = parseFloat(largo);
    const a = parseFloat(ancho);
    const h = parseFloat(alto);
    const p = parseFloat(peso);
    if (!(l > 0) || !(a > 0) || !(h > 0) || !(p > 0)) return null;
    const dims = [l, a, h].sort((x, y) => y - x);
    for (let i = 0; i < CAJAS.length; i++) {
      const c = CAJAS[i];
      if (dims[0] <= c.dims[0] && dims[1] <= c.dims[1] &&
          dims[2] <= c.dims[2] && p <= c.pesoMaxKg) {
        return {tipo: c.tipo, etiqueta: "Paquete " + c.tipo};
      }
    }
    return {tipo: "OTRA", etiqueta: "Otra Medida"};
  }

  /**
   * El `content` de un pedido según sus medidas, o null si no se puede.
   * @param {Object} pedido con pkgLargo/pkgAncho/pkgAlto/pkgPeso
   * @return {string} uno de CONTENIDOS, o null
   */
  function contenidoDe(pedido) {
    const p = pedido || {};
    const c = clasificar(p.pkgLargo, p.pkgAncho, p.pkgAlto, p.pkgPeso);
    if (!c || c.tipo === "OTRA") return null;
    // XXS no existe en el registro: va como XS, la más chica que sí ofrece.
    const t = c.tipo === "XXS" ? "XS" : c.tipo;
    const txt = "PAQUETE " + t;
    return CONTENIDOS.indexOf(txt) >= 0 ? txt : null;
  }

  /** Solo dígitos de un valor, o "". @param {*} v valor @return {string} d */
  function _dig(v) {
    return String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
  }

  /** Texto recortado de un valor. @param {*} v valor @return {string} t */
  function _txt(v) {
    return String(v === null || v === undefined ? "" : v).trim();
  }

  /**
   * TODO lo que impide registrar este pedido, en palabras.
   *
   * Devuelve una lista de textos, no un booleano: con un botón que cuesta
   * dinero, "faltan datos" obliga a ir campo por campo adivinando cuál.
   * Lista vacía = se puede registrar.
   *
   * @param {Object} pedido el pedido del panel
   * @param {Object} cfg {agenciaOrigen, instanceId}
   * @return {Array<string>} lo que falta, vacío si nada
   */
  function faltantes(pedido, cfg) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    const c = (cfg && typeof cfg === "object") ? cfg : {};
    const f = [];

    /* ⚠️ CANDADO 4, y va primero porque es el caro. Un pedido con guía ya
       está en Shalom; registrarlo otra vez es un segundo envío y un segundo
       cobro que nadie puede anular. En la otra aplicación del dueño este
       candado no existe: su pedido #1 tiene guía 98014733 y el botón
       "Registrar envío Shalom" sigue ahí. */
    if (_txt(p.shalomGuia)) {
      f.push("Este pedido ya tiene guía de Shalom (" + _txt(p.shalomGuia) +
        "): ya está registrado y no se vuelve a registrar.");
      return f; // lo demás ya no importa
    }

    if (_txt(p.status).toUpperCase() !== ESTADO_PUERTA) {
      f.push("Solo se registra lo que está en POR ALISTAR " +
        "(este está en " + (_txt(p.status) || "sin estado") + ").");
    }
    if (!/SHALOM/i.test(_txt(p.courier))) {
      f.push("El courier del pedido no es Shalom.");
    }

    // La agencia de destino, con su id de verdad.
    if (!/^[0-9]{1,10}$/.test(_txt(p.agenciaId)) ||
        !/SHALOM/i.test(_txt(p.agenciaCourier))) {
      f.push("Falta la agencia de destino identificada: elígela de la lista " +
        "para que traiga su ter_id.");
    }
    // La de origen, de Config.
    const org = (c.agenciaOrigen && typeof c.agenciaOrigen === "object") ?
      c.agenciaOrigen : {};
    if (!/^[0-9]{1,10}$/.test(_txt(org.agenciaId)) ||
        !/SHALOM/i.test(_txt(org.agenciaCourier))) {
      f.push("Falta tu agencia de origen: elígela una vez en Config.");
    }
    if (!_txt(c.instanceId)) {
      f.push("Falta la cuenta de Shalom Pro: verifícala en Config.");
    }

    if (_dig(p.dni).length !== 8) {
      f.push("El DNI del destinatario debe tener 8 dígitos.");
    }
    if (_dig(p.phone).length < 9) {
      f.push("Falta el teléfono del destinatario (9 dígitos).");
    }
    if (_dig(p.shalomClave).length !== 4) {
      f.push("Falta la clave de recojo (4 dígitos).");
    }

    /* El nombre PARTIDO, de RENIEC. No se parte a ojo: la otra aplicación lo
       hace y, con un nombre de una sola palabra, manda el mismo valor en
       `name` y en `firstname`. Un apellido basta —`apeMaterno` llegó vacío
       al medir RENIEC—, pero el nombre y al menos un apellido no. */
    const rn = (p.reniec && typeof p.reniec === "object") ? p.reniec : {};
    if (!_txt(rn.nombres) || (!_txt(rn.apePaterno) && !_txt(rn.apeMaterno))) {
      f.push("Falta el nombre del destinatario partido por RENIEC: " +
        "consulta el DNI en el formulario.");
    }

    // Las medidas, que deciden la caja.
    const faltaMedida = !(parseFloat(p.pkgLargo) > 0) ||
      !(parseFloat(p.pkgAncho) > 0) || !(parseFloat(p.pkgAlto) > 0);
    if (faltaMedida) {
      f.push("Faltan las medidas del paquete (largo, ancho y alto).");
    }
    if (!(parseFloat(p.pkgPeso) > 0)) {
      f.push("Falta el peso del paquete: decide la caja tanto como las " +
        "medidas (20×15×12 con 3 kg no entra en XS, se va a M).");
    }
    if (!faltaMedida && parseFloat(p.pkgPeso) > 0 && !contenidoDe(p)) {
      f.push("El paquete no entra en ninguna caja de Shalom " +
        "(la más grande es 42×30×23 cm y 10 kg).");
    }

    return f;
  }

  /**
   * El cuerpo EXACTO que se manda a `POST /account/register`, o null si el
   * pedido no está listo. Nunca a medias: o va completo o no va.
   *
   * @param {Object} pedido el pedido
   * @param {Object} cfg {agenciaOrigen, instanceId}
   * @return {Object} el cuerpo, o null
   */
  function cuerpo(pedido, cfg) {
    if (faltantes(pedido, cfg).length) return null;
    const p = pedido;
    const rn = p.reniec;
    /* ⚠️ ORIGEN Y DESTINO COMO NÚMERO, Y NO ES UN DETALLE DE TIPOS.
       La documentación: `destino` (ter_id, o "052" CON PREFIJO 0 = AÉREO).
       La otra aplicación del dueño hace `String(id).padStart(3, "0")`, así
       que convierte el ter_id 7 (Arequipa) en "007" y lo registra como
       aéreo sin que nadie lo pida — y 66 de las 552 agencias tienen ter_id
       de uno o dos dígitos: uno de cada ocho envíos.
       Un número no puede llevar cero delante. El fallo se vuelve imposible
       por construcción, no por acordarse de no hacerlo. */
    return {
      instanceId: _txt(cfg.instanceId),
      origen: parseInt(_txt(cfg.agenciaOrigen.agenciaId), 10),
      destino: parseInt(_txt(p.agenciaId), 10),
      documento: _dig(p.dni),
      name: _txt(rn.nombres),
      firstname: _txt(rn.apePaterno),
      lastname: _txt(rn.apeMaterno),
      phone: _dig(p.phone).slice(-9),
      content: contenidoDe(p),
      cantidad: 1,
      clave: _dig(p.shalomClave),
      // Vacía: medido en la otra aplicación, que la manda así siempre.
      declaracion_jurada: "",
    };
  }

  /**
   * Cómo acabó un intento de registro. TRES resultados, nunca dos.
   *
   * ⚠️ EL DEL MEDIO ES EL CARO. Shalom no anula y no tiene idempotencia, así
   * que decir "falló" cuando en realidad NO SABEMOS invita a volver a
   * pulsar — y eso son dos envíos y dos cobros. Un corte de red o un 500
   * dejan el envío en el aire: pudo crearse igual.
   *
   *   exito → Shalom devolvió una guía
   *   fallo → Shalom dijo que NO (4xx): no se creó nada
   *   duda  → no sabemos. NO se reintenta: se consulta pending-shipments
   *
   * @param {Object} r la respuesta de la puerta
   * @return {string} 'exito' | 'fallo' | 'duda'
   */
  function resultado(r) {
    if (!r || typeof r !== "object") return "duda";
    if (r.ok === true) {
      const j = (r.json && typeof r.json === "object") ? r.json : {};
      const guia = _txt(j.guia || j.orderNumber || j.tracking_number ||
        (j.data && (j.data.guia || j.data.orderNumber)));
      // Un "ok" sin guía no es un envío: no hay nada que enseñarle al
      // cliente ni con qué rastrear. Se trata como duda, no como éxito.
      return guia ? "exito" : "duda";
    }
    const http = Number(r.http) || 0;
    // Un 4xx es un NO explícito de Shalom: no se creó nada.
    if (http >= 400 && http < 500) return "fallo";
    // Todo lo demás —sin red, 5xx, corte por tiempo— deja el envío en el
    // aire. No se afirma que falló.
    return "duda";
  }

  return {ESTADO_PUERTA, CAJAS, CONTENIDOS, clasificar, contenidoDe,
    faltantes, cuerpo, resultado};
});
