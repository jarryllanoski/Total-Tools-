/**
 * panel/pedido-ui.js — acordeones del pedido, cajas de Shalom y medidas de la barra
 * =================================================================================
 * Fase 3 (10/11/2026): el panel en módulos. Antes vivía en index.html.
 * Script CLÁSICO a propósito: sus funciones y variables son globales, igual
 * que cuando estaban en un solo archivo — moverlas no cambió ni una llamada.
 * El orden de los <script> en index.html es el orden de ejecución.
 */
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

/* Lee los 4 campos de medidas y pinta el tipo de caja al instante — sin
   guardar nada, sin llamar a nadie. Usa la puerta única (Shalom.clasificarPaquete)
   para que el mismo cálculo sirva acá y en el registro en lote más adelante. */
function _pkgClasificar(){
  var el = document.getElementById('pkgTipoResultado'); if(!el) return;
  var caja = ($('fPkgCaja')||{value:''}).value;
  /* Los botones de caja: el elegido encendido, y las medidas solo con 📏. */
  document.querySelectorAll('.pkg-caja').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-caja') === caja && (caja !== '' || window._pkgMedir === true));
  });
  var med = document.getElementById('pkgMedidas');
  if(med) med.style.display = (caja === '' && window._pkgMedir === true) ? '' : 'none';
  if(typeof _pintarRegistroShalom === 'function') _pintarRegistroShalom();
  if(caja){
    el.style.background = 'rgba(46,160,67,.15)'; el.style.color = 'var(--green,#2ea043)';
    el.textContent = '📦 Paquete ' + caja; el.style.display = 'block';
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

/* Un toque elige la caja; 📏 abre las medidas. */
function pkgElegirCaja(t){
  var c = $('fPkgCaja'); if(!c) return;
  c.value = t || '';
  window._pkgMedir = !t;
  _pkgClasificar();
}

// Al abrir el form, cerrar el acordeón por defecto
var _origOpenForm = typeof openForm === 'function' ? openForm : null;

// Exponer la altura REAL de la barra superior (.hdr) como --hdr-h para que el
// encabezado de courier (position:sticky) se fije JUSTO debajo y no quede
// escondido tras la barra. Se recalcula ante cambios de tamaño (rotar, teclado,
// distintos teléfonos) → sin píxeles hardcodeados.
function _syncHdrHeight(){
  var h=document.querySelector('.hdr');
  if(h) document.documentElement.style.setProperty('--hdr-h', h.getBoundingClientRect().height+'px');
  /* Y la de las pestañas, que desde el 26/10/2026 también se quedan fijas.
     El encabezado de courier se pega debajo de LAS DOS: sin esta medida,
     las pestañas lo taparían al desplazarse. */
  var t=document.querySelector('.tabs');
  if(t) document.documentElement.style.setProperty('--tabs-h', t.getBoundingClientRect().height+'px');
}
window.addEventListener('load', function(){
  // Asegurar window.S sincronizado
  if(typeof S !== 'undefined') window.S = S;
  if(typeof Tracking !== 'undefined'){
    Tracking.init();
    render(); // re-render para mostrar bloques tracking
  }
  _syncHdrHeight();
  var h=document.querySelector('.hdr');
  if(h && window.ResizeObserver){ try{ new ResizeObserver(_syncHdrHeight).observe(h); }catch(e){} }
});
window.addEventListener('resize', _syncHdrHeight);
