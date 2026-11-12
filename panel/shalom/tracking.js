(function(global){
'use strict';

var TRK = {
  KEYWORDS_ENTREGADO: ['entregado','entrega realizada','entrega completa','recogido','recojo completado','delivered'],
  KEYWORDS_DESTINO:   ['llegó a destino','llego a destino','en agencia destino','disponible para recojo',
                       'disponible para retiro','en agencia de destino','a disposicion',
                       'en destino','en destino -','en la agencia','en destino-'],
};

var ESTADOS_SHALOM = ['', 'En origen', 'En tránsito', 'Demora de envíos',
  'En destino', 'Entregado', 'Retorno a origen'];

function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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

function _conDetalle(detalle){
  var d = String(detalle == null ? '' : detalle).replace(/<[^>]*>/g, '').trim();
  if (!d) return '';
  if (d.length > 90) d = d.slice(0, 89) + '…';
  return ' (' + d + ')';
}

function _reabreEn(reabre){
  var t = Number(reabre);
  if (!t || t <= Date.now()) return '';
  var min = Math.max(1, Math.round((t - Date.now()) / 60000));
  return ' (reintenta en ' + min + ' min)';
}

function _motivoTexto(motivo, detalle){
  switch (motivo) {
    case 'DESCONECTADO':  return '🔧 Rastreo Shalom en reconstrucción';
    case 'SOLO_REGISTRADO':
      return '📦 Registrado en Shalom — el paquete aún no entró a la agencia';
    case 'NO_ENCONTRADO': return '⚠️ Shalom no encontró esa guía — verifica número y código';
    case 'SIN_SESION':    return '🔒 Tu sesión del panel venció — cierra sesión y vuelve a entrar';
    case 'SIN_PERMISO':   return '🚫 Tu cuenta entró bien, pero no está autorizada para consultar Shalom';
    case 'BLOQUEADO':     return '🔑 Shalom rechazó la clave o el plan venció' +
      _conDetalle(detalle) + ' — revisa tu panel de Shalom API';
    case 'LIMITE':        return '⏳ Se agotó la cuota del plan por ahora — reintenta más tarde';
    case 'SIN_DATO':      return '⚠️ Shalom no devolvió estado' + _conDetalle(detalle) +
      ' — reintenta en un momento';
    case 'ERROR_SHALOM':  return '⚠️ Shalom tuvo un error' + _conDetalle(detalle) +
      ' — reintenta en un momento';
    case 'SHALOM_SIN_RESPUESTA':
      return '⏳ Shalom-API no pudo leer esta guía ahora (falla de su lado con guías nuevas; en shalom.com.pe sí se ve) — reintenta más tarde, los horarios lo vuelven a intentar solos';
    case 'SIN_RED':       return '📡 Sin conexión — revisa tu internet y reintenta';
    case 'APAGADA':
      return '🔌 El rastreo de Shalom está apagado — enciéndelo en Configuración';
    case 'PUERTA_CERRADA':
      return '⏸️ Shalom falló varias veces seguidas; el rastreo se pausó solo' +
        _reabreEn(detalle) + ' — tus pedidos y el panel siguen funcionando';
    case 'FORMATO_DESCONOCIDO':
      return '🔧 Shalom respondió en un formato no reconocido — avísame para ajustarlo';
    default:              return '⚠️ No se pudo consultar Shalom';
  }
}

function _escribirTracking(ship, estado, fecha, origen){
  var iso = fecha || new Date().toISOString();
  if (!ship.trackingHistory) ship.trackingHistory = [];
  ship.trackingHistory.push({date: iso, status: estado, message: estado, source: origen || 'shalom'});
  ship.trackingStatus     = estado;
  ship.trackingMessage    = estado;
  ship.trackingLastUpdate = iso;
}

function _aplicarEstadoShalom(ship, resp, origen){
  if (!resp || !resp.ok) {
    return {cambio: false,
            motivo: (resp && resp.motivo) || 'SIN_DATO',
            detalle: (resp && resp.detalle) ||
                     (resp && resp.http ? 'HTTP ' + resp.http : ''),
            revisoPendientes: !!(resp && resp.revisoPendientes)};
  }
  ship.trackingLastAutoCheck = Date.now();

  var autoEstado;
  if (typeof resp.pasos === 'number') {
    autoEstado = resp.pasos >= 3 ? 'FINALIZADO' : (resp.pasos === 2 ? 'EN_DESTINO' : null);
  } else {
    autoEstado = detectarEstadoAuto(resp.estado || '');
  }

  var estadoTexto = (resp.estado || '').trim();
  if (!estadoTexto && autoEstado == null) {
    return {cambio: false, motivo: 'SIN_DATO'};
  }

  var rangoNuevo = (typeof resp.pasos === 'number') ? resp.pasos
                                                    : _rangoDeTexto(estadoTexto);
  var rangoViejo = _rangoDeTexto(ship.trackingStatus);
  var esManual = origen === 'manual';
  if (!esManual && rangoNuevo !== null && rangoViejo !== null &&
      rangoNuevo < rangoViejo) {
    return {cambio: true, escribio: false, avanzo: false, retroceso: true,
            resultado: 'ok', estado: ship.trackingStatus,
            intento: estadoTexto};
  }
  var avanzo = (rangoNuevo !== null && rangoViejo !== null &&
                rangoNuevo > rangoViejo);

  var escribio = false;
  if (estadoTexto && ship.trackingStatus !== estadoTexto) {
    _escribirTracking(ship, estadoTexto, resp.fecha, origen);
    escribio = true;
  }

  var movio = null;
  if (window.Etiquetas && window.Etiquetas.decidirEtiqueta) {
    var _cfg = (window.S && window.S.config) || {};
    var _modo = (_cfg.barrido && _cfg.barrido.modo) || 'semi';
    var _d = window.Etiquetas.decidirEtiqueta(ship, resp, _modo);
    if (_d) { ship.status = _d.nueva; movio = _d.nueva; }
  }

  var resultado = 'ok';
  if (/retorno a origen/i.test(estadoTexto))   resultado = 'RETORNO';
  else if (autoEstado === 'FINALIZADO')        resultado = 'FINALIZADO';
  else if (autoEstado === 'EN_DESTINO')        resultado = 'EN_DESTINO';

  return {cambio: true, escribio: escribio, avanzo: avanzo,
    resultado: resultado, estado: estadoTexto, movio: movio};
}

function _rangoDeTexto(t){
  if (window.Etiquetas && window.Etiquetas.rangoDeTexto) {
    return window.Etiquetas.rangoDeTexto(t);
  }
  return null;
}

var _destinoAvisados = null;
var _destinoKeyPrevio = false;

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
function _esDestino(s){
  if (!s || s.status === 'FINALIZADO') return false;
  return detectarEstadoAuto(s.trackingStatus || '') === 'EN_DESTINO';
}
function _checkDestinoAlerts(){
  _loadDestinoAvisados();
  var ships = _getShipments() || [];
  var nuevos = ships.filter(function(s){ return s && s.id && _esDestino(s) && !_destinoAvisados.has(s.id); });
  if (!nuevos.length) return;
  nuevos.forEach(function(s){ _destinoAvisados.add(s.id); });
  _saveDestinoAvisados();
  if (!_destinoKeyPrevio){ _destinoKeyPrevio = true; return; }
  if (nuevos.length <= 3){ nuevos.forEach(_mostrarAlertaDestino); }
  else { _mostrarAlertaResumenDestino(nuevos); }
}

function _destinoStack(){
  var s = document.getElementById('trkDestinoStack');
  if (!s){
    s = document.createElement('div');
    s.id = 'trkDestinoStack';
    s.style.cssText = 'display:flex;flex-direction:column;gap:8px;'+
      'width:100%;max-width:340px;margin:0 auto 12px';
    var stats = document.getElementById('statsArea');
    if (stats && stats.parentNode) stats.parentNode.insertBefore(s, stats);
    else document.body.appendChild(s);
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

function _montoTira(ship){
  var M = window.MontoPedido;
  if (!M) return '';
  var e = M.de(ship);
  if (M.esNuevo(ship)) return M.html(e);
  return e.tipo === 'debe' ? M.html(e) : '';
}

function _tiraDestino(ship){
  var phone = String(ship.phone || '').replace(/\D/g, '');
  var d = _destinoCard(); d.setAttribute('data-ship', ship.id);
  var head = document.createElement('div');
  head.innerHTML = '<div style="font-size:12px;font-weight:800;color:#a78bfa;margin-bottom:6px">📍 PEDIDO LLEGÓ A DESTINO</div>'+
    '<div style="font-size:13px;color:#e6edf3;margin-bottom:4px"><b>'+_esc(ship.name)+'</b></div>'+
    '';
  var linea = document.createElement('div');
  linea.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:12px;margin-bottom:10px';
  var tel = document.createElement('span');
  tel.className = 'trk-tel';
  tel.textContent = String(ship.phone || '');
  tel.title = 'Copiar';
  tel.style.cssText = 'color:#e6edf3;font-weight:700;cursor:pointer;user-select:none';
  tel.addEventListener('click', function(){
    if (typeof window.copyPhone === 'function') window.copyPhone(String(ship.phone || ''));
  });
  linea.appendChild(tel);
  var mt = _montoTira(ship);
  if (mt){
    var mo = document.createElement('span');
    mo.className = 'trk-monto';
    mo.style.cssText = 'color:#e6edf3;font-weight:700;white-space:nowrap';
    mo.innerHTML = mt;
    linea.appendChild(mo);
  }
  head.appendChild(linea);
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

function _quitarTira(card){
  var mazo = card.parentNode && card.parentNode.classList &&
             card.parentNode.classList.contains('trk-mazo') ? card.parentNode : null;
  card.remove();
  if (mazo){
    if (!mazo.children.length) mazo.remove();
    else _ordenarMazo(mazo);
  }
  _barraCerrarTodos();
}

function _ordenarMazo(mazo){
  mazo.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  for (var i = 0; i < mazo.children.length; i++){
    var c = mazo.children[i];
    c.style.position = ''; c.style.zIndex = ''; c.style.marginTop = '';
  }
  _barraCerrarTodos();
}

function _barraCerrarTodos(){
  var stack = document.getElementById('trkDestinoStack');
  if (!stack) return;
  var n = stack.querySelectorAll('[data-ship]').length;
  var bar = document.getElementById('trkDestinoTodos');
  if (n < 2){ if (bar) bar.remove(); return; }
  if (!bar){
    bar = _btn('Cerrar todos', 'align-self:flex-end;background:#30363d;border:none;border-radius:8px;color:#8b949e;padding:6px 12px;font-size:11px;cursor:pointer;font-family:inherit');
    bar.id = 'trkDestinoTodos';
    bar.addEventListener('click', function(){
      stack.querySelectorAll('[data-ship]').forEach(function(c){ c.remove(); });
      stack.querySelectorAll('.trk-mazo').forEach(function(m){ m.remove(); });
      bar.remove();
    });
  }
  if (stack.firstChild !== bar) stack.insertBefore(bar, stack.firstChild);
}

function _mostrarAlertaDestino(ship){
  if (!ship || !ship.id) return;
  var stack = _destinoStack();
  if (stack.querySelector('[data-ship="'+ship.id+'"]')) return;
  stack.appendChild(_tiraDestino(ship));
  _barraCerrarTodos();
}

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
    d.remove();
    _desplegarMazo(ships);
  });
  row.appendChild(bClose); row.appendChild(bVer);
  d.appendChild(head); d.appendChild(row); stack.appendChild(d);
}

function _desplegarMazo(ships){
  var stack = _destinoStack();
  var mazo = document.createElement('div');
  mazo.className = 'trk-mazo';
  (ships || []).forEach(function(ship){
    if (!ship || !ship.id) return;
    if (stack.querySelector('[data-ship="'+ship.id+'"]')) return;
    mazo.appendChild(_tiraDestino(ship));
  });
  if (!mazo.children.length) return;
  _ordenarMazo(mazo);
  stack.appendChild(mazo);
  _barraCerrarTodos();
}

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
    '#trkHistOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;align-items:flex-end;justify-content:center}',
    '#trkHistOv.open{display:flex}',
    '#trkHistSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:trkUp .22s ease;max-height:88vh;overflow-y:auto}',
    '@keyframes trkUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '.trk-hist-row{display:flex;gap:9px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-hist-row:last-child{border-bottom:none}',
    '.trk-hist-dot{width:7px;height:7px;border-radius:50%;background:#388bfd;flex-shrink:0;margin-top:5px}',
    '#trkManualOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:800;align-items:flex-end;justify-content:center}',
    '#trkManualOv.open{display:flex}',
    '#trkManualSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:trkUp .22s ease;max-height:88vh;overflow-y:auto}',
    '.trk-manual-step{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)}',
    '.trk-manual-step:last-child{border-bottom:none}',
    '.trk-manual-num{width:22px;height:22px;border-radius:50%;background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
  ].join('');
  document.head.appendChild(s);
}

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
    'El sistema consulta Shalom solo, <b>en los horarios que pongas</b> en ⚙️ Configuración → Shalom (de fábrica: 8:00, 11:30, 16:30 y 19:00). Corre en el servidor, así que funciona aunque no tengas el panel abierto. <b>Al entregarse deja de consultar</b>: ya no puede traer nada nuevo.',
    'Shalom dice "En tránsito" → etiqueta <b>ENVIADO</b> + el cliente ve el estado en su link.',
    'Shalom dice "Demora de envíos" → el cliente ve el aviso de demora en su link, y <b>la etiqueta no se mueve</b>: un paquete demorado que ya está en destino sigue en destino. (Antes esta línea lo mandaba de vuelta a ENVIADO.)',
    'Shalom dice "En destino" → cambia automáticamente a <b>LLEGÓ A DESTINO</b>.',
    'Si el pedido tiene saldo pendiente → cambia a <b>PENDIENTE DE PAGO</b>.',
    'Shalom dice "Entregado" → cambia automáticamente a <b>FINALIZADO</b>. <b>Salvo que quede saldo por cobrar</b>: entonces se queda en PENDIENTE DE PAGO esperándote, ni siquiera en modo Automática.',
    'Los pasos 7 al 11 dependen de <b>Mover etiquetas</b> (⚙️ Configuración → Shalom): <b>Apagado</b> = solo registra, no mueve nada · <b>Semiautomática</b> = mueve todo menos <b>FINALIZADO</b>, que cierras tú · <b>Automática</b> = mueve todo. Y en cualquier modo: <b>una etiqueta nunca retrocede</b>, y las tuyas (RECLAMOS, AVISAR CUANDO LLEGUE…) no se tocan jamás.',
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

function _plazoShalom(ship, ahora) {
  var t = Date.parse(String((ship && ship.shalomRegistradoEn) || ''));
  if (!isFinite(t)) return null;
  var resta = (t + 86400000) - (ahora || Date.now());
  var abs = Math.abs(resta);
  var h = Math.floor(abs / 3600000);
  var m = Math.floor((abs % 3600000) / 60000);
  return {
    queda: resta,
    vencido: resta <= 0,
    urgente: resta > 0 && resta < 10800000,
    texto: (resta <= 0 ? 'venció hace ' : 'quedan ') + h + ' h ' + m + ' min'
  };
}

function _estadoChip(ship) {
  var st = ship.trackingStatus;
  if (!st || st === '—') {
    if (String(ship.shalomEstado || '').toUpperCase() === 'REGISTRADO') {
      var pz = _plazoShalom(ship);
      var cls = 'trk-chip-pend', cola = ' — déjalo en la agencia';
      if (pz && pz.vencido) {
        cls = 'trk-chip-err';
        cola = ' — ⏰ venció el plazo de 24 h (' + pz.texto + ')';
      } else if (pz) {
        if (pz.urgente) cls = 'trk-chip-err';
        cola = ' — déjalo en la agencia · ' + pz.texto;
      }
      return '<div class="trk-chip '+cls+'" style="margin-top:4px">'+
        '📦 Registrado en Shalom'+
        '<span style="opacity:.75;font-weight:400">'+cola+
        '</span></div>';
    }
    return '<div style="font-size:11px;color:#8b949e;margin-top:4px;padding:4px 0">Sin consultas aún — presiona Consultar</div>';
  }
  var u = st.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var cls, ico;
  if (ship.status === 'FINALIZADO' || u.includes('ENTREGADO')) { cls='trk-chip-ok';   ico='✅'; }
  else if (u.includes('AGENCIA') || u.includes('DESTINO'))     { cls='trk-chip-dest'; ico='🏢'; }
  else if (u.includes('TRANSITO')|| u.includes('CAMINO'))      { cls='trk-chip-mov';  ico='🚌'; }
  else if (u.includes('ERROR')   || u.includes('NO SE'))       { cls='trk-chip-err';  ico='⚠'; }
  else                                                           { cls='trk-chip-pend'; ico='📦'; }

  var sello = ship.trackingLastUpdate ?
    new Date(ship.trackingLastUpdate).toLocaleString('es-PE',
      {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
  if (sello && /invalid/i.test(sello)) sello = '';

  return '<div class="trk-chip '+cls+'" onclick="Tracking.verHistorial(\''+_esc(ship.id)+'\')">'+
    ico+' '+_esc(st)+
    (sello?'<span style="opacity:.5;font-size:9px;margin-left:4px">'+sello+'</span>':'')+
    ' <span style="opacity:.4;font-size:9px">↗</span></div>';
}

function _haceCuanto(ms){
  var min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1)   return 'recién';
  if (min < 60)  return 'hace ' + min + ' min';
  var h = Math.floor(min / 60);
  if (h < 24)    return 'hace ' + h + ' h';
  return 'hace ' + Math.floor(h / 24) + ' d';
}

var Tracking = {};
Tracking.checkDestinoAlerts = _checkDestinoAlerts;

function _getShipments() {
  if (window.S && window.S.shipments && window.S.shipments.length) return window.S.shipments;
  try { if (typeof S !== 'undefined' && S && S.shipments && S.shipments.length) return S.shipments; } catch(e){}
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
  var found = list.find(function(x){ return String(x.id) === String(shipId); });
  if (found) return found;
  found = list.find(function(x){ return x.trackingOrderNumber && x.trackingOrderNumber === shipId; });
  if (found) return found;
  found = list.find(function(x){ return x.shalomGuia && x.shalomGuia === shipId; });
  if (found) return found;
  console.warn('[Tracking] Pedido no encontrado con ID:', shipId);
  return null;
}

Tracking.renderCardBlock = function(s) {
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
    '<div><label style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;display:block;margin-bottom:4px">ESTADO EN SHALOM</label>',
    '<select id="trkEstado" class="fs">',
    ESTADOS_SHALOM.map(function(e){
      var sel = (e && e === (ship.trackingStatus || '')) ? ' selected' : '';
      return '<option value="'+_esc(e)+'"'+sel+'>'+(e ? _esc(e) : '— No cambiar —')+'</option>';
    }).join(''),
    '</select>',
    '<div style="font-size:10.5px;color:#8b949e;margin-top:5px;line-height:1.4">Se registra igual que una consulta automática y mueve la etiqueta según tu configuración.</div></div>',
    '</div>',
    '<div style="display:flex;gap:8px">',
    '<button onclick="document.getElementById(\'delOverlay\').classList.remove(\'open\')" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:9px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>',
    '<button onclick="Tracking._guardarEdicion(\''+_esc(shipId)+'\')" style="flex:2;padding:12px;background:linear-gradient(135deg,#388bfd,#1a5fbf);border:none;border-radius:9px;color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">💾 Guardar tracking</button>',
    '</div>',
  ].join('');
  ov.classList.add('open');
  if (window.Guias) window.Guias.vigilar('trkOrdNum', shipId);
};

Tracking._guardarEdicion = function(shipId) {
  var ship = _findShip(shipId);
  if (!ship) return;
  var num    = (document.getElementById('trkOrdNum')  ||{}).value||'';
  var code   = (document.getElementById('trkOrdCode') ||{}).value||'';
  var estado = (document.getElementById('trkEstado')  ||{}).value||'';
  num = num.trim(); code = code.trim(); estado = estado.trim();
  if (!num) { if(typeof window.toast==='function') window.toast('⚠️ Ingresa el número de orden'); return; }

  var guiaAnterior = ship.trackingOrderNumber || ship.shalomGuia || '';
  ship.trackingOrderNumber = num;
  ship.trackingOrderCode   = code;
  ship.shalomGuia          = num;
  ship.shalomCodigo        = code;
  ship.shippingCourier = 'Shalom';

  if (guiaAnterior && guiaAnterior !== num) {
    ship.trackingStatus    = '';
    ship.trackingMessage   = '';
    ship.trackingLastUpdate= '';
    ship.shalomEstado      = '';
    ship.shalomPor          = '';
    ship.shalomRegistradoEn = '';
  }

  var rEstado = null;
  if (estado) rEstado = _aplicarEstadoShalom(ship, {ok: true, estado: estado}, 'manual');

  if (typeof window.save   === 'function') window.save(ship.id);
  if (typeof window._fbSaveShipmentNow === 'function') window._fbSaveShipmentNow(ship);
  if (typeof window.render === 'function') window.render();
  document.getElementById('delOverlay').classList.remove('open');
  if (typeof window.toast === 'function') {
    window.toast(
      !rEstado ? '✅ Tracking guardado' :
      rEstado.resultado === 'FINALIZADO' ? '✅ ' + estado + ' — puedes finalizarlo' :
      rEstado.resultado === 'EN_DESTINO' ? '📍 ' + estado + ' — avisar al cliente' :
      rEstado.resultado === 'RETORNO'    ? '↩️ ' + estado :
      '✅ Estado: ' + estado);
  }
};

async function _consultarYAplicar(ship){
  var guia = ship.trackingOrderNumber || ship.shalomGuia || '';
  var codigo = ship.trackingOrderCode || ship.shalomCodigo || '';
  var resp = (window.Shalom && typeof window.Shalom.consultarGuia === 'function') ?
    await window.Shalom.consultarGuia(guia, codigo) : {ok: false, motivo: 'DESCONECTADO'};
  return _aplicarEstadoShalom(ship, resp);
}

function _avisoConsulta(ship, r){
  var estado = ship.trackingStatus || '—';
  if (r.retroceso) {
    return '🛡️ Sigue ' + estado + ' — Shalom devolvió "' +
           (r.intento || '—') + '", que es anterior; no se aplicó';
  }
  if (r.resultado === 'FINALIZADO') return '✅ Shalom confirma entrega — puedes finalizarlo';
  if (r.resultado === 'EN_DESTINO') return '📍 Llegó a destino — avisar al cliente';
  if (r.resultado === 'RETORNO')    return '↩️ ' + estado;
  if (r.avanzo)                     return '🔄 Avanzó — ahora ' + estado;
  if (r.escribio)                   return '🔄 Ahora: ' + estado;
  return '✓ Sin cambios — sigue ' + estado;
}

function _situacion(ship){
  var R = window.RegistroShalom;
  return (R && R.situacion) ? R.situacion(ship, Date.now()) : {tipo: 'normal', venceEn: null};
}

function _textoSinRastro(ship, r){
  var sit = _situacion(ship);
  var pendiente = r && r.motivo === 'PENDIENTE';
  if (sit.tipo === 'porDejar' || pendiente) {
    var v = sit.venceEn;
    var cuando = (typeof v !== 'number') ? '' : (v > 0 ?
      ' · vence en ' + Math.max(1, Math.round(v / 3600000)) + ' h' :
      ' · el plazo de 24 h ya pasó: regístrala de nuevo');
    return (pendiente ? '📦 Registrada en tu Shalom Pro — pendiente: falta dejar el paquete en la agencia' :
      '📦 Registrado — aún no entra a la agencia') + cuando;
  }
  if (r && r.revisoPendientes) {
    return '⚠️ Shalom no tiene esta guía (ni en su rastreo ni en tus pendientes) — revisa número y código';
  }
  return '📦 Shalom aún no tiene esta guía en su rastreo — si no dejaste el paquete, es normal; si ya lo dejaste, revisa número y código';
}
function _esSinRastro(motivo){ return motivo === 'NO_ENCONTRADO' || motivo === 'SOLO_REGISTRADO' || motivo === 'PENDIENTE'; }

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
  if (_situacion(ship).tipo === 'vencida') {
    if (window.toast) window.toast('⏰ Esta guía venció sin dejar el paquete — regístrala de nuevo');
    return;
  }
  var btn = document.getElementById('btn-consult-'+shipId);
  if (btn) { btn.innerHTML = '<span class="trk-spin-inline"></span> Consultando...'; btn.disabled = true; }
  if (window.toast) window.toast('⏳ Consultando Shalom...');

  var r = await _consultarYAplicar(ship);
  if (r.cambio) {
    if (window.save) window.save(ship.id);
    if (window._fbSaveShipmentNow) window._fbSaveShipmentNow(ship);
    if (window.render) window.render();
    if (window.toast) window.toast(_avisoConsulta(ship, r));
  } else {
    if (window.toast) {
      var extra = (r.motivo === 'PUERTA_CERRADA') ? r.reabre : r.detalle;
      window.toast(_esSinRastro(r.motivo) ? _textoSinRastro(ship, r) : _motivoTexto(r.motivo, extra));
    }
  }
  var btn2 = document.getElementById('btn-consult-' + shipId);
  if (btn2) { btn2.innerHTML = '⟳ Consultar'; btn2.disabled = false; }
};

