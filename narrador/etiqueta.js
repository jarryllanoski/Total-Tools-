(function(){
  'use strict';
  if(new URLSearchParams(location.search).has('seg')) return;
  var app=document.getElementById('app'); if(!app) return;

  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var txt=function(sel){ var e=app.querySelector(sel); return e?(e.textContent||'').trim():''; };
  var val=function(id){ var e=document.getElementById(id); return e?(e.value||'').trim():''; };
  var visible=function(id){ var e=document.getElementById(id); return !!(e&&e.offsetParent!==null); };

  var st=document.createElement('style');
  st.textContent=''
   +'#tt-lbl{--tt-s:.78;margin:2px 0 10px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.45))}'
   +'#tt-lbl .card{background:#fff;color:#111;border:1.6px solid #111;border-radius:7px;padding:calc(14px * var(--tt-s)) calc(15px * var(--tt-s));font-family:Arial,Helvetica,sans-serif;line-height:1.35}'
   +'#tt-lbl .para{min-width:0}'
   +'#tt-lbl .rem-info{flex:1;min-width:0}'
   +'#tt-lbl .seclbl{font-size:calc(10px * var(--tt-s));font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#666;margin-bottom:3px}'
   +'#tt-lbl .cli{font-size:calc(20px * var(--tt-s));font-weight:800;text-transform:uppercase;line-height:1.1;word-break:break-word;color:#111}'
   +'#tt-lbl .cli.ghost{color:#bbb;font-weight:600}'
   +'#tt-lbl .phone{font-size:calc(15px * var(--tt-s));font-weight:700;margin-top:4px;color:#111}'
   +'#tt-lbl .dni{font-size:calc(14px * var(--tt-s));font-weight:800;letter-spacing:.5px;margin-top:3px;color:#111}'
   +'#tt-lbl .qr{flex-shrink:0;text-align:center;width:calc(74px * var(--tt-s))}'
   +'#tt-lbl .qr img{display:block;width:calc(74px * var(--tt-s));height:calc(74px * var(--tt-s))}'
   +'#tt-lbl .qr .qrnum{font-size:calc(9.5px * var(--tt-s));color:#555;margin-top:2px;white-space:nowrap}'
   +'#tt-lbl .dest{margin-top:11px;padding-top:10px;border-top:1px solid #111}'
   +'#tt-lbl .dest-addr{font-size:calc(13px * var(--tt-s));color:#111;word-break:break-word;white-space:pre-wrap}'
   +'#tt-lbl .dest-addr.ghost{color:#bbb}'
   +'#tt-lbl .envio{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding-top:9px;border-top:1.6px solid #111}'
   +'#tt-lbl .courier{font-size:calc(13px * var(--tt-s));font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#111}'
   +'#tt-lbl .fecha{font-size:calc(12.5px * var(--tt-s));font-weight:700;color:#333}'
   +'#tt-lbl .rem{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;padding-bottom:9px;border-bottom:1px dashed #999}'
   +'#tt-lbl .rem-name{font-size:calc(13px * var(--tt-s));font-weight:700;color:#111}'
   +'#tt-lbl .rem-sub{font-size:calc(11.5px * var(--tt-s));color:#444;margin-top:1px}'
   +'#tt-lbl .revisa{text-align:center;font-size:calc(10px * var(--tt-s));letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;margin-top:7px}'
   +'#tt-lbl .card{cursor:pointer}'
   +'@keyframes ttMira{0%,100%{box-shadow:0 0 0 0 rgba(18,165,180,0)}40%{box-shadow:0 0 0 3px rgba(18,165,180,.5)}}'
   +'.tt-mira{border-radius:14px;animation:ttMira 1.1s ease-out 2}'
   +'@media(prefers-reduced-motion:reduce){.tt-mira{animation:none;box-shadow:0 0 0 3px rgba(18,165,180,.5)}}'
   +'@media(prefers-reduced-motion:reduce){#tt-lbl *{animation:none!important}}';
  document.head.appendChild(st);

  function bizInfo(){
    var b=window._bizInfo||{};
    return { name:b.name||'', phone:b.phone||'', city:b.city||'' };
  }

  function getName(){ var v=val('f_name'); return v?v.toUpperCase():''; }
  function getPhone(){ return val('f_phone').replace(/\D/g,''); }
  function getDni(){ return val('f_dni')||''; }
  function getCourier(){
    var s=document.getElementById('f_courier'); if(!s||!s.value) return '';
    var o=s.options[s.selectedIndex]; return o?(o.textContent||s.value).trim():s.value;
  }
  function getFecha(){
    var e=app.querySelector('.date-opt.active');
    return e?(e.textContent||'').replace(/\s+/g,' ').trim():'';
  }
  function getDestino(){
    var t=window._selCourierType;
    if(t){
      if(t==='agencia')    return txt('#shalomSelTxt')||txt('.sel-badge span')||'';
      if(t==='encomienda'){ var c=val('f_ciudad'), a=val('f_agencia'); return c?(c+(a?' — '+a:'')):''; }
      if(t==='delivery'){ var d=(window.getDeliveryAddr?window.getDeliveryAddr():val('addrManualInput')); var r=val('f_ref'); return d?(d+(r?' ('+r+')':'')):''; }
      return '';
    }
    var ag=txt('#shalomSelTxt')||txt('.sel-badge span'); if(ag) return ag;
    if(visible('f_ciudad')){ var c2=val('f_ciudad'), a2=val('f_agencia'); return c2?(c2+(a2?' — '+a2:'')):''; }
    var d2=(window.getDeliveryAddr?window.getDeliveryAddr():val('addrManualInput')); var r2=val('f_ref');
    if(d2) return d2+(r2?' ('+r2+')':'');
    return '';
  }

  var box, el={};
  function build(){
    if(document.getElementById('tt-lbl')){ box=document.getElementById('tt-lbl'); return; }
    remDone=false;
    box=document.createElement('div'); box.id='tt-lbl';
    box.innerHTML=''
      +'<div class="card">'
      +  '<div class="rem">'
      +    '<div class="rem-info">'
      +      '<div class="seclbl">Remitente:</div>'
      +      '<div class="rem-name"></div>'
      +      '<div class="rem-sub rem-tel" style="display:none"></div>'
      +      '<div class="rem-sub rem-city" style="display:none"></div>'
      +    '</div>'
      +    '<div class="qr">'
      +      '<img src="narrador/qr-negocio.svg" alt="QR" width="74" height="74" loading="lazy" onerror="this.style.display=\'none\'">'
      +      '<div class="qrnum"></div>'
      +    '</div>'
      +  '</div>'
      +  '<div class="para">'
      +    '<div class="seclbl">Para:</div>'
      +    '<div class="cli"></div>'
      +    '<div class="phone" style="display:none"></div>'
      +    '<div class="dni" style="display:none"></div>'
      +  '</div>'
      +  '<div class="dest">'
      +    '<div class="seclbl">Destino:</div>'
      +    '<div class="dest-addr"></div>'
      +  '</div>'
      +  '<div class="envio">'
      +    '<span class="courier"></span>'
      +    '<span class="fecha"></span>'
      +  '</div>'
      +'</div>'
      +'<div class="revisa">Revisa que tus datos estén correctos</div>';
    el={
      cli:  box.querySelector('.cli'),
      phone:box.querySelector('.phone'),
      dni:  box.querySelector('.dni'),
      qrnum:box.querySelector('.qrnum'),
      dest: box.querySelector('.dest-addr'),
      courier:box.querySelector('.courier'),
      fecha:box.querySelector('.fecha'),
      remName:box.querySelector('.rem-name'),
      remTel: box.querySelector('.rem-tel'),
      remCity:box.querySelector('.rem-city'),
      revisa: box.querySelector('.revisa')
    };
    paintRemitente();
    box.querySelector('.card').addEventListener('click', irAlFormulario);
  }

  function campoQueFalta(){
    var campos=app.querySelectorAll('input,select,textarea');
    var primero=null;
    for(var i=0;i<campos.length;i++){
      var c=campos[i];
      if(c.disabled||c.readOnly||c.type==='hidden') continue;
      if(c.offsetParent===null) continue;
      if(!primero) primero=c;
      if(!String(c.value||'').trim()) return c;
    }
    return primero;
  }

  function grupoSinResponder(){
    var grupos=app.querySelectorAll('[role="radiogroup"]');
    for(var i=0;i<grupos.length;i++){
      var g=grupos[i];
      if(g.offsetParent===null) continue;
      if(!g.querySelector('[aria-checked="true"]')) return g;
    }
    return null;
  }
  function irAlFormulario(e){
    if(e.target&&e.target.closest&&e.target.closest('a,button,input,select,textarea')) return;
    var destino=campoQueFalta() || grupoSinResponder();
    if(!destino) return;
    var suave=!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    try{ destino.scrollIntoView({behavior:suave?'smooth':'auto',block:'center'}); }
    catch(_e){ destino.scrollIntoView(); }
    if(destino.getAttribute && destino.getAttribute('role')==='radiogroup'){
      destino.classList.add('tt-mira');
      setTimeout(function(){ destino.classList.remove('tt-mira'); }, 2400);
      return;
    }
    if(!String(destino.value||'').trim()){
      try{ destino.focus({preventScroll:true}); }catch(_e2){ destino.focus(); }
    }
  }

  var remDone=false;
  function paintRemitente(){
    if(remDone) return;
    var b=bizInfo();
    if(!b.name && !b.phone && !b.city) return;
    el.remName.textContent=b.name||'—';
    if(b.phone){ el.remTel.textContent='Tel: '+b.phone; el.remTel.style.display=''; }
    if(b.city){ el.remCity.textContent=b.city; el.remCity.style.display=''; }
    remDone=true;
  }

  function setRow(node, wrap, value){
    if(value){ node.textContent=value; if(wrap) wrap.style.display=''; else node.style.display=''; }
    else{ node.textContent=''; if(wrap) wrap.style.display='none'; else node.style.display='none'; }
  }
  function update(){
    if(!box) return;
    paintRemitente();

    var name=getName(), phone=getPhone(), dni=getDni();
    var dest=getDestino(), courier=getCourier(), fecha=getFecha();

    if(name){ el.cli.textContent=name; el.cli.classList.remove('ghost'); }
    else    { el.cli.textContent='Tu nombre'; el.cli.classList.add('ghost'); }

    setRow(el.phone, el.phone, phone);
    setRow(el.dni,   el.dni,   dni?('DNI: '+dni):'');
    el.qrnum.textContent=phone||'';

    if(dest){ el.dest.textContent=dest; el.dest.classList.remove('ghost'); }
    else    { el.dest.textContent='Tu destino aparecerá aquí'; el.dest.classList.add('ghost'); }

    el.courier.textContent=courier||'';
    el.fecha.textContent=fecha||'';

    el.revisa.textContent=(name&&dest)
      ? 'Revisa que tus datos estén correctos'
      : 'Así se verá tu etiqueta';

    box.style.display = (name||phone||dni||dest||courier) ? '' : 'none';
  }

  function place(){
    if(!document.getElementById('f_name')) return false;
    build();
    if(!box.parentNode){
      var header=app.querySelector('.biz-header');
      if(header && header.nextSibling) app.insertBefore(box, header.nextSibling);
      else app.insertBefore(box, app.firstChild);
    }
    update();
    return true;
  }
  function removeBox(){ if(box&&box.parentNode){ box.parentNode.removeChild(box); box=null; el={}; remDone=false; } }

  var deb;
  document.addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(update,120); }, true);
  document.addEventListener('change', function(){ setTimeout(update,60); }, true);
  document.addEventListener('click', function(){ setTimeout(update,120); }, true);

  var scanT;
  function scan(){
    clearTimeout(scanT);
    scanT=setTimeout(function(){
      try{
        var isTrack=app.querySelector('.track-card')||app.querySelector('.status-badge');
        var isSuccess=app.querySelector('.success');
        if(isTrack||isSuccess){ removeBox(); return; }
        place();
      }catch(e){  }
    },140);
  }
  try{
    new MutationObserver(function(recs){
      for(var i=0;i<recs.length;i++){
        var t=recs[i].target;
        if(!(box && (t===box || box.contains(t)))){ scan(); return; }
      }
    }).observe(app,{childList:true,subtree:true});
  }catch(e){}
  if(document.readyState!=='loading') scan(); else document.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('load',scan);
})();
