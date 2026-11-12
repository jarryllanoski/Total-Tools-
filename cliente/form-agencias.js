'use strict';

const AGENCY_SOURCES = {
  SHALOM: {
    label: 'Shalom',
    version: '2026-11-12',
    jsonPath: './data/agencias-shalom.json',
    apiUrl: '',
    cacheKey: 'shalom'
  },
  OLVA: {
    label: 'Olva',
    jsonPath: './data/agencias-olva.json',
    apiUrl: 'https://us-central1-total-tools-24ce8.cloudfunctions.net/agenciasOlva',
    cacheKey: 'olva'
  }
};
function _agSourceKey(courierName){
  const u=(courierName||'').toUpperCase();
  if(u.includes('SHALOM')) return 'SHALOM';
  if(u.includes('OLVA'))   return 'OLVA';
  return null;
}
let _agTimer = null;
window._agData  = window._agData  || {};
window._agCache = window._agCache || {};
window._agSel   = window._agSel   || {};

async function agPrecargar(key){
  const cfg = AGENCY_SOURCES[key]; if(!cfg) return;
  if(window._agData[key] && window._agData[key].length) return;
  const cacheK = 'ag_agencias_cache_' + cfg.cacheKey;
  const timeK  = 'ag_agencias_time_'  + cfg.cacheKey;
  const verK   = 'ag_agencias_ver_'   + cfg.cacheKey;
  try{
    const cached = localStorage.getItem(cacheK);
    const cachedTime = parseInt(localStorage.getItem(timeK)||'0');
    const verOk = !cfg.version || localStorage.getItem(verK) === cfg.version;
    if(cached && verOk && (Date.now()-cachedTime) < 86400000){
      window._agData[key] = JSON.parse(cached);
      return;
    }
  }catch(ce){}
  try{
    const rLocal = await fetch(cfg.jsonPath + (cfg.version ? '?v=' + cfg.version : ''));
    if(rLocal.ok){
      const jLocal = await rLocal.json();
      const listaLocal = jLocal.agencias || jLocal.data || jLocal || [];
      if(Array.isArray(listaLocal) && listaLocal.length > 0){
        window._agData[key] = listaLocal;
        try{
          localStorage.setItem(cacheK, JSON.stringify(listaLocal));
          localStorage.setItem(timeK, String(Date.now()));
          if(cfg.version) localStorage.setItem(verK, cfg.version);
        }catch(se){}
        return;
      }
    }
  }catch(le){ console.warn('['+cfg.label+'] JSON local no disponible:', le.message); }
  if(!cfg.apiUrl) return;
  try{
    const r = await fetch(cfg.apiUrl);
    if(!r.ok) return;
    const j = await r.json();
    const lista = j.resultados || j.agencias || j.data || j || [];
    if(Array.isArray(lista) && lista.length){
      window._agData[key] = lista;
      localStorage.setItem(cacheK, JSON.stringify(lista));
      localStorage.setItem(timeK, String(Date.now()));
    }
  }catch(e){}
}

function toggleShalomHelp(){
  const box=$('shalomHelpBox');
  const btn=$('shalomHelpBtn');
  if(!box) return;
  const visible = box.style.display !== 'none';
  box.style.display = visible ? 'none' : 'block';
  if(btn) btn.style.background = visible ? 'rgba(56,139,253,.15)' : 'rgba(56,139,253,.3)';
}

function _agLupa(late){
  var b=document.querySelector('.ag-buscar'); if(b) b.classList.toggle('quieto', !late);
  if(!late){
    if(b) b.classList.remove('ag-buscar-foco');
    var h=$('agLupaHint'); if(h) h.classList.remove('on');
  }
}
function agOnInput(key, val){
  _agLupa(!String(val||'').trim());
  agState.addr = '';
  _agElegidaK = ''; window._agIdent = null; window._agIdentTxt = '';
  if(window._agSel) window._agSel[key] = null;
  const _st = $('shalomSelTxt'); if(_st) _st.textContent = '';
  _cercaToken++;
  const badge = $('shalomSelBadge');
  if(badge) badge.style.display='none';
  clearTimeout(_agTimer);
  if(!val || val.length < 2){
    const spin = $('shalomSpin');
    if(spin) spin.style.display='none';
    if(!val && _agRef && _agRef.tipo!=='sede'){
      agMostrar(key, AgLista.cercanas(_agTodas(key), _agRef.la, _agRef.lo, _AG_CERCA_N), '');
      return;
    }
    const drop = $('shalomDrop');
    if(drop) drop.style.display='none';
    if(!val) agMapaPintar(key, _agTodas(key), {todas:true});
    _paso3Continuar();
    return;
  }
  const spin = $('shalomSpin');
  if(spin) spin.style.display='block';
  _agTimer = setTimeout(()=> agBuscar(key, val), 350);
}

