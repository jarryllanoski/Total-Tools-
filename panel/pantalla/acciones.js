function irAlPedido(id, opciones){
  const o = opciones || {};
  const ped = ((window.S && S.shipments) || []).filter(function(x){
    return x && x.id === id; })[0];

  const srch = document.getElementById('fSearch');
  if(srch && srch.value){ srch.value=''; }
  if(typeof clearAdvSearch === 'function') clearAdvSearch();
  else if(typeof render === 'function') render();

  if(!ped){
    console.warn('[irAlPedido] el pedido ' + id +
      ' no está en S.shipments — no es cosa de la vista');
    if(typeof toast === 'function') toast('⚠️ Ese pedido ya no está en la lista');
    return;
  }

  clearTimeout(_marcaTimer);
  _pedidoMarcado = id;
  _scrollPendiente = id;

  if(typeof setFilt === 'function') setFilt(ped.status);
  if(typeof render === 'function') render();

  _marcaTimer = setTimeout(function(){
    _pedidoMarcado = '';
    if(typeof render === 'function') render();
  }, o.ms || 3000);
}

function _pasteClearToggle(){ const p=document.getElementById('fPaste'),b=document.getElementById('fPasteClear'); if(!p||!b) return; b.style.display=(p.value&&p.value.trim())?'block':'none'; }
function clearPaste(){ const p=document.getElementById('fPaste'); if(p){ p.value=''; p.focus(); } _pasteClearToggle(); }

function copyPhone(phone){
  const clean=esUsuarioWA(phone)?String(phone).trim():String(phone).replace(/\D/g,'');
  const done=()=>toast('📋 Copiado ✓');
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(clean).then(done).catch(()=>toast('📋 '+clean)); }
  else { const t=document.createElement('textarea'); t.value=clean; t.style.cssText='position:fixed;top:-9999px'; document.body.appendChild(t); t.select(); try{document.execCommand('copy');done();}catch(e){toast(clean);} t.remove(); }
}
var _SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
var _shalomRec = null;
var _shalomVozStage = null;
var _shalomVozChain = null;

function _motivoSinVozShalom(){
  if(!_SpeechRec) return '⚠️ Este navegador no soporta dictado. Usa Chrome o Edge.';
  if(navigator.brave) return '🦁 Brave desactiva el dictado por privacidad. Abre el panel en Chrome o Edge.';
  return null;
}

function _updateShalomMic(){
  var btn = document.getElementById('shalomMicBtn');
  if(!btn) return;
  btn.style.display = _SpeechRec ? 'block' : 'none';
  if(_shalomRec) return;
  var g = document.getElementById('fShalomGuia');
  var guiaLista = !!(g && (g.value||'').trim().length>=8);
  btn.title = guiaLista ? '🎤 Dicta el código por voz' : '🎤 Dicta la guía por voz';
}

