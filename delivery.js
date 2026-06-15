/**
 * delivery.js — Módulo de Rutas DELIVERY v3
 * ==========================================
 * - Sin MutationObserver (causa congelamiento)
 * - Panel lateral en PC, overlay en mobile
 * - Solo pedidos DELIVERY no finalizados
 * - Tap en dirección → Google Maps
 * - Driver con nombre + teléfono → WhatsApp / llamada
 * - Botón Entregar al lado del nombre
 * - Confirmar entrega → FINALIZADO automático
 */
(function(global){
'use strict';

var DeliveryModule = {};

/* ── Estado ──────────────────────────────────────────────────────── */
var _currentShipId = null;
var _fotoBase64    = null;
var _signCtx       = null;
var _signing       = false;
var _drivers       = [];
var _tapCount      = 0;
var _tapTimer      = null;

function _loadDrivers(){ try{ _drivers=JSON.parse(localStorage.getItem('tt_drivers')||'[]'); }catch(e){ _drivers=[]; } }
function _saveDrivers(){ try{ localStorage.setItem('tt_drivers',JSON.stringify(_drivers)); }catch(e){} }
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _getShips(){
  return ((global.S&&global.S.shipments)||[]).filter(function(s){
    return s.courier&&s.courier.toUpperCase().includes('DELIVERY')&&s.status!=='FINALIZADO';
  });
}

function _mapsUrl(s){
  if(s.gpsCoords) return 'https://maps.google.com/?q='+s.gpsCoords;
  return 'https://maps.google.com/?q='+encodeURIComponent([s.address,s.referencia].filter(Boolean).join(', '));
}

/* ── CSS ─────────────────────────────────────────────────────────── */
function _css(){
  if(document.getElementById('dlvCSS')) return;
  var st=document.createElement('style'); st.id='dlvCSS';
  st.textContent=
    '#dlvPanel{display:none;position:fixed;top:0;right:0;bottom:0;z-index:800;background:#161b22;border-left:1px solid #30363d;flex-direction:column;box-shadow:-6px 0 24px rgba(0,0,0,.6)}'+
    '#dlvPanel.open{display:flex}'+
    '@media(min-width:600px){#dlvPanel{width:380px}}'+
    '@media(max-width:599px){#dlvPanel{width:100%;border-left:none}}'+
    '#dlvHdr{background:#1c2333;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #30363d;flex-shrink:0}'+
    '#dlvBody{flex:1;overflow-y:auto;padding:12px 14px;-webkit-overflow-scrolling:touch}'+
    '.dlvc{background:#0d1117;border:1px solid #30363d;border-radius:11px;margin-bottom:9px;overflow:hidden}'+
    '.dlvc-hdr{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #30363d}'+
    '.dlvc-num{width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}'+
    '.dlvc-name{flex:1;font-size:13px;font-weight:700;color:#e6edf3;line-height:1.3}'+
    '.dlvc-entr{padding:6px 11px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--green),#1a7f37);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'+
    '.dlvc-body{padding:10px 12px}'+
    '.dlvc-addr{font-size:12px;color:var(--blue);margin-bottom:8px;line-height:1.5;cursor:pointer;text-decoration:underline;text-underline-offset:2px;-webkit-tap-highlight-color:transparent}'+
    '.dlvc-meta{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}'+
    '.dlvc-meta span{font-size:11px;color:#8b949e}'+
    '.dlvc-drv{display:flex;align-items:center;gap:6px;background:rgba(163,113,247,.08);border:1px solid rgba(163,113,247,.2);border-radius:8px;padding:7px 10px;margin-bottom:2px;cursor:pointer}'+
    '.dlvc-drv-info{flex:1;min-width:0}'+
    '.dlvc-drv-name{font-size:12px;font-weight:700;color:#a371f7}'+
    '.dlvc-drv-phone{font-size:10px;color:#8b949e}'+
    '.dlvc-drv-btns{display:flex;gap:4px}'+
    '.dlvc-drv-btn{width:27px;height:27px;border-radius:6px;border:none;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
    '.dlvc-add-drv{font-size:11px;color:#8b949e;background:rgba(163,113,247,.06);border:1px dashed rgba(163,113,247,.25);border-radius:8px;padding:7px 10px;margin-bottom:2px;cursor:pointer;width:100%;text-align:left;font-family:inherit}'+
    '#dlvConfOv,#dlvDrvOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:900;align-items:flex-end;justify-content:center}'+
    '#dlvConfOv.open,#dlvDrvOv.open{display:flex}'+
    '.dlv-sheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:dlvUp .2s ease;max-height:88vh;overflow-y:auto}'+
    '@keyframes dlvUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'+
    '#dlvSign{width:100%;height:130px;background:#0d1117;border:1px solid #30363d;border-radius:10px;touch-action:none;cursor:crosshair;display:block}'+
    '#dlvFotoPrev{width:100%;max-height:150px;object-fit:contain;border-radius:10px;display:none;margin-top:8px;background:#0d1117}';
  document.head.appendChild(st);
}

/* ── HTML ────────────────────────────────────────────────────────── */
function _html(){
  if(document.getElementById('dlvPanel')) return;

  // Panel principal
  var p=document.createElement('div'); p.id='dlvPanel';
  p.innerHTML=
    '<div id="dlvHdr">'+
      '<div><div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px">🛵 Ruta DELIVERY</div>'+
      '<div id="dlvSub" style="font-size:10px;color:#8b949e;margin-top:1px"></div></div>'+
      '<button onclick="DeliveryModule.cerrar()" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:#f78166;border-radius:8px;width:32px;height:32px;font-size:15px;cursor:pointer">✕</button>'+
    '</div>'+
    '<div id="dlvBody"><div id="dlvStats" style="display:flex;gap:12px;margin-bottom:12px;background:#1c2333;border-radius:10px;padding:10px 14px"></div><div id="dlvList"></div></div>';
  document.body.appendChild(p);

  // Overlay confirmar entrega
  var oc=document.createElement('div'); oc.id='dlvConfOv';
  oc.innerHTML=
    '<div class="dlv-sheet">'+
      '<div style="width:36px;height:4px;background:#30363d;border-radius:2px;margin:0 auto 14px"></div>'+
      '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:4px">📦 Confirmar entrega</div>'+
      '<div id="dlvCName" style="font-size:12px;color:#8b949e;margin-bottom:12px"></div>'+
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px">RECIBIDO POR *</div>'+
      '<input id="dlvRecep" class="fi" placeholder="Nombre de quien recibe" style="margin-bottom:12px">'+
      '<button onclick="document.getElementById(\'dlvFotoInp\').click()" style="width:100%;padding:11px;background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);border-radius:10px;color:var(--blue);font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:4px">📷 Foto de entrega (opcional)</button>'+
      '<input type="file" id="dlvFotoInp" accept="image/*" capture="environment" style="display:none" onchange="DeliveryModule._foto(this)">'+
      '<img id="dlvFotoPrev" alt="">'+
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin:12px 0 6px;display:flex;justify-content:space-between;align-items:center">'+
        '<span>FIRMA DEL CLIENTE</span>'+
        '<button onclick="DeliveryModule._clearSign()" style="background:none;border:none;color:#8b949e;font-size:11px;cursor:pointer">🗑️ Limpiar</button>'+
      '</div>'+
      '<canvas id="dlvSign"></canvas>'+
      '<div style="font-size:10px;color:#8b949e;text-align:center;margin-top:4px;margin-bottom:14px">Desliza el dedo para firmar</div>'+
      '<div style="display:flex;gap:9px">'+
        '<button onclick="DeliveryModule._closeConf()" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>'+
        '<button onclick="DeliveryModule._confirmar()" style="flex:2;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmar entrega</button>'+
      '</div>'+
    '</div>';
  oc.addEventListener('click',function(e){if(e.target===oc)DeliveryModule._closeConf();});
  document.body.appendChild(oc);

  // Overlay driver
  var od=document.createElement('div'); od.id='dlvDrvOv';
  od.innerHTML=
    '<div class="dlv-sheet">'+
      '<div style="width:36px;height:4px;background:#30363d;border-radius:2px;margin:0 auto 14px"></div>'+
      '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:12px">🛵 Asignar motorizado</div>'+
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:6px">🗺️ Link de ruta (opcional)</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:6px">'+
        '<input id="dlvRutaLink" class="fi" placeholder="https://… o ubicación en vivo" inputmode="url" style="flex:1">'+
        '<button onclick="DeliveryModule._genRuta()" title="Generar ruta en Maps" style="background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.25);border-radius:8px;color:var(--blue);padding:0 12px;font-size:13px;cursor:pointer;font-family:inherit;white-space:nowrap">🗺️ Maps</button>'+
      '</div>'+
      '<button onclick="DeliveryModule._saveRuta()" style="width:100%;padding:9px;background:rgba(163,113,247,.1);border:1px solid rgba(163,113,247,.3);border-radius:8px;color:#a371f7;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin-bottom:14px">💾 Guardar link de ruta</button>'+
      '<div id="dlvDrvList" style="display:flex;flex-direction:column;gap:7px;margin-bottom:12px;max-height:200px;overflow-y:auto"></div>'+
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px">NUEVO MOTORIZADO</div>'+
      '<input id="dlvDrvName" class="fi" placeholder="Nombre..." style="margin-bottom:8px">'+
      '<div style="display:flex;gap:8px;margin-bottom:12px">'+
        '<input id="dlvDrvPhone" class="fi" placeholder="Teléfono (opcional)" inputmode="numeric" maxlength="9" style="flex:1">'+
        '<button onclick="DeliveryModule._addDrv()" style="background:var(--blue);border:none;border-radius:8px;color:#fff;padding:0 16px;font-size:18px;font-weight:700;cursor:pointer">+</button>'+
      '</div>'+
      '<button onclick="DeliveryModule._closeDrv()" style="width:100%;padding:11px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button>'+
    '</div>';
  od.addEventListener('click',function(e){if(e.target===od)DeliveryModule._closeDrv();});
  document.body.appendChild(od);
}

/* ── Render ──────────────────────────────────────────────────────── */
function _render(){
  var ships=_getShips();
  var pend=ships.filter(function(s){return !s._dlvDone;}).length;
  var done=ships.length-pend;

  var sub=document.getElementById('dlvSub');
  if(sub) sub.textContent=pend+' pendiente'+(pend!==1?'s':'');

  var stats=document.getElementById('dlvStats');
  if(stats) stats.innerHTML=
    '<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:var(--blue)">'+ships.length+'</div><div style="font-size:9px;color:#8b949e;text-transform:uppercase">Total</div></div>'+
    '<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:#f59e0b">'+pend+'</div><div style="font-size:9px;color:#8b949e;text-transform:uppercase">Pendientes</div></div>'+
    '<div style="flex:1;text-align:center"><div style="font-size:18px;font-weight:800;font-family:Syne,sans-serif;color:var(--green)">'+done+'</div><div style="font-size:9px;color:#8b949e;text-transform:uppercase">Entregados</div></div>';

  var list=document.getElementById('dlvList');
  if(!list) return;

  if(!ships.length){
    list.innerHTML='<div style="text-align:center;padding:40px;color:#8b949e;font-size:13px">📭 Sin pedidos DELIVERY pendientes</div>';
    return;
  }

  list.innerHTML=ships.map(function(s,i){
    var drv=s._dlvDriver||'';
    var drvPhone=s._dlvDriverPhone||'';
    var rutaLink=s._dlvRutaLink||'';
    var isDone=!!s._dlvDone;
    var addr=[s.address,s.referencia].filter(Boolean).join(' · ')||'—';
    var hasGps=!!s.gpsCoords;

    var drvHtml=drv
      ?'<div class="dlvc-drv" onclick="DeliveryModule._openDrv(\''+s.id+'\')">'+
          '<span style="font-size:15px">🛵</span>'+
          '<div class="dlvc-drv-info">'+
            '<div class="dlvc-drv-name">'+_esc(drv)+'</div>'+
            (drvPhone?'<div class="dlvc-drv-phone">📞 '+_esc(drvPhone)+'</div>':'')+
          '</div>'+
          '<div class="dlvc-drv-btns">'+
            (rutaLink?'<button class="dlvc-drv-btn" style="background:rgba(163,113,247,.15);color:#a371f7" onclick="event.stopPropagation();DeliveryModule._verRuta(\''+s.id+'\')" title="Ver ruta">🗺️</button>':'')+
            (drvPhone
              ?'<button class="dlvc-drv-btn" style="background:rgba(37,211,102,.15);color:#25d366" onclick="event.stopPropagation();window.open(\'https://wa.me/51'+drvPhone+'\',\'_blank\')" title="WhatsApp">💬</button>'+
               '<button class="dlvc-drv-btn" style="background:rgba(56,139,253,.15);color:var(--blue)" onclick="event.stopPropagation();window.open(\'tel:'+drvPhone+'\')" title="Llamar">📞</button>'
              :'')+
          '</div>'+
        '</div>'
      :'<button class="dlvc-add-drv" onclick="DeliveryModule._openDrv(\''+s.id+'\')">🛵 + Asignar motorizado</button>';

    return '<div class="dlvc">'+
      '<div class="dlvc-hdr">'+
        '<div class="dlvc-num" style="background:'+(isDone?'var(--green)':'var(--blue)')+'">'+
          (isDone?'✓':(i+1))+
        '</div>'+
        '<div class="dlvc-name">'+_esc(s.name)+
          (s.cost?'<div style="font-size:10px;color:#8b949e;font-weight:400">S/ '+_esc(s.cost)+'</div>':'')+
        '</div>'+
        (!isDone
          ?'<button class="dlvc-entr" onclick="DeliveryModule._openConf(\''+s.id+'\')">📦 Entregar</button>'
          :'<span style="font-size:11px;color:var(--green);font-weight:700;white-space:nowrap">✅ Listo</span>')+
      '</div>'+
      '<div class="dlvc-body">'+
        '<div class="dlvc-addr" onclick="window.open(\''+_mapsUrl(s)+'\',\'_blank\')">'+
          (hasGps?'📍 ':'🏠 ')+_esc(addr)+
        '</div>'+
        '<div class="dlvc-meta">'+
          '<span>📞 '+_esc(s.phone||'—')+'</span>'+
          (s.date?'<span>📅 '+_esc(s.date)+'</span>':'')+
          '<span style="color:'+(isDone?'var(--green)':'#f59e0b')+'">'+_esc(s.status)+'</span>'+
        '</div>'+
        (!isDone?drvHtml:'')+
      '</div>'+
    '</div>';
  }).join('');
}

/* ── Driver ──────────────────────────────────────────────────────── */
DeliveryModule._openDrv=function(id){
  _currentShipId=id; _loadDrivers();
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  var cur=ship?(ship._dlvDriver||''):'';
  var list=document.getElementById('dlvDrvList');
  if(list) list.innerHTML=_drivers.length
    ?_drivers.map(function(d){
        var sel=cur===d.name;
        return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:'+(sel?'rgba(163,113,247,.15)':'#1c2333')+';border:1px solid '+(sel?'rgba(163,113,247,.4)':'#30363d')+';border-radius:9px;cursor:pointer" onclick="DeliveryModule._selDrv(\''+d.name.replace(/'/g,"\\'")+'\',\''+( d.phone||'').replace(/'/g,"\\'")+'\')">'+
          '<span style="font-size:15px">🛵</span>'+
          '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+_esc(d.name)+'</div>'+(d.phone?'<div style="font-size:11px;color:#8b949e">📞 '+_esc(d.phone)+'</div>':'')+  '</div>'+
          (sel?'<span style="color:var(--green)">✓</span>':'')+
          '<button onclick="event.stopPropagation();DeliveryModule._delDrv(\''+d.name.replace(/'/g,"\\'")+'\' )" style="background:none;border:none;color:#f78166;cursor:pointer;font-size:14px;padding:0 4px">✕</button>'+
        '</div>';
      }).join('')
    :'<div style="text-align:center;padding:16px;color:#8b949e;font-size:12px">Sin motorizados. Agrega uno abajo.</div>';
  var _rl=document.getElementById('dlvRutaLink'); if(_rl) _rl.value=(ship&&ship._dlvRutaLink)||'';
  document.getElementById('dlvDrvOv').classList.add('open');
};
DeliveryModule._addDrv=function(){
  var n=(document.getElementById('dlvDrvName')||{value:''}).value.trim();
  var ph=(document.getElementById('dlvDrvPhone')||{value:''}).value.trim();
  if(!n){if(typeof global.toast==='function')global.toast('⚠️ Escribe el nombre');return;}
  if(!_drivers.find(function(d){return d.name===n;})){_drivers.push({name:n,phone:ph});_saveDrivers();}
  document.getElementById('dlvDrvName').value='';
  document.getElementById('dlvDrvPhone').value='';
  DeliveryModule._openDrv(_currentShipId);
};
DeliveryModule._delDrv=function(name){
  _drivers=_drivers.filter(function(d){return d.name!==name;});_saveDrivers();
  DeliveryModule._openDrv(_currentShipId);
};
DeliveryModule._selDrv=function(name,phone){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(ship){
    ship._dlvDriver=name;ship._dlvDriverPhone=phone||'';
    var raw=(document.getElementById('dlvRutaLink')||{value:''}).value.trim();
    if(raw){var n=_normLink(raw);if(n)ship._dlvRutaLink=n;}
    else if(ship._dlvRutaLink){delete ship._dlvRutaLink;}
    if(typeof global.save==='function')global.save();
  }
  DeliveryModule._closeDrv();_render();
  if(typeof global.toast==='function')global.toast('🛵 '+name+' asignado');
};
DeliveryModule._closeDrv=function(){document.getElementById('dlvDrvOv').classList.remove('open');};

/* ── Link de ruta del motorizado (por pedido) ────────────────────── */
function _normLink(u){
  u=String(u||'').trim();
  if(!u) return '';
  if(/^javascript:/i.test(u)) return '';
  if(/^https?:\/\//i.test(u)) return u;
  if(/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // otros esquemas rechazados
  return 'https://'+u;
}
DeliveryModule._genRuta=function(){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var dest=ship.gpsCoords||[ship.address,ship.referencia].filter(Boolean).join(', ');
  var inp=document.getElementById('dlvRutaLink');
  if(inp)inp.value='https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(dest);
};
DeliveryModule._saveRuta=function(){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var raw=(document.getElementById('dlvRutaLink')||{value:''}).value.trim();
  if(!raw){ delete ship._dlvRutaLink; }
  else{ var n=_normLink(raw); if(!n){if(typeof global.toast==='function')global.toast('⚠️ Link de ruta inválido');return;} ship._dlvRutaLink=n; }
  if(typeof global.save==='function')global.save();
  DeliveryModule._closeDrv();_render();
  if(typeof global.toast==='function')global.toast(ship._dlvRutaLink?'🗺️ Ruta guardada':'Ruta quitada');
};
DeliveryModule._verRuta=function(id){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  var url=ship&&ship._dlvRutaLink?String(ship._dlvRutaLink):'';
  if(!/^https?:\/\//i.test(url)){if(typeof global.toast==='function')global.toast('⚠️ Link de ruta inválido');return;}
  window.open(url,'_blank');
};

/* ── Confirmar entrega ───────────────────────────────────────────── */
DeliveryModule._openConf=function(id){
  _currentShipId=id;_fotoBase64=null;_signCtx=null;
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  var cn=document.getElementById('dlvCName');
  if(cn) cn.textContent=ship?(ship.name+' · '+(ship.address||'')):'';
  var r=document.getElementById('dlvRecep');if(r)r.value='';
  var pv=document.getElementById('dlvFotoPrev');if(pv){pv.src='';pv.style.display='none';}
  document.getElementById('dlvConfOv').classList.add('open');
  setTimeout(function(){
    var c=document.getElementById('dlvSign');
    if(!c)return;
    c.width=c.offsetWidth||320;c.height=130;
    _signCtx=c.getContext('2d');
    _signCtx.strokeStyle='#e6edf3';_signCtx.lineWidth=2.5;_signCtx.lineCap='round';_signCtx.lineJoin='round';
    function pos(e){var r=c.getBoundingClientRect();var t=e.touches?e.touches[0]:e;return{x:t.clientX-r.left,y:t.clientY-r.top};}
    c.onmousedown=function(e){_signing=true;var p=pos(e);_signCtx.beginPath();_signCtx.moveTo(p.x,p.y);};
    c.onmousemove=function(e){if(!_signing)return;var p=pos(e);_signCtx.lineTo(p.x,p.y);_signCtx.stroke();};
    c.onmouseup=function(){_signing=false;};
    c.ontouchstart=function(e){e.preventDefault();_signing=true;var p=pos(e);_signCtx.beginPath();_signCtx.moveTo(p.x,p.y);};
    c.ontouchmove=function(e){e.preventDefault();if(!_signing)return;var p=pos(e);_signCtx.lineTo(p.x,p.y);_signCtx.stroke();};
    c.ontouchend=function(){_signing=false;};
  },150);
};
DeliveryModule._closeConf=function(){document.getElementById('dlvConfOv').classList.remove('open');_currentShipId=null;};
DeliveryModule._foto=function(input){
  var file=input.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(e){_fotoBase64=e.target.result;var pv=document.getElementById('dlvFotoPrev');if(pv){pv.src=_fotoBase64;pv.style.display='block';}};
  r.readAsDataURL(file);
};
DeliveryModule._clearSign=function(){var c=document.getElementById('dlvSign');if(c&&_signCtx)_signCtx.clearRect(0,0,c.width,c.height);};
DeliveryModule._confirmar=function(){
  var recep=(document.getElementById('dlvRecep')||{value:''}).value.trim();
  if(!recep){if(typeof global.toast==='function')global.toast('⚠️ Escribe el nombre de quien recibe');return;}
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var firma=null;var c=document.getElementById('dlvSign');if(c&&_signCtx)firma=c.toDataURL('image/png');
  ship.status='FINALIZADO';ship._dlvDone=true;ship._dlvReceptor=recep;ship._dlvFecha=new Date().toISOString();
  if(_fotoBase64)ship._dlvFoto=_fotoBase64;
  if(firma)ship._dlvFirma=firma;
  if(typeof global.save==='function')global.save();
  if(typeof global.render==='function')global.render();
  DeliveryModule._closeConf();_render();
  if(typeof global.toast==='function')global.toast('✅ Entregado — '+recep);
};

/* ── Triple tap ──────────────────────────────────────────────────── */
function _initTap(){
  document.addEventListener('click',function(e){
    var hdr=e.target.closest('.cgroup-hdr');
    if(!hdr)return;
    var nm=hdr.querySelector('.cgroup-name');
    if(!nm||!nm.textContent.trim().toUpperCase().includes('DELIVERY'))return;
    _tapCount++;
    clearTimeout(_tapTimer);
    _tapTimer=setTimeout(function(){if(_tapCount>=3)DeliveryModule.abrir();_tapCount=0;},500);
  });
}

/* ── API pública ─────────────────────────────────────────────────── */
DeliveryModule.abrir=function(){
  _loadDrivers();
  var panel=document.getElementById('dlvPanel');
  if(!panel)return;
  panel.classList.add('open');
  _render();
};
DeliveryModule.cerrar=function(){
  var panel=document.getElementById('dlvPanel');
  if(panel)panel.classList.remove('open');
};
DeliveryModule.init=function(){
  _css();_html();_loadDrivers();_initTap();
  console.log('[DeliveryModule] v3 listo');
};

global.DeliveryModule=DeliveryModule;
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',DeliveryModule.init);
}else{
  DeliveryModule.init();
}
})(window);
