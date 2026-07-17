/**
 * tracking.js — Módulo Shalom Tracking
 * =====================================
 * Conecta con Firebase Function shalomTracking
 * Sin API key expuesta — todo pasa por Firebase
 *
 * URL: https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomTracking
 */
(function(global){
'use strict';

/* ══════════════════════════════════════════════
   CONFIGURACIÓN
══════════════════════════════════════════════ */
var TRK = {
  FIREBASE_URL: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/shalomTracking',
  AUTO_INTERVAL_MS:         12 * 60 * 60 * 1000, // 12 horas — en tránsito (base)
  AUTO_INTERVAL_DESTINO_MS: 24 * 60 * 60 * 1000, // 24 horas — llegó a destino / pendiente de pago
  KEYWORDS_ENTREGADO: ['entregado','entrega realizada','entrega completa','recogido','recojo completado','delivered'],
  KEYWORDS_DESTINO:   ['llegó a destino','llego a destino','en agencia destino','disponible para recojo',
                       'disponible para retiro','en agencia de destino','a disposicion',
                       'en destino','en destino -','en la agencia','en destino-'],
  KEYWORDS_TRANSITO:  ['en transito','en tránsito','en camino','en ruta','en traslado','recibido en agencia origen',
                       'salida de agencia','saliendo','despachado','procesando'],
  KEYWORDS_DEMORA:    ['demora','demorado','retraso','retrasado','no entregado','intento de entrega',
                       'pendiente de entrega','ausente','domicilio cerrado'],
};

// Detectar subtítulo informativo para el cliente (tránsito/demora)
function detectarSubtituloCliente(estadoTexto) {
  if (!estadoTexto) return null;
  var t = estadoTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (var i = 0; i < TRK.KEYWORDS_DEMORA.length; i++) {
    if (t.includes(TRK.KEYWORDS_DEMORA[i])) return 'demora';
  }
  for (var j = 0; j < TRK.KEYWORDS_TRANSITO.length; j++) {
    if (t.includes(TRK.KEYWORDS_TRANSITO[j])) return 'transito';
  }
  return null;
}

/* ══════════════════════════════════════════════
   HELPER — escapar HTML
══════════════════════════════════════════════ */
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ══════════════════════════════════════════════
   LLAMADA A FIREBASE FUNCTION
══════════════════════════════════════════════ */
async function consultarShalom(orderNumber, orderCode) {
  console.log('[Tracking] CONSULTANDO SHALOM', orderNumber, orderCode);
  // ★ Timeout: si Shalom no responde en 12s, abortar y seguir con el siguiente.
  // Evita que una consulta colgada trabe todo el ciclo de auto-tracking.
  var _ctrl = new AbortController();
  var _timer = setTimeout(function(){ _ctrl.abort(); }, 12000);
  try {
    var r = await fetch(TRK.FIREBASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderNumber: String(orderNumber).trim(),
        orderCode:   String(orderCode || '').trim()
      }),
      signal: _ctrl.signal
    });
    var raw = await r.json();
    console.log('[Tracking] RESPUESTA SHALOM', raw);
    return raw;
  } catch(e) {
    if(e.name === 'AbortError'){
      console.warn('[Tracking] Timeout 12s — Shalom no respondió:', orderNumber);
    } else {
      console.warn('[Tracking] Error fetch:', e.message);
    }
    return null;
  } finally {
    clearTimeout(_timer); // ★ limpiar el temporizador pase lo que pase
  }
}

/* ══════════════════════════════════════════════
   EXTRACTOR DE ESTADO — soporta cualquier formato
══════════════════════════════════════════════ */
function extraerEstado(raw) {
  if (!raw) return null;
  // Formato nuevo: { statuses: { message } }
  if (raw.statuses) {
    var st = raw.statuses;
    return st.message || st.estado || st.status || st.descripcion || null;
  }
  var d = raw.data || raw.result || raw.tracking || raw;
  return d.estado || d.status || d.estado_actual || d.message || d.msg || null;
}

function extraerHistorial(raw) {
  if (!raw) return [];
  var d = raw.data || raw.result || raw.tracking || raw;
  var hist = d.historial || d.history || d.estados || d.events || d.movimientos || [];
  return hist.map(function(e) {
    return {
      estado: e.estado  || e.status || e.descripcion || e.event   || e.movimiento || '',
      fecha:  e.fecha   || e.date   || e.datetime    || e.hora    || e.fecha_hora  || '',
      lugar:  e.lugar   || e.location || e.ciudad    || e.oficina || '',
    };
  });
}

function extraerOrigen(raw) {
  if (!raw) return '';
  var d = raw.data || raw.result || raw.tracking || raw;
  return d.origen || d.ciudad_origen || d.from || d.origen_ciudad || '';
}

function extraerDestino(raw) {
  if (!raw) return '';
  var d = raw.data || raw.result || raw.tracking || raw;
  return d.destino || d.ciudad_destino || d.to || d.destino_ciudad || '';
}

function extraerUltimoMovimiento(raw) {
  var hist = extraerHistorial(raw);
  if (!hist.length) return null;
  return hist[hist.length - 1];
}

/* ══════════════════════════════════════════════
   DETECCIÓN AUTOMÁTICA DE ESTADO
══════════════════════════════════════════════ */
function detectarEstadoAuto(estadoTexto) {
  if (!estadoTexto) return null;
  var t = estadoTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for (var i = 0; i < TRK.KEYWORDS_ENTREGADO.length; i++) {
    if (t.includes(TRK.KEYWORDS_ENTREGADO[i])) return 'FINALIZADO';
  }
  for (var j = 0; j < TRK.KEYWORDS_DESTINO.length; j++) {
    if (t.includes(TRK.KEYWORDS_DESTINO[j])) return 'EN_DESTINO';
  }
  return null;
}