function _vozADigitos(txt){
  var mapa={cero:'0',uno:'1',una:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9'};
  var out=(txt||'').toLowerCase()
    .replace(/[a-záéíóúñü]+/g, function(w){ return (mapa[w]!==undefined)? mapa[w] : w; });
  return out.replace(/\D/g,'');
}
function _vozACodigo(txt){
  var mapa={
    cero:'0',uno:'1',una:'1',dos:'2',tres:'3',cuatro:'4',cinco:'5',seis:'6',siete:'7',ocho:'8',nueve:'9',
    a:'A',be:'B',ve:'V',ce:'C',de:'D',e:'E',efe:'F',ge:'G',hache:'H',i:'I',jota:'J',ka:'K',ele:'L',
    eme:'M',ene:'N',o:'O',pe:'P',cu:'Q',ere:'R',erre:'R',ese:'S',te:'T',u:'U',uve:'V',equis:'X',ye:'Y',zeta:'Z',ceta:'Z'
  };
  var t=(txt||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  var out=t.replace(/[a-z]+/g,function(w){ return (mapa[w]!==undefined)? mapa[w] : w; });
  return out.toUpperCase().replace(/[^A-Z0-9]/g,'');
}

function _shalomMicVisual(on){
  var btn=document.getElementById('shalomMicBtn');
  if(!btn) return;
  if(on){ btn.textContent='🔴'; btn.style.animation='shalomMicPulse 1s ease-in-out infinite'; btn.title='Escuchando… toca para detener'; }
  else  { btn.textContent='🎤'; btn.style.animation=''; btn.title='Dictar guía y código por voz'; }
}

function _shalomVozStop(){
  if(_shalomVozChain){ clearTimeout(_shalomVozChain); _shalomVozChain=null; }
  _shalomVozStage=null;
  if(_shalomRec){ try{ _shalomRec.onend=null; _shalomRec.stop(); }catch(e){} _shalomRec=null; }
  _shalomMicVisual(false);
}

function shalomVozStart(){
  if(_shalomRec||_shalomVozChain){ _shalomVozStop(); return; }
  var motivo=_motivoSinVozShalom();
  if(motivo){ toast(motivo); return; }
  var gEl=document.getElementById('fShalomGuia');
  var cEl=document.getElementById('fShalomCodigo');
  if(!gEl||!cEl) return;
  _shalomVozStage = (gEl.value||'').trim().length>=8 ? 'codigo' : 'guia';
  _shalomVozBeginStage();
}

function _shalomVozBeginStage(){
  if(!_SpeechRec) return;
  var rec = new _SpeechRec();
  rec.lang='es-PE'; rec.interimResults=true; rec.maxAlternatives=1; rec.continuous=false;
  _shalomRec=rec;
  _shalomMicVisual(true);
  var gEl=document.getElementById('fShalomGuia');
  var cEl=document.getElementById('fShalomCodigo');
  if(_shalomVozStage==='guia'){ toast('🎤 Dicta el número de guía (8 dígitos)'); }
  else { toast('🎤 Dicta el código (4 caracteres)'); }

  rec.onresult=function(ev){
    var txt='';
    for(var i=ev.resultIndex;i<ev.results.length;i++){ txt+=ev.results[i][0].transcript; }
    if(_shalomVozStage==='guia'){
      var d=_vozADigitos(txt);
      if(d){ gEl.value=d.substring(0,8); }
      if((gEl.value||'').length>=8){
        gEl.value=gEl.value.substring(0,8);
        try{ rec.onend=null; rec.stop(); }catch(e){}
        _shalomRec=null;
        _shalomVozStage='codigo';
        _shalomMicVisual(true);
        cEl.focus();
        toast('✅ Guía lista — ahora dicta el código');
        if(_shalomVozChain) clearTimeout(_shalomVozChain);
        _shalomVozChain=setTimeout(function(){
          _shalomVozChain=null;
          if(_shalomVozStage==='codigo' && !_shalomRec) _shalomVozBeginStage();
        }, 700);
      }
    } else if(_shalomVozStage==='codigo'){
      var c=_vozACodigo(txt);
      var guia=(gEl.value||'').trim();
      var esGuia = /\d{5,}/.test(c) || (guia && c.indexOf(guia)!==-1);
      if(c && !esGuia){ cEl.value=c.substring(0,8); }
    }
  };
  rec.onerror=function(e){
    if(e){
      if(e.error==='network'||e.error==='service-not-allowed'){ toast('⚠️ El dictado no está disponible en este navegador. Usa Chrome o Edge.'); }
      else if(e.error==='not-allowed'){ toast('🎤 Permite el micrófono para dictar'); }
    }
    _shalomVozStop();
  };
  rec.onend=function(){
    var eraCodigo = _shalomVozStage==='codigo';
    _shalomVozStop();
    _updateShalomMic();
    if(eraCodigo && (cEl.value||'').trim()){
      toast('✅ Código dictado — revísalo (puedes corregirlo a mano)');
    }
  };
  try{ rec.start(); }catch(e){ _shalomVozStop(); }
}

function onTrackBtn(){
  const sel=Seleccion.marcados();
  if(!sel.length){ render(); return; }
  if(window.Tracking && Tracking.bulkTrack){ Tracking.bulkTrack(sel.map(x=>x.id)); }
  else { render(); }
}

function quickMsg(id,idx){
  const s=S.shipments.find(x=>x.id===id);if(!s)return;
  const msgs=S.msgTemplates[s.status]||['',''];
  const tpl=msgs[idx];if(!tpl||!tpl.trim())return;
  window.waOpen(s.phone, fillVars(tpl,s));
}
