"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.RegistroShalom = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const ESTADO_PUERTA = "POR ALISTAR";
  const ESTADOS_PUERTA = ["POR ALISTAR", "ALISTADO"];

  const PLAZO_MS = 24 * 3600 * 1000;

  const CAJAS = [
    {tipo: "XXS", dims: [15, 10, 10], pesoMaxKg: 0.25},
    {tipo: "XS", dims: [20, 15, 12], pesoMaxKg: 0.5},
    {tipo: "S", dims: [30, 20, 12], pesoMaxKg: 2},
    {tipo: "M", dims: [30, 24, 20], pesoMaxKg: 5},
    {tipo: "L", dims: [42, 30, 23], pesoMaxKg: 10},
  ];

  const CONTENIDOS = ["PAQUETE XS", "PAQUETE S", "PAQUETE M", "PAQUETE L",
    "PAQUETE XL", "SOBRE"];

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

  function contenidoDe(pedido) {
    const p = pedido || {};
    const elegida = tipoElegido(p);
    if (elegida === "SOBRE") return "SOBRE";
    if (elegida) {
      return "PAQUETE " + (elegida === "XXS" ? "XS" : elegida);
    }
    const c = clasificar(p.pkgLargo, p.pkgAncho, p.pkgAlto, p.pkgPeso);
    if (!c || c.tipo === "OTRA") return null;
    const t = c.tipo === "XXS" ? "XS" : c.tipo;
    const txt = "PAQUETE " + t;
    return CONTENIDOS.indexOf(txt) >= 0 ? txt : null;
  }

  function tipoElegido(pedido) {
    const t = _txt(pedido && pedido.pkgCaja).toUpperCase();
    if (t === "SOBRE") return t;
    return CAJAS.some((c) => c.tipo === t) ? t : "";
  }

  function registradoPorPro(pedido) {
    const p = pedido || {};
    if (!estaRegistrado(p)) return false;
    return p.shalomPor === "pro" || !!_txt(p.shalomRegistradoEn);
  }

  const VENCIDA_MS = 72 * 3600 * 1000;

  function situacion(pedido, ahoraMs) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    const guia = _txt(p.trackingOrderNumber) || _txt(p.shalomGuia);
    if (!guia) return {tipo: "sinGuia", venceEn: null};
    if (!registradoPorPro(p) || _txt(p.trackingStatus)) {
      return {tipo: "normal", venceEn: null};
    }
    const t = Date.parse(_txt(p.shalomRegistradoEn));
    if (!isFinite(t)) return {tipo: "porDejar", venceEn: null};
    const ahora = Number(ahoraMs) || Date.now();
    if (ahora - t > VENCIDA_MS) {
      return {tipo: "vencida", venceEn: t + PLAZO_MS - ahora};
    }
    return {tipo: "porDejar", venceEn: t + PLAZO_MS - ahora};
  }

  function plazoVencido(pedido, ahoraMs) {
    const t = Date.parse(_txt(pedido && pedido.shalomRegistradoEn));
    return isFinite(t) && (ahoraMs - t) >= PLAZO_MS;
  }

  function notaConClave(previa, clave, guia) {
    const linea = "🔑 Clave Shalom: " + _dig(clave) +
      (guia ? " · guía " + _txt(guia) : "");
    const p = _txt(previa);
    if (p.indexOf(linea) >= 0) return p;
    return (p ? p + "\n" : "") + linea;
  }

  function _dig(v) {
    return String(v === null || v === undefined ? "" : v).replace(/\D/g, "");
  }

  function _txt(v) {
    return String(v === null || v === undefined ? "" : v).trim();
  }

  function estaRegistrado(pedido) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    return !!_txt(p.shalomGuia);
  }

  function faltantes(pedido, cfg) {
    const p = (pedido && typeof pedido === "object") ? pedido : {};
    const c = (cfg && typeof cfg === "object") ? cfg : {};
    const f = [];

    if (estaRegistrado(p)) {
      f.push("Este pedido ya tiene guía de Shalom (" + _txt(p.shalomGuia) +
        "): ya está registrado y no se vuelve a registrar.");
      return f;
    }

    if (ESTADOS_PUERTA.indexOf(_txt(p.status).toUpperCase()) < 0) {
      f.push("Solo se registra lo que está en POR ALISTAR o ALISTADO " +
        "(este está en " + (_txt(p.status) || "sin estado") + ").");
    }
    if (!/SHALOM/i.test(_txt(p.courier))) {
      f.push("El courier del pedido no es Shalom.");
    }

    if (!/^[0-9]{1,10}$/.test(_txt(p.agenciaId)) ||
        !/SHALOM/i.test(_txt(p.agenciaCourier))) {
      f.push("Falta la agencia de destino identificada: elígela de la lista " +
        "para que traiga su ter_id.");
    }
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

    const rn = (p.reniec && typeof p.reniec === "object") ? p.reniec : {};
    if (!_txt(rn.nombres) || (!_txt(rn.apePaterno) && !_txt(rn.apeMaterno))) {
      f.push("Falta el nombre del destinatario partido por RENIEC: " +
        "consulta el DNI en el formulario.");
    }

    if (tipoElegido(p)) return f;

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

  function cuerpo(pedido, cfg) {
    if (faltantes(pedido, cfg).length) return null;
    const p = pedido;
    const rn = p.reniec;
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
      declaracion_jurada: "",
    };
  }

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

  function resultado(r) {
    if (!r || typeof r !== "object") return "duda";
    if (r.ok === true) {
      return guiaDe(r.json).guia ? "exito" : "duda";
    }
    const http = Number(r.http) || 0;
    if (http >= 400 && http < 500) return "fallo";
    return "duda";
  }

  function buscarEnPendientes(lista, cuerpoEnviado, excluir) {
    if (!lista || typeof lista !== "object") return null;
    const c = (cuerpoEnviado && typeof cuerpoEnviado === "object") ?
      cuerpoEnviado : {};
    const clave = _dig(c.clave);
    const destino = parseInt(c.destino, 10);
    if (clave.length !== 4 || !(destino > 0)) return null;
    const todos = Array.isArray(lista) ? lista : Object.keys(lista)
        .map((k) => lista[k]);
    const fuera = Array.isArray(excluir) ? excluir.map(_txt) : [];
    const casan = todos.filter((x) => {
      if (!x || typeof x !== "object") return false;
      if (fuera.length && fuera.indexOf(_txt(x.service_order_guia_empresarial ||
          x.guia || x.orderNumber)) >= 0) return false;
      const est = (x.destination_station && typeof x.destination_station ===
        "object") ? x.destination_station : {};
      return _dig(x.code_val) === clave &&
        parseInt(est.ter_id, 10) === destino;
    });
    return casan.length === 1 ? casan[0] : null;
  }

  function enPendientes(lista, guia) {
    const g = _dig(guia);
    if (!g || !lista || typeof lista !== "object") return false;
    const base = (lista.data && typeof lista.data === "object") ?
      lista.data : lista;
    const todos = Array.isArray(base) ? base : Object.keys(base)
        .map((k) => base[k]);
    return todos.some((x) => x && typeof x === "object" &&
      _dig(x.service_order_guia_empresarial || x.guia || x.orderNumber) === g);
  }

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

  function configDe(raw) {
    const c = (raw && typeof raw === "object") ? raw : {};
    const inst = (c.shalomInstancia && typeof c.shalomInstancia === "object") ?
      c.shalomInstancia : {};
    return {
      agenciaOrigen: c.agenciaOrigen || null,
      instanceId: _txt(inst.id),
    };
  }

  function _ahora(deps) {
    const f = deps && deps.ahora;
    const d = new Date((typeof f === "function") ? f() : Date.now());
    return isFinite(d.getTime()) ? d.toISOString() : "";
  }

  function _deEnvio(env, nacimiento, pedido) {
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
    if (nacimiento) campos.shalomRegistradoEn = nacimiento;
    campos.shalomPor = "pro";
    if (pedido && guia) {
      campos.privateNote = notaConClave(pedido.privateNote, pedido.shalomClave,
          guia);
    }
    return campos;
  }

  async function orquestar(datos, deps, opc) {
    const o = opc || {};
    const pedidoId = _txt(datos && datos.pedidoId);
    if (!pedidoId) return {ok: false, motivo: "SIN_DATO"};

    const leido = await deps.leerPedido(pedidoId);
    if (!leido) return {ok: false, motivo: "NO_ENCONTRADO"};
    const cfg = await deps.leerConfig();

    let pedido = leido;
    let anteriores = null;
    if (datos && datos.renovar === true) {
      const v = await _puedeRenovar(leido, deps);
      if (!v.ok) return v;
      anteriores = (Array.isArray(leido.shalomGuiasAnteriores) ?
        leido.shalomGuiasAnteriores.slice(-9) : []).concat([{
        guia: _txt(leido.shalomGuia), codigo: _txt(leido.shalomCodigo),
        registradoEn: _txt(leido.shalomRegistradoEn), motivo: "vencida",
      }]);
      pedido = Object.assign({}, leido, {shalomGuia: "", shalomCodigo: ""});
    }

    const faltan = faltantes(pedido, cfg);
    if (faltan.length) return {ok: false, motivo: "SIN_DATO", faltan};

    const c = cuerpo(pedido, cfg);
    if (!c) {
      return {ok: false, motivo: "SIN_DATO", faltan: faltantes(pedido, cfg)};
    }

    if (o.simulacro !== false) return {ok: true, simulacro: true, cuerpo: c};

    const r = await deps.llamar(c);
    const est = resultado(r);

    if (est === "exito") {
      const g = guiaDe(r && r.json);
      const campos = _deEnvio({
        service_order_guia_empresarial: g.guia,
        code_service_order_empresarial: g.codigo,
        quote: g.monto,
      }, _ahora(deps), pedido);
      if (anteriores) {
        campos.shalomGuiasAnteriores = anteriores;
        Object.assign(campos, _seguimientoLimpio());
      }
      await deps.guardar(campos);
      return {ok: true, estado: "exito", campos: campos,
        forma: camposDe(r && r.json)};
    }

    if (est === "fallo") {
      return {ok: false, estado: "fallo",
        motivo: (r && r.motivo) || "ERROR_SHALOM",
        detalle: (r && r.detalle) || ""};
    }

    let encontrado = null;
    try {
      encontrado = buscarEnPendientes(await deps.pendientes(), c,
          anteriores ? anteriores.map((a) => a.guia) : null);
    } catch (e) {
      encontrado = null;
    }
    if (encontrado) {
      const campos = _deEnvio(encontrado, _ahora(deps), pedido);
      if (anteriores) {
        campos.shalomGuiasAnteriores = anteriores;
        Object.assign(campos, _seguimientoLimpio());
      }
      await deps.guardar(campos);
      return {ok: true, estado: "exito", recuperado: true, campos: campos};
    }
    return {ok: false, estado: "duda",
      motivo: (r && r.motivo) || "SIN_RED",
      detalle: "Se cortó la conexión y NO SABEMOS si el envío llegó a " +
        "crearse. No se registró de nuevo a propósito: Shalom no puede " +
        "anular un envío. Verifica en pro.shalom.pe antes de reintentar."};
  }

  async function recuperarEnvio(datos, deps) {
    const pedidoId = _txt(datos && datos.pedidoId);
    if (!pedidoId) return {ok: false, motivo: "SIN_DATO"};
    const pedido = await deps.leerPedido(pedidoId);
    if (!pedido) return {ok: false, motivo: "NO_ENCONTRADO"};
    const cfg = await deps.leerConfig();

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
    const campos = _deEnvio(env, "", pedido);
    await deps.guardar(campos);
    return {ok: true, estado: "exito", recuperado: true, campos: campos};
  }

  function _seguimientoLimpio() {
    return {trackingStatus: "", trackingMessage: "", trackingLastUpdate: "",
      trackingOrderNumber: "", trackingOrderCode: "", trackingHistory: [],
      trackingHistorialShalom: []};
  }

  async function _puedeRenovar(p, deps) {
    const no = (motivo, detalle) => ({ok: false, motivo, detalle});
    if (!estaRegistrado(p)) {
      return no("SIN_DATO", "Este pedido no tiene guía: regístralo normal.");
    }
    if (!_txt(p.shalomRegistradoEn)) {
      return no("NO_VENCIDA", "No sabemos cuándo se registró esta guía, " +
        "así que no se puede afirmar que venció. Mírala en pro.shalom.pe.");
    }
    const ahora = Date.parse(_ahora(deps));
    if (!plazoVencido(p, ahora)) {
      return no("NO_VENCIDA", "La guía todavía está dentro de sus 24 h: " +
        "deja el paquete en la agencia con esa misma guía.");
    }
    if (_txt(p.trackingStatus)) {
      return no("YA_EN_AGENCIA", "Shalom ya movió este paquete (" +
        _txt(p.trackingStatus) + "). No se registra de nuevo.");
    }
    if (!deps || typeof deps.rastrear !== "function") {
      return no("NO_VERIFICADO", "No se pudo consultar la guía en Shalom.");
    }
    let t = null;
    try {
      t = await deps.rastrear(_txt(p.shalomGuia), _txt(p.shalomCodigo));
    } catch (e) {
      t = null;
    }
    const m = t && t.motivo;
    if (t && !t.ok && (m === "SOLO_REGISTRADO" || m === "NO_ENCONTRADO")) {
      return {ok: true};
    }
    if (t && t.ok) {
      return no("YA_EN_AGENCIA", "Shalom dice que el paquete ya entró (" +
        _txt(t.estado) + "). No se registra de nuevo: sería un segundo cobro.");
    }
    return no("NO_VERIFICADO", "No pudimos confirmar con Shalom que la guía " +
      "venció" + (m ? " (" + m + ")" : "") + ". No se registró nada. " +
      "Intenta en un rato o míralo en pro.shalom.pe.");
  }

  return {ESTADO_PUERTA, ESTADOS_PUERTA, PLAZO_MS, VENCIDA_MS, CAJAS,
    tipoElegido, registradoPorPro, plazoVencido, situacion, enPendientes,
    notaConClave,
    puedeRenovar: _puedeRenovar, CONTENIDOS, clasificar, contenidoDe,
    faltantes, cuerpo, resultado, buscarEnPendientes, orquestar,
    reniecDe, guiaDe, camposDe, recuperarEnvio, estaRegistrado, configDe};
});
