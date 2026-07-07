/* ═══════════════════════════════════════════════════════════════════
   BOLETA EN VIVO — vista previa tipo ticket térmico que se "imprime"
   línea por línea mientras el cliente llena el formulario.
   Capa de presentación OPCIONAL y DESACOPLADA (igual patrón que los
   personajes): observa el DOM del formulario, no toca la lógica.
   · 0 llamadas a la nube · 0 cambios a formApi · solo lectura del DOM
   · Solo en el formulario (si hay ?seg=, no aplica)
   · Fuentes del sistema (sin CDN) — funciona en cualquier internet
   · Actualización INCREMENTAL: cada línea se crea una sola vez (se
     "imprime" uno por uno) y luego se edita en su sitio (sin parpadear).
     No reescribe el HTML en cada tecla → no dispara bucles ni molesta a
     otros módulos (el narrador) que también observan #app.
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
   +'#tt-bol .brow .v{text-align:right;font-weight:600;word-break:break-word;white-space:pre-wrap}'
   // La animación de "impresión" vive SOLO en la fila nueva (clase .print),
   // no en el valor. Así, al editar un campo (p. ej. la NOTA) el texto se
   // actualiza en su sitio y NO vuelve a animarse (no parpadea).
   +'#tt-bol .brow.print{animation:ttbprint .3s ease both}'
   +'@keyframes ttbprint{from{opacity:0;transform:translateY(-4px);clip-path:inset(0 0 100% 0)}to{opacity:1;transform:none;clip-path:inset(0 0 0 0)}}'
   +'#tt-bol .ghost{color:#c3baa4;letter-spacing:1px}'
   +'#tt-bol .bfoot{border-top:1.4px dashed #9a917f;margin-top:7px;padding-top:7px;text-align:center;color:#8a8170;font-size:9.5px;letter-spacing:1px}'
   // Tap-para-editar: cada línea tocable lleva un lápiz ✎ sutil al final
   // (afordancia clara, sin frase confusa). El ✎ es pseudo-elemento, así
   // que no interfiere con la actualización del valor.
   +'#tt-bol .brow.editable{cursor:pointer;border-radius:5px;margin:0 -6px;padding-left:6px;padding-right:6px;transition:background .15s}'
   +'#tt-bol .brow.editable:hover,#tt-bol .brow.editable:active{background:rgba(18,165,180,.14)}'
   +'#tt-bol .brow.editable .v:after{content:" ✎";color:#12a5b4;font-size:10px;font-weight:400;opacity:.55}'
   // Pedido ya registrado: boleta congelada (sin lápiz, sin cursor de edición).
   +'#tt-bol.frozen .brow.editable{cursor:default}'
   +'#tt-bol.frozen .brow.editable .v:after{content:none}'
   +'@media(prefers-reduced-motion:reduce){#tt-bol *{animation:none!important;clip-path:none!important}}';
  document.head.appendChild(st);

  // ── Definición de líneas (clave, etiqueta, cómo leer el valor) ──────
  var LINES=[
    {k:'CLIENTE', get:function(){ var v=val('f_name'); return v?v.toUpperCase():''; }},
    {k:'WHATSAPP',get:function(){ var v=val('f_phone').replace(/\D/g,''); return v?'+51 '+v:''; }},
    {k:'ENTREGA', get:function(){ var s=document.getElementById('f_courier'); if(!s||!s.value) return ''; var o=s.options[s.selectedIndex]; return o?(o.textContent||s.value).trim():s.value; }},
    {k:'DESTINO', get:function(){
        // El formulario publica el tipo de courier (funciona aunque el paso
        // esté oculto en el asistente). Si no está, se usa la heurística vieja.
        var t=window._selCourierType;
        if(t){
          if(t==='agencia')    return txt('#shalomSelTxt')||txt('.sel-badge span')||'';
          if(t==='encomienda'){ var c=val('f_ciudad'), a=val('f_agencia'); return c?(c+(a?' — '+a:'')):''; }
          if(t==='delivery'){ var d=val('addrManualInput')||txt('#addrGpsResult'); var r=val('f_ref'); return d?(d+(r?' ('+r+')':'')):''; }
          return ''; // retiro en tienda: sin destino
        }
        // Fallback (sin asistente): deducir por lo que está visible.
        var ag=txt('#shalomSelTxt')||txt('.sel-badge span'); if(ag) return ag;
        if(visible('f_ciudad')){ var c2=val('f_ciudad'), a2=val('f_agencia'); return c2?(c2+(a2?' — '+a2:'')):''; }
        var d2=val('addrManualInput')||txt('#addrGpsResult'); var r2=val('f_ref');
        if(d2) return d2+(r2?' ('+r2+')':'');
        return '';
    }},
    {k:'DNI',     get:function(){ return val('f_dni_recoger')||val('f_dni_dest')||''; }},
    {k:'FECHA',   get:function(){ var e=app.querySelector('.date-opt.active'); return e?(e.textContent||'').replace(/\s+/g,' ').trim():''; }},
    {k:'NOTA',    get:function(){ return val('f_notes'); }}
  ];

  // ── Tap-para-editar: a qué paso/campo lleva cada línea ─────────────
  var EDIT={
    CLIENTE:{step:1,id:'f_name'},  WHATSAPP:{step:1,id:'f_phone'},
    ENTREGA:{step:2,id:'f_courier'}, DESTINO:{step:3,id:null},
    DNI:{step:3,id:null},          FECHA:{step:4,id:null},
    NOTA:{step:4,id:'f_notes'}
  };
  function wizOn(){ return typeof window.wzShow==='function'; }
  function goEdit(key){
    if(window._ttFrozen) return;   // pedido ya registrado: no editar
    var e=EDIT[key]; if(!e) return;
    if(wizOn()){ try{ window.wzShow(e.step); }catch(_){} }
    setTimeout(function(){
      var target=e.id?document.getElementById(e.id):null;
      if(!target){
        var step=document.querySelector('.wz-step[data-step="'+e.step+'"]');
        if(step) target=step.querySelector('input:not([type=hidden]),select,textarea');
      }
      if(target){
        try{ target.focus(); }catch(_){}
        try{ target.scrollIntoView({block:'center',behavior:'smooth'}); }catch(_){}
      }
    },130);
  }

  // ── Construcción / actualización ───────────────────────────────────
  var box, rowsEl, mounted=false, ghostShown=false;
  var rows={};   // clave → {el, vEl, val}
  function build(){
    if(document.getElementById('tt-bol')) { box=document.getElementById('tt-bol'); rowsEl=box.querySelector('.brows'); return; }
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
      +'<div class="brows"></div>'
      +'<div class="bfoot">REVISA QUE TUS DATOS ESTÉN CORRECTOS</div>'
      +'</div>';
    rowsEl=box.querySelector('.brows');
    rows={}; ghostShown=false;
    mounted=true;
  }

  function showGhost(){
    if(ghostShown) return;
    rowsEl.innerHTML='<div class="ghost">CLIENTE ·················<br>WHATSAPP ···············<br>ENTREGA ················<br>FECHA ··················</div>';
    ghostShown=true;
  }
  function clearGhost(){
    if(!ghostShown) return;
    var g=rowsEl.querySelector('.ghost'); if(g&&g.parentNode) g.parentNode.removeChild(g);
    ghostShown=false;
  }
  // Inserta la fila nueva respetando el orden del ticket (aunque el cliente
  // llene los campos en otro orden).
  function insertOrdered(i, el){
    for(var j=i+1;j<LINES.length;j++){ var r=rows[LINES[j].k]; if(r){ rowsEl.insertBefore(el, r.el); return; } }
    rowsEl.appendChild(el);
  }

  function update(){
    if(!box) return;
    var anyVisible=false, printed=0;
    for(var i=0;i<LINES.length;i++){
      var key=LINES[i].k, v=LINES[i].get(), rec=rows[key];
      if(v){
        anyVisible=true;
        if(!rec){
          clearGhost();
          // Línea nueva → se "imprime" (uno por uno). Si aparecen varias en
          // el mismo instante (p. ej. al elegir courier), se escalonan.
          var row=document.createElement('div'); row.className='brow print';
          row.style.animationDelay=(printed*0.08)+'s'; printed++;
          row.innerHTML='<span class="k">'+esc(key)+'</span><span class="v"></span>';
          var vEl=row.querySelector('.v'); vEl.textContent=v;
          if(wizOn() && !window._ttFrozen){ row.classList.add('editable'); row.title='Tocar para editar';
            (function(k){ row.addEventListener('click',function(){ goEdit(k); }); })(key); }
          insertOrdered(i, row);
          rows[key]={el:row, vEl:vEl, val:v};
        } else if(rec.val!==v){
          // Actualización en vivo → solo cambia el texto, sin re-animar.
          rec.vEl.textContent=v; rec.val=v;
        }
      } else if(rec){
        // Se borró el campo → quitar la línea.
        if(rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
        delete rows[key];
      }
    }
    if(!anyVisible) showGhost();
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
  function removeBox(){ if(box&&box.parentNode){ box.parentNode.removeChild(box); rows={}; ghostShown=false; } }

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
        var isSuccess=app.querySelector('.success');
        // En seguimiento o en la pantalla de éxito, la boleta no aparece.
        if(isTrack||isSuccess){ removeBox(); return; }
        place();
      }catch(e){ /* nunca romper el formulario */ }
    },140);
  }
  // El observador IGNORA las mutaciones originadas dentro de la propia boleta
  // (evita el bucle de auto-disparo y no perturba a otros módulos —como el
  //  narrador— que también observan #app).
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
