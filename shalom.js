/**
 * shalom.js — Puerta única a Shalom
 * ==================================
 * TODO lo que habla con Shalom pasa por aquí: consultar una guía, jalar el
 * ticket, traer agencias y registrar pedidos. Un solo dueño, un solo contrato.
 *
 * ES I/O PURO: no toca la UI (nada de toasts ni DOM). Devuelve datos; quien
 * llama decide qué mostrar. Así la misma puerta sirve para el botón manual, el
 * auto-check del panel o un Cloud Scheduler, sin acoplarse a ninguno.
 *
 * CÓMO LLEGA A SHALOM (y por qué no directo):
 *   navegador → Cloud Function `shalomApi` → api.shalom-api.lat
 * La API key es un secreto y vive en Secret Manager, del lado del servidor. Si
 * viajara al navegador, cualquiera con F12 la vería y gastaría el plan del
 * negocio. La función además exige que seas administrador y solo permite las
 * operaciones de una lista blanca — no es un proxy ciego.
 *
 * CONTRATO (lo que devuelve cada método; una promesa):
 *   consultarGuia(guia, codigo) → {
 *       ok:true, estado:'En destino', fecha:'2026-08-19T16:10:00Z', pasos:2 }
 *     · estado : texto tal cual de Shalom (se muestra al operador y al cliente)
 *     · pasos  : 0..3 de la barra (0 origen · 1 tránsito · 2 destino · 3 entregado)
 *     · fecha  : ISO del evento, si Shalom la da (opcional)
 *   ticket(guia, codigo)   → { ok:true, url:'https://…' }  |  { ok:true, dataUrl:'data:image/png;…' }
 *   agencias()             → { ok:true, lista:[…] }        (formato del catálogo)
 *   registrar(pedido)      → { ok:true, guia:'…', codigo:'…' }
 *
 *   En error, todos: { ok:false, motivo:CODIGO }
 *     DESCONECTADO · NO_ENCONTRADO · BLOQUEADO (clave/plan) · SIN_DATO
 *     · ERROR_SHALOM (tropiezo temporal del lado de Shalom, no del dato)
 *     · LIMITE (cuota agotada) · FORMATO_DESCONOCIDO (respuesta no reconocida)
 *   REGLA DE ORO: jamás ok:true sin dato real. Sin estado → ok:false. (La
 *   lección más cara: el éxito falso ocultó días de fallo.)
 */