function _haversineKm(la1,lo1,la2,lo2){
  var R=6371, toR=Math.PI/180;
  var dLa=(la2-la1)*toR, dLo=(lo2-lo1)*toR;
  var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*toR)*Math.cos(la2*toR)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
var _cercaToken=0;
var _cercaEnCurso=false;
var _agRef=null;
var _agElegidaK='';
var _AG_CERCA_N=20;

var AgLista = {
  clave: function(ag){
    if(!ag) return '';
    return ag.ter_id ? 'id:'+ag.ter_id : 'n:'+String(ag.nombre||'')+'|'+String(ag.direccion||'');
  },
  coords: function(ag){
    var la=parseFloat(ag&&ag.latitud), lo=parseFloat(ag&&ag.longitud);
    if(!isFinite(la)||!isFinite(lo)) return null;
    if(la<-19||la>0||lo<-82||lo>-68) return null;
    return [la,lo];
  },
  titulo: function(ag, marca){
    var bonito=function(t){ return String(t||'').toLowerCase().replace(/(^|[\s(\/.-])([a-záéíóúñü])/g,function(m,a,b){ return a+b.toUpperCase(); }); };
    var n=String((ag&&(ag.lugar_over||ag.nombre))||'').trim();
    var partes=n.split('/').map(function(x){ return x.trim(); }).filter(Boolean);
    if(partes.length<2) return bonito(n)||'Sede';
    var dist=bonito(ag.distrito||partes[2]||partes[partes.length-2]);
    var ult=bonito(partes[partes.length-1]);
    var base=(marca?marca+' ':'')+dist;
    return (ult && ult.toLowerCase()!==dist.toLowerCase()) ? base+' ('+ult+')' : base;
  },
  km: function(d){
    if(d==null||!isFinite(d)) return '';
    return d<1 ? Math.round(d*1000)+' m' : d.toFixed(1)+' km';
  },
  cercanas: function(todas, la, lo, n){
    return (todas||[]).map(function(ag){
      var c=AgLista.coords(ag); if(!c) return null;
      var x=Object.assign({}, ag); x._distKm=_haversineKm(la,lo,c[0],c[1]); return x;
    }).filter(Boolean).sort(function(a,b){ return a._distKm-b._distKm; }).slice(0, n||20);
  },
  conElegida: function(lista, elegida){
    if(!elegida) return (lista||[]).slice();
    var k=AgLista.clave(elegida);
    var resto=(lista||[]).filter(function(ag){ return AgLista.clave(ag)!==k; });
    var la=(lista||[]).find(function(ag){ return AgLista.clave(ag)===k; })||elegida;
    return [la].concat(resto);
  }
};

function _agTodas(key){ return (window._agData && window._agData[key]) || []; }
function _agElegidaObj(key){
  if(!_agElegidaK) return null;
  return _agTodas(key).find(function(ag){ return AgLista.clave(ag)===_agElegidaK; }) || null;
}

function agIniciar(key){
  var el=_agElegidaObj(key);
  if(el){ _agElegir(key, el, {restaurar:true}); return; }
  agMapaPintar(key, _agTodas(key), {todas:true});
  try{
    if(navigator.permissions && navigator.permissions.query){
      navigator.permissions.query({name:'geolocation'}).then(function(st){
        if(st && st.state==='granted') agUbicarme(key, {silencioso:true});
      }).catch(function(){});
    }
  }catch(e){}
}

var _agVerObs=null;
function agIniciarAlVer(key){
  var caja=$('agUbicCaja'); var box=caja && caja.parentNode;
  var arrancar=function(){
    agPrecargar(key).then(function(){ agIniciar(key); }, function(){ agIniciar(key); });
  };
  try{ if(_agVerObs){ _agVerObs.disconnect(); _agVerObs=null; } }catch(e){}
  if(!box || typeof IntersectionObserver!=='function'){ arrancar(); return; }
  _agVerObs=new IntersectionObserver(function(ent){
    if(ent.some(function(x){ return x.isIntersecting; })){
      try{ _agVerObs.disconnect(); }catch(e){} _agVerObs=null;
      arrancar();
    }
  });
  _agVerObs.observe(box);
}

var _AG_BUSCANDO='Buscando sedes cerca de ti…';
function _cercaBtnBuscando(on){
  var btn=document.getElementById('shalomCercaBtn'); if(!btn) return;
  var txt=btn.querySelector('.cerca-txt'); if(!txt) return;
  btn.disabled=on;
  txt.textContent=on?_AG_BUSCANDO:'Usar mi ubicación';
}
