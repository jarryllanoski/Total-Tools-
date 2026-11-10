/**
 * panel/pantalla/whatsapp.js — abrir WhatsApp y el usuario de WhatsApp (@nombre)
 * =============================================================================
 * Fase 7 (11/11/2026): vivían al principio de datos/estado.js por herencia
 * (eran lo primero del script de index.html), pero son de PANTALLA: abren
 * WhatsApp y muestran avisos. Movidos sin cambiar una línea.
 * Script CLÁSICO: sus funciones son globales, igual que antes.
 */
// ★ El campo teléfono admite DOS formas: número peruano (lo de siempre) o
// usuario de WhatsApp (@nombre), que desde 2026 permite escribirle a alguien
// sin conocer su número. Este predicado es el ÚNICO dueño de esa distinción:
// cada sitio que usa el teléfono pregunta aquí en vez de repetir la regla.
// Reglas de WhatsApp: 3-35 caracteres entre letras, números, puntos y guiones bajos.
function esUsuarioWA(v){
  return /^@[A-Za-z0-9._]{3,35}$/.test(String(v==null?'':v).trim());
}
window.esUsuarioWA = esUsuarioWA;

// ★ WhatsApp centralizado: el prefijo de país vive en UN solo lugar.
// waLink(phone,msg) → devuelve la URL. waOpen(phone,msg) → la abre.
const WA_PREFIX = '51'; // código de país (Perú). Cambiar aquí si se necesita.
window.waLink = function(phone, msg){
  // Usuario (@nombre): WhatsApp NO publica un enlace de chat por usuario — su
  // formato click-to-chat sigue aceptando solo números. Devolvemos null a
  // propósito, para que quien llame decida qué hacer, en vez de fabricar una
  // URL inventada que al abrirse daría error y parecería un fallo de la app.
  if(esUsuarioWA(phone)) return null;
  var p = String(phone||'').replace(/[^0-9]/g,''); // limpiar espacios, guiones, etc.
  if(!p) return null;
  var url = 'https://wa.me/' + WA_PREFIX + p;
  if(msg) url += '?text=' + encodeURIComponent(msg);
  return url;
};
// Con usuario: SOLO se copia al portapapeles y se avisa. No se abre WhatsApp
// a propósito: no existe forma de llegar al chat de alguien solo con su
// usuario. Se probó abrir wa.me sin número y WhatsApp responde con un error
// ("no se encontró el número de teléfono … es demasiado corto"), que parece un
// fallo de esta app. Mejor un paso honesto que uno que aparenta funcionar.
// Si algún día WhatsApp publica el enlace por usuario, entra en waLink y ya.
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
