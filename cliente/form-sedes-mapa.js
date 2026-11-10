/**
 * cliente/form-sedes-mapa.js — el mapa de sedes y elegir una (fila o pin)
 * ========================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ★ EL MAPA NO FILTRA (30/10/2026). Antes, tocar un punto vacío listaba
   las sedes de esa zona: un toque sin querer (o en la vista de todo el
   Perú) mandaba al cliente a otra ciudad. Ahora los filtros salen SOLO de
   dos caminos: su ubicación o la lupa. Tocar el mapa sin filtro avisa
   cuáles son, sin mover nada. */
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
    // 1. Buscar en cache local
    const dataset = window._agData[key];
    if(dataset && dataset.length){
      const _nrm = s => String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const qu = _nrm(q);
      // POR PALABRAS, no por frase literal. Antes se buscaba la consulta entera
      // como una sola cadena, asi que "Lima Miraflores" daba CERO: en el texto
      // pone "lima / lima / miraflores" y esas dos palabras nunca van seguidas.
      // Y "san juan lurigancho" tampoco, porque el nombre real lleva un "de" en
      // medio. Con palabras sueltas el orden da igual y los conectores sobran.
      // Se descartan las de 1 letra (harian coincidir todo); si no queda
      // ninguna, se usa la consulta entera como una sola palabra.
      let palabras = qu.split(/[\s/,.\-]+/).filter(w => w.length > 1);
      if(!palabras.length) palabras = [qu];
      const todasEn   = t => palabras.every(w => t.indexOf(w) !== -1);
      const abrenPalabra = t => palabras.every(w => (' '+t).indexOf(' '+w) !== -1);
      const _claveM = [];  // coincide por nombre/ubicación (prioritario)
      const _dirM   = [];  // coincide solo por dirección (relleno)
      dataset.forEach((ag,idx)=>{
        const clave = _nrm([ag.lugar_over||ag.nombre, ag.zona||ag.distrito, ag.provincia, ag.departamento].join(' '));
        const extra = _nrm(ag.direccion);
        let score;
        // Con UNA sola palabra estos tres niveles dan exactamente el mismo
        // resultado que la version anterior: las busquedas de una palabra no
        // cambian en nada.
        if(clave.indexOf(qu)===0)          score=0; // empieza con lo buscado, tal cual
        else if(abrenPalabra(clave))       score=1; // cada palabra empieza una palabra
        else if(todasEn(clave))            score=2; // todas, en nombre/ubicación
        else { if(palabras.every(w => clave.indexOf(w)!==-1 || extra.indexOf(w)!==-1))
                 _dirM.push({ag,idx});
               return; }
        _claveM.push({ag,score,idx});
      });
      _claveM.sort((a,b)=>a.score-b.score||a.idx-b.idx);
      resultados = _claveM.map(x=>x.ag);
      // Tope 40: cubre cualquier departamento salvo Lima (186). El dropdown scrollea.
      const TOPE = 40;
      // Relleno por dirección solo si falta para llenar, CON GUARDA:
      //  - si hay coincidencias por ubicación → solo del MISMO departamento (no mezcla zonas).
      //  - si NO hay ninguna (búsqueda por landmark/dirección pura) → permite todas
      //    (si no, devolvería 0 y rompería ese caso).
      if(resultados.length < TOPE && _dirM.length){
        const deps = new Set(_claveM.map(x=>x.ag.departamento));
        const relleno = _claveM.length ? _dirM.filter(x=>deps.has(x.ag.departamento)) : _dirM;
        resultados = resultados.concat(relleno.map(x=>x.ag));
      }
      // Aviso solo cuando hay MUCHAS por ubicación (caso Lima): guiar a afinar.
      if(_claveM.length > TOPE) aviso = _claveM.length + ' sedes — escribe tu distrito (ej. Miraflores) para afinar';
      resultados = resultados.slice(0, TOPE);
    }
    // 2. Si no hay resultados, consultar API (Shalom ya no la tiene → se omite)
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
  // La elegida, SIEMPRE arriba (aunque una búsqueda o un toque cambie el resto).
  const el = _agElegidaObj(key);
  const lista = AgLista.conElegida(agencias, el);
  /* ★ ELEGIDA = LISTA RECOGIDA (30/10/2026): queda solo «✓ Tu sede» y un
     «Cambiar sede». Así no se toca otra al desplazarse, y ver SU sede fija
     refuerza la decisión. «Cambiar» la vuelve a abrir. */
  const recogida = !!el && !_agListaAbierta;
  // Distancias desde el punto de referencia, si lo hay y la sede no la trae.
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
  // El nombre ya está en la tarjeta de abajo: el encabezado solo celebra.
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
  // El momento de elegir es un pequeño pico (regla del pico y el final).
  drop.classList.toggle('ag-recien', recogida && _agRecien);
  drop.style.display='block';
  agMapaPintar(key, lista, {});
  _paso3Continuar();
  _agRecien=false;
}
var _agRecien=false;   // true SOLO justo después de que el cliente elige
var _agListaAbierta=false;
function agCambiar(key){
  _agListaAbierta=true;
  agMostrar(key, window._agCache[key]||[], '');
}
/* ★ CONTINUAR DICE EN QUÉ ESTADO ESTÁS (30/10/2026): sin sede, apagado y
   «Elige una sede para continuar»; con sede, «Continuar con esta sede →».
   Solo en el paso de la sede con mapa; en lo demás, el de siempre. */
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
  /* Gradiente de meta: con la sede elegida la barra avanza un poco más y
     dice «¡Ya casi!». Sin sede vuelve a su sitio. */
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
/* Tocó Continuar sin sede: en vez de un error rojo, se le lleva a los dos
   caminos (ubicación y lupa), iluminados. Sin teclado: elige él. */
