"use strict";

/* global globalThis, window */
(function(raiz, fabrica) {
  if (typeof module === "object" && module.exports) {
    module.exports = fabrica();
  } else {
    raiz.Garantia = fabrica();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, () => {
  const FINALES = ["FINALIZADO", "ENTREGADO"];
  const DIAS_CAMBIO = 30;
  const DIAS_GARANTIA = 365;
  const MAX_FOTOS = 3;
  const MAX_FOTO_BYTES = 1500000;
  const TIPOS = {
    cambio: "Cambio de producto",
    devolucion: "Devolución",
    falla: "Falla de fabricación",
  };
  const ESTADOS = {
    "RECIBIDO": ["Recibimos tu solicitud",
      "La revisaremos y te escribiremos por WhatsApp."],
    "EN REVISIÓN": ["Tu caso está en revisión",
      "Nuestra área de garantías está evaluando tu producto."],
    "APROBADO": ["¡Tu solicitud fue aprobada!",
      "Te escribiremos por WhatsApp para coordinar."],
    "RECHAZADO": ["Tu solicitud no procede",
      "Si tienes dudas, escríbenos y te explicamos."],
    "RESUELTO": ["Caso resuelto", "Gracias por tu paciencia y tu confianza."],
  };
  const POLITICA = [
    {t: "Cambios y devoluciones: 30 días", d: [
      "Tienes hasta 30 días desde tu compra.",
      "El producto debe estar sin usar, en el mismo estado en que lo " +
        "recibiste y en su empaque original.",
      "Necesitamos tu comprobante de compra (boleta o factura).",
    ]},
    {t: "Garantía por falla de fabricación", d: [
      "Pasados los 30 días, si tu producto presenta una falla de " +
        "fabricación, pasa a nuestra área de garantías para revisión.",
      "Si la falla es de fabricación, cambiamos el componente dañado y te " +
        "lo devolvemos.",
      "Si no tenemos el repuesto o no se soluciona en 7 días hábiles, te " +
        "lo cambiamos por uno nuevo.",
      "Si el servicio técnico encuentra mal uso, te avisamos el costo de " +
        "la reparación antes de hacerla.",
    ]},
    {t: "No tienen cambio ni devolución", d: [
      "Guantes, botas, zapatos de trabajo, mascarillas y caretas de " +
        "protección.",
      "Herramientas usadas o manchadas por el trabajo.",
      "Productos dañados o con piezas faltantes por causas ajenas a " +
        "nosotros, o distintos al que te entregamos.",
      "Los productos en liquidación no tienen reembolso.",
    ]},
    {t: "Reembolsos", d: [
      "Cuando recibamos y revisemos el producto, te avisamos por WhatsApp " +
        "si tu reembolso fue aprobado.",
      "El dinero vuelve a tu medio de pago original. Según tu banco, " +
        "puede tardar unos días en verse reflejado.",
    ]},
    {t: "Envío de la devolución", d: [
      "La dirección de envío se coordina por WhatsApp.",
      "El costo de envío de la devolución lo asume el cliente y no es " +
        "reembolsable.",
    ]},
  ];

  function _txt(v, max) {
    if (typeof v !== "string") return "";
    return Array.from(v.replace(/[\r\n\t]+/g, " "))
        .filter((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">")
        .join("").replace(/ +/g, " ").trim().slice(0, max);
  }

  function dias(pedido, ahoraMs) {
    const p = pedido || {};
    const t = Date.parse(String(p.createdAt || p.date || ""));
    return isFinite(t) ? Math.floor((ahoraMs - t) / 86400000) : -1;
  }

  function tipos(pedido, ahoraMs) {
    const p = pedido || {};
    if (FINALES.indexOf(String(p.status || "").trim().toUpperCase()) < 0) {
      return [];
    }
    const d = dias(p, ahoraMs);
    if (d < 0 || d > DIAS_GARANTIA) return [];
    return d <= DIAS_CAMBIO ? ["cambio", "devolucion", "falla"] : ["falla"];
  }

  function fotoJpeg(b64) {
    if (typeof b64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64) ||
        b64.length > Math.ceil(MAX_FOTO_BYTES / 3) * 4) {
      return null;
    }
    const bin = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64") :
      null;
    if (!bin || bin.length < 100 ||
        bin[0] !== 0xFF || bin[1] !== 0xD8 || bin[2] !== 0xFF) {
      return null;
    }
    return bin;
  }

  function limpiar(body, permitidos) {
    const b = body && typeof body === "object" ? body : {};
    const tipo = typeof b.tipo === "string" ? b.tipo : "";
    if (!Object.prototype.hasOwnProperty.call(TIPOS, tipo) ||
        (permitidos || []).indexOf(tipo) < 0) {
      return null;
    }
    const producto = _txt(b.producto, 80);
    const texto = _txt(b.texto, 600);
    if (producto.length < 2 || texto.length < 10) return null;
    const crudas = Array.isArray(b.fotos) ? b.fotos : [];
    if (!crudas.length || crudas.length > MAX_FOTOS) return null;
    const fotos = crudas.map(fotoJpeg);
    if (fotos.some((f) => !f)) return null;
    return {tipo, producto, texto, fotos};
  }

  function publico(reclamo) {
    const r = reclamo && typeof reclamo === "object" ? reclamo : null;
    if (!r || !Object.prototype.hasOwnProperty.call(ESTADOS, r.estado) ||
        !Object.prototype.hasOwnProperty.call(TIPOS, r.tipo)) {
      return null;
    }
    const out = {estado: r.estado, tipo: r.tipo,
      fecha: _txt(r.fecha, 30)};
    const resp = _txt(r.respuesta, 300);
    if (resp) out.respuesta = resp;
    return out;
  }

  return {FINALES, DIAS_CAMBIO, DIAS_GARANTIA, MAX_FOTOS, MAX_FOTO_BYTES,
    TIPOS, ESTADOS, POLITICA, dias, tipos, fotoJpeg, limpiar, publico};
});
