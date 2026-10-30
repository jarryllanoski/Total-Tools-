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

  var MIN = slow?300:450;     // mínimo visible (evita parpadeo si la carga es instantánea/cacheada)
  var CAP = slow?12000:9000;  // tope de SEGURIDAD (solo si la red muere). En lento MÁS largo, no menos.
  var start = Date.now(), hidden=false, readyCalled=false, ov;

  var st=document.createElement('style');
  st.textContent=''
   +'#ttf-ov{position:fixed;inset:0;background:#070a0f;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .5s ease}'
   +'#ttf-ov.out{opacity:0}'
   +'#ttf-logo{width:min(240px,62vw);filter:drop-shadow(0 3px 6px rgba(0,0,0,.5)) drop-shadow(0 0 28px rgba(34,211,238,.5));animation:ttfpulse 2.2s ease-in-out infinite}'
   +'#ttf-logo.txt{font-family:system-ui,sans-serif;font-weight:900;font-size:30px;letter-spacing:1px;color:#22d3ee;text-align:center;line-height:1.05}'
   +'#ttf-bar-w{width:min(230px,62vw);height:7px;background:#12222b;border-radius:99px;overflow:hidden;margin-top:26px}'
   /* Rayas que van HACIA ATRÁS: la espera se siente más corta (Harrison
      et al., CHI 2010) y la barra nunca parece congelada. */
   +'#ttf-bar{height:100%;width:0%;border-radius:99px;background-color:#22d3ee;background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,.28) 0 6px,transparent 6px 12px);background-size:17px 17px;transition:width .15s linear;animation:ttfrayas .6s linear infinite}'
   +'#ttf-msg{margin-top:16px;font-family:system-ui,sans-serif;font-size:12px;font-weight:700;letter-spacing:3px;color:#22d3ee;text-transform:uppercase;text-align:center;padding:0 16px;transition:opacity .25s}'
   +'@keyframes ttfpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}'
   +'@keyframes ttfrayas{from{background-position:17px 0}to{background-position:0 0}}'
   +'@media(prefers-reduced-motion:reduce){#ttf-logo,#ttf-bar{animation:none}}';
  (document.head||document.documentElement).appendChild(st);

  // Elegir una de las 4 mascotas al azar en cada carga
  var LOGOS=['load-heavy.webp','load-super.webp','load-nauti.webp','load-toby.webp'];
  var pick=LOGOS[Math.floor(Math.random()*LOGOS.length)];

  ov=document.createElement('div'); ov.id='ttf-ov';
  // Prioridad alta y medidas fijas: aparece en cuanto se abre, sin saltos.
  ov.innerHTML='<img id="ttf-logo" alt="Total" fetchpriority="high" decoding="async" src="'+BASE+pick+'?v=3">'
    +'<div id="ttf-bar-w"><div id="ttf-bar"></div></div>'
    +'<div id="ttf-msg">Iniciando fábrica…</div>';
  (document.body||document.documentElement).appendChild(ov);

  // Fallback de texto si la imagen no carga (conexión lenta / falla)
  var img=ov.querySelector('#ttf-logo');
  img.onerror=function(){ var d=document.createElement('div'); d.id='ttf-logo'; d.className='txt'; d.innerHTML='TOTAL<br>TOOLS'; img.replaceWith(d); };

  /* ★ LA BARRA NUNCA SE QUEDA QUIETA (30/10/2026). Antes se acercaba al
     88 % y se paraba esperando al servidor: parecía que algo había fallado.
     Ahora:
       · avanza SIEMPRE (un mínimo por cuadro, cada vez más fino, sin llegar
         al 100 % hasta que la página esté lista);
       · al estar lista, CORRE al 100 % y se va: un final rápido es lo que
         se recuerda (Harrison et al., 2007);
       · el mensaje cambia con el tiempo y dice la verdad, también cuando
         la conexión va lenta. */
  var bar=ov.querySelector('#ttf-bar'), msg=ov.querySelector('#ttf-msg'), pct=0, raf;
  var MENSAJES=[[1200,'Preparando tus opciones de envío…'],[3000,'Casi listo…'],[6000,'Tu conexión va lenta, un momento más…']];
  function tick(){
    if(hidden){ pct += (100-pct)*0.35 + 1.5; }                 // final rápido
    else { pct += Math.max((90-pct)*0.03, (99-pct)*0.004); }    // nunca se detiene
    if(pct>100) pct=100;
    bar.style.width=pct.toFixed(1)+'%';
    var t=Date.now()-start;
    for(var i=MENSAJES.length-1;i>=0;i--){
      if(t>=MENSAJES[i][0]){ if(msg && msg.textContent!==MENSAJES[i][1]) msg.textContent=MENSAJES[i][1]; break; }
    }
    if(hidden && pct>=99.5){ fade(); return; }
    raf=requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function fade(){ if(!ov)return; if(raf)cancelAnimationFrame(raf); ov.classList.add('out'); setTimeout(function(){ if(ov){ov.remove();ov=null;} }, 520); }
  function done(){ if(hidden)return; hidden=true; }
  // Señal REAL de "listo": el formulario/tracking terminó de renderizar (config
  // incluida). Respeta un MIN para no parpadear. Reemplaza el ocultar por timer
  // corto + el observer de #f_name, que dejaban ver el spinner básico y el flash
  // del segundo render (el "carga, retrocede, carga").
  function ready(){
    if(readyCalled) return; readyCalled=true;
    setTimeout(done, Math.max(0, MIN-(Date.now()-start)));
  }
  window.TTFormLoader = { ready: ready };
  setTimeout(done, CAP); // tope de seguridad: nunca quedarse cargando
})();
