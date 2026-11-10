/**
 * cliente/form-asistente.js — el asistente paso a paso
 * =====================================================
 * Fase 5 (11/11/2026): el formulario en módulos. Antes era cliente/formulario.js
 * (y antes, el script en línea de formulario.html), envuelto en una función.
 * Script CLÁSICO: sus declaraciones son globales y los módulos se ven entre
 * sí por su nombre, como el panel. El orden de los <script> es el de
 * ejecución, y init() corre en form-arranque.js, cuando ya existe todo.
 */
'use strict';

/* ─── ASISTENTE PASO A PASO (solo presentación) ──────────────────────
   El formulario se muestra por pasos para que sea más rápido de llenar y
   nada tape a nada. NO cambia la validación ni el envío: submitOrder()
   sigue siendo el guardián final. Cada "Continuar" reusa las MISMAS reglas
   para no dejar avanzar con errores. Todo va en try/catch: si algo fallara,
   el formulario sigue funcionando. */
var _wzStep=1;
/* ★ UN SOLO ENVÍO CONFIGURADO (30/10/2026): preguntar «¿Cómo quieres
   recibir tu pedido?» con una sola respuesta es un paso de más. Se elige
   solo, se salta el paso 1 y arriba se dice cuál es. Con 2 o más, igual
   que siempre. Lo decide renderForm con la lista ya filtrada por la
   configuración (o por la «foto» del link personalizado). */