function _agGuiarEleccion(){
  var c=$('agUbicCaja'), b=document.querySelector('.ag-buscar'), h=$('agLupaHint');
  if(h) h.classList.add('on');
  [c,b].forEach(function(x){ if(!x) return; var k=x===c?'ag-guia':'ag-buscar-foco'; x.classList.remove(k); void x.offsetWidth; x.classList.add(k); });
  var destino=(c && c.style.display!=='none') ? c : (h||b);
  try{ if(destino) destino.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}
}

/* ─── EL MAPA DE SEDES ──────────────────────────────────────────────────
   ⚠️ EL MAPA NO ES OTRA FORMA DE ELEGIR: tocar un pin pasa por la MISMA
   puerta que tocar una fila (_agElegir). Pines ROJOS dibujados aquí (sin
   descargar imágenes); tu ubicación es un PUNTO azul que no se puede tocar.

   ⚠️ Y LA LISTA MANDA. El mapa solo aparece si Leaflet carga y hay
   coordenadas. Las sedes sin coordenadas (19 en Shalom) salen en la lista y
   se eligen igual. Si el CDN está caído, el formulario funciona igual.

   En la PC se arrastra con el mouse (dragging) y la rueda hace zoom SOLO
   tras hacer clic dentro del mapa: si no, la rueda atraparía la página.

   No cuesta ni una llamada: `latitud` y `longitud` ya venían en el
   catálogo local, cacheado con su versión. */
var _mapa=null, _mapaMarcas=[], _mapaCarga=null, _miUbic=null, _miPunto=null, _mapaKey='', _mapaTodas=false;

/** Carga Leaflet UNA vez y solo cuando hace falta (perezoso: quien pide a
    domicilio no llega a este paso). */
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
      js.onerror=function(){ res(false); };   // sin mapa, con lista
      document.head.appendChild(js);
    }catch(e){ res(false); }
  });
  return _mapaCarga;
}

