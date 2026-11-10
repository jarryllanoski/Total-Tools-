/**
 * cliente/form-agencias.js — el buscador de sedes (Shalom, Olva…) y elegir sede
 * ==============================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ─── BUSCADOR DE AGENCIAS (Shalom, Olva, …) ─────────────────────────
   Una sola fuente de datos por courier: JSON local (rápido, sin red) →
   caché de localStorage (24h) → Cloud Function en vivo (respaldo). El mismo
   widget/lógica sirve para cualquier courier que esté en este mapa; agregar
   uno nuevo = una entrada más, sin tocar el resto del buscador. */
const AGENCY_SOURCES = {
  SHALOM: {
    label: 'Shalom',
    version: '2026-10-30', // meta.generado
    jsonPath: './data/agencias-shalom.json',
    // Sin respaldo en vivo: la función agenciasShalom se retiró (el portal de
    // Shalom exige reCAPTCHA v3). El buscador usa solo el catálogo local, que
    // es rápido y funciona sin red. Ver docs/SHALOM.md.
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
window._agData  = window._agData  || {}; // por courier: catálogo normalizado
window._agCache = window._agCache || {}; // por courier: últimos resultados mostrados
window._agSel   = window._agSel   || {}; // por courier: agencia elegida (objeto completo)

async function agPrecargar(key){
  const cfg = AGENCY_SOURCES[key]; if(!cfg) return;
  if(window._agData[key] && window._agData[key].length) return;
  const cacheK = 'ag_agencias_cache_' + cfg.cacheKey;
  const timeK  = 'ag_agencias_time_'  + cfg.cacheKey;
  /* ★ VERSIÓN DEL CATÁLOGO (`cfg.version`) = fecha de `meta.generado` del
     JSON. Al actualizar data/agencias-shalom.json se cambia allí y en
     config.js (SHALOM_CATALOGO_V); una prueba exige que coincidan. Sin esto,
     un navegador que ya tenía la lista la seguía usando hasta 24 h. */
  const verK   = 'ag_agencias_ver_'   + cfg.cacheKey;
  // 1. Intentar cache localStorage (24h) — y de la MISMA versión del catálogo.
  try{
    const cached = localStorage.getItem(cacheK);
    const cachedTime = parseInt(localStorage.getItem(timeK)||'0');
    const verOk = !cfg.version || localStorage.getItem(verK) === cfg.version;
    if(cached && verOk && (Date.now()-cachedTime) < 86400000){
      window._agData[key] = JSON.parse(cached);
      return;
    }
  }catch(ce){}
  // 2. Intentar JSON local ./data/agencias-<courier>.json
  try{
    // `?v=`: que el navegador no sirva la copia vieja del archivo.
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
  // 3. Fallback: Cloud Function en vivo (solo si el courier la tiene; Shalom ya
  //    no — se queda con el catálogo local cargado arriba).
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

/* La lupa late solo mientras el cliente aún no busca ni elige. */
function _agLupa(late){
  var b=document.querySelector('.ag-buscar'); if(b) b.classList.toggle('quieto', !late);
  if(!late){
    if(b) b.classList.remove('ag-buscar-foco');
    var h=$('agLupaHint'); if(h) h.classList.remove('on');
  }
}
function agOnInput(key, val){
  _agLupa(!String(val||'').trim());
  /* Escribir para buscar OTRA sede deshace la elección ENTERA. Antes solo se
     vaciaba la dirección y la lista habría seguido marcando «Seleccionada»
     una sede que el pedido ya no tenía. */
  agState.addr = '';
  _agElegidaK = ''; window._agIdent = null; window._agIdentTxt = '';
  if(window._agSel) window._agSel[key] = null;
  const _st = $('shalomSelTxt'); if(_st) _st.textContent = '';
  _cercaToken++; // el cliente escribió: invalida cualquier "cerca de mí" en curso
  const badge = $('shalomSelBadge');
  if(badge) badge.style.display='none';
  clearTimeout(_agTimer);
  if(!val || val.length < 2){
    const spin = $('shalomSpin');
    if(spin) spin.style.display='none';
    // Buscador vacío: vuelve la lista por cercanía, si había desde dónde medir.
    if(!val && _agRef && _agRef.tipo!=='sede'){
      agMostrar(key, AgLista.cercanas(_agTodas(key), _agRef.la, _agRef.lo, _AG_CERCA_N), '');
      return;
    }
    const drop = $('shalomDrop');
    if(drop) drop.style.display='none';
    // Sin filtro: vuelve la vista de todo el Perú, con pines NO tocables.
    if(!val) agMapaPintar(key, _agTodas(key), {todas:true});
    _paso3Continuar();
    return;
  }
  const spin = $('shalomSpin');
  if(spin) spin.style.display='block';
  _agTimer = setTimeout(()=> agBuscar(key, val), 350);
}

// Distancia en km entre dos coordenadas (haversine, client-side).
function _haversineKm(la1,lo1,la2,lo2){
  var R=6371, toR=Math.PI/180;
  var dLa=(la2-la1)*toR, dLo=(lo2-lo1)*toR;
  var a=Math.sin(dLa/2)*Math.sin(dLa/2)+Math.cos(la1*toR)*Math.cos(la2*toR)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
/* ═══ ELEGIR SEDE: ubicación, mapa y lista (31/10/2026) ════════════════
   UNA VERDAD: la LISTA (_agCache[key]). Todo lo demás solo decide QUÉ
   lista se ve:
     · «Usar mi ubicación» → las más cercanas a ti;
     · tocar el mapa       → nada (sin filtro avisa los dos caminos);
     · escribir            → las que coinciden;
     · tocar un pin        → esa sede, elegida, ARRIBA de la lista.
   Elegir es UNA puerta (_agElegir), venga de un pin o de una fila: dos
   caminos serían dos maneras de perder el ter_id que necesita el registro
   en Shalom. Si algo falla (permiso, red, mapa), lo demás sigue. Cero
   lecturas en la nube: catálogo local y distancias en el teléfono. */
var _cercaToken=0;        // invalida resultados tardíos si el cliente ya escribió
var _cercaEnCurso=false;  // guard doble-toque
var _agRef=null;          // {la, lo, tipo:'tu'|'sede'} desde dónde se mide
var _agElegidaK='';       // clave de la sede elegida (ter_id, o nombre+dirección)
var _AG_CERCA_N=20;       // cuántas sedes cercanas se listan

/* Lógica PURA de la lista (sin DOM): se prueba sola. */
var AgLista = {
  clave: function(ag){
    if(!ag) return '';
    return ag.ter_id ? 'id:'+ag.ter_id : 'n:'+String(ag.nombre||'')+'|'+String(ag.direccion||'');
  },
  coords: function(ag){
    var la=parseFloat(ag&&ag.latitud), lo=parseFloat(ag&&ag.longitud);
    if(!isFinite(la)||!isFinite(lo)) return null;
    if(la<-19||la>0||lo<-82||lo>-68) return null;   // fuera de Perú = dato malo
    return [la,lo];
  },
  /* «LIMA / LIMA / CARABAYLLO / AV JOSE SACO ROJAS» → «Shalom Carabayllo
     (Av Jose Saco Rojas)». Olva («TIENDA CHACHAPOYAS - JR…») queda tal cual,
     en minúsculas bonitas. */
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
  /* Las `n` más cercanas a un punto, con su distancia. Las que no tienen
     coordenadas no entran (no se puede decir que estén cerca). */
  cercanas: function(todas, la, lo, n){
    return (todas||[]).map(function(ag){
      var c=AgLista.coords(ag); if(!c) return null;
      var x=Object.assign({}, ag); x._distKm=_haversineKm(la,lo,c[0],c[1]); return x;
    }).filter(Boolean).sort(function(a,b){ return a._distKm-b._distKm; }).slice(0, n||20);
  },
  /* La elegida, PRIMERA. Si no estaba en la lista, se añade arriba. */
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

/* Al llegar al paso: el mapa con TODAS las sedes (para tocar tu zona), y si
   el cliente YA había dado permiso de ubicación, se ubica solo, sin
   preguntar nada. Nunca se pide permiso sin que el cliente toque algo. */
function agIniciar(key){
  var el=_agElegidaObj(key);
  if(el){ _agElegir(key, el, {restaurar:true}); return; }   // volvió al paso: su sede sigue arriba
  agMapaPintar(key, _agTodas(key), {todas:true});
  try{
    if(navigator.permissions && navigator.permissions.query){
      navigator.permissions.query({name:'geolocation'}).then(function(st){
        if(st && st.state==='granted') agUbicarme(key, {silencioso:true});
      }).catch(function(){});
    }
  }catch(e){}
}

/* El paso de la sede se pinta al elegir el courier (paso 1), pero se VE en
   el paso 3. Iniciarlo entonces dibujaría el mapa en un contenedor oculto
   —Leaflet lo mide en cero y sale gris al aparecer— y se miraría la
   ubicación fuera de contexto. Se espera a que el paso esté en pantalla. */
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

// Estado del botón principal: el texto dice lo que GANA el cliente.
var _AG_BUSCANDO='Buscando sedes cerca de ti…';   // UN texto para los dos botones
function _cercaBtnBuscando(on){
  var btn=document.getElementById('shalomCercaBtn'); if(!btn) return;
  var txt=btn.querySelector('.cerca-txt'); if(!txt) return;
  btn.disabled=on;
  txt.textContent=on?_AG_BUSCANDO:'Usar mi ubicación';
}
// Si no se pudo ubicar: se dice QUÉ hacer, sin callejón sin salida.
/* La ubicación no llegó. Mensaje amable y DOS salidas concretas, distinto
   según la CAUSA (30/10/2026). Hay dos interruptores que el celular confunde:
     · 'sitio'  → Chrome tiene la página bloqueada (🔒 › Permisos). La página
                  NO puede volver a preguntar: solo el cliente lo cambia.
     · 'gps'    → el permiso está, pero el celular tiene la ubicación apagada.
     · 'pregunta' → cerró el aviso del navegador sin responder.
   Antes salía el MISMO texto para todo, y al reintentar se repintaba igual:
   parecía que el botón no hacía nada. */
