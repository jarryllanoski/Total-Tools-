/**
 * loading-screen.js — Pantalla de carga animada para seguimiento del cliente
 * Se activa automáticamente cuando ?seg= está en la URL.
 * 5 temas aleatorios: sierra, demoledor, taladro, amoladora, martillo
 */
(function(){
  'use strict';
  if(!new URLSearchParams(location.search).has('seg')) return;

  /* ── Estado ─────────────────────────────────────────────────────── */
  var _ov=null, _bar=null, _pctEl=null, _msgEl=null;
  var _pct=0, _done=false, _raf=null, _themeUpdate=null;

  var STAGES=[
    {p:0,  msg:'Conectando con tu pedido...'},
    {p:22, msg:'Obteniendo información...'},
    {p:52, msg:'Verificando estado del envío...'},
    {p:76, msg:'Preparando tu seguimiento...'},
    {p:94, msg:'¡Casi listo!'},
  ];

  /* ── CSS global ─────────────────────────────────────────────────── */
  function _css(){
    var s=document.createElement('style');
    s.textContent=
      '#ttl-ov{position:fixed;inset:0;background:#080810;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .55s}'+
      '#ttl-brand{display:flex;align-items:center;gap:10px;margin-bottom:20px}'+
      '#ttl-brand-name{font-family:system-ui,sans-serif;font-size:17px;font-weight:800;color:#F59E0B;letter-spacing:.4px}'+
      '#ttl-brand-sub{font-size:10px;color:#6B7280;letter-spacing:1.5px;text-transform:uppercase;margin-top:1px}'+
      '#ttl-anim{width:200px;height:200px}'+
      '#ttl-bar-wrap{width:230px;background:#1a1a2e;border-radius:99px;height:7px;margin-top:22px;overflow:hidden}'+
      '#ttl-bar{height:100%;background:linear-gradient(90deg,#B45309,#F59E0B,#FDE68A);background-size:200% 100%;border-radius:99px;width:0%;transition:width .12s linear}'+
      '#ttl-bottom{display:flex;justify-content:space-between;width:230px;margin-top:7px}'+
      '#ttl-msg{font-family:system-ui,sans-serif;font-size:11px;color:#6B7280;font-style:italic}'+
      '#ttl-pct{font-family:system-ui,sans-serif;font-size:11px;color:#F59E0B;font-weight:700}'+
      '@keyframes ttl-spin{to{transform:rotate(360deg)}}'+
      '@keyframes ttl-spin-rev{to{transform:rotate(-360deg)}}'+
      '@keyframes ttl-bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(13px)}}'+
      '@keyframes ttl-bounce-sm{0%,100%{transform:translateY(0)}50%{transform:translateY(6px)}}'+
      '@keyframes ttl-swing{0%,100%{transform:rotate(-38deg)}55%{transform:rotate(9deg)}}'+
      '@keyframes ttl-shake{0%,100%{transform:translateX(0)}33%{transform:translateX(-2px)}66%{transform:translateX(2px)}}'+
      '@keyframes ttl-dust{0%{opacity:.85;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(var(--dx,5px),9px) scale(.5)}}'+
      '@keyframes ttl-spark{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:var(--td,translate(20px,-20px)) scale(0)}}'+
      '@keyframes ttl-flash{0%,100%{opacity:.35}50%{opacity:.9}}';
    document.head.appendChild(s);
  }

  /* ── TEMA 1: SIERRA CIRCULAR ────────────────────────────────────── */
  function _sierra(){
    return {
      html:
        '<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'+
          // Madera
          '<rect x="10" y="132" width="180" height="58" rx="3" fill="#5C2E0A"/>'+
          '<rect x="10" y="132" width="180" height="9" rx="3" fill="#7C3E1A"/>'+
          '<line x1="10" y1="150" x2="190" y2="150" stroke="#3A1C06" stroke-width="1.5"/>'+
          '<line x1="10" y1="164" x2="190" y2="164" stroke="#3A1C06" stroke-width="1.5"/>'+
          '<line x1="10" y1="178" x2="190" y2="178" stroke="#3A1C06" stroke-width="1"/>'+
          // Corte (progreso)
          '<rect id="ttl-cut" x="10" y="130" width="0" height="62" fill="#080810"/>'+
          // Carcasa
          '<path d="M56,108 Q100,97 144,108 L144,132 Q100,120 56,132 Z" fill="#1E293B" stroke="#334155" stroke-width="1"/>'+
          // Disco giratorio
          '<g style="transform-origin:100px 108px;animation:ttl-spin .26s linear infinite">'+
            '<circle cx="100" cy="108" r="37" fill="#4B5563" stroke="#6B7280" stroke-width="2"/>'+
            '<circle cx="100" cy="108" r="37" fill="none" stroke="#9CA3AF" stroke-width="6" stroke-dasharray="9 5"/>'+
            '<circle cx="100" cy="108" r="21" fill="#374151"/>'+
            '<circle cx="100" cy="108" r="7" fill="#1F2937" stroke="#4B5563" stroke-width="2"/>'+
            '<line x1="100" y1="73" x2="100" y2="85" stroke="#6B7280" stroke-width="3" stroke-linecap="round"/>'+
            '<line x1="100" y1="131" x2="100" y2="143" stroke="#6B7280" stroke-width="3" stroke-linecap="round"/>'+
            '<line x1="65" y1="108" x2="77" y2="108" stroke="#6B7280" stroke-width="3" stroke-linecap="round"/>'+
            '<line x1="123" y1="108" x2="135" y2="108" stroke="#6B7280" stroke-width="3" stroke-linecap="round"/>'+
          '</g>'+
          // Mango
          '<rect x="88" y="42" width="24" height="52" rx="6" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>'+
          '<rect x="92" y="38" width="16" height="14" rx="5" fill="#111827" stroke="#374151" stroke-width="1"/>'+
          // Aserrín
          '<circle style="animation:ttl-dust .5s ease-out infinite;--dx:7px" cx="100" cy="134" r="2.5" fill="#92400E"/>'+
          '<circle style="animation:ttl-dust .5s ease-out infinite .13s;--dx:-6px" cx="94" cy="136" r="2" fill="#78350F"/>'+
          '<circle style="animation:ttl-dust .5s ease-out infinite .25s;--dx:10px" cx="107" cy="135" r="1.5" fill="#92400E"/>'+
          '<circle style="animation:ttl-dust .5s ease-out infinite .07s;--dx:-10px" cx="91" cy="133" r="1.5" fill="#6B3A1A"/>'+
        '</svg>',
      update:function(p){
        var el=document.getElementById('ttl-cut');
        if(el) el.setAttribute('width',Math.floor(p*1.82)+'');
      }
    };
  }

  /* ── TEMA 2: DEMOLEDOR NEUMÁTICO ────────────────────────────────── */
  function _demoledor(){
    return {
      html:
        '<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'+
          // Piso concreto
          '<rect x="10" y="158" width="180" height="38" rx="2" fill="#374151" stroke="#4B5563" stroke-width="1"/>'+
          '<line x1="10" y1="170" x2="190" y2="170" stroke="#2D3748" stroke-width="1.5" opacity=".6"/>'+
          '<line x1="10" y1="182" x2="190" y2="182" stroke="#2D3748" stroke-width="1" opacity=".4"/>'+
          // Grietas
          '<g id="ttl-cracks" style="opacity:0">'+
            '<line x1="100" y1="158" x2="76" y2="174" stroke="#1C1917" stroke-width="3" stroke-linecap="round"/>'+
            '<line x1="100" y1="158" x2="126" y2="176" stroke="#1C1917" stroke-width="2.5" stroke-linecap="round"/>'+
            '<line x1="76" y1="174" x2="58" y2="188" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
            '<line x1="126" y1="176" x2="146" y2="192" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
            '<line x1="100" y1="158" x2="100" y2="180" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
          '</g>'+
          // Polvo impacto
          '<g id="ttl-imp-dust" style="opacity:0">'+
            '<circle style="animation:ttl-dust .38s ease-out infinite;--dx:14px" cx="100" cy="160" r="3" fill="#6B7280"/>'+
            '<circle style="animation:ttl-dust .38s ease-out infinite .1s;--dx:-11px" cx="96" cy="161" r="2.5" fill="#9CA3AF"/>'+
            '<circle style="animation:ttl-dust .38s ease-out infinite .19s;--dx:18px" cx="105" cy="159" r="2" fill="#6B7280"/>'+
            '<circle style="animation:ttl-dust .38s ease-out infinite .05s;--dx:-16px" cx="93" cy="162" r="2" fill="#4B5563"/>'+
          '</g>'+
          // Cuerpo del demoledor
          '<g style="transform-origin:100px 158px;animation:ttl-bounce .17s ease-in-out infinite">'+
            '<rect x="83" y="78" width="34" height="76" rx="6" fill="#D97706" stroke="#F59E0B" stroke-width="1.5"/>'+
            '<rect x="87" y="83" width="26" height="18" rx="4" fill="#B45309"/>'+
            '<rect x="117" y="92" width="11" height="7" rx="4" fill="#92400E"/>'+
            // Broca
            '<rect x="96" y="152" width="8" height="28" rx="3" fill="#9CA3AF" stroke="#D1D5DB" stroke-width="1"/>'+
            '<polygon points="100,182 95,172 105,172" fill="#D1D5DB"/>'+
            // Manijas
            '<rect x="72" y="98" width="13" height="20" rx="6" fill="#1E293B" stroke="#374155" stroke-width="1.5"/>'+
            '<rect x="115" y="98" width="13" height="20" rx="6" fill="#1E293B" stroke="#374155" stroke-width="1.5"/>'+
            // Vibración
            '<line x1="72" y1="128" x2="62" y2="128" stroke="#F59E0B" stroke-width="1.5" style="animation:ttl-flash .18s infinite"/>'+
            '<line x1="128" y1="128" x2="138" y2="128" stroke="#F59E0B" stroke-width="1.5" style="animation:ttl-flash .18s infinite .09s"/>'+
          '</g>'+
        '</svg>',
      update:function(p){
        var c=document.getElementById('ttl-cracks'), d=document.getElementById('ttl-imp-dust');
        if(c) c.style.opacity=Math.min(1,p/25)+'';
        if(d) d.style.opacity=p>10?'1':'0';
      }
    };
  }

  /* ── TEMA 3: TALADRO ────────────────────────────────────────────── */
  function _taladro(){
    return {
      html:
        '<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'+
          // Superficie
          '<rect x="20" y="152" width="160" height="44" rx="3" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>'+
          '<line x1="20" y1="164" x2="180" y2="164" stroke="#0F172A" stroke-width="1.5" opacity=".7"/>'+
          '<line x1="20" y1="176" x2="180" y2="176" stroke="#0F172A" stroke-width="1" opacity=".5"/>'+
          // Agujero
          '<ellipse cx="100" cy="152" rx="11" ry="4" fill="#080810"/>'+
          '<rect id="ttl-hole" x="89" y="152" width="22" height="0" fill="#080810"/>'+
          // Virutas
          '<circle style="animation:ttl-dust .38s ease-out infinite;--dx:14px" cx="112" cy="154" r="2.5" fill="#475569"/>'+
          '<circle style="animation:ttl-dust .38s ease-out infinite .14s;--dx:-12px" cx="88" cy="155" r="2" fill="#64748B"/>'+
          '<circle style="animation:ttl-dust .38s ease-out infinite .07s;--dx:19px" cx="114" cy="152" r="1.5" fill="#334155"/>'+
          '<circle style="animation:ttl-dust .38s ease-out infinite .21s;--dx:-17px" cx="86" cy="153" r="1.5" fill="#475569"/>'+
          // Taladro
          '<g style="transform-origin:100px 152px;animation:ttl-bounce-sm .14s ease-in-out infinite">'+
            // Chuck
            '<rect x="87" y="122" width="26" height="28" rx="4" fill="#D97706" stroke="#F59E0B" stroke-width="1.5"/>'+
            '<rect x="91" y="126" width="18" height="7" rx="3" fill="#B45309"/>'+
            '<rect x="89" y="146" width="7" height="12" rx="2" fill="#6B7280" stroke="#9CA3AF" stroke-width="1"/>'+
            '<rect x="104" y="146" width="7" height="12" rx="2" fill="#6B7280" stroke="#9CA3AF" stroke-width="1"/>'+
            // Broca girando
            '<g style="transform-origin:100px 154px;animation:ttl-spin .18s linear infinite">'+
              '<rect x="98.5" y="150" width="3" height="38" rx="1.5" fill="#C0C0C0"/>'+
              '<path d="M98.5,154 Q103,160 98.5,166 Q103,172 98.5,178 Q103,184 98.5,190" stroke="#9CA3AF" stroke-width="1.5" fill="none"/>'+
              '<polygon points="100,192 97,183 103,183" fill="#E5E7EB"/>'+
            '</g>'+
            // Motor
            '<rect x="80" y="58" width="40" height="68" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>'+
            '<rect x="76" y="73" width="48" height="30" rx="10" fill="#111827" stroke="#1F2937" stroke-width="1"/>'+
            '<rect x="95" y="88" width="10" height="16" rx="3" fill="#374151"/>'+
            '<line x1="84" y1="63" x2="84" y2="73" stroke="#334155" stroke-width="1.5"/>'+
            '<line x1="92" y1="61" x2="92" y2="71" stroke="#334155" stroke-width="1.5"/>'+
            '<line x1="108" y1="61" x2="108" y2="71" stroke="#334155" stroke-width="1.5"/>'+
            '<line x1="116" y1="63" x2="116" y2="73" stroke="#334155" stroke-width="1.5"/>'+
          '</g>'+
        '</svg>',
      update:function(p){
        var h=document.getElementById('ttl-hole');
        if(h) h.setAttribute('height',Math.floor(p*0.36)+'');
      }
    };
  }

  /* ── TEMA 4: AMOLADORA ANGULAR ──────────────────────────────────── */
  function _amoladora(){
    var sparks='';
    for(var i=0;i<14;i++){
      var a=(i*25.7-90)*Math.PI/180;
      var dist=26+(i%3)*9;
      var tx=Math.round(Math.cos(a)*dist), ty=Math.round(Math.sin(a)*dist);
      var delay=(i*0.07).toFixed(2);
      var r=(1+(i%3)*0.6).toFixed(1);
      var col=i%2===0?'#FDE68A':'#F59E0B';
      sparks+='<circle style="animation:ttl-spark .38s ease-out infinite '+delay+'s;--td:translate('+tx+'px,'+ty+'px)" cx="128" cy="152" r="'+r+'" fill="'+col+'" opacity=".9"/>';
    }
    return {
      html:
        '<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'+
          // Barra metálica
          '<rect x="78" y="146" width="104" height="20" rx="3" fill="#374151" stroke="#4B5563" stroke-width="1.5"/>'+
          '<rect x="78" y="146" width="104" height="5" rx="3" fill="#4B5563"/>'+
          // Corte
          '<rect id="ttl-grind" x="78" y="144" width="0" height="24" rx="2" fill="#080810"/>'+
          // Chispas
          '<g id="ttl-sparks" style="opacity:0">'+sparks+'</g>'+
          // Amoladora
          '<g style="animation:ttl-shake .09s linear infinite">'+
            '<rect x="38" y="122" width="100" height="34" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1.5"/>'+
            // Guarda
            '<path d="M108,122 Q145,122 145,152 L126,152 Q126,136 108,136 Z" fill="#374151" stroke="#4B5563" stroke-width="1"/>'+
            // Disco girando
            '<g style="transform-origin:128px 152px;animation:ttl-spin-rev .14s linear infinite">'+
              '<circle cx="128" cy="152" r="21" fill="#1F2937" stroke="#4B5563" stroke-width="1.5"/>'+
              '<circle cx="128" cy="152" r="21" fill="none" stroke="#6B7280" stroke-width="3.5" stroke-dasharray="5 3"/>'+
              '<circle cx="128" cy="152" r="7" fill="#111827" stroke="#374151" stroke-width="1"/>'+
            '</g>'+
            // Manija lateral
            '<rect x="28" y="129" width="14" height="20" rx="7" fill="#111827" stroke="#1E293B" stroke-width="1.5" transform="rotate(-12,35,139)"/>'+
            // Mango trasero
            '<rect x="133" y="126" width="30" height="16" rx="7" fill="#111827" stroke="#1E293B" stroke-width="1"/>'+
            // Cable
            '<path d="M163,134 Q175,134 176,129" stroke="#111827" stroke-width="5" fill="none" stroke-linecap="round"/>'+
            // Franja marca
            '<line x1="46" y1="136" x2="106" y2="136" stroke="#F59E0B" stroke-width="2" opacity=".55"/>'+
          '</g>'+
        '</svg>',
      update:function(p){
        var sp=document.getElementById('ttl-sparks'), g=document.getElementById('ttl-grind');
        if(sp) sp.style.opacity=p>5?'1':'0';
        if(g) g.setAttribute('width',Math.floor(p*0.52)+'');
      }
    };
  }

  /* ── TEMA 5: MARTILLO DE DEMOLICIÓN ────────────────────────────── */
  function _martillo(){
    return {
      html:
        '<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">'+
          // Pared ladrillo
          '<rect x="15" y="150" width="170" height="46" rx="2" fill="#44403C" stroke="#57534E" stroke-width="1.5"/>'+
          '<line x1="15" y1="164" x2="185" y2="164" stroke="#1C1917" stroke-width="1.5"/>'+
          '<line x1="15" y1="178" x2="185" y2="178" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="55" y1="150" x2="55" y2="164" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="105" y1="150" x2="105" y2="164" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="155" y1="150" x2="155" y2="164" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="30" y1="164" x2="30" y2="178" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="80" y1="164" x2="80" y2="178" stroke="#1C1917" stroke-width="1"/>'+
          '<line x1="130" y1="164" x2="130" y2="178" stroke="#1C1917" stroke-width="1"/>'+
          // Grietas
          '<g id="ttl-wcracks" style="opacity:0;transition:opacity .3s">'+
            '<line x1="100" y1="150" x2="75" y2="168" stroke="#1C1917" stroke-width="3" stroke-linecap="round"/>'+
            '<line x1="100" y1="150" x2="127" y2="170" stroke="#1C1917" stroke-width="2.5" stroke-linecap="round"/>'+
            '<line x1="75" y1="168" x2="55" y2="182" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
            '<line x1="127" y1="170" x2="150" y2="188" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
            '<line x1="100" y1="150" x2="100" y2="174" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>'+
          '</g>'+
          // Escombros
          '<g id="ttl-debris" style="opacity:0">'+
            '<rect style="animation:ttl-dust .44s ease-out infinite;--dx:15px" x="100" y="152" width="5" height="4" rx="1" fill="#78716C"/>'+
            '<rect style="animation:ttl-dust .44s ease-out infinite .11s;--dx:-13px" x="96" y="153" width="4" height="3" rx="1" fill="#57534E"/>'+
            '<circle style="animation:ttl-dust .44s ease-out infinite .06s;--dx:20px" cx="104" cy="153" r="2" fill="#6B6560"/>'+
            '<circle style="animation:ttl-dust .44s ease-out infinite .17s;--dx:-19px" cx="97" cy="151" r="1.5" fill="#78716C"/>'+
            '<circle style="animation:ttl-dust .44s ease-out infinite .23s;--dx:11px" cx="102" cy="155" r="1" fill="#44403C"/>'+
          '</g>'+
          // Martillo (balanceo)
          '<g style="transform-origin:68px 52px;animation:ttl-swing .44s ease-in-out infinite">'+
            // Mango
            '<rect x="65" y="48" width="9" height="115" rx="4.5" fill="#92400E" stroke="#B45309" stroke-width="1.5"/>'+
            // Cabeza
            '<rect x="36" y="38" width="66" height="34" rx="7" fill="#374151" stroke="#4B5563" stroke-width="2"/>'+
            '<rect x="38" y="40" width="62" height="9" rx="5" fill="#4B5563"/>'+
            '<rect x="38" y="50" width="11" height="20" rx="3" fill="#1F2937"/>'+
            '<rect x="89" y="50" width="11" height="20" rx="3" fill="#1F2937"/>'+
          '</g>'+
        '</svg>',
      update:function(p){
        var c=document.getElementById('ttl-wcracks'), d=document.getElementById('ttl-debris');
        if(c) c.style.opacity=Math.min(1,p/28)+'';
        if(d) d.style.opacity=p>14?'1':'0';
      }
    };
  }

  /* ── Animación de progreso ──────────────────────────────────────── */
  function _tick(){
    var speed = _done ? 2.8 : 0.22;
    var ceil  = _done ? 100 : 81;
    _pct = Math.min(ceil, _pct + speed);

    if(_bar)  _bar.style.width  = _pct + '%';
    if(_pctEl) _pctEl.textContent = Math.floor(_pct) + '%';

    // Mensaje según etapa
    var stage = STAGES[0];
    for(var i=0;i<STAGES.length;i++){ if(STAGES[i].p<=_pct) stage=STAGES[i]; }
    if(_msgEl) _msgEl.textContent = stage.msg;

    // Actualizar visual del tema (grietas, corte, etc.)
    if(_themeUpdate) _themeUpdate(_pct);

    if(_done && _pct >= 100){ _fadeOut(); return; }
    _raf = requestAnimationFrame(_tick);
  }

  function _fadeOut(){
    if(_raf){ cancelAnimationFrame(_raf); _raf=null; }
    if(!_ov) return;
    _ov.style.opacity = '0';
    setTimeout(function(){ if(_ov){ _ov.remove(); _ov=null; } }, 580);
  }

  /* ── Montar overlay ─────────────────────────────────────────────── */
  var THEMES = [_sierra, _demoledor, _taladro, _amoladora, _martillo];

  function _mount(){
    _css();
    var pick = THEMES[Math.floor(Math.random() * THEMES.length)]();
    _themeUpdate = pick.update || null;

    _ov = document.createElement('div');
    _ov.id = 'ttl-ov';
    _ov.innerHTML =
      '<div id="ttl-brand">'+
        '<div style="font-size:26px">🔧</div>'+
        '<div>'+
          '<div id="ttl-brand-name">TOTAL TOOLS</div>'+
          '<div id="ttl-brand-sub">Envíos & Herramientas</div>'+
        '</div>'+
      '</div>'+
      '<div id="ttl-anim">'+pick.html+'</div>'+
      '<div id="ttl-bar-wrap"><div id="ttl-bar"></div></div>'+
      '<div id="ttl-bottom">'+
        '<div id="ttl-msg">'+STAGES[0].msg+'</div>'+
        '<div id="ttl-pct">0%</div>'+
      '</div>';

    document.body.appendChild(_ov);
    _bar   = document.getElementById('ttl-bar');
    _pctEl = document.getElementById('ttl-pct');
    _msgEl = document.getElementById('ttl-msg');
    _pct=0; _done=false;
    _raf = requestAnimationFrame(_tick);
  }

  /* ── API pública ────────────────────────────────────────────────── */
  window.TTLoader = {
    done: function(){
      _done = true;
    }
  };

  // Montar inmediatamente (body ya existe porque el script va antes del </body>)
  if(document.body){
    _mount();
  } else {
    document.addEventListener('DOMContentLoaded', _mount);
  }

})();
