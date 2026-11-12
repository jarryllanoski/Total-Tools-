'use strict';

var _agPerm=null, _ubicReintento=null, _ubicReintentoGps=false;
function _agPermiso(){
  if(_agPerm) return Promise.resolve(_agPerm.state);
  try{
    if(navigator.permissions && navigator.permissions.query){
      return navigator.permissions.query({name:'geolocation'}).then(function(st){
        _agPerm=st;
        try{ st.addEventListener('change', function(){
          if(st.state==='granted' && _ubicReintento){ var f=_ubicReintento; _ubicReintento=null; f(); }
        }); }catch(e){}
        return st.state;
      }).catch(function(){ return ''; });
    }
  }catch(e){}
  return Promise.resolve('');
}
try{ document.addEventListener('visibilitychange', function(){
  if(document.hidden || !_ubicReintentoGps || !_ubicReintento) return;
  _ubicReintentoGps=false;
  var f=_ubicReintento; _ubicReintento=null; f();
}); }catch(e){}
function _ubicCasoDe(codigo, estado){
  if(estado==='denied') return 'sitio';
  if(codigo==='inseguro' || codigo==='no_soporta') return 'navegador';
  if(codigo==='fuera') return 'fuera';
  if(codigo==='denegado' && estado==='prompt') return 'pregunta';
  if(codigo==='denegado' && !estado) return 'sitio';
  return 'gps';
}
function _ubicTrasFallo(caso, reintentar){
  _ubicReintento = (caso==='sitio' || caso==='gps' || caso==='pregunta') ? reintentar : null;
  _ubicReintentoGps = (caso==='gps');
}
function _ubicMensaje(caso, alt, nativo){
  var msg = ({
    sitio:     nativo
      ? '<b>📍 Toca «Usar ubicación» y elige Permitir</b>, o '+alt+'.'
      : '<b>📍 Activa tu ubicación manualmente</b> (🔒 junto a la dirección web › Permisos › Ubicación) o '+alt+'.',
    gps:       '<b>📍 Enciende la ubicación de tu celular</b> y vuelve a tocar, o '+alt+'.',
    pregunta:  '<b>📍 Toca «Permitir»</b> cuando el navegador te pregunte, o '+alt+'.',
    navegador: 'Este navegador no permite usar tu ubicación aquí: '+alt+'.',
    fuera:     'Tu ubicación parece estar fuera del Perú: '+alt+'.'
  })[caso] || '';
  if(_gpsWebviewInApp()){
    msg += ' Si lo abriste desde WhatsApp, ábrelo en Chrome para usar tu ubicación. '
      + '<button type="button" onclick="_gpsCopiarLink(this)" style="background:none;border:none;color:var(--blue);cursor:pointer;font-family:inherit;font-size:11.5px;text-decoration:underline;padding:0">Copiar enlace</button>';
  }
  return msg;
}
function _ubicNativo(g, h){
  if(!(g && ('HTMLGeolocationElement' in window) && (g instanceof window.HTMLGeolocationElement))) return false;
  var t0=0, vigia=0;
  var luego=function(fn){ var r=Math.max(0, 700-(Date.now()-t0)); if(r) setTimeout(fn, r); else fn(); };
  var falla=function(c, e){ if(h.vigente()) h.error(c, e); };
  g.addEventListener('click', function(){
    if(g.isValid===false){ h.invalido(); return; }
    t0=Date.now(); h.inicio();
    clearTimeout(vigia);
    vigia=setTimeout(function(){
      if(!h.vigente()) return;
      _agPermiso().then(function(e){ falla(e==='denied'?'denegado':'fallo', e); });
    }, 15000);
  });
  g.addEventListener('location', function(){
    clearTimeout(vigia);
    luego(function(){
      if(!h.vigente()) return;
      if(g.position){ h.exito(g.position); return; }
      var er=g.error, c = !er ? 'fallo' : (er.code===1 ? 'denegado' : 'fallo');
      _agPermiso().then(function(e){ falla(c, e); });
    });
  });
  g.addEventListener('promptdismiss', function(){
    clearTimeout(vigia);
    luego(function(){ falla('denegado', 'prompt'); });
  });
  return true;
}

