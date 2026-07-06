/* ═══════════════════════════════════════════════════════════════════
   BOLETA EN VIVO — vista previa tipo ticket térmico que se "imprime"
   mientras el cliente llena el formulario.
   Capa de presentación OPCIONAL y DESACOPLADA (igual patrón que los
   personajes): observa el DOM del formulario, no toca la lógica.
   · 0 llamadas a la nube · 0 cambios a formApi · solo lectura del DOM
   · Solo en el formulario (si hay ?seg=, no aplica)
   · Fuentes del sistema (sin CDN) — funciona en cualquier internet
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).has('seg')) return;
  var app=document.getElementById('app'); if(!app) return;

  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var txt=function(sel){ var e=app.querySelector(sel); return e?(e.textContent||'').trim():''; };
  var val=function(id){ var e=document.getElementById(id); return e?(e.value||'').trim():''; };
  var visible=function(id){ var e=document.getElementById(id); return !!(e&&e.offsetParent!==null); };

  // ── Estilos (marca TOTAL: papel térmico sobre fondo oscuro) ─────────
  var st=document.createElement('style');
  st.textContent=''
   +'#tt-bol{font-family:ui-monospace,"SF Mono","Cascadia Code","Roboto Mono",Menlo,monospace;margin:2px 0 14px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}'
   +'#tt-bol .paper{position:relative;background:#f6f1e3;color:#2a251d;border-radius:4px;padding:13px 15px 15px;font-size:12px;line-height:1.5}'
   +'#tt-bol .paper:before,#tt-bol .paper:after{content:"";position:absolute;left:0;right:0;height:9px;background:radial-gradient(circle,rgba(0,0,0,.28) 0 3.5px,transparent 4px);background-size:14px 9px}'
   +'#tt-bol .paper:before{top:-4px}#tt-bol .paper:after{bottom:-4px;transform:scaleY(-1)}'
   +'#tt-bol .bhead{text-align:center;border-bottom:1.4px dashed #9a917f;padding-bottom:7px;margin-bottom:7px}'
   +'#tt-bol .blogo{font-weight:800;font-size:14px;letter-spacing:2px}'
   +'#tt-bol .blogo span{color:#d5281f}'
   +'#tt-bol .bsub{display:block;color:#8a8170;font-size:9.5px;letter-spacing:.5px;margin-top:1px}'
   +'#tt-bol .bstat{display:flex;justify-content:space-between;font-size:9px;color:#8a8170;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}'
   +'#tt-bol .bstat b{color:#2a251d}'
   +'#tt-bol .bstat .dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#e0a41a;margin-right:5px;animation:ttbpar 1s infinite}'
   +'#tt-bol.done .bstat .dot{background:#1eb954;animation:none}'
   +'@keyframes ttbpar{50%{opacity:.25}}'
   +'#tt-bol .brow{display:flex;justify-content:space-between;gap:10px;padding:2px 0}'
   +'#tt-bol .brow .k{color:#8a8170;flex:none}'
   +'#tt-bol .brow .v{text-align:right;font-weight:600;word-break:break-word;white-space:pre-wrap;animation:ttbin .25s ease}'
   +'@keyframes ttbin{from{opacity:0;transform:translateY(-3px)}to{opacity:1}}'
   +'#tt-bol .ghost{color:#c3baa4;letter-spacing:1px}'
   +'#tt-bol .bfoot{border-top:1.4px dashed #9a917f;margin-top:7px;padding-top:7px;text-align:center;color:#8a8170;font-size:9.5px;letter-spacing:1px}'
   +'@media(prefers-reduced-motion:reduce){#tt-bol *{animation:none!important}}';
  document.head.appendChild(st);

  // ── Definición de líneas (clave, etiqueta, cómo leer el valor) ──────
  var LINES=[
    {k:'CLIENTE', get:function(){ var v=val('f_name'); return v?v.toUpperCase():''; }},
    {k:'WHATSAPP',get:function(){ var v=val('f_phone').replace(/\D/g,''); return v?'+51 '+v:''; }},
    {k:'ENTREGA', get:function(){ var s=document.getElementById('f_courier'); if(!s||!s.value) return ''; var o=s.options[s.selectedIndex]; return o?(o.textContent||s.value).trim():s.value; }},
    {k:'DESTINO', get:function(){
        // Agencia (Shalom u otra): badge seleccionado
        var ag=txt('#shalomSelTxt')||txt('.sel-badge span'); if(ag) return ag;
        // Otras agencias / encomienda: ciudad (+ agencia opcional)
        if(visible('f_ciudad')){ var c=val('f_ciudad'), a=val('f_agencia'); return c?(c+(a?' — '+a:'')):''; }
        // Delivery: dirección manual / GPS + referencia
        var d=val('addrManualInput')||txt('#addrGpsResult'); var r=val('f_ref');
        if(d) return d+(r?' ('+r+')':'');
        return '';
    }},
    {k:'DNI',     get:function(){ return val('f_dni_recoger')||val('f_dni_dest')||''; }},
    {k:'FECHA',   get:function(){ var e=app.querySelector('.date-opt.active'); return e?(e.textContent||'').replace(/\s+/g,' ').trim():''; }},
    {k:'NOTA',    get:function(){ return val('f_notes'); }}
  ];

  // ── Construcción / actualización ───────────────────────────────────
  var box, rowsEl, statEl, mounted=false;
  function build(){
    if(document.getElementById('tt-bol')) { box=document.getElementById('tt-bol'); return; }
    var biz=txt('.biz-name')||'TOTAL TOOLS';
    var city=txt('.biz-city')||'';
    // Logo: nombre del negocio en mayúsculas, con la última palabra en rojo
    var parts=biz.trim().split(/\s+/);
    var last=parts.length>1?parts.pop():'';
    var logoHtml=esc(parts.join(' ').toUpperCase())+(last?' <span>'+esc(last.toUpperCase())+'</span>':'');
    box=document.createElement('div'); box.id='tt-bol';
    box.innerHTML='<div class="paper">'
      +'<div class="bhead"><div class="blogo">'+logoHtml+'</div>'
      +(city?'<span class="bsub">'+esc(city.replace(/^📍\s*/,''))+'</span>':'')+'</div>'
      +'<div class="bstat"><span><i class="dot"></i><b class="bst">Imprimiendo pedido…</b></span></div>'
      +'<div class="brows"></div>'
      +'<div class="bfoot">SEGUIMIENTO · SE GENERA AL CONFIRMAR</div>'
      +'</div>';
    rowsEl=box.querySelector('.brows'); statEl=box.querySelector('.bst');
    mounted=true;
  }

  function ghost(){
    return '<div class="ghost">CLIENTE ·················<br>WHATSAPP ···············<br>ENTREGA ················<br>FECHA ··················</div>';
  }
  function update(){
    if(!box) return;
    var any=false, html='';
    for(var i=0;i<LINES.length;i++){
      var v=LINES[i].get();
      if(v){ any=true; html+='<div class="brow"><span class="k">'+LINES[i].k+'</span><span class="v">'+esc(v)+'</span></div>'; }
    }
    rowsEl.innerHTML=any?html:ghost();
  }

  // Insertar la boleta al inicio del formulario (después de la cabecera)
  function place(){
    if(!document.getElementById('f_name')) return false; // solo cuando el form está
    build();
    if(!box.parentNode){
      var header=app.querySelector('.biz-header');
      if(header && header.nextSibling) app.insertBefore(box, header.nextSibling);
      else app.insertBefore(box, app.firstChild);
    }
    update();
    return true;
  }
  function removeBox(){ if(box&&box.parentNode) box.parentNode.removeChild(box); }

  // ── Observadores: reacciona a lo que el cliente llena ──────────────
  var deb;
  document.addEventListener('input', function(){ clearTimeout(deb); deb=setTimeout(update,120); }, true);
  document.addEventListener('change', function(){ setTimeout(update,60); }, true);
  document.addEventListener('click', function(){ setTimeout(update,120); }, true); // chips fecha / opciones

  var scanT;
  function scan(){
    clearTimeout(scanT);
    scanT=setTimeout(function(){
      try{
        var isTrack=app.querySelector('.track-card')||app.querySelector('.status-badge');
        var isSuccess=/casi listo/i.test(app.textContent||'');
        if(isTrack||isSuccess){ removeBox(); return; }  // no en éxito ni seguimiento
        place();
      }catch(e){ /* nunca romper el formulario */ }
    },140);
  }
  try{ new MutationObserver(scan).observe(app,{childList:true,subtree:true}); }catch(e){}
  if(document.readyState!=='loading') scan(); else document.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('load',scan);
})();
