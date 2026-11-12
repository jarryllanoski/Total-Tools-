'use strict';

function _agMapaAviso(){
  var d=$('agMapaDedos'); if(!d) return;
  d.textContent='Usa tu ubicación o busca tu provincia o distrito';
  d.classList.add('on'); clearTimeout(_agMapaAviso._t);
  _agMapaAviso._t=setTimeout(function(){ d.classList.remove('on'); }, 1800);
  _agGuiarEleccion();
}
function agVerTodos(key){
  try{
    if(!_mapa) return;
    var pts=_mapaMarcas.map(function(x){ return x.m.getLatLng(); });
    if(_miUbic) pts.push(L.latLng(_miUbic.la,_miUbic.lo));
    if(pts.length) _mapa.fitBounds(L.latLngBounds(pts), {padding:[24,24], maxZoom:15});
  }catch(e){}
}
function agMiPosicion(key){
  if(_miUbic && _mapa){ try{ _mapa.setView([_miUbic.la,_miUbic.lo], 14, {animate:true}); }catch(e){} return; }
  agUbicarme(key);
}
async function agBuscar(key, q){
  const cfg = AGENCY_SOURCES[key]; if(!cfg) return;
  const drop = $('shalomDrop');
  const spin = $('shalomSpin');
  try{
    let resultados = [];
    let aviso = '';
    const dataset = window._agData[key];
    if(dataset && dataset.length){
      const _nrm = s => String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const qu = _nrm(q);
      let palabras = qu.split(/[\s/,.\-]+/).filter(w => w.length > 1);
      if(!palabras.length) palabras = [qu];
      const todasEn   = t => palabras.every(w => t.indexOf(w) !== -1);
      const abrenPalabra = t => palabras.every(w => (' '+t).indexOf(' '+w) !== -1);
      const _claveM = [];
      const _dirM   = [];
      dataset.forEach((ag,idx)=>{
        const clave = _nrm([ag.lugar_over||ag.nombre, ag.zona||ag.distrito, ag.provincia, ag.departamento].join(' '));
        const extra = _nrm(ag.direccion);
        let score;
        if(clave.indexOf(qu)===0)          score=0;
        else if(abrenPalabra(clave))       score=1;
        else if(todasEn(clave))            score=2;
        else { if(palabras.every(w => clave.indexOf(w)!==-1 || extra.indexOf(w)!==-1))
                 _dirM.push({ag,idx});
               return; }
        _claveM.push({ag,score,idx});
      });
      _claveM.sort((a,b)=>a.score-b.score||a.idx-b.idx);
      resultados = _claveM.map(x=>x.ag);
      const TOPE = 40;
      if(resultados.length < TOPE && _dirM.length){
        const deps = new Set(_claveM.map(x=>x.ag.departamento));
        const relleno = _claveM.length ? _dirM.filter(x=>deps.has(x.ag.departamento)) : _dirM;
        resultados = resultados.concat(relleno.map(x=>x.ag));
      }
      if(_claveM.length > TOPE) aviso = _claveM.length + ' sedes — escribe tu distrito (ej. Miraflores) para afinar';
      resultados = resultados.slice(0, TOPE);
    }
    if(!resultados.length && cfg.apiUrl){
      const r = await fetch(cfg.apiUrl + '?q=' + encodeURIComponent(q));
      if(r.ok){
        const j = await r.json();
        const lista = j.resultados || j.agencias || j.data || j || [];
        resultados = (Array.isArray(lista)?lista:[]).slice(0,40);
      }
    }
    if(spin) spin.style.display='none';
    agMostrar(key, resultados, aviso);
  }catch(e){
    if(spin) spin.style.display='none';
    if(drop){
      drop.innerHTML='<div style="padding:12px 14px"><div style="font-size:12px;color:var(--red);margin-bottom:8px">⚠️ No se pudo cargar agencias</div>'+
        '<button onclick="agBuscar(\''+key+'\', document.getElementById(\'shalomAgInput\').value)" '+
        'style="background:rgba(79,142,247,.15);border:1px solid rgba(79,142,247,.3);border-radius:8px;'+
        'color:var(--blue);padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;width:100%;margin-bottom:8px">'+
        '🔄 Reintentar</button>'+
        '<div style="font-size:11px;color:var(--text2);margin-bottom:6px">O escribe la agencia manualmente:</div>'+
        '<input class="fi" style="font-size:13px" placeholder="Ej: Agencia Lima Centro" oninput="agManual(\''+key+'\', this.value)"></div>';
      drop.style.display='block';
    }
  }
}

