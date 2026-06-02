/**
 * floatpanel.js — Mini paneles flotantes para Total Tools (solo PC)
 * Al hacer clic largo (500ms) en una etiqueta de estado o en el header de courier,
 * se abre un panel flotante de solo lectura con esa vista filtrada.
 * Se sincroniza automáticamente con window.S.
 * Para desactivar: quitar <script src="floatpanel.js"> del index.html
 */

(function(){

  // Solo en PC con mouse
  if(!window.matchMedia('(pointer:fine)').matches) return;

  var _panels  = [];   // paneles activos
  var _zBase   = 9000;

  /* ── CSS ─────────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = `
    .fp-panel {
      position:fixed;
      width:320px;
      min-width:220px;
      max-width:600px;
      min-height:120px;
      max-height:85vh;
      background:#161b22;
      border:1px solid #30363d;
      border-radius:14px;
      box-shadow:0 8px 40px rgba(0,0,0,.6);
      display:flex;
      flex-direction:column;
      overflow:hidden;
      z-index:9000;
      font-family:inherit;
      cursor:grab;
    }
    .fp-hdr {
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:10px 14px;
      background:#1c2333;
      border-bottom:1px solid #30363d;
      user-select:none;
      flex-shrink:0;
    }
    .fp-resize {
      position:absolute;
      right:0; bottom:0;
      width:18px; height:18px;
      cursor:se-resize;
      display:flex; align-items:flex-end; justify-content:flex-end;
      padding:3px;
      z-index:10;
    }
    .fp-resize::after {
      content:'';
      display:block;
      width:10px; height:10px;
      border-right:2px solid #30363d;
      border-bottom:2px solid #30363d;
      border-radius:0 0 3px 0;
    }
    .fp-title {
      font-size:13px;
      font-weight:700;
      color:#e6edf3;
      display:flex;
      align-items:center;
      gap:6px;
    }
    .fp-count {
      background:#30363d;
      color:#8b949e;
      font-size:10px;
      font-weight:700;
      padding:2px 7px;
      border-radius:20px;
    }
    .fp-close {
      background:none;
      border:none;
      color:#8b949e;
      font-size:16px;
      cursor:pointer;
      width:26px;
      height:26px;
      border-radius:50%;
      display:flex;
      align-items:center;
      justify-content:center;
      flex-shrink:0;
    }
    .fp-close:hover { background:#30363d; color:#e6edf3; }
    .fp-body {
      overflow-y:auto;
      flex:1;
      padding:8px;
    }
    .fp-card {
      background:#0d1117;
      border:1px solid #30363d;
      border-radius:10px;
      padding:10px 12px;
      margin-bottom:6px;
      font-size:12px;
    }
    .fp-card-name {
      font-weight:700;
      font-size:13px;
      color:#e6edf3;
      margin-bottom:4px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .fp-card-row {
      color:#8b949e;
      font-size:11px;
      margin-bottom:2px;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
    }
    .fp-card-status {
      display:inline-block;
      margin-top:5px;
      font-size:10px;
      font-weight:700;
      padding:2px 8px;
      border-radius:20px;
      background:#30363d;
      color:#8b949e;
    }
    .fp-empty {
      text-align:center;
      color:#8b949e;
      font-size:12px;
      padding:20px 0;
    }
    .fp-hint {
      position:fixed;
      bottom:16px;
      left:50%;
      transform:translateX(-50%);
      background:rgba(56,139,253,.95);
      color:#fff;
      padding:8px 18px;
      border-radius:20px;
      font-size:12px;
      z-index:99999;
      pointer-events:none;
      white-space:nowrap;
      font-family:inherit;
    }
    /* Indicador de arrastre en chips */
    .chip[data-fp-ready] {
      position:relative;
    }
    .chip[data-fp-ready]::after {
      content:'⠿';
      font-size:8px;
      color:#8b949e;
      margin-left:3px;
      opacity:.5;
    }
  `;
  document.head.appendChild(style);

  /* ── CREAR PANEL ─────────────────────────────────────────────────── */
  function createPanel(label, icon){
    var id = 'fp_' + Date.now();

    // Posición inicial — derecha del panel principal o donde haya espacio
    var appEl = document.querySelector('.app') || document.querySelector('#page-envios')?.parentElement;
    var startX = window.innerWidth - 340;
    var startY = 80 + _panels.length * 30;

    if(appEl){
      var r = appEl.getBoundingClientRect();
      // Intentar poner a la derecha
      if(r.right + 340 < window.innerWidth){
        startX = r.right + 10;
      } else if(r.left > 340){
        startX = r.left - 330;
      } else {
        startX = window.innerWidth - 340;
      }
    }

    var el = document.createElement('div');
    el.className = 'fp-panel';
    el.id = id;
    el.style.left = startX + 'px';
    el.style.top  = startY + 'px';
    el.style.zIndex = _zBase + _panels.length;

    el.innerHTML =
      '<div class="fp-hdr" id="' + id + '_hdr">' +
        '<div class="fp-title">' +
          '<span>' + icon + ' ' + label + '</span>' +
          '<span class="fp-count" id="' + id + '_count">0</span>' +
        '</div>' +
        '<button class="fp-close" onclick="FloatPanel.close(\'' + id + '\')">✕</button>' +
      '</div>' +
      '<div class="fp-body" id="' + id + '_body"></div>';

    document.body.appendChild(el);

    var panel = { id, label, icon, el };
    _panels.push(panel);

    // Arrastre desde cualquier parte excepto botones y el body scrolleable
    _makeDraggable(el, el, id);

    // Resize
    _makeResizable(el);

    // Render inicial
    _renderPanel(panel);

    // Focus al crear
    el.addEventListener('mousedown', function(){
      el.style.zIndex = _zBase + _panels.length + 10;
    });

    return panel;
  }

  /* ── RENDER CONTENIDO ───────────────────────────────────────────── */
  function _renderPanel(panel){
    var S = window.S;
    if(!S || !S.shipments) return;

    var ships = S.shipments.filter(function(s){ return s.status === panel.label; });

    var count = document.getElementById(panel.id + '_count');
    var body  = document.getElementById(panel.id + '_body');
    if(!count || !body) return;

    count.textContent = ships.length;

    if(!ships.length){
      body.innerHTML = '<div class="fp-empty">Sin pedidos</div>';
      return;
    }

    body.innerHTML = ships.map(function(s){
      var addr = s.address || s.ciudadDestino || '—';
      if(addr.length > 50) addr = addr.substring(0, 50) + '…';
      return '<div class="fp-card">' +
        '<div class="fp-card-name">' + _esc(s.name) + '</div>' +
        '<div class="fp-card-row">📞 ' + _esc(s.phone) + (s.dni ? ' &nbsp;🪪 ' + _esc(s.dni) : '') + '</div>' +
        '<div class="fp-card-row">📍 ' + _esc(addr) + '</div>' +
        '<div class="fp-card-row">🚚 ' + _esc(s.courier||'—') + ' &nbsp;📅 ' + _esc(s.date||'—') + (s.cost?' &nbsp;💰 S/ '+_esc(s.cost):'') + '</div>' +
        (s.notes ? '<div class="fp-card-row">📝 ' + _esc(s.notes) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  /* ── CERRAR PANEL ───────────────────────────────────────────────── */
  function closePanel(id){
    var idx = _panels.findIndex(function(p){ return p.id === id; });
    if(idx < 0) return;
    var el = document.getElementById(id);
    if(el){
      el.style.transition = 'opacity .15s,transform .15s';
      el.style.opacity = '0';
      el.style.transform = 'scale(.95)';
      setTimeout(function(){ if(el) el.remove(); }, 150);
    }
    _panels.splice(idx, 1);
  }

  /* ── DRAG ───────────────────────────────────────────────────────── */
  function _makeDraggable(panel, handle, id){
    var dragging = false, sx, sy, ox, oy;
    handle.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      // No arrastrar si el clic fue en el body (scroll), botón, o resize handle
      if(e.target.closest('.fp-body,.fp-close,.fp-resize')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = parseInt(panel.style.left)||0;
      oy = parseInt(panel.style.top)||0;
      panel.style.transition = 'none';
      panel.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e){
      if(!dragging) return;
      var nl = Math.max(0, Math.min(ox + e.clientX - sx, window.innerWidth - panel.offsetWidth));
      var nt = Math.max(0, Math.min(oy + e.clientY - sy, window.innerHeight - 60));
      panel.style.left = nl + 'px';
      panel.style.top  = nt + 'px';
    });
    document.addEventListener('mouseup', function(){
      if(dragging){
        dragging = false;
        panel.style.cursor = '';
      }
    });
  }

  /* ── LONG PRESS EN CHIPS ─────────────────────────────────────────── */
  var _pressTimer = null;
  var _pressEl    = null;
  var _pressStartX = 0;
  var _pressStartY = 0;

  function _bindChips(){
    document.addEventListener('mousedown', function(e){
      var chip = e.target.closest('.chip');
      if(!chip || chip.id === 'chipTodos') return;
      if(e.button !== 0) return;

      _pressEl = chip;
      _pressStartX = e.clientX;
      _pressStartY = e.clientY;
      clearTimeout(_pressTimer);
      _pressTimer = setTimeout(function(){
        var label = chip.textContent.trim().replace(/[⚙️]/g,'').trim();
        // Limpiar emojis del label para comparar con S.shipments
        var cleanLabel = '';
        // Buscar el label real en allStatuses
        if(window.S && window.S.labels){
          window.S.labels.forEach(function(l){
            if(chip.innerHTML.includes(l)) cleanLabel = l;
          });
        }
        if(!cleanLabel){
          // Fallback: buscar en FIXED_LABELS
          var fixed = ['NUEVO PEDIDO','EN PROCESO','POR ALISTAR','ALISTADO','ENVIADO','LLEGÓ A DESTINO','PENDIENTE DE PAGO','FINALIZADO'];
          fixed.forEach(function(l){
            if(chip.innerHTML.includes(l)) cleanLabel = l;
          });
        }
        if(!cleanLabel) return;

        // Verificar que no existe ya un panel con este label
        var exists = _panels.find(function(p){ return p.label === cleanLabel; });
        if(exists){
          // Si ya existe, traer al frente
          var el = document.getElementById(exists.id);
          if(el) el.style.zIndex = _zBase + _panels.length + 10;
          return;
        }

        var icon = chip.textContent.trim().split(' ')[0];
        createPanel(cleanLabel, icon);

        // Hint primera vez
        if(!localStorage.getItem('tt_fp_hint')){
          var hint = document.createElement('div');
          hint.className = 'fp-hint';
          hint.textContent = '✅ Panel flotante creado — arrastra desde la barra superior';
          document.body.appendChild(hint);
          setTimeout(function(){ hint.remove(); }, 3000);
          localStorage.setItem('tt_fp_hint','1');
        }
      }, 600); // 600ms de clic sostenido
    });

    document.addEventListener('mouseup', function(){
      clearTimeout(_pressTimer);
      _pressEl = null;
    });

    document.addEventListener('mousemove', function(e){
      if(!_pressEl) return;
      var dx = Math.abs(e.clientX - _pressStartX);
      var dy = Math.abs(e.clientY - _pressStartY);
      // Solo cancelar si se movió más de 8px
      if(dx > 8 || dy > 8){
        clearTimeout(_pressTimer);
        _pressEl = null;
      }
    });
  }

  /* ── SYNC CON WINDOW.S ──────────────────────────────────────────── */
  // Cada vez que render() se llama, actualizar todos los paneles
  var _origRender = null;
  function _hookRender(){
    // Intentar hookear render() — puede no existir aún, reintentar
    if(typeof window.render !== 'function'){
      setTimeout(_hookRender, 300);
      return;
    }
    if(_origRender) return;
    _origRender = window.render;
    window.render = function(){
      _origRender.apply(this, arguments);
      _panels.forEach(_renderPanel);
    };
  }

  /* ── HELPER ─────────────────────────────────────────────────────── */
  function _esc(s){
    return String(s||'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;');
  }

  /* ── RESIZE DESDE BORDES ────────────────────────────────────────── */
  function _makeResizable(panel){
    var EDGE = 8; // px de margen para detectar borde
    var resizing = false;
    var edge = ''; // 'se','s','e','sw','w','ne','n','nw'
    var sx, sy, sw, sh, sl, st;

    function _getEdge(e){
      var r = panel.getBoundingClientRect();
      var x = e.clientX - r.left;
      var y = e.clientY - r.top;
      var w = r.width; var h = r.height;
      var onL = x < EDGE;
      var onR = x > w - EDGE;
      var onT = y < EDGE;
      var onB = y > h - EDGE;
      if(onR && onB) return 'se';
      if(onL && onB) return 'sw';
      if(onR && onT) return 'ne';
      if(onL && onT) return 'nw';
      if(onB) return 's';
      if(onR) return 'e';
      if(onL) return 'w';
      if(onT) return 'n';
      return '';
    }

    var cursorMap = {se:'se-resize',sw:'sw-resize',ne:'ne-resize',nw:'nw-resize',
                     s:'s-resize',n:'n-resize',e:'e-resize',w:'w-resize',''    :''};

    panel.addEventListener('mousemove', function(e){
      if(resizing) return;
      if(e.target.closest('.fp-body,.fp-close')) return;
      var ed = _getEdge(e);
      panel.style.cursor = ed ? cursorMap[ed] : 'grab';
    });

    panel.addEventListener('mousedown', function(e){
      if(e.button !== 0) return;
      if(e.target.closest('.fp-body,.fp-close')) return;
      var ed = _getEdge(e);
      if(!ed) return; // dejar que el drag maneje el movimiento
      resizing = true;
      edge = ed;
      sx = e.clientX; sy = e.clientY;
      sw = panel.offsetWidth;
      sh = panel.offsetHeight;
      sl = parseInt(panel.style.left)||0;
      st = parseInt(panel.style.top)||0;
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', function(e){
      if(!resizing) return;
      var dx = e.clientX - sx;
      var dy = e.clientY - sy;
      var nw = sw, nh = sh, nl = sl, nt = st;
      if(edge.includes('e')) nw = Math.max(220, Math.min(700, sw + dx));
      if(edge.includes('s')) nh = Math.max(120, Math.min(window.innerHeight*0.9, sh + dy));
      if(edge.includes('w')){ nw = Math.max(220, sw - dx); nl = sl + (sw - nw); }
      if(edge.includes('n')){ nh = Math.max(120, sh - dy); nt = st + (sh - nh); }
      panel.style.width     = nw + 'px';
      panel.style.height    = nh + 'px';
      panel.style.maxHeight = 'none';
      panel.style.left      = nl + 'px';
      panel.style.top       = nt + 'px';
    });

    document.addEventListener('mouseup', function(){
      if(resizing){ resizing = false; edge = ''; }
    });
  }

  /* ── API PÚBLICA ─────────────────────────────────────────────────── */
  window.FloatPanel = {
    open:  function(label, icon){ createPanel(label, icon||'📦'); },
    close: closePanel,
    closeAll: function(){ _panels.slice().forEach(function(p){ closePanel(p.id); }); },
    refresh: function(){ _panels.forEach(_renderPanel); }
  };

  /* ── INIT ───────────────────────────────────────────────────────── */
  function init(){
    _bindChips();
    _hookRender();
    _fixChipsScroll();

    // Hint de uso si es primera visita en PC
    if(!localStorage.getItem('tt_fp_hint')){
      setTimeout(function(){
        var chips = document.querySelectorAll('#filterChips .chip');
        chips.forEach(function(c){ c.setAttribute('data-fp-ready','1'); });
      }, 1000);
    }
  }

  function _fixChipsScroll(){
    var container = document.getElementById('filterChips');
    if(!container) return;

    // Crear flechas
    var wrap = container.parentElement;
    if(!wrap) return;

    // Poner el wrap en posición relativa
    wrap.style.position = 'relative';

    // Flecha izquierda
    var btnL = document.createElement('button');
    btnL.innerHTML = '&#8249;';
    btnL.style.cssText = 'position:absolute;left:0;top:50%;transform:translateY(-50%);'+
      'z-index:10;background:linear-gradient(to right,var(--bg,#0d1117) 60%,transparent);'+
      'border:none;color:#8b949e;font-size:22px;font-weight:900;cursor:pointer;'+
      'padding:0 8px 0 2px;height:100%;display:none;align-items:center;line-height:1;font-family:inherit';
    btnL.id = 'chipScrollL';

    // Flecha derecha
    var btnR = document.createElement('button');
    btnR.innerHTML = '&#8250;';
    btnR.style.cssText = 'position:absolute;right:0;top:50%;transform:translateY(-50%);'+
      'z-index:10;background:linear-gradient(to left,var(--bg,#0d1117) 60%,transparent);'+
      'border:none;color:#e6edf3;font-size:22px;font-weight:900;cursor:pointer;'+
      'padding:0 2px 0 8px;height:100%;display:flex;align-items:center;line-height:1;font-family:inherit';
    btnR.id = 'chipScrollR';

    wrap.appendChild(btnL);
    wrap.appendChild(btnR);

    // Click en flechas
    btnL.addEventListener('click', function(){ container.scrollLeft -= 120; });
    btnR.addEventListener('click', function(){ container.scrollLeft += 120; });

    // Mostrar/ocultar flechas según posición del scroll
    function updateArrows(){
      var canLeft  = container.scrollLeft > 5;
      var canRight = container.scrollLeft < container.scrollWidth - container.clientWidth - 5;
      btnL.style.display = canLeft  ? 'flex' : 'none';
      btnR.style.display = canRight ? 'flex' : 'none';
    }

    container.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);
    setTimeout(updateArrows, 300);

    // Rueda del mouse también funciona
    container.addEventListener('wheel', function(e){
      if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
        e.preventDefault();
        container.scrollLeft += e.deltaY;
        updateArrows();
      }
    }, {passive:false});
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(init, 500);
    });
  } else {
    setTimeout(init, 500);
  }

})();
