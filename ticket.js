/**
 * ticket.js — Jalar ticket de Shalom (PNG) v1
 * ============================================
 * Llama a POST /api/ticket-image con orderNumber + orderCode,
 * recibe un PNG y lo coloca en el slot TICKET del formulario.
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
 * Por defecto USE_PROXY = true → llama a la Cloud Function "shalomTicket"
 * (la API key NO viaja en el navegador). Pon USE_PROXY = false + API_KEY solo
 * para pruebas locales antes de desplegar la función.
 */
(function (global) {
  'use strict';

  /* ── CONFIG ──────────────────────────────────────────────────────── */
  var SHALOM = {
    // true  = llama a tu Cloud Function (la API key vive en el servidor) ← PRODUCCIÓN
    // false = llama directo a shalom-api.lat con la key en el cliente   ← solo pruebas
    USE_PROXY:    true,
    FUNCTION_URL: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomTicket',

    // Solo se usan si USE_PROXY === false
    BASE_URL: 'https://shalom-api.lat',
    ENDPOINT: '/api/ticket-image',
    API_KEY:  '' // déjala vacía en producción; con USE_PROXY la key va en el proxy
  };

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

  /* Descargar el PNG del ticket desde la API de Shalom (proxy o directo) */
  async function _fetchTicketPNG(orderNumber, orderCode) {
    var url, opts;
    if (SHALOM.USE_PROXY) {
      // Vía Cloud Function: la key NO viaja en el navegador
      url  = SHALOM.FUNCTION_URL;
      opts = {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderNumber: orderNumber, orderCode: orderCode })
      };
    } else {
      // Directo a shalom-api.lat (solo pruebas; expone la key)
      url  = SHALOM.BASE_URL + SHALOM.ENDPOINT;
      opts = {
        method:  'POST',
        headers: { 'x-api-key': SHALOM.API_KEY, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orderNumber: orderNumber, orderCode: orderCode })
      };
    }

    var r = await fetch(url, opts);

    if (!r.ok) {
      var txt = '';
      try { txt = await r.text(); } catch (e) {}
      throw new Error('HTTP ' + r.status + (txt ? ' — ' + txt.slice(0, 120) : ''));
    }

    var ct   = (r.headers.get('content-type') || '').toLowerCase();
    var blob = await r.blob();

    // Si la API devolvió un JSON de error con status 200
    if (ct.indexOf('image') === -1 && (blob.type || '').indexOf('image') === -1) {
      var msg = '';
      try { msg = await blob.text(); } catch (e) {}
      throw new Error('La API no devolvió una imagen' + (msg ? ' — ' + msg.slice(0, 120) : ''));
    }
    return blob;
  }

  function _blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload  = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('No se pudo leer la imagen')); };
      fr.readAsDataURL(blob);
    });
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  var TicketModule = {};

  TicketModule.jalar = async function () {
    var data = _getOrderData();
    if (!data.orderNumber || !data.orderCode) {
      _toast('⚠️ Ingresa la guía y el código Shalom primero');
      return;
    }

    var btn     = document.getElementById('btnJalarTicket');
    var prevTxt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Generando...'; }
    _toast('⏳ Generando ticket de Shalom...');

    try {
      var blob     = await _fetchTicketPNG(data.orderNumber, data.orderCode);
      var fileName = 'ticket-shalom-' + data.orderNumber + '.png';
      var shipId   = (typeof _editId !== 'undefined') ? _editId : null;
      var docObj;

      if (shipId && global.StorageModule &&
          typeof global.StorageModule.uploadFile === 'function') {
        // Pedido existente → subir directo a Firebase Storage (URL persistente)
        var file = new File([blob], fileName, { type: 'image/png' });
        docObj   = await global.StorageModule.uploadFile(file, shipId, 'ticket');
      } else {
        // Pedido nuevo → base64 temporal (storage.js lo migra a Storage al guardar)
        var dataUrl = await _blobToDataUrl(blob);
        docObj = { d: dataUrl, n: fileName, t: 'image/png' };
      }

      if (typeof _docs !== 'undefined')        _docs.ticket = docObj;
      if (typeof refreshSlot === 'function')   refreshSlot('ticket');

      _toast('🧾 Ticket cargado ✓ — Guarda el pedido para conservarlo');
    } catch (e) {
      console.warn('[Ticket] Error:', e.message);
      _toast('⚠️ No se pudo generar el ticket: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled    = false;
        btn.textContent = prevTxt || '🧾 Jalar ticket de Shalom';
      }
    }
  };

  /* ── INYECTAR BOTÓN EN EL SLOT TICKET ────────────────────────────── */
  function _injectBtn() {
    var addBtn = document.getElementById('addBtnTicket');
    if (!addBtn) return;                               // slot ticket aún no existe
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

    // Insertar justo después del botón "+ Agregar" del slot ticket
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
        console.log('[Ticket] Módulo listo — POST /api/ticket-image (PNG)');
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
