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
 * ESTADO: DESCONECTADO a propósito. La integración vieja se retiró — Shalom
 * protege su portal con reCAPTCHA v3 (puntúa invisible cada visita) y un
 * servidor nunca saca nota. La nueva irá contra pro.shalom.pe con la cuenta del
 * negocio. Cuando esté lista, se rellenan estos 4 métodos y `DISPONIBLE=true`,
 * y toda la UI se enciende sola. Ver docs/SHALOM.md.
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
 *     DESCONECTADO · NO_ENCONTRADO · BLOQUEADO (reCAPTCHA/sesión) · SIN_DATO
 *   REGLA DE ORO: jamás ok:true sin dato real. Sin estado → ok:false. (La
 *   lección más cara: el éxito falso ocultó días de fallo.)
 */
(function (global) {
  'use strict';

  var OFF = {ok: false, motivo: 'DESCONECTADO'};

  var Shalom = {
    // Interruptor maestro. Mientras sea false, el auto-check del panel no corre
    // y los botones avisan "en reconstrucción". Se pone true al conectar.
    DISPONIBLE: false,

    consultarGuia: function () {
      return Promise.resolve(OFF);
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
