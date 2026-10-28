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
 * ESTADO (2026-10-28): CONECTADO. El servidor descarga el ticket, lo guarda
 * en Storage y lo apunta en el pedido (functions/ticketShalom.js). Aquí solo
 * se pide y se pinta el enlace que vuelve: el navegador no toca el archivo.
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

    // El servidor guarda el ticket EN el pedido: hace falta que exista.
    var id = (typeof _editId !== 'undefined') ? _editId : null;
    if (!id) { _toast('⚠️ Guarda el pedido primero y luego jala el ticket'); return; }
    if (!global.Shalom || typeof global.Shalom.ticket !== 'function') {
      _toast('⚠️ Recarga la página (falta shalom.js)'); return;
    }
    // Reemplazar un documento que ya está es una decisión: se pregunta.
    var actual = (typeof _docs !== 'undefined' && _docs) ? _docs.guia : null;
    if (actual && actual.d && typeof global.confirm === 'function' &&
        !global.confirm('Este pedido ya tiene una Guía / Ticket. ¿Reemplazarla por el ticket de Shalom?')) {
      return;
    }
    var btn = document.getElementById('btnJalarTicket');
    var txt = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Jalando ticket…'; }
    try {
      var rt = await global.Shalom.ticket(id, data.orderNumber, data.orderCode);
      if (!rt || !rt.ok || !rt.doc) {
        _toast(TicketModule.textoMotivo(rt));
        return;
      }
      // Ya está guardado en la nube. Se refleja en el formulario y en el
      // pedido en memoria (si cierras sin guardar, el ticket sigue ahí).
      if (typeof _docs !== 'undefined' && _docs) _docs.guia = rt.doc;
      if (typeof global.refreshSlot === 'function') global.refreshSlot('guia');
      var s = global.S && global.S.shipments &&
        global.S.shipments.find(function (x) { return x.id === id; });
      if (s) s.docGuia = rt.doc;
      if (typeof global.render === 'function') global.render();
      _toast('🧾 Ticket de Shalom guardado ✓');
    } catch (e) {
      _toast('📡 No se pudo conectar — revisa tu internet');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = txt; }
    }
  };

  /* Qué decir de cada motivo: honesto, nunca mudo. */
  TicketModule.textoMotivo = function (rt) {
    var m = rt && rt.motivo;
    if (m === 'SIN_DATO') return '⚠️ Revisa la guía y el código (guía de 8 o 9 dígitos)';
    if (m === 'NO_ENCONTRADO') return '⚠️ Shalom no encontró esa guía con ese código';
    if (m === 'SIN_SESION') return '🔒 Tu sesión venció — ingresa de nuevo';
    if (m === 'SIN_PERMISO') return '🚫 Tu cuenta no está autorizada';
    if (m === 'SIN_RED') return '📡 Sin conexión con Shalom — intenta en un momento';
    if (m === 'LIMITE') return '⏳ Cuota de Shalom agotada — intenta más tarde';
    if (m === 'PUERTA_CERRADA' || m === 'APAGADA') return '🚪 La puerta a Shalom está cerrada (Config)';
    if (m === 'FORMATO_DESCONOCIDO') return '⚠️ Shalom no devolvió un ticket válido';
    return '⚠️ No se pudo jalar el ticket' + (rt && rt.detalle ? ': ' + rt.detalle : '');
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