/* ══════════════════════════════════════════════
   APLICAR RESULTADO AL SHIPMENT
══════════════════════════════════════════════ */
function aplicarResultado(ship, raw, source) {
  var now = new Date().toISOString();

  if (!raw || raw.error) {
    if (!ship.trackingHistory) ship.trackingHistory = [];
    ship.trackingHistory.push({
      date:    now,
      status:  'ERROR',
      message: (raw && raw.message) ? raw.message : 'No se pudo consultar. Verifica número y código.',
      source:  source || 'manual'
    });
    ship.trackingLastAutoCheck = Date.now();
    return 'error';
  }

  // ★ Formato nuevo { search:{}, statuses:{} } o formato antiguo
  var estadoTexto, historial, origen, destino;
  if (raw.statuses) {
    var st = raw.statuses;
    estadoTexto = st.message || st.estado || st.status || st.descripcion || '—';
    origen  = (raw.search && (raw.search.origen  || raw.search.ciudad_origen))  || st.origen  || '';
    destino = (raw.search && (raw.search.destino || raw.search.ciudad_destino)) || st.destino || '';
    var histRaw = st.historial || st.history || st.estados || st.movimientos || [];
    if (!Array.isArray(histRaw) && histRaw && typeof histRaw === 'object') histRaw = Object.values(histRaw);
    historial = (Array.isArray(histRaw) ? histRaw : []).map(function(e){
      return { estado: e.estado||e.status||e.descripcion||String(e), fecha: e.fecha||e.date||'', lugar: e.lugar||e.ciudad||'' };
    });
    if (!historial.length && estadoTexto && estadoTexto !== '—') {
      historial = [{ estado: estadoTexto, fecha: new Date().toISOString(), lugar: destino }];
    }
  } else {
    estadoTexto = extraerEstado(raw);
    historial   = extraerHistorial(raw);
    origen      = extraerOrigen(raw);
    destino     = extraerDestino(raw);
  }
  var ultimoMov  = historial.length ? historial[historial.length-1] : null;
  var autoEstado = detectarEstadoAuto(estadoTexto);
  var guiaOk = !!(ship.trackingOrderNumber || ship.shalomGuia);

  // ★ Detectar si el estado Shalom es idéntico al de la última consulta.
  // En auto-check, si nada cambió, NO tocamos campos ni historial: así no se
  // genera un "cambio" que dispare save() y recargas en cadena entre dispositivos.
  var nuevoTexto   = estadoTexto || '—';
  var mismoEstado  = (ship.trackingStatus === nuevoTexto);
  var esAuto       = (source === 'auto');

  if (esAuto && mismoEstado) {
    // Solo marcar la hora del último chequeo (interno, no afecta la tarjeta).
    ship.trackingLastAutoCheck = Date.now();
    return 'sin-cambio'; // ← el auto-check sabrá que este pedido no necesita guardado
  }

  // Actualizar campos del shipment
  ship.trackingStatus        = estadoTexto || '—';
  ship.trackingMessage       = estadoTexto || '—';
  ship.trackingLastUpdate    = now;
  ship.trackingLastAutoCheck = Date.now();
  ship.trackingOrigen        = origen;
  ship.trackingDestino       = destino;
  ship.trackingUltimoMov     = ultimoMov;

  // Guardar historial Shalom completo
  if (historial.length) ship.trackingHistorialShalom = historial;

  // Agregar entrada al log de consultas
  if (!ship.trackingHistory) ship.trackingHistory = [];
  ship.trackingHistory.push({
    date:    now,
    status:  estadoTexto || '—',
    message: estadoTexto || '—',
    source:  source || 'manual'
  });

  // ★ Automatizaciones de estado — solo para courier SHALOM
  var isShalom = ship.courier && ship.courier.toUpperCase().includes('SHALOM');
  if (isShalom) {
    if (autoEstado === 'FINALIZADO' && ship.status !== 'FINALIZADO') {
      ship.status = 'FINALIZADO';
      return 'FINALIZADO';
    }
    if (autoEstado === 'EN_DESTINO') {
      // Si tiene saldo pendiente → PENDIENTE DE PAGO, sino → LLEGÓ A DESTINO
      if (ship.cost && parseFloat(ship.cost) > 0 && ship.status !== 'PENDIENTE DE PAGO') {
        ship.status = 'PENDIENTE DE PAGO';
        _mostrarAlertaDestino(ship);
        return 'PENDIENTE DE PAGO';
      } else if (ship.status !== 'LLEGÓ A DESTINO' && ship.status !== 'PENDIENTE DE PAGO' && ship.status !== 'FINALIZADO') {
        ship.status = 'LLEGÓ A DESTINO';
        _mostrarAlertaDestino(ship);
        return 'EN_DESTINO';
      }
    }
    // Si estaba en NUEVO PEDIDO/EN PROCESO y tiene guía → ENVIADO
    if (autoEstado === null && guiaOk &&
        (ship.status === 'NUEVO PEDIDO' || ship.status === 'EN PROCESO' || ship.status === 'POR ALISTAR' || ship.status === 'ALISTADO')) {
      ship.status = 'ENVIADO';
      return 'ENVIADO';
    }
  } else {
    // Para otros couriers solo FINALIZADO automático
    if (autoEstado === 'FINALIZADO' && ship.status !== 'FINALIZADO') {
      ship.status = 'FINALIZADO';
      return 'FINALIZADO';
    }
  }
  // Guardar subtítulo informativo para el cliente
  var subtitulo = detectarSubtituloCliente(estadoTexto);
  if (subtitulo) {
    ship.trackingSubtituloCliente = subtitulo;
  } else if (autoEstado === 'EN_DESTINO') {
    ship.trackingSubtituloCliente = 'destino';
  } else if (autoEstado === 'FINALIZADO') {
    ship.trackingSubtituloCliente = 'entregado';
  }

  return 'ok';
}