function _agCoords(ag){
  var la=parseFloat(ag&&ag.latitud), lo=parseFloat(ag&&ag.longitud);
  if(!isFinite(la)||!isFinite(lo)) return null;
  // Fuera de Perú es un dato malo, no una sede lejana: un cero o un signo
  // cambiado mandaría el mapa al Atlántico y escondería todo lo demás.
  if(la<-19||la>0||lo<-82||lo>-68) return null;
  return [la,lo];
}

/* Celular: con UN dedo sobre un mapa que no se arrastra, se avisa «Usa dos
   dedos» (dos dedos mueven y acercan; un dedo desplaza la página). */
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
/* Teselas de OpenStreetMap: UNA definición para todos los mapas. */
function _mapaCapa(m){
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {maxZoom:19, attribution:'© OpenStreetMap'}).addTo(m);
}
/* El pin rojo (SVG en línea). `grande` = la elegida. */
function _agIcono(grande, salta){
  var w=grande?36:26, h=grande?48:35;
  return L.divIcon({className:'ag-pin'+(salta?' ag-pin-salta':''), iconSize:[w,h], iconAnchor:[w/2,h], popupAnchor:[0,-h+4],
    html:'<svg width="'+w+'" height="'+h+'" viewBox="0 0 26 35" aria-hidden="true"><path d="M13 0C5.8 0 0 5.7 0 12.8 0 22.4 13 35 13 35s13-12.6 13-22.2C26 5.7 20.2 0 13 0z" fill="'+(grande?'#b91c1c':'#e11d2e')+'" stroke="#fff" stroke-width="1.6"/><circle cx="13" cy="12.6" r="4.6" fill="#fff"/></svg>'});
}

/* opc.todas: el mapa de bienvenida con TODAS las sedes (para tocar tu zona);
   sin él, las de la lista que se está viendo. */
async function agMapaPintar(key, agencias, opc){
  opc=opc||{};
  // Se lee YA (antes del await): agMostrar baja la bandera al terminar.
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
      /* ★ CELULAR: el mapa se mueve con DOS dedos (30/10/2026). Con uno,
         deslizar la página sobre el mapa movía el mapa y el cliente quedaba
         atrapado. Un dedo desplaza la página; tocar un pin sigue igual; dos
         dedos mueven y acercan. En la PC se arrastra con el mouse. */
      var _tactil = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
      _mapa=L.map('shalomMapa',{
        dragging:!_tactil,          // con el mouse en la PC
        scrollWheelZoom:false,      // la rueda NO atrapa la página…
        tap:true, attributionControl:true
      });
      if(_tactil) _mapaDosDedos(_mapa, $('agMapaDedos'));
      _mapaCapa(_mapa);
      // …salvo después de hacer clic en el mapa; al salir se apaga.
      _mapa.on('click focus', function(){ try{ _mapa.scrollWheelZoom.enable(); }catch(e){} });
      _mapa.on('mouseout blur', function(){ try{ _mapa.scrollWheelZoom.disable(); }catch(e){} });
      // Tocar el mapa SIN filtro: aviso de los dos caminos, sin mover nada.
      _mapa.on('click', function(){ if(_mapaTodas) _agMapaAviso(); });
    }
    _mapaKey=key;
    /* ★ PINES TOCABLES SOLO CON FILTRO (30/10/2026). En la vista de todo el
       Perú los ~540 pines se amontonan y se tocaba uno al azar. Ahí solo se
       VEN (cobertura); tocar el mapa acerca esa zona y lista sus sedes. Con
       ubicación, búsqueda o zona tocada, los pocos que quedan sí se tocan. */
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
        // LA MISMA PUERTA que la lista: la sede, no un índice que cambia.
        m.on('click', function(){ _agElegir(key, g.ag); });
      }
      _mapaMarcas.push({m:m, i:g.i, k:AgLista.clave(g.ag)});
    });
    /* ★ DÓNDE ESTÁS TÚ — un PUNTO azul, no un pin: no se elige ni se toca. */
    if(_miPunto){ try{ _mapa.removeLayer(_miPunto); }catch(e){} _miPunto=null; }
    if(_miUbic){
      // Halo que late (CSS .ag-yo-halo) + el punto encima. Ninguno se toca.
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
      // Las 8 más cercanas encuadradas (no las 20: quedarían muy chiquitas).
      var pts=conGeo.slice(0,8).map(function(g){ return g.c; });
      if(_agRef && _agRef.tipo!=='sede') pts.push([_agRef.la,_agRef.lo]);
      _mapa.fitBounds(pts, {padding:[24,24], maxZoom:15});
    }
    // El contenedor nace oculto y Leaflet mide mal lo que no se ve.
    setTimeout(function(){ try{ _mapa.invalidateSize(); }catch(e){} }, 60);
  }catch(e){
    // Un mapa que revienta no puede llevarse por delante el formulario.
    wrap.style.display='none';
  }
}