var _agFallosUbic=0, _agUbicKey='';
function _agUbicFallo(codigo, estado){
  var caja=$('agUbicCaja'), sub=$('agUbicSub'); if(!caja||!sub) return;
  caja.classList.add('ag-ubic-error');
  var caso=_ubicCasoDe(codigo, estado||'');
  _ubicTrasFallo(caso, function(){ if(_agUbicKey && $('agUbicCaja')) agUbicarme(_agUbicKey); });
  sub.innerHTML=_ubicMensaje(caso, '<a role="button" onclick="agIrALupa()">busca con la 🔍 lupa</a>', _agNativo);
}
function agIrALupa(){
  var b=document.querySelector('.ag-buscar'), inp=$('shalomAgInput'), h=$('agLupaHint');
  if(!b||!inp) return;
  if(h) h.classList.add('on');
  b.classList.remove('ag-buscar-foco'); void b.offsetWidth; b.classList.add('ag-buscar-foco');
  var subir=function(){ try{ (h||b).scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){} };
  try{ inp.focus({preventScroll:true}); }catch(e){ try{ inp.focus(); }catch(_){} }
  subir();
  var vv=window.visualViewport, hecho=false;
  var otra=function(){ if(hecho) return; hecho=true; if(vv) vv.removeEventListener('resize', otra); subir(); };
  if(vv) vv.addEventListener('resize', otra);
  setTimeout(otra, 450);
}

async function agUbicarme(key, opc){
  opc=opc||{};
  if(_cercaEnCurso) return;
  _agUbicKey=key;
  if(!opc.silencioso && _agFallosUbic>0 && _agPerm && _agPerm.state==='denied'){ agIrALupa(); return; }
  _cercaEnCurso=true;
  var myToken=++_cercaToken;
  if(!opc.silencioso) _cercaBtnBuscando(true);
  var t0=Date.now();
  var luego=function(fn){ var r=opc.silencioso?0:Math.max(0, 700-(Date.now()-t0)); if(r) setTimeout(fn, r); else fn(); };
  if(!_agTodas(key).length){ try{ await agPrecargar(key); }catch(e){} }
  if(myToken!==_cercaToken || !_agTodas(key).length){ _cercaEnCurso=false; _cercaBtnBuscando(false); return; }
  _obtenerUbicacion(function(pos){ luego(function(){
    _cercaEnCurso=false; _cercaBtnBuscando(false);
    if(myToken!==_cercaToken) return;
    _agUbicExito(key, pos, opc);
  }); }, function(codigo){ _agPermiso().then(function(estado){ luego(function(){
    _cercaEnCurso=false; _cercaBtnBuscando(false);
    if(myToken!==_cercaToken || opc.silencioso) return;
    _agUbicError(codigo, estado);
  }); }); }, {rapida:true});
}
function _agUbicExito(key, pos, opc){
  var la=pos.coords.latitude, lo=pos.coords.longitude;
  if(!AgLista.coords({latitud:la, longitud:lo})){ if(!(opc&&opc.silencioso)) _agUbicFallo('fuera'); return; }
  _agFallosUbic=0;
  _miUbic={la:la, lo:lo};
  _agRef={la:la, lo:lo, tipo:'tu'};
  _ubicReintento=null; _ubicReintentoGps=false;
  var caja=$('agUbicCaja'); if(caja) caja.style.display='none';
  var inp=$('shalomAgInput'); if(inp) inp.value='';
  agMostrar(key, AgLista.cercanas(_agTodas(key), la, lo, _AG_CERCA_N), '');
}
function _agUbicError(codigo, estado){
  _agFallosUbic++;
  _agUbicFallo(codigo, estado);
  if(_agFallosUbic>=2) agIrALupa();
}
var _agNativo=false;
function _agGeoNativo(key){
  var sub=$('agUbicSub'), token=0;
  _agNativo=_ubicNativo($('agGeoNativo'), {
    invalido: function(){ agUbicarme(key); },
    inicio:   function(){ token=++_cercaToken; _agUbicKey=key; if(sub) sub.textContent=_AG_BUSCANDO; },
    vigente:  function(){ return token===_cercaToken; },
    exito:    function(pos){ _agUbicExito(key, pos, {}); },
    error:    function(c, e){ _agUbicError(c, e); }
  });
}
function agCerca(key){ return agUbicarme(key); }