/* ══════════════════════════════════════════════
   TRACKING AUTOMÁTICO (al abrir el panel)
══════════════════════════════════════════════ */
var _autoRunning = false;
var _autoFailCount = 0;   // ciclos consecutivos sin ningún OK
var _autoPaused   = false; // pausa tras 3 fallos

async function autoTrackingCheck() {
  if (_autoRunning) return;

  // Gate: si el usuario apagó el auto-tracking en Config, no consultar solo.
  // (El botón "Consultar" por tarjeta y el tracking masivo manual siguen funcionando.)
  if (window.S && window.S.config && window.S.config.shalomAutoTrack === false) return;

  // Pausado tras 3 fallos — esperar consulta manual exitosa
  if (_autoPaused) {
    console.log('[Tracking] Auto-check pausado — API caída. Consulta manualmente para reactivar.');
    return;
  }

  var _ships = _getShipments();
  if (!_ships) { _autoRunning = false; return; }
  _autoRunning = true;

  var ahora = Date.now();
  var pendientes = _ships.filter(function(s) {
    if (!s.trackingOrderNumber && !s.shalomGuia) return false;
    if (s.status === 'FINALIZADO') return false;
    var ultima = s.trackingLastAutoCheck || 0;
    var diff = ahora - ultima;
    var intervalo = (s.status === 'LLEGÓ A DESTINO' || s.status === 'PENDIENTE DE PAGO')
      ? TRK.AUTO_INTERVAL_DESTINO_MS   // llegó a destino → cada 24h
      : TRK.AUTO_INTERVAL_MS;          // en tránsito → cada 12h
    return diff >= intervalo;
  });

  if (!pendientes.length) { _autoRunning = false; return; }
  console.log('[Tracking] Auto-check:', pendientes.length, 'pedidos');

  var okCount  = 0;
  var errCount = 0;
  var changedCount = 0; // ★ cuántos pedidos cambiaron de verdad en este ciclo

  for (var i = 0; i < pendientes.length; i++) {
    var ship = pendientes[i];
    var guia   = ship.trackingOrderNumber || ship.shalomGuia   || '';
    var codigo = ship.trackingOrderCode   || ship.shalomCodigo || '';
    try {
      var raw      = await consultarShalom(guia, codigo);
      var resultado = aplicarResultado(ship, raw, 'auto');
      if (resultado === 'error') {
        errCount++;
      } else {
        okCount++;
        if (resultado !== 'sin-cambio') changedCount++; // ★ hubo cambio real
        if (resultado === 'EN_DESTINO') _mostrarAlertaDestino(ship);
      }
    } catch(e) {
      errCount++;
      console.warn('[Tracking] Auto-check error:', e);
    }
    await new Promise(function(r){ setTimeout(r, 600); });
  }

  // Sin ningún OK en este ciclo → acumular fallo
  if (okCount === 0 && errCount > 0) {
    _autoFailCount++;
    console.warn('[Tracking] Ciclo fallido #' + _autoFailCount + ' (0 OK de ' + errCount + ')');
    if (_autoFailCount >= 3) {
      _autoPaused = true;
      console.warn('[Tracking] Auto-check PAUSADO tras 3 ciclos fallidos.');
      if (typeof window.toast === 'function') {
        window.toast('⚠️ Tracking auto pausado — API Shalom sin respuesta');
      }
    }
  } else if (okCount > 0) {
    // Al menos 1 OK → resetear
    _autoFailCount = 0;
    _autoPaused    = false;
    console.log('[Tracking] Auto-check OK (' + okCount + ' respuestas, ' + changedCount + ' con cambios)');
  }

  // ★ Solo guardar (y subir ts → disparar recargas) si algún pedido cambió de verdad.
  // Si ningún pedido cambió, NO guardamos: así no se genera el rebote de lecturas
  // entre dispositivos que disparaba millones de lecturas/día.
  if (changedCount > 0) {
    if (typeof window.save === 'function') window.save();
  }
  if (typeof window.render === 'function') window.render();
  _autoRunning = false;
}

/* ══════════════════════════════════════════════
   ALERTA DE DESTINO
══════════════════════════════════════════════ */
function _mostrarAlertaDestino(ship) {
  var div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);'+
    'background:#1c2333;border:2px solid #a78bfa;border-radius:12px;'+
    'padding:14px 18px;z-index:999;max-width:340px;width:calc(100% - 32px);'+
    'box-shadow:0 8px 24px rgba(0,0,0,.6)';
  div.innerHTML = '<div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:6px">📍 PEDIDO LLEGÓ A DESTINO</div>'+
    '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px"><b>'+_esc(ship.name)+'</b></div>'+
    '<div style="font-size:11px;color:#8b949e;margin-bottom:10px">Guía: '+_esc(ship.trackingOrderNumber||'')+'</div>'+
    '<div style="display:flex;gap:8px">'+
    '<button onclick="this.closest(\'div[style]\').remove()" style="flex:1;background:#30363d;border:none;border-radius:8px;color:#8b949e;padding:8px;font-size:12px;cursor:pointer;font-family:inherit">Cerrar</button>'+
    '<button onclick="window.open(\'https://wa.me/51'+_esc(ship.phone)+'\',\'_blank\');this.closest(\'div[style]\').remove()" style="flex:2;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);border-radius:8px;color:#a78bfa;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">💬 Avisar cliente</button>'+
    '</div>';
  document.body.appendChild(div);
  setTimeout(function(){ if(div.parentNode) div.remove(); }, 15000);
}

