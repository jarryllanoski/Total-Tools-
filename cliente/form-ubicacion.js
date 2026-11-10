/**
 * cliente/form-ubicacion.js — la ubicación del cliente (sedes y delivery)
 * ========================================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ═══ UBICACIÓN COMPARTIDA: sedes (Shalom, Olva) y delivery ═══════════════
   UNA tubería para pedir la ubicación, venga del botón nativo <geolocation>
   o del de siempre: mensajes por causa, «Buscando…» visible, vigía de 15 s
   y reintento solo cuando el cliente lo arregla. Cada flujo pone su
   ALTERNATIVA (la lupa en sedes; marcar en el mapa en delivery). */
var _agPerm=null, _ubicReintento=null, _ubicReintentoGps=false;
function _agPermiso(){
  if(_agPerm) return Promise.resolve(_agPerm.state);
  try{
    if(navigator.permissions && navigator.permissions.query){
      return navigator.permissions.query({name:'geolocation'}).then(function(st){
        _agPerm=st;
        // ★ Si el cliente lo PERMITE desde el 🔒, se ubica solo: sin otro toque.
        try{ st.addEventListener('change', function(){
          if(st.state==='granted' && _ubicReintento){ var f=_ubicReintento; _ubicReintento=null; f(); }
        }); }catch(e){}
        return st.state;
      }).catch(function(){ return ''; });
    }
  }catch(e){}
  return Promise.resolve('');
}
/* ★ Encendió el GPS desde el panel del celular y volvió: se reintenta UNA vez
   sola. No pide permiso nuevo: el permiso ya estaba dado. */
try{ document.addEventListener('visibilitychange', function(){
  if(document.hidden || !_ubicReintentoGps || !_ubicReintento) return;
  _ubicReintentoGps=false;
  var f=_ubicReintento; _ubicReintento=null; f();
}); }catch(e){}
/* La CAUSA, no el código del navegador. Dos interruptores que el celular
   confunde: el permiso de la página (🔒) y el GPS del teléfono. */
function _ubicCasoDe(codigo, estado){
  if(estado==='denied') return 'sitio';
  if(codigo==='inseguro' || codigo==='no_soporta') return 'navegador';
  if(codigo==='fuera') return 'fuera';
  if(codigo==='denegado' && estado==='prompt') return 'pregunta';
  if(codigo==='denegado' && !estado) return 'sitio';     // sin API de permisos: lo más probable
  return 'gps';                                          // permiso dado pero sin posición
}
/* Qué reintentar y cuándo: al permitir desde el 🔒 (sitio/pregunta) o al
   volver con el GPS encendido (gps). */
function _ubicTrasFallo(caso, reintentar){
  _ubicReintento = (caso==='sitio' || caso==='gps' || caso==='pregunta') ? reintentar : null;
  _ubicReintentoGps = (caso==='gps');
}
/* El mensaje: la causa con su arreglo + la alternativa del flujo. */
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
/* ★ EL BOTÓN NATIVO <geolocation> (Chrome 144+). Si el navegador no lo
   conoce, devuelve false y se ve el botón de siempre (va dentro). Si lo
   conoce, su toque pide la ubicación (y, si estaba bloqueada, Chrome deja
   permitirla ahí mismo) y el resultado va a `h`:
     h.inicio()  h.vigente()  h.exito(pos)  h.error(codigo, estado)
     h.invalido() → Chrome lo declaró inválido: pedir por el camino de siempre. */
