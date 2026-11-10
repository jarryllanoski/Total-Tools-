/**
 * cliente/form-delivery.js — delivery: dirección, punto en el mapa y enlace de mapa
 * ==================================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ─── DIRECCIÓN DE ENTREGA — UNA SOLA VERDAD ─────────────────────────
   El textarea #addrManualInput ES la dirección: no hay "modos" ni copias.
   · El botón de ubicación RELLENA ese mismo cuadro (si está vacío) y adjunta
     las coordenadas; el texto del cliente siempre manda.
   · Las coordenadas viven aparte y SOBREVIVEN a la edición del texto — antes
     se borraban al corregir, que es justo cuando el cliente está precisando
     su dirección. Se ven en el mapa de delivery, que él puede quitar.
   La usan submitOrder, el validador del asistente y la etiqueta viva. */
function getDeliveryAddr(){
  return ($('addrManualInput')||{value:''}).value.trim();
}


/* Al escribir: si ya hay texto, se limpia el error. Único punto de validación. */
function onDireccionInput(){
  if(getDeliveryAddr()) $('err_deliveryAddr')&&$('err_deliveryAddr').classList.remove('show');
  _paso3Continuar();
}

function _gpsBtn(html, ocupado){
  const b=$('addrGpsBtn'); if(!b) return;
  b.disabled=!!ocupado; b.innerHTML=html; b.style.opacity=ocupado?'.75':'';
}
function _gpsMsg(html){ const e=$('addrGpsMsg'); if(e){ e.style.display=html?'block':'none'; e.innerHTML=html||''; } }

// Navegador in-app (webview) donde la geolocalización suele bloquearse.
function _gpsWebviewInApp(){
  var ua=navigator.userAgent||'';
  return /WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|MicroMessenger|TikTok|Snapchat/i.test(ua);
}
// Adquisición robusta y REUTILIZABLE de ubicación. Pre-chequea el permiso (para
// no fallar en silencio cuando está denegado) y hace DOS etapas: alta precisión
// y, si falla por timeout/no-disponible, baja precisión (wifi/celda). Nunca se
// cuelga (timeouts) y siempre resuelve por onOk o onErr.
// onErr(codigo) con codigo: 'denegado' | 'no_soporta' | 'inseguro' | 'fallo'.
// opc.rapida: UNA petición de baja precisión (wifi/antena), máx. 8 s, y vale
// una posición de los últimos 5 min. Para elegir una agencia (km) sobra; el
// GPS fino es para el delivery, que llama sin opciones y sigue igual.
function _obtenerUbicacion(onOk, onErr, opc){
  if(!window.isSecureContext){ onErr('inseguro'); return; }
  if(!navigator.geolocation){ onErr('no_soporta'); return; }
  var listo=false;
  var ok=function(pos){ if(listo) return; listo=true; onOk(pos); };
  var pedir=function(){
    if(opc && opc.rapida){
      navigator.geolocation.getCurrentPosition(ok, function(err){
        if(listo) return; listo=true;
        onErr(err&&err.code===1?'denegado':'fallo');
      }, {enableHighAccuracy:false, timeout:8000, maximumAge:300000});
      return;
    }
    var etapa2=function(){
      navigator.geolocation.getCurrentPosition(ok, function(err){
        if(listo) return; listo=true;
        onErr(err&&err.code===1?'denegado':'fallo');
      }, {enableHighAccuracy:false, timeout:8000, maximumAge:120000});
    };
    navigator.geolocation.getCurrentPosition(ok, function(err){
      if(listo) return;
      if(err&&err.code===1){ listo=true; onErr('denegado'); return; }
      etapa2(); // timeout / no disponible → reintento en baja precisión
    }, {enableHighAccuracy:true, timeout:8000, maximumAge:60000});
  };
  // Pre-chequeo de permiso (si la API existe): denegado → no llamar, guiar.
  if(navigator.permissions&&navigator.permissions.query){
    navigator.permissions.query({name:'geolocation'}).then(function(st){
      if(st&&st.state==='denied'){ onErr('denegado'); return; }
      pedir();
    }).catch(function(){ pedir(); });
  } else { pedir(); }
}
function _gpsCopiarLink(btn){ try{ if(navigator.clipboard) navigator.clipboard.writeText(location.href); if(btn){ var o=btn.textContent; btn.textContent='✓ Copiado'; setTimeout(function(){ btn.textContent=o; },1500); } }catch(e){} }

