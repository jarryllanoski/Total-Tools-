/* ═══════════════════════════════════════════════════════════════════
   ETIQUETA EN VIVO — el cliente "construye" su etiqueta de envío mientras
   llena el formulario (la misma que irá pegada a su paquete).
   Capa de presentación OPCIONAL y DESACOPLADA (mismo patrón que la boleta
   anterior y los personajes): observa el DOM del formulario, no toca la
   lógica de guardado.
   · 0 llamadas a la nube · 0 cambios a formApi · solo lectura del DOM
   · Solo en el formulario (si hay ?seg=, no aplica)
   · Fuentes del sistema (sin CDN) — funciona en cualquier internet
   · QR cacheado local (narrador/qr-negocio.svg) — NO se genera por número
   · Actualización INCREMENTAL: la estructura se arma una sola vez y luego
     solo se edita el TEXTO de cada campo en su sitio (sin parpadear). No
     reescribe el HTML en cada tecla → no dispara bucles ni molesta a otros
     módulos (el narrador) que también observan #app.
   · No se escribe SOBRE la etiqueta, pero tocarla es un ATAJO: baja al primer
     campo vacío del formulario y le abre el teclado (antes no hacía nada y el
     cliente creía que la app estaba rota).
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).has('seg')) return;
  var app=document.getElementById('app'); if(!app) return;

  var esc=function(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };
  var txt=function(sel){ var e=app.querySelector(sel); return e?(e.textContent||'').trim():''; };
  var val=function(id){ var e=document.getElementById(id); return e?(e.value||'').trim():''; };
  var visible=function(id){ var e=document.getElementById(id); return !!(e&&e.offsetParent!==null); };

  // ── Estilos (etiqueta de envío: papel blanco, bordes negros) ────────
  var st=document.createElement('style');
  st.textContent=''
   +'#tt-lbl{margin:2px 0 10px;filter:drop-shadow(0 10px 18px rgba(0,0,0,.45))}'
   +'#tt-lbl .card{background:#fff;color:#111;border:1.6px solid #111;border-radius:7px;padding:10px 12px;font-family:Arial,Helvetica,sans-serif;line-height:1.35}'
   // PARA (cliente) + QR
   +'#tt-lbl .para{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}'
   +'#tt-lbl .para-info{flex:1;min-width:0}'
   +'#tt-lbl .seclbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.1px;color:#666;margin-bottom:2px}'
   +'#tt-lbl .cli{font-size:16px;font-weight:800;text-transform:uppercase;line-height:1.1;word-break:break-word;color:#111}'
   +'#tt-lbl .cli.ghost{color:#bbb;font-weight:600}'
   +'#tt-lbl .phone{font-size:13px;font-weight:700;margin-top:3px;color:#111}'
   +'#tt-lbl .dni{font-size:12px;font-weight:800;letter-spacing:.5px;margin-top:2px;color:#111}'
   +'#tt-lbl .qr{flex-shrink:0;text-align:center;width:56px}'
   +'#tt-lbl .qr img{display:block;width:56px;height:56px}'
   +'#tt-lbl .qr .qrnum{font-size:9.5px;color:#555;margin-top:2px;word-break:break-all}'
   // DESTINO
   +'#tt-lbl .dest{margin-top:8px;padding-top:7px;border-top:1px solid #111}'
   +'#tt-lbl .dest-addr{font-size:12px;color:#111;word-break:break-word;white-space:pre-wrap}'
   +'#tt-lbl .dest-addr.ghost{color:#bbb}'
   // Envío (courier · fecha)
   +'#tt-lbl .envio{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:8px;padding-top:7px;border-top:1.6px solid #111}'
   +'#tt-lbl .courier{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#111}'
   +'#tt-lbl .fecha{font-size:12.5px;font-weight:700;color:#333}'
   // REMITENTE (al pie)
   +'#tt-lbl .rem{margin-top:8px;padding-top:7px;border-top:1px dashed #999}'
   +'#tt-lbl .rem-name{font-size:12px;font-weight:700;color:#111}'
   +'#tt-lbl .rem-sub{font-size:10.5px;color:#444;margin-top:1px}'
   // Nota de revisión (sutil, fuera de la tarjeta)
   +'#tt-lbl .revisa{text-align:center;font-size:9px;letter-spacing:1px;color:#8a8a8a;text-transform:uppercase;margin-top:5px}'
   // La tarjeta es un ATAJO al formulario: tocarla lleva al campo que falta.
   +'#tt-lbl .card{cursor:pointer}'
   +'@media(prefers-reduced-motion:reduce){#tt-lbl *{animation:none!important}}';
  document.head.appendChild(st);

  // ── Datos del negocio (REMITENTE) — expuestos por el formulario ─────
  function bizInfo(){
    var b=window._bizInfo||{};
    return { name:b.name||'', phone:b.phone||'', city:b.city||'' };
  }

  // ── Lectura de los campos del cliente (mismos getters que la boleta) ─
  function getName(){ var v=val('f_name'); return v?v.toUpperCase():''; }
  function getPhone(){ var v=val('f_phone').replace(/\D/g,''); return v?'+51 '+v:''; }
  function getDni(){ return val('f_dni')||''; }
  function getCourier(){
    var s=document.getElementById('f_courier'); if(!s||!s.value) return '';
    var o=s.options[s.selectedIndex]; return o?(o.textContent||s.value).trim():s.value;
  }
  function getFecha(){
    var e=app.querySelector('.date-opt.active');
    return e?(e.textContent||'').replace(/\s+/g,' ').trim():'';
  }
  // DESTINO: reúso EXACTO de la lógica de la boleta (sin fuga de dirección)
  function getDestino(){
    var t=window._selCourierType;
    if(t){
      if(t==='agencia')    return txt('#shalomSelTxt')||txt('.sel-badge span')||'';
      if(t==='encomienda'){ var c=val('f_ciudad'), a=val('f_agencia'); return c?(c+(a?' — '+a:'')):''; }
      if(t==='delivery'){ var d=(window.getDeliveryAddr?window.getDeliveryAddr():val('addrManualInput')); var r=val('f_ref'); return d?(d+(r?' ('+r+')':'')):''; }
      return ''; // retiro en tienda: sin destino
    }
    var ag=txt('#shalomSelTxt')||txt('.sel-badge span'); if(ag) return ag;
    if(visible('f_ciudad')){ var c2=val('f_ciudad'), a2=val('f_agencia'); return c2?(c2+(a2?' — '+a2:'')):''; }
    var d2=(window.getDeliveryAddr?window.getDeliveryAddr():val('addrManualInput')); var r2=val('f_ref');
    if(d2) return d2+(r2?' ('+r2+')':'');
    return '';
  }

  // ── Construcción (una sola vez) ─────────────────────────────────────
  var box, el={};
  function build(){
    if(document.getElementById('tt-lbl')){ box=document.getElementById('tt-lbl'); return; }
    remDone=false;   // tarjeta nueva → REMITENTE se repinta (p. ej. al cargar CFG)
    box=document.createElement('div'); box.id='tt-lbl';
    box.innerHTML=''
      +'<div class="card">'
      +  '<div class="para">'
      +    '<div class="para-info">'
      +      '<div class="seclbl">Para:</div>'
      +      '<div class="cli"></div>'
      +      '<div class="phone" style="display:none"></div>'
      +      '<div class="dni" style="display:none"></div>'
      +    '</div>'
      +    '<div class="qr">'
      +      '<img src="narrador/qr-negocio.svg" alt="QR" width="56" height="56" loading="lazy" onerror="this.style.display=\'none\'">'
      +      '<div class="qrnum"></div>'
      +    '</div>'
      +  '</div>'
      +  '<div class="dest">'
      +    '<div class="seclbl">Destino:</div>'
      +    '<div class="dest-addr"></div>'
      +  '</div>'
      +  '<div class="envio">'
      +    '<span class="courier"></span>'
      +    '<span class="fecha"></span>'
      +  '</div>'
      +  '<div class="rem">'
      +    '<div class="seclbl">Remitente:</div>'
      +    '<div class="rem-name"></div>'
      +    '<div class="rem-sub rem-tel" style="display:none"></div>'
      +    '<div class="rem-sub rem-city" style="display:none"></div>'
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
    // REMITENTE se pinta una sola vez (dato del negocio, no cambia)
    paintRemitente();
    box.querySelector('.card').addEventListener('click', irAlFormulario);
  }

  /* ── Atajo: tocar la etiqueta lleva al campo que falta ───────────────
     El cliente ve SU NOMBRE en grande arriba del todo y lo toca esperando
     escribir ahí. Antes no pasaba nada y parecía que la app estaba rota.
     Ahora ese toque hace justo lo que quería: bajar al primer campo vacío
     y abrirle el teclado.

     ACCESIBILIDAD: esto es un ATAJO, no la única vía — los campos siguen
     alcanzándose con el tabulador. Por eso la tarjeta NO se marca como
     role="button" (haría que un lector de pantalla anunciara la etiqueta
     entera como un botón) ni se mete en el orden de tabulación.

     Sigue sin tocar la lógica de guardado: solo lee el DOM y enfoca. */
  function campoQueFalta(){
    var campos=app.querySelectorAll('input,select,textarea');
    var primero=null;
    for(var i=0;i<campos.length;i++){
      var c=campos[i];
      if(c.disabled||c.readOnly||c.type==='hidden') continue;
      if(c.offsetParent===null) continue;              // de otro paso: no visible
      if(!primero) primero=c;
      if(!String(c.value||'').trim()) return c;        // el primero VACÍO
    }
    return primero;                                     // todo lleno
  }
  function irAlFormulario(e){
    // No robarle el toque a nada que ya sea interactivo dentro de la tarjeta.
    if(e.target&&e.target.closest&&e.target.closest('a,button,input,select,textarea')) return;
    var destino=campoQueFalta();
    if(!destino) return;
    var suave=!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches);
    try{ destino.scrollIntoView({behavior:suave?'smooth':'auto',block:'center'}); }
    catch(_e){ destino.scrollIntoView(); }
    // El teclado solo se abre si el campo está VACÍO. Si ya estaba lleno, el
    // cliente solo quería ver dónde se edita — no le tapamos la pantalla.
    if(!String(destino.value||'').trim()){
      try{ destino.focus({preventScroll:true}); }catch(_e2){ destino.focus(); }
    }
  }

  var remDone=false;
  function paintRemitente(){
    if(remDone) return;
    var b=bizInfo();
    if(!b.name && !b.phone && !b.city) return; // aún sin CFG: reintenta luego
    el.remName.textContent=b.name||'—';
    if(b.phone){ el.remTel.textContent='Tel: '+b.phone; el.remTel.style.display=''; }
    if(b.city){ el.remCity.textContent=b.city; el.remCity.style.display=''; }
    remDone=true;
  }

  // ── Actualización: solo cambia texto, sin reescribir estructura ─────
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

    // Pie: "revisa que estén correctos" solo tiene sentido cuando YA hay algo
    // que revisar. Con la etiqueta aún en blanco era una orden imposible de
    // cumplir —y señalaba a la tarjeta, que no se edita—, así que el cliente
    // la tocaba y creía que la app estaba rota. Se decide con los MISMOS
    // valores que se acaban de pintar: una sola verdad, sin volver a leer el
    // DOM y sin poder desincronizarse de lo que se ve.
    el.revisa.textContent=(name&&dest)
      ? 'Revisa que tus datos estén correctos'
      : 'Así se verá tu etiqueta';
  }

  // ── Montaje en el formulario (después de la cabecera) ───────────────
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
        if(isTrack||isSuccess){ removeBox(); return; } // en seguimiento/éxito no aplica
        place();
      }catch(e){ /* nunca romper el formulario */ }
    },140);
  }
  // El observador IGNORA las mutaciones de la propia etiqueta (evita bucle
  // de auto-disparo y no perturba a otros módulos que observan #app).
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