function _ubicNativo(g, h){
  if(!(g && ('HTMLGeolocationElement' in window) && (g instanceof window.HTMLGeolocationElement))) return false;
  var t0=0, vigia=0;
  // El toque se nota (igual que el botón de siempre): mínimo 0,7 s.
  var luego=function(fn){ var r=Math.max(0, 700-(Date.now()-t0)); if(r) setTimeout(fn, r); else fn(); };
  var falla=function(c, e){ if(h.vigente()) h.error(c, e); };
  g.addEventListener('click', function(){
    /* Si Chrome lo declara INVÁLIDO (tapado, recortado, estilo prohibido)
       su toque no pide nada: «no pasa nada» otra vez. Entonces se pide por
       el camino de siempre, dentro del mismo toque. */
    if(g.isValid===false){ h.invalido(); return; }
    t0=Date.now(); h.inicio();
    /* Vigía: si el navegador no responde nada en 15 s (bloqueo silencioso,
       aviso que nunca salió), no se queda en «Buscando…» para siempre. */
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
  // Cerró el aviso del navegador sin responder.
  g.addEventListener('promptdismiss', function(){
    clearTimeout(vigia);
    luego(function(){ falla('denegado', 'prompt'); });
  });
  return true;
}

/* ── Sedes: el fallo, con la LUPA como alternativa ── */
var _agFallosUbic=0, _agUbicKey='';
function _agUbicFallo(codigo, estado){
  var caja=$('agUbicCaja'), sub=$('agUbicSub'); if(!caja||!sub) return;
  caja.classList.add('ag-ubic-error');
  var caso=_ubicCasoDe(codigo, estado||'');
  _ubicTrasFallo(caso, function(){ if(_agUbicKey && $('agUbicCaja')) agUbicarme(_agUbicKey); });
  sub.innerHTML=_ubicMensaje(caso, '<a role="button" onclick="agIrALupa()">busca con la 🔍 lupa</a>', _agNativo);
}
/* Llevar al cliente a lo que SÍ funciona: el buscador, iluminado y con el
   cursor listo. Repetir el mismo error frustra; esto convierte el fallo en
   avance. */
function agIrALupa(){
  var b=document.querySelector('.ag-buscar'), inp=$('shalomAgInput'), h=$('agLupaHint');
  if(!b||!inp) return;
  if(h) h.classList.add('on');
  b.classList.remove('ag-buscar-foco'); void b.offsetWidth; b.classList.add('ag-buscar-foco');
  var subir=function(){ try{ (h||b).scrollIntoView({block:'start',behavior:'smooth'}); }catch(e){} };
  try{ inp.focus({preventScroll:true}); }catch(e){ try{ inp.focus(); }catch(_){} }
  subir();
  /* ⚠️ EL TECLADO TAPABA EL BUSCADOR (visto en un Android real): se subía
     ANTES de que el teclado terminara de abrirse, y al abrirse lo tapaba.
     Se vuelve a subir cuando la pantalla visible se encoge (teclado
     abierto) y, por si el navegador no avisa, a los 450 ms. */
  var vv=window.visualViewport, hecho=false;
  var otra=function(){ if(hecho) return; hecho=true; if(vv) vv.removeEventListener('resize', otra); subir(); };
  if(vv) vv.addEventListener('resize', otra);
  setTimeout(otra, 450);
}

async function agUbicarme(key, opc){
  opc=opc||{};
  if(_cercaEnCurso) return;
  _agUbicKey=key;
  // Ya falló y el navegador SIGUE con la ubicación bloqueada: a la lupa,
  // sin preguntar otra vez (la respuesta sería la misma).
  if(!opc.silencioso && _agFallosUbic>0 && _agPerm && _agPerm.state==='denied'){ agIrALupa(); return; }
  _cercaEnCurso=true;
  var myToken=++_cercaToken;
  if(!opc.silencioso) _cercaBtnBuscando(true);
  /* ★ CADA TOQUE SE NOTA: «Buscando…» se ve al menos 0,7 s aunque la
     respuesta sea instantánea. Si el error vuelve en milisegundos, el
     cliente cree que el botón no hizo nada. */
  var t0=Date.now();
  var luego=function(fn){ var r=opc.silencioso?0:Math.max(0, 700-(Date.now()-t0)); if(r) setTimeout(fn, r); else fn(); };
  if(!_agTodas(key).length){ try{ await agPrecargar(key); }catch(e){} }
  if(myToken!==_cercaToken || !_agTodas(key).length){ _cercaEnCurso=false; _cercaBtnBuscando(false); return; }
  _obtenerUbicacion(function(pos){ luego(function(){
    _cercaEnCurso=false; _cercaBtnBuscando(false);
    if(myToken!==_cercaToken) return;            // el cliente ya escribió: manda eso
    _agUbicExito(key, pos, opc);
  }); }, function(codigo){ _agPermiso().then(function(estado){ luego(function(){
    _cercaEnCurso=false; _cercaBtnBuscando(false);
    if(myToken!==_cercaToken || opc.silencioso) return;
    _agUbicError(codigo, estado);
  }); }); }, {rapida:true});
}
/* ★ UNA SOLA TUBERÍA (30/10/2026): el botón nativo y el de siempre entregan
   aquí. Lista, mapa, mensajes por causa y el salto a la lupa son los mismos
   venga de donde venga la posición. */
function _agUbicExito(key, pos, opc){
  var la=pos.coords.latitude, lo=pos.coords.longitude;
  // Fuera de Perú (VPN, dato raro): no se ordena por algo que no sirve.
  if(!AgLista.coords({latitud:la, longitud:lo})){ if(!(opc&&opc.silencioso)) _agUbicFallo('fuera'); return; }
  // No sale del navegador: solo ordena la lista y pinta tu punto.
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
  if(_agFallosUbic>=2) agIrALupa();   // segundo intento sin suerte: a la lupa
}
/* Sedes: el botón nativo conectado a la tubería compartida. El token es
   el de la lista: si el cliente ya escribió en la lupa, manda la lupa. */
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
// Compatibilidad: el nombre de antes sigue funcionando.
function agCerca(key){ return agUbicarme(key); }