/* ══════════════════════════════════════════════
   CSS
══════════════════════════════════════════════ */
function _injectCSS() {
  if (document.getElementById('trkCSS')) return;
  var s = document.createElement('style');
  s.id = 'trkCSS';
  s.textContent = [
    '.trk-block{background:rgba(56,139,253,.05);border:1px solid rgba(56,139,253,.18);border-radius:10px;padding:11px 12px;margin-top:8px}',
    '.trk-title{font-size:10px;font-weight:800;color:#388bfd;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between}',
    '.trk-btns{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}',
    '.trk-btn{padding:7px 12px;border-radius:7px;border:none;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;transition:opacity .15s}',
    '.trk-btn:active{opacity:.7}',
    '.trk-btn-save{background:linear-gradient(135deg,#388bfd,#1a5fbf);color:#fff}',
    '.trk-btn-consult{background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd}',
    '.trk-btn-hist{background:rgba(107,114,128,.12);border:1px solid rgba(107,114,128,.3);color:#8b949e}',
    '.trk-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:14px;font-size:11px;font-weight:700;border:1px solid;margin-top:5px}',
    '.trk-chip-ok  {background:rgba(34,197,94,.1); border-color:rgba(34,197,94,.3); color:#22c55e}',
    '.trk-chip-dest{background:rgba(167,139,250,.1);border-color:rgba(167,139,250,.3);color:#a78bfa}',
    '.trk-chip-mov {background:rgba(56,139,253,.1); border-color:rgba(56,139,253,.3); color:#388bfd}',
    '.trk-chip-pend{background:rgba(107,114,128,.1);border-color:rgba(107,114,128,.3);color:#8b949e}',
    '.trk-chip-err {background:rgba(248,113,113,.1);border-color:rgba(248,113,113,.3);color:#f87171}',
    '.trk-spin-inline{display:inline-block;width:12px;height:12px;border:2px solid #30363d;border-top-color:#388bfd;border-radius:50%;animation:trkSpin .7s linear infinite;vertical-align:middle;margin-right:5px}',
    '@keyframes trkSpin{to{transform:rotate(360deg)}}',
    // overlay historial
    '#trkHistOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;align-items:flex-end;justify-content:center}',
    '#trkHistOv.open{display:flex}',
    '#trkHistSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:trkUp .22s ease;max-height:88vh;overflow-y:auto}',
    '@keyframes trkUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '.trk-hist-row{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-hist-row:last-child{border-bottom:none}',
    '.trk-hist-dot{width:7px;height:7px;border-radius:50%;background:#388bfd;flex-shrink:0;margin-top:5px}',
    // overlay manual
    '#trkManualOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;align-items:flex-end;justify-content:center}',
    '#trkManualOv.open{display:flex}',
    '#trkManualSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:trkUp .22s ease;max-height:88vh;overflow-y:auto}',
    '.trk-manual-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-manual-step:last-child{border-bottom:none}',
    '.trk-manual-num{width:22px;height:22px;border-radius:50%;background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
  ].join('');
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════
   OVERLAYS
══════════════════════════════════════════════ */
function _injectOverlays() {
  if (document.getElementById('trkHistOv')) return;

  var ov1 = document.createElement('div');
  ov1.id = 'trkHistOv';
  ov1.innerHTML = '<div id="trkHistSheet"><div id="trkHistContent"></div>'+
    '<button onclick="document.getElementById(\'trkHistOv\').classList.remove(\'open\')" '+
    'style="width:100%;margin-top:12px;padding:11px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button></div>';
  ov1.addEventListener('click',function(e){if(e.target===ov1)ov1.classList.remove('open');});
  document.body.appendChild(ov1);

  var ov2 = document.createElement('div');
  ov2.id = 'trkManualOv';
  var pasos = [
    'El cliente elige agencia Shalom en el formulario.',
    'El pedido llega al panel como <b>NUEVO PEDIDO</b>.',
    'Edita el pedido y coloca número de orden y código.',
    'Guarda tracking → el pedido pasa automáticamente a <b>ENVIADO</b>.',
    'Presiona <b>⟳ Consultar</b> en cualquier momento para actualizar al instante.',
    'El sistema consulta Shalom automáticamente cada <b>12 horas</b> (en tránsito) y cada <b>24 horas</b> al llegar a destino. Al entregarse deja de consultar.',
    'Shalom dice "En tránsito" → etiqueta <b>ENVIADO</b> + cliente ve subtítulo informativo.',
    'Shalom dice "Demora" → etiqueta <b>ENVIADO</b> + cliente ve aviso de demora.',
    'Shalom dice "En destino" → cambia automáticamente a <b>LLEGÓ A DESTINO</b> (cada 2h revisa).',
    'Si el pedido tiene saldo pendiente → cambia a <b>PENDIENTE DE PAGO</b>.',
    'Shalom dice "Entregado" → cambia automáticamente a <b>FINALIZADO</b>.',
  ];
  ov2.innerHTML = '<div id="trkManualSheet">'+
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin-bottom:14px">📖 Manual Shalom</div>'+
    pasos.map(function(p,i){
      return '<div class="trk-manual-step"><div class="trk-manual-num">'+(i+1)+'</div>'+
        '<div style="font-size:13px;color:#e6edf3;line-height:1.5">'+p+'</div></div>';
    }).join('')+
    '<button onclick="document.getElementById(\'trkManualOv\').classList.remove(\'open\')" '+
    'style="width:100%;margin-top:14px;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button></div>';
  ov2.addEventListener('click',function(e){if(e.target===ov2)ov2.classList.remove('open');});
  document.body.appendChild(ov2);
}

/* ══════════════════════════════════════════════
   CHIP DE ESTADO
══════════════════════════════════════════════ */
function _estadoChip(ship) {
  var st = ship.trackingStatus;
  if (!st || st === '—') {
    return '<div style="font-size:11px;color:#8b949e;margin-top:4px;padding:4px 0">Sin consultas aún — presiona Consultar</div>';
  }
  var u = st.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var cls, ico;
  if (ship.status === 'FINALIZADO' || u.includes('ENTREGADO')) { cls='trk-chip-ok';   ico='✅'; }
  else if (u.includes('AGENCIA') || u.includes('DESTINO'))     { cls='trk-chip-dest'; ico='🏢'; }
  else if (u.includes('TRANSITO')|| u.includes('CAMINO'))      { cls='trk-chip-mov';  ico='🚌'; }
  else if (u.includes('ERROR')   || u.includes('NO SE'))       { cls='trk-chip-err';  ico='⚠'; }
  else                                                           { cls='trk-chip-pend'; ico='📦'; }

  var last = ship.trackingLastUpdate
    ? new Date(ship.trackingLastUpdate).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
    : '';

  return '<div class="trk-chip '+cls+'" onclick="Tracking.verHistorial(\''+_esc(ship.id)+'\')">'+
    ico+' '+_esc(st)+
    (last?'<span style="opacity:.5;font-size:9px;margin-left:4px">'+last+'</span>':'')+
    ' <span style="opacity:.4;font-size:9px">↗</span></div>';
}

/* ══════════════════════════════════════════════
   API PÚBLICA: Tracking
══════════════════════════════════════════════ */
var Tracking = {};

/* ── Helper: obtener shipments desde cualquier fuente ─────────────── */
function _getShipments() {
  // 1. window.S (expuesto por index.html)
  if (window.S && window.S.shipments && window.S.shipments.length) return window.S.shipments;
  // 2. S como variable global (let S en index.html)
  try { if (typeof S !== 'undefined' && S && S.shipments && S.shipments.length) return S.shipments; } catch(e){}
  // 3. Buscar en todas las variables globales
  for (var key in window) {
    try {
      var v = window[key];
      if (v && typeof v === 'object' && Array.isArray(v.shipments) && v.shipments.length > 0) {
        console.log('[Tracking] Shipments encontrados en window.' + key);
        return v.shipments;
      }
    } catch(e) {}
  }
  console.warn('[Tracking] No se encontraron shipments en ninguna variable global');
  return null;
}

function _findShip(shipId) {
  var list = _getShipments();
  if (!list) {
    console.warn('[Tracking] No se pudo obtener lista de shipments');
    return null;
  }
  console.log('[Tracking] Buscando ID:', shipId, '| Disponibles:', list.map(function(s){ return s.id; }));
  // Búsqueda exacta primero
  var found = list.find(function(x){ return String(x.id) === String(shipId); });
  if (found) return found;
  // Fallback: buscar por trackingOrderNumber
  found = list.find(function(x){ return x.trackingOrderNumber && x.trackingOrderNumber === shipId; });
  if (found) { console.log('[Tracking] Encontrado por trackingOrderNumber'); return found; }
  // Fallback: buscar por shalomGuia
  found = list.find(function(x){ return x.shalomGuia && x.shalomGuia === shipId; });
  if (found) { console.log('[Tracking] Encontrado por shalomGuia'); return found; }
  console.warn('[Tracking] Pedido no encontrado con ID:', shipId);
  return null;
}

/* ── renderCardBlock ─────────────────────────────────────────────── */
Tracking.renderCardBlock = function(s) {
  // ★ FIX img 404: limpiar referencias a imágenes inválidas
  if (s.docGuia && typeof s.docGuia === 'string' && s.docGuia === '[img]') s.docGuia = null;
  if (s.docTicket && typeof s.docTicket === 'string' && s.docTicket === '[img]') s.docTicket = null;
  var guia   = s.trackingOrderNumber || s.shalomGuia   || '';
  var codigo = s.trackingOrderCode   || s.shalomCodigo || '';
  if (!guia && !s.trackingStatus) return '';

  return '<div class="trk-block">'+
    '<div class="trk-title">'+
    '<span>📦 Tracking Shalom</span>'+
    '<button onclick="Tracking.abrirManual()" style="background:none;border:none;color:#8b949e;font-size:10px;cursor:pointer;padding:0" title="Instrucciones">📖 Ayuda</button>'+
    '</div>'+
    (guia?'<div style="font-size:11px;color:#8b949e;margin-bottom:4px">'+
    '🔢 Orden: <b style="color:#e6edf3;font-family:monospace">'+_esc(guia)+'</b>'+
    (codigo?' · <b style="color:#e6edf3;font-family:monospace">'+_esc(codigo)+'</b>':'')+
    '</div>':'<div style="font-size:11px;color:#8b949e;margin-bottom:4px">Sin número de orden</div>')+
    _estadoChip(s)+
    '<div class="trk-btns">'+
    '<button class="trk-btn trk-btn-save" onclick="Tracking.abrirEdicion(\''+_esc(s.id)+'\')">✏️ Editar</button>'+
    '<button class="trk-btn trk-btn-consult" id="btn-consult-'+_esc(s.id)+'" onclick="Tracking.consultarAhora(\''+_esc(s.id)+'\')">⟳ Consultar</button>'+
    (s.trackingHistory&&s.trackingHistory.length?'<button class="trk-btn trk-btn-hist" onclick="Tracking.verHistorial(\''+_esc(s.id)+'\')">📋 Historial</button>':'')+
    '</div>'+
    '</div>';
};

/* ── abrirEdicion ────────────────────────────────────────────────── */
Tracking.abrirEdicion = function(shipId) {
  var ship = _findShip(shipId);
  if (!ship) return;
  var ov = document.getElementById('delOverlay');
  if (!ov) return;
  var sheet = ov.querySelector('.sheet');
  sheet.innerHTML = [
    '<div class="sheet-handle"></div>',
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:17px;margin-bottom:14px">📦 Tracking Shalom</div>',
    '<div style="font-size:11px;color:#8b949e;margin-bottom:12px">'+_esc(ship.name)+'</div>',
    '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">',
    '<div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">NÚMERO DE ORDEN</label>',
    '<input id="trkOrdNum" class="fi" placeholder="Ej: 82037653" style="font-family:monospace" inputmode="numeric" value="'+_esc(ship.trackingOrderNumber||ship.shalomGuia||'')+'"></div>',
    '<div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">CÓDIGO</label>',
    '<input id="trkOrdCode" class="fi" placeholder="Ej: TT9C" style="font-family:monospace;text-transform:uppercase" oninput="this.value=this.value.toUpperCase()" maxlength="8" value="'+_esc(ship.trackingOrderCode||ship.shalomCodigo||'')+'"></div>',
    '<div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">AGENCIA DESTINO (opcional)</label>',
    '<input id="trkAgencia" class="fi" placeholder="Ej: Agencia Lima Norte" value="'+_esc(ship.shippingAgency||ship.agencia_nombre||'')+'"></div>',
    '</div>',
    '<div style="display:flex;gap:8px">',
    '<button onclick="document.getElementById(\'delOverlay\').classList.remove(\'open\')" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>',
    '<button onclick="Tracking._guardarEdicion(\''+_esc(shipId)+'\')" style="flex:2;padding:12px;background:linear-gradient(135deg,#388bfd,#1a5fbf);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">💾 Guardar tracking</button>',
    '</div>',
  ].join('');
  ov.classList.add('open');
};

/* ── _guardarEdicion ─────────────────────────────────────────────── */
Tracking._guardarEdicion = function(shipId) {
  var ship = _findShip(shipId);
  if (!ship) return;
  var num    = (document.getElementById('trkOrdNum')  ||{}).value||'';
  var code   = (document.getElementById('trkOrdCode') ||{}).value||'';
  var agencia= (document.getElementById('trkAgencia') ||{}).value||'';
  num = num.trim(); code = code.trim(); agencia = agencia.trim();
  if (!num) { if(typeof window.toast==='function') window.toast('⚠️ Ingresa el número de orden'); return; }

  var guiaAnterior = ship.trackingOrderNumber || ship.shalomGuia || '';
  ship.trackingOrderNumber = num;
  ship.trackingOrderCode   = code;
  ship.shalomGuia          = num;
  ship.shalomCodigo        = code;
  if (agencia) { ship.shippingAgency = agencia; ship.agencia_nombre = agencia; }
  ship.shippingCourier = 'Shalom';

  // Si cambió la guía, resetear estado
  if (guiaAnterior && guiaAnterior !== num) {
    ship.trackingStatus    = '';
    ship.trackingMessage   = '';
    ship.trackingLastUpdate= '';
    ship.shalomEstado      = '';
  }

  // Cambiar a ENVIADO automáticamente
  if (ship.status !== 'ENVIADO' && ship.status !== 'FINALIZADO') {
    ship.status = 'ENVIADO';
  }

  if (typeof window.save   === 'function') window.save(ship.id);
  // ★ Subida INMEDIATA: al poner la guía y pasar a ENVIADO, sube al instante.
  if (typeof window._fbSaveShipmentNow === 'function') window._fbSaveShipmentNow(ship);
  if (typeof window.render === 'function') window.render();
  document.getElementById('delOverlay').classList.remove('open');
  if (typeof window.toast  === 'function') window.toast('✅ Tracking guardado');
};

/* ── consultarAhora vía MOTOR B (tu servidor) ────────────────────────
   Reusa la Cloud Function syncShalomWebTest (1 pedido, autenticada) que ya
   consulta el worker propio y escribe en Firestore. Aplica los cambios
   devueltos al pedido local y refresca la tarjeta. No toca la API paga. */
async function _consultarMotorB(ship, shipId) {
  var btn = document.getElementById('btn-consult-'+shipId);
  if (btn) { btn.innerHTML = '<span class="trk-spin-inline"></span> Consultando...'; btn.disabled = true; }
  if (typeof window.toast === 'function') window.toast('⏳ Consultando tu servidor...');
  try {
    var tok = '';
    try {
      if (typeof window._authEnsureToken === 'function') await window._authEnsureToken();
      tok = localStorage.getItem('tt_id_token') || '';
    } catch(e){}
    var url = 'https://us-central1-total-tools-24ce8.cloudfunctions.net/syncShalomWebTest?pedidoId=' + encodeURIComponent(shipId);
    var r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok } });
    var data = await r.json();
    if (data && data.ok && data.cambios) {
      Object.keys(data.cambios).forEach(function(k){ ship[k] = data.cambios[k]; });
      // ★ Robustez: refrescar SIEMPRE la pantalla con el estado fresco que leyó
      // el worker, aunque el backend ya coincidiera (en ese caso 'cambios' no
      // trae trackingStatus por la guarda "no reescribir si no cambió", y la
      // tarjeta local podría quedar con un valor viejo). Solo actualiza el
      // display; no escribe en Firestore.
      var msg = data.resultadoWorker && data.resultadoWorker.statuses && data.resultadoWorker.statuses.message;
      if (msg) { ship.trackingStatus = msg; ship.trackingMessage = msg; }
      if (typeof window.render === 'function') window.render();
      if (typeof window.toast === 'function') window.toast('🔄 Estado: ' + (ship.trackingStatus || '—'));
    } else {
      if (typeof window.toast === 'function') window.toast('⚠️ ' + ((data && data.motivo) || 'No se pudo consultar tu servidor'));
      if (btn) { btn.innerHTML = '⟳ Consultar'; btn.disabled = false; }
    }
  } catch (e) {
    if (typeof window.toast === 'function') window.toast('⚠️ Error de red al consultar tu servidor');
    if (btn) { btn.innerHTML = '⟳ Consultar'; btn.disabled = false; }
  }
}

