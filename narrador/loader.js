/* ═══════════════════════════════════════════════════════════════════
   LOADER DEL FORMULARIO — "INICIANDO FÁBRICA…" con logo de Heavy.
   Misma optimización que loading-screen.js: CSS/JS liviano, sin GSAP,
   se auto-oculta cuando el formulario está listo (o por tope de tiempo).
   · Solo para el formulario (si hay ?seg=, el tracking usa su loader)
   · Imagen con fallback de texto; en conexión lenta muestra breve
   · Debe cargarse ANTES del render del formulario (evita el parpadeo)
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  if(new URLSearchParams(location.search).has('seg')) return; // tracking = su propio loader

  var BASE=(function(){ var s=document.currentScript; return (s&&s.src)?s.src.replace(/[^/]*$/,''):'narrador/'; })();
  var slow=false;
  try{ var c=navigator.connection; if(c&&(c.saveData||/(^|-)2g$/.test(c.effectiveType||''))) slow=true; }catch(e){}

  var MIN = slow?300:1000;   // tiempo mínimo visible (para que se aprecie la marca)
  var MAX = slow?1500:2800;  // tope de seguridad (nunca colgar)
  var start = Date.now(), hidden=false, ov;

  var st=document.createElement('style');
  st.textContent=''
   +'#ttf-ov{position:fixed;inset:0;background:#070a0f;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .5s ease}'
   +'#ttf-ov.out{opacity:0}'
   +'#ttf-logo{width:min(240px,62vw);filter:drop-shadow(0 3px 6px rgba(0,0,0,.5)) drop-shadow(0 0 28px rgba(34,211,238,.5));animation:ttfpulse 2.2s ease-in-out infinite}'
   +'#ttf-logo.txt{font-family:system-ui,sans-serif;font-weight:900;font-size:30px;letter-spacing:1px;color:#22d3ee;text-align:center;line-height:1.05}'
   +'#ttf-bar-w{width:min(230px,62vw);height:7px;background:#12222b;border-radius:99px;overflow:hidden;margin-top:26px}'
   +'#ttf-bar{height:100%;width:0%;border-radius:99px;background:linear-gradient(90deg,#0891b2,#22d3ee,#a5f3fc);background-size:200% 100%;transition:width .15s linear;animation:ttfshine 1.6s linear infinite}'
   +'#ttf-msg{margin-top:16px;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;color:#22d3ee;text-transform:uppercase}'
   +'@keyframes ttfpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}'
   +'@keyframes ttfshine{to{background-position:200% 0}}'
   +'@media(prefers-reduced-motion:reduce){#ttf-logo,#ttf-bar{animation:none}}';
  (document.head||document.documentElement).appendChild(st);

  // Elegir una de las 4 mascotas al azar en cada carga
  var LOGOS=['load-heavy.webp','load-super.webp','load-nauti.webp','load-toby.webp'];
  var pick=LOGOS[Math.floor(Math.random()*LOGOS.length)];

  ov=document.createElement('div'); ov.id='ttf-ov';
  ov.innerHTML='<img id="ttf-logo" alt="Total" src="'+BASE+pick+'">'
    +'<div id="ttf-bar-w"><div id="ttf-bar"></div></div>'
    +'<div id="ttf-msg">Iniciando fábrica…</div>';
  (document.body||document.documentElement).appendChild(ov);

  // Fallback de texto si la imagen no carga (conexión lenta / falla)
  var img=ov.querySelector('#ttf-logo');
  img.onerror=function(){ var d=document.createElement('div'); d.id='ttf-logo'; d.className='txt'; d.innerHTML='TOTAL<br>TOOLS'; img.replaceWith(d); };

  // Barra de progreso animada (falsa, hasta que el form esté listo)
  var bar=ov.querySelector('#ttf-bar'), pct=0, raf;
  function tick(){
    var ceil = hidden?100:88;
    pct += (ceil-pct)*0.06 + 0.4;
    if(pct>ceil) pct=ceil;
    if(pct>100) pct=100;
    bar.style.width=pct.toFixed(1)+'%';
    if(hidden && pct>=99.5){ fade(); return; }
    raf=requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function fade(){ if(!ov)return; if(raf)cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(function(){ if(ov){ov.remove();ov=null;} }, 520); }
  function done(){ if(hidden)return; hidden=true; }
  function ready(){ var t=Date.now()-start; setTimeout(done, Math.max(0, MIN-t)); }

  // Ocultar cuando el formulario aparece (#f_name) o por tope de tiempo
  if(document.getElementById('f_name')) ready();
  else{
    try{
      var mo=new MutationObserver(function(){ if(document.getElementById('f_name')){ mo.disconnect(); ready(); } });
      mo.observe(document.documentElement,{childList:true,subtree:true});
    }catch(e){ ready(); }
  }
  setTimeout(done, MAX); // seguridad: nunca quedarse cargando
})();
