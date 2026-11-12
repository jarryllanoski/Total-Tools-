# Uso: npm i lucide-static@0.460.0 && python3 herramientas/generar-iconos.py node_modules/lucide-static/icons panel/pantalla/iconos.js
import re,json,os,sys
L=sys.argv[1]; OUT=sys.argv[2]
AM='#d29922'; VE='#3fb950'; RO='#f85149'; AZ='#388bfd'
M={'⚠':('triangle-alert',AM),'✅':('circle-check',VE),'📦':('package',),'🚚':('truck',),'⏳':('hourglass',),'🧾':('receipt',),
'🔒':('lock',),'🗑':('trash-2',),'🔗':('link',),'📋':('clipboard-list',),'💬':('message-circle',),'🏬':('store',),'✏':('pencil',),
'⚙':('settings',),'📷':('camera',),'📖':('book-open',),'🏭':('factory',),'💾':('save',),'📄':('file-text',),'🎤':('mic',),
'📅':('calendar',),'🏷':('tag',),'📞':('phone',),'🖨':('printer',),'🔄':('refresh-cw',),'💰':('coins',),'🏢':('building-2',),
'🔍':('search',),'🔎':('search',),'➕':('plus',),'📊':('file-spreadsheet',),'📤':('send',),'🔑':('key-round',),'📝':('notebook-pen',),
'🔌':('plug',),'📍':('map-pin',),'☑':('square-check',),'📎':('paperclip',),'🔔':('bell',),'🕐':('clock',),'❌':('circle-x',RO),
'🧪':('flask-conical',),'🛡':('shield',),'⏰':('alarm-clock',),'🚪':('door-open',),'📱':('smartphone',),'📲':('smartphone',),
'🖼':('image',),'👁':('eye',),'⬇':('arrow-down',),'⬆':('arrow-up',),'📥':('inbox',),'⏸':('pause',),'📚':('book-open',),
'📁':('folder',),'📂':('folder-open',),'⚡':('zap',),'🏪':('store',),'🚌':('bus',),'🚐':('bus',),'✉':('mail',),'🛵':('bike',),
'📭':('mailbox',),'📬':('mailbox',),'🪪':('id-card',),'🔁':('repeat',),'📡':('radio-tower',),'☁':('cloud',),'✨':('sparkles',),
'🔐':('lock-keyhole',),'🔤':('type',),'⏱':('timer',),'💡':('lightbulb',),'🏠':('house',),'🏁':('flag',),'🚫':('ban',RO),
'⛔':('ban',RO),'🎬':('clapperboard',),'📽':('film',),'📏':('ruler',),'📴':('wifi-off',),'👋':('hand',),'🆕':('badge-plus',),
'🦁':('shield-alert',),'🔢':('hash',),'🔧':('wrench',),'🎲':('dices',),'♻':('recycle',),'🙏':('heart-handshake',),'📕':('book',),
'👤':('user',),'👥':('users',),'🌟':('star',),'⭐':('star',),'⏩':('fast-forward',),'👇':('arrow-down',),'👍':('thumbs-up',),
'🎉':('party-popper',),'🗣':('megaphone',),'❓':('circle-help',),'🙈':('eye-off',),'🏙':('building',),'▶':('play',),
'🔴':('punto',RO),'🟡':('punto',AM),'🔵':('punto',AZ),'🟢':('punto',VE),'🟠':('punto','#f0883e'),'🟣':('punto','#a371f7'),'⚪':('punto','#e6edf3'),'⚫':('punto','#6e7681'),'📌':('pin',),'🗺':('map',),'🛒':('shopping-cart',),'👆':('pointer',),'🙌':('hand-heart',),'🛍':('shopping-bag',),'🐢':('turtle',),'🏍':('bike',),'🔥':('flame',),'👊':('hand-metal',),'💪':('biceps-flexed',),'💳':('credit-card',)}
D={}
for e,v in M.items():
    n=v[0]
    if n in D: continue
    if n=='punto': D[n]='<circle cx="12" cy="12" r="7" fill="currentColor" stroke="none"/>'; continue
    t=open(os.path.join(L,n+'.svg')).read()
    body=re.search(r'>\s*([\s\S]*)</svg>',t.split('<svg',1)[1]).group(1)
    D[n]=re.sub(r'\s*\n\s*','',body).replace(' />','/>')