var _wzUnico='';
function _wzInjectCss(){
  if(document.getElementById('wzCss')) return;
  var s=document.createElement('style'); s.id='wzCss';
  s.textContent=''
   // ESPACIO ENTRE LA BARRA DE PROGRESO Y EL PASO. Su UNICO dueño es
   // .wz-progress: es el bloque cuyo trabajo es encabezar el paso, asi que le
   // toca declarar cuanto aire deja debajo. Antes tambien lo declaraba
   // .agc-box (margin-top:14px) y los dos margenes se FUNDIAN —ganaba el
   // mayor—, asi que tocar uno solo no hacia nada. Ese margin-top se quito por
   // redundante: .agc-box es siempre el primer hijo de su paso.
   // El colapso de margenes se DEJA a proposito: hace que el hueco sea el mayor
   // de lo que pida cada lado, asi un bloque que necesite mas aire (Retiro en
   // tienda pide 18px) lo conserva sin tener que listarlo aqui.
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
// Valida SOLO los campos del paso, con las mismas reglas que submitOrder.
function wzValidate(step){
  var ok=true;
  /* ⚠️ EL ORDEN DE ESTOS BLOQUES SIGUE AL DE LA PANTALLA, SIEMPRE.
     El 15/10/2026 el courier paso a ser el paso 1 y los datos el 2, y estos
     dos cuerpos se intercambiaron con ellos. Las reglas no cambiaron ni una
     coma: lo unico que se movio es a que numero responden.
     Si un dia vuelven a moverse los pasos y esto no se mueve, el asistente
     validaria la pantalla equivocada y dejaria pasar un formulario vacio
     sin decir nada. Hay una prueba que compara los dos ordenes. */
  if(step===1){
    if(!selCourierName){ $('err_courier')&&$('err_courier').classList.add('show'); ok=false; }
    else { $('err_courier')&&$('err_courier').classList.remove('show'); }
  } else if(step===2){
    /* Se valida en el MISMO orden en que se ve. No cambia el resultado
       —`_wzErr` marca todos los campos malos a la vez, no se para en el
       primero— pero leer la validación en otro orden que el formulario es
       cómo se olvida un campo el día que se añade uno. */
    // DNI OBLIGATORIO (8 dígitos) para todos — coincide con el "*" del campo.
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
      var addr=getDeliveryAddr();   // misma fuente que submitOrder y la etiqueta
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
// Enfoca el primer campo de texto VISIBLE del paso activo (si lo hay) para que
// salga el teclado y parpadee el cursor. DEBE llamarse dentro del gesto del
// usuario (toque) para que iOS abra el teclado. Devuelve true si enfocó algo.
// En pasos sin campo de texto (courier, fecha, delivery antes de elegir modo,
// retiro) no enfoca nada → el paso sube al inicio como antes.
function wzFocusFirst(){
  try{
    var step=document.querySelector('.wz-step[data-step="'+_wzStep+'"]');
    if(!step) return false;
    // Campos marcados a propósito con data-wz-focus (buscador Shalom, agencia
    // manual OLVA, ciudad de Otras Agencias). Evita enfocar por error un campo
    // secundario (ej. DNI en la cascada, o Referencia en delivery) o un select.
    var cands=step.querySelectorAll('[data-wz-focus]'), el=null;
    for(var i=0;i<cands.length;i++){ var c=cands[i]; if(c.offsetParent!==null && !c.disabled && !c.readOnly){ el=c; break; } }
    if(!el) return false;
    el.focus(); // dentro del gesto → abre el teclado; el navegador ya sube el campo
    // Red de seguridad: recentra el campo sobre el teclado tras su animación,
    // por si algún navegador no lo subió solo (que no lo tape el teclado).
    setTimeout(function(){ try{ el.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){} }, 300);
    return true;
  }catch(e){ return false; }
}
function wzShow(step, doFocus){
  _wzStep=step;
  // «← Atrás» no aparece en el primer paso: no hay a dónde volver.
  try{
    var primero = wzSeq()[0]===step;
    document.querySelectorAll('.wz-step[data-step="'+step+'"] .wz-back').forEach(function(b){ b.style.display=primero?'none':''; });
  }catch(e){}
  // Paso de la sede CON mapa (no el manual de Olva): la etiqueta se oculta.
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
  if(!wzValidate(_wzStep)) return;   // muestra los errores y no avanza
  var seq=wzSeq(); var idx=seq.indexOf(_wzStep);
  // doFocus=true: enfoca el primer campo del paso siguiente. wzNext se llama
  // dentro del gesto (botón "Continuar" o toque del courier), así el teclado
  // abre también en iPhone.
  if(idx>=0&&idx<seq.length-1) wzShow(seq[idx+1], true);
}
function wzBack(){
  var seq=wzSeq(); var idx=seq.indexOf(_wzStep);
  if(idx>0) wzShow(seq[idx-1]);
}
function wzInit(){
  try{
    if(!$('wzProgress')) return;         // el form no está en modo asistente
    _wzInjectCss();
    _wzStep=1; window._selCourierType=''; window._ttFrozen=false;
    // Enter avanza en los campos de texto del paso 1 (avance "mixto")
    ['f_name','f_phone','f_dni'].forEach(function(id){
      var el=$(id); if(el) el.addEventListener('keydown',function(ev){ if(ev.key==='Enter'){ ev.preventDefault(); wzNext(); } });
    });
    // Auto-avance al elegir courier (elección clara → siguiente paso). INMEDIATO
    // y dentro del gesto (pickCourier→dispatch change): sin setTimeout, para que
    // al enfocar el primer campo del paso 3 el teclado abra también en iPhone.
    // onCourierChange (onchange inline) ya corrió antes y dejó visible el bloque
    // correcto (agencia/otras/delivery), así que wzFocusFirst enfoca el campo justo.
    // Un solo envío: se elige ANTES de escuchar el cambio (sin auto-avance ni
    // teclado al abrir) y se empieza en el paso 2.
    if(_wzUnico) pickCourier(_wzUnico);
    var cs=$('f_courier');
    if(cs) cs.addEventListener('change',function(){
      // El courier es el paso 1 desde el 15/10/2026 (antes el 2).
      if(_wzStep!==1||!this.value) return;
      if(selCourierName) wzNext();
    });
    wzShow(wzSeq()[0]);
  }catch(e){ /* nunca romper el formulario */ }
}