/* ── consultarAhora ──────────────────────────────────────────────── */
Tracking.consultarAhora = async function(shipId) {
  var ship = _findShip(shipId);
  console.log('[Tracking] CLICK CONSULTAR | ID recibido:', shipId);
  console.log('[Tracking] Shipments disponibles:', (_getShipments()||[]).map(function(s){ return s.id+'|'+s.name; }));

  if (!ship) {
    console.warn('[Tracking] Pedido no encontrado con ID:', shipId);
    if (typeof window.toast === 'function') window.toast('⚠️ Error: pedido no encontrado');
    return;
  }
  console.log('[Tracking] Pedido encontrado:', ship.name, '| Guía:', ship.trackingOrderNumber||ship.shalomGuia||'SIN GUÍA');

  // Leer guía desde cualquier campo disponible
  var guia   = ship.trackingOrderNumber || ship.shalomGuia   || '';
  var codigo = ship.trackingOrderCode   || ship.shalomCodigo || '';

  if (!guia) {
    if (typeof window.toast === 'function') window.toast('⚠️ Primero guarda el número de orden');
    return;
  }

  // Rutear al MOTOR ELEGIDO: si es "web" (tu servidor), va por Motor B; si no
  // ('api' u otro), sigue el camino de siempre (Motor A / API paga, intacto).
  var motor = (window.S && window.S.config && window.S.config.trackingMotor) || '';
  if (motor === 'web') { await _consultarMotorB(ship, shipId); return; }

  // Mostrar spinner en el botón
  var btn = document.getElementById('btn-consult-'+shipId);
  if (btn) { btn.innerHTML = '<span class="trk-spin-inline"></span> Consultando...'; btn.disabled = true; }
  if (typeof window.toast === 'function') window.toast('⏳ Consultando Shalom...');

  var raw      = await consultarShalom(guia, codigo);
  var resultado = aplicarResultado(ship, raw, 'manual');

  // Reactivar auto-tracking si estaba pausado y consulta manual fue exitosa
  if (resultado !== 'error' && _autoPaused) {
    _autoPaused    = false;
    _autoFailCount = 0;
    console.log('[Tracking] Auto-check reactivado tras consulta manual exitosa.');
    if (typeof window.toast === 'function') window.toast('✅ Tracking auto reactivado');
  }

  if (typeof window.save   === 'function') window.save(ship.id);
  // ★ Subida INMEDIATA a Firebase (no esperar los 800ms del debounce).
  // Resuelve el caso: consultar y recargar rápido perdía el cambio porque
  // el guardado de 800ms se cancelaba al recargar. Ahora sube al instante.
  // El merge (corregido, solo _dirtyShips) ya evita que esto bloquee otros dispositivos.
  if (typeof window._fbSaveShipmentNow === 'function') window._fbSaveShipmentNow(ship);
  if (typeof window.render === 'function') window.render();

  if (resultado === 'error') {
    if (typeof window.toast === 'function') window.toast('⚠️ No se pudo consultar. Verifica número y código.');
  } else if (resultado === 'FINALIZADO') {
    if (typeof window.toast === 'function') window.toast('✅ FINALIZADO — Shalom confirma entrega');
  } else if (resultado === 'EN_DESTINO') {
    if (typeof window.toast === 'function') window.toast('📍 Pedido llegó a destino — avisar al cliente');
    _mostrarAlertaDestino(ship);
  } else {
    if (typeof window.toast === 'function') window.toast('🔄 Estado: ' + (ship.trackingStatus || '—'));
  }
};