Tracking.bulkTrack = async function(ids) {
  var ships = (ids || []).map(_findShip).filter(Boolean).filter(function(s){
    var isShalom = s.courier && String(s.courier).toUpperCase().indexOf('SHALOM') >= 0;
    var guia = s.trackingOrderNumber || s.shalomGuia || '';
    return isShalom && guia && s.status !== 'FINALIZADO' && _situacion(s).tipo !== 'vencida';
  });
  if (!ships.length) { if (window.toast) window.toast('Nada Shalom para consultar'); return; }
  if (window.toast) window.toast('⏳ Consultando ' + ships.length + ' Shalom...');
  var ok = 0, err = 0, porDejar = 0, avanzaron = 0, changed = [], ultimoMotivo = null, ultimoDetalle = '';
  for (var i = 0; i < ships.length; i++) {
    var r = await _consultarYAplicar(ships[i]);
    if (r.cambio) {
      ok++;
      if (r.escribio) changed.push(ships[i].id);
      if (r.avanzo || r.resultado === 'EN_DESTINO' ||
          r.resultado === 'FINALIZADO') avanzaron++;
    }
    else if (r.motivo === 'PENDIENTE' || (_esSinRastro(r.motivo) && _situacion(ships[i]).tipo === 'porDejar')) porDejar++;
    else { err++; ultimoMotivo = r.motivo; ultimoDetalle = r.detalle; }
    if (i < ships.length - 1) await new Promise(function(res){ setTimeout(res, 700); });
  }
  if (changed.length && window.save) window.save(changed);
  if (window.render) window.render();
  if (window.toast) {
    if (!ok && !porDejar && ultimoMotivo) window.toast(_motivoTexto(ultimoMotivo, ultimoDetalle));
    else window.toast('✅ ' + ok + ' consultado' + (ok!==1?'s':'') +
      (avanzaron ? ' · 📍 ' + avanzaron + ' avanzó' + (avanzaron!==1?'n':'') : '') +
      (porDejar ? ' · 📦 ' + porDejar + ' por dejar en agencia' : '') +
      (err ? ' · ' + err + ' sin dato' : ''));
  }
};

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

    ship.trackingStatus&&ship.trackingStatus!=='—' ? [
      '<div style="background:rgba(56,139,253,.08);border:1px solid rgba(56,139,253,.2);border-radius:9px;padding:10px 12px;margin-bottom:12px">',
      '<div style="font-size:10px;font-weight:700;color:#388bfd;letter-spacing:.8px;margin-bottom:4px">ESTADO ACTUAL</div>',
      '<div style="font-size:14px;font-weight:700;color:#e6edf3">'+_esc(ship.trackingStatus)+'</div>',
      ship.trackingOrigen  ? '<div style="font-size:11px;color:#8b949e;margin-top:4px">🏙 Origen: '+_esc(ship.trackingOrigen)+'</div>' : '',
      ship.trackingDestino ? '<div style="font-size:11px;color:#8b949e">📍 Destino: '+_esc(ship.trackingDestino)+'</div>' : '',
      ship.trackingLastUpdate ? '<div style="font-size:10px;color:#8b949e;margin-top:4px">Actualizado: '+new Date(ship.trackingLastUpdate).toLocaleString('es-PE')+'</div>' : '',
      ship.trackingLastAutoCheck ? '<div style="font-size:10px;color:#8b949e">Última consulta: '+_esc(_haceCuanto(Number(ship.trackingLastAutoCheck)))+'</div>' : '',
      '</div>'
    ].join('') : '',

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

    hist.length ? [
      '<div style="font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.8px;margin-bottom:8px">CONSULTAS REALIZADAS</div>',
      '<div style="background:#1c2333;border:1px solid #30363d;border-radius:9px;padding:4px 12px">',
      hist.slice().reverse().map(function(h){
        var fecha = h.date ? new Date(h.date).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '';
        var srcBadge = (h.source !== 'manual')
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

Tracking.abrirManual = function() {
  var ov = document.getElementById('trkManualOv');
  if (ov) ov.classList.add('open');
};

Tracking.copiarLink = function(id) {
  var base = typeof getSeguimientoLink === 'function' ? getSeguimientoLink()
    : window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/seguimiento.html');
  var _ped = (window.S && S.shipments || []).filter(function(x){ return x && x.id === id; })[0];
  var url = base + '?seg=' + (window.EnlaceSeguimiento
    ? EnlaceSeguimiento.tokenDe(_ped || {id: id}) : id);
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

var AUTO_CHECK_ACTIVO = false;
var _autoRunning = false;
async function autoTrackingCheck() {
  if (!AUTO_CHECK_ACTIVO) return;
  if (!(window.Shalom && window.Shalom.DISPONIBLE)) return;
  if (_autoRunning) return;
  var cfg = (window.S && window.S.config) || {};
  if (cfg.shalomAutoTrack === false) return;
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
    catch (e) {  }
    if (i < pend.length - 1) await new Promise(function(res){ setTimeout(res, 700); });
  }
  if (changed.length && window.save) window.save(changed);
  if (window.render) window.render();
  if (ok && window.toast) window.toast('🔄 Auto: ' + ok + ' actualizado' + (ok!==1?'s':''));
  _autoRunning = false;
}

Tracking.init = function() {
  _injectCSS();
  _injectOverlays();
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
      autoTrackingCheck();
    }
  }, 2000);
};

global.Tracking = Tracking;
})(window);
