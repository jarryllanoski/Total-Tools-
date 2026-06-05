/**
 * delivery.js — Módulo de Rutas DELIVERY para Total Tools v2
 * ===========================================================
 * - Panel lateral derecho en PC, overlay en mobile
 * - Solo pedidos DELIVERY no finalizados
 * - Tap en dirección → Google Maps
 * - Driver con nombre + teléfono → WhatsApp / llamada
 * - Botón Entregar al lado del nombre
 * - Confirmar entrega → FINALIZADO automático
 * - Contador en header del grupo DELIVERY
 */
(function(global){
'use strict';

/* ══════════════════════════════════════════════
   API PÚBLICA — declaración anticipada
══════════════════════════════════════════════ */
var DeliveryModule = {};

/* ══════════════════════════════════════════════
   ESTADO
══════════════════════════════════════════════ */
var _currentShipId = null;
var _fotoBase64    = null;
var _signCtx       = null;
var _signCanvas    = null;
var _signing       = false;
var _drivers       = [];

function _loadDrivers(){
  try { _drivers = JSON.parse(localStorage.getItem('tt_drivers')||'[]'); } catch(e){ _drivers=[]; }
}
function _saveDrivers(){
  try { localStorage.setItem('tt_drivers', JSON.stringify(_drivers)); } catch(e){}
}

/* ══════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════ */
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _getDeliveryShipments(){
  var ships = global.S && global.S.shipments ? global.S.shipments : [];
  return ships.filter(function(s){
    return s.courier && s.courier.toUpperCase().includes('DELIVERY') && s.status !== 'FINALIZADO';
  });
}

function _mapsUrl(ship){
  if(ship.gpsCoords) return 'https://maps.google.com/?q=' + ship.gpsCoords;
  var addr = [ship.address, ship.referencia].filter(Boolean).join(', ');
  return 'https://maps.google.com/?q=' + encodeURIComponent(addr);
}

function _isPC(){
  return window.matchMedia && window.matchMedia('(pointer: fine)').matches && window.innerWidth > 600;
}

/* ══════════════════════════════════════════════
   CSS
══════════════════════════════════════════════ */
function _injectCSS(){
  if(document.getElementById('deliveryCSS')) return;
  var s = document.createElement('style');
  s.id = 'deliveryCSS';
  s.textContent = [
    /* Panel lateral PC / overlay mobile */
    '#dlvPanel{display:none;position:fixed;top:0;right:0;bottom:0;z-index:800;background:#161b22;border-left:1px solid #30363d;flex-direction:column;box-shadow:-8px 0 32px rgba(0,0,0,.6);transition:transform .25s ease}',
    '#dlvPanel.open{display:flex}',
    /* En PC: panel lateral de 380px */
    '@media(min-width:600px){#dlvPanel{width:380px}}',
    /* En mobile: pantalla completa */
    '@media(max-width:599px){#dlvPanel{width:100%;border-left:none}}',

    '#dlvHeader{background:#1c2333;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #30363d;flex-shrink:0}',
    '#dlvBody{flex:1;overflow-y:auto;padding:12px 14px}',

    /* Stats */
    '#dlvStats{display:flex;gap:12px;margin-bottom:12px;background:#1c2333;border-radius:10px;padding:10px 14px}',
    '.dlv-stat{text-align:center;flex:1}',
    '.dlv-stat-n{font-size:18px;font-weight:800;font-family:Syne,sans-serif}',
    '.dlv-stat-l{font-size:9px;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}',

    /* Cards */
    '.dlv-card{background:#0d1117;border:1px solid #30363d;border-radius:11px;margin-bottom:9px;overflow:hidden}',
    '.dlv-card-hdr{display:flex;align-items:center;gap:9px;padding:10px 12px;border-bottom:1px solid #30363d}',
    '.dlv-num{width:26px;height:26px;border-radius:50%;background:var(--blue);color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
    '.dlv-name{flex:1;font-size:13px;font-weight:700;color:#e6edf3;line-height:1.3}',
    '.dlv-btn-entregar{padding:6px 12px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--green),#1a7f37);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0}',
    '.dlv-card-body{padding:10px 12px}',
    '.dlv-addr{font-size:12px;color:var(--blue);margin-bottom:8px;line-height:1.5;cursor:pointer;text-decoration:underline;text-underline-offset:2px}',
    '.dlv-addr:active{opacity:.7}',
    '.dlv-meta{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}',
    '.dlv-meta span{font-size:11px;color:#8b949e}',

    /* Driver badge */
    '.dlv-driver-row{display:flex;align-items:center;gap:6px;background:rgba(163,113,247,.08);border:1px solid rgba(163,113,247,.2);border-radius:8px;padding:6px 10px;margin-bottom:8px;cursor:pointer}',
    '.dlv-driver-info{flex:1;min-width:0}',
    '.dlv-driver-name{font-size:12px;font-weight:700;color:#a371f7}',
    '.dlv-driver-phone{font-size:10px;color:#8b949e}',
    '.dlv-driver-actions{display:flex;gap:5px;flex-shrink:0}',
    '.dlv-driver-act{width:28px;height:28px;border-radius:7px;border:none;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.dlv-driver-wa{background:rgba(37,211,102,.15);color:#25d366}',
    '.dlv-driver-call{background:rgba(56,139,253,.15);color:var(--blue)}',
    '.dlv-add-driver{font-size:11px;color:#8b949e;background:rgba(163,113,247,.08);border:1px dashed rgba(163,113,247,.3);border-radius:8px;padding:6px 10px;margin-bottom:8px;cursor:pointer;width:100%;text-align:left;font-family:inherit}',

    /* Overlay confirmar entrega */
    '#dlvConfirmOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.9);z-index:900;align-items:flex-end;justify-content:center}',
    '#dlvConfirmOv.open{display:flex}',
    '#dlvConfirmSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:dlvUp .2s ease;max-height:90vh;overflow-y:auto}',
    '@keyframes dlvUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
    '#dlvSignCanvas{width:100%;height:140px;background:#0d1117;border:1px solid #30363d;border-radius:10px;touch-action:none;cursor:crosshair;display:block}',
    '#dlvPhotoPreview{width:100%;max-height:160px;object-fit:contain;border-radius:10px;display:none;margin-top:8px;background:#0d1117}',

    /* Overlay driver */
    '#dlvDriverOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:950;align-items:flex-end;justify-content:center}',
    '#dlvDriverOv.open{display:flex}',
    '#dlvDriverSheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:dlvUp .2s ease}',

    /* Badge en header grupo */
    '.dlv-pending-badge{background:rgba(56,139,253,.2);color:var(--blue);border:1px solid rgba(56,139,253,.35);border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;margin-left:6px}',
  ].join('');
  document.head.appendChild(s);
}

/* ══════════════════════════════════════════════
   OVERLAYS HTML
══════════════════════════════════════════════ */
function _injectOverlays(){
  if(document.getElementById('dlvPanel')) return;

  // Panel principal
  var panel = document.createElement('div');
  panel.id = 'dlvPanel';
  panel.innerHTML =
    '<div id="dlvHeader">' +
      '<div>' +
        '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;color:#e6edf3">🛵 Ruta DELIVERY</div>' +
        '<div id="dlvSubtitle" style="font-size:10px;color:#8b949e;margin-top:1px"></div>' +
      '</div>' +
      '<button onclick="DeliveryModule.cerrar()" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:#f78166;border-radius:8px;width:32px;height:32px;font-size:15px;cursor:pointer">✕</button>' +
    '</div>' +
    '<div id="dlvBody"><div id="dlvStats"></div><div id="dlvList"></div></div>';
  document.body.appendChild(panel);

  // Overlay confirmar entrega
  var ovC = document.createElement('div');
  ovC.id = 'dlvConfirmOv';
  ovC.innerHTML =
    '<div id="dlvConfirmSheet">' +
      '<div style="width:36px;height:4px;background:#30363d;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:4px">📦 Confirmar entrega</div>' +
      '<div id="dlvConfirmName" style="font-size:12px;color:#8b949e;margin-bottom:14px"></div>' +
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px">RECIBIDO POR *</div>' +
      '<input id="dlvReceptor" class="fi" placeholder="Nombre de quien recibe" style="margin-bottom:12px">' +
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px">FOTO DE LA ENTREGA</div>' +
      '<button onclick="DeliveryModule._tomarFoto()" style="width:100%;padding:11px;background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);border-radius:10px;color:var(--blue);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">📷 Tomar foto</button>' +
      '<input type="file" id="dlvFotoInput" accept="image/*" capture="environment" style="display:none" onchange="DeliveryModule._onFoto(this)">' +
      '<img id="dlvPhotoPreview" alt="foto entrega">' +
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin:12px 0 6px;display:flex;justify-content:space-between;align-items:center">' +
        '<span>FIRMA DEL CLIENTE</span>' +
        '<button onclick="DeliveryModule._limpiarFirma()" style="background:none;border:none;color:#8b949e;font-size:11px;cursor:pointer">🗑️ Limpiar</button>' +
      '</div>' +
      '<canvas id="dlvSignCanvas"></canvas>' +
      '<div style="font-size:10px;color:#8b949e;text-align:center;margin-top:4px;margin-bottom:14px">Deslizá el dedo para firmar</div>' +
      '<div style="display:flex;gap:9px">' +
        '<button onclick="DeliveryModule._cerrarConfirm()" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>' +
        '<button onclick="DeliveryModule._confirmarEntrega()" style="flex:2;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmar entrega</button>' +
      '</div>' +
    '</div>';
  ovC.addEventListener('click', function(e){ if(e.target===ovC) DeliveryModule._cerrarConfirm(); });
  document.body.appendChild(ovC);

  // Overlay driver
  var ovD = document.createElement('div');
  ovD.id = 'dlvDriverOv';
  ovD.innerHTML =
    '<div id="dlvDriverSheet">' +
      '<div style="width:36px;height:4px;background:#30363d;border-radius:2px;margin:0 auto 14px"></div>' +
      '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:12px">🛵 Asignar motorizado</div>' +
      '<div id="dlvDriverList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;max-height:220px;overflow-y:auto"></div>' +
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">AGREGAR NUEVO</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:8px">' +
        '<input id="dlvNewDriverName" class="fi" placeholder="Nombre del motorizado..." style="flex:1">' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-bottom:12px">' +
        '<input id="dlvNewDriverPhone" class="fi" placeholder="Teléfono (opcional)" inputmode="numeric" maxlength="9" style="flex:1">' +
        '<button onclick="DeliveryModule._addDriver()" style="background:var(--blue);border:none;border-radius:8px;color:#fff;padding:0 16px;font-weight:700;cursor:pointer;font-size:18px">+</button>' +
      '</div>' +
      '<button onclick="DeliveryModule._cerrarDriver()" style="width:100%;padding:11px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button>' +
    '</div>';
  ovD.addEventListener('click', function(e){ if(e.target===ovD) DeliveryModule._cerrarDriver(); });
  document.body.appendChild(ovD);
}

/* ══════════════════════════════════════════════
   RENDER
══════════════════════════════════════════════ */
function _renderList(){
  var ships  = _getDeliveryShipments();
  var total  = ships.length;
  var done   = ships.filter(function(s){ return s._dlvDone; }).length;
  var pend   = total - done;

  var stats    = document.getElementById('dlvStats');
  var subtitle = document.getElementById('dlvSubtitle');
  if(stats) stats.innerHTML =
    '<div class="dlv-stat"><div class="dlv-stat-n" style="color:var(--blue)">' + total + '</div><div class="dlv-stat-l">Total</div></div>' +
    '<div class="dlv-stat"><div class="dlv-stat-n" style="color:#f59e0b">' + pend + '</div><div class="dlv-stat-l">Pendientes</div></div>' +
    '<div class="dlv-stat"><div class="dlv-stat-n" style="color:var(--green)">' + done + '</div><div class="dlv-stat-l">Entregados</div></div>';
  if(subtitle) subtitle.textContent = pend + ' pendiente' + (pend!==1?'s':'');

  var list = document.getElementById('dlvList');
  if(!list) return;

  if(!ships.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#8b949e;font-size:13px">📭 Sin pedidos DELIVERY pendientes</div>';
    return;
  }

  list.innerHTML = ships.map(function(s, i){
    var driver     = s._dlvDriver || null;
    var driverPhone= s._dlvDriverPhone || '';
    var hasGps     = !!s.gpsCoords;
    var addr       = [s.address, s.referencia].filter(Boolean).join(' · ') || '—';
    var isDone     = !!s._dlvDone;

    var driverHtml = '';
    if(driver){
      driverHtml =
        '<div class="dlv-driver-row" onclick="DeliveryModule._abrirDriver(\'' + s.id + '\')">' +
          '<span style="font-size:16px">🛵</span>' +
          '<div class="dlv-driver-info">' +
            '<div class="dlv-driver-name">' + _esc(driver) + '</div>' +
            (driverPhone ? '<div class="dlv-driver-phone">📞 ' + _esc(driverPhone) + '</div>' : '') +
          '</div>' +
          '<div class="dlv-driver-actions">' +
            (driverPhone
              ? '<button class="dlv-driver-act dlv-driver-wa" onclick="event.stopPropagation();window.open(\'https://wa.me/51' + driverPhone + '\',\'_blank\')" title="WhatsApp">💬</button>' +
                '<button class="dlv-driver-act dlv-driver-call" onclick="event.stopPropagation();window.open(\'tel:' + driverPhone + '\')" title="Llamar">📞</button>'
              : '') +
          '</div>' +
        '</div>';
    } else {
      driverHtml = '<button class="dlv-add-driver" onclick="DeliveryModule._abrirDriver(\'' + s.id + '\')">🛵 + Asignar motorizado</button>';
    }

    return '<div class="dlv-card" id="dlvcard_' + s.id + '">' +
      '<div class="dlv-card-hdr">' +
        '<div class="dlv-num" style="background:' + (isDone?'var(--green)':'var(--blue)') + '">' + (isDone?'✓':(i+1)) + '</div>' +
        '<div class="dlv-name">' + _esc(s.name) + (s.cost ? '<div style="font-size:10px;color:#8b949e;font-weight:400">S/ '+_esc(s.cost)+'</div>' : '') + '</div>' +
        (!isDone ? '<button class="dlv-btn-entregar" onclick="DeliveryModule._abrirConfirm(\'' + s.id + '\')">📦 Entregar</button>' :
          '<span style="font-size:11px;color:var(--green);font-weight:700">✅ Listo</span>') +
      '</div>' +
      '<div class="dlv-card-body">' +
        '<div class="dlv-addr" onclick="window.open(\'' + _mapsUrl(s) + '\',\'_blank\')">' +
          (hasGps?'📍 ':'🏠 ') + _esc(addr) +
        '</div>' +
        '<div class="dlv-meta">' +
          '<span>📞 ' + _esc(s.phone||'—') + '</span>' +
          (s.date?'<span>📅 ' + _esc(s.date) + '</span>':'') +
          '<span style="color:' + (isDone?'var(--green)':'#f59e0b') + '">' + _esc(s.status) + '</span>' +
        '</div>' +
        (!isDone ? driverHtml : '') +
      '</div>' +
    '</div>';
  }).join('');
}

/* ══════════════════════════════════════════════
   ACCIONES — DRIVER
══════════════════════════════════════════════ */
DeliveryModule._abrirDriver = function(shipId){
  _currentShipId = shipId;
  _loadDrivers();
  var ship    = (global.S&&global.S.shipments||[]).find(function(x){ return x.id===shipId; });
  var current = ship ? (ship._dlvDriver||'') : '';
  var list    = document.getElementById('dlvDriverList');
  if(list){
    list.innerHTML = _drivers.length
      ? _drivers.map(function(d){
          var sel = current === d.name;
          return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:' +
            (sel?'rgba(163,113,247,.15)':'#1c2333') + ';border:1px solid ' +
            (sel?'rgba(163,113,247,.4)':'#30363d') + ';border-radius:9px;cursor:pointer" onclick="DeliveryModule._selDriver(' +
            JSON.stringify(d.name) + ',' + JSON.stringify(d.phone||'') + ')">' +
            '<span style="font-size:16px">🛵</span>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600">' + _esc(d.name) + '</div>' +
            (d.phone?'<div style="font-size:11px;color:#8b949e">📞 ' + _esc(d.phone) + '</div>':'') + '</div>' +
            (sel?'<span style="color:var(--green)">✓</span>':'') +
            '<button onclick="event.stopPropagation();DeliveryModule._delDriver(' + JSON.stringify(d.name) + ')" style="background:none;border:none;color:#f78166;cursor:pointer;font-size:14px">✕</button>' +
            '</div>';
        }).join('')
      : '<div style="text-align:center;padding:16px;color:#8b949e;font-size:12px">Sin motorizados. Agrega uno abajo.</div>';
  }
  document.getElementById('dlvDriverOv').classList.add('open');
};

DeliveryModule._addDriver = function(){
  var nameInp  = document.getElementById('dlvNewDriverName');
  var phoneInp = document.getElementById('dlvNewDriverPhone');
  var name  = (nameInp&&nameInp.value||'').trim();
  var phone = (phoneInp&&phoneInp.value||'').trim();
  if(!name){ if(typeof global.toast==='function') global.toast('⚠️ Escribe el nombre'); return; }
  if(!_drivers.find(function(d){ return d.name===name; })){
    _drivers.push({name:name, phone:phone});
    _saveDrivers();
  }
  if(nameInp) nameInp.value='';
  if(phoneInp) phoneInp.value='';
  DeliveryModule._abrirDriver(_currentShipId);
};

DeliveryModule._delDriver = function(name){
  _drivers = _drivers.filter(function(d){ return d.name!==name; });
  _saveDrivers();
  DeliveryModule._abrirDriver(_currentShipId);
};

DeliveryModule._selDriver = function(name, phone){
  var ship = (global.S&&global.S.shipments||[]).find(function(x){ return x.id===_currentShipId; });
  if(ship){ ship._dlvDriver=name; ship._dlvDriverPhone=phone||''; if(typeof global.save==='function') global.save(); }
  DeliveryModule._cerrarDriver();
  _renderList();
  if(typeof global.toast==='function') global.toast('🛵 ' + name + ' asignado');
};

DeliveryModule._cerrarDriver = function(){
  document.getElementById('dlvDriverOv').classList.remove('open');
};

/* ══════════════════════════════════════════════
   ACCIONES — CONFIRMAR ENTREGA
══════════════════════════════════════════════ */
DeliveryModule._abrirConfirm = function(shipId){
  _currentShipId = shipId;
  _fotoBase64    = null;
  _signCtx       = null;
  var ship = (global.S&&global.S.shipments||[]).find(function(x){ return x.id===shipId; });
  var nameEl = document.getElementById('dlvConfirmName');
  if(nameEl) nameEl.textContent = ship ? (ship.name + ' · ' + (ship.address||'')) : '';
  var inp = document.getElementById('dlvReceptor'); if(inp) inp.value='';
  var prev = document.getElementById('dlvPhotoPreview'); if(prev){ prev.src=''; prev.style.display='none'; }
  document.getElementById('dlvConfirmOv').classList.add('open');
  setTimeout(_initSignCanvas, 150);
};

DeliveryModule._cerrarConfirm = function(){
  document.getElementById('dlvConfirmOv').classList.remove('open');
  _currentShipId = null;
};

DeliveryModule._tomarFoto = function(){
  var inp = document.getElementById('dlvFotoInput'); if(inp) inp.click();
};

DeliveryModule._onFoto = function(input){
  var file = input.files[0]; if(!file) return;
  var r = new FileReader();
  r.onload = function(e){
    _fotoBase64 = e.target.result;
    var prev = document.getElementById('dlvPhotoPreview');
    if(prev){ prev.src=_fotoBase64; prev.style.display='block'; }
  };
  r.readAsDataURL(file);
};

DeliveryModule._limpiarFirma = function(){
  var c = document.getElementById('dlvSignCanvas');
  if(c && _signCtx) _signCtx.clearRect(0,0,c.width,c.height);
};

DeliveryModule._confirmarEntrega = function(){
  var receptor = (document.getElementById('dlvReceptor')||{value:''}).value.trim();
  if(!receptor){ if(typeof global.toast==='function') global.toast('⚠️ Escribe el nombre de quien recibe'); return; }
  var ship = (global.S&&global.S.shipments||[]).find(function(x){ return x.id===_currentShipId; });
  if(!ship) return;

  var firmaBase64 = null;
  var c = document.getElementById('dlvSignCanvas');
  if(c && _signCtx) firmaBase64 = c.toDataURL('image/png');

  ship.status       = 'FINALIZADO';
  ship._dlvDone     = true;
  ship._dlvReceptor = receptor;
  ship._dlvFecha    = new Date().toISOString();
  if(_fotoBase64)  ship._dlvFoto  = _fotoBase64;
  if(firmaBase64)  ship._dlvFirma = firmaBase64;

  if(typeof global.save   === 'function') global.save();
  if(typeof global.render === 'function') global.render();

  DeliveryModule._cerrarConfirm();
  _renderList();
  _updateGroupBadges();
  if(typeof global.toast==='function') global.toast('✅ Entregado — ' + receptor);
};

/* ══════════════════════════════════════════════
   CANVAS FIRMA
══════════════════════════════════════════════ */
function _initSignCanvas(){
  var canvas = document.getElementById('dlvSignCanvas');
  if(!canvas) return;
  canvas.width  = canvas.offsetWidth  || 320;
  canvas.height = 140;
  _signCtx = canvas.getContext('2d');
  _signCtx.strokeStyle = '#e6edf3';
  _signCtx.lineWidth   = 2.5;
  _signCtx.lineCap     = 'round';
  _signCtx.lineJoin    = 'round';

  function pos(e){ var r=canvas.getBoundingClientRect(); var t=e.touches?e.touches[0]:e; return{x:t.clientX-r.left,y:t.clientY-r.top}; }
  canvas.onmousedown  = function(e){ _signing=true; var p=pos(e); _signCtx.beginPath(); _signCtx.moveTo(p.x,p.y); };
  canvas.onmousemove  = function(e){ if(!_signing) return; var p=pos(e); _signCtx.lineTo(p.x,p.y); _signCtx.stroke(); };
  canvas.onmouseup    = function(){ _signing=false; };
  canvas.ontouchstart = function(e){ e.preventDefault(); _signing=true; var p=pos(e); _signCtx.beginPath(); _signCtx.moveTo(p.x,p.y); };
  canvas.ontouchmove  = function(e){ e.preventDefault(); if(!_signing) return; var p=pos(e); _signCtx.lineTo(p.x,p.y); _signCtx.stroke(); };
  canvas.ontouchend   = function(){ _signing=false; };
}

/* ══════════════════════════════════════════════
   BADGE EN HEADER DEL GRUPO DELIVERY
══════════════════════════════════════════════ */
function _updateGroupBadges(){
  var pend = _getDeliveryShipments().filter(function(s){ return !s._dlvDone; }).length;
  document.querySelectorAll('.cgroup-hdr').forEach(function(hdr){
    var name = hdr.querySelector('.cgroup-name');
    if(!name || !name.textContent.trim().toUpperCase().includes('DELIVERY')) return;
    var badge = hdr.querySelector('.dlv-pending-badge');
    if(pend > 0){
      if(!badge){
        badge = document.createElement('span');
        badge.className = 'dlv-pending-badge';
        name.appendChild(badge);
      }
      badge.textContent = pend + ' pendiente' + (pend!==1?'s':'');
    } else {
      if(badge) badge.remove();
    }
  });
}

/* ══════════════════════════════════════════════
   TRIPLE TAP
══════════════════════════════════════════════ */
var _tapCount = 0;
var _tapTimer = null;

function _attachTapListeners(){
  document.addEventListener('click', function(e){
    var hdr = e.target.closest('.cgroup-hdr');
    if(!hdr) return;
    var name = hdr.querySelector('.cgroup-name');
    if(!name || !name.textContent.trim().toUpperCase().includes('DELIVERY')) return;
    _tapCount++;
    clearTimeout(_tapTimer);
    _tapTimer = setTimeout(function(){
      if(_tapCount >= 3) DeliveryModule.abrir();
      _tapCount = 0;
    }, 500);
  });

  // Actualizar badges cuando se re-renderiza el panel
  var observer = new MutationObserver(function(){
    _updateGroupBadges();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ══════════════════════════════════════════════
   API PÚBLICA
══════════════════════════════════════════════ */
DeliveryModule.abrir = function(){
  _loadDrivers();
  var panel = document.getElementById('dlvPanel');
  if(!panel) return;
  panel.classList.add('open');
  _renderList();
  console.log('[Delivery] Panel abierto —', _getDeliveryShipments().length, 'pedidos');
};

DeliveryModule.cerrar = function(){
  var panel = document.getElementById('dlvPanel');
  if(panel) panel.classList.remove('open');
};

DeliveryModule.init = function(){
  _injectCSS();
  _injectOverlays();
  _loadDrivers();
  _attachTapListeners();
  console.log('[DeliveryModule] v2 listo — triple tap en DELIVERY para abrir ruta');
};

global.DeliveryModule = DeliveryModule;

if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', DeliveryModule.init);
} else {
  DeliveryModule.init();
}

})(window);