/* ── Tracking MASIVO manual (botón 🔄 con selección) ──────────────
   Consulta Shalom SOLO de los pedidos pasados, una vez por cliente, con
   cooldown de 30 min. Comparte el mismo trackingLastAutoCheck que el auto
   y el "Consultar", así no re-consulta lo recién consultado (ahorra API).
   Reutiliza el mismo motor (consultarShalom + aplicarResultado). No toca
   el botón "Consultar" por tarjeta. */
Tracking.bulkTrack = async function(ids) {
  var COOLDOWN = 30 * 60 * 1000; // 30 min
  var ahora = Date.now();
  var ships = (ids || []).map(_findShip).filter(Boolean);
  var toTrack = [], recientes = 0, sinNum = 0;
  ships.forEach(function(s){
    var isShalom = s.courier && String(s.courier).toUpperCase().indexOf('SHALOM') >= 0;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    if (!isShalom) return;                 // solo Shalom
    if (s.status === 'FINALIZADO') return; // ya entregado
    if (!guia) { sinNum++; return; }
    if (ahora - (s.trackingLastAutoCheck || 0) < COOLDOWN) { recientes++; return; }
    toTrack.push(s);
  });
  if (!toTrack.length) {
    var m0 = 'Nada nuevo para trackear';
    if (recientes) m0 += ' · ' + recientes + ' ya consultado' + (recientes!==1?'s':'') + ' hace poco';
    if (sinNum) m0 += ' · ' + sinNum + ' sin número';
    if (window.toast) window.toast(m0);
    return;
  }
  if (window.toast) window.toast('⏳ Trackeando ' + toTrack.length + ' Shalom...');
  var ok = 0, err = 0;
  for (var i = 0; i < toTrack.length; i++) {
    var s = toTrack[i];
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    var codigo = s.trackingOrderCode || s.shalomCodigo || '';
    try {
      var raw = await consultarShalom(guia, codigo);
      var res = aplicarResultado(s, raw, 'auto');
      if (res === 'error') { err++; }
      else {
        ok++;
        if (window.save) window.save(s.id);
        if (window._fbSaveShipmentNow) window._fbSaveShipmentNow(s);
      }
    } catch (e) { err++; }
    await new Promise(function(r){ setTimeout(r, 600); }); // respiro entre consultas
  }
  if (window.render) window.render();
  var msg = '✅ ' + ok + ' trackeado' + (ok!==1?'s':'');
  if (recientes) msg += ' · ' + recientes + ' ya consultado' + (recientes!==1?'s':'');
  if (sinNum) msg += ' · ' + sinNum + ' sin número';
  if (err) msg += ' · ' + err + ' error' + (err!==1?'es':'');
  if (window.toast) window.toast(msg);
};

