function esUsuarioWA(v){
  return /^@[A-Za-z0-9._]{3,35}$/.test(String(v==null?'':v).trim());
}
window.esUsuarioWA = esUsuarioWA;

const WA_PREFIX = '51';
window.waLink = function(phone, msg){
  if(esUsuarioWA(phone)) return null;
  var p = String(phone||'').replace(/[^0-9]/g,'');
  if(!p) return null;
  var url = 'https://wa.me/' + WA_PREFIX + p;
  if(msg) url += '?text=' + encodeURIComponent(msg);
  return url;
};
function _waUsuario(u){
  var usr = String(u||'').trim();
  var ok = function(){
    if(typeof toast==='function') toast('📋 '+usr+' copiado — búscalo en WhatsApp');
  };
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(usr).then(ok).catch(function(){ if(typeof toast==='function') toast('📋 '+usr); });
  } else {
    var t=document.createElement('textarea'); t.value=usr; t.style.cssText='position:fixed;top:-9999px';
    document.body.appendChild(t); t.select();
    try{ document.execCommand('copy'); ok(); }catch(e){ if(typeof toast==='function') toast('📋 '+usr); }
    t.remove();
  }
}
window._waUsuario = _waUsuario;
window.waOpen = function(phone, msg){
  if(esUsuarioWA(phone)){ _waUsuario(phone); return null; }
  var url = window.waLink(phone, msg);
  if(url) window.open(url, '_blank');
  return url;
};
