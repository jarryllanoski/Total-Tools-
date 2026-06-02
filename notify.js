/**
 * notify.js — Campana de notificaciones/acciones para Total Tools
 * Reemplaza el badge "PLAN PRO" en el header
 * Para desactivar: quitar <script src="notify.js"> del index.html
 */

(function(){

  var _notifs = []; // lista de notificaciones activas

  /* ── CSS ─────────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = `
    #notifyBtn {
      position:relative;background:none;border:none;cursor:pointer;
      font-size:18px;padding:2px 4px;flex-shrink:0;line-height:1;
      display:flex;align-items:center;color:#e6edf3;
    }
    #notifyBadge {
      display:none;position:absolute;top:-3px;right:-3px;
      background:#a371f7;color:#fff;font-size:9px;font-weight:900;
      min-width:16px;height:16px;border-radius:8px;
      align-items:center;justify-content:center;
      padding:0 3px;line-height:1;font-family:inherit;
    }
    #notifyPanel {
      position:fixed;top:60px;right:8px;width:300px;
      background:#161b22;border:1px solid #30363d;border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      z-index:9998;display:none;overflow:hidden;
      max-height:80vh;
    }
    #notifyPanel.open { display:flex;flex-direction:column; }
    .notify-hdr {
      display:flex;align-items:center;justify-content:space-between;
      padding:12px 14px;background:#1c2333;
      border-bottom:1px solid #30363d;flex-shrink:0;
    }
    .notify-hdr-title { font-size:13px;font-weight:700;color:#e6edf3; }
    .notify-clear {
      background:none;border:none;font-size:11px;color:#8b949e;
      cursor:pointer;font-family:inherit;padding:0;
    }
    .notify-clear:hover { color:#e6edf3; }
    .notify-list { overflow-y:auto;flex:1; }
    .notify-item {
      display:flex;align-items:flex-start;gap:10px;
      padding:12px 14px;border-bottom:1px solid rgba(48,54,61,.5);
      cursor:pointer;transition:background .1s;
    }
    .notify-item:hover { background:rgba(48,54,61,.4); }
    .notify-item:last-child { border-bottom:none; }
    .notify-icon { font-size:18px;flex-shrink:0;margin-top:1px; }
    .notify-content { flex:1;min-width:0; }
    .notify-title { font-size:12px;font-weight:700;color:#e6edf3;margin-bottom:2px; }
    .notify-sub   { font-size:11px;color:#8b949e;line-height:1.4; }
    .notify-time  { font-size:10px;color:#8b949e;flex-shrink:0;margin-top:2px; }
    .notify-empty { text-align:center;padding:24px;color:#8b949e;font-size:12px; }
    .notify-dot { width:6px;height:6px;border-radius:50%;background:#a371f7;flex-shrink:0;margin-top:5px; }
  `;
  document.head.appendChild(style);

  /* ── INYECTAR CAMPANA ────────────────────────────────────────────── */
  function _inject(){
    var slot = document.getElementById('notifyBellSlot');
    if(!slot || slot.querySelector('#notifyBtn')) return;

    slot.innerHTML =
      '<button id="notifyBtn" onclick="NotifyModule.toggle()" title="Notificaciones">'+
        '🔔'+
        '<span id="notifyBadge">0</span>'+
      '</button>';

    // Panel
    var panel = document.createElement('div');
    panel.id = 'notifyPanel';
    panel.innerHTML =
      '<div class="notify-hdr">'+
        '<span class="notify-hdr-title">🔔 Notificaciones</span>'+
        '<button class="notify-clear" onclick="NotifyModule.clearAll()">Limpiar todo</button>'+
      '</div>'+
      '<div class="notify-list" id="notifyList">'+
        '<div class="notify-empty">Sin notificaciones</div>'+
      '</div>';
    document.body.appendChild(panel);

    // Cerrar al hacer clic fuera
    document.addEventListener('click', function(e){
      if(!e.target.closest('#notifyPanel') && !e.target.closest('#notifyBtn')){
        panel.classList.remove('open');
      }
    });
  }

  /* ── RENDER ──────────────────────────────────────────────────────── */
  function _render(){
    var list = document.getElementById('notifyList');
    var badge = document.getElementById('notifyBadge');
    if(!list) return;

    var unread = _notifs.filter(function(n){ return !n.read; }).length;
    if(badge){
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'flex' : 'none';
    }

    if(!_notifs.length){
      list.innerHTML = '<div class="notify-empty">Sin notificaciones</div>';
      return;
    }

    list.innerHTML = _notifs.map(function(n, i){
      return '<div class="notify-item" onclick="NotifyModule.read('+i+',\''+n.action+'\')">' +
        '<div class="notify-icon">' + n.icon + '</div>' +
        '<div class="notify-content">' +
          '<div class="notify-title">' + _esc(n.title) + '</div>' +
          '<div class="notify-sub">'   + _esc(n.sub)   + '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<div class="notify-time">' + n.time + '</div>' +
          (n.read ? '' : '<div class="notify-dot"></div>') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── HELPERS ─────────────────────────────────────────────────────── */
  function _timeAgo(ts){
    var d = Date.now() - ts;
    var m = Math.floor(d/60000);
    if(m < 1)   return 'ahora';
    if(m < 60)  return m + 'min';
    if(m < 1440) return Math.floor(m/60) + 'h';
    return Math.floor(m/1440) + 'd';
  }

  function _esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── OBSERVAR NUEVOS PEDIDOS ─────────────────────────────────────── */
  var _lastCount = -1;
  var _seenIds   = {};

  function _checkNewShipments(){
    var S = window.S;
    if(!S || !S.shipments) return;

    S.shipments.forEach(function(s){
      if(_seenIds[s.id]) return;
      _seenIds[s.id] = true;

      // Solo notificar pedidos nuevos recientes (últimas 2 horas)
      var ts = s.createdAt ? new Date(s.createdAt).getTime() : 0;
      if(!ts || Date.now() - ts > 2*60*60*1000) return;
      if(s.fromForm){ // vino del formulario del cliente
        window.NotifyModule.add({
          icon: '📦',
          title: 'Nuevo pedido — ' + s.name,
          sub: s.courier + ' · ' + (s.address||s.ciudadDestino||'—').substring(0,40),
          action: 'openShipment:' + s.id,
          ts: ts
        });
      }
    });
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  window.NotifyModule = {

    add: function(opts){
      _notifs.unshift({
        icon:   opts.icon   || '🔔',
        title:  opts.title  || '',
        sub:    opts.sub    || '',
        action: opts.action || '',
        time:   _timeAgo(opts.ts || Date.now()),
        ts:     opts.ts || Date.now(),
        read:   false
      });
      // Máximo 20 notificaciones
      if(_notifs.length > 20) _notifs.pop();
      _render();
    },

    read: function(idx, action){
      if(_notifs[idx]) _notifs[idx].read = true;
      _render();
      // Ejecutar acción
      if(action && action.startsWith('openShipment:')){
        var id = action.split(':')[1];
        var ship = window.S && window.S.shipments && window.S.shipments.find(function(s){ return s.id===id; });
        if(ship && window.openForm) window.openForm(id);
      }
      document.getElementById('notifyPanel').classList.remove('open');
    },

    clearAll: function(){
      _notifs = [];
      _render();
    },

    toggle: function(){
      var panel = document.getElementById('notifyPanel');
      if(!panel) return;
      panel.classList.toggle('open');
      // Marcar todas como leídas al abrir
      if(panel.classList.contains('open')){
        _notifs.forEach(function(n){ n.read = true; });
        _render();
      }
    },

    check: _checkNewShipments
  };

  /* ── INIT ───────────────────────────────────────────────────────── */
  function init(){
    _inject();

    // Hookear render() para detectar nuevos pedidos
    var _origRender = window.render;
    if(typeof _origRender === 'function'){
      window.render = function(){
        _origRender.apply(this, arguments);
        _checkNewShipments();
      };
    } else {
      setTimeout(init, 400);
      return;
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

})();
