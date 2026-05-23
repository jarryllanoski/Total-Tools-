/**
 * tracking.js — Módulo de tracking Shalom
 * =========================================
 * ⚠️  API KEY EXPUESTA SOLO PARA PRUEBA EN GITHUB PAGES.
 *     NO USAR EN PRODUCCIÓN. MOVER A FIREBASE FUNCTIONS.
 *
 * Integra:
 *  - POST /api/track → estado real de guías Shalom
 *  - Tracking automático (max 1 consulta cada 6h por pedido)
 *  - Panel admin: bloque tracking en cada card
 *  - Auto-cambio de estado: ENVIADO → FINALIZADO / alerta destino
 *  - Historial de consultas por pedido
 *  - Manual de uso
 */
(function(global){
'use strict';

/* ══════════════════════════════════════════════
   CONFIGURACIÓN
══════════════════════════════════════════════ */
var TRK = {
  // ✅ Sin API KEY aquí — usa Firebase Function como proxy seguro
  FIREBASE_URL: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalom',
  // Intervalo mínimo entre consultas automáticas (6 horas en ms)
  AUTO_INTERVAL_MS: 6 * 60 * 60 * 1000,
  // Palabras clave para detección de estado
  KEYWORDS_ENTREGADO: ['entregado','entrega realizada','entrega completa','recogido','recojo completado','delivered'],
  KEYWORDS_DESTINO:   ['llegó a destino','llego a destino','en agencia destino','disponible para recojo',
                       'disponible para retiro','en agencia de destino','a disposicion'],
};

/* ══════════════════════════════════════════════
   API CALL
══════════════════════════════════════════════ */
async function consultarShalom(orderNumber, orderCode) {
  try {
    // Llamar via Firebase Function — API key segura en el servidor
    var r = await fetch(TRK.FIREBASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint:    '/api/track',
        body: {
          orderNumber: String(orderNumber).trim(),
          orderCode:   String(orderCode || '').trim()
        }
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch(e) {
    console.warn('[Tracking] Error consultando Shalom:', e.message);
    return null;
  }
}

/* ══════════════════════════════════════════════
   DETECCIÓN DE ESTADO
══════════════════════════════════════════════ */
function detectarEstado(raw) {
  if (!raw) return null;
  // Normalizar texto: estado + descripción
  var texto = [
    raw.estado, raw.status, raw.descripcion, raw.description,
    raw.message, raw.msg
  ].filter(Boolean).join(' ').toLowerCase()
   .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (var i = 0; i < TRK.KEYWORDS_ENTREGADO.length; i++) {
    if (texto.includes(TRK.KEYWORDS_ENTREGADO[i])) return 'FINALIZADO';
  }
  for (var j = 0; j < TRK.KEYWORDS_DESTINO.length; j++) {
    if (texto.includes(TRK.KEYWORDS_DESTINO[j])) return 'EN_DESTINO';
  }
  return null;
}

function extraerEstadoTexto(raw) {
  if (!raw) return '—';
  var d = raw.data || raw.result || raw.tracking || raw;
  return d.estado || d.status || d.estado_actual || d.message || '—';
}

function extraerHistorial(raw) {
  if (!raw) return [];
  var d = raw.data || raw.result || raw.tracking || raw;
  var hist = d.historial || d.history || d.estados || d.events || [];
  return hist.map(function(e) {
    return {
      estado:  e.estado  || e.status || e.descripcion || e.event   || '',
      fecha:   e.fecha   || e.date   || e.datetime    || e.hora    || '',
      lugar:   e.lugar   || e.location || e.ciudad    || '',
    };
  });
}

/* ══════════════════════════════════════════════
   GUARDAR RESULTADO EN EL SHIPMENT (S global)
══════════════════════════════════════════════ */
function aplicarResultado(ship, rawResult, source) {
  if (!rawResult) {
    // Error de conexión — no borrar datos previos
    if (!ship.trackingHistory) ship.trackingHistory = [];
    ship.trackingHistory.push({
      date:    new Date().toISOString(),
      status:  'ERROR',
      message: 'No se pudo consultar. Revisa número de orden y código.',
      source:  source || 'manual'
    });
    ship.trackingLastAutoCheck = Date.now();
    return 'error';
  }

  var estadoTexto  = extraerEstadoTexto(rawResult);
  var historial    = extraerHistorial(rawResult);
  var autoEstado   = detectarEstado(rawResult.data || rawResult.result || rawResult.tracking || rawResult);
  var now          = new Date().toISOString();

  // Actualizar campos de tracking en el shipment
  ship.trackingStatus      = estadoTexto;
  ship.trackingMessage     = estadoTexto;
  ship.trackingLastUpdate  = now;
  ship.trackingLastAutoCheck = Date.now();
  if (!ship.trackingHistory) ship.trackingHistory = [];
  ship.trackingHistory.push({
    date:    now,
    status:  estadoTexto,
    message: estadoTexto,
    source:  source || 'manual'
  });
  // Guardar historial Shalom completo
  if (historial.length) ship.trackingHistorialShalom = historial;

  // Automatizaciones de estado
  var cambioEstado = null;
  if (autoEstado === 'FINALIZADO' && ship.status !== 'FINALIZADO') {
    ship.status = 'FINALIZADO';
    cambioEstado = 'FINALIZADO';
  } else if (autoEstado === 'EN_DESTINO') {
    cambioEstado = 'EN_DESTINO';
    // No cambia el estado del pedido — solo alerta
  }

  return cambioEstado || 'ok';
}

/* ══════════════════════════════════════════════
   TRACKING AUTOMÁTICO
   Se llama al abrir el panel. Revisa pedidos ENVIADO
   que no hayan sido consultados en las últimas 6h.
   Máximo evita loops — solo 1 ciclo por apertura.
══════════════════════════════════════════════ */
var _autoRunning = false;

async function autoTrackingCheck() {
  if (_autoRunning) return; // evitar bucles
  if (typeof window.S === 'undefined' || !window.S.shipments) return;
  _autoRunning = true;

  var ahora    = Date.now();
  var pendientes = window.S.shipments.filter(function(s) {
    if (!s.trackingOrderNumber) return false;                        // sin guía
    if (s.status === 'FINALIZADO') return false;                     // ya finalizado
    var ultima = s.trackingLastAutoCheck || 0;
    return (ahora - ultima) >= TRK.AUTO_INTERVAL_MS;                 // hace +6h
  });

  if (!pendientes.length) { _autoRunning = false; return; }

  console.log('[Tracking] Auto-check:', pendientes.length, 'pedidos a revisar');

  for (var i = 0; i < pendientes.length; i++) {
    var ship = pendientes[i];
    try {
      var raw = await consultarShalom(ship.trackingOrderNumber, ship.trackingOrderCode);
      var resultado = aplicarResultado(ship, raw, 'auto');

      if (resultado === 'EN_DESTINO') {
        // Mostrar alerta de destino
        if (typeof window.toast === 'function') {
          window.toast('📍 ' + ship.name + ' — Pedido llegó a destino. Avisar al cliente.');
        }
        _mostrarAlertaDestino(ship);
      }
    } catch(e) {
      console.warn('[Tracking] Error en auto-check para', ship.id, e);
    }
    // Pequeña pausa entre consultas para no saturar la API
    await new Promise(function(r) { setTimeout(r, 500); });
  }

  if (typeof window.save === 'function') window.save();
  if (typeof window.render === 'function') window.render();
  _autoRunning = false;
}

function _mostrarAlertaDestino(ship) {
  // Crear toast persistente de alerta
  var div = document.createElement('div');
  div.style.cssText = [
    'position:fixed;top:70px;left:50%;transform:translateX(-50%);',
    'background:#1c2333;border:2px solid #a78bfa;border-radius:12px;',
    'padding:14px 18px;z-index:999;max-width:340px;width:calc(100% - 32px);',
    'box-shadow:0 8px 24px rgba(0,0,0,.6);animation:shalomUp .25s ease'
  ].join('');
  div.innerHTML = [
    '<div style="font-size:12px;font-weight:800;color:#a78bfa;letter-spacing:.5px;margin-bottom:6px">',
    '📍 PEDIDO LLEGÓ A DESTINO</div>',
    '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px"><b>' + _esc(ship.name) + '</b></div>',
    '<div style="font-size:11px;color:#8b949e;margin-bottom:10px">',
    'Guía: ' + _esc(ship.trackingOrderNumber) + ' · Estado: ' + _esc(ship.trackingStatus || '—') + '</div>',
    '<div style="display:flex;gap:8px">',
    '<button onclick="this.closest(\'div[style]\').remove()" style="flex:1;background:#30363d;',
    'border:none;border-radius:8px;color:#8b949e;padding:8px;font-size:12px;cursor:pointer;font-family:inherit">',
    'Cerrar</button>',
    '<button onclick="window.open(\'https://wa.me/51'+_esc(ship.phone)+'\',\'_blank\');',
    'this.closest(\'div[style]\').remove()" style="flex:2;background:rgba(167,139,250,.15);',
    'border:1px solid rgba(167,139,250,.3);border-radius:8px;color:#a78bfa;',
    'padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">',
    '💬 Avisar al cliente</button>',
    '</div>'
  ].join('');
  document.body.appendChild(div);
  // Auto-cierre a los 15 segundos
  setTimeout(function() { if (div.parentNode) div.remove(); }, 15000);
}

/* ══════════════════════════════════════════════
   HELPER
══════════════════════════════════════════════ */
function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════
   CSS DEL MÓDULO
══════════════════════════════════════════════ */
function _injectCSS() {
  if (document.getElementById('trkCSS')) return;
  var s = document.createElement('style');
  s.id = 'trkCSS';
  s.textContent = [
    '.trk-block{background:rgba(56,139,253,.05);border:1px solid rgba(56,139,253,.18);',
    '  border-radius:10px;padding:11px 12px;margin-top:8px}',
    '.trk-title{font-size:10px;font-weight:800;color:#388bfd;letter-spacing:.8px;',
    '  text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;gap:6px}',
    '.trk-frow{display:flex;gap:7px;margin-bottom:7px}',
    '.trk-fi{flex:1;background:#1c2333;border:1px solid #30363d;border-radius:7px;',
    '  padding:8px 10px;color:#e6edf3;font-size:12px;font-family:inherit;outline:none;',
    '  font-family:monospace}',
    '.trk-fi:focus{border-color:#388bfd}',
    '.trk-fi::placeholder{color:#8b949e}',
    '.trk-btns{display:flex;gap:6px;margin-top:4px;flex-wrap:wrap}',
    '.trk-btn{padding:7px 11px;border-radius:7px;border:none;font-size:11px;',
    '  font-weight:700;cursor:pointer;font-family:inherit}',
    '.trk-btn-save{background:linear-gradient(135deg,#388bfd,#1a5fbf);color:#fff}',
    '.trk-btn-consult{background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);',
    '  color:#388bfd}',
    '.trk-btn-hist{background:rgba(107,114,128,.12);border:1px solid rgba(107,114,128,.3);',
    '  color:#8b949e}',
    '.trk-status{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;',
    '  border-radius:16px;font-size:11px;font-weight:700;border:1px solid;',
    '  margin-top:6px;max-width:100%;cursor:pointer}',
    '.trk-st-ok{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.3);color:#22c55e}',
    '.trk-st-dest{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3);color:#a78bfa}',
    '.trk-st-camino{background:rgba(56,139,253,.1);border-color:rgba(56,139,253,.3);color:#388bfd}',
    '.trk-st-pend{background:rgba(107,114,128,.1);border-color:rgba(107,114,128,.3);color:#8b949e}',
    '.trk-st-err{background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.3);color:#f87171}',
    '.trk-loading{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:#8b949e;margin-top:6px}',
    '.trk-spin{width:14px;height:14px;border:2px solid #30363d;border-top-color:#388bfd;',
    '  border-radius:50%;animation:trkSpin .7s linear infinite;flex-shrink:0}',
    '@keyframes trkSpin{to{transform:rotate(360deg)}}',
    // Overlay de historial
    '#trkHistOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);',
    '  z-index:800;align-items:flex-end;justify-content:center}',
    '#trkHistOv.open{display:flex}',
    '#trkHistSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;',
    '  width:100%;max-width:480px;border:1px solid #30363d;',
    '  animation:shalomUp .22s ease;max-height:85vh;overflow-y:auto}',
    '.trk-hist-row{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-hist-row:last-child{border-bottom:none}',
    '.trk-hist-dot{width:7px;height:7px;border-radius:50%;background:#388bfd;',
    '  flex-shrink:0;margin-top:5px}',
    // Manual
    '#trkManualOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);',
    '  z-index:800;align-items:flex-end;justify-content:center}',
    '#trkManualOv.open{display:flex}',
    '#trkManualSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;',
    '  width:100%;max-width:480px;border:1px solid #30363d;',
    '  animation:shalomUp .22s ease;max-height:85vh;overflow-y:auto}',
    '.trk-manual-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-manual-step:last-child{border-bottom:none}',
    '.trk-manual-num{width:22px;height:22px;border-radius:50%;background:rgba(56,139,253,.15);',
    '  border:1px solid rgba(56,139,253,.3);color:#388bfd;font-size:11px;font-weight:800;',
    '  display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}',
  ].join('');
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════
   OVERLAY DE HISTORIAL
══════════════════════════════════════════════ */
function _injectOverlays() {
  if (document.getElementById('trkHistOv')) return;

  // Historial overlay
  var ov1 = document.createElement('div');
  ov1.id = 'trkHistOv';
  ov1.innerHTML = '<div id="trkHistSheet"><div id="trkHistContent"></div>' +
    '<button onclick="document.getElementById(\'trkHistOv\').classList.remove(\'open\')" ' +
    'style="width:100%;margin-top:12px;padding:11px;background:#1c2333;border:1px solid #30363d;' +
    'border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button></div>';
  ov1.addEventListener('click', function(e) {
    if (e.target === ov1) ov1.classList.remove('open');
  });
  document.body.appendChild(ov1);

  // Manual overlay
  var ov2 = document.createElement('div');
  ov2.id = 'trkManualOv';
  ov2.innerHTML = '<div id="trkManualSheet">' +
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin-bottom:14px">📖 Manual Shalom</div>' +
    '<div id="trkManualContent"></div>' +
    '<button onclick="document.getElementById(\'trkManualOv\').classList.remove(\'open\')" ' +
    'style="width:100%;margin-top:14px;padding:12px;background:#1c2333;border:1px solid #30363d;' +
    'border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button></div>';
  ov2.addEventListener('click', function(e) {
    if (e.target === ov2) ov2.classList.remove('open');
  });
  document.body.appendChild(ov2);

  // Llenar manual
  var pasos = [
    'El cliente elige agencia Shalom en el formulario.',
    'El pedido llega al panel admin como NUEVO PEDIDO.',
    'Cuando se despacha, edita el pedido y coloca el número de orden y código.',
    'Presiona <b>Guardar tracking</b> — el pedido pasa a ENVIADO automáticamente.',
    'Presiona <b>Consultar ahora</b> para verificar el estado en tiempo real.',
    'El sistema actualizará automáticamente cada 6 horas al abrir el panel.',
    'Cuando llegue a destino, aparece una alerta para avisar al cliente.',
    'Cuando figure entregado, el pedido pasa a FINALIZADO automáticamente.',
    'El historial de consultas queda guardado en el pedido.',
  ];
  document.getElementById('trkManualContent').innerHTML = pasos.map(function(p, i) {
    return '<div class="trk-manual-step">' +
      '<div class="trk-manual-num">' + (i + 1) + '</div>' +
      '<div style="font-size:13px;color:#e6edf3;line-height:1.5">' + p + '</div>' +
      '</div>';
  }).join('');
}

/* ══════════════════════════════════════════════
   RENDERIZAR BLOQUE TRACKING EN CARD
   Llama desde cardHTML(s) del panel.
   Uso: Tracking.renderCardBlock(s)
══════════════════════════════════════════════ */
function _statusChip(ship) {
  var st = ship.trackingStatus;
  if (!st) return '';
  var cls, ico;
  var u = st.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  if (u.includes('ENTREGADO') || ship.status === 'FINALIZADO') {
    cls = 'trk-st-ok'; ico = '✅';
  } else if (u.includes('AGENCIA') || u.includes('DESTINO') || u.includes('DISPONIBLE')) {
    cls = 'trk-st-dest'; ico = '🏢';
  } else if (u.includes('TRANSITO') || u.includes('CAMINO') || u.includes('VIAJE')) {
    cls = 'trk-st-camino'; ico = '🚌';
  } else if (u.includes('ERROR') || u.includes('NO SE PUDO')) {
    cls = 'trk-st-err'; ico = '⚠';
  } else {
    cls = 'trk-st-pend'; ico = '📦';
  }
  var last = ship.trackingLastUpdate
    ? new Date(ship.trackingLastUpdate).toLocaleString('es-PE', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '';
  return '<div class="trk-status ' + cls + '" onclick="Tracking.verHistorial(\'' + _esc(ship.id) + '\')">' +
    ico + ' ' + _esc(st) +
    (last ? '<span style="opacity:.55;font-size:9px;margin-left:4px">' + last + '</span>' : '') +
    ' <span style="opacity:.45;font-size:9px">↗</span></div>';
}

var Tracking = {};

Tracking.renderCardBlock = function(s) {
  if (!s.trackingOrderNumber && !s.trackingStatus) return '';

  var statusHTML = s.trackingStatus
    ? _statusChip(s)
    : '<div style="font-size:11px;color:#8b949e;margin-top:4px">Sin consultas aún</div>';

  return '<div class="trk-block">' +
    '<div class="trk-title">📦 Tracking Shalom</div>' +
    '<div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;margin-bottom:4px">' +
    '<div style="font-size:11px;color:#8b949e">' +
    (s.trackingOrderNumber ? '🔢 Orden: <b style="color:#e6edf3;font-family:monospace">' + _esc(s.trackingOrderNumber) + '</b>' : 'Sin número de orden') +
    (s.trackingOrderCode ? ' · <b style="color:#e6edf3;font-family:monospace">' + _esc(s.trackingOrderCode) + '</b>' : '') +
    '</div>' +
    '<button onclick="Tracking.abrirManual()" style="background:none;border:none;color:#8b949e;font-size:10px;cursor:pointer;padding:0;white-space:nowrap">📖 Manual</button>' +
    '</div>' +
    statusHTML +
    '<div class="trk-btns" style="margin-top:8px">' +
    '<button class="trk-btn trk-btn-save" onclick="Tracking.abrirEdicion(\'' + _esc(s.id) + '\')">✏️ Editar tracking</button>' +
    '<button class="trk-btn trk-btn-consult" onclick="Tracking.consultarAhora(\'' + _esc(s.id) + '\')">⟳ Consultar</button>' +
    (s.trackingHistory && s.trackingHistory.length
      ? '<button class="trk-btn trk-btn-hist" onclick="Tracking.verHistorial(\'' + _esc(s.id) + '\')">📋 Historial</button>'
      : '') +
    '</div>' +
    '</div>';
};

/* ══════════════════════════════════════════════
   EDICIÓN DE TRACKING (overlay reutilizando delOverlay)
══════════════════════════════════════════════ */
Tracking.abrirEdicion = function(shipId) {
  var ship = window.S && window.S.shipments
    ? window.S.shipments.find(function(x){ return x.id === shipId; })
    : null;
  if (!ship) return;

  // Reutiliza el delOverlay del panel (ya existe en index.html)
  var ov = document.getElementById('delOverlay');
  if (!ov) return;
  var sheet = ov.querySelector('.sheet');

  sheet.innerHTML = [
    '<div class="sheet-handle"></div>',
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin-bottom:14px">📦 Tracking Shalom</div>',
    '<div style="font-size:11px;color:#8b949e;margin-bottom:12px">' + _esc(ship.name) + '</div>',
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">',
    '  <div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">NÚMERO DE ORDEN</label>',
    '    <input id="trkOrdNum" class="fi" placeholder="Ej: 66479331" style="font-family:monospace" inputmode="numeric"',
    '      value="' + _esc(ship.trackingOrderNumber || '') + '"></div>',
    '  <div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">CÓDIGO</label>',
    '    <input id="trkOrdCode" class="fi" placeholder="Ej: 3KTH" style="font-family:monospace;text-transform:uppercase"',
    '      oninput="this.value=this.value.toUpperCase()" maxlength="6"',
    '      value="' + _esc(ship.trackingOrderCode || '') + '"></div>',
    '  <div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">AGENCIA DESTINO</label>',
    '    <input id="trkAgencia" class="fi" placeholder="Ej: Agencia Miraflores, Lima"',
    '      value="' + _esc(ship.shippingAgency || '') + '"></div>',
    '</div>',
    '<div style="display:flex;gap:8px">',
    '  <button onclick="document.getElementById(\'delOverlay\').classList.remove(\'open\')" ',
    '    style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;',
    '    color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>',
    '  <button onclick="Tracking._guardarEdicion(\'' + _esc(shipId) + '\')" ',
    '    style="flex:2;padding:12px;background:linear-gradient(135deg,#388bfd,#1a5fbf);border:none;',
    '    border-radius:9px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">',
    '    💾 Guardar tracking</button>',
    '</div>',
  ].join('');
  ov.classList.add('open');
};

Tracking._guardarEdicion = function(shipId) {
  var ship = window.S && window.S.shipments
    ? window.S.shipments.find(function(x){ return x.id === shipId; })
    : null;
  if (!ship) return;

  var num    = document.getElementById('trkOrdNum')   ? document.getElementById('trkOrdNum').value.trim()   : '';
  var code   = document.getElementById('trkOrdCode')  ? document.getElementById('trkOrdCode').value.trim()  : '';
  var agencia= document.getElementById('trkAgencia')  ? document.getElementById('trkAgencia').value.trim()  : '';

  if (!num) {
    if (typeof window.toast === 'function') window.toast('⚠️ Ingresa el número de orden');
    return;
  }

  ship.trackingOrderNumber = num;
  ship.trackingOrderCode   = code;
  ship.shippingAgency      = agencia;
  ship.shippingCourier     = 'Shalom';

  // Resetear estado si cambió la guía
  var guiaAnterior = ship._prevTrackingNum;
  if (guiaAnterior && guiaAnterior !== num) {
    ship.trackingStatus    = '';
    ship.trackingMessage   = '';
    ship.trackingLastUpdate= '';
  }
  ship._prevTrackingNum = num;

  // Cambiar a ENVIADO automáticamente
  if (ship.status !== 'ENVIADO' && ship.status !== 'FINALIZADO') {
    ship.status = 'ENVIADO';
    if (typeof window.toast === 'function') window.toast('🚚 Pedido marcado como ENVIADO');
  }

  if (typeof window.save === 'function') window.save();
  if (typeof window.render === 'function') window.render();
  document.getElementById('delOverlay').classList.remove('open');
  if (typeof window.toast === 'function') window.toast('✅ Tracking guardado');
};

/* ══════════════════════════════════════════════
   CONSULTAR AHORA
══════════════════════════════════════════════ */
Tracking.consultarAhora = async function(shipId) {
  var ship = window.S && window.S.shipments
    ? window.S.shipments.find(function(x){ return x.id === shipId; })
    : null;
  if (!ship) return;
  // ★ Leer número de guía desde trackingOrderNumber o shalomGuia (ambos válidos)
  var guia   = ship.trackingOrderNumber || ship.shalomGuia || '';
  var codigo = ship.trackingOrderCode   || ship.shalomCodigo || '';
  if (!guia) {
    if (typeof window.toast === 'function') window.toast('⚠️ Primero guarda el número de orden');
    return;
  }
  // Asegurar que trackingOrderNumber esté sincronizado
  if (!ship.trackingOrderNumber && guia) ship.trackingOrderNumber = guia;
  if (!ship.trackingOrderCode   && codigo) ship.trackingOrderCode = codigo;

  if (typeof window.toast === 'function') window.toast('⏳ Consultando Shalom...');

  var raw      = await consultarShalom(guia, codigo);
  var resultado = aplicarResultado(ship, raw, 'manual');

  if (typeof window.save === 'function') window.save();
  if (typeof window.render === 'function') window.render();

  if (resultado === 'error') {
    if (typeof window.toast === 'function') window.toast('⚠️ No se pudo consultar. Revisa número de orden y código.');
  } else if (resultado === 'FINALIZADO') {
    if (typeof window.toast === 'function') window.toast('✅ Pedido FINALIZADO — Shalom confirma entrega');
  } else if (resultado === 'EN_DESTINO') {
    if (typeof window.toast === 'function') window.toast('📍 Pedido llegó a destino — avisar al cliente');
    _mostrarAlertaDestino(ship);
  } else {
    if (typeof window.toast === 'function') window.toast('🔄 Estado: ' + (ship.trackingStatus || '—'));
  }
};

/* ══════════════════════════════════════════════
   VER HISTORIAL
══════════════════════════════════════════════ */
Tracking.verHistorial = function(shipId) {
  var ship = window.S && window.S.shipments
    ? window.S.shipments.find(function(x){ return x.id === shipId; })
    : null;
  var ov  = document.getElementById('trkHistOv');
  var cnt = document.getElementById('trkHistContent');
  if (!ov || !cnt) return;

  if (!ship) {
    cnt.innerHTML = '<div style="text-align:center;padding:20px;color:#8b949e">Pedido no encontrado</div>';
    ov.classList.add('open');
    return;
  }

  var hist  = ship.trackingHistory || [];
  var histS = ship.trackingHistorialShalom || [];

  cnt.innerHTML = [
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:4px">📋 Historial</div>',
    '<div style="font-size:12px;color:#8b949e;margin-bottom:14px">' + _esc(ship.name) + ' · ' +
      (ship.trackingOrderNumber || '—') + '</div>',

    // Estado actual
    ship.trackingStatus ? [
      '<div style="background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);',
      'border-radius:9px;padding:10px 12px;margin-bottom:12px">',
      '<div style="font-size:10px;font-weight:700;color:#388bfd;letter-spacing:.8px;margin-bottom:4px">ESTADO ACTUAL</div>',
      '<div style="font-size:14px;font-weight:700;color:#e6edf3">' + _esc(ship.trackingStatus) + '</div>',
      ship.trackingLastUpdate ? '<div style="font-size:10px;color:#8b949e;margin-top:2px">Última actualización: ' +
        new Date(ship.trackingLastUpdate).toLocaleString('es-PE') + '</div>' : '',
      '</div>'
    ].join('') : '',

    // Historial Shalom (estados de la API)
    histS.length ? [
      '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">ESTADOS SHALOM</div>',
      '<div style="background:#1c2333;border:1px solid #30363d;border-radius:9px;padding:4px 12px;margin-bottom:12px">',
      histS.map(function(h) {
        return '<div class="trk-hist-row">' +
          '<div class="trk-hist-dot"></div>' +
          '<div><div style="font-size:12px;font-weight:700;color:#e6edf3">' + _esc(h.estado) + '</div>' +
          (h.fecha ? '<div style="font-size:10px;color:#8b949e;margin-top:1px">' + _esc(h.fecha) +
            (h.lugar ? ' · ' + _esc(h.lugar) : '') + '</div>' : '') +
          '</div></div>';
      }).join(''),
      '</div>'
    ].join('') : '',

    // Historial de consultas (log interno)
    hist.length ? [
      '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">CONSULTAS REALIZADAS</div>',
      '<div style="background:#1c2333;border:1px solid #30363d;border-radius:9px;padding:4px 12px">',
      hist.slice().reverse().map(function(h) {
        var fecha = h.date ? new Date(h.date).toLocaleString('es-PE', {
          day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
        }) : '';
        var srcBadge = h.source === 'auto'
          ? '<span style="background:rgba(167,139,250,.15);color:#a78bfa;border:1px solid rgba(167,139,250,.3);' +
            'border-radius:6px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:5px">AUTO</span>'
          : '<span style="background:rgba(56,139,253,.15);color:#388bfd;border:1px solid rgba(56,139,253,.3);' +
            'border-radius:6px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:5px">MANUAL</span>';
        return '<div class="trk-hist-row">' +
          '<div class="trk-hist-dot" style="background:' + (h.status==='ERROR'?'#f87171':'#388bfd') + '"></div>' +
          '<div><div style="font-size:12px;font-weight:600;color:#e6edf3">' + _esc(h.status || '—') + srcBadge + '</div>' +
          (fecha ? '<div style="font-size:10px;color:#8b949e;margin-top:1px">' + fecha + '</div>' : '') +
          '</div></div>';
      }).join(''),
      '</div>'
    ].join('') : '<div style="text-align:center;padding:16px;color:#8b949e;font-size:12px">Sin historial aún</div>',
  ].join('');

  ov.classList.add('open');
};

/* ══════════════════════════════════════════════
   ABRIR MANUAL
══════════════════════════════════════════════ */
Tracking.abrirManual = function() {
  var ov = document.getElementById('trkManualOv');
  if (ov) ov.classList.add('open');
};

/* ══════════════════════════════════════════════
   INIT — llama al cargar el panel
══════════════════════════════════════════════ */
Tracking.init = function() {
  _injectCSS();
  _injectOverlays();
  // Lanzar auto-check después de 2s (deja que el panel cargue primero)
  setTimeout(autoTrackingCheck, 2000);
  console.log('[Tracking] Módulo iniciado | auto-check cada 6h');
};

global.Tracking = Tracking;
})(window);
