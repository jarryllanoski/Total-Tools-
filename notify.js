/**
 * notify.js — Campana de notificaciones para Total Tools v2
 * ==========================================================
 * - Notifica pedidos nuevos del formulario (últimas 2h)
 * - Botón 👁 Ver → scroll hasta la card del cliente + resaltar
 * - Botón 🖨️ Imprimir → abre modal de impresión con pedido preseleccionado
 * - Flag _printed en Firebase → sincronizado en todos los dispositivos
 * - Badge morado con contador de no impresos
 */
(function(){

  var _notifs = [];

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
      position:fixed;top:60px;right:8px;width:310px;
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
      padding:11px 14px;border-bottom:1px solid rgba(48,54,61,.5);
    }
    .notify-item:last-child { border-bottom:none; }
    .notify-icon { font-size:17px;flex-shrink:0;margin-top:2px; }
    .notify-content { flex:1;min-width:0; }
    .notify-title { font-size:12px;font-weight:700;color:#e6edf3;margin-bottom:2px; }
    .notify-sub   { font-size:11px;color:#8b949e;line-height:1.4;margin-bottom:7px; }
    .notify-actions { display:flex;gap:6px; }
    .notify-btn {
      padding:5px 10px;border-radius:7px;border:none;
      font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;
    }
    .notify-btn-ver {
      background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd;
    }
    .notify-btn-print {
      background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.3);color:#a371f7;
    }
    .notify-btn-printed {
      background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.25);color:#2ea043;
      cursor:default;
    }
    .notify-time { font-size:10px;color:#8b949e;flex-shrink:0;margin-top:2px; }
    .notify-empty { text-align:center;padding:24px;color:#8b949e;font-size:12px; }
    .notify-dot { width:6px;height:6px;border-radius:50%;background:#a371f7;flex-shrink:0;margin-top:6px; }

    /* Resaltado de card al navegar desde notificación */
    @keyframes notifyHighlight {
      0%  { box-shadow:0 0 0 3px rgba(163,113,247,.8); }
      50% { box-shadow:0 0 0 6px rgba(163,113,247,.4); }
      100%{ box-shadow:0 0 0 3px rgba(163,113,247,.8); }
    }
    .notify-card-highlight {
      animation:notifyHighlight .6s ease infinite;
      border-color:rgba(163,113,247,.6) !important;
    }
  `;
  document.head.appendChild(style);

  /* ── INYECTAR CAMPANA ────────────────────────────────────────────── */
  function _inject(){
    var slot = document.getElementById('notifyBellSlot');
    if(!slot || slot.querySelector('#notifyBtn')) return;

    slot.innerHTML =
      '<button id="notifyBtn" onclick="NotifyModule.toggle()" title="Nuevos pedidos">'+
        '🔔'+
        '<span id="notifyBadge">0</span>'+
      '</button>';

    var panel = document.createElement('div');
    panel.id = 'notifyPanel';
    panel.innerHTML =
      '<div class="notify-hdr">'+
        '<span class="notify-hdr-title">🔔 Nuevos pedidos</span>'+
        '<button class="notify-clear" onclick="NotifyModule.clearAll()">Limpiar todo</button>'+
      '</div>'+
      '<div class="notify-list" id="notifyList">'+
        '<div class="notify-empty">Sin notificaciones</div>'+
      '</div>';
    document.body.appendChild(panel);

    document.addEventListener('click', function(e){
      if(!e.target.closest('#notifyPanel') && !e.target.closest('#notifyBtn')){
        panel.classList.remove('open');
      }
    });
  }

  /* ── RENDER ──────────────────────────────────────────────────────── */
  function _render(){
    var list  = document.getElementById('notifyList');
    var badge = document.getElementById('notifyBadge');
    if(!list) return;

    // Badge = pedidos nuevos SIN imprimir
    var sinImprimir = _notifs.filter(function(n){ return !n.printed; }).length;
    if(badge){
      badge.textContent = sinImprimir;
      badge.style.display = sinImprimir > 0 ? 'flex' : 'none';
    }

    if(!_notifs.length){
      list.innerHTML = '<div class="notify-empty">Sin notificaciones</div>';
      return;
    }

    list.innerHTML = _notifs.map(function(n, i){
      var printedHtml = n.printed
        ? '<button class="notify-btn notify-btn-printed" disabled>✅ Impreso</button>'
        : '<button class="notify-btn notify-btn-print" onclick="NotifyModule.imprimir('+i+')">🖨️ Imprimir</button>';

      return '<div class="notify-item">' +
        '<div class="notify-icon">' + n.icon + '</div>' +
        '<div class="notify-content">' +
          '<div class="notify-title">' + _esc(n.title) + '</div>' +
          '<div class="notify-sub">'   + _esc(n.sub)   + '</div>' +
          '<div class="notify-actions">' +
            '<button class="notify-btn notify-btn-ver" onclick="NotifyModule.ver('+i+')">👁 Ver</button>' +
            printedHtml +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<div class="notify-time">' + n.time + '</div>' +
          (!n.read ? '<div class="notify-dot"></div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* ── HELPERS ─────────────────────────────────────────────────────── */
  function _timeAgo(ts){
    var d = Date.now() - ts;
    var m = Math.floor(d/60000);
    if(m < 1)    return 'ahora';
    if(m < 60)   return m + 'min';
    if(m < 1440) return Math.floor(m/60) + 'h';
    return Math.floor(m/1440) + 'd';
  }

  function _esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function _closePanel(){
    var panel = document.getElementById('notifyPanel');
    if(panel) panel.classList.remove('open');
  }

  /* ── VER: scroll hasta la card ───────────────────────────────────── */
  function _verShipment(id){
    _closePanel();

    // Limpiar filtros para que la card sea visible
    if(typeof window.setFilt === 'function') window.setFilt('');
    if(typeof window.render === 'function') window.render();

    // Buscar la card en el DOM y hacer scroll
    setTimeout(function(){
      // Buscar card por id del shipment en el HTML
      var cards = document.querySelectorAll('.card');
      var target = null;
      cards.forEach(function(c){
        if(c.innerHTML.indexOf(id) !== -1) target = c;
      });

      if(target){
        target.scrollIntoView({behavior:'smooth', block:'center'});
        target.classList.add('notify-card-highlight');
        setTimeout(function(){ target.classList.remove('notify-card-highlight'); }, 3000);
      } else {
        // Fallback: buscar por nombre del shipment
        var ship = window.S && window.S.shipments && window.S.shipments.find(function(s){ return s.id===id; });
        if(ship && typeof window._setSearch !== 'undefined'){
          var inp = document.getElementById('fSearch');
          if(inp){ inp.value = ship.name; if(typeof window.render==='function') window.render(); }
        }
      }
    }, 300);
  }

  /* ── IMPRIMIR ────────────────────────────────────────────────────── */
  function _imprimirShipment(id, notifIdx){
    _closePanel();

    var ship = window.S && window.S.shipments && window.S.shipments.find(function(s){ return s.id===id; });
    if(!ship) return;

    // Seleccionar el pedido y abrir PrintModule
    ship.sel = true;
    if(window.PrintModule && window.PrintModule.open){
      window.PrintModule.open();
    }

    // Marcar como impreso cuando se confirme la impresión
    // Hookeamos el evento afterprint del navegador
    var _onAfterPrint = function(){
      window.removeEventListener('afterprint', _onAfterPrint);
      ship.sel = false;
      // Guardar flag _printed en el shipment
      ship._printed = true;
      if(typeof window.save === 'function') window.save();
      // Actualizar notificación
      if(_notifs[notifIdx]) _notifs[notifIdx].printed = true;
      _render();
      if(typeof window.toast === 'function') window.toast('✅ Impreso — ' + ship.name);
    };
    window.addEventListener('afterprint', _onAfterPrint);

    // Timeout de seguridad: si no dispara afterprint en 30s, igual marcar
    setTimeout(function(){
      window.removeEventListener('afterprint', _onAfterPrint);
    }, 30000);
  }

  /* ── OBSERVAR NUEVOS PEDIDOS ─────────────────────────────────────── */
  var _seenIds = {};

  function _checkNewShipments(){
    var S = window.S;
    if(!S || !S.shipments) return;

    S.shipments.forEach(function(s){
      if(_seenIds[s.id]) {
        // Actualizar estado impreso si cambió en Firebase
        var existing = _notifs.find(function(n){ return n.shipId === s.id; });
        if(existing && s._printed && !existing.printed){
          existing.printed = true;
          _render();
        }
        return;
      }
      _seenIds[s.id] = true;

      // Solo notificar pedidos nuevos recientes (últimas 2 horas) del formulario
      var ts = s.createdAt ? new Date(s.createdAt).getTime() : 0;
      if(!ts || Date.now() - ts > 2*60*60*1000) return;
      if(s.fromForm){
        window.NotifyModule.add({
          icon:    '📦',
          title:   'Nuevo pedido — ' + s.name,
          sub:     s.courier + ' · ' + (s.address||s.ciudadDestino||'—').substring(0,45),
          shipId:  s.id,
          printed: !!s._printed,
          ts:      ts
        });
      }
    });
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  window.NotifyModule = {

    add: function(opts){
      // Evitar duplicados
      if(_notifs.find(function(n){ return n.shipId === opts.shipId; })) return;
      _notifs.unshift({
        icon:    opts.icon    || '🔔',
        title:   opts.title   || '',
        sub:     opts.sub     || '',
        shipId:  opts.shipId  || '',
        printed: opts.printed || false,
        time:    _timeAgo(opts.ts || Date.now()),
        ts:      opts.ts || Date.now(),
        read:    false
      });
      if(_notifs.length > 20) _notifs.pop();
      _render();
    },

    ver: function(idx){
      var n = _notifs[idx]; if(!n) return;
      n.read = true;
      _verShipment(n.shipId);
      _render();
    },

    imprimir: function(idx){
      var n = _notifs[idx]; if(!n) return;
      n.read = true;
      _render();
      _imprimirShipment(n.shipId, idx);
    },

    clearAll: function(){
      _notifs = [];
      _seenIds = {};
      _render();
    },

    toggle: function(){
      var panel = document.getElementById('notifyPanel');
      if(!panel) return;
      panel.classList.toggle('open');
      if(panel.classList.contains('open')){
        // Actualizar tiempos al abrir
        _notifs.forEach(function(n){ n.time = _timeAgo(n.ts); });
        _render();
      }
    },

    check: _checkNewShipments
  };

  /* ── INIT ────────────────────────────────────────────────────────── */
  function init(){
    _inject();
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
