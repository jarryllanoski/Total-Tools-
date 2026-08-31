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
       pedido y no expone datos de personas. */
    esquema: function (guia, codigo) {
      if (!guia || !codigo) return Promise.resolve({ok: false, motivo: 'SIN_DATO'});
      return _llamar('esquema', {orderNumber: String(guia), orderCode: String(codigo)});
    },

    ticket: function () {
      return Promise.resolve(OFF);
    },
    agencias: function () {
      return Promise.resolve(OFF);
    },
    registrar: function () {
      return Promise.resolve(OFF);
    }
  };

  global.Shalom = Shalom;

})(window);