function agMostrar(key, agencias, aviso){
  const drop = $('shalomDrop');
  if(!drop) return;
  if(!agencias.length){
    drop.innerHTML='<div style="padding:12px 14px;text-align:center">'
      +'<div style="font-size:24px;margin-bottom:8px">🔍</div>'
      +'<div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:6px">Sin resultados</div>'
      +'<div style="font-size:11px;color:var(--text2);line-height:1.6">Intenta buscar por:<br>'
      +'<b>ciudad</b> · <b>distrito</b> · <b>nombre de agencia</b>, o toca tu zona en el mapa</div>'
      +'</div>';
    drop.style.display='block';
    return;
  }
  const el = _agElegidaObj(key);
  const lista = AgLista.conElegida(agencias, el);
  const recogida = !!el && !_agListaAbierta;
  if(_agRef){
    lista.forEach(function(ag){
      if(ag._distKm==null){ var c=AgLista.coords(ag); if(c) ag._distKm=_haversineKm(_agRef.la,_agRef.lo,c[0],c[1]); }
    });
  }
  window._agCache[key] = lista;
  const cfg = AGENCY_SOURCES[key] || {};
  const _q = (($('shalomAgInput')||{}).value||'').trim();
  let cab = '';
  if(aviso) cab = '📍 '+esc(aviso);
  else if(!_q && _agRef && _agRef.tipo==='tu') cab = '📍 Sedes más cercanas a ti';
  if(!el && !_q) cab = (cab ? cab+' · ' : '') + '👇 Toca tu sede';
  if(recogida) cab = '✓ ¡Listo! Aquí recogerás tu pedido';
  drop.innerHTML = (cab ? '<div class="ag-lista-cab">'+cab+'</div>' : '') + (recogida ? lista.slice(0,1) : lista).map((ag,i)=>{
    const sel = !!el && AgLista.clave(ag)===_agElegidaK;
    const km  = (_agRef && _agRef.tipo!=='sede') ? AgLista.km(ag._distKm) : '';
    const pie = [esc(ag.departamento||''), ag.ter_id ? 'Agencia #'+esc(ag.ter_id) : '']
      .filter(Boolean).join(' · ');
    return `<div onclick="agSel('${key}', ${i})" class="ag-item${sel?' ag-item-sel':''}" role="button" aria-pressed="${sel}">
      <div class="ag-item-ic" aria-hidden="true">${sel?'<svg class="ag-chk" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':'📍'}</div>
      <div style="flex:1;min-width:0">
        <div class="ag-item-t">${esc(AgLista.titulo(ag, cfg.label||''))}</div>
        ${ag.direccion?`<div class="ag-item-d">${esc(ag.direccion)}</div>`:''}
        <div class="ag-item-p">${pie}${km?` <span class="ag-item-km">${km}</span>`:''}${sel?' <span class="ag-chip">Seleccionada</span>':''}</div>
        ${sel && (ag.horario||ag.hora_atencion)?`<div class="ag-item-d">🕐 ${esc(ag.horario||ag.hora_atencion)}</div>`:''}
      </div>
    </div>`;
  }).join('') + (recogida ? `<button type="button" class="ag-cambiar" onclick="agCambiar('${key}')">Cambiar sede</button>` : '');
  drop.classList.toggle('ag-recien', recogida && _agRecien);
  drop.style.display='block';
  agMapaPintar(key, lista, {});
  _paso3Continuar();
  _agRecien=false;
}
var _agRecien=false;
var _agListaAbierta=false;
function agCambiar(key){
  _agListaAbierta=true;
  agMostrar(key, window._agCache[key]||[], '');
}
function _paso3Continuar(){
  var b=document.querySelector('.wz-step[data-step="3"] .wz-nav .btn-main'); if(!b) return;
  var sede = selCourierType==='agencia' && !!$('shalomDrop') && !$('agcManualInput');
  var dlv  = selCourierType==='delivery';
  if(!sede && !dlv){ b.textContent='Continuar →'; b.classList.remove('wz-apagado'); return; }
  var ok = sede ? !!agState.addr : !!getDeliveryAddr();
  var listo = sede ? 'Continuar con esta sede →' : 'Continuar con esta dirección →';
  var antes=!b.classList.contains('wz-apagado') && b.textContent===listo;
  b.textContent = ok ? listo : (sede ? 'Elige una sede para continuar' : 'Escribe tu dirección para continuar');
  b.classList.toggle('wz-apagado', !ok);
  if(ok && !antes) _ttBrillo(b);
  try{
    if(_wzStep===3 && sede){
      wzProgress();
      if(ok){
        var bar=document.querySelector('#wzProgress .wz-pbar i'), t=document.querySelector('#wzProgress .wz-ptxt');
        var seq=wzSeq(), n=seq.length, i=seq.indexOf(3);
        if(bar && i>=0){ bar.style.width=Math.round(((i+1.5)/n)*100)+'%'; bar.classList.add('tt-casi'); }
        if(t) t.textContent+=' · ¡Ya casi! Solo falta la fecha';
      }
    }
  }catch(e){}
}
function _agGuiarEleccion(){
  var c=$('agUbicCaja'), b=document.querySelector('.ag-buscar'), h=$('agLupaHint');
  if(h) h.classList.add('on');
  [c,b].forEach(function(x){ if(!x) return; var k=x===c?'ag-guia':'ag-buscar-foco'; x.classList.remove(k); void x.offsetWidth; x.classList.add(k); });
  var destino=(c && c.style.display!=='none') ? c : (h||b);
  try{ if(destino) destino.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}
}

