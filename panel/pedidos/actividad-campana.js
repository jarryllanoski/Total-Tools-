(function(){

  var _notifs = [];

  var style = document.createElement('style');
  style.textContent = `
    #actBtn {
      position:relative;background:none;border:none;cursor:pointer;
      font-size:18px;padding:2px 4px;flex-shrink:0;line-height:1;
      display:flex;align-items:center;color:#e6edf3;
    }
    #actBadge {
      display:none;position:absolute;top:-3px;right:-3px;
      background:#a371f7;color:#fff;font-size:9px;font-weight:900;
      min-width:16px;height:16px;border-radius:8px;
      align-items:center;justify-content:center;
      padding:0 3px;line-height:1;font-family:inherit;
    }
    #actPanel {
      position:fixed;top:60px;right:8px;width:310px;
      background:#161b22;border:1px solid #30363d;border-radius:14px;
      box-shadow:0 8px 32px rgba(0,0,0,.5);
      z-index:9998;display:none;overflow:hidden;
      max-height:80vh;
    }
    #actPanel.open { display:flex;flex-direction:column; }
    .act-hdr {
      display:flex;align-items:center;justify-content:space-between;
      padding:12px 14px;background:#1c2333;
      border-bottom:1px solid #30363d;flex-shrink:0;
    }
    .act-hdr-title { font-size:13px;font-weight:700;color:#e6edf3; }
    .act-clear {
      background:none;border:none;font-size:11px;color:#8b949e;
      cursor:pointer;font-family:inherit;padding:0;
    }
    .act-clear:hover { color:#e6edf3; }
    .act-list { overflow-y:auto;flex:1; }
    .act-item {
      display:flex;align-items:flex-start;gap:10px;
      padding:11px 14px;border-bottom:1px solid rgba(48,54,61,.5);
    }
    .act-item:last-child { border-bottom:none; }
    .act-icon { font-size:17px;flex-shrink:0;margin-top:2px; }
    .act-content { flex:1;min-width:0; }
    .act-title { font-size:12px;font-weight:700;color:#e6edf3;margin-bottom:2px; }
    .act-sub   { font-size:11px;color:#8b949e;line-height:1.4;margin-bottom:7px; }
    .act-actions { display:flex;gap:6px; }
    .act-btn {
      padding:5px 10px;border-radius:7px;border:none;
      font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;
    }
    .act-btn-ver {
      background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.3);color:#388bfd;
    }
    .act-btn-print {
      background:rgba(163,113,247,.15);border:1px solid rgba(163,113,247,.3);color:#a371f7;
    }
    .act-btn-printed {
      background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.25);color:#2ea043;
      cursor:default;
    }
    .act-time { font-size:10px;color:#8b949e;flex-shrink:0;margin-top:2px; }
    .act-empty { text-align:center;padding:24px;color:#8b949e;font-size:12px; }
    .act-dot { width:6px;height:6px;border-radius:50%;background:#a371f7;flex-shrink:0;margin-top:6px; }
    .act-filtros { display:flex;gap:6px;overflow-x:auto;padding:8px 12px;border-bottom:1px solid #30363d;flex-shrink:0; }
    .act-chip { background:none;border:1px solid #30363d;color:#8b949e;border-radius:999px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap; }
    .act-chip.on { background:rgba(56,139,253,.15);border-color:rgba(56,139,253,.4);color:#388bfd; }
    .act-item.urgente { background:rgba(248,81,73,.06);box-shadow:inset 3px 0 0 #f85149; }
    .act-item.nuevo .act-title { color:#fff; }
    .act-pie { padding:8px 12px;font-size:10.5px;color:#8b949e;border-top:1px solid #30363d;text-align:center;flex-shrink:0; }

  `;
  document.head.appendChild(style);

  var FILTROS = [['todo', 'Todo'], ['pedidos', 'Pedidos'], ['vistas', 'Vistas'], ['resenas', 'Reseñas'], ['reclamos', 'Reclamos'], ['promos', 'Promos']];
  var CADA_MS = 120000;
  var CLAVE_VISTO = 'tt_campana_visto';
  var _servidor = [];
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
    return A.lista(_servidor)
      .sort(function(a, b){ return b.ts - a.ts; })
      .filter(function(e){
        var k = e.t + '|' + e.id + '|' + e.ts;
        if(ya[k]) return false;
        ya[k] = 1;
        return true;
      })
      .slice(0, A.MAX);
  }

  function nuevas(){
    var desde = _vistoHasta();
    return todos().filter(function(e){ return e.ts > desde; }).length;
  }

  function _inject(){
    var slot = document.getElementById('actividadBellSlot');
    if(!slot || slot.querySelector('#actBtn')) return;

    slot.innerHTML =
      '<button id="actBtn" onclick="ActividadCampana.toggle()" title="Actividad de tus clientes">'+
        '👥'+
        '<span id="actBadge">0</span>'+
      '</button>';

    var panel = document.createElement('div');
    panel.id = 'actPanel';
    panel.innerHTML =
      '<div class="act-hdr">'+
        '<span class="act-hdr-title">👥 Actividad de tus clientes</span>'+
        '<button class="act-clear" onclick="ActividadCampana.leer(true)">Actualizar</button>'+
      '</div>'+
      '<div class="act-filtros" id="actFiltros"></div>'+
      '<div class="act-list" id="actList">'+
        '<div class="act-empty">Sin actividad todavía</div>'+
      '</div>'+
      '<div class="act-pie">Se guardan las últimas 50 acciones. Las más antiguas se borran solas.</div>';
    document.body.appendChild(panel);

    document.addEventListener('click', function(e){
      if(!e.target.closest('#actPanel') && !e.target.closest('#actBtn')){
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
    var list  = document.getElementById('actList');
    var badge = document.getElementById('actBadge');
    var fil   = document.getElementById('actFiltros');
    var A = _A();
    if(!list || !A) return;

    var n = nuevas();
    if(badge){
      badge.textContent = n > 49 ? '50' : String(n);
      badge.style.display = n > 0 ? 'flex' : 'none';
    }
    if(fil){
      fil.innerHTML = FILTROS.map(function(f){
        return '<button type="button" class="act-chip' + (_filtro === f[0] ? ' on' : '') + '" onclick="ActividadCampana.filtrar(\'' + f[0] + '\')">' + _esc(f[1]) + '</button>';
      }).join('');
    }

    var items = _filtrados();
    if(!items.length){
      list.innerHTML = '<div class="act-empty">' + (_filtro === 'todo' ? 'Sin actividad todavía' : 'Nada en este filtro') + '</div>';
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
          ? '<button class="act-btn act-btn-printed" disabled>✅ Impreso</button>'
          : '<button class="act-btn act-btn-print" onclick="ActividadCampana.imprimir(\'' + _esc(e.id) + '\')">🖨️ Imprimir</button>';
      }
      var clases = 'act-item' + (A.urgente(e) ? ' urgente' : '') + (e.ts > desde ? ' nuevo' : '');
      return '<div class="' + clases + '">' +
        '<div class="act-icon">' + d.ico + '</div>' +
        '<div class="act-content">' +
          '<div class="act-title">' + _esc(A.texto(vista)) + '</div>' +
          (e.s ? '<div class="act-sub">' + _esc(e.s) + '</div>' : '') +
          '<div class="act-actions">' +
            (ship ? '<button class="act-btn act-btn-ver" onclick="ActividadCampana.ver(\'' + _esc(e.id) + '\')">👁 Ver pedido</button>' : '') +
            imprimir +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">' +
          '<div class="act-time">' + _timeAgo(e.ts) + '</div>' +
          (e.ts > desde ? '<div class="act-dot"></div>' : '') +
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
    var panel = document.getElementById('actPanel');
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

  window.ActividadCampana = {

    ver: function(id){ _verShipment(id); },

    imprimir: function(id){ _imprimirShipment(id); },

    filtrar: function(f){
      if(!FILTROS.some(function(x){ return x[0] === f; })) return;
      _filtro = f;
      _render();
    },

    leer: leer,

    toggle: function(){
      var panel = document.getElementById('actPanel');
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