claves=sorted(M,key=len,reverse=True)
js=['/**\n * panel/pantalla/iconos.js — iconos de Lucide (ISC, https://lucide.dev) en lugar de emojis.\n */','(function(){',"  'use strict';",
'  var D = '+json.dumps(D,ensure_ascii=False,indent=0).replace('\n','\n    ')+';',
'  var M = '+json.dumps({k:list(v) for k,v in M.items()},ensure_ascii=False,separators=(',',':'))+';',
"  var RE = new RegExp('(' + "+json.dumps(claves,ensure_ascii=False)+".join('|') + ')\\uFE0F?', 'g');",
r'''  var SALTAR = 'script,style,textarea,input,title,noscript,svg,[contenteditable],[data-sin-iconos]';
  var molde = {};

  function estilos(){
    if(document.getElementById('iconosCss')) return;
    var css = '';
    Object.keys(D).forEach(function(n){
      var svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" + D[n].replace(/"/g, "'") + '</svg>';
      var url = 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
      css += '.ic-' + n + '{-webkit-mask-image:' + url + ';mask-image:' + url + '}';
    });
    var st = document.createElement('style');
    st.id = 'iconosCss';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function icono(e){
    var k = e.replace('️', '');
    if(!molde[k]){
      var m = M[k], i = document.createElement('i');
      i.className = 'ic ic-' + m[0];
      i.setAttribute('aria-hidden', 'true');
      i.setAttribute('data-e', k);
      if(m[1]) i.style.color = m[1];
      molde[k] = i;
    }
    return molde[k].cloneNode(false);
  }

  function sinEmojis(t){ return String(t).replace(RE, '').replace(/^\s+/, '').replace(/\s{2,}/g, ' '); }

  function texto(n){
    var v = n.nodeValue;
    RE.lastIndex = 0;
    if(!v || !RE.test(v)) return;
    var p = n.parentNode;
    if(!p || p.nodeType !== 1 || p.closest(SALTAR)) return;
    if(p.nodeName === 'OPTION'){ n.nodeValue = sinEmojis(v); return; }
    var f = document.createDocumentFragment(), i = 0, m;
    RE.lastIndex = 0;
    while((m = RE.exec(v))){
      if(m.index > i) f.appendChild(document.createTextNode(v.slice(i, m.index)));
      f.appendChild(icono(m[1]));
      i = m.index + m[0].length;
    }
    if(i < v.length) f.appendChild(document.createTextNode(v.slice(i)));
    p.replaceChild(f, n);
  }

  function atributos(el){
    for(var a = 0; a < 3; a++){
      var k = ['placeholder', 'title', 'aria-label'][a], v = el.getAttribute(k);
      RE.lastIndex = 0;
      if(v && RE.test(v)) el.setAttribute(k, sinEmojis(v));
    }
  }

  function procesar(raiz){
    if(!raiz) return;
    if(raiz.nodeType === 3){ texto(raiz); return; }
    if(raiz.nodeType !== 1 || raiz.closest(SALTAR)) return;
    atributos(raiz);
    if(!raiz.firstChild) return;
    var hay = raiz.querySelectorAll('[placeholder],[title],[aria-label]');
    for(var j = 0; j < hay.length; j++) atributos(hay[j]);
    RE.lastIndex = 0;
    if(!RE.test(raiz.textContent)) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT), lista = [], n;
    while((n = w.nextNode())) lista.push(n);
    for(var i = 0; i < lista.length; i++) texto(lista[i]);
  }

  function textoOriginal(el){
    if(!el) return '';
    var c = el.cloneNode(true);
    c.querySelectorAll('[data-e]').forEach(function(s){ s.replaceWith(document.createTextNode(s.getAttribute('data-e'))); });
    return c.textContent;
  }

  ['alert', 'confirm', 'prompt'].forEach(function(k){
    var f = window[k];
    if(typeof f !== 'function') return;
    window[k] = function(msg){
      var a = Array.prototype.slice.call(arguments);
      if(typeof msg === 'string') a[0] = sinEmojis(msg);
      return f.apply(window, a);
    };
  });

  estilos();
  procesar(document.body);
  new MutationObserver(function(lista){
    for(var i = 0; i < lista.length; i++){
      var r = lista[i];
      if(r.type === 'characterData'){ texto(r.target); continue; }
      for(var j = 0; j < r.addedNodes.length; j++) procesar(r.addedNodes[j]);
    }
  }).observe(document.body, {childList: true, subtree: true, characterData: true});

  window.Iconos = {procesar: procesar, textoOriginal: textoOriginal, sinEmojis: sinEmojis};
})();''']
open(OUT,'w').write('\n'.join(js)+'\n')
print(len(D),'iconos', os.path.getsize(OUT),'bytes')
