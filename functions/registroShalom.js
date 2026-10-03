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

  /**
   * Solo los dígitos de un valor.
   * @param {*} v valor de origen
   * @return {string} sus dígitos, o "" si no hay
   */
  function _dig(v) {
    return String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
  }

  /**
   * El texto de un valor, sin espacios a los lados.
   * @param {*} v valor de origen
   * @return {string} el texto, o "" si no hay
   */
  function _txt(v) {
    return String(v === null || v === undefined ? "" : v).trim();
  }

  /**
   * ¿Este envío ya está registrado en Shalom?
   *
   * LA GUÍA ES LA PRUEBA. Si existe, Shalom ya creó el envío: se pagó, no
   * se puede anular, y hay cosas que dejan de poder cambiarse —la clave de
   * recojo y la agencia de destino, porque Shalom ya las tiene y
   * cambiarlas aquí le daría al cliente datos que no sirven.
   *
   * Una sola regla para el candado del registro Y para el congelado del
   * formulario: si fueran dos, el día que divergieran una congelaría y la
   * otra dejaría registrar de nuevo.
   *
   * @param {Object} pedido el pedido
   * @return {boolean} true si ya tiene guía de Shalom
   */
  function estaRegistrado(pedido) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    return !!_txt(p.shalomGuia);
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
    if (estaRegistrado(p)) {
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
   * La guía, el código y el monto de una respuesta de Shalom.
   *
   * ⚠️ ESTE ES EL ÚNICO SITIO QUE SABE DÓNDE MIRAR, y existe por un fallo
   * real que costó un envío (02/10/2026). Había DOS reglas escritas
   * distinto: `resultado()` miraba también dentro de `data`, y la
   * orquestación no. Shalom devuelve la guía anidada en `data`, así que
   * una la encontró —dijo "éxito"— y la otra guardó `shalomGuia: ""`.
   * El envío se creó y se pagó, el pedido quedó marcado REGISTRADO sin
   * guía, y el candado de "ya tiene guía" —que mira justo ese campo— quedó
   * desarmado. Lo que evitó el cobro doble fue la otra reja, la del estado.
   *
   * Dos sitios con la misma regla escrita distinta es exactamente lo que
   * este proyecto lleva semanas castigando. Ahora hay uno.
   *
   * @param {*} json la respuesta de Shalom
   * @return {Object} {guia, codigo, monto} — vacíos si no vienen
   */
  function guiaDe(json) {
    const j = (json && typeof json === "object") ? json : {};
    const d = (j.data && typeof j.data === "object") ? j.data : {};
    const buscar = (nombres) => {
      for (let i = 0; i < nombres.length; i++) {
        const n = nombres[i];
        if (_txt(j[n])) return _txt(j[n]);
        if (_txt(d[n])) return _txt(d[n]);
      }
      return "";
    };
    const monto = Number(
        j.quote !== undefined ? j.quote :
          (d.quote !== undefined ? d.quote :
            (j.costo !== undefined ? j.costo : d.costo)));
    return {
      guia: buscar(["guia", "orderNumber", "tracking_number",
        "service_order_guia_empresarial"]),
      codigo: buscar(["codigo", "orderCode", "tracking_code",
        "code_service_order_empresarial"]),
      monto: (isFinite(monto) && monto > 0) ? monto : 0,
    };
  }

  /**
   * Los NOMBRES de los campos que trajo una respuesta, sin un solo valor.
   *
   * Antes aquí iba `forma: true`, que no enseñaba nada. Para cerrar el
   * traductor hace falta saber QUÉ campos manda Shalom de verdad, y esto
   * se puede pegar en un chat sin que salga el dato de nadie.
   *
   * @param {*} json la respuesta
   * @return {Array<string>} los nombres, anidados con punto
   */
  function camposDe(json) {
    const j = (json && typeof json === "object") ? json : {};
    const out = [];
    Object.keys(j).forEach((k) => {
      const v = j[k];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        Object.keys(v).forEach((k2) => out.push(k + "." + k2));
      } else {
        out.push(k);
      }
    });
    return out;
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
      // El MISMO extractor que usa la orquestación. Dos listas que hay que
      // mantener sincronizadas acaban divergiendo, y eso costó un envío.
      // Un "ok" sin guía no es un envío: no hay nada que enseñarle al
      // cliente ni con qué rastrear. Se trata como duda, no como éxito.
      return guiaDe(r.json).guia ? "exito" : "duda";
    }
    const http = Number(r.http) || 0;
    // Un 4xx es un NO explícito de Shalom: no se creó nada.
    if (http >= 400 && http < 500) return "fallo";
    // Todo lo demás —sin red, 5xx, corte por tiempo— deja el envío en el
    // aire. No se afirma que falló.
    return "duda";
  }

  /**
   * Busca un envío en la lista de pendientes de Shalom.
   *
   * ⚠️ POR CLAVE **Y** DESTINO, y si hay dos candidatos NO SE ELIGE.
   * Esto corre justo después de una respuesta dudosa, para saber si el
   * envío llegó a crearse. Equivocarse aquí significa darle al cliente la
   * guía de OTRO paquete, así que "el más parecido" no vale: o hay una sola
   * coincidencia exacta, o no hay ninguna.
   *
   * ⚠️ Y LA LISTA LLEGA COMO OBJETO, no como array: `{"0":…,"1":…}`, estilo
   * PHP. Medido el 01/10/2026. Un `.filter` directo habría devuelto vacío
   * SIEMPRE y habríamos creído que el envío no se creó — y entonces se
   * registra otra vez. De ahí sale el cobro doble.
   *
   * @param {*} lista lo que devolvió pending-shipments
   * @param {Object} cuerpoEnviado el cuerpo que se mandó (clave, destino)
   * @return {Object} el envío, o null
   */
  function buscarEnPendientes(lista, cuerpoEnviado) {
    if (!lista || typeof lista !== "object") return null;
    const c = (cuerpoEnviado && typeof cuerpoEnviado === "object") ?
      cuerpoEnviado : {};
    const clave = _dig(c.clave);
    const destino = parseInt(c.destino, 10);
    if (clave.length !== 4 || !(destino > 0)) return null;
    const todos = Array.isArray(lista) ? lista : Object.keys(lista)
        .map((k) => lista[k]);
    const casan = todos.filter((x) => {
      if (!x || typeof x !== "object") return false;
      const est = (x.destination_station && typeof x.destination_station ===
        "object") ? x.destination_station : {};
      return _dig(x.code_val) === clave &&
        parseInt(est.ter_id, 10) === destino;
    });
    return casan.length === 1 ? casan[0] : null;
  }

  /**
   * El nombre de RENIEC que corresponde a ESTE pedido, o null.
   *
   * ⚠️ SOLO SI EL DNI COINCIDE. La consulta a RENIEC vive en memoria
   * mientras el formulario está abierto; si consultaste un DNI y luego
   * escribiste otro, pegar el nombre del primero sería darle a Shalom el
   * nombre de OTRA persona — y un envío a nombre de quien no es, no lo
   * puede recoger nadie. Peor que no tener nombre.
   *
   * @param {Object} persona lo que devolvió RENIEC
   * @param {*} dniDelPedido el DNI que se está guardando
   * @return {Object} {dni, nombres, apePaterno, apeMaterno} o null
   */
  function reniecDe(persona, dniDelPedido) {
    const pe = (persona && typeof persona === "object") ? persona : null;
    const dni = _dig(dniDelPedido);
    if (!pe || dni.length !== 8) return null;
    if (_dig(pe.dni) !== dni) return null;
    if (!_txt(pe.nombres)) return null;
    return {
      dni: dni,
      nombres: _txt(pe.nombres),
      apePaterno: _txt(pe.apePaterno),
      apeMaterno: _txt(pe.apeMaterno),
    };
  }

  /**
   * La hora de ahora en ISO, por un reloj que una prueba pueda sustituir.
   * Una prueba que dependa de la hora real falla sola algún martes.
   * @param {Object} deps las dependencias, que pueden traer `ahora`
   * @return {string} fecha ISO, o "" si el reloj dio algo que no es fecha
   */
  function _ahora(deps) {
    const f = deps && deps.ahora;
    const d = new Date((typeof f === "function") ? f() : Date.now());
    return isFinite(d.getTime()) ? d.toISOString() : "";
  }

  /**
   * Lo que se guarda en el pedido a partir de un envío ya creado.
   * @param {Object} env el envío, como lo devuelve Shalom
   * @param {string} [nacimiento] cuándo se creó la guía, en ISO
   * @return {Object} los campos a escribir
   */
  function _deEnvio(env, nacimiento) {
    const e = env || {};
    const guia = _txt(e.service_order_guia_empresarial || e.guia ||
      e.orderNumber);
    const cod = _txt(e.code_service_order_empresarial || e.codigo ||
      e.orderCode);
    const monto = Number(e.quote);
    const campos = {
      shalomGuia: guia,
      shalomCodigo: cod,
      shalomEstado: "REGISTRADO",
      status: "ALISTADO",
    };
    if (isFinite(monto) && monto > 0) campos.shalomMonto = monto;
    /* ⏱ DE DÓNDE SALE EL PLAZO DE 24 H.
       Shalom borra la guía que no se deja en la agencia dentro de 24 h, y su
       panel muestra la cuenta atrás. Nosotros no la teníamos: el registro no
       guardaba NINGUNA hora, así que no había desde dónde contar.

       Se sella solo cuando se puede afirmar. En un registro recién hecho, la
       hora de ahora y la de Shalom se diferencian en segundos: sirve. En una
       recuperación posterior —`recuperarEnvio`, que puedes correr horas
       después— no se sabe cuándo nació la guía, y entonces NO se sella: sin
       sello no hay cuenta atrás, y eso es mejor que una cuenta atrás
       inventada que te deje tranquilo mientras el plazo se vence.

       La fuente definitiva es la rama `registrado` de /track, que es el
       reloj de Shalom y cubre también los recuperados. Viaja ya en la
       respuesta de la puerta; falta medir su formato antes de parsearla. */
    if (nacimiento) campos.shalomRegistradoEn = nacimiento;
    return campos;
  }

  /**
   * Registrar un envío, de principio a fin.
   *
   * El navegador manda SOLO el id del pedido. Todo lo demás —leer el pedido,
   * decidir, armar el cuerpo, llamar, interpretar y escribir— pasa aquí, en
   * el servidor: así nadie puede falsificar un campo ni saltarse un candado
   * desde la consola.
   *
   * ⚠️ ARRANCA EN SIMULACRO. Una operación que cuesta dinero y no se deshace
   * no puede estar encendida por defecto. En simulacro decide todo igual,
   * devuelve el cuerpo exacto que mandaría, y NO llama a nadie.
   *
   * @param {Object} datos {pedidoId}
   * @param {Object} deps {leerPedido, leerConfig, llamar, pendientes,
   *   guardar, ahora}
   * @param {Object} [opc] {simulacro}
   * @return {Promise<Object>} el resultado, siempre con motivo en palabras
   */
  async function orquestar(datos, deps, opc) {
    const o = opc || {};
    const pedidoId = _txt(datos && datos.pedidoId);
    if (!pedidoId) return {ok: false, motivo: "SIN_DATO"};

    const pedido = await deps.leerPedido(pedidoId);
    if (!pedido) return {ok: false, motivo: "NO_ENCONTRADO"};
    const cfg = await deps.leerConfig();

    /* Los candados, contra lo que hay AHORA en la base de datos — no contra
       lo que el navegador creía hace un rato. */
    const faltan = faltantes(pedido, cfg);
    if (faltan.length) return {ok: false, motivo: "SIN_DATO", faltan};

    const c = cuerpo(pedido, cfg);
    if (!c) {
      return {ok: false, motivo: "SIN_DATO", faltan: faltantes(pedido, cfg)};
    }

    // El simulacro es lo normal; registrar de verdad es la excepción.
    if (o.simulacro !== false) return {ok: true, simulacro: true, cuerpo: c};

    const r = await deps.llamar(c);
    const est = resultado(r);

    if (est === "exito") {
      const g = guiaDe(r && r.json);
      const campos = _deEnvio({
        service_order_guia_empresarial: g.guia,
        code_service_order_empresarial: g.codigo,
        quote: g.monto,
      }, _ahora(deps));
      await deps.guardar(campos);
      // Los NOMBRES de los campos que trajo Shalom, sin un solo valor: es
      // lo que hace falta para cerrar el traductor, y se puede pegar en un
      // chat sin exponer nada.
      return {ok: true, estado: "exito", campos: campos,
        forma: camposDe(r && r.json)};
    }

    if (est === "fallo") {
      /* Shalom dijo que NO. No se consulta pendientes —no creó nada— y no
         se escribe. Se dice el motivo UNA vez, con sus palabras. */
      return {ok: false, estado: "fallo",
        motivo: (r && r.motivo) || "ERROR_SHALOM",
        detalle: (r && r.detalle) || ""};
    }

    /* ⚠️ DUDA. Aquí NO se reintenta: Shalom no anula y no tiene clave de
       idempotencia, así que un segundo intento sería un segundo envío y un
       segundo cobro. Se consulta la lista de pendientes y se busca. */
    let encontrado = null;
    try {
      encontrado = buscarEnPendientes(await deps.pendientes(), c);
    } catch (e) {
      encontrado = null;
    }
    if (encontrado) {
      // Recién creado hace segundos: su hora de nacimiento es ahora.
      const campos = _deEnvio(encontrado, _ahora(deps));
      await deps.guardar(campos);
      return {ok: true, estado: "exito", recuperado: true, campos: campos};
    }
    return {ok: false, estado: "duda",
      motivo: (r && r.motivo) || "SIN_RED",
      detalle: "Se cortó la conexión y NO SABEMOS si el envío llegó a " +
        "crearse. No se registró de nuevo a propósito: Shalom no puede " +
        "anular un envío. Verifica en pro.shalom.pe antes de reintentar."};
  }

  /**
   * Rellenar la guía de un envío que YA está en Shalom. SOLO LEE.
   *
   * ⚠️ EXISTE POR UN ENVÍO REAL QUE SE QUEDÓ SIN GUÍA (02/10/2026). Shalom
   * lo creó y se pagó, pero un fallo mío guardó `shalomGuia: ""`: el
   * pedido quedó marcado REGISTRADO sin guía, el cliente sin nada que
   * rastrear y el candado de "ya tiene guía" desarmado.
   *
   * Esta operación consulta pendientes, busca por clave Y destino, y
   * rellena. **Nunca llama a `register`.** Tenerla evita la tentación de
   * "registrar otra vez a ver si ahora sí", que es como se paga dos veces.
   *
   * @param {Object} datos {pedidoId}
   * @param {Object} deps {leerPedido, leerConfig, pendientes, guardar}
   * @return {Promise<Object>} el resultado, con motivo en palabras
   */
  async function recuperarEnvio(datos, deps) {
    const pedidoId = _txt(datos && datos.pedidoId);
    if (!pedidoId) return {ok: false, motivo: "SIN_DATO"};
    const pedido = await deps.leerPedido(pedidoId);
    if (!pedido) return {ok: false, motivo: "NO_ENCONTRADO"};
    const cfg = await deps.leerConfig();

    /* Hace falta la clave y el destino para poder identificarlo sin
       equivocarse de paquete. Lo demás —el estado, las medidas— da igual:
       el envío ya existe, no se va a crear nada. */
    const clave = _dig(pedido.shalomClave);
    const destino = parseInt(_txt(pedido.agenciaId), 10);
    if (clave.length !== 4 || !(destino > 0)) {
      return {ok: false, motivo: "SIN_DATO",
        detalle: "Hacen falta la clave de recojo y la agencia de destino " +
          "para reconocer el envío entre los pendientes."};
    }
    let lista = null;
    try {
      lista = await deps.pendientes(cfg);
    } catch (e) {
      lista = null;
    }
    const env = buscarEnPendientes(lista, {clave: clave, destino: destino});
    if (!env) {
      return {ok: false, motivo: "NO_ENCONTRADO",
        detalle: "Ese envío no aparece en los pendientes de Shalom. No se " +
          "registró nada de nuevo. Míralo en pro.shalom.pe: si está, " +
          "copia la guía a mano; si no está, no llegó a crearse."};
    }
    /* SIN SELLO DE HORA, A PROPÓSITO: esto puede correr horas después del
       registro, y poner "ahora" regalaría 24 h de plazo que ya no existen. */
    const campos = _deEnvio(env);
    await deps.guardar(campos);
    return {ok: true, estado: "exito", recuperado: true, campos: campos};
  }

  return {ESTADO_PUERTA, CAJAS, CONTENIDOS, clasificar, contenidoDe,
    faltantes, cuerpo, resultado, buscarEnPendientes, orquestar,
    reniecDe, guiaDe, camposDe, recuperarEnvio, estaRegistrado};
});