/* ── verHistorial ────────────────────────────────────────────────── */
Tracking.verHistorial = function(shipId) {
  var ship = _findShip(shipId);
  var ov   = document.getElementById('trkHistOv');
  var cnt  = document.getElementById('trkHistContent');
  if (!ov||!cnt) return;

  if (!ship) { cnt.innerHTML='<div style="padding:20px;color:#8b949e;text-align:center">Pedido no encontrado</div>'; ov.classList.add('open'); return; }

  var hist  = ship.trackingHistory || [];
  var histS = ship.trackingHistorialShalom || [];

  cnt.innerHTML = [
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:4px">📋 Historial</div>',
    '<div style="font-size:12px;color:#8b949e;margin-bottom:14px">'+_esc(ship.name)+' · '+_esc(ship.trackingOrderNumber||'—')+'</div>',

    // Estado actual
    ship.trackingStatus&&ship.trackingStatus!=='—' ? [
      '<div style="background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:9px;padding:10px 12px;margin-bottom:12px">',
      '<div style="font-size:10px;font-weight:700;color:#388bfd;letter-spacing:.8px;margin-bottom:4px">ESTADO ACTUAL</div>',
      '<div style="font-size:14px;font-weight:700;color:#e6edf3">'+_esc(ship.trackingStatus)+'</div>',
      ship.trackingOrigen  ? '<div style="font-size:11px;color:#8b949e;margin-top:4px">🏙 Origen: '+_esc(ship.trackingOrigen)+'</div>' : '',
      ship.trackingDestino ? '<div style="font-size:11px;color:#8b949e">📍 Destino: '+_esc(ship.trackingDestino)+'</div>' : '',
      ship.trackingLastUpdate ? '<div style="font-size:10px;color:#8b949e;margin-top:4px">Actualizado: '+new Date(ship.trackingLastUpdate).toLocaleString('es-PE')+'</div>' : '',
      '</div>'
    ].join('') : '',

    // Historial Shalom (estados de la API)
    histS.length ? [
      '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">ESTADOS SHALOM</div>',
      '<div style="background:#1c2333;border:1px solid #30363d;border-radius:9px;padding:4px 12px;margin-bottom:12px">',
      histS.map(function(h){
        return '<div class="trk-hist-row"><div class="trk-hist-dot"></div>'+
          '<div><div style="font-size:12px;font-weight:700;color:#e6edf3">'+_esc(h.estado)+'</div>'+
          (h.fecha?'<div style="font-size:10px;color:#8b949e;margin-top:1px">'+_esc(h.fecha)+(h.lugar?' · '+_esc(h.lugar):'')+'</div>':'')+
          '</div></div>';
      }).join(''),
      '</div>'
    ].join('') : '',

    // Log de consultas
    hist.length ? [
      '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">CONSULTAS REALIZADAS</div>',
      '<div style="background:#1c2333;border:1px solid #30363d;border-radius:9px;padding:4px 12px">',
      hist.slice().reverse().map(function(h){
        var fecha = h.date ? new Date(h.date).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        var srcBadge = h.source==='auto'
          ? '<span style="background:rgba(167,139,250,.15);color:#a78bfa;border:1px solid rgba(167,139,250,.3);border-radius:6px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:5px">AUTO</span>'
          : '<span style="background:rgba(56,139,253,.15);color:#388bfd;border:1px solid rgba(56,139,253,.3);border-radius:6px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:5px">MANUAL</span>';
        return '<div class="trk-hist-row">'+
          '<div class="trk-hist-dot" style="background:'+(h.status==='ERROR'?'#f87171':'#388bfd')+'"></div>'+
          '<div><div style="font-size:12px;font-weight:600;color:#e6edf3">'+_esc(h.status||'—')+srcBadge+'</div>'+
          (fecha?'<div style="font-size:10px;color:#8b949e;margin-top:1px">'+fecha+'</div>':'')+
          '</div></div>';
      }).join(''),
      '</div>'
    ].join('') : '<div style="text-align:center;padding:16px;color:#8b949e;font-size:12px">Sin historial aún</div>',
  ].join('');

  ov.classList.add('open');
};

