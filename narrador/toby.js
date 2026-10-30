/* ═══════════════════════════════════════════════════════════════════
   TOBY — el guía de las ayudas (formulario, seguimiento y panel).
   UNA pieza para las tres: el mismo globo, el mismo estilo, sin copias.
   · La imagen (narrador/toby.webp, ~9 KB) se pide SOLO cuando se abre una
     ayuda: quien no la abre no descarga nada.
   · Sin imagen (falla de red), queda el globo de texto.
   · Cero lecturas y escrituras: Toby dice lo que ya está en pantalla.
   Uso:  Toby.globo('Texto con <b>HTML ya escapado</b>', 'Guía de pedidos')
         → devuelve el HTML del globo (y pone su CSS una sola vez).
   ═══════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';
  var BASE=(function(){ var s=document.currentScript; return (s&&s.src)?s.src.replace(/[^/]*$/,''):'narrador/'; })();
  var CSS=''
    +'.toby{display:flex;align-items:flex-end;gap:10px;margin:0 0 14px}'
    +'.toby-av{position:relative;flex:0 0 auto;width:74px;height:72px;filter:drop-shadow(0 6px 10px rgba(0,0,0,.4))}'
    +'.toby-av img{width:100%;height:100%;object-fit:contain;object-position:bottom;-webkit-mask-image:linear-gradient(to bottom,#000 80%,transparent);mask-image:linear-gradient(to bottom,#000 80%,transparent);animation:tobyBob 3.6s ease-in-out infinite}'
    +'@keyframes tobyBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}'
    +'.toby-tag{position:absolute;left:0;bottom:-2px;background:#2dd4bf;color:#04122c;font-size:8px;font-weight:800;padding:1px 4px;border-radius:5px}'
    +'.toby-bub{position:relative;flex:1;min-width:0;background:#12203d;color:#eaf1ff;border:1px solid #2b3f66;border-radius:14px;padding:11px 14px 12px;font-size:13.5px;line-height:1.45;font-family:inherit}'
    +'.toby-bub:after{content:"";position:absolute;left:-7px;bottom:16px;border:7px solid transparent;border-right-color:#12203d;border-left:0}'
    +'.toby-who{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#2dd4bf;font-weight:700;margin-bottom:3px}'
    +'@media(prefers-reduced-motion:reduce){.toby-av img{animation:none}}';
  function css(){
    if(document.getElementById('tobyCss')) return;
    var st=document.createElement('style'); st.id='tobyCss'; st.textContent=CSS;
    (document.head||document.documentElement).appendChild(st);
  }
  /* `texto` llega YA escapado por quien llama (puede traer <b>). */
  function globo(texto, rol){
    css();
    return '<div class="toby">'
      +'<div class="toby-av"><img src="'+BASE+'toby.webp?v=1" alt="" loading="eager" decoding="async" onerror="this.parentNode.style.display=\'none\'"><span class="toby-tag">TOBY</span></div>'
      +'<div class="toby-bub"><div class="toby-who">Toby · '+(rol||'Guía')+'</div>'+texto+'</div>'
      +'</div>';
  }
  window.Toby = {globo: globo};
})();