var _mapa=null, _mapaMarcas=[], _mapaCarga=null, _miUbic=null, _miPunto=null, _mapaKey='', _mapaTodas=false;

function agMapaCargar(){
  if(_mapaCarga) return _mapaCarga;
  _mapaCarga = new Promise(function(res){
    if(window.L) return res(true);
    try{
      var css=document.createElement('link');
      css.rel='stylesheet';
      css.href='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
      document.head.appendChild(css);
      var js=document.createElement('script');
      js.src='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
      js.onload=function(){ res(!!window.L); };
      js.onerror=function(){ res(false); };
      document.head.appendChild(js);
    }catch(e){ res(false); }
  });
  return _mapaCarga;
}

function _agCoords(ag){
  var la=parseFloat(ag&&ag.latitud), lo=parseFloat(ag&&ag.longitud);
  if(!isFinite(la)||!isFinite(lo)) return null;
  if(la<-19||la>0||lo<-82||lo>-68) return null;
  return [la,lo];
}

function _mapaDosDedos(m, aviso){
  if(!aviso) return;
  var t=0;
  m.getContainer().addEventListener('touchmove', function(ev){
    if(!ev.touches || ev.touches.length!==1 || m.dragging.enabled()) return;
    aviso.textContent='Usa 2 dedos para mover el mapa';
    aviso.classList.add('on'); clearTimeout(t);
    t=setTimeout(function(){ aviso.classList.remove('on'); }, 1400);
  }, {passive:true});
}
function _mapaCapa(m){
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(m);
}
function _agIcono(grande, salta){
  var w=grande?36:26, h=grande?48:35;
  return L.divIcon({className:'ag-pin'+(salta?' ag-pin-salta':''), iconSize:[w,h], iconAnchor:[w/2,h], popupAnchor:[0,-h+4],
    html:'<svg width="'+w+'" height="'+h+'" viewBox="0 0 26 35" aria-hidden="true"><path d="M13 0C5.8 0 0 5.7 0 12.8 0 22.4 13 35 13 35s13-12.6 13-22.2C26 5.7 20.2 0 13 0z" fill="'+(grande?'#b91c1c':'#e11d2e')+'" stroke="#fff" stroke-width="1.6"/><circle cx="13" cy="12.6" r="4.6" fill="#fff"/></svg>'});
}

