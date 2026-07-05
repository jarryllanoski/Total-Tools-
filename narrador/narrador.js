/* ═══════════════════════════════════════════════════════════════════
   NARRADOR — Heavy (formulario) + Delfi (seguimiento)
   Capa de presentación OPCIONAL. No toca la lógica del formulario:
   solo observa el DOM (#app) y muestra a los personajes con globos.
   · 0 llamadas nuevas a la nube (lee datos ya presentes en el DOM)
   · Carga diferida, imágenes lazy, animaciones CSS (sin GSAP)
   · Se auto-desactiva en conexión lenta / ahorro de datos
   · Si algo falla, el formulario sigue funcionando igual
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ── 0. Solo corre en la página del formulario/seguimiento ──────────
  var app = document.getElementById('app');
  if(!app) return;

  // ── 1. Conexión lenta / ahorro de datos → no activar ───────────────
  try{
    var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType||''))) return;
  }catch(e){}

  var BASE = (function(){
    // carpeta donde vive este script (para las imágenes)
    var s = document.currentScript;
    if(s && s.src) return s.src.replace(/[^/]*$/,'');
    return 'narrador/';
  })();

  // ── 2. Diálogos ────────────────────────────────────────────────────
  var esc = function(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  var HEAVY = {
    img: BASE+'heavy.webp', name:'Heavy · Jefe de Producción',
    welcome:'¡Bienvenido a la Fábrica Total! 🔥 Soy Heavy, jefe de producción. Tú haces el pedido, nosotros fabricamos la experiencia. Comencemos.',
    name_new:'Perfecto. Ya sabemos quién recibirá esta herramienta.',
    name_known:function(n){ return '¡Te reconozco, '+n+'! Un gusto tenerte de vuelta. 👊'; },
    phone:'Excelente. Ya instalé el módulo de comunicación. Así te avisamos cada avance.',
    courier:{
      delivery:'Envío a domicilio. Estoy preparando la mejor ruta hasta tu puerta. 🛵',
      agencia:'Retiro en agencia. Preparo el envío al punto que elijas. 🏢',
      encomienda:'Encomienda a otra ciudad. Preparo tu herramienta para un viaje seguro. 📦'
    },
    place:{
      agencia:function(a){ return 'Ubicación confirmada'+(a?': '+a:'')+'. Nuestros operadores ya conocen el destino.'; },
      delivery:'Dirección confirmada. Llevaremos tu herramienta hasta tu puerta.',
      encomienda:function(ci){ return 'Ciudad destino confirmada'+(ci?': '+ci:'')+'. Listo para el envío.'; }
    },
    dni:'Control de seguridad aprobado. Solo la persona autorizada podrá recibir el pedido.',
    date:'Producción programada. Reservé tu espacio en la línea de ensamblaje para esa fecha.',
    bye:'¡Misión cumplida! 💪 Mi trabajo aquí terminó. Ahora mi compañero Delfi llevará tu herramienta hasta su destino.'
  };

  var DELFI = {
    img: BASE+'delfi.webp', name:'Delfi · Jefe de Logística',
    welcome:'¡Hola! 👋 Soy Delfi, jefe de logística. Desde ahora te acompaño hasta que recibas tu pedido.',
    s0:'Tu pedido llegó bien y ya está registrado. 📋 Comenzamos a trabajarlo.',
    s1:'Los especialistas están alistando y protegiendo tu herramienta para que llegue en excelentes condiciones. 📦',
    s2:'¡Ya salió de nuestra tienda! 🚚 Tu pedido está en viaje y sigo el recorrido en tiempo real.',
    s3_agencia:function(a,dir){ return '¡Tu pedido llegó a la agencia'+(a?' '+a:'')+'! Acércate con tu DNI'+(dir?' a '+dir:'')+' para recogerlo. 🏢'; },
    s3_delivery:'¡Tu pedido llegó a tu dirección! Sal a recibirlo y revisa tu herramienta al momento de la entrega. 🛵',
    s3_encomienda:function(ci){ return 'Tu encomienda llegó'+(ci?' a '+ci:'')+'. Acércate con tu DNI a la agencia de destino para recogerla. 📦'; },
    pago:'Tu pedido está en destino. Coordina el pago para completar la entrega. 💳',
    s4:'🎉 ¡Entrega completada! Gracias por confiar en Total. Espero acompañarte en tu próxima compra.',
    notfound:'No encuentro tu pedido con ese código. Escríbenos y lo revisamos enseguida. 💬'
  };

  // ── 3. Estilos (inyectados una vez) ────────────────────────────────
  var css = ''
  + '#tt-narr{position:fixed;left:10px;right:10px;bottom:10px;z-index:9000;display:flex;align-items:flex-end;gap:10px;pointer-events:none;max-width:560px;margin:0 auto;font-family:inherit;opacity:0;transform:translateY(16px);transition:opacity .4s ease,transform .4s ease}'
  + '#tt-narr.on{opacity:1;transform:none}'
  + '@media(prefers-reduced-motion:reduce){#tt-narr{transition:none}}'
  + '#tt-narr .av{position:relative;flex:0 0 auto;width:74px;height:88px;pointer-events:auto;cursor:pointer;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4))}'
  + '#tt-narr .av img{width:100%;height:100%;object-fit:contain;object-position:bottom;-webkit-mask-image:linear-gradient(to bottom,#000 78%,transparent);mask-image:linear-gradient(to bottom,#000 78%,transparent);animation:ttbob 3.6s ease-in-out infinite}'
  + '@keyframes ttbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}'
  + '@media(prefers-reduced-motion:reduce){#tt-narr .av img{animation:none}}'
  + '#tt-narr .bub{position:relative;flex:1;min-width:0;background:#12203d;color:#eaf1ff;border:1px solid #2b3f66;border-radius:14px;padding:11px 14px 12px;box-shadow:0 8px 24px rgba(0,0,0,.35);pointer-events:auto;font-size:13.5px;line-height:1.45}'
  + '#tt-narr .bub .who{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#5b9bff;font-weight:700;margin-bottom:3px}'
  + '#tt-narr .bub .tx{display:block}'
  + '#tt-narr .bub .x{position:absolute;top:6px;right:8px;background:none;border:none;color:#7d8cae;font-size:16px;line-height:1;cursor:pointer;padding:2px}'
  + '#tt-narr .bub:after{content:"";position:absolute;left:-7px;bottom:16px;width:0;height:0;border:7px solid transparent;border-right-color:#12203d;border-left:0}'
  + '#tt-narr.min .bub{display:none}'
  + '#tt-narr.min{left:auto;right:12px;max-width:none}'
  + '#tt-narr.min .av{width:52px;height:60px}'
  + '#tt-narr .tag{position:absolute;left:0;bottom:-2px;background:#5b9bff;color:#04122c;font-size:8px;font-weight:800;padding:1px 4px;border-radius:5px;pointer-events:none}';

  // ── 4. UI ──────────────────────────────────────────────────────────
  var wrap, imgEl, whoEl, txEl, cur=null, minimized=false, hideTimer=0;
  function build(){
    if(wrap) return;
    var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
    wrap=document.createElement('div'); wrap.id='tt-narr';
    wrap.innerHTML='<div class="av"><img alt="" loading="lazy" fetchpriority="low"><span class="tag"></span></div>'
      +'<div class="bub"><button class="x" aria-label="cerrar">×</button><span class="who"></span><span class="tx"></span></div>';
    document.body.appendChild(wrap);
    imgEl=wrap.querySelector('img'); whoEl=wrap.querySelector('.who'); txEl=wrap.querySelector('.tx');
    imgEl.onerror=function(){ wrap.querySelector('.av').style.display='none'; }; // fallback: solo texto
    wrap.querySelector('.av').addEventListener('click',function(){ minimized=!minimized; wrap.classList.toggle('min',minimized); if(!minimized) clearTimeout(hideTimer); });
    wrap.querySelector('.x').addEventListener('click',function(){ hide(); minimized=true; wrap.classList.add('min'); });
  }
  function say(who, text){
    if(!text) return;
    build();
    var isDelfi = who==='delfi';
    var chr = isDelfi?DELFI:HEAVY;
    if(cur!==who){ imgEl.src=chr.img; wrap.querySelector('.tag').textContent = isDelfi?'DELFI':'HEAVY'; cur=who; }
    whoEl.textContent = chr.name;
    txEl.innerHTML = esc(text);
    minimized=false; wrap.classList.remove('min');
    requestAnimationFrame(function(){ wrap.classList.add('on'); });
    // Auto-colapso a avatar de esquina tras unos segundos (no bloquea el botón)
    clearTimeout(hideTimer);
    hideTimer=setTimeout(function(){ minimized=true; wrap.classList.add('min'); }, 6500);
  }
  function hide(){ if(wrap) wrap.classList.remove('on'); }

  // ── 5. Lectura del DOM (sin tocar la lógica) ───────────────────────
  function txt(sel,root){ var e=(root||app).querySelector(sel); return e?(e.textContent||'').trim():''; }
  function has(sel,root){ return !!(root||app).querySelector(sel); }

  // Lee el valor de una fila del tracking por su etiqueta
  function rowVal(label){
    var rows=app.querySelectorAll('.tk-row'), re=new RegExp(label,'i');
    for(var i=0;i<rows.length;i++){
      var l=rows[i].querySelector('.tk-row-lbl'), v=rows[i].querySelector('.tk-row-val');
      if(l&&v&&re.test(l.textContent)) return (v.textContent||'').trim();
    }
    return '';
  }
  // Tipo de envío deducido del DOM visible (funciona en form Y en tracking)
  function tipoEnvio(){
    // Formulario
    if(has('#f_ciudad')||has('#f_dni_dest')) return 'encomienda';
    if(has('#shalomSelTxt')||has('#f_dni_recoger')) return 'agencia';
    // Tracking (filas del resultado)
    if(rowVal('Ciudad destino')||rowVal('DNI destinatario')) return 'encomienda';
    if(rowVal('DNI para recoger')||rowVal('Agencia')) return 'agencia';
    return 'delivery';
  }
  function agenciaSel(){
    return txt('#shalomSelTxt') || txt('.sel-badge span') || rowVal('Agencia') || rowVal('Direcci[oó]n') || '';
  }

  // Etapa de tracking a partir del texto de estado
  function estadoATexto(){
    // status-badge muestra el estado; lo mapeo a las 5 etapas reales
    var badge = txt('.status-badge').toUpperCase();
    if(!badge) return null;
    if(/FINALIZADO|ENTREGADO/.test(badge)) return {st:4};
    if(/PENDIENTE DE PAGO/.test(badge))    return {st:3, pago:true};
    if(/DESTINO/.test(badge))              return {st:3};
    if(/ENVIADO/.test(badge))              return {st:2};
    if(/ALISTAR|ALISTADO/.test(badge))     return {st:1};
    return {st:0};
  }

  // ── 6. Lógica del FORMULARIO (Heavy) ───────────────────────────────
  var heavySeen={};
  function heavyWelcomeOnce(){
    if(heavySeen.w) return; heavySeen.w=1; say('heavy',HEAVY.welcome);
  }
  var deb;
  function onFormInput(e){
    if(!has('#f_name')) return; // solo si el form está visible
    clearTimeout(deb);
    deb=setTimeout(function(){
      var id=(e&&e.target&&e.target.id)||'';
      if(id==='f_name'){
        var v=(document.getElementById('f_name')||{}).value||'';
        if(v.trim().length>=3 && !heavySeen.name){ heavySeen.name=1; say('heavy',HEAVY.name_new); }
      } else if(id==='f_phone'){
        var p=((document.getElementById('f_phone')||{}).value||'').replace(/\D/g,'');
        if(p.length>=9 && !heavySeen.phone){ heavySeen.phone=1; say('heavy',HEAVY.phone); }
      } else if(/dni/i.test(id)){
        var d=((e.target.value)||'').replace(/\D/g,'');
        if(d.length>=8 && !heavySeen.dni){ heavySeen.dni=1; say('heavy',HEAVY.dni); }
      }
    },420);
  }
  document.addEventListener('input', onFormInput, true);

  // Courier / agencia / fecha detectados por observación del DOM
  function heavyScanForm(){
    if(!has('#f_name')) return;
    heavyWelcomeOnce();
    var t=tipoEnvio();
    if(t && heavySeen.courier!==t){ heavySeen.courier=t; if(HEAVY.courier[t]) say('heavy',HEAVY.courier[t]); }
    var ag=agenciaSel();
    if(ag && heavySeen.ag!==ag){
      heavySeen.ag=ag;
      say('heavy', HEAVY.place.agencia(ag));
    }
  }

  // ── 7. Éxito → Delfi ───────────────────────────────────────────────
  function isSuccess(){ return /casi listo|pedido recibido|c[óo]digo de seguimiento/i.test(app.textContent||'') && has('a[href*="wa.me"]'); }
  function isTracking(){ return has('.track-card')||has('.status-badge'); }
  function isNotFound(){ return /link no disponible|no encuentro tu pedido/i.test(app.textContent||''); }

  // ── 8. Lógica del SEGUIMIENTO (Delfi) ──────────────────────────────
  var lastDelfiKey='';
  function delfiScan(){
    if(isNotFound()){ if(lastDelfiKey!=='nf'){ lastDelfiKey='nf'; say('delfi',DELFI.notfound); } return; }
    if(!isTracking()) return;
    var e=estadoATexto(); if(!e) return;
    var key=JSON.stringify(e)+tipoEnvio();
    if(key===lastDelfiKey) return; lastDelfiKey=key;
    var m;
    if(e.st===0) m=DELFI.welcome+' '+DELFI.s0;
    else if(e.st===1) m=DELFI.s1;
    else if(e.st===2) m=DELFI.s2;
    else if(e.st===3){
      if(e.pago) m=DELFI.pago;
      else{
        var t=tipoEnvio();
        if(t==='encomienda') m=DELFI.s3_encomienda(rowVal('Ciudad destino'));
        else if(t==='agencia'){ m=DELFI.s3_agencia(agenciaSel(),''); }
        else m=DELFI.s3_delivery;
      }
    }
    else if(e.st===4) m=DELFI.s4;
    say('delfi', m);
  }

  // ── 9. Observador central: reacciona a cada cambio de pantalla ─────
  var scanT;
  function scan(){
    clearTimeout(scanT);
    scanT=setTimeout(function(){
      try{
        if(isSuccess()){ if(!heavySeen.bye){ heavySeen.bye=1; say('heavy',HEAVY.bye); } return; }
        if(isTracking()||isNotFound()){ delfiScan(); return; }
        if(has('#f_name')){ heavyScanForm(); return; }
      }catch(err){ /* nunca romper el formulario */ }
    },180);
  }
  try{ new MutationObserver(scan).observe(app,{childList:true,subtree:true,characterData:true}); }catch(e){}
  // primer escaneo tras cargar
  if(document.readyState!=='loading') scan(); else document.addEventListener('DOMContentLoaded',scan);
  window.addEventListener('load',scan);

})();
