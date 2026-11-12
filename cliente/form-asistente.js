'use strict';

var _wzStep=1;
var _wzUnico='';
function _wzInjectCss(){
  if(document.getElementById('wzCss')) return;
  var s=document.createElement('style'); s.id='wzCss';
  s.textContent=''
   +'.wz-wrap{padding-bottom:12px}'
   +'.wz-progress{margin:2px 0 8px}'
   +'.wz-ptxt{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#8b949e;margin-bottom:6px;font-weight:700}'
   +'.wz-pbar{height:6px;background:#1c2333;border-radius:99px;overflow:hidden}'
   +'.wz-pbar i{display:block;height:100%;background:linear-gradient(90deg,#12a5b4,#5b9bff);border-radius:99px;transition:width .35s ease}'
   +'.wz-step[hidden]{display:none!important}'
   +'.wz-step{animation:wzIn .28s ease}'
   +'@keyframes wzIn{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}'
   +'.wz-nav{display:flex;gap:10px;margin-top:14px}'
   +'.wz-nav .wz-back{flex:0 0 auto;background:#1c2333;border:1px solid #30363d;color:#8b949e;border-radius:12px;padding:0 16px;min-height:44px;font-size:14px;cursor:pointer;font-family:inherit}'
   +'.wz-nav .btn-main{flex:1;margin-top:0!important}';
  document.head.appendChild(s);
}
function _wzNeedDest(){ return selCourierType!=='retiro'; }
function wzSeq(){ var s=_wzNeedDest()?[1,2,3,4]:[1,2,4]; return _wzUnico ? s.slice(1) : s; }
function _wzErr(fid,eid,bad){
  var fe=$(fid),ee=$(eid);
  if(bad){ fe&&fe.classList.add('err'); ee&&ee.classList.add('show'); }
  else   { fe&&fe.classList.remove('err'); ee&&ee.classList.remove('show'); }
  return bad;
}
function wzValidate(step){
  var ok=true;
  if(step===1){
    if(!selCourierName){ $('err_courier')&&$('err_courier').classList.add('show'); ok=false; }
    else { $('err_courier')&&$('err_courier').classList.remove('show'); }
  } else if(step===2){
    var dni1=($('f_dni')||{value:''}).value.trim();
    if(_wzErr('f_dni','err_dni', !/^\d{8}$/.test(dni1))) ok=false;
    var name=($('f_name')||{value:''}).value.trim();
    var phone=($('f_phone')||{value:''}).value.trim();
    if(_wzErr('f_name','err_name',!_nombreValido(name))) ok=false;
    if(_wzErr('f_phone','err_phone',!/^\d{9}$/.test(phone))) ok=false;
    var extraF=((CFG&&CFG.extraFields)||[]).filter(function(f){return f&&f.visible!==false;});
    extraF.forEach(function(f){
      var fname=typeof f==='string'?f:(f.name||''); var isReq=typeof f==='object'&&!!f.required;
      if(!isReq) return;
      var el=$('ex_'+fname.replace(/\W/g,'_')), er=$('exerr_'+fname.replace(/\W/g,'_'));
      if(el&&!el.value.trim()){ el.classList.add('err'); er&&er.classList.add('show'); ok=false; }
      else if(el){ el.classList.remove('err'); er&&er.classList.remove('show'); }
    });
  } else if(step===3){
    if(selCourierType==='agencia'){
      var man=$('agcManualInput');
      if(man){ if(!man.value.trim()){ $('err_agency_manual')&&$('err_agency_manual').classList.add('show'); ok=false; } else { $('err_agency_manual')&&$('err_agency_manual').classList.remove('show'); } }
      else if(!agState.addr){ if($('shalomDrop')) _agGuiarEleccion(); else { $('err_agency')&&$('err_agency').classList.add('show'); } ok=false; }
      else { $('err_agency')&&$('err_agency').classList.remove('show'); }
    } else if(selCourierType==='encomienda'){
      var ci=($('f_ciudad')||{value:''}).value.trim();
      if(_wzErr('f_ciudad','err_ciudad',!ci)) ok=false;
    } else if(selCourierType==='delivery'){
      var addr=getDeliveryAddr();
      if(!addr){ $('err_deliveryAddr')&&$('err_deliveryAddr').classList.add('show'); ok=false; }
      else { $('err_deliveryAddr')&&$('err_deliveryAddr').classList.remove('show'); }
    }
  }
  return ok;
}
function wzProgress(){
  var box=$('wzProgress'); if(!box) return;
  var seq=wzSeq(); var idx=seq.indexOf(_wzStep); if(idx<0) idx=0;
  var pct=Math.round(((idx+1)/seq.length)*100);
  box.innerHTML='<div class="wz-ptxt">Paso '+(idx+1)+' de '+seq.length+'</div>'
    +'<div class="wz-pbar"><i style="width:'+pct+'%"></i></div>';
}
function wzFocusFirst(){
  try{
    var step=document.querySelector('.wz-step[data-step="'+_wzStep+'"]');
    if(!step) return false;
    var cands=step.querySelectorAll('[data-wz-focus]'), el=null;
    for(var i=0;i<cands.length;i++){ var c=cands[i]; if(c.offsetParent!==null && !c.disabled && !c.readOnly){ el=c; break; } }
    if(!el) return false;
    el.focus();
    setTimeout(function(){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }, 300);
    return true;
  }catch(e){ return false; }
}
function wzShow(step, doFocus){
  _wzStep=step;
  try{
    var primero = wzSeq()[0]===step;
    document.querySelectorAll('.wz-step[data-step="'+step+'"] .wz-back').forEach(function(b){ b.style.display=primero?'none':''; });
  }catch(e){}
  try{ document.body.classList.toggle('wz-sede', step===3 && selCourierType==='agencia' && !$('agcManualInput')); }catch(e){}
  try{ _paso3Continuar(); }catch(e){}
  var steps=document.querySelectorAll('.wz-step');
  for(var i=0;i<steps.length;i++){ steps[i].hidden=(+steps[i].getAttribute('data-step')!==step); }
  wzProgress();
  var focused = doFocus ? wzFocusFirst() : false;
  if(!focused){
    try{ window.scrollTo({top:0,behavior:'smooth'}); }catch(e){ try{ window.scrollTo(0,0); }catch(_){} }
  }
}
function wzNext(){
  if(!wzValidate(_wzStep)) return;
  var seq=wzSeq(); var idx=seq.indexOf(_wzStep);
  if(idx>=0&&idx<seq.length-1) wzShow(seq[idx+1], true);
}
function wzBack(){
  var seq=wzSeq(); var idx=seq.indexOf(_wzStep);
  if(idx>0) wzShow(seq[idx-1]);
}
function wzInit(){
  try{
    if(!$('wzProgress')) return;
    _wzInjectCss();
    _wzStep=1; window._selCourierType=''; window._ttFrozen=false;
    ['f_name','f_phone','f_dni'].forEach(function(id){
      var el=$(id); if(el) el.addEventListener('keydown',function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); wzNext(); } });
    });
    if(_wzUnico) pickCourier(_wzUnico);
    var cs=$('f_courier');
    if(cs) cs.addEventListener('change',function(){
      if(_wzStep!==1||!this.value) return;
      if(selCourierName) wzNext();
    });
    wzShow(wzSeq()[0]);
  }catch(e){  }
}