async function agMapaPintar(key, agencias, opc){
  opc=opc||{};
  var salta=_agRecien;
  var wrap=$('shalomMapaWrap');
  if(!wrap) return;
  var conGeo=[];
  (agencias||[]).forEach(function(ag,i){
    var c=_agCoords(ag);
    if(c) conGeo.push({i:i, c:c, ag:ag});
  });
  if(!conGeo.length){ wrap.style.display='none'; return; }
  var ok=await agMapaCargar();
  if(!ok || !window.L){ wrap.style.display='none'; return; }
  wrap.style.display='block';
  var ay=$('agMapaAyuda');
  if(ay){
    ay.style.display='block';
    var dedos=(window.matchMedia && matchMedia('(pointer:coarse)').matches) ? ' Muévelo con 2 dedos.' : '';
    ay.textContent = opc.todas
      ? 'Usa tu ubicación o busca tu provincia o distrito para ver tus sedes aquí.'+dedos
      : 'Toca un pin rojo o una sede de la lista para elegirla.'+dedos;
  }
  try{
    if(!_mapa || !document.getElementById('shalomMapa').contains(_mapa.getContainer())){
      if(_mapa){ try{ _mapa.remove(); }catch(e){} }
      var _tactil = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
      _mapa=L.map('shalomMapa',{
        dragging:!_tactil,
        scrollWheelZoom:false,
        tap:true, attributionControl:true
      });
      if(_tactil) _mapaDosDedos(_mapa, $('agMapaDedos'));
      _mapaCapa(_mapa);
      _mapa.on('click focus', function(){ try{ _mapa.scrollWheelZoom.enable(); }catch(e){} });
      _mapa.on('mouseout blur', function(){ try{ _mapa.scrollWheelZoom.disable(); }catch(e){} });
      _mapa.on('click', function(){ if(_mapaTodas) _agMapaAviso(); });
    }
    _mapaKey=key;
    var tocables = !opc.todas;
    _mapaTodas = !!opc.todas;
    _mapaMarcas.forEach(function(x){ try{ _mapa.removeLayer(x.m); }catch(e){} });
    _mapaMarcas=[];
    conGeo.forEach(function(g){
      var sel = AgLista.clave(g.ag)===_agElegidaK;
      var m=L.marker(g.c, {icon:_agIcono(sel, sel && salta), zIndexOffset: sel?1000:0, bubblingMouseEvents:false,
        interactive:tocables, keyboard:tocables}).addTo(_mapa);
      if(tocables){
        m.bindPopup('<b>'+esc(AgLista.titulo(g.ag, (AGENCY_SOURCES[key]||{}).label||''))+'</b><br>'+esc(g.ag.direccion||''));
        m.on('click', function(){ _agElegir(key, g.ag); });
      }
      _mapaMarcas.push({m:m, i:g.i, k:AgLista.clave(g.ag)});
    });
    if(_miPunto){ try{ _mapa.removeLayer(_miPunto); }catch(e){} _miPunto=null; }
    if(_miUbic){
      _miPunto=L.layerGroup([
        L.circleMarker([_miUbic.la,_miUbic.lo],{
          radius:7, color:'#2d7ff9', weight:2, fill:false, interactive:false, className:'ag-yo-halo'
        }),
        L.circleMarker([_miUbic.la,_miUbic.lo],{
          radius:7, color:'#fff', weight:2.5, fillColor:'#2d7ff9', fillOpacity:1,
          interactive:false
        })
      ]).addTo(_mapa);
    }
    var elegida=_mapaMarcas.find(function(x){ return x.k===_agElegidaK; });
    if(elegida){
      _mapa.setView(elegida.m.getLatLng(), Math.max(_mapa.getZoom()||0, 14), {animate:true});
    } else if(opc.todas){
      _mapa.fitBounds(conGeo.map(function(g){ return g.c; }), {padding:[16,16], maxZoom:15});
    } else {
      var pts=conGeo.slice(0,8).map(function(g){ return g.c; });
      if(_agRef && _agRef.tipo!=='sede') pts.push([_agRef.la,_agRef.lo]);
      _mapa.fitBounds(pts, {padding:[24,24], maxZoom:15});
    }
    setTimeout(function(){ try{ _mapa.invalidateSize(); }catch(e){} }, 60);
  }catch(e){
    wrap.style.display='none';
  }
}

