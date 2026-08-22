/**
 * shalom.js — Puerta única a Shalom
 * ==================================
 * TODO lo que habla con Shalom pasa por aquí: consultar una guía, jalar el
 * ticket, traer agencias y registrar pedidos. Un solo dueño, un solo contrato.
 *
 * ESTADO: DESCONECTADO a propósito. La integración vieja se retiró porque
 * Shalom protege su portal con reCAPTCHA v3 (puntúa invisible cada visita) y un
 * servidor nunca saca nota suficiente: por eso el rastreo automático fallaba en
 * silencio. La nueva integración irá contra pro.shalom.pe con la cuenta del
 * negocio. El porqué completo está en docs/SHALOM.md.
 *
 * Mientras tanto, cada método responde {ok:false, motivo:'DESCONECTADO'} y la
 * UI muestra un aviso honesto — nunca un fallo mudo ni un dato inventado.
 * Cuando la integración esté lista, se rellenan estos 4 métodos y toda la UI
 * (botones ⟳ Consultar, 🔄 masivo, 🧾 Jalar ticket, Extraer agencias) se
 * enciende sin tocar un solo botón.
 */
(function (global) {
  'use strict';

  var MOTIVO = 'DESCONECTADO';

  function _aviso(accion) {
    if (typeof global.toast === 'function') {
      global.toast('🔧 Shalom en reconstrucción — ' + accion + ' no disponible aún');
    }
  }

  var Shalom = {
    // Bandera legible por si alguien quiere preguntar antes de llamar.
    DISPONIBLE: false,

    // Estado de una guía. Futuro: pro.shalom.pe → Seguimiento de envíos.
    consultarGuia: function () {
      _aviso('consultar el estado');
      return Promise.resolve({ok: false, motivo: MOTIVO});
    },

    // Ticket / guía de remisión. Futuro: pro.shalom.pe → Comprobantes.
    ticket: function () {
      _aviso('jalar el ticket');
      return Promise.resolve({ok: false, motivo: MOTIVO});
    },

    // Catálogo de agencias. Futuro: portal PRO. Sin aviso a propósito: es el
    // respaldo silencioso del buscador, que sigue funcionando con el JSON local.
    agencias: function () {
      return Promise.resolve({ok: false, motivo: MOTIVO});
    },

    // Registrar un pedido. Futuro: pro.shalom.pe → Registro individual/masivo.
    registrar: function () {
      _aviso('registrar el pedido');
      return Promise.resolve({ok: false, motivo: MOTIVO});
    }
  };

  global.Shalom = Shalom;

})(window);
