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
var _selectedDrv   = null; // motorizado elegido en el modal (aún sin guardar)
var _tapCount      = 0;
var _tapTimer      = null;

function _loadDrivers(){ try{ _drivers=JSON.parse(localStorage.getItem('tt_drivers')||'[]'); }catch(e){ _drivers=[]; } }
function _saveDrivers(){ try{ localStorage.setItem('tt_drivers',JSON.stringify(_drivers)); }catch(e){} }
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _escAttr(s){ return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function _isDelivery(s){ return s.courier&&s.courier.toUpperCase().includes('DELIVERY'); }
function _getShips(){
  return ((global.S&&global.S.shipments)||[]).filter(function(s){
    return _isDelivery(s)&&s.status!=='FINALIZADO';
  });
}
// DELIVERY ya finalizados (para el historial de motorizados).
function _getFinalized(){
  return ((global.S&&global.S.shipments)||[]).filter(function(s){
    return _isDelivery(s)&&s.status==='FINALIZADO';
  });
}
/* Orden de la ruta = MISMO orden que las etiquetas:
   - Base: igual que el panel/etiquetas → más reciente primero (por fecha).
   - Si el usuario reordenó (campo numérico _dlvOrden), ese orden manda; los
     que no tengan orden manual quedan al final en el orden base (sort estable).
   Es la ÚNICA fuente de verdad: la usan la ruta Y la impresión de etiquetas. */
function _orderShips(list){
  var base=(list||[]).slice().sort(function(a,b){
    return String(b.date||'').localeCompare(String(a.date||''));
  });
  if(!base.some(function(s){return typeof s._dlvOrden==='number';})) return base;
  return base.sort(function(a,b){
    var oa=(typeof a._dlvOrden==='number')?a._dlvOrden:Infinity;
    var ob=(typeof b._dlvOrden==='number')?b._dlvOrden:Infinity;
    return oa-ob; // empates (Infinity) conservan el orden base (sort estable)
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
    /* ENCABEZADO en columna: fila superior (num+nombre+entregar) + meta (tel·fecha·monto) */
    '.dlvc-hdr{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border-bottom:1px solid #30363d}'+
    '.dlvc-hdr-top{display:flex;align-items:center;gap:8px}'+
    '.dlvc-num{width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0}'+
    '.dlvc-name{flex:1;font-size:13px;font-weight:700;color:#e6edf3;line-height:1.3;min-width:0}'+
    '.dlvc-entr{padding:6px 11px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--green),#1a7f37);color:#fff;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}'+
    '.dlvc-headmeta{display:flex;align-items:center;gap:5px 10px;flex-wrap:wrap;padding-left:32px}'+
    '.dlvc-headmeta span{font-size:11px;color:#8b949e}'+
    '.dlvc-phone{color:var(--blue)!important;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
    '.dlvc-body{padding:10px 12px}'+
    /* Chips de link (reusa .link-chip del panel) */
    '.dlvc-links{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}'+
    /* Dirección: color normal, clickable a Maps, con pin solo si hay GPS */
    '.dlvc-addr-row{display:flex;align-items:flex-start;gap:6px;margin-bottom:8px}'+
    '.dlvc-addr{flex:1;font-size:12px;color:#c9d1d9;line-height:1.5;cursor:pointer;-webkit-tap-highlight-color:transparent}'+
    '.dlvc-pin{flex-shrink:0;background:rgba(56,139,253,.12);border:1px solid rgba(56,139,253,.3);border-radius:7px;color:var(--blue);font-size:13px;line-height:1;padding:4px 7px;cursor:pointer;font-family:inherit}'+
    /* Bloque MOTORIZADO / INDRIVER — estilo recuadro como Guía Shalom (solo lectura) */
    '.dlvc-drvbox{background:rgba(163,113,247,.06);border:1px solid rgba(163,113,247,.22);border-radius:9px;padding:9px 10px;margin-bottom:8px}'+
    '.dlvc-drvbox-ttl{font-size:9.5px;font-weight:700;color:#a371f7;letter-spacing:.7px;text-transform:uppercase;margin-bottom:5px}'+
    '.dlvc-drvbox-row{display:flex;align-items:center;gap:8px}'+
    '.dlvc-drvbox-info{flex:1;min-width:0}'+
    '.dlvc-drvbox-name{font-size:12.5px;font-weight:700;color:#e6edf3;line-height:1.3}'+
    '.dlvc-drvbox-empty{font-size:11.5px;color:#6e7681;font-style:italic}'+
    /* PARTE BAJA: estado del pedido + botón editar */
    '.dlvc-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-top:1px solid #30363d}'+
    '.dlvc-status{font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:rgba(245,158,11,.12);color:#f59e0b}'+
    '.dlvc-status.done{background:rgba(46,160,67,.15);color:var(--green)}'+
    '.dlvc-edit{display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:8px;border:1px solid #30363d;background:#1c2333;color:#c9d1d9;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}'+
    /* Reordenar parada (mover orden de entrega) */
    '.dlvc-foot-r{display:flex;align-items:center;gap:6px}'+
    '.dlvc-ord{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:7px;border:1px solid #30363d;background:#1c2333;color:#c9d1d9;font-size:12px;cursor:pointer;font-family:inherit;line-height:1}'+
    '.dlvc-ord:disabled{opacity:.3;cursor:default}'+
    /* Historial de motorizados (acordeón, mismas clases .docs-accordion-* del panel) */
    '#dlvHist{margin-top:12px}'+
    '.dlvh-item{display:flex;gap:8px;padding:9px 4px;border-bottom:1px solid #21262d}'+
    '.dlvh-item:last-child{border-bottom:none}'+
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
    '<div id="dlvBody"><div id="dlvStats" style="display:flex;gap:12px;margin-bottom:12px;background:#1c2333;border-radius:10px;padding:10px 14px"></div><div id="dlvList"></div>'+
      // HISTORIAL de motorizados — solo pedidos FINALIZADOS, se despliega igual
      // que "Documentos del envío" (reusa .docs-accordion-* del panel).
      '<div id="dlvHist" class="docs-accordion">'+
        '<div class="docs-accordion-hdr" onclick="DeliveryModule._toggleHist()">'+
          '<span class="docs-accordion-ttl">🛵 Historial de motorizados <span id="dlvHistCnt" style="opacity:.7"></span></span>'+
          '<span class="docs-accordion-arrow" id="dlvHistArrow">▾</span>'+
        '</div>'+
        '<div class="docs-accordion-body" id="dlvHistBody"></div>'+
      '</div>'+
    '</div>';
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
        '<button id="dlvConfBtn" onclick="DeliveryModule._confirmar()" style="flex:2;padding:12px;background:linear-gradient(135deg,var(--green),#1a7f37);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">✅ Confirmar entrega</button>'+
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
      // NUEVO MOTORIZADO — PRIMERO y anclado arriba (campos siempre visibles aquí)
      '<div style="background:rgba(163,113,247,.06);border:1px solid rgba(163,113,247,.22);border-radius:10px;padding:12px;margin-bottom:12px">'+
        '<div style="font-size:10px;font-weight:700;color:#a371f7;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px">🛵 Nuevo motorizado</div>'+
        '<div class="frow">'+
          '<div class="fg"><label class="fl">Nombre</label><input id="dlvDrvName" class="fi" placeholder="Nombre..."></div>'+
          '<div class="fg"><label class="fl">Teléfono</label><input id="dlvDrvPhone" class="fi phone-norm" placeholder="Opcional" inputmode="numeric"></div>'+
        '</div>'+
      '</div>'+
      // LINK INDRIVER — patrón "Agregar link" (input + Add + chip con ↗/✕)
      '<div style="font-size:10px;font-weight:700;color:#8b949e;letter-spacing:.8px;text-transform:uppercase;margin-bottom:7px">🔗 Link inDriver (opcional)</div>'+
      '<div class="link-row">'+
        '<input id="dlvRutaLink" class="fi" placeholder="https://… link del viaje inDriver" inputmode="url" style="flex:1">'+
        '<button class="link-add" type="button" onclick="DeliveryModule._addRuta()">+ Add</button>'+
      '</div>'+
      '<div class="link-list" id="dlvRutaList" style="margin-bottom:14px"></div>'+
      // MOTORIZADOS GUARDADOS — acordeón colapsable (como Documentos del envío);
      // se abre solo si quieres reusar uno. Cabecera muestra el elegido.
      '<div class="docs-accordion" style="margin-bottom:14px">'+
        '<div class="docs-accordion-hdr" onclick="DeliveryModule._toggleDrvList()">'+
          '<span class="docs-accordion-ttl">🛵 Motorizados guardados<span id="dlvDrvChosen" style="text-transform:none;font-weight:600;color:#a371f7;margin-left:6px"></span></span>'+
          '<span class="docs-accordion-arrow" id="dlvDrvArrow">▾</span>'+
        '</div>'+
        '<div class="docs-accordion-body" id="dlvDrvBody">'+
          '<div id="dlvDrvList" style="display:flex;flex-direction:column;gap:7px;max-height:200px;overflow-y:auto"></div>'+
        '</div>'+
      '</div>'+
      // GUARDAR Y CERRAR (primario) + Cerrar (cancelar) — mismo par que el panel
      '<div style="display:flex;gap:9px">'+
        '<button onclick="DeliveryModule._closeDrv()" style="flex:1;padding:12px;background:#1c2333;border:1px solid #30363d;border-radius:10px;color:#8b949e;font-size:13px;cursor:pointer;font-family:inherit">Cerrar</button>'+
        '<button onclick="DeliveryModule._guardar()" style="flex:2;padding:12px;background:var(--blue);border:none;border-radius:10px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit">💾 Guardar y cerrar</button>'+
      '</div>'+
    '</div>';
  od.addEventListener('click',function(e){if(e.target===od)DeliveryModule._closeDrv();});
  document.body.appendChild(od);
}

/* ── Render ──────────────────────────────────────────────────────── */
function _render(){
  var ships=_orderShips(_getShips()); // mismo orden que las etiquetas (+ reorden manual)
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

    // Chips de link del cliente (apisale, etc.) — abren en pestaña nueva como en el panel
    var linksHtml=(s.links||[]).map(function(l){
      return '<a href="'+_escAttr(l.u)+'" target="_blank" rel="noopener" class="link-chip" style="text-decoration:none">🔗 '+_esc(l.n||'Link')+'</a>';
    }).join('');

    // Bloque MOTORIZADO / INDRIVER (solo lectura, estilo recuadro como Guía Shalom).
    // Nombre · número(tap→llamar/WA) + chip inDriver al costado. Se edita en ✏️ Editar.
    var drvNum=drvPhone
      ?' <span class="dlvc-phone" style="font-size:11.5px" onclick="DeliveryModule._phoneActions(\''+_esc(drvPhone)+'\')">· '+_esc(drvPhone)+'</span>'
      :'';
    var indriverChip=rutaLink
      ?'<a href="'+_escAttr(rutaLink)+'" target="_blank" rel="noopener" class="link-chip" style="text-decoration:none;flex-shrink:0">🔗 inDriver</a>'
      :'';
    var drvBox=
      '<div class="dlvc-drvbox">'+
        '<div class="dlvc-drvbox-ttl">🛵 Motorizado / inDriver</div>'+
        '<div class="dlvc-drvbox-row">'+
          '<div class="dlvc-drvbox-info">'+
            (drv
              ?'<span class="dlvc-drvbox-name">'+_esc(drv)+'</span>'+drvNum
              :'<span class="dlvc-drvbox-empty">Sin asignar — toca ✏️ Editar</span>')+
          '</div>'+
          indriverChip+
        '</div>'+
      '</div>';

    return '<div class="dlvc">'+
      // ENCABEZADO: fila superior (num+nombre+entregar) + meta (tel·fecha·monto) debajo del nombre
      '<div class="dlvc-hdr">'+
        '<div class="dlvc-hdr-top">'+
          '<div class="dlvc-num" style="background:'+(isDone?'var(--green)':'var(--blue)')+'">'+(isDone?'✓':(i+1))+'</div>'+
          '<div class="dlvc-name">'+_esc(s.name)+'</div>'+
          (!isDone
            ?'<button class="dlvc-entr" onclick="DeliveryModule._openConf(\''+s.id+'\')">📦 Entregar</button>'
            :'<span style="font-size:11px;color:var(--green);font-weight:700;white-space:nowrap">✅ Listo</span>')+
        '</div>'+
        '<div class="dlvc-headmeta">'+
          '<span class="dlvc-phone" onclick="DeliveryModule._phoneActions(\''+_esc(s.phone||'')+'\')">📞 '+_esc(s.phone||'—')+'</span>'+
          (s.date?'<span>📅 '+_esc(s.date)+'</span>':'')+
          (s.cost?'<span>S/ '+_esc(s.cost)+'</span>':'')+
        '</div>'+
      '</div>'+
      // CUERPO: dirección, link y bloque motorizado
      '<div class="dlvc-body">'+
        '<div class="dlvc-addr-row">'+
          '<span class="dlvc-addr" onclick="DeliveryModule._openMaps(\''+s.id+'\')">🏠 '+_esc(addr)+'</span>'+
          (hasGps?'<button class="dlvc-pin" onclick="DeliveryModule._openMaps(\''+s.id+'\')" title="Ubicación GPS (usar mi ubicación)">📍</button>':'')+
        '</div>'+
        (linksHtml?'<div class="dlvc-links">'+linksHtml+'</div>':'')+
        // Recuadro de motorizado SOLO si hay uno asignado; si no, basta el botón Editar.
        (!isDone && drv ?drvBox:'')+
      '</div>'+
      // PARTE BAJA: estado + reordenar (▲▼) + botón editar (siempre visible)
      '<div class="dlvc-foot">'+
        '<span class="dlvc-status'+(isDone?' done':'')+'">'+_esc(isDone?'ENTREGADO':(s.status||'—'))+'</span>'+
        '<div class="dlvc-foot-r">'+
          '<button class="dlvc-ord" onclick="DeliveryModule._move(\''+s.id+'\',-1)" title="Subir parada"'+(i===0?' disabled':'')+'>▲</button>'+
          '<button class="dlvc-ord" onclick="DeliveryModule._move(\''+s.id+'\',1)" title="Bajar parada"'+(i===ships.length-1?' disabled':'')+'>▼</button>'+
          '<button class="dlvc-edit" onclick="DeliveryModule._openDrv(\''+s.id+'\')" title="Editar motorizado / inDriver">✏️ Editar</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');

  _renderHist();
}

/* ── Historial de motorizados (solo FINALIZADOS) ─────────────────── */
function _renderHist(){
  var fin=_getFinalized().slice().sort(function(a,b){
    return String(b._dlvFecha||b.date||'').localeCompare(String(a._dlvFecha||a.date||''));
  });
  var cnt=document.getElementById('dlvHistCnt');
  if(cnt) cnt.textContent='('+fin.length+')';
  var body=document.getElementById('dlvHistBody');
  if(!body) return;
  if(!fin.length){
    body.innerHTML='<div style="text-align:center;padding:14px;color:#8b949e;font-size:12px">Aún no hay entregas finalizadas.</div>';
    return;
  }
  body.innerHTML=fin.map(function(s){
    var drv=s._dlvDriver||'—';
    var rec=s._dlvReceptor||'';
    var fecha='';
    if(s._dlvFecha){ try{ fecha=new Date(s._dlvFecha).toLocaleString('es-PE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }catch(e){ fecha=String(s._dlvFecha).slice(0,16); } }
    return '<div class="dlvh-item">'+
      '<span style="font-size:15px">🛵</span>'+
      '<div style="flex:1;min-width:0">'+
        '<div style="font-size:12.5px;font-weight:700;color:#e6edf3">'+_esc(s.name)+'</div>'+
        '<div style="font-size:11px;color:#8b949e">Motorizado: <b style="color:#c9d1d9">'+_esc(drv)+'</b>'+(rec?' · Recibió: '+_esc(rec):'')+'</div>'+
        (fecha?'<div style="font-size:10px;color:#6e7681">📅 '+_esc(fecha)+'</div>':'')+
      '</div>'+
    '</div>';
  }).join('');
}

/* ── Driver ──────────────────────────────────────────────────────── */
// Pinta la lista de motorizados guardados; resalta el SELECCIONADO (_selectedDrv).
function _renderDrvList(){
  var list=document.getElementById('dlvDrvList');
  var curName=_selectedDrv?_selectedDrv.name:'';
  var chosen=document.getElementById('dlvDrvChosen');
  if(chosen) chosen.textContent=curName?('· '+curName):'';
  if(!list) return;
  list.innerHTML=_drivers.length
    ?_drivers.map(function(d){
        var sel=curName===d.name;
        return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:'+(sel?'rgba(163,113,247,.15)':'#1c2333')+';border:1px solid '+(sel?'rgba(163,113,247,.4)':'#30363d')+';border-radius:9px;cursor:pointer" onclick="DeliveryModule._selDrv(\''+d.name.replace(/'/g,"\\'")+'\',\''+( d.phone||'').replace(/'/g,"\\'")+'\')">'+
          '<span style="font-size:15px">🛵</span>'+
          '<div style="flex:1"><div style="font-size:13px;font-weight:600">'+_esc(d.name)+'</div>'+(d.phone?'<div style="font-size:11px;color:#8b949e">📞 '+_esc(d.phone)+'</div>':'')+  '</div>'+
          (sel?'<span style="color:var(--green)">✓</span>':'')+
          '<button onclick="event.stopPropagation();DeliveryModule._delDrv(\''+d.name.replace(/'/g,"\\'")+'\' )" style="background:none;border:none;color:#f78166;cursor:pointer;font-size:14px;padding:0 4px">✕</button>'+
        '</div>';
      }).join('')
    :'<div style="text-align:center;padding:16px;color:#8b949e;font-size:12px">Sin motorizados. Escribe uno arriba.</div>';
}
DeliveryModule._openDrv=function(id){
  _currentShipId=id; _loadDrivers();
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  // Selección inicial = el motorizado ya asignado al pedido (si lo hay).
  _selectedDrv=ship&&ship._dlvDriver?{name:ship._dlvDriver,phone:ship._dlvDriverPhone||''}:null;
  _renderDrvList();
  // Acordeón de motorizados colapsado por defecto (se usa solo si se necesita).
  var _db=document.getElementById('dlvDrvBody'); if(_db) _db.classList.remove('open');
  var _da=document.getElementById('dlvDrvArrow'); if(_da) _da.classList.remove('open');
  // Limpiar campos "Nuevo motorizado" al abrir
  var _dn=document.getElementById('dlvDrvName'); if(_dn) _dn.value='';
  var _dp=document.getElementById('dlvDrvPhone'); if(_dp) _dp.value='';
  // Input vacío; el link inDriver guardado se muestra como chip (patrón Agregar link)
  var _rl=document.getElementById('dlvRutaLink'); if(_rl) _rl.value='';
  var _rlist=document.getElementById('dlvRutaList');
  if(_rlist){
    var link=ship&&ship._dlvRutaLink?String(ship._dlvRutaLink):'';
    _rlist.innerHTML=link
      ?'<div class="link-item"><span>🔗</span><div class="link-name">'+_esc(link.length>34?link.slice(0,34)+'…':link)+'</div><a href="'+_escAttr(link)+'" target="_blank" rel="noopener" style="color:var(--blue);font-size:12px;text-decoration:none">↗</a><button class="link-del" type="button" onclick="DeliveryModule._removeRuta()">✕</button></div>'
      :'';
  }
  document.getElementById('dlvDrvOv').classList.add('open');
};
// Tocar un motorizado = SOLO seleccionarlo (resaltar). Se guarda con "Guardar y
// cerrar". Si escribes un nombre nuevo arriba, ese manda sobre esta selección.
DeliveryModule._selDrv=function(name,phone){
  _selectedDrv={name:name,phone:phone||''};
  var _dn=document.getElementById('dlvDrvName'); if(_dn) _dn.value=''; // el elegido es de la lista
  var _dp=document.getElementById('dlvDrvPhone'); if(_dp) _dp.value='';
  _renderDrvList();
};
DeliveryModule._delDrv=function(name){
  _drivers=_drivers.filter(function(d){return d.name!==name;});_saveDrivers();
  if(_selectedDrv&&_selectedDrv.name===name)_selectedDrv=null;
  _renderDrvList();
};
// GUARDAR Y CERRAR — mismo contrato que saveShipment del panel: captura lo
// pendiente, asigna, guarda incremental a Firestore, re-renderiza y cierra.
DeliveryModule._guardar=function(){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship){DeliveryModule._closeDrv();return;}
  // Resolver motorizado: nombre nuevo escrito MANDA; si no, el seleccionado.
  var newName=(document.getElementById('dlvDrvName')||{value:''}).value.trim();
  var newPhone=(document.getElementById('dlvDrvPhone')||{value:''}).value.trim();
  var drvName='',drvPhone='';
  if(newName){
    drvName=newName;drvPhone=newPhone;
    if(!_drivers.find(function(d){return d.name===newName;})){_drivers.push({name:newName,phone:newPhone});_saveDrivers();}
  }else if(_selectedDrv){
    drvName=_selectedDrv.name;drvPhone=_selectedDrv.phone||'';
  }
  if(drvName){ship._dlvDriver=drvName;ship._dlvDriverPhone=drvPhone;}
  // Link pendiente en el input (aún sin +Add) → se guarda igual (como el panel).
  var raw=(document.getElementById('dlvRutaLink')||{value:''}).value.trim();
  if(raw){var nl=_normLink(raw);if(nl)ship._dlvRutaLink=nl;}
  // Guardado incremental REAL a Firestore (mismo que el panel principal).
  if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(ship);
  if(typeof global.render==='function')global.render();
  DeliveryModule._closeDrv();_render();
  if(typeof global.toast==='function')global.toast(drvName?('🛵 '+drvName+' guardado'):'✅ Guardado');
};
DeliveryModule._closeDrv=function(){document.getElementById('dlvDrvOv').classList.remove('open');};
// Acordeón de motorizados guardados (mismo comportamiento que Documentos del envío)
DeliveryModule._toggleDrvList=function(){
  var body=document.getElementById('dlvDrvBody');
  var arrow=document.getElementById('dlvDrvArrow');
  if(!body||!arrow) return;
  var isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  arrow.classList.toggle('open',!isOpen);
};

/* ── Reordenar parada (mover orden de entrega) ───────────────────── */
// Normaliza _dlvOrden a 0..n-1 en el nuevo orden y guarda SOLO los que cambian.
// Es la fuente de verdad compartida con la impresión de etiquetas.
DeliveryModule._move=function(id,dir){
  var arr=_orderShips(_getShips());
  var i=-1; for(var k=0;k<arr.length;k++){ if(arr[k].id===id){ i=k; break; } }
  if(i<0) return;
  var j=i+dir; if(j<0||j>=arr.length) return;
  var tmp=arr[i]; arr[i]=arr[j]; arr[j]=tmp;
  arr.forEach(function(s,idx){
    if(s._dlvOrden!==idx){
      s._dlvOrden=idx;
      if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(s);
    }
  });
  _render();
};

/* ── Historial (acordeón, mismo comportamiento que Documentos del envío) ── */
DeliveryModule._toggleHist=function(){
  var body=document.getElementById('dlvHistBody');
  var arrow=document.getElementById('dlvHistArrow');
  if(!body||!arrow) return;
  var isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  arrow.classList.toggle('open',!isOpen);
};

// Orden de ruta expuesto para que la impresión de etiquetas DELIVERY coincida.
DeliveryModule.sortForRoute=function(list){ return _orderShips(list||[]); };

/* ── Link de ruta del motorizado (por pedido) ────────────────────── */
function _normLink(u){
  u=String(u||'').trim();
  if(!u) return '';
  if(/^javascript:/i.test(u)) return '';
  if(/^https?:\/\//i.test(u)) return u;
  if(/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // otros esquemas rechazados
  return 'https://'+u;
}
/* + Add: guarda el link inDriver del pedido y lo muestra como chip (patrón Agregar link). */
DeliveryModule._addRuta=function(){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var raw=(document.getElementById('dlvRutaLink')||{value:''}).value.trim();
  if(!raw){ if(typeof global.toast==='function')global.toast('Ingresa un link'); return; }
  var n=_normLink(raw);
  if(!n){ if(typeof global.toast==='function')global.toast('⚠️ Link inválido'); return; }
  ship._dlvRutaLink=n;
  if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(ship);
  DeliveryModule._openDrv(_currentShipId); // re-render chip + limpia input
  _render();                                // refresca la tarjeta
  if(typeof global.toast==='function')global.toast('🔗 Link inDriver agregado');
};
/* ✕ del chip: quita el link inDriver del pedido. */
DeliveryModule._removeRuta=function(){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  ship._dlvRutaLink=null; // null, no delete: propaga el "quitar" con updateMask
  if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(ship);
  DeliveryModule._openDrv(_currentShipId);
  _render();
  if(typeof global.toast==='function')global.toast('Link quitado');
};
/* Abrir la dirección en Google Maps (por id, para no meter la URL en el HTML). */
DeliveryModule._openMaps=function(id){
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===id;});
  if(ship) window.open(_mapsUrl(ship),'_blank');
};

/* Tap a un teléfono (cliente o motorizado) → mini-hoja Llamar / WhatsApp (reusa tel:/wa.me). */
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
DeliveryModule._closeConf=function(){document.getElementById('dlvConfOv').classList.remove('open');_currentShipId=null;_fotoBase64=null;};
DeliveryModule._foto=function(input){
  var file=input.files[0];if(!file)return;
  var r=new FileReader();
  r.onload=function(e){_fotoBase64=e.target.result;var pv=document.getElementById('dlvFotoPrev');if(pv){pv.src=_fotoBase64;pv.style.display='block';}};
  r.readAsDataURL(file);
};
DeliveryModule._clearSign=function(){var c=document.getElementById('dlvSign');if(c&&_signCtx)_signCtx.clearRect(0,0,c.width,c.height);};
DeliveryModule._confirmar=async function(){
  if(DeliveryModule._confirming)return; // evitar doble envío durante la subida
  var recep=(document.getElementById('dlvRecep')||{value:''}).value.trim();
  if(!recep){if(typeof global.toast==='function')global.toast('⚠️ Escribe el nombre de quien recibe');return;}
  var ship=((global.S&&global.S.shipments)||[]).find(function(x){return x.id===_currentShipId;});
  if(!ship)return;
  var firmaB64=null;var c=document.getElementById('dlvSign');if(c&&_signCtx)firmaB64=c.toDataURL('image/png');

  DeliveryModule._confirming=true;
  var btn=document.getElementById('dlvConfBtn');
  var btnTxt=btn?btn.textContent:'';
  if(btn){btn.disabled=true;btn.textContent='⏳ Guardando…';}

  // ★ Foto y firma van a Firebase Storage (URL), NO base64 en el doc: evita
  // superar el limite de 1MB por documento de Firestore (que haria fallar el
  // guardado). Reusa StorageModule.uploadFile/base64ToFile. Si la subida falla,
  // igual se registra la entrega (la foto/firma son complementarias).
  var SM=global.StorageModule;
  if(SM&&SM.uploadFile&&SM.base64ToFile){
    // Reintentos ante red intermitente (2s, 4s) para no perder foto/firma.
    var _subir=async function(b64,name,type,slot){
      var file=SM.base64ToFile(b64,name,type);
      for(var i=0;i<3;i++){
        try{ return (await SM.uploadFile(file,ship.id,slot)).d; }
        catch(e){ if(i<2) await new Promise(function(r){setTimeout(r,2000*(i+1));}); }
      }
      return null;
    };
    if(_fotoBase64){
      var uF=await _subir(_fotoBase64,'delivery-foto.jpg','image/jpeg','delivery-foto');
      if(uF) ship._dlvFoto=uF; else if(typeof global.toast==='function')global.toast('⚠️ No se pudo subir la foto — se guardó sin ella');
    }
    if(firmaB64){
      var uS=await _subir(firmaB64,'delivery-firma.png','image/png','delivery-firma');
      if(uS) ship._dlvFirma=uS; // firma opcional: si falla, seguir
    }
  }

  ship.status='FINALIZADO';ship._dlvDone=true;ship._dlvReceptor=recep;ship._dlvFecha=new Date().toISOString();
  if(typeof global._fbSaveShipmentNow==='function')global._fbSaveShipmentNow(ship);
  if(typeof global.render==='function')global.render();
  DeliveryModule._confirming=false;
  if(btn){btn.disabled=false;btn.textContent=btnTxt;}
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