/* Señalar la elegida en el mapa (lo hace agMapaPintar al repintar la lista:
   pin grande y delante). Se conservan estas dos por compatibilidad. */
function agMapaMarcar(i){
  if(!_mapa || !_mapaMarcas.length) return;
  try{
    var x=_mapaMarcas.find(function(m){ return m.i===i; });
    if(x) _mapa.setView(x.m.getLatLng(), Math.max(_mapa.getZoom()||0, 14), {animate:true});
  }catch(e){/* el mapa nunca puede romper la eleccion */}
}
function agMapaDesmarcar(){
  try{ if(_mapa) _mapa.closePopup(); }catch(e){}
}

/* Tocar una fila de la lista. */
function agSel(key, i){
  const ag = (window._agCache[key]||[])[i];
  if(ag) _agElegir(key, ag);
}

/* ★ LA ÚNICA PUERTA PARA ELEGIR (fila o pin). Guarda lo que el pedido
   necesita —igual que siempre— y repinta la lista con la elegida ARRIBA y
   marcada. No avanza de paso: el cliente lo ve y pulsa «Continuar» (en un
   mapa es fácil tocar un pin por error). */
function _agElegir(key, ag, opc){
  if(!ag) return;
  _agLupa(false);
  // Solo cuando ELIGE el cliente (no al volver al paso): animación y vibración.
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
  /* ★ LA AGENCIA IDENTIFICADA: sin el ter_id, registrar el envío en Shalom
     es imposible. Ver functions/agencias.js. */
  window._agIdent = (window.Agencias ? Agencias.elegida(ag, key) : null);
  window._agIdentTxt = agState.addr;
  _agElegidaK = AgLista.clave(ag);
  _agListaAbierta = false;
  // La lista que se ve: la actual si ya la incluía; si no (pin del mapa de
  // bienvenida), las cercanas a ESA sede. En las dos, la elegida arriba.
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
  // Escrita a mano no hay agencia identificada, y no se adivina.
  window._agIdent = null; window._agIdentTxt = '';
}

function agReset(key){
  _agLupa(true);
  agState.addr = '';
  window._agSel[key] = null;
  window._agIdent = null; window._agIdentTxt = '';
  _agElegidaK = '';
  // El mapa SE QUEDA (es el que ayuda a volver a elegir); solo se cierra
  // el globo de la que estaba elegida.
  agMapaDesmarcar();
  const inp = $('shalomAgInput');
  if(inp) inp.value = '';
  const drop = $('shalomDrop');
  if(drop){ drop.style.display='none'; drop.innerHTML=''; }
  const badge = $('shalomSelBadge');
  if(badge) badge.style.display='none';
  // Vaciar el TEXTO, no solo ocultarlo: la etiqueta viva lo lee con textContent,
  // que devuelve el texto aunque el elemento este oculto. Sin esto, al pulsar la
  // ✕ la etiqueta seguia mostrando la sede borrada y parecia un fallo de la app.
  const txt = $('shalomSelTxt');
  if(txt) txt.textContent = '';
  _paso3Continuar();
}