function agMapaMarcar(i){
  if(!_mapa || !_mapaMarcas.length) return;
  try{
    var x=_mapaMarcas.find(function(m){ return m.i===i; });
    if(x) _mapa.setView(x.m.getLatLng(), Math.max(_mapa.getZoom()||0, 14), {animate:true});
  }catch(e){}
}
function agMapaDesmarcar(){
  try{ if(_mapa) _mapa.closePopup(); }catch(e){}
}

function agSel(key, i){
  const ag = (window._agCache[key]||[])[i];
  if(ag) _agElegir(key, ag);
}

function _agElegir(key, ag, opc){
  if(!ag) return;
  _agLupa(false);
  if(!(opc && opc.restaurar)){ _agRecien=true; _ttVibrar(); }
  const nombre = ag.lugar_over||ag.nombre||'';
  const dir    = ag.direccion||'';
  const geo    = [ag.zona||ag.distrito, ag.provincia, ag.departamento].filter(Boolean).join(', ');
  agState.addr = [nombre, dir, geo].filter(Boolean).join(' - ');
  window._agSel[key] = {
    nombre, direccion: dir,
    distrito: ag.zona||ag.distrito||'',
    provincia: ag.provincia||'',
    departamento: ag.departamento||'',
    telefono: ag.telefono||'',
    id: ag.ter_id||''
  };
  window._agIdent = (window.Agencias ? Agencias.elegida(ag, key) : null);
  window._agIdentTxt = agState.addr;
  _agElegidaK = AgLista.clave(ag);
  _agListaAbierta = false;
  let lista = (window._agCache[key]||[]);
  if(!lista.some(function(x){ return AgLista.clave(x)===_agElegidaK; })){
    const c = AgLista.coords(ag);
    if(c && !_agRef) _agRef = {la:c[0], lo:c[1], tipo:'sede'};
    lista = c ? AgLista.cercanas(_agTodas(key), (_agRef||{}).la||c[0], (_agRef||{}).lo||c[1], _AG_CERCA_N) : [ag];
  }
  agMostrar(key, lista, '');
  const drop = $('shalomDrop'); if(drop){ try{ drop.scrollTop = 0; }catch(e){} }
  const txt = $('shalomSelTxt');
  if(txt) txt.textContent = [nombre, dir, geo].filter(Boolean).join(' · ');
  $('err_agency')&&$('err_agency').classList.remove('show');
}

function agManual(key, val){
  agState.addr = val.trim();
  window._agSel[key] = val.trim() ? {nombre:val.trim(),direccion:'',distrito:'',provincia:'',departamento:'',telefono:'',id:''} : null;
  window._agIdent = null; window._agIdentTxt = '';
}

function agReset(key){
  _agLupa(true);
  agState.addr = '';
  window._agSel[key] = null;
  window._agIdent = null; window._agIdentTxt = '';
  _agElegidaK = '';
  agMapaDesmarcar();
  const inp = $('shalomAgInput');
  if(inp) inp.value = '';
  const drop = $('shalomDrop');
  if(drop){ drop.style.display='none'; drop.innerHTML=''; }
  const badge = $('shalomSelBadge');
  if(badge) badge.style.display='none';
  const txt = $('shalomSelTxt');
  if(txt) txt.textContent = '';
  _paso3Continuar();
}
