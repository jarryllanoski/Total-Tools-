updateShareLink();

function toggleDocsAccordion(){
  var body = document.getElementById('docsBody');
  var arrow = document.getElementById('docsArrow');
  if(!body||!arrow) return;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
}

function togglePkgAccordion(){
  var body = document.getElementById('pkgBody');
  var arrow = document.getElementById('pkgArrow');
  if(!body||!arrow) return;
  var isOpen = body.classList.contains('open');
  body.classList.toggle('open', !isOpen);
  arrow.classList.toggle('open', !isOpen);
}

function _pkgClasificar(){
  var el = document.getElementById('pkgTipoResultado'); if(!el) return;
  var caja = ($('fPkgCaja')||{value:''}).value;
  document.querySelectorAll('.pkg-caja').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-caja') === caja && (caja !== '' || window._pkgMedir === true));
  });
  var med = document.getElementById('pkgMedidas');
  if(med) med.style.display = (caja === '' && window._pkgMedir === true) ? '' : 'none';
  if(typeof _pintarRegistroShalom === 'function') _pintarRegistroShalom();
  if(caja){
    el.style.background = 'rgba(46,160,67,.15)'; el.style.color = 'var(--green,#2ea043)';
    el.textContent = caja === 'SOBRE' ? '✉️ Sobre (documentos, A4)' : '📦 Paquete ' + caja; el.style.display = 'block';
    return;
  }
  if(window._pkgMedir !== true){ el.style.display='none'; el.textContent=''; return; }
  var l = ($('fPkgLargo')||{}).value, a = ($('fPkgAncho')||{}).value,
      h = ($('fPkgAlto')||{}).value,  p = ($('fPkgPeso')||{}).value;
  var r = (window.Shalom && Shalom.clasificarPaquete) ? Shalom.clasificarPaquete(l,a,h,p) : null;
  if(!r){ el.style.display='none'; el.textContent=''; return; }
  var esOtra = r.tipo === 'OTRA';
  el.style.background = esOtra ? 'rgba(210,153,34,.15)' : 'rgba(46,160,67,.15)';
  el.style.color      = esOtra ? '#d29922' : 'var(--green,#2ea043)';
  el.textContent = (esOtra ? '⚠️ ' : '📦 ') + r.etiqueta;
  el.style.display = 'block';
}

function pkgElegirCaja(t){
  var c = $('fPkgCaja'); if(!c) return;
  c.value = t || '';
  window._pkgMedir = !t;
  _pkgClasificar();
}

var _origOpenForm = typeof openForm === 'function' ? openForm : null;

function _syncHdrHeight(){
  var h=document.querySelector('.hdr');
  if(h) document.documentElement.style.setProperty('--hdr-h', h.getBoundingClientRect().height+'px');
  var t=document.querySelector('.tabs');
  if(t) document.documentElement.style.setProperty('--tabs-h', t.getBoundingClientRect().height+'px');
}
window.addEventListener('load', function(){
  if(typeof S !== 'undefined') window.S = S;
  if(typeof Tracking !== 'undefined'){
    Tracking.init();
    render();
  }
  _syncHdrHeight();
  var h=document.querySelector('.hdr');
  if(h && window.ResizeObserver){ try{ new ResizeObserver(_syncHdrHeight).observe(h); }catch(e){} }
});
window.addEventListener('resize', _syncHdrHeight);