/* ═══ DELIVERY: la ubicación de la PUERTA (30/10/2026) ═══════════════════
   Misma tubería que las sedes (_ubicNativo, _ubicMensaje…), con precisión
   fina, y un mapa para VER y CORREGIR el punto: un GPS en interiores falla
   ±200 m y eso manda al motorizado a otra cuadra.
     · con ubicación → vista previa + «¿Es aquí tu casa?» [Sí] [Ajustar];
       si la precisión es mala (>100 m), se abre el ajuste;
     · sin ubicación → mensaje por causa + «marca tu casa en el mapa»;
     · el cuadro de dirección sigue siendo LA dirección: el punto la
       acompaña (gpsCoords), y solo se sugiere texto si está vacío.
   Nunca se pone un punto sin un toque del cliente. */
var _dlvFallos=0, _dlvNativo=false, _dlvToken=0, _dlvOk=false, _dlvAcc=0, _dlvMapa=null;
var _DLV_LIMA=[-12.0464,-77.0428];   // centro por defecto si no hay punto

/* El botón de siempre (navegadores sin el nativo). */
function usarMiUbicacion(){
  _gpsBtn('<span class="geo-pin">📍</span> Buscando tu ubicación…', true);
  _gpsMsg('');
  var mio=++_dlvToken, t0=Date.now();
  var luego=function(fn){ var r=Math.max(0, 700-(Date.now()-t0)); if(r) setTimeout(fn, r); else fn(); };
  _obtenerUbicacion(function(pos){ luego(function(){
    _gpsBtn('📍 Usar mi ubicación', false);
    if(mio===_dlvToken) _dlvExito(pos);
  }); }, function(codigo){ _agPermiso().then(function(estado){ luego(function(){
    _gpsBtn('📍 Usar mi ubicación', false);
    if(mio===_dlvToken) _dlvError(codigo, estado);
  }); }); });
}
/* El nativo, conectado UNA vez a la tubería compartida. */
function _dlvConectar(){
  var g=$('dlvGeoNativo'); if(!g || g._conectado) return;
  g._conectado=true;
  // La pista «Agrega el número» se va cuando ESCRIBE el cliente (solo
  // eventos reales: rellenar por código no dispara 'input').
  var ta=$('addrManualInput'); if(ta) ta.addEventListener('input', function(){ _dlvPista(false); _dlvTextoAuto=''; });
  var mio=0;
  _dlvNativo=_ubicNativo(g, {
    invalido: function(){ usarMiUbicacion(); },
    inicio:   function(){ mio=++_dlvToken; _gpsMsg('<div class="dlv-msg">'+_AG_BUSCANDO.replace('sedes cerca de ti','tu ubicación')+'</div>'); },
    vigente:  function(){ return mio===_dlvToken; },
    exito:    function(pos){ _dlvExito(pos); },
    error:    function(c, e){ _dlvError(c, e); }
  });
}
function _dlvExito(pos){
  var la=pos.coords.latitude, lo=pos.coords.longitude, acc=Math.round(pos.coords.accuracy||0);
  if(!AgLista.coords({latitud:la, longitud:lo})){ _dlvError('fuera', ''); return; }
  _dlvFallos=0; _ubicReintento=null; _ubicReintentoGps=false;
  _gpsMsg('');
  /* MISMA pantalla en celular y PC (30/10/2026): nada se abre solo. Antes,
     con más de 100 m de error (la PC por wifi da ±110) se abría el ajuste
     y salía un aviso amarillo; en el celular (GPS) no — el mismo link se
     veía distinto. Ajustar es siempre decisión del cliente. */
  _dlvPunto(la, lo, {acc:acc});
}
function _dlvError(codigo, estado){
  _dlvFallos++;
  var caso=_ubicCasoDe(codigo, estado||'');
  _ubicTrasFallo(caso, function(){ if(selCourierType==='delivery' && $('deliveryAddrBox')) usarMiUbicacion(); });
  _gpsMsg('<div class="dlv-msg">'+_ubicMensaje(caso, '<a role="button" onclick="dlvAjustar()">marca tu casa en el mapa</a>', _dlvNativo)
    +' También puedes escribir tu dirección abajo 👇</div>');
  if(_dlvFallos>=2){   // segundo intento sin suerte: al cuadro de dirección
    var ta=$('addrManualInput');
    if(ta){ try{ ta.focus({preventScroll:true}); ta.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }
  }
}
/* ═══ LOS DATOS DE DELIVERY: DOS COSAS, CADA UNA EN SU SITIO ════════════
     · La DIRECCIÓN escrita (#addrManualInput) — obligatoria; es lo que van
       a leer la etiqueta, el WhatsApp y el panel (order.address).
     · El PUNTO en el mapa (_gpsLat/_gpsLon → order.gpsCoords) — opcional;
       es el enlace de Google Maps del WhatsApp.
   Se ayudan, nunca se pisan:
     · con punto, la dirección se LLENA SOLA (ver _dlvSugerirDireccion) y
       sigue al punto mientras el cliente no la toque;
     · lo que escribe el cliente es suyo: el punto ya no lo cambia ni lo borra;
     · número, Mz/Lt y referencia: opcionales, sugeridos en gris. */
var _DLV_PLACEHOLDER='Calle y número, Mz/Lt o dpto *';
var _dlvGeoMemo={};   // dirección ya consultada por punto (no repetir consultas)

/* EL punto de entrega: una sola función lo pone, venga del GPS o del ajuste. */
function _dlvPunto(la, lo, opc){
  opc=opc||{};
  _gpsLat=+Number(la).toFixed(6); _gpsLon=+Number(lo).toFixed(6);
  _dlvAcc=opc.acc||0; _dlvOk=!!opc.confirmado;
  _dlvSugerirDireccion(_gpsLat, _gpsLon);
  _dlvPintar(!!opc.salta);
  _dlvEstado();
  _paso3Continuar();
}
function quitarPin(){ _gpsLat=null; _gpsLon=null; _dlvReset(); }
function _dlvReset(){
  _dlvOk=false; _dlvAcc=0; _dlvFallos=0; _dlvToken++;
  // El texto que puso el punto se va con el punto; el del cliente se queda.
  var t0=$('addrManualInput');
  if(t0 && _dlvTextoAuto && t0.value===_dlvTextoAuto){ t0.value=''; onDireccionInput(); }
  _dlvTextoAuto='';
  _dlvModo('mirar');
  var p=$('dlvPrev'), c=$('dlvConfirma'), ta=$('addrManualInput');
  if(p) p.style.display='none';
  if(c){ c.style.display='none'; c.innerHTML=''; }
  if(ta) ta.placeholder=_DLV_PLACEHOLDER;
  _dlvPista(false);
}
function _dlvPista(on){ var e=$('dlvPista'); if(e) e.style.display=on?'block':'none'; }

/* La respuesta de OpenStreetMap → {calle, numero, zona}. */
function _dirDeNominatim(d){
  var a=(d&&d.address)||{};
  var road=a.road||a.pedestrian||a.footway||a.path||'';
  var num=a.house_number||'';
  var neigh=a.suburb||a.neighbourhood||a.city_district||a.quarter||'';
  var city=a.city||a.town||a.village||a.municipality||'';
  return {calle: road ? road+(num?' '+num:'') : '', numero: !!num,
    zona: [neigh, city!==neigh?city:''].filter(Boolean).join(', ')};
}
/* UNA consulta por punto (recordada), solo con el punto que sigue vigente:
   lo que pide el servicio gratuito de OpenStreetMap. */
/* ★ CON PUNTO, LA DIRECCIÓN SE LLENA SOLA (30/10/2026). El punto ya es la
   ubicación exacta (va en el enlace del WhatsApp): el texto es la ayuda
   para leerla y NO debe frenar al cliente. Se escribe lo mejor que haya
   —calle + barrio, o solo barrio, o «Punto marcado en el mapa» si el
   servicio no responde— y ese texto SIGUE al punto mientras el cliente no
   lo toque (_dlvTextoAuto). Apenas escribe algo, el texto es suyo. */
var _dlvTextoAuto='';
var _DLV_SIN_TEXTO='Punto marcado en el mapa';
function _dlvTextoDe(x){
  if(!x || x.fallo) return _DLV_SIN_TEXTO;
  return [x.calle, x.zona].filter(Boolean).join(', ') || _DLV_SIN_TEXTO;
}
function _dlvSugerirDireccion(la, lo){
  var k=la+','+lo;
  var usar=function(x){
    if(_gpsLat!==la || _gpsLon!==lo) return;          // ya es otro punto
    var ta=$('addrManualInput'); if(!ta) return;
    var mio = !!ta.value.trim() && ta.value!==_dlvTextoAuto;
    if(mio) return;                                   // lo escrito por el cliente manda
    ta.value=_dlvTextoAuto=_dlvTextoDe(x);
    onDireccionInput();
    _dlvPista(!(x && x.numero));
  };
  if(_dlvGeoMemo[k]){ usar(_dlvGeoMemo[k]); return; }
  // zoom=17: nivel de CALLE (trae la avenida más cercana, no solo el barrio).
  fetch('https://nominatim.openstreetmap.org/reverse?lat='+la+'&lon='+lo+'&zoom=17&format=json&accept-language=es')
    .then(function(r){ return r.json(); })
    .then(function(d){ _dlvGeoMemo[k]=_dirDeNominatim(d); usar(_dlvGeoMemo[k]); })
    .catch(function(){ usar({fallo:true}); });       // el cliente nunca queda bloqueado
}

/* ── EL mapa de delivery: uno, creado una vez, con dos modos ── */
var _dlvMarca=null, _dlvCirculo=null, _dlvModoAct='mirar';
function _dlvTactil(){ return !!(window.matchMedia && matchMedia('(pointer:coarse)').matches); }
function _dlvMapaListo(){
  return agMapaCargar().then(function(ok){
    var box=$('dlvPrev'); if(!ok || !window.L || !box) return null;
    try{
      box.style.display='block';
      if(!_dlvMapa || !box.contains(_dlvMapa.getContainer())){
        if(_dlvMapa){ try{ _dlvMapa.remove(); }catch(e){} }
        box.innerHTML='<div class="dlv-mapa" id="dlvMapaEl"></div>'
          +'<div class="dlv-aj-top">Mueve el mapa hasta que el pin quede en tu puerta</div>'
          +'<div class="dlv-aj-pin">'+_agIcono(true).options.html+'</div>'
          +'<div class="ag-mapa-dedos" id="dlvDedos" aria-hidden="true"></div>'
          +'<button type="button" class="dlv-volver" id="dlvVolverBtn" onclick="dlvVolver()">◎ Volver a mi punto</button>'
          +'<div class="dlv-aj-bot"><button type="button" class="dlv-aj-no" onclick="dlvAjusteCerrar()">Cancelar</button>'
          +'<button type="button" class="dlv-aj-ok" onclick="dlvAjusteOk()">✓ Entregar aquí</button></div>';
        _dlvMapa=L.map('dlvMapaEl',{dragging:!_dlvTactil(), touchZoom:true, scrollWheelZoom:false,
          doubleClickZoom:true, zoomControl:true, attributionControl:true});
        _mapaCapa(_dlvMapa);
        if(_dlvTactil()) _mapaDosDedos(_dlvMapa, $('dlvDedos'));
        _dlvMapa.on('moveend', _dlvVolverVisible);
        _dlvMarca=null;
      }
      return _dlvMapa;
    }catch(e){ box.style.display='none'; return null; }
  });
}
/* MIRAR: el pin fijo en el punto (no se toca). */
function _dlvPintar(salta){
  var box=$('dlvPrev'); if(!box) return;
  if(!(_gpsLat&&_gpsLon)){ if(_dlvModoAct!=='ajustar') box.style.display='none'; return; }
  _dlvMapaListo().then(function(m){
    if(!m || !(_gpsLat&&_gpsLon)) return;
    m.eachLayer(function(l){ if(!(l instanceof L.TileLayer)) m.removeLayer(l); });
    var c=[_gpsLat,_gpsLon];
    _dlvCirculo = (_dlvAcc>0 && !_dlvOk) ? L.circle(c,{radius:_dlvAcc, color:'#2d7ff9', weight:1, fillOpacity:.12, interactive:false}).addTo(m) : null;
    _dlvMarca=L.marker(c,{icon:_agIcono(true, salta), interactive:false, keyboard:false}).addTo(m);
    if(_dlvModoAct==='ajustar') _dlvMarcasVisibles(false);
    m.setView(c, 17);
    setTimeout(function(){ try{ m.invalidateSize(); if(_dlvModoAct!=='ajustar') m.setView(c, 17); }catch(e){} }, 60);
  });
}
/* Cambiar de modo: lo único que cambia es quién manda sobre el mapa. */
function _dlvModo(modo){
  _dlvModoAct=modo;
  var box=$('dlvPrev'), aj=(modo==='ajustar');
  if(box) box.classList.toggle('ajustando', aj);
  document.body.classList.toggle('dlv-ajustando', aj);
  var c=$('dlvConfirma'); if(c && aj) c.style.display='none';
  var dd=$('dlvDedos'); if(dd) dd.classList.remove('on');   // el aviso de «mirar» no sigue encima
  if(_dlvMapa){
    try{
      if(aj || !_dlvTactil()) _dlvMapa.dragging.enable(); else _dlvMapa.dragging.disable();
      _dlvMarcasVisibles(!aj);
      setTimeout(function(){ try{ _dlvMapa.invalidateSize(); }catch(e){} }, 60);
    }catch(e){}
  }
  _dlvVolverVisible();
}
/* En AJUSTAR solo se ve el pin del centro: el del punto y su círculo se ocultan. */
function _dlvMarcasVisibles(si){
  try{
    if(_dlvMarca) _dlvMarca.setOpacity(si?1:0);
    if(_dlvCirculo) _dlvCirculo.setStyle({opacity:si?1:0, fillOpacity:si?.12:0});
  }catch(e){}
}
/* «◎ Volver a mi punto» aparece si la vista se alejó del punto. */
function _dlvVolverVisible(){
  var b=$('dlvVolverBtn'); if(!b) return;
  var lejos=false;
  try{
    if(_dlvMapa && _gpsLat && _dlvModoAct==='mirar'){
      var a=_dlvMapa.latLngToContainerPoint([_gpsLat,_gpsLon]), z=_dlvMapa.getSize();
      lejos = a.x<20 || a.y<20 || a.x>z.x-20 || a.y>z.y-20 || _dlvMapa.getZoom()<14;
    }
  }catch(e){}
  b.classList.toggle('on', lejos);
}
function dlvVolver(){ if(_dlvMapa && _gpsLat) _dlvMapa.setView([_gpsLat,_gpsLon], 17); }

/* «¿Es aquí tu casa?» → [Sí] [Ajustar]; confirmado → «¡Listo!». */
function _dlvEstado(){
  var c=$('dlvConfirma'); if(!c) return;
  if(!(_gpsLat&&_gpsLon) || _dlvModoAct==='ajustar'){ c.style.display='none'; if(!(_gpsLat&&_gpsLon)) c.innerHTML=''; return; }
  c.style.display='block';
  var quitar='<button type="button" class="dlv-link" onclick="quitarPin()">Quitar punto</button>';
  if(_dlvOk){
    c.innerHTML='<div class="tt-ok on">✓ ¡Listo! Te lo llevamos aquí</div>'
      +'<button type="button" class="dlv-link" onclick="dlvAjustar()">Ajustar punto</button> · '+quitar;
    return;
  }
  c.innerHTML='<div class="dlv-q">¿Es aquí tu casa?</div>'
    +'<div class="dlv-btns"><button type="button" class="dlv-si" onclick="dlvConfirmar()">✓ Sí, es aquí</button>'
    +'<button type="button" class="dlv-aj" onclick="dlvAjustar()">Ajustar punto</button></div>'+quitar;
}
function dlvConfirmar(){
  if(!(_gpsLat&&_gpsLon)) return;
  _dlvOk=true; _dlvAcc=0;
  _ttVibrar();
  _dlvPintar(true);
  _dlvEstado();
  _ttPop($('dlvPrev'));
}
/* AJUSTAR: SOLO desde su botón (o «marca tu casa» sin ubicación). Sin
   punto previo, empieza en Lima. Cancelar deja todo como estaba. */
function dlvAjustar(opc){
  opc=opc||{};
  _dlvMapaListo().then(function(m){
    if(!m){
      _gpsMsg('<div class="dlv-msg">No pudimos abrir el mapa. Escribe tu dirección abajo 👇</div>');
      var ta=$('addrManualInput'); if(ta){ try{ ta.focus(); }catch(e){} }
      return;
    }
    _dlvModo('ajustar');
    var hay=!!(_gpsLat&&_gpsLon), c=hay?[_gpsLat,_gpsLon]:_DLV_LIMA, z=hay?18:12;
    m.setView(c, z);
    setTimeout(function(){ try{ m.invalidateSize(); m.setView(c, z); }catch(e){} }, 60);
    if(!_dlvTactil()){ try{ $('dlvPrev').scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }
  });
}
function dlvAjusteCerrar(){
  _dlvModo('mirar');
  if(_gpsLat&&_gpsLon) _dlvPintar(false);
  else { var b=$('dlvPrev'); if(b) b.style.display='none'; }
  _dlvEstado();
}
function dlvAjusteOk(){
  var m=_dlvMapa; if(!m) return dlvAjusteCerrar();
  var c=m.getCenter();
  _dlvModo('mirar');
  if(!AgLista.coords({latitud:c.lat, longitud:c.lng})){ dlvAjusteCerrar(); _dlvError('fuera',''); return; }
  _gpsMsg('');
  _dlvPunto(c.lat, c.lng, {confirmado:true, salta:true});
  _ttVibrar();
}

/* ★ ENLACE DE MAPA — UNA forma para todo el formulario: el formato oficial
   de Google Maps URLs (abre la app en Android/iPhone y la web en PC; gratis,
   sin clave; la coma va codificada). 6 decimales ≈ 10 cm. Coordenadas raras
   o fuera del Perú → sin enlace. Lo usan el chip «Ver mapa» y el WhatsApp. */
var EnlaceMapa = {
  de: function(coords){
    var p=String(coords==null?'':coords).split(',');
    if(p.length!==2 || !p[0].trim() || !p[1].trim()) return '';
    var la=Number(p[0]), lo=Number(p[1]);
    if(!isFinite(la) || !isFinite(lo)) return '';
    if(la<-19||la>0||lo<-82||lo>-68) return '';
    return 'https://www.google.com/maps/search/?api=1&query='+la.toFixed(6)+'%2C'+lo.toFixed(6);
  }
};
