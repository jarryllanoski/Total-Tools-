function pintarEncabezado(){
  const cfg = (window.S && S.config) || {};
  const n = $('hdrName'), t = $('hdrPhone');
  if(n) n.textContent = cfg.name  || 'Mi Negocio';
  if(t) t.textContent = cfg.phone || '';
}
window.pintarEncabezado = pintarEncabezado;

window.addEventListener('tt:aviso', function(e){ if(e && e.detail) toast(e.detail); });
window.addEventListener('tt:nube-sincronizada', function(){
  if(window.pintarEncabezado) pintarEncabezado();
  render();
  renderChips();
  if(typeof _liberarPantallasNube === 'function') _liberarPantallasNube();
  toast('☁️ Datos sincronizados');
});
window.addEventListener('tt:nube-lista', function(){
  if(typeof _liberarPantallasNube === 'function') _liberarPantallasNube();
});
window._pantallaLista = true;
(window._avisosPendientes || []).splice(0).forEach(function(a){
  try{ window.dispatchEvent(new CustomEvent(a[0], {detail: a[1]})); }catch(_){}
});

function _arrancarNube(){
if(window._fbReady) {
  _initFirebase();
} else {
  setTimeout(_initFirebase, 500);
}
}
if(window._copiaEnIdb && window.CopiaLocal){
  CopiaLocal.leer().then(function(c){
    if(c && typeof c === 'object' && !window._nubeLista){
      Object.keys(c).forEach(function(k){ S[k] = c[k]; });
      S.labels = [...FIXED_LABELS, ..._sinRepetir((S.labels||[]).filter(function(l){ return !FIXED_LABELS.includes(l); }))];
      try{ pintarEncabezado(); render(); renderChips(); }catch(_){}
    }
  }).then(_arrancarNube, _arrancarNube);
} else {
  _arrancarNube();
}

window.addEventListener('tt:config-cambiada', function(){
  try{
    renderChips();
    if(typeof loadCfgUI==='function' && document.querySelector('#page-configurar.active')) loadCfgUI();
    if(typeof recRender==='function' && document.querySelector('#page-recursos.active')) recRender();
  }catch(_){}
});

pintarEncabezado();
renderChips();
render();
(function(){
  var _t=0;
  document.getElementById('hdrName').addEventListener('click',function(){
    var now=Date.now();
    if(now-_t<380 && window.DashBoard){ DashBoard.abrir(); _t=0; }
    else _t=now;
  });
})();
