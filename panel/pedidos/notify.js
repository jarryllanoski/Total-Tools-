(function(){

  var _notifs = [];

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
    .notify-filtros { display:flex;gap:6px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid #30363d;flex-shrink:0; }
    .notify-chip { background:none;border:1px solid #30363d;color:#8b949e;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap; }
    .notify-chip.on { background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.4);color:#388bfd; }
    .notify-item.urgente { background:rgba(248,81,73,.06);box-shadow:inset 3px 0 0 #f85149; }
    .notify-item.nuevo .notify-title { color:#fff; }
    .notify-pie { padding:8px 12px;font-size:10.5px;color:#8b949e;border-top:1px solid #30363d;text-align:center;flex-shrink:0; }

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

  var FILTROS = [['todo', 'Todo'], ['pedidos', 'Pedidos'], ['vistas', 'Vistas'], ['resenas', 'Reseñas'], ['reclamos', 'Reclamos'], ['promos', 'Promos']];
  var CADA_MS = 120000;
  var CLAVE_VISTO = 'tt_campana_visto';
  var _servidor = [];
  var _locales = [];
  var _filtro = 'todo';
  var _leyendo = false;
  var _timer = null;

  function _A(){ return window.Actividad; }

  function _vistoHasta(){
    try{ return Number(localStorage.getItem(CLAVE_VISTO)) || 0; }catch(e){ return 0; }
  }

  function _guardarVisto(ts){
    try{ localStorage.setItem(CLAVE_VISTO, String(ts)); }catch(e){}
  }

  function todos(){
    var A = _A();
    if(!A) return [];
    var ya = {};
    return A.lista(_locales.concat(_servidor))
      .sort(function(a, b){ return b.ts - a.ts; })
      .filter(function(e){
        var k = e.t + '|' + e.id + '|' + e.ts;
        if(ya[k]) return false;
        ya[k] = 1;
        return true;
      })
      .filter(function(e){
        if(e.t !== 'pedido' || !e.local) return true;
        return !_servidor.some(function(s){ return s.t === 'pedido' && s.id === e.id; });
      })
      .slice(0, A.MAX);
  }

  function nuevas(){
    var desde = _vistoHasta();
    return todos().filter(function(e){ return e.ts > desde; }).length;
  }

  function _inject(){
    var slot = document.getElementById('notifyBellSlot');
    if(!slot || slot.querySelector('#notifyBtn')) return;

    slot.innerHTML =
      '<button id="notifyBtn" onclick="NotifyModule.toggle()" title="Actividad de tus clientes">'+
        '🔔'+
        '<span id="notifyBadge">0</span>'+
      '</button>';

    var panel = document.createElement('div');
    panel.id = 'notifyPanel';
    panel.innerHTML =
      '<div class="notify-hdr">'+
        '<span class="notify-hdr-title">🔔 Actividad de tus clientes</span>'+
        '<button class="notify-clear" onclick="NotifyModule.leer(true)">Actualizar</button>'+
      '</div>'+
      '<div class="notify-filtros" id="notifyFiltros"></div>'+
      '<div class="notify-list" id="notifyList">'+
        '<div class="notify-empty">Sin actividad todavía</div>'+
      '</div>'+
      '<div class="notify-pie">Se guardan las últimas 50 acciones. Las más antiguas se borran solas.</div>';
    document.body.appendChild(panel);

    document.addEventListener('click', function(e){
      if(!e.target.closest('#notifyPanel') && !e.target.closest('#notifyBtn')){
        panel.classList.remove('open');
      }
    });
  }

  function _impreso(s){
    if(window.PrintModule && typeof window.PrintModule.impreso === 'function') return window.PrintModule.impreso(s);
    return !!(s && (s.printed || s._printed));
  }

  function _pedido(id){
    return (window.S && S.shipments || []).find(function(x){ return x && x.id === id; }) || null;
  }

  function _filtrados(){
    var A = _A();
    return todos().filter(function(e){ return _filtro === 'todo' || (A.TIPOS[e.t] && A.TIPOS[e.t].grupo === _filtro); });
  }

  function _render(){
    var list  = document.getElementById('notifyList');
    var badge = document.getElementById('notifyBadge');
    var fil   = document.getElementById('notifyFiltros');
    var A = _A();
    if(!list || !A) return;

    var n = nuevas();
    if(badge){
      badge.textContent = n > 49 ? '50' : String(n);
      badge.style.display = n > 0 ? 'flex' : 'none';
    }
    if(fil){
      fil.innerHTML = FILTROS.map(function(f){
        return '<button type="button" class="notify-chip' + (_filtro === f[0] ? ' on' : '') + '" onclick="NotifyModule.filtrar(\'' + f[0] + '\')">' + _esc(f[1]) + '</button>';
      }).join('');
    }

    var items = _filtrados();
    if(!items.length){
      list.innerHTML = '<div class="notify-empty">' + (_filtro === 'todo' ? 'Sin actividad todavía' : 'Nada en este filtro') + '</div>';
      return;
    }
    var desde = _vistoHasta();
    list.innerHTML = items.map(function(e){
      var d = A.TIPOS[e.t];
      var ship = _pedido(e.id);
      var nro = ship && window.NroComprobante ? NroComprobante.de(ship) : '';
      var vista = nro ? Object.assign({}, e, {c: nro}) : e;
      var imprimir = '';
      if(e.t === 'pedido' && ship){
        imprimir = _impreso(ship)
          ? '<button class="notify-btn notify-btn-printed" disabled>✅ Impreso</button>'
          : '<button class="notify-btn notify-btn-print" onclick="NotifyModule.imprimir(\'' + _esc(e.id) + '\')">🖨️ Imprimir</button>';
      }
      var clases = 'notify-item' + (A.urgente(e) ? ' urgente' : '') + (e.ts > desde ? ' nuevo' : '');
      return '<div class="' + clases + '">' +
        '<div class="notify-icon">' + d.ico + '</div>' +
        '<div class="notify-content">' +
          '<div class="notify-title">' + _esc(A.texto(vista)) + '</div>' +
          (e.s ? '<div class="notify-sub">' + _esc(e.s) + '</div>' : '') +
          '<div class="notify-actions">' +
            (ship ? '<button class="notify-btn notify-btn-ver" onclick="NotifyModule.ver(\'' + _esc(e.id) + '\')">👁 Ver pedido</button>' : '') +
            imprimir +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<div class="notify-time">' + _timeAgo(e.ts) + '</div>' +
          (e.ts > desde ? '<div class="notify-dot"></div>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function _timeAgo(ts){
    var d = Date.now() - ts;
    var m = Math.floor(d/60000);
    if(m < 1)    return 'ahora';
    if(m < 60)   return m + 'min';
    if(m < 1440) return Math.floor(m/60) + 'h';
    return Math.floor(m/1440) + 'd';
  }

  function _esc(s){
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _closePanel(){
    var panel = document.getElementById('notifyPanel');
    if(panel) panel.classList.remove('open');
  }

  function _verShipment(id){
    _closePanel();
    if(typeof window.irAlPedido === 'function') window.irAlPedido(id);
    else if(typeof window.render === 'function') window.render();
  }

  function _imprimirShipment(id){
    _closePanel();
    var ship = _pedido(id);
    if(!ship) return;
    if(window.PrintModule && window.PrintModule.openOne) window.PrintModule.openOne(id);
    var _onAfterPrint = function(){
      window.removeEventListener('afterprint', _onAfterPrint);
      ship._printed = true;
      if(typeof window.save === 'function') window.save(ship.id);
      _render();
      if(typeof window.toast === 'function') window.toast('✅ Impreso — ' + ship.name);
    };
    window.addEventListener('afterprint', _onAfterPrint);
    setTimeout(function(){ window.removeEventListener('afterprint', _onAfterPrint); }, 30000);
  }

  function _listo(){
    return !!(window._syncUltimo && typeof window._fbLeerActividad === 'function');
  }

  async function leer(forzar){
    if(_leyendo || !_listo()) return false;
    if(document.hidden && !forzar) return false;
    _leyendo = true;
    try{
      var d = await window._fbLeerActividad();
      _servidor = _A() ? _A().lista(d && d.items) : [];
      return true;
    }catch(e){
      return false;
    }finally{
      _leyendo = false;
      _render();
    }
  }

  window.NotifyModule = {

    add: function(opts){
      var o = opts || {};
      var A = _A();
      if(!A || !o.shipId) return;
      var ev = A.evento('pedido', _pedido(o.shipId) || {id: o.shipId, name: o.title}, {}, o.ts || Date.now());
      if(!ev) return;
      ev.local = true;
      _locales = A.agregar(_locales, ev).slice(0, 10);
      _render();
    },

    ver: function(id){ _verShipment(id); },

    imprimir: function(id){ _imprimirShipment(id); },

    filtrar: function(f){
      if(!FILTROS.some(function(x){ return x[0] === f; })) return;
      _filtro = f;
      _render();
    },

    leer: leer,

    toggle: function(){
      var panel = document.getElementById('notifyPanel');
      if(!panel) return;
      panel.classList.toggle('open');
      if(panel.classList.contains('open')){
        _render();
        leer(true).then(function(){
          var t = todos();
          if(t.length) _guardarVisto(t[0].ts);
          _render();
        });
      }
    },

    check: _render,
    todos: todos,
    nuevas: nuevas
  };

  function init(){
    _inject();
    _render();
    setTimeout(function(){ leer(); }, 4000);
    clearInterval(_timer);
    _timer = setInterval(function(){ leer(); }, CADA_MS);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) leer(); });
  }

  if(document.readyState !== 'complete'){
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

})();
