(function(global){
'use strict';

var DeliveryModule = {};

var _currentShipId = null;
var _fotoBase64    = null;
var _signCtx       = null;
var _signing       = false;
var _tapCount      = 0;
var _tapTimer      = null;
var _movingId      = null;

function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _escAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _isDelivery(s){ return s.courier&&s.courier.toUpperCase().includes('DELIVERY'); }
function _getShips(){
  return ((global.S&&global.S.shipments)||[]).filter(function(s){
    return _isDelivery(s)&&s.status!=='FINALIZADO';
  });
}
function _orderShips(list){
  var base=(list||[]).slice().sort(function(a,b){
    var ta=+a._dlvAsignadoTs||0, tb=+b._dlvAsignadoTs||0;
    if(ta!==tb) return tb-ta;
    return String(b.date||'').localeCompare(String(a.date||''));
  });
  if(!base.some(function(s){return typeof s._dlvOrden==='number';})) return base;
  return base.sort(function(a,b){
    var oa=(typeof a._dlvOrden==='number')?a._dlvOrden:Infinity;
    var ob=(typeof b._dlvOrden==='number')?b._dlvOrden:Infinity;
    return oa-ob;
  });
}

function _mapsUrl(s){
  if(s.gpsCoords) return 'https://maps.google.com/?q='+s.gpsCoords;
  return 'https://maps.google.com/?q='+encodeURIComponent([s.address,s.referencia].filter(Boolean).join(', '));
}

function _css(){
  if(document.getElementById('dlvCSS')) return;
  var st=document.createElement('style'); st.id='dlvCSS';
  st.textContent=
    '#dlvPanel{display:none;position:fixed;top:0;right:0;bottom:0;z-index:300;background:#161b22;border-left:1px solid #30363d;flex-direction:column;box-shadow:-6px 0 24px rgba(0,0,0,.6)}'+
    '#dlvPanel.open{display:flex}'+
    '@media(min-width:600px){#dlvPanel{width:380px}}'+
    '@media(max-width:599px){#dlvPanel{width:100%;border-left:none}}'+
    '#dlvHdr{background:#1c2333;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #30363d;flex-shrink:0}'+
    '#dlvBody{flex:1;overflow-y:auto;padding:12px 14px;-webkit-overflow-scrolling:touch}'+
    '.dlv-card{background:#0d1117;border:1px solid #30363d;border-radius:11px;margin-bottom:9px}'+
    '.dlv-card.dlv-moving{border-color:var(--blue);box-shadow:0 0 0 2px rgba(56,139,253,.25)}'+
    '.dlv-num{width:24px;height:24px;border-radius:50%;background:var(--blue-fill);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
    '.dlv-num.on{background:#fff;color:var(--blue);box-shadow:0 0 0 2px var(--blue)}'+
    '.dlv-entr{padding:6px 11px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--green),#1a7f37);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'+
    '.dlv-pin{flex-shrink:0;background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.3);border-radius:7px;color:var(--blue);font-size:13px;line-height:1;padding:4px 7px;cursor:pointer;font-family:inherit}'+
    '.dlv-drop{margin:6px 0;padding:10px;border:1.5px dashed rgba(56,139,253,.55);border-radius:9px;background:rgba(56,139,253,.07);color:var(--blue);font-size:12px;font-weight:700;text-align:center;cursor:pointer}'+
    '.dlv-drop:active{background:rgba(56,139,253,.18)}'+
    '.dlv-movebar{background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.35);border-radius:9px;padding:9px 12px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--blue);font-weight:700}'+
    '.dlv-movebar button{background:none;border:none;color:#8b949e;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}'+
    '#dlvConfOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:900;align-items:flex-end;justify-content:center}'+
    '#dlvConfOv.open{display:flex}'+
    '.dlv-sheet{background:#161b22;border-radius:16px 16px 0 0;padding:18px;width:100%;max-width:480px;border:1px solid #30363d;animation:dlvUp .2s ease;max-height:88vh;overflow-y:auto}'+
    '@keyframes dlvUp{from{transform:translateY(100%)}to{transform:translateY(0)}}'+
    '#dlvSign{width:100%;height:130px;background:#0d1117;border:1px solid #30363d;border-radius:10px;touch-action:none;cursor:crosshair;display:block}'+
    '#dlvFotoPrev{width:100%;max-height:150px;object-fit:contain;border-radius:10px;display:none;margin-top:8px;background:#0d1117}';
  document.head.appendChild(st);
}

function _html(){
  if(document.getElementById('dlvPanel')) return;

  var p=document.createElement('div'); p.id='dlvPanel';
  p.innerHTML=
    '<div id="dlvHdr">'+
      '<div><div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px">🛵 Ruta DELIVERY</div>'+
      '<div id="dlvSub" style="font-size:10px;color:#8b949e;margin-top:1px"></div></div>'+
      '<button onclick="DeliveryModule.cerrar()" style="background:rgba(247,129,102,.15);border:1px solid rgba(247,129,102,.3);color:#f78166;border-radius:8px;width:32px;height:32px;font-size:15px;cursor:pointer">✕</button>'+
    '</div>'+
    '<div id="dlvBody"><div id="dlvStats" style="display:flex;gap:12px;margin-bottom:12px;background:#1c2333;border-radius:10px;padding:10px 14px"></div><div id="dlvList"></div></div>';
  document.body.appendChild(p);

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
        '<button id="dlvConfBtn" onclick="DeliveryModule._confirmar()" style="flex:2;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmar entrega</button>'+
      '</div>'+
    '</div>';
  oc.addEventListener('click',function(e){if(e.target===oc)DeliveryModule._closeConf();});
  document.body.appendChild(oc);
}

function _render(){
  var ships=_orderShips(_getShips());
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

  if(_movingId && !ships.some(function(x){return x.id===_movingId;})) _movingId=null;

  function _dropZone(pos){
    if(!_movingId) return '';
    return '<div class="dlv-drop" onclick="DeliveryModule.soltarEn('+pos+')">⬇ Colocar aquí</div>';
  }

  var html='';
  if(_movingId){
    var mv=ships.filter(function(x){return x.id===_movingId;})[0];
    html+='<div class="dlv-movebar"><span>↕️ Moviendo: '+_esc(mv?mv.name:'')+'</span>'+
          '<button onclick="DeliveryModule.cancelarMover()">Cancelar</button></div>';
  }
  ships.forEach(function(s,i){
    html+=_dropZone(i);

    var isDone=!!s._dlvDone;
    var moving=(_movingId===s.id);
    var addr=[s.address,s.referencia].filter(Boolean).join(' · ')||'—';
    var hasGps=!!s.gpsCoords;

    var linksHtml=(s.links||[]).map(function(l){
      return '<a href="'+_escAttr(l.u)+'" target="_blank" rel="noopener" class="link-chip" style="text-decoration:none">🔗 '+_esc(l.n||'Link')+'</a>';
    }).join('');

    var drvBox=(!isDone && typeof global.dlvDriverBlock==='function') ? global.dlvDriverBlock(s) : '';

    var stCls=(typeof global.stClass==='function')?global.stClass(s.status):'';
    var stIco=(typeof global.stIcon==='function')?global.stIcon(s.status):'🏷️';
    var estadoHtml=isDone
      ? '<button class="btn-st st-ent" style="cursor:default">✅ ENTREGADO</button>'
      : '<button class="btn-st '+stCls+'" style="cursor:default">'+stIco+' '+_esc(s.status||'—')+'</button>';

    html+='<div class="card dlv-card'+(moving?' dlv-moving':'')+'">'+
      '<div class="card-top">'+
        '<div class="dlv-num'+(moving?' on':'')+'" onclick="DeliveryModule.tomar(\''+s.id+'\')" title="Tocar para cambiar de posición">'+(isDone?'✓':(i+1))+'</div>'+
        '<div class="cname">'+_esc(s.name)+'</div>'+
        (!isDone
          ?'<button class="dlv-entr" onclick="DeliveryModule._openConf(\''+s.id+'\')">📦 Entregar</button>'
          :'<span style="font-size:11px;color:var(--green);font-weight:700;white-space:nowrap">✅ Listo</span>')+
      '</div>'+
      '<div class="card-meta">'+
        '<span class="meta" style="cursor:pointer" onclick="DeliveryModule._phoneActions(\''+_esc(s.phone||'')+'\')">📞 '+_esc(s.phone||'—')+'</span>'+
        (s.date?'<span class="meta" style="color:var(--text2)">📅 '+_esc(s.date)+'</span>':'')+
        (s.cost?'<span class="meta" style="color:var(--text2)">💰 S/ '+_esc(s.cost)+'</span>':'')+
      '</div>'+
      '<div style="display:flex;align-items:flex-start;gap:6px">'+
        '<div class="card-addr" style="flex:1;cursor:pointer" onclick="DeliveryModule._openMaps(\''+s.id+'\')">🏠 '+_esc(addr)+'</div>'+
        (hasGps?'<button class="dlv-pin" onclick="DeliveryModule._openMaps(\''+s.id+'\')" title="Ubicación GPS">📍</button>':'')+
      '</div>'+
      (linksHtml?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px">'+linksHtml+'</div>':'')+
      drvBox+
      '<div class="card-actions">'+
        estadoHtml+
        '<button class="btn-edit" onclick="DeliveryModule.editar(\''+s.id+'\')" title="Editar pedido">✏️</button>'+
      '</div>'+
    '</div>';
  });
  html+=_dropZone(ships.length);
  list.innerHTML=html;
}

DeliveryModule.editar=function(id){
  if(typeof global.openForm==='function') global.openForm(id);
  else if(typeof global.toast==='function') global.toast('Abre el pedido desde el panel');
};

DeliveryModule.tomar=function(id){
  _movingId=(_movingId===id)?null:id;
  _render();
};
DeliveryModule.cancelarMover=function(){ _movingId=null; _render(); };
DeliveryModule.soltarEn=function(pos){
  if(!_movingId) return;
  var arr=_orderShips(_getShips());
  var from=-1; for(var k=0;k<arr.length;k++){ if(arr[k].id===_movingId){ from=k; break; } }
  if(from<0){ _movingId=null; _render(); return; }
  var it=arr.splice(from,1)[0];
  var to=(pos>from)?pos-1:pos;
  if(to<0) to=0; if(to>arr.length) to=arr.length;
  arr.splice(to,0,it);
  arr.forEach(function(s,idx){
    if(s._dlvOrden!==idx){
      s._dlvOrden=idx;
      if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(s);
    }
  });
  _movingId=null;
  _render();
  if(typeof global.toast==='function')global.toast('✅ Parada '+(to+1));
};

DeliveryModule.sortForRoute=function(list){ return _orderShips(list||[]); };

DeliveryModule._openMaps=function(id){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  if(ship) window.open(_mapsUrl(ship),'_blank');
};

DeliveryModule._phoneActions=function(phone){
  phone=phone?String(phone).trim():'';
  if(!phone){ if(typeof global.toast==='function')global.toast('Sin teléfono'); return; }
  var ov=document.createElement('div');
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:960;display:flex;align-items:flex-end;justify-content:center';
  ov.innerHTML='<div class="dlv-sheet">'+
    '<div style="width:36px;height:4px;background:#30363d;border-radius:2px;margin:0 auto 14px"></div>'+
    '<div style="font-family:Syne,sans-serif;font-weight:800;font-size:16px;margin-bottom:14px">📞 '+_esc(phone)+'</div>'+
    '<a href="tel:'+_escAttr(phone)+'" style="display:block;text-align:center;padding:13px;background:rgba(56,139,253,.15);border:1px solid rgba(56,139,253,.35);border-radius:10px;color:var(--blue);font-weight:700;font-size:14px;text-decoration:none;margin-bottom:9px">📞 Llamar</a>'+
    '<a href="https://wa.me/51'+encodeURIComponent(phone)+'" target="_blank" rel="noopener" style="display:block;text-align:center;padding:13px;background:rgba(37,211,102,.15);border:1px solid rgba(37,211,102,.35);border-radius:10px;color:#25d366;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:9px">💬 WhatsApp</a>'+
    '<button type="button" style="width:100%;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cancelar</button>'+
  '</div>';
  function close(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
  ov.addEventListener('click',function(e){ if(e.target===ov) close(); });
  ov.querySelector('button').addEventListener('click',close);
  [].forEach.call(ov.querySelectorAll('a'),function(a){ a.addEventListener('click',function(){ setTimeout(close,60); }); });
  document.body.appendChild(ov);
};

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
DeliveryModule._closeConf=function(){document.getElementById('dlvConfOv').classList.remove('open');_currentShipId=null;_fotoBase64=null;};
DeliveryModule._foto=function(input){
  var file=input.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(e){_fotoBase64=e.target.result;var pv=document.getElementById('dlvFotoPrev');if(pv){pv.src=_fotoBase64;pv.style.display='block';}};
  r.readAsDataURL(file);
};
DeliveryModule._clearSign=function(){var c=document.getElementById('dlvSign');if(c&&_signCtx)_signCtx.clearRect(0,0,c.width,c.height);};
DeliveryModule._confirmar=async function(){
  if(DeliveryModule._confirming)return;
  var recep=(document.getElementById('dlvRecep')||{value:''}).value.trim();
  if(!recep){if(typeof global.toast==='function')global.toast('⚠️ Escribe el nombre de quien recibe');return;}
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var firmaB64=null;var c=document.getElementById('dlvSign');if(c&&_signCtx)firmaB64=c.toDataURL('image/png');

  DeliveryModule._confirming=true;
  var btn=document.getElementById('dlvConfBtn');
  var btnTxt=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='⏳ Guardando…';}

  var SM=global.StorageModule;
  if(SM&&SM.uploadFile&&SM.base64ToFile){
    var _subir=async function(b64,name,type,slot){
      var file=SM.base64ToFile(b64,name,type);
      for(var i=0;i<3;i++){
        try{ return (await SM.uploadFile(file,ship.id,slot)).d; }
        catch(e){ if(i<2) await new Promise(function(r){setTimeout(r,2000*(i+1));}); }
      }
      return null;
    };
    var _FM=global.FotosModule;
    if(_fotoBase64){
      var uF=await _subir(_fotoBase64,'delivery-foto.jpg','image/jpeg','delivery-foto');
      if(uF) ship._dlvFoto=uF;
      else if(_FM&&_FM.encolarUrl){ _FM.encolarUrl(ship.id,'_dlvFoto','delivery-foto',SM.base64ToFile(_fotoBase64,'delivery-foto.jpg','image/jpeg')); if(typeof global.toast==='function')global.toast('⏳ La foto se subirá sola al volver la conexión'); }
      else if(typeof global.toast==='function')global.toast('⚠️ No se pudo subir la foto — se guardó sin ella');
    }
    if(firmaB64){
      var uS=await _subir(firmaB64,'delivery-firma.png','image/png','delivery-firma');
      if(uS) ship._dlvFirma=uS;
      else if(_FM&&_FM.encolarUrl) _FM.encolarUrl(ship.id,'_dlvFirma','delivery-firma',SM.base64ToFile(firmaB64,'delivery-firma.png','image/png'));
    }
  }

  ship.status='FINALIZADO';ship._dlvDone=true;ship._dlvReceptor=recep;ship._dlvFecha=new Date().toISOString();
  if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(ship);
  if(typeof global.render==='function')global.render();
  DeliveryModule._confirming=false;
  if(btn){btn.disabled=false;btn.textContent=btnTxt;}
  DeliveryModule._closeConf();_render();
  var _sale = (typeof global._avisoSaleDeActivos==='function')
    ? global._avisoSaleDeActivos('FINALIZADO') : '';
  if(typeof global.toast==='function')global.toast('✅ Entregado — '+recep+_sale);
};

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

DeliveryModule.abrir=function(){
  var panel=document.getElementById('dlvPanel');
  if(!panel)return;
  panel.classList.add('open');
  _render();
};
DeliveryModule.cerrar=function(){
  var panel=document.getElementById('dlvPanel');
  if(panel)panel.classList.remove('open');
};
DeliveryModule.refrescar=function(){
  var panel=document.getElementById('dlvPanel');
  if(panel&&panel.classList.contains('open')) _render();
};
DeliveryModule.init=function(){
  _css();_html();_initTap();
};

global.DeliveryModule=DeliveryModule;
if(document.readyState !== 'complete'){
  document.addEventListener('DOMContentLoaded',DeliveryModule.init);
}else{
  DeliveryModule.init();
}
})(window);
