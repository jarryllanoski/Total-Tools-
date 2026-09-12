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

  /* ── CARRUSEL DE ETIQUETAS · las flechas ‹ › ─────────────────────────
     Las flechas avanzaban 120 px fijos. Las etiquetas miden desde "TODOS"
     (~60 px) hasta "RECLAMOS, DEVOLUCIONES, GARANT" (~230 px), así que ese
     salto no tenía relación con dónde empieza o acaba ninguna: a veces
     pasaba casi dos y a veces dejaba media cortada.

     Ahora la flecha va a la etiqueta SIGUIENTE: se miden dónde empiezan y
     se salta a la primera que esté más allá de donde estás.

     POR QUÉ NO `::scroll-button()` (2026-09): existe, hace esto sin una
     línea de JavaScript y es lo que recomiendan los artículos de este año,
     pero solo funciona en Chrome/Edge 135+ — no es Baseline. En los
     navegadores sin soporte las flechas simplemente no existirían y nadie
     sabría por qué. Cuando sea Baseline, esto se puede borrar casi entero.
     Lo que sí se usa es la mitad universal: CSS Scroll Snap (panel.css).  */
  function _fixChipsScroll(){
    var carrusel = document.getElementById('filterChips');
    if(!carrusel) return;
    if(document.getElementById('chipsNav')) return;   // no duplicar flechas
    var fila = carrusel.parentElement;
    if(!fila) return;

    /* Envoltura propia para el carrusel. Antes las flechas se posicionaban
       sobre TODA la fila, y la izquierda tapaba los ~25 px iniciales del
       chip TODOS: ahí dejaba de responder al toque. Ahora `left:0` es el
       borde del carrusel, no el de la fila. */
    var nav = document.createElement('div');
    nav.id = 'chipsNav';
    nav.style.cssText = 'position:relative;flex:1;min-width:0;display:flex';
    fila.insertBefore(nav, carrusel);
    nav.appendChild(carrusel);
    carrusel.style.flex = '1';
    carrusel.style.minWidth = '0';
    carrusel.style.margin = '0';

    var btnL = _flecha('chipScrollL', '&#8249;', 'left',
      'Etiqueta anterior', 'to right', '#8b949e');
    var btnR = _flecha('chipScrollR', '&#8250;', 'right',
      'Etiqueta siguiente', 'to left', '#e6edf3');
    nav.appendChild(btnL);
    nav.appendChild(btnR);

    /* Dónde empieza cada etiqueta DENTRO del contenido desplazable.
       Se mide con rectángulos y no con `offsetLeft` a propósito:
       `offsetLeft` cuenta desde el ancestro posicionado, y basta que
       alguien cambie un `position` en el CSS de al lado para que empiece a
       devolver otra cosa —sin error, solo mal. Son ~11 etiquetas: medirlas
       no cuesta nada. */
    function _inicios(){
      var base = carrusel.getBoundingClientRect().left - carrusel.scrollLeft;
      var out = [];
      for(var i=0;i<carrusel.children.length;i++){
        out.push(carrusel.children[i].getBoundingClientRect().left - base);
      }
      return out;
    }

    function _tope(){
      return Math.max(0, carrusel.scrollWidth - carrusel.clientWidth);
    }

    /* El objetivo en vuelo. Sin esto, pulsar tres veces rápido calcularía
       desde una posición EN MOVIMIENTO (la animación suave dura ~400 ms) y
       no avanzaría tres etiquetas, sino lo que saliera. Mientras navegas
       con las flechas manda el objetivo; en cuanto tocas con el dedo o la
       rueda, vuelve a mandar la pantalla. */
    var _obj = null, _objTimer = null;
    function _soltarObjetivo(){ _obj = null; clearTimeout(_objTimer); }

    function _suave(){
      try{
        return !(window.matchMedia &&
                 matchMedia('(prefers-reduced-motion: reduce)').matches);
      }catch(e){ return true; }
    }

    function mover(dir){
      var desde = (_obj !== null) ? _obj : carrusel.scrollLeft;
      var destino = ChipsNav._destinoDesde(_inicios(), desde, _tope(), dir);
      if(destino === null) return;
      _obj = destino;
      clearTimeout(_objTimer);
      _objTimer = setTimeout(_soltarObjetivo, 600);
      carrusel.scrollTo({left: destino, behavior: _suave() ? 'smooth' : 'auto'});
      updateArrows();
    }

    btnL.addEventListener('click', function(){ mover(-1); });
    btnR.addEventListener('click', function(){ mover(1); });

    function updateArrows(){
      var canLeft  = carrusel.scrollLeft > 5;
      var canRight = carrusel.scrollLeft < _tope() - 5;
      btnL.style.display = canLeft  ? 'flex' : 'none';
      btnR.style.display = canRight ? 'flex' : 'none';
    }

    carrusel.addEventListener('scroll', updateArrows);
    window.addEventListener('resize', updateArrows);

    /* Las flechas también hay que re-evaluarlas cuando CAMBIAN las
       etiquetas —agregar una en Config, o cualquier renderChips()— porque
       ahí cambia el ancho del contenido sin que nadie haga scroll ni
       redimensione. Antes solo escuchaban scroll y resize, así que podía
       quedar la flecha derecha escondida habiendo más etiquetas. */
    try{
      new MutationObserver(function(){ updateArrows(); ChipsNav.verActivo(); })
        .observe(carrusel, {childList:true});
      new ResizeObserver(updateArrows).observe(carrusel);
    }catch(e){ /* navegador viejo: quedan scroll y resize */ }

    // El dedo y la rueda devuelven el mando a la pantalla.
    carrusel.addEventListener('wheel', function(e){
      _soltarObjetivo();
      if(Math.abs(e.deltaY) > Math.abs(e.deltaX)){
        e.preventDefault();
        carrusel.scrollLeft += e.deltaY;
        updateArrows();
      }
    }, {passive:false});
    carrusel.addEventListener('touchstart', _soltarObjetivo, {passive:true});

    /* Trae el chip activo a la vista si se quedó fuera —por ejemplo al
       elegir una etiqueta desde el listado completo—. Mueve SOLO el
       carrusel: `scrollIntoView` habría podido desplazar la página entera
       hacia arriba o abajo, que no es lo que nadie pidió. */
    ChipsNav.verActivo = function(){
      var act = carrusel.querySelector('.chip.active');
      if(!act) return;
      var r = act.getBoundingClientRect(), c = carrusel.getBoundingClientRect();
      var d = 0;
      if(r.left  < c.left)  d = (r.left  - c.left)  - 8;
      else if(r.right > c.right) d = (r.right - c.right) + 8;
      if(!d) return;   // ya se ve entera: no se mueve nada
      _soltarObjetivo();
      carrusel.scrollTo({left: Math.max(0, Math.min(_tope(), carrusel.scrollLeft + d)),
                         behavior: _suave() ? 'smooth' : 'auto'});
    };

    setTimeout(function(){ updateArrows(); ChipsNav.verActivo(); }, 300);
  }

  function _flecha(id, glifo, lado, etiqueta, degradado, color){
    var b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.innerHTML = glifo;
    b.setAttribute('aria-label', etiqueta);
    b.title = etiqueta;
    b.style.cssText = 'position:absolute;' + lado + ':0;top:0;bottom:0;' +
      'z-index:10;background:linear-gradient(' + degradado +
      ',var(--bg,#0d1117) 60%,transparent);border:none;color:' + color + ';' +
      'font-size:22px;font-weight:900;cursor:pointer;' +
      'padding:0 ' + (lado === 'left' ? '8px 0 2px' : '2px 0 8px') + ';' +
      'display:none;align-items:center;line-height:1;font-family:inherit';
    return b;
  }

  /* La decisión, sin DOM de por medio: dadas las posiciones donde empieza
     cada etiqueta, dónde estoy y hasta dónde se puede desplazar, ¿a qué
     posición hay que ir? Separada para poder probarla entera. */
  var ChipsNav = {
    _destinoDesde: function(inicios, x, tope, dir){
      var EPS = 2, i;
      if(dir > 0){
        if(x >= tope - 1) return null;              // ya está al final
        for(i = 0; i < inicios.length; i++){
          if(inicios[i] > x + EPS) return Math.min(inicios[i], tope);
        }
        return null;
      }
      var prev = null;
      for(i = 0; i < inicios.length; i++){
        if(inicios[i] < x - EPS) prev = inicios[i]; else break;
      }
      return prev;
    },
    verActivo: function(){}   // lo reemplaza _fixChipsScroll al montarse
  };
  window.ChipsNav = ChipsNav;

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      setTimeout(init, 500);
    });
  } else {
    setTimeout(init, 500);
  }

})();
