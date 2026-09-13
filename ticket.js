/**
 * ticket.js — Jalar ticket de Shalom (PNG) v1
 * ============================================
 * Pide el ticket por la puerta única (shalom.js) con orderNumber + orderCode
 * y lo coloca en el slot GUÍA / TICKET (agencia) del formulario.
 *
 *   orderNumber = trackingOrderNumber / shalomGuia   (campo fShalomGuia)
 *   orderCode   = trackingOrderCode   / shalomCodigo (campo fShalomCodigo)
 *
 * Persistencia (reutiliza el mecanismo de storage.js):
 *   - Pedido EXISTENTE → sube el PNG directo a Firebase Storage (URL https://… persistente)
 *   - Pedido NUEVO     → guarda base64 temporal; storage.js lo migra a Storage al guardar
 *
 * Reglas respetadas:
 *   - SIN MutationObserver (parchea openForm como hace qrtracking.js)
 *   - Archivo independiente: solo agregar <script src="ticket.js"></script> en index.html
 *   - No rompe funcionalidades existentes
 *
 * Orden de carga: DESPUÉS de delivery.js (openForm / refreshSlot / _docs / _editId)
 *                 y DESPUÉS de storage.js (window.StorageModule).
 *
 * ESTADO (2026-09-13): el botón está puesto pero la descarga NO — la
 * integración con Shalom se rehace endpoint por endpoint. Este módulo pide el
 * ticket por la puerta única (shalom.js), que hoy responde DESCONECTADO, y
 * avisa "Jalar ticket en reconstrucción". Cuando la puerta devuelva
 * {ok:true, url|dataUrl}, se reescribe aquí la parte que lo guarda.
 */
(function (global) {
  'use strict';

  /* Sin CONFIG de red: quién habla con Shalom es shalom.js, la puerta única.
     Aquí vivía una URL a shalom-api.lat con una ranura para la API key en el
     navegador ("solo pruebas"). Una ranura así no es una prueba: es la clave
     del negocio a un descuido de estar en el código que se publica. Y el
     proxy al que apuntaba la otra rama (`shalomTicket`) ni siquiera existía
     en el backend, así que ese camino llevaba meses muerto. */

  /* ── HELPERS ─────────────────────────────────────────────────────── */
  function _toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
  }

  /* Leer guía + código del formulario, con fallback al pedido en edición */
  function _getOrderData() {
    var g = '', c = '';
    var elG = document.getElementById('fShalomGuia');
    var elC = document.getElementById('fShalomCodigo');
    if (elG) g = (elG.value || '').trim();
    if (elC) c = (elC.value || '').trim();

    if ((!g || !c) && typeof _editId !== 'undefined' && _editId &&
        global.S && global.S.shipments) {
      var s = global.S.shipments.find(function (x) { return x.id === _editId; });
      if (s) {
        if (!g) g = s.trackingOrderNumber || s.shalomGuia   || '';
        if (!c) c = s.trackingOrderCode   || s.shalomCodigo || '';
      }
    }
    return { orderNumber: String(g).trim(), orderCode: String(c).trim() };
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  var TicketModule = {};

  TicketModule.jalar = async function () {
    var data = _getOrderData();
    if (!data.orderNumber || !data.orderCode) {
      _toast('⚠️ Ingresa la guía y el código Shalom primero');
      return;
    }

    // Jalar el ticket pasa por la PUERTA ÚNICA (shalom.js). Hoy desconectada:
    // la puerta devuelve {ok:false} y aquí avisamos honesto. Cuando la
    // integración (pro.shalom.pe → Comprobantes) esté lista, devolverá
    // {ok:true, url|dataUrl} y este botón cargará el ticket en el slot guía.
    if (!global.Shalom || typeof global.Shalom.ticket !== 'function') {
      _toast('🔧 Jalar ticket en reconstrucción');
      return;
    }
    var rt = await global.Shalom.ticket(data.orderNumber, data.orderCode);
    if (!rt || !rt.ok) {
      _toast(rt && rt.motivo === 'NO_ENCONTRADO' ?
        '⚠️ Shalom no encontró esa guía' : '🔧 Jalar ticket en reconstrucción');
      return;
    }
    // Cuando la puerta devuelva {ok:true, url|dataUrl}, el ticket se carga en
    // el slot "Guía / Ticket" y se sube a Storage — ese código se reescribe
    // junto al endpoint, no antes.

    _toast('🔧 Jalar ticket en reconstrucción');
  };

  /* ── INYECTAR BOTÓN EN EL SLOT GUÍA / TICKET (agencia) ───────────── */
  function _injectBtn() {
    var addBtn = document.getElementById('addBtnGuia');
    if (!addBtn) return;                               // slot guía aún no existe
    if (document.getElementById('btnJalarTicket')) return; // ya inyectado

    var b = document.createElement('button');
    b.id          = 'btnJalarTicket';
    b.type        = 'button';
    b.textContent = '🧾 Jalar ticket de Shalom';
    b.style.cssText =
      'width:100%;margin-top:6px;padding:8px;border-radius:8px;cursor:pointer;' +
      'font-family:inherit;font-size:12px;font-weight:700;' +
      'background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.35);color:#a371f7;';
    b.onclick = function () { TicketModule.jalar(); };

    // Insertar justo después del botón "+ Agregar" del slot guía / ticket
    addBtn.parentNode.insertBefore(b, addBtn.nextSibling);
  }

  /* Parchear openForm para asegurar el botón cada vez que se abre (sin MutationObserver) */
  function _patchOpenForm() {
    if (typeof global.openForm !== 'function') return false;
    var _orig = global.openForm;
    global.openForm = function () {
      var ret = _orig.apply(this, arguments);
      setTimeout(_injectBtn, 30); // el form ya está renderizado
      return ret;
    };
    return true;
  }

  TicketModule.init = function () {
    var attempts = 0;
    function tryPatch() {
      var ok = _patchOpenForm();
      _injectBtn(); // por si el slot ya está en el DOM
      if (!ok && attempts < 30) {
        attempts++;
        setTimeout(tryPatch, 200);
      } else {
      }
    }
    setTimeout(tryPatch, 500);
  };

  global.TicketModule = TicketModule;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', TicketModule.init);
  } else {
    TicketModule.init();
  }

})(window);