/* ── abrirManual ─────────────────────────────────────────────────── */
Tracking.abrirManual = function() {
  var ov = document.getElementById('trkManualOv');
  if (ov) ov.classList.add('open');
};

/* ── copiarLink ──────────────────────────────────────────────────── */
Tracking.copiarLink = function(id) {
  var base = typeof getFormLink === 'function' ? getFormLink()
    : window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/formulario.html');
  var url = base + '?seg=' + id;
  var done = function() { if (typeof toast === 'function') toast('🔗 Link de seguimiento copiado'); };
  try {
    navigator.clipboard.writeText(url).then(done).catch(function() {
      var t = document.createElement('textarea'); t.value = url;
      document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done();
    });
  } catch(e) {
    var t = document.createElement('textarea'); t.value = url;
    document.body.appendChild(t); t.select(); document.execCommand('copy'); document.body.removeChild(t); done();
  }
};

/* ── init ────────────────────────────────────────────────────────── */
Tracking.init = function() {
  _injectCSS();
  _injectOverlays();
  // Sincronizar S con window.S con reintento
  function _syncS() {
    try {
      if (typeof S !== 'undefined' && S && S.shipments) {
        window.S = S;
        console.log('[Tracking] window.S sincronizado:', S.shipments.length, 'pedidos');
        return true;
      }
    } catch(e) {}
    return false;
  }
  setTimeout(function() {
    if (!_syncS()) {
      // Si no se sincronizó, reintentar a los 5s
      setTimeout(function() {
        _syncS();
        autoTrackingCheck();
      }, 2000);
    } else {
      autoTrackingCheck();
    }
  }, 2000);
  console.log('[Tracking] Módulo listo | URL:', TRK.FIREBASE_URL);
};

global.Tracking = Tracking;
})(window);