(function (global) {
  'use strict';

  var FUNC = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomApi';
  var OFF = {ok: false, motivo: 'DESCONECTADO'};

  /* Token del panel. Mismo patrón que cotizacion.js: renueva si hace falta y
     lee el que guarda auth.js. Sin token, la función responde 401. */
  function _token() {
    var p = Promise.resolve();
    try {
      if (typeof global._authEnsureToken === 'function') {
        p = Promise.resolve(global._authEnsureToken());
      }
    } catch (e) { /* sin auth: seguimos y la función dirá 401 */ }
    return p.then(function () {
      try { return localStorage.getItem('tt_id_token') || ''; } catch (e) { return ''; }
    });
  }

  /* Llama a la Cloud Function. Nunca lanza: cualquier tropiezo se traduce al
     vocabulario de motivos, para que quien llama siempre pueda avisar algo
     honesto en vez de quedarse mudo. */
  function _llamar(op, cuerpo) {
    if (!global.fetch) return Promise.resolve(OFF);
    return _token().then(function (tok) {
      return fetch(FUNC + '?op=' + encodeURIComponent(op), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': tok ? ('Bearer ' + tok) : ''
        },
        body: JSON.stringify(cuerpo || {})
      });
    }).then(function (r) {
      if (r.status === 401 || r.status === 403) {
        return {ok: false, motivo: 'BLOQUEADO'};
      }
      return r.json().catch(function () {
        return {ok: false, motivo: 'ERROR_SHALOM'};
      });
    }).catch(function () {
      return {ok: false, motivo: 'SIN_RED'};
    });
  }

  var Shalom = {
    // Interruptor maestro. La consulta ya va contra la API oficial; el ticket,
    // las agencias y el registro llegan en las fases siguientes.
    DISPONIBLE: true,

    consultarGuia: function (guia, codigo) {
      if (!guia || !codigo) return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      return _llamar('track', {orderNumber: String(guia), orderCode: String(codigo)});
    },

    // Comprueba la clave y devuelve el consumo del mes. Útil para diagnosticar
    // sin tocar ningún pedido.
    validar: function () {
      return _llamar('validate', {});
    },

    /* Diagnóstico: devuelve la FORMA de la respuesta de Shalom (nombres de
       campos y tipos, nunca valores) más cómo la interpreta hoy el traductor.
       Existe porque la documentación de la API describe qué enviar pero no qué
       devuelve; en vez de suponer la forma, se mide. No escribe en ningún
       pedido y no expone datos de personas.

       Shalom.esquema('93802318','9NK9')  → forma de /track
       Shalom.esquema(null, null, 'agencies') → forma de /agencies          */
    esquema: function (guia, codigo, de) {
      return _llamar('esquema', {
        de: de || 'track',
        orderNumber: guia ? String(guia) : '',
        orderCode: codigo ? String(codigo) : ''
      });
    },

    ticket: function () {
      return Promise.resolve(OFF);
    },

    /* Catálogo completo de agencias. Lo usa el extractor del panel para
       generar el JSON que después lee el formulario del cliente.
       Devuelve la respuesta cruda de Shalom: quien llama la traduce. */
    agencias: function () {
      return _llamar('agencias', {});
    },

    registrar: function () {
      return Promise.resolve(OFF);
    },

    /* Catálogo de cajas de Shalom (medidas oficiales de su app, ver
       docs/SHALOM.md). No son rangos: son cajas fijas, así que la regla
       correcta es "la más chica en la que el paquete entra" — nunca "el rango
       donde cae la medida más grande". Las dimensiones se guardan YA
       ordenadas de mayor a menor: comparar así deja elegir cualquier cara
       como largo/ancho/alto sin perder el ajuste (una caja no distingue de
       qué lado la acostás). "Sobre" queda afuera a propósito: es una
       categoría de contenido (documentos), no un tamaño — no hay umbral
       numérico que lo distinga de un paquete real. */
    CATALOGO_CAJAS: [
      {tipo: 'XXS', dims: [15, 10, 10], pesoMaxKg: 0.25},
      {tipo: 'XS',  dims: [20, 15, 12], pesoMaxKg: 0.5},
      {tipo: 'S',   dims: [30, 20, 12], pesoMaxKg: 2},
      {tipo: 'M',   dims: [30, 24, 20], pesoMaxKg: 5},
      {tipo: 'L',   dims: [42, 30, 23], pesoMaxKg: 10}
    ],

    /* Clasifica un paquete por sus medidas y peso.
       → {tipo:'S', etiqueta:'Paquete S'}      la caja donde entra
       → {tipo:'OTRA', etiqueta:'Otra Medida'} no entra en ninguna (grande o pesada)
       → null                                  faltan datos: no se puede clasificar
       Nunca lanza — datos incompletos o inválidos devuelven null, no un error. */
    clasificarPaquete: function (largo, ancho, alto, peso) {
      var l = parseFloat(largo), a = parseFloat(ancho),
          h = parseFloat(alto), p = parseFloat(peso);
      if (!(l > 0) || !(a > 0) || !(h > 0) || !(p > 0)) return null;
      var dims = [l, a, h].sort(function (x, y) { return y - x; });
      var cajas = this.CATALOGO_CAJAS;
      for (var i = 0; i < cajas.length; i++) {
        var c = cajas[i];
        if (dims[0] <= c.dims[0] && dims[1] <= c.dims[1] &&
            dims[2] <= c.dims[2] && p <= c.pesoMaxKg) {
          return {tipo: c.tipo, etiqueta: 'Paquete ' + c.tipo};
        }
      }
      return {tipo: 'OTRA', etiqueta: 'Otra Medida'};
    }
  };

  global.Shalom = Shalom;

})(window);
