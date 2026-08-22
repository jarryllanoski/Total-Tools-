/**
 * tracking.js — UI de tracking Shalom en el panel
 * ================================================
 * Tarjeta de tracking, modal de edición de guía, historial, manual, y el
 * vigilante "llegó a destino" (agnóstico al motor). El rastreo en sí (consultar,
 * masivo) pasa por la PUERTA ÚNICA shalom.js, hoy desconectada — ver docs/SHALOM.md.
 * El motor viejo (API paga + worker propio) se retiró: Shalom protege su portal
 * con reCAPTCHA v3 y un servidor nunca saca nota.
 */
(function(global){
'use strict';

/* ══════════════════════════════════════════════
   CONFIGURACIÓN
══════════════════════════════════════════════ */
var TRK = {
  // Únicas palabras clave que sobreviven: las usa detectarEstadoAuto para el
  // vigilante "llegó a destino" (agnóstico al motor). El motor de rastreo vive
  // ahora en shalom.js; su lógica vieja se retiró.
  KEYWORDS_ENTREGADO: ['entregado','entrega realizada','entrega completa','recogido','recojo completado','delivered'],
  KEYWORDS_DESTINO:   ['llegó a destino','llego a destino','en agencia destino','disponible para recojo',
                       'disponible para retiro','en agencia de destino','a disposicion',
                       'en destino','en destino -','en la agencia','en destino-'],
};

/* ══════════════════════════════════════════════
   HELPER — escapar HTML
══════════════════════════════════════════════ */
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
   APLICADOR — único dueño de "qué hacer con una respuesta de Shalom"
══════════════════════════════════════════════ */
/* Modo de movimiento de etiquetas, leído de la config: off | auto | semi.
   Mismo criterio y compat que el backend. */
function _modoEtiqueta(){
  var c = window.S && window.S.config;
  var m = c && c.trackingEtiquetaModo;
  if (m === 'off' || m === 'auto' || m === 'semi') return m;
  return (c && c.trackingWebCambiaEtiqueta) ? 'auto' : 'off';
}

/* Traduce un código de motivo a un aviso en español (honesto, nunca mudo). */
function _motivoTexto(motivo){
  switch (motivo) {
    case 'DESCONECTADO':  return '🔧 Rastreo Shalom en reconstrucción';
    case 'NO_ENCONTRADO': return '⚠️ Shalom no encontró esa guía — verifica número y código';
    case 'BLOQUEADO':     return '⚠️ Shalom pidió verificación — intenta desde tu navegador';
    case 'SIN_DATO':      return '⚠️ Shalom no devolvió estado — reintenta en un momento';
    default:              return '⚠️ No se pudo consultar Shalom';
  }
}

/* Escritor atómico del tracking visible: estado + mensaje + hora + historial en
   una sola pasada. Es IMPOSIBLE dejar un estado sin su hora ni su entrada. */
function _escribirTracking(ship, estado, fecha){
  var iso = fecha || new Date().toISOString();
  if (!ship.trackingHistory) ship.trackingHistory = [];
  ship.trackingHistory.push({date: iso, status: estado, message: estado, source: 'shalom'});
  ship.trackingStatus     = estado;
  ship.trackingMessage    = estado;
  ship.trackingLastUpdate = iso;
}

/* ÚNICO lugar que aplica una respuesta de la puerta a un pedido. Lo usan el
   botón manual, el masivo y el auto-check. Devuelve:
     { cambio:true,  resultado:'FINALIZADO'|'EN_DESTINO'|'ENVIADO'|'ok', estado }
     { cambio:false, motivo }   ← sin dato real: NO toca el pedido (nunca finge)
   Mueve la etiqueta respetando el modo (off/semi/auto) y sin retroceder jamás. */
function _aplicarEstadoShalom(ship, resp){
  ship.trackingLastAutoCheck = Date.now();
  if (!resp || !resp.ok) return {cambio: false, motivo: (resp && resp.motivo) || 'SIN_DATO'};

  // El estado semántico viene de la barra de pasos (más robusto) o, si no, del
  // texto. pasos: 0 origen · 1 tránsito · 2 destino · 3 entregado.
  var autoEstado;
  if (typeof resp.pasos === 'number') {
    autoEstado = resp.pasos >= 3 ? 'FINALIZADO' : (resp.pasos === 2 ? 'EN_DESTINO' : null);
  } else {
    autoEstado = detectarEstadoAuto(resp.estado || '');
  }

  var estadoTexto = (resp.estado || '').trim();
  if (!estadoTexto && autoEstado == null) {
    return {cambio: false, motivo: 'SIN_DATO'}; // ni texto ni barra → no inventamos
  }

  // 1) Tracking visible: se escribe siempre que el texto cambie.
  if (estadoTexto && ship.trackingStatus !== estadoTexto) {
    _escribirTracking(ship, estadoTexto, resp.fecha);
  }

  // 2) Etiqueta interna: según el MODO, y SOLO hacia adelante (nunca retrocede).
  var modo = _modoEtiqueta();
  var resultado = 'ok';
  var isShalom = ship.courier && ship.courier.toUpperCase().includes('SHALOM');
  if (isShalom && modo !== 'off') {
    if (autoEstado === 'FINALIZADO') {
      if (modo !== 'semi' && ship.status !== 'FINALIZADO') ship.status = 'FINALIZADO';
      resultado = 'FINALIZADO';
    } else if (autoEstado === 'EN_DESTINO') {
      var conSaldo = ship.cost && parseFloat(ship.cost) > 0;
      if (conSaldo && ['PENDIENTE DE PAGO','FINALIZADO'].indexOf(ship.status) < 0) {
        ship.status = 'PENDIENTE DE PAGO'; resultado = 'EN_DESTINO';
      } else if (['LLEGÓ A DESTINO','PENDIENTE DE PAGO','FINALIZADO'].indexOf(ship.status) < 0) {
        ship.status = 'LLEGÓ A DESTINO'; resultado = 'EN_DESTINO';
      } else { resultado = 'EN_DESTINO'; }
    } else if (['NUEVO PEDIDO','EN PROCESO','POR ALISTAR','ALISTADO'].indexOf(ship.status) >= 0) {
      ship.status = 'ENVIADO'; resultado = 'ENVIADO';
    }
  }
  return {cambio: true, resultado: resultado, estado: estadoTexto};
}

/* ══════════════════════════════════════════════
   ALERTA DE DESTINO
══════════════════════════════════════════════ */
/* ── Aviso "llegó a destino" — vigilante AGNÓSTICO AL MOTOR ─────────────────
   Detecta la TRANSICIÓN de un pedido a destino (por status o por trackingStatus)
   y avisa UNA sola vez, sin importar el motor (A local o B por Firestore). Se
   dispara desde render() → Tracking.checkDestinoAlerts. El aviso queda FIJO
   hasta que lo cierres. */
var _destinoAvisados = null;   // Set de ids ya avisados (persistido en localStorage)
var _destinoKeyPrevio = false; // ¿existía la clave? (para sembrar en el rollout sin avalancha)

function _loadDestinoAvisados(){
  if (_destinoAvisados) return;
  try {
    var raw = localStorage.getItem('tt_destino_avisados');
    _destinoKeyPrevio = (raw != null);
    _destinoAvisados = new Set(raw ? JSON.parse(raw) : []);
  } catch(e){ _destinoAvisados = new Set(); _destinoKeyPrevio = false; }
}
function _saveDestinoAvisados(){
  try { localStorage.setItem('tt_destino_avisados',
    JSON.stringify(Array.from(_destinoAvisados).slice(-500))); } catch(e){}
}
// ¿El pedido está "en destino"? Agnóstico al motor y al modo (etiqueta u observación).
function _esDestino(s){
  if (!s || s.status === 'FINALIZADO') return false;
  if (s.status === 'LLEGÓ A DESTINO' || s.status === 'PENDIENTE DE PAGO') return true;
  return detectarEstadoAuto(s.trackingStatus || '') === 'EN_DESTINO';
}
// Vigilante: avisa los que ENTRARON a destino y no se habían avisado. En el primer
// arranque (sin clave previa) solo SIEMBRA en silencio → nada de avisos en masa.
function _checkDestinoAlerts(){
  _loadDestinoAvisados();
  var ships = _getShipments() || [];
  var nuevos = ships.filter(function(s){ return s && s.id && _esDestino(s) && !_destinoAvisados.has(s.id); });
  if (!nuevos.length) return;
  nuevos.forEach(function(s){ _destinoAvisados.add(s.id); });
  _saveDestinoAvisados();
  if (!_destinoKeyPrevio){ _destinoKeyPrevio = true; return; } // rollout: solo sembrar
  // Pocos → tiras hacia abajo. Bastantes → resumen que, al tocar "Ver", se
  // despliega en las tiras de ESOS pedidos apiladas una sobre otra.
  if (nuevos.length <= 3){ nuevos.forEach(_mostrarAlertaDestino); }
  else { _mostrarAlertaResumenDestino(nuevos); }
}

// La pila vive DENTRO de la página, justo encima de los 4 cuadros de cantidades.
// Antes flotaba fija sobre la pantalla (position:fixed) y TAPABA el contenido;
// en el flujo normal lo empuja hacia abajo, así nunca oculta nada.
function _destinoStack(){
  var s = document.getElementById('trkDestinoStack');
  if (!s){
    s = document.createElement('div');
    s.id = 'trkDestinoStack';
    // Mismo ancho de siempre (no se toca el tamaño de la tarjeta).
    s.style.cssText = 'display:flex;flex-direction:column;gap:8px;'+
      'width:100%;max-width:340px;margin:0 auto 12px';
    var stats = document.getElementById('statsArea');
    if (stats && stats.parentNode) stats.parentNode.insertBefore(s, stats);
    else document.body.appendChild(s);   // respaldo si aún no existe
  }
  return s;
}
function _destinoCard(){
  var d = document.createElement('div');
  d.style.cssText = 'background:#1c2333;border:2px solid #a78bfa;border-radius:12px;'+
    'padding:14px 18px;box-shadow:0 8px 24px rgba(0,0,0,.6)';
  return d;
}
function _btn(txt, css){
  var b = document.createElement('button'); b.textContent = txt; b.style.cssText = css; return b;
}

// Construye la tira de UN pedido (no la inserta). Misma tarjeta de siempre.
// DOM + addEventListener → el teléfono no va en un onclick inline (cierra el
// vector XSS del hallazgo #5).
function _tiraDestino(ship){
  var phone = String(ship.phone || '').replace(/\D/g, ''); // solo dígitos
  var d = _destinoCard(); d.setAttribute('data-ship', ship.id);
  var head = document.createElement('div');
  head.innerHTML = '<div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:6px">📍 PEDIDO LLEGÓ A DESTINO</div>'+
    '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px"><b>'+_esc(ship.name)+'</b></div>'+
    '<div style="font-size:11px;color:#8b949e;margin-bottom:10px">Guía: '+_esc(ship.trackingOrderNumber||'')+'</div>';
  var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px';
  var bClose = _btn('Cerrar', 'flex:1;background:#30363d;border:none;border-radius:8px;color:#8b949e;padding:8px;font-size:12px;cursor:pointer;font-family:inherit');
  bClose.addEventListener('click', function(){ _quitarTira(d); });
  var bWa = _btn('💬 Avisar cliente', 'flex:2;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);border-radius:8px;color:#a78bfa;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit');
  bWa.addEventListener('click', function(){
    if (phone) window.open('https://wa.me/51'+phone, '_blank');
    _quitarTira(d);
  });
  row.appendChild(bClose); row.appendChild(bWa);
  d.appendChild(head); d.appendChild(row);
  return d;
}

// Quita una tira y, si estaba en un mazo, reordena para que la siguiente pase
// al frente. Si el mazo queda vacío, se elimina (sin huecos en blanco).
function _quitarTira(card){
  var mazo = card.parentNode && card.parentNode.classList &&
             card.parentNode.classList.contains('trk-mazo') ? card.parentNode : null;
  card.remove();
  if (mazo){
    if (!mazo.children.length) mazo.remove();
    else _ordenarMazo(mazo);
  }
}

// Mazo: la primera tira se ve entera y las siguientes asoman por debajo.
function _ordenarMazo(mazo){
  var n = mazo.children.length;
  for (var i = 0; i < n; i++){
    var c = mazo.children[i];
    c.style.position  = 'relative';
    c.style.zIndex    = String(n - i);   // la de arriba, al frente
    c.style.marginTop = i === 0 ? '0' : '-62px';
  }
}

// Aviso individual (fijo hasta cerrar).
function _mostrarAlertaDestino(ship){
  if (!ship || !ship.id) return;
  var stack = _destinoStack();
  if (stack.querySelector('[data-ship="'+ship.id+'"]')) return; // dedup: ya visible
  stack.appendChild(_tiraDestino(ship));
}

// Aviso resumen cuando llegan varios de golpe (fijo hasta cerrar).
// "Ver" ya no filtra y descarta el aviso: despliega las tiras de ESOS pedidos
// APILADAS una sobre otra, para avisar cliente por cliente desde ahí mismo.
function _mostrarAlertaResumenDestino(ships){
  var stack = _destinoStack();
  var d = _destinoCard();
  var head = document.createElement('div');
  head.innerHTML = '<div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:8px">📍 '+ships.length+' PEDIDOS LLEGARON A DESTINO</div>';
  var row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px';
  var bClose = _btn('Cerrar', 'flex:1;background:#30363d;border:none;border-radius:8px;color:#8b949e;padding:8px;font-size:12px;cursor:pointer;font-family:inherit');
  bClose.addEventListener('click', function(){ d.remove(); });
  var bVer = _btn('Ver', 'flex:2;background:rgba(167,139,250,.15);border:1px solid rgba(167,139,250,.3);border-radius:8px;color:#a78bfa;padding:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit');
  bVer.addEventListener('click', function(){
    d.remove();                 // el resumen se reemplaza por las tiras
    _desplegarMazo(ships);
  });
  row.appendChild(bClose); row.appendChild(bVer);
  d.appendChild(head); d.appendChild(row); stack.appendChild(d);
}

// Despliega las tiras apiladas una sobre otra.
function _desplegarMazo(ships){
  var stack = _destinoStack();
  var mazo = document.createElement('div');
  mazo.className = 'trk-mazo';
  (ships || []).forEach(function(ship){
    if (!ship || !ship.id) return;
    if (stack.querySelector('[data-ship="'+ship.id+'"]')) return; // ya visible
    mazo.appendChild(_tiraDestino(ship));
  });
  if (!mazo.children.length) return;
  _ordenarMazo(mazo);
  stack.appendChild(mazo);
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
    'Guarda tracking → el pedido <b>conserva su etiqueta actual</b>. La primera consulta (manual o automática) lo pasa a <b>ENVIADO</b>.',
    'Presiona <b>⟳ Consultar</b> en cualquier momento para actualizar al instante.',
    'El sistema consulta Shalom automáticamente cada <b>12 horas</b> en tránsito y <b>24 horas</b> en destino, o <b>lo que configures</b> en ⚙️ Configuración → Shalom. Al entregarse deja de consultar.',
    'Shalom dice "En tránsito" → etiqueta <b>ENVIADO</b> + el cliente ve el estado en su link.',
    'Shalom dice "Demora de envíos" → etiqueta <b>ENVIADO</b> + el cliente ve el aviso de demora en su link.',
    'Shalom dice "En destino" → cambia automáticamente a <b>LLEGÓ A DESTINO</b>.',
    'Si el pedido tiene saldo pendiente → cambia a <b>PENDIENTE DE PAGO</b>.',
    'Shalom dice "Entregado" → cambia automáticamente a <b>FINALIZADO</b>.',
    'Los pasos 7 al 11 dependen de <b>Cambiar etiquetas</b> (⚙️ Configuración): <b>Apagado</b> = solo registra, no mueve nada · <b>Semiautomática</b> = mueve todo menos <b>FINALIZADO</b>, que cierras tú · <b>Automática</b> = mueve todo.',
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
Tracking.checkDestinoAlerts = _checkDestinoAlerts; // vigilante "llegó a destino" (hook desde render)

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
  // Búsqueda exacta primero
  var found = list.find(function(x){ return String(x.id) === String(shipId); });
  if (found) return found;
  // Fallback: buscar por trackingOrderNumber
  found = list.find(function(x){ return x.trackingOrderNumber && x.trackingOrderNumber === shipId; });
  if (found) return found;
  // Fallback: buscar por shalomGuia
  found = list.find(function(x){ return x.shalomGuia && x.shalomGuia === shipId; });
  if (found) return found;
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

  // Guardar la guía NO mueve la etiqueta: conserva la que tenía. Es la primera
  // consulta (manual o automática) la que la pasa a ENVIADO. Antes esto forzaba
  // ENVIADO en cada guardado, así que un pedido ya en LLEGÓ A DESTINO retrocedía
  // a ENVIADO al entrar solo a corregir la guía — el "a veces cambia de etiqueta
  // y se regresa solo" que buscábamos.

  if (typeof window.save   === 'function') window.save(ship.id);
  // ★ Subida INMEDIATA: al poner la guía y pasar a ENVIADO, sube al instante.
  if (typeof window._fbSaveShipmentNow === 'function') window._fbSaveShipmentNow(ship);
  if (typeof window.render === 'function') window.render();
  document.getElementById('delOverlay').classList.remove('open');
  if (typeof window.toast  === 'function') window.toast('✅ Tracking guardado');
};

/* Consulta un pedido por la puerta y aplica el resultado. Devuelve el objeto
   del aplicador. No toca UI global (lo hace el llamador). */
async function _consultarYAplicar(ship){
  var guia = ship.trackingOrderNumber || ship.shalomGuia || '';
  var codigo = ship.trackingOrderCode || ship.shalomCodigo || '';
  var resp = (window.Shalom && typeof window.Shalom.consultarGuia === 'function') ?
    await window.Shalom.consultarGuia(guia, codigo) : {ok: false, motivo: 'DESCONECTADO'};
  return _aplicarEstadoShalom(ship, resp);
}

/* ── consultarAhora: botón ⟳ por tarjeta ─────────────────────────── */
Tracking.consultarAhora = async function(shipId) {
  var ship = _findShip(shipId);
  if (!ship) {
    if (window.toast) window.toast('⚠️ Error: pedido no encontrado');
    return;
  }
  var guia = ship.trackingOrderNumber || ship.shalomGuia || '';
  if (!guia) {
    if (window.toast) window.toast('⚠️ Primero guarda el número de orden');
    return;
  }
  var btn = document.getElementById('btn-consult-'+shipId);
  if (btn) { btn.innerHTML = '<span class="trk-spin-inline"></span> Consultando...'; btn.disabled = true; }
  if (window.toast) window.toast('⏳ Consultando Shalom...');

  var r = await _consultarYAplicar(ship);
  if (r.cambio) {
    if (window.save) window.save(ship.id);
    if (window._fbSaveShipmentNow) window._fbSaveShipmentNow(ship); // subida inmediata
    if (window.render) window.render();
    if (window.toast) {
      window.toast(
        r.resultado === 'FINALIZADO' ? '✅ FINALIZADO — Shalom confirma entrega' :
        r.resultado === 'EN_DESTINO' ? '📍 Llegó a destino — avisar al cliente' :
        r.resultado === 'ENVIADO'    ? '🚚 En camino — marcado ENVIADO' :
        '🔄 Estado: ' + (ship.trackingStatus || '—'));
    }
  } else {
    if (window.toast) window.toast(_motivoTexto(r.motivo));
    if (btn) { btn.innerHTML = '⟳ Consultar'; btn.disabled = false; }
  }
};

/* ── bulkTrack: masivo desde el ícono 🔄 con selección ───────────── */
Tracking.bulkTrack = async function(ids) {
  var ships = (ids || []).map(_findShip).filter(Boolean).filter(function(s){
    var isShalom = s.courier && String(s.courier).toUpperCase().indexOf('SHALOM') >= 0;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    return isShalom && guia && s.status !== 'FINALIZADO';
  });
  if (!ships.length) { if (window.toast) window.toast('Nada Shalom para consultar'); return; }
  if (window.toast) window.toast('⏳ Consultando ' + ships.length + ' Shalom...');
  var ok = 0, err = 0, changed = [], ultimoMotivo = null;
  for (var i = 0; i < ships.length; i++) {
    var r = await _consultarYAplicar(ships[i]);
    if (r.cambio) { ok++; changed.push(ships[i].id); }
    else { err++; ultimoMotivo = r.motivo; }
    if (i < ships.length - 1) await new Promise(function(res){ setTimeout(res, 700); });
  }
  if (changed.length && window.save) window.save(changed);
  if (window.render) window.render();
  if (window.toast) {
    // Si NINGUNO respondió, di el motivo (p.ej. desconectado); si algunos sí, resume.
    if (!ok && ultimoMotivo) window.toast(_motivoTexto(ultimoMotivo));
    else window.toast('✅ ' + ok + ' consultado' + (ok!==1?'s':'') + (err ? ' · ' + err + ' sin dato' : ''));
  }
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

/* ── Auto-check al abrir el panel ────────────────────────────────────
   GATEADO en Shalom.DISPONIBLE: hoy la puerta está desconectada, así que esto
   NO hace nada. Cuando se conecte, consulta los Shalom pendientes que ya toca
   refrescar (según las horas de Config) y aplica por el mismo aplicador que el
   manual. El motor "sin abrir el panel" será Cloud Scheduler + sesión prestada
   (ver docs/SHALOM.md); esto es el complemento/respaldo para cuando trabajas. */
var _autoRunning = false;
async function autoTrackingCheck() {
  if (!(window.Shalom && window.Shalom.DISPONIBLE)) return; // apagado hasta conectar
  if (_autoRunning) return;
  var cfg = (window.S && window.S.config) || {};
  if (cfg.shalomAutoTrack === false) return;               // el operador lo apagó
  var ships = _getShipments();
  if (!ships) return;
  var ahora = Date.now();
  var hTran = (Number(cfg.trackingWebIntervalTransitoH) || 12) * 3600000;
  var hDest = (Number(cfg.trackingWebIntervalDestinoH) || 24) * 3600000;
  var pend = ships.filter(function(s){
    var isShalom = s.courier && String(s.courier).toUpperCase().indexOf('SHALOM') >= 0;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    if (!isShalom || !guia || s.status === 'FINALIZADO') return false;
    var enDestino = (s.status === 'LLEGÓ A DESTINO' || s.status === 'PENDIENTE DE PAGO');
    return (ahora - (s.trackingLastAutoCheck || 0)) >= (enDestino ? hDest : hTran);
  });
  if (!pend.length) return;
  _autoRunning = true;
  var ok = 0, changed = [];
  for (var i = 0; i < pend.length; i++) {
    try { var r = await _consultarYAplicar(pend[i]); if (r.cambio) { ok++; changed.push(pend[i].id); } }
    catch (e) { /* la puerta ya devuelve {ok:false}; no rompemos el ciclo */ }
    if (i < pend.length - 1) await new Promise(function(res){ setTimeout(res, 700); });
  }
  if (changed.length && window.save) window.save(changed);
  if (window.render) window.render();
  if (ok && window.toast) window.toast('🔄 Auto: ' + ok + ' actualizado' + (ok!==1?'s':''));
  _autoRunning = false;
}

/* ── init ────────────────────────────────────────────────────────── */
Tracking.init = function() {
  _injectCSS();
  _injectOverlays();
  // Sincronizar S con window.S con reintento
  function _syncS() {
    try {
      if (typeof S !== 'undefined' && S && S.shipments) {
        window.S = S;
        return true;
      }
    } catch(e) {}
    return false;
  }
  setTimeout(function() {
    if (!_syncS()) {
      setTimeout(function(){ _syncS(); autoTrackingCheck(); }, 2000);
    } else {
      autoTrackingCheck(); // no-op mientras Shalom.DISPONIBLE sea false
    }
  }, 2000);
};

global.Tracking = Tracking;
})(window);
