/**
 * dashboard.js — Panel de métricas Total Tools
 * Activación: doble-tap en el nombre del negocio (hdrName)
 * Lee S.shipments desde memoria — cero llamadas a Firebase
 */
(function(global){
'use strict';

/* ── CSS ─────────────────────────────────────────────────────────── */
function _injectCSS(){
  if(document.getElementById('dashCSS')) return;
  var s = document.createElement('style');
  s.id = 'dashCSS';
  s.textContent = [
    '#dashOv{display:none;position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:850;overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '#dashOv.open{display:block}',
    '#dashSheet{max-width:480px;margin:0 auto;padding:16px 16px 48px}',
    '.dash-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #21262d}',
    '.dash-ttl{font-family:Syne,sans-serif;font-size:20px;font-weight:900;color:#e6edf3;letter-spacing:-.3px}',
    '.dash-sub{font-size:10px;color:#8b949e;margin-top:3px}',
    '.dash-close{background:none;border:1px solid #30363d;border-radius:8px;color:#8b949e;font-size:12px;padding:6px 14px;cursor:pointer;font-family:inherit;flex-shrink:0;margin-top:2px}',
    '.dash-sec{margin-bottom:14px;background:#161b22;border:1px solid #21262d;border-radius:14px;padding:14px}',
    '.dash-sec-ttl{font-size:9px;font-weight:700;color:#8b949e;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:12px}',
    '.dash-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.dash-kpi{background:#0d1117;border:1px solid #21262d;border-radius:10px;padding:11px 12px}',
    '.dash-kpi-n{font-size:21px;font-weight:900;line-height:1;margin-bottom:3px}',
    '.dash-kpi-l{font-size:10px;color:#8b949e;line-height:1.4}',
    '.c-green{color:#3fb950}.c-blue{color:#388bfd}.c-orange{color:#d29922}.c-red{color:#f85149}.c-purple{color:#a371f7}',
    '.dash-bar-row{display:flex;align-items:center;gap:8px;margin-bottom:7px}',
    '.dash-bar-row:last-child{margin-bottom:0}',
    '.dash-bar-lbl{font-size:11px;color:#e6edf3;width:110px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dash-bar-wrap{flex:1;background:#0d1117;border-radius:4px;height:12px;overflow:hidden}',
    '.dash-bar-fill{height:100%;border-radius:4px}',
    '.dash-bar-val{font-size:11px;color:#8b949e;min-width:24px;text-align:right;flex-shrink:0}',
    '.dash-rank{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #21262d}',
    '.dash-rank:last-child{border-bottom:none;padding-bottom:0}',
    '.dash-rank-pos{font-size:10px;font-weight:700;color:#8b949e;min-width:18px;text-align:center}',
    '.dash-rank-info{flex:1;min-width:0}',
    '.dash-rank-name{font-size:12px;font-weight:700;color:#e6edf3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dash-rank-sub{font-size:10px;color:#8b949e;margin-top:1px}',
    '.dash-rank-cnt{font-size:14px;font-weight:900;color:#388bfd;flex-shrink:0}',
    '.dash-rank-cnt span{font-size:9px;color:#8b949e;font-weight:400}',
    '.dash-time-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
    '.dash-time-cell{background:#0d1117;border-radius:10px;padding:11px;text-align:center}',
    '.dash-time-n{font-size:22px;font-weight:900;color:#a371f7;line-height:1}',
    '.dash-time-l{font-size:10px;color:#8b949e;margin-top:3px}',
    '.dash-alert-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid #21262d}',
    '.dash-alert-row:last-child{border-bottom:none;padding-bottom:0}',
    '.dash-alert-lbl{font-size:12px;color:#c9d1d9}',
    '.dash-alert-cnt{font-size:14px;font-weight:900;color:#f85149}',
    '.dash-alert-ok{font-size:14px;font-weight:900;color:#3fb950}',
    '.dash-empty{font-size:12px;color:#8b949e;text-align:center;padding:8px 0}',
  ].join('');
  document.head.appendChild(s);
}

/* ── Overlay ─────────────────────────────────────────────────────── */
function _injectOverlay(){
  if(document.getElementById('dashOv')) return;
  var ov = document.createElement('div');
  ov.id = 'dashOv';
  ov.innerHTML = '<div id="dashSheet"></div>';
  ov.addEventListener('click', function(e){ if(e.target===ov) DashBoard.cerrar(); });
  document.body.appendChild(ov);
}

/* ── Helpers ─────────────────────────────────────────────────────── */
function _esc(str){
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _money(n){ return 'S/ '+Number(n||0).toFixed(2); }
function _pct(n,total){ return total>0?Math.round(n/total*100):0; }
function _monthKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function _weekStart(){
  var d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-d.getDay()); return d;
}
function _extractProvincia(s){
  if(s.ciudadDestino) return s.ciudadDestino.toUpperCase().trim();
  var a=(s.address||'').trim();
  if(a.includes('/')) return a.split('/')[0].trim().toUpperCase();
  return '';
}

/* ── Barra CSS ───────────────────────────────────────────────────── */
var ST_COLORS={
  'NUEVO PEDIDO':'#d29922','EN PROCESO':'#d29922','POR ALISTAR':'#388bfd',
  'ALISTADO':'#388bfd','ENVIADO':'#a371f7','LLEGÓ A DESTINO':'#3fb950',
  'PENDIENTE DE PAGO':'#f85149','FINALIZADO':'#3fb950'
};

function _renderBars(items, maxVal, colorFn){
  if(!items.length) return '<div class="dash-empty">Sin datos</div>';
  return items.map(function(it){
    var pct = maxVal>0 ? Math.round(it.count/maxVal*100) : 0;
    var color = colorFn ? colorFn(it.key) : '#388bfd';
    return '<div class="dash-bar-row">'+
      '<div class="dash-bar-lbl" title="'+_esc(it.key)+'">'+_esc(it.key)+'</div>'+
      '<div class="dash-bar-wrap"><div class="dash-bar-fill" style="width:'+pct+'%;background:'+color+'"></div></div>'+
      '<div class="dash-bar-val">'+it.count+'</div>'+
    '</div>';
  }).join('');
}

/* ── Cómputo de métricas ─────────────────────────────────────────── */
function _compute(){
  var all = (typeof S!=='undefined' && Array.isArray(S.shipments)) ? S.shipments : [];
  var now = new Date();
  var todayStr = now.toISOString().slice(0,10);
  var thisMon  = _monthKey(now);
  var prevDate = new Date(now); prevDate.setMonth(prevDate.getMonth()-1);
  var prevMon  = _monthKey(prevDate);
  var weekSt   = _weekStart();

  var total=0, ingresoTotal=0, ingresoMes=0, ingresoPrevMes=0;
  var conCosto=0, sinCosto=0, finalizados=0, pendPago=0;
  var hoy=0, semana=0, mes=0;
  var statusMap={}, courierMap={}, clientMap={}, provMap={};

  all.forEach(function(s){
    total++;
    var cost = parseFloat(s.cost)||0;
    ingresoTotal += cost;
    if(cost>0) conCosto++; else sinCosto++;

    var fecha = (s.date||'').slice(0,10);
    if(fecha && fecha.slice(0,7)===thisMon)  ingresoMes     += cost;
    if(fecha && fecha.slice(0,7)===prevMon)  ingresoPrevMes += cost;

    // Actividad temporal — usa createdAt si existe, si no date
    var refD = s.createdAt ? new Date(s.createdAt) : (fecha ? new Date(fecha+'T12:00:00') : null);
    if(refD && !isNaN(refD)){
      if(refD.toISOString().slice(0,10)===todayStr) hoy++;
      if(refD>=weekSt) semana++;
      if(_monthKey(refD)===thisMon) mes++;
    }

    // Estado
    var st=s.status||'Sin estado';
    statusMap[st]=(statusMap[st]||0)+1;
    if(st==='PENDIENTE DE PAGO') pendPago++;
    if(st==='FINALIZADO') finalizados++;

    // Courier
    var co=s.courier||'Sin courier';
    courierMap[co]=(courierMap[co]||0)+1;

    // Cliente (agrupa por teléfono)
    var ph=(s.phone||'').trim();
    if(ph){
      if(!clientMap[ph]) clientMap[ph]={name:s.name||'—',phone:ph,count:0};
      clientMap[ph].count++;
      if(s.name && clientMap[ph].name==='—') clientMap[ph].name=s.name;
    }

    // Provincia
    var prov=_extractProvincia(s);
    if(prov) provMap[prov]=(provMap[prov]||0)+1;
  });

  function sortDesc(map){ return Object.keys(map).map(function(k){return{key:k,count:map[k]};}).sort(function(a,b){return b.count-a.count;}); }

  return {
    total, ingresoTotal, ingresoMes, ingresoPrevMes,
    ticketProm: conCosto>0 ? ingresoTotal/conCosto : 0,
    conCosto, sinCosto, finalizados, pendPago,
    hoy, semana, mes,
    statusList:  sortDesc(statusMap),
    courierList: sortDesc(courierMap),
    clientList:  Object.values(clientMap).sort(function(a,b){return b.count-a.count;}).slice(0,10),
    provList:    sortDesc(provMap).slice(0,10),
  };
}

/* ── Render HTML ─────────────────────────────────────────────────── */
function _render(d){
  var mesDiff = d.ingresoMes - d.ingresoPrevMes;
  var mesDiffTxt = (mesDiff>=0?'+':'')+mesDiff.toFixed(2);
  var mesDiffColor = mesDiff>=0?'#3fb950':'#f85149';

  var maxSt   = d.statusList.length  ? d.statusList[0].count  : 1;
  var maxCo   = d.courierList.length ? d.courierList[0].count : 1;
  var maxProv = d.provList.length    ? d.provList[0].count    : 1;

  var html = '';

  /* HEADER */
  html += '<div class="dash-hdr">'+
    '<div>'+
      '<div class="dash-ttl">Dashboard</div>'+
      '<div class="dash-sub">'+new Date().toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric'})+'</div>'+
    '</div>'+
    '<button class="dash-close" onclick="DashBoard.cerrar()">✕ Cerrar</button>'+
  '</div>';

  /* RESUMEN FINANCIERO */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Resumen financiero</div>'+
    '<div class="dash-grid2">'+
      '<div class="dash-kpi"><div class="dash-kpi-n c-green">'+_money(d.ingresoTotal)+'</div><div class="dash-kpi-l">Ingresos totales</div></div>'+
      '<div class="dash-kpi"><div class="dash-kpi-n c-blue">'+_money(d.ingresoMes)+'</div><div class="dash-kpi-l">Este mes &nbsp;<span style="color:'+mesDiffColor+';font-size:9px">'+mesDiffTxt+'</span></div></div>'+
      '<div class="dash-kpi"><div class="dash-kpi-n c-orange">'+_money(d.ticketProm)+'</div><div class="dash-kpi-l">Ticket promedio</div></div>'+
      '<div class="dash-kpi"><div class="dash-kpi-n '+(d.sinCosto?'c-red':'c-green')+'">'+d.sinCosto+'</div><div class="dash-kpi-l">Sin costo asignado</div></div>'+
    '</div>'+
  '</div>';

  /* ACTIVIDAD TEMPORAL */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Actividad</div>'+
    '<div class="dash-time-grid">'+
      '<div class="dash-time-cell"><div class="dash-time-n">'+d.hoy+'</div><div class="dash-time-l">Hoy</div></div>'+
      '<div class="dash-time-cell"><div class="dash-time-n">'+d.semana+'</div><div class="dash-time-l">Esta semana</div></div>'+
      '<div class="dash-time-cell"><div class="dash-time-n">'+d.mes+'</div><div class="dash-time-l">Este mes</div></div>'+
      '<div class="dash-time-cell"><div class="dash-time-n">'+d.total+'</div><div class="dash-time-l">Total histórico</div></div>'+
    '</div>'+
  '</div>';

  /* PIPELINE POR ESTADO */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Pipeline por estado</div>'+
    _renderBars(d.statusList, maxSt, function(k){ return ST_COLORS[k]||'#58a6ff'; })+
  '</div>';

  /* POR COURIER */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Por courier / agencia</div>'+
    _renderBars(d.courierList, maxCo, function(){ return '#388bfd'; })+
  '</div>';

  /* TOP 10 CLIENTES */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Top 10 clientes</div>'+
    (d.clientList.length ? d.clientList.map(function(c,i){
      return '<div class="dash-rank">'+
        '<div class="dash-rank-pos">'+(i+1)+'</div>'+
        '<div class="dash-rank-info">'+
          '<div class="dash-rank-name">'+_esc(c.name)+'</div>'+
          '<div class="dash-rank-sub">'+_esc(c.phone)+'</div>'+
        '</div>'+
        '<div class="dash-rank-cnt">'+c.count+' <span>env</span></div>'+
      '</div>';
    }).join('') : '<div class="dash-empty">Sin datos</div>')+
  '</div>';

  /* TOP 10 PROVINCIAS */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Top 10 provincias / ciudades</div>'+
    (d.provList.length ?
      _renderBars(d.provList, maxProv, function(){ return '#a371f7'; }) :
      '<div class="dash-empty">Las direcciones no tienen formato de provincia</div>')+
  '</div>';

  /* ALERTAS */
  html += '<div class="dash-sec">'+
    '<div class="dash-sec-ttl">Alertas</div>'+
    '<div class="dash-alert-row"><span class="dash-alert-lbl">Pendientes de pago</span><span class="dash-alert-'+(d.pendPago?'cnt':'ok')+'">'+d.pendPago+'</span></div>'+
    '<div class="dash-alert-row"><span class="dash-alert-lbl">Sin costo asignado</span><span class="dash-alert-'+(d.sinCosto?'cnt':'ok')+'">'+d.sinCosto+'</span></div>'+
    '<div class="dash-alert-row"><span class="dash-alert-lbl">Finalizados acumulados</span><span class="dash-alert-ok">'+d.finalizados+'</span></div>'+
  '</div>';

  document.getElementById('dashSheet').innerHTML = html;
}

/* ── API Pública ─────────────────────────────────────────────────── */
var DashBoard = {};

DashBoard.abrir = function(){
  var ov = document.getElementById('dashOv');
  if(!ov) return;
  try {
    var data = _compute();
    _render(data);
    ov.scrollTop = 0;
    ov.classList.add('open');
  } catch(e){
    console.warn('[DashBoard] Error:', e);
    if(typeof window.toast==='function') toast('⚠️ Error al abrir dashboard');
  }
};

DashBoard.cerrar = function(){
  var ov = document.getElementById('dashOv');
  if(ov) ov.classList.remove('open');
};

DashBoard.init = function(){
  _injectCSS();
  _injectOverlay();
};

global.DashBoard = DashBoard;

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', DashBoard.init);
} else {
  DashBoard.init();
}

})(window);
